import { test, expect, Page, BrowserContext, Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// TIER 4 — THE WORLD INTERFERING.
//
// Every other pass in this effort tested a PERSON: the one doing their job, or
// the one attacking on purpose. This one tests the CONDITIONS they work under —
// the wifi that drops in the middle of a save, the second tab that is open
// because two dispatchers share one login, the refresh at the wrong moment, the
// 1366x768 laptop, the server that answers 500.
//
// THE CENTRAL INVERSION: here, "it worked" is usually the finding. A save that
// errors loudly under a dead network is CORRECT. A save that says "Inquiry
// created." with no row behind it is the worst outcome in the document, and the
// app's fire-and-forget write pattern (`void recordNotificationEvent(...)`,
// `createWorkflowTicket(...).catch(console.error)`) is exactly the shape that
// produces it.
//
// SO THE CHECK IS NEVER THE SCREEN (K1). Every scenario below ends with a
// SERVICE-ROLE read of the row and a comparison against what was typed. A toast
// is not evidence; an HTTP 200 is not evidence; the row is.
//
// THE TARGET. One form carries most of this: BD → Create Inquiry → Project
// Inquiry. It is short enough to refill ten times, it writes one identifiable
// row (`quotations.quotation_name`), and its save path is representative of the
// whole product — one awaited insert whose error is caught and toasted, followed
// by two un-awaited writes whose errors are not. What is true of this form's
// behaviour under a broken network is true of the e-voucher and the invoice too,
// because they are written the same way.
//
// WRITES TO DEV. Every row created carries E2E-MISUSE in `quotation_name` and is
// deleted in afterAll, pass or fail.
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-MISUSE";
const PASSWORD = "devpassword123";
// NOT under test-results/. Playwright wipes that directory at the start of every
// run, and this pass shared a machine with another agent running its own specs —
// the evidence for scenario 8 was deleted twice by somebody else's `npx
// playwright test` before it could be read.
const SHOTS = "docs/qa/misuse-shots";

// The BD originator. Verified sign-in before anything else (K3) — a dead
// password reads as "blocked everywhere" and fabricates findings.
const BD = "jr.businessdev02@falconslogistics-ph.com";

// Real rows in dev, chosen rather than "whatever is first", so a failure means
// the flow broke and not that a picker returned something unexpected.
const CUSTOMER = "FREIGHT CARE LOGISTICS";
const CONTACT = "FAJNA FAJNA";

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
  | "data_loss" //        their work vanished
  | "duplicate_money" //  two records where there should be one
  | "blocked_work" //     a legitimate action they could not complete
  | "cosmetic" //         ugly but harmless
  | "none"; //            handled correctly — evidence too

const results: { scenario: string; typed: string; landed: string; cost: Cost }[] = [];

function record(scenario: string, typed: string, landed: string, cost: Cost) {
  results.push({ scenario, typed, landed, cost });
  console.log(`\n[${cost.toUpperCase()}] ${scenario}\n    typed  : ${typed}\n    landed : ${landed}`);
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
}

// ── what the user was actually told ──────────────────────────────────────────
// THE FIRST VERSION OF THIS READ THE TOAST AT THE END OF THE WAIT, and every
// scenario came back "(no toast)" — including the control save, which definitely
// toasts "Inquiry created.". Sonner dismisses after ~4s; the read happened at
// 10s. "No error was shown" was a property of the harness, not the product, and
// it is exactly the K1 mistake in a new costume: absence of evidence recorded as
// evidence of absence.
//
// So the toasts are RECORDED AS THEY APPEAR, by a poller installed in the page
// before the click, and read back afterwards. The success toast and the error
// toast are the same element — telling them apart is the whole point.
async function watchToasts(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__toastTimer) clearInterval(w.__toastTimer);
    w.__toasts = [];
    const seen = new Set<string>();
    w.__toastTimer = setInterval(() => {
      document.querySelectorAll("[data-sonner-toast], [role='status'], [role='alert']").forEach((n) => {
        const t = (n as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
        if (t && !seen.has(t)) {
          seen.add(t);
          w.__toasts.push(t);
        }
      });
    }, 150);
  });
}

