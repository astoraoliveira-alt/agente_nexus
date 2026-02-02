import { useState } from 'react';
import { ShieldCheck, Bot, AlertTriangle, FileText, Activity } from 'lucide-react';
import { AgentGovernance } from '@/lib/types';
import { Agent } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mockAIPolicies } from '@/lib/mock-extended-data';

interface AgentGovernancePanelProps {
  data: {
    governance: AgentGovernance;
    agent: Agent;
  };
}

export function AgentGovernancePanel({ data }: AgentGovernancePanelProps) {
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>(data?.governance?.riskLevel || 'low');
  const [usageType, setUsageType] = useState<'informational' | 'operational' | 'sensitive'>(data?.governance?.usageType || 'informational');
  const [autonomy, setAutonomy] = useState([data?.governance?.autonomyLevel || 3]);

  if (!data?.governance || !data?.agent) return null;

  const { governance, agent } = data;
  const linkedPolicies = governance.policies.map(pId => mockAIPolicies.find(p => p.id === pId)).filter(Boolean);

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <Badge variant="destructive">Alto Risco</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio Risco</Badge>;
      default:
        return <Badge variant="secondary">Baixo Risco</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
          <Bot className="h-7 w-7 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{agent.name}</h3>
          <p className="text-sm text-muted-foreground">{agent.id}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {getRiskBadge(riskLevel)}
        <Badge variant={agent.status === 'active' ? 'default' : 'outline'}>
          {agent.status === 'active' ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>

      <Separator />

      {/* Risk Classification */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Classificação de Risco
        </h4>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nível de Risco</Label>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as 'low' | 'medium' | 'high')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixo</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {riskLevel === 'high' ? 'Agentes de alto risco requerem supervisão constante' :
               riskLevel === 'medium' ? 'Monitoramento periódico recomendado' :
               'Operação normal sem supervisão especial'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Uso</Label>
            <Select value={usageType} onValueChange={(v) => setUsageType(v as 'informational' | 'operational' | 'sensitive')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="informational">Informativo</SelectItem>
                <SelectItem value="operational">Operacional</SelectItem>
                <SelectItem value="sensitive">Sensível</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {usageType === 'sensitive' ? 'Lida com dados sensíveis ou transações' :
               usageType === 'operational' ? 'Executa operações no sistema' :
               'Apenas fornece informações'}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Autonomy Level */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Nível de Autonomia
        </h4>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Autonomia</span>
            <span className="text-lg font-bold">{autonomy[0]}/5</span>
          </div>
          
          <Slider
            value={autonomy}
            onValueChange={setAutonomy}
            max={5}
            min={1}
            step={1}
            className="w-full"
          />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Mínima</span>
            <span>Máxima</span>
          </div>

          <div className="bg-muted p-3 text-sm">
            {autonomy[0] === 1 && 'Todas as decisões requerem aprovação humana'}
            {autonomy[0] === 2 && 'Decisões simples automáticas, complexas requerem aprovação'}
            {autonomy[0] === 3 && 'Maioria das decisões automáticas, críticas requerem aprovação'}
            {autonomy[0] === 4 && 'Alta autonomia, apenas exceções requerem aprovação'}
            {autonomy[0] === 5 && 'Autonomia total, sem necessidade de aprovação'}
          </div>
        </div>
      </div>

      <Separator />

      {/* Linked Policies */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Políticas Vinculadas
        </h4>
        
        <div className="space-y-2">
          {linkedPolicies.map((policy) => (
            <div key={policy?.id} className="flex items-center gap-3 p-3 bg-muted">
              <FileText className="h-4 w-4 text-accent" />
              <div className="flex-1">
                <p className="font-medium text-sm">{policy?.name}</p>
                <p className="text-xs text-muted-foreground">v{policy?.version}</p>
              </div>
              {policy?.isActive && (
                <Badge className="bg-green-600 text-xs">Ativa</Badge>
              )}
            </div>
          ))}
          
          {linkedPolicies.length === 0 && (
            <p className="text-sm text-muted-foreground p-3 bg-muted text-center">
              Nenhuma política vinculada
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Stats */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Estatísticas</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{agent.activeConversations}</p>
            <p className="text-xs text-muted-foreground">Conversas Ativas</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{agent.totalConversations.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Conversas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
