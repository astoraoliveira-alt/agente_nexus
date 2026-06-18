import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('campaigns').select('id, name').in('id', ['ebac8bae-0921-4ed2-beac-3621033520b6', 'a3a9ec7e-af4d-40a2-ba22-a2d1e189981d']);
  console.log("Campaigns:", data);
}
test();
