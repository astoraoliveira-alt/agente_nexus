import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Eye,
  MessagesSquare,
  Clock,
  Filter,
  Activity,
  Hash,
  Phone,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  X,
  Target,
  User,
  MessageSquare,
  UserCheck,
  Calculator,
  DollarSign,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { CreditCampaignFunnelStat, Agent, Campaign, Message } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WhatsAppView } from '@/components/conversations/WhatsAppView';
import { supabase } from '@/lib/supabase';

interface LeadDetailRow {
  id: string;
  cnpj: string;
  whatsapp: string;
  name: string;
  contactName: string;
  establishmentName: string | null;
  conversationId: string | null;
  status: string;
  deliveryStatus: string;
  rawStatus: string;
  hasInteracted: boolean;
  revenue?: number | null;
  requestedAmount?: number | null;
  optIn?: boolean;
  fiservStatus?: string | null;
  formalizationStatus?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
  stages?: any;
}

interface CreditCampaignDetailViewProps {
  campaignId: string;
  campaignStat?: CreditCampaignFunnelStat;
  allCampaignStats?: CreditCampaignFunnelStat[];
  onSelectCampaign?: (id: string) => void;
  onBack: () => void;
}

export function CreditCampaignDetailView({
  campaignId,
  campaignStat: initialStat,
  allCampaignStats = [],
  onSelectCampaign,
  onBack
}: CreditCampaignDetailViewProps) {
  const { currentTenant } = useApp();
  const { toast } = useToast();
  const [currentStat, setCurrentStat] = useState<CreditCampaignFunnelStat | null>(initialStat || null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leads, setLeads] = useState<LeadDetailRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingConversations, setIsExportingConversations] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadDetailRow | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[] | null>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: 'cnpj' | 'whatsapp' | 'name' | 'status' | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });

  // Sincronizar stat se mudar via prop
  useEffect(() => {
    if (initialStat && initialStat.campaignId === campaignId) {
      setCurrentStat(initialStat);
    }
  }, [initialStat, campaignId]);

  // Carregar dados da campanha e leads
  useEffect(() => {
    if (currentTenant && campaignId) {
      loadCampaignDetail();
    }
  }, [currentTenant, campaignId]);

  const loadCampaignDetail = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      // 1. Carregar estatísticas precisas da campanha
      const [statsList, campaignsList, agentsList] = await Promise.all([
        api.getCreditCampaignFunnelStats(currentTenant.id, [campaignId]),
        api.getCampaigns(currentTenant.id),
        api.getAgents(currentTenant.id)
      ]);

      if (statsList && statsList.length > 0) {
        setCurrentStat(statsList[0]);
      }
      setCampaigns(campaignsList || []);
      setAgents(agentsList || []);

      // 2. Carregar filas enriquecidas e relacionar com agent_leads e handoff_requests
      const [enrichedQueue, agentLeadsRes, handoffRes] = await Promise.all([
        api.getEnrichedOutboundQueue(currentTenant.id, campaignId as any),
        supabase
          .from('agent_leads')
          .select('id, whatsapp, identifier, name, status, metadata, created_at')
          .eq('tenant_id', currentTenant.id)
          .eq('campaign_id', campaignId),
        supabase
          .from('handoff_requests')
          .select('id, status, conversation_id, metadata')
          .eq('tenant_id', currentTenant.id)
          .in('status', ['pending', 'in_progress'])
      ]);

      const agentLeadsData = agentLeadsRes.data || [];
      const handoffData = handoffRes.data || [];
      const agentLeadByPhone = new Map<string, any>();
      const agentLeadByIdentifier = new Map<string, any>();
      const handoffByConvId = new Map<string, any>();
      const handoffByPhone = new Map<string, any>();

      const getPhoneVariantsList = (phone?: string | null): string[] => {
        if (!phone) return [];
        const clean = String(phone).replace(/\D/g, '');
        if (!clean) return [];
        const variants = new Set<string>();
        variants.add(clean);
        const without55 = clean.startsWith('55') ? clean.slice(2) : clean;
        variants.add(without55);
        variants.add(`55${without55}`);
        if (without55.length === 11) {
          const ddd = without55.slice(0, 2);
          const rest = without55.slice(3);
          variants.add(`${ddd}${rest}`);
          variants.add(`55${ddd}${rest}`);
        } else if (without55.length === 10) {
          const ddd = without55.slice(0, 2);
          const rest = without55.slice(2);
          variants.add(`${ddd}9${rest}`);
          variants.add(`55${ddd}9${rest}`);
        }
        return Array.from(variants);
      };

      for (const al of agentLeadsData) {
        if (al.whatsapp) {
          for (const v of getPhoneVariantsList(al.whatsapp)) {
            agentLeadByPhone.set(v, al);
          }
        }
        const idf = al.identifier ? String(al.identifier).replace(/\D/g, '') : '';
        if (idf) agentLeadByIdentifier.set(idf, al);
        const metaCnpj = al.metadata?.cnpj ? String(al.metadata.cnpj).replace(/\D/g, '') : '';
        if (metaCnpj) agentLeadByIdentifier.set(metaCnpj, al);
        const metaId = al.metadata?.identifier ? String(al.metadata.identifier).replace(/\D/g, '') : '';
        if (metaId) agentLeadByIdentifier.set(metaId, al);
      }

      for (const hr of handoffData) {
        if (hr.conversation_id) handoffByConvId.set(hr.conversation_id, hr);
        const hPhone = hr.metadata?.phone || hr.metadata?.whatsapp || hr.metadata?.contact_phone;
        if (hPhone) {
          for (const v of getPhoneVariantsList(hPhone)) {
            handoffByPhone.set(v, hr);
          }
        }
      }

      const matchedAgentLeadIds = new Set<string>();

      // Mapear Leads combinando status de entrega e funil
      const mappedLeads: LeadDetailRow[] = (enrichedQueue || []).map((q: any) => {
        const rawPhone = q.contactPhone || q.contact_phone;
        const qVariants = getPhoneVariantsList(rawPhone);
        const cleanCnpj = String(q.cnpj || q.metadata?.cnpj || q.metadata?.identifier || '').replace(/\D/g, '');

        let matchedLead: any = null;
        if (cleanCnpj && agentLeadByIdentifier.has(cleanCnpj)) {
          matchedLead = agentLeadByIdentifier.get(cleanCnpj);
        } else {
          for (const v of qVariants) {
            if (agentLeadByPhone.has(v)) {
              matchedLead = agentLeadByPhone.get(v);
              break;
            }
          }
        }

        if (matchedLead?.id) {
          matchedAgentLeadIds.add(matchedLead.id);
        }

        const meta = matchedLead?.metadata || q.metadata || {};
        const qStatus = String(q.status || '').toLowerCase().trim();
        const fiservSt = String(meta.fiserv_status || matchedLead?.status || '').toLowerCase().trim();
        const formalSt = String(meta.formalization_status || '').toLowerCase().trim();
        const extSt = String(meta.fiserv_external_status || '').toLowerCase().trim();

        // Handoff / Transbordo para especialista (Opção A)
        const leadConvId = q.conversationId || q.conversation_id || meta.conversation_id;
        let leadHandoff = leadConvId ? handoffByConvId.get(leadConvId) : null;
        if (!leadHandoff) {
          for (const v of qVariants) {
            if (handoffByPhone.has(v)) {
              leadHandoff = handoffByPhone.get(v);
              break;
            }
          }
        }
        const isHandoffPending = Boolean(
          leadHandoff?.status === 'pending' ||
          meta.handoff_requested === true ||
          meta.handoff_requested === 'true' ||
          meta.falar_agente === true ||
          meta.falar_agente === 'true' ||
          ['waiting_contact', 'aguar_contato'].includes(formalSt)
        );
        const isHandoffInProgress = Boolean(
          leadHandoff?.status === 'in_progress' ||
          ['in_service', 'em_atendimento', 'in_progress', 'formalization'].includes(formalSt)
        );

        // Aprovado só é válido se tiver aprovação real e não for explicitamente reprovado
        const isApprovedLead = Boolean(
          (
            ['approved', 'comite_approved', 'aprovado', 'pre_approved'].includes(fiservSt) ||
            ['approved', 'aprovado'].includes(String(matchedLead?.status || '').toLowerCase().trim()) ||
            ['approved', 'aprovado'].includes(qStatus) ||
            meta.fiserv_is_approved === true ||
            Boolean(meta.fiserv_amount_approved && !isNaN(Number(meta.fiserv_amount_approved)) && Number(meta.fiserv_amount_approved) > 0) ||
            (extSt.includes('aprovado') && !extSt.includes('reprovad'))
          ) &&
          !['denied', 'recusado', 'reprovado'].includes(String(matchedLead?.status || '').toLowerCase().trim()) &&
          !['denied', 'recusado', 'reprovado'].includes(fiservSt) &&
          !extSt.includes('não conseguimos') &&
          !extSt.includes('nao conseguimos') &&
          !extSt.includes('reprovad') &&
          !meta.lost_reason
        );

        // Precedência de Recusa Fiserv (crédito não aprovado / reprovado):
        // Nota: se o lead for aprovado ou pré-aprovado, NÃO é recusa de crédito.
        const isRefusedLead = Boolean(
          !isApprovedLead && (
            meta.lost_reason ||
            meta.refusal_reason ||
            ['denied', 'fails_to_process', 'lost', 'recusado', 'reprovado', 'declined'].includes(fiservSt) ||
            ['denied', 'recusado', 'reprovado'].includes(String(matchedLead?.status || '').toLowerCase().trim()) ||
            ['denied', 'recusado', 'reprovado'].includes(qStatus) ||
            extSt.includes('reprovad') ||
            extSt.includes('recusad') ||
            extSt.includes('não conseguimos') ||
            extSt.includes('nao conseguimos')
          )
        );

        // Determinar status exibido de acordo com a esteira do funil (Opção A)
        let displayStatus = 'Pendente';
        if (['formalized', 'formalizado', 'won', 'concluido'].includes(formalSt) || fiservSt === 'won' || meta.formalized_at) {
          displayStatus = 'Formalizado';
        } else if (['lost', 'cancelled', 'declined', 'desistente', 'recusado_cliente'].includes(formalSt) || extSt.includes('desistiu')) {
          displayStatus = 'Desistência';
        } else if (isHandoffInProgress) {
          displayStatus = 'Em Atendimento';
        } else if (isHandoffPending) {
          displayStatus = 'Aguardando Contato';
        } else if (isRefusedLead) {
          displayStatus = 'Recusado';
        } else if (isApprovedLead) {
          displayStatus = 'Aprovado';
        } else if (
          meta.simulation_data?.installment_value != null ||
          meta.simulation_data?.installments != null ||
          meta.simulation_data?.monthly_interest != null ||
          (meta.simularam === true && String(meta.fiserv_last_status || '').toLowerCase() === 'success')
        ) {
          displayStatus = 'Simulou';
        } else if (
          meta.opt_in === true || meta.opt_in === 'true' ||
          meta.optin === true || meta.optin === 'true' ||
          meta.consent?.opt_in === true ||
          meta.loan_request_id ||
          ['in_quoting', 'in_progress', 'comite'].includes(fiservSt)
        ) {
          displayStatus = 'Opt-in';
        } else if (meta.revenue || meta.faturamento) {
          displayStatus = 'Faturamento Informado';
        } else if (meta.requested_amount || meta.valor_inicial) {
          displayStatus = 'Valor Informado';
        } else if (['true', 't', '1', true].includes(meta.identity_confirmed) || ['true', 't', '1', true].includes(meta.cnpj_confirmed)) {
          displayStatus = 'Confirmou Identidade';
        } else if (q.response_detected || q.responseDetected || ['read', 'lida'].includes(qStatus)) {
          displayStatus = 'Lida';
        } else if (['delivered', 'entregue', 'sent', 'enviada'].includes(qStatus)) {
          displayStatus = 'Entregue';
        } else if (['failed', 'erro', 'not_delivered', 'rejected', 'rejeitada'].includes(qStatus)) {
          displayStatus = 'Não Entregue';
        }

        const rawCnpj = q.cnpj || meta?.cnpj || meta?.identifier || matchedLead?.identifier || matchedLead?.metadata?.cnpj || '-';
        const leadName = q.establishmentName || matchedLead?.name || meta?.razao_social || meta?.nomeLoja || q.contactName || 'Sem Nome';

        // Lógica de Interação com expurgo de robô e garantia de avanço no funil
        const queueMeta = q.metadata || {};
        const leadMeta = matchedLead?.metadata || {};
        const isAutoReply = q.is_auto_reply === true ||
                            queueMeta.is_auto_reply === true || 
                            queueMeta.is_auto_reply === 'true' || 
                            leadMeta.is_auto_reply === true || 
                            leadMeta.is_auto_reply === 'true' ||
                            queueMeta.is_bot === true ||
                            queueMeta.is_bot === 'true' ||
                            meta.is_auto_reply === true ||
                            meta.is_auto_reply === 'true' ||
                            meta.circuit_breaker === true ||
                            meta.stop_flow === true;

        const isResponded = Boolean(
          q.response_detected || 
          q.responseDetected || 
          queueMeta.responded === 'true' || 
          queueMeta.responded === true || 
          ['respondida', 'interagiu'].includes(qStatus)
        );

        const hasAdvancedInFunnel = Boolean(
          leadMeta.identity_confirmed || 
          leadMeta.cnpj_confirmed || 
          leadMeta.revenue || 
          leadMeta.faturamento || 
          leadMeta.opt_in || 
          leadMeta.optin || 
          leadMeta.consent?.opt_in || 
          leadMeta.fiserv_status || 
          matchedLead?.status === 'approved' || 
          matchedLead?.status === 'denied' ||
          ['Opt-in', 'Aprovado', 'Recusado', 'Formalizado', 'Em Atendimento', 'Aguardando Contato'].includes(displayStatus)
        );

        const hasInteracted = !isAutoReply && (hasAdvancedInFunnel || isResponded);

        // Etapas estritas do Funil
        const pipelineStage = String(meta.pipeline_stage || '').toLowerCase().trim();
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

        const hasValorInicial = Boolean(hasValidAmount || hasFaturamento || hasOptIn);

        const hasIdentityConfirmed = !isAutoReply && Boolean(
          ['true', 't', '1', true].includes(meta.identity_confirmed) || 
          ['true', 't', '1', true].includes(meta.cnpj_confirmed) || 
          hasValorInicial ||
          hasFaturamento
        );

        const isInteragiram = !isAutoReply && Boolean(hasIdentityConfirmed || isResponded);

        const isRecusado = isRefusedLead;
        const isAprovado = isApprovedLead;

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
        const isFormalizacaoEmAtendimento = Boolean((isOkAgente || isHandoffPending || isHandoffInProgress) && !isFormalizationLost && !isFormalizado && isEmAtendimento);
        const isFormalizacaoAguarContato = Boolean((isOkAgente || isHandoffPending || isHandoffInProgress) && !isFormalizationLost && !isFormalizado && !isEmAtendimento);

        return {
          id: q.id,
          cnpj: rawCnpj,
          whatsapp: q.contactPhone || q.contact_phone,
          name: leadName,
          contactName: q.contactName || q.contact_name || 'Sem Nome',
          establishmentName: q.establishmentName || q.establishment_name || matchedLead?.name || null,
          conversationId: q.conversationId || q.conversation_id || meta.conversation_id || null,
          status: displayStatus,
          deliveryStatus: qStatus,
          rawStatus: qStatus,
          hasInteracted,
          revenue: meta.revenue || meta.faturamento || null,
          requestedAmount: meta.requested_amount || meta.valor_inicial || null,
          optIn: Boolean(meta.opt_in || meta.consent?.opt_in),
          fiservStatus: fiservSt || null,
          formalizationStatus: formalSt || null,
          sentAt: q.sentAt || q.sent_at || null,
          errorMessage: q.errorMessage || q.error_message || null,
          stages: {
            isCarregado,
            isEnviado,
            isEntregue,
            isLida,
            isInteragiram,
            hasIdentityConfirmed,
            hasFaturamento,
            hasValorInicial,
            hasOptIn,
            isAprovado,
            isRecusado,
            isSimularam,
            isOkAgente,
            isFormalizacaoAguarContato,
            isFormalizacaoEmAtendimento,
            isFormalizacaoFormalizado,
            isFormalizacaoDesistencia
          }
        };
      });

      // Garantir que todos os leads do funil (aprovados / com opt-in) em agent_leads apareçam na listagem
      const unmatchedFunnelLeads = agentLeadsData.filter((al: any) => {
        if (matchedAgentLeadIds.has(al.id)) return false;
        const meta = al.metadata || {};
        const fiservSt = String(meta.fiserv_status || al.status || '').toLowerCase().trim();
        return Boolean(
          meta.opt_in === true || meta.optin === true || meta.consent?.opt_in === true ||
          meta.fiserv_requested_at || meta.loan_request_id ||
          ['approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled'].includes(fiservSt) ||
          ['approved', 'aprovado', 'denied', 'recusado', 'reprovado'].includes(String(al.status || '').toLowerCase().trim())
        );
      });

      unmatchedFunnelLeads.forEach((al: any) => {
        const meta = al.metadata || {};
        const fiservSt = String(meta.fiserv_status || al.status || '').toLowerCase().trim();
        const formalSt = String(meta.formalization_status || '').toLowerCase().trim();
        const extSt = String(meta.fiserv_external_status || '').toLowerCase().trim();
        const isApp = Boolean(
          (
            ['approved', 'comite_approved', 'aprovado', 'pre_approved'].includes(fiservSt) ||
            ['approved', 'aprovado'].includes(String(al.status || '').toLowerCase().trim()) ||
            meta.fiserv_is_approved === true ||
            Boolean(meta.fiserv_amount_approved && !isNaN(Number(meta.fiserv_amount_approved)) && Number(meta.fiserv_amount_approved) > 0) ||
            (extSt.includes('aprovado') && !extSt.includes('reprovad'))
          ) &&
          !['denied', 'recusado', 'reprovado'].includes(String(al.status || '').toLowerCase().trim()) &&
          !['denied', 'recusado', 'reprovado'].includes(fiservSt) &&
          !extSt.includes('não conseguimos') &&
          !extSt.includes('nao conseguimos') &&
          !extSt.includes('reprovad') &&
          !meta.lost_reason
        );

        const isRec = Boolean(
          !isApp && (
            meta.lost_reason ||
            meta.refusal_reason ||
            ['denied', 'fails_to_process', 'lost', 'recusado', 'reprovado', 'declined'].includes(fiservSt) ||
            ['denied', 'recusado', 'reprovado'].includes(String(al.status || '').toLowerCase().trim()) ||
            extSt.includes('reprovad') ||
            extSt.includes('recusad') ||
            extSt.includes('não conseguimos') ||
            extSt.includes('nao conseguimos')
          )
        );

        let dispSt = 'Opt-in';
        if (['formalized', 'formalizado', 'won', 'concluido'].includes(formalSt) || fiservSt === 'won' || meta.formalized_at) {
          dispSt = 'Formalizado';
        } else if (['lost', 'cancelled', 'declined', 'desistente'].includes(formalSt) || extSt.includes('desistiu')) {
          dispSt = 'Desistência';
        } else if (['in_service', 'em_atendimento', 'in_progress'].includes(formalSt)) {
          dispSt = 'Em Atendimento';
        } else if (['waiting_contact', 'aguar_contato', 'pending_docs'].includes(formalSt) || meta.handoff_requested || meta.falar_agente) {
          dispSt = 'Aguardando Contato';
        } else if (isRec) {
          dispSt = 'Recusado';
        } else if (isApp) {
          dispSt = 'Aprovado';
        }

        mappedLeads.push({
          id: al.id || `al-${al.whatsapp}`,
          cnpj: al.identifier || meta.cnpj || '-',
          whatsapp: al.whatsapp,
          name: al.name || 'Lead Aprovado',
          contactName: al.name || 'Lead Aprovado',
          establishmentName: al.name || null,
          conversationId: meta.conversation_id || null,
          status: dispSt,
          deliveryStatus: 'delivered',
          rawStatus: 'delivered',
          hasInteracted: true,
          revenue: meta.revenue || meta.faturamento || null,
          requestedAmount: meta.requested_amount || meta.valor_inicial || null,
          optIn: true,
          fiservStatus: fiservSt || (isApp ? 'approved' : isRec ? 'denied' : null),
          formalizationStatus: formalSt || null,
          sentAt: al.created_at || null,
          errorMessage: null,
          stages: {
            isCarregado: true,
            isEnviado: true,
            isEntregue: true,
            isLida: true,
            isInteragiram: true,
            hasIdentityConfirmed: true,
            hasFaturamento: true,
            hasValorInicial: true,
            hasOptIn: true,
            isAprovado: isApp,
            isRecusado: isRec,
            isSimularam: false,
            isOkAgente: false,
            isFormalizacaoAguarContato: dispSt === 'Aguardando Contato',
            isFormalizacaoEmAtendimento: dispSt === 'Em Atendimento',
            isFormalizacaoFormalizado: dispSt === 'Formalizado',
            isFormalizacaoDesistencia: dispSt === 'Desistência'
          }
        });
      });

      setLeads(mappedLeads);
    } catch (err) {
      console.error('Error loading credit campaign detail data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar histórico de mensagens ao abrir lead
  useEffect(() => {
    if (!selectedLead || !currentTenant) return;

    const cacheKey = `${selectedLead.id}:${selectedLead.whatsapp}`;
    if (cacheKey in messagesCache) {
      setMessages(messagesCache[cacheKey]);
      return;
    }

    setIsMessagesLoading(true);
    const fetchMessages = async () => {
      try {
        let convId = selectedLead.conversationId;
        const cleanPhone = String(selectedLead.whatsapp || '').replace(/\D/g, '');
        const phoneVariants = [
          cleanPhone,
          cleanPhone.startsWith('55') ? cleanPhone.slice(2) : `55${cleanPhone}`,
          cleanPhone.slice(-9),
          cleanPhone.slice(-8)
        ].filter(Boolean);

        console.log('[CreditCampaignDetailView] fetchMessages init:', {
          leadId: selectedLead.id,
          phone: selectedLead.whatsapp,
          initialConvId: convId,
          campaignId,
          phoneVariants
        });

        // 1. Se não temos conversationId direto, checar na tabela outbound_queue se foi salvo
        if (!convId && selectedLead.id) {
          const { data: qData } = await supabase
            .from('outbound_queue')
            .select('conversation_id')
            .eq('id', selectedLead.id)
            .maybeSingle();
          if (qData?.conversation_id) {
            convId = qData.conversation_id;
          }
        }

        // 2. Se ainda não temos, checar na tabela agent_leads pelo telefone ou identifier
        if (!convId && cleanPhone) {
          const { data: alData } = await supabase
            .from('agent_leads')
            .select('metadata')
            .eq('tenant_id', currentTenant.id)
            .or(`whatsapp.in.(${phoneVariants.join(',')}),identifier.eq.${selectedLead.cnpj}`)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (alData && alData.length > 0 && alData[0].metadata?.conversation_id) {
            convId = alData[0].metadata.conversation_id;
          }
        }

        // 3. Se ainda não temos, buscar diretamente na tabela conversations por user_identifier
        if (!convId && phoneVariants.length > 0) {
          const { data: cData } = await supabase
            .from('conversations')
            .select('id')
            .eq('tenant_id', currentTenant.id)
            .in('user_identifier', phoneVariants)
            .order('last_message_at', { ascending: false })
            .limit(1);
          if (cData && cData.length > 0) {
            convId = cData[0].id;
          }
        }

        // 4. Fallback com getConversationAnalytics
        if (!convId && selectedLead.whatsapp) {
          let analytics = await api.getConversationAnalytics(currentTenant.id, {
            phone: selectedLead.whatsapp,
            campaignId: null,
            leadId: selectedLead.id
          });
          convId = analytics?.conversationId || analytics?.id || null;
        }

        console.log('[CreditCampaignDetailView] final resolved convId:', convId);

        if (convId) {
          const msgs = await api.getConversationMessages(convId);
          console.log('[CreditCampaignDetailView] msgs loaded:', msgs?.length);
          setMessages(msgs || []);
          setMessagesCache(prev => ({ ...prev, [cacheKey]: msgs || [] }));
        } else {
          console.warn('[CreditCampaignDetailView] Nenhuma conversa vinculada para o lead:', selectedLead);
          setMessages([]);
        }
      } catch (e) {
        console.error('Error fetching messages for lead:', e);
        setMessages([]);
      } finally {
        setIsMessagesLoading(false);
      }
    };

    fetchMessages();
  }, [selectedLead, currentTenant]);

  useEffect(() => {
    if (campaignId) {
      sessionStorage.setItem('davos_active_campaign_id', campaignId);
    }
  }, [campaignId]);

  const selectedCampaign = useMemo(() => {
    return campaigns.find(c => c.id === campaignId) || null;
  }, [campaigns, campaignId]);

  const selectedAgent = useMemo(() => {
    if (!selectedCampaign?.agentId) return null;
    return agents.find(a => a.id === selectedCampaign.agentId) || null;
  }, [agents, selectedCampaign]);

  const isLeadEntregue = (lead: LeadDetailRow): boolean => {
    return Boolean(lead.stages?.isEntregue) ||
           ['Entregue', 'Lida', 'Confirmou Identidade', 'Valor Informado', 'Faturamento Informado', 'Opt-in', 'Simulou', 'Aprovado', 'Recusado', 'Formalizado', 'Em Atendimento', 'Aguardando Contato', 'Desistência'].includes(lead.status) || 
           ['delivered', 'entregue', 'sent', 'enviada', 'read', 'lida'].includes(lead.deliveryStatus) ||
           Boolean(lead.hasInteracted);
  };

  const matchesStatusFilter = (lead: LeadDetailRow, status: string): boolean => {
    if (status === 'Conversas Iniciadas') {
      return Boolean(lead.hasInteracted);
    }
    if (status === 'Entregue') {
      return isLeadEntregue(lead);
    }
    if (status === 'Lida') {
      return Boolean(lead.stages?.isLida) ||
             ['Lida', 'Confirmou Identidade', 'Valor Informado', 'Faturamento Informado', 'Opt-in', 'Simulou', 'Aprovado', 'Recusado', 'Formalizado', 'Em Atendimento', 'Aguardando Contato', 'Desistência'].includes(lead.status) || 
             ['read', 'lida'].includes(lead.deliveryStatus);
    }
    if (status === 'Não Entregue') {
      return !isLeadEntregue(lead);
    }
    if (status === 'Confirmou Identidade') {
      return Boolean(lead.stages?.hasIdentityConfirmed || lead.status === 'Confirmou Identidade');
    }
    if (status === 'Valor Informado') {
      return Boolean(lead.stages?.hasValorInicial || lead.status === 'Valor Informado');
    }
    if (status === 'Faturamento Informado') {
      return Boolean(lead.stages?.hasFaturamento || lead.status === 'Faturamento Informado');
    }
    if (status === 'Opt-in') {
      return Boolean(lead.stages?.hasOptIn || lead.status === 'Opt-in' || lead.optIn);
    }
    if (status === 'Simulou') {
      return Boolean(lead.stages?.isSimularam || lead.status === 'Simulou');
    }
    if (status === 'Aprovado') {
      return Boolean(lead.stages?.isAprovado || lead.status === 'Aprovado');
    }
    if (status === 'Recusado') {
      return Boolean(lead.stages?.isRecusado || lead.status === 'Recusado');
    }
    if (status === 'Aguardando Contato') {
      return Boolean(lead.stages?.isFormalizacaoAguarContato || lead.status === 'Aguardando Contato');
    }
    if (status === 'Em Atendimento') {
      return Boolean(lead.stages?.isFormalizacaoEmAtendimento || lead.status === 'Em Atendimento');
    }
    if (status === 'Formalizado') {
      return Boolean(lead.stages?.isFormalizacaoFormalizado || lead.status === 'Formalizado');
    }
    if (status === 'Desistência') {
      return Boolean(lead.stages?.isFormalizacaoDesistencia || lead.status === 'Desistência');
    }
    return lead.status === status;
  };

  // Status dinâmicos para filtro com contagem
  const statusOptions = useMemo(() => {
    const list = ['Entregue', 'Lida', 'Não Entregue'];
    if (leads.some(l => l.hasInteracted)) list.push('Conversas Iniciadas');
    if (leads.some(l => l.status === 'Confirmou Identidade' || l.stages?.hasIdentityConfirmed)) list.push('Confirmou Identidade');
    if (leads.some(l => l.status === 'Valor Informado' || l.stages?.hasValorInicial)) list.push('Valor Informado');
    if (leads.some(l => l.status === 'Faturamento Informado' || l.stages?.hasFaturamento)) list.push('Faturamento Informado');
    if (leads.some(l => l.status === 'Opt-in' || l.stages?.hasOptIn)) list.push('Opt-in');
    if (leads.some(l => l.status === 'Simulou' || l.stages?.isSimularam)) list.push('Simulou');
    if (leads.some(l => l.stages?.isAprovado || l.status === 'Aprovado')) list.push('Aprovado');
    if (leads.some(l => l.stages?.isRecusado || l.status === 'Recusado')) list.push('Recusado');
    if (leads.some(l => l.stages?.isFormalizacaoAguarContato || l.status === 'Aguardando Contato')) list.push('Aguardando Contato');
    if (leads.some(l => l.stages?.isFormalizacaoEmAtendimento || l.status === 'Em Atendimento')) list.push('Em Atendimento');
    if (leads.some(l => l.stages?.isFormalizacaoFormalizado || l.status === 'Formalizado')) list.push('Formalizado');
    if (leads.some(l => l.stages?.isFormalizacaoDesistencia || l.status === 'Desistência')) list.push('Desistência');
    return list;
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (selectedStatuses.length > 0) {
      result = result.filter(lead => {
        return selectedStatuses.some(status => matchesStatusFilter(lead, status));
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(lead => 
        (lead.name && lead.name.toLowerCase().includes(q)) ||
        (lead.whatsapp && lead.whatsapp.toLowerCase().includes(q)) ||
        (lead.cnpj && lead.cnpj.toLowerCase().includes(q))
      );
    }
    return result;
  }, [leads, selectedStatuses, searchQuery]);

  const sortedLeads = useMemo(() => {
    const items = [...filteredLeads];
    if (sortConfig.key) {
      items.sort((a, b) => {
        const aVal = String(a[sortConfig.key!] || '').toLowerCase();
        const bVal = String(b[sortConfig.key!] || '').toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
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
    // Exportar os dados filtrados/ordenados da tabela se houver filtro ativo, caso contrário todos os leads da campanha
    const targetLeads = sortedLeads.length > 0 ? sortedLeads : leads;
    const campName = currentStat?.campaignName || selectedCampaign?.name || 'campanha';

    const exportData = targetLeads.map(l => {
      let dataEnvio = '-';
      if (l.sentAt) {
        try {
          const d = new Date(l.sentAt);
          if (!isNaN(d.getTime())) {
            dataEnvio = format(d, 'dd/MM/yyyy HH:mm');
          }
        } catch {
          dataEnvio = '-';
        }
      }

      const st = l.stages;

      return {
        'Campanha': campName,
        'CNPJ': l.cnpj || '-',
        'WhatsApp': l.whatsapp || '-',
        'Razão Social': l.name || l.establishmentName || l.contactName || '-',
        'Data de Envio': dataEnvio,
        'Status Atual': l.status || '-',
        // Envio da Campanha
        'Carregados': st?.isCarregado ? 'Sim' : 'Não',
        'Enviados': st?.isEnviado ? 'Sim' : 'Não',
        'Entregues': st?.isEntregue ? 'Sim' : 'Não',
        'Lidas': st?.isLida ? 'Sim' : 'Não',
        'Interagiram': st?.isInteragiram ? 'Sim' : 'Não',
        // Funil de Venda
        'Confirmaram': st?.hasIdentityConfirmed ? 'Sim' : 'Não',
        'Faturamento': st?.hasFaturamento ? 'Sim' : 'Não',
        'Valor Faturamento': l.revenue || '-',
        'Valor Inicial': st?.hasValorInicial ? 'Sim' : 'Não',
        'Valor Solicitado': l.requestedAmount || '-',
        'Opt-in': st?.hasOptIn ? 'Sim' : 'Não',
        'Aprovados': st?.isAprovado ? 'Sim' : 'Não',
        'Recusados': st?.isRecusado ? 'Sim' : 'Não',
        'Simularam': st?.isSimularam ? 'Sim' : 'Não',
        'OK Agente': st?.isOkAgente ? 'Sim' : 'Não',
        // Funil de Formalização
        'Aguar. Contato': st?.isFormalizacaoAguarContato ? 'Sim' : 'Não',
        'Em Atendimento': st?.isFormalizacaoEmAtendimento ? 'Sim' : 'Não',
        'Formalizado': st?.isFormalizacaoFormalizado ? 'Sim' : 'Não',
        'Desistência': st?.isFormalizacaoDesistencia ? 'Sim' : 'Não',
        // Extras
        'Status Fiserv': l.fiservStatus || '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    const fileName = `exportacao_${campName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Funções de Sanitização e Mascaramento de Dados Sensíveis (LGPD)
  const maskPhoneLGPD = (phone?: string | null): string => {
    if (!phone) return '-';
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length < 8) return phone;
    const ddd = clean.startsWith('55') ? clean.slice(2, 4) : clean.slice(0, 2);
    const last4 = clean.slice(-4);
    return `(${ddd}) 9****-${last4}`;
  };

  const maskCnpjLGPD = (cnpj?: string | null): string => {
    if (!cnpj) return '-';
    const clean = String(cnpj).replace(/\D/g, '');
    if (clean.length === 14) {
      return `${clean.slice(0, 2)}.***.***/${clean.slice(8, 12)}-**`;
    }
    if (clean.length === 11) {
      return `${clean.slice(0, 3)}.***.***-${clean.slice(-2)}`;
    }
    return cnpj;
  };

  const maskNameLGPD = (name?: string | null): string => {
    if (!name) return '-';
    const trimmed = name.trim();
    // Se contiver números como CNPJ no início (ex: "30.791.595 FERNANDA MARA RIBEIRO")
    const maskedPrefix = trimmed.replace(/\b\d{2}\.?\d{3}\.?\d{3}\b/g, (match) => {
      const clean = match.replace(/\D/g, '');
      return `${clean.slice(0, 2)}.***.***`;
    });
    
    // Se for nome de pessoa física (sem Ltda, Me, Eireli, S/A, etc), abrevia sobrenomes para privacidade
    const words = maskedPrefix.split(/\s+/);
    if (words.length > 2 && !/(ltda|sa|s\.a\.|eireli|me|epp|cia|comercio|restaurante|bar|padaria|mercado|drogaria|auto)/i.test(name)) {
      return words.map((w, idx) => {
        if (idx === 0) return w;
        if (w.length <= 2) return w; // de, da, do
        return `${w[0]}***`;
      }).join(' ');
    }
    return maskedPrefix;
  };

  const maskSensitiveTextLGPD = (text?: string | null): string => {
    if (!text || typeof text !== 'string') return '';
    let masked = text;

    // 1. Cartão de Crédito (13 a 19 dígitos)
    masked = masked.replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
      const c = match.replace(/\D/g, '');
      if (c.length >= 13 && c.length <= 19) {
        return `****-****-****-${c.slice(-4)}`;
      }
      return match;
    });

    // 2. CPF formatado: 000.000.000-00
    masked = masked.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (cpf) => {
      const c = cpf.replace(/\D/g, '');
      return `${c.slice(0, 3)}.***.***-${c.slice(-2)}`;
    });

    // 3. CNPJ formatado: 00.000.000/0000-00
    masked = masked.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (cnpj) => {
      const c = cnpj.replace(/\D/g, '');
      return `${c.slice(0, 2)}.***.***/${c.slice(8, 12)}-**`;
    });

    // 4. Telefones / WhatsApp (ex: +55 11 98888-7777, (11) 98888-7777, 11988887777)
    masked = masked.replace(/(?:\+?55\s?)?(?:\(?([1-9]{2})\)?\s?)?(?:9\s?)?(\d{4})[-.\s]?(\d{4})/g, (full) => {
      const clean = full.replace(/\D/g, '');
      if (clean.length >= 10 && clean.length <= 13) {
        const area = clean.startsWith('55') ? clean.slice(2, 4) : clean.slice(0, 2);
        const last4 = clean.slice(-4);
        return `(${area}) 9****-${last4}`;
      }
      return full;
    });

    // 5. E-mails
    masked = masked.replace(/\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*([a-zA-Z0-9_.+-])@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g, '$1***$2@$3');

    // 6. Tokens / Parâmetros sensíveis em URLs (?t=..., &token=...)
    masked = masked.replace(/([?&](?:t|token|key|secret)=)[^&\s]+/gi, '$1***TOKEN_OCULTO***');

    return masked;
  };

  const handleExportConversationsLGPD = async () => {
    if (isExportingConversations) return;
    setIsExportingConversations(true);

    const targetLeads = sortedLeads.length > 0 ? sortedLeads : leads;
    const campName = currentStat?.campaignName || selectedCampaign?.name || 'campanha';

    if (targetLeads.length === 0) {
      toast({
        title: "Nenhum lead encontrado",
        description: "Não há leads para exportar nesta campanha.",
        variant: "destructive"
      });
      setIsExportingConversations(false);
      return;
    }

    toast({
      title: "Gerando Exportação de Conversas LGPD",
      description: `Buscando histórico completo de ${targetLeads.length} leads com mascaramento de segurança...`,
    });

    try {
      // 1. Mapear telefones limpos e conversation_ids de todos os leads
      const phoneToLeadMap = new Map<string, LeadDetailRow[]>();
      const convIdToLeadMap = new Map<string, LeadDetailRow[]>();
      const allPhonesSet = new Set<string>();
      const targetConvIds = new Set<string>();

      for (const l of targetLeads) {
        if (l.conversationId) {
          targetConvIds.add(l.conversationId);
          if (!convIdToLeadMap.has(l.conversationId)) {
            convIdToLeadMap.set(l.conversationId, []);
          }
          convIdToLeadMap.get(l.conversationId)!.push(l);
        }

        const rawPhone = l.whatsapp;
        if (rawPhone) {
          const clean = String(rawPhone).replace(/\D/g, '');
          if (clean) {
            allPhonesSet.add(clean);
            const no55 = clean.startsWith('55') ? clean.slice(2) : clean;
            const with55 = clean.startsWith('55') ? clean : `55${clean}`;
            allPhonesSet.add(no55);
            allPhonesSet.add(with55);

            [clean, no55, with55].forEach(p => {
              if (!phoneToLeadMap.has(p)) {
                phoneToLeadMap.set(p, []);
              }
              phoneToLeadMap.get(p)!.push(l);
            });
          }
        }
      }

      // 2. Buscar conversas vinculadas por telefone na tabela conversations (em lotes de 150)
      const phoneArray = Array.from(allPhonesSet);
      const phoneChunkSize = 150;
      for (let i = 0; i < phoneArray.length; i += phoneChunkSize) {
        const chunk = phoneArray.slice(i, i + phoneChunkSize);
        const { data: convData } = await supabase
          .from('conversations')
          .select('id, user_identifier')
          .in('user_identifier', chunk);

        if (convData && convData.length > 0) {
          for (const c of convData) {
            targetConvIds.add(c.id);
            if (c.user_identifier && phoneToLeadMap.has(c.user_identifier)) {
              if (!convIdToLeadMap.has(c.id)) {
                convIdToLeadMap.set(c.id, []);
              }
              const matchingLeads = phoneToLeadMap.get(c.user_identifier)!;
              for (const ml of matchingLeads) {
                if (!convIdToLeadMap.get(c.id)!.includes(ml)) {
                  convIdToLeadMap.get(c.id)!.push(ml);
                }
              }
            }
          }
        }
      }

      // 3. Buscar mensagens de todos os conversation IDs em lotes de 150
      const convIdArray = Array.from(targetConvIds);
      const messagesByLeadId = new Map<string, any[]>();
      const convChunkSize = 150;

      for (let i = 0; i < convIdArray.length; i += convChunkSize) {
        const chunk = convIdArray.slice(i, i + convChunkSize);
        const { data: mChunk, error: mErr } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_type, content, message_type, created_at, external_order')
          .in('conversation_id', chunk)
          .order('created_at', { ascending: true });

        if (mErr) {
          console.error('[ExportConversationsLGPD] Erro no lote de mensagens:', mErr);
          continue;
        }

        if (mChunk && mChunk.length > 0) {
          for (const msg of mChunk) {
            const leadsForConv = convIdToLeadMap.get(msg.conversation_id) || [];
            for (const lead of leadsForConv) {
              if (!messagesByLeadId.has(lead.id)) {
                messagesByLeadId.set(lead.id, []);
              }
              const leadMsgList = messagesByLeadId.get(lead.id)!;
              if (!leadMsgList.some(existing => existing.id === msg.id)) {
                leadMsgList.push(msg);
              }
            }
          }
        }
      }

      // 4. Montar os dados das duas abas com Mascaramento LGPD
      const summaryRows: any[] = [];
      const detailRows: any[] = [];

      for (const l of targetLeads) {
        const leadMsgs = messagesByLeadId.get(l.id) || [];

        // Ordenar mensagens estritamente de forma cronológica
        leadMsgs.sort((a, b) => {
          const tA = new Date(a.created_at).getTime();
          const tB = new Date(b.created_at).getTime();
          if (tA !== tB) return tA - tB;
          return (a.external_order || 0) - (b.external_order || 0);
        });

        const maskedCnpj = maskCnpjLGPD(l.cnpj);
        const maskedPhone = maskPhoneLGPD(l.whatsapp);
        const maskedName = maskNameLGPD(l.name || l.establishmentName || l.contactName);

        let firstMsgDate = '-';
        let lastMsgDate = '-';
        if (leadMsgs.length > 0) {
          try {
            const d1 = new Date(leadMsgs[0].created_at);
            if (!isNaN(d1.getTime())) firstMsgDate = format(d1, 'dd/MM/yyyy HH:mm');
            const d2 = new Date(leadMsgs[leadMsgs.length - 1].created_at);
            if (!isNaN(d2.getTime())) lastMsgDate = format(d2, 'dd/MM/yyyy HH:mm');
          } catch {}
        } else if (l.sentAt) {
          try {
            const d = new Date(l.sentAt);
            if (!isNaN(d.getTime())) firstMsgDate = format(d, 'dd/MM/yyyy HH:mm');
          } catch {}
        }

        // Compilar diálogo completo do lead
        const formattedDialogue = leadMsgs.length > 0
          ? leadMsgs.map(m => {
              let senderLabel = 'Agente';
              const sType = String(m.sender_type || '').toLowerCase();
              if (['user', 'lead', 'client', 'customer'].includes(sType)) {
                senderLabel = 'Cliente';
              } else if (sType === 'system') {
                senderLabel = 'Sistema';
              }

              let timeStr = '-';
              try {
                const d = new Date(m.created_at);
                if (!isNaN(d.getTime())) {
                  timeStr = format(d, 'dd/MM/yyyy HH:mm:ss');
                }
              } catch {}

              let cleanContent = m.content || '';
              try {
                if (cleanContent.trim().startsWith('{')) {
                  const parsed = JSON.parse(cleanContent);
                  if (parsed.content) cleanContent = parsed.content;
                  else if (parsed.text) cleanContent = parsed.text;
                }
              } catch {}

              const maskedText = maskSensitiveTextLGPD(cleanContent);
              return `[${timeStr} - ${senderLabel}]:\n${maskedText}`;
            }).join('\n\n----------------------------------------\n\n')
          : '[Sem interação registrada]';

        const formattedValue = l.requestedAmount
          ? `R$ ${Number(l.requestedAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : '-';

        // Linha do Resumo (Aba 1)
        summaryRows.push({
          'Campanha': campName,
          'CNPJ (LGPD)': maskedCnpj,
          'WhatsApp (LGPD)': maskedPhone,
          'Razão Social': maskedName,
          'Status do Lead': l.status || '-',
          'Interagiu': l.stages?.isInteragiram ? 'Sim' : 'Não',
          'Total Mensagens': leadMsgs.length,
          'Primeira Mensagem': firstMsgDate,
          'Última Mensagem': lastMsgDate,
          'Opt-in Aceito': l.optIn ? 'Sim' : 'Não',
          'Valor Solicitado': formattedValue,
          'Conversa Completa (Mascarada LGPD)': formattedDialogue
        });

        // Linhas de detalhe mensagem por mensagem (Aba 2)
        leadMsgs.forEach((m, idx) => {
          let senderLabel = 'Agente';
          const sType = String(m.sender_type || '').toLowerCase();
          if (['user', 'lead', 'client', 'customer'].includes(sType)) {
            senderLabel = 'Cliente';
          } else if (sType === 'system') {
            senderLabel = 'Sistema';
          }

          let timeStr = '-';
          try {
            const d = new Date(m.created_at);
            if (!isNaN(d.getTime())) {
              timeStr = format(d, 'dd/MM/yyyy HH:mm:ss');
            }
          } catch {}

          let cleanContent = m.content || '';
          try {
            if (cleanContent.trim().startsWith('{')) {
              const parsed = JSON.parse(cleanContent);
              if (parsed.content) cleanContent = parsed.content;
              else if (parsed.text) cleanContent = parsed.text;
            }
          } catch {}

          detailRows.push({
            'Campanha': campName,
            'CNPJ (LGPD)': maskedCnpj,
            'WhatsApp (LGPD)': maskedPhone,
            'Razão Social': maskedName,
            'Ordem': idx + 1,
            'Data e Hora': timeStr,
            'Remetente': senderLabel,
            'Tipo': m.message_type || 'texto',
            'Mensagem (Mascarada LGPD)': maskSensitiveTextLGPD(cleanContent)
          });
        });
      }

      // 5. Gerar pasta de trabalho Excel com formatação de colunas
      const workbook = XLSX.utils.book_new();

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [
        { wch: 28 }, // Campanha
        { wch: 22 }, // CNPJ (LGPD)
        { wch: 20 }, // WhatsApp (LGPD)
        { wch: 38 }, // Razão Social
        { wch: 18 }, // Status
        { wch: 12 }, // Interagiu
        { wch: 16 }, // Total Mensagens
        { wch: 18 }, // Primeira Mensagem
        { wch: 18 }, // Última Mensagem
        { wch: 14 }, // Opt-in
        { wch: 18 }, // Valor Solicitado
        { wch: 80 }  // Conversa Completa
      ];
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Resumo Conversas');

      if (detailRows.length > 0) {
        const wsDetail = XLSX.utils.json_to_sheet(detailRows);
        wsDetail['!cols'] = [
          { wch: 28 }, // Campanha
          { wch: 22 }, // CNPJ (LGPD)
          { wch: 20 }, // WhatsApp (LGPD)
          { wch: 38 }, // Razão Social
          { wch: 8 },  // Ordem
          { wch: 20 }, // Data e Hora
          { wch: 14 }, // Remetente
          { wch: 14 }, // Tipo
          { wch: 80 }  // Mensagem
        ];
        XLSX.utils.book_append_sheet(workbook, wsDetail, 'Mensagens Linha a Linha');
      }

      const cleanFileName = `conversas_lgpd_${campName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`;
      XLSX.writeFile(workbook, cleanFileName);

      toast({
        title: "Exportação Concluída com Sucesso!",
        description: `Arquivo "${cleanFileName}" gerado com dados e conversas 100% mascarados conforme a LGPD.`,
      });
    } catch (err: any) {
      console.error('[ExportConversationsLGPD] Falha:', err);
      toast({
        title: "Erro na exportação",
        description: err.message || "Ocorreu um erro ao gerar o arquivo de conversas.",
        variant: "destructive"
      });
    } finally {
      setIsExportingConversations(false);
    }
  };

  const renderStatusBadge = (status: string, lead?: LeadDetailRow) => {
    const isApp = Boolean(
      status === 'Aprovado' || 
      lead?.stages?.isAprovado || 
      ['approved', 'comite_approved', 'aprovado', 'pre_approved'].includes(String(lead?.fiservStatus || '').toLowerCase())
    );

    if (isApp && !['Formalizado'].includes(status)) {
      return (
        <div className="inline-flex flex-col items-center gap-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Aprovado
          </span>
          {status === 'Em Atendimento' && (
            <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Em Atendimento
            </span>
          )}
          {status === 'Aguardando Contato' && (
            <span className="text-[8px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              Aguard. Contato
            </span>
          )}
          {status === 'Desistência' && (
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">
              Desistência
            </span>
          )}
        </div>
      );
    }

    const isRec = Boolean(
      !isApp && (
        status === 'Recusado' || 
        lead?.stages?.isRecusado
      )
    );

    if (isRec) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="w-3 h-3" />
          Recusado
        </span>
      );
    }

    switch (status) {
      case 'Lida':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-sky-50 text-sky-600 border border-sky-100">
            <Eye className="w-3 h-3" />
            Lida
          </span>
        );
      case 'Entregue':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
            <CheckCircle2 className="w-3 h-3" />
            Entregue
          </span>
        );
      case 'Não Entregue':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-600 border border-rose-100">
            <AlertCircle className="w-3 h-3" />
            Não Entregue
          </span>
        );
      case 'Confirmou Identidade':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200">
            <UserCheck className="w-3 h-3" />
            Confirmou
          </span>
        );
      case 'Valor Informado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Hash className="w-3 h-3" />
            Valor Inicial
          </span>
        );
      case 'Faturamento Informado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-teal-50 text-teal-700 border border-teal-200">
            <DollarSign className="w-3 h-3" />
            Faturamento
          </span>
        );
      case 'Opt-in':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3" />
            Opt-in Aceito
          </span>
        );
      case 'Simulou':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Calculator className="w-3 h-3" />
            Simulou
          </span>
        );
      case 'Aprovado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3 h-3" />
            Aprovado
          </span>
        );
      case 'Recusado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            Recusado
          </span>
        );
      case 'Desistência':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-300">
            <AlertCircle className="w-3 h-3 text-slate-500" />
            Desistência
          </span>
        );
      case 'Formalizado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Zap className="w-3 h-3" />
            Formalizado
          </span>
        );
      case 'Em Atendimento':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Em Atendimento
          </span>
        );
      case 'Aguardando Contato':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-50 text-purple-700 border border-purple-200">
            <Clock className="w-3 h-3" />
            Aguardando Contato
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  // Métricas do Card (garantindo consistência absoluta)
  const stat = useMemo(() => {
    const base = currentStat || {
      campaignId,
      campaignName: selectedCampaign?.name || 'Campanha',
      startDate: selectedCampaign?.createdAt ? new Date(selectedCampaign.createdAt) : null,
      status: selectedCampaign?.status || 'active',
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
    };

    if (leads.length === 0) return base;

    const interactedCount = leads.filter(l => matchesStatusFilter(l, 'Conversas Iniciadas')).length;

    return {
      ...base,
      interagiram: Math.max(base.interagiram, interactedCount)
    };
  }, [currentStat, leads, campaignId, selectedCampaign]);

  const deliveryRate = stat.enviados > 0 ? (stat.entregues / stat.enviados) * 100 : 0;
  const readRate = stat.entregues > 0 ? (stat.lidas / stat.entregues) * 100 : 0;
  const notDelivered = Math.max(stat.carregados - stat.entregues, 0);
  const notDeliveredRate = stat.carregados > 0 ? (notDelivered / stat.carregados) * 100 : 0;
  const interactionRate = stat.entregues > 0 ? (stat.interagiram / stat.entregues) * 100 : 0;
  const optInRate = stat.entregues > 0 ? (stat.optIn / stat.entregues) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="w-full">
        <div className="bg-white border border-border/50 p-4 lg:p-5 rounded-2xl shadow-sm relative overflow-hidden w-full">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#E5003A]" />
          <div className="relative z-10 flex flex-col gap-4">
            {/* LINHA 1: TÍTULO COM LARGURA TOTAL (SEM QUEBRA) */}
            <div className="w-full">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1 px-1">
                Campanha em Execução
              </span>
              <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight leading-tight px-1 truncate">
                {stat.campaignName}
              </h1>
            </div>

            {/* LINHA 2: METADADOS (INÍCIO, META, AGENTE) E BOTÕES NA MESMA LINHA ABAIXO */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-t border-slate-100 pt-4 px-1">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Início</span>
                    <span className="text-sm font-bold text-slate-700 font-mono">
                      {stat.startDate ? format(stat.startDate, 'dd/MM/yyyy') : '-'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-l border-slate-100 pl-8">
                  <Target className="w-4 h-4 text-[#E5003A] shrink-0" />
                  <div className="flex flex-col max-w-[280px]">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Meta / Objetivo</span>
                    <span className="text-sm font-bold text-slate-700 truncate">
                      {selectedCampaign?.description || 'Crédito com Garantia'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-l border-slate-100 pl-8">
                  <User className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="flex flex-col max-w-[240px]">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Agente</span>
                    <span className="text-sm font-bold text-slate-700 truncate">
                      {selectedAgent?.name || 'Agente Comercial'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 lg:ml-auto shrink-0 flex-wrap">
                {allCampaignStats.length > 0 && onSelectCampaign && (
                  <select 
                    value={campaignId}
                    onChange={(e) => {
                      sessionStorage.setItem('davos_active_campaign_id', e.target.value);
                      onSelectCampaign(e.target.value);
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase text-slate-900 outline-none cursor-pointer min-w-[200px]"
                  >
                    {allCampaignStats.map(c => (
                      <option key={c.campaignId} value={c.campaignId}>{c.campaignName}</option>
                    ))}
                  </select>
                )}
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
                  onClick={handleExportConversationsLGPD}
                  disabled={isExportingConversations}
                  className="h-8 px-4 rounded-lg border border-blue-200 text-blue-700 hover:text-blue-800 hover:bg-blue-50 font-bold uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all shadow-sm disabled:opacity-60"
                  title="Exportar todas as conversas dos leads mascarando dados sensíveis conforme a LGPD"
                >
                  {isExportingConversations ? (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                  ) : (
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                  )}
                  {isExportingConversations ? "Exportando..." : "Exportar Conversas (LGPD)"}
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

      {/* 3 Clusters Bento de Métricas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cluster 1: Processamento de Leads */}
        <OperationCluster title="Processamento de Leads" subtitle="Ingestão e Validação" icon={Users}>
          <KPISquare 
            label="Total no Arquivo" 
            value={stat.carregados} 
            percentage={100} 
            isInfo 
            subLabel="Base: leads válidos" 
            hidePercentage 
          />
          <KPISquare 
            label="Leads Válidos" 
            value={stat.carregados} 
            percentage={100} 
            isPositive 
            subLabel="Base do card (100%)" 
          />
          <KPISquare 
            label="Inconsistentes" 
            value={0} 
            percentage={0} 
            isNegative 
            subLabel="Base: leads válidos" 
          />
        </OperationCluster>

        {/* Cluster 2: Tráfego de Mensagens */}
        <OperationCluster title="Tráfego de Mensagens" subtitle="Envios e Interações Reais" icon={MessageSquare}>
          <KPISquare 
            label="Enviados" 
            value={stat.enviados} 
            percentage={100} 
            subLabel="Base: leads válidos" 
          />
          <div className="grid grid-cols-2 gap-3">
            <KPISquare 
              label="Entregues" 
              value={stat.entregues} 
              percentage={deliveryRate} 
              isPositive 
              subLabel="Taxa Entrega: (Entregues/Enviados)" 
            />
            <KPISquare 
              label="Lidas" 
              value={stat.lidas} 
              percentage={readRate} 
              isPositive 
              subLabel="Taxa Leitura: (Lidas/Entregues)" 
            />
          </div>
          <KPISquare 
            label="Não Entregues" 
            value={notDelivered} 
            percentage={notDeliveredRate} 
            isNegative 
            subLabel="Não recebidas (Zenvia)" 
            onClick={() => {
              setSelectedStatuses(['Não Entregue']);
              document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </OperationCluster>

        {/* Cluster 3: Resultado de Interações & Funil de Crédito */}
        <OperationCluster title="Resultado de Interações" subtitle="Funil Comportamental" icon={Zap}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <KPISquare 
                label="Base Impactada" 
                value={stat.entregues} 
                percentage={100} 
                subLabel="Mensagem entregue" 
                onClick={() => {
                  setSelectedStatuses(['Entregue']);
                  document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
              <KPISquare 
                label="Lidos" 
                value={stat.lidas} 
                percentage={readRate} 
                subLabel="Taxa Leitura" 
                onClick={() => {
                  setSelectedStatuses(['Lida']);
                  document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>

            <div className="w-full">
              <KPISquare 
                label="Conversas Iniciadas" 
                value={stat.interagiram} 
                percentage={interactionRate} 
                isInfo 
                subLabel="Taxa Interação: (Conversas Iniciadas/Entregues)" 
                onClick={() => {
                  setSelectedStatuses(['Conversas Iniciadas']);
                  document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>

            <div className="w-full">
              <KPISquare 
                label="Opt-in Aceito" 
                value={stat.optIn} 
                percentage={optInRate} 
                isPositive 
                subLabel="Conversão / Entregues" 
                onClick={() => {
                  setSelectedStatuses(['Opt-in']);
                  document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100/50 pt-3">
                  <div 
                    className="flex flex-col gap-1 cursor-pointer hover:bg-emerald-50/80 p-1 rounded transition-all group"
                    title="Clique para filtrar apenas os Aprovados"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStatuses(['Aprovado']);
                      document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <span className="text-[9px] font-black uppercase text-emerald-600/70 tracking-widest group-hover:text-emerald-700">Aprovados</span>
                    <span className="text-sm font-black text-emerald-700 group-hover:underline">{stat.aprovados}</span>
                  </div>
                  <div 
                    className="flex flex-col gap-1 border-l border-slate-100/50 pl-2 cursor-pointer hover:bg-rose-50/80 p-1 rounded transition-all group"
                    title="Clique para filtrar apenas os Recusados"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStatuses(['Recusado']);
                      document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <span className="text-[9px] font-black uppercase text-rose-500 tracking-widest group-hover:text-rose-600">Recusados</span>
                    <span className="text-sm font-black text-rose-600 group-hover:underline">{stat.recusados}</span>
                  </div>
                  <div 
                    className="flex flex-col gap-1 border-l border-slate-100/50 pl-2 cursor-pointer hover:bg-indigo-50/80 p-1 rounded transition-all group"
                    title="Clique para filtrar apenas os Formalizados"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStatuses(['Formalizado']);
                      document.getElementById('monitor-credit-table')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <span className="text-[9px] font-black uppercase text-indigo-600 tracking-widest group-hover:text-indigo-700">Formalizados</span>
                    <span className="text-sm font-black text-indigo-700 group-hover:underline">{stat.formalizado}</span>
                  </div>
                </div>
              </KPISquare>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <KPISquare 
                label="Pós Interação" 
                value={`${stat.interagiram > 0 ? Math.min((stat.optIn / stat.interagiram) * 100, 100).toFixed(1) : (0).toFixed(1)}%`}
                percentage={stat.interagiram > 0 ? Math.min((stat.optIn / stat.interagiram) * 100, 100) : 0}
                isPositive
                subLabel="Eficácia Resposta"
              />
              <KPISquare 
                label="Abandono Conv." 
                value={Math.max(stat.interagiram - stat.optIn, 0)} 
                percentage={stat.interagiram > 0 ? Math.min((Math.max(stat.interagiram - stat.optIn, 0) / stat.interagiram) * 100, 100) : 0} 
                isNegative 
                subLabel="Respondeu s/ Opt-in" 
              />
            </div>
          </div>
        </OperationCluster>
      </div>

      {/* Monitor de Transações Exclusivas (Tabela) */}
      <div id="monitor-credit-table" className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/30">
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
                const count = leads.filter(l => matchesStatusFilter(l, status)).length;

                return (
                  <Button
                    key={status}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedStatuses(prev => 
                        prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
                      );
                    }}
                    className={cn(
                      "h-8 rounded-full border px-3 text-[10px] font-black uppercase tracking-widest transition-all",
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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
                  onClick={() => setSelectedStatuses([])}
                  className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nome, CNPJ ou telefone..."
                className="h-9 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all"
              />
            </div>
            {isLoading && <Clock className="w-4 h-4 text-[#E5003A] animate-spin" />}
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
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer text-center" onClick={() => toggleSort('status')}>
                  <div className="flex items-center justify-center">Status <SortIcon column="status" /></div>
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest last:pr-10 text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-16 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                    Nenhum lead encontrado para os filtros selecionados
                  </td>
                </tr>
              ) : (
                sortedLeads.slice(0, 1000).map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors group">
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
                    <td className="px-8 py-5 text-center">
                      {renderStatusBadge(lead.status, lead)}
                    </td>
                    <td className="px-8 py-5 last:pr-10 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLead(lead)}
                        className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 shadow-sm"
                      >
                        <MessagesSquare className="w-3.5 h-3.5 mr-1.5" />
                        Conversa
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Slide-over Drawer com Histórico WhatsApp */}
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
                        {selectedLead.name}
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
                            userName: selectedLead.name,
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
                            Esta linha ainda não possui mensagens registradas no canal.
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
  );
}

// Subcomponentes visuais idênticos ao dashboard de referência
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
        <span className="text-xl font-black text-slate-900 tracking-tight">{displayValue}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isPositive ? "bg-emerald-500" : 
              isNegative ? "bg-rose-500" : 
              isInfo ? "bg-blue-600" : 
              "bg-slate-400"
            )}
            style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
          />
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{subLabel}</span>
      </div>
      {children}
    </div>
  );
}
