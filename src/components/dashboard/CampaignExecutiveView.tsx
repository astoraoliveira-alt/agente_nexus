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
  UserRound
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign, Agent } from '@/lib/types';
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
    conversion_rate: number;
    total_messages: number;
}

interface LeadResult {
    id: string;
    cnpj: string;
    whatsapp: string;
    name: string;
    status: string;
    contactName?: string;
    establishmentName?: string;
    conversationId?: string | null;
    responseDetected?: boolean;
    sentAt?: string | null;
    createdAt?: string | null;
    campaignId?: string | null;
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

      // Keep summary and detail aligned by hydrating each campaign with the same RPC used in the detail view.
      const statsResults = await Promise.allSettled(
        campaignsData.map(async (campaign) => ({
          campaignId: campaign.id,
          stats: await api.getCampaignStats(campaign.id, currentTenant.id)
        }))
      );

      const statsByCampaignId = new Map(
        statsResults
          .filter((result): result is PromiseFulfilledResult<{ campaignId: string; stats: CampaignStats }> => result.status === 'fulfilled')
          .map((result) => [result.value.campaignId, result.value.stats])
      );

      const campaignsWithLiveStats = campaignsData.map((campaign) => {
        const liveStats = statsByCampaignId.get(campaign.id);

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
          totalMessages: liveStats.total_messages,
          conversionCount: liveStats.conversion_count,
          conversionRate: liveStats.conversion_rate,
          importErrorCount: liveStats.import_errors
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
  const overallConversionRate = totalValidLeads > 0 ? (totalLinksSent / totalValidLeads) * 100 : 0;

  const calculateConversion = (campaign: Campaign) => {
    if (!campaign.totalContacts || campaign.totalContacts === 0) return 0;
    return ((campaign.conversionCount || 0) / campaign.totalContacts) * 100;
  };

  const getConversionColor = (value: number) => {
    if (value <= 10) return 'bg-rose-500';
    if (value <= 15) return 'bg-amber-400';
    return 'bg-emerald-500';
  };

  const getConversionTextColor = (value: number) => {
    if (value <= 10) return 'text-rose-600';
    if (value <= 15) return 'text-amber-500';
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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:min-w-[42rem]">
            <BigNumberCard label="Total de Campanhas" value={totalCampaigns.toLocaleString('pt-BR')} />
            <BigNumberCard label="Válidos" value={totalValidLeads.toLocaleString('pt-BR')} />
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
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Abandonados</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Links Enviados</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">% Conversão</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest last:pr-8">Agente</th>
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
                    <td className="px-4 py-5 text-xs font-bold text-slate-900 text-center">
                      {Math.max((c.sentCount || 0) - (c.conversionCount || 0), 0).toLocaleString('pt-BR')}
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
                    <td className="px-6 py-5 last:pr-8">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">
                          <User className="w-3 h-3 text-slate-400" />
                        </div>
                        <span className="text-xs font-medium text-slate-600 truncate max-w-[120px]">
                          {getAgentName(c.agentId)}
                        </span>
                      </div>
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
  const [analyticsData, setAnalyticsData] = useState<ConversationAnalytics | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [analyticsCache, setAnalyticsCache] = useState<Record<string, ConversationAnalytics | null>>({});
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
      setStats(statsData as any);

      const enrichedContacts = await api.getEnrichedOutboundQueue(currentTenant.id, targetCampaignId as any);
      const mappedLeads = enrichedContacts.map(c => ({
          id: c.id,
          cnpj: c.cnpj || '-',
          whatsapp: c.contactPhone,
          name: c.establishmentName || c.contactName || 'Sem Nome',
          contactName: c.contactName || 'Sem Nome',
          establishmentName: c.establishmentName || null,
          conversationId: c.conversationId || null,
          responseDetected: Boolean(c.responseDetected),
          sentAt: c.sentAt || null,
          createdAt: c.createdAt || null,
          campaignId: c.campaignId || null,
          status: c.status === 'sent' ? 'Enviada' : 
                 c.status === 'failed' ? 'Erro' : 
                 c.status === 'pending' ? 'Pendente' : 
                 c.status === 'processing' ? 'Processando' :
                 c.status === 'responded' ? 'Respondida' :
                 c.status === 'delivered' ? 'Entregue' :
                 c.status === 'read' ? 'Lida' :
                 c.status === 'converted' ? 'Convertida' : c.status
      }));
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
    if (cacheKey in analyticsCache) {
      setAnalyticsData(analyticsCache[cacheKey]);
      return;
    }

    let active = true;
    setIsAnalyticsLoading(true);

    api.getConversationAnalytics(currentTenant.id, {
      conversationId: selectedLead.conversationId,
      phone: selectedLead.whatsapp,
      campaignId: selectedLead.campaignId || (campaignId === 'all_consolidated' ? null : campaignId),
      leadId: selectedLead.id
    })
      .then((result) => {
        if (!active) return;
        const analyticsResult = result as ConversationAnalytics | null;
        setAnalyticsData(analyticsResult);
        setAnalyticsCache(prev => ({ ...prev, [cacheKey]: analyticsResult }));
      })
      .catch((error) => {
        console.error('Error loading conversation analytics:', error);
        if (!active) return;
        setAnalyticsData(null);
      })
      .finally(() => {
        if (active) {
          setIsAnalyticsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedLead, currentTenant, analyticsCache]);

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

  const statusOptions = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.status))).sort((a, b) => a.localeCompare(b)),
    [leads]
  );

