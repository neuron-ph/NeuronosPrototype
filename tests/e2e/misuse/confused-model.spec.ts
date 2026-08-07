import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — THE CONFUSED USER.
//
// Every other pass in this effort tested somebody who understood the system:
// doing their job correctly, or attacking it deliberately. This one tests the
// person who does NOT understand it, is in a hurry, and is clicking through a
// form on a Tuesday afternoon. Not typos — the right form used for the wrong
// thing.
//
// THE CENTRAL INVERSION: here, "it worked" is usually the finding. A form that
// accepts nonsense without complaining is the bug. So the check is never the
// screen — it is the row afterwards, read with SERVICE-ROLE eyes (K1), compared
// against what was typed. Both are reported.
//
// The four things a confused person did, and what the database kept:
//
//   1. Could not find "GARDEN BARN INC" (they typed the legal name, with the
//      full stop), so they created it again. Two customers, same name, no
//      warning at any point.
//   2. Raised an expense against a booking that was CANCELLED months ago. The
//      picker offered it; the voucher went into the approval chain.
//   3. Raised an expense from a BOOKING's Expenses tab. The writer stamped the
//      booking number into `evouchers.project_number` — the live-data condition
//      finding L3 measured at 249 of 249 rows, reproduced from the UI in one
//      click. Root cause is one prop: ExpensesTab.tsx:129 projectNumber={bookingNumber}.
//   4. Tried to revive a quotation the client had rejected. THIS ONE HELD —
//      recorded as evidence, because a pass is a finding too.
//
// SAFETY. Everything created carries E2E-MISUSE in a name/description field and
// is deleted in afterAll, pass or fail. Nothing pre-existing is written to; the
// only rows touched are the ones this file creates. Dev only.
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-MISUSE";
const PASSWORD = "devpassword123";
const SHOTS = "test-results/misuse";

const BD = "jr.businessdev02@falconslogistics-ph.com"; // Johnna P. C. Aceveda
const TREASURY = "treasury@falconslogistics-ph.com"; // Janice D. De Villa
const OPS = "jr.supervisor07@falconslogistics-ph.com"; // Princess Marre R. Reyes
const PRICING_MGR = "jr.manager03@falconslogistics-ph.com"; // Jayson P. Nabos

// The customer the confused user cannot find. Real row in dev, one only.
const REAL_CUSTOMER = "GARDEN BARN INC";
// What a person actually types when they read it off a letterhead.
const AS_TYPED = "Garden Barn Inc.";

// A booking that was CANCELLED. Real row, chosen rather than "whatever is
// first" so a failure means the flow broke and not that a picker moved.
const CANCELLED_BOOKING = "BRK-2026-0041";

// A live Forwarding booking with an Expenses tab Princess can open
// (bookings_forwarding = everything). Used only as a surface to raise a voucher
// FROM — the booking row itself is never written.
const HOST_BOOKING = "FWD202608-062";

const VENDOR = "UTOC CORPORATION";
const EXPENSE_CATEGORY = "(EXP) FORWARDING";
const CATALOG_ITEM = "FC (OCEAN FREIGHT)";

// ── service-role eyes ───────────────────────────────────────────────────────
function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const ENV = env();
const admin = createClient(ENV.VITE_SUPABASE_URL, ENV.DEV_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── the verdict vocabulary ──────────────────────────────────────────────────
// Graded by what it COSTS, not by whether an error appeared. "STOPPED" is the
// only good outcome; "WROTE_IT_DOWN" is the finding this pass exists to collect.
type Verdict =
  | "STOPPED" // refused — the system would not let them
  | "WARNED" // let them, but said something first
  | "WROTE_IT_DOWN" // accepted silently; the row now holds nonsense
  | "BLOCKED_WRONGLY" // refused something legitimate
  | "UNMEASURED"; // could not be driven this run

const results: { step: string; typed: string; landed: string; verdict: Verdict }[] = [];
function record(step: string, typed: string, landed: string, verdict: Verdict) {
  results.push({ step, typed, landed, verdict });
  console.log(`\n[MISUSE] ${step}\n         typed  : ${typed}\n         landed : ${landed}\n         verdict: ${verdict}`);
}

// K3 — a failed sign-in reads as "blocked everywhere" and fabricates findings.
// Prove the session twice: token persisted AND the login form gone.
async function signIn(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForFunction(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("sb-")),
    undefined,
    { timeout: 30_000 }
  );
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
    `sign in did not complete for ${email} — every result after this would be a lie (K3)`
  ).toHaveCount(0, { timeout: 20_000 });
  return page;
}

