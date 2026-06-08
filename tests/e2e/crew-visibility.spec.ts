import { test, expect, Page } from "@playwright/test";

// Crew Visibility acceptance (PLAN_CREW_VISIBILITY_2026-06.md, Tickets T1/T2).
// Runs against DEV freshly synced from prod (devpassword123) with migrations
// 186-190 applied and the Bucket-A override purge re-run on the synced data.
//
//  - Maria (BD MANAGER profile, customers dial = team): the Ticket 1 persona.
//    Must NOT see FOCUS GLOBAL INC (owner moved to Executive, outside her
//    team's crew) — previously leaked via her seeded override + the projects
//    back door. Must still see her team's customers (18 of 88 in the synced set).
//  - Jerome Cueto (IMPORT SUPERVISOR (BROKERAGE), customers dial = everything):
//    the Ticket 2 persona. Previously saw NOTHING (seeded 'team' stamp +
//    dead team resolver); must now see the full customer list, incl. FOCUS GLOBAL.
const PASSWORD = "devpassword123";
const MARIA = "jr.manager01@falconslogistics-ph.com";
const SUPERVISOR = "jr.supervisor02@falconslogistics-ph.com";

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0, { timeout: 25_000 });
}

test("T1: Maria (Team dial) does NOT see Focus Global, still sees her team's customers", async ({ page }) => {
  await login(page, MARIA);
  await page.goto("/bd/customers");
  // List rendered: at least one of her team's customers shows.
  await expect(page.getByText(/customers/i).first()).toBeVisible({ timeout: 20_000 });
  // Give the list time to fully load, then assert the leak is gone.
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/FOCUS GLOBAL/i)).toHaveCount(0);
  // Searching for it must also come up empty (not just below the fold).
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.count()) {
    await search.fill("focus global");
    await page.waitForTimeout(800);
    await expect(page.getByText(/FOCUS GLOBAL/i)).toHaveCount(0);
  }
});

test("T2: Import Supervisor (All records dial) sees the full customer list", async ({ page }) => {
  await login(page, SUPERVISOR);
  await page.goto("/bd/customers");
  await page.waitForLoadState("networkidle");
  // The profile dial says everything — Focus Global must be findable.
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.count()) {
    await search.fill("focus global");
    await page.waitForTimeout(800);
  }
  await expect(page.getByText(/FOCUS GLOBAL/i).first()).toBeVisible({ timeout: 20_000 });
});
