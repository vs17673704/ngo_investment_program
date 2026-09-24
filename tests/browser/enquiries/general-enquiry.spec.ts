import { test, expect } from "playwright/test";
import { prisma, loginViaUi, loginAsUser } from "../../helpers";
import { createUser } from "../fixtures";

// BRD Rule XXXIX / Design.md 1.5, 5.8: General Enquiry is a communications
// record, isolated from RedemptionRequest / FranchiseeRedemptionEnquiry.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.afterEach(async () => {
  await prisma.generalEnquiry.deleteMany({ where: { email: { contains: "general-enquiry-test" } } });
});

test("BRD XXXIX: anonymous visitor can submit a general enquiry and receives a reference ID", async ({ page }) => {
  await page.goto("/contact");

  await page.locator('input[name="name"]').fill("Anon Tester");
  await page.locator('input[name="email"]').fill("general-enquiry-test-anon@example.com");
  await page.locator('input[name="phone"]').fill("9876543210");
  await page.locator('textarea[name="message"]').fill("I have a question about the reward program.");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Send enquiry" }).click(),
  ]);

  await expect(page.getByText("Thank you — your enquiry has been received.")).toBeVisible();
  await expect(page.getByText(/Reference ID:/)).toBeVisible();

  const enquiry = await prisma.generalEnquiry.findFirstOrThrow({
    where: { email: "general-enquiry-test-anon@example.com" },
  });
  expect(enquiry.userId).toBeNull();
  expect(enquiry.status).toBe("NEW");
  expect(enquiry.source).toBe("CONTACT_PAGE");

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "GENERAL_ENQUIRY_SUBMITTED", entityRef: enquiry.id },
  });
  expect(audit).not.toBeNull();

  const adminEmails = await prisma.emailMessage.findMany({
    where: { templateType: "GENERAL_ENQUIRY_RECEIVED", relatedEntityRef: enquiry.id },
  });
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  expect(adminEmails.length).toBe(adminCount);

  // Master Prompt.md §33/§35: General Enquiry Received also creates a
  // durable Notification row (and, via createNotification, an FCM push
  // attempt) for every admin — not just the simulated email above.
  const adminNotifications = await prisma.notification.findMany({
    where: { type: "GENERAL_ENQUIRY_RECEIVED", relatedEntityRef: enquiry.id },
  });
  expect(adminNotifications.length).toBe(adminCount);
});

test("BRD XXXIX.7: honeypot field submission is silently rejected with a fake success and no record is created", async ({ page }) => {
  await page.goto("/contact");

  await page.locator('input[name="name"]').fill("Bot Tester");
  await page.locator('input[name="email"]').fill("general-enquiry-test-bot@example.com");
  await page.locator('textarea[name="message"]').fill("Buy cheap watches now.");
  // The honeypot field is visually hidden but still present in the DOM.
  await page.locator('input[name="website"]').fill("http://spam.example.com");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Send enquiry" }).click(),
  ]);

  // Fake success shown to the submitter — the mechanism is never revealed.
  await expect(page.getByText("Thank you — your enquiry has been received.")).toBeVisible();

  const enquiry = await prisma.generalEnquiry.findFirst({
    where: { email: "general-enquiry-test-bot@example.com" },
  });
  expect(enquiry).toBeNull();
});

test("BRD XXXIX.5: a logged-in user's email is pre-filled on /contact", async ({ page }) => {
  await loginViaUi(page, "user@demo.local", "User@1234");
  await page.waitForURL("**/dashboard");
  await page.goto("/contact");

  await expect(page.locator('input[name="email"]')).toHaveValue("user@demo.local");
});

test("Admin: general enquiry queue supports status transitions and is isolated from redemption/franchisee queues", async ({ page }) => {
  await page.goto("/contact");
  await page.locator('input[name="name"]').fill("Queue Tester");
  await page.locator('input[name="email"]').fill("general-enquiry-test-queue@example.com");
  await page.locator('textarea[name="message"]').fill("Please call me back about my plan.");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Send enquiry" }).click(),
  ]);

  const enquiry = await prisma.generalEnquiry.findFirstOrThrow({
    where: { email: "general-enquiry-test-queue@example.com" },
  });

  const adminPage = await page.context().newPage();
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/enquiries/general");

  const row = adminPage.locator("li", { has: adminPage.getByText("general-enquiry-test-queue@example.com") });
  await expect(row).toBeVisible();

  await row.locator("select[name=\"status\"]").selectOption("IN_PROGRESS");
  await row.locator('input[name="adminComment"]').fill("Called back, awaiting response.");
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Update" }).click(),
  ]);
  // Wait for the Server Component tree to refetch after revalidatePath()
  // before interacting with the row again, or a second selectOption() can
  // race the automatic post-action RSC refresh and be silently overwritten.
  await expect(row.getByText("IN_PROGRESS", { exact: true })).toBeVisible();

  let updated = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
  expect(updated.status).toBe("IN_PROGRESS");
  expect(updated.adminComment).toBe("Called back, awaiting response.");
  expect(updated.resolvedAt).toBeNull();

  const rowAgain = adminPage.locator("li", { has: adminPage.getByText("general-enquiry-test-queue@example.com") });
  await rowAgain.locator("select[name=\"status\"]").selectOption("RESOLVED");
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    rowAgain.getByRole("button", { name: "Update" }).click(),
  ]);
  await expect(rowAgain.getByText("RESOLVED", { exact: true })).toBeVisible();

  updated = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
  expect(updated.status).toBe("RESOLVED");
  expect(updated.resolvedAt).not.toBeNull();
  expect(updated.resolvedById).not.toBeNull();

  const statusAudit = await prisma.auditLog.findFirst({
    where: { eventType: "GENERAL_ENQUIRY_STATUS_CHANGED", entityRef: enquiry.id },
    orderBy: { timestamp: "desc" },
  });
  expect(statusAudit).not.toBeNull();

  // Regression: existing franchisee/redemption queues are unaffected by this
  // enquiry's presence (they read from a wholly separate table/model).
  await adminPage.goto("/admin/redemptions");
  await expect(adminPage.getByText("general-enquiry-test-queue@example.com")).toHaveCount(0);

  await adminPage.close();
});

