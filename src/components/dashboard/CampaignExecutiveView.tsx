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
  Building2,
  Filter,
  ArrowRight,
  Clock,
  ChevronUp,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TICKET_RED = "#E5003A";

interface CampaignStats {
    total_contacts: number;
    import_errors: number;
    sent_count: number;
    response_count: number;
    conversion_count: number;
    conversion_rate: number;
}

export function CampaignExecutiveView() {
  const { currentTenant } = useApp();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("total");
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: 'cnpj' | 'whatsapp' | 'name' | 'status' | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });

  useEffect(() => {
    if (currentTenant) {
        loadCampaigns();
    }
  }, [currentTenant]);

  // Auto-select first campaign if "total" is selected but campaigns are available
  useEffect(() => {
    if (selectedCampaignId === "total" && campaigns.length > 0) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns]);

  useEffect(() => {
    if (currentTenant) {
        loadDashboardData();
    }
  }, [selectedCampaignId, currentTenant]);

  const loadCampaigns = async () => {
    if (!currentTenant) return;
    try {
        const data = await api.getCampaigns(currentTenant.id);
        setCampaigns(data);
    } catch (error) {
        console.error("Error loading campaigns for dashboard:", error);
    }
  };

  const loadDashboardData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
        const campaignId = selectedCampaignId === "total" ? undefined : selectedCampaignId;
        
        // Fetch Stats
        const statsData = await api.getCampaignStats(selectedCampaignId === "total" ? "" : selectedCampaignId, currentTenant.id);
        setStats(statsData as any);

        // Fetch Enriched Leads for Table
        const enrichedContacts = await api.getEnrichedOutboundQueue(currentTenant.id, campaignId);
        
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

  const selectedCampaign = useMemo(() => {
    if (selectedCampaignId === "total") return null;
    return campaigns.find(c => c.id === selectedCampaignId);
  }, [selectedCampaignId, campaigns]);

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

  if (!stats && isLoading) {
    return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E5003A]"></div>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Compilando Inteligência de Campanha...</p>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700 pb-20">
      {/* Sub-Header / Metadata - Sutil Nexus Style */}
      <div className="bg-white border border-border/50 p-8 rounded-2xl shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-[#E5003A]" />
        
        <div className="flex flex-wrap gap-12 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <Activity className="w-6 h-6 text-[#E5003A]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {selectedCampaignId === "total" ? "Visão Consolidada" : "Estratégia Outbound"}
              </span>
              <span className="text-xl font-black text-slate-900 italic tracking-tight">
                {selectedCampaignId === "total" ? "Performance Global Omni-AI" : selectedCampaign?.name}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 border-l border-slate-100 pl-12 hidden md:flex">
            <Calendar className="w-5 h-5 text-blue-500" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Início</span>
              <span className="text-lg font-bold text-slate-700 font-mono">
                {selectedCampaign ? format(new Date(selectedCampaign.startDate), "dd/MM/yyyy") : '-'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 border-l border-slate-100 pl-12 hidden lg:flex">
            <User className="w-5 h-5 text-emerald-500" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Meta Atribuída</span>
              <span className="text-lg font-bold text-slate-700 max-w-[200px] truncate">
                {selectedCampaign?.description || "Conversão Base"}
              </span>
            </div>
          </div>
        </div>
        
        <div className="mt-6 lg:mt-0 w-full lg:w-[300px]">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="bg-white border-slate-200">
              <SelectValue placeholder="Escolher estratégia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Todas as Campanhas</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {stats && (
        <>
          {/* Main KPI Arena */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <OperationCluster title="Processamento de Leads" subtitle="Ingestão e Validação" icon={Users}>
              <KPISquare label="Total no Arquivo" value={stats.total_contacts + stats.import_errors} percentage={100} subLabel="Volume de Carga" />
              <KPISquare label="Leads Válidos" value={stats.total_contacts} percentage={stats.total_contacts > 0 ? (stats.total_contacts / (stats.total_contacts + stats.import_errors)) * 100 : 0} isPositive subLabel="Inseridos na Fila" />
              <KPISquare label="Inconsistentes" value={stats.import_errors} percentage={stats.import_errors > 0 ? (stats.import_errors / (stats.total_contacts + stats.import_errors)) * 100 : 0} isNegative subLabel="Erros de Importação" />
            </OperationCluster>

            <OperationCluster title="Tráfego de Mensagens" subtitle="Execução OutboundWPP" icon={MessageSquare}>
              <KPISquare label="Enviadas" value={stats.sent_count} percentage={stats.total_contacts > 0 ? (stats.sent_count / stats.total_contacts) * 100 : 0} subLabel="Total Disparado" />
              <KPISquare label="Com Resposta" value={stats.response_count} percentage={stats.sent_count > 0 ? (stats.response_count / stats.sent_count) * 100 : 0} isPositive subLabel="Engajamento Criado" />
              <KPISquare label="Não Respondidas" value={stats.sent_count - stats.response_count} percentage={stats.sent_count > 0 ? ((stats.sent_count - stats.response_count) / stats.sent_count) * 100 : 0} isNegative subLabel="Dropouts de Lead" />
            </OperationCluster>

            <OperationCluster title="Resultados de Negócio" subtitle="Conversão por Critério" icon={Zap}>
              <KPISquare label="Ativos" value={stats.sent_count} percentage={100} subLabel="Prospects Contatados" />
              <KPISquare label="Conversões" value={stats.conversion_count} percentage={stats.conversion_rate} isHighlight subLabel="Meta Alcançada" />
              <KPISquare label="Taxa de Sucesso" value={`${stats.conversion_rate}%`} percentage={stats.conversion_rate} isPositive subLabel="ROI de Engajamento" />
            </OperationCluster>
          </div>

          {/* Monitor Table - Sutil */}
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
                    <th 
                      className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest first:pl-10 cursor-pointer hover:bg-slate-100/50 transition-colors"
                      onClick={() => toggleSort('cnpj')}
                    >
                      <div className="flex items-center">
                        CNPJ / ID <SortIcon column="cnpj" />
                      </div>
                    </th>
                    <th 
                      className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:bg-slate-100/50 transition-colors"
                      onClick={() => toggleSort('whatsapp')}
                    >
                      <div className="flex items-center">
                        WhatsApp <SortIcon column="whatsapp" />
                      </div>
                    </th>
                    <th 
                      className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:bg-slate-100/50 transition-colors"
                      onClick={() => toggleSort('name')}
                    >
                      <div className="flex items-center">
                        Razão Social / Nome Fantasia <SortIcon column="name" />
                      </div>
                    </th>
                    <th 
                      className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest last:pr-10 cursor-pointer hover:bg-slate-100/50 transition-colors"
                      onClick={() => toggleSort('status')}
                    >
                      <div className="flex items-center justify-end">
                        Status <SortIcon column="status" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                        Nenhum dado de lead processado para esta seleção
                      </td>
                    </tr>
                  ) : (
                    sortedLeads.map((lead, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5 text-xs font-mono text-slate-600 first:pl-10">
                          <div className="flex items-center gap-2">
                            <Hash className="w-3 h-3 opacity-30" />
                            {lead.cnpj}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-medium text-slate-600">
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3 opacity-30" />
                            {lead.whatsapp}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-xs font-bold text-slate-900">{lead.name}</p>
                        </td>
                        <td className="px-8 py-5 last:pr-10 text-right">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                            lead.status === 'Enviada' || lead.status === 'Concluída'
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                              : lead.status === 'Erro'
                              ? 'bg-rose-50 text-rose-600 border border-rose-100'
                              : 'bg-amber-50 text-amber-600 border border-amber-100'
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

function OperationCluster({ title, subtitle, icon: Icon, children }: any) {
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
      
      <div className="flex flex-col gap-3.5">
        {children}
      </div>
    </div>
  );
}

function KPISquare({ label, value, percentage, subLabel, isPositive = false, isNegative = false, isHighlight = false }: any) {
  const displayValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
  
  return (
    <div className={cn(
        "p-3.5 border border-slate-100 bg-white flex flex-col gap-2.5 rounded-xl transition-all duration-300",
        isHighlight ? "border-slate-900 bg-slate-50/50 shadow-md" : "hover:border-slate-200"
      )}
    >
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
        <span className="text-2xl font-black text-slate-950 tabular-nums tracking-tighter">
          {displayValue}
        </span>
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
