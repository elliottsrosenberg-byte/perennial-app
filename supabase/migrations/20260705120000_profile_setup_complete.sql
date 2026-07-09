-- Second onboarding flag: tracks whether the deeper, Ash-driven setup is done.
-- `onboarding_complete` now means "finished the short required sign-up modal"
-- (gates the /onboarding redirect). `profile_setup_complete` means the user has
-- finished the conversational Ash onboarding that fills the deferred profile
-- fields (work types, channels, challenges, integrations, etc.). Defaults false
-- so every existing + new row starts as "deep setup not yet done".
alter table public.profiles
  add column if not exists profile_setup_complete boolean not null default false;
