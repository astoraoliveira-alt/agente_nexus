import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função simples para carregar .env sem o pacote dotenv
function loadEnv(filePath) {
    const content = readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            process.env[key] = value;
        }
    });
}

loadEnv(path.join(__dirname, 'porteiro/.env'));

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testLead() {
  try {
    const phone = '11993434870';
    const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

    console.log(`🔍 Buscando lead: ${phone}`);

    const { data, error } = await supabase
      .from('agent_leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`whatsapp.eq.${phone},identifier.eq.${phone}`);

    if (error) {
       console.error('❌ Erro:', error.message);
    } else if (data && data.length > 0) {
       console.log('✅ ENCONTRADO:', data[0].name);
    } else {
       console.log('❌ NÃO encontrado.');
       const { count } = await supabase.from('agent_leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
       console.log('📊 Total de leads nesse Tenant:', count);
    }
  } catch (e) {
    console.error('💥 Erro:', e.message);
  } finally {
    process.exit(0);
  }
}

testLead();
