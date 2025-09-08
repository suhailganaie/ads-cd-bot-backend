-- =========================================
-- 001_init.sql (idempotent)
-- Users, Events, Withdrawals, Referrals (for invite counts)
-- =========================================

-- Users
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

-- Event type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM ('earn2','earn1','task','ref_bonus');
  ELSE
    -- Ensure labels exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'earn2'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'earn2';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'earn1'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'earn1';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'task'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'task';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'ref_bonus'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'ref_bonus';
    END IF;
  END IF;
END $$; -- Ensures enum values exist across deploys. [3]

-- Events ledger
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  type event_type NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  points INT NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One-time task awards per user (unique per task_id in meta)
CREATE UNIQUE INDEX IF NOT EXISTS unique_task_per_user
  ON events(user_id, type, ((meta->>'task_id')))
  WHERE type = 'task';

-- Withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  tokens INT NOT NULL CHECK (tokens > 0),
  points_debited INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  address TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================
-- Referrals: exact invite relationships for fast, accurate counts
-- =========================================

-- One row per successful, unique referral: invitee_id is unique so no double counting
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  inviter_id INT NOT NULL REFERENCES users(id),
  invitee_id INT UNIQUE NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast count by inviter
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id);

-- Optional: constrain self-invite at DB level (defensive)
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

-- =========================================
-- Helper views (optional)
-- =========================================

-- Current total points by user (sum over events; points column already reflects balance)
-- CREATE OR REPLACE VIEW v_user_points AS
-- SELECT u.id AS user_id, u.points, u.username, u.telegram_id
-- FROM users u;

-- Invite counts by inviter
CREATE OR REPLACE VIEW v_invite_counts AS
SELECT inviter_id, COUNT(*)::int AS invite_count
FROM referrals
GROUP BY inviter_id;

-- =========================================
-- Example query snippets (for API handlers)
-- =========================================
-- -- Award referral (server logic):
-- -- 1) resolve inviter by telegram_id, invitee by telegram_id
-- -- 2) INSERT INTO referrals(inviter_id, invitee_id) ON CONFLICT (invitee_id) DO NOTHING;
-- -- 3) If inserted, optionally insert ref_bonus event for inviter:
-- --    INSERT INTO events(user_id,type,meta,points)
-- --    VALUES($inviter_id,'ref_bonus', jsonb_build_object('invitee_id',$invitee_id), $bonus);

-- -- Get invite count for a user:
-- -- SELECT invite_count FROM v_invite_counts WHERE inviter_id = $user_id;
-- -- or: SELECT COUNT(*)::int FROM referrals WHERE inviter_id = $user_id;
