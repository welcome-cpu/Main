import { loadEnvFile } from "node:process";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_SLUG } from "./global-setup";

// Free nights only count as available if a stay of the minimum length (2
// nights for the E2E chalet) can include them.

function inDays(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  try {
    loadEnvFile(".env.local");
  } catch {}
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`DELETE FROM manual_blocks WHERE reason = 'e2e min stay'`;
    // Blocks either side of a single free night (day 151).
    await sql`
      INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
      SELECT id, current_date + d.s, current_date + d.e, 'e2e min stay', 'e2e'
      FROM properties, (VALUES (148, 151), (152, 155)) AS d(s, e)
      WHERE slug = ${E2E_SLUG}
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

test("a single free night between bookings isn't offered", async ({ page }) => {
  await page.goto(`/book/${E2E_SLUG}`);
  await showMonthWith(page, inDays(151));
  const lonelyNight = page.locator(`[data-date="${inDays(151)}"]`);
  await expect(lonelyNight).toHaveAttribute("aria-label", /not available/);
  await expect(lonelyNight).toBeDisabled();
  await expect(page.locator(`[data-date="${inDays(150)}"]`)).toHaveAttribute("aria-label", /booked/);

});

test("every date of a bookable stay shows as available, and clicking one picks that stay", async ({ page }) => {
  await page.goto(`/book/${E2E_SLUG}`);
  await showMonthWith(page, inDays(146));
  // Days 146–148: check in 146, check out 148 (when the block starts).
  for (const d of [146, 147, 148]) {
    await expect(page.locator(`[data-date="${inDays(d)}"]`)).toBeEnabled();
    await expect(page.locator(`[data-date="${inDays(d)}"]`)).not.toHaveAttribute("aria-label", /booked|not available/);
  }
  // 147 can't be a check-in (one night before the block), so it picks 146–148.
  await page.locator(`[data-date="${inDays(147)}"]`).click();
  await expect(page.locator(`[data-date="${inDays(146)}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-date="${inDays(148)}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Available for 2 nights")).toBeVisible();
});

test("check-out isn't offered before the minimum stay", async ({ page }) => {
  await page.goto(`/book/${E2E_SLUG}`);
  await showMonthWith(page, inDays(170));
  await page.locator(`[data-date="${inDays(170)}"]`).click();
  await showMonthWith(page, inDays(172));
  // One night is too short; two is fine. Clicking day 171 starts again instead.
  await page.locator(`[data-date="${inDays(171)}"]`).click();
  await expect(page.getByText(/Check-in .* Now choose your check-out date/)).toBeVisible();
  await page.locator(`[data-date="${inDays(173)}"]`).click();
  await expect(page.getByText("Available for 2 nights")).toBeVisible();
});
