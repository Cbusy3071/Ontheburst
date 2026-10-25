// The persistent frame around every page: left profile card, right rail,
// top/bottom nav, the Me menu and the "posting as" bar.
import { S, primary, isPlayerKind } from './state.js';
import * as api from './api.js';
import { I, esc, fmt, av, badges, subHTML, dateBox, openMenu, $, $$, KIND_LABEL } from './ui.js';

export function strength(p, sum) {
  sum = sum || {};
  const items = isPlayerKind(p.kind)
    ? [
      [!!p.avatar_url, 'Add a profile photo so selectors recognise you.'],
      [!!p.pos, 'Add your playing position.'],
      [p.club_status === 'confirmed', p.club_id ? 'Waiting on your club to confirm you.' : 'Link your club so they can confirm you\'re registered.'],
      [(sum.highlights || 0) > 0, 'Post your first highlight.'],
      [!!p.bio, 'Write a short bio about your game.'],
      [(sum.verified_stats || 0) > 0, 'Get verified stats at a combine to complete your profile.'],
    ]
    : [
      [!!p.avatar_url, p.kind === 'club' ? 'Add your club logo.' : 'Add a profile photo.'],
      [!!p.bio, p.kind === 'club' ? 'Tell players about your club.' : 'Write a short bio.'],
      [!!p.region, 'Add your area.'],
      [p.kind !== 'club' || p.verified, 'Your club is waiting on verification.'],
    ];
  const done = items.filter((x) => x[0]).length;
  const next = items.find((x) => !x[0]);
  return { pct: Math.round(done / items.length * 100), tip: next ? next[1] : 'Your profile is complete. Nice work.' };
}

export async function renderLeft() {
  const el = $('#left'), p = S.me;
  if (!p) { el.innerHTML = ''; return; }
  let sum = {};
  try { sum = await api.profileSummary(p.id); } catch (_) { /* show zeros */ }
  if (S.me !== p) return; // switched while loading
  const st = strength(p, sum);
  const player = isPlayerKind(p.kind);
  const stats = player
    ? [[fmt(sum.clip_views), 'Clip views'], [fmt(sum.profile_views), 'Profile views'], [fmt(sum.trials), 'Trials']]
    : [[fmt(p.follower_count), 'Followers'], [fmt(sum.profile_views), 'Profile views'], [fmt(sum.posts), 'Posts']];
  el.innerHTML = '<div class="card">' +
    '<div class="cover">' + (p.jersey ? '<span class="num">' + esc(p.jersey) + '</span>' : '') + '</div>' +
    '<div class="pc-body">' + av(p, 76, true) +
      '<div class="pc-name"><a class="name-link" href="#/u/' + esc(p.handle) + '">' + esc(p.display_name) + '</a></div>' +
      '<div class="pc-sub">' + subHTML(p) + '</div>' + (badges(p) ? '<div class="pc-sub" style="margin-top:6px">' + badges(p) + '</div>' : '') + '</div>' +
    '<div class="pc-stats">' + stats.map((s) => '<div><b>' + s[0] + '</b><span>' + s[1] + '</span></div>').join('') + '</div>' +
    '<div class="strength"><div class="row">Profile strength <span>' + st.pct + '%</span></div><div class="bar"><i style="width:' + st.pct + '%"></i></div><p>' + esc(st.tip) + '</p></div>' +
    '<div class="pc-links">' +
      '<a href="#/u/' + esc(p.handle) + '?tab=highlights">' + ic16('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/>') + 'My highlights</a>' +
      '<a href="#/saved">' + ic16('<path d="M6 3.5h12v17l-6-4-6 4z" stroke-linejoin="round"/>') + 'Saved</a>' +
      '<a href="#/settings">' + ic16('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>') + 'Edit profile</a>' +
    '</div></div>';
}
const ic16 = (inner) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + inner + '</svg>';

