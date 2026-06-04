// NEU-012 Contract #4+#5 (Phase 2) — snapshot tool.
//
// Computes each user's EFFECTIVE access grants using the app's exact resolution
// logic (reused, not reimplemented) so a verbatim snapshot can replace the
// override + cascade machinery with one explicit profile per user.
//
// Guarded: skipped by `npm test`. Run explicitly:
//   RBAC_SNAPSHOT=report npx vitest run src/rbacSnapshot.test.ts   (dry run, writes nothing)
//
// Reads dev URL + service-role key from .env.local (never committed).

import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PERM_MODULES } from "./components/admin/permissionsConfig";
import {
  resolveCascadedGrants,
  mergeGrantLayers,
  chooseRoleDefaultProfile,
} from "./components/admin/accessProfiles/accessGrantUtils";

const MODE = process.env.RBAC_SNAPSHOT ?? "";

function envFromLocal(key: string): string {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = txt.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const keyCount = (g: Record<string, boolean> | null | undefined) => Object.keys(g ?? {}).length;
const enabledCount = (g: Record<string, boolean> | null | undefined) =>
  Object.values(g ?? {}).filter(Boolean).length;

describe.skipIf(MODE === "")("rbac snapshot (Phase 2)", () => {
  it("computes effective grants per user", async () => {
    const url = envFromLocal("VITE_SUPABASE_URL");
    const skey = envFromLocal("DEV_SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !skey) throw new Error("Missing VITE_SUPABASE_URL or DEV_SUPABASE_SERVICE_ROLE_KEY in .env.local");
    if (!url.includes("oqermaidggvanahumjmj")) throw new Error(`Refusing: URL is not dev (${url})`);
    const db = createClient(url, skey, { auth: { persistSession: false } });

    const [{ data: users }, { data: overrides }, { data: profiles }] = await Promise.all([
      db.from("users").select("id, auth_id, role, department, service_type"),
      db.from("permission_overrides").select("user_id, module_grants, applied_profile_id"),
      db.from("access_profiles").select("id, name, module_grants, target_role, target_department, target_service, is_active, is_baseline, updated_at").eq("is_active", true),
    ]);
    if (!users || !overrides || !profiles) throw new Error("fetch failed");

    const profilesById = new Map(profiles.map((p: any) => [p.id, p]));
    const baselineProfiles = profiles.filter((p: any) => p.is_baseline);
    const overrideByUser = new Map(overrides.map((o: any) => [o.user_id, o]));

    const shapes = new Map<string, number>();
    const rows: any[] = [];
    let noProfile = 0;

    for (const u of users as any[]) {
      const ov = overrideByUser.get(u.id) ?? null;
      const assigned = ov?.applied_profile_id ? profilesById.get(ov.applied_profile_id) : null;
      const baseline = assigned ?? chooseRoleDefaultProfile(baselineProfiles as any, u.role ?? "staff", u.department, u.service_type);
      if (!baseline && keyCount(ov?.module_grants) === 0) noProfile++;
      // EXACT PermissionProvider merge + cascade (cascade materialized to explicit).
      const effective = resolveCascadedGrants(
        mergeGrantLayers(baseline?.module_grants, ov?.module_grants ?? {}),
        PERM_MODULES as any,
      );
      const sig = JSON.stringify(Object.entries(effective).filter(([, v]) => v).map(([k]) => k).sort());
      shapes.set(sig, (shapes.get(sig) ?? 0) + 1);
      rows.push({
        user: u.id, role: u.role, dept: u.department, svc: u.service_type ?? "-",
        baseline: baseline?.name ?? "(none)", ovKeys: keyCount(ov?.module_grants), effEnabled: enabledCount(effective),
      });
    }

    const dist = (xs: number[]) => {
      const b = { "0": 0, "1-50": 0, "51-150": 0, "151+": 0 } as Record<string, number>;
      for (const n of xs) b[n === 0 ? "0" : n <= 50 ? "1-50" : n <= 150 ? "51-150" : "151+"]++;
      return b;
    };

    console.log("\n===== RBAC SNAPSHOT DRY RUN =====");
    console.log("users:", users.length);
    console.log("users with NO resolvable profile AND empty override (would be empty):", noProfile);
    console.log("DISTINCT effective grant-shapes (=> profiles needed):", shapes.size);
    console.log("effective enabled-grant count distribution:", dist(rows.map((r) => r.effEnabled)));
    console.log("shape frequency (users per shape):", [...shapes.values()].sort((a, b) => b - a));
    console.log("\nper-user (role/dept/svc | baseline | overrideKeys -> effectiveEnabled):");
    for (const r of rows.sort((a, b) => b.effEnabled - a.effEnabled)) {
      console.log(`  ${r.user}  ${r.role}/${r.dept}/${r.svc}  base=${r.baseline}  ov=${r.ovKeys} -> eff=${r.effEnabled}`);
    }
    console.log("===== END (dry run — nothing written) =====\n");
  }, 120_000);
});
