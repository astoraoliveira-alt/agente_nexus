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
    const { data: agent, error } = await supabase.from('agents').select('*').eq('name', 'Agente Fiserv - Determinístico').single();
    if (agent && agent.brain_config) {
        let systemPrompt = agent.brain_config.systemPrompt;
        
        // Ensure we add the instruction to not output XML tags
        if (!systemPrompt.includes('NUNCA gere tags XML')) {
            systemPrompt += "\n\n<formato_saida>\nIMPORTANTE: NUNCA gere tags XML ou HTML (como <output>) na sua resposta enviada ao cliente. Você deve enviar APENAS o texto puro com os emojis e links necessários, sem envolver a resposta em nenhuma tag.\n</formato_saida>";
            
            agent.brain_config.systemPrompt = systemPrompt;
            
            const { error: updateError } = await supabase.from('agents').update({ brain_config: agent.brain_config }).eq('id', agent.id);
            if (updateError) {
                console.error("Failed to update:", updateError);
            } else {
                console.log("✅ Agente Fiserv - Determinístico atualizado para proibir tags XML!");
            }
        } else {
            console.log("Agente já estava com a instrução de proibir tags XML.");
        }
    }
}
run();
