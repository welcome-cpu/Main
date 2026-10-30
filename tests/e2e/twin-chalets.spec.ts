import { loadEnvFile } from "node:process";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// Muckle View and Mohr Rest are identical chalets side by side: each one's
// page prices both and books either, without leaving the page. Runs on the
// test database only, where both are switched on and Muckle View has a block.

function inDays(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Past Mohr Rest's opening block, inside both booking windows.
const BLOCK_FROM = 100;
const BLOCK_TO = 103;

test.beforeAll(async () => {
  try {
    loadEnvFile(".env.local");
  } catch {}
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    // Base prices rather than Lodgify's, so the test doesn't depend on imported rates.
    await sql`
      UPDATE properties SET is_active = true, advance_notice_hours = 0, rate_source = 'MANUAL', base_nightly_pence = 16500
      WHERE slug IN ('muckle-view', 'mohr-rest')
    `;
    await sql`DELETE FROM manual_blocks WHERE reason = 'e2e twin'`;
    await sql`
      INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
      SELECT id, current_date + ${BLOCK_FROM}::int, current_date + ${BLOCK_TO}::int, 'e2e twin', 'e2e'
      FROM properties WHERE slug = 'muckle-view'
    `;
  } finally {
    await sql.end();
  }
});

async function showMonthWith(page: Page, date: string) {
  for (let i = 0; i < 14 && !(await page.locator(`[data-date="${date}"]`).isVisible()); i++) {
    await page.getByRole("button", { name: "Next →" }).click();
  }
}

test("books Mohr Rest from Muckle View's page when Muckle View is taken", async ({ page }) => {
  await page.goto("/properties/muckle-view");
  await expect(page.getByRole("heading", { name: "Book Muckle View", exact: true })).toBeVisible();
  await showMonthWith(page, inDays(BLOCK_FROM));
  await expect(page.locator(`[data-date="${inDays(BLOCK_FROM + 1)}"]`)).toHaveAttribute("aria-label", /booked, Mohr Rest free/);

  await page.locator(`[data-date="${inDays(BLOCK_FROM)}"]`).click();
  await page.locator(`[data-date="${inDays(BLOCK_FROM + 2)}"]`).click();

  // Both chalets answered at once, without pressing anything else.
  await expect(page.locator('[data-chalet="Muckle View"]')).toContainText("Booked for some of these nights");
  const mohrRest = page.locator('[data-chalet="Mohr Rest"]');
  await expect(mohrRest).toContainText("Available for 2 nights");
  await expect(mohrRest).toContainText("£330.00");

  await mohrRest.getByRole("button", { name: "Book Mohr Rest" }).click();
  await expect(page).toHaveURL(/\/properties\/muckle-view$/);
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByText(/Mohr Rest/).first()).toBeVisible();
});

test("offers only this page's chalet when it's free", async ({ page }) => {
  await page.goto("/properties/mohr-rest");
  await showMonthWith(page, inDays(BLOCK_FROM + 20));
  await page.locator(`[data-date="${inDays(BLOCK_FROM + 20)}"]`).click();
  await showMonthWith(page, inDays(BLOCK_FROM + 23));
  await page.locator(`[data-date="${inDays(BLOCK_FROM + 23)}"]`).click();
  await expect(page.getByRole("button", { name: "Book now" })).toBeVisible();
  await expect(page.locator('[data-chalet="Mohr Rest"]')).toContainText("Available for 3 nights");
  await expect(page.locator('[data-chalet="Muckle View"]')).toHaveCount(0);
});

test("a search's dates and guests carry into the booking page", async ({ page }) => {
  await page.goto(`/book/mohr-rest?checkIn=${inDays(BLOCK_FROM)}&checkOut=${inDays(BLOCK_FROM + 2)}&adults=2&pets=1`);
  await expect(page.locator(`[data-date="${inDays(BLOCK_FROM)}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Fewer pets" })).toBeEnabled();
  await expect(page.locator('[data-chalet="Mohr Rest"]')).toContainText("Available for 2 nights");
});

test("Mohr Rest stays closed before opening day", async ({ page }) => {
  const beforeOpening = inDays(10) < "2027-01-01" ? inDays(10) : null;
  test.skip(!beforeOpening, "Mohr Rest is already open");
  await page.goto("/book/mohr-rest");
  await showMonthWith(page, beforeOpening!);
  await expect(page.locator(`[data-date="${beforeOpening}"]`)).toHaveAttribute("aria-label", /booked, Muckle View free/);
});
