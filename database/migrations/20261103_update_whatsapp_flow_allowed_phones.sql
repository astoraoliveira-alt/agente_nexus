-- Migration: 20261103_update_whatsapp_flow_allowed_phones.sql
-- Description: Configura os 4 telefones de teste (Canary) e a flag global_rollout no Agente Comercial Fiserv (Novo)

UPDATE public.agents
SET workflow_blueprint = jsonb_set(
    jsonb_set(
        workflow_blueprint,
        '{whatsapp_flow,allowed_phones}',
        '["5511944941125", "5511981948599", "5511995269671", "5511993434870"]'::jsonb,
        true
    ),
    '{whatsapp_flow,global_rollout}',
    'false'::jsonb,
    true
)
WHERE name ILIKE '%Fiserv%Novo%';
