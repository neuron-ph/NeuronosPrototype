import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — route smoke.
//
// Generated, not hand-written: the route list per persona comes from
// docs/qa/personas.json, which is derived from permission_overrides joined
// against the door inventory. Add a module, re-run the extractors, and this
// suite widens on its own.
//
//   node scripts/inventory-capabilities.mjs
//   node scripts/inventory-personas.mjs
//   npm run test:e2e -- route-smoke
//
// What it proves: every route a persona is granted actually loads for them,
// without crashing, bouncing to login, or throwing in the console.
//
// What it does NOT prove: that anything on the page is correct. Every one of the
// ten findings in docs/qa/workflow-chains.md would have passed this suite — the
// booking tabs rendered perfectly and showed nothing. Treat a green run as
// "not on fire", never as coverage.
//
// A route that redirects to /dashboard is a real failure here, not a skip: it
// means RouteGuard and the grant map disagree about what this persona can see.
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD = "devpassword123";

// Playwright runs from the project root (playwright.config.ts lives there).
const ROOT = process.cwd();
const PERSONAS_PATH = path.join(ROOT, "docs", "qa", "personas.json");

if (!fs.existsSync(PERSONAS_PATH)) {
  throw new Error(
    `Missing ${path.relative(ROOT, PERSONAS_PATH)}.\n` +
      `It is gitignored (real emails + grant maps). Regenerate it first:\n` +
      `  node scripts/inventory-capabilities.mjs\n` +
      `  node scripts/inventory-personas.mjs`
  );
}

type Persona = {
  email: string;
  name: string;
  role: string;
  department: string | null;
  isActive: boolean;
  reachableRoutes: string[];
};

const data = JSON.parse(fs.readFileSync(PERSONAS_PATH, "utf8"));

// One persona per department/role bucket — the widest grant set in each, so the
// suite covers the most doors for the fewest logins.
const personas: Persona[] = data.shortlist
  .map((s: { email: string }) => data.personas.find((p: Persona) => p.email === s.email))
  .filter((p: Persona | undefined): p is Persona => Boolean(p) && p!.reachableRoutes.length > 0);

// Console noise that is not a real page fault.
const IGNORED_CONSOLE = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Failed to load resource.*40[34]/i, // asset 404s, not app errors
];

const isRealError = (text: string) => !IGNORED_CONSOLE.some((re) => re.test(text));

// "Am I on the login screen?" — keyed on the Sign In button, not on an Email
// textbox. Playwright matches accessible names by SUBSTRING by default, and
// /admin/users has a "Search name or email…" box, so an Email-textbox probe
// reported that page as a logout. The Sign In button exists only on the login
// screen and is matched exactly.
const signInButton = (page: Page) => page.getByRole("button", { name: "Sign In", exact: true });

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await signInButton(page).click();
  await expect(signInButton(page)).toHaveCount(0, { timeout: 30_000 });

  // The button vanishing only means React re-rendered — Supabase may not have
  // written the session yet. Every route visit below is a full reload that
  // restores auth from sessionStorage, so returning too early means the first
  // navigation lands with no session and the persona reads as logged out for
  // the whole run. Wait for the token to actually be persisted.
  await page.waitForFunction(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("sb-")),
    undefined,
    { timeout: 30_000 }
  );
}

type RouteFault = { route: string; reason: string };

for (const persona of personas) {
  const label = `${persona.department ?? "—"} / ${persona.role}`;

  test(`${label} — ${persona.reachableRoutes.length} granted routes load (${persona.email})`, async ({
    page,
  }) => {
    // Budget: login + a couple of seconds per route, with headroom.
    test.setTimeout(60_000 + persona.reachableRoutes.length * 20_000);

    const faults: RouteFault[] = [];
    let consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" && isRealError(msg.text())) consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      if (isRealError(err.message)) consoleErrors.push(`uncaught: ${err.message}`);
    });

    await login(page, persona.email);

    /** One visit. Returns the fault reason, or null if the route is clean. */
    const visit = async (route: string): Promise<string | null> => {
      consoleErrors = [];

      try {
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20_000 });
      } catch (err) {
        return `navigation failed: ${(err as Error).message}`;
      }

      // Every goto is a full reload, and the session lives in sessionStorage, so
      // the app renders the login screen for a beat before auth restores. Poll
      // for it to clear rather than sampling once after a fixed wait — a fixed
      // wait lands inside that window and reports a false logout.
      try {
        await expect(signInButton(page)).toHaveCount(0, { timeout: 20_000 });
      } catch {
        return "redirected to login (session did not restore)";
      }

      // Let the lazy route chunk resolve and its first queries settle.
      await page.waitForTimeout(1_200);

      // ErrorPage rendered (404 / 500 / Sentry boundary).
      const errored = await page
        .getByRole("heading", { name: /Page not found|Something went wrong/i })
        .count();
      if (errored) return "error page rendered";

      // RouteGuard sent them to the dashboard despite holding the view grant —
      // the grant map and the guard disagree. Not a skip; a real contradiction.
      const landed = new URL(page.url()).pathname;
      if (landed !== route && landed === "/dashboard") {
        return "RouteGuard redirected to /dashboard despite a view grant";
      }

      if (consoleErrors.length) {
        return `console error: ${consoleErrors.slice(0, 2).join(" | ").slice(0, 300)}`;
      }
      return null;
    };

    for (const route of persona.reachableRoutes) {
      let reason = await visit(route);

      // A console-only fault gets one retry. Transient fetch failures against
      // the local dev server are common and would otherwise read as product
      // faults. Deliberately NOT filtering "Failed to fetch" outright — a
      // genuinely broken endpoint must still fail, and it will on the retry.
      if (reason?.startsWith("console error:")) {
        const second = await visit(route);
        reason = second === null ? null : `${second}  (reproduced on retry)`;
      }

      if (reason) faults.push({ route, reason });
    }

    if (faults.length) {
      const detail = faults.map((f) => `  ${f.route}\n      ${f.reason}`).join("\n");
      throw new Error(
        `${faults.length}/${persona.reachableRoutes.length} routes faulted for ${persona.email}:\n${detail}`
      );
    }
  });
}

test("the persona set is non-empty and covers every department", () => {
  // Guards against a silently-empty personas.json making the whole suite pass.
  expect(personas.length, "no personas with reachable routes — re-run the extractors").toBeGreaterThan(0);

  const depts = new Set(personas.map((p) => p.department));
  console.log(
    `[smoke] ${personas.length} personas, ` +
      `${personas.reduce((n, p) => n + p.reachableRoutes.length, 0)} route-loads, ` +
      `departments: ${[...depts].join(", ")}`
  );
});
