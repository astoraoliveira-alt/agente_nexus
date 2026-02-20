import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: 'carlos@davos.ai',
        password: process.env.VITE_DEMO_PASSWORD!
    });
    console.log("SignIn Error:", signInError);

    if (!signInError) {
        const { data, error } = await supabase.from('campaigns').select('*').limit(5);
        console.log("Query Campaigns Error:", error);
        console.log("Returned Campaigns:", data ? data.length : 0);
    }
}
check();
