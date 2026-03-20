import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Initialize Supabase Clients
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
    console.warn('⚠️ [PORTEIRO] SUPABASE_URL não configurada. Auth não funcionará.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Use Service Role for backend operations (Webhooks, etc.) if available
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : supabase;

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: '*', // Adjust for production
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
}));

// --- GATEKEEPER SERVICE (PORTEIRO) ---

/**
 * Auth Middleware - Validates Supabase JWT
 * Skips for public endpoints like webhooks
 */
app.use('/v1/*', async (c, next) => {
    // Bypass for evolution webhook
    if (c.req.path === '/v1/evolution/webhook') {
        return await next();
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Authorization header required' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return c.json({ error: 'Unauthorized', details: error?.message }, 401);
    }

    // Pass user to context
    c.set('user', user);
    await next();
});

// --- ROUTES ---

app.get('/', (c) => c.text('Davos Nexus PORTEIRO (v1.0.0) — Active & Guarding.'));

/**
 * Proxy to Evolution API (Secures API Key and avoids CORS)
 */
app.post('/v1/evolution/proxy', async (c) => {
    const body = await c.req.json();
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionUrl || !evolutionApiKey) {
        return c.json({ error: 'Evolution API configuration missing' }, 500);
    }

    // Proxy the request to Evolution API securely
    try {
        const fullUrl = `${evolutionUrl}${body.endpoint}`;
        console.log(`[PORTEIRO] Proxying ${body.method || 'GET'} to ${fullUrl}`);

        const response = await fetch(fullUrl, {
            method: body.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionApiKey
            },
            body: body.payload ? JSON.stringify(body.payload) : null
        });

        const data = await response.json();
        return c.json(data, response.status as any);
    } catch (err: any) {
        console.error(`[PORTEIRO] ❌ Proxy Failed:`, {
            message: err.message,
            url: `${evolutionUrl}${body.endpoint}`,
            cause: err.cause
        });
        return c.json({ error: 'Proxy failed', details: err.message, url: `${evolutionUrl}${body.endpoint}` }, 500);
    }
});

/**
 * Evolution Webhook Handler
 * Receives messages from Evolution and stores them in Supabase
 */
