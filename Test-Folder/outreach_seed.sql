
do $$
declare
  uid  uuid := 'cba34652-30a3-4af4-be46-2509e0bd5d9d';
  p1   uuid; -- Galleries
  p2   uuid; -- Press
  p3   uuid; -- Events
  p4   uuid; -- Sales
  -- stage IDs for Galleries
  s1_identified  uuid;
  s1_intro_sent  uuid;
  s1_meeting     uuid;
  -- stage IDs for Press
  s2_identified  uuid;
  s2_pitched     uuid;
  s2_under_review uuid;
  -- stage IDs for Events
  s3_identified  uuid;
  s3_applied     uuid;
  s3_accepted    uuid;
  s3_planning    uuid;
  -- stage IDs for Sales
  s4_identified  uuid;
  s4_quoted      uuid;
  s4_negotiating uuid;
begin

-- ── Galleries Pipeline ───────────────────────────────────────────────────────
insert into outreach_pipelines (user_id, name, color, position)
values (uid, 'Galleries', '#2563ab', 0) returning id into p1;

insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p1, uid, 'Identified',  0, false, 'identify')  returning id into s1_identified;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p1, uid, 'Intro Sent',  1, false, 'submit')    returning id into s1_intro_sent;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p1, uid, 'Meeting',     2, false, 'discuss')   returning id into s1_meeting;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p1, uid, 'Represented', 3, true,  'closed');
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p1, uid, 'Ether',       4, true,  'closed');
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p1, uid, 'Wrong Fit',   5, true,  'closed');

-- Gallery targets
insert into outreach_targets (user_id, pipeline_id, stage_id, name, location, description, last_touched_at) values
  (uid, p1, s1_identified,  'The Parlour Gallery',      'New York, NY',      'Strong fit — contemporary furniture program, similar price point to my work.',           now() - interval '3 days'),
  (uid, p1, s1_identified,  'Bureau of Trade',          'San Francisco, CA', 'Curated objects and furniture. Reached out to a friend who knows the director.',          now() - interval '10 days'),
  (uid, p1, s1_intro_sent,  'Colony',                   'London, UK',        'Sent portfolio PDF on April 2. Following up if no reply by end of month.',                now() - interval '16 days'),
  (uid, p1, s1_intro_sent,  'Matter',                   'New York, NY',      'Emailed Jamie directly. She responded positively — waiting for availability to meet.',    now() - interval '5 days'),
  (uid, p1, s1_meeting,     'Magen H Gallery',          'New York, NY',      'Meeting scheduled for April 28. Bringing the Arch table and two lighting prototypes.',    now() - interval '1 day'),
  (uid, p1, s1_meeting,     'Hostler Burrows',          'New York, NY',      'Second meeting next week. They want exclusivity in NY — need to think through terms.',   now());

-- ── Press Pipeline ───────────────────────────────────────────────────────────
insert into outreach_pipelines (user_id, name, color, position)
values (uid, 'Press', '#6d4fa3', 1) returning id into p2;

insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p2, uid, 'Identified',   0, false, 'identify')  returning id into s2_identified;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p2, uid, 'Pitched',      1, false, 'submit')    returning id into s2_pitched;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p2, uid, 'Under Review', 2, false, 'discuss')   returning id into s2_under_review;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p2, uid, 'Published',    3, true,  'closed');
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p2, uid, 'Passed',       4, true,  'closed');

-- Press targets
insert into outreach_targets (user_id, pipeline_id, stage_id, name, location, description, last_touched_at) values
  (uid, p2, s2_identified,   'Sight Unseen',         'New York, NY',   'Top target. Annual OFFSITE feature would be ideal timing with the new collection.',   now() - interval '7 days'),
  (uid, p2, s2_identified,   'Wallpaper*',           'London, UK',     'Contact: Marcus Reed (deputy ed). Met briefly at Design Miami.',                      now() - interval '20 days'),
  (uid, p2, s2_pitched,      'Pin-Up Magazine',      'New York, NY',   'Pitched a studio visit story. Waiting on editorial calendar response.',                now() - interval '4 days'),
  (uid, p2, s2_under_review, 'Architectural Digest', 'New York, NY',   'Feature editor has the lookbook. Follow up call booked for next Wednesday.',           now() - interval '2 days');

-- ── Events Pipeline ──────────────────────────────────────────────────────────
insert into outreach_pipelines (user_id, name, color, position)
values (uid, 'Events', '#148c8c', 2) returning id into p3;

insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p3, uid, 'Identified', 0, false, 'identify')    returning id into s3_identified;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p3, uid, 'Applied',    1, false, 'submit')      returning id into s3_applied;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p3, uid, 'Accepted',   2, false, 'discuss')     returning id into s3_accepted;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p3, uid, 'Planning',   3, false, 'make_happen') returning id into s3_planning;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p3, uid, 'Completed',  4, true,  'closed');
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p3, uid, 'Declined',   5, true,  'closed');

-- Events targets
insert into outreach_targets (user_id, pipeline_id, stage_id, name, location, description, last_touched_at) values
  (uid, p3, s3_identified, 'NADA New York',         'New York, NY',  'Apply through a gallery partner. Deadline is June 15.',                               now() - interval '8 days'),
  (uid, p3, s3_applied,    'Design Miami / Basel',  'Basel, CH',     'Applied with Colony as co-presenter. Decision expected late May.',                    now() - interval '12 days'),
  (uid, p3, s3_accepted,   'Frieze New York',       'New York, NY',  'Accepted as part of the Focus section. Need to confirm logistics by May 1.',         now() - interval '1 day'),
  (uid, p3, s3_planning,   'OFFSITE by Sight Unseen','New York, NY', '6x8 booth confirmed. Building the Arch table and two lighting pieces for the show.', now());

-- ── Sales Pipeline ───────────────────────────────────────────────────────────
insert into outreach_pipelines (user_id, name, color, position)
values (uid, 'Sales', '#3d6b4f', 3) returning id into p4;

insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p4, uid, 'Identified',  0, false, 'identify')  returning id into s4_identified;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p4, uid, 'Quoted',      1, false, 'submit')    returning id into s4_quoted;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p4, uid, 'Negotiating', 2, false, 'discuss')   returning id into s4_negotiating;
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p4, uid, 'Sold',        3, true,  'closed');
insert into pipeline_stages (pipeline_id, user_id, name, position, is_outcome, meta_stage)
values (p4, uid, 'Lost',        4, true,  'closed');

-- Sales targets
insert into outreach_targets (user_id, pipeline_id, stage_id, name, location, description, last_touched_at) values
  (uid, p4, s4_identified,  'Private Collector – D.K.', 'Los Angeles, CA', 'Met at the Frieze LA dinner. Interested in the cedar console. Following up after show.',  now() - interval '14 days'),
  (uid, p4, s4_quoted,      'The Line Hotel',            'New York, NY',    'Quoted 4x pendant lights for lobby installation. Budget approved, finalizing specs.',     now() - interval '3 days'),
  (uid, p4, s4_negotiating, 'Soho House Chicago',        'Chicago, IL',     'Negotiating a 12-piece order (dining chairs). They want a volume discount.',              now() - interval '1 day');

end $$;
