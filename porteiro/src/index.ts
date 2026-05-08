import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Initialize Supabase Clients
const VERSION = 'V66.4-DNA-SYNC';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
    console.warn('⚠️ [PORTEIRO] SUPABASE_URL não configurada. Auth não funcionará.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Use Service Role for backend operations (Webhooks, etc.) if available
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : supabase;

// --- 🛡️ GLOBAL TIMESTAMP LOGGING ---
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const getTimestamp = () => `[${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}]`;

console.log = (...args) => originalLog(getTimestamp(), ...args);
console.error = (...args) => originalError(getTimestamp(), ...args);
console.warn = (...args) => originalWarn(getTimestamp(), ...args);

// --- CONFIGURAÇÕES DE FILA (V50 - Scale Guardian) ---
const DEBOUNCE_TIME_MS = 1500; // Tempo de espera para agrupar mensagens

// Ajuste 4: Limite de jobs simultâneos (anti-colapso)
const MAX_CONCURRENT_JOBS = 50;
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
        const { data: conversationDataResult, error: findError } = await supabaseAdmin
            .from('conversations')
            .select('id, user_identifier')
            .eq('tenant_id', agent.tenant_id)
            .eq('agent_id', agent.id)
            .eq('user_identifier', cleanUserIdentifier)
            .maybeSingle();
        
        let conversationData = conversationDataResult;

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
    const startTime_znv = Date.now();
    const rawInput = await c.req.json();
    const arrayItem = Array.isArray(rawInput) ? rawInput[0] : rawInput;
    const body = arrayItem.body || arrayItem;
    const msg = body.message || body;
    const externalId = body.id || body.messageId;
    const traceId = `ZNV-TRC-${Math.random().toString(36).substring(7).toUpperCase()}`;

    console.log(`[ZENVIA] 🔔 Webhook Recebido: ${externalId || 'N/A'} (Lote: ${traceId})`);
    console.log(`[ZENVIA] 📊 Tipo: ${body.type}, Direção: ${body.direction}, Prov: ${body.channel || 'whatsapp'}`);

    // RESPOSTA IMEDIATA: O Zenvia tem timeout de 5 segundos.
    // Respondemos em milissegundos e liberamos o processamento pesado.
    const response = c.json({ ok: true, trace_id: traceId }, 200);

    // PROCESSAMENTO ASSÍNCRONO (Background Task)
    (async () => {
        try {
            console.log(`[ZENVIA] 📥 [${traceId}] Payload Bruto:`, JSON.stringify(body, null, 2));

            // 📊 TRATAMENTO DE STATUS (DLR)
            if (body.type === 'MESSAGE_STATUS') {
                const remoteId = body.messageId || body.id || body.messageStatus?.id || body.remoteId;
                const statusCode = body.messageStatus?.code;
                
                // 🧪 LOG RAIO-X PEDIDO PELO USUÁRIO
                console.log(`[ZENVIA] 🧪 STATUS WEBHOOK [${remoteId}]:`, JSON.stringify(body, null, 2));

                let { data: originalMsg } = await supabaseAdmin
                    .from('messages')
                    .select('id, agent_id, tenant_id, metadata, remote_id')
                    .eq('remote_id', remoteId)
                    .limit(1)
                    .maybeSingle();

                // 🔄 FALLBACK: Se não achar pelo remote_id, tenta pelo correlationId no metadata (Crucial para Stress Lab)
                if (!originalMsg) {
                    const { data: fallbackMsg } = await supabaseAdmin
                        .from('messages')
                        .select('id, agent_id, tenant_id, metadata, remote_id')
                        .filter('metadata->>correlationId', 'eq', remoteId)
                        .limit(1)
                        .maybeSingle();
                    
                    if (fallbackMsg) {
                        originalMsg = fallbackMsg;
                        console.log(`[ZENVIA] 🔄 Mensagem encontrada via Fallback CorrelationId: ${originalMsg.id}`);
                    }
                }

                let agentId = originalMsg?.agent_id;
                let tenantId = originalMsg?.tenant_id;

                if (!agentId) {
                    // Fallback 1: ID do Canal (amenable-sweatpants)
                    const channelId = body.message?.from || body.from || body.channel || body.messageStatus?.channel;
                    console.log(`[ZENVIA] 🔍 Fallback 1 (Canal): ${channelId}`);
                    
                    const { data: agents } = await supabaseAdmin
                        .from('agents')
                        .select('id, tenant_id, zenvia_aliases, zenvia_channel_id')
                        .or(`zenvia_channel_id.eq.${channelId},zenvia_aliases.cs.{${channelId}}`)
                        .eq('status', 'active');
                    
                    const agent = agents?.find(a => {
                        if (a.zenvia_aliases && a.zenvia_aliases.length > 0) {
                            return a.zenvia_aliases.includes(channelId);
                        }
                        return a.zenvia_channel_id === channelId;
                    });
                    
                    if (agent) {
                        agentId = agent.id;
                        tenantId = agent.tenant_id;
                        console.log(`[ZENVIA] 🎯 Fallback 1 Sucedido (Strict)! Agente: ${agentId}`);
                    } else {
                        // Fallback 2: Tentar pelo telefone do destinatário
                        const rawTo = body.message?.to || body.to || body.messageStatus?.to || body.contact?.id;
                        const phone = rawTo?.replace(/\D/g, '');
                        console.log(`[ZENVIA] 🔍 Fallback 2 (Telefone): ${phone} (Original: ${rawTo})`);

                        if (phone && phone.length > 8) {
                            const { data: lastConv } = await supabaseAdmin
                                .from('conversations')
                                .select('agent_id, tenant_id')
                                .eq('user_identifier', phone)
                                .neq('status', 'closed')
                                .order('last_message_at', { ascending: false })
                                .limit(1)
                                .maybeSingle();
                            
                            if (lastConv) {
                                agentId = lastConv.agent_id;
                                tenantId = lastConv.tenant_id;
                                console.log(`[ZENVIA] 🎯 Fallback 2 Sucedido! Agente: ${agentId}`);
                            }
                        }
                    }
                }

                if (statusCode === 'REJECTED' || statusCode === 'FAILED') {
                    const errorDescription = body.messageStatus?.description || 'Rejected by provider';
                    const targetRemoteId = originalMsg?.remote_id || remoteId;
                    console.log(`[ZENVIA] ❌ Rejeição detectada para ${targetRemoteId}: ${errorDescription}. Sincronizando via RPC...`);

                    // 1. Atualizamos a fila de saída se necessário
                    if (targetRemoteId) {
                        await supabaseAdmin
                            .from('outbound_queue')
                            .update({ status: 'failed', error_message: errorDescription })
                            .eq('external_message_id', targetRemoteId);
                    }
                }

                if (agentId && tenantId) {
                    const statusDescription = body.messageStatus?.description || 'No description';
                    const providerDNA = body.message?.externalId || body.externalId; // DNA que enviamos no V66.5

                    // 🚀 SINCRONIZAÇÃO FINAL V66.5: 
                    // Chama o RPC corrigido que usa o DNA para limpar a fila instantaneamente.
                    const { error: rpcError } = await supabaseAdmin.rpc('handle_message_status_update', {
                        p_remote_id: remoteId,
                        p_status_code: statusCode,
                        p_status_description: statusDescription,
                        p_trace_id: providerDNA
                    });

                    if (rpcError) {
                        console.error(`[ZENVIA] ❌ Erro RPC handle_message_status_update:`, rpcError.message);
                    } else {
                        console.log(`[ZENVIA] ✅ Status ${statusCode} sincronizado via RPC [${remoteId}] (DNA: ${providerDNA || 'N/A'})`);
                    }
                } else {
                    console.warn(`[ZENVIA] ⚠️ Status ignorado: Não foi possível mapear msg ${remoteId} a um agente.`);
                }
                return;
            }

            // 💬 TRATAMENTO DE MENSAGEM (INBOUND)
            if (body.direction === 'IN' && body.type === 'MESSAGE') {
                const phone = (msg.from || body.from)?.replace(/\D/g, '');
                const destination = (msg.to || body.to); // O canal ou número que recebeu a mensagem
                
                console.log(`[ZENVIA] 🛡️ GATEKEEPER [${traceId}]: Inbound from ${phone} to ${destination}`);
                
                // 🔍 BUSCA RIGOROSA DE AGENTE (V66.8 - Security Gate)
                // O Agente deve bater EXATAMENTE com o zenvia_channel_id ou estar nos aliases.
                const { data: agents } = await supabaseAdmin
                    .from('agents')
                    .select('id, name, tenant_id, zenvia_channel_id, zenvia_aliases')
                    .or(`zenvia_channel_id.eq.${destination},zenvia_aliases.cs.{${destination}}`)
                    .eq('status', 'active');

                const agent = agents?.find(a => {
                    if (a.zenvia_aliases && a.zenvia_aliases.length > 0) {
                        return a.zenvia_aliases.includes(destination);
                    }
                    return a.zenvia_channel_id === destination;
                });

                if (!agent) {
                    console.warn(`[ZENVIA] 🛡️ GATEKEEPER REJECTED: No strictly matched active agent found for destination ${destination}. Message from ${phone} ignored.`);
                    // Logamos a rejeição para auditoria
                    await logIntegration({
                        provider: 'zenvia',
                        external_id: externalId || traceId,
                        payload: body,
                        status: 'ignored',
                        path: '/v1/zenvia/webhook',
                        validation_results: { 
                            reason: 'channel_not_mapped', 
                            destination: destination,
                            phone: phone 
                        }
                    });
                    return;
                }

                console.log(`[ZENVIA] 👤 Agente identificado: ${agent.name} (ID: ${agent.id})`);

                // Upsert Contato & Conversa
                console.log(`[ZENVIA] 🔄 [${traceId}] Iniciando Upsert de Contato para ${phone}...`);
                const { error: contactError } = await supabaseAdmin.from('contacts').upsert({
                    tenant_id: agent.tenant_id,
                    identifier: phone,
                    phone,
                    name: msg.visitor?.name || phone,
                    channel: 'whatsapp'
                }, { onConflict: 'tenant_id,identifier' });
                if (contactError) console.error(`[ZENVIA] ❌ Erro no Upsert Contato:`, contactError);

                console.log(`[ZENVIA] 🔍 [${traceId}] Buscando conversa (aberta ou fechada)...`);
                const { data: conv, error: convFetchError } = await supabaseAdmin
                    .from('conversations')
                    .select('id, status')
                    .eq('tenant_id', agent.tenant_id)
                    .eq('user_identifier', phone)
                    .eq('agent_id', agent.id)
                    .order('last_message_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (convFetchError) console.error(`[ZENVIA] ❌ Erro ao buscar conversa:`, convFetchError);

                let convId = conv?.id;
                
                if (convId) {
                    if (conv.status === 'closed') {
                        console.log(`[ZENVIA] 🔓 [${traceId}] Reabrindo conversa fechada (${convId})...`);
                        await supabaseAdmin.from('conversations')
                            .update({ status: 'ai_active', updated_at: new Date().toISOString() })
                            .eq('id', convId);
                    }
                } else {
                    console.log(`[ZENVIA] ✨ [${traceId}] Nenhuma conversa encontrada. Criando nova...`);
                    const { data: newConv, error: convCreateError } = await supabaseAdmin.from('conversations').insert({
                        tenant_id: agent.tenant_id,
                        agent_id: agent.id,
                        user_identifier: phone,
                        user_name: msg.visitor?.name || 'Cliente Zenvia',
                        channel: 'whatsapp',
                        status: 'ai_active'
                    }).select('id').maybeSingle();
                    
                    if (convCreateError) console.error(`[ZENVIA] ❌ Erro ao criar conversa:`, convCreateError);
                    convId = newConv?.id;
                }

                if (convId) {
                    console.log(`[ZENVIA] 📝 [${traceId}] Conversa identificada: ${convId}. Salvando mensagem no banco...`);
                    const content = (msg.contents || body.contents)?.[0];
                    const text = content?.text || content?.fileCaption || '';
                    const type = content?.type === 'image' ? 'image' : (content?.type === 'file' ? 'document' : 'text');
                    
                    // 💾 SALVA NA TABELA MESSAGES (Para visibilidade no Dashboard)
                    const { error: msgInsertError } = await supabaseAdmin.from('messages').insert({
                        conversation_id: convId,
                        tenant_id: agent.tenant_id,
                        agent_id: agent.id,
                        content: text,
                        direction: 'inbound',
                        sender_type: 'user',
                        message_type: 'text',
                        remote_id: externalId,
                        metadata: { trace_id: traceId, provider: 'zenvia' }
                    });

                    if (msgInsertError) {
                        console.error(`[ZENVIA] ❌ Erro ao salvar mensagem na tabela messages:`, msgInsertError);
                    }

                    const trace = `ZNV-${Math.random().toString(36).substring(7).toUpperCase()}`;

                    console.log(`[ZENVIA] 🚀 [${traceId}] Chamando RPC fn_enqueue_inbound_message...`);
                    const { error: rpcError } = await supabaseAdmin.rpc('fn_enqueue_inbound_message', {
                        p_tenant_id: agent.tenant_id,
                        p_agent_id: agent.id,
                        p_conversation_id: convId,
                        p_external_id: externalId,
                        p_payload: {
                            name: msg.visitor?.name || phone,
                            phone, 
                            instance: destination, 
                            content: text, 
                            platform: 'zenvia', 
                            mediaUrl: content?.fileUrl,
                            messageType: type
                        },
                        p_trace_id: trace,
                        p_message_type: type === 'text' ? 'conversation' : type,
                        p_latency_ms: 0
                    });

                    if (rpcError) {
                        console.error(`[ZENVIA] ❌ Erro RPC enfileiramento:`, rpcError);
                    } else {
                        console.log(`[ZENVIA] ✅ Mensagem enfileirada e salva: ${phone} [Trace: ${trace}]`);
                    }

                    const n8nUrl = process.env.N8N_INBOUND_WEBHOOK;
                    if (n8nUrl) {
                        fetch(n8nUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ trace_id: trace, conversation_id: convId, tenant_id: agent.tenant_id })
                        }).catch((e) => console.error(`[ZENVIA] ❌ Erro ao avisar n8n:`, e));
                    }
                } else {
                    console.warn(`[ZENVIA] ⚠️ [${traceId}] Abortando: Não foi possível obter ID de conversa.`);
                }
            }
        } catch (err: any) {
            console.error('[ZENVIA] ❌ Background Error:', err.message);
        }
    })();

    return response;
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
    // --- PORTARIA WATCHDOG V65.0 (SLOW BURN MODE) ---
    const RECOVERY_ENABLED = true; 
    const BATCH_SIZE = 2; // Apenas 2 por vez para estabilidade total
    const PUSH_DELAY = 1500; // 1.5s entre mensagens
    const POLLING_INTERVAL = 10000; // A cada 10 segundos

    if (!RECOVERY_ENABLED) {
      console.log(`[SYS] 🛑 [V65.0] Recovery Workers are DISABLED.`);
    } else {
      console.log(`[SYS] 🔥 [V65.0-SLOW-BURN] Engine ONLINE. Throttling: ${BATCH_SIZE} msg / ${POLLING_INTERVAL/1000}s`);
      
      // 1. RESGATE DE PENDING
      setInterval(async () => {
        try {
          const { data: pendingItems } = await supabaseAdmin
            .from('inbound_queue')
            .select('*')
            .eq('status', 'pending')
            .limit(BATCH_SIZE)
            .order('created_at', { ascending: true });

          if (pendingItems && pendingItems.length > 0) {
            console.log(`[RECOVERY] 📉 [V66.0] Sending ${pendingItems.length} items to n8n...`);
            for (const item of pendingItems) {
              await new Promise(resolve => setTimeout(resolve, PUSH_DELAY));
              
              const n8nUrl = process.env.N8N_INBOUND_WEBHOOK;
              if (n8nUrl) {
                // PUSH DIRETO NO N8N - Bypassa o Porteiro para não clonar a mensagem
                fetch(n8nUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    trace_id: item.trace_id,
                    conversation_id: item.conversation_id,
                    tenant_id: item.tenant_id,
                    agent_id: item.agent_id,
                    payload: item.payload
                  })
                })
                .then(() => {
                  // Marca como assigned imediatamente para não repetir enquanto o n8n trabalha
                  supabaseAdmin.from('inbound_queue').update({ status: 'assigned' }).eq('id', item.id).then();
                })
                .catch(e => console.error(`[RECOVERY] ❌ Push failed: ${e.message}`));
              }
            }
          }
        } catch (err) {
          console.error('[RECOVERY] ❌ Watchdog Error:', err);
        }
      }, POLLING_INTERVAL);
    }
}

