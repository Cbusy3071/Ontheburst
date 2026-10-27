-- One-off update: ranked feed, player cards, official accounts. Paste into Supabase SQL Editor and Run.
-- Safe to run more than once. Supabase will warn about destructive operations: it replaces the old feed function and some policies; no data is removed.

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

notify pgrst, 'reload schema';
