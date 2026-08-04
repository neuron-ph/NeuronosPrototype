import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONA CLICK-THROUGH — Accounting and BD.
//
// Every other pass in this effort asks "can someone do what they SHOULD NOT".
// This asks the opposite: can someone holding every grant, looking at the right
// tab, filling in the form, actually FINISH THEIR JOB. That is the E15 class —
// an Ops supervisor with create/edit/delete on billings whose every write was
// refused by a NULL-owner policy. No API probe finds that, because from the API
// side the table works fine for the department that owns it.
//
// Three people, three ordinary days:
//
//   Janice D. De Villa   treasury@              Accounting manager, acct_evouchers:disburse
//       work the Pending Disburse queue, disburse a voucher, raise a billing on
//       a project, invoice it, finalize it, collect it, read every Financials tab
//   MARYCRIS P. MAGCALAS accountreceivables@    Accounting staff, NO :disburse
//       find unpaid invoices, read the aging, record a collection, and confirm
//       the AP action she must not have is absent
//   Johnna P. C. Aceveda jr.businessdev02@      BD staff
//       create an inquiry, submit it to Pricing, carry it to Accepted, and try
//       to convert it (E8 says only Pricing can — does the UI say so?)
//
// EVERY OUTCOME IS VERIFIED WITH SERVICE-ROLE EYES (K1). A toast is not proof.
// An HTTP 200 is not proof. The row is the proof — which is the only way to
// separate WORKS from LIES_SAYS_SAVED, the worst outcome in the vocabulary:
//
//   WORKS               they completed it
//   BLOCKED_NO_BUTTON   the action is not offered though their grants say it is
//   BLOCKED_SAVE_FAILS  the form took the input and the save was refused
//   LIES_SAYS_SAVED     the UI said success and the database shows nothing
//   EMPTY_PAGE          renders, but shows no data where service-role sees data
//   ERROR               a visible error or a crash
//
// TWO STEPS ARE SET UP BY SERVICE ROLE, AND SAID SO PLAINLY. Janice cannot
// finalize an invoice nobody approved, and the approver is the Operations
// manager — another agent's persona. Johnna cannot price her own quotation.
// Both of those hops are performed as environment setup, never as a UI
// assertion, so nothing here claims a person did something they did not do.
//
// WRITES TO DEV. Everything created carries E2E-PERSONA and is deleted in
// afterAll, pass or fail.
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-PERSONA";
const PASSWORD = "devpassword123";
const SHOTS = "test-results/personas";

const JANICE = "treasury@falconslogistics-ph.com";
const AR = "accountreceivables@falconslogistics-ph.com";
const JOHNNA = "jr.businessdev02@falconslogistics-ph.com";

// Real rows in dev, chosen rather than "whatever is first" so a failure means
// the flow broke and not that a picker returned something unexpected.
const BILLING_ITEM = "CRATING FEE";
const BILLING_AMOUNT = 4321;
const CUSTOMER = "FREIGHT CARE LOGISTICS";
const CONTACT = "FAJNA FAJNA";
// Janice's project: converted, Active, one Forwarding booking. A billing row at
// project level resolves its booking FROM the service, so a project with exactly
// one booking is what makes the save legal (D1).
const JANICE_PROJECT = "PRJ-291528";
const JANICE_BOOKING = "FWD202608-062";
// AR's project — a different one, so the two Accounting personas never race for
// the same open balance.
const AR_PROJECT = "PRJ-899414";
const AR_BOOKING = "FWD202608-060";
const AR_INVOICE_AMOUNT = 7500;

// ── env / service-role eyes ──────────────────────────────────────────────────
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

// ── the verdict vocabulary ───────────────────────────────────────────────────
type Outcome =
  | "WORKS"
  | "BLOCKED_NO_BUTTON"
  | "BLOCKED_SAVE_FAILS"
  | "LIES_SAYS_SAVED"
  | "EMPTY_PAGE"
  | "ERROR";

const results: { persona: string; step: string; outcome: Outcome; evidence: string }[] = [];

function record(persona: string, step: string, outcome: Outcome, evidence: string) {
  results.push({ persona, step, outcome, evidence });
  console.log(`[${persona}] ${step} → ${outcome} :: ${evidence}`);
}

/** Run one job step. A thrown error is a result, not a run-ending failure — the
 *  point is to walk the whole day and report where it stopped, not to stop. */
async function step(
  persona: string,
  page: Page,
  name: string,
  fn: () => Promise<{ outcome: Outcome; evidence: string }>
) {
  let out: { outcome: Outcome; evidence: string };
  try {
    out = await fn();
  } catch (e: any) {
    out = { outcome: "ERROR", evidence: String(e?.message ?? e).slice(0, 400) };
  }
  record(persona, name, out.outcome, out.evidence);
  if (out.outcome !== "WORKS") {
    mkdirSync(SHOTS, { recursive: true });
    await page
      .screenshot({ path: `${SHOTS}/${persona}-${name.replace(/\W+/g, "-")}.png`, fullPage: true })
      .catch(() => {});
  }
}

