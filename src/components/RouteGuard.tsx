import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useUser } from "../hooks/useUser";

/**
 * RouteGuard — Prevents URL-bar access to restricted modules.
 * 
 * Rules:
 * - Executive department always passes (full access)
 * - Directors always pass (full access)
 * - allowedDepartments: user's department must be in the list
 * - requireMinRole: user's role must meet the minimum level
 * - On failure: redirects to /dashboard
 */

const ROLE_LEVEL: Record<string, number> = {
  rep: 0,
  manager: 1,
  director: 2,
};

interface RouteGuardProps {
  children: ReactNode;
  allowedDepartments?: string[];
  requireMinRole?: "rep" | "manager" | "director";
}

export function RouteGuard({ children, allowedDepartments, requireMinRole }: RouteGuardProps) {
  const navigate = useNavigate();
  const { effectiveDepartment, effectiveRole, isAuthenticated, isLoading } = useUser();

  useEffect(() => {
    // Don't check while loading or if not authenticated
    if (isLoading || !isAuthenticated) return;

    const dept = effectiveDepartment || "";
    const role = effectiveRole || "rep";

    // Executive department always passes
    if (dept === "Executive") return;
    // Directors always pass
    if (role === "director") return;

    // Check department access
    if (allowedDepartments && allowedDepartments.length > 0) {
      if (!allowedDepartments.includes(dept)) {
        console.warn(`[RouteGuard] Access denied: department "${dept}" not in allowed list [${allowedDepartments.join(", ")}]`);
        navigate("/dashboard", { replace: true });
        return;
      }
    }

    // Check minimum role
    if (requireMinRole) {
      const userLevel = ROLE_LEVEL[role] ?? 0;
      const requiredLevel = ROLE_LEVEL[requireMinRole] ?? 0;
      if (userLevel < requiredLevel) {
        console.warn(`[RouteGuard] Access denied: role "${role}" below minimum "${requireMinRole}"`);
        navigate("/dashboard", { replace: true });
        return;
      }
    }
  }, [effectiveDepartment, effectiveRole, isAuthenticated, isLoading, allowedDepartments, requireMinRole, navigate]);

  // Show nothing while loading auth state
  if (isLoading) return null;

  return <>{children}</>;
}
