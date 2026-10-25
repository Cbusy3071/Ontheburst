// Alerts: likes, comments, follows, approvals and club confirmations.
import { S } from '../state.js';
import * as api from '../api.js';
import { esc, av, timeAgo, toast, errMsg, spinner, busy, LOGO_SVG } from '../ui.js';
import { renderPip } from '../shell.js';

function postLabel(post) {
  if (!post) return 'your post';
  const d = post.data || {};
  if (post.kind === 'trial' || post.kind === 'event') return d.title || 'your ' + post.kind;
  if (post.kind === 'clip') return 'your highlight';
  return 'your post';
}

function itemHTML(n) {
  const a = n.actor, name = a ? '<b>' + esc(a.display_name) + '</b>' : '';
  const forWho = n.recipient && !n.recipient.is_primary ? '<span class="for">for ' + esc(n.recipient.display_name.split(' ')[0]) + '</span>' : '';
  const label = esc(postLabel(n.post));
  let text = '', extra = '', href = n.post ? '#/post/' + n.post.id : (a ? '#/u/' + a.handle : '');
  switch (n.type) {
    case 'like': text = name + ' liked ' + label; break;
    case 'comment': text = name + ' commented on ' + label; if (n.comment) extra = '<div class="q">' + esc(n.comment.body) + '</div>'; break;
    case 'comment_pending':
      text = name + ' commented on ' + label + '. Approve it before it goes public.';
      if (n.comment) {
        extra = '<div class="q">' + esc(n.comment.body) + '</div>' + (n.comment.status === 'pending'
          ? '<div class="acts"><button class="btn btn-o btn-sm" data-n-approve="' + n.comment.id + '">Approve</button><button class="btn btn-g btn-sm" data-n-reject="' + n.comment.id + '">Remove</button></div>'
          : '');
      }
      break;
    case 'comment_approved': text = 'Your comment was approved and is now public'; break;
    case 'follow': text = name + ' started following you'; href = a ? '#/u/' + a.handle : ''; break;
    case 'registration': text = name + ' registered interest in ' + label; break;
    case 'registration_confirmed': text = name + ' confirmed your spot at ' + esc((n.post && n.post.data && n.post.data.title) || 'their trial'); break;
    case 'membership_request':
      text = name + ' says they play for you. Confirm them as a registered player?';
      href = a ? '#/u/' + a.handle : '';
      extra = '<div class="acts"><button class="btn btn-o btn-sm" data-n-member="' + (a && a.id) + '" data-ok="1">Confirm</button><button class="btn btn-g btn-sm" data-n-member="' + (a && a.id) + '">Decline</button></div>';
      break;
    case 'membership_confirmed': text = name + ' confirmed you as a registered player'; break;
    case 'verified': text = '<b>Your profile is verified.</b> The tick now shows next to your name.'; href = '#/settings'; break;
    default: text = name + ' interacted with ' + label;
  }
  const icon = a ? av(a, 42) : '<span class="ico">' + LOGO_SVG.replace('width="40" height="40"', 'width="42" height="42"') + '</span>';
  return '<div class="al' + (n.read ? '' : ' unread') + '" data-nid="' + n.id + '">' + icon +
    '<div class="grow">' + (href ? '<a href="' + href + '" class="t" style="display:block">' + text + forWho + '</a>' : '<div class="t">' + text + forWho + '</div>') +
    '<div class="when">' + timeAgo(n.created_at) + '</div>' + extra + '</div></div>';
}

export default async function alertsView(main) {
  main.innerHTML = '<div class="card"><div class="ph ph-row"><div><h1>Alerts</h1><p>Likes, comments, follows and anything waiting on you.</p></div></div><div id="alList">' + spinner() + '</div></div>';
  const list = main.querySelector('#alList');
  let rows = [];
  try { rows = await api.notifications(); } catch (e) { list.innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>'; return; }
  list.innerHTML = rows.length ? rows.map(itemHTML).join('') : '<div class="empty"><b>All quiet</b>When people like, comment or follow, you\'ll see it here.</div>';
  if (rows.some((r) => !r.read)) {
    api.markAllRead().then(() => { S.unread = 0; renderPip(); }).catch(() => {});
  }
  list.addEventListener('click', async (e) => {
    let t;
    if ((t = e.target.closest('[data-n-approve],[data-n-reject]'))) {
      const approve = !!t.dataset.nApprove;
      await busy(t, async () => {
        try {
          await api.moderateComment(t.dataset.nApprove || t.dataset.nReject, approve);
          t.closest('.acts').outerHTML = '<div class="note" style="margin-top:8px">' + (approve ? 'Approved' : 'Removed') + '</div>';
        } catch (ex) { toast(errMsg(ex)); }
      });
    }
    if ((t = e.target.closest('[data-n-member]'))) {
      const ok = !!t.dataset.ok;
      await busy(t, async () => {
        try {
          await api.respondMembership(t.dataset.nMember, ok);
          t.closest('.acts').outerHTML = '<div class="note" style="margin-top:8px">' + (ok ? 'Confirmed as a registered player' : 'Declined') + '</div>';
        } catch (ex) { toast(errMsg(ex)); }
      });
    }
  });
}