const cell = (page: Page, name: string | RegExp) => page.getByRole("cell", { name }).first();

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

/** Fill the Reimbursement panel's one catalog line and submit it. Shared by the
 *  two voucher scenarios so the only difference between them is the booking. */
async function raiseVoucherLine(page: Page, bookingNumber: string, amount: string) {
  // The vendor field's accessible name follows the transaction TYPE, and the
  // type follows the surface: the personal panel defaults to Reimbursement
  // ("Paid To (Vendor)"), the one opened from a booking's Expenses tab defaults
  // to Project Expense ("Vendor / Payee"). Same control, two names.
  await page.getByRole("button", { name: /Paid To \(Vendor\)|Vendor \/ Payee/ }).first().click();
  await page.getByPlaceholder("Search registered vendors...").fill("UTOC");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: VENDOR, exact: true }).click({ timeout: 15_000 });
  await page.waitForTimeout(500);

  // Adding a category seeds one empty line, so there is no "Add Item" for the
  // first one. Catalog architecture forbids free text on either side.
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByPlaceholder("Search or type category name...").fill("FORWARDING");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: EXPENSE_CATEGORY, exact: true }).click({ timeout: 15_000 });
  await page.waitForTimeout(900);

  const itemInput = page.getByPlaceholder("Select or type item...").first();
  await itemInput.click();
  await itemInput.fill("OCEAN");
  await page.waitForTimeout(1_400);
  // Exact — the combobox also offers `Add "OCEAN"`, which would CREATE a catalog
  // item rather than use one.
  await page.getByRole("button", { name: CATALOG_ITEM, exact: true }).click({ timeout: 15_000 });
  await page.waitForTimeout(500);

  await page.getByPlaceholder("0.00").first().fill(amount);

  // D2: the line must name a booking. Opened from a booking the panel already
  // holds one, so the picker may be pre-filled — absence here is not a failure.
  const picker = page.getByRole("button", { name: "Line item booking" });
  if ((await picker.count()) === 0) return "prefilled";
  await picker.first().click();
  await page.getByPlaceholder("Search bookings…").fill(bookingNumber);
  await page.waitForTimeout(1_800);
  const offered = page.getByRole("button", { name: new RegExp(bookingNumber) }).first();
  const isOffered = await offered.isVisible().catch(() => false);
  if (isOffered) {
    // The option list renders under the drawer's own search box and the row
    // behind it; a real click is intercepted (E7's shape). React listens at the
    // root, so dispatching on the element fires the handler exactly as it would
    // for a user whose viewport was not 920px wide.
    await offered.dispatchEvent("click");
    await page.waitForTimeout(900);
  }
  return isOffered ? "offered" : "absent";
}

// ── fixtures created by this file, deleted in afterAll ──────────────────────
const debris: { customerIds: string[]; evoucherIds: string[] } = {
  customerIds: [],
  evoucherIds: [],
};

