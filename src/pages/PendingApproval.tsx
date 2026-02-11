import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { CheckCircle2, Clock, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function PendingApproval() {
    const { currentUser } = useApp();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/login");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <Card className="max-w-md w-full shadow-lg">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                        <Clock className="h-8 w-8 text-amber-600 dark:text-amber-500" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Aguardando Aprovação</CardTitle>
                    <CardDescription>
                        Obrigado por se cadastrar, {currentUser?.name?.split(' ')[0] || 'Usuário'}!
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="text-center space-y-2 text-sm text-muted-foreground">
                        <p>
                            Sua conta foi criada com sucesso, mas precisa ser ativada por um administrador da sua organização ou do sistema.
                        </p>
                        <p>
                            Você receberá um e-mail assim que seu acesso for liberado.
                        </p>
                    </div>

                    <div className="bg-muted p-4 rounded-lg flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Próximos Passos:</p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside">
                                <li>Aguarde a validação do seu perfil.</li>
                                <li>Entre em contato com seu gestor se precisar de urgência.</li>
                            </ul>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair e Tentar Novamente
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
