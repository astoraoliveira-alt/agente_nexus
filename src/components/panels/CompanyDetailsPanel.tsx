import {
  Building2, Users, Bot, CreditCard, Calendar, Settings, Shield, Save, Code,
  AlertTriangle, CheckCircle, ExternalLink, Copy, Eye, EyeOff
} from 'lucide-react';
import { Company, AuditLog, User } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/services/api';

interface CompanyDetailsPanelProps {
  data: Company;
}

export function CompanyDetailsPanel({ data }: CompanyDetailsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Privacy State
  const [aiNotice, setAiNotice] = useState(data?.privacySettings?.aiDisclosureMessage || '');
  const [anonymization, setAnonymization] = useState(data?.privacySettings?.anonymizationEnabled || false);
  const [retention, setRetention] = useState(data?.privacySettings?.retentionDays || 90);

  // Governance State
  const [ownerId, setOwnerId] = useState(data.ai_system_owner_id || '');
  const [riskOwnerId, setRiskOwnerId] = useState(data.risk_owner_id || '');
  const [complianceId, setComplianceId] = useState(data.compliance_officer_id || '');

  // UI State
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const companyUsers = await api.getCompanyUsers(data.id);
        setUsers(companyUsers);
      } catch (err) {
        console.error('Error loading company users:', err);
      }
    };
    loadData();
  }, [data.id]);

  if (!data) return null;

  const handleSave = async () => {
    setLoading(true);

    try {
      // 1. Update Privacy
      await api.updateCompanyPrivacy(data.id, {
        aiDisclosureMessage: aiNotice,
        anonymizationEnabled: anonymization,
        retentionDays: Number(retention)
      });

      // 2. Update Governance
      await api.updateCompanyGovernance(data.id, {
        ai_system_owner_id: ownerId || null,
        risk_owner_id: riskOwnerId || null,
        compliance_officer_id: complianceId || null
      });

      // 3. Log Audit (Internal API logs this)
      await api.logAudit(
        data.id,
        'system-admin', // Ideally get from context
        'Super Admin',
        'company.update_settings',
        'tenant',
        data.id,
        'Alteração das configurações de privacidade e governança corporativa.'
      );

      toast.success('Configurações salvas e registradas em Auditoria');
    } catch (error) {
      console.error('Error saving company details:', error);
      toast.error('Erro ao salvar as configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyApiKey = () => {
    if (data.api_key) {
      navigator.clipboard.writeText(data.api_key);
      toast.success('API Key copiada com sucesso');
    }
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
              <p className="text-sm font-semibold">{data.planName || 'Plano Davos'}</p>
              <p className="text-xs text-muted-foreground">ID do Catálogo: {data.planId}</p>
            </div>
            <Badge className="bg-accent">{data.planDetails?.type?.toUpperCase() || 'FIXADO'}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1 uppercase text-[10px]">Política de Excesso</p>
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
              <p className="text-xs text-muted-foreground mb-1 uppercase text-[10px]">Billing Mode</p>
              <p className="text-sm font-medium">
                {data.planDetails?.monthlyFeeCoversUsage ? 'Crédito Antecipado' : 'Consumo Pós-pago'}
              </p>
            </div>
          </div>

          {/* Real Unit Prices from Plan */}
          {data.planPrices && (
            <div className="p-3 border border-border bg-accent/5">
              <p className="text-xs font-bold uppercase mb-2 text-accent">Tabela de Preços Unitários</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tokens (1k):</span>
                  <span className="font-mono">R$ {data.planPrices.llmTokenPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mensagens:</span>
                  <span className="font-mono">R$ {data.planPrices.messagePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Minutos STT:</span>
                  <span className="font-mono">R$ {data.planPrices.sttMinutePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Minutos TTS:</span>
                  <span className="font-mono">R$ {data.planPrices.ttsMinutePrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
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

      {/* ISO Compliance - Real Responsibles */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Governança Corporativa
        </h4>
        <div className="space-y-4 p-3 bg-muted/20 border border-dashed border-border">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Responsável Principal (Owner)</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Selecione o Owner" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Encarregado de Dados (DPO)</Label>
            <Select value={complianceId} onValueChange={setComplianceId}>
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Selecione o DPO" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-[10px] uppercase text-muted-foreground">Metodologia de Risco</span>
            <Badge variant="outline" className="text-[10px]">ISO 31000 / 23894</Badge>
          </div>
        </div>
      </div>

      <Separator />

      {/* Integration: API Key management */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Code className="h-4 w-4" />
          Chave de Integração (API Key)
        </h4>
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">Utilize esta chave para autenticar requisições vindo do n8n ou sistemas externos.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={data.api_key || 'Não gerada'}
                type={showApiKey ? 'text' : 'password'}
                readOnly
                className="font-mono text-xs pr-20 bg-muted/20"
              />
              <div className="absolute right-1 top-1 flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopyApiKey}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 right-0 w-[480px] p-4 bg-card border-t border-border flex justify-end gap-3 z-10 shadow-lg">
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
