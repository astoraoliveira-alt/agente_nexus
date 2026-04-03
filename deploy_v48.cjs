const fs = require('fs');
const https = require('https');

// Use porteiro/.env which has the URL and Service Role Key
const envData = fs.readFileSync('porteiro/.env', 'utf8');
let url = '', key = '';

envData.split('\n').forEach(line => {
  const t = line.trim();
  if (t.startsWith('SUPABASE_URL=')) url = t.split('=')[1];
  if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = t.split('=')[1];
});

if (!url || !key) {
    console.error('❌ Não foi possível carregar as credenciais de porteiro/.env');
    process.exit(1);
}

const sqlFile = 'database/create_queue_supervisor_rpc.sql';
const sql = fs.readFileSync(sqlFile, 'utf8');

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
        console.log('✅ SQL executado com sucesso (V48)!');
    } else {
        console.error(`❌ Erro no SQL (Status ${res.statusCode}):`, body);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Erro na requisição: ${e.message}`);
});

req.write(postData);
req.end();
