import { useState } from 'react';
import {
  Building2, Plus, Search, MoreVertical, Users, Bot,
  CreditCard, AlertCircle, Check, X, Pencil, LogIn
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  mockCompanies,
  mockTenantPlans,
  mockTenantISOStatus,
  mockAuditLogs,
  mockConsumptionMetrics,
  mockPlanCatalog
} from '@/lib/mock-extended-data';
import { mockUsers, mockAgents } from '@/lib/mock-data';
import { Company, AuditLog, PlanCatalog } from '@/lib/types';
import { useApp } from '@/contexts/AppContext';
import { getTenantAggregatedStats, calculateISOStatus } from '@/lib/consumption-logic';

export default function Companies() {
  const { openSlideOver, switchTenant } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState(mockCompanies);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [newCompany, setNewCompany] = useState<Partial<Company>>({
    name: '',
    slug: '',
    planId: mockPlanCatalog[0].id,
    plan: 'free',
    status: 'trial',
    limits: mockPlanCatalog[0].defaultLimits,
  });

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'enterprise':
        return <Badge className="bg-accent">Enterprise</Badge>;
      case 'pro':
        return <Badge variant="secondary">Pro</Badge>;
      default:
        return <Badge variant="outline">Free</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600">Ativo</Badge>;
      case 'suspended':
        return <Badge variant="destructive">Suspenso</Badge>;
      default:
        return <Badge variant="outline">Trial</Badge>;
    }
  };

  const getISOBadge = (company: Company) => {
    const status = calculateISOStatus(company);
    switch (status) {
      case 'conform':
        return (
          <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200">
            <Check className="h-3 w-3 mr-1" />
            ISO 42001: Definido
          </Badge>
        );
      case 'critical':
        return (
          <Badge variant="outline" className="text-[10px] h-5 bg-red-50 text-red-700 border-red-200">
            <X className="h-3 w-3 mr-1" />
            Não Conforme
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            ISO: Pendente
          </Badge>
        );
    }
  };

  const getStats = (companyId: string) => {
    return getTenantAggregatedStats(companyId, mockConsumptionMetrics, mockAgents, mockUsers);
  };

  const handleSaveCompany = () => {
    if (editingCompany) {
      // Audit Log for changes
      const audit: AuditLog = {
        id: `audit-${Date.now()}`,
        timestamp: new Date(),
        tenantId: editingCompany.id,
        actorId: 'user-1',
        actorName: 'Super Admin',
        action: 'tenant.update',
        targetType: 'tenant',
        targetId: editingCompany.id,
        before: mockCompanies.find(c => c.id === editingCompany.id),
        after: editingCompany,
        details: `Alteração técnica nos dados da empresa ${editingCompany.name}`,
      };

      console.log('Audit generated:', audit);
      setCompanies(prev => prev.map(c => c.id === editingCompany.id ? editingCompany : c));
      toast.success('Empresa atualizada (Gera log de auditoria)');
    } else {
      const company: Company = {
        id: `tenant-${Date.now()}`,
        name: newCompany.name || '',
        slug: newCompany.slug || '',
        planId: 'plan-free',
        plan: newCompany.plan as 'free' | 'pro' | 'enterprise',
        status: newCompany.status as 'active' | 'suspended' | 'trial',
        createdAt: new Date(),
        limits: newCompany.limits || mockPlanCatalog[0].defaultLimits,
        privacySettings: {
          tenantId: `tenant-${Date.now()}`,
          aiDisclosureMessage: 'Esta conversa utiliza IA para auxiliar no atendimento.',
          retentionDays: 90,
          anonymizationEnabled: false,
        },
        settings: {
          aiNoticeMessage: 'Esta conversa utiliza IA para auxiliar no atendimento.',
          retentionDays: 90,
          anonymizationEnabled: false,
        },
      };
      setCompanies(prev => [...prev, company]);
      toast.success('Empresa criada com Identificador Único');
    }
    setDialogOpen(false);
    setEditingCompany(null);
  };

  const handlePlanChange = (planId: string) => {
    const plan = mockPlanCatalog.find(p => p.id === planId);
    if (!plan) return;

    const limits = plan.defaultLimits;
    // Map catalog type to legacy plan field for compatibility
    const planType: 'free' | 'pro' | 'enterprise' =
      plan.id.includes('free') ? 'free' :
        plan.id.includes('pro') ? 'pro' : 'enterprise';

    if (editingCompany) {
      setEditingCompany({ ...editingCompany, planId, plan: planType, limits });
    } else {
      setNewCompany({ ...newCompany, planId, plan: planType, limits });
    }
  };

  const toggleStatus = (companyId: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id === companyId) {
        const newStatus = c.status === 'suspended' ? 'active' : 'suspended';
        toast.success(`Empresa ${newStatus === 'active' ? 'ativada' : 'suspensa'}`);
        return { ...c, status: newStatus };
      }
      return c;
    }));
  };

  const openEditDialog = (company: Company) => {
    setEditingCompany({ ...company });
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingCompany(null);
    setNewCompany({
      name: '',
      slug: '',
      planId: mockPlanCatalog[0].id,
      plan: 'free',
      status: 'trial',
      limits: mockPlanCatalog[0].defaultLimits
    });
    setDialogOpen(true);
  };

  const currentCompany = editingCompany || newCompany;

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Empresas</h1>
                  <p className="text-sm text-muted-foreground">Gerencie os clientes da plataforma</p>
                </div>
              </div>
              <Button className="bg-accent hover:bg-accent/90" onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Empresa
              </Button>
            </div>

            <div className="mt-4 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Companies Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCompanies.map((company) => (
              <div key={company.id} className="kpi-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-accent/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{company.name}</h3>
                      <p className="text-xs text-muted-foreground">/{company.slug}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        switchTenant(company.id);
                        toast.success(`Acessando ambiente: ${company.name}`);
                        navigate('/');
                      }}>
                        <LogIn className="h-4 w-4 mr-2" />
                        Acessar Ambiente
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditDialog(company)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar Empresa
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openSlideOver('company-details', company)}>
                        <Building2 className="h-4 w-4 mr-2" />
                        Ver Detalhes
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => toggleStatus(company.id)}
                        className={company.status === 'suspended' ? 'text-green-600' : 'text-destructive'}
                      >
                        {company.status === 'suspended' ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Reativar Empresa
                          </>
                        ) : (
                          <>
                            <X className="h-4 w-4 mr-2" />
                            Suspender Empresa
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex gap-2 mb-4">
                  {getPlanBadge(company.plan)}
                  {getStatusBadge(company.status)}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{getStats(company.id).usersCount}</p>
                    <p className="text-[10px] text-muted-foreground">Usuários</p>
                  </div>
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{getStats(company.id).agentsCount}</p>
                    <p className="text-[10px] text-muted-foreground">Agentes</p>
                  </div>
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{(getStats(company.id).tokensCount / 1000000).toFixed(1)}M</p>
                    <p className="text-[10px] text-muted-foreground">Tokens AI</p>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground text-center mb-3 opacity-60 italic">
                  * Valores agregados dinamicamente via consumption-event logs.
                </p>

                {/* ISO Compliance Status */}
                <div className="flex items-center justify-between pt-2 border-t border-border mb-2">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase opacity-70">Privacidade (LGPD)</span>
                  <Badge variant="outline" className="text-[10px] h-5 border-blue-200 text-blue-700 bg-blue-50">
                    {company.privacySettings?.retentionDays || 90} dias
                  </Badge>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase opacity-70">Governança AI</span>
                  {getISOBadge(company)}
                </div>

                <div className="text-[10px] text-muted-foreground mt-4 pt-2 border-t border-border border-dashed">
                  UUID: <span className="font-mono">{company.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCompany ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    value={currentCompany.name || ''}
                    onChange={(e) => editingCompany
                      ? setEditingCompany({ ...editingCompany, name: e.target.value })
                      : setNewCompany({ ...newCompany, name: e.target.value })
                    }
                    placeholder="Ex: Banco Digital Alpha"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={currentCompany.slug || ''}
                    onChange={(e) => editingCompany
                      ? setEditingCompany({ ...editingCompany, slug: e.target.value })
                      : setNewCompany({ ...newCompany, slug: e.target.value })
                    }
                    placeholder="banco-digital-alpha"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plano de Serviço (Obrigatório)</Label>
                  <Select
                    value={currentCompany.planId}
                    onValueChange={(v) => handlePlanChange(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um plano..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mockPlanCatalog.map(plan => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} ({plan.type.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground italic">
                    * Os limites técnicos serão preenchidos automaticamente com base no catálogo.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={currentCompany.status}
                    onValueChange={(v) => editingCompany
                      ? setEditingCompany({ ...editingCompany, status: v as 'active' | 'suspended' | 'trial' })
                      : setNewCompany({ ...newCompany, status: v as 'active' | 'suspended' | 'trial' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Limites do Plano</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted p-3">
                    <p className="text-sm font-medium">{((currentCompany.limits?.llmTokens || 0) / 1000000).toFixed(1)}M</p>
                    <p className="text-xs text-muted-foreground">Tokens LLM</p>
                  </div>
                  <div className="bg-muted p-3">
                    <p className="text-sm font-medium">{((currentCompany.limits?.messages || 0) / 1000).toFixed(0)}k</p>
                    <p className="text-xs text-muted-foreground">Mensagens</p>
                  </div>
                  <div className="bg-muted p-3">
                    <p className="text-sm font-medium">{currentCompany.limits?.sttMinutes || 0}</p>
                    <p className="text-xs text-muted-foreground">Min STT</p>
                  </div>
                  <div className="bg-muted p-3">
                    <p className="text-sm font-medium">{currentCompany.limits?.ttsMinutes || 0}</p>
                    <p className="text-xs text-muted-foreground">Min TTS</p>
                  </div>
                  <div className="bg-muted p-3">
                    <p className="text-sm font-medium">{currentCompany.limits?.agents || 0}</p>
                    <p className="text-xs text-muted-foreground">Agentes</p>
                  </div>
                  <div className="bg-muted p-3">
                    <p className="text-sm font-medium">{currentCompany.limits?.users || 0}</p>
                    <p className="text-xs text-muted-foreground">Usuários</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button className="bg-accent hover:bg-accent/90" onClick={handleSaveCompany}>
                  {editingCompany ? 'Salvar Alterações' : 'Criar Empresa'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
