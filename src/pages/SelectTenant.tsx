import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, LogOut, LayoutGrid, Building, ShieldAlert, Cpu, Network } from 'lucide-react';
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
  const [time, setTime] = useState('');

  useEffect(() => {
    setMounted(true);
    const loadCompanies = async () => {
      try {
        const data = await api.getCompanies();
        setCompanies(data);
        if (data.length === 1) {
          await switchTenant(data[0].id);
          navigate('/');
          return;
        }
      } catch (error) {
        console.error('Failed to load companies:', error);
        toast.error('Erro ao carregar lista de empresas');
      } finally {
        setIsLoading(false);
      }
    };
    loadCompanies();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`);
    }, 47);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = async (tenantId: string, name: string) => {
    try {
      await switchTenant(tenantId);
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
    <div className="h-screen w-full relative bg-[#020617] text-white font-sans overflow-hidden selection:bg-[#00D2FF] selection:text-black">
      
      {/* 
        ================================================================
        LAYER 0: CYBER GRID & ALIGNMENT STRUCTURE
        ================================================================
      */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden">
        {/* Moving Grid Background */}
        <div className="absolute -inset-[100%] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] animate-[panGrid_20s_linear_infinite]" />
      </div>

      {/* AMBIENT GLOWS IN THE BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-none mix-blend-screen overflow-hidden">
         <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#00D2FF]/10 rounded-full blur-[120px] animate-[floatOrb_15s_ease-in-out_infinite_alternate]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[#0066FF]/10 rounded-full blur-[150px] animate-[floatOrb_25s_ease-in-out_infinite_alternate_reverse]" />
      </div>

      {/* VERTICAL & HORIZONTAL SCANLINES */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-50">
        <div className="absolute left-[15%] w-[1px] h-[200%] top-[-50%] bg-gradient-to-b from-transparent via-[#00D2FF] to-transparent animate-[scanVertical_6s_linear_infinite]" />
        <div className="absolute right-[15%] w-[1px] h-[200%] top-[-50%] bg-gradient-to-t from-transparent via-[#0066FF] to-transparent animate-[scanVertical_8s_linear_infinite_reverse]" />
        
        <div className="absolute top-[20%] left-[-50%] w-[200%] h-[1px] bg-gradient-to-r from-transparent via-[#00D2FF] to-transparent animate-[scanHorizontal_10s_linear_infinite]" />
        <div className="absolute bottom-[20%] left-[-50%] w-[200%] h-[1px] bg-gradient-to-l from-transparent via-[#0066FF] to-transparent animate-[scanHorizontal_12s_linear_infinite_reverse]" />
      </div>

      {/* MASSIVE TYPOGRAPHIC HERO BACKGROUND */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden mix-blend-overlay">
        <div className={`text-[25vw] font-black uppercase tracking-tighter text-white/[0.02] leading-none transition-transform duration-[2000ms] ease-out flex opacity-60 ${mounted ? 'scale-100' : 'scale-110'}`}>
          ROUTING
        </div>
      </div>

      {/* 
        ================================================================
        LAYER 1: CENTRAL COMMAND MONOLITH
        ================================================================
      */}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4">
        
        <div className={`w-full max-w-[600px] transition-all duration-1000 ease-out delay-100 flex flex-col h-[85vh] ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'}`}>
          
          {/* THE MONOLITH BOX (Pure Brutalism) */}
          <div className="relative flex-1 flex flex-col bg-[#020617]/90 backdrop-blur-xl p-6 sm:p-10 border border-white/10 group/monolith hover:border-[#00D2FF]/50 transition-colors duration-500 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            
            {/* CORNER TARGETS */}
            <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t-[2px] border-l-[2px] border-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.3)] transition-all duration-300 group-hover/monolith:w-6 group-hover/monolith:h-6" />
            <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-[2px] border-r-[2px] border-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.3)] transition-all duration-300 group-hover/monolith:w-6 group-hover/monolith:h-6" />
            <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-[1px] border-r-[1px] border-white/30" />
            <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-[1px] border-l-[1px] border-white/30" />

            <div className="flex justify-between items-end mb-6 relative z-10 border-b border-white/10 pb-4 shrink-0">
              <h2 className="text-[10px] font-black text-[#00D2FF] tracking-[0.3em] uppercase flex items-center gap-2">
                <Network className="w-3 h-3 text-[#00D2FF]" />
                ROUTING_MASTER_NODE
              </h2>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="text-white/30 hover:text-[#00D2FF] hover:bg-transparent transition-colors p-0 h-auto gap-2 text-[8px] uppercase tracking-[0.2em] font-black focus:outline-none"
              >
                <LogOut className="h-3 w-3" />
                SAIR / LOGOUT
              </Button>
            </div>

            <div className="space-y-4 mb-8 shrink-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-[0.9]">
                <span className="text-white">SELECIONE O </span><br />
                <span className="text-[#00D2FF] drop-shadow-[0_0_15px_rgba(0,210,255,0.5)] bg-clip-text">
                  AMBIENTE DE TRABALHO
                </span>
              </h1>
              
              {/* Search Bar */}
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20 group-focus-within:text-[#00D2FF] transition-colors" />
                <Input
                  placeholder="FILTRAR INSTÂNCIAS ABERTAS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 bg-white/[0.02] border-0 border-b-2 border-white/10 rounded-none pl-12 focus-visible:ring-0 focus-visible:border-[#00D2FF] uppercase font-mono text-[10px] tracking-widest text-[#00D2FF] placeholder:text-white/20 transition-all shadow-none"
                />
              </div>
            </div>
            
            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 -mr-4 space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 bg-white/[0.02] border border-white/5 animate-pulse rounded-none" />
                  ))}
                </div>
              ) : filteredCompanies.length > 0 ? (
                filteredCompanies.map((company, index) => (
                  <button
                    key={company.id}
                    onClick={() => handleSelect(company.id, company.name)}
                    className="group relative w-full text-left bg-[#050505] border border-white/10 p-5 hover:border-[#00D2FF]/50 transition-all duration-300 flex items-center justify-between"
                  >
                    <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-white/5 group-hover:border-[#00D2FF]/30 transition-colors" />
                    
                    <div className="flex items-center gap-5 relative z-10">
                      <div className="w-10 h-10 bg-white/[0.03] flex items-center justify-center relative border border-white/5 group-hover:border-[#00D2FF]/30 transition-colors">
                        <Building className="h-4 w-4 text-white/30 group-hover:text-[#00D2FF] transition-colors" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black tracking-[0.2em] text-white/80 group-hover:text-white uppercase transition-colors">{company.name}</h3>
                        <p className="text-[9px] font-mono text-[#00D2FF]/60 uppercase tracking-[0.2em]">/{company.slug}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 relative z-10">
                      <div className="hidden sm:flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] font-black text-[#00D2FF] uppercase tracking-widest">INICIAR ROTAS</span>
                        <ArrowRight className="h-3 w-3 text-white" />
                      </div>
                      <div className={`h-1.5 w-1.5 shadow-[0_0_10px_currentColor] ${company.status === 'active' ? 'bg-[#00CC00] text-[#00CC00]' : 'bg-[#FF3B00] text-[#FF3B00]'}`} />
                    </div>
                    
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00D2FF]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#00D2FF] transition-all duration-500 group-hover:w-full" />
                  </button>
                ))
              ) : (
                <div className="h-full min-h-[150px] flex flex-col items-center justify-center border border-white/5 bg-white/[0.01]">
                  <LayoutGrid className="h-8 w-8 text-[#00D2FF]/20 mb-4 animate-pulse" />
                  <p className="text-[#00D2FF]/40 uppercase tracking-[0.3em] text-[10px] font-bold">NENHUM NODE ENCONTRADO</p>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>

      {/* TOP & BOTTOM HUD TICKERS */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-[#00D2FF] z-50 shadow-[0_0_20px_rgba(0,210,255,0.8)] flex items-center overflow-hidden">
        <div className="w-[10%] h-full bg-white opacity-80 block animate-[slide_3s_ease-in-out_infinite_alternate]" />
      </div>
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white/10 z-50 flex items-center overflow-hidden">
         <div className="w-[30%] h-full bg-[#00D2FF] opacity-80 block animate-[slide_6s_linear_infinite_reverse]" />
      </div>

      {/* ISO BLOCK HUD */}
      <div className="absolute bottom-6 w-full flex justify-center gap-10 font-mono z-30 pointer-events-none hidden md:flex opacity-60">
        {[
          { code: '42001', label: 'IA RESPONSÁVEL' },
          { code: '27001', label: 'SEGURANÇA CYBER' },
          { code: '23894', label: 'GESTÃO RISCOS' }
        ].map(iso => (
          <div key={iso.code} className="text-center group border-l border-white/5 pl-6 first:border-0">
            <p className="text-[10px] font-black text-[#00D2FF] tracking-[0.2em] transition-all">ISO {iso.code}</p>
            <p className="text-[8px] text-white/40 uppercase mt-1 tracking-tighter">{iso.label}</p>
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 left-8 z-30 flex items-center gap-3 text-[8px] font-mono text-white/20 uppercase tracking-[0.3em] pointer-events-none hidden md:flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3 h-3 text-[#00D2FF]" />
          <span>MULTI-TENANT_ROUTING: ACTIVE</span>
        </div>
        <span className="text-white/40">OPERATOR: {currentUser?.email || 'AUTHORIZED'}</span>
      </div>

      <div className="absolute bottom-4 right-8 z-30 flex items-center gap-3 text-[8px] font-mono text-white/20 uppercase tracking-[0.3em] pointer-events-none hidden md:flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span>LAT: 32ms // SYNC: ENCRYPTED //</span>
          <div className="w-1.5 h-1.5 bg-[#00D2FF] animate-pulse shadow-[0_0_5px_rgba(0,210,255,1)]" />
        </div>
        <span className="text-[#00D2FF] font-bold">{time}</span>
      </div>

      <style>{`
        /* Custom Scrollbar for the monolith */
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 210, 255, 0.3);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 210, 255, 0.8);
        }

        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(1000%); }
        }
        @keyframes scanVertical {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(50%); }
        }
        @keyframes scanHorizontal {
         0% { transform: translateX(-50%); }
         100% { transform: translateX(50%); }
        }
        @keyframes panGrid {
         0% { transform: translateY(0) translateX(0); }
         100% { transform: translateY(40px) translateX(40px); }
        }
        @keyframes floatOrb {
         0% { transform: translate(0, 0) scale(1); }
         50% { transform: translate(5%, 5%) scale(1.1); }
         100% { transform: translate(-5%, 10%) scale(0.9); }
        }
      `}</style>
    </div>
  );
}
