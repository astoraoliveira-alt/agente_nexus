import { useState } from 'react';
import { 
  Workflow, Plus, Search, ArrowRight, ArrowDown, 
  Phone, MessageSquare, CheckCircle2, TrendingUp, Clock, Users 
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useApp } from '@/contexts/AppContext';
import { mockFlows, mockSuccessMetrics } from '@/lib/mock-extended-data';
import { mockAgents } from '@/lib/mock-data';

export default function Flows() {
  const { openSlideOver } = useApp();
  const [activeTab, setActiveTab] = useState('flows');
  const [search, setSearch] = useState('');

  const filteredFlows = mockFlows.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.description.toLowerCase().includes(search.toLowerCase())
  );

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'greeting':
        return '👋';
      case 'qualification':
        return '🔍';
      case 'resolution':
        return '✅';
      case 'handoff':
        return '🔄';
      case 'closing':
        return '🏁';
      default:
        return '📍';
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Fluxos Conversacionais</h1>
                  <p className="text-sm text-muted-foreground">Gerencie jornadas e métricas de sucesso</p>
                </div>
              </div>
              <Button className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" />
                Novo Fluxo
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
            <TabsList>
              <TabsTrigger value="flows">Fluxos</TabsTrigger>
              <TabsTrigger value="metrics">Métricas de Sucesso</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="p-6">
          <TabsContent value="flows" className="mt-0 space-y-6">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar fluxos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Flows Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredFlows.map((flow) => {
                const agents = flow.agentIds.map(id => mockAgents.find(a => a.id === id)).filter(Boolean);
                const metrics = mockSuccessMetrics.byFlow.find(m => m.flowId === flow.id);
                
                return (
                  <div 
                    key={flow.id} 
                    className="kpi-card cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => openSlideOver('flow-details', { flow, metrics })}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{flow.name}</h3>
                          {flow.type === 'outbound' ? (
                            <Badge className="bg-purple-600">Outbound</Badge>
                          ) : (
                            <Badge variant="secondary">Inbound</Badge>
                          )}
                          {flow.isActive ? (
                            <Badge className="bg-green-600">Ativo</Badge>
                          ) : (
                            <Badge variant="outline">Inativo</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{flow.description}</p>
                      </div>
                    </div>

                    {/* Steps visualization */}
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground mb-2">Etapas do Fluxo</p>
                      <div className="flex items-center gap-1 overflow-x-auto pb-2">
                        {flow.steps.map((step, idx) => (
                          <div key={step.id} className="flex items-center">
                            <div 
                              className="flex items-center gap-1 px-2 py-1 bg-muted text-xs whitespace-nowrap"
                              title={step.description}
                            >
                              <span>{getStepIcon(step.type)}</span>
                              <span>{step.name}</span>
                            </div>
                            {idx < flow.steps.length - 1 && (
                              <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Agents */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs text-muted-foreground">Agentes:</span>
                      {agents.map((agent) => (
                        <Badge key={agent?.id} variant="outline" className="text-xs">
                          {agent?.name}
                        </Badge>
                      ))}
                    </div>

                    {/* Metrics preview */}
                    {metrics && (
                      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                        <div className="text-center">
                          <p className="text-lg font-bold text-accent">{metrics.successRate.toFixed(0)}%</p>
                          <p className="text-[10px] text-muted-foreground">Sucesso</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold">{(metrics.avgCompletionTime / 60).toFixed(1)}min</p>
                          <p className="text-[10px] text-muted-foreground">Tempo Médio</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold">{metrics.humanInterventionRate.toFixed(0)}%</p>
                          <p className="text-[10px] text-muted-foreground">Interv. Humana</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="mt-0 space-y-6">
            {/* Global KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">Taxa de Sucesso</span>
                </div>
                <p className="text-3xl font-bold text-green-600">{mockSuccessMetrics.overallSuccessRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mockSuccessMetrics.successfulConversations.toLocaleString()} de {mockSuccessMetrics.totalConversations.toLocaleString()}
                </p>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Tempo Médio</span>
                </div>
                <p className="text-3xl font-bold">{(mockSuccessMetrics.avgTimeToResolution / 60).toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-1">minutos por resolução</p>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  <span className="text-sm text-muted-foreground">Intervenções Humanas</span>
                </div>
                <p className="text-3xl font-bold">{mockSuccessMetrics.humanInterventions.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((mockSuccessMetrics.humanInterventions / mockSuccessMetrics.totalConversations) * 100).toFixed(1)}% do total
                </p>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-accent" />
                  <span className="text-sm text-muted-foreground">Total Conversas</span>
                </div>
                <p className="text-3xl font-bold">{mockSuccessMetrics.totalConversations.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{mockSuccessMetrics.period}</p>
              </div>
            </div>

            {/* Metrics by Flow */}
            <div className="kpi-card">
              <h3 className="font-semibold mb-4">Desempenho por Fluxo</h3>
              <div className="space-y-4">
                {mockSuccessMetrics.byFlow.map((flowMetrics) => {
                  const flow = mockFlows.find(f => f.id === flowMetrics.flowId);
                  
                  return (
                    <div key={flowMetrics.flowId} className="p-4 bg-muted">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{flowMetrics.flowName}</h4>
                          <p className="text-xs text-muted-foreground">
                            {flowMetrics.totalConversations.toLocaleString()} conversas
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-accent">{flowMetrics.successRate}%</p>
                          <p className="text-xs text-muted-foreground">sucesso</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Taxa de Sucesso</span>
                            <span>{flowMetrics.successRate}%</span>
                          </div>
                          <Progress value={flowMetrics.successRate} className="h-2" />
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Tempo médio:</span>
                            <span className="ml-1 font-medium">{(flowMetrics.avgCompletionTime / 60).toFixed(1)}min</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Intervenções:</span>
                            <span className="ml-1 font-medium">{flowMetrics.humanInterventions.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Taxa interv.:</span>
                            <span className="ml-1 font-medium">{flowMetrics.humanInterventionRate}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </div>
      </div>
    </MainLayout>
  );
}
