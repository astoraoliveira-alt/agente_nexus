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

// --- CONFIGURAÇÕES DE FILA (V50 - Scale Guardian) ---
const DEBOUNCE_TIME_MS = 1500; // Tempo de espera para agrupar mensagens

// Ajuste 4: Limite de jobs simultâneos (anti-colapso)
const MAX_CONCURRENT_JOBS = 10;
let activeJobs = 0;

// Ajuste 5: Backoff exponencial para retries
const RETRY_BACKOFF_MS = [10_000, 30_000, 120_000]; // retry 1→10s, 2→30s, 3→2min, 4→DLQ

const pendingMessages = new Map<string, { 
    timeout: NodeJS.Timeout, 
    contents: string[], 
    agentId: string, 
    tenantId: string, 
    instanceName: string,
    phone: string,
    pushName: string,
    externalId: string,
    messageType: string,
    remoteID: string,
    platform: string,
    instanceId: string,
    serverURL: string,
    mediaUrl?: string,
    mimetype?: string,
    cleanIdentifier: string, // Normalização V50.16
    raw_evolution_payload?: any
}>();

// --- 🛡️ UNIFIED PORTEIRO LOGGING (V52 - Total Traceability) ---

/**
 * Logs every hit to integration_logs for audit and debugging.
 * Uses upsert on (provider, external_id) to update processing status.
 */
async function logIntegration(params: {
    provider: string;
    external_id?: string;
    payload: any;
    tenant_id?: string | null;
    agent_id?: string | null;
    status?: string;
    error_details?: string | null;
    validation_results?: any;
    trace_id?: string;
    latency_ms?: number;
    phone_number?: string | null;
    conversation_id?: string | null;
    path?: string | null;
}) {
    try {
        const { 
            provider, 
            external_id, 
            payload, 
            tenant_id, 
            agent_id, 
            status, 
            error_details, 
            validation_results, 
            trace_id, 
            latency_ms,
            phone_number,
            conversation_id,
            path 
        } = params;
        
        // Se não temos external_id (ex: evento de conexão), usamos o trace_id ou um gerado
        const finalExternalId = external_id || trace_id || `LOG-${Math.random().toString(36).substring(7).toUpperCase()}-${Date.now().toString().slice(-4)}`;

        // Injetamos a latência no payload para o Observatório ler
        const enhancedPayload = {
            ...(payload || {}),
            latency_ms: latency_ms || 0
        };

        const { error } = await supabaseAdmin
            .from('integration_logs')
            .upsert({
                provider,
                external_id: finalExternalId,
                payload: enhancedPayload,
                tenant_id: tenant_id || null,
                agent_id: agent_id || null,
                trace_id: trace_id || null,
                phone_number: phone_number || null,
                conversation_id: conversation_id || null,
                path: path || null,
                status: status || 'received',
                error_details: error_details || null,
                validation_results: validation_results || {},
                latency_ms: latency_ms || 0,
                processed_at: new Date().toISOString()
            }, { onConflict: 'provider,external_id' });

        if (error) {
            console.error(`[PORTEIRO] ❌ Log Sync Error:`, error.message);
        }
    } catch (e: any) {
        console.error(`[PORTEIRO] ❌ Critical Failure in logIntegration:`, e.message);
    }
}

const app = new Hono<{ Variables: { user: any } }>();

