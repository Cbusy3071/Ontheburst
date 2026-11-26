// Guest mode: signed-out visitors browse a read-only slice of the app.
// The database decides what guests can see (supabase/update_guest_mode.sql);
// this file keeps the UI honest about it and turns every action that needs
// an account into a prompt to join.
import { S } from './state.js';
import { I, esc, openModal, topModal, LOGO_SVG } from './ui.js';

// How many different highlights a guest can open in the viewer before we ask
// them to join. It's a nudge, not security: the clips are already public.
export const GUEST_CLIP_LIMIT = 20;
const SEEN_KEY = 'otb.guestClips';
const GUEST_KEY = 'otb.guest';

export const isGuest = () => S.guest === true;

export function rememberGuest(on) {
  try { if (on) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY); } catch (_) { /* private mode */ }
}
export function wasGuest() {
  try { return localStorage.getItem(GUEST_KEY) === '1'; } catch (_) { return false; }
}

function seen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (_) { return []; }
}
export const clipLimitReached = () => seen().length >= GUEST_CLIP_LIMIT;
export const clipSeen = (id) => seen().includes(id);

// Call when a guest is about to watch a clip. Returns false (and asks them to
// join) once they've used up their free highlights. Clips already watched
// stay watchable.
export function allowClip(id) {
  if (!isGuest()) return true;
  const list = seen();
  if (list.includes(id)) return true;
  if (list.length >= GUEST_CLIP_LIMIT) { joinPrompt('clips'); return false; }
  list.push(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(list)); } catch (_) { /* ignore */ }
  return true;
}

const REASONS = {
  like: 'Sign in to like highlights and back the players coming through.',
  comment: 'Sign in to join the conversation.',
  follow: 'Sign in to follow players and clubs and see their posts first.',
  save: 'Sign in to save highlights for later.',
  register: 'Sign in to register for trials. The club confirms your spot.',
  post: 'Sign in to post your highlights and get in front of selectors.',
  alerts: 'Sign in to get alerts when clubs confirm you or people back your clips.',
  report: 'Sign in to report posts and profiles.',
  clips: 'You\'ve watched ' + GUEST_CLIP_LIMIT + ' highlights. Join free to keep watching, and to post your own.',
  me: 'Sign in to build your profile, post highlights and register for trials.',
  page: 'Sign in to see this page.',
};

// The auth screens register themselves here to avoid a circular import.
let authScreens = null;
export function registerAuthScreens(fns) { authScreens = fns; }

export function joinPrompt(reason) {
  if (topModal() && topModal().el.querySelector('[data-join-modal]')) return;
  const text = REASONS[reason] || REASONS.me;
  const m = openModal({
    title: 'Join On the Burst',
    body: '<div data-join-modal class="join">' + LOGO_SVG.replace('width="40" height="40"', 'width="48" height="48"') +
      '<p>' + esc(text) + '</p>' +
      '<button class="btn btn-google btn-block" data-google data-join="google">' + I.google + 'Continue with Google</button>' +
      '<div class="join-row"><button class="btn btn-p" data-join="signup">Create account</button><button class="btn btn-g" data-join="signin">Sign in</button></div>' +
      '<p class="small muted">Free for players 16 and over, parents, clubs, scouts and coaches.</p></div>',
  });
  return m;
}

// "Continue with Google", "Create account" and "Sign in" buttons, wherever they are.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-join]');
  if (!b || !authScreens) return;
  e.preventDefault();
  if (topModal() && topModal().el.contains(b)) topModal().close();
  authScreens[b.dataset.join]();
});

// Every control that needs an account, and the reason we show for it.
const GUARDED = [
  ['[data-like]', 'like'], ['[data-save]', 'save'], ['[data-follow]', 'follow'],
  ['[data-register]', 'register'], ['[data-regs]', 'register'], ['[data-compose]', 'post'],
  ['[data-cdel],[data-capprove],[data-creject]', 'comment'], ['[data-creport]', 'report'],
  ['[data-nav="alerts"]', 'alerts'], ['[data-claimpage]', 'page'], ['[data-join-ask]', null],
];

// Capture phase, so this runs before any of the app's own click handlers.
document.addEventListener('click', (e) => {
  if (!isGuest()) return;
  for (const [sel, reason] of GUARDED) {
    const t = e.target.closest(sel);
    if (t) {
      e.preventDefault();
      e.stopImmediatePropagation();
      joinPrompt(reason || t.dataset.joinAsk);
      return;
    }
  }
}, true);
document.addEventListener('submit', (e) => {
  if (isGuest() && e.target.closest('[data-cform]')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    joinPrompt('comment');
  }
}, true);

// Left column for guests.
export function guestCardHTML() {
  return '<div class="card guest-card">' + LOGO_SVG.replace('width="40" height="40"', 'width="44" height="44"') +
    '<b>You\'re browsing as a guest</b><p>Join free to post highlights, follow players and register for trials.</p>' +
    '<button class="btn btn-google btn-block" data-google data-join="google">' + I.google + 'Continue with Google</button>' +
    '<button class="btn btn-p btn-block" data-join="signup">Create account</button>' +
    '<button class="btn btn-g btn-block" data-join="signin">Sign in</button></div>';
}

// Shown at the top of the feed for guests.
export function guestBannerHTML() {
  return '<div class="card guest-banner"><div class="grow"><b>Get your footy seen</b><span>You\'re browsing as a guest. Join free to post highlights and register for trials.</span></div>' +
    '<button class="btn btn-p btn-sm" data-join-ask="me">Join free</button></div>';
}

// Full-page card for routes guests can't use.
export function guestPageHTML(reason) {
  return '<div class="card empty"><b>Sign in to see this</b>' + esc(REASONS[reason] || REASONS.page) +
    '<br><button class="btn btn-p" data-join-ask="' + esc(reason || 'page') + '" style="margin-top:12px">Join or sign in</button></div>';
}
