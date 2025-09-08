-- Event ledger to audit all point changes
DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('earn2', 'earn1', 'task', 'ref_bonus');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure labels exist if the type already existed with different names
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    -- Add earn2
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'earn2'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'earn2';
    END IF;
    -- Add earn1
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'earn1'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'earn1';
    END IF;
    -- Add task
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'task'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'task';
    END IF;
    -- Add ref_bonus
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'event_type' AND e.enumlabel = 'ref_bonus'
    ) THEN
      ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'ref_bonus';
    END IF;
  END IF;
END $$; -- Enum alterations are supported; IF NOT EXISTS makes it idempotent. [2][6]

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  type event_type NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  points INT NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent awarding the same task twice to the same user
CREATE UNIQUE INDEX IF NOT EXISTS unique_task_per_user
ON events(user_id, type, ((meta->>'task_id'))) WHERE type = 'task';

-- Withdrawals for token conversion (100 points -> 1 token)
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  tokens INT NOT NULL CHECK (tokens > 0),
  points_debited INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  address TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Referrals: one row per successful invite (accurate counting, no duplicates)
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  inviter_id INT NOT NULL REFERENCES users(id),
  invitee_id INT UNIQUE NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id);

-- Optional protection against self-invites
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
