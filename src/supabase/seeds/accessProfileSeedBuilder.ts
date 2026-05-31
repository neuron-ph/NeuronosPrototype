/**
 * Builder for access-profile BASELINE seed rows.
 *
 * Source of truth for the policy: src/docs/ACCESS_PROFILE_SEEDS.md
 * Translates the documented ladders/patterns into module_grants JSON using the
 * REAL module/tab ids from ACCESS_SCHEMA. Pure (no IO) — consumed by:
 *   - scripts/genAccessProfileSeeds.ts  (emits a migration)
 *   - scripts/applyAccessProfileSeeds.ts (upserts to a Supabase project)
 */
import {
  ACCESS_NODE_BY_MODULE_ID,
  ALL_MODULE_NODES,
} from "../../config/access/accessSchema";

export type Grants = Record<string, boolean>;

export interface Seed {
  name: string;
  department: string | null;
  role: string | null;
  service: string | null;
  visibility: string;
  grants: Grants;
}

// ─── Action sets ─────────────────────────────────────────────────────────────
const A = {
  VCE:    ["view", "create", "edit"],
  VCEX:   ["view", "create", "edit", "export"],
  VCX:    ["view", "create", "export"],
  VCEAX:  ["view", "create", "edit", "approve", "export"],
  VCEADX: ["view", "create", "edit", "approve", "delete", "export"],
  VCEDX:  ["view", "create", "edit", "delete", "export"],
  VX:     ["view", "export"],
  VC:     ["view", "create"],
  ALL:    ["view", "create", "edit", "approve", "delete", "export"],
} as const;

function setGrants(g: Grants, ids: string[], actions: readonly string[]) {
  for (const id of ids) for (const a of actions) g[`${id}:${a}`] = true;
}
// Explicit DENY. Required for tabs that must stay OFF even though their parent
// module is ON: the editor cascades a parent's grant down to contained child
// tabs, so an omitted tab would be filled in. Storing false (all actions)
// overrides the cascade — same as un-checking a cascaded child by hand.
function denyGrants(g: Grants, ids: string[]) {
  for (const id of ids) for (const a of A.ALL) g[`${id}:${a}`] = false;
}
function ownTabs(moduleId: string): string[] {
  return ACCESS_NODE_BY_MODULE_ID[moduleId]?.tabs.map((t) => t.moduleId) ?? [];
}
function withTabs(moduleId: string): string[] {
  return [moduleId, ...ownTabs(moduleId)];
}
function fullModule(moduleId: string): string[] {
  const node = ACCESS_NODE_BY_MODULE_ID[moduleId];
  return [moduleId, ...ownTabs(moduleId), ...(node?.containsModuleIds ?? [])];
}

// Booking-detail tabs (shared across services). ON set + OFF set (explicit deny).
const BOOKING_ON = [
  "ops_bookings_info_tab", "ops_bookings_billings_tab",
  "ops_bookings_expenses_tab", "ops_bookings_comments_tab", "ops_bookings_chrono_tab",
];
const BOOKING_OFF = ["ops_bookings_invoices_tab", "ops_bookings_collections_tab"];

// BD Projects on/off tabs (Financial Overview has no permission key yet).
const PROJECT_ON = [
  "ops_projects_all_tab", "ops_projects_active_tab", "ops_projects_completed_tab",
  "ops_projects_info_tab", "ops_projects_quotation_tab", "ops_projects_bookings_tab",
  "ops_projects_attachments_tab", "ops_projects_comments_tab",
];
const PROJECT_OFF = [
  "ops_projects_expenses_tab", "ops_projects_billings_tab",
  "ops_projects_invoices_tab", "ops_projects_collections_tab",
];

// BD Contracts on/off tabs.
const CONTRACT_ON = [
  "pricing_contracts_all_tab", "pricing_contracts_active_tab", "pricing_contracts_expiring_tab",
  "pricing_contracts_quotation_tab", "pricing_contracts_rate_card_tab", "pricing_contracts_bookings_tab",
  "pricing_contracts_attachments_tab", "pricing_contracts_comments_tab", "pricing_contracts_activity_tab",
];
const CONTRACT_OFF = [
  "pricing_contracts_financial_overview_tab", "pricing_contracts_billings_tab",
  "pricing_contracts_invoices_tab", "pricing_contracts_collections_tab", "pricing_contracts_expenses_tab",
];

type Role = "staff" | "team_leader" | "supervisor" | "manager";
const ROLES: { key: Role; label: string }[] = [
  { key: "staff", label: "Staff" },
  { key: "team_leader", label: "Team Leader" },
  { key: "supervisor", label: "Supervisor" },
  { key: "manager", label: "Manager" },
];
const roleVisibility = (role: Role) =>
  role === "staff" ? "own" : role === "manager" ? "department" : "team";

