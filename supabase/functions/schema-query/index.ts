import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { question, build, viewId, tenantId } = body;

    if (!viewId || !tenantId) {
      throw new Error("Missing viewId or tenantId");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify token & enforce RLS
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Unauthorized: Missing Authorization header");
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Unauthorized: Invalid session");
    }

    // Load View Configuration (using userClient for RLS safety)
    const userClient = createClient(supabaseUrl, supabaseAnonKeyOrServiceRole(), {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: cfg, error: cfgError } = await userClient
      .from('schema_view_config')
      .select('*')
      .eq('id', viewId)
      .single();

    if (cfgError || !cfg) {
      throw new Error(`Failed to load view config: ${cfgError?.message || 'Not found'}`);
    }

    // Introspect schema for allowed tables (getting column list for AST mapping)
    const { introspectedColumns, ddl, introRows, introError } = await introspectSchema(userClient, cfg.allowed_tables, cfg.denied_columns);

    // 1. Get the SQL query
    let sql = '';
    if (build) {
      sql = await buildSqlFromSelection(userClient, build, cfg);
    } else if (question) {
      sql = await generateSqlFromLlm(question, ddl, cfg);
    } else {
      throw new Error("Request must contain either 'question' or 'build' payload");
    }

    sql = sql.trim().replace(/;+$/, '');

    // 2. Strict guardrails validation
    assertReadOnly(sql, cfg);

    // 3. Extract tables, columns, and joins used (using EXPLAIN VERBOSE + AST analyzer)
    const { tables_used, columns_used, joins, explainRows, explainError } = await usageFromSql(userClient, sql, introspectedColumns);

    // 4. Detect RPCs and merge usage
    const rpcs_used = detectRpcs(sql, cfg.allowed_rpcs);
    for (const r of rpcs_used) {
      const rpcDef = cfg.rpc_map[r];
      if (rpcDef) {
        if (rpcDef.tables) {
          for (const tbl of rpcDef.tables) {
            if (!tables_used.includes(tbl)) tables_used.push(tbl);
          }
        }
        if (rpcDef.columns) {
          for (const [tbl, cols] of Object.entries(rpcDef.columns)) {
            if (!columns_used[tbl]) columns_used[tbl] = [];
            const rpcCols = cols as string[];
            for (const col of rpcCols) {
              if (!columns_used[tbl].includes(col)) {
                columns_used[tbl].push(col);
              }
            }
          }
        }
      }
    }

    // 5. Execute read-only SQL via user client (which propagates RLS tenant context)
    const { data: rows, error: execError } = await userClient.rpc('exec_readonly_sql', { q: sql });
    if (execError) {
      console.error("Execution failed for SQL:", sql);
      throw new Error(`${execError.message} (SQL: ${sql})`);
    }

    // 6. Summarize results
    let answer = '';
    if (question) {
      answer = await summarizeResults(question, rows);
    } else {
      answer = summarizeBuilderResults(build, rows, cfg);
    }

    return new Response(
      JSON.stringify({ answer, sql, tables_used, columns_used, rpcs_used, joins, rows, debug: { explainRows, explainError, introspectedColumns, introRows, introError } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error in schema-query handler:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function supabaseAnonKeyOrServiceRole(): string {
  return Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

// Schema introspection helper
async function introspectSchema(
  supabaseClient: any, 
  allowedTables: string[], 
  deniedColumns: string[]
): Promise<{ introspectedColumns: Record<string, string[]>, ddl: string, introRows?: any, introError?: any }> {
  const sql = `
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(ARRAY[${allowedTables.map(t => `'${t}'`).join(', ')}])
  `;
  const { data: rows, error } = await supabaseClient.rpc('exec_readonly_sql', { q: sql });
  if (error || !rows) {
    console.error('Error introspecting schema:', error);
    return { introspectedColumns: {}, ddl: '', introRows: rows, introError: error };
  }

  const introspectedColumns: Record<string, string[]> = {};
  const tableMap: Record<string, string[]> = {};

  for (const row of rows) {
    const tableName = row.table_name;
    const colName = row.column_name;
    const colType = row.data_type;
    const nullable = row.is_nullable === 'YES' ? '' : ' NOT NULL';

    if (deniedColumns.includes(`${tableName}.${colName}`)) {
      continue;
    }

    if (!introspectedColumns[tableName]) introspectedColumns[tableName] = [];
    introspectedColumns[tableName].push(colName);

    if (!tableMap[tableName]) tableMap[tableName] = [];
    tableMap[tableName].push(`  ${colName} ${colType}${nullable}`);
  }

  let ddl = '';
  for (const [table, cols] of Object.entries(tableMap)) {
    ddl += `CREATE TABLE public.${table} (\n${cols.join(',\n')}\n);\n\n`;
  }

  return { introspectedColumns, ddl, introRows: rows, introError: error };
}

// SQL Builder for Click-to-query mode
async function buildSqlFromSelection(supabaseClient: any, buildReq: any, cfg: any): Promise<string> {
  const fields = buildReq.fields;
  const aggregation = buildReq.aggregation;
  const tables = [...new Set(fields.map((f: any) => f.table))];

  for (const f of fields) {
    if (cfg.denied_columns.includes(`${f.table}.${f.column}`)) {
      throw new Error(`Acesso negado à coluna restrita: ${f.table}.${f.column}`);
    }
  }

  const aggMap: Record<string, string> = {
    sum: "sum(%s)",
    avg: "round(avg(%s),1)",
    count: "count(%s)"
  };

  if (tables.length === 1) {
    const table = tables[0];
    const selectExpr = fields.map((f: any) => {
      if (aggregation === 'count') {
        return `count(${f.column}) as count_${f.column}`;
      } else if (aggregation && aggMap[aggregation]) {
        return `${aggMap[aggregation].replace('%s', f.column)} as ${aggregation}_${f.column}`;
      } else {
        return f.column;
      }
    }).join(', ');
    return `SELECT ${selectExpr} FROM public.${table};`;
  } else if (tables.length === 2) {
    const [a, b] = tables;
    const relExpr = await resolveFkCondition(supabaseClient, a, b);
    
    const target = fields.find((f: any) => f.table === b) || fields[0];
    
    let selectExpr = '';
    if (aggregation === 'count') {
      selectExpr = 'count(*) as total_count';
    } else if (aggregation && aggMap[aggregation]) {
      selectExpr = `${aggMap[aggregation].replace('%s', `${target.table}.${target.column}`)} as ${aggregation}_${target.column}`;
    } else {
      selectExpr = fields.map((f: any) => `${f.table}.${f.column}`).join(', ');
    }
    return `SELECT ${selectExpr} FROM public.${a} JOIN public.${b} ON ${relExpr};`;
  } else {
    throw new Error("Agrupamento de builder com 3 ou mais tabelas não é suportado.");
  }
}

// Helper to resolve Foreign Key relationship conditions
async function resolveFkCondition(supabaseClient: any, a: string, b: string): Promise<string> {
  const sql = `
    SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column
    FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (
        (tc.table_name = '${a}' AND ccu.table_name = '${b}')
        OR
        (tc.table_name = '${b}' AND ccu.table_name = '${a}')
      )
    LIMIT 1;
  `;
  const { data: rows, error } = await supabaseClient.rpc('exec_readonly_sql', { q: sql });
  if (error || !rows || rows.length === 0) {
    const fallbackRels: Record<string, string> = {
      'campaigns-agents': 'campaigns.agent_id = agents.id',
      'agents-campaigns': 'campaigns.agent_id = agents.id',
      'conversations-agents': 'conversations.agent_id = agents.id',
      'agents-conversations': 'conversations.agent_id = agents.id',
      'messages-conversations': 'messages.conversation_id = conversations.id',
      'conversations-messages': 'messages.conversation_id = conversations.id',
      'contacts-conversations': 'contacts.tenant_id = conversations.tenant_id',
      'conversations-contacts': 'contacts.tenant_id = conversations.tenant_id'
    };
    const key = `${a}-${b}`;
    if (fallbackRels[key]) return fallbackRels[key];
    const revKey = `${b}-${a}`;
    if (fallbackRels[revKey]) return fallbackRels[revKey];

    throw new Error(`Não foi possível determinar relacionamento entre ${a} e ${b}.`);
  }
  const fk = rows[0];
  return `${fk.from_table}.${fk.from_column} = ${fk.to_table}.${fk.to_column}`;
}

// LLM SQL generator call
async function generateSqlFromLlm(question: string, ddl: string, cfg: any): Promise<string> {
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    throw new Error("OpenAI API key not configured on backend");
  }

  const systemPrompt = `
You are a PostgreSQL expert database agent.
Generate a valid PostgreSQL SELECT query based on the database schema and aliases provided below.
Return ONLY the raw SQL code. Do NOT enclose in markdown blocks (e.g. no \`\`\`sql) and do NOT provide any explanation.

SCHEMA DDL:
${ddl}

SEMANTIC ALIASES:
${JSON.stringify(cfg.mappings, null, 2)}

INSTRUCTIONS:
1. ONLY generate SELECT queries.
2. Only use the tables in the schema: ${cfg.allowed_tables.join(', ')}.
3. DO NOT select denied columns: ${cfg.denied_columns.join(', ')}.
4. If joining tables, use correct foreign keys.
5. Limit the results to a maximum of 100 rows.
6. CRITICAL: Never translate status enum values or lookup terms to Portuguese in your WHERE filters. Always use English database values. Note that campaigns use status values 'active', 'paused', 'completed'; agents use status 'active', 'inactive'; conversations use status 'open', 'pending', 'closed'. Never translate these to Portuguese (e.g. do not use 'Ativa', 'Pendente', 'Aberta', etc.).
7. CRITICAL ALIAS RULE: Pay extreme attention to table aliases. If you alias 'public.campaigns' as 'ca', then EVERY column from campaigns MUST be prefixed with 'ca.' (e.g. 'ca.conversion_count'). If you alias it as 'c', then use 'c.conversion_count'. Never reference 'c.conversion_count' if you wrote 'public.campaigns ca'.
8. CRITICAL COLUMN RULE: 'conversion_count' (Conversões) is a column only in the 'campaigns' table. 'conversations' does NOT have 'conversion_count'. If asked for conversions, select or sum 'conversion_count' from the 'campaigns' table (using its exact declared alias). Do not join 'conversations' unless the query explicitly requires conversation details.
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${errorText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

// SQL Query summarizer
async function summarizeResults(question: string, rows: any[]): Promise<string> {
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    throw new Error("OpenAI API key not configured on backend");
  }

  const systemPrompt = `
You are a helpful business analytics assistant.
Summarize the data returned from the database to answer the user's question.
Return the response in markdown. Keep it concise (1-3 sentences) and emphasize key metrics in bold.
Original Question: "${question}"
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(rows, null, 2) }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${errorText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

// Autogenerated summary for builder queries
function summarizeBuilderResults(buildReq: any, rows: any[], cfg: any): string {
  if (rows.length === 0) return "Nenhum resultado encontrado.";
  
  const aggregation = buildReq.aggregation || 'list';
  const fields = buildReq.fields;
  
  const getFieldLabel = (table: string, column: string) => {
    return cfg.mappings[table]?.columns[column] || `${table}.${column}`;
  };

  const tableLabel = cfg.mappings[fields[0].table]?.label || fields[0].table;

  if (aggregation === 'count') {
    const val = Object.values(rows[0])[0];
    return `Contagem de registros em **${tableLabel}**: **${val}**.`;
  }

  if (aggregation === 'sum' || aggregation === 'avg') {
    const val = Object.values(rows[0])[0];
    const actionLabel = aggregation === 'sum' ? 'Total' : 'Média';
    const fieldLabel = getFieldLabel(fields[0].table, fields[0].column);
    return `${actionLabel} de **${fieldLabel}** em **${tableLabel}**: **${val}**.`;
  }

  return `Consulta finalizada com sucesso! Retornados **${rows.length}** registros de **${tableLabel}**.`;
}

// Security Guardrail: Parses SQL and checks rules via Regex
function assertReadOnly(sql: string, cfg: any) {
  const cleanSql = sql.trim().toLowerCase();

  // 1. Must start with SELECT or WITH ... SELECT
  if (!/^(with\s+.*\s+)?select\b/i.test(cleanSql)) {
    throw new Error("Apenas comandos SELECT são permitidos.");
  }

  // 2. Blacklist check for write keywords
  const blacklist = /\b(insert|update|delete|drop|alter|truncate|grant|copy|create|replace)\b/i;
  if (blacklist.test(cleanSql)) {
    throw new Error("Comando de modificação de dados ou DDL detectado e bloqueado.");
  }

  // 3. Allowed tables check
  // Extract words following FROM or JOIN
  const tableMatches = [...cleanSql.matchAll(/\b(from|join)\s+([a-zA-Z0-9_.]+)/gi)];
  for (const match of tableMatches) {
    const rawTable = match[2].replace(/[()]/g, '').trim();
    const table = rawTable.replace(/^public\./, '');
    
    // Skip checking RPC names
    if (cfg.allowed_rpcs.includes(table)) {
      continue;
    }
    
    if (!cfg.allowed_tables.includes(table)) {
      throw new Error(`Acesso negado: Tabela '${table}' não está na allow-list.`);
    }
  }

  // 4. Denied columns check
  for (const deniedCol of cfg.denied_columns) {
    const colName = deniedCol.split('.').pop()!;
    const regex = new RegExp(`\\b${colName}\\b`, 'i');
    if (regex.test(cleanSql)) {
      throw new Error(`Acesso negado à coluna restrita: ${colName}`);
    }
  }
}

// usage extractor via EXPLAIN VERBOSE
async function usageFromSql(supabaseClient: any, sql: string, introspectedColumns: Record<string, string[]>) {
  const tables_used: string[] = [];
  const columns_used: Record<string, string[]> = {};
  const joins: string[][] = [];
  let explainRows: any = null;
  let explainError: any = null;

  try {
    const explainSql = `EXPLAIN (VERBOSE, FORMAT JSON) ${sql}`;
    const res = await supabaseClient.rpc('exec_readonly_sql', { q: explainSql });
    explainRows = res.data;
    explainError = res.error;
    console.log("explainSql:", explainSql);
    console.log("explainError:", explainError);
    console.log("explainRows:", JSON.stringify(explainRows));
    
    if (!explainError && explainRows && explainRows.length > 0) {
      // explainRows is returned as an array of objects
      const rawPlan = explainRows[0];
      const plan = rawPlan?.["Plan"];
      
      const tablesUsedSet = new Set<string>();
      const columnsUsedMap: Record<string, Set<string>> = {};
      
      extractPlanInfo(plan, tablesUsedSet, columnsUsedMap, joins, introspectedColumns);
      
      // Convert sets back to arrays
      for (const table of tablesUsedSet) {
        tables_used.push(table);
        columns_used[table] = Array.from(columnsUsedMap[table] || []);
      }
    }
  } catch (err) {
    console.error("Failed to extract query usage via EXPLAIN:", err);
  }

  // Fallback: if explain failed, populate tables_used from SQL string directly
  if (tables_used.length === 0) {
    const cleanSql = sql.toLowerCase();
    const tableMatches = [...cleanSql.matchAll(/\b(from|join)\s+([a-zA-Z0-9_.]+)/gi)];
    for (const match of tableMatches) {
      const rawTable = match[2].replace(/[()]/g, '').trim().replace(/^public\./, '');
      if (introspectedColumns[rawTable] && !tables_used.includes(rawTable)) {
        tables_used.push(rawTable);
        columns_used[rawTable] = [];
      }
    }
  }

  return { tables_used, columns_used, joins, explainRows, explainError };
}

function extractPlanInfo(
  plan: any, 
  tablesUsed: Set<string>, 
  columnsUsed: Record<string, Set<string>>, 
  joins: string[][], 
  introspectedColumns: Record<string, string[]>
) {
  if (!plan) return;

  const relName = plan["Relation Name"];
  if (relName && introspectedColumns[relName]) {
    tablesUsed.add(relName);
    if (!columnsUsed[relName]) {
      columnsUsed[relName] = new Set<string>();
    }

    if (Array.isArray(plan["Output"])) {
      for (const expr of plan["Output"]) {
        const colsInDb = introspectedColumns[relName];
        if (colsInDb) {
          for (const col of colsInDb) {
            const regex = new RegExp(`\\b${col}\\b`, 'i');
            if (regex.test(expr)) {
              columnsUsed[relName].add(col);
            }
          }
        }
      }
    }
  }

  // Detect joins
  const nodeType = plan["Node Type"] || "";
  if (nodeType.includes("Join") || nodeType === "Nested Loop") {
    const childRelations = new Set<string>();
    if (Array.isArray(plan["Plans"])) {
      for (const child of plan["Plans"]) {
        collectRelations(child, childRelations, introspectedColumns);
      }
    }
    const relationsArray = Array.from(childRelations);
    if (relationsArray.length >= 2) {
      joins.push([relationsArray[0], relationsArray[1]]);
    }
  }

  // Recurse
  if (Array.isArray(plan["Plans"])) {
    for (const child of plan["Plans"]) {
      extractPlanInfo(child, tablesUsed, columnsUsed, joins, introspectedColumns);
    }
  }
}

function collectRelations(plan: any, relations: Set<string>, introspectedColumns: Record<string, string[]>) {
  if (!plan) return;
  const relName = plan["Relation Name"];
  if (relName && introspectedColumns[relName]) {
    relations.add(relName);
  }
  if (Array.isArray(plan["Plans"])) {
    for (const child of plan["Plans"]) {
      collectRelations(child, relations, introspectedColumns);
    }
  }
}

// Helper to check for allowed RPCs inside the SQL
function detectRpcs(sql: string, allowedRpcs: string[]): string[] {
  const rpcs: string[] = [];
  for (const r of allowedRpcs) {
    const regex = new RegExp(`\\b${r}\\b`, 'i');
    if (regex.test(sql)) {
      rpcs.push(r);
    }
  }
  return rpcs;
}
