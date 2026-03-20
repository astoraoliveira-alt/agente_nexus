import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Activity, Terminal, Hexagon, Database, Cpu } from 'lucide-react';
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API
    toast.success('Protocolo de resgate enviado para a caixa de entrada.');
    setIsLoading(false);
  };

  return (
    <div className="h-screen w-full flex bg-[#030303] text-white overflow-hidden relative selection:bg-accent selection:text-black font-sans antialiased">
      
      {/* 
        ================================================================
        LEFT PANEL: Interaction Terminal
        ================================================================
      */}
      <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col justify-between p-6 md:p-8 lg:p-10 relative z-20 bg-[#0A0A0A] border-r border-white/5 overflow-y-auto overflow-x-hidden custom-scrollbar min-w-[380px]">
        
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <div className="flex-1 flex flex-col justify-between min-h-fit relative z-10 w-full max-w-md mx-auto xl:max-w-lg">
          
          <div className="space-y-3 pt-2">
            <div className={`flex items-center gap-4 mb-4 transition-all duration-1000 ease-out ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
              <div className="flex flex-col items-start pt-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/login')}>
                <img src="/logo.png" alt="Davos Nexus" className="h-8 w-auto opacity-90 brightness-110" />
              </div>
              <div className="h-8 w-[1px] bg-white/20 mx-1" />
              <button 
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-black text-accent hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Voltar ao Login
              </button>
            </div>

            <div className="space-y-2 relative z-20">
              <h1 className={`text-4xl md:text-5xl xl:text-6xl font-black tracking-tighter leading-[0.9] transition-all duration-1000 delay-100 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 blur-lg'}`}>
                SISTEMA DE <br />
                <span className="text-accent underline decoration-accent/20 decoration-8 underline-offset-[-2px]">
                  SEGURANÇA
                </span>
              </h1>
              <p className={`text-sm md:text-base font-light text-white/60 mt-4 max-w-sm leading-relaxed transition-all duration-1000 delay-200 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                <span className="text-accent font-bold tracking-wider mr-2 uppercase text-[10px]">RECOVERY //</span>
                Insira seu e-mail corporativo para iniciar o protocolo de redefinição de segurança.
              </p>
            </div>
          </div>
          
          <div className={`w-full mt-10 mb-8 bg-[#050505] border border-white/10 p-6 shadow-2xl relative transition-all duration-1000 delay-300 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
            <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-accent/60" />
            <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-accent/60" />
            <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b border-l border-accent/60" />
            <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b border-r border-accent/60" />
              
            <div className="mb-6 relative z-10">
              <h2 className="text-lg font-black tracking-widest uppercase mb-1">
                Recuperar Acesso
              </h2>
              <div className="h-[2px] w-8 bg-accent mb-3" />
            </div>

            <form onSubmit={handleReset} className="space-y-8 relative z-10">
              <div className="space-y-2 group">
                <Label className={`text-[9px] uppercase tracking-widest font-bold transition-colors ${activeField === 'email' ? 'text-accent' : 'text-white/40'}`}>
                  Identificador Corporativo
                </Label>
                <div className="relative flex items-center">
                  <Terminal className="h-3 w-3 absolute left-0 text-white/20" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setActiveField('email')}
                    onBlur={() => setActiveField(null)}
                    required
                    className="h-10 border-0 border-b border-white/10 bg-transparent rounded-none pl-6 pr-0 text-white focus-visible:ring-0 focus-visible:border-accent transition-colors font-mono"
                    placeholder="root@empresa.com"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-white text-black hover:bg-accent hover:text-white rounded-none uppercase font-black tracking-widest text-[11px] group relative overflow-hidden transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-accent translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
                  {isLoading ? (
                     <span className="relative z-10 flex items-center justify-center gap-2">
                       <Activity className="h-3 w-3 animate-spin" />
                       PROCESSANDO...
                     </span>
                  ) : (
                    <span className="relative z-10 flex items-center justify-center gap-3 group-hover:text-white">
                      ENVIAR LINK DE RESGATE
                      <Mail className="h-3 w-3" />
                    </span>
                  )}
                </Button>
              </div>
            </form>
            
            <div className="mt-8 pt-4 border-t border-white/5 flex flex-col gap-3 text-[9px] font-mono tracking-widest uppercase">
              <div className="p-3 bg-white/[0.02] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[2px] h-full bg-accent" />
                <p className="text-white/40 leading-relaxed">
                   <span className="text-white font-bold">INFO:</span> O protocolo de resgate expira em 15 minutos. Verifique sua pasta de segurança (spam) se necessário.
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-1 pb-4">
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Aura Intelligence Systems</p>
            <p className="text-[8px] font-mono text-white/60 uppercase">Security_Node: SR-9 // Build_2026.02</p>
          </div>
          
        </div>
      </div>
      
      {/* 
        ================================================================
        RIGHT PANEL: ULTRA-REALISTIC CINEMATIC 3D ROBOT
        ================================================================
      */}
      <div className="hidden lg:block lg:flex-1 relative bg-[#020202] overflow-hidden h-full border-l border-white/5 flex flex-col items-center justify-center">
        
        {/* Cinematic Background */}
        <div className="absolute inset-0 z-0">
           <div className="absolute inset-0 bg-gradient-to-r from-[#020202] via-transparent to-[#020202] opacity-80" />
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020202_90%)] opacity-60" />
        </div>

        {/* Global HUD Layout */}
        <div className="absolute top-8 right-8 z-30 text-right font-mono text-[9px] text-white/30 hidden xl:block uppercase tracking-tighter">
           SECURE_CHANNEL: <span className="text-white/60">ENCRYPTED</span><br />
           CLUSTER_ID: <span className="text-white/60">SECURITY-CORE-01</span><br />
           <span className="text-accent text-xs mt-2 block animate-pulse">AURA_OS: SHIELDING</span>
        </div>

        {/* Core Visualization Area */}
        <div className={`relative z-20 w-full h-[70vh] flex flex-col items-center justify-center transition-all duration-1000 ease-out delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          
          <div className="relative w-full max-w-2xl flex items-center justify-center">
            
            {/* THE ROBOT AGENT */}
            <div className="relative z-10 w-80 h-80 xl:w-[550px] xl:h-[550px] group">
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
                <span className="text-white font-bold tracking-widest uppercase">ID_Verification</span>
                <Activity className="h-3 w-3 text-accent" />
              </div>
              <p className="text-white/40 mb-1">{'>'} integrity_check: PASS</p>
              <p className="text-accent/60 mb-1">{'>'} identity_vault: LOCKED</p>
              <p className="text-white/40 mb-1">{'>'} waiting_token...</p>
              <div className="w-full bg-white/5 h-1 mt-2 rounded overflow-hidden">
                <div className="bg-accent h-full w-[45%] animate-pulse" />
              </div>
            </div>

            <div className="absolute -left-16 bottom-1/4 bg-[#0A0A0A]/90 border border-white/10 p-4 font-mono text-[9px] text-white/50 w-48 hidden 2xl:block shadow-2xl backdrop-blur-md z-30">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
                <span className="text-white font-bold tracking-widest uppercase">Encryption_Log</span>
                <Database className="h-3 w-3 text-accent" />
              </div>
              <div className="flex items-end gap-1 mt-3">
                {[30, 60, 40, 50, 45, 90].map((h, i) => (
                  <div key={i} className="flex-1 bg-white/5 h-8 relative overflow-hidden">
                    <div 
                      className="bg-accent/60 absolute bottom-0 left-0 right-0" 
                      style={{ 
                        height: `${h}%`, 
                        animation: `scale-y 1s infinite alternate ease-in-out`, 
                        animationDelay: `${i * 0.1}s`,
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
              <span className="animate-pulse flex items-center gap-2 tracking-[0.2em]"><ShieldCheck className="h-3 w-3 text-accent opacity-50"/> AGENTE_SECURE: STANDBY</span>
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

// Mock ShieldCheck as it was used in code but not imported from lucide-react in Login 
function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
