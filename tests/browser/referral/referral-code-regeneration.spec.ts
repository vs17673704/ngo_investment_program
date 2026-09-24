import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { subDays } from "date-fns";
import { prisma, loginViaUi } from "../../helpers";

// BRD Rule XII: a user may regenerate/rotate their referral code. The
// previous code must become inactive for new registrations while existing
// referral relationships remain associated with the original referring user.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("BRD Rule XII: regenerating a referral code rotates the code but preserves existing referral relationships", async ({ page }) => {
  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);

  const referrer = await prisma.user.create({
    data: {
      email: `pw-rot-referrer-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWR${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referred = await prisma.user.create({
    data: {
      email: `pw-rot-referred-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWS${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referral = await prisma.referral.create({
    data: {
      referrerUserId: referrer.id,
      referredUserId: referred.id,
      referralCodeUsed: referrer.referralCode,
      status: "ACTIVE",
      expiryDate: subDays(new Date(), -365),
    },
  });

  const originalCode = referrer.referralCode;

  await loginViaUi(page, referrer.email, "Passw0rd!123");
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/referrals");
  await expect(page.getByText(originalCode, { exact: true }).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Regenerate / rotate referral code" }).click(),
  ]);

  const updatedReferrer = await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } });
  expect(updatedReferrer.referralCode).not.toBe(originalCode);
  expect(updatedReferrer.referralCode).toMatch(/^[A-Z0-9]{8}$/);
  expect(updatedReferrer.referralCodeActive).toBe(true);

  // Existing relationship is keyed by referrerUserId, not by the code string.
  const unchangedReferral = await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } });
  expect(unchangedReferral.referrerUserId).toBe(referrer.id);
  expect(unchangedReferral.referralCodeUsed).toBe(originalCode);
  expect(unchangedReferral.status).toBe("ACTIVE");

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "REFERRAL_CODE_REGENERATED", entityRef: referrer.id },
    orderBy: { timestamp: "desc" },
  });
  expect(audit).not.toBeNull();

  // The old code must no longer resolve to any user (inactive for new registrations).
  const staleCodeOwner = await prisma.user.findUnique({ where: { referralCode: originalCode } });
  expect(staleCodeOwner).toBeNull();

  await prisma.commission.deleteMany({ where: { referralId: referral.id } });
  await prisma.referral.deleteMany({ where: { id: referral.id } });
});
