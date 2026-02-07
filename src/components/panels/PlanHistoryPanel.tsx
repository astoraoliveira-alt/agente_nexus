
import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { PlanCatalog } from '@/lib/types';
import { History, Calendar, User, ArrowRight, Loader2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface PlanHistoryPanelProps {
    plan: PlanCatalog;
}

const FIELD_LABELS: Record<string, string> = {
    'name': 'Nome do Plano',
    'type': 'Tipo de Faturamento',
    'description': 'Descrição Publica',
    'base_price': 'Mensalidade Base',
    'monthly_fee_covers_usage': 'Mensalidade Abatida',
    'llm_token_price': 'Preço 1k Tokens',
    'message_price': 'Preço Mensagem',
    'stt_minute_price': 'Preço Minuto Voz',
    'tts_minute_price': 'Preço Minuto Voz (TTS)',
    'default_limits.llmTokens': 'Limite de Tokens',
    'default_limits.messages': 'Limite de Mensagens',
    'default_limits.sttMinutes': 'Limite de Voz',
    'default_limits.ttsMinutes': 'Limite de Voz (TTS)',
    'default_limits.agents': 'Limite de Agentes',
    'default_limits.users': 'Limite de Usuários',
};

export function PlanHistoryPanel({ plan }: PlanHistoryPanelProps) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (plan?.id) {
            setLoading(true);
            api.getPlanAuditLogs(plan.id)
                .then(setLogs)
                .finally(() => setLoading(false));
        }
    }, [plan?.id]);

    const getDiff = (oldObj: any, newObj: any, prefix = ''): { key: string; oldVal: any; newVal: any }[] => {
        const changes: { key: string; oldVal: any; newVal: any }[] = [];
        const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

        allKeys.forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const oldVal = oldObj?.[key];
            const newVal = newObj?.[key];

            // Ignore tech updates like updated_at
            if (key === 'updated_at') return;

            if (typeof oldVal === 'object' && oldVal !== null && typeof newVal === 'object' && newVal !== null) {
                changes.push(...getDiff(oldVal, newVal, fullKey));
            } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                changes.push({ key: fullKey, oldVal: oldVal ?? 'N/A', newVal: newVal ?? 'N/A' });
            }
        });

        return changes;
    };

    const formatValue = (key: string, val: any) => {
        if (val === 'N/A') return <span className="text-muted-foreground italic">vazio</span>;
        if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
        if (key.includes('price') || key === 'base_price') {
            return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }
        return val.toString();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 text-accent animate-spin" />
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="p-12 text-center">
                <div className="w-16 h-16 bg-muted flex items-center justify-center mx-auto mb-4 rounded-full">
                    <History className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">Sem histórico</h3>
                <p className="text-sm text-muted-foreground mt-2">
                    Nenhuma alteração foi registrada para este plano ainda.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="space-y-1">
                <h3 className="font-bold text-xl">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">Linha do tempo de alterações contratuais</p>
            </div>

            <Separator />

            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-border before:via-border/50 before:to-transparent">
                {logs.map((log) => {
                    const diffs = getDiff(log.old_state, log.new_state);

                    return (
                        <div key={log.id} className="relative flex items-start gap-6 pl-2">
                            {/* Dot */}
                            <div className="absolute left-3.5 mt-1.5 w-3.5 h-3.5 rounded-full border-2 border-background bg-accent shadow-sm" />

                            <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs font-medium text-muted-foreground">
                                            {new Date(log.changed_at).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <User className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs font-semibold">Admin</span>
                                    </div>
                                </div>

                                <div className="kpi-card bg-muted/30 border border-border p-4 rounded-md">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-accent uppercase tracking-tighter">
                                                {diffs.length === 0 ? 'Registro de Estado' : 'Alterações Detectadas'}
                                            </p>
                                            <Badge variant="outline" className="h-4 text-[8px] opacity-70">
                                                ID: {log.id.split('-')[0]}
                                            </Badge>
                                        </div>

                                        {diffs.length > 0 ? (
                                            <div className="space-y-2">
                                                {diffs.map((diff, idx) => (
                                                    <div key={idx} className="flex flex-col gap-1 p-2 bg-background border border-border rounded-sm">
                                                        <span className="text-[10px] text-muted-foreground font-bold uppercase">
                                                            {FIELD_LABELS[diff.key] || diff.key}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className="text-muted-foreground line-through">
                                                                {formatValue(diff.key, diff.oldVal)}
                                                            </span>
                                                            <ArrowRight className="h-3 w-3 text-accent" />
                                                            <span className="font-bold text-accent">
                                                                {formatValue(diff.key, diff.newVal)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 border border-dashed border-border rounded-sm">
                                                <Info className="h-3 w-3" />
                                                <span>Audit Trail: Captura de estado inicial ou alteração técnica.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