  const filteredLeads = useMemo(() => {
    if (selectedStatuses.length === 0) return leads;
    return leads.filter((lead) => selectedStatuses.includes(lead.status));
  }, [leads, selectedStatuses]);

  const sortedLeads = useMemo(() => {
    let items = [...filteredLeads];
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

  const toggleStatusFilter = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
    );
  };

  const clearStatusFilters = () => setSelectedStatuses([]);

  const openAnalytics = (lead: LeadResult) => {
    setSelectedLead(lead);
    setAnalyticsData(null);
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

  const renderStatusBadge = (status?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    const isSuccess = ['enviada', 'concluída', 'concluida', 'convertida', 'entregue', 'lida'].includes(normalized);
    const isError = normalized === 'erro';
    const isProcessing = normalized === 'processando';

    const classes = isSuccess
      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
      : isError
        ? 'bg-rose-50 text-rose-600 border border-rose-100'
        : 'bg-amber-50 text-amber-600 border border-amber-100';
    
    const Icon = isSuccess
      ? CheckCircle2
      : isError
        ? AlertTriangle
        : Clock;

    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
        classes
      )}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

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
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="bg-white border border-border/50 p-6 rounded-2xl shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center relative overflow-hidden flex-1 w-full">
          <div className="absolute top-0 left-0 w-2 h-full bg-[#E5003A]" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 w-full">
            <div className="flex items-center gap-12">
              <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Campanha</span>
                  <span className="text-xl font-black text-slate-900 italic tracking-tight">
                      {campaignId === 'all_consolidated' ? 'Consolidado Geral' : selectedCampaign?.name}
                  </span>
              </div>

              <div className="flex items-center gap-4 border-l border-slate-100 pl-8 hidden md:flex">
                <Calendar className="w-5 h-5 text-blue-500" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Início</span>
                    <span className="text-sm font-bold text-slate-700 font-mono">
                        {campaignId === 'all_consolidated' ? 'Todos os Períodos' : selectedCampaign ? format(new Date(selectedCampaign.startDate), "dd/MM/yyyy") : '-'}
                    </span>
                </div>
              </div>

