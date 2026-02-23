const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) url = t.split('=')[1];
  if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) key = t.split('=')[1];
});

const sql = fs.readFileSync('fix_final_vapi_sync_v23.sql', 'utf8');

const data = JSON.stringify({ query: sql });

const req = https.request(`${url}/rest/v1/sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response:', body || 'Success (No output)'));
});
req.write(data);
req.end();
