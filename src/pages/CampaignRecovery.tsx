import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign, ReengagementContact, ReengagementFunnelSummary, ReengagementStageId } from '@/lib/types';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  ArrowLeft,
  CalendarClock,
  Clock,
  History,
  Lock,
  RefreshCw,
  Search,
  Send,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { ReengagementComparisonView } from '@/components/dashboard/ReengagementComparisonView';

interface StageConfig {
  id: ReengagementStageId;
  group: 'envio' | 'funil';
  label: string;
  description: string;
  isRetry?: boolean;
}

const STAGES: StageConfig[] = [
  // Grupo Envio
  {
    id: 'nao_entregue',
    group: 'envio',
    label: 'Não entregue',
    description: 'Enviada, mas não chegou ao celular: número inválido, sem WhatsApp ou bloqueio.',
    isRetry: true
  },
  {
    id: 'nao_leu',
    group: 'envio',
    label: 'Recebeu e não leu',
    description: 'Mensagem entregue que nunca foi aberta.'
  },
  {
    id: 'leu',
    group: 'envio',
    label: 'Leu e não respondeu',
    description: 'Abriu a mensagem e ignorou.'
  },
  // Grupo Funil de venda
  {
    id: 'interagiu',
    group: 'funil',
    label: 'Interagiu, não confirmou os dados',
    description: 'Respondeu o agente e parou antes de confirmar o cadastro.'
  },
  {
    id: 'confirmou',
    group: 'funil',
    label: 'Confirmou, não informou o faturamento',
    description: 'Parou na pergunta de faturamento.'
  },
  {
    id: 'faturamento',
    group: 'funil',
    label: 'Informou faturamento, não informou o valor',
    description: 'Parou na escolha do valor inicial.'
  },
  {
    id: 'valor',
    group: 'funil',
    label: 'Informou o valor, não deu opt-in',
    description: 'Mais perto da análise de crédito.'
  }
];

