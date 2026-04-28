import { createClient } from '@supabase/supabase-js';

async function checkLeads() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, key);
    
    console.log("--- Campanhas Ativas ---");
    const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, name, tenant_id, total_contacts')
        .order('created_at', { ascending: false })
        .limit(10);
    
    campaigns?.forEach(c => console.log(`ID: ${c.id} | Nome: ${c.name} | Total: ${c.total_contacts}`));

    if (campaigns && campaigns.length > 0) {
        const campaignId = campaigns[0].id;
        console.log(`\n--- Verificando Fila para a Campanha: ${campaigns[0].name} (${campaignId}) ---`);
        
        const { count, error } = await supabase
            .from('outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaignId);
            
        console.log(`Quantidade na outbound_queue: ${count}`);
        
        const { data: samples } = await supabase
            .from('outbound_queue')
            .select('contact_name, contact_phone, status')
            .eq('campaign_id', campaignId)
            .limit(3);
            
        console.log("Amostra:", samples);
    }
}

checkLeads();
