-- One-off update: guest mode. Paste into Supabase SQL Editor and Run.
-- Safe to run more than once. Then run supabase/guest_mode_check.sql to confirm it worked.

-- ---------------------------------------------------------------------
-- Guest mode
-- Signed-out visitors can browse a read-only slice of the app: the feed,
-- highlights, trials, events, search and profiles of people 16 and over.
--   * Rising Stars (under 16), their posts, clips, cards and comments are
--     never visible to guests.
--   * Team list posts are hidden from guests, because junior team lists
--     name players under 16.
--   * Guests only ever get SELECT. They can't like, comment, follow, post,
--     register or report, because anon has no insert/update/delete grants.
--   * owner_id (the account behind a profile) is never readable by guests,
--     so nobody can link a parent's profile to their children's.
-- ---------------------------------------------------------------------

-- True when a profile exists and isn't a Rising Star. Security definer so the
-- policies below can call it without guests needing more of profiles.
create or replace function public.guest_visible(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = pid and kind <> 'rising_star')
$$;

-- True when a stored clip, poster or photo belongs to a post guests can see.
create or replace function public.guest_media_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    join public.profiles a on a.id = p.author_id
    where a.kind <> 'rising_star' and p.kind <> 'team'
      and (p.media_path = p_name or p.poster_path = p_name or p.image_paths @> array[p_name])
  )
$$;
revoke execute on function public.guest_visible(uuid) from public;
revoke execute on function public.guest_media_visible(text) from public;
grant execute on function public.guest_visible(uuid) to anon, authenticated;
grant execute on function public.guest_media_visible(text) to anon, authenticated;

-- Lookups the storage policy makes for every signed clip URL.
create index if not exists posts_media_path_idx  on public.posts(media_path) where media_path is not null;
create index if not exists posts_poster_path_idx on public.posts(poster_path) where poster_path is not null;
create index if not exists posts_image_paths_idx on public.posts using gin(image_paths);

-- Profiles: only the public columns, and never Rising Stars.
grant select (id, kind, is_primary, handle, display_name, pos, club_name, club_id, club_status,
              manager_id, grade, jersey, region, bio, avatar_url, color, verified, partnered,
              club_tier, official, follower_count, following_count, profile_views, created_at)
  on public.profiles to anon;
do $$ begin
  -- is_claimed exists on the live project but isn't in schema.sql; share it if it's a column.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_claimed') then
    execute 'grant select (is_claimed) on public.profiles to anon';
  end if;
end $$;
drop policy if exists "guests read profiles" on public.profiles;
create policy "guests read profiles" on public.profiles for select to anon
  using (kind <> 'rising_star');

-- Posts
grant select on public.posts to anon;
drop policy if exists "guests read posts" on public.posts;
create policy "guests read posts" on public.posts for select to anon
  using (kind <> 'team' and public.guest_visible(author_id));

-- Comments: approved ones, not by Rising Stars, on posts guests can see.
grant select on public.comments to anon;
drop policy if exists "guests read comments" on public.comments;
create policy "guests read comments" on public.comments for select to anon
  using (status = 'approved' and public.guest_visible(author_id)
         and exists (select 1 from public.posts p where p.id = post_id));

-- Player cards and verified stats for 16+ players.
grant select on public.player_cards to anon;
drop policy if exists "guests read cards" on public.player_cards;
create policy "guests read cards" on public.player_cards for select to anon
  using (public.guest_visible(profile_id));

grant select on public.verified_stats to anon;
drop policy if exists "guests read stats" on public.verified_stats;
create policy "guests read stats" on public.verified_stats for select to anon
  using (public.guest_visible(profile_id));

-- The feed function reads follows to rank posts. Guests get the grant so the
-- query runs, but no policy, so they see no follow rows at all.
grant select on public.follows to anon;

-- The read-only functions guests use (every overload, whatever the signature).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('get_feed', 'trending_clips', 'upcoming_events', 'profile_summary')
  loop
    execute format('grant execute on function %s to anon', f.sig);
  end loop;
end $$;

-- Clips are in a private bucket. Guests can get signed URLs only for files
-- that belong to a post they can see.
drop policy if exists "otb media guest read" on storage.objects;
create policy "otb media guest read" on storage.objects for select to anon
  using (bucket_id = 'media' and public.guest_media_visible(name));

notify pgrst, 'reload schema';
