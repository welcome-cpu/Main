-- Moving a booking to new dates (an owner action). Each move is recorded
-- with the dates and prices before and after.

CREATE TABLE reservation_moves (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id            uuid NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  moved_at                  timestamptz NOT NULL DEFAULT now(),
  moved_by                  text NOT NULL,
  reason                    text NOT NULL CHECK (length(reason) <= 500),
  from_check_in             date NOT NULL,
  from_check_out            date NOT NULL,
  to_check_in               date NOT NULL,
  to_check_out              date NOT NULL,
  old_total_pence           int NOT NULL,
  new_total_pence           int NOT NULL,
  paid_pence                int NOT NULL,
  -- Still to pay at the new price, and paid beyond it (held as credit).
  owed_pence                int NOT NULL CHECK (owed_pence >= 0),
  credit_pence              int NOT NULL CHECK (credit_pence >= 0),
  charged_automatically     boolean NOT NULL,
  email_guest               boolean NOT NULL,
  previous_price_breakdown  jsonb NOT NULL
);
CREATE INDEX reservation_moves_reservation ON reservation_moves (reservation_id, moved_at);

-- A move can make more to pay after the balance has already been taken, so a
-- booking may now have more than one balance payment over time. Still only
-- one can be waiting to be charged at once.
DROP INDEX payments_one_live_per_kind;
CREATE UNIQUE INDEX payments_one_live_per_kind ON payments (reservation_id, kind)
  WHERE status IN ('PENDING', 'AUTHORISED') OR (status = 'SUCCEEDED' AND kind <> 'BALANCE');
