-- =====================================================================
-- On the Burst: database schema for Supabase
--
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- It's safe to run again after edits: tables are created only if missing,
-- and functions, triggers and policies are replaced.
--
-- Security model in one paragraph:
--   * Every signed-in person is an "account holder" (16+, checked by DOB).
--   * An account holder owns one primary profile, and a parent can also own
--     Rising Star profiles (under 16) and act on their behalf.
--   * Row level security decides who can read and write every row. The
--     anon key in the front end can't do anything the policies below don't allow.
--   * Counters (likes, comments, followers, views) are kept by triggers, and
--     clients can't write them directly.
--   * Nothing is readable while signed out.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.profile_kind as enum
    ('player','rising_star','parent','club','scout','coach','agent','fan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_kind as enum
    ('clip','text','trial','event','team','milestone','stats');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- People who can moderate. Add yourself with:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per signed-up person. DOB is private to its owner.
create table if not exists public.account_holders (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  dob        date not null,
  locked     boolean not null default false,   -- under-16 lockout
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  kind            public.profile_kind not null,
  is_primary      boolean not null default false,
  handle          text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name    text not null check (char_length(display_name) between 2 and 60),
  pos             text check (char_length(pos) <= 30),          -- playing position / role title
  club_name       text check (char_length(club_name) <= 80),
  club_id         uuid references public.profiles(id) on delete set null,
  club_status     text not null default 'none' check (club_status in ('none','pending','confirmed')),
  manager_id      uuid references public.profiles(id) on delete set null,  -- parent profile for Rising Stars
  grade           text check (char_length(grade) <= 20),
  jersey          text check (jersey ~ '^[0-9]{1,2}$'),
  region          text check (char_length(region) <= 60),
  bio             text check (char_length(bio) <= 400),
  avatar_url      text check (avatar_url ~ '^https?://' and char_length(avatar_url) <= 500),
  color           text not null default '#2F6FED' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  verified        boolean not null default false,
  follower_count  int not null default 0,
  following_count int not null default 0,
  profile_views   int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists profiles_one_primary on public.profiles(owner_id) where is_primary;
create index if not exists profiles_owner_idx on public.profiles(owner_id);
create index if not exists profiles_kind_idx  on public.profiles(kind);
create index if not exists profiles_club_idx  on public.profiles(club_id);

-- Private details for Rising Star profiles (visible to the parent only).
create table if not exists public.rising_star_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  dob        date not null
);

create table if not exists public.posts (
  id                 uuid primary key default gen_random_uuid(),
  author_id          uuid not null references public.profiles(id) on delete cascade,
  kind               public.post_kind not null,
  caption            text not null default '' check (char_length(caption) <= 2000),
  tags               text[] not null default '{}',
  media_path         text,
  poster_path        text,
  media_width        int check (media_width between 1 and 10000),
  media_height       int check (media_height between 1 and 10000),
  duration_s         numeric(6,2) check (duration_s >= 0 and duration_s <= 61),
  event_date         date,
  data               jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  like_count         int not null default 0,
  comment_count      int not null default 0,
  view_count         int not null default 0,
  registration_count int not null default 0,
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  constraint posts_clip_has_media check (kind <> 'clip' or media_path is not null),
  constraint posts_events_dated   check (kind not in ('trial','event') or event_date is not null)
);
create index if not exists posts_created_idx on public.posts(created_at desc);
create index if not exists posts_author_idx  on public.posts(author_id, created_at desc);
create index if not exists posts_kind_idx    on public.posts(kind, created_at desc);
create index if not exists posts_event_idx   on public.posts(event_date) where kind in ('trial','event');
create index if not exists posts_tags_idx    on public.posts using gin(tags);

create table if not exists public.likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create index if not exists likes_profile_idx on public.likes(profile_id);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  status     text not null default 'approved' check (status in ('approved','pending')),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id, created_at);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows(followee_id);

create table if not exists public.saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);

