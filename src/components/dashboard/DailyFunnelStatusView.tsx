import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  CalendarDays, 
  TrendingUp, 
  Clock, 
  Download, 
  ArrowUpRight, 
  Bot 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { CreditCampaignFunnelStat, Agent } from '@/lib/types';
import { 
  format, 
  isToday, 
  isThisWeek, 
  isThisMonth, 
  subWeeks, 
  startOfWeek, 
  endOfWeek, 
  isWithinInterval 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DailyAggregateRow {
  dateKey: string; // YYYY-MM-DD
  dateDisplay: string; // DD/MM/AAAA
  dayOfWeek: string; // Segunda-feira, etc.
  campaignCount: number;
  campaignNames: string[];
  carregados: number;
  enviados: number;
  entregues: number;
  lidas: number;
  interagiram: number;
  confirmaram: number;
  faturamento: number;
  valorInicial: number;
  optIn: number;
  aprovados: number;
  recusados: number;
  simularam: number;
  okAgente: number;
  formalizado: number;
  desistencia: number;
}

interface PeriodComparisonRow {
  id: 'hoje' | 'esta_semana' | 'semana_anterior' | 'mes_todo';
  label: string;
  subLabel: string;
  tag: string;
  accent: 'emerald' | 'sky' | 'slate' | 'blue';
  isCurrent?: boolean;
  carregados: number;
  enviados: number;
  entregues: number;
  lidas: number;
  interagiram: number;
  confirmaram: number;
  faturamento: number;
  valorInicial: number;
  optIn: number;
  recusados: number;
  aprovados: number;
}

interface PeriodSummary {
  label: string;
  subLabel: string;
  enviados: number;
  entregues: number;
  lidas: number;
  interagiram: number;
  confirmaram: number;
  optIn: number;
  recusados: number;
  deliveryRate: number;
  interactionRate: number;
  confirmationRate: number;
  optInRate: number;
  deltaEnviados?: number;
}

// Função segura para evitar que o fuso horário (UTC vs GMT-3) desloque o dia
function parseSafeDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'string') {
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, day] = match;
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(day), 12, 0, 0);
    }
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function DailyFunnelStatusView() {
  const { currentTenant } = useApp();
  const [funnelData, setFunnelData] = useState<CreditCampaignFunnelStat[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!currentTenant) return;
    loadAgents();
  }, [currentTenant?.id]);

  useEffect(() => {
    if (!currentTenant || !isInitialized) return;
    loadData();
  }, [currentTenant?.id, selectedAgentId, isInitialized]);

  const loadAgents = async () => {
    try {
      const list = await api.getAgents(currentTenant!.id);
      const safeList = list || [];
      setAgents(safeList);

      // Auto-seleciona o agente novo comercial por padrão
      const newAgent = safeList.find(a => 
        a.name.toLowerCase().includes('(novo)') || 
        a.name.toLowerCase().includes('novo')
      ) || safeList.find(a => 
        a.name.toLowerCase().includes('fiserv') && a.name.toLowerCase().includes('comercial')
      ) || safeList.find(a => 
        a.name.toLowerCase().includes('fiserv')
      );

      if (newAgent) {
        setSelectedAgentId(newAgent.id);
      } else {
        setSelectedAgentId('all');
      }
      setIsInitialized(true);
    } catch (err) {
      console.error('Erro ao carregar agentes:', err);
      setSelectedAgentId('all');
      setIsInitialized(true);
    }
  };

  const loadData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const agentFilter = selectedAgentId && selectedAgentId !== 'all' ? selectedAgentId : undefined;
      const stats = await api.getCreditCampaignFunnelStats(
        currentTenant.id,
        undefined,
        undefined,
        agentFilter
      );
      setFunnelData(stats || []);
    } catch (err) {
      console.error('Erro ao carregar dados do funil diário:', err);
      setFunnelData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Agrupamento por Dia (Independente do número de campanhas no dia)
  const dailyData: DailyAggregateRow[] = useMemo(() => {
    const map = new Map<string, DailyAggregateRow>();

    for (const item of funnelData) {
      if (!item.startDate) continue;
      const d = parseSafeDate(item.startDate);
      if (!d || isNaN(d.getTime())) continue;

      const dateKey = format(d, 'yyyy-MM-dd');

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateKey,
          dateDisplay: format(d, 'dd/MM/yyyy'),
          dayOfWeek: format(d, 'EEEE', { locale: ptBR }),
          campaignCount: 0,
          campaignNames: [],
          carregados: 0,
          enviados: 0,
          entregues: 0,
          lidas: 0,
          interagiram: 0,
          confirmaram: 0,
          faturamento: 0,
          valorInicial: 0,
          optIn: 0,
          aprovados: 0,
          recusados: 0,
          simularam: 0,
          okAgente: 0,
          formalizado: 0,
          desistencia: 0
        });
      }

      const row = map.get(dateKey)!;
      row.campaignCount += 1;
      if (item.campaignName && !row.campaignNames.includes(item.campaignName)) {
        row.campaignNames.push(item.campaignName);
      }
      row.carregados += item.carregados || 0;
      row.enviados += item.enviados || 0;
      row.entregues += item.entregues || 0;
      row.lidas += item.lidas || 0;
      row.interagiram += item.interagiram || 0;
      row.confirmaram += item.confirmaram || 0;
      row.faturamento += item.faturamento || 0;
      row.valorInicial += item.valorInicial || 0;
      row.optIn += item.optIn || 0;
      row.aprovados += item.aprovados || 0;
      row.recusados += item.recusados || 0;
      row.simularam += item.simularam || 0;
      row.okAgente += item.okAgente || 0;
      row.formalizado += item.formalizado || 0;
      row.desistencia += item.desistencia || 0;
    }

    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [funnelData]);

  // 2. Linhas do Comparativo de Período Executivo (Hoje vs Esta Semana vs Semana Anterior vs Mês Todo)
  const periodComparisonRows: PeriodComparisonRow[] = useMemo(() => {
    const now = new Date();
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    const createRow = (
      id: 'hoje' | 'esta_semana' | 'semana_anterior' | 'mes_todo',
      label: string,
      subLabel: string,
      tag: string,
      accent: 'emerald' | 'sky' | 'slate' | 'blue',
      isCurrent?: boolean
    ): PeriodComparisonRow => ({
      id,
      label,
      subLabel,
      tag,
      accent,
      isCurrent,
      carregados: 0,
      enviados: 0,
      entregues: 0,
      lidas: 0,
      interagiram: 0,
      confirmaram: 0,
      faturamento: 0,
      valorInicial: 0,
      optIn: 0,
      recusados: 0,
      aprovados: 0
    });

    const hoje = createRow(
      'hoje',
      'Hoje (Campanha Atual)',
      `${format(now, 'dd/MM/yyyy')} • ${format(now, 'EEEE', { locale: ptBR })}`,
      'Tempo Real',
      'emerald',
      true
    );

    const estaSemana = createRow(
      'esta_semana',
      'Esta Semana (WTD)',
      'Segunda-feira até hoje',
      'Semana Corrente',
      'sky'
    );

    const semanaAnterior = createRow(
      'semana_anterior',
      'Semana Anterior',
      `${format(lastWeekStart, 'dd/MM')} a ${format(lastWeekEnd, 'dd/MM/yyyy')}`,
      'Base de Referência',
      'slate'
    );

    const mesTodo = createRow(
      'mes_todo',
      'Mês Atual (MTD)',
      `Acumulado de ${format(now, 'MMMM/yyyy', { locale: ptBR })}`,
      'Consolidado Mês',
      'blue'
    );

    for (const row of dailyData) {
      const d = parseSafeDate(row.dateKey);
      if (!d) continue;

      const accumulate = (target: PeriodComparisonRow) => {
        target.carregados += row.carregados;
        target.enviados += row.enviados;
        target.entregues += row.entregues;
        target.lidas += row.lidas;
        target.interagiram += row.interagiram;
        target.confirmaram += row.confirmaram;
        target.faturamento += row.faturamento;
        target.valorInicial += row.valorInicial;
        target.optIn += row.optIn;
        target.recusados += row.recusados;
        target.aprovados += row.aprovados;
      };

      if (isToday(d)) accumulate(hoje);
      if (isThisWeek(d, { weekStartsOn: 1 })) accumulate(estaSemana);
      if (isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd })) accumulate(semanaAnterior);
      if (isThisMonth(d)) accumulate(mesTodo);
    }

    return [hoje, estaSemana, semanaAnterior, mesTodo];
  }, [dailyData]);

  // 3. Resumo para os Cards do Topo
  const periodStats = useMemo(() => {
    const now = new Date();
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    const createBucket = (): Omit<PeriodSummary, 'label' | 'subLabel' | 'deliveryRate' | 'interactionRate' | 'confirmationRate' | 'optInRate'> => ({
      enviados: 0,
      entregues: 0,
      lidas: 0,
      interagiram: 0,
      confirmaram: 0,
      optIn: 0,
      recusados: 0
    });

    const hoje = createBucket();
    const estaSemana = createBucket();
    const semanaAnterior = createBucket();
    const mesTodo = createBucket();

    for (const row of dailyData) {
      const d = parseSafeDate(row.dateKey);
      if (!d) continue;

      if (isToday(d)) {
        hoje.enviados += row.enviados;
        hoje.entregues += row.entregues;
        hoje.lidas += row.lidas;
        hoje.interagiram += row.interagiram;
        hoje.confirmaram += row.confirmaram;
        hoje.optIn += row.optIn;
        hoje.recusados += row.recusados;
      }

      if (isThisWeek(d, { weekStartsOn: 1 })) {
        estaSemana.enviados += row.enviados;
        estaSemana.entregues += row.entregues;
        estaSemana.lidas += row.lidas;
        estaSemana.interagiram += row.interagiram;
        estaSemana.confirmaram += row.confirmaram;
        estaSemana.optIn += row.optIn;
        estaSemana.recusados += row.recusados;
      }

      if (isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd })) {
        semanaAnterior.enviados += row.enviados;
        semanaAnterior.entregues += row.entregues;
        semanaAnterior.lidas += row.lidas;
        semanaAnterior.interagiram += row.interagiram;
        semanaAnterior.confirmaram += row.confirmaram;
        semanaAnterior.optIn += row.optIn;
        semanaAnterior.recusados += row.recusados;
      }

      if (isThisMonth(d)) {
        mesTodo.enviados += row.enviados;
        mesTodo.entregues += row.entregues;
        mesTodo.lidas += row.lidas;
        mesTodo.interagiram += row.interagiram;
        mesTodo.confirmaram += row.confirmaram;
        mesTodo.optIn += row.optIn;
        mesTodo.recusados += row.recusados;
      }
    }

    const calcRates = (b: ReturnType<typeof createBucket>, label: string, subLabel: string, deltaEnviados?: number): PeriodSummary => {
      const deliveryRate = b.enviados > 0 ? (b.entregues / b.enviados) * 100 : 0;
      const interactionRate = b.lidas > 0 ? (b.interagiram / b.lidas) * 100 : 0;
      const confirmationRate = b.interagiram > 0 ? (b.confirmaram / b.interagiram) * 100 : 0;
      const optInRate = b.confirmaram > 0 ? (b.optIn / b.confirmaram) * 100 : 0;

      return {
        label,
        subLabel,
        ...b,
        deliveryRate,
        interactionRate,
        confirmationRate,
        optInRate,
        deltaEnviados
      };
    };

    const deltaWoW = semanaAnterior.enviados > 0 
      ? ((estaSemana.enviados - semanaAnterior.enviados) / semanaAnterior.enviados) * 100 
      : 0;

    return {
      hoje: calcRates(hoje, 'Hoje', 'Envios das últimas 24h'),
      estaSemana: calcRates(estaSemana, 'Esta Semana', 'Segunda até hoje', deltaWoW),
      semanaAnterior: calcRates(semanaAnterior, 'Semana Anterior', 'Segunda a Domingo passado'),
      mesTodo: calcRates(mesTodo, 'Mês Atual', `${format(now, 'MMMM/yyyy', { locale: ptBR })}`)
    };
  }, [dailyData]);

  // Exportação Excel
  const handleExportExcel = () => {
    const exportData = periodComparisonRows.map(r => ({
      'Período': r.label,
      'Referência': r.subLabel,
      'Enviados': r.enviados,
      'Entregues': r.entregues,
      '% Entrega': r.enviados > 0 ? `${((r.entregues / r.enviados) * 100).toFixed(1)}%` : '-',
      'Lidas': r.lidas,
      '% Leitura': r.entregues > 0 ? `${((r.lidas / r.entregues) * 100).toFixed(1)}%` : '-',
      'Interagiram': r.interagiram,
      '% Interação (sobre Lidas)': r.lidas > 0 ? `${((r.interagiram / r.lidas) * 100).toFixed(1)}%` : '-',
      'Confirmaram': r.confirmaram,
      '% Confirmaram (sobre Interagiram)': r.interagiram > 0 ? `${((r.confirmaram / r.interagiram) * 100).toFixed(1)}%` : '-',
      'Faturamento': r.faturamento,
      '% Faturamento (sobre Confirmaram)': r.confirmaram > 0 ? `${((r.faturamento / r.confirmaram) * 100).toFixed(1)}%` : '-',
      'Valor Inicial': r.valorInicial,
      '% Valor (sobre Faturamento)': r.faturamento > 0 ? `${((r.valorInicial / r.faturamento) * 100).toFixed(1)}%` : '-',
      'Opt-In': r.optIn,
      '% Opt-In (sobre Valor)': r.valorInicial > 0 ? `${((r.optIn / r.valorInicial) * 100).toFixed(1)}%` : '-',
      'Aprovados': r.aprovados,
      'Recusados': r.recusados
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparativo Funil');
    XLSX.writeFile(workbook, `comparativo_funil_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-border/50 p-5 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Acompanhamento Diário & Multiperíodo
            </span>
            <Badge variant="outline" className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50/60 border-emerald-200">
              Foto em Tempo Real
            </Badge>
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Status Diário & Performance Comparativa
          </h2>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {agents.length > 0 && (
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-slate-400" />
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">Todos os Agentes</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="ghost"
            onClick={handleExportExcel}
            className="h-8 px-3.5 rounded-lg border border-emerald-200 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 font-bold uppercase text-[9px] tracking-widest flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* 2. Cards de Comparativo Temporal (Hoje vs Esta Semana vs Semana Anterior vs Mês Todo) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PeriodCard 
          summary={periodStats.hoje} 
          icon={Clock} 
          accentColor="sky" 
          highlightText="Envios de Hoje"
        />
        <PeriodCard 
          summary={periodStats.estaSemana} 
          icon={CalendarDays} 
          accentColor="emerald" 
          highlightText="Semana Corrente"
          deltaText={periodStats.estaSemana.deltaEnviados !== undefined ? `${periodStats.estaSemana.deltaEnviados >= 0 ? '+' : ''}${periodStats.estaSemana.deltaEnviados.toFixed(1)}% WoW` : undefined}
        />
        <PeriodCard 
          summary={periodStats.semanaAnterior} 
          icon={Calendar} 
          accentColor="slate" 
          highlightText="Base Anterior"
        />
        <PeriodCard 
          summary={periodStats.mesTodo} 
          icon={TrendingUp} 
          accentColor="blue" 
          highlightText="Acumulado Mês"
        />
      </div>

      {/* 3. Tabela Comparativa de Períodos: Hoje vs Histórico (Visão Direta sem filtros) */}
      <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        {/* Barra Superior da Tabela */}
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-4 h-4 text-slate-800" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                Evolução & Comparativo do Funil
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Comparativo direto da campanha atual (Hoje) com o histórico de períodos passados • % calculada sobre a etapa anterior
              </p>
            </div>
          </div>
        </div>

        {/* Tabela Responsiva com as 4 linhas fixas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-500">
                <th className="py-3 px-4">Período / Base</th>
                <th className="py-3 px-3 text-right">Enviados</th>
                <th className="py-3 px-3 text-right">Entregues</th>
                <th className="py-3 px-3 text-right">Lidas</th>
                <th className="py-3 px-3 text-right">Interagiram</th>
                <th className="py-3 px-3 text-right">Confirmaram</th>
                <th className="py-3 px-3 text-right">Faturamento</th>
                <th className="py-3 px-3 text-right">Valor Inicial</th>
                <th className="py-3 px-3 text-right">Opt-in</th>
                <th className="py-3 px-3 text-right">Recusados</th>
                <th className="py-3 px-3 text-right">Aprovados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Clock className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                    Carregando comparativo do funil...
                  </td>
                </tr>
              ) : (
                periodComparisonRows.map((row) => (
                  <tr 
                    key={row.id} 
                    className={cn(
                      "transition-colors",
                      row.isCurrent 
                        ? "bg-emerald-50/30 border-l-4 border-l-emerald-500 hover:bg-emerald-50/50" 
                        : "hover:bg-slate-50/60"
                    )}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-bold text-sm tracking-tight",
                            row.isCurrent ? "text-emerald-950 font-black" : "text-slate-900"
                          )}>
                            {row.label}
                          </span>
                          <span className={cn(
                            "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                            row.accent === 'emerald' && "bg-emerald-100/70 text-emerald-800 border-emerald-300/60",
                            row.accent === 'sky' && "bg-sky-100/70 text-sky-800 border-sky-300/60",
                            row.accent === 'slate' && "bg-slate-100 text-slate-700 border-slate-300/60",
                            row.accent === 'blue' && "bg-blue-100/70 text-blue-800 border-blue-300/60"
                          )}>
                            {row.tag}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 capitalize mt-0.5">
                          {row.subLabel}
                        </span>
                      </div>
                    </td>

                    {/* Enviados */}
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        {row.enviados.toLocaleString('pt-BR')}
                      </span>
                    </td>

                    {/* Entregues (vs Enviados) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.entregues} 
                        prev={row.enviados} 
                        subLabel="dos enviados"
                      />
                    </td>

                    {/* Lidas (vs Entregues) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.lidas} 
                        prev={row.entregues} 
                        subLabel="dos entregues"
                      />
                    </td>

                    {/* Interagiram (vs Lidas) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.interagiram} 
                        prev={row.lidas} 
                        subLabel="das lidas"
                        isHighlight
                      />
                    </td>

                    {/* Confirmaram (vs Interagiram) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.confirmaram} 
                        prev={row.interagiram} 
                        subLabel="dos que interagiram"
                      />
                    </td>

                    {/* Faturamento (vs Confirmaram) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.faturamento} 
                        prev={row.confirmaram} 
                        subLabel="dos confirmados"
                      />
                    </td>

                    {/* Valor Inicial (vs Faturamento) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.valorInicial} 
                        prev={row.faturamento} 
                        subLabel="do faturamento"
                      />
                    </td>

                    {/* Opt-in (vs Valor Inicial) */}
                    <td className="py-3 px-3 text-right">
                      <StepMetricCell 
                        value={row.optIn} 
                        prev={row.valorInicial} 
                        subLabel="dos valores"
                        isHighlight
                      />
                    </td>

                    {/* Recusados (vs Opt-in) */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-rose-600 font-mono">
                          {row.recusados.toLocaleString('pt-BR')}
                        </span>
                        {row.optIn > 0 && (
                          <span className="text-[9px] font-semibold text-rose-500/80 mt-0.5">
                            {((row.recusados / row.optIn) * 100).toFixed(1)}% do opt-in
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Aprovados (vs Opt-in) */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-emerald-700 font-mono">
                          {row.aprovados.toLocaleString('pt-BR')}
                        </span>
                        {row.optIn > 0 && (
                          <span className="text-[9px] font-semibold text-emerald-600/80 mt-0.5">
                            {((row.aprovados / row.optIn) * 100).toFixed(1)}% do opt-in
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Seção Secundária: Histórico Diário Detalhado (Para auditoria por dia) */}
      {dailyData.length > 0 && (
        <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/50 flex items-center justify-between bg-slate-50/40">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Histórico de Disparos por Data ({dailyData.length} dias registrados)
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">
              Auditoria analítica diária
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <th className="py-2.5 px-4">Data do Disparo</th>
                  <th className="py-2.5 px-3 text-right">Enviados</th>
                  <th className="py-2.5 px-3 text-right">Entregues</th>
                  <th className="py-2.5 px-3 text-right">Lidas</th>
                  <th className="py-2.5 px-3 text-right">Interagiram</th>
                  <th className="py-2.5 px-3 text-right">Confirmaram</th>
                  <th className="py-2.5 px-3 text-right">Faturamento</th>
                  <th className="py-2.5 px-3 text-right">Valor Inicial</th>
                  <th className="py-2.5 px-3 text-right">Opt-in</th>
                  <th className="py-2.5 px-3 text-right">Recusados</th>
                  <th className="py-2.5 px-3 text-right">Aprovados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {dailyData.map((row) => (
                  <tr key={row.dateKey} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 font-mono">
                          {row.dateDisplay}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {row.dayOfWeek}
                        </span>
                        {row.campaignCount > 1 && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                            {row.campaignCount} campanhas
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <span className="font-bold text-slate-800 font-mono">
                        {row.enviados.toLocaleString('pt-BR')}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.entregues} prev={row.enviados} subLabel="dos enviados" />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.lidas} prev={row.entregues} subLabel="dos entregues" />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.interagiram} prev={row.lidas} subLabel="das lidas" isHighlight />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.confirmaram} prev={row.interagiram} subLabel="dos que interagiram" />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.faturamento} prev={row.confirmaram} subLabel="dos confirmados" />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.valorInicial} prev={row.faturamento} subLabel="do faturamento" />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <StepMetricCell value={row.optIn} prev={row.valorInicial} subLabel="dos valores" isHighlight />
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <span className="font-bold text-rose-600 font-mono">
                        {row.recusados.toLocaleString('pt-BR')}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <span className="font-bold text-emerald-700 font-mono">
                        {row.aprovados.toLocaleString('pt-BR')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponente de Célula com Valor e Taxa Sutil Step-by-Step
function StepMetricCell({ 
  value, 
  prev, 
  subLabel,
  isHighlight = false 
}: { 
  value: number; 
  prev: number; 
  subLabel: string;
  isHighlight?: boolean;
}) {
  const rate = prev > 0 ? (value / prev) * 100 : null;

  return (
    <div className="flex flex-col items-end">
      <span className={cn(
        "font-bold font-mono",
        isHighlight ? "text-slate-900 font-black" : "text-slate-800"
      )}>
        {value.toLocaleString('pt-BR')}
      </span>
      {rate !== null && (
        <span 
          title={`${rate.toFixed(1)}% ${subLabel}`}
          className={cn(
            "text-[9px] font-semibold px-1 py-0.2 rounded mt-0.5 border leading-tight tracking-tight",
            rate >= 70 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" 
              : rate >= 40 
              ? "bg-amber-50 text-amber-700 border-amber-200/50" 
              : "bg-slate-50 text-slate-600 border-slate-200/50"
          )}
        >
          {rate.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// Subcomponente Card de Período
function PeriodCard({
  summary,
  icon: Icon,
  accentColor,
  highlightText,
  deltaText
}: {
  summary: PeriodSummary;
  icon: any;
  accentColor: 'sky' | 'emerald' | 'slate' | 'blue';
  highlightText: string;
  deltaText?: string;
}) {
  const borderColor = {
    sky: 'hover:border-sky-300',
    emerald: 'hover:border-emerald-300',
    slate: 'hover:border-slate-300',
    blue: 'hover:border-blue-300'
  }[accentColor];

  const pillColor = {
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200'
  }[accentColor];

  return (
    <div className={cn(
      "bg-white border border-border/50 p-4 rounded-2xl shadow-sm flex flex-col justify-between transition-all duration-300",
      borderColor
    )}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-50 text-slate-700 rounded-lg border border-slate-100">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight leading-none">
                {summary.label}
              </h4>
              <p className="text-[9px] text-slate-400 mt-0.5">{summary.subLabel}</p>
            </div>
          </div>
          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", pillColor)}>
            {highlightText}
          </span>
        </div>

        {/* Big Number Enviados */}
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Enviados
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              {summary.enviados.toLocaleString('pt-BR')}
            </span>
          </div>
          {deltaText && (
            <div className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              <ArrowUpRight className="w-3 h-3" />
              {deltaText}
            </div>
          )}
        </div>

        {/* Funil Compacto do Período */}
        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Entregues</span>
            <span className="text-xs font-bold text-slate-800 font-mono">
              {summary.entregues.toLocaleString('pt-BR')}
            </span>
            <span className="text-[9px] text-slate-500 font-medium">{summary.deliveryRate.toFixed(1)}%</span>
          </div>

          <div className="flex flex-col border-l border-slate-100 pl-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Interagiram</span>
            <span className="text-xs font-bold text-slate-900 font-mono">
              {summary.interagiram.toLocaleString('pt-BR')}
            </span>
            <span className="text-[9px] text-emerald-600 font-medium">{summary.interactionRate.toFixed(1)}%</span>
          </div>

          <div className="flex flex-col border-l border-slate-100 pl-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Opt-in</span>
            <span className="text-xs font-bold text-slate-900 font-mono">
              {summary.optIn.toLocaleString('pt-BR')}
            </span>
            <span className="text-[9px] text-indigo-600 font-medium">{summary.optInRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
