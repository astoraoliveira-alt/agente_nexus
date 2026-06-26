import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Campaign } from '@/lib/types';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  Megaphone, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  History,
  TerminalSquare,
  Activity,
  CheckSquare,
  ArrowLeft
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
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface CampaignWithStats extends Campaign {
  stats?: {
    total_contacts: number;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    response_count: number;
    failed_count: number; // not_delivered
    conversion_count: number;
  }
}

export default function CampaignRecovery() {
  const { currentTenant } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentTenant) {
      loadCampaigns();
      loadHistory();
    }
  }, [currentTenant]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const loadCampaigns = async () => {
    if (!currentTenant) return;
    try {
      // Remover o filtro de status para trazer todas
      const activeCampaigns = await api.getCampaigns(currentTenant.id, false);
      
      const statsMap = await api.getAllCampaignsStats(currentTenant.id) || {};
      
      const enriched = activeCampaigns.map(c => ({
        ...c,
        stats: statsMap[c.id] || {
          total_contacts: 0, sent_count: 0, delivered_count: 0, read_count: 0, response_count: 0, failed_count: 0, conversion_count: 0
        }
      }));
      
      setCampaigns(enriched);
    } catch (err) {
      console.error(err);
    }
  };

  const loadHistory = async () => {
    if (!currentTenant) return;
    try {
      const data = await api.getCampaignRecoveryLogs(currentTenant.id);
      setHistoryLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCampaign = (id: string) => {
    setSelectedCampaigns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleTarget = (target: string) => {
    setTargets(prev => 
      prev.includes(target) ? prev.filter(t => t !== target) : [...prev, target]
    );
  };

  const addLog = (msg: string) => {
    const time = format(new Date(), 'HH:mm:ss');
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  const startRecovery = async () => {
    if (!currentTenant) return;
    if (selectedCampaigns.length === 0) {
      toast({ title: 'Aviso', description: 'Selecione pelo menos uma campanha.', variant: 'destructive' });
      return;
    }
    if (targets.length === 0) {
      toast({ title: 'Aviso', description: 'Selecione pelo menos um alvo (status).', variant: 'destructive' });
      return;
    }

    setIsRunning(true);
    setLogs([]);
    addLog('Iniciando processo de recuperação...');

    try {
      // Para MVP, pegamos a primeira campanha selecionada
      const campaignId = selectedCampaigns[0];
      const campName = campaigns.find(c => c.id === campaignId)?.name || campaignId;
      addLog(`Preparando campanha: ${campName}`);
      addLog(`Alvos selecionados: ${targets.join(', ')}`);

      const logId = await api.executeManualReengagement(campaignId, currentTenant.id, targets);
      
      if (!logId) {
        addLog('ERRO: Falha ao iniciar recuperação no banco de dados.');
        setIsRunning(false);
        return;
      }

      setActiveLogId(logId);
      addLog(`Recuperação iniciada com sucesso (Log ID: ${logId.split('-')[0]}).`);
      addLog('Aguardando processamento da fila pelo motor (n8n)...');

      // Iniciar polling
      pollStatus(campaignId, logId);
    } catch (err: any) {
      addLog(`ERRO CRÍTICO: ${err.message}`);
      setIsRunning(false);
    }
  };

  const pollStatus = async (campaignId: string, logId: string) => {
    if (!currentTenant) return;
    
    let isFinished = false;
    const startTime = Date.now();
    let hasLoggedRecordsAffected = false;
    
    const interval = setInterval(async () => {
      try {
        // Obter log para mostrar registros afetados no começo
        if (!hasLoggedRecordsAffected) {
            const { data: logData } = await api.supabase
              .from('campaign_recovery_logs')
              .select('records_affected')
              .eq('id', logId)
              .single();
            if (logData && logData.records_affected !== undefined) {
                hasLoggedRecordsAffected = true;
                addLog(`Registros afetados (movidos para a fila): ${logData.records_affected}`);
            }
        }

        // Consultar contagem real da fila
        const { count: pending } = await api.supabase
          .from('outbound_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('tenant_id', currentTenant.id)
          .eq('status', 'pending');
          
        const { count: processing } = await api.supabase
          .from('outbound_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('tenant_id', currentTenant.id)
          .eq('status', 'processing');
        
        const pCount = pending || 0;
        const prCount = processing || 0;
        
        addLog(`Fila atual: ${pCount} pendentes, ${prCount} processando...`);
        
        if (pCount === 0 && prCount === 0) {
          isFinished = true;
          clearInterval(interval);
          addLog('Fila esvaziada! Finalizando registro de recuperação...');
          
          await api.completeManualReengagement(logId);
          
          // Buscar log atualizado para mostrar os deltas
          const { data: finalLog } = await api.supabase
            .from('campaign_recovery_logs')
            .select('*')
            .eq('id', logId)
            .single();
            
          if (finalLog) {
             const beforeNd = finalLog.snapshot_before?.not_delivered || 0;
             const afterNd = finalLog.snapshot_after?.not_delivered || 0;
             addLog(`Resumo: not_delivered de ${beforeNd} para ${afterNd} (Delta: ${afterNd - beforeNd})`);
             addLog(`Duração total: ${finalLog.duration_seconds || Math.round((Date.now() - startTime)/1000)}s`);
          }
          
          addLog('Recuperação concluída e histórico salvo com sucesso.');
          setIsRunning(false);
          setActiveLogId(null);
          
          toast({ title: 'Sucesso', description: 'Processo de recuperação finalizado!' });
          loadHistory();
          loadCampaigns();
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 4000); // 4 seconds polling

    // Timeout de segurança (ex: 1 hora)
    setTimeout(() => {
      if (!isFinished) {
        clearInterval(interval);
        addLog('AVISO: Timeout do terminal atingido (1h). A recuperação pode ainda estar rodando no backend.');
        setIsRunning(false);
      }
    }, 60 * 60 * 1000);
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto flex flex-col">
        {/* Cabeçalho no padrão do sistema */}
        <div className="sticky top-0 z-10 bg-background border-b border-border shrink-0">
          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Button variant="ghost" size="icon" onClick={() => navigate('/campaigns')} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <RotateCcw className="h-6 w-6 text-blue-500" />
                  Central de Reengajamento
                </h1>
              </div>
              <p className="text-sm text-muted-foreground ml-11">
                Recupere falhas de entrega e reengaje contatos parados
              </p>
            </div>
          </div>
        </div>

        {/* Conteúdo principal */}
        <div className="p-6 flex-1 min-h-0">
          <Tabs defaultValue="new" className="h-full flex flex-col">
            <TabsList className="bg-card border border-border mb-6 self-start">
              <TabsTrigger value="new" className="flex items-center gap-2">
                <Play className="h-4 w-4" /> Nova Recuperação
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Execuções
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="flex-1 min-h-0 m-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                
                {/* Coluna 1 & 2: Configuração */}
                <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2 pb-6">
                  
                  <Card className="border-border/50 shadow-sm bg-card/50 backdrop-blur-sm shrink-0">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckSquare className="h-5 w-5 text-blue-500" />
                        1. Selecione a Campanha
                      </CardTitle>
                      <CardDescription>Escolha qual campanha deseja reprocessar</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                      {campaigns.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma campanha disponível.</p>
                      ) : (
                        campaigns.map(camp => (
                          <div 
                            key={camp.id}
                            className={`flex items-center space-x-4 border rounded-lg p-3 transition-colors ${selectedCampaigns.includes(camp.id) ? 'border-blue-500 bg-blue-500/5' : 'border-border/50 hover:bg-accent/50 cursor-pointer'}`}
                            onClick={() => toggleCampaign(camp.id)}
                          >
                            <Checkbox 
                              checked={selectedCampaigns.includes(camp.id)}
                              onCheckedChange={() => toggleCampaign(camp.id)}
                            />
                            <div className="flex-1">
                              <p className="font-semibold text-sm">{camp.name}</p>
                              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                <span>Total: {camp.stats?.total_contacts}</span>
                                <span className="text-red-400">Falhas: {camp.stats?.failed_count}</span>
                                <span className="text-green-400">Lidos: {camp.stats?.read_count}</span>
                              </div>
                            </div>
                            <Badge variant="outline">{camp.status}</Badge>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 shadow-sm bg-card/50 backdrop-blur-sm shrink-0">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5 text-amber-500" />
                        2. Selecione o Alvo
                      </CardTitle>
                      <CardDescription>Quais status devem ser recolocados na fila?</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start space-x-3 bg-accent/30 p-3 rounded-lg">
                        <Checkbox 
                          id="tgt-not-delivered" 
                          checked={targets.includes('not_delivered')}
                          onCheckedChange={() => toggleTarget('not_delivered')}
                        />
                        <div className="space-y-1 leading-none">
                          <Label htmlFor="tgt-not-delivered" className="font-medium cursor-pointer">
                            Tentativas Falhas (not_delivered)
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Contatos que deram erro no primeiro envio. Eles voltarão para 'pending' e receberão a mensagem inicial novamente.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 bg-accent/30 p-3 rounded-lg">
                        <Checkbox 
                          id="tgt-no-response" 
                          checked={targets.includes('no_response')}
                          onCheckedChange={() => toggleTarget('no_response')}
                        />
                        <div className="space-y-1 leading-none">
                          <Label htmlFor="tgt-no-response" className="font-medium cursor-pointer">
                            Lidos / Recebidos sem Resposta (no_response)
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Contatos que receberam a primeira mensagem mas não interagiram. O motor enviará a mensagem de reengajamento.
                          </p>
                        </div>
                      </div>

                      <Button 
                        className="w-full mt-4 font-bold" 
                        size="lg"
                        disabled={isRunning || selectedCampaigns.length === 0 || targets.length === 0}
                        onClick={startRecovery}
                      >
                        {isRunning ? (
                          <><Activity className="mr-2 h-4 w-4 animate-spin" /> Processando Fila...</>
                        ) : (
                          <><Play className="mr-2 h-4 w-4" /> Iniciar Recuperação</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                </div>

                {/* Coluna 3: Terminal */}
                <div className="lg:col-span-1 h-full min-h-[400px]">
                  <Card className="border-border/50 shadow-sm bg-black/90 text-green-400 font-mono h-full flex flex-col">
                    <CardHeader className="border-b border-white/10 pb-3 shrink-0">
                      <CardTitle className="text-sm flex items-center gap-2 text-white/90 font-sans">
                        <TerminalSquare className="h-4 w-4" />
                        Terminal de Execução
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 flex-1 overflow-y-auto text-xs space-y-1.5" ref={terminalRef}>
                      {logs.length === 0 ? (
                        <p className="text-green-400/50 italic">Aguardando comando...</p>
                      ) : (
                        logs.map((log, idx) => (
                          <div key={idx} className={`${log.includes('ERRO') ? 'text-red-400' : log.includes('AVISO') ? 'text-yellow-400' : 'text-green-400'}`}>
                            {log}
                          </div>
                        ))
                      )}
                      {isRunning && (
                        <div className="animate-pulse">_</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <Card className="border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Histórico de Recuperações</CardTitle>
                  <CardDescription>Auditoria de todas as ações de reengajamento realizadas</CardDescription>
                </CardHeader>
                <CardContent>
                  {historyLogs.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">Nenhum log de recuperação encontrado.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-accent/50 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3">Data/Hora</th>
                            <th className="px-4 py-3">Campanha</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Alvos</th>
                            <th className="px-4 py-3">Afetados</th>
                            <th className="px-4 py-3">Duração</th>
                            <th className="px-4 py-3">Delta (not_delivered)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {historyLogs.map(log => {
                            const camp = campaigns.find(c => c.id === log.campaign_id);
                            const beforeNd = log.snapshot_before?.not_delivered || 0;
                            const afterNd = log.snapshot_after?.not_delivered || 0;
                            const delta = afterNd - beforeNd;
                            
                            return (
                              <tr key={log.id} className="hover:bg-accent/20">
                                <td className="px-4 py-3">{format(new Date(log.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}</td>
                                <td className="px-4 py-3 font-medium">{camp?.name || 'Desconhecida'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={log.status === 'completed' ? 'default' : 'secondary'}>
                                    {log.status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">{log.target_options?.join(', ')}</td>
                                <td className="px-4 py-3 font-bold">{log.records_affected}</td>
                                <td className="px-4 py-3">{log.duration_seconds ? `${log.duration_seconds}s` : '-'}</td>
                                <td className="px-4 py-3">
                                  {log.status === 'completed' ? (
                                    <span className={delta < 0 ? 'text-green-500 font-bold' : 'text-muted-foreground'}>
                                      {beforeNd} ➔ {afterNd}
                                    </span>
                                  ) : '-'}
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
