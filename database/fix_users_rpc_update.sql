-- =============================================
-- FIX USERS UPDATE RPC
-- Issue: PGRST116 the RLS policies are preventing RETURNING the row correctly.
-- Solution: Create a SECURITY DEFINER RPC to bypass RLS for profile updates securely.
-- =============================================

CREATE OR REPLACE FUNCTION update_user_profile(
    p_user_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_user JSONB;
BEGIN
    -- Verify the caller is updating their own profile
    IF p_user_id != (SELECT id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users 
            WHERE provider_id = auth.uid()::text 
            AND role IN ('super_admin', 'tenant_admin')
        ) THEN
            RAISE EXCEPTION 'Acesso negado: Você só pode atualizar o seu próprio perfil.';
        END IF;
    END IF;

    -- Execute the update
    UPDATE public.users
    SET 
        full_name = COALESCE(p_full_name, full_name),
        email = COALESCE(p_email, email),
        avatar_url = COALESCE(p_avatar_url, avatar_url)
    WHERE id = p_user_id;

    -- Return the updated user object as JSON
    SELECT to_jsonb(u.*) INTO v_updated_user
    FROM public.users u
    WHERE id = p_user_id;

    RETURN v_updated_user;
END;
$$;
