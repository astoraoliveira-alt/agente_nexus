import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { tenantId } = await req.json();

        // Create Supabase client with Service Role key if needed for DAVOS_COSTS
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Fetch Davos Internal Costs
        const { data: davosCosts, error: costError } = await supabase
            .from('davos_costs')
            .select('item_key, cost_value');

        if (costError) throw costError;

        const costRates = {
            llm: Number(davosCosts.find(c => c.item_key === 'llm_internal_rate')?.cost_value || 0),
            msg: Number(davosCosts.find(c => c.item_key === 'msg_whatsapp')?.cost_value || 0),
            voice: Number(davosCosts.find(c => c.item_key === 'voice_internal_rate')?.cost_value || 0),
            twilio: Number(davosCosts.find(c => c.item_key === 'twilio_variable')?.cost_value || 0),
        };

        // 2. Fetch Dashboard Summary from DB
        const { data: summary, error: summaryError } = await supabase.rpc('get_dashboard_summary', { 
            p_tenant_id: tenantId 
        });

        if (summaryError) throw summaryError;

        // 3. Process each agent and calculate INTERNAL cost on the backend
        const enrichedAgents = summary.agents.map((dbAgent: any) => {
            const stage = dbAgent.lifecycle_stage || 'production';
            const recordedCost = Number(dbAgent.recorded_cost || 0);
            let internalOperationalCost = recordedCost;

            // Only calculate if in production/monitoring and recordedCost is 0
            if (stage === 'production' || stage === 'monitoring') {
                internalOperationalCost = 0;
                internalOperationalCost += (Number(dbAgent.total_tokens || 0) / 1000) * costRates.llm;
                internalOperationalCost += Number(dbAgent.total_messages || 0) * costRates.msg;
                // STT + TTS
                internalOperationalCost += Number(dbAgent.total_stt || 0) * (costRates.voice + costRates.twilio);
                internalOperationalCost += Number(dbAgent.total_tts || 0) * (costRates.voice + costRates.twilio);
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
                    totalCost: internalOperationalCost,
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
                parent_agent_id: dbAgent.parent_agent_id || null,
                is_gatekeeper: dbAgent.is_gatekeeper || false,
                gatekeeper_scope: dbAgent.gatekeeper_scope || null,
                requires_security: dbAgent.requires_security || false,
            };
        });

        const plan = summary.tenant.plan;
        const prices = {
            llmTokenPrice: Number(plan?.llm_token_price || 0),
            messagePrice: Number(plan?.message_price || 0),
            sttMinutePrice: Number(plan?.stt_minute_price || 0),
            ttsMinutePrice: Number(plan?.tts_minute_price || 0),
            basePrice: Number(plan?.base_price || 0)
        };

        const enrichedTenant = {
            ...summary.tenant.company,
            planName: plan?.name,
            planPrices: prices,
            limits: plan?.default_limits || {}
        };

        return new Response(
            JSON.stringify({ 
                success: true, 
                agents: enrichedAgents, 
                tenant: enrichedTenant 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
