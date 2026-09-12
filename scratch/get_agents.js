import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name').ilike('name', '%Edenred%');
    console.log("Tenants:", tenants);

    const { data: agents, error: aErr } = await supabase.from('agents').select('id, name, tenant_id, system_prompt').in('tenant_id', tenants.map(t => t.id));
    console.log("Agents:");
    agents.forEach(a => console.log(`- ${a.name} (Tenant: ${tenants.find(t=>t.id===a.tenant_id).name})`));
}
run();
