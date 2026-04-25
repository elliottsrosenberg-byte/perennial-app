-- ── Finance Tables ────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor.
-- Requires: projects, contacts, companies tables already exist.
-- Requires: set_updated_at() function already exists (from outreach_migration.sql).

-- 1. Time entries
create table if not exists time_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  project_id       uuid references projects(id) on delete set null,
  description      text not null default '',
  duration_minutes int  not null check (duration_minutes > 0),
  billable         boolean not null default true,
  logged_at        date not null default current_date,
  created_at       timestamptz not null default now()
);

alter table time_entries enable row level security;
create policy "users manage own time_entries"
  on time_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Active timer (one row per user, upserted on start, deleted on stop)
create table if not exists active_timers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  description text not null default '',
  started_at  timestamptz not null default now()
);

alter table active_timers enable row level security;
create policy "users manage own active_timers"
  on active_timers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Expenses
create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  description text not null,
  category    text not null check (category in ('materials','travel','production','software','other')),
  amount      numeric(10,2) not null check (amount > 0),
  date        date not null default current_date,
  receipt_url text,
  created_at  timestamptz not null default now()
);

alter table expenses enable row level security;
create policy "users manage own expenses"
  on expenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Invoices
-- status: draft → sent → paid  (overdue is computed: status='sent' AND due_at < today)
-- client: exactly one of client_contact_id / client_company_id must be set (enforced in app)
create table if not exists invoices (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  number             int  not null,
  status             text not null default 'draft' check (status in ('draft','sent','paid')),
  client_contact_id  uuid references contacts(id) on delete set null,
  client_company_id  uuid references companies(id) on delete set null,
  project_id         uuid references projects(id) on delete set null,
  issued_at          date not null default current_date,
  due_at             date,
  paid_at            date,
  notes              text,
  payment_method     text,
  payment_terms      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, number)
);

alter table invoices enable row level security;
create policy "users manage own invoices"
  on invoices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger invoices_updated_at
  before update on invoices
  for each row execute function set_updated_at();

-- 5. Invoice line items
create table if not exists invoice_line_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  description   text not null,
  quantity      numeric(10,2) not null default 1,
  rate          numeric(10,2) not null default 0,
  amount        numeric(10,2) not null,
  source        text not null default 'manual' check (source in ('time','expense','manual')),
  time_entry_id uuid references time_entries(id) on delete set null,
  expense_id    uuid references expenses(id) on delete set null
);

alter table invoice_line_items enable row level security;
create policy "users manage own invoice_line_items"
  on invoice_line_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
