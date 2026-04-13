import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const campaignsService = {
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

    async getEnrichedOutboundQueue(tenantId: string, campaignId?: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('get_campaign_leads_enriched', {
            p_campaign_id: campaignId || null,
            p_tenant_id: tenantId
        });

        if (error) {
            console.error('Error fetching enriched outbound queue:', error);
            return [];
        }

        return (data as any[] || []).map((d: any) => ({
            id: d.id,
            contactPhone: d.contact_phone,
            contactName: d.contact_name,
            status: d.status,
            metadata: d.metadata,
            cnpj: d.cnpj
        }));
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

async getCampaigns(tenantId: string): Promise<import('@/lib/types').Campaign[]> {
        const { data, error } = await supabase
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
            startDate: new Date(c.start_date),
            endDate: c.end_date ? new Date(c.end_date) : undefined,
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
            startDate: new Date(data.start_date),
            endDate: data.end_date ? new Date(data.end_date) : undefined,
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
        const { data, error } = await supabase
            .from('campaign_import_logs')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('row_number', { ascending: true });

        if (error) {
            console.error('Error fetching import logs:', error);
            return [];
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

    async getCampaignStats(campaignId: string, tenantId?: string) {
        const { data, error } = await supabase.rpc('get_campaign_dashboard_stats', {
            p_campaign_id: campaignId === "" ? null : campaignId,
            p_tenant_id: campaignId === "" ? tenantId : null
        });

        if (error) throw error;
        return data as {
            total_contacts: number;
            import_errors: number;
            sent_count: number;
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
