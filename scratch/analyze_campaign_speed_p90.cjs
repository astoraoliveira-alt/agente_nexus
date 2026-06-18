const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const campaigns = [
  { id: 'bf607c72-4e7e-4222-a208-feb888ae3615', label: 'Hoje (Em andamento)' },
  { id: '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b', label: 'Comparação 1' },
  { id: 'f53b58a5-5b5b-42eb-a8f8-1b5204cab98d', label: 'Comparação 2' }
];

async function analyze() {
  for (const camp of campaigns) {
    console.log(`\nAnalyzing Campaign: ${camp.label} (${camp.id})`);
    
    // Get sent/delivered items to calculate speed
    const { data: records, error: fetchErr } = await supabase
      .from('outbound_queue')
      .select('sent_at')
      .eq('campaign_id', camp.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true });

    if (fetchErr) {
      console.error(fetchErr);
      continue;
    }
    
    if (!records || records.length === 0) {
      console.log(`No sent records found.`);
      continue;
    }
    
    const sentCount = records.length;
    const firstSent = new Date(records[0].sent_at);
    const lastSent = new Date(records[records.length - 1].sent_at);
    
    // 90th percentile to avoid outliers (like a retry sent a day later)
    const index90 = Math.floor(sentCount * 0.90);
    const lastSent90 = new Date(records[index90].sent_at);

    const diffMs = lastSent.getTime() - firstSent.getTime();
    const diffMin = diffMs / (1000 * 60);
    
    const diffMs90 = lastSent90.getTime() - firstSent.getTime();
    const diffMin90 = diffMs90 / (1000 * 60);

    const msgsPerMin = diffMin > 0 ? (sentCount / diffMin).toFixed(2) : sentCount;
    const msgsPerMin90 = diffMin90 > 0 ? ((sentCount * 0.90) / diffMin90).toFixed(2) : (sentCount * 0.90);
    
    console.log(`- Primeiro Envio: ${firstSent.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`- Último Envio: ${lastSent.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`- Tempo para 100%: ${diffMin.toFixed(2)} minutos`);
    console.log(`- Tempo para 90% dos envios: ${diffMin90.toFixed(2)} minutos`);
    console.log(`- Taxa de Envio real (p90): ${msgsPerMin90} msgs/min`);
  }
}

analyze();
