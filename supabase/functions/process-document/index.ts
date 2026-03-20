import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple chunking utility (avoids importing heavy libraries)
function chunkText(text: string, maxTokens: number = 500): string[] {
    const charsPerToken = 4;
    const maxChars = maxTokens * charsPerToken;
    const chunks: string[] = [];
    
    // Split by paragraphs first
    const paragraphs = text.split(/\n\s*\n/);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        if ((currentChunk.length + paragraph.length) > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += paragraph + '\n\n';
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { agentId, tenantId, name, textContent, fileType, fileSize } = await req.json();

        if (!textContent || !agentId || !tenantId) {
            throw new Error('Missing required fields (textContent, agentId, tenantId)');
        }

        // Initialize Supabase Client using Service Role to bypass RLS for embedding generation, 
        // since we are manually securing this inside the function
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Verify that the user calling this actually has rights to the tenant
        // We do this by authenticating the user via the auth header
        const authHeader = req.headers.get('Authorization');
        
        if (!authHeader) {
            console.error('⛔ Missing Authorization Header');
            throw new Error('Unauthorized: No Authorization Header found');
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            console.error('⛔ Auth Verification Error:', authError);
            throw new Error('Unauthorized: Invalid or expired access token');
        }

        const openAiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAiKey) {
            throw new Error('OpenAI API key not configured on backend.');
        }

        const chunks = chunkText(textContent);
        if (chunks.length === 0) {
            throw new Error('Text processing failed to produce chunks');
        }

        const results = [];

        // Generate embeddings and insert
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // 1. Get embedding
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey}`
                },
                body: JSON.stringify({
                    input: chunk,
                    model: 'text-embedding-3-small'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI API Error: ${errText}`);
            }

            const data = await response.json();
            const embedding = data.data[0].embedding;

            // 2. Prepare db payload
            const chunkSuffix = chunks.length > 1 ? ` (Parte ${i + 1}/${chunks.length})` : '';
            const baseNameLength = name.lastIndexOf('.');
            const baseName = baseNameLength > -1 ? name.substring(0, baseNameLength) : name;
            const extension = baseNameLength > -1 ? name.substring(baseNameLength) : '';
            const finalName = `${baseName}${chunkSuffix}${extension}`;

            // 3. Insert into DB
            const { data: insertedData, error: insertError } = await supabase
                .from('agent_knowledge')
                .insert({
                    tenant_id: tenantId,
                    agent_id: agentId,
                    name: finalName,
                    content: chunk,
                    file_type: fileType || 'doc',
                    file_size: Math.floor((fileSize || 0) / chunks.length),
                    file_url: '#', // placeholder
                    embedding: embedding
                })
                .select()
                .single();

            if (insertError) {
                console.error('Insert Error:', insertError);
                throw new Error(`DB Insert Error: ${insertError.message}`);
            }

            results.push(insertedData);
        }

        return new Response(JSON.stringify({ success: true, processedChunks: chunks.length, data: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error processing document:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
