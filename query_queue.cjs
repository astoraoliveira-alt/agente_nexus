const fs = require('fs');
const https = require('https');
const path = require('path');

const envPath = path.join(__dirname, 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const options = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/inbound_queue?select=id,status,message_type,created_at&limit=5&order=created_at.desc',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        try {
            console.log(JSON.stringify(JSON.parse(body), null, 2));
        } catch (e) {
            console.log(body);
        }
    });
});
req.end();
