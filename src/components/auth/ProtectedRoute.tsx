import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
    children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const location = useLocation();
    const sessionString = localStorage.getItem("davos_session");

    // Basic auth check: if no session exists, redirect to login
    if (!sessionString) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    try {
        const session = JSON.parse(sessionString);
        if (!session || !session.user) {
            return <Navigate to="/login" state={{ from: location }} replace />;
        }
    } catch (error) {
        console.error("Session parse error:", error);
        localStorage.removeItem("davos_session");
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
