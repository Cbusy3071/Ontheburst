// Full-screen vertical highlights viewer (from the prototype).
import { S } from './state.js';
import { I, esc, fmt, av, toast } from './ui.js';
import { mediaUrl, signPosts } from './media.js';
import * as api from './api.js';
import { managerLine } from './posts.js';
import * as cm from './comments.js';

const viewer = document.getElementById('viewer');
const track = document.getElementById('track');
let current = null, tapT = null, hintShown = false, slideIO = null;
const viewed = new Set();

function slideHTML(p) {
  const a = p.author, on = S.following.has(a.id), mine = S.profiles.some((x) => x.id === a.id);
  const poster = mediaUrl(p.poster_path), src = mediaUrl(p.media_path);
  return '<section class="slide" data-post="' + p.id + '"><div class="stage"><div class="clip">' +
    (poster ? '<img class="bg" alt="" src="' + esc(poster) + '">' : '') +
    '<video playsinline loop preload="metadata"' + (poster ? ' poster="' + esc(poster) + '"' : '') + ' data-src="' + esc(src) + '"></video>' +
    '<div class="shade"></div><div class="flash">' + I.play + '</div>' +
    '<div class="info"><div class="row">' + av(a, 38) + '<span class="nm">' + esc(a.display_name) + '</span>' +
      (mine ? '' : '<button class="follow-v' + (on ? ' on' : '') + '" data-follow="' + a.id + '">' + (on ? 'Following' : 'Follow') + '</button>') + '</div>' +
      '<div class="meta">' + (a.pos ? '<span class="pos">' + esc(a.pos) + '</span>' : '') + esc([a.club_name, a.grade].filter(Boolean).join(' · ')) +
        (a.kind === 'rising_star' ? ' <span class="rs">' + I.star + 'Rising Star</span>' : '') + (a.verified ? I.tick : '') + '</div>' +
      managerLine(a, 'mgr2') +
      (p.caption ? '<div class="cap">' + esc(p.caption) + '</div>' : '') + '</div>' +
    '<div class="prog"><i></i></div></div>' +
    '<div class="rail">' +
      '<button data-vprofile="' + esc(a.handle) + '" aria-label="View profile">' + av(a, 46) + '</button>' +
      '<button data-like="' + p.id + '" class="' + (p.liked ? 'on' : '') + '"><span class="ic">' + I.heartBig + '</span><span class="n">' + fmt(p.like_count) + '</span></button>' +
      '<button data-cmts="' + p.id + '"><span class="ic">' + I.commentBig + '</span><span data-ccount="' + p.id + '">' + fmt(p.comment_count) + '</span></button>' +
      '<button data-save="' + p.id + '" class="' + (p.saved ? 'saved' : '') + '"><span class="ic">' + I.saveBig + '</span><span>Save</span></button>' +
      '<button data-share="' + p.id + '"><span class="ic">' + I.shareBig + '</span><span>Share</span></button>' +
    '</div></div></section>';
}

function heartPop(s, e) {
  const clip = s.querySelector('.clip'), r = clip.getBoundingClientRect(), h = document.createElement('div');
  h.className = 'heart';
  h.innerHTML = I.heartPop;
  h.style.left = (e.clientX - r.left) + 'px';
  h.style.top = (e.clientY - r.top) + 'px';
  clip.appendChild(h);
  setTimeout(() => h.remove(), 850);
}

