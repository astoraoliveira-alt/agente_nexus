import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  Zap, 
  Clock, 
  User, 
  MessageSquare, 
  CheckCircle2, 
  ChevronRight,
  TrendingUp,
  Search,
  Bot,
  Phone,
  Building2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhoneBR, formatCNPJ } from '@/services/salesCockpit.service';

// Função estrita de validação: garante que apenas solicitações expressas por humano apareçam na fila
export function isExpressHumanRequest(message?: string | null, metadata?: any): boolean {
  if (metadata?.is_express_human_request === true || metadata?.reason === 'human_requested') {
    return true;
  }
  if (!message || typeof message !== 'string') return false;

  const text = message.trim().toLowerCase();
  if (!text) return false;

  // 1. Rejeita bots, menus automáticos, IVRs de clientes e links
  if (
    text.includes('robô') || text.includes('robo') || text.includes('bot') ||
    text.includes('atendente virtual') || text.includes('assistente virtual') ||
    text.includes('digite apenas o número') || text.includes('digite uma das opções') ||
    text.includes('escolher um item') || text.includes('cardápio') || text.includes('cardapio') ||
    text.includes('fazer pedido') || text.includes('fazer um pedido') ||
    text.includes('resposta automática') || text.includes('mensagem automática') ||
    text.includes('agradece seu contato') || text.includes('seja bem vindo') ||
    text.includes('horário de atendimento') || text.includes('horario de atendimento') ||
    text.includes('linktr.ee') || text.includes('bit.ly') || text.includes('http://') || text.includes('https://') ||
    text.includes('deliveryapp') || text.includes('neemo') ||
    text.includes('assim q possível retorno') || text.includes('no momento não posso atender') ||
    text.includes('em breve devem te chamar') || text.includes('aproveite e clique abaixo') ||
    /(\*?[1-9]\.?\*?\s*[-–—]|\b[1-9]️⃣)/.test(text)
  ) {
    return false;
  }

  // 2. Rejeita números, simulações e moedas (ex: "30 mil", "0 mil", "150000")
  if (/^[\d.,\s]+(\s*(mil|milhoes|milhões|reais|k|r\$))?$/i.test(text)) {
    return false;
  }

  // 3. Rejeita respostas curtas de funil / confirmações
  if (/^(sim|s|ok|beleza|autorizo|não|nao|sum|show|quero seguir|não quero|nem pensar)$/i.test(text)) {
    return false;
  }

  // 4. Rejeita ações do fluxo que não são pedido de humano
  if (
    text.startsWith('quero troca o cnpj') || 
    text.startsWith('quero trocar o cnpj') ||
    text.startsWith('meu cnpj') || 
    text.startsWith('quero simular') ||
    text.startsWith('está comunicando que não foi possível') ||
    text.startsWith('nao consegui fazer') ||
    text.startsWith('tirar dúvidas') ||
    text.startsWith('duvidas antes')
  ) {
    return false;
  }

  // 5. Termos diretos isolados ou frases padrão de atendimento humano
  const directTerms = [
    'atendente',
    'atensente',
    'falar com atendente',
    'falar com um atendente',
    'falar com atendentes',
    'falar com humano',
    'falar com um humano',
    'humano',
    'atendimento humano',
    'falar com pessoa',
    'falar com alguem',
    'falar com alguém',
    'falar com especialista',
    'falar com especialistas',
    'falar com operador',
    'falar com consultor',
    'falar com assessor',
    'quero atendente',
    'quero um atendente',
    'preciso de atendente',
    'chamar atendente',
    'passar para atendente',
    'transferir para atendente',
    'suporte humano',
    'pessoa real'
  ];

  if (directTerms.includes(text)) {
    return true;
  }

  // 6. Regex rigorosa: exige verbo de contato/fala + destino humano OU menção clara a atendente/humano
  const hasAttendantExplicit = /\b(atendente|atensente|atendimento humano|suporte humano|pessoa real)\b/i.test(text);
  const hasContactHuman = /\b(falar|conversar|passar|transferir|chamar|conectar)\b.*\b(humano|pessoa|algu[ée]m|especialista|especialistas|atendente|atensente|operador|consultor|assessor)\b/i.test(text);
  const hasRequestHuman = /\b(quero|preciso|gostaria|favor|solicito|tem como)\b.*\b(humano|atendente|atensente|especialista|especialistas|pessoa|operador)\b/i.test(text);

  return hasAttendantExplicit || hasContactHuman || hasRequestHuman;
}

