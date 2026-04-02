import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log("=== Agentes procurando por: n8n-edenred ===")
  const { data: agents, error: err1 } = await supabase.from('agents').select('id, name, evolution_instance, tenant_id').eq('evolution_instance', 'n8n-edenred')
  if (err1) console.error(err1)
  console.log(agents)

  console.log("\n=== Historico das 3 ultimas Inbound_queue (qualquer status) ===")
  const { data: q, error: err2 } = await supabase.from('inbound_queue').select('id, status, created_at, payload').order('created_at', { ascending: false }).limit(3)
  if (err2) console.error(err2)
  console.log(q)
}

check()
