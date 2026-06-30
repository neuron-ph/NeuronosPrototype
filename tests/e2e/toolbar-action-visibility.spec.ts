import { test, expect, Page } from "@playwright/test";

// §3 GUARDRAIL — a primary action in a detail-view toolbar must never be hidden
// behind content at any window width. This encodes the invariant from the
// "Confirm Assign disappears when assigning" bug: the action bar must grow/wrap,
// never clip its controls behind the page content.
//
// Mechanism of the original bug: selecting an assignee inserts the
// "Price by + Cancel + Confirm Assign" cluster into the toolbar action row.
// On a narrow-ish window the row overflowed, wrapped below the tabs, and
// rendered *behind* the General Details card — so Confirm Assign was present in
// the DOM but invisible and unclickable. Wider/priced quotes ("Review & Submit
// Pricing" label) crossed the overflow threshold ~79px sooner than clean quotes
// ("Add Pricing"), which is why it broke on "those two" but not others.
const PASSWORD = "devpassword123";
const JAYSON = "jr.manager03@falconslogistics-ph.com";

// One historically-wide quote (priced) and one narrow (clean). Both must stay
// clickable at every width.
const QUOTES = [
  { id: "QUO-1782435505838", label: "priced quote (wide toolbar)" },
  { id: "QUO-1782570702906", label: "clean quote (narrow toolbar)" },
];
// Include widths that broke before the fix (≤1540 for priced, ≤1460 for clean).
const WIDTHS = [1280, 1366, 1440, 1500, 1600, 1920];

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0, { timeout: 25_000 });
}

for (const q of QUOTES) {
  test(`Confirm Assign stays clickable at every width — ${q.label}`, async ({ page }) => {
    await login(page, JAYSON);
    await page.goto(`/pricing/quotations/${q.id}`);

    // Open the assignee dropdown and pick a staffer → reveals "Confirm Assign".
    const assignTrigger = page.getByText("Unassigned", { exact: true }).first();
    await expect(assignTrigger).toBeVisible({ timeout: 25_000 });
    await assignTrigger.click();
    await page.getByText(/Nevan Mordred|Reuben James|Sarah May|Zairah Joice|Genevieve Lae/).first().click();
    const confirm = page.getByRole("button", { name: "Confirm Assign" });
    await expect(confirm).toBeVisible({ timeout: 10_000 });

    const tabsRow = page.getByRole("tab", { name: "Details" });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const box = await confirm.boundingBox();
      expect(box, `Confirm Assign has no box at ${width}px`).not.toBeNull();
      const b = box!;
      const tab = (await tabsRow.boundingBox())!;

      // (1) Fully inside the viewport horizontally — not pushed off-screen.
      expect(b.x, `Confirm Assign off left edge at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `Confirm Assign off right edge at ${width}px`).toBeLessThanOrEqual(width + 1);

      // (2) The assign cluster lives in the HEADER, above the tabs — it must never
      //     render down in the tabs/actions toolbar. This is the intended design:
      //     picking an assignee reflows only the header, not the toolbar below.
      expect(b.y, `Confirm Assign dropped into the bottom toolbar at ${width}px (should be in the header)`).toBeLessThan(tab.y);

      // (3) Not occluded — hit-testing its center returns the button itself.
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const onTop = await page.evaluate(
        ({ cx, cy }) => document.elementFromPoint(cx, cy)?.closest("button")?.textContent?.includes("Confirm Assign") ?? false,
        { cx, cy }
      );
      expect(onTop, `Confirm Assign is hidden behind content at ${width}px on ${q.id}`).toBe(true);
    }
  });
}
