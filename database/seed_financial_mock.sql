-- ========================================================================================
-- FINANCIAL SYSTEM MOCK - SANDBOX ENVIRONMENT FOR AGENT TESTING
-- Description: Creates a stateful simulation layer for testing financial AI workflows.
-- ========================================================================================

-- 1. CLEANUP PREVIOUS MOCKS
DROP VIEW IF EXISTS mock_financial_view CASCADE;
DROP TABLE IF EXISTS mock_installments CASCADE;
DROP TABLE IF EXISTS mock_customers CASCADE;

-- 2. CREATE ISOLATED TABLES
CREATE TABLE mock_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf VARCHAR(14) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_in_credit_bureau BOOLEAN DEFAULT FALSE, -- FLAG 4: Orgãos de proteção
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE mock_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_cpf VARCHAR(14) REFERENCES mock_customers(cpf) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    due_date DATE NOT NULL,
    original_value NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OVERDUE', 'PAID', 'NEGOTIATED')), -- FLAG 1: Várias posições
    paid_at DATE,
    paid_amount NUMERIC(10, 2),
    billet_url VARCHAR(500) DEFAULT 'https://nexus-mock.com/boleto-codigo-barras.pdf', -- FLAG 6: 2ª via de boleto
    barcode VARCHAR(100) DEFAULT '34191.09008 63571.277308 71444.640008 1 90000000000000',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. SMART VIEW: DYNAMIC CALCULATION OF FINES AND INTEREST (FLAG 2)
CREATE OR REPLACE VIEW mock_financial_view AS
SELECT 
    i.id,
    i.customer_cpf,
    i.description,
    i.due_date,
    i.original_value,
    i.status,
    i.paid_at,
    i.paid_amount,
    i.billet_url,
    i.barcode,
    CASE WHEN CURRENT_DATE > i.due_date AND i.status IN ('PENDING', 'OVERDUE') 
         THEN (CURRENT_DATE - i.due_date) 
         ELSE 0 END AS days_overdue,
    -- Multa atraso fixada em 2%
    CASE 
        WHEN i.status IN ('PAID', 'NEGOTIATED') THEN 0
        WHEN i.due_date >= CURRENT_DATE THEN 0
        ELSE ROUND((i.original_value * 0.02), 2) 
    END AS fine_amount,
    -- Juros atraso dia (1% ao mes = ~0.033% ao dia)
    CASE 
        WHEN i.status IN ('PAID', 'NEGOTIATED') THEN 0
        WHEN i.due_date >= CURRENT_DATE THEN 0
        ELSE ROUND((i.original_value * 0.00033 * (CURRENT_DATE - i.due_date)), 2) 
    END AS interest_amount,
    -- Valor total atualizado
    CASE 
        WHEN i.status IN ('PAID', 'NEGOTIATED') THEN 0
        WHEN i.due_date >= CURRENT_DATE THEN i.original_value
        ELSE i.original_value + ROUND((i.original_value * 0.02), 2) + ROUND((i.original_value * 0.00033 * (CURRENT_DATE - i.due_date)), 2)
    END AS current_total_value
FROM mock_installments i;

-- 4. INSERT "PERSONAS" DATA
INSERT INTO mock_customers (cpf, name, is_in_credit_bureau) VALUES
('111.111.111-11', 'João Controlado', FALSE), -- Persona 1: Cliente regular, só quer pagar a parcela do mes
('222.222.222-22', 'Maria da Crise', TRUE),   -- Persona 2: Devendo muito, no Serasa, quer renegociar
('333.333.333-33', 'Carlos do Transbordo', FALSE); -- Persona 3: Fraude/Inconsistência (Para a IA pedir humano)

-- Faturas do João (1 Paga, 1 Pendente a vencer)
INSERT INTO mock_installments (customer_cpf, description, due_date, original_value, status, paid_at, paid_amount) VALUES
('111.111.111-11', 'Financiamento Veículo - Parcela 1/36', CURRENT_DATE - INTERVAL '30 days', 950.00, 'PAID', CURRENT_DATE - INTERVAL '31 days', 950.00),
('111.111.111-11', 'Financiamento Veículo - Parcela 2/36', CURRENT_DATE + INTERVAL '5 days', 950.00, 'PENDING', NULL, NULL);

-- Faturas da Maria (3 Vencidas)
INSERT INTO mock_installments (customer_cpf, description, due_date, original_value, status) VALUES
('222.222.222-22', 'Empréstimo Pessoal - Parcela 5/24', CURRENT_DATE - INTERVAL '90 days', 450.00, 'OVERDUE'),
('222.222.222-22', 'Empréstimo Pessoal - Parcela 6/24', CURRENT_DATE - INTERVAL '60 days', 450.00, 'OVERDUE'),
('222.222.222-22', 'Empréstimo Pessoal - Parcela 7/24', CURRENT_DATE - INTERVAL '30 days', 450.00, 'OVERDUE');

-- Faturas do Carlos (Para cenários confusos)
INSERT INTO mock_installments (customer_cpf, description, due_date, original_value, status) VALUES
('333.333.333-33', 'Consórcio Moto - Parcela 12/48', CURRENT_DATE - INTERVAL '15 days', 320.00, 'OVERDUE');


-- ========================================================================================
-- AGENT TOOLS (RPCs that the N8N will call via Webhook/Database Module)
-- ========================================================================================

