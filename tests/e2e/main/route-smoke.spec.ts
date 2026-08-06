// A4 · ROUTE SMOKE — Neuron Main.
//
// Visit every page as someone entitled to it. Record HTTP status, console
// errors, and whether the page actually rendered content.
//
// Sharpened by M28: loading contacts returns 401 while the user is signed in,
// because the Qwik `server$` path is unauthenticated. This pass asks how far
// that reaches — every "Not authenticated" seen on a page the user is allowed
// to open is the same defect showing up somewhere new.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { signIn, record, printChain } from "./_helpers";

// One driver per department so each route is opened by someone entitled to it.
const DRIVERS: Record<string, string> = {
  bd: "jr.businessdev02@falconslogistics-ph.com",
  pricing: "jr.pricing01@falconslogistics-ph.com",
  operations: "jr.manager02@falconslogistics-ph.com",
  accounting: "test2@neuron.com.ph",
  personal: "jr.businessdev02@falconslogistics-ph.com",
  dashboard: "jr.businessdev02@falconslogistics-ph.com",
  settings: "jr.businessdev02@falconslogistics-ph.com",
};

const ROUTES = [
  "/dashboard",
  "/bd/inquiries", "/bd/inquiries/create", "/bd/customers", "/bd/contacts",
  "/bd/projects", "/bd/contracts", "/bd/tasks", "/bd/activities", "/bd/budget-requests",
  "/pricing/quotations", "/pricing/quotations/create", "/pricing/projects",
  "/pricing/contracts", "/pricing/customers", "/pricing/contacts", "/pricing/vendors",
  "/operations/brokerage", "/operations/forwarding", "/operations/trucking",
  "/operations/marine-insurance", "/operations/others",
  "/accounting/bookings", "/accounting/invoices", "/accounting/evouchers",
  "/accounting/collections", "/accounting/financials", "/accounting/reports",
  "/accounting/catalog", "/accounting/coa", "/accounting/journal",
  "/accounting/customers", "/accounting/projects", "/accounting/contracts",
  "/accounting/statements",
  "/personal/inbox", "/personal/calendar", "/personal/approval", "/personal/evouchers",
  "/settings",
];

const deptOf = (r: string) => r.split("/")[1] || "dashboard";

type Row = { route: string; status: number; authErrors: number; otherErrors: number; text: number };
const results: Row[] = [];

// NOT .serial: one hanging page must not stop the other 39. The first run
// aborted at /pricing/quotations/create and left 28 routes unmeasured — a
// harness that stops measuring after the first problem (SAFETY-TETHER E4).
test.describe("A4 · route smoke", () => {
  test.afterAll(() => {
    const auth = results.filter((r) => r.authErrors > 0);
    const blank = results.filter((r) => r.text < 200 && r.status === 200);
    const bad = results.filter((r) => r.status >= 400);
    const hung = results.filter((r) => r.status === -1);

    console.log("\n──────── A4 · route smoke ────────");
    console.log(`  routes visited              : ${results.length}`);
    console.log(`  non-200                     : ${bad.length}`);
    console.log(`  never finished loading      : ${results.filter(r=>r.status===-1).length}`);
    console.log(`  rendered almost nothing     : ${blank.length}`);
    console.log(`  "Not authenticated" errors  : ${auth.length}   <-- the M28 family`);
    if (auth.length) {
      console.log("\n  pages hitting auth errors while signed in and entitled:");
      for (const r of auth) console.log(`    ${String(r.authErrors).padStart(2)}x  ${r.route}`);
    }
    if (blank.length) {
      console.log("\n  pages that rendered almost nothing:");
      for (const r of blank) console.log(`    ${r.route}  (${r.text} chars)`);
    }
    if (bad.length) {
      console.log("\n  non-200:");
      for (const r of bad) console.log(`    ${r.status}  ${r.route}`);
    }
    console.log("──────────────────────────────────\n");
    printChain();
  });

  for (const route of ROUTES) {
    test(`smoke ${route}`, async ({ browser }) => {
      const page = await signIn(browser, DRIVERS[deptOf(route)] ?? DRIVERS.bd);

      const errs: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      page.on("pageerror", (e) => errs.push(String(e)));

      let status = 0;
      let hung = false;
      try {
        const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20_000 });
        status = res?.status() ?? 0;
      } catch {
        hung = true; // never finished loading — recorded, not thrown
      }
      await page.waitForTimeout(2000);

      const text = (await page.locator("main").innerText().catch(() => "")) || "";
      const authErrors = errs.filter((e) => /not authenticated|401/i.test(e)).length;

      results.push({
        route,
        status: hung ? -1 : status,
        authErrors,
        otherErrors: errs.length - authErrors,
        text: text.trim().length,
      });

      // Recorded, never failed: a pre-launch page that is not built is data.
      expect(status).toBeLessThan(500);
    });
  }
});
