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
//   Stage 3  manager assigns, the officer prices it → Priced          [done]
//   Stage 4  BD sends to client, client accepts     → Accepted        [done]
//   Stage 5  the officer converts it to a project   → Converted       [done]
//   Stage 6a Pricing opens the booking form from the project          [done]
//   Stage 6b Operations picks that booking up                         [done]
//   Stage 7  e-voucher: raise → approve → approve → disburse          [done]
//   Stage 8  billing → invoice → approve → issue → collection        [done]
//
// Stage 6 shape, settled with Marcus: the project file is a Pricing/BD artifact
// that Operations is not meant to see. Seeding bookings from it is therefore a
// Pricing/BD action, and it is properly gated on both sides — the button reads
// the door you entered through (pricing_projects_bookings_tab), and
// current_user_can_act_on_booking ORs that same key. So the assigned Pricing
// officer creates the booking from the project, and an Operations person then
// picks it up from their own booking list. That second half is the real
// Pricing → Ops handoff and is what stage 6 must assert. See E9, E10.
//
// STAGE 7 — the job costs money. The Ops supervisor who took the booking in
// stage 6 raises the expense against THAT booking, and it walks the AP chain:
//
//   raise    jr.supervisor07  Princess Marre R. Reyes   my_evouchers:create/edit
//   approve  jr.manager03     Jayson P. Nabos           PRICING Manager
//                             — my_evouchers:approve
//   approve  inquiry@         Mark D. Javier            acct_evouchers:approve
//   disburse treasury@        Janice D. De Villa        acct_evouchers:disburse
//                             — one of only TWO people in the company who hold it
//
// THE CAST CORRECTION (E12). The groundwork here named the Ops manager for the
// first approval, reasoning that the DB requires the approver's department to
// match the requestor's. It does not: evouchers_select/_update compare
// COALESCE(pending_approver_department, details->>requestor_department) to the
// approver's department — the MATERIALIZED approver wins, and the requestor's
// department is only the fallback. And there is a live routing rule:
//
//   "Forwarding-job expenses -> Pricing Manager"
//   trigger { booking_service_type: "Forwarding" } → { Pricing, manager }
//
// The voucher's lines are booked to a Forwarding booking, so the rule fires at
// submit and stamps pending_approver_department = "Pricing". The Ops manager
// never sees it; the Pricing Manager does — and that is Jayson, the same person
// the rule is named after. Stage 7 asserts BOTH halves of that: it arrives with
// Pricing, and it does NOT arrive with Operations.
//
// The form — /my-evouchers -> "New Request" -> "Reimbursement Request" modal.
// The personal context defaults the Transaction Type to Reimbursement (the
// panel is shared with Operations/Accounting, which default elsewhere), and the
// title/labels follow the type. Submit Request starts DISABLED and needs three
// things:
//
//   1. Paid To (Vendor) — registry-only (NEU-046). A searchable dropdown over
//      service_providers; one-off payees must be registered first.
//   2. One line item from the Expense Catalog — "Add Category" (a real
//      catalog_categories row, side=expense), which seeds an empty line, then
//      the item itself via CatalogItemCombobox. Never free text.
//   3. A booking on that line (D2) — enforced in handleSubmit, not by the
//      disabled state, so a missing booking fails as a toast, not a dead button.
//
// The chain, verified end to end here:
//   draft → submit → pending_manager → approve → pending_ceo → approve (CEO)
//         → pending_accounting → disburse → posted
//
// The last hop is NOT "disbursed": only a true advance (cash_advance /
// budget_request) parks in liquidation. A reimbursement settles directly — the
// disburse page says "Disburse & Close" and lands the voucher at Posted.
//
// STAGE 8 — the job earns money, and the receivable closes:
//
//   bill     treasury@        Janice D. De Villa      acct_projects_billings_tab
//   invoice  treasury@        Janice D. De Villa      acct_projects_invoices_tab
//   approve  jr.manager02     Mariella R. Soriano     OPERATIONS Manager
//   issue    treasury@        Janice D. De Villa      finalize (blocked until approved)
//   collect  treasury@        Janice D. De Villa      acct_projects_collections_tab
//
// THE ROUTING ENGINE, POINTING THE OTHER WAY. Stage 7 sent an Ops-raised expense
// to the PRICING manager. Here the invoice rule ("Invoice approval → Operations
// manager", a catch-all trigger) sends an Accounting-raised invoice to the
// OPERATIONS manager — so Mariella, deliberately not the approver of the
// e-voucher, is the approver of the invoice. Two domains, one engine, opposite
// directions, and neither derivable from the org chart.
//
// WHY ACCOUNTING RAISES THE CHARGE AND NOT OPERATIONS (E15). This should be
// Operations' step: they hold ops_forwarding_billings_tab create/edit/delete and
// the Billings tab is on their booking. It does not work. Every
// billing_line_items policy calls current_user_can_view_record('billings', NULL)
// — a literal NULL owner — and that returns false for own/team/department. Only
// org_wide/everything passes. In dev that is all 17 Accounting/Executive users
// and none of the 41 in BD/Pricing/Operations: the UI lets an Ops supervisor
// fill the row, the DB refuses the insert. When E15 is fixed, stage 8a should
// move back to the booking where it belongs.
//
// Two surfaces of the same table behave differently, which is why the steps look
// asymmetric (E14): the BOOKING view groups by category, so "Add Item" inside a
// category is the way in and the header's "Add Billing" files the row under an
// undisplayed one; the PROJECT view groups by service, so "Add Billing" is the
// only way in and naming the service re-groups the row into a collapsed group
// mid-edit. Both surfaces can hide the row you just added.
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
// Operations TL — holds ops_forwarding:create and sits on the
// bookings_forwarding:"everything" dial, so they see the whole service list
// rather than only what they raised. That is what makes them the right person
// to prove the booking actually arrived in Operations.
const OPS = "jr.supervisor07@falconslogistics-ph.com";
// Their access profile is literally "IMPORT SUPERVISOR (FORWARDING)", which is
// the required role slot on a forwarding booking — so naming them IS the
// Pricing -> Ops handoff, not a convenience.
const OPS_NAME = "Princess Marre R. Reyes";

