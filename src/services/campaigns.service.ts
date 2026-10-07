import { supabase, supabaseReader } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

const parseLocalDate = (d: any): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d === 'string') {
        const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const [, y, m, day] = match;
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(day), 12, 0, 0);
        }
    }
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    if (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0) {
        return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 12, 0, 0);
    }
    return dt;
};

export const campaignsService = {
    normalizePhone(phone?: string | null): string {
        return String(phone || '').replace(/\D/g, '');
    },

    getPhoneVariants(phone?: string | null): string[] {
        const normalized = this.normalizePhone(phone);
        if (!normalized) return [];

        const variants = new Set<string>([normalized]);

        if (normalized.startsWith('55') && normalized.length > 11) {
            variants.add(normalized.slice(2));
        } else {
            variants.add(`55${normalized}`);
        }

        if (normalized.length >= 8) {
            variants.add(normalized.slice(-8));
        }
        if (normalized.length >= 9) {
            variants.add(normalized.slice(-9));
        }

        return Array.from(variants);
    },

async getOutboundQueue(tenantId: string, agentId?: string, campaignId?: string): Promise<import('@/lib/types').OutboundContact[]> {
        let query = supabase
            .from('outbound_queue')
            .select('*')
            .eq('tenant_id', tenantId);

        if (agentId) query = query.eq('agent_id', agentId);
        if (campaignId) query = query.eq('campaign_id', campaignId);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching outbound queue:', error);
            return [];
        }

        return data.map((d: any) => ({
            id: d.id,
            tenantId: d.tenant_id,
            agentId: d.agent_id,
            campaignId: d.campaign_id,
            contactName: d.contact_name,
            contactPhone: d.contact_phone,
            metadata: d.metadata,
            status: d.status,
            errorMessage: d.error_message,
            retryCount: d.retry_count,
            responseDetected: d.response_detected,
            scheduledAt: new Date(d.scheduled_at),
            lastAttemptAt: d.last_attempt_at ? new Date(d.last_attempt_at) : undefined,
            sentAt: d.sent_at ? new Date(d.sent_at) : undefined,
            reengagementAttemptCount: d.reengagement_attempt_count,
            reengagementLastSentAt: d.reengagement_last_sent_at ? new Date(d.reengagement_last_sent_at) : undefined,
            createdAt: new Date(d.created_at)
        }));
    },

    async getOutboundQueueMetricsByCampaign(tenantId: string, useReplica: boolean = false): Promise<Record<string, { total: number; sent: number; delivered: number }>> {
        const client = useReplica ? supabaseReader : supabase;
        const { data, error } = await client
            .from('outbound_queue')
            .select('campaign_id,status')
            .eq('tenant_id', tenantId)
            .not('campaign_id', 'is', null);

        if (error) {
            console.error('Error fetching outbound queue metrics by campaign:', error);
            return {};
        }

        return (data || []).reduce((acc: Record<string, { total: number; sent: number; delivered: number }>, row: any) => {
            const campaignId = row.campaign_id;
            if (!campaignId) return acc;

            if (!acc[campaignId]) {
                acc[campaignId] = { total: 0, sent: 0, delivered: 0 };
            }

            acc[campaignId].total += 1;
            if (row.status === 'sent') {
                acc[campaignId].sent += 1;
            } else if (row.status === 'delivered') {
                acc[campaignId].sent += 1; // Delivered also means it was sent
                acc[campaignId].delivered += 1;
            }

            return acc;
        }, {});
    },

    async getEnrichedOutboundQueue(tenantId: string, campaignId?: string): Promise<any[]> {
        const { data, error } = await supabaseReader.rpc('get_campaign_leads_enriched', {
            p_campaign_id: campaignId || null,
            p_tenant_id: tenantId
        });

        let queueRows = data as any[] || [];

        if (error) {
            console.error('Error fetching enriched outbound queue:', error);

            // Fallback: keep the screen working even if the RPC is temporarily unavailable
            // (e.g. schema cache lag after altering the function).
            const fallbackQueue = await this.getOutboundQueue(tenantId, undefined, campaignId);
            queueRows = fallbackQueue.map((row: any) => ({
                id: row.id,
                contact_phone: row.contactPhone,
                contact_name: row.contactName,
                status: row.status,
                metadata: row.metadata,
                cnpj: row.metadata?.cnpj || null,
                establishment_name: null,
                error_message: row.errorMessage,
                response_detected: row.responseDetected,
                is_converted: false,
                sent_at: row.sentAt,
                clicked_button: false
            }));
        }

        // Optimize outbound_queue fetch: filter by campaign_id database-side if campaignId is present,
        // and only select the necessary columns to minimize memory/payload size.
        let queueQuery = supabase
            .from('outbound_queue')
            .select('id, conversation_id, sent_at, created_at, campaign_id, response_detected')
            .eq('tenant_id', tenantId);

        if (campaignId) {
            queueQuery = queueQuery.eq('campaign_id', campaignId);
        }

        // Fetch queueContextData and agent_leads selectively
        // Only fetch agent_leads if there was an RPC error OR if we have rows with missing establishment_name
        const needsAgentLeads = error || queueRows.some((row: any) => !String(row.establishment_name || '').trim());
        const phonesToFetch = needsAgentLeads ? Array.from(new Set(queueRows.map((r: any) => r.contact_phone).filter(Boolean))) : [];

        const [leadsResult, queueContextResult] = await Promise.all([
            needsAgentLeads && phonesToFetch.length > 0
                ? supabase
                    .from('agent_leads')
                    .select('whatsapp, name, identifier')
                    .eq('tenant_id', tenantId)
                    .in('whatsapp', phonesToFetch)
                : Promise.resolve({ data: [], error: null }),
            queueQuery.order('created_at', { ascending: false })
        ]);

        const leadsData = leadsResult.data || [];
        const leadsError = leadsResult.error;
        const queueContextData = queueContextResult.data || [];
        const queueContextError = queueContextResult.error;

        if (leadsError) {
            console.error('Error fetching establishment names for outbound queue:', leadsError);
        }

        if (queueContextError) {
            console.error('Error fetching queue context for analytics:', queueContextError);
        }

        const establishmentMap = new Map<string, string>();
        const establishmentByIdentifier = new Map<string, string>();
        for (const lead of leadsData || []) {
            const establishmentName = String((lead as any).name || '').trim();
            if (!establishmentName) continue;

            for (const variant of this.getPhoneVariants((lead as any).whatsapp)) {
                if (!establishmentMap.has(variant)) {
                    establishmentMap.set(variant, establishmentName);
                }
            }

            const identifier = String((lead as any).identifier || '').trim();
            if (identifier && !establishmentByIdentifier.has(identifier)) {
                establishmentByIdentifier.set(identifier, establishmentName);
            }
        }

        const queueContextById = new Map<string, any>();
        for (const row of queueContextData || []) {
            queueContextById.set((row as any).id, row);
        }

        return queueRows.map((d: any) => ({
            ...(queueContextById.get(d.id) || {}),
            id: d.id,
            contactPhone: d.contact_phone,
            contactName: d.contact_name,
            establishmentName:
                String(d.establishment_name || '').trim() ||
                establishmentByIdentifier.get(String(d.cnpj || '').trim()) ||
                this.getPhoneVariants(d.contact_phone)
                    .map(variant => establishmentMap.get(variant))
                    .find(Boolean),
            status: d.status,
            metadata: d.metadata,
            cnpj: d.cnpj,
            conversationId: (queueContextById.get(d.id) as any)?.conversation_id || d.conversation_id || d.metadata?.conversation_id || null,
            responseDetected: Boolean(d.response_detected),
            response_detected: Boolean(d.response_detected),
            is_converted: Boolean(d.is_converted),
            clickedButton: Boolean(d.clicked_button),
            sentAt: (queueContextById.get(d.id) as any)?.sent_at || null,
            createdAt: (queueContextById.get(d.id) as any)?.created_at || null,
            campaignId: (queueContextById.get(d.id) as any)?.campaign_id || campaignId || null
        }));
    },

    async getConversationAnalytics(
        tenantId: string,
        params: {
            conversationId?: string | null;
            phone?: string | null;
            campaignId?: string | null;
            leadId?: string | null;
        }
    ): Promise<any | null> {
        const variants = this.getPhoneVariants(params.phone);
        const normalizedVariants = new Set(variants);

        let conversation: any | null = null;

        if (params.conversationId) {
            const { data: conversationById, error: conversationByIdError } = await supabaseReader
                .from('conversations')
                .select('id, user_name, user_identifier, last_message_at, created_at, duration_seconds, sentiment, agent_id, channel, status, campaign_id, agents!conversations_agent_id_fkey(name)')
                .eq('tenant_id', tenantId)
                .eq('id', params.conversationId)
                .maybeSingle();

            if (conversationByIdError) {
                console.error('Error fetching conversation by id for analytics:', conversationByIdError);
            }

            conversation = conversationById;
        }

        if (!conversation && variants.length > 0) {
            const baseQuery = supabaseReader
                .from('conversations')
                .select('id, user_name, user_identifier, last_message_at, created_at, duration_seconds, sentiment, agent_id, channel, status, campaign_id, agents!conversations_agent_id_fkey(name)')
                .eq('tenant_id', tenantId)
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false });

            const exactQuery = params.campaignId
                ? baseQuery.eq('campaign_id', params.campaignId).in('user_identifier', variants)
                : baseQuery.in('user_identifier', variants);

            const { data: exactMatches, error: exactMatchesError } = await exactQuery;

            if (exactMatchesError) {
                console.error('Error fetching conversation analytics by exact phone:', exactMatchesError);
            }

            conversation = (exactMatches as any[] || [])[0] || null;

            if (!conversation) {
                const fallbackQuery = params.campaignId
                    ? baseQuery.eq('campaign_id', params.campaignId).limit(200)
                    : baseQuery.limit(400);

                const { data: fallbackConversations, error: fallbackError } = await fallbackQuery;
                if (fallbackError) {
                    console.error('Error fetching conversation analytics fallback:', fallbackError);
                } else {
                    conversation = (fallbackConversations as any[] || []).find((item) =>
                        normalizedVariants.has(this.normalizePhone(item.user_identifier))
                    ) || null;
                }
            }
        }

        if (!conversation) return null;

        const [{ data: messagesData, error: messagesError }, { data: evaluationsData, error: evaluationsError }, { data: contactsData, error: contactsError }, { data: queueRows, error: queueError }] = await Promise.all([
            supabaseReader
                .from('messages')
                .select('id, created_at, sender_type, direction, content, message_type')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: true }),
            supabaseReader
                .from('evaluations')
                .select('score, summary, tags, criteria_results, ai_model, created_at')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false }),
            variants.length > 0
                ? supabaseReader
                    .from('contacts')
                    .select('id, name, identifier, phone, lifecycle_status, sentiment, tags, status')
                    .eq('tenant_id', tenantId)
                    .or(`identifier.in.(${variants.join(',')}),phone.in.(${variants.join(',')})`)
                    .limit(5)
                : Promise.resolve({ data: [], error: null } as any),
            supabaseReader
                .from('outbound_queue')
                .select('*')
                .eq('tenant_id', tenantId)
                .or(params.leadId
                    ? `id.eq.${params.leadId},conversation_id.eq.${conversation.id}`
                    : `conversation_id.eq.${conversation.id}`)
                .order('created_at', { ascending: false })
        ]);

        if (messagesError) {
            console.error('Error fetching conversation messages for analytics:', messagesError);
        }

        if (evaluationsError) {
            console.error('Error fetching conversation evaluations for analytics:', evaluationsError);
        }

        if (contactsError) {
            console.error('Error fetching contact analytics context:', contactsError);
        }

        if (queueError) {
            console.error('Error fetching queue analytics context:', queueError);
        }

        const messages = messagesData || [];
        const evaluations = evaluationsData || [];
        const latestEvaluation = (evaluations || [])[0] as any;
        const latestQueueRow = (queueRows || [])[0] as any;
        const matchedContact = (contactsData || []).find((contact: any) => {
            const candidates = [contact.identifier, contact.phone].map((value) => this.normalizePhone(value));
            return candidates.some((value) => normalizedVariants.has(value));
        }) as any;
        const lastMessage = messages[messages.length - 1] as any;
        const agentName = (conversation as any).agents?.name || 'Agente';
        const inboundCount = messages.filter((message: any) => {
            const sender = String(message.sender_type || '').toLowerCase();
            const direction = String(message.direction || '').toLowerCase();
            return sender === 'user' || direction === 'inbound';
        }).length;
        const outboundCount = Math.max(messages.length - inboundCount, 0);
        const criteriaResults = latestEvaluation?.criteria_results || {};
        const auditTags = Array.from(new Set(
            (evaluations || []).flatMap((evaluation: any) => evaluation.tags || [])
        ));
        const wasConverted = latestQueueRow?.status === 'converted';
        const responseDetected = Boolean(latestQueueRow?.response_detected);

        return {
            conversationId: conversation.id,
            startedAt: conversation.created_at,
            lastInteractionAt: conversation.last_message_at || lastMessage?.created_at || conversation.created_at,
            participants: {
                contactName: conversation.user_name || matchedContact?.name || 'Contato',
                contactPhone: conversation.user_identifier || params.phone || '-',
                agentName
            },
            durationSeconds: conversation.duration_seconds || 0,
            messageCount: messages.length,
            inboundCount,
            outboundCount,
            predominantSentiment: latestEvaluation?.tags?.[0] || matchedContact?.sentiment || conversation.sentiment || 'Nao identificado',
            topics: auditTags,
            auditTags,
            summary: latestEvaluation?.summary || null,
            score: latestEvaluation?.score ?? null,
            lastMessagePreview: lastMessage?.content || null,
            criteriaResults,
            evaluationCount: evaluations.length,
            latestAuditAt: latestEvaluation?.created_at || null,
            aiModel: latestEvaluation?.ai_model || null,
            wasConverted,
            responseDetected,
            queueStatus: latestQueueRow?.status || null,
            sentAt: latestQueueRow?.sent_at || null,
            campaignId: latestQueueRow?.campaign_id || conversation.campaign_id || params.campaignId || null,
            channel: conversation.channel || null,
            conversationStatus: conversation.status || null,
            contactLifecycleStatus: matchedContact?.lifecycle_status || null,
            contactStatus: matchedContact?.status || null,
            contactTags: matchedContact?.tags || []
        };
    },

    async addToOutboundQueue(contacts: Partial<import('@/lib/types').OutboundContact>[]): Promise<void> {
        const dbPayload = contacts.map(c => ({
            tenant_id: c.tenantId,
            agent_id: c.agentId,
            campaign_id: c.campaignId,
            contact_name: c.contactName,
            contact_phone: c.contactPhone,
            metadata: c.metadata || {},
            scheduled_at: c.scheduledAt || new Date(),
            status: c.status || 'pending'
        }));

        const chunkSize = 50;
        for (let i = 0; i < dbPayload.length; i += chunkSize) {
            const chunk = dbPayload.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('outbound_queue')
                .upsert(chunk, {
                    onConflict: 'campaign_id,contact_phone',
                    ignoreDuplicates: true
                });

            if (error) {
                console.error(`Error adding to outbound queue (chunk ${i / chunkSize}):`, error);
                throw error;
            }
        }
    },

    async upsertAgentLeads(leads: Partial<import('@/lib/types').AgentLead>[]): Promise<void> {
        if (!leads.length) return;

        const dbPayload = leads.map((lead) => ({
            tenant_id: lead.tenantId,
            campaign_id: lead.campaignId || null,
            identifier: lead.identifier,
            identifier_type: lead.identifierType || 'cnpj',
            name: lead.name || null,
            whatsapp: lead.whatsapp || null,
            cta_link: lead.ctaLink || null,
            status: lead.status || 'pending',
            metadata: lead.metadata || {},
        }));

        const chunkSize = 50;
        for (let i = 0; i < dbPayload.length; i += chunkSize) {
            const chunk = dbPayload.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('agent_leads')
                .upsert(chunk, {
                    onConflict: 'tenant_id,identifier,campaign_id',
                    ignoreDuplicates: false,
                });

            if (error) {
                console.error(`Error upserting agent leads (chunk ${i / chunkSize}):`, error);
                throw error;
            }
        }
    },

    async getCampaignsPaginated(
        tenantId: string,
        options: {
            startDate?: Date;
            endDate?: Date;
            status?: string;
            search?: string;
            agentId?: string;
            page: number;
            pageSize: number;
            useReplica?: boolean;
        }
    ): Promise<{ campaigns: import('@/lib/types').Campaign[]; totalCount: number }> {
        const client = options.useReplica ? supabaseReader : supabase;
        let query = client
            .from('campaigns')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenantId);

        if (options.startDate) query = query.gte('start_date', options.startDate.toISOString());
        if (options.endDate) query = query.lte('start_date', options.endDate.toISOString());
        if (options.status && options.status !== 'all') query = query.eq('status', options.status);
        if (options.search) query = query.ilike('name', `%${options.search}%`);
        if (options.agentId && options.agentId !== 'all') query = query.eq('agent_id', options.agentId);

        const offset = (options.page - 1) * options.pageSize;
        query = query.range(offset, offset + options.pageSize - 1).order('created_at', { ascending: false });

        const { data, count, error } = await query;

        if (error) {
            console.error('Error fetching paginated campaigns:', error);
            return { campaigns: [], totalCount: 0 };
        }

        const campaigns = data.map((c: any) => ({
            id: c.id,
            tenantId: c.tenant_id,
            agentId: c.agent_id,
            name: c.name,
            description: c.description,
            status: c.status,
            startDate: parseLocalDate(c.start_date),
            endDate: c.end_date ? parseLocalDate(c.end_date) : undefined,
            dailyLimit: c.daily_limit,
            totalContacts: c.total_contacts,
            sentCount: c.sent_count,
            deliveredCount: c.delivered_count || 0,
            readCount: c.read_count || 0,
            failedCount: c.failed_count,
            responseCount: c.response_count,
            totalMessages: c.total_messages || 0,
            conversionCount: c.conversion_count || 0,
            conversionRate: c.delivered_count > 0 ? Number(((c.conversion_count || 0) / c.delivered_count * 100).toFixed(1)) : 0,
            importErrorCount: c.import_error_count,
            startTime: c.start_time,
            endTime: c.end_time,
            initialMessage: c.initial_message,
            successCriteria: c.success_criteria,
            successLinkFilter: c.success_link_filter,
            campaignType: (c.metadata?.campaign_type as any) || 'standard',
            metadata: c.metadata,
            reengagementEnabled: c.reengagement_enabled,
            reengagementWaitHours: c.reengagement_wait_hours,
            reengagementMaxAttempts: c.reengagement_max_attempts,
            reengagementMessage: c.reengagement_message,
            reengagementTemplateId: c.reengagement_template_id,
            createdAt: new Date(c.created_at),
            updatedAt: new Date(c.updated_at)
        }));

        return { campaigns, totalCount: count || 0 };
    },

