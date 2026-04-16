import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LogOut, LayoutGrid, Building, ArrowRight, Network } from 'lucide-react';
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
        if (data.length === 1) {
          await switchTenant(data[0].id);
          navigate('/');
          return;
        }
      } catch (error) {
        console.error('Failed to load companies:', error);
        toast.error('Erro ao carregar lista de ambientes');
      } finally {
        setIsLoading(false);
      }
    };
    loadCompanies();
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
    <div className="h-screen w-full relative bg-[#050505] text-neutral-100 font-sans overflow-hidden flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-[#FF4500] selection:text-white">

      {/* 
        ================================================================
        LAYER 0: KINETIC ARCHITECTURAL BACKGROUND
        ================================================================
      */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        
        {/* Subtle premium film grain overlay */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04] mix-blend-overlay z-10">
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>

        {/* Slow drifting monolithic slabs (acting like tectonic plates) */}
        <div className="absolute -top-[5%] -right-[10%] w-[60vw] h-[55vh] bg-[#0A0A0B] border border-[#111] rounded-[2px] animate-[float1_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[5%] -left-[10%] w-[50vw] h-[40vh] bg-[#080808] border border-[#111] rounded-[2px] animate-[float2_25s_ease-in-out_infinite]" />
        
        {/* Slow panning architectural guide lines */}
        <div className="absolute top-[35%] left-0 w-[200vw] h-[1px] bg-gradient-to-r from-transparent via-neutral-800/40 to-transparent animate-[panRight_30s_linear_infinite]" />
        <div className="absolute top-0 right-[25vw] w-[1px] h-[200vh] bg-gradient-to-b from-transparent via-neutral-800/40 to-transparent animate-[panDown_40s_linear_infinite]" />
        
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-[#FF4500]/[0.015] rounded-full blur-[100px] animate-[pulseSlow_10s_ease-in-out_infinite_alternate]" />
      </div>

      {/* 
        ================================================================
        LAYER 0.5: PERIMETER LIGHT BEAMS
        ================================================================
      */}
      <div className="absolute inset-0 z-40 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-[#FF4500]/10 overflow-hidden">
          <div className="absolute top-0 h-full w-[25vw] bg-gradient-to-r from-transparent via-[#FF4500] to-transparent shadow-[0_0_15px_#FF4500] animate-[slideRight_6s_linear_infinite]" />
        </div>
        <div className="absolute bottom-0 right-0 w-full h-[2px] bg-[#FF4500]/10 overflow-hidden">
          <div className="absolute bottom-0 h-full w-[25vw] bg-gradient-to-l from-transparent via-[#FF4500] to-transparent shadow-[0_0_15px_#FF4500] animate-[slideLeft_6s_linear_infinite]" />
        </div>
        <div className="absolute top-0 right-0 w-[2px] h-full bg-[#FF4500]/10 overflow-hidden hidden sm:block">
          <div className="absolute right-0 w-full h-[25vh] bg-gradient-to-b from-transparent via-[#FF4500] to-transparent shadow-[0_0_15px_#FF4500] animate-[slideDown_8s_linear_infinite]" />
        </div>
        <div className="absolute bottom-0 left-0 w-[2px] h-full bg-[#FF4500]/10 overflow-hidden hidden sm:block">
          <div className="absolute left-0 w-full h-[25vh] bg-gradient-to-t from-transparent via-[#FF4500] to-transparent shadow-[0_0_15px_#FF4500] animate-[slideUp_8s_linear_infinite]" />
        </div>
      </div>

      {/* 
        ================================================================
        LAYER 1: MAIN FORM MONOLITH (STAGGERED)
        ================================================================
      */}
      <div 
        className="relative w-full max-w-[540px] z-20 flex flex-col h-[85vh] transition-all duration-1000 ease-out group"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)'
        }}
      >
        
        {/* SUB-LAYER 1 (Deepest Offset) - The Kinetic Layer */}
        <div className="absolute -inset-0 bg-[#080808] border border-neutral-800/80 rounded-[2px] translate-x-3 translate-y-3 z-0 transition-transform duration-500 ease-out group-hover:translate-x-4 group-hover:translate-y-4 shadow-[10px_10px_30px_rgba(0,0,0,0.8)]" />
        
        {/* SUB-LAYER 2 (Mid Offset) */}
        <div className="absolute -inset-0 bg-[#0D0D0D] border border-neutral-800/90 rounded-[2px] translate-x-1.5 translate-y-1.5 z-0 transition-transform duration-500 ease-out group-hover:translate-x-2 group-hover:translate-y-2" />

        {/* MAIN INTERACTIVE LAYER */}
        <div className="relative z-10 bg-[#121212] border border-neutral-800 p-6 sm:p-8 rounded-[2px] flex flex-col flex-1 shadow-2xl backdrop-blur-sm overflow-hidden">
          
          {/* HEADER SECTION */}
          <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-[#FF4500]" />
              <span className="text-[11px] font-bold tracking-[0.15em] text-neutral-400 uppercase">
                Seleção de Ambiente
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-neutral-500 hover:text-[#FF4500] hover:bg-transparent transition-colors p-0 h-auto gap-2 text-[10px] uppercase font-bold tracking-wider focus:outline-none"
            >
              <LogOut className="h-3 w-3" />
              Desconectar
            </Button>
          </div>

          <div className="space-y-4 mb-8 shrink-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2 leading-tight">
              Acesso ao Sistema <br/>
              <span className="text-neutral-400">Corporativo</span>
            </h1>
            
            {/* Search Bar */}
            <div className="relative group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 group-focus-within/search:text-[#FF4500] transition-colors" />
              <Input
                placeholder="Buscar ambiente interno..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 bg-[#1A1A1A] border-0 border-b-2 border-transparent focus-visible:border-[#FF4500] hover:bg-[#1E1E1E] focus-visible:bg-[#1E1E1E] rounded-[2px] pl-12 text-sm text-white transition-all shadow-none placeholder:text-neutral-600 font-medium focus-visible:ring-0"
              />
            </div>
          </div>
          
          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 bg-[#1A1A1A] animate-pulse rounded-[2px]" />
                ))}
              </div>
            ) : filteredCompanies.length > 0 ? (
              filteredCompanies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleSelect(company.id, company.name)}
                  className="group/item relative w-full text-left bg-[#151515] hover:bg-[#1A1A1A] border border-neutral-800 hover:border-[#FF4500]/50 p-5 transition-all duration-300 flex items-center justify-between rounded-[2px]"
                >
                  <div className="flex items-center gap-5 relative z-10">
                    <div className="w-10 h-10 bg-[#0F0F0F] flex items-center justify-center border border-neutral-800 transition-colors group-hover/item:border-[#FF4500]/30 rounded-[2px]">
                      <Building className="h-4 w-4 text-neutral-500 group-hover/item:text-[#FF4500] transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold tracking-wide text-neutral-300 group-hover/item:text-white transition-colors">{company.name}</h3>
                      <p className="text-[11px] font-medium text-neutral-600" style={{ letterSpacing: '0.05em' }}>/{company.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 relative z-10">
                    <div className="hidden sm:flex items-center gap-2 opacity-0 group-hover/item:opacity-100 transition-all transform translate-x-2 group-hover/item:translate-x-0">
                      <span className="text-[10px] font-bold text-[#FF4500] uppercase tracking-wider">Acessar</span>
                      <ArrowRight className="h-3 w-3 text-[#FF4500]" />
                    </div>
                    <div className={`h-2 w-2 rounded-full ${company.status === 'active' ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
                  </div>
                </button>
              ))
            ) : (
              <div className="h-full min-h-[150px] flex flex-col items-center justify-center border border-dashed border-neutral-800 bg-[#151515] rounded-[2px]">
                <LayoutGrid className="h-8 w-8 text-neutral-700 mb-4" />
                <p className="text-neutral-500 text-xs font-semibold">Nenhum ambiente encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM INFO BAR */}
      <div className="absolute bottom-6 w-full flex justify-center gap-12 font-mono z-30 pointer-events-none hidden md:flex opacity-60">
        {[
          { code: '42001', label: 'IA RESPONSÁVEL' },
          { code: '27001', label: 'SEGURANÇA CYBER' },
          { code: '23894', label: 'GESTÃO RISCOS' }
        ].map(iso => (
          <div key={iso.code} className="text-center group border-l border-neutral-800 pl-8 first:border-0">
            <p className="text-[11px] font-bold text-neutral-400 tracking-wider">ISO {iso.code}</p>
            <p className="text-[9px] text-neutral-600 uppercase mt-1 tracking-widest">{iso.label}</p>
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 left-8 z-30 flex items-center gap-2 pointer-events-none hidden md:flex">
        <span className="w-1.5 h-1.5 bg-[#FF4500] rounded-sm shadow-[0_0_5px_rgba(255,69,0,0.5)]" />
        <span className="text-neutral-600 font-mono text-[9px] tracking-widest font-bold uppercase">
          OPERADOR: <span className="text-neutral-400">{currentUser?.email || 'AUTENTICADO'}</span>
        </span>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }

        @keyframes float1 {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-40px) rotate(0deg); }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0) rotate(5deg); }
          50% { transform: translateY(30px) rotate(2deg); }
        }
        @keyframes panRight {
          0% { transform: translateX(-50vw); }
          100% { transform: translateX(50vw); }
        }
        @keyframes panDown {
          0% { transform: translateY(-50vh); }
          100% { transform: translateY(50vh); }
        }
        @keyframes pulseSlow {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes slideRight {
          0% { left: -30vw; }
          100% { left: 100vw; }
        }
        @keyframes slideLeft {
          0% { right: -30vw; }
          100% { right: 100vw; }
        }
        @keyframes slideDown {
          0% { top: -30vh; }
          100% { top: 100vh; }
        }
        @keyframes slideUp {
          0% { bottom: -30vh; }
          100% { bottom: 100vh; }
        }
      `}</style>
    </div>
  );
}
