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
    path: '/rest/v1/outbound_queue?select=contact_name,contact_phone,status&campaign_id=eq.1afa8530-29e8-4fbb-a3df-24d7d67c45df&status=eq.sent&limit=5',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        try {
            console.log(JSON.parse(body));
        } catch (e) {
            console.log(body);
        }
    });
});
req.end();
