// Shared helpers for the Neuron Main spine (attack A5).
import { execFileSync } from "node:child_process";
import type { Browser, Page } from "@playwright/test";

/** Every persona signs in as themselves. Passwords are the migration's shared dev hash. */
export const PASSWORD = "devpassword123";

/**
 * Read from Main's LOCAL database. Goes through the container rather than a
 * driver so the harness needs no new dependency in this repo, and so it is
 * structurally incapable of reaching anything but the local stack — there is no
 * connection string to mistype (SAFETY-TETHER.md §1).
 */
export function db(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "neuron-postgres", "psql", "-U", "neuron", "-d", "theta", "-t", "-A", "-c", sql],
    { encoding: "utf8", timeout: 30_000 },
  ).trim();
}

export function dbRows(sql: string): string[] {
  const out = db(sql);
  return out ? out.split(/\r?\n/) : [];
}

/** A signed-in browser context for one person. Each persona gets their own. */
export async function signIn(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

/**
 * Who does the app think is signed in? Guards against a persona mix-up.
 *
 * Read from the SIDEBAR, not from /auth/me: the token does not live in a cookie,
 * so `page.request` would go out anonymous and report "?" for a perfectly good
 * session. Reading what the user is shown is also the more honest assertion.
 */
export async function whoAmI(page: Page): Promise<string> {
  const card = page.locator('a[href="/settings"]').first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  return (await card.innerText()).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" / ");
}

/**
 * A5 records where the chain STOPS as a finding rather than failing the run.
 * Main is pre-launch; a screen that isn't built is data, not a broken test.
 */
export const chain: Array<{ stage: string; actor: string; outcome: string; note?: string }> = [];

export function record(stage: string, actor: string, outcome: string, note?: string) {
  chain.push({ stage, actor, outcome, note });
  const line = `  [${outcome.padEnd(7)}] ${stage}  —  ${actor}${note ? `\n              ${note}` : ""}`;
  console.log(line);
}

export function printChain() {
  console.log("\n──────── A5 · Brokerage spine — where the chain got to ────────");
  for (const c of chain) {
    console.log(`  ${c.outcome.padEnd(7)} │ ${c.stage.padEnd(34)} │ ${c.actor}`);
    if (c.note) console.log(`          │ ${c.note}`);
  }
  console.log("───────────────────────────────────────────────────────────────\n");
}
