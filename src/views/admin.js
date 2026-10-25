// Admin: reports, club verification, verified stats entry.
import { S } from '../state.js';
import * as api from '../api.js';
import { esc, av, toast, errMsg, spinner, timeAgo, busy, todayYMD, subText, $ } from '../ui.js';

export default async function adminView(main) {
  if (!S.isAdmin) { main.innerHTML = '<div class="card empty"><b>Admins only</b></div>'; return; }
  main.innerHTML =
    '<div class="card"><div class="ph"><h1>Admin</h1><p>Moderation and verification. Only accounts in the admins table see this page.</p></div></div>' +
    '<div class="card"><div class="sec-h">Open reports</div><div id="reps" style="padding:0 16px 14px">' + spinner() + '</div></div>' +
    '<div class="card"><div class="sec-h">Clubs waiting on verification</div><div id="clubs" style="padding:0 16px 14px">' + spinner() + '</div></div>' +
    '<div class="card set"><h2>Add a verified stat</h2><p>For results measured at a combine or testing day.</p>' +
      '<form class="form" id="vsf"><div class="grid2"><label class="field"><span>Player handle</span><input class="in" id="vsH" placeholder="lachie_m" required></label>' +
      '<label class="field"><span>Test</span><input class="in" id="vsM" list="vsList" placeholder="40m sprint" required><datalist id="vsList"><option value="40m sprint"><option value="10m sprint"><option value="Vertical jump"><option value="Broad jump"><option value="Yo-yo IR1"><option value="Bench press"><option value="Squat"></datalist></label></div>' +
      '<div class="grid3"><label class="field"><span>Result</span><input class="in" id="vsV" inputmode="decimal" required></label><label class="field"><span>Unit</span><input class="in" id="vsU" placeholder="s" maxlength="10"></label><label class="field"><span>Date</span><input class="in" type="date" id="vsD" value="' + todayYMD() + '"></label></div>' +
      '<label class="field"><span>Event</span><input class="in" id="vsE" placeholder="Eastern Suburbs Combine" maxlength="80"></label>' +
      '<div><button class="btn btn-p" type="submit">Add stat</button></div></form></div>';

  async function loadReports() {
    const el = $('#reps');
    try {
      const rows = await api.openReports();
      el.innerHTML = rows.length ? rows.map((r) => {
        const target = r.post ? '<a class="linkbtn" href="#/post/' + r.post.id + '">Post by ' + esc(r.post.author ? r.post.author.display_name : '?') + '</a>: ' + esc((r.post.caption || '').slice(0, 80))
          : r.profile ? '<a class="linkbtn" href="#/u/' + esc(r.profile.handle) + '">Profile: ' + esc(r.profile.display_name) + '</a>'
          : r.comment ? '<a class="linkbtn" href="#/post/' + r.comment.post_id + '">Comment</a>: ' + esc(r.comment.body.slice(0, 80)) : 'Removed content';
        return '<div class="mp" style="align-items:flex-start"><div class="grow"><b>' + esc(r.reason) + '</b> <span class="small muted">' + timeAgo(r.created_at) + '</span><div class="small" style="margin-top:3px">' + target + '</div>' + (r.details ? '<div class="small muted" style="margin-top:3px">' + esc(r.details) + '</div>' : '') + '</div>' +
          (r.post ? '<button class="btn btn-d btn-sm" data-rmpost="' + r.post.id + '" data-rep="' + r.id + '">Remove post</button>' : '') +
          '<button class="btn btn-g btn-sm" data-resolve="' + r.id + '">Resolve</button></div>';
      }).join('') : '<div class="muted small">No open reports.</div>';
    } catch (e) { el.innerHTML = '<div class="err">' + esc(errMsg(e)) + '</div>'; }
  }
  async function loadClubs() {
    const el = $('#clubs');
    try {
      const rows = await api.unverifiedClubs();
      el.innerHTML = rows.length ? rows.map((c) => '<div class="mp">' + av(c, 40, true) + '<div class="grow"><b>' + esc(c.display_name) + '</b><div class="small muted">@' + esc(c.handle) + ' · ' + esc(subText(c)) + ' · joined ' + timeAgo(c.created_at) + '</div></div><button class="btn btn-o btn-sm" data-verify="' + c.id + '">Verify</button></div>').join('')
        : '<div class="muted small">No clubs waiting. To verify anyone else, open their profile and use the menu.</div>';
    } catch (e) { el.innerHTML = '<div class="err">' + esc(errMsg(e)) + '</div>'; }
  }
  loadReports();
  loadClubs();

  main.addEventListener('click', async (e) => {
    let t;
    if ((t = e.target.closest('[data-resolve]'))) await busy(t, async () => { try { await api.resolveReport(+t.dataset.resolve); loadReports(); } catch (ex) { toast(errMsg(ex)); } });
    if ((t = e.target.closest('[data-rmpost]'))) await busy(t, async () => {
      try { await api.deletePost(t.dataset.rmpost); await api.resolveReport(+t.dataset.rep).catch(() => {}); toast('Post removed'); loadReports(); } catch (ex) { toast(errMsg(ex)); }
    });
    if ((t = e.target.closest('[data-verify]'))) await busy(t, async () => { try { await api.setVerified(t.dataset.verify, true); toast('Club verified'); loadClubs(); } catch (ex) { toast(errMsg(ex)); } });
  });
  $('#vsf').onsubmit = async (e) => {
    e.preventDefault();
    await busy(e.target.querySelector('[type=submit]'), async () => {
      try {
        const p = await api.profileByHandle($('#vsH').value.trim().replace(/^@/, ''));
        if (!p) throw new Error('No profile with that handle.');
        const value = parseFloat($('#vsV').value);
        if (Number.isNaN(value)) throw new Error('Result needs to be a number.');
        await api.addVerifiedStat({ profile_id: p.id, metric: $('#vsM').value.trim(), value, unit: $('#vsU').value.trim() || null, event_name: $('#vsE').value.trim() || null, recorded_on: $('#vsD').value || todayYMD() });
        toast('Added to ' + p.display_name + '\'s profile');
        $('#vsV').value = '';
      } catch (ex) { toast(errMsg(ex)); }
    });
  };
}
