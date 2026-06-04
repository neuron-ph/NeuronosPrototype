// NEU-012 Contract #4+#5 (Phase 2) — snapshot tool.
//
// Computes each user's EFFECTIVE access (grants + visibility scope/departments)
// using the app's exact resolution logic (reused, not reimplemented), then can
// materialize it as one explicit Access Profile per distinct shape and assign it
// (users.access_profile_id). Overrides + cascade stay LIVE; enforcement is not
// flipped here (Slice 3). Apply is idempotent + reversible (clears prior
// snapshot profiles first).
//
// Guarded: skipped by `npm test`. Run explicitly:
//   RBAC_SNAPSHOT=report npx vitest run src/rbacSnapshot.test.ts   (dry run)
//   RBAC_SNAPSHOT=apply  npx vitest run src/rbacSnapshot.test.ts   (writes profiles + assigns)
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
  roleDefaultVisibilityScope,
} from "./components/admin/accessProfiles/accessGrantUtils";

const MODE = process.env.RBAC_SNAPSHOT ?? "";
const SNAPSHOT_MARKER = "NEU-012 verbatim snapshot (Phase 2)";

function envFromLocal(key: string): string {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = txt.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const enabledKeys = (g: Record<string, boolean> | null | undefined) =>
  Object.entries(g ?? {}).filter(([, v]) => v).map(([k]) => k).sort();

describe.skipIf(MODE === "")("rbac snapshot (Phase 2)", () => {
  it("computes (and optionally materializes) per-user effective access", async () => {
    const url = envFromLocal("VITE_SUPABASE_URL");
    const skey = envFromLocal("DEV_SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !skey) throw new Error("Missing VITE_SUPABASE_URL or DEV_SUPABASE_SERVICE_ROLE_KEY in .env.local");
    if (!url.includes("oqermaidggvanahumjmj")) throw new Error(`Refusing: URL is not dev (${url})`);
    const db = createClient(url, skey, { auth: { persistSession: false } });
    const APPLY = MODE === "apply";

    const [{ data: users }, { data: overrides }, { data: profiles }] = await Promise.all([
      db.from("users").select("id, auth_id, role, department, service_type"),
      db.from("permission_overrides").select("user_id, module_grants, applied_profile_id, scope, departments"),
      db.from("access_profiles").select("id, name, module_grants, visibility_scope, visibility_departments, target_role, target_department, target_service, is_active, is_baseline, description").eq("is_active", true),
    ]);
    if (!users || !overrides || !profiles) throw new Error("fetch failed");

    const profilesById = new Map(profiles.map((p: any) => [p.id, p]));
    const baselineProfiles = profiles.filter((p: any) => p.is_baseline);
    const overrideByUser = new Map(overrides.map((o: any) => [o.user_id, o]));

    // Compute effective (grants + scope + departments) per user — mirrors the app + DB resolvers.
    type Eff = { user: any; grants: string[]; scope: string; depts: string[] };
    const effs: Eff[] = [];
    for (const u of users as any[]) {
      const ov = overrideByUser.get(u.id) ?? null;
      const assigned = ov?.applied_profile_id ? profilesById.get(ov.applied_profile_id) : null;
      const baseline = assigned ?? chooseRoleDefaultProfile(baselineProfiles as any, u.role ?? "staff", u.department, u.service_type);
      const grants = enabledKeys(resolveCascadedGrants(mergeGrantLayers(baseline?.module_grants, ov?.module_grants ?? {}), PERM_MODULES as any));
      // scope: override.scope -> assigned profile scope -> role default (mirrors current_user_visibility_scope)
      const scope = ov?.scope ?? (assigned?.visibility_scope ?? null) ?? roleDefaultVisibilityScope(u.role ?? "staff");
      // departments: override.departments (non-empty) -> assigned profile depts -> []
      const depts = (ov?.departments?.length ? ov.departments : null) ?? (assigned?.visibility_departments ?? null) ?? [];
      effs.push({ user: u, grants, scope, depts: [...depts].sort() });
    }

    const sig = (e: Eff) => JSON.stringify([e.grants, e.scope, e.depts]);
    const groups = new Map<string, Eff[]>();
    for (const e of effs) { const k = sig(e); (groups.get(k) ?? groups.set(k, []).get(k)!).push(e); }

    console.log("\n===== RBAC SNAPSHOT =====");
    console.log("mode:", MODE, "| users:", users.length, "| distinct (grants+scope+depts) shapes:", groups.size);
    console.log("shape frequency:", [...groups.values()].map((g) => g.length).sort((a, b) => b - a));

    if (!APPLY) {
      console.log("(dry run — nothing written) run with RBAC_SNAPSHOT=apply to materialize.");
      console.log("===== END =====\n");
      return;
    }

    // --- APPLY (idempotent + reversible): clear prior snapshot profiles first ---
    const priorSnap = profiles.filter((p: any) => p.description === SNAPSHOT_MARKER).map((p: any) => p.id);
    if (priorSnap.length) {
      await db.from("users").update({ access_profile_id: null }).in("access_profile_id", priorSnap);
      await db.from("access_profiles").delete().in("id", priorSnap);
      console.log("cleared prior snapshot profiles:", priorSnap.length);
    }

    let created = 0, assigned = 0, idx = 0;
    for (const g of groups.values()) {
      idx++;
      const s = g[0];
      const grantsMap: Record<string, boolean> = {};
      for (const k of s.grants) grantsMap[k] = true;
      const u = s.user;
      // index guarantees uniqueness (access_profiles.name is unique)
      const name = `Snapshot ${String(idx).padStart(2, "0")} — ${u.role ?? "staff"} · ${u.department ?? "-"}${u.service_type ? " · " + u.service_type : ""}`;
      const { data: prof, error } = await db.from("access_profiles").insert({
        name,
        description: SNAPSHOT_MARKER,
        module_grants: grantsMap,
        visibility_scope: s.scope,
        visibility_departments: s.depts.length ? s.depts : null,
        target_role: u.role ?? null,
        target_department: u.department ?? null,
        target_service: u.service_type ?? null,
        is_active: true,
        is_baseline: false,
      }).select("id").single();
      if (error || !prof) throw new Error(`profile insert failed: ${error?.message}`);
      created++;
      for (const e of g) {
        const { error: ue } = await db.from("users").update({ access_profile_id: prof.id }).eq("id", e.user.id);
        if (ue) throw new Error(`assign failed for ${e.user.id}: ${ue.message}`);
        assigned++;
      }
    }
    console.log("created profiles:", created, "| assigned users:", assigned);

    // --- VERIFY: read back each user's assigned profile, compare to computed ---
    const { data: check } = await db.from("users").select("id, access_profile_id");
    const assignedMap = new Map((check ?? []).map((r: any) => [r.id, r.access_profile_id]));
    const { data: snapProfiles } = await db.from("access_profiles").select("id, module_grants, visibility_scope, visibility_departments").eq("description", SNAPSHOT_MARKER);
    const snapById = new Map((snapProfiles ?? []).map((p: any) => [p.id, p]));
    let mismatch = 0, unassigned = 0;
    for (const e of effs) {
      const pid = assignedMap.get(e.user.id);
      if (!pid) { unassigned++; continue; }
      const p: any = snapById.get(pid);
      const pGrants = enabledKeys(p?.module_grants);
      const pScope = p?.visibility_scope ?? null;
      const pDepts = [...(p?.visibility_departments ?? [])].sort();
      const ok = JSON.stringify(pGrants) === JSON.stringify(e.grants)
        && pScope === e.scope
        && JSON.stringify(pDepts) === JSON.stringify(e.depts);
      if (!ok) { mismatch++; if (mismatch <= 5) console.log("MISMATCH", e.user.id, "scope", pScope, "vs", e.scope, "grants", pGrants.length, "vs", e.grants.length); }
    }
    console.log("VERIFY -> unassigned:", unassigned, "| mismatches:", mismatch, "| total:", effs.length);
    console.log(mismatch === 0 && unassigned === 0 ? "OK: every user assigned; profile == computed effective (verbatim)." : "FAIL: see above.");
    console.log("===== END =====\n");
  }, 180_000);
});
