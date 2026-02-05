import { Settings as SettingsIcon, Building2, Shield, Bell, Palette, Globe, Database, BarChart3 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';
import { ConsumptionSettings } from '@/components/consumption/ConsumptionSettings';
import { useState, useEffect } from 'react';
import { Agent, Company } from '@/lib/types';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';

export default function Settings() {
  const { currentTenant, currentUser } = useApp();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Tenants Management State
  const [showTenants, setShowTenants] = useState(false);
  const [tenantsList, setTenantsList] = useState<any[]>([]); // using any or correct type intersection
  const [loadingTenants, setLoadingTenants] = useState(false);

  const handleViewTenants = async () => {
    if (showTenants) {
      setShowTenants(false);
      return;
    }

    setLoadingTenants(true);
    try {
      const companies = await api.getCompanies();
      setTenantsList(companies);
      setShowTenants(true);
    } catch (e) {
      console.error(e);
      toast({ title: "Erro", description: "Falha ao carregar tenants", variant: "destructive" });
    } finally {
      setLoadingTenants(false);
    }
  };

  useEffect(() => {
    if (currentTenant?.id) {
      setLoadingAgents(true);
      api.getAgents(currentTenant.id)
        .then(setAgents)
        .catch(err => console.error("Failed to fetch agents", err))
        .finally(() => setLoadingAgents(false));
    }
  }, [currentTenant?.id]);

  const handleSaveConsumption = async (mode: 'flexible' | 'custom', shares: Record<string, number>) => {
    if (!currentTenant) return;

    try {
      // 1. Update Company Allocation Mode
      const updatedPlanDetails = {
        ...currentTenant.planDetails,
        allocation_mode: mode
      };

      // We need to cast strictly to match the expected Plan structure if TS complains, 
      // but here we are passing it to the API which handles the merge.
      const updatedCompany = await api.updateCompany({
        id: currentTenant.id,
        planDetails: updatedPlanDetails as any
      });

      // 2. Update Agents Budget Shares
      // specific for Custom mode, but we save it anyway as it's configuration
      const updatePromises = Object.entries(shares).map(([agentId, share]) => {
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return Promise.resolve();

        return api.updateAgent(agentId, {
          brainConfig: {
            ...(agent.brainConfig || { systemPrompt: '', modelId: 'gpt-4o', temperature: 0.7 }),
            budget_share_pct: share
          }
        });
      });

      await Promise.all(updatePromises);

      // Refresh Context
      if (currentUser) {
        // A full refresh might be needed to update currentTenant in context
        window.location.reload(); // Simplest way to ensure context sync for now
      }

    } catch (error) {
      console.error("Failed to save consumption settings", error);
      throw error; // Let Child handle UI feedback
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-muted flex items-center justify-center">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Configurações</h1>
                <p className="text-sm text-muted-foreground">Gerencie as configurações da plataforma</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Tabs defaultValue="organization" className="space-y-6">
            <TabsList>
              <TabsTrigger value="organization" className="gap-2">
                <Building2 className="h-4 w-4" />
                Organização
              </TabsTrigger>
              <TabsTrigger value="consumption" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Consumo & Limites
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Shield className="h-4 w-4" />
                Segurança
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="h-4 w-4" />
                Notificações
              </TabsTrigger>
              {currentUser?.role === 'super_admin' && (
                <TabsTrigger value="platform" className="gap-2">
                  <Database className="h-4 w-4" />
                  Plataforma
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="organization" className="space-y-6">
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Informações da Organização</h3>

                <div className="grid gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Nome da Organização</Label>
                    <Input id="orgName" defaultValue={currentTenant?.name} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plan">Plano Atual</Label>
                    <Input id="plan" defaultValue={currentTenant?.planName || currentTenant?.plan} disabled className="capitalize" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tenantId">ID do Tenant</Label>
                    <Input id="tenantId" defaultValue={currentTenant?.id} disabled className="font-mono" />
                  </div>
                </div>

                <div className="mt-6">
                  <Button>Salvar Alterações</Button>
                </div>
              </div>

              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Aparência</h3>

                <div className="space-y-4 max-w-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Logo Personalizado</Label>
                      <p className="text-sm text-muted-foreground">Faça upload do logo da sua empresa</p>
                    </div>
                    <Button variant="outline">Upload</Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Cores Personalizadas</Label>
                      <p className="text-sm text-muted-foreground">Defina as cores da marca</p>
                    </div>
                    <Button variant="outline">Configurar</Button>
                  </div>
                </div>
              </div>

              {/* ISO 42001 Responsibility Section */}
              <div className="kpi-card border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold">Responsabilidade de IA (ISO 42001)</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Definição formal dos responsáveis pela governança de IA nesta organização.
                </p>

                <div className="grid gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="systemOwner">AI System Owner (Executivo)</Label>
                    <Input id="systemOwner" defaultValue="Carlos Silva (CEO)" disabled className="bg-background" />
                    <p className="text-xs text-muted-foreground">Responsável final pelas operações de IA.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="riskOwner">AI Risk Owner</Label>
                    <Input id="riskOwner" defaultValue="Ana Rodrigues (Compliance)" disabled className="bg-background" />
                    <p className="text-xs text-muted-foreground">Responsável pela gestão de riscos e incidentes.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="compliance">Compliance Responsible</Label>
                    <Input id="compliance" defaultValue="Ana Rodrigues" disabled className="bg-background" />
                  </div>
                </div>
                <div className="mt-4">
                  <Button variant="outline" size="sm">Gerenciar Designações</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="consumption" className="space-y-6">
              {currentTenant && (
                <ConsumptionSettings
                  tenantId={currentTenant.id}
                  planLimit={currentTenant.planDetails?.monthly_limit_brl || currentTenant.planPrices?.basePrice || 100} // Prioritize custom limit, then plan price, then default
                  allocationMode={currentTenant.planDetails?.allocation_mode || 'flexible'}
                  agents={agents}
                  onSave={handleSaveConsumption}
                />
              )}
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Autenticação</h3>

                <div className="space-y-4 max-w-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Autenticação de Dois Fatores</Label>
                      <p className="text-sm text-muted-foreground">Exigir 2FA para todos os usuários</p>
                    </div>
                    <Switch />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>SSO (Single Sign-On)</Label>
                      <p className="text-sm text-muted-foreground">Integração com provedor de identidade</p>
                    </div>
                    <Button variant="outline">Configurar</Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Tempo de Sessão</Label>
                      <p className="text-sm text-muted-foreground">Tempo máximo de inatividade</p>
                    </div>
                    <Input type="number" defaultValue="30" className="w-20" />
                  </div>
                </div>
              </div>

              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Logs de Acesso</h3>
                <p className="text-sm text-muted-foreground mb-4">Histórico de acessos à plataforma</p>
                <Button variant="outline">Ver Logs</Button>
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Preferências de Notificação</h3>

                <div className="space-y-4 max-w-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Alertas de Consumo</Label>
                      <p className="text-sm text-muted-foreground">Notificar quando atingir limites</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Novas Conversas</Label>
                      <p className="text-sm text-muted-foreground">Notificar sobre novas conversas</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Transferências</Label>
                      <p className="text-sm text-muted-foreground">Notificar quando receber transferência</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Relatórios Semanais</Label>
                      <p className="text-sm text-muted-foreground">Receber resumo por email</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </div>
            </TabsContent>

            {currentUser?.role === 'super_admin' && (
              <TabsContent value="platform" className="space-y-6">
                <div className="kpi-card border-l-4 border-l-warning bg-warning/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-warning" />
                    <h3 className="font-semibold">Área Restrita - Super Admin</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Configurações globais da plataforma Davos Nexus
                  </p>
                </div>

                <div className="kpi-card">
                  <h3 className="font-semibold mb-4">Configurações Globais (Plano Contratado)</h3>

                  <div className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label>Limite Padrão de Tokens</Label>
                      <Input type="number" defaultValue={currentTenant?.limits?.llmTokens || 5000000} />
                    </div>

                    <div className="space-y-2">
                      <Label>Limite Padrão de STT (minutos)</Label>
                      <Input type="number" defaultValue={currentTenant?.limits?.sttMinutes || 3000} />
                    </div>

                    <div className="space-y-2">
                      <Label>Limite Padrão de TTS (minutos)</Label>
                      <Input type="number" defaultValue={currentTenant?.limits?.ttsMinutes || 2000} />
                    </div>
                  </div>

                  <div className="mt-6">
                    <Button>Salvar Configurações</Button>
                  </div>
                </div>

                <div className="kpi-card">
                  <h3 className="font-semibold mb-4">Gerenciamento de Tenants</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Visualizar e gerenciar todos os clientes da plataforma
                  </p>
                  <Button variant="outline" onClick={handleViewTenants} disabled={loadingTenants}>
                    {loadingTenants ? 'Carregando...' : (showTenants ? 'Ocultar Tenants' : 'Ver Todos os Tenants')}
                  </Button>

                  {showTenants && (
                    <div className="mt-4 border rounded-md">
                      <div className="grid grid-cols-4 bg-muted p-2 font-medium text-sm">
                        <div>Nome</div>
                        <div>Slug</div>
                        <div>Plano</div>
                        <div>Status</div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {tenantsList.map((tenant) => (
                          <div key={tenant.id} className="grid grid-cols-4 p-2 text-sm border-t hover:bg-muted/50">
                            <div className="truncate font-medium">{tenant.name}</div>
                            <div className="truncate text-muted-foreground">{tenant.slug}</div>
                            <div>{tenant.planName || tenant.plan}</div>
                            <div>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${tenant.status === 'active' ? 'bg-green-100 text-green-700' :
                                tenant.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                {tenant.status}
                              </span>
                            </div>
                          </div>
                        ))}
                        {tenantsList.length === 0 && (
                          <div className="p-4 text-center text-muted-foreground text-sm">Nenhum tenant encontrado.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
