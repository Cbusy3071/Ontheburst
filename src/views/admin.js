// Admin: reports, club verification, verified stats entry.
import { S } from '../state.js';
import * as api from '../api.js';
import { esc, av, toast, errMsg, spinner, timeAgo, busy, todayYMD, subText, badges, suggestHandle, $ } from '../ui.js';

export default async function adminView(main) {
  if (!S.isAdmin) { main.innerHTML = '<div class="card empty"><b>Admins only</b></div>'; return; }
  main.innerHTML =
    '<div class="card"><div class="ph"><h1>Admin</h1><p>Moderation and verification. Only accounts in the admins table see this page.</p></div></div>' +
    '<div class="card"><div class="sec-h">Open reports</div><div id="reps" style="padding:0 16px 14px">' + spinner() + '</div></div>' +
    '<div class="card"><div class="sec-h">Club claims<small>Officials asking to run a listed club</small></div><div id="claims" style="padding:0 16px 14px">' + spinner() + '</div></div>' +
    '<div class="card"><div class="sec-h">Clubs waiting on verification<small>Clubs that signed up themselves</small></div><div id="clubs" style="padding:0 16px 14px">' + spinner() + '</div></div>' +
    '<div class="card set"><h2>Club directory</h2><p>Every listed club. Switch on Partnered when a club partners with On the Burst and the "Not partnered yet" badge disappears.</p>' +
      '<input class="in" id="dirQ" placeholder="Search clubs" autocomplete="off"><div id="dir" style="margin-top:6px"></div>' +
      '<details style="margin-top:14px"><summary class="linkbtn" style="cursor:pointer">Add a club to the directory</summary>' +
      '<form class="form" id="addClub" style="margin-top:12px"><div class="grid2"><label class="field"><span>Club name</span><input class="in" id="acName" maxlength="60" required></label>' +
      '<label class="field"><span>Handle</span><input class="in" id="acHandle" maxlength="24"></label></div>' +
      '<div class="grid2"><label class="field"><span>District or area</span><input class="in" id="acRegion" maxlength="60" placeholder="Eastern Suburbs"></label>' +
      '<label class="field"><span>Level</span><select class="in" id="acTier"><option value="junior">Junior club</option><option value="senior">Senior club</option><option value="nrl">NRL club</option></select></label></div>' +
      '<div><button class="btn btn-p btn-sm" type="submit">Add club</button></div></form></details></div>' +
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
  async function loadClaims() {
    const el = $('#claims');
    try {
      const rows = await api.adminClaims();
      el.innerHTML = rows.length ? rows.map((c) => '<div class="mp" style="align-items:flex-start"><div class="grow"><b>' + esc(c.contact_name) + '</b> <span class="small muted">' + esc(c.role) + ' · ' + esc(c.user_email) + ' · ' + timeAgo(c.created_at) + '</span>' +
        '<div class="small" style="margin-top:3px">Wants to run <a class="linkbtn" href="#/u/' + esc(c.club_handle) + '">' + esc(c.club_name) + '</a></div>' +
        (c.note ? '<div class="small muted" style="margin-top:3px">' + esc(c.note) + '</div>' : '') + '</div>' +
        '<button class="btn btn-o btn-sm" data-claim-ok="' + c.id + '">Approve</button><button class="btn btn-g btn-sm" data-claim-no="' + c.id + '">Reject</button></div>').join('')
        : '<div class="muted small">No claims waiting.</div>';
    } catch (e) { el.innerHTML = '<div class="err">' + esc(errMsg(e)) + '</div>'; }
  }
  let dirTimer, dirRows = [];
  async function loadDir() {
    const el = $('#dir'), q = $('#dirQ').value.trim();
    try {
      dirRows = await api.searchClubs(q, { limit: 40 });
      if ($('#dirQ').value.trim() !== q) return;
      el.innerHTML = dirRows.length ? dirRows.map((c) => '<div class="dir-row">' + av(c, 38, true) + '<div class="grow"><div style="font-weight:700;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><a class="name-link" href="#/u/' + esc(c.handle) + '">' + esc(c.display_name) + '</a>' + badges(c) + '</div>' +
        '<div class="small muted">' + esc(subText(c)) + ' · ' + (c.owner_id ? 'Run by the club' : 'Unclaimed') + '</div></div>' +
        '<span class="small muted">Partnered</span><button class="switch' + (c.partnered ? ' on' : '') + '" data-partner="' + c.id + '" role="switch" aria-checked="' + !!c.partnered + '" aria-label="Partnered"></button></div>').join('')
        : '<div class="muted small" style="padding:8px 0">No clubs match.</div>';
    } catch (e) { el.innerHTML = '<div class="err">' + esc(errMsg(e)) + '</div>'; }
  }
  $('#dirQ').oninput = () => { clearTimeout(dirTimer); dirTimer = setTimeout(loadDir, 200); };
  $('#acName').oninput = () => { $('#acHandle').value = suggestHandle($('#acName').value).slice(0, 24); };
  $('#addClub').onsubmit = (e) => {
    e.preventDefault();
    busy(e.target.querySelector('[type=submit]'), async () => {
      try {
        const c = await api.addClub({ p_name: $('#acName').value.trim(), p_handle: $('#acHandle').value.trim(), p_region: $('#acRegion').value.trim(), p_tier: $('#acTier').value });
        toast(c.display_name + ' added');
        e.target.reset();
        $('#dirQ').value = c.display_name;
        loadDir();
      } catch (ex) { toast(errMsg(ex)); }
    });
  };

  loadReports();
  loadClaims();
  loadClubs();
  loadDir();

  const onClick = async (e) => {
    let t;
    if ((t = e.target.closest('[data-resolve]'))) await busy(t, async () => { try { await api.resolveReport(+t.dataset.resolve); loadReports(); } catch (ex) { toast(errMsg(ex)); } });
    if ((t = e.target.closest('[data-rmpost]'))) await busy(t, async () => {
      try { await api.deletePost(t.dataset.rmpost); await api.resolveReport(+t.dataset.rep).catch(() => {}); toast('Post removed'); loadReports(); } catch (ex) { toast(errMsg(ex)); }
    });
    if ((t = e.target.closest('[data-claim-ok],[data-claim-no]'))) {
      const okk = !!t.dataset.claimOk;
      await busy(t, async () => { try { await api.reviewClaim(+(t.dataset.claimOk || t.dataset.claimNo), okk); toast(okk ? 'Approved. They now run the club page.' : 'Claim rejected'); loadClaims(); loadDir(); } catch (ex) { toast(errMsg(ex)); } });
    }
    if ((t = e.target.closest('[data-partner]'))) {
      const c = dirRows.find((x) => x.id === t.dataset.partner), next = !t.classList.contains('on');
      t.classList.toggle('on', next);
      try { await api.setPartnered(t.dataset.partner, next); if (c) c.partnered = next; toast((c ? c.display_name : 'Club') + (next ? ' marked as partnered' : ' marked as not partnered')); loadDir(); }
      catch (ex) { t.classList.toggle('on', !next); toast(errMsg(ex)); }
    }
    if ((t = e.target.closest('[data-verify]'))) await busy(t, async () => { try { await api.setVerified(t.dataset.verify, true); toast('Club verified'); loadClubs(); } catch (ex) { toast(errMsg(ex)); } });
  };
  main.addEventListener('click', onClick);
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
  return () => main.removeEventListener('click', onClick);
}
