import { useState } from 'react';
import { 
  Building2, Plus, Search, MoreVertical, Users, Bot, 
  CreditCard, AlertCircle, Check, X, Pencil 
} from 'lucide-react';
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
import { mockCompanies } from '@/lib/mock-extended-data';
import { Company } from '@/lib/types';
import { useApp } from '@/contexts/AppContext';

const PLAN_LIMITS = {
  free: { llmTokens: 100000, messages: 5000, sttMinutes: 100, ttsMinutes: 50, agents: 2, users: 5 },
  pro: { llmTokens: 2000000, messages: 50000, sttMinutes: 1500, ttsMinutes: 1000, agents: 5, users: 20 },
  enterprise: { llmTokens: 5000000, messages: 100000, sttMinutes: 3000, ttsMinutes: 2000, agents: 10, users: 50 },
};

export default function Companies() {
  const { openSlideOver } = useApp();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState(mockCompanies);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [newCompany, setNewCompany] = useState<Partial<Company>>({
    name: '',
    slug: '',
    plan: 'free',
    status: 'trial',
    limits: PLAN_LIMITS.free,
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

  const handleSaveCompany = () => {
    if (editingCompany) {
      setCompanies(prev => prev.map(c => c.id === editingCompany.id ? editingCompany : c));
      toast.success('Empresa atualizada com sucesso');
    } else {
      const company: Company = {
        id: `tenant-${Date.now()}`,
        name: newCompany.name || '',
        slug: newCompany.slug || '',
        plan: newCompany.plan as 'free' | 'pro' | 'enterprise',
        status: newCompany.status as 'active' | 'suspended' | 'trial',
        createdAt: new Date(),
        limits: newCompany.limits || PLAN_LIMITS.free,
        settings: {
          aiNoticeMessage: 'Esta conversa utiliza IA para auxiliar no atendimento.',
          retentionDays: 90,
          anonymizationEnabled: false,
        },
      };
      setCompanies(prev => [...prev, company]);
      toast.success('Empresa criada com sucesso');
    }
    setDialogOpen(false);
    setEditingCompany(null);
    setNewCompany({ name: '', slug: '', plan: 'free', status: 'trial', limits: PLAN_LIMITS.free });
  };

  const handlePlanChange = (plan: 'free' | 'pro' | 'enterprise') => {
    const limits = PLAN_LIMITS[plan];
    if (editingCompany) {
      setEditingCompany({ ...editingCompany, plan, limits });
    } else {
      setNewCompany({ ...newCompany, plan, limits });
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
    setNewCompany({ name: '', slug: '', plan: 'free', status: 'trial', limits: PLAN_LIMITS.free });
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
                    <p className="text-lg font-bold">{company.limits.users}</p>
                    <p className="text-[10px] text-muted-foreground">Usuários</p>
                  </div>
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{company.limits.agents}</p>
                    <p className="text-[10px] text-muted-foreground">Agentes</p>
                  </div>
                  <div className="bg-muted p-2">
                    <p className="text-lg font-bold">{(company.limits.llmTokens / 1000000).toFixed(1)}M</p>
                    <p className="text-[10px] text-muted-foreground">Tokens</p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Criada em {company.createdAt.toLocaleDateString('pt-BR')}
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
                  <Label>Plano</Label>
                  <Select 
                    value={currentCompany.plan} 
                    onValueChange={(v) => handlePlanChange(v as 'free' | 'pro' | 'enterprise')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
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
