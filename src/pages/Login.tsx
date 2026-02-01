import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// Mock credentials
const MOCK_USERS = [
  { email: 'carlos@davos.ai', password: 'admin123', role: 'super_admin', name: 'Carlos Silva' },
  { email: 'ana@bancoalpha.com', password: 'admin123', role: 'tenant_admin', name: 'Ana Rodrigues' },
  { email: 'pedro@bancoalpha.com', password: 'op123', role: 'operator', name: 'Pedro Santos' },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const user = MOCK_USERS.find(u => u.email === email && u.password === password);

    if (user) {
      // Store mock session
      localStorage.setItem('davos_session', JSON.stringify({
        user: { email: user.email, name: user.name, role: user.role },
        token: 'mock-jwt-token-' + Date.now(),
      }));
      
      toast.success(`Bem-vindo, ${user.name}!`);
      navigate('/');
    } else {
      toast.error('Credenciais inválidas');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent mx-auto mb-4 flex items-center justify-center">
            <span className="text-2xl font-bold text-accent-foreground">D</span>
          </div>
          <h1 className="text-2xl font-bold">Davos Nexus</h1>
          <p className="text-sm text-muted-foreground mt-1">Plataforma de Gestão de Agentes IA</p>
        </div>

        {/* Login Form */}
        <div className="kpi-card">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" />
                <span>Lembrar-me</span>
              </label>
              <a href="#" className="text-accent hover:underline">Esqueci a senha</a>
            </div>

            <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground animate-spin" style={{ borderRadius: '50%' }} />
                  Entrando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Entrar
                </span>
              )}
            </Button>
          </form>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 p-4 bg-muted">
          <p className="text-sm font-medium mb-2">Credenciais de demonstração:</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p><strong>Super Admin:</strong> carlos@davos.ai / admin123</p>
            <p><strong>Admin Tenant:</strong> ana@bancoalpha.com / admin123</p>
            <p><strong>Operador:</strong> pedro@bancoalpha.com / op123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
