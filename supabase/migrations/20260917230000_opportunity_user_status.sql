-- Per-user opportunity status (saved / applied / attending / exhibiting /
-- hidden). Replaces reads+writes of the single-tenant global
-- opportunities.user_status column, which leaked one user's saves/hides to
-- every account (one user hiding an opportunity removed it for everyone).
-- The legacy column stays in place, unread, so this is purely additive.

create table if not exists public.opportunity_user_status (
  user_id        uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status         text not null check (status in ('saved','applied','attending','exhibiting','hidden')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.opportunity_user_status enable row level security;

drop policy if exists "users manage own opportunity status" on public.opportunity_user_status;
create policy "users manage own opportunity status"
  on public.opportunity_user_status
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists opportunity_user_status_opportunity_idx
  on public.opportunity_user_status (opportunity_id);

drop trigger if exists set_opportunity_user_status_updated_at on public.opportunity_user_status;
create trigger set_opportunity_user_status_updated_at
  before update on public.opportunity_user_status
  for each row execute function public.handle_updated_at();

-- Carry the owner's existing statuses over from the legacy global column so
-- nothing is lost on prod. No-op on environments without that account.
insert into public.opportunity_user_status (user_id, opportunity_id, status)
select u.id, o.id, o.user_status
from public.opportunities o
join auth.users u on u.email = 'elliottsrosenberg@gmail.com'
where o.user_status is not null
on conflict (user_id, opportunity_id) do nothing;
