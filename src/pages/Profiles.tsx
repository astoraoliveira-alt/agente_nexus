import { useState } from 'react';
import { Shield, Plus, Search, MoreVertical, Check, X, Users, Settings as SettingsIcon } from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface Profile {
  id: string;
  name: string;
  description: string;
  usersCount: number;
  permissions: string[];
  isSystem: boolean;
}

const PERMISSIONS: Permission[] = [
  { id: 'conversations.view', name: 'Visualizar Conversas', description: 'Ver lista e histórico de conversas', category: 'Conversas' },
  { id: 'conversations.takeover', name: 'Assumir Conversas', description: 'Assumir atendimento de conversas', category: 'Conversas' },
  { id: 'conversations.transfer', name: 'Transferir Conversas', description: 'Transferir conversas entre operadores', category: 'Conversas' },
  { id: 'agents.view', name: 'Visualizar Agentes', description: 'Ver configurações dos agentes', category: 'Agentes' },
  { id: 'agents.edit', name: 'Editar Agentes', description: 'Modificar configurações dos agentes', category: 'Agentes' },
  { id: 'agents.create', name: 'Criar Agentes', description: 'Criar novos agentes', category: 'Agentes' },
  { id: 'consumption.view', name: 'Visualizar Consumo', description: 'Ver relatórios de consumo', category: 'Consumo' },
  { id: 'consumption.export', name: 'Exportar Relatórios', description: 'Exportar dados de consumo', category: 'Consumo' },
  { id: 'users.view', name: 'Visualizar Usuários', description: 'Ver lista de usuários', category: 'Usuários' },
  { id: 'users.manage', name: 'Gerenciar Usuários', description: 'Criar, editar e desativar usuários', category: 'Usuários' },
  { id: 'profiles.manage', name: 'Gerenciar Perfis', description: 'Criar e editar perfis de acesso', category: 'Administração' },
  { id: 'settings.manage', name: 'Configurações', description: 'Gerenciar configurações da plataforma', category: 'Administração' },
];

const MOCK_PROFILES: Profile[] = [
  {
    id: 'profile-1',
    name: 'Administrador',
    description: 'Acesso total ao sistema',
    usersCount: 2,
    permissions: PERMISSIONS.map(p => p.id),
    isSystem: true,
  },
  {
    id: 'profile-2',
    name: 'Operador',
    description: 'Atendimento e visualização de conversas',
    usersCount: 8,
    permissions: ['conversations.view', 'conversations.takeover', 'conversations.transfer', 'agents.view'],
    isSystem: true,
  },
  {
    id: 'profile-3',
    name: 'Supervisor',
    description: 'Monitoramento e relatórios',
    usersCount: 3,
    permissions: ['conversations.view', 'agents.view', 'consumption.view', 'consumption.export', 'users.view'],
    isSystem: false,
  },
  {
    id: 'profile-4',
    name: 'Analista',
    description: 'Acesso a relatórios e métricas',
    usersCount: 5,
    permissions: ['consumption.view', 'consumption.export', 'agents.view'],
    isSystem: false,
  },
];

export default function Profiles() {
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState(MOCK_PROFILES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [newProfile, setNewProfile] = useState({ name: '', description: '', permissions: [] as string[] });

  const filteredProfiles = profiles.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const groupedPermissions = PERMISSIONS.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const handleSaveProfile = () => {
    if (editingProfile) {
      setProfiles(prev => prev.map(p => 
        p.id === editingProfile.id ? { ...editingProfile } : p
      ));
      toast.success('Perfil atualizado com sucesso');
    } else {
      const newId = `profile-${Date.now()}`;
      setProfiles(prev => [...prev, {
        id: newId,
        name: newProfile.name,
        description: newProfile.description,
        permissions: newProfile.permissions,
        usersCount: 0,
        isSystem: false,
      }]);
      toast.success('Perfil criado com sucesso');
    }
    setDialogOpen(false);
    setEditingProfile(null);
    setNewProfile({ name: '', description: '', permissions: [] });
  };

  const openEditDialog = (profile: Profile) => {
    setEditingProfile({ ...profile });
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingProfile(null);
    setNewProfile({ name: '', description: '', permissions: [] });
    setDialogOpen(true);
  };

  const togglePermission = (permId: string) => {
    if (editingProfile) {
      const perms = editingProfile.permissions.includes(permId)
        ? editingProfile.permissions.filter(p => p !== permId)
        : [...editingProfile.permissions, permId];
      setEditingProfile({ ...editingProfile, permissions: perms });
    } else {
      const perms = newProfile.permissions.includes(permId)
        ? newProfile.permissions.filter(p => p !== permId)
        : [...newProfile.permissions, permId];
      setNewProfile({ ...newProfile, permissions: perms });
    }
  };

  const currentPermissions = editingProfile?.permissions || newProfile.permissions;

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
                  <p className="text-sm text-muted-foreground">Gerencie os perfis e permissões do sistema</p>
                </div>
              </div>
              <Button className="bg-accent hover:bg-accent/90" onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Perfil
              </Button>
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
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(profile)}>
                        <SettingsIcon className="h-4 w-4 mr-2" />
                        Editar Perfil
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Users className="h-4 w-4 mr-2" />
                        Ver Usuários
                      </DropdownMenuItem>
                      {!profile.isSystem && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
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

                {/* Permission summary */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-1">
                    {profile.permissions.slice(0, 4).map(permId => {
                      const perm = PERMISSIONS.find(p => p.id === permId);
                      return perm ? (
                        <Badge key={permId} variant="outline" className="text-xs">
                          {perm.name.split(' ')[0]}
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
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProfile ? 'Editar Perfil' : 'Novo Perfil'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Perfil</Label>
                  <Input
                    value={editingProfile?.name || newProfile.name}
                    onChange={(e) => editingProfile 
                      ? setEditingProfile({ ...editingProfile, name: e.target.value })
                      : setNewProfile({ ...newProfile, name: e.target.value })
                    }
                    placeholder="Ex: Supervisor"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={editingProfile?.description || newProfile.description}
                    onChange={(e) => editingProfile 
                      ? setEditingProfile({ ...editingProfile, description: e.target.value })
                      : setNewProfile({ ...newProfile, description: e.target.value })
                    }
                    placeholder="Breve descrição do perfil"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label>Permissões</Label>
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">{category}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {perms.map(perm => (
                        <label 
                          key={perm.id}
                          className="flex items-start gap-3 p-3 bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={currentPermissions.includes(perm.id)}
                            onCheckedChange={() => togglePermission(perm.id)}
                          />
                          <div>
                            <p className="text-sm font-medium">{perm.name}</p>
                            <p className="text-xs text-muted-foreground">{perm.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button className="bg-accent hover:bg-accent/90" onClick={handleSaveProfile}>
                  {editingProfile ? 'Salvar Alterações' : 'Criar Perfil'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