const cell = (page: Page, name: string | RegExp) => page.getByRole("cell", { name }).first();

// The Financials tab bar is plain <button>s carrying the same words as the left
// sidebar ("Dashboard" is in both). Taking .first() clicks the SIDEBAR and
// navigates off the page, after which every later tab reads as "not offered" —
// a harness lie of exactly the C6 shape. The tab bar lives inside <main>, which
// is after the nav in the DOM, so address it from there and re-assert the page
// after every click.
const finTab = (page: Page, label: string) =>
  page.locator("main").getByRole("button", { name: label, exact: true }).first();

// Both pickers on the inquiry form are the same shape: a display textbox that
// opens a panel containing its own search box and the options. The option text
// also appears in the list BEHIND the form, and a click there dismisses the
// whole form — so scope the option to the panel that holds the search box.
function pickerOption(page: Page, searchPlaceholder: string, option: string) {
  // The search box sits in its own icon wrapper; the options are two levels
  // above it, inside the dropdown panel. ancestor::div[3] is that panel.
  return page
    .getByPlaceholder(searchPlaceholder)
    .locator("xpath=ancestor::div[3]")
    .getByText(option, { exact: true })
    .first();
}

// A project file's tabs are two-tier (category, then tab) and the category row
// is not interactive until the file has hydrated — a click a beat too early is
// swallowed and every later step reads as "the tab isn't offered" (E5). Click,
// wait for the child tab, and try once more before believing it.
async function openProjectTab(page: Page, category: string, tab: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: category, exact: true }).last().click().catch(() => {});
    const child = page.getByRole("button", { name: tab, exact: true }).last();
    try {
      await expect(child).toBeVisible({ timeout: 12_000 });
      await child.click();
      await page.waitForTimeout(3_500);
      return true;
    } catch {
      await page.waitForTimeout(2_500);
    }
  }
  return false;
}

// K3 — a failed sign-in reads as "denied everywhere" and fabricates findings.
// Every persona's session is proved twice: the token persisted AND the login
// form is gone.
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

// ── fixtures ────────────────────────────────────────────────────────────────
const fixture: {
  evoucherId?: string;
  evoucherNumber?: string;
  arInvoiceId?: string;
  arInvoiceNumber?: string;
  janiceBookingId?: string;
  arBookingId?: string;
  janiceProjectId?: string;
  quotationId?: string;
} = {};

test.beforeAll(async () => {
  const { data: bks } = await admin
    .from("bookings")
    .select("id, booking_number")
    .in("booking_number", [JANICE_BOOKING, AR_BOOKING]);
  fixture.janiceBookingId = bks?.find((b) => b.booking_number === JANICE_BOOKING)?.id;
  fixture.arBookingId = bks?.find((b) => b.booking_number === AR_BOOKING)?.id;
  expect(fixture.janiceBookingId, `${JANICE_BOOKING} is missing from dev`).toBeTruthy();
  expect(fixture.arBookingId, `${AR_BOOKING} is missing from dev`).toBeTruthy();

  const { data: prj } = await admin
    .from("projects")
    .select("id")
    .eq("project_number", JANICE_PROJECT)
    .single();
  fixture.janiceProjectId = prj?.id;

  const { data: ops } = await admin
    .from("users")
    .select("id, name")
    .eq("email", "jr.supervisor07@falconslogistics-ph.com")
    .single();

  // Janice's voucher to disburse. Parked at pending_accounting, which is exactly
  // where her queue picks it up — the two approvals before it are somebody
  // else's job and are not what this test is measuring.
  const evId = `evoucher-${Date.now()}-persona`;
  const evNo = `EV-2026-9${Math.floor(Math.random() * 900 + 100)}`;
  const { error: evErr } = await admin.from("evouchers").insert({
    id: evId,
    evoucher_number: evNo,
    transaction_type: "expense",
    source_module: "operations",
    booking_id: fixture.janiceBookingId,
    project_number: JANICE_BOOKING,
    vendor_name: "UTOC CORPORATION",
    amount: 137.5,
    currency: "PHP",
    payment_method: "Cash",
    description: `${TAG} disburse fixture`,
    purpose: `${TAG} disburse fixture`,
    status: "pending_accounting",
    gl_category: "(EXP) MISCELLANEOUS",
    created_by: ops?.id,
    created_by_name: ops?.name,
    approvers: [],
    attachments: [],
    original_currency: "PHP",
    exchange_rate: 1,
    base_currency: "PHP",
    base_amount: 137.5,
    pending_approver_department: "Accounting",
    details: {
      requestor_id: ops?.id,
      requestor_name: ops?.name,
      requestor_department: "Operations",
      is_billable: false,
      line_items: [
        {
          id: `item-${Date.now()}`,
          amount: 137.5,
          particular: `${TAG} fixture line`,
          description: "",
          booking_id: fixture.janiceBookingId,
          expense_category: "(EXP) MISCELLANEOUS",
        },
      ],
    },
  });
  expect(evErr, `could not seed the disburse fixture: ${evErr?.message}`).toBeNull();
  fixture.evoucherId = evId;
  fixture.evoucherNumber = evNo;

  // AR's unpaid receivable. Cloned from a real posted invoice on her project so
  // it ages, appears in the open list, and can be collected against.
  const { data: template } = await admin
    .from("invoices")
    .select("*")
    .eq("invoice_number", `${AR_BOOKING}-001`)
    .single();
  const invNo = `${AR_BOOKING}-9${Math.floor(Math.random() * 90 + 10)}`;
  const dueDate = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .insert({
      ...template,
      id: randomUUID(),
      invoice_number: invNo,
      subtotal: AR_INVOICE_AMOUNT,
      total_amount: AR_INVOICE_AMOUNT,
      base_amount: AR_INVOICE_AMOUNT,
      billing_item_ids: [],
      notes: `${TAG} receivable fixture`,
      due_date: dueDate,
      created_at: dueDate,
      updated_at: dueDate,
      metadata: {
        ...(template?.metadata ?? {}),
        line_items: [
          {
            id: `pf-${Date.now()}`,
            amount: AR_INVOICE_AMOUNT,
            remarks: TAG,
            quantity: 1,
            tax_type: "NON-VAT",
            unit_price: AR_INVOICE_AMOUNT,
            description: `${TAG} receivable fixture`,
            source_type: "manual",
            exchange_rate: 1,
            original_amount: AR_INVOICE_AMOUNT,
            original_currency: "PHP",
          },
        ],
      },
    })
    .select("id")
    .single();
  expect(invErr, `could not seed the receivable fixture: ${invErr?.message}`).toBeNull();
  fixture.arInvoiceId = inv?.id;
  fixture.arInvoiceNumber = invNo;
});

