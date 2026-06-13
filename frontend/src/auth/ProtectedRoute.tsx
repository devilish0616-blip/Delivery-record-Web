import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">載入中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== "ADMIN" && user.role !== "MANAGER") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
