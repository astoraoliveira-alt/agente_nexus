import { Users as UsersIcon, Plus, Search, MoreVertical, Mail, Pencil, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { User } from '@/lib/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { PendingUsersList } from '@/components/admin/PendingUsersList';
import { ManagedProfile } from '@/lib/profile-management';

export default function Users() {
  const { currentTenant, currentUser, hasPermission } = useApp();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [profiles, setProfiles] = useState<ManagedProfile[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'operator',
  });

  useEffect(() => {
    async function loadUsers() {
      if (currentTenant) {
        try {
          const [usersData, profilesData] = await Promise.all([
            api.getUsers(currentTenant.id),
            api.getProfiles(currentTenant.id).catch(() => []),
          ]);
          setUsers(usersData);
          setProfiles(profilesData);
        } catch (error) {
          console.error('Failed to fetch users:', error);
          toast.error('Erro ao carregar usuários');
        }
      }
    }
    loadUsers();
  }, [currentTenant]);

  const tenantUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData(user);
    } else {
      const defaultProfile = profiles.find((profile) => profile.systemKey === 'operator');
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        role: 'operator',
        profileId: defaultProfile?.id || null,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Update
        const updatedUser = await api.updateUser(editingUser.id, formData);
        setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUser : u));
        toast.success(`Usuário ${formData.name} atualizado`);
      } else {
        // Create
        if (!currentTenant?.id) {
          toast.error('Nenhuma empresa selecionada');
          return;
        }
        const newUserPayload = {
          ...formData,
          tenantId: currentTenant.id,
          role: formData.role || 'operator'
        };
        const createdUser = await api.createUser(newUserPayload);
        setUsers(prev => [...prev, createdUser]);
        toast.success(`Convite enviado para ${createdUser.email}`);
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving user:', error);
      const errorMessage = (error as any)?.message || '';
      const message = (error as any)?.code === '42501' || (error as any)?.status === 403
        ? 'Sem permissão para criar usuário. É necessário ajustar a política RLS da tabela users.'
        : errorMessage.includes('Unauthorized')
          ? 'Sessão do Supabase inválida ou expirada. Saia e entre novamente antes de enviar convites.'
        : errorMessage.includes('already been registered')
          ? 'Este email já possui acesso no Supabase Auth. Use "Enviar Email" apenas para usuários ainda não provisionados ou revise o cadastro.'
        : errorMessage || 'Erro ao salvar usuário';
      toast.error(message);
    }
  };

  const handleSendInvite = async (user: User) => {
    try {
      const updatedUser = await api.resendInvite({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileId: user.profileId,
        tenantId: user.tenantId,
      });
      setUsers(prev => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      toast.success(`Convite reenviado para ${updatedUser.email}`);
    } catch (error) {
      console.error('Error resending invite:', error);
      const errorMessage = (error as any)?.message || '';
      const message = errorMessage.includes('Unauthorized')
        ? 'Sessão do Supabase inválida ou expirada. Saia e entre novamente antes de reenviar o convite.'
        : errorMessage.includes('already been registered')
        ? 'Este email já existe no Supabase Auth. Se o usuário não recebeu o convite inicial, revise as configurações de email do Supabase ou envie um reset de senha.'
        : errorMessage || 'Erro ao enviar convite por email';
      toast.error(message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await api.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success('Usuário removido');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Erro ao remover usuário');
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'tenant_admin':
        return <Badge className="bg-accent">Admin</Badge>;
      case 'operator':
        return <Badge variant="secondary">Operador</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getProfileLabel = (user: User) => {
    const linkedProfile = profiles.find((profile) => profile.id === user.profileId);
    return linkedProfile?.name || user.profileName || 'Sem perfil';
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center gap-2">
            <div className="status-dot status-online" />
            <span className="text-sm">Ativo</span>
          </div>
        );
      case 'pending':
      case 'invited':
        return (
          <div className="flex items-center gap-2">
            <div className="status-dot bg-amber-500" />
            <span className="text-sm">Pendente</span>
          </div>
        );
      case 'blocked':
        return (
          <div className="flex items-center gap-2">
            <div className="status-dot bg-red-500" />
            <span className="text-sm">Bloqueado</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2">
            <div className="status-dot bg-slate-400" />
            <span className="text-sm">Indefinido</span>
          </div>
        );
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">

        {/* Admin Section: Approval Queue */}
        {currentUser?.role === 'super_admin' && (
          <PendingUsersList />
        )}

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <UsersIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">Usuários</h1>
                    {currentTenant && (
                      <Badge variant="outline" className="text-xs font-normal border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10">
                        {currentTenant.name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Gerencie a equipe de <strong>{currentTenant?.name}</strong> e seus acessos
                  </p>
                </div>
              </div>
              {hasPermission('users.create') && (
                <Button className="bg-accent hover:bg-accent/90" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Usuário
                </Button>
              )}
            </div>

            {/* Search */}
            <div className="mt-4 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuários..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Users Table */}
          <div className="kpi-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Usuário</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Função</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium">{user.avatar}</span>
                          </div>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {getRoleBadge(user.role)}
                          <div className="text-xs text-muted-foreground">{getProfileLabel(user)}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(user.status)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleSendInvite(user)}>
                              <Mail className="h-4 w-4 mr-2" />
                              Enviar Email
                            </DropdownMenuItem>
                            {hasPermission('users.edit') && (
                              <DropdownMenuItem onClick={() => handleOpenDialog(user)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                            )}
                            {hasPermission('users.delete') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteUser(user.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tenantUsers.length === 0 && (
              <div className="text-center py-12">
                <UsersIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum usuário encontrado</p>
              </div>
            )}
          </div>
        </div>

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
              <DialogDescription>
                {editingUser
                  ? 'Atualize os dados de acesso do usuário selecionado.'
                  : 'Cadastre um novo usuário para a empresa atual e defina o perfil de acesso inicial.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md border border-border">
                <p className="text-xs text-muted-foreground uppercase mb-1">Contexto</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="font-medium">{currentTenant?.name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input
                  placeholder="Ex: João Silva"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Corporativo</Label>
                <Input
                  placeholder="joao@empresa.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Função Base</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v: any) => setFormData({ ...formData, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_admin">Admin da Empresa</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
                {!editingUser && (
                  <p className="text-[10px] text-muted-foreground">
                    Define o papel macro usado como fallback de compatibilidade e governança.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Perfil de Acesso</Label>
                <Select
                  value={formData.profileId || undefined}
                  onValueChange={(v: any) => setFormData({ ...formData, profileId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um perfil salvo" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editingUser && (
                  <p className="text-[10px] text-muted-foreground">
                    O usuário receberá um convite por email para definir a senha.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button className="bg-accent hover:bg-accent/90" onClick={handleSaveUser}>
                  {editingUser ? 'Salvar' : 'Criar Usuário'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
