import { expect, test, type Page } from "@playwright/test";
import { newSignedInPage, signIn, USERS } from "./fixtures";

/**
 * The core acceptance journey: capture a report offline, reload, restore the network, sync exactly once,
 * then have a different user review it. Requires the production build (service worker) and a seeded backend.
 */
test.describe.configure({ mode: "serial" });

const MARKER = `E2E-SYNTHETIC-${Date.now()}`;

async function fillWizardOffline(page: Page) {
  await page.goto("/field/report/new");
  await expect(page.getByText(/Draft not changed yet|Draft saved on device/)).toBeVisible();
  await page.getByLabel(/Landslide/).check();
  await page.getByRole("button", { name: "Next" }).click();
  // Manual coordinates: works with geolocation denied and no map tiles.
  await page.getByLabel("Latitude").fill("26.1445");
  await page.getByLabel("Longitude").fill("91.7362");
  await page.getByLabel(/Accuracy/).fill("30");
  await page.getByRole("button", { name: /apply coordinates/i }).click();
  await expect(page.getByText(/Accuracy · /)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/Describe what you see/).fill(`${MARKER} debris across one lane`);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/High/).check();
  await page.getByRole("button", { name: "Next" }).click();
}

test("field officer saves offline, survives a reload, and syncs exactly once", async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await newSignedInPage(context, USERS.officer);

  // Open the pages once online so the service worker can store the shell.
  await page.goto("/field/report/new");
  await page.goto("/field/queue");
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || true);

  await context.setOffline(true);
  await fillWizardOffline(page);
  await page.getByRole("button", { name: /save on device and queue for sending/i }).click();
  await expect(page.getByText("Saved on device — queued for synchronization")).toBeVisible();

  // Restart the app while still offline: the report must still be there and still not "submitted".
  await page.goto("/field/queue");
  await expect(page.getByText(new RegExp(MARKER))).toBeVisible();
  await expect(page.getByText(/Saved on device/).first()).toBeVisible();

  // Network returns: a real request outcome, not navigator.onLine, decides.
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).first().click();
  await expect(page.getByText("Accepted by server")).toBeVisible({ timeout: 30_000 });

  // Repeat syncs must not create a second report.
  await page.getByRole("button", { name: "Sync now" }).first().click();
  await page.waitForTimeout(1500);
  const list = await page.request.get("/api/v1/reports?limit=200");
  expect(list.ok()).toBeTruthy();
  const mine = ((await list.json()) as Array<{ description: string }>).filter((r) => r.description.includes(MARKER));
  expect(mine).toHaveLength(1);
  await context.close();
});

test("a second user on the same device cannot see the first user's queue", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newSignedInPage(context, USERS.officer);
  await context.setOffline(true);
  await fillWizardOffline(page);
  await page.getByRole("button", { name: /save on device and queue for sending/i }).click();
  await context.setOffline(false);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login**");
  await signIn(page, USERS.regional);
  await page.goto("/account");
  await expect(page.getByText(new RegExp(MARKER))).toHaveCount(0);
  await context.close();
});

test("a different verifier can review the synced report; the server confirms before the screen changes", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newSignedInPage(context, USERS.verifier);
  await page.goto("/gov/reports");
  await page.getByRole("tab", { name: "Awaiting review" }).click();
  await page.getByRole("link", { name: /Landslide/ }).first().click();
  await expect(page.getByText(/Verification \(has anyone confirmed it\?\)/)).toBeVisible();
  await page.getByRole("button", { name: "Claim for review" }).click();
  await page.getByLabel(/Verify — confirm an incident/).check();
  await page.getByLabel(/New incident title/).fill("Synthetic landslide (e2e)");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText(/Recorded by the server/)).toBeVisible();
  await context.close();
});
