const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) url = t.split('=')[1];
  if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) key = t.split('=')[1];
});

console.log("To properly test this, we should:");
console.log("1. Insert a dummy record in outbound_queue");
console.log("2. Use its ID as metadata->leadId in N8N via Webhook");
console.log("3. OR just run a manual RPC call with the payload");
