const fs = require('fs');
const { createClient } = require('./node_modules/@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if(key && value.length > 0) acc[key.trim()] = value.join('=').trim().replace(/"/g, '');
    return acc;
}, {});

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Atualizando conversa...");
    // 1. Busca a conversa do número fornecido
    const { data: convs, error: fetchErr } = await supabase
        .from('conversations')
        .select('id, user_identifier, status, created_at, last_message_at')
        .eq('user_identifier', '5534991582004')
        .eq('status', 'ai_active')
        .order('created_at', { ascending: false })
        .limit(1);

    if (fetchErr) {
        console.error("Erro ao buscar:", fetchErr);
        return;
    }

    if (!convs || convs.length === 0) {
        console.log("Nenhuma conversa ai_active encontrada para este número.");
        return;
    }

    const conversationId = convs[0].id;
    console.log("Conversa encontrada:", conversationId, "Data Atual:", convs[0].last_message_at);

    // 2. Volta o tempo em 24 horas
    const date = new Date();
    date.setHours(date.getHours() - 24);
    
    const { error: updateErr } = await supabase
        .from('conversations')
        .update({ last_message_at: date.toISOString() })
        .eq('id', conversationId);

    if (updateErr) {
        console.error("Erro ao atualizar:", updateErr);
    } else {
        console.log("Sucesso! last_message_at alterado para:", date.toISOString());
    }
}

run();
