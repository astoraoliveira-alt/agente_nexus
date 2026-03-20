import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
    const payload = {
        p_agent_id: 'a7d22ac4-2e56-4287-ab19-5b41390ee3f4',
        p_metric_type: 'tokens',
        p_value: 123,
        p_cost: 0.123,
        p_metadata: { source: 'test' }
    };
    const { data, error } = await supabase.rpc('record_usage', payload);
    console.log("record_usage result:", data, error);
}
run();
