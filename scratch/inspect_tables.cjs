const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
    // 1. Get tenants/companies
    const { data: companies, error: compError } = await supabase
        .from('companies')
        .select('id, name');
    console.log('Companies:', companies);

    // 2. Describe tables columns to verify they exist
    for (const table of ['agents', 'campaigns', 'conversations', 'messages', 'contacts']) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);
        if (error) {
            console.log(`Table ${table} error:`, error.message);
        } else {
            console.log(`Table ${table} exists, keys:`, data[0] ? Object.keys(data[0]) : 'empty');
        }
    }
}

run();
