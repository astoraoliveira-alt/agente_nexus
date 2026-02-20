import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

// =============================================
// AUTH & CONTEXT (BOOT)
// =============================================

export const api = {
    // Simulating Auth by fetching the first Super Admin or specific email
    // In real app, Supabase Auth handles this.
    async getInitialUser(): Promise<User | null> {
        // 1. Try to find an Operator first (Best for Demo/Support View)
        let { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'operator')
            .eq('is_active', true)
            .limit(1)
            .single();

        // 2. Fallback to Super Admin if no operator found
        if (!data) {
            ({ data, error } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'super_admin')
                .limit(1)
                .single());
        }

        if (error || !data) return null;

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

    async getCompanyUsers(tenantId: string): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', tenantId);

        if (error) throw error;

        return data.map((u: any) => ({
            id: u.id,
            name: u.full_name,
            email: u.email,
            role: u.role,
            tenantId: u.tenant_id,
            isActive: u.is_active
        })) as User[];
    },

    async updateAgentUsage(agentId: string, usage: Partial<Agent['usage']>): Promise<void> {
        const { error } = await supabase
            .from('agents')
            .update({
                usage: {
                    ...(await this.getAgents('')).find(a => a.id === agentId)?.usage,
                    ...usage
                }
            })
            .eq('id', agentId);

        if (error) throw error;
    },

    async generateEmbedding(text: string): Promise<number[]> {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
            console.warn('VITE_OPENAI_API_KEY not found. Skipping embedding generation.');
            return [];
        }

        try {
            const endpoint = import.meta.env.DEV ? '/openai-api/v1/embeddings' : 'https://api.openai.com/v1/embeddings';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-3-small'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI API Error: ${errText}`);
            }

            const data = await response.json();
            return data.data[0].embedding;
        } catch (error) {
            console.error('Failed to generate embedding:', error);
            // Return empty array on failure, so the user knows
            return [];
        }
    },

    async createUser(user: Partial<User>): Promise<User> {
        const { data, error } = await supabase
            .from('users')
            .insert({
                full_name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: user.tenantId,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating user:', error);
            throw error;
        }

        return {
            id: data.id,
            name: data.full_name,
            email: data.email,
            role: data.role,
            tenantId: data.tenant_id,
            isActive: data.is_active
        } as User;
    },

    async updateUser(userId: string, updates: Partial<User>): Promise<User> {
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.full_name = updates.name;
        if (updates.email) dbUpdates.email = updates.email;
        if (updates.role) dbUpdates.role = updates.role;

        const { data, error } = await supabase
            .from('users')
            .update(dbUpdates)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating user:', error);
            throw error;
        }

        return {
            id: data.id,
            name: data.full_name,
            email: data.email,
            role: data.role,
            tenantId: data.tenant_id,
            isActive: data.is_active
        } as User;
    },

    async deleteUser(userId: string): Promise<void> {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    },

    async getTenant(tenantId: string): Promise<Company | null> {
        // 1. Fetch Company
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('*')
            .eq('id', tenantId)
            .maybeSingle();

        if (companyError || !company) {
            if (companyError) console.error('Error fetching tenant:', companyError);
            return null;
        }

        // 2. Fetch Plan Prices (Separate to be resilient to join issues)
        const { data: plan } = await supabase
            .from('plans')
            .select('*')
            .eq('id', company.plan_tier)
            .single();

        return {
            ...company,
            planId: company.plan_tier,
            createdAt: new Date(company.created_at),
            planDetails: {
                ...company.plan_details,
                type: plan?.type as 'fixed' | 'flex' | 'unlimited',
                monthlyFeeCoversUsage: plan?.monthly_fee_covers_usage || false,
                hardLimits: plan?.default_limits || {},
            },
            limits: plan?.default_limits || {},
            settings: company.privacy_settings || {},
            planName: plan?.name,
            planPrices: plan ? {
                basePrice: Number(plan.base_price),
                llmTokenPrice: Number(plan.llm_token_price),
                messagePrice: Number(plan.message_price),
                sttMinutePrice: Number(plan.stt_minute_price),
                ttsMinutePrice: Number(plan.tts_minute_price)
            } : undefined
        } as unknown as Company;
    },

    async updateCompanyPrivacy(tenantId: string, privacySettings: any): Promise<void> {
        const { error } = await supabase
            .from('companies')
            .update({ privacy_settings: privacySettings })
            .eq('id', tenantId);

        if (error) throw error;
    },

    async updateCompanyGovernance(tenantId: string, governanceData: { ai_system_owner_id?: string, risk_owner_id?: string, compliance_officer_id?: string }): Promise<void> {
        const { error } = await supabase
            .from('companies')
            .update(governanceData)
            .eq('id', tenantId);

        if (error) throw error;
    },

    // =============================================
    // PLANS
    // =============================================
    async getPlans(): Promise<PlanCatalog[]> {
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .order('base_price', { ascending: true });

        if (error) {
            console.error('Error fetching plans:', error);
            return [];
        }

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            description: p.description,
            basePrice: Number(p.base_price),
            monthlyFeeCoversUsage: p.monthly_fee_covers_usage, // Map DB to Frontend
            llmTokenPrice: Number(p.llm_token_price),
            messagePrice: Number(p.message_price),
            sttMinutePrice: Number(p.stt_minute_price),
            ttsMinutePrice: Number(p.tts_minute_price),
            defaultLimits: p.default_limits
        }));
    },

    async createPlan(plan: PlanCatalog): Promise<PlanCatalog | null> {
        const dbPlan = {
            id: plan.id,
            name: plan.name,
            type: plan.type,
            description: plan.description,
            base_price: plan.basePrice,
            monthly_fee_covers_usage: plan.monthlyFeeCoversUsage, // Map Frontend to DB
            llm_token_price: plan.llmTokenPrice,
            message_price: plan.messagePrice,
            stt_minute_price: plan.sttMinutePrice,
            tts_minute_price: plan.ttsMinutePrice,
            default_limits: plan.defaultLimits,
            updated_at: new Date()
        };

        const { data, error } = await supabase
            .from('plans')
            .insert(dbPlan)
            .select()
            .single();

        if (error) {
            console.error('Error creating plan:', error);
            return null;
        }

        return plan;
    },

    async updatePlan(plan: PlanCatalog): Promise<PlanCatalog | null> {
        const dbPlan = {
            name: plan.name,
            type: plan.type,
            description: plan.description,
            base_price: plan.basePrice,
            monthly_fee_covers_usage: plan.monthlyFeeCoversUsage, // Map Frontend to DB
            llm_token_price: plan.llmTokenPrice,
            message_price: plan.messagePrice,
            stt_minute_price: plan.sttMinutePrice,
            tts_minute_price: plan.ttsMinutePrice,
            default_limits: plan.defaultLimits,
            updated_at: new Date()
        };

        const { error } = await supabase
            .from('plans')
            .update(dbPlan)
            .eq('id', plan.id);

        if (error) {
            console.error('Error updating plan:', error);
            return null;
        }

        return plan;
    },

    async getPlanAuditLogs(planId: string): Promise<any[]> {
        const { data, error } = await supabase
            .from('plan_audit_logs')
            .select('*, actor:users!actor_id(full_name)')
            .eq('plan_id', planId)
            .order('changed_at', { ascending: false });

        if (error) {
            console.error('Error fetching plan audit logs:', error);
            return [];
        }

        return data;
    },

    // =============================================
    // AGENTS
    // =============================================
    async getCompanies(): Promise<(Company & { _count?: { agents: number; users: number; tokens: number } })[]> {
        const { data, error } = await supabase
            .rpc('get_companies_overview');

        if (error) {
            console.error('Error fetching companies overview:', error);
            return [];
        }

        return data.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            status: c.status,
            planId: c.plan_tier,
            createdAt: new Date(c.created_at),
            limits: c.plan_details?.limits || {},
            settings: c.privacy_settings || {},
            plan: c.plan_tier, // Use the ID directly, legacy mapping was causing 'free' fallback
            planName: c.plan_name || 'Free', // The real name from the DB
            privacySettings: c.privacy_settings || {},
            planPrices: c.plan_prices || {}, // New Field
            _count: {
                agents: c.agents_count || 0,
                users: c.users_count || 0,
                tokens: c.total_tokens || 0,
                messages: c.total_messages || 0 // New Field
            }
        })) as unknown as (Company & { _count: { agents: number; users: number; tokens: number; messages: number }; planPrices: any })[];
    },

    async createCompany(company: Partial<Company>): Promise<Company | null> {
        const dbCompany = {
            name: company.name,
            slug: company.slug,
            plan_tier: company.planId,
            status: company.status,
            plan_details: { limits: company.limits },
            privacy_settings: company.privacySettings || company.settings
            // created_at is default now()
        };

        const { data, error } = await supabase
            .from('companies')
            .insert(dbCompany)
            .select()
            .single();

        if (error) {
            console.error('Error creating company:', error);
            throw error;
        }

        return { ...company, id: data.id } as Company;
    },

    async updateCompany(company: Partial<Company> & { id: string }): Promise<Company | null> {
        // Prepare DB Payload
        const dbCompany: any = {};
        if (company.name) dbCompany.name = company.name;
        if (company.slug) dbCompany.slug = company.slug;
        if (company.planId) dbCompany.plan_tier = company.planId;
        if (company.status) dbCompany.status = company.status;

        // Handle Nested JSON Updates (Merge instead of Replace if possible, or just replace)
        if (company.planDetails) dbCompany.plan_details = company.planDetails; // Sending full object back
        if (company.privacySettings) dbCompany.privacy_settings = company.privacySettings;
        if (company.settings) dbCompany.privacy_settings = company.settings;

        const { error } = await supabase
            .from('companies')
            .update(dbCompany)
            .eq('id', company.id);

        if (error) {
            console.error('Error updating company:', error);
            throw error;
        }

        return company as Company;
    },

    async deleteCompany(tenantId: string): Promise<void> {
        const { error } = await supabase.rpc('delete_company_cascade', { p_tenant_id: tenantId });
        if (error) {
            console.error('Error deleting company:', error);
            throw error;
        }
    },

    async getAgentUsageStats(tenantId: string): Promise<any[]> {
        const { data, error } = await supabase
            .rpc('get_agent_usage_stats', { p_tenant_id: tenantId });

        if (error) {
            console.error('Error fetching agent usage stats:', error);
            return [];
        }

        return data.map((u: any) => ({
            agentId: u.agent_id,
            totalTokens: Number(u.total_tokens),
            totalCost: Number(u.total_cost)
        }));
    },

    async getAgents(tenantId: string): Promise<Agent[]> {
        // 1. Fetch Agents and Tenant Info (for Plan Prices consistency)
        const [{ data: agentsData, error: agentsError }, tenantInfo] = await Promise.all([
            supabase
                .from('agents')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false }),
            this.getTenant(tenantId)
        ]);

        if (agentsError) throw agentsError;

        // 2. Removed Client-Side Conversation Fetching (Optimized to RPC)

        // 3. Fetch Token, Message & Conversation Usage Stats (RPC)
        let usageMap: Record<string, any> = {};
        try {
            const { data: usageData, error: usageError } = await supabase
                .rpc('get_agent_usage_stats', { p_tenant_id: tenantId });

            if (!usageError && usageData) {
                usageData.forEach((u: any) => {
                    // Fields from updated RPC: total_tokens, total_messages, total_stt, total_tts, recorded_cost
                    usageMap[u.agent_id] = u;
                });
            }
        } catch (e) {
            console.warn('Failed to fetch usage stats (RPC missing?):', e);
        }

        // 4. Map & Aggregate
        return agentsData.map(dbAgent => {
            const u = usageMap[dbAgent.id] || { total_tokens: 0, total_messages: 0, recorded_cost: 0, total_conversations: 0, active_conversations: 0 };

            const activeCount = Number(u.active_conversations || 0);
            const totalCount = Number(u.total_conversations || 0);

            // RE-CALCULATE COST (Sync with Consumption Dashboard logic)
            let totalCost = 0;
            const prices = tenantInfo?.planPrices;
            const stage = dbAgent.lifecycle_stage || 'production';

            if (prices && (stage === 'production' || stage === 'monitoring')) {
                totalCost += (Number(u.total_tokens) / 1000) * (prices.llmTokenPrice || 0);
                totalCost += Number(u.total_messages) * (prices.messagePrice || 0);
                totalCost += Number(u.total_stt || 0) * (prices.sttMinutePrice || 0);
                totalCost += Number(u.total_tts || 0) * (prices.ttsMinutePrice || 0);
            } else {
                totalCost = Number(u.recorded_cost || 0);
            }

            return {
                id: dbAgent.id,
                name: dbAgent.name,
                tenantId: dbAgent.tenant_id,
                status: dbAgent.status,
                channels: dbAgent.channels || [],
                totalConversations: totalCount,
                activeConversations: activeCount,
                maxConcurrentConversations: dbAgent.max_concurrency,
                riskLevel: dbAgent.risk_level,
                riskScore: dbAgent.risk_score,
                lifecycleStage: dbAgent.lifecycle_stage,
                autonomyLevel: dbAgent.autonomy_level,
                contextWindow: dbAgent.context_window || 10,
                sessionTimeoutSeconds: dbAgent.session_timeout_seconds || 3600,
                policies: dbAgent.applied_policies || [],
                brainConfig: {
                    ...dbAgent.brain_config,
                    // If budget_share_pct is set in DB but not in typed object, ensure it flows
                    budgetSharePct: dbAgent.brain_config?.budget_share_pct
                },
                voiceConfig: dbAgent.voice_config,
                type: dbAgent.type || 'conversational',
                evolution_instance: dbAgent.evolution_instance,
                integrationConfig: dbAgent.integration_config || {},
                // Usage Metrics
                usage: {
                    totalTokens: Number(u.total_tokens || 0),
                    totalMessages: Number(u.total_messages || 0),
                    totalStt: Number(u.total_stt || 0),
                    totalTts: Number(u.total_tts || 0),
                    totalCost: totalCost
                },
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

    // =============================================
    // KNOWLEDGE BASE (RAG)
    // =============================================
    async getAgentKnowledge(agentId: string): Promise<KnowledgeItem[]> {
        const { data, error } = await supabase
            .from('agent_knowledge')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching agent knowledge:', error);
            return [];
        }

        return data.map((item: any) => ({
            id: item.id,
            tenantId: item.tenant_id,
            agentId: item.agent_id,
            name: item.name,
            content: item.content,
            fileUrl: item.file_url,
            fileType: item.file_type,
            fileSize: item.file_size,
            createdAt: new Date(item.created_at)
        }));
    },

    async addKnowledgeItem(item: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
        const dbPayload: any = {
            tenant_id: item.tenantId,
            agent_id: item.agentId,
            name: item.name,
            content: item.content,
            file_url: item.fileUrl,
            file_type: item.fileType,
            file_size: item.fileSize
        };

        if (item.embedding && item.embedding.length > 0) {
            dbPayload.embedding = item.embedding;
        }

        const { data, error } = await supabase
            .from('agent_knowledge')
            .insert(dbPayload)
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            tenantId: data.tenant_id,
            agentId: data.agent_id,
            name: data.name,
            content: data.content,
            fileUrl: data.file_url,
            fileType: data.file_type,
            fileSize: data.file_size,
            createdAt: new Date(data.created_at)
        };
    },

    async deleteKnowledgeItem(itemId: string): Promise<void> {
        const { error } = await supabase
            .from('agent_knowledge')
            .delete()
            .eq('id', itemId);

        if (error) throw error;
    },

    async getAgentAuditLogs(agentId: string, days: number | 'all' = 7): Promise<any[]> {
        let query = supabase
            .from('agent_audit_logs')
            .select('*, actor:users!actor_id(full_name)')
            .eq('agent_id', agentId)
            .order('changed_at', { ascending: false });

        if (days !== 'all') {
            const dateStr = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            query = query.gte('changed_at', dateStr);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching agent audit logs:', error);
            return [];
        }

        return data;
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
    async getConversationsOverview(tenantId: string): Promise<Conversation[]> {
        const select = this._capabilities.agents ? '*, agents(name, type)' : '*';

        let { data, error } = await supabase
            .from('conversations')
            .select(select)
            .eq('tenant_id', tenantId)
            .order('last_message_at', { ascending: false });

        if (error && (error.code === 'PGRST204' || error.code === '42703')) {
            console.warn('Agent relation missing in conversations, falling back');
            this._capabilities.agents = false;
            const retry = await supabase
                .from('conversations')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('last_message_at', { ascending: false });
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        return (data as any[]).map(c => {
            return {
                id: c.id,
                tenantId: c.tenant_id,
                agentId: c.agent_id,
                agentName: c.agents?.name || 'Agente Desconhecido',
                agentType: c.agents?.type as any, // 'embedded' | 'whatsapp' ...
                userId: c.user_identifier,
                userName: c.user_name || 'Cliente Sem Nome',
                channel: c.channel,
                status: c.status,
                assignedOperator: c.assigned_operator_id ? 'Human Operator' : undefined,
                lastMessage: '', // Overview doesn't fetch content to save bandwidth. 
                // Ideally, we should add a 'last_message_preview' column to conversations table for this.
                lastMessageTime: new Date(c.last_message_at),
                unreadCount: 0,
                messages: [], // Empty by default
                createdAt: new Date(c.created_at)
            };
        }) as Conversation[];
    },

    async getConversationMessages(conversationId: string): Promise<import('@/lib/types').Message[]> {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false }) // Last messages first for limit
            .limit(50);

        if (error) {
            console.error('Error fetching messages:', error);
            return [];
        }

        // Reverse to maintain chronological order in UI
        const chronData = [...data].reverse();

        return chronData.map((m: any) => {
            let cleanContent = m.content;
            try {
                if (m.content && m.content.trim().startsWith('{')) {
                    const parsed = JSON.parse(m.content);
                    if (parsed.content) cleanContent = parsed.content;
                }
            } catch (e) { /* Not JSON, ignore */ }

            return {
                id: m.id,
                conversationId: m.conversation_id,
                tenantId: m.tenant_id,
                tenantSlug: '', // Not needed for display
                content: cleanContent,
                type: (m.message_type || 'text') as 'text' | 'image' | 'audio',
                sender: (m.sender_type === 'user' ? 'user' :
                    m.sender_type === 'human' ? 'human' : 'ai') as 'user' | 'ai' | 'human',
                senderName: m.sender_name,
                timestamp: new Date(m.created_at),
                audioUrl: m.audio_url,
                imageUrl: m.image_url,
                transcription: m.transcription
            };
        }) as import('@/lib/types').Message[];
    },

    async sendMessage(conversationId: string, content: string, sender: 'user' | 'ai' | 'human', senderName?: string, type: 'text' | 'image' | 'audio' = 'text'): Promise<void> {
        // Fetch conversation to get tenant_id AND agent config (for Webhook)
        const { data: conv } = await supabase
            .from('conversations')
            .select(`
                tenant_id,
                user_identifier,
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
                                tenant_id: conv.tenant_id,
                                recipient_phone: conv.user_identifier // Optimized: Send phone directly
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

    async closeConversation(conversationId: string): Promise<void> {
        return this.updateConversationStatus(conversationId, 'closed');
    },

    async getConsumptionMetrics(tenantId: string, days: number = 30): Promise<any[]> {
        const { data, error } = await supabase
            .rpc('get_detailed_consumption', {
                p_tenant_id: tenantId,
                p_days: days
            });

        if (error) {
            console.error('Error fetching consumption:', error);
            return [];
        }

        return data.map((row: any) => ({
            id: row.id,
            agentId: row.agent_id,
            agentName: row.agent_name || 'Agente Removido',
            channel: row.channel,
            metricType: row.metric_type,
            value: Number(row.value), // Ensure number
            cost: Number(row.cost),   // Ensure number
            timestamp: new Date(row.recorded_at), // Corrected field
            tenantId: tenantId
        }));
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
    },

    // =============================================
    // CONTACTS (CRM)
    // =============================================
    async getContacts(tenantId: string): Promise<Contact[]> {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching contacts:', error);
            return [];
        }

        return data.map((c: any) => ({
            id: c.id,
            tenantId: c.tenant_id,
            name: c.name,
            identifier: c.identifier,
            email: c.email,
            phone: c.phone,
            avatarUrl: c.avatar_url,
            tags: c.tags,
            channel: c.channel,
            extraInfo: c.extra_info,
            lifecycleStatus: c.lifecycle_status || 'lead',
            createdAt: new Date(c.created_at),
            updatedAt: new Date(c.updated_at)
        })) as Contact[];
    },

    async createContact(contact: Partial<Contact>): Promise<Contact | null> {
        // Prepare DB object
        const dbContact = {
            tenant_id: contact.tenantId,
            name: contact.name,
            identifier: contact.identifier, // Mandatory
            email: contact.email,
            phone: contact.phone,
            avatar_url: contact.avatarUrl,
            tags: contact.tags || [],
            channel: contact.channel,
            extra_info: contact.extraInfo || {}
        };

        const { data, error } = await supabase
            .from('contacts')
            .insert(dbContact)
            .select()
            .single();

        if (error) {
            console.error('Error creating contact:', error);
            throw error;
        }

        return {
            id: data.id,
            tenantId: data.tenant_id,
            name: data.name,
            identifier: data.identifier,
            email: data.email,
            phone: data.phone,
            avatarUrl: data.avatar_url,
            tags: data.tags,
            extraInfo: data.extra_info,
            createdAt: new Date(data.created_at)
        } as Contact;
    },

    async updateContact(contactId: string, updates: Partial<Contact>): Promise<Contact | null> {
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.name = updates.name;
        if (updates.email) dbUpdates.email = updates.email;
        if (updates.phone) dbUpdates.phone = updates.phone;
        if (updates.avatarUrl) dbUpdates.avatar_url = updates.avatarUrl;
        if (updates.tags) dbUpdates.tags = updates.tags;
        if (updates.channel) dbUpdates.channel = updates.channel;
        if (updates.extraInfo) dbUpdates.extra_info = updates.extraInfo;
        if (updates.lifecycleStatus) dbUpdates.lifecycle_status = updates.lifecycleStatus;

        const { data, error } = await supabase
            .from('contacts')
            .update(dbUpdates)
            .eq('id', contactId)
            .select()
            .single();

        if (error) {
            console.error('Error updating contact:', error);
            throw error;
        }

        return {
            id: data.id,
            tenantId: data.tenant_id,
            name: data.name,
            identifier: data.identifier,
            email: data.email,
            phone: data.phone,
            avatarUrl: data.avatar_url,
            tags: data.tags,
            extraInfo: data.extra_info,
            createdAt: new Date(data.created_at)
        } as Contact;
    },

    async deleteContact(contactId: string): Promise<boolean> {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', contactId);

        if (error) {
            console.error('Error deleting contact:', error);
            return false;
        }
        return true;
    },

    // =============================================
    // QUALITY ASSURANCE (EVALUATIONS)
    // =============================================
    async getEvaluations(tenantId: string): Promise<import('@/lib/types').Evaluation[]> {
        const { data, error } = await supabase
            .from('evaluations')
            .select('*, agents(name), conversations(created_at, user_name)')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(50); // Pagination in future

        if (error) {
            console.error('Error fetching evaluations:', error);
            return [];
        }

        return data.map((e: any) => ({
            id: e.id,
            tenantId: e.tenant_id,
            conversationId: e.conversation_id,
            agentId: e.agent_id,
            score: e.score,
            summary: e.summary,
            tags: e.tags || [],
            criteriaResults: e.criteria_results || {},
            aiModel: e.ai_model,
            createdAt: new Date(e.created_at),
            agentName: e.agents?.name,
            conversationDate: e.conversations?.created_at ? new Date(e.conversations.created_at) : undefined
        }));
    },

    async getUnauditedConversations(tenantId: string): Promise<any[]> {
        const { data, error } = await supabase
            .rpc('get_unaudited_conversations', { p_tenant_id: tenantId });

        if (error) {
            console.error('Error fetching unaudited conversations:', error);
            return [];
        }

        return data || [];
    },

    async getEvaluationByConversation(conversationId: string): Promise<import('@/lib/types').Evaluation | null> {
        const { data, error } = await supabase
            .from('evaluations')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching evaluation:', error);
            return null;
        }

        if (!data) return null;

        return {
            id: data.id,
            tenantId: data.tenant_id,
            conversationId: data.conversation_id,
            agentId: data.agent_id,
            score: data.score,
            summary: data.summary,
            tags: data.tags || [],
            criteriaResults: data.criteria_results || {},
            aiModel: data.ai_model,
            createdAt: new Date(data.created_at)
        };
    },

    async getEvaluationHistory(conversationId: string): Promise<import('@/lib/types').Evaluation[]> {
        const { data, error } = await supabase
            .from('evaluations')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching evaluation history:', error);
            return [];
        }

        return (data || []).map(item => ({
            id: item.id,
            tenantId: item.tenant_id,
            conversationId: item.conversation_id,
            agentId: item.agent_id,
            score: item.score,
            summary: item.summary,
            tags: item.tags || [],
            criteriaResults: item.criteria_results || {},
            aiModel: item.ai_model,
            createdAt: new Date(item.created_at)
        }));
    },

    async triggerAudit(conversationId: string, context?: { tenantId: string; agentId?: string }): Promise<boolean> {
        const baseUrl = import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
        const finalUrl = baseUrl.endsWith('/audit-conversation') ? baseUrl : `${baseUrl}/audit-conversation`;

        try {
            const response = await fetch(finalUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    record: {
                        id: conversationId,
                        ...context // Inject dynamic context (tenantId, agentId)
                    }
                })
            });
            return response.ok;
        } catch (error) {
            console.error('Error triggering audit:', error);
            return false;
        }
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

    // Persistent flags to avoid repeated 400 errors in the same session
    _capabilities: {
        conversations: true,
        resolver: true,
        agents: true
    },

    async getIncidents(tenant_id: string): Promise<import('@/lib/types').AIIncident[]> {
        // If we already know metadata is failing, use basic query immediately
        if (!this._capabilities.conversations && !this._capabilities.resolver && !this._capabilities.agents) {
            const { data, error } = await supabase
                .from('incidents')
                .select('*')
                .eq('tenant_id', tenant_id)
                .order('created_at', { ascending: false });
            if (error) return [];
            return (data || []).map(this._mapIncident);
        }

        let data, error;

        // 1. Build the dynamic select string based on detected capabilities
        const selectParts = ['*'];
        if (this._capabilities.agents) selectParts.push('agents(name)');
        if (this._capabilities.conversations) selectParts.push('conversations(user_name, user_identifier)');
        if (this._capabilities.resolver) selectParts.push('resolver:users!resolved_by(full_name)');

        const selectQuery = selectParts.join(', ');

        const result = await supabase
            .from('incidents')
            .select(selectQuery)
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        data = result.data;
        error = result.error;

        if (error && (error.code === 'PGRST200' || error.code === 'PGRST204' || error.code === '42703' || (error as any).status === 400)) {
            const msg = error.message?.toLowerCase() || '';

            console.warn('Incident fetch metadata failed, retrying base query', error);

            if (msg.includes('conversations')) this._capabilities.conversations = false;
            if (msg.includes('resolver') || msg.includes('resolved_by')) this._capabilities.resolver = false;
            // No specific 'agents' capability flag, agents(name) is usually always present.
            // If it fails, the base query will still include it if it exists.

            const basicResult = await supabase
                .from('incidents')
                .select('*') // Select all columns, including agents(name) if it exists
                .eq('tenant_id', tenant_id)
                .order('created_at', { ascending: false });

            data = basicResult.data; // Update data with the result of the basic query
            error = basicResult.error;
        }

        if (error) {
            console.error('Error fetching incidents (Base Fallback Failed):', error);
            return [];
        }

        return (data || []).map((i: any) => ({
            id: i.id,
            tenantId: i.tenant_id,
            conversationId: i.conversation_id,
            agentId: i.agent_id,
            severity: i.severity,
            title: i.title,
            description: i.description,
            status: i.status,
            reportedBy: i.reported_by,
            createdAt: new Date(i.created_at),
            resolvedAt: i.resolved_at ? new Date(i.resolved_at) : undefined,
            resolvedBy: i.resolved_by,
            resolverName: i.resolver?.full_name,
            attachments: i.attachments || [],
            agentName: i.agents?.name,
            userName: i.conversations?.user_name,
            userIdentifier: i.conversations?.user_identifier,
            actionTaken: i.action_taken
        }));
    },

    async createIncident(incident: Partial<import('@/lib/types').AIIncident>): Promise<void> {
        const payload: any = {
            tenant_id: incident.tenantId,
            agent_id: incident.agentId,
            title: incident.title,
            description: incident.description,
            severity: incident.severity,
            status: incident.status,
            reported_by: incident.reportedBy,
            attachments: incident.attachments || [],
        };

        const id = incident.id;
        let result;

        if (id) {
            // Explicit Update
            result = await supabase
                .from('incidents')
                .update({ ...payload, updated_at: new Date() })
                .eq('id', id);

            if (result.error && (result.error.code === '42703' || result.error.code === 'PGRST204')) {
                result = await supabase
                    .from('incidents')
                    .update(payload)
                    .eq('id', id);
            }
        } else {
            // Explicit Insert
            result = await supabase
                .from('incidents')
                .insert({ ...payload, updated_at: new Date() });

            if (result.error && (result.error.code === '42703' || result.error.code === 'PGRST204')) {
                result = await supabase
                    .from('incidents')
                    .insert(payload);
            }
        }

        if (result.error) throw result.error;
    },

    async deleteIncident(id: string): Promise<void> {
        const { error } = await supabase
            .from('incidents')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async resolveIncident(id: string, actionTaken: string, resolvedBy?: string, attachments?: any[]): Promise<void> {
        const payload: any = {
            status: 'resolved',
            resolved_at: new Date()
        };

        // Only add rich metadata if we think the columns exist
        if (this._capabilities.resolver) {
            payload.action_taken = actionTaken;
            payload.resolved_by = resolvedBy;
            payload.attachments = attachments || [];
        }

        let { error } = await supabase
            .from('incidents')
            .update(payload)
            .eq('id', id);

        if (error && (error.code === 'PGRST200' || error.code === 'PGRST204' || error.code === '42703' || (error as any).status === 400)) {
            console.warn('Metadata resolution failed, retrying with base columns only');
            this._capabilities.resolver = false;

            const basicResult = await supabase
                .from('incidents')
                .update({
                    status: 'resolved',
                    resolved_at: new Date()
                })
                .eq('id', id);

            error = basicResult.error;
        }

        if (error) throw error;
    },

    async uploadIncidentAttachment(file: File): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('incident-attachments')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
            .from('incident-attachments')
            .getPublicUrl(filePath);

        return data.publicUrl;
    },

    async getPolicies(tenant_id: string): Promise<import('@/lib/types').AIPolicy[]> {
        const { data, error } = await supabase
            .from('policies')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching policies:', error);
            return [];
        }

        return data.map((p: any) => ({
            id: p.id,
            tenantId: p.tenant_id,
            name: p.name,
            version: p.version,
            createdAt: new Date(p.created_at),
            rules: p.rules,
            isActive: p.is_active
        }));
    },

    async createPolicy(policy: Partial<import('@/lib/types').AIPolicy>): Promise<void> {
        const { error } = await supabase
            .from('policies')
            .insert({
                tenant_id: policy.tenantId,
                name: policy.name,
                version: policy.version,
                rules: policy.rules,
                is_active: policy.isActive
            });

        if (error) throw error;
    },

    async deletePolicy(id: string): Promise<void> {
        const { error } = await supabase
            .from('policies')
            .delete()
            .eq('id', id);

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

    // =============================================
    // FINANCIALS & DAVOS COSTS
    // =============================================
    async getFinancialReport(month: number, year: number): Promise<import('@/lib/types').FinancialReportRecord[]> {
        const { data, error } = await supabase
            .rpc('get_financial_report', { p_month: month, p_year: year });

        if (error) {
            console.error('Error fetching financial report:', error);
            return [];
        }

        if (!data) return [];

        return data.map((r: any) => ({
            tenantId: r.tenant_id,
            companyName: r.company_name,
            planName: r.plan_name,
            revenueFixed: Number(r.revenue_fixed || 0),
            revenueVariable: Number(r.revenue_variable || 0),
            costFixed: Number(r.cost_fixed || 0),
            costVariableLlm: Number(r.cost_variable_llm || 0),
            costVariableVoice: Number(r.cost_variable_voice || 0),
            costVariableOther: Number(r.cost_variable_other || 0),
            netMargin: Number(r.net_margin || 0)
        }));
    },

    async getDavosCosts(tenantId: string): Promise<import('@/lib/types').CompanyDavosCost[]> {
        const { data, error } = await supabase
            .from('company_davos_costs')
            .select('*')
            .eq('tenant_id', tenantId);

        if (error) {
            console.error('Error fetching davos costs:', error);
            return [];
        }

        return data.map((d: any) => ({
            id: d.id,
            tenantId: d.tenant_id,
            itemKey: d.item_key,
            itemLabel: d.item_label,
            costValue: Number(d.cost_value),
            isRecurring: d.is_recurring,
            createdAt: new Date(d.created_at),
            updatedAt: new Date(d.updated_at)
        }));
    },

    async updateDavosCost(cost: Partial<import('@/lib/types').CompanyDavosCost> & { tenantId: string; itemKey: string }): Promise<void> {
        const payload = {
            tenant_id: cost.tenantId,
            item_key: cost.itemKey,
            item_label: cost.itemLabel,
            cost_value: cost.costValue,
            is_recurring: cost.isRecurring,
            updated_at: new Date()
        };

        const { error } = await supabase
            .from('company_davos_costs')
            .upsert(payload, { onConflict: 'tenant_id, item_key' });

        if (error) {
            console.error('Error updating davos cost:', error);
            throw error;
        }
    },

    // =============================================
    // OUTBOUND QUEUE (Active Campaigns)
    // =============================================
    // =============================================
    // OUTBOUND QUEUE (Active Campaigns)
    // =============================================
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

    // =============================================
    // STRATEGIC CAMPAIGNS (V2)
    // =============================================
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
            startTime: c.start_time,
            endTime: c.end_time,
            initialMessage: c.initial_message,
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
        if (updates.metadata) dbPayload.metadata = updates.metadata;
        if (updates.totalContacts !== undefined) dbPayload.total_contacts = updates.totalContacts;
        if (updates.sentCount !== undefined) dbPayload.sent_count = updates.sentCount;
        if (updates.responseCount !== undefined) dbPayload.response_count = updates.responseCount;

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
    }
};
