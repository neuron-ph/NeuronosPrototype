import { describe, expect, it } from "vitest";
import {
  cloneGrants,
  countEnabledGrants,
  countGrantOverrides,
  hasGrantOverrides,
  normalizeProfileName,
  shouldClearAppliedProfile,
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

  it("clears applied profile only after a manual change", () => {
    expect(shouldClearAppliedProfile("profile-1", true)).toBe(true);
    expect(shouldClearAppliedProfile("profile-1", false)).toBe(false);
    expect(shouldClearAppliedProfile(null, true)).toBe(false);
  });
});
