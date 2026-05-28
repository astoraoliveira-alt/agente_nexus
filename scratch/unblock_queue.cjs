const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
  console.log(`Searching for inbound_queue items older than ${tenMinutesAgo} that are not done/failed...`);

  const { data: stuckItems, error: errFetch } = await supabase
    .from('inbound_queue')
    .select('id, status, created_at, trace_id, payload')
    .not('status', 'in', '("done","failed")')
    .lt('created_at', tenMinutesAgo);

  if (errFetch) {
    console.error('Error fetching stuck items:', errFetch);
    return;
  }

  console.log(`Found ${stuckItems.length} stuck items:`, stuckItems.map(i => ({ id: i.id, created_at: i.created_at, status: i.status, trace_id: i.trace_id })));

  if (stuckItems.length > 0) {
    const ids = stuckItems.map(i => i.id);
    console.log(`Updating stuck items to 'failed' to unblock the queue...`);
    const { data: updated, error: errUpdate } = await supabase
      .from('inbound_queue')
      .update({ status: 'failed', error_message: 'Stuck item failed to unblock queue' })
      .in('id', ids)
      .select();

    if (errUpdate) {
      console.error('Error updating items:', errUpdate);
    } else {
      console.log(`Successfully updated ${updated.length} items to failed.`);
    }
  } else {
    console.log('No stuck items found.');
  }
}

run();
