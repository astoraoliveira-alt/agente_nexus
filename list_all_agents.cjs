const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('porteiro/.env', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('SUPABASE_URL=')) url = t.split('=')[1].replace(/['"]+/g, '');
  if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = t.split('=')[1].replace(/['"]+/g, '');
});

const restUrl = `${url}/rest/v1/agents?select=id,name,zenvia_channel_id,status`;

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
    console.log('ALL AGENTS CONFIG:', b);
  });
});
req.on('error', console.error);
req.end();
