-- add audit columns to withdrawals
alter table withdrawals
  add column if not exists updated_at timestamptz default now(),
  add column if not exists tx_hash text;
