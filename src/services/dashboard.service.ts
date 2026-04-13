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

        // Map snake_case RPC response → camelCase Frontend Model
        const agents = (data.agents || []).map((raw: any) => ({
            ...raw,
            id: raw.id,
            tenantId: raw.tenant_id,
            name: raw.name,
            role: raw.role,
            status: raw.status,
            type: raw.type,
            channels: raw.channels || [],
            riskLevel: raw.risk_level,
            riskScore: raw.risk_score,
            lifecycleStage: raw.lifecycle_stage,
            autonomyLevel: raw.autonomy_level,
            brainConfig: raw.brain_config,
            voiceConfig: raw.voice_config,
            contextWindow: raw.context_window || 10,
            sessionTimeoutSeconds: raw.session_timeout_seconds || 3600,
            integrationConfig: raw.integration_config || {},
            policies: raw.applied_policies || [],
            parent_agent_id: raw.parent_agent_id,
            is_gatekeeper: raw.is_gatekeeper || false,
            gatekeeper_scope: raw.gatekeeper_scope,
            requires_security: raw.requires_security || false,
            whatsapp_api_type: raw.whatsapp_api_type,
            meta_api_token: raw.meta_api_token,
            evolution_instance: raw.evolution_instance,
            maxConcurrentConversations: raw.max_concurrency || 50,
            // Mapped conversation counts
            activeConversations: Number(raw.active_conversations || 0),
            totalConversations: Number(raw.total_conversations || 0),
            // Nested usage object expected by Agent cards
            usage: {
                totalTokens: Number(raw.total_tokens || 0),
                totalMessages: Number(raw.total_messages || 0),
                totalStt: Number(raw.total_stt || 0),
                totalTts: Number(raw.total_tts || 0),
                totalCost: Number(raw.recorded_cost || 0),
            },
        }));

        // Consolidate sub-agent metrics into their parent agent
        // Sub-agents contribute to the parent's totals (usage, conversations)
        agents.forEach((agent: any) => {
            if (agent.parent_agent_id) {
                const parent = agents.find((a: any) => a.id === agent.parent_agent_id);
                if (parent) {
                    parent.activeConversations += agent.activeConversations;
                    parent.totalConversations += agent.totalConversations;
                    parent.usage.totalTokens += agent.usage.totalTokens;
                    parent.usage.totalMessages += agent.usage.totalMessages;
                    parent.usage.totalStt += agent.usage.totalStt;
                    parent.usage.totalTts += agent.usage.totalTts;
                    parent.usage.totalCost += agent.usage.totalCost;
                }
            }
        });

        return {
            agents,
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
    },

    async getDashMaster(tenantId: string): Promise<any> {
        const { data, error } = await supabase.rpc('get_dashmaster_v1', {
            p_tenant_id: tenantId
        });

        if (error) {
            console.error('Failed to get dashmaster data:', error);
            throw new Error(`Erro ao buscar dados consolidados do dashboard: ${error.message}`);
        }

        return data;
    },

    /**
     * Edenred-only: returns total contacts interacted + contacts
     * that received the proposal link (deduped per contact/conversation).
     */
    async getEdenredConversionFunnel(tenantId: string): Promise<{
        total_contacts: number;
        link_sent_contacts: number;
        conversion_rate: number;
    }> {
        const { data, error } = await supabase.rpc('get_edenred_conversion_funnel', {
            p_tenant_id: tenantId
        });

        if (error) {
            console.error('Failed to get Edenred conversion funnel:', error);
            return { total_contacts: 0, link_sent_contacts: 0, conversion_rate: 0 };
        }

        return data as { total_contacts: number; link_sent_contacts: number; conversion_rate: number };
    },

    async getExecutiveInsights(tenantId: string, days: number): Promise<any> {
        const { data, error } = await supabase.rpc('get_executive_insights', {
            p_tenant_id: tenantId,
            p_days: days
        });

        if (error) {
            console.error('Failed to get executive insights:', error);
            throw error;
        }

        return data;
    }
};
