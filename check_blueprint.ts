import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});
const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function getBlueprint() {
    const { data } = await supabase.from('agents').select('workflow_blueprint').limit(1);
    if (data && data.length > 0 && data[0].workflow_blueprint) {
        console.log(Object.keys(data[0].workflow_blueprint.steps));
        console.log("envio_link:", data[0].workflow_blueprint.steps["envio_link"]);
        console.log("coleta_faturamento:", data[0].workflow_blueprint.steps["coleta_faturamento"]);
        console.log("apresenta_ofertas:", data[0].workflow_blueprint.steps["apresenta_ofertas"]);
    } else {
        console.log("No data or no blueprint");
    }
}
getBlueprint();
