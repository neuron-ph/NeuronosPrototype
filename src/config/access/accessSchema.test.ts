import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCESS_SCHEMA,
  ACCESS_DEPARTMENT_ORDER,
  ACCESS_NODE_BY_MODULE_ID,
  ACCESS_TAB_BY_MODULE_ID,
  ACCESS_MODULE_BY_PAGE,
  ALL_MODULE_NODES,
  CONTACT_MODULE_IDS,
  CUSTOMER_MODULE_IDS,
  PROJECT_MODULE_IDS,
  CONTRACT_MODULE_IDS,
  getVisibleAccessMatrixModules,
  getVisibleAccessMatrixDepartments,
} from "./accessSchema";
import { PERM_MODULES } from "../../components/admin/permissionsConfig";

describe("access schema integrity", () => {
  it("has departments in canonical order", () => {
    expect(ACCESS_DEPARTMENT_ORDER).toEqual([
      "business-development",
      "pricing",
      "operations",
      "accounting",
      "hr",
      "executive",
      "inbox",
      "personal",
    ]);
  });

  it("every module has a non-empty moduleId and label", () => {
    for (const m of ALL_MODULE_NODES) {
      expect(m.moduleId).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });

  it("every tab has a non-empty moduleId and clean label (no ↳ prefix)", () => {
    for (const m of ALL_MODULE_NODES) {
      for (const t of m.tabs) {
        expect(t.moduleId).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.label.startsWith("↳")).toBe(false);
      }
    }
  });

  it("module and tab moduleIds are globally unique", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const m of ALL_MODULE_NODES) {
      if (seen.has(m.moduleId)) dupes.push(m.moduleId);
      seen.add(m.moduleId);
      for (const t of m.tabs) {
        if (seen.has(t.moduleId)) dupes.push(t.moduleId);
        seen.add(t.moduleId);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("PERM_MODULES is derived from schema (count matches)", () => {
    const schemaCount = ALL_MODULE_NODES.reduce(
      (n, m) => n + 1 + m.tabs.length,
      0,
    );
    expect(PERM_MODULES.length).toBe(schemaCount);
  });

  it("admin_overrides_tab is NOT exposed in the visible matrix", () => {
    const ids = PERM_MODULES.map(m => m.id);
    expect(ids).not.toContain("admin_overrides_tab");
    expect(ACCESS_NODE_BY_MODULE_ID["admin_overrides_tab"]).toBeUndefined();
    expect(ACCESS_TAB_BY_MODULE_ID["admin_overrides_tab"]).toBeUndefined();
  });

  it("sidebar pageIds map back to schema modules", () => {
    // Drift check: every module with a pageId is reachable via ACCESS_MODULE_BY_PAGE
    for (const m of ALL_MODULE_NODES) {
      if (m.pageId) {
        expect(ACCESS_MODULE_BY_PAGE[m.pageId]?.moduleId).toBe(m.moduleId);
      }
    }
  });

  it("sidebar-visible accounting module order matches expected canonical order", () => {
    const acct = ACCESS_SCHEMA.find(d => d.id === "accounting")!;
    const ids = acct.modules.filter(m => m.pageId).map(m => m.moduleId);
    expect(ids).toEqual([
      "acct_financials",
      "acct_evouchers",
      "acct_journal",
      "acct_coa",
      "acct_projects",
      "acct_contracts",
      "acct_bookings",
      "acct_customers",
      "acct_catalog",
      "acct_reports",
      "acct_statements",
    ]);
  });

  it("every visible-matrix top-level module has a sidebar pageId", () => {
    // Strict alignment rule: nothing without a pageId may appear as a
    // top-level module in the Access Configuration matrix.
    const offenders: string[] = [];
    for (const dept of ACCESS_SCHEMA) {
      for (const m of getVisibleAccessMatrixModules(dept)) {
        if (!m.pageId) offenders.push(`${dept.id}/${m.moduleId}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("known internal pseudo-modules are hidden from the visible matrix", () => {
    const hiddenIds = new Set(
      ACCESS_SCHEMA
        .flatMap(d => d.modules)
        .filter(m => m.visibleInAccessMatrix === false)
        .map(m => m.moduleId),
    );
    expect(hiddenIds.has("ops_bookings")).toBe(true);
    expect(hiddenIds.has("ops_projects")).toBe(true);
    expect(hiddenIds.has("inbox_entity_picker")).toBe(true);
  });

  it("hidden pseudo-modules still register their runtime moduleIds in the schema", () => {
    // Their tab moduleIds must remain reachable so getInheritedPermission
    // and PERM_MODULES continue to resolve them at runtime.
    expect(ACCESS_NODE_BY_MODULE_ID["ops_bookings"]).toBeDefined();
    expect(ACCESS_TAB_BY_MODULE_ID["ops_bookings_billings_tab"]).toBeDefined();
    expect(ACCESS_NODE_BY_MODULE_ID["ops_projects"]).toBeDefined();
    expect(ACCESS_TAB_BY_MODULE_ID["ops_projects_billings_tab"]).toBeDefined();
    expect(ACCESS_NODE_BY_MODULE_ID["inbox_entity_picker"]).toBeDefined();
    expect(ACCESS_TAB_BY_MODULE_ID["inbox_entity_inquiry_tab"]).toBeDefined();
  });

  it("getVisibleAccessMatrixDepartments excludes hidden modules but keeps every department", () => {
    const visible = getVisibleAccessMatrixDepartments();
    expect(visible.length).toBe(ACCESS_SCHEMA.length);
    const allVisibleIds = new Set(
      visible.flatMap(({ modules }) => modules.map(m => m.moduleId)),
    );
    expect(allVisibleIds.has("ops_bookings")).toBe(false);
    expect(allVisibleIds.has("ops_projects")).toBe(false);
    expect(allVisibleIds.has("inbox_entity_picker")).toBe(false);
  });

  it("each tab's parent module is uniquely defined (structural parent, not label-based)", () => {
    const tabToParent = new Map<string, string>();
    for (const m of ALL_MODULE_NODES) {
      for (const t of m.tabs) {
        expect(tabToParent.has(t.moduleId)).toBe(false);
        tabToParent.set(t.moduleId, m.moduleId);
      }
    }
  });
});

describe("dept-scoped moduleId families", () => {
  it("every family member references a moduleId present in the schema", () => {
    const allSchemaIds = new Set<string>();
    for (const m of ALL_MODULE_NODES) {
      allSchemaIds.add(m.moduleId);
      for (const t of m.tabs) allSchemaIds.add(t.moduleId);
    }
    const allFamilies = [
      CONTACT_MODULE_IDS,
      CUSTOMER_MODULE_IDS,
      PROJECT_MODULE_IDS,
      CONTRACT_MODULE_IDS,
    ] as unknown as Record<string, Record<string, string>>[];
    const missing: string[] = [];
    for (const family of allFamilies) {
      for (const [dept, ids] of Object.entries(family)) {
        for (const [key, id] of Object.entries(ids)) {
          if (!allSchemaIds.has(id)) missing.push(`${dept}.${key} = ${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("each family is imported by at least one app component (drift prevention)", () => {
    const root = resolve(__dirname, "../..");
    const cases = [
      { file: "components/bd/ContactDetail.tsx",                 symbol: "CONTACT_MODULE_IDS" },
      { file: "components/bd/CustomerDetail.tsx",                symbol: "CUSTOMER_MODULE_IDS" },
      { file: "components/projects/ProjectsList.tsx",            symbol: "PROJECT_MODULE_IDS" },
      { file: "components/projects/ProjectDetail.tsx",           symbol: "PROJECT_MODULE_IDS" },
      { file: "components/contracts/ContractsList.tsx",          symbol: "CONTRACT_MODULE_IDS" },
      { file: "components/pricing/ContractDetailView.tsx",       symbol: "CONTRACT_MODULE_IDS" },
    ];
    const failures: string[] = [];
    for (const c of cases) {
      const content = readFileSync(resolve(root, c.file), "utf8");
      if (!content.includes(c.symbol)) failures.push(`${c.file} missing ${c.symbol}`);
    }
    expect(failures).toEqual([]);
  });

  it("pricing_contacts has 6 child tabs", () => {
    const node = ACCESS_NODE_BY_MODULE_ID["pricing_contacts"];
    expect(node).toBeDefined();
    expect(node.tabs.length).toBe(6);
  });

  it("acct_contracts has 14 child tabs", () => {
    const node = ACCESS_NODE_BY_MODULE_ID["acct_contracts"];
    expect(node).toBeDefined();
    expect(node.tabs.length).toBe(14);
  });

  it("schema does not encode per-module action applicability (matrix is sole control surface)", () => {
    for (const m of ALL_MODULE_NODES) {
      expect((m as unknown as Record<string, unknown>).applicableActions).toBeUndefined();
      for (const t of m.tabs) {
        expect((t as unknown as Record<string, unknown>).applicableActions).toBeUndefined();
      }
    }
  });
});
