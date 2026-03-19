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
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  mockTenantPlans,
  mockTenantISOStatus,
  mockAuditLogs,
  mockConsumptionMetrics,
  mockPlanCatalog
} from '@/lib/mock-extended-data';
import { mockUsers, mockAgents } from '@/lib/mock-data';
import { Company, AuditLog, PlanCatalog } from '@/lib/types';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api'; // Import API
import { calculateISOStatus } from '@/lib/utils';
import { useEffect } from 'react';

// Decima Input Helper
function DecimalInput({ value, onChange, placeholder }: { value: number; onChange: (val: number) => void; placeholder?: string }) {
  const [localValue, setLocalValue] = useState<string>(value?.toString().replace('.', ',') || '');

  useEffect(() => {
    // Sync external changes (e.g. switching companies) only if value actually differs numerically
    const currentNumeric = parseFloat(localValue.replace(',', '.'));
    if (value !== currentNumeric && !(isNaN(currentNumeric) && value === 0)) {
      setLocalValue(value?.toString().replace('.', ',') || '');
    }
  }, [value, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits and single comma or dot
    if (/^[0-9]*[,.]?[0-9]*$/.test(raw)) {
      setLocalValue(raw);
      const numeric = parseFloat(raw.replace(',', '.'));
      if (!isNaN(numeric)) {
        onChange(numeric);
      } else if (raw === '') {
        onChange(0);
      }
    }
  };

  return <Input value={localValue} onChange={handleChange} placeholder={placeholder} inputMode="decimal" />;
}

export default function Companies() {
  const { openSlideOver, switchTenant } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]); // Init empty
  const [availablePlans, setAvailablePlans] = useState<PlanCatalog[]>([]); // Plans from DB
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [newCompany, setNewCompany] = useState<Partial<Company>>({
    name: '',
    slug: '',
    planId: '',
    plan: 'free',
    status: 'trial',
    limits: { llmTokens: 0, messages: 0, sttMinutes: 0, ttsMinutes: 0, agents: 0, users: 0 },
  });
  const [companyCosts, setCompanyCosts] = useState<import('@/lib/types').CompanyDavosCost[]>([]);

  // Fetch Real Companies and Plans
  useEffect(() => {
    const loadData = async () => {
      const [companiesData, plansData] = await Promise.all([
        api.getCompanies(),
        api.getPlans()
      ]);
      if (companiesData) setCompanies(companiesData);
      if (plansData) {
        setAvailablePlans(plansData);
        // Set default plan for new company form
        if (plansData.length > 0) {
          setNewCompany(prev => ({
            ...prev,
            planId: plansData[0].id,
            limits: plansData[0].defaultLimits
          }));
        }
      }
    };
    loadData();
  }, []);

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const getPlanBadge = (company: Company | undefined) => {
    if (!company) return null;
    const planName = company.planName || company.plan || 'Free';

    // Dynamic styling based on common plan names
    const lowerPlan = planName.toLowerCase();
    if (lowerPlan.includes('enterprise')) {
      return <Badge className="bg-accent">{planName}</Badge>;
    }
    if (lowerPlan.includes('pro') || lowerPlan.includes('flex')) {
      return <Badge variant="secondary">{planName}</Badge>;
    }
    return <Badge variant="outline">{planName}</Badge>;
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

  const getStats = (company: Company & { _count?: { agents: number; users: number; tokens: number } }) => {
    return {
      usersCount: company._count?.users || 0,
      agentsCount: company._count?.agents || 0,
      tokensCount: company._count?.tokens || 0
    };
  };

  const handleSaveCompany = async () => {
    try {
      if (editingCompany) {
        await api.updateCompany(editingCompany);

        // Save Davos Costs if in edit mode
        if (editingCompany && companyCosts.length > 0) {
          await Promise.all(companyCosts.map(cost =>
            api.updateDavosCost({
              tenantId: editingCompany.id,
              itemKey: cost.itemKey,
              itemLabel: cost.itemLabel,
              costValue: cost.costValue,
              isRecurring: cost.isRecurring
            })
          ));
        }

        toast.success('Empresa atualizada com sucesso');
      } else {
        const companyToCreate = {
          ...newCompany,
          // Ensure defaults
          planId: newCompany.planId || availablePlans[0]?.id,
          status: newCompany.status || 'trial',
          settings: {
            aiNoticeMessage: 'Esta conversa utiliza IA para auxiliar no atendimento.',
            retentionDays: 90,
            anonymizationEnabled: false,
          }
        };
        await api.createCompany(companyToCreate);
        toast.success('Empresa criada com sucesso');
      }

      // Reload data
      const data = await api.getCompanies();
      setCompanies(data);

      setDialogOpen(false);
      setEditingCompany(null);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar empresa');
    }
  };

  const handlePlanChange = (planId: string) => {
    const plan = availablePlans.find(p => p.id === planId);
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);

  const toggleStatus = async (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const newStatus = company.status === 'suspended' ? 'active' : 'suspended';

    try {
      // Optimistic update
      setCompanies(prev => prev.map(c =>
        c.id === companyId ? { ...c, status: newStatus as any } : c
      ));

      await api.updateCompany({ id: companyId, status: newStatus as any });
      toast.success(`Empresa ${newStatus === 'active' ? 'ativada' : 'suspensa'}`);
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Erro ao atualizar status');
      // Revert optimistic update
      setCompanies(prev => prev.map(c =>
        c.id === companyId ? { ...c, status: company.status } : c
      ));
    }
  };

  const confirmDelete = (company: Company) => {
    setCompanyToDelete(company);
    setDeleteConfirmation('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteCompany = async () => {
    if (!companyToDelete || deleteConfirmation.toLowerCase() !== 'excluir') return;

    try {
      await api.deleteCompany(companyToDelete.id);
      toast.success('Empresa excluída permanentemente');
      setCompanies(prev => prev.filter(c => c.id !== companyToDelete.id));
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Erro ao excluir empresa');
    }
  };

  const openEditDialog = (company: Company) => {
    setEditingCompany({ ...company });
    // Load costs for this company
    const loadCosts = async () => {
      const costs = await api.getDavosCosts(company.id);
      setCompanyCosts(costs);
    };
    loadCosts();
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingCompany(null);
    setNewCompany({
      name: '',
      slug: '',
      planId: availablePlans[0]?.id || '',
      plan: 'free',
      status: 'trial',
      limits: availablePlans[0]?.defaultLimits || {
        llmTokens: 0,
        messages: 0,
        sttMinutes: 0,
        ttsMinutes: 0,
        agents: 0,
        users: 0
      }
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
                      <DropdownMenuItem onClick={async () => {
                        await switchTenant(company.id);
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
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => confirmDelete(company)}
                        className="text-red-600 focus:text-red-700 focus:bg-red-50"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Excluir Empresa Definitivamente
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex gap-2 mb-4">
                  {getPlanBadge(company)}
                  {getStatusBadge(company.status)}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{getStats(company).usersCount}</p>
                    <p className="text-[10px] text-muted-foreground">Usuários</p>
                  </div>
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{getStats(company).agentsCount}</p>
                    <p className="text-[10px] text-muted-foreground">Agentes</p>
                  </div>
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">
                      {(getStats(company).tokensCount / 1000).toFixed(1)}k
                    </p>
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

        {/* Edit/New Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCompany ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
              <DialogDescription>
                Configure os dados básicos, plano de serviço e limites da empresa cliente.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="geral" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="geral">Geral</TabsTrigger>
                <TabsTrigger value="costs" disabled={!editingCompany}>Custos Davos</TabsTrigger>
              </TabsList>

              <TabsContent value="geral" className="space-y-4 py-4">
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
                        {availablePlans.map(plan => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} ({plan.type.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              </TabsContent>


              <TabsContent value="costs" className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                {[
                  {
                    title: "Infraestrutura Fixa (Mensal)",
                    items: [
                      { key: 'vps', label: 'Servidor Web/Domínio' },
                      { key: 'n8n', label: 'Servidor Workflow (Evolution/n8n)' },
                      { key: 'vps_db', label: 'Servidor Banco de Dados' },
                      { key: 'storage_egress', label: 'Armazenamento e Banda' },
                      { key: 'vector_db', label: 'Banco de Dados Vetorial (RAG)' },
                    ]
                  },
                  {
                    title: "Telefonia e Mensageria",
                    items: [
                      { key: 'phone_setup', label: 'Custo Aquisição Número (Setup Único)' },
                      { key: 'twilio_fixed', label: 'Manutenção Mensal Número' },
                      { key: 'vapi_fixed', label: 'Custos Fixos API Voz (Mensal)' },
                    ]
                  },
                  {
                    title: "Custos Variáveis (Motor de IA e APIs)",
                    items: [
                      { key: 'llm_internal_rate', label: 'Motor LLM (Por 1k Tokens)' },
                      { key: 'msg_whatsapp', label: 'Mensageria Oficial WhatsApp (Por Msg)' },
                      { key: 'voice_internal_rate', label: 'Comunicação de Voz (Por Minuto)' },
                      { key: 'twilio_variable', label: 'Outras APIs (Tradução/Transcrição STT/TTS)' },
                    ]
                  },
                  {
                    title: "Operação e Gestão",
                    items: [
                      { key: 'bpo_people', label: 'Custo de Pessoas / BPO (Mensal)' },
                    ]
                  }
                ].map(section => (
                  <div key={section.title} className="space-y-4 border border-border/50 p-5 rounded-lg bg-card shadow-sm">
                    <h4 className="text-sm font-semibold uppercase text-accent border-b border-border pb-3">
                      {section.title}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      {section.items.map(item => {
                        const cost = companyCosts.find(c => c.itemKey === item.key);
                        return (
                          <div key={item.key} className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground">{item.label}</Label>
                            <DecimalInput
                              placeholder="0,00"
                              value={cost?.costValue || 0}
                              onChange={(val) => {
                                setCompanyCosts(prev => {
                                  const existing = prev.find(p => p.itemKey === item.key);
                                  if (existing) {
                                    return prev.map(p => p.itemKey === item.key ? { ...p, costValue: val } : p);
                                  }
                                  return [...prev, {
                                    itemKey: item.key,
                                    itemLabel: item.label,
                                    costValue: val,
                                    isRecurring: !['phone_setup', 'llm_internal_rate', 'voice_internal_rate', 'msg_whatsapp', 'twilio_variable'].includes(item.key),
                                    tenantId: editingCompany?.id || '',
                                    id: '',
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                  }];
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button className="bg-accent hover:bg-accent/90" onClick={handleSaveCompany}>
                {editingCompany ? 'Salvar Alterações' : 'Criar Empresa'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md border-red-200">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Excluir Empresa Definitivamente?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <p>
                  Esta ação é <strong>irreversível</strong>. Todos os dados associados à empresa
                  <span className="font-bold text-foreground"> "{companyToDelete?.name}" </span>
                  serão excluídos para sempre, incluindo:
                </p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  <li>Métricas de consumo e custos</li>
                  <li>Histórico de conversas e mensagens</li>
                  <li>Agentes configurados</li>
                  <li>Usuários e permissões</li>
                  <li>Logs de auditoria e incidentes</li>
                </ul>
                <p className="mt-4 text-foreground">
                  Para confirmar, digite <strong>excluir</strong> no campo abaixo:
                </p>
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Digite excluir"
                className="border-red-200 focus-visible:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteCompany}
                disabled={deleteConfirmation.toLowerCase() !== 'excluir'}
              >
                Excluir Definitivamente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div >
    </MainLayout >
  );
}
