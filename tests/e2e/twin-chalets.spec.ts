import { loadEnvFile } from "node:process";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// Muckle View and Mohr Rest are identical chalets side by side: when dates
// are taken at one, its booking page offers the other. Runs on the test
// database only, where both are switched on and Muckle View has a block.

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
    await sql`UPDATE properties SET is_active = true, advance_notice_hours = 0 WHERE slug IN ('muckle-view', 'mohr-rest')`;
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

test("offers Mohr Rest when the dates are taken at Muckle View", async ({ page }) => {
  await page.goto("/book/muckle-view");
  await showMonthWith(page, inDays(BLOCK_FROM));
  const night = page.locator(`[data-date="${inDays(BLOCK_FROM + 1)}"]`);
  await expect(night).toHaveAttribute("aria-label", /booked, Mohr Rest free/);

  await page.locator(`[data-date="${inDays(BLOCK_FROM)}"]`).click();
  await page.locator(`[data-date="${inDays(BLOCK_FROM + 2)}"]`).click();
  await page.getByRole("button", { name: "More pets" }).click();

  await expect(page.getByText("Muckle View is booked for some of these nights, but Mohr Rest is free.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check availability and price" })).toBeDisabled();

  await page.getByRole("link", { name: "Book Mohr Rest for these dates" }).click();
  await expect(page).toHaveURL(/\/book\/mohr-rest\?/);
  await expect(page.getByRole("heading", { name: "Book Mohr Rest direct" })).toBeVisible();
  // The dates and guests come across.
  await expect(page.locator(`[data-date="${inDays(BLOCK_FROM)}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-date="${inDays(BLOCK_FROM + 2)}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Fewer pets" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Check availability and price" })).toBeEnabled();
});

test("Mohr Rest stays closed before opening day", async ({ page }) => {
  await page.goto("/book/mohr-rest");
  const beforeOpening = inDays(10) < "2027-01-01" ? inDays(10) : null;
  test.skip(!beforeOpening, "Mohr Rest is already open");
  await showMonthWith(page, beforeOpening!);
  await expect(page.locator(`[data-date="${beforeOpening}"]`)).toHaveAttribute("aria-label", /booked, Muckle View free/);
});
