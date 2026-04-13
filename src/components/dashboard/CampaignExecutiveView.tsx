import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
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
  Target
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
    response_count: number;
    conversion_count: number;
    conversion_rate: number;
    total_messages: number;
}

interface LeadResult {
    cnpj: string;
    whatsapp: string;
    name: string;
    status: string;
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
    }
  }, [currentTenant]);

  const loadInitialData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const [campaignsData, agentsData] = await Promise.all([
        api.getCampaigns(currentTenant.id),
        api.getAgents(currentTenant.id)
      ]);
      setCampaigns(campaignsData);
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

  const calculateConversion = (campaign: Campaign) => {
    if (!campaign.totalContacts || campaign.totalContacts === 0) return 0;
    return ((campaign.conversionCount || 0) / campaign.totalContacts) * 100;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border/50 p-8 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-[#E5003A]" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <Target className="w-6 h-6 text-[#E5003A]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visão Geral</span>
            <span className="text-2xl font-black text-slate-900 italic tracking-tight">Painel Principal Outbound</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-white text-slate-400 font-mono text-[9px] uppercase tracking-tighter">
            Total em Execução: {campaigns.filter(c => c.status === 'active').length}
          </Badge>
        </div>
      </div>

      <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest first:pl-10">Campanha</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Início</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Base</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Envios</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Mensagens</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Sucesso</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Yield / ROI</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest last:pr-10">Agente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-8 py-20 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
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
                    <td className="px-8 py-5 first:pl-10">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 group-hover:text-[#E5003A] transition-colors">{c.name}</span>
                        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-tighter">{c.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-xs font-mono text-slate-500 text-center">
                      {format(new Date(c.startDate), "dd/MMM", { locale: ptBR }).toUpperCase()}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-500 text-center">
                      {c.totalContacts.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-900 text-center">
                      {c.sentCount.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-slate-900 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <MessageSquare className="w-3 h-3 text-emerald-500" />
                        {c.totalMessages.toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-4 py-5 text-xs font-bold text-indigo-600 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Zap className="w-3 h-3" />
                        {c.conversionCount.toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-sm font-black text-slate-900 italic">
                          {calculateConversion(c).toFixed(1)}%
                        </span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#E5003A]" 
                            style={{ width: `${Math.min(calculateConversion(c), 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 last:pr-10">
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
  onSelect: (id: string) => void;
  onBack: () => void;
}

function CampaignDetailView({ campaignId, campaigns, onSelect, onBack }: CampaignDetailViewProps) {
  const { currentTenant } = useApp();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: 'cnpj' | 'whatsapp' | 'name' | 'status' | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });

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
          cnpj: c.cnpj || '-',
          whatsapp: c.contactPhone,
          name: c.contactName || 'Sem Nome',
          status: c.status === 'sent' ? 'Enviada' : 
                 c.status === 'failed' ? 'Erro' : 
                 c.status === 'pending' ? 'Pendente' : c.status
      }));
      setLeads(mappedLeads);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === campaignId);

  const sortedLeads = useMemo(() => {
    let items = [...leads];
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
  }, [leads, sortConfig]);

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
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estratégia Outbound</span>
                <span className="text-xl font-black text-slate-900 italic tracking-tight">
                    {campaignId === 'all_consolidated' ? 'Consolidado Geral' : selectedCampaign?.name}
                </span>
              </div>

              <div className="flex items-center gap-4 border-l border-slate-100 pl-8 hidden md:flex">
                <Calendar className="w-5 h-5 text-blue-500" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Referência</span>
                    <span className="text-sm font-bold text-slate-700 font-mono">
                        {campaignId === 'all_consolidated' ? 'Todos os Períodos' : selectedCampaign ? format(new Date(selectedCampaign.startDate), "dd/MM/yyyy") : '-'}
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
              <KPISquare label="Total no Arquivo" value={stats.total_contacts + stats.import_errors} percentage={100} subLabel="Volume de Carga" />
              <KPISquare label="Leads Válidos" value={stats.total_contacts} percentage={stats.total_contacts > 0 ? (stats.total_contacts / (stats.total_contacts + stats.import_errors)) * 100 : 0} isPositive subLabel="Inseridos na Fila" />
              <KPISquare label="Inconsistentes" value={stats.import_errors} percentage={stats.import_errors > 0 ? (stats.import_errors / (stats.total_contacts + stats.import_errors)) * 100 : 0} isNegative subLabel="Erros de Importação" />
            </OperationCluster>

            <OperationCluster title="Tráfego de Mensagens" subtitle="Interações reais detectadas" icon={MessageSquare}>
              <KPISquare label="Envios" value={stats.sent_count} percentage={stats.total_contacts > 0 ? (stats.sent_count / stats.total_contacts) * 100 : 0} subLabel="Disparos Realizados" />
              <KPISquare label="Total Mensagens" value={stats.total_messages || 0} percentage={100} isPositive subLabel="Volume de Tráfego Real" />
              <KPISquare label="Respostas" value={stats.response_count} percentage={stats.sent_count > 0 ? (stats.response_count / stats.sent_count) * 100 : 0} isPositive subLabel="Engajamento Criado" />
            </OperationCluster>

            <OperationCluster title="Resultados de Negócio" subtitle="Conversão por Critério" icon={Zap}>
              <KPISquare label="Ativos" value={stats.sent_count} percentage={100} subLabel="Prospects Contatados" />
              <KPISquare label="Conversões" value={stats.conversion_count} percentage={stats.conversion_rate} isHighlight subLabel="Meta Alcançada" />
              <KPISquare label="Taxa de Sucesso" value={`${stats.conversion_rate}%`} percentage={stats.conversion_rate} isPositive subLabel="ROI de Engajamento" />
            </OperationCluster>
          </div>

          <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-8 border-b border-border/50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-slate-900" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">Monitor de Transações Exclusivas</h3>
              </div>
              <div className="flex items-center gap-3">
                {isLoading && <Clock className="w-4 h-4 text-[#E5003A] animate-spin" />}
                <Badge variant="outline" className="bg-white text-slate-400 font-mono text-[9px] uppercase tracking-tighter">
                  Data Stream: Socket Active
                </Badge>
              </div>
            </div>
            
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                        Nenhum dado de lead processado
                      </td>
                    </tr>
                  ) : (
                    sortedLeads.map((lead, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5 text-xs font-mono text-slate-600 first:pl-10">
                          <div className="flex items-center gap-2">
                            <Hash className="w-3 h-3 opacity-30" /> {lead.cnpj}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-medium text-slate-600">
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3 opacity-30" /> {lead.whatsapp}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-xs font-bold text-slate-900">{lead.name}</p>
                        </td>
                        <td className="px-8 py-5 last:pr-10 text-right">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                            lead.status === 'Enviada' || lead.status === 'Concluída' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            lead.status === 'Erro' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                            'bg-amber-50 text-amber-600 border border-amber-100'
                          )}>
                            {lead.status === 'Enviada' || lead.status === 'Concluída' ? <CheckCircle2 className="w-3 h-3" /> : lead.status === 'Erro' ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- SHARED COMPONENTS ---

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
  isPositive = false, 
  isNegative = false, 
  isHighlight = false 
}: {
  label: string;
  value: string | number;
  percentage: number;
  subLabel: string;
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
        <div className={cn(
          "px-1.5 py-0.5 text-[9px] font-black rounded-lg border",
          isPositive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
          isNegative ? "bg-rose-50 text-rose-600 border-rose-100" : 
          "bg-slate-50 text-slate-600 border-slate-100"
        )}>
          {typeof percentage === 'number' ? `${percentage.toFixed(0)}%` : percentage}
        </div>
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

