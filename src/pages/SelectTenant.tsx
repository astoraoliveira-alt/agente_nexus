import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, ArrowRight, LogOut, LayoutGrid, Building, Hexagon, Activity, Database, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Company } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function SelectTenant() {
  const navigate = useNavigate();
  const { switchTenant, currentUser } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const loadCompanies = async () => {
      try {
        const data = await api.getCompanies();
        setCompanies(data);
      } catch (error) {
        console.error('Failed to load companies:', error);
        toast.error('Erro ao carregar lista de empresas');
      } finally {
        setIsLoading(false);
      }
    };
    loadCompanies();
  }, []);

  const handleSelect = async (tenantId: string, name: string) => {
    try {
      await switchTenant(tenantId);
      toast.success(`Acessando ambiente: ${name}`);
      navigate('/');
    } catch (error) {
      console.error('Error switching tenant:', error);
      toast.error('Erro ao acessar o ambiente');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen w-full flex bg-[#030303] text-white overflow-hidden relative selection:bg-accent selection:text-black font-sans antialiased">
      
      {/* 
        ================================================================
        LEFT PANEL: Environment Selectorinteraction area
        ================================================================
      */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between p-6 md:p-8 lg:p-10 relative z-20 bg-[#0A0A0A] border-r border-white/5 overflow-hidden min-w-[380px]">
        
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <div className="flex-1 flex flex-col min-h-0 relative z-10 w-full">
          
          {/* Header */}
          <div className="space-y-3 pt-2 mb-8">
            <div className={`flex items-center justify-between transition-all duration-1000 ease-out ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-start pt-1">
                  <img src="/logo.png" alt="Davos Nexus" className="h-8 w-auto opacity-90 brightness-110" />
                </div>
                <div className="h-8 w-[1px] bg-white/20 mx-1" />
                <div className="space-y-0.5">
                  <span className="block text-[9px] uppercase tracking-[0.4em] font-black text-white/50 leading-none">Nexus Hub v2.5</span>
                  <span className="text-[8px] uppercase tracking-widest font-black text-accent/60">Seletor de Ambiente</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-white/30 hover:text-white hover:bg-white/5 transition-colors gap-2 text-[9px] uppercase tracking-widest font-black"
              >
                <LogOut className="h-3 w-3" />
                Sair
              </Button>
            </div>

            <div className="space-y-4 mt-8">
              <h1 className={`text-4xl md:text-5xl font-black tracking-tighter leading-none transition-all duration-1000 delay-100 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 blur-lg'}`}>
                ESCOLHA SEU <br />
                <span className="text-accent underline decoration-accent/20 decoration-8 underline-offset-[-2px]">
                  AMBIENTE
                </span>
              </h1>
              
              {/* Search Bar */}
              <div className="relative group transition-all duration-1000 delay-200 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20 group-focus-within:text-accent transition-colors" />
                <Input
                  placeholder="BUSCAR INSTÂNCIA..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 bg-black/40 border-white/5 rounded-none pl-12 focus-visible:ring-accent/30 uppercase font-mono text-[10px] tracking-widest text-white/90 placeholder:text-white/10"
                />
              </div>
            </div>
          </div>
          
          {/* Scrollable List */}
          <div className={`flex-1 overflow-y-auto custom-scrollbar pr-2 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-24 bg-white/[0.02] border border-white/5 animate-pulse" />
                ))}
              </div>
            ) : filteredCompanies.length > 0 ? (
              <div className="space-y-3 pb-8">
                {filteredCompanies.map((company, index) => (
                  <button
                    key={company.id}
                    onClick={() => handleSelect(company.id, company.name)}
                    className="group relative w-full text-left bg-[#050505] border border-white/10 p-5 hover:border-accent/40 transition-all duration-300 flex items-center justify-between"
                  >
                    <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white/5 group-hover:border-accent/30 transition-colors" />
                    
                    <div className="flex items-center gap-5">
                      <div className="w-10 h-10 bg-white/[0.03] flex items-center justify-center relative">
                        <Building className="h-5 w-5 text-white/20 group-hover:text-accent transition-colors" />
                        <div className="absolute inset-0 border border-white/5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black tracking-widest text-white/80 group-hover:text-white uppercase transition-colors">{company.name}</h3>
                        <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">/{company.slug}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="hidden sm:flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[7px] font-black text-white/20 uppercase">Acessar</span>
                        <ArrowRight className="h-3 w-3 text-accent" />
                      </div>
                      <div className={`h-1.5 w-1.5 rounded-full ${company.status === 'active' ? 'bg-green-500/40' : 'bg-amber-500/40'}`} />
                    </div>
                    
                    <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-accent transition-all duration-500 group-hover:w-full" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-white/5 bg-white/[0.01]">
                <LayoutGrid className="h-8 w-8 text-white/10 mb-4" />
                <p className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Nenhuma instância encontrada</p>
              </div>
            )}
          </div>
          
        </div>

        {/* Global Footer */}
        <div className="pt-6 border-t border-white/5 flex items-center justify-between">
           <div className="space-y-1">
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Multi-Tenant Routing</p>
            <p className="text-[8px] font-mono text-white/40 uppercase">Operator: {currentUser?.email || 'Authorized'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[8px] font-mono text-white/20">READY</span>
          </div>
        </div>
      </div>
      
      {/* 
        ================================================================
        RIGHT PANEL: ULTRA-REALISTIC CINEMATIC 3D ROBOT
        ================================================================
      */}
      <div className="hidden lg:block lg:flex-1 relative bg-[#020202] overflow-hidden h-full border-l border-white/5 flex flex-col items-center justify-center">
        
        {/* Cinematic Background Video */}
        <div className="absolute inset-0 z-0">
           <video 
             autoPlay 
             loop 
             muted 
             playsInline 
             className="w-full h-full object-cover opacity-40 grayscale contrast-125 brightness-75 scale-110"
           >
             <source src="https://static.videezy.com/system/resources/previews/000/054/938/original/AI-Brain.mp4" type="video/mp4" />
           </video>
           <div className="absolute inset-0 bg-gradient-to-r from-[#020202] via-transparent to-[#020202] opacity-80" />
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020202_90%)] opacity-60" />
        </div>

        {/* Global HUD Layout */}
        <div className="absolute top-8 right-8 z-30 text-right font-mono text-[9px] text-white/30 hidden xl:block uppercase tracking-tighter">
           ROUTING: <span className="text-white/60">ACTIVE</span><br />
           CLUSTER_ID: <span className="text-white/60">ALPHA-CORE-26</span><br />
           <span className="text-accent text-xs mt-2 block animate-pulse">AURA_OS: READY</span>
        </div>

        {/* Core Visualization Area */}
        <div className={`relative z-20 w-full h-[70vh] flex flex-col items-center justify-center transition-all duration-1000 ease-out delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          
          <div className="relative w-full max-w-2xl flex items-center justify-center">
            
            {/* THE ROBOT AGENT */}
            <div className="relative z-10 w-80 h-80 xl:w-[500px] xl:h-[500px] group">
               <div className="absolute inset-[-100px] bg-accent/10 rounded-full blur-[120px] animate-pulse pointer-events-none" />
               <img 
                 src="/assets/images/ai-agent-v26.png" 
                 alt="AI Agent" 
                 className="w-full h-full object-contain filter brightness-125 drop-shadow-[0_0_50px_rgba(0,194,255,0.4)] transition-transform duration-700"
               />
               <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[110%] h-[80%] border border-accent/20 rounded-full border-dashed animate-[spin_25s_linear_infinite] pointer-events-none" />
               <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[130%] h-[90%] border border-white/5 rounded-full animate-[spin_40s_linear_infinite_reverse] pointer-events-none" />
            </div>

            {/* Terminal Widgets */}
            <div className="absolute -right-16 top-1/4 bg-[#0A0A0A]/90 border border-white/10 p-4 font-mono text-[9px] text-white/50 w-56 hidden 2xl:block shadow-2xl backdrop-blur-md z-30 animate-[glitch_8s_infinite]">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
                <span className="text-white font-bold tracking-widest uppercase">Env_Scan</span>
                <Activity className="h-3 w-3 text-accent" />
              </div>
              <p className="text-white/40 mb-1">{'>'} cluster_integrity: 100%</p>
              <p className="text-accent/60 mb-1">{'>'} latency_stabilization: OK</p>
              <p className="text-white/40 mb-1">{'>'} waiting_selection...</p>
              <div className="w-full bg-white/5 h-1 mt-2 rounded overflow-hidden">
                <div className="bg-accent h-full w-[10%] animate-pulse" />
              </div>
            </div>

            <div className="absolute -left-16 bottom-1/4 bg-[#0A0A0A]/90 border border-white/10 p-4 font-mono text-[9px] text-white/50 w-48 hidden 2xl:block shadow-2xl backdrop-blur-md z-30">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
                <span className="text-white font-bold tracking-widest uppercase">Traffic_IO</span>
                <Database className="h-3 w-3 text-accent" />
              </div>
              <div className="flex items-end gap-1 mt-3">
                {[20, 40, 60, 30, 80, 50].map((h, i) => (
                  <div key={i} className="flex-1 bg-white/5 h-8 relative overflow-hidden">
                    <div 
                      className="bg-accent/60 absolute bottom-0 left-0 right-0" 
                      style={{ 
                        height: `${h}%`, 
                        animation: `scale-y 1.3s infinite alternate ease-in-out`, 
                        animationDelay: `${i * 0.2}s`,
                        transformOrigin: 'bottom'
                      }} 
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-center space-y-4 z-20 pointer-events-none">
             <div className="flex items-center justify-center gap-3 text-[10px] font-black tracking-[0.8em] text-accent uppercase">
              <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-accent/40" />
              <span className="animate-pulse flex items-center gap-2 tracking-[0.2em]"><Cpu className="h-3 w-3 text-accent opacity-50"/> AGENTE_ROUTING: ON-LINE</span>
              <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-accent/40" />
            </div>
          </div>
        </div>

        {/* ISO BLOCK */}
        <div className="absolute bottom-10 inset-x-0 w-full text-center space-y-4 z-30">
          <div className="flex items-center justify-center gap-4 opacity-20">
             <div className="h-[1px] flex-1 max-w-[100px] bg-gradient-to-r from-transparent to-white" />
             <Hexagon className="h-4 w-4" />
             <div className="h-[1px] flex-1 max-w-[100px] bg-gradient-to-l from-transparent to-white" />
          </div>
          <h2 className="text-lg font-black tracking-[0.5em] text-white/70 uppercase leading-none">
            CONFORMIDADE & GOVERNANÇA
          </h2>

          <div className="flex justify-center items-center gap-10 mt-6 font-mono">
            {[
              { code: '42001', label: 'IA RESPONSÁVEL' },
              { code: '27001', label: 'SEGURANÇA CYBER' },
              { code: '23894', label: 'GESTÃO DE RISCOS' }
            ].map(iso => (
              <div key={iso.code} className="text-center group border-l border-white/5 pl-6 first:border-0 border-white/10">
                <p className="text-[11px] font-black text-accent tracking-[0.2em] group-hover:text-white transition-all">ISO {iso.code}</p>
                <p className="text-[8px] text-white/20 uppercase mt-1 tracking-tighter group-hover:text-accent/60">{iso.label}</p>
              </div>
            ))}
          </div>
        </div>
        
      </div>
      
      {/* GLOBAL ANIMATIONS */}
      <style>{`
        @keyframes scale-y {
          0% { transform: scaleY(0.2); }
          100% { transform: scaleY(1); }
        }
        @keyframes glitch {
          0% { transform: translate(0); }
          90% { transform: translate(0); }
          92% { transform: translate(-2px, 1px) skewX(2deg); }
          94% { transform: translate(2px, -1px) skewX(-2deg); }
          96% { transform: translate(0); }
        }
      `}</style>
    </div>
  );
}
