-- A Stripe customer id is bookkeeping, not an identity: the same customer can
-- legitimately appear on more than one guest record, and a uniqueness clash
-- must never be able to stop a paid booking from being confirmed.
ALTER TABLE guests DROP CONSTRAINT guests_stripe_customer_id_key;
CREATE INDEX guests_stripe_customer ON guests (stripe_customer_id);
