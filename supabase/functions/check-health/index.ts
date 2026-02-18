import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheckResult {
    service: string;
    status: 'healthy' | 'degraded' | 'down';
    latency: number;
    region: string;
    url?: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const results: HealthCheckResult[] = [];

    // Helper function to ping services
    const pingService = async (name: string, url: string, region: string): Promise<HealthCheckResult> => {
        const start = performance.now();
        try {
            // Timeout after 5s to avoid hanging
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal
            });

            clearTimeout(id);
            const end = performance.now();
            const latency = Math.round(end - start);

            return {
                service: name,
                status: response.ok || response.status === 404 || response.status === 401 ? 'healthy' : 'down', // 401/404 means server is up
                latency,
                region,
                url
            };
        } catch (error) {
            return {
                service: name,
                status: 'down',
                latency: 0,
                region,
                url
            };
        }
    };

    // 1. Backend (Vercel) -> Supabase (AWS | us-west-2)
    // NOTE: Simulating this by checking from Supabase -> Supabase API (Proxy for Vercel->Supabase)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wyfmyipbvoggusclwdhj.supabase.co';
    results.push(await pingService('Backend (Vercel) -> Supabase', supabaseUrl, 'AWS | us-west-2'));

    // 2. Backend (Vercel) -> Workflow (Utah - USA)
    // NOTE: Checking from Supabase to Workflow IP
    results.push(await pingService('Backend (Vercel) -> Workflow', 'http://162.240.145.212', 'Utah - USA'));

    // 3. Workflow -> LLM (OpenAI)
    // NOTE: Simulated Check (Proxy via Supabase -> OpenAI) - labeled as requested
    results.push(await pingService('Workflow -> LLM (OpenAI)', 'https://api.openai.com/v1/models', 'USA'));

    // 4. VAPI -> Workflow
    // NOTE: Simulated Check (Proxy via Supabase -> VAPI) - labeled as requested
    results.push(await pingService('VAPI -> Workflow', 'https://api.vapi.ai/health', 'USA'));

    // 5. Backend (Vercel) -> Hostgator (Domínio)
    results.push(await pingService('Backend (Vercel) -> Hostgator', 'https://davosconsulting.com.br', 'Hostgator BR'));

    return new Response(JSON.stringify({
        timestamp: new Date().toISOString(),
        source_region: '🇧🇷 sa-east-1 (Supabase)',
        checks: results
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
});
