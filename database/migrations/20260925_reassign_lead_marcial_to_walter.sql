-- ======================================================================================
-- MIGRATION: 20260925_reassign_lead_marcial_to_walter.sql
-- OBJETIVO: Apenas mudar o operador do Lead 'MARCIAL FARIA GONCALVES LTDA' para o Walter.
-- ======================================================================================

DO $$
DECLARE
    v_walter_id UUID;
    v_walter_name TEXT := 'Walter Bereska';
    v_conv_count INT := 0;
    v_lead_count INT := 0;
BEGIN
    -- 1. Localizar o operador Walter
    SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), 'Walter Bereska')
    INTO v_walter_id, v_walter_name
    FROM public.users
    WHERE (full_name ILIKE '%Walter%' OR email ILIKE '%walter%')
    ORDER BY created_at ASC
    LIMIT 1;

    -- Se não encontrar em public.users, tentar auth.users
    IF v_walter_id IS NULL THEN
        BEGIN
            SELECT id, 'Walter Bereska'
            INTO v_walter_id, v_walter_name
            FROM auth.users
            WHERE email ILIKE '%walter%'
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RAISE NOTICE 'Operador selecionado: % (ID: %)', v_walter_name, COALESCE(v_walter_id::text, 'sem id');

    -- 2. Atualizar o operador na conversa
    WITH updated_conv AS (
        UPDATE public.conversations
        SET 
            assigned_operator_id = v_walter_id,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'operator_name', v_walter_name,
                'operator_id', v_walter_id,
                'assigned_operator', v_walter_name
            )
        WHERE 
            REGEXP_REPLACE(COALESCE(user_identifier, ''), '\D', '', 'g') IN ('5564996767961', '64996767961', '556496767961', '6496767961')
            OR user_name ILIKE '%MARCIAL FARIA GONCALVES%'
        RETURNING id
    )
    SELECT count(*) INTO v_conv_count FROM updated_conv;

    -- 3. Atualizar o operador em agent_leads (usando identifier, whatsapp ou metadata)
    WITH updated_lead AS (
        UPDATE public.agent_leads
        SET 
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'operator_name', v_walter_name,
                'operator_id', v_walter_id,
                'assigned_operator', v_walter_name
            )
        WHERE 
            REGEXP_REPLACE(COALESCE(metadata->>'cnpj', ''), '\D', '', 'g') = '08842101000111'
            OR REGEXP_REPLACE(COALESCE(identifier, ''), '\D', '', 'g') IN ('08842101000111', '5564996767961', '64996767961')
            OR REGEXP_REPLACE(COALESCE(whatsapp, ''), '\D', '', 'g') IN ('5564996767961', '64996767961', '556496767961', '6496767961')
            OR name ILIKE '%MARCIAL FARIA GONCALVES%'
        RETURNING id
    )
    SELECT count(*) INTO v_lead_count FROM updated_lead;

    RAISE NOTICE 'Conversas atualizadas: % | Leads atualizados: %', v_conv_count, v_lead_count;
END $$;
