import { useMemo, useState, useEffect } from 'react';
import { Shield, Plus, Search, MoreVertical, Users, Settings as SettingsIcon, LayoutTemplate, CheckCircle2, CalendarClock, UserRound, ToggleLeft } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { getAssignablePermissionModules, getDefaultPermissionsForRole, PermissionModule } from '@/lib/permissions';
import { buildProfileRecord, EditableProfileForm, ManagedProfile, togglePermissionIds, validateProfileForm } from '@/lib/profile-management';

import { api } from '@/services/api';

const SECTION_LABELS: Record<string, { title: string; description: string }> = {
  principal: {
    title: 'Principal',
    description: 'Permissões das telas operacionais do menu principal.',
  },
  governanca: {
    title: 'Governança',
    description: 'Permissões de CRM, observabilidade, qualidade e IA.',
  },
  admin: {
    title: 'Administração',
    description: 'Permissões administrativas do tenant.',
  },
};

const buildSystemProfiles = (): ManagedProfile[] => [
  {
    id: 'tenant-admin',
    name: 'Administrador',
    description: 'Acesso administrativo completo às telas e ações do tenant.',
    usersCount: 0,
    permissions: getDefaultPermissionsForRole('tenant_admin'),
    isSystem: true,
    systemKey: 'tenant_admin',
    tenantId: null,
    status: 'active',
    createdAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    createdBy: 'Sistema',
    updatedBy: 'Sistema',
  },
  {
    id: 'operator',
    name: 'Operador',
    description: 'Operação diária de conversas, contatos e campanhas.',
    usersCount: 0,
    permissions: getDefaultPermissionsForRole('operator'),
    isSystem: true,
    systemKey: 'operator',
    tenantId: null,
    status: 'active',
    createdAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    createdBy: 'Sistema',
    updatedBy: 'Sistema',
  },
  {
    id: 'viewer',
    name: 'Visualizador',
    description: 'Acesso somente leitura às telas permitidas.',
    usersCount: 0,
    permissions: getDefaultPermissionsForRole('viewer'),
    isSystem: true,
    systemKey: 'viewer',
    tenantId: null,
    status: 'active',
    createdAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    createdBy: 'Sistema',
    updatedBy: 'Sistema',
  },
];

