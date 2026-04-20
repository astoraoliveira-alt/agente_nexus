const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) url = t.split('=')[1].replace(/['"]+/g, '');
  if (t.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) key = t.split('=')[1].replace(/['"]+/g, '');
  if (!key && t.startsWith('VITE_SUPABASE_ANON_KEY=')) key = t.split('=')[1].replace(/['"]+/g, '');
});

const restUrl = `${url}/rest/v1/integration_logs?provider=eq.zenvia&order=processed_at.desc&limit=5`;

const req = https.request(restUrl, {
  method: 'GET',
  headers: { 
    'apikey': key, 
    'Authorization': 'Bearer ' + key, 
    'Content-Type': 'application/json' 
  }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
      try {
          const logs = JSON.parse(b);
          console.log('--- ZENVIA INTEGRATION LOGS ---');
          logs.forEach(l => {
              console.log(`[${l.created_at}] Status: ${l.status} | ExtId: ${l.external_id}`);
              if (l.error_details) console.log(`  ERROR: ${l.error_details}`);
              console.log(`  Path: ${l.path}`);
              console.log('---');
          });
      } catch (e) {
          console.log('RAW RESPONSE:', b);
      }
  });
});
req.on('error', console.error);
req.end();
