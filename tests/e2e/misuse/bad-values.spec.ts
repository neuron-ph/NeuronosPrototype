import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─────────────────────────────────────────────────────────────────────────────
// THE CARELESS USER.
//
// Every other pass in this effort tested someone who understood the system —
// doing their job correctly (personas), or attacking it deliberately
// (adversary). This one tests the person who does NOT understand it, is in a
// hurry, and is clicking through a money form on a Tuesday afternoon.
//
// THE INVERSION: here, "it worked" is usually the finding. If a date field
// accepts a due date six years before its invoice, that is a bug — because
// nothing complained. If an amount field takes "0.05" and writes 5.00, that is
// data loss with a smile on it.
//
// SO THE CHECK IS NEVER THE SCREEN — IT IS THE ROW AFTERWARDS. Every probe below
// types a value in the real UI, saves, and then reads the row back with
// SERVICE-ROLE eyes and compares what was typed against what landed (K1: a
// denied/ignored write does not error, and a toast is not proof).
//
// WHAT THIS FOUND, all confirmed against the dev database:
//
//   P1  e-voucher amount   typed 0.05  → evouchers.amount = 5.00       (100×)
//   P2  billing price      typed -500  → billing_line_items.amount = 500 (sign flipped)
//   P3  billing remarks    typed text  → billing_line_items.notes = NULL (dropped)
//   P4  invoice dates      due 2020-01-01 on an invoice dated 52026-04-13
//   P5  customer name      "  FREIGHT CARE LOGISTICS  " saved verbatim next to
//                          the existing "FREIGHT CARE LOGISTICS " — two rows,
//                          one visible name, no trim and no duplicate warning
//   P6  attachments        a .exe uploads to the world-readable `attachments`
//                          bucket with no accept filter and no size cap, and is
//                          then served to an anonymous fetch as HTTP 200
//                          application/x-msdownload (M1, with an executable in it)
//
// THE MECHANISM behind P1/P2/P3 is one line repeated across the money forms:
//
//     onChange={e => onChange(parseFloat(e.target.value) || 0)}
//
// on an <input type="number">. Chrome reports an *intermediate* invalid value
// ("0.0", "-", "1e") as the empty string, parseFloat("") is NaN, `|| 0` turns it
// into 0, and React writes that 0 back into the controlled field — destroying
// the characters the user has already typed. The digits that follow then land in
// a field that no longer says what they think it says. Nothing errors. Nobody
// looks. The number is simply wrong.
//
//   AddRequestForPaymentPanel.tsx:1437   value={item.amount || ""}
//   UniversalPricingRow.tsx:477          value={data.final_price}
//   CollectionCreatorPanel.tsx:635       value={amountReceived || ""}
//
// WHAT IS HANDLED WELL is recorded too — it is evidence, and it is most of the
// list. Commas, "PHP" prefixes, thin spaces and trailing tabs are all stripped
// correctly by the number inputs; HTML is escaped everywhere it is rendered;
// emoji, Chinese and Arabic round-trip and do not break table layout; a
// 10,000-character note is stored whole.
//
// WRITES TO DEV, ALL TAGGED 'E2E-MISUSE', ALL DELETED IN afterAll — including
// the storage object, which matters here because that bucket is public (M1).
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-MISUSE";
const PASSWORD = "devpassword123";
// NOT test-results/: Playwright prunes that directory as each test starts, so
// only the last screenshot would survive the run.
const SHOTS = "docs/qa/misuse";

const TREASURY = "treasury@falconslogistics-ph.com"; // Janice — org_wide everywhere
const BD = "jr.businessdev02@falconslogistics-ph.com"; // Johnna — bd_customers:create

// Real rows in dev, chosen rather than "whatever is first", so a failure means
// the form broke and not that a picker returned something unexpected.
const VENDOR = "UTOC CORPORATION";
const EXPENSE_CATEGORY = "(EXP) FORWARDING";
const CATALOG_ITEM = "FC (OCEAN FREIGHT)";
const BILLING_ITEM = "CRATING FEE";
const PROJECT = "PRJ-291528"; // one Forwarding booking, so a project-level row resolves (D1)
const DUP_CUSTOMER = "FREIGHT CARE LOGISTICS"; // already exists WITH a trailing space

