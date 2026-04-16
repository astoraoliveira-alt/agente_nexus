import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import { AuthService } from '@/services/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    localStorage.removeItem('davos_active_tenant_id');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
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
            toast.success(`Bem-vindo de volta, ${userProfile.name}`);
          }
        }

        if (userProfile) {
          if (userProfile.status === 'blocked') {
            toast.error('Este acesso foi revogado. Entre em contato com o suporte.');
            await supabase.auth.signOut();
            return;
          }
          if (userProfile.status === 'pending') {
            navigate('/pending-approval');
            return;
          }
        }

        toast.success('Login efetuado com sucesso.');
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
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Falha ao processar as credenciais. Verifique seus dados.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative bg-[#050505] text-neutral-100 font-sans overflow-hidden flex items-center justify-center p-6 selection:bg-[#FF4500] selection:text-white">

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
        className="relative w-full max-w-[420px] z-20 transition-all duration-1000 ease-out group"
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
        <div className="relative z-10 bg-[#121212] border border-neutral-800 px-8 py-10 rounded-[2px] flex flex-col shadow-2xl backdrop-blur-sm">
          
          {/* HEADER SECTION */}
          <div className="flex flex-col mb-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-[#FF4500] rounded-sm" />
              <span className="text-[10px] font-bold tracking-[0.15em] text-neutral-400 uppercase">
                Torre de Controle
              </span>
            </div>
            
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
              Davos Nexus
            </h1>
            
            <p className="text-sm text-neutral-400 font-medium leading-relaxed">
              Entre em sua conta para acessar o seu ambiente corporativo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-2 group/field">
              <Label className="text-xs font-semibold text-neutral-400 block group-focus-within/field:text-white transition-colors">
                E-mail Corporativo
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-[#1A1A1A] border-0 border-b-2 border-transparent focus-visible:border-[#FF4500] hover:bg-[#1E1E1E] focus-visible:bg-[#1E1E1E] focus-visible:ring-0 rounded-[2px] text-sm text-white transition-all shadow-none px-4 placeholder:text-neutral-600 font-medium"
                placeholder="nome@empresa.com.br"
              />
            </div>

            <div className="space-y-2 group/field">
              <div className="flex justify-between items-center mb-1 drop-shadow-sm">
                <Label className="text-xs font-semibold text-neutral-400 group-focus-within/field:text-white transition-colors">
                  Senha
                </Label>
                <button 
                  type="button" 
                  onClick={() => navigate('/forgot-password')} 
                  className="text-[11px] font-medium text-neutral-500 hover:text-white transition-colors opacity-90 focus:outline-none"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-[#1A1A1A] border-0 border-b-2 border-transparent focus-visible:border-[#FF4500] hover:bg-[#1E1E1E] focus-visible:bg-[#1E1E1E] focus-visible:ring-0 rounded-[2px] text-sm text-white transition-all shadow-none pl-4 pr-12 placeholder:text-neutral-600 font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1 flex items-center justify-center outline-none focus:outline-none"
                  onClick={(e) => { e.preventDefault(); setShowPassword(!showPassword); }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[#FF4500] hover:bg-[#D43A00] text-white font-bold text-[13px] tracking-wide rounded-[2px] transition-all duration-200 active:scale-[0.98] flex items-center justify-between px-5 group/btn"
              >
                <span>Entrar no Sistema</span>
                
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-white/50 group-hover/btn:text-white group-hover/btn:translate-x-1 transition-all duration-300" />
                )}
              </Button>
            </div>
            
          </form>
        </div>
      </div>

      <style>{`
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
