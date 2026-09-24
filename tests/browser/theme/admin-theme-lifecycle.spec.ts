import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";

// Regression coverage for the Admin Theme/Branding management feature
// (see "Manage Website.md" for the user-facing guide): edit -> save draft ->
// refresh -> verify persistence -> publish -> verify live on the public
// login page -> reset to default so the suite leaves no residual branding
// behind for other tests/screenshots.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("admin can edit branding text, save the draft, and see it persist across a reload", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/theme");

  const uniqueName = `QA Test Brand ${Date.now()}`;
  await page.locator("#appName").fill(uniqueName);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save Draft" }).click(),
  ]);
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await page.reload();
  await expect(page.locator("#appName")).toHaveValue(uniqueName);
});

test("publishing the draft makes branding changes visible on the public login page, and reset restores defaults", async ({ page, browser }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/theme");

  const publishedTitle = `QA Login Title ${Date.now()}`;
  await page.getByRole("button", { name: "Login Screen" }).click();
  await page.locator("#loginTitle").fill(publishedTitle);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save Draft" }).click(),
  ]);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Publish will make the draft")).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm Publish" }).click(),
  ]);

  // The public /login page must be viewed from an unauthenticated session:
  // page.context().newPage() would share the admin's session cookie, and
  // /login redirects any already-authenticated session straight to its
  // dashboard (src/app/(auth)/login/page.tsx), never rendering the branding.
  const anonContext = await browser.newContext();
  const loginPage = await anonContext.newPage();
  await loginPage.goto("/login");
  await expect(loginPage.getByText(publishedTitle)).toBeVisible();
  await anonContext.close();

  // Cleanup: reset to default so this test (and screenshot-taking tests) are
  // repeatable and don't leak state into unrelated visual assertions.
  await page.reload();
  await page.getByRole("button", { name: "Reset to Default" }).click();
  await expect(page.getByText("Reset will discard all customization")).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm Reset" }).click(),
  ]);

  const anonContext2 = await browser.newContext();
  const loginPage2 = await anonContext2.newPage();
  await loginPage2.goto("/login");
  await expect(loginPage2.getByText(publishedTitle)).toHaveCount(0);
  await anonContext2.close();
});

test("a color value blocking accessibility contrast prevents publishing", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/theme");

  await page.getByRole("button", { name: "Colors" }).click();
  // Same-on-same (white text on white background) is unreadable and must be
  // blocked at publish time (checkAccessibility's `blocking` list).
  await page.locator("#textPrimaryColor").fill("#ffffff");
  await page.locator("#backgroundColor").fill("#ffffff");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save Draft" }).click(),
  ]);

  await page.getByRole("button", { name: "Publish" }).click();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm Publish" }).click(),
  ]);
  await expect(page.getByText(/Cannot publish/)).toBeVisible();

  // Cleanup: "Reset to Default" only replaces the PUBLISHED row — it does not
  // touch an existing DRAFT row (see resetAction in actions.ts), so the
  // white-on-white colors set above would otherwise leak into the draft for
  // every later test/run. Restore the draft's colors directly via the same
  // UI before resetting the published row, so no poisoned draft is left
  // behind.
  await page.locator("#textPrimaryColor").fill("#1b1b1e");
  await page.locator("#backgroundColor").fill("#fbf8fc");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save Draft" }).click(),
  ]);

  await page.getByRole("button", { name: "Reset to Default" }).click();
  await expect(page.getByText("Reset will discard all customization")).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm Reset" }).click(),
  ]);
});

test("uploading an invalid (non-image) file for the logo is rejected with a clear error", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/theme");

  const fakeImage = Buffer.from("this is not a real image, just plain text pretending to be one");
  await page
    .locator('div:has-text("Logo") input[type="file"]')
    .first()
    .setInputFiles({ name: "fake-logo.png", mimeType: "image/png", buffer: fakeImage });

  await page.getByRole("button", { name: "Upload" }).first().click();
  await expect(page.getByText(/could not be read as a valid image/i)).toBeVisible();
});

test("uploading an oversized theme asset is rejected", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/theme");

  // Favicon limit is 1MB; send ~1.5MB of filler bytes.
  const oversized = Buffer.alloc(1_500_000, 1);
  await page
    .locator('div:has-text("Favicon") input[type="file"]')
    .first()
    .setInputFiles({ name: "big-favicon.png", mimeType: "image/png", buffer: oversized });
  await page.getByRole("button", { name: "Upload" }).first().click();
  await expect(page.getByText(/too large/i)).toBeVisible();
});

// "a non-admin user is redirected away from /admin/theme" merged into
// tests/browser/auth/auth-rbac-lifecycle.spec.ts's parametrized table.
