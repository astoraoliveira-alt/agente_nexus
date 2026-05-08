import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://wyfmyipbvoggusclwdhj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns'
);

async function checkConversation() {
  const conversationId = 'f907c1a3-6804-4850-a19c-371a36a456bb';
  
  console.log('--- CONVERSATION STATUS ---');
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('id, status, last_message_at, assigned_operator_id')
    .eq('id', conversationId)
    .single();
  
  if (convError) console.error(convError);
  else console.log(conv);

  console.log('\n--- RECENT MESSAGES ---');
  const { data: msgs, error: msgsError } = await supabase
    .from('messages')
    .select('content, sender, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (msgsError) console.error(msgsError);
  else console.table(msgs);
}

checkConversation();
