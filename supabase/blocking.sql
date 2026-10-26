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
