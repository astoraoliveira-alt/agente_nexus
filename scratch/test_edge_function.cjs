const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const anonKeyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabaseUrl = viteUrlMatch[1].trim();
const supabaseAnonKey = anonKeyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Logging in user carlos@davos.ai...');
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'carlos@davos.ai',
        password: '123456'
    });

    if (loginError || !session) {
        console.error('❌ Login Error:', loginError?.message);
        return;
    }

    console.log('✅ Login success! JWT token obtained.');
    const token = session.access_token;
    const tenantId = session.user.user_metadata.tenant_id || 'ad7ca404-ee2e-468e-9eb9-40d69d7c8122'; // Davos tenant ID

    // Fetch schema_view_config ID
    console.log('Fetching schema_view_config for tenant:', tenantId);
    const { data: viewConfigs, error: viewError } = await supabase
        .from('schema_view_config')
        .select('id, allowed_tables')
        .limit(1);

    if (viewError || !viewConfigs || viewConfigs.length === 0) {
        console.error('❌ View Config Error:', viewError?.message || 'No view configs found');
        return;
    }

    const viewId = viewConfigs[0].id;
    console.log('✅ Found view ID:', viewId);

    // Call Deno Edge Function schema-query
    console.log('Invoking Deno Edge Function with text query...');
    const response = await fetch(`${supabaseUrl}/functions/v1/schema-query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            question: "Qual agente gerou mais conversões?",
            viewId: viewId,
            tenantId: tenantId
        })
    });

    const bodyText = await response.text();
    console.log('Status Code:', response.status);
    console.log('Response Body:', bodyText);

    // Now test builder query
    console.log('\nInvoking Deno Edge Function with builder query (join query)...');
    const builderResponse = await fetch(`${supabaseUrl}/functions/v1/schema-query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            build: {
                fields: [
                    { table: "campaigns", column: "name", type: "varchar" },
                    { table: "agents", column: "name", type: "varchar" }
                ],
                aggregation: "list"
            },
            viewId: viewId,
            tenantId: tenantId
        })
    });

    const builderBodyText = await builderResponse.text();
    console.log('Builder Status Code:', builderResponse.status);
    console.log('Builder Response Body:', builderBodyText);
}

run();