async function startOutboundRecoveryWorker() {
    console.log('🛡️ [RECOVERY] Starting Outbound Recovery Worker (SLA Guardian)...');
    
    const recover = async () => {
        try {
            // Buscamos mensagens presas em 'processing' ou 'pending' há mais de 10 minutos
            const tenMinutesAgo = new Date(Date.now() - 10 * 60000).toISOString();
            
            const { data: stuckItems, error } = await supabaseAdmin
                .from('outbound_queue')
                .select('*')
                .in('status', ['pending', 'processing'])
                .lt('updated_at', tenMinutesAgo)
                .limit(20);

            if (error || !stuckItems || stuckItems.length === 0) return;

            console.log(`[RECOVERY] 🔄 Found ${stuckItems.length} STUCK OUTBOUND messages. Re-queueing...`);

            for (const item of stuckItems) {
                // Reiniciamos o status para pending e zeramos o lock
                await supabaseAdmin
                    .from('outbound_queue')
                    .update({ 
                        status: 'pending', 
                        updated_at: new Date().toISOString(),
                        error_message: 'Recovered by Watchdog (Timeout SLA)' 
                    })
                    .eq('id', item.id);
            }
        } catch (err: any) {
            console.error('[RECOVERY] Outbound Watchdog Error:', err.message);
        }
    };

    setInterval(recover, 300000); // Roda a cada 5 minutos
}

