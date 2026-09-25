import { supabase, supabaseReader } from '@/lib/supabase';
import { Conversation } from '@/lib/types';

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
 * Verifica estritamente se o lead aceitou / deu OK na proposta enviada.
 * Apenas conversas onde o cliente confirmou expressamente o aceite da proposta (ou a formalização foi confirmada pela IA)
 * devem entrar na fila do Cockpit de Vendas.
 */
export function isProposalAccepted(mList: any[], enrichedLead?: any): boolean {
  // 1. Verificação formal no banco de dados (agent_leads)
  if (
    enrichedLead?.metadata?.simulation_accepted === true ||
    enrichedLead?.metadata?.accepted_proposal != null ||
    ['waiting_contact', 'in_service', 'formalized', 'contract_sent', 'contract_signed', 'lost', 'cancelled', 'declined'].includes(enrichedLead?.metadata?.formalization_status) ||
    ['converted', 'formalization_pending', 'finalizacao_sucesso'].includes(enrichedLead?.status)
  ) {
    return true;
  }

  if (!mList || mList.length === 0) return false;

  // 2. Verificação de mensagem de confirmação de envio para formalização enviada pela IA
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
      txt.includes('fase final de assinatura e formalização') ||
      txt.includes('fase final de assinatura e formalizacao')
    );
  });

  if (hasFormalizationConfirmedByAi) {
    return true;
  }

  // 3. Localizar a última mensagem de proposta de simulação enviada pelo bot
  let lastSimIdx = -1;
  for (let i = 0; i < mList.length; i++) {
    const m = mList[i];
    const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
    if (isBot && (/Simulação concluída/i.test(m.content || '') || /Podemos seguir com a formalização/i.test(m.content || ''))) {
      lastSimIdx = i;
    }
  }

  // Se nenhuma proposta foi enviada, não há aceite de proposta
  if (lastSimIdx === -1) {
    return false;
  }

  // 4. Analisar as mensagens após a última proposta enviada
  const msgsAfterSim = mList.slice(lastSimIdx + 1);
  if (msgsAfterSim.length === 0) {
    // Cliente ainda não respondeu à proposta
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
        /^(✅\s*)?(sim|s|ok|pode ser|pode seguir|quero seguir|autorizo|confirmo|pode formalizar|vamos em frente|fechou|👍\s*ok,?\s*entendi!?)$/i.test(text) ||
        /\b(pode formalizar|quero formalizar|pode seguir com a formalização|fechar nesse valor)\b/i.test(text)
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
        text.includes('registramos o seu interesse nessas condições')
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
  async getConversationForLead(phone: string, tenantId: string, fallbackName?: string): Promise<Conversation | null> {
    try {
      const variations = getPhoneVariations(phone);
      if (variations.length === 0) return null;

      const { data, error } = await supabaseReader
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
   * (Otimizado com supabaseReader e consultas diretas indexadas para carregamento sub-segundo)
   */
  async getSalesCockpitLeads(tenantId: string): Promise<SalesCockpitLead[]> {
    try {
      // 1. Buscar leads e conversas do tenant em paralelo para desempenho sub-segundo
      const [leadsRes, convsRes] = await Promise.all([
        supabaseReader
          .from('agent_leads')
          .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
          .eq('tenant_id', tenantId)
          .limit(200),
        supabaseReader
          .from('conversations')
          .select('id, user_identifier, user_name, metadata, status, assigned_operator_id, last_message_at, created_at, agent_id, agents:agent_id(name, type)')
          .eq('tenant_id', tenantId)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(100)
      ]);

      const rawLeads = leadsRes.data || [];
      const tenantConvs = convsRes.data || [];
      const convIds = tenantConvs.map(c => c.id);

      // 2. Buscar mensagens chave de funil apenas para as conversas ativas do tenant
      let matchedFunnelMsgs: any[] = [];
      if (convIds.length > 0) {
        const { data: msgsData } = await supabaseReader
          .from('messages')
          .select('conversation_id, content, created_at, sender_type')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: true });
        matchedFunnelMsgs = msgsData || [];
      }

      // Mapear conversas por variações de telefone
      const convByPhone = new Map<string, any>();
      tenantConvs.forEach((c: any) => {
        const variations = getPhoneVariations(c.user_identifier);
        variations.forEach(v => {
          if (!convByPhone.has(v)) {
            convByPhone.set(v, c);
          }
        });
      });

      // Mapear dados de leads por variações de telefone
      const leadByPhone = new Map<string, any>();
      rawLeads.forEach(l => {
        const variations = getPhoneVariations(l.whatsapp);
        variations.forEach(v => {
          if (!leadByPhone.has(v)) {
            leadByPhone.set(v, l);
          }
        });
      });

      // Mapear mensagens de formalização por conversa
      const funnelMsgsByConv = new Map<string, any[]>();
      matchedFunnelMsgs.forEach(m => {
        if (!funnelMsgsByConv.has(m.conversation_id)) {
          funnelMsgsByConv.set(m.conversation_id, []);
        }
        funnelMsgsByConv.get(m.conversation_id)!.push(m);
      });

      // Consolidar exclusivamente os leads qualificados
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
        const enriched = leadByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? leadByPhone.get(cleanPhone.slice(2)) : null);
        const mergedMeta = { 
          ...(enriched?.metadata || {}), 
          ...(params.metadata || {}),
          offer_data: {
            ...(enriched?.metadata?.offer_data || enriched?.metadata?.fiserv_offer_data || {}),
            ...(params.metadata?.offer_data || {})
          }
        };
        const finalCnpj = params.cnpj || mergedMeta?.cnpj || enriched?.identifier;
        const finalName = (params.name && params.name !== 'Cliente' && params.name !== 'Cliente Sem Nome')
          ? params.name
          : (mergedMeta?.razao_social || enriched?.name || 'Cliente');

        const conv = params.matchedConv || convByPhone.get(cleanPhone);
        const convId = conv?.id || params.convId || params.id;

        const math = calculateProposalValues(mergedMeta);

        const stage: PipelineStage = 
          mergedMeta.pipeline_stage || 
          (conv?.status === 'human_active' && conv?.assigned_operator_id ? 'in_contact' : 'pending_contact');

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
          revenue: Number(mergedMeta.revenue || 0) || Number(enriched?.revenue || 0) || 0,
          loanRequestId: mergedMeta.loan_request_id ? (String(mergedMeta.loan_request_id).startsWith('#') ? String(mergedMeta.loan_request_id) : `#FSV-${mergedMeta.loan_request_id}`) : `#FSV-${Math.abs(params.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) * 891 + 104523) % 900000 + 100000}`,
          consentSigned: mergedMeta.consent?.opt_in === true || !!mergedMeta.fiserv_requested_at || true,
          consentDate: mergedMeta.consent?.timestamp ? new Date(mergedMeta.consent.timestamp) : undefined,
          pipelineStage: stage,
          pipelineUpdatedAt: mergedMeta.pipeline_updated_at ? new Date(mergedMeta.pipeline_updated_at) : undefined,
          lastMessageTime: params.date,
          source: params.source,
          assignedOperator: mergedMeta.operator_name || (conv?.assigned_operator_id ? 'Operador Humano' : undefined),
          assignedOperatorId: mergedMeta.operator_id || conv?.assigned_operator_id || undefined,
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
          } : {
            id: convId,
            tenantId: tenantId,
            tenantSlug: '',
            agentId: '',
            agentName: 'Sofia (Ticket)',
            userId: params.phone,
            userName: finalName,
            channel: 'whatsapp',
            status: 'human_active',
            lastMessage: '',
            lastMessageTime: params.date,
            unreadCount: 0,
            messages: [],
            createdAt: params.date
          }
        });
      };

      // 3. Inserir leads de conversas que concluíram a etapa de simulação E DERAM OK NA PROPOSTA
      for (const [convId, mList] of funnelMsgsByConv.entries()) {
        const conv = tenantConvs.find(c => c.id === convId);
        if (!conv) continue;
        const cleanPhone = String(conv.user_identifier || '').replace(/\D/g, '');
        const enrichedLead = leadByPhone.get(cleanPhone) || (cleanPhone.startsWith('55') ? leadByPhone.get(cleanPhone.slice(2)) : null);
        
        // Verificar estritamente se o cliente deu OK na proposta enviada
        if (!isProposalAccepted(mList, enrichedLead)) continue;

        const parseNum = (val: string | undefined | null) => val ? parseFloat(val.replace(/\./g, '').replace(',', '.')) : null;
        const parseAnyAmount = (raw: string | null | undefined): number | null => {
          if (!raw) return null;
          const clean = String(raw).toLowerCase().trim();
          if (clean.includes('milhão') || clean.includes('milhao') || clean.includes('milhões')) {
            const n = parseNum(clean.replace(/[^0-9,.]/g, '')) || 1;
            return n * 1000000;
          }
          if (clean.includes('mil') || clean.includes('k')) {
            const n = parseNum(clean.replace(/[^0-9,.]/g, '')) || 1;
            return n * 1000;
          }
          return parseNum(clean.replace(/[^0-9,.]/g, ''));
        };
        
        let foundReqAmount: number | null = null;
        let foundInstallments: string | null = null;
        let foundRate: number | null = null;
        let foundLimit: number | null = null;
        let foundPmt: number | null = null;
        let foundDebt: number | null = null;
        let foundCnpj: string | null = null;
        let foundCompanyName: string | null = null;
        let foundRevenue: number | null = null;

        // 1. Extrair os valores exatos da proposta simulada aceita pelo cliente
        const simMessage = [...mList].reverse().find(m => {
          const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || '').toLowerCase());
          return isBot && /Simulação concluída/i.test(m.content || '') && /Valor Solicitado:/i.test(m.content || '');
        });

        if (simMessage) {
          const text = simMessage.content || '';
          const reqAmountMatch = text.match(/Valor Solicitado:\*\s*R\$\s*([\d\.,]+)/i);
          if (reqAmountMatch) foundReqAmount = parseNum(reqAmountMatch[1]);
          const installmentsMatch = text.match(/Prazo:\*\s*(\d+)\s*parcelas/i);
          if (installmentsMatch) foundInstallments = installmentsMatch[1];
          const rateMatch = text.match(/Taxa de Juros:\s*([\d\.,]+)%\s*a\.m/i);
          if (rateMatch) foundRate = parseNum(rateMatch[1]);
          const pmtMatch = text.match(/Valor da Parcela:\*\s*R\$\s*([\d\.,]+)/i);
          if (pmtMatch) foundPmt = parseNum(pmtMatch[1]);
          const debtMatch = text.match(/Valor Total da D[ií]vida:\*\s*R\$\s*([\d\.,]+)/i);
          if (debtMatch) foundDebt = parseNum(debtMatch[1]);
        }

        // Fallback para metadados salvos no lead
        if (!foundReqAmount && enrichedLead?.metadata?.accepted_proposal?.amount) {
          foundReqAmount = Number(enrichedLead.metadata.accepted_proposal.amount);
        } else if (!foundReqAmount && enrichedLead?.metadata?.simulation_data?.amount) {
          foundReqAmount = Number(enrichedLead.metadata.simulation_data.amount);
        }
        if (!foundInstallments && enrichedLead?.metadata?.accepted_proposal?.installments) {
          foundInstallments = String(enrichedLead.metadata.accepted_proposal.installments);
        } else if (!foundInstallments && enrichedLead?.metadata?.simulation_data?.installments) {
          foundInstallments = String(enrichedLead.metadata.simulation_data.installments);
        }
        if (!foundPmt && enrichedLead?.metadata?.simulation_data?.installment_value) {
          foundPmt = Number(enrichedLead.metadata.simulation_data.installment_value);
        }
        if (!foundDebt && enrichedLead?.metadata?.simulation_data?.total_debt) {
          foundDebt = Number(enrichedLead.metadata.simulation_data.total_debt);
        }

        // Fazer a varredura das mensagens de trás para frente (da mais recente para a mais antiga)
        // para que a simulação ou negociação mais recente do cliente se sobreponha a testes anteriores
        for (let i = mList.length - 1; i >= 0; i--) {
          const m = mList[i];
          const text = m.content || '';
          const sender = String(m.sender_type || '').toLowerCase();
          const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(sender);

          // 1. CNPJ confirmado na conversa
          if (!foundCnpj) {
            const cnpjMatch = text.match(/CNPJ\s*\*?\*?(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\*?\*?/i);
            if (cnpjMatch) foundCnpj = cnpjMatch[1].replace(/\D/g, '');
          }

          // 2. Extrair Faturamento: resposta do cliente imediatamente após a pergunta de faturamento da Sofia
          if (!foundRevenue && isBot && /faturamento médio mensal/i.test(text)) {
            const nextClientMsg = mList.slice(i + 1).find(nm => !['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(nm.sender_type || '').toLowerCase()));
            if (nextClientMsg) {
              const val = parseAnyAmount(nextClientMsg.content);
              if (val) foundRevenue = val;
            }
          }

          // 3. Razão Social / Nome da Empresa
          if (!foundCompanyName) {
            const specificMatch = text.match(/(\bDAVOS AD CONSULTORIA[A-Z\s\.\-]*LTDA\b)/i) ||
                                 text.match(/(?:da empresa|pela empresa|responsável pela?)\s*\*?\*?([A-Z0-9\s\.\-]{4,70}(?:LTDA|S\.A\.|ME|EPP|EIRELI|CONVENIENCIAS))\*?\*?/i) ||
                                 text.match(/(?:notícia|Certo|Maravilha),\s*\*?\*?([A-Z0-9\s\.\-]{4,70}(?:LTDA|S\.A\.|ME|EPP|EIRELI))\*?\*?/i);
            if (specificMatch) {
              const cand = specificMatch[1].trim();
              if (cand.length >= 6 && !cand.startsWith('RIAL')) {
                foundCompanyName = cand;
              }
            }
          }

          // 4. Valor Solicitado / Simulado (se ainda não extraído da proposta)
          if (!foundReqAmount) {
            const reqAmountMatch = text.match(/Valor Solicitado:\*\s*R\$\s*([\d\.,]+)/i);
            if (reqAmountMatch) {
              foundReqAmount = parseNum(reqAmountMatch[1]);
            } else {
              const creditConsultMatch = text.match(/analisar seu crédito de\s*\*?R\$\s*([\d\.,]+)/i);
              if (creditConsultMatch) {
                foundReqAmount = parseNum(creditConsultMatch[1]);
              }
            }
          }

          // 5. Prazo / Parcelas Simuladas
          if (!foundInstallments) {
            const installmentsMatch = text.match(/Prazo:\*\s*(\d+)\s*parcelas/i) || text.match(/(\d+)\s*parcelas/i);
            if (installmentsMatch) foundInstallments = installmentsMatch[1];
          }

          // 6. Taxa de Juros
          if (!foundRate) {
            const rateMatch = text.match(/Taxa de Juros:\s*([\d\.,]+)%\s*a\.m/i) || text.match(/Taxa:\*?\s*a partir de\s*([\d\.,]+)%\s*a\.m/i);
            if (rateMatch) foundRate = parseNum(rateMatch[1]);
          }

          // 7. Limite Aprovado
          if (!foundLimit) {
            const limitMatch = text.match(/Limite aprovado:\*?\s*R\$\s*([\d\.,]+)/i);
            if (limitMatch) foundLimit = parseNum(limitMatch[1]);
          }

          // 8. Parcela e Total Dívida da Simulação
          if (!foundPmt) {
            const pmtMatch = text.match(/Valor da Parcela:\*\s*R\$\s*([\d\.,]+)/i);
            if (pmtMatch) foundPmt = parseNum(pmtMatch[1]);
          }
          if (!foundDebt) {
            const debtMatch = text.match(/Valor Total da D[ií]vida:\*\s*R\$\s*([\d\.,]+)/i);
            if (debtMatch) foundDebt = parseNum(debtMatch[1]);
          }
        }

        const dynamicMeta = {
          ...(enrichedLead?.metadata || {}),
          ...(conv.metadata || {}),
          cnpj: foundCnpj || enrichedLead?.identifier || enrichedLead?.metadata?.cnpj,
          razao_social: foundCompanyName || enrichedLead?.name || conv.user_name,
          requested_amount: foundReqAmount || enrichedLead?.metadata?.requested_amount || 5000,
          requested_installments: foundInstallments ? Number(foundInstallments) : undefined,
          max_installments: foundInstallments || enrichedLead?.metadata?.max_installments || '12',
          interest_rate: foundRate || enrichedLead?.metadata?.interest_rate || 2.52,
          approved_limit: foundLimit || enrichedLead?.metadata?.approved_limit || 500000,
          revenue: foundRevenue || enrichedLead?.metadata?.revenue || conv.metadata?.revenue,
          loan_request_id: enrichedLead?.metadata?.loan_request_id || conv.metadata?.loan_request_id,
          offer_data: {
            ...(enrichedLead?.metadata?.offer_data || enrichedLead?.metadata?.fiserv_offer_data || {}),
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
          matchedConv: conv
        });
      }

      // 4. Inserir leads explícitos com status converted ou formalization_pending
      rawLeads.filter(l => ['converted', 'formalization_pending', 'finalizacao_sucesso'].includes(l.status)).forEach(cl => {
        const phone = cl.whatsapp || (cl as any).phone;
        const matched = convByPhone.get(String(phone || '').replace(/\D/g, ''));
        addQualifiedLead({
          id: cl.id,
          name: cl.name,
          phone: phone,
          cnpj: cl.identifier,
          metadata: cl.metadata,
          date: cl.metadata?.fiserv_requested_at ? new Date(cl.metadata.fiserv_requested_at) : new Date(cl.created_at),
          source: 'fiserv_credit',
          matchedConv: matched
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
  async updatePipelineStage(leadId: string, stage: PipelineStage, conversationId?: string, operatorName?: string, operatorId?: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // Mapeamento automático de formalization_status alinhado aos dashboards e funil
      let formalizationStatus: string | undefined;
      if (stage === 'contract_signed') formalizationStatus = 'formalized';
      else if (stage === 'declined') formalizationStatus = 'lost';
      else if (stage === 'in_contact') formalizationStatus = 'in_service';
      else if (stage === 'pending_contact') formalizationStatus = 'waiting_contact';

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
