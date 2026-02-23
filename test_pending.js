const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) url = t.split('=')[1];
  if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) key = t.split('=')[1];
});

const data = JSON.stringify({
  query: `SELECT c.id, c.status, c.last_message_at, e.id as eval_id, 
  EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id = c.id) as has_msg 
  FROM conversations c LEFT JOIN evaluations e ON c.id = e.conversation_id 
  WHERE c.status = 'closed' ORDER BY c.last_message_at DESC LIMIT 10;`
});

const options = {
  hostname: url.replace('https://', ''),
  port: 443,
  path: '/rest/v1/rpc/exec_sql_query', // Assuming postgrest doesn't allow arbitrary SQL, let's use the REST API properly. 
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
};
// I don't have exec_sql_query. Let's just query the tables.
