-- Persistent onboarding segment: how much the user wants Perennial (and Ash) to
-- guide vs. get out of the way. Set on the 3rd onboarding screen, changeable in
-- Settings later. Drives Ash's posture, the home starter cards, and tooltip
-- density. Null until chosen. Values: 'guided' | 'balanced' | 'expert'.
alter table public.profiles
  add column if not exists guidance_level text;
