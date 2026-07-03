-- ─── Ash knowledge base (RAG) ────────────────────────────────────────────────
--
-- Backs Ash's industry-expertise layer. Content is chunked, embedded, and
-- retrieved per question via `match_knowledge` (called by the search_knowledge_base
-- tool in lib/ash/tools/read.ts) instead of living as a static block in the
-- system prompt.
--
-- Tenancy mirrors `opportunities` (the one other shared table), with one addition:
--   • user_id IS NULL  → global expertise, readable by every authenticated user
--   • user_id = <uid>  → that user's private knowledge, readable only by them
-- Writes are service-role only (the ingestion script), same as the opportunities feed.

create extension if not exists vector;

create table public.knowledge_base (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,   -- NULL = global
  chunk_id         text not null unique,                               -- stable upsert key: '<doc-slug>#<index>'
  category         text not null,                                      -- pricing | galleries | fairs | press | channels | cash-flow | contracts ...
  title            text not null,
  source           text,                                               -- doc name / URL the chunk came from
  content          text not null,                                      -- the chunk text
  context_summary  text,                                               -- contextual-retrieval prefix (see ingestion script)
  content_hash     text,                                               -- lets re-ingest skip unchanged chunks
  embedding        vector(1024),                                       -- voyage-3.5 default dim; change if you swap providers
  metadata         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.knowledge_base is
  'Ash RAG store. user_id NULL = global expertise (all authed users read); user_id set = private per-user knowledge. Service-role writes only.';

alter table public.knowledge_base enable row level security;

-- Read: global rows OR your own.
create policy read_knowledge_base
  on public.knowledge_base for select
  to authenticated
  using (user_id is null or user_id = auth.uid());

-- Write: service-role only (the ingestion script). Browser writes silently no-op,
-- exactly like the opportunities feed.
create policy service_write_knowledge_base
  on public.knowledge_base for all
  to service_role
  using (true)
  with check (true);

-- Approximate-nearest-neighbour index for cosine similarity.
create index knowledge_base_embedding_idx
  on public.knowledge_base
  using hnsw (embedding vector_cosine_ops);

-- Filter helpers.
create index knowledge_base_category_idx on public.knowledge_base (category);
create index knowledge_base_user_id_idx  on public.knowledge_base (user_id);

-- ─── Retrieval RPC ────────────────────────────────────────────────────────────
-- SECURITY INVOKER (default): RLS above still gates which rows are visible, so a
-- user can only ever match global rows plus their own. `filter_category` is optional.
create or replace function public.match_knowledge(
  query_embedding vector(1024),
  match_count     int  default 5,
  filter_category text default null
)
returns table (
  id              uuid,
  category        text,
  title           text,
  source          text,
  content         text,
  context_summary text,
  similarity      float
)
language sql
stable
as $$
  select
    kb.id,
    kb.category,
    kb.title,
    kb.source,
    kb.content,
    kb.context_summary,
    1 - (kb.embedding <=> query_embedding) as similarity
  from public.knowledge_base kb
  where kb.embedding is not null
    and (filter_category is null or kb.category = filter_category)
  order by kb.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
