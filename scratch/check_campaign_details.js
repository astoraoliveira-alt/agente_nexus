import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, start_date, end_date, start_time, end_time, daily_limit, total_contacts, sent_count, failed_count, reengagement_enabled, updated_at')
    .order('updated_at', { ascending: false });

  console.log('--- CAMPANHAS NO BANCO ---');
  console.table(campaigns);

  // Verificar se há itens com status 'pending' ou qualquer outro status em outbound_queue
  const { data: statuses } = await supabase
    .from('outbound_queue')
    .select('status');
  
  const statusCounts = {};
  statuses?.forEach(s => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });
  console.log('\n--- STATUS EM OUTBOUND_QUEUE ---');
  console.table(statusCounts);

  // Verificar se existe outra tabela de filas, leads ou agendamentos
  const { data: otherTables } = await supabase.rpc('get_campaign_dashboard_stats', {}).catch(() => ({ data: null }));
  console.log('RPC Dashboard Stats:', otherTables);
}

check();
