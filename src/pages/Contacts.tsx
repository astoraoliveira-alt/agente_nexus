import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Contact } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Plus, User, Phone, Mail, FileText, MoreHorizontal, Edit, Trash2, Globe } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MainLayout } from '@/components/layout/MainLayout';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Contacts = () => {
    const { currentTenant } = useApp();
    const { toast } = useToast();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        identifier: '',
        email: '',
        phone: '',
        tags: ''
    });

    useEffect(() => {
        if (currentTenant) {
            loadContacts();
        }
    }, [currentTenant]);

    const loadContacts = async () => {
        setIsLoading(true);
        try {
            if (currentTenant) {
                const data = await api.getContacts(currentTenant.id);
                setContacts(data);
            }
        } catch (error) {
            toast({
                title: "Erro ao carregar contatos",
                description: "Não foi possível buscar a lista de contatos.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenDialog = (contact?: Contact) => {
        if (contact) {
            setEditingContact(contact);
            setFormData({
                name: contact.name,
                identifier: contact.identifier,
                email: contact.email || '',
                phone: contact.phone || '',
                tags: contact.tags?.join(', ') || ''
            });
        } else {
            setEditingContact(null);
            setFormData({
                name: '',
                identifier: '',
                email: '',
                phone: '',
                tags: ''
            });
        }
        setIsDialogOpen(true);
    };

    const handleDeleteContact = async () => {
        if (!contactToDelete) return;

        try {
            const success = await api.deleteContact(contactToDelete.id);
            if (success) {
                toast({ title: "Contato removido com sucesso" });
                loadContacts();
            } else {
                throw new Error("Failed to delete");
            }
        } catch (error) {
            toast({
                title: "Erro ao remover contato",
                description: "Não foi possível remover o contato via API.",
                variant: "destructive"
            });
        } finally {
            setContactToDelete(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTenant) return;

        try {
            const contactData = {
                tenantId: currentTenant.id,
                name: formData.name,
                identifier: formData.identifier,
                email: formData.email || undefined,
                phone: formData.phone || undefined,
                tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
                extraInfo: {} // Reset or keep existing? Usually update doesn't clear unless scoped. 
            };

            if (editingContact) {
                await api.updateContact(editingContact.id, contactData);
                toast({ title: "Contato atualizado com sucesso" });
            } else {
                await api.createContact(contactData);
                toast({ title: "Contato criado com sucesso" });
            }

            setIsDialogOpen(false);
            loadContacts();
        } catch (error) {
            toast({
                title: "Erro ao salvar contato",
                description: "Verifique os dados e tente novamente. O identificador deve ser único.",
                variant: "destructive"
            });
        }
    };

    const filteredContacts = contacts.filter(c =>
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.identifier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <MainLayout>
            <div className="p-8 space-y-8 animate-in fade-in duration-500 h-full overflow-y-auto">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Contatos (CRM)</h1>
                        <p className="text-muted-foreground">Gerencie sua base de clientes e leads identificados.</p>
                    </div>
                    <Button onClick={() => handleOpenDialog()} className="gap-2">
                        <Plus className="h-4 w-4" /> Novo Contato
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Base de Contatos</CardTitle>
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nome, telefone..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[300px]">Nome / Identificador</TableHead>
                                    <TableHead>Canais</TableHead>
                                    <TableHead>Tags</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Cadastro</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
                                    </TableRow>
                                ) : filteredContacts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            Nenhum contato encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredContacts.map((contact) => (
                                        <TableRow key={contact.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        <AvatarImage src={contact.avatarUrl} />
                                                        <AvatarFallback>{(contact.name || '??').substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium">{contact.name}</p>
                                                        <p className="text-xs text-muted-foreground">{contact.identifier}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    {contact.channel === 'whatsapp' ? (
                                                        <Badge variant="outline" className="gap-1 bg-green-500/5 text-green-600 border-green-500/20">
                                                            <Phone className="h-3 w-3" /> WhatsApp
                                                        </Badge>
                                                    ) : contact.channel === 'embedded' ? (
                                                        <Badge variant="outline" className="gap-1 bg-blue-500/5 text-blue-600 border-blue-500/20">
                                                            <Globe className="h-3 w-3" /> Landing Page
                                                        </Badge>
                                                    ) : (
                                                        <>
                                                            {(contact.phone || /^\d+$/.test(contact.identifier?.replace(/\D/g, '') || '')) && (
                                                                <Badge variant="outline" className="gap-1"><Phone className="h-3 w-3" /> WhatsApp</Badge>
                                                            )}
                                                            {(contact.email || contact.identifier?.includes('@')) && (
                                                                <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> Email</Badge>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {contact.tags?.map((tag, i) => (
                                                        <Badge key={i} variant="secondary" className="text-[10px]">{tag}</Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`capitalize whitespace-nowrap ${['Lead Quente', 'sql', 'SQL'].includes(contact.lifecycleStatus || '') ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                                                        ['Interesse Médio', 'mql', 'MQL'].includes(contact.lifecycleStatus || '') ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                                            ['Interesse Baixo', 'lead', 'Lead'].includes(contact.lifecycleStatus || '') ? 'bg-gray-500/10 text-gray-600 border-gray-500/20' :
                                                                'bg-gray-500/5 text-gray-400 border-gray-500/10'
                                                        }`}
                                                >
                                                    {
                                                        ['sql', 'SQL'].includes(contact.lifecycleStatus || '') ? 'Lead Quente' :
                                                            ['mql', 'MQL'].includes(contact.lifecycleStatus || '') ? 'Interesse Médio' :
                                                                ['Interesse Baixo', 'lead', 'Lead'].includes(contact.lifecycleStatus || '') ? 'Lead' :
                                                                    (contact.lifecycleStatus || 'Sem Status')
                                                    }
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {new Date(contact.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => handleOpenDialog(contact)}>
                                                            <Edit className="mr-2 h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() => setContactToDelete(contact)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Remover
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingContact ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">Nome Completo</label>
                                <Input
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ex: João da Silva"
                                />
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium">Identificador Único (Obrigatório)</label>
                                <Input
                                    required
                                    value={formData.identifier}
                                    disabled={!!editingContact} // Identifier usually shouldn't change to avoid dupes
                                    onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                                    placeholder="Ex: 5511999999999"
                                />
                                <p className="text-[10px] text-muted-foreground">Geralmente o número de telefone (WhatsApp) ou ID externo.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Telefone</label>
                                    <Input
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+55 11 9..."
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Email</label>
                                    <Input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="joao@email.com"
                                    />
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium">Tags (separadas por vírgula)</label>
                                <Input
                                    value={formData.tags}
                                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                    placeholder="vip, lead, suporte"
                                />
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit">Salvar</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Essa ação não pode ser desfeita. Isso excluirá permanentemente o contato
                                <strong> {contactToDelete?.name} </strong>
                                e removerá seus dados de nossos servidores.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteContact} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Sim, remover contato
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </MainLayout>
    );
};

export default Contacts;
