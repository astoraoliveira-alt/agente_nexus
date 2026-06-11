import { supabase, supabaseReader } from '@/lib/supabase';

export interface SchemaViewConfig {
  id: string;
  tenantId: string;
  name: string;
  nodes: Array<{ table: string; x: number; y: number }>;
  mappings: Record<string, { label: string; columns: Record<string, string> }>;
  rpcMap: Record<string, { label: string; tables: string[]; columns: Record<string, string[]> }>;
  allowedTables: string[];
  allowedRpcs: string[];
  deniedColumns: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SchemaQueryResult {
  answer: string;
  sql: string;
  tablesUsed: string[];
  columnsUsed: Record<string, string[]>;
  rpcsUsed: string[];
  joins: string[][];
  rows: any[];
}

export const schemaExplorerService = {
  async getViewConfig(tenantId: string): Promise<SchemaViewConfig | null> {
    const { data, error } = await supabaseReader
      .from('schema_view_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1);

    if (error) {
      console.error('Error fetching schema view config:', error);
      return null;
    }

    if (!data || data.length === 0) return null;

    const raw = data[0];
    return {
      id: raw.id,
      tenantId: raw.tenant_id,
      name: raw.name,
      nodes: raw.nodes || [],
      mappings: raw.mappings || {},
      rpcMap: raw.rpc_map || {},
      allowedTables: raw.allowed_tables || [],
      allowedRpcs: raw.allowed_rpcs || [],
      deniedColumns: raw.denied_columns || [],
      createdAt: raw.created_at,
      updatedAt: raw.updated_at
    };
  },

  async saveViewConfig(config: Partial<SchemaViewConfig> & { id: string }): Promise<void> {
    const payload: any = {};
    if (config.name !== undefined) payload.name = config.name;
    if (config.nodes !== undefined) payload.nodes = config.nodes;
    if (config.mappings !== undefined) payload.mappings = config.mappings;
    if (config.rpcMap !== undefined) payload.rpc_map = config.rpcMap;
    if (config.allowedTables !== undefined) payload.allowed_tables = config.allowedTables;
    if (config.allowedRpcs !== undefined) payload.allowed_rpcs = config.allowedRpcs;
    if (config.deniedColumns !== undefined) payload.denied_columns = config.deniedColumns;

    payload.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('schema_view_config')
      .update(payload)
      .eq('id', config.id);

    if (error) {
      console.error('Error saving schema view config:', error);
      throw error;
    }
  },

  async createDefaultConfig(tenantId: string, config: Omit<SchemaViewConfig, 'id'>): Promise<{ data: SchemaViewConfig; error: any }> {
    const payload: any = {
      tenant_id: tenantId,
      name: config.name,
      nodes: config.nodes,
      mappings: config.mappings,
      rpc_map: config.rpcMap,
      allowed_tables: config.allowedTables,
      allowed_rpcs: config.allowedRpcs,
      denied_columns: config.deniedColumns
    };

    const { data, error } = await supabase
      .from('schema_view_config')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('Error creating default view config:', error);
      return { data: null as any, error };
    }

    const mapped: SchemaViewConfig = {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      nodes: data.nodes || [],
      mappings: data.mappings || {},
      rpcMap: data.rpc_map || {},
      allowedTables: data.allowed_tables || [],
      allowedRpcs: data.allowed_rpcs || [],
      deniedColumns: data.denied_columns || [],
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

    return { data: mapped, error: null };
  },

  async askSchema(viewId: string, tenantId: string, question: string): Promise<SchemaQueryResult> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('User not authenticated');

    const { data, error } = await supabase.functions.invoke('schema-query', {
      body: { viewId, tenantId, question },
      headers: { Authorization: `Bearer ${session.access_token}` }
    });

    if (error) {
      console.error('Error calling askSchema edge function:', error);
      throw error;
    }

    return {
      answer: data.answer,
      sql: data.sql,
      tablesUsed: data.tables_used || [],
      columnsUsed: data.columns_used || {},
      rpcsUsed: data.rpcs_used || [],
      joins: data.joins || [],
      rows: data.rows || []
    };
  },

  async buildSchema(
    viewId: string, 
    tenantId: string, 
    build: { fields: Array<{ table: string; column: string; type: string }>; aggregation: string }
  ): Promise<SchemaQueryResult> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('User not authenticated');

    const { data, error } = await supabase.functions.invoke('schema-query', {
      body: { viewId, tenantId, build },
      headers: { Authorization: `Bearer ${session.access_token}` }
    });

    if (error) {
      console.error('Error calling buildSchema edge function:', error);
      throw error;
    }

    return {
      answer: data.answer,
      sql: data.sql,
      tablesUsed: data.tables_used || [],
      columnsUsed: data.columns_used || {},
      rpcsUsed: data.rpcs_used || [],
      joins: data.joins || [],
      rows: data.rows || []
    };
  }
};
