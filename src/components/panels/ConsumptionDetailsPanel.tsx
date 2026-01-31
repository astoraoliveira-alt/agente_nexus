import { TrendingUp, DollarSign, Cpu, MessageSquare, Mic, Volume2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

interface ConsumptionDetailsPanelProps {
  data: {
    type: 'agent' | 'channel' | 'metric';
    title: string;
    details: any;
  };
}

export function ConsumptionDetailsPanel({ data }: ConsumptionDetailsPanelProps) {
  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-lg">{data.title}</h3>
        <p className="text-sm text-muted-foreground capitalize">{data.type}</p>
      </div>

      <Separator />

      {/* Consumption Breakdown */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Detalhamento de Consumo</h4>
        
        <div className="space-y-4">
          <div className="bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Tokens LLM</span>
            </div>
            <p className="text-2xl font-bold">{(data.details?.tokens || 0).toLocaleString()}</p>
            <div className="mt-2">
              <Progress value={45} className="h-1" />
              <p className="text-xs text-muted-foreground mt-1">45% do limite</p>
            </div>
          </div>

          <div className="bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Mensagens Processadas</span>
            </div>
            <p className="text-2xl font-bold">{(data.details?.messages || 0).toLocaleString()}</p>
            <div className="mt-2">
              <Progress value={32} className="h-1" />
              <p className="text-xs text-muted-foreground mt-1">32% do limite</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium">STT</span>
              </div>
              <p className="text-lg font-bold">234 min</p>
            </div>
            <div className="bg-muted p-4">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium">TTS</span>
              </div>
              <p className="text-lg font-bold">187 min</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Cost Analysis */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Análise de Custo
        </h4>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Custo LLM</span>
            <span className="font-medium">R$ 156,30</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Custo STT</span>
            <span className="font-medium">R$ 23,40</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Custo TTS</span>
            <span className="font-medium">R$ 18,70</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold text-accent">R$ {(data.details?.cost || 198.40).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Trend */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Tendência
        </h4>
        <div className="bg-muted p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-success" />
            <span className="text-sm">+12% em relação ao período anterior</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Baseado na comparação dos últimos 30 dias
          </p>
        </div>
      </div>

      {/* Events Timeline */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Eventos Recentes</h4>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 mt-2 bg-accent" />
            <div>
              <p className="text-sm font-medium">Pico de uso detectado</p>
              <p className="text-xs text-muted-foreground">Hoje às 14:32</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 mt-2 bg-warning" />
            <div>
              <p className="text-sm font-medium">Alerta de 75% do limite</p>
              <p className="text-xs text-muted-foreground">Ontem às 18:15</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 mt-2 bg-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Novo agente ativado</p>
              <p className="text-xs text-muted-foreground">25/01/2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
