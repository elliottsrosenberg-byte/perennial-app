-- ── Ash AI — Conversation Tables ─────────────────────────────────────────────
-- Run this in the Supabase SQL editor.

-- 1. Conversations (one per session / topic)
create table if not exists ash_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  module     text,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ash_conversations enable row level security;
create policy "users manage own ash_conversations"
  on ash_conversations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Messages (each turn in a conversation)
create table if not exists ash_messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references ash_conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,
  created_at      timestamptz not null default now()
);

alter table ash_messages enable row level security;
create policy "users manage own ash_messages"
  on ash_messages for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast history lookup
create index if not exists ash_messages_conversation_created
  on ash_messages (conversation_id, created_at asc);
