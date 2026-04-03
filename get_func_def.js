import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv(filePath) {
    const content = readFileSync(filePath, 'utf8');
    content.split('\n').map(line => line.trim()).forEach(line => {
        if (!line || line.startsWith('#')) return;
        const [key, ...value] = line.split('=');
        process.env[key.trim()] = value.join('=').trim();
    });
}

loadEnv(path.join(__dirname, 'porteiro/.env'));

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getFuncDef() {
  try {
    const { data, error } = await supabase.rpc('fn_get_function_definition', { p_name: 'fn_log_dlq_error' });
    if (error) {
        // If helper function doesn't exist, try a generic SQL if possible
        console.error('❌ RPC Error (fn_get_function_definition):', error.message);
    } else {
        console.log('✅ Definition:', data);
    }
  } catch (e) {
    console.error('💥 Error:', e.message);
  } finally {
    process.exit(0);
  }
}

getFuncDef();
