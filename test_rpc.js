import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_objection_contacts', { p_tenant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }); // Use any tenant id or null, we just want to see if it errors
  console.log(error || data?.slice(0,2));
}
run();
