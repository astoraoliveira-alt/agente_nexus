import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";

interface ProtectedRouteProps {
    children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const location = useLocation();
    const sessionString = localStorage.getItem("davos_session");

    const { currentUser, isLoading } = useApp();

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen animate-pulse text-white/50 bg-[#050505] tracking-widest font-mono text-xs">INICIALIZANDO SISTEMA...</div>;
    }

    if (!currentUser) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (currentUser.status === 'pending' || currentUser.status === 'invited') {
        return <Navigate to="/pending-approval" replace />;
    }

    if (currentUser.status === 'blocked') {
        return <div className="flex items-center justify-center h-screen">Sua conta foi bloqueada. Entre em contato com o administrador.</div>;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
