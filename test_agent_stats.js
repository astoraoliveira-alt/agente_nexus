import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);

const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: users } = await supabase.from('users').select('tenant_id').limit(1);
  const tenantId = users[0].tenant_id;
  console.log("Tenant:", tenantId);

  const { data, error } = await supabase.rpc('get_agent_usage_stats', { p_tenant_id: tenantId });
  console.log("Usage Stats:", data, error);

  const { data: metrics, error: err2 } = await supabase.from('consumption_metrics').select('*').limit(20).order('recorded_at', { ascending: false });
  if (err2) console.log("err2", err2);
  console.log("Recent metrics:", metrics ? metrics.map(m => ({
    agent_id: m.agent_id,
    type: m.metric_type,
    val: m.value,
    metadata: m.metadata
  })) : []);

  const { data: logs, error: err3 } = await supabase.from('integration_logs').select('*').limit(20).order('recorded_at', { ascending: false });
  if (err3) console.log("err3", err3);
  console.log("Integration logs:", logs ? logs.map(l => ({
    type: l.event_type, status: l.status, details: l.details
  })) : []);
}

run();
