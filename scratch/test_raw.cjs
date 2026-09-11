const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const supabase = createClient(url, key);

async function testQueryRaw() {
  const { data, error } = await supabase.rpc('test_query_raw');
  console.log('test_query_raw:', data || error);
}

testQueryRaw();
