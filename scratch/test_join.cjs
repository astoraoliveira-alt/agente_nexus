const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: convs } = await supabase.from('conversations').select('id, user_identifier');
  const { data: leads } = await supabase.from('agent_leads').select('whatsapp');

  let exactMatches = 0;
  let prefixMatches = 0;

  for (const c of convs || []) {
    for (const al of leads || []) {
      if (c.user_identifier === al.whatsapp) {
        exactMatches++;
      } else {
        const cleanC = c.user_identifier.replace(/^55/, '');
        const cleanAL = al.whatsapp.replace(/^55/, '');
        if (cleanC === cleanAL) {
          prefixMatches++;
        }
      }
    }
  }

  console.log(`Exact matches: ${exactMatches}`);
  console.log(`Prefix matches (without 55 equal but with 55 not equal): ${prefixMatches}`);
}

run();
