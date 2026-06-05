const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Searching for conversation 098f0415-da15-4f1c-b617-8811cb4897d0...');
  
  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', '098f0415-da15-4f1c-b617-8811cb4897d0')
    .single();

  if (error) {
    console.error(error);
    return;
  }

  console.log('=== CONVERSATION DETAIL ===');
  Object.keys(conv).forEach(k => {
    console.log(`\n--- Key: ${k} ---`);
    console.log(typeof conv[k] === 'object' ? JSON.stringify(conv[k], null, 2) : conv[k]);
  });
}

run();
