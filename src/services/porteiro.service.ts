import { supabase } from '@/lib/supabase';

const PORTEIRO_URL = import.meta.env.VITE_PORTEIRO_URL || 'http://localhost:3001';

export const porteiro = {
    /**
     * Proxies a request to the Evolution API via the Porteiro Gateway.
     * This ensures the API Key is never exposed to the client.
     */
    async proxyEvolution(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', payload?: any) {
        // Get the current user session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            throw new Error('Você precisa estar logado para realizar esta operação.');
        }

        const response = await fetch(`${PORTEIRO_URL}/v1/evolution/proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                endpoint,
                method,
                payload
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Erro ao processar requisição no Porteiro');
        }

        return response.json();
    },

    /**
     * Checks if a Zenvia / Meta template exists and is approved
     */
    async checkZenviaTemplate(templateId: string, tenantId?: string) {
        // Try getting user session
        const { data: { session } } = await supabase.auth.getSession();
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        try {
            const response = await fetch(`${PORTEIRO_URL}/v1/zenvia/template-check`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    templateId,
                    tenantId
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    valid: false,
                    status: 'ERROR',
                    message: errorData.error || `Erro HTTP ${response.status}`
                };
            }

            return response.json();
        } catch (err: any) {
            console.warn('[Porteiro] Template check fetch failed:', err);
            return {
                valid: false,
                status: 'UNAVAILABLE',
                message: err.message || 'Serviço de validação externa indisponível'
            };
        }
    },

    /**
     * Valida um WhatsApp Flow na Meta via Porteiro / Zenvia
     */
    async validateWhatsappFlow(payload: {
        agent_id?: string;
        flow_id: string;
        flow_mode: 'draft' | 'published';
        screen_id?: string;
        cta_text?: string;
        test_phone: string;
        zenvia_api_token?: string;
        zenvia_channel_id?: string;
    }) {
        const { data: { session } } = await supabase.auth.getSession();
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        try {
            const response = await fetch(`${PORTEIRO_URL}/v1/zenvia/validate-flow`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (typeof data?.valid === 'boolean') {
                return data;
            }

            if (response.status === 404) {
                return {
                    valid: false,
                    message: 'O endpoint de validação do Flow está pendente de deploy/restart no servidor Porteiro da VPS. A configuração do Flow ID segue salva e funcional para o n8n.'
                };
            }

            if (!response.ok) {
                return {
                    valid: false,
                    message: data?.message || data?.error || `Erro HTTP ${response.status} ao validar Flow no Porteiro.`
                };
            }

            return data;
        } catch (err: any) {
            console.warn('[Porteiro] Flow validation fetch failed:', err);
            return {
                valid: false,
                message: `Não foi possível conectar ao servidor do Porteiro (${err?.message || 'Erro de rede'}).`
            };
        }
    },

    /**
     * Basic health check for the gateway
     */
    async healthCheck() {
        try {
            const res = await fetch(`${PORTEIRO_URL}/health`);
            return res.ok;
        } catch {
            return false;
        }
    }
};
