-- ========================================================================================
-- FINANCIAL SYSTEM MOCK - EXTENDED TEST SUITE
-- ========================================================================================

-- 1. LIMPEZA TOTAL (Garante integridade dos dados novos)
DROP VIEW IF EXISTS public.mock_financial_view CASCADE;
DROP TABLE IF EXISTS public.mock_installments CASCADE;
DROP TABLE IF EXISTS public.mock_customers CASCADE;

CREATE TABLE public.mock_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf VARCHAR(14) UNIQUE NOT NULL, 
    name VARCHAR(255) NOT NULL,
    is_in_credit_bureau BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.mock_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_cpf VARCHAR(14) REFERENCES public.mock_customers(cpf) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    due_date DATE NOT NULL,
    original_value NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OVERDUE', 'PAID', 'NEGOTIATED')),
    paid_at DATE,
    paid_amount NUMERIC(10, 2),
    billet_url VARCHAR(500) DEFAULT 'https://nexus-mock.com/boleto-codigo-barras.pdf',
    barcode VARCHAR(100) DEFAULT '34191.09008 63571.277308 71444.640008 1 90000000000000',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. VIEW INTELIGENTE
CREATE OR REPLACE VIEW public.mock_financial_view AS
SELECT 
    i.id, i.customer_cpf, i.description, i.due_date, i.original_value, i.status, i.paid_at, i.paid_amount, i.billet_url, i.barcode,
    CASE WHEN CURRENT_DATE > i.due_date AND i.status IN ('PENDING', 'OVERDUE') THEN (CURRENT_DATE - i.due_date) ELSE 0 END AS days_overdue,
    CASE WHEN i.status IN ('PAID', 'NEGOTIATED') OR i.due_date >= CURRENT_DATE THEN 0 ELSE ROUND((i.original_value * 0.02), 2) END AS fine_amount,
    CASE WHEN i.status IN ('PAID', 'NEGOTIATED') OR i.due_date >= CURRENT_DATE THEN 0 ELSE ROUND((i.original_value * 0.00033 * (CURRENT_DATE - i.due_date)), 2) END AS interest_amount,
    CASE WHEN i.status IN ('PAID', 'NEGOTIATED') THEN 0 WHEN i.due_date >= CURRENT_DATE THEN i.original_value ELSE i.original_value + ROUND((i.original_value * 0.02), 2) + ROUND((i.original_value * 0.00033 * (CURRENT_DATE - i.due_date)), 2) END AS current_total_value
FROM public.mock_installments i;

-- 4. INSERT EXTENDED DATA (10 Personas com casos variados)
INSERT INTO public.mock_customers (cpf, name, is_in_credit_bureau) VALUES
('11111111111', 'João Controlado', FALSE),      -- Tudo ok
('22222222222', 'Maria da Crise', TRUE),        -- 3 atrasadas, Serasa
('33333333333', 'Carlos Transbordo', FALSE),    -- 1 atrasada muito antiga
('44444444444', 'Ana VencendoHoje', FALSE),     -- 1 vencendo hoje
('55555555555', 'Roberto Limpo', FALSE),        -- Sem dívidas
('66666666666', 'Julia Negociadora', TRUE),     -- Muitas dívidas prontas pra acordo
('77777777777', 'Marcos Misturado', FALSE),     -- Metade pago, metade pendente
('88888888888', 'Sandra Boleto', FALSE),        -- Cliente só quer 2a via
('99999999999', 'Ricardo HighValue', TRUE),     -- Dívida alta (R$ 15k)
('00000000000', 'Agente Teste', FALSE);         -- Reset rápido

-- Inserindo parcelas para as personas
INSERT INTO public.mock_installments (customer_cpf, description, due_date, original_value, status) VALUES
('11111111111', 'Financiamento Veículo 02/36', CURRENT_DATE + 15, 950.00, 'PENDING'),
('22222222222', 'Fatura Cartão Jan/26', '2026-01-10', 500.00, 'OVERDUE'),
('22222222222', 'Fatura Cartão Fev/26', '2026-02-10', 550.00, 'OVERDUE'),
('22222222222', 'Fatura Cartão Mar/26', CURRENT_DATE - 5, 480.00, 'OVERDUE'),
('33333333333', 'Empréstimo Pessoal v2025', '2025-10-05', 1200.00, 'OVERDUE'),
('44444444444', 'Internet Fibra', CURRENT_DATE, 119.90, 'PENDING'),
('66666666666', 'Parcela Imóvel 10/120', '2025-12-01', 2500.00, 'OVERDUE'),
('66666666666', 'Parcela Imóvel 11/120', '2026-01-01', 2500.00, 'OVERDUE'),
('66666666666', 'Parcela Imóvel 12/120', '2026-02-01', 2500.00, 'OVERDUE'),
('77777777777', 'Curso Inglês 04/12', CURRENT_DATE - 40, 300.00, 'OVERDUE'),
('77777777777', 'Curso Inglês 05/12', CURRENT_DATE + 20, 300.00, 'PENDING'),
('88888888888', 'Seguro Vida', CURRENT_DATE + 5, 89.90, 'PENDING'),
('99999999999', 'Taxa Condomínio Luxo', '2026-01-15', 15400.00, 'OVERDUE');

