
import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Agent } from '@/lib/types';
import { PoolUsageBar } from './PoolUsageBar';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';

interface ConsumptionSettingsProps {
    tenantId: string;
    planLimit: number; // e.g., 100.00
    allocationMode: 'flexible' | 'custom';
    agents: Agent[];
    onSave: (mode: 'flexible' | 'custom', agentShares: Record<string, number>) => Promise<void>;
}

export function ConsumptionSettings({
    tenantId,
    planLimit,
    allocationMode: initialMode,
    agents,
    onSave
}: ConsumptionSettingsProps) {
    const { toast } = useToast();
    const [mode, setMode] = useState<'flexible' | 'custom'>(initialMode);
    const [shares, setShares] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [consumptionData, setConsumptionData] = useState<Record<string, number>>({});
    const [companyUsage, setCompanyUsage] = useState(0);

    // Initialize shares based on agent config
    useEffect(() => {
        const initialShares: Record<string, number> = {};
        agents.forEach(agent => {
            // We read from the standardized brainConfig object
            const budgetPct = agent.brainConfig?.budget_share_pct || 0;
            initialShares[agent.id] = budgetPct;
        });
        setShares(initialShares);
    }, [agents]);

    // Calculate usage from agents prop (Consistency with Agent Cards)
    useEffect(() => {
        const usageMap: Record<string, number> = {};
        let total = 0;

        agents.forEach(agent => {
            const cost = agent.usage?.totalCost || 0;
            usageMap[agent.id] = cost;
            total += cost;
        });

        setConsumptionData(usageMap);
        setCompanyUsage(total);
    }, [agents]);

    const handleShareChange = (agentId: string, newValue: number) => {
        // Current total exclusive of this agent
        const otherAgentsTotal = Object.entries(shares)
            .filter(([key]) => key !== agentId)
            .reduce((sum, [_, val]) => sum + val, 0);

        // Validate max allowed
        // Ideally we allow user to slide, but show warning if total > 100
        setShares(prev => ({ ...prev, [agentId]: newValue }));
    };

    const totalShare = Object.values(shares).reduce((a, b) => a + b, 0);
    const isValid = totalShare <= 100;

    const handleSave = async () => {
        if (!isValid && mode === 'custom') {
            toast({
                title: "Configuração Inválida",
                description: "A soma das cotas não pode exceder 100%.",
                variant: "destructive"
            });
            return;
        }

        setLoading(true);
        try {
            await onSave(mode, shares);
            toast({
                title: "Configurações Salvas",
                description: "As regras de consumo foram atualizadas com sucesso.",
            });
        } catch (error) {
            toast({
                title: "Erro ao Salvar",
                description: "Não foi possível atualizar as configurações.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">

            {/* 1. Visualization */}
            <div className="kpi-card bg-muted/20">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    Consumo Atual (Tempo Real)
                </h3>
                <PoolUsageBar
                    totalLimit={planLimit}
                    companyUsage={companyUsage}
                    agents={agents}
                    agentUsages={consumptionData}
                />
            </div>

            {/* 2. Mode Configuration */}
            <div className="kpi-card space-y-6">
                <h3 className="font-semibold mb-4">Regras de Alocação</h3>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-card">
                    <div className="space-y-1">
                        <Label className="text-base">Modo Flexível (Pool Compartilhado)</Label>
                        <p className="text-sm text-muted-foreground">
                            Todos os agentes compartilham o limite total da empresa. Ideal para evitar microgerenciamento.
                        </p>
                    </div>
                    <Switch
                        checked={mode === 'flexible'}
                        onCheckedChange={(checked) => setMode(checked ? 'flexible' : 'custom')}
                    />
                </div>

                {!isValid && mode === 'custom' && (
                    <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Atenção: A soma das cotas está em {totalShare}% (Máximo 100%). Ajuste os sliders.
                    </div>
                )}

                {mode === 'custom' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-muted-foreground">Alocação por Agente</span>
                            <span className={isValid ? "text-green-600" : "text-destructive"}>
                                Total Alocado: {totalShare}%
                            </span>
                        </div>

                        {agents.map(agent => (
                            <div key={agent.id} className="grid grid-cols-[200px_1fr_60px] gap-4 items-center">
                                <div>
                                    <p className="font-medium truncate">{agent.name}</p>
                                    <p className="text-xs text-muted-foreground">R$ {((shares[agent.id] || 0) / 100 * planLimit).toFixed(2)}</p>
                                </div>
                                <Slider
                                    value={[shares[agent.id] || 0]}
                                    max={100}
                                    step={5}
                                    onValueChange={(vals) => handleShareChange(agent.id, vals[0])}
                                    className={!isValid ? "[&>.bg-primary]:bg-destructive" : ""}
                                />
                                <div className="text-right font-mono text-sm">
                                    {shares[agent.id] || 0}%
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 border-t border-border flex justify-end">
                    <Button
                        onClick={handleSave}
                        disabled={loading || (mode === 'custom' && !isValid)}
                        className="gap-2"
                    >
                        {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        Salvar Regras
                    </Button>
                </div>
            </div>
        </div>
    );
}
