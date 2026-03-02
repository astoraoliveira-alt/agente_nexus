import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const agentsService = {
async getAgents(tenantId: string): Promise<Agent[]> {
        // Use the consolidated Dashboard Summary RPC to get Agents + Usage in one trip
        // This is 3-4x faster than the waterfall approach.
        const summary = await this.getDashboardSummary(tenantId);

        // Return only the agents list from the summary
        return summary.agents;
    },

async createAgent(agent: Partial<Agent>): Promise<Agent> {
        // Map Frontend CamelCase to DB snake_case
        const dbPayload = {
            tenant_id: agent.tenantId,
            name: agent.name,
            status: agent.status || 'active',
            risk_level: agent.riskLevel || 'low',
            risk_score: agent.riskScore || 0,
            lifecycle_stage: agent.lifecycleStage || 'development',
            autonomy_level: agent.autonomyLevel || 1,
            channels: agent.channels || [],
            brain_config: agent.brainConfig || {},
            voice_config: agent.voiceConfig || {},
            applied_policies: agent.policies || [],
            context_window: agent.contextWindow || 10,
            session_timeout_seconds: agent.sessionTimeoutSeconds || 3600,
            type: agent.type || 'conversational',
            integration_config: agent.integrationConfig || {},
            ...(agent.evolution_instance ? { evolution_instance: agent.evolution_instance } : {})
        };

        const { data, error } = await supabase
            .from('agents')
            .insert(dbPayload)
            .select()
            .single();

        if (error) throw error;

        // Map back to CamelCase for Frontend Consistency
        return {
            ...data,
            tenantId: data.tenant_id,
            riskLevel: data.risk_level,
            riskScore: data.risk_score,
            lifecycleStage: data.lifecycle_stage,
            autonomyLevel: data.autonomy_level,
            brainConfig: data.brain_config,
            voiceConfig: data.voice_config,
            contextWindow: data.context_window || 10,
            sessionTimeoutSeconds: data.session_timeout_seconds || 3600,
            integrationConfig: data.integration_config,
            totalConversations: data.total_conversations || 0,
            activeConversations: data.active_conversations || 0,
            maxConcurrentConversations: data.max_concurrency || 50,
            policies: data.applied_policies || []
        } as unknown as Agent;
    },

async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
        const dbPayload: any = {};
        if (updates.name) dbPayload.name = updates.name;
        if (updates.last_actor_name) dbPayload.last_actor_name = updates.last_actor_name;
        if (updates.status) dbPayload.status = updates.status;
        if (updates.riskLevel) dbPayload.risk_level = updates.riskLevel;
        if (updates.lifecycleStage) dbPayload.lifecycle_stage = updates.lifecycleStage;
        if (updates.autonomyLevel) dbPayload.autonomy_level = updates.autonomyLevel;
        if (updates.contextWindow) dbPayload.context_window = updates.contextWindow;
        if (updates.sessionTimeoutSeconds !== undefined) dbPayload.session_timeout_seconds = updates.sessionTimeoutSeconds;
        if (updates.brainConfig) {
            dbPayload.brain_config = {
                ...updates.brainConfig,
                // Ensure proper casing for DB if coming from frontend camelCase
                budget_share_pct: (updates.brainConfig as any).budgetSharePct || updates.brainConfig.budget_share_pct
            };
        }
        if (updates.voiceConfig) dbPayload.voice_config = updates.voiceConfig;
        if (updates.type) dbPayload.type = updates.type;
        if (updates.evolution_instance !== undefined) dbPayload.evolution_instance = updates.evolution_instance;
        if (updates.integrationConfig) dbPayload.integration_config = updates.integrationConfig;
        if (updates.policies) dbPayload.applied_policies = updates.policies;

        const { data, error } = await supabase
            .from('agents')
            .update(dbPayload)
            .eq('id', agentId)
            .select()
            .single();

        if (error) throw error;

        // Map response back to CamelCase (Frontend Model)
        return {
            ...data,
            tenantId: data.tenant_id,
            totalConversations: data.total_conversations || 0,
            activeConversations: data.active_conversations || 0,
            maxConcurrentConversations: data.max_concurrency,
            riskLevel: data.risk_level,
            riskScore: data.risk_score,
            lifecycleStage: data.lifecycle_stage,
            autonomyLevel: data.autonomy_level,
            contextWindow: data.context_window || 10,
            sessionTimeoutSeconds: data.session_timeout_seconds || 3600,
            policies: data.applied_policies || [],
            brainConfig: data.brain_config,
            voiceConfig: data.voice_config,
            type: data.type,
            integrationConfig: data.integration_config || {},
            // Legacy mapping
            integration: {
                voice_provider: data.voice_config?.provider === 'none' ? null : data.voice_config?.provider,
                n8n_webhook_url: data.integration_config?.n8n_webhook_url || `https://n8n.webhook/${data.id}`
            }
        } as unknown as Agent;
    },

async deleteAgent(agentId: string): Promise<void> {
        const { error } = await supabase
            .from('agents')
            .delete()
            .eq('id', agentId);

        if (error) throw error;
    },

async updateAgentGovernance(agentId: string, governance: { risk_level?: string, autonomy_level?: number, lifecycle_stage?: string, applied_policies?: string[] }): Promise<void> {
        const { error } = await supabase
            .from('agents')
            .update({
                risk_level: governance.risk_level,
                autonomy_level: governance.autonomy_level,
                lifecycle_stage: governance.lifecycle_stage,
                applied_policies: governance.applied_policies
            })
            .eq('id', agentId);

        if (error) throw error;
    }
};
