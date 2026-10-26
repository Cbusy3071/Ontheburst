// Shared UI helpers: icons, avatars, formatting, toasts, modals, menus.
import { S } from './state.js';

/* ---------- icons (from the prototype, plus a few new ones) ---------- */
const HEART_D = 'M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z';
export function ic(sz, inner, attrs) {
  return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" ' + (attrs || 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + '>' + inner + '</svg>';
}
const BOLD = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
export const I = {
  heart: ic(21, '<path d="' + HEART_D + '"/>'),
  heartBig: ic(28, '<path d="' + HEART_D + '"/>'),
  heartPop: '<svg width="120" height="120" viewBox="0 0 24 24"><path d="' + HEART_D + '" fill="currentColor"/></svg>',
  heartTiny: '<svg width="10" height="10" viewBox="0 0 24 24"><path d="' + HEART_D + '" fill="#fff"/></svg>',
  comment: ic(21, '<path d="M4 5h16v11H9l-5 4z"/>'),
  commentBig: ic(27, '<path d="M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-1 0-2-.1-2.9-.4L4 20l1.3-3.9C4.2 14.8 3.5 13.1 3.5 11.2 3.5 7.2 7.3 4 12 4z"/>'),
  share: ic(21, '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'),
  shareBig: ic(27, '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'),
  save: ic(21, '<path d="M6 3.5h12v17l-6-4-6 4z"/>'),
  saveBig: ic(27, '<path d="M6 3.5h12v17l-6-4-6 4z"/>'),
  plus: ic(16, '<path d="M12 5v14M5 12h14"/>', BOLD),
  check: ic(16, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', BOLD),
  tick: '<svg class="tick" width="15" height="15" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z" fill="currentColor"/><path d="M8 12.3l2.7 2.7L16.2 9.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
  globe: ic(12, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>'),
  expand: ic(14, '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>', BOLD),
  play: '<svg width="34" height="34" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  playSm: '<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  volOff: ic(18, '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>', 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'),
  volOn: ic(20, '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/>', 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'),
  cal: ic(16, '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  clock: ic(16, '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  pin: ic(16, '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  people: ic(16, '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.4 3-5 6-5s5.4 1.6 6 5M16 5.5a3 3 0 010 6M18 14.6c1.7.6 2.8 2.2 3 4.9"/>'),
  shield: ic(15, '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
  trophy: ic(30, '<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4"/>', 'fill="none" stroke="#FF8A3D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  eye: ic(12, '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>', 'fill="none" stroke="#fff" stroke-width="2.4"'),
  more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  x: ic(18, '<path d="M6 6l12 12M18 6L6 18"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'),
  trash: ic(16, '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  edit: ic(16, '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  flag: ic(16, '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  link: ic(16, '<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/>'),
  user: ic(16, '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.3 3.9-6.5 8-6.5s7.2 2.2 8 6.5"/>'),
  gear: ic(16, '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>'),
  out: ic(16, '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  swap: ic(16, '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>'),
  bell: ic(18, '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>'),
  video: ic(18, '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/>'),
  text: ic(18, '<path d="M5 6h14M5 11h14M5 16h9"/>'),
  chart: ic(18, '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  medal: ic(18, '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5L6 3h4l2 5 2-5h4l-2.5 7.5"/>'),
  clip: ic(18, '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M8.5 10h7M8.5 14h7"/>'),
  list: ic(18, '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'),
  admin: ic(16, '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/>'),
  camera: ic(16, '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
};
export const LOGO_SVG = '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#FF5B1F"/><g transform="rotate(-30 21 21)"><path d="M5 16.4h7M3.5 21h8.5M5 25.6h7" stroke="#0D2B20" stroke-width="2.5" stroke-linecap="round"/><path d="M14.5 21C17.5 12.6 32.5 12.6 35.5 21C32.5 29.4 17.5 29.4 14.5 21Z" fill="#0D2B20"/><path d="M14.9 21C19 17.4 31 17.4 35.1 21M14.9 21C19 24.6 31 24.6 35.1 21" fill="none" stroke="#FF5B1F" stroke-width="1.35"/></g></svg>';

export const COLORS = ['#2F6FED', '#0E8A5F', '#B4452B', '#C2410C', '#7A4E12', '#1E3A8A', '#3B5BDB', '#0F766E', '#6D28D9', '#9333EA', '#DB2777', '#0891B2', '#166534', '#334155'];
export const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

export const POSITIONS = ['Fullback', 'Winger', 'Centre', 'Five-eighth', 'Halfback', 'Prop', 'Hooker', 'Second row', 'Lock', 'Utility'];
export const GRADES = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20', 'Opens', 'A Grade', 'Women\'s', 'Tarsha Gale', 'Lisa Fiaola', 'SG Ball', 'Harold Matthews', 'Jersey Flegg', 'Masters'];
export const KIND_LABEL = { player: 'Player', rising_star: 'Rising Star', parent: 'Parent', club: 'Club', scout: 'Scout', coach: 'Coach', agent: 'Player agent', fan: 'Supporter' };

/* ---------- formatting ---------- */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
export const plural = (n, w) => fmt(n) + ' ' + w + (n === 1 ? '' : 's');
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0][0] || '', b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || '');
  return (a + b).toUpperCase();
}
export function timeAgo(iso) {
  const t = new Date(iso).getTime(), s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd';
  const d = new Date(t), now = new Date();
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export function parseDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function longDate(ymd) {
  const d = parseDate(ymd);
  return d ? d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
}
export function dateBox(ymd) {
  const d = parseDate(ymd);
  if (!d) return '';
  return '<div class="date"><b>' + d.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase().slice(0, 3) + '</b><span>' + d.getDate() + '</span></div>';
}
export const todayYMD = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
export function duration(s) {
  s = Math.round(Number(s) || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
// Escape text, then turn #hashtags into search links.
export function richText(s) {
  return esc(s).replace(/(^|[\s(])#([A-Za-z0-9_]{1,30})/g, (m, pre, tag) => pre + '<a class="tags" href="#/search?q=%23' + tag.toLowerCase() + '">#' + tag + '</a>');
}
export const extractTags = (s) => Array.from(new Set((String(s).match(/#([A-Za-z0-9_]{1,30})/g) || []).map((t) => t.slice(1).toLowerCase()))).slice(0, 10);
export function suggestHandle(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

/* ---------- people ---------- */
export function av(p, size, link) {
  p = p || {};
  const isOrg = p.kind === 'club';
  const style = 'background:' + esc(p.color || '#334155') + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.33) + 'px';
  const inner = p.avatar_url ? '<img alt="" loading="lazy" src="' + esc(p.avatar_url) + '">' : esc(initials(p.display_name));
  const cls = 'av' + (isOrg ? ' org' : '');
  if (link && p.handle) return '<a class="' + cls + '" style="' + style + '" href="#/u/' + esc(p.handle) + '" aria-label="' + esc(p.display_name) + '">' + inner + '</a>';
  return '<span class="' + cls + '" style="' + style + '">' + inner + '</span>';
}
export function badges(p) {
  return (p.verified ? I.tick : '') + (p.kind === 'rising_star' ? '<span class="rs">' + I.star + 'Rising Star</span>' : '') +
    (p.kind === 'club' && !p.partnered ? '<span class="np">Not partnered yet</span>' : '');
}
const isPlayer = (p) => p.kind === 'player' || p.kind === 'rising_star';
export function subHTML(p) {
  if (isPlayer(p)) {
    const bits = [p.club_name, p.grade].filter(Boolean).map(esc).join(' · ');
    return (p.pos ? '<span class="pos">' + esc(p.pos) + '</span>' : '') + (bits || (p.pos ? '' : 'Player'));
  }
  return esc(subText(p));
}
export function subText(p) {
  if (isPlayer(p)) return [p.pos, p.club_name, p.grade].filter(Boolean).join(' · ') || KIND_LABEL[p.kind];
  if (p.kind === 'club') {
    if (p.club_tier === 'nrl') return 'NRL club';
    if (p.club_tier === 'senior') return ['Senior rugby league club', p.region].filter(Boolean).join(' · ');
    if (p.club_tier === 'junior') return ['Junior rugby league club', p.region ? p.region + ' district' : ''].filter(Boolean).join(' · ');
    return ['Rugby league club', p.region].filter(Boolean).join(' · ');
  }
  if (p.kind === 'parent') return 'Parent' + (p.region ? ' · ' + p.region : '');
  if (p.kind === 'fan') return 'Supporter' + (p.club_name ? ' · ' + p.club_name : '');
  return [p.pos || KIND_LABEL[p.kind], p.club_name].filter(Boolean).join(' · ');
}
export function commentTag(p) {
  if (p.kind === 'club') return 'Club';
  if (p.verified && (p.kind === 'scout' || p.kind === 'coach' || p.kind === 'agent')) return 'Verified ' + KIND_LABEL[p.kind].toLowerCase();
  return subText(p);
}
export const firstName = (n) => String(n || '').split(' ')[0];

/* ---------- toast ---------- */
let toastT;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- errors ---------- */
export function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Something went wrong');
  if (/profiles_handle_key|duplicate key.*handle/i.test(m)) return 'That handle is taken. Try another.';
  if (/profiles_handle_check/i.test(m)) return 'Handles are 3 to 24 lowercase letters, numbers or underscores.';
  if (/Invalid login credentials/i.test(m)) return 'That email and password don\'t match.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first. The link is in your inbox.';
  if (/User already registered/i.test(m)) return 'There\'s already an account with that email. Try signing in.';
  if (/Password should be at least/i.test(m)) return 'Use a password with at least 8 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can\'t reach the server. Check your connection.';
  if (/JWT expired/i.test(m)) return 'Your session expired. Refresh the page.';
  if (/row-level security|permission denied/i.test(m)) return 'You don\'t have permission to do that.';
  if (/check constraint/i.test(m)) return 'Some of those details aren\'t valid. Check lengths and formats.';
  return m;
}

/* ---------- modal ---------- */
let modalStack = [];
export function openModal({ title, body, foot, wide, onClose }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="modal-h"><h2>' + esc(title) + '</h2><button class="iconbtn" data-close aria-label="Close">' + I.x + '</button></div>' +
    '<div class="modal-b">' + (body || '') + '</div>' + (foot ? '<div class="modal-f">' + foot + '</div>' : '') + '</div>';
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
  const m = { el: bg, box: bg.querySelector('.modal'), body: bg.querySelector('.modal-b'), close };
  function close() {
    if (!bg.isConnected) return;
    bg.remove();
    modalStack = modalStack.filter((x) => x !== m);
    if (!modalStack.length && !S.viewerOpen) document.body.style.overflow = '';
    if (onClose) onClose();
  }
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelector('[data-close]').onclick = close;
  modalStack.push(m);
  const first = bg.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select');
  if (first && matchMedia('(min-width:761px)').matches) setTimeout(() => first.focus(), 30);
  return m;
}
export function topModal() { return modalStack[modalStack.length - 1]; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) { e.stopImmediatePropagation(); topModal().close(); }
}, true);

export function confirmDialog({ title, text, ok = 'Confirm', danger }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      body: '<p class="muted" style="font-size:14px">' + esc(text) + '</p>',
      foot: '<button class="btn btn-g" data-no>Cancel</button><button class="btn ' + (danger ? 'btn-d' : 'btn-p') + '" data-yes>' + esc(ok) + '</button>',
      onClose: () => { if (!done) resolve(false); },
    });
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = () => { done = true; m.close(); resolve(true); };
  });
}

/* ---------- popover menu ---------- */
let openMenuEl = null;
export function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
export function openMenu(anchor, html, onClick) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu';
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    closeMenu();
    onClick(b.dataset.act, b);
  });
  openMenuEl = el;
  return el;
}
document.addEventListener('mousedown', (e) => { if (openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest('[data-menu],[data-more]')) closeMenu(); });
window.addEventListener('scroll', closeMenu, { passive: true });
window.addEventListener('resize', closeMenu);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function spinner() { return '<div class="spin" role="progressbar" aria-label="Loading"></div>'; }
export function skeletonPosts(n = 2) {
  return Array.from({ length: n }, () => '<div class="card skel-post"><div class="row-flex"><div class="skel a"></div><div class="grow"><div class="skel l" style="width:40%"></div><div class="skel l" style="width:60%"></div></div></div><div class="skel" style="height:180px;margin-top:14px"></div></div>').join('');
}
export function emptyCard(title, text, extra) {
  return '<div class="card empty"><b>' + esc(title) + '</b>' + esc(text) + (extra || '') + '</div>';
}
// Disable a button while an async action runs.
export async function busy(btn, fn, label) {
  if (!btn) return fn();
  const old = btn.innerHTML;
  btn.disabled = true;
  if (label) btn.textContent = label;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}
