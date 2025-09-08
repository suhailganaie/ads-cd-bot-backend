-- Users + basic referral mapping
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  points INT NOT NULL DEFAULT 0,
  referred_by INT REFERENCES users(id),
  referral_claimed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_idx ON users(telegram_id);

-- Referrals: one row per invitee globally to prevent re-attribution
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  inviter_id INT NOT NULL REFERENCES users(id),
  invitee_id INT UNIQUE NOT NULL REFERENCES users(id), -- unique across all inviters
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast counts per inviter
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id);

-- Optional: prevent self-invites for data integrity
CREATE OR REPLACE FUNCTION prevent_self_invite() RETURNS trigger AS $$
BEGIN
  IF NEW.inviter_id = NEW.invitee_id THEN
    RAISE EXCEPTION 'Self-invite not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_self_invite ON referrals;
CREATE TRIGGER trg_prevent_self_invite
BEFORE INSERT ON referrals
FOR EACH ROW EXECUTE FUNCTION prevent_self_invite();
