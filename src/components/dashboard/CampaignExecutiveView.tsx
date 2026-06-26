import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  Users, 
  MessageSquare, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowUpRight, 
  Zap, 
  Calendar, 
  User,
  Hash,
  Phone,
  ArrowRight,
  Clock,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Target,
  Filter,
  X,
  PanelRightOpen,
  SmilePlus,
  MessagesSquare,
  TimerReset,
  UserRound,
  Eye,
  TrendingUp,
  FileText,
  Building2,
  Check,
  ArrowLeft,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign, Agent, Message } from '@/lib/types';
import { WhatsAppView } from '@/components/conversations/WhatsAppView';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';




interface CampaignStats {
    total_contacts: number;
    import_errors: number;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    response_count: number;
    conversion_count: number;
    failed_count: number;
    conversion_rate: number;
    total_messages: number;
    conversion_button_count?: number;
    conversion_chat_count?: number;
}

interface LeadResult {
    id: string;
    cnpj: string;
    whatsapp: string;
    name: string;
    status: string;
    errorMessage?: string | null;
    contactName?: string;
    establishmentName?: string;
    conversationId?: string | null;
    responseDetected?: boolean;
    isConverted?: boolean;
    sentAt?: string | null;
    clickedButton?: boolean;
    campaignId?: string | null;
    createdAt?: string | null;
}

interface ConversationAnalytics {
    conversationId: string;
    startedAt: string;
    lastInteractionAt: string;
    participants: {
        contactName: string;
        contactPhone: string;
        agentName: string;
    };
    durationSeconds: number;
    messageCount: number;
    inboundCount: number;
    outboundCount: number;
    predominantSentiment: string;
    topics: string[];
    auditTags: string[];
    summary: string | null;
    score: number | null;
    lastMessagePreview: string | null;
    criteriaResults: Record<string, number | string>;
    evaluationCount: number;
    latestAuditAt: string | null;
    aiModel: string | null;
    wasConverted: boolean;
    responseDetected: boolean;
    queueStatus: string | null;
    sentAt: string | null;
    campaignId: string | null;
    channel: string | null;
    conversationStatus: string | null;
    contactLifecycleStatus: string | null;
    contactStatus: string | null;
    contactTags: string[];
}

export function CampaignExecutiveView() {
  const { currentTenant } = useApp();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentTenant) {
      loadInitialData();
      return;
    }

    setCampaigns([]);
    setAgents([]);
    setIsLoading(false);
  }, [currentTenant]);

  const loadInitialData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const [campaignsData, agentsData] = await Promise.all([
        api.getCampaigns(currentTenant.id, false),
        api.getAgents(currentTenant.id)
      ]);

      // Optimize: Fetch all campaign stats in a single query if possible.
      let statsByCampaignId = new Map<string, CampaignStats>();
      let bulkSuccess = false;

      try {
        const bulkStats = await api.getAllCampaignsStats(currentTenant.id);
        if (bulkStats && Object.keys(bulkStats).length > 0) {
          statsByCampaignId = new Map(Object.entries(bulkStats));
          bulkSuccess = true;
        }
      } catch (bulkError) {
        console.warn("Bulk campaign stats RPC failed or is not deployed. Falling back to individual requests.", bulkError);
      }

      // Fallback: If bulk stats lookup failed or returned no data, execute individual stats queries in parallel.
      if (!bulkSuccess) {
        const statsResults = await Promise.allSettled(
          campaignsData.map(async (campaign) => ({
            campaignId: campaign.id,
            stats: await api.getCampaignStats(campaign.id, currentTenant.id)
          }))
        );

        statsByCampaignId = new Map(
          statsResults
            .filter((result): result is PromiseFulfilledResult<{ campaignId: string; stats: CampaignStats }> => result.status === 'fulfilled')
            .map((result) => [result.value.campaignId, result.value.stats])
        );
      }

      const campaignsWithLiveStats = campaignsData.map((campaign) => {
        const liveStats = statsByCampaignId.get(campaign.id);
        console.log(`Render Campaign ${campaign.id}:`, liveStats);

        if (!liveStats) {
          return campaign;
        }

        return {
          ...campaign,
          totalContacts: liveStats.total_contacts,
          sentCount: liveStats.sent_count,
          deliveredCount: liveStats.delivered_count || 0,
          readCount: liveStats.read_count || 0,
          responseCount: liveStats.response_count,
          totalMessages: liveStats.total_messages || 0,
          conversionCount: liveStats.conversion_count,
          conversionRate: liveStats.conversion_rate,
          importErrorCount: liveStats.import_errors,
          conversionButtonCount: liveStats.conversion_button_count || 0,
          conversionChatCount: liveStats.conversion_chat_count || 0
        };
      });

      setCampaigns(campaignsWithLiveStats);
      setAgents(agentsData);
    } catch (error) {
      console.error("Error loading data for campaign executive:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !selectedCampaignId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E5003A]"></div>
        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Orquestrando Campanhas...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700 pb-20">
        {!selectedCampaignId ? (
            <CampaignSummaryView 
                campaigns={campaigns} 
                agents={agents} 
                onSelectCampaign={setSelectedCampaignId} 
            />
        ) : (
            <CampaignDetailView 
                campaignId={selectedCampaignId} 
                campaigns={campaigns}
                agents={agents}
                onSelect={setSelectedCampaignId}
                onBack={() => setSelectedCampaignId(null)} 
            />
        )}
    </div>
  );
}

