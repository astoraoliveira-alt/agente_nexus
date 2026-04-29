import { createClient } from '@supabase/supabase-admin'

async function checkSchema() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('--- TABLE: messages ---')
    const { data, error } = await supabase.rpc('inspect_table', { table_name: 'messages' })
    
    if (error) {
        // Se o RPC não existe, tentamos uma query direta (se permitido) ou olhamos uma linha
        const { data: row, error: rowError } = await supabase.from('messages').select('*').limit(1).single()
        if (rowError) {
            console.error('Error fetching row:', rowError)
        } else {
            console.log('Columns found in a row:', Object.keys(row))
            console.log('Values:', row)
        }
    } else {
        console.log(data)
    }
}

checkSchema()