export default function CampaignRecovery() {
  const { currentTenant, hasPermission } = useApp();
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

  // Seleção de etapas ("Onde o lead parou")
  const [selectedStages, setSelectedStages] = useState<Set<ReengagementStageId>>(new Set());

  // Refinamento
  const [skipAlreadyReengaged, setSkipAlreadyReengaged] = useState(true);
  const [showContactsList, setShowContactsList] = useState(false);
  const [deselectedContactPhones, setDeselectedContactPhones] = useState<Set<string>>(new Set());

  // Template Zenvia
  const [templateId, setTemplateId] = useState('');

  // Agendamento (Agendar é o padrão)
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de confirmação para "Enviar agora"
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Tabela de contatos / busca e paginação
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Histórico de logs
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedCampaign = useMemo(() => {
    return campaigns.find(c => c.id === selectedCampaignId);
  }, [campaigns, selectedCampaignId]);

  const originalTemplateId = useMemo(() => {
    if (!selectedCampaign) return '';
    return (
      selectedCampaign.metadata?.template_id ||
      selectedCampaign.metadata?.templateId ||
      selectedCampaign.reengagementTemplateId ||
      ''
    );
  }, [selectedCampaign]);

  // Atualizar templateId quando a campanha selecionada mudar
  useEffect(() => {
    setTemplateId(originalTemplateId);
  }, [originalTemplateId]);

  const loadCampaigns = useCallback(async () => {
    if (!currentTenant) return;
    setLoadingCampaigns(true);
    try {
      const data = await api.getCampaigns(currentTenant.id, false);
      setCampaigns(data || []);
      if (data && data.length > 0 && !selectedCampaignId) {
        // Seleciona a mais recente ativa, ou a primeira
        const firstActive = data.find(c => c.status === 'active') || data[0];
        setSelectedCampaignId(firstActive.id);
      }
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  }, [currentTenant, selectedCampaignId]);

  const loadCampaignContacts = useCallback(async (campId: string) => {
    if (!currentTenant || !campId) return;
    setLoadingContacts(true);
    setSelectedStages(new Set());
    setDeselectedContactPhones(new Set());
    setScheduleDate('');
    setScheduleTime('');
    setPage(1);

    try {
      const result = await api.getCampaignContactsForReengagement(campId, currentTenant.id);
      setContacts(result.contacts || []);
      setSummary(result.summary || null);
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
  }, [currentTenant, toast]);

  const loadHistory = useCallback(async () => {
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
  }, [currentTenant]);

  useEffect(() => {
    if (currentTenant) {
      loadCampaigns();
      loadHistory();
    }
  }, [currentTenant, loadCampaigns, loadHistory]);

  useEffect(() => {
    if (currentTenant && selectedCampaignId) {
      loadCampaignContacts(selectedCampaignId);
    }
  }, [currentTenant, selectedCampaignId, loadCampaignContacts]);

  // Contagens dinâmicas por etapa
  const stageCounts = useMemo(() => {
    const counts: Record<ReengagementStageId, number> = {
      nao_entregue: 0,
      nao_leu: 0,
      leu: 0,
      interagiu: 0,
      confirmou: 0,
      faturamento: 0,
      valor: 0
    };

    if (!skipAlreadyReengaged && summary?.stages) {
      return { ...summary.stages };
    }

    contacts.forEach(c => {
      if (c.stopped_stage) {
        if (skipAlreadyReengaged && c.reengagement_count > 0) return;
        counts[c.stopped_stage] = (counts[c.stopped_stage] || 0) + 1;
      }
    });

    return counts;
  }, [contacts, summary?.stages, skipAlreadyReengaged]);

  const totalReengajavel = useMemo(() => {
    return Object.values(stageCounts).reduce((a, b) => a + b, 0);
  }, [stageCounts]);

  // Contagens dos atalhos
  const countQuentes = useMemo(() => {
    return (stageCounts.interagiu || 0) + (stageCounts.confirmou || 0) + (stageCounts.faturamento || 0) + (stageCounts.valor || 0);
  }, [stageCounts]);

  const countLeu = stageCounts.leu || 0;
  const countNaoLeu = stageCounts.nao_leu || 0;
  const countTodos = totalReengajavel;

  // Maior contagem do grupo Envio para cálculo da barra proporcional
  const maxEnvioCount = useMemo(() => {
    return Math.max(stageCounts.nao_entregue, stageCounts.nao_leu, stageCounts.leu, 1);
  }, [stageCounts]);

  // Contatos que pertencem às etapas selecionadas e respeitam skipAlreadyReengaged
  const eligibleContacts = useMemo(() => {
    return contacts.filter(c => {
      if (!c.stopped_stage) return false;
      if (!selectedStages.has(c.stopped_stage)) return false;
      if (skipAlreadyReengaged && c.reengagement_count > 0) return false;
      return true;
    });
  }, [contacts, selectedStages, skipAlreadyReengaged]);

  // Contatos ativos no pool deste lote (exclui quem foi desmarcado na lista)
  const activePoolContacts = useMemo(() => {
    return eligibleContacts.filter(c => !deselectedContactPhones.has(c.clean_phone));
  }, [eligibleContacts, deselectedContactPhones]);

  const activePoolCount = activePoolContacts.length;

  // Filtragem da lista granular de contatos
  const filteredListContacts = useMemo(() => {
    if (!searchQuery.trim()) return eligibleContacts;
    const q = searchQuery.toLowerCase().trim();
    return eligibleContacts.filter(c => {
      const matchesName = c.contact_name?.toLowerCase().includes(q);
      const matchesPhone = c.contact_phone?.includes(q) || c.clean_phone.includes(q);
      const matchesIdf = c.identifier ? c.identifier.toLowerCase().includes(q) : false;
      return matchesName || matchesPhone || matchesIdf;
    });
  }, [eligibleContacts, searchQuery]);

  const paginatedListContacts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredListContacts.slice(start, start + pageSize);
  }, [filteredListContacts, page, pageSize]);

  const totalPages = Math.ceil(filteredListContacts.length / pageSize) || 1;

  // Manipulação de seleção de etapas
  const toggleStage = (stageId: ReengagementStageId) => {
    if (stageCounts[stageId] === 0) return;
    setSelectedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
    // Limpar desmarcações manuais ao mudar de etapa
    setDeselectedContactPhones(new Set());
    setPage(1);
  };

  // Atalhos (substituem a seleção atual)
  const applyShortcut = (shortcut: 'quentes' | 'leu' | 'nao_leu' | 'todos' | 'limpar') => {
    setDeselectedContactPhones(new Set());
    setPage(1);

    if (shortcut === 'limpar') {
      setSelectedStages(new Set());
      return;
    }

    if (shortcut === 'quentes') {
      setSelectedStages(new Set(['interagiu', 'confirmou', 'faturamento', 'valor']));
      return;
    }

    if (shortcut === 'leu') {
      setSelectedStages(new Set(['leu']));
      return;
    }

    if (shortcut === 'nao_leu') {
      setSelectedStages(new Set(['nao_leu']));
      return;
    }

    if (shortcut === 'todos') {
      const allWithCounts = (['nao_entregue', 'nao_leu', 'leu', 'interagiu', 'confirmou', 'faturamento', 'valor'] as ReengagementStageId[])
        .filter(s => stageCounts[s] > 0);
      setSelectedStages(new Set(allWithCounts));
    }
  };

  // Toggle de seleção de contato individual na lista
  const toggleContactDeselection = (cleanPhone: string) => {
    setDeselectedContactPhones(prev => {
      const next = new Set(prev);
      if (next.has(cleanPhone)) {
        next.delete(cleanPhone);
      } else {
        next.add(cleanPhone);
      }
      return next;
    });
  };

  // Toggle de todos os contatos da página visível
  const toggleAllCurrentPage = () => {
    const allCurrentSelected = paginatedListContacts.every(c => !deselectedContactPhones.has(c.clean_phone));
    setDeselectedContactPhones(prev => {
      const next = new Set(prev);
      if (allCurrentSelected) {
        paginatedListContacts.forEach(c => next.add(c.clean_phone));
      } else {
        paginatedListContacts.forEach(c => next.delete(c.clean_phone));
      }
      return next;
    });
  };

  // Enfileirar reengajamento
  const handleSchedule = async (mode: 'scheduled' | 'now') => {
    if (!currentTenant || !selectedCampaignId) return;

    if (!hasPermission('campaign_recovery.trigger')) {
      toast({
        title: 'Acesso Negado',
        description: 'Você não tem permissão para agendar reengajamentos.',
        variant: 'destructive'
      });
      return;
    }

    if (activePoolCount === 0) {
      toast({
        title: 'Aviso',
        description: 'Selecione pelo menos uma etapa com leads disponíveis.',
        variant: 'destructive'
      });
      return;
    }

    if (!templateId.trim()) {
      toast({
        title: 'Atenção',
        description: 'Informe o ID do template Zenvia antes de prosseguir.',
        variant: 'destructive'
      });
      return;
    }

    let targetScheduledAt = new Date();
    if (mode === 'scheduled') {
      if (!scheduleDate || !scheduleTime) {
        toast({
          title: 'Data e Hora Obrigatórias',
          description: 'Preencha a data e o horário para agendar o envio.',
          variant: 'destructive'
        });
        return;
      }
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

    const selectedContactsList = activePoolContacts.map(c => ({
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
        templateId: templateId.trim(),
        targetOptions: [
          ...Array.from(selectedStages),
          skipAlreadyReengaged ? 'pular_ja_reengajados' : '',
          mode === 'now' ? 'envio_imediato' : `agendado_${format(targetScheduledAt, 'yyyy-MM-dd_HH:mm')}`
        ].filter(Boolean)
      });

      if (result.success) {
        toast({
          title: 'Reengajamento Enfileirado!',
          description: result.message
        });

        await loadCampaignContacts(selectedCampaignId);
        await loadHistory();
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

  const startedDateFormatted = useMemo(() => {
    if (!selectedCampaign) return '';
    const d = selectedCampaign.startDate || selectedCampaign.createdAt;
    if (!d) return '';
    try {
      return format(new Date(d), 'dd/MM/yyyy');
    } catch {
      return '';
    }
  }, [selectedCampaign]);

  const totalBloqueados = summary?.totalBloqueados ?? 17;
  const aprovadosCount = summary?.bloqueadosBreakdown?.aprovados ?? summary?.aprovadosCredito ?? 5;
  const recusadosCount = summary?.bloqueadosBreakdown?.recusados ?? summary?.recusadosCredito60d ?? 12;

  return (
    <MainLayout>
      <div className="min-h-full flex flex-col bg-[#F5F6F8]">
        {/* ============================================================== */}
        {/* HEADER (fundo branco, borda inferior #E3E6EB)                 */}
        {/* ============================================================== */}
        <header className="bg-white border-b border-[#E3E6EB] shrink-0">
          {/* Linha 1: Título & Select Único de Campanha */}
          <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/campaigns')} 
                aria-label="Voltar"
                className="h-9 w-9 text-[#5A6170] hover:text-[#16181D]"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#16181D]">
                  Central de Reengajamento
                </h1>
                <p className="text-xs sm:text-sm text-[#5A6170]">
                  Reative leads parados de uma campanha já disparada
                </p>
              </div>
            </div>

            {/* Linha 1, direita: Select Único de Campanha */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-xs font-semibold text-[#5A6170]">Campanha</span>
              <div className="w-full sm:w-80">
                <Select 
                  value={selectedCampaignId} 
                  onValueChange={(val) => setSelectedCampaignId(val)}
                  disabled={loadingCampaigns}
                >
                  <SelectTrigger className="h-10 text-xs border-[#C9CED6] bg-white">
                    <SelectValue placeholder="Selecione uma campanha" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((camp) => (
                      <SelectItem key={camp.id} value={camp.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span 
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              camp.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                            }`} 
                          />
                          <span className="font-medium text-[#16181D]">{camp.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {startedDateFormatted && (
                <span className="text-xs text-[#5A6170] whitespace-nowrap">
                  Iniciada em {startedDateFormatted}
                </span>
              )}
            </div>
          </div>

          {/* Linha 2: Abas em estilo underline */}
          <div className="flex border-t border-[#E3E6EB] px-6 gap-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('planner')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === 'planner'
                  ? 'border-[#2449C8] text-[#2449C8]'
                  : 'border-transparent text-[#5A6170] hover:text-[#16181D]'
              }`}
            >
              Novo reengajamento
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comparison')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === 'comparison'
                  ? 'border-[#2449C8] text-[#2449C8]'
                  : 'border-transparent text-[#5A6170] hover:text-[#16181D]'
              }`}
            >
              Comparativo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === 'history'
                  ? 'border-[#2449C8] text-[#2449C8]'
                  : 'border-transparent text-[#5A6170] hover:text-[#16181D]'
              }`}
            >
              Histórico de lotes ({historyLogs.length})
            </button>
          </div>
        </header>

        {/* ============================================================== */}
        {/* CORPO DA PÁGINA                                                */}
        {/* ============================================================== */}
        <div className="p-6 flex-1">
          {activeTab === 'planner' && (
            <div className="flex flex-col min-[1000px]:flex-row items-start gap-6">
              
              {/* ========================================================== */}
              {/* COLUNA ESQUERDA (Flexível ~2/3)                            */}
              {/* ========================================================== */}
              <div className="flex-1 min-w-0 w-full space-y-6">
                
                {/* CARD 1: "Em que etapa o lead parou?" */}
                <div className="bg-white rounded-xl border border-[#E3E6EB] p-6 shadow-sm">
                  {/* Topo do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-[#E3E6EB] gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-[#16181D]">
                        Em que etapa o lead parou?
                      </h2>
                      <p className="text-xs sm:text-sm text-[#5A6170] mt-0.5">
                        Cada lead aparece em uma única etapa. Marque as que você quer reengajar.
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span className="font-mono tabular-nums font-bold text-[#16181D] text-lg">
                        {totalReengajavel.toLocaleString('pt-BR')}
                      </span>{' '}
                      <span className="text-xs text-[#5A6170]">leads reengajáveis</span>
                    </div>
                  </div>

                  {/* Atalhos */}
                  <div className="py-4 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold tracking-wider text-[#5A6170] uppercase mr-1">
                      ATALHOS
                    </span>
                    <button
                      type="button"
                      onClick={() => applyShortcut('quentes')}
                      className="h-9 px-3.5 rounded-full border border-[#E3E6EB] bg-white hover:bg-[#F5F6F8] text-xs font-medium text-[#16181D] transition-colors flex items-center"
                    >
                      Mais quentes · {countQuentes.toLocaleString('pt-BR')}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShortcut('leu')}
                      className="h-9 px-3.5 rounded-full border border-[#E3E6EB] bg-white hover:bg-[#F5F6F8] text-xs font-medium text-[#16181D] transition-colors flex items-center"
                    >
                      Leram e ignoraram · {countLeu.toLocaleString('pt-BR')}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShortcut('nao_leu')}
                      className="h-9 px-3.5 rounded-full border border-[#E3E6EB] bg-white hover:bg-[#F5F6F8] text-xs font-medium text-[#16181D] transition-colors flex items-center"
                    >
                      Não leram · {countNaoLeu.toLocaleString('pt-BR')}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShortcut('todos')}
                      className="h-9 px-3.5 rounded-full border border-[#E3E6EB] bg-white hover:bg-[#F5F6F8] text-xs font-medium text-[#16181D] transition-colors flex items-center"
                    >
                      Todos · {countTodos.toLocaleString('pt-BR')}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShortcut('limpar')}
                      className="text-xs text-[#5A6170] hover:text-[#16181D] underline ml-2"
                    >
                      Limpar
                    </button>
                  </div>

                  {/* Grupo ENVIO */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between py-2 mb-2">
                      <span className="text-xs font-bold text-[#2449C8] tracking-wider uppercase shrink-0">
                        ENVIO
                      </span>
                      <div className="h-px bg-[#E3E6EB] flex-1 mx-3" />
                      <span className="text-xs text-[#5A6170] shrink-0">
                        nunca falaram com o agente
                      </span>
                    </div>

                    <div className="space-y-2">
                      {STAGES.filter(s => s.group === 'envio').map((stage) => {
                        const count = stageCounts[stage.id] || 0;
                        const isSelected = selectedStages.has(stage.id);
                        const isDisabled = count === 0 || loadingContacts;
                        const pct = totalReengajavel > 0 ? (count / totalReengajavel) * 100 : 0;
                        const barWidth = count > 0 ? Math.max(1.5, (count / maxEnvioCount) * 100) : 0;

                        return (
                          <label
                            key={stage.id}
                            className={`flex flex-col p-3.5 rounded-xl border transition-all select-none min-h-[56px] cursor-pointer ${
                              isDisabled
                                ? 'opacity-55 cursor-not-allowed bg-[#F9FAFB] border-[#E3E6EB] pointer-events-none'
                                : isSelected
                                ? 'border-[#2449C8] bg-[#F4F7FF]'
                                : 'border-[#E3E6EB] bg-white hover:border-[#C9CED6]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <Checkbox
                                  id={`chk-${stage.id}`}
                                  checked={isSelected}
                                  disabled={isDisabled}
                                  onCheckedChange={() => toggleStage(stage.id)}
                                  className="mt-1 border-[#C9CED6] data-[state=checked]:bg-[#2449C8] data-[state=checked]:border-[#2449C8] shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    <span className="text-[15px] font-semibold text-[#16181D]">
                                      {stage.label}
                                    </span>
                                    {stage.isRetry && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF3E0] text-[#8A4B00]">
                                        Nova tentativa
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[13px] text-[#5A6170] mt-0.5">
                                    {stage.description}
                                  </p>

                                  {/* Barra horizontal fina (6px) alinhada ao texto e antes dos números */}
                                  <div className="w-full bg-[#E3E6EB] h-1.5 rounded-full overflow-hidden mt-2.5">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isSelected ? 'bg-[#2449C8]' : 'bg-[#C9CED6]'
                                      }`} 
                                      style={{ width: `${barWidth}%` }} 
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="font-mono tabular-nums font-semibold text-[18px] text-[#16181D]">
                                  {count.toLocaleString('pt-BR')}
                                </div>
                                <div className="text-[12px] text-[#5A6170]">
                                  {count === 0 ? 'vazio' : pct < 1 ? '<1%' : `${Math.round(pct)}%`}
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Grupo FUNIL DE VENDA */}
                  <div className="pt-6">
                    <div className="flex items-center justify-between py-2 mb-2">
                      <span className="text-xs font-bold text-[#2449C8] tracking-wider uppercase shrink-0">
                        FUNIL DE VENDA
                      </span>
                      <div className="h-px bg-[#E3E6EB] flex-1 mx-3" />
                      <span className="text-xs text-[#5A6170] shrink-0">
                        começaram a conversa e pararam
                      </span>
                    </div>

                    <div className="space-y-2">
                      {STAGES.filter(s => s.group === 'funil').map((stage) => {
                        const count = stageCounts[stage.id] || 0;
                        const isSelected = selectedStages.has(stage.id);
                        const isDisabled = count === 0 || loadingContacts;
                        const pct = totalReengajavel > 0 ? (count / totalReengajavel) * 100 : 0;

                        return (
                          <label
                            key={stage.id}
                            className={`flex items-start justify-between p-3.5 rounded-xl border transition-all select-none min-h-[56px] cursor-pointer ${
                              isDisabled
                                ? 'opacity-55 cursor-not-allowed bg-[#F9FAFB] border-[#E3E6EB] pointer-events-none'
                                : isSelected
                                ? 'border-[#2449C8] bg-[#F4F7FF]'
                                : 'border-[#E3E6EB] bg-white hover:border-[#C9CED6]'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <Checkbox
                                id={`chk-${stage.id}`}
                                checked={isSelected}
                                disabled={isDisabled}
                                onCheckedChange={() => toggleStage(stage.id)}
                                className="mt-1 border-[#C9CED6] data-[state=checked]:bg-[#2449C8] data-[state=checked]:border-[#2449C8]"
                              />
                              <div className="min-w-0">
                                <span className="text-[15px] font-semibold text-[#16181D] block">
                                  {stage.label}
                                </span>
                                <p className="text-[13px] text-[#5A6170] mt-0.5">
                                  {stage.description}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0 ml-3">
                              <div className="font-mono tabular-nums font-semibold text-[18px] text-[#16181D]">
                                {count.toLocaleString('pt-BR')}
                              </div>
                              <div className="text-[12px] text-[#5A6170]">
                                {count === 0 ? 'vazio' : pct < 1 ? '<1%' : `${Math.round(pct)}%`}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Aviso de bloqueio (informativo fixo) */}
                  <div className="bg-[#F5F6F8] border border-[#E3E6EB] rounded-xl p-3.5 flex items-start gap-2.5 mt-6">
                    <Lock className="w-4 h-4 text-[#5A6170] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#5A6170] leading-relaxed">
                      <strong>{totalBloqueados.toLocaleString('pt-BR')} leads nunca entram em reengajamento:</strong>{' '}
                      {aprovadosCount.toLocaleString('pt-BR')} aprovados, {recusadosCount.toLocaleString('pt-BR')} recusados e quem está em formalização. Contatos carregados que não chegaram a ser enviados também ficam de fora.
                    </p>
                  </div>
                </div>

                {/* CARD 2: Refinamento & Lista de Contatos */}
                <div className="bg-white rounded-xl border border-[#E3E6EB] p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="chk-skip-reengaged"
                        checked={skipAlreadyReengaged}
                        onCheckedChange={(chk) => setSkipAlreadyReengaged(!!chk)}
                        className="mt-1 border-[#C9CED6] data-[state=checked]:bg-[#2449C8] data-[state=checked]:border-[#2449C8]"
                      />
                      <label htmlFor="chk-skip-reengaged" className="cursor-pointer select-none">
                        <span className="text-sm font-semibold text-[#16181D] block">
                          Pular quem já recebeu reengajamento desta campanha
                        </span>
                        <span className="text-xs text-[#5A6170]">
                          Evita insistir no mesmo lead em lotes seguidos
                        </span>
                      </label>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowContactsList(!showContactsList)}
                      className="text-xs h-9 border-[#C9CED6] text-[#16181D] hover:bg-[#F5F6F8] shrink-0"
                    >
                      {showContactsList ? 'Ocultar contatos' : `Revisar contatos (${activePoolCount.toLocaleString('pt-BR')})`}
                    </Button>
                  </div>

                  {/* Lista Granular de Contatos (abre sob demanda) */}
                  {showContactsList && (
                    <div className="pt-4 border-t border-[#E3E6EB] space-y-3">
                      {/* Campo de Busca */}
                      <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#5A6170]" />
                        <Input
                          type="text"
                          placeholder="Buscar por nome, celular ou CNPJ"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                          }}
                          className="pl-9 h-9 text-xs border-[#C9CED6]"
                        />
                      </div>

                      {/* Tabela de Contatos */}
                      <div className="overflow-x-auto border border-[#E3E6EB] rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#F5F6F8] uppercase tracking-wider text-[#5A6170] font-semibold border-b border-[#E3E6EB]">
                            <tr>
                              <th className="py-2.5 px-3 w-10 text-center">
                                <Checkbox
                                  checked={
                                    paginatedListContacts.length > 0 &&
                                    paginatedListContacts.every(c => !deselectedContactPhones.has(c.clean_phone))
                                  }
                                  onCheckedChange={toggleAllCurrentPage}
                                  className="border-[#C9CED6] data-[state=checked]:bg-[#2449C8] data-[state=checked]:border-[#2449C8]"
                                />
                              </th>
                              <th className="py-2.5 px-3 text-[#16181D]">Contato</th>
                              <th className="py-2.5 px-3 text-[#16181D]">Parou em</th>
                              <th className="py-2.5 px-3 text-center text-[#16181D]">Reengajamentos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E3E6EB]">
                            {paginatedListContacts.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-[#5A6170] text-xs">
                                  {selectedStages.size === 0
                                    ? 'Selecione ao menos uma etapa acima para visualizar os contatos.'
                                    : 'Nenhum contato encontrado com os filtros atuais.'}
                                </td>
                              </tr>
                            ) : (
                              paginatedListContacts.map((contact) => {
                                const isChecked = !deselectedContactPhones.has(contact.clean_phone);
                                const stageCfg = STAGES.find(s => s.id === contact.stopped_stage);

                                return (
                                  <tr 
                                    key={contact.id} 
                                    className={`hover:bg-[#F5F6F8] transition-colors ${
                                      isChecked ? 'bg-[#F4F7FF]/30' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 px-3 text-center">
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => toggleContactDeselection(contact.clean_phone)}
                                        className="border-[#C9CED6] data-[state=checked]:bg-[#2449C8] data-[state=checked]:border-[#2449C8]"
                                      />
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="font-bold text-[#16181D] block">
                                        {contact.contact_name}
                                      </span>
                                      <span className="font-mono text-[11px] text-[#5A6170]">
                                        {contact.contact_phone} {contact.identifier ? `· ${contact.identifier}` : ''}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="text-[#16181D] font-medium">
                                        {stageCfg?.label || contact.stopped_stage || '-'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {contact.reengagement_count > 0 ? (
                                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                                          {contact.reengagement_count} {contact.reengagement_count === 1 ? 'envio' : 'envios'}
                                        </Badge>
                                      ) : (
                                        <span className="text-[#5A6170] text-[11px]">Nenhum</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginação da Tabela */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-[#5A6170]">
                        <span>
                          Desmarcar aqui remove só deste lote. A lista mostra apenas os leads das etapas selecionadas.
                        </span>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page <= 1}
                              onClick={() => setPage(p => Math.max(1, p - 1))}
                              className="h-7 px-2 border-[#C9CED6]"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>
                            <span className="text-xs">
                              {page} de {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page >= totalPages}
                              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                              className="h-7 px-2 border-[#C9CED6]"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* ========================================================== */}
              {/* COLUNA DIREITA: Card "Resumo do lote" (~360px fixo)        */}
              {/* ========================================================== */}
              <div className="w-full min-[1000px]:w-[360px] shrink-0 min-[1000px]:sticky min-[1000px]:top-[24px] min-[1000px]:self-start">
                <div className="bg-white rounded-xl border border-[#E3E6EB] p-6 shadow-sm flex flex-col space-y-5">
                  
                  {/* Total em Destaque */}
                  <div>
                    <span className="text-xs font-bold text-[#5A6170] tracking-wider uppercase block">
                      RESUMO DO LOTE
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl font-extrabold font-mono tabular-nums text-[#16181D]">
                        {activePoolCount.toLocaleString('pt-BR')}
                      </span>
                      <span className="text-base text-[#5A6170]">leads</span>
                    </div>
                  </div>

                  {/* Breakdown por Etapa */}
                  <div className="py-2 border-t border-b border-[#E3E6EB] space-y-2">
                    {selectedStages.size === 0 ? (
                      <p className="text-xs text-[#5A6170] italic py-1">
                        Selecione ao menos uma etapa para montar o lote.
                      </p>
                    ) : (
                      Array.from(selectedStages).map((stageId) => {
                        const stageCfg = STAGES.find(s => s.id === stageId);
                        const countInPool = eligibleContacts.filter(
                          c => c.stopped_stage === stageId && !deselectedContactPhones.has(c.clean_phone)
                        ).length;

                        return (
                          <div key={stageId} className="flex justify-between items-center text-xs">
                            <span className="text-[#16181D] font-medium truncate max-w-[220px]" title={stageCfg?.label}>
                              {stageCfg?.label}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-[#16181D] shrink-0">
                              {countInPool.toLocaleString('pt-BR')}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Bloco Mensagem (ID do Template Zenvia) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="template-id-input" className="text-xs font-bold text-[#16181D]">
                        ID do template Zenvia
                      </Label>
                      {templateId !== originalTemplateId && (
                        <button
                          type="button"
                          onClick={() => setTemplateId(originalTemplateId)}
                          className="text-xs text-[#2449C8] hover:underline"
                        >
                          Restaurar original
                        </button>
                      )}
                    </div>
                    <textarea
                      id="template-id-input"
                      rows={2}
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      placeholder="Ex: 7376be0b-88e1-482b-b017-234aa8992d03"
                      className={`w-full text-[13px] font-mono px-2.5 py-2 rounded-md border resize-none break-all leading-snug focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2449C8] ${
                        !templateId.trim() ? 'border-rose-400 focus-visible:ring-rose-400' : 'border-[#C9CED6]'
                      }`}
                    />
                    {!templateId.trim() ? (
                      <span className="text-[11px] text-rose-500 font-medium block">
                        Informe o ID do template
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#5A6170] block leading-tight">
                        Template usado na campanha original. Informe outro ID se quiser uma mensagem específica para reengajamento.
                      </span>
                    )}
                  </div>

                  {/* Bloco Quando Enviar (AGENDAR É O PADRÃO) */}
                  <div className="space-y-3 pt-2">
                    <Label className="text-xs font-bold text-[#16181D] block">
                      Quando enviar
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-[#5A6170] mb-1 block">Data</Label>
                        <Input
                          type="date"
                          value={scheduleDate}
                          min={format(new Date(), 'yyyy-MM-dd')}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="h-10 text-xs border-[#C9CED6]"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-[#5A6170] mb-1 block">Hora</Label>
                        <Input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="h-10 text-xs border-[#C9CED6]"
                        />
                      </div>
                    </div>

                    {/* Botões de Ação com Estados Desabilitados Padronizados */}
                    {(() => {
                      const isScheduleDisabled =
                        selectedStages.size === 0 ||
                        activePoolCount === 0 ||
                        !scheduleDate ||
                        !scheduleTime ||
                        !templateId.trim() ||
                        isSubmitting ||
                        !hasPermission('campaign_recovery.trigger');

                      const isSendNowDisabled =
                        selectedStages.size === 0 ||
                        activePoolCount === 0 ||
                        !templateId.trim() ||
                        isSubmitting ||
                        !hasPermission('campaign_recovery.trigger');

                      return (
                        <>
                          {/* Botão Principal: Agendar */}
                          <Button
                            type="button"
                            size="lg"
                            disabled={isScheduleDisabled}
                            onClick={() => handleSchedule('scheduled')}
                            className={`w-full h-[52px] font-bold rounded-lg text-sm transition-colors ${
                              isScheduleDisabled
                                ? '!bg-[#D5D9E0] !text-[#5A6170] !cursor-not-allowed !pointer-events-auto !opacity-100 shadow-none hover:!bg-[#D5D9E0]'
                                : 'bg-[#2449C8] hover:bg-[#1C3AA3] text-white cursor-pointer shadow-sm'
                            }`}
                          >
                            {isSubmitting ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Agendando...
                              </>
                            ) : selectedStages.size === 0 ? (
                              'Selecione uma etapa'
                            ) : (
                              <>
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Agendar para {activePoolCount.toLocaleString('pt-BR')} leads
                              </>
                            )}
                          </Button>

                          {/* Botão Secundário: Enviar Agora */}
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSendNowDisabled}
                            onClick={() => setConfirmModalOpen(true)}
                            className={`w-full h-10 font-medium text-xs transition-colors ${
                              isSendNowDisabled
                                ? '!bg-[#D5D9E0] !text-[#5A6170] !border-[#D5D9E0] !cursor-not-allowed !pointer-events-auto !opacity-100 shadow-none hover:!bg-[#D5D9E0]'
                                : 'bg-white border-[#C9CED6] text-[#16181D] hover:bg-[#F5F6F8] cursor-pointer'
                            }`}
                          >
                            <Send className="mr-2 h-3.5 w-3.5 text-current" />
                            Enviar agora
                          </Button>
                        </>
                      );
                    })()}
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-3 border-t border-[#E3E6EB]">
                    <p className="text-[11px] text-[#5A6170] leading-relaxed">
                      O envio original fica intacto. Este lote entra no Histórico e no Comparativo como um lote separado.
                    </p>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* ============================================================== */}
          {/* ABA 2: COMPARATIVO                                             */}
          {/* ============================================================== */}
          {activeTab === 'comparison' && (
            <div className="space-y-6">
              <ReengagementComparisonView 
                initialCampaignId={selectedCampaignId}
                onSelectCampaign={(id) => setSelectedCampaignId(id)}
              />
            </div>
          )}

          {/* ============================================================== */}
          {/* ABA 3: HISTÓRICO DE LOTES                                      */}
          {/* ============================================================== */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <Card className="border-[#E3E6EB] shadow-sm bg-white">
                <CardHeader className="border-b border-[#E3E6EB] pb-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2 text-[#16181D]">
                        <History className="w-4 h-4 text-[#2449C8]" />
                        Histórico Geral de Reengajamentos
                      </CardTitle>
                      <CardDescription className="text-xs text-[#5A6170]">
                        Auditoria de todos os lotes de recuperação disparados ou agendados
                      </CardDescription>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={loadHistory} 
                      disabled={loadingHistory}
                      className="h-8 gap-1.5 text-xs border-[#C9CED6]"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {historyLogs.length === 0 ? (
                    <div className="py-12 text-center text-sm text-[#5A6170]">
                      Nenhum registro de recuperação encontrado até o momento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#F5F6F8] uppercase tracking-wider text-[#5A6170] font-semibold border-b border-[#E3E6EB]">
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
                        <tbody className="divide-y divide-[#E3E6EB]">
                          {historyLogs.map((log) => {
                            const camp = campaigns.find(c => c.id === log.campaign_id);

                            return (
                              <tr key={log.id} className="hover:bg-[#F5F6F8]">
                                <td className="py-3 px-4 font-medium text-[#16181D]">
                                  {log.started_at ? format(new Date(log.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                                </td>
                                <td className="py-3 px-4 font-semibold text-[#16181D]">
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
                                <td className="py-3 px-4 text-[#5A6170]">
                                  {Array.isArray(log.target_options) ? log.target_options.join(', ') : 'Personalizado'}
                                </td>
                                <td className="py-3 px-4 text-right font-bold font-mono text-[#16181D]">
                                  {log.records_affected || 0}
                                </td>
                                <td className="py-3 px-4 text-center text-[#5A6170]">
                                  {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                                </td>
                                <td className="py-3 px-4 font-mono text-[11px] text-[#5A6170]">
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
            </div>
          )}
        </div>

        {/* Modal de Confirmação para "Enviar agora" */}
        <AlertDialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
          <AlertDialogContent className="bg-white border-[#E3E6EB] max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[#16181D] text-lg font-bold">
                Disparar agora para {activePoolCount.toLocaleString('pt-BR')} leads?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-[#5A6170] text-xs space-y-3 pt-2">
                  <p>
                    O disparo do lote de reengajamento será iniciado imediatamente para os contatos selecionados.
                  </p>
                  <div className="p-3 bg-[#F5F6F8] rounded-lg border border-[#E3E6EB] space-y-1">
                    <span className="text-[11px] font-semibold text-[#5A6170] uppercase tracking-wider block">
                      ID do template Zenvia
                    </span>
                    <span className="font-mono text-xs font-bold text-[#16181D] break-all">
                      {templateId}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2">
              <AlertDialogCancel className="h-10 text-xs border-[#C9CED6] text-[#5A6170] hover:text-[#16181D]">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  setConfirmModalOpen(false);
                  handleSchedule('now');
                }}
                className="h-10 text-xs bg-[#2449C8] hover:bg-[#1C3AA3] text-white font-bold"
              >
                Disparar agora
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </MainLayout>
  );
}
