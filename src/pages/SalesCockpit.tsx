import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { SalesCockpitLead, PipelineStage, formatPhoneBR, formatCNPJ, salesCockpitService } from '@/services/salesCockpit.service';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChatArea } from '@/components/conversations/ChatArea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Search, 
  ChevronDown,
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  User, 
  Zap,
  Layers,
  AlertTriangle,
  Flame,
  Info,
  CreditCard,
  Percent,
  Calendar,
  Building2,
  Phone,
  UserCheck,
  MessageSquare
} from 'lucide-react';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Cores com alto contraste em fundo claro (sem tons desbotados)
const STAGE_CONFIG: Record<PipelineStage, { label: string; textClass: string; bgClass: string; borderClass: string }> = {
  pending_contact: {
    label: 'Pendente de Contato',
    textClass: 'text-amber-800 dark:text-amber-300 font-semibold',
    bgClass: 'bg-amber-100 dark:bg-amber-950/40',
    borderClass: 'border-amber-300 dark:border-amber-700/60'
  },
  in_contact: {
    label: 'Em Contato',
    textClass: 'text-blue-800 dark:text-blue-300 font-semibold',
    bgClass: 'bg-blue-100 dark:bg-blue-950/40',
    borderClass: 'border-blue-300 dark:border-blue-700/60'
  },
  contract_sent: {
    label: 'Contrato Enviado',
    textClass: 'text-purple-800 dark:text-purple-300 font-semibold',
    bgClass: 'bg-purple-100 dark:bg-purple-950/40',
    borderClass: 'border-purple-300 dark:border-purple-700/60'
  },
  contract_signed: {
    label: 'Contrato Assinado',
    textClass: 'text-emerald-800 dark:text-emerald-300 font-semibold',
    bgClass: 'bg-emerald-100 dark:bg-emerald-950/40',
    borderClass: 'border-emerald-300 dark:border-emerald-700/60'
  }
};

/**
 * SLA Fiserv 48h:
 * - Verde: Contato recente (últimas 12 horas)
 * - Laranja: Contato entre 12 horas e 36 horas
 * - Vermelho: Contato acima de 36 horas sem atendimento (prestes a estourar 48h)
 */
function getSlaAlertInfo(lastDate: Date, stage: PipelineStage) {
  // Se já foi contatado ou assinado, não tem SLA de urgência
  if (stage !== 'pending_contact') {
    return {
      borderClass: 'border-l-4 border-l-slate-300 dark:border-l-slate-700',
      badgeClass: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
      icon: null,
      tooltip: 'Em andamento'
    };
  }

  const hours = differenceInHours(new Date(), new Date(lastDate));

  if (hours < 12) {
    return {
      borderClass: 'border-l-4 border-l-emerald-500 shadow-sm',
      badgeClass: 'text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300',
      icon: null,
      tooltip: 'Contato Recente (< 12h)'
    };
  }

  if (hours >= 12 && hours < 36) {
    return {
      borderClass: 'border-l-4 border-l-amber-500 shadow-sm',
      badgeClass: 'text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 border-amber-300',
      icon: <Clock className="h-3 w-3 text-amber-600 inline mr-1" />,
      tooltip: 'Atenção: 12h a 36h sem contato'
    };
  }

  return {
    borderClass: 'border-l-4 border-l-rose-500 shadow-sm',
    badgeClass: 'text-rose-800 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/50 border-rose-300 font-bold',
    icon: <AlertTriangle className="h-3 w-3 text-rose-600 inline mr-1" />,
    tooltip: 'Urgente: Acima de 36h (SLA 48h próximo)'
  };
}

