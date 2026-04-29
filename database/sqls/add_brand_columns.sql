ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS brand_color character varying(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url character varying(1024);
