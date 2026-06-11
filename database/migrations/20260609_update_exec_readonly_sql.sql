-- Update exec_readonly_sql to support EXPLAIN statements directly
CREATE OR REPLACE FUNCTION public.exec_readonly_sql(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Restrict execution permissions to only SELECT by switching to nexus_readonly role
  PERFORM set_config('role', 'nexus_readonly', true);
  
  -- Force statement timeout to protect database resources (5 seconds)
  PERFORM set_config('statement_timeout', '5000', true);

  -- Execute query directly if it is an EXPLAIN, otherwise aggregate SELECT results to JSON
  IF q ILIKE 'explain%' THEN
    EXECUTE q INTO v_result;
  ELSE
    EXECUTE 'SELECT coalesce(json_agg(t), ''[]''::jsonb) FROM (' || q || ') t' INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$$;
