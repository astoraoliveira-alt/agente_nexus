import { Bot, MessageSquare, Phone, Activity, Settings2, Zap } from 'lucide-react';
import { Agent } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';

interface AgentConfigPanelProps {
  data: Agent;
}

export function AgentConfigPanel({ data }: AgentConfigPanelProps) {
  const [isActive, setIsActive] = useState(data?.status === 'active');
  const [temperature, setTemperature] = useState([0.7]);
  const [maxTokens, setMaxTokens] = useState([2048]);

  if (!data) return null;

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

      {/* LLM Settings (Mock) */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Configurações do Modelo
        </h4>
        
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Temperatura</Label>
              <span className="text-sm text-muted-foreground">{temperature[0]}</span>
            </div>
            <Slider
              value={temperature}
              onValueChange={setTemperature}
              max={1}
              step={0.1}
              className="w-full"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Max Tokens</Label>
              <span className="text-sm text-muted-foreground">{maxTokens[0]}</span>
            </div>
            <Slider
              value={maxTokens}
              onValueChange={setMaxTokens}
              max={4096}
              step={256}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Performance */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Performance
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tempo médio de resposta</span>
            <span className="font-medium">1.2s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxa de resolução</span>
            <span className="font-medium">87%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Satisfação do cliente</span>
            <span className="font-medium">94.5%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
