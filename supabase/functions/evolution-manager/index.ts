
// Evolution Manager Proxy
// Uses node-fetch with https.Agent to bypass SSL issues
// Removed Deno.env.set to avoid permission errors

import fetch from "npm:node-fetch@3.3.2";
import https from "node:https";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
}

// Create an HTTPS agent that ignores SSL errors
const agent = new https.Agent({
    rejectUnauthorized: false
});

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, instanceName, agentId, tenantSlug } = await req.json()

        // Verify config
        if (!EVOLUTION_API_URL) {
            console.error('Missing EVOLUTION_API_URL');
            throw new Error('Evolution API URL not configured')
        }

        console.log(`[Proxy] Action: ${action} | Instance: ${instanceName} | Target: ${EVOLUTION_API_URL}`);

        let endpoint = ''
        let method = 'GET'
        let body = null

        switch (action) {
            case 'create-instance':
                endpoint = `/instance/create`
                method = 'POST'
                body = {
                    instanceName: instanceName,
                    token: crypto.randomUUID(),
                    qrcode: true,
                    integration: "WHATSAPP-BAILEYS"
                }
                break

            case 'connect':
                endpoint = `/instance/connect/${instanceName}`
                method = 'GET'
                break

            case 'status':
                endpoint = `/instance/connectionState/${instanceName}`
                method = 'GET'
                break

            case 'logout':
                endpoint = `/instance/logout/${instanceName}`
                method = 'DELETE'
                break

            default:
                throw new Error(`Invalid action: ${action}`)
        }

        try {
            const url = `${EVOLUTION_API_URL}${endpoint}`;
            console.log(`[Fetch] Requesting: ${method} ${url}`);

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_KEY || ''
                },
                body: body ? JSON.stringify(body) : null,
                agent: agent, // Explicitly pass the insecure agent
            });

            // Handle upstream errors gracefully
            if (!response.ok) {
                console.error(`[Evolution Upstream Error] Status: ${response.status}`);
                const errorText = await response.text();
                try {
                    console.error(`[Evolution Upstream Body]:`, JSON.parse(errorText));
                } catch {
                    console.error(`[Evolution Upstream Body]:`, errorText);
                }

                // If 404/400/401, return generic state instead of blowing up
                if ([400, 401, 404].includes(response.status)) {
                    return new Response(JSON.stringify({
                        instance: { state: 'close', status: response.status },
                        error: `Instance disconnected or not found (${response.status})`
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 200,
                    })
                }

                throw new Error(`Upstream Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })

        } catch (fetchError) {
            console.error('Fetch Error:', fetchError);

            // Return 200 with friendly error if SSL fails
            if (fetchError.message && (fetchError.message.includes('cert') || fetchError.message.includes('ssl'))) {
                return new Response(JSON.stringify({
                    error: `SSL/Certificate Error: The Evolution API server has an invalid certificate. Please check server SSL settings.`
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            throw fetchError;
        }

    } catch (error) {
        console.error('Edge Function Error:', error.message);
        return new Response(JSON.stringify({ error: `Internal Error: ${error.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
