// Every call to Supabase lives here, so the views stay about the UI.
import { sb } from './supabase.js';
import { S } from './state.js';
import { signPosts } from './media.js';

export const PROFILE_COLS = 'id,owner_id,kind,is_primary,handle,display_name,pos,club_name,club_id,club_status,manager_id,grade,jersey,region,bio,avatar_url,color,verified,partnered,club_tier,follower_count,following_count,profile_views,created_at';
export const AUTHOR_COLS = 'id,owner_id,kind,handle,display_name,pos,club_name,club_status,grade,jersey,region,avatar_url,color,verified,partnered,club_tier,manager_id';
// manager() and club() are computed relationships defined in schema.sql
const MANAGER = 'manager(display_name,handle)';
export const POST_SEL = '*,author:profiles!posts_author_id_fkey(' + AUTHOR_COLS + ',' + MANAGER + ')';
const COMMENT_SEL = 'id,post_id,author_id,body,status,created_at,author:profiles!comments_author_id_fkey(' + AUTHOR_COLS + ')';

function check({ data, error }) {
  if (error) throw error;
  return data;
}
const me = () => S.me && S.me.id;

/* ---------- account ---------- */
export async function loadAccount() {
  const uid = S.user.id;
  const [holder, profiles, admin, claim] = await Promise.all([
    sb.from('account_holders').select('locked,dob').eq('user_id', uid).maybeSingle(),
    sb.from('profiles').select(PROFILE_COLS + ',' + MANAGER).eq('owner_id', uid).order('is_primary', { ascending: false }).order('created_at'),
    sb.rpc('is_admin'),
    sb.from('club_claims').select('id,status,created_at,club:profiles!club_claims_club_id_fkey(id,display_name,handle)').eq('user_id', uid).order('created_at', { ascending: false }).limit(1),
  ]);
  S.holder = check(holder);
  S.profiles = check(profiles) || [];
  S.isAdmin = !admin.error && admin.data === true;
  S.claim = (claim.data && claim.data[0]) || null;
}
export async function ownProfiles() {
  return check(await sb.from('profiles').select(PROFILE_COLS + ',' + MANAGER).eq('owner_id', S.user.id));
}
export const completeOnboarding = (args) => sb.rpc('complete_onboarding', args).then(check);
export const createRisingStar = (args) => sb.rpc('create_rising_star', args).then(check);
export const handleAvailable = (h) => sb.rpc('handle_available', { p_handle: h }).then(check);
export async function updateProfile(id, patch) {
  return check(await sb.from('profiles').update(patch).eq('id', id).select(PROFILE_COLS + ',' + MANAGER).single());
}
export const deleteProfile = async (id) => check(await sb.from('profiles').delete().eq('id', id));
export const risingStarDob = async (id) => (check(await sb.from('rising_star_details').select('dob').eq('profile_id', id).maybeSingle()) || {}).dob;
export async function loadFollowing() {
  if (!me()) return;
  const rows = check(await sb.from('follows').select('followee_id').eq('follower_id', me()).limit(5000));
  S.following = new Set(rows.map((r) => r.followee_id));
}

