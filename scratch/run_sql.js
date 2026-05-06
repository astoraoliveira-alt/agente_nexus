import fs from 'fs';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

async function runSql(filePath) {
    const sql = fs.readFileSync(filePath, 'utf8');
    
    console.log(`🚀 Tentando aplicar SQL via RPC 'exec_sql'...`);
    
    const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRole,
            'Authorization': `Bearer ${serviceRole}`
        },
        body: JSON.stringify({ sql_string: sql })
    });

    const body = await response.text();
    
    if (response.ok) {
        console.log("✅ SQL executado com sucesso!");
    } else {
        console.error(`❌ Falha no 'exec_sql' (${response.status}):`, body);
        
        console.log("Tentando 'fn_execute_sql' com 'sql_query'...");
        const response2 = await fetch(`${url}/rest/v1/rpc/fn_execute_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceRole,
                'Authorization': `Bearer ${serviceRole}`
            },
            body: JSON.stringify({ sql_query: sql })
        });
        const body2 = await response2.text();
        if (response2.ok) {
            console.log("✅ SQL executado com sucesso via fn_execute_sql!");
        } else {
            console.error(`❌ Falha total (${response2.status}):`, body2);
        }
    }
}

const sqlPath = process.argv[2];
if (sqlPath) {
    runSql(sqlPath);
} else {
    console.error("Uso: node scratch/run_sql.js <arquivo.sql>");
}