test.afterAll(async () => {
  for (const id of debris.evoucherIds) {
    await admin.from("evoucher_line_items").delete().eq("evoucher_id", id);
    await admin.from("billing_line_items").delete().eq("evoucher_id", id);
    await admin.from("evouchers").delete().eq("id", id);
  }
  for (const id of debris.customerIds) {
    await admin.from("contacts").delete().eq("customer_id", id);
    await admin.from("customers").delete().eq("id", id);
  }
  console.log("\n────────── TIER 2 — CONFUSED: what the database kept ──────────");
  for (const r of results) {
    console.log(`${r.verdict.padEnd(15)} ${r.step}`);
    console.log(`${"".padEnd(15)}   typed  ${r.typed}`);
    console.log(`${"".padEnd(15)}   landed ${r.landed}`);
  }
  console.log(`\ncleanup: ${debris.evoucherIds.length} voucher(s), ${debris.customerIds.length} customer(s) deleted`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE DUPLICATE CUSTOMER.
//
// The corruption path does not start with a bad decision. It starts with a
// SEARCH THAT IS TOO STRICT: the person types the company's name the way it is
// printed on the letterhead, gets nothing, and reasonably concludes the customer
// is not in the system yet. Everything after that is them doing their job.
// ─────────────────────────────────────────────────────────────────────────────
test("confused: the customer search cannot find its own customer, so they create a second one", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const bd = await signIn(ctx, BD);

  // Service-role first: exactly one such customer exists before we start (K2 —
  // never assert a state the row already holds).
  const { data: before } = await admin.from("customers").select("id, name").eq("name", REAL_CUSTOMER);
  expect(before?.length, `${REAL_CUSTOMER} is not a single row on dev — fixture assumption broken`).toBe(1);

  await bd.goto("/bd/customers", { waitUntil: "domcontentloaded" });
  await expect(bd.getByRole("heading", { name: "Customers", exact: true })).toBeVisible({
    timeout: 25_000,
  });
  const search = bd.getByPlaceholder("Search customers...");
  await search.fill("");
  await bd.waitForTimeout(2_000);

  // What the search does with four things a real person types for one company.
  // The list is slow to settle (E5), and a zero read a beat too early is
  // indistinguishable from a zero result — which is the whole measurement here.
  // So each spelling is read twice and only a stable zero counts as a miss.
  const probes: Record<string, number> = {};
  for (const q of [REAL_CUSTOMER, "Garden Barn", AS_TYPED, "gardenbarn"]) {
    await search.fill(q);
    await bd.waitForTimeout(3_000);
    let hits = await bd.getByText(REAL_CUSTOMER, { exact: false }).count();
    if (hits === 0) {
      await bd.waitForTimeout(3_000);
      hits = await bd.getByText(REAL_CUSTOMER, { exact: false }).count();
    }
    probes[q] = hits;
  }

  // THE ENTRY POINT. The legal name with its full stop finds nothing: the match
  // is a plain substring, so one character the operator adds hides the row.
  record(
    "customer search — four spellings of one company",
    Object.entries(probes).map(([k, v]) => `"${k}"→${v}`).join(", "),
    `"${AS_TYPED}" returns ${probes[AS_TYPED]} results while the row exists`,
    probes[AS_TYPED] === 0 ? "WROTE_IT_DOWN" : "STOPPED"
  );
  expect(
    probes[REAL_CUSTOMER],
    "the exact name does not find the customer either — the fixture, not the finding, is wrong"
  ).toBeGreaterThan(0);

  // So they create it. Same name, character for character.
  await search.fill("");
  await bd.waitForTimeout(1_200);
  await bd.getByRole("button", { name: "Add Customer" }).click();
  await bd.waitForTimeout(2_500);

  await bd.locator("#company_name").fill(REAL_CUSTOMER);
  await bd.locator("#registered_address").fill(`${TAG} address`);
  await bd.locator("#notes").fill(`${TAG} tier-2 confused-user duplicate customer probe`);

  // Industry and Account Owner are the other two fields isFormValid demands.
  // Both are CustomDropdowns (portalled to body), so the option is addressed by
  // its visible text once the panel is open.
  // CustomSelect renders its trigger as <button id={id}>, so the field id is the
  // handle; the option is a plain button inside the panel that opens under it.
  await bd.locator("#industry").click({ timeout: 20_000 });
  await bd.waitForTimeout(1_200);
  await bd.getByRole("button", { name: "OTHERS", exact: true }).first().click({ timeout: 15_000 });
  await bd.waitForTimeout(900);
  await bd.locator("#owner_id").click({ timeout: 20_000 });
  await bd.waitForTimeout(1_200);
  // Scope the option to the dropdown that #owner_id opens. Unscoped, /Johnna/
  // also matches the signed-in user's own button in the NAV, and clicking that
  // dismisses the whole panel — a harness lie of exactly the C6 shape.
  await bd
    .locator("#owner_id")
    .locator("xpath=..")
    .getByRole("button", { name: /Johnna/ })
    .first()
    .click({ timeout: 15_000 });
  await bd.waitForTimeout(1_500);

  // Did anything at all appear between typing an existing customer's exact name
  // and the button going live? A duplicate warning, a suggestion, anything.
  const warnTexts = (
    await bd.getByText(/already exists|duplicate|similar|did you mean/i).allInnerTexts()
  ).map((t) => t.replace(/\s+/g, " ").trim());
  const warned = warnTexts.length;
  await shot(bd, "duplicate-customer-form");

  const create = bd.getByRole("button", { name: "Create Customer" });
  await expect(create, "Create Customer never enabled — the form was not filled").toBeEnabled({
    timeout: 15_000,
  });
  await create.click();
  await bd.waitForTimeout(6_000);

  // K1 — the toast is not the proof. The rows are.
  const { data: after } = await admin
    .from("customers")
    .select("id, name, created_at")
    .eq("name", REAL_CUSTOMER)
    .order("created_at", { ascending: false });
  const made = (after ?? []).filter((c) => !before!.some((b) => b.id === c.id));
  debris.customerIds.push(...made.map((c) => c.id));

  record(
    "Add Customer with a name that already exists",
    `company_name = "${REAL_CUSTOMER}" (identical to CUST-1780468254106)`,
    `${after?.length} customers now carry that exact name; text matching a duplicate warning on screen: ` +
      (warned ? warnTexts.join(" / ") : "none"),
    made.length > 0 ? "WROTE_IT_DOWN" : "STOPPED"
  );

  // The finding is that it SAVED, whatever was on screen. A warning that does
  // not stop the save leaves the same two rows behind.
  expect(
    made.length,
    "the duplicate did not save — this scenario needs re-reading, not re-running"
  ).toBe(1);

  // And it is immediately spendable: the new row is a first-class customer that
  // money can be raised against, indistinguishable in every picker from the real
  // one. That is what makes this silent corruption rather than clutter.
  const { data: dupe } = await admin
    .from("customers")
    .select("id, name, status")
    .eq("id", made[0].id)
    .single();
  record(
    "the duplicate is a live customer, not a draft",
    "—",
    `id=${dupe?.id} name="${dupe?.name}" status=${dupe?.status}`,
    "WROTE_IT_DOWN"
  );

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE EXPENSE AGAINST A CANCELLED BOOKING.
//
// AddRequestForPaymentPanel.tsx:310 selects bookings with no status filter at
// all — `.select(...).order(created_at).limit(500)`. Cancelled, Completed and
// Billed bookings are all in the picker, and nothing downstream re-checks.
// ─────────────────────────────────────────────────────────────────────────────
test("confused: an e-voucher is raised against a booking that was cancelled", async ({ browser }) => {
  test.setTimeout(400_000);
  const ctx = await browser.newContext();
  const janice = await signIn(ctx, TREASURY);

  const { data: bk } = await admin
    .from("bookings")
    .select("id, booking_number, status")
    .eq("booking_number", CANCELLED_BOOKING)
    .single();
  expect(bk?.status, `${CANCELLED_BOOKING} is not Cancelled any more — pick another fixture`).toBe(
    "Cancelled"
  );

  await janice.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  await expect(janice.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 25_000 });
  await janice.getByRole("button", { name: "New Request" }).click();
  await janice.waitForTimeout(3_000);

  const offered = await raiseVoucherLine(janice, CANCELLED_BOOKING, "1234");
  await shot(janice, "cancelled-booking-picked");

  record(
    "line-item booking picker offers a CANCELLED booking",
    `search "${CANCELLED_BOOKING}" (status=${bk?.status})`,
    offered === "offered"
      ? "offered and selectable, with no status shown and no warning"
      : `picker result: ${offered}`,
    offered === "offered" ? "WROTE_IT_DOWN" : "STOPPED"
  );
  expect(offered, "the cancelled booking was not offered — good news, invert this assertion").toBe(
    "offered"
  );

  const submit = janice.getByRole("button", { name: "Submit Request" });
  await expect(
    submit,
    "Submit Request is still disabled — vendor, catalog line or amount did not take"
  ).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await janice.waitForTimeout(8_000);

  // K1 — read the row, not the screen.
  const { data: lines } = await admin
    .from("evoucher_line_items")
    .select("id, evoucher_id, amount, booking_id")
    .eq("booking_id", bk!.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const mine = (lines ?? []).find((l) => Number(l.amount) === 1234);
  expect(mine, "no line item landed against the cancelled booking — the submit was rejected").toBeTruthy();
  debris.evoucherIds.push(mine!.evoucher_id);

  const { data: ev } = await admin
    .from("evouchers")
    .select("id, evoucher_number, status, amount, booking_id, project_number")
    .eq("id", mine!.evoucher_id)
    .single();

  record(
    "submit an expense charged to a cancelled booking",
    `₱1,234 booked to ${CANCELLED_BOOKING} (Cancelled)`,
    `${ev?.evoucher_number} status=${ev?.status} — in the approval chain, charged to a dead booking`,
    "WROTE_IT_DOWN"
  );
  expect(ev?.status, "the voucher did not enter the approval chain").not.toBe("draft");

  // While this voucher exists, measure the other half of L1 on the surface that
  // actually produces it: raised from /my-evouchers the panel has no locked
  // booking, so the HEADER link is left empty even though the line names one.
  // Anything reading evouchers.booking_id — including the billable-expense
  // trigger that mints the receivable — sees an untenanted voucher.
  record(
    "the header booking link on a personally-raised voucher (L1)",
    `line item names ${CANCELLED_BOOKING}`,
    `evouchers.booking_id = ${ev?.booking_id === null ? "NULL" : ev?.booking_id}, project_number = ${
      ev?.project_number === null ? "NULL" : `"${ev?.project_number}"`
    }`,
    ev?.booking_id === null ? "WROTE_IT_DOWN" : "STOPPED"
  );

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE BOOKING NUMBER IN THE PROJECT FIELD (finding L3, reproduced).
//
// L3 measured the condition — `evouchers.project_number` holds a BOOKING number
// on 249 of 249 rows — but not how a user gets there. They do not: the form
// does. Operations opens a booking, clicks Expenses → Add Expense, and
// ExpensesTab.tsx:129 hands the panel `projectNumber={bookingNumber}`. Nobody
// typed anything wrong; the field is simply mislabelled at the call site.
// ─────────────────────────────────────────────────────────────────────────────
test("confused: raising the expense from a booking stamps the booking number into project_number", async ({
  browser,
}) => {
  test.setTimeout(400_000);
  const ctx = await browser.newContext();
  const ops = await signIn(ctx, OPS);

  const { data: bk } = await admin
    .from("bookings")
    .select("id, booking_number, project_id, status")
    .eq("booking_number", HOST_BOOKING)
    .single();
  expect(bk?.id, `${HOST_BOOKING} is gone — pick another live Forwarding booking`).toBeTruthy();

  await ops.goto("/operations/forwarding", { waitUntil: "domcontentloaded" });
  await ops.waitForTimeout(4_000);
  await ops.getByPlaceholder(/Search by Booking Number/).fill(HOST_BOOKING);
  await ops.waitForTimeout(3_500);
  await ops.getByText(HOST_BOOKING).first().click();
  await ops.waitForTimeout(5_000);

  await ops.locator("main").getByRole("button", { name: "Expenses", exact: true }).first().click();
  await ops.waitForTimeout(4_000);
  await ops.getByRole("button", { name: "Add Expense" }).click();
  await ops.waitForTimeout(3_500);
  await shot(ops, "booking-expenses-panel");

  await raiseVoucherLine(ops, HOST_BOOKING, "777");

  const submit = ops.getByRole("button", { name: "Submit Request" });
  await expect(submit, "Submit Request is still disabled on the booking expense panel").toBeEnabled({
    timeout: 15_000,
  });
  await submit.dispatchEvent("click");
  await ops.waitForTimeout(9_000);

  const { data: lines } = await admin
    .from("evoucher_line_items")
    .select("id, evoucher_id, amount, booking_id")
    .eq("booking_id", bk!.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const mine = (lines ?? []).find((l) => Number(l.amount) === 777);
  expect(mine, "no line item landed — the booking expense submit was rejected").toBeTruthy();
  debris.evoucherIds.push(mine!.evoucher_id);

  const { data: ev } = await admin
    .from("evouchers")
    .select("id, evoucher_number, project_number, booking_id, status")
    .eq("id", mine!.evoucher_id)
    .single();

  // The project the booking actually belongs to — what the column NAME promises.
  let realProject: string | null = null;
  if (bk?.project_id) {
    const { data: p } = await admin
      .from("projects")
      .select("project_number")
      .eq("id", bk.project_id)
      .single();
    realProject = p?.project_number ?? null;
  }

  record(
    "expense raised from a booking's Expenses tab",
    `nothing — the operator typed no project reference at all`,
    `evouchers.project_number = "${ev?.project_number}" (the BOOKING number); the booking's real project is ${realProject ?? "none"}`,
    ev?.project_number === HOST_BOOKING ? "WROTE_IT_DOWN" : "STOPPED"
  );
  expect(
    ev?.project_number,
    "project_number no longer takes the booking number — L3's root cause may be fixed"
  ).toBe(HOST_BOOKING);

  // The header booking link is the other half of the same regression (L1): the
  // booking lives on the LINE, and the header column the reports read is empty.
  // The other half of the same call site, and the good half: opened FROM a
  // booking the panel also carries bookingId, so the header link L1 found empty
  // on every voucher written since 2026-07-28 IS populated here. Recorded so the
  // two paths are not confused with one another — L1 is about the OTHER surface.
  record(
    "the same voucher's header booking link",
    "—",
    `evouchers.booking_id = ${ev?.booking_id === null ? "NULL (L1)" : "populated, matches the line"}`,
    ev?.booking_id === null ? "WROTE_IT_DOWN" : "STOPPED"
  );

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE ONE THAT HELD — a rejected quotation stays rejected.
//
// A pass is evidence too, and this is the shape the other three are missing: the
// terminal states of the quotation lifecycle offer NO actions at all, so the
// confused user has nothing to click. Not a validation message — an absence of
// affordance, which is the only kind of guard a hurried person cannot argue with.
// ─────────────────────────────────────────────────────────────────────────────
test("confused: trying to revive a quotation the client rejected", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  // The Pricing MANAGER, not BD: quotations = "everything", so a rejected quote
  // he did not raise is genuinely reachable. Using someone who cannot see the
  // row at all would read as "blocked" and fabricate a pass (K3's shape).
  const bd = await signIn(ctx, PRICING_MGR);

  const { data: q } = await admin
    .from("quotations")
    .select("id, quote_number, status, project_id")
    .eq("status", "Rejected by Client")
    .not("quote_number", "is", null)
    .limit(1)
    .single();
  expect(q?.quote_number, "no Rejected by Client quotation on dev to try this against").toBeTruthy();

  // Terminal statuses live under Completed — the lifecycle moves records between
  // tabs (E4), so the tab is part of the address.
  await bd.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  const completed = bd.getByRole("tab", { name: /Completed/ });
  await expect(completed).toBeVisible({ timeout: 30_000 });
  await completed.click();
  await bd.waitForTimeout(1_500);
  await bd.getByPlaceholder(/Search/i).first().fill(q!.quote_number!);
  await bd.waitForTimeout(3_500);
  await bd.getByText(q!.quote_number!).first().click();
  await bd.waitForTimeout(4_000);

  // The status chip is the only door back into the lifecycle. At a terminal
  // status StatusChangeButton returns zero actions, so the chip is disabled and
  // there is nothing to open.
  const chip = bd.getByRole("button", { name: /^Status: /i }).first();
  const chipExists = await chip.count();
  const chipDisabled = chipExists ? await chip.isDisabled().catch(() => true) : true;

  // Do not stop at "the chip is clickable" — open it and read what it actually
  // offers. A disabled chip and a chip whose only entry is Disapprove/Cancel are
  // the same guard; a chip offering a way back to Accepted is not.
  let menu: string[] = [];
  if (chipExists && !chipDisabled) {
    await chip.click().catch(() => {});
    await bd.waitForTimeout(1_500);
    menu = (await bd.getByRole("menuitem").allInnerTexts().catch(() => []))
      .map((t) => t.split("\n")[0].trim())
      .filter(Boolean);
    await bd.keyboard.press("Escape").catch(() => {});
  }
  const createProject = await bd.getByRole("button", { name: "Create Project" }).count();
  await shot(bd, "rejected-quotation-terminal");

  // The only entries that would matter are the ones that walk the quote back
  // into the live lifecycle — anything that could end with a project or a
  // booking hanging off a deal the client said no to.
  // Only entries that move it FORWARD count. "Disapproved / Cancelled" is
  // terminal-to-terminal — it cannot resurrect anything, so it is not a way back.
  const wayBack = menu.filter(
    (m) =>
      /mark as approved|accepted|send to client|priced|recall|revision|draft|reopen/i.test(m) &&
      !/disapprov|cancel/i.test(m)
  );

  record(
    "reopen a quotation at Rejected by Client",
    `opened ${q!.quote_number} and looked for a way forward`,
    `status chip ${chipExists ? (chipDisabled ? "present but disabled" : "clickable") : "absent"}; ` +
      `menu offers [${menu.join(", ") || "nothing"}]; "Create Project" offered: ${createProject}`,
    wayBack.length === 0 && createProject === 0 ? "STOPPED" : "WROTE_IT_DOWN"
  );

  expect(
    createProject,
    "Create Project is offered on a client-rejected quotation — a job could be started from a lost deal"
  ).toBe(0);
  expect(
    wayBack,
    `the status menu offers a route back into the live lifecycle from a client rejection: ${wayBack.join(", ")}`
  ).toEqual([]);

  // Service-role confirmation that nothing moved (K2: we wrote nothing, so the
  // row must read exactly as it did).
  const { data: qAfter } = await admin
    .from("quotations")
    .select("status, project_id")
    .eq("id", q!.id)
    .single();
  expect(qAfter?.status).toBe("Rejected by Client");
  expect(qAfter?.project_id).toBeNull();

  await ctx.close();
});
