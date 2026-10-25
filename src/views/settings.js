// Settings: edit the acting profile, manage Rising Stars, club confirmations, account.
import { sb } from '../supabase.js';
import { S, primary, isPlayerKind } from '../state.js';
import * as api from '../api.js';
import { I, esc, av, toast, errMsg, COLORS, openModal, confirmDialog, subText, busy, $ } from '../ui.js';
import { uploadAvatar, avatarPathFromUrl, removeAllUserFiles } from '../media.js';
import { playerFields, wireClubPicker, wireHandle, risingStarForm, wireRisingStarForm } from './onboarding.js';

export default function settingsView(main, { refresh, switchTo }) {
  const p = S.me, prim = primary();
  const player = isPlayerKind(p.kind), role = ['scout', 'coach', 'agent'].includes(p.kind);
  const isParent = prim && prim.kind === 'parent';
  const managed = S.profiles.filter((x) => x.kind === 'rising_star');

  main.innerHTML =
    '<div class="card set"><h2>Edit profile</h2><p>' + (p.is_primary ? 'Your public profile.' : 'You\'re editing ' + esc(p.display_name) + '\'s Rising Star profile.') + '</p>' +
    '<form class="form" id="pf" novalidate>' +
      '<div class="av-edit"><span id="avPrev">' + av(p, 72) + '</span><div><input type="file" id="avFile" accept="image/jpeg,image/png,image/webp" hidden>' +
        '<button type="button" class="btn btn-g btn-sm" id="avBtn">' + I.camera + (p.avatar_url ? 'Change photo' : 'Add photo') + '</button>' +
        (p.avatar_url ? ' <button type="button" class="btn btn-g btn-sm" id="avRm">Remove</button>' : '') +
        '<p class="hint-t" style="margin-top:6px">' + (p.kind === 'club' ? 'Square club logo works best.' : 'A clear photo of your face. Square works best.') + '</p></div></div>' +
      '<div class="grid2"><label class="field"><span>' + (p.kind === 'club' ? 'Club name' : 'Name') + '</span><input class="in" id="pfName" maxlength="60" value="' + esc(p.display_name) + '"></label>' +
      '<label class="field"><span>Handle</span><input class="in" id="pfHandle" maxlength="24" value="' + esc(p.handle) + '" autocapitalize="off" spellcheck="false"><small id="pfHandleHint"></small></label></div>' +
      (player ? playerFields('pf') + '<label class="field"><span>Jersey number</span><input class="in" id="pfJersey" inputmode="numeric" maxlength="2" value="' + esc(p.jersey || '') + '" style="max-width:120px"></label>' : '') +
      (role ? '<div class="grid2"><label class="field"><span>Title</span><input class="in" id="pfPos" maxlength="30" value="' + esc(p.pos || '') + '"></label><label class="field"><span>Club or organisation</span><input class="in" id="pfOrg" maxlength="80" value="' + esc(p.club_name || '') + '"></label></div>' : '') +
      (p.kind === 'fan' ? '<label class="field"><span>Team you follow</span><input class="in" id="pfOrg" maxlength="80" value="' + esc(p.club_name || '') + '"></label>' : '') +
      '<label class="field"><span>Area</span><input class="in" id="pfRegion" maxlength="60" value="' + esc(p.region || '') + '" placeholder="Eastern Suburbs"></label>' +
      '<label class="field"><span>Bio</span><textarea class="in" id="pfBio" maxlength="400" rows="3" placeholder="' + (player ? 'Strong defender, quick off the line. Looking for SG Ball trials in 2027.' : '') + '">' + esc(p.bio || '') + '</textarea></label>' +
      '<div class="field"><span>Profile colour</span><div class="swatches" id="pfColor">' + COLORS.map((c) => '<button type="button" data-c="' + c + '" style="background:' + c + '" class="' + (c.toLowerCase() === (p.color || '').toLowerCase() ? 'on' : '') + '" aria-label="Colour ' + c + '"></button>').join('') + '</div></div>' +
      '<div class="err" id="pfErr" hidden></div>' +
      '<div><button class="btn btn-p" type="submit">Save changes</button></div>' +
    '</form></div>' +

    (p.kind === 'club' ? '<div class="card set"><h2>Player confirmations</h2><p>Players who say they\'re registered with ' + esc(p.display_name) + '. Confirming adds a "Registered player" badge to their profile.</p><div id="members"><div class="spin"></div></div></div>' : '') +

    (isParent ? '<div class="card set"><h2>Rising Stars</h2><p>Profiles you manage for players under 16. Switch to one to post, like and comment as them.</p>' +
      (managed.length ? managed.map((m) => '<div class="mp">' + av(m, 40) + '<div class="grow"><b>' + esc(m.display_name) + '</b><div class="small muted">@' + esc(m.handle) + ' · ' + esc(subText(m)) + '</div></div>' +
        (m.id === p.id ? '<span class="badge-c ok">' + I.check + 'Acting</span>' : '<button class="btn btn-o btn-sm" data-act-as="' + m.id + '">Act as</button>') +
        '<button class="iconbtn" data-rm-rs="' + m.id + '" aria-label="Delete profile">' + I.trash + '</button></div>').join('') : '<div class="muted small" style="padding:6px 0 4px">No Rising Star profiles yet.</div>') +
      '<div style="margin-top:12px"><button class="btn btn-p btn-sm" id="addRs">' + I.plus + 'Add a Rising Star</button></div></div>' : '') +

    '<div class="card set"><h2>Account</h2><p>Signed in as <b>' + esc(S.user.email) + '</b>.</p>' +
      '<form class="form" id="pwf"><label class="field"><span>New password</span><input class="in" type="password" id="pw1" minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>' +
      '<div><button class="btn btn-g btn-sm" type="submit">Change password</button></div></form>' +
      '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn btn-g btn-sm" data-signout>' + I.out + 'Sign out</button></div></div>' +

    '<div class="card set danger-zone"><h2>Delete account</h2><p>Deletes your account, ' + (managed.length ? 'every Rising Star profile you manage, ' : '') + 'your posts, clips, comments and likes. This can\'t be undone.</p>' +
      '<button class="btn btn-d btn-sm" id="delAcct">Delete my account</button></div>';

  /* ---- profile form ---- */
  let color = p.color, avatarUrl = p.avatar_url;
  wireHandle(null, $('#pfHandle'), $('#pfHandleHint'), p.handle);
  let getClub = null;
  if (player) {
    const pos = $('#pfPos'); if (pos) pos.value = p.pos || '';
    $('#pfGrade').value = p.grade || '';
    getClub = wireClubPicker('pf', p.club_name || '');
  }
  $('#pfColor').onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    color = b.dataset.c;
    main.querySelectorAll('#pfColor button').forEach((x) => x.classList.toggle('on', x === b));
    if (!avatarUrl) $('#avPrev').firstChild.style.background = color;
  };
  $('#avBtn').onclick = () => $('#avFile').click();
  $('#avFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 15 * 1048576) return toast('That image is too big. Use one under 15 MB.');
    await busy($('#avBtn'), async () => {
      try {
        const old = avatarUrl;
        const fresh = await uploadAvatar(S.user.id, p.id, f);
        if (!(await save({ avatar_url: fresh }, true))) return;
        avatarUrl = fresh;
        $('#avPrev').innerHTML = av(S.me, 72);
        const op = avatarPathFromUrl(old);
        if (op) sb.storage.from('avatars').remove([op]).catch(() => {});
        toast('Photo updated');
      } catch (ex) { toast(errMsg(ex)); }
    }, 'Uploading...');
  };
  const rm = $('#avRm');
  if (rm) rm.onclick = async () => {
    const op = avatarPathFromUrl(avatarUrl);
    if (!(await save({ avatar_url: null }, true))) return;
    avatarUrl = null;
    $('#avPrev').innerHTML = av(S.me, 72);
    if (op) sb.storage.from('avatars').remove([op]).catch(() => {});
    toast('Photo removed');
  };

  async function save(patch, quiet) {
    try {
      const updated = await api.updateProfile(p.id, patch);
      const i = S.profiles.findIndex((x) => x.id === p.id);
      S.profiles[i] = Object.assign(S.profiles[i], updated);
      S.me = S.profiles[i];
      if (!quiet) toast('Profile saved');
      refresh();
      return true;
    } catch (ex) {
      const e = $('#pfErr');
      if (e) { e.textContent = errMsg(ex); e.hidden = false; }
      else toast(errMsg(ex));
      return false;
    }
  }
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    $('#pfErr').hidden = true;
    const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const patch = { display_name: v('pfName'), handle: v('pfHandle').toLowerCase(), region: v('pfRegion') || null, bio: v('pfBio') || null, color };
    if (patch.display_name.length < 2) { $('#pfErr').textContent = 'Add a name.'; $('#pfErr').hidden = false; return; }
    if (player) {
      const c = getClub();
      Object.assign(patch, { pos: v('pfPos') || null, grade: v('pfGrade') || null, jersey: v('pfJersey').replace(/\D/g, '') || null, club_id: c.club_id, club_name: c.club_name });
    }
    if (role) Object.assign(patch, { pos: v('pfPos') || null, club_name: v('pfOrg') || null });
    if (p.kind === 'fan') patch.club_name = v('pfOrg') || null;
    await busy(e.target.querySelector('[type=submit]'), () => save(patch), 'Saving...');
  };

  /* ---- club confirmations ---- */
  if (p.kind === 'club') loadMembers();
  async function loadMembers() {
    const el = $('#members');
    try {
      const rows = await api.pendingMembers(p.id);
      el.innerHTML = rows.length ? rows.map((m) => '<div class="mp">' + av(m, 40, true) + '<div class="grow"><b>' + esc(m.display_name) + '</b><div class="small muted">' + esc(subText(m)) + '</div></div>' +
        '<button class="btn btn-o btn-sm" data-member="' + m.id + '" data-ok="1">Confirm</button><button class="btn btn-g btn-sm" data-member="' + m.id + '">Decline</button></div>').join('')
        : '<div class="muted small">No one waiting. When players link ' + esc(p.display_name) + ' on their profile, they show up here.</div>';
    } catch (ex) { el.innerHTML = '<div class="err">' + esc(errMsg(ex)) + '</div>'; }
  }

  /* ---- parent tools ---- */
  const add = $('#addRs');
  if (add) add.onclick = () => {
    const m = openModal({ title: 'Add a Rising Star', wide: true, body: '<p class="muted small" style="margin-bottom:14px">For players under 16. You\'ll manage the profile and approve every comment before it goes public.</p>' + risingStarForm('rsSet') });
    wireRisingStarForm('rsSet', async (np) => {
      m.close();
      await api.loadAccount();
      toast(np.display_name + '\'s profile is ready');
      switchTo(np.id);
    });
  };

  main.addEventListener('click', async (e) => {
    let t;
    if ((t = e.target.closest('[data-act-as]'))) { switchTo(t.dataset.actAs); return; }
    if ((t = e.target.closest('[data-rm-rs]'))) {
      const rs = S.profiles.find((x) => x.id === t.dataset.rmRs);
      if (!(await confirmDialog({ title: 'Delete ' + rs.display_name + '\'s profile?', text: 'Their posts, clips and comments are deleted too. This can\'t be undone.', ok: 'Delete', danger: true }))) return;
      try {
        await api.deleteProfile(rs.id);
        await api.loadAccount();
        toast('Profile deleted');
        switchTo(primary().id);
      } catch (ex) { toast(errMsg(ex)); }
      return;
    }
    if ((t = e.target.closest('[data-member]'))) {
      await busy(t, async () => {
        try { await api.respondMembership(t.dataset.member, !!t.dataset.ok); toast(t.dataset.ok ? 'Player confirmed' : 'Request declined'); loadMembers(); } catch (ex) { toast(errMsg(ex)); }
      });
    }
  });

  /* ---- account ---- */
  $('#pwf').onsubmit = async (e) => {
    e.preventDefault();
    const pw = $('#pw1').value;
    if (pw.length < 8) return toast('Use at least 8 characters.');
    await busy(e.target.querySelector('button'), async () => {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) toast(errMsg(error)); else { $('#pw1').value = ''; toast('Password changed'); }
    });
  };
  $('#delAcct').onclick = () => {
    const m = openModal({
      title: 'Delete account',
      body: '<p class="muted" style="font-size:14px;margin-bottom:12px">Everything you\'ve posted is removed for good. Type <b>DELETE</b> to confirm.</p><input class="in" id="delConf" autocomplete="off">',
      foot: '<button class="btn btn-g" data-cancel>Cancel</button><button class="btn btn-d" data-go disabled>Delete forever</button>',
    });
    const go = m.el.querySelector('[data-go]');
    m.el.querySelector('#delConf').oninput = (e) => { go.disabled = e.target.value.trim() !== 'DELETE'; };
    m.el.querySelector('[data-cancel]').onclick = m.close;
    go.onclick = () => busy(go, async () => {
      try {
        await removeAllUserFiles(S.user.id);
        await api.deleteMyAccount();
        await sb.auth.signOut({ scope: 'local' });
        m.close();
      } catch (ex) { toast(errMsg(ex)); }
    }, 'Deleting...');
  };
}