/* ---------- profiles ---------- */
export async function profileByHandle(handle) {
  return check(await sb.from('profiles')
    .select(PROFILE_COLS + ',' + MANAGER + ',club(handle,verified)')
    .eq('handle', String(handle).toLowerCase()).maybeSingle());
}
export const profileSummary = (id) => sb.rpc('profile_summary', { p_profile: id }).then(check);
export const recordProfileView = (id) => sb.rpc('record_profile_view', { p_profile: id });
export const verifiedStats = async (id) => check(await sb.from('verified_stats').select('*').eq('profile_id', id).order('recorded_on', { ascending: false }));
export async function playersToWatch() {
  return check(await sb.rpc('players_to_watch', { p_viewer: me(), p_limit: 3 }).select(AUTHOR_COLS));
}
const clean = (t) => String(t || '').replace(/[%_,()*\\:."']/g, ' ').trim().slice(0, 40);
export async function searchProfiles(term, limit = 20) {
  const t = clean(term);
  if (!t) return [];
  return check(await sb.from('profiles').select(AUTHOR_COLS + ',follower_count')
    .or('display_name.ilike.*' + t + '*,handle.ilike.*' + t + '*,club_name.ilike.*' + t + '*')
    .order('follower_count', { ascending: false }).limit(limit));
}
const CLUB_COLS = 'id,owner_id,handle,display_name,region,verified,partnered,club_tier,avatar_url,color,kind,follower_count';
export async function searchClubs(term, { limit = 8, unclaimedOnly = false } = {}) {
  const t = clean(term);
  let q = sb.from('profiles').select(CLUB_COLS).eq('kind', 'club');
  if (t) q = q.ilike('display_name', '%' + t + '%');
  if (unclaimedOnly) q = q.is('owner_id', null);
  return check(await q.order('verified', { ascending: false }).order('display_name').limit(limit));
}
export const claimClub = (args) => sb.rpc('claim_club', args).then(check);
export const cancelClaim = async (id) => check(await sb.from('club_claims').delete().eq('id', id));
export const adminClaims = () => sb.rpc('admin_claims').then(check);
export const reviewClaim = (id, approve) => sb.rpc('admin_review_claim', { p_claim: id, p_approve: approve }).then(check);
export const setPartnered = (id, v) => sb.rpc('admin_set_partnered', { p_profile: id, p_partnered: v }).then(check);
export const addClub = (args) => sb.rpc('admin_add_club', args).then(check);

/* ---------- posts ---------- */
// Adds liked/saved/registered flags for the acting profile, signs clip URLs,
// and stores each post in S.posts so every copy on screen stays in sync.
export async function hydrate(posts) {
  posts = (posts || []).filter((p) => p && p.author);
  if (!posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const eventIds = posts.filter((p) => p.kind === 'trial' || p.kind === 'event').map((p) => p.id);
  const [likes, saves, regs] = await Promise.all([
    sb.from('likes').select('post_id').eq('profile_id', me()).in('post_id', ids),
    sb.from('saves').select('post_id').eq('profile_id', me()).in('post_id', ids),
    eventIds.length ? sb.from('registrations').select('post_id,status').eq('profile_id', me()).in('post_id', eventIds) : Promise.resolve({ data: [] }),
    signPosts(posts),
  ]);
  const L = new Set((likes.data || []).map((r) => r.post_id));
  const V = new Set((saves.data || []).map((r) => r.post_id));
  const R = new Map((regs.data || []).map((r) => [r.post_id, r.status]));
  return posts.map((p) => {
    p.liked = L.has(p.id);
    p.saved = V.has(p.id);
    p.reg = R.get(p.id) || null;
    S.posts.set(p.id, p);
    return p;
  });
}
export async function feed(filter, before) {
  const rows = check(await sb.rpc('get_feed', { p_filter: filter, p_viewer: me(), p_before: before || null, p_limit: 10 }).select(POST_SEL));
  return hydrate(rows);
}
export async function trending() {
  return hydrate(check(await sb.rpc('trending_clips', { p_limit: 12 }).select(POST_SEL)));
}
export async function upcoming(kind, limit = 20) {
  return hydrate(check(await sb.rpc('upcoming_events', { p_kind: kind || null, p_limit: limit }).select(POST_SEL)));
}
export async function upcomingLite(limit = 3) {
  return check(await sb.rpc('upcoming_events', { p_kind: null, p_limit: limit }).select('id,kind,event_date,data,author:profiles!posts_author_id_fkey(display_name)'));
}
export async function profilePosts(authorId, { before, clipsOnly, limit = 10 } = {}) {
  let q = sb.from('posts').select(POST_SEL).eq('author_id', authorId);
  if (clipsOnly) q = q.eq('kind', 'clip');
  if (before) q = q.lt('created_at', before);
  return hydrate(check(await q.order('created_at', { ascending: false }).limit(limit)));
}
export async function getPost(id) {
  const p = check(await sb.from('posts').select(POST_SEL).eq('id', id).maybeSingle());
  return p ? (await hydrate([p]))[0] : null;
}
export async function searchPosts(term) {
  let q = sb.from('posts').select(POST_SEL);
  const t = String(term || '').trim();
  if (t.startsWith('#')) {
    const tag = t.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!tag) return [];
    q = q.contains('tags', [tag]);
  } else {
    const c = clean(t);
    if (!c) return [];
    q = q.ilike('caption', '%' + c + '%');
  }
  return hydrate(check(await q.order('created_at', { ascending: false }).limit(20)));
}
export async function savedPosts() {
  const rows = check(await sb.from('saves').select('created_at,post:posts!saves_post_id_fkey(' + POST_SEL + ')').eq('profile_id', me()).order('created_at', { ascending: false }).limit(40));
  return hydrate(rows.map((r) => r.post));
}
export async function createPost(row) {
  const p = check(await sb.from('posts').insert(row).select(POST_SEL).single());
  return (await hydrate([p]))[0];
}
export async function updateCaption(id, caption, tags) {
  return check(await sb.from('posts').update({ caption, tags }).eq('id', id).select('caption,tags,edited_at').single());
}
export const deletePost = async (id) => check(await sb.from('posts').delete().eq('id', id));
export const recordView = (id) => sb.rpc('record_view', { p_post: id });

/* ---------- interactions ---------- */
const ignoreDup = ({ error }) => { if (error && error.code !== '23505') throw error; };
export const like = async (postId) => ignoreDup(await sb.from('likes').insert({ post_id: postId, profile_id: me() }));
export const unlike = async (postId) => check(await sb.from('likes').delete().eq('post_id', postId).eq('profile_id', me()));
export const save = async (postId) => ignoreDup(await sb.from('saves').insert({ post_id: postId, profile_id: me() }));
export const unsave = async (postId) => check(await sb.from('saves').delete().eq('post_id', postId).eq('profile_id', me()));
export const follow = async (id) => ignoreDup(await sb.from('follows').insert({ follower_id: me(), followee_id: id }));
export const unfollow = async (id) => check(await sb.from('follows').delete().eq('follower_id', me()).eq('followee_id', id));
export const register = async (postId) => ignoreDup(await sb.from('registrations').insert({ post_id: postId, profile_id: me() }));
export const unregister = async (postId) => check(await sb.from('registrations').delete().eq('post_id', postId).eq('profile_id', me()));
export async function registrationsFor(postId) {
  return check(await sb.from('registrations').select('profile_id,status,created_at,profile:profiles!registrations_profile_id_fkey(' + AUTHOR_COLS + ')').eq('post_id', postId).order('created_at'));
}
export const confirmRegistration = (postId, profileId) => sb.rpc('confirm_registration', { p_post: postId, p_profile: profileId }).then(check);
export async function myRegistrations() {
  return check(await sb.from('registrations').select('status,created_at,post:posts!registrations_post_id_fkey(id,kind,event_date,data,author:profiles!posts_author_id_fkey(display_name,handle))').eq('profile_id', me()).order('created_at', { ascending: false }).limit(30));
}

/* ---------- comments ---------- */
export const comments = async (postId) => check(await sb.from('comments').select(COMMENT_SEL).eq('post_id', postId).order('created_at').limit(200));
export const addComment = async (postId, body) => check(await sb.from('comments').insert({ post_id: postId, author_id: me(), body }).select(COMMENT_SEL).single());
export const deleteComment = async (id) => check(await sb.from('comments').delete().eq('id', id));
export const moderateComment = (id, approve) => sb.rpc('moderate_comment', { p_comment: id, p_approve: approve }).then(check);

/* ---------- notifications ---------- */
export async function notifications() {
  return check(await sb.from('notifications').select(
    'id,type,read,created_at,recipient_id,post_id,comment_id,' +
    'actor:profiles!notifications_actor_id_fkey(' + AUTHOR_COLS + '),' +
    'recipient:profiles!notifications_recipient_id_fkey(id,display_name,handle,is_primary,kind),' +
    'post:posts!notifications_post_id_fkey(id,kind,caption,data),' +
    'comment:comments!notifications_comment_id_fkey(id,body,status)'
  ).order('created_at', { ascending: false }).limit(60));
}
export const unreadCount = () => sb.rpc('unread_count').then(check);
export const markAllRead = () => sb.rpc('mark_all_read').then(check);
export const respondMembership = (playerId, accept) => sb.rpc('respond_membership', { p_player: playerId, p_accept: accept }).then(check);
export async function pendingMembers(clubId) {
  return check(await sb.from('profiles').select(AUTHOR_COLS).eq('club_id', clubId).eq('club_status', 'pending').order('updated_at', { ascending: false }).limit(100));
}

/* ---------- reports & admin ---------- */
export const report = async (row) => check(await sb.from('reports').insert(row));
export async function openReports() {
  return check(await sb.from('reports').select(
    'id,reason,details,status,created_at,post_id,comment_id,profile_id,' +
    'post:posts!reports_post_id_fkey(id,caption,kind,author:profiles!posts_author_id_fkey(handle,display_name)),' +
    'profile:profiles!reports_profile_id_fkey(handle,display_name),' +
    'comment:comments!reports_comment_id_fkey(id,body,post_id)'
  ).eq('status', 'open').order('created_at', { ascending: false }).limit(100));
}
export const resolveReport = (id) => sb.rpc('admin_resolve_report', { p_report: id }).then(check);
export const setVerified = (id, v) => sb.rpc('admin_set_verified', { p_profile: id, p_verified: v }).then(check);
export const addVerifiedStat = async (row) => check(await sb.from('verified_stats').insert(row));
export const deleteVerifiedStat = async (id) => check(await sb.from('verified_stats').delete().eq('id', id));
export async function unverifiedClubs() {
  return check(await sb.from('profiles').select(AUTHOR_COLS + ',created_at').eq('kind', 'club').eq('verified', false).not('owner_id', 'is', null).order('created_at', { ascending: false }).limit(50));
}

/* ---------- account deletion ---------- */
export const deleteMyAccount = () => sb.rpc('delete_my_account').then(check);
