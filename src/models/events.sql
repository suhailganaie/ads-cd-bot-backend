-- Event ledger to audit all point changes
do $$ begin
  create type event_type as enum ('ad_main', 'ad_side', 'task', 'ref_bonus');
exception
  when duplicate_object then null;
end $$;

create table if not exists events (
  id serial primary key,
  user_id int not null references users(id),
  type event_type not null,
  meta jsonb not null default '{}'::jsonb,
  points int not null,
  created_at timestamptz not null default now()
);

-- Prevent awarding the same task twice to the same user
create unique index if not exists unique_task_per_user
on events(user_id, type, ((meta->>'task_id'))) where type = 'task';

-- Withdrawals for token conversion (100 points -> 1 token)
create table if not exists withdrawals (
  id serial primary key,
  user_id int not null references users(id),
  tokens int not null check (tokens > 0),
  points_debited int not null,
  status text not null default 'pending', -- pending | approved | rejected
  address text,
  created_at timestamptz not null default now()
);