// --- SUMMARY VIEW ---

interface CampaignSummaryViewProps {
  campaigns: Campaign[];
  agents: Agent[];
  onSelectCampaign: (id: string) => void;
}

function CampaignSummaryView({ campaigns, agents, onSelectCampaign }: CampaignSummaryViewProps) {
  const getAgentName = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.name || 'Agente';
  };

  const totalCampaigns = campaigns.length;
  const totalValidLeads = campaigns.reduce((sum, campaign) => sum + (campaign.totalContacts || 0), 0);
  const totalLinksSent = campaigns.reduce((sum, campaign) => sum + (campaign.conversionCount || 0), 0);
  const totalDelivered = campaigns.reduce((sum, campaign) => sum + (campaign.deliveredCount || 0), 0);
  const overallConversionRate = totalDelivered > 0 ? (totalLinksSent / totalDelivered) * 100 : 0;

  const calculateConversion = (campaign: Campaign) => {
    if (!campaign.deliveredCount || campaign.deliveredCount === 0) return 0;
    return ((campaign.conversionCount || 0) / campaign.deliveredCount) * 100;
  };

  const getConversionColor = (value: number) => {
    if (value <= 5) return 'bg-rose-500';
    if (value < 10) return 'bg-amber-400';
    return 'bg-emerald-500';
  };

  const getConversionTextColor = (value: number) => {
    if (value <= 5) return 'text-rose-600';
    if (value < 10) return 'text-amber-500';
    return 'text-emerald-600';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border/50 p-8 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-[#E5003A]" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <Target className="w-6 h-6 text-[#E5003A]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visão Geral</span>
              <span className="text-2xl font-black text-slate-900 italic tracking-tight">Painel Principal de Campanhas</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:min-w-[50rem]">
            <BigNumberCard label="Total de Campanhas" value={totalCampaigns.toLocaleString('pt-BR')} />
            <BigNumberCard label="Válidos" value={totalValidLeads.toLocaleString('pt-BR')} />
            <BigNumberCard label="Entregues" value={totalDelivered.toLocaleString('pt-BR')} />
            <BigNumberCard label="Links Enviados" value={totalLinksSent.toLocaleString('pt-BR')} />
            <BigNumberCard
              label="% Conversão"
              value={`${overallConversionRate.toFixed(1)}%`}
              accentClass={getConversionTextColor(overallConversionRate)}
            />
          </div>

        </div>
      </div>

      <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest first:pl-8">Campanha</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Início</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Carregados</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Válidos</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Enviados</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Entregues</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Lidas</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Interagiram</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Links Enviados</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">% Conversão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-8 py-20 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                    Nenhuma campanha estratégica encontrada
                  </td>
                </tr>
              ) : (
                campaigns.map((c, idx) => (
                  <motion.tr 
                    key={c.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => onSelectCampaign(c.id)}
                    className="hover:bg-slate-50/80 transition-all group cursor-pointer border-l-4 border-l-transparent hover:border-l-[#E5003A]"
                  >
                    <td className="px-6 py-5 first:pl-8">
                      <div className="flex flex-col max-w-[180px]">
                        <span className="text-sm font-bold text-slate-900 group-hover:text-[#E5003A] transition-colors">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          c.status?.toLowerCase() === 'active' ? "bg-emerald-500" : 
                          c.status?.toLowerCase() === 'paused' ? "bg-amber-500" :
                          c.status?.toLowerCase() === 'completed' ? "bg-blue-500" : "bg-slate-300"
                        )} />
                        <span className="text-xs font-bold text-slate-600">
                          {c.status?.toLowerCase() === 'active' ? 'Ativa' : 
                           c.status?.toLowerCase() === 'paused' ? 'Pausada' :
                           c.status?.toLowerCase() === 'completed' ? 'Finalizada' : 'Inativa'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-xs font-mono text-slate-500 text-center">
                      {format(new Date(c.startDate), "dd/MMM", { locale: ptBR }).toUpperCase()}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-500 text-center">
                      {((c.totalContacts || 0) + (c.importErrorCount || 0)).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-900 text-center">
                      {(c.totalContacts || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-900 text-center">
                      {(c.sentCount || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-900 text-center">
                      {(c.deliveredCount || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-emerald-600 text-center">
                      {(c.readCount || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-emerald-600 text-center">
                      {(c.responseCount || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-indigo-600 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Zap className="w-3 h-3" />
                        {(c.conversionCount || 0).toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-4 py-5 text-center">
                      {(() => {
                        const conversion = calculateConversion(c);
                        return (
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={cn("text-sm font-black italic", getConversionTextColor(conversion))}>
                          {conversion.toFixed(1)}%
                        </span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full", getConversionColor(conversion))}
                            style={{ width: `${Math.min(conversion, 100)}%` }}
                          />
                        </div>
                      </div>
                        );
                      })()}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- DETAIL VIEW ---

interface CampaignDetailViewProps {
  campaignId: string;
  campaigns: Campaign[];
  agents: Agent[];
  onSelect: (id: string) => void;
  onBack: () => void;
}

function CampaignDetailView({ campaignId, campaigns, agents, onSelect, onBack }: CampaignDetailViewProps) {
  const { currentTenant } = useApp();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadResult | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[] | null>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: 'cnpj' | 'whatsapp' | 'name' | 'status' | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });
  const analyticsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDashboardData();
  }, [campaignId, currentTenant]);

  const loadDashboardData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const targetCampaignId = campaignId === 'all_consolidated' ? undefined : campaignId;
      const statsData = await api.getCampaignStats(targetCampaignId as any, currentTenant.id);

      const enrichedContacts = await api.getEnrichedOutboundQueue(currentTenant.id, targetCampaignId as any);
      const mappedLeads = enrichedContacts.map(c => ({
          id: c.id,
          cnpj: c.cnpj || '-',
          whatsapp: c.contactPhone,
          name: c.establishmentName || c.contactName || 'Sem Nome',
          contactName: c.contactName || 'Sem Nome',
          establishmentName: c.establishmentName || null,
          conversationId: c.conversationId || null,
          responseDetected: Boolean(c.responseDetected || c.response_detected),
          isConverted: Boolean(c.isConverted || c.is_converted), // Suporte a camelCase e snake_case
          sentAt: c.sentAt || c.sent_at || null,
          clickedButton: Boolean(c.clickedButton || c.clicked_button),
          createdAt: c.createdAt || null,
          campaignId: c.campaignId || null,
          status: (() => {
            const s = String(c.status || '').toLowerCase();
            
            // REGRA DE OURO (V3.1): Hierarquia de status para refletir EXATAMENTE a tela
            // 1. Conversão é o status máximo.
            if (c.is_converted || c.isConverted || ['converted', 'convertida'].includes(s)) return 'Convertida';
            
            // 2. Respondeu
            if (c.response_detected || c.responseDetected || ['responded', 'respondida'].includes(s)) {
              return 'Respondida';
            }
            
            // 3. Status base da mensagem
            if (['read', 'lida'].includes(s)) return 'Lida';
            
            // Agrupar "Enviada" e "Entregue" como "Entregue" para bater com a tela
            if (['delivered', 'entregue', 'sent', 'enviada'].includes(s)) return 'Entregue';
            
            // Agrupar falhas e rejeições como "Não Entregue" para bater com a tela (Total - Entregues)
            if (['failed', 'erro', 'not_delivered', 'rejected', 'rejeitada'].includes(s)) return 'Não Entregue';
            
            if (['pending', 'pendente'].includes(s)) return 'Pendente';
            if (['processing', 'processando'].includes(s)) return 'Processando';
            
            return c.status || 'Pendente';
          })(),
          errorMessage: c.error_message || null
      }));

      const computed = {
        total_contacts: mappedLeads.length,
        delivered_count: mappedLeads.filter(l => ['Enviada', 'Entregue', 'Lida', 'Respondida', 'Convertida'].includes(l.status)).length,
        read_count: mappedLeads.filter(l => ['Lida', 'Respondida', 'Convertida'].includes(l.status)).length,
        response_count: mappedLeads.filter(l => ['Respondida', 'Convertida'].includes(l.status)).length,
        conversion_count: mappedLeads.filter(l => l.status === 'Convertida').length,
        failed_count: mappedLeads.filter(l => ['Erro', 'Não Entregue', 'Rejeitada'].includes(l.status)).length,
        sent_count: mappedLeads.filter(l => ['Enviada', 'Entregue', 'Lida', 'Respondida', 'Convertida', 'Erro', 'Não Entregue', 'Rejeitada'].includes(l.status)).length,
        import_errors: Number(statsData?.import_errors || 0)
      };

      setStats({
        total_contacts: statsData?.total_contacts ?? computed.total_contacts,
        sent_count: statsData?.sent_count ?? computed.sent_count,
        delivered_count: statsData?.delivered_count ?? computed.delivered_count,
        read_count: statsData?.read_count ?? computed.read_count,
        response_count: statsData?.response_count ?? computed.response_count,
        conversion_count: statsData?.conversion_count ?? computed.conversion_count,
        failed_count: statsData?.failed_count ?? computed.failed_count,
        import_errors: statsData?.import_errors ?? computed.import_errors,
        conversion_rate: statsData?.conversion_rate ?? 0,
        success_criteria_used: statsData?.success_criteria_used ?? [],
        conversion_button_count: statsData?.conversion_button_count ?? 0,
        conversion_chat_count: statsData?.conversion_chat_count ?? 0
      } as any);
      setLeads(mappedLeads);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedLead || !currentTenant) return;

    const cacheKey = `${selectedLead.id}:${selectedLead.whatsapp}`;
    if (cacheKey in messagesCache) {
      setMessages(messagesCache[cacheKey]);
      return;
    }

    let active = true;
    setIsMessagesLoading(true);

    const fetchMessages = async () => {
      try {
        let convId = selectedLead.conversationId;
        console.log('DEBUG fetchMessages start:', { selectedLeadId: selectedLead.id, whatsapp: selectedLead.whatsapp, initialConvId: convId, campaignId: selectedLead.campaignId });
        
        if (!convId && selectedLead.whatsapp) {
          // Fallback to find conversation by phone if not explicitly linked in queue
          const analytics = await api.getConversationAnalytics(currentTenant.id, {
            phone: selectedLead.whatsapp,
            // Pass null for campaignId to broad search if exact campaign is missing in conversations table
            campaignId: null, 
            leadId: selectedLead.id
          });
          console.log('DEBUG fetchMessages analytics fallback:', analytics);
          if (analytics?.conversationId) {
            convId = analytics.conversationId;
          }
        }

        console.log('DEBUG fetchMessages final convId:', convId);

        if (!active) return;

        if (convId) {
          const msgs = await api.getConversationMessages(convId);
          console.log('DEBUG fetchMessages msgs count:', msgs?.length);
          if (!active) return;
          setMessages(msgs);
          setMessagesCache(prev => ({ ...prev, [cacheKey]: msgs }));
        } else {
          setMessages([]);
        }
      } catch (error) {
        console.error('Error loading conversation messages:', error);
        if (active) setMessages([]);
      } finally {
        if (active) setIsMessagesLoading(false);
      }
    };

    fetchMessages();

    return () => {
      active = false;
    };
  }, [selectedLead, currentTenant, messagesCache]);

  useEffect(() => {
    if (!selectedLead) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedLead(null);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (analyticsPanelRef.current?.contains(target)) return;
      if (target.closest('[data-analytics-trigger="true"]')) return;

      setSelectedLead(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [selectedLead]);

  const selectedCampaign = campaigns.find(c => c.id === campaignId);
  const selectedAgent = agents.find(agent => agent.id === selectedCampaign?.agentId);

  console.log("DEBUG RENDER CampaignDetailView STATS:", stats);

  const statusOptions = useMemo(() => {
    const options = Array.from(new Set(leads.map((lead) => lead.status)));
    
    // Força inclusão de 'Convertida' se houver leads convertidos (mesmo que com status visual 'Lida')
    if (leads.some(l => l.isConverted) && !options.includes('Convertida')) {
      options.push('Convertida');
    }
    
    return options.sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (selectedStatuses.length === 0) return leads;
    return leads.filter((lead) => {
      // Se o filtro 'Convertida' estiver ativo, incluímos leads com status visual 'Convertida'
      // OU leads que tenham a flag real de conversão isConverted como true.
      if (selectedStatuses.includes('Convertida') && lead.isConverted) {
        return true;
      }
      return selectedStatuses.includes(lead.status);
    });
  }, [leads, selectedStatuses]);

  const sortedLeads = useMemo(() => {
    const items = [...filteredLeads];
    if (sortConfig.key) {
      items.sort((a, b) => {
        const aValue = String(a[sortConfig.key!] || '').toLowerCase();
        const bValue = String(b[sortConfig.key!] || '').toLowerCase();
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [filteredLeads, sortConfig]);

  const toggleSort = (key: 'cnpj' | 'whatsapp' | 'name' | 'status') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-20 ml-1 inline" />;
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-3 h-3 text-slate-900 ml-1 inline" /> 
      : <ChevronDown className="w-3 h-3 text-slate-900 ml-1 inline" />;
  };
  const handleExportExcel = () => {
    // Preparar os dados
    const exportData = leads.map(lead => {
      // Regra de comportamento
      let comportamento = '';
      if (lead.isConverted) {
        if (lead.clickedButton) {
          comportamento = 'Botão Inicial';
        } else {
          comportamento = 'Interagiu via Chat';
        }
      }

      // Formatar data
      let dataDisparo = '';
      if (lead.sentAt) {
        dataDisparo = new Date(lead.sentAt).toLocaleString('pt-BR');
      }

      return {
        'CNPJ': lead.cnpj || '-',
        'Telefone': lead.whatsapp || '-',
        'Data Disparo': dataDisparo,
        'Último Status': lead.status || '-',
        'Comportamento': comportamento
      };
    });

    // Criar planilha e workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');

    // Ajustar largura das colunas
    const wscols = [
      { wch: 20 }, // CNPJ
      { wch: 15 }, // Telefone
      { wch: 20 }, // Data Disparo
      { wch: 15 }, // Status
      { wch: 20 }, // Comportamento
    ];
    worksheet['!cols'] = wscols;

    // Gerar e baixar
    const currentCampaign = campaigns.find(c => c.id === campaignId);
    const fileName = `exportacao_${currentCampaign?.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'campanha'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
    );
  };

  const clearStatusFilters = () => setSelectedStatuses([]);

  const openAnalytics = (lead: LeadResult) => {
    setSelectedLead(lead);
    setMessages(null);
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Nao informado';
    return format(new Date(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatDuration = (seconds?: number | null) => {
    const totalSeconds = Math.max(seconds || 0, 0);
    if (totalSeconds === 0) return 'Nao informado';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins === 0) return `${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours === 0) return `${mins}min`;
    return `${hours}h ${remainingMins}min`;
  };

  const formatMetricLabel = (key: string) =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const renderStatusBadge = (status?: string | null, errorMessage?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    
    // Status 'Lida' agora tem sua própria identidade visual (Azul Sky)
    if (normalized === 'lida' || normalized === 'read') {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-sky-50 text-sky-600 border border-sky-100">
            <Eye className="w-3 h-3" />
            Lida
          </span>
        </div>
      );
    }

    const isSuccess = ['enviada', 'concluída', 'concluida', 'convertida', 'entregue'].includes(normalized);
    const isError = ['erro', 'não entregue', 'não_entregue', 'rejeitada', 'failed', 'not_delivered', 'rejected'].includes(normalized);
    const isProcessing = normalized === 'processando';

    const classes = isSuccess
      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
      : isError
        ? 'bg-rose-50 text-rose-600 border border-rose-100 shadow-[0_0_10px_rgba(229,0,58,0.1)]'
        : 'bg-amber-50 text-amber-600 border border-amber-100';
    
    const Icon = isSuccess
      ? CheckCircle2
      : isError
        ? AlertTriangle
        : Clock;

    return (
      <div className="flex flex-col items-end gap-1">
        <span className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
          classes
        )}>
          <Icon className="w-3 h-3" />
          {status}
        </span>
      </div>
    );
  };

  const failureReasonStats = useMemo(() => {
    const stats: Record<string, number> = {};
    
    leads.forEach(lead => {
      const statusLower = lead.status.toLowerCase();
      
      // Consideramos "falha ou pendência" tudo que não foi entregue, lido ou convertido
      const successStatuses = ['entregue', 'lida', 'respondida', 'convertida', 'delivered', 'read', 'responded', 'converted'];
      
      if (!successStatuses.includes(statusLower)) {
        let reason = lead.errorMessage;
        
        if (!reason) {
          if (statusLower === 'enviada') {
            reason = 'Em trânsito / Aguardando recebimento';
          } else if (statusLower === 'erro') {
            reason = 'Erro sem mensagem detalhada (Zenvia)';
          } else if (statusLower === 'pendente') {
            reason = 'Pendente na fila de processamento';
          } else {
            reason = `Status: ${lead.status}`;
          }
        }
        
        stats[reason] = (stats[reason] || 0) + 1;
      }
    });

    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // Aumentado para mostrar mais detalhes
  }, [leads]);

  if (isLoading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E5003A]"></div>
        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Compilando Inteligência...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="w-full">
        <div className="bg-white border border-border/50 p-4 lg:p-5 rounded-2xl shadow-sm relative overflow-hidden w-full">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#E5003A]" />
          <div className="relative z-10 flex flex-col gap-5">
            {/* LINHA 1: PRIORIDADE TOTAL AO NOME */}
            <div className="w-full">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1 px-1">Campanha em Execução</span>
              <h1 className="text-2xl lg:text-3xl font-black text-slate-900 italic tracking-tight leading-tight px-1">
                {campaignId === 'all_consolidated' ? 'Consolidado Geral' : selectedCampaign?.name}
              </h1>
            </div>

            {/* LINHA 2: METADADOS E AÇÕES ORGANIZADOS */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-t border-slate-100 pt-4 px-1">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Início</span>
                    <span className="text-sm font-bold text-slate-700 font-mono">
                      {campaignId === 'all_consolidated' ? 'Todos os Períodos' : selectedCampaign ? format(new Date(selectedCampaign.startDate), "dd/MM/yyyy") : '-'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-l border-slate-100 pl-8 hidden md:flex">
                  <Target className="w-4 h-4 text-[#E5003A]" />
                  <div className="flex flex-col max-w-[320px]">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Meta / Objetivo</span>
                    <span className="text-sm font-bold text-slate-700 truncate">
                      {campaignId === 'all_consolidated' ? 'Visão consolidada' : selectedCampaign?.description || 'Não informado'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-l border-slate-100 pl-8 hidden xl:flex">
                  <User className="w-4 h-4 text-slate-500" />
                  <div className="flex flex-col max-w-[240px]">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Agente</span>
                    <span className="text-sm font-bold text-slate-700 truncate">
                      {campaignId === 'all_consolidated' ? 'Múltiplos agentes' : selectedAgent?.name || 'Não informado'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 lg:ml-auto">
                <div className="flex items-center gap-3">
                  <select 
                    value={campaignId === 'all_consolidated' ? 'all' : campaignId}
                    onChange={(e) => {
                      if (e.target.value === 'all') {
                        onSelect('all_consolidated' as any);
                      } else {
                        onSelect(e.target.value);
                      }
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase text-slate-900 outline-none cursor-pointer min-w-[220px]"
                  >
                    <option value="all">Consolidado (Todas)</option>
                    <option disabled>--- Campanhas ---</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button 
                    variant="ghost" 
                    onClick={handleExportExcel}
                    className="h-8 px-4 rounded-lg border border-emerald-200 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 font-bold uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all shadow-sm"
                  >
                    <Download className="w-3 h-3" />
                    Exportar Relatório (Excel)
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={onBack}
                    className="h-8 px-4 rounded-lg border border-slate-200 text-slate-600 hover:text-[#E5003A] hover:bg-slate-50 font-bold uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all shadow-sm"
                  >
                    <ArrowRight className="w-3 h-3 rotate-180" />
                    Sair
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <OperationCluster title="Processamento de Leads" subtitle="Ingestão e Validação" icon={Users}>
              <KPISquare label="Total no Arquivo" value={(stats.total_contacts || 0) + (stats.import_errors || 0)} percentage={100} isInfo subLabel="Base: leads válidos" hidePercentage />
              <KPISquare label="Leads Válidos" value={stats.total_contacts || 0} percentage={100} isPositive subLabel="Base do card (100%)" />
              <KPISquare label="Inconsistentes" value={stats.import_errors || 0} percentage={(stats.total_contacts || 0) > 0 ? ((stats.import_errors || 0) / (stats.total_contacts || 0)) * 100 : 0} isNegative subLabel="Base: leads válidos" />
            </OperationCluster>

            <OperationCluster title="Tráfego de Mensagens" subtitle="Envios e interações reais" icon={MessageSquare}>
              <KPISquare label="Enviados" value={stats.total_contacts} percentage={100} subLabel="Base: leads válidos" />
              <div className="grid grid-cols-2 gap-3">
                <KPISquare label="Entregues" value={stats.delivered_count} percentage={stats.total_contacts > 0 ? Math.min((stats.delivered_count / stats.total_contacts) * 100, 100) : 0} isPositive subLabel="Taxa Entrega: (Entregues/Enviados)" />
                <KPISquare label="Lidas" value={stats.read_count} percentage={stats.delivered_count > 0 ? Math.min((stats.read_count / stats.delivered_count) * 100, 100) : 0} isPositive subLabel="Taxa Leitura: (Lidas/Entregues)" />
              </div>
              <KPISquare 
                label="Não entregues" 
                value={Math.max(stats.total_contacts - stats.delivered_count, 0)} 
                percentage={stats.total_contacts > 0 ? Math.min((Math.max(stats.total_contacts - stats.delivered_count, 0) / stats.total_contacts) * 100, 100) : 0} 
                isNegative 
                subLabel="Não recebidas (Zenvia)" 
                onClick={() => {
                  setSelectedStatuses(['Erro', 'Não Entregue', 'Rejeitada', 'Pendente', 'Processando']);
                  document.getElementById('monitor-table')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </OperationCluster>

            <OperationCluster title="Resultado de Interações" subtitle="Funil Comportamental" icon={Zap}>
              <div className="space-y-3">
                {/* Linha 1: Topo do Funil Impactado */}
                <div className="grid grid-cols-2 gap-3">
                  <KPISquare 
                    label="Base Impactada" 
                    value={stats.delivered_count} 
                    percentage={100} 
                    subLabel="Mensagem entregue" 
                    onClick={() => {
                      setSelectedStatuses(['Enviada', 'Entregue', 'Lida', 'Respondida', 'Convertida']);
                      document.getElementById('monitor-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                  <KPISquare 
                    label="Lidos" 
                    value={stats.read_count} 
                    percentage={stats.delivered_count > 0 ? Math.min((stats.read_count / stats.delivered_count) * 100, 100) : 0} 
                    subLabel="Taxa Leitura" 
                    onClick={() => {
                      setSelectedStatuses(['Lida', 'Respondida', 'Convertida']);
                      document.getElementById('monitor-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                </div>

                {/* Linha 2: Engajamento Real (Destaque) */}
                <div className="w-full">
                  <KPISquare 
                    label="Conversas Iniciadas" 
                    value={stats.response_count} 
                    percentage={stats.delivered_count > 0 ? Math.min((stats.response_count / stats.delivered_count) * 100, 100) : 0} 
                    isInfo 
                    subLabel="Taxa Interação: (Conversas Iniciadas/Entregues)" 
                    onClick={() => {
                      setSelectedStatuses(['Respondida', 'Convertida']);
                      document.getElementById('monitor-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                </div>

                {/* Linha 3: Conversão Realizada (Destaque) */}
                <div className="w-full">
                  <KPISquare 
                    label="Links Enviados" 
                    value={stats.conversion_count} 
                    percentage={stats.delivered_count > 0 ? Math.min((stats.conversion_count / stats.delivered_count) * 100, 100) : 0} 
                    isPositive 
                    subLabel="Conversão/Entregues" 
                    onClick={() => {
                      setSelectedStatuses(['Convertida']);
                      document.getElementById('monitor-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100/50 pt-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase text-emerald-600/70 tracking-widest">Botão Inicial</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-emerald-700">{stats.conversion_button_count || 0}</span>
                          <span className="text-[9px] font-bold text-emerald-600/50">
                            ({stats.conversion_count > 0 ? Math.round(((stats.conversion_button_count || 0) / stats.conversion_count) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 border-l border-slate-100/50 pl-3">
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Via Chat (Agente)</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-700">{stats.conversion_chat_count || 0}</span>
                          <span className="text-[9px] font-bold text-slate-400/50">
                            ({stats.conversion_count > 0 ? Math.round(((stats.conversion_chat_count || 0) / stats.conversion_count) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </KPISquare>
                </div>

                {/* Linha 4: Eficiência e Vazamento do Funil */}
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <KPISquare 
                    label="Pos Interação" 
                    value={`${(stats.response_count || 0) > 0 ? Math.min(((stats.conversion_count || 0) / (stats.response_count || 0)) * 100, 100).toFixed(1) : (0).toFixed(1)}%`}
                    percentage={(stats.response_count || 0) > 0 ? Math.min((stats.conversion_count / stats.response_count) * 100, 100) : 0}
                    isPositive
                    subLabel="Eficácia Resposta"
                  />
                  <KPISquare 
                    label="Abandono Conv." 
                    value={Math.max(stats.response_count - stats.conversion_count, 0)} 
                    percentage={stats.response_count > 0 ? Math.min((Math.max(stats.response_count - stats.conversion_count, 0) / stats.response_count) * 100, 100) : 0} 
                    isNegative 
                    subLabel="Respondeu s/ Link" 
                  />
                </div>
              </div>
            </OperationCluster>
          </div>



          <div id="monitor-table" className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-8 border-b border-border/50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-3 flex-wrap">
                <Activity className="w-5 h-5 text-slate-900" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">Monitor de Transações Exclusivas</h3>
                <div className="flex items-center gap-2 flex-wrap ml-0 lg:ml-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</span>
                  </div>
                  {statusOptions.map((status) => {
                    const isSelected = selectedStatuses.includes(status);
                    const count = leads.filter((lead) => lead.status === status).length;
                    return (
                      <Button
                        key={status}
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatusFilter(status)}
                        className={cn(
                          "h-8 rounded-full border px-3 text-[10px] font-black uppercase tracking-widest transition-all",
                          isSelected
                            ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {status}
                        <span className={cn("ml-1.5 text-[9px]", isSelected ? "text-white/80" : "text-slate-400")}>
                          {count}
                        </span>
                      </Button>
                    );
                  })}
                  {selectedStatuses.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearStatusFilters}
                      className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isLoading && <Clock className="w-4 h-4 text-[#E5003A] animate-spin" />}
              </div>
            </div>
            
            <div className={cn(
              "relative transition-all duration-300"
            )}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest first:pl-10 cursor-pointer" onClick={() => toggleSort('cnpj')}>
                      <div className="flex items-center">CNPJ / ID <SortIcon column="cnpj" /></div>
                    </th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer" onClick={() => toggleSort('whatsapp')}>
                      <div className="flex items-center">WhatsApp <SortIcon column="whatsapp" /></div>
                    </th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer" onClick={() => toggleSort('name')}>
                      <div className="flex items-center">Razão Social / Nome Fantasia <SortIcon column="name" /></div>
                    </th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest last:pr-10 cursor-pointer" onClick={() => toggleSort('status')}>
                      <div className="flex items-center justify-end">Status <SortIcon column="status" /></div>
                    </th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest last:pr-10 text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                        Nenhum dado de lead processado
                      </td>
                    </tr>
                  ) : (
                    sortedLeads.slice(0, 1000).map((lead, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5 text-sm font-mono text-slate-600 first:pl-10">
                          <div className="flex items-center gap-2">
                            <Hash className="w-3 h-3 opacity-30" /> {lead.cnpj}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-sm font-medium text-slate-600">
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3 opacity-30" /> {lead.whatsapp}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-sm font-bold text-slate-900">{lead.name}</p>
                        </td>
                        <td className="px-8 py-5 last:pr-10 text-right">
                          {renderStatusBadge(lead.status, lead.errorMessage)}
                        </td>
                        <td className="px-8 py-5 last:pr-10 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-analytics-trigger="true"
                            onClick={() => openAnalytics(lead)}
                            className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
                          >
                            <MessagesSquare className="w-3.5 h-3.5 mr-1.5" />
                            Conversa
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                  {sortedLeads.length > 1000 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-6 text-center text-slate-400 text-xs font-medium bg-slate-50/50">
                        Mostrando 1000 de {sortedLeads.length} leads. Utilize os filtros ou busca para refinar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <AnimatePresence>
              {selectedLead && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
                    onClick={() => setSelectedLead(null)}
                  />
                  <motion.aside
                    ref={analyticsPanelRef}
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed inset-y-0 right-0 z-[101] w-full border-l border-slate-200 bg-white shadow-2xl md:w-[28rem] lg:w-[32rem] flex flex-col"
                  >
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between border-b border-slate-100 p-6">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resumo Analítico</div>
                        <h4 className="text-lg font-black text-slate-900">
                          {selectedLead.establishmentName || selectedLead.contactName || selectedLead.name}
                        </h4>
                        <p className="text-xs text-slate-500">{selectedLead.whatsapp}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLead(null)}
                        className="h-9 w-9 rounded-full border border-slate-200"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
                      {isMessagesLoading ? (
                        <div className="flex h-full min-h-[240px] items-center justify-center">
                          <div className="flex flex-col items-center gap-3 text-slate-500">
                            <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-[#E5003A]" />
                            <span className="text-xs font-bold uppercase tracking-widest">Carregando conversa...</span>
                          </div>
                        </div>
                      ) : messages && messages.length > 0 ? (
                        <div className="flex-1 overflow-hidden relative">
                          <WhatsAppView 
                            conversation={{
                              id: selectedLead.conversationId || '',
                              userName: selectedLead.establishmentName || selectedLead.contactName || selectedLead.name,
                              userId: selectedLead.whatsapp,
                              messages: messages as any,
                              lastMessageTime: messages.length > 0 ? messages[messages.length - 1].timestamp : new Date()
                            } as any}
                          />
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center m-6">
                          <div className="space-y-2">
                            <p className="text-sm font-bold text-slate-700">Nenhuma conversa encontrada</p>
                            <p className="text-xs text-slate-500">
                              Esta linha ainda não possui mensagens registradas.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.aside>
                </>
              )}
            </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- SHARED COMPONENTS ---

function BigNumberCard({
  label,
  value,
  accentClass = 'text-slate-900'
}: {
  label: string;
  value: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 shadow-sm text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{label}</div>
      <div className={cn("mt-2 text-2xl font-black tracking-tight text-center", accentClass)}>{value}</div>
    </div>
  );
}

function OperationCluster({ title, subtitle, icon: Icon, children }: { 
  title: string; 
  subtitle: string; 
  icon: any; 
  children: React.ReactNode 
}) {
  return (
    <div className="bg-white border border-border/50 p-4 rounded-2xl flex flex-col gap-5 shadow-sm group hover:border-slate-900 transition-all duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-50 text-slate-900 rounded-xl group-hover:bg-slate-950 group-hover:text-white transition-all duration-500">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-900 leading-none">{title}</h3>
          <p className="text-[9px] font-bold uppercase text-slate-400 mt-1.5 tracking-widest">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

function KPISquare({ 
  label, 
  value, 
  percentage, 
  subLabel, 
  hidePercentage = false,
  isPositive = false, 
  isNegative = false, 
  isInfo = false,
  isHighlight = false,
  onClick,
  children
}: {
  label: string;
  value: string | number;
  percentage: number;
  subLabel: string;
  hidePercentage?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
  isInfo?: boolean;
  isHighlight?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const displayValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
  return (
    <div 
      onClick={onClick}
      className={cn(
      "p-3.5 border border-slate-100 bg-white flex flex-col gap-2.5 rounded-xl transition-all duration-300 relative overflow-hidden",
      isHighlight ? "border-slate-900 bg-slate-50/50 shadow-md" : "hover:border-slate-200",
      onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200" : ""
    )}>
      {isInfo && <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />}
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">{label}</span>
        {!hidePercentage && (
          <div className={cn(
            "px-1.5 py-0.5 text-[9px] font-black rounded-lg border",
            isPositive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
            isNegative ? "bg-rose-50 text-rose-600 border-rose-100" : 
            isInfo ? "bg-blue-50 text-blue-600 border-blue-100" : 
            "bg-slate-50 text-slate-600 border-slate-100"
          )}>
            {typeof percentage === 'number' ? `${percentage.toFixed(1)}%` : percentage}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-950 tabular-nums tracking-tighter">{displayValue}</span>
        {isHighlight && <ArrowUpRight className="w-3 h-3 text-[#E5003A] animate-pulse" />}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Number(percentage) || 0, 100)}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              isPositive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" : 
              isNegative ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" : 
              "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.3)]"
            )}
          />
        </div>
        <span className="text-[9px] font-bold uppercase text-slate-400 tracking-tighter">{subLabel}</span>
      </div>
      {children}
    </div>
  );
}

function AnalyticsMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm font-bold text-slate-900 leading-snug">{value}</div>
    </div>
  );
}

function AnalyticsBlock({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        {title}
      </div>
      <div className="space-y-2 text-sm leading-6 text-slate-700">{children}</div>
    </div>
  );
}
