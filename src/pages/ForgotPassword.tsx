import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hexagon, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeField, setActiveField] = useState<string | null>(null);

    // Mounted effect for animation trigger
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API

        toast.success('Link de recuperação enviado com sucesso!');
        // In a real app, we might redirect or clear the form
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen w-full flex bg-background text-foreground overflow-hidden relative selection:bg-accent selection:text-accent-foreground">

            {/* LEFT PANEL: The Terminal (Interaction Area) */}
            <div className={`w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between p-8 md:p-12 lg:p-16 relative z-10 transition-all duration-700 ease-out ${mounted ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'}`}>

                {/* Header */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-accent mb-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/login')}>
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-sm font-mono tracking-widest">VOLTAR AO LOGIN</span>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                        <img src="/logo.png" alt="Davos Nexus" className="h-10 w-auto" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-[1.1]">
                        Recuperação de Acesso
                    </h1>
                    <p className="text-lg text-muted-foreground mt-4 max-w-sm leading-relaxed">
                        Insira seu e-mail corporativo para iniciar o protocolo de redefinição de segurança.
                    </p>
                </div>

                {/* Form Section */}
                <div className="w-full max-w-sm mt-12 space-y-8">

                    <form onSubmit={handleReset} className="space-y-8 group">

                        {/* Email Field */}
                        <div className="space-y-4 group/field">
                            <Label
                                htmlFor="email"
                                className={`text-xs uppercase tracking-widest font-semibold transition-colors duration-300 ${activeField === 'email' ? 'text-accent' : 'text-muted-foreground'}`}
                            >
                                E-mail Corporativo
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
                                    <Mail className="h-4 w-4" />
                                    ENVIAR LINK DE RESGATE
                                </span>
                            )}
                        </Button>
                    </form>

                    {/* Info Card */}
                    <div className="border border-border p-4 bg-muted/20 text-xs font-mono space-y-2 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-50" />
                        <p className="text-muted-foreground leading-relaxed">
                            <span className="text-foreground font-bold">NOTA DE SEGURANÇA:</span> O link de redefinição expira em 15 minutos. Caso não receba, verifique sua pasta de spam ou contate o administrador do tenant.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-xs text-muted-foreground/50 flex gap-6">
                    <span>SECURE_GATEWAY_V2</span>
                    <span>ENCRYPTION: ON</span>
                </div>
            </div>

            {/* RIGHT PANEL: Same Visual Void but with different icon/text */}
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
                        <h2 className="text-3xl font-light tracking-[0.2em] text-background uppercase">Protocolo de Segurança</h2>
                        <div className="text-background/70 font-mono text-sm space-y-2">
                            <p>Verificação de identidade em duas etapas.</p>
                            <div className="flex flex-col gap-1 text-xs opacity-80 mt-4">
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-1.5 w-1.5 bg-accent rounded-full" /> Log de Auditoria Ativo
                                </span>
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-1.5 w-1.5 bg-accent rounded-full" /> Rastreamento por IP
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Edge Highlight */}
                <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-transparent via-accent to-transparent opacity-50" />
            </div>

        </div >
    );
}
