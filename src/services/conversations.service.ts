import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const conversationsService = {
    async getConversationMessages(conversationId: string): Promise<import('@/lib/types').Message[]> {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false }) // Last messages first for limit
            .limit(50);

        if (error) {
            console.error('Error fetching messages:', error);
            return [];
        }

        // Se as mensagens vieram em bloco da VAPI, elas terão o mesmo created_at (transação do banco).
        // Aqui, nós garantimos a ordem usando o external_order (que a VAPI envia) como critério de desempate
        // para que quando dermos o `.reverse()`, a transcrição fique perfeita de cima para baixo.
        data.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            if (timeB !== timeA) return timeB - timeA; // Descending by time
            return (b.external_order || 0) - (a.external_order || 0); // Descending by order
        });

        // Reverse to maintain chronological order in UI (mais antigas primeiro / no topo)
        const chronData = [...data].reverse();

        return chronData.map((m: any) => {
            let cleanContent = m.content;
            try {
                if (m.content && m.content.trim().startsWith('{')) {
                    const parsed = JSON.parse(m.content);
                    if (parsed.content) cleanContent = parsed.content;
                }
            } catch (e) { /* Not JSON, ignore */ }

            return {
                id: m.id,
                conversationId: m.conversation_id,
                tenantId: m.tenant_id,
                tenantSlug: '', // Not needed for display
                content: cleanContent,
                type: (m.message_type || 'text') as 'text' | 'image' | 'audio',
                sender: (m.sender_type === 'user' ? 'user' :
                    m.sender_type === 'human' ? 'human' : 'ai') as 'user' | 'ai' | 'human',
                senderName: m.sender_name,
                timestamp: new Date(m.created_at),
                audioUrl: m.audio_url,
                imageUrl: m.image_url,
                transcription: m.transcription,
                status: m.status,
                statusDescription: m.metadata?.status_description || m.metadata?.last_status_description || m.metadata?.prov_error
            };
        }) as import('@/lib/types').Message[];
    },
    async sendMessage(conversationId: string, content: string, sender: 'user' | 'ai' | 'human', senderName?: string, type: 'text' | 'image' | 'audio' = 'text'): Promise<void> {
        // DEBUG: Chamando sendMessage
        console.log('🚀 Enviar mensagem para ID:', conversationId);
        
        // 1. Fetch conversation data first
        const { data: conv, error: fetchError } = await supabase
            .from('conversations')
            .select('tenant_id, agent_id, user_identifier')
            .eq('id', conversationId)
            .maybeSingle();

        if (fetchError) {
            console.error('❌ Error fetching conversation:', fetchError);
            throw fetchError;
        }

        if (!conv) {
            console.error('❌ Conversation not found in DB for ID:', conversationId);
            throw new Error('Conversation not found');
        }

        // 2. Fetch agent config separately to avoid join issues
        const { data: agentData } = await supabase
            .from('agents')
            .select('type, integration_config')
            .eq('id', conv.agent_id)
            .maybeSingle();

        const { error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                tenant_id: conv.tenant_id,
                content,
                sender_type: sender,
                sender_name: senderName,
                message_type: type,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        // Update conversation last_message_at
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

        // 3. Trigger N8N (Unified Flow via Queue)
        if (sender === 'human' && agentData) {
            if (agentData.type === 'whatsapp') {
                const dynamicUrl = agentData.integration_config?.n8n_webhook_url;
                const n8nUrl = dynamicUrl || import.meta.env.VITE_N8N_WEBHOOK_URL;
                const traceId = `CHT-MANUAL-${Math.random().toString(36).substring(7).toUpperCase()}`;

                if (n8nUrl) {
                    try {
                        console.log('📡 Enqueuing manual message and triggering N8N:', traceId);
                        
                        // 1. Enqueue in the unified queue
                        const { error: queueError } = await supabase.rpc('fn_enqueue_inbound_message', {
                            p_tenant_id: conv.tenant_id,
                            p_agent_id: conv.agent_id,
                            p_conversation_id: conversationId,
                            p_external_id: `MANUAL-${Date.now()}`,
                            p_payload: {
                                content: content,
                                phone: conv.user_identifier,
                                name: senderName || 'Operador',
                                sender: 'human'
                            },
                            p_trace_id: traceId,
                            p_message_type: 'human_response' // Unified type for n8n routing
                        });

                        if (queueError) throw queueError;

                        // 2. Trigger N8N (Same protocol as Porteiro)
                        fetch(n8nUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                trace_id: traceId,
                                conversation_id: conversationId,
                                action: 'manual_message'
                            })
                        }).catch(err => console.error('❌ N8N Webhook Error:', err));
                    } catch (e) {
                        console.error('Failed to unify message flow:', e);
                    }
                }
            }
        }
    },

    async triggerAudit(conversationId: string, context?: { tenantId: string; agentId?: string }): Promise<boolean> {
        const baseUrl = import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
        const finalUrl = baseUrl.endsWith('/audit-conversation') ? baseUrl : `${baseUrl}/audit-conversation`;

        console.log('triggerAudit payload:', conversationId, context);

        try {
            const response = await fetch(finalUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'MANUAL',
                    table: 'conversations',
                    schema: 'public',
                    record: {
                        id: conversationId,
                        tenant_id: context?.tenantId,
                        agent_id: context?.agentId
                    }
                })
            });
            return response.ok;
        } catch (error) {
            console.error('Error triggering audit:', error);
            return false;
        }
    },

    async getConversationCost(conversationId: string): Promise<number> {
        // Use RPC for reliable JSONB filtering on the server side
        const { data, error } = await supabase.rpc('get_conversation_cost', {
            p_conversation_id: conversationId
        });

        if (error) {
            console.error('Error fetching conversation cost:', error);
            // Fallback to client-side filter if RPC fails/doesn't exist yet
            const { data: fallbackData } = await supabase
                .from('consumption_metrics')
                .select('cost, metadata')
                .not('metadata', 'is', null); // Fetch all non-null metadata rows (warning: heavy) to filter in JS as last resort

            if (fallbackData) {
                return fallbackData
                    .filter((row: any) => row.metadata?.conversation_id === conversationId)
                    .reduce((acc: number, curr: any) => acc + Number(curr.cost), 0);
            }
            return 0;
        }

        return Number(data || 0);
    }
};
