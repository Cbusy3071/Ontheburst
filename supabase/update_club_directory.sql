-- One-off update: club directory, claims and the 'Not partnered yet' badge.
-- Paste all of this into Supabase SQL Editor and Run. Safe to run more than once.

-- ---------------------------------------------------------------------
-- Club directory
-- Clubs On the Burst lists before they join. They have no owner until a
-- club official claims the page and an admin approves it. "partnered"
-- drives the "Not partnered yet" badge and only admins can change it.
-- ---------------------------------------------------------------------
alter table public.profiles alter column owner_id drop not null;
alter table public.profiles add column if not exists partnered boolean not null default false;
alter table public.profiles add column if not exists club_tier text;
do $$ begin
  alter table public.profiles add constraint profiles_club_tier_check check (club_tier in ('nrl','senior','junior'));
exception when duplicate_object then null; end $$;
create index if not exists profiles_unowned_clubs on public.profiles(display_name) where kind = 'club';

-- Only Rising Star profiles can be deleted by their owner (a claimed club
-- page stays in the directory).
drop policy if exists "managed profiles deletable" on public.profiles;
create policy "managed profiles deletable" on public.profiles for delete to authenticated
  using (owner_id = auth.uid() and not is_primary and kind = 'rising_star');

create table if not exists public.club_claims (
  id           bigint generated always as identity primary key,
  club_id      uuid not null references public.profiles(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_name text not null check (char_length(contact_name) between 2 and 60),
  role         text not null check (char_length(role) between 2 and 40),
  note         text check (char_length(note) <= 500),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create unique index if not exists club_claims_one_pending on public.club_claims(user_id) where status = 'pending';
alter table public.club_claims enable row level security;
revoke insert, update on public.club_claims from authenticated;
revoke all on public.club_claims from anon;
drop policy if exists "own claims" on public.club_claims;
create policy "own claims" on public.club_claims for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "cancel own pending claim" on public.club_claims;
create policy "cancel own pending claim" on public.club_claims for delete to authenticated using (user_id = auth.uid() and status = 'pending');

-- Ask to take over a listed club. People who haven't set up an account yet
-- pass their date of birth, which gets the same 16+ check as onboarding.
create or replace function public.claim_club(p_club uuid, p_name text, p_role text,
                                             p_note text default null, p_dob date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h public.account_holders; c public.profiles;
begin
  if uid is null then raise exception 'You need to be signed in'; end if;
  select * into c from public.profiles where id = p_club;
  if c.id is null or c.kind <> 'club' then raise exception 'Club not found'; end if;
  if c.owner_id is not null then raise exception 'This club page is already run by the club'; end if;
  select * into h from public.account_holders where user_id = uid;
  if h.locked then return jsonb_build_object('locked', true); end if;
  if h.user_id is null then
    if p_dob is null or p_dob > current_date or p_dob < date '1900-01-01' then
      raise exception 'Enter a valid date of birth';
    end if;
    if p_dob > (current_date - interval '16 years')::date then
      insert into public.account_holders (user_id, dob, locked) values (uid, p_dob, true);
      return jsonb_build_object('locked', true);
    end if;
    insert into public.account_holders (user_id, dob) values (uid, p_dob);
  end if;
  if exists (select 1 from public.club_claims where user_id = uid and status = 'pending') then
    raise exception 'You already have a claim waiting for review';
  end if;
  insert into public.club_claims (club_id, user_id, contact_name, role, note)
  values (p_club, uid, btrim(p_name), btrim(p_role), nullif(btrim(p_note), ''));
  return jsonb_build_object('locked', false, 'pending', true);
end $$;

create or replace function public.admin_claims()
returns table (id bigint, club_id uuid, club_name text, club_handle text, user_email text,
               contact_name text, role text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select cc.id, cc.club_id, p.display_name, p.handle, u.email::text, cc.contact_name, cc.role, cc.note, cc.created_at
    from public.club_claims cc
    join public.profiles p on p.id = cc.club_id
    join auth.users u on u.id = cc.user_id
    where cc.status = 'pending'
    order by cc.created_at;
end $$;

-- Approving hands the page to the claimant. It becomes their main profile if
-- they don't have one yet, otherwise one they can switch to from the Me menu.
create or replace function public.admin_review_claim(p_claim bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare cc public.club_claims;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into cc from public.club_claims where id = p_claim;
  if cc.id is null or cc.status <> 'pending' then raise exception 'Claim not found'; end if;
  if p_approve then
    if (select owner_id from public.profiles where id = cc.club_id) is not null then
      raise exception 'Someone already runs this club page';
    end if;
    update public.profiles
       set owner_id = cc.user_id,
           is_primary = not exists (select 1 from public.profiles where owner_id = cc.user_id and is_primary),
           verified = true
     where id = cc.club_id;
    update public.club_claims set status = 'rejected', reviewed_at = now()
     where club_id = cc.club_id and status = 'pending' and id <> cc.id;
  end if;
  update public.club_claims set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now()
   where id = p_claim;
end $$;

create or replace function public.admin_set_partnered(p_profile uuid, p_partnered boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles set partnered = p_partnered where id = p_profile and kind = 'club';
end $$;

-- Lets an admin add one more club to the directory from the admin page.
create or replace function public.admin_add_club(p_name text, p_handle text, p_region text, p_tier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  insert into public.profiles (owner_id, kind, handle, display_name, region, club_tier, color)
  values (null, 'club', lower(p_handle), btrim(p_name), nullif(btrim(p_region), ''), p_tier, '#1E3A8A')
  returning * into r;
  return to_jsonb(r);
end $$;

-- On the Burst club directory: NRL clubs, Sydney senior clubs and Sydney
-- junior league clubs by district. Safe to re-run: existing handles are skipped.
-- Sources: NRL club junior pages (Rabbitohs/southsjuniors.com.au, Roosters,
-- Dragons, Bulldogs, Sharks, Wests Tigers, Eels annual report) and Wikipedia
-- district pages, checked October 2026. Clubs merge and fold, so expect a few
-- corrections; use Admin > Club directory to add any that are missing.
insert into public.profiles (owner_id, kind, handle, display_name, region, club_tier, color)
select null, 'club', v.handle, v.name, v.region::text, v.tier, v.color
from (values
  ('brisbane_broncos', 'Brisbane Broncos', null, 'nrl', '#0D2B20'),
  ('canberra_raiders', 'Canberra Raiders', null, 'nrl', '#0D2B20'),
  ('canterbury_bankstown', 'Canterbury-Bankstown Bulldogs', null, 'nrl', '#0D2B20'),
  ('cronulla_sutherland', 'Cronulla-Sutherland Sharks', null, 'nrl', '#0D2B20'),
  ('dolphins', 'Dolphins', null, 'nrl', '#0D2B20'),
  ('gold_coast_titans', 'Gold Coast Titans', null, 'nrl', '#0D2B20'),
  ('manly_warringah_sea', 'Manly Warringah Sea Eagles', null, 'nrl', '#0D2B20'),
  ('melbourne_storm', 'Melbourne Storm', null, 'nrl', '#0D2B20'),
  ('new_zealand_warriors', 'New Zealand Warriors', null, 'nrl', '#0D2B20'),
  ('newcastle_knights', 'Newcastle Knights', null, 'nrl', '#0D2B20'),
  ('north_queensland_cowboys', 'North Queensland Cowboys', null, 'nrl', '#0D2B20'),
  ('parramatta_eels', 'Parramatta Eels', null, 'nrl', '#0D2B20'),
  ('penrith_panthers', 'Penrith Panthers', null, 'nrl', '#0D2B20'),
  ('south_sydney_rabbitohs', 'South Sydney Rabbitohs', null, 'nrl', '#0D2B20'),
  ('st_george_illawarra', 'St George Illawarra Dragons', null, 'nrl', '#0D2B20'),
  ('sydney_roosters', 'Sydney Roosters', null, 'nrl', '#0D2B20'),
  ('wests_tigers', 'Wests Tigers', null, 'nrl', '#0D2B20'),
  ('newtown_jets', 'Newtown Jets', 'Sydney', 'senior', '#334155'),
  ('north_sydney_bears', 'North Sydney Bears', 'Sydney', 'senior', '#334155'),
  ('western_suburbs_magpies', 'Western Suburbs Magpies', 'Sydney', 'senior', '#334155'),
  ('blacktown_workers_sea', 'Blacktown Workers Sea Eagles', 'Sydney', 'senior', '#334155'),
  ('mount_pritchard_mounties', 'Mount Pritchard Mounties', 'Sydney', 'senior', '#334155'),
  ('wentworthville_magpies', 'Wentworthville Magpies', 'Sydney', 'senior', '#334155'),
  ('cabramatta_two_blues', 'Cabramatta Two Blues', 'Sydney', 'senior', '#334155'),
  ('glebe_dirty_reds', 'Glebe Dirty Reds', 'Sydney', 'senior', '#334155'),
  ('hills_district_bulls', 'Hills District Bulls', 'Sydney', 'senior', '#334155'),
  ('moorebank_rams', 'Moorebank Rams', 'Sydney', 'senior', '#334155'),
  ('ryde_eastwood_hawks', 'Ryde-Eastwood Hawks', 'Sydney', 'senior', '#334155'),
  ('st_marys_saints', 'St Marys Saints', 'Sydney', 'senior', '#334155'),
  ('guildford_owls', 'Guildford Owls', 'Sydney', 'senior', '#334155'),
  ('bondi_united', 'Bondi United', 'Eastern Suburbs', 'junior', '#1E3A8A'),
  ('clovelly_crocodiles', 'Clovelly Crocodiles', 'Eastern Suburbs', 'junior', '#1E3A8A'),
  ('paddington_colts', 'Paddington Colts', 'Eastern Suburbs', 'junior', '#1E3A8A'),
  ('st_charles', 'St Charles', 'Eastern Suburbs', 'junior', '#1E3A8A'),
  ('alexandria_rovers', 'Alexandria Rovers', 'South Sydney', 'junior', '#166534'),
  ('botany_rams', 'Botany Rams', 'South Sydney', 'junior', '#166534'),
  ('coogee_dolphins', 'Coogee Dolphins', 'South Sydney', 'junior', '#166534'),
  ('coogee_randwick_wombats', 'Coogee Randwick Wombats', 'South Sydney', 'junior', '#166534'),
  ('la_perouse_panthers', 'La Perouse Panthers', 'South Sydney', 'junior', '#166534'),
  ('maroubra_lions', 'Maroubra Lions', 'South Sydney', 'junior', '#166534'),
  ('marrickville_rsl_kings', 'Marrickville RSL Kings', 'South Sydney', 'junior', '#166534'),
  ('mascot_jets', 'Mascot Jets', 'South Sydney', 'junior', '#166534'),
  ('matraville_tigers', 'Matraville Tigers', 'South Sydney', 'junior', '#166534'),
  ('moore_park_broncos', 'Moore Park Broncos', 'South Sydney', 'junior', '#166534'),
  ('newtown_junior_jets', 'Newtown Junior Jets', 'South Sydney', 'junior', '#166534'),
  ('redfern_all_blacks', 'Redfern All Blacks', 'South Sydney', 'junior', '#166534'),
  ('south_sydney_mustangs', 'South Sydney Mustangs', 'South Sydney', 'junior', '#166534'),
  ('south_eastern_seagulls', 'South Eastern Seagulls', 'South Sydney', 'junior', '#166534'),
  ('bankstown_bulls', 'Bankstown Bulls', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('bankstown_sports', 'Bankstown Sports', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('berala_bears', 'Berala Bears', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('chester_hill_hornets', 'Chester Hill Hornets', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('chipping_norton', 'Chipping Norton Kangaroos', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('east_hills_bulldogs', 'East Hills Bulldogs', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('greenacre_tigers', 'Greenacre Tigers', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('milperra_colts', 'Milperra Colts', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('revesby_heights_rhinos', 'Revesby Heights Rhinos', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('st_christophers', 'St Christophers', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('st_johns_eagles', 'St Johns Eagles', 'Canterbury-Bankstown', 'junior', '#2F6FED'),
  ('all_saints_toongabbie', 'All Saints Toongabbie Tigers', 'Parramatta', 'junior', '#0E8A5F'),
  ('austral_city_bears', 'Austral City Bears', 'Parramatta', 'junior', '#0E8A5F'),
  ('baulkham_hills_brumbies', 'Baulkham Hills Brumbies', 'Parramatta', 'junior', '#0E8A5F'),
  ('canley_heights_dragons', 'Canley Heights Dragons', 'Parramatta', 'junior', '#0E8A5F'),
  ('canley_vale_kookas', 'Canley Vale Kookas', 'Parramatta', 'junior', '#0E8A5F'),
  ('cvd_cobras', 'CVD Cobras', 'Parramatta', 'junior', '#0E8A5F'),
  ('greystanes_devils', 'Greystanes Devils', 'Parramatta', 'junior', '#0E8A5F'),
  ('kellyville_bushrangers', 'Kellyville Bushrangers', 'Parramatta', 'junior', '#0E8A5F'),
  ('lalor_park_kookas', 'Lalor Park Kookas', 'Parramatta', 'junior', '#0E8A5F'),
  ('marconi_mustangs', 'Marconi Mustangs', 'Parramatta', 'junior', '#0E8A5F'),
  ('maulers_united', 'Maulers United', 'Parramatta', 'junior', '#0E8A5F'),
  ('merrylands_rams', 'Merrylands Rams', 'Parramatta', 'junior', '#0E8A5F'),
  ('olqp_bulldogs', 'OLQP Bulldogs', 'Parramatta', 'junior', '#0E8A5F'),
  ('parramatta_junior_eels', 'Parramatta Junior Eels', 'Parramatta', 'junior', '#0E8A5F'),
  ('parramatta_city_titans', 'Parramatta City Titans', 'Parramatta', 'junior', '#0E8A5F'),
  ('rouse_hill_rhinos', 'Rouse Hill Rhinos', 'Parramatta', 'junior', '#0E8A5F'),
  ('seven_hills_kangaroos', 'Seven Hills Kangaroos', 'Parramatta', 'junior', '#0E8A5F'),
  ('winston_hills_hawks', 'Winston Hills Hawks', 'Parramatta', 'junior', '#0E8A5F'),
  ('winston_hills_tigers', 'Winston Hills Tigers', 'Parramatta', 'junior', '#0E8A5F'),
  ('blacktown_city_bears', 'Blacktown City Bears', 'Penrith', 'junior', '#334155'),
  ('brothers_penrith', 'Brothers Penrith', 'Penrith', 'junior', '#334155'),
  ('cambridge_park_panthers', 'Cambridge Park Panthers', 'Penrith', 'junior', '#334155'),
  ('colyton_colts', 'Colyton Colts', 'Penrith', 'junior', '#334155'),
  ('doonside_roos', 'Doonside Roos', 'Penrith', 'junior', '#334155'),
  ('emu_plains_emus', 'Emu Plains Emus', 'Penrith', 'junior', '#334155'),
  ('glenmore_park_brumbies', 'Glenmore Park Brumbies', 'Penrith', 'junior', '#334155'),
  ('hawkesbury_city_hawks', 'Hawkesbury City Hawks', 'Penrith', 'junior', '#334155'),
  ('lower_mountains_eagles', 'Lower Mountains Eagles', 'Penrith', 'junior', '#334155'),
  ('minchinbury_jets', 'Minchinbury Jets', 'Penrith', 'junior', '#334155'),
  ('mountain_devils', 'Mountain Devils', 'Penrith', 'junior', '#334155'),
  ('north_west_magpies', 'North West Magpies', 'Penrith', 'junior', '#334155'),
  ('penrith_waratahs', 'Penrith Waratahs', 'Penrith', 'junior', '#334155'),
  ('quakers_hill_destroyers', 'Quakers Hill Destroyers', 'Penrith', 'junior', '#334155'),
  ('riverstone_razorbacks', 'Riverstone Razorbacks', 'Penrith', 'junior', '#334155'),
  ('schofields_crusaders', 'Schofields Crusaders', 'Penrith', 'junior', '#334155'),
  ('st_clair_comets', 'St Clair Comets', 'Penrith', 'junior', '#334155'),
  ('st_patricks_blacktown', 'St Patricks Blacktown', 'Penrith', 'junior', '#334155'),
  ('western_city_tigers', 'Western City Tigers', 'Penrith', 'junior', '#334155'),
  ('western_vikings', 'Western Vikings', 'Penrith', 'junior', '#334155'),
  ('windsor_wolves', 'Windsor Wolves', 'Penrith', 'junior', '#334155'),
  ('asquith_magpies', 'Asquith Magpies', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('avalon_bulldogs', 'Avalon Bulldogs', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('beacon_hill_bears', 'Beacon Hill Bears', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('belrose_eagles', 'Belrose Eagles', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('berowra_wallabies', 'Berowra Wallabies', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('manly_brothers', 'Manly Brothers', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('cromer_kingfishers', 'Cromer Kingfishers', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('forestville_ferrets', 'Forestville Ferrets', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('harbord_united_devils', 'Harbord United Devils', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('ku_ring_gai_cubs', 'Ku-ring-gai Cubs', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('lane_cove_tigers', 'Lane Cove Tigers', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('manly_cove_rebels', 'Manly Cove Rebels', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('mona_vale_raiders', 'Mona Vale Raiders', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('narrabeen_sharks', 'Narrabeen Sharks', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('narraweena_hawks', 'Narraweena Hawks', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('northwest_hawks', 'Northwest Hawks', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('north_curl_curl_knights', 'North Curl Curl Knights', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('north_sydney_brothers', 'North Sydney Brothers', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('pennant_hills', 'Pennant Hills-Cherrybrook Stags', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('willoughby_roos', 'Willoughby Roos', 'Manly Warringah / North Sydney', 'junior', '#6D28D9'),
  ('arncliffe_scots', 'Arncliffe Scots', 'St George', 'junior', '#B4452B'),
  ('brighton_seagulls', 'Brighton Seagulls', 'St George', 'junior', '#B4452B'),
  ('hurstville_united', 'Hurstville United', 'St George', 'junior', '#B4452B'),
  ('kingsgrove_colts', 'Kingsgrove Colts', 'St George', 'junior', '#B4452B'),
  ('kogarah_cougars', 'Kogarah Cougars', 'St George', 'junior', '#B4452B'),
  ('penshurst_rsl', 'Penshurst RSL Kookaburras', 'St George', 'junior', '#B4452B'),
  ('renown_united', 'Renown United', 'St George', 'junior', '#B4452B'),
  ('riverwood_legion', 'Riverwood Legion', 'St George', 'junior', '#B4452B'),
  ('aquinas_colts', 'Aquinas Colts', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('como_jannali_crocodiles', 'Como Jannali Crocodiles', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('cronulla_caringbah', 'Cronulla-Caringbah Sharks', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('de_la_salle_caringbah', 'De La Salle Caringbah', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('engadine_dragons', 'Engadine Dragons', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('gymea_gorillas', 'Gymea Gorillas', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('kurnell_stingrays', 'Kurnell Stingrays', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('menai_roosters', 'Menai Roosters', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('st_john_bosco_bulldogs', 'St John Bosco Bulldogs', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('st_josephs_kangaroos', 'St Josephs Kangaroos', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('st_patricks_sutherland', 'St Patricks Sutherland', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('sutherland_loftus_united', 'Sutherland Loftus United', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('taren_point_titans', 'Taren Point Titans', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('yarrawarrah_tigers', 'Yarrawarrah Tigers', 'Cronulla-Sutherland', 'junior', '#0891B2'),
  ('carlingford_cougars', 'Carlingford Cougars', 'Balmain', 'junior', '#C2410C'),
  ('concord_burwood_wolves', 'Concord Burwood Wolves', 'Balmain', 'junior', '#C2410C'),
  ('dundas_shamrocks', 'Dundas Shamrocks', 'Balmain', 'junior', '#C2410C'),
  ('enfield_federals', 'Enfield Federals', 'Balmain', 'junior', '#C2410C'),
  ('five_dock_dockers', 'Five Dock Dockers', 'Balmain', 'junior', '#C2410C'),
  ('holy_cross_rhinos', 'Holy Cross Rhinos', 'Balmain', 'junior', '#C2410C'),
  ('leichhardt_juniors', 'Leichhardt Juniors', 'Balmain', 'junior', '#C2410C'),
  ('leichhardt_wanderers', 'Leichhardt Wanderers', 'Balmain', 'junior', '#C2410C'),
  ('north_ryde_hawks', 'North Ryde Hawks', 'Balmain', 'junior', '#C2410C'),
  ('strathfield_raiders', 'Strathfield Raiders', 'Balmain', 'junior', '#C2410C'),
  ('all_saints_liverpool', 'All Saints Liverpool', 'Macarthur', 'junior', '#7A4E12'),
  ('campbelltown_city', 'Campbelltown City Kangaroos', 'Macarthur', 'junior', '#7A4E12'),
  ('campbelltown_collegians', 'Campbelltown Collegians', 'Macarthur', 'junior', '#7A4E12'),
  ('campbelltown_warriors', 'Campbelltown Warriors', 'Macarthur', 'junior', '#7A4E12'),
  ('eagle_vale_st_andrews', 'Eagle Vale St Andrews Magpies', 'Macarthur', 'junior', '#7A4E12'),
  ('east_campbelltown_eagles', 'East Campbelltown Eagles', 'Macarthur', 'junior', '#7A4E12'),
  ('glenquarie_all_stars', 'Glenquarie All Stars', 'Macarthur', 'junior', '#7A4E12'),
  ('hinchinbrook_hornets', 'Hinchinbrook Hornets', 'Macarthur', 'junior', '#7A4E12'),
  ('ingleburn_rsl', 'Ingleburn RSL', 'Macarthur', 'junior', '#7A4E12'),
  ('liverpool_catholic_club', 'Liverpool Catholic Club Raiders', 'Macarthur', 'junior', '#7A4E12'),
  ('macarthur_saints', 'Macarthur Saints', 'Macarthur', 'junior', '#7A4E12'),
  ('minto_cobras', 'Minto Cobras', 'Macarthur', 'junior', '#7A4E12'),
  ('appin_dogs', 'Appin Dogs', 'Group 6', 'junior', '#9A6400'),
  ('bargo_bunnies', 'Bargo Bunnies', 'Group 6', 'junior', '#9A6400'),
  ('camden_rams', 'Camden Rams', 'Group 6', 'junior', '#9A6400'),
  ('mittagong_lions', 'Mittagong Lions', 'Group 6', 'junior', '#9A6400'),
  ('mount_annan_currans_hill', 'Mount Annan Currans Hill Knights', 'Group 6', 'junior', '#9A6400'),
  ('narellan_jets', 'Narellan Jets', 'Group 6', 'junior', '#9A6400'),
  ('oran_park_gregory_hills', 'Oran Park Gregory Hills Chargers', 'Group 6', 'junior', '#9A6400'),
  ('picton_magpies', 'Picton Magpies', 'Group 6', 'junior', '#9A6400'),
  ('the_oaks_tigers', 'The Oaks Tigers', 'Group 6', 'junior', '#9A6400'),
  ('thirlmere_tahmoor', 'Thirlmere Tahmoor Roosters', 'Group 6', 'junior', '#9A6400'),
  ('warragamba_wombats', 'Warragamba Wombats', 'Group 6', 'junior', '#9A6400')
) as v(handle, name, region, tier, color)
on conflict (handle) do nothing;

notify pgrst, 'reload schema';
