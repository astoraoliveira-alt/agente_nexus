
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

        // 3. Fetch Token Usage Stats (RPC)
        let usageMap: Record<string, { tokens: number, cost: number }> = {};
        try {
            const { data: usageData, error: usageError } = await supabase
                .rpc('get_agent_usage_stats', { p_tenant_id: tenantId });

            if (!usageError && usageData) {
                usageData.forEach((u: any) => {
                    usageMap[u.agent_id] = { tokens: u.total_tokens || 0, cost: u.total_cost || 0 };
                });
            }
        } catch (e) {
            console.warn('Failed to fetch usage stats (RPC missing?):', e);
        }

        // 4. Map & Aggregate
        return agentsData.map(dbAgent => {
            const agentConvs = conversationsData?.filter((c: any) => c.agent_id === dbAgent.id) || [];
            const activeCount = agentConvs.filter((c: any) => c.status !== 'closed').length;
            const totalCount = agentConvs.length;

            const usage = usageMap[dbAgent.id] || { tokens: 0, cost: 0 };

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
                // New Fields
                type: dbAgent.type || 'conversational',
                integrationConfig: dbAgent.integration_config || {},
                // Usage Metrics
                usage: {
                    totalTokens: Number(usage.tokens),
                    totalCost: Number(usage.cost)
                },
                // Legacy mapping (kept for backward compatibility if needed)
                integration: {
                    voice_provider: dbAgent.voice_config?.provider === 'none' ? null : dbAgent.voice_config?.provider,
                    n8n_webhook_url: dbAgent.integration_config?.n8n_webhook_url || `https://n8n.webhook/${dbAgent.id}`
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
            applied_policies: agent.policies || [],
            type: agent.type || 'conversational',
            integration_config: agent.integrationConfig || {}
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
        if (updates.type) dbPayload.type = updates.type;
        if (updates.integrationConfig) dbPayload.integration_config = updates.integrationConfig;

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
            .select('*, messages(*), agents(name, type)') // Join agents to get name + type
            .eq('tenant_id', tenantId)
            .order('last_message_at', { ascending: false });

        if (error) throw error;

        return data.map(c => {
            // 1. Map & Sort Messages (Oldest First - WhatsApp Style)
            const sortedMessages = (c.messages || []).map((m: any) => {
                let cleanContent = m.content;
                // Resilience: Parse JSON content if N8N sent raw object
                try {
                    if (m.content && m.content.trim().startsWith('{')) {
                        const parsed = JSON.parse(m.content);
                        if (parsed.content) cleanContent = parsed.content;
                    }
                } catch (e) { /* Not JSON, ignore */ }

                return {
                    ...m,
                    content: cleanContent,
                    timestamp: new Date(m.created_at || new Date()),
                    sender: m.sender_type as 'user' | 'ai' | 'human',
                    type: m.message_type as 'text' | 'image' | 'audio'
                };
            }).sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());

            // 2. Determine Effective Last Message Time (Self-Healing)
            // Use the last message in the array (newest)
            const conversationTime = new Date(c.last_message_at);
            const newestMessage = sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1] : null;
            const effectiveTime = (newestMessage && newestMessage.timestamp > conversationTime) ? newestMessage.timestamp : conversationTime;

            return {
                id: c.id,
                tenantId: c.tenant_id,
                agentId: c.agent_id,
                agentName: c.agents?.name || 'Agente Desconhecido',
                agentType: c.agents?.type as any, // 'embedded' | 'whatsapp' ...
                userId: c.user_identifier,
                userName: c.user_name,
                channel: c.channel,
                status: c.status,
                assignedOperator: c.assigned_operator_id ? 'Human Operator' : undefined,
                lastMessage: newestMessage?.content || '',
                lastMessageTime: effectiveTime,
                unreadCount: 0,
                messages: sortedMessages
            };
        }) as Conversation[];
    },

    async sendMessage(conversationId: string, content: string, sender: 'user' | 'ai' | 'human', senderName?: string, type: 'text' | 'image' | 'audio' = 'text'): Promise<void> {
        // Fetch conversation to get tenant_id AND agent config (for Webhook)
        const { data: conv } = await supabase
            .from('conversations')
            .select(`
                tenant_id, 
                agents (
                    type,
                    integration_config
                )
            `)
            .eq('id', conversationId)
            .single();

        if (!conv) throw new Error('Conversation not found');

        const { error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                tenant_id: conv.tenant_id,
                content,
                sender_type: sender,
                sender_name: senderName,
                message_type: type,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        // Update conversation last_message_at
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

        // 3. Trigger N8N Webhook (Delivery to Landing Page)
        if (sender === 'human') {
            // Extract URL from Agent Config (Dynamic) or Fallback to Env
            const agentConfig = conv.agents as any; // Type casting for quick fix or update Interface

            // STRICT CHECK: Only trigger N8N if Agent Type is 'whatsapp'
            if (agentConfig?.type === 'whatsapp') {
                const dynamicUrl = agentConfig?.integration_config?.n8n_webhook_url;
                const n8nUrl = dynamicUrl || import.meta.env.VITE_N8N_WEBHOOK_URL;

                if (n8nUrl) {
                    try {
                        console.log('📡 Relaying message to N8N (Dynamic):', n8nUrl);
                        fetch(n8nUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'send_message',
                                conversation_id: conversationId,
                                content: content,
                                sender: 'human',
                                sender_name: senderName,
                                tenant_id: conv.tenant_id
                            })
                        }).catch(err => console.error('❌ N8N Webhook Error:', err));
                    } catch (e) {
                        console.warn('Failed to call N8N:', e);
                    }
                } else {
                    console.warn('⚠️ No N8N Webhook URL configured for this agent.');
                }
            } else {
                console.log('ℹ️ Agent type is not whatsapp, skipping N8N webhook.');
            }
        }
    },

    async logAudit(tenantId: string, actorId: string, actorName: string, action: string, targetType: string, targetId: string, details: string): Promise<void> {
        const { error } = await supabase
            .from('audit_logs')
            .insert({
                tenant_id: tenantId,
                actor_id: actorId,
                actor_name: actorName,
                action,
                target_type: targetType,
                target_id: targetId,
                details
            });

        if (error) console.error('Failed to log audit:', error);
    },

    async updateConversationStatus(conversationId: string, status: string): Promise<void> {
        const { error } = await supabase
            .from('conversations')
            .update({ status })
            .eq('id', conversationId);

        if (error) throw error;
    },

    async assignConversation(conversationId: string, operatorId: string | null, operatorName?: string): Promise<void> {
        // 1. Fetch current conversation to get Tenant ID for Audit
        const { data: conv } = await supabase.from('conversations').select('tenant_id, assigned_operator_id').eq('id', conversationId).single();
        if (!conv) throw new Error('Conversation not found');

        const updates: any = {};
        let auditAction = '';
        let auditDetails = '';

        if (operatorId) {
            // TAKEOVER
            updates.assigned_operator_id = operatorId;
            updates.status = 'human_active';
            auditAction = 'conversation.takeover';
            auditDetails = `Operador ${operatorName} assumiu a conversa`;
        } else {
            // RETURN TO AI
            updates.assigned_operator_id = null;
            updates.status = 'ai_active';
            auditAction = 'conversation.resume_ai';
            auditDetails = 'Conversa devolvida para a IA';
        }

        const { error } = await supabase
            .from('conversations')
            .update(updates)
            .eq('id', conversationId);

        if (error) throw error;

        // 2. Log Audit (Fire and forget)
        if (operatorName && operatorId) {
            // If returning to AI, actor is still the operator who clicked the button
            await this.logAudit(conv.tenant_id, operatorId, operatorName, auditAction, 'conversation', conversationId, auditDetails);
        }
    }
};
