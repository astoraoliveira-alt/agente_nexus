const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseUrl = viteUrlMatch[1].trim();

const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function run() {
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, tenant_id').ilike('name', '%Disparo 02.06%');
  console.log(campaigns);
  
  if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
          const { data: directCounts, error } = await supabase.from('outbound_queue').select('id, reengagement_attempt').eq('campaign_id', campaign.id);
          if (error) {
            console.error('Error fetching direct counts:', error);
          } else if (directCounts) {
              const zero = directCounts.filter(d => !d.reengagement_attempt || d.reengagement_attempt === 0).length;
              const one = directCounts.filter(d => d.reengagement_attempt === 1).length;
              const two = directCounts.filter(d => d.reengagement_attempt === 2).length;
              console.log(`Direct counts in outbound_queue for ${campaign.id}: 0=${zero}, 1=${one}, 2=${two}`);
          }
          
          const { data: qData, error: qError } = await supabase.rpc('get_detailed_consumption', {
              p_tenant_id: campaign.tenant_id,
              p_days: 30
          });
          if (qError) {
              console.error('Error fetching consumption:', qError);
          } else {
              const campaignRows = qData ? qData.filter(r => r.campaign_id === campaign.id && r.metric_type === 'messages') : [];
              console.log(`Consumption logs (get_detailed_consumption) for ${campaign.id}:`);
              console.table(campaignRows.map(r => ({ recorded_at: r.recorded_at, value: r.value, reeng: r.reengagement_attempt })));
          }
      }
  }
}
run();
