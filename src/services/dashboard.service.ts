import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const dashboardService = {
    async getDashboardSummary(tenantId: string): Promise<{ agents: Agent[], tenant: Company }> {
        // Use the consolidated Dashboard Summary RPC
        const { data, error } = await supabase.rpc('get_dashboard_summary', {
            p_tenant_id: tenantId
        });

        if (error) {
            console.error('Failed to get dashboard data:', error);
            throw new Error(`Erro ao buscar dados do dashboard: ${error.message}`);
        }

        // The RPC returns { agents, tenant } matching our needs
        return {
            agents: data.agents,
            tenant: data.tenant
        };
    },

    async getTenantUsage(tenantId: string): Promise<any> {
        const now = new Date();
        const { data, error } = await supabase
            .rpc('get_tenant_usage_summary', {
                p_tenant_id: tenantId,
                p_month: now.getMonth() + 1, // JS months are 0-indexed
                p_year: now.getFullYear()
            });

        if (error) {
            console.error('Error fetching tenant usage:', error);
            // Return zeroed structure on error to prevent UI crash
            return {
                total_tokens: 0,
                stt_minutes: 0,
                tts_minutes: 0,
                total_messages: 0,
                active_agents: 0
            };
        }

        // Single row return
        return data && data.length > 0 ? data[0] : { total_tokens: 0, stt_minutes: 0, tts_minutes: 0, total_messages: 0, active_agents: 0 };
    }
};
