import { test, expect, Page, BrowserContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// The spine — one job carried through Neuron by the people who actually do it.
//
// Tier 1 (route-smoke) proves pages load. This proves work MOVES: each stage is
// performed by a different signed-in person holding the real grant for that
// step, in their own browser context, and the next person has to be able to see
// and act on what the previous one left behind.
//
// That handoff is the thing no single-session test can check, and it is where
// the real bugs live — a status that doesn't advance, a record the next
// department can't see, a permission that blocks the person it shouldn't.
//
// Stages are additive. Each one must be green before the next is written;
// authoring the whole chain blind produces a wall of failures nobody can read.
//
//   Stage 1  BD raises an inquiry and submits it   → Pending Pricing   [done]
//   Stage 2  Pricing prices it                     → Priced           [done]
//   Stage 3  BD sends to client, client accepts    → Accepted         [todo]
//   Stage 4  convert to project, Ops books it                         [todo]
//   Stage 5  e-voucher: raise → approve → disburse                    [todo]
//   Stage 6  billing → invoice → collection                           [todo]
//
// WRITES TO DEV. Every record it creates is named with SPINE_TAG so the debris
// is identifiable and can be cleaned up.
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD = "devpassword123";

// Department-native actors: each genuinely holds the grant for their step, so a
// failure means the workflow is broken, not that the persona was miscast.
const BD = "jr.businessdev02@falconslogistics-ph.com";      // BD Officer
// Pricing MANAGER, not an Officer, and that distinction is the finding:
// record visibility for quotations is assignment-driven. All four Pricing
// Officers sit on the "own" dial, so they only see a quotation once they are
// its created_by, prepared_by or assigned_to (users_reachable_ids). An inquiry
// BD submits without naming a reviewer is invisible to every Officer — in prod,
// 13 of 50 "Pending Pricing" quotations are unassigned and therefore only
// visible to the manager/TL, who hold "everything".
// Stage 3 should add the assign-a-reviewer step and swap this back to an Officer.
const PRICING = "jr.manager03@falconslogistics-ph.com";      // Pricing Manager
const PRICING_OFFICER = "jr.pricing01@falconslogistics-ph.com";
const OFFICER_NAME = "Sarah May B. Baylon"; // as shown in the Assign to picker

const SPINE_TAG = "E2E-SPINE";

// A real customer in the dev dataset. Chosen rather than "whatever is first"
// so a failure means the flow broke, not that the picker returned something
// unexpected.
const CUSTOMER = "FREIGHT CARE LOGISTICS";
const CONTACT = "FAJNA FAJNA"; // the only contact on that customer in dev

const signInButton = (page: Page) => page.getByRole("button", { name: "Sign In", exact: true });

async function signIn(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await signInButton(page).click();
  // Wait for the token to actually persist — every later navigation is a full
  // reload that restores auth from sessionStorage.
  await page.waitForFunction(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("sb-")),
    undefined,
    { timeout: 30_000 }
  );
  return page;
}

