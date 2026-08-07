// A5 · THE SPINE — Neuron Main, Brokerage lane.
//
// One job, four departments, four simultaneous browser sessions. Each persona
// does ONLY their own step, through the real UI, and every handoff is asserted
// against the database rather than the screen.
//
// Brokerage because A3 says so: Brokerage 46% / Trucking 46% / Forwarding 8%.
// The Neuron OS campaign spent 19 rounds testing the 8% path. Not again.
//
// This pass focuses on the HANDOFFS, not the steps. Four questions at each one:
//   1. does the next person need a privilege they shouldn't?
//   2. does the data carry across?
//   3. does the state actually change in the DB?
//   4. does anyone downstream get told?
//
// Where the chain stops IS the finding — Main is pre-launch and a screen that
// is not built is a fact worth recording, not a failed test.
import { test, expect, type Page } from "@playwright/test";
import { db, dbRows, signIn, whoAmI, record, printChain } from "./_helpers";

const RUN = `QA-A5-${Date.now()}`;
const INQUIRY_NAME = `${RUN} BROKERAGE SPINE`;
const CUSTOMER = "BANBROS COMMERCIAL INCORPORATED"; // has 5 contacts

const BD = "jr.businessdev02@falconslogistics-ph.com";
const PRICING = "jr.pricing01@falconslogistics-ph.com";
const OPS = "jr.manager02@falconslogistics-ph.com";

/** The form's pickers are all: button opens → search box → list of buttons. */
async function pick(page: Page, opener: string | RegExp, search: string, choose: string) {
  await page.getByRole("button", { name: opener }).click();
  const box = page.getByRole("textbox", { name: /Search/i }).first();
  await box.waitFor({ state: "visible", timeout: 10_000 });
  await box.fill(search);
  await page.getByRole("button", { name: choose, exact: false }).first().click();
}

test.describe.serial("A5 · Brokerage spine", () => {
  test.afterAll(() => {
    printChain();
    console.log(`  probe rows tagged "${RUN}"\n`);
  });

  test("baseline · what the chain looks like before we touch it", async () => {
    const rows = dbRows(`
      select 'inquiries_projects  ' || count(*) from inquiries_projects
      union all select 'quotation_projects  ' || count(*) from quotation_projects
      union all select 'bookings(Brokerage) ' || count(*) from bookings where booking_type='Brokerage'
      union all select 'invoices            ' || count(*) from invoices
      union all select 'collections         ' || count(*) from collections
    `);
    console.log("\n  --- census before ---");
    for (const r of rows) console.log("    " + r);
    const complete = db(`
      select count(*) from bookings b where b.booking_type='Brokerage'
        and exists (select 1 from billing_line_items l where l.booking_id=b.booking_id)
        and exists (select 1 from evouchers e where e.booking_id=b.booking_id)`);
    record("0 · baseline", "(none)", "INFO", `Brokerage bookings with a full money trail: ${complete} of 80`);
  });

  test("stage 1 · BD raises a Brokerage inquiry and submits it to Pricing", async ({ browser }) => {
    const page = await signIn(browser, BD);
    const who = await whoAmI(page);
    expect(who).toContain("Business Development");

    await page.goto("/bd/inquiries/create");
    await expect(page.getByRole("heading", { name: "Create New Inquiry" })).toBeVisible();

    await page.getByRole("button", { name: "Import", exact: true }).click();
    await pick(page, "Select a customer...", CUSTOMER, CUSTOMER);
    await pick(page, /Select a contact|Select contact/i, "", /.+/);

    await page.getByRole("textbox", { name: /e\.g\. Morrison Express/i }).fill(INQUIRY_NAME);
    await page.getByRole("button", { name: "Brokerage", exact: true }).click();

    // Date is a custom control; open it and take today.
    await page.getByRole("button", { name: "Date", exact: true }).click();
    await page.getByRole("button", { name: String(new Date().getDate()), exact: true }).first().click()
      .catch(() => {});

    const submit = page.getByRole("button", { name: /Submit Inquiry to Pricing/i });
    const enabled = await submit.isEnabled();
    if (!enabled) {
      const why = await page.locator("body").innerText();
      const hint = (why.match(/Complete all required fields to submit:[\s\S]{0,220}/) || [""])[0];
      record("1 · BD submits inquiry", who, "STOP", `Submit stayed disabled. Form says:\n              ${hint.replace(/\n+/g, " ")}`);
      test.skip(true, "chain stops at stage 1 — recorded");
      return;
    }

    await submit.click();
    await page.waitForTimeout(2500);

    const row = db(`select inquiry_ref_id || ' | ' || coalesce(status,'?')
                      from inquiries_projects where inquiry_name = '${INQUIRY_NAME}'`);
    if (!row) {
      record("1 · BD submits inquiry", who, "STOP", "UI accepted the submit but no inquiries_projects row appeared");
      test.skip(true, "no row created — recorded");
      return;
    }
    record("1 · BD submits inquiry", who, "OK", `inquiries_projects: ${row}`);
    expect(row).toBeTruthy();
  });

  test("stage 2 · Pricing sees it in their queue", async ({ browser }) => {
    const id = db(`select inquiry_id from inquiries_projects where inquiry_name = '${INQUIRY_NAME}'`);
    test.skip(!id, "stage 1 did not produce an inquiry");

    const page = await signIn(browser, PRICING);
    const who = await whoAmI(page);
    expect(who).toContain("Pricing");

    // HANDOFF ASSERTION: can Pricing SEE the work without extra privilege?
    await page.goto("/pricing/quotations");
    await page.waitForTimeout(2000);
    const visible = await page.getByText(INQUIRY_NAME, { exact: false }).count();
    record(
      "2 · handoff BD → Pricing",
      who,
      visible > 0 ? "OK" : "STOP",
      visible > 0
        ? "the inquiry is in Pricing's queue"
        : "Pricing cannot see the inquiry BD just submitted to them",
    );
    expect(visible, "handoff broken: Pricing cannot see the submitted inquiry").toBeGreaterThan(0);
  });
});
