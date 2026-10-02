/** Formats integer pence as a currency string, e.g. 16500 -> "£165.00". */
export function formatPence(pence: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(pence / 100);
}

/** Pence as a plain "165.00" string, for form inputs. */
export function penceToInput(pence: number) {
  return (pence / 100).toFixed(2);
}

/**
 * Parses a pounds amount typed by an admin ("165", "165.5", "165.50") into
 * integer pence without floating-point rounding. Returns null if invalid.
 */
export function poundsToPence(input: string): number | null {
  const match = input.trim().replace(/^£/, "").match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
