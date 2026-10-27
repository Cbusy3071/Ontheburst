// One delegated click handler for everything you can do to a post or profile.
import { S } from './state.js';
import * as api from './api.js';
import { I, esc, av, toast, errMsg, openModal, openMenu, confirmDialog, subText, extractTags, richText, $$, busy, firstName } from './ui.js';
import { syncLike, syncSave, syncFollow, syncReg, removePostEverywhere } from './posts.js';
import { removeMedia, mediaUrl } from './media.js';
import * as cm from './comments.js';
import { openViewer, closeViewer } from './viewer.js';

export const postLink = (id) => location.origin + location.pathname + '#/post/' + id;
export const profileLink = (h) => location.origin + location.pathname + '#/u/' + h;

async function share(url, title) {
  try {
    if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ title, url }); return; }
  } catch (_) { return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (_) { prompt('Copy this link', url); }
}

async function toggleLike(id) {
  const p = S.posts.get(id);
  if (!p) return;
  const was = p.liked;
  p.liked = !was;
  p.like_count += was ? -1 : 1;
  syncLike(id);
  try { await (was ? api.unlike(id) : api.like(id)); } catch (e) {
    p.liked = was; p.like_count += was ? 1 : -1; syncLike(id); toast(errMsg(e));
  }
}
document.addEventListener('otb:like', (e) => toggleLike(e.detail));

async function toggleSave(id) {
  const p = S.posts.get(id);
  if (!p) return;
  const was = p.saved;
  p.saved = !was;
  syncSave(id);
  try { await (was ? api.unsave(id) : api.save(id)); toast(was ? 'Removed from saved' : 'Saved'); } catch (e) {
    p.saved = was; syncSave(id); toast(errMsg(e));
  }
}

export async function toggleFollow(pid) {
  const was = S.following.has(pid);
  if (was) S.following.delete(pid); else S.following.add(pid);
  syncFollow(pid);
  document.dispatchEvent(new CustomEvent('otb:follow', { detail: { id: pid, on: !was } }));
  try { await (was ? api.unfollow(pid) : api.follow(pid)); } catch (e) {
    if (was) S.following.add(pid); else S.following.delete(pid);
    syncFollow(pid);
    document.dispatchEvent(new CustomEvent('otb:follow', { detail: { id: pid, on: was } }));
    toast(errMsg(e));
  }
}

async function toggleRegister(id, btn) {
  const p = S.posts.get(id);
  if (!p) return;
  if (p.reg === 'confirmed' && !(await confirmDialog({ title: 'Withdraw?', text: 'Your spot is confirmed. Withdrawing tells the club you\'re no longer coming.', ok: 'Withdraw', danger: true }))) return;
  const was = p.reg;
  await busy(btn, async () => {
    try {
      if (was) { await api.unregister(id); p.reg = null; p.registration_count = Math.max(0, p.registration_count - 1); }
      else { await api.register(id); p.reg = 'interested'; p.registration_count += 1; }
      if (!was) toast(p.kind === 'trial' ? 'Sent to ' + p.author.display_name + ' to confirm your spot' : 'You\'re on the list. We\'ll keep you posted.');
    } catch (e) { toast(errMsg(e)); }
  });
  syncReg(id);
}

export function reportDialog(target, label) {
  const reasons = ['Inappropriate content', 'Bullying or harassment', 'Concern about a young player\'s safety', 'Impersonation or fake profile', 'Spam or scam', 'Something else'];
  const m = openModal({
    title: 'Report ' + label,
    body: '<form class="form" id="repForm"><p class="muted small">Reports go to the On the Burst team and are kept private. If someone is in danger, call 000.</p>' +
      reasons.map((r, i) => '<label class="check"><input type="radio" name="r" value="' + esc(r) + '"' + (i === 0 ? ' checked' : '') + '>' + esc(r) + '</label>').join('') +
      '<label class="field"><span>Anything else we should know?</span><textarea class="in" name="d" maxlength="1000" placeholder="Optional"></textarea></label></form>',
    foot: '<button class="btn btn-g" data-cancel>Cancel</button><button class="btn btn-p" data-send>Send report</button>',
  });
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('[data-send]').onclick = (e) => busy(e.currentTarget, async () => {
    const f = m.el.querySelector('#repForm');
    try {
      await api.report(Object.assign({ reason: f.r.value, details: f.d.value.trim() || null }, target));
      m.close();
      toast('Thanks. We\'ll take a look.');
    } catch (err) { toast(errMsg(err)); }
  });
}

function editCaption(p) {
  const m = openModal({
    title: 'Edit caption',
    body: '<textarea class="in" id="capEdit" maxlength="2000" rows="5">' + esc(p.caption) + '</textarea><p class="hint-t" style="margin-top:6px">Add #hashtags so people can find it.</p>',
    foot: '<button class="btn btn-g" data-cancel>Cancel</button><button class="btn btn-p" data-ok>Save</button>',
  });
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('[data-ok]').onclick = (e) => busy(e.currentTarget, async () => {
    const caption = m.el.querySelector('#capEdit').value.trim();
    try {
      const r = await api.updateCaption(p.id, caption, extractTags(caption));
      Object.assign(p, r);
      $$('[data-caption="' + p.id + '"]').forEach((el) => { el.innerHTML = richText(p.caption); });
      m.close();
      toast('Caption updated');
    } catch (err) { toast(errMsg(err)); }
  });
}

