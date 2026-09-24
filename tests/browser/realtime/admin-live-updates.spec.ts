import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// Verifies the SSE-based live notification system: an Admin sitting on
// /admin/redemptions with the page already open sees a new user-submitted
// redemption appear WITHOUT reloading the page (src/app/api/admin/events/route.ts
// pushes an event, src/components/admin/AdminLiveEvents.tsx calls
// router.refresh() on receipt).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("admin sees a new redemption request live, without reloading the page", async ({ page, browser }) => {
  test.setTimeout(120_000);

  // Admin opens the redemptions queue and leaves it open.
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/redemptions");
  await expect(page.locator("body")).toBeVisible();

  // Separate browser context for the user identity, so the user's login
  // doesn't overwrite the admin's session cookie on the shared `page`.
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();

  const { user, email, password } = await createUserWithRedeemableBalance(20000);
  await loginViaUi(userPage, email, password);
  await userPage.waitForURL("**/dashboard");

  await userPage.goto("/dashboard/redeem/refund");
  await userPage.locator('input[name="amount"]').fill("3000");
  await Promise.all([
    userPage.waitForResponse((res) => res.request().method() === "POST"),
    userPage.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await userPage.waitForURL("**/dashboard/redeem");
  await userContext.close();

  // No page.reload() / page.goto() here — the admin's already-open page must
  // pick up the new row on its own via the SSE push + router.refresh() loop.
  const row = page.locator("li", { has: page.getByText(user.email) });
  await expect(row).toBeVisible({ timeout: 15_000 });

  const request = await prisma.redemptionRequest.findFirstOrThrow({ where: { userId: user.id } });
  expect(request.status).toBe("PENDING");
});