app.get('/', (c) => c.text('Porteiro Davos Elite está Ativo! 🦾🛡️🎰'));

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
    // Bypass for webhooks (Evolution, Zenvia) and queue management
    if (
        c.req.path === '/v1/evolution/webhook' ||
        c.req.path === '/v1/zenvia/webhook' ||
        c.req.path === '/v1/zenvia/status' ||
        c.req.path.startsWith('/v1/queue/')
    ) {
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
    console.log(`[WEBHOOK] 🔔 Signal received from Evolution!`);
    let webhookPayload: any = null;
    // 📩 Webhook Processing
    let initialTraceId = `EVO-GEN-${Math.random().toString(36).substring(7).toUpperCase()}`;
    const startTime = Date.now();
    try {
        webhookPayload = await c.req.json();
        const payload = webhookPayload;
        console.log(`[WEBHOOK] 📦 Payload Event: ${payload.event || 'Unknown'} for instance: ${payload.instance || 'Unknown'}`);
        // 1. Secret Verification (Optional security layer)
        const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (webhookSecret) {
            const apiKeyHeader = c.req.header('apikey');
            if (apiKeyHeader !== webhookSecret) {
                console.warn('[PORTEIRO] 🛡️ Unauthorized Webhook Attempt');
                return c.json({ error: 'Unauthorized' }, 401);
            }
        }

        const { event, instance, data } = payload;
        console.log(`[PORTEIRO] 🕵️ DEBUG: Event=${event}, Instance=${instance}`);

        // --- 0. PRE-VALIDATION LOG (V52.1) ---
        // Identificamos o Agente e Conversa o mais cedo possível para logar
        const { data: earlyAgents } = await supabaseAdmin
            .from('agents')
            .select('id, tenant_id')
            .eq('evolution_instance', instance)
            .limit(1);
        
        const earlyAgent = earlyAgents?.[0];
        initialTraceId = `EVO-${Math.random().toString(36).substring(7).toUpperCase()}`;

        // 🛡️ Tenta identificar a conversa para vincular os logs (V52.5)
        let resolvedConvId: string | null = null;
        const remoteJid = data?.key?.remoteJid || data?.remoteJid || payload?.remoteJid;
        const phone = remoteJid ? remoteJid.split('@')[0].replace(/\D/g, '') : null;
        const cleanUserIdentifier = phone;

        if (remoteJid && earlyAgent) {
            const { data: conv } = await supabaseAdmin
                .from('conversations')
                .select('id')
                .eq('tenant_id', earlyAgent.tenant_id)
                .eq('agent_id', earlyAgent.id)
                .eq('user_identifier', cleanUserIdentifier)
                .maybeSingle();
            resolvedConvId = conv?.id || null;
        }

        await logIntegration({
            provider: 'evolution',
            external_id: data?.key?.id || data?.id || initialTraceId,
            payload: payload,
            tenant_id: earlyAgent?.tenant_id,
            agent_id: earlyAgent?.id,
            trace_id: initialTraceId,
            phone_number: phone,
            conversation_id: resolvedConvId,
            path: '/v1/evolution/webhook',
            status: 'received',
            latency_ms: Date.now() - startTime,
            validation_results: { 
                event_type: event, 
                received_at: new Date().toISOString(),
                conversation_id: resolvedConvId,
                remoteJid: remoteJid
            }
        });

        // --- 1. CONNECTION STATUS CACHE (Item 5) ---
        if (event === 'connection.update') {
            const state = data.state || data.status;
            console.log(`[PORTEIRO] 🛡️ Connection Update for ${instance}: ${state}`);
            
            // Update agent status in DB for faster UI response
            await supabaseAdmin
                .from('agents')
                .update({ 
                    status: state === 'open' ? 'active' : 'inactive',
                })
                .eq('evolution_instance', instance);

            // Log de atualização final
            await logIntegration({ 
                provider: 'evolution', 
                status: 'processed', 
                trace_id: initialTraceId,
                phone_number: phone,
                path: '/v1/evolution/webhook',
                payload, 
                latency_ms: Date.now() - startTime,
                validation_results: { event_type: event, state: state } 
            });

            return c.json({ status: 'success', event: 'connection.update' });
        }

        // --- 2. UPSERT FILTER (V50.18 - Monitoring) ---
        if (event !== 'messages.upsert') {
            console.log(`[PORTEIRO] 🕵️ Ignoring Non-Upsert event type: ${event}`);
            
            // Atualiza log para registro completo mesmo sendo ignorado pela fila (V52.6)
            await logIntegration({
                provider: 'evolution',
                external_id: data?.key?.id || data?.id || initialTraceId,
                trace_id: initialTraceId,
                phone_number: phone,
                conversation_id: resolvedConvId,
                path: '/v1/evolution/webhook',
                status: 'ignored',
                payload: payload,
                tenant_id: earlyAgent?.tenant_id,
                agent_id: earlyAgent?.id,
                latency_ms: Date.now() - startTime,
                validation_results: { 
                    event_type: event, 
                    reason: `not_upsert_event_${event}`,
                    conversation_id: resolvedConvId
                }
            });

            return c.json({ status: 'ignored', reason: `not_upsert_event_${event}` });
        }

        // Handle messages.upsert (can be an array or single object)
        const rawMsg = Array.isArray(data) ? data[0] : data;
        
        console.log(`[PORTEIRO] 🕵️ MSG_DEBUG: key=${JSON.stringify(rawMsg?.key)}, fromMe=${rawMsg?.key?.fromMe}`);

        // Skip messages sent by the agent itself
        if (!rawMsg || rawMsg.key?.fromMe) {
            console.log(`[PORTEIRO] ⏭️ Skipping: ${!rawMsg ? 'Empty message' : 'Sent by agent (fromMe)'}`);
            await logIntegration({
                provider: 'evolution',
                external_id: data?.key?.id || initialTraceId,
                payload: payload,
                trace_id: initialTraceId,
                path: '/v1/evolution/webhook',
                status: 'ignored',
                latency_ms: Date.now() - startTime,
                validation_results: { reason: 'sent_by_agent_or_empty' }
            });
            return c.json({ status: 'ignored', reason: 'sent_by_agent_or_empty' });
        }

        // --- 🛡️ SMART PHONE EXTRACTION (V50.19 - JID First Policy) ---
        const remoteID = rawMsg.key?.remoteJid;
        
        // phone já extraído no início do handler no V52.7

        const serverURL = payload.server_url || '';

        // --- UNIVERSAL MESSAGE INSPECTOR ---
        let textContent = rawMsg.message?.conversation || 
                          rawMsg.message?.extendedTextMessage?.text || 
                          rawMsg.body || '';
        
        let mediaUrl = '';
        let mimetype = '';
        let detectedMessageType = 'conversation';

        // Extract media (Image/Audio/Video)
        if (rawMsg.message?.imageMessage) {
            detectedMessageType = 'imageMessage';
            textContent = rawMsg.message.imageMessage.caption || '[Imagem]';
            mediaUrl = rawMsg.message.imageMessage.url;
            mimetype = rawMsg.message.imageMessage.mimetype;
        } else if (rawMsg.message?.audioMessage) {
            detectedMessageType = 'audioMessage';
            textContent = '[Áudio]';
            mediaUrl = rawMsg.message.audioMessage.url;
            mimetype = rawMsg.message.audioMessage.mimetype;
        } else if (rawMsg.message?.videoMessage) {
            detectedMessageType = 'videoMessage';
            textContent = rawMsg.message.videoMessage.caption || '[Vídeo]';
            mediaUrl = rawMsg.message.videoMessage.url;
            mimetype = rawMsg.message.videoMessage.mimetype;
        } else if (rawMsg.message?.documentMessage) {
            detectedMessageType = 'documentMessage';
            textContent = rawMsg.message.documentMessage.title || '[Documento]';
            mediaUrl = rawMsg.message.documentMessage.url;
            mimetype = rawMsg.message.documentMessage.mimetype;
        } 

        // Agora sim, logamos e filtramos com tudo disponível
        console.log(`[PORTEIRO] 🕵️ IDENTITY_DEBUG: cleanID='${cleanUserIdentifier}', hasText=${!!textContent}, hasMedia=${!!mediaUrl}`);
        
        const pushName = rawMsg.pushName || 'WhatsApp User';
        const externalId = rawMsg.key?.id;
        
        // Technical metadata
        const platform = rawMsg.source || 'unknown';
        const instanceId = rawMsg.instanceId || instance;

        // Content Filter: Se temos um identificador limpo e conteúdo, seguimos.
        if (!cleanUserIdentifier || (!textContent && !mediaUrl)) {
            console.log(`[PORTEIRO] ⏭️ Missing Content Filter: validID=${!!cleanUserIdentifier}, hasText=${!!textContent}, hasMedia=${!!mediaUrl}`);
            await logIntegration({
                provider: 'evolution',
                external_id: externalId,
                payload: payload,
                trace_id: initialTraceId,
                status: 'ignored',
                validation_results: { reason: 'missing_id_or_content', phone, clean_id: cleanUserIdentifier }
            });
            return c.json({ status: 'ignored', reason: 'missing_id_or_content' });
        }

        // --- 🛡️ CONSTRUCT AUDITABLE PAYLOAD (V50.15) ---
        // Agora incluímos o raw_evolution_payload para possibilitar auditoria profunda
        const finalPayload = {
            name: pushName,
            phone: phone,
            content: textContent,
            instance: instance,
            mediaUrl: mediaUrl,
            mimetype: mimetype,
            platform: platform,
            remoteID: remoteID,
            serverURL: serverURL,
            timestamp: new Date().toISOString(),
            instanceId: instanceId,
            messageType: detectedMessageType,
            raw_evolution_payload: rawMsg // O "Santo Graal" para depurar LID
        };

        console.log(`[PORTEIRO] 📥 Msg from ${phone} (${pushName}) on instance: ${instance}`);

        // --- DATABASE OPERATIONS ---
        
        // 1. Find the agent matching this instance
        const { data: agents, error: agentError } = await supabaseAdmin
            .from('agents')
            .select('id, tenant_id')
            .eq('evolution_instance', instance)
            .limit(1);

        if (agentError || !agents?.length) {
            console.error(`[PORTEIRO] ❌ Agent NOT FOUND for instance: ${instance}. Verify the 'evolution_instance' column in the database.`);
            await logIntegration({
                provider: 'evolution',
                external_id: externalId,
                payload: payload,
                trace_id: initialTraceId,
                status: 'error',
                error_details: agentError?.message || 'Agent not found for this instance'
            });
            return c.json({ error: 'Instance not mapped to any agent' }, 404);
        }

        const agent = agents[0];

        // 2. Upsert Contact (Garante que o contato tenha o ID limpo e o telefone normalizado)
        const { data: contact, error: contactError } = await supabaseAdmin
            .from('contacts')
            .upsert({
                tenant_id: agent.tenant_id,
                identifier: cleanUserIdentifier,
                phone: phone,
                name: pushName,
                channel: 'whatsapp'
            }, { onConflict: 'tenant_id,identifier' })
            .select()
            .single();

        if (contactError) {
            console.error(`[PORTEIRO] ❌ Contact sync failed:`, contactError);
        }

        // --- 🛡️ SMART CONVERSATION LINKER & IDENTITY UPGRADE (V50.14) ---
        // 1. Tenta achar pelo Identificador Limpo (Regra de Ouro: Apenas números)
        let { data: conversationData, error: findError } = await supabaseAdmin
            .from('conversations')
            .select('id, user_identifier')
            .eq('tenant_id', agent.tenant_id)
            .eq('agent_id', agent.id)
            .eq('user_identifier', cleanUserIdentifier)
            .maybeSingle();

        // 2. Se não achou (ex: Gi Mendes @lid), tenta herança pelo número do telefone
        if (!conversationData && !findError) {
            console.log(`[PORTEIRO] 🔍 Identidade ${remoteID} não encontrada. Tentando herança...`);
            
            const { data: heritage, error: heritageError } = await supabaseAdmin
                .from('conversations')
                .select('id, user_identifier')
                .eq('tenant_id', agent.tenant_id)
                .eq('agent_id', agent.id)
                .like('user_identifier', `${phone}%`)
                .neq('status', 'closed')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (heritage) {
                console.log(`[PORTEIRO] 🧬 Herança encontrada! Migrando conversa ${heritage.id} de ${heritage.user_identifier} -> ${remoteID}`);
                const { data: updated, error: updateError } = await supabaseAdmin
                    .from('conversations')
                    .update({ 
                        user_identifier: remoteID,
                        status: 'ai_active',
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', heritage.id)
                    .select()
                    .single();
                
                conversationData = updated;
            }
        }

        // 3. Se ainda não existir, cria uma do zero
        if (!conversationData) {
            console.log(`[PORTEIRO] ✨ Criando nova conversa para ${remoteID}`);
            const { data: created, error: createError } = await supabaseAdmin
                .from('conversations')
                .insert({
                    tenant_id: agent.tenant_id,
                    agent_id: agent.id,
                    user_identifier: cleanUserIdentifier,
                    user_name: pushName,
                    channel: 'whatsapp',
                    status: 'ai_active'
                })
                .select()
                .single();
            
            if (createError) {
                console.error(`[PORTEIRO] ❌ Critical Failure in conversation creation:`, createError);
                return c.json({ error: 'Conversation creation failed', details: createError.message }, 500);
            }
            conversationData = created;
        }

        if (!conversationData) {
            return c.json({ error: 'Failed to establish conversation context' }, 500);
        }

        const conversationId = conversationData.id;
        console.log(`[PORTEIRO] 🛡️ Using Unified Conversation ID: ${conversationId} for ${remoteID}`);

        // 4. Atualiza metadados de última atividade para garantir visibilidade no Dashboard
        await supabaseAdmin
            .from('conversations')
            .update({ 
                last_message_at: new Date().toISOString(),
                status: 'ai_active',
                user_name: pushName 
            })
            .eq('id', conversationId);

        // 5. Update last_message_at (Touch conversation)
        await supabaseAdmin
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

        // 6. --- DEBOUNCE & ENQUEUE (Item 3.2 do Plano Elite) ---
        
        // Se já existe um debounce para esta conversa, cancelamos o anterior
        // Debounce Logic: Update existing or create new entry
        if (pendingMessages.has(conversationId)) {
            const pending = pendingMessages.get(conversationId)!;
            clearTimeout(pending.timeout);
            pending.contents.push(textContent);
        } else {
            pendingMessages.set(conversationId, {
                contents: [textContent],
                agentId: agent.id,
                tenantId: agent.tenant_id,
                instanceName: instance,
                phone: phone,
                pushName: pushName,
                externalId: externalId,
                messageType: detectedMessageType,
                remoteID,
                platform,
                instanceId,
                serverURL,
                mediaUrl,
                mimetype,
                cleanIdentifier: cleanUserIdentifier, // V50.16
                raw_evolution_payload: rawMsg, // V50.15 Audit
                timeout: setTimeout(() => {}) // Placeholder
            });
        }

        // Criamos o novo timer para processar a fila
        const currentPending = pendingMessages.get(conversationId)!;
        currentPending.timeout = setTimeout(async () => {
            const startTime = Date.now();
            const dataToProcess = pendingMessages.get(conversationId);
            if (!dataToProcess) {
                console.log(`[PORTEIRO] ⚠️ Debounce mismatch: could not find pending for ${conversationId}`);
                return;
            }
            pendingMessages.delete(conversationId);

            activeJobs++;

            const finalContent = dataToProcess.contents.join('\n');
            const traceId = `TRC-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-4)}`;
            
            console.log(`[PORTEIRO] 📦 Enfileirando ${dataToProcess.contents.length} mensagens para a conversa ${conversationId} [Trace: ${traceId}]`);

            try {
                // Insere na Inbound Queue calculando o sequence_number
                const { error: queueError } = await supabaseAdmin.rpc('fn_enqueue_inbound_message', {
                    p_tenant_id: dataToProcess.tenantId,
                    p_agent_id: dataToProcess.agentId,
                    p_conversation_id: conversationId,
                    p_external_id: dataToProcess.externalId,
                    p_payload: {
                        content: finalContent,
                        phone: dataToProcess.phone,
                        name: dataToProcess.pushName,
                        instance: dataToProcess.instanceName,
                        timestamp: new Date().toISOString(),
                        messageType: dataToProcess.messageType,
                        remoteID: dataToProcess.remoteID,
                        cleanIdentifier: dataToProcess.cleanIdentifier,
                        platform: dataToProcess.platform,
                        instanceId: dataToProcess.instanceId,
                        serverURL: dataToProcess.serverURL,
                        mediaUrl: dataToProcess.mediaUrl,
                        mimetype: dataToProcess.mimetype,
                        raw_evolution_payload: dataToProcess.raw_evolution_payload
                    },
                    p_trace_id: traceId,
                    p_message_type: dataToProcess.messageType,
                    p_latency_ms: Date.now() - startTime
                });

                if (queueError) {
                    console.error(`[PORTEIRO] ❌ Erro ao enfileirar na Inbound Queue:`, queueError);
                } else {
                    // --- 5. CALL n8n WEBHOOK (REALTIME TRIGGER) ---
                    const n8nWebhookUrl = process.env.N8N_INBOUND_WEBHOOK;
                    if (n8nWebhookUrl && n8nWebhookUrl !== 'SUBSTITUA_PELA_SUA_URL_DO_N8N') {
                        console.log(`[PORTEIRO] 🚀 Triggering n8n Webhook for [Trace: ${traceId}]`);
                        
                        try {
                            const n8nRes = await fetch(n8nWebhookUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    trace_id: traceId,
                                    conversation_id: conversationId,
                                    tenant_id: dataToProcess.tenantId,
                                    agent_id: dataToProcess.agentId,
                                    payload: {
                                        content: finalContent,
                                        phone: dataToProcess.phone,
                                        name: dataToProcess.pushName,
                                        instance: dataToProcess.instanceName
                                    }
                                })
                            });

                            if (n8nRes.ok) {
                                console.log(`[PORTEIRO] ✅ [Trace: ${traceId}] Successfully received by n8n. Processing queue...`);
                            } else {
                                throw new Error(`n8n returned status ${n8nRes.status}`);
                            }
                        } catch (err: any) {
                            console.error(`[PORTEIRO] ❌ [Trace: ${traceId}] Failed to reach n8n Webhook:`, err.message);
                            
                            // 2. LOG INCIDENT TO CENTRAL SYSTEM_LOGS
                            await supabaseAdmin.rpc('fn_log_event', {
                                p_tenant_id: dataToProcess.tenantId,
                                p_trace_id: traceId,
                                p_component: 'PORTEIRO_INBOUND',
                                p_severity: 'WARNING', // Warning because we have a recovery worker
                                p_message: `n8n Webhook failure: ${err.message}`,
                                p_metadata: { conversation_id: conversationId, status: 'pending' }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`[PORTEIRO] ❌ Falha crítica ao processar fila:`, err);
            } finally {
                activeJobs--; // Ajuste 4: libera o slot de concorrência
            }
        }, DEBOUNCE_TIME_MS);

        // --- FINAL LOG UPDATE (Success) ---
        await logIntegration({
            provider: 'evolution',
            external_id: externalId,
            trace_id: initialTraceId,
            phone_number: phone,
            conversation_id: conversationId,
            path: '/v1/evolution/webhook',
            status: 'processed',
            tenant_id: agent.tenant_id,
            agent_id: agent.id,
            latency_ms: Date.now() - startTime,
            payload: payload, // Keep full payload
            validation_results: { 
                event_type: event,
                processed: true,
                conversation_id: conversationId,
                message_type: detectedMessageType
            }
        });

        return c.json({ 
            status: 'success', 
            message: 'Webhook received and debouncing',
            conversation_id: conversationId,
            external_id: externalId 
        });

    } catch (err: any) {
        console.error('[PORTEIRO] ❌ Webhook Error:', err);
        // Tenta logar o erro final (se initialTraceId existir)
        await logIntegration({
            provider: 'evolution',
            status: 'error',
            trace_id: initialTraceId,
            path: '/v1/evolution/webhook',
            error_details: err.message,
            payload: webhookPayload // O payload bruto capturado no início
        });
        return c.json({ error: 'Internal processing error', details: err.message }, 500);
    }
});

// --- ZENVIA WEBHOOK HANDLER (Meta Cloud API Oficial) ---

/**
 * Zenvia Inbound Webhook
 * Recebe mensagens de entrada via provedor oficial Meta (Zenvia BSP)
 * Normaliza e enfileira o mesmo fluxo da Evolution.
 */
app.post('/v1/zenvia/webhook', async (c) => {
    console.log(`[ZENVIA] 🔔 Webhook recebido da Zenvia`);
    let zenviaBody: any = null;
    let initialTraceId = `ZNV-GEN-${Math.random().toString(36).substring(7).toUpperCase()}`;
    const startTime_znv = Date.now();
    try {
        const rawInput = await c.req.json();
        zenviaBody = rawInput;

        // 🛡️ Resiliência V53: Trata se for um array ou se estiver dentro de um "body" (ex: n8n wrapper)
        const arrayItem = Array.isArray(rawInput) ? rawInput[0] : rawInput;
        const body = arrayItem.body || arrayItem; 
        
        // 🛡️ Normalização Zenvia: Alguns payloads trazem os dados dentro de "message"
        const msg = body.message || body;

        // Ignora eventos de saída (loop) e não-MESSAGE
        if (body.direction === 'OUT' || body.type !== 'MESSAGE') {
            console.log(`[ZENVIA] ⏭️ Ignorando evento: type=${body.type}, direction=${body.direction}`);
            return c.json({ ok: true, ignored: true });
        }

        initialTraceId = `ZNV-${Math.random().toString(36).substring(7).toUpperCase()}`;
        
        // Busca os campos preferencialmente no objeto aninhado 'message', com fallback para a raiz
        const phone = (msg.from || body.from)?.replace(/\D/g, '');
        const channelId = msg.to || body.to; // número Zenvia do agente
        const visitor = msg.visitor || body.visitor;
        const pushName = visitor?.name || visitor?.firstName || phone;
        const externalId = body.id;

        // Extrai conteúdo com busca profunda
        const content = (msg.contents || body.contents)?.[0];
        let textContent = '';
        let detectedMessageType = 'conversation';
        let mediaUrl = '';
        let mimetype = '';

        if (content) {
            if (content.type === 'text') {
                textContent = content.text;
            } else if (content.type === 'file' || content.type === 'image') {
                mediaUrl = content.fileUrl;
                mimetype = content.fileMimeType;
                textContent = content.fileCaption || '';
                detectedMessageType = content.type === 'image' ? 'image' : 'document';
            }
        }

        if (!phone || (!textContent && !mediaUrl)) {
            console.error(`[ZENVIA] ❌ Dados incompletos: phone=${phone}, content=${!!textContent}, media=${!!mediaUrl}`);
            await logIntegration({
                provider: 'zenvia',
                external_id: externalId,
                payload: body,
                status: 'ignored',
                path: '/v1/zenvia/webhook',
                error_details: `Missing phone or content (Phone: ${phone}, HasContent: ${!!textContent})`,
                latency_ms: Date.now() - startTime_znv
            });
            return c.json({ ok: true, ignored: true, reason: 'missing_content' });
        }

        // --- 0. PRE-VALIDATION LOG (Zenvia) ---
        
        // Busca o agente pelo zenvia_channel_id (tentativa rápida para o log)
        const { data: earlyAgents } = await supabaseAdmin
            .from('agents')
            .select('id, tenant_id')
            .eq('zenvia_channel_id', channelId)
            .limit(1);
        
        const earlyAgent = earlyAgents?.[0];

        await logIntegration({
            provider: 'zenvia',
            external_id: externalId,
            payload: body,
            tenant_id: earlyAgent?.tenant_id,
            agent_id: earlyAgent?.id,
            trace_id: initialTraceId,
            phone_number: phone,
            path: '/v1/zenvia/webhook',
            status: 'received',
            latency_ms: Date.now() - startTime_znv,
            validation_results: { received_at: new Date().toISOString() }
        });

        // Busca o agente pelo zenvia_channel_id
        const { data: agentRows } = await supabaseAdmin
            .from('agents')
            .select('id, tenant_id')
            .eq('zenvia_channel_id', channelId)
            .eq('status', 'active')
            .limit(1);

        if (!agentRows?.length) {
            console.error(`[ZENVIA] ❌ Agente não encontrado para channel: ${channelId}`);
            await logIntegration({
                provider: 'zenvia',
                external_id: externalId,
                payload: body,
                trace_id: initialTraceId,
                phone_number: phone,
                path: '/v1/zenvia/webhook',
                status: 'error',
                latency_ms: Date.now() - startTime_znv,
                error_details: 'Agent not found for channel: ' + channelId
            });
            return c.json({ error: 'Agent not found' }, 404);
        }

        const agent = agentRows[0];

        // Upsert contato
        await supabaseAdmin.from('contacts').upsert({
            tenant_id: agent.tenant_id,
            identifier: phone,
            phone,
            name: pushName,
            channel: 'whatsapp'
        }, { onConflict: 'tenant_id,identifier' });

        // Localiza ou cria conversa
        const { data: conv } = await supabaseAdmin
            .from('conversations')
            .select('id')
            .eq('tenant_id', agent.tenant_id)
            .eq('user_identifier', phone)
            .eq('agent_id', agent.id)
            .neq('status', 'closed')
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let conversationId = conv?.id;
        if (!conversationId) {
            const { data: newConv } = await supabaseAdmin
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
            conversationId = newConv?.id;
        }

        await supabaseAdmin
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

        // Enfileira — mesmo RPC da Evolution
        const traceId = `ZNV-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-4)}`;
        const { error: queueError } = await supabaseAdmin.rpc('fn_enqueue_inbound_message', {
            p_tenant_id: agent.tenant_id,
            p_agent_id: agent.id,
            p_conversation_id: conversationId,
            p_external_id: externalId,
            p_payload: {
                content: textContent,
                phone,
                name: pushName,
                instance: channelId,
                timestamp: new Date().toISOString(),
                messageType: detectedMessageType,
                platform: 'zenvia',
                mediaUrl,
                mimetype
            },
            p_trace_id: traceId,
            p_message_type: detectedMessageType,
            p_priority: 100, // Mensagem humana = máxima prioridade
            p_latency_ms: Date.now() - startTime_znv
        });

        if (queueError) {
            console.error(`[ZENVIA] ❌ Erro ao enfileirar:`, queueError);
            return c.json({ error: 'Queue error' }, 500);
        }

        // Dispara N8N (mesmo padrão da Evolution)
        const n8nWebhookUrl = process.env.N8N_INBOUND_WEBHOOK;
        if (n8nWebhookUrl) {
            await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trace_id: traceId, conversation_id: conversationId, tenant_id: agent.tenant_id, agent_id: agent.id })
            }).catch(err => console.error(`[ZENVIA] ⚠️ N8N trigger failed:`, err.message));
        }

        console.log(`[ZENVIA] ✅ Mensagem de ${phone} enfileirada [Trace: ${traceId}]`);

        // --- FINAL LOG UPDATE (Zenvia Processed) ---
        await logIntegration({
            provider: 'zenvia',
            external_id: externalId,
            trace_id: initialTraceId,
            phone_number: phone,
            conversation_id: conversationId,
            path: '/v1/zenvia/webhook',
            status: 'processed',
            tenant_id: agent.tenant_id,
            agent_id: agent.id,
            latency_ms: Date.now() - startTime_znv,
            payload: body,
            validation_results: { 
                queue_trace_id: traceId,
                conversation_id: conversationId,
                processed: true
            }
        });

        return c.json({ ok: true, trace_id: traceId });

    } catch (err: any) {
        console.error('[ZENVIA] ❌ Webhook Error:', err);
        await logIntegration({
            provider: 'zenvia',
            status: 'error',
            trace_id: initialTraceId,
            path: '/v1/zenvia/webhook',
            latency_ms: Date.now() - startTime_znv,
            error_details: err.message,
            payload: zenviaBody
        });
        return c.json({ error: 'Internal error', details: err.message }, 500);
    }
});

