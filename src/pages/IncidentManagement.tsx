import { 
  Bell, 
  Plus, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  MoreVertical, 
  Trash2, 
  Megaphone, 
  Brain,
  X,
  Send,
  Loader2,
  Filter,
  BarChart3,
  Users,
  FileText,
  CircleSlash
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { SystemIncident, Campaign } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

export default function IncidentManagement() {
  const { currentTenant, currentUser, hasPermission } = useApp();
  const [search, setSearch] = useState('');
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingIncident, setEditingIncident] = useState<SystemIncident | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<SystemIncident>>({
    title: '',
    problem_description: '',
    response_message: '',
    mode: 'passive',
    status: 'active',
    campaign_id: ''
  });

  // Reporting State
  const [reportIncident, setReportIncident] = useState<SystemIncident | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Broadcast Confirmation State
  const [confirmingBroadcast, setConfirmingBroadcast] = useState<{
    incident: SystemIncident, 
    allLeads: any[],
    selectedIds: Set<string>
  } | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastSearch, setBroadcastSearch] = useState('');

  const handleFetchLogs = async (incident: SystemIncident) => {
    try {
      setIsLoadingLogs(true);
      const logs = await api.getIncidentDeliveryLogs(incident.id, currentTenant.id);
      setDeliveryLogs(prev => ({ ...prev, [incident.id]: logs }));
    } catch (error) {
      toast.error('Falha ao carregar logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handlePrepareBroadcast = async (incident: SystemIncident) => {
    try {
      console.log('📢 Preparando broadcast para incidente:', incident.id);
      console.log('🏢 Tenant ID:', currentTenant?.id);
      
      if (!incident.id || !currentTenant?.id) {
        throw new Error('ID do incidente ou tenant não identificado');
      }

      setIsLoadingLogs(true);
      const leads = await api.getBroadcastPreview(incident.id, currentTenant.id);
      console.log('✅ Leads encontrados:', leads.length);
      
      // Inicialmente seleciona todos
      setConfirmingBroadcast({ 
        incident, 
        allLeads: leads, 
        selectedIds: new Set(leads.map(l => l.res_id))
      });
      setBroadcastSearch('');
    } catch (error: any) {
      console.error('❌ ERRO DETALHADO:', error);
      toast.error(`Erro: ${error.message || 'Falha ao preparar broadcast'}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleExecuteBroadcast = async () => {
    if (!confirmingBroadcast || confirmingBroadcast.selectedIds.size === 0) return;

    try {
      setIsBroadcasting(true);
      await api.triggerIncidentBroadcast(
        confirmingBroadcast.incident.id, 
        currentTenant.id, 
        Array.from(confirmingBroadcast.selectedIds)
      );
      toast.success(`${confirmingBroadcast.selectedIds.size} mensagens enviadas para a fila`);
      setConfirmingBroadcast(null);
    } catch (error) {
      toast.error('Falha ao processar broadcast');
    } finally {
      setIsBroadcasting(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      if (!currentTenant) return;
      setIsLoading(true);
      try {
        const [incidentsData, campaignsData] = await Promise.all([
          api.getSystemIncidents(currentTenant.id),
          api.getCampaigns(currentTenant.id)
        ]);
        setIncidents(incidentsData);
        setCampaigns(campaignsData);
      } catch (error) {
        toast.error('Erro ao carregar dados');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [currentTenant]);

  const handleOpenDialog = (incident: SystemIncident | null = null) => {
    if (incident) {
      setEditingIncident(incident);
      setFormData(incident);
    } else {
      setEditingIncident(null);
      setFormData({
        title: '',
        problem_description: '',
        response_message: '',
        mode: 'passive',
        status: 'active',
        campaign_id: ''
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentTenant || !currentUser) return;

    if (!formData.title?.trim() || !formData.problem_description?.trim() || !formData.response_message?.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      const { id, ...cleanData } = formData; // Remove id se existir
      const dataToSave = {
        ...cleanData,
        campaign_id: formData.campaign_id || null
      };

      if (editingIncident) {
        const updated = await api.updateSystemIncident(editingIncident.id, dataToSave);
        setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
        
        // Se mudou para ativo ou editou um ativo, prepara o broadcast
        if ((updated.mode === 'active' || updated.mode === 'both') && updated.status === 'active') {
          await handlePrepareBroadcast(updated);
        }
        
        toast.success('Comunicado atualizado com sucesso');
      } else {
        const created = await api.createSystemIncident({
          ...dataToSave,
          tenant_id: currentTenant.id,
          created_by: currentUser.id
        });
        setIncidents(prev => [created, ...prev]);

        // Se for ativo, prepara o broadcast
        if ((created.mode === 'active' || created.mode === 'both') && created.status === 'active') {
          await handlePrepareBroadcast(created);
        } else {
          toast.success('Comunicado criado com sucesso');
        }
      }
      setIsDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao salvar comunicado');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este comunicado?')) return;
    try {
      await api.deleteSystemIncident(id);
      setIncidents(prev => prev.filter(i => i.id !== id));
      toast.success('Comunicado removido');
    } catch (error) {
      toast.error('Erro ao remover');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.resolveSystemIncident(id);
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved', resolved_at: new Date().toISOString() } : i));
      toast.success('Incidente marcado como resolvido');
    } catch (error) {
      toast.error('Erro ao resolver');
    }
  };

  const filteredIncidents = incidents.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.problem_description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-border px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bell className="h-6 w-6 text-accent" />
                Comunicados & Incidentes
              </h1>
              <p className="text-sm text-muted-foreground">
                Gerencie alertas de sistema e orientações automáticas para seus clientes.
              </p>
            </div>
            {hasPermission('incidents.view') && (
              <Button className="bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Comunicado
              </Button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar comunicados..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <Card className="border-dashed border-2 flex flex-col items-center justify-center p-12 text-center bg-transparent">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Nenhum comunicado ativo</h3>
              <p className="text-sm text-muted-foreground max-w-xs mb-6">
                Crie um comunicado para informar seus clientes sobre instabilidades ou manutenções.
              </p>
              <Button onClick={() => handleOpenDialog()}>Criar Primeiro Alerta</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredIncidents.map((incident) => (
                <Card key={incident.id} className={cn(
                  "transition-all duration-200 border-l-4",
                  incident.status === 'active' ? "border-l-amber-500 shadow-md" : "border-l-green-500 opacity-75"
                )}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <Badge variant={incident.status === 'active' ? "warning" : "success"} className="w-fit">
                          {incident.status === 'active' ? 'Ativo' : 'Resolvido'}
                        </Badge>
                        <CardTitle className="text-lg font-bold leading-tight mt-1">{incident.title}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDialog(incident)}>Editar</DropdownMenuItem>
                          {incident.status === 'active' && (
                            <DropdownMenuItem onClick={() => handleResolve(incident.id)} className="text-green-600 font-medium">
                              Marcar como Resolvido
                            </DropdownMenuItem>
                          )}
                          {(incident.mode === 'active' || incident.mode === 'both') && incident.status === 'active' && (
                            <DropdownMenuItem onClick={() => handlePrepareBroadcast(incident)} className="text-accent font-medium">
                              Re-disparar Alerta
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleFetchLogs(incident)}>
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Ver Relatório
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(incident.id)} className="text-destructive">
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Problem Section */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <AlertCircle className="h-3 w-3" />
                        Problema Identificado
                      </div>
                      <p className="text-sm line-clamp-2 italic text-muted-foreground">
                        "{incident.problem_description}"
                      </p>
                    </div>

                    {/* Response Section */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <Brain className="h-3 w-3" />
                        Resposta da Sofia
                      </div>
                      <p className="text-sm line-clamp-3 bg-muted/50 p-2 rounded-md border border-border/50">
                        {incident.response_message}
                      </p>
                    </div>

                    {/* Mode & Campaign */}
                    <div className="pt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="gap-1.5 py-1">
                        {incident.mode === 'active' || incident.mode === 'both' ? (
                          <Megaphone className="h-3 w-3 text-accent" />
                        ) : (
                          <Brain className="h-3 w-3 text-blue-500" />
                        )}
                        {incident.mode === 'active' ? 'Somente Broadcast' : 
                         incident.mode === 'passive' ? 'Somente IA (Passivo)' : 'Broadcast + IA'}
                      </Badge>
                      {incident.campaign_id && (
                        <Badge variant="outline" className="gap-1.5 py-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          Campanha Vinculada
                        </Badge>
                      )}
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(incident.created_at).toLocaleDateString()}
                      </div>
                      {incident.resolved_at && (
                        <span className="text-green-600 font-medium">Resolvido em {new Date(incident.resolved_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-accent" />
                {editingIncident ? 'Editar Comunicado' : 'Novo Comunicado de Crise'}
              </DialogTitle>
              <DialogDescription>
                Configure os detalhes do incidente e como a IA deve responder.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>Título Interno</Label>
                <Input 
                  placeholder="Ex: Instabilidade Link Fiserv" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campanha Afetada (Opcional)</Label>
                  <Select 
                    value={formData.campaign_id || "none"} 
                    onValueChange={v => setFormData({...formData, campaign_id: v === "none" ? "" : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todas as Campanhas (Global)</SelectItem>
                      {campaigns.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Modo de Atuação</Label>
                  <Select 
                    value={formData.mode} 
                    onValueChange={(v: any) => setFormData({...formData, mode: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passive">Passivo (Só responde se perguntarem)</SelectItem>
                      <SelectItem value="active">Ativo (Broadcast para todos agora)</SelectItem>
                      <SelectItem value="both">Híbrido (Broadcast + Resposta IA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    Descrição do Problema (Para Detecção da IA)
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>Descreva o que o usuário vai dizer para a IA identificar o problema.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea 
                  placeholder="Ex: Não estou conseguindo preencher os dados no link da Fiserv / Erro ao salvar" 
                  className="min-h-[80px]"
                  value={formData.problem_description}
                  onChange={e => setFormData({...formData, problem_description: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem de Resposta / Orientação</Label>
                {(formData.mode === 'active' || formData.mode === 'both') && (
                  <div className="mb-2 p-3 bg-accent/10 border border-accent/20 rounded-lg flex gap-3">
                    <Megaphone className="w-5 h-5 text-accent shrink-0" />
                    <div className="text-xs text-accent">
                      <p className="font-bold uppercase mb-1">Atenção: Modo de Disparo Ativo</p>
                      <p>Esta mensagem será enviada <strong>exatamente</strong> como escrita abaixo para todos os leads vinculados.</p>
                    </div>
                  </div>
                )}
                <Textarea 
                  placeholder="Descreva a orientação que será enviada ao cliente..." 
                  className={cn(
                    "min-h-[120px]",
                    (formData.mode === 'active' || formData.mode === 'both') && "border-accent/50 bg-accent/[0.02]"
                  )}
                  value={formData.response_message}
                  onChange={e => setFormData({...formData, response_message: e.target.value})}
                />
                <p className="text-[10px] text-muted-foreground italic">
                  Dica: Seja empático e dê uma solução paliativa (ex: tentar mais tarde ou limpar cache).
                </p>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
                <div className="space-y-0.5">
                  <Label>Comunicado Ativo</Label>
                  <p className="text-xs text-muted-foreground">Desative para parar as respostas automáticas.</p>
                </div>
                <Switch 
                  checked={formData.status === 'active'}
                  onCheckedChange={checked => setFormData({...formData, status: checked ? 'active' : 'resolved'})}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button 
                className="bg-accent hover:bg-accent/90" 
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {editingIncident 
                      ? ((formData.mode === 'active' || formData.mode === 'both') ? 'Salvar e Iniciar Broadcast' : 'Salvar Alterações')
                      : ((formData.mode === 'active' || formData.mode === 'both') ? 'Publicar e Iniciar Broadcast' : 'Publicar Alerta')
                    }
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Relatório de Entrega */}
        <Dialog open={!!reportIncident} onOpenChange={(open) => !open && setReportIncident(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-accent" />
                    Relatório de Entrega: {reportIncident?.title}
                  </DialogTitle>
                  <DialogDescription>
                    Acompanhe em tempo real o alcance deste comunicado.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {isLoadingLogs ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
                <p className="text-sm text-muted-foreground">Carregando logs de entrega...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 py-4 overflow-hidden">
                {/* Métricas Rápidas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">Total Enviado</p>
                          <p className="text-2xl font-bold">{deliveryLogs.length}</p>
                        </div>
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <Send className="w-5 h-5 text-blue-500" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">Entregue</p>
                          <p className="text-2xl font-bold text-green-600">
                            {deliveryLogs.filter(l => ['delivered', 'read'].includes(l.status)).length}
                          </p>
                        </div>
                        <div className="p-2 bg-green-500/10 rounded-lg">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">Visualizado</p>
                          <p className="text-2xl font-bold text-accent">
                            {deliveryLogs.filter(l => l.status === 'read').length}
                          </p>
                        </div>
                        <div className="p-2 bg-accent/10 rounded-lg">
                          <Users className="w-5 h-5 text-accent" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de Logs */}
                <div className="border rounded-lg overflow-hidden flex flex-col flex-1">
                  <ScrollArea className="flex-1">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        <TableRow>
                          <TableHead>Destinatário</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data de Envio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliveryLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              Nenhum registro de entrega encontrado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          deliveryLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="font-medium">
                                {log.metadata?.name || log.sender_name || 'Lead s/ Nome'}
                              </TableCell>
                              <TableCell>{log.metadata?.phone || 'N/A'}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant={
                                    log.status === 'read' ? 'default' : 
                                    log.status === 'delivered' ? 'outline' : 'secondary'
                                  }
                                  className={cn(
                                    log.status === 'read' && "bg-accent hover:bg-accent/80",
                                    log.status === 'delivered' && "border-green-500 text-green-600",
                                    log.status === 'failed' && "bg-destructive text-destructive-foreground"
                                  )}
                                >
                                  {log.status === 'read' ? 'Visualizado' : 
                                   log.status === 'delivered' ? 'Entregue' : 
                                   log.status === 'sent' ? 'Enviado' : log.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {new Date(log.created_at).toLocaleString('pt-BR')}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            )}

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setReportIncident(null)}>
                Fechar Relatório
              </Button>
              <Button 
                className="bg-accent hover:bg-accent/90" 
                onClick={() => reportIncident && handleFetchLogs(reportIncident)}
                disabled={isLoadingLogs}
              >
                <Clock className="w-4 h-4 mr-2" />
                Atualizar Dados
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmação de Broadcast Ativo */}
        <Dialog open={!!confirmingBroadcast} onOpenChange={(open) => !open && setConfirmingBroadcast(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col border-accent/20">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-full">
                  <Megaphone className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <DialogTitle>Confirmar Disparo Ativo</DialogTitle>
                  <DialogDescription>
                    Revise os contatos que receberão este alerta agora. Você pode remover destinatários se desejar.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4 overflow-hidden">
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <p className="text-sm font-medium mb-1 text-accent flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Mensagem que será enviada:
                </p>
                <p className="text-sm italic text-muted-foreground bg-background/50 p-2 rounded border border-border/50">
                  "{confirmingBroadcast?.incident.response_message}"
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Lista de Destinatários ({confirmingBroadcast?.selectedIds.size || 0} / {confirmingBroadcast?.allLeads.length || 0})
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] h-7 px-2"
                      onClick={() => setConfirmingBroadcast(prev => prev ? { 
                        ...prev, 
                        selectedIds: new Set(prev.allLeads.map(l => l.res_id)) 
                      } : null)}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                      Selecionar Todos
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] h-7 px-2"
                      onClick={() => setConfirmingBroadcast(prev => prev ? { 
                        ...prev, 
                        selectedIds: new Set() 
                      } : null)}
                    >
                      <CircleSlash className="w-3 h-3 mr-1 text-destructive" />
                      Desmarcar Todos
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar por nome ou telefone..."
                    className="pl-9 h-9 text-xs"
                    value={broadcastSearch}
                    onChange={(e) => setBroadcastSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden flex flex-col">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead className="text-xs">Nome</TableHead>
                        <TableHead className="text-xs">Telefone</TableHead>
                        <TableHead className="text-xs">Campanha</TableHead>
                        <TableHead className="w-[80px] text-right text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {confirmingBroadcast?.allLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground space-y-2">
                            <Users className="w-8 h-8 mx-auto opacity-20" />
                            <p>Nenhum destinatário encontrado.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        confirmingBroadcast?.allLeads
                          .filter(l => 
                            l.res_name.toLowerCase().includes(broadcastSearch.toLowerCase()) ||
                            l.res_whatsapp.includes(broadcastSearch)
                          )
                          .map((lead) => {
                            const isSelected = confirmingBroadcast.selectedIds.has(lead.res_id);
                            return (
                              <TableRow 
                                key={lead.res_id} 
                                className={`hover:bg-muted/30 transition-colors cursor-pointer ${!isSelected ? 'opacity-50' : ''}`}
                                onClick={() => {
                                  const next = new Set(confirmingBroadcast.selectedIds);
                                  if (isSelected) next.delete(lead.res_id);
                                  else next.add(lead.res_id);
                                  setConfirmingBroadcast(prev => prev ? { ...prev, selectedIds: next } : null);
                                }}
                              >
                                <TableCell className="py-2">
                                  <Checkbox checked={isSelected} />
                                </TableCell>
                                <TableCell className="font-medium text-xs py-2">{lead.res_name}</TableCell>
                                <TableCell className="text-xs py-2">{lead.res_whatsapp}</TableCell>
                                <TableCell className="py-2">
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                    {lead.res_campaign_name || 'Global'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right py-2">
                                  {isSelected ? (
                                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] px-1.5 py-0">Selecionado</Badge>
                                  ) : (
                                    <Badge variant="ghost" className="text-muted-foreground text-[9px] px-1.5 py-0">Ignorado</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setConfirmingBroadcast(null)}>
                Cancelar
              </Button>
              <Button 
                className="bg-accent hover:bg-accent/90" 
                onClick={handleExecuteBroadcast}
                disabled={isBroadcasting || (confirmingBroadcast?.selectedIds.size || 0) === 0}
              >
                {isBroadcasting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando para Fila...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Confirmar e Enviar para {confirmingBroadcast?.selectedIds.size || 0} Leads
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
