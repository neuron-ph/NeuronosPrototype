import type { AccessProfileSummary, ModuleGrants, VisibilityScope } from "./accessProfileTypes";

export const countEnabledGrants = (grants: ModuleGrants | null | undefined): number =>
  Object.values(grants ?? {}).filter(Boolean).length;

export const countGrantOverrides = (grants: ModuleGrants | null | undefined): number =>
  Object.keys(grants ?? {}).length;

export const hasGrantOverrides = (grants: ModuleGrants | null | undefined): boolean =>
  countGrantOverrides(grants) > 0;

export const cloneGrants = (grants: ModuleGrants | null | undefined): ModuleGrants => ({
  ...(grants ?? {}),
});

export const normalizeProfileName = (name: string): string => name.trim();

export const mergeGrantLayers = (
  baseline: ModuleGrants | null | undefined,
  overrides: ModuleGrants | null | undefined,
): ModuleGrants => ({
  ...(baseline ?? {}),
  ...(overrides ?? {}),
});

export const deriveGrantOverrides = (
  resolved: ModuleGrants | null | undefined,
  baseline: ModuleGrants | null | undefined,
): ModuleGrants => {
  const next: ModuleGrants = {};
  const baselineGrants = baseline ?? {};
  const resolvedGrants = resolved ?? {};
  const keys = new Set([...Object.keys(baselineGrants), ...Object.keys(resolvedGrants)]);

  for (const key of keys) {
    const baselineValue = baselineGrants[key];
    const resolvedValue = resolvedGrants[key];
    if (resolvedValue === baselineValue) continue;
    if (resolvedValue === undefined) continue;
    next[key] = resolvedValue;
  }

  return next;
};

export const roleDefaultVisibilityScope = (role: string): VisibilityScope => {
  if (role === "executive") return "all";
  if (role === "manager") return "department";
  if (role === "team_leader" || role === "supervisor") return "team";
  return "own";
};

export const normalizeLegacyVisibilityScope = (
  scope: VisibilityScope | "department_wide" | "cross_department" | "full" | null | undefined,
): VisibilityScope | null => {
  if (!scope) return null;
  if (scope === "department_wide") return "department";
  if (scope === "cross_department") return "selected_departments";
  if (scope === "full") return "all";
  return scope;
};

export const resolveProfileVisibilityScope = (
  explicitScope: VisibilityScope | "department_wide" | "cross_department" | "full" | null | undefined,
  role: string,
): VisibilityScope => normalizeLegacyVisibilityScope(explicitScope) ?? roleDefaultVisibilityScope(role);

export const chooseRoleDefaultProfile = (
  profiles: AccessProfileSummary[],
  role: string,
  department?: string | null,
): AccessProfileSummary | null => {
  const roleMatches = profiles.filter((profile) => profile.target_role === role);
  if (roleMatches.length === 0) return null;

  const exactDepartmentMatch = department
    ? roleMatches.find((profile) => profile.target_department === department)
    : null;
  if (exactDepartmentMatch) return exactDepartmentMatch;

  return roleMatches.find((profile) => !profile.target_department) ?? roleMatches[0];
};
