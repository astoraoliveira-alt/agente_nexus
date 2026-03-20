
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, QrCode, Wifi, WifiOff, RefreshCw, LogOut, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

import { porteiro } from '@/services/porteiro.service';

interface AgentEvolutionTabProps {
    agentId: string;
    tenantSlug: string;
    evolutionInstance?: string; // Current instance name if attached
    evolutionToken?: string; // New field for instance-specific token
    webhookUrl?: string; // Current webhook URL from agent config
    onInstanceLinked: (instanceName: string, token?: string) => void;
    onWebhookUrlChange: (url: string) => void;
}

export function AgentEvolutionTab({ agentId, tenantSlug, evolutionInstance, evolutionToken, webhookUrl, onInstanceLinked, onWebhookUrlChange }: AgentEvolutionTabProps) {
    const [loading, setLoading] = useState(false);
    const [instanceName, setInstanceName] = useState(evolutionInstance || `${tenantSlug}-${agentId}`.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [status, setStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
    const [connectionData, setConnectionData] = useState<any>(null);

    useEffect(() => {
        console.log('AgentEvolutionTab Mounted', { agentId, tenantSlug, evolutionInstance });
        if (evolutionInstance) {
            checkStatus(evolutionInstance, false);
        }
    }, [evolutionInstance]);

    const callEvolutionManager = async (action: string, payload: any = {}) => {
        try {
            let endpoint = '';
            let method: 'GET' | 'POST' | 'DELETE' = 'GET';
            let body: any = null;

            // Map actions to endpoints (logic moved to Gateway proxy)
            switch (action) {
                case 'create-instance':
                    endpoint = `/instance/create`;
                    method = 'POST';
                    body = {
                        instanceName: payload.instanceName,
                        token: crypto.randomUUID(),
                        qrcode: true,
                        integration: "WHATSAPP-BAILEYS",
                        webhook_by_events: false,
                        webhook: {
                            enabled: true,
                            url: payload.webhookUrl,
                            by_events: false,
                            base64: true,
                            events: ["MESSAGES_UPSERT"]
                        }
                    };
                    break;
                case 'connect':
                    endpoint = `/instance/connect/${payload.instanceName}`;
                    method = 'GET';
                    break;
                case 'status':
                    endpoint = `/instance/connectionState/${payload.instanceName}`;
                    method = 'GET';
                    break;
                case 'logout':
                    endpoint = `/instance/logout/${payload.instanceName}`;
                    method = 'DELETE';
                    break;
                default:
                    throw new Error(`Ação inválida: ${action}`);
            }

            console.log(`[Gateway Proxy] Requesting ${action} via Porteiro...`);

            const data = await porteiro.proxyEvolution(endpoint, method, body);

            // Handle "soft" errors like instance not found
            if (data?.error && !data?.instance) {
                // Return a state that the UI can interpret as disconnected
                if (action === 'status') {
                    return { instance: { state: 'close' } };
                }
                throw new Error(data.error);
            }

            return data;

        } catch (error: any) {
            console.error(`Porteiro Error (${action}):`, error);

            toast.error('Porteiro: Erro na Integração', {
                description: error.message || 'Falha ao comunicar com o Gateway Seguro',
            });
            return null;
        }
    };

    const createInstance = async () => {
        if (!webhookUrl) {
            toast.error('Webhook URL obrigatório', { description: 'Informe para onde a Evolution deve enviar as mensagens.' });
            return;
        }
        setLoading(true);
        const data = await callEvolutionManager('create-instance', { instanceName, webhookUrl });
        if (data) {
            // Evolution returns existing instance info if it already exists, or new one
            // If it has a QR code (base64) or token, we proceed
            if (data.qrcode?.base64) {
                setQrCode(ensureBase64Prefix(data.qrcode.base64));
                setStatus('CONNECTING');
                toast.success('Instância Criada', { description: 'Escaneie o QR Code para conectar.' });
                startPolling();
            } else if (data.instance?.status === 'open' || data.instance?.state === 'open') {
                // Already connected?
                checkStatus(instanceName);
            } else {
                // Standard creation success, fetch QR separately
                toast.success('Instância Criada', { description: 'Gerando QR Code...' });
                fetchQrCode();
            }
        }
        setLoading(false);
    };

    const ensureBase64Prefix = (base64: string) => {
        if (base64 && !base64.startsWith('data:image')) {
            return `data:image/png;base64,${base64}`;
        }
        return base64;
    };

    const startPolling = () => {
        // Polling eliminated as per Phase 2 hygiene rules. 
        // We now rely on 'checkStatus' manual refresh or a future Realtime integration if Evolution API supports it.
        toast.info('Aguardando conexão...', { description: 'Escaneie o QR Code e clique em Verificar Status.', duration: 5000 });
    };

    const fetchQrCode = async () => {
        setLoading(true);
        const data = await callEvolutionManager('connect', { instanceName });
        if (data) {
            const qrcodeBase64 = data.base64 || data.qrcode?.base64;
            if (qrcodeBase64) {
                setQrCode(ensureBase64Prefix(qrcodeBase64));
                setStatus('CONNECTING');
                startPolling();
            } else if (data.instance?.state === 'open' || data.instance?.status === 'open') {
                setStatus('CONNECTED');
                onInstanceLinked(instanceName);
            }
        }
        setLoading(false);
    };

    const checkStatus = async (infoInstance: string, showToast = true) => {
        const data = await callEvolutionManager('status', { instanceName: infoInstance });
        if (data) {
            // Accessing state usually in data.instance.state or similar
            const state = data.instance?.state || data.instance?.status || 'close';

            if (state === 'open') {
                setStatus('CONNECTED');
                setConnectionData(data.instance);
                if (showToast) toast.success('Conectado', { description: 'WhatsApp Business Ativo.' });
                onInstanceLinked(infoInstance);
            } else {
                setStatus('DISCONNECTED');
            }
            return data;
        }
        return null;
    };

    const logoutIndex = async () => {
        if (!confirm('Deseja realmente desconectar este WhatsApp?')) return;

        setLoading(true);
        await callEvolutionManager('logout', { instanceName });
        setStatus('DISCONNECTED');
        setConnectionData(null);
        setQrCode(null);
        setLoading(false);
        toast.info('Desconectado');
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                WhatsApp (Evolution API)
                                {status === 'CONNECTED' ? (
                                    <Badge className="bg-green-500 hover:bg-green-600">Online</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-muted-foreground">Offline</Badge>
                                )}
                            </CardTitle>
                            <CardDescription>
                                Gerencie a conexão deste agente com o WhatsApp Business.
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => checkStatus(instanceName)} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Verificar Status
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Instance Name - Always visible at top for clarity */}
                    <div className="space-y-2 pb-4 border-b border-border/50">
                        <Label htmlFor="instanceName" className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
                            Nome da Instância na Evolution API
                            <Badge variant="outline" className="h-4 text-[9px] font-normal uppercase">Identificador Único</Badge>
                        </Label>
                        <Input
                            id="instanceName"
                            value={instanceName}
                            onChange={(e) => setInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            disabled={status === 'CONNECTED' || loading || !!qrCode}
                            placeholder="ex: empresa-vendas-zap"
                            className="font-mono bg-muted/30 border-accent/10 focus:border-accent"
                        />
                        <p className="text-[10px] text-muted-foreground italic">
                            {status === 'CONNECTED'
                                ? "Conexão ativa. Para mudar o nome, desconecte a instância primeiro."
                                : "Escolha um nome amigável (apenas letras, números e traços)."}
                        </p>
                    </div>

                    {/* Webhook URL Input */}
                    <div className="space-y-2 pb-4">
                        <Label htmlFor="webhookUrl" className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
                            Webhook URL (n8n/Backend)
                            <Badge variant="secondary" className="h-4 text-[9px] font-normal uppercase">Destino das Mensagens</Badge>
                        </Label>
                        <Input
                            id="webhookUrl"
                            value={webhookUrl || ''}
                            onChange={(e) => onWebhookUrlChange(e.target.value)}
                            disabled={status === 'CONNECTED' || loading || !!qrCode}
                            placeholder="https://n8n.seuservidor.com/webhook/..."
                            className="bg-muted/30 border-accent/10 focus:border-accent"
                        />
                        <p className="text-[10px] text-muted-foreground italic">
                            O agente enviará as mensagens recebidas para este endereço automaticamente.
                        </p>
                    </div>

                    {status === 'DISCONNECTED' && !qrCode ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg bg-muted/5">
                            {(!evolutionInstance || instanceName !== evolutionInstance) ? (
                                <>
                                    <MessageSquare className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                                    <h3 className="text-lg font-medium">Nova Conexão Identificada</h3>
                                    <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                                        O nome "<strong>{instanceName}</strong>" ainda não está vinculado. Deseja criar e conectar este número?
                                    </p>
                                    <Button onClick={createInstance} disabled={loading} className="w-full max-w-sm bg-accent hover:bg-accent/90">
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                        Criar & Gerar QR Code
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                                    <h3 className="text-lg font-medium">Instância Desconectada</h3>
                                    <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                                        A instância <strong>{evolutionInstance}</strong> existe mas o WhatsApp não está pareado.
                                    </p>
                                    <Button onClick={fetchQrCode} disabled={loading} className="w-full max-w-sm">
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                                        Conectar Dispositivo
                                    </Button>
                                </>
                            )}
                        </div>
                    ) : qrCode ? (
                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-accent/5 border-accent/20 animate-in zoom-in-95">
                            <div className="text-center mb-6">
                                <h3 className="text-lg font-bold text-accent italic">Davos Nexus Gatekeeper</h3>
                                <p className="text-xs text-muted-foreground">Escaneie para ativar o Agente: <strong>{instanceName}</strong></p>
                            </div>

                            <div className="relative group p-4 bg-white rounded-xl shadow-xl border-4 border-white mb-6">
                                <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                                {loading && (
                                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
                                        <Loader2 className="h-10 w-10 animate-spin text-accent" />
                                    </div>
                                )}
                            </div>

                            <div className="text-xs text-muted-foreground space-y-2 text-center max-w-xs mb-6 bg-white/50 p-3 rounded-lg border border-accent/10">
                                <p className="font-semibold text-accent/80">Passo a passo no celular:</p>
                                <p>1. Abra o WhatsApp {'>'} Configurações</p>
                                <p>2. Clique em <strong>Aparelhos Conectados</strong></p>
                                <p>3. Clique em <strong>Conectar um Aparelho</strong></p>
                            </div>

                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => { setQrCode(null); setLoading(false); }}>
                                Cancelar e Voltar
                            </Button>
                        </div>
                    ) : status === 'CONNECTED' && (
                        <div className="flex items-center justify-between p-6 border rounded-xl bg-green-500/5 border-green-500/20 shadow-sm animate-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-5">
                                <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                                    <Wifi className="h-7 w-7" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-green-700 dark:text-green-400">Conexão Estabelecida</h4>
                                        <Badge className="bg-green-500 h-4 text-[9px] uppercase">Online</Badge>
                                    </div>
                                    <p className="text-sm font-mono text-green-600 dark:text-green-500 mt-1">
                                        {connectionData?.ownerJid || instanceName}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" className="border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-none" onClick={logoutIndex} disabled={loading}>
                                <LogOut className="h-4 w-4 mr-2" />
                                Desconectar
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
