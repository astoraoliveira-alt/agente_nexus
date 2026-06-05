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

const reqOptions1 = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/conversations?contact_phone=eq.5511993434870&select=id&order=created_at.desc&limit=1',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
};

https.request(reqOptions1, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const convs = JSON.parse(body);
        if (convs.length > 0) {
            const reqOptions2 = {
                hostname: url.replace('https://', ''),
                path: `/rest/v1/messages?conversation_id=eq.${convs[0].id}&select=content,sender_type,created_at&order=created_at.desc&limit=10`,
                method: 'GET',
                headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
            };
            https.request(reqOptions2, (res2) => {
                let body2 = '';
                res2.on('data', chunk => body2 += chunk);
                res2.on('end', () => console.log(JSON.stringify(JSON.parse(body2), null, 2)));
            }).end();
        }
    });
}).end();
