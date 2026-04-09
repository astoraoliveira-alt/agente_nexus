import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Activity, Terminal, ShieldAlert, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState('');

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      const now = new Date();
      setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`);
    }, 47);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API
    toast.success('Protocolo de resgate enviado para a caixa de entrada.');
    setIsLoading(false);
  };

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
        <div className={`text-[25vw] font-black uppercase tracking-tighter text-white/[0.02] leading-none transition-transform duration-[2000ms] ease-out ${mounted ? 'scale-100' : 'scale-110'}`}>
          RECOVERY
        </div>
      </div>

      {/* 
        ================================================================
        LAYER 1: CENTRAL COMMAND MONOLITH
        ================================================================
      */}
      <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
        
        <div className={`w-full max-w-[480px] transition-all duration-1000 ease-out delay-100 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'}`}>
          
          {/* HEADER BRANDING */}
          <div className="flex flex-col items-center mb-10 text-center">
            
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter leading-none mb-4 flex flex-col pt-10">
              <span className="text-white">SISTEMA DE</span>
              <span className="text-[#00D2FF] drop-shadow-[0_0_15px_rgba(0,210,255,0.5)] bg-clip-text">SEGURANÇA</span>
            </h1>
            
            <div className="flex items-center gap-2 border border-[#00D2FF]/30 bg-[#00D2FF]/5 px-4 py-1.5 rounded-none backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 h-full w-2 bg-gradient-to-r from-transparent to-[#00D2FF]/20 animate-[pulseSweep_2s_linear_infinite]" />
              <Activity className="w-3 h-3 text-[#00D2FF] animate-pulse" />
              <span className="text-[9px] font-mono font-bold tracking-[0.3em] text-[#00D2FF] uppercase pt-0.5">
                Protocolo de Redefinição de Segurança
              </span>
            </div>
            
            <p className="text-[10px] text-white/50 font-mono tracking-widest uppercase mt-4 max-w-[80%]">
              Insira o identificador atrelado à matricula para envio do código de resgate neurológico.
            </p>
          </div>

          {/* THE FORM BOX (Pure Brutalism) */}
          <div className="relative bg-[#020617]/90 backdrop-blur-xl p-8 sm:p-10 border border-white/10 group/monolith hover:border-[#00D2FF]/50 transition-colors duration-500 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            
            {/* CORNER TARGETS */}
            <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t-[2px] border-l-[2px] border-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.3)] transition-all duration-300 group-hover/monolith:w-6 group-hover/monolith:h-6" />
            <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-[2px] border-r-[2px] border-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.3)] transition-all duration-300 group-hover/monolith:w-6 group-hover/monolith:h-6" />
            <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-[1px] border-r-[1px] border-white/30" />
            <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-[1px] border-l-[1px] border-white/30" />

            <div className="flex justify-between items-end mb-8 relative z-10 border-b border-white/10 pb-4">
              <h2 className="text-[10px] font-black text-white/50 tracking-[0.3em] uppercase flex items-center gap-2">
                <Terminal className="w-3 h-3 text-[#00D2FF]" />
                RECUPERAR_ACESSO
              </h2>
              <span className="font-mono text-[8px] text-[#00D2FF]/50 opacity-80 uppercase tracking-widest tabular-nums font-bold">
                {time}
              </span>
            </div>

            <form onSubmit={handleReset} className="space-y-6">
              
              <div className="space-y-2 relative group">
                <Label className={`text-[9px] uppercase tracking-[0.2em] font-bold transition-colors ${activeField === 'email' ? 'text-[#00D2FF]' : 'text-white/40'}`}>
                  Identificador Corporativo
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setActiveField('email')}
                    onBlur={() => setActiveField(null)}
                    required
                    className="h-12 border-0 border-b-2 border-white/10 bg-white/[0.02] rounded-none px-4 text-sm text-white focus-visible:ring-0 focus-visible:border-[#00D2FF] focus-visible:bg-[#00D2FF]/[0.02] transition-all font-mono shadow-none"
                    placeholder="root@empresa.com"
                  />
                  {activeField === 'email' && (
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#00D2FF] rounded-full shadow-[0_0_8px_rgba(0,210,255,0.8)] animate-pulse" />
                  )}
                </div>
              </div>

              {/* INFO BOX */}
              <div className="mt-4 p-3 bg-[#00D2FF]/[0.02] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[2px] h-full bg-[#00D2FF]" />
                <p className="text-[9px] font-mono tracking-widest uppercase text-white/40 leading-relaxed">
                   <span className="text-[#00D2FF] font-bold">INFO:</span> O protocolo expira em 15 minutos. Verifique sua pasta de segurança (spam) se necessário.
                </p>
              </div>

              {/* ACTION BUTTON (High Impact) */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-14 bg-gradient-to-r from-[#00D2FF] to-[#0066FF] text-white hover:opacity-90 rounded-none uppercase font-black tracking-[0.3em] text-[11px] relative overflow-hidden transition-all duration-300 group/btn shadow-[0_0_20px_rgba(0,210,255,0.3)] hover:shadow-[0_0_30px_rgba(0,210,255,0.6)]"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                  
                  {isLoading ? (
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      <Activity className="h-4 w-4 animate-spin" />
                      PROCESSANDO...
                    </span>
                  ) : (
                     <span className="relative z-10 flex items-center justify-center gap-3 transition-transform duration-300 group-hover/btn:scale-105">
                      ENVIAR LINK DE RESGATE
                      <Mail className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>
          
          <div className="mt-6 flex justify-center text-[9px] font-mono tracking-widest uppercase relative z-10">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-white/30 hover:text-[#00D2FF] transition-colors border border-transparent hover:border-white/20 bg-[#020617]/50 backdrop-blur-sm focus:outline-none"
            >
              [ VOLTAR PARA O LOGIN ]
            </button>
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
      <div className="absolute bottom-8 w-full flex justify-center gap-10 font-mono z-30 pointer-events-none hidden md:flex opacity-60">
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

      <div className="absolute bottom-6 left-8 z-30 flex items-center gap-3 text-[8px] font-mono text-white/20 uppercase tracking-[0.3em] pointer-events-none hidden md:flex">
        <ShieldAlert className="w-3 h-3 text-[#00D2FF]" />
        <span>SECURE_NODE: SR-9 // RECOVERY</span>
      </div>

      <div className="absolute bottom-6 right-8 z-30 flex items-center gap-3 text-[8px] font-mono text-white/20 uppercase tracking-[0.3em] pointer-events-none hidden md:flex">
        <span>LAT: 32ms // SYNC: ENCRYPTED //</span>
        <div className="w-1.5 h-1.5 bg-[#00D2FF] animate-pulse shadow-[0_0_5px_rgba(0,210,255,1)]" />
      </div>

      <style>{`
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
        @keyframes pulseSweep {
         0% { transform: translateX(-100%); opacity: 0; }
         50% { opacity: 1; }
         100% { transform: translateX(500%); opacity: 0; }
        }
        @keyframes shimmer {
         0% { transform: translateX(-100%); }
         100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
