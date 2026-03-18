import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const dashboardService = {
async getDashboardSummary(tenantId: string): Promise<{ agents: Agent[], tenant: Company }> {
        const { data, error } = await supabase.rpc('get_dashboard_summary', { p_tenant_id: tenantId });
        if (error) throw error;

        // Fetch davos costs to accurately calculate internal operational cost for each agent
        let costRates = { llm: 0, msg: 0, voice: 0, twilio: 0 };
        try {
            const davosCosts = await this.getDavosCosts(tenantId);
            costRates = {
                llm: Number(davosCosts.find(c => c.itemKey === 'llm_internal_rate')?.costValue || 0),
                msg: Number(davosCosts.find(c => c.itemKey === 'msg_whatsapp')?.costValue || 0),
                voice: Number(davosCosts.find(c => c.itemKey === 'voice_internal_rate')?.costValue || 0),
                twilio: Number(davosCosts.find(c => c.itemKey === 'twilio_variable')?.costValue || 0),
            };
        } catch (err) {
            console.error('Failed to fetch davos costs for agent cost calculation', err);
        }

        // Plan detail mapping with all price components
        const plan = data.tenant.plan;
        const prices = {
            llmTokenPrice: Number(plan?.llm_token_price || 0),
            messagePrice: Number(plan?.message_price || 0),
            sttMinutePrice: Number(plan?.stt_minute_price || 0),
            ttsMinutePrice: Number(plan?.tts_minute_price || 0),
            basePrice: Number(plan?.base_price || 0)
        };

        return {
            agents: data.agents.map((dbAgent: any) => {
                const stage = dbAgent.lifecycle_stage || 'production';
                const recordedCost = Number(dbAgent.recorded_cost || 0);
                let totalCost = recordedCost;

                if (stage === 'production' || stage === 'monitoring') {
                    totalCost = 0;
                    // Calculate Internal Operational Cost (Davos Costs)
                    totalCost += (Number(dbAgent.total_tokens || 0) / 1000) * costRates.llm;
                    totalCost += Number(dbAgent.total_messages || 0) * costRates.msg; // WhatsApp/Messaging cost
                    totalCost += Number(dbAgent.total_stt || 0) * (costRates.voice + costRates.twilio);
                    totalCost += Number(dbAgent.total_tts || 0) * (costRates.voice + costRates.twilio);
                }

                return {
                    id: dbAgent.id,
                    name: dbAgent.name,
                    tenantId: dbAgent.tenant_id,
                    status: dbAgent.status,
                    channels: dbAgent.channels || [],
                    totalConversations: Number(dbAgent.total_conversations || 0),
                    activeConversations: Number(dbAgent.active_conversations || 0),
                    maxConcurrentConversations: dbAgent.max_concurrency,
                    usage: {
                        totalTokens: Number(dbAgent.total_tokens || 0),
                        totalMessages: Number(dbAgent.total_messages || 0),
                        totalStt: Number(dbAgent.total_stt || 0),
                        totalTts: Number(dbAgent.total_tts || 0),
                        totalCost: totalCost,
                    },
                    brainConfig: dbAgent.brain_config,
                    lifecycleStage: dbAgent.lifecycle_stage,
                    riskLevel: dbAgent.risk_level,
                    role: dbAgent.role,
                    type: dbAgent.type,
                    evolution_instance: dbAgent.evolution_instance,
                    evolution_token: dbAgent.evolution_token,
                    sessionTimeoutSeconds: dbAgent.session_timeout_seconds || 3600,
                    contextWindow: dbAgent.context_window || 10,
                    voiceConfig: dbAgent.voice_config || {},
                    integrationConfig: dbAgent.integration_config || {},
                    integration: {
                        n8n_webhook_url: dbAgent.integration_config?.n8n_webhook_url || `https://n8n.webhook/${dbAgent.id}`
                    },
                    // Hierarchy fields — CRITICAL for parent/sub-agent filtering in the UI
                    parent_agent_id: dbAgent.parent_agent_id || null,
                    is_gatekeeper: dbAgent.is_gatekeeper || false,
                    gatekeeper_scope: dbAgent.gatekeeper_scope || null,
                    requires_security: dbAgent.requires_security || false,
                };
            }),
            tenant: {
                ...data.tenant.company,
                planName: plan?.name,
                planPrices: prices,
                limits: plan?.default_limits || {}
            } as unknown as Company
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
