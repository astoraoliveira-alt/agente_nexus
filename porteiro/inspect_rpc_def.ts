import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectRpc() {
    const { data, error } = await supabase.from('agents').select('name, brain_config');
    if (error) {
        console.error('Error fetching agents:', error.message);
    } else {
        const matches = data.filter(d => JSON.stringify(d).toLowerCase().includes('divergente'));
        console.log('Matched agents in JS:', matches.map(m => m.name));
    }
}
inspectRpc();