test.afterAll(async () => {
  // Debris first, parents last.
  if (fixture.arInvoiceId) {
    await admin.from("collections").delete().eq("invoice_id", fixture.arInvoiceId);
    await admin.from("invoices").delete().eq("id", fixture.arInvoiceId);
  }
  if (fixture.evoucherId) {
    await admin.from("evoucher_line_items").delete().eq("evoucher_id", fixture.evoucherId);
    await admin.from("evouchers").delete().eq("id", fixture.evoucherId);
  }
  // Anything Janice raised through the UI carries the amount and the item name.
  const { data: lines } = await admin
    .from("billing_line_items")
    .select("id, invoice_id")
    .eq("booking_id", fixture.janiceBookingId)
    .eq("amount", BILLING_AMOUNT);
  for (const l of lines ?? []) {
    if (l.invoice_id) {
      await admin.from("collections").delete().eq("invoice_id", l.invoice_id);
      await admin.from("billing_line_items").update({ invoice_id: null }).eq("id", l.id);
      await admin.from("invoices").delete().eq("id", l.invoice_id);
    }
    await admin.from("billing_line_items").delete().eq("id", l.id);
  }
  if (fixture.quotationId) {
    await admin.from("quotations").delete().eq("id", fixture.quotationId);
  }

  console.log("\n──────── PERSONA CLICK-THROUGH ────────");
  for (const r of results) console.log(`${r.outcome.padEnd(19)} ${r.persona} · ${r.step}`);
  const blocked = results.filter((r) => r.outcome !== "WORKS").length;
  console.log(`${results.length} steps, ${blocked} not WORKS`);
});