function ensureSrc(s) {
  if (!s) return;
  const v = s.querySelector('video');
  if (v && !v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src;
}

function activate(s) {
  if (current === s) return;
  if (current) { current.querySelector('video').pause(); current.querySelector('.stage').classList.remove('paused'); }
  current = s;
  ensureSrc(s);
  ensureSrc(s.nextElementSibling);
  const v = s.querySelector('video');
  try { v.currentTime = 0; } catch (_) { /* not loaded yet */ }
  v.muted = S.muted;
  const pr = v.play();
  if (pr && pr.catch) pr.catch(() => { S.muted = true; v.muted = true; syncMute(); v.play().catch(() => {}); });
  const id = s.dataset.post;
  if (cm.sheetPostId() && cm.sheetPostId() !== id) cm.closeSheet();
  if (!viewed.has(id)) {
    viewed.add(id);
    api.recordView(id).then(() => {});
  }
}

export function syncMute() {
  document.getElementById('vMute').innerHTML = S.muted ? I.volOff : I.volOn;
  track.querySelectorAll('video').forEach((v) => { v.muted = S.muted; });
}

function wire() {
  if (slideIO) slideIO.disconnect();
  slideIO = new IntersectionObserver((entries) => {
    if (!S.viewerOpen) return;
    entries.forEach((en) => {
      if (en.isIntersecting && en.intersectionRatio >= 0.6) activate(en.target);
      else en.target.querySelector('video').pause();
    });
  }, { root: track, threshold: [0, 0.6] });
  track.querySelectorAll('.slide').forEach((s) => {
    slideIO.observe(s);
    const v = s.querySelector('video'), bar = s.querySelector('.prog i'), stage = s.querySelector('.stage');
    v.addEventListener('timeupdate', () => { if (v.duration) bar.style.width = (v.currentTime / v.duration * 100) + '%'; });
    v.addEventListener('play', () => stage.classList.remove('paused'));
    v.addEventListener('pause', () => { if (current === s) stage.classList.add('paused'); });
    s.querySelector('.clip').addEventListener('click', (e) => {
      if (e.target.closest('button,.cap')) return;
      if (tapT) {
        clearTimeout(tapT); tapT = null; heartPop(s, e);
        const p = S.posts.get(s.dataset.post);
        if (p && !p.liked) document.dispatchEvent(new CustomEvent('otb:like', { detail: p.id }));
        return;
      }
      tapT = setTimeout(() => { tapT = null; if (v.paused) v.play().catch(() => {}); else v.pause(); }, 240);
    });
    const cap = s.querySelector('.cap');
    if (cap) cap.addEventListener('click', (e) => e.currentTarget.classList.toggle('full'));
  });
}

// Open the viewer on one clip, with the rest of `list` above and below it.
export async function openViewer(list, startId, withComments) {
  const clips = list.filter((p) => p && p.kind === 'clip');
  if (!clips.find((p) => p.id === startId)) {
    const p = S.posts.get(startId);
    if (p) clips.unshift(p);
  }
  if (!clips.length) return;
  await signPosts(clips);
  S.viewerOpen = true;
  document.querySelectorAll('.media video').forEach((v) => v.pause());
  track.innerHTML = clips.map(slideHTML).join('');
  wire();
  viewer.classList.add('open');
  document.body.classList.add('viewing');
  document.body.style.overflow = 'hidden';
  S.muted = false;
  syncMute();
  const s = track.querySelector('.slide[data-post="' + startId + '"]') || track.querySelector('.slide');
  track.style.scrollSnapType = 'none';
  track.scrollTop = s.offsetTop;
  track.style.scrollSnapType = '';
  current = null;
  activate(s);
  if (withComments) cm.openSheet(s.dataset.post);
  const hint = document.getElementById('hint');
  if (!hintShown && clips.length > 1) { hintShown = true; hint.style.opacity = 1; setTimeout(() => { hint.style.opacity = 0; }, 2600); }
  history.pushState({ viewer: 1 }, '');
}

export function closeViewer(fromPop) {
  if (!S.viewerOpen) return;
  cm.closeSheet();
  S.viewerOpen = false;
  track.querySelectorAll('video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
  current = null;
  viewer.classList.remove('open');
  document.body.classList.remove('viewing');
  document.body.style.overflow = '';
  track.innerHTML = '';
  if (!fromPop && history.state && history.state.viewer) history.back();
  setTimeout(() => document.dispatchEvent(new Event('otb:resume')), 60);
}

function step(dir) {
  const slides = Array.from(track.querySelectorAll('.slide')), i = slides.indexOf(current) + dir;
  if (i < 0 || i >= slides.length) { toast(i < 0 ? 'You\'re at the first highlight' : 'You\'re all caught up'); return; }
  track.scrollTo({ top: slides[i].offsetTop, behavior: 'smooth' });
}

document.getElementById('vClose').onclick = () => closeViewer(false);
document.getElementById('vMute').onclick = () => {
  S.muted = !S.muted;
  syncMute();
  if (current && !S.muted) current.querySelector('video').play().catch(() => {});
};
document.getElementById('vUp').onclick = () => step(-1);
document.getElementById('vDown').onclick = () => step(1);
document.getElementById('sheetBg').onclick = cm.closeSheet;
document.getElementById('sheetClose').onclick = cm.closeSheet;
window.addEventListener('popstate', () => { if (S.viewerOpen) closeViewer(true); });
document.addEventListener('keydown', (e) => {
  if (!S.viewerOpen || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'Escape') { if (cm.sheetPostId()) cm.closeSheet(); else closeViewer(false); }
  else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
  else if (e.key === 'm') document.getElementById('vMute').click();
  else if (e.key === ' ') { e.preventDefault(); const v = current && current.querySelector('video'); if (v) { if (v.paused) v.play(); else v.pause(); } }
});
syncMute();