// ─── Operations ladder ───────────────────────────────────────────────────────
function opsGrants(homeModuleId: string, role: Role): Grants {
  const g: Grants = {};
  const svcActions = role === "manager" ? A.VCEDX : A.VCEX;
  const services = homeModuleId === "ops_others" ? ["ops_others"] : [homeModuleId, "ops_others"];
  for (const svc of services) setGrants(g, [svc, ...ownTabs(svc)], svcActions);
  setGrants(g, BOOKING_ON, svcActions);
  denyGrants(g, BOOKING_OFF); // Invoices/Collections stay OFF despite service ON
  if (role === "staff") {
    setGrants(g, withTabs("inbox"), A.VCEX);
    setGrants(g, withTabs("my_evouchers"), A.VCEDX);
  } else {
    setGrants(g, withTabs("inbox"), A.VX);
    setGrants(g, withTabs("my_evouchers"), A.VX);
  }
  return g;
}

// ─── Business Development ladder (module ticks identical across roles) ─────────
function bdGrants(role: Role): Grants {
  const g: Grants = {};
  setGrants(g, withTabs("bd_contacts"), A.VCE);
  setGrants(g, withTabs("bd_customers"), A.VCE);
  setGrants(g, withTabs("bd_inquiries"), A.VCE);
  setGrants(g, ["bd_projects", ...PROJECT_ON], A.VCE);
  denyGrants(g, PROJECT_OFF);
  setGrants(g, ["bd_contracts", ...CONTRACT_ON], A.VCX);
  denyGrants(g, CONTRACT_OFF);
  setGrants(g, ["bd_tasks"], A.ALL);
  setGrants(g, ["bd_activities"], A.ALL);
  setGrants(g, withTabs("bd_budget_requests"), A.VCEDX);
  const inboxPersonal = role === "staff" ? A.VCEAX : A.VX;
  setGrants(g, withTabs("inbox"), inboxPersonal);
  setGrants(g, withTabs("my_evouchers"), inboxPersonal);
  return g;
}

// ─── Pricing ladder (flat; manager +delete & +users) ─────────────────────────
const PRICING_MODULES = [
  "pricing_contacts", "pricing_customers", "pricing_quotations", "pricing_projects",
  "pricing_contracts", "pricing_network_partners", "ops_marine_insurance", "ops_others",
];
function pricingGrants(role: Role): Grants {
  const g: Grants = {};
  const modActions = role === "manager" ? A.VCEADX : A.VCEAX;
  for (const m of PRICING_MODULES) setGrants(g, fullModule(m), modActions);
  setGrants(g, withTabs("acct_catalog"), A.ALL);
  setGrants(g, withTabs("inbox"), A.VCEAX);
  setGrants(g, withTabs("my_evouchers"), A.VCEADX);
  if (role === "manager") setGrants(g, withTabs("exec_users"), A.VC);
  return g;
}

// ─── Executive universal ─────────────────────────────────────────────────────
function executiveGrants(): Grants {
  const g: Grants = {};
  for (const node of ALL_MODULE_NODES) {
    setGrants(g, [node.moduleId, ...node.tabs.map((t) => t.moduleId)], A.ALL);
  }
  return g;
}

export function buildSeeds(): Seed[] {
  const seeds: Seed[] = [];

  seeds.push({
    name: "Baseline — Executive",
    department: null, role: "executive", service: null,
    visibility: "all", grants: executiveGrants(),
  });

  const opsServices = [
    { label: "Forwarding", module: "ops_forwarding" },
    { label: "Brokerage", module: "ops_brokerage" },
    { label: "Trucking", module: "ops_trucking" },
    { label: "Others", module: "ops_others" },
  ];
  for (const svc of opsServices) {
    for (const r of ROLES) {
      seeds.push({
        name: `Baseline — Operations · ${svc.label} · ${r.label}`,
        department: "Operations", role: r.key, service: svc.label,
        visibility: roleVisibility(r.key), grants: opsGrants(svc.module, r.key),
      });
    }
  }

  for (const r of ROLES) {
    seeds.push({
      name: `Baseline — Business Development · ${r.label}`,
      department: "Business Development", role: r.key, service: null,
      visibility: roleVisibility(r.key), grants: bdGrants(r.key),
    });
  }

  for (const r of ROLES) {
    seeds.push({
      name: `Baseline — Pricing · ${r.label}`,
      department: "Pricing", role: r.key, service: null,
      visibility: roleVisibility(r.key), grants: pricingGrants(r.key),
    });
  }

  // NOTE: do NOT derive hidden-module rollups (ops_bookings / ops_projects) into
  // the seed. Seeds store only EXPLICIT per-tab grants — the editor cascades a
  // parent's grant down to its child tabs for display, so a stored ops_bookings
  // rollup would wrongly light up Invoices/Collections (whose own keys are off).
  // The rollup is recomputed on save via deriveHiddenModuleGrants in handleSave.
  return seeds;
}
