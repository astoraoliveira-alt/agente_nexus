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

const reqOptions = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/agents?id=eq.0e5a2927-1617-48a7-9e54-0834ddbbc924&select=workflow_blueprint',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
};

const req = https.request(reqOptions, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log(JSON.stringify(JSON.parse(body), null, 2)));
});
req.end();
