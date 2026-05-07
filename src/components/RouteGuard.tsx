import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { usePermission } from "../context/PermissionProvider";
import { useUser } from "../hooks/useUser";
import type { ActionId, ModuleId } from "./admin/permissionsConfig";

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
  staff: 0,
  team_leader: 1,
  supervisor: 2,
  manager: 3,
  executive: 4,
};

interface RouteGuardProps {
  children: ReactNode;
  allowedDepartments?: string[];
  requireMinRole?: "staff" | "team_leader" | "supervisor" | "manager" | "executive";
  requiredPermission?: { moduleId: ModuleId; action: ActionId };
}

export function RouteGuard({ children, allowedDepartments, requireMinRole, requiredPermission }: RouteGuardProps) {
  const navigate = useNavigate();
  const { effectiveDepartment, effectiveRole, isAuthenticated, isLoading } = useUser();
  const { can, hasExplicitGrant, isLoaded: permissionsLoaded } = usePermission();

  useEffect(() => {
    // Don't check while loading or if not authenticated
    if (isLoading || !isAuthenticated) return;
    if (requiredPermission && !permissionsLoaded) return;

    const dept = effectiveDepartment || "";
    const role = effectiveRole || "staff";
    const isExecutive = dept === "Executive";
    const hasRouteOverride = requiredPermission
      ? hasExplicitGrant(requiredPermission.moduleId, requiredPermission.action)
      : false;

    if (!isExecutive) {
      // Check department access
      if (allowedDepartments && allowedDepartments.length > 0) {
        if (!allowedDepartments.includes(dept) && !hasRouteOverride) {
          console.warn(`[RouteGuard] Access denied: department "${dept}" not in allowed list [${allowedDepartments.join(", ")}]`);
          navigate("/dashboard", { replace: true });
          return;
        }
      }

      // Check minimum role
      if (requireMinRole) {
        const userLevel = ROLE_LEVEL[role] ?? 0;
        const requiredLevel = ROLE_LEVEL[requireMinRole] ?? 0;
        if (userLevel < requiredLevel && !hasRouteOverride) {
          console.warn(`[RouteGuard] Access denied: role "${role}" below minimum "${requireMinRole}"`);
          navigate("/dashboard", { replace: true });
          return;
        }
      }
    }

    if (requiredPermission && !can(requiredPermission.moduleId, requiredPermission.action)) {
      console.warn(
        `[RouteGuard] Access denied: missing permission "${requiredPermission.moduleId}.${requiredPermission.action}"`,
      );
      navigate("/dashboard", { replace: true });
    }
  }, [
    effectiveDepartment,
    effectiveRole,
    isAuthenticated,
    isLoading,
    allowedDepartments,
    requireMinRole,
    requiredPermission,
    permissionsLoaded,
    can,
    hasExplicitGrant,
    navigate,
  ]);

  // Show nothing while loading auth state
  if (isLoading) return null;
  if (requiredPermission && !permissionsLoaded) return null;

  return <>{children}</>;
}