export default function SalesCockpit() {
  const { currentTenant, currentUser, conversations, selectedConversation, setSelectedConversation, takeOverConversation, returnToAI, hasPermission } = useApp();
  const [leads, setLeads] = useState<SalesCockpitLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtro de status com múltipla escolha (inicia com 'pending_contact' selecionado)
  const [selectedStages, setSelectedStages] = useState<PipelineStage[]>(['pending_contact']);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);

  const toggleStage = (stage: PipelineStage) => {
    setSelectedStages(prev => 
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    );
  };

  // Carregar Leads do Cockpit
  const loadLeads = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const data = await api.getSalesCockpitLeads(currentTenant.id);
      setLeads(data);

      if (data.length > 0) {
        // Encontrar primeiro pendente ou o primeiro da lista
        const firstLead = data.find(l => l.pipelineStage === 'pending_contact') || data[0];
        setActiveLeadId(firstLead.id);
        if (firstLead.conversation) {
          setSelectedConversation(firstLead.conversation);
        } else {
          api.getOrCreateConversationForLead(firstLead, currentTenant.id).then(conv => {
            if (conv) {
              setLeads(prev => prev.map(l => l.id === firstLead.id ? { ...l, conversationId: conv.id, conversation: conv } : l));
              setSelectedConversation(conv);
            }
          }).catch(console.error);
        }
      } else {
        setActiveLeadId(null);
        setSelectedConversation(null);
      }
    } catch (error) {
      console.error('Erro ao carregar leads do Cockpit:', error);
      toast.error('Não foi possível carregar a fila do Cockpit.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setActiveLeadId(null);
    setSelectedConversation(null);
    loadLeads();
  }, [currentTenant?.id]);

  // Reset pagination on filter or search change
  useEffect(() => {
    setVisibleCount(60);
  }, [selectedStages, searchTerm]);

  // Regra de Permissão e Visibilidade:
  // Administradores e Super Admins veem a lista completa.
  // Operadores veem apenas leads pendentes de contato (sem operador atendendo) e os que ele próprio assumiu.
  const canViewAllLeads = useMemo(() => {
    const role = currentUser?.role?.toLowerCase() || '';
    return role === 'super_admin' || role === 'tenant_admin' || role === 'admin';
  }, [currentUser?.role]);

  const visibleLeads = useMemo(() => {
    if (canViewAllLeads) return leads;
    
    const myId = currentUser?.id;
    const myName = currentUser?.name?.toLowerCase().trim();

    return leads.filter(lead => {
      // 1. Leads pendentes de contato (ninguém ainda está atendendo)
      const isPendingUnassigned = lead.pipelineStage === 'pending_contact' && !lead.assignedOperatorId && !lead.assignedOperator;
      
      // 2. Leads que o operador assumiu para si mesmo
      const isAssignedToMe = (myId && lead.assignedOperatorId === myId) || 
                             (myName && lead.assignedOperator && lead.assignedOperator.toLowerCase().trim() === myName);

      return isPendingUnassigned || isAssignedToMe;
    });
  }, [leads, canViewAllLeads, currentUser?.id, currentUser?.name]);

  // Filtragem (Pesquisa + Etapas) aplicada sobre a visão permitida do usuário
  const filteredLeads = useMemo(() => {
    const termClean = searchTerm.trim().toLowerCase();
    const termDigits = searchTerm.replace(/\D/g, '');

    return visibleLeads.filter(lead => {
      const phoneDigits = (lead.phone || '').replace(/\D/g, '');
      const cnpjDigits = (lead.cnpj || '').replace(/\D/g, '');
      const formattedPhone = formatPhoneBR(lead.phone).toLowerCase();
      const formattedCnpj = formatCNPJ(lead.cnpj).toLowerCase();

      const matchesSearch = !termClean ||
        lead.name.toLowerCase().includes(termClean) ||
        (termDigits.length > 0 && cnpjDigits.includes(termDigits)) ||
        (termDigits.length > 0 && phoneDigits.includes(termDigits)) ||
        formattedPhone.includes(termClean) ||
        formattedCnpj.includes(termClean);

      const matchesStage = selectedStages.length === 0 || selectedStages.includes(lead.pipelineStage);

      return matchesSearch && matchesStage;
    });
  }, [visibleLeads, searchTerm, selectedStages]);

  // Lead Ativo Atual baseado nos leads visíveis para o usuário
  const activeLead = useMemo(() => {
    if (visibleLeads.length === 0) return null;
    return visibleLeads.find(l => l.id === activeLeadId) || visibleLeads[0] || null;
  }, [visibleLeads, activeLeadId]);

  // Ao selecionar um lead da lista
  const handleSelectLead = async (lead: SalesCockpitLead) => {
    setActiveLeadId(lead.id);

    // 1. Se já possui conversa válida mapeada em memória
    if (lead.conversation) {
      setSelectedConversation(lead.conversation);
      return;
    }

    // 2. Se possui conversationId válido na lista geral de conversas
    if (lead.conversationId) {
      const existingConv = conversations?.find(c => c.id === lead.conversationId);
      if (existingConv) {
        setSelectedConversation(existingConv);
        return;
      }
    }

    // 3. Buscar ou resolver a conversa real no banco de dados via variações de telefone
    try {
      if (currentTenant) {
        const conv = await api.getOrCreateConversationForLead(lead, currentTenant.id);
        if (conv && conv.id) {
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, conversationId: conv.id, conversation: conv } : l));
          setSelectedConversation(conv);
        }
      }
    } catch (err) {
      console.error('Erro ao resolver conversa para lead selecionado:', err);
    }
  };

  // Atualizar Etapa do Pipeline
  const handleUpdateStage = async (newStage: PipelineStage) => {
    if (!activeLead) return;
    if (!hasPermission('sales_cockpit.change_stage')) {
      toast.error('Você não tem permissão para alterar a etapa da pipeline.');
      return;
    }

    const opName = currentUser?.name || 'Carlos Silva';
    const opId = currentUser?.id;
    try {
      const success = await salesCockpitService.updatePipelineStage(
        activeLead.id, 
        newStage, 
        activeLead.conversationId, 
        opName,
        opId
      );
      if (success) {
        setLeads(prev => prev.map(l => l.id === activeLead.id ? { 
          ...l, 
          pipelineStage: newStage,
          assignedOperator: opName,
          assignedOperatorId: opId
        } : l));
        toast.success(`Status atualizado para: ${STAGE_CONFIG[newStage].label}`);
      } else {
        toast.error('Erro ao atualizar status no banco.');
      }
    } catch (e) {
      toast.error('Falha na comunicação com o servidor.');
    }
  };

  // Assumir Atendimento (Handoff HITL)
  const handleTakeover = async () => {
    if (!activeLead?.conversationId) return;
    if (!hasPermission('sales_cockpit.takeover')) {
      toast.error('Você não tem permissão para assumir este atendimento.');
      return;
    }
    try {
      await takeOverConversation(activeLead.conversationId);
      // Atualizar localmente a atribuição imediata para o operador logado
      const opName = currentUser?.name || 'Carlos Silva';
      const opId = currentUser?.id;
      setLeads(prev => prev.map(l => l.id === activeLead.id ? {
        ...l,
        assignedOperator: opName,
        assignedOperatorId: opId,
        pipelineStage: l.pipelineStage === 'pending_contact' ? 'in_contact' : l.pipelineStage
      } : l));

      if (activeLead.pipelineStage === 'pending_contact') {
        handleUpdateStage('in_contact');
      }
      toast.success('Você assumiu o atendimento. A Sofia (IA) foi pausada.');
    } catch (e) {
      toast.error('Erro ao assumir atendimento.');
    }
  };

  // Devolver Atendimento para a IA
  const handleReturnToAI = async () => {
    if (!activeLead?.conversationId) return;
    try {
      await returnToAI(activeLead.conversationId);
      toast.success('Atendimento devolvido para a Sofia (IA).');
    } catch (e) {
      toast.error('Erro ao devolver para a IA.');
    }
  };

  // Finalizar Formalização (Contrato Assinado)
  const handleFinalizeFormalization = async () => {
    if (!activeLead) return;
    try {
      await handleUpdateStage('contract_signed');
      toast.success('🎉 Formalização finalizada com sucesso! Contrato marcado como assinado.');
    } catch (e) {
      toast.error('Erro ao finalizar formalização.');
    }
  };

  // Métricas do Topo:
  // Para operadores, reflete o que é permitido em sua visão (pendentes + o que ele atendeu/assinou).
  // Para administradores, reflete os números globais.
  const pendingCount = visibleLeads.filter(l => l.pipelineStage === 'pending_contact').length;
  const inContactCount = visibleLeads.filter(l => l.pipelineStage === 'in_contact').length;
  const sentCount = visibleLeads.filter(l => l.pipelineStage === 'contract_sent').length;
  const signedCount = visibleLeads.filter(l => l.pipelineStage === 'contract_signed').length;

  return (
    <MainLayout>
      <div className="h-full max-h-screen flex flex-col bg-background text-foreground overflow-hidden w-full">
        {/* Header Superior do Cockpit */}
        <div className="flex-shrink-0 px-6 py-3.5 border-b border-border bg-card/70 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <Zap className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Cockpit de Vendas</h1>
                <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 text-xs font-semibold">
                  Funil Fiserv
                </Badge>
                {!canViewAllLeads && (
                  <Badge variant="secondary" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 font-medium">
                    Meus Atendimentos & Fila
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-normal">
                Fechamento comercial humano para leads que completaram o funil de crédito
              </p>
            </div>
          </div>

          {/* Quick Metrics Badges com Alto Contraste */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Fila Total:</span>
              <span className="font-bold text-slate-950 dark:text-white">{visibleLeads.length}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs">
              <span className="text-amber-900 dark:text-amber-300 font-medium">Pendentes:</span>
              <span className="font-bold text-amber-900 dark:text-amber-200">
                {pendingCount}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-xs">
              <span className="text-emerald-900 dark:text-emerald-300 font-medium">Assinados:</span>
              <span className="font-bold text-emerald-900 dark:text-emerald-200">
                {signedCount}
              </span>
            </div>
          </div>
        </div>

        {/* Corpo em 3 Colunas com trava de proporções */}
        <div className="flex-1 flex min-h-0 w-full overflow-hidden">
          
          {/* ============================================================ */}
          {/* COLUNA 1: Lista de Leads do Funil (330px)                     */}
          {/* ============================================================ */}
          <div className="w-[330px] min-w-[330px] max-w-[330px] shrink-0 border-r border-border bg-slate-50/50 dark:bg-card/20 flex flex-col h-full overflow-hidden">
            {/* Filtros: Campo Select por padrão em 'Pendente de Contato' */}
            <div className="p-3 border-b border-border space-y-2 bg-card">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <Input
                  placeholder="Buscar empresa, CNPJ, telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 text-xs bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                />
              </div>

              {/* Botão de Filtro de Etapas com Popover Multiselect */}
              <div className="flex items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-between text-xs h-8 border-slate-300 dark:border-slate-700 bg-background text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white focus:text-slate-900 dark:focus:text-white data-[state=open]:bg-slate-100 dark:data-[state=open]:bg-slate-800 data-[state=open]:text-slate-950 dark:data-[state=open]:text-white font-medium shadow-none transition-colors"
                    >
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {selectedStages.length === 0 
                          ? "Todos os status" 
                          : selectedStages.length === 1 
                            ? STAGE_CONFIG[selectedStages[0]].label 
                            : `${selectedStages.length} status selecionados`}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-1 shrink-0 text-slate-700 dark:text-slate-300" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 bg-card border-border shadow-lg" align="start">
                    <div className="pb-1.5 mb-1.5 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Filtrar por Status</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedStages(['pending_contact', 'in_contact', 'contract_sent', 'contract_signed'])}
                          className="text-[10px] text-primary hover:underline"
                        >
                          Todos
                        </button>
                        <button
                          onClick={() => setSelectedStages([])}
                          className="text-[10px] text-muted-foreground hover:underline"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {(Object.keys(STAGE_CONFIG) as PipelineStage[]).map((stageKey) => {
                        const isChecked = selectedStages.includes(stageKey);
                        const count = visibleLeads.filter(l => l.pipelineStage === stageKey).length;
                        return (
                          <div
                            key={stageKey}
                            onClick={() => toggleStage(stageKey)}
                            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleStage(stageKey)}
                                id={`stage-${stageKey}`}
                              />
                              <label
                                htmlFor={`stage-${stageKey}`}
                                className="text-xs font-medium cursor-pointer text-slate-800 dark:text-slate-200"
                              >
                                {STAGE_CONFIG[stageKey].label}
                              </label>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              ({count})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Listagem de Cards */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Carregando fila de fechamento...
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-card rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  Nenhum lead com {selectedStages.length === 0 ? "status selecionado" : "os filtros aplicados"}.
                </div>
              ) : (
                <>
                  {filteredLeads.slice(0, visibleCount).map((lead) => {
                    const isSelected = lead.id === activeLeadId;
                    const stageMeta = STAGE_CONFIG[lead.pipelineStage];
                    const slaAlert = getSlaAlertInfo(lead.lastMessageTime, lead.pipelineStage);

                    return (
                      <div
                        key={lead.id}
                        onClick={() => handleSelectLead(lead)}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer text-left relative bg-card",
                          slaAlert.borderClass,
                          isSelected 
                            ? "ring-2 ring-primary/40 border-primary shadow-sm bg-slate-50 dark:bg-card" 
                            : "hover:bg-slate-50 dark:hover:bg-card/70 border-slate-200 dark:border-slate-800"
                        )}
                      >
                        {/* Topo do Card: Razão Social */}
                        <div className="flex items-start justify-between gap-1.5 mb-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate block w-full" title={lead.name}>
                            {lead.name}
                          </span>
                        </div>

                        {/* Telefone sem 55 e com máscara + CNPJ formatado */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-medium mb-1.5 flex-wrap">
                          <span className="text-slate-900 dark:text-slate-100 font-semibold">{formatPhoneBR(lead.phone)}</span>
                          {lead.cnpj && (
                            <span className="text-slate-500 dark:text-slate-400 font-normal">
                              ({formatCNPJ(lead.cnpj)})
                            </span>
                          )}
                        </div>

                        {/* Valor e Parcelas Solicitados */}
                        <div className="flex items-center justify-between text-[11px] mb-2 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-600 dark:text-slate-400 text-[10px]">Solicitado:</span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-400 text-xs">
                            R$ {Number(lead.requestedAmount || 20000).toLocaleString('pt-BR')} <span className="font-normal text-[10px] text-slate-600 dark:text-slate-400">({lead.requestedInstallments || 12}x)</span>
                          </span>
                        </div>

                        {/* Rodapé do Card: Tempo de Espera SLA */}
                        <div className="flex items-center justify-end pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[10px]">
                          <span className={cn("px-1.5 py-0.5 rounded flex items-center font-medium", slaAlert.badgeClass)} title={slaAlert.tooltip}>
                            {slaAlert.icon}
                            finalizou {formatDistanceToNow(lead.lastMessageTime, { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>

                        {/* Identificação do Operador que está atendendo */}
                        {(lead.assignedOperator || lead.pipelineStage !== 'pending_contact') && (
                          <div className="mt-1.5 pt-1 border-t border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-emerald-600" />
                              Operador:
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {lead.assignedOperator || currentUser?.name || 'Carlos Silva'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredLeads.length > visibleCount && (
                    <div className="pt-2 pb-1 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount(prev => prev + 60)}
                        className="w-full text-xs text-slate-700 dark:text-slate-200 border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Carregar mais (+60 de {filteredLeads.length})
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* ============================================================ */}
          {/* COLUNA 2: Chat com Atendimento Humano Exclusivo (Flex)        */}
          {/* ============================================================ */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border bg-background relative h-full overflow-hidden">
            {activeLead && selectedConversation ? (
              <>
                {/* Componente Oficial de Chat com Cabeçalho Unificado e Ações Integradas */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative w-full">
                  <ChatArea 
                    conversation={selectedConversation} 
                    highlightTerm={searchTerm}
                    alwaysAllowInput={true}
                    hideAiControls={true}
                    customActions={
                      selectedConversation?.status === 'human_active' ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleReturnToAI}
                            className="h-8 text-xs font-medium border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-background hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
                          >
                            Devolver para IA
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleFinalizeFormalization}
                            className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Finalizar Formalização
                          </Button>
                        </div>
                      ) : hasPermission('sales_cockpit.takeover') ? (
                        <Button
                          size="sm"
                          onClick={handleTakeover}
                          className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                        >
                          <User className="h-3.5 w-3.5" />
                          Assumir Atendimento
                        </Button>
                      ) : null
                    }
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <MessageSquare className="h-12 w-12 stroke-[1.5] mb-3 text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum lead selecionado</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Selecione um lead da fila à esquerda para visualizar a conversa e o raio-x da proposta de crédito.
                </p>
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* COLUNA 3: Raio-X da Proposta Fiserv & Pipeline (420px)       */}
          {/* ============================================================ */}
          <div className="w-[420px] min-w-[420px] max-w-[420px] shrink-0 bg-slate-50/50 dark:bg-card/20 flex flex-col h-full overflow-y-auto p-4 space-y-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                Raio-X da Proposta Fiserv
              </h2>

              {activeLead ? (
                <div className="space-y-3">
                  {/* Dados Mastigados da Empresa */}
                  <div className="p-3.5 rounded-xl bg-card border border-slate-200 dark:border-slate-800 space-y-2 text-xs shadow-sm">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-bold flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        CNPJ / Razão Social
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700" title="ID Requisição Fiserv">
                        {activeLead.loanRequestId || '#FSV-894102'}
                      </span>
                    </div>

                    <p className="font-bold text-slate-950 dark:text-white text-sm leading-tight">{activeLead.name}</p>
                    
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block text-[10px]">CNPJ:</span>
                        <strong className="text-slate-900 dark:text-slate-100">{formatCNPJ(activeLead.cnpj) || 'Não informado'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Telefone:</span>
                        <strong className="text-slate-900 dark:text-slate-100">{formatPhoneBR(activeLead.phone)}</strong>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Faturamento:</span>
                      <strong className="text-slate-950 dark:text-white">
                        R$ {Number(activeLead.revenue || 0).toLocaleString('pt-BR')}
                      </strong>
                    </div>

                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        Operador Responsável:
                      </span>
                      <strong className="text-slate-950 dark:text-white">
                        {(!selectedConversation?.assignedOperator || selectedConversation.assignedOperator.toLowerCase().includes('operator') || selectedConversation.assignedOperator.toLowerCase().includes('operador'))
                          ? (activeLead.pipelineStage !== 'pending_contact' ? (currentUser?.name || 'Carlos Silva') : 'Aguardando Operador')
                          : selectedConversation.assignedOperator}
                      </strong>
                    </div>
                  </div>

                  {/* Grid 2x2: Valores Simulados pelo Cliente */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-card border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 block uppercase font-bold">Valor Simulado</span>
                      <span className="text-base font-extrabold text-slate-950 dark:text-white">
                        R$ {Number(activeLead.requestedAmount || 20000).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-card border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 block uppercase font-bold">Parcelas</span>
                      <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                        {activeLead.requestedInstallments || 12}x de R$ {Number(activeLead.monthlyPayment || 1045.82).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Detalhes Financeiros, CET e Garantia */}
                  <div className="p-3.5 rounded-xl bg-card border border-slate-200 dark:border-slate-800 space-y-2 text-xs shadow-sm">
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1.5">
                        <Percent className="h-3.5 w-3.5 text-emerald-600" />
                        Taxa &amp; CET:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-950 dark:text-white">{activeLead.interestRate || 2.75}% a.m.</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300">
                          Aprovado Fiserv
                        </Badge>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Total do Contrato:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        R$ {Number(activeLead.totalContractAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Forma de Pagamento:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">Boleto Bancário</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Garantia:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">Recebíveis Ticket</span>
                    </div>
                  </div>

                  {/* Termo LGPD Assinado Digitalmente */}
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">Termo LGPD: Assinado digitalmente ✅</span>
                      <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-medium">Consentimento registrado no WhatsApp</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 border border-dashed rounded-xl bg-card">
                  Selecione um lead para ver o raio-x.
                </div>
              )}
            </div>

            {/* Pipeline de Status de Fechamento */}
            {activeLead && (
              <div className="pt-2 border-t border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Pipeline de Formalização
                </h3>

                <div className="space-y-2">
                  {(['pending_contact', 'in_contact', 'contract_sent', 'contract_signed'] as PipelineStage[]).map((stageKey, idx) => {
                    const isCurrent = activeLead.pipelineStage === stageKey;
                    const stageMeta = STAGE_CONFIG[stageKey];

                    return (
                      <button
                        key={stageKey}
                        disabled={!hasPermission('sales_cockpit.change_stage')}
                        onClick={() => handleUpdateStage(stageKey)}
                        className={cn(
                          "w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between text-xs font-medium",
                          !hasPermission('sales_cockpit.change_stage') && "cursor-not-allowed opacity-75",
                          isCurrent 
                            ? cn("font-bold shadow-sm border-l-4", stageMeta.bgClass, stageMeta.textClass, stageMeta.borderClass)
                            : "bg-card hover:bg-slate-100 dark:hover:bg-card/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                            isCurrent ? "bg-white/80 dark:bg-black/40" : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          )}>
                            {idx + 1}
                          </span>
                          <span>{stageMeta.label}</span>
                        </div>
                        {isCurrent && <CheckCircle2 className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
