import { createClient } from '@supabase/supabase-js';

async function checkLogs() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, key);
    
    const campaignId = '23282431-e422-42bb-9dc8-802bb1308ff0';
    console.log(`\n--- Verificando Logs de Importação para a Campanha ID: ${campaignId} ---`);
    
    const { count, error } = await supabase
        .from('campaign_import_logs')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);
        
    console.log(`Quantidade de logs de erro: ${count}`);
    
    const { data: samples } = await supabase
        .from('campaign_import_logs')
        .select('contact_name, error_message, error_type')
        .eq('campaign_id', campaignId)
        .limit(5);
        
    console.log("Amostra de Erros:", samples);
}

checkLogs();
