-- ── Outreach Tables ───────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor.

-- 1. Pipelines
create table if not exists outreach_pipelines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#2563ab',
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table outreach_pipelines enable row level security;

create policy "users manage own pipelines"
  on outreach_pipelines for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Pipeline stages
create table if not exists pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references outreach_pipelines(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  position    int  not null default 0,
  is_outcome  boolean not null default false,
  meta_stage  text not null check (meta_stage in ('identify','submit','discuss','make_happen','closed')),
  created_at  timestamptz not null default now()
);

alter table pipeline_stages enable row level security;

create policy "users manage own stages"
  on pipeline_stages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Outreach targets
create table if not exists outreach_targets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  pipeline_id     uuid not null references outreach_pipelines(id) on delete cascade,
  stage_id        uuid references pipeline_stages(id) on delete set null,
  name            text not null,
  location        text,
  description     text,
  contact_id      uuid references contacts(id) on delete set null,
  company_id      uuid references companies(id) on delete set null,
  last_touched_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table outreach_targets enable row level security;

create policy "users manage own targets"
  on outreach_targets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at triggers
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger outreach_pipelines_updated_at
  before update on outreach_pipelines
  for each row execute function set_updated_at();

create trigger outreach_targets_updated_at
  before update on outreach_targets
  for each row execute function set_updated_at();
