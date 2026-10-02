-- Guest access to their own hold/booking without accounts: the guest's
-- browser holds a random token; only its SHA-256 hash is stored, so a
-- database leak doesn't reveal working links.
ALTER TABLE reservations
  ADD COLUMN access_token_sha256 bytea UNIQUE CHECK (length(access_token_sha256) = 32),
  -- When the guest accepted the booking terms (e.g. non-refundable payments).
  ADD COLUMN terms_accepted_at timestamptz,
  ADD CONSTRAINT reservations_direct_needs_terms
    CHECK (source <> 'DIRECT' OR terms_accepted_at IS NOT NULL) NOT VALID;
