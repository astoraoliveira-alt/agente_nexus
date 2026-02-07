import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Contact } from '@/lib/types';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { Search, Filter, Phone, Mail, Globe, Calendar, MoreVertical, Flame, Droplets, Cloud, ShieldCheck, ZoomIn, ZoomOut, Maximize2, Trash2, ArrowRightLeft, LayoutTemplate, MessageCircle, Mic, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const LeadCRM = () => {
    const { currentTenant } = useApp();
    const { toast } = useToast();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [zoom, setZoom] = useState(1);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
    const handleResetZoom = () => setZoom(1);

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
                title: "Erro ao carregar CRM",
                description: "Não foi possível buscar a base de leads.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleMoveContact = async (contactId: string, newStatus: string) => {
        try {
            await api.updateContact(contactId, { lifecycleStatus: newStatus });

            // Update local state
            setContacts(prev => prev.map(c =>
                c.id === contactId ? { ...c, lifecycleStatus: newStatus } : c
            ));

            toast({
                title: "Lead movido",
                description: `O status do lead foi atualizado para "${newStatus}".`
            });
        } catch (error) {
            toast({
                title: "Erro ao mover lead",
                description: "Não foi possível atualizar o status do contato.",
                variant: "destructive"
            });
        }
    };

    const getStatusGroup = (status?: string) => {
        const s = status?.toLowerCase() || '';
        if (s === 'lead' || s === '') return 'lead'; // Explicitly catch new leads
        if (s.includes('quente') || s === 'sql') return 'quente';
        if (s.includes('médio') || s.includes('medio') || s === 'mql') return 'medio';
        if (s.includes('negociação') || s.includes('negociacao')) return 'negociacao';
        if (s.includes('convertido') || s.includes('sucesso')) return 'convertido';
        if (s.includes('perdido')) return 'perdido';
        return 'baixo'; // Default/Lead/Interesse Baixo
    };

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.identifier.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const { openSlideOver } = useApp();

    const columns = [
        {
            id: 'lead',
            title: 'Novos Leads',
            subtitle: 'Recém chegados',
            icon: UserPlus,
            className: 'bg-slate-500/10 text-slate-600',
            status: 'Lead',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'lead')
        },
        {
            id: 'baixo',
            title: 'Interesse Baixo',
            subtitle: 'Leads em estágio inicial',
            icon: Cloud,
            className: 'bg-gray-500/10 text-gray-500',
            status: 'Interesse Baixo',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'baixo')
        },
        {
            id: 'medio',
            title: 'Interesse Médio',
            subtitle: 'Leads engajados',
            icon: Droplets,
            className: 'bg-blue-500/10 text-blue-600',
            status: 'Interesse Médio',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'medio')
        },
        {
            id: 'quente',
            title: 'Lead Quente',
            subtitle: 'Oportunidades reais',
            icon: Flame,
            className: 'bg-orange-500/10 text-orange-600',
            status: 'Lead Quente',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'quente')
        },
        {
            id: 'negociacao',
            title: 'Em Negociação',
            subtitle: 'Propostas e orçamentos',
            icon: Search,
            className: 'bg-purple-500/10 text-purple-600',
            status: 'Em Negociação',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'negociacao')
        },
        {
            id: 'convertido',
            title: 'Convertido',
            subtitle: 'Clientes fechados',
            icon: ShieldCheck,
            className: 'bg-green-500/10 text-green-600',
            status: 'Convertido',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'convertido')
        },
        {
            id: 'perdido',
            title: 'Leads Perdidos',
            subtitle: 'Não convertidos',
            icon: Trash2,
            className: 'bg-red-500/10 text-red-600',
            status: 'Perdido',
            contacts: filteredContacts.filter(c => getStatusGroup(c.lifecycleStatus) === 'perdido')
        }
    ];

    return (
        <MainLayout>
            <div className="p-8 space-y-8 h-full overflow-hidden flex flex-col">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">CRM Inteligente</h1>
                        <p className="text-muted-foreground text-sm flex items-center gap-2">
                            Acompanhe a jornada de cada lead desde o interesse inicial até a conversão.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Zoom Controls */}
                        <div className="flex items-center bg-muted/50 rounded-lg p-1 border border-border/50">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={handleZoomOut}
                                title="Diminuir Zoom"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <div
                                className="px-2 min-w-[3.5rem] text-center text-[10px] font-bold font-mono cursor-pointer hover:bg-muted rounded"
                                onClick={handleResetZoom}
                                title="Resetar Zoom"
                            >
                                {Math.round(zoom * 100)}%
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={handleZoomIn}
                                title="Aumentar Zoom"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filtrar por nome..."
                                className="pl-8 h-9 text-xs"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" size="sm" className="gap-2 h-9">
                            <Filter className="h-4 w-4" /> Filtros
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto pb-4 custom-scrollbar">
                    <div
                        className="flex gap-4 h-full min-w-[max-content] transition-all duration-200 ease-in-out"
                        style={{
                            transform: `scale(${zoom})`,
                            transformOrigin: 'top left',
                            width: zoom < 1 ? `${100 / zoom}%` : 'auto', // Compensate for scaled width
                            paddingBottom: zoom < 1 ? `${(1 - zoom) * 100}%` : '0' // Extra space for scroll when scaled down
                        }}
                    >
                        {columns.map((column) => (
                            <div key={column.id} className="flex-1 min-w-[280px] max-w-[300px] flex flex-col bg-muted/20 border border-border/40 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${column.className}`}>
                                            <column.icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-sm">{column.title}</h3>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{column.contacts.length} contatos</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                                    {column.contacts.map((contact) => (
                                        <Card
                                            key={contact.id}
                                            className="group cursor-pointer hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5 transition-all duration-300 shadow-sm border-border/50 overflow-hidden"
                                            onClick={() => openSlideOver('contact-details', contact)}
                                        >
                                            <CardContent className="p-4 space-y-4">
                                                {/* Card Header: Avatar & Info */}
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-10 w-10 border border-border">
                                                            <AvatarImage src={contact.avatarUrl} />
                                                            <AvatarFallback className="bg-muted text-xs font-bold text-muted-foreground">
                                                                {contact.name.substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <h4 className="font-semibold text-sm leading-none mb-1 group-hover:text-accent transition-colors">{contact.name}</h4>
                                                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground lowercase">
                                                                {contact.channel === 'whatsapp' ? <Phone className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                                                                <span className="truncate max-w-[120px]">{contact.identifier}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuLabel>Mover para Etapa</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                {columns.map(col => (
                                                                    <DropdownMenuItem
                                                                        key={col.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleMoveContact(contact.id, col.status);
                                                                        }}
                                                                        className="flex items-center justify-between"
                                                                        disabled={getStatusGroup(contact.lifecycleStatus) === col.id}
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            <col.icon className="h-3.5 w-3.5" />
                                                                            <span>{col.title}</span>
                                                                        </div>
                                                                        {getStatusGroup(contact.lifecycleStatus) === col.id && (
                                                                            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                                                                        )}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>

                                                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 uppercase font-bold tracking-tighter border-muted-foreground/20 bg-muted/20 text-muted-foreground/70 whitespace-nowrap">
                                                            {new Date(contact.createdAt).toLocaleDateString()}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                {/* Tags */}
                                                <div className="flex flex-wrap gap-1">
                                                    {contact.tags?.slice(0, 3).map((tag, i) => (
                                                        <span key={i} className="text-[10px] bg-accent/20 dark:bg-accent/10 text-slate-900 dark:text-accent-foreground font-bold px-2 py-0.5 rounded-full border border-accent/30 dark:border-accent/20">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                    {contact.tags && contact.tags.length > 3 && (
                                                        <span className="text-[10px] text-muted-foreground px-1 self-center">+{contact.tags.length - 3}</span>
                                                    )}
                                                </div>

                                                {/* Card Footer: Meta */}
                                                <div className="pt-3 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                                                    <div className="flex items-center gap-3">
                                                        {/* Source Badge (Icon Only) */}
                                                        {(() => {
                                                            // Logic STRICTLY based on channel field (Database must be consistent)
                                                            const channel = contact.channel?.toLowerCase() || '';

                                                            if (channel === 'whatsapp') {
                                                                return (
                                                                    <div title="Origem: WhatsApp" className="text-green-600 bg-green-500/10 p-1.5 rounded-md flex items-center justify-center">
                                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                                    </div>
                                                                );
                                                            } else if (channel === 'voice') {
                                                                return (
                                                                    <div title="Origem: Voz" className="text-purple-600 bg-purple-500/10 p-1.5 rounded-md flex items-center justify-center">
                                                                        <Mic className="h-3.5 w-3.5" />
                                                                    </div>
                                                                );
                                                            } else {
                                                                // Default to Web/Globe (embedded or others)
                                                                return (
                                                                    <div title="Origem: Web / Lead" className="text-blue-600 bg-blue-500/10 p-1.5 rounded-md flex items-center justify-center">
                                                                        <Globe className="h-3.5 w-3.5" />
                                                                    </div>
                                                                );
                                                            }
                                                        })()}

                                                        {contact.email && (
                                                            <div className="flex items-center gap-1.5">
                                                                <Mail className="h-3.5 w-3.5" />
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="h-3.5 w-3.5" />
                                                            <span className="leading-none pt-0.5">Ativado hj</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    {column.contacts.length === 0 && (
                                        <div className="h-32 border-2 border-dashed border-border/50 rounded-xl flex flex-col items-center justify-center text-muted-foreground p-4">
                                            <p className="text-xs font-medium text-center">Nenhum lead nesta etapa</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default LeadCRM;
