import { createClient } from '@supabase/supabase-js'

async function checkSchema() {
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
        process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('--- INSPECTING: messages ---')
    try {
        const { data: row, error } = await supabase.from('messages').select('*').limit(1).single()
        if (error) {
            console.error('Error:', error.message)
        } else {
            console.log('Columns found:', Object.keys(row))
            console.log('Sample data:', JSON.stringify(row, null, 2))
        }
    } catch (e) {
        console.error('Exception:', e.message)
    }
}

checkSchema()
