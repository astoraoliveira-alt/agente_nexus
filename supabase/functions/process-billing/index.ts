import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { tenantId, days = 30 } = await req.json();

        if (!tenantId) {
            throw new Error('Missing required field (tenantId)');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Security check via User Auth
        const authHeader = req.headers.get('Authorization')!;
        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        
        if (authError || !user) {
            throw new Error('Unauthorized');
        }

        // Fetch metrics via existing RPC
        const { data: metrics, error: metricsError } = await supabase
            .rpc('get_detailed_consumption', { p_tenant_id: tenantId, p_days: days });

        if (metricsError) {
            throw new Error(`Error fetching metrics: ${metricsError.message}`);
        }

        // Fetch plan info to calculate message costs which the SQL defaults to 0
        const { data: tenant, error: tenantError } = await supabase
            .from('companies')
            .select(`
                plan_id,
                plan_catalog (
                    message_price,
                    llm_token_price,
                    stt_minute_price,
                    tts_minute_price
                ),
                roi_config
            `)
            .eq('id', tenantId)
            .single();

        if (tenantError) {
            throw new Error(`Error fetching tenant plan: ${tenantError.message}`);
        }

        const plan = tenant.plan_catalog;
        const roiConfig = tenant.roi_config || {};
        const messagePrice = Number(plan?.message_price || 0.01);
        
        let totalCost = 0;
        let totalMessages = 0;
        let totalWhatsAppWindows = 0;
        let totalTokens = 0;
        let totalSTT = 0;
        let totalTTS = 0;
        
        // Enhance metrics with actual message costs and accumulate total
        const processedMetrics = (metrics || []).map((m: any) => {
            let actualCost = Number(m.cost || 0);
            
            // If it's the synthetic message metric calculated by SQL (which sets cost = 0)
            if (m.metric_type === 'messages') {
                if (actualCost === 0) actualCost = Number(m.value || 0) * messagePrice;
                totalMessages += Number(m.value || 0);
            } else if (m.metric_type === 'whatsapp_window_24h') {
                totalMessages += Number(m.value || 0);
                totalWhatsAppWindows += Number(m.value || 0);
            } else if (m.metric_type === 'tokens') {
                totalTokens += Number(m.value || 0);
            } else if (m.metric_type === 'stt_minutes') {
                totalSTT += Number(m.value || 0);
            } else if (m.metric_type === 'tts_minutes') {
                totalTTS += Number(m.value || 0);
            }
            
            totalCost += actualCost;
            
            return {
                ...m,
                cost: actualCost
            };
        });

        const avgMinPerMsg = Number(roiConfig.avg_min_per_msg || 2.0);
        const hourlyRate = Number(roiConfig.operator_hourly_rate || 30.0);
        const hoursSaved = (totalMessages * avgMinPerMsg) / 60;

        return new Response(JSON.stringify({ 
            success: true, 
            data: processedMetrics,
            summary: {
                totalCost,
                totalMessages,
                totalWhatsAppWindows,
                totalTokens,
                totalSTT,
                totalTTS,
                roi: {
                    hoursSaved,
                    moneySaved: hoursSaved * hourlyRate,
                    display: hoursSaved >= 1 ? `${Math.floor(hoursSaved)}h ${Math.round((hoursSaved % 1) * 60)}m` : `${Math.round(hoursSaved * 60)}m`
                }
            },
            currency: 'BRL',
            periodDays: days
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error processing billing:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
