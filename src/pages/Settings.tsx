import { Settings as SettingsIcon, Building2, Shield, Bell, Palette, Globe, Database, BarChart3, AlertCircle, Activity, Lock, Wallet } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';
import { ConsumptionSettings } from '@/components/consumption/ConsumptionSettings';
import { useState, useEffect } from 'react';
import { Agent, Company, User as UserType } from '@/lib/types';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';
import { PlanDetailsTab } from '@/components/settings/PlanDetailsTab';
import SystemStatus from '@/pages/admin/SystemStatus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Settings() {
  const { currentTenant, currentUser, maskingEnabled, toggleMasking } = useApp();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<UserType[]>([]);
  const [governance, setGovernance] = useState({
    ai_system_owner_id: currentTenant?.ai_system_owner_id || '',
    risk_owner_id: currentTenant?.risk_owner_id || '',
    compliance_officer_id: currentTenant?.compliance_officer_id || ''
  });

  const [sessionTimeout, setSessionTimeout] = useState(currentTenant?.settings?.session_timeout || 30);
  
  // Brand Preferences State
  const [brandColor, setBrandColor] = useState(currentTenant?.brand_color || '#ea580c'); // Default Signal Orange
  const [logoUrl, setLogoUrl] = useState(currentTenant?.logo_url || '');

  const [isSaving, setIsSaving] = useState(false);

  // Tenants Management State (Super Admin)
  const [showTenants, setShowTenants] = useState(false);
  const [tenantsList, setTenantsList] = useState<any[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  useEffect(() => {
    if (currentTenant?.id) {
      setLoadingAgents(true);
      Promise.all([
        api.getAgents(currentTenant.id),
        api.getCompanyUsers(currentTenant.id)
      ]).then(([agentsData, usersData]) => {
        setAgents(agentsData);
        setCompanyUsers(usersData);
      })
        .catch(err => console.error("Failed to fetch settings data", err))
        .finally(() => setLoadingAgents(false));

      setGovernance({
        ai_system_owner_id: currentTenant.ai_system_owner_id || '',
        risk_owner_id: currentTenant.risk_owner_id || '',
        compliance_officer_id: currentTenant.compliance_officer_id || ''
      });
      setSessionTimeout(currentTenant.settings?.session_timeout || 30);
      setBrandColor(currentTenant.brand_color || '#ea580c');
      setLogoUrl(currentTenant.logo_url || '');
    }
  }, [currentTenant?.id]);

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

  const handleSaveGovernance = async () => {
    if (!currentTenant) return;
    setIsSaving(true);
    try {
      await api.updateCompanyGovernance(currentTenant.id, governance);
      toast({ title: "Sucesso", description: "Configurações de governança atualizadas." });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar governança.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePrivacy = async () => {
    if (!currentTenant) return;
    setIsSaving(true);
    try {
      const updatedSettings = {
        ...currentTenant.settings,
        session_timeout: Number(sessionTimeout)
      };
      await api.updateCompanyPrivacy(currentTenant.id, updatedSettings);
      toast({ title: "Sucesso", description: "Privacidade e segurança atualizadas." });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar configurações.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!currentTenant) return;
    setIsSaving(true);
    try {
      await api.updateCompany({
        id: currentTenant.id,
        brand_color: brandColor,
        logo_url: logoUrl
      });
      // Force UI to pick up the change immediately
      currentTenant.brand_color = brandColor;
      currentTenant.logo_url = logoUrl;
      toast({ title: "Sucesso", description: "Preferências de marca salvas! A página será atualizada." });
      setTimeout(() => window.location.reload(), 1000); // give time to toast
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar preferências.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveConsumption = async (mode: 'flexible' | 'custom', shares: Record<string, number>) => {
    if (!currentTenant) return;

    try {
      const updatedPlanDetails = {
        ...(currentTenant.planDetails || {}),
        allocation_mode: mode
      };

      await api.updateCompany({
        id: currentTenant.id,
        planDetails: updatedPlanDetails as any
      });

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
      toast({ title: "Sucesso", description: "Configurações de consumo salvas." });
    } catch (error) {
      console.error("Failed to save consumption settings", error);
      toast({ title: "Erro", description: "Falha ao salvar consumo.", variant: "destructive" });
    }
  };

  const renderRolesSelect = (value: string, onChange: (val: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-background">
        <SelectValue placeholder="Selecione um responsável..." />
      </SelectTrigger>
      <SelectContent>
        {companyUsers.map(user => (
          <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-lg">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Configurações</h1>
                <p className="text-sm text-muted-foreground tracking-tight">Gerencie a identidade, finanças e segurança da sua organização</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Tabs defaultValue="organization" className="space-y-6">
            <TabsList className="bg-muted/50 p-1 border border-border">
              <TabsTrigger value="organization" className="gap-2 data-[state=active]:bg-background">
                <Building2 className="h-4 w-4" />
                Organização
              </TabsTrigger>
              <TabsTrigger value="financial" className="gap-2 data-[state=active]:bg-background">
                <Wallet className="h-4 w-4" />
                Financeiro & Consumo
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-background">
                <Lock className="h-4 w-4" />
                Segurança & Privacidade
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-2 data-[state=active]:bg-background">
                <Palette className="h-4 w-4" />
                Preferências
              </TabsTrigger>
              {currentUser?.role === 'super_admin' && (
                <TabsTrigger value="platform" className="gap-2 data-[state=active]:bg-background">
                  <Database className="h-4 w-4" />
                  Plataforma
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="organization" className="space-y-6 m-0 animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="kpi-card border border-border bg-card shadow-sm">
                <h3 className="font-semibold mb-4 text-lg">Informações da Organização</h3>
                <div className="grid gap-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgName">Nome da Organização</Label>
                      <Input id="orgName" defaultValue={currentTenant?.name} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="orgSlug">Slug (Identificador URL)</Label>
                      <Input id="orgSlug" defaultValue={currentTenant?.slug} disabled className="bg-muted/50 font-mono text-xs" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tenantId">ID do Tenant</Label>
                    <Input id="tenantId" defaultValue={currentTenant?.id} disabled className="font-mono text-xs bg-muted/50" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <Button size="sm">Atualizar Identidade</Button>
                </div>
              </div>

              <div className="kpi-card border border-border bg-card shadow-sm border-l-4 border-l-primary">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">Governança (ISO 42001)</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-6 max-w-2xl leading-relaxed">
                  Designação formal dos responsáveis pela conformidade e riscos de IA. Estas informações são utilizadas em relatórios de auditoria e logs de incidentes.
                </p>

                <div className="grid gap-6 max-w-2xl">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      AI System Owner
                      <Badge variant="outline" className="text-[9px] uppercase font-bold text-muted-foreground">Executivo</Badge>
                    </Label>
                    {renderRolesSelect(governance.ai_system_owner_id, (val) => setGovernance({ ...governance, ai_system_owner_id: val }))}
                    <p className="text-[11px] text-muted-foreground">Pessoa com autoridade final sobre o sistema de IA.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    <div className="space-y-2">
                      <Label>AI Risk Owner</Label>
                      {renderRolesSelect(governance.risk_owner_id, (val) => setGovernance({ ...governance, risk_owner_id: val }))}
                    </div>
                    <div className="space-y-2">
                      <Label>Compliance Officer</Label>
                      {renderRolesSelect(governance.compliance_officer_id, (val) => setGovernance({ ...governance, compliance_officer_id: val }))}
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex justify-end border-t border-border pt-4">
                  <Button size="sm" onClick={handleSaveGovernance} disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar Designações ISO"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-6 m-0 animate-in fade-in slide-in-from-left-2 duration-300">
              <PlanDetailsTab />
              <Separator />
              {currentTenant && (
                <div className="kpi-card border border-border bg-card shadow-sm">
                  <h3 className="font-semibold mb-6 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Controle de Orçamento por Agente
                  </h3>
                  <ConsumptionSettings
                    tenantId={currentTenant.id}
                    planLimit={(() => {
                      const details = currentTenant.planDetails;
                      const prices = currentTenant.planPrices;
                      if (details?.monthlyFeeCoversUsage) {
                        return prices?.basePrice || 100;
                      }
                      return details?.monthly_limit_brl || 500;
                    })()}
                    allocationMode={currentTenant.planDetails?.allocation_mode || 'flexible'}
                    agents={agents}
                    onSave={handleSaveConsumption}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="security" className="space-y-6 m-0 animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="kpi-card border border-border bg-card shadow-sm border-l-4 border-l-purple-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="font-semibold text-lg">Privacidade & Blindagem LGPD</h3>
                  </div>
                  <div className="flex items-center gap-3 bg-muted/50 px-3 py-1.5 rounded-full border border-border">
                    <Switch
                      checked={maskingEnabled}
                      onCheckedChange={toggleMasking}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {maskingEnabled ? 'Ativado' : 'Desativado'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
                  Quando ativado, oculta automaticamente dados sensíveis (CPF, E-mail, Telefone, Cartão) na interface do operador para garantir conformidade e segurança total com a LGPD.
                </p>

                <div className="bg-muted border border-border p-4 rounded-md text-xs text-muted-foreground flex gap-3">
                  <AlertCircle className="h-5 w-5 text-purple-500 shrink-0" />
                  <p>
                    <strong>Segurança de Dados:</strong> Esta configuração afeta apenas a camada de visualização (UI).
                    Todas as interações continuam sendo processadas e armazenadas de forma íntegra para fins de auditoria interna e forense.
                  </p>
                </div>
              </div>

              <div className="kpi-card border border-border bg-card shadow-sm">
                <h3 className="font-semibold mb-6">Políticas de Segurança</h3>
                <div className="space-y-6 max-w-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Tempo de Sessão</Label>
                      <p className="text-xs text-muted-foreground">Tempo máximo de inatividade antes do logout automático.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={sessionTimeout}
                        onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
                        className="w-20 text-center font-mono"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between opacity-50">
                    <div>
                      <Label className="text-base">Restrição de IP</Label>
                      <p className="text-xs text-muted-foreground italic">Disponível em breve no plano Enterprise.</p>
                    </div>
                    <Badge variant="secondary">EM BREVE</Badge>
                  </div>
                </div>
                <div className="mt-8 flex justify-end">
                  <Button size="sm" onClick={handleSavePrivacy} disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar Políticas"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preferences" className="space-y-6 m-0 animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="kpi-card border border-border bg-card shadow-sm">
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  Preferências de Interface
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl">
                  <div className="space-y-4 p-6 border border-border rounded-xl bg-muted/20 relative group">
                    <div className="absolute -top-3 left-6 px-2 bg-background border border-border rounded text-[10px] font-bold text-primary tracking-widest uppercase">Visual</div>
                    <div className="space-y-2">
                      <Label htmlFor="logoUrl" className="text-sm">Link da Logo (URL)</Label>
                      <p className="text-xs text-muted-foreground mb-4">Insira o endereço da imagem da logo para o tenant.</p>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                          {logoUrl ? (
                            <div className="w-16 h-16 border border-border flex items-center justify-center rounded-lg bg-background overflow-hidden p-2">
                              <img src={logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                            </div>
                          ) : (
                            <div className="w-16 h-16 border-2 border-dashed border-border flex items-center justify-center rounded-lg bg-background group-hover:border-primary/50 transition-colors">
                              <Building2 className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <Input 
                            id="logoUrl" 
                            placeholder="https://exemplo.com/logo.png" 
                            value={logoUrl} 
                            onChange={(e) => setLogoUrl(e.target.value)} 
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-6 border border-border rounded-xl bg-muted/20 relative group">
                    <div className="absolute -top-3 left-6 px-2 bg-background border border-border rounded text-[10px] font-bold text-primary tracking-widest uppercase">Cores</div>
                    <div>
                      <Label className="text-sm">Cor Primária</Label>
                      <p className="text-xs text-muted-foreground mb-4">Aplica-se a faturas, barra lateral, botões, links e destaques.</p>
                      
                      <div className="flex items-center gap-4">
                        <Input
                          type="color"
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          className="w-16 h-12 p-1 cursor-pointer"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-mono">{brandColor}</span>
                          <span className="text-xs text-muted-foreground">HEX Code</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-6">
                        <span className="text-xs text-muted-foreground mr-2">Sugestões:</span>
                        {[
                          { color: '#2563eb', label: 'Blue' },
                          { color: '#059669', label: 'Emerald' },
                          { color: '#ea580c', label: 'Signal Orange' },
                          { color: '#1e3a8a', label: 'Azul Marinho' },
                          { color: '#1e293b', label: 'Grafite' },
                          { color: '#14532d', label: 'Verde Profundo' },
                          { color: '#4c1d95', label: 'Roxo Escuro' },
                          { color: '#451a03', label: 'Castanho Escuro' },
                          { color: '#991b1b', label: 'Vermelho Escuro' },
                          { color: '#0a0a0a', label: 'Preto' },
                          { color: '#94a3b8', label: 'Prateado' }
                        ].map(c => (
                          <button
                            key={c.color}
                            onClick={() => setBrandColor(c.color)}
                            title={c.label}
                            className={`w-6 h-6 rounded-full shadow-sm border-2 transition-all hover:scale-110 active:scale-95 ${brandColor === c.color ? 'border-primary' : 'border-transparent'}`}
                            style={{ backgroundColor: c.color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex justify-between items-center border-t border-border pt-6">
                  <Button variant="ghost" className="text-xs text-muted-foreground underline" onClick={() => { setBrandColor('#ea580c'); setLogoUrl(''); }}>Restaurar padrões de fábrica</Button>
                  <Button size="sm" onClick={handleSavePreferences} disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar Preferências"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {currentUser?.role === 'super_admin' && (
              <TabsContent value="platform" className="space-y-6 m-0 animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="kpi-card border border-border bg-warning/5 border-l-4 border-l-warning">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-warning" />
                    <h3 className="font-semibold text-warning">Área do Administrador Davos</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Configurações globais e gestão técnica de todos os tenants da plataforma Davos Nexus.
                  </p>
                </div>

                <div className="kpi-card border border-border bg-card shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold text-lg">Cotas Globais do Plano</h3>
                    <Badge variant="outline" className="border-primary text-primary font-mono text-[10px]">
                      SSOT: {currentTenant?.planName}
                    </Badge>
                  </div>
                  <div className="grid gap-4 max-w-md opacity-80">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Limite de Tokens</Label>
                      <Input type="number" value={currentTenant?.limits?.llmTokens || 0} disabled className="bg-muted/50 font-mono" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">STT (minutos)</Label>
                        <Input type="number" value={currentTenant?.limits?.sttMinutes || 0} disabled className="bg-muted/50 font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">TTS (minutos)</Label>
                        <Input type="number" value={currentTenant?.limits?.ttsMinutes || 0} disabled className="bg-muted/50 font-mono" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="kpi-card border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="font-semibold text-lg">Ecossistema de Tenants</h3>
                      <p className="text-xs text-muted-foreground">Visão holística de todos os clientes ativos</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleViewTenants} disabled={loadingTenants} className="gap-2">
                      <Database className="h-4 w-4" />
                      {loadingTenants ? 'Buscando...' : (showTenants ? 'Ocultar Relatório' : 'Analisar Todos os Tenants')}
                    </Button>
                  </div>

                  {showTenants && (
                    <div className="mt-4 border border-border rounded-xl overflow-hidden bg-muted/10">
                      <div className="grid grid-cols-4 bg-muted/80 p-3 font-bold text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <div>Organização</div>
                        <div>Identificador</div>
                        <div>Plano Atual</div>
                        <div className="text-right">Status do Tenant</div>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-border">
                        {tenantsList.map((tenant) => (
                          <div key={tenant.id} className="grid grid-cols-4 p-3 text-xs hover:bg-background transition-colors items-center">
                            <div className="truncate font-semibold">{tenant.name}</div>
                            <div className="truncate font-mono text-muted-foreground">/{tenant.slug}</div>
                            <div>
                              <Badge variant="outline" className="text-[9px] h-4">{tenant.planName || tenant.plan}</Badge>
                            </div>
                            <div className="text-right">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-vibrant ${tenant.status === 'active' ? 'bg-success/10 text-success border border-success/20' :
                                  tenant.status === 'suspended' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                                    'bg-yellow-100 text-yellow-700'
                                }`}>
                                {tenant.status}
                              </span>
                            </div>
                          </div>
                        ))}
                        {tenantsList.length === 0 && (
                          <div className="p-8 text-center text-muted-foreground text-sm italic">Nenhum tenant registrado no ecossistema.</div>
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