/**
 * Zenvia Status Webhook
 * Recebe confirmação de entrega da Zenvia (SENT/DELIVERED/READ/FAILED)
 */
app.post('/v1/zenvia/status', async (c) => {
    const body = await c.req.json();
    const code = body.messageStatus?.code;
    const messageId = body.messageId;
    console.log(`[ZENVIA] 📦 Status: ${code} para msgId: ${messageId}`);
    // Atualiza outbound_queue se existir o external_message_id
    if (code === 'FAILED' && messageId) {
        await supabaseAdmin
            .from('outbound_queue')
            .update({ status: 'failed' })
            .eq('external_message_id', messageId);
    }
    return c.json({ ok: true });
});

// --- QUEUE MANAGEMENT (ELITE SYSTEM_ROLE BYPASS) ---

/**
 * List stuck or failed messages (Bypasses RLS using Service Role)
 */
app.get('/v1/queue/stuck', async (c) => {
    const tenantId = c.req.query('tenant_id');
    const stuckTimeMinutes = Number(c.req.query('minutes')) || 5;
    
    // Threshold time
    const threshold = new Date(Date.now() - stuckTimeMinutes * 60000).toISOString();
    
    console.log(`[PORTEIRO] 🔍 Fetching stuck/failed messages for tenant: ${tenantId || 'ALL'}`);

    // Query for FAILED messages (immediate)
    let failedQuery = supabaseAdmin
        .from('inbound_queue')
        .select('*, agents(name)')
        .eq('status', 'failed');

    // Query for STUCK messages (pending/processing with grace period)
    let stuckQuery = supabaseAdmin
        .from('inbound_queue')
        .select('*, agents(name)')
        .in('status', ['pending', 'processing'])
        .lt('created_at', threshold);

    if (tenantId) {
        failedQuery = failedQuery.eq('tenant_id', tenantId);
        stuckQuery = stuckQuery.eq('tenant_id', tenantId);
    }

    const [failedRes, stuckRes] = await Promise.all([
        failedQuery.limit(25),
        stuckQuery.limit(25)
    ]);

    if (failedRes.error || stuckRes.error) {
        const err = failedRes.error || stuckRes.error;
        console.error('[PORTEIRO] ❌ Queue fetch failed:', err);
        return c.json({ error: err?.message }, 500);
    }

    // Combine and sort by creation date
    const combined = [...(failedRes.data || []), ...(stuckRes.data || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return c.json(combined);


});

/**
 * Retry / Force-reprocess a message
 */
app.post('/v1/queue/retry/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`[PORTEIRO] 🔄 Reanimating message ID: ${id}`);

    const { data, error } = await supabaseAdmin
        .from('inbound_queue')
        .update({ 
            status: 'pending',
            locked_at: null,
            processed_at: null,
            error_message: null
        })
        .eq('id', id)
        .neq('status', 'done')
        .select();

    if (error) {
        console.error(`[PORTEIRO] ❌ Retry failed for ${id}:`, error);
        return c.json({ error: error.message }, 500);
    }

    if (!data?.length) {
        return c.json({ error: 'Message not found or already done' }, 404);
    }

    // Opcional: Trigger n8n immediately? (A recuperação já faz isso, mas aqui damos um gás)
    const item = data[0];
    const n8nWebhookUrl = process.env.N8N_INBOUND_WEBHOOK;
    if (n8nWebhookUrl && n8nWebhookUrl !== 'SUBSTITUA_PELA_SUA_URL_DO_N8N') {
        fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trace_id: item.trace_id,
                conversation_id: item.conversation_id,
                tenant_id: item.tenant_id,
                agent_id: item.agent_id,
                payload: item.payload
            })
        }).catch(e => console.error('[PORTEIRO] n8n trigger error after retry:', e.message));
    }

    return c.json({ status: 'success', message: 'Message queued for immediate processing' });
});

