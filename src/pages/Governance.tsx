import { useState } from 'react';
import { 
  ShieldCheck, FileText, AlertTriangle, Activity, 
  Search, Plus, Eye, Pencil, ExternalLink 
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';
import { mockAIPolicies, mockAIIncidents, mockAgentGovernance } from '@/lib/mock-extended-data';
import { mockAgents } from '@/lib/mock-data';

export default function Governance() {
  const { openSlideOver } = useApp();
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <Badge variant="destructive">Alto Risco</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio Risco</Badge>;
      default:
        return <Badge variant="secondary">Baixo Risco</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-600">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio</Badge>;
      default:
        return <Badge variant="secondary">Baixo</Badge>;
    }
  };

  const getIncidentStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge className="bg-green-600">Resolvido</Badge>;
      case 'investigating':
        return <Badge className="bg-blue-600">Investigando</Badge>;
      default:
        return <Badge variant="destructive">Aberto</Badge>;
    }
  };

  const openIncidents = mockAIIncidents.filter(i => i.status !== 'resolved').length;
  const activeAgents = mockAgents.filter(a => a.status === 'active').length;
  const highRiskAgents = mockAgentGovernance.filter(g => g.riskLevel === 'high').length;

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Governança de IA</h1>
                  <p className="text-sm text-muted-foreground">Políticas, riscos e conformidade ISO</p>
                </div>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
            <TabsList>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="policies">Políticas</TabsTrigger>
              <TabsTrigger value="incidents">Incidentes</TabsTrigger>
              <TabsTrigger value="risk">Classificação de Risco</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="p-6">
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-5 w-5 text-accent" />
                  <span className="text-sm text-muted-foreground">Políticas Ativas</span>
                </div>
                <p className="text-3xl font-bold">{mockAIPolicies.filter(p => p.isActive).length}</p>
              </div>
              
              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <span className="text-sm text-muted-foreground">Incidentes Abertos</span>
                </div>
                <p className="text-3xl font-bold">{openIncidents}</p>
              </div>
              
              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="h-5 w-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">Agentes Monitorados</span>
                </div>
                <p className="text-3xl font-bold">{activeAgents}</p>
              </div>
              
              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="h-5 w-5 text-destructive" />
                  <span className="text-sm text-muted-foreground">Alto Risco</span>
                </div>
                <p className="text-3xl font-bold">{highRiskAgents}</p>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Incidents */}
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Incidentes Recentes</h3>
                <div className="space-y-3">
                  {mockAIIncidents.slice(0, 3).map((incident) => (
                    <div 
                      key={incident.id} 
                      className="flex items-start gap-3 p-3 bg-muted hover:bg-muted/80 cursor-pointer"
                      onClick={() => openSlideOver('incident-details', incident)}
                    >
                      <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                        incident.severity === 'critical' ? 'text-destructive' :
                        incident.severity === 'high' ? 'text-orange-500' :
                        'text-warning'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{incident.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{incident.description}</p>
                        <div className="flex gap-2 mt-2">
                          {getSeverityBadge(incident.severity)}
                          {getIncidentStatusBadge(incident.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Policies */}
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Políticas Ativas</h3>
                <div className="space-y-3">
                  {mockAIPolicies.filter(p => p.isActive).map((policy) => (
                    <div 
                      key={policy.id} 
                      className="flex items-start gap-3 p-3 bg-muted hover:bg-muted/80 cursor-pointer"
                      onClick={() => openSlideOver('policy-details', policy)}
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-accent" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{policy.name}</p>
                          <Badge variant="outline" className="text-[10px]">v{policy.version}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {policy.rules.canDo.length} permissões • {policy.rules.cannotDo.length} restrições
                        </p>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="policies" className="mt-0 space-y-4">
            <div className="flex justify-between items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar políticas..." className="pl-10" />
              </div>
              <Button className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" />
                Nova Política
              </Button>
            </div>

            <div className="grid gap-4">
              {mockAIPolicies.map((policy) => (
                <div key={policy.id} className="kpi-card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{policy.name}</h3>
                          <Badge variant="outline">v{policy.version}</Badge>
                          {policy.isActive ? (
                            <Badge className="bg-green-600">Ativa</Badge>
                          ) : (
                            <Badge variant="secondary">Inativa</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Criada em {policy.createdAt.toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openSlideOver('policy-details', policy)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">Pode fazer</p>
                      <p className="text-2xl font-bold text-green-600">{policy.rules.canDo.length}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Não pode</p>
                      <p className="text-2xl font-bold text-red-600">{policy.rules.cannotDo.length}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Transferir se</p>
                      <p className="text-2xl font-bold text-blue-600">{policy.rules.transferConditions.length}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="incidents" className="mt-0 space-y-4">
            <div className="flex justify-between items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar incidentes..." className="pl-10" />
              </div>
              <Button className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" />
                Registrar Incidente
              </Button>
            </div>

            <div className="kpi-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Incidente</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agente</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Severidade</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {mockAIIncidents.map((incident) => {
                    const agent = mockAgents.find(a => a.id === incident.agentId);
                    return (
                      <tr 
                        key={incident.id} 
                        className="border-b border-border hover:bg-muted/50 cursor-pointer"
                        onClick={() => openSlideOver('incident-details', incident)}
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium">{incident.title}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{incident.description}</p>
                        </td>
                        <td className="py-3 px-4 text-sm">{agent?.name || '-'}</td>
                        <td className="py-3 px-4">{getSeverityBadge(incident.severity)}</td>
                        <td className="py-3 px-4">{getIncidentStatusBadge(incident.status)}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {incident.createdAt.toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockAgentGovernance.map((gov) => {
                const agent = mockAgents.find(a => a.id === gov.agentId);
                if (!agent) return null;
                
                return (
                  <div 
                    key={gov.agentId} 
                    className="kpi-card cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => openSlideOver('agent-governance', { governance: gov, agent })}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground">{agent.id}</p>
                      </div>
                      {getRiskBadge(gov.riskLevel)}
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Tipo de Uso</span>
                        <Badge variant="outline" className="capitalize">{gov.usageType}</Badge>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Autonomia</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div 
                              key={level}
                              className={`w-4 h-4 ${level <= gov.autonomyLevel ? 'bg-accent' : 'bg-muted'}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Políticas</span>
                        <span className="text-sm font-medium">{gov.policies.length} vinculadas</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </div>
      </div>
    </MainLayout>
  );
}
