import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

function getUrlError(): { code?: string; message?: string } | null {
  const raw = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(raw || window.location.search);
  const errorCode = params.get('error_code') || undefined;
  const errorDescription = params.get('error_description') || params.get('error') || undefined;
  if (!errorCode && !errorDescription) return null;
  return { code: errorCode, message: errorDescription?.replace(/\+/g, ' ') };
}

export default function SetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const urlError = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getUrlError();
  }, []);

  useEffect(() => {
    if (!urlError) return;
    toast.error(urlError.message || 'Link inválido ou expirado.');
  }, [urlError]);

  useEffect(() => {
    // Best-effort: if the invite/recovery link establishes a session, supabase will persist it.
    // If there is no session, user needs to request a new invite/reset.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
    })();
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não conferem.');
      return;
    }

    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error('Link inválido ou expirado. Solicite um novo convite.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success('Senha definida com sucesso. Você já pode acessar o sistema.');
      await supabase.auth.signOut().catch(() => {});
      navigate('/login');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao definir senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#020617] text-white p-4">
      <div className="w-full max-w-[520px] border border-white/10 bg-[#020617]/80 backdrop-blur-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <KeyRound className="h-5 w-5 text-[#00D2FF]" />
          <div>
            <h1 className="text-2xl font-black tracking-tight">Definir Senha</h1>
            <p className="text-xs text-white/50">
              Finalize seu primeiro acesso criando uma senha para sua conta.
            </p>
          </div>
        </div>

        {urlError && (
          <div className="mb-6 border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 mt-0.5" />
            <div>
              <div className="font-bold">Link inválido ou expirado</div>
              <div className="text-red-200/80">{urlError.message}</div>
              <div className="mt-2">
                <Button variant="outline" className="h-8" onClick={() => navigate('/login')}>
                  Voltar para Login
                </Button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSetPassword} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Nova senha</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 border-0 border-b-2 border-white/10 bg-white/[0.02] rounded-none px-4 text-sm text-white focus-visible:ring-0 focus-visible:border-[#00D2FF] transition-all font-mono"
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-[#00D2FF]"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Confirmar senha</Label>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="h-12 border-0 border-b-2 border-white/10 bg-white/[0.02] rounded-none px-4 text-sm text-white focus-visible:ring-0 focus-visible:border-[#00D2FF] transition-all font-mono"
              placeholder="••••••••"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-gradient-to-r from-[#00D2FF] to-[#0066FF] text-white hover:opacity-90 rounded-none uppercase font-black tracking-[0.2em] text-[11px]"
          >
            {isLoading ? 'SALVANDO...' : 'DEFINIR SENHA'}
          </Button>

          <div className="text-center text-xs text-white/40">
            Já tem senha?{' '}
            <button type="button" className="text-[#00D2FF] hover:underline" onClick={() => navigate('/login')}>
              Entrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

