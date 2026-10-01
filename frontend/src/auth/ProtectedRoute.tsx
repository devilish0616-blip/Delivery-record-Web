import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Capability, Role } from "../api/types";

export function ProtectedRoute({
  adminOnly = false,
  roles,
  capability,
}: {
  adminOnly?: boolean;
  roles?: Role[];
  // 具備此職務權限的員工，即使角色不符也可進入（與角色條件為「或」關係）
  capability?: Capability;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">載入中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 職務權限放行：有對應 capability 即可進入，不受角色限制
  if (capability && user.capabilities?.includes(capability)) {
    return <Outlet />;
  }

  if (adminOnly && user.role !== "ADMIN" && user.role !== "MANAGER") {
    return <Navigate to="/" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