// ── service-role eyes ────────────────────────────────────────────────────────
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

// ── the verdict vocabulary, graded by what it COSTS ──────────────────────────
type Cost =
  | "silent_corruption" // wrong value stored, no error, nobody will notice
  | "data_loss" // their work vanished
  | "duplicate_money" // two vouchers / two invoices / paid twice
  | "blocked_work" // a legitimate action they could not complete
  | "cosmetic"
  | "none"; // handled correctly — say so, it is evidence

type Probe = { where: string; typed: string; landed: string; cost: Cost };
const probes: Probe[] = [];

function record(where: string, typed: string, landed: string, cost: Cost) {
  probes.push({ where, typed, landed, cost });
  console.log(`[${cost.toUpperCase()}] ${where} :: typed ${typed} → landed ${landed}`);
}

// Debris, so afterAll can remove exactly what this run made.
const debris = {
  evoucherIds: [] as string[],
  billingIds: [] as string[],
  invoiceIds: [] as string[],
  customerIds: [] as string[],
  storagePaths: [] as string[],
};

const signInButton = (page: Page) => page.getByRole("button", { name: "Sign In", exact: true });

async function signIn(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await signInButton(page).click();
  await page.waitForFunction(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("sb-")),
    undefined,
    { timeout: 30_000 }
  );
  // K3: a failed login reads as "denied/blocked everywhere" and fabricates
  // findings. Prove the session belongs to the person we asked for.
  const who = await page.evaluate(() =>
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("sb-"))
      .map((k) => {
        try {
          return JSON.parse(sessionStorage[k]).user?.email as string;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
  expect(who, `sign-in did not produce a session for ${email}`).toContain(email);
  return page;
}

const cell = (page: Page, name: string | RegExp) => page.getByRole("cell", { name }).first();

/** Type a value the way a person does — one keystroke at a time — into a
 *  controlled number input, having first cleared what was there. The delay is
 *  not cosmetic: the destruction in P1/P2 happens in React's re-render between
 *  keystrokes, so pasting the string whole would MISS the bug entirely. */
async function typeAmount(page: Page, input: ReturnType<Page["locator"]>, value: string) {
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Delete");
  await page.keyboard.type(value, { delay: 40 });
  await page.waitForTimeout(300);
  return input.inputValue();
}

async function shot(page: Page, name: string) {
  const dir = join(process.cwd(), SHOTS);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
  console.log(`  screenshot → ${join(SHOTS, name)}.png`);
}

test.afterAll(async () => {
  for (const id of debris.invoiceIds) await admin.from("invoices").delete().eq("id", id);
  for (const id of debris.billingIds) await admin.from("billing_line_items").delete().eq("id", id);
  for (const id of debris.evoucherIds) await admin.from("evouchers").delete().eq("id", id);
  for (const id of debris.customerIds) await admin.from("customers").delete().eq("id", id);
  if (debris.storagePaths.length)
    await admin.storage.from("attachments").remove(debris.storagePaths);

  console.log("\n────────── E2E-MISUSE: typed vs landed ──────────");
  for (const p of probes) console.log(`${p.cost.padEnd(18)} ${p.where}\n${" ".repeat(19)}typed ${p.typed} → landed ${p.landed}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — the e-voucher amount panel. /my-evouchers → New Request.
// ─────────────────────────────────────────────────────────────────────────────
test("misuse: an e-voucher amount typed as 0.05 is stored as 5.00", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, TREASURY);

  await page.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "New Request" }).click();
  await expect(page.getByRole("heading", { name: "Reimbursement Request" })).toBeVisible({
    timeout: 15_000,
  });

  // Vendor is registry-only (NEU-046); the line must come from the Expense
  // Catalog. Neither is the point here — they are the price of reaching the
  // amount field, which is.
  await page.getByRole("button", { name: "Paid To (Vendor)" }).click();
  await page.getByPlaceholder("Search registered vendors...").fill("UTOC");
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: VENDOR, exact: true }).click({ timeout: 15_000 });

  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByPlaceholder("Search or type category name...").fill("FORWARDING");
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: EXPENSE_CATEGORY, exact: true }).click({ timeout: 15_000 });

  const item = page.getByPlaceholder("Select or type item...").first();
  await item.click();
  await item.fill("OCEAN");
  await page.waitForTimeout(1_200);
  await page.getByRole("button", { name: CATALOG_ITEM, exact: true }).click({ timeout: 15_000 });

  const amount = page.getByPlaceholder("0.00").first();
  const total = async () =>
    ((await page.locator("body").innerText()).match(/Total Amount\s*\n\s*([^\n]+)/) || [])[1] ?? "";

  // ── the matrix: numbers typed the way a human in Manila actually types them ──
  // MOST OF THIS IS GOOD NEWS and is recorded as such. The browser's number
  // input silently discards the separators and the currency word, so the value
  // that reaches React is already clean.
  const good: Record<string, string> = {
    "1,500.00": "1500", // the comma is dropped, not truncated — 1500, not 1
    "PHP25,000": "25000",
    "25000.00 PHP": "25000",
    "25 000": "25000", // space-separated, as on a Philippine invoice
    "00042": "42",
    "25000\t": "25000", // pasted out of Excel, trailing tab
  };
  for (const [typed, expectedNumeric] of Object.entries(good)) {
    await typeAmount(page, amount, typed);
    const shown = await total();
    const numeric = shown.replace(/[₱,\s]/g, "");
    record(
      "e-voucher · Line Items · amount",
      JSON.stringify(typed),
      `field total ${shown}`,
      Number(numeric) === Number(expectedNumeric) ? "none" : "silent_corruption"
    );
    expect(
      Number(numeric),
      `${typed} did not survive the number input as ${expectedNumeric}`
    ).toBe(Number(expectedNumeric));
  }

  // ── and now the one that does not survive ────────────────────────────────
  // Typing "0.05" one key at a time: "0" → 0 → falsy → the field is rewritten
  // to "" ; "." → parseFloat(".") is NaN → "" ; "0" → 0 → "" ; "5" lands in an
  // EMPTY field. Five pesos where five centavos were meant. Same shape wrecks
  // "0.001" into 1.00 — a thousandfold.
  const centavo = await typeAmount(page, amount, "0.05");
  expect(centavo, 'the "0.05" keystroke sequence no longer collapses — re-read P1').toBe("5");
  await shot(page, "P1-evoucher-005-becomes-5");

  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.waitForTimeout(6_000);

  const banner = await page.locator("body").innerText();
  const evNumber = (banner.match(/EV-\d{4}-\d{4}/) || [])[0];
  expect(evNumber, "Save Draft did not report a voucher number").toBeTruthy();

  // THE ONLY PROOF THAT COUNTS. Not the toast, not the field — the row.
  const { data: ev } = await admin
    .from("evouchers")
    .select("id, evoucher_number, amount, notes")
    .eq("evoucher_number", evNumber)
    .maybeSingle();
  expect(ev, `${evNumber} is not in the database though the panel said it saved`).toBeTruthy();
  debris.evoucherIds.push(ev!.id);

  record(
    "e-voucher · Line Items · amount → evouchers.amount",
    "0.05",
    `${ev!.amount}`,
    Number(ev!.amount) === 0.05 ? "none" : "silent_corruption"
  );
  expect(
    Number(ev!.amount),
    "P1 is fixed or has changed shape: 0.05 no longer lands as 5.00"
  ).toBe(5);

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 / P3 — the billing line editor, on a project. Same parseFloat(...) || 0,
// but bound to `value={data.final_price}` with no `|| ""`, so the field can
// never be emptied: the 0 React writes back STAYS, and everything typed after a
// rejected keystroke appends to it.
// ─────────────────────────────────────────────────────────────────────────────
test("misuse: a billing price typed as -500 is stored as +500, and the remark is dropped", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, TREASURY);

  await page.goto("/accounting/projects", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  await page.getByPlaceholder(/Search projects/).fill(PROJECT);
  await page.waitForTimeout(3_000);
  await page.getByText(PROJECT).first().click();
  await page.waitForTimeout(3_000);

  await page.locator("main").getByRole("button", { name: "Accounting", exact: true }).last().click();
  await page.waitForTimeout(2_000);
  await page.locator("main").getByRole("button", { name: "Billings", exact: true }).last().click();
  await page.waitForTimeout(3_500);

  await page.getByRole("button", { name: "Add Billing" }).click();
  await page.waitForTimeout(2_000);

  // E14: the new row is filed under a service group that was never expanded, so
  // it vanishes the moment it is created. Open the group it went to.
  await page.locator("main button").filter({ hasText: /^General\d+ items?$/ }).click({ timeout: 20_000 });
  await page.waitForTimeout(1_500);

  const desc = page.getByPlaceholder("Item description").first();
  await desc.click();
  await desc.fill("CRATING");
  await page.waitForTimeout(1_800);
  await page.getByRole("button", { name: BILLING_ITEM, exact: true }).click({ timeout: 15_000 });
  await page.waitForTimeout(1_000);

  const price = page.getByPlaceholder("Price").first();

  // The commas and currency words survive here too — good news, recorded.
  const clean = await typeAmount(page, price, "25,000.50");
  record("project · Billings · Price", '"25,000.50"', `field ${clean}`, "none");
  expect(Number(clean)).toBe(25000.5);

  // "1e6" — a million, in the notation a spreadsheet hands you. The "e"
  // keystroke is momentarily invalid, React writes 0 into the field, and the
  // "6" appends to it. One million becomes six. Nothing complains.
  const million = await typeAmount(page, price, "1e6");
  record(
    "project · Billings · Price",
    '"1e6" (1,000,000)',
    `field ${million} (${Number(million)})`,
    Number(million) === 1e6 ? "none" : "silent_corruption"
  );
  expect(Number(million), "P2's 1e6 collapse no longer reproduces").toBe(6);

  // And the one that goes to the database: a credit line. The leading "-" is
  // rejected the same way, the field is reset to "0", and "500" appends —
  // a ₱500 credit becomes a ₱500 CHARGE to the customer.
  const negative = await typeAmount(page, price, "-500");
  expect(negative, "the -500 sign-flip no longer reproduces").toBe("0500");
  await shot(page, "P2-billing-negative-becomes-positive");

  const remark = `${TAG} credit note, see attached`;
  const note = page.getByPlaceholder("Add optional notes...").first();
  await note.click();
  await note.fill(remark);
  await page.waitForTimeout(500);

  // D1: the row must resolve to a real booking, and at project level that is
  // done by naming the service.
  await page.locator("main button").filter({ hasText: /^General$/ }).last().click();
  await page.waitForTimeout(1_200);
  await page.getByRole("button", { name: "Forwarding", exact: true }).first().click({ timeout: 15_000 });
  await page.waitForTimeout(1_000);

  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.waitForTimeout(6_000);
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
    "the billing row never saved — the pending-changes bar is still up"
  ).toHaveCount(0, { timeout: 20_000 });

  const { data: rows } = await admin
    .from("billing_line_items")
    .select("id, description, amount, notes, created_at")
    .eq("description", BILLING_ITEM)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0];
  expect(row, "the saved billing row is not in the database").toBeTruthy();
  debris.billingIds.push(row!.id);

  record(
    "project · Billings · Price → billing_line_items.amount",
    "-500",
    `${row!.amount}`,
    Number(row!.amount) === -500 ? "none" : "silent_corruption"
  );
  expect(Number(row!.amount), "P2 is fixed: -500 no longer lands as +500").toBe(500);

  // P3 — the remark. The input is bound to `data.remarks`; the column is
  // `notes`. The save reports success, updated_at moves, and the sentence the
  // user typed is simply not there.
  record(
    "project · Billings · Remarks → billing_line_items.notes",
    JSON.stringify(remark),
    row!.notes === null ? "NULL" : JSON.stringify(row!.notes),
    row!.notes === remark ? "none" : "data_loss"
  );
  expect(row!.notes, "P3 is fixed: the billing remark now persists").toBeNull();

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// P4 — invoice dates. Both are bare <input type="date"> with no min, no max and
// no relationship between them.
// ─────────────────────────────────────────────────────────────────────────────
test("misuse: an invoice can be dated in the year 52026 and fall due in 2020", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, TREASURY);

  await page.goto("/accounting/projects", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  await page.getByPlaceholder(/Search projects/).fill(PROJECT);
  await page.waitForTimeout(3_000);
  await page.getByText(PROJECT).first().click();
  await page.waitForTimeout(3_000);
  await page.locator("main").getByRole("button", { name: "Accounting", exact: true }).last().click();
  await page.waitForTimeout(2_000);
  await page.locator("main").getByRole("button", { name: "Invoices", exact: true }).last().click();
  await page.waitForTimeout(3_500);
  await page.getByRole("button", { name: "New Invoice" }).click();
  await page.waitForTimeout(4_000);

  // Claim an unbilled charge — the builder bills what exists, it does not invent.
  const billable = page.getByText(BILLING_ITEM).first();
  if ((await billable.count()) === 0) {
    test.skip(true, `no unbilled ${BILLING_ITEM} on ${PROJECT} to invoice — run the P2 test first`);
  }
  await billable.click();
  await page.waitForTimeout(1_500);

  // The date fields live behind the DETAILS tab of the builder. Its label is a
  // <span> inside a <button> whose textContent carries stray whitespace, so
  // getByRole misses it; address it by its rendered text.
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b as HTMLElement).innerText.trim() === "DETAILS")
      ?.click();
  });
  await page.waitForTimeout(2_500);

  const dates = page.locator('input[type="date"]');
  await expect(dates, "the invoice builder's date fields are not on the DETAILS tab").toHaveCount(2, {
    timeout: 15_000,
  });

  // A due date SIX YEARS BEFORE the invoice. No warning, no red field.
  await dates.nth(1).fill("2020-01-01");
  await page.waitForTimeout(800);

  // And a fat-fingered invoice date: typing 1-3-4-5-2-0-2-6 into the segments
  // rolls the year past the day and month into the year segment. There is no
  // max, so the year is accepted as written.
  await dates.nth(0).click();
  await page.keyboard.type("13452026", { delay: 40 });
  await page.waitForTimeout(800);

  const [invoiceDateShown, dueDateShown] = await dates.evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value)
  );
  expect(invoiceDateShown, "the year no longer overflows past 9999").toBe("52026-04-13");
  await shot(page, "P4-invoice-dates");

  await page.getByRole("button", { name: "Save as Draft" }).click();
  await page.waitForTimeout(8_000);

  const { data: invs } = await admin
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, total_amount")
    .order("created_at", { ascending: false })
    .limit(1);
  const inv = invs?.[0];
  expect(inv, "the draft invoice is not in the database").toBeTruthy();
  debris.invoiceIds.push(inv!.id);

  record(
    "invoice builder · Invoice Date → invoices.invoice_date",
    invoiceDateShown,
    String(inv!.invoice_date),
    String(inv!.invoice_date).startsWith("2026") ? "none" : "silent_corruption"
  );
  record(
    "invoice builder · Due Date → invoices.due_date",
    `${dueDateShown} (before the invoice date)`,
    String(inv!.due_date),
    "silent_corruption"
  );

  expect(
    String(inv!.invoice_date).startsWith("52026"),
    "P4 is fixed: the year is now bounded"
  ).toBe(true);
  expect(
    new Date(inv!.due_date as string).getTime() < new Date("2026-01-01").getTime(),
    "P4 is fixed: a due date before its invoice date is now refused"
  ).toBe(true);

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// P5 — master data. The customer form does not trim and does not look for a
// duplicate, and dev already carries 13 untrimmed names cloned from prod
// ('FREIGHT CARE LOGISTICS ', 'CHEMISOL INC. ', ' ARMADA BRANDS…').
// ─────────────────────────────────────────────────────────────────────────────
test("misuse: a customer name padded with spaces saves as a second, identical-looking company", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, BD);

  const before = await admin.from("customers").select("id, name").ilike("name", `%${DUP_CUSTOMER}%`);
  const countBefore = before.data?.length ?? 0;

  await page.goto("/bd/customers", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.waitForTimeout(2_500);

  const drawer = page.locator("div.fixed.right-0.top-0").first();
  const padded = `  ${DUP_CUSTOMER}  `;
  await drawer.locator("#company_name").fill(padded);

  // A REQUIRED field, satisfied with the two characters every hurried person
  // reaches for. The form is happy; so is the database. ('-' and 'N/A' are
  // already sitting in registered_address on real prod-cloned rows.)
  await drawer.locator("#registered_address").fill("N/A");

  // Everything a careless paste can carry, in one note: markup with an event
  // handler, emoji, Chinese, right-to-left Arabic, and 10,000 characters.
  const nastyNote =
    `${TAG} <b>BOLDNOTE</b> <img src=x onerror="window.__MISUSE_XSS=1"> 😀🚚 中文测试 مرحبا بالعالم ` +
    "A".repeat(10_000);
  await drawer.locator("#notes").fill(nastyNote);

  await drawer.locator("#industry").click();
  await page.waitForTimeout(1_000);
  await drawer.locator("button").filter({ hasText: "OTHERS" }).last().click();
  await page.waitForTimeout(800);
  await drawer.locator("#owner_id").click();
  await page.waitForTimeout(1_500);
  await drawer.locator("button").filter({ hasText: /^Bambi C\. Badajos$/ }).first().click();
  await page.waitForTimeout(1_000);

  const create = drawer.getByRole("button", { name: "Create Customer" });
  await expect(create, "Create Customer is disabled — a required field is unsatisfied").toBeEnabled({
    timeout: 10_000,
  });
  await create.click();
  await page.waitForTimeout(6_000);

  const { data: after } = await admin
    .from("customers")
    .select("id, name, registered_address, notes")
    .ilike("name", `%${DUP_CUSTOMER}%`)
    .order("created_at", { ascending: false });
  const mine = after?.find((c) => c.name === padded);
  expect(mine, "the padded customer name is not in the database").toBeTruthy();
  debris.customerIds.push(mine!.id);

  record(
    "BD · Add Customer · Company Name → customers.name",
    JSON.stringify(padded),
    JSON.stringify(mine!.name),
    mine!.name === DUP_CUSTOMER ? "none" : "silent_corruption"
  );
  record(
    "BD · Add Customer · Registered Address (required) → customers.registered_address",
    '"N/A"',
    JSON.stringify(mine!.registered_address),
    mine!.registered_address === "N/A" ? "cosmetic" : "none"
  );
  record(
    "BD · Add Customer · Notes (10,089 chars, HTML, emoji, CJK, RTL) → customers.notes",
    `${nastyNote.length} chars`,
    `${(mine!.notes as string).length} chars, stored verbatim`,
    "none"
  );

  expect(mine!.name, "P5 is fixed: the customer name is trimmed on save").toBe(padded);
  expect(
    (after?.length ?? 0),
    "P5 is fixed: a duplicate company name is now refused"
  ).toBe(countBefore + 1);

  // Both rows now render the same visible name in the list — the only way to
  // tell them apart is the row id.
  await page.goto("/bd/customers", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);
  await page.getByPlaceholder(/Search customers/).fill(DUP_CUSTOMER);
  await page.waitForTimeout(3_000);
  await shot(page, "P5-two-identical-customers");
  await expect(
    page.getByText(DUP_CUSTOMER),
    "the two same-named customers are not both listed"
  ).toHaveCount(countBefore + 1, { timeout: 20_000 });

  // GOOD NEWS, and worth keeping: the markup is escaped, not rendered. React
  // does the right thing here even though send-feedback-email does not (N3).
  await page.goto(`/bd/customers?detail=${mine!.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);
  const xss = await page.evaluate(() => (window as any).__MISUSE_XSS);
  const boldTags = await page.evaluate(() => document.querySelectorAll("b").length);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  record(
    "BD · Customer detail · notes rendering",
    "<b> and <img onerror=…>",
    `escaped as text (b tags=${boldTags}, handler fired=${xss ?? false}), RTL did not overflow=${!overflows}`,
    "none"
  );
  expect(xss, "the onerror handler executed — the notes field is rendered as markup").toBeFalsy();
  expect(boldTags, "the <b> tag was rendered as markup").toBe(0);
  expect(overflows, "the Arabic/RTL note pushed the page into horizontal scroll").toBe(false);

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// P6 — attachments. <input type="file" multiple> with no `accept`, no size
// check and no name check, uploading into a bucket that is public (M1).
// ─────────────────────────────────────────────────────────────────────────────
test("misuse: the e-voucher attach box takes a .exe, and chokes on a long filename", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, BD);

  const dir = join(tmpdir(), "e2e-misuse");
  mkdirSync(dir, { recursive: true });
  const exePath = join(dir, `${TAG}-payload.exe`);
  writeFileSync(exePath, "MZ\x90\x00" + TAG + " fake executable payload");
  const longName = `${TAG}-${"x".repeat(150)}.pdf`;
  const longPath = join(dir, longName);
  writeFileSync(longPath, `${TAG} long name`);

  await page.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "New Request" }).click();
  await page.waitForTimeout(3_000);

  await page.locator('input[type="file"]').first().setInputFiles([exePath, longPath]);
  await page.waitForTimeout(2_000);

  const drawer = page.locator("div.fixed.right-0.top-0").first();
  const listed = await drawer.innerText();
  record(
    "e-voucher · Attachments · file picker",
    ".exe and a 165-character filename",
    listed.includes(".exe") ? "both accepted, no warning" : "refused",
    listed.includes(".exe") ? "silent_corruption" : "none"
  );
  await shot(page, "P6-attachments-accepted");

  await drawer.getByRole("button", { name: "Save Draft" }).click();
  await page.waitForTimeout(12_000);

  // The 165-character name is INTERMITTENT, and that is the honest finding: on
  // one manual run the upload died with the browser's own "Failed to fetch" —
  // a toast that tells a user nothing and abandons the save — and on the next
  // it went through. Recorded either way rather than asserted, because a probe
  // that only sometimes reproduces must not be dressed up as a rule (K2/K3).
  const toast = await page.locator("body").innerText();
  const failed = /Failed to upload/.test(toast);
  record(
    "e-voucher · Attachments · 165-character filename",
    longName.slice(0, 40) + "…",
    failed
      ? 'toast: "Failed to upload …: Failed to fetch", voucher not created'
      : "uploaded and stored under the full name",
    failed ? "blocked_work" : "none"
  );

  // The .exe is in the bucket either way — and if the save DID abandon, it is
  // there with no voucher to own it. An orphan, in a bucket that serves
  // anonymously (M1).
  const { data: objects } = await admin.storage
    .from("attachments")
    .list("evouchers", { limit: 200 });
  // The bucket is folder-per-voucher, so walk the folders for our tagged names.
  let found: string | null = null;
  for (const folder of objects ?? []) {
    const { data: inner } = await admin.storage.from("attachments").list(`evouchers/${folder.name}`);
    for (const o of inner ?? []) {
      if (!o.name.includes(TAG)) continue;
      debris.storagePaths.push(`evouchers/${folder.name}/${o.name}`);
      if (o.name.endsWith(`${TAG}-payload.exe`)) found = `evouchers/${folder.name}/${o.name}`;
    }
  }
  // THE UPLOAD ITSELF IS FLAKY, and that is a finding rather than a harness
  // problem: across four runs of this file the `attachments` upload died twice
  // with the browser's bare "Failed to fetch", once for the long name and once
  // for the .exe. When it dies, the voucher is not created and the user is told
  // nothing actionable. So the anonymous-fetch proof below is guarded rather
  // than assumed — a probe that cannot reach the bucket must report that, not
  // manufacture a pass or a failure (K1).
  if (!found) {
    record(
      "e-voucher · Attachments · upload to the attachments bucket",
      `${TAG}-payload.exe`,
      'nothing in the bucket — the upload failed with "Failed to fetch" and the save was abandoned',
      "blocked_work"
    );
    await shot(page, "P6-upload-failed");
    await ctx.close();
    return;
  }

  // If the draft did save, it is ours and it goes on the cleanup list. Found by
  // the tag inside its attachment list rather than by the toast, which does not
  // always carry the number.
  const { data: mine } = await admin
    .from("evouchers")
    .select("id, attachments")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(20);
  for (const ev of mine ?? []) {
    if (JSON.stringify(ev.attachments ?? []).includes(TAG)) debris.evoucherIds.push(ev.id);
  }

  const publicUrl = admin.storage.from("attachments").getPublicUrl(found!).data.publicUrl;
  const res = await fetch(publicUrl); // no Authorization header at all
  record(
    "attachments bucket · anonymous fetch of the uploaded .exe",
    publicUrl.split("/").pop() ?? "",
    `HTTP ${res.status} ${res.headers.get("content-type")}`,
    res.ok ? "silent_corruption" : "none"
  );
  expect(
    res.status,
    "M1 is fixed: the attachments bucket no longer serves anonymously"
  ).toBe(200);

  await ctx.close();
});
