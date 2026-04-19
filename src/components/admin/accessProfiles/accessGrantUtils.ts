import type { ModuleGrants } from "./accessProfileTypes";

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

export const shouldClearAppliedProfile = (
  previousAppliedProfileId: string | null,
  changedAfterProfileApply: boolean,
): boolean => Boolean(previousAppliedProfileId && changedAfterProfileApply);
