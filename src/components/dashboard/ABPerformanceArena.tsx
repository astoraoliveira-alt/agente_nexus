import React from 'react';
import { Bot, TrendingUp, Zap, Target, Trophy, CheckCircle, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Mock data items
const MOCK_EXPERIMENT = {
  name: "Batalha de Sofia: Empatia vs Direta",
  daysActive: 12,
  totalTraffic: 2450,
  agents: [
    {
      id: 'a',
      name: 'Sofia Alpha',
      role: 'Variante Empática (Contexto Amigável)',
      contacts: 1225,
      sent: 5400,
      received: 4200,
      conversions: 147,
      avgResponseTime: '42s',
      status: 'active'
    },
    {
      id: 'b',
      name: 'Sofia Beta',
      role: 'Variante Direta (Foco em Link)',
      contacts: 1225,
      sent: 3200,
      received: 2900,
      conversions: 221,
      avgResponseTime: '28s',
      status: 'active'
    }
  ]
};

export function ABPerformanceArena() {
  const [agentA, agentB] = MOCK_EXPERIMENT.agents;
  
  const convRateA = (agentA.conversions / agentA.contacts) * 100;
  const convRateB = (agentB.conversions / agentB.contacts) * 100;
  const winnerId = convRateB > convRateA ? 'b' : 'a';

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700">
      {/* Header Sutil - Padrão Nexus */}
      <div className="bg-white border border-border/50 p-8 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-500/5 rounded-full -ml-32 -mb-32 blur-3xl" />
        
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg shrink-0">
            <Bot className="h-7 w-7" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{MOCK_EXPERIMENT.name}</h2>
              <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-50 px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
                {MOCK_EXPERIMENT.daysActive} DIAS ATIVOS
              </Badge>
            </div>
            <p className="text-slate-500 font-medium text-xs flex items-center gap-2">
              <TrendingUp className="h-3 w-3" /> Monitoramento em tempo real de variantes comportamentais
            </p>
          </div>
        </div>
        
        <div className="flex gap-12 items-center px-6 relative z-10">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 tracking-widest">Tráfego Total</p>
            <p className="text-3xl font-black text-slate-900 tabular-nums">{MOCK_EXPERIMENT.totalTraffic.toLocaleString()}</p>
          </div>
          <div className="w-px h-12 bg-border/50" />
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 tracking-widest">Conversão Média</p>
            <p className="text-3xl font-black text-blue-600 font-mono">
              {((convRateA + convRateB) / 2).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Arena Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgentBattleCard 
          agent={agentA} 
          convRate={convRateA} 
          isWinner={winnerId === 'a'}
          theme="blue"
        />
        <AgentBattleCard 
          agent={agentB} 
          convRate={convRateB} 
          isWinner={winnerId === 'b'} 
          theme="emerald"
        />
      </div>

      {/* Pipeline Analytics - Sutil */}
      <div className="bg-white border border-border/50 p-8 rounded-2xl shadow-sm space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" /> Pipeline de Conversão
            </h3>
            <p className="text-xs text-slate-400 font-medium tracking-tight">Análise comparativa por estágio operacional</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-bold text-slate-600 uppercase tracking-wider">
            <Trophy className="h-4 w-4 text-amber-500" /> Gap de Performance: <span className="text-slate-950 font-black ml-1">{Math.abs(convRateA - convRateB).toFixed(1)}%</span> a favor da {winnerId === 'b' ? 'Beta' : 'Alpha'}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FunnelStep 
            label="1. Ingestão" 
            subLabel="Leads Qualificados Iniciais"
            sub={agentA.contacts} 
            sub2={agentB.contacts} 
            max={Math.max(agentA.contacts, agentB.contacts)} 
          />
          <FunnelStep 
            label="2. Engajamento" 
            subLabel="Handshake IA (Received)"
            sub={agentA.received} 
            sub2={agentB.received} 
            max={Math.max(agentA.received, agentB.received)} 
          />
          <FunnelStep 
            label="3. Conversão" 
            subLabel="Link de Proposta Entregue"
            sub={agentA.conversions} 
            sub2={agentB.conversions} 
            max={Math.max(agentA.conversions, agentB.conversions)} 
            isHighlight
          />
        </div>
      </div>
    </div>
  );
}

function AgentBattleCard({ agent, convRate, isWinner, theme }: any) {
  const isEmerald = theme === 'emerald';
  const colorClass = isEmerald ? 'text-emerald-600' : 'text-blue-600';
  const progressBg = isEmerald ? 'bg-emerald-500' : 'bg-blue-600';

  return (
    <div className={cn(
      "relative rounded-2xl border p-8 flex flex-col gap-6 transition-all duration-300 bg-white",
      isWinner ? "border-slate-900 shadow-xl ring-1 ring-slate-950/5 scale-[1.01]" : "border-border/50 shadow-sm opacity-90 grayscale-[0.3]"
    )}>
      {isWinner && (
        <div className={cn("absolute -top-3 left-8 px-4 py-1 text-[9px] font-black text-white uppercase tracking-[0.2em] rounded-full shadow-lg", isEmerald ? 'bg-emerald-500' : 'bg-blue-600')}>
          Top Performer
        </div>
      )}

      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-900 rounded-xl border border-border/50">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900 leading-none">{agent.name}</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">{agent.role}</p>
          </div>
        </div>
        
        <div className="text-right">
          <p className={cn("text-4xl font-black tabular-nums tracking-tighter", colorClass)}>{convRate.toFixed(1)}%</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mt-1.5 tracking-widest">Conversão</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 py-6 border-y border-slate-50">
        <div className="space-y-3">
          <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 tracking-tighter">
            <span>Engajamento</span>
            <span className="text-slate-950">{((agent.received / agent.sent || 1)*100).toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden shadow-inner">
             <div className={cn("h-full transition-all duration-1000", progressBg)} style={{ width: `${(agent.received / agent.sent || 1)*100}%` }} />
          </div>
        </div>
        
        <div className="flex items-center justify-between border-l border-slate-100 pl-8">
           <div className="flex flex-col">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Latência</span>
             <span className="text-base font-black text-slate-950 italic">{agent.avgResponseTime}</span>
           </div>
           <div className="flex flex-col text-right">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Mensagens</span>
             <span className="text-base font-black text-slate-950">{agent.sent.toLocaleString()}</span>
           </div>
        </div>
      </div>

      <div className={cn(
        "p-5 rounded-xl border flex items-center justify-between transition-all duration-500",
        isWinner ? "bg-slate-950 text-white border-slate-950 shadow-2xl" : "bg-white text-slate-950 border-border/50"
      )}>
         <div className="flex items-center gap-3">
           <CheckCircle className={cn("w-5 h-5", isWinner ? "text-emerald-500" : "text-emerald-600")} />
           <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Links Entregues</span>
         </div>
         <span className="text-2xl font-black tabular-nums">{agent.conversions} <span className="opacity-20 text-lg mx-1">/</span> {agent.contacts}</span>
      </div>
    </div>
  );
}

function FunnelStep({ label, subLabel, sub, sub2, max, isHighlight = false }: any) {
  return (
    <div className={cn(
      "p-6 rounded-xl border transition-all duration-300 flex flex-col gap-6",
      isHighlight ? "bg-slate-50 border-slate-200 ring-4 ring-slate-50 shadow-inner" : "bg-white border-border/50 shadow-sm"
    )}>
      <div className="space-y-1.5 border-b border-border/50 pb-4">
        <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">{label}</p>
        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">{subLabel}</p>
      </div>
      
      <div className="space-y-6">
        <div className="space-y-2.5">
          <div className="flex justify-between text-[10px] px-1">
            <span className="text-slate-500 font-bold">ALPHA</span>
            <span className="text-slate-950 font-black">{sub.toLocaleString()}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
             <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${(sub/max)*100}%` }} />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex justify-between text-[10px] px-1">
            <span className="text-slate-500 font-bold">BETA</span>
            <span className="text-slate-950 font-black">{sub2.toLocaleString()}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
             <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(sub2/max)*100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
