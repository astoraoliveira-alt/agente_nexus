import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('porteiro/.env', 'utf8');
const lines = envFile.split('\n');
const env = {};
for (const line of lines) {
  if (line && line.includes('=')) {
    const [key, ...rest] = line.split('=');
    env[key] = rest.join('=');
  }
}

const supabaseUrl = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());

async function run() {
    const configPath = 'sofia_full_config.json';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    console.log(`Uploading configuration from ${configPath} for agent ID ${config.id}...`);

    const { data, error } = await supabase
        .from('agents')
        .update({
            brain_config: config.brain_config,
            workflow_blueprint: config.workflow_blueprint
        })
        .eq('id', config.id)
        .select('*');

    if (error) {
        console.error("❌ Failed to upload configuration:", error.message);
    } else {
        console.log("✅ Configuration uploaded successfully to Supabase!");
        console.log(`Agent: ${data[0].name} (ID: ${data[0].id})`);
    }
}

run();
