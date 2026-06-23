-- PER-126 / PER-127: make new-user signup resilient so it can never again
-- return {"code":500,"error_code":"unexpected_failure"}.
--
-- Background
-- ----------
-- Every auth.users INSERT (email/password signup AND Google OAuth) fires the
-- public.handle_new_user() trigger, which seeds a public.profiles row. If that
-- trigger raises for ANY reason — RLS, a future NOT NULL column, a permission/
-- owner change, a transient error — GoTrue aborts the whole signup transaction
-- and the client sees a 500 `unexpected_failure`. A single failing INSERT in a
-- bookkeeping trigger should never take down authentication.
--
-- Two latent problems this migration closes:
--   1. The signup trigger lives on auth.users (auth schema), so it is NOT part
--      of the public-only baseline migration (see supabase/seed.sql, which has
--      to recreate it for staging). Anything provisioned purely from migrations
--      is missing it -> profiles never get created.
--   2. Even when present, the original function let a profile-insert failure
--      bubble up and 500 the signup.
--
-- Fix: rewrap the insert in an exception guard (a profile miss self-heals — the
-- onboarding + settings screens upsert the profile on first load), and recreate
-- the trigger idempotently. Safe to run repeatedly and against a DB that already
-- has a working trigger.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  exception
    when others then
      -- Never let profile creation abort the auth signup transaction. The
      -- profile is also upserted on first load (onboarding/settings), so a
      -- miss here self-heals on the user's next request.
      raise warning 'handle_new_user: could not seed profile for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Preserve the search_path/RPC hardening from the security scan: this function
-- is only ever invoked by the trigger, never as an RPC.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- Recreate the signup trigger idempotently. It lives on auth.users, so it is
-- absent from the public-only schema baseline.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
