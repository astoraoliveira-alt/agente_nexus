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
        console.log("Fetching campaigns like 'teste novo'...");
        const campaigns = await doReq("/rest/v1/campaigns?name=ilike.*teste%20novo*&select=*");
        console.log("Campaigns Found:", campaigns.length);
        if (campaigns.length === 0) return;
        
        const c = campaigns[0];
        console.log("Campaign details:");
        console.log("ID:", c.id);
        console.log("Tenant:", c.tenant_id);
        console.log("Agent:", c.agent_id);
        console.log("Status:", c.status);
        console.log("Reengagement Enabled:", c.reengagement_enabled);
        console.log("Success Criteria:", c.success_criteria);

        console.log("\nFetching outbound_queue for phone '5511993434870' and campaign 'teste novo'...");
        const queue = await doReq(`/rest/v1/outbound_queue?contact_phone=eq.5511993434870&campaign_id=eq.${c.id}&select=*`);
        console.log("Queue Rows Found:", queue.length);
        
        if (queue.length > 0) {
            const q = queue[0];
            console.log("Queue ID:", q.id);
            console.log("Status:", q.status);
            console.log("Tenant Match?:", q.tenant_id === c.tenant_id);
            console.log("Campaign Match?:", q.campaign_id === c.id);
            console.log("Scheduled At:", q.scheduled_at);
            console.log("Metadata:", JSON.stringify(q.metadata));
            console.log("Sent At:", q.sent_at);
            console.log("Last Attempt At:", q.last_attempt_at);
        }

    } catch (e) {
        console.error(e);
    }
}

run();
