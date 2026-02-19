import { ReactNode, useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AppContext } from "@/contexts/AppContext";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
    const location = useLocation();

    // Use useContext directly to avoid the throw in useApp() during boot/weird states
    const appContext = useContext(AppContext);

    // If context is absolutely missing (shouldn't happen but happens in user report)
    if (!appContext) {
        console.warn("[ProtectedRoute] AppContext not found yet, showing pulse state");
        return (
            <div className="flex items-center justify-center h-screen animate-pulse text-white/50 bg-[#050505] tracking-widest font-mono text-xs">
                SINCronizando CONTEXTO...
            </div>
        );
    }

    const { currentUser, currentTenant, isLoading } = appContext;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen animate-pulse text-white/50 bg-[#050505] tracking-widest font-mono text-xs">
                RECONECTANDO AO SISTEMA...
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // MULTI-TENANT GUARD: Force Super Admins to select a tenant if they haven't yet
    // Only redirect if not already on the selection page
    if (currentUser.role === 'super_admin' && !currentTenant && location.pathname !== '/select-tenant') {
        return <Navigate to="/select-tenant" replace />;
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
