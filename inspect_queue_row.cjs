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
    path: '/rest/v1/inbound_queue_errors?n8n_execution_id=eq.101639',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
};

const req = https.request(reqOptions, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log("Errors found in DLQ table by execution ID:");
        console.log(body);
    });
});
req.end();
