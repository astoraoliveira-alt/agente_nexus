import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf-8');
    const env: Record<string, string> = {};
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#\s]+?)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });

    const url = env['VITE_SUPABASE_URL'];
    const key = env['VITE_SUPABASE_ANON_KEY'];

    if (!url || !key) throw new Error('Missing URL or ANON KEY');

    const supabase = createClient(url, key);

    async function profileQuery(name: string, queryFn: () => Promise<any>) {
        const start = performance.now();
        const { data, error } = await queryFn();
        const end = performance.now();

        if (error) {
            console.error(`❌ [${name}] ERROR:`, error.message);
        } else {
            console.log(`✅ [${name}] Latency: ${(end - start).toFixed(2)}ms | Rows: ${Array.isArray(data) ? data.length : 1}`);
        }
    }

    async function runProfile() {
        console.log('Authenticating...');
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
            email: env['VITE_DEMO_EMAIL'],
            password: env['VITE_DEMO_PASSWORD']
        });

        if (authErr) {
            console.error('Auth error:', authErr);
            return;
        }

        const { data: user, error: userErr } = await supabase.from('users').select('tenant_id').eq('id', authData.user.id).single();
        let tenantId = user?.tenant_id;
        if (!tenantId) {
            console.log('User has no tenantId. Fetching fallback company...');
            const { data: companies } = await supabase.from('companies').select('id').limit(1);
            if (companies && companies.length > 0) tenantId = companies[0].id;
        }
        if (!tenantId) return console.error('Could not determine tenantId');

        console.log(`\n🔍 Profiling DB API Endpoints for Tenant: ${tenantId}...\n`);

        await profileQuery('plans', () => supabase.from('plans').select('*').order('base_price', { ascending: true }));
        await profileQuery('companies_overview', () => supabase.rpc('get_companies_overview'));
        await profileQuery('agents', () => supabase.from('agents').select('*').eq('tenant_id', tenantId));
        await profileQuery('agent_usage_stats (RPC)', () => supabase.rpc('get_agent_usage_stats', { p_tenant_id: tenantId }));
        await profileQuery('conversations', () => supabase.from('conversations').select('id, agents(name), status').eq('tenant_id', tenantId).limit(50));
        await profileQuery('contacts', () => supabase.from('contacts').select('*').eq('tenant_id', tenantId).limit(50));
        await profileQuery('users', () => supabase.from('users').select('*').eq('tenant_id', tenantId));
        await profileQuery('evaluations', () => supabase.from('evaluations').select('*').limit(50));
        await profileQuery('incidents', () => supabase.from('incidents').select('*').limit(50));
        await profileQuery('detailed_consumption (RPC)', () => supabase.rpc('get_detailed_consumption', { p_tenant_id: tenantId }));
        await profileQuery('financial_report (RPC)', () => supabase.rpc('get_financial_report', { p_tenant_id: tenantId }));

        console.log('\n🏁 Profiling Complete.');
    }

    runProfile().catch(console.error);
} catch (e) {
    console.error('Global Error:', e);
}
