import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function test() {
    console.time('sync');
    const { data, error } = await supabase.rpc('exec_sql', { 
        q: `
        EXPLAIN 
        UPDATE public.outbound_queue oq
        SET status = best_status.status
        FROM (
          SELECT m.conversation_id,
                 trim(lower(msh.status)) as status,
                 ROW_NUMBER() OVER(PARTITION BY m.conversation_id ORDER BY 
                    CASE lower(msh.status)
                      WHEN 'read' THEN 1
                      WHEN 'lida' THEN 1
                      WHEN 'converted' THEN 2
                      WHEN 'delivered' THEN 3
                      WHEN 'entregue' THEN 3
                      WHEN 'sent' THEN 4
                      WHEN 'enviada' THEN 4
                      ELSE 5
                    END ASC, msh.created_at DESC) as rn
          FROM public.messages m
          JOIN public.message_status_history msh ON msh.message_id = m.id
          WHERE m.sender_type IN ('ai', 'bot', 'assistant', 'system', 'agent', 'system_trigger')
        ) best_status
        WHERE best_status.rn = 1
          AND best_status.conversation_id = oq.conversation_id
          AND lower(oq.status) != lower(best_status.status)
          AND oq.created_at >= '2026-06-01';
        ` 
    });
    console.timeEnd('sync');
    if (error) console.error(error);
    console.log(data);
}
test();
