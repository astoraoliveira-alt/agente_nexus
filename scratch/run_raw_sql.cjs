const fs = require('fs');
const https = require('https');
const path = require('path');

const envPath = path.join(__dirname, '..', 'porteiro', '.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ Erro: Arquivo porteiro/.env não encontrado.');
    process.exit(1);
}

const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';

envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k === 'SUPABASE_URL') url = v.trim();
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

if (!url || !key) {
    console.error('❌ Erro: SUPABASE_URL ou SERVICE_ROLE_KEY não encontrados no .env');
    process.exit(1);
}

const sql = process.argv[2] || 'SELECT NOW() as db_now, CURRENT_DATE as db_date, (CURRENT_TIME AT TIME ZONE \'America/Sao_Paulo\')::time as sp_time;';
console.log(`🚀 Executing SQL: ${sql}`);

const postData = JSON.stringify({ query: sql });
const options = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/sql',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Body: ${body}`);
    });
});

req.on('error', e => console.error(`❌ Erro na requisição: ${e.message}`));
req.write(postData);
req.end();
