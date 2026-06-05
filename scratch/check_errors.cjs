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

const options = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/outbound_queue?select=error_message&campaign_id=eq.1afa8530-29e8-4fbb-a3df-24d7d67c45df&status=in.(failed,not_delivered)&limit=1000',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        try {
            const data = JSON.parse(body);
            const errors = {};
            data.forEach(r => {
                const msg = r.error_message || 'Sem mensagem de erro / Timeout Silencioso';
                errors[msg] = (errors[msg] || 0) + 1;
            });
            console.log(JSON.stringify(errors, null, 2));
        } catch (e) {
            console.log("Error parsing JSON:", body);
        }
    });
});
req.end();