// Stage 7 cast. Each holds exactly one gate in the AP chain, and no two of them
// hold the same one — so every hop below is a real handoff between people.
const OPS_MANAGER = "jr.manager02@falconslogistics-ph.com"; // Mariella R. Soriano, Operations
const EXEC = "inquiry@falconslogistics-ph.com";             // Mark D. Javier, acct_evouchers:approve
const TREASURY = "treasury@falconslogistics-ph.com";        // Janice D. De Villa, :disburse

// Real rows, not "whatever is first": a registered vendor (the picker is
// registry-only), and a category/item pair that genuinely exists in the Expense
// Catalog — the catalog architecture forbids free text on either.
const VENDOR = "UTOC CORPORATION";
const EXPENSE_CATEGORY = "(EXP) FORWARDING";
const CATALOG_ITEM = "FC (OCEAN FREIGHT)";

// Stage 8 works the revenue side of the same job. The charge comes from the
// Billing Catalog (side=revenue) exactly as the expense came from the Expense
// Catalog — free text is forbidden on both.
const BILLING_ITEM = "CRATING FEE";
const BILLING_AMOUNT = 25000;

const SPINE_TAG = "E2E-SPINE";

// A real customer in the dev dataset. Chosen rather than "whatever is first"
// so a failure means the flow broke, not that the picker returned something
// unexpected.
const CUSTOMER = "FREIGHT CARE LOGISTICS";
const CONTACT = "FAJNA FAJNA"; // the only contact on that customer in dev

// DataTable renders the SAME rows twice — a desktop <table> and a mobile card
// list that is hidden at this viewport (md:hidden). getByText().first() lands on
// the hidden copy, which can never be clicked and never reads as visible, so
// every list assertion below addresses the real table by its cells.
const cell = (page: Page, name: string | RegExp) => page.getByRole("cell", { name }).first();

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

