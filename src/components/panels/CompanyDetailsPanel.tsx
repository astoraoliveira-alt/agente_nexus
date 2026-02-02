import { Building2, Users, Bot, CreditCard, Calendar, Settings, Shield } from 'lucide-react';
import { Company } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';

interface CompanyDetailsPanelProps {
  data: Company;
}

export function CompanyDetailsPanel({ data }: CompanyDetailsPanelProps) {
  const [aiNotice, setAiNotice] = useState(data?.settings?.aiNoticeMessage || '');
  const [anonymization, setAnonymization] = useState(data?.settings?.anonymizationEnabled || false);

  if (!data) return null;

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'enterprise':
        return <Badge className="bg-accent">Enterprise</Badge>;
      case 'pro':
        return <Badge variant="secondary">Pro</Badge>;
      default:
        return <Badge variant="outline">Free</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600">Ativo</Badge>;
      case 'suspended':
        return <Badge variant="destructive">Suspenso</Badge>;
      default:
        return <Badge variant="outline">Trial</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
          <Building2 className="h-7 w-7 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">{data.name}</h3>
          <p className="text-sm text-muted-foreground">/{data.slug}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {getPlanBadge(data.plan)}
        {getStatusBadge(data.status)}
      </div>

      <Separator />

      {/* Limits */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Limites do Plano
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{(data.limits.llmTokens / 1000000).toFixed(1)}M</p>
            <p className="text-xs text-muted-foreground">Tokens LLM</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{(data.limits.messages / 1000).toFixed(0)}k</p>
            <p className="text-xs text-muted-foreground">Mensagens</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{data.limits.sttMinutes}</p>
            <p className="text-xs text-muted-foreground">Min STT</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{data.limits.ttsMinutes}</p>
            <p className="text-xs text-muted-foreground">Min TTS</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{data.limits.agents}</p>
            <p className="text-xs text-muted-foreground">Agentes</p>
          </div>
          <div className="bg-muted p-3">
            <p className="text-lg font-bold">{data.limits.users}</p>
            <p className="text-xs text-muted-foreground">Usuários</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Privacy Settings */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Privacidade e Consentimento
        </h4>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Mensagem de Aviso de IA</Label>
            <Textarea
              value={aiNotice}
              onChange={(e) => setAiNotice(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Anonimização de Dados</p>
              <p className="text-xs text-muted-foreground">Remover PII após período de retenção</p>
            </div>
            <Switch checked={anonymization} onCheckedChange={setAnonymization} />
          </div>

          <div className="bg-muted p-3">
            <p className="text-sm">Período de Retenção</p>
            <p className="text-lg font-bold">{data.settings.retentionDays} dias</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Metadata */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Informações
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Criada em</span>
            <span>{data.createdAt.toLocaleDateString('pt-BR')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tenant ID</span>
            <span className="font-mono text-xs">{data.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
