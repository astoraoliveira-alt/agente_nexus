import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name').ilike('name', '%Edenred%');
    console.log("Tenants:", tenants);

    const edenredFiserv = tenants.find(t => t.name === 'Edenred-Fiserv');
    const edenred = tenants.find(t => t.name === 'Edenred');

    if (!edenredFiserv || !edenred) {
        console.error("Missing tenant");
        return;
    }

    const { data: fiservAgents, error: aErr } = await supabase.from('agents').select('*').eq('tenant_id', edenredFiserv.id);
    console.log("Fiserv Agents:", fiservAgents.map(a => a.name));

    const fiservAgent = fiservAgents[0]; // Assuming there is one

    if (fiservAgent) {
        // Find legacy agent in Edenred to rename
        const { data: oldAgents } = await supabase.from('agents').select('*').eq('tenant_id', edenred.id);
        const oldAgent = oldAgents[0];
        if (oldAgent) {
            console.log(`Renaming ${oldAgent.name} to Comercial (Legado)`);
            await supabase.from('agents').update({ name: 'Comercial (Legado)' }).eq('id', oldAgent.id);
        }

        // Clone
        const newAgent = { ...fiservAgent };
        delete newAgent.id;
        newAgent.tenant_id = edenred.id;
        newAgent.name = 'Agente Comercial (Fiserv)';
        
        console.log(`Cloning into Edenred...`);
        const { data: cloned, error: insErr } = await supabase.from('agents').insert(newAgent).select();
        if (insErr) console.error("Insert Error:", insErr);
        else console.log("Cloned successfully:", cloned[0].id);
    }
}
run();
