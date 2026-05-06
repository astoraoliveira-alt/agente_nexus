const { createClient } = require('@supabase/supabase-js');

// Usando a Service Role Key para ignorar o RLS e ver todos os agentes
const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function fixRouting() {
    console.log('--- BUSCANDO AGENTES (SERVICE ROLE) ---');
    const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, status, connection_config');
    
    if (error) {
        console.error('Erro:', error);
        return;
    }

    console.log(`Encontrados ${agents.length} agentes.`);
    
    const targetNumber = "551152398510";
    let found = false;

    for (const agent of agents) {
        console.log(`- Agente: ${agent.name} (Status: ${agent.status})`);
        const config = agent.connection_config || {};
        const phoneNumber = config.phoneNumber || config.phone || "";
        
        console.log(`  Número configurado: ${phoneNumber}`);

        if (agent.name.includes('Sofia') || agent.name.includes('Fiserv')) {
            console.log(`  >>> AGENTE ALVO ENCONTRADO! <<<`);
            found = true;
            
            if (phoneNumber !== targetNumber || agent.status !== 'active') {
                console.log(`  ⚠️ Configuração incorreta. Atualizando...`);
                
                const newConfig = { ...config, phoneNumber: targetNumber };
                const { error: updateError } = await supabase
                    .from('agents')
                    .update({ 
                        status: 'active',
                        connection_config: newConfig 
                    })
                    .eq('id', agent.id);
                
                if (updateError) console.error('Erro no update:', updateError);
                else console.log('  ✅ Agente ativado e número mapeado com sucesso!');
            } else {
                console.log('  ✅ Configuração já está correta.');
            }
        }
    }

    if (!found) {
        console.log('❌ Nenhum agente Sofia/Fiserv encontrado para atualizar.');
    }
}

fixRouting().catch(console.error);
