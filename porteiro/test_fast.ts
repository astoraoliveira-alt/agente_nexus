import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function test() {
    console.time('lateral_join');
    const { data, error } = await supabase.rpc('exec_readonly_sql', { 
        q: `
        SELECT count(*)
        FROM public.outbound_queue lb
        LEFT JOIN LATERAL (
          SELECT trim(lower(msh.status)) as status
          FROM public.messages m
          JOIN public.message_status_history msh ON msh.message_id = m.id
          WHERE m.conversation_id = lb.conversation_id
            AND m.sender_type IN ('ai', 'bot', 'assistant', 'system', 'agent', 'system_trigger')
          ORDER BY 
            CASE lower(msh.status)
              WHEN 'read' THEN 1
              WHEN 'lida' THEN 1
              WHEN 'converted' THEN 2
              WHEN 'delivered' THEN 3
              WHEN 'entregue' THEN 3
              WHEN 'sent' THEN 4
              WHEN 'enviada' THEN 4
              ELSE 5
            END ASC, msh.created_at DESC
          LIMIT 1
      ) msh ON lb.conversation_id IS NOT NULL
        ` 
    });
    console.timeEnd('lateral_join');
    if (error) console.error(error);
    console.log(data);
}
test();
