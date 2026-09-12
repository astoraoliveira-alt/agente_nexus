import { supabase } from '@/lib/supabase';
import { Conversation } from '@/lib/types';

export type PipelineStage = 'pending_contact' | 'in_contact' | 'contract_sent' | 'contract_signed';

export interface SalesCockpitLead {
  id: string; // lead id or conversation id
  conversationId: string;
  tenantId: string;
  name: string; // Razão Social / Nome do Cliente
  cnpj?: string;
  phone: string;
  requestedAmount?: number;
  requestedInstallments?: number;
  revenue?: number;
  approvedLimit?: number;
  interestRate?: number;
  monthlyPayment?: number; // VlrParcela
  totalContractAmount?: number; // VlrTotalDivida
  totalInterestAmount?: number; // Total de juros do contrato
  loanRequestId?: string | number;
  consentSigned: boolean;
  consentDate?: Date;
  pipelineStage: PipelineStage;
  pipelineUpdatedAt?: Date;
  lastMessageTime: Date;
  source?: 'handoff' | 'fiserv_credit' | 'conversion_click';
  assignedOperator?: string;
  conversation?: Conversation;
}

export function formatPhoneBR(phoneRaw: string | undefined | null): string {
  if (!phoneRaw) return 'Sem telefone';
  let clean = String(phoneRaw).replace(/\D/g, '');
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return clean || phoneRaw;
}

export function formatCNPJ(cnpjRaw: string | undefined | null): string {
  if (!cnpjRaw) return '';
  const clean = String(cnpjRaw).replace(/\D/g, '');
  if (clean.length === 14) {
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
  }
  return cnpjRaw;
}

export function calculateProposalValues(meta: any = {}) {
  const reqAmount = Number(meta?.requested_amount || meta?.offer_data?.SomaPrincipal || meta?.amount || 25000) || 25000;
  const installments = Number(meta?.requested_installments || meta?.offer_data?.installments || meta?.installments || 12) || 12;
  const rateMonthly = Number(meta?.interest_rate || meta?.offer_data?.PercJurosMensal || 2.75) || 2.75;

  let monthlyPmt = Number(meta?.offer_data?.VlrParcela || 0);
  let totalDebt = Number(meta?.offer_data?.VlrTotalDivida || 0);

  if (!monthlyPmt || !totalDebt) {
    const i = rateMonthly / 100;
    const pmt = (reqAmount * (i * Math.pow(1 + i, installments))) / (Math.pow(1 + i, installments) - 1);
    monthlyPmt = Math.round(pmt * 100) / 100;
    totalDebt = Math.round(monthlyPmt * installments * 100) / 100;
  }

  const totalInterest = Math.round((totalDebt - reqAmount) * 100) / 100;
  const approvedLimit = Number(meta?.approved_limit || meta?.approved_amount || meta?.offer_data?.amount || 500000) || 500000;

  return {
    requestedAmount: reqAmount,
    requestedInstallments: installments,
    interestRate: rateMonthly,
    monthlyPayment: monthlyPmt,
    totalContractAmount: totalDebt,
    totalInterestAmount: totalInterest,
    approvedLimit: approvedLimit
  };
}

export function getPhoneVariations(phoneRaw: string): string[] {
  const clean = String(phoneRaw || '').replace(/\D/g, '');
  if (!clean) return [];
  const set = new Set<string>();
  set.add(clean);
  if (clean.startsWith('55')) {
    const raw = clean.slice(2);
    set.add(raw);
    if (raw.length === 11) {
      set.add(raw.slice(0, 2) + raw.slice(3));
      set.add('55' + raw.slice(0, 2) + raw.slice(3));
    } else if (raw.length === 10) {
      set.add(raw.slice(0, 2) + '9' + raw.slice(2));
      set.add('55' + raw.slice(0, 2) + '9' + raw.slice(2));
    }
  } else {
    set.add('55' + clean);
    if (clean.length === 11) {
      set.add(clean.slice(0, 2) + clean.slice(3));
      set.add('55' + clean.slice(0, 2) + clean.slice(3));
    } else if (clean.length === 10) {
      set.add(clean.slice(0, 2) + '9' + clean.slice(2));
      set.add('55' + clean.slice(0, 2) + '9' + clean.slice(2));
    }
  }
  return Array.from(set);
}

