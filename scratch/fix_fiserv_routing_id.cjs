const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function fixFiservRouting() {
    const agentId = "0e5a2927-1617-48a7-9e54-0834ddbbc924";
    const correctNumber = "551151183815";
    
    console.log(`--- ATUALIZANDO AGENTE FISERV (ID: ${agentId}) ---`);

    const { error: updateError } = await supabase
        .from('agents')
        .update({
            status: 'active',
            whatsapp_provider: 'zenvia',
            zenvia_channel_id: correctNumber,
            zenvia_aliases: [correctNumber],
            is_gatekeeper: true
        })
        .eq('id', agentId);

    if (updateError) {
        console.error('Erro no update:', updateError);
    } else {
        console.log(`✅ Agente Fiserv mapeado com sucesso para o número ${correctNumber}!`);
        console.log('O Porteiro agora reconhecerá este número como oficial.');
    }
}

fixFiservRouting().catch(console.error);
