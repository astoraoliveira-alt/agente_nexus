
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkQueue() {
  console.log('--- DIAGNÓSTICO DE FILA V7 ---')
  
  const { data: allItems, error: errAll } = await supabase
    .from('inbound_queue')
    .select('id, status, tenant_id, created_at')
    .in('status', ['pending', 'processing', 'failed'])
    .order('created_at', { ascending: false })

  if (errAll) {
    console.error('Erro ao buscar itens:', errAll)
    return
  }

  console.log(`Total de itens ativos encontrados: ${allItems?.length || 0}`)
  
  const summary = allItems?.reduce((acc: any, item: any) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {})

  console.log('Resumo por Status:', summary)
  
  if (allItems && allItems.length > 0) {
    console.log('\nÚltimos 10 itens na fila:')
    allItems.slice(0, 10).forEach(item => {
      console.log(`- ID: ${item.id} | Status: ${item.status} | Tenant: ${item.tenant_id} | Criado em: ${item.created_at}`)
    })
  }

  // Check the RPC itself
  try {
    const { data: rpcResult, error: errRpc } = await supabase.rpc('fn_get_queue_health_stats', { p_tenant_id: null })
    console.log('\nResultado do RPC (Global):', rpcResult || errRpc)
  } catch (e) {
    console.log('\nErro ao chamar RPC (Pode não existir):', e)
  }
}

checkQueue()