async function startHeartbeatWorker() {
    console.log('💓 [HEALTH] Starting System Heartbeat Pulse...');
    
    const pulse = async () => {
        try {
            const uptime = process.uptime();
            const memoryUsage = process.memoryUsage();
            
            // Upsert heartbeat ( Item 2.2 Elite Observability )
            const { error } = await supabaseAdmin.from('system_heartbeats').upsert({
                component: 'PORTEIRO_DAVOS_ELITE',
                status: 'online',
                last_pulse_at: new Date().toISOString(),
                metadata: {
                    uptime: Math.round(uptime) + 's',
                    memory: {
                        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                        heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
                    },
                    node_version: process.version,
                    environment: process.env.NODE_ENV || 'production'
                }
            }, { onConflict: 'component' });

            if (error) throw error;
            console.log('💓 [HEALTH] Heartbeat sent successfully.');
        } catch (err: any) {
            console.error('💔 [HEALTH] Heartbeat Failure:', err.message);
        }
    };

    // Pulso a cada 60 segundos
    setInterval(pulse, 60000);
    pulse(); // Primeiro pulso imediato
}

async function startInboundRecoveryWorker() {
    console.log('⏳ [RECOVERY] Starting Inbound Recovery Worker (Auto-Retry Protocol)...');
    
    const recover = async () => {
        try {
            // Buscamos itens pendentes há mais de 2 minutos (que por algum motivo não deram OK no n8n)
            const twoMinutesAgo = new Date(Date.now() - 2 * 60000).toISOString();
            
            const { data: stuckItems, error } = await supabaseAdmin
                .from('inbound_queue')
                .select('*')
                .eq('status', 'pending')
                .lt('created_at', twoMinutesAgo)
                .limit(10);

            if (error || !stuckItems || stuckItems.length === 0) return;

            console.log(`[RECOVERY] 🔄 Attempting to recover ${stuckItems.length} stuck messages...`);

            for (const item of stuckItems) {
                const n8nWebhookUrl = process.env.N8N_INBOUND_WEBHOOK;
                if (!n8nWebhookUrl) continue;

                try {
                    const res = await fetch(n8nWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            trace_id: item.trace_id,
                            conversation_id: item.conversation_id,
                            tenant_id: item.tenant_id,
                            agent_id: item.agent_id,
                            payload: item.payload
                        })
                    });

                    if (res.ok) {
                        await supabaseAdmin.from('inbound_queue').update({ status: 'done' }).eq('id', item.id);
                        console.log(`[RECOVERY] ✅ Recovered stuck message [Trace: ${item.trace_id}]`);
                    }
                } catch (e: any) {
                    console.error(`[RECOVERY] ❌ Failed recovery attempt for [Trace: ${item.trace_id}]:`, e.message);
                }
            }
        } catch (globalError: any) {
            console.error('[RECOVERY] Global Error:', globalError.message);
        }
    };

    // Roda a cada 2 minutos
    setInterval(recover, 120000);
}

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
                    campaign_id,
                    contact_name,
                    conversation_id,
                    contact_phone, 
                    metadata,
                    trace_id,
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
                        console.log(`[WORKER] ✅ Sent! Syncing identity for ${item.id}...`);

                        // Use the unified RPC to handle everything:
                        // 1. Create/Update Contact
                        // 2. Create/Get Conversation
                        // 3. Log the Message
                        // 4. Mark Queue as 'sent'
                        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('handle_outbound_sent', {
                            p_tenant_id: item.tenant_id,
                            p_agent_id: item.agent_id,
                            p_contact_phone: item.contact_phone,
                            p_message_content: message,
                            p_queue_id: item.id,
                            p_campaign_id: item.campaign_id,
                            p_contact_name: item.contact_name,
                            p_message_type: 'text'
                        });

                        if (rpcError) {
                            console.error(`[WORKER] ⚠️ Message sent but RPC failed for ${item.id}:`, rpcError.message);
                            // Fallback update just in case the RPC fails but message was sent
                            await supabaseAdmin.from('outbound_queue').update({ 
                                status: 'sent', 
                                sent_at: new Date().toISOString(),
                                error_message: `RPC Error: ${rpcError.message}`
                            }).eq('id', item.id);
                        } else {
                            console.log(`[WORKER] ✨ Unified identity sync complete for ${item.id}. Conv: ${rpcData?.ids?.conversation_id}`);
                        }
                    } else {
                        throw new Error(result?.error?.message || result?.message || 'Evolution API Error');
                    }
                } catch (err: any) {
                    console.error(`[WORKER] ❌ Error processing ${item.id} [Trace: ${item.trace_id}]:`, err.message);
                    
                    // 1. Mark as failed in queue
                    await supabaseAdmin.from('outbound_queue').update({ 
                        status: 'failed', 
                        error_message: err.message 
                    }).eq('id', item.id);

                    // 2. LOG ERROR TO CENTRAL SYSTEM_LOGS
                    await supabaseAdmin.rpc('fn_log_event', {
                        p_tenant_id: item.tenant_id,
                        p_trace_id: item.trace_id,
                        p_component: 'PORTEIRO_WORKER',
                        p_severity: 'ERROR',
                        p_message: `Outbound delivery failed: ${err.message}`,
                        p_metadata: { 
                            queue_id: item.id,
                            agent_id: item.agent_id,
                            conversation_id: item.conversation_id
                        }
                    });
                }
            }
        } catch (globalError: any) {
            console.error('[WORKER] Global Error:', globalError);
        }
    };

    // --- REALTIME SUBSCRIPTION ---
    // Listen for new inserts in outbound_queue for instant processing
    
    console.log('❌ [WORKER] Realtime Subscription DISABLED to prevent race conditions with N8N.');
    /*
    supabaseAdmin
        .channel('outbound_queue_changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'outbound_queue' 
        }, (payload) => {
            console.log('⚡ [WORKER] TRIGGER DETECTED: New message in outbound_queue!');
            processQueue();
        })
        .subscribe();
    */

    // Fallback Polling is also disabled
    console.log('❌ [WORKER] Safety Polling (60s) DISABLED. Waiting for RPC calls.');
    /*
    setInterval(() => {
        console.log('🔄 [WORKER] Periodic fallback check...');
        processQueue();
    }, 60000);
    */
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

// Initial start delay to let Supabase settle
setTimeout(() => {
    console.log(`[SYS] ⏳ Starting Backend Services...`);
    startQueueWorker(); // Captura mensagens que vêm do Supabase (Outbound)
    startInboundRecoveryWorker(); // Recupera mensagens presas (Inbound)
    startHeartbeatWorker(); // Inicia pulso de saúde (Observabilidade)
}, 2000);

console.log(`[SYS] 📡 Attempting to start HTTP Server on port ${port}...`);

try {
    serve({
        fetch: app.fetch,
        port,
        hostname: '0.0.0.0', // CRÍTICO: Permite que o Docker receba as chamadas
    }, (info) => {
        console.log(`[SYS] ✅ Porteiro Davos ELITE Online!`);
        console.log(`[SYS] 🔗 URL Interna: http://${info.address}:${info.port}`);
        console.log(`[SYS] 🔍 Teste agora: https://api.davosconsulting.com.br/`);
    });
} catch (err) {
    console.error(`[SYS] ❌ FAILED TO START HTTP SERVER:`, err);
}
