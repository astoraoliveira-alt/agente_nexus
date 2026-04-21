
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Parsing manual do .env.local para evitar dependência do dotenv
const envPath = path.join('/Users/user/SaaS - Davos Nexus/agent-nexus-hub', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) envConfig[key.trim()] = value.join('=').trim();
});

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);
const PORTEIRO_URL = "https://api.davosconsulting.com.br";

async function runStressTest() {
    console.log('🚀 Iniciando Stress Test: Operação Sofia 1K (Simulação 100 Leads)');

    // Dados extraídos dos logs reais
    const agent = {
        id: '0e5a2927-1617-48a7-9e54-0834ddbbc924',
        tenant_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        zenvia_channel_id: 'amenable-sweatpants',
        name: 'Agente Fiserv - Determinístico'
    };

    console.log(`🤖 Agente Selecionado: ${agent.name} (${agent.id})`);
    console.log(`🏢 Tenant: ${agent.tenant_id}`);

    const NUM_REQUESTS = 100;
    const requests = [];

    console.log(`📦 Preparando ${NUM_REQUESTS} disparos simultâneos...`);

    for (let i = 0; i < NUM_REQUESTS; i++) {
        const phone = `551199999${String(i).padStart(3, '0')}`;
        const payload = {
            id: `STRESS-TEST-${Date.now()}-${i}`,
            timestamp: new Date().toISOString(),
            type: "MESSAGE",
            subscriptionId: "test-subscription",
            channel: "whatsapp",
            direction: "IN",
            message: {
                id: `MSG-STRESS-${i}-${Date.now()}`,
                from: phone,
                to: agent.zenvia_channel_id,
                direction: "IN",
                channel: "whatsapp",
                visitor: { name: `Lead Stress ${i}`, firstName: "Lead", lastName: "Stress" },
                contents: [{ type: "text", text: "Olá, gostaria de saber mais sobre o crédito" }],
                timestamp: new Date().toISOString()
            }
        };

        // Adicionar a promessa de envio ao array
        requests.push(
            axios.post(`${PORTEIRO_URL}/v1/zenvia/webhook`, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000
            }).then(res => ({ status: 'ok', phone }))
              .catch(err => ({ status: 'error', phone, error: err.response ? err.response.data : err.message }))
        );
    }

    console.log('🔥 DISPARANDO RAJADA...');
    const start = Date.now();
    const results = await Promise.all(requests);
    const end = Date.now();

    const success = results.filter(r => r.status === 'ok').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log('\n--- 📊 RESULTADOS DO ESTRESSE ---');
    console.log(`⏱️ Tempo de Rajada: ${end - start}ms`);
    console.log(`✅ Sucessos: ${success}`);
    console.log(`❌ Falhas: ${errors}`);
    console.log(`🚀 Vazão Mensurada: ${Math.round(NUM_REQUESTS / ((end - start) / 1000))} req/seg`);

    if (errors > 0) {
        console.log('⚠️ Detalhes dos primeiros erros:', results.filter(r => r.status === 'error').slice(0, 3));
    }

    console.log('\n⌛ Aguardando 5 segundos para persistência no Supabase...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verificação na Inbound Queue
    const { count, error: countError } = await supabase
        .from('inbound_queue')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', agent.tenant_id)
        .gte('created_at', new Date(start).toISOString());

    if (countError) {
        console.error('❌ Erro ao verificar fila:', countError.message);
    } else {
        console.log(`📝 Mensagens Gravadas na Fila: ${count || 0} / ${NUM_REQUESTS}`);
        if (count === NUM_REQUESTS) {
            console.log('🌟 PERFORMANCE PERFEITA: 100% de aproveitamento.');
        } else {
            console.warn(`📉 PERDA DETECTADA: ${NUM_REQUESTS - (count || 0)} mensagens não chegaram ao banco.`);
        }
    }
    console.log('--------------------------------\n');
}

runStressTest().catch(console.error);
