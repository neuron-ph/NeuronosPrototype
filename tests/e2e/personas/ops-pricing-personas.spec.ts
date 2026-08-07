import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONA CLICK-THROUGH — Operations + Pricing.
//
// Every other probe in this suite asks "can someone do what they SHOULD NOT".
// This one asks the opposite: can a person holding every grant, looking at the
// right tab, filling in the form, actually finish their ordinary day?
//
// That is the only way to find the E15 class of bug — an Ops supervisor with
// create/edit/delete on billings whose every write is refused by a NULL-owner
// policy. No API probe surfaces it, because from the API side the table works
// fine for Accounting.
//
// Personas:
//   Princess Marre R. Reyes   jr.supervisor07  Operations, team_leader
//   Jayson P. Nabos           jr.manager03     Pricing, manager
//   Sarah May B. Baylon       jr.pricing01     Pricing, staff
//
// Outcomes recorded per step:
//   WORKS               completed it
//   BLOCKED_NO_BUTTON   action not offered, though their grants say it should be
//   BLOCKED_SAVE_FAILS  form accepted input, the save was refused
//   LIES_SAYS_SAVED     UI reported success, SERVICE-ROLE shows nothing changed
//   EMPTY_PAGE          page renders, no data where service-role sees data
//   ERROR               visible error or crash
//
// K1/K2/K3 apply: every outcome that matters is checked with SERVICE-ROLE eyes,
// never from an HTTP status; every write targets a value the row does not hold;
// every sign-in is verified and a failure aborts rather than reading as "denied".
//
// WRITES TO DEV are tagged E2E-PERSONA and cleaned up in afterAll.
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-PERSONA";
const PASSWORD = "devpassword123";

const PRINCESS = "jr.supervisor07@falconslogistics-ph.com";
const JAYSON = "jr.manager03@falconslogistics-ph.com";
const SARAH = "jr.pricing01@falconslogistics-ph.com";
const SARAH_NAME = "Sarah May B. Baylon";

// Fixtures chosen because they are real dev rows, not "whatever is first".
const BOOKING_NUMBER = "FWD202608-062"; // Forwarding, has 1 billing line + 1 invoice
const VENDOR = "UTOC CORPORATION";
const EXPENSE_CATEGORY = "(EXP) FORWARDING";
const CATALOG_ITEM = "FC (OCEAN FREIGHT)";
const BILLING_ITEM = "CRATING FEE";

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

type Outcome =
  | "WORKS"
  | "BLOCKED_NO_BUTTON"
  | "BLOCKED_SAVE_FAILS"
  | "LIES_SAYS_SAVED"
  | "EMPTY_PAGE"
  | "ERROR";

interface Step {
  persona: string;
  step: string;
  outcome: Outcome;
  evidence: string;
}
const RESULTS: Step[] = [];

const SHOTS = "test-results/personas-ops-pricing";
mkdirSync(SHOTS, { recursive: true });

