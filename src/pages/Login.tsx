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
      <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col justify-between p-6 md:p-8 lg:p-10 relative z-20 bg-[#0A0A0A] border-r border-white/5 overflow-y-auto overflow-x-hidden custom-scrollbar min-w-[380px]">

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <div className="flex-1 flex flex-col justify-between min-h-fit relative z-10 w-full max-w-md mx-auto xl:max-w-lg">

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
              <h1 className={`text-4xl md:text-5xl xl:text-6xl font-black tracking-tighter leading-[0.9] transition-all duration-1000 delay-100 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 blur-lg'}`}>
                {isRegistering ? 'SOLICITAR' : 'TORRE DE'} <br />
                <span className="text-accent underline decoration-accent/20 decoration-8 underline-offset-[-2px]">
                  {isRegistering ? 'ACESSO' : 'CONTROLE'}
                </span>
              </h1>
              <p className={`text-sm md:text-base font-light text-white/60 mt-4 max-w-sm leading-relaxed transition-all duration-1000 delay-200 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                <span className="text-accent font-bold tracking-wider mr-2 uppercase text-[10px]">AURA OS //</span>
                {isRegistering
                  ? 'Cadastre-se para obter acesso à orquestração de agentes.'
                  : 'Orquestração de agentes autônomos em escala corporativa.'}
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
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Aura Intelligence Systems</p>
            <p className="text-[8px] font-mono text-white/60 uppercase">Auth_Node: SA-1 // Build_2026.02</p>
          </div>

        </div>
      </div>

      {/* 
        ================================================================
        RIGHT PANEL: ULTRA-REALISTIC CINEMATIC 3D ROBOT
        ================================================================
      */}
      <div className="hidden lg:block lg:flex-1 relative bg-[#020202] overflow-hidden h-full border-l border-white/5 flex flex-col items-center justify-center">

        {/* Cinematic Background (Ensures movement and ultra-realism) */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#020202] via-transparent to-[#020202] opacity-80" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020202_90%)] opacity-60" />
        </div>

        {/* Global HUD Layout */}
        <div className="absolute top-8 right-8 z-30 text-right font-mono text-[9px] text-white/30 hidden xl:block uppercase tracking-tighter">
          LATENCY: <span className="text-white/60">14MS</span><br />
          CLUSTER_ID: <span className="text-white/60">ALPHA-CORE-26</span><br />
          <span className="text-accent text-xs mt-2 block animate-pulse">AURA_OS: MONITORING</span>
        </div>

        {/* Core Visualization Area */}
        <div className={`relative z-20 w-full h-[70vh] flex flex-col items-center justify-center transition-all duration-1000 ease-out delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>

          <div className="relative w-full max-w-2xl flex items-center justify-center">

            {/* THE ROBOT AGENT (Ultra-Realistic local image fallback + video depth) */}
            <div className="relative z-10 w-80 h-80 xl:w-[550px] xl:h-[550px] group">
              {/* Heavy Glitch/Glow Aura */}
              <div className="absolute inset-[-100px] bg-accent/10 rounded-full blur-[120px] animate-pulse pointer-events-none" />

              <img
                src="/assets/images/ai-agent-v26.png"
                alt="AI Agent Official"
                className="w-full h-full object-contain filter brightness-125 hover:scale-105 transition-transform duration-700 drop-shadow-[0_0_50px_rgba(0,194,255,0.4)]"
                onError={(e) => {
                  // Fallback to high quality CSS if image fails again
                  e.currentTarget.style.display = 'none';
                }}
              />

              {/* Orbital Rings around the robot */}
              <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[110%] h-[80%] border border-accent/20 rounded-full border-dashed animate-[spin_25s_linear_infinite] pointer-events-none" />
              <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[130%] h-[90%] border border-white/5 rounded-full animate-[spin_40s_linear_infinite_reverse] pointer-events-none" />
            </div>

            {/* Terminal Widgets */}
            <div className="absolute -right-16 top-1/4 bg-[#0A0A0A]/90 border border-white/10 p-4 font-mono text-[9px] text-white/50 w-56 hidden 2xl:block shadow-2xl backdrop-blur-md z-30 animate-[glitch_8s_infinite]">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
                <span className="text-white font-bold tracking-widest uppercase">Node_Analysis</span>
                <Activity className="h-3 w-3 text-accent" />
              </div>
              <p className="text-white/40 mb-1">{'>'} kernel_state: NOMINAL</p>
              <p className="text-accent/60 mb-1">{'>'} neural_link: ESTABLISHED</p>
              <p className="text-white/40 mb-1">{'>'} risk_level: ZERO</p>
              <div className="w-full bg-white/5 h-1 mt-2 rounded overflow-hidden">
                <div className="bg-accent h-full w-[92%] animate-pulse" />
              </div>
            </div>

            <div className="absolute -left-16 bottom-1/4 bg-[#0A0A0A]/90 border border-white/10 p-4 font-mono text-[9px] text-white/50 w-48 hidden 2xl:block shadow-2xl backdrop-blur-md z-30">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
                <span className="text-white font-bold tracking-widest uppercase">Memory_Sync</span>
                <Database className="h-3 w-3 text-accent" />
              </div>
              <div className="flex items-end gap-1 mt-3">
                {[40, 80, 50, 95, 60, 75].map((h, i) => (
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
              <span className="animate-pulse flex items-center gap-2 tracking-[0.2em] transition-all"><Cpu className="h-3 w-3 text-accent opacity-50" /> AGENTE_CORE: ON-LINE</span>
              <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-accent/40" />
            </div>
          </div>
        </div>

        {/* ISO BLOCK - Clean & Professional */}
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
