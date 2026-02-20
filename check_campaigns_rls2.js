import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'carlos@davos.ai',
    password: process.env.VITE_DEMO_PASSWORD
  });
  console.log("SignIn:", signInError ? signInError : "Success");
  
  if (!signInError) {
      const { data, error } = await supabase.from('campaigns').select('*').limit(5);
      console.log("Authenticated Query Result:", { length: data ? data.length : 0, error });
  }
}
check();
