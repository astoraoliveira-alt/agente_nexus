const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentMessages() {
  console.log('🔍 Verificando mensagens recentes e seus IDs externos...');
  
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, sender_type, created_at, external_id, trace_id, remote_id')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  data.forEach(m => {
    console.log(`[${m.created_at}] ${m.sender_type}: ${m.content.substring(0, 30)}... | ExtID: ${m.external_id} | Trace: ${m.trace_id}`);
  });
}

checkRecentMessages();