async function deletePost(p) {
  if (!(await confirmDialog({ title: 'Delete post?', text: 'This removes the post, its likes and comments. You can\'t undo it.', ok: 'Delete', danger: true }))) return;
  try {
    await api.deletePost(p.id);
    removeMedia([p.media_path, p.poster_path].concat(p.image_paths || [])).catch(() => {});
    if (S.viewerOpen) closeViewer(false);
    removePostEverywhere(p.id);
    toast('Post deleted');
  } catch (e) { toast(errMsg(e)); }
}

// Block a profile: hide everything of theirs that's on screen.
export async function blockFlow(profile) {
  const ok = await confirmDialog({
    title: 'Block ' + profile.display_name + '?',
    text: 'You won\'t see each other\'s posts or comments, and they can\'t follow you, like or comment on your posts. They aren\'t told. You can unblock them from their profile or Settings.',
    ok: 'Block', danger: true,
  });
  if (!ok) return false;
  try {
    await api.blockProfile(profile.id);
    S.blocked.add(profile.id);
    S.following.delete(profile.id);
    $$('.post[data-author="' + profile.id + '"]').forEach((el) => el.remove());
    S.posts.forEach((p, pid) => { if (p.author_id === profile.id) removePostEverywhere(pid); });
    toast(profile.display_name + ' is blocked');
    return true;
  } catch (e) { toast(errMsg(e)); return false; }
}

function postMenu(btn, id) {
  const p = S.posts.get(id);
  if (!p) return;
  const mine = S.profiles.some((x) => x.id === p.author_id);
  let html = '<button data-act="copy">' + I.link + 'Copy link</button>';
  if (mine) html += '<button data-act="edit">' + I.edit + 'Edit caption</button><hr><button data-act="delete" class="danger">' + I.trash + 'Delete post</button>';
  else {
    html += '<button data-act="report">' + I.flag + 'Report post</button>' +
      '<button data-act="block" class="danger">' + I.x.replace('width="18" height="18"', 'width="16" height="16"') + 'Block ' + esc(firstName(p.author.display_name)) + '</button>';
    if (S.isAdmin) html += '<hr><button data-act="delete" class="danger">' + I.trash + 'Remove post (admin)</button>';
  }
  openMenu(btn, html, (act) => {
    if (act === 'copy') navigator.clipboard.writeText(postLink(id)).then(() => toast('Link copied'), () => prompt('Copy this link', postLink(id)));
    if (act === 'edit') editCaption(p);
    if (act === 'delete') deletePost(p);
    if (act === 'report') reportDialog({ post_id: id }, 'post');
    if (act === 'block') blockFlow(p.author);
  });
}

async function showRegistrations(postId) {
  const p = S.posts.get(postId);
  const m = openModal({ title: (p && p.data && p.data.title) || 'Registrations', body: '<div class="spin"></div>' });
  try {
    const rows = await api.registrationsFor(postId);
    if (!rows.length) { m.body.innerHTML = '<div class="empty"><b>No one yet</b>Players who register interest will show up here.</div>'; return; }
    const render = () => {
      m.body.innerHTML = '<p class="muted small" style="margin-bottom:6px">' + rows.length + ' registered. Confirm a spot and the player gets a notification.</p><div class="reg-list">' +
        rows.map((r) => {
          const a = r.profile;
          return '<div class="rr-item" style="padding:10px 0">' + av(a, 40, true) + '<div class="grow"><div class="t1"><a class="name-link" href="#/u/' + esc(a.handle) + '">' + esc(a.display_name) + '</a>' + (a.kind === 'rising_star' ? '<span class="rs">' + I.star + 'Rising Star</span>' : '') + '</div><div class="t2">' + esc(subText(a)) + '</div></div>' +
            (r.status === 'confirmed' ? '<span class="badge-c ok">' + I.check + 'Confirmed</span>' : '<button class="btn btn-o btn-sm" data-confirm-reg="' + a.id + '">Confirm</button>') + '</div>';
        }).join('') + '</div>';
    };
    render();
    m.body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-confirm-reg]');
      if (b) {
        await busy(b, async () => {
          try {
            await api.confirmRegistration(postId, b.dataset.confirmReg);
            rows.find((r) => r.profile.id === b.dataset.confirmReg).status = 'confirmed';
            toast('Spot confirmed');
          } catch (err) { toast(errMsg(err)); }
        });
        render();
      }
      if (e.target.closest('a')) m.close();
    });
  } catch (e) { m.body.innerHTML = '<div class="err">' + esc(errMsg(e)) + '</div>'; }
}

