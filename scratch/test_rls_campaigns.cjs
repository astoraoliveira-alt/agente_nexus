const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';

const supabase = createClient(viteUrlMatch[1].trim(), anonKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai

async function run() {
  console.log('Testing SELECT campaigns using ANON key (RLS check)...');
  const { data: campaigns, error: errCamp } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('id', campaignId);

  if (errCamp) {
    console.error('Campaigns Error:', errCamp);
  } else {
    console.log('Campaigns read success, rows:', campaigns.length);
  }

  console.log('Testing SELECT outbound_queue using ANON key...');
  const { data: queue, error: errQueue } = await supabase
    .from('outbound_queue')
    .select('id')
    .eq('campaign_id', campaignId)
    .limit(1);

  if (errQueue) {
    console.error('Queue Error:', errQueue);
  } else {
    console.log('Queue read success, rows:', queue.length);
  }
}

run();
