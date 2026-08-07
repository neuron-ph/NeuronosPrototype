import { test, expect, Page } from "@playwright/test";

// Wave 1 (P1/P2/P4/P5/P6) driven in a real browser.
//
// Every one of those fixes was verified by SQL recount and unit test, which
// proves the arithmetic and proves nothing about whether the page renders. The
// bugs themselves were all silent — a 400 swallowed into an empty array, a
// filter matching nothing — so "the query is right now" is exactly the claim a
// browser has to confirm.

const PASSWORD = "devpassword123";
const BROAD = "test@neuron.com.ph";        // org-wide dial
const SCOPED = "bd@neuron.com.ph";         // own dial — one of the 42 in P4

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0, { timeout: 25_000 });
}

/** Any non-zero peso figure. The app renders both "PHP 1.64M" and "₱7,500.00". */
async function hasNonZeroMoney(page: Page): Promise<boolean> {
  const text = await page.locator("body").innerText();
  return /(₱\s?|PHP\s)[1-9][\d,.]*/.test(text);
}

test("Financials renders real numbers for a broad-scope user, with no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("response", (r) => {
    // 42703 = undefined column, the signature of P1/P4. Any 4xx from PostgREST
    // is worth failing on here.
    // Scoped to the four tables Wave 1 touches. A 409 on activity_log during
    // login is a pre-existing conflict on the audit write and has nothing to do
    // with these fixes; asserting on every table would fail on that instead.
    const u = r.url();
    const isFinancialTable = /\/rest\/v1\/(billing_line_items|invoices|collections|evouchers)\b/.test(u);
    if (isFinancialTable && r.status() >= 400) failedRequests.push(`${r.status()} ${u.split("?")[0]}`);
  });

  await login(page, BROAD);
  await page.goto("/accounting/financials");

  await expect(page.getByRole("heading", { name: /Financials/i }).first()).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(4000); // let every tab's query settle

  expect(failedRequests, `PostgREST rejected a query: ${failedRequests[0] ?? ""}`).toHaveLength(0);
  expect(await hasNonZeroMoney(page), "every figure on Financials is zero").toBe(true);

  // `activity_log` 409s on login and re-logs without the actor link — a
  // pre-existing audit-write conflict (finding C7's family), not Wave 1. It
  // announces itself on the console of every session and would mask anything
  // this test is actually watching for.
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|DevTools|Download the React|ActivityLog|status of 409/i.test(e),
  );
  expect(realErrors, `console errors: ${realErrors[0] ?? ""}`).toHaveLength(0);
});

test("Financials loads without a rejected query for an own-scope user (P4)", async ({ page }) => {
  // This user is one of the 42. Before P4 the module issued a query naming
  // `assigned_to`, which does not exist, and rendered ₱0.00 everywhere with no
  // error. The assertion is about the REQUEST, not the figures: with no
  // backfill she legitimately still sees no billing lines.
  const failedRequests: string[] = [];
  page.on("response", (r) => {
    // Scoped to the four tables Wave 1 touches. A 409 on activity_log during
    // login is a pre-existing conflict on the audit write and has nothing to do
    // with these fixes; asserting on every table would fail on that instead.
    const u = r.url();
    const isFinancialTable = /\/rest\/v1\/(billing_line_items|invoices|collections|evouchers)\b/.test(u);
    if (isFinancialTable && r.status() >= 400) failedRequests.push(`${r.status()} ${u.split("?")[0]}`);
  });

  await login(page, SCOPED);
  await page.goto("/accounting/financials");
  await page.waitForTimeout(4000);

  expect(failedRequests, `PostgREST rejected a query: ${failedRequests[0] ?? ""}`).toHaveLength(0);
});

test("Unbilled Revenue report shows its subject rather than an empty state (P1)", async ({ page }) => {
  await login(page, BROAD);
  await page.goto("/accounting/financials");
  await expect(page.getByRole("heading", { name: /Financials/i }).first()).toBeVisible({ timeout: 25_000 });

  const reportsTab = page.getByRole("button", { name: /^Reports$/i }).first();
  if (await reportsTab.count()) {
    // A sticky header overlays the tab strip; click through it rather than
    // waiting for stability that never comes.
    await reportsTab.click({ force: true });
    await page.waitForTimeout(2500);
    // The old bug rendered this exact sentence over ₱3.75M of unbilled work.
    const emptyMessage = page.getByText("No unbilled bookings this period.");
    await expect(emptyMessage).toHaveCount(0);
  } else {
    test.skip(true, "Reports tab not reachable for this persona");
  }
});
