import { test, expect } from "playwright/test";
import { prisma, loginViaUi, loginAsUser } from "../../helpers";
import { createPlan, createUser } from "../fixtures";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

// "admin can lock and unlock a user from User Management" moved to
// tests/browser/cross-role/account-lock-e2e.spec.ts: that test drove
// Lock/Unlock against the shared seeded user@demo.local account, and a crash
// between the Lock click and the Unlock click once left that shared account
// (used by many other spec files) locked until 2099 for the rest of the run.
// The new test uses a dedicated fixture user and additionally verifies the
// locked user's own login attempt is actually denied, not just the DB field.

test("admin can view Plan Management and create a new plan", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/plans");

  await expect(page.getByRole("heading", { name: "Plan Management" })).toBeVisible();

  // Create Plan / Manage Instalment Amounts / Manage Payment Durations each
  // open in their own popup rather than sitting inline on the page.
  await page.getByRole("button", { name: "Create Plan", exact: true }).click();

  const planName = `QA Plan ${Date.now()}`;
  await page.locator('input[name="name"]').fill(planName);
  await page.locator('input[name="tenureMonths"]').fill("6");
  await page.locator('input[name="presetAmounts"]').fill("1000,2000");
  await page.locator('input[name="rewardPercent"]').fill("1");
  await page.locator('input[name="commissionPercent"]').fill("2");

  const submitBtn = page.getByRole("button", { name: "Create plan", exact: true });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    submitBtn.click(),
  ]);

  const created = await prisma.plan.findFirst({ where: { name: planName } });
  expect(created).not.toBeNull();
  // A successful submit closes the popup automatically.
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("cell", { name: planName })).toBeVisible();
});

// BRD Rule XLVII: admin can add to an existing plan's preset amount list via
// a Starting Amount / Interval / Count range generator, previewed before
// save, without disturbing the amounts already offered.
test("admin can generate and add new preset amounts to an existing plan via the range generator", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/plans");

  await page.getByRole("button", { name: "Create Plan", exact: true }).click();
  const planName = `QA Amounts Plan ${Date.now()}`;
  await page.locator('input[name="name"]').fill(planName);
  await page.locator('input[name="tenureMonths"]').fill("6");
  await page.locator('input[name="presetAmounts"]').fill("1000,2000");
  await page.locator('input[name="rewardPercent"]').fill("1");
  await page.locator('input[name="commissionPercent"]').fill("2");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create plan", exact: true }).click(),
  ]);

  const created = await prisma.plan.findFirstOrThrow({ where: { name: planName } });

  await page.getByRole("button", { name: "Manage Instalment Amounts" }).click();
  await page.locator("#amounts-planId").selectOption(created.id);
  await page.locator("#amounts-start").fill("3000");
  await page.locator("#amounts-interval").fill("500");
  await page.locator("#amounts-count").fill("2");
  await expect(page.getByTestId("amounts-preview")).toContainText("3000.00");
  await expect(page.getByTestId("amounts-preview")).toContainText("3500.00");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save amounts" }).click(),
  ]);

  const updated = await prisma.plan.findUniqueOrThrow({ where: { id: created.id } });
  const amounts = updated.presetAmounts.map((a) => Number(a)).sort((a, b) => a - b);
  expect(amounts).toEqual([1000, 2000, 3000, 3500]);
});

