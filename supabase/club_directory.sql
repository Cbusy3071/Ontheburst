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
