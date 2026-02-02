import { Settings as SettingsIcon, Building2, Shield, Bell, Palette, Globe, Database } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';

export default function Settings() {
  const { currentTenant, currentUser } = useApp();

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
                    <Input id="plan" defaultValue={currentTenant?.plan} disabled className="capitalize" />
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
                  <h3 className="font-semibold mb-4">Configurações Globais</h3>

                  <div className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label>Limite Padrão de Tokens</Label>
                      <Input type="number" defaultValue="5000000" />
                    </div>

                    <div className="space-y-2">
                      <Label>Limite Padrão de STT (minutos)</Label>
                      <Input type="number" defaultValue="3000" />
                    </div>

                    <div className="space-y-2">
                      <Label>Limite Padrão de TTS (minutos)</Label>
                      <Input type="number" defaultValue="2000" />
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
                  <Button variant="outline">Ver Todos os Tenants</Button>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
