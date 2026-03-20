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
