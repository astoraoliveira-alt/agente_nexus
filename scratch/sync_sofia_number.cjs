const { createClient } = require('@supabase/supabase-js');

// Usando a Service Role Key
const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function syncAgentNumber() {
    const correctNumber = "551151183815"; // Número da imagem
    console.log(`--- SINCRONIZANDO AGENTE PARA O NÚMERO: ${correctNumber} ---`);

    const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, connection_config')
        .ilike('name', '%Sofia%');

    if (error || !agents.length) {
        console.error('Erro ou agente não encontrado:', error);
        return;
    }

    const agent = agents[0];
    console.log(`Agente encontrado: ${agent.name}`);

    const newConfig = { 
        ...(agent.connection_config || {}), 
        phoneNumber: correctNumber,
        zenvia_channel_id: correctNumber 
    };

    const { error: updateError } = await supabase
        .from('agents')
        .update({ 
            status: 'active',
            zenvia_channel_id: correctNumber,
            connection_config: newConfig 
        })
        .eq('id', agent.id);

    if (updateError) {
        console.error('Erro no update:', updateError);
    } else {
        console.log(`✅ Agente Sofia configurado com sucesso para o número ${correctNumber}!`);
        console.log('Agora o Porteiro irá aceitar as mensagens enviadas para este número.');
    }
}

syncAgentNumber().catch(console.error);
