import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, 
  Download, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Filter, 
  Calendar,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/services/api';
import { MetaBillingDispatchItem } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface MetaBillingReportTabProps {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  campaignId?: string;
  contractUnitPrice?: number;
  onDateChange?: (start: Date, end: Date) => void;
  onUnitPriceChange?: (price: number) => void;
}

export function MetaBillingReportTab({
  tenantId,
  startDate,
  endDate,
  campaignId,
  contractUnitPrice = 1.05,
  onDateChange,
  onUnitPriceChange
}: MetaBillingReportTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MetaBillingDispatchItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [customPrice, setCustomPrice] = useState<number>(contractUnitPrice);
  const billingBasis = 'delivered'; // Faturamento calculado sobre entregues no celular (onde a Meta de fato cobra)

  useEffect(() => {
    if (contractUnitPrice !== undefined) {
      setCustomPrice(contractUnitPrice);
    }
  }, [contractUnitPrice]);

  useEffect(() => {
    if (tenantId) {
      loadReport();
    }
  }, [tenantId, startDate, endDate, campaignId]);

  const loadReport = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await api.getMetaBillingDispatchesReport(
        tenantId,
        startDate,
        endDate,
        campaignId
      );
      setItems(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar relatório de faturamento Meta:', err);
      toast({
        title: 'Erro ao carregar relatório',
        description: err.message || 'Falha ao buscar dados de faturamento.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtragem local por tipo de envio
  const filteredItems = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter(i => i.dispatchType === typeFilter);
  }, [items, typeFilter]);

  // Recalcular totais com base na tarifa personalizada e base de faturamento
  const totals = useMemo(() => {
    let totalAttempted = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;

    filteredItems.forEach(i => {
      totalAttempted += i.attemptedCount;
      totalDelivered += i.deliveredCount;
      totalRead += i.readCount;
      totalFailed += i.failedCount;
    });

    const deliveryRate = totalAttempted > 0 
      ? Number(((totalDelivered / totalAttempted) * 100).toFixed(1)) 
      : 0;

    const billableVolume = totalDelivered;
    const totalRevenue = billableVolume * (customPrice || 0);

    return {
      totalAttempted,
      totalDelivered,
      totalRead,
      totalFailed,
      deliveryRate,
      billableVolume,
      totalRevenue
    };
  }, [filteredItems, customPrice]);

  // Exportação formatada para Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      toast({
        title: 'Nada para exportar',
        description: 'Não há registros no período selecionado.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const exportRows = filteredItems.map(row => {
        let formattedDate = row.dispatchDate;
        try {
          const [y, m, d] = row.dispatchDate.split('-');
          formattedDate = `${d}/${m}/${y}`;
        } catch {}

        const volume = row.deliveredCount;
        const total = volume * (customPrice || 0);

        return {
          'Data': formattedDate,
          'Tipo de Envio': row.dispatchTypeLabel,
          'Tentativas (Enviados)': row.attemptedCount,
          'Entregues no Celular': row.deliveredCount,
          'Taxa de Entrega (%)': `${row.deliveryRate}%`,
          'Lidas': row.readCount,
          'Falhas de Entrega': row.failedCount,
          'Tarifa Unitária (R$)': customPrice,
          'Total Faturável (R$)': total
        };
      });

      // Linha de Total Geral
      exportRows.push({
        'Data': 'TOTAL GERAL',
        'Tipo de Envio': `Consolidado (${filteredItems.length} registros)`,
        'Tentativas (Enviados)': totals.totalAttempted,
        'Entregues no Celular': totals.totalDelivered,
        'Taxa de Entrega (%)': `${totals.deliveryRate}%`,
        'Lidas': totals.totalRead,
        'Falhas de Entrega': totals.totalFailed,
        'Tarifa Unitária (R$)': customPrice,
        'Total Faturável (R$)': totals.totalRevenue
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Faturamento Disparos Meta');

      const startStr = format(startDate, 'dd-MM-yyyy');
      const endStr = format(endDate, 'dd-MM-yyyy');
      const fileName = `Faturamento_Disparos_Meta_${startStr}_a_${endStr}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      toast({
        title: 'Exportação Concluída',
        description: `Arquivo ${fileName} gerado com sucesso.`,
      });
    } catch (err: any) {
      console.error('Erro na exportação Excel:', err);
      toast({
        title: 'Falha na exportação',
        description: 'Não foi possível gerar a planilha Excel.',
        variant: 'destructive'
      });
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'campaign_initial':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'reengagement':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      case 'funnel_followup':
        return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-700 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner de Ações e Controles */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card/60 backdrop-blur-sm p-4 rounded-xl border border-border/60 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px] uppercase font-bold tracking-wider">
              Contrato Operacional & Faturamento
            </Badge>
            <div className="flex items-center gap-1.5 bg-background border border-border px-2 py-0.5 rounded text-xs shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Período:</span>
              <input 
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value && onDateChange) {
                    onDateChange(new Date(e.target.value + 'T00:00:00'), endDate);
                  }
                }}
                className="h-5 px-1 text-xs bg-transparent border-none text-foreground font-bold focus:outline-none cursor-pointer"
              />
              <span className="text-muted-foreground text-[10px]">até</span>
              <input 
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value && onDateChange) {
                    onDateChange(startDate, new Date(e.target.value + 'T23:59:59'));
                  }
                }}
                className="h-5 px-1 text-xs bg-transparent border-none text-foreground font-bold focus:outline-none cursor-pointer"
              />
            </div>
          </div>
          <h2 className="text-base font-bold text-foreground mt-1">
            Relatório de Faturamento & Disparos Meta (WhatsApp)
          </h2>
          <p className="text-xs text-muted-foreground">
            Auditoria diária consolidada separando Campanhas, Reengajamento e Aquecimento de Leads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Seletor de Tipo */}
          <div className="w-44">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-xs">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Tipo de Envio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos os Tipos</SelectItem>
                <SelectItem value="campaign_initial" className="text-xs">Campanhas Iniciais</SelectItem>
                <SelectItem value="reengagement" className="text-xs">Reengajamento</SelectItem>
                <SelectItem value="funnel_followup" className="text-xs">Aquecimento / Anti-Abandono</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tarifa Unitária */}
          <div className="flex items-center gap-1.5 bg-background border border-border px-2.5 py-1 rounded-md">
            <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">R$/Disparo:</span>
            <input 
              type="number"
              step="0.05"
              min="0"
              value={customPrice}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setCustomPrice(val);
                if (onUnitPriceChange) onUnitPriceChange(val);
              }}
              className="w-16 h-7 text-xs font-mono font-bold bg-transparent border-none outline-none text-foreground"
            />
          </div>

          {/* Botão de Atualizar */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadReport}
            disabled={loading}
            className="h-9 px-3 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          {/* Botão de Exportar Excel */}
          <Button 
            onClick={handleExportExcel}
            disabled={loading || filteredItems.length === 0}
            className="h-9 px-4 gap-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Excel (.xlsx)</span>
          </Button>
        </div>
      </div>

      {/* 4 Cards de Resumo Executivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Enviados / Disparados */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Disparos Realizados (Enviados)
              </span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                <Send className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totals.totalAttempted.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-muted-foreground">tentativas</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total de tentativas disparadas pelo sistema
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Entregues no Celular */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Entregues no Celular
              </span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-emerald-600">
                {totals.totalDelivered.toLocaleString('pt-BR')}
              </span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 text-[10px] py-0 px-1.5">
                {totals.deliveryRate}% taxa
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Base oficial faturável pela Meta (recebidas no aparelho)
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Falhas de Entrega */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Falhas de Entrega
              </span>
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-rose-600">
                {totals.totalFailed.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-muted-foreground">
                ({totals.totalAttempted > 0 ? Math.round((totals.totalFailed / totals.totalAttempted) * 100) : 0}%)
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem WhatsApp, aparelho desligado ou bloqueio
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Faturamento Total a Cobrar */}
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                Total Faturável do Período
              </span>
              <div className="p-2 rounded-lg bg-emerald-600 text-white">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-emerald-700 font-mono">
                R$ {totals.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-700/80">
              {totals.totalDelivered.toLocaleString('pt-BR')} entregues no celular × R$ {customPrice.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela Analítica Diária Detalhada */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Detalhamento Diário por Tipo de Envio
            </CardTitle>
            <CardDescription className="text-xs">
              Valores separados dia a dia para conferência e emissão de fatura
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 text-emerald-600" />
            <span>Faturamento calculado sobre: <strong className="text-emerald-700 font-semibold">Entregues no Celular (Base Oficial Meta)</strong></span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
              Carregando auditoria de disparos e faturamento...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhum disparo registrado no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">
                  <tr>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Tipo de Envio</th>
                    <th className="py-3 px-4 text-right">Enviados (Disparos)</th>
                    <th className="py-3 px-4 text-right">Entregues no Celular</th>
                    <th className="py-3 px-4 text-center">Taxa de Entrega</th>
                    <th className="py-3 px-4 text-right">Lidas</th>
                    <th className="py-3 px-4 text-right">Falhas</th>
                    <th className="py-3 px-4 text-right">Tarifa (R$)</th>
                    <th className="py-3 px-4 text-right font-bold text-foreground">Subtotal a Faturar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredItems.map((item, idx) => {
                    let formattedDate = item.dispatchDate;
                    try {
                      const [y, m, d] = item.dispatchDate.split('-');
                      const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                      formattedDate = format(dateObj, "dd/MM/yyyy (EEE)", { locale: ptBR });
                    } catch {}

                    const volume = item.deliveredCount;
                    const subtotal = volume * (customPrice || 0);

                    return (
                      <tr key={`${item.dispatchDate}_${item.dispatchType}_${idx}`} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono font-medium text-foreground whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={`text-[10px] py-0 px-2 font-semibold ${getBadgeStyle(item.dispatchType)}`}>
                            {item.dispatchTypeLabel}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-foreground">
                          {item.attemptedCount.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-emerald-600">
                          {item.deliveredCount.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-semibold ${item.deliveryRate >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {item.deliveryRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                          {item.readCount.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-500 font-medium">
                          {item.failedCount.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                          R$ {customPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-emerald-700">
                          R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/70 font-bold border-t-2 border-border/80">
                  <tr>
                    <td className="py-3.5 px-4 text-foreground uppercase tracking-wider text-[11px]" colSpan={2}>
                      Total do Período ({filteredItems.length} registros)
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-foreground text-sm">
                      {totals.totalAttempted.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-600 text-sm">
                      {totals.totalDelivered.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-700">
                      {totals.deliveryRate}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                      {totals.totalRead.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-600">
                      {totals.totalFailed.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                      -
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-700 text-sm font-black">
                      R$ {totals.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