function viewList(el) {
  const container = el.closest('[data-viewlist]') || document.getElementById('main');
  const ids = Array.from(new Set($$('[data-open]', container).map((x) => x.dataset.open)));
  return ids.map((id) => S.posts.get(id)).filter(Boolean);
}

function openPhoto(postId, idx) {
  const p = S.posts.get(postId);
  if (!p) return;
  const urls = (p.image_paths || []).map(mediaUrl).filter(Boolean);
  let i = idx;
  const m = openModal({ title: p.author.display_name, wide: true, body: '<div class="lightbox"><img alt="" id="lbImg"></div>' + (urls.length > 1 ? '<div class="lb-nav"><button class="btn btn-g btn-sm" data-lb="-1">Previous</button><span class="small muted" id="lbN"></span><button class="btn btn-g btn-sm" data-lb="1">Next</button></div>' : '') });
  const show = () => {
    m.el.querySelector('#lbImg').src = urls[i];
    const n = m.el.querySelector('#lbN');
    if (n) n.textContent = (i + 1) + ' of ' + urls.length;
  };
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-lb]'); if (b) { i = (i + +b.dataset.lb + urls.length) % urls.length; show(); } });
  show();
}

document.addEventListener('click', (e) => {
  let t;
  if ((t = e.target.closest('[data-photo]'))) { openPhoto(t.dataset.photo, +t.dataset.idx); return; }
  if ((t = e.target.closest('[data-open]'))) { e.preventDefault(); openViewer(viewList(t), t.dataset.open); return; }
  if ((t = e.target.closest('[data-like]'))) { toggleLike(t.dataset.like); return; }
  if ((t = e.target.closest('[data-save]'))) { toggleSave(t.dataset.save); return; }
  if ((t = e.target.closest('[data-share]'))) { const p = S.posts.get(t.dataset.share); share(postLink(t.dataset.share), p ? p.author.display_name + ' on On the Burst' : 'On the Burst'); return; }
  if ((t = e.target.closest('[data-follow]'))) { e.preventDefault(); toggleFollow(t.dataset.follow); return; }
  if ((t = e.target.closest('[data-vprofile]'))) { const h = t.dataset.vprofile; closeViewer(false); setTimeout(() => { location.hash = '#/u/' + h; }, 50); return; }
  if ((t = e.target.closest('[data-register]'))) { toggleRegister(t.dataset.register, t); return; }
  if ((t = e.target.closest('[data-regs]'))) { showRegistrations(t.dataset.regs); return; }
  if ((t = e.target.closest('[data-more]'))) { postMenu(t, t.dataset.more); return; }
  if ((t = e.target.closest('[data-cdel]'))) { confirmDialog({ title: 'Delete comment?', text: 'This can\'t be undone.', ok: 'Delete', danger: true }).then((y) => y && cm.remove(t.dataset.cdel, t.dataset.cpost)); return; }
  if ((t = e.target.closest('[data-creport]'))) { reportDialog({ comment_id: t.dataset.creport }, 'comment'); return; }
  if ((t = e.target.closest('[data-capprove]'))) { cm.moderate(t.dataset.capprove, t.dataset.cpost, true); return; }
  if ((t = e.target.closest('[data-creject]'))) { cm.moderate(t.dataset.creject, t.dataset.cpost, false); return; }
  if ((t = e.target.closest('[data-cmts]'))) {
    const id = t.dataset.cmts;
    if (S.viewerOpen) { if (cm.sheetPostId() === id) cm.closeSheet(); else cm.openSheet(id); return; }
    cm.toggleInline(id, !!t.closest('.post-acts'));
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-cform]');
  if (!f) return;
  e.preventDefault();
  cm.submit(f);
});

/* ---------- inline autoplay in the feed ---------- */
const viewedInline = new Set();
const feedIO = new IntersectionObserver((entries) => {
  if (S.viewerOpen) return;
  entries.forEach((en) => {
    const v = en.target.querySelector('video');
    if (!v) return;
    if (en.isIntersecting && en.intersectionRatio >= 0.6) v.play().catch(() => {});
    else v.pause();
  });
}, { threshold: [0, 0.6] });
export function observeMedia(root) {
  $$('.media', root).forEach((m) => {
    if (m.dataset.obs) return;
    m.dataset.obs = '1';
    feedIO.observe(m);
    const v = m.querySelector('video');
    if (v) v.addEventListener('timeupdate', () => {
      const id = v.dataset.post;
      if (v.currentTime > 3 && !viewedInline.has(id)) {
        viewedInline.add(id);
        api.recordView(id).then(() => {});
      }
    });
  });
}
export function resumeFeed() {
  $$('.media').forEach((m) => {
    const r = m.getBoundingClientRect(), vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0), v = m.querySelector('video');
    if (!v) return;
    if (r.height && vis > r.height * 0.6) v.play().catch(() => {}); else v.pause();
  });
}
document.addEventListener('otb:resume', resumeFeed);
export const greet = () => (S.me ? firstName(S.me.display_name) : '');