// E2E-11: the full User -> Admin -> User loop. The queue-transitions test
// above already proves NEW -> IN_PROGRESS -> RESOLVED against an anonymous
// submitter (who has no in-app account to loop back to); this test closes
// the gap by submitting while logged in so there's a userId to notify, and
// asserts the submitter is actually informed of the resolution CONTENT
// (BRD Rule XXXIX / TEST_SCENARIOS.md E2E-11 Expected Results), not just
// that the admin-side status flipped.
test("E2E-11: a logged-in user's general enquiry is resolved by admin and the user sees the resolution", async ({
  page,
  browser,
}) => {
  const { email, password } = await createUser();
  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/contact");

  // No `name` field on User (only email is prefilled from the session), so
  // the required Name input still needs to be filled by hand.
  await page.locator('input[name="name"]').fill("E2E-11 Tester");
  await page.locator('textarea[name="message"]').fill("Can you clarify my plan's maturity date?");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Send enquiry" }).click(),
  ]);
  await expect(page.getByText("Thank you — your enquiry has been received.")).toBeVisible();

  const enquiry = await prisma.generalEnquiry.findFirstOrThrow({ where: { email } });
  expect(enquiry.userId).not.toBeNull();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/enquiries/general");

  const row = adminPage.locator("li", { has: adminPage.getByText(email) });
  await expect(row).toBeVisible();
  await row.locator("select[name=\"status\"]").selectOption("IN_PROGRESS");
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Update" }).click(),
  ]);
  await expect(row.getByText("IN_PROGRESS", { exact: true })).toBeVisible();

  const resolutionText = "Your plan matures on the date shown on your dashboard.";
  const rowAgain = adminPage.locator("li", { has: adminPage.getByText(email) });
  await rowAgain.locator('input[name="adminComment"]').fill(resolutionText);
  await rowAgain.locator("select[name=\"status\"]").selectOption("RESOLVED");
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    rowAgain.getByRole("button", { name: "Update" }).click(),
  ]);
  await expect(rowAgain.getByText("RESOLVED", { exact: true })).toBeVisible();

  const resolved = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
  expect(resolved.status).toBe("RESOLVED");
  expect(resolved.adminComment).toBe(resolutionText);

  const emailToUser = await prisma.emailMessage.findFirstOrThrow({
    where: { recipient: email, templateType: "GENERAL_ENQUIRY_RESOLVED" },
  });
  expect(emailToUser.body).toContain(resolutionText);

  const notification = await prisma.notification.findFirstOrThrow({
    where: { userId: resolved.userId!, type: "ADMIN_MESSAGE", relatedEntityRef: enquiry.id },
  });
  expect(notification.message).toBe(resolutionText);

  await page.goto("/dashboard/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Your enquiry has been resolved")).toBeVisible();
  await expect(page.getByText(resolutionText)).toBeVisible();

  await adminContext.close();
});

test("Access control: /admin/enquiries/general redirects unauthenticated and non-admin users", async ({ page, browser }) => {
  await page.goto("/admin/enquiries/general");
  await page.waitForURL("**/login");

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginViaUi(userPage, "user@demo.local", "User@1234");
  await userPage.waitForURL("**/dashboard");
  await userPage.goto("/admin/enquiries/general");
  await userPage.waitForURL("**/dashboard");
  await userContext.close();
});

test("BRD XXXIX.8: retention cleanup anonymizes PII on old enquiries, preserves recent ones and report counts", async ({ page }) => {
  const old = await prisma.generalEnquiry.create({
    data: {
      name: "Old Tester",
      email: "general-enquiry-test-old@example.com",
      phone: "9998887777",
      message: "This is an old enquiry that should be anonymized.",
      source: "CONTACT_PAGE",
      status: "NEW",
      createdAt: new Date(Date.now() - 25 * 30 * 24 * 60 * 60 * 1000),
    },
  });
  const recent = await prisma.generalEnquiry.create({
    data: {
      name: "Recent Tester",
      email: "general-enquiry-test-recent@example.com",
      message: "This is a recent enquiry that should NOT be anonymized.",
      source: "CONTACT_PAGE",
      status: "NEW",
    },
  });

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/enquiries/general");

  await expect(page.getByText("general-enquiry-test-old@example.com")).toBeVisible();

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Run retention cleanup" }).click(),
  ]);

  await expect(page.getByText(/PII anonymized/)).toBeVisible();

  const updatedOld = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: old.id } });
  expect(updatedOld.name).toBe("[REDACTED]");
  expect(updatedOld.email).toBe("redacted@redacted.invalid");
  expect(updatedOld.phone).toBeNull();
  expect(updatedOld.anonymizedAt).not.toBeNull();

  const updatedRecent = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: recent.id } });
  expect(updatedRecent.name).toBe("Recent Tester");
  expect(updatedRecent.email).toBe("general-enquiry-test-recent@example.com");
  expect(updatedRecent.anonymizedAt).toBeNull();

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "GENERAL_ENQUIRY_RETENTION_RUN" },
    orderBy: { timestamp: "desc" },
  });
  expect(audit).not.toBeNull();

  await prisma.generalEnquiry.deleteMany({ where: { id: { in: [old.id, recent.id] } } });
});
