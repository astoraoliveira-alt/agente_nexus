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

          {/* Comparativo Lado a Lado (Tabela Executiva de Funil) */}
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/50 py-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                Matriz Comparativa de Desempenho
              </CardTitle>
              <CardDescription className="text-xs">
                Valores absolutos e percentuais de conversão em cada etapa
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">
                    <tr>
                      <th className="py-3 px-4">Etapa do Funil</th>
                      <th className="py-3 px-4 text-center">Envio Original</th>
                      <th className="py-3 px-4 text-center">Reengajamento</th>
                      <th className="py-3 px-4 text-right">Impacto Adicional (Delta)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {/* Disparos */}
                    <tr className="hover:bg-muted/20">
                      <td className="py-3.5 px-4 font-medium flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        Disparos Realizados
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-foreground">
                        {orig?.totalSent || 0}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-blue-600">
                        {reeng?.totalSent || 0}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                        +{reeng?.totalSent || 0} novos envios
                      </td>
                    </tr>

                    {/* Entregues */}
                    <tr className="hover:bg-muted/20">
                      <td className="py-3.5 px-4 font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Chegaram no Celular (Entregues)
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-foreground">{orig?.delivered || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({orig?.deliveredRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-blue-600">{reeng?.delivered || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({reeng?.deliveredRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600 font-bold">
                        +{reeng?.delivered || 0} entregues
                      </td>
                    </tr>

                    {/* Lidos */}
                    <tr className="hover:bg-muted/20">
                      <td className="py-3.5 px-4 font-medium flex items-center gap-2">
                        <Eye className="w-4 h-4 text-sky-500" />
                        Mensagens Lidas
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-foreground">{orig?.read || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({orig?.readRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-blue-600">{reeng?.read || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({reeng?.readRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-sky-600 font-bold">
                        +{reeng?.read || 0} lidas
                      </td>
                    </tr>

                    {/* Responderam / Interagiram */}
                    <tr className="hover:bg-muted/20 bg-emerald-500/5">
                      <td className="py-3.5 px-4 font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        Responderam / Interagiram
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-foreground">{orig?.replied || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({orig?.replyRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-emerald-600">{reeng?.replied || 0}</span>
                        <span className="text-[11px] text-emerald-700 ml-1.5 font-bold">({reeng?.replyRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600 font-bold">
                        +{delta?.extraReplies || 0} reativações (+{delta?.replyGrowthPct || 0}%)
                      </td>
                    </tr>

                    {/* Opt-in Formalizado */}
                    <tr className="hover:bg-muted/20 bg-indigo-500/5">
                      <td className="py-3.5 px-4 font-semibold text-foreground flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Opt-in Formalizado
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-foreground">{orig?.optIn || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({orig?.optInRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-indigo-600">{reeng?.optIn || 0}</span>
                        <span className="text-[11px] text-indigo-700 ml-1.5 font-bold">({reeng?.optInRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-indigo-600 font-bold">
                        +{reeng?.optIn || 0} opt-ins
                      </td>
                    </tr>

                    {/* Conversões de Crédito */}
                    <tr className="hover:bg-muted/20 bg-amber-500/5">
                      <td className="py-3.5 px-4 font-semibold text-foreground flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-600" />
                        Aprovados / Formalizados
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-foreground">{orig?.conversions || 0}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({orig?.conversionRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-amber-600">{reeng?.conversions || 0}</span>
                        <span className="text-[11px] text-amber-700 ml-1.5 font-bold">({reeng?.conversionRate || 0}%)</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-600 font-bold">
                        +{delta?.extraConversions || 0} novos contratos
                      </td>
                    </tr>

                    {/* Falhas */}
                    <tr className="hover:bg-muted/20">
                      <td className="py-3.5 px-4 font-medium text-muted-foreground flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                        Falhas de Entrega
                      </td>
                      <td className="py-3.5 px-4 text-center text-muted-foreground">
                        {orig?.failed || 0} ({orig?.failedRate || 0}%)
                      </td>
                      <td className="py-3.5 px-4 text-center text-rose-600 font-medium">
                        {reeng?.failed || 0} ({reeng?.failedRate || 0}%)
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                        -
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

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
