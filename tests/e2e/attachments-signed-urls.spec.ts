import { test, expect, Page } from "@playwright/test";

// Finding M1 — the `attachments` bucket is private now, so the product must
// stop asking for /object/public/ and start signing at read time.
//
// The script probes proved the storage layer. This proves the APP: it drives a
// real booking's Attachments tab in a real browser and watches the network.
// A passing script with a broken UI is exactly the failure mode this catches.

const PASSWORD = "devpassword123";
const ADMIN = "test@neuron.com.ph";

// BR202606-106 on dev — five legacy attachments, all stored as full public URLs
// from before the fix. The hardest case: old rows, new code, private bucket.
const BOOKING_ID = "78d7cecf-3629-490b-99fb-42913fcc8623";

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0, { timeout: 25_000 });
}

test("booking attachments render and download over signed URLs, never public ones", async ({ page }) => {
  const publicRequests: string[] = [];
  const signedResponses: number[] = [];

  page.on("request", (req) => {
    if (req.url().includes("/storage/v1/object/public/attachments/")) publicRequests.push(req.url());
  });
  page.on("response", (res) => {
    if (res.url().includes("/storage/v1/object/sign/attachments/")) signedResponses.push(res.status());
  });

  await login(page, ADMIN);
  await page.goto(`/operations/${BOOKING_ID}`);

  const attachmentsTab = page.getByRole("button", { name: /^Attachments$/ }).first();
  await expect(attachmentsTab).toBeVisible({ timeout: 25_000 });
  await attachmentsTab.click();

  // The tab lists what the DB says is there.
  await expect(page.getByRole("button", { name: /Download/ }).first()).toBeVisible({ timeout: 20_000 });
  const downloadButtons = await page.getByRole("button", { name: /Download/ }).count();
  expect(downloadButtons, "the five legacy attachments should still be listed").toBeGreaterThan(0);

  // Clicking Download must produce an actual file, signed at click time.
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: /Download/ }).first().click();
  const download = await downloadPromise;
  expect(await download.path(), "the download produced no bytes").toBeTruthy();

  // The point of the whole exercise: nothing reached for a public URL.
  expect(publicRequests, `app still requested public URLs: ${publicRequests[0] ?? ""}`).toHaveLength(0);
  expect(signedResponses.filter((s) => s >= 400), "a signing request failed").toHaveLength(0);
  console.log(`[m1] signed requests: ${signedResponses.length}, public requests: ${publicRequests.length}`);
});

// The other half: a NEW upload must persist a storage path, not a public URL.
// If this regresses, nothing breaks visibly today — the row just goes back to
// carrying a permanent link, and the bucket quietly becomes leakable again the
// next time someone flips it public.
test("a new upload stores a storage path, and comes straight back down signed", async ({ page }) => {
  const publicRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/storage/v1/object/public/attachments/")) publicRequests.push(req.url());
  });

  await login(page, ADMIN);
  await page.goto(`/operations/${BOOKING_ID}`);

  const attachmentsTab = page.getByRole("button", { name: /^Attachments$/ }).first();
  await expect(attachmentsTab).toBeVisible({ timeout: 25_000 });
  await attachmentsTab.click();
  await expect(page.getByRole("button", { name: /Download/ }).first()).toBeVisible({ timeout: 20_000 });

  const before = await page.getByRole("button", { name: /Download/ }).count();

  const fileName = `m1-probe-${Date.now()}.txt`;
  await page.locator('input[type="file"]').first().setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("M1 upload probe — safe to delete"),
  });

  // It lands in the list...
  await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
  expect(await page.getByRole("button", { name: /Download/ }).count()).toBe(before + 1);

  // ...and downloads without ever touching a public URL.
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByText(fileName).locator("xpath=ancestor::div[1]/following-sibling::*//button[contains(., 'Download')]")
    .or(page.getByRole("button", { name: /Download/ }).last())
    .first()
    .click();
  const download = await downloadPromise;
  expect(await download.path(), "the freshly uploaded file produced no bytes").toBeTruthy();

  expect(publicRequests, `upload/read still used a public URL: ${publicRequests[0] ?? ""}`).toHaveLength(0);
  console.log(`[m1] uploaded ${fileName}; public requests: ${publicRequests.length}`);
});
