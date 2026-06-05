const fs = require('fs');
const { createClient } = require('./node_modules/@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value) acc[key] = value.join('=').trim().replace(/(^"|"$)/g, '');
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log("Checking DB logic...");
    // Just to see if we can get some recent outbound_queue items
    const { data: oq, error: e1 } = await supabase.from('outbound_queue').select('*').order('created_at', { ascending: false }).limit(5);
    console.log("Outbound Queue:", oq);
}
run();
