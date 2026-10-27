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
