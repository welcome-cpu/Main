import { expect, test, type Page } from "@playwright/test";
import { E2E_SECRET_GUEST, E2E_SLUG } from "./global-setup";

// Stay dates relative to today, so the tests never age.
function inDays(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function showMonthWith(page: Page, date: string) {
  for (let i = 0; i < 14 && !(await page.locator(`[data-date="${date}"]`).isVisible()); i++) {
    await page.getByRole("button", { name: "Next →" }).click();
  }
}

async function chooseStay(page: Page, checkIn: string, checkOut: string) {
  await showMonthWith(page, checkIn);
  await page.locator(`[data-date="${checkIn}"]`).click();
  await showMonthWith(page, checkOut);
  await page.locator(`[data-date="${checkOut}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/book/${E2E_SLUG}`);
  await expect(page.getByRole("heading", { name: "Book E2E Chalet direct" })).toBeVisible();
});

test("shows imported bookings as booked, without revealing who booked", async ({ page }) => {
  await showMonthWith(page, inDays(41));
  const booked = page.locator(`[data-date="${inDays(41)}"]`);
  await expect(booked).toBeDisabled();
  await expect(booked).toHaveAttribute("aria-label", /booked/);
  expect(await page.content()).not.toContain(E2E_SECRET_GUEST);
});

test("won't let a stay run into booked nights", async ({ page }) => {
  await showMonthWith(page, inDays(38));
  await page.locator(`[data-date="${inDays(38)}"]`).click();
  await showMonthWith(page, inDays(42));
  // Check-out after the booked nights start is not offered.
  await expect(page.locator(`[data-date="${inDays(42)}"]`)).toBeDisabled();
  // Checking out on the day the imported booking arrives is fine.
  await expect(page.locator(`[data-date="${inDays(40)}"]`)).toBeEnabled();
});

test("prices a stay on the server, with a pet fee and discount code", async ({ page }) => {
  await chooseStay(page, inDays(60), inDays(62));
  await page.getByRole("button", { name: "More pets" }).click();
  await page.getByRole("button", { name: "Check availability and price" }).click();

  const result = page.getByText("Good news: these dates are available for 2 nights.");
  await expect(result).toBeVisible();
  await expect(page.getByText("2 nights × £120.00")).toBeVisible();
  await expect(page.getByText("Pet fee (per stay)")).toBeVisible();
  await expect(page.getByText("£280.00")).toBeVisible(); // £240 + £40 pet fee
  await expect(page.getByText("Pay now (deposit)")).toBeVisible();

  await page.getByLabel("Discount code (optional)").fill("e2e10");
  await page.getByRole("button", { name: "Check availability and price" }).click();
  await expect(page.getByText("Discount (E2E10)")).toBeVisible();
  await expect(page.getByText("−£24.00")).toBeVisible();
  await expect(page.getByText("£256.00")).toBeVisible();

  await page.getByLabel("Discount code (optional)").fill("NOTACODE");
  await page.getByRole("button", { name: "Check availability and price" }).click();
  await expect(page.getByText("We don't recognise that code.")).toBeVisible();
});

test("enforces the minimum stay from the server", async ({ page }) => {
  await chooseStay(page, inDays(70), inDays(71));
  await page.getByRole("button", { name: "Check availability and price" }).click();
  await expect(page.getByText("The minimum stay for these dates is 2 nights.")).toBeVisible();
});

test("holds the dates while the guest pays, and releases them on request", async ({ page }) => {
  await chooseStay(page, inDays(80), inDays(83));
  await page.getByRole("button", { name: "Check availability and price" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.getByLabel("First name").fill("Playwright");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill("playwright@example.com");
  await page.getByLabel("Phone").fill("07700 900123");

  // Terms must be accepted.
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText(/is held for you/)).not.toBeVisible();

  await page.getByLabel(/I accept the booking terms/).check();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText(/E2E Chalet is held for you for \d+:\d\d/)).toBeVisible();
  await expect(page.getByText(/Reference GC-[0-9A-Z]{6}/)).toBeVisible();

  // A second visitor now finds those dates taken.
  const other = await page.context().newPage();
  await other.goto(`/book/${E2E_SLUG}`);
  await showMonthWith(other, inDays(81));
  await expect(other.locator(`[data-date="${inDays(81)}"]`)).toBeDisabled();

  // Releasing frees them again.
  await page.getByRole("button", { name: "Cancel and change dates" }).click();
  await expect(page.getByRole("button", { name: "Check availability and price" })).toBeVisible();
  await other.reload();
  await showMonthWith(other, inDays(81));
  await expect(other.locator(`[data-date="${inDays(81)}"]`)).toBeEnabled();
});

test("the confirmation page never claims success without proof", async ({ page }) => {
  await page.goto(`/book/${E2E_SLUG}/confirmation?reservation=00000000-0000-4000-8000-000000000000`);
  await expect(page.getByText("We can't show your booking in this browser")).toBeVisible();
  await expect(page.getByText("Your booking is confirmed")).not.toBeVisible();
});

test("booking pages send security headers and stay out of search engines", async ({ request }) => {
  const res = await request.get(`/book/${E2E_SLUG}`);
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await res.text()).toContain('name="robots" content="noindex, nofollow"');
});

test("the admin area shows nothing without sign-in", async ({ page }) => {
  await page.goto("/admin/bookings");
  await expect(page.getByText("Admin isn't set up on this deployment")).toBeVisible();
  expect(await page.content()).not.toContain("Playwright");
});
