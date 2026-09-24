import { test, expect } from "playwright/test";
import { prisma, loginViaUi, loginAsUser, uniqueSuffix } from "../../helpers";
import { createPlan, createInterestMethod, createUser, runMaturityCheckNow } from "../fixtures";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("admin can view Interest Methods and create a Simple Interest method", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/interest-methods");

  await expect(page.getByRole("heading", { name: "Interest Methods" })).toBeVisible();

  // Create Interest Method opens in its own popup rather than sitting
  // inline on the page.
  await page.getByRole("button", { name: "Create Interest Method", exact: true }).click();

  const methodName = `QA Simple ${Date.now()}`;
  await page.locator('input[name="name"]').fill(methodName);
  await page.locator("#formulaType").selectOption("SIMPLE");
  await page.locator('input[name="ratePercent"]').fill("12");
  await page.locator('input[name="tenureMonths"]').fill("12");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create interest method", exact: true }).click(),
  ]);

  const created = await prisma.interestCalculationMethod.findFirst({ where: { name: methodName } });
  expect(created).not.toBeNull();
  expect(created?.formulaType).toBe("SIMPLE");
  // A successful submit closes the popup automatically.
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(methodName)).toBeVisible();

  // The newly created method must also be selectable on the Plan creation form.
  await page.goto("/admin/plans");
  await page.getByRole("button", { name: "Create Plan", exact: true }).click();
  await expect(page.locator("#interestMethodId")).toContainText(methodName);
});

test("admin can create a Custom Parameterized Formula method with a valid formula", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/interest-methods");

  await page.getByRole("button", { name: "Create Interest Method", exact: true }).click();

  const methodName = `QA Custom ${Date.now()}`;
  await page.locator('input[name="name"]').fill(methodName);
  await page.locator("#formulaType").selectOption("CUSTOM");
  await page.locator('input[name="ratePercent"]').fill("10");
  await page.locator('input[name="tenureMonths"]').fill("6");
  await page.locator('input[name="customFormula"]').fill("Principal*(Rate/100)*Tenure");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create interest method", exact: true }).click(),
  ]);

  const created = await prisma.interestCalculationMethod.findFirst({ where: { name: methodName } });
  expect(created).not.toBeNull();
  expect(created?.formulaType).toBe("CUSTOM");
  expect(created?.customFormula).toBe("Principal*(Rate/100)*Tenure");
  await expect(page.getByText(methodName)).toBeVisible();
});

test("a Custom Parameterized Formula method with an unsupported variable is rejected server-side", async ({
  page,
}) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/interest-methods");

  const methodBefore = await prisma.interestCalculationMethod.count();

  await page.getByRole("button", { name: "Create Interest Method", exact: true }).click();

  const methodName = `QA Invalid ${Date.now()}`;
  await page.locator('input[name="name"]').fill(methodName);
  await page.locator("#formulaType").selectOption("CUSTOM");
  await page.locator('input[name="ratePercent"]').fill("10");
  await page.locator('input[name="tenureMonths"]').fill("6");
  await page.locator('input[name="customFormula"]').fill("Foo*Rate");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create interest method", exact: true }).click(),
  ]);

  await expect(page.getByText(/unknown variable/i)).toBeVisible();
  const methodAfter = await prisma.interestCalculationMethod.count();
  expect(methodAfter).toBe(methodBefore);
});

// E2E-021 steps 2-6: the Custom Parameterized Formula validation ladder
// (BRD Rule XXVI(c)). Step 1 (unknown variable) is already covered above by
// "an unsupported variable is rejected server-side". Each step below submits
// a formula that is invalid for exactly one specific reason, asserting the
// validator's exact rejection message from src/lib/interest-engine.ts so a
// regression in the wrong check can't silently pass by matching the wrong
// rule.
async function attemptCustomFormula(page: import("playwright/test").Page, formula: string) {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/interest-methods");

  const methodBefore = await prisma.interestCalculationMethod.count();

  await page.getByRole("button", { name: "Create Interest Method", exact: true }).click();

  const methodName = `QA Ladder ${uniqueSuffix()}`;
  await page.locator('input[name="name"]').fill(methodName);
  await page.locator("#formulaType").selectOption("CUSTOM");
  await page.locator('input[name="ratePercent"]').fill("10");
  await page.locator('input[name="tenureMonths"]').fill("6");
  // The input has a client-side maxLength=100 that Playwright's fill()
  // (which emulates real typing) honors just like a real keystroke would —
  // set the value directly via the DOM so a >100-char formula (step 3) still
  // reaches the server for the *server-side* length check to reject.
  await page.locator('input[name="customFormula"]').evaluate((el: HTMLInputElement, value: string) => {
    el.removeAttribute("maxlength");
    el.value = value;
  }, formula);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create interest method", exact: true }).click(),
  ]);

  const methodAfter = await prisma.interestCalculationMethod.count();
  expect(methodAfter).toBe(methodBefore);
  return methodName;
}

