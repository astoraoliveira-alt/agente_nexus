import { User, Phone, Mail, Globe, Calendar, Tag, ShieldCheck, MapPin, Activity } from 'lucide-react';
import { Contact } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ContactDetailsPanelProps {
    data: Contact;
}

export function ContactDetailsPanel({ data }: ContactDetailsPanelProps) {
    if (!data) return null;

    return (
        <div className="h-full flex flex-col p-6 space-y-8">
            {/* Header Info */}
            <div className="flex flex-col items-center text-center space-y-4">
                <Avatar className="h-24 w-24 border-4 border-muted">
                    <AvatarImage src={data.avatarUrl} />
                    <AvatarFallback className="bg-muted text-2xl font-bold text-muted-foreground">
                        {data.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="text-xl font-bold">{data.name}</h3>
                    <div className="flex items-center justify-center gap-2 mt-1">
                        <Badge variant="secondary" className="bg-accent/10 text-accent-foreground border-accent/20">
                            {
                                ['sql', 'SQL', 'Lead Quente'].includes(data.lifecycleStatus || '') ? 'Lead Quente' :
                                    ['mql', 'MQL', 'Interesse Médio'].includes(data.lifecycleStatus || '') ? 'Interesse Médio' :
                                        ['lead', 'Lead', 'Interesse Baixo'].includes(data.lifecycleStatus || '') ? 'Lead' :
                                            (data.lifecycleStatus || 'Lead')
                            }
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight">
                            {data.channel || 'Direct'}
                        </Badge>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Contact Details */}
            <div className="space-y-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informações de Contato</h4>
                <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Telefone / Identificador</p>
                            <p className="text-sm font-medium">{data.identifier}</p>
                        </div>
                    </div>

                    {data.email && (
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-lg">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Email</p>
                                <p className="text-sm font-medium">{data.email}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Criado em</p>
                            <p className="text-sm font-medium">
                                {format(new Date(data.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Tags Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tags & Interesses</h4>
                    <Tag className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-wrap gap-2">
                    {data.tags && data.tags.length > 0 ? (
                        data.tags.map((tag, i) => (
                            <Badge key={i} variant="outline" className="bg-accent/5 text-accent border-accent/20">
                                #{tag}
                            </Badge>
                        ))
                    ) : (
                        <p className="text-xs text-muted-foreground italic">Nenhuma tag atribuída.</p>
                    )}
                </div>
            </div>

            <Separator />

            {/* Simulated Activity / Extra Info */}
            <div className="space-y-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-green-600 flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Qualidade & Auditoria
                </h4>
                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-medium">Potencial de Recompra</span>
                        <span className="text-xs font-bold text-success">85%</span>
                    </div>
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div className="bg-success h-full w-[85%]" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3 italic">
                        Lead identificado como recorrente com alto engajamento em campanhas de WhatsApp.
                    </p>
                </div>
            </div>

            {/* Meta Info */}
            <div className="mt-auto pt-8 flex items-center justify-center gap-4 text-[10px] text-muted-foreground font-mono">
                <span>ID: {data.id}</span>
                <span>•</span>
                <span>Módulo LeadIntel v2.4</span>
            </div>
        </div>
    );
}
