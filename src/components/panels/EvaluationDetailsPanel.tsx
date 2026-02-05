import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Evaluation } from '@/lib/types';
import { Bot, Calendar, Tag, FileText, BarChart3, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EvaluationDetailsPanelProps {
    data: Evaluation;
}

export function EvaluationDetailsPanel({ data }: EvaluationDetailsPanelProps) {
    if (!data) return null;

    const criteria = [
        { label: 'Empatia & Tom de Voz', value: data.criteriaResults.empathy, color: 'bg-blue-500' },
        { label: 'Eficiência de Resolução', value: data.criteriaResults.efficiency, color: 'bg-green-500' },
        { label: 'Conformidade (Compliance)', value: data.criteriaResults.compliance, color: 'bg-orange-500' },
    ];

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="p-6 space-y-8">
                {/* Header Store */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Bot className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-none">{data.agentName || 'Agente de IA'}</h3>
                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(data.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-black text-primary">{data.score}</div>
                        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Score Geral</div>
                    </div>
                </div>

                <Separator />

                {/* AI Summary */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        Resumo do Auditor
                    </div>
                    <div className="p-4 rounded-xl bg-muted/30 border border-border italic text-sm leading-relaxed text-foreground/80">
                        "{data.summary}"
                    </div>
                </div>

                {/* Scorecard */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        <BarChart3 className="h-4 w-4" />
                        Scorecard Detalhado
                    </div>
                    <div className="space-y-4">
                        {criteria.map((c) => (
                            <div key={c.label} className="space-y-1.5">
                                <div className="flex justify-between text-xs font-medium px-0.5">
                                    <span>{c.label}</span>
                                    <span className="font-bold">{c.value}/5</span>
                                </div>
                                <Progress value={(c.value / 5) * 100} className="h-1.5" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tags */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        <Tag className="h-4 w-4" />
                        Tags de Classificação
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {data.tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider border-primary/10">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Governance Info */}
                <div className="p-4 rounded-xl border border-primary/10 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest">
                        <ShieldCheck className="h-4 w-4" />
                        Conformidade ISO 42001
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                        Esta auditoria foi gerada automaticamente pelo modelo <span className="text-foreground font-semibold">{data.aiModel || 'GPT-4o'}</span> baseada em critérios éticos e técnicos de IA.
                    </p>
                </div>
            </div>
        </div>
    );
}