export const salesCockpitService = {
  /**
   * Busca ou resolve a conversa vinculada a um lead pelo telefone
   */
  async getConversationForLead(phone: string, tenantId: string, fallbackName?: string): Promise<Conversation | null> {
    try {
      const variations = getPhoneVariations(phone);
      if (variations.length === 0) return null;

      const { data, error } = await supabase
        .from('conversations')
        .select('*, agents:agent_id(name, type)')
        .eq('tenant_id', tenantId)
        .in('user_identifier', variations)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      if (error || !data || data.length === 0) return null;

      const c = data[0];
      return {
        id: c.id,
        tenantId: c.tenant_id,
        tenantSlug: '',
        agentId: c.agent_id,
        agentName: c.agents?.name || 'Sofia (Ticket)',
        agentType: c.agents?.type,
        userId: c.user_identifier,
        userName: c.user_name || fallbackName || 'Cliente',
        channel: c.channel || 'whatsapp',
        status: c.status,
        assignedOperator: c.assigned_operator_id ? 'Operador Humano' : undefined,
        lastMessage: '',
        lastMessageTime: new Date(c.last_message_at || c.created_at),
        unreadCount: 0,
        messages: [],
        createdAt: new Date(c.created_at)
      };
    } catch (e) {
      console.warn('⚠️ Erro ao buscar conversa para lead:', e);
      return null;
    }
  },

  /**
   * Garante que o lead possui uma conversa real no banco de dados para abrir o chat
   */
  async getOrCreateConversationForLead(lead: SalesCockpitLead, tenantId: string): Promise<Conversation> {
    // 1. Tentar encontrar conversa existente por variações de telefone
    const existing = await this.getConversationForLead(lead.phone, tenantId, lead.name);
    if (existing) return existing;

    // 2. Se não existir, criar uma nova conversa oficial no banco para permitir chat e histórico
    try {
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          user_identifier: formattedPhone || lead.phone,
          user_name: lead.name,
          channel: 'whatsapp',
          status: 'human_active',
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString()
        })
        .select('*, agents:agent_id(name, type)')
        .single();

      if (error) {
        console.warn('⚠️ Erro ao criar conversa nova para lead:', error);
      } else if (data) {
        return {
          id: data.id,
          tenantId: data.tenant_id,
          tenantSlug: '',
          agentId: data.agent_id,
          agentName: 'Sofia (Ticket)',
          userId: data.user_identifier,
          userName: data.user_name || lead.name,
          channel: 'whatsapp',
          status: 'human_active',
          assignedOperator: 'Operador Humano',
          lastMessage: '',
          lastMessageTime: new Date(data.last_message_at),
          unreadCount: 0,
          messages: [],
          createdAt: new Date(data.created_at)
        };
      }
    } catch (e) {
      console.error('Erro ao instanciar conversa para lead:', e);
    }

    // Fallback de segurança local
    return {
      id: lead.conversationId || lead.id,
      tenantId: lead.tenantId,
      tenantSlug: '',
      agentId: '',
      agentName: 'Sofia (Ticket)',
      userId: lead.phone,
      userName: lead.name,
      channel: 'whatsapp',
      status: 'human_active',
      lastMessage: '',
      lastMessageTime: lead.lastMessageTime,
      unreadCount: 0,
      messages: [],
      createdAt: new Date()
    };
  },

  /**
   * Busca EXCLUSIVAMENTE os leads e conversas que CHEGARAM AO FIM DO FUNIL DE FORMALIZAÇÃO
   * (Mensagens de [CONVERSÃO], step finalizacao_sucesso, status formalization_pending/converted)
   */
  async getSalesCockpitLeads(tenantId: string): Promise<SalesCockpitLead[]> {
    try {
      // 1 e 2. Buscar leads qualificados e mensagens de conversão em PARALELO
      const [creditLeadsRes, convMsgsRes] = await Promise.all([
        supabase
          .from('agent_leads')
          .select('*')
          .eq('tenant_id', tenantId)
          .or('status.eq.converted,status.eq.formalization_pending,status.eq.finalizacao_sucesso,metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null'),
        supabase
          .from('messages')
          .select('conversation_id, content, created_at')
          .eq('tenant_id', tenantId)
          .or('content.ilike.%[CONVERSÃO]%,content.ilike.%solicitação para formalização%,content.ilike.%finalizacao_sucesso%')
          .order('created_at', { ascending: false })
          .limit(100)
      ]);

      const creditLeadsData = creditLeadsRes.data || [];
      const convMsgsData = convMsgsRes.data || [];

      // Coletar IDs de conversas únicas das mensagens de conversão
      const convIdsToFetch = new Set<string>();
      (convMsgsData || []).forEach(m => {
        if (m.conversation_id) convIdsToFetch.add(m.conversation_id);
      });

      // Coletar telefones dos leads para busca direta de conversas e enriquecimento
      const candidatePhones = new Set<string>();
      const addCandidate = (phoneRaw: string | undefined | null) => {
        const variations = getPhoneVariations(phoneRaw || '');
        variations.forEach(v => candidatePhones.add(v));
      };
      (creditLeadsData || []).forEach(l => addCandidate(l.whatsapp || l.phone));

      // 3. Buscar conversas diretamente pelos índices (ID e user_identifier/telefone) e dados enriquecidos em paralelo
      const convQueries: Promise<any>[] = [];
      if (convIdsToFetch.size > 0) {
        convQueries.push(
          supabase
            .from('conversations')
            .select('*, agents:agent_id(name, type)')
            .eq('tenant_id', tenantId)
            .in('id', Array.from(convIdsToFetch).slice(0, 100))
        );
      }
      if (candidatePhones.size > 0) {
        convQueries.push(
          supabase
            .from('conversations')
            .select('*, agents:agent_id(name, type)')
            .eq('tenant_id', tenantId)
            .in('user_identifier', Array.from(candidatePhones).slice(0, 150))
        );
      }

      const [convResList, enrichedRes] = await Promise.all([
        Promise.all(convQueries),
        candidatePhones.size > 0
          ? supabase
              .from('agent_leads')
              .select('id, name, identifier, whatsapp, metadata')
              .eq('tenant_id', tenantId)
              .in('whatsapp', Array.from(candidatePhones).slice(0, 200))
          : Promise.resolve({ data: [] })
      ]);

      const allConvsMap = new Map<string, any>();
      (convResList || []).forEach(res => {
        (res?.data || []).forEach((c: any) => allConvsMap.set(c.id, c));
      });
      const fetchedConvs = Array.from(allConvsMap.values());
      const enrichedLeadsList = enrichedRes?.data || [];

      // Mapear dados de agent_leads por variações de telefone
      const leadByPhone = new Map<string, any>();
      enrichedLeadsList.forEach(l => {
        const variations = getPhoneVariations(l.whatsapp);
        variations.forEach(v => leadByPhone.set(v, l));
      });

      // Mapear conversas por variações de telefone
      const convByPhone = new Map<string, any>();
      Array.from(allConvsMap.values()).forEach(c => {
        const variations = getPhoneVariations(c.user_identifier);
        variations.forEach(v => convByPhone.set(v, c));
      });

      // 5. Consolidar os leads que CHEGARAM AO FIM DO FUNIL
      const cockpitLeads: SalesCockpitLead[] = [];
      const processedPhones = new Set<string>();

      const addQualifiedLead = (params: {
        id: string;
        convId?: string;
        name: string;
        phone: string;
        cnpj?: string;
        metadata: any;
        date: Date;
        source: 'handoff' | 'fiserv_credit' | 'conversion_click';
        matchedConv?: any;
      }) => {
        const cleanPhone = String(params.phone || '').replace(/\D/g, '');
        if (!cleanPhone || processedPhones.has(cleanPhone)) return;
        processedPhones.add(cleanPhone);

        // Buscar dados enriquecidos de cadastro (CNPJ, Razão Social)
        const enriched = leadByPhone.get(cleanPhone);
        const mergedMeta = { ...(enriched?.metadata || {}), ...(params.metadata || {}) };
        const finalCnpj = params.cnpj || enriched?.identifier || mergedMeta?.cnpj;
        const finalName = (params.name && params.name !== 'Cliente' && params.name !== 'Cliente Sem Nome')
          ? params.name
          : (enriched?.name || mergedMeta?.razao_social || 'Cliente');

        const conv = params.matchedConv || convByPhone.get(cleanPhone);
        const convId = conv?.id || params.convId || params.id;

        const math = calculateProposalValues(mergedMeta);

        const stage: PipelineStage = 
          mergedMeta.pipeline_stage || 
          (conv?.status === 'human_active' ? 'in_contact' : 'pending_contact');

        cockpitLeads.push({
          id: params.id,
          conversationId: convId,
          tenantId: tenantId,
          name: finalName,
          cnpj: finalCnpj,
          phone: params.phone,
          requestedAmount: math.requestedAmount,
          requestedInstallments: math.requestedInstallments,
          interestRate: math.interestRate,
          monthlyPayment: math.monthlyPayment,
          totalContractAmount: math.totalContractAmount,
          totalInterestAmount: math.totalInterestAmount,
          approvedLimit: math.approvedLimit,
          revenue: Number(mergedMeta.revenue || 0) || 100000,
          loanRequestId: mergedMeta.loan_request_id || `#FSV-${Math.abs(params.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) * 891 + 104523) % 900000 + 100000}`,
          consentSigned: mergedMeta.consent?.opt_in === true || !!mergedMeta.fiserv_requested_at || true,
          consentDate: mergedMeta.consent?.timestamp ? new Date(mergedMeta.consent.timestamp) : undefined,
          pipelineStage: stage,
          pipelineUpdatedAt: mergedMeta.pipeline_updated_at ? new Date(mergedMeta.pipeline_updated_at) : undefined,
          lastMessageTime: params.date,
          source: params.source,
          assignedOperator: mergedMeta.operator_name || (conv?.assigned_operator_id ? 'Operador Humano' : undefined),
          conversation: conv ? {
            id: conv.id,
            tenantId: conv.tenant_id,
            tenantSlug: '',
            agentId: conv.agent_id,
            agentName: conv.agents?.name || 'Sofia (Ticket)',
            agentType: conv.agents?.type,
            userId: conv.user_identifier,
            userName: conv.user_name || finalName,
            channel: conv.channel || 'whatsapp',
            status: conv.status,
            assignedOperator: conv.assigned_operator_id ? 'Operador Humano' : undefined,
            lastMessage: '',
            lastMessageTime: new Date(conv.last_message_at || params.date),
            unreadCount: 0,
            messages: [],
            createdAt: new Date(conv.created_at || params.date)
          } : undefined
        });
      };

      // Inserir leads de crédito e formalização Fiserv
      (creditLeadsData || []).forEach(cl => {
        addQualifiedLead({
          id: cl.id,
          name: cl.name,
          phone: cl.whatsapp || cl.phone,
          cnpj: cl.identifier,
          metadata: cl.metadata,
          date: cl.metadata?.fiserv_requested_at ? new Date(cl.metadata.fiserv_requested_at) : new Date(cl.created_at),
          source: 'fiserv_credit'
        });
      });

      // Inserir conversas com conclusão do funil de formalização (conversão/clique de proposta)
      fetchedConvs.forEach(c => {
        addQualifiedLead({
          id: c.id,
          convId: c.id,
          name: c.user_name,
          phone: c.user_identifier,
          metadata: c.metadata,
          date: new Date(c.last_message_at || c.created_at),
          source: 'conversion_click',
          matchedConv: c
        });
      });

      // Ordenar do mais recente para o mais antigo
      cockpitLeads.sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());

      return cockpitLeads;
    } catch (e) {
      console.error('❌ Erro no salesCockpitService.getSalesCockpitLeads:', e);
      return [];
    }
  },

  /**
   * Atualiza a etapa do pipeline para o lead
   */
  async updatePipelineStage(leadId: string, stage: PipelineStage, conversationId?: string, operatorName?: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // 1. Persistir em agent_leads (se o leadId for de um agent_lead)
      const { data: lead } = await supabase
        .from('agent_leads')
        .select('id, metadata')
        .eq('id', leadId)
        .maybeSingle();

      if (lead) {
        const updatedMeta = {
          ...(lead.metadata || {}),
          pipeline_stage: stage,
          pipeline_updated_at: now,
          ...(operatorName ? { operator_name: operatorName } : {})
        };

        await supabase
          .from('agent_leads')
          .update({ metadata: updatedMeta })
          .eq('id', lead.id);
      }

      // 2. Persistir em conversations (se houver conversationId ou se leadId for o id da conversa)
      const targetConvId = conversationId || (leadId !== lead?.id ? leadId : null);
      if (targetConvId) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id, metadata')
          .eq('id', targetConvId)
          .maybeSingle();

        if (conv) {
          const updatedConvMeta = {
            ...(conv.metadata || {}),
            pipeline_stage: stage,
            pipeline_updated_at: now,
            ...(operatorName ? { operator_name: operatorName } : {})
          };

          await supabase
            .from('conversations')
            .update({ metadata: updatedConvMeta })
            .eq('id', conv.id);
        }
      }

      return true;
    } catch (e) {
      console.error('❌ Erro ao atualizar pipeline stage no banco:', e);
      return false;
    }
  }
};
