// Boot: auth state, onboarding, the shell and a tiny hash router.
import './styles.css';
import { sb, configured } from './supabase.js';
import { S, primary, rememberActing, recallActing } from './state.js';
import * as api from './api.js';
import { $, toast, errMsg, closeMenu, openModal } from './ui.js';
import { showSignIn, showNewPassword, showSetup } from './views/auth.js';
import { showOnboarding, showLockout, showAddChild } from './views/onboarding.js';
import { renderLeft, renderRight, renderNav, renderPip, setActiveNav, meMenu } from './shell.js';
import { openComposer } from './composer.js';
import { closeViewer } from './viewer.js';
import './actions.js';
import feedView from './views/feed.js';
import profileView from './views/profile.js';
import settingsView from './views/settings.js';
import alertsView from './views/alerts.js';
import adminView from './views/admin.js';
import { listingView, searchView, savedView, postView, guidelinesView, GUIDELINES } from './views/pages.js';

let started = false, recovery = false, enteredUser = null, routeTok = 0, cleanup = null, railsAt = 0;
function refreshRails() {
  railsAt = Date.now();
  renderRight();
  // Merge in changes others made to our profiles (club confirmed you, admin verified you).
  api.ownProfiles().then((fresh) => {
    fresh.forEach((f) => { const cur = S.profiles.find((x) => x.id === f.id); if (cur) Object.assign(cur, f); });
    renderNav();
  }).catch(() => {}).finally(renderLeft);
}
document.addEventListener('otb:posted', () => setTimeout(refreshRails, 300));
const url = new URL(location.href);
const urlError = url.searchParams.get('error_description') || new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description');
const hadCode = url.searchParams.has('code');

function cleanUrl() {
  const h = location.hash;
  const keepHash = h.startsWith('#/') ? h : '';
  if (location.search || (h && !keepHash)) history.replaceState(null, '', location.pathname + keepHash);
}

function loading() {
  document.body.classList.add('full');
  $('#full').innerHTML = '<div style="min-height:100vh;display:grid;place-items:center"><div class="spin"></div></div>';
}

/* ---------- auth lifecycle ---------- */
async function handleAuth(event, session) {
  if (event === 'PASSWORD_RECOVERY') {
    recovery = true;
    cleanUrl();
    showNewPassword(() => { recovery = false; toast('Password updated'); enter(session, true); });
    return;
  }
  if (event === 'SIGNED_OUT') { resetState(); showSignIn(); return; }
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { if (session) { S.session = session; S.user = session.user; } return; }
  if (recovery) return;
  if (!session) {
    cleanUrl();
    if (urlError && !started) showSignIn(urlError.replace(/\+/g, ' '));
    else if (hadCode && !started) showSignIn('Your email is confirmed. Sign in to continue.');
    else showSignIn();
    return;
  }
  let pendingReset = false;
  try { pendingReset = localStorage.getItem('otb.recovery') === '1'; } catch (_) { /* ignore */ }
  if (pendingReset && hadCode && !started) {
    recovery = true;
    cleanUrl();
    showNewPassword(() => { recovery = false; enter(session, true); });
    return;
  }
  enter(session);
}

function resetState() {
  started = false;
  enteredUser = null;
  if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
  Object.assign(S, { session: null, user: null, holder: null, profiles: [], me: null, isAdmin: false, following: new Set(), unread: 0 });
  S.posts.clear();
  ['#left', '#right', '#main'].forEach((s) => { $(s).innerHTML = ''; });
}

async function enter(session, force) {
  if (!force && enteredUser === session.user.id) { S.session = session; return; }
  enteredUser = session.user.id;
  S.session = session;
  S.user = session.user;
  cleanUrl();
  loading();
  try {
    await api.loadAccount();
  } catch (e) {
    enteredUser = null;
    $('#full').innerHTML = '<div class="setup"><div class="card prose"><h1>Can\'t load your account</h1><p>' + errMsg(e) + '</p><p>If this is a new Supabase project, check you\'ve run <b>supabase/schema.sql</b> in the SQL editor.</p><button class="btn btn-p" onclick="location.reload()">Try again</button> <button class="btn btn-g" data-signout>Sign out</button></div></div>';
    return;
  }
  if (S.holder && S.holder.locked) return showLockout();
  if (!primary()) {
    return showOnboarding(async (kind) => {
      await api.loadAccount();
      if (kind === 'parent') {
        return showAddChild(async (childId) => { await api.loadAccount(); startApp(childId); });
      }
      startApp();
    });
  }
  startApp();
}

async function startApp(actingId) {
  const want = actingId || recallActing();
  S.me = S.profiles.find((p) => p.id === want) || primary();
  rememberActing(S.me.id);
  await api.loadFollowing().catch(() => {});
  document.body.classList.remove('full');
  $('#full').innerHTML = '';
  started = true;
  renderNav();
  refreshRails();
  refreshUnread();
  route();
}

