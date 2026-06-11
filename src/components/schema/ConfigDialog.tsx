import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  SchemaViewConfig,
  DEFAULT_TABLES,
  DEFAULT_RPCS,
  TableMetadata
} from '@/lib/schemaViewConfig';
import { Database, ShieldAlert, FileJson, Settings2, HelpCircle } from 'lucide-react';

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: SchemaViewConfig;
  onSave: (updatedConfig: SchemaViewConfig) => Promise<void>;
}

export function ConfigDialog({ open, onOpenChange, config, onSave }: ConfigDialogProps) {
  const [localConfig, setLocalConfig] = useState<SchemaViewConfig>({ ...config });
  const [selectedTableTab, setSelectedTableTab] = useState<string>('agents');
  const [selectedRpcTab, setSelectedRpcTab] = useState<string>('evaluate_conversation_security');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && config) {
      // Deep copy to avoid mutating prop
      setLocalConfig(JSON.parse(JSON.stringify(config)));
    }
  }, [open, config]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localConfig);
      toast.success('Configurações de Schema salvas com sucesso!');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to get business label of table
  const getTableLabel = (techName: string) => {
    return localConfig.mappings[techName]?.label || 
      DEFAULT_TABLES.find(t => t.tech === techName)?.business || 
      techName;
  };

  // 1. Mappings Handlers
  const handleTableLabelChange = (tableTech: string, newLabel: string) => {
    setLocalConfig(prev => {
      const mappings = { ...prev.mappings };
      if (!mappings[tableTech]) mappings[tableTech] = { label: '', columns: {} };
      mappings[tableTech].label = newLabel;
      return { ...prev, mappings };
    });
  };

  const handleColumnLabelChange = (tableTech: string, columnTech: string, newLabel: string) => {
    setLocalConfig(prev => {
      const mappings = { ...prev.mappings };
      if (!mappings[tableTech]) mappings[tableTech] = { label: '', columns: {} };
      const columns = { ...mappings[tableTech].columns };
      columns[columnTech] = newLabel;
      mappings[tableTech].columns = columns;
      return { ...prev, mappings };
    });
  };

  // 2. Allowed Tables / RPCs
  const handleToggleTable = (tableTech: string, checked: boolean) => {
    setLocalConfig(prev => {
      const allowedTables = checked
        ? [...prev.allowedTables, tableTech]
        : prev.allowedTables.filter(t => t !== tableTech);
      
      // Also adjust default nodes to include/exclude tables to keep canvas sync'd
      let nodes = [...prev.nodes];
      if (checked && !nodes.some(n => n.table === tableTech)) {
        // Find default position or default layout offsets
        const defaultPositions: Record<string, {x: number, y: number}> = {
          agents: { x: 300, y: 16 },
          contacts: { x: 600, y: 28 },
          campaigns: { x: 26, y: 250 },
          conversations: { x: 300, y: 300 },
          messages: { x: 600, y: 300 },
          companies: { x: 26, y: 28 }
        };
        const pos = defaultPositions[tableTech] || { x: 100, y: 100 };
        nodes.push({ table: tableTech, x: pos.x, y: pos.y });
      } else if (!checked) {
        nodes = nodes.filter(n => n.table !== tableTech);
      }

      return { ...prev, allowedTables, nodes };
    });
  };

  const handleToggleRpc = (rpcName: string, checked: boolean) => {
    setLocalConfig(prev => {
      const allowedRpcs = checked
        ? [...prev.allowedRpcs, rpcName]
        : prev.allowedRpcs.filter(r => r !== rpcName);
      return { ...prev, allowedRpcs };
    });
  };

  // 3. Denied Columns
  const handleToggleDeniedColumn = (columnPath: string, checked: boolean) => {
    setLocalConfig(prev => {
      const deniedColumns = checked
        ? [...prev.deniedColumns, columnPath]
        : prev.deniedColumns.filter(c => c !== columnPath);
      return { ...prev, deniedColumns };
    });
  };

  // 4. RPC Map configurations
  const handleRpcLabelChange = (rpcName: string, newLabel: string) => {
    setLocalConfig(prev => {
      const rpcMap = { ...prev.rpcMap };
      if (!rpcMap[rpcName]) rpcMap[rpcName] = { label: '', tables: [], columns: {} };
      rpcMap[rpcName].label = newLabel;
      return { ...prev, rpcMap };
    });
  };

  const handleRpcToggleTable = (rpcName: string, tableTech: string, checked: boolean) => {
    setLocalConfig(prev => {
      const rpcMap = { ...prev.rpcMap };
      if (!rpcMap[rpcName]) rpcMap[rpcName] = { label: '', tables: [], columns: {} };
      
      const tables = checked
        ? [...(rpcMap[rpcName].tables || []), tableTech]
        : (rpcMap[rpcName].tables || []).filter(t => t !== tableTech);

      rpcMap[rpcName].tables = tables;

      if (!checked && rpcMap[rpcName].columns?.[tableTech]) {
        const columns = { ...rpcMap[rpcName].columns };
        delete columns[tableTech];
        rpcMap[rpcName].columns = columns;
      }

      return { ...prev, rpcMap };
    });
  };

  const handleRpcToggleColumn = (rpcName: string, tableTech: string, columnTech: string, checked: boolean) => {
    setLocalConfig(prev => {
      const rpcMap = { ...prev.rpcMap };
      if (!rpcMap[rpcName]) rpcMap[rpcName] = { label: '', tables: [], columns: {} };
      
      const cols = { ...rpcMap[rpcName].columns };
      const currentCols = cols[tableTech] || [];
      
      const updatedCols = checked
        ? [...currentCols, columnTech]
        : currentCols.filter(c => c !== columnTech);
      
      cols[tableTech] = updatedCols;
      rpcMap[rpcName].columns = cols;
      return { ...prev, rpcMap };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Settings2 className="h-5 w-5 text-primary" /> Configuração do Schema Explorer
          </DialogTitle>
          <DialogDescription>
            Defina o mapeamento de negócio, tabelas permitidas e limites de segurança de dados para o seu tenant.
          </DialogDescription>
        </DialogHeader>

        {/* View Name Input */}
        <div className="flex items-center gap-3 py-2 border-b border-slate-100 mb-2">
          <Label htmlFor="view-name" className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Nome da Visão
          </Label>
          <Input
            id="view-name"
            value={localConfig.name}
            onChange={(e) => setLocalConfig(prev => ({ ...prev, name: e.target.value }))}
            className="h-8 max-w-[280px] bg-slate-50 text-slate-800 font-medium"
            placeholder="Nome da Visão principal"
          />
        </div>

        <Tabs defaultValue="aliases" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 bg-slate-100 p-1 mb-4 h-10 shrink-0">
            <TabsTrigger value="aliases" className="text-xs font-semibold">Semântica (Apelidos)</TabsTrigger>
            <TabsTrigger value="security" className="text-xs font-semibold">Tabelas e RPCs</TabsTrigger>
            <TabsTrigger value="deny" className="text-xs font-semibold">Colunas Sensíveis</TabsTrigger>
            <TabsTrigger value="rpcMap" className="text-xs font-semibold">Mapa de RPCs</TabsTrigger>
          </TabsList>

          {/* TAB 1: ALIASES (SEMANTICS) */}
          <TabsContent value="aliases" className="flex-1 flex gap-4 min-h-0 mt-0">
            <div className="w-[180px] border-r border-slate-200 pr-3 flex flex-col gap-1 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tabelas</span>
              {DEFAULT_TABLES.map(t => (
                <button
                  key={t.tech}
                  onClick={() => setSelectedTableTab(t.tech)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedTableTab === t.tech
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {getTableLabel(t.tech)}
                  <span className="block text-[9px] text-slate-400 font-mono font-normal">({t.tech})</span>
                </button>
              ))}
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 rounded-xl border border-slate-100 p-4">
              {(() => {
                const currentTable = DEFAULT_TABLES.find(t => t.tech === selectedTableTab);
                if (!currentTable) return null;

                const tableAlias = localConfig.mappings[currentTable.tech]?.label || '';

                return (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200 shrink-0">
                      <div>
                        <Label className="text-xs text-slate-500 font-bold">Nome Técnico da Tabela</Label>
                        <div className="text-xs font-mono bg-slate-100 border px-3 py-1.5 rounded-md mt-1 text-slate-600">
                          {currentTable.tech}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 font-bold">Apelido de Negócio (Tabela)</Label>
                        <Input
                          value={tableAlias}
                          onChange={(e) => handleTableLabelChange(currentTable.tech, e.target.value)}
                          placeholder={currentTable.business}
                          className="h-8.5 mt-1 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 mt-3 flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Colunas</span>
                      <ScrollArea className="flex-1 border border-slate-200 rounded-lg bg-white overflow-y-auto">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-[10px] font-bold h-8">Campo Técnico</TableHead>
                              <TableHead className="text-[10px] font-bold h-8">Tipo</TableHead>
                              <TableHead className="text-[10px] font-bold h-8">Apelido de Negócio (Exibido no Canvas)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentTable.fields.map(f => {
                              const colAlias = localConfig.mappings[currentTable.tech]?.columns?.[f.tech] || '';
                              return (
                                <TableRow key={f.tech} className="hover:bg-slate-50/50">
                                  <TableCell className="font-mono text-xs text-slate-700 py-1.5">{f.tech}</TableCell>
                                  <TableCell className="font-mono text-[10px] text-slate-400 py-1.5">{f.type}</TableCell>
                                  <TableCell className="py-1">
                                    <Input
                                      value={colAlias}
                                      onChange={(e) => handleColumnLabelChange(currentTable.tech, f.tech, e.target.value)}
                                      placeholder={f.business}
                                      className="h-7 text-xs bg-white py-1"
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          {/* TAB 2: ALLOWED TABLES & RPCS */}
          <TabsContent value="security" className="flex-1 flex gap-6 min-h-0 mt-0">
            {/* Tables allowed */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tabelas Disponíveis no Canvas</span>
              </div>
              <ScrollArea className="flex-1 bg-white border border-slate-200 rounded-lg p-3">
                <div className="space-y-2.5">
                  {DEFAULT_TABLES.map(t => {
                    const isAllowed = localConfig.allowedTables.includes(t.tech);
                    return (
                      <div key={t.tech} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">{getTableLabel(t.tech)}</span>
                          <span className="text-[10px] font-mono text-slate-400">{t.tech}</span>
                        </div>
                        <Switch
                          checked={isAllowed}
                          onCheckedChange={(checked) => handleToggleTable(t.tech, checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* RPCs allowed */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">RPCs (Funções Postgres) Permitidas</span>
              </div>
              <ScrollArea className="flex-1 bg-white border border-slate-200 rounded-lg p-3">
                <div className="space-y-2.5">
                  {DEFAULT_RPCS.map(r => {
                    const isAllowed = localConfig.allowedRpcs.includes(r.name);
                    const label = localConfig.rpcMap[r.name]?.label || r.label;
                    return (
                      <div key={r.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">{label}</span>
                          <span className="text-[10px] font-mono text-slate-400">{r.name}</span>
                        </div>
                        <Switch
                          checked={isAllowed}
                          onCheckedChange={(checked) => handleToggleRpc(r.name, checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* TAB 3: DENIED COLUMNS */}
          <TabsContent value="deny" className="flex-1 flex flex-col min-h-0 mt-0 bg-slate-50/50 border border-slate-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <ShieldAlert className="h-4.5 w-4.5 text-red-500" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Controles de Segurança e Colunas Sensíveis</span>
                <span className="text-[10px] text-slate-400">Marque as colunas que a IA nunca terá permissão de ler ou exibir.</span>
              </div>
            </div>
            <ScrollArea className="flex-1 bg-white border border-slate-200 rounded-lg">
              <div className="p-4 space-y-4">
                {DEFAULT_TABLES.map(t => (
                  <div key={t.tech} className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      {getTableLabel(t.tech)} <span className="text-[10px] font-mono text-slate-400 font-normal">({t.tech})</span>
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pl-4">
                      {t.fields.map(f => {
                        const path = `${t.tech}.${f.tech}`;
                        const isDenied = localConfig.deniedColumns.includes(path);
                        return (
                          <label
                            key={f.tech}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                              isDenied
                                ? 'bg-red-50/50 border-red-200 text-red-700 font-medium'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Checkbox
                              checked={isDenied}
                              onCheckedChange={(checked) => handleToggleDeniedColumn(path, !!checked)}
                              className={isDenied ? 'border-red-400 data-[state=checked]:bg-red-500 data-[state=checked]:text-white' : ''}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs truncate">{f.business}</span>
                              <span className="text-[9px] font-mono opacity-60 truncate">{f.tech}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* TAB 4: RPC MAP CONFIG */}
          <TabsContent value="rpcMap" className="flex-1 flex gap-4 min-h-0 mt-0">
            <div className="w-[200px] border-r border-slate-200 pr-3 flex flex-col gap-1 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Funções (RPCs)</span>
              {DEFAULT_RPCS.map(r => (
                <button
                  key={r.name}
                  onClick={() => setSelectedRpcTab(r.name)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedRpcTab === r.name
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {localConfig.rpcMap[r.name]?.label || r.label}
                  <span className="block text-[9px] text-slate-400 font-mono font-normal">({r.name})</span>
                </button>
              ))}
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 rounded-xl border border-slate-100 p-4">
              {(() => {
                const currentRpc = DEFAULT_RPCS.find(r => r.name === selectedRpcTab);
                if (!currentRpc) return null;

                const rpcConfig = localConfig.rpcMap[currentRpc.name] || { label: currentRpc.label, tables: [], columns: {} };
                const tablesTouched = rpcConfig.tables || [];

                return (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200 shrink-0">
                      <div>
                        <Label className="text-xs text-slate-500 font-bold font-mono">Assinatura SQL RPC</Label>
                        <div className="text-xs font-mono bg-slate-100 border px-3 py-1.5 rounded-md mt-1 text-slate-600">
                          {currentRpc.name}()
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 font-bold">Apelido de Negócio (RPC)</Label>
                        <Input
                          value={rpcConfig.label || ''}
                          onChange={(e) => handleRpcLabelChange(currentRpc.name, e.target.value)}
                          placeholder={currentRpc.label}
                          className="h-8.5 mt-1 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 mt-3 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dependências Semânticas da RPC</span>
                        <HelpCircle className="h-3.5 w-3.5 text-slate-400" title="RPCs encapsulam SQL. Indique quais tabelas/colunas ela acessa internamente para acendê-las no canvas." />
                      </div>
                      <ScrollArea className="flex-1 border border-slate-200 rounded-lg bg-white p-3 overflow-y-auto">
                        <div className="space-y-4">
                          {DEFAULT_TABLES.map(t => {
                            const isTouched = tablesTouched.includes(t.tech);
                            return (
                              <div key={t.tech} className="space-y-1.5">
                                <label className="flex items-center gap-2 font-semibold text-xs text-slate-800 cursor-pointer">
                                  <Checkbox
                                    checked={isTouched}
                                    onCheckedChange={(checked) => handleRpcToggleTable(currentRpc.name, t.tech, !!checked)}
                                  />
                                  <span>{getTableLabel(t.tech)} <span className="text-[10px] font-mono text-slate-400 font-normal">({t.tech})</span></span>
                                </label>

                                {isTouched && (
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 pl-6 pt-1">
                                    {t.fields.map(f => {
                                      const isColSelected = (rpcConfig.columns?.[t.tech] || []).includes(f.tech);
                                      return (
                                        <label
                                          key={f.tech}
                                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer select-none transition-colors text-[11px] ${
                                            isColSelected
                                              ? 'bg-primary/5 border-primary/30 text-primary'
                                              : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          <Checkbox
                                            checked={isColSelected}
                                            onCheckedChange={(checked) => handleRpcToggleColumn(currentRpc.name, t.tech, f.tech, !!checked)}
                                          />
                                          <span className="truncate">{f.business}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                );
              })()}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-4 border-t border-slate-100 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/95 text-white gap-2">
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