async getCampaigns(tenantId: string, useReplica: boolean = false): Promise<import('@/lib/types').Campaign[]> {
        const client = useReplica ? supabaseReader : supabase;
        const { data, error } = await client
            .from('campaigns')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching campaigns:', error);
            return [];
        }

        return data.map((c: any) => ({
            id: c.id,
            tenantId: c.tenant_id,
            agentId: c.agent_id,
            name: c.name,
            description: c.description,
            status: c.status,
            startDate: parseLocalDate(c.start_date),
            endDate: c.end_date ? parseLocalDate(c.end_date) : undefined,
            dailyLimit: c.daily_limit,
            totalContacts: c.total_contacts,
            sentCount: c.sent_count,
            deliveredCount: c.delivered_count || 0,
            readCount: c.read_count || 0,
            failedCount: c.failed_count,
            responseCount: c.response_count,
            totalMessages: c.total_messages || 0,
            conversionCount: c.conversion_count || 0,
            conversionRate: c.delivered_count > 0 ? Number(((c.conversion_count || 0) / c.delivered_count * 100).toFixed(1)) : 0,
            importErrorCount: c.import_error_count,
            startTime: c.start_time,
            endTime: c.end_time,
            initialMessage: c.initial_message,
            successCriteria: c.success_criteria,
            successLinkFilter: c.success_link_filter,
            campaignType: (c.metadata?.campaign_type as any) || 'standard',
            metadata: c.metadata,
            reengagementEnabled: c.reengagement_enabled,
            reengagementWaitHours: c.reengagement_wait_hours,
            reengagementMaxAttempts: c.reengagement_max_attempts,
            reengagementMessage: c.reengagement_message,
            reengagementTemplateId: c.reengagement_template_id,
            createdAt: new Date(c.created_at),
            updatedAt: new Date(c.updated_at)
        }));
    },

async createCampaign(campaign: Partial<import('@/lib/types').Campaign>): Promise<import('@/lib/types').Campaign> {
        const dbPayload = {
            tenant_id: campaign.tenantId,
            agent_id: campaign.agentId,
            name: campaign.name,
            description: campaign.description,
            status: campaign.status || 'draft',
            start_date: campaign.startDate || new Date(),
            end_date: campaign.endDate,
            daily_limit: campaign.dailyLimit || 50,
            start_time: campaign.startTime || '09:00',
            end_time: campaign.endTime || '18:00',
            initial_message: campaign.initialMessage,
            success_criteria: campaign.successCriteria || [],
            success_link_filter: campaign.successLinkFilter,
            metadata: {
                ...(campaign.metadata || {}),
                ...(campaign.campaignType ? { campaign_type: campaign.campaignType } : {})
            },
            reengagement_enabled: campaign.reengagementEnabled || false,
            reengagement_wait_hours: campaign.reengagementWaitHours || 24,
            reengagement_max_attempts: campaign.reengagementMaxAttempts || 1,
            reengagement_message: campaign.reengagementMessage || '',
            reengagement_template_id: campaign.reengagementTemplateId || null
        };

        const { data, error } = await supabase
            .from('campaigns')
            .insert(dbPayload)
            .select()
            .single();

        if (error) throw error;

        return {
            ...data,
            tenantId: data.tenant_id,
            agentId: data.agent_id,
            startDate: parseLocalDate(data.start_date),
            endDate: data.end_date ? parseLocalDate(data.end_date) : undefined,
            dailyLimit: data.daily_limit,
            startTime: data.start_time,
            endTime: data.end_time,
            initialMessage: data.initial_message,
            totalContacts: data.total_contacts,
            sentCount: data.sent_count,
            responseCount: data.response_count,
            totalMessages: data.total_messages || 0,
            conversionCount: data.conversion_count || 0,
            successCriteria: data.success_criteria,
            successLinkFilter: data.success_link_filter,
            campaignType: (data.metadata?.campaign_type as any) || campaign.campaignType || 'standard',
            reengagementEnabled: data.reengagement_enabled,
            reengagementWaitHours: data.reengagement_wait_hours,
            reengagementMaxAttempts: data.reengagement_max_attempts,
            reengagementMessage: data.reengagement_message,
            reengagementTemplateId: data.reengagement_template_id,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at)
        } as any;
    },