async function toasts(page: Page): Promise<string> {
  const seen = await page
    .evaluate(() => ((window as any).__toasts ?? []).join(" | "))
    .catch(() => "");
  return seen || "(nothing was ever shown)";
}

async function signIn(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  // K3: prove the token actually persisted. Every later navigation is a full
  // reload that restores auth from sessionStorage.
  await page.waitForFunction(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("sb-")),
    undefined,
    { timeout: 30_000 }
  );
  return page;
}

/** Choose the customer, then the contact — and DO NOT assume the first match is
 *  the right one.
 *
 *  This cost three scenarios on the first full run. Another agent working the
 *  same dev database created a second customer also called "FREIGHT CARE
 *  LOGISTICS", with no contacts on it. `getByText(CUSTOMER).first()` picked
 *  theirs, the contact list came back "No contacts found for customer
 *  CUST-1785836856524", and the form could never be completed — which the
 *  harness then reported as `blocked_work` against the PRODUCT.
 *
 *  That is a K3-shaped lie: an environment problem wearing a finding's clothes.
 *  So the picker walks the duplicates until it finds the one that actually
 *  carries the expected contact, and fails loudly if none does. The residue is
 *  worth writing down on its own account: two customers with identical names are
 *  indistinguishable in this picker, and a person has no more information than
 *  the harness had.
 */
async function pickCustomerWithContact(page: Page) {
  for (let i = 0; i < 4; i++) {
    await page.getByPlaceholder("Select or search customer...").click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("Select or search customer...").fill(CUSTOMER.slice(0, 10));
    await page.waitForTimeout(2_000);

    const options = page.getByText(CUSTOMER, { exact: true });
    const n = await options.count();
    if (n === 0) throw new Error(`no customer named ${CUSTOMER} in the picker`);
    if (i >= n) break;

    await options.nth(i).click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);

    await page.getByPlaceholder("Select or search contact person...").click();
    await page.waitForTimeout(1_500);

    const contact = page.getByText(CONTACT, { exact: true }).first();
    if (await contact.isVisible().catch(() => false)) {
      await contact.click({ timeout: 20_000 });
      await page.waitForTimeout(800);
      return;
    }

    // Wrong duplicate. Close the panel and try the next one.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
  }
  throw new Error(
    `FIXTURE, NOT PRODUCT: no customer named "${CUSTOMER}" carries the contact "${CONTACT}" — ` +
      `another run has probably left a duplicate customer behind`
  );
}

/** Fill the inquiry form to the point where Submit is enabled, and stop.
 *  Returns the quote number the form stamped on itself — the human-facing
 *  document number, which matters for the clock-skew scenario. */
async function fillInquiry(page: Page, name: string): Promise<string> {
  await page.goto("/bd/inquiries", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Inquiries" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Create Inquiry" }).click();
  await page.getByRole("button", { name: /Project Inquiry/ }).click();
  await expect(page.getByRole("heading", { name: "Create Project Inquiry" })).toBeVisible({
    timeout: 20_000,
  });

  const quoteNumber = (await page.getByText(/QUO\d{6,}/).first().innerText()).trim();

  await pickCustomerWithContact(page);

  await page.locator("#general-quotation-name").fill(name);
  await page.getByRole("button", { name: "Forwarding", exact: true }).click();

  await expect(
    page.getByRole("button", { name: /Submit .* Inquiry to Pricing/ }),
    "the inquiry form never became submittable — the fixture data changed"
  ).toBeEnabled({ timeout: 20_000 });

  return quoteNumber;
}

const submitInquiry = (page: Page) =>
  page.getByRole("button", { name: /Submit .* Inquiry to Pricing/ });

/** The only evidence that counts.
 *
 *  Looked up by the run STAMP — a bare digit string — never by the full name.
 *  The first run of this file matched on `quotation_name = typed`, found nothing,
 *  and reported the control save as data_loss; the insert had in fact returned
 *  201 and the row was there under a name the app had rewritten. Matching on
 *  what you typed cannot distinguish "no row" from "row, wrong value", which is
 *  precisely the distinction this whole pass exists to make. */
