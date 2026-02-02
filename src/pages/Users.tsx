import { Users as UsersIcon, Plus, Search, MoreVertical, Shield, Mail, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockUsers, User } from '@/lib/mock-data';
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
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';

export default function Users() {
  const { currentTenant } = useApp();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>(mockUsers);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'operator',
  });

  const tenantUsers = users.filter(u =>
    u.tenantId === currentTenant?.id &&
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData(user);
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        role: 'operator',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (editingUser) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } as User : u));
      toast.success(`Usuário ${formData.name} atualizado`);
    } else {
      const newUser = {
        ...formData,
        id: `user-${Date.now()}`,
        tenantId: currentTenant?.id || 'tenant-1',
        avatar: formData.name?.substring(0, 2).toUpperCase(),
      } as User;
      setUsers(prev => [...prev, newUser]);
      toast.success(`Usuário ${newUser.name} criado`);
    }
    setIsDialogOpen(false);
  };

  const handleDeleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success('Usuário removido');
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

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
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
              <Button className="bg-accent hover:bg-accent/90" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
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
                      <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="status-dot status-online" />
                          <span className="text-sm">Ativo</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Mail className="h-4 w-4 mr-2" />
                              Enviar Email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenDialog(user)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteUser(user.id)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
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
                <Label>Perfil de Acesso</Label>
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
