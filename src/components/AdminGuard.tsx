import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getStoredUser } from "../lib/auth";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const user = getStoredUser();
  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
