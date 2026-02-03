
import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation } from '@/lib/types';

// =============================================
// AUTH & CONTEXT (BOOT)
// =============================================

export const api = {
    // Simulating Auth by fetching the first Super Admin or specific email
    // In real app, Supabase Auth handles this.
    async getInitialUser(): Promise<User | null> {
        // Fallback: Try to fetch Super Admin if no ID is provided (legacy boot)
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'super_admin')
            .limit(1)
            .single();

        if (error) return null;

        return {
            ...data,
            name: data.full_name,
            tenantId: data.tenant_id
        } as unknown as User;
    },

    async getUserById(userId: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) return null;

        return {
            ...data,
            name: data.full_name,
            tenantId: data.tenant_id
        } as unknown as User;
    },

    async getUsers(tenantId: string): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', tenantId);

        if (error) throw error;

        return data.map((u: any) => ({
            ...u,
            name: u.full_name,
            tenantId: u.tenant_id,
            isActive: u.is_active
        })) as User[];
    },

    async getUserByEmail(email: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error) return null;

        return {
            ...data,
            name: data.full_name,
            tenantId: data.tenant_id
        } as unknown as User;
    },

    async getTenant(tenantId: string): Promise<Company | null> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', tenantId)
            .single();

        if (error) {
            console.error('Error fetching tenant:', error);
            return null;
        }

        return {
            ...data,
            planId: data.plan_tier, // Mapping for compatibility
            createdAt: new Date(data.created_at),
            limits: data.plan_details?.limits || {},
            settings: data.privacy_settings || {}
        } as unknown as Company;
    },

    // =============================================
    // AGENTS
    // =============================================
    async getAgents(tenantId: string): Promise<Agent[]> {
        // 1. Fetch Agents
        const { data: agentsData, error: agentsError } = await supabase
            .from('agents')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (agentsError) throw agentsError;

        // 2. Fetch Conversation Stats (Realtime Aggregation)
        // Note: In high-scale prod, this should be a Materialized View or RPC
        const { data: conversationsData } = await supabase
            .from('conversations')
            .select('id, agent_id, status')
            .eq('tenant_id', tenantId);

        // 3. Map & Aggregate
        return agentsData.map(dbAgent => {
            const agentConvs = conversationsData?.filter((c: any) => c.agent_id === dbAgent.id) || [];
            const activeCount = agentConvs.filter((c: any) => c.status !== 'closed').length;
            const totalCount = agentConvs.length;

            return {
                id: dbAgent.id,
                name: dbAgent.name,
                tenantId: dbAgent.tenant_id,
                status: dbAgent.status,
                channels: dbAgent.channels || [],
                totalConversations: totalCount, // Real aggregated count
                activeConversations: activeCount, // Real aggregated count
                maxConcurrentConversations: dbAgent.max_concurrency,
                riskLevel: dbAgent.risk_level,
                riskScore: dbAgent.risk_score,
                lifecycleStage: dbAgent.lifecycle_stage,
                autonomyLevel: dbAgent.autonomy_level,
                policies: dbAgent.applied_policies || [],
                brainConfig: dbAgent.brain_config,
                voiceConfig: dbAgent.voice_config,
                // Legacy mapping
                integration: {
                    voice_provider: dbAgent.voice_config?.provider === 'none' ? null : dbAgent.voice_config?.provider,
                    n8n_webhook_url: `https://n8n.webhook/${dbAgent.id}` // Dynamic gen
                }
            };
        }) as Agent[];
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
            applied_policies: agent.policies || []
        };

        const { data, error } = await supabase
            .from('agents')
            .insert(dbPayload)
            .select()
            .single();

        if (error) throw error;
        return data as unknown as Agent;
    },

    async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
        const dbPayload: any = {};
        if (updates.name) dbPayload.name = updates.name;
        if (updates.status) dbPayload.status = updates.status;
        if (updates.riskLevel) dbPayload.risk_level = updates.riskLevel;
        if (updates.lifecycleStage) dbPayload.lifecycle_stage = updates.lifecycleStage;
        if (updates.autonomyLevel) dbPayload.autonomy_level = updates.autonomyLevel;
        if (updates.brainConfig) dbPayload.brain_config = updates.brainConfig;
        if (updates.voiceConfig) dbPayload.voice_config = updates.voiceConfig;

        const { data, error } = await supabase
            .from('agents')
            .update(dbPayload)
            .eq('id', agentId)
            .select()
            .single();

        if (error) throw error;
        return data as unknown as Agent;
    },

    // =============================================
    // FLOWS
    // =============================================
    async getFlows(tenantId: string): Promise<ConversationalFlow[]> {
        const { data, error } = await supabase
            .from('flows')
            .select('*, flow_stages(*)')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data.map(f => ({
            id: f.id,
            name: f.name,
            tenantId: f.tenant_id,
            description: f.description,
            objective: f.objective,
            status: f.status,
            type: f.direction,
            successCriteria: f.success_criteria, // Frontend expects camelCase
            stages: f.flow_stages.sort((a: any, b: any) => a.step_order - b.step_order).map((s: any) => ({
                id: s.id,
                name: s.name,
                type: s.type,
                order: s.step_order,
                description: s.description,
                expectedOutcome: s.expected_outcome,
                actor: s.actor,
                escalationRule: s.escalation_rule
            })),
            linked_agents: [] // TODO: Fetch from agent_flows table
        })) as unknown as ConversationalFlow[];
    },

    async createFlow(flow: Partial<ConversationalFlow>): Promise<ConversationalFlow> {
        const dbPayload = {
            tenant_id: flow.tenant_id,
            name: flow.name,
            description: flow.description,
            direction: flow.type,
            objective: flow.objective,
            status: flow.status || 'active',
            success_criteria: flow.success_criteria
        };

        const { data, error } = await supabase
            .from('flows')
            .insert(dbPayload)
            .select()
            .single();

        if (error) throw error;

        // TODO: Insert stages into flow_stages table

        return {
            ...flow,
            id: data.id,
            createdAt: new Date(data.created_at)
        } as ConversationalFlow;
    },

    async updateFlow(flowId: string, updates: Partial<ConversationalFlow>): Promise<ConversationalFlow> {
        const dbPayload: any = {};
        if (updates.name) dbPayload.name = updates.name;
        if (updates.description) dbPayload.description = updates.description;
        if (updates.type) dbPayload.direction = updates.type;
        if (updates.objective) dbPayload.objective = updates.objective;
        if (updates.status) dbPayload.status = updates.status;

        const { data, error } = await supabase
            .from('flows')
            .update(dbPayload)
            .eq('id', flowId)
            .select()
            .single();

        if (error) throw error;

        // TODO: Update stages

        return {
            ...updates, // optimistically return updates
            id: flowId
        } as ConversationalFlow;
    },

    // =============================================
    // CONVERSATIONS
    // =============================================
    async getConversations(tenantId: string): Promise<Conversation[]> {
        const { data, error } = await supabase
            .from('conversations')
            .select('*, messages(*)')
            .eq('tenant_id', tenantId)
            .order('last_message_at', { ascending: false });

        if (error) throw error;

        return data.map(c => ({
            id: c.id,
            tenantId: c.tenant_id,
            agentId: c.agent_id,
            userId: c.user_identifier,
            userName: c.user_name,
            channel: c.channel,
            status: c.status,
            assignedOperator: c.assigned_operator_id ? 'Human Operator' : undefined, // Simplify for now
            lastMessage: c.messages?.[0]?.content || '',
            lastMessageTime: new Date(c.last_message_at),
            unreadCount: 0,
            messages: (c.messages || []).map((m: any) => ({
                ...m,
                timestamp: new Date(m.created_at || new Date()), // Map DB created_at to App timestamp
                sender: m.sender_type, // Map DB sender_type to App sender
                type: m.message_type // Map DB message_type to App type
            }))
        })) as Conversation[];
    },

    async sendMessage(conversationId: string, content: string, sender: 'user' | 'ai', type: 'text' | 'image' | 'audio' = 'text'): Promise<void> {
        const { error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                content,
                sender_type: sender, // DB column is sender_type
                message_type: type, // DB column is message_type
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        // Update conversation last_message_at
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);
    },

    async updateConversationStatus(conversationId: string, status: string): Promise<void> {
        const { error } = await supabase
            .from('conversations')
            .update({ status })
            .eq('id', conversationId);

        if (error) throw error;
    },

    async assignConversation(conversationId: string, operatorId: string | null): Promise<void> {
        const updates: any = {
            assigned_operator_id: operatorId
        };
        if (operatorId) {
            updates.status = 'human_active';
        }

        const { error } = await supabase
            .from('conversations')
            .update(updates)
            .eq('id', conversationId);

        if (error) throw error;
    }
};
