// Comments: inline under posts and in the viewer's bottom sheet.
import { S } from './state.js';
import * as api from './api.js';
import { I, esc, av, timeAgo, commentTag, toast, errMsg, firstName, plural } from './ui.js';
import { modNote, syncComments } from './posts.js';

const cache = new Map(); // post id -> comments[]

function commentHTML(c, p) {
  const a = c.author || {};
  const mine = S.profiles.some((x) => x.id === c.author_id);
  const ownsPost = S.profiles.some((x) => x.id === p.author_id);
  const pending = c.status === 'pending';
  return '<div class="cmt" data-cid="' + c.id + '">' + av(a, 32, true) + '<div class="bubble">' +
    '<div class="n"><a class="name-link" href="#/u/' + esc(a.handle) + '">' + esc(a.display_name) + '</a>' + (a.verified ? I.tick : '') +
      ((mine || ownsPost) ? '<button class="del" data-cdel="' + c.id + '" data-cpost="' + p.id + '">Delete</button>' : '') +
      (!mine ? '<button class="del" data-creport="' + c.id + '"' + (ownsPost ? ' style="margin-left:8px"' : '') + '>Report</button>' : '') + '</div>' +
    '<div class="t">' + esc(commentTag(a)) + ' · ' + timeAgo(c.created_at) + '</div><p>' + esc(c.body) + '</p>' +
    (pending ? (ownsPost
      ? '<div class="pending">Waiting for your approval</div><div class="acts2"><button data-capprove="' + c.id + '" data-cpost="' + p.id + '">Approve</button><button class="rm" data-creject="' + c.id + '" data-cpost="' + p.id + '">Remove</button></div>'
      : '<div class="pending">Waiting for parent approval</div>') : '') +
    '</div></div>';
}

export function commentsHTML(p, list) {
  if (!list) return '<div class="spin"></div>';
  return modNote(p) + list.map((c) => commentHTML(c, p)).join('') +
    '<div class="cmt-in">' + av(S.me, 32) + '<form data-cform="' + p.id + '"><input placeholder="Add a comment..." aria-label="Add a comment" maxlength="500" autocomplete="off"><button>Post</button></form></div>';
}

let sheetPost = null;
export const sheetPostId = () => sheetPost;

function rerender(postId) {
  const p = S.posts.get(postId);
  if (!p) return;
  const list = cache.get(postId);
  const box = document.querySelector('[data-cmtbox="' + postId + '"]');
  if (box && !box.hidden) box.innerHTML = commentsHTML(p, list);
  if (sheetPost === postId) {
    document.getElementById('sheetBody').innerHTML = commentsHTML(p, list);
    document.getElementById('sheetTitle').textContent = plural(p.comment_count, 'comment');
  }
  syncComments(postId);
}

export async function load(postId) {
  try {
    cache.set(postId, await api.comments(postId));
  } catch (e) {
    cache.set(postId, []);
    toast(errMsg(e));
  }
  rerender(postId);
}

export async function toggleInline(postId, focus) {
  const box = document.querySelector('[data-cmtbox="' + postId + '"]');
  if (!box) return;
  box.hidden = !box.hidden;
  if (box.hidden) return;
  const p = S.posts.get(postId);
  box.innerHTML = commentsHTML(p, cache.get(postId));
  await load(postId);
  if (focus) { const i = box.querySelector('input'); if (i) i.focus(); }
}

export function openSheet(postId) {
  sheetPost = postId;
  const p = S.posts.get(postId);
  document.getElementById('sheetBody').innerHTML = commentsHTML(p, cache.get(postId));
  document.getElementById('sheetTitle').textContent = plural(p.comment_count, 'comment');
  document.getElementById('viewer').classList.add('sheet-open');
  load(postId);
}
export function closeSheet() {
  sheetPost = null;
  document.getElementById('viewer').classList.remove('sheet-open');
}

export async function submit(form) {
  const postId = form.dataset.cform, input = form.querySelector('input'), btn = form.querySelector('button');
  const body = input.value.trim();
  if (!body) return;
  btn.disabled = true;
  try {
    const c = await api.addComment(postId, body);
    input.value = '';
    const list = cache.get(postId) || [];
    list.push(c);
    cache.set(postId, list);
    const p = S.posts.get(postId);
    if (c.status === 'approved') p.comment_count += 1;
    else toast('Sent to ' + (p.author.manager ? firstName(p.author.manager.display_name) : 'their parent') + ' for approval');
    rerender(postId);
    if (sheetPost === postId) { const sb = document.getElementById('sheetBody'); sb.scrollTop = sb.scrollHeight; }
  } catch (e) {
    toast(errMsg(e));
  } finally {
    btn.disabled = false;
  }
}

export async function remove(commentId, postId) {
  const list = cache.get(postId) || [];
  const c = list.find((x) => x.id === commentId);
  try {
    await api.deleteComment(commentId);
    cache.set(postId, list.filter((x) => x.id !== commentId));
    const p = S.posts.get(postId);
    if (p && c && c.status === 'approved') p.comment_count = Math.max(0, p.comment_count - 1);
    rerender(postId);
  } catch (e) { toast(errMsg(e)); }
}

export async function moderate(commentId, postId, approve) {
  try {
    await api.moderateComment(commentId, approve);
    const list = cache.get(postId) || [];
    const p = S.posts.get(postId);
    if (approve) {
      const c = list.find((x) => x.id === commentId);
      if (c) c.status = 'approved';
      if (p) p.comment_count += 1;
      toast('Comment approved');
    } else {
      cache.set(postId, list.filter((x) => x.id !== commentId));
      toast('Comment removed');
    }
    rerender(postId);
  } catch (e) { toast(errMsg(e)); }
}
