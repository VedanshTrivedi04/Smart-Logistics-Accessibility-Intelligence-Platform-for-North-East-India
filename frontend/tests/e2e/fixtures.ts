import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Labelled synthetic identities from backend/app/scripts/seed_demo.py (deterministic demo seed).
 * They exist only in test databases; nothing here is real personal data.
 */
export const ORG = {
  gov: "00000000-0000-4000-a000-000000000001",
  field: "00000000-0000-4000-a000-000000000002",
  logistics: "00000000-0000-4000-a000-000000000003",
} as const;

export const USERS = {
  regional: { id: "d0000001-0000-4000-8000-000000000001", org: ORG.gov, role: "REGIONAL_AUTHORITY", home: "/gov" },
  verifier: { id: "d0000003-0000-4000-8000-000000000003", org: ORG.gov, role: "DISTRICT_VERIFIER", home: "/gov" },
  emergency: { id: "d0000004-0000-4000-8000-000000000004", org: ORG.gov, role: "EMERGENCY_COORDINATOR", home: "/gov" },
  officer: { id: "d0000005-0000-4000-8000-000000000005", org: ORG.field, role: "FIELD_OFFICER", home: "/field" },
  fleet: { id: "d0000008-0000-4000-8000-000000000008", org: ORG.logistics, role: "FLEET_MANAGER", home: "/logistics" },
  operator: { id: "d0000010-0000-4000-8000-000000000010", org: ORG.logistics, role: "TRANSPORT_OPERATOR", home: "/logistics" },
} as const;

export type TestUser = (typeof USERS)[keyof typeof USERS];

/** Sign in through the real login form (development sign-in is enabled only in the e2e server). */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("User ID").fill(user.id);
  await page.getByLabel("Organization ID").fill(user.org);
  await page.getByLabel("Role").selectOption(user.role);
  await page.getByRole("button", { name: /start development session/i }).click();
  await page.waitForURL(`**${user.home}`);
}

export async function newSignedInPage(context: BrowserContext, user: TestUser): Promise<Page> {
  const page = await context.newPage();
  await signIn(page, user);
  return page;
}

export async function expectForbidden(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: /do not have access to this page/i })).toBeVisible();
}
