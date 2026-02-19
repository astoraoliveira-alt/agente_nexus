import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, ArrowRight, LogOut, LayoutGrid, Building, Hexagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Company } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function SelectTenant() {
    const navigate = useNavigate();
    const { switchTenant, currentUser } = useApp();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const loadCompanies = async () => {
            try {
                const data = await api.getCompanies();
                setCompanies(data);
            } catch (error) {
                console.error('Failed to load companies:', error);
                toast.error('Erro ao carregar lista de empresas');
            } finally {
                setIsLoading(false);
            }
        };
        loadCompanies();
    }, []);

    const handleSelect = async (tenantId: string, name: string) => {
        try {
            await switchTenant(tenantId);
            toast.success(`Acessando ambiente: ${name}`);
            navigate('/');
        } catch (error) {
            console.error('Error switching tenant:', error);
            toast.error('Erro ao acessar o ambiente');
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const filteredCompanies = companies.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen w-full bg-[#050505] text-white flex flex-col relative overflow-hidden selection:bg-accent selection:text-accent-foreground grain-texture">
            {/* Background Decor */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(0,194,255,0.05)_0%,_rgba(0,0,0,0)_50%)] z-0" />
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Header */}
            <header className="relative z-10 px-6 py-8 md:px-12 flex justify-between items-center border-b border-white/5 bg-black/20 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <img src="/logo.png" alt="Davos Nexus" className="h-8 w-auto brightness-110" />
                        <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-accent animate-pulse rounded-full" />
                    </div>
                    <div className="h-6 w-[1px] bg-white/20" />
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40 leading-none">Nexus Hub</span>
                        <span className="text-[9px] uppercase tracking-widest font-bold text-accent/60">Seletor de Ambiente</span>
                    </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                    <div className="hidden md:block text-right">
                        <p className="text-[10px] uppercase tracking-widest font-black text-white/30 mb-0.5">Operador Autenticado</p>
                        <p className="font-mono text-xs text-white/80">{currentUser?.name || currentUser?.email}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="text-white/40 hover:text-white hover:bg-white/5 transition-colors gap-2"
                    >
                        <LogOut className="h-4 w-4" />
                        Sair
                    </Button>
                </div>
            </header>

            <main className="flex-1 relative z-10 flex flex-col items-center justify-center p-6 md:p-12">
                <div className={`w-full max-w-5xl transition-all duration-1000 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>

                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                        <div className="space-y-2">
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none">
                                ESCOLHA SEU <br />
                                <span className="text-accent underline decoration-accent/20 underline-offset-8">AMBIENTE</span>
                            </h1>
                            <p className="text-white/40 text-sm font-medium tracking-wide uppercase mt-4">
                                <span className="text-accent mr-2">//</span> Selecione uma empresa para iniciar a orquestração
                            </p>
                        </div>

                        <div className="relative w-full md:w-80 group">
                            <div className="absolute -inset-1 bg-accent/20 rounded-none blur opacity-25 group-focus-within:opacity-50 transition-opacity" />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 group-focus-within:text-accent transition-colors" />
                            <Input
                                placeholder="BUSCAR EMPRESA..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-14 bg-black/40 border-white/10 rounded-none pl-12 focus-visible:ring-accent/50 uppercase font-mono text-xs tracking-widest text-white/90"
                            />
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="h-48 bg-white/[0.02] border border-white/5 animate-pulse" />
                            ))}
                        </div>
                    ) : filteredCompanies.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredCompanies.map((company, index) => (
                                <button
                                    key={company.id}
                                    onClick={() => handleSelect(company.id, company.name)}
                                    className={`group relative text-left bg-[#0a0a0a] border border-white/5 hover:border-accent/40 transition-all duration-500 overflow-hidden flex flex-col p-6 animate-in fade-in slide-in-from-bottom-4`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    {/* Decorative corner */}
                                    <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/10 group-hover:border-accent/50 transition-colors" />

                                    <div className="flex items-start justify-between mb-8">
                                        <div className="w-12 h-12 bg-white/[0.03] group-hover:bg-accent/10 flex items-center justify-center transition-colors relative">
                                            <Building className="h-6 w-6 text-white/40 group-hover:text-accent transition-all duration-500 scale-90 group-hover:scale-100" />
                                            <div className="absolute inset-0 border border-white/5 opacity-0 group-hover:opacity-100 scale-110 group-hover:scale-100 transition-all" />
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Status</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest ${company.status === 'active' ? 'text-green-500/60' : 'text-amber-500/60'
                                                }`}>
                                                {company.status === 'active' ? 'Operante' : company.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-auto">
                                        <h3 className="text-xl font-bold tracking-tight text-white/90 group-hover:text-white mb-1 transition-colors">{company.name}</h3>
                                        <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-4">/{company.slug}</p>

                                        <div className="flex items-center justify-between pt-4 border-t border-white/5 group-hover:border-accent/20 transition-colors">
                                            <div className="flex gap-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[7px] font-black text-white/20 uppercase">Plano</span>
                                                    <span className="text-[9px] font-bold text-white/50 uppercase">{company.planName || 'Flex'}</span>
                                                </div>
                                                <div className="h-6 w-[1px] bg-white/5" />
                                                <div className="flex flex-col">
                                                    <span className="text-[7px] font-black text-white/20 uppercase">ID</span>
                                                    <span className="text-[9px] font-mono text-white/50 uppercase">{company.id.slice(0, 8)}...</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-white/0 -translate-x-4 group-hover:text-accent group-hover:translate-x-0 transition-all duration-500" />
                                        </div>
                                    </div>

                                    {/* Hover visual effect */}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-accent shadow-[0_0_15px_rgba(0,194,255,1)]" />
                                        <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-accent/50 to-transparent" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center border border-white/5 bg-white/[0.01]">
                            <LayoutGrid className="h-8 w-8 text-white/10 mb-4" />
                            <p className="text-white/40 uppercase tracking-widest text-xs font-bold">Nenhum ambiente encontrado</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer Info */}
            <footer className="relative z-10 p-6 md:p-12 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-white/5">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Hexagon className="h-3 w-3 text-accent/50" />
                        <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em]">Aura OS Multi-Tenant Flow</span>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                        <div className="h-1 w-1 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[9px] font-mono text-white/40">AUTH_SELECTOR_OK</span>
                    </div>
                </div>
                <p className="text-[9px] font-mono text-white/20 uppercase">© 2026 Davos Nexus // Orquestração em Escala</p>
            </footer>
        </div>
    );
}
