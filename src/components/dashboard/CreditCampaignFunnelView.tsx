import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Building2, 
  Calendar, 
  CheckCircle2, 
  Download, 
  Search, 
  TrendingUp, 
  Users, 
  Zap,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { CreditCampaignFunnelStat, Agent } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CreditCampaignFunnelViewProps {
  onSelectCampaign?: (campaignId: string) => void;
}

export function CreditCampaignFunnelView({ onSelectCampaign }: CreditCampaignFunnelViewProps) {
  const { currentTenant } = useApp();
  const [funnelData, setFunnelData] = useState<CreditCampaignFunnelStat[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'15days' | '30days' | '90days' | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');

  useEffect(() => {
    if (currentTenant) {
      loadFunnelData();
    } else {
      setFunnelData([]);
      setIsLoading(false);
    }
  }, [currentTenant, timeFilter, selectedAgentId]);

  const loadFunnelData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const now = new Date();
      let startDate: Date | undefined;
      if (timeFilter === '15days') {
        startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '30days') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '90days') {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }

      const [stats, agentsList] = await Promise.all([
        api.getCreditCampaignFunnelStats(currentTenant.id, undefined, startDate, selectedAgentId),
        api.getAgents(currentTenant.id)
      ]);

      setFunnelData(stats || []);
      setAgents(agentsList || []);
    } catch (err) {
      console.error('Error loading credit funnel data:', err);
      setFunnelData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return funnelData;
    const term = searchTerm.toLowerCase();
    return funnelData.filter(d => d.campaignName.toLowerCase().includes(term));
  }, [funnelData, searchTerm]);

  // Totais agregados
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => ({
        carregados: acc.carregados + item.carregados,
        enviados: acc.enviados + item.enviados,
        entregues: acc.entregues + item.entregues,
        lidas: acc.lidas + item.lidas,
        interagiram: acc.interagiram + item.interagiram,
        faturamento: acc.faturamento + item.faturamento,
        valorInicial: acc.valorInicial + item.valorInicial,
        optIn: acc.optIn + item.optIn,
        aprovados: acc.aprovados + item.aprovados,
        recusados: acc.recusados + item.recusados,
        simularam: acc.simularam + item.simularam,
        okAgente: acc.okAgente + item.okAgente,
        aguarContato: acc.aguarContato + item.aguarContato,
        emAtendimento: acc.emAtendimento + item.emAtendimento,
        formalizado: acc.formalizado + item.formalizado
      }),
      {
        carregados: 0,
        enviados: 0,
        entregues: 0,
        lidas: 0,
        interagiram: 0,
        faturamento: 0,
        valorInicial: 0,
        optIn: 0,
        aprovados: 0,
        recusados: 0,
        simularam: 0,
        okAgente: 0,
        aguarContato: 0,
        emAtendimento: 0,
        formalizado: 0
      }
    );
  }, [filteredData]);

  // Taxas de conversão principais
  const deliveryRate = totals.enviados > 0 ? ((totals.entregues / totals.enviados) * 100).toFixed(1) : '0.0';
  const responseRate = totals.entregues > 0 ? ((totals.interagiram / totals.entregues) * 100).toFixed(1) : '0.0';
  const optInRate = totals.interagiram > 0 ? ((totals.optIn / totals.interagiram) * 100).toFixed(1) : '0.0';
  const approvalRate = totals.optIn > 0 ? ((totals.aprovados / totals.optIn) * 100).toFixed(1) : '0.0';
  const formalizationRate = totals.enviados > 0 ? ((totals.formalizado / totals.enviados) * 100).toFixed(1) : '0.0';

  const exportToExcel = () => {
    const rows = filteredData.map(d => ({
      Campanha: d.campaignName,
      Status: d.status,
      Início: d.startDate ? format(d.startDate, 'dd/MM/yyyy') : '-',
      // Envio
      'Envio - Carregados': d.carregados,
      'Envio - Enviados': d.enviados,
      'Envio - Entregues': d.entregues,
      'Envio - Lidas': d.lidas,
      'Envio - Interagiram': d.interagiram,
      // Venda
      'Venda - Faturamento': d.faturamento,
      'Venda - Valor Inicial': d.valorInicial,
      'Venda - Opt-in': d.optIn,
      'Venda - Aprovados': d.aprovados,
      'Venda - Recusados': d.recusados,
      'Venda - Simularam': d.simularam,
      'Venda - OK Agente': d.okAgente,
      // Formalização
      'Formalização - Aguar. Contato': d.aguarContato,
      'Formalização - Em Atendimento': d.emAtendimento,
      'Formalização - Formalizado': d.formalizado
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Funil de Crédito');
    XLSX.writeFile(wb, `funil_credito_executivo_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-[#E5003A] shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest text-[#E5003A] uppercase bg-rose-50 px-2 py-0.5 rounded">
                Auditoria & Faturamento
              </span>
              <span className="text-xs text-muted-foreground">• Jornada Nativa WhatsApp</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1">
              Funil Executivo de Crédito
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            className="h-9 gap-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border-slate-200 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar XLS
          </Button>
        </div>
      </div>

      {/* KPI Cards — Macro Conversões */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taxa de Entrega</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-800">{deliveryRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.entregues.toLocaleString('pt-BR')} entregues</span>
          </div>
          <Progress value={Number(deliveryRate)} className="h-1.5 mt-3 bg-slate-100" />
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engajamento (Respostas)</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-indigo-600">{responseRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.interagiram.toLocaleString('pt-BR')} respostas</span>
          </div>
          <Progress value={Number(responseRate)} className="h-1.5 mt-3 bg-indigo-50" />
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conversão em Opt-in</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-blue-600">{optInRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.optIn.toLocaleString('pt-BR')} aceites</span>
          </div>
          <Progress value={Number(optInRate)} className="h-1.5 mt-3 bg-blue-50" />
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aprovação de Crédito</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-600">{approvalRate}%</span>
            <span className="text-[11px] text-slate-500 font-medium">{totals.aprovados.toLocaleString('pt-BR')} aprovados</span>
          </div>
          <Progress value={Number(approvalRate)} className="h-1.5 mt-3 bg-emerald-50" />
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Formalizados (Final)</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-[#E5003A]">{totals.formalizado.toLocaleString('pt-BR')}</span>
            <span className="text-[11px] text-rose-600 font-bold">{formalizationRate}% do total</span>
          </div>
          <Progress value={Math.min(Number(formalizationRate) * 10, 100)} className="h-1.5 mt-3 bg-rose-50" />
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-border/40 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome de campanha..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#E5003A]"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-end sm:self-auto">
          <Button
            variant={timeFilter === '15days' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('15days')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === '15days' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            15 Dias
          </Button>
          <Button
            variant={timeFilter === '30days' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('30days')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === '30days' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            30 Dias
          </Button>
          <Button
            variant={timeFilter === '90days' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('90days')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === '90days' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            90 Dias
          </Button>
          <Button
            variant={timeFilter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTimeFilter('all')}
            className={cn("h-7 px-3 text-xs font-medium rounded shadow-none", timeFilter === 'all' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            Tudo
          </Button>
        </div>
      </div>

      {/* Tabela do Funil Completo (Fiel à Planilha Modelo) */}
      <div className="bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            {/* Header Nível 1 — Macro Grupos */}
            <thead>
              <tr className="border-b border-slate-200">
                <th colSpan={2} className="px-4 py-3 bg-slate-100/70 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-r border-slate-200">
                  Identificação da Campanha
                </th>
                <th colSpan={5} className="px-4 py-3 bg-blue-50/80 text-blue-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-blue-100">
                  Envio da Campanha
                </th>
                <th colSpan={7} className="px-4 py-3 bg-emerald-50/80 text-emerald-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-emerald-100">
                  Funil de Venda
                </th>
                <th colSpan={3} className="px-4 py-3 bg-purple-50/80 text-purple-900 font-bold uppercase tracking-wider text-[11px] text-center">
                  Funil de Formalização
                </th>
              </tr>

              {/* Header Nível 2 — Colunas Individuais */}
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                <th className="px-4 py-2.5">Campanha</th>
                <th className="px-2 py-2.5 text-center border-r border-slate-200">Início</th>
                
                {/* Envio */}
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Carregados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Enviados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Entregues</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Lidas</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950 border-r border-blue-100">Interagiram</th>

                {/* Venda */}
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Faturamento</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Valor Inicial</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Opt-in</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Aprovados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Recusados</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Simularam</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950 border-r border-emerald-100">OK Agente</th>

                {/* Formalização */}
                <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Aguar. Contato</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Em Atendimento</th>
                <th className="px-2.5 py-2.5 text-right font-semibold text-purple-950">Formalizado</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={17} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Carregando métricas consolidadas do funil...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Nenhuma campanha encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const isActive = row.status === 'active' || row.status === 'running';
                  return (
                    <tr 
                      key={row.campaignId}
                      onClick={() => onSelectCampaign?.(row.campaignId)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                    >
                      {/* Identificação com Bolinha de Status antes do Nome */}
                      <td className="px-4 py-3 font-semibold text-slate-900 max-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span 
                            title={isActive ? 'Campanha Ativa' : `Status: ${row.status}`}
                            className={cn(
                              "w-2.5 h-2.5 rounded-full shrink-0 shadow-sm transition-all",
                              isActive 
                                ? "bg-emerald-500 ring-2 ring-emerald-100" 
                                : "bg-slate-300 ring-2 ring-slate-100"
                            )} 
                          />
                          <span className="truncate">{row.campaignName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-slate-500 text-[11px] border-r border-slate-200">
                        {row.startDate ? format(row.startDate, 'dd/MM/yyyy') : '-'}
                      </td>

                      {/* Envio */}
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.carregados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.enviados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.entregues.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{row.lidas.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-blue-700 bg-blue-50/40 border-r border-blue-100">
                        {row.interagiram.toLocaleString('pt-BR')}
                      </td>

                      {/* Venda */}
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.faturamento.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.valorInicial.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.optIn.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">{row.aprovados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-50/20">{row.recusados.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{row.simularam.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/40 border-r border-emerald-100">
                        {row.okAgente.toLocaleString('pt-BR')}
                      </td>

                      {/* Formalização */}
                      <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-purple-50/20">{row.aguarContato.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono text-indigo-700 bg-purple-50/30">{row.emAtendimento.toLocaleString('pt-BR')}</td>
                      <td className="px-2.5 py-3 text-right font-mono font-black text-[#E5003A] bg-purple-50/40">
                        {row.formalizado.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Linha de Totais Gerais Consolidados */}
            {filteredData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-[11px] border-r border-slate-300">
                    Total Consolidado ({filteredData.length} Campanhas)
                  </td>

                  
                  {/* Envio */}
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.carregados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.enviados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.entregues.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-blue-100/40">{totals.lidas.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-blue-900 bg-blue-100/70 border-r border-blue-200">
                    {totals.interagiram.toLocaleString('pt-BR')}
                  </td>

                  {/* Venda */}
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.faturamento.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.valorInicial.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.optIn.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">{totals.aprovados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono text-rose-700 bg-emerald-100/40">{totals.recusados.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono bg-emerald-100/40">{totals.simularam.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-emerald-900 bg-emerald-100/70 border-r border-emerald-200">
                    {totals.okAgente.toLocaleString('pt-BR')}
                  </td>

                  {/* Formalização */}
                  <td className="px-2.5 py-3 text-right font-mono bg-purple-100/40">{totals.aguarContato.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono text-indigo-900 bg-purple-100/60">{totals.emAtendimento.toLocaleString('pt-BR')}</td>
                  <td className="px-2.5 py-3 text-right font-mono font-black text-[#E5003A] bg-purple-100/80">
                    {totals.formalizado.toLocaleString('pt-BR')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
