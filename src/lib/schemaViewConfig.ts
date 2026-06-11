export interface FieldMetadata {
  tech: string;
  business: string;
  type: string;
  k: 'pk' | 'fk' | 'req' | 'opt';
}

export interface TableMetadata {
  id: string;
  tech: string;
  business: string;
  fields: FieldMetadata[];
  rpcs: string[];
}

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

export const DEFAULT_TABLES: TableMetadata[] = [
  {
    id: "agents",
    tech: "agents",
    business: "Agentes de IA",
    rpcs: ["evaluate_conversation_security"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome do agente", type: "varchar", k: "req" },
      { tech: "status", business: "Situação", type: "agent_status", k: "req" },
      { tech: "type", business: "Tipo de canal", type: "varchar", k: "opt" },
      { tech: "risk_level", business: "Nível de risco", type: "risk_level", k: "opt" },
      { tech: "tenant_id", business: "Empresa", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "campaigns",
    tech: "campaigns",
    business: "Campanhas",
    rpcs: ["get_all_campaigns_metrics_v2"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome da campanha", type: "varchar", k: "req" },
      { tech: "status", business: "Situação", type: "campaign_status", k: "req" },
      { tech: "total_contacts", business: "Total de contatos", type: "int4", k: "opt" },
      { tech: "sent_count", business: "Enviadas", type: "int4", k: "opt" },
      { tech: "conversion_count", business: "Conversões", type: "int4", k: "opt" },
      { tech: "agent_id", business: "Agente responsável", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "conversations",
    tech: "conversations",
    business: "Conversas",
    rpcs: ["get_conversation_establishments"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "user_name", business: "Cliente", type: "varchar", k: "opt" },
      { tech: "channel", business: "Canal", type: "conversation_channel", k: "req" },
      { tech: "status", business: "Situação", type: "conversation_status", k: "req" },
      { tech: "last_message_at", business: "Última mensagem", type: "timestamptz", k: "opt" },
      { tech: "agent_id", business: "Agente", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "messages",
    tech: "messages",
    business: "Mensagens",
    rpcs: ["fn_fetch_next_inbound_message"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "content", business: "Conteúdo", type: "text", k: "opt" },
      { tech: "sender_type", business: "Remetente", type: "varchar", k: "req" },
      { tech: "message_type", business: "Tipo", type: "varchar", k: "opt" },
      { tech: "created_at", business: "Enviada em", type: "timestamptz", k: "opt" },
      { tech: "conversation_id", business: "Conversa", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "contacts",
    tech: "contacts",
    business: "Contatos",
    rpcs: [],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome", type: "varchar", k: "req" },
      { tech: "phone", business: "Telefone", type: "varchar", k: "opt" },
      { tech: "tenant_id", business: "Empresa", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "companies",
    tech: "companies",
    business: "Empresas",
    rpcs: [],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome da Empresa", type: "varchar", k: "req" },
      { tech: "created_at", business: "Criada em", type: "timestamptz", k: "opt" },
    ],
  }
];

export const DEFAULT_RPCS = [
  {
    name: "evaluate_conversation_security",
    label: "Avaliação de Segurança",
    tables: ["agents"],
    columns: { "agents": ["id", "name", "risk_level"] }
  },
  {
    name: "get_all_campaigns_metrics_v2",
    label: "Métricas de Campanha",
    tables: ["campaigns"],
    columns: { "campaigns": ["sent_count", "conversion_count"] }
  },
  {
    name: "get_conversation_establishments",
    label: "Estabelecimentos da Conversa",
    tables: ["conversations"],
    columns: { "conversations": ["id", "channel", "status"] }
  },
  {
    name: "fn_fetch_next_inbound_message",
    label: "Próxima Mensagem Inbound",
    tables: ["messages"],
    columns: { "messages": ["id", "content", "sender_type"] }
  }
];
