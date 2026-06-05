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

const reqOptions = (path) => ({
    hostname: url.replace('https://', ''),
    path,
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
});

function doReq(path) {
    return new Promise((resolve, reject) => {
        const req = https.request(reqOptions(path), (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    try {
        console.log("Fetching ALL outbound_queue rows for phone '5511993434870'...");
        const allQueue = await doReq(`/rest/v1/outbound_queue?contact_phone=eq.5511993434870&select=id,campaign_id,status,sent_at,last_attempt_at,created_at&order=created_at.desc`);
        console.log("All Queue Rows:");
        console.table(allQueue);

    } catch (e) {
        console.error(e);
    }
}

run();
