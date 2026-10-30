// Safe to use in the browser: builds links only, no API key involved.

const LODGIFY_SLUG = "gamriechalets";

/** Lodgify's own checkout page for a stay, as its booking box opens it. */
export function lodgifyCheckoutUrl(
  rentalId: string,
  stay: { arrival: string; departure: string; adults: number; pets: number }
) {
  const params = new URLSearchParams({
    arrival: stay.arrival,
    departure: stay.departure,
    adults: String(stay.adults),
    currency: "GBP",
  });
  if (stay.pets > 0) params.set("pets", String(stay.pets));
  return `https://checkout.lodgify.com/en/${LODGIFY_SLUG}/${rentalId}/reservation?${params}`;
}
