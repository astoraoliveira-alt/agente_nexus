import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Globe, Server, Activity, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface HealthCheck {
    service: string;
    status: 'healthy' | 'degraded' | 'down';
    latency: number;
    region: string;
    url?: string;
}

interface SystemStatusData {
    timestamp: string;
    source_region: string;
    checks: HealthCheck[];
}

export default function SystemStatus() {
    const [data, setData] = useState<SystemStatusData | null>(null);
    const [loading, setLoading] = useState(false);
    const [browserLatency, setBrowserLatency] = useState<{ v: number; s: number; o: number; w: number } | null>(null);

    const checkBrowserLatency = async () => {
        const startV = performance.now();
        await fetch('/robots.txt', { method: 'HEAD', cache: 'no-store' }).catch(() => { });
        const endV = performance.now();

        const startS = performance.now();
        await supabase.from('users').select('count', { count: 'exact', head: true });
        const endS = performance.now();

        const startO = performance.now();
        await fetch('https://api.openai.com/v1/models', { mode: 'no-cors' }).catch(() => { });
        const endO = performance.now();

        const startW = performance.now();
        await fetch('https://n8n.io', { mode: 'no-cors' }).catch(() => { });
        const endW = performance.now();

        setBrowserLatency({
            v: Math.round(endV - startV),
            s: Math.round(endS - startS),
            o: Math.round(endO - startO),
            w: Math.round(endW - startW)
        });
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            checkBrowserLatency();

            // Call Vercel Serverless Function (Primary for Vercel->Origin checks)
            try {
                const response = await fetch('/api/check-latency');
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }
                const result = await response.json();
                setData(result);
            } catch (vercelError) {
                console.warn("Vercel API failed (expected in local dev without 'vercel dev'):", vercelError);

                // Fallback: Try Supabase Edge Function if Vercel fails
                console.log("Falling back to Supabase Edge Function...");
                const { data: result, error } = await supabase.functions.invoke('check-health');

                if (error) {
                    console.warn("Backend check failed (likely not deployed):", error);
                    setData(null);
                } else {
                    setData(result);
                }
            }
        } catch (err) {
            console.error("Critical failure in status check:", err);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getStatusColor = (status: string, latency: number) => {
        if (status === 'down') return 'bg-destructive/10 text-destructive border-destructive/20';
        if (status === 'degraded' || latency > 500) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    };

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Status do Sistema</h3>
                    <p className="text-sm text-muted-foreground">Monitoramento de latência e integridade da infraestrutura distribuída.</p>
                </div>
                <Button onClick={fetchData} disabled={loading} variant="outline" className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* LADO DO CLIENTE (Browser) */}
                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Globe className="h-5 w-5 text-blue-500" />
                            Perspectiva do Usuário (Browser)
                        </CardTitle>
                        <CardDescription>Latência da sua conexão até os servidores principais.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <div className="h-8 min-w-[2rem] px-2 rounded-full bg-background flex items-center justify-center border text-[10px] font-bold">Usuário</div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm">Application Server</span>
                                    <span className="text-xs text-muted-foreground">Frontend / CDN</span>
                                </div>
                            </div>
                            <Badge variant="outline" className={`${browserLatency ? getStatusColor('healthy', browserLatency.v) : ''} text-sm font-mono`}>
                                {browserLatency ? `${browserLatency.v}ms` : '...'}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <div className="h-8 min-w-[2rem] px-2 rounded-full bg-background flex items-center justify-center border text-[10px] font-bold">Usuário</div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm">Database Connection</span>
                                    <span className="text-xs text-muted-foreground">AWS | us-west-2</span>
                                </div>
                            </div>
                            <Badge variant="outline" className={`${browserLatency ? getStatusColor('healthy', browserLatency.s) : ''} text-sm font-mono`}>
                                {browserLatency ? `${browserLatency.s}ms` : '...'}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <div className="h-8 min-w-[2rem] px-2 rounded-full bg-background flex items-center justify-center border text-[10px] font-bold">Usuário</div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm">Workflow Engine</span>
                                    <span className="text-xs text-muted-foreground">N8N Cloud</span>
                                </div>
                            </div>
                            <Badge variant="outline" className={`${browserLatency ? getStatusColor('healthy', browserLatency.w) : ''} text-sm font-mono`}>
                                {browserLatency ? `${browserLatency.w}ms` : '...'}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <div className="h-8 min-w-[2rem] px-2 rounded-full bg-background flex items-center justify-center border text-[10px] font-bold">Usuário</div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm">LLMs (OpenAI)</span>
                                    <span className="text-xs text-muted-foreground">GPT-4 Turbo</span>
                                </div>
                            </div>
                            <Badge variant="outline" className={`${browserLatency ? getStatusColor('healthy', browserLatency.o) : ''} text-sm font-mono`}>
                                {browserLatency ? `${browserLatency.o}ms` : '...'}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* LADO DO SERVIDOR (Backend) */}
                <Card className="border-l-4 border-l-purple-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Server className="h-5 w-5 text-purple-500" />
                            Perspectiva do Backend (Supabase)
                        </CardTitle>
                        <CardDescription>Latência entre servidores (Server-to-Server).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="flex flex-col gap-2 items-center justify-center py-8 text-muted-foreground">
                                <Activity className="h-8 w-8 animate-pulse" />
                                <span className="text-xs">Pingando serviços...</span>
                            </div>
                        ) : !data ? (
                            <div className="flex flex-col gap-2 items-center justify-center py-8 text-muted-foreground/50">
                                <Server className="h-8 w-8 opacity-20" />
                                <span className="text-xs text-center">
                                    Backend Status Indisponível<br />
                                    (Edge Function não implantada)
                                </span>
                            </div>
                        ) : (
                            data?.checks.map((check, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{check.service}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{check.region}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-mono font-medium ${check.latency > 1000 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                            {check.status === 'down' ? 'OFFLINE' : `${check.latency}ms`}
                                        </span>
                                        <div className={`h-2.5 w-2.5 rounded-full ${check.status === 'healthy' ? 'bg-emerald-500' : 'bg-destructive'}`}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
