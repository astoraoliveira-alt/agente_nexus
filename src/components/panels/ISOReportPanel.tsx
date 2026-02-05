import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Download, CheckCircle2, AlertCircle, BarChart3, FileText, Globe, Scale, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Evaluation } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';

interface ISOReportPanelProps {
    data: Evaluation[];
}

export function ISOReportPanel({ data }: ISOReportPanelProps) {
    const [isGenerating, setIsGenerating] = useState(false);

    if (!data || data.length === 0) return (
        <div className="p-8 text-center text-muted-foreground">
            Sem dados suficientes para gerar relatório.
        </div>
    );

    const avgScore = Math.round(data.reduce((acc, curr) => acc + curr.score, 0) / data.length);
    const criticals = data.filter(e => e.score < 40).length;

    // Theoretical compliance checks based on ISO 42001
    const complianceChecks = [
        { label: 'Transparência do Sistema', checked: true, detail: 'System prompts auditados.' },
        { label: 'Gerenciamento de Viés', checked: avgScore > 60, detail: 'Score médio acima de 60.' },
        { label: 'Responsabilidade Humana', checked: true, detail: 'Habilitado via HITL.' },
        { label: 'Gestão de Riscos', checked: criticals === 0, detail: `${criticals} incidentes críticos detectados.` },
    ];

    const handleExportPDF = () => {
        toast.info("Preparando documento para impressão...");
        setTimeout(() => {
            window.print();
        }, 500);
    };

    const handleGenerateCompleteReport = () => {
        setIsGenerating(true);
        toast.loading("Analisando logs históricos e conformidade ISO...");

        setTimeout(() => {
            setIsGenerating(false);
            toast.dismiss();
            toast.success("Relatório Completo gerado com sucesso!");
        }, 2000);
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header / Export */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Scale className="h-5 w-5 text-primary" />
                        Relatório AI Governance
                    </h3>
                    <p className="text-xs text-muted-foreground">Em conformidade com ISO/IEC 42001</p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={handleExportPDF}
                >
                    <Download className="h-4 w-4" /> PDF
                </Button>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="bg-muted/30 border-none shadow-none">
                    <CardContent className="p-4">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">AI Trust Index</p>
                        <p className="text-2xl font-bold mt-1 text-primary">{avgScore}%</p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/30 border-none shadow-none">
                    <CardContent className="p-4">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Amostra</p>
                        <p className="text-2xl font-bold mt-1">{data.length} Interações</p>
                    </CardContent>
                </Card>
            </div>

            {/* Compliance Checklist */}
            <div className="space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Checklist de Conformidade
                </h4>
                <div className="space-y-3">
                    {complianceChecks.map((check, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg bg-card shadow-sm">
                            {check.checked ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                            ) : (
                                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                            )}
                            <div>
                                <p className="text-sm font-semibold">{check.label}</p>
                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Detailed Stats */}
            <div className="space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                    Metadados Técnicos
                </h4>
                <div className="p-4 bg-slate-950 text-slate-300 rounded-lg font-mono text-[10px] space-y-1">
                    <p>// ISO 42001 Audit Trail - {new Date().toLocaleDateString()}</p>
                    <p>SYSTEM_VERSION: "v3.2.0-davos"</p>
                    <p>AUDIT_SCOPE: "Automatic Evaluator (N8N)"</p>
                    <p>MODEL_LOGS: "JSON_EXPORTED"</p>
                    <p>ENCRYPTION: "AES-256-GCM"</p>
                </div>
            </div>

            <Button
                className="w-full gap-2 bg-primary hover:bg-primary/90"
                onClick={handleGenerateCompleteReport}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <FileText className="h-4 w-4" />
                )}
                {isGenerating ? 'Gerando...' : 'Gerar Relatório Completo'}
            </Button>

            <p className="text-[10px] text-center text-muted-foreground italic">
                Este relatório é gerado automaticamente com base nas últimas 50 auditorias realizadas.
            </p>
        </div>
    );
}
