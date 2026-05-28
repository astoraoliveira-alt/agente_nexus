const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, user_name, user_identifier')
    .ilike('user_name', '%BOLANHUS%');

  console.log('Conversations matching BOLANHUS:', convs);
  
  if (convs && convs.length > 0) {
    const phone = convs[0].user_identifier;
    console.log(`Checking outbound_queue for phone matches: '${phone}' or '${phone.replace(/\D/g, '')}'`);
    
    const { data: oqMatches } = await supabase
      .from('outbound_queue')
      .select('id, contact_phone, response_detected')
      .eq('contact_phone', phone);
      
    console.log(`Matches by exact JID:`, oqMatches);

    const cleanPhone = phone.replace(/\D/g, '');
    const { data: oqMatchesClean } = await supabase
      .from('outbound_queue')
      .select('id, contact_phone, response_detected')
      .eq('contact_phone', cleanPhone);
      
    console.log(`Matches by clean phone number:`, oqMatchesClean);
  }
}

run();
