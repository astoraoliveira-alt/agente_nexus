import { Bot, MessageSquare, Phone, Activity, Settings2, Zap, ShieldCheck, Headphones, MessageCircle, Globe, Sparkles } from 'lucide-react';
import { Agent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AgentConfigPanelProps {
  data: Agent;
}

export function AgentConfigPanel({ data }: AgentConfigPanelProps) {
  const [isActive, setIsActive] = useState(data?.status === 'active');

  if (!data) return null;

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <Badge variant="destructive">Alto Risco</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio</Badge>;
      default:
        return <Badge variant="secondary">Baixo</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Agent Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
          <Bot className="h-7 w-7 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">{data.name}</h3>
          <p className="text-sm text-muted-foreground">ID: {data.id}</p>
        </div>
      </div>

      <Separator />

      {/* Status Toggle */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Status</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Agente Ativo</span>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <Separator />

      {/* Channels */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Canais Suportados</h4>
        <div className="flex gap-2">
          <Badge
            variant={data.channels.includes('text') ? 'default' : 'outline'}
            className={data.channels.includes('text') ? 'bg-accent' : ''}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Texto
          </Badge>
          <Badge
            variant={data.channels.includes('voice') ? 'default' : 'outline'}
            className={data.channels.includes('voice') ? 'bg-accent' : ''}
          >
            <Phone className="h-3 w-3 mr-1" />
            Voz
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Governance & Context */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Governança & Contexto
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tipo de Agente</span>
            <Badge variant="outline" className={cn(
              "text-[10px] h-5 gap-1 border-0 brightness-110 saturate-125",
              data.type === 'whatsapp' ? 'bg-[#25D366]/10 text-[#075E54] dark:text-[#25D366]' :
                data.type === 'embedded' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                  'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
            )}>
              {data.type === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> :
                data.type === 'embedded' ? <Globe className="h-3 w-3" /> :
                  <MessageSquare className="h-3 w-3" />
              }
              {data.type === 'whatsapp' ? 'WhatsApp API' :
                data.type === 'embedded' ? 'Embarcado' :
                  'Conversacional'}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Nível de Risco</span>
            {getRiskBadge(data.riskLevel)}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estágio ISO 42001</span>
            <Badge variant="secondary" className="text-[10px] h-5 gap-1 capitalize">
              {data.lifecycleStage}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Autonomia</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  key={level}
                  className={`w-4 h-4 rounded-sm ${level <= (data.autonomyLevel || 1) ? 'bg-accent' : 'bg-muted'}`}
                />
              ))}
            </div>
          </div>

          {data.policies && data.policies.length > 0 && (
            <div className="pt-2">
              <span className="text-xs text-muted-foreground">Políticas vinculadas: {data.policies.length}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {data.policies.map(policyName => (
                  <Badge key={policyName} variant="outline" className="text-[10px] py-0 h-5">
                    {policyName}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Usage Stats */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Indicadores de Uso</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted p-3">
            <p className="text-2xl font-bold">{data.activeConversations}</p>
            <p className="text-xs text-muted-foreground">Conversas Ativas</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-2xl font-bold">{data.totalConversations.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Conversas</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Integration Configuration */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Orquestração
        </h4>
        <div className="space-y-4">
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">N8N Webhook Callback</Label>
            <div className="mt-1 text-xs break-all font-mono text-slate-300">
              {data.integrationConfig?.n8n_webhook_url || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* LLM Settings */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          Configurações do Cérebro
        </h4>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-md">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Modelo LLM</Label>
              <p className="text-sm font-mono font-bold mt-1">{data.brainConfig?.modelId || 'gpt-4o'}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Temperatura</Label>
              <p className="text-sm font-mono font-bold mt-1 text-accent">{data.brainConfig?.temperature || 0.5}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm text-muted-foreground">Gasto de Tokens (Max)</Label>
              <span className="text-[11px] font-mono font-bold">{data.brainConfig?.maxTokens || 2048}</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{ width: `${((data.brainConfig?.maxTokens || 2048) / 4096) * 100}%` }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground mt-2 italic">* Editável na seção de Configuração Avançada.</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Voice Config (Conditional) */}
      {(data.voiceConfig?.provider === 'retell' || data.voiceConfig?.provider === 'vapi') && (
        <>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              Configuração de Voz
            </h4>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-md">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">Provedor</Label>
                  <p className="text-sm font-mono font-bold mt-1 uppercase">{data.voiceConfig.provider}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-md">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">Ambient Sound</Label>
                  <p className="text-sm font-mono font-bold mt-1 capitalize">{data.voiceConfig.ambientSound || 'Clean'}</p>
                </div>
              </div>

              <div className="space-y-2">
                {data.voiceConfig.provider === 'vapi' && (
                  <div className="p-2 border border-border rounded bg-muted/20">
                    <Label className="text-[9px] text-muted-foreground uppercase font-bold">Vapi Agent ID</Label>
                    <p className="text-[11px] font-mono mt-0.5 truncate">{data.voiceConfig.vapiAgentId || 'N/A'}</p>
                  </div>
                )}
                {data.voiceConfig.provider === 'retell' && (
                  <>
                    <div className="p-2 border border-border rounded bg-muted/20">
                      <Label className="text-[9px] text-muted-foreground uppercase font-bold">Voice ID (LL)</Label>
                      <p className="text-[11px] font-mono mt-0.5 truncate">{data.voiceConfig.voiceId || 'N/A'}</p>
                    </div>
                    <div className="p-2 border border-border rounded bg-muted/20">
                      <Label className="text-[9px] text-muted-foreground uppercase font-bold">Retell Agent ID</Label>
                      <p className="text-[11px] font-mono mt-0.5 truncate">{data.voiceConfig.retellAgentId || 'N/A'}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Performance */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-500" />
          Performance & KPIs
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Tempo médio de resposta</span>
            <span className="font-mono font-bold text-slate-400">Calculando...</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Taxa de resolução</span>
            <span className="font-mono font-bold text-slate-400">Aguardando Volume</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Satisfação do cliente</span>
            <span className="font-mono font-bold text-slate-400">Sem Avaliações</span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-md">
          <p className="text-[10px] text-blue-500 leading-normal">
            <span className="font-bold underline">Nota:</span> Os indicadores de performance são processados em tempo real com base nas últimas 50 conversas. Agentes em sandbox podem não exibir dados.
          </p>
        </div>
      </div>
    </div>
  );
}
