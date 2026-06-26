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

const configPath = path.join(__dirname, 'sofia_full_config.json');
const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const getOptions = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/agents?id=eq.0e5a2927-1617-48a7-9e54-0834ddbbc924',
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
};

const req = https.request(getOptions, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const agent = JSON.parse(body)[0];
        if (!agent) { console.error('Agente não encontrado.'); process.exit(1); }
        
        const updateData = JSON.stringify({ 
            brain_config: newConfig.brain_config,
            workflow_blueprint: newConfig.workflow_blueprint
        });
        
        const patchOptions = {
            hostname: url.replace('https://', ''),
            path: '/rest/v1/agents?id=eq.' + agent.id,
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        };

        const patchReq = https.request(patchOptions, (res2) => {
            console.log('✅ Sofia configurada com o fluxo assíncrono! Status:', res2.statusCode);
        });
        patchReq.write(updateData);
        patchReq.end();
    });
});
req.end();
