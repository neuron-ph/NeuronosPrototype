import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { usePermission } from "../context/PermissionProvider";
import { useUser } from "../hooks/useUser";
import type { ActionId, ModuleId } from "./admin/permissionsConfig";

/**
 * RouteGuard — Prevents URL-bar access to restricted modules.
 * Access Configuration is the only source of truth: routes must declare
 * `requiredPermission`. Department/rank guards have been retired.
 */
interface RouteGuardProps {
  children: ReactNode;
  requiredPermission?: { moduleId: ModuleId; action: ActionId };
}

export function RouteGuard({ children, requiredPermission }: RouteGuardProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useUser();
  const { can, isLoaded: permissionsLoaded } = usePermission();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (requiredPermission && !permissionsLoaded) return;

    if (requiredPermission && !can(requiredPermission.moduleId, requiredPermission.action)) {
      console.warn(
        `[RouteGuard] Access denied: missing permission "${requiredPermission.moduleId}.${requiredPermission.action}"`,
      );
      navigate("/dashboard", { replace: true });
    }
  }, [
    isAuthenticated,
    isLoading,
    requiredPermission,
    permissionsLoaded,
    can,
    navigate,
  ]);

  if (isLoading) return null;
  if (requiredPermission && !permissionsLoaded) return null;

  return <>{children}</>;
}
