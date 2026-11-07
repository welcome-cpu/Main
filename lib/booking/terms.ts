// The cancellation and date change policy. This is the one place to edit its
// wording: the FAQ (and its structured data), the checkout terms, the guest
// emails and the gift vouchers page all use these.

export const CANCELLATION_TERMS =
  "Cancellation: Full refund if you cancel 30 or more days before arrival. 50% refund between 7 and 30 days. No refund within 7 days of arrival. We recommend travel insurance to cover the final 7 days.";

export const DATE_CHANGE_TERMS =
  "Changing dates: Move your stay once, free of charge, up to 48 hours before arrival, to available dates within 12 months of your original arrival date. Your new stay must be the same length or longer. If the new dates cost more, you pay the difference; if they cost less, we hold the difference as credit for a future stay. A moved booking keeps the cancellation terms that applied on the day you moved it.";

/** The one-line version in the booking box on each property page. */
export const TERMS_SUMMARY = "Full refund up to 30 days before arrival · Free date changes up to 48 hours before";

/** Where the full terms live: the FAQ answer, open by default. */
export const TERMS_PATH = "/faqs#cancellation";