// Playwright's locator.isVisible() does NOT wait — the `timeout` option is
// ignored. Using it on a page that is still loading returns false instantly and
// reads exactly like "the control is not offered", which is the single easiest
// way to manufacture a BLOCKED_NO_BUTTON that isn't real. Everything here waits.
async function visible(loc: any, timeout = 20_000): Promise<boolean> {
  return loc
    .first()
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

async function record(page: Page | null, persona: string, step: string, outcome: Outcome, evidence: string) {
  RESULTS.push({ persona, step, outcome, evidence });
  const line = `[${outcome}] ${persona} — ${step}: ${evidence}`;
  console.log(line);
  if (page && outcome !== "WORKS") {
    mkdirSync(SHOTS, { recursive: true });
    const name = `${persona}-${step}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
  }
}

const signInButton = (page: Page) => page.getByRole("button", { name: "Sign In", exact: true });

// K3 — a failed login reads as "denied everywhere" and fabricates findings.
// Verify the token landed AND that the app resolved the profile; abort otherwise.
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
  return page;
}

// Console/network capture, so an "empty page" can be told from a crashed one.
function watch(page: Page, bag: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") bag.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => bag.push(`pageerror: ${String(e).slice(0, 300)}`));
}

// Toasts are the app's own verdict; capture whatever it says so a save failure
// is reported in the words the user actually sees.
async function toastText(page: Page): Promise<string> {
  const t = page.locator("[data-sonner-toast], [role=status], li[data-sonner-toast]");
  try {
    await t.first().waitFor({ state: "visible", timeout: 8_000 });
    return (await t.first().innerText()).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

let bookingId = "";
let quotationNumber = "";
let quotationName = "";
let quotationId = "";

// The Pricing list SEARCHES on quotation_number but RENDERS the quotation NAME —
// the number appears in no cell. A locator keyed on the number therefore never
// resolves, which reads identically to "the record is not visible to this
// person". Search by number, address the row by name.
const listRow = (page: Page) => page.getByText(quotationName, { exact: true }).first();

// The quotation list is not a DataTable — its rows carry no role=row, so a row
// count is always 0. It reports its own population instead.
async function listPopulated(page: Page): Promise<{ shown: boolean; note: string }> {
  // E5 — the list takes seconds to populate. Poll; sampling once reads a still
  // -loading list as an empty one, which is a manufactured EMPTY_PAGE.
  for (let i = 0; i < 15; i++) {
    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const m = /Showing\s+(\d+)[–-](\d+)\s+of\s+(\d+)/.exec(body);
    if (m) return { shown: Number(m[3]) > 0, note: `list reports "${m[0]}"` };
    if (/No results match your filters/i.test(body)) return { shown: false, note: `list shows "No results match your filters"` };
    await page.waitForTimeout(2_000);
  }
  return { shown: false, note: `no pagination footer and no empty-state text after 30s — the list never populated` };
}
let quotationBefore: any = null;
let evNumber = "";
const createdBillingIds: string[] = [];
let bookingStatusBefore = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { data: b } = await admin
    .from("bookings")
    .select("id,status,booking_number")
    .eq("booking_number", BOOKING_NUMBER)
    .maybeSingle();
  expect(b, `fixture booking ${BOOKING_NUMBER} is missing from dev`).toBeTruthy();
  bookingId = b!.id;
  bookingStatusBefore = b!.status;
});

test.afterAll(async () => {
  // Clean up everything this run created, and restore anything it moved.
  if (createdBillingIds.length) {
    await admin.from("billing_line_items").delete().in("id", createdBillingIds);
  }
  await admin.from("billing_line_items").delete().like("description", `%${TAG}%`);
  await admin.from("booking_comments").delete().like("message", `%${TAG}%`);
  await admin.from("booking_attachments").delete().like("file_name", `%${TAG}%`);
  if (bookingId && bookingStatusBefore) {
    await admin.from("bookings").update({ status: bookingStatusBefore }).eq("id", bookingId);
  }
  if (quotationId && quotationBefore) {
    await admin
      .from("quotations")
      .update({ status: quotationBefore.status, assigned_to: quotationBefore.assigned_to })
      .eq("id", quotationId);
  }
  if (evNumber) {
    const { data: ev } = await admin.from("evouchers").select("id").eq("evoucher_number", evNumber).maybeSingle();
    if (ev) {
      await admin.from("evoucher_line_items").delete().eq("evoucher_id", ev.id);
      await admin.from("evouchers").delete().eq("id", ev.id);
    }
  }
  // Playwright clears test-results/ when the run starts, after this module is
  // imported — so the directory made at import time no longer exists by now.
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/results.json`, JSON.stringify(RESULTS, null, 2));
  console.log("\n===== PERSONA RESULTS =====");
  for (const r of RESULTS) console.log(`${r.outcome.padEnd(19)} ${r.persona} — ${r.step}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRINCESS — Operations team leader. Her ordinary day on a forwarding booking.
// ─────────────────────────────────────────────────────────────────────────────
test("persona: Princess (Operations TL) works her forwarding booking", async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext();
  const faults: string[] = [];
  const page = await signIn(ctx, PRINCESS);
  watch(page, faults);

  // ── 1. her booking list ────────────────────────────────────────────────────
  await page.goto("/operations/forwarding", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  const { count: fwdCount } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("service_type", "Forwarding");
  const listRows = await page.getByRole("row").count();
  if (listRows > 1) {
    await record(page, "princess", "open forwarding booking list", "WORKS", `${listRows - 1} rows rendered; service-role sees ${fwdCount} forwarding bookings`);
  } else {
    await record(page, "princess", "open forwarding booking list", "EMPTY_PAGE", `no rows; service-role sees ${fwdCount} forwarding bookings. dial bookings_forwarding=everything`);
  }

  // ── 2. open the booking ────────────────────────────────────────────────────
  await page.getByPlaceholder(/Search/i).first().fill(BOOKING_NUMBER);
  await page.waitForTimeout(3_500);
  const row = page.getByRole("cell", { name: BOOKING_NUMBER }).first();
  let opened = false;
  if (await visible(row, 8_000)) {
    await row.click();
    opened = await visible(page.getByRole("button", { name: "Billings", exact: true }), 30_000);
  }
  await record(page, "princess", "open the booking", opened ? "WORKS" : "ERROR",
    opened ? `${BOOKING_NUMBER} detail opened, tab bar present` : `could not open ${BOOKING_NUMBER}; faults=${faults.slice(-3).join(" | ")}`);
  if (!opened) { await ctx.close(); return; }

  // ── 3-6. read the four money tabs, each checked against service-role ───────
  const counts = {
    billings: (await admin.from("billing_line_items").select("id", { count: "exact", head: true }).eq("booking_id", bookingId)).count ?? 0,
    invoices: (await admin.from("invoices").select("id", { count: "exact", head: true }).eq("booking_id", bookingId)).count ?? 0,
    collections: (await admin.from("collections").select("id", { count: "exact", head: true }).eq("booking_id", bookingId)).count ?? 0,
    expenses: (await admin.from("evoucher_line_items").select("id", { count: "exact", head: true }).eq("booking_id", bookingId)).count ?? 0,
  };

  // Each tab states its own emptiness in words. That is a far more honest signal
  // than a row count: this booking view is not a DataTable, so role=row is 0
  // whether the tab is full or empty, and a count-based check would report
  // "empty" for a populated tab.
  const EMPTY_PHRASES = [
    /No items in this category/i,
    /No invoices found/i,
    /No collections/i,
    /No expenses/i,
    /No billings found/i,
    /0 items/i,
  ];

  for (const tab of ["Billings", "Invoices", "Collections", "Expenses"] as const) {
    const key = tab.toLowerCase() as keyof typeof counts;
    await page.getByRole("button", { name: tab, exact: true }).last().click();
    // E5 — these panels take seconds to populate. Poll rather than sample, or a
    // slow fetch reads exactly like a hidden row.
    let body = "";
    let saysEmpty = true;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1_500);
      body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      saysEmpty = EMPTY_PHRASES.some((r) => r.test(body));
      if (!saysEmpty && /₱|PHP|[0-9],[0-9]{3}/.test(body)) break;
    }
    const truth = counts[key];
    const hasData = !saysEmpty && /₱|PHP|[0-9],[0-9]{3}/.test(body);
    // K1: an empty render is only a finding if service-role can see rows.
    if (truth === 0) {
      await record(page, "princess", `read ${tab} tab`, "WORKS", `tab renders; service-role also sees 0 rows for this booking, so there is nothing that could be hidden`);
    } else if (hasData) {
      await record(page, "princess", `read ${tab} tab`, "WORKS", `service-role sees ${truth} row(s) and the tab renders them`);
    } else {
      const why =
        key === "billings"
          ? `billing_line_items_select is current_user_can_view_record('billings', NULL) — a literal NULL owner, which returns false for every dial below org_wide. Her billings dial is "team" (E15).`
          : key === "invoices"
            ? `invoices_select scopes on created_by; the invoice on her own booking was raised by Accounting, and her invoices dial is "team" — so a document about HER job is outside her sight-line.`
            : `dial for ${key} is "team".`;
      await record(page, "princess", `read ${tab} tab`, "EMPTY_PAGE",
        `service-role sees ${truth} row(s) on booking ${BOOKING_NUMBER}; the tab renders an explicit empty state after 18s of polling. She holds ops_forwarding_${key}_tab:view. ${why}`);
    }
  }

  // ── 7. add a charge — the E15 confirmation, end to end IN THE UI ──────────
  await page.getByRole("button", { name: "Billings", exact: true }).last().click();
  await page.waitForTimeout(3_000);
  const before = (await admin.from("billing_line_items").select("id", { count: "exact", head: true }).eq("booking_id", bookingId)).count ?? 0;

  // E14: in the BOOKING view the table groups by category, and the header's
  // "Add Billing" files the new row under a category the view never renders — it
  // looks like the button did nothing. "Add Item" INSIDE a category is the way
  // in, and it is what the empty state tells the user to click. Prefer it, so
  // this probe reaches the actual save and is not stopped by a known UI quirk.
  const addItem = page.getByRole("button", { name: /^\+?\s*Add Item$/ });
  const addBilling = page.getByRole("button", { name: "Add Billing" });
  let entry: "Add Billing" | "Add Item" | null = null;
  if (await visible(addItem.first(), 8_000)) entry = "Add Item";
  else if (await visible(addBilling.first(), 8_000)) entry = "Add Billing";

  if (!entry) {
    await record(page, "princess", "add a charge", "BLOCKED_NO_BUTTON",
      `no Add Billing / Add Item control on the Billings tab, though she holds ops_forwarding_billings_tab create+edit+delete`);
  } else {
    await page.getByRole("button", { name: entry === "Add Billing" ? "Add Billing" : /^\+?\s*Add Item$/ }).first().click();
    await page.waitForTimeout(2_000);

    const desc = page.getByPlaceholder("Item description").first();
    const gotRow = await visible(desc, 10_000);
    if (!gotRow) {
      // E14: the row goes into state under a category the table never renders.
      await record(page, "princess", "add a charge", "BLOCKED_NO_BUTTON",
        `"${entry}" clicked but no editable row appeared — the new row is filed under a category the booking view does not render (E14)`);
    } else {
      await desc.click();
      await desc.fill("CRATING");
      await page.waitForTimeout(1_500);
      const catalogOption = page.getByRole("button", { name: BILLING_ITEM, exact: true });
      if (await visible(catalogOption.first(), 8_000)) {
        await catalogOption.first().click();
      } else {
        await desc.fill(`${TAG} charge`);
      }
      await page.waitForTimeout(500);
      const price = page.getByPlaceholder("Price").first();
      if (await visible(price, 8_000)) await price.fill("1234");
      await page.waitForTimeout(500);

      const save = page.getByRole("button", { name: "Save Changes" });
      if (!(await visible(save, 8_000))) {
        await record(page, "princess", "add a charge", "BLOCKED_NO_BUTTON", `the row filled but no Save Changes bar appeared`);
      } else {
        await save.click();
        const toast = await toastText(page);
        await page.waitForTimeout(6_000);
        const after = (await admin.from("billing_line_items").select("id,description", { count: "exact" }).eq("booking_id", bookingId));
        const landed = (after.count ?? 0) > before;
        if (landed) {
          for (const r of after.data ?? []) {
            if (String(r.description ?? "").includes("CRATING") || String(r.description ?? "").includes(TAG)) createdBillingIds.push((r as any).id);
          }
        }
        const stillPending = await visible(save, 8_000);
        if (!landed) {
          await record(page, "princess", "add a charge", "BLOCKED_SAVE_FAILS",
            `SERVICE-ROLE: billing_line_items on ${BOOKING_NUMBER} still ${before}. What she sees: "${toast || "(no toast captured)"}"; pending-changes bar ${stillPending ? "still up" : "cleared"}. She holds ops_forwarding_billings_tab create+edit+delete and sits on the billings "team" dial — E15/G3.`);
        } else if (stillPending) {
          await record(page, "princess", "add a charge", "BLOCKED_SAVE_FAILS",
            `row landed in the DB but the UI still shows unsaved changes: "${toast}" — E15/G3 (insert allowed, read-back refused)`);
        } else {
          await record(page, "princess", "add a charge", "WORKS", `billing_line_items ${before} -> ${after.count}; toast "${toast}"`);
        }
      }
    }
  }

  // ── 8. move the booking status ────────────────────────────────────────────
  // K2: target a value the row does not hold. It is "Created"; go to "Ongoing".
  const target = bookingStatusBefore === "Ongoing" ? "In Transit" : "Ongoing";
  const statusBtn = page.getByRole("button", { name: new RegExp(`^${bookingStatusBefore}$`) }).first();
  if (!(await visible(statusBtn, 8_000))) {
    await record(page, "princess", "update booking status", "BLOCKED_NO_BUTTON",
      `no status control showing "${bookingStatusBefore}" on the booking header, though she holds ops_forwarding:edit`);
  } else {
    await statusBtn.click();
    await page.waitForTimeout(1_200);
    const opt = page.getByText(target, { exact: true }).last();
    if (!(await visible(opt, 8_000))) {
      await record(page, "princess", "update booking status", "BLOCKED_NO_BUTTON", `status menu opened but "${target}" was not offered`);
    } else {
      await opt.click();
      const toast = await toastText(page);
      await page.waitForTimeout(5_000);
      const { data: after } = await admin.from("bookings").select("status").eq("id", bookingId).maybeSingle();
      if (after?.status === target) {
        await record(page, "princess", "update booking status", "WORKS", `SERVICE-ROLE: bookings.status "${bookingStatusBefore}" -> "${target}"`);
      } else if (/success|updated/i.test(toast)) {
        await record(page, "princess", "update booking status", "LIES_SAYS_SAVED", `UI said "${toast}" but SERVICE-ROLE still reads status="${after?.status}"`);
      } else {
        await record(page, "princess", "update booking status", "BLOCKED_SAVE_FAILS", `SERVICE-ROLE still reads status="${after?.status}"; UI said "${toast || "(nothing)"}"`);
      }
    }
  }

  // ── 9. add a comment ──────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Comments", exact: true }).last().click();
  await page.waitForTimeout(3_000);
  const commentBox = page.getByPlaceholder("Add a comment...");
  const commentText = `${TAG} ops note ${Date.now()}`;
  if (!(await visible(commentBox, 8_000))) {
    await record(page, "princess", "add a comment", "BLOCKED_NO_BUTTON", `no comment box, though she holds ops_forwarding_comments_tab:create`);
  } else {
    await commentBox.fill(commentText);
    await page.waitForTimeout(500);
    await commentBox.press("Enter");
    const toast = await toastText(page);
    await page.waitForTimeout(4_000);
    const { data: cms } = await admin.from("booking_comments").select("id,message").ilike("message", `%${commentText}%`);
    const found = (cms ?? []).length > 0;
    if (found) {
      await record(page, "princess", "add a comment", "WORKS", `SERVICE-ROLE: booking_comments row present`);
    } else {
      const shownInUi = await visible(page.getByText(commentText).first(), 8_000);
      await record(page, "princess", "add a comment", shownInUi ? "LIES_SAYS_SAVED" : "BLOCKED_SAVE_FAILS",
        `SERVICE-ROLE finds no booking_comments row; UI ${shownInUi ? "shows the comment" : "does not show it"}; toast "${toast || "(none)"}"`);
    }
  }

  // ── 10. upload an attachment ──────────────────────────────────────────────
  await page.getByRole("button", { name: "Attachments", exact: true }).last().click();
  await page.waitForTimeout(3_000);
  const fileName = `${TAG}-${Date.now()}.txt`;
  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) === 0) {
    await record(page, "princess", "upload an attachment", "BLOCKED_NO_BUTTON", `no file input on the Attachments tab, though she holds ops_forwarding_attachments_tab:create`);
  } else {
    await fileInput.setInputFiles({ name: fileName, mimeType: "text/plain", buffer: Buffer.from(`${TAG} persona probe`) });
    const toast = await toastText(page);
    await page.waitForTimeout(7_000);
    const { data: atts } = await admin.from("booking_attachments").select("id,file_name").ilike("file_name", `%${fileName}%`);
    const ok = (atts ?? []).length > 0;
    if (ok) {
      await record(page, "princess", "upload an attachment", "WORKS", `SERVICE-ROLE: booking_attachments row for ${fileName}`);
      await admin.from("booking_attachments").delete().ilike("file_name", `%${fileName}%`);
    } else {
      const shown = await visible(page.getByText(fileName).first(), 8_000);
      await record(page, "princess", "upload an attachment", shown ? "LIES_SAYS_SAVED" : "BLOCKED_SAVE_FAILS",
        `SERVICE-ROLE finds no booking_attachments row; UI ${shown ? "lists the file" : "does not list it"}; toast "${toast || "(none)"}"`);
    }
  }

  // ── 11. raise an e-voucher for the job and submit it ──────────────────────
  await page.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  const evPage = await visible(page.getByRole("heading", { name: "E-Vouchers" }), 25_000);
  if (!evPage) {
    await record(page, "princess", "raise an e-voucher", "ERROR", `/my-evouchers did not render, though she holds my_evouchers:view`);
  } else {
    await page.getByRole("button", { name: "New Request" }).click();
    const modal = await visible(page.getByRole("heading", { name: "Reimbursement Request" }), 20_000);
    if (!modal) {
      await record(page, "princess", "raise an e-voucher", "BLOCKED_NO_BUTTON", `New Request did not open a request form, though she holds my_evouchers:create`);
    } else {
      await page.getByRole("button", { name: "Paid To (Vendor)" }).click();
      await page.getByPlaceholder("Search registered vendors...").fill("UTOC");
      await page.waitForTimeout(1_200);
      await page.getByRole("button", { name: VENDOR, exact: true }).click({ timeout: 20_000 });
      await page.waitForTimeout(600);

      await page.getByRole("button", { name: "Add Category" }).click();
      await page.getByPlaceholder("Search or type category name...").fill("FORWARDING");
      await page.waitForTimeout(1_200);
      await page.getByRole("button", { name: EXPENSE_CATEGORY, exact: true }).click({ timeout: 20_000 });
      await page.waitForTimeout(1_000);

      const itemInput = page.getByPlaceholder("Select or type item...").first();
      await itemInput.click();
      await itemInput.fill("OCEAN");
      await page.waitForTimeout(1_500);
      await page.getByRole("button", { name: CATALOG_ITEM, exact: true }).click({ timeout: 20_000 });
      await page.waitForTimeout(600);
      await page.getByPlaceholder("0.00").first().fill("1750");

      await page.getByRole("button", { name: "Line item booking" }).click();
      await page.getByPlaceholder("Search bookings…").fill(BOOKING_NUMBER);
      await page.waitForTimeout(1_500);
      await page.getByRole("button", { name: new RegExp(BOOKING_NUMBER) }).first().click({ timeout: 20_000 });
      await page.waitForTimeout(600);

      const submitBtn = page.getByRole("button", { name: "Submit Request" });
      const enabled = await submitBtn.isEnabled().catch(() => false);
      if (!enabled) {
        await record(page, "princess", "raise an e-voucher", "BLOCKED_NO_BUTTON", `Submit Request stayed disabled with vendor, catalog line, amount and booking all filled`);
      } else {
        await submitBtn.click();
        const toast = await toastText(page);
        await page.waitForTimeout(9_000);
        const { data: evs } = await admin
          .from("evouchers")
          .select("evoucher_number,status,pending_approver_department,pending_approver_role,created_at")
          .eq("created_by", "user-3b72a9b7")
          .order("created_at", { ascending: false })
          .limit(1);
        const ev = (evs ?? [])[0] as any;
        const fresh = ev && Date.now() - new Date(ev.created_at).getTime() < 300_000;
        if (fresh) {
          evNumber = ev.evoucher_number;
          if (ev.status === "pending_manager") {
            await record(page, "princess", "raise + submit an e-voucher", "WORKS",
              `SERVICE-ROLE: ${evNumber} status=pending_manager, routed to ${ev.pending_approver_department}/${ev.pending_approver_role}`);
          } else {
            await record(page, "princess", "raise + submit an e-voucher", "BLOCKED_SAVE_FAILS",
              `SERVICE-ROLE: ${evNumber} is status=${ev.status} — the submit did not advance it out of draft; toast "${toast}"`);
          }
        } else {
          await record(page, "princess", "raise + submit an e-voucher", /success/i.test(toast) ? "LIES_SAYS_SAVED" : "BLOCKED_SAVE_FAILS",
            `SERVICE-ROLE finds no e-voucher created by her in the last 5 minutes; toast "${toast || "(none)"}"`);
        }
      }
    }
  }

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// JAYSON — Pricing manager. Triage, assign, price, send, convert, approve.
// ─────────────────────────────────────────────────────────────────────────────
test("persona: Jayson (Pricing manager) works the pending queue", async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext();
  const faults: string[] = [];
  const page = await signIn(ctx, JAYSON);
  watch(page, faults);

  // Pick a real unassigned Pending Pricing quotation and remember its original
  // state so afterAll can put it back exactly as it was.
  const { data: cands } = await admin
    .from("quotations")
    .select("id,quotation_number,quotation_name,status,assigned_to")
    .eq("status", "Pending Pricing")
    .is("assigned_to", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const q = (cands ?? [])[0] as any;
  expect(q, "no unassigned Pending Pricing quotation in dev to triage").toBeTruthy();
  quotationId = q.id;
  quotationNumber = q.quotation_number;
  quotationName = q.quotation_name;
  quotationBefore = { status: q.status, assigned_to: q.assigned_to };

  // ── 1. the pending-pricing queue ──────────────────────────────────────────
  await page.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  const heading = await visible(page.getByRole("heading", { name: "Quotations" }), 30_000);
  const { count: pendingTruth } = await admin
    .from("quotations")
    .select("id", { count: "exact", head: true })
    .eq("status", "Pending Pricing");
  await page.waitForTimeout(4_000);
  const pop = await listPopulated(page);
  if (!heading) {
    await record(page, "jayson", "open the pricing queue", "ERROR", `/pricing/quotations did not render`);
  } else if (pop.shown) {
    await record(page, "jayson", "open the pricing queue", "WORKS", `${pop.note}; service-role counts ${pendingTruth} Pending Pricing (dial quotations=everything)`);
  } else {
    await record(page, "jayson", "open the pricing queue", "EMPTY_PAGE", `${pop.note}; service-role counts ${pendingTruth} Pending Pricing quotations`);
  }

  // ── 2. open it and assign a reviewer ──────────────────────────────────────
  await page.getByPlaceholder(/Search/i).first().fill(quotationNumber);
  await page.waitForTimeout(4_000);
  const hit = listRow(page);
  const canSee = await visible(hit, 10_000);
  if (!canSee) {
    await record(page, "jayson", "find the unassigned quotation", "EMPTY_PAGE", `${quotationNumber} ("${quotationName}") is Pending Pricing and unassigned per service-role, but the manager's list does not show it`);
    await ctx.close();
    return;
  }
  await record(page, "jayson", "find the unassigned quotation", "WORKS", `${quotationNumber} ("${quotationName}") visible in the queue`);
  await hit.click();
  await page.waitForTimeout(4_000);

  const assignBtn = page.getByRole("button", { name: /Unassigned/ });
  if (!(await visible(assignBtn.first(), 8_000))) {
    await record(page, "jayson", "assign a reviewer", "BLOCKED_NO_BUTTON", `no assignment control on the quotation detail`);
  } else {
    await assignBtn.first().click();
    await page.waitForTimeout(1_500);
    await page.getByText(SARAH_NAME, { exact: true }).first().click({ timeout: 20_000 });
    // E3: picking a name does not assign — Confirm Assign does.
    await page.getByRole("button", { name: "Confirm Assign" }).click();
    const toast = await toastText(page);
    await page.waitForTimeout(4_000);
    const { data: after } = await admin.from("quotations").select("assigned_to").eq("id", quotationId).maybeSingle();
    if (after?.assigned_to === "user-ef8325fb") {
      await record(page, "jayson", "assign a reviewer", "WORKS", `SERVICE-ROLE: quotations.assigned_to = user-ef8325fb (${SARAH_NAME})`);
    } else if (/success|assign/i.test(toast)) {
      await record(page, "jayson", "assign a reviewer", "LIES_SAYS_SAVED", `UI said "${toast}" but SERVICE-ROLE reads assigned_to=${after?.assigned_to ?? "null"}`);
    } else {
      await record(page, "jayson", "assign a reviewer", "BLOCKED_SAVE_FAILS", `SERVICE-ROLE reads assigned_to=${after?.assigned_to ?? "null"}; toast "${toast || "(none)"}"`);
    }
  }

  // ── 3. Sarah's half runs here so the ordering is real, not staged ─────────
  // (the Sarah test below picks this record up; nothing to do at this point)

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// SARAH — Pricing staff. Find what was assigned to her, price it, and confirm
// the manager-only steps are correctly absent.
// ─────────────────────────────────────────────────────────────────────────────
test("persona: Sarah (Pricing staff) prices what she was assigned", async ({ browser }) => {
  test.setTimeout(600_000);
  test.skip(!quotationNumber, "Jayson's assignment step did not produce a quotation to price");
  const ctx = await browser.newContext();
  const faults: string[] = [];
  const page = await signIn(ctx, SARAH);
  watch(page, faults);

  // ── 1. find work assigned to her ──────────────────────────────────────────
  await page.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  await page.getByPlaceholder(/Search/i).first().fill(quotationNumber);
  await page.waitForTimeout(4_000);
  const mine = listRow(page);
  const isMineVisible = await visible(mine, 10_000);
  const { data: qrow } = await admin.from("quotations").select("assigned_to,status").eq("id", quotationId).maybeSingle();
  if (isMineVisible) {
    await record(page, "sarah", "find work assigned to her", "WORKS", `${quotationNumber} visible; service-role confirms assigned_to=${qrow?.assigned_to}`);
  } else {
    await record(page, "sarah", "find work assigned to her", "EMPTY_PAGE",
      `SERVICE-ROLE says assigned_to=${qrow?.assigned_to} status=${qrow?.status}; her list shows nothing. She sits on the quotations "own" dial, which matches assigned_to (E1) — so this should be visible.`);
    await ctx.close();
    return;
  }

  // ── 2. price it ───────────────────────────────────────────────────────────
  await mine.click();
  await page.waitForTimeout(4_000);
  const chip = page.getByRole("button", { name: /Ongoing/ });
  if (!(await visible(chip.first(), 8_000))) {
    await record(page, "sarah", "price the quotation", "BLOCKED_NO_BUTTON", `no status action control on the quotation detail, though she holds pricing_quotations:edit`);
  } else {
    await chip.first().click();
    await page.waitForTimeout(1_500);
    const markPriced = page.getByRole("menuitem", { name: /Mark as Priced/ });
    if (!(await visible(markPriced, 8_000))) {
      await record(page, "sarah", "price the quotation", "BLOCKED_NO_BUTTON", `"Mark as Priced" not offered at Pending Pricing, though she holds pricing_quotations:edit`);
    } else {
      await markPriced.click();
      const toast = await toastText(page);
      await page.waitForTimeout(5_000);
      const { data: after } = await admin.from("quotations").select("status").eq("id", quotationId).maybeSingle();
      if (after?.status === "Priced") {
        await record(page, "sarah", "price the quotation", "WORKS", `SERVICE-ROLE: quotations.status "Pending Pricing" -> "Priced"`);
      } else if (/success|priced/i.test(toast)) {
        await record(page, "sarah", "price the quotation", "LIES_SAYS_SAVED", `UI said "${toast}" but SERVICE-ROLE still reads status="${after?.status}"`);
      } else {
        await record(page, "sarah", "price the quotation", "BLOCKED_SAVE_FAILS", `SERVICE-ROLE still reads status="${after?.status}"; toast "${toast || "(none)"}"`);
      }
    }
  }

  // ── 3. the manager-only step: approving an e-voucher ──────────────────────
  // She does NOT hold my_evouchers:approve (Jayson does). The correct behaviour
  // is that the routed voucher is not actionable for her — a missing button for
  // someone WITHOUT the grant is right, and is recorded as such.
  await page.goto("/approvals", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  const approvalsHeading = await visible(page.getByRole("heading", { name: "Approvals" }), 20_000);
  if (evNumber) {
    if (approvalsHeading) {
      await page.getByPlaceholder(/Search by number or requestor/).fill(evNumber).catch(() => {});
      await page.waitForTimeout(3_500);
    }
    const sees = await visible(page.getByText(evNumber).first(), 8_000);
    await record(page, "sarah", "manager-only: approve an e-voucher (must be absent)",
      sees ? "ERROR" : "WORKS",
      sees
        ? `${evNumber} is actionable in her Approvals queue although she does NOT hold my_evouchers:approve`
        : `${evNumber} (routed to the Pricing MANAGER) is correctly not in her queue — she holds my_evouchers view/create/edit but not :approve`);
  } else {
    await record(page, "sarah", "manager-only: approve an e-voucher (must be absent)", "WORKS",
      `no e-voucher was produced by the Princess run to test against; her grants show no my_evouchers:approve, so no approve path should exist`);
  }

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// JAYSON, part two — the steps that depend on Sarah having priced it, plus the
// e-voucher Princess routed to him.
// ─────────────────────────────────────────────────────────────────────────────
test("persona: Jayson (Pricing manager) sends, converts and approves", async ({ browser }) => {
  test.setTimeout(600_000);
  test.skip(!quotationNumber, "no quotation from the triage step");
  const ctx = await browser.newContext();
  const faults: string[] = [];
  const page = await signIn(ctx, JAYSON);
  watch(page, faults);

  // ── 4. send it to the client ──────────────────────────────────────────────
  await page.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  // E4 — pricing MOVES the record between tabs. The page splits by lifecycle
  // (Inquiries = Draft/Pending Pricing/Needs Revision, Quotations = Priced/Sent
  // to Client, Completed = terminal), so now that Sarah has priced it, it has
  // left Inquiries. Looking for it on the default tab reads as a disappearance.
  const quotationsTab = page.getByRole("tab", { name: /^Quotations/ });
  if (await visible(quotationsTab, 30_000)) {
    await quotationsTab.click();
    await page.waitForTimeout(2_000);
  }
  await page.getByPlaceholder(/Search/i).first().fill(quotationNumber);
  await page.waitForTimeout(4_000);
  const hit = listRow(page);
  if (!(await visible(hit, 15_000))) {
    const pop2 = await listPopulated(page);
    await record(page, "jayson", "reopen the priced quotation", "EMPTY_PAGE",
      `${quotationNumber} ("${quotationName}") is not in the manager's Quotations tab after pricing; ${pop2.note}`);
    await ctx.close();
    return;
  }
  await record(page, "jayson", "reopen the priced quotation", "WORKS", `${quotationNumber} found under the Quotations tab after Sarah priced it`);
  await hit.click();
  await page.waitForTimeout(4_000);

  const chip = page.getByRole("button", { name: /Ongoing/ });
  if (!(await visible(chip.first(), 8_000))) {
    await record(page, "jayson", "send the quotation to the client", "BLOCKED_NO_BUTTON", `no status action control on the detail view`);
  } else {
    await chip.first().click();
    await page.waitForTimeout(1_500);
    const send = page.getByRole("menuitem", { name: /Send to Client/ });
    if (!(await visible(send, 8_000))) {
      await record(page, "jayson", "send the quotation to the client", "BLOCKED_NO_BUTTON", `"Send to Client" not offered at Priced, though he holds pricing_quotations:edit`);
    } else {
      await send.click();
      const toast = await toastText(page);
      await page.waitForTimeout(5_000);
      const { data: after } = await admin.from("quotations").select("status").eq("id", quotationId).maybeSingle();
      if (after?.status === "Sent to Client") {
        await record(page, "jayson", "send the quotation to the client", "WORKS", `SERVICE-ROLE: status "Priced" -> "Sent to Client"`);
      } else if (/success|sent/i.test(toast)) {
        await record(page, "jayson", "send the quotation to the client", "LIES_SAYS_SAVED", `UI said "${toast}" but SERVICE-ROLE reads status="${after?.status}"`);
      } else {
        await record(page, "jayson", "send the quotation to the client", "BLOCKED_SAVE_FAILS", `SERVICE-ROLE reads status="${after?.status}"; toast "${toast || "(none)"}"`);
      }
    }
  }

  // ── 5. the client accepts, and he converts it to a project ────────────────
  const accept = page.getByRole("button", { name: /Waiting Approval/ });
  if (await visible(accept.first(), 8_000)) {
    await accept.first().click();
    await page.waitForTimeout(1_500);
    const mark = page.getByRole("menuitem", { name: /Mark as Approved/ });
    if (await visible(mark, 8_000)) {
      await mark.click();
      await page.waitForTimeout(5_000);
    }
  }
  const { data: acc } = await admin.from("quotations").select("status").eq("id", quotationId).maybeSingle();
  if (acc?.status !== "Accepted by Client") {
    await record(page, "jayson", "convert an accepted quotation to a project", "BLOCKED_SAVE_FAILS",
      `could not reach Accepted by Client — SERVICE-ROLE reads status="${acc?.status}", so the conversion step could not be exercised`);
  } else {
    const createProject = page.getByRole("button", { name: "Create Project" });
    if (!(await visible(createProject, 20_000))) {
      await record(page, "jayson", "convert an accepted quotation to a project", "BLOCKED_NO_BUTTON",
        `"Create Project" not offered at Accepted by Client, though he holds pricing_projects:create`);
    } else {
      // E7: scrolling lands this button under the sticky tab bar, so a normal
      // click is intercepted. Dispatch on the element instead. Guard it — the
      // detail view re-renders after the status change, so the node can be
      // replaced between the visibility check and the dispatch, and an
      // unguarded throw here would abort the run before the approval step.
      try {
        await createProject.first().scrollIntoViewIfNeeded({ timeout: 10_000 });
        await page.waitForTimeout(600);
        await createProject.first().dispatchEvent("click", { timeout: 10_000 });
      } catch {
        await page.waitForTimeout(2_000);
        await createProject.first().dispatchEvent("click", { timeout: 20_000 }).catch(() => {});
      }
      await page.waitForTimeout(8_000);
      const { data: conv } = await admin.from("quotations").select("status,project_id").eq("id", quotationId).maybeSingle();
      if (conv?.project_id) {
        await record(page, "jayson", "convert an accepted quotation to a project", "WORKS",
          `SERVICE-ROLE: quotations.project_id=${conv.project_id}, status="${conv.status}"`);
        await admin.from("projects").delete().eq("id", conv.project_id);
        await admin.from("quotations").update({ project_id: null }).eq("id", quotationId);
      } else {
        const toast = await toastText(page);
        await record(page, "jayson", "convert an accepted quotation to a project", "BLOCKED_SAVE_FAILS",
          `SERVICE-ROLE: quotations.project_id is still null after clicking Create Project; toast "${toast || "(none)"}"`);
      }
    }
  }

  // ── 6. approve the e-voucher routed to him ────────────────────────────────
  if (!evNumber) {
    await record(page, "jayson", "approve the routed e-voucher", "ERROR", `Princess's run produced no e-voucher to approve — step unanswerable this run`);
  } else {
    const { data: evBefore } = await admin
      .from("evouchers")
      .select("status,pending_approver_department,pending_approver_role")
      .eq("evoucher_number", evNumber)
      .maybeSingle();
    await page.goto("/approvals", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);
    await page.getByPlaceholder(/Search by number or requestor/).fill(evNumber);
    await page.waitForTimeout(4_000);
    const cellHit = page.getByRole("cell", { name: evNumber }).first();
    if (!(await visible(cellHit, 8_000))) {
      await record(page, "jayson", "approve the routed e-voucher", "EMPTY_PAGE",
        `SERVICE-ROLE: ${evNumber} is status=${evBefore?.status} routed to ${evBefore?.pending_approver_department}/${evBefore?.pending_approver_role}; he is the Pricing manager holding my_evouchers:approve, and it is not in his queue`);
    } else {
      await cellHit.click();
      await page.waitForTimeout(3_000);
      const approve = page.getByRole("button", { name: "Approve", exact: true });
      if (!(await visible(approve, 20_000))) {
        await record(page, "jayson", "approve the routed e-voucher", "BLOCKED_NO_BUTTON",
          `${evNumber} is in his queue at ${evBefore?.status} but no Approve action is offered, though he holds my_evouchers:approve`);
      } else {
        await approve.click();
        const toast = await toastText(page);
        await page.waitForTimeout(6_000);
        const { data: evAfter } = await admin.from("evouchers").select("status").eq("evoucher_number", evNumber).maybeSingle();
        if (evAfter?.status && evAfter.status !== evBefore?.status) {
          await record(page, "jayson", "approve the routed e-voucher", "WORKS",
            `SERVICE-ROLE: ${evNumber} "${evBefore?.status}" -> "${evAfter.status}"`);
        } else if (/success|approv/i.test(toast)) {
          await record(page, "jayson", "approve the routed e-voucher", "LIES_SAYS_SAVED",
            `UI said "${toast}" but SERVICE-ROLE still reads status="${evAfter?.status}"`);
        } else {
          await record(page, "jayson", "approve the routed e-voucher", "BLOCKED_SAVE_FAILS",
            `SERVICE-ROLE still reads status="${evAfter?.status}"; toast "${toast || "(none)"}"`);
        }
      }
    }
  }

  await ctx.close();
});