test("E2E-021 step 2: a Custom Formula using an unsupported operator is rejected", async ({ page }) => {
  // Only + - * / are supported; ^ is not a recognized character.
  await attemptCustomFormula(page, "Principal^2");
  await expect(page.getByText(/unexpected character/i)).toBeVisible();
});

test("E2E-021 step 3: a Custom Formula over 100 characters is rejected", async ({ page }) => {
  const base = "Principal*(Rate/100)*Tenure+";
  const formula = (base.repeat(4) + "0").slice(0, 101);
  expect(formula.length).toBe(101);
  await attemptCustomFormula(page, formula);
  await expect(page.getByText(/exceeds max length/i)).toBeVisible();
});

test("E2E-021 step 4: a Custom Formula nested more than 5 levels deep is rejected", async ({ page }) => {
  await attemptCustomFormula(page, "((((((Principal))))))");
  await expect(page.getByText(/nesting exceeds max depth/i)).toBeVisible();
});

test("E2E-021 step 5: a Custom Formula that evaluates to a negative result is rejected", async ({ page }) => {
  // Exactly 5 levels of nesting (allowed) but evaluates to a negative amount
  // for both of validateCustomFormula's representative sample-input sets.
  await attemptCustomFormula(page, "(((((0-Principal)))))");
  await expect(page.getByText(/negative interest amount/i)).toBeVisible();
});

test("E2E-021 step 6: a fully corrected Custom Formula (approved variables/operators, within length and nesting limits, non-negative result) is accepted", async ({
  page,
}) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/interest-methods");

  await page.getByRole("button", { name: "Create Interest Method", exact: true }).click();

  const methodName = `QA Ladder Corrected ${uniqueSuffix()}`;
  const formula = "(Principal*(Rate/100))*Tenure";
  await page.locator('input[name="name"]').fill(methodName);
  await page.locator("#formulaType").selectOption("CUSTOM");
  await page.locator('input[name="ratePercent"]').fill("10");
  await page.locator('input[name="tenureMonths"]').fill("6");
  await page.locator('input[name="customFormula"]').fill(formula);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create interest method", exact: true }).click(),
  ]);

  const created = await prisma.interestCalculationMethod.findFirst({ where: { name: methodName } });
  expect(created).not.toBeNull();
  expect(created?.customFormula).toBe(formula);
  await expect(page.getByText(methodName)).toBeVisible();
});

// E2E-021 step 7 / E2E-010 step 3-4 / E2E-019 steps 1-2: the version-lock
// snapshot. A UserPlan records the InterestCalculationMethod's id AND its
// `version` at the moment of subscription (src/app/plans/[planId]/actions.ts),
// so this test drives a real subscription through the UI and asserts the
// snapshot lands exactly as the app writes it.
test("E2E-021 step 7 / E2E-019 steps 1-2: subscribing to a Plan snapshots the interest method's id and version onto the UserPlan", async ({
  page,
}) => {
  const method = await createInterestMethod({ ratePercent: 10, tenureMonths: 12 });
  const plan = await createPlan({ interestMethodId: method.id, presetAmounts: [3000] });
  const { email, password } = await createUser();

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto(`/plans/${plan.id}/subscribe`);
  await page.locator('select[name="amount"]').selectOption("3000");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
  ]);
  await page.waitForURL("**/dashboard");

  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { planId: plan.id } });
  expect(userPlan.interestMethodId).toBe(method.id);
  expect(userPlan.interestMethodVersion).toBe(method.version);
});

