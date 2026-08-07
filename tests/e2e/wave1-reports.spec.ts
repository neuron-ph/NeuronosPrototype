import { test, expect, Page } from "@playwright/test";

// The two surfaces P6 touched that the Financials spec does not cover:
// useReportsData (Sales Report) and useBookingCashFlowReport (Booking Cash
// Flow). Both had the e-voucher cost filter that matched zero rows, and both
// were changed blind — verified by recount, never opened in a browser.
//
// The assertion that matters is the REQUEST, not the figures: these reports are
// date-scoped and a given period may legitimately be empty. What must never
// happen again is a rejected query rendering as a clean empty state.

const PASSWORD = "devpassword123";
const BROAD = "test@neuron.com.ph";

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0, { timeout: 25_000 });
}

const REPORTS = ["Sales Report", "Booking Cash Flow", "Receivables Aging", "Collections", "Unbilled Revenue"];

test("every accounting report loads without a rejected query", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (/\/rest\/v1\/(billing_line_items|invoices|collections|evouchers|bookings)\b/.test(u) && r.status() >= 400) {
      failed.push(`${r.status()} ${u.split("?")[0]}`);
    }
  });

  await login(page, BROAD);
  await page.goto("/accounting/reports");
  await page.waitForTimeout(3000);

  for (const label of REPORTS) {
    const tab = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
    if (!(await tab.count())) {
      console.log(`[wave1] "${label}" not reachable for this persona — skipped`);
      continue;
    }
    await tab.click({ force: true });
    await page.waitForTimeout(2500);
    console.log(`[wave1] ${label}: loaded, ${failed.length} rejected queries so far`);
  }

  expect(failed, `a report query was rejected: ${failed[0] ?? ""}`).toHaveLength(0);
});
