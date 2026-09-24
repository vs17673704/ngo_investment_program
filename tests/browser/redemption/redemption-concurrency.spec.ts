import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// BRD Rule XXXV concurrency safety regression tests.
//
// These prove the two race-condition fixes in src/lib/redemption-engine.ts
// and src/app/dashboard/redeem/actions.ts actually hold under real concurrent
// requests, driven through the live UI/Server Actions (not by importing the
// engine directly), consistent with this suite's existing convention.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("BRD Rule XXXV: two concurrent gadget redemption requests for the last unit of stock only reserve one", async ({ browser }) => {
  const gadget = await prisma.gadgetItem.create({
    data: {
      category: "Accessories",
      name: `Concurrency Test Gadget ${uniqueSuffix()}`,
      price: 500,
      stockQuantity: 1,
      reservedQuantity: 0,
    },
  });

  const buyerA = await createUserWithRedeemableBalance(50000);
  const buyerB = await createUserWithRedeemableBalance(50000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await loginViaUi(pageA, buyerA.email, buyerA.password);
  await pageA.waitForURL("**/dashboard");
  await loginViaUi(pageB, buyerB.email, buyerB.password);
  await pageB.waitForURL("**/dashboard");

  await pageA.goto("/dashboard/redeem/gadgets");
  await pageB.goto("/dashboard/redeem/gadgets");

  const rowA = pageA.locator("li", { has: pageA.getByText(gadget.name) });
  const rowB = pageB.locator("li", { has: pageB.getByText(gadget.name) });
  await rowA.getByRole("button", { name: `Increase ${gadget.name} quantity` }).click();
  await rowB.getByRole("button", { name: `Increase ${gadget.name} quantity` }).click();
  await expect(pageA.getByRole("button", { name: "Submit request" })).toBeEnabled();
  await expect(pageB.getByRole("button", { name: "Submit request" })).toBeEnabled();

  const [resultA, resultB] = await Promise.allSettled([
    Promise.all([
      pageA.waitForResponse((res) => res.request().method() === "POST"),
      pageA.getByRole("button", { name: "Submit request" }).click(),
    ]),
    Promise.all([
      pageB.waitForResponse((res) => res.request().method() === "POST"),
      pageB.getByRole("button", { name: "Submit request" }).click(),
    ]),
  ]);
  expect(resultA.status).toBe("fulfilled");
  expect(resultB.status).toBe("fulfilled");

  // Exactly one of the two submissions must have succeeded (redirected away
  // to /dashboard/redeem) and the other must have been rejected as out of
  // stock — never both succeeding. The redirect (on success) happens
  // asynchronously after the POST response we already awaited above, so each
  // page's outcome is determined by deterministically waiting for its own
  // terminal state rather than sampling page.url() after a fixed sleep,
  // which raced the navigation under load and could read a stale URL.
  async function didRedirectToRedeemHome(page: import("playwright/test").Page) {
    try {
      await page.waitForURL("**/dashboard/redeem", { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }
  const [aSucceeded, bSucceeded] = await Promise.all([didRedirectToRedeemHome(pageA), didRedirectToRedeemHome(pageB)]);
  expect(aSucceeded !== bSucceeded).toBe(true);

  const failedPage = aSucceeded ? pageB : pageA;
  await expect(failedPage.getByText("This item is out of stock.")).toBeVisible();

  const finalGadget = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadget.id } });
  expect(finalGadget.reservedQuantity).toBe(1);

  const requests = await prisma.redemptionRequest.findMany({ where: { gadgetItems: { some: { gadgetItemId: gadget.id } } } });
  expect(requests).toHaveLength(1);

  await contextA.close();
  await contextB.close();
  await prisma.redemptionRequest.deleteMany({ where: { gadgetItems: { some: { gadgetItemId: gadget.id } } } });
  await prisma.gadgetItem.delete({ where: { id: gadget.id } });
  for (const u of [buyerA, buyerB]) {
    await prisma.ledgerEntry.deleteMany({ where: { userId: u.user.id } });
    await prisma.userPlan.deleteMany({ where: { userId: u.user.id } });
  }
});

test("BRD Rule XXXV: two concurrent redemption requests from the same user cannot both reserve more margin than is available", async ({ browser }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(20000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await loginViaUi(pageA, email, password);
  await pageA.waitForURL("**/dashboard");
  await loginViaUi(pageB, email, password);
  await pageB.waitForURL("**/dashboard");

  await pageA.goto("/dashboard/redeem/refund");
  await pageB.goto("/dashboard/redeem/refund");
  await pageA.locator('input[name="amount"]').fill("15000");
  await pageB.locator('input[name="amount"]').fill("15000");

  await Promise.all([
    Promise.all([
      pageA.waitForResponse((res) => res.request().method() === "POST"),
      pageA.getByRole("button", { name: "Submit request" }).click(),
    ]),
    Promise.all([
      pageB.waitForResponse((res) => res.request().method() === "POST"),
      pageB.getByRole("button", { name: "Submit request" }).click(),
    ]),
  ]);
  await pageA.waitForURL("**/dashboard/redeem");
  await pageB.waitForURL("**/dashboard/redeem");

  // Two requests of ₹15,000 each against a ₹20,000 balance (₹30,000 total)
  // must not both be fully funded — the row lock in createRedemptionRequest
  // serializes the two margin reads, so the second one to actually run must
  // see the first request's reservation and register a shortfall.
  const requests = await prisma.redemptionRequest.findMany({
    where: { userId: user.id, category: "REFUND" },
    orderBy: { createdAt: "asc" },
  });
  expect(requests).toHaveLength(2);
  const fullyFunded = requests.filter((r) => Number(r.shortfallAmount) === 0);
  const shortfalled = requests.filter((r) => Number(r.shortfallAmount) > 0);
  expect(fullyFunded).toHaveLength(1);
  expect(shortfalled).toHaveLength(1);

  await contextA.close();
  await contextB.close();
  await prisma.redemptionRequest.deleteMany({ where: { userId: user.id } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
  await prisma.userPlan.deleteMany({ where: { userId: user.id } });
});
