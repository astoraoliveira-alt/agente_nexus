const fs = require('fs');
const https = require('https');
const path = require('path');

const envPath = path.join(__dirname, '..', 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

function fetchStats() {
    const options = {
        hostname: url.replace('https://', ''),
        path: '/rest/v1/outbound_queue?select=status&campaign_id=eq.1afa8530-29e8-4fbb-a3df-24d7d67c45df&limit=2000',
        method: 'GET',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if(data.error) {
                    console.error(data);
                    return;
                }
                const counts = {};
                data.forEach(r => {
                    counts[r.status] = (counts[r.status] || 0) + 1;
                });
                console.clear();
                console.log(`[${new Date().toLocaleTimeString()}] Monitorando Fila da Campanha (1afa8530...)`);
                console.log('--------------------------------------------------');
                console.log(`Pendentes (Aguardando N8N):   ${counts['pending'] || 0}`);
                console.log(`Processando (No N8N):         ${counts['processing'] || 0}`);
                console.log(`Enviados com Sucesso:         ${counts['sent'] || 0}`);
                console.log(`Lidos/Entregues/Convertidos:  ${(counts['read']||0) + (counts['delivered']||0) + (counts['converted']||0)}`);
                console.log(`Falhas / Timeouts:            ${counts['not_delivered'] || counts['failed'] || 0}`);
                console.log(`Deduplicados (Bug Antigo):    ${counts['deduplicated'] || 0}`);
                console.log('--------------------------------------------------');
                console.log('Pressione Ctrl+C para sair. Atualizando a cada 5 segundos...');
            } catch (e) {
                console.log(body);
            }
        });
    });
    req.end();
}

fetchStats();
setInterval(fetchStats, 5000);