test("spine: inquiry -> quote -> project -> booking -> e-voucher posted -> invoice collected", async ({ browser }) => {
  test.setTimeout(600_000);

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

  // ── Stage 4 — back to BD: send it, close it, convert it ───────────────────
  // The client relationship is BD's, so BD carries the priced quote out and
  // records the outcome. BD can see it throughout because they created it.
  await bd.goto("/bd/inquiries", { waitUntil: "domcontentloaded" });
  await bd.waitForTimeout(2_000);

  // Pricing's work has already moved it: the page tabs split by lifecycle
  // (Inquiries = Draft/Pending Pricing/Needs Revision, Quotations = Priced/Sent
  // to Client, Completed = terminal). Now that it is Priced it has left the
  // Inquiries tab, so BD picks it up under Quotations.
  // role=tab, labelled with its count ("Quotations 121"). The list is slow to
  // populate — the tabs do not exist for several seconds after navigation — so
  // wait for it explicitly rather than relying on click's default timeout.
  const quotationsTab = bd.getByRole("tab", { name: /Quotations/ });
  await expect(quotationsTab).toBeVisible({ timeout: 30_000 });
  await quotationsTab.click();
  await bd.waitForTimeout(1_500);
  await bd.getByPlaceholder(/Search/i).first().fill(quoteNumber);
  await bd.waitForTimeout(3_000);
  await bd.getByText(quoteNumber).first().click();
  await expect(bd.getByRole("heading", { name: quotationName })).toBeVisible({ timeout: 20_000 });

  // Priced → Sent to Client
  await bd.getByRole("button", { name: /Ongoing/ }).click();
  await bd.waitForTimeout(1_000);
  await bd.getByRole("menuitem", { name: /Send to Client/ }).click();
  await bd.waitForTimeout(3_000);

  // "Waiting Approval" is the display label for Sent to Client — the one point
  // in this chain where the chip actually changes.
  await expect(
    bd.getByRole("button", { name: /Waiting Approval/ }),
    "Send to Client did not take effect"
  ).toBeVisible({ timeout: 20_000 });

  // Client accepts → Accepted by Client
  await bd.getByRole("button", { name: /Waiting Approval/ }).click();
  await bd.waitForTimeout(1_000);
  await bd.getByRole("menuitem", { name: /Mark as Approved/ }).click();
  await bd.waitForTimeout(3_000);

  await expect(
    bd.getByRole("button", { name: /Approved/ }),
    "Mark as Approved did not take effect"
  ).toBeVisible({ timeout: 20_000 });

  // ── Stage 5 — conversion, which BD cannot do ──────────────────────────────
  // "Create Project" is gated on bd_projects:create || pricing_projects:create
  // (QuotationFileView:1304). No BD-department user holds either — the whole
  // Pricing department does. So the person who won the client and recorded the
  // acceptance cannot convert it; the assigned Pricing officer does, and can
  // still see the record because they are assigned_to.
  await officer.goto("/pricing/quotations", { waitUntil: "domcontentloaded" });
  const completedTab = officer.getByRole("tab", { name: /Completed/ });
  await expect(completedTab).toBeVisible({ timeout: 30_000 });
  await completedTab.click();
  await officer.waitForTimeout(1_500);
  await officer.getByPlaceholder(/Search/i).first().fill(quoteNumber);
  await officer.waitForTimeout(3_000);
  await officer.getByText(quoteNumber).first().click();
  await expect(officer.getByRole("heading", { name: quotationName })).toBeVisible({ timeout: 20_000 });

  const createProject = officer.getByRole("button", { name: "Create Project" });
  await expect(
    createProject,
    "Create Project is not offered to the assigned Pricing officer at Accepted by Client"
  ).toBeVisible({ timeout: 20_000 });
  // It sits at the bottom of a long detail page. toBeVisible() is satisfied by
  // presence, not by being in the viewport, so scroll to it before clicking.
  // Scrolling lands this button under the sticky tab bar, so a normal click is
  // intercepted (elementFromPoint at its centre returns a bare DIV, not the
  // button) and force:true does not help — force skips the actionability checks
  // but the event still hits whatever is on top. Dispatch on the element; React
  // listens at the root, so the handler fires exactly as it would for a user who
  // scrolled it clear. Logged as finding E7.
  await createProject.scrollIntoViewIfNeeded();
  await officer.waitForTimeout(500);
  await createProject.dispatchEvent("click");
  await officer.waitForTimeout(5_000);

  // Conversion drops the user straight into the new project file — the quote is
  // now a job. "Back to Projects" and the project tabs only exist on that view.
  await expect(
    officer.getByRole("button", { name: "Back to Projects" }),
    "Create Project did not convert the quotation — still on the quotation view"
  ).toBeVisible({ timeout: 25_000 });
  await expect(officer.getByRole("button", { name: "Financial Overview" })).toBeVisible({
    timeout: 20_000,
  });

  // The project number is the handle Accounting reaches this job by in stage 8 —
  // they never see the quotation and never open the booking (E10), so this is
  // the only reference that crosses into their module.
  const projectNumber = (await officer.getByText(/^PRJ-\d{6}$/).first().innerText()).trim();
  expect(projectNumber, "no project number on the converted project").toMatch(/^PRJ-/);

  // ── Stage 6a — Pricing seeds the booking from the project ─────────────────
  // Conversion left the officer on the project file. The booking is raised from
  // there, which is a Pricing/BD action by design (E10) and is gated on the door
  // they came in through — pricing_projects_bookings_tab — on both the button
  // and the bookings INSERT policy (E9).
  await officer.getByRole("button", { name: "Operations", exact: true }).last().click();
  await officer.waitForTimeout(2_500);
  await officer.getByRole("button", { name: "Bookings", exact: true }).last().click();
  await officer.waitForTimeout(3_000);

  const createBooking = officer.getByRole("button", { name: /Create .*Booking/ }).first();
  await expect(createBooking).toBeVisible({ timeout: 20_000 });
  await createBooking.scrollIntoViewIfNeeded();
  await createBooking.dispatchEvent("click");

  await expect(officer.getByRole("heading", { name: /New Forwarding Booking/ })).toBeVisible({
    timeout: 20_000,
  });

  // The modal arrives pre-filled from the project — customer, booking name,
  // quotation reference and project link are all carried across. Capture the
  // booking number so Operations can be asked to find this exact one.
  // Booking Number, Service Type and the quotation reference are rendered as
  // read-only TEXT, not inputs — so neither input[value^=…] nor inputValue()
  // reaches them.
  const bookingNumber = (
    await officer.getByText(/^FWD\d+-\d+$/).first().innerText()
  ).trim();
  expect(bookingNumber, "no booking number on the form").toMatch(/^FWD/);

  // The modal carries the project across: customer, booking name, the quotation
  // it came from, and the project link. That seeding is the part of stage 6 the
  // spine can prove today, and it is a real assertion — it is what makes the
  // booking traceable back to the quote BD raised in stage 1.
  await expect(officer.getByText(quoteNumber).first()).toBeVisible({ timeout: 15_000 });
  await expect(officer.getByText(CUSTOMER).first()).toBeVisible({ timeout: 15_000 });

  // Two required fields are not seeded from the project: Mode, and the service's
  // supervisor role. The second one IS the handoff — naming an Operations person
  // on the booking is what hands the job over, exactly as assigning a reviewer
  // handed the quotation to Pricing in stage 3.
  await officer.getByText("Select Mode...").first().click();
  await officer.waitForTimeout(1_000);
  await officer.getByText("FCL", { exact: true }).first().click();
  await officer.waitForTimeout(800);

  await officer.getByText("— None —").first().click();
  await officer.waitForTimeout(1_000);
  await officer.getByText(OPS_NAME, { exact: true }).first().click({ timeout: 15_000 });
  await officer.waitForTimeout(800);

  // "Create Booking" also matches the dropdown on the page behind the modal.
  // The modal renders last, so its submit is the final match.
  await officer.getByRole("button", { name: "Create Booking" }).last().click();
  await officer.waitForTimeout(6_000);

  await expect(
    officer.getByRole("heading", { name: /New Forwarding Booking/ }),
    "the booking form did not close — a required field is still unsatisfied"
  ).toHaveCount(0, { timeout: 20_000 });

  // ── Stage 6b — Operations picks it up, in their own list ──────────────────
  // The real Pricing -> Ops handoff. Ops never opens the project file (E10), so
  // the booking has to reach them through their own service list or the chain
  // is broken between departments.
  const opsContext = await browser.newContext();
  const ops = await signIn(opsContext, OPS);

  await ops.goto("/operations/forwarding", { waitUntil: "domcontentloaded" });
  await ops.waitForTimeout(3_000);
  // Search by booking NUMBER — it is what this list matches on, the same way the
  // quotation list matches quote_number. (The booking name IS persisted, to the
  // bookings.name column via a storageKey mapping; an earlier comment here
  // claimed otherwise and was wrong.)
  await ops.getByPlaceholder(/Search/i).first().fill(bookingNumber);
  await ops.waitForTimeout(3_500);

  await expect(
    ops.getByText(bookingNumber).first(),
    `Operations cannot see ${bookingNumber} after Pricing raised it from the project and named them supervisor — the Pricing -> Ops handoff is broken`
  ).toBeVisible({ timeout: 25_000 });

  // ── Stage 7a — the job costs money: Operations raises the e-voucher ───────
  // Same person, same session as stage 6b. The expense is booked to the booking
  // they just picked up, which is what makes the two stages one story rather
  // than two unrelated records.
  await ops.goto("/my-evouchers", { waitUntil: "domcontentloaded" });
  await expect(ops.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 20_000 });

  await ops.getByRole("button", { name: "New Request" }).click();
  await expect(ops.getByRole("heading", { name: "Reimbursement Request" })).toBeVisible({
    timeout: 15_000,
  });

  // Vendor — registry-only (NEU-046). The trigger carries the field's aria-label
  // rather than its visible text, so it is addressed by that; the label itself
  // follows the transaction type, which here is Reimbursement.
  await ops.getByRole("button", { name: "Paid To (Vendor)" }).click();
  await ops.getByPlaceholder("Search registered vendors...").fill("UTOC");
  await ops.waitForTimeout(800);
  await ops.getByRole("button", { name: VENDOR, exact: true }).click({ timeout: 15_000 });
  await ops.waitForTimeout(500);

  // The line item, out of the Expense Catalog. Adding a category seeds one empty
  // line, so there is no "Add Item" to click for the first one.
  await ops.getByRole("button", { name: "Add Category" }).click();
  await ops.getByPlaceholder("Search or type category name...").fill("FORWARDING");
  await ops.waitForTimeout(800);
  await ops.getByRole("button", { name: EXPENSE_CATEGORY, exact: true }).click({ timeout: 15_000 });
  await ops.waitForTimeout(800);

  const itemInput = ops.getByPlaceholder("Select or type item...").first();
  await itemInput.click();
  await itemInput.fill("OCEAN");
  await ops.waitForTimeout(1_200);
  // Exact, because the combobox also offers a quick-create button reading
  // `Add "OCEAN"` — picking that would create a catalog item, not use one.
  await ops.getByRole("button", { name: CATALOG_ITEM, exact: true }).click({ timeout: 15_000 });
  await ops.waitForTimeout(500);

  await ops.getByPlaceholder("0.00").first().fill("1500");

  // D2: the line must name a booking. This is the link that makes the expense
  // part of the job rather than loose office spend — and it is also the signal
  // the routing engine reads to decide who approves.
  await ops.getByRole("button", { name: "Line item booking" }).click();
  await ops.getByPlaceholder("Search bookings…").fill(bookingNumber);
  await ops.waitForTimeout(1_200);
  await ops.getByRole("button", { name: new RegExp(bookingNumber) }).first().click({ timeout: 15_000 });
  await ops.waitForTimeout(500);

  const submitRequest = ops.getByRole("button", { name: "Submit Request" });
  await expect(
    submitRequest,
    "Submit Request is still disabled — vendor, catalog line or amount did not take"
  ).toBeEnabled({ timeout: 10_000 });
  await submitRequest.click();

  await expect(
    ops.getByRole("heading", { name: "Reimbursement Request" }),
    "the voucher form did not close — the submit was rejected"
  ).toHaveCount(0, { timeout: 25_000 });

  // The voucher auto-titles itself "<Type> · <booking> · <date>", and
  // that title is stored as the purpose — which is what this list searches on.
  // So the booking number finds the voucher raised against it.
  await ops.getByPlaceholder(/Search by voucher number/).fill(bookingNumber);
  await ops.waitForTimeout(3_000);

  const evNumber = (await cell(ops, /^EV-\d{4}-\d{4}$/).innerText()).trim();
  expect(evNumber, "no e-voucher number in the requestor's list").toMatch(/^EV-/);

  await expect(
    cell(ops, "Pending Manager Approval"),
    `${evNumber} did not leave draft — submit did not advance the status`
  ).toBeVisible({ timeout: 20_000 });

  // ── Stage 7b — routing, proved from both sides ────────────────────────────
  // Negative half first, while it is still at pending_manager: the requestor's
  // OWN department manager must NOT have it. She holds my_evouchers:approve and
  // Princess reports to her, so if routing were not materialized this voucher
  // would land here.
  const opsMgrContext = await browser.newContext();
  const opsMgr = await signIn(opsMgrContext, OPS_MANAGER);
  await opsMgr.goto("/approvals", { waitUntil: "domcontentloaded" });
  await expect(opsMgr.getByRole("heading", { name: "Approvals" })).toBeVisible({ timeout: 20_000 });
  await opsMgr.getByPlaceholder(/Search by number or requestor/).fill(evNumber);
  await opsMgr.waitForTimeout(3_000);

  await expect(
    opsMgr.getByText(evNumber),
    `${evNumber} reached the Operations manager — the Forwarding routing rule did not redirect it to Pricing`
  ).toHaveCount(0);

  // Positive half: it is sitting with the Pricing Manager instead, because the
  // line is booked to a Forwarding booking. Same session as stages 2-3.
  await pricing.goto("/approvals", { waitUntil: "domcontentloaded" });
  await expect(pricing.getByRole("heading", { name: "Approvals" })).toBeVisible({ timeout: 20_000 });
  await pricing.getByPlaceholder(/Search by number or requestor/).fill(evNumber);
  await pricing.waitForTimeout(3_000);

  await expect(
    cell(pricing, evNumber),
    `the Pricing Manager cannot see ${evNumber} — the routed approval never arrived`
  ).toBeVisible({ timeout: 25_000 });

  await cell(pricing, evNumber).click();
  // "Approve" exactly — the CEO's button reads "Approve (CEO)" and only one of
  // the two is ever offered, so an inexact match would hide a wrong-gate bug.
  const managerApprove = pricing.getByRole("button", { name: "Approve", exact: true });
  await expect(
    managerApprove,
    "the manager approve action is not offered at pending_manager"
  ).toBeVisible({ timeout: 20_000 });
  await managerApprove.click();
  await pricing.waitForTimeout(4_000);

  await expect(
    pricing.getByText(evNumber),
    "the voucher is still in the Pricing Manager's queue after approving"
  ).toHaveCount(0, { timeout: 20_000 });

  // ── Stage 7c — the CEO signs off ──────────────────────────────────────────
  // A different gate entirely (acct_evouchers:approve, not my_evouchers), held
  // by Executive. If the manager step had not advanced the status this queue
  // would be empty, so arrival here is the assertion.
  const execContext = await browser.newContext();
  const exec = await signIn(execContext, EXEC);

  await exec.goto("/approvals", { waitUntil: "domcontentloaded" });
  await expect(exec.getByRole("heading", { name: "Approvals" })).toBeVisible({ timeout: 20_000 });
  await exec.getByPlaceholder(/Search by number or requestor/).fill(evNumber);
  await exec.waitForTimeout(3_000);

  await expect(
    cell(exec, evNumber),
    `${evNumber} never reached the CEO after the manager approved it`
  ).toBeVisible({ timeout: 25_000 });

  await cell(exec, evNumber).click();
  const ceoApprove = exec.getByRole("button", { name: "Approve (CEO)" });
  await expect(ceoApprove, "the CEO approve action is not offered at pending_ceo").toBeVisible({
    timeout: 20_000,
  });
  await ceoApprove.click();
  await exec.waitForTimeout(4_000);

  // ── Stage 7d — Treasury releases the cash ─────────────────────────────────
  // The narrowest gate in the company: acct_evouchers:disburse, held by two
  // people. Treasury works its own queue, not /approvals — the disburse step is
  // not an approval, so it never appears there.
  const treasuryContext = await browser.newContext();
  const treasury = await signIn(treasuryContext, TREASURY);

  await treasury.goto("/accounting/evouchers", { waitUntil: "domcontentloaded" });
  await expect(treasury.getByRole("heading", { name: "E-Vouchers" })).toBeVisible({ timeout: 20_000 });
  await treasury.getByPlaceholder(/Search voucher #/).fill(evNumber);
  await treasury.waitForTimeout(3_000);

  await expect(
    cell(treasury, evNumber),
    `${evNumber} is not in Treasury's Pending Disburse queue after CEO approval`
  ).toBeVisible({ timeout: 25_000 });

  await cell(treasury, evNumber).click();
  const disburse = treasury.getByRole("button", { name: "Disburse", exact: true });
  await expect(disburse, "Disburse is not offered to Treasury at pending_accounting").toBeVisible({
    timeout: 20_000,
  });
  await disburse.click();

  // Disbursement is its own page, not a panel action — releasing cash is
  // deliberately not a one-click affair.
  await expect(treasury.getByRole("heading", { name: "Disbursement Details" })).toBeVisible({
    timeout: 25_000,
  });
  // Cash, so no reference number is required (Check and Bank Transfer both
  // demand one before Confirm enables).
  await treasury.selectOption("#disb-method", "Cash");
  await treasury.waitForTimeout(500);

  // "Disburse & Close", not "Confirm Disbursement": a reimbursement settles in
  // one step. Only a true advance parks in liquidation.
  const confirmDisburse = treasury.getByRole("button", { name: "Disburse & Close" });
  await expect(
    confirmDisburse,
    "the disburse page did not offer the direct-settle action for a reimbursement"
  ).toBeEnabled({ timeout: 15_000 });
  await confirmDisburse.click();
  await treasury.waitForTimeout(6_000);

  // THE CLOSING ASSERTION. The voucher has left the live queue and is in the
  // Archive as Posted — cash out, expense recorded, chain complete.
  await treasury.goto("/accounting/evouchers", { waitUntil: "domcontentloaded" });
  await treasury.getByRole("tab", { name: /Archive/ }).click({ timeout: 25_000 });
  await treasury.waitForTimeout(1_500);
  await treasury.getByPlaceholder(/Search voucher #/).fill(evNumber);
  await treasury.waitForTimeout(3_000);

  await expect(
    cell(treasury, evNumber),
    `${evNumber} did not land in the Archive — the disbursement did not post it`
  ).toBeVisible({ timeout: 25_000 });
  await expect(
    cell(treasury, "Posted"),
    `${evNumber} is in the Archive but not Posted`
  ).toBeVisible({ timeout: 20_000 });

  // ── Stage 8a — the job earns money: the charge is raised ─────────────────
  // Doctrinally this is Operations' step — they know what the job cost the
  // client, they hold ops_forwarding_billings_tab create/edit/delete, and the
  // Billings tab is right there on their booking. It does not work: every
  // billing_line_items policy calls current_user_can_view_record('billings',
  // NULL), and a NULL owner returns false for every dial except org_wide /
  // everything. Princess is on "team", so the DB refuses the insert — "new row
  // violates row-level security policy" — after the UI let her fill the row.
  // In dev that locks all 41 BD/Pricing/Operations users out of billings and
  // leaves the 17 in Accounting/Executive. See E15.
  //
  // So Accounting raises it, from the project file — the only container they can
  // reach (E10 keeps them out of the Operations booking). When E15 is fixed this
  // step should move back to the booking, where it belongs.
  await treasury.goto("/accounting/projects", { waitUntil: "domcontentloaded" });
  await treasury.waitForTimeout(2_500);
  await treasury.getByPlaceholder(/Search projects/).fill(projectNumber);
  await treasury.waitForTimeout(3_000);
  await expect(
    treasury.getByText(projectNumber).first(),
    `Accounting cannot see ${projectNumber} — the project never reached their module`
  ).toBeVisible({ timeout: 25_000 });
  await treasury.getByText(projectNumber).first().click();

  // Project file tabs are two-tier: category, then the tab itself.
  await treasury.getByRole("button", { name: "Accounting", exact: true }).last().click();
  await treasury.waitForTimeout(2_000);
  await treasury.getByRole("button", { name: "Billings", exact: true }).last().click();
  await treasury.waitForTimeout(3_000);

  // In the PROJECT view the table groups by service, not by category, so the
  // header's "Add Billing" is the only way in — there are no category headers to
  // hang an "Add Item" off. (In the BOOKING view it is the reverse, and there
  // "Add Billing" files the row under an undisplayed category — see E14.)
  await treasury.getByRole("button", { name: "Add Billing" }).click();
  await treasury.waitForTimeout(1_500);

  // The row edits in place — no modal. The charge name is a CatalogItemCombobox
  // over the Billing Catalog (side=revenue), the mirror of the expense side.
  const billingItemInput = treasury.getByPlaceholder("Item description").first();
  await billingItemInput.click();
  await billingItemInput.fill("CRATING");
  await treasury.waitForTimeout(1_200);
  await treasury.getByRole("button", { name: BILLING_ITEM, exact: true }).click({ timeout: 15_000 });
  await treasury.waitForTimeout(500);

  await treasury.getByPlaceholder("Price").first().fill(String(BILLING_AMOUNT));
  await treasury.waitForTimeout(500);

  // Naming the service is LAST on purpose. At project level the booking is
  // resolved FROM the service — a line whose service matches no linked booking
  // is refused at save ("Every billing row must be assigned to a real booking"),
  // which is D1 enforced in the client. But setting it re-groups the row into a
  // service group that was never expanded, so the row vanishes from view mid-edit
  // (E14). Filling it in first sidesteps that; the value still saves.
  await treasury.getByRole("button", { name: "General", exact: true }).last().click();
  await treasury.waitForTimeout(800);
  await treasury.getByRole("button", { name: "Forwarding", exact: true }).first().click({ timeout: 15_000 });
  await treasury.waitForTimeout(800);

  await treasury.getByRole("button", { name: "Save Changes" }).click();
  await treasury.waitForTimeout(5_000);

  // Saved means the pending-changes bar is gone and the charge is a real row.
  await expect(
    treasury.getByRole("button", { name: "Save Changes" }),
    "the billing row did not save — the pending-changes bar is still up"
  ).toHaveCount(0, { timeout: 20_000 });
  // The saved row sits inside the Forwarding service group, which is collapsed
  // (it did not exist when the table decided what to expand), so open it before
  // looking for the charge.
  await treasury.getByText("1 item").first().click({ timeout: 20_000 });
  await treasury.waitForTimeout(1_000);
  // The charge name lives in an input (the row stays editable), so it is a VALUE,
  // not text. And the group header now carries the link the whole chain depends
  // on: this charge belongs to the booking Operations picked up in stage 6.
  await expect(
    treasury.getByPlaceholder("Item description").first(),
    `${BILLING_ITEM} is not on the project after saving`
  ).toHaveValue(BILLING_ITEM, { timeout: 20_000 });
  await expect(
    treasury.getByText(new RegExp(`Linked to ${bookingNumber}`)).first(),
    `the charge saved but is not linked to ${bookingNumber}`
  ).toBeVisible({ timeout: 20_000 });

  // ── Stage 8b — Accounting turns the charge into an invoice ───────────────
  // Still Janice, one tab across. The invoice is built FROM the unbilled charge:
  // picking it is what claims it (the line flips to `invoiced` and is frozen), so
  // the same money can never be billed twice.
  await treasury.getByRole("button", { name: "Invoices", exact: true }).last().click();
  await treasury.waitForTimeout(3_000);
  await treasury.getByRole("button", { name: "New Invoice" }).click();
  await treasury.waitForTimeout(3_000);

  // The charge reads as plain text here, not an input — the builder lists what is
  // billable, it does not edit it. Clicking the row selects it.
  await treasury.getByText(BILLING_ITEM).first().click({ timeout: 20_000 });
  await treasury.waitForTimeout(1_500);

  // D1: an invoice must be booking-linked. The project has exactly one booking —
  // the one from stage 6 — so the builder pins it rather than asking.
  const saveDraft = treasury.getByRole("button", { name: "Save as Draft" });
  await expect(
    saveDraft,
    "Save as Draft is disabled — no charge selected, or the invoice has no booking to link to"
  ).toBeEnabled({ timeout: 15_000 });
  await saveDraft.click();
  await treasury.waitForTimeout(7_000);

  // Numbering is derived from the booking: <booking>-001. That is the reference
  // the approver and the collection both work from.
  const invoiceNumber = (
    await treasury.getByText(new RegExp(`^${bookingNumber}-\\d{3}$`)).first().innerText()
  ).trim();
  expect(invoiceNumber, "no invoice number after saving the draft").toContain(bookingNumber);

  // ── Stage 8c — the invoice is approved by the OPERATIONS manager ─────────
  // The routing engine again, pointing the other way. The evoucher rule sent an
  // Ops-raised expense to Pricing; the invoice rule ("Invoice approval →
  // Operations manager") sends an Accounting-raised invoice to Operations. So
  // Mariella, who was deliberately not the approver in stage 7, is the approver
  // here — and until she acts the invoice cannot be finalized.
  await opsMgr.goto("/approvals", { waitUntil: "domcontentloaded" });
  await opsMgr.waitForTimeout(2_500);
  await opsMgr.getByPlaceholder(/Search by number or requestor/).fill(invoiceNumber);
  await opsMgr.waitForTimeout(3_000);

  await expect(
    cell(opsMgr, invoiceNumber),
    `${invoiceNumber} never reached the Operations manager — the invoice routing rule did not fire`
  ).toBeVisible({ timeout: 25_000 });
  await cell(opsMgr, invoiceNumber).click();

  const approveInvoice = opsMgr.getByRole("button", { name: "Approve Invoice" });
  await expect(
    approveInvoice,
    "the invoice review drawer did not offer Approve Invoice"
  ).toBeVisible({ timeout: 20_000 });
  await approveInvoice.click();
  await opsMgr.waitForTimeout(4_000);

  // Count CELLS, not text: the success toast quotes the invoice number, so a
  // plain text count never reaches zero while it is still on screen.
  await expect(
    opsMgr.getByRole("cell", { name: invoiceNumber }),
    "the invoice is still in the Operations manager's queue after approving"
  ).toHaveCount(0, { timeout: 20_000 });

  // ── Stage 8d — Accounting issues the approved invoice ────────────────────
  // Approval and issuing are two different acts by two different people: the
  // approver says the number is right, Accounting sends it. Finalize is blocked
  // outright until approval lands, so reaching Posted proves stage 8c took.
  await treasury.reload({ waitUntil: "domcontentloaded" });
  await treasury.waitForTimeout(4_000);
  await treasury.getByRole("button", { name: "Accounting", exact: true }).last().click();
  await treasury.waitForTimeout(1_500);
  await treasury.getByRole("button", { name: "Invoices", exact: true }).last().click();
  await treasury.waitForTimeout(3_000);
  await cell(treasury, invoiceNumber).click({ timeout: 25_000 });

  const finalize = treasury.getByRole("button", { name: "Finalize Invoice" });
  await expect(
    finalize,
    "Finalize Invoice is not offered — the invoice is still pending approval"
  ).toBeVisible({ timeout: 25_000 });
  await finalize.click();
  await treasury.waitForTimeout(6_000);

  // ── Stage 8e — the client pays ───────────────────────────────────────────
  // The last hop of the whole spine. A collection is recorded against the open
  // invoice; entering the amount auto-applies it to the oldest open balance,
  // which is what settles the receivable.
  await treasury.getByRole("button", { name: "Collections", exact: true }).last().click();
  await treasury.waitForTimeout(3_000);
  await treasury.getByRole("button", { name: "Record Collection" }).click();
  await treasury.waitForTimeout(3_000);

  await treasury.getByPlaceholder("0.00").first().fill(String(BILLING_AMOUNT));
  await treasury.waitForTimeout(1_500);

  const saveCollection = treasury.getByRole("button", { name: "Save & Close" });
  await expect(
    saveCollection,
    "Save & Close is disabled — the amount received did not register"
  ).toBeEnabled({ timeout: 15_000 });
  await saveCollection.click();
  await treasury.waitForTimeout(7_000);

  // THE CLOSING ASSERTION FOR THE WHOLE SPINE. Back on Invoices, the receivable
  // is settled: the money BD won in stage 1 has been billed, approved, issued
  // and collected against the booking Operations ran.
  await treasury.getByRole("button", { name: "Invoices", exact: true }).last().click();
  await treasury.waitForTimeout(4_000);

  await expect(
    cell(treasury, invoiceNumber),
    `${invoiceNumber} is not on the project's invoice list after collection`
  ).toBeVisible({ timeout: 25_000 });
  await expect(
    cell(treasury, "Paid"),
    `${invoiceNumber} did not settle — the collection was not applied to it`
  ).toBeVisible({ timeout: 25_000 });

  await bdContext.close();
  await pricingContext.close();
  await officerContext.close();
  await opsContext.close();
  await opsMgrContext.close();
  await execContext.close();
  await treasuryContext.close();
});