export async function switchTo(id) {
  const p = S.profiles.find((x) => x.id === id);
  if (!p) return;
  S.me = p;
  rememberActing(id);
  S.posts.clear();
  await api.loadFollowing().catch(() => {});
  renderNav();
  refreshRails();
  route();
  toast('You\'re now acting as ' + p.display_name);
}

async function refreshUnread() {
  if (!started) return;
  try { S.unread = await api.unreadCount(); renderPip(); } catch (_) { /* offline */ }
  // Pick up changes made by others (club confirmed you, admin verified you).
  try {
    const before = JSON.stringify(S.me);
    const fresh = await api.ownProfiles();
    fresh.forEach((f) => { const cur = S.profiles.find((x) => x.id === f.id); if (cur) Object.assign(cur, f); });
    if (JSON.stringify(S.me) !== before) { renderNav(); renderLeft(); }
  } catch (_) { /* offline */ }
}
setInterval(() => { if (document.visibilityState === 'visible') refreshUnread(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshUnread(); });

/* ---------- router ---------- */
function parse() {
  let h = location.hash.replace(/^#/, '');
  if (!h.startsWith('/')) h = '/';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
}

async function route() {
  if (!started || !S.me) return;
  if (S.viewerOpen) closeViewer(true);
  closeMenu();
  if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
  document.querySelectorAll('.media video').forEach((v) => v.pause());
  const tok = ++routeTok;
  const { parts, query } = parse();
  const main = $('#main');
  const key = parts[0] || 'home';
  const nav = key === 'u' && parts[1] === S.me.handle ? 'me' : ['home', 'trials', 'events', 'alerts'].includes(key) ? key : '';
  setActiveNav(nav);
  window.scrollTo(0, 0);
  if (Date.now() - railsAt > 15000) refreshRails();
  let res;
  try {
    switch (key) {
      case 'home': res = feedView(main); break;
      case 'trials': res = listingView(main, 'trial'); break;
      case 'events': res = listingView(main, 'event'); break;
      case 'alerts': res = alertsView(main); break;
      case 'u': res = profileView(main, parts[1] || S.me.handle, query.get('tab')); break;
      case 'me': location.replace('#/u/' + S.me.handle); return;
      case 'post': res = postView(main, parts[1]); break;
      case 'saved': res = savedView(main); break;
      case 'search': res = searchView(main, query.get('q')); break;
      case 'settings': res = settingsView(main, { refresh: () => { renderNav(); renderLeft(); }, switchTo }); break;
      case 'admin': res = adminView(main); break;
      case 'guidelines': res = guidelinesView(main); break;
      default: main.innerHTML = '<div class="card empty"><b>Page not found</b>That link doesn\'t go anywhere.<br><a class="btn btn-g" href="#/" style="margin-top:12px">Back to the feed</a></div>';
    }
    if (res && res.then) res = await res;
  } catch (e) {
    console.error(e);
    if (tok === routeTok) main.innerHTML = '<div class="card empty"><b>Something went wrong</b>' + errMsg(e) + '</div>';
  }
  if (typeof res === 'function') { if (tok === routeTok) cleanup = res; else res(); }
  const si = $('#searchInput');
  if (si && key !== 'search') si.value = '';
}
window.addEventListener('hashchange', route);

/* ---------- global controls ---------- */
document.addEventListener('click', (e) => {
  let t;
  if ((t = e.target.closest('[data-compose]'))) { e.preventDefault(); openComposer(t.dataset.compose); return; }
  if ((t = e.target.closest('[data-switch]'))) { switchTo(t.dataset.switch); return; }
  if ((t = e.target.closest('[data-guidelines]')) && !started) {
    e.preventDefault();
    openModal({ title: 'Guidelines', body: '<div class="prose" style="padding:0">' + GUIDELINES.replace(/<h1>.*?<\/h1>/, '') + '</div>' });
    return;
  }
  if ((t = e.target.closest('[data-menu="me"]'))) {
    e.preventDefault();
    meMenu(t, (act, b) => {
      if (act === 'profile') location.hash = '#/u/' + S.me.handle;
      if (act === 'switch') switchTo(b.dataset.id);
      if (act === 'saved') location.hash = '#/saved';
      if (act === 'settings') location.hash = '#/settings';
      if (act === 'admin') location.hash = '#/admin';
      if (act === 'guidelines') location.hash = '#/guidelines';
      if (act === 'signout') sb.auth.signOut();
    });
  }
});
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  location.hash = '#/search' + (q ? '?q=' + encodeURIComponent(q) : '');
});

/* ---------- go ---------- */
if (!configured) {
  showSetup();
} else {
  loading();
  sb.auth.onAuthStateChange((event, session) => {
    // Supabase recommends not awaiting other Supabase calls inside this callback.
    setTimeout(() => handleAuth(event, session), 0);
  });
}
