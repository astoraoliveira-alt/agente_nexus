
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function testFetch() {
  // 1. Unassign a stuck message for Marcelo
  await supabase
    .from('inbound_queue')
    .update({ status: 'pending', n8n_execution_id: null })
    .eq('id', '263f5a6f-d47c-402e-8fda-3c2c01b4224d'); // Marcelo: "Posso enviar áudio?"
  
  console.log("Unassigned Marcelo's message.");

  // 2. Try to fetch it using the RPC
  const { data, error } = await supabase.rpc('fn_fetch_next_inbound_message', {
    p_instance_name: 'n8n-edenred'
  });

  if (error) {
    console.error('RPC Error:', error);
    return;
  }

  console.log('=== RPC FETCH RESULT ===');
  console.log(JSON.stringify(data, null, 2));
}

testFetch();
