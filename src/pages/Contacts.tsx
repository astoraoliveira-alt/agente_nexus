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
import { Search, Plus, User, Phone, Mail, FileText, MoreHorizontal, Edit, Trash2, Globe, Smartphone, MessageSquare, Ban, CheckCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MainLayout } from '@/components/layout/MainLayout';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { ContactStatsHeader } from '@/components/crm/ContactStatsHeader';

const Contacts = () => {
    const { currentTenant } = useApp();
    const { toast } = useToast();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [objectionContacts, setObjectionContacts] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState('all');

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        identifier: '',
        email: '',
        phone: '',
        tags: '',
        status: 'active'
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
                const [data, objectionsData] = await Promise.all([
                    api.getContacts(currentTenant.id),
                    api.getObjectionContacts(currentTenant.id)
                ]);
                setContacts(data);
                setObjectionContacts(objectionsData);
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
                tags: contact.tags?.join(', ') || '',
                status: contact.status || 'active'
            });
        } else {
            setEditingContact(null);
            setFormData({
                name: '',
                identifier: '',
                email: '',
                phone: '',
                tags: '',
                status: 'active'
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

    const handleToggleBanStatus = async (contact: Contact) => {
        try {
            const newStatus = contact.status === 'banned' ? 'active' : 'banned';
            await api.updateContact(contact.id, { status: newStatus });
            toast({ title: newStatus === 'banned' ? "Contato banido com sucesso" : "Contato desbanido com sucesso" });
            loadContacts();
        } catch (error) {
            toast({
                title: "Erro ao atualizar status",
                description: "Não foi possível atualizar o status do contato.",
                variant: "destructive"
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTenant || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const contactData = {
                tenantId: currentTenant.id,
                name: formData.name,
                identifier: formData.identifier,
                email: formData.email || undefined,
                phone: formData.phone || undefined,
                status: formData.status,
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
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredContacts = contacts.filter(c =>
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.identifier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredObjections = objectionContacts.filter(c =>
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

                <ContactStatsHeader contacts={contacts} />

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-4">
                        <TabsTrigger value="all">Todos os Contatos</TabsTrigger>
                        <TabsTrigger value="objections" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-900 dark:data-[state=active]:bg-red-900/30 dark:data-[state=active]:text-red-300">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Relatório de Objeções
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-0">
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <CardTitle>Base de Contatos</CardTitle>
                                <span className="text-[11px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border uppercase tracking-wider">
                                    {searchTerm ? (
                                        <>Filtrados: <span className="text-foreground font-bold">{filteredContacts.length}</span> / {contacts.length}</>
                                    ) : (
                                        <>Total: <span className="text-foreground font-bold">{contacts.length}</span></>
                                    )}
                                </span>
                            </div>
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
                                                        <Badge variant="outline" className="gap-1 bg-[#25D366]/5 text-[#075E54] border-[#25D366]/20 dark:text-[#25D366]">
                                                            <Smartphone className="h-3 w-3" /> WhatsApp
                                                        </Badge>
                                                    ) : contact.channel === 'voice' ? (
                                                        <Badge variant="outline" className="gap-1 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:border-purple-500/30 dark:text-purple-400">
                                                            <Phone className="h-3 w-3" /> Voz
                                                        </Badge>
                                                    ) : contact.channel === 'text' || contact.channel === 'embedded' ? (
                                                        <Badge variant="outline" className="gap-1 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:border-blue-500/30 dark:text-blue-400">
                                                            <MessageSquare className="h-3 w-3" /> Web
                                                        </Badge>
                                                    ) : (
                                                        <>
                                                            {(contact.phone || /^\d+$/.test(contact.identifier?.replace(/\D/g, '') || '')) && (
                                                                <Badge variant="outline" className="gap-1"><Smartphone className="h-3 w-3" /> WhatsApp</Badge>
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
                                                <div className="flex items-center gap-2">
                                                    {contact.status === 'banned' && (
                                                        <Badge variant="destructive" className="whitespace-nowrap uppercase text-[10px]">
                                                            Banido
                                                        </Badge>
                                                    )}
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
                                                </div>
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
                                                        <DropdownMenuItem
                                                            onClick={() => handleToggleBanStatus(contact)}
                                                            className={contact.status === 'banned' ? "text-green-600" : "text-yellow-600"}
                                                        >
                                                            {contact.status === 'banned' ? (
                                                                <><CheckCircle className="mr-2 h-4 w-4" /> Retirar Banimento</>
                                                            ) : (
                                                                <><Ban className="mr-2 h-4 w-4" /> Banir Contato</>
                                                            )}
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
                </TabsContent>

                <TabsContent value="objections" className="mt-0">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <CardTitle className="text-red-600 flex items-center gap-2">
                                        <AlertTriangle className="h-5 w-5" />
                                        Contatos com Objeções / Resistência
                                    </CardTitle>
                                    <span className="text-[11px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border uppercase tracking-wider">
                                        {searchTerm ? (
                                            <>Filtrados: <span className="text-foreground font-bold">{filteredObjections.length}</span> / {objectionContacts.length}</>
                                        ) : (
                                            <>Total: <span className="text-foreground font-bold">{objectionContacts.length}</span></>
                                        )}
                                    </span>
                                </div>
                                <div className="relative w-64">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar objeções..."
                                        className="pl-8"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <CardDescription>
                                Leads e clientes que apresentaram resistência, sentimento negativo ou pediram para falar com um atendente.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[300px]">Nome / Identificador</TableHead>
                                        <TableHead>Motivo / Sentimento</TableHead>
                                        <TableHead>Status / Lifecycle</TableHead>
                                        <TableHead>Última Interação</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
                                        </TableRow>
                                    ) : filteredObjections.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                Nenhuma objeção encontrada. Ótimo trabalho!
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredObjections.map((contact) => (
                                            <TableRow key={contact.id} className="bg-red-50/30 dark:bg-red-950/10">
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar>
                                                            <AvatarImage src={contact.avatarUrl} />
                                                            <AvatarFallback>{(contact.name || '??').substring(0, 2).toUpperCase()}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="font-medium">{contact.name}</p>
                                                            <p className="text-xs text-muted-foreground flex gap-2">
                                                                {contact.identifier}
                                                                {contact.channel === 'whatsapp' && <Badge variant="outline" className="text-[9px] px-1 h-4">WhatsApp</Badge>}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                                                        {contact.objection_reason === 'Sentiment/Tag' ? (contact.sentiment || 'Objeção') : contact.objection_reason}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="capitalize">
                                                        {contact.lifecycleStatus || 'Lead'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {new Date(contact.updatedAt).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(contact)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                </Tabs>

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

                            {editingContact && (
                                <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm bg-muted/30">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Acesso ao Agente (N8n)</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {formData.status === 'banned'
                                                ? "Este usuário está banido e o robô não responderá às suas mensagens via webhook."
                                                : "O contato possui acesso normal pra interagir com o robô via celular/chat."}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={formData.status !== 'banned'}
                                        onCheckedChange={(checked) => setFormData({ ...formData, status: checked ? 'active' : 'banned' })}
                                    />
                                </div>
                            )}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Salvando..." : "Salvar"}
                                </Button>
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
