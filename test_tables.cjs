const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) url = t.split('=')[1];
  if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) key = t.split('=')[1];
});

https.get(`${url}/rest/v1/conversations?status=eq.closed&select=id,status,last_message_at&limit=5`, {
  headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Conversations:', body));
});

https.get(`${url}/rest/v1/rpc/get_pending_audits?limit_count=50&grace_period_minutes=5`, {
  headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Pending:', body));
});
