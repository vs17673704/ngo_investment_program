import { test, expect } from "playwright/test";
import { prisma, loginAsAdmin } from "../../helpers";

// Targeted regression coverage for the search box on the admin General
// Enquiries screen (src/app/admin/enquiries/general/page.tsx), specifically
// the in-box cross/clear button added to SearchFieldWithClear.
test.describe.configure({ mode: "serial" });

const PREFIX = "search-spec";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.beforeAll(async () => {
  await prisma.generalEnquiry.deleteMany({ where: { email: { contains: PREFIX } } });
  await prisma.generalEnquiry.createMany({
    data: [
      {
        name: "Alpha Rowan",
        email: `${PREFIX}-alpha@example.com`,
        message: "Question about my monthly plan.",
        source: "CONTACT_PAGE",
        status: "NEW",
      },
      {
        name: "Beta Sawyer",
        email: `${PREFIX}-beta@example.com`,
        message: "Need help with redemption.",
        source: "CONTACT_PAGE",
        status: "NEW",
      },
      {
        name: "Gamma Ito",
        email: `${PREFIX}-gamma@example.com`,
        message: "Alpha discount code did not apply.",
        source: "CONTACT_PAGE",
        status: "NEW",
      },
    ],
  });
});

test.afterAll(async () => {
  await prisma.generalEnquiry.deleteMany({ where: { email: { contains: PREFIX } } });
});

test("General Enquiries search: repeated search/clear cycles filter correctly and the cross button resets", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.waitForURL("**/admin");
  await page.goto("/admin/enquiries/general");

  const searchInput = page.locator("#q");
  const clearButton = page.getByRole("button", { name: "Clear search" });

  // Sanity: all three seeded rows visible with no search applied.
  await expect(page.getByText(`${PREFIX}-alpha@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-gamma@example.com`)).toBeVisible();
  await expect(clearButton).toHaveCount(0);

  // --- Cycle 1: search by name, matches exactly one row ("Alpha Rowan" name
  // field), cross button appears, clearing it restores the full list.
  await searchInput.fill("Alpha Rowan");
  await expect(clearButton).toBeVisible();
  await Promise.all([page.waitForURL(/[?&]q=Alpha(\+|%20)Rowan/), page.keyboard.press("Enter")]);
  await expect(page.getByText(`${PREFIX}-alpha@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toHaveCount(0);
  await expect(page.getByText(`${PREFIX}-gamma@example.com`)).toHaveCount(0);

  await expect(searchInput).toHaveValue("Alpha Rowan");
  await expect(clearButton).toBeVisible();
  await Promise.all([page.waitForURL((url) => !new URLSearchParams(url.search).get("q")), clearButton.click()]);
  await expect(searchInput).toHaveValue("");
  await expect(clearButton).toHaveCount(0);
  await expect(page.getByText(`${PREFIX}-alpha@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-gamma@example.com`)).toBeVisible();

  // --- Cycle 2: search by a message-body substring shared by two rows
  // ("Alpha" appears in both the alpha row's name and the gamma row's
  // message) to confirm the OR-across-fields match, then clear again.
  await searchInput.fill("Alpha");
  await Promise.all([page.waitForURL(/[?&]q=Alpha/), page.keyboard.press("Enter")]);
  await expect(page.getByText(`${PREFIX}-alpha@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-gamma@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toHaveCount(0);

  await Promise.all([page.waitForURL((url) => !new URLSearchParams(url.search).get("q")), clearButton.click()]);
  await expect(searchInput).toHaveValue("");
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toBeVisible();

  // --- Cycle 3: search by email substring unique to one row, then clear
  // via the cross button WITHOUT ever submitting the form (types-then-clears
  // before pressing Enter) — the field itself must reset even though no
  // navigation occurred yet.
  await searchInput.fill(`${PREFIX}-beta`);
  await expect(clearButton).toBeVisible();
  await clearButton.click();
  await expect(searchInput).toHaveValue("");
  await expect(clearButton).toHaveCount(0);

  // --- Cycle 4: a query matching nothing shows the empty state and the
  // cross button still clears it back to the full list.
  await searchInput.fill("zzz-no-such-enquiry-zzz");
  await Promise.all([page.waitForURL(/[?&]q=/), page.keyboard.press("Enter")]);
  await expect(page.getByText(`${PREFIX}-alpha@example.com`)).toHaveCount(0);
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toHaveCount(0);
  await expect(page.getByText(`${PREFIX}-gamma@example.com`)).toHaveCount(0);

  await expect(clearButton).toBeVisible();
  await Promise.all([page.waitForURL((url) => !new URLSearchParams(url.search).get("q")), clearButton.click()]);
  await expect(searchInput).toHaveValue("");
  await expect(page.getByText(`${PREFIX}-alpha@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-beta@example.com`)).toBeVisible();
  await expect(page.getByText(`${PREFIX}-gamma@example.com`)).toBeVisible();

  // --- Cycle 5: the Status filter select must be preserved across a
  // clear-via-cross-button submit (the shared form resubmits every field).
  await Promise.all([page.waitForURL(/[?&]status=IN_PROGRESS/), page.locator("#status").selectOption("IN_PROGRESS")]);
  await searchInput.fill("Alpha");
  await Promise.all([page.waitForURL(/[?&]q=Alpha/), page.keyboard.press("Enter")]);
  await expect(page.locator("#status")).toHaveValue("IN_PROGRESS");

  await Promise.all([page.waitForURL((url) => !new URLSearchParams(url.search).get("q")), clearButton.click()]);
  await expect(page.locator("#status")).toHaveValue("IN_PROGRESS");
  await expect(searchInput).toHaveValue("");
});
