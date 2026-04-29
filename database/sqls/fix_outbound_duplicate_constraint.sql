-- Adicionar restrição de unicidade para evitar duplicatas de telefone na mesma campanha
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_campaign_phone' 
        AND table_name = 'outbound_queue'
    ) THEN
        ALTER TABLE public.outbound_queue 
        ADD CONSTRAINT unique_campaign_phone UNIQUE (campaign_id, contact_phone);
    END IF;
END $$;
