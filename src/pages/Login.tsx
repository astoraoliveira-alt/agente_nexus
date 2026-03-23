import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Activity, Terminal, Hexagon, Database, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import { AuthService } from '@/services/auth';

export default function Login() {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    localStorage.removeItem('davos_active_tenant_id');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isRegistering) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });

        if (authError) throw authError;

        if (authData.user) {
          await AuthService.createPendingUser(email, fullName, authData.user.id);
          toast.success('Protocolo de acesso enviado. Aguardando liberação do alto comando.');
          navigate('/pending-approval');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        if (data.user) {
          let userProfile = await AuthService.getUserByProviderId(data.user.id);

          if (!userProfile) {
            userProfile = await AuthService.linkProviderToUser(email, data.user.id);
            if (userProfile) {
              toast.success(`Conexão restabelecida, Subcomando ${userProfile.name}`);
            }
          }

          if (userProfile) {
            if (userProfile.status === 'blocked') {
              toast.error('Acesso revogado internamente. Contate a governança.');
              await supabase.auth.signOut();
              return;
            }
            if (userProfile.status === 'pending') {
              navigate('/pending-approval');
              return;
            }
          }

          toast.success('Conexão neural estabelecida. Bem-vindo à rede.');

          localStorage.setItem('davos_session', JSON.stringify({
            user: { email: data.user.email },
            token: data.session.access_token
          }));

          if (userProfile?.role === 'super_admin') {
            window.location.href = '/select-tenant';
          } else {
            window.location.href = '/';
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Falha de verificação biométrica/credencial.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#030303] text-white overflow-hidden relative selection:bg-accent selection:text-black font-sans antialiased">

      {/* 
        ================================================================
        LEFT PANEL: The "Torre de Controle" + Authentication Form
        ================================================================
      */}
      <div className="w-full lg:w-[45%] xl:w-[42%] flex flex-col justify-between p-6 md:p-8 lg:p-12 relative z-20 bg-[#0A0A0A] border-r border-white/5 overflow-y-auto overflow-x-hidden custom-scrollbar min-w-[420px]">

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <div className="flex-1 flex flex-col justify-between min-h-fit relative z-10 w-full max-w-2xl mx-auto">

          <div className="space-y-3 pt-2">
            <div className={`flex items-center gap-4 mb-8 transition-all duration-1000 ease-out ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
              <div className="flex flex-col items-start pt-1">
                <img src="/logo.png" alt="Davos Nexus" className="h-8 w-auto opacity-90 brightness-110" />
              </div>
              <div className="h-8 w-[1px] bg-white/20 mx-1" />
              <div className="space-y-0.5">
                <span className="block text-[9px] uppercase tracking-[0.4em] font-black text-white/50 leading-none">Nexus Hub v2.5</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] uppercase tracking-widest font-black text-accent/40 animate-pulse">Acesso_Privado_Ativo</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 relative z-20">
              <h1 className={`text-4xl md:text-5xl xl:text-7xl font-black tracking-tighter leading-[0.8] transition-all duration-1000 delay-100 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 blur-lg'}`}>
                ORQUESTRAR <br />
                <span className="text-accent underline decoration-accent/10 decoration-4 underline-offset-[-2px]">
                  RESULTADOS
                </span>
              </h1>
              <p className={`text-xs md:text-sm font-light text-white/40 mt-6 max-w-sm leading-relaxed transition-all duration-1000 delay-200 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                {isRegistering
                  ? 'Inicie o protocolo de integração com a malha neural DavoNexus.'
                  : 'Central de comando para orquestração de IAs multi-agentes e automação de alta performance.'}
              </p>
            </div>
          </div>

          <div className={`w-full max-w-md mt-10 mb-8 bg-[#050505] border border-white/10 p-6 shadow-2xl relative transition-all duration-1000 delay-300 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
            <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-accent/60" />
            <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-accent/60" />
            <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b border-l border-accent/60" />
            <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b border-r border-accent/60" />

            <div className="mb-6 relative z-10">
              <h2 className="text-lg font-black tracking-widest uppercase mb-1">
                {isRegistering ? 'Nova Credencial' : 'Autenticação'}
              </h2>
              <div className="h-[2px] w-8 bg-accent mb-3" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              {isRegistering && (
                <div className="space-y-2 group">
                  <Label className="text-[9px] uppercase tracking-widest font-bold text-white/40 group-focus-within:text-white transition-colors">Designação (Nome)</Label>
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-10 border-0 border-b border-white/10 bg-transparent rounded-none px-0 text-white focus-visible:ring-0 focus-visible:border-accent transition-colors font-mono"
                    placeholder="COMANDANTE.SMITH"
                  />
                </div>
              )}

              <div className="space-y-2 group">
                <Label className={`text-[9px] uppercase tracking-widest font-bold transition-colors ${activeField === 'email' ? 'text-accent' : 'text-white/40'}`}>
                  Identificador
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

              <div className="space-y-2 group">
                <Label className={`text-[9px] uppercase tracking-widest font-bold transition-colors flex justify-between ${activeField === 'password' ? 'text-accent' : 'text-white/40'}`}>
                  <span>Chave Encriptada</span>
                  {!isRegistering && (
                    <button type="button" onClick={() => navigate('/forgot-password')} className="hover:text-white">RECUPERAR</button>
                  )}
                </Label>
                <div className="relative flex items-center">
                  <div className="h-3 w-3 absolute left-0 flex items-center justify-center">
                    <div className={`w-1.5 h-1.5 rounded-full ${password.length > 0 ? 'bg-accent' : 'bg-white/20'}`} />
                  </div>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField(null)}
                    required
                    className="h-10 border-0 border-b border-white/10 bg-transparent rounded-none pl-6 pr-10 text-white focus-visible:ring-0 focus-visible:border-accent transition-colors font-mono tracking-widest placeholder:tracking-normal"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-10 w-10 flex items-center justify-end text-white/20 hover:text-white transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
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
                      AUTENTICANDO...
                    </span>
                  ) : (
                    <span className="relative z-10 flex items-center justify-center gap-3 group-hover:text-white">
                      {isRegistering ? 'INICIAR PROTOCOLO' : 'ABRIR TERMINAL'}
                      <div className="w-4 h-[1px] bg-black group-hover:bg-white" />
                    </span>
                  )}
                </Button>
              </div>
            </form>

            <div className="mt-8 pt-4 border-t border-white/5 flex justify-center text-[9px] font-mono tracking-widest uppercase">
              <button
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-white/30 hover:text-accent transition-colors"
              >
                {isRegistering ? '[ MODIFICAR PARA LOGIN ]' : '[ ATIVAR NOVA CREDENCIAL ]'}
              </button>
            </div>
          </div>

          <div className="space-y-1 pb-4">
            <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">DavoNexus Systems</p>
          </div>

        </div>
      </div>

      {/* 
        ================================================================
        RIGHT PANEL: ULTRA-REALISTIC CINEMATIC 3D ROBOT
        ================================================================
      */}
      <div className="hidden lg:block lg:flex-1 relative bg-black h-full border-l border-white/5 overflow-hidden">

        {/* Cinematic Backdrop */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,194,255,0.03)_0%,transparent_70%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:60px_60px] opacity-20" />
        </div>

        {/* Global Metadata - Ultra Minimal */}
        <div className="absolute top-12 right-12 z-30 text-right font-mono text-[10px] text-white/20 uppercase tracking-[0.3em]">
          <span className="text-white/40 font-black">NEXUS_CORE //</span> STATUS: ACTIVE
        </div>

        {/* Clear Visualization Area */}
        <div className={`relative z-20 w-full h-full flex flex-col items-center justify-center transition-all duration-1000 ease-out delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          
          <div className="relative group max-w-3xl">
             {/* Main Core Visual - No Text, No HUD pollution */}
             <div className="relative z-10 w-[600px] h-[600px] xl:w-[850px] xl:h-[850px] transition-all duration-1000">
                <img
                  src="/assets/images/nexus-core-min.png"
                  alt="Nexus Minimal Core"
                  className="w-full h-full object-contain filter contrast-110 brightness-110 drop-shadow-[0_0_100px_rgba(0,194,255,0.1)]"
                />
                
                {/* Subtle Neural Sync Effect - No Boxes */}
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                   <div className="w-[110%] h-[110%] border-[0.5px] border-white/5 rounded-full animate-[spin_120s_linear_infinite]" />
                </div>
             </div>
          </div>

          {/* LOWER LABEL - Minimalist */}
          <div className="absolute bottom-24 flex items-center gap-12 text-[10px] font-mono tracking-[0.5em] text-white/20 uppercase">
             <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-accent rounded-full animate-pulse" />
                <span>SYNC_ENGAGED</span>
             </div>
             <div>ORCHESTRATION_READY</div>
          </div>
        </div>

        {/* MINIMALIST GOVERNANCE FOOTER */}
        <div className="absolute bottom-0 inset-x-0 w-full bg-gradient-to-t from-black to-transparent pb-10">
          <div className="max-w-3xl mx-auto px-12 border-t border-white/5 pt-8">
             <div className="flex justify-between items-center text-[8px] font-mono tracking-[0.3em] text-white/30 uppercase">
                <div className="flex gap-10">
                   {['ISO 42001', 'ISO 27001', 'SOC2 TYPE II'].map((iso) => (
                     <div key={iso} className="hover:text-white transition-colors cursor-crosshair">
                       {iso}
                     </div>
                   ))}
                </div>
                <div className="flex items-center gap-4">
                   <span>SECURE_NODE: PSI-9</span>
                   <Hexagon className="w-3 h-3 text-white/10" />
                </div>
             </div>
          </div>
        </div>

      </div>

      {/* GLOBAL ANIMATIONS */}
      <style>{`
        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(10px) rotate(3deg); }
          100% { opacity: 1; transform: translateY(0) rotate(3deg); }
        }
        @keyframes slide-in-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(0); }
        }
        @keyframes scale-y {
          0% { transform: scaleY(0.2); }
          100% { transform: scaleY(1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-25px) rotate(1deg); }
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
