import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// The abused flow — tier 3 + 5. Not an attacker. A person in a hurry.
//
// Every other pass in this effort tested somebody who understood the system:
// doing their job correctly (spine.spec.ts), or attacking it deliberately
// (adversary.spec.ts). This one tests the person who does NOT understand it, is
// late for a meeting, and is clicking through a form on a Tuesday afternoon.
//
// THE CENTRAL INVERSION: here, "it worked" is usually the finding. A date field
// that accepts "N/A" is a bug, because nothing complained. An amount field that
// accepts "1,500.00" and stores 1 is data loss with a smile on it. We are not
// collecting errors — we are finding the places where the system cheerfully
// accepts nonsense and writes it down.
//
// SO THE CHECK IS NEVER THE SCREEN. Every probe types something in the UI,
// saves, and then reads the row back with SERVICE-ROLE eyes, because:
//
//   K1  a policy-denied PostgREST SELECT returns HTTP 200 and an empty set, so
//       the actor's own read cannot tell "nothing there" from "not allowed".
//   K2  a write of a value the row already holds is a no-op that reads back as
//       success — every probe below writes a value the row does not hold.
//   K3  a failed sign-in reads as "blocked everywhere" and fabricates findings,
//       so beforeAll authenticates the whole cast and aborts on any failure.
//
// WRITES TO DEV. Every fixture row carries MISUSE_TAG and is deleted in
// afterAll, finding or no finding.
// ─────────────────────────────────────────────────────────────────────────────

const MISUSE_TAG = "E2E-MISUSE";
const PASSWORD = "devpassword123";
const DEV_REF = "oqermaidggvanahumjmj";

// The same cast as the spine, so a result here is directly comparable to the
// happy-path stage it abuses.
const OPS = "jr.supervisor07@falconslogistics-ph.com"; // Princess — raises the voucher
const PRICING_MGR = "jr.manager03@falconslogistics-ph.com"; // Jayson — routed approver
const TREASURY = "treasury@falconslogistics-ph.com"; // Janice — the cash exit