-- TOOL 1: GET FINANCIAL SUMMARY (Busca cpf, valida serasa, traz juros, boletos e parcelas)
CREATE OR REPLACE FUNCTION mock_get_customer_summary(p_cpf VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer RECORD;
    v_installments JSONB;
BEGIN
    SELECT * INTO v_customer FROM mock_customers WHERE cpf = p_cpf;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'ERRO_CADASTRAL', 'detalhe', 'Cliente não encontrado com o CPF informado. Transfira para um operador humano devido a inconsistência.');
    END IF;

    SELECT jsonb_agg(row_to_json(v)) INTO v_installments
    FROM (
        SELECT id, description, to_char(due_date, 'DD/MM/YYYY') as due_date_fmt, status, original_value, fine_amount, interest_amount, current_total_value, barcode, billet_url
        FROM mock_financial_view
        WHERE customer_cpf = p_cpf
        ORDER BY due_date ASC
    ) v;

    RETURN jsonb_build_object(
        'cliente', jsonb_build_object(
            'nome', v_customer.name,
            'cpf', v_customer.cpf,
            'restricao_serasa_spc', v_customer.is_in_credit_bureau
        ),
        'faturas', COALESCE(v_installments, '[]'::jsonb),
        'resumo_financeiro', jsonb_build_object(
            'total_divida_atualizada_em_aberto', (SELECT COALESCE(SUM(current_total_value), 0) FROM mock_financial_view WHERE customer_cpf = p_cpf AND status IN ('PENDING', 'OVERDUE')),
            'quantidade_faturas_atrasadas', (SELECT COUNT(*) FROM mock_financial_view WHERE customer_cpf = p_cpf AND status = 'OVERDUE')
        )
    );
END;
$$;

-- TOOL 2: CHECK PAYMENT (FLAG 5: O cliente pagou e pede a baixa. A IA confere se o valor bate e da baixa manual)
CREATE OR REPLACE FUNCTION mock_inform_payment(p_cpf VARCHAR, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_installment RECORD;
BEGIN
    -- Busca uma parcela em aberto cujo valor atual (com juros) ou valor original seja "igual" ao informado 
    -- Pela IA/Cliente (com tolerância de 1 real pra não quebrar por arredondamento)
    SELECT * INTO v_installment
    FROM mock_financial_view
    WHERE customer_cpf = p_cpf 
      AND status IN ('PENDING', 'OVERDUE')
      AND (ABS(current_total_value - p_amount) <= 1.00 OR ABS(original_value - p_amount) <= 1.00)
    ORDER BY due_date ASC
    LIMIT 1;

    IF v_installment.id IS NOT NULL THEN
        -- BAIXA NO SISTEMA! Stateful magic. 
        UPDATE mock_installments 
        SET status = 'PAID', paid_at = CURRENT_DATE, paid_amount = p_amount
        WHERE id = v_installment.id;
        
        RETURN jsonb_build_object(
            'sucesso', true, 
            'mensagem', 'Pagamento reconciliado no sistema! A faturada ' || v_installment.description || ' consta como PAGA agora no nosso DB.',
            'fatura_id', v_installment.id
        );
    ELSE
        -- Simula o cenário onde o cliente fala "Paguei 300" e não tem nenhuma fatura de 300 reais.
        RETURN jsonb_build_object(
            'sucesso', false, 
            'acao_sugerida', 'transbordo_humano',
            'mensagem', 'Não localizamos nenhuma parcela em aberto com o valor exato de R$ ' || p_amount || ' para dar baixa. Peça comprovante e envie para o operador humano analisar.'
        );
    END IF;
END;
$$;

-- TOOL 3: RENEGOTIATE DEBTS (FLAG 3: Renegociação e remoção Serasa)
CREATE OR REPLACE FUNCTION mock_renegotiate_debts(p_cpf VARCHAR, p_installments_count INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_debt NUMERIC;
    v_new_installment_value NUMERIC;
    i INT;
BEGIN
    -- Verifica o total da dívida
    SELECT COALESCE(SUM(current_total_value), 0) INTO v_total_debt
    FROM mock_financial_view 
    WHERE customer_cpf = p_cpf AND status = 'OVERDUE';

    IF v_total_debt = 0 THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'O cliente não possui parcelas vencidas qualificáveis para este plano de renegociação.');
    END IF;

    -- Marca faturas antigas como "Acordadas/Negociadas"
    UPDATE mock_installments
    SET status = 'NEGOTIATED'
    WHERE customer_cpf = p_cpf AND status = 'OVERDUE';

    -- Remove do Serasa imediatamente (Demonstração de integração real)
    UPDATE mock_customers SET is_in_credit_bureau = FALSE WHERE cpf = p_cpf;

    -- Cria Novas Parcelas parceladas
    v_new_installment_value := ROUND(v_total_debt / p_installments_count, 2);

    FOR i IN 1..p_installments_count LOOP
        INSERT INTO mock_installments (customer_cpf, description, due_date, original_value, status)
        VALUES (
            p_cpf, 
            'Acordo de Dívida - Parcela ' || i || '/' || p_installments_count, 
            CURRENT_DATE + (i * 30 || ' days')::interval, -- Cria o vencimento de 30 em 30 dias a partir de hoje
            v_new_installment_value, 
            'PENDING'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'sucesso', true, 
        'mensagem_tecnica', 'Dívida consolidada e renegociada com sucesso.',
        'resumo_para_o_cliente', 'Sua dívida total de R$ ' || v_total_debt || ' foi renegociada em ' || p_installments_count || ' parcelas fixas de R$ ' || v_new_installment_value || '. Os órgãos de restrição de crédito (como Serasa) serão notificados instantaneamente sobre o acordo.'
    );
END;
$$;

-- ATRIBUIÇÃO DE PERMISSÕES PARA A API PODER CHAMAR ISSO
GRANT EXECUTE ON FUNCTION mock_get_customer_summary(VARCHAR) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION mock_inform_payment(VARCHAR, NUMERIC) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION mock_renegotiate_debts(VARCHAR, INT) TO authenticated, service_role, anon;
GRANT SELECT ON mock_financial_view TO authenticated, service_role, anon;
