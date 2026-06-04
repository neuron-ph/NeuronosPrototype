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
type CanFn = (moduleId: ModuleId, action: ActionId) => boolean;

interface RouteGuardProps {
  children: ReactNode;
  requiredPermission?: { moduleId: ModuleId; action: ActionId };
  /**
   * Predicate form: pass when access is an OR over several real grants (e.g.
   * bookings = canActOnBooking). Reuses the SAME helper the UI buttons use, so
   * route + button + DB stay aligned. `predicateLabel` is for the denied log.
   */
  requiredPredicate?: (can: CanFn) => boolean;
  predicateLabel?: string;
}

export function RouteGuard({
  children,
  requiredPermission,
  requiredPredicate,
  predicateLabel,
}: RouteGuardProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useUser();
  const { can, isLoaded: permissionsLoaded } = usePermission();
  const needsPermissions = !!requiredPermission || !!requiredPredicate;

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (needsPermissions && !permissionsLoaded) return;

    const denied =
      (!!requiredPermission && !can(requiredPermission.moduleId, requiredPermission.action)) ||
      (!!requiredPredicate && !requiredPredicate(can));

    if (denied) {
      const label = requiredPermission
        ? `${requiredPermission.moduleId}.${requiredPermission.action}`
        : predicateLabel ?? "predicate";
      console.warn(`[RouteGuard] Access denied: missing permission "${label}"`);
      navigate("/dashboard", { replace: true });
    }
  }, [
    isAuthenticated,
    isLoading,
    requiredPermission,
    requiredPredicate,
    predicateLabel,
    needsPermissions,
    permissionsLoaded,
    can,
    navigate,
  ]);

  if (isLoading) return null;
  if (needsPermissions && !permissionsLoaded) return null;

  return <>{children}</>;
}
