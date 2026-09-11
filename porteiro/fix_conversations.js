const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching conversations to close...');
  
  // Cutoff = 24 hours ago
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let totalClosed = 0;
  let hasMore = true;

  while (hasMore) {
    // Busca 1000 por vez
    const { data: convs, error: fetchErr } = await supabase
      .from('conversations')
      .select('id')
      .in('status', ['ai_active', 'human_active'])
      .or(`last_message_at.lt.${cutoff},last_message_at.is.null`)
      .limit(1000);

    if (fetchErr) {
      console.error('Fetch error:', fetchErr);
      break;
    }

    if (!convs || convs.length === 0) {
      console.log('No more conversations to close.');
      hasMore = false;
      break;
    }

    console.log(`Found ${convs.length} conversations. Updating...`);
    const ids = convs.map(c => c.id);

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateErr) {
      console.error('Update error:', updateErr);
      break;
    }

    totalClosed += ids.length;
    console.log(`Successfully closed ${totalClosed} conversations so far...`);
  }
  
  console.log(`Done! Total closed: ${totalClosed}`);
}

run();