-- 5. RPC TOOLS (Mantendo compatibilidade V5)
CREATE OR REPLACE FUNCTION public.mock_get_customer_summary(p_cpf VARCHAR)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_customer RECORD; v_installments JSONB; v_clean_cpf VARCHAR;
BEGIN
    v_clean_cpf := regexp_replace(p_cpf, '\D', '', 'g');
    SELECT * INTO v_customer FROM public.mock_customers WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_cpf;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ERRO_CADASTRAL', 'detalhe', 'Cliente não encontrado.'); END IF;
    SELECT jsonb_agg(row_to_json(v)) INTO v_installments FROM (
        SELECT id, description, to_char(due_date, 'DD/MM/YYYY') as due_date_fmt, status, original_value, fine_amount, interest_amount, current_total_value, barcode, billet_url
        FROM public.mock_financial_view WHERE regexp_replace(customer_cpf, '\D', '', 'g') = v_clean_cpf ORDER BY due_date ASC
    ) v;
    RETURN jsonb_build_object(
        'cliente', jsonb_build_object('nome', v_customer.name, 'cpf', v_customer.cpf, 'restricao_serasa_spc', v_customer.is_in_credit_bureau),
        'faturas', COALESCE(v_installments, '[]'::jsonb),
        'resumo_financeiro', jsonb_build_object(
            'total_divida_atualizada', (SELECT COALESCE(SUM(current_total_value), 0) FROM public.mock_financial_view WHERE regexp_replace(customer_cpf, '\D', '', 'g') = v_clean_cpf AND status IN ('PENDING', 'OVERDUE')),
            'quantidade_atrasadas', (SELECT COUNT(*) FROM public.mock_financial_view WHERE regexp_replace(customer_cpf, '\D', '', 'g') = v_clean_cpf AND status = 'OVERDUE')
        )
    );
END; $$;

CREATE OR REPLACE FUNCTION public.mock_inform_payment(p_cpf VARCHAR, p_amount NUMERIC, p_due_date VARCHAR)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_inst RECORD; v_clean_cpf VARCHAR; v_parsed_date DATE;
BEGIN
    v_clean_cpf := regexp_replace(p_cpf, '\D', '', 'g');
    v_parsed_date := to_date(p_due_date, 'DD/MM/YYYY');
    SELECT * INTO v_inst FROM public.mock_financial_view WHERE regexp_replace(customer_cpf, '\D', '', 'g') = v_clean_cpf AND status IN ('PENDING', 'OVERDUE') AND due_date = v_parsed_date LIMIT 1;
    IF v_inst.id IS NOT NULL AND (ABS(v_inst.current_total_value - p_amount) <= 1.00 OR ABS(v_inst.original_value - p_amount) <= 1.00) THEN
        UPDATE public.mock_installments SET status = 'PAID', paid_at = CURRENT_DATE, paid_amount = p_amount WHERE id = v_inst.id;
        RETURN jsonb_build_object('sucesso', true, 'novo_status_atualizado', public.mock_get_customer_summary(p_cpf));
    END IF;
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fatura não encontrada ou valor divergente.');
END; $$;

CREATE OR REPLACE FUNCTION public.mock_renegotiate_debts(p_cpf VARCHAR, p_installments_count INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total_debt NUMERIC; v_new_val NUMERIC; v_clean_cpf VARCHAR; v_real_cpf VARCHAR;
BEGIN
    v_clean_cpf := regexp_replace(p_cpf, '\D', '', 'g');
    SELECT cpf INTO v_real_cpf FROM public.mock_customers WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_cpf;
    SELECT COALESCE(SUM(current_total_value), 0) INTO v_total_debt FROM public.mock_financial_view WHERE regexp_replace(customer_cpf, '\D', '', 'g') = v_clean_cpf AND status = 'OVERDUE';
    IF v_total_debt > 0 THEN
        UPDATE public.mock_installments SET status = 'NEGOTIATED' WHERE customer_cpf = v_real_cpf AND status = 'OVERDUE';
        UPDATE public.mock_customers SET is_in_credit_bureau = FALSE WHERE cpf = v_real_cpf;
        v_new_val := ROUND(v_total_debt / p_installments_count, 2);
        FOR i IN 1..p_installments_count LOOP
            INSERT INTO public.mock_installments (customer_cpf, description, due_date, original_value, status)
            VALUES (v_real_cpf, 'Acordo ' || i || '/' || p_installments_count, CURRENT_DATE + (i * 30 || ' days')::interval, v_new_val, 'PENDING');
        END LOOP;
        RETURN jsonb_build_object('sucesso', true, 'novo_status_atualizado', public.mock_get_customer_summary(p_cpf));
    END IF;
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Sem dívidas.');
END; $$;

GRANT EXECUTE ON FUNCTION public.mock_get_customer_summary(VARCHAR) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.mock_inform_payment(VARCHAR, NUMERIC, VARCHAR) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.mock_renegotiate_debts(VARCHAR, INT) TO authenticated, service_role, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_customers TO authenticated, service_role, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_installments TO authenticated, service_role, anon;
GRANT SELECT ON public.mock_financial_view TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
