-- ─── Ash preference memory ───────────────────────────────────────────────────
--
-- A per-user record of HOW the user likes to work with Ash — standing format
-- preferences, tones, approaches they're wary of, values, recurring concerns.
-- Distinct from the knowledge base: these are always loaded into Ash's context
-- (not retrieved by similarity), and they're strictly per-user (never shared).
--
-- Populated by the /api/ash/learn endpoint after each turn; `weight` increments
-- each time a preference recurs, so consistently-expressed ones carry more force.

create table public.ash_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null default 'preference',  -- preference | belief | concern | value | format
  content      text not null,                       -- concise, phrased as a standing instruction
  weight       int  not null default 1,             -- bumped each time the preference recurs
  status       text not null default 'active',      -- active | dismissed
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.ash_preferences is
  'Per-user standing preferences Ash has learned. Always loaded into Ash context; strictly own-rows, never shared across users.';

alter table public.ash_preferences enable row level security;

create policy ash_preferences_owner
  on public.ash_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index ash_preferences_user_idx
  on public.ash_preferences (user_id, status, weight desc);
