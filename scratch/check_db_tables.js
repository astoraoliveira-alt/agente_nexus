import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    // We can query pg_catalog to get all tables in public schema
    const { data, error } = await supabase.rpc('fn_log_event', {
        p_tenant_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        p_trace_id: 'TEST',
        p_component: 'TEST',
        p_severity: 'INFO',
        p_message: 'TEST'
    }).select('*').limit(1); // Wait, this calls fn_log_event.
    
    // Let's run a query on pg_tables
    const { data: tables, error: err } = await supabase
        .from('pg_tables')
        .select('*')
        .eq('schemaname', 'public');
        
    console.log('Tables:', tables, 'Error:', err);
}

check();
