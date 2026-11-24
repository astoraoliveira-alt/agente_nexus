import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ZENVIA_TOKEN = "RzWJ6TUddARV5tgPEqyk9qTS8af5WnXQutg7";
const ZENVIA_FROM = "551151183815";
const TENANT_ID = "d290f1ee-6c54-4b01-90e6-d701748f0851";

async function sendZenvia(item: any) {
  const contents =
    item.kind === "template"
      ? [{ type: "template", templateId: item.template_id, fields: {} }]
      : [{ type: "text", text: item.message_text }];

  const res = await fetch("https://api.zenvia.com/v2/channels/whatsapp/messages", {
    method: "POST",
    headers: {
      "X-API-TOKEN": ZENVIA_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ZENVIA_FROM,
      to: item.phone,
      contents,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey);

  const { data: batch, error: claimErr } = await sb.rpc("claim_reengage_batch", {
    p_limit: 400,
  });

  if (claimErr) {
    return new Response(JSON.stringify({ ok: false, error: claimErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!batch || batch.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let sentCount = 0;
  let failedCount = 0;
  const CONCURRENCY = 25;

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (item: any) => {
        try {
          const res = await sendZenvia(item);
          if (res.ok) {
            sentCount++;
            if (item.conversation_id) {
              await sb.from("messages").insert({
                conversation_id: item.conversation_id,
                tenant_id: TENANT_ID,
                direction: "outbound",
                sender_type: "ai",
                message_type: "text",
                content: item.message_text,
              });
            }
            await sb
              .from("reengage_batch_queue")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("id", item.id);
          } else {
            failedCount++;
            await sb
              .from("reengage_batch_queue")
              .update({
                status: "failed",
                error: `HTTP ${res.status}: ${res.body.slice(0, 200)}`,
              })
              .eq("id", item.id);
          }
        } catch (err: any) {
          failedCount++;
          await sb
            .from("reengage_batch_queue")
            .update({
              status: "failed",
              error: String(err?.message || err).slice(0, 200),
            })
            .eq("id", item.id);
        }
      })
    );
  }

  return new Response(
    JSON.stringify({ ok: true, processed: batch.length, sent: sentCount, failed: failedCount }),
    { headers: { "Content-Type": "application/json" } }
  );
});
