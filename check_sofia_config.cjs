
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function checkAgent() {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', '0e5a2927-1617-48a7-9e54-0834ddbbc924')
    .single();

  if (error) {
    console.error('Error fetching agent:', error);
    return;
  }

  console.log('=== SOFIA AGENT CONFIG ===');
  console.log(JSON.stringify(agent, null, 2));
}

checkAgent();
