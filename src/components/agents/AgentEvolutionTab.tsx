
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, QrCode, Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface AgentEvolutionTabProps {
    agentId: string;
    tenantSlug: string;
    evolutionInstance?: string; // Current instance name if attached
    evolutionToken?: string; // New field for instance-specific token
    onInstanceLinked: (instanceName: string, token?: string) => void;
}

export function AgentEvolutionTab({ agentId, tenantSlug, evolutionInstance, evolutionToken, onInstanceLinked }: AgentEvolutionTabProps) {
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
            // Option 2: Direct Client-Side Fetch (Bypasses Edge Function SSL limit)
            // Use Vite proxy in development to bypass ERR_CERT_AUTHORITY_INVALID
            const baseUrl = import.meta.env.DEV ? '/evolution-api' : import.meta.env.VITE_EVOLUTION_API_URL;
            const apiKey = import.meta.env.VITE_EVOLUTION_API_KEY;

            if (!import.meta.env.VITE_EVOLUTION_API_URL || !apiKey) {
                throw new Error('Evolution API não configurada no .env.local (VITE_EVOLUTION_...)');
            }

            let endpoint = '';
            let method = 'GET';
            let body = null;

            // Map actions to endpoints (logic moved from Edge Function to Client)
            switch (action) {
                case 'create-instance':
                    endpoint = `/instance/create`;
                    method = 'POST';
                    body = {
                        instanceName: payload.instanceName,
                        token: crypto.randomUUID(),
                        qrcode: true,
                        integration: "WHATSAPP-BAILEYS"
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
                    throw new Error(`Invalid action: ${action}`);
            }

            console.log(`[Client] Fetching ${baseUrl}${endpoint} (${method})`);

            const response = await fetch(`${baseUrl}${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                },
                body: body ? JSON.stringify(body) : null
            });

            // Handle network errors or server errors
            if (!response.ok) {
                // If 404/400 (disconnected), treat as success with error payload
                if ([400, 401, 404].includes(response.status)) {
                    return {
                        instance: { state: 'close', status: response.status },
                        error: `Instance disconnected or not found (${response.status})`
                    };
                }
                const text = await response.text();
                throw new Error(`API Error ${response.status}: ${text}`);
            }

            const data = await response.json();

            // If it's a "soft" error like instance not found, we return data so UI can show disconnected state
            if (data?.error && !data?.instance) throw new Error(data.error);

            return data;

        } catch (error: any) {
            console.error(`Evolution Error (${action}):`, error);

            // Check for potential SSL/CORS blockers
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                toast.error('Erro de Conexão (SSL/CORS)', {
                    description: (
                        <div className="flex flex-col gap-2">
                            <span>O navegador bloqueou a conexão insegura.</span>
                            <a
                                href={`${import.meta.env.VITE_EVOLUTION_API_URL}/instance/fetchInstances`}
                                target="_blank"
                                className="underline font-bold text-blue-500"
                                rel="noreferrer"
                            >
                                Clique aqui e aceite o certificado ("Ir para... inseguro")
                            </a>
                        </div>
                    ),
                    duration: 10000,
                });
                return null;
            }

            toast.error('Erro na Integração', {
                description: error.message || 'Falha ao comunicar com Evolution API',
            });
            return null;
        }
    };

    const createInstance = async () => {
        setLoading(true);
        const data = await callEvolutionManager('create-instance', { instanceName });
        if (data) {
            // Evolution returns existing instance info if it already exists, or new one
            // If it has a QR code (base64) or token, we proceed
            if (data.qrcode) {
                toast.success('Instância Criada', { description: 'Escaneie o QR Code para conectar.' });
                fetchQrCode();
            } else if (data.instance?.status === 'open') {
                // Already connected?
                checkStatus(instanceName);
            } else {
                // Standard creation success
                toast.success('Instância Criada', { description: 'Gerando QR Code...' });
                fetchQrCode();
            }
        }
        setLoading(false);
    };

    const fetchQrCode = async () => {
        setLoading(true);
        const data = await callEvolutionManager('connect', { instanceName });
        if (data) {
            if (data.base64) {
                setQrCode(data.base64);
                setStatus('CONNECTING');
                // Start polling for status
                const poll = setInterval(async () => {
                    const statusData = await checkStatus(instanceName, false);
                    if (statusData && statusData.instance?.state === 'open') {
                        clearInterval(poll);
                        setQrCode(null);
                    }
                }, 3000);

                // Stop polling after 2 minutes
                setTimeout(() => clearInterval(poll), 120000);
            } else if (data.instance?.state === 'open') {
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
            const state = data.instance?.state || 'close';

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
                <CardContent>
                    {!evolutionInstance && status === 'DISCONNECTED' && !qrCode ? (
                        <div className="flex flex-col gap-4 max-w-sm">
                            <div className="grid w-full items-center gap-1.5">
                                <Label htmlFor="instanceName">Nome da Instância</Label>
                                <Input
                                    id="instanceName"
                                    value={instanceName}
                                    onChange={(e) => setInstanceName(e.target.value)}
                                    placeholder="ex: empresa-vendas"
                                />
                                <p className="text-xs text-muted-foreground">Nome único para identificar esta conexão na Evolution.</p>
                            </div>
                            <Button onClick={createInstance} disabled={loading} className="w-full">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Criar & Conectar
                            </Button>
                        </div>
                    ) : qrCode ? (
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="text-lg font-semibold mb-4">Escaneie o QR Code</h3>
                            <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 border-4 border-white rounded shadow-sm" />
                            <p className="text-sm text-muted-foreground mt-4 text-center">
                                Abra o WhatsApp no seu celular {'>'} Configurações {'>'} Aparelhos Conectados {'>'} Conectar Aparelho
                            </p>
                            <Button variant="ghost" className="mt-4 text-destructive" onClick={() => setQrCode(null)}>
                                Cancelar
                            </Button>
                        </div>
                    ) : status === 'CONNECTED' ? (
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                    <Wifi className="h-6 w-6" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-green-900 dark:text-green-100">Conexão Estabelecida</h4>
                                    <p className="text-sm text-green-700 dark:text-green-300">
                                        {connectionData?.ownerJid || instanceName}
                                    </p>
                                </div>
                            </div>
                            <Button variant="destructive" size="sm" onClick={logoutIndex} disabled={loading}>
                                <LogOut className="h-4 w-4 mr-2" />
                                Desconectar
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                            <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium">Instância Desconectada</h3>
                            <p className="text-muted-foreground mb-4">A instância existe mas não está conectada ao WhatsApp.</p>
                            <Button onClick={fetchQrCode} disabled={loading}>
                                <QrCode className="h-4 w-4 mr-2" />
                                Gerar Novo QR Code
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
