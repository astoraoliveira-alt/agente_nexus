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
    
    // Fetch all sent records
    const { data: records, error: fetchErr } = await supabase
      .from('outbound_queue')
      .select('sent_at, reengagement_attempt_count, created_at')
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
    
    const firstSent = new Date(records[0].sent_at);
    // Filter to only records sent within the first 12 hours of the campaign's first send
    // This perfectly isolates the original run from any 24h-later reengagements or next-day limits
    const initialRunRecords = records.filter(r => {
      const d = new Date(r.sent_at);
      const diffHours = (d.getTime() - firstSent.getTime()) / (1000 * 60 * 60);
      return diffHours < 12;
    });

    const sentCount = initialRunRecords.length;
    
    if (sentCount === 0) {
      console.log('No records in initial run.');
      continue;
    }

    const lastSent = new Date(initialRunRecords[sentCount - 1].sent_at);
    
    const diffMs = lastSent.getTime() - firstSent.getTime();
    const diffMin = diffMs / (1000 * 60);
    
    const msgsPerMin = diffMin > 0 ? (sentCount / diffMin).toFixed(2) : sentCount;
    
    console.log(`- Registros no Envio Original (primeiras 12h): ${sentCount}`);
    console.log(`- Primeiro Envio: ${firstSent.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`- Último Envio do Lote Inicial: ${lastSent.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`- Tempo Total do Lote Inicial: ${diffMin.toFixed(2)} minutos`);
    console.log(`- Taxa de Envio Real (Envio Original): ${msgsPerMin} msgs/min`);
  }
}

analyze();
