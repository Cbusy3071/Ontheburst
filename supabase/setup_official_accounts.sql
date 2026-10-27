-- Turns two existing logins into the official On the Burst accounts.
--
-- First create both logins in Supabase: Authentication > Users > Add user >
-- Create new user. Enter the email and a strong password, and tick
-- "Auto Confirm User". Then change the two emails below if yours differ and
-- run this whole file in the SQL Editor. Safe to run again.
do $$
declare
  official_email text := 'official@ontheburst.com';
  news_email     text := 'news@ontheburst.com';
  u uuid;
begin
  -- On the Burst (clips and announcements)
  select id into u from auth.users where email = official_email;
  if u is null then raise exception 'No login found for %. Create it under Authentication > Users first.', official_email; end if;
  insert into public.account_holders (user_id, dob) values (u, '2000-01-01') on conflict (user_id) do nothing;
  insert into public.profiles (owner_id, kind, is_primary, handle, display_name, bio, region, color, verified, official)
  values (u, 'fan', true, 'ontheburst', 'On the Burst',
          'Official account. Highlights, announcements and combine news.', 'Sydney', '#0D2B20', true, true)
  on conflict (handle) do update set owner_id = excluded.owner_id, verified = true, official = true;

  -- On the Burst News (posted by the daily news agent)
  select id into u from auth.users where email = news_email;
  if u is null then raise exception 'No login found for %. Create it under Authentication > Users first.', news_email; end if;
  insert into public.account_holders (user_id, dob) values (u, '2000-01-01') on conflict (user_id) do nothing;
  insert into public.profiles (owner_id, kind, is_primary, handle, display_name, bio, region, color, verified, official)
  values (u, 'fan', true, 'ontheburst_news', 'On the Burst News',
          'Daily rugby league news in brief, with links to the full stories.', 'Sydney', '#0D2B20', true, true)
  on conflict (handle) do update set owner_id = excluded.owner_id, verified = true, official = true;
end $$;

select handle, display_name, verified, official from public.profiles where official;