export async function renderRight() {
  const el = $('#right');
  if (!S.me) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card"><h3>Upcoming trials</h3><div id="rrTrials"><div class="spin"></div></div><a href="#/trials" class="rr-more">See all trials</a></div>' +
    '<div class="card"><h3>Players to watch</h3><div id="watch"><div class="spin"></div></div><a href="#/search" class="rr-more">Search players</a></div>' +
    '<div class="foot">On the Burst · <a href="#/guidelines">Community guidelines</a><br>No direct messaging, by design</div>';
  try {
    const ev = await api.upcomingLite(3);
    $('#rrTrials').innerHTML = ev.length ? ev.map((p) => '<a class="rr-item" href="#/post/' + p.id + '">' + dateBox(p.event_date) + '<div class="grow"><div class="t1">' + esc((p.data && p.data.title) || 'Trial') + '</div><div class="t2">' + esc([p.author && p.author.display_name, p.data && (p.data.eligibility || p.data.location)].filter(Boolean).join(' · ')) + '</div></div></a>').join('')
      : '<div class="rr-item"><div class="t2">No trials listed yet. When clubs post them, they show up here.</div></div>';
  } catch (_) { $('#rrTrials').innerHTML = ''; }
  try {
    const w = await api.playersToWatch();
    $('#watch').innerHTML = w.length ? w.map((p) => '<div class="rr-item">' + av(p, 42, true) + '<div class="grow"><div class="t1"><a class="name-link" href="#/u/' + esc(p.handle) + '">' + esc(p.display_name) + '</a>' + (p.kind === 'rising_star' ? '<span class="rs">' + I.star + 'Rising Star</span>' : '') + '</div><div class="t2">' + esc([p.pos, p.club_name, p.grade].filter(Boolean).join(' · ')) + '</div></div>' +
      '<button class="pill' + (S.following.has(p.id) ? ' on' : '') + '" data-follow="' + p.id + '" aria-label="Follow">' + (S.following.has(p.id) ? I.check : I.plus) + '</button></div>').join('')
      : '<div class="rr-item"><div class="t2">Players show up here as they join.</div></div>';
  } catch (_) { $('#watch').innerHTML = ''; }
}

export function renderNav() {
  const p = S.me;
  $$('[data-me-av]').forEach((el) => {
    el.style.background = p ? p.color : '#334155';
    el.innerHTML = p && p.avatar_url ? '<img alt="" src="' + esc(p.avatar_url) + '">' : esc(p ? p.display_name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() : '');
  });
  const bar = $('#acting'), prim = primary();
  if (p && prim && p.id !== prim.id) {
    bar.hidden = false;
    bar.innerHTML = '<div class="acting-in">' + I.shield + '<span>You\'re acting as <b>' + esc(p.display_name) + '</b> (' + esc(KIND_LABEL[p.kind]) + '). Posts, likes and comments go out as them.</span><button data-switch="' + prim.id + '">Switch back to you</button></div>';
  } else bar.hidden = true;
  renderPip();
}
export function renderPip() {
  $$('[data-pip]').forEach((el) => { el.hidden = !S.unread; el.textContent = S.unread > 9 ? '9+' : String(S.unread); });
}
export function setActiveNav(key) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
}

export function meMenu(anchor, onAction) {
  const p = S.me;
  let html = '<div class="row-flex" style="padding:8px 10px 10px">' + av(p, 40) + '<div class="grow"><b style="font-size:14px">' + esc(p.display_name) + '</b><div class="small muted">@' + esc(p.handle) + '</div></div></div>' +
    '<button data-act="profile">' + I.user + 'View profile</button>';
  if (S.profiles.length > 1) {
    html += '<hr><div class="mh">Act as</div>' + S.profiles.map((x) => '<button data-act="switch" data-id="' + x.id + '">' + av(x, 28) + '<span class="grow">' + esc(x.display_name) + '<br><small class="muted">' + esc(KIND_LABEL[x.kind]) + '</small></span>' + (x.id === p.id ? '<span class="cur">' + I.check + '</span>' : '') + '</button>').join('');
  }
  html += '<hr><button data-act="saved">' + I.save.replace('width="21" height="21"', 'width="16" height="16"') + 'Saved</button>' +
    '<button data-act="settings">' + I.gear + 'Settings</button>' +
    (S.isAdmin ? '<button data-act="admin">' + I.admin + 'Admin</button>' : '') +
    '<button data-act="guidelines">' + I.flag + 'Community guidelines</button>' +
    '<hr><button data-act="signout" class="danger">' + I.out + 'Sign out</button>';
  openMenu(anchor, html, onAction);
}
