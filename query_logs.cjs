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

const req = https.request(url + '/rest/v1/agents?select=id,tenant_id,name', {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => console.log('AGENTS:', b));
});
req.on('error', console.error);
req.end();
