-- Staging seed data — DEMO ONLY. Never run against prod.
-- Creates a demo login + sample data across the core modules so staging looks "alive".
--
-- Demo login:  demo@perennial.design  /  PerennialDemo1
--
-- Idempotent: re-running replaces the demo user's data. Keyed off the fixed demo user id
-- aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.
--
-- NOTE: the auth.users → public.profiles signup trigger lives in the `auth` schema, so it is
-- NOT part of the public-only baseline migration. This file recreates it on staging too.

begin;

-- 1. Recreate the signup trigger (auth-schema object, missing from the baseline)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Demo auth user (+ email identity). email is a generated column on identities — don't insert it.
delete from auth.identities where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from auth.users      where id      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'demo@perennial.design',
  extensions.crypt('PerennialDemo1', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"demo@perennial.design","email_verified":true,"phone_verified":false}'::jsonb,
  'email', now(), now(), now()
);

-- 3. Profile (trigger created the row; flesh it out + skip onboarding/tour)
update public.profiles set
  display_name = 'Demo Maker',
  studio_name = 'Perennial Demo Studio',
  tagline = 'Furniture & sculpture, made to last',
  location = 'Hudson, NY',
  practice_types = '{furniture,sculpture}',
  onboarding_complete = true,
  tour_dismissed = true
where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 4. Business data
delete from public.notes         where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.tasks         where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.projects      where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.contacts      where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.organizations where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.organizations (id, user_id, name, website, location, email, tags) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','The Vessel Gallery','vesselgallery.example','Hudson, NY','hello@vesselgallery.example','{gallery}'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Coastal Interiors','coastalinteriors.example','Portland, ME','studio@coastalinteriors.example','{client}'),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Hudson Maker''s Market',null,'Hudson, NY',null,'{market}');

-- contacts.status is constrained to: active | lead | inactive
insert into public.contacts (user_id, first_name, last_name, email, organization_id, title, status, is_lead, lead_stage, location, tags) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Mara','Lindqvist','mara@vesselgallery.example','11111111-1111-1111-1111-111111111111','Director','active',false,null,'Hudson, NY','{gallery}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','James','Okafor','james@coastalinteriors.example','22222222-2222-2222-2222-222222222222','Principal Designer','active',false,null,'Portland, ME','{client}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tanya','Brooks','tanya.brooks@example.com',null,'Collector','lead',true,'new','Brooklyn, NY','{collector}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Diego','Ramos','diego@makersmarket.example','33333333-3333-3333-3333-333333333333','Organizer','lead',true,'contacted','Hudson, NY','{market}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Priya','Nair','priya.nair@example.com',null,'Architect','lead',true,'new','Boston, MA','{architecture}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Sam','Whitfield','sam.w@example.com',null,'Past client','inactive',false,null,'Hudson, NY','{}');

-- projects: type/status/priority are free text; values mirror profile.project_options keys
insert into public.projects (id, user_id, title, type, status, priority, client_name, rate, est_value, listing_price, start_date, due_date, description) values
 ('a0000001-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Walnut Dining Table','furniture','in_progress','high','Coastal Interiors',95,4200,null,current_date - 10, current_date + 21,'Custom 8-seat live-edge walnut table for the Okafor residence.'),
 ('a0000002-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Bronze "Tide" Sculpture','sculpture','planning','medium',null,null,9000,null,null, current_date + 60,'Commissioned bronze for the Vessel spring show.'),
 ('a0000003-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Live-Edge Bench Series','furniture','in_progress','medium',null,null,null,1800,current_date - 25, null,'Run of three oak benches for market + gallery stock.'),
 ('a0000004-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Gallery Show Prep — Vessel','client_project','planning','high','The Vessel Gallery',null,null,null,null, current_date + 35,'Logistics, framing, and install for the April group show.');

insert into public.tasks (user_id, project_id, title, completed, priority, due_date) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000001-0000-0000-0000-000000000001','Order walnut slab from supplier',false,'high',current_date + 3),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000001-0000-0000-0000-000000000001','Finish tabletop glue-up',false,'medium',current_date + 7),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000001-0000-0000-0000-000000000001','Mock up base joinery',true,'medium',current_date - 2),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000002-0000-0000-0000-000000000002','Get bronze foundry quote',false,'high',current_date + 10),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000002-0000-0000-0000-000000000002','Sketch tide-form studies',false,'low',null),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000003-0000-0000-0000-000000000003','Sand + oil bench #1',false,'medium',current_date + 5),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000004-0000-0000-0000-000000000004','Email Mara about install dates',false,'high',current_date + 2),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null,'Photograph finished pieces for portfolio',false,'low',current_date + 14);

insert into public.notes (user_id, project_id, title, content, pinned) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000001-0000-0000-0000-000000000001','Client brief — Coastal dining table','8 seats, walnut, live edge kept on one side. Matte hardwax oil finish. Budget ~$4k.',true),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000001-0000-0000-0000-000000000001','Walnut sourcing notes','Two slab options from the Catskill yard; prefer the 10/4 for the apron.',false),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000004-0000-0000-0000-000000000004','Show checklist — Vessel','Framing, wall labels, lighting walkthrough, insurance rider, install crew of 2.',false);

commit;
