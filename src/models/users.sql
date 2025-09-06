-- Users + basic referral mapping
create table if not exists users (
  id serial primary key,
  telegram_id text unique not null,
  username text,
  created_at timestamptz not null default now(),
  points int not null default 0,
  referred_by int references users(id),
  referral_claimed boolean not null default false
);

create unique index if not exists users_telegram_id_idx on users(telegram_id);

create table if not exists referrals (
  id serial primary key,
  inviter_id int not null references users(id),
  invitee_id int not null references users(id),
  created_at timestamptz not null default now(),
  unique(inviter_id, invitee_id)
);