async updateCampaign(id: string, updates: Partial<import('@/lib/types').Campaign>): Promise<void> {
        const dbPayload: any = {};
        if (updates.name) dbPayload.name = updates.name;
        if (updates.description) dbPayload.description = updates.description;
        if (updates.status) dbPayload.status = updates.status;
        if (updates.startDate) dbPayload.start_date = updates.startDate;
        if (updates.endDate) dbPayload.end_date = updates.endDate;
        if (updates.dailyLimit) dbPayload.daily_limit = updates.dailyLimit;
        if (updates.startTime) dbPayload.start_time = updates.startTime;
        if (updates.endTime) dbPayload.end_time = updates.endTime;
        if (updates.initialMessage) dbPayload.initial_message = updates.initialMessage;
        if (updates.successCriteria) dbPayload.success_criteria = updates.successCriteria;
        if (updates.successLinkFilter !== undefined) dbPayload.success_link_filter = updates.successLinkFilter;
        if (updates.metadata || updates.campaignType) {
            const meta = { ...(updates.metadata || {}) };
            if (updates.campaignType) {
                meta.campaign_type = updates.campaignType;
            }
            dbPayload.metadata = meta;
        }
        if (updates.reengagementEnabled !== undefined) dbPayload.reengagement_enabled = updates.reengagementEnabled;
        if (updates.reengagementWaitHours !== undefined) dbPayload.reengagement_wait_hours = updates.reengagementWaitHours;
        if (updates.reengagementMaxAttempts !== undefined) dbPayload.reengagement_max_attempts = updates.reengagementMaxAttempts;
        if (updates.reengagementMessage !== undefined) dbPayload.reengagement_message = updates.reengagementMessage;
        if (updates.reengagementTemplateId !== undefined) dbPayload.reengagement_template_id = updates.reengagementTemplateId;
        if (updates.totalContacts !== undefined) dbPayload.total_contacts = updates.totalContacts;
        if (updates.sentCount !== undefined) dbPayload.sent_count = updates.sentCount;
        if (updates.responseCount !== undefined) dbPayload.response_count = updates.responseCount;
        if (updates.importErrorCount !== undefined) dbPayload.import_error_count = updates.importErrorCount;

        const { error } = await supabase
            .from('campaigns')
            .update(dbPayload)
            .eq('id', id);

        if (error) throw error;
    },