test("spine: BD raises an inquiry, Pricing prices it", async ({ browser }) => {
  test.setTimeout(240_000);

  // A name unique to this run, so the Pricing actor finds this exact record and
  // the debris is attributable.
  const quotationName = `${SPINE_TAG} ${Date.now()}`;

  // ── Stage 1 — Business Development ────────────────────────────────────────
  const bdContext = await browser.newContext();
  const bd = await signIn(bdContext, BD);

  await bd.goto("/bd/inquiries", { waitUntil: "domcontentloaded" });
  await expect(bd.getByRole("heading", { name: "Inquiries" })).toBeVisible({ timeout: 20_000 });

  await bd.getByRole("button", { name: "Create Inquiry" }).click();
  await bd.getByRole("button", { name: /Project Inquiry/ }).click();
  await expect(bd.getByRole("heading", { name: "Create Project Inquiry" })).toBeVisible({
    timeout: 15_000,
  });

  // The form stamps the quote number up front. Capture it — it is what the
  // Pricing list actually searches on (it does not match the quotation name),
  // and it is what a person would quote to a colleague.
  const quoteNumber = (await bd.getByText(/QUO\d{6,}/).first().innerText()).trim();
  expect(quoteNumber, "no quote number on the create form").toMatch(/^QUO\d{6,}$/);

  // Customer — the field opens an inline panel with its own search box, then a
  // plain list of names. Not a native select and not role=option, so it is
  // driven by visible text.
  await bd.getByPlaceholder("Select or search customer...").click();
  await bd.waitForTimeout(800);
  await bd.getByPlaceholder("Select or search customer...").fill(CUSTOMER.slice(0, 10));
  await bd.waitForTimeout(1_800);
  await bd.getByText(CUSTOMER, { exact: true }).first().click({ timeout: 15_000 });
  await bd.waitForTimeout(1_500);

  // Contact person — the field only becomes usable once a customer is chosen;
  // its placeholder changes from "Select a customer first..." to this one.
  await bd.getByPlaceholder("Select or search contact person...").click();
  await bd.waitForTimeout(1_200);
  await bd.getByText(CONTACT, { exact: true }).first().click({ timeout: 15_000 });
  await bd.waitForTimeout(800);

  await bd.locator("#general-quotation-name").fill(quotationName);
  await bd.getByRole("button", { name: "Forwarding", exact: true }).click();

  const submit = bd.getByRole("button", { name: "Submit Project Inquiry to Pricing" });
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  await submit.click();

  // Handed off: it must now be waiting on Pricing, not sitting in BD's drafts.
  await expect(bd.getByText(quotationName).first()).toBeVisible({ timeout: 25_000 });

  // ── Stage 2 — Pricing, in a separate session ──────────────────────────────
  // The point of the second context: Pricing must independently SEE the record
  // BD just created. A shared session would prove nothing about the handoff.
  const pricingContext = await browser.newContext();
  const pricing = await signIn(pricingContext, PRICING);

  await pricing.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  await expect(pricing.getByRole("heading", { name: "Quotations" })).toBeVisible({ timeout: 20_000 });

  const search = pricing.getByPlaceholder(/Search/i).first();
  await search.fill(quoteNumber);
  await pricing.waitForTimeout(3_000);

  // THE HANDOFF ASSERTION. A different person, in a different session, holding
  // pricing_quotations:edit rather than bd_inquiries:edit, must be able to see
  // the work BD just pushed to them. If this fails the chain is broken between
  // departments, which no single-session test would reveal.
  await expect(
    pricing.getByText(quoteNumber).first(),
    `Pricing cannot see ${quoteNumber} (${quotationName}) after BD submitted it — the BD→Pricing handoff is broken`
  ).toBeVisible({ timeout: 25_000 });

  // ── Stage 3a — the manager triages: assign a reviewer ─────────────────────
  // Marcus confirmed this is the intended flow: the manager owns the pending
  // queue and hands each item to an officer. Assignment is also what makes the
  // record visible to that officer (users_reachable_ids matches assigned_to),
  // so this step is both the business action and the permission grant.
  await pricing.getByText(quoteNumber).first().click();
  await expect(pricing.getByRole("heading", { name: quotationName })).toBeVisible({
    timeout: 20_000,
  });

  await pricing.getByRole("button", { name: /Unassigned/ }).click();
  await pricing.waitForTimeout(1_200);
  await pricing.getByText(OFFICER_NAME, { exact: true }).first().click({ timeout: 15_000 });

  // Picking a name does NOT assign — it reveals a "Price by" date and a
  // Confirm Assign button. Skipping the confirm leaves the record untouched
  // and silently unassigned, which is what made this look like a broken
  // permission rather than an unfinished interaction.
  await pricing.getByRole("button", { name: "Confirm Assign" }).click();
  await pricing.waitForTimeout(2_500);

  // Assert the assignment actually stuck before handing off, so a failed
  // interaction fails here rather than masquerading as a visibility bug.
  await expect(
    pricing.getByRole("button", { name: OFFICER_NAME }),
    "Confirm Assign did not persist the reviewer"
  ).toBeVisible({ timeout: 15_000 });

  // ── Stage 3b — the officer, who could not see this a moment ago ───────────
  const officerContext = await browser.newContext();
  const officer = await signIn(officerContext, PRICING_OFFICER);

  await officer.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  await officer.getByPlaceholder(/Search/i).first().fill(quoteNumber);
  await officer.waitForTimeout(3_000);

  // THE TRIAGE ASSERTION. Before the assignment this officer sits on the "own"
  // visibility dial and cannot see a BD-created quotation at all. If this fails,
  // assignment is not granting visibility and the triage flow is broken.
  await expect(
    officer.getByText(quoteNumber).first(),
    `${OFFICER_NAME} cannot see ${quoteNumber} after the manager assigned it — triage does not grant visibility`
  ).toBeVisible({ timeout: 25_000 });

  await officer.getByText(quoteNumber).first().click();
  await expect(officer.getByRole("heading", { name: quotationName })).toBeVisible({
    timeout: 20_000,
  });

  // ── Stage 3c — the officer prices it ──────────────────────────────────────
  // "Mark as Priced" is offered only at Pending Pricing and only to someone
  // holding pricing_quotations:edit (StatusChangeButton). The status chip shows
  // the DISPLAY label, which for Pending Pricing is "Ongoing".
  await officer.getByRole("button", { name: /Ongoing/ }).click();
  await officer.waitForTimeout(1_000);
  await officer.getByRole("menuitem", { name: /Mark as Priced/ }).click();
  await officer.waitForTimeout(3_000);

  // The chip cannot confirm this. getDisplayStatus collapses Draft, Pending
  // Pricing, Priced AND Needs Revision all to "Ongoing", so the label is
  // identical before and after — an officer gets no visible feedback that
  // pricing landed. Assert on the ACTIONS instead, which do change: at Priced,
  // "Mark as Priced" is withdrawn and "Send to Client" becomes available.
  await officer.getByRole("button", { name: /Ongoing/ }).click();
  await officer.waitForTimeout(1_200);

  await expect(
    officer.getByRole("menuitem", { name: /Send to Client/ }),
    "the officer's Mark as Priced did not take effect — Send to Client is not offered"
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    officer.getByRole("menuitem", { name: /Mark as Priced/ }),
    "still offering Mark as Priced — the status did not advance"
  ).toHaveCount(0);

  await bdContext.close();
  await pricingContext.close();
  await officerContext.close();
});
