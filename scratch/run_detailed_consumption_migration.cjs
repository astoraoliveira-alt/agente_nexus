const fs = require('fs');
const https = require('https');
const path = require('path');

// Read .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const lines = envFile.split('\n');
let url = '';
let key = '';

for (const line of lines) {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) {
    url = t.split('=')[1].trim().replace(/['"]/g, '');
  }
  if (t.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=') || t.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    // Prefer service role key if available, otherwise anon key
    const currentKey = t.split('=')[1].trim().replace(/['"]/g, '');
    if (t.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) {
      key = currentKey;
    } else if (!key) {
      key = currentKey;
    }
  }
}

if (!url || !key) {
  console.error('❌ Missing Supabase URL or Key in .env.local');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '../database/migrations/20260527_detailed_campaign_consumption.sql');
console.log(`🚀 Loading SQL from: ${sqlPath}`);
const sql = fs.readFileSync(sqlPath, 'utf8');

const postData = JSON.stringify({ query: sql });

console.log(`Sending SQL to ${url}/rest/v1/sql ...`);

const parsedUrl = new URL(url);
const req = https.request({
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
  path: '/rest/v1/sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Response:', body || 'Success (No output)');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ SQL executed successfully!');
    } else {
      console.error('❌ SQL execution failed!');
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e);
});

req.write(postData);
req.end();
