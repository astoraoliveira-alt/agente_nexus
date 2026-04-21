const fs = require('fs');
const https = require('https');
const path = require('path');

// 1. Carrega credenciais do Porteiro
const envPath = path.join(__dirname, 'porteiro', '.env');
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

// 2. Arquivo SQL a ser enviado
const sqlFile = process.argv[2];
if (!sqlFile || !fs.existsSync(sqlFile)) {
    console.error('❌ Erro: Especifique um arquivo SQL válido. Ex: node ship_sql.cjs database/script.sql');
    process.exit(1);
}

console.log(`🚀 Preparando envio de: ${sqlFile}`);
const sql = fs.readFileSync(sqlFile, 'utf8');

// 3. Dispara para o Supabase
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ SQL ${path.basename(sqlFile)} enviado com sucesso!`);
        } else {
            console.error(`❌ Erro no SQL (Status ${res.statusCode}):`, body);
        }
    });
});

req.on('error', e => console.error(`❌ Erro na requisição: ${e.message}`));
req.write(postData);
req.end();
