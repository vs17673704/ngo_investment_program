import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";
import { createUserWithRedeemableBalance, cleanupTestUser } from "../fixtures";

// Design.md 3.7 [BRD-required]: the Redeem Hub's expanded request detail
// must show a status timeline and any Admin concern/message raised against
// the request (e.g. a reject reason).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Design 3.7: user sees a status timeline and the Admin's rejection message in the expanded request detail", async ({ page, browser }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(5000);

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/refund");

  await page.locator('input[name="amount"]').fill("1000");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await page.waitForURL("**/dashboard/redeem");

  const request = await prisma.redemptionRequest.findFirstOrThrow({
    where: { userId: user.id, category: "REFUND" },
  });
  expect(request.status).toBe("PENDING");

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/redemptions");

  const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
  await expect(row).toBeVisible();
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    (async () => {
      await row.locator('input[name="reason"]').fill("Please resubmit with a valid bank account proof.");
      await row.getByRole("button", { name: "Reject" }).click();
    })(),
  ]);

  const rejected = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(rejected.status).toBe("REJECTED");

  const events = await prisma.redemptionStatusEvent.findMany({
    where: { redemptionRequestId: request.id },
    orderBy: { createdAt: "asc" },
  });
  expect(events.map((e) => e.status)).toEqual(["PENDING", "REJECTED"]);
  expect(events[1].note).toBe("Please resubmit with a valid bank account proof.");

  await page.reload();
  await page.getByText("View details").click();
  await expect(page.getByText(/Admin message:/)).toBeVisible();
  await expect(page.getByText("Please resubmit with a valid bank account proof.")).toBeVisible();
  await expect(page.getByText("PENDING").first()).toBeVisible();
  await expect(page.getByText("REJECTED").first()).toBeVisible();

  await adminContext.close();
  await cleanupTestUser(user.id);
});
