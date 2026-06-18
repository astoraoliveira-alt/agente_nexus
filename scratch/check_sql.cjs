const fs = require('fs');
const https = require('https');
const path = require('path');

const envPath = path.join(__dirname, '../porteiro/.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const sql = `
CREATE OR REPLACE FUNCTION get_test_v_allowed() RETURNS jsonb AS $$
DECLARE
    res jsonb;
    camp_row record;
BEGIN
    SELECT 
        (NOW() AT TIME ZONE 'America/Sao_Paulo')::date as curr_date,
        (NOW() AT TIME ZONE 'America/Sao_Paulo')::time as curr_time,
        (
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date >= COALESCE(camp.start_date, '2000-01-01'::date) AND 
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date <= COALESCE(camp.end_date, (camp.start_date + INTERVAL '14 days')::date, '2099-12-31'::date) AND
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::time >= COALESCE(camp.start_time::text, '00:00:00')::time AND 
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::time <= COALESCE(camp.end_time::text, '23:59:59')::time
        ) as v_allowed_now,
        camp.start_date,
        camp.end_date,
        camp.start_time,
        camp.end_time
    INTO res
    FROM public.campaigns camp
    WHERE camp.id = '9278ec92-c36c-48b4-9c8e-0ca6f0e69e38' AND camp.status = 'active';

    RETURN res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

const postData = JSON.stringify({ query: sql });

const req = https.request({
    hostname: url.replace('https://', ''),
    path: '/rest/v1/rpc/run_sql', // Supabase doesn't have `run_sql` by default!
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
}, (res) => {
    res.on('data', d => process.stdout.write(d));
});
req.write(postData);
req.end();
