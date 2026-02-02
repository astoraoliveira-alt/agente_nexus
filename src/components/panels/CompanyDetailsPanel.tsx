import {
  Building2, Users, Bot, CreditCard, Calendar, Settings, Shield, Save, Code, AlertTriangle, CheckCircle
} from 'lucide-react';
import { Company, AuditLog } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

interface CompanyDetailsPanelProps {
  data: Company;
}

export function CompanyDetailsPanel({ data }: CompanyDetailsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState(data?.privacySettings?.aiDisclosureMessage || '');
  const [anonymization, setAnonymization] = useState(data?.privacySettings?.anonymizationEnabled || false);
  const [retention, setRetention] = useState(data?.privacySettings?.retentionDays || 90);

  if (!data) return null;

  const handleSave = () => {
    setLoading(true);

    // Simulate API call and Audit Log generation
    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date(),
      tenantId: data.id,
      actorId: 'user-1',
      actorName: 'Super Admin',
      action: 'privacy.update',
      targetType: 'tenant',
      targetId: data.id,
      before: data.privacySettings,
      after: {
        aiDisclosureMessage: aiNotice,
        anonymizationEnabled: anonymization,
        retentionDays: Number(retention)
      },
      details: 'Alteração das configurações de privacidade e retenção de dados (LGPD).',
    };

    console.log('Contractual Audit Log generated:', audit);

    setTimeout(() => {
      setLoading(false);
      toast.success('Configurações salvas e registradas em Auditoria');
    }, 800);
  };

  const simulatedPayload = {
    tenant_id: data.id,
    tenant_slug: data.slug,
    plan: {
      id: data.planId,
      type: data.planDetails?.type || 'fixed',
      overage_policy: data.planDetails?.overagePolicy || 'block'
    },
    privacy: {
      retention_days: Number(retention),
      anonymization: anonymization
    }
  };

  return (
    <div className="p-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{data.name}</h3>
            <p className="text-sm text-muted-foreground font-mono text-xs">UUID: {data.id}</p>
          </div>
        </div>
        <Badge variant={data.status === 'active' ? 'default' : 'destructive'} className={data.status === 'active' ? 'bg-green-600' : ''}>
          {data.status === 'active' ? 'Ativo' : 'Suspenso'}
        </Badge>
      </div>

      <Separator />

      {/* Plan Contract */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Contrato de Serviço
        </h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 border border-border">
            <div>
              <p className="text-sm font-semibold">{data.planId === 'plan-enterprise-flex' ? 'Enterprise Flex' : 'Plano Profissional'}</p>
              <p className="text-xs text-muted-foreground">ID do Catálogo: {data.planId}</p>
            </div>
            <Badge className="bg-accent">{data.planDetails?.type?.toUpperCase() || 'FIXADO'}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1 uppercase">Política de Excesso</p>
              <div className="flex items-center gap-2">
                {data.planDetails?.overagePolicy === 'allow_with_alert' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span className="text-sm font-medium">
                  {data.planDetails?.overagePolicy === 'allow_with_alert' ? 'Permitir com Alerta' : 'Bloquear Consumo'}
                </span>
              </div>
            </div>
            <div className="p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1 uppercase">Billing Mode</p>
              <p className="text-sm font-medium">Mensal / Pós-pago</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Privacy Settings (Editable) */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Configurações de Privacidade (LGPD)
        </h4>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Mensagem de Aviso de IA (Obrigatório ISO 42001)</Label>
            <Textarea
              value={aiNotice}
              onChange={(e) => setAiNotice(e.target.value)}
              className="min-h-[80px] text-sm bg-muted/20"
              placeholder="Descreva como os dados são tratados..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Retenção (Dias)</Label>
              <Input
                type="number"
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                className="bg-muted/20"
              />
            </div>
            <div className="flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Anonimização</Label>
                <Switch checked={anonymization} onCheckedChange={setAnonymization} />
              </div>
              <p className="text-[10px] text-muted-foreground">Remover PII automaticamente</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* ISO Compliance */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Governança Corporativa
        </h4>
        <div className="space-y-2 text-sm p-3 bg-muted/20 border border-dashed border-border">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Responsável Principal (Owner)</span>
            <span className="font-medium text-xs">Carlos Silva (CEO)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Encarregado de Dados (DPO)</span>
            <span className="font-medium text-xs text-accent underline">Ver Perfil</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Metodologia de Risco</span>
            <Badge variant="outline" className="text-[10px]">ISO 31000 / 23894</Badge>
          </div>
        </div>
      </div>

      <Separator />

      {/* Simulated Payload for Integrations */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Code className="h-4 w-4" />
          Preview Contract Payload (N8N / Retell)
        </h4>
        <div className="relative">
          <pre className="p-4 bg-slate-950 text-slate-50 rounded text-[10px] font-mono overflow-auto max-h-[150px]">
            {JSON.stringify(simulatedPayload, null, 2)}
          </pre>
          <div className="absolute top-2 right-2 flex gap-1">
            <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700 text-[8px]">JSON v1</Badge>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          * Este payload é a base para as integrações via webhook com N8N e WhatsApp.
        </p>
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 right-0 w-[480px] p-4 bg-card border-t border-border flex justify-end gap-3 z-10">
        <Button
          className="bg-accent hover:bg-accent/90"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Salvando...' : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Alterações Contratuais
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
