import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign, ReengagementContact, ReengagementFunnelSummary } from '@/lib/types';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  History,
  ArrowLeft,
  Calendar,
  Clock,
  Send,
  Users,
  Eye,
  MessageSquare,
  Award,
  Filter,
  Search,
  CheckSquare,
  Square,
  BarChart3,
  CalendarClock,
  Sparkles,
  ShieldAlert,
  HelpCircle,
  RefreshCw,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { ReengagementComparisonView } from '@/components/dashboard/ReengagementComparisonView';

export default function CampaignRecovery() {
  const { currentTenant, hasPermission, currentUser } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Abas
  const [activeTab, setActiveTab] = useState<'planner' | 'comparison' | 'history'>('planner');

  // Campanhas
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Contatos da campanha selecionada
  const [contacts, setContacts] = useState<ReengagementContact[]>([]);
  const [summary, setSummary] = useState<ReengagementFunnelSummary | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Seleção de contatos (IDs dos contatos selecionados)
  const [selectedContactPhones, setSelectedContactPhones] = useState<Set<string>>(new Set());

  // Regras de exclusão automáticas (ativadas por padrão)
  const [excludeDeclined60d, setExcludeDeclined60d] = useState(true);
  const [excludeApproved, setExcludeApproved] = useState(true);
  const [excludeReplied, setExcludeReplied] = useState(false);

  // Agendamento
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [scheduleTime, setScheduleTime] = useState<string>('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros da tabela
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'selected' | 'read' | 'delivered' | 'failed' | 'replied' | 'opt_in' | 'declined' | 'approved'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Histórico de logs
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (currentTenant) {
      loadCampaigns();
      loadHistory();
    }
  }, [currentTenant]);

  useEffect(() => {
    if (currentTenant && selectedCampaignId) {
      loadCampaignContacts(selectedCampaignId);
    }
  }, [currentTenant, selectedCampaignId]);

  const loadCampaigns = async () => {
    if (!currentTenant) return;
    setLoadingCampaigns(true);
    try {
      const data = await api.getCampaigns(currentTenant.id, false);
      // Filtrar campanhas com contatos ou ativas/iniciadas
      setCampaigns(data || []);
      if (data && data.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(data[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const loadCampaignContacts = async (campId: string) => {
    if (!currentTenant || !campId) return;
    setLoadingContacts(true);
    setSelectedContactPhones(new Set());
    try {
      const result = await api.getCampaignContactsForReengagement(campId, currentTenant.id);
      console.log('[Central de Reengajamento] Dados carregados:', {
        summary: result.summary,
        totalContatos: result.contacts?.length
      });
      setContacts(result.contacts || []);
      setSummary(result.summary || null);

      // Pré-selecionar pool inteligente padrão: apenas quem leu a mensagem
      applyPresetSelection('read_only', result.contacts);
    } catch (err) {
      console.error('Erro ao buscar contatos da campanha para reengajamento:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar contatos da campanha.',
        variant: 'destructive'
      });
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadHistory = async () => {
    if (!currentTenant) return;
    setLoadingHistory(true);
    try {
      const data = await api.getCampaignRecoveryLogs(currentTenant.id);
      setHistoryLogs(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico de recuperação:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Aplicação de Presets de Seleção Rápida
  const applyPresetSelection = (
    preset: 'read_only' | 'delivered_no_response' | 'failed_only' | 'all' | 'clear',
    currentList = contacts
  ) => {
    if (preset === 'clear') {
      setSelectedContactPhones(new Set());
      return;
    }

    const nextSelected = new Set<string>();

    currentList.forEach(c => {
      // Ignorar contatos bloqueados/presos na fila
      if (c.is_busy) return;

      // Respeitar travas de exclusão ativas
      if (excludeDeclined60d && c.credit_declined_60d) return;
      if (excludeApproved && c.credit_approved) return;
      if (excludeReplied && c.replied) return;

      if (preset === 'read_only') {
        if (c.read) nextSelected.add(c.clean_phone);
      } else if (preset === 'delivered_no_response') {
        if (c.delivered && !c.replied) nextSelected.add(c.clean_phone);
      } else if (preset === 'failed_only') {
        if (c.failed && !c.delivered) nextSelected.add(c.clean_phone);
      } else if (preset === 'all') {
        nextSelected.add(c.clean_phone);
      }
    });

    setSelectedContactPhones(nextSelected);
  };

  // Re-aplicar regras de exclusão sobre a seleção atual
  const handleToggleExcludeDeclined = (checked: boolean) => {
    setExcludeDeclined60d(checked);
    if (checked) {
      setSelectedContactPhones(prev => {
        const next = new Set(prev);
        contacts.forEach(c => {
          if (c.credit_declined_60d) next.delete(c.clean_phone);
        });
        return next;
      });
    }
  };

  const handleToggleExcludeApproved = (checked: boolean) => {
    setExcludeApproved(checked);
    if (checked) {
      setSelectedContactPhones(prev => {
        const next = new Set(prev);
        contacts.forEach(c => {
          if (c.credit_approved) next.delete(c.clean_phone);
        });
        return next;
      });
    }
  };

  const handleToggleExcludeReplied = (checked: boolean) => {
    setExcludeReplied(checked);
    if (checked) {
      setSelectedContactPhones(prev => {
        const next = new Set(prev);
        contacts.forEach(c => {
          if (c.replied) next.delete(c.clean_phone);
        });
        return next;
      });
    }
  };

  const toggleSelectPhone = (phone: string, disabled: boolean) => {
    if (disabled) return;
    setSelectedContactPhones(prev => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  // Filtragem e busca da tabela de contatos
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      // Busca
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.contact_name?.toLowerCase().includes(q);
        const matchesPhone = c.contact_phone?.includes(q) || c.clean_phone.includes(q);
        if (!matchesName && !matchesPhone) return false;
      }

      // Status
      if (statusFilter === 'selected') return selectedContactPhones.has(c.clean_phone);
      if (statusFilter === 'read') return c.read;
      if (statusFilter === 'delivered') return c.delivered;
      if (statusFilter === 'failed') return c.failed && !c.delivered;
      if (statusFilter === 'replied') return c.replied;
      if (statusFilter === 'opt_in') return !!c.opt_in;
      if (statusFilter === 'declined') return !!c.credit_declined_60d;
      if (statusFilter === 'approved') return !!c.credit_approved;

      return true;
    });
  }, [contacts, searchQuery, statusFilter, selectedContactPhones]);

  const paginatedContacts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [filteredContacts, page]);

  const totalPages = Math.ceil(filteredContacts.length / pageSize) || 1;

  // Toggle de todos os contatos filtrados
  const handleToggleSelectAllFiltered = () => {
    const eligibleFiltered = filteredContacts.filter(c => !c.is_busy);
    const allSelected = eligibleFiltered.every(c => selectedContactPhones.has(c.clean_phone));

    setSelectedContactPhones(prev => {
      const next = new Set(prev);
      if (allSelected) {
        eligibleFiltered.forEach(c => next.delete(c.clean_phone));
      } else {
        eligibleFiltered.forEach(c => {
          if (excludeDeclined60d && c.credit_declined_60d) return;
          if (excludeApproved && c.credit_approved) return;
          if (excludeReplied && c.replied) return;
          next.add(c.clean_phone);
        });
      }
      return next;
    });
  };

  // Ação de Enfileirar Reengajamento
  const handleScheduleReengagement = async () => {
    if (!currentTenant || !selectedCampaignId) return;

    if (!hasPermission('campaign_recovery.trigger')) {
      toast({
        title: 'Acesso Negado',
        description: 'Você não tem permissão para agendar reengajamentos.',
        variant: 'destructive'
      });
      return;
    }

    if (selectedContactPhones.size === 0) {
      toast({
        title: 'Aviso',
        description: 'Selecione pelo menos um contato no pool para reengajar.',
        variant: 'destructive'
      });
      return;
    }

    // Calcular data e hora
    let targetScheduledAt = new Date();
    if (scheduleMode === 'scheduled') {
      const [hours, minutes] = scheduleTime.split(':').map(Number);
      const [year, month, day] = scheduleDate.split('-').map(Number);
      targetScheduledAt = new Date(year, month - 1, day, hours || 9, minutes || 0, 0);

      if (targetScheduledAt.getTime() < Date.now() - 60000) {
        toast({
          title: 'Data Inválida',
          description: 'A data e horário de agendamento não podem estar no passado.',
          variant: 'destructive'
        });
        return;
      }
    }

    // Coletar contatos selecionados
    const selectedContactsList = contacts
      .filter(c => selectedContactPhones.has(c.clean_phone))
      .map(c => ({
        id: c.id,
        contact_name: c.contact_name,
        contact_phone: c.contact_phone,
        metadata: c.metadata
      }));

    setIsSubmitting(true);
    try {
      const result = await api.scheduleCampaignReengagement({
        tenantId: currentTenant.id,
        campaignId: selectedCampaignId,
        scheduledAt: targetScheduledAt,
        selectedContacts: selectedContactsList,
        targetOptions: [
          excludeDeclined60d ? 'excluir_recusados_60d' : '',
          excludeApproved ? 'excluir_aprovados' : '',
          excludeReplied ? 'excluir_respondidos' : '',
          scheduleMode === 'now' ? 'envio_imediato' : `agendado_${format(targetScheduledAt, 'yyyy-MM-dd_HH:mm')}`
        ].filter(Boolean)
      });

      if (result.success) {
        toast({
          title: 'Reengajamento Enfileirado!',
          description: result.message
        });

        // Recarregar contatos e histórico
        await loadCampaignContacts(selectedCampaignId);
        await loadHistory();

        // Mudar para aba de histórico ou comparativo
        setActiveTab('history');
      } else {
        toast({
          title: 'Atenção ao Enfileirar',
          description: result.message,
          variant: 'destructive'
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro no Agendamento',
        description: err.message || 'Falha ao agendar lote de reengajamento.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto flex flex-col bg-background">
        {/* Top Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border shrink-0">
          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigate('/campaigns')} 
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <RotateCcw className="h-6 w-6 text-blue-600" />
                  Central de Reengajamento
                </h1>
              </div>
              <p className="text-sm text-muted-foreground ml-11">
                Segmente públicos parados, aplique filtros de crédito e agende reativações sem sobrescrever o envio original
              </p>
            </div>

            {/* Campanha Ativa Badge / Status */}
            {selectedCampaign && (
              <div className="flex items-center gap-2 text-xs bg-muted/50 border border-border/80 px-3 py-1.5 rounded-lg">
                <span className="text-muted-foreground">Campanha Selecionada:</span>
                <span className="font-bold text-foreground">{selectedCampaign.name}</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                  {selectedCampaign.status}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Tabs de Navegação */}
        <div className="p-6 flex-1 min-h-0 space-y-6">
          <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <TabsList className="bg-muted/70 p-1 rounded-xl">
                <TabsTrigger 
                  value="planner" 
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg"
                >
                  <CalendarClock className="w-4 h-4 text-blue-600" />
                  Agendar Reengajamento
                </TabsTrigger>
                <TabsTrigger 
                  value="comparison" 
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg"
                >
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  Dashboard Comparativo
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg"
                >
                  <History className="w-4 h-4 text-indigo-600" />
                  Histórico de Lotes ({historyLogs.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ============================================================== */}
            {/* ABA 1: AGENDAR REENGAJAMENTO                                  */}
            {/* ============================================================== */}
            <TabsContent value="planner" className="space-y-6 mt-0 focus-visible:outline-none">
              
              {/* Passo 1: Seleção da Campanha */}
              <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">1</span>
                        Selecione a Campanha para Reengajar
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Escolha qual campanha criada, ativa ou iniciada deseja analisar e reativar contatos
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="w-full sm:w-80">
                        <Select 
                          value={selectedCampaignId} 
                          onValueChange={(val) => setSelectedCampaignId(val)}
                          disabled={loadingCampaigns}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Selecione uma campanha" />
                          </SelectTrigger>
                          <SelectContent>
                            {campaigns.map((camp) => (
                              <SelectItem key={camp.id} value={camp.id} className="text-xs">
                                {camp.name} ({camp.status})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedCampaignId) loadCampaignContacts(selectedCampaignId);
                        }}
                        disabled={loadingContacts}
                        className="h-9 px-3 text-xs gap-1.5 shrink-0"
                        title="Recarregar dados da campanha"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingContacts ? 'animate-spin' : ''}`} />
                        <span>Recarregar</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Passo 2: Funil Real da Campanha Selecionada */}
              {loadingContacts ? (
                <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
                  Carregando funil e contatos da campanha selecionada...
                </div>
              ) : !summary ? (
                <Card className="border-border/60">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Selecione uma campanha acima para carregar o funil e os contatos.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                        Funil de Disparo e Retorno da Campanha
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {summary.totalCarregados} contatos carregados originalmente
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                      {/* Total Carregados */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-muted-foreground block">Carregados</span>
                          <span className="text-xl font-bold text-foreground mt-1 block">{summary.totalCarregados}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">100% da lista</span>
                        </CardContent>
                      </Card>

                      {/* Chegaram no Celular (Entregues) */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Entregues
                          </span>
                          <span className="text-xl font-bold text-foreground mt-1 block">{summary.entregues}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            {summary.totalCarregados ? Math.round((summary.entregues / summary.totalCarregados) * 100) : 0}% no celular
                          </span>
                        </CardContent>
                      </Card>

                      {/* Lidos */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-sky-600 flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" /> Lidos
                          </span>
                          <span className="text-xl font-bold text-foreground mt-1 block">{summary.lidos}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            {summary.entregues ? Math.round((summary.lidos / summary.entregues) * 100) : 0}% dos entregues
                          </span>
                        </CardContent>
                      </Card>

                      {/* Interagiram / Responderam */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" /> Interagiram
                          </span>
                          <span className="text-xl font-bold text-emerald-600 mt-1 block">{summary.interagiram}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            {summary.lidos ? Math.round((summary.interagiram / summary.lidos) * 100) : 0}% dos lidos
                          </span>
                        </CardContent>
                      </Card>

                      {/* Opt-in Realizado */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" /> Opt-in
                          </span>
                          <span className="text-xl font-bold text-indigo-600 mt-1 block">{summary.optIn || 0}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            {summary.interagiram ? Math.round(((summary.optIn || 0) / summary.interagiram) * 100) : 0}% dos que interagiram
                          </span>
                        </CardContent>
                      </Card>

                      {/* Recusados <60d */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Recusados &lt;60d
                          </span>
                          <span className="text-xl font-bold text-rose-600 mt-1 block">{summary.recusadosCredito60d}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">Trava ativa p/ crédito</span>
                        </CardContent>
                      </Card>

                      {/* Já Aprovados */}
                      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card to-card/50">
                        <CardContent className="p-4">
                          <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                            <Award className="w-3.5 h-3.5" /> Aprovados
                          </span>
                          <span className="text-xl font-bold text-amber-600 mt-1 block">{summary.aprovadosCredito}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">Contratos ganhos</span>
                        </CardContent>
                      </Card>
                    </div>

                    {summary.emAndamentoFila > 0 && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-xs text-amber-700">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>
                          <strong>{summary.emAndamentoFila} contatos</strong> estão com envios pendentes ou em processamento na fila. Eles serão protegidos para não receberem envios duplicados.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Passo 3 & 4: Segmentação Inteligente e Configuração de Agendamento */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Painel Esquerdo: Presets e Travas de Exclusão */}
                    <Card className="lg:col-span-2 border-border/60 shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">3</span>
                          Segmentação Rápida do Pool & Travas de Proteção
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Escolha o público-alvo com 1 clique e garanta que clientes recusados ou já ganhos fiquem de fora
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        
                        {/* Presets Rápidos */}
                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                            Público-Alvo Recomendado (1 Clique):
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => applyPresetSelection('read_only')}
                              className="text-xs h-8 bg-sky-500/5 hover:bg-sky-500/15 border-sky-500/30 text-sky-700"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1 text-sky-600" />
                              Apenas Lidos ({summary.lidos})
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => applyPresetSelection('delivered_no_response')}
                              className="text-xs h-8 bg-blue-500/5 hover:bg-blue-500/15 border-blue-500/30 text-blue-700"
                            >
                              <MessageSquare className="w-3.5 h-3.5 mr-1 text-blue-600" />
                              Entregues sem Resposta ({Math.max(0, summary.entregues - summary.interagiram)})
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => applyPresetSelection('failed_only')}
                              className="text-xs h-8 bg-rose-500/5 hover:bg-rose-500/15 border-rose-500/30 text-rose-700"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                              Falhas de Entrega ({summary.falhas})
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => applyPresetSelection('all')}
                              className="text-xs h-8 text-foreground"
                            >
                              Todos os Contatos ({summary.totalCarregados})
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => applyPresetSelection('clear')}
                              className="text-xs h-8 text-muted-foreground hover:text-foreground"
                            >
                              Limpar Seleção
                            </Button>
                          </div>
                        </div>

                        {/* Travas de Exclusão Automática */}
                        <div className="pt-3 border-t border-border/60">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2.5">
                            Filtros de Exclusão Automática (Proteção de Base):
                          </Label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex items-start space-x-2.5 p-2.5 rounded-lg border border-border/70 bg-muted/20">
                              <Checkbox 
                                id="chk-ex-declined" 
                                checked={excludeDeclined60d}
                                onCheckedChange={(chk) => handleToggleExcludeDeclined(!!chk)}
                                className="mt-0.5"
                              />
                              <label htmlFor="chk-ex-declined" className="text-xs cursor-pointer select-none leading-tight">
                                <span className="font-semibold block text-foreground">Excluir Recusados &lt;60d</span>
                                <span className="text-[11px] text-muted-foreground">Evita reabordar crédito negado</span>
                              </label>
                            </div>

                            <div className="flex items-start space-x-2.5 p-2.5 rounded-lg border border-border/70 bg-muted/20">
                              <Checkbox 
                                id="chk-ex-approved" 
                                checked={excludeApproved}
                                onCheckedChange={(chk) => handleToggleExcludeApproved(!!chk)}
                                className="mt-0.5"
                              />
                              <label htmlFor="chk-ex-approved" className="text-xs cursor-pointer select-none leading-tight">
                                <span className="font-semibold block text-foreground">Excluir Já Aprovados</span>
                                <span className="text-[11px] text-muted-foreground">Não incomoda clientes ganhos</span>
                              </label>
                            </div>

                            <div className="flex items-start space-x-2.5 p-2.5 rounded-lg border border-border/70 bg-muted/20">
                              <Checkbox 
                                id="chk-ex-replied" 
                                checked={excludeReplied}
                                onCheckedChange={(chk) => handleToggleExcludeReplied(!!chk)}
                                className="mt-0.5"
                              />
                              <label htmlFor="chk-ex-replied" className="text-xs cursor-pointer select-none leading-tight">
                                <span className="font-semibold block text-foreground">Excluir Já Responderam</span>
                                <span className="text-[11px] text-muted-foreground">Foca apenas nos que ignoraram</span>
                              </label>
                            </div>
                          </div>
                        </div>

                      </CardContent>
                    </Card>

                    {/* Painel Direito: Configuração de Data/Hora e Ação */}
                    <Card className="border-border/60 shadow-sm flex flex-col justify-between">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">4</span>
                          Data e Horário do Envio
                        </CardTitle>
                        <CardDescription className="text-xs">
                          O envio utilizará o template já configurado na campanha
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        
                        {/* Modo: Agora ou Agendado */}
                        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg border border-border/60">
                          <Button
                            type="button"
                            variant={scheduleMode === 'now' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setScheduleMode('now')}
                            className="text-xs font-semibold h-8"
                          >
                            <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar Agora
                          </Button>
                          <Button
                            type="button"
                            variant={scheduleMode === 'scheduled' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setScheduleMode('scheduled')}
                            className="text-xs font-semibold h-8"
                          >
                            <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Agendar Horário
                          </Button>
                        </div>

                        {scheduleMode === 'scheduled' && (
                          <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Data de Disparo</Label>
                              <Input 
                                type="date" 
                                value={scheduleDate} 
                                min={format(new Date(), 'yyyy-MM-dd')}
                                onChange={(e) => setScheduleDate(e.target.value)}
                                className="h-9 text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Horário de Disparo</Label>
                              <Input 
                                type="time" 
                                value={scheduleTime} 
                                onChange={(e) => setScheduleTime(e.target.value)}
                                className="h-9 text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {/* Resumo do Lote */}
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs space-y-1 text-muted-foreground">
                          <div className="flex justify-between items-center text-foreground font-semibold">
                            <span>Contatos no Pool:</span>
                            <span className="text-sm font-bold text-blue-600">{selectedContactPhones.size}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span>Execução:</span>
                            <span>{scheduleMode === 'now' ? 'Imediata' : `${format(new Date(`${scheduleDate}T${scheduleTime}`), 'dd/MM/yyyy HH:mm')}`}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span>Envio Original:</span>
                            <span className="text-emerald-600 font-medium">Preservado integralmente</span>
                          </div>
                        </div>

                        {/* Botão de Disparo */}
                        <Button 
                          className="w-full font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                          size="lg"
                          disabled={isSubmitting || selectedContactPhones.size === 0 || !hasPermission('campaign_recovery.trigger')}
                          onClick={handleScheduleReengagement}
                        >
                          {isSubmitting ? (
                            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Enfileirando Lote...</>
                          ) : scheduleMode === 'now' ? (
                            <><Send className="mr-2 h-4 w-4" /> Disparar Pool Agora ({selectedContactPhones.size})</>
                          ) : (
                            <><CalendarClock className="mr-2 h-4 w-4" /> Agendar Reengajamento ({selectedContactPhones.size})</>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Passo 5: Tabela Granular de Contatos da Campanha */}
                  <Card className="border-border/60 shadow-sm">
                    <CardHeader className="py-4 border-b border-border/50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">5</span>
                            Lista Granular de Contatos ({filteredContacts.length})
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Marque ou desmarque individualmente cada contato antes de disparar
                          </CardDescription>
                        </div>

                        {/* Filtros e Busca */}
                        <div className="flex items-center gap-2.5">
                          <div className="relative w-48 sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder="Buscar por nome ou celular..."
                              value={searchQuery}
                              onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                              }}
                              className="pl-8 h-8 text-xs"
                            />
                          </div>

                          <Select 
                            value={statusFilter} 
                            onValueChange={(val: any) => {
                              setStatusFilter(val);
                              setPage(1);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs w-36">
                              <SelectValue placeholder="Filtrar status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all" className="text-xs">Todos ({contacts.length})</SelectItem>
                              <SelectItem value="selected" className="text-xs">Selecionados ({selectedContactPhones.size})</SelectItem>
                              <SelectItem value="read" className="text-xs">Lidos ({summary.lidos})</SelectItem>
                              <SelectItem value="delivered" className="text-xs">Entregues ({summary.entregues})</SelectItem>
                              <SelectItem value="replied" className="text-xs">Responderam ({summary.interagiram})</SelectItem>
                              <SelectItem value="opt_in" className="text-xs">Opt-in ({summary.optIn || 0})</SelectItem>
                              <SelectItem value="declined" className="text-xs">Recusados ({summary.recusadosCredito60d})</SelectItem>
                              <SelectItem value="approved" className="text-xs">Aprovados ({summary.aprovadosCredito})</SelectItem>
                              <SelectItem value="failed" className="text-xs">Falhas ({summary.falhas})</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/40 uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">
                            <tr>
                              <th className="py-2.5 px-3 w-10 text-center">
                                <Checkbox 
                                  checked={
                                    filteredContacts.length > 0 &&
                                    filteredContacts.filter(c => !c.is_busy).every(c => selectedContactPhones.has(c.clean_phone))
                                  }
                                  onCheckedChange={handleToggleSelectAllFiltered}
                                />
                              </th>
                              <th className="py-2.5 px-3">Contato / Telefone</th>
                              <th className="py-2.5 px-3 text-center">Envio Original</th>
                              <th className="py-2.5 px-3 text-center">Interação</th>
                              <th className="py-2.5 px-3">Status de Crédito</th>
                              <th className="py-2.5 px-3 text-center">Reengajamentos</th>
                              <th className="py-2.5 px-3 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {paginatedContacts.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs">
                                  Nenhum contato encontrado com os filtros atuais.
                                </td>
                              </tr>
                            ) : (
                              paginatedContacts.map((contact) => {
                                const isSelected = selectedContactPhones.has(contact.clean_phone);
                                const isBusy = contact.is_busy;

                                return (
                                  <tr 
                                    key={contact.id} 
                                    className={`hover:bg-muted/20 transition-colors ${
                                      isSelected ? 'bg-blue-500/5' : ''
                                    } ${isBusy ? 'opacity-60 bg-muted/10' : ''}`}
                                  >
                                    {/* Checkbox */}
                                    <td className="py-2.5 px-3 text-center">
                                      <Checkbox 
                                        checked={isSelected}
                                        disabled={isBusy}
                                        onCheckedChange={() => toggleSelectPhone(contact.clean_phone, isBusy)}
                                      />
                                    </td>

                                    {/* Nome e Telefone */}
                                    <td className="py-2.5 px-3">
                                      <span className="font-semibold text-foreground block">{contact.contact_name}</span>
                                      <span className="font-mono text-[11px] text-muted-foreground">{contact.contact_phone}</span>
                                      {contact.identifier && (
                                        <span className="text-[10px] text-muted-foreground block">Doc: {contact.identifier}</span>
                                      )}
                                    </td>

                                    {/* Status de Envio */}
                                    <td className="py-2.5 px-3 text-center">
                                      {contact.read ? (
                                        <Badge variant="outline" className="bg-sky-500/10 text-sky-600 border-sky-500/20 text-[10px] py-0 px-1.5">
                                          Lida
                                        </Badge>
                                      ) : contact.delivered ? (
                                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] py-0 px-1.5">
                                          Entregue
                                        </Badge>
                                      ) : contact.failed ? (
                                        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/20 text-[10px] py-0 px-1.5">
                                          Falha
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                          {contact.original_status}
                                        </Badge>
                                      )}
                                    </td>

                                    {/* Interação / Resposta & Opt-in */}
                                    <td className="py-2.5 px-3 text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        {contact.replied ? (
                                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] py-0 px-1.5 font-bold">
                                            Respondeu
                                          </Badge>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground">-</span>
                                        )}
                                        {contact.opt_in && (
                                          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[9px] py-0 px-1 font-semibold">
                                            Opt-in
                                          </Badge>
                                        )}
                                      </div>
                                    </td>

                                    {/* Crédito */}
                                    <td className="py-2.5 px-3">
                                      {contact.credit_approved ? (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] py-0 px-1.5 font-bold">
                                          Aprovado / Formalizado
                                        </Badge>
                                      ) : contact.credit_declined_60d ? (
                                        <div className="space-y-0.5">
                                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/20 text-[10px] py-0 px-1.5">
                                            Recusado ({contact.credit_declined_days_ago}d atrás)
                                          </Badge>
                                          {contact.credit_declined_reason && (
                                            <span className="text-[10px] text-muted-foreground block truncate max-w-[160px]" title={contact.credit_declined_reason}>
                                              {contact.credit_declined_reason}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-[11px] text-muted-foreground">Sem recusa &lt;60d</span>
                                      )}
                                    </td>

                                    {/* Reengajamentos anteriores */}
                                    <td className="py-2.5 px-3 text-center">
                                      {contact.reengagement_count > 0 ? (
                                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                          {contact.reengagement_count}x anterior
                                        </Badge>
                                      ) : (
                                        <span className="text-[11px] text-muted-foreground">1º Envio</span>
                                      )}
                                    </td>

                                    {/* Ação / Trava */}
                                    <td className="py-2.5 px-3 text-right">
                                      {isBusy ? (
                                        <span className="text-[10px] text-amber-600 font-semibold flex items-center justify-end gap-1">
                                          <ShieldAlert className="w-3 h-3" /> Na Fila
                                        </span>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => toggleSelectPhone(contact.clean_phone, false)}
                                          className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                                        >
                                          {isSelected ? 'Desmarcar' : 'Selecionar'}
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginação */}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
                        <div>
                          Mostrando {paginatedContacts.length} de {filteredContacts.length} contatos filtrados
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-7 px-2"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-xs">
                            Página {page} de {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            className="h-7 px-2"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ============================================================== */}
            {/* ABA 2: DASHBOARD COMPARATIVO                                  */}
            {/* ============================================================== */}
            <TabsContent value="comparison" className="space-y-6 mt-0 focus-visible:outline-none">
              <ReengagementComparisonView 
                initialCampaignId={selectedCampaignId}
                onSelectCampaign={(id) => setSelectedCampaignId(id)}
              />
            </TabsContent>

            {/* ============================================================== */}
            {/* ABA 3: HISTÓRICO DE LOTES                                     */}
            {/* ============================================================== */}
            <TabsContent value="history" className="space-y-6 mt-0 focus-visible:outline-none">
              <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <History className="w-4 h-4 text-indigo-600" />
                        Histórico Geral de Reengajamentos
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Auditoria de todos os lotes de recuperação disparados ou agendados
                      </CardDescription>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={loadHistory} 
                      disabled={loadingHistory}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {historyLogs.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Nenhum registro de recuperação encontrado até o momento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">
                          <tr>
                            <th className="py-3 px-4">Data / Hora</th>
                            <th className="py-3 px-4">Campanha</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4">Critérios / Alvos</th>
                            <th className="py-3 px-4 text-right">Contatos no Lote</th>
                            <th className="py-3 px-4 text-center">Duração</th>
                            <th className="py-3 px-4">Lote ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {historyLogs.map((log) => {
                            const camp = campaigns.find(c => c.id === log.campaign_id);

                            return (
                              <tr key={log.id} className="hover:bg-muted/20">
                                <td className="py-3 px-4 font-medium text-foreground">
                                  {log.started_at ? format(new Date(log.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                                </td>
                                <td className="py-3 px-4 font-semibold text-foreground">
                                  {camp?.name || 'Campanha'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Badge 
                                    variant={log.status === 'completed' ? 'default' : 'secondary'}
                                    className={`text-[10px] py-0 px-2 font-semibold ${
                                      log.status === 'completed' 
                                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                                        : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                    }`}
                                  >
                                    {log.status === 'completed' ? 'Concluído' : log.status === 'running' ? 'Em Processamento' : 'Agendado'}
                                  </Badge>
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">
                                  {Array.isArray(log.target_options) ? log.target_options.join(', ') : 'Personalizado'}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-foreground">
                                  {log.records_affected || 0}
                                </td>
                                <td className="py-3 px-4 text-center text-muted-foreground">
                                  {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                                </td>
                                <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                                  {String(log.id || '').substring(0, 8)}...
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