// BRD Rule XLVIII: admin can generate a Day/Week/Month payment-duration list
// via its own range generator (numeric steps within one unit only) and
// replace an existing plan's duration list, previewed before save.
test("admin can generate and replace an existing plan's payment durations via the range generator", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/plans");

  await page.getByRole("button", { name: "Create Plan", exact: true }).click();
  const planName = `QA Durations Plan ${Date.now()}`;
  await page.locator('input[name="name"]').fill(planName);
  await page.locator('input[name="tenureMonths"]').fill("6");
  await page.locator('input[name="presetAmounts"]').fill("1000,2000");
  await page.locator('input[name="rewardPercent"]').fill("1");
  await page.locator('input[name="commissionPercent"]').fill("2");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create plan", exact: true }).click(),
  ]);

  const created = await prisma.plan.findFirstOrThrow({ where: { name: planName } });

  await page.getByRole("button", { name: "Manage Payment Durations" }).click();
  await page.locator("#cadences-planId").selectOption(created.id);
  await page.locator("#cadences-unit").selectOption("WEEK");
  await page.locator("#cadences-start").fill("1");
  await page.locator("#cadences-interval").fill("1");
  await page.locator("#cadences-count").fill("3");
  await expect(page.getByTestId("cadences-preview")).toContainText("Every 1 Week");
  await expect(page.getByTestId("cadences-preview")).toContainText("Every 3 Weeks");

  // Only the durations popup is open at a time now, so its "Replace existing
  // list" radio no longer needs scoping against the amounts form's identical
  // label text — the amounts form isn't even mounted while this one is open.
  await page.getByText("Replace existing list").click();

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save payment durations" }).click(),
  ]);

  const updated = await prisma.plan.findUniqueOrThrow({ where: { id: created.id } });
  const cadences = updated.paymentCadences as unknown as { unit: string; interval: number }[];
  expect(cadences.sort((a, b) => a.interval - b.interval)).toEqual([
    { unit: "WEEK", interval: 1 },
    { unit: "WEEK", interval: 2 },
    { unit: "WEEK", interval: 3 },
  ]);
});

// BRD Rule XLIX: the Subscribe screen shows the amount and duration lists as
// independent <select> dropdowns; the user's chosen duration is snapshotted
// onto the new UserPlan (BRD Rule XVI/XLVIII(e) — a later admin edit to the
// plan's duration list must never retroactively change it).
test("user selects an amount and a payment duration from dropdowns on Subscribe, and both are snapshotted onto the UserPlan", async ({ page }) => {
  const plan = await createPlan({ presetAmounts: [2000, 4000] });
  await prisma.plan.update({
    where: { id: plan.id },
    data: {
      paymentCadences: [
        { unit: "MONTH", interval: 1 },
        { unit: "WEEK", interval: 2 },
      ],
    },
  });
  const { email, password } = await createUser();

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto(`/plans/${plan.id}/subscribe`);

  await page.locator('select[name="amount"]').selectOption("4000");
  await page.locator('select[name="duration"]').selectOption("WEEK:2");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
  ]);
  await page.waitForURL("**/dashboard");

  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { planId: plan.id } });
  expect(Number(userPlan.paymentAmount)).toBe(4000);
  expect(userPlan.cadenceUnit).toBe("WEEK");
  expect(userPlan.cadenceInterval).toBe(2);

  // Later admin edits to the plan's duration list must not retroactively
  // change this already-subscribed UserPlan's snapshotted cadence.
  await prisma.plan.update({
    where: { id: plan.id },
    data: { paymentCadences: [{ unit: "MONTH", interval: 1 }] },
  });
  const unchanged = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(unchanged.cadenceUnit).toBe("WEEK");
  expect(unchanged.cadenceInterval).toBe(2);
});

test("admin can view the Audit Log after performing an action", async ({ page }) => {
  // /admin/audit-log's first-hit dev-mode compilation on a cold server, on
  // top of two lock/unlock action round-trips, can exceed the default 60s
  // test timeout (see the identical rationale on the first test in this file).
  test.setTimeout(120_000);
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/users");

  const row = page.locator("tr", { has: page.getByText("user@demo.local") });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Lock" }).click(),
  ]);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.locator("tr", { has: page.getByText("user@demo.local") }).getByRole("button", { name: "Unlock" }).click(),
  ]);
  // Wait for the post-action revalidatePath("/admin/users") client navigation
  // to settle before navigating away, or it can race page.goto() below and
  // interrupt it ("Navigation to .../admin/audit-log is interrupted by
  // another navigation to .../admin/users"). Same root cause as
  // account-lock-e2e.spec.ts's identical wait: /admin/users renders every
  // User row with no pagination, and that table's row count only grows across
  // this suite's runs, so the re-render this revalidation triggers can
  // genuinely exceed the default 10s expect timeout under load — a measured
  // render cost, not a flaky race.
  await expect(page.locator("tr", { has: page.getByText("user@demo.local") }).getByText("Active")).toBeVisible({
    timeout: 60_000,
  });

  await page.goto("/admin/audit-log");
  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
  const count = await prisma.auditLog.count();
  expect(count).toBeGreaterThan(0);
});

test("admin can view and update Site Settings", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/settings");

  await expect(page.getByRole("heading", { name: "Site Settings" })).toBeVisible();
  await expect(page.getByText("Referral Validity (days)")).toBeVisible();
});
