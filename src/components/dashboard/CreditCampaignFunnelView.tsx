import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Building2, 
  Calendar, 
  CheckCircle2, 
  Download, 
  Search, 
  TrendingUp, 
  Users, 
  Zap,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  FileCheck,
  AlertCircle,
  Bot,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { CreditCampaignFunnelStat, Agent } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { CreditCampaignDetailView } from './CreditCampaignDetailView';

interface CreditCampaignFunnelViewProps {
  onSelectCampaign?: (campaignId: string) => void;
}

export function CreditCampaignFunnelView({ onSelectCampaign }: CreditCampaignFunnelViewProps) {
  const { currentTenant } = useApp();
  const [funnelData, setFunnelData] = useState<CreditCampaignFunnelStat[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'15days' | '30days' | '90days' | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isExportingLeads, setIsExportingLeads] = useState(false);
  const [campaignTypes, setCampaignTypes] = useState<Record<string, string>>({});

  // 1. Carrega os agentes e auto-seleciona o Agente Novo por padrão para blindar os big numbers
  useEffect(() => {
    if (!currentTenant) {
      setFunnelData([]);
      setAgents([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const initAgents = async () => {
      try {
        const agentsList = await api.getAgents(currentTenant.id);
        if (!isMounted) return;
        const list = agentsList || [];
        setAgents(list);

        // Auto-seleciona o agente novo comercial (ex: "Agente Comercial Fiserv (Novo)")
        const newAgent = list.find(a => 
          a.name.toLowerCase().includes('(novo)') || 
          a.name.toLowerCase().includes('novo')
        ) || list.find(a => 
          a.name.toLowerCase().includes('fiserv') && a.name.toLowerCase().includes('comercial')
        ) || list.find(a => 
          a.name.toLowerCase().includes('fiserv')
        );

        if (newAgent) {
          setSelectedAgentId(newAgent.id);
        } else {
          setSelectedAgentId('all');
        }
        setIsInitialized(true);
      } catch (err) {
        console.error('Error fetching agents for funnel filter:', err);
        if (isMounted) {
          setSelectedAgentId('all');
          setIsInitialized(true);
        }
      }
    };

    initAgents();

    return () => {
      isMounted = false;
    };
  }, [currentTenant?.id]);

  // 2. Carrega as estatísticas do funil após inicialização
  useEffect(() => {
    if (!currentTenant || !isInitialized) return;
    loadFunnelData();
  }, [currentTenant?.id, timeFilter, selectedAgentId, isInitialized]);

  const loadFunnelData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const now = new Date();
      let startDate: Date | undefined;
      if (timeFilter === '15days') {
        startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '30days') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '90days') {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }

      const agentFilterParam = selectedAgentId && selectedAgentId !== 'all' ? selectedAgentId : undefined;

      const [stats, campaigns] = await Promise.all([
        api.getCreditCampaignFunnelStats(
          currentTenant.id, 
          undefined, 
          startDate, 
          agentFilterParam
        ),
        api.getCampaigns(currentTenant.id)
      ]);

      const typeMap: Record<string, string> = {};
      (campaigns || []).forEach(c => {
        typeMap[c.id] = c.campaignType || c.metadata?.campaign_type || 'standard';
      });
      setCampaignTypes(typeMap);
      setFunnelData(stats || []);
    } catch (err) {
      console.error('Error loading credit funnel data:', err);
      setFunnelData([]);
    } finally {
      setIsLoading(false);
    }
  };



  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return funnelData;
    const term = searchTerm.toLowerCase();
    return funnelData.filter(d => d.campaignName.toLowerCase().includes(term));
  }, [funnelData, searchTerm]);

  // Totais agregados
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => ({
        carregados: acc.carregados + item.carregados,
        enviados: acc.enviados + item.enviados,
        entregues: acc.entregues + item.entregues,
        lidas: acc.lidas + item.lidas,
        interagiram: acc.interagiram + item.interagiram,
        confirmaram: acc.confirmaram + (item.confirmaram || 0),
        faturamento: acc.faturamento + item.faturamento,
        valorInicial: acc.valorInicial + item.valorInicial,
        optIn: acc.optIn + item.optIn,
        aprovados: acc.aprovados + item.aprovados,
        recusados: acc.recusados + item.recusados,
        simularam: acc.simularam + item.simularam,
        okAgente: acc.okAgente + item.okAgente,
        aguarContato: acc.aguarContato + item.aguarContato,
        emAtendimento: acc.emAtendimento + item.emAtendimento,
        formalizado: acc.formalizado + item.formalizado,
        desistencia: acc.desistencia + (item.desistencia || 0)
      }),
      {
        carregados: 0,
        enviados: 0,
        entregues: 0,
        lidas: 0,
        interagiram: 0,
        confirmaram: 0,
        faturamento: 0,
        valorInicial: 0,
        optIn: 0,
        aprovados: 0,
        recusados: 0,
        simularam: 0,
        okAgente: 0,
        aguarContato: 0,
        emAtendimento: 0,
        formalizado: 0,
        desistencia: 0
      }
    );
  }, [filteredData]);

  // Taxas de conversão principais
  const deliveryRate = totals.enviados > 0 ? ((totals.entregues / totals.enviados) * 100).toFixed(1) : '0.0';
  const responseRate = totals.entregues > 0 ? ((totals.interagiram / totals.entregues) * 100).toFixed(1) : '0.0';
  const optInRate = totals.interagiram > 0 ? ((totals.optIn / totals.interagiram) * 100).toFixed(1) : '0.0';
  const approvalRate = totals.optIn > 0 ? ((totals.aprovados / totals.optIn) * 100).toFixed(1) : '0.0';
  const formalizationRate = totals.enviados > 0 ? ((totals.formalizado / totals.enviados) * 100).toFixed(1) : '0.0';

  const exportToExcel = () => {
    const rows = filteredData.map(d => ({
      Campanha: d.campaignName,
      Status: d.status,
      Início: d.startDate ? format(d.startDate, 'dd/MM/yyyy') : '-',
      // Envio
      'Envio - Carregados': d.carregados,
      'Envio - Enviados': d.enviados,
      'Envio - Entregues': d.entregues,
      'Envio - Lidas': d.lidas,
      'Envio - Interagiram': d.interagiram,
      // Venda
      'Venda - Confirmaram': d.confirmaram || 0,
      'Venda - Faturamento': d.faturamento,
      'Venda - Valor Inicial': d.valorInicial,
      'Venda - Opt-in': d.optIn,
      'Venda - Aprovados': d.aprovados,
      'Venda - Recusados': d.recusados,
      'Venda - Simularam': d.simularam,
      'Venda - OK Agente': d.okAgente,
      // Formalização
      'Formalização - Aguar. Contato': d.aguarContato,
      'Formalização - Em Atendimento': d.emAtendimento,
      'Formalização - Formalizado': d.formalizado,
      'Formalização - Desistência': d.desistencia || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Funil de Crédito');
    XLSX.writeFile(wb, `funil_credito_executivo_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportAllLeadsToExcel = async () => {
    if (!currentTenant || filteredData.length === 0 || isExportingLeads) return;

    setIsExportingLeads(true);
    const toastId = toast.loading('Exportando dados de leads de todas as campanhas...');
    try {
      const campaignPromises = filteredData.map(async (camp) => {
        try {
          const [enrichedQueue, agentLeadsRes] = await Promise.all([
            api.getEnrichedOutboundQueue(currentTenant.id, camp.campaignId),
            supabase
              .from('agent_leads')
              .select('whatsapp, identifier, name, status, metadata')
              .eq('tenant_id', currentTenant.id)
              .eq('campaign_id', camp.campaignId)
          ]);

          const agentLeadsData = agentLeadsRes.data || [];
          const agentLeadByPhone = new Map<string, any>();
          const agentLeadByIdentifier = new Map<string, any>();

          for (const al of agentLeadsData) {
            if (al.whatsapp) {
              const cleanPhone = String(al.whatsapp).replace(/\D/g, '');
              agentLeadByPhone.set(cleanPhone, al);
              if (cleanPhone.length >= 10) {
                agentLeadByPhone.set(cleanPhone.slice(-8), al);
                agentLeadByPhone.set(cleanPhone.slice(-9), al);
              }
            }
            if (al.identifier) {
              agentLeadByIdentifier.set(String(al.identifier).replace(/\D/g, ''), al);
            }
          }

          return (enrichedQueue || []).map((q: any) => {
            const cleanPhone = String(q.contactPhone || q.contact_phone || '').replace(/\D/g, '');
            const cleanCnpj = String(q.cnpj || '').replace(/\D/g, '');
            const matchedLead = 
              agentLeadByIdentifier.get(cleanCnpj) || 
              agentLeadByPhone.get(cleanPhone) || 
              agentLeadByPhone.get(cleanPhone.slice(-9)) || 
              agentLeadByPhone.get(cleanPhone.slice(-8)) || null;

            const meta = matchedLead?.metadata || q.metadata || {};
            const queueMeta = q.metadata || {};
            const leadMeta = matchedLead?.metadata || {};

            const qStatus = String(q.status || '').toLowerCase().trim();
            const fiservSt = String(meta.fiserv_status || matchedLead?.status || '').toLowerCase().trim();
            const formalSt = String(meta.formalization_status || '').toLowerCase().trim();
            const pipelineStage = String(meta.pipeline_stage || '').toLowerCase().trim();

            // 1. Envio da Campanha
            const isCarregado = true;
            const isEnviado = Boolean(
              !['queued', 'pending', 'scheduled', 'draft'].includes(qStatus) ||
              q.response_detected ||
              q.responseDetected ||
              qStatus === 'converted' ||
              queueMeta.converted === 'true' ||
              q.sentAt ||
              q.sent_at
            );

            const isEntregue = Boolean(
              ['sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu'].includes(qStatus) ||
              q.response_detected ||
              q.responseDetected ||
              qStatus === 'converted' ||
              queueMeta.converted === 'true'
            );

            const isLida = Boolean(
              ['read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu'].includes(qStatus) ||
              q.response_detected ||
              q.responseDetected ||
              qStatus === 'converted' ||
              queueMeta.converted === 'true'
            );

            const isAutoReply = 
              queueMeta.is_auto_reply === true || 
              queueMeta.is_auto_reply === 'true' || 
              leadMeta.is_auto_reply === true || 
              leadMeta.is_auto_reply === 'true' ||
              queueMeta.is_bot === true ||
              queueMeta.is_bot === 'true';

            const isResponded = Boolean(
              q.response_detected || 
              q.responseDetected || 
              queueMeta.responded === 'true' || 
              queueMeta.responded === true || 
              ['respondida', 'interagiu'].includes(qStatus)
            );

            // 2. Funil de Venda
            const hasOptIn = Boolean(
              meta.opt_in === true || 
              meta.opt_in === 'true' || 
              meta.optin === true || 
              meta.optin === 'true' || 
              meta.consent?.opt_in === true || 
              meta.fiserv_requested_at || 
              meta.loan_request_id || 
              ['approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled'].includes(fiservSt) || 
              ['approved', 'aprovado', 'denied', 'recusado', 'reprovado'].includes(String(matchedLead?.status || '').toLowerCase().trim())
            );

            const rawRev = meta.revenue || meta.faturamento;
            const hasFaturamento = Boolean(rawRev || hasOptIn);

            const reqAmt = meta.requested_amount || meta.valor_inicial;
            const hasValidAmount = Boolean(
              reqAmt && 
              !isNaN(Number(String(reqAmt).replace(/[^\d.-]/g, ''))) &&
              Number(String(reqAmt).replace(/[^\d.-]/g, '')) >= 10000 &&
              Number(String(reqAmt).replace(/[^\d.-]/g, '')) <= 500000
            ) || Boolean(meta.simulation_data?.amount || meta.fiserv_amount_approved);

            const hasValorInicial = Boolean((hasFaturamento && hasValidAmount) || hasOptIn);

            const hasIdentityConfirmed = Boolean(
              ['true', 't', '1', true].includes(meta.identity_confirmed) || 
              ['true', 't', '1', true].includes(meta.cnpj_confirmed) || 
              hasFaturamento
            );

            const isInteragiram = Boolean(hasIdentityConfirmed || (isResponded && !isAutoReply));

            const isAprovado = Boolean(
              ['approved', 'in_quoting', 'comite_approved'].includes(fiservSt) || 
              ['approved', 'aprovado'].includes(String(matchedLead?.status || '').toLowerCase().trim())
            );

            const isRecusado = Boolean(
              ['denied', 'fails_to_process', 'lost', 'cancelled'].includes(fiservSt) || 
              ['denied', 'recusado', 'reprovado'].includes(String(matchedLead?.status || '').toLowerCase().trim())
            );

            const isSimularam = Boolean(
              !isRecusado && (
                meta.simulation_data?.installment_value != null ||
                meta.simulation_data?.installments != null ||
                meta.simulation_data?.monthly_interest != null ||
                (meta.simularam === true && String(meta.fiserv_last_status || '').toLowerCase() === 'success') ||
                meta.simulation_accepted === true ||
                meta.ok_agente === true ||
                meta.accepted_proposal != null ||
                meta.formalized_at != null
              )
            );

            const isOkAgente = Boolean(
              !isRecusado && (
                meta.simulation_accepted === true ||
                meta.ok_agente === true ||
                meta.accepted_proposal != null ||
                meta.formalized_at != null
              )
            );

            // 3. Funil de Formalização
            const isFormalizationLost = Boolean(
              ['lost', 'cancelled', 'declined', 'desistente', 'recusado'].includes(formalSt) ||
              ['declined', 'lost'].includes(pipelineStage) ||
              ['lost', 'cancelled', 'declined'].includes(String(matchedLead?.status || '').toLowerCase().trim()) ||
              String(meta.fiserv_external_status || '').toLowerCase().includes('desistiu') ||
              meta.decline_at != null ||
              meta.decline_reason != null
            );

            const isFormalizado = Boolean(
              ['formalized', 'formalizado', 'won', 'concluido'].includes(formalSt) ||
              pipelineStage === 'contract_signed' ||
              fiservSt === 'won' ||
              meta.formalized_at != null
            );

            const isEmAtendimento = Boolean(
              ['in_service', 'em_atendimento', 'in_progress', 'formalization'].includes(formalSt) ||
              ['in_contact', 'proposal_sent'].includes(pipelineStage)
            );

            const isFormalizacaoDesistencia = Boolean(isOkAgente && isFormalizationLost);
            const isFormalizacaoFormalizado = Boolean(isOkAgente && !isFormalizationLost && isFormalizado);
            const isFormalizacaoEmAtendimento = Boolean(isOkAgente && !isFormalizationLost && !isFormalizado && isEmAtendimento);
            const isFormalizacaoAguarContato = Boolean(isOkAgente && !isFormalizationLost && !isFormalizado && !isEmAtendimento);

            // Determinar status sintético
            let displayStatus = 'Pendente';
            if (isFormalizacaoFormalizado) {
              displayStatus = 'Formalizado';
            } else if (isFormalizacaoEmAtendimento) {
              displayStatus = 'Em Atendimento';
            } else if (isFormalizacaoAguarContato) {
              displayStatus = 'Aguardando Contato';
            } else if (isAprovado) {
              displayStatus = 'Aprovado';
            } else if (isRecusado || isFormalizacaoDesistencia) {
              displayStatus = 'Recusado';
            } else if (hasOptIn) {
              displayStatus = 'Opt-in';
            } else if (isLida) {
              displayStatus = 'Lida';
            } else if (isEntregue) {
              displayStatus = 'Entregue';
            } else if (['failed', 'erro', 'not_delivered', 'rejected', 'rejeitada'].includes(qStatus)) {
              displayStatus = 'Não Entregue';
            }

            const rawCnpj = q.cnpj || meta?.cnpj || meta?.identifier || matchedLead?.identifier || matchedLead?.metadata?.cnpj || '-';
            const leadName = q.establishmentName || q.establishment_name || matchedLead?.name || meta?.razao_social || meta?.nomeLoja || q.contactName || q.contact_name || 'Sem Nome';

            let dataEnvio = '-';
            const rawSentAt = q.sentAt || q.sent_at;
            if (rawSentAt) {
              try {
                const d = new Date(rawSentAt);
                if (!isNaN(d.getTime())) {
                  dataEnvio = format(d, 'dd/MM/yyyy HH:mm');
                }
              } catch {
                dataEnvio = '-';
              }
            }

            return {
              'Campanha': camp.campaignName || '-',
              'CNPJ': rawCnpj,
              'WhatsApp': q.contactPhone || q.contact_phone || '-',
              'Razão Social': leadName,
              'Data de Envio': dataEnvio,
              'Status Atual': displayStatus,
              // Envio da Campanha
              'Carregados': isCarregado ? 'Sim' : 'Não',
              'Enviados': isEnviado ? 'Sim' : 'Não',
              'Entregues': isEntregue ? 'Sim' : 'Não',
              'Lidas': isLida ? 'Sim' : 'Não',
              'Interagiram': isInteragiram ? 'Sim' : 'Não',
              // Funil de Venda
              'Confirmaram': hasIdentityConfirmed ? 'Sim' : 'Não',
              'Faturamento': hasFaturamento ? 'Sim' : 'Não',
              'Valor Faturamento': rawRev || '-',
              'Valor Inicial': hasValorInicial ? 'Sim' : 'Não',
              'Valor Solicitado': reqAmt || '-',
              'Opt-in': hasOptIn ? 'Sim' : 'Não',
              'Aprovados': isAprovado ? 'Sim' : 'Não',
              'Recusados': isRecusado ? 'Sim' : 'Não',
              'Simularam': isSimularam ? 'Sim' : 'Não',
              'OK Agente': isOkAgente ? 'Sim' : 'Não',
              // Funil de Formalização
              'Aguar. Contato': isFormalizacaoAguarContato ? 'Sim' : 'Não',
              'Em Atendimento': isFormalizacaoEmAtendimento ? 'Sim' : 'Não',
              'Formalizado': isFormalizacaoFormalizado ? 'Sim' : 'Não',
              'Desistência': isFormalizacaoDesistencia ? 'Sim' : 'Não',
              // Extras
              'Status Fiserv': fiservSt || '-'
            };
          });
        } catch (campErr) {
          console.error(`Erro ao carregar leads da campanha ${camp.campaignName}:`, campErr);
          return [];
        }
      });

      const results = await Promise.all(campaignPromises);
      const allRows = results.flat();

      if (allRows.length === 0) {
        toast.info('Nenhum lead encontrado nas campanhas selecionadas.', { id: toastId });
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(allRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      const fileName = `leads_campanhas_credito_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success(`${allRows.length} leads exportados com sucesso!`, { id: toastId });
    } catch (err) {
      console.error('Erro na exportação consolidada de leads:', err);
      toast.error('Ocorreu um erro ao exportar os leads das campanhas.', { id: toastId });
    } finally {
      setIsExportingLeads(false);
    }
  };

  // Se uma campanha foi selecionada, exibe a visualização detalhada com consistência estrita
  if (selectedCampaignId) {
    const selectedStat = funnelData.find(d => d.campaignId === selectedCampaignId);
    return (
      <CreditCampaignDetailView
        campaignId={selectedCampaignId}
        campaignStat={selectedStat}
        allCampaignStats={funnelData}
        onSelectCampaign={(id) => setSelectedCampaignId(id)}
        onBack={() => setSelectedCampaignId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-800 shadow-inner">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest text-emerald-700 uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Auditoria & Faturamento
              </span>
              <span className="text-xs text-muted-foreground">• Jornada Nativa WhatsApp</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1">
              Funil Executivo de Crédito
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            disabled={filteredData.length === 0}
            className="h-9 gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border-slate-200 shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Resumo (XLS)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportAllLeadsToExcel}
            disabled={filteredData.length === 0 || isExportingLeads}
            className="h-9 gap-2 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/80 border-emerald-200 shadow-sm transition-all"
          >
            {isExportingLeads ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>Exportando Leads...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Exportar Leads (Excel)</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPI Cards — Macro Conversões */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Taxa de Entrega (Envio - Azul) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taxa de Entrega</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-800">{deliveryRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.entregues.toLocaleString('pt-BR')} entregues</span>
          </div>
          <Progress value={Number(deliveryRate)} className="h-1.5 mt-3 bg-blue-50" indicatorClassName="bg-blue-600" />
        </div>

        {/* 2. Engajamento (Envio - Índigo/Azul) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engajamento (Respostas)</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-blue-700">{responseRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.interagiram.toLocaleString('pt-BR')} respostas</span>
          </div>
          <Progress value={Number(responseRate)} className="h-1.5 mt-3 bg-blue-50" indicatorClassName="bg-blue-700" />
        </div>

        {/* 3. Conversão em Opt-in (Venda - Esmeralda/Verde) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conversão em Opt-in</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-600">{optInRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.optIn.toLocaleString('pt-BR')} aceites</span>
          </div>
          <Progress value={Number(optInRate)} className="h-1.5 mt-3 bg-emerald-50" indicatorClassName="bg-emerald-600" />
        </div>

        {/* 4. Aprovação de Crédito (Venda - Verde Esmeralda) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aprovação de Crédito</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-700">{approvalRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.aprovados.toLocaleString('pt-BR')} aprovados</span>
          </div>
          <Progress value={Number(approvalRate)} className="h-1.5 mt-3 bg-emerald-50" indicatorClassName="bg-emerald-600" />
        </div>

        {/* 5. Formalizados (Funil de Formalização - Vinho/Dourado/Verde de Sucesso) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Formalizados (Final)</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-700">{totals.formalizado.toLocaleString('pt-BR')}</span>
            <span className="text-[11px] text-emerald-600 font-bold">{formalizationRate}% do total</span>
          </div>
          <Progress value={Math.min(Number(formalizationRate) * 10, 100)} className="h-1.5 mt-3 bg-emerald-50" indicatorClassName="bg-emerald-600" />
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-border/40 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-3 flex-1">
          {/* Busca por nome */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome de campanha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#E5003A] text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Filtro por Agente */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="h-8 text-xs min-w-[200px] sm:w-[260px] bg-slate-50 border-slate-200 text-slate-700">
                <div className="flex items-center gap-2 truncate">
                  <Bot className="w-3.5 h-3.5 text-[#E5003A] shrink-0" />
                  <SelectValue placeholder="Selecione o agente..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="font-semibold text-slate-700">Todos os Agentes (Geral)</span>
                </SelectItem>
                {agents.map((ag) => (
                  <SelectItem key={ag.id} value={ag.id}>
                    <span className="truncate">{ag.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filtro de Tempo */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-end lg:self-auto shrink-0">
          <Button
            variant={timeFilter === '15days' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('15days')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === '15days' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            15 Dias
          </Button>
          <Button
            variant={timeFilter === '30days' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('30days')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === '30days' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            30 Dias
          </Button>
          <Button
            variant={timeFilter === '90days' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('90days')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === '90days' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            90 Dias
          </Button>
          <Button
            variant={timeFilter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('all')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === 'all' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            Tudo
          </Button>
        </div>
      </div>

      {/* Tabela do Funil Completo (Fiel à Planilha Modelo) */}
      <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            {/* Header Nível 1 — Macro Grupos */}
            <thead>
              <tr className="border-b border-slate-200">
                <th colSpan={2} className="px-4 py-3 bg-slate-100/70 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-r border-slate-200">
                  Identificação da Campanha
                </th>
                <th colSpan={5} className="px-4 py-3 bg-blue-50/80 text-blue-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-blue-100">
                  Envio da Campanha
                </th>
                <th colSpan={8} className="px-4 py-3 bg-emerald-50/80 text-emerald-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-emerald-100">
                  Funil de Venda
                </th>
                <th colSpan={4} className="px-4 py-3 bg-purple-50/80 text-purple-900 font-bold uppercase tracking-wider text-[11px] text-center">
                  Funil de Formalização
                </th>
              </tr>

              {/* Header Nível 2 — Colunas Individuais */}
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                <th className="px-4 py-2.5">Campanha</th>
                <th className="px-2 py-2.5 text-center border-r border-slate-200">Início</th>
                
                {/* Envio */}
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Carregados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Enviados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Entregues</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Lidas</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950 border-r border-blue-100">Interagiram</th>

                {/* Venda */}
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Confirmaram</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Faturamento</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Valor Inicial</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Opt-in</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Aprovados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Recusados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Simularam</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950 border-r border-emerald-100">OK Agente</th>

                {/* Formalização */}
                <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Aguar. Contato</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Em Atendimento</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Formalizado</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-rose-950">Desistência</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={19} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Carregando métricas consolidadas do funil...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Nenhuma campanha encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const isActive = row.status === 'active' || row.status === 'running';
                  return (
                    <tr 
                      key={row.campaignId}
                      onClick={() => {
                        setSelectedCampaignId(row.campaignId);
                        sessionStorage.setItem('davos_active_campaign_id', row.campaignId);
                        onSelectCampaign?.(row.campaignId);
                      }}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                    >
                      {/* Identificação com Bolinha de Status antes do Nome */}
                      <td className="px-4 py-3 font-semibold text-slate-900 max-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span 
                            title={isActive ? 'Campanha Ativa' : `Status: ${row.status}`}
                            className={cn(
                              "w-2.5 h-2.5 rounded-full shrink-0 shadow-sm transition-all",
                              isActive 
                                ? "bg-emerald-500 ring-2 ring-emerald-100" 
                                : "bg-slate-300 ring-2 ring-slate-100"
                            )} 
                          />
                          <span className="truncate">{row.campaignName}</span>
                          {(campaignTypes[row.campaignId] === 'pre_approved' || (row as any).campaignType === 'pre_approved') && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 text-[9px] px-1.5 py-0 font-medium shrink-0">
                              Pré-Aprovado
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-slate-500 text-[11px] border-r border-slate-200">
                        {row.startDate ? format(row.startDate, 'dd/MM/yyyy') : '-'}
                      </td>

                      {/* Envio */}
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.carregados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.enviados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.entregues.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.lidas.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-blue-700 bg-blue-50/40 border-r border-blue-100">
                        {row.interagiram.toLocaleString('pt-BR')}
                      </td>

                      {/* Venda */}
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{(row.confirmaram || 0).toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.faturamento.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.valorInicial.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.optIn.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">{row.aprovados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-50/20">{row.recusados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.simularam.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/40 border-r border-emerald-100">
                        {row.okAgente.toLocaleString('pt-BR')}
                      </td>

                      {/* Formalização */}
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-purple-50/20">{row.aguarContato.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-indigo-700 bg-purple-50/30">{row.emAtendimento.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-black text-emerald-700 bg-purple-50/40">
                        {row.formalizado.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-rose-50/30">
                        {(row.desistencia || 0).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Linha de Totais Gerais Consolidados */}
            {filteredData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-[11px] border-r border-slate-300">
                    Total Consolidado ({filteredData.length} Campanhas)
                  </td>

                  
                  {/* Envio */}
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.carregados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.enviados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.entregues.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.lidas.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-blue-900 bg-blue-100/70 border-r border-blue-200">
                    {totals.interagiram.toLocaleString('pt-BR')}
                  </td>

                  {/* Venda */}
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.confirmaram.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.faturamento.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.valorInicial.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.optIn.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">{totals.aprovados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono text-rose-700 bg-emerald-100/40">{totals.recusados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.simularam.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-emerald-900 bg-emerald-100/70 border-r border-emerald-200">
                    {totals.okAgente.toLocaleString('pt-BR')}
                  </td>

                  {/* Formalização */}
                  <td className="px-2.5 py-3 text-right font-mono bg-purple-100/40">{totals.aguarContato.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono text-indigo-900 bg-purple-100/60">{totals.emAtendimento.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-emerald-700 bg-purple-100/80">
                    {totals.formalizado.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-2.5 py-3 text-right font-mono text-rose-700 bg-rose-100/60">
                    {totals.desistencia.toLocaleString('pt-BR')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
