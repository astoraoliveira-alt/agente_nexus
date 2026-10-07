import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  RotateCcw, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Eye, 
  MessageSquare, 
  Award, 
  ArrowUpRight,
  Calendar,
  Layers,
  RefreshCw,
  Clock,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign, ReengagementComparisonData } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReengagementComparisonViewProps {
  initialCampaignId?: string;
  onSelectCampaign?: (campaignId: string) => void;
}

export function ReengagementComparisonView({ 
  initialCampaignId,
  onSelectCampaign 
}: ReengagementComparisonViewProps) {
  const { currentTenant } = useApp();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(() => {
    return initialCampaignId || sessionStorage.getItem('davos_active_campaign_id') || '';
  });
  const [comparison, setComparison] = useState<ReengagementComparisonData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentTenant) {
      loadCampaigns();
    }
  }, [currentTenant]);

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
      sessionStorage.setItem('davos_active_campaign_id', initialCampaignId);
    }
  }, [initialCampaignId]);

  useEffect(() => {
    if (currentTenant && selectedCampaignId) {
      loadComparison(selectedCampaignId);
    }
  }, [currentTenant, selectedCampaignId]);

  const loadCampaigns = async () => {
    if (!currentTenant) return;
    try {
      const data = await api.getCampaigns(currentTenant.id, false);
      setCampaigns(data || []);
      
      const rememberedId = initialCampaignId || selectedCampaignId || sessionStorage.getItem('davos_active_campaign_id');
      const validTarget = data?.find(c => c.id === rememberedId);

      if (validTarget) {
        setSelectedCampaignId(validTarget.id);
        sessionStorage.setItem('davos_active_campaign_id', validTarget.id);
        if (onSelectCampaign) onSelectCampaign(validTarget.id);
      } else if (data && data.length > 0) {
        setSelectedCampaignId(data[0].id);
        sessionStorage.setItem('davos_active_campaign_id', data[0].id);
        if (onSelectCampaign) onSelectCampaign(data[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar campanhas para comparativo:', err);
    }
  };

  const loadComparison = async (campId: string) => {
    if (!currentTenant || !campId) return;
    setLoading(true);
    try {
      const data = await api.getReengagementComparisonMetrics(currentTenant.id, campId);
      setComparison(data);
    } catch (err) {
      console.error('Erro ao buscar comparativo de reengajamento:', err);
    } finally {
      setLoading(false);
    }
  };

  const orig = comparison?.original;
  const reeng = comparison?.reengagement;
  const delta = comparison?.delta;

  const origFunnel = comparison?.originalFunnel || {
    carregados: orig?.totalSent || 0,
    enviados: orig?.totalSent || 0,
    entregues: orig?.delivered || 0,
    lidas: orig?.read || 0,
    interagiram: orig?.replied || 0,
    confirmaram: 0,
    faturamento: 0,
    valorInicial: 0,
    optIn: orig?.optIn || 0,
    aprovados: orig?.conversions || 0,
    recusados: 0,
    simularam: 0,
    okAgente: 0,
    aguarContato: 0,
    emAtendimento: 0,
    formalizado: 0,
    desistencia: 0,
  };

  const reengFunnel = comparison?.reengagementFunnel || {
    carregados: reeng?.totalSent || 0,
    enviados: reeng?.totalSent || 0,
    entregues: reeng?.delivered || 0,
    lidas: reeng?.read || 0,
    interagiram: reeng?.replied || 0,
    confirmaram: 0,
    faturamento: 0,
    valorInicial: 0,
    optIn: reeng?.optIn || 0,
    aprovados: reeng?.conversions || 0,
    recusados: 0,
    simularam: 0,
    okAgente: 0,
    aguarContato: 0,
    emAtendimento: 0,
    formalizado: 0,
    desistencia: 0,
  };

  const totalConsolidado = {
    carregados: origFunnel.carregados,
    enviados: origFunnel.enviados + reengFunnel.enviados,
    entregues: origFunnel.entregues + reengFunnel.entregues,
    lidas: origFunnel.lidas + reengFunnel.lidas,
    interagiram: origFunnel.interagiram + reengFunnel.interagiram,
    confirmaram: origFunnel.confirmaram + reengFunnel.confirmaram,
    faturamento: origFunnel.faturamento + reengFunnel.faturamento,
    valorInicial: origFunnel.valorInicial + reengFunnel.valorInicial,
    optIn: origFunnel.optIn + reengFunnel.optIn,
    aprovados: origFunnel.aprovados + reengFunnel.aprovados,
    recusados: origFunnel.recusados + reengFunnel.recusados,
    simularam: origFunnel.simularam + reengFunnel.simularam,
    okAgente: origFunnel.okAgente + reengFunnel.okAgente,
    aguarContato: origFunnel.aguarContato + reengFunnel.aguarContato,
    emAtendimento: origFunnel.emAtendimento + reengFunnel.emAtendimento,
    formalizado: origFunnel.formalizado + reengFunnel.formalizado,
    desistencia: origFunnel.desistencia + reengFunnel.desistencia,
  };

  return (
    <div className="space-y-6">
      {/* Top Bar com Seleção de Campanha e Ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/60 backdrop-blur-sm p-4 rounded-xl border border-border/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Dashboard Comparativo: Envio Original vs Reengajamento</h2>
            <p className="text-xs text-muted-foreground">Compare o desempenho antes e depois das rodadas de reativação</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <Select 
              value={selectedCampaignId} 
              onValueChange={(val) => {
                setSelectedCampaignId(val);
                sessionStorage.setItem('davos_active_campaign_id', val);
                if (onSelectCampaign) onSelectCampaign(val);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione uma campanha" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((camp) => (
                  <SelectItem key={camp.id} value={camp.id} className="text-xs">
                    {camp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => selectedCampaignId && loadComparison(selectedCampaignId)}
            disabled={loading}
            className="h-9 px-3 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
          Carregando dados comparativos da campanha...
        </div>
      ) : !comparison ? (
        <Card className="border-border/60">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma métrica disponível para esta campanha.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 4 Hero KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Reengajados */}
            <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disparos no Reengajamento</span>
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-foreground">{reeng?.totalSent || 0}</span>
                  <span className="text-xs text-muted-foreground">de {orig?.totalSent || 0} originais</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {orig?.totalSent ? Math.round(((reeng?.totalSent || 0) / orig.totalSent) * 100) : 0}% da base original reprocessada
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Novas Respostas */}
            <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Novas Respostas (Reativados)</span>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-emerald-600">+{delta?.extraReplies || 0}</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 text-[10px] py-0 px-1.5">
                    +{delta?.replyGrowthPct || 0}% de ganho
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Respostas adicionais obtidas exclusivamente no reengajamento
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Novas Conversões */}
            <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Novas Conversões de Crédito</span>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-amber-600">+{delta?.extraConversions || 0}</span>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/10 text-[10px] py-0 px-1.5">
                    {reeng?.conversionRate || 0}% conv. reeng.
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Propostas aprovadas geradas após reativar o contato
                </p>
              </CardContent>
            </Card>

            {/* Card 4: Taxa de Reativação */}
            <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Taxa de Resposta do Reengajamento</span>
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-foreground">{reeng?.replyRate || 0}%</span>
                  <span className="text-xs text-muted-foreground">vs {orig?.replyRate || 0}% original</span>
                </div>
                <Progress 
                  value={reeng?.replyRate || 0} 
                  className="mt-2 h-1.5 bg-indigo-500/20"
                />
              </CardContent>
            </Card>
          </div>

          {/* Matriz Comparativa no Formato de Planilha do Funil Principal */}
          <div className="bg-white border border-border/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-muted/20 border-b border-border/40 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Matriz Comparativa do Funil: Envio Original vs Reengajamento
                </h3>
                <p className="text-xs text-muted-foreground">
                  Estrutura idêntica ao Funil Executivo de Crédito com todas as etapas de Envio, Venda e Formalização
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                {/* Header Nível 1 — Macro Grupos */}
                <thead>
                  <tr className="border-b border-slate-200">
                    <th colSpan={2} className="px-4 py-3 bg-slate-100/70 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-r border-slate-200">
                      Identificação do Disparo
                    </th>
                    <th colSpan={5} className="px-4 py-3 bg-blue-50/80 text-blue-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-blue-100">
                      Envio da Campanha
                    </th>
                    <th colSpan={8} className="px-4 py-3 bg-emerald-50/80 text-emerald-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-emerald-100">
                      Funil de Venda
                    </th>
                    <th colSpan={4} className="px-4 py-3 bg-purple-50/80 text-purple-900 font-bold uppercase tracking-wider text-[11px] text-center">
                      Funil de Formalização
                    </th>
                  </tr>

                  {/* Header Nível 2 — Colunas Individuais */}
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="px-4 py-2.5">Origem / Etapa</th>
                    <th className="px-2 py-2.5 text-center border-r border-slate-200">Tipo</th>
                    
                    {/* Envio */}
                    <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Carregados</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Enviados</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Entregues</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Lidas</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950 border-r border-blue-100">Interagiram</th>

                    {/* Venda */}
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Confirmaram</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Faturamento</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Valor Inicial</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Opt-in</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Aprovados</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Recusados</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Simularam</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950 border-r border-emerald-100">OK Agente</th>

                    {/* Formalização */}
                    <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Aguar. Contato</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Em Atendimento</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Formalizado</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold text-rose-950">Desistência</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {/* Linha 1: Envio Original */}
                  <tr className="hover:bg-slate-50/90 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100 shrink-0" />
                        <span>Envio Original</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center border-r border-slate-200">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium text-blue-700 bg-blue-50 border-blue-200">
                        1º Disparo
                      </Badge>
                    </td>

                    {/* Envio */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.carregados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.enviados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.entregues.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.lidas.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-blue-700 bg-blue-50/40 border-r border-blue-100">{origFunnel.interagiram.toLocaleString('pt-BR')}</td>

                    {/* Venda */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.confirmaram.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.faturamento.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.valorInicial.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.optIn.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">{origFunnel.aprovados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-50/20">{origFunnel.recusados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.simularam.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20 border-r border-emerald-100">{origFunnel.okAgente.toLocaleString('pt-BR')}</td>

                    {/* Formalização */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-purple-50/20">{origFunnel.aguarContato.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-purple-50/20">{origFunnel.emAtendimento.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-purple-700 bg-purple-50/30">{origFunnel.formalizado.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-purple-50/20">{origFunnel.desistencia.toLocaleString('pt-BR')}</td>
                  </tr>

                  {/* Linha 2: Reengajamento */}
                  <tr className="hover:bg-slate-50/90 transition-colors bg-emerald-50/10">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" />
                        <span>Reengajamento</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center border-r border-slate-200">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium text-emerald-700 bg-emerald-50 border-emerald-200">
                        Reativação
                      </Badge>
                    </td>

                    {/* Envio */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.carregados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.enviados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.entregues.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.lidas.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-600 bg-blue-50/40 border-r border-blue-100">
                      +{reengFunnel.interagiram.toLocaleString('pt-BR')}
                    </td>

                    {/* Venda */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.confirmaram.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.faturamento.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.valorInicial.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.optIn.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">+{reengFunnel.aprovados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-50/20">{reengFunnel.recusados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.simularam.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20 border-r border-emerald-100">{reengFunnel.okAgente.toLocaleString('pt-BR')}</td>

                    {/* Formalização */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-purple-50/20">{reengFunnel.aguarContato.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-purple-50/20">{reengFunnel.emAtendimento.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-purple-700 bg-purple-50/30">+{reengFunnel.formalizado.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-purple-50/20">{reengFunnel.desistencia.toLocaleString('pt-BR')}</td>
                  </tr>

                  {/* Linha 3: Total Consolidado */}
                  <tr className="bg-slate-100/70 font-semibold border-t-2 border-slate-300">
                    <td className="px-4 py-3 text-slate-900 font-bold">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600 ring-2 ring-purple-200 shrink-0" />
                        <span>Total Consolidado</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center border-r border-slate-200">
                      <Badge className="text-[9px] px-1.5 py-0 font-bold bg-slate-800 text-white hover:bg-slate-800">
                        Acumulado
                      </Badge>
                    </td>

                    {/* Envio */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.carregados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.enviados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.entregues.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.lidas.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-blue-800 bg-blue-100/60 border-r border-blue-200">{totalConsolidado.interagiram.toLocaleString('pt-BR')}</td>

                    {/* Venda */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.confirmaram.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.faturamento.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.valorInicial.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.optIn.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-800 bg-emerald-100/60">{totalConsolidado.aprovados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-100/40">{totalConsolidado.recusados.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.simularam.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40 border-r border-emerald-200">{totalConsolidado.okAgente.toLocaleString('pt-BR')}</td>

                    {/* Formalização */}
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-purple-100/40">{totalConsolidado.aguarContato.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-purple-100/40">{totalConsolidado.emAtendimento.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono font-bold text-purple-800 bg-purple-100/60">{totalConsolidado.formalizado.toLocaleString('pt-BR')}</td>
                    <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-purple-100/40">{totalConsolidado.desistencia.toLocaleString('pt-BR')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Histórico dos Lotes Executados da Campanha */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Lotes de Reengajamento Disparados nesta Campanha
              </CardTitle>
              <CardDescription className="text-xs">
                Auditoria de cada envio secundário enfileirado
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(!comparison.batches || comparison.batches.length === 0) ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum lote de reengajamento foi registrado nesta campanha ainda.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">
                      <tr>
                        <th className="py-2.5 px-3">Data / Hora</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Alvos / Segmentos</th>
                        <th className="py-2.5 px-3 text-right">Contatos no Lote</th>
                        <th className="py-2.5 px-3">Lote ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {comparison.batches.map((batch: any) => (
                        <tr key={batch.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 font-medium text-foreground">
                            {batch.started_at ? format(new Date(batch.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge 
                              variant={batch.status === 'completed' ? 'default' : 'secondary'} 
                              className={`text-[10px] py-0 px-2 font-semibold ${
                                batch.status === 'completed' 
                                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              }`}
                            >
                              {batch.status === 'completed' ? 'Concluído' : batch.status === 'running' ? 'Em Processamento' : 'Agendado'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {Array.isArray(batch.target_options) ? batch.target_options.join(', ') : 'Personalizado'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            {batch.records_affected || 0}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                            {String(batch.id || '').substring(0, 8)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
