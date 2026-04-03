import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem, AgentTool } from '@/lib/types';

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
            role: agent.role,
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
            ...(agent.evolution_instance ? { evolution_instance: agent.evolution_instance } : {}),
            ...(agent.evolution_token !== undefined ? { evolution_token: agent.evolution_token } : {}),
            ...(agent.parent_agent_id ? { parent_agent_id: agent.parent_agent_id } : {}),
            whatsapp_provider: agent.whatsapp_provider || 'evolution',
            whatsapp_api_type: (agent as any).whatsapp_api_type || 'evolution',
            meta_api_token: agent.meta_api_token,
            meta_phone_id: agent.meta_phone_id,
            meta_waba_id: agent.meta_waba_id,
            meta_verify_token: agent.meta_verify_token,
            zenvia_channel_id: agent.zenvia_channel_id,
            zenvia_api_token: agent.zenvia_api_token,
            is_gatekeeper: agent.is_gatekeeper || false,
            gatekeeper_scope: agent.gatekeeper_scope || null,
            requires_security: agent.requires_security || false
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
            policies: data.applied_policies || [],
            parent_agent_id: data.parent_agent_id,
            role: data.role,
            whatsapp_provider: data.whatsapp_provider,
            whatsapp_api_type: data.whatsapp_api_type,
            meta_api_token: data.meta_api_token,
            meta_phone_id: data.meta_phone_id,
            meta_waba_id: data.meta_waba_id,
            meta_verify_token: data.meta_verify_token,
            evolution_instance: data.evolution_instance,
            evolution_token: data.evolution_token,
            zenvia_channel_id: data.zenvia_channel_id,
            zenvia_api_token: data.zenvia_api_token,
        } as unknown as Agent;
    },

async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
        const dbPayload: any = {};
        if (updates.name) dbPayload.name = updates.name;
        if (updates.role) dbPayload.role = updates.role;
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
        if (updates.evolution_token !== undefined) dbPayload.evolution_token = updates.evolution_token;
        if (updates.integrationConfig) dbPayload.integration_config = updates.integrationConfig;
        if (updates.policies) dbPayload.applied_policies = updates.policies;
        if (updates.parent_agent_id !== undefined) dbPayload.parent_agent_id = updates.parent_agent_id;
        if (updates.whatsapp_provider !== undefined) dbPayload.whatsapp_provider = updates.whatsapp_provider;
        if ((updates as any).whatsapp_api_type) dbPayload.whatsapp_api_type = (updates as any).whatsapp_api_type;
        if (updates.meta_api_token !== undefined) dbPayload.meta_api_token = updates.meta_api_token;
        if (updates.meta_phone_id !== undefined) dbPayload.meta_phone_id = updates.meta_phone_id;
        if (updates.meta_waba_id !== undefined) dbPayload.meta_waba_id = updates.meta_waba_id;
        if (updates.meta_verify_token !== undefined) dbPayload.meta_verify_token = updates.meta_verify_token;
        if (updates.zenvia_channel_id !== undefined) dbPayload.zenvia_channel_id = updates.zenvia_channel_id;
        if (updates.zenvia_api_token !== undefined) dbPayload.zenvia_api_token = updates.zenvia_api_token;
        // Explicit boolean — must use !== undefined to capture false values
        if (updates.requires_security !== undefined) dbPayload.requires_security = updates.requires_security;
        if (updates.is_gatekeeper !== undefined) dbPayload.is_gatekeeper = updates.is_gatekeeper;
        if (updates.gatekeeper_scope !== undefined) dbPayload.gatekeeper_scope = updates.gatekeeper_scope;

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
            role: data.role,
            voiceConfig: data.voice_config,
            type: data.type,
            integrationConfig: data.integration_config || {},
            parent_agent_id: data.parent_agent_id,
            is_gatekeeper: data.is_gatekeeper || false,
            gatekeeper_scope: data.gatekeeper_scope || null,
            requires_security: data.requires_security || false,
            whatsapp_provider: data.whatsapp_provider,
            whatsapp_api_type: data.whatsapp_api_type,
            meta_api_token: data.meta_api_token,
            meta_phone_id: data.meta_phone_id,
            meta_waba_id: data.meta_waba_id,
            meta_verify_token: data.meta_verify_token,
            evolution_instance: data.evolution_instance,
            evolution_token: data.evolution_token,
            zenvia_channel_id: data.zenvia_channel_id,
            zenvia_api_token: data.zenvia_api_token,
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
    },

    // ============ Agent Tools (Dynamic Hooks) ============
    async getAgentTools(tenantId: string, agentId?: string): Promise<AgentTool[]> {
        let query = supabase
            .from('agent_tools')
            .select('*')
            .eq('tenant_id', tenantId);

        if (agentId) {
            query = query.or(`agent_id.eq.${agentId},agent_id.is.null`);
        } else {
            query = query.is('agent_id', null);
        }

        const { data, error } = await query.order('name', { ascending: true });
        if (error) throw error;
        return data as AgentTool[];
    },

    async createAgentTool(tool: Partial<AgentTool>): Promise<AgentTool> {
        const { data, error } = await supabase
            .from('agent_tools')
            .insert(tool)
            .select()
            .single();

        if (error) throw error;
        return data as AgentTool;
    },

    async updateAgentTool(toolId: string, updates: Partial<AgentTool>): Promise<AgentTool> {
        const { data, error } = await supabase
            .from('agent_tools')
            .update(updates)
            .eq('id', toolId)
            .select()
            .single();

        if (error) throw error;
        return data as AgentTool;
    },

    async deleteAgentTool(toolId: string): Promise<void> {
        const { error } = await supabase
            .from('agent_tools')
            .delete()
            .eq('id', toolId);

        if (error) throw error;
    }
};