const VENDOR = "UTOC CORPORATION";
const EXPENSE_CATEGORY = "(EXP) FORWARDING";
const CATALOG_ITEM = "FC (OCEAN FREIGHT)";
const CATALOG_ITEM_ID = "ci-1779684041912"; // FC (OCEAN FREIGHT)

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
const SUPA_URL = ENV.VITE_SUPABASE_URL;
const admin = createClient(SUPA_URL, ENV.DEV_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── the fixture ──────────────────────────────────────────────────────────────
const stamp = Date.now();
const ID = {
  project: `prj-misuse-${stamp}`,
  booking: `bk-misuse-${stamp}`,
  evStale: `ev-misuse-${stamp}-stale`,
  evDeleted: `ev-misuse-${stamp}-del`,
  evDeep: `ev-misuse-${stamp}-deep`,
  evTabs: `ev-misuse-${stamp}-tabs`,
};
const PROJECT_NUMBER = `PRJ-MIS-${String(stamp).slice(-6)}`;
const BOOKING_NUMBER = `MIS${String(stamp).slice(-8)}`;
const people: Record<string, { id: string; name: string; department: string }> = {};

// Findings are collected rather than asserted one-by-one, because in this pass a
// green assertion and a red one are equally interesting — the report is the
// artifact, not the pass/fail.
type Cost =
  | "silent_corruption"
  | "data_loss"
  | "duplicate_money"
  | "blocked_work"
  | "cosmetic"
  | "none";
const log: { probe: string; typed: string; landed: string; cost: Cost }[] = [];
const record = (probe: string, typed: string, landed: string, cost: Cost) => {
  log.push({ probe, typed, landed, cost });
};

const signInButton = (page: Page) =>
  page.getByRole("button", { name: "Sign In", exact: true });

async function signIn(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await signInButton(page).click();
  await page.waitForFunction(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("sb-")),
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

test.beforeAll(async () => {
  if (!SUPA_URL?.includes(DEV_REF)) {
    throw new Error(`refusing to run: ${SUPA_URL} is not the dev project`);
  }

  // K3 — verify every login before using it. A dead password reads as "blocked
  // everywhere" and manufactures findings in bulk.
  const anon = () =>
    createClient(SUPA_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const dead: string[] = [];
  for (const email of [OPS, PRICING_MGR, TREASURY]) {
    const { error } = await anon().auth.signInWithPassword({ email, password: PASSWORD });
    if (error) dead.push(`${email}: ${error.message}`);
  }
  if (dead.length) throw new Error(`aborting — cannot sign in:\n${dead.join("\n")}`);

  const { data: rows } = await admin
    .from("users")
    .select("id, name, email, department")
    .in("email", [OPS, PRICING_MGR, TREASURY]);
  for (const email of [OPS, PRICING_MGR, TREASURY]) {
    const u = (rows ?? []).find((r) => r.email === email);
    if (!u) throw new Error(`fixture: no dev user for ${email}`);
    people[email] = { id: u.id, name: u.name, department: u.department };
  }

  await admin.from("projects").insert({
    id: ID.project,
    project_number: PROJECT_NUMBER,
    customer_name: `${MISUSE_TAG} CUSTOMER`,
    status: "Active",
    service_type: "Forwarding",
    created_by: people[PRICING_MGR].id,
  });
  await admin.from("bookings").insert({
    id: ID.booking,
    booking_number: BOOKING_NUMBER,
    name: `${MISUSE_TAG} ${stamp}`,
    service_type: "Forwarding",
    project_id: ID.project,
    customer_name: `${MISUSE_TAG} CUSTOMER`,
    status: "Created",
    created_by: people[PRICING_MGR].id,
  });

  // Vouchers parked at the states the stale-page probes need. All raised BY the
  // Ops TL and routed TO Pricing, exactly as the live routing rule does for a
  // Forwarding-booking expense (finding E12).
  const voucher = (id: string, status: string) => ({
    id,
    transaction_type: "reimbursement",
    amount: 5000,
    currency: "PHP",
    status,
    project_number: PROJECT_NUMBER,
    booking_id: ID.booking,
    vendor_name: `${MISUSE_TAG} VENDOR`,
    purpose: `${MISUSE_TAG} ${id}`,
    created_by: people[OPS].id,
    created_by_name: people[OPS].name,
    pending_approver_department: "Pricing",
    pending_approver_role: "manager",
    details: {
      requestor_id: people[OPS].id,
      requestor_name: people[OPS].name,
      requestor_department: people[OPS].department,
    },
  });
  await admin.from("evouchers").insert([
    voucher(ID.evStale, "pending_manager"),
    voucher(ID.evDeleted, "pending_manager"),
    voucher(ID.evDeep, "pending_manager"),
    voucher(ID.evTabs, "pending_manager"),
  ]);
  await admin.from("evoucher_line_items").insert(
    [ID.evStale, ID.evDeleted, ID.evDeep, ID.evTabs].map((evoucher_id) => ({
      evoucher_id,
      description: `${MISUSE_TAG} LINE`,
      amount: 5000,
      booking_id: ID.booking,
      catalog_item_id: CATALOG_ITEM_ID,
    })),
  );
});

test.afterAll(async () => {
  // Child-first: these FKs are ON DELETE SET NULL, so a parent delete orphans
  // rather than removes (finding L2 / M2 — the very thing this pass exercises).
  const mine = [ID.evStale, ID.evDeleted, ID.evDeep, ID.evTabs];
  // Anything the UI probes raised. Cannot be found by booking_id (L1), so it is
  // swept by requestor + this run's window, the same handle the readbacks use.
  const { data: strays } = await admin
    .from("evouchers")
    .select("id")
    .eq("created_by", people[OPS]?.id ?? "none")
    .gte("created_at", RUN_START);
  const all = Array.from(new Set([...mine, ...(strays ?? []).map((s) => s.id)]));

  await admin.from("evoucher_history").delete().in("evoucher_id", all);
  await admin.from("evoucher_line_items").delete().in("evoucher_id", all);
  await admin.from("evouchers").delete().in("id", all);
  await admin.from("collections").delete().eq("booking_id", ID.booking);
  await admin.from("billing_line_items").delete().eq("booking_id", ID.booking);
  await admin.from("invoices").delete().eq("booking_id", ID.booking);
  await admin.from("bookings").delete().eq("id", ID.booking);
  await admin.from("projects").delete().eq("id", ID.project);

  const w = Math.max(...log.map((l) => l.probe.length), 10);
  console.log(
    `\n── misuse findings ──\n${log
      .map(
        (l) =>
          `  ${l.cost === "none" ? "·" : "!"} ${l.probe.padEnd(w)}  typed=${JSON.stringify(
            l.typed,
          )}  landed=${JSON.stringify(l.landed)}  [${l.cost}]`,
      )
      .join("\n")}\n`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The form. Filling it is fifteen interactions across four different widget
// idioms, which is exactly why a real person clicks Submit before it is ready
// and hits Enter hoping something happens.
// ─────────────────────────────────────────────────────────────────────────────

async function openVoucherForm(page: Page) {
  await page.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "New Request" }).click();
  await expect(page.getByRole("heading", { name: "Reimbursement Request" })).toBeVisible({
    timeout: 20_000,
  });
}

/** Everything except the amount, which each probe supplies itself. */
async function fillVoucherExceptAmount(page: Page) {
  await page.getByRole("button", { name: "Paid To (Vendor)" }).click();
  await page.getByPlaceholder("Search registered vendors...").fill("UTOC");
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: VENDOR, exact: true }).click({ timeout: 20_000 });
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByPlaceholder("Search or type category name...").fill("FORWARDING");
  await page.waitForTimeout(1_000);
  await page
    .getByRole("button", { name: EXPENSE_CATEGORY, exact: true })
    .click({ timeout: 20_000 });
  await page.waitForTimeout(800);

  const item = page.getByPlaceholder("Select or type item...").first();
  await item.click();
  await item.fill("OCEAN");
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: CATALOG_ITEM, exact: true }).click({ timeout: 20_000 });
  await page.waitForTimeout(500);

  // D2 — the line must name a booking, and that link is also what the routing
  // engine reads to decide who approves.
  await page.getByRole("button", { name: "Line item booking" }).click();
  await page.getByPlaceholder("Search bookings…").fill(BOOKING_NUMBER);
  await page.waitForTimeout(1_500);
  await page
    .getByRole("button", { name: new RegExp(BOOKING_NUMBER) })
    .first()
    .click({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

const amountInput = (page: Page) => page.getByPlaceholder("0.00").first();

/** Every voucher this run's UI probes created, newest first.
 *
 *  NOT keyed on `booking_id`: finding L1 is live — the e-voucher writer stopped
 *  populating the HEADER booking_id, so a voucher raised through the form has
 *  NULL there even though its line carries the link. Keyed on the requestor and
 *  this run's start instead, which is the only handle that survives L1. */
const RUN_START = new Date().toISOString();
async function vouchersRaisedHere() {
  const { data, error } = await admin
    .from("evouchers")
    .select("id, status, amount, transaction_type, purpose, booking_id, created_at, details")
    .eq("created_by", people[OPS].id)
    .gte("created_at", RUN_START)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`service-role readback failed: ${error.message}`);
  // K2's cousin. The fixture vouchers are ALSO created_by the Ops TL and are
  // ALSO inserted after RUN_START, so the window alone counts them — which is
  // how an earlier version of this file reported "5 vouchers from 3 clicks"
  // when the truth was 4 fixtures plus one. Exclude them explicitly.
  const fixture = new Set([ID.evStale, ID.evDeleted, ID.evDeep, ID.evTabs]);
  return (data ?? []).filter((r) => !fixture.has(r.id));
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. THE DOUBLE-CLICK. The single most human thing anybody does to a slow form.
// ═════════════════════════════════════════════════════════════════════════════

test("1 — triple-clicking Submit Request", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, OPS);

  await openVoucherForm(page);
  await fillVoucherExceptAmount(page);
  await amountInput(page).fill("1500");

  const submit = page.getByRole("button", { name: "Submit Request" });
  await expect(submit).toBeEnabled({ timeout: 15_000 });

  // Three clicks, 40ms apart. Playwright checks actionability once, then sends
  // three real down/up pairs — which is precisely what an impatient person's
  // mouse does, and precisely what a `disabled` attribute set by an async
  // setState cannot catch.
  // (a) THE HUMAN VERSION. Three real down/up pairs, 40ms apart, from one
  //     impatient hand. Playwright checks actionability once and then sends all
  //     three, which is exactly what a mouse does.
  await submit.click({ clickCount: 3, delay: 40 });
  await page.waitForTimeout(18_000);

  const human = await vouchersRaisedHere();
  const numbers = await admin
    .from("evouchers")
    .select("evoucher_number, amount, status")
    .in("id", human.map((r) => r.id));

  record(
    "1a triple-click Submit Request (real mouse, 40ms apart)",
    "one voucher for PHP 1,500",
    `${human.length} voucher row(s) at PHP ${human[0]?.amount}, status ${human[0]?.status}: ` +
      `${(numbers.data ?? []).map((n) => n.evoucher_number).join(", ")}`,
    human.length > 1 ? "duplicate_money" : "none",
  );
  // HELD. The modal unmounts on the first success, so clicks two and three land
  // on nothing. It is guarded by the close, not by the button — but it is
  // guarded, and that is the result.
  expect(human.length, "a triple-click duplicated the voucher").toBe(1);

  await page.screenshot({ path: "docs/qa/misuse-double-submit.png", fullPage: true });

  // (b) THE HARDER VERSION, and the one the guard above does not cover: three
  //     click events in a SINGLE tick, so React never gets to re-render, never
  //     sets `disabled`, and never unmounts the modal between them. This is what
  //     a genuinely laggy machine approximates, and it is the shape the API-level
  //     double-submit finding predicted.
  await openVoucherForm(page);
  await fillVoucherExceptAmount(page);
  await amountInput(page).fill("2500");
  const submit2 = page.getByRole("button", { name: "Submit Request" });
  await expect(submit2).toBeEnabled({ timeout: 15_000 });

  const baseline = (await vouchersRaisedHere()).length;
  await submit2.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
    el.click();
  });
  await page.waitForTimeout(18_000);

  void baseline;
  // Count the PHP 2,500 vouchers directly rather than differencing two window
  // reads — an insert still in flight when the baseline was taken makes the
  // difference disagree with the list, and a finding whose own two numbers
  // disagree is not a finding anybody will act on.
  const dupes = await admin
    .from("evouchers")
    .select("evoucher_number, amount, status")
    .eq("created_by", people[OPS].id)
    .eq("amount", 2500)
    .gte("created_at", RUN_START);
  const sameTick = (dupes.data ?? []).length;

  record(
    "1b three click events in one tick (no re-render between them)",
    "one voucher for PHP 2,500",
    `${sameTick} voucher row(s) created: ${(dupes.data ?? [])
      .map((d) => `${d.evoucher_number}@${d.amount}/${d.status}`)
      .join(", ")}`,
    sameTick > 1 ? "duplicate_money" : "none",
  );

  // CURRENT TRUTH, NOT DESIRED TRUTH. `busy = isSaving || isUploading`, and
  // isSaving is react-query's isPending — which only becomes true after
  // handleSubmit has awaited the attachment upload, i.e. at least two async hops
  // after the click that should have disabled the button. Nothing between the
  // click and the INSERT is idempotent. If this ever goes RED, the fix landed:
  // change it to toBe(1) and strike the finding, do not loosen it.
  expect(
    sameTick,
    "same-tick multi-click no longer duplicates the voucher — fix confirmed, update this expectation",
  ).toBeGreaterThan(1);

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. THE AMOUNT FIELD. type="number", and the handler is
//    `parseFloat(e.target.value) || 0`. Three things a person types on a
//    Tuesday, and what each of them becomes.
// ═════════════════════════════════════════════════════════════════════════════

test("2 — what the amount field accepts", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, OPS);

  await openVoucherForm(page);
  await fillVoucherExceptAmount(page);

  const amt = amountInput(page);

  // The displayed value IS the stored state — the input renders
  // `value={item.amount || ""}` — so the DOM read here is a read of what would
  // be persisted, not a cosmetic check.
  const typeAndRead = async (text: string) => {
    await amt.fill("");
    await amt.pressSequentially(text, { delay: 30 });
    await page.waitForTimeout(400);
    return (await amt.inputValue()) || "(empty)";
  };

  // The one everybody predicts will break. It does not: type="number" makes the
  // browser discard the separator before React ever sees it, so parseFloat gets
  // a clean string. Recorded as evidence, because "handled correctly" is a
  // result too.
  const comma = await typeAndRead("1,500.00");
  record(
    "2a amount with thousands separator",
    "1,500.00",
    comma,
    Number(comma) === 1500 ? "none" : "silent_corruption",
  );

  // Nonsense in an amount field. Also refused by the input type, and the empty
  // string falls through `parseFloat(...) || 0` to a clean zero.
  const words = await typeAndRead("N/A");
  record("2b non-numeric amount", "N/A", words, words === "(empty)" ? "none" : "silent_corruption");

  // Type a value, delete it, save empty — the classic "changed my mind" that
  // leaves a form in a state no validator was written for. Here it is held:
  // an empty amount is 0, and 0 fails isFormValid.
  await amt.fill("2500");
  await page.waitForTimeout(300);
  await amt.fill("");
  await page.waitForTimeout(500);
  const submit = page.getByRole("button", { name: "Submit Request" });
  const enabledOnEmpty = await submit.isEnabled();
  record(
    "2c typed 2500, deleted it, tried to submit empty",
    "(empty)",
    enabledOnEmpty ? "Submit ENABLED on an empty amount" : "Submit stayed disabled",
    enabledOnEmpty ? "silent_corruption" : "none",
  );
  expect(enabledOnEmpty, "an empty amount can be submitted").toBe(false);

  // NEGATIVE. The one the input type does NOT stop — `-` is a legal character in
  // a number field, and nothing downstream disagrees. This is the probe that has
  // to reach the database, because a negative expense line is not a display
  // quirk: it is a credit raised on the AP chain by somebody who meant to type a
  // minus in a spreadsheet.
  const negative = await typeAndRead("-500");
  const submitNeg = page.getByRole("button", { name: "Submit Request" });
  const negSubmittable = await submitNeg.isEnabled();
  let landed = `form state ${negative}; Submit ${negSubmittable ? "enabled" : "disabled"}`;
  if (negSubmittable) {
    await submitNeg.click();
    await page.waitForTimeout(12_000);
    const rows = await vouchersRaisedHere();
    const lines = await admin
      .from("evoucher_line_items")
      .select("amount")
      .in("evoucher_id", rows.map((r) => r.id));
    landed =
      rows.length > 0
        ? `voucher ${rows[0].status} with header amount ${rows[0].amount}, line amounts ${(
            lines.data ?? []
          )
            .map((l) => l.amount)
            .join("/")}`
        : "refused — no voucher created";
  }
  record("2d negative amount, submitted", "-500", landed, negSubmittable ? "silent_corruption" : "none");

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ENTER, AND SUBMITTING BEFORE THE DROPDOWN IS READY. Two different ways of
//    telling a form "go" before it has anything to go on.
// ═════════════════════════════════════════════════════════════════════════════

test("3 — Enter key, and Submit before the form is ready", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, OPS);

  await openVoucherForm(page);

  // Submit with nothing filled at all. The button is inside `<form
  // onSubmit={handleSubmit}>`, so the question is whether the DISABLED state is
  // the only thing standing between an empty form and an insert.
  const submit = page.getByRole("button", { name: "Submit Request" });
  const enabledEmpty = await submit.isEnabled();
  record(
    "3a Submit on a completely empty form",
    "nothing",
    enabledEmpty ? "Submit ENABLED with no vendor, no line, no amount" : "Submit disabled",
    enabledEmpty ? "blocked_work" : "none",
  );

  // Enter inside a text field of a <form> is a native submit. If the form is
  // half-filled, that is a person pressing Enter to "confirm" the vendor search
  // and getting an insert instead.
  await fillVoucherExceptAmount(page);
  await amountInput(page).fill("1500");
  await page.waitForTimeout(500);

  const before = (await vouchersRaisedHere()).length;
  await page.getByPlaceholder("Optional description").first().press("Enter");
  await page.waitForTimeout(8_000);
  const after = (await vouchersRaisedHere()).length;
  const stillOpen = await page
    .getByRole("heading", { name: "Reimbursement Request" })
    .isVisible()
    .catch(() => false);

  let landed =
    after > before
      ? `submitted the voucher (${after - before} row created); form ${stillOpen ? "STILL OPEN, looking unsaved" : "closed"}`
      : `nothing submitted; form ${stillOpen ? "still open" : "closed"}`;

  // And this is the part that turns a stray keystroke into money. Enter fired a
  // native form submit, the voucher went to the approver — and the panel stayed
  // open with every field still filled in, giving her no reason to think
  // anything happened. So she does the only sensible thing and clicks Submit.
  if (after > before && stillOpen) {
    const submitBtn = page.getByRole("button", { name: "Submit Request" });
    if (await submitBtn.isEnabled().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(12_000);
      const total = (await vouchersRaisedHere()).length - before;
      const rows = await vouchersRaisedHere();
      landed += `; she then clicked Submit and the total became ${total} voucher(s) — ${rows
        .slice(0, 3)
        .map((r) => `${r.amount}@${r.status}`)
        .join(", ")}`;
    }
  }

  record("3b Enter in the description field", "Enter", landed, after > before ? "duplicate_money" : "none");

  // DELIBERATELY NOT ASSERTED — this one is not reproducible, and half a finding
  // is worse than none. The Submit button is `type=submit` inside `<form
  // onSubmit={handleSubmit}>`, so Enter in any text input of that form IS a
  // native submit, and one full-suite run recorded exactly that: a row created,
  // the panel still open with every field filled, no toast. Two isolated runs of
  // this same probe recorded nothing at all. Either the keystroke races the
  // combobox that owns focus, or the extra row in that run came from elsewhere
  // in the window and this probe attributed it. Recorded as an open question
  // rather than a finding — see `unmeasured` in the report.
  expect(
    stillOpen,
    "the panel closed on Enter, which would at least tell her something happened",
  ).toBe(true);

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. CHANGING THE TRANSACTION TYPE LAST. Fill the whole thing — vendor, catalog
//    lines, amounts — then change what kind of voucher it is, the way somebody
//    does when they realise halfway down that this was a cash advance.
//    Do the lines survive? Do they now belong to the wrong catalog side?
// ═════════════════════════════════════════════════════════════════════════════

test("4 — change the Transaction Type at the very end", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, OPS);

  await openVoucherForm(page);
  await fillVoucherExceptAmount(page);
  await amountInput(page).fill("1500");
  await page.waitForTimeout(500);

  const lineBefore = await page.getByPlaceholder("Select or type item...").first().inputValue();
  const amountBefore = await amountInput(page).inputValue();

  // The Transaction Type control is a CustomDropdown (portalled to body,
  // position:fixed), NOT a native <select>. An earlier version of this probe
  // called selectOption() on `locator("select")`, which matched nothing, threw
  // into a .catch(), and reported "the lines survived" — a K1-shaped false pass
  // measuring an interaction that never happened. Drive it the way a person
  // does: click the trigger, click the label.
  const CASH_ADVANCE = "Cash Advances – Project and Office Expense";
  const REIMBURSEMENT = "Reimbursement – Project and Office Expense";
  await page.getByRole("button", { name: REIMBURSEMENT }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await page.getByText(CASH_ADVANCE, { exact: true }).last().click({ timeout: 20_000 });
  await page.waitForTimeout(2_500);

  // Prove the switch actually took before believing anything about the lines —
  // the panel title follows the type.
  await expect(
    page.getByRole("heading", { name: "Cash Advance Request" }),
    "the Transaction Type change did not take — this probe would otherwise measure nothing",
  ).toBeVisible({ timeout: 20_000 });

  const lineAfter = await page
    .getByPlaceholder("Select or type item...")
    .first()
    .inputValue()
    .catch(() => "(line gone)");
  const amountAfter = await amountInput(page)
    .inputValue()
    .catch(() => "(gone)");

  // Then send it. The question the person's mistake actually raises is not
  // cosmetic: a reimbursement is money already spent, settled at disburse; a
  // cash advance is money handed over BEFORE the expense exists and parked in
  // liquidation. Same lines, same amounts, opposite direction of trust.
  let landed = `line=${lineAfter || "(empty)"} amount=${amountAfter || "(empty)"}`;
  const submit = page.getByRole("button", { name: "Submit Request" });
  if (await submit.isEnabled().catch(() => false)) {
    await submit.click();
    await page.waitForTimeout(14_000);
    // Scope to the voucher THIS probe just raised. Reading the lines of every
    // voucher the run has created reports "5 line(s)" for a one-line form —
    // another way for a wide readback to invent a finding.
    const rows = await vouchersRaisedHere();
    const lines = await admin
      .from("evoucher_line_items")
      .select("description, amount, catalog_item_id, booking_id")
      .eq("evoucher_id", rows[0]?.id ?? "none");
    const l = lines.data ?? [];
    landed +=
      `; saved as ${rows[0]?.transaction_type} at ${rows[0]?.status}` +
      `, header amount ${rows[0]?.amount}` +
      `, ${l.length} line(s): ${l
        .map((x) => `${x.description || "(no description)"}=${x.amount}/cat=${x.catalog_item_id ?? "NULL"}/bk=${x.booking_id ?? "NULL"}`)
        .join(" | ")}`;
  } else {
    landed += "; Submit disabled after the switch";
  }

  // The line survives the switch with its amount, its catalog_item_id and its
  // booking intact — the doctrine holds across the type change. What is NOT
  // benign is that the switch is silent in the other direction: the voucher
  // changed from "money already spent" to "money handed over in advance" with no
  // confirmation, no re-validation, and no visible line item afterwards (the
  // catalog combobox is not rendered for a cash advance, so she cannot see what
  // she is advancing against).
  const lineSurvived = /cat=ci-/.test(landed) && /bk=bk-/.test(landed);
  record(
    "4 Transaction Type changed after the lines were filled",
    `${lineBefore} @ ${amountBefore}, filled as a Reimbursement`,
    landed,
    lineSurvived ? (lineAfter === "(line gone)" ? "cosmetic" : "none") : "data_loss",
  );
  expect(lineSurvived, "the catalog line lost its item or its booking on a type switch").toBe(true);

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. REFRESH MID-FORM. Fifteen interactions in, the browser reloads — a stray
//    F5, a Vite HMR, a laptop waking up. Is the draft kept or gone?
// ═════════════════════════════════════════════════════════════════════════════

test("5 — refresh mid-form", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, OPS);

  await openVoucherForm(page);
  await fillVoucherExceptAmount(page);
  await amountInput(page).fill("1500");
  await page.waitForTimeout(1_000);

  // Count BEFORE, so an earlier probe's voucher cannot be mistaken for a draft
  // this refresh saved. (It was: the first version of this probe compared
  // against the whole run's window and reported "a draft was persisted" for a
  // row probe 4 had created.)
  const before = (await vouchersRaisedHere()).length;

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8_000);

  const formStillOpen = await page
    .getByRole("heading", { name: /Reimbursement Request|Cash Advance Request/ })
    .isVisible()
    .catch(() => false);
  const after = (await vouchersRaisedHere()).length;
  const draftSaved = after > before;

  record(
    "5 refresh with a fully filled form",
    "vendor + catalog line + booking + PHP 1,500, fifteen interactions in",
    formStillOpen
      ? "form reopened with the work intact"
      : draftSaved
        ? "form closed but a draft was persisted"
        : "form closed, nothing persisted — every field is gone and nothing warned her",
    formStillOpen || draftSaved ? "none" : "data_loss",
  );
  expect(
    formStillOpen || draftSaved,
    "a refresh silently discards a completely filled voucher — fix confirmed if this now passes",
  ).toBe(false);

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. TWO TABS, ONE RECORD. Not a race a test invented — the way it actually
//    happens is somebody opens the record twice because the first tab was slow.
//    M3 proved the details JSONB loses updates at the API. This asks the
//    question that matters to the person: is the loser told anything at all?
// ═════════════════════════════════════════════════════════════════════════════

test("6 — two tabs on the same voucher, both saved", async () => {
  test.setTimeout(120_000);

  const anonClient = () =>
    createClient(SUPA_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const tabA = anonClient();
  const tabB = anonClient();
  for (const c of [tabA, tabB]) {
    const { error } = await c.auth.signInWithPassword({ email: OPS, password: PASSWORD });
    expect(error, "sign-in for the two-tab probe failed").toBeNull();
  }

  // Both tabs load the record — the read-modify-write the app performs on every
  // `details` edit.
  const read = async (c: ReturnType<typeof anonClient>) =>
    (await c.from("evouchers").select("details").eq("id", ID.evTabs).maybeSingle()).data
      ?.details as Record<string, unknown> | null;

  const aSnapshot = await read(tabA);
  const bSnapshot = await read(tabB);

  // K2 — both writes set a field the row does not already hold, so neither can
  // read back as success by accident.
  const { error: aErr } = await tabA
    .from("evouchers")
    .update({ details: { ...aSnapshot, tab_a_note: `${MISUSE_TAG} A` } })
    .eq("id", ID.evTabs);
  const { error: bErr } = await tabB
    .from("evouchers")
    .update({ details: { ...bSnapshot, tab_b_note: `${MISUSE_TAG} B` } })
    .eq("id", ID.evTabs);

  const { data: final } = await admin
    .from("evouchers")
    .select("details")
    .eq("id", ID.evTabs)
    .maybeSingle();
  const d = (final?.details ?? {}) as Record<string, unknown>;
  const survived = [d.tab_a_note ? "A" : null, d.tab_b_note ? "B" : null].filter(Boolean);

  record(
    "6 two tabs edit the same voucher",
    "tab A adds a note, tab B adds a different note, both click Save",
    `${survived.join(" + ") || "neither"} survived; tab A error=${aErr ? aErr.message : "none"}, tab B error=${bErr ? bErr.message : "none"}`,
    survived.length === 2 ? "none" : !aErr && !bErr ? "silent_corruption" : "cosmetic",
  );

  // CURRENT TRUTH. The loser's edit is gone and the loser was told nothing: both
  // updates returned success, because `details` is written whole (fetch, spread,
  // update) rather than with a server-side jsonb_set or an optimistic-lock
  // predicate. This is M3's lost-update finding as the user experiences it —
  // she typed it, she saw "Saved", and it is not there.
  expect(survived.length, "both tabs' edits survived — fix confirmed, update this expectation").toBe(1);
  expect(aErr, "the losing tab was warned").toBeNull();
  expect(bErr).toBeNull();
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. DEEP-LINKING STRAIGHT TO THE CASH. /evouchers/:id/disburse is a real route.
//    A person who bookmarked it, or pasted it from a colleague, arrives without
//    ever passing the queue that decides whether this voucher is disbursable.
// ═════════════════════════════════════════════════════════════════════════════

test("7 — deep-link to the disburse page for a voucher that is not disbursable", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, TREASURY);

  // evDeep sits at pending_manager — two approvals away from any cash leaving.
  await page.goto(`/evouchers/${ID.evDeep}/disburse`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10_000);

  const onDisbursePage = await page
    .getByRole("heading", { name: "Disbursement Details" })
    .isVisible()
    .catch(() => false);

  // Record where she actually ended up. "Refused" and "still loading" look
  // identical from a negative assertion, so the URL is the evidence.
  // Quote the refusal. "Refused" and "still loading" look identical from a
  // negative assertion, so the message on screen is the evidence — and here it
  // is the best message in the product: it names the state and offers the way
  // back, which is exactly what the person who pasted the link needs.
  const refusal = await page
    .getByText(/not pending disbursement/i)
    .first()
    .innerText()
    .catch(() => "");
  let outcome = onDisbursePage
    ? "the disburse page rendered"
    : `refused with: "${refusal.replace(/\s+/g, " ") || `(no message; landed on ${new URL(page.url()).pathname})`}"`;

  if (onDisbursePage) {
    await page.selectOption("#disb-method", "Cash").catch(() => {});
    await page.waitForTimeout(800);
    const confirm = page.getByRole("button", { name: /Disburse & Close|Confirm Disbursement/ });
    if (await confirm.isVisible().catch(() => false)) {
      const enabled = await confirm.isEnabled();
      outcome += `; confirm ${enabled ? "ENABLED" : "disabled"}`;
      if (enabled) {
        await confirm.click();
        await page.waitForTimeout(8_000);
      }
    } else {
      outcome += "; no confirm action offered";
    }
  }

  const { data: after } = await admin
    .from("evouchers")
    .select("status")
    .eq("id", ID.evDeep)
    .maybeSingle();

  record(
    "7 deep-link to disburse, skipping the queue",
    `/evouchers/<id>/disburse for a pending_manager voucher`,
    `${outcome}; status is now ${after?.status}`,
    after?.status !== "pending_manager" ? "duplicate_money" : onDisbursePage ? "cosmetic" : "none",
  );

  expect(
    after?.status,
    "a deep link disbursed a voucher that had not been approved by anyone",
  ).toBe("pending_manager");

  await page.screenshot({ path: "docs/qa/misuse-deeplink-disburse.png", fullPage: true });
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. THE RECORD MOVED UNDER THEM. Open a voucher, go make coffee, and while the
//    tab sits there somebody else approves it. Then act on the stale page.
// ═════════════════════════════════════════════════════════════════════════════

test("8 — the status advances underneath an open page", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, PRICING_MGR);

  // The queue's search box says "by number or requestor" and means it — it does
  // NOT match the purpose. Searching for the tag found nothing, and the first
  // version of this probe swallowed the failed click in a .catch() and then
  // reported "Approve is not offered" as a clean result. Look the number up.
  const { data: stale } = await admin
    .from("evouchers")
    .select("evoucher_number")
    .eq("id", ID.evStale)
    .maybeSingle();
  const staleNumber = stale?.evoucher_number as string;
  expect(staleNumber, "the fixture voucher never got a number").toMatch(/^EV-/);

  await page.goto("/approvals", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder(/Search by number or requestor/).fill(staleNumber);
  await page.waitForTimeout(4_000);

  const target = page.getByRole("cell", { name: staleNumber }).first();
  await target.click({ timeout: 30_000 });
  await page.waitForTimeout(3_000);

  // PROVE THE PANEL IS ACTUALLY OPEN AND ARMED before disturbing anything. If it
  // is not, "Approve is not offered" afterwards measures nothing at all — the
  // K1 shape, where an unanswerable probe reads as a clean result.
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await expect(
    approve,
    "the approval panel never opened — this probe would otherwise report a false all-clear",
  ).toBeVisible({ timeout: 25_000 });

  // Now somebody else moves it while this tab sits open, exactly as it happens
  // when a colleague works the same queue.
  await admin.from("evouchers").update({ status: "pending_ceo" }).eq("id", ID.evStale);
  await page.waitForTimeout(3_000);

  const stillOffered = await approve.isVisible().catch(() => false);
  let outcome = stillOffered
    ? "the stale page still offers Approve"
    : "the panel withdrew Approve on its own";
  if (stillOffered) {
    await approve.click();
    // POLL for the toast rather than reading once after eight seconds — sonner
    // auto-dismisses, and a single late read cannot tell "said nothing" from
    // "said something and it faded". That distinction is the whole finding.
    let toast = "";
    for (let i = 0; i < 25 && !toast; i++) {
      toast = await page
        .locator("[data-sonner-toast], [role=status]")
        .first()
        .innerText()
        .catch(() => "");
      if (!toast) await page.waitForTimeout(400);
    }
    await page.waitForTimeout(6_000);
    outcome += `; clicking it said: ${toast.replace(/\s+/g, " ").slice(0, 140) || "(nothing at all)"}`;
    await page.screenshot({ path: "docs/qa/misuse-stale-approve.png", fullPage: true });
  }

  const { data: after } = await admin
    .from("evouchers")
    .select("status")
    .eq("id", ID.evStale)
    .maybeSingle();
  record(
    "8 status advanced underneath the open page",
    "approve a voucher that moved to pending_ceo while the tab was open",
    `${outcome}; final status ${after?.status}`,
    after?.status === "pending_accounting"
      ? "duplicate_money"
      : /Approved/i.test(outcome)
        ? "silent_corruption"
        : "none",
  );
  // The double-approval race M3 recorded at the API does NOT reproduce through
  // the UI: the transition is validated as an (from, to, actor) triple, so the
  // second approver's click cannot re-run the hop that already happened.
  expect(
    after?.status,
    "a stale page re-ran an approval that had already been performed",
  ).not.toBe("pending_accounting");

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. THE RECORD VANISHED UNDER THEM. Findings M2/L2 — a booking delete orphans
//    nine money rows silently. This is the same event seen from the desk of the
//    person whose tab was open when it happened.
// ═════════════════════════════════════════════════════════════════════════════

test("9 — the record is deleted underneath an open page", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const page = await signIn(ctx, OPS);

  await page.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder(/Search by voucher number/).fill(MISUSE_TAG);
  await page.waitForTimeout(4_000);

  // DataTable renders every row twice — a desktop table and a hidden mobile card
  // list (finding E13) — so a raw count is doubled. That is fine here; only the
  // before/after comparison matters.
  const ghost = page.getByText(new RegExp(`${MISUSE_TAG}.*del`));
  const listedBefore = await ghost.count();
  expect(listedBefore, "the voucher was never on screen — nothing to delete out from under").toBeGreaterThan(0);

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // Service-role removes it out from under her — the M2 shape, seen from the
  // desk of the person whose tab was open when it happened.
  await admin.from("evoucher_line_items").delete().eq("evoucher_id", ID.evDeleted);
  await admin.from("evouchers").delete().eq("id", ID.evDeleted);
  await page.waitForTimeout(4_000);

  const listedAfter = await ghost.count();

  // Then act on the ghost. This is the part that decides whether the stale row
  // is merely untidy or actively misleading: does clicking a record that no
  // longer exists say so, or does it open an empty detail view she will read as
  // the real thing?
  let clickOutcome = "not attempted — the row is gone";
  if (listedAfter > 0) {
    await ghost.first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(5_000);
    const toast = await page
      .locator("[data-sonner-toast], [role=status]")
      .first()
      .innerText()
      .catch(() => "");
    const panelOpen = await page
      .getByRole("button", { name: /Approve|Submit|Delete/ })
      .first()
      .isVisible()
      .catch(() => false);
    clickOutcome = toast
      ? `clicking it said: ${toast.replace(/\s+/g, " ").slice(0, 140)}`
      : panelOpen
        ? "clicking it opened a detail panel for a row that no longer exists, with no warning"
        : "clicking it did nothing at all";
  }

  record(
    "9 the voucher is deleted while the list is open",
    "a voucher the list is currently showing",
    `still listed after the delete: ${listedAfter > 0 ? "yes" : "no"} (${listedBefore} → ${listedAfter} rendered nodes, no refresh); ` +
      `${clickOutcome}; uncaught page errors: ${pageErrors.length || "none"}`,
    listedAfter > 0 ? "cosmetic" : "none",
  );
  // No crash, no white screen — the list simply does not know. Recorded rather
  // than asserted as a failure: it is the mildest possible expression of M2, and
  // the severe half of M2 (nine orphaned money rows) is a schema problem this
  // page cannot fix.
  expect(pageErrors, "deleting a record underneath an open list crashed the page").toHaveLength(0);

  await page.screenshot({ path: "docs/qa/misuse-deleted-underneath.png", fullPage: true });
  await ctx.close();
});
