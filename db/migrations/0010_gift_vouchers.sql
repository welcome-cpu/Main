-- Gift Up! vouchers redeemed against direct bookings.
--
-- A voucher is recorded as a payment (provider GIFTUP, kind VOUCHER), so it
-- counts towards what has been paid like any other payment. Its life:
--   PENDING     the hold exists; about to redeem at Gift Up
--   AUTHORISED  redeemed at Gift Up; the booking isn't confirmed yet
--   SUCCEEDED   the booking is confirmed
--   CANCELLED   the booking didn't go ahead; the redemption must be undone
--               at Gift Up (voucher_reversed_at is set once it has been)
--   FAILED      Gift Up refused the redemption (nothing to undo), or the
--               result is unknown (failure_code giftup_unknown: check Gift Up)

ALTER TABLE payments DROP CONSTRAINT payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('STRIPE', 'MANUAL', 'GIFTUP'));
ALTER TABLE payments DROP CONSTRAINT payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check CHECK (kind IN ('DEPOSIT', 'BALANCE', 'FULL', 'VOUCHER'));

ALTER TABLE payments
  -- Needed to undo a redemption. Only ever shown in the admin area.
  ADD COLUMN voucher_code text CHECK (length(voucher_code) <= 40),
  ADD COLUMN giftup_transaction_id text,
  ADD COLUMN voucher_reversed_at timestamptz,
  ADD CONSTRAINT payments_voucher_fields CHECK ((kind = 'VOUCHER') = (provider = 'GIFTUP') AND (kind <> 'VOUCHER' OR voucher_code IS NOT NULL));

-- Redemptions still to be undone, for the job that undoes them.
CREATE INDEX payments_vouchers_to_reverse ON payments (created_at)
  WHERE kind = 'VOUCHER' AND status = 'CANCELLED' AND giftup_transaction_id IS NOT NULL AND voucher_reversed_at IS NULL;

-- How much of the total a voucher pays, so total = deposit (paid by card at
-- booking) + voucher + any balance due later.
ALTER TABLE reservations ADD COLUMN voucher_pence int NOT NULL DEFAULT 0 CHECK (voucher_pence >= 0);
ALTER TABLE reservations ADD CONSTRAINT reservations_voucher_within_total CHECK (deposit_pence + voucher_pence <= total_pence);
