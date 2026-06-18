const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const campaignId = 'bf607c72-4e7e-4222-a208-feb888ae3615';

async function monitor() {
  for (let i = 0; i < 4; i++) {
    const { data } = await supabase
      .from('outbound_queue')
      .select('status')
      .eq('campaign_id', campaignId);
      
    if (data) {
      const counts = data.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {});
      console.log(`[${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] Status:`, counts);
    }
    
    if (i < 3) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

monitor();
