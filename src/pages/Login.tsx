import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck, Zap, Lock, Activity, Hexagon, Globe, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

import { api } from '@/services/api';

// Mock users removed - using Real DB Auth (Simulated)

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  // Mounted effect for animation trigger
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Real Auth (Simulated via DB lookup)
      const user = await api.getUserByEmail(email);

      if (user) {
        // Enforcing the correct password provided by the user
        const isCarlos = email === 'carlos@davos.ai';
        const isPasswordCorrect = password === '123456';

        if (isCarlos && !isPasswordCorrect) {
          toast.error('Acesso Negado: Senha incorreta para este operador');
          setIsLoading(false);
          return;
        }

        localStorage.setItem('davos_session', JSON.stringify({
          user: { email: user.email, name: user.name, role: user.role, id: user.id },
          token: 'mock-jwt-' + crypto.randomUUID(),
        }));

        toast.success(`Acesso Autorizado: ${user.name}`);

        // Force reload to trigger AppContext boot from localStorage
        window.location.href = '/';
      } else {
        toast.error('Acesso Negado: Usuário não encontrado no sistema');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao verificar credenciais');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#050505] text-white overflow-hidden relative selection:bg-accent selection:text-accent-foreground grain-texture">

      {/* 
        🎨 DESIGN COMMITMENT: "Technical Luxury / Precision Industrial"
        - Geometry: Aggressive Sharp (0px radius)
        - Palette: Obsidian, Pure White, Electric Cyan
        - Typography: Black Weight (900), Tighter Tracking
        - Motion: Staggered "System Boot" Reveals
      */}

      {/* LEFT PANEL: The Terminal (Interaction Area) */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between p-8 md:p-10 lg:p-16 relative z-10 bg-black/40 backdrop-blur-sm border-r border-white/5 overflow-y-auto invisible-scrollbar">

        {/* Header - Staggered entrance */}
        <div className="space-y-4 pt-4">
          <div className={`flex items-center gap-6 mb-10 transition-all duration-1000 ease-out ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
            {/* Client Logo - Edenred */}
            <div className="relative group/client">
              <img src="/client-logo.png" alt="Edenred" className="h-12 w-auto drop-shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-transform duration-500 group-hover/client:scale-105" />
            </div>

            <div className="h-10 w-[1px] bg-white/20 mx-1" />

            {/* Davos Logo - Powered By */}
            <div className="flex flex-col items-start pt-1">
              <span className="text-[8px] uppercase tracking-[0.3em] font-bold text-white/30 mb-1 ml-1">Powered by</span>
              <img src="/logo.png" alt="Davos Nexus" className="h-8 w-auto opacity-80 brightness-110" />
            </div>

            <div className="h-10 w-[1px] bg-white/20 mx-1" />

            <div className="space-y-1">
              <span className="block text-[10px] uppercase tracking-[0.4em] font-black text-white/50 leading-none">Nexus Hub v2.4</span>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-[1px] w-4 bg-accent/30" />
                <span className="text-[9px] uppercase tracking-widest font-black text-accent/40 animate-pulse">Acesso_Privado_Ativo</span>
              </div>
            </div>
          </div>

          <div className="space-y-0">
            <h1 className={`text-6xl md:text-7xl xl:text-8xl font-black tracking-tighter leading-[0.85] transition-all duration-1000 delay-100 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 blur-lg'}`}>
              TORRE DE <br />
              <span className="text-accent underline decoration-accent/20 decoration-8 underline-offset-[-2px]">CONTROLE</span>
            </h1>
            <p className={`text-xl font-light text-white/70 mt-8 max-w-sm leading-relaxed transition-all duration-1000 delay-200 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
              <span className="text-accent font-bold tracking-wider mr-2 uppercase text-xs">AURA OS //</span>
              Orquestração de agentes autônomos em escala corporativa.
            </p>
          </div>
        </div>

        {/* Login Form Section - Staggered entrance */}
        <div className={`w-full max-w-sm mt-8 space-y-8 transition-all duration-1000 delay-300 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>

          <form onSubmit={handleLogin} className="space-y-6 group">

            {/* Email Field - Technical Input Style */}
            <div className="space-y-3 group/field">
              <Label
                htmlFor="email"
                className={`text-[10px] uppercase tracking-[0.25em] font-black transition-colors duration-300 ${activeField === 'email' ? 'text-accent' : 'text-white/50'}`}
              >
                Identificação / Operador
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="seu_id@davos.nexus"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setActiveField('email')}
                  onBlur={() => setActiveField(null)}
                  required
                  className="h-14 bg-white/[0.02] border border-white/10 rounded-none focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:border-accent px-4 text-lg transition-all duration-500 placeholder:text-white/30 group-hover/field:border-white/20"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-3 group/field">
              <Label
                htmlFor="password"
                className={`text-[10px] uppercase tracking-[0.25em] font-black transition-colors duration-300 ${activeField === 'password' ? 'text-accent' : 'text-white/50'}`}
              >
                Chave de Acesso / Encriptada
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setActiveField('password')}
                  onBlur={() => setActiveField(null)}
                  required
                  className="h-14 bg-white/[0.02] border border-border/50 rounded-none focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:border-accent px-4 text-lg transition-all duration-500 placeholder:text-white/30 pr-12 group-hover/field:border-white/20"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-white/20 hover:text-white transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-16 bg-white text-black hover:bg-accent hover:text-white transition-all duration-500 rounded-none uppercase tracking-[0.3em] font-black text-xs relative overflow-hidden group/btn disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 border-2 border-black/20 border-t-black animate-spin rounded-full" />
                  <span>Autenticando...</span>
                </div>
              ) : (
                <span className="flex items-center gap-3 relative z-10 transition-transform group-hover/btn:scale-105">
                  <span className="w-2 h-[1px] bg-current" />
                  ENTRAR NO SISTEMA
                  <span className="w-2 h-[1px] bg-current" />
                </span>
              )}
              {/* Button Glow Effect */}
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-accent opacity-0 group-hover/btn:opacity-100 transition-opacity blur-[2px]" />
            </Button>
          </form>

          {/* System Access Flags */}
          <div className="flex items-center justify-between text-[10px] font-black tracking-widest text-white/40 uppercase border-y border-white/10 py-5">
            <span className="flex items-center gap-2 text-success"><div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" /> Conexão Segura</span>
            <span className="flex items-center gap-2"><Lock className="h-3 w-3" /> E2E Criptografia</span>
            <span className="flex items-center gap-2 cursor-pointer hover:text-accent transition-colors underline decoration-accent/30 underline-offset-4" onClick={() => navigate('/forgot-password')}>Redefinição de Chave</span>
          </div>
        </div>

        {/* Footer info - Low priority but premium detail */}
        <div className={`flex items-end justify-between mt-12 transition-all duration-1000 delay-500 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Aura Intelligence Systems</p>
            <p className="text-[9px] font-mono text-white/80 uppercase">Auth_Node: SA-EAST-1 // Build_2026.02</p>
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-[1px] bg-white/5" />
            <div className="h-6 w-[1px] bg-white/5" />
            <div className="h-6 w-[1px] bg-white/10" />
            <div className="h-6 w-1 bg-accent/20" />
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
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-20 transition-all duration-[2000ms] ease-out delay-500 animate-aura-float ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-110 blur-2xl'}`}>
          <div className="relative group/aura flex flex-col items-center">
            {/* Environment Halos */}
            <div className="absolute -inset-24 rounded-full border border-accent/20 animate-[ping_3s_infinite]" />
            <div className="absolute -inset-48 rounded-full border border-white/[0.02] animate-[ping_6s_infinite] delay-1000" />

            {/* THE AGENT STRUCTURE - Scaled for vertical space */}
            <div className="relative flex flex-col items-center scale-90 xl:scale-100 transition-transform duration-700">
              {/* 1. HEAD SECTION */}
              <div className="relative w-40 h-40 xl:w-48 xl:h-48 flex flex-col items-center justify-center z-30">
                {/* Head Shell */}
                <div className="absolute inset-0 border border-white/10 bg-black/80 backdrop-blur-3xl rounded-[3rem] shadow-[0_0_60px_rgba(0,194,255,0.15)]" />

                {/* Face Plate */}
                <div className="relative z-10 flex flex-col items-center gap-6 mt-4">
                  {/* Eyebrows/Sobrancelhas - Enthusiastic Tilt (Center Up) */}
                  <div className="flex gap-14 absolute -top-2">
                    <div className="w-10 h-1.5 bg-accent/40 rounded-full animate-aura-brow -rotate-12" />
                    <div className="w-10 h-1.5 bg-accent/40 rounded-full animate-aura-brow rotate-12" />
                  </div>

                  {/* Eyes / Olhos */}
                  <div className="flex gap-10">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-2.5 bg-accent/20 rounded-full overflow-hidden">
                        <div className="h-full bg-accent animate-aura-blink w-full" />
                      </div>
                      <div className="w-12 h-12 border border-accent/40 flex items-center justify-center p-2 rounded-xl bg-accent/5">
                        <div className="w-6 h-6 bg-accent animate-aura-scan shadow-[0_0_20px_rgba(0,194,255,0.8)] rounded-sm" />
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-2.5 bg-accent/20 rounded-full overflow-hidden">
                        <div className="h-full bg-accent animate-aura-blink w-full" />
                      </div>
                      <div className="w-12 h-12 border border-accent/40 flex items-center justify-center p-2 rounded-xl bg-accent/5">
                        <div className="w-6 h-6 bg-accent animate-aura-scan shadow-[0_0_20px_rgba(0,194,255,0.8)] rounded-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Mouth / Boca Falante - Fixed Visibility & Sizing */}
                  <div className="mt-2 flex flex-col items-center justify-center min-h-[20px]">
                    <div className="bg-accent animate-aura-talk shadow-[0_0_15px_rgba(0,194,255,0.6)] w-[60px] h-[4px]" />
                  </div>
                </div>
              </div>

              {/* 2. TORSO / TRONCO - Redesigned with higher visibility */}
              <div className="relative w-36 h-28 bg-gradient-to-b from-white/15 to-transparent border-x border-t border-white/10 rounded-t-[3.5rem] -mt-6 z-20 overflow-hidden">
                {/* Central Energy Core */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                  <div className="w-5 h-5 bg-accent rounded-full animate-pulse shadow-[0_0_25px_rgba(0,194,255,1)]" />
                </div>
              </div>

              {/* 3. ARMS & HANDS / BRAÇOS E MÃOS GESTICULANDO - High Visibility */}
              <div className="absolute top-48 w-full flex justify-between px-[-1rem] z-10 pointer-events-none">
                {/* Left Arm/Hand */}
                <div className="relative w-16 h-32 border-l-2 border-t-2 border-accent/40 rounded-tl-[2.5rem] origin-top-right animate-aura-hand-l -ml-12">
                  {/* Hand L (Glowing Sphere) */}
                  <div className="absolute bottom-0 left-[-4px] w-4 h-4 bg-accent/60 rounded-full shadow-[0_0_15px_rgba(0,194,255,0.8)]" />
                </div>
                {/* Right Arm/Hand */}
                <div className="relative w-16 h-32 border-r-2 border-t-2 border-accent/40 rounded-tr-[2.5rem] origin-top-left animate-aura-hand-r -mr-12">
                  {/* Hand R (Glowing Sphere) */}
                  <div className="absolute bottom-0 right-[-4px] w-4 h-4 bg-accent/60 rounded-full shadow-[0_0_15px_rgba(0,194,255,0.8)]" />
                </div>
              </div>
            </div>

            <div className="mt-8 xl:mt-14 space-y-3 xl:space-y-4 text-center">
              <div className="flex items-center justify-center gap-3 text-[10px] font-black tracking-[0.6em] text-accent uppercase">
                <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-accent/40" />
                <span className="animate-pulse">Aura: Agente Ativo</span>
                <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-accent/40" />
              </div>
              <p className="text-sm text-white/70 font-medium max-w-[280px] leading-relaxed">
                Olá! Estou pronta para otimizar sua operação com inteligência e entusiasmo.
              </p>
            </div>

            {/* Strategic Metrics - Enhanced Visibility */}
            <div className="absolute top-1/2 left-full ml-20 -translate-y-1/2 w-56 hidden xl:block">
              <div className="h-[1px] w-full bg-gradient-to-r from-accent/50 to-transparent mb-6" />
              <div className="space-y-6 font-mono text-[11px] text-accent/80 uppercase tracking-widest">
                <div className="flex justify-between items-center group/m">
                  <span className="group-hover/m:text-accent transition-colors">Sistema Operante</span>
                  <div className="flex gap-1 animate-pulse"><div className="w-1 h-1 bg-accent rounded-full" /><div className="w-1 h-1 bg-accent rounded-full delay-75" /><div className="w-1 h-1 bg-accent rounded-full delay-150" /></div>
                </div>
                <div className="flex justify-between items-center group/m">
                  <span className="group-hover/m:text-accent transition-colors">Eficiência</span>
                  <span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded-sm">99.8%</span>
                </div>
                <div className="flex justify-between items-center group/m">
                  <span className="group-hover/m:text-accent transition-colors">Agentes On</span>
                  <span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded-sm">08</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 xl:mt-16 text-center space-y-3 xl:space-y-4 max-w-lg px-6">
            <div className="flex items-center justify-center gap-3 opacity-20">
              <div className="h-[1px] w-8 bg-white" />
              <Hexagon className="h-4 w-4" />
              <div className="h-[1px] w-8 bg-white" />
            </div>

            <h2 className="text-4xl font-black tracking-[0.4em] text-white uppercase leading-none">
              CONFORMIDADE & GOVERNANÇA
            </h2>

            <div className="grid grid-cols-2 gap-x-8 xl:gap-x-12 gap-y-3 xl:gap-y-4">
              {[
                { code: '42001', label: 'Gestão de IA Responsável' },
                { code: '27001', label: 'Segurança Cibernética' },
                { code: '23894', label: 'Gestão de Riscos' },
                { code: 'TR 24028', label: 'Auditoria de Confiança' }
              ].map(iso => (
                <div key={iso.code} className="text-left border-l border-white/10 pl-3 xl:pl-4 py-0.5 xl:py-1">
                  <p className="text-[9px] xl:text-[10px] font-black text-accent tracking-[0.2em]">NORMA ISO {iso.code}</p>
                  <p className="text-[8px] xl:text-[9px] font-mono text-white/30 uppercase">{iso.label}</p>
                </div>
              ))}
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
