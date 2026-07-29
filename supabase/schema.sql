-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create table if not exists kv (
  user_id    uuid references auth.users(id) on delete cascade not null,
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Row-level security: each signed-in person can only ever touch their own rows.
-- Without this, the public anon key would expose everyone's data.
alter table kv enable row level security;

drop policy if exists "own rows only" on kv;
create policy "own rows only" on kv
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
