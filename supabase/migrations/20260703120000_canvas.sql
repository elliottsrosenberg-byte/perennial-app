-- PER-70 / PER-87 / PER-88: spatial canvas ("board") — a simplified, Perennial-
-- styled FigJam/Miro surface. This is a NEW, spatial canvas that replaces the
-- old rich-text `canvas_html` tab in the detail panels. It is intentionally
-- generic so one <Canvas> component can attach to Home OR any entity (project,
-- contact, lead, organization, …).
--
-- Model
-- -----
--   canvases        one board, owned by a user, optionally attached to an entity.
--                   `scope = 'home'` (entity_id NULL) is the user's Home board.
--   canvas_objects  normalized per-object rows (text/sticky/shape/image/ref …)
--                   so move/scale/delete/reorder are natural single-row writes
--                   and we can layer realtime/presence on later.

-- ── canvases ──────────────────────────────────────────────────────────────────
create table if not exists public.canvases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    -- 'home' | 'project' | 'contact' | 'organization' | 'lead'
    scope       text not null,
    -- NULL for the Home board; otherwise the attached entity's id.
    entity_id   uuid,
    title       text,
    created_at  timestamp with time zone default now(),
    updated_at  timestamp with time zone default now()
);

-- One canvas per (user, scope, entity). Home rows have a NULL entity_id, so we
-- need two partial unique indexes to enforce uniqueness across the NULL split.
create unique index if not exists canvases_user_scope_entity_key
    on public.canvases (user_id, scope, entity_id)
    where entity_id is not null;
create unique index if not exists canvases_user_scope_home_key
    on public.canvases (user_id, scope)
    where entity_id is null;

create index if not exists canvases_entity_idx
    on public.canvases (entity_id) where entity_id is not null;

-- ── canvas_objects ────────────────────────────────────────────────────────────
create table if not exists public.canvas_objects (
    id          uuid primary key default gen_random_uuid(),
    canvas_id   uuid not null references public.canvases(id) on delete cascade,
    -- Denormalized owner for simple RLS + fast per-user cleanup.
    user_id     uuid not null references auth.users(id) on delete cascade,
    -- 'text' | 'sticky' | 'shape' | 'image' | 'reference'
    type        text not null,
    x           double precision not null default 0,
    y           double precision not null default 0,
    width       double precision not null default 200,
    height      double precision not null default 120,
    rotation    double precision not null default 0,
    z_index     integer not null default 0,
    -- type-specific payload (text/color/shape/url/caption/snapshot …)
    content     jsonb not null default '{}'::jsonb,
    -- For 'reference' objects: which entity this card points at.
    ref_type    text,
    ref_id      uuid,
    created_at  timestamp with time zone default now(),
    updated_at  timestamp with time zone default now()
);

create index if not exists canvas_objects_canvas_idx
    on public.canvas_objects (canvas_id);
create index if not exists canvas_objects_ref_idx
    on public.canvas_objects (ref_type, ref_id) where ref_id is not null;

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists canvases_updated_at on public.canvases;
create trigger canvases_updated_at before update on public.canvases
    for each row execute function public.handle_updated_at();

drop trigger if exists canvas_objects_updated_at on public.canvas_objects;
create trigger canvas_objects_updated_at before update on public.canvas_objects
    for each row execute function public.handle_updated_at();

-- ── RLS: owner-only, matching the app-wide "Users own their X" convention ──────
alter table public.canvases       enable row level security;
alter table public.canvas_objects enable row level security;

drop policy if exists "Users own their canvases" on public.canvases;
create policy "Users own their canvases" on public.canvases
    using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

drop policy if exists "Users own their canvas objects" on public.canvas_objects;
create policy "Users own their canvas objects" on public.canvas_objects
    using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
