import { describe, expect, it } from "vitest";
import {
  chooseRoleDefaultProfile,
  cloneGrants,
  countEnabledGrants,
  countGrantOverrides,
  deriveGrantOverrides,
  hasGrantOverrides,
  mergeGrantLayers,
  normalizeProfileName,
  normalizeLegacyVisibilityScope,
  resolveProfileVisibilityScope,
  roleDefaultVisibilityScope,
} from "./accessGrantUtils";

describe("accessGrantUtils", () => {
  it("counts enabled grants separately from total override keys", () => {
    const grants = { "bd_projects:view": true, "bd_projects:edit": false };

    expect(countEnabledGrants(grants)).toBe(1);
    expect(countGrantOverrides(grants)).toBe(2);
    expect(hasGrantOverrides(grants)).toBe(true);
  });

  it("handles empty and null grants", () => {
    expect(countEnabledGrants(null)).toBe(0);
    expect(countGrantOverrides(undefined)).toBe(0);
    expect(hasGrantOverrides({})).toBe(false);
  });

  it("clones grants instead of returning the same object", () => {
    const source = { "bd_projects:view": true };
    const cloned = cloneGrants(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
  });

  it("trims profile names", () => {
    expect(normalizeProfileName("  BD Manager  ")).toBe("BD Manager");
  });

  it("merges profile baseline and explicit overrides", () => {
    expect(
      mergeGrantLayers(
        { "bd_projects:view": true, "bd_projects:edit": true },
        { "bd_projects:edit": false, "bd_projects:approve": true },
      ),
    ).toEqual({
      "bd_projects:view": true,
      "bd_projects:edit": false,
      "bd_projects:approve": true,
    });
  });

  it("derives minimal overrides relative to the baseline profile", () => {
    expect(
      deriveGrantOverrides(
        { "bd_projects:view": true, "bd_projects:edit": false, "bd_projects:approve": true },
        { "bd_projects:view": true, "bd_projects:edit": true },
      ),
    ).toEqual({
      "bd_projects:edit": false,
      "bd_projects:approve": true,
    });
  });

  it("normalizes legacy visibility scopes", () => {
    expect(normalizeLegacyVisibilityScope("department_wide")).toBe("department");
    expect(normalizeLegacyVisibilityScope("cross_department")).toBe("selected_departments");
    expect(normalizeLegacyVisibilityScope("full")).toBe("all");
  });

  it("falls back to role-based default visibility when no explicit scope exists", () => {
    expect(roleDefaultVisibilityScope("staff")).toBe("own");
    expect(roleDefaultVisibilityScope("team_leader")).toBe("team");
    expect(roleDefaultVisibilityScope("manager")).toBe("department");
    expect(resolveProfileVisibilityScope(null, "executive")).toBe("all");
  });

  it("chooses the exact role default profile before the generic one", () => {
    const chosen = chooseRoleDefaultProfile([
      {
        id: "generic-manager",
        name: "Manager",
        description: null,
        target_department: null,
        target_role: "manager",
        module_grants: {},
        visibility_scope: null,
        visibility_departments: null,
        updated_at: "",
      },
      {
        id: "ops-manager",
        name: "Ops Manager",
        description: null,
        target_department: "Operations",
        target_role: "manager",
        module_grants: {},
        visibility_scope: null,
        visibility_departments: null,
        updated_at: "",
      },
    ], "manager", "Operations");

    expect(chosen?.id).toBe("ops-manager");
  });
});
