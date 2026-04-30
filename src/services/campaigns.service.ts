import { supabase, supabaseReader } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

const parseLocalDate = (d: any): Date => {
    if (!d) return new Date();
    if (typeof d === 'string' && d.indexOf('T') === -1) {
        const parts = d.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        }
    }
    const dt = new Date(d);
    // If it's a UTC midnight date, force it to noon local time to avoid previous day shifts
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
                establishment_name: null
            }));
        }
        const [{ data: leadsData, error: leadsError }, { data: queueContextData, error: queueContextError }] = await Promise.all([
            supabase
            .from('agent_leads')
            .select('whatsapp, name, identifier')
            .eq('tenant_id', tenantId)
            .or('whatsapp.not.is.null,identifier.not.is.null'),
            supabase
                .from('outbound_queue')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
        ]);

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
            if (campaignId && (row as any).campaign_id !== campaignId) continue;
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
            responseDetected: Boolean((queueContextById.get(d.id) as any)?.response_detected),
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

        const { error } = await supabase
            .from('outbound_queue')
            .upsert(dbPayload, {
                onConflict: 'campaign_id,contact_phone',
                ignoreDuplicates: true
            });

        if (error) {
            console.error('Error adding to outbound queue:', error);
            throw error;
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

        const { error } = await supabase
            .from('agent_leads')
            .upsert(dbPayload, {
                onConflict: 'tenant_id,identifier',
                ignoreDuplicates: false,
            });

        if (error) {
            console.error('Error upserting agent leads:', error);
            throw error;
        }
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
            failedCount: c.failed_count,
            responseCount: c.response_count,
            totalMessages: c.total_messages || 0,
            conversionCount: c.conversion_count || 0,
            importErrorCount: c.import_error_count,
            startTime: c.start_time,
            endTime: c.end_time,
            initialMessage: c.initial_message,
            successCriteria: c.success_criteria,
            successLinkFilter: c.success_link_filter,
            metadata: c.metadata,
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
            metadata: campaign.metadata || {}
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
        if (updates.metadata) dbPayload.metadata = updates.metadata;
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

    async getCampaignStats(campaignId: string | null, tenantId: string, useReplica: boolean = false): Promise<any> {
        const client = useReplica ? supabaseReader : supabase;
        const { data, error } = await client.rpc('get_campaign_dashboard_stats', {
            p_campaign_id: campaignId === "" ? null : campaignId,
            p_tenant_id: campaignId === "" ? tenantId : null
        });

        if (error) throw error;
        return data as {
            total_contacts: number;
            import_errors: number;
            sent_count: number;
            delivered_count: number;
            read_count: number;
            response_count: number;
            conversion_count: number;
            conversion_rate: number;
            success_criteria_used: string[];
        };
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
    }
};
