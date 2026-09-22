-- Paid-plan foundation: subscription state on profiles + a per-user Ash credit
-- ledger. Pairs with lib/plans.ts (allowances, costs) and PER-12 (Stripe).

-- ── Subscription state ──────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists plan                 text not null default 'free',
  add column if not exists subscription_status  text,
  add column if not exists stripe_customer_id   text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end   timestamptz,
  add column if not exists trial_ends_at        timestamptz,
  add column if not exists plan_grandfathered   boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free','studio','atelier'));
  end if;
end $$;

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- Grandfather every account that existed before paid plans: permanent
-- Studio-level access, never auto-charged. resolvePlan() reads this flag.
update public.profiles set plan_grandfathered = true where plan_grandfathered = false;

-- ── Ash credit ledger ───────────────────────────────────────────────────────
-- One row per charged Ash turn. Users may read their own rows (to render a
-- balance) but never write them — all writes go through the service-role
-- client server-side, so a user can't mint or delete credits.
create table if not exists public.ash_credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  credits         integer not null check (credits > 0),
  reason          text not null check (reason in ('message','tools','web_search','research')),
  conversation_id uuid,
  created_at      timestamptz not null default now()
);

alter table public.ash_credit_ledger enable row level security;

drop policy if exists "users read own ash credit ledger" on public.ash_credit_ledger;
create policy "users read own ash credit ledger"
  on public.ash_credit_ledger
  for select
  using (auth.uid() = user_id);

-- Spend-in-window lookups: (user, time) is the only access pattern.
create index if not exists ash_credit_ledger_user_created_idx
  on public.ash_credit_ledger (user_id, created_at desc);
