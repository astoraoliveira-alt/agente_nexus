import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
    ShieldCheck,
    AlertTriangle,
    Bot,
    ThumbsUp,
    ThumbsDown,
    TrendingUp,
    Activity,
    Search,
    Filter,
    BarChart,
    Loader2
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Quality = () => {
    const { currentTenant, openSlideOver } = useApp();

    const { data: evaluations, isLoading } = useQuery({
        queryKey: ['evaluations', currentTenant?.id],
        queryFn: () => currentTenant ? api.getEvaluations(currentTenant.id) : Promise.resolve([]),
        enabled: !!currentTenant
    });

    const { data: unauditedConversations, isLoading: isLoadingUnaudited } = useQuery({
        queryKey: ['unaudited-conversations', currentTenant?.id],
        queryFn: () => currentTenant ? api.getUnauditedConversations(currentTenant.id) : Promise.resolve([]),
        enabled: !!currentTenant
    });

    const [filterScore, setFilterScore] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEvaluations = evaluations?.filter(e => {
        const matchesScore = filterScore ? e.score >= filterScore : true;
        const matchesSearch = searchTerm ?
            e.agentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.summary.toLowerCase().includes(searchTerm.toLowerCase()) : true;
        return matchesScore && matchesSearch;
    }) || [];

    // KPI Calculations
    const averageScore = filteredEvaluations.length
        ? Math.round(filteredEvaluations.reduce((acc, curr) => acc + curr.score, 0) / filteredEvaluations.length)
        : 0;

    const criticalIncidents = filteredEvaluations.filter(e => e.score < 40).length || 0;

    // Audit Coverage Calculation
    const totalClosed = (filteredEvaluations.length || 0) + (unauditedConversations?.length || 0);
    const auditCoverage = totalClosed > 0
        ? Math.round((filteredEvaluations.length / totalClosed) * 100)
        : 100;

    return (
        <MainLayout>
            <div className="p-8 space-y-8 animate-in fade-in duration-500 h-full overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
                            <ShieldCheck className="h-8 w-8 text-primary" />
                            Qualidade & Governança da IA
                        </h1>
                        <p className="text-muted-foreground">Monitore a performance, ética e segurança dos seus agentes automáticos (ISO 42001).</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filtrar por agente ou resumo..."
                                className="pl-9 w-[300px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button
                            variant={filterScore === 70 ? "default" : "outline"}
                            className="gap-2"
                            onClick={() => setFilterScore(filterScore === 70 ? null : 70)}
                        >
                            <Filter className="h-4 w-4" /> {filterScore === 70 ? "Score >= 70" : "Filtrar Score"}
                        </Button>
                        <Button className="gap-2" onClick={() => openSlideOver('iso-report', evaluations)}>
                            <Activity className="h-4 w-4" /> Gerar Relatório ISO
                        </Button>
                    </div>
                </div>

                {/* KPI Grid */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">AI Trust Score (Média)</CardTitle>
                            <TrendingUp className={averageScore > 70 ? "h-4 w-4 text-green-500" : "h-4 w-4 text-yellow-500"} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{averageScore}/100</div>
                            <Progress value={averageScore} className="h-2 mt-2" />
                            <p className="text-xs text-muted-foreground mt-2">
                                Baseado em {evaluations?.length || 0} auditorias
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Incidentes Críticos</CardTitle>
                            <AlertTriangle className={criticalIncidents > 0 ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-destructive">{criticalIncidents}</div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Conversas com score &lt; 40 (Risco de Alucinação)
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Cobertura de Auditoria</CardTitle>
                            <ShieldCheck className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{auditCoverage}%</div>
                            <p className="text-xs text-muted-foreground mt-2">
                                {unauditedConversations?.length || 0} pendentes de análise.
                            </p>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer hover:bg-muted/50 transition-colors border-l-4 border-l-amber-500"
                        onClick={() => openSlideOver('unaudited-list', unauditedConversations)}
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Auditoria Pendente</CardTitle>
                            <Activity className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-600">{unauditedConversations?.length || 0}</div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Conversas fechadas sem avaliação. Clique para ver.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                    {/* Recent Evaluations Table */}
                    <Card className="col-span-4">
                        <CardHeader>
                            <CardTitle>Últimas Auditorias</CardTitle>
                            <CardDescription>Avaliações realizadas automaticamente pelo N8N após o fechamento do chat.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : !evaluations || evaluations.length === 0 ? (
                                <div className="text-center p-8 text-muted-foreground">
                                    Nenhuma auditoria encontrada.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Agente</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead>Resumo</TableHead>
                                            <TableHead>Tags</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredEvaluations.map((evaluation) => (
                                            <TableRow
                                                key={evaluation.id}
                                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                onClick={() => openSlideOver('evaluation-details', evaluation)}
                                            >
                                                <TableCell className="font-medium flex items-center gap-2">
                                                    <Bot className="h-4 w-4 text-muted-foreground" />
                                                    <div className="flex flex-col">
                                                        <span>{evaluation.agentName || 'Agente'}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {formatDistanceToNow(new Date(evaluation.createdAt), { addSuffix: true, locale: ptBR })}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={evaluation.score >= 70 ? 'default' : evaluation.score >= 40 ? 'secondary' : 'destructive'}>
                                                        {evaluation.score}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-[200px] truncate" title={evaluation.summary}>
                                                    {evaluation.summary}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {evaluation.tags?.slice(0, 2).map(tag => (
                                                            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                                                        ))}
                                                        {evaluation.tags && evaluation.tags.length > 2 && (
                                                            <Badge variant="outline" className="text-[10px]">+</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Quality Insights / Hall of Shame */}
                    <Card className="col-span-3">
                        <CardHeader>
                            <CardTitle>Hall of Shame (Atenção)</CardTitle>
                            <CardDescription>Conversas que exigem revisão humana imediata.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                            {isLoading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <>
                                    {evaluations?.filter(e => e.score < 50).map((evaluation) => (
                                        <div
                                            key={evaluation.id}
                                            className="flex items-start gap-4 p-3 border rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors cursor-pointer"
                                            onClick={() => openSlideOver('evaluation-details', evaluation)}
                                        >
                                            <div className="mt-1">
                                                <ThumbsDown className="h-5 w-5 text-destructive" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center w-full">
                                                    <p className="font-semibold text-sm">{evaluation.agentName || 'Agente'}</p>
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatDistanceToNow(new Date(evaluation.createdAt), { addSuffix: true, locale: ptBR })}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{evaluation.summary}</p>
                                                <div className="mt-2 flex gap-2">
                                                    <Badge variant="destructive" className="text-[10px]">Score: {evaluation.score}</Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!evaluations || evaluations.filter(e => e.score < 50).length === 0) && (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <ThumbsUp className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                            <p>Tudo certo! Nenhuma conversa crítica detectada.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    );
};

export default Quality;
