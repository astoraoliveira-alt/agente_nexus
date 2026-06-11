import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { schemaExplorerService, SchemaViewConfig, SchemaQueryResult } from '@/services/schemaExplorer.service';
import { SchemaCanvas } from '@/components/schema/SchemaCanvas';
import { AskPanel, ChatMessage } from '@/components/schema/AskPanel';
import { QueryBuilderBar } from '@/components/schema/QueryBuilderBar';
import { ConfigDialog } from '@/components/schema/ConfigDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Settings, RefreshCw, AlertCircle, Database } from 'lucide-react';
import { DEFAULT_TABLES, DEFAULT_RPCS } from '@/lib/schemaViewConfig';

export default function SchemaExplorer() {
  const { currentTenant, hasPermission } = useApp();
  
  // Loading & State
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Config
  const [viewConfig, setViewConfig] = useState<SchemaViewConfig | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  
  // Chat & Query states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Pergunte em linguagem natural — ou **clique nos campos** ao lado para montar uma consulta. Eu acendo as tabelas, campos e RPCs que usei.'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [queryResult, setQueryResult] = useState<SchemaQueryResult | null>(null);
  
  // Query Builder Selection
  const [selectedFields, setSelectedFields] = useState<Array<{
    table: string;
    column: string;
    type: string;
    business: string;
    tableBusiness: string;
  }>>([]);

  // Load View Config from DB
  const loadConfig = useCallback(async () => {
    if (!currentTenant?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      let config = await schemaExplorerService.getViewConfig(currentTenant.id);
      
      // If no config exists, create a default one
      if (!config) {
        toast.info('Nenhuma configuração encontrada. Criando padrão...');
        const defaultNodes = DEFAULT_TABLES.map((t, idx) => {
          const defaultPositions: Record<string, {x: number, y: number}> = {
            agents: { x: 300, y: 16 },
            contacts: { x: 600, y: 28 },
            campaigns: { x: 26, y: 250 },
            conversations: { x: 300, y: 300 },
            messages: { x: 600, y: 300 },
            companies: { x: 26, y: 28 }
          };
          return {
            table: t.tech,
            x: defaultPositions[t.tech]?.x ?? (50 + idx * 220),
            y: defaultPositions[t.tech]?.y ?? 150
          };
        });

        const defaultMappings: Record<string, any> = {};
        DEFAULT_TABLES.forEach(t => {
          const columns: Record<string, string> = {};
          t.fields.forEach(f => {
            columns[f.tech] = f.business;
          });
          defaultMappings[t.tech] = {
            label: t.business,
            columns
          };
        });

        const defaultRpcMap: Record<string, any> = {};
        DEFAULT_RPCS.forEach(r => {
          defaultRpcMap[r.name] = {
            label: r.label,
            tables: r.tables,
            columns: r.columns
          };
        });

        const newConfigPayload: Omit<SchemaViewConfig, 'id'> = {
          tenantId: currentTenant.id,
          name: 'Visão Principal',
          nodes: defaultNodes,
          mappings: defaultMappings,
          rpcMap: defaultRpcMap,
          allowedTables: DEFAULT_TABLES.map(t => t.tech),
          allowedRpcs: DEFAULT_RPCS.map(r => r.name),
          deniedColumns: ['agents.meta_api_token', 'agents.zenvia_api_token', 'companies.api_key']
        };

        // Call database to insert a fresh config
        const { data, error: insertError } = await schemaExplorerService.getViewConfig(currentTenant.id)
          .then(async (res) => {
            if (res) return { data: res, error: null };
            // Since service layer might not have a direct create view config function,
            // we call update/insert logic via Supabase or dynamic insertion
            // Let's implement it inside the service or handle it here
            const { data: inserted, error: err } = await schemaExplorerService.createDefaultConfig(currentTenant.id, newConfigPayload);
            return { data: inserted, error: err };
          });

        if (insertError) throw insertError;
        config = data;
      }

      setViewConfig(config);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Falha ao carregar as configurações do Schema Explorer.');
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Suggestions List
  const suggestions = useMemo(() => [
    { label: 'Performance de Campanhas', question: 'Como está a performance das campanhas?' },
    { label: 'Conversas por Agente', question: 'Quantas conversas cada agente atendeu?' },
    { label: 'Total de Mensagens', question: 'Quantas mensagens foram trocadas nas conversas?' },
    { label: 'Líder em Conversões', question: 'Qual agente gerou mais conversões?' },
    { label: 'Mensagens de Agentes Ativos', question: 'Quantas mensagens vieram dos agentes ativos?' }
  ], []);

  // Filter visible tables metadata based on view config allowedTables
  const visibleTables = useMemo(() => {
    if (!viewConfig) return [];
    return DEFAULT_TABLES.filter(t => viewConfig.allowedTables.includes(t.tech)).map(t => {
      // Inject mappings if any
      const mappings = viewConfig.mappings[t.tech];
      return {
        ...t,
        business: mappings?.label || t.business,
        fields: t.fields.map(f => ({
          ...f,
          business: mappings?.columns?.[f.tech] || f.business
        }))
      };
    });
  }, [viewConfig]);

  // Handle Canvas Drag and Save
  const handleNodesChange = async (updatedNodes: any[]) => {
    if (!viewConfig) return;
    
    // Map React Flow nodes back to coordinates
    const newNodes = updatedNodes.map((n) => ({
      table: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y)
    }));

    setViewConfig(prev => {
      if (!prev) return prev;
      return { ...prev, nodes: newNodes };
    });

    try {
      await schemaExplorerService.saveViewConfig({
        id: viewConfig.id,
        nodes: newNodes
      });
    } catch (err) {
      console.error('Failed to auto-save node positions:', err);
    }
  };

  // Click on canvas field to add to QueryBuilder
  const handleFieldToggle = (tableTech: string, columnTech: string, type: string) => {
    if (!viewConfig) return;
    const tableBiz = viewConfig.mappings[tableTech]?.label || tableTech;
    const colBiz = viewConfig.mappings[tableTech]?.columns?.[columnTech] || columnTech;

    setSelectedFields((prev) => {
      const idx = prev.findIndex((f) => f.table === tableTech && f.column === columnTech);
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [
        ...prev,
        {
          table: tableTech,
          column: columnTech,
          type,
          business: colBiz,
          tableBusiness: tableBiz
        }
      ];
    });
  };

  const handleRemoveField = (index: number) => {
    setSelectedFields((prev) => prev.filter((_, i) => i !== index));
  };

  // 1. Text-to-SQL submit handler
  const handleChatSubmit = async (questionText?: string) => {
    const text = (questionText || chatInput).trim();
    if (!text || !viewConfig || !currentTenant) return;

    setChatInput('');
    setIsQuerying(true);

    // Add user message to chat log
    setMessages((prev) => [...prev, { role: 'user', text }]);

    try {
      const result = await schemaExplorerService.askSchema(viewConfig.id, currentTenant.id, text);
      
      // Update result state to trigger canvas highlighting
      setQueryResult(result);

      // Add AI answer bubble
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: result.answer,
          sql: result.sql,
          tablesUsed: result.tablesUsed,
          columnsUsed: result.columnsUsed,
          rpcsUsed: result.rpcsUsed,
          joins: result.joins,
          rows: result.rows
        }
      ]);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao processar consulta de linguagem natural.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Desculpe, ocorreu um erro ao executar a sua pergunta: **${err?.message || 'Erro Desconhecido'}**`
        }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  // 2. Query Builder submit handler
  const handleAggregate = async (action: 'sum' | 'avg' | 'count') => {
    if (selectedFields.length === 0 || !viewConfig || !currentTenant) return;

    setIsQuerying(true);
    const fieldsPayload = selectedFields.map(sf => ({
      table: sf.table,
      column: sf.column,
      type: sf.type
    }));

    // Generate descriptive query title based on selection
    const names = selectedFields.map(s => s.business);
    const tableNames = [...new Set(selectedFields.map(s => s.tableBusiness))].join(' × ');
    let label = '';
    
    if (action === 'count') {
      label = `Contar registros em ${tableNames} (${names.join(', ')})`;
    } else if (action === 'sum') {
      label = `Somar total de ${names.join(' + ')} em ${tableNames}`;
    } else {
      label = `Média de ${names.join(', ')} em ${tableNames}`;
    }

    setMessages((prev) => [...prev, { role: 'user', text: label }]);
    setSelectedFields([]); // Clear builder chips

    try {
      const result = await schemaExplorerService.buildSchema(viewConfig.id, currentTenant.id, {
        fields: fieldsPayload,
        aggregation: action
      });

      setQueryResult(result);

      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: result.answer,
          sql: result.sql,
          tablesUsed: result.tablesUsed,
          columnsUsed: result.columnsUsed,
          rpcsUsed: result.rpcsUsed,
          joins: result.joins,
          rows: result.rows
        }
      ]);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao construir a query.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Erro ao construir e executar a query: ${err?.message || 'Verifique as configurações.'}`
        }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleCustomText = () => {
    if (selectedFields.length === 0) return;
    const fieldsDesc = selectedFields.map(s => `«${s.business}»`).join(', ');
    const tablesDesc = [...new Set(selectedFields.map(s => s.tableBusiness))].join(' e ');
    setChatInput(`Quero analisar ${fieldsDesc} de ${tablesDesc}: `);
    setSelectedFields([]);
  };

  // Re-highlight query details when clicking on past chat bubbles
  const handleMessageClick = (msg: ChatMessage) => {
    if (msg.sql) {
      setQueryResult({
        answer: msg.text,
        sql: msg.sql,
        tablesUsed: msg.tablesUsed || [],
        columnsUsed: msg.columnsUsed || {},
        rpcsUsed: msg.rpcsUsed || [],
        joins: msg.joins || [],
        rows: msg.rows || []
      });
      toast.info('Visualização do Canvas atualizada com o histórico desta mensagem!');
    }
  };

  const handleConfigSave = async (updatedConfig: SchemaViewConfig) => {
    await schemaExplorerService.saveViewConfig(updatedConfig);
    setViewConfig(updatedConfig);
  };

  if (!hasPermission('schema_explorer.view')) {
    return (
      <div className="flex h-screen items-center justify-center p-6 bg-slate-50">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Acesso Negado</h2>
          <p className="text-xs text-slate-500">
            Você não possui a permissão necessária para acessar o Schema Explorer. Entre em contato com seu administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Database className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800">Schema Explorer</h1>
            <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
              Visualização de negócio · consulta analítica em linguagem natural
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadConfig}
            className="h-8.5 text-xs text-slate-600 border-slate-200 bg-white gap-1.5 hover:bg-slate-50"
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={() => setIsConfigOpen(true)}
            className="h-8.5 text-xs bg-primary hover:bg-primary/95 text-white gap-1.5"
            disabled={isLoading || !viewConfig}
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar
          </Button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex min-h-0 relative">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs font-semibold text-slate-500">Carregando configurações do tenant...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white gap-3 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <h3 className="text-sm font-bold text-slate-800">Erro ao carregar a página</h3>
            <p className="text-xs text-slate-500 max-w-sm">{error}</p>
            <Button size="sm" onClick={loadConfig} className="bg-primary text-white mt-2">
              Tentar Novamente
            </Button>
          </div>
        ) : (
          <>
            {/* Left Side: React Flow Canvas */}
            <div className="flex-1 h-full min-w-0 relative">
              <SchemaCanvas
                viewConfig={viewConfig!}
                tables={visibleTables}
                queryResult={queryResult}
                selectedFields={selectedFields}
                onFieldToggle={handleFieldToggle}
                onNodesChange={handleNodesChange}
              />

              {/* Click-to-Query Floating builder */}
              <QueryBuilderBar
                selectedFields={selectedFields}
                onRemoveField={handleRemoveField}
                onAggregate={handleAggregate}
                onCustomText={handleCustomText}
              />
            </div>

            {/* Right Side: Natural Language Chat Interface */}
            <AskPanel
              messages={messages}
              input={chatInput}
              onInputChange={setChatInput}
              onSubmit={() => handleChatSubmit()}
              isLoading={isQuerying}
              suggestions={suggestions}
              onSelectSuggestion={(q) => handleChatSubmit(q)}
              tables={DEFAULT_TABLES}
              onMessageClick={handleMessageClick}
            />
          </>
        )}
      </div>

      {/* Modal Administrative Controls */}
      {viewConfig && (
        <ConfigDialog
          open={isConfigOpen}
          onOpenChange={setIsConfigOpen}
          config={viewConfig}
          onSave={handleConfigSave}
        />
      )}
    </div>
  );
}
