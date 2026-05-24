import type { AccessProfileSummary, ModuleGrants, VisibilityScope } from "./accessProfileTypes";

type CascadeModule = {
  id: string;
  parentId?: string;
  containsModuleIds?: string[];
};

const hasOwnGrant = (grants: ModuleGrants, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(grants, key);

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

export const resolveCascadedGrants = (
  grants: ModuleGrants | null | undefined,
  modules: CascadeModule[],
): ModuleGrants => {
  const explicitGrants = grants ?? {};
  const resolved = cloneGrants(explicitGrants);
  const childrenByParent = new Map<string, CascadeModule[]>();

  for (const mod of modules) {
    if (!mod.parentId) continue;
    const children = childrenByParent.get(mod.parentId) ?? [];
    children.push(mod);
    childrenByParent.set(mod.parentId, children);
  }

  for (const mod of modules) {
    if (!mod.containsModuleIds?.length) continue;
    const children = childrenByParent.get(mod.id) ?? [];
    const knownChildIds = new Set(children.map((child) => child.id));
    for (const containedId of mod.containsModuleIds) {
      if (knownChildIds.has(containedId)) continue;
      children.push({ id: containedId });
      knownChildIds.add(containedId);
    }
    childrenByParent.set(mod.id, children);
  }

  for (const parent of modules) {
    if (parent.parentId) continue;
    const children = childrenByParent.get(parent.id);
    if (!children?.length) continue;

    for (const parentKey of Object.keys(explicitGrants)) {
      const separatorIndex = parentKey.lastIndexOf(":");
      if (separatorIndex <= 0) continue;
      const parentId = parentKey.slice(0, separatorIndex);
      if (parentId !== parent.id) continue;

      const action = parentKey.slice(separatorIndex + 1);
      const parentValue = explicitGrants[parentKey];
      for (const child of children) {
        const childKey = `${child.id}:${action}`;
        if (hasOwnGrant(explicitGrants, childKey)) continue;
        resolved[childKey] = parentValue;
      }
    }
  }

  return resolved;
};

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
