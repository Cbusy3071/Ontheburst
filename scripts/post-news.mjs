#!/usr/bin/env node
// Posts to On the Burst as the On the Burst News account.
// Used by the daily news agent. Needs Node 18+ and these environment variables:
//   SUPABASE_URL           https://xxxx.supabase.co
//   SUPABASE_KEY           the publishable (anon) key, never the secret key
//   NEWS_EMAIL             news@ontheburst.com
//   NEWS_PASSWORD          that account's password
//
//   node scripts/post-news.mjs recent          print the last 30 news posts (to avoid repeats)
//   node scripts/post-news.mjs post "caption"  publish a text post (max 600 chars, must include a link)

const { SUPABASE_URL, SUPABASE_KEY, NEWS_EMAIL, NEWS_PASSWORD } = process.env;
const HANDLE = 'ontheburst_news';
const MAX_POSTS_PER_DAY = 3;

function die(msg) { console.error('Error: ' + msg); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY || !NEWS_EMAIL || !NEWS_PASSWORD) die('set SUPABASE_URL, SUPABASE_KEY, NEWS_EMAIL and NEWS_PASSWORD');

async function call(path, opts = {}, token) {
  const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + path, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || SUPABASE_KEY), ...(opts.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) die((body && (body.msg || body.message || body.error_description)) || res.status + ' ' + res.statusText);
  return body;
}

async function session() {
  const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: NEWS_EMAIL, password: NEWS_PASSWORD }) });
  const prof = await call('/rest/v1/profiles?select=id,display_name&handle=eq.' + HANDLE, {}, s.access_token);
  if (!prof.length) die('no profile @' + HANDLE + '; run supabase/setup_official_accounts.sql');
  return { token: s.access_token, id: prof[0].id };
}

async function recent({ token, id }) {
  return call('/rest/v1/posts?select=caption,created_at&author_id=eq.' + id + '&order=created_at.desc&limit=30', {}, token);
}

const [cmd, ...rest] = process.argv.slice(2);
const me = await session();
if (cmd === 'recent') {
  const rows = await recent(me);
  if (!rows.length) console.log('(no posts yet)');
  rows.forEach((r) => console.log(r.created_at.slice(0, 16).replace('T', ' ') + '  ' + r.caption.replace(/\s+/g, ' ')));
} else if (cmd === 'post') {
  const caption = rest.join(' ').trim();
  if (!caption) die('nothing to post');
  if (caption.length > 600) die('caption is ' + caption.length + ' characters; keep it under 600');
  if (!/https?:\/\//.test(caption)) die('include a link to the original story');
  const rows = await recent(me);
  const today = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 20 * 3600 * 1000);
  if (today.length >= MAX_POSTS_PER_DAY) die('already posted ' + today.length + ' times today; limit is ' + MAX_POSTS_PER_DAY);
  const url = caption.match(/https?:\/\/\S+/)[0];
  if (rows.some((r) => r.caption.includes(url))) die('this link was already posted');
  const tags = Array.from(new Set((caption.match(/#([A-Za-z0-9_]{1,30})/g) || []).map((t) => t.slice(1).toLowerCase()))).slice(0, 10);
  await call('/rest/v1/posts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ author_id: me.id, kind: 'text', caption, tags }) }, me.token);
  console.log('Posted: ' + caption);
} else {
  die('usage: post-news.mjs recent | post "caption"');
}
