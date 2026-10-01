import { supabase, supabaseReader } from '@/lib/supabase';
import { Conversation, Message } from '@/lib/types';
import { conversationsService } from '@/services/conversations.service';

export type PipelineStage = 'pending_contact' | 'in_contact' | 'contract_sent' | 'contract_signed' | 'declined';

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
  campaignId?: string;
  campaignName?: string;
  assignedOperator?: string;
  assignedOperatorId?: string;
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
  const installments = Number(meta?.requested_installments || meta?.max_installments || meta?.offer_data?.installments || meta?.installments || 12) || 12;
  const rateMonthly = Number(meta?.interest_rate || meta?.offer_data?.PercJurosMensal || 2.75) || 2.75;

  let monthlyPmt = Number(meta?.offer_data?.VlrParcela || 0);
  let totalDebt = Number(meta?.offer_data?.VlrTotalDivida || 0);

  if (!monthlyPmt || !totalDebt) {
    const i = rateMonthly / 100;
    const pmt = (reqAmount * (i * Math.pow(1 + i, installments))) / (Math.pow(1 + i, installments) - 1);
    if (!monthlyPmt) monthlyPmt = Math.round(pmt * 100) / 100;
    if (!totalDebt) totalDebt = Math.round(monthlyPmt * installments * 100) / 100;
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
  const digitsOnly = clean.startsWith('55') ? clean.slice(2) : clean;
  if (digitsOnly.length < 8) return [];

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

/**
 * Verifica estritamente se o lead completou com sucesso o funil de crédito e aceitou a proposta formal.
 * 
 * Regras mandatórias:
 * 1. Leads recusados pela Fiserv / comitê de crédito NUNCA podem ser aceitos no Cockpit.
 * 2. Mensagens de autorização de consulta LGPD ("SIM, AUTORIZO") NÃO são aceite de proposta de crédito.
 * 3. O funil só é considerado completo se:
 *    a) A IA Sofia confirmou formalmente o encaminhamento aos especialistas / formalização; OU
 *    b) Houve uma mensagem real de proposta simulada ("Simulação concluída...", com parcelas/taxas) E o cliente confirmou o aceite expressamente após ela, sem cancelamento ou recusa posterior; OU
 *    c) O lead possui marcação formal de aceite de simulação no banco (simulation_accepted = true) e NÃO foi recusado pela Fiserv.
 */
export function isProposalAccepted(mList: any[], enrichedLead?: any): boolean {
  // 1. Verificação primária de RECUSA / NEGATIVA do comitê Fiserv nos metadados
  const meta = enrichedLead?.metadata || {};
  const fiservStatus = String(meta.fiserv_status || '').toLowerCase();
  const outcome = String(meta.outcome || '').toLowerCase();
  const formalStatus = String(meta.formalization_status || '').toLowerCase();
  const leadStatus = String(enrichedLead?.status || '').toLowerCase();

  // Se o lead foi reprovado/negado pelo comitê ou cancelado, DESCARTA IMEDIATAMENTE
  if (
    ['denied', 'fails_to_process', 'lost', 'cancelled', 'rejected'].includes(fiservStatus) ||
    outcome === 'rejected' ||
    ['cancelled', 'rejected', 'denied'].includes(leadStatus) ||
    (formalStatus === 'lost' && !meta.simulation_accepted)
  ) {
    return false;
  }

  // 2. Verificação de mensagem explícita de RECUSA do comitê de crédito no histórico de mensagens
  if (mList && mList.length > 0) {
    let lastRejectionIdx = -1;
    let lastApprovalOrHandoffIdx = -1;

    for (let i = 0; i < mList.length; i++) {
      const m = mList[i];
      const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
      if (!isBot) continue;

      const txt = String(m.content || '').toLowerCase();

      // Padrões inequívocos da mensagem de recusa do comitê Fiserv
      const isRejection = (
        txt.includes('infelizmente não conseguimos liberar uma oferta de crédito') ||
        txt.includes('infelizmente nao conseguimos liberar uma oferta de credito') ||
        (txt.includes('comitê fiserv') && txt.includes('infelizmente não conseguimos')) ||
        (txt.includes('comite fiserv') && txt.includes('infelizmente nao conseguimos')) ||
        (txt.includes('comitê fiserv') && txt.includes('não conseguimos')) ||
        (txt.includes('comite fiserv') && txt.includes('nao conseguimos')) ||
        txt.includes('motivo:* análise de crédito') ||
        txt.includes('motivo:* analise de credito') ||
        txt.includes('tentar novamente em *30 dias') ||
        txt.includes('tentar novamente em ~30 dias')
      );

      if (isRejection) {
        lastRejectionIdx = i;
      }

      // Mensagens que indicam aprovação posterior ou encaminhamento para especialistas
      const isApprovalOrHandoff = (
        txt.includes('especialistas entrará em contato com você') ||
        txt.includes('especialistas entrara em contato com voce') ||
        txt.includes('especialistas entrará em contato para pegar') ||
        txt.includes('especialistas entrara em contato para pegar') ||
        txt.includes('enviei a sua solicitação para formalização') ||
        txt.includes('enviei a sua solicitacao para formalizacao') ||
        txt.includes('fase final de assinatura e formalização') ||
        txt.includes('fase final de assinatura e formalizacao')
      );

      if (isApprovalOrHandoff) {
        lastApprovalOrHandoffIdx = i;
      }
    }

    // Se houve recusa e ela foi posterior a qualquer aprovação (ou não houve aprovação), o lead está RECUSADO
    if (lastRejectionIdx !== -1 && lastRejectionIdx > lastApprovalOrHandoffIdx) {
      return false;
    }
  }

  // 3. Verificação formal no banco de dados (apenas status positivos válidos de formalização)
  if (
    meta.simulation_accepted === true ||
    meta.accepted_proposal != null ||
    ['waiting_contact', 'in_service', 'formalized', 'contract_sent', 'contract_signed'].includes(formalStatus) ||
    ['formalization_pending', 'finalizacao_sucesso'].includes(leadStatus)
  ) {
    return true;
  }

  if (!mList || mList.length === 0) return false;

  // 4. Verificação de mensagem de confirmação de envio para formalização enviada pela IA
  const hasFormalizationConfirmedByAi = mList.some(m => {
    const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
    if (!isBot) return false;
    const txt = String(m.content || '').toLowerCase();
    return (
      txt.includes('enviei a sua solicitação para formalização') ||
      txt.includes('enviei a sua solicitacao para formalizacao') ||
      txt.includes('registramos o seu interesse nessas condições') ||
      txt.includes('registramos o seu interesse nessas condicoes') ||
      txt.includes('especialistas entrará em contato com você') ||
      txt.includes('especialistas entrara em contato com voce') ||
      txt.includes('especialistas entrará em contato para pegar') ||
      txt.includes('especialistas entrara em contato para pegar') ||
      txt.includes('fase final de assinatura e formalização') ||
      txt.includes('fase final de assinatura e formalizacao')
    );
  });

  if (hasFormalizationConfirmedByAi) {
    return true;
  }

  // 5. Localizar a última mensagem de proposta de simulação real enviada pelo bot
  // ATENÇÃO: NÃO usar frases preliminares como "Podemos seguir com a formalização", pois mensagens iniciais de campanha
  // usam essa frase antes mesmo da LGPD! A proposta real contém valores calculados ou termo de simulação concluída.
  let lastSimIdx = -1;
  for (let i = 0; i < mList.length; i++) {
    const m = mList[i];
    const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
    if (isBot) {
      const text = String(m.content || '');
      const isRealSimulation = (
        /Simulação concluída/i.test(text) ||
        (/Valor Solicitado:/i.test(text) && /Valor da Parcela:/i.test(text)) ||
        (/Prazo:\s*\d+\s*parcelas/i.test(text) && /Valor da Parcela/i.test(text))
      );
      if (isRealSimulation) {
        lastSimIdx = i;
      }
    }
  }

  // Se nenhuma proposta real de simulação foi enviada, o lead ainda não chegou ao fim do funil!
  if (lastSimIdx === -1) {
    return false;
  }

  // 6. Analisar as mensagens após a última proposta simulada enviada
  const msgsAfterSim = mList.slice(lastSimIdx + 1);
  if (msgsAfterSim.length === 0) {
    // Cliente ainda não respondeu à simulação
    return false;
  }

  let userAccepted = false;
  let userRestartedOrCancelled = false;

  for (const m of msgsAfterSim) {
    const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
    const text = String(m.content || '').toLowerCase().trim();

    if (!isBot) {
      if (/🔄\s*nova simulação|nova simula|outro valor|mudar valor|recalcular|não|nao\b/i.test(text)) {
        userRestartedOrCancelled = true;
        userAccepted = false;
      } else if (
        // Aceite da proposta simulada (NÃO confundir com "SIM, AUTORIZO" da LGPD)
        /^(✅\s*)?(sim|s|ok|pode ser|pode seguir|quero seguir|confirmo|pode formalizar|vamos em frente|fechou|👍\s*ok,?\s*entendi!?)$/i.test(text) ||
        /\b(pode formalizar|quero formalizar|pode seguir com a formalização|fechar nesse valor|fechar essa proposta)\b/i.test(text)
      ) {
        userAccepted = true;
        userRestartedOrCancelled = false;
      }
    } else {
      // Se após a mensagem do cliente, a IA pediu novos valores/parcelas, o cliente pediu nova simulação
      if (/deseja simular o valor|quantas parcelas gostaria de simular/i.test(text)) {
        userAccepted = false;
      }
      if (
        text.includes('enviei a sua solicitação para formalização') ||
        text.includes('registramos o seu interesse nessas condições') ||
        text.includes('especialistas entrará em contato') ||
        text.includes('especialistas entrara em contato')
      ) {
        userAccepted = true;
        userRestartedOrCancelled = false;
      }
    }
  }

  return userAccepted && !userRestartedOrCancelled;
}

export const salesCockpitService = {
  /**
   * Busca ou resolve a conversa vinculada a um lead pelo telefone
   */
  async getConversationForLead(phone: string, tenantId: string, fallbackName?: string, campaignId?: string): Promise<Conversation | null> {
    try {
      const variations = getPhoneVariations(phone);
      if (variations.length === 0) return null;

      const { data, error } = await supabaseReader
        .from('conversations')
        .select('*, agents:agent_id(name, type)')
        .eq('tenant_id', tenantId)
        .in('user_identifier', variations)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !data || data.length === 0) return null;

      // Classificar e selecionar a melhor conversa
      const sorted = [...data].sort((a, b) => {
        if (campaignId) {
          const aCamp = a.campaign_id || a.metadata?.campaign_id || a.metadata?.campaignId;
          const bCamp = b.campaign_id || b.metadata?.campaign_id || b.metadata?.campaignId;
          const aMatches = aCamp === campaignId ? 1 : 0;
          const bMatches = bCamp === campaignId ? 1 : 0;
          if (bMatches !== aMatches) return bMatches - aMatches;
        }

        const statusScore = (s: string) => s === 'human_active' ? 3 : s === 'ai_active' ? 2 : s === 'closed' ? 0 : 1;
        const scoreA = statusScore(a.status);
        const scoreB = statusScore(b.status);
        if (scoreB !== scoreA) return scoreB - scoreA;

        const timeA = new Date(a.last_message_at || a.created_at).getTime();
        const timeB = new Date(b.last_message_at || b.created_at).getTime();
        return timeB - timeA;
      });

      const c = sorted[0];
      const messages = await conversationsService.getConversationMessages(c.id);

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
        assignedOperator: c.assigned_operator_id ? 'Operador Humano' : (c.metadata?.operator_name || undefined),
        lastMessage: messages.length > 0 ? messages[messages.length - 1].content : '',
        lastMessageTime: new Date(c.last_message_at || c.created_at),
        unreadCount: 0,
        messages: messages,
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
    // 1. Tentar encontrar conversa existente por variações de telefone e campanha
    const existing = await this.getConversationForLead(lead.phone, tenantId, lead.name, lead.campaignId);
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
   * (Otimizado com supabaseReader e consultas diretas indexadas para carregamento sub-segundo)
   */
  /**
   * Busca EXCLUSIVAMENTE os leads que chegaram ao fim do funil (critério "OK Agente").
   * Fonte primária: RPC `get_sales_cockpit_leads` (JOIN completo + mensagens no banco).
   * Fallback: análise local de mensagens (caso o RPC falhe ou retorne vazio).
   *
   * @param tenantId  - UUID do tenant
   * @param userId    - UUID do usuário logado (para RBAC no RPC)
   * @param userRole  - Papel do usuário ('super_admin' | 'admin' | 'operator' | etc.)
   */
  async getSalesCockpitLeads(
    tenantId: string,
    userId?: string | null,
    userRole?: string | null
  ): Promise<SalesCockpitLead[]> {
    // Normaliza o papel: super_admin / admin / tenant_admin passam como 'super_admin'
    // para que o filtro RBAC do RPC mostre todos os leads sem restrição por operador.
    const resolvedRole = (() => {
      const r = String(userRole || '').toLowerCase().trim();
      if (['super_admin', 'admin', 'tenant_admin', 'administrador'].some(a => r.includes(a))) return 'super_admin';
      return 'operator';
    })();

    try {
      // ─── FONTE PRIMÁRIA: RPC otimizada (critério OK Agente validado no banco) ───
      const { data: rpcRows, error: rpcError } = await supabaseReader
        .rpc('get_sales_cockpit_leads', {
          p_tenant_id: tenantId,
          p_user_id:   userId   ?? null,
          p_user_role: resolvedRole
        });

      if (rpcError) {
        console.warn('⚠️ RPC get_sales_cockpit_leads erro:', rpcError.message);
      }

      if (rpcRows && rpcRows.length > 0) {
        const cockpitLeads: SalesCockpitLead[] = [];

        for (const row of rpcRows) {
          // Mapear mensagens retornadas pelo RPC (campo messages JSONB)
          const rpcMessages: any[] = Array.isArray(row.messages) ? row.messages : [];
          const mappedMessages = rpcMessages.map((m: any) => {
            let cleanContent = m.content || '';
            try {
              if (typeof cleanContent === 'string' && cleanContent.trim().startsWith('{')) {
                const parsed = JSON.parse(cleanContent);
                if (parsed.content) cleanContent = parsed.content;
              }
            } catch (_) {}

            const isAi = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(
              String(m.sender_type || '').toLowerCase()
            );
            const isHuman = ['human', 'operator'].includes(
              String(m.sender_type || '').toLowerCase()
            );
            const sender = isAi ? 'ai' : isHuman ? 'human' : 'user';

            return {
              id: m.id || `${row.conversation_id}-${m.created_at}`,
              conversationId: m.conversation_id || row.conversation_id,
              tenantId: tenantId,
              tenantSlug: '',
              content: cleanContent,
              type: (m.message_type || 'text') as any,
              sender: sender,
              senderName: m.sender_name || (isAi ? 'Sofia' : isHuman ? (row.assigned_operator || 'Operador') : row.name),
              timestamp: new Date(m.created_at),
              audioUrl: m.audio_url,
              status: m.status || 'sent'
            };
          });

          const stage: PipelineStage = (row.pipeline_stage as PipelineStage) || 'pending_contact';
          const lastMsgTime = row.last_message_time ? new Date(row.last_message_time) : new Date();

          cockpitLeads.push({
            id: String(row.lead_id),
            conversationId: String(row.conversation_id || row.lead_id),
            tenantId: tenantId,
            name: row.name || 'Cliente',
            cnpj: row.cnpj || undefined,
            phone: row.phone,
            requestedAmount: Number(row.requested_amount) || 0,
            requestedInstallments: Number(row.requested_installments) || 0,
            interestRate: Number(row.interest_rate) || 0,
            monthlyPayment: Number(row.monthly_payment) || 0,
            totalContractAmount: Number(row.total_contract_amount) || 0,
            totalInterestAmount: 0,
            approvedLimit: 0,
            revenue: 0,
            loanRequestId: row.loan_request_id
              ? (String(row.loan_request_id).startsWith('#') ? String(row.loan_request_id) : `#FSV-${row.loan_request_id}`)
              : undefined,
            consentSigned: true,
            pipelineStage: stage,
            lastMessageTime: lastMsgTime,
            source: 'fiserv_credit',
            campaignId: String(row.campaign_id),
            campaignName: row.campaign_name || 'Campanha Fiserv',
            assignedOperator: row.assigned_operator || undefined,
            assignedOperatorId: row.assigned_operator_id ? String(row.assigned_operator_id) : undefined,
            conversation: {
              id: String(row.conversation_id || row.lead_id),
              tenantId: tenantId,
              tenantSlug: '',
              agentId: '',
              agentName: 'Sofia (Ticket)',
              userId: row.phone,
              userName: row.name || 'Cliente',
              channel: 'whatsapp',
              status: (row.conversation_status as any) || 'ai_active',
              assignedOperator: row.assigned_operator || undefined,
              lastMessage: row.last_message_content || '',
              lastMessageTime: lastMsgTime,
              unreadCount: 0,
              messages: mappedMessages,
              createdAt: lastMsgTime
            }
          });
        }

        cockpitLeads.sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());
        return cockpitLeads;
      }

      // ─── FALLBACK: análise local (RPC falhou ou não tem dados) ───────────────
      console.warn('⚠️ RPC sem resultados — usando fallback local de mensagens.');

      const [auditRes, activeConvsRes, campsRes] = await Promise.all([
        supabaseReader
          .from('fiserv_audit_logs')
          .select('id, contact_name, contact_phone, registration_code, status_fiserv, is_approved, offer_data, loan_request_id, created_at, action')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabaseReader
          .from('conversations')
          .select('id, tenant_id, user_identifier, user_name, metadata, status, channel, assigned_operator_id, last_message_at, created_at, agent_id, campaign_id')
          .eq('tenant_id', tenantId)
          .eq('status', 'human_active')
          .order('created_at', { ascending: false })
          .limit(50),
        supabaseReader
          .from('campaigns')
          .select('id, name, status, created_at')
          .eq('tenant_id', tenantId)
      ]);

      const auditLogs = auditRes.data || [];
      const activeConvs = activeConvsRes.data || [];
      const camps = campsRes.data || [];

      const campMap = new Map<string, any>();
      const validCampaignIds = new Set<string>();
      camps.forEach((c: any) => {
        campMap.set(c.id, c);
        if (c.status === 'active' || c.status === 'completed') validCampaignIds.add(c.id);
      });

      const auditPhoneSet = new Set<string>();
      auditLogs.forEach((a: any) => {
        if (a.contact_phone) getPhoneVariations(a.contact_phone).forEach((v: string) => auditPhoneSet.add(v));
      });
      const auditPhones = Array.from(auditPhoneSet);

      let phoneConvs: any[] = [];
      if (auditPhones.length > 0) {
        const { data: pConvs } = await supabaseReader
          .from('conversations')
          .select('id, tenant_id, user_identifier, user_name, metadata, status, channel, assigned_operator_id, last_message_at, created_at, agent_id, campaign_id')
          .eq('tenant_id', tenantId)
          .in('user_identifier', auditPhones)
          .order('created_at', { ascending: false });
        phoneConvs = pConvs || [];
      }

      const convMap = new Map<string, any>();
      [...activeConvs, ...phoneConvs].forEach((c: any) => convMap.set(c.id, c));
      const candidateConvs = Array.from(convMap.values()).sort((a: any, b: any) =>
        new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime()
      );
      const convIds = candidateConvs.map((c: any) => c.id);

      const allCandidatePhones = new Set<string>();
      candidateConvs.forEach((c: any) => getPhoneVariations(c.user_identifier).forEach((v: string) => allCandidatePhones.add(v)));
      auditPhones.forEach((v: string) => allCandidatePhones.add(v));

      const [msgsRes, leadsRes, queueRes] = await Promise.all([
        convIds.length > 0
          ? supabaseReader.from('messages')
              .select('id, conversation_id, content, created_at, sender_type, message_type, audio_url, image_url, metadata')
              .in('conversation_id', convIds)
              .order('created_at', { ascending: true })
          : { data: [] },
        allCandidatePhones.size > 0
          ? supabaseReader.from('agent_leads')
              .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id, campaign_id')
              .eq('tenant_id', tenantId)
              .in('whatsapp', Array.from(allCandidatePhones))
              .order('created_at', { ascending: false })
          : { data: [] },
        allCandidatePhones.size > 0
          ? supabaseReader.from('outbound_queue')
              .select('id, contact_name, contact_phone, campaign_id, status, created_at, tenant_id')
              .eq('tenant_id', tenantId)
              .in('contact_phone', Array.from(allCandidatePhones))
              .order('created_at', { ascending: false })
          : { data: [] }
      ]);

      const msgsData = msgsRes.data || [];
      const rawLeads = leadsRes.data || [];
      const rawQueue = queueRes.data || [];

      const convsByPhone = new Map<string, any[]>();
      const convByPhone = new Map<string, any>();
      candidateConvs.forEach((c: any) => {
        getPhoneVariations(c.user_identifier).forEach((v: string) => {
          if (!convsByPhone.has(v)) convsByPhone.set(v, []);
          convsByPhone.get(v)!.push(c);
          if (!convByPhone.has(v)) convByPhone.set(v, c);
        });
      });

      const leadByPhone = new Map<string, any>();
      rawLeads.forEach((l: any) => {
        getPhoneVariations(l.whatsapp).forEach((v: string) => {
          if (!leadByPhone.has(v)) leadByPhone.set(v, l);
        });
      });

      const queueByPhone = new Map<string, any>();
      rawQueue.forEach((q: any) => {
        if (q.contact_phone) getPhoneVariations(q.contact_phone).forEach((v: string) => {
          if (!queueByPhone.has(v)) queueByPhone.set(v, q);
        });
      });

      const auditByPhone = new Map<string, any>();
      auditLogs.forEach((a: any) => {
        if (a.contact_phone) getPhoneVariations(a.contact_phone).forEach((v: string) => {
          if (!auditByPhone.has(v)) auditByPhone.set(v, a);
        });
      });

      const funnelMsgsByConv = new Map<string, any[]>();
      msgsData.forEach((m: any) => {
        if (!funnelMsgsByConv.has(m.conversation_id)) funnelMsgsByConv.set(m.conversation_id, []);
        funnelMsgsByConv.get(m.conversation_id)!.push(m);
      });

      const getBestConvForPhone = (phone: string, targetCampaignId?: string): any | null => {
        const variations = getPhoneVariations(phone);
        const candidates: any[] = [];
        variations.forEach((v: string) => { const list = convsByPhone.get(v); if (list) candidates.push(...list); });
        if (candidates.length === 0) return null;
        const unique = Array.from(new Map(candidates.map((c: any) => [c.id, c])).values());
        unique.sort((a: any, b: any) => {
          if (targetCampaignId) {
            const aM = (a.campaign_id || a.metadata?.campaign_id) === targetCampaignId ? 1 : 0;
            const bM = (b.campaign_id || b.metadata?.campaign_id) === targetCampaignId ? 1 : 0;
            if (bM !== aM) return bM - aM;
          }
          const sc = (s: string) => s === 'human_active' ? 3 : s === 'ai_active' ? 2 : s === 'closed' ? 0 : 1;
          if (sc(b.status) !== sc(a.status)) return sc(b.status) - sc(a.status);
          return new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime();
        });
        return unique[0] || null;
      };

      const cockpitLeads: SalesCockpitLead[] = [];
      const processedPhones = new Set<string>();

      const mapMessages = (msgs: any[], convData: any, fallbackName: string) =>
        msgs.map((m: any) => {
          let cleanContent = m.content || '';
          try {
            if (cleanContent.trim().startsWith('{')) {
              const parsed = JSON.parse(cleanContent);
              if (parsed.content) cleanContent = parsed.content;
            }
          } catch (_) {}
          const isAi = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
          const isHuman = ['human', 'operator'].includes(String(m.sender_type || '').toLowerCase());
          const sender = isAi ? 'ai' : isHuman ? 'human' : 'user';
          return {
            id: m.id || `${convData?.id}-${m.created_at}`,
            conversationId: m.conversation_id || convData?.id,
            tenantId,
            tenantSlug: '',
            content: cleanContent,
            type: (m.message_type || 'text') as any,
            sender,
            senderName: m.sender_name || (isAi ? 'Sofia' : isHuman ? (convData?.metadata?.operator_name || 'Operador') : fallbackName),
            timestamp: new Date(m.created_at),
            audioUrl: m.audio_url,
            imageUrl: m.image_url || m.metadata?.file_url,
            fileUrl: m.metadata?.file_url || m.image_url,
            fileName: m.metadata?.file_name,
            status: m.status || 'sent'
          };
        });

      const addQualifiedLead = (params: {
        id: string; convId?: string; name: string; phone: string; cnpj?: string;
        metadata: any; date: Date; source: 'handoff' | 'fiserv_credit' | 'conversion_click';
        matchedConv?: any; campaignId?: string;
      }) => {
        const cleanPhone = String(params.phone || '').replace(/\D/g, '');
        const digitsOnly = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : cleanPhone;
        if (digitsOnly.length < 8 || processedPhones.has(cleanPhone)) return;

        const enriched = leadByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? leadByPhone.get(cleanPhone.slice(2)) : null);
        const audit = auditByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? auditByPhone.get(cleanPhone.slice(2)) : null);
        const queueItem = queueByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? queueByPhone.get(cleanPhone.slice(2)) : null);

        const candidateCampaignId =
          params.campaignId || enriched?.campaign_id || queueItem?.campaign_id ||
          audit?.offer_data?.campaign_id || params.metadata?.campaign_id || params.metadata?.campaignId;

        const conv = params.matchedConv || getBestConvForPhone(cleanPhone, candidateCampaignId) ||
          convByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? convByPhone.get(cleanPhone.slice(2)) : null);

        const finalCampaignId =
          candidateCampaignId || conv?.campaign_id || conv?.metadata?.campaign_id || conv?.metadata?.campaignId;

        if (!finalCampaignId || !validCampaignIds.has(finalCampaignId)) return;

        const campObj = campMap.get(finalCampaignId);
        const mergedMeta = { ...(enriched?.metadata || {}), ...(audit?.offer_data ? { offer_data: audit.offer_data } : {}), ...(params.metadata || {}) };

        const isDeniedOrLost =
          ['denied', 'fails_to_process', 'lost', 'cancelled', 'rejected'].includes(String(mergedMeta?.fiserv_status || audit?.status_fiserv || '').toLowerCase()) ||
          mergedMeta?.outcome === 'rejected' ||
          ['cancelled', 'rejected', 'denied'].includes(String(enriched?.status || '').toLowerCase()) ||
          (mergedMeta?.formalization_status === 'lost' && !mergedMeta?.simulation_accepted);
        if (isDeniedOrLost) return;

        if (conv?.id && funnelMsgsByConv.has(conv.id)) {
          const cMsgs = funnelMsgsByConv.get(conv.id) || [];
          let rejIdx = -1, appIdx = -1;
          cMsgs.forEach((m: any, i: number) => {
            const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
            if (!isBot) return;
            const txt = String(m.content || '').toLowerCase();
            if (txt.includes('infelizmente não conseguimos liberar uma oferta de crédito') || txt.includes('infelizmente nao conseguimos liberar uma oferta de credito')) rejIdx = i;
            if (txt.includes('especialistas entrará em contato') || txt.includes('enviei a sua solicitação para formalização')) appIdx = i;
          });
          if (rejIdx !== -1 && rejIdx > appIdx) return;
        }

        processedPhones.add(cleanPhone);

        const finalCnpj = params.cnpj || mergedMeta?.cnpj || enriched?.identifier || audit?.registration_code;
        const finalName = (params.name && params.name !== 'Cliente' && params.name !== 'Cliente Sem Nome')
          ? params.name : (mergedMeta?.razao_social || enriched?.name || audit?.contact_name || 'Cliente');

        const convId = conv?.id || params.convId || params.id;
        const math = calculateProposalValues(mergedMeta);
        const stage: PipelineStage = mergedMeta.pipeline_stage || conv?.metadata?.pipeline_stage ||
          (conv?.status === 'human_active' && conv?.assigned_operator_id ? 'in_contact' : 'pending_contact');

        const convMessages = mapMessages(funnelMsgsByConv.get(conv?.id) || [], conv, finalName);

        cockpitLeads.push({
          id: params.id,
          conversationId: convId,
          tenantId,
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
          revenue: Number(mergedMeta.revenue || 0) || Number(enriched?.revenue || 0) || 0,
          loanRequestId: mergedMeta.loan_request_id
            ? (String(mergedMeta.loan_request_id).startsWith('#') ? String(mergedMeta.loan_request_id) : `#FSV-${mergedMeta.loan_request_id}`)
            : (audit?.loan_request_id ? `#FSV-${audit.loan_request_id}` : `#FSV-${Math.abs(params.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) * 891 + 104523) % 900000 + 100000}`),
          consentSigned: mergedMeta.consent?.opt_in === true || !!mergedMeta.fiserv_requested_at || true,
          consentDate: mergedMeta.consent?.timestamp ? new Date(mergedMeta.consent.timestamp) : undefined,
          pipelineStage: stage,
          pipelineUpdatedAt: mergedMeta.pipeline_updated_at ? new Date(mergedMeta.pipeline_updated_at) : undefined,
          lastMessageTime: params.date,
          source: params.source,
          campaignId: candidateCampaignId,
          campaignName: campObj?.name || 'Campanha Fiserv',
          assignedOperator: mergedMeta.operator_name || (conv?.assigned_operator_id ? 'Operador Humano' : (conv?.metadata?.operator_name || undefined)),
          assignedOperatorId: mergedMeta.operator_id || conv?.assigned_operator_id || undefined,
          conversation: conv ? {
            id: conv.id, tenantId: conv.tenant_id, tenantSlug: '', agentId: conv.agent_id,
            agentName: conv.agents?.name || 'Sofia (Ticket)', agentType: conv.agents?.type,
            userId: conv.user_identifier, userName: conv.user_name || finalName,
            channel: conv.channel || 'whatsapp', status: conv.status,
            assignedOperator: conv.assigned_operator_id ? 'Operador Humano' : (conv.metadata?.operator_name || undefined),
            lastMessage: convMessages.length > 0 ? convMessages[convMessages.length - 1].content : '',
            lastMessageTime: new Date(conv.last_message_at || params.date),
            unreadCount: 0, messages: convMessages, createdAt: new Date(conv.created_at || params.date)
          } : {
            id: convId, tenantId, tenantSlug: '', agentId: '', agentName: 'Sofia (Ticket)',
            userId: params.phone, userName: finalName, channel: 'whatsapp', status: 'human_active',
            lastMessage: '', lastMessageTime: params.date, unreadCount: 0, messages: [], createdAt: params.date
          }
        });
      };

      for (const [convId, mList] of funnelMsgsByConv.entries()) {
        const conv = convMap.get(convId);
        if (!conv) continue;
        const cleanPhone = String(conv.user_identifier || '').replace(/\D/g, '');
        const enrichedLead = leadByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? leadByPhone.get(cleanPhone.slice(2)) : null);
        if (!isProposalAccepted(mList, enrichedLead)) continue;

        const parseNum = (val: string | undefined | null) => val ? parseFloat(val.replace(/\./g, '').replace(',', '.')) : null;
        let foundReqAmount: number | null = null, foundInstallments: string | null = null,
            foundRate: number | null = null, foundLimit: number | null = null,
            foundPmt: number | null = null, foundDebt: number | null = null,
            foundCnpj: string | null = null, foundCompanyName: string | null = null, foundRevenue: number | null = null;

        const simMessage = [...mList].reverse().find((m: any) => {
          const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
          return isBot && /Simulação concluída/i.test(m.content || '') && /Valor Solicitado:/i.test(m.content || '');
        });
        if (simMessage) {
          const text = simMessage.content || '';
          const rm = text.match(/Valor Solicitado:\*\s*R\$\s*([\d\.,]+)/i); if (rm) foundReqAmount = parseNum(rm[1]);
          const im = text.match(/Prazo:\*\s*(\d+)\s*parcelas/i); if (im) foundInstallments = im[1];
          const ram = text.match(/Taxa de Juros:\s*([\d\.,]+)%\s*a\.m/i); if (ram) foundRate = parseNum(ram[1]);
          const pm = text.match(/Valor da Parcela:\*\s*R\$\s*([\d\.,]+)/i); if (pm) foundPmt = parseNum(pm[1]);
          const dm = text.match(/Valor Total da D[ií]vida:\*\s*R\$\s*([\d\.,]+)/i); if (dm) foundDebt = parseNum(dm[1]);
        }

        if (!foundReqAmount && enrichedLead?.metadata?.accepted_proposal?.amount) foundReqAmount = Number(enrichedLead.metadata.accepted_proposal.amount);
        if (!foundInstallments && enrichedLead?.metadata?.accepted_proposal?.installments) foundInstallments = String(enrichedLead.metadata.accepted_proposal.installments);
        if (!foundPmt && enrichedLead?.metadata?.simulation_data?.installment_value) foundPmt = Number(enrichedLead.metadata.simulation_data.installment_value);
        if (!foundDebt && enrichedLead?.metadata?.simulation_data?.total_debt) foundDebt = Number(enrichedLead.metadata.simulation_data.total_debt);

        for (let i = mList.length - 1; i >= 0; i--) {
          const m = mList[i];
          const text = m.content || '';
          const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
          if (!foundCnpj) { const cm = text.match(/CNPJ\s*\*?\*?(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\*?\*?/i); if (cm) foundCnpj = cm[1].replace(/\D/g, ''); }
          if (!foundCompanyName) {
            const sm = text.match(/(DAVOS AD CONSULTORIA[A-Z\s\.\-]*LTDA)/i) ||
                       text.match(/(?:da empresa|pela empresa|responsável pela?)\s*\*?\*?([A-Z0-9\s\.\-]{4,70}(?:LTDA|S\.A\.|ME|EPP|EIRELI|CONVENIENCIAS))\*?\*?/i);
            if (sm) { const cand = sm[1].trim(); if (cand.length >= 6) foundCompanyName = cand; }
          }
          if (!foundReqAmount) { const rm = text.match(/Valor Solicitado:\*\s*R\$\s*([\d\.,]+)/i); if (rm) foundReqAmount = parseNum(rm[1]); }
          if (!foundInstallments) { const im = text.match(/Prazo:\*\s*(\d+)\s*parcelas/i) || text.match(/(\d+)\s*parcelas/i); if (im) foundInstallments = im[1]; }
          if (!foundRate) { const ram = text.match(/Taxa de Juros:\s*([\d\.,]+)%\s*a\.m/i); if (ram) foundRate = parseNum(ram[1]); }
          if (!foundLimit) { const lm = text.match(/Limite aprovado:\*?\s*R\$\s*([\d\.,]+)/i); if (lm) foundLimit = parseNum(lm[1]); }
          if (!foundPmt) { const pm = text.match(/Valor da Parcela:\*\s*R\$\s*([\d\.,]+)/i); if (pm) foundPmt = parseNum(pm[1]); }
          if (!foundDebt) { const dm = text.match(/Valor Total da D[ií]vida:\*\s*R\$\s*([\d\.,]+)/i); if (dm) foundDebt = parseNum(dm[1]); }
          if (!foundRevenue && isBot && /faturamento médio mensal/i.test(text)) {
            const next = mList.slice(i + 1).find((nm: any) => !['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(nm.sender_type || '').toLowerCase()));
            if (next) { const v = parseFloat(String(next.content || '').replace(/\D+/g, '')); if (v) foundRevenue = v; }
          }
        }

        const dynamicMeta = {
          ...(enrichedLead?.metadata || {}), ...(conv.metadata || {}),
          cnpj: foundCnpj || enrichedLead?.identifier || enrichedLead?.metadata?.cnpj,
          razao_social: foundCompanyName || enrichedLead?.name || conv.user_name,
          requested_amount: foundReqAmount || enrichedLead?.metadata?.requested_amount || 25000,
          requested_installments: foundInstallments ? Number(foundInstallments) : undefined,
          max_installments: foundInstallments || enrichedLead?.metadata?.max_installments || '12',
          interest_rate: foundRate || enrichedLead?.metadata?.interest_rate || 2.52,
          approved_limit: foundLimit || enrichedLead?.metadata?.approved_limit || 500000,
          revenue: foundRevenue || enrichedLead?.metadata?.revenue || conv.metadata?.revenue,
          loan_request_id: enrichedLead?.metadata?.loan_request_id || conv.metadata?.loan_request_id,
          offer_data: {
            ...(enrichedLead?.metadata?.offer_data || {}),
            ...(foundPmt ? { VlrParcela: foundPmt } : {}),
            ...(foundDebt ? { VlrTotalDivida: foundDebt } : {})
          }
        };

        addQualifiedLead({
          id: enrichedLead?.id || conv.id,
          convId: conv.id,
          name: foundCompanyName || enrichedLead?.name || conv.user_name || 'Cliente',
          phone: conv.user_identifier,
          cnpj: dynamicMeta.cnpj,
          metadata: dynamicMeta,
          date: new Date(conv.last_message_at || conv.created_at),
          source: 'fiserv_credit',
          matchedConv: conv,
          campaignId: enrichedLead?.campaign_id || conv.campaign_id || conv.metadata?.campaign_id
        });
      }

      for (const a of auditLogs) {
        if (a.is_approved || a.action === 'simulate' || a.action === 'confirm') {
          const cleanPhone = String(a.contact_phone || '').replace(/\D/g, '');
          if (cleanPhone.replace(/^55/, '').length < 8 || processedPhones.has(cleanPhone)) continue;
          if (a.status_fiserv === 'error' || a.status_fiserv === 'denied') continue;
          const enrichedLead = leadByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? leadByPhone.get(cleanPhone.slice(2)) : null);
          const queueItem = queueByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? queueByPhone.get(cleanPhone.slice(2)) : null);
          const candidateCampaignId = enrichedLead?.campaign_id || queueItem?.campaign_id || a.offer_data?.campaign_id;
          addQualifiedLead({
            id: enrichedLead?.id || a.id,
            convId: getBestConvForPhone(cleanPhone, candidateCampaignId)?.id,
            name: a.contact_name || enrichedLead?.name || 'Cliente',
            phone: a.contact_phone,
            cnpj: a.registration_code || enrichedLead?.identifier,
            metadata: { offer_data: a.offer_data, loan_request_id: a.loan_request_id, fiserv_status: a.status_fiserv, ...(enrichedLead?.metadata || {}) },
            date: new Date(a.created_at),
            source: 'fiserv_credit',
            matchedConv: getBestConvForPhone(cleanPhone, candidateCampaignId),
            campaignId: candidateCampaignId
          });
        }
      }

      rawLeads.filter((l: any) => ['converted', 'formalization_pending', 'finalizacao_sucesso'].includes(l.status)).forEach((cl: any) => {
        const phone = cl.whatsapp || cl.phone;
        const cleanPhone = String(phone || '').replace(/\D/g, '');
        addQualifiedLead({
          id: cl.id, name: cl.name, phone, cnpj: cl.identifier, metadata: cl.metadata,
          date: cl.metadata?.fiserv_requested_at ? new Date(cl.metadata.fiserv_requested_at) : new Date(cl.created_at),
          source: 'fiserv_credit', matchedConv: getBestConvForPhone(cleanPhone, cl.campaign_id), campaignId: cl.campaign_id
        });
      });

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
  async updatePipelineStage(
    leadId: string, 
    stage: PipelineStage, 
    conversationId?: string, 
    operatorName?: string, 
    operatorId?: string,
    phone?: string,
    cnpj?: string
  ): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // Mapeamento automático de formalization_status alinhado aos dashboards e funil
      let formalizationStatus: string | undefined;
      if (stage === 'contract_signed') formalizationStatus = 'formalized';
      else if (stage === 'declined') formalizationStatus = 'lost';
      else if (stage === 'in_contact') formalizationStatus = 'in_service';
      else if (stage === 'pending_contact') formalizationStatus = 'waiting_contact';

      // 1. Tentar encontrar o registro em agent_leads (por ID direto, telefone ou CNPJ)
      let targetLead: { id: string; metadata: any } | null = null;
      const { data: leadById } = await supabase
        .from('agent_leads')
        .select('id, metadata')
        .eq('id', leadId)
        .maybeSingle();

      if (leadById) {
        targetLead = leadById;
      } else {
        // Se não achou por ID (ex: leadId era o conversationId), buscar por telefone
        let phoneToSearch = phone;
        if (!phoneToSearch && (conversationId || leadId)) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('user_identifier')
            .eq('id', conversationId || leadId)
            .maybeSingle();
          if (conv?.user_identifier) {
            phoneToSearch = conv.user_identifier;
          }
        }

        if (phoneToSearch) {
          const variations = getPhoneVariations(phoneToSearch);
          const { data: leadByPhone } = await supabase
            .from('agent_leads')
            .select('id, metadata')
            .in('whatsapp', variations)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (leadByPhone) {
            targetLead = leadByPhone;
          }
        }

        if (!targetLead && cnpj) {
          const cleanCnpj = cnpj.replace(/\D/g, '');
          const { data: leadByCnpj } = await supabase
            .from('agent_leads')
            .select('id, metadata')
            .eq('identifier', cleanCnpj)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (leadByCnpj) {
            targetLead = leadByCnpj;
          }
        }
      }

      if (targetLead) {
        const updatedMeta = {
          ...(targetLead.metadata || {}),
          pipeline_stage: stage,
          pipeline_updated_at: now,
          ...(formalizationStatus ? { formalization_status: formalizationStatus } : {}),
          ...(stage === 'contract_signed' ? { formalized_at: now } : {}),
          ...(stage === 'declined' ? { decline_at: now } : {}),
          ...(operatorName ? { operator_name: operatorName } : {}),
          ...(operatorId ? { operator_id: operatorId } : {})
        };

        const leadPayload: any = { metadata: updatedMeta };
        if (stage === 'declined') {
          leadPayload.status = 'cancelled';
        }

        await supabase
          .from('agent_leads')
          .update(leadPayload)
          .eq('id', targetLead.id);
      }

      // 2. Persistir em conversations (se houver conversationId ou se leadId for o id da conversa)
      const targetConvId = conversationId || (leadId !== targetLead?.id ? leadId : null);
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
            ...(formalizationStatus ? { formalization_status: formalizationStatus } : {}),
            ...(stage === 'contract_signed' ? { formalized_at: now } : {}),
            ...(stage === 'declined' ? { decline_at: now } : {}),
            ...(operatorName ? { operator_name: operatorName } : {}),
            ...(operatorId ? { operator_id: operatorId } : {})
          };

          const convUpdatePayload: any = { metadata: updatedConvMeta };
          if (operatorId) {
            convUpdatePayload.assigned_operator_id = operatorId;
          }

          await supabase
            .from('conversations')
            .update(convUpdatePayload)
            .eq('id', conv.id);
        }
      }

      return true;
    } catch (e) {
      console.error('❌ Erro ao atualizar pipeline stage no banco:', e);
      return false;
    }
  },

  /**
   * Operador libera o atendimento: remove o vínculo do operador e retorna
   * o lead para a fila de "Pendente de Contato".
   * A Sofia (IA) CONTINUA PAUSADA (não altera o status para ai_active).
   */
  async releaseLeadToQueue(leadId: string, conversationId?: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // 1. Atualizar agent_leads se existir
      const { data: lead } = await supabase
        .from('agent_leads')
        .select('id, metadata')
        .eq('id', leadId)
        .maybeSingle();

      if (lead) {
        const updatedMeta = {
          ...(lead.metadata || {}),
          pipeline_stage: 'pending_contact',
          formalization_status: 'waiting_contact',
          operator_name: null,
          operator_id: null,
          released_to_queue_at: now,
          pipeline_updated_at: now
        };

        await supabase
          .from('agent_leads')
          .update({ metadata: updatedMeta })
          .eq('id', lead.id);
      }

      // 2. Atualizar conversations: desvincular assigned_operator_id e manter Sofia pausada
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
            pipeline_stage: 'pending_contact',
            formalization_status: 'waiting_contact',
            operator_name: null,
            operator_id: null,
            released_to_queue_at: now,
            pipeline_updated_at: now
          };

          await supabase
            .from('conversations')
            .update({
              assigned_operator_id: null,
              metadata: updatedConvMeta
            })
            .eq('id', conv.id);
        }
      }

      return true;
    } catch (e) {
      console.error('❌ Erro ao liberar lead para a fila:', e);
      return false;
    }
  },

  /**
   * Registra a desistência da contratação pelo cliente.
   * Atualiza o status para 'declined', define motivo e atualiza formalization_status para 'lost'.
   */
  async declineLead(
    leadId: string, 
    conversationId?: string, 
    reason?: string, 
    operatorName?: string, 
    operatorId?: string
  ): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // 1. Atualizar agent_leads se existir
      const { data: lead } = await supabase
        .from('agent_leads')
        .select('id, metadata')
        .eq('id', leadId)
        .maybeSingle();

      if (lead) {
        const updatedMeta = {
          ...(lead.metadata || {}),
          pipeline_stage: 'declined',
          formalization_status: 'lost',
          decline_reason: reason || 'Não informado',
          decline_at: now,
          pipeline_updated_at: now,
          ...(operatorName ? { decline_operator_name: operatorName } : {}),
          ...(operatorId ? { decline_operator_id: operatorId } : {})
        };

        await supabase
          .from('agent_leads')
          .update({
            status: 'cancelled',
            metadata: updatedMeta
          })
          .eq('id', lead.id);
      }

      // 2. Atualizar conversations
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
            pipeline_stage: 'declined',
            formalization_status: 'lost',
            decline_reason: reason || 'Não informado',
            decline_at: now,
            pipeline_updated_at: now,
            ...(operatorName ? { decline_operator_name: operatorName } : {}),
            ...(operatorId ? { decline_operator_id: operatorId } : {})
          };

          await supabase
            .from('conversations')
            .update({
              metadata: updatedConvMeta
            })
            .eq('id', conv.id);
        }
      }

      return true;
    } catch (e) {
      console.error('❌ Erro ao registrar desistência do lead:', e);
      return false;
    }
  }
};
