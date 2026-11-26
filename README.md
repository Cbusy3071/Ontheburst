# On the Burst

Rugby league highlights, trials and verified stats. Players post clips of up to a minute, clubs post trials and team lists, and selectors find talent. Players under 16 appear as Rising Stars, with profiles run by a parent who approves every comment. There's no direct messaging, by design.

It's a static web app (Vite, plain JavaScript) with Supabase handling accounts, the database, row level security and video storage.

## What's in it

- **Accounts:** sign in with Google, or email and password with email confirmation and password reset. Sign out and account deletion. Google users go through the same onboarding and date of birth check as everyone else.
- **Guest mode:** visitors can browse without an account: the feed, highlights, trials, events, search and profiles of people 16 and over. Liking, commenting, following, saving, posting and registering open a "Join On the Burst" prompt instead. Rising Stars, their posts and comments, and team lists are hidden from guests by the database, not just the UI. Guests can open 20 highlights in the viewer before they're asked to join (`GUEST_CLIP_LIMIT` in `src/guest.js`). Shared post and profile links open straight into guest mode.
- **Age check:** your date of birth is checked when you set up your account. Anyone under 16 is locked out for good (trying again with an older date doesn't work). DOBs are private.
- **Profiles:** players, parents, clubs, scouts, coaches, agents and supporters. Players get a photo, position, grade, jersey number, club, area, bio and a profile strength meter.
- **Rising Stars:** a parent creates a profile for a child under 16 and switches to act as them. Comments on a Rising Star's posts are held until the parent approves them.
- **Club confirmation:** players link their club, the club confirms them, and they get a "Registered player" badge.
- **Posts:** highlight clips (up to 60s and 50 MB, with a poster frame made in the browser and an upload progress bar), text updates, milestones and self-reported stats. Clubs can also post trials, events and team lists.
- **Club directory:** 174 clubs listed in advance (all 17 NRL clubs, Sydney senior clubs, and junior clubs across 11 Sydney districts plus Group 6). Players can link their club before it joins. Every club shows a "Not partnered yet" badge until an admin switches on Partnered. Club officials claim their page, and an admin approves the claim before the page is handed over.
- **Club verification:** trials and events need a verified club, so nobody can advertise fake trials to young players.
- **Feed:** "For you" and "Highlights" are ranked by engagement (see below). The Following, Trials and Rising Stars tabs are chronological. There are no paid boosts. Clips autoplay muted and the full-screen vertical viewer comes from the prototype.
- **Player card:** a FIFA-style card on every player profile, built from bench press 1RM, max squat, max pull-ups, Bronco and 100m sprint. Ratings are relative to the player's position and age group, the overall is weighted by position, and combine-verified results override self-reported ones.
- **Official accounts:** On the Burst and On the Burst News are verified, show the logo, and can post events. Set them up with `supabase/setup_official_accounts.sql`.
- **Interactions:** likes, comments, follows, saves, sharing, registering for trials, and clubs confirming spots.
- **Alerts:** likes, comments, follows, registrations, comments waiting for approval and club requests, with inline Approve and Confirm buttons.
- **Search:** people, clubs and #hashtags.
- **Blocking:** block anyone from a post, comment or profile. Both sides stop seeing each other's posts and comments, follows between them are removed, and neither can like, comment or follow. Unblock from the profile or from Settings. App Store guideline 1.2 requires this.
- **Safety and admin:** reports on posts and profiles. The admin page shows open reports, clubs waiting on verification and a form for verified combine stats.
- **Privacy:** signed-out visitors only see what guest mode allows (see `supabase/update_guest_mode.sql`): never Rising Stars, team lists, owner ids, emails or dates of birth. Clips sit in a private bucket and are shown through signed URLs, and guests can only sign URLs for clips on posts they can see.

## Set up (about 15 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a project and pick the Sydney region.
2. Open **SQL Editor > New query**, paste all of `supabase/schema.sql` and click **Run**. Then do the same with `supabase/seed_clubs.sql` to load the club directory. This creates the tables, security rules, triggers and the two storage buckets (`media` for clips, which is private, and `avatars`, which is public). You can run it again safely after editing.
3. Go to **Authentication > URL Configuration**:
   - **Site URL:** where the app will live, for example `https://ontheburst.com` or `https://cbusy3071.github.io/Ontheburst/`.
   - **Redirect URLs:** add the same URL plus `http://localhost:5173/` for local development.
4. Go to **Authentication > Sign In / Providers > Email** and leave "Confirm email" on.
5. Turn on Google sign-in (optional, about 10 minutes):
   1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, then go to **APIs & Services > OAuth consent screen**. Choose **External**, set the app name to On the Burst, add your support email, the `ontheburst.com` domain, and links to `privacy.html` and `terms.html`. The scopes you need are `openid`, `email` and `profile`. Publish the app when you're ready for real users; in Testing mode only the test users you list can sign in.
   2. Go to **APIs & Services > Credentials > Create credentials > OAuth client ID**, choose **Web application**, and add this under **Authorised redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows the exact URL on its Google provider page).
   3. In Supabase, go to **Authentication > Sign In / Providers > Google**, switch it on, and paste the Client ID and Client Secret.
   4. Check the Site URL and Redirect URLs from step 3 include the address the app runs at. Google sign-in comes back to the same address.
   5. The Google buttons stay hidden until Supabase reports the Google provider as on, then appear by themselves. No redeploy needed.
