import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck, Zap, Lock, Activity, Hexagon, Globe } from 'lucide-react';
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
        // Simple password check (Mock mechanism for now as we don't have auth.users)
        // In real Prod, Supabase Auth handles this. 
        // For now, accept any password if user exists in DB.

        localStorage.setItem('davos_session', JSON.stringify({
          user: { email: user.email, name: user.name, role: user.role, id: user.id },
          token: 'mock-jwt-token-' + Date.now(),
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
    <div className="min-h-screen w-full flex bg-background text-foreground overflow-hidden relative selection:bg-accent selection:text-accent-foreground">

      {/* 
        🎨 DESIGN COMMITMENT: "Technical Brutalism"
        - Geometry: Sharp (0px radius)
        - Palette: Monochrome with Electric Cyan Accents
        - Layout: 40/60 Split with "Data Void" visuals
        - Typography: Geometric Sans (Inter)
      */}

      {/* LEFT PANEL: The Terminal (Interaction Area) */}
      <div className={`w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between p-8 md:p-12 lg:p-16 relative z-10 transition-all duration-700 ease-out ${mounted ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'}`}>

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="Davos Nexus" className="h-10 w-auto" />
            <span className="text-xl font-bold tracking-tight text-accent">DAVOS NEXUS</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
            Torre de Controle <br />
            <span className="text-muted-foreground">Operacional IA</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-sm leading-relaxed">
            Orquestração segura de agentes autônomos para ambientes corporativos.
          </p>
        </div>

        {/* Login Form Section */}
        <div className="w-full max-w-sm mt-12 space-y-8">

          <form onSubmit={handleLogin} className="space-y-6 group">

            {/* Email Field - Technical Input Style */}
            <div className="space-y-2 group/field">
              <Label
                htmlFor="email"
                className={`text-xs uppercase tracking-widest font-semibold transition-colors duration-300 ${activeField === 'email' ? 'text-accent' : 'text-muted-foreground'}`}
              >
                Identificação do Operador
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="nome@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setActiveField('email')}
                  onBlur={() => setActiveField(null)}
                  required
                  className="h-12 bg-transparent border-t-0 border-x-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 text-lg transition-all duration-300 placeholder:text-muted-foreground/30"
                />
                <div className={`absolute bottom-0 left-0 h-[1px] bg-accent transition-all duration-500 ease-in-out ${activeField === 'email' ? 'w-full' : 'w-0'}`} />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2 group/field">
              <div className="flex justify-between items-center">
                <Label
                  htmlFor="password"
                  className={`text-xs uppercase tracking-widest font-semibold transition-colors duration-300 ${activeField === 'password' ? 'text-accent' : 'text-muted-foreground'}`}
                >
                  Chave de Acesso
                </Label>
              </div>
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
                  className="h-12 bg-transparent border-t-0 border-x-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 text-lg transition-all duration-300 placeholder:text-muted-foreground/30 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <div className={`absolute bottom-0 left-0 h-[1px] bg-accent transition-all duration-500 ease-in-out ${activeField === 'password' ? 'w-full' : 'w-0'}`} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group/check">
                <div className="relative">
                  <input type="checkbox" className="peer sr-only" />
                  <div className="w-4 h-4 border border-input transition-colors peer-checked:bg-accent peer-checked:border-accent" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 peer-checked:opacity-100 text-accent-foreground text-[10px] font-bold">✓</div>
                </div>
                <span className="text-sm text-muted-foreground group-hover/check:text-foreground transition-colors">Manter conectado</span>
              </label>
              <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm text-muted-foreground hover:text-accent transition-colors">
                Redefinir credenciais?
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-foreground text-background hover:bg-accent hover:text-accent-foreground transition-all duration-300 rounded-none uppercase tracking-widest font-bold text-sm"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-2 w-2 bg-current rounded-full animate-bounce"></span>
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4 fill-current" />
                  INICIAR SESSÃO
                </span>
              )}
            </Button>
          </form>

          {/* Demo Info - Styled as System Status */}
          <div className="border border-border p-4 bg-muted/20 text-xs font-mono space-y-2 relative overflow-hidden group/status">
            <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-50 group-hover/status:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Activity className="h-3 w-3" />
              <span>SYSTEM_STATUS: DEMO_MODE</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
              <span className="opacity-50">ADMIN:</span>
              <span className="text-foreground hover:text-accent select-all cursor-copy">carlos@davos.ai</span>

              <span className="opacity-50">PASS:</span>
              <span className="text-foreground hover:text-accent select-all cursor-copy">admin123</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground mt-2 pt-2 border-t border-border/50">
              <span className="opacity-50">TENANT:</span>
              <span className="text-foreground hover:text-accent select-all cursor-copy">ana@bancoalpha.com</span>
            </div>
          </div>
        </div>

        {/* ISO Governance Badges (Technical Brutalism Style) */}
        <div className="mt-8 mb-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
            Plataforma aderente às normas internacionais de governaça e risco em IA
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { code: 'ISO/IEC 42001', name: 'AI Management', icon: Hexagon },
              { code: 'ISO/IEC 23894', name: 'AI Risk', icon: ShieldCheck },
              { code: 'ISO/IEC TR 24028', name: 'Trustworthiness', icon: Eye },
              { code: 'ISO/IEC 27001', name: 'InfoSec', icon: Lock },
              { code: 'ISO/IEC 27701', name: 'Privacy', icon: Activity },
            ].map((iso) => (
              <div
                key={iso.code}
                className="group flex items-center gap-2 px-2 py-1.5 border border-border bg-background/50 hover:border-accent/50 hover:bg-accent/5 transition-all duration-300 cursor-help"
                title={`${iso.code}: ${iso.name}`}
              >
                <Globe className="h-3 w-3 text-muted-foreground group-hover:text-accent transition-colors" />
                <span className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  ISO {iso.code.replace('ISO/IEC ', '')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground/50 flex gap-6">
          <span>v2.4.0-stable</span>
          <span>SECURE_CONNECTION_TL2</span>
          <span>© 2026 DAVOS INC</span>
        </div>
      </div>

      {/* RIGHT PANEL: The Visual Void */}
      <div className="hidden lg:block w-[55%] xl:w-[60%] relative bg-foreground overflow-hidden">
        {/* Abstract pattern via CSS */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-background/10 via-background/80 to-background opacity-90 z-10" />

        {/* Dynamic Grid */}
        <div className="absolute inset-0 grid grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(20,minmax(0,1fr))] opacity-20 z-0">
          {Array.from({ length: 400 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-accent/20" />
          ))}
        </div>

        {/* Floating Content */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-20 transition-all duration-1000 ease-out delay-300 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-accent/20 blur-3xl animate-pulse" />
            <ShieldCheck className="h-32 w-32 text-accent stroke-[0.5] relative z-10 animate-pulse" />
          </div>

          <div className="mt-12 text-center space-y-4 max-w-md px-6">
            <div className="h-px w-24 bg-accent/50 mx-auto" />
            <h2 className="text-3xl font-light tracking-[0.2em] text-background uppercase">Conformidade ISO</h2>
            <div className="text-background/70 font-mono text-sm space-y-2">
              <p>Monitoramento ativo de Agentes Conversacionais.</p>
              <div className="flex flex-col gap-1 text-xs opacity-80 mt-4">
                <span className="flex items-center justify-center gap-2">
                  <span className="h-1.5 w-1.5 bg-accent rounded-full" /> ISO/IEC 42001 (AI Management System)
                </span>
                <span className="flex items-center justify-center gap-2">
                  <span className="h-1.5 w-1.5 bg-accent rounded-full" /> ISO/IEC 27001 (InfoSec)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edge Highlight */}
        <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-transparent via-accent to-transparent opacity-50" />
      </div>
    </div>
  );
}