create table if not exists public.registrations (
  post_id    uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'interested' check (status in ('interested','confirmed')),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create index if not exists registrations_profile_idx on public.registrations(profile_id);

create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete cascade,
  type         text not null,
  post_id      uuid references public.posts(id) on delete cascade,
  comment_id   uuid references public.comments(id) on delete cascade,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid default auth.uid() references auth.users(id) on delete set null,
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.comments(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  reason      text not null check (char_length(reason) <= 60),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open','resolved')),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id, profile_id) >= 1)
);

-- Results measured at combines and entered by admins.
create table if not exists public.verified_stats (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  metric      text not null check (char_length(metric) between 1 and 40),
  value       numeric not null,
  unit        text check (char_length(unit) <= 10),
  event_name  text check (char_length(event_name) <= 80),
  recorded_on date not null default current_date,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists verified_stats_profile_idx on public.verified_stats(profile_id);

-- One view per person per day, so counts mean something.
create table if not exists public.post_view_log (
  post_id   uuid not null references public.posts(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  viewed_on date not null default current_date,
  primary key (post_id, user_id, viewed_on)
);
create table if not exists public.profile_view_log (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  viewed_on  date not null default current_date,
  primary key (profile_id, user_id, viewed_on)
);


-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create or replace function public.owns_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = pid and owner_id = auth.uid())
$$;

create or replace function public.profile_owner(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.profiles where id = pid
$$;

create or replace function public._norm_tags(t text[]) returns text[]
language sql immutable as $$
  select coalesce((
    select (array_agg(x order by first_pos))[1:10] from (
      select x, min(ord) as first_pos from (
        select lower(regexp_replace(raw, '[^A-Za-z0-9_]', '', 'g')) as x, ord
        from unnest(coalesce(t, '{}')) with ordinality as u(raw, ord)
      ) s where x <> '' and char_length(x) <= 30 group by x
    ) d
  ), '{}')
$$;

create or replace function public._notify(p_recipient uuid, p_actor uuid, p_type text,
                                           p_post uuid default null, p_comment uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then return; end if;
  -- never notify someone about their own actions (including a parent acting as their child)
  if p_actor is not null and public.profile_owner(p_actor) = public.profile_owner(p_recipient) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  values (p_recipient, p_actor, p_type, p_post, p_comment);
end $$;
revoke execute on function public._notify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;


-- Computed relationships. PostgREST doesn't embed a table into itself via a
-- foreign key, so these let the API do profiles -> manager and profiles -> club:
--   select=*,manager(display_name,handle),club(handle,verified)
create or replace function public.manager(public.profiles) returns setof public.profiles
language sql stable rows 1 set search_path = public as $$
  select * from public.profiles where id = $1.manager_id
$$;
create or replace function public.club(public.profiles) returns setof public.profiles
language sql stable rows 1 set search_path = public as $$
  select * from public.profiles where id = $1.club_id
$$;


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- profiles: normalise, validate club links, track club confirmation
create or replace function public._profiles_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.profiles;
begin
  new.handle := lower(new.handle);
  new.display_name := btrim(new.display_name);
  if new.kind = 'club' then new.club_id := null; end if;

  if new.club_id is not null then
    select * into c from public.profiles where id = new.club_id;
    if c.id is null or c.kind <> 'club' then
      raise exception 'That club isn''t on On the Burst yet';
    end if;
    new.club_name := c.display_name;
  end if;

  if tg_op = 'INSERT' or new.club_id is distinct from old.club_id then
    new.club_status := case when new.club_id is null then 'none' else 'pending' end;
  end if;

  new.updated_at := now();
  return new;
end $$;

create or replace function public._profiles_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.club_id is not null and new.club_status = 'pending'
     and (tg_op = 'INSERT' or new.club_id is distinct from old.club_id) then
    perform public._notify(new.club_id, new.id, 'membership_request');
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is not null and old.club_id is distinct from new.club_id then
      delete from public.notifications
      where type = 'membership_request' and recipient_id = old.club_id and actor_id = new.id;
    end if;
    if new.kind = 'club' and new.display_name is distinct from old.display_name then
      update public.profiles set club_name = new.display_name where club_id = new.id;
    end if;
    if new.verified and not old.verified then
      perform public._notify(new.id, null, 'verified');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists profiles_before on public.profiles;
create trigger profiles_before before insert or update on public.profiles
  for each row execute function public._profiles_before();
drop trigger if exists profiles_after on public.profiles;
create trigger profiles_after after insert or update on public.profiles
  for each row execute function public._profiles_after();


-- posts: who can post what, media ownership, clean counters
create or replace function public._posts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.profiles; uid uuid := auth.uid();
begin
  select * into a from public.profiles where id = new.author_id;
  if a.id is null then raise exception 'Unknown profile'; end if;

  if new.kind in ('trial','event') and not ((a.kind = 'club' and a.verified) or public.is_admin()) then
    raise exception 'Trials and events can only be posted by verified clubs';
  end if;
  if new.kind = 'team' and a.kind <> 'club' and not public.is_admin() then
    raise exception 'Team lists can only be posted by clubs';
  end if;
  if new.kind in ('milestone','stats') and a.kind not in ('player','rising_star') then
    raise exception 'Milestones and stats are for player profiles';
  end if;

  if new.kind = 'clip' then
    if uid is not null and split_part(new.media_path, '/', 1) <> uid::text then
      raise exception 'Invalid media path';
    end if;
    if uid is not null and new.poster_path is not null and split_part(new.poster_path, '/', 1) <> uid::text then
      raise exception 'Invalid poster path';
    end if;
  else
    new.media_path := null; new.poster_path := null; new.duration_s := null;
    new.media_width := null; new.media_height := null;
  end if;
  if new.kind not in ('trial','event') then new.event_date := null; end if;

  new.caption := btrim(new.caption);
  new.tags := public._norm_tags(new.tags);
  new.like_count := 0; new.comment_count := 0; new.view_count := 0; new.registration_count := 0;
  new.created_at := now(); new.edited_at := null;
  return new;
end $$;

create or replace function public._posts_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.caption is distinct from old.caption or new.tags is distinct from old.tags then
    new.caption := btrim(new.caption);
    new.tags := public._norm_tags(new.tags);
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert before insert on public.posts
  for each row execute function public._posts_before_insert();
drop trigger if exists posts_before_update on public.posts;
create trigger posts_before_update before update on public.posts
  for each row execute function public._posts_before_update();


-- likes
create or replace function public._likes_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    perform public._notify((select author_id from public.posts where id = new.post_id),
                           new.profile_id, 'like', new.post_id);
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    delete from public.notifications
    where type = 'like' and post_id = old.post_id and actor_id = old.profile_id;
  end if;
  return null;
end $$;
drop trigger if exists likes_after on public.likes;
create trigger likes_after after insert or delete on public.likes
  for each row execute function public._likes_after();


-- comments: anything on a Rising Star's post waits for the parent
create or replace function public._comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pa public.profiles;
begin
  select a.* into pa from public.posts p join public.profiles a on a.id = p.author_id
  where p.id = new.post_id;
  if pa.id is null then raise exception 'Post not found'; end if;
  new.body := btrim(new.body);
  if pa.kind = 'rising_star' and public.profile_owner(new.author_id) is distinct from pa.owner_id then
    new.status := 'pending';
  else
    new.status := 'approved';
  end if;
  new.created_at := now();
  return new;
end $$;

create or replace function public._comments_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare post_author uuid;
begin
  if tg_op = 'INSERT' then
    select author_id into post_author from public.posts where id = new.post_id;
    if new.status = 'approved' then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
      perform public._notify(post_author, new.author_id, 'comment', new.post_id, new.id);
    else
      perform public._notify(post_author, new.author_id, 'comment_pending', new.post_id, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'approved' and new.status = 'approved' then
      select author_id into post_author from public.posts where id = new.post_id;
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
      delete from public.notifications where type = 'comment_pending' and comment_id = new.id;
      perform public._notify(new.author_id, post_author, 'comment_approved', new.post_id, new.id);
    end if;
  else
    if old.status = 'approved' then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists comments_before_insert on public.comments;
create trigger comments_before_insert before insert on public.comments
  for each row execute function public._comments_before_insert();
drop trigger if exists comments_after on public.comments;
create trigger comments_after after insert or update or delete on public.comments
  for each row execute function public._comments_after();


-- follows
create or replace function public._follows_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    perform public._notify(new.followee_id, new.follower_id, 'follow');
  else
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    delete from public.notifications
    where type = 'follow' and recipient_id = old.followee_id and actor_id = old.follower_id;
  end if;
  return null;
end $$;
drop trigger if exists follows_after on public.follows;
create trigger follows_after after insert or delete on public.follows
  for each row execute function public._follows_after();


-- registrations (trials and events)
create or replace function public._registrations_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.posts;
begin
  select * into p from public.posts where id = new.post_id;
  if p.id is null or p.kind not in ('trial','event') then
    raise exception 'You can only register for trials and events';
  end if;
  if p.event_date < current_date then raise exception 'This has already happened'; end if;
  new.status := 'interested';
  new.created_at := now();
  return new;
end $$;

create or replace function public._registrations_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set registration_count = registration_count + 1 where id = new.post_id;
    perform public._notify((select author_id from public.posts where id = new.post_id),
                           new.profile_id, 'registration', new.post_id);
  else
    update public.posts set registration_count = greatest(registration_count - 1, 0) where id = old.post_id;
    delete from public.notifications
    where type in ('registration','registration_confirmed') and post_id = old.post_id
      and (actor_id = old.profile_id or recipient_id = old.profile_id);
  end if;
  return null;
end $$;

drop trigger if exists registrations_before_insert on public.registrations;
create trigger registrations_before_insert before insert on public.registrations
  for each row execute function public._registrations_before_insert();
drop trigger if exists registrations_after on public.registrations;
create trigger registrations_after after insert or delete on public.registrations
  for each row execute function public._registrations_after();


-- ---------------------------------------------------------------------
-- RPCs called by the app
-- ---------------------------------------------------------------------

-- First-time setup. Returns {"locked": true} for under-16s (and keeps them locked).
create or replace function public.complete_onboarding(
  p_dob date, p_kind public.profile_kind, p_display_name text, p_handle text,
  p_pos text default null, p_club_name text default null, p_club_id uuid default null,
  p_grade text default null, p_region text default null, p_color text default '#2F6FED',
  p_jersey text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h public.account_holders; r public.profiles;
begin
  if uid is null then raise exception 'You need to be signed in'; end if;

  select * into h from public.account_holders where user_id = uid;
  if h.locked then return jsonb_build_object('locked', true); end if;
  if exists (select 1 from public.profiles where owner_id = uid and is_primary) then
    raise exception 'Your account is already set up';
  end if;
  if p_kind = 'rising_star' then
    raise exception 'Rising Star profiles are created by a parent or guardian';
  end if;
  if p_dob is null or p_dob > current_date or p_dob < date '1900-01-01' then
    raise exception 'Enter a valid date of birth';
  end if;

  if p_dob > (current_date - interval '16 years')::date then
    insert into public.account_holders (user_id, dob, locked) values (uid, p_dob, true)
    on conflict (user_id) do update set dob = excluded.dob, locked = true;
    return jsonb_build_object('locked', true);
  end if;

  insert into public.account_holders (user_id, dob) values (uid, p_dob)
  on conflict (user_id) do update set dob = excluded.dob;

  insert into public.profiles (owner_id, kind, is_primary, handle, display_name, pos,
                               club_name, club_id, grade, region, color, jersey)
  values (uid, p_kind, true, p_handle, p_display_name, nullif(btrim(p_pos), ''),
          nullif(btrim(p_club_name), ''), p_club_id, nullif(btrim(p_grade), ''),
          nullif(btrim(p_region), ''), coalesce(p_color, '#2F6FED'), nullif(btrim(p_jersey), ''))
  returning * into r;

  return jsonb_build_object('locked', false, 'profile', to_jsonb(r));
end $$;

-- A parent creates a Rising Star (under 16) profile they manage.
create or replace function public.create_rising_star(
  p_display_name text, p_handle text, p_dob date,
  p_pos text default null, p_club_name text default null, p_club_id uuid default null,
  p_grade text default null, p_color text default '#B4452B', p_jersey text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); parent public.profiles; r public.profiles;
begin
  if uid is null then raise exception 'You need to be signed in'; end if;
  select * into parent from public.profiles where owner_id = uid and is_primary;
  if parent.id is null or parent.kind <> 'parent' then
    raise exception 'Only parent or guardian accounts can create Rising Star profiles';
  end if;
  if p_dob is null or p_dob > (current_date - interval '5 years')::date then
    raise exception 'Enter your child''s date of birth';
  end if;
  if p_dob <= (current_date - interval '16 years')::date then
    raise exception 'Players 16 and over create their own account';
  end if;
  if (select count(*) from public.profiles where owner_id = uid and kind = 'rising_star') >= 8 then
    raise exception 'You can manage up to 8 Rising Star profiles';
  end if;

  insert into public.profiles (owner_id, kind, is_primary, handle, display_name, pos,
                               club_name, club_id, grade, color, manager_id, jersey, region)
  values (uid, 'rising_star', false, p_handle, p_display_name, nullif(btrim(p_pos), ''),
          nullif(btrim(p_club_name), ''), p_club_id, nullif(btrim(p_grade), ''),
          coalesce(p_color, '#B4452B'), parent.id, nullif(btrim(p_jersey), ''), parent.region)
  returning * into r;
  insert into public.rising_star_details (profile_id, dob) values (r.id, p_dob);
  return to_jsonb(r);
end $$;

create or replace function public.handle_available(p_handle text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where handle = lower(p_handle))
$$;

-- Parent approves (or removes) a comment on their Rising Star's post.
create or replace function public.moderate_comment(p_comment uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comments; post_author uuid;
begin
  select * into c from public.comments where id = p_comment;
  if c.id is null then raise exception 'Comment not found'; end if;
  select author_id into post_author from public.posts where id = c.post_id;
  if not public.owns_profile(post_author) and not public.is_admin() then
    raise exception 'Not allowed';
  end if;
  if p_approve then
    update public.comments set status = 'approved' where id = p_comment;
  else
    delete from public.comments where id = p_comment;
  end if;
end $$;

-- A club confirms (or declines) that a player is registered with them.
create or replace function public.respond_membership(p_player uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.profiles;
begin
  select * into pl from public.profiles where id = p_player;
  if pl.id is null or pl.club_id is null then raise exception 'Request not found'; end if;
  if not public.owns_profile(pl.club_id) then raise exception 'Not allowed'; end if;
  delete from public.notifications
  where type = 'membership_request' and recipient_id = pl.club_id and actor_id = pl.id;
  if p_accept then
    update public.profiles set club_status = 'confirmed' where id = p_player;
    perform public._notify(pl.id, pl.club_id, 'membership_confirmed');
  else
    update public.profiles set club_id = null where id = p_player;
  end if;
end $$;

-- A club confirms a spot at its trial or event.
create or replace function public.confirm_registration(p_post uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.posts;
begin
  select * into p from public.posts where id = p_post;
  if p.id is null or not public.owns_profile(p.author_id) then raise exception 'Not allowed'; end if;
  update public.registrations set status = 'confirmed'
  where post_id = p_post and profile_id = p_profile and status <> 'confirmed';
  if found then
    perform public._notify(p_profile, p.author_id, 'registration_confirmed', p_post);
  end if;
end $$;

create or replace function public.record_view(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if public.owns_profile((select author_id from public.posts where id = p_post)) then return; end if;
  insert into public.post_view_log (post_id, user_id) values (p_post, auth.uid())
  on conflict do nothing;
  if found then update public.posts set view_count = view_count + 1 where id = p_post; end if;
end $$;

create or replace function public.record_profile_view(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.owns_profile(p_profile) then return; end if;
  insert into public.profile_view_log (profile_id, user_id) values (p_profile, auth.uid())
  on conflict do nothing;
  if found then update public.profiles set profile_views = profile_views + 1 where id = p_profile; end if;
end $$;

-- Feed. Chronological, same for everyone, no paid boosts.
create or replace function public.get_feed(p_filter text default 'all', p_viewer uuid default null,
                                           p_before timestamptz default null, p_limit int default 10)
returns setof public.posts language sql stable set search_path = public as $$
  select p.* from public.posts p
  join public.profiles a on a.id = p.author_id
  where (p_before is null or p.created_at < p_before)
    and case coalesce(p_filter, 'all')
          when 'following' then exists (select 1 from public.follows f
                                        where f.follower_id = p_viewer and f.followee_id = p.author_id)
          when 'clip'      then p.kind = 'clip'
          when 'trial'     then p.kind in ('trial','event')
          when 'rising'    then a.kind = 'rising_star'
          else true
        end
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

create or replace function public.trending_clips(p_limit int default 12)
returns setof public.posts language sql stable set search_path = public as $$
  select * from public.posts
  where kind = 'clip' and created_at > now() - interval '14 days'
  order by (like_count * 3 + comment_count * 2 + view_count) desc, created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 30)
$$;

create or replace function public.upcoming_events(p_kind text default null, p_limit int default 20)
returns setof public.posts language sql stable set search_path = public as $$
  select * from public.posts
  where kind in ('trial','event')
    and (p_kind is null or kind::text = p_kind)
    and event_date >= current_date
  order by event_date asc, created_at asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

create or replace function public.players_to_watch(p_viewer uuid default null, p_limit int default 3)
returns setof public.profiles language sql stable set search_path = public as $$
  select pr.* from public.profiles pr
  where pr.kind in ('player','rising_star')
    and pr.owner_id <> auth.uid()
    and not exists (select 1 from public.follows f
                    where f.follower_id = p_viewer and f.followee_id = pr.id)
  order by pr.follower_count desc,
           (select max(created_at) from public.posts where author_id = pr.id) desc nulls last,
           pr.created_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 20)
$$;

create or replace function public.profile_summary(p_profile uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'clip_views',    coalesce((select sum(view_count) from public.posts where author_id = p_profile and kind = 'clip'), 0),
    'highlights',    (select count(*) from public.posts where author_id = p_profile and kind = 'clip'),
    'posts',         (select count(*) from public.posts where author_id = p_profile),
    'profile_views', coalesce((select profile_views from public.profiles where id = p_profile), 0),
    'trials',        (select count(*) from public.registrations where profile_id = p_profile),
    'verified_stats',(select count(*) from public.verified_stats where profile_id = p_profile)
  )
$$;

create or replace function public.unread_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications n
  join public.profiles p on p.id = n.recipient_id
  where p.owner_id = auth.uid() and not n.read
$$;

create or replace function public.mark_all_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications n set read = true
  from public.profiles p
  where p.id = n.recipient_id and p.owner_id = auth.uid() and not n.read
$$;

-- Deletes the signed-in person and everything they own. The app removes
-- their uploaded files from Storage first.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'You need to be signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Admin tools
create or replace function public.admin_set_verified(p_profile uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles set verified = p_verified where id = p_profile;
end $$;

create or replace function public.admin_resolve_report(p_report bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.reports set status = 'resolved' where id = p_report;
end $$;


-- ---------------------------------------------------------------------
-- Privileges: the API only gets what it needs
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;

revoke insert, update on public.profiles from authenticated;
grant update (display_name, handle, pos, club_name, club_id, grade, jersey, region, bio, avatar_url, color)
  on public.profiles to authenticated;

revoke insert, update on public.posts from authenticated;
grant insert (author_id, kind, caption, tags, media_path, poster_path, media_width, media_height,
              duration_s, event_date, data) on public.posts to authenticated;
grant update (caption, tags) on public.posts to authenticated;

revoke insert, update on public.comments from authenticated;
grant insert (post_id, author_id, body) on public.comments to authenticated;

revoke update on public.likes, public.follows, public.saves, public.registrations from authenticated;
revoke insert on public.registrations from authenticated;
grant insert (post_id, profile_id) on public.registrations to authenticated;

revoke insert, update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

revoke update, delete on public.reports from authenticated;
revoke insert on public.reports from authenticated;
grant insert (post_id, comment_id, profile_id, reason, details) on public.reports to authenticated;

revoke insert, update, delete on public.account_holders, public.admins, public.rising_star_details,
  public.post_view_log, public.profile_view_log from authenticated;
revoke update on public.verified_stats from authenticated;


-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.admins              enable row level security;
alter table public.account_holders     enable row level security;
alter table public.profiles            enable row level security;
alter table public.rising_star_details enable row level security;
alter table public.posts               enable row level security;
alter table public.likes               enable row level security;
alter table public.comments            enable row level security;
alter table public.follows             enable row level security;
alter table public.saves               enable row level security;
alter table public.registrations       enable row level security;
alter table public.notifications       enable row level security;
alter table public.reports             enable row level security;
alter table public.verified_stats      enable row level security;
alter table public.post_view_log       enable row level security;
alter table public.profile_view_log    enable row level security;

drop policy if exists "own admin row" on public.admins;
create policy "own admin row" on public.admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own account" on public.account_holders;
create policy "own account" on public.account_holders for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles editable by owner" on public.profiles;
create policy "profiles editable by owner" on public.profiles for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "managed profiles deletable" on public.profiles;
create policy "managed profiles deletable" on public.profiles for delete to authenticated
  using (owner_id = auth.uid() and not is_primary);

drop policy if exists "rising star details for parent" on public.rising_star_details;
create policy "rising star details for parent" on public.rising_star_details for select to authenticated
  using (public.owns_profile(profile_id));

drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select to authenticated using (true);
drop policy if exists "post as own profile" on public.posts;
create policy "post as own profile" on public.posts for insert to authenticated
  with check (public.owns_profile(author_id));
drop policy if exists "edit own posts" on public.posts;
create policy "edit own posts" on public.posts for update to authenticated
  using (public.owns_profile(author_id)) with check (public.owns_profile(author_id));
drop policy if exists "delete own posts" on public.posts;
create policy "delete own posts" on public.posts for delete to authenticated
  using (public.owns_profile(author_id) or public.is_admin());

drop policy if exists "own likes" on public.likes;
create policy "own likes" on public.likes for select to authenticated using (public.owns_profile(profile_id));
drop policy if exists "like as own profile" on public.likes;
create policy "like as own profile" on public.likes for insert to authenticated with check (public.owns_profile(profile_id));
drop policy if exists "unlike own" on public.likes;
create policy "unlike own" on public.likes for delete to authenticated using (public.owns_profile(profile_id));

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select to authenticated
  using (status = 'approved'
         or public.owns_profile(author_id)
         or exists (select 1 from public.posts p where p.id = post_id and public.owns_profile(p.author_id))
         or public.is_admin());
drop policy if exists "comment as own profile" on public.comments;
create policy "comment as own profile" on public.comments for insert to authenticated
  with check (public.owns_profile(author_id));
drop policy if exists "delete comments" on public.comments;
create policy "delete comments" on public.comments for delete to authenticated
  using (public.owns_profile(author_id)
         or exists (select 1 from public.posts p where p.id = post_id and public.owns_profile(p.author_id))
         or public.is_admin());

drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows for select to authenticated using (true);
drop policy if exists "follow as own profile" on public.follows;
create policy "follow as own profile" on public.follows for insert to authenticated with check (public.owns_profile(follower_id));
drop policy if exists "unfollow own" on public.follows;
create policy "unfollow own" on public.follows for delete to authenticated using (public.owns_profile(follower_id));

drop policy if exists "own saves" on public.saves;
create policy "own saves" on public.saves for all to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

drop policy if exists "registrations visible to registrant and host" on public.registrations;
create policy "registrations visible to registrant and host" on public.registrations for select to authenticated
  using (public.owns_profile(profile_id)
         or exists (select 1 from public.posts p where p.id = post_id and public.owns_profile(p.author_id)));
drop policy if exists "register as own profile" on public.registrations;
create policy "register as own profile" on public.registrations for insert to authenticated
  with check (public.owns_profile(profile_id));
drop policy if exists "withdraw own registration" on public.registrations;
create policy "withdraw own registration" on public.registrations for delete to authenticated
  using (public.owns_profile(profile_id));

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated
  using (public.owns_profile(recipient_id));
drop policy if exists "mark own notifications" on public.notifications;
create policy "mark own notifications" on public.notifications for update to authenticated
  using (public.owns_profile(recipient_id)) with check (public.owns_profile(recipient_id));
drop policy if exists "clear own notifications" on public.notifications;
create policy "clear own notifications" on public.notifications for delete to authenticated
  using (public.owns_profile(recipient_id));

drop policy if exists "file reports" on public.reports;
create policy "file reports" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());

drop policy if exists "stats readable" on public.verified_stats;
create policy "stats readable" on public.verified_stats for select to authenticated using (true);
drop policy if exists "admins add stats" on public.verified_stats;
create policy "admins add stats" on public.verified_stats for insert to authenticated with check (public.is_admin());
drop policy if exists "admins remove stats" on public.verified_stats;
create policy "admins remove stats" on public.verified_stats for delete to authenticated using (public.is_admin());


-- ---------------------------------------------------------------------
-- Storage: private clips, public avatars
-- Files live under a folder named after the uploader's user id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media',   'media',   false, 52428800, array['video/mp4','video/quicktime','video/webm','image/jpeg']),
  ('avatars', 'avatars', true,  5242880,  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "otb media read" on storage.objects;
create policy "otb media read" on storage.objects for select to authenticated
  using (bucket_id = 'media');
drop policy if exists "otb media upload" on storage.objects;
create policy "otb media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "otb media delete" on storage.objects;
create policy "otb media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "otb avatars read" on storage.objects;
create policy "otb avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
drop policy if exists "otb avatars upload" on storage.objects;
create policy "otb avatars upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "otb avatars update" on storage.objects;
create policy "otb avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "otb avatars delete" on storage.objects;
create policy "otb avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

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


-- ---------------------------------------------------------------------
-- Blocking (App Store guideline 1.2)
-- A person (account) blocks a profile. Both sides then stop seeing each
-- other's posts and comments, can't comment, like or follow, and get no
-- notifications from each other. Admins still see everything.
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon;
revoke insert, update on public.blocks from authenticated;
drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for select to authenticated using (user_id = auth.uid());
drop policy if exists "unblock own" on public.blocks;
create policy "unblock own" on public.blocks for delete to authenticated using (user_id = auth.uid());

-- True when the signed-in person has blocked this profile, or the profile's
-- owner has blocked one of the signed-in person's profiles.
create or replace function public.blocked_pair(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks b where b.user_id = auth.uid() and b.blocked_id = pid)
      or exists (select 1 from public.blocks b
                 join public.profiles mine on mine.id = b.blocked_id
                 where mine.owner_id = auth.uid()
                   and b.user_id = (select owner_id from public.profiles where id = pid))
$$;

-- Same check for a post's author. Runs with full visibility, because the
-- blocked person can't see the post to look up its author.
create or replace function public.post_blocked(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.blocked_pair(author_id) from public.posts where id = p_post), false)
$$;

create or replace function public.block_profile(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); target_owner uuid;
begin
  if uid is null then raise exception 'You need to be signed in'; end if;
  select owner_id into target_owner from public.profiles where id = p_profile;
  if not found then raise exception 'Profile not found'; end if;
  if target_owner = uid then raise exception 'You can''t block your own profile'; end if;
  insert into public.blocks (user_id, blocked_id) values (uid, p_profile) on conflict do nothing;
  -- drop follows both ways between this person's profiles and the blocked one
  delete from public.follows
   where (followee_id = p_profile and follower_id in (select id from public.profiles where owner_id = uid))
      or (follower_id = p_profile and followee_id in (select id from public.profiles where owner_id = uid));
end $$;

create or replace function public.unblock_profile(p_profile uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.blocks where user_id = auth.uid() and blocked_id = p_profile
$$;

-- Hide blocked content everywhere (feed, profiles, search, saved, comments)
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select to authenticated
  using (public.is_admin() or not public.blocked_pair(author_id));

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select to authenticated
  using ((status = 'approved' and (public.is_admin() or not public.blocked_pair(author_id)))
         or public.owns_profile(author_id)
         or (exists (select 1 from public.posts p where p.id = post_id and public.owns_profile(p.author_id))
             and not public.blocked_pair(author_id))
         or public.is_admin());

drop policy if exists "comment as own profile" on public.comments;
create policy "comment as own profile" on public.comments for insert to authenticated
  with check (public.owns_profile(author_id)
              and not public.post_blocked(post_id));

drop policy if exists "like as own profile" on public.likes;
create policy "like as own profile" on public.likes for insert to authenticated
  with check (public.owns_profile(profile_id)
              and not public.post_blocked(post_id));

drop policy if exists "follow as own profile" on public.follows;
create policy "follow as own profile" on public.follows for insert to authenticated
  with check (public.owns_profile(follower_id) and not public.blocked_pair(followee_id));

-- No notifications between blocked people
create or replace function public._notify(p_recipient uuid, p_actor uuid, p_type text,
                                           p_post uuid default null, p_comment uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then return; end if;
  if p_actor is not null and public.profile_owner(p_actor) = public.profile_owner(p_recipient) then
    return;
  end if;
  if p_actor is not null and exists (
       select 1 from public.blocks b
       where (b.user_id = public.profile_owner(p_recipient) and b.blocked_id = p_actor)
          or (b.user_id = public.profile_owner(p_actor) and b.blocked_id = p_recipient)) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  values (p_recipient, p_actor, p_type, p_post, p_comment);
end $$;
revoke execute on function public._notify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

-- Players to watch skips anyone blocked
create or replace function public.players_to_watch(p_viewer uuid default null, p_limit int default 3)
returns setof public.profiles language sql stable set search_path = public as $$
  select pr.* from public.profiles pr
  where pr.kind in ('player','rising_star')
    and pr.owner_id <> auth.uid()
    and not public.blocked_pair(pr.id)
    and not exists (select 1 from public.follows f
                    where f.follower_id = p_viewer and f.followee_id = pr.id)
  order by pr.follower_count desc,
           (select max(created_at) from public.posts where author_id = pr.id) desc nulls last,
           pr.created_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 20)
$$;


-- ---------------------------------------------------------------------
-- Ranked "For you" feed, player cards, official accounts
-- ---------------------------------------------------------------------

-- Official On the Burst accounts (set in the SQL editor, never by users).
-- They get the verified tick, show as "Official account" and can post events.
alter table public.profiles add column if not exists official boolean not null default false;

-- Engagement signals the ranking uses. Saves and completed watches are
-- counted by triggers/RPCs so clients can't inflate them.
alter table public.posts add column if not exists save_count int not null default 0;
alter table public.posts add column if not exists complete_count int not null default 0;
alter table public.post_view_log add column if not exists completed boolean not null default false;

create or replace function public._saves_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set save_count = save_count + 1 where id = new.post_id;
  else
    update public.posts set save_count = greatest(save_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists saves_after on public.saves;
create trigger saves_after after insert or delete on public.saves
  for each row execute function public._saves_after();
update public.posts p set save_count = (select count(*) from public.saves s where s.post_id = p.id);

-- Called when someone watches at least 90% of a clip (once per person per day).
create or replace function public.record_completion(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if public.owns_profile((select author_id from public.posts where id = p_post)) then return; end if;
  insert into public.post_view_log (post_id, user_id) values (p_post, auth.uid()) on conflict do nothing;
  update public.post_view_log set completed = true
   where post_id = p_post and user_id = auth.uid() and viewed_on = current_date and not completed;
  if found then update public.posts set complete_count = complete_count + 1 where id = p_post; end if;
end $$;

-- Official accounts can post events and trials too (e.g. the combine).
create or replace function public._posts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.profiles; uid uuid := auth.uid();
begin
  select * into a from public.profiles where id = new.author_id;
  if a.id is null then raise exception 'Unknown profile'; end if;

  if new.kind in ('trial','event') and not ((a.kind = 'club' and a.verified) or a.official or public.is_admin()) then
    raise exception 'Trials and events can only be posted by verified clubs';
  end if;
  if new.kind = 'team' and a.kind <> 'club' and not public.is_admin() then
    raise exception 'Team lists can only be posted by clubs';
  end if;
  if new.kind in ('milestone','stats') and a.kind not in ('player','rising_star') then
    raise exception 'Milestones and stats are for player profiles';
  end if;

  if new.kind = 'clip' then
    if uid is not null and split_part(new.media_path, '/', 1) <> uid::text then
      raise exception 'Invalid media path';
    end if;
    if uid is not null and new.poster_path is not null and split_part(new.poster_path, '/', 1) <> uid::text then
      raise exception 'Invalid poster path';
    end if;
  else
    new.media_path := null; new.poster_path := null; new.duration_s := null;
    new.media_width := null; new.media_height := null;
  end if;
  if new.kind not in ('trial','event') then new.event_date := null; end if;

  new.caption := btrim(new.caption);
  new.tags := public._norm_tags(new.tags);
  new.like_count := 0; new.comment_count := 0; new.view_count := 0; new.registration_count := 0;
  new.save_count := 0; new.complete_count := 0;
  new.created_at := now(); new.edited_at := null;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Feed ranking for "For you" and "Highlights".
--
-- Same rules for everyone and no paid boosts. Recent posts (last 30 days)
-- are ranked by:
--   weighted engagement   likes x1, comments x3, saves x4, full watches x2
--   engagement rate       weighted engagement per view, smoothed so a post
--                         with 2 views can't top the feed on a lucky like
--   freshness             decays with age, like Hacker News / Reddit
--   new-post boost        posts under 12h with under 30 views get a lift so
--                         every new player's clip gets a fair first look
--   relevance             people you follow, your club, your area
--   variety               each extra post from the same author in the
--                         ranking is damped, so one account can't flood it
-- Older posts follow in date order, so the feed never runs dry.
-- ---------------------------------------------------------------------
create or replace function public.get_feed(p_filter text default 'all', p_viewer uuid default null,
                                           p_before timestamptz default null, p_limit int default 10,
                                           p_offset int default 0)
returns setof public.posts language sql stable set search_path = public as $$
  with me as (
    select club_id, club_name, region from public.profiles where id = p_viewer
  ),
  base as (
    select p.*, a.kind as a_kind, a.club_id as a_club, a.club_name as a_club_name, a.region as a_region
    from public.posts p
    join public.profiles a on a.id = p.author_id
    where case coalesce(p_filter, 'all')
            when 'following' then exists (select 1 from public.follows f
                                          where f.follower_id = p_viewer and f.followee_id = p.author_id)
            when 'clip'      then p.kind = 'clip'
            when 'trial'     then p.kind in ('trial','event')
            when 'rising'    then a.kind = 'rising_star'
            else true
          end
  ),
  ranked_mode as (select coalesce(p_filter, 'all') in ('all','clip') as ranked),
  scored as (
    select b.*,
      extract(epoch from (now() - b.created_at)) / 3600.0 as age_h,
      (b.like_count + 3 * b.comment_count + 4 * b.save_count + 2 * b.complete_count) as w_eng
    from base b
  ),
  scored2 as (
    select s.*,
      ln(2 + s.w_eng)
      * least(4.0, greatest(0.25, ((s.w_eng + 1.0) / (s.view_count + 10.0)) / 0.15))
      / power(s.age_h + 2, 1.3)
      * (case when s.age_h < 12 and s.view_count < 30 then 1.6 else 1 end)
      * (1
         + case when exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = s.author_id) then 1.0 else 0 end
         + case when (select club_id from me) is not null and (s.a_club = (select club_id from me) or s.author_id = (select club_id from me)) then 0.5 else 0 end
         + case when (select region from me) is not null and s.a_region = (select region from me) then 0.25 else 0 end)
      * (case s.kind when 'clip' then 1.25
                     when 'trial' then case when s.event_date >= current_date then 1.15 else 0.6 end
                     when 'event' then case when s.event_date >= current_date then 1.15 else 0.6 end
                     else 1 end) as raw_score
    from scored s
  ),
  final as (
    select s2.*,
      case when s2.age_h <= 720 then 0 else 1 end as bucket,
      s2.raw_score * power(0.55, (row_number() over (partition by s2.author_id, (s2.age_h <= 720) order by s2.raw_score desc)) - 1) as score
    from scored2 s2
  )
  select id, author_id, kind, caption, tags, media_path, poster_path, media_width, media_height,
         duration_s, event_date, data, like_count, comment_count, view_count, registration_count,
         created_at, edited_at, save_count, complete_count
  from final
  where (select ranked from ranked_mode) or p_before is null or created_at < p_before
  order by
    case when (select ranked from ranked_mode) then bucket else 0 end,
    case when (select ranked from ranked_mode) and bucket = 0 then score end desc nulls last,
    created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
  offset case when (select ranked from ranked_mode) then greatest(coalesce(p_offset, 0), 0) else 0 end
$$;
drop function if exists public.get_feed(text, uuid, timestamptz, int);

-- Trending strip uses the same signals over two weeks.
create or replace function public.trending_clips(p_limit int default 12)
returns setof public.posts language sql stable set search_path = public as $$
  select * from public.posts
  where kind = 'clip' and created_at > now() - interval '14 days'
  order by (like_count * 3 + comment_count * 2 + save_count * 4 + complete_count * 2 + view_count) desc, created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 30)
$$;

-- ---------------------------------------------------------------------
-- Player cards: five self-reported numbers per player profile. Verified
-- combine results (verified_stats) override them on the card.
-- ---------------------------------------------------------------------
create table if not exists public.player_cards (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  bench_kg    numeric(5,1) check (bench_kg between 0 and 400),
  squat_kg    numeric(5,1) check (squat_kg between 0 and 500),
  pullups     int check (pullups between 0 and 100),
  bronco_s    numeric(5,1) check (bronco_s between 150 and 1200),
  sprint100_s numeric(4,2) check (sprint100_s between 9 and 30),
  updated_at  timestamptz not null default now()
);
alter table public.player_cards enable row level security;
revoke all on public.player_cards from anon;
drop policy if exists "cards readable" on public.player_cards;
create policy "cards readable" on public.player_cards for select to authenticated
  using (public.is_admin() or not public.blocked_pair(profile_id));
drop policy if exists "edit own card" on public.player_cards;
create policy "edit own card" on public.player_cards for all to authenticated
  using (public.owns_profile(profile_id))
  with check (public.owns_profile(profile_id)
              and (select kind from public.profiles where id = profile_id) in ('player','rising_star'));

create or replace function public._cards_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists cards_touch on public.player_cards;
create trigger cards_touch before insert or update on public.player_cards
  for each row execute function public._cards_touch();


-- ---------------------------------------------------------------------
-- Photo posts: up to 4 images on an update or milestone. Images are
-- compressed to JPEG in the browser and stored in the private media bucket.
-- ---------------------------------------------------------------------
alter table public.posts add column if not exists image_paths text[] not null default '{}';
do $$ begin
  alter table public.posts add constraint posts_image_paths_max check (cardinality(image_paths) <= 4);
exception when duplicate_object then null; end $$;
grant insert (image_paths) on public.posts to authenticated;

update storage.buckets
   set allowed_mime_types = array['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp']
 where id = 'media';

create or replace function public._posts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.profiles; uid uuid := auth.uid();
begin
  select * into a from public.profiles where id = new.author_id;
  if a.id is null then raise exception 'Unknown profile'; end if;

  if new.kind in ('trial','event') and not ((a.kind = 'club' and a.verified) or a.official or public.is_admin()) then
    raise exception 'Trials and events can only be posted by verified clubs';
  end if;
  if new.kind = 'team' and a.kind <> 'club' and not public.is_admin() then
    raise exception 'Team lists can only be posted by clubs';
  end if;
  if new.kind in ('milestone','stats') and a.kind not in ('player','rising_star') then
    raise exception 'Milestones and stats are for player profiles';
  end if;

  if new.kind = 'clip' then
    if uid is not null and split_part(new.media_path, '/', 1) <> uid::text then
      raise exception 'Invalid media path';
    end if;
    if uid is not null and new.poster_path is not null and split_part(new.poster_path, '/', 1) <> uid::text then
      raise exception 'Invalid poster path';
    end if;
  else
    new.media_path := null; new.poster_path := null; new.duration_s := null;
    new.media_width := null; new.media_height := null;
  end if;

  -- Photos: up to 4 on updates and milestones, from the uploader's own folder.
  new.image_paths := coalesce(new.image_paths, '{}');
  if new.kind not in ('text','milestone') then new.image_paths := '{}'; end if;
  if cardinality(new.image_paths) > 4 then raise exception 'Up to 4 photos per post'; end if;
  if uid is not null and exists (select 1 from unnest(new.image_paths) x where split_part(x, '/', 1) <> uid::text) then
    raise exception 'Invalid photo path';
  end if;
  if new.kind not in ('trial','event') then new.event_date := null; end if;

  new.caption := btrim(new.caption);
  new.tags := public._norm_tags(new.tags);
  new.like_count := 0; new.comment_count := 0; new.view_count := 0; new.registration_count := 0;
  new.save_count := 0; new.complete_count := 0;
  new.created_at := now(); new.edited_at := null;
  return new;
end $$;

-- Feed returns the new column too (same ranking as before).
create or replace function public.get_feed(p_filter text default 'all', p_viewer uuid default null,
                                           p_before timestamptz default null, p_limit int default 10,
                                           p_offset int default 0)
returns setof public.posts language sql stable set search_path = public as $$
  with me as (
    select club_id, club_name, region from public.profiles where id = p_viewer
  ),
  base as (
    select p.*, a.kind as a_kind, a.club_id as a_club, a.club_name as a_club_name, a.region as a_region
    from public.posts p
    join public.profiles a on a.id = p.author_id
    where case coalesce(p_filter, 'all')
            when 'following' then exists (select 1 from public.follows f
                                          where f.follower_id = p_viewer and f.followee_id = p.author_id)
            when 'clip'      then p.kind = 'clip'
            when 'trial'     then p.kind in ('trial','event')
            when 'rising'    then a.kind = 'rising_star'
            else true
          end
  ),
  ranked_mode as (select coalesce(p_filter, 'all') in ('all','clip') as ranked),
  scored as (
    select b.*,
      extract(epoch from (now() - b.created_at)) / 3600.0 as age_h,
      (b.like_count + 3 * b.comment_count + 4 * b.save_count + 2 * b.complete_count) as w_eng
    from base b
  ),
  scored2 as (
    select s.*,
      ln(2 + s.w_eng)
      * least(4.0, greatest(0.25, ((s.w_eng + 1.0) / (s.view_count + 10.0)) / 0.15))
      / power(s.age_h + 2, 1.3)
      * (case when s.age_h < 12 and s.view_count < 30 then 1.6 else 1 end)
      * (1
         + case when exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = s.author_id) then 1.0 else 0 end
         + case when (select club_id from me) is not null and (s.a_club = (select club_id from me) or s.author_id = (select club_id from me)) then 0.5 else 0 end
         + case when (select region from me) is not null and s.a_region = (select region from me) then 0.25 else 0 end)
      * (case s.kind when 'clip' then 1.25
                     when 'trial' then case when s.event_date >= current_date then 1.15 else 0.6 end
                     when 'event' then case when s.event_date >= current_date then 1.15 else 0.6 end
                     else 1 end) as raw_score
    from scored s
  ),
  final as (
    select s2.*,
      case when s2.age_h <= 720 then 0 else 1 end as bucket,
      s2.raw_score * power(0.55, (row_number() over (partition by s2.author_id, (s2.age_h <= 720) order by s2.raw_score desc)) - 1) as score
    from scored2 s2
  )
  select id, author_id, kind, caption, tags, media_path, poster_path, media_width, media_height,
         duration_s, event_date, data, like_count, comment_count, view_count, registration_count,
         created_at, edited_at, save_count, complete_count, image_paths
  from final
  where (select ranked from ranked_mode) or p_before is null or created_at < p_before
  order by
    case when (select ranked from ranked_mode) then bucket else 0 end,
    case when (select ranked from ranked_mode) and bucket = 0 then score end desc nulls last,
    created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
  offset case when (select ranked from ranked_mode) then greatest(coalesce(p_offset, 0), 0) else 0 end
$$;


-- Tell the API to pick up changes straight away.
notify pgrst, 'reload schema';
