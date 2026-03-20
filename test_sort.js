import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);

const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data, error } = await supabase
    .from('messages')
    .select('id, created_at, external_order, content')
    .eq('conversation_id', '99f6bd99-bbe3-413f-bdb9-8e391575ba51')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (data) {
     data.forEach(m => console.log(`created_at: ${m.created_at} | order: ${m.external_order} | content: ${m.content ? m.content.slice(0, 20) : ''}`));
  }
}

run();