                <div className="flex items-center gap-4 border-l border-slate-100 pl-8 hidden xl:flex">
                  <Target className="w-5 h-5 text-[#E5003A]" />
                  <div className="flex flex-col max-w-[280px]">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Meta / Objetivo</span>
                    <span className="text-sm font-bold text-slate-700 truncate">
                      {campaignId === 'all_consolidated' ? 'Visão consolidada das campanhas' : selectedCampaign?.description || 'Nao informado'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-l border-slate-100 pl-8 hidden xl:flex">
                  <User className="w-5 h-5 text-slate-500" />
                  <div className="flex flex-col max-w-[220px]">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Agente</span>
                    <span className="text-sm font-bold text-slate-700 truncate">
                      {campaignId === 'all_consolidated' ? 'Multiplos agentes' : selectedAgent?.name || 'Nao informado'}
                    </span>
                  </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3 ml-auto">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">Alternar Visão</span>
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
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase text-slate-900 outline-none cursor-pointer min-w-[200px]"
                        >
                            <option value="all">Consolidado (Todas)</option>
                            <option disabled>--- Campanhas ---</option>
                            {campaigns.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <Button 
                            variant="ghost" 
                            onClick={onBack}
                            className="h-8 px-3 rounded-lg border border-slate-200 text-slate-600 hover:text-[#E5003A] hover:bg-slate-50 font-bold uppercase text-[9px] tracking-widest flex items-center gap-1.5 transition-all"
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
              <KPISquare label="Total no Arquivo" value={stats.total_contacts + stats.import_errors} percentage={stats.total_contacts > 0 ? ((stats.total_contacts + stats.import_errors) / stats.total_contacts) * 100 : 0} subLabel="Base: leads válidos" hidePercentage />
              <KPISquare label="Leads Válidos" value={stats.total_contacts} percentage={stats.total_contacts > 0 ? 100 : 0} isPositive subLabel="Base do card (100%)" />
              <KPISquare label="Inconsistentes" value={stats.import_errors} percentage={stats.total_contacts > 0 ? (stats.import_errors / stats.total_contacts) * 100 : 0} isNegative subLabel="Base: leads válidos" />
            </OperationCluster>

            <OperationCluster title="Tráfego de Mensagens" subtitle="Envios e interações reais" icon={MessageSquare}>
              <KPISquare label="Enviados" value={stats.sent_count} percentage={stats.total_contacts > 0 ? (stats.sent_count / stats.total_contacts) * 100 : 0} subLabel="Base: leads válidos" />
              <KPISquare label="Entregues" value={stats.delivered_count} percentage={stats.total_contacts > 0 ? (stats.delivered_count / stats.total_contacts) * 100 : 0} isPositive subLabel="Base: leads válidos" />
              <KPISquare label="Lidos" value={stats.read_count} percentage={stats.total_contacts > 0 ? (stats.read_count / stats.total_contacts) * 100 : 0} isPositive accentClass="text-emerald-600" subLabel="Base: leads válidos" />
            </OperationCluster>

            <OperationCluster title="Resultado de Interações" subtitle="Baseados nos leads válidos" icon={Zap}>
              <KPISquare label="Iniciados" value={stats.sent_count} percentage={stats.total_contacts > 0 ? (stats.sent_count / stats.total_contacts) * 100 : 0} subLabel="Base: leads válidos" />
              <KPISquare label="Insucessos" value={Math.max(stats.sent_count - stats.conversion_count, 0)} percentage={stats.total_contacts > 0 ? (Math.max(stats.sent_count - stats.conversion_count, 0) / stats.total_contacts) * 100 : 0} isNegative subLabel="Base: leads válidos" />
              <KPISquare label="Links Enviados" value={stats.conversion_count} percentage={stats.total_contacts > 0 ? (stats.conversion_count / stats.total_contacts) * 100 : 0} isPositive subLabel="Base: leads válidos" />
            </OperationCluster>
          </div>

          <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
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
              "relative transition-all duration-300",
              selectedLead ? "lg:pr-[25rem]" : ""
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
                    sortedLeads.map((lead, idx) => (
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
                          {renderStatusBadge(lead.status)}
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
                            <PanelRightOpen className="w-3.5 h-3.5 mr-1.5" />
                            Detalhar
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <AnimatePresence>
              {selectedLead && (
                <motion.aside
                  ref={analyticsPanelRef}
                  initial={{ x: 32, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 32, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="absolute inset-y-0 right-0 z-10 w-full border-l border-slate-200 bg-white shadow-2xl md:w-[25rem]"
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

                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {isAnalyticsLoading ? (
                        <div className="flex h-full min-h-[240px] items-center justify-center">
                          <div className="flex flex-col items-center gap-3 text-slate-500">
                            <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-[#E5003A]" />
                            <span className="text-xs font-bold uppercase tracking-widest">Carregando inteligência...</span>
                          </div>
                        </div>
                      ) : analyticsData ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <AnalyticsMetric icon={Calendar} label="Data/Hora" value={formatDateTime(analyticsData.startedAt)} />
                            <AnalyticsMetric icon={Clock} label="Última interação" value={formatDateTime(analyticsData.lastInteractionAt)} />
                            <AnalyticsMetric icon={TimerReset} label="Duração" value={formatDuration(analyticsData.durationSeconds)} />
                            <AnalyticsMetric icon={MessagesSquare} label="Mensagens" value={String(analyticsData.messageCount)} />
                            <AnalyticsMetric icon={ArrowUpRight} label="Saídas" value={String(analyticsData.outboundCount)} />
                            <AnalyticsMetric icon={ArrowRight} label="Entradas" value={String(analyticsData.inboundCount)} />
                          </div>

                          <AnalyticsBlock title="Visão Executiva" icon={Activity}>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fila</p>
                                <div className="mt-2">{renderStatusBadge(analyticsData.queueStatus || selectedLead.status)}</div>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Conversão</p>
                                <p className="mt-2 font-semibold text-slate-900">
                                  {analyticsData.wasConverted ? 'Convertido' : analyticsData.responseDetected ? 'Interagiu' : 'Sem conversão'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Canal</p>
                                <p className="mt-2 font-semibold text-slate-900">{analyticsData.channel || 'Nao informado'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status da conversa</p>
                                <p className="mt-2 font-semibold text-slate-900">{analyticsData.conversationStatus || 'Nao informado'}</p>
                              </div>
                            </div>
                          </AnalyticsBlock>

                          <AnalyticsBlock title="Participantes" icon={UserRound}>
                            <p><span className="font-semibold">Contato:</span> {analyticsData.participants.contactName}</p>
                            <p><span className="font-semibold">Agente:</span> {analyticsData.participants.agentName}</p>
                            <p><span className="font-semibold">Telefone:</span> {analyticsData.participants.contactPhone}</p>
                          </AnalyticsBlock>

                          <AnalyticsBlock title="Auditoria" icon={SmilePlus}>
                            <p>{analyticsData.predominantSentiment}</p>
                            {typeof analyticsData.score === 'number' && (
                              <p className="text-xs text-slate-500">Score analítico: {analyticsData.score}/100</p>
                            )}
                            <p className="text-xs text-slate-500">
                              Avaliações: {analyticsData.evaluationCount} {analyticsData.latestAuditAt ? `| Última auditoria: ${formatDateTime(analyticsData.latestAuditAt)}` : ''}
                            </p>
                            {analyticsData.aiModel && (
                              <p className="text-xs text-slate-500">Modelo: {analyticsData.aiModel}</p>
                            )}
                          </AnalyticsBlock>

                          <AnalyticsBlock title="Tags de auditoria" icon={MessageSquare}>
                            {analyticsData.auditTags.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {analyticsData.auditTags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-widest">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p>Nenhuma tag de auditoria identificada.</p>
                            )}
                          </AnalyticsBlock>

                          <AnalyticsBlock title="Critérios da auditoria" icon={Target}>
                            {Object.keys(analyticsData.criteriaResults || {}).length > 0 ? (
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(analyticsData.criteriaResults).map(([key, value]) => (
                                  <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                      {formatMetricLabel(key)}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{String(value)}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p>Nenhum critério detalhado disponível.</p>
                            )}
                          </AnalyticsBlock>

                          <AnalyticsBlock title="Perfil do contato" icon={User}>
                            <p><span className="font-semibold">Lifecycle:</span> {analyticsData.contactLifecycleStatus || 'Nao informado'}</p>
                            <p><span className="font-semibold">Status:</span> {analyticsData.contactStatus || 'Nao informado'}</p>
                            <p><span className="font-semibold">Sentimento:</span> {analyticsData.predominantSentiment}</p>
                            {analyticsData.contactTags.length > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {analyticsData.contactTags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-widest">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p>Sem tags do contato.</p>
                            )}
                          </AnalyticsBlock>

                          <AnalyticsBlock title="Resumo da conversa" icon={Activity}>
                            <p>{analyticsData.summary || analyticsData.lastMessagePreview || 'Nenhum resumo disponível.'}</p>
                          </AnalyticsBlock>
                        </>
                      ) : (
                        <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                          <div className="space-y-2">
                            <p className="text-sm font-bold text-slate-700">Nenhum resumo analítico encontrado</p>
                            <p className="text-xs text-slate-500">
                              Esta linha ainda não possui uma conversa relacionada ou dados analíticos suficientes.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.aside>
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
  isHighlight = false 
}: {
  label: string;
  value: string | number;
  percentage: number;
  subLabel: string;
  hidePercentage?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
  isHighlight?: boolean;
}) {
  const displayValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
  return (
    <div className={cn(
      "p-3.5 border border-slate-100 bg-white flex flex-col gap-2.5 rounded-xl transition-all duration-300",
      isHighlight ? "border-slate-900 bg-slate-50/50 shadow-md" : "hover:border-slate-200"
    )}>
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">{label}</span>
        {!hidePercentage && (
          <div className={cn(
            "px-1.5 py-0.5 text-[9px] font-black rounded-lg border",
            isPositive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
            isNegative ? "bg-rose-50 text-rose-600 border-rose-100" : 
            "bg-slate-50 text-slate-600 border-slate-100"
          )}>
            {typeof percentage === 'number' ? `${percentage.toFixed(0)}%` : percentage}
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
