import { addMonths, subMonths, subDays } from "date-fns";
import bcrypt from "bcryptjs";
import type { Page } from "playwright/test";
import { prisma, uniqueSuffix } from "../helpers";

export const TEST_PASSWORD = "Passw0rd!123";

/**
 * Real referral codes (src/lib/referral-code.ts's generateUniqueReferralCode)
 * are exactly 8 uppercase alphanumeric characters
 * (src/lib/validation/auth.ts's registerSchema enforces `^[A-Z0-9]{8}$`).
 * Fixture-created users must match this exactly, not just be "unique
 * enough" — a longer code is silently fine for tests that only ever
 * Prisma-seed a Referral row directly, but fails registerSchema validation
 * the moment a test drives a real UI registration with that code.
 */
function randomReferralCode(): string {
  return uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8).padStart(8, "0");
}

/**
 * Creates a fresh USER with a MATURED plan whose principal equals `balance`
 * and a matching LedgerEntry, so getRedeemableBalance()/getAvailableMargin()
 * (src/lib/redemption-engine.ts) report exactly `balance` with nothing
 * locked. This mirrors the real end-state of a plan after maturity (Rule
 * III/XXXI) without needing to run the full payment+maturity lifecycle
 * through the UI for every redemption test. The redemption action itself
 * (the thing under test) is always driven through the real UI afterwards.
 */
export async function createUserWithRedeemableBalance(balance: number) {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });

  const email = `pw-redeem-${uniqueSuffix()}@example.com`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const referralCode = randomReferralCode();

  const user = await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER", isEmailVerified: true },
  });

  const startDate = subMonths(new Date(), plan.tenureMonths + 1);
  const userPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: plan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: Number(plan.presetAmounts[0]),
      paymentFrequency: plan.paymentFrequency,
      status: "MATURED",
      principalPaid: balance,
      startDate,
      maturityDate: subDays(new Date(), 1),
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      userId: user.id,
      userPlanId: userPlan.id,
      transactionType: "INTEREST",
      amount: balance,
      balanceBefore: 0,
      balanceAfter: balance,
      description: "Test fixture: matured principal + interest credited",
    },
  });

  return { user, userPlan, email, password: TEST_PASSWORD };
}

/** Creates a referrer + a referred user (registered via the referrer's code)
 * and an ACCRUED commission for the referrer, so admin commission-lifecycle
 * tests and the referrals-page display test have deterministic data without
 * needing to drive an entire payment cycle through the UI. */
export async function createReferralWithAccruedCommission(amount: number) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const referrer = await prisma.user.create({
    data: {
      email: `pw-referrer-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWR${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referred = await prisma.user.create({
    data: {
      email: `pw-referred-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWD${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
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

  const commission = await prisma.commission.create({
    data: {
      referralId: referral.id,
      amount,
      status: "ACCRUED",
      commissionType: "ONE_TIME",
    },
  });

  return { referrer, referred, referral, commission, password: TEST_PASSWORD };
}

/** Creates a fresh, active DonationRecipient for the donation redemption flow. */
export async function createDonationRecipient(opts: { active?: boolean } = {}) {
  return prisma.donationRecipient.create({
    data: { name: `Test Donation Recipient ${uniqueSuffix()}`, active: opts.active ?? true },
  });
}

export async function cleanupTestUser(userId: string) {
  await prisma.ledgerEntry.deleteMany({ where: { userId } });
  await prisma.redemptionRequest.deleteMany({ where: { userId } });
  await prisma.franchiseeRedemptionEnquiry.deleteMany({ where: { userId } });
  await prisma.userPlan.deleteMany({ where: { userId } });
}

/** Creates a fresh, isolated USER (or ADMIN) account for tests that need a
 * dedicated account they can freely mutate (lock/unlock, 2FA, etc.) without
 * risking the shared seeded demo accounts. */
export async function createUser(opts: { role?: "USER" | "ADMIN"; verified?: boolean } = {}) {
  const { role = "USER", verified = true } = opts;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const email = `pw-${role.toLowerCase()}-${uniqueSuffix()}@example.com`;
  const referralCode = randomReferralCode();

  const user = await prisma.user.create({
    data: { email, passwordHash, referralCode, role, isEmailVerified: verified },
  });

  return { user, email, password: TEST_PASSWORD };
}

/** Creates a fresh, isolated ADMIN account. */
export async function createAdmin() {
  return createUser({ role: "ADMIN" });
}

/** Creates a fresh InterestCalculationMethod (SIMPLE by default). */
export async function createInterestMethod(opts: { ratePercent?: number; tenureMonths?: number } = {}) {
  const { ratePercent = 8, tenureMonths = 12 } = opts;
  return prisma.interestCalculationMethod.create({
    data: {
      name: `Test Interest Method ${uniqueSuffix()}`,
      formulaType: "SIMPLE",
      ratePercent,
      tenureMonths,
      dayCountBasis: "ACTUAL_365",
    },
  });
}

/** Creates a fresh Plan, optionally on top of an existing interest method. */
export async function createPlan(opts: {
  interestMethodId?: string;
  tenureMonths?: number;
  commissionPercent?: number;
  rewardPercent?: number;
  presetAmounts?: number[];
} = {}) {
  const tenureMonths = opts.tenureMonths ?? 12;
  const interestMethod = opts.interestMethodId
    ? await prisma.interestCalculationMethod.findUniqueOrThrow({ where: { id: opts.interestMethodId } })
    : await createInterestMethod({ tenureMonths });

  return prisma.plan.create({
    data: {
      name: `Test Plan ${uniqueSuffix()}`,
      tenureMonths,
      paymentFrequency: "MONTHLY",
      presetAmounts: opts.presetAmounts ?? [1000, 2000, 5000],
      interestMethodId: interestMethod.id,
      rewardPercent: opts.rewardPercent ?? 5,
      commissionPercent: opts.commissionPercent ?? 2,
      status: "ACTIVE",
    },
  });
}

/** Creates a fresh GadgetItem with a small, deterministic stock quantity. */
export async function createGadgetStock(opts: { stockQuantity?: number; price?: number } = {}) {
  return prisma.gadgetItem.create({
    data: {
      category: "Test Category",
      name: `Test Gadget ${uniqueSuffix()}`,
      price: opts.price ?? 5000,
      stockQuantity: opts.stockQuantity ?? 1,
    },
  });
}

/** Creates a fresh FranchiseePlan mapped to one fresh College. */
export async function createFranchiseePlanWithColleges(opts: { oneTimeDeductiblePrice?: number } = {}) {
  const college = await prisma.college.create({
    data: { name: `Test College ${uniqueSuffix()}` },
  });
  const franchiseePlan = await prisma.franchiseePlan.create({
    data: {
      name: `Test Franchisee Plan ${uniqueSuffix()}`,
      oneTimeDeductiblePrice: opts.oneTimeDeductiblePrice ?? 20000,
    },
  });
  await prisma.franchiseePlanCollegeMapping.create({
    data: { franchiseePlanId: franchiseePlan.id, collegeId: college.id },
  });
  return { franchiseePlan, college };
}

/**
 * Creates a USER subscribed to the seeded "Basic Growth Plan" whose
 * instalment cycle is already overdue, mirroring the real subscribe flow in
 * src/app/plans/[planId]/actions.ts (UserPlan + active PaymentMandate) but
 * backdating startDate so /admin/payments' findDuePlans() (autopay-scheduler.ts)
 * picks it up as due for a charge right away, instead of waiting a month.
 * Promoted from tests/admin-payments.spec.ts's original private fixture so
 * every AutoPay/retry/maturity test shares one implementation.
 */
export async function createDuePaymentMandate() {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });

  const email = `pw-autopay-${uniqueSuffix()}@example.com`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const referralCode = randomReferralCode();

  const user = await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER", isEmailVerified: true },
  });

  const amount = Number(plan.presetAmounts[0]);
  const startDate = subMonths(new Date(), 2);

  const userPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: plan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: amount,
      paymentFrequency: plan.paymentFrequency,
      remainingUnpaidPrincipal: amount * plan.tenureMonths,
      startDate,
      maturityDate: addMonths(startDate, plan.tenureMonths),
    },
  });

  const mandate = await prisma.paymentMandate.create({
    data: {
      userPlanId: userPlan.id,
      gatewayMandateId: `SIM-MANDATE-TEST-${userPlan.id}`,
      status: "ACTIVE",
    },
  });

  return { user, email, password: TEST_PASSWORD, userPlan, mandate };
}

