import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment not configured.');
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Validate the caller JWT using service role. This avoids relying on SUPABASE_ANON_KEY
    // being present in the function environment and is the most reliable way to validate
    // Authorization from a client request.
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    const authUser = authData.user;

    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const {
      email,
      fullName,
      tenantId,
      role = 'operator',
      profileId,
      redirectTo,
      userId,
    } = await req.json();

    if (!email || !fullName || !tenantId) {
      throw new Error('Missing required fields: email, fullName, tenantId');
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: requesterByProviderRows, error: requesterByProviderError } = await adminClient
      .from('users')
      .select('id, tenant_id, role, email, provider_id')
      .eq('provider_id', authUser.id);

    if (requesterByProviderError) {
      return new Response(JSON.stringify({
        error: `Error loading requester profile by provider_id: ${requesterByProviderError.message}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if ((requesterByProviderRows || []).length > 1) {
      return new Response(JSON.stringify({
        error: 'Duplicate business users found for requester provider_id. Resolve duplicate records in public.users.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      });
    }

    let requesterProfile = requesterByProviderRows?.[0] ?? null;

    if (!requesterProfile && authUser.email) {
      const normalizedRequesterEmail = authUser.email.trim().toLowerCase();
      const { data: requesterByEmail, error: requesterByEmailError } = await adminClient
        .from('users')
        .select('id, tenant_id, role, email, provider_id')
        .eq('email', normalizedRequesterEmail);

      if (requesterByEmailError) {
        return new Response(JSON.stringify({ error: 'Error loading requester profile by email.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      if ((requesterByEmail || []).length > 1) {
        return new Response(JSON.stringify({
          error: 'Duplicate business users found for requester email. Resolve the duplicate records in public.users first.',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        });
      }

      requesterProfile = requesterByEmail?.[0] ?? null;
    }

    if (!requesterProfile) {
      return new Response(JSON.stringify({ error: 'Requester profile not found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const isSuperAdmin = requesterProfile.role === 'super_admin';
    const isTenantAdmin = requesterProfile.role === 'tenant_admin' && requesterProfile.tenant_id === tenantId;

    if (!isSuperAdmin && !isTenantAdmin) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions to invite users for this tenant.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const inviteResult = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: redirectTo || `${new URL(req.url).origin.replace('.functions.supabase.co', '.supabase.co')}/set-password`,
      data: {
        tenant_id: tenantId,
        role,
        full_name: fullName,
      },
    });

    if (inviteResult.error) {
      throw inviteResult.error;
    }

    const invitedAuthUser = inviteResult.data.user;
    const payload = {
      tenant_id: tenantId,
      email: normalizedEmail,
      full_name: fullName,
      role,
      profile_id: profileId ?? null,
      provider: 'supabase',
      provider_id: invitedAuthUser?.id ?? null,
      status: 'invited',
      is_active: true,
      owner_id: requesterProfile.id,
    };

    let businessUser: any = null;

    if (userId) {
        const { data, error } = await adminClient
        .from('users')
        .update(payload)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      businessUser = data;
    } else {
      const { data: existingUser } = await adminClient
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingUser?.id) {
        const { data, error } = await adminClient
          .from('users')
          .update(payload)
          .eq('id', existingUser.id)
          .select()
          .single();

        if (error) throw error;
        businessUser = data;
      } else {
        const { data, error } = await adminClient
          .from('users')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        businessUser = data;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Invitation sent successfully.',
      data: {
        id: businessUser.id,
        name: businessUser.full_name,
        email: businessUser.email,
        role: businessUser.role,
        profile_id: businessUser.profile_id,
        tenantId: businessUser.tenant_id,
        isActive: businessUser.is_active,
        provider_id: businessUser.provider_id,
        provider: businessUser.provider,
        status: businessUser.status,
        owner_id: businessUser.owner_id,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('invite-user error:', error);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unexpected error',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
