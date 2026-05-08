import React, { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  Zap, 
  Clock, 
  User, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  TrendingUp,
  Users,
  Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  const navigate = useNavigate();

  // Carregar nomes de usuários para o histórico
  React.useEffect(() => {
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

  // Filtros de Pedidos
  const pendingRequests = useMemo(() => 
    handoffRequests.filter(r => r.status === 'pending'), 
  [handoffRequests]);

  const handledToday = useMemo(() => 
    handoffRequests.filter(r => r.status !== 'pending' && isToday(new Date(r.handled_at || r.created_at))), 
  [handoffRequests]);

  // Cálculo de KPI Simples
  const avgWaitTime = useMemo(() => {
    if (handledToday.length === 0) return '---';
    const total = handledToday.reduce((acc, curr) => {
      const wait = new Date(curr.handled_at).getTime() - new Date(curr.requested_at).getTime();
      return acc + wait;
    }, 0);
    const avg = total / handledToday.length / 1000 / 60; // em minutos
    return `${avg.toFixed(1)} min`;
  }, [handledToday]);

  const handleTakeover = async (requestId: string, conversationId: string) => {
    try {
      // 1. Assumir a conversa no AppContext (Silencia Sofia e avisa no chat)
      // Agora capturamos o objeto ATUALIZADO (com status human_active)
      const updatedConv = await takeOverConversation(conversationId);
      
      // 2. Selecionar a conversa ATUALIZADA
      if (updatedConv) {
        setSelectedConversation(updatedConv);
      }
      
      // 3. Marcar o pedido de handoff como ativo no banco
      await supabase
        .from('handoff_requests')
        .update({ 
          status: 'active', 
          handled_at: new Date().toISOString(),
          operator_id: currentUser?.id 
        })
        .eq('id', requestId);

      // 4. Redirecionar
      navigate('/conversations');
    } catch (err) {
      console.error('Erro ao assumir atendimento:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-blue-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  return (
    <MainLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-accent" />
              Fila de Atendimento (Solicitação por Atendimento Humano)
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Gerencie a transição de IA para Humano em tempo real.
            </p>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Button 
              variant={filter === 'pending' ? 'white' : 'ghost'} 
              size="sm" 
              onClick={() => setFilter('pending')}
              className="text-xs font-semibold"
            >
              Fila Atual ({pendingRequests.length})
            </Button>
            <Button 
              variant={filter === 'history' ? 'white' : 'ghost'} 
              size="sm" 
              onClick={() => setFilter('history')}
              className="text-xs font-semibold"
            >
              Atendidos Hoje ({handledToday.length})
            </Button>
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white border-slate-200">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Aguardando Agora</p>
                <h3 className="text-2xl font-bold">{pendingRequests.length}</h3>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white border-slate-200">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Atendidos Hoje</p>
                <h3 className="text-2xl font-bold">{handledToday.length}</h3>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                <Timer className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">T.M.R (Médio)</p>
                <h3 className="text-2xl font-bold">{avgWaitTime}</h3>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        {(filter === 'pending' ? pendingRequests : handledToday).length === 0 ? (
          <Card className="border-dashed bg-slate-50/50">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold">Sem registros aqui.</h3>
              <p className="text-muted-foreground max-w-xs mx-auto">
                {filter === 'pending' 
                  ? 'Nenhum pedido pendente no momento. A Sofia está operando 100%.' 
                  : 'Nenhum pedido foi atendido hoje ainda.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {(filter === 'pending' ? pendingRequests : handledToday).map((request) => (
              <Card 
                key={request.id} 
                className={cn(
                  "overflow-hidden border-l-4 transition-all hover:shadow-md",
                  filter === 'history' ? "border-l-slate-300 opacity-80" :
                  (request.priority === 'high' || request.priority === 'urgent' ? "border-l-red-500" : "border-l-blue-500")
                )}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center p-4 gap-4">
                    {/* Time Info */}
                    <div className="flex-shrink-0 flex flex-col items-center justify-center w-28 border-r pr-4">
                      <Badge className={cn("mb-2 w-full justify-center text-[10px] uppercase", filter === 'history' ? 'bg-slate-200 text-slate-700' : getPriorityColor(request.priority))}>
                        {filter === 'history' ? 'Finalizado' : (request.priority || 'Normal')}
                      </Badge>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium text-center">
                        <Clock className="h-3 w-3" />
                        {filter === 'pending' 
                          ? formatDistanceToNow(new Date(request.requested_at), { addSuffix: true, locale: ptBR })
                          : `Atendido às ${new Date(request.handled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        }
                      </div>
                    </div>

                    {/* Lead Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-bold text-sm truncate">
                          {conversations.find(c => c.id === request.conversation_id)?.userName || 'Cliente Desconhecido'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground italic bg-slate-50 p-2 rounded border border-black/5">
                        <MessageSquare className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">"{request.initial_message}"</span>
                      </div>
                    </div>

                    {/* Actions / Operator */}
                    {filter === 'pending' ? (
                      <div className="flex-shrink-0 flex items-center gap-2 pl-4">
                        {hasPermission('handoff.manage') && (
                          <Button 
                            size="sm" 
                            className="bg-accent hover:bg-accent/90 text-white gap-2"
                            onClick={() => handleTakeover(request.id, request.conversation_id)}
                          >
                            Atender Agora
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex-shrink-0 text-right px-4 border-l">
                         <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1 font-bold">Atendido por</p>
                         <div className="flex items-center gap-1 justify-end">
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                               {usersMap[request.operator_id] || 'Operador'}
                            </Badge>
                         </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 p-4 rounded-lg border border-blue-100">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <p>
            <strong>Performance:</strong> O tempo médio de resposta (T.M.R) ajuda a medir a eficiência da sua equipe em transições da IA para humano.
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default HandoffHub;