async function rowsNamed(stamp: string) {
  const { data, error } = await admin
    .from("quotations")
    .select("id, quotation_number, quotation_name, status, created_at, customer_name")
    .like("quotation_name", `%${stamp}%`);
  if (error) throw new Error(`service-role read failed: ${error.message}`);
  return data ?? [];
}

// ── cleanup ──────────────────────────────────────────────────────────────────
test.afterAll(async () => {
  const { data } = await admin
    .from("quotations")
    .select("id")
    .like("quotation_name", `%${TAG}%`);
  const ids = (data ?? []).map((r: any) => r.id);
  if (ids.length) {
    await admin.from("tickets").delete().in("linked_record_id", ids);
    await admin.from("activity_log").delete().in("record_id", ids);
    const { error } = await admin.from("quotations").delete().in("id", ids);
    console.log(`\ncleanup: removed ${ids.length} ${TAG} quotation(s)${error ? ` (error: ${error.message})` : ""}`);
  } else {
    console.log("\ncleanup: nothing to remove");
  }

  console.log(`\n${"═".repeat(78)}\nTIER 4 — THE WORLD INTERFERING · ${results.length} scenarios\n${"═".repeat(78)}`);
  for (const r of results) {
    console.log(`${r.cost.padEnd(18)} ${r.scenario}`);
    console.log(`${" ".repeat(18)} typed : ${r.typed}`);
    console.log(`${" ".repeat(18)} landed: ${r.landed}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. SMART QUOTES FROM WORD.
// Half the inquiries in a PH freight SME are pasted out of an email or a Word
// doc, and Word rewrites straight quotes as curly ones and hyphens as en-dashes
// on the way in. The question is not whether the field accepts them — it is
// whether what comes back out of the database is the same string.
// ─────────────────────────────────────────────────────────────────────────────
test("smart quotes and en-dashes survive the round trip", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  // Curly quotes, en-dash, em-dash, ellipsis, and a non-breaking space — exactly
  // what a paste out of Word carries.
  const stamp = String(Date.now());
  const typed = `${TAG} “Urgent” Manila–Cebu — 2 FCL… ${stamp}`;

  page.on("console", (m) => {
    if (m.type() === "error") console.log("  [browser console error]", m.text().slice(0, 300));
  });
  page.on("response", async (r) => {
    if (r.url().includes("/rest/v1/quotations") && r.request().method() === "POST")
      console.log("  [insert]", r.status(), (await r.text().catch(() => "")).slice(0, 300));
  });

  await fillInquiry(page, typed);
  await watchToasts(page);
  await submitInquiry(page).click();
  await page.waitForTimeout(8_000);
  console.log("  [toast]", await toasts(page));

  const rows = await rowsNamed(stamp);
  const landed = rows.length ? String(rows[0].quotation_name) : "(no row)";

  // THE CASE CHANGE IS NOT A BUG, and finding that out is why this scenario is
  // first. `AutoCapsProvider` installs a document-level capture listener on
  // `input` that rewrites every <input>/<textarea> value to uppercase via the
  // native setter and redispatches, org-wide, default ON, stored in
  // `org_settings.auto_caps_enabled`. So the name is SHOUTED on purpose.
  //
  // What matters here is the other half: every non-ASCII character — the curly
  // quotes, the en-dash, the em-dash, the ellipsis — comes back byte-identical.
  // Nothing was substituted, stripped or mojibaked on the way through, which is
  // the failure mode this scenario exists to catch. Compare case-insensitively
  // so the deliberate transform does not masquerade as corruption.
  const sameIgnoringCase = rows.length === 1 && landed === typed.toUpperCase();
  const unicodeIntact = /“Urgent”|“URGENT”/.test(landed) && landed.includes("–") && landed.includes("—") && landed.includes("…");

  record(
    "Word smart quotes pasted into the inquiry name",
    JSON.stringify(typed),
    rows.length === 0
      ? "(no row — the save did not land)"
      : `${JSON.stringify(landed)} — curly quotes / en-dash / em-dash / ellipsis intact: ${unicodeIntact}; case folded by AutoCapsProvider (org_settings.auto_caps_enabled, default ON): ${landed === typed.toUpperCase()}`,
    rows.length === 0 ? "data_loss" : sameIgnoringCase && unicodeIntact ? "none" : "silent_corruption"
  );
  expect(rows.length, "the control save did not land — the rest of this file cannot be trusted").toBe(1);

  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. OFFLINE MID-SAVE.
// The laptop drops the wifi between filling the form and clicking Submit. The
// three outcomes, worst first:
//   (a) "Inquiry created." and no row      — silent data loss, unrecoverable
//   (b) a spinner that never resolves      — the user waits, then refreshes,
//                                            then retypes
//   (c) a visible error, form still filled — correct
// And then the second half nobody tests: when the wifi comes BACK, does anything
// replay? A queued retry that fires twice is how one expense becomes two.
// ─────────────────────────────────────────────────────────────────────────────
test("offline mid-save: what the user is told, and what is behind it", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  const stamp = String(Date.now());
  const typed = `${TAG} OFFLINE ${stamp}`;
  await fillInquiry(page, typed);

  await watchToasts(page);
  await context.setOffline(true);
  await submitInquiry(page).click();
  await page.waitForTimeout(12_000);

  const said = await toasts(page);
  const stillOnForm = await page
    .getByRole("heading", { name: "Create Project Inquiry" })
    .isVisible()
    .catch(() => false);
  const kept = await page.locator("#general-quotation-name").inputValue().catch(() => "(gone)");
  await shot(page, "offline-mid-save");

  const duringOffline = await rowsNamed(stamp);

  // Back online. Nothing should replay — but if a retry queue exists, this is
  // where one voucher becomes two.
  await context.setOffline(false);
  await page.waitForTimeout(10_000);
  const afterOnline = await rowsNamed(stamp);

  const claimedSuccess = /created|saved|success/i.test(said);
  const cost: Cost =
    afterOnline.length > 1
      ? "duplicate_money"
      : afterOnline.length === 0 && claimedSuccess
        ? "silent_corruption"
        : afterOnline.length === 0 && kept === typed
          ? "none"
          : afterOnline.length === 0
            ? "data_loss"
            : "none";

  record(
    "wifi drops between filling the form and clicking Submit",
    `${JSON.stringify(typed)} submitted with the network down`,
    `UI said: ${said} | still on the form: ${stillOnForm} | name field afterwards: ${JSON.stringify(kept)} | rows while offline: ${duringOffline.length} | rows after reconnect: ${afterOnline.length}`,
    cost
  );

  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. A 500 FROM THE SERVER.
// Not the network — the server. PostgREST answers 500 and the client gets a
// well-formed failure. Does the UI say so, or does the optimistic path run
// anyway? This is the difference between "try again" and "I typed it, I saw it
// save, it is not there."
// ─────────────────────────────────────────────────────────────────────────────
test("the write returns 500: does the UI say so", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  const stamp = String(Date.now());
  const typed = `${TAG} FIVEHUNDRED ${stamp}`;
  await fillInquiry(page, typed);

  // Only the INSERT. Reads must keep working or the page falls apart for
  // reasons that have nothing to do with the finding.
  await page.route("**/rest/v1/quotations**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "internal server error", code: "XX000" }),
      });
    } else {
      await route.continue();
    }
  });

  await watchToasts(page);
  await submitInquiry(page).click();
  await page.waitForTimeout(10_000);

  const said = await toasts(page);
  const stillOnForm = await page
    .getByRole("heading", { name: "Create Project Inquiry" })
    .isVisible()
    .catch(() => false);
  const kept = await page.locator("#general-quotation-name").inputValue().catch(() => "(gone)");
  await shot(page, "server-500");

  const rows = await rowsNamed(stamp);
  const claimedSuccess = /created|saved|success/i.test(said) && !/error|failed/i.test(said);

  record(
    "PostgREST answers 500 on the inquiry insert",
    `${JSON.stringify(typed)} submitted against a 500`,
    `UI said: ${said} | still on the form: ${stillOnForm} | name field afterwards: ${JSON.stringify(kept)} | rows: ${rows.length}`,
    rows.length === 0 && claimedSuccess ? "silent_corruption" : rows.length === 0 && kept === typed ? "none" : rows.length === 0 ? "data_loss" : "none"
  );

  await page.unroute("**/rest/v1/quotations**");
  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SLOW NETWORK, SUBMIT CLICKED TWICE.
// This is how double-submits really happen: not malice, just a 3G-ish link and
// a button that gives no feedback for four seconds. The user clicks again.
// Two inquiries, two quote numbers, and Pricing quotes the same job twice.
// ─────────────────────────────────────────────────────────────────────────────
test("slow link, Submit clicked twice in the gap", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  const stamp = String(Date.now());
  const typed = `${TAG} DOUBLECLICK ${stamp}`;
  await fillInquiry(page, typed);

  // Delay only the insert, so the form is responsive right up to the moment it
  // matters — which is exactly what a real slow link feels like.
  await page.route("**/rest/v1/quotations**", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, 4_000));
      await route.continue();
    } else {
      await route.continue();
    }
  });

  await watchToasts(page);
  const btn = submitInquiry(page);
  await btn.click();
  // The impatient second click, 1.2s in, while the first is still in flight.
  await page.waitForTimeout(1_200);
  const stillClickable = await btn.isEnabled().catch(() => false);
  const visiblyBusy = (await btn.innerText().catch(() => "")).trim();
  await btn.click({ force: true, timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(15_000);

  const rows = await rowsNamed(stamp);
  await shot(page, "double-submit");

  record(
    "Submit clicked twice on a 4-second link",
    `one inquiry, two clicks 1.2s apart (button still enabled mid-flight: ${stillClickable}, label read "${visiblyBusy}")`,
    `${rows.length} row(s): ${rows.map((r: any) => r.quotation_number).join(", ") || "none"}`,
    rows.length > 1 ? "duplicate_money" : rows.length === 1 ? "none" : "data_loss"
  );

  await page.unroute("**/rest/v1/quotations**");
  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. THE HALF-SAVE.
// The inquiry insert is awaited and its error is caught. The two writes AFTER it
// are not: `createWorkflowTicket(...).catch(console.error)` and
// `void recordNotificationEvent(...)`. So if only the tickets endpoint fails,
// the quotation lands, the user is told "Inquiry created.", and the handoff
// ticket that is the entire mechanism by which Pricing learns the job exists
// never gets written. Nobody is told. Nobody looks.
//
// This is the app's silent-failure pattern with a spotlight on it, and it does
// not need a hostile network to happen — a policy denial does it too.
// ─────────────────────────────────────────────────────────────────────────────
test("the inquiry saves but the handoff ticket does not", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  const stamp = String(Date.now());
  const typed = `${TAG} HALFSAVE ${stamp}`;
  await fillInquiry(page, typed);

  await page.route("**/rest/v1/tickets**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "internal server error", code: "XX000" }),
      });
    } else {
      await route.continue();
    }
  });

  await watchToasts(page);
  await submitInquiry(page).click();
  await page.waitForTimeout(12_000);

  const said = await toasts(page);
  const rows = await rowsNamed(stamp);
  const id = rows[0]?.id;
  const { data: tix } = id
    ? await admin.from("tickets").select("id, subject").eq("linked_record_id", id)
    : { data: [] as any[] };
  await shot(page, "half-save-ticket-lost");

  const quotationLanded = rows.length === 1;
  const ticketLanded = (tix ?? []).length > 0;

  record(
    "the handoff ticket write fails while the inquiry write succeeds",
    "submit one inquiry to Pricing with the tickets endpoint returning 500",
    `UI said: ${said} | quotation row: ${quotationLanded} | handoff ticket rows: ${(tix ?? []).length}`,
    quotationLanded && !ticketLanded ? "silent_corruption" : "none"
  );

  await page.unroute("**/rest/v1/tickets**");
  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. THE SESSION GOES AWAY MID-FORM.
// VITE_SESSION_STORAGE_AUTH=true, so auth lives in sessionStorage and dies with
// the tab. Ten minutes into a long form the token is gone — a colleague signed
// out in another tab, the storage was cleared, the token expired. Then Save.
// The question that matters is not whether the save fails. It is whether the ten
// minutes of typing are still on screen when it does.
// ─────────────────────────────────────────────────────────────────────────────
test("session cleared mid-form: is the typing kept", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  const stamp = String(Date.now());
  const typed = `${TAG} NOSESSION ${stamp}`;
  await fillInquiry(page, typed);

  const removed = await page.evaluate(() => {
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("sb-"));
    keys.forEach((k) => sessionStorage.removeItem(k));
    return keys.length;
  });

  // Belt and braces: the client also holds the session in memory, so clearing
  // storage alone may change nothing. Make the server refuse the token too —
  // that is what an EXPIRED session actually looks like on the wire.
  await page.route("**/rest/v1/quotations**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "JWT expired", code: "PGRST301" }),
      });
    } else {
      await route.continue();
    }
  });

  await submitInquiry(page).click();
  await page.waitForTimeout(10_000);

  const said = await toasts(page);
  const kept = await page.locator("#general-quotation-name").inputValue().catch(() => "(form gone)");
  const bouncedToLogin = await page
    .getByRole("button", { name: "Sign In", exact: true })
    .isVisible()
    .catch(() => false);
  await shot(page, "session-expired-mid-form");

  const rows = await rowsNamed(stamp);

  record(
    "the session dies while a long form is filled",
    `${removed} sb-* key(s) cleared from sessionStorage, then the save is refused with 401 JWT expired`,
    `UI said: ${said} | bounced to login: ${bouncedToLogin} | name field afterwards: ${JSON.stringify(kept)} | rows: ${rows.length}`,
    // The typing surviving is the good half. The bad half is that NOTHING is
    // shown: the click produces no toast, no bounce to the login screen, no
    // indication the save was refused. The 500 case above says "Error saving
    // inquiry: internal server error"; an expired session says nothing at all,
    // and the form sits there looking exactly as it did before. A person clicks
    // Submit again. And again.
    rows.length > 0
      ? "none"
      : /nothing was ever shown/.test(said)
        ? "blocked_work"
        : kept === typed
          ? "none"
          : "data_loss"
  );

  await page.unroute("**/rest/v1/quotations**");
  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. THE ACCIDENTAL REFRESH, AND THE BACK BUTTON.
// F5 with a filled form. Ctrl+W. The back button because a link opened in the
// same tab. Every one of these is a Tuesday, and the only defence a web app has
// is a beforeunload prompt — which this checks for explicitly, because its
// absence is the whole finding.
//
// The second half is the nastier one: if a stale form IS restored, saving it
// writes old values over whatever changed in between.
// ─────────────────────────────────────────────────────────────────────────────
test("refresh and Back with a filled form", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await signIn(context, BD);

  const stamp = String(Date.now());
  const typed = `${TAG} REFRESH ${stamp}`;
  await fillInquiry(page, typed);

  // Playwright auto-dismisses beforeunload; listening is how we learn whether
  // the app even tried to warn.
  let warned = false;
  page.on("dialog", (d) => {
    warned = true;
    d.dismiss().catch(() => {});
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6_000);

  const formStillOpen = await page
    .getByRole("heading", { name: "Create Project Inquiry" })
    .isVisible()
    .catch(() => false);
  const keptAfterReload = formStillOpen
    ? await page.locator("#general-quotation-name").inputValue().catch(() => "(gone)")
    : "(form not restored at all)";
  const signedOut = await page
    .getByRole("button", { name: "Sign In", exact: true })
    .isVisible()
    .catch(() => false);
  await shot(page, "after-refresh");

  record(
    "F5 with a filled inquiry form",
    `${JSON.stringify(typed)} typed, never submitted, page refreshed`,
    `beforeunload warning shown: ${warned} | form restored: ${formStillOpen} | field afterwards: ${JSON.stringify(keptAfterReload)} | signed out by the reload: ${signedOut}`,
    keptAfterReload === typed ? "none" : "data_loss"
  );

  // Back: navigate away in-app, then come back the way a user does.
  if (!signedOut) {
    const typed2 = `${TAG} BACKBTN ${Date.now()}`;
    await fillInquiry(page, typed2);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(6_000);

    const backForm = await page
      .getByRole("heading", { name: "Create Project Inquiry" })
      .isVisible()
      .catch(() => false);
    const keptAfterBack = backForm
      ? await page.locator("#general-quotation-name").inputValue().catch(() => "(gone)")
      : "(form not restored)";
    await shot(page, "after-back");

    record(
      "navigate away from a filled form and press Back",
      `${JSON.stringify(typed2)} typed, never submitted, navigated away and back`,
      `form restored: ${backForm} | field afterwards: ${JSON.stringify(keptAfterBack)}`,
      keptAfterBack === typed2 ? "none" : "data_loss"
    );
  }

  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. THE 1366x768 LAPTOP, AND THAT LAPTOP AT 200% ZOOM.
// The office machine in a PH SME is a 1366x768 laptop, and the person who needs
// the zoom is usually the one signing things off. Finding E7 was already this
// shape — "Create Project" landing UNDER the sticky tab bar, where a click is
// intercepted by a bare DIV and force:true does not help, because force skips
// the actionability check but the event still hits whatever is on top.
//
// So the check is not "is the button on the page". It is: at the button's own
// centre point, what does the browser say is on top?
// ─────────────────────────────────────────────────────────────────────────────
test("1366x768, and the same screen at 200% zoom", async ({ browser }) => {
  test.setTimeout(300_000);

  for (const [label, viewport] of [
    ["1366x768", { width: 1366, height: 768 }],
    // 200% zoom on a 1366x768 screen IS a 683x384 CSS viewport. Same pixels,
    // half the room.
    ["1366x768 at 200% zoom", { width: 683, height: 384 }],
  ] as const) {
    const context = await browser.newContext({ viewport });
    const page = await signIn(context, BD);

    const stamp = String(Date.now());
  const typed = `${TAG} SMALLSCREEN ${label} ${stamp}`;
    let verdict: string;
    let cost: Cost = "none";
    try {
      await fillInquiry(page, typed);
      const btn = submitInquiry(page);
      const box = await btn.boundingBox();
      const covered = await btn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cy < 0 || cy > window.innerHeight || cx < 0 || cx > window.innerWidth)
          return "OFF SCREEN — not scrolled into view";
        const top = document.elementFromPoint(cx, cy);
        if (!top) return "nothing at its centre";
        return el.contains(top) || top === el
          ? "clickable"
          : `covered by <${top.tagName.toLowerCase()} class="${(top.className || "").toString().slice(0, 60)}">`;
      });
      const inViewport =
        !!box && box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0;
      verdict = `submit button at y=${box ? Math.round(box.y) : "?"} of ${viewport.height} | in viewport without scrolling: ${inViewport} | at its centre: ${covered}`;
      if (covered !== "clickable") cost = "blocked_work";
      await shot(page, `smallscreen-${label.replace(/\W+/g, "-")}`);
    } catch (e: any) {
      verdict = `could not even reach the submit button: ${String(e?.message ?? e).slice(0, 200)}`;
      cost = "blocked_work";
      await shot(page, `smallscreen-${label.replace(/\W+/g, "-")}-failed`);
    }

    record(`the inquiry form on ${label}`, `open the form and look for Submit`, verdict, cost);
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CLOCK SKEW.
// A PH company with a client-side clock is fine until someone's laptop is on the
// wrong timezone, or a colleague is travelling. The quote number is built in the
// browser from `new Date().getFullYear()/getMonth()/getDate()` — the LOCAL date —
// while `created_at` is `new Date().toISOString()`, which is UTC. Those are the
// same day only some of the time.
//
// BOTH DIRECTIONS ARE RUN, and that is deliberate: at any instant exactly one of
// them is across a day boundary from UTC. UTC+14 is a day ahead whenever the UTC
// hour is >= 10; UTC-11 is a day behind whenever it is < 11. So this scenario
// cannot come back green just because it happened to run at a quiet hour — a
// single-timezone version of this test passes for most of the working day and
// tells you nothing.
//
// What is at stake is the document number a client quotes back at you: QUO2608
// **05** 1234 raised on the 4th, filed under the 4th, findable by neither date.
// ─────────────────────────────────────────────────────────────────────────────
test("a laptop on the wrong timezone stamps a different date on the document", async ({
  browser,
}) => {
  test.setTimeout(400_000);

  for (const [label, timezoneId] of [
    ["UTC+14 (Pacific/Kiritimati)", "Pacific/Kiritimati"],
    ["UTC-11 (Pacific/Midway)", "Pacific/Midway"],
  ] as const) {
    const context = await browser.newContext({ timezoneId, locale: "en-PH" });
    const page = await signIn(context, BD);

    const stamp = String(Date.now());
    const typed = `${TAG} TZSKEW ${stamp}`;
    const quoteNumber = await fillInquiry(page, typed);
    const localDate = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await watchToasts(page);
    await submitInquiry(page).click();
    await page.waitForTimeout(10_000);

    const rows = await rowsNamed(stamp);
    const stored = rows[0];
    // QUO + YY + MM + DD + 4 random
    const m = /^QUO(\d{2})(\d{2})(\d{2})\d{4}$/.exec(quoteNumber);
    const numberDate = m ? `20${m[1]}-${m[2]}-${m[3]}` : "(unparseable)";
    const utcDate = stored ? String(stored.created_at).slice(0, 10) : "(no row)";

    record(
      `inquiry raised from a machine set to ${label}`,
      `browser-local date ${localDate}, document number ${quoteNumber} (date part ${numberDate})`,
      `stored created_at (UTC): ${utcDate} | document number agrees with the stored date: ${numberDate === utcDate}`,
      !stored ? "data_loss" : numberDate === utcDate ? "none" : "silent_corruption"
    );

    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. TWO TABS, ONE LOGIN.
// In a PH SME the shared account is not an edge case, it is Tuesday: two
// dispatchers, one `bd@` login, two browsers. Both are told to raise the inquiry
// for the same job. Neither can see what the other is doing, and nothing in the
// form says "someone else is already on this".
//
// The two contexts are separate browsers with separate sessionStorage, which is
// the honest shape of the shared-login case — not two tabs sharing state.
// ─────────────────────────────────────────────────────────────────────────────
test("two people on one login raise the same job at the same time", async ({ browser }) => {
  test.setTimeout(400_000);

  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await signIn(a, BD);
  const pageB = await signIn(b, BD);

  // Same job, same name — which is what "raise the inquiry for Freight Care"
  // told to two people produces.
  const stamp = String(Date.now());
  const typed = `${TAG} SHAREDLOGIN ${stamp}`;
  const qA = await fillInquiry(pageA, typed);
  const qB = await fillInquiry(pageB, typed);

  await watchToasts(pageA);
  await watchToasts(pageB);
  await Promise.all([
    submitInquiry(pageA).click(),
    submitInquiry(pageB).click(),
  ]);
  await pageA.waitForTimeout(15_000);

  const rows = await rowsNamed(stamp);
  const numbers = rows.map((r: any) => r.quotation_number);
  const warned =
    /already|duplicate|exists/i.test(await toasts(pageA)) ||
    /already|duplicate|exists/i.test(await toasts(pageB));
  await shot(pageA, "shared-login-a");
  await shot(pageB, "shared-login-b");

  record(
    "two sessions on one login submit the same inquiry simultaneously",
    `identical customer, identical inquiry name, two forms (${qA} and ${qB})`,
    `${rows.length} row(s) created: ${numbers.join(", ")} | any duplicate warning shown: ${warned}`,
    rows.length > 1 ? "duplicate_money" : "none"
  );

  await a.close();
  await b.close();
});