const HandoffHub: React.FC = () => {
  const { 
    handoffRequests, 
    takeOverConversation, 
    conversations, 
    currentTenant, 
    currentUser, 
    setSelectedConversation,
    hasPermission
  } = useApp();

  const [filter, setFilter] = useState<'pending' | 'history'>('pending');
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [leadsMap, setLeadsMap] = useState<Record<string, { identifier: string; name: string }>>({});
  const navigate = useNavigate();

  // 1. Carregar lista de agentes e auto-selecionar o Agente Comercial Fiserv (Novo) por padrão
  useEffect(() => {
    if (!currentTenant?.id) return;
    let isMounted = true;
    const loadAgents = async () => {
      try {
        const { data, error } = await supabase
          .from('agents')
          .select('id, name')
          .eq('tenant_id', currentTenant.id);

        if (!isMounted) return;
        if (data && data.length > 0) {
          setAgents(data);
          // Auto-seleciona o agente novo por padrão
          const newAgent = data.find(a => 
            a.name.toLowerCase().includes('(novo)') || 
            a.name.toLowerCase().includes('novo')
          ) || data.find(a => 
            a.name.toLowerCase().includes('fiserv') && a.name.toLowerCase().includes('comercial')
          ) || data.find(a => 
            a.name.toLowerCase().includes('fiserv')
          );

          if (newAgent) {
            setSelectedAgentId(newAgent.id);
          } else {
            setSelectedAgentId('all');
          }
        }
      } catch (err) {
        console.error('Erro ao carregar agentes para filtro:', err);
      }
    };
    loadAgents();
    return () => { isMounted = false; };
  }, [currentTenant?.id]);

  // 2. Carregar nomes de operadores para o histórico
  useEffect(() => {
    const loadUsers = async () => {
      if (!currentTenant?.id) return;
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('tenant_id', currentTenant.id);
      
      if (data) {
        const map = data.reduce((acc: any, user: any) => {
          acc[user.id] = user.full_name;
          return acc;
        }, {});
        setUsersMap(map);
      }
    };
    loadUsers();
  }, [currentTenant?.id]);

  // 3. Buscar dados de CNPJ/Leads via WhatsApp para enriquecer os cards
  useEffect(() => {
    if (!currentTenant?.id || handoffRequests.length === 0) return;
    let isMounted = true;
    const fetchLeads = async () => {
      const phones = Array.from(new Set(
        handoffRequests
          .map(r => r.conversations?.user_identifier || r.agent_leads?.whatsapp)
          .filter(Boolean)
      ));

      if (phones.length === 0) return;

      const { data } = await supabase
        .from('agent_leads')
        .select('identifier, whatsapp, name, metadata')
        .eq('tenant_id', currentTenant.id)
        .in('whatsapp', phones);

      if (!isMounted) return;
      if (data) {
        const map: Record<string, { identifier: string; name: string }> = {};
        for (const item of data) {
          if (item.whatsapp) {
            map[item.whatsapp] = {
              identifier: item.identifier || item.metadata?.cnpj || '',
              name: item.name || item.metadata?.razao_social || ''
            };
          }
        }
        setLeadsMap(map);
      }
    };
    fetchLeads();
    return () => { isMounted = false; };
  }, [handoffRequests, currentTenant?.id]);

  // Helper para extrair informações consistentes de Nome, Telefone, CNPJ e Agente
  const getRequestInfo = (request: any) => {
    const phone = request.conversations?.user_identifier || request.agent_leads?.whatsapp || request.metadata?.phone || '';
    const leadLookup = phone ? leadsMap[phone] : null;
    
    const name = request.conversations?.user_name || 
                 request.agent_leads?.name || 
                 leadLookup?.name || 
                 conversations.find(c => c.id === request.conversation_id)?.userName || 
                 'Cliente Desconhecido';

    const cnpj = request.agent_leads?.identifier || 
                 request.metadata?.cnpj || 
                 leadLookup?.identifier || 
                 request.agent_leads?.metadata?.cnpj || 
                 '';

    const agentId = request.conversations?.agent_id || 
                    conversations.find(c => c.id === request.conversation_id)?.agentId;

    const agentName = request.conversations?.agents?.name || 
                      agents.find(a => a.id === agentId)?.name || 
                      '';

    return { name, phone, cnpj, agentId, agentName };
  };

  // 4. Solicitações expressas e filtragem por agente
  const validHumanRequests = useMemo(() => {
    return handoffRequests.filter(r => isExpressHumanRequest(r.initial_message, r.metadata));
  }, [handoffRequests]);

  const agentFilteredRequests = useMemo(() => {
    if (selectedAgentId === 'all') return validHumanRequests;
    return validHumanRequests.filter(r => {
      const agentId = r.conversations?.agent_id || conversations.find(c => c.id === r.conversation_id)?.agentId;
      return agentId === selectedAgentId;
    });
  }, [validHumanRequests, selectedAgentId, conversations]);

  // 5. Cálculo do KPI: Média diária de pedidos de falar com atendente
  const dailyAverageHumanRequests = useMemo(() => {
    if (agentFilteredRequests.length === 0) return '0.0';
    const dayCounts: Record<string, number> = {};
    for (const req of agentFilteredRequests) {
      const day = (req.requested_at || req.created_at || '').substring(0, 10);
      if (day) {
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      }
    }
    const uniqueDays = Object.keys(dayCounts).length;
    if (uniqueDays === 0) return '0.0';
    return (agentFilteredRequests.length / uniqueDays).toFixed(1);
  }, [agentFilteredRequests]);

  // 6. Filtragem por busca (Nome, Telefone, CNPJ)
  const searchedRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return agentFilteredRequests;

    const digitsOnly = term.replace(/\D/g, '');

    return agentFilteredRequests.filter(req => {
      const info = getRequestInfo(req);
      const nameMatch = info.name.toLowerCase().includes(term);
      const phoneClean = info.phone.replace(/\D/g, '');
      const phoneMatch = digitsOnly ? phoneClean.includes(digitsOnly) : info.phone.toLowerCase().includes(term);
      const cnpjClean = info.cnpj.replace(/\D/g, '');
      const cnpjMatch = digitsOnly ? cnpjClean.includes(digitsOnly) : info.cnpj.toLowerCase().includes(term);
      const messageMatch = req.initial_message ? req.initial_message.toLowerCase().includes(term) : false;

      return nameMatch || phoneMatch || cnpjMatch || messageMatch;
    });
  }, [agentFilteredRequests, searchTerm, leadsMap, conversations, agents]);

  // 7. Separação Fila Atual x Atendidos Hoje
  const pendingRequests = useMemo(() => {
    return searchedRequests.filter(r => r.status === 'pending');
  }, [searchedRequests]);

  const handledToday = useMemo(() => {
    return searchedRequests.filter(r => r.status !== 'pending' && isToday(new Date(r.handled_at || r.created_at)));
  }, [searchedRequests]);

  const handleTakeover = async (requestId: string, conversationId: string) => {
    try {
      await takeOverConversation(conversationId);
      
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        setSelectedConversation(conv);
      }
      
      await supabase
        .from('handoff_requests')
        .update({ 
          status: 'active', 
          handled_at: new Date().toISOString(),
          operator_id: currentUser?.id 
        })
        .eq('id', requestId);

      navigate('/conversations');
    } catch (err) {
      console.error('Erro ao assumir atendimento:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-blue-600 text-white';
      default: return 'bg-slate-600 text-white';
    }
  };

  const currentDisplayList = filter === 'pending' ? pendingRequests : handledToday;

  return (
    <MainLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 tracking-tight">
              <Zap className="h-6 w-6 text-[#E5003A]" />
              Fila de Atendimento Humano
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Gerencie a transição e solicitações diretas de clientes para atendimento com operador.
            </p>
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Aguardando Agora */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Aguardando Atendimento</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <h3 className="text-2xl font-bold text-slate-900">{pendingRequests.length}</h3>
                  <span className="text-xs text-slate-500">na fila</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Card 2: Média Diária de Solicitações (Novo KPI solicitado) */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Média Diária de Solicitações</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <h3 className="text-2xl font-bold text-slate-900">{dailyAverageHumanRequests}</h3>
                  <span className="text-xs text-slate-500">pedidos/dia</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Atendidos Hoje */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Atendidos Hoje</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <h3 className="text-2xl font-bold text-slate-900">{handledToday.length}</h3>
                  <span className="text-xs text-slate-500">concluídos</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          {/* Search Input (Nome, Telefone, CNPJ) */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por nome, telefone ou CNPJ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs bg-slate-50 border-slate-200 focus-visible:bg-white text-slate-900"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Seletor de Agente (Padrão: Agente Novo, mas permite selecionar o antigo ou todos) */}
          <div className="w-full sm:w-[280px]">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-700">
                <div className="flex items-center gap-2 truncate">
                  <Bot className="h-4 w-4 text-[#E5003A] shrink-0" />
                  <SelectValue placeholder="Selecione o agente..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="font-semibold text-slate-700">Todos os Agentes (Geral)</span>
                </SelectItem>
                {agents.map((ag) => (
                  <SelectItem key={ag.id} value={ag.id}>
                    <span className="truncate">{ag.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Abas de Estado */}
          <div className="flex bg-slate-100 p-1 rounded-lg self-start lg:self-auto shrink-0">
            <Button 
              variant={filter === 'pending' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setFilter('pending')}
              className={cn(
                "text-xs font-semibold shadow-none h-7 px-3", 
                filter === 'pending' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Fila Atual ({pendingRequests.length})
            </Button>
            <Button 
              variant={filter === 'history' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setFilter('history')}
              className={cn(
                "text-xs font-semibold shadow-none h-7 px-3", 
                filter === 'history' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Atendidos Hoje ({handledToday.length})
            </Button>
          </div>
        </div>

        {/* Requests List */}
        {currentDisplayList.length === 0 ? (
          <Card className="border-dashed border-slate-200 bg-slate-50/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-7 w-7 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                {searchTerm 
                  ? 'Nenhum resultado para a busca.' 
                  : 'Nenhum atendimento nesta fila.'}
              </h3>
              <p className="text-muted-foreground text-xs max-w-sm mt-1">
                {searchTerm 
                  ? `Não encontramos registros para "${searchTerm}". Experimente buscar por outro nome, telefone ou CNPJ.`
                  : filter === 'pending'
                    ? 'Nenhum cliente solicitou atendimento humano no momento para este filtro.'
                    : 'Nenhum atendimento foi concluído hoje ainda para este filtro.'}
              </p>
              {searchTerm && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSearchTerm('')} 
                  className="mt-4 text-xs"
                >
                  Limpar Filtros de Busca
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {currentDisplayList.map((request) => {
              const info = getRequestInfo(request);

              return (
                <Card 
                  key={request.id} 
                  className={cn(
                    "overflow-hidden border border-slate-200 transition-all hover:shadow-md bg-white",
                    filter === 'history' ? "border-l-4 border-l-slate-300 opacity-85" :
                    (request.priority === 'urgent' ? "border-l-4 border-l-red-600" :
                     request.priority === 'high' ? "border-l-4 border-l-orange-500" : "border-l-4 border-l-[#E5003A]")
                  )}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row md:items-center p-4 gap-4">
                      {/* Priority & Timestamp */}
                      <div className="flex-shrink-0 flex flex-col items-center justify-center w-28 md:border-r border-slate-200 md:pr-4">
                        <Badge className={cn("mb-2 w-full justify-center text-[10px] uppercase font-bold", filter === 'history' ? 'bg-slate-200 text-slate-700' : getPriorityColor(request.priority))}>
                          {filter === 'history' ? 'Finalizado' : (request.priority || 'Normal')}
                        </Badge>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium text-center">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {filter === 'pending' 
                              ? formatDistanceToNow(new Date(request.requested_at), { addSuffix: true, locale: ptBR })
                              : `Atendido às ${new Date(request.handled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                            }
                          </span>
                        </div>
                      </div>

                      {/* Lead Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <User className="h-4 w-4 text-slate-500 shrink-0" />
                            <span className="font-bold text-sm text-slate-900 truncate">
                              {info.name}
                            </span>
                          </div>

                          {info.agentName && (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 font-medium">
                              <Bot className="h-3 w-3 mr-1 text-[#E5003A]" />
                              {info.agentName}
                            </Badge>
                          )}
                        </div>

                        {/* Contact Info (Phone & CNPJ) */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-2">
                          {info.phone && (
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Phone className="h-3 w-3 text-emerald-600" />
                              {formatPhoneBR(info.phone)}
                            </span>
                          )}
                          {info.cnpj && (
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Building2 className="h-3 w-3 text-slate-500" />
                              {formatCNPJ(info.cnpj)}
                            </span>
                          )}
                        </div>

                        {/* Message Quote */}
                        <div className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                          <span className="italic">"{request.initial_message}"</span>
                        </div>
                      </div>

                      {/* Actions / Operator Info */}
                      {filter === 'pending' ? (
                        <div className="flex-shrink-0 flex items-center md:pl-4">
                          {hasPermission('handoff.manage') && (
                            <Button 
                              size="sm" 
                              className="bg-[#E5003A] hover:bg-[#c70032] text-white gap-2 font-medium shadow-sm transition-all"
                              onClick={() => handleTakeover(request.id, request.conversation_id)}
                            >
                              Atender Agora
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex-shrink-0 text-right px-4 md:border-l border-slate-200">
                          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1 font-bold">Atendido por</p>
                          <div className="flex items-center gap-1 justify-end">
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 font-medium">
                              {usersMap[request.operator_id] || 'Operador'}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default HandoffHub;
