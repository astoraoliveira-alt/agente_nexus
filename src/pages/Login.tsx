import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck, Zap, Lock, Activity, Hexagon, Globe, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { AuthService } from '@/services/auth';

// Mock users removed - using Real DB Auth (Simulated)

export default function Login() {
  const navigate = useNavigate();
  // State for Mode (Login vs Register)
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState(''); // New for registration
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  // Mounted effect for animation trigger
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    localStorage.removeItem('davos_active_tenant_id');
  }, []);

  // Handle Login or Register
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isRegistering) {
        // --- REGISTRATION FLOW ---
        // 1. Create in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });

        if (authError) throw authError;

        if (authData.user) {
          // 2. Create Public User Record (Service Layer)
          await AuthService.createPendingUser(email, fullName, authData.user.id);

          toast.success('Solicitação enviada! Aguarde a aprovação.');
          navigate('/pending-approval');
        }

      } else {
        // --- LOGIN FLOW ---
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        if (data.user) {
          // Check Business Status via Service
          const userProfile = await AuthService.getUserByProviderId(data.user.id);

          // Handle First-Time Login / Auto-Link
          if (!userProfile) {
            const linked = await AuthService.linkProviderToUser(email, data.user.id);
            if (linked) {
              toast.success(`Bem-vindo de volta, ${linked.name}`);
            } else {
              // If checking by email fails too, it's a raw unlinked user ??
              // Could be a very old user or database inconsistency.
              // For now, let AppContext handle the "No Profile" state (it might redirect or show error)
            }
          } else {
            if (userProfile.status === 'blocked') {
              toast.error('Acesso Bloqueado. Contate o administrador.');
              await supabase.auth.signOut();
              return;
            }
            if (userProfile.status === 'pending') {
              navigate('/pending-approval');
              return;
            }
          }

          toast.success('Login realizado com sucesso.');

          // Legacy Session Set (for ProtectedRoute immediate check)
          // Ideally we remove this dependency, but keeping for stability
          localStorage.setItem('davos_session', JSON.stringify({
            user: { email: data.user.email },
            token: data.session.access_token
          }));

          // Redirect - Force Reload to Ensure Context Refresh
          window.location.href = '/';
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro na autenticação. Verifique suas credenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#050505] text-white overflow-hidden relative selection:bg-accent selection:text-accent-foreground grain-texture">

      {/* LEFT PANEL: The Terminal (Interaction Area) */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between p-6 md:p-8 lg:p-10 relative z-10 bg-black/40 backdrop-blur-sm border-r border-white/5 overflow-hidden">

        <div className="flex-1 flex flex-col justify-between scale-[0.9] xl:scale-95 origin-top-left">
          {/* Header - Staggered entrance */}
          <div className="space-y-3 pt-2">
            <div className={`flex items-center gap-4 mb-6 transition-all duration-1000 ease-out ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
              <div className="relative group/client">
                <img src="/client-logo.png" alt="Edenred" className="h-10 w-auto drop-shadow-[0_0_20px_rgba(255,255,255,0.05)]" />
              </div>
              <div className="h-8 w-[1px] bg-white/20 mx-1" />
              <div className="flex flex-col items-start pt-1">
                <span className="text-[7px] uppercase tracking-[0.3em] font-bold text-white/30 mb-0.5 ml-1">Powered by</span>
                <img src="/logo.png" alt="Davos Nexus" className="h-6 w-auto opacity-80 brightness-110" />
              </div>
              <div className="h-8 w-[1px] bg-white/20 mx-1" />
              <div className="space-y-0.5">
                <span className="block text-[9px] uppercase tracking-[0.4em] font-black text-white/50 leading-none">Nexus Hub v2.5</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] uppercase tracking-widest font-black text-accent/40 animate-pulse">Acesso_Privado_Ativo</span>
                </div>
              </div>
            </div>

            <div className="space-y-0">
              <h1 className={`text-5xl md:text-6xl xl:text-7xl font-black tracking-tighter leading-[0.85] transition-all duration-1000 delay-100 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 blur-lg'}`}>
                {isRegistering ? 'SOLICITAR' : 'TORRE DE'} <br />
                <span className="text-accent underline decoration-accent/20 decoration-8 underline-offset-[-2px]">
                  {isRegistering ? 'ACESSO' : 'CONTROLE'}
                </span>
              </h1>
              <p className={`text-lg font-light text-white/70 mt-6 max-w-sm leading-relaxed transition-all duration-1000 delay-200 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                <span className="text-accent font-bold tracking-wider mr-2 uppercase text-[10px]">AURA OS //</span>
                {isRegistering
                  ? 'Cadastre-se para obter acesso à orquestração de agentes.'
                  : 'Orquestração de agentes autônomos em escala corporativa.'}
              </p>
            </div>
          </div>

          {/* Form Section */}
          <div className={`w-full max-w-sm mt-6 space-y-6 transition-all duration-1000 delay-300 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>

            <form onSubmit={handleSubmit} className="space-y-5 group">

              {/* Full Name Field (Register Only) */}
              {isRegistering && (
                <div className="space-y-2 group/field animate-in fade-in slide-in-from-top-4 duration-500">
                  <Label className="text-[9px] uppercase tracking-[0.25em] font-black text-white/50">Nome Completo</Label>
                  <Input
                    type="text"
                    placeholder="Seu Nome"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-12 bg-white/[0.02] border border-white/10 rounded-none focus-visible:ring-1 focus-visible:ring-accent/50 px-4 text-base"
                  />
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2 group/field">
                <Label className={`text-[9px] uppercase tracking-[0.25em] font-black transition-colors duration-300 ${activeField === 'email' ? 'text-accent' : 'text-white/50'}`}>
                  Identificação / Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu_email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setActiveField('email')}
                  onBlur={() => setActiveField(null)}
                  required
                  className="h-12 bg-white/[0.02] border border-white/10 rounded-none focus-visible:ring-1 focus-visible:ring-accent/50 px-4 text-base"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2 group/field">
                <Label className={`text-[9px] uppercase tracking-[0.25em] font-black transition-colors duration-300 ${activeField === 'password' ? 'text-accent' : 'text-white/50'}`}>
                  Chave de Acesso
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField(null)}
                    required
                    className="h-12 bg-white/[0.02] border border-border/50 rounded-none focus-visible:ring-1 focus-visible:ring-accent/50 px-4 text-base pr-12"
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-white/20 hover:text-white transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 bg-white text-black hover:bg-accent hover:text-white transition-all duration-500 rounded-none uppercase tracking-[0.3em] font-black text-[10px] relative overflow-hidden group/btn disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 border-2 border-black/20 border-t-black animate-spin rounded-full" />
                    <span>Processando...</span>
                  </div>
                ) : (
                  <span className="flex items-center gap-3 relative z-10">
                    <span className="w-2 h-[1px] bg-current" />
                    {isRegistering ? 'SOLICITAR ACESSO' : 'ENTRAR NO SISTEMA'}
                    <span className="w-2 h-[1px] bg-current" />
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-accent opacity-0 group-hover/btn:opacity-100 transition-opacity blur-[2px]" />
              </Button>
            </form>

            {/* Toggle Logic */}
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-white/40 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="hover:text-accent transition-colors flex items-center gap-2"
              >
                {isRegistering ? '← Voltar para Login' : 'Solicitar Novo Acesso →'}
              </button>

              {!isRegistering && (
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="hover:text-white transition-colors"
                >
                  Esqueci a Senha
                </button>
              )}
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Aura Intelligence Systems</p>
            <p className="text-[8px] font-mono text-white/80 uppercase">Auth_Node: SA-1 // Build_2026.02</p>
          </div>
          <div className="flex gap-1.5">
            <div className="h-4 w-[1px] bg-white/5" />
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="h-4 w-1 bg-accent/20" />
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: The Deep Data Sea */}
      <div className="hidden lg:block w-[55%] xl:w-[60%] relative bg-[#0a0a0a] overflow-hidden grain-texture h-full">
        {/* Subtle grid with mouse interaction (simulated via CSS mask/radial) */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,_rgba(0,255,194,0.05)_0%,_rgba(0,0,0,0)_50%)] z-10" />

        {/* Technical Data Grid */}
        <div className="absolute inset-0 grid grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(20,minmax(0,1fr))] opacity-[0.03] z-0">
          {Array.from({ length: 400 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-white" />
          ))}
        </div>

        {/* Full-Body AI Agent - Aura: Enthusiastic & Alive */}
        <div className={`absolute inset-0 flex flex-col items-center justify-between py-10 xl:py-14 z-20 transition-all duration-[2000ms] ease-out delay-500 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-110 blur-2xl'}`}>

          {/* Internal Zoom Container for Right Panel Items */}
          <div className="flex-1 flex flex-col items-center justify-between w-full scale-[0.85] xl:scale-90 origin-center h-full">

            {/* Agent Container - Flexible and Scalable */}
            <div className="flex-1 flex flex-col items-center justify-center w-full max-h-[55vh] relative animate-aura-float px-6">
              <div className="relative group/aura flex flex-col items-center">
                {/* Environment Halos */}
                <div className="absolute -inset-20 rounded-full border border-accent/20 animate-[ping_3s_infinite]" />

                {/* THE AGENT STRUCTURE */}
                <div className="relative flex flex-col items-center scale-90 xl:scale-100 transition-transform duration-700">
                  {/* 1. HEAD SECTION */}
                  <div className="relative w-36 h-36 xl:w-44 xl:h-44 flex flex-col items-center justify-center z-30">
                    {/* Head Shell */}
                    <div className="absolute inset-0 border border-white/10 bg-black/80 backdrop-blur-3xl rounded-[3rem] shadow-[0_0_60px_rgba(0,194,255,0.15)]" />

                    {/* Face Plate */}
                    <div className="relative z-10 flex flex-col items-center gap-5 mt-4">
                      {/* Eyebrows */}
                      <div className="flex gap-12 absolute -top-2">
                        <div className="w-8 h-1 bg-accent/40 rounded-full animate-aura-brow -rotate-12" />
                        <div className="w-8 h-1 bg-accent/40 rounded-full animate-aura-brow rotate-12" />
                      </div>

                      {/* Eyes / Olhos */}
                      <div className="flex gap-8">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-2 bg-accent/20 rounded-full overflow-hidden">
                            <div className="h-full bg-accent animate-aura-blink w-full" />
                          </div>
                          <div className="w-10 h-10 border border-accent/40 flex items-center justify-center p-2 rounded-xl bg-accent/5">
                            <div className="w-5 h-5 bg-accent animate-aura-scan shadow-[0_0_20px_rgba(0,194,255,0.8)] rounded-sm" />
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-2 bg-accent/20 rounded-full overflow-hidden">
                            <div className="h-full bg-accent animate-aura-blink w-full" />
                          </div>
                          <div className="w-10 h-10 border border-accent/40 flex items-center justify-center p-2 rounded-xl bg-accent/5">
                            <div className="w-5 h-5 bg-accent animate-aura-scan shadow-[0_0_20px_rgba(0,194,255,0.8)] rounded-sm" />
                          </div>
                        </div>
                      </div>

                      {/* Mouth */}
                      <div className="mt-2 flex flex-col items-center justify-center min-h-[16px]">
                        <div className="bg-accent animate-aura-talk shadow-[0_0_15px_rgba(0,194,255,0.6)] w-[50px] h-[3px]" />
                      </div>
                    </div>
                  </div>

                  {/* 2. TORSO */}
                  <div className="relative w-32 h-24 bg-gradient-to-b from-white/15 to-transparent border-x border-t border-white/10 rounded-t-[3.5rem] -mt-6 z-20 overflow-hidden">
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                      <div className="w-4 h-4 bg-accent rounded-full animate-pulse shadow-[0_0_25px_rgba(0,194,255,1)]" />
                    </div>
                  </div>

                  {/* 3. ARMS & HANDS */}
                  <div className="absolute top-44 w-full flex justify-between px-[-1rem] z-10 pointer-events-none">
                    <div className="relative w-14 h-28 border-l-2 border-t-2 border-accent/40 rounded-tl-[2.5rem] origin-top-right animate-aura-hand-l -ml-12">
                      <div className="absolute bottom-0 left-[-4px] w-3 h-3 bg-accent/60 rounded-full shadow-[0_0_15px_rgba(0,194,255,0.8)]" />
                    </div>
                    <div className="relative w-14 h-28 border-r-2 border-t-2 border-accent/40 rounded-tr-[2.5rem] origin-top-left animate-aura-hand-r -mr-12">
                      <div className="absolute bottom-0 right-[-4px] w-3 h-3 bg-accent/60 rounded-full shadow-[0_0_15px_rgba(0,194,255,0.8)]" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 xl:mt-10 space-y-2 xl:space-y-3 text-center">
                  <div className="flex items-center justify-center gap-3 text-[9px] font-black tracking-[0.6em] text-accent uppercase">
                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-accent/40" />
                    <span className="animate-pulse">Aura: Agente Ativo</span>
                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-accent/40" />
                  </div>
                  <p className="text-sm text-white/70 font-medium max-w-[240px] leading-relaxed">
                    Olá! Estou pronta para otimizar sua operação com inteligência e entusiasmo.
                  </p>
                </div>

                {/* Strategic Metrics */}
                <div className="absolute top-1/2 left-full ml-16 -translate-y-1/2 w-48 hidden xl:block">
                  <div className="h-[1px] w-full bg-gradient-to-r from-accent/50 to-transparent mb-4" />
                  <div className="space-y-4 font-mono text-[10px] text-accent/80 uppercase tracking-widest">
                    <div className="flex justify-between items-center group/m">
                      <span>Sistema Operante</span>
                      <div className="flex gap-1 animate-pulse"><div className="w-1 h-1 bg-accent rounded-full" /><div className="w-1 h-1 bg-accent rounded-full delay-75" /></div>
                    </div>
                    <div className="flex justify-between items-center group/m">
                      <span>Eficiência</span>
                      <span className="text-white font-bold bg-white/10 px-1.5 py-0.5 rounded-sm">99.8%</span>
                    </div>
                    <div className="flex justify-between items-center group/m">
                      <span>Agentes On</span>
                      <span className="text-white font-bold bg-white/10 px-1.5 py-0.5 rounded-sm">08</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer - Final Section (ISO/Compliance) */}
            <div className="w-full text-center space-y-2 xl:space-y-3 max-w-lg px-6 mt-2">
              <div className="flex items-center justify-center gap-3 opacity-20">
                <div className="h-[1px] w-8 bg-white" />
                <Hexagon className="h-3 w-3" />
                <div className="h-[1px] w-8 bg-white" />
              </div>

              <h2 className="text-2xl xl:text-3xl font-black tracking-[0.4em] text-white uppercase leading-none">
                CONFORMIDADE & GOVERNANÇA
              </h2>

              <div className="grid grid-cols-2 gap-x-6 xl:gap-x-10 gap-y-2 xl:gap-y-3">
                {[
                  { code: '42001', label: 'Gestão de IA Responsável' },
                  { code: '27001', label: 'Segurança Cibernética' },
                  { code: '23894', label: 'Gestão de Riscos' },
                  { code: 'TR 24028', label: 'Auditoria de Confiança' }
                ].map(iso => (
                  <div key={iso.code} className="text-left border-l border-white/10 pl-3 py-0.5">
                    <p className="text-[8px] xl:text-[9px] font-black text-accent tracking-[0.2em]">ISO {iso.code}</p>
                    <p className="text-[7px] xl:text-[8px] font-mono text-white/30 uppercase truncate">{iso.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ambient Scan Effect */}
        <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-transparent via-accent/30 to-transparent" />
        <div className="absolute h-[1px] inset-x-0 top-1/4 bg-white/[0.01]" />
        <div className="absolute h-[1px] inset-x-0 bottom-1/4 bg-white/[0.01]" />
      </div>
    </div>
  );
}
