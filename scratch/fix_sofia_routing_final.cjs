const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function fixSofiaRouting() {
    const correctNumber = "551151183815";
    console.log(`--- CORRIGINDO ROTEAMENTO SOFIA PARA: ${correctNumber} ---`);

    // Buscamos o agente Sofia
    const { data: agents, error } = await supabase
        .from('agents')
        .select('*')
        .ilike('name', '%Sofia%');

    if (error || !agents.length) {
        console.error('Agente não encontrado.');
        return;
    }

    const agent = agents[0];
    console.log(`Atualizando agente: ${agent.name} (ID: ${agent.id})`);

    const { error: updateError } = await supabase
        .from('agents')
        .update({
            status: 'active',
            whatsapp_provider: 'zenvia',
            zenvia_channel_id: correctNumber,
            zenvia_aliases: [correctNumber],
            is_gatekeeper: true // Ativando para o Porteiro reconhecer
        })
        .eq('id', agent.id);

    if (updateError) {
        console.error('Erro no update:', updateError);
    } else {
        console.log('✅ Agente Sofia mapeado com sucesso para o número oficial!');
    }
}

fixSofiaRouting().catch(console.error);
