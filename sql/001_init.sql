-- =========================================
-- Base schema using enum labels: 'earn2','earn1','task','ref_bonus'
-- Idempotent: safe to run multiple times
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

-- Event type enum: create with desired labels or ensure they exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM ('earn2','earn1','task','ref_bonus');
  ELSE
    -- Ensure required labels exist (no-ops if already present)
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
  END IF;
END $$;  -- Postgres supports adding/renaming enum labels via ALTER TYPE[web:1864][web:1879]

-- Events ledger
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  type event_type NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  points INT NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One-time task awards per user
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
