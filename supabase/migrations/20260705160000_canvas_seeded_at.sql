-- Marks when a canvas's first-run starter content was seeded, so the Home board
-- is seeded exactly once (atomic claim) instead of racing to double-seed.
alter table public.canvases
  add column if not exists seeded_at timestamptz;