async function startInboundRecoveryWorker() {
    // Este worker agora serve apenas para destravar itens em 'processing' há muito tempo
    const recover = async () => {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString();
            
            const { data: stuckItems } = await supabaseAdmin
                .from('inbound_queue')
                .select('*')
                .in('status', ['processing', 'assigned'])
                .lt('updated_at', fiveMinutesAgo)
                .limit(5);

            if (stuckItems && stuckItems.length > 0) {
                console.log(`[RECOVERY] 🚑 [V65.0] Rescuing ${stuckItems.length} stagnant items...`);
                await supabaseAdmin
                    .from('inbound_queue')
                    .update({ status: 'pending', updated_at: new Date().toISOString() })
                    .in('id', stuckItems.map(i => i.id));
            }
        } catch (err) { 
            console.error("[RECOVERY] ❌ Failed to recover stagnant items:", err);
        }
    };
    setInterval(recover, 60000);
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
                        meta_api_token,
                        zenvia_channel_id
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
                    } else if (apiType === 'zenvia') {
                        // [V66.9] Dynamic Multi-Number Support
                        const zenviaToken = agent?.zenvia_api_token || process.env.ZENVIA_API_TOKEN;
                        const rawChannelId = agent?.zenvia_channel_id || '';
                        
                        // Determina qual número usar como remetente
                        // Prioridade: metadata.origin_number > metadata.instance > zenvia_channel_id
                        let fromNumber = item.metadata?.origin_number || item.metadata?.instance || rawChannelId;
                        if (fromNumber.includes(',')) fromNumber = fromNumber.split(',')[0].trim();
                        
                        const znvRes = await fetch('https://api.zenvia.com/v2/channels/whatsapp/messages', {
                            method: 'POST',
                            headers: { 
                                'X-API-TOKEN': zenviaToken || '',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                from: fromNumber.trim(),
                                to: contactPhone,
                                contents: [{ type: 'text', text: message }],
                                externalId: item.trace_id // [V66.5] DNA Tracker
                            })
                        });
                        result = await znvRes.json();
                        responseOk = znvRes.ok;
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
                        const remoteId = result?.id || result?.messageId || (result?.key?.id);
                        console.log(`[WORKER] ✅ Sent! Syncing identity for ${item.id}... Remote: ${remoteId}`);

                        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('handle_outbound_sent', {
                            p_tenant_id: item.tenant_id,
                            p_agent_id: item.agent_id,
                            p_contact_phone: item.contact_phone,
                            p_message_content: message,
                            p_queue_id: item.id,
                            p_campaign_id: item.campaign_id,
                            p_contact_name: item.contact_name,
                            p_message_type: 'text',
                            p_remote_id: remoteId,
                            p_trace_id: (item as any).trace_id // 🔥 DNA DA CONVERSA REPASSADO AO BANCO
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
                    
                    // 1. Mark as failed or schedule retry (SLA ELITE - Ponto 3.1)
                    const currentRetries = (item as any).retry_count || 0;
                    if (currentRetries < 3) {
                        const backoff = (currentRetries + 1) * 2; // 2min, 4min, 6min
                        const nextTry = new Date(Date.now() + backoff * 60000).toISOString();
                        
                        console.log(`[WORKER] 🔄 Scheduling retry #${currentRetries + 1} for ${item.id} at ${nextTry}`);
                        
                        await supabaseAdmin.from('outbound_queue').update({ 
                            status: 'pending', 
                            retry_count: currentRetries + 1,
                            scheduled_at: nextTry,
                            error_message: `Retry #${currentRetries + 1}: ${err.message}` 
                        }).eq('id', item.id);
                    } else {
                        // Max retries reached - move to failure (DLQ)
                        await supabaseAdmin.from('outbound_queue').update({ 
                            status: 'failed', 
                            error_message: `FATAL: Max retries exceeded. Last error: ${err.message}` 
                        }).eq('id', item.id);
                    }

                    // 2. LOG ERROR TO CENTRAL SYSTEM_LOGS
                    await supabaseAdmin.rpc('fn_log_event', {
                        p_tenant_id: item.tenant_id,
                        p_trace_id: item.trace_id,
                        p_component: 'PORTEIRO_WORKER',
                        p_severity: currentRetries < 3 ? 'WARNING' : 'ERROR',
                        p_message: `Outbound delivery failed: ${err.message}`,
                        p_metadata: { 
                            queue_id: item.id,
                            agent_id: item.agent_id,
                            retry_count: currentRetries
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
    startOutboundRecoveryWorker(); // NOVO: Watchdog de mensagens presas no Outbound (Ponto 3.1 & 3.4)
    startHeartbeatWorker(); // Inicia pulso de saúde (Observabilidade)
}, 2000);

console.log(`[SYS] 📡 Attempting to start HTTP Server on port ${port}...`);

try {
    serve({
        fetch: app.fetch,
        port,
        hostname: '0.0.0.0', // CRÍTICO: Permite que o Docker receba as chamadas
    }, (info) => {
        console.log(`[SYS] ✅ Porteiro Davos ELITE Online! [Version: ${VERSION}]`);
        console.log(`[SYS] 🔗 URL Interna: http://${info.address}:${info.port}`);
        console.log(`[SYS] 🔍 Teste agora: https://api.davosconsulting.com.br/`);
    });
} catch (err) {
    console.error(`[SYS] ❌ FAILED TO START HTTP SERVER:`, err);
}
