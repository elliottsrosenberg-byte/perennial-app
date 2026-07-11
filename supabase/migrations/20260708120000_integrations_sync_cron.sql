-- Background mail/calendar sync scheduling primitives (PER-146).
--
-- The Gmail/Calendar sync used to run only when a user clicked "Sync now",
-- so newly-arrived email never appeared on contacts on its own. This sets up
-- the database side of a scheduled job that POSTs to the app's cron endpoint
-- (`/api/cron/integrations-sync`), which then syncs every connected account
-- under the service-role context.
--
-- This migration is SCHEMA ONLY — it does not schedule anything, because the
-- target URL and bearer secret are environment-specific (staging vs prod) and
-- the secret must never live in git. Enable per-environment via the runbook in
-- docs/architecture/operations.md (store two Vault secrets, then cron.schedule).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Reads the app URL + cron secret from Vault at run time (so neither is stored
-- in the cron.job command) and fires an async POST at the sync endpoint. The
-- endpoint is bearer-authed with CRON_SECRET and bounded per invocation, so
-- calling this on a short interval progressively backfills every account.
create or replace function public.trigger_integrations_sync()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url    text;
  v_secret text;
  v_req_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'integrations_cron_app_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'integrations_cron_secret';

  if v_url is null or v_secret is null then
    raise notice 'trigger_integrations_sync: missing Vault secrets — skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url || '/api/cron/integrations-sync',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 280000
  ) into v_req_id;

  return v_req_id;
end;
$$;

-- Locked down to owner/service-role only; never exposed to app clients.
revoke all on function public.trigger_integrations_sync() from public, anon, authenticated;