6. Make yourself an admin. Sign up in the app first, then run this in the SQL editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'callumbushbrady@gmail.com';
   ```

### Updating an existing project

If your Supabase project was set up before guest mode, run `supabase/update_guest_mode.sql` in the SQL editor, then run `supabase/guest_mode_check.sql`. The check acts as a signed-out visitor, changes nothing, and prints one row per check. Every row should say `ok`.

### 2. Run it locally

```bash
npm install
cp .env.example .env.local    # then paste your project URL and anon key
npm run dev                   # http://localhost:5173
```

You'll find both values in Supabase under **Project Settings > API**. The anon key is safe to ship in the front end because row level security decides what it can do.

### 3. Deploy

**GitHub Pages:** the workflow in `.github/workflows/deploy.yml` builds and deploys on every push to `main`.
1. Go to repo **Settings > Pages > Source** and choose **GitHub Actions**.
2. Go to repo **Settings > Secrets and variables > Actions > Variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Push, or run the workflow by hand from the Actions tab.

**Vercel or Netlify (also fine):** import the repo with build command `npm run build` and output folder `dist`, then add the same two environment variables. No rewrites are needed because the app uses `#/` routes.

**Custom domain:** once you own `ontheburst.com`, point it at whichever host you use, then update the Site URL and Redirect URLs in Supabase.

## How the feed ranks posts

The "For you" and "Highlights" tabs use the same rules for everyone (`get_feed` in `schema.sql`). Posts from the last 30 days are ranked first:

- **Weighted engagement:** likes x1, comments x3, saves x4, full watches x2. A full watch means 90% of a clip in the viewer.
- **Engagement rate:** engagement per view, smoothed so a post with two views can't top the feed off one lucky like.
- **Freshness:** scores decay with age, as on Hacker News and Reddit.
- **New-post boost:** posts under 12 hours old with fewer than 30 views get a lift, so every new player's clip gets a fair first look.
- **Relevance:** a lift for people you follow, your club and your area.
- **Variety:** each extra post from the same author is damped, so one account can't flood the top.

Older posts follow in date order. TikTok and Instagram use machine-learned models trained on billions of interactions. At this scale a transparent formula works better, and every weight is a number in `get_feed` you can change.

## Daily news agent

`scripts/post-news.mjs` posts as On the Burst News. It refuses posts without a source link, repeats of a link it has already posted, and more than 3 posts a day. The agent needs network access to your Supabase project, so run it on your own computer or in GitHub Actions. Claude's cloud sandbox blocks outside sites.

## Managing clubs

Go to **Admin > Club directory** to search any club and switch Partnered on or off. You can also add clubs that are missing. Claims from club officials show under **Club claims** with their email. Approving a claim hands the page to that person and verifies the club. The same controls are in the menu on each club's profile.

The directory was built from the NRL clubs' junior league pages and Wikipedia in October 2026. Junior clubs merge and fold, so expect to correct a few.

## Before real users arrive

- **Email delivery:** Supabase's built-in email is rate limited to a few messages an hour and is meant for testing. Set up custom SMTP (Resend, Postmark or similar) under **Authentication > Emails > SMTP Settings** before launch, or sign-up confirmations will stall.
- **Privacy policy and terms:** the app collects data from minors (through their parents), so you need a privacy policy that meets the Australian Privacy Principles, plus terms of use, before launch. Get these written properly. The in-app community guidelines are a starting point, not a substitute.
- **Storage costs:** clips are stored as uploaded with no transcoding. Supabase's free plan includes 1 GB of storage and its egress is metered. When video volume grows, move clips to Cloudflare Stream or R2. Only the upload in `src/media.js` and `mediaUrl()` need to change.
- **iPhone video:** HEVC `.mov` files from iPhones don't play in every browser. The upload hint suggests setting the camera to Most Compatible. Transcoding (Cloudflare Stream does this) fixes it properly.
- **Turning 16:** Rising Star profiles stay managed by the parent after the child turns 16. Handing a profile over to the player is a later feature.

## Project layout

```
index.html             app shell (top bar, layout, viewer)
src/main.js            boot, auth state, onboarding gate, guest mode, hash router
src/guest.js           guest mode: join prompts, guarded actions, the free-highlights limit
src/api.js             every Supabase query in one place
src/media.js           signed URLs, uploads with progress, poster frames, avatars
src/posts.js           post cards (the prototype's renderers on real data)
src/viewer.js          full-screen vertical highlights viewer
src/composer.js        create-a-post modal for each post type
src/comments.js        inline and bottom-sheet comments, parent approval
src/actions.js         like, save, follow, share, register, report, menus, autoplay
src/shell.js           left profile card, right rail, nav, Me menu
src/views/*.js         auth, onboarding, feed, profile, settings, alerts, admin, pages
src/styles.css         the prototype's design system plus the app screens
supabase/schema.sql    tables, RLS policies, triggers, RPCs, storage buckets
supabase/update_guest_mode.sql   guest mode for an existing project (guest_mode_check.sql verifies it)
```

## How it was tested

- The database rules were run against PostgreSQL 16 with Supabase's auth and storage stubbed. 106 scenarios covered the age lockout, parent approval, club confirmation, attempts to fake counters or post as someone else, storage folder rules and account deletion.
- The app was driven end to end in headless Chromium against a local Supabase stand-in on the same database. The run covered sign up, onboarding, clip upload and playback, trials, Rising Stars, approvals, the viewer, search, admin, the under-16 lockout, mobile layout and account deletion.
- Guest mode was tested against the same schema with every query run as the `anon` role: 11 database checks (`guest_mode_check.sql`) and 46 browser checks covering the feed, viewer, profiles, search, trials, every guarded action, the highlights limit, shared links and the Google redirect.
- **Not yet tested on hosted Supabase.** The Google round trip (consent screen and coming back signed in) needs your real Google and Supabase settings, so test that once they're set up. Test the sign-up email link and password reset once your project is live, because those are the parts a local stand-in can't cover.