async deleteCampaign(id: string): Promise<void> {
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async logImportErrors(logs: Partial<import('@/lib/types').CampaignImportLog>[]): Promise<void> {
        const dbPayload = logs.map(l => ({
            campaign_id: l.campaignId,
            tenant_id: l.tenantId,
            row_number: l.rowNumber,
            contact_name: l.contactName,
            contact_phone: l.contactPhone,
            error_type: l.errorType,
            error_message: l.errorMessage,
            raw_data: l.rawData || {}
        }));

        const { error } = await supabase
            .from('campaign_import_logs')
            .insert(dbPayload);

        if (error) {
            console.error('Error logging import errors:', error);
            throw error;
        }
    },

    async getImportLogs(campaignId: string): Promise<import('@/lib/types').CampaignImportLog[]> {
        const { data, error } = await supabaseReader
            .from('campaign_import_logs')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('row_number', { ascending: true });

        if (error) {
            console.error('Error fetching import logs:', error);
            throw error;
        }

        return data.map((l: any) => ({
            id: l.id,
            campaignId: l.campaign_id,
            tenantId: l.tenant_id,
            rowNumber: l.row_number,
            contactName: l.contact_name,
            contactPhone: l.contact_phone,
            errorType: l.error_type,
            errorMessage: l.error_message,
            rawData: l.raw_data,
            createdAt: new Date(l.created_at)
        }));
    },

    async getCampaignStats(campaignId: string | null, tenantId: string, _useReplica: boolean = false, agentId?: string): Promise<any> {
        // OTIMIZAÇÃO: Circuit Breaker
        // Se o banco de dados já deu timeout recentemente nas métricas, 
        // nós abortamos novas tentativas por 60 segundos para não enfileirar mais consultas pesadas
        // e travar completamente a UI para o usuário.
        if ((window as any)._isStatsCircuitBreakerOpen) {
            return null;
        }

        // FORCE PRIMARY: ignore replica for dashboard stats to avoid sync lag 404s
        const client = supabase;
        const { data, error } = await client.rpc('get_campaign_dashboard_stats', {
            p_campaign_id: campaignId === "" ? null : campaignId,
            p_tenant_id: campaignId === "" ? tenantId : null,
            p_agent_id: agentId || null
        });

        if (error) {
            if (error.code === '57014') {
                console.warn("🛡️ DB OVERLOADED (57014). Ativando Circuit Breaker de métricas por 60 segundos.");
                (window as any)._isStatsCircuitBreakerOpen = true;
                setTimeout(() => { (window as any)._isStatsCircuitBreakerOpen = false; }, 60000);
                
                return null;
            }

            console.error("❌ SUPABASE RPC ERROR (get_campaign_metrics_v2):", {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw error;
        }
        return data as {
            total_contacts: number;
            import_errors: number;
            sent_count: number;
            delivered_count: number;
            read_count: number;
            response_count: number;
            conversion_count: number;
            failed_count: number;
            conversion_rate: number;
            success_criteria_used: string[];
        };
    },

    async getAllCampaignsStats(tenantId: string, campaignIds?: string[], startDate?: Date, agentId?: string): Promise<Record<string, any>> {
        if ((window as any)._isStatsCircuitBreakerOpen) {
            return {};
        }

        const rpcArgs: any = { p_tenant_id: tenantId };
        if (campaignIds && campaignIds.length > 0) {
            rpcArgs.p_campaign_ids = campaignIds;
        }
        if (startDate) {
            rpcArgs.p_start_date = startDate.toISOString();
        }
        if (agentId && agentId !== 'all') {
            rpcArgs.p_agent_id = agentId;
        }

        const { data, error } = await supabase.rpc('get_all_campaigns_metrics_v2', rpcArgs);

        if (error) {
            if (error.code === '57014') {
                console.warn("🛡️ DB OVERLOADED (57014) no BULK. Ativando Circuit Breaker.");
                (window as any)._isStatsCircuitBreakerOpen = true;
                setTimeout(() => { (window as any)._isStatsCircuitBreakerOpen = false; }, 60000);
                return {};
            }
            console.error("❌ BULK SUPABASE RPC ERROR (get_all_campaigns_metrics_v2):", error);
            throw error;
        }

        const statsMap: Record<string, any> = {};
        for (const row of (data as any[] || [])) {
            console.log("DEBUG CAMPAIGN METRICS ROW:", row.campaign_id, "BUTTON:", row.conversion_button_count, "CHAT:", row.conversion_chat_count, "TOTAL:", row.conversion_count);
            if (row.campaign_id) {
                statsMap[row.campaign_id] = {
                    total_contacts: row.total_contacts,
                    import_errors: row.import_errors,
                    sent_count: row.sent_count,
                    delivered_count: row.delivered_count,
                    read_count: row.read_count,
                    response_count: row.response_count,
                    conversion_count: row.conversion_count,
                    conversion_button_count: row.conversion_button_count,
                    conversion_chat_count: row.conversion_chat_count,
                    failed_count: row.failed_count,
                    conversion_rate: row.conversion_rate
                };
            }
        }
        return statsMap;
    },

    async getLeadsByPhones(tenantId: string, phones: string[]): Promise<any[]> {
        const { data, error } = await supabase
            .from('agent_leads')
            .select('whatsapp, identifier')
            .eq('tenant_id', tenantId)
            .in('whatsapp', phones);

        if (error) {
            console.error('Error fetching leads by phones:', error);
            return [];
        }

        return data;
    },

    async executeManualReengagement(campaignId: string, tenantId: string, targets: string[]): Promise<string | null> {
        const { data, error } = await supabase.rpc('execute_manual_reengagement_v2', {
            p_campaign_id: campaignId,
            p_tenant_id: tenantId,
            p_targets_str: targets.join(',')
        });
        if (error) {
            console.error('Error executing manual reengagement:', JSON.stringify(error, null, 2), error.message, error.details, error.hint);
            return null;
        }
        return data;
    },

    async completeManualReengagement(logId: string): Promise<boolean> {
        const { data, error } = await supabase.rpc('complete_manual_reengagement', {
            p_log_id: logId
        });
        if (error) {
            console.error('Error completing manual reengagement:', error);
            return false;
        }
        return !!data;
    },

    async getCampaignRecoveryLogs(tenantId: string, campaignId?: string): Promise<any[]> {
        let query = supabase
            .from('campaign_recovery_logs')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('started_at', { ascending: false });
            
        if (campaignId) {
            query = query.eq('campaign_id', campaignId);
        }
        
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching campaign recovery logs:', error);
            return [];
        }
        return data;
    },

    async getCampaignContactsForReengagement(campaignId: string, tenantId: string): Promise<{
        contacts: import('@/lib/types').ReengagementContact[];
        summary: import('@/lib/types').ReengagementFunnelSummary;
    }> {
        try {
            // 1. Obter métricas consolidadas oficiais do funil via getCreditCampaignFunnelStats
            const getFunnel = (this?.getCreditCampaignFunnelStats ? this.getCreditCampaignFunnelStats.bind(this) : campaignsService.getCreditCampaignFunnelStats);
            const funnelStats = await getFunnel(tenantId);
            const targetCampId = String(campaignId || '').toLowerCase().trim();
            const campStat = (funnelStats || []).find((s: any) => String(s.campaignId || '').toLowerCase().trim() === targetCampId) || null;

            // 2. Buscar todos os registros da fila para esta campanha
            const { data: queueRows, error: queueError } = await supabase
                .from('outbound_queue')
                .select('id, contact_name, contact_phone, status, error_message, response_detected, metadata, scheduled_at, sent_at, created_at, reengagement_attempt_count, reengagement_last_sent_at')
                .eq('campaign_id', campaignId)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(50000);

            if (queueError || !queueRows) {
                console.error('Erro ao buscar contatos da fila para reengajamento:', queueError);
                return {
                    contacts: [],
                    summary: {
                        totalCarregados: campStat ? Number(campStat.carregados) : 0,
                        entregues: campStat ? Number(campStat.entregues) : 0,
                        lidos: campStat ? Number(campStat.lidas) : 0,
                        interagiram: campStat ? Number(campStat.interagiram) : 0,
                        falhas: campStat ? Math.max(0, Number(campStat.carregados) - Number(campStat.entregues)) : 0,
                        optIn: campStat ? Number(campStat.optIn || campStat.opt_in || 0) : 0,
                        recusadosCredito60d: campStat ? Number(campStat.recusados) : 0,
                        aprovadosCredito: campStat ? Number(campStat.aprovados) : 0,
                        emAndamentoFila: 0
                    }
                };
            }

            // Agrupar por telefone limpo
            const contactsMap = new Map<string, {
                primaryRow: any;
                allRows: any[];
                isBusy: boolean;
                reengagementCount: number;
            }>();

            queueRows.forEach(row => {
                const cleanPhone = this.normalizePhone(row.contact_phone);
                if (!cleanPhone) return;

                const existing = contactsMap.get(cleanPhone);
                const isPendingOrProcessing = ['pending', 'processing'].includes(String(row.status || '').toLowerCase().trim());
                const reengAttempts = Number(row.reengagement_attempt_count || 0);
                const isReengagement = !!(row.metadata?.is_reengagement) || reengAttempts > 0 || !!row.reengagement_last_sent_at;
                const reengDelta = isReengagement ? Math.max(1, reengAttempts) : 0;

                if (!existing) {
                    contactsMap.set(cleanPhone, {
                        primaryRow: row,
                        allRows: [row],
                        isBusy: isPendingOrProcessing,
                        reengagementCount: reengDelta
                    });
                } else {
                    existing.allRows.push(row);
                    if (isPendingOrProcessing) existing.isBusy = true;
                    if (isReengagement) existing.reengagementCount += reengDelta;
                    if (!existing.primaryRow.sent_at && row.sent_at) {
                        existing.primaryRow = row;
                    }
                }
            });

            // 3. Buscar leads da campanha em agent_leads para mapear status de crédito e etapas do funil
            const leadsClassificationMap = new Map<string, {
                isApproved: boolean;
                isDeclined: boolean;
                isOptIn: boolean;
                inFormalization: boolean;
                isBlocked: boolean;
                hasValorInicial: boolean;
                hasFaturamento: boolean;
                hasConfirmed: boolean;
                declinedInfo?: { daysAgo: number; reason: string };
            }>();

            try {
                const { data: campaignLeads, error: leadErr } = await supabase
                    .from('agent_leads')
                    .select('id, identifier, whatsapp, status, metadata, created_at')
                    .eq('tenant_id', tenantId)
                    .eq('campaign_id', campaignId);

                if (!leadErr && campaignLeads) {
                    campaignLeads.forEach((lead: any) => {
                        const meta = lead.metadata || {};
                        const fiservStatus = String(meta.fiserv_status || lead.status || '').toLowerCase().trim();
                        const statusStr = String(lead.status || '').toLowerCase().trim();
                        const formalStatus = String(meta.formalization_status || '').toLowerCase().trim();
                        const pipeStage = String(meta.pipeline_stage || '').toLowerCase().trim();

                        const isApproved =
                            ['approved', 'in_quoting', 'comite_approved'].includes(fiservStatus) ||
                            ['approved', 'aprovado'].includes(statusStr) ||
                            meta.fiserv_is_approved === true ||
                            ['pré-aprovado', 'pre-aprovado', 'aprovado'].includes(String(meta.fiserv_external_status || '').toLowerCase());

                        const isDeclined =
                            ['denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined'].includes(fiservStatus) ||
                            ['denied', 'recusado', 'reprovado'].includes(statusStr) ||
                            String(meta.fiserv_external_status || '').toLowerCase().includes('não conseguimos') ||
                            String(meta.fiserv_external_status || '').toLowerCase().includes('reprovado');

                        const isOptIn =
                            meta.opt_in === true ||
                            meta.optin === true ||
                            meta.consent?.opt_in === true ||
                            meta.fiserv_requested_at != null ||
                            meta.loan_request_id != null ||
                            isApproved ||
                            isDeclined;

                        const inFormalization =
                            ['formalized', 'formalizado', 'won', 'concluido', 'in_service', 'em_atendimento', 'in_progress', 'formalization'].includes(formalStatus) ||
                            ['contract_signed', 'in_contact', 'proposal_sent'].includes(pipeStage) ||
                            meta.formalized_at != null ||
                            meta.ok_agente === true ||
                            meta.ok_agente === 'true' ||
                            meta.simulation_accepted === true ||
                            meta.simulation_accepted === 'true' ||
                            ['lost', 'cancelled', 'declined', 'desistente', 'recusado'].includes(formalStatus);

                        const isBlocked = isApproved || isDeclined || isOptIn || inFormalization;

                        const rawAmount = meta.requested_amount || meta.valor_inicial || meta.simulation_data?.amount || meta.fiserv_amount_approved;
                        const numAmount = rawAmount ? Number(String(rawAmount).replace(/[^0-9.]/g, '')) : 0;
                        const hasValidAmount = numAmount >= 10000 && numAmount <= 500000;

                        const hasValorInicial = Boolean(
                            !isBlocked && (
                                ((meta.revenue || meta.faturamento) && hasValidAmount) ||
                                meta.requested_amount ||
                                meta.valor_inicial ||
                                meta.simulation_data?.amount ||
                                meta.fiserv_amount_approved
                            )
                        );

                        const hasFaturamento = Boolean(
                            !isBlocked && (
                                hasValorInicial ||
                                meta.revenue ||
                                meta.faturamento
                            )
                        );

                        const hasConfirmed = Boolean(
                            !isBlocked && (
                                hasFaturamento ||
                                meta.identity_confirmed === true ||
                                meta.identity_confirmed === 'true' ||
                                meta.cnpj_confirmed === true ||
                                meta.cnpj_confirmed === 'true'
                            )
                        );

                        let declinedInfo: { daysAgo: number; reason: string } | undefined;
                        if (isDeclined) {
                            const deniedDateRaw =
                                meta.fiserv_last_audit_at ||
                                meta.lost_at ||
                                meta.refusal_date ||
                                meta.fiserv_requested_at ||
                                lead.created_at;

                            const deniedDate = new Date(deniedDateRaw);
                            const daysAgo = !isNaN(deniedDate.getTime())
                                ? Math.floor(Math.abs(Date.now() - deniedDate.getTime()) / (1000 * 60 * 60 * 24))
                                : 0;

                            declinedInfo = {
                                daysAgo,
                                reason: meta.lost_reason || meta.refusal_reason || meta.fiserv_denied_reason || 'Proposta recusada em análise de crédito'
                            };
                        }

                        const leadInfo = {
                            isApproved,
                            isDeclined,
                            isOptIn,
                            inFormalization,
                            isBlocked,
                            hasValorInicial,
                            hasFaturamento,
                            hasConfirmed,
                            declinedInfo
                        };

                        const variants = this.getPhoneVariants(lead.whatsapp);
                        const idf = lead.identifier ? String(lead.identifier).replace(/\D/g, '') : '';
                        const metaCnpj = meta.cnpj ? String(meta.cnpj).replace(/\D/g, '') : '';

                        variants.forEach(v => leadsClassificationMap.set(v, leadInfo));
                        if (idf) leadsClassificationMap.set(idf, leadInfo);
                        if (metaCnpj) leadsClassificationMap.set(metaCnpj, leadInfo);
                    });
                }
            } catch (err) {
                console.warn('Erro ao consultar agent_leads para reengajamento:', err);
            }

            // 4. Montar lista de contatos enriquecidos
            const contacts: import('@/lib/types').ReengagementContact[] = [];

            let totalEntregues = 0;
            let totalLidos = 0;
            let totalInteragiram = 0;
            let totalFalhas = 0;
            let totalOptIn = 0;
            let totalRecusados60d = 0;
            let totalAprovados = 0;
            let totalFormalizacao = 0;
            let totalNaoEnviados = 0;
            let totalBusy = 0;

            const stagesCount: Record<import('@/lib/types').ReengagementStageId, number> = {
                nao_entregue: 0,
                nao_leu: 0,
                leu: 0,
                interagiu: 0,
                confirmou: 0,
                faturamento: 0,
                valor: 0
            };

            contactsMap.forEach((entry, cleanPhone) => {
                const row = entry.primaryRow;
                const meta = row.metadata || {};
                const idf = meta.identifier || meta.cnpj || meta.cpf;
                const cleanId = idf ? String(idf).replace(/\D/g, '') : '';

                let isSent = false;
                let delivered = false;
                let read = false;
                let replied = false;
                let failed = false;

                entry.allRows.forEach(r => {
                    const st = String(r.status || '').toLowerCase().trim();
                    if (!['queued', 'pending', 'scheduled', 'draft'].includes(st) || r.sent_at != null || r.response_detected) {
                        isSent = true;
                    }
                    // Alinhado 100% com a RPC get_credit_campaign_funnel_stats:
                    if (['sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu'].includes(st) || 
                        r.response_detected || 
                        st === 'converted' || 
                        r.metadata?.converted === 'true') {
                        delivered = true;
                    }
                    if (['read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu'].includes(st) || 
                        r.response_detected || 
                        st === 'converted' || 
                        r.metadata?.converted === 'true') {
                        delivered = true;
                        read = true;
                    }
                    const isAutoReply = r.metadata?.is_auto_reply === true || r.metadata?.is_auto_reply === 'true' || r.metadata?.is_bot === true;
                    if ((r.response_detected || ['respondida', 'interagiu'].includes(st) || (r.metadata?.responded === 'true')) && !isAutoReply) {
                        replied = true;
                    }
                    if (['failed', 'undelivered', 'error', 'not_delivered', 'rejected'].includes(st)) {
                        failed = true;
                    }
                });

                const variants = this.getPhoneVariants(row.contact_phone);
                const leadInfo = variants.map(v => leadsClassificationMap.get(v)).find(Boolean) || (cleanId ? leadsClassificationMap.get(cleanId) : undefined);

                const isApproved = leadInfo?.isApproved || false;
                const isDeclined = leadInfo?.isDeclined || false;
                const isOptIn = leadInfo?.isOptIn || false;
                const inFormalization = leadInfo?.inFormalization || false;
                const declinedInfo = leadInfo?.declinedInfo;
                const isDeclined60d = !!declinedInfo;

                if (delivered) totalEntregues++;
                if (read) totalLidos++;
                if (replied) totalInteragiram++;
                if (failed && !delivered) totalFalhas++;
                if (isOptIn) totalOptIn++;
                if (isDeclined60d) totalRecusados60d++;
                if (isApproved) totalAprovados++;
                if (inFormalization) totalFormalizacao++;
                if (!isSent) totalNaoEnviados++;
                if (entry.isBusy) totalBusy++;

                // Classificação rigorosa de exclusão de bloqueados
                const isBlocked = isApproved || isDeclined || isOptIn || inFormalization || !isSent;

                let blockedReason = '';
                if (isApproved) blockedReason = 'Cliente com proposta aprovada/formalizada';
                else if (isDeclined) blockedReason = 'Cliente com proposta recusada';
                else if (isOptIn) blockedReason = 'Cliente já realizou opt-in';
                else if (inFormalization) blockedReason = 'Cliente em formalização de crédito';
                else if (!isSent) blockedReason = 'Contato carregado mas não disparado';

                // Determinar a etapa exclusiva onde o lead parou
                let stoppedStage: import('@/lib/types').ReengagementStageId = 'nao_entregue';
                if (leadInfo?.hasValorInicial) {
                    stoppedStage = 'valor';
                } else if (leadInfo?.hasFaturamento) {
                    stoppedStage = 'faturamento';
                } else if (leadInfo?.hasConfirmed) {
                    stoppedStage = 'confirmou';
                } else if (replied) {
                    stoppedStage = 'interagiu';
                } else if (read) {
                    stoppedStage = 'leu';
                } else if (delivered) {
                    stoppedStage = 'nao_leu';
                } else {
                    stoppedStage = 'nao_entregue';
                }

                if (!isBlocked) {
                    stagesCount[stoppedStage] = (stagesCount[stoppedStage] || 0) + 1;

                    contacts.push({
                        id: row.id,
                        contact_name: row.contact_name || 'Contato sem nome',
                        contact_phone: row.contact_phone,
                        clean_phone: cleanPhone,
                        identifier: idf,
                        original_status: row.status,
                        delivered,
                        read,
                        replied,
                        failed,
                        opt_in: isOptIn,
                        credit_status: isApproved ? 'approved' : isDeclined60d ? 'declined_60d' : 'none',
                        credit_declined_reason: declinedInfo?.reason,
                        credit_declined_days_ago: declinedInfo?.daysAgo,
                        credit_declined_60d: isDeclined60d,
                        credit_approved: isApproved,
                        is_busy: entry.isBusy,
                        reengagement_count: entry.reengagementCount,
                        last_scheduled_at: row.scheduled_at,
                        metadata: meta,
                        stopped_stage: stoppedStage,
                        is_blocked: false
                    });
                }
            });

            // Se temos campStat da RPC oficial, usamos para cálculo consistente dos números do funil
            let officialStages = stagesCount;
            let totalReengajavel = contacts.length;
            let totalBloqueados = totalAprovados + totalRecusados60d + totalFormalizacao + totalNaoEnviados;
            let bloqueadosBreakdown = {
                aprovados: totalAprovados,
                recusados: totalRecusados60d,
                formalizacao: totalFormalizacao,
                naoEnviados: totalNaoEnviados
            };

            if (campStat) {
                const sEnviados = Number(campStat.enviados || 0);
                const sEntregues = Number(campStat.entregues || 0);
                const sLidas = Number(campStat.lidas || 0);
                const sInteragiram = Number(campStat.interagiram || 0);
                const sConfirmaram = Number(campStat.confirmaram || 0);
                const sFaturamento = Number(campStat.faturamento || 0);
                const sValor = Number(campStat.valorInicial || 0);
                const sOptIn = Number(campStat.optIn || campStat.opt_in || 0);
                const sAprovados = Number(campStat.aprovados || 0);
                const sRecusados = Number(campStat.recusados || 0);
                const sFormalizados = Number(campStat.formalizado || 0) + Number(campStat.emAtendimento || 0) + Number(campStat.aguarContato || 0) + Number(campStat.desistencia || 0);
                const sNaoEnviados = Math.max(0, Number(campStat.carregados || 0) - sEnviados);

                officialStages = {
                    nao_entregue: Math.max(0, sEnviados - sEntregues),
                    nao_leu: Math.max(0, sEntregues - sLidas),
                    leu: Math.max(0, sLidas - sInteragiram),
                    interagiu: Math.max(0, sInteragiram - sConfirmaram),
                    confirmou: Math.max(0, sConfirmaram - sFaturamento),
                    faturamento: Math.max(0, sFaturamento - sValor),
                    valor: Math.max(0, sValor - sOptIn)
                };

                totalReengajavel = Object.values(officialStages).reduce((a, b) => a + b, 0);
                totalBloqueados = sAprovados + sRecusados + sFormalizados + sNaoEnviados;
                bloqueadosBreakdown = {
                    aprovados: sAprovados,
                    recusados: sRecusados,
                    formalizacao: sFormalizados,
                    naoEnviados: sNaoEnviados
                };
            }

            return {
                contacts,
                summary: {
                    totalCarregados: campStat ? Number(campStat.carregados) : (contacts.length + totalBloqueados),
                    entregues: campStat ? Number(campStat.entregues) : totalEntregues,
                    lidos: campStat ? Number(campStat.lidas) : totalLidos,
                    interagiram: campStat ? Number(campStat.interagiram) : totalInteragiram,
                    falhas: campStat ? Math.max(0, Number(campStat.carregados) - Number(campStat.entregues)) : totalFalhas,
                    optIn: campStat ? Number(campStat.optIn || campStat.opt_in || 0) : totalOptIn,
                    recusadosCredito60d: campStat ? Number(campStat.recusados) : totalRecusados60d,
                    aprovadosCredito: campStat ? Number(campStat.aprovados) : totalAprovados,
                    emAndamentoFila: totalBusy,
                    stages: officialStages,
                    totalReengajavel,
                    totalBloqueados,
                    bloqueadosBreakdown
                }
            };
        } catch (err) {
            console.error('Erro geral em getCampaignContactsForReengagement:', err);
            return {
                contacts: [],
                summary: {
                    totalCarregados: 0,
                    entregues: 0,
                    lidos: 0,
                    interagiram: 0,
                    falhas: 0,
                    recusadosCredito60d: 0,
                    aprovadosCredito: 0,
                    emAndamentoFila: 0
                }
            };
        }
    },

    async scheduleCampaignReengagement(params: {
        tenantId: string;
        campaignId: string;
        scheduledAt: Date;
        selectedContacts: {
            id: string;
            contact_name: string;
            contact_phone: string;
            metadata?: any;
        }[];
        targetOptions?: string[];
        templateId?: string;
    }): Promise<{
        success: boolean;
        insertedCount: number;
        skippedBusyCount: number;
        batchId: string;
        message?: string;
    }> {
        try {
            if (!params.selectedContacts || params.selectedContacts.length === 0) {
                return { success: false, insertedCount: 0, skippedBusyCount: 0, batchId: '', message: 'Nenhum contato selecionado.' };
            }

            // 1. Buscar a campanha para obter o agent_id
            const { data: camp, error: campErr } = await supabase
                .from('campaigns')
                .select('id, name, agent_id')
                .eq('id', params.campaignId)
                .single();

            if (campErr || !camp) {
                return { success: false, insertedCount: 0, skippedBusyCount: 0, batchId: '', message: 'Campanha não encontrada.' };
            }

            // 2. Trava de segurança estrita: checar se algum contato já está pendente ou em processamento
            const phoneList = params.selectedContacts.map(c => c.contact_phone);
            const { data: busyRows } = await supabase
                .from('outbound_queue')
                .select('contact_phone')
                .eq('tenant_id', params.tenantId)
                .eq('campaign_id', params.campaignId)
                .in('status', ['pending', 'processing'])
                .in('contact_phone', phoneList);

            const busyPhones = new Set((busyRows || []).map(r => this.normalizePhone(r.contact_phone)));

            // Filtrar contatos aptos (não presos na outbound)
            const eligible = params.selectedContacts.filter(c => !busyPhones.has(this.normalizePhone(c.contact_phone)));
            const skippedBusyCount = params.selectedContacts.length - eligible.length;

            if (eligible.length === 0) {
                return {
                    success: false,
                    insertedCount: 0,
                    skippedBusyCount,
                    batchId: '',
                    message: `Todos os ${params.selectedContacts.length} contatos selecionados já possuem envios pendentes ou em processamento na fila.`
                };
            }

            const batchId = crypto.randomUUID();
            const scheduledAtIso = params.scheduledAt.toISOString();

            // 3. Montar linhas para inserção na outbound_queue mantendo o envio original
            const rowsToInsert = eligible.map(c => ({
                tenant_id: params.tenantId,
                campaign_id: params.campaignId,
                agent_id: camp.agent_id || null,
                contact_name: c.contact_name,
                contact_phone: c.contact_phone,
                status: 'pending',
                retry_count: 0,
                response_detected: false,
                scheduled_at: scheduledAtIso,
                created_at: new Date().toISOString(),
                idempotency_key: `${params.campaignId}:${c.contact_phone}:${batchId}`,
                metadata: {
                    ...(c.metadata || {}),
                    ...(params.templateId ? { template_id: params.templateId } : {}),
                    is_reengagement: true,
                    reengagement_batch_id: batchId,
                    reengagement_scheduled_at: scheduledAtIso,
                    original_queue_id: c.id
                }
            }));

            // Inserir em chunks de 100 registros
            const chunkSize = 100;
            let insertedTotal = 0;

            for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
                const chunk = rowsToInsert.slice(i, i + chunkSize);
                const { error: insertErr } = await supabase
                    .from('outbound_queue')
                    .insert(chunk);

                if (insertErr) {
                    console.error('Erro ao inserir lote de reengajamento na outbound_queue:', insertErr);
                    throw new Error(`Falha ao enfileirar contatos: ${insertErr.message}`);
                }
                insertedTotal += chunk.length;
            }

            // 4. Registrar o lote na campaign_recovery_logs
            try {
                await supabase.from('campaign_recovery_logs').insert({
                    tenant_id: params.tenantId,
                    campaign_id: params.campaignId,
                    status: params.scheduledAt > new Date() ? 'running' : 'completed',
                    target_options: params.targetOptions || ['custom_pool'],
                    records_affected: insertedTotal,
                    started_at: new Date().toISOString(),
                    completed_at: params.scheduledAt > new Date() ? null : new Date().toISOString(),
                    snapshot_before: {
                        batch_id: batchId,
                        scheduled_at: scheduledAtIso,
                        total_selected: params.selectedContacts.length,
                        enqueued: insertedTotal,
                        skipped_busy: skippedBusyCount
                    }
                });
            } catch (logErr) {
                console.warn('Erro ao salvar log de reengajamento:', logErr);
            }

            return {
                success: true,
                insertedCount: insertedTotal,
                skippedBusyCount,
                batchId,
                message: `${insertedTotal} contatos enfileirados com sucesso para reengajamento.${skippedBusyCount > 0 ? ` (${skippedBusyCount} contatos ignorados por estarem em processamento)` : ''}`
            };
        } catch (err: any) {
            console.error('Erro em scheduleCampaignReengagement:', err);
            return {
                success: false,
                insertedCount: 0,
                skippedBusyCount: 0,
                batchId: '',
                message: err.message || 'Erro inesperado ao agendar reengajamento.'
            };
        }
    },

    async getReengagementComparisonMetrics(tenantId: string, campaignId: string): Promise<import('@/lib/types').ReengagementComparisonData | null> {
        try {
            // 1. Obter campanha
            const { data: camp } = await supabaseReader
                .from('campaigns')
                .select('id, name')
                .eq('id', campaignId)
                .single();

            const campaignName = camp?.name || 'Campanha';

            // 2. Buscar todos os registros da outbound_queue desta campanha
            const { data: rows, error } = await supabaseReader
                .from('outbound_queue')
                .select('id, contact_phone, status, response_detected, metadata, created_at, sent_at, reengagement_attempt_count, reengagement_last_sent_at')
                .eq('tenant_id', tenantId)
                .eq('campaign_id', campaignId)
                .limit(50000);

            if (error || !rows) return null;

            // Separar original vs reengajamento:
            // No fluxo automatizado pelo n8n, a linha original recebe reengagement_attempt_count > 0 e reengagement_last_sent_at.
            // No fluxo manual da interface, novas linhas podem ser criadas com metadata.is_reengagement = true.
            const originalRows = rows.filter(r => !r.metadata?.is_reengagement);
            const reengRows = rows.filter(r => 
                Boolean(
                    r.metadata?.is_reengagement || 
                    (r.reengagement_attempt_count && Number(r.reengagement_attempt_count) > 0) || 
                    r.reengagement_last_sent_at
                )
            );

            const calcMetrics = (list: typeof rows) => {
                const totalSent = list.filter(r => 
                    ['sent', 'delivered', 'read', 'respondida', 'interagiu', 'failed', 'undelivered', 'error', 'not_delivered', 'rejected', 'processing'].includes(String(r.status || '')) || 
                    Boolean(r.reengagement_last_sent_at) || 
                    Boolean(r.sent_at)
                ).length;
                const delivered = list.filter(r => 
                    ['sent', 'delivered', 'read', 'respondida', 'interagiu'].includes(String(r.status || '')) || 
                    Boolean(r.response_detected)
                ).length;
                const read = list.filter(r => 
                    ['read', 'respondida', 'interagiu'].includes(String(r.status || ''))
                ).length;
                const replied = list.filter(r => 
                    Boolean(r.response_detected) || 
                    ['respondida', 'interagiu'].includes(String(r.status || ''))
                ).length;
                const failed = list.filter(r => 
                    ['failed', 'undelivered', 'error', 'not_delivered', 'rejected'].includes(String(r.status || ''))
                ).length;

                return {
                    totalSent,
                    delivered,
                    deliveredRate: totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0,
                    read,
                    readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
                    replied,
                    replyRate: delivered > 0 ? Math.round((replied / delivered) * 100) : 0,
                    optIn: 0,
                    optInRate: 0,
                    failed,
                    failedRate: list.length > 0 ? Math.round((failed / list.length) * 100) : 0,
                    conversions: 0,
                    conversionRate: 0
                };
            };

            const origMetrics = calcMetrics(originalRows);
            const reengMetrics = calcMetrics(reengRows);

            // Funil estruturado completo (estilo planilha do Dashboard)
            const reengFunnel: import('@/lib/types').ReengagementFunnelRow = {
                carregados: reengRows.length,
                enviados: reengMetrics.totalSent,
                entregues: reengMetrics.delivered,
                lidas: reengMetrics.read,
                interagiram: reengMetrics.replied,
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

            let origFunnel: import('@/lib/types').ReengagementFunnelRow = {
                carregados: originalRows.length,
                enviados: origMetrics.totalSent,
                entregues: origMetrics.delivered,
                lidas: origMetrics.read,
                interagiram: origMetrics.replied,
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

            // 3. Buscar métricas consolidadas oficiais do envio original via getCreditCampaignFunnelStats
            try {
                const getFunnel = (this?.getCreditCampaignFunnelStats ? this.getCreditCampaignFunnelStats.bind(this) : campaignsService.getCreditCampaignFunnelStats);
                const funnelStats = await getFunnel(tenantId);
                const targetCampId = String(campaignId || '').toLowerCase().trim();
                const campStat = (funnelStats || []).find((s: any) => String(s.campaignId || '').toLowerCase().trim() === targetCampId) || null;

                if (campStat) {
                    origMetrics.totalSent = Number(campStat.enviados || 0);
                    origMetrics.delivered = Number(campStat.entregues || 0);
                    origMetrics.deliveredRate = origMetrics.totalSent > 0 ? Math.round((origMetrics.delivered / origMetrics.totalSent) * 100) : 0;
                    origMetrics.read = Number(campStat.lidas || 0);
                    origMetrics.readRate = origMetrics.delivered > 0 ? Math.round((origMetrics.read / origMetrics.delivered) * 100) : 0;
                    origMetrics.replied = Number(campStat.interagiram || 0);
                    origMetrics.replyRate = origMetrics.delivered > 0 ? Math.round((origMetrics.replied / origMetrics.delivered) * 100) : 0;
                    origMetrics.optIn = Number(campStat.optIn || campStat.opt_in || 0);
                    origMetrics.optInRate = origMetrics.delivered > 0 ? Math.round((origMetrics.optIn / origMetrics.delivered) * 100) : 0;
                    origMetrics.conversions = Number(campStat.aprovados || 0);
                    origMetrics.conversionRate = origMetrics.delivered > 0 ? Math.round((origMetrics.conversions / origMetrics.delivered) * 100) : 0;
                    origMetrics.failed = Math.max(0, origMetrics.totalSent - origMetrics.delivered);
                    origMetrics.failedRate = origMetrics.totalSent > 0 ? Math.round((origMetrics.failed / origMetrics.totalSent) * 100) : 0;

                    origFunnel = {
                        carregados: Number(campStat.carregados || origMetrics.totalSent || 0),
                        enviados: Number(campStat.enviados || origMetrics.totalSent || 0),
                        entregues: Number(campStat.entregues || origMetrics.delivered || 0),
                        lidas: Number(campStat.lidas || origMetrics.read || 0),
                        interagiram: Number(campStat.interagiram || origMetrics.replied || 0),
                        confirmaram: Number(campStat.confirmaram || 0),
                        faturamento: Number(campStat.faturamento || 0),
                        valorInicial: Number(campStat.valorInicial || 0),
                        optIn: Number(campStat.optIn || 0),
                        aprovados: Number(campStat.aprovados || 0),
                        recusados: Number(campStat.recusados || 0),
                        simularam: Number(campStat.simularam || 0),
                        okAgente: Number(campStat.okAgente || 0),
                        aguarContato: Number(campStat.aguarContato || 0),
                        emAtendimento: Number(campStat.emAtendimento || 0),
                        formalizado: Number(campStat.formalizado || 0),
                        desistencia: Number(campStat.desistencia || 0)
                    };
                }
            } catch (funnelErr) {
                console.warn('Nota: usando fallback local para métricas originais:', funnelErr);
            }

            // 4. Buscar conversões e opt-ins em agent_leads cruzando com os telefones de reengajamento
            const reengPhones = new Set(reengRows.map(r => this.normalizePhone(r.contact_phone)));
            const origPhones = new Set(originalRows.map(r => this.normalizePhone(r.contact_phone)));

            try {
                const { data: leads } = await supabaseReader
                    .from('agent_leads')
                    .select('whatsapp, status, metadata')
                    .eq('tenant_id', tenantId)
                    .eq('campaign_id', campaignId);

                if (leads) {
                    leads.forEach(l => {
                        const ph = this.normalizePhone(l.whatsapp);
                        const meta = l.metadata || {};
                        const fiservStatus = String(meta.fiserv_status || l.status || '').toLowerCase().trim();
                        const formalStatus = String(meta.formalization_status || '').toLowerCase().trim();
                        const pipeStage = String(meta.pipeline_stage || '').toLowerCase().trim();
                        const extStatus = String(meta.fiserv_external_status || '').toLowerCase().trim();
                        const statusStr = String(l.status || '').toLowerCase().trim();

                        const isConfirmed = Boolean(
                            meta.identity_confirmed === true ||
                            meta.identity_confirmed === 'true' ||
                            meta.cnpj_confirmed === true ||
                            meta.cnpj_confirmed === 'true' ||
                            meta.revenue ||
                            meta.faturamento ||
                            meta.requested_amount ||
                            meta.valor_inicial ||
                            meta.simulation_data?.amount ||
                            meta.fiserv_amount_approved ||
                            meta.opt_in === true ||
                            meta.optin === true ||
                            meta.consent?.opt_in === true ||
                            meta.loan_request_id ||
                            meta.simulation_requested ||
                            meta.simularam ||
                            meta.simulation_accepted === true ||
                            meta.simulation_accepted === 'true' ||
                            meta.ok_agente === true ||
                            meta.ok_agente === 'true'
                        );
                        const isRevenue = Boolean(meta.revenue || meta.faturamento);
                        const isValorInicial = Boolean(meta.requested_amount || meta.valor_inicial || meta.simulation_data?.amount || meta.fiserv_amount_approved);
                        const isOptIn = fiservStatus === 'opt_in_registered' ||
                            statusStr === 'opt_in' ||
                            statusStr === 'optin' ||
                            Boolean(meta.formalization_opt_in) ||
                            Boolean(meta.opt_in) ||
                            Boolean(meta.consent?.opt_in);

                        const isConverted =
                            ['approved', 'in_quoting', 'comite_approved', 'aprovado'].includes(fiservStatus) ||
                            ['approved', 'aprovado', 'formalized', 'pago'].includes(statusStr) ||
                            ['approved', 'formalized', 'pago'].includes(String(meta.formalization_status || '').toLowerCase());

                        const isRecusado =
                            ['denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined'].includes(fiservStatus) ||
                            ['denied', 'recusado', 'reprovado'].includes(statusStr);

                        const isSimularam = Boolean(meta.simulation_requested || meta.simulation_data || meta.simularam);
                        const hasOkAgente = Boolean(meta.simulation_accepted === true || meta.simulation_accepted === 'true' || meta.ok_agente === true || meta.ok_agente === 'true');

                        if (reengPhones.has(ph)) {
                            if (isConfirmed) reengFunnel.confirmaram++;
                            if (isRevenue) reengFunnel.faturamento++;
                            if (isValorInicial) reengFunnel.valorInicial++;
                            if (isOptIn) {
                                reengFunnel.optIn++;
                                reengMetrics.optIn++;
                            }
                            if (isConverted) {
                                reengFunnel.aprovados++;
                                reengMetrics.conversions++;
                            }
                            if (isRecusado) reengFunnel.recusados++;
                            if (isSimularam) reengFunnel.simularam++;
                            if (hasOkAgente) {
                                reengFunnel.okAgente++;
                                const isDesistencia = (
                                    ['lost', 'cancelled', 'declined', 'desistente', 'recusado'].includes(formalStatus) ||
                                    ['declined', 'lost'].includes(pipeStage) ||
                                    ['lost', 'cancelled', 'declined'].includes(statusStr) ||
                                    extStatus.includes('desistiu')
                                );
                                const isFormalizado = !isDesistencia && (
                                    ['formalized', 'formalizado', 'won', 'concluido'].includes(formalStatus) ||
                                    pipeStage === 'contract_signed'
                                );
                                const isEmAtendimento = !isDesistencia && !isFormalizado && (
                                    ['in_service', 'em_atendimento', 'in_progress', 'formalization'].includes(formalStatus) ||
                                    ['in_contact', 'proposal_sent'].includes(pipeStage)
                                );
                                const isAguarContato = !isDesistencia && !isFormalizado && !isEmAtendimento;

                                if (isDesistencia) reengFunnel.desistencia++;
                                else if (isFormalizado) reengFunnel.formalizado++;
                                else if (isEmAtendimento) reengFunnel.emAtendimento++;
                                else if (isAguarContato) reengFunnel.aguarContato++;
                            }
                        } else if (origPhones.has(ph)) {
                            if (origMetrics.conversions === 0 && isConverted) {
                                origMetrics.conversions += 1;
                            }
                        }
                    });
                }
            } catch (leadsErr) {
                console.warn('Nota: erro ao cruzar conversões de leads:', leadsErr);
            }

            origMetrics.conversionRate = origMetrics.delivered > 0 ? Math.round((origMetrics.conversions / origMetrics.delivered) * 100) : 0;
            reengMetrics.conversionRate = reengMetrics.delivered > 0 ? Math.round((reengMetrics.conversions / reengMetrics.delivered) * 100) : 0;
            reengMetrics.optInRate = reengMetrics.delivered > 0 ? Math.round((reengMetrics.optIn / reengMetrics.delivered) * 100) : 0;

            // 5. Buscar histórico de lotes da tabela campaign_recovery_logs
            let { data: batches } = await supabaseReader
                .from('campaign_recovery_logs')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('campaign_id', campaignId)
                .order('started_at', { ascending: false });

            // Se não houver lote explícito registrado na tabela de logs mas o reengajamento foi disparado na fila
            if ((!batches || batches.length === 0) && reengRows.length > 0) {
                const timestamps = reengRows
                    .map(r => r.reengagement_last_sent_at || r.sent_at)
                    .filter(Boolean)
                    .sort();
                const minStarted = timestamps.length > 0 ? timestamps[0] : new Date().toISOString();
                const maxSent = timestamps.length > 0 ? timestamps[timestamps.length - 1] : minStarted;
                const hasProcessing = reengRows.some(r => r.status === 'processing');

                batches = [{
                    id: `auto-reeng-${campaignId.substring(0, 8)}`,
                    tenant_id: tenantId,
                    campaign_id: campaignId,
                    status: hasProcessing ? 'running' : 'completed',
                    target_options: ['Reativação Automática (Sem Resposta / Lido)'],
                    records_affected: reengRows.length,
                    started_at: minStarted,
                    completed_at: hasProcessing ? null : maxSent,
                    duration_seconds: 0,
                    snapshot_before: {
                        enqueued: reengRows.length,
                        type: 'automatic_scheduler'
                    }
                }];
            }

            const extraReplies = reengMetrics.replied;
            const extraConversions = reengMetrics.conversions;
            const replyGrowthPct = origMetrics.replied > 0 ? Math.round((extraReplies / origMetrics.replied) * 100) : 0;
            const conversionGrowthPct = origMetrics.conversions > 0 ? Math.round((extraConversions / origMetrics.conversions) * 100) : 0;

            return {
                campaignId,
                campaignName,
                original: origMetrics,
                reengagement: reengMetrics,
                originalFunnel: origFunnel,
                reengagementFunnel: reengFunnel,
                delta: {
                    extraReplies,
                    extraConversions,
                    replyGrowthPct,
                    conversionGrowthPct
                },
                batches: batches || []
            };
        } catch (err) {
            console.error('Erro em getReengagementComparisonMetrics:', err);
            return null;
        }
    },

    async getCreditCampaignFunnelStats(
        tenantId: string,
        campaignIds?: string[],
        startDate?: Date,
        agentId?: string
    ): Promise<import('@/lib/types').CreditCampaignFunnelStat[]> {
        // 1. Tenta chamar a RPC get_credit_campaign_funnel_stats
        try {
            const rpcArgs: any = {
                p_tenant_id: tenantId,
                p_campaign_ids: campaignIds && campaignIds.length > 0 ? campaignIds : null,
                p_start_date: startDate ? startDate.toISOString() : null,
                p_agent_id: agentId && agentId !== 'all' ? agentId : null
            };

            const { data, error } = await supabase.rpc('get_credit_campaign_funnel_stats', rpcArgs);
            if (!error && Array.isArray(data) && (data.length === 0 || ('desistencia' in data[0]))) {
                return data.map((row: any) => ({
                    campaignId: row.campaign_id,
                    campaignName: row.campaign_name || 'Campanha',
                    startDate: parseLocalDate(row.start_date),
                    status: row.status || 'active',
                    carregados: Number(row.carregados || 0),
                    enviados: Number(row.enviados || 0),
                    entregues: Number(row.entregues || 0),
                    lidas: Number(row.lidas || 0),
                    interagiram: Number(row.interagiram || 0),
                    confirmaram: Number(row.confirmaram || 0),
                    faturamento: Number(row.faturamento || 0),
                    valorInicial: Number(row.valor_inicial || 0),
                    optIn: Number(row.opt_in || 0),
                    aprovados: Number(row.aprovados || 0),
                    recusados: Number(row.recusados || 0),
                    simularam: Number(row.simularam || 0),
                    okAgente: Number(row.ok_agente || 0),
                    aguarContato: Number(row.aguar_contato || 0),
                    emAtendimento: Number(row.em_atendimento || 0),
                    formalizado: Number(row.formalizado || 0),
                    desistencia: Number(row.desistencia || 0)
                }));
            }
        } catch (rpcErr) {
            console.warn('RPC get_credit_campaign_funnel_stats fallback:', rpcErr);
        }

        // 2. Fallback resiliente: agrega combinando campaigns, outbound_queue e agent_leads
        try {
            let campQuery = supabase
                .from('campaigns')
                .select('id, name, start_date, created_at, status, total_contacts, sent_count, delivered_count, read_count, response_count')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (campaignIds && campaignIds.length > 0) {
                campQuery = campQuery.in('id', campaignIds);
            }
            if (startDate) {
                campQuery = campQuery.gte('created_at', startDate.toISOString());
            }
            if (agentId && agentId !== 'all') {
                campQuery = campQuery.eq('agent_id', agentId);
            }

            const { data: camps, error: campErr } = await campQuery;
            if (campErr || !camps) return [];

            const cIds = camps.map(c => c.id);
            if (cIds.length === 0) return [];

            // Buscar métricas da outbound_queue
            const { data: oqRows } = await supabase
                .from('outbound_queue')
                .select('campaign_id, status, response_detected, sent_at, metadata')
                .in('campaign_id', cIds);

            // Buscar leads e metadados com chunking para não estourar o limite de 10.000 linhas da API
            const leadRows: any[] = [];
            const chunkSize = 5;
            for (let i = 0; i < cIds.length; i += chunkSize) {
                const chunk = cIds.slice(i, i + chunkSize);
                const { data: chunkLeads } = await supabase
                    .from('agent_leads')
                    .select('campaign_id, status, metadata')
                    .in('campaign_id', chunk);
                if (chunkLeads && chunkLeads.length > 0) {
                    leadRows.push(...chunkLeads);
                }
            }

            const oqMap = new Map<string, { carregados: number; enviados: number; entregues: number; lidas: number; interagiram: number }>();
            for (const r of (oqRows || [])) {
                if (!r.campaign_id) continue;
                if (!oqMap.has(r.campaign_id)) {
                    oqMap.set(r.campaign_id, { carregados: 0, enviados: 0, entregues: 0, lidas: 0, interagiram: 0 });
                }
                const m = oqMap.get(r.campaign_id)!;
                m.carregados++;
                const st = (r.status || '').toLowerCase().trim();
                const isSent = !['queued', 'pending', 'scheduled', 'draft'].includes(st) || !!r.sent_at || r.response_detected;
                if (isSent) m.enviados++;
                if (['sent', 'delivered', 'read', 'respondida', 'interagiu'].includes(st) || r.response_detected) m.entregues++;
                if (['read', 'respondida', 'interagiu'].includes(st)) m.lidas++;
                
                const isAutoReply = r.metadata?.is_auto_reply === true || r.metadata?.is_auto_reply === 'true' || r.metadata?.is_bot === true;
                if ((r.response_detected || ['respondida', 'interagiu'].includes(st)) && !isAutoReply) {
                    m.interagiram++;
                }
            }

            const leadMap = new Map<string, {
                confirmaram: number;
                faturamento: number;
                valorInicial: number;
                optIn: number;
                aprovados: number;
                recusados: number;
                simularam: number;
                okAgente: number;
                aguarContato: number;
                emAtendimento: number;
                formalizado: number;
                desistencia: number;
            }>();

            for (const l of (leadRows || [])) {
                if (!l.campaign_id) continue;
                if (!leadMap.has(l.campaign_id)) {
                    leadMap.set(l.campaign_id, {
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
                    });
                }
                const lm = leadMap.get(l.campaign_id)!;
                const meta = l.metadata || {};
                const fiservStatus = String(meta.fiserv_status || l.status || '').toLowerCase().trim();
                const formalStatus = String(meta.formalization_status || '').toLowerCase().trim();
                const pipeStage = String(meta.pipeline_stage || '').toLowerCase().trim();
                const extStatus = String(meta.fiserv_external_status || '').toLowerCase().trim();
                const leadStatus = String(l.status || '').toLowerCase().trim();

                // Identidade Confirmada (explícita ou implícita por avançar de fase)
                const isConfirmed = Boolean(
                    meta.identity_confirmed === true ||
                    meta.identity_confirmed === 'true' ||
                    meta.cnpj_confirmed === true ||
                    meta.cnpj_confirmed === 'true' ||
                    meta.revenue ||
                    meta.faturamento ||
                    meta.requested_amount ||
                    meta.valor_inicial ||
                    meta.simulation_data?.amount ||
                    meta.fiserv_amount_approved ||
                    meta.opt_in === true ||
                    meta.optin === true ||
                    meta.consent?.opt_in === true ||
                    meta.loan_request_id ||
                    meta.simulation_requested ||
                    meta.simularam ||
                    meta.simulation_accepted === true ||
                    meta.simulation_accepted === 'true' ||
                    meta.ok_agente === true ||
                    meta.ok_agente === 'true'
                );
                if (isConfirmed) lm.confirmaram++;

                if (meta.revenue || meta.faturamento) lm.faturamento++;
                if (
                    meta.requested_amount || 
                    meta.valor_inicial || 
                    meta.simulation_data?.amount || 
                    meta.fiserv_amount_approved
                ) lm.valorInicial++;
                if (
                    meta.opt_in === true || 
                    meta.optin === true || 
                    meta.consent?.opt_in === true ||
                    meta.fiserv_requested_at || 
                    meta.loan_request_id
                ) lm.optIn++;
                if (['approved', 'in_quoting', 'comite_approved', 'aprovado'].includes(fiservStatus)) lm.aprovados++;
                if (
                    ['denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined'].includes(fiservStatus) ||
                    ['denied', 'recusado', 'reprovado'].includes(leadStatus)
                ) lm.recusados++;
                if (meta.simulation_requested || meta.simulation_data || meta.simularam) lm.simularam++;
                if (meta.simulation_accepted === true || meta.simulation_accepted === 'true' || meta.ok_agente === true || meta.ok_agente === 'true') {
                    lm.okAgente++;
                }

                // Bloco 3: Funil de Formalização - Exige rigorosamente aceite na simulação (hasOkAgente)
                const hasOkAgente = Boolean(
                    meta.simulation_accepted === true ||
                    meta.simulation_accepted === 'true' ||
                    meta.ok_agente === true ||
                    meta.ok_agente === 'true' ||
                    meta.accepted_proposal != null ||
                    meta.formalized_at != null
                );

                if (hasOkAgente) {
                    const isDesistencia = (
                        ['lost', 'cancelled', 'declined', 'desistente', 'recusado'].includes(formalStatus) ||
                        ['declined', 'lost'].includes(pipeStage) ||
                        ['lost', 'cancelled', 'declined'].includes(leadStatus) ||
                        extStatus.includes('desistiu') ||
                        meta.decline_at != null ||
                        meta.decline_reason != null
                    );

                    const isFormalizado = !isDesistencia && (
                        ['formalized', 'formalizado', 'won', 'concluido'].includes(formalStatus) ||
                        pipeStage === 'contract_signed' ||
                        fiservStatus === 'won' ||
                        Boolean(meta.formalized_at)
                    );

                    const isEmAtendimento = !isDesistencia && !isFormalizado && (
                        ['in_service', 'em_atendimento', 'in_progress', 'formalization'].includes(formalStatus) ||
                        ['in_contact', 'proposal_sent'].includes(pipeStage)
                    );

                    const isAguarContato = !isDesistencia && !isFormalizado && !isEmAtendimento;

                    if (isDesistencia) lm.desistencia++;
                    else if (isFormalizado) lm.formalizado++;
                    else if (isEmAtendimento) lm.emAtendimento++;
                    else if (isAguarContato) lm.aguarContato++;
                }
            }

            return camps.map(c => {
                const oq = oqMap.get(c.id) || {
                    carregados: c.total_contacts || 0,
                    enviados: c.sent_count || 0,
                    entregues: c.delivered_count || 0,
                    lidas: c.read_count || 0,
                    interagiram: c.response_count || 0
                };
                const lm = leadMap.get(c.id) || {
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

                return {
                    campaignId: c.id,
                    campaignName: c.name || 'Campanha',
                    startDate: parseLocalDate(c.start_date || c.created_at),
                    status: c.status || 'active',
                    carregados: oq.carregados,
                    enviados: oq.enviados,
                    entregues: oq.entregues,
                    lidas: oq.lidas,
                    interagiram: oq.interagiram,
                    confirmaram: lm.confirmaram,
                    faturamento: lm.faturamento,
                    valorInicial: lm.valorInicial,
                    optIn: lm.optIn,
                    aprovados: lm.aprovados,
                    recusados: lm.recusados,
                    simularam: lm.simularam,
                    okAgente: lm.okAgente,
                    aguarContato: lm.aguarContato,
                    emAtendimento: lm.emAtendimento,
                    formalizado: lm.formalizado,
                    desistencia: lm.desistencia
                };
            });
        } catch (err) {
            console.error('Error fetching fallback credit funnel stats:', err);
            return [];
        }
    },

    /**
     * Realiza auditoria prévia da lista de contatos carregados para uma campanha.
     * Separa os registros em 3 categorias:
     *  - valid: nunca tentados ou com mensagem entregue no celular, sem recusa recente (<60d). Marcado por padrão.
     *  - undelivered: histórico de mensagem anterior que falhou / não chegou ao celular. Desmarcado por padrão.
     *  - refused_60d: proposta recusada/negada nos últimos 60 dias. Desmarcado por padrão.
     */
    async auditCampaignLeads(
        tenantId: string,
        rawContacts: Array<{
            name: string;
            phone: string;
            identifier: string;
            ctaLink?: string;
            rowNumber: number;
            rawData?: any;
        }>
    ): Promise<import('@/lib/types').AuditedLeadItem[]> {
        if (!tenantId || rawContacts.length === 0) return [];

        const cleanIdentifiers: string[] = [];
        const cleanPhonesSet = new Set<string>();

        // Prepara coleções para busca em lote
        rawContacts.forEach(c => {
            const rawId = String(c.identifier || '').replace(/\D/g, '');
            if (rawId) {
                const idPad = rawId.length < 14 ? rawId.padStart(14, '0') : rawId;
                cleanIdentifiers.push(idPad);
            }

            const rawPh = String(c.phone || '').replace(/\D/g, '');
            if (rawPh) {
                cleanPhonesSet.add(rawPh);
                if (rawPh.startsWith('55') && rawPh.length > 11) {
                    cleanPhonesSet.add(rawPh.slice(2));
                } else if (!rawPh.startsWith('55')) {
                    cleanPhonesSet.add(`55${rawPh}`);
                }
            }
        });

        const allPhones = Array.from(cleanPhonesSet);

        // Mapas de inteligência
        // 1. Mapa de Recusas Recentes (CNPJ ou Telefone -> { daysAgo, reason, status })
        const refusalMap = new Map<string, { daysAgo: number; reason: string; status: string }>();

        // 2. Mapa de Histórico de Entregas (Telefone -> { hasSuccess, lastFailureStatus, lastError })
        const deliveryMap = new Map<string, { hasSuccess: boolean; hasFailure: boolean; lastError?: string }>();

        // Busca em lotes de 300 para segurança de rede
        const chunkSize = 300;

        // A. Consultar agent_leads para verificar recusas de crédito nos últimos 60 dias
        for (let i = 0; i < cleanIdentifiers.length; i += chunkSize) {
            const idChunk = cleanIdentifiers.slice(i, i + chunkSize);
            try {
                const { data, error } = await supabaseReader
                    .from('agent_leads')
                    .select('identifier, whatsapp, status, metadata, pipeline_stage, created_at, updated_at')
                    .eq('tenant_id', tenantId)
                    .in('identifier', idChunk);

                if (!error && data) {
                    data.forEach((lead: any) => {
                        const meta = lead.metadata || {};
                        const fiservStatus = String(meta.fiserv_status || lead.status || '').toLowerCase().trim();
                        const formalStatus = String(meta.formalization_status || '').toLowerCase().trim();
                        const pipeStage = String(lead.pipeline_stage || '').toLowerCase().trim();
                        const lostReason = String(meta.lost_reason || '').toLowerCase().trim();

                        const isDeclined =
                            pipeStage === 'declined' ||
                            ['denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined'].includes(fiservStatus) ||
                            ['lost', 'denied', 'recusado', 'reprovado', 'declined'].includes(formalStatus) ||
                            lostReason.includes('crédito') ||
                            lostReason.includes('reprovad') ||
                            lostReason.includes('politica');

                        if (isDeclined) {
                            const deniedDateRaw =
                                meta.fiserv_last_audit_at ||
                                meta.lost_at ||
                                meta.refusal_date ||
                                meta.fiserv_requested_at ||
                                lead.updated_at ||
                                lead.created_at;

                            const deniedDate = new Date(deniedDateRaw);
                            if (!isNaN(deniedDate.getTime())) {
                                const diffTime = Math.abs(Date.now() - deniedDate.getTime());
                                const daysAgo = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                                if (daysAgo <= 60) {
                                    const reason = meta.lost_reason || meta.refusal_reason || 'Proposta recusada em análise de crédito';
                                    const refInfo = { daysAgo, reason, status: fiservStatus || formalStatus || 'declined' };

                                    const cleanId = String(lead.identifier || '').replace(/\D/g, '').padStart(14, '0');
                                    if (cleanId) refusalMap.set(cleanId, refInfo);

                                    const cleanPh = String(lead.whatsapp || '').replace(/\D/g, '');
                                    if (cleanPh) refusalMap.set(cleanPh, refInfo);
                                }
                            }
                        }
                    });
                }
            } catch (err) {
                console.warn('Erro ao consultar agent_leads para auditoria prévia:', err);
            }
        }

        // B. Consultar outbound_queue para verificar histórico de entrega de mensagens
        for (let i = 0; i < allPhones.length; i += chunkSize) {
            const phoneChunk = allPhones.slice(i, i + chunkSize);
            try {
                const { data, error } = await supabaseReader
                    .from('outbound_queue')
                    .select('contact_phone, status, error_message, created_at, updated_at')
                    .eq('tenant_id', tenantId)
                    .in('contact_phone', phoneChunk);

                if (!error && data) {
                    data.forEach((row: any) => {
                        const rawPh = String(row.contact_phone || '').replace(/\D/g, '');
                        if (!rawPh) return;

                        const st = String(row.status || '').toLowerCase().trim();
                        const isDelivered = st === 'delivered' || st === 'read' || st === 'sent_success';
                        const isFailed = st === 'failed' || st === 'undelivered' || st === 'error';

                        const prev = deliveryMap.get(rawPh) || { hasSuccess: false, hasFailure: false };
                        if (isDelivered) prev.hasSuccess = true;
                        if (isFailed) {
                            prev.hasFailure = true;
                            if (row.error_message) prev.lastError = row.error_message;
                        }

                        deliveryMap.set(rawPh, prev);

                        // Mapear também a variante com/sem 55
                        if (rawPh.startsWith('55') && rawPh.length > 11) {
                            deliveryMap.set(rawPh.slice(2), prev);
                        } else if (!rawPh.startsWith('55')) {
                            deliveryMap.set(`55${rawPh}`, prev);
                        }
                    });
                }
            } catch (err) {
                console.warn('Erro ao consultar outbound_queue para auditoria de entrega:', err);
            }
        }

        // C. Classificação de cada contato da planilha
        return rawContacts.map((contact, idx) => {
            const rawId = String(contact.identifier || '').replace(/\D/g, '');
            const cleanId = rawId.length > 0 && rawId.length < 14 ? rawId.padStart(14, '0') : rawId;
            const rawPh = String(contact.phone || '').replace(/\D/g, '');

            // 1. Checagem de Recusa nos últimos 60 dias (Prioridade Máxima)
            const refusalByCnpj = cleanId ? refusalMap.get(cleanId) : undefined;
            const refusalByPhone = rawPh ? refusalMap.get(rawPh) : undefined;
            const refusal = refusalByCnpj || refusalByPhone;
            const requestedAmount = (contact as any).requestedAmount || contact.rawData?.requestedAmount || null;
            const revenue = (contact as any).revenue || contact.rawData?.revenue || null;

            if (refusal && refusal.daysAgo <= 60) {
                return {
                    id: `audit-${contact.rowNumber}-${idx}`,
                    rowNumber: contact.rowNumber,
                    name: contact.name,
                    phone: contact.phone,
                    identifier: cleanId,
                    ctaLink: contact.ctaLink,
                    category: 'refused_60d' as const,
                    selected: false, // Desmarcado por padrão
                    reason: `Recusado há ${refusal.daysAgo} dia(s) (${refusal.reason || 'Crédito negado'})`,
                    refusalDaysAgo: refusal.daysAgo,
                    requestedAmount,
                    revenue,
                    rawData: contact.rawData
                };
            }

            // 2. Checagem de Falha de Entrega Prévia
            const deliveryInfo = rawPh ? deliveryMap.get(rawPh) : undefined;
            // Se já tentamos antes, teve falha e NUNCA teve uma entrega confirmada posterior
            if (deliveryInfo && deliveryInfo.hasFailure && !deliveryInfo.hasSuccess) {
                return {
                    id: `audit-${contact.rowNumber}-${idx}`,
                    rowNumber: contact.rowNumber,
                    name: contact.name,
                    phone: contact.phone,
                    identifier: cleanId,
                    ctaLink: contact.ctaLink,
                    category: 'undelivered' as const,
                    selected: false, // Desmarcado por padrão
                    reason: deliveryInfo.lastError 
                        ? `Mensagem não chegou ao aparelho: ${deliveryInfo.lastError}` 
                        : 'Tentativa anterior sem entrega no celular (Número com erro ou sem WhatsApp)',
                    refusalDaysAgo: null,
                    requestedAmount,
                    revenue,
                    rawData: contact.rawData
                };
            }

            // 3. Contato Válido / Pronto para Envio
            // (Nunca tentado OU já tentado com entrega de mensagem confirmada, sem recusa recente)
            return {
                id: `audit-${contact.rowNumber}-${idx}`,
                rowNumber: contact.rowNumber,
                name: contact.name,
                phone: contact.phone,
                identifier: cleanId,
                ctaLink: contact.ctaLink,
                category: 'valid' as const,
                selected: true, // Marcado por padrão
                reason: deliveryInfo?.hasSuccess 
                    ? 'Contato já validado anteriormente com entrega confirmada' 
                    : 'Apto para envio',
                refusalDaysAgo: null,
                requestedAmount,
                revenue,
                rawData: contact.rawData
            };
        });
    },

    /**
     * Persiste o relatório de auditoria de despacho de campanha.
     * Grava na tabela campaign_dispatch_audits e salva logs individuais
     * de itens desmarcados em campaign_import_logs para auditoria completa.
     */
    async recordCampaignDispatchAudit(audit: import('@/lib/types').CampaignDispatchAudit): Promise<void> {
        try {
            // 1. Tentar salvar na tabela dedicada de auditoria de despacho
            const { error } = await supabase.from('campaign_dispatch_audits').insert({
                tenant_id: audit.tenantId,
                campaign_id: audit.campaignId,
                imported_by: audit.importedBy || null,
                file_name: audit.fileName || 'importacao_campanha.csv',
                total_uploaded: audit.totalUploaded,
                total_sent: audit.totalSent,
                total_skipped: audit.totalSkipped,
                summary: audit.summary,
                records: audit.records
            });

            if (error) {
                console.warn('Nota: campaign_dispatch_audits não disponível diretamente ou pendente de migração remota:', error.message);
            }
        } catch (e) {
            console.warn('Erro ao gravar campaign_dispatch_audits:', e);
        }

        // 2. Registrar no campaign_import_logs todos os registros desmarcados com os motivos correspondentes
        try {
            const skippedRecords = audit.records.filter(r => !r.selected);
            if (skippedRecords.length > 0) {
                const logsToInsert: Partial<import('@/lib/types').CampaignImportLog>[] = skippedRecords.map((r, i) => {
                    let errorType: import('@/lib/types').CampaignImportLog['errorType'] = 'SKIPPED_BY_OPERATOR';
                    if (r.category === 'refused_60d') {
                        errorType = 'CREDIT_REFUSED_60D';
                    } else if (r.category === 'undelivered') {
                        errorType = 'PREVIOUS_DELIVERY_FAILURE';
                    }

                    return {
                        campaignId: audit.campaignId,
                        tenantId: audit.tenantId,
                        rowNumber: i + 1,
                        contactName: r.name,
                        contactPhone: r.phone,
                        errorType,
                        errorMessage: `Desmarcado para envio: ${r.reason}`,
                        rawData: {
                            identifier: r.identifier,
                            category: r.category,
                            refusalDaysAgo: r.refusalDaysAgo,
                            skippedAt: new Date().toISOString()
                        }
                    };
                });

                // Inserir em chunks de 500
                const chunk = 500;
                for (let i = 0; i < logsToInsert.length; i += chunk) {
                    await this.logImportErrors(logsToInsert.slice(i, i + chunk));
                }
            }
        } catch (err) {
            console.warn('Erro ao registrar contatos desmarcados em campaign_import_logs:', err);
        }
    }
};