app.post('/v1/evolution/webhook', async (c) => {
    // 📩 Webhook Processing
    try {
        // 1. Secret Verification (Optional security layer)
        const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (webhookSecret) {
            const apiKeyHeader = c.req.header('apikey');
            if (apiKeyHeader !== webhookSecret) {
                console.warn('[PORTEIRO] 🛡️ Unauthorized Webhook Attempt');
                return c.json({ error: 'Unauthorized' }, 401);
            }
        }

        const payload = await c.req.json();
        const { event, instance, data } = payload;

        // --- 1. CONNECTION STATUS CACHE (Item 5) ---
        if (event === 'connection.update') {
            const state = data.state || data.status;
            console.log(`[PORTEIRO] 🛡️ Connection Update for ${instance}: ${state}`);
            
            // Update agent status in DB for faster UI response
            await supabaseAdmin
                .from('agents')
                .update({ 
                    status: state === 'open' ? 'active' : 'inactive',
                    // We store the raw state in metadata or a custom column if exists
                    // For now, let's use the 'status' as a proxy and log in console
                })
                .eq('evolution_instance', instance);

            return c.json({ status: 'success', event: 'connection.update' });
        }

        // --- 2. MESSAGE RECEIPT (Item 3 - Webhooks) ---
        if (event !== 'messages.upsert') {
            return c.json({ status: 'ignored', event });
        }

        // Handle messages.upsert (can be an array or single object)
        const rawMsg = Array.isArray(data) ? data[0] : data;
        
        // Skip messages sent by the agent itself
        if (!rawMsg || rawMsg.key?.fromMe) {
            return c.json({ status: 'ignored', reason: 'sent_by_agent_or_empty' });
        }

        const remoteJid = rawMsg.key?.remoteJid;
        const phone = remoteJid?.split('@')[0];
        const pushName = rawMsg.pushName || 'WhatsApp User';
        const externalId = rawMsg.key?.id;
        
        // Extract content (support simple conversation or extended text)
        const textContent = rawMsg.message?.conversation || 
                           rawMsg.message?.extendedTextMessage?.text || 
                           (rawMsg.message?.imageMessage ? '[Imagem]' : '[Arquivo]');

        if (!phone || !textContent) {
            return c.json({ status: 'ignored', reason: 'missing_phone_or_content' });
        }

        console.log(`[PORTEIRO] 📥 Msg from ${phone} (${pushName}) on instance: ${instance}`);

        // --- DATABASE OPERATIONS ---
        
        // 1. Find the agent matching this instance
        const { data: agents, error: agentError } = await supabaseAdmin
            .from('agents')
            .select('id, tenant_id')
            .eq('evolution_instance', instance)
            .limit(1);

        if (agentError || !agents?.length) {
            console.error(`[PORTEIRO] ❌ Agent not found for instance: ${instance}`, agentError);
            return c.json({ error: 'Instance not mapped to any agent' }, 404);
        }

        const agent = agents[0];

        // 2. Upsert Contact (Ensure contact exists and name is updated)
        const { data: contact, error: contactError } = await supabaseAdmin
            .from('contacts')
            .upsert({
                tenant_id: agent.tenant_id,
                identifier: phone,
                phone: phone,
                name: pushName,
                channel: 'whatsapp'
            }, { onConflict: 'tenant_id,identifier' })
            .select()
            .single();

        if (contactError) {
            console.error(`[PORTEIRO] ❌ Contact sync failed:`, contactError);
        }

        // 3. Find or Create Active Conversation
        // We look for 'ai_active' or 'human_active' status 
        const { data: conversation, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('id, status')
            .eq('tenant_id', agent.tenant_id)
            .eq('user_identifier', phone)
            .eq('agent_id', agent.id)
            .neq('status', 'closed')
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let conversationId = conversation?.id;

        if (!conversationId) {
            console.log(`[PORTEIRO] 🆕 Creating new conversation for ${phone}`);
            const { data: newConv, error: newConvError } = await supabaseAdmin
                .from('conversations')
                .insert({
                    tenant_id: agent.tenant_id,
                    agent_id: agent.id,
                    user_identifier: phone,
                    user_name: pushName,
                    channel: 'whatsapp',
                    status: 'ai_active'
                })
                .select()
                .single();
            
            if (newConvError) {
                console.error(`[PORTEIRO] ❌ Failed to create conversation:`, newConvError);
                return c.json({ error: 'Conversation creation failed' }, 500);
            }
            conversationId = newConv.id;
        }

        // 4. Record Message
        // Use external_id to avoid duplicates from webhook retries
        const { error: msgInsertError } = await supabaseAdmin
            .from('messages')
            .upsert({
                tenant_id: agent.tenant_id,
                conversation_id: conversationId,
                content: textContent,
                sender_type: 'human',
                sender_name: pushName,
                external_id: externalId,
                message_type: 'text',
                metadata: { raw: rawMsg }
            }, { onConflict: 'tenant_id,external_id' });

        if (msgInsertError) {
            console.error(`[PORTEIRO] ❌ Message save failed:`, msgInsertError);
            return c.json({ error: 'Message save failed' }, 500);
        }

        // 5. Update last_message_at (Touch conversation)
        await supabaseAdmin
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

        // 6. Real-Time Signaling (Optional: Trigger an N8N workflow or Broadcast)
        // If Supabase Realtime is enabled on 'messages' table, the front-end will already pick it up.

        return c.json({ 
            status: 'success', 
            message: 'Webhook processed',
            conversation_id: conversationId,
            external_id: externalId 
        });


    } catch (err: any) {
        console.error('[PORTEIRO] ❌ Webhook Error:', err);
        return c.json({ error: 'Internal processing error', details: err.message }, 500);
    }
});

async function startQueueWorker() {
    console.log('⏳ [WORKER] Starting Outbound Queue Processor (V2.1 - Realtime Optimized)...');
    
    const processQueue = async () => {
        try {
            const now = new Date().toISOString();
            
            const { data: queueItems, error: fetchError } = await supabaseAdmin
                .from('outbound_queue')
                .select(`
                    id, 
                    tenant_id, 
                    agent_id, 
                    conversation_id,
                    contact_phone, 
                    metadata,
                    agents (
                        name,
                        evolution_instance,
                        whatsapp_api_type,
                        meta_phone_number_id,
                        meta_api_token
                    )
                `)
                .eq('status', 'pending')
                .lte('scheduled_at', now)
                .limit(20);

            if (fetchError || !queueItems || queueItems.length === 0) {
                if (fetchError) console.error('[WORKER] ❌ Fetch Error:', fetchError);
                return;
            }

            console.log(`[WORKER] 🚀 Processing ${queueItems.length} messages...`);

            for (const item of queueItems) {
                const agent = item.agents as any;
                const apiType = agent?.whatsapp_api_type || 'evolution';
                const message = item.metadata?.content || item.metadata?.message;
                const contactPhone = item.contact_phone;

                if (!message || !contactPhone) {
                    await supabaseAdmin.from('outbound_queue').update({ status: 'failed', error_message: 'Missing message or phone' }).eq('id', item.id);
                    continue;
                }

                try {
                    await supabaseAdmin.from('outbound_queue').update({ status: 'processing' }).eq('id', item.id);
                    let result: any;
                    let responseOk = false;

                    if (apiType === 'meta') {
                        const metaId = agent?.meta_phone_number_id;
                        const metaToken = agent?.meta_api_token || process.env.META_API_TOKEN;
                        if (!metaId || !metaToken) throw new Error('Meta credentials missing');

                        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${metaId}/messages`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${metaToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                messaging_product: "whatsapp",
                                to: contactPhone,
                                type: "text",
                                text: { body: message }
                            })
                        });
                        result = await metaRes.json();
                        responseOk = metaRes.ok;
                    } else {
                        const instance = agent?.evolution_instance;
                        const evolutionUrl = process.env.EVOLUTION_API_URL;
                        const evolutionApiKey = process.env.EVOLUTION_API_KEY;

                        const evoRes = await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey || '' },
                            body: JSON.stringify({ number: contactPhone, text: message, delay: 1000 })
                        });
                        result = await evoRes.json();
                        responseOk = evoRes.ok;
                    }

                    if (responseOk) {
                        // 1. Mark as sent in queue
                        await supabaseAdmin.from('outbound_queue').update({ 
                            status: 'sent', 
                            sent_at: new Date().toISOString(),
                            metadata: { ...item.metadata, response: result }
                        }).eq('id', item.id);

                        // 2. Sync with main Chat History (messages table)
                        if (item.conversation_id) {
                            console.log(`[WORKER] 📝 Logging message to conversation ${item.conversation_id}...`);
                            await supabaseAdmin.from('messages').insert({
                                conversation_id: item.conversation_id,
                                tenant_id: item.tenant_id,
                                content: message,
                                sender_type: 'ai',
                                sender_name: agent?.name || 'Agente Virtual',
                                message_type: 'text'
                            });
                            
                            // 3. Update conversation last_message_at
                            await supabaseAdmin.from('conversations').update({
                                last_message_at: new Date().toISOString()
                            }).eq('id', item.conversation_id);
                        }

                        console.log(`[WORKER] ✅ Successfully processed ${item.id}`);
                    } else {
                        throw new Error(result?.error?.message || result?.message || 'API Error');
                    }
                } catch (err: any) {
                    await supabaseAdmin.from('outbound_queue').update({ status: 'failed', error_message: err.message }).eq('id', item.id);
                }
            }
        } catch (globalError: any) {
            console.error('[WORKER] Global Error:', globalError);
        }
    };

    // --- REALTIME SUBSCRIPTION ---
    // Listen for new inserts in outbound_queue for instant processing
    console.log('📡 [WORKER] Subscribing to Outbound Realtime...');
    supabaseAdmin
        .channel('outbound_queue_changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'outbound_queue' 
        }, (payload) => {
            console.log('⚡ [WORKER] New message detected via Realtime! Processing...');
            processQueue();
        })
        .subscribe();

    // --- SAFETY POLLING (Slow) ---
    // Run every 60 seconds as a fallback
    setInterval(processQueue, 60000); 
    
    // Initial run
    processQueue();
}

/**
 * Health-check for the gateway
 */
app.get('/health', (c) => {
    return c.json({
        status: 'online',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

const port = Number(process.env.PORT) || 3001;
console.log(`🔒 Davos Nexus Porteiro active on http://localhost:${port}`);

// Initial start delay to let Supabase settle
setTimeout(() => startQueueWorker(), 2000);

serve({
    fetch: app.fetch,
    port,
});
