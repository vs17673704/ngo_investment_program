import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";

// Design.md 1.4, 1.5, 5.13.C/D/E: About Us / Contact Us content management —
// draft never leaks to public until Publish, max 20 sections, heading-only
// invalid, nav conditional visibility, Contact Us shows only configured fields.
test.describe.configure({ mode: "serial" });

// This dev environment has NEXT_PUBLIC_ENABLE_SW_IN_DEV=true (see
// src/components/ServiceWorkerRegister.tsx), so public/sw.js registers and
// precaches "/" cache-first. This spec is the only one in the suite that
// revisits "/" before and after an auth/content-state change within a single
// test, and a precached "/" would silently be served from the service
// worker's Cache Storage with zero network request (confirmed via dev-server
// logs), independent of any HTTP cache-control headers. Block service worker
// registration outright for this file's tests so every navigation is live.
test.use({ serviceWorkers: "block" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.afterEach(async () => {
  await prisma.aboutUsSectionDraft.deleteMany({});
  await prisma.aboutUsSectionPublished.deleteMany({});
  await prisma.contactUsContent.deleteMany({});
});

test("About Us: draft edits never appear on public /about until Publish; nav link hidden until published", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "About Us" })).toHaveCount(0);

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/settings/about-us");

  await page.locator('input[name="heading"]').fill("Our Mission");
  await page.locator('textarea[name="body"]').fill("We help members grow their savings responsibly.");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Add section" }).click(),
  ]);
  await expect(page.locator('input[name="heading"]').first()).toHaveValue("Our Mission");

  // Draft exists but nothing published yet — public page must 404 and nav must not show the link.
  const aboutResponse = await page.request.get("/about");
  expect(aboutResponse.status()).toBe(404);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "About Us" })).toHaveCount(0);

  await page.goto("/admin/settings/about-us");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Publish" }).click(),
  ]);

  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Our Mission" })).toBeVisible();
  await expect(page.getByText("We help members grow their savings responsibly.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "About Us" })).toBeVisible();

  const publishAudit = await prisma.auditLog.findFirst({
    where: { eventType: "ABOUT_US_PUBLISHED" },
    orderBy: { timestamp: "desc" },
  });
  expect(publishAudit).not.toBeNull();
});

test("About Us: heading-only (empty body) section is rejected", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/settings/about-us");

  await page.locator('input[name="heading"]').fill("Empty Body Section");
  // Leave the paragraph empty; the browser's `required` attribute would block
  // submission, so remove it to exercise the server-side check directly.
  await page.evaluate(() => {
    document.querySelector('textarea[name="body"]')?.removeAttribute("required");
  });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Add section" }).click(),
  ]);

  const count = await prisma.aboutUsSectionDraft.count();
  expect(count).toBe(0);
});

test("About Us: 21st section is rejected server-side", async ({ page }) => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    heading: `Section ${i}`,
    body: `Body ${i}`,
    order: i,
  }));
  await prisma.aboutUsSectionDraft.createMany({ data: rows });

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/settings/about-us");

  await expect(page.getByText("Maximum of 20 sections reached.")).toBeVisible();

  const count = await prisma.aboutUsSectionDraft.count();
  expect(count).toBe(20);
});

test("Contact Us: admin-configured fields appear on public /contact only when configured, draft never leaks before publish", async ({
  page,
}) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/settings/contact-us");

  await page.locator('input[name="address"]').fill("123 Reward Street, Metropolis");
  await page.locator('input[name="phone"]').fill("1800-123-456");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save Draft" }).click(),
  ]);

  await page.goto("/contact");
  await expect(page.getByText("123 Reward Street, Metropolis")).toHaveCount(0);
  await expect(page.getByText("Contact Details")).toHaveCount(0);

  await page.goto("/admin/settings/contact-us");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Publish" }).click(),
  ]);

  await page.goto("/contact");
  await expect(page.getByText("Contact Details")).toBeVisible();
  await expect(page.getByText("123 Reward Street, Metropolis")).toBeVisible();
  await expect(page.getByText("1800-123-456")).toBeVisible();
  // Email/Website were never configured — must not render.
  await expect(page.locator("dt", { hasText: "Email:" })).toHaveCount(0);
  await expect(page.locator("dt", { hasText: "Website:" })).toHaveCount(0);
});

test("Access control: /admin/settings/about-us and /admin/settings/contact-us redirect unauthenticated and non-admin users", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/settings/about-us");
  await page.waitForURL("**/login");
  await page.goto("/admin/settings/contact-us");
  await page.waitForURL("**/login");

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginViaUi(userPage, "user@demo.local", "User@1234");
  await userPage.waitForURL("**/dashboard");
  await userPage.goto("/admin/settings/about-us");
  await userPage.waitForURL("**/dashboard");
  await userPage.goto("/admin/settings/contact-us");
  await userPage.waitForURL("**/dashboard");
  await userContext.close();
});
