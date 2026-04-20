import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const coreService = {
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

    async getInitialUser(): Promise<User | null> {
        // Consolidated search: find first active operator or super_admin in one query
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .or('role.eq.operator,role.eq.super_admin')
            .eq('is_active', true)
            .order('role', { ascending: false }) // operator (o) first, super_admin (s) later? No, operator comes after super_admin alphabetically. reversed?
            .limit(1)
            .single();

        if (error || !data) return null;

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

    async processDocument(agentId: string, tenantId: string, name: string, textContent: string, fileType?: string, fileSize?: number): Promise<void> {
        console.log('📄 ProcessDocument: Initializing...', { agentId, tenantId, name, fileSize });
        
        // Ensure we have a fresh token
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            console.error('📄 ProcessDocument: No active session found');
            throw new Error('Você precisa estar logado para processar documentos.');
        }

        console.log('📄 ProcessDocument: Invoking Edge Function...');
        const { data, error } = await supabase.functions.invoke('process-document', {
            body: { agentId, tenantId, name, textContent, fileType, fileSize },
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        if (error) {
            console.error('📄 ProcessDocument: Edge Function Error:', error);
            throw new Error(`Erro no processamento: ${error.message || 'Falha na comunicação com o servidor'}`);
        }
        
        console.log('📄 ProcessDocument: Success!', data);
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
            brand_color: c.brand_color,
            logo_url: c.logo_url,
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

        if (company.brand_color !== undefined) dbCompany.brand_color = company.brand_color;
        if (company.logo_url !== undefined) dbCompany.logo_url = company.logo_url;

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

    async getConversationsOverview(tenantId: string): Promise<Conversation[]> {
        // Run both queries in parallel for performance
        const [convResult, countsResult] = await Promise.all([
            supabase
                .from('conversations')
                .select('*, agents:agent_id(name, type)')
                .eq('tenant_id', tenantId)
                .order('last_message_at', { ascending: false, nullsFirst: false }),
            supabase.rpc('get_conversation_message_counts', { p_tenant_id: tenantId })
        ]);

        let { data, error } = convResult;

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

        // Build a lookup map: conversationId → real message count (from RPC)
        const countsMap = new Map<string, number>();
        if (!countsResult.error && countsResult.data) {
            for (const row of countsResult.data as any[]) {
                countsMap.set(row.conversation_id, Number(row.message_count));
            }
        } else if (countsResult.error) {
            console.warn('⚠️ get_conversation_message_counts RPC missing, showing 0:', countsResult.error.message);
        }

        // Fetch contacts to get Ban Status and agent leads to enrich the establishment name
        const userIdentifiers = Array.from(new Set((data as any[]).map(c => c.user_identifier).filter(Boolean)));
        let contactsMap = new Map<string, string>();
        let establishmentMap = new Map<string, string>();
        if (userIdentifiers.length > 0) {
            const [contactsResult, rpcEstablishmentsResult, leadsResult] = await Promise.all([
                supabase
                    .from('contacts')
                    .select('identifier, status')
                    .eq('tenant_id', tenantId)
                    .in('identifier', userIdentifiers),
                supabase.rpc('get_conversation_establishments', {
                    p_tenant_id: tenantId,
                    p_user_identifiers: userIdentifiers
                }),
                supabase
                    .from('agent_leads')
                    .select('whatsapp, name')
                    .eq('tenant_id', tenantId)
                    .not('whatsapp', 'is', null)
            ]);

            const { data: contactsData } = contactsResult;

            if (contactsData) {
                contactsMap = new Map(contactsData.map(c => [c.identifier, c.status]));
            }

            if (!rpcEstablishmentsResult.error && rpcEstablishmentsResult.data) {
                for (const row of rpcEstablishmentsResult.data as any[]) {
                    const establishmentName = String(row.establishment_name || '').trim();
                    if (!establishmentName) continue;

                    for (const variant of this.getPhoneVariants(row.user_identifier)) {
                        if (!establishmentMap.has(variant)) {
                            establishmentMap.set(variant, establishmentName);
                        }
                    }
                }
            }

            if (rpcEstablishmentsResult.error) {
                console.warn('RPC get_conversation_establishments unavailable, falling back to direct agent_leads query:', rpcEstablishmentsResult.error.message);
            }

            if (establishmentMap.size === 0 && leadsResult.error) {
                console.error('Error fetching establishment names from agent_leads:', leadsResult.error);
            }

            if (establishmentMap.size === 0 && !leadsResult.error && leadsResult.data) {
                for (const lead of leadsResult.data as any[]) {
                    const establishmentName = String(lead.name || '').trim();
                    if (!establishmentName) continue;

                    for (const variant of this.getPhoneVariants(lead.whatsapp)) {
                        if (!establishmentMap.has(variant)) {
                            establishmentMap.set(variant, establishmentName);
                        }
                    }
                }
            }
        }

        return (data as any[]).map(c => ({
            id: c.id,
            tenantId: c.tenant_id,
            agentId: c.agent_id,
            agentName: c.agents?.name || 'Agente Desconhecido',
            agentType: c.agents?.type as any,
            userId: c.user_identifier,
            userName: c.user_name || 'Cliente Sem Nome',
            establishmentName: this.getPhoneVariants(c.user_identifier)
                .map(variant => establishmentMap.get(variant))
                .find(Boolean),
            userStatus: contactsMap.get(c.user_identifier) || 'active',
            channel: c.channel,
            status: c.status,
            assignedOperator: c.assigned_operator_id ? 'Human Operator' : undefined,
            lastMessage: '',
            lastMessageTime: new Date(c.last_message_at),
            unreadCount: 0,
            complianceScore: c.compliance_score,
            messageCount: countsMap.get(c.id) ?? 0, // Real total — no pagination limit
            sentiment: c.sentiment ?? null,
            messages: [],
            createdAt: new Date(c.created_at)
        })) as unknown as Conversation[];
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

    async getConsumptionMetrics(tenantId: string, days: number = 30): Promise<any> {
        // 1. Fetch Company to get Plan Prices
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('plan_prices, roi_config')
            .eq('id', tenantId)
            .maybeSingle();

        if (companyError) {
            console.error('Error fetching company for pricing:', companyError);
        }

        const prices = company?.plan_prices || {};
        const roiConfig = company?.roi_config || { operator_hourly_rate: 30.0 };

        // 2. Fetch Detailed Consumption from RPC
        const { data, error } = await supabase.rpc('get_detailed_consumption', {
            p_tenant_id: tenantId,
            p_days: days
        });

        if (error) {
            console.error('Failed to get detailed consumption:', error);
            // Fallback to table if RPC fails (some environments might not have it)
            const { data: fbData, error: fbError } = await supabase
                .from('consumption_metrics')
                .select('*, agents(name)')
                .eq('tenant_id', tenantId)
                .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
            
            if (fbError) throw new Error(`Erro ao buscar consumo: ${fbError.message}`);
            
            return {
                success: true,
                data: (fbData || []).map(m => ({
                    id: m.id,
                    agentId: m.agent_id,
                    agentName: m.agents?.name || 'Agente',
                    channel: m.channel,
                    metricType: m.metric_type,
                    value: Number(m.value),
                    cost: Number(m.cost),
                    timestamp: m.recorded_at,
                    tenantId
                })),
                summary: { totalCost: 0 } // Basic summary on fallback
            };
        }

        // 3. Process and Enrich Data
        let totalCost = 0;
        let totalMessages = 0;
        let totalTokens = 0;
        let totalSTT = 0;
        let totalTTS = 0;

        const enrichedData = (data as any[] || []).map((row: any) => {
            const cost = Number(row.cost || 0);
            const value = Number(row.value || 0);

            totalCost += cost;
            if (row.metric_type === 'messages') totalMessages += value;
            if (row.metric_type === 'tokens') totalTokens += value;
            if (row.metric_type === 'stt_minutes') totalSTT += value;
            if (row.metric_type === 'tts_minutes') totalTTS += value;

            return {
                id: row.id,
                agentId: row.agent_id,
                agentName: row.agent_name || 'Agente Removido',
                channel: row.channel,
                metricType: row.metric_type,
                value: value,
                cost: cost,
                timestamp: row.recorded_at,
                tenantId: tenantId
            };
        });

        // 4. Calculate ROI based on messages saved
        const AVG_MIN_PER_MSG = 2.0;
        const hoursSaved = (totalMessages * AVG_MIN_PER_MSG) / 60;
        const moneySaved = hoursSaved * (roiConfig.operator_hourly_rate || 30.0);

        return {
            success: true,
            data: enrichedData,
            summary: {
                totalCost,
                totalMessages,
                totalTokens,
                totalSTT,
                totalTTS,
                roi: {
                    hoursSaved,
                    moneySaved,
                    display: `${Math.floor(hoursSaved)}h ${Math.round((hoursSaved % 1) * 60)}m`
                }
            }
        };
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
            status: c.status,
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
        if (updates.status) dbUpdates.status = updates.status;

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

    /**
     * Unified Mission Control V2 call.
     * All period logic lives in the DB (fn_get_mission_control_v2).
     * Returns: { metrics: { success, critical, pending, avg_latency }, errors: [], period_info: { start, end } }
     */
    async getMissionControlV2(
        tenantId?: string,
        period: 'today' | 'yesterday' | 'week' | 'month' | 'custom' = 'today',
        search?: string,
        startDate?: string,
        endDate?: string
    ): Promise<{ metrics: any; errors: any[]; period_info: any }> {
        const { data, error } = await supabase.rpc('fn_get_mission_control_v2', {
            p_tenant_id:  tenantId   || null,
            p_period:     period,
            p_search:     search     || null,
            p_start_date: startDate  || null,
            p_end_date:   endDate    || null,
        });
        if (error) throw error;
        return data as { metrics: any; errors: any[]; period_info: any };
    },

    async getErrorRootCauses(tenantId?: string, startDate?: string, endDate?: string, searchText?: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_get_error_root_causes', {
            p_tenant_id:   tenantId   || null,
            p_start_date:  startDate  || null,
            p_end_date:    endDate    || null,
            p_search_text: searchText || null
        });
        if (error) throw error;
        return data || [];
    },

    async getFailedMessages(tenantId?: string, startDate?: string, endDate?: string, searchText?: string): Promise<any[]> {
        try {
            const { data, error } = await supabase.rpc('fn_get_queue_audit', {
                p_tenant_id:     tenantId   || null,
                p_stuck_minutes: 5,
                p_start_date:    startDate  || null,
                p_end_date:      endDate    || null,
                p_search_text:   searchText || null
            });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('[CORE] Error Fetching Queue Audit:', err);
            return [];
        }
    },

    async retryFailedMessage(queueId: string): Promise<void> {
        try {
            const { error } = await supabase.rpc('fn_retry_failed_message', { 
                p_queue_id: queueId 
            });
            if (error) throw error;
        } catch (err) {
            console.error('[CORE] Error Retrying Message:', err);
            throw err;
        }
    },

    /** AI Performance Center - Economia & ROI */
    async getAIPerfEconomics(tenantId?: string, startDate?: string, endDate?: string): Promise<any> {
        const { data, error } = await supabase.rpc('fn_ai_perf_economics', {
            p_tenant_id:  tenantId  || null,
            p_start_date: startDate || null,
            p_end_date:   endDate   || null,
        });
        if (error) throw error;
        return data;
    },

    /** AI Performance Center - Segurança & Compliance */
    async getAIPerfSecurity(tenantId?: string, startDate?: string, endDate?: string): Promise<any> {
        const { data, error } = await supabase.rpc('fn_ai_perf_security', {
            p_tenant_id:  tenantId  || null,
            p_start_date: startDate || null,
            p_end_date:   endDate   || null,
        });
        if (error) throw error;
        return data;
    },

    /** AI Performance Center - Otimização IA */
    async getAIPerfOptimization(tenantId?: string, startDate?: string, endDate?: string): Promise<any> {
        const { data, error } = await supabase.rpc('fn_ai_perf_optimization', {
            p_tenant_id:  tenantId  || null,
            p_start_date: startDate || null,
            p_end_date:   endDate   || null,
        });
        if (error) throw error;
        return data;
    },

    /** AI Performance Center - Conhecimento RAG */
    async getAIPerfKnowledge(tenantId?: string, startDate?: string, endDate?: string): Promise<any> {
        const { data, error } = await supabase.rpc('fn_ai_perf_knowledge', {
            p_tenant_id:  tenantId  || null,
            p_start_date: startDate || null,
            p_end_date:   endDate   || null,
        });
        if (error) throw error;
        return data;
    },

    /** AI Performance Center - Stress Test Lab */
    async triggerStressTest(tenantId: string, agentId: string, count: number): Promise<string> {
        const { data, error } = await supabase.rpc('fn_create_stress_test_payloads', {
            p_tenant_id: tenantId,
            p_agent_id: agentId,
            p_count: count
        });
        if (error) throw error;
        return data as string; // Returns the batch_id
    },

    async cleanupStressTest(batchId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_cleanup_stress_test', {
            p_batch_id: batchId
        });
        if (error) throw error;
    },
};
