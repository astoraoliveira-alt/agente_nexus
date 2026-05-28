import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('porteiro/.env', 'utf8');
const lines = envFile.split('\n');
const env = {};
for (const line of lines) {
  if (line && line.includes('=')) {
    const [key, ...rest] = line.split('=');
    env[key] = rest.join('=');
  }
}

const supabaseUrl = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];
const supabaseAdmin = createClient(supabaseUrl.trim(), supabaseKey.trim());

function decodeJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = parts[1];
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (e) {
        return null;
    }
}

async function testReplacement() {
    const contactPhone = '5511993434870';
    
    // Uma mensagem com link alucinado fictício (com "LEN* & CI LTDA" simulado)
    let message = `Perfeito! É só clicar no link abaixo:
https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora?t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbnBqIjoiOTg1ODkwOTYwMDA1MDEiLCJjbnBqX3Nhbml0YXplIjoiOTg1ODkwOTYwMDA1MDEiLCJlbWFpbCI6IlNVUEVSTEVOWkBURVJSQS5DT00uQlIiLCJub21lTG9qYSI6IkxFTiogJiBDSSBMVERBIiwicGhvbmUiOm51bGwsInJvb3RfY25waiI6Ijk4NTg5MDk2In0.qpNnQgD3o6KRnRFcCPeaNhL9rFnTmTudL2OrLX4hi4A&c=2
Boa sorte!`;

    console.log("Mensagem original:");
    console.log(message);
    
    if (message.includes('fiservcapital.moneymoneyinvest.com.br') || message.includes('fiserv.ticket.com.br') || message.includes('solicite-agora')) {
        try {
            const cleanPhone = contactPhone.replace(/\D/g, '');
            const { data: leads } = await supabaseAdmin
                .from('agent_leads')
                .select('cta_link')
                .or(`whatsapp.eq.${cleanPhone},whatsapp.eq.${cleanPhone.replace(/^55/, '')}`)
                .not('cta_link', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1);

            if (leads && leads.length > 0 && leads[0].cta_link) {
                const exactCtaLink = leads[0].cta_link;
                console.log(`\nFound exact cta_link in database: ${exactCtaLink}`);
                
                const linkRegex = /(https?:\/\/(?:fiservcapital\.moneymoneyinvest\.com\.br|fiserv\.ticket\.com\.br)[^\s]*)/gi;
                if (linkRegex.test(message)) {
                    message = message.replace(linkRegex, exactCtaLink);
                } else {
                    message = message.replace(/https?:\/\/fiser[^\s]+/gi, exactCtaLink);
                }
                
                console.log("\nMensagem após substituição:");
                console.log(message);
                
                // Decodifica a nova URL para garantir que contém "LENZ & CIA LTDA"
                const urlObj = new URL(exactCtaLink);
                const t = urlObj.searchParams.get('t');
                const decoded = decodeJWT(t);
                console.log("\nPayload decodificado da URL substituída:");
                console.log(JSON.stringify(decoded, null, 2));
                
                if (decoded && decoded.nomeLoja === "LENZ & CIA LTDA") {
                    console.log("\n✅ TESTE PASSOU! O link foi restaurado perfeitamente para LENZ & CIA LTDA.");
                } else {
                    console.log("\n❌ TESTE FALHOU! O link não foi restaurado corretamente.");
                }
            } else {
                console.log("Nenhum lead encontrado no banco para o telefone", contactPhone);
            }
        } catch (err) {
            console.error("Erro no teste:", err);
        }
    }
}

testReplacement();
