import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type BusinessUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  tenant_id: string | null;
  provider_id: string | null;
  status: string | null;
  is_active: boolean | null;
  provider?: string | null;
  owner_id?: string | null;
  created_at?: string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function pickCandidate(rows: BusinessUserRow[], providerId: string): BusinessUserRow {
  const sorted = [...rows].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });

  const exactProvider = sorted.find((row) => row.provider_id === providerId);
  if (exactProvider) return exactProvider;

  const invitedOrPending = sorted.find((row) => ['invited', 'pending'].includes(String(row.status || '')));
  if (invitedOrPending) return invitedOrPending;

  const withoutProvider = sorted.find((row) => !row.provider_id);
  if (withoutProvider) return withoutProvider;

  return sorted[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase environment not configured.');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const authUser = authData.user;
    const providerId = authUser.id;
    const email = authUser.email ? normalizeEmail(authUser.email) : null;
    if (!email) {
      return new Response(JSON.stringify({ error: 'Auth user email not available.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 1) If already linked by provider_id, return it
    const { data: byProviderRows, error: byProviderError } = await adminClient
      .from('users')
      .select('*')
      .eq('provider_id', providerId);

    if (byProviderError) {
      return new Response(JSON.stringify({ error: `Error loading business user by provider_id: ${byProviderError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if ((byProviderRows || []).length > 1) {
      return new Response(JSON.stringify({ error: 'Duplicate business users found for this provider_id.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      });
    }

    if ((byProviderRows || []).length === 1) {
      const u = byProviderRows[0] as BusinessUserRow;
      return new Response(JSON.stringify({ success: true, data: u }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2) Try linking by email (invited/pending/legacy)
    const { data: byEmailRows, error: byEmailError } = await adminClient
      .from('users')
      .select('*')
      .eq('email', email);

    if (byEmailError) {
      return new Response(JSON.stringify({ error: `Error loading business user by email: ${byEmailError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!byEmailRows || byEmailRows.length === 0) {
      return new Response(JSON.stringify({ error: 'Business user record not found for this email.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    if (byEmailRows.length > 1) {
      return new Response(JSON.stringify({ error: 'Duplicate business users found for this email. Resolve duplicates in public.users.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      });
    }

    const candidate = pickCandidate(byEmailRows as BusinessUserRow[], providerId);

    const currentStatus = String(candidate.status || '');
    const nextStatus = currentStatus === 'invited'
      ? 'active'
      : currentStatus === 'pending'
        ? 'pending'
        : currentStatus || 'active';
    const nextIsActive = nextStatus === 'active';
    const { data: updated, error: updateError } = await adminClient
      .from('users')
      .update({ provider_id: providerId, provider: 'supabase', status: nextStatus, is_active: nextIsActive })
      .eq('id', candidate.id)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: `Error linking business user: ${updateError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    return new Response(JSON.stringify({ success: true, data: updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('ensure-business-user error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
