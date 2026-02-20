import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#\s]+?)=(.*)$/);
    if (match) env[match[1]] = match[2];
});

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function run() {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: env['VITE_DEMO_EMAIL'],
        password: env['VITE_DEMO_PASSWORD']
    });

    if (authErr) return console.error('Auth error', authErr);

    const { data: user } = await supabase.from('users').select('tenant_id').eq('id', authData.user.id).single();
    if (!user) return;

    console.log('Calling RPC with tenant:', user.tenant_id);
    const { data, error } = await supabase.rpc('get_agent_usage_stats', { p_tenant_id: user.tenant_id });

    if (error) {
        console.error('RPC ERROR DETAILS:', JSON.stringify(error, null, 2));
    } else {
        console.log('RPC SUCCESS. Received:', data?.length, 'rows');
        console.log(data);
    }
}

run();