/**
 * Thin wrappers around the real /admin/payments "Razorpay AutoPay Simulator"
 * UI buttons (src/app/admin/payments/page.tsx). `adminPage` must already be
 * an authenticated admin session; navigates to /admin/payments itself.
 * Razorpay has no real gateway/webhook route in this app — these buttons are
 * the entire simulated payment-provider surface, per the project's
 * established convention (see tests/admin-payments.spec.ts).
 */
export async function runAutoPayNow(adminPage: Page, opts: { forceOutcome?: "SUCCESS" | "FAILED"; invalidSignature?: boolean } = {}) {
  await adminPage.goto("/admin/payments");
  if (opts.forceOutcome) {
    await adminPage.locator("form", { has: adminPage.getByRole("button", { name: "Run due AutoPay charges now" }) })
      .locator('select[name="forceOutcome"]').selectOption(opts.forceOutcome);
  }
  if (opts.invalidSignature) {
    await adminPage.locator("form", { has: adminPage.getByRole("button", { name: "Run due AutoPay charges now" }) })
      .locator('input[name="forceInvalidSignature"]').check();
  }
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    adminPage.getByRole("button", { name: "Run due AutoPay charges now" }).click(),
  ]);
  await adminPage.waitForLoadState("domcontentloaded");
}

export async function runRetriesNow(adminPage: Page, opts: { forceOutcome?: "SUCCESS" | "FAILED"; invalidSignature?: boolean } = {}) {
  await adminPage.goto("/admin/payments");
  if (opts.forceOutcome) {
    await adminPage.locator("form", { has: adminPage.getByRole("button", { name: "Run due payment retries now" }) })
      .locator('select[name="forceOutcome"]').selectOption(opts.forceOutcome);
  }
  if (opts.invalidSignature) {
    await adminPage.locator("form", { has: adminPage.getByRole("button", { name: "Run due payment retries now" }) })
      .locator('input[name="forceInvalidSignature"]').check();
  }
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    adminPage.getByRole("button", { name: "Run due payment retries now" }).click(),
  ]);
  await adminPage.waitForLoadState("domcontentloaded");
}

export async function runMaturityCheckNow(adminPage: Page) {
  await adminPage.goto("/admin/payments");
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    adminPage.getByRole("button", { name: "Run plan maturity check now" }).click(),
  ]);
  await adminPage.waitForLoadState("domcontentloaded");
}

export async function simulateInvalidWebhookSignature(adminPage: Page, kind: "autopay" | "retry" = "autopay") {
  return kind === "autopay"
    ? runAutoPayNow(adminPage, { invalidSignature: true })
    : runRetriesNow(adminPage, { invalidSignature: true });
}
