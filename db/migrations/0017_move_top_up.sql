-- When a booking moves to dearer dates, the difference is charged to the
-- guest's saved card at the time of the change, as its own payment.
ALTER TABLE payments DROP CONSTRAINT payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check CHECK (kind IN ('DEPOSIT', 'BALANCE', 'FULL', 'VOUCHER', 'TOP_UP'));
