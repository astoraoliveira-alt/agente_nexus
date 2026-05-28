import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse porteiro/.env
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

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials in porteiro/.env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());

async function run() {
    console.log('Tentando update direto na tabela agents...');
    
    try {
        const { data: agentsData, error: agentsError } = await supabase
            .from('agents')
            .select('*');
            
        if (agentsError) throw agentsError;
        
        let found = false;
        for (const agent of agentsData) {
            // Check if it's one of the target agents
            const targetAgents = ['Venda de Crédito Whatss', 'Sofia', 'Agente de Vendas', 'Consultor Oficial Ticket', 'Agente Fiserv - Determinístico', 'Sofia - Assessora (Edenred)', 'Sofia - Determinístico', 'Agente Vendas Fiserv'];
            if (!targetAgents.includes(agent.name) && !agent.name.toLowerCase().includes('sofia')) {
                continue;
            }
            
            if (agent.brain_config) {
                let brainConfigStr = JSON.stringify(agent.brain_config);
                // Remove the <output> tag wrapper
                brainConfigStr = brainConfigStr.replace(/<output>\\\\n([\s\S]*?)\\\\n<\/output>/g, '### INSTRUÇÃO FINAL DE AÇÃO ###\\\\n$1\\\\nIMPORTANTE: Nunca inclua a tag <output> nem qualquer outra tag XML na resposta enviada ao cliente.');
                
                // Fallback for different serialization
                brainConfigStr = brainConfigStr.replace(/<output>/g, '### INSTRUÇÃO FINAL DE AÇÃO ###');
                brainConfigStr = brainConfigStr.replace(/<\/output>/g, 'IMPORTANTE: Nunca inclua a tag <output> nem qualquer outra tag XML na resposta enviada ao cliente.');
                
                // Add format enforcement
                if (!brainConfigStr.includes('NÃO GERE TAGS XML')) {
                    brainConfigStr = brainConfigStr.replace(/Se a resposta não seguir as regras de blocos curtos, reescreva automaticamente antes de entregar\./g, 
                        'Se a resposta não seguir as regras de blocos curtos, reescreva automaticamente antes de entregar.\\nNÃO GERE TAGS XML OU HTML (como <output>) na sua resposta. Apenas texto puro.');
                }
                
                // check if changed
                if (brainConfigStr !== JSON.stringify(agent.brain_config)) {
                    const { error: updateError } = await supabase
                        .from('agents')
                        .update({ brain_config: JSON.parse(brainConfigStr) })
                        .eq('id', agent.id);
                        
                    if (updateError) {
                        console.error('Erro ao atualizar o agente', agent.name, updateError);
                    } else {
                        found = true;
                        console.log('✅ Agente atualizado via API:', agent.name);
                    }
                } else {
                    console.log('🔹 Agente já atualizado ou sem tags:', agent.name);
                }
            }
        }
        if (!found) console.log('Nenhum agente precisou ser atualizado.');
    } catch (e) {
        console.error('❌ Fallback error:', e);
    }
}

run();