export default function Profiles() {
  const { currentTenant, currentUser, hasPermission } = useApp();
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<ManagedProfile[]>(buildSystemProfiles());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ManagedProfile | null>(null);
  const [isPersistedProfilesEnabled, setIsPersistedProfilesEnabled] = useState(false);
  const [profileUsersOpen, setProfileUsersOpen] = useState(false);
  const [selectedProfileUsers, setSelectedProfileUsers] = useState<{ profile: ManagedProfile | null; users: any[] }>({ profile: null, users: [] });
  const [workingProfile, setWorkingProfile] = useState<EditableProfileForm>({
    name: '',
    description: '',
    permissions: [],
    status: 'active',
  });
  const [permissionSearch, setPermissionSearch] = useState('');
  const [formErrors, setFormErrors] = useState<Partial<Record<'name' | 'description' | 'permissions' | 'status', string>>>({});
  const assignableModules = useMemo(() => getAssignablePermissionModules(false), []);
  const groupedModules = useMemo(() => assignableModules.reduce((acc, module) => {
    if (!acc[module.section]) acc[module.section] = [];
    acc[module.section].push(module);
    return acc;
  }, {} as Record<string, PermissionModule[]>), [assignableModules]);

  useEffect(() => {
    async function loadProfiles() {
      if (!currentTenant) return;
      try {
        const persistedProfiles = await api.getProfiles(currentTenant.id);
        setProfiles(persistedProfiles);
        setIsPersistedProfilesEnabled(true);
      } catch (e) {
        console.error("Error loading persisted profiles, using fallback", e);
        setIsPersistedProfilesEnabled(false);
        const users = await api.getUsers(currentTenant.id);
        const adminCount = users.filter((u: any) => u.role === 'tenant_admin').length;
        const operatorCount = users.filter((u: any) => u.role === 'operator').length;
        const viewerCount = users.filter((u: any) => u.role === 'viewer').length;
        setProfiles(buildSystemProfiles().map((p) => {
          if (p.id === 'tenant-admin') return { ...p, usersCount: adminCount };
          if (p.id === 'operator') return { ...p, usersCount: operatorCount };
          if (p.id === 'viewer') return { ...p, usersCount: viewerCount };
          return p;
        }));
      }
    }
    loadProfiles();
  }, [currentTenant]);

  const filteredProfiles = profiles.filter(p =>
    (p.isSystem || p.tenantId === currentTenant?.id || p.tenantId === null) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredGroupedModules = useMemo(() => {
    const normalizedSearch = permissionSearch.trim().toLowerCase();
    if (!normalizedSearch) return groupedModules;

    return Object.entries(groupedModules).reduce((acc, [section, modules]) => {
      const visibleModules = modules.filter((module) =>
        module.title.toLowerCase().includes(normalizedSearch) ||
        module.description.toLowerCase().includes(normalizedSearch) ||
        module.permissions.some((permission) =>
          permission.name.toLowerCase().includes(normalizedSearch) ||
          permission.description.toLowerCase().includes(normalizedSearch)
        )
      );

      if (visibleModules.length > 0) acc[section] = visibleModules;
      return acc;
    }, {} as Record<string, PermissionModule[]>);
  }, [groupedModules, permissionSearch]);

  const getProfileSaveErrorMessage = (error: any) => {
    const rawMessage = String(error?.message || '');
    const isRlsViolation = error?.code === '42501' || rawMessage.includes('row-level security policy');

    if (isRlsViolation && editingProfile?.isSystem) {
      return 'Este perfil é de sistema e não pode ser alterado pelo seu usuário atual. Use um super admin ou crie um perfil customizado para o seu tenant.';
    }

    if (isRlsViolation) {
      return 'Seu usuário não tem permissão para salvar este perfil no banco de dados. Verifique se seu acesso está corretamente vinculado ao tenant e ao papel administrativo.';
    }

    if (rawMessage.includes('duplicate key')) {
      return 'Já existe um perfil com esse nome neste tenant. Escolha um nome diferente.';
    }

    return rawMessage || 'Erro ao salvar perfil.';
  };

  const resetWorkingState = () => {
    setEditingProfile(null);
    setWorkingProfile({
      name: '',
      description: '',
      permissions: [],
      status: 'active',
    });
    setFormErrors({});
    setPermissionSearch('');
  };

  const handleRequestSaveProfile = () => {
    const validation = validateProfileForm(workingProfile, profiles, editingProfile?.id);
    setFormErrors(validation.errors);
    if (!validation.valid) {
      toast.error('Revise os campos obrigatorios do perfil.');
      return;
    }
    setConfirmSaveOpen(true);
  };

  const handleConfirmSaveProfile = async () => {
    const actorName = currentUser?.name || 'Sistema';
    const result = buildProfileRecord({
      form: workingProfile,
      existingProfiles: profiles,
      actorName,
      tenantId: currentTenant?.id || null,
      editingProfile,
    });

    setFormErrors(result.validation.errors);
    if (!result.profile) {
      toast.error('Nao foi possivel salvar o perfil. Revise os dados informados.');
      return;
    }

    try {
      if (isPersistedProfilesEnabled) {
        const savedProfile = await api.saveProfile(result.profile, currentUser?.id || null);
        if (editingProfile) {
          setProfiles((prev) => prev.map((profile) => (profile.id === savedProfile.id ? savedProfile : profile)));
          toast.success('Perfil atualizado com sucesso.');
        } else {
          setProfiles((prev) => [...prev, savedProfile]);
          toast.success('Perfil criado com sucesso.');
        }
      } else {
        if (editingProfile) {
          setProfiles((prev) => prev.map((profile) => (profile.id === result.profile!.id ? result.profile! : profile)));
          toast.success('Perfil atualizado localmente. Aplique a migration para persistir no banco.');
        } else {
          setProfiles((prev) => [...prev, result.profile!]);
          toast.success('Perfil criado localmente. Aplique a migration para persistir no banco.');
        }
      }

      setConfirmSaveOpen(false);
      setDialogOpen(false);
      resetWorkingState();
    } catch (saveError: any) {
      console.error('Error saving profile:', saveError);
      toast.error(getProfileSaveErrorMessage(saveError));
    }
  };

  const openEditDialog = (profile: ManagedProfile) => {
    setEditingProfile({ ...profile });
    setWorkingProfile({
      name: profile.name,
      description: profile.description,
      permissions: [...profile.permissions],
      status: profile.status,
    });
    setFormErrors({});
    setPermissionSearch('');
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    resetWorkingState();
    setDialogOpen(true);
  };

  const setWorkingPermissions = (permissions: string[]) => {
    setWorkingProfile((prev) => ({ ...prev, permissions }));
    setFormErrors((prev) => ({ ...prev, permissions: undefined }));
  };

  const currentPermissions = workingProfile.permissions;
  const currentPermissionSet = new Set(currentPermissions);
  const totalAvailablePermissions = assignableModules.reduce((sum, module) => sum + module.permissions.length, 0);
  const enabledModulesCount = assignableModules.filter((module) =>
    currentPermissions.includes(`${module.id}.view`)
  ).length;

  const togglePermission = (module: PermissionModule, permissionId: string) => {
    const viewPermissionId = `${module.id}.view`;
    const isSelected = currentPermissionSet.has(permissionId);

    if (permissionId === viewPermissionId) {
      const nextPermissions = isSelected
        ? currentPermissions.filter((id) => !module.permissions.some((permission) => permission.id === id))
        : Array.from(new Set([...currentPermissions, viewPermissionId]));
      setWorkingPermissions(nextPermissions);
      return;
    }

    const nextPermissions = isSelected
      ? currentPermissions.filter((id) => id !== permissionId)
      : Array.from(new Set([...currentPermissions, viewPermissionId, permissionId]));
    setWorkingPermissions(nextPermissions);
  };

  const getModuleSelectionCount = (module: PermissionModule) =>
    module.permissions.filter((permission) => currentPermissionSet.has(permission.id)).length;

  const handleToggleSectionPermissions = (modules: PermissionModule[], enabled: boolean) => {
    const permissionIds = modules.flatMap((module) => module.permissions.map((permission) => permission.id));
    setWorkingPermissions(togglePermissionIds(currentPermissions, permissionIds, enabled));
  };

  const handleToggleModulePermissions = (module: PermissionModule, enabled: boolean) => {
    const permissionIds = module.permissions.map((permission) => permission.id);
    setWorkingPermissions(togglePermissionIds(currentPermissions, permissionIds, enabled));
  };

  const handleOpenProfileUsers = async (profile: ManagedProfile) => {
    try {
      const users = isPersistedProfilesEnabled ? await api.getUsersByProfile(profile.id) : [];
      setSelectedProfileUsers({ profile, users });
      setProfileUsersOpen(true);
    } catch (error: any) {
      console.error('Error loading profile users:', error);
      toast.error(error?.message || 'Erro ao carregar usuários vinculados ao perfil.');
    }
  };

  const handleDeleteProfile = async (profile: ManagedProfile) => {
    if (!isPersistedProfilesEnabled) {
      setProfiles((prev) => prev.filter((item) => item.id !== profile.id));
      toast.success('Perfil removido localmente.');
      return;
    }

    try {
      await api.deleteProfile(profile.id);
      setProfiles((prev) => prev.filter((item) => item.id !== profile.id));
      toast.success('Perfil excluído com sucesso.');
    } catch (error: any) {
      console.error('Error deleting profile:', error);
      toast.error(error?.message || 'Erro ao excluir perfil.');
    }
  };

  const currentMetadata = editingProfile
    ? editingProfile
    : {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: currentUser?.name || 'Sistema',
        updatedBy: currentUser?.name || 'Sistema',
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
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Perfis de Acesso</h1>
                  <p className="text-sm text-muted-foreground">Gerencie módulos, telas e ações específicas do sistema</p>
                </div>
              </div>
              {hasPermission('profiles.create') && (
                <Button className="bg-accent hover:bg-accent/90" onClick={openNewDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Perfil
                </Button>
              )}
            </div>

            {/* Search */}
            <div className="mt-4 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar perfis..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Módulos disponíveis</div>
              <div className="mt-2 text-3xl font-black">{assignableModules.length}</div>
              <div className="mt-1 text-sm text-muted-foreground">Todas as telas permissionáveis do tenant</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Perfis visíveis</div>
              <div className="mt-2 text-3xl font-black">{filteredProfiles.length}</div>
              <div className="mt-1 text-sm text-muted-foreground">Perfis de sistema e customizados disponíveis</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Permissões por perfil</div>
              <div className="mt-2 text-3xl font-black">{totalAvailablePermissions}</div>
              <div className="mt-1 text-sm text-muted-foreground">Ações possíveis para revisão manual</div>
            </div>
          </div>

          {/* Profiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProfiles.map((profile) => (
              <div key={profile.id} className="kpi-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{profile.name}</h3>
                      {profile.isSystem && (
                        <Badge variant="secondary" className="text-xs">Sistema</Badge>
                      )}
                      {!profile.isSystem && profile.tenantId === currentTenant?.id && (
                        <Badge variant="outline" className="text-xs border-primary/20 text-primary">Customizado</Badge>
                      )}
                      <Badge variant={profile.status === 'active' ? 'default' : 'outline'} className={cn('text-xs mt-1', profile.status === 'active' ? 'bg-emerald-500 hover:bg-emerald-500/90' : '')}>
                        {profile.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {hasPermission('profiles.edit') && (
                        <DropdownMenuItem onClick={() => openEditDialog(profile)}>
                          <SettingsIcon className="h-4 w-4 mr-2" />
                          Editar Perfil
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleOpenProfileUsers(profile)}>
                        <Users className="h-4 w-4 mr-2" />
                        Ver Usuários
                      </DropdownMenuItem>
                      {!profile.isSystem && hasPermission('profiles.delete') && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteProfile(profile)}>
                            Excluir Perfil
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-sm text-muted-foreground mb-4">{profile.description}</p>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{profile.usersCount} usuários</span>
                  </div>
                  <span className="text-muted-foreground">{profile.permissions.length} permissões</span>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Atualizado por {profile.updatedBy} em {new Date(profile.updatedAt).toLocaleString('pt-BR')}
                </div>

                {/* Permission summary */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-1">
                    {profile.permissions.slice(0, 4).map(permId => {
                      const perm = assignableModules.flatMap((module) => module.permissions).find(p => p.id === permId);
                      return perm ? (
                        <Badge key={permId} variant="outline" className="text-xs">
                          {perm.category}
                        </Badge>
                      ) : null;
                    })}
                    {profile.permissions.length > 4 && (
                      <Badge variant="outline" className="text-xs">
                        +{profile.permissions.length - 4}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit/Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProfile ? 'Editar Perfil' : 'Novo Perfil'}</DialogTitle>
              <DialogDescription>
                Configure o acesso por módulo e ação. Se a tela não estiver marcada, os botões e ações internas também ficam ocultos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Perfil</Label>
                  <Input
                    value={workingProfile.name}
                    onChange={(e) => {
                      setWorkingProfile((prev) => ({ ...prev, name: e.target.value }));
                      setFormErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Ex: Supervisor"
                  />
                  {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
                </div>
                <div className="space-y-2 xl:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={workingProfile.description}
                    onChange={(e) => {
                      setWorkingProfile((prev) => ({ ...prev, description: e.target.value }));
                      setFormErrors((prev) => ({ ...prev, description: undefined }));
                    }}
                    placeholder="Breve descrição do perfil"
                    className="min-h-[92px]"
                  />
                  {formErrors.description && <p className="text-xs text-red-500">{formErrors.description}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={workingProfile.status}
                    onValueChange={(value: 'active' | 'inactive') => {
                      setWorkingProfile((prev) => ({ ...prev, status: value }));
                      setFormErrors((prev) => ({ ...prev, status: undefined }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.status && <p className="text-xs text-red-500">{formErrors.status}</p>}
                </div>
                <div className="xl:col-span-2 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-3">
                      <CalendarClock className="h-4 w-4 text-accent mt-0.5" />
                      <div>
                        <div className="font-semibold">Criação</div>
                        <div className="text-muted-foreground">{new Date(currentMetadata.createdAt).toLocaleString('pt-BR')}</div>
                        <div className="text-xs text-muted-foreground">por {currentMetadata.createdBy}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <UserRound className="h-4 w-4 text-accent mt-0.5" />
                      <div>
                        <div className="font-semibold">Última modificação</div>
                        <div className="text-muted-foreground">{new Date(currentMetadata.updatedAt).toLocaleString('pt-BR')}</div>
                        <div className="text-xs text-muted-foreground">por {currentMetadata.updatedBy}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <LayoutTemplate className="h-4 w-4 text-accent" />
                    Módulos habilitados
                  </div>
                  <div className="mt-2 text-3xl font-black">{enabledModulesCount}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Ações selecionadas
                  </div>
                  <div className="mt-2 text-3xl font-black">{currentPermissions.length}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ToggleLeft className="h-4 w-4 text-accent" />
                    Leitura de tela
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Se a permissão de acesso à tela estiver desligada, os botões internos também devem permanecer ocultos.
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <Label>Matriz de Permissões</Label>
                    {formErrors.permissions && <p className="mt-1 text-xs text-red-500">{formErrors.permissions}</p>}
                  </div>
                  <div className="w-full lg:w-80 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={permissionSearch}
                      onChange={(e) => setPermissionSearch(e.target.value)}
                      className="pl-10"
                      placeholder="Buscar módulo ou permissão..."
                    />
                  </div>
                </div>
                <Accordion type="multiple" defaultValue={Object.keys(SECTION_LABELS)} className="rounded-2xl border border-border bg-card px-4">
                  {Object.entries(filteredGroupedModules).map(([sectionKey, modules]) => (
                    <AccordionItem key={sectionKey} value={sectionKey} className="border-b border-border/70 last:border-b-0">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-col items-start text-left">
                          <span className="text-base font-bold">{SECTION_LABELS[sectionKey]?.title || sectionKey}</span>
                          <span className="text-xs text-muted-foreground">
                            {SECTION_LABELS[sectionKey]?.description} {modules.length} módulos.
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="mb-4 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleToggleSectionPermissions(modules, true)}>
                            Marcar seção
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => handleToggleSectionPermissions(modules, false)}>
                            Limpar seção
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          {modules.map((module) => {
                            const viewPermissionId = `${module.id}.view`;
                            const accessEnabled = currentPermissionSet.has(viewPermissionId);
                            const moduleSelectionCount = getModuleSelectionCount(module);
                            const actionPermissions = module.permissions.filter((permission) => permission.id !== viewPermissionId);

                            return (
                              <div key={module.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <div className="text-sm font-bold">{module.title}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{module.description}</div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <Badge variant={accessEnabled ? 'default' : 'outline'} className={cn("text-[10px]", accessEnabled ? 'bg-accent text-accent-foreground' : '')}>
                                      {moduleSelectionCount}/{module.permissions.length}
                                    </Badge>
                                    <div className="flex gap-2">
                                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleToggleModulePermissions(module, true)}>
                                        Tudo
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleToggleModulePermissions(module, false)}>
                                        Limpar
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3 cursor-pointer">
                                  <Checkbox
                                    checked={accessEnabled}
                                    onCheckedChange={() => togglePermission(module, viewPermissionId)}
                                  />
                                  <div>
                                    <p className="text-sm font-semibold">Acesso à tela</p>
                                    <p className="text-xs text-muted-foreground">
                                      Controla a exibição da tela no menu e a entrada no módulo.
                                    </p>
                                  </div>
                                </label>

                                {actionPermissions.length > 0 ? (
                                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {actionPermissions.map((permission) => (
                                      <label
                                        key={permission.id}
                                        className={cn(
                                          'flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors',
                                          currentPermissionSet.has(permission.id) ? 'border-accent/30 bg-accent/5' : 'border-border bg-background'
                                        )}
                                      >
                                        <Checkbox
                                          checked={currentPermissionSet.has(permission.id)}
                                          onCheckedChange={() => togglePermission(module, permission.id)}
                                        />
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium leading-tight">{permission.name}</p>
                                          <p className="text-xs text-muted-foreground leading-relaxed">{permission.description}</p>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                                    Este módulo possui somente permissão de acesso à tela.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button className="bg-accent hover:bg-accent/90" onClick={handleRequestSaveProfile}>
                  {editingProfile ? 'Salvar Alterações' : 'Criar Perfil'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar alterações do perfil?</AlertDialogTitle>
              <AlertDialogDescription>
                Revise as permissões selecionadas antes de salvar. As ações da interface respeitarão imediatamente essa matriz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm space-y-1">
              <p><span className="font-semibold">Perfil:</span> {workingProfile.name || 'Sem nome'}</p>
              <p><span className="font-semibold">Status:</span> {workingProfile.status === 'active' ? 'Ativo' : 'Inativo'}</p>
              <p><span className="font-semibold">Permissões:</span> {currentPermissions.length}</p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmSaveProfile}>Confirmar e salvar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={profileUsersOpen} onOpenChange={setProfileUsersOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Usuários do Perfil</DialogTitle>
              <DialogDescription>
                {selectedProfileUsers.profile?.name
                  ? `Usuários atualmente vinculados ao perfil ${selectedProfileUsers.profile.name}.`
                  : 'Usuários vinculados ao perfil selecionado.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {selectedProfileUsers.users.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {isPersistedProfilesEnabled
                    ? 'Nenhum usuário está vinculado a este perfil no banco.'
                    : 'A listagem de usuários por perfil só funciona após aplicar a migration e persistir os perfis no banco.'}
                </div>
              ) : (
                selectedProfileUsers.users.map((user) => (
                  <div key={user.id} className="rounded-xl border border-border px-3 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