// E2E-010 steps 1, 3-4 / E2E-019 steps 3-6: admin revises an existing
// InterestCalculationMethod's rate. The revise action
// (src/app/admin/interest-methods/actions.ts's reviseInterestMethodAction)
// never mutates the existing row — it creates a new row (version + 1,
// previousVersionId set) and marks the old row `active: false`. This is
// load-bearing: runMaturityTransitions() (src/lib/interest-engine.ts) reads
// interest params off the LIVE InterestCalculationMethod relation, not a
// frozen snapshot, so mutating the old row in place would have silently
// changed the rate for every already-enrolled UserPlan at maturity — a direct
// BRD non-retroactivity violation (bullet e). This test proves that does not
// happen.
test("admin revising an interest method's rate does not retroactively change interest for already-enrolled plans", async ({
  page,
}) => {
  const method = await createInterestMethod({ ratePercent: 10, tenureMonths: 12 });
  const plan = await createPlan({ interestMethodId: method.id });
  const { user } = await createUser();

  const principal = 10000;
  const userPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: method.id,
      interestMethodVersion: method.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: principal,
      paymentFrequency: plan.paymentFrequency,
      status: "ACTIVE",
      principalPaid: principal,
      startDate: new Date(Date.now() - 366 * 86_400_000),
      maturityDate: new Date(Date.now() - 86_400_000),
    },
  });

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/interest-methods");
  await page.getByText(method.name).waitFor();

  const row = page.locator("tr", { has: page.getByText(method.name, { exact: true }) });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.locator(`#edit-ratePercent-${method.id}`).fill("90");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save as new version" }).click(),
  ]);

  const oldMethod = await prisma.interestCalculationMethod.findUniqueOrThrow({ where: { id: method.id } });
  expect(oldMethod.active).toBe(false);
  expect(Number(oldMethod.ratePercent)).toBe(10);

  const newMethod = await prisma.interestCalculationMethod.findFirstOrThrow({
    where: { previousVersionId: method.id },
  });
  expect(newMethod.version).toBe(method.version + 1);
  expect(Number(newMethod.ratePercent)).toBe(90);

  // The already-enrolled UserPlan's own snapshot fields are untouched.
  const unchangedUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(unchangedUserPlan.interestMethodId).toBe(method.id);
  expect(unchangedUserPlan.interestMethodVersion).toBe(method.version);

  await runMaturityCheckNow(page);

  const maturedUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(maturedUserPlan.status).toBe("MATURED");

  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userPlanId: userPlan.id, transactionType: "INTEREST" },
  });
  // SIMPLE interest = principal * (rate / 100) * (tenureMonths / 12).
  // At the OLD (10%) rate: 10000 * 0.10 * 1 = 1000. If the bug this test
  // guards against were reintroduced, this would instead compute 9000 (90%).
  expect(Number(ledgerEntry.amount)).toBe(1000);
  expect(ledgerEntry.interestMethodId).toBe(method.id);
  expect(ledgerEntry.interestMethodVersion).toBe(method.version);

  // The superseded method must no longer be offered on the Create Plan form
  // (its active successor shares the same name, so assert by option value/id
  // rather than visible text).
  await page.goto("/admin/plans");
  await page.getByRole("button", { name: "Create Plan", exact: true }).click();
  await expect(page.locator(`#interestMethodId option[value="${method.id}"]`)).toHaveCount(0);
  await expect(page.locator(`#interestMethodId option[value="${newMethod.id}"]`)).toHaveCount(1);
});

// E2E-019 steps 3-6 (Plan-level reassignment): an admin can re-point an
// existing Plan at a different (active) interest method going forward
// (src/app/admin/plans/actions.ts's reassignPlanInterestMethodAction) without
// touching any already-enrolled UserPlan's own snapshot.
test("admin can reassign a Plan to a different interest method without affecting already-enrolled plans", async ({
  page,
}) => {
  const originalMethod = await createInterestMethod({ ratePercent: 8, tenureMonths: 12 });
  const newMethod = await createInterestMethod({ ratePercent: 15, tenureMonths: 12 });
  const plan = await createPlan({ interestMethodId: originalMethod.id });
  const { user } = await createUser();

  const userPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: originalMethod.id,
      interestMethodVersion: originalMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: 5000,
      paymentFrequency: plan.paymentFrequency,
      status: "ACTIVE",
      startDate: new Date(),
      maturityDate: new Date(Date.now() + 365 * 86_400_000),
    },
  });

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/plans");
  await page.getByText(plan.name).waitFor();

  const row = page.locator("tr", { has: page.getByText(plan.name, { exact: true }) });
  await row.locator('select[name="interestMethodId"]').selectOption(newMethod.id);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Apply" }).click(),
  ]);

  const updatedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  expect(updatedPlan.interestMethodId).toBe(newMethod.id);

  // The already-enrolled UserPlan keeps its own snapshot from subscribe time.
  const unchangedUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(unchangedUserPlan.interestMethodId).toBe(originalMethod.id);
  expect(unchangedUserPlan.interestMethodVersion).toBe(originalMethod.version);
});

// "a non-admin user is redirected away from /admin/interest-methods" merged
// into tests/browser/auth/auth-rbac-lifecycle.spec.ts's parametrized table.
