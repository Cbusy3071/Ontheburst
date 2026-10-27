// Post cards: the prototype's renderers, now driven by real rows.
import { S } from './state.js';
import { I, esc, fmt, plural, av, badges, subHTML, timeAgo, longDate, richText, duration, todayYMD, firstName } from './ui.js';
import { mediaUrl } from './media.js';

const own = (p) => S.profiles.some((x) => x.id === p.author_id);

export function followBtn(profile) {
  if (!profile || S.profiles.some((x) => x.id === profile.id)) return '';
  const on = S.following.has(profile.id);
  return '<button class="follow' + (on ? ' on' : '') + '" data-follow="' + profile.id + '">' + (on ? I.check + 'Following' : I.plus + 'Follow') + '</button>';
}

function regButton(p, labels) {
  const past = p.event_date && p.event_date < todayYMD();
  if (own(p)) return '<button class="cta" data-regs="' + p.id + '">View registrations</button>';
  if (past) return '<button class="cta done" disabled>Finished</button>';
  const st = p.reg;
  const text = st === 'confirmed' ? labels[2] : st ? labels[1] : labels[0];
  return '<button class="cta' + (st ? ' done' : '') + '" data-register="' + p.id + '">' + esc(text) + '</button>';
}

export function mediaBlock(p) {
  const d = p.data || {};
  if (p.kind === 'clip') {
    const src = mediaUrl(p.media_path), poster = mediaUrl(p.poster_path);
    const ar = p.media_width && p.media_height ? p.media_width + '/' + p.media_height : '9/16';
    return '<div class="media" style="--ar:' + ar + '" data-open="' + p.id + '" role="button" aria-label="Open highlight">' +
      '<video data-post="' + p.id + '" muted playsinline loop preload="metadata"' + (poster ? ' poster="' + esc(poster) + '"' : '') + (src ? ' src="' + esc(src) + '"' : '') + '></video>' +
      '<span class="chip mute">' + I.volOff + '</span>' +
      '<span class="chip dur">' + I.playSm + duration(p.duration_s) + ' · <span data-views="' + p.id + '">' + fmt(p.view_count) + '</span> views</span>' +
      '<span class="chip open">' + I.expand + 'Watch</span></div>';
  }
  if (p.kind === 'trial') {
    const rows = [
      [I.cal, longDate(p.event_date)], [I.clock, d.time], [I.pin, d.location], [I.people, d.eligibility],
    ].filter((r) => r[1]).map((r) => '<div>' + r[0] + esc(r[1]) + '</div>').join('');
    return '<div class="rich"><div class="rich-top"><div class="kicker">Trial · ' + esc(d.kicker || 'Open to all clubs') + '</div><div class="rich-title">' + esc(d.title || 'Trials') + '</div></div>' +
      '<div class="rows">' + rows + '</div>' +
      '<div class="rich-foot"><span data-regcount="' + p.id + '">' + plural(p.registration_count, 'player') + ' registered</span>' +
      regButton(p, ['Register interest', 'Registered', 'Spot confirmed']) + '</div></div>';
  }
  if (p.kind === 'event') {
    const chips = (d.chips || []).map((c) => '<span class="chip2">' + esc(c) + '</span>').join('') + (d.verified_results ? '<span class="chip2 v">' + I.shield + 'Verified results</span>' : '');
    return '<div class="rich combine"><div class="rich-top"><div class="kicker">Event · ' + esc(longDate(p.event_date)) + '</div><div class="rich-title">' + esc(d.title || 'Event') + '</div></div>' +
      (chips ? '<div class="chips">' + chips + '</div>' : '') +
      '<div class="rich-foot"><span>' + esc([d.location, d.note].filter(Boolean).join(' · ')) + (p.registration_count ? ' · <span data-regcount="' + p.id + '">' + fmt(p.registration_count) + ' going</span>' : '') + '</span>' +
      regButton(p, ['Get notified', 'You\'re on the list', 'Spot confirmed']) + '</div></div>';
  }
  if (p.kind === 'team') {
    const meName = S.me ? S.me.display_name.toLowerCase() : '';
    const players = (d.players || []).filter((x) => x && x.name);
    return '<div class="rich"><div class="team-top"><div class="disp">' + esc(d.title || 'Team list') + (d.when ? '<small>' + esc(d.when) + '</small>' : '') + '</div>' +
      (d.opponent ? '<span class="vs">VS ' + esc(String(d.opponent).toUpperCase()) + '</span>' : '') + '</div>' +
      '<div class="team">' + players.map((t) => {
        const you = meName && t.name.toLowerCase() === meName;
        return '<div' + (you ? ' class="you"' : '') + '><b>' + esc(t.n) + '</b><span>' + esc(t.name) + (you ? ' (you)' : '') + '</span><em>' + esc(t.pos || '') + '</em></div>';
      }).join('') + '</div></div>';
  }
  if (p.kind === 'milestone') {
    return '<div class="mile"><div class="k">' + esc(d.kicker || 'Milestone') + '</div><div class="big">' + esc(d.big || 'Selected') + '</div>' +
      '<div class="s">' + esc(d.line || '') + (d.small ? '<small>' + esc(d.small) + '</small>' : '') + '</div><span class="badge">' + I.trophy + '</span></div>';
  }
  if (p.kind === 'stats') {
    const st = (d.items || []).filter((x) => x && x.v !== '' && x.v != null).slice(0, 8);
    return '<div class="stats">' + st.map((x) => '<div class="stat"><b>' + esc(x.v) + '<small>' + esc(x.u || '') + '</small></b><span>' + esc(x.l || '') + '</span><em>Self-reported</em></div>').join('') + '</div>' +
      (own(p) ? '<div class="verify">' + I.shield.replace('width="15" height="15"', 'width="16" height="16"') + '<span style="flex:1">Get these verified at a combine</span><a class="linkbtn" href="#/events">Find an event</a></div>' : '');
  }
  return '';
}

