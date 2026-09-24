import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getLatestOtpCode, uniqueSuffix } from "../../helpers";

// TS-172 / BRD "Social Login and 2FA" (line 2597-2600): successful social
// authentication shall never bypass the mandatory email-OTP 2FA step — the
// same pending-session + OTP gate as password login. Confirmed directly in
// src/app/(auth)/login/social/google/actions.ts (socialLoginAction): it calls
// createPendingTwoFactorSession + createOtp and redirects to /verify-2fa
// exactly like the password path, for both brand-new and linked accounts.
//
// TS-017 / BRD "Account Linking" (line 2602-2604): a social login whose
// provider email matches an existing verified account must link to that
// account rather than creating a duplicate — never a second User row for the
// same verified email.
//
// Google OAuth itself is simulated in-app (src/app/(auth)/login/social/google
// /page.tsx's own comment: "simulate external integrations rather than wiring
// a real provider") via a fake consent-screen form that just takes an email —
// there is no real provider redirect to intercept.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function submitGoogleConsent(page: import("playwright/test").Page, email: string) {
  await page.goto("/login/social/google");
  await page.locator('input[name="email"]').fill(email);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Authorize" }).click(),
  ]);
}

async function completeOtp(page: import("playwright/test").Page, email: string) {
  const code = await getLatestOtpCode(email, "LOGIN_2FA");
  await page.locator('input[name="code"]').fill(code);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Verify" }).click(),
  ]);
}

test("a brand-new Google social login creates exactly one User + SocialAccount, and still requires 2FA before reaching the dashboard", async ({ page }) => {
  const email = `pw-social-new-${uniqueSuffix()}@example.com`;

  await submitGoogleConsent(page, email);

  // Proof 2FA is not bypassed (TS-172): the social "Authorize" action lands
  // on /verify-2fa, not directly on a dashboard. The redirect after the
  // action's POST resolves is a delayed client-side navigation (same
  // "seeded navigation" behavior documented in account-lock-e2e.spec.ts), so
  // this must be awaited explicitly rather than read off page.url() the
  // instant the POST response arrives.
  await page.waitForURL("**/verify-2fa");
  await completeOtp(page, email);

  await page.waitForURL("**/dashboard");
  expect(new URL(page.url()).pathname).toBe("/dashboard");

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(user.role).toBe("USER");
  expect(user.passwordHash).toBeNull();
  expect(user.isEmailVerified).toBe(true);

  const socialAccounts = await prisma.socialAccount.findMany({ where: { userId: user.id } });
  expect(socialAccounts).toHaveLength(1);
  expect(socialAccounts[0].provider).toBe("GOOGLE");
  expect(socialAccounts[0].providerAccountId).toBe(`google:${email}`);

  await prisma.socialAccount.deleteMany({ where: { userId: user.id } });
  // The User row itself is intentionally left in place, matching this
  // suite's established no-fixture-User-deletion convention (see
  // payment-missed-instalments-maturity-e2e.spec.ts's cleanup comment): a
  // real login here has already created RefreshToken/LoginHistory/OtpCode
  // rows that no test in this suite deletes.
});

test("a Google social login for an email that already has a verified password-based account links to it instead of creating a duplicate, and still requires 2FA", async ({ page }) => {
  const email = `pw-social-link-${uniqueSuffix()}@example.com`;
  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);
  const existingUser = await prisma.user.create({
    data: {
      email,
      passwordHash,
      referralCode: `PWL${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });

  await submitGoogleConsent(page, email);
  await page.waitForURL("**/verify-2fa");
  await completeOtp(page, email);
  await page.waitForURL("**/dashboard");

  // BRD Account Linking: no duplicate User for the same verified email.
  const usersWithEmail = await prisma.user.findMany({ where: { email } });
  expect(usersWithEmail).toHaveLength(1);
  expect(usersWithEmail[0].id).toBe(existingUser.id);

  const socialAccounts = await prisma.socialAccount.findMany({ where: { userId: existingUser.id } });
  expect(socialAccounts).toHaveLength(1);
  expect(socialAccounts[0].provider).toBe("GOOGLE");

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "SOCIAL_ACCOUNT_LINKED", entityRef: existingUser.id },
    orderBy: { timestamp: "desc" },
  });
  expect(audit).not.toBeNull();

  // A second social login for the same email must not create a second
  // SocialAccount either — it re-resolves to the same linked account.
  const secondPage = page;
  await submitGoogleConsent(secondPage, email);
  await secondPage.waitForURL("**/verify-2fa");
  await completeOtp(secondPage, email);
  await secondPage.waitForURL("**/dashboard");

  const socialAccountsAfterSecondLogin = await prisma.socialAccount.findMany({ where: { userId: existingUser.id } });
  expect(socialAccountsAfterSecondLogin).toHaveLength(1);

  await prisma.socialAccount.deleteMany({ where: { userId: existingUser.id } });
});
