import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Building2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AuthService } from "@/services/auth";
import { api } from "@/services/api";
import { User, Company } from "@/lib/types";
import { ManagedProfile } from "@/lib/profile-management";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

function getRoleDisplayName(role?: string): string {
    switch (role) {
        case 'tenant_admin':
            return 'Admin da Empresa';
        case 'operator':
            return 'Operador';
        case 'super_admin':
            return 'Super Admin';
        default:
            return role || 'Operador';
    }
}

export function PendingUsersList() {
    const [pendingUsers, setPendingUsers] = useState<User[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedTenant, setSelectedTenant] = useState<string>('');
    const [selectedRole, setSelectedRole] = useState<string>('operator');
    const [availableProfiles, setAvailableProfiles] = useState<ManagedProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Pending Users
            const users = await AuthService.getPendingUsers();
            setPendingUsers(users);

            // 2. Fetch Companies (for assignment)
            const tenants = await api.getCompanies();
            setCompanies(tenants);
        } catch (error) {
            console.error("Error loading pending users:", error);
            toast.error("Erro ao carregar solicitações.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleApproveClick = (user: User) => {
        setSelectedUser(user);
        setSelectedRole(user.role || 'operator');
        setSelectedTenant(user.tenantId || '');
        setSelectedProfileId(user.profileId || '');
        setIsDialogOpen(true);
    };

    const handleQuickApprove = async (user: User) => {
        if (!user.tenantId) {
            handleApproveClick(user);
            return;
        }
        try {
            await AuthService.approveUser(user.id, user.tenantId, user.role || 'operator', user.profileId || null);
            toast.success(`Acesso liberado com sucesso para ${user.name || user.email}!`);
            loadData();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao aprovar usuário.");
        }
    };

    useEffect(() => {
        async function loadProfilesForTenant() {
            if (!selectedTenant) {
                setAvailableProfiles([]);
                setSelectedProfileId('');
                return;
            }

            try {
                const profiles = await api.getProfiles(selectedTenant);
                setAvailableProfiles(profiles);
                if (!selectedProfileId) {
                    const defaultProfile = profiles.find((profile: ManagedProfile) => profile.systemKey === selectedRole)
                        || profiles.find((profile: ManagedProfile) => profile.systemKey === 'operator')
                        || profiles[0];
                    setSelectedProfileId(defaultProfile?.id || '');
                }
            } catch (error) {
                console.error('Error loading profiles for approval:', error);
                setAvailableProfiles([]);
                setSelectedProfileId('');
            }
        }

        loadProfilesForTenant();
    }, [selectedTenant, selectedRole]);

    const confirmApproval = async () => {
        if (!selectedUser || !selectedTenant) {
            toast.error("Selecione uma empresa para vincular o usuário.");
            return;
        }

        try {
            await AuthService.approveUser(selectedUser.id, selectedTenant, selectedRole, selectedProfileId || null);
            toast.success(`Usuário ${selectedUser.name} aprovado com sucesso!`);
            setIsDialogOpen(false);
            loadData(); // Refresh list
        } catch (error) {
            console.error(error);
            toast.error("Erro ao aprovar usuário.");
        }
    };

    const handleReject = async (userId: string) => {
        if (!confirm("Tem certeza que deseja bloquear esta solicitação?")) return;

        try {
            await AuthService.rejectUser(userId);
            toast.success("Solicitação rejeitada/bloqueada.");
            loadData();
        } catch (error) {
            toast.error("Erro ao rejeitar usuário.");
        }
    };

    if (isLoading) return <div className="p-4 text-center">Carregando solicitações...</div>;

    if (pendingUsers.length === 0) {
        return null;
    }

    return (
        <div className="p-6 pb-0">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-amber-500" />
                        Solicitações de Acesso ({pendingUsers.length})
                    </CardTitle>
                    <CardDescription>
                        Usuários aguardando liberação de acesso e vinculação.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Empresa / Função</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pendingUsers.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.name || 'Sem nome'}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">{companies.find(c => c.id === user.tenantId)?.name || 'Não vinculada'}</span> • {getRoleDisplayName(user.role)}
                                    </TableCell>
                                    <TableCell>
                                        {user.status === 'invited' ? (
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                Aguardando Acesso
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                Pendente
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleReject(user.id)}
                                            title="Rejeitar"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-colors"
                                            onClick={() => user.tenantId ? handleQuickApprove(user) : handleApproveClick(user)}
                                        >
                                            <Check className="h-4 w-4 mr-1 text-white" /> Liberar Acesso
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>

                {/* Approval Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Aprovar Acesso</DialogTitle>
                            <DialogDescription>
                                Defina a empresa e o nível de acesso para <b>{selectedUser?.name}</b>.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Empresa (Tenant)</Label>
                                <Select onValueChange={setSelectedTenant} value={selectedTenant}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione a empresa..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Perfil de Acesso</Label>
                                <Select onValueChange={setSelectedRole} value={selectedRole}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="operator">Operador (Padrão)</SelectItem>
                                        <SelectItem value="tenant_admin">Admin da Empresa</SelectItem>
                                        <SelectItem value="super_admin">Super Admin (Cuidado)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Perfil Persistido</Label>
                                <Select onValueChange={setSelectedProfileId} value={selectedProfileId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione um perfil..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableProfiles.map((profile) => (
                                            <SelectItem key={profile.id} value={profile.id}>
                                                {profile.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmApproval} className="bg-green-600 hover:bg-green-700">Concluir Aprovação</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </Card>
        </div>
    );
}
