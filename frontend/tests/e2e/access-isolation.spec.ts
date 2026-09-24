import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectForbidden, newSignedInPage, signIn, USERS } from "./fixtures";

test.describe("three role surfaces with scoped users", () => {
  test("each role lands in its own workspace with its own navigation", async ({ browser }) => {
    for (const [name, expectedNav] of [
      ["officer", /Report incident/],
      ["fleet", /Live fleet map/],
      ["verifier", /Field reports/],
    ] as const) {
      const context = await browser.newContext();
      const page = await newSignedInPage(context, USERS[name]);
      await expect(page.getByRole("navigation", { name: /navigation/i }).getByText(expectedNav)).toBeVisible();
      await context.close();
    }
  });

  test("a field officer cannot open government or logistics pages", async ({ page }) => {
    await signIn(page, USERS.officer);
    await expectForbidden(page, "/gov");
    await expectForbidden(page, "/logistics/fleet");
  });

  test("a fleet manager cannot open the government or field workspaces", async ({ page }) => {
    await signIn(page, USERS.fleet);
    await expectForbidden(page, "/gov/incidents");
    await expectForbidden(page, "/field/queue");
  });

  test("hiding a menu is not authorization: the server refuses a role that lacks the capability", async ({ page }) => {
    await signIn(page, USERS.operator);
    const res = await page.request.get("/api/v1/logistics/vehicles");
    expect(res.status()).toBe(403);
  });

  test("a guessed identifier from another organization discloses nothing", async ({ page }) => {
    await signIn(page, USERS.fleet);
    const res = await page.request.get("/api/v1/logistics/trips/00000000-0000-4000-8000-00000000dead");
    expect([403, 404]).toContain(res.status());
  });

  test("account page states identity, scope and capabilities", async ({ page }) => {
    await signIn(page, USERS.officer);
    await page.goto("/account");
    await expect(page.getByText(/What your role allows/i)).toBeVisible();
    await expect(page.getByText(/submit report/i)).toBeVisible();
  });

  test("keyboard-only: skip link and focus reach the main content", async ({ page }) => {
    await signIn(page, USERS.verifier);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("sign-in and field home have no serious automated accessibility violations", async ({ page }) => {
    await page.goto("/login");
    const login = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(login.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await signIn(page, USERS.officer);
    const home = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(home.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    // Automated checks cover only part of WCAG 2.2 AA; manual keyboard and screen-reader review is still required.
  });
});