// ═══════════════════════════════════════════════════════════════════════════
// JANICE — Accounting manager / Treasury
// ═══════════════════════════════════════════════════════════════════════════
test("persona: Janice (Accounting manager) works her day", async ({ browser }) => {
  test.setTimeout(600_000);
  const P = "janice";
  const ctx = await browser.newContext();
  const page = await signIn(ctx, JANICE);
  record(P, "sign in", "WORKS", `${JANICE} authenticated, login form gone`);

  // ── 1. the Pending Disburse queue ──────────────────────────────────────────
  await step(P, page, "open Pending Disburse queue", async () => {
    await page.goto("/accounting/evouchers", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4_000);
    const { count } = await admin
      .from("evouchers")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_accounting");
    const rows = await page.getByRole("row").count();
    if ((count ?? 0) > 0 && rows <= 1)
      return {
        outcome: "EMPTY_PAGE",
        evidence: `service-role sees ${count} vouchers at pending_accounting; the queue rendered ${rows} rows`,
      };
    return { outcome: "WORKS", evidence: `queue rendered ${rows} rows; ${count} at pending_accounting` };
  });

  // ── 2. disburse a voucher ─────────────────────────────────────────────────
  await step(P, page, "disburse a voucher", async () => {
    const evNo = fixture.evoucherNumber!;
    await page.getByPlaceholder(/Search voucher #/).fill(evNo);
    await page.waitForTimeout(3_500);
    if ((await cell(page, evNo).count()) === 0)
      return { outcome: "EMPTY_PAGE", evidence: `${evNo} is at pending_accounting but not in her queue` };
    await cell(page, evNo).click();

    const disburse = page.getByRole("button", { name: "Disburse", exact: true });
    if ((await disburse.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: `Disburse not offered though she holds acct_evouchers:disburse and ${evNo} is at pending_accounting`,
      };
    await disburse.click();
    await expect(page.getByRole("heading", { name: "Disbursement Details" })).toBeVisible({
      timeout: 30_000,
    });
    await page.selectOption("#disb-method", "Cash");
    await page.waitForTimeout(800);
    const confirm = page.getByRole("button", { name: "Disburse & Close" });
    if (!(await confirm.isEnabled()))
      return { outcome: "BLOCKED_NO_BUTTON", evidence: "Disburse & Close never enabled with method Cash" };
    await confirm.click();
    await page.waitForTimeout(8_000);

    // K1 — the database is the proof, not the toast.
    const { data } = await admin
      .from("evouchers")
      .select("status, disbursed_by_name")
      .eq("id", fixture.evoucherId!)
      .single();
    if (data?.status === "posted")
      return { outcome: "WORKS", evidence: `${evNo} is posted, disbursed_by ${data.disbursed_by_name}` };
    const errVisible = await page.getByText(/violates row-level security|denied|failed/i).count();
    return {
      outcome: errVisible ? "BLOCKED_SAVE_FAILS" : "LIES_SAYS_SAVED",
      evidence: `service-role reads status=${data?.status} after Disburse & Close`,
    };
  });

  // ── 3. raise a billing on a project ───────────────────────────────────────
  await step(P, page, "raise a billing on a project", async () => {
    await page.goto("/accounting/projects", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    await page.getByPlaceholder(/Search projects/).fill(JANICE_PROJECT);
    await page.waitForTimeout(3_500);
    if ((await page.getByText(JANICE_PROJECT).count()) === 0)
      return { outcome: "EMPTY_PAGE", evidence: `${JANICE_PROJECT} exists but Accounting's list does not show it` };
    await page.getByText(JANICE_PROJECT).first().click();
    if (!(await openProjectTab(page, "Accounting", "Billings")))
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "the project file never offered Accounting → Billings though she holds acct_projects_billings_tab:view",
      };

    const add = page.getByRole("button", { name: "Add Billing" });
    if ((await add.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "Add Billing not offered though she holds acct_projects_billings_tab:create",
      };
    await add.click();
    await page.waitForTimeout(2_000);

    const desc = page.getByPlaceholder("Item description").first();
    await desc.click();
    await desc.fill("CRATING");
    await page.waitForTimeout(1_500);
    await page.getByRole("button", { name: BILLING_ITEM, exact: true }).click({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.getByPlaceholder("Price").first().fill(String(BILLING_AMOUNT));
    await page.waitForTimeout(600);
    // Service last: setting it re-groups the row into a collapsed group (E14).
    await page.getByRole("button", { name: "General", exact: true }).last().click();
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: "Forwarding", exact: true }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForTimeout(6_000);

    const { data } = await admin
      .from("billing_line_items")
      .select("id, amount, description, booking_id")
      .eq("booking_id", fixture.janiceBookingId!)
      .eq("amount", BILLING_AMOUNT);
    if ((data?.length ?? 0) > 0)
      return { outcome: "WORKS", evidence: `billing_line_items row ${data![0].id} @ ${BILLING_AMOUNT}` };
    const errVisible = await page.getByText(/row-level security|denied|failed|error/i).count();
    const barStillUp = await page.getByRole("button", { name: "Save Changes" }).count();
    return {
      outcome: errVisible || barStillUp ? "BLOCKED_SAVE_FAILS" : "LIES_SAYS_SAVED",
      evidence: `no billing_line_items row @ ${BILLING_AMOUNT} on ${JANICE_BOOKING} after Save Changes`,
    };
  });

  // ── 4. build an invoice from it ───────────────────────────────────────────
  let invoiceNumber = "";
  await step(P, page, "build an invoice from the charge", async () => {
    await page.getByRole("button", { name: "Invoices", exact: true }).last().click();
    await page.waitForTimeout(4_000);
    const newInv = page.getByRole("button", { name: "New Invoice" });
    if ((await newInv.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "New Invoice not offered though she holds acct_projects_invoices_tab:create",
      };
    await newInv.click();
    await page.waitForTimeout(3_500);
    await page.getByText(BILLING_ITEM).first().click({ timeout: 25_000 });
    await page.waitForTimeout(2_000);
    const saveDraft = page.getByRole("button", { name: "Save as Draft" });
    if (!(await saveDraft.isEnabled()))
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "Save as Draft stayed disabled after selecting the unbilled charge",
      };
    await saveDraft.click();
    await page.waitForTimeout(8_000);

    const { data } = await admin
      .from("invoices")
      .select("id, invoice_number, total_amount, status, approval_status")
      .eq("booking_id", fixture.janiceBookingId!)
      .eq("total_amount", BILLING_AMOUNT);
    if ((data?.length ?? 0) === 0)
      return { outcome: "LIES_SAYS_SAVED", evidence: `no invoice @ ${BILLING_AMOUNT} on ${JANICE_BOOKING}` };
    invoiceNumber = data![0].invoice_number;
    return {
      outcome: "WORKS",
      evidence: `${invoiceNumber} created, status=${data![0].status}, approval=${data![0].approval_status}`,
    };
  });

  // ── 5. finalize it ────────────────────────────────────────────────────────
  // SETUP, STATED PLAINLY: the approver is the Operations manager (the invoice
  // routing rule), who belongs to another agent's persona set. Service role
  // stamps the approval so that what is measured here is Janice's finalize and
  // nothing else.
  await step(P, page, "finalize the invoice", async () => {
    if (!invoiceNumber) return { outcome: "ERROR", evidence: "no invoice to finalize — step 4 did not produce one" };
    const { data: mgr } = await admin
      .from("users")
      .select("id")
      .eq("email", "jr.manager02@falconslogistics-ph.com")
      .single();
    await admin
      .from("invoices")
      .update({ approval_status: "approved", approved_by: mgr?.id, approved_at: new Date().toISOString() })
      .eq("invoice_number", invoiceNumber);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5_000);
    if (!(await openProjectTab(page, "Accounting", "Invoices")))
      return { outcome: "ERROR", evidence: "could not return to the project's Invoices tab after reload" };
    await cell(page, invoiceNumber).click({ timeout: 30_000 });
    const finalize = page.getByRole("button", { name: "Finalize Invoice" });
    if ((await finalize.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: `Finalize Invoice not offered on an approved ${invoiceNumber}`,
      };
    await finalize.click();
    await page.waitForTimeout(7_000);
    const { data } = await admin
      .from("invoices")
      .select("status")
      .eq("invoice_number", invoiceNumber)
      .single();
    if (data?.status === "posted") return { outcome: "WORKS", evidence: `${invoiceNumber} status=posted` };
    return { outcome: "LIES_SAYS_SAVED", evidence: `${invoiceNumber} status=${data?.status} after Finalize` };
  });

  // ── 6. record a collection ────────────────────────────────────────────────
  await step(P, page, "record a collection", async () => {
    const collTab = page.getByRole("button", { name: "Collections", exact: true }).last();
    await expect(collTab).toBeVisible({ timeout: 20_000 });
    await collTab.click();
    await page.waitForTimeout(4_000);
    const rec = page.getByRole("button", { name: "Record Collection" });
    if ((await rec.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "Record Collection not offered though she holds acct_projects_collections_tab:create",
      };
    await rec.click();
    await page.waitForTimeout(3_500);
    await page.getByPlaceholder("0.00").first().fill(String(BILLING_AMOUNT));
    await page.waitForTimeout(2_000);
    const save = page.getByRole("button", { name: "Save & Close" });
    if (!(await save.isEnabled()))
      return { outcome: "BLOCKED_NO_BUTTON", evidence: "Save & Close stayed disabled after entering the amount" };
    await save.click();
    await page.waitForTimeout(8_000);

    const { data: inv } = await admin
      .from("invoices")
      .select("id")
      .eq("invoice_number", invoiceNumber)
      .single();
    const { data: col } = await admin
      .from("collections")
      .select("id, amount")
      .eq("invoice_id", inv?.id ?? "none");
    if ((col?.length ?? 0) > 0)
      return { outcome: "WORKS", evidence: `collection ${col![0].id} @ ${col![0].amount} applied to ${invoiceNumber}` };
    return { outcome: "LIES_SAYS_SAVED", evidence: `no collections row against ${invoiceNumber}` };
  });

  // ── 7. read every Financials tab ──────────────────────────────────────────
  await step(P, page, "read every Financials tab", async () => {
    await page.goto("/accounting/financials", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Financials" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5_000);

    // What the module reads, with service-role eyes, so an empty tab can be
    // told from an empty table (K1).
    const truth: Record<string, number> = {};
    for (const [tab, table] of [
      ["Billings", "billing_line_items"],
      ["Invoices", "invoices"],
      ["Collections", "collections"],
      ["Expenses", "evouchers"],
    ] as const) {
      const { count } = await admin.from(table).select("id", { count: "exact", head: true });
      truth[tab] = count ?? 0;
    }

    const missing: string[] = [];
    const empty: string[] = [];
    const seen: string[] = [];
    for (const tab of ["Dashboard", "Billings", "Invoices", "Collections", "Expenses"]) {
      const btn = finTab(page, tab);
      if ((await btn.count()) === 0) {
        missing.push(tab);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(4_500);
      // Still on Financials? A click that navigated away would make every later
      // tab read as missing.
      if ((await page.getByRole("heading", { name: "Financials" }).count()) === 0)
        return { outcome: "ERROR", evidence: `clicking ${tab} navigated away from Financials` };
      const body = await page.locator("main").innerText();
      // Only a real empty STATE counts. "no data" is a badge on the
      // Avg-Days-to-Collect tile of a Collections tab showing PHP 75K, and a
      // loose regex reads that as an empty page — a manufactured finding.
      const declaresEmpty =
        /no (invoices|billings|collections|expenses|records|results)[^.]{0,20}(found|yet|to show|to display)/i.test(
          body
        );
      if (declaresEmpty && (truth[tab] ?? 0) > 0) empty.push(`${tab} (db has ${truth[tab]})`);
      seen.push(`${tab}:${body.length}ch`);
    }
    if (missing.length)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: `tabs not offered: ${missing.join(", ")} — she holds accounting_financials_*_tab:view for all five`,
      };
    if (empty.length)
      return { outcome: "EMPTY_PAGE", evidence: `tab declares empty while the db has rows: ${empty.join(", ")}` };
    return { outcome: "WORKS", evidence: `all five tabs read: ${seen.join(", ")}` };
  });

  await ctx.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// AR STAFF — receivables, and the AP action she must not have
// ═══════════════════════════════════════════════════════════════════════════
test("persona: AR staff works the receivables day", async ({ browser }) => {
  test.setTimeout(600_000);
  const P = "ar-staff";
  const ctx = await browser.newContext();
  const page = await signIn(ctx, AR);
  record(P, "sign in", "WORKS", `${AR} authenticated, login form gone`);

  // ── 1. find unpaid invoices ───────────────────────────────────────────────
  await step(P, page, "find unpaid invoices", async () => {
    await page.goto("/accounting/financials", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Financials" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5_000);
    const btn = finTab(page, "Invoices");
    if ((await btn.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "the Invoices tab is not offered though she holds accounting_financials_invoices_tab:view",
      };
    await btn.click();
    await page.waitForTimeout(5_000);

    // The fixture receivable is 45 days overdue and unpaid — service-role eyes
    // on the truth before asking what she can see.
    const { count } = await admin.from("invoices").select("id", { count: "exact", head: true });
    const inDefaultWindow = (await page.getByText(fixture.arInvoiceNumber!).count()) > 0;

    // The tab opens scoped to This Month. Widen it — that is what a real AR
    // clerk does to find anything older than the current month.
    const scope = page.locator("main").getByRole("button", { name: /This Month/ }).first();
    let afterWiden = inDefaultWindow;
    if ((await scope.count()) > 0) {
      await scope.click();
      await page.waitForTimeout(1_200);
      const allTime = page.getByText("All Time", { exact: true }).first();
      if ((await allTime.count()) > 0) {
        await allTime.click();
        await page.waitForTimeout(5_000);
      }
      afterWiden = (await page.getByText(fixture.arInvoiceNumber!).count()) > 0;
    }
    if (!afterWiden)
      return {
        outcome: "EMPTY_PAGE",
        evidence: `${fixture.arInvoiceNumber} is an unpaid, 45-day-overdue invoice in the db (of ${count} total) and does not appear on her Invoices tab even at All Time`,
      };
    return {
      outcome: "WORKS",
      evidence: `${fixture.arInvoiceNumber} found (of ${count} invoices). NOTE: visible in the default This Month window = ${inDefaultWindow} — an aged receivable is outside the tab's default date scope and only appears once it is widened`,
    };
  });

  // ── 2. read the aging ─────────────────────────────────────────────────────
  await step(P, page, "read the receivables aging", async () => {
    await finTab(page, "Dashboard").click();
    await page.waitForTimeout(6_000);
    if ((await page.getByRole("heading", { name: "Financials" }).count()) === 0)
      return { outcome: "ERROR", evidence: "the Dashboard tab click navigated away from Financials" };
    const aging = page.getByText(/Receivables Aging/i).first();
    if ((await aging.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "no Receivables Aging on the Financials dashboard she can open",
      };
    await expect(aging).toBeVisible({ timeout: 20_000 });
    const body = await page.locator("body").innerText();
    const buckets = ["Current", "1-30", "31-60", "61-90", "90"].filter((b) => body.includes(b));
    return { outcome: "WORKS", evidence: `Receivables Aging rendered; buckets seen: ${buckets.join(", ")}` };
  });

  // ── 3. record a collection ────────────────────────────────────────────────
  await step(P, page, "record a collection", async () => {
    await page.goto("/accounting/projects", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    await page.getByPlaceholder(/Search projects/).fill(AR_PROJECT);
    await page.waitForTimeout(3_500);
    if ((await page.getByText(AR_PROJECT).count()) === 0)
      return { outcome: "EMPTY_PAGE", evidence: `${AR_PROJECT} exists but her project list does not show it` };
    await page.getByText(AR_PROJECT).first().click();
    if (!(await openProjectTab(page, "Accounting", "Collections")))
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "the project file never offered Accounting → Collections though she holds acct_projects_collections_tab:view",
      };
    const rec = page.getByRole("button", { name: "Record Collection" });
    if ((await rec.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "Record Collection not offered though she holds acct_projects_collections_tab:create",
      };
    await rec.click();
    await page.waitForTimeout(3_500);
    await page.getByPlaceholder("0.00").first().fill(String(AR_INVOICE_AMOUNT));
    await page.waitForTimeout(2_000);
    const save = page.getByRole("button", { name: "Save & Close" });
    if (!(await save.isEnabled()))
      return { outcome: "BLOCKED_NO_BUTTON", evidence: "Save & Close stayed disabled after entering the amount" };
    await save.click();
    await page.waitForTimeout(8_000);

    const { data: col } = await admin
      .from("collections")
      .select("id, amount, invoice_id")
      .eq("invoice_id", fixture.arInvoiceId!);
    if ((col?.length ?? 0) > 0)
      return { outcome: "WORKS", evidence: `collection ${col![0].id} @ ${col![0].amount} on ${fixture.arInvoiceNumber}` };
    // The panel auto-applies to the OLDEST open balance, so a collection may
    // have landed on a different invoice on the same project. Say which.
    const { data: any } = await admin
      .from("collections")
      .select("id, amount, invoice_id, created_at")
      .gte("created_at", new Date(Date.now() - 600_000).toISOString());
    return {
      outcome: (any?.length ?? 0) > 0 ? "WORKS" : "LIES_SAYS_SAVED",
      evidence:
        (any?.length ?? 0) > 0
          ? `collection landed on a different open invoice: ${JSON.stringify(any![0])}`
          : `no collections row written in the last 10 minutes`,
    };
  });

  // ── 4. the AP action she must NOT have ────────────────────────────────────
  await step(P, page, "AP disburse must be absent", async () => {
    await page.goto("/accounting/evouchers", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4_000);
    const { data: any } = await admin
      .from("evouchers")
      .select("evoucher_number")
      .eq("status", "pending_accounting")
      .limit(1);
    const evNo = any?.[0]?.evoucher_number;
    if (!evNo) return { outcome: "ERROR", evidence: "no voucher at pending_accounting to inspect" };
    await page.getByPlaceholder(/Search voucher #/).fill(evNo);
    await page.waitForTimeout(3_500);
    if ((await cell(page, evNo).count()) === 0)
      return { outcome: "EMPTY_PAGE", evidence: `${evNo} not visible although she holds acct_evouchers:view + org_wide` };
    await cell(page, evNo).click();
    await page.waitForTimeout(3_000);
    const disburse = await page.getByRole("button", { name: "Disburse", exact: true }).count();
    const approve = await page.getByRole("button", { name: /^Approve/ }).count();
    if (disburse > 0)
      return {
        outcome: "ERROR",
        evidence: `Disburse IS offered to a user without acct_evouchers:disburse — the gate is missing on ${evNo}`,
      };
    return {
      outcome: "WORKS",
      evidence:
        `Disburse correctly absent on ${evNo} — she holds acct_evouchers view/create/approve/delete but NOT :disburse. ` +
        `(Approve buttons on this panel = ${approve}; at pending_accounting the outstanding act is disbursement, ` +
        `so an absent Approve here says nothing either way about her acct_evouchers:approve grant.)`,
    };
  });

  await ctx.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// JOHNNA — BD staff
// ═══════════════════════════════════════════════════════════════════════════
test("persona: Johnna (BD staff) works an inquiry to Accepted", async ({ browser }) => {
  test.setTimeout(600_000);
  const P = "johnna";
  const ctx = await browser.newContext();
  const page = await signIn(ctx, JOHNNA);
  record(P, "sign in", "WORKS", `${JOHNNA} authenticated, login form gone`);

  const name = `${TAG} ${Date.now()}`;
  let quoteNumber = "";

  // ── 1 + 2. create the inquiry and submit it to Pricing ────────────────────
  await step(P, page, "create an inquiry and submit it to Pricing", async () => {
    await page.goto("/bd/inquiries", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Inquiries" })).toBeVisible({ timeout: 30_000 });
    const create = page.getByRole("button", { name: "Create Inquiry" });
    if ((await create.count()) === 0)
      return { outcome: "BLOCKED_NO_BUTTON", evidence: "Create Inquiry not offered though she holds bd_inquiries:create" };
    await create.click();
    await page.getByRole("button", { name: /Project Inquiry/ }).click();
    await expect(page.getByRole("heading", { name: "Create Project Inquiry" })).toBeVisible({
      timeout: 20_000,
    });
    quoteNumber = (await page.getByText(/QUO\d{6,}/).first().innerText()).trim();

    await page.getByPlaceholder("Select or search customer...").click();
    await page.waitForTimeout(1_000);
    await page.getByPlaceholder("Select or search customer...").fill(CUSTOMER.slice(0, 10));
    await page.waitForTimeout(2_000);
    await pickerOption(page, "Search companies...", CUSTOMER).click({ timeout: 20_000 });
    await page.waitForTimeout(2_000);
    const contactBox = page.getByPlaceholder("Select or search contact person...");
    if ((await contactBox.count()) === 0)
      return {
        outcome: "BLOCKED_SAVE_FAILS",
        evidence: "picking the customer did not unlock the contact field — it still reads 'Select a customer first...'",
      };
    await contactBox.click();
    await page.waitForTimeout(1_500);
    await pickerOption(page, "Search contacts...", CONTACT).click({ timeout: 20_000 });
    await page.waitForTimeout(1_000);
    await page.locator("#general-quotation-name").fill(name);
    await page.getByRole("button", { name: "Forwarding", exact: true }).click();

    const submit = page.getByRole("button", { name: "Submit Project Inquiry to Pricing" });
    if (!(await submit.isEnabled()))
      return { outcome: "BLOCKED_NO_BUTTON", evidence: "Submit to Pricing stayed disabled on a complete form" };
    await submit.click();
    await page.waitForTimeout(8_000);

    const { data } = await admin
      .from("quotations")
      .select("id, quotation_number, status")
      .eq("quotation_number", quoteNumber)
      .maybeSingle();
    if (!data)
      return { outcome: "LIES_SAYS_SAVED", evidence: `no quotations row for ${quoteNumber} after submit` };
    fixture.quotationId = data.id;
    if (data.status !== "Pending Pricing")
      return {
        outcome: "BLOCKED_SAVE_FAILS",
        evidence: `${quoteNumber} saved but status=${data.status}, not Pending Pricing — it did not reach Pricing`,
      };
    return { outcome: "WORKS", evidence: `${quoteNumber} saved at Pending Pricing` };
  });

  // ── 3. track it to Accepted ───────────────────────────────────────────────
  // SETUP, STATED PLAINLY: Johnna holds no pricing_quotations grant, so she
  // cannot mark her own inquiry Priced and should not be able to. Service role
  // performs the Pricing hop; the two steps that ARE hers — Send to Client and
  // Mark as Approved — are driven through her browser and verified in the row.
  await step(P, page, "carry the priced quote to Accepted", async () => {
    if (!fixture.quotationId) return { outcome: "ERROR", evidence: "no quotation to track" };
    await admin.from("quotations").update({ status: "Priced" }).eq("id", fixture.quotationId);

    await page.goto("/bd/inquiries", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    const tab = page.getByRole("tab", { name: /Quotations/ });
    await expect(tab).toBeVisible({ timeout: 35_000 });
    await tab.click();
    await page.waitForTimeout(2_000);
    await page.getByPlaceholder(/Search/i).first().fill(quoteNumber);
    await page.waitForTimeout(4_000);
    if ((await page.getByText(quoteNumber).count()) === 0)
      return {
        outcome: "EMPTY_PAGE",
        evidence: `${quoteNumber} is Priced in the db but does not appear on her Quotations tab`,
      };
    await page.getByText(quoteNumber).first().click();
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 25_000 });

    // Priced → Sent to Client. The chip reads "Ongoing" for every internal state
    // before this one (E2).
    await page.getByRole("button", { name: /Ongoing/ }).click();
    await page.waitForTimeout(1_500);
    const send = page.getByRole("menuitem", { name: /Send to Client/ });
    if ((await send.count()) === 0)
      return {
        outcome: "BLOCKED_NO_BUTTON",
        evidence: "Send to Client is not offered on her own Priced quotation (she holds bd_inquiries:edit)",
      };
    await send.click();
    await page.waitForTimeout(4_000);

    await page.getByRole("button", { name: /Waiting Approval/ }).click();
    await page.waitForTimeout(1_500);
    const approved = page.getByRole("menuitem", { name: /Mark as Approved/ });
    if ((await approved.count()) === 0)
      return { outcome: "BLOCKED_NO_BUTTON", evidence: "Mark as Approved is not offered at Sent to Client" };
    await approved.click();
    await page.waitForTimeout(4_000);

    const { data } = await admin
      .from("quotations")
      .select("status")
      .eq("id", fixture.quotationId)
      .single();
    if (data?.status === "Accepted by Client")
      return { outcome: "WORKS", evidence: `${quoteNumber} status=Accepted by Client` };
    return {
      outcome: "LIES_SAYS_SAVED",
      evidence: `the chip advanced but service-role reads status=${data?.status}`,
    };
  });

  // ── 4. try to convert it to a project (E8) ────────────────────────────────
  // She SHOULD NOT be able to: Create Project is gated on
  // bd_projects:create || pricing_projects:create and she holds neither
  // (bd_projects:view only). A missing button is therefore CORRECT. What this
  // step actually measures is whether the product SAYS so, or whether the
  // accepted quote simply sits there with no next action and no explanation.
  await step(P, page, "convert to a project (must be refused, and say so)", async () => {
    await page.waitForTimeout(2_500);
    const createProject = page.getByRole("button", { name: "Create Project" });
    const offered = await createProject.count();
    const body = await page.locator("body").innerText();
    const explains =
      /only pricing|pricing (team|department) (will|can)|awaiting pricing|no permission|not authorized|cannot create a project/i.test(
        body
      );
    if (offered > 0)
      return {
        outcome: "ERROR",
        evidence: "Create Project IS offered to a BD user holding neither bd_projects:create nor pricing_projects:create",
      };
    return {
      outcome: explains ? "WORKS" : "BLOCKED_NO_BUTTON",
      evidence: explains
        ? "Create Project correctly absent and the page explains that Pricing converts it"
        : "Create Project correctly absent (no grant) but the accepted quote offers NO next action and NO explanation — the BD user who won the deal is left at a dead end",
    };
  });

  await ctx.close();
});
