-- Guest mode check. Paste into Supabase SQL Editor and Run after update_guest_mode.sql.
-- It acts as a signed-out visitor, changes nothing, and prints one row per check.
-- Every row should say "ok". Anything else names what to fix.

drop table if exists _guest_check;
create temp table _guest_check (n int, check_name text, result text);

do $$
declare cnt bigint;
begin
  -- Reads that must work for guests
  set local role anon;
  begin
    select count(*) into cnt from public.get_feed('all', null, null, 10, 0);
    reset role; insert into _guest_check values (1, 'feed loads (' || cnt || ' posts)', 'ok');
  exception when others then reset role; insert into _guest_check values (1, 'feed loads', 'FAILED: ' || sqlerrm); end;

  set local role anon;
  begin
    select count(*) into cnt from public.trending_clips(12);
    perform count(*) from public.upcoming_events(null, 20);
    reset role; insert into _guest_check values (2, 'trending and upcoming load', 'ok');
  exception when others then reset role; insert into _guest_check values (2, 'trending and upcoming load', 'FAILED: ' || sqlerrm); end;

  set local role anon;
  begin
    perform id, handle, display_name, kind, club_id, follower_count from public.profiles limit 5;
    reset role; insert into _guest_check values (3, 'profiles load', 'ok');
  exception when others then reset role; insert into _guest_check values (3, 'profiles load', 'FAILED: ' || sqlerrm); end;

  -- Things guests must never see
  set local role anon;
  begin
    select count(*) into cnt from public.profiles where kind = 'rising_star';
    reset role; insert into _guest_check values (4, 'Rising Star profiles hidden', case when cnt = 0 then 'ok' else 'FAILED: ' || cnt || ' visible' end);
  exception when others then reset role; insert into _guest_check values (4, 'Rising Star profiles hidden', 'FAILED: ' || sqlerrm); end;

  set local role anon;
  begin
    select count(*) into cnt from public.posts where kind = 'team' or not exists (select 1 from public.profiles a where a.id = author_id);
    reset role; insert into _guest_check values (5, 'Rising Star posts and team lists hidden', case when cnt = 0 then 'ok' else 'FAILED: ' || cnt || ' visible' end);
  exception when others then reset role; insert into _guest_check values (5, 'Rising Star posts and team lists hidden', 'FAILED: ' || sqlerrm); end;

  set local role anon;
  begin
    select count(*) into cnt from public.comments c where not exists (select 1 from public.profiles a where a.id = c.author_id);
    reset role; insert into _guest_check values (6, 'Rising Star comments hidden', case when cnt = 0 then 'ok' else 'FAILED: ' || cnt || ' visible' end);
  exception when others then reset role; insert into _guest_check values (6, 'Rising Star comments hidden', 'FAILED: ' || sqlerrm); end;

  set local role anon;
  begin
    perform owner_id from public.profiles limit 1;
    reset role; insert into _guest_check values (7, 'owner_id hidden', 'FAILED: guests can read owner_id');
  exception when insufficient_privilege then reset role; insert into _guest_check values (7, 'owner_id hidden', 'ok'); end;

  set local role anon;
  begin
    perform dob from public.account_holders limit 1;
    reset role; insert into _guest_check values (8, 'dates of birth hidden', 'FAILED: guests can read account_holders');
  exception when insufficient_privilege then reset role; insert into _guest_check values (8, 'dates of birth hidden', 'ok'); end;

  -- Writes guests must not be able to make
  set local role anon;
  begin
    insert into public.likes (post_id, profile_id) select id, author_id from public.posts limit 1;
    reset role; insert into _guest_check values (9, 'guests can''t like', 'FAILED: insert worked');
  exception when insufficient_privilege then reset role; insert into _guest_check values (9, 'guests can''t like', 'ok'); end;

  set local role anon;
  begin
    update public.posts set caption = caption where false;
    reset role; insert into _guest_check values (10, 'guests can''t edit posts', 'FAILED: update allowed');
  exception when insufficient_privilege then reset role; insert into _guest_check values (10, 'guests can''t edit posts', 'ok'); end;

  -- Clip files: a guest may sign only files of posts they can see
  set local role anon;
  begin
    select count(*) into cnt from storage.objects o
     where o.bucket_id = 'media'
       and not exists (select 1 from public.posts p
                       where p.media_path = o.name or p.poster_path = o.name or p.image_paths @> array[o.name]);
    reset role; insert into _guest_check values (11, 'clip files limited to visible posts', case when cnt = 0 then 'ok' else 'FAILED: ' || cnt || ' extra files readable' end);
  exception when others then reset role; insert into _guest_check values (11, 'clip files limited to visible posts', 'FAILED: ' || sqlerrm); end;
end $$;

select check_name, result from _guest_check order by n;
