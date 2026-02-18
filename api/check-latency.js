export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const checks = [];

    const pingService = async (name, url, region) => {
        const start = performance.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const end = performance.now();

            return {
                service: name,
                status: response.ok || response.status === 404 || response.status === 401 ? 'healthy' : 'down',
                latency: Math.round(end - start),
                region
            };
        } catch (error) {
            return {
                service: name,
                status: 'down',
                latency: 0,
                region
            };
        }
    };

    // 1. Backend (Vercel) -> Supabase (AWS | us-west-2)
    // We use the Supabase URL from env or fallback to the known project URL
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wyfmyipbvoggusclwdhj.supabase.co';
    checks.push(await pingService('Backend (Vercel) -> Supabase', supabaseUrl, 'AWS | us-west-2'));

    // 2. Backend (Vercel) -> Workflow (Utah - USA)
    checks.push(await pingService('Backend (Vercel) -> Workflow', 'http://162.240.145.212', 'Utah - USA'));

    // 3. Workflow -> LLM (OpenAI)
    // NOTE: Simulated - Vercel acts as proxy to measure OpenAI latency
    checks.push(await pingService('Workflow -> LLM (OpenAI)', 'https://api.openai.com/v1/models', 'USA'));

    // 4. VAPI -> Workflow
    // NOTE: Simulated - Vercel acts as proxy to measure VAPI latency
    checks.push(await pingService('VAPI -> Workflow', 'https://api.vapi.ai/health', 'USA'));

    // 5. Backend (Vercel) -> Hostgator (Domínio)
    checks.push(await pingService('Backend (Vercel) -> Hostgator', 'https://davosconsulting.com.br', 'Hostgator BR'));

    res.status(200).json({
        timestamp: new Date().toISOString(),
        source_region: process.env.VERCEL_REGION || 'Vercel Serverless', // Vercel adds this env var
        checks
    });
}