// Link preview card (image, title, site) for posts that carry data.preview,
// e.g. from the news agent. Only official accounts get cards, so nobody can
// dress a scam link up as a news story.
const httpsUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? x : null; } catch (_) { return null; } };
export function linkPreview(p) {
  const pv = p.data && p.data.preview;
  if (!pv || !p.author || !p.author.official) return '';
  const url = httpsUrl(pv.url);
  if (!url) return '';
  const img = pv.image && httpsUrl(pv.image);
  const site = String(pv.site || url.hostname.replace(/^www\./, '')).slice(0, 60);
  const title = String(pv.title || '').slice(0, 200);
  return '<a class="link-preview" href="' + esc(url.href) + '" target="_blank" rel="noopener noreferrer nofollow">' +
    (img ? '<img src="' + esc(img.href) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-lp-img>' : '') +
    '<div class="link-preview__meta">' + (title ? '<span class="link-preview__title">' + esc(title) + '</span>' : '') +
    '<span class="link-preview__site">' + esc(site) + '</span></div></a>';
}

export function photosBlock(p) {
  const imgs = (p.image_paths || []).map(mediaUrl).filter(Boolean);
  if (!imgs.length) return '';
  return '<div class="pgrid n' + Math.min(imgs.length, 4) + '">' + imgs.map((u, i) =>
    '<button class="pgrid-i" data-photo="' + p.id + '" data-idx="' + i + '" aria-label="Open photo ' + (i + 1) + '"><img alt="" loading="lazy" src="' + esc(u) + '"></button>').join('') + '</div>';
}

export function managerLine(a, cls) {
  if (a.kind !== 'rising_star') return '';
  const m = a.manager;
  return '<div class="' + (cls || 'mgr') + '">' + I.shield + 'Managed by ' + esc(m ? m.display_name : 'a parent') + ' (parent)</div>';
}

export function postHTML(p) {
  const a = p.author;
  const edited = p.edited_at ? ' · edited' : '';
  return '<article class="card post" data-post="' + p.id + '" data-kind="' + p.kind + '" data-author="' + a.id + '">' +
    '<header class="post-h">' + av(a, 46, true) +
      '<div class="who"><div class="name"><a class="name-link" href="#/u/' + esc(a.handle) + '">' + esc(a.display_name) + '</a>' + badges(a) + '</div>' +
      '<div class="sub">' + subHTML(a) + '</div>' + managerLine(a) +
      '<div class="time"><a href="#/post/' + p.id + '">' + timeAgo(p.created_at) + edited + '</a> · ' + I.globe + '</div></div>' +
      followBtn(a) + '<button class="iconbtn post-more" data-more="' + p.id + '" aria-label="More options">' + I.more + '</button></header>' +
    (p.caption ? '<div class="post-text" data-caption="' + p.id + '">' + richText(p.caption) + '</div>' : '<div style="height:12px"></div>') +
    mediaBlock(p) + photosBlock(p) + linkPreview(p) +
    '<div class="post-stats"><span class="l"><span class="hb">' + I.heartTiny + '</span><span data-likecount="' + p.id + '">' + fmt(p.like_count) + '</span></span>' +
      '<button data-cmts="' + p.id + '" data-cword="' + p.id + '">' + plural(p.comment_count, 'comment') + '</button></div>' +
    '<div class="post-acts">' +
      '<button data-like="' + p.id + '" class="' + (p.liked ? 'on' : '') + '">' + I.heart + '<span>Like</span></button>' +
      '<button data-cmts="' + p.id + '">' + I.comment + '<span>Comment</span></button>' +
      '<button data-share="' + p.id + '">' + I.share + '<span>Share</span></button>' +
      '<button data-save="' + p.id + '" class="' + (p.saved ? 'saved' : '') + '">' + I.save + '<span>Save</span></button>' +
    '</div><div class="cmts" data-cmtbox="' + p.id + '" hidden></div></article>';
}

export function tileHTML(p) {
  const a = p.author, poster = mediaUrl(p.poster_path);
  return '<button class="tile" data-open="' + p.id + '">' + (poster ? '<img alt="" loading="lazy" src="' + esc(poster) + '">' : '') +
    '<span class="shade"></span><span class="views">' + I.eye + fmt(p.view_count) + '</span>' +
    '<span class="who">' + av(a, 26) + esc(a.display_name) + '<small>' + esc([a.pos, a.grade].filter(Boolean).join(' · ') || '') + '</small></span></button>';
}

/* ---------- keep every copy of a post in sync ---------- */
export function syncLike(id) {
  const p = S.posts.get(id);
  if (!p) return;
  document.querySelectorAll('[data-like="' + id + '"]').forEach((b) => {
    b.classList.toggle('on', p.liked);
    const n = b.querySelector('.n');
    if (n) n.textContent = fmt(p.like_count);
  });
  document.querySelectorAll('[data-likecount="' + id + '"]').forEach((e) => { e.textContent = fmt(p.like_count); });
}
export function syncSave(id) {
  const p = S.posts.get(id);
  document.querySelectorAll('[data-save="' + id + '"]').forEach((b) => b.classList.toggle('saved', !!(p && p.saved)));
}
export function syncFollow(pid) {
  const on = S.following.has(pid);
  document.querySelectorAll('[data-follow="' + pid + '"]').forEach((b) => {
    b.classList.toggle('on', on);
    if (b.classList.contains('follow-v')) b.textContent = on ? 'Following' : 'Follow';
    else if (b.classList.contains('pill')) b.innerHTML = on ? I.check : I.plus;
    else if (b.classList.contains('btn')) b.innerHTML = on ? I.check + 'Following' : I.plus + 'Follow';
    else b.innerHTML = on ? I.check + 'Following' : I.plus + 'Follow';
  });
}
export function syncComments(id) {
  const p = S.posts.get(id);
  if (!p) return;
  document.querySelectorAll('[data-cword="' + id + '"]').forEach((e) => { e.textContent = plural(p.comment_count, 'comment'); });
  document.querySelectorAll('[data-ccount="' + id + '"]').forEach((e) => { e.textContent = fmt(p.comment_count); });
}
export function syncReg(id) {
  const p = S.posts.get(id);
  if (!p) return;
  document.querySelectorAll('[data-register="' + id + '"]').forEach((b) => {
    const trial = p.kind === 'trial';
    const labels = trial ? ['Register interest', 'Registered', 'Spot confirmed'] : ['Get notified', 'You\'re on the list', 'Spot confirmed'];
    b.textContent = p.reg === 'confirmed' ? labels[2] : p.reg ? labels[1] : labels[0];
    b.classList.toggle('done', !!p.reg);
  });
  document.querySelectorAll('[data-regcount="' + id + '"]').forEach((e) => {
    e.textContent = p.kind === 'trial' ? plural(p.registration_count, 'player') + ' registered' : fmt(p.registration_count) + ' going';
  });
}
export function removePostEverywhere(id) {
  document.querySelectorAll('.post[data-post="' + id + '"], .tile[data-open="' + id + '"]').forEach((el) => el.remove());
  S.posts.delete(id);
}

export function modNote(p) {
  const a = p.author;
  if (a.kind !== 'rising_star') return '';
  const who = a.manager ? firstName(a.manager.display_name) : 'their parent';
  return '<div class="modnote">' + I.shield + '<span>Comments on Rising Star profiles are approved by ' + esc(who) + ' before they go public.</span></div>';
}
