// First-run setup: who you are, date of birth (16+), profile basics.
// Parents then add a Rising Star profile for their child.
import { sb } from '../supabase.js';
import * as api from '../api.js';
import { I, esc, errMsg, LOGO_SVG, POSITIONS, GRADES, randomColor, suggestHandle, $, todayYMD } from '../ui.js';

const full = () => document.getElementById('full');
const KINDS = [
  ['player', 'Player', '16 and over. Post highlights, find trials, build your profile.', I.user],
  ['parent', 'Parent or guardian', 'Run a Rising Star profile for a player under 16.', I.shield],
  ['club', 'Club', 'Post trials, team lists and news. Confirm your registered players.', I.people],
  ['scout', 'Scout', 'Find and follow players. Verified scouts get a badge.', I.eye.replace('stroke="#fff"', 'stroke="currentColor"')],
  ['coach', 'Coach', 'Share sessions, back your players, spot talent.', I.clip],
  ['agent', 'Player agent', 'Follow players and their progress.', I.medal],
  ['fan', 'Supporter', 'Follow your club and the players coming through.', I.heart.replace('width="21" height="21"', 'width="18" height="18"')],
];

function top() {
  return '<div class="ob-top"><span class="logo">' + LOGO_SVG.replace('width="40" height="40"', 'width="34" height="34"') + '<span class="wm" style="color:var(--turf)">On the <b>Burst</b></span></span>' +
    '<button class="linkbtn" data-signout>Sign out</button></div>';
}
function frame(html) {
  document.body.classList.add('full');
  full().innerHTML = '<div class="ob">' + top() + html + '</div>';
}

export function showLockout() {
  frame('<div class="card lock">' + LOGO_SVG.replace('width="40" height="40"', 'width="56" height="56"').replace('<svg', '<svg style="margin:0 auto"') +
    '<div class="disp">You need to be 16 for your own account</div>' +
    '<p class="muted" style="max-width:420px;margin:0 auto">A parent or guardian can sign up with their own email and create a Rising Star profile for you. They\'ll manage it with you, and your highlights still go in the feed.</p>' +
    '<div class="sp"></div><button class="btn btn-t" data-signout>Sign out</button></div>');
}

export function showOnboarding(onDone) {
  let kind = null;
  frame('<div class="steps"><i class="on"></i><i></i></div><h1>Who\'s joining?</h1><p class="muted" style="margin-bottom:18px">Pick the one that fits. You can\'t change it later, so choose carefully.</p>' +
    '<div class="kinds">' + KINDS.map((k) => '<button class="kind" data-kind="' + k[0] + '"><i>' + k[3] + '</i><div><b>' + k[1] + '</b><span>' + k[2] + '</span></div></button>').join('') + '</div>' +
    '<div class="sp"></div><div style="display:flex;justify-content:flex-end"><button class="btn btn-p" id="obNext" disabled>Continue</button></div>');
  full().querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {
    kind = b.dataset.kind;
    full().querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
    $('#obNext').disabled = false;
  });
  $('#obNext').onclick = () => details(kind, onDone);
}

export function clubPicker(prefix) {
  return '<label class="field"><span>Club</span><input class="in" id="' + prefix + 'Club" list="' + prefix + 'ClubList" maxlength="80" placeholder="Start typing your club" autocomplete="off">' +
    '<datalist id="' + prefix + 'ClubList"></datalist><small id="' + prefix + 'ClubHint">Pick your club from the list if it\'s on On the Burst, so it can confirm you.</small></label>';
}
// Wires a club input to search club profiles; returns a getter for {club_id, club_name}.
export function wireClubPicker(prefix, initial) {
  const input = document.getElementById(prefix + 'Club'), list = document.getElementById(prefix + 'ClubList'), hint = document.getElementById(prefix + 'ClubHint');
  let clubs = [], timer;
  if (initial) input.value = initial;
  const match = () => clubs.find((c) => c.display_name.toLowerCase() === input.value.trim().toLowerCase());
  const show = () => {
    const c = match();
    hint.className = c ? 'good' : '';
    hint.textContent = c ? (c.verified ? 'Verified club. ' : '') + c.display_name + ' will be asked to confirm you.' : (input.value.trim() ? 'Not on On the Burst yet. We\'ll show it as text until your club joins.' : 'Pick your club from the list if it\'s on On the Burst, so it can confirm you.');
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { clubs = await api.searchClubs(input.value); } catch (_) { clubs = []; }
      list.innerHTML = clubs.map((c) => '<option value="' + esc(c.display_name) + '">' + esc(c.region || '') + '</option>').join('');
      show();
    }, 200);
  });
  input.addEventListener('change', show);
  api.searchClubs(input.value).then((c) => { clubs = c; list.innerHTML = clubs.map((x) => '<option value="' + esc(x.display_name) + '">' + esc(x.region || '') + '</option>').join(''); if (initial) show(); }).catch(() => {});
  return () => {
    const c = match(), name = input.value.trim();
    return { club_id: c ? c.id : null, club_name: name || null };
  };
}
// Live handle availability check.
export function wireHandle(nameEl, handleEl, hintEl, original) {
  let touched = !!handleEl.value, timer;
  const check = () => {
    clearTimeout(timer);
    const h = handleEl.value.trim().toLowerCase();
    if (h === original) { hintEl.className = ''; hintEl.textContent = 'ontheburst.com/@' + h; return; }
    if (!/^[a-z0-9_]{3,24}$/.test(h)) { hintEl.className = 'bad'; hintEl.textContent = '3 to 24 lowercase letters, numbers or underscores'; return; }
    hintEl.className = ''; hintEl.textContent = 'Checking...';
    timer = setTimeout(async () => {
      try {
        const ok = await api.handleAvailable(h);
        if (handleEl.value.trim().toLowerCase() !== h) return;
        hintEl.className = ok ? 'good' : 'bad';
        hintEl.textContent = ok ? '@' + h + ' is free' : '@' + h + ' is taken';
      } catch (_) { hintEl.textContent = ''; }
    }, 300);
  };
  if (nameEl) nameEl.addEventListener('input', () => { if (!touched) { handleEl.value = suggestHandle(nameEl.value); check(); } });
  handleEl.addEventListener('input', () => { touched = true; handleEl.value = handleEl.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); check(); });
  if (handleEl.value) check();
}

export function playerFields(prefix) {
  return '<div class="grid2"><label class="field"><span>Position</span><select class="in" id="' + prefix + 'Pos"><option value="">Choose</option>' + POSITIONS.map((p) => '<option>' + p + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>Grade</span><input class="in" id="' + prefix + 'Grade" list="gradeList" maxlength="20" placeholder="U18"></label></div>' +
    '<datalist id="gradeList">' + GRADES.map((g) => '<option value="' + esc(g) + '">').join('') + '</datalist>' + clubPicker(prefix);
}

function details(kind, onDone) {
  const isPlayer = kind === 'player', isClub = kind === 'club';
  const role = { scout: 'Scout', coach: 'Coach', agent: 'Player agent' }[kind];
  const maxDob = todayYMD();
  frame('<div class="steps"><i class="on"></i><i class="on"></i></div><h1>' + (isClub ? 'Your club' : 'About you') + '</h1>' +
    '<p class="muted" style="margin-bottom:18px">' + (isClub ? 'Set up your club\'s page. A club official should create this account.' : 'This is what people see on your profile.') + '</p>' +
    '<div class="card"><form class="form" id="obForm" novalidate>' +
      '<label class="field"><span>' + (isClub ? 'Club name' : 'Full name') + '</span><input class="in" id="obName" maxlength="60" autocomplete="' + (isClub ? 'organization' : 'name') + '" required></label>' +
      '<label class="field"><span>Handle</span><input class="in" id="obHandle" maxlength="24" autocapitalize="off" spellcheck="false"><small id="obHandleHint"></small></label>' +
      '<label class="field"><span>' + (isClub ? 'Your date of birth (club official)' : 'Date of birth') + '</span><input class="in" type="date" id="obDob" max="' + maxDob + '" required><small>Kept private. You need to be 16 or older to have an account.</small></label>' +
      (isPlayer ? playerFields('ob') : '') +
      (role ? '<div class="grid2"><label class="field"><span>Title</span><input class="in" id="obPos" maxlength="30" value="' + role + '"></label><label class="field"><span>Club or organisation</span><input class="in" id="obOrg" maxlength="80" placeholder="Optional"></label></div>' : '') +
      (kind === 'fan' ? '<label class="field"><span>Team you follow</span><input class="in" id="obOrg" maxlength="80" placeholder="Optional"></label>' : '') +
      '<label class="field"><span>Area</span><input class="in" id="obRegion" maxlength="60" placeholder="Eastern Suburbs"></label>' +
      '<div class="err" id="obErr" hidden></div>' +
      '<div style="display:flex;justify-content:space-between;gap:10px"><button type="button" class="btn btn-g" id="obBack">Back</button><button class="btn btn-p" type="submit">Create profile</button></div>' +
    '</form></div>');
  wireHandle($('#obName'), $('#obHandle'), $('#obHandleHint'));
  const getClub = isPlayer ? wireClubPicker('ob') : null;
  $('#obBack').onclick = () => showOnboarding(onDone);
  $('#obForm').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#obErr'), btn = e.target.querySelector('[type=submit]');
    err.hidden = true;
    const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const name = v('obName'), handle = v('obHandle'), dob = v('obDob');
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (name.length < 2) return fail('Add your ' + (isClub ? 'club\'s name' : 'name') + '.');
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) return fail('Pick a handle: 3 to 24 lowercase letters, numbers or underscores.');
    if (!dob) return fail('Add your date of birth.');
    const club = getClub ? getClub() : { club_id: null, club_name: v('obOrg') || null };
    btn.disabled = true;
    btn.textContent = 'Setting up...';
    try {
      const r = await api.completeOnboarding({
        p_dob: dob, p_kind: kind, p_display_name: name, p_handle: handle,
        p_pos: isPlayer ? v('obPos') : (role ? v('obPos') : null), p_club_name: club.club_name, p_club_id: club.club_id,
        p_grade: isPlayer ? v('obGrade') : null, p_region: v('obRegion'), p_color: isClub ? '#1E3A8A' : randomColor(),
      });
      if (r.locked) return showLockout();
      onDone(kind);
    } catch (ex) {
      fail(errMsg(ex));
      btn.disabled = false;
      btn.textContent = 'Create profile';
    }
  };
}

// Parent flow: add a child. Used straight after onboarding and from Settings.
export function risingStarForm(prefix) {
  const max = todayYMD();
  return '<form class="form" id="' + prefix + 'Form" novalidate>' +
    '<label class="field"><span>Child\'s full name</span><input class="in" id="' + prefix + 'Name" maxlength="60" required></label>' +
    '<label class="field"><span>Handle</span><input class="in" id="' + prefix + 'Handle" maxlength="24" autocapitalize="off" spellcheck="false"><small id="' + prefix + 'HandleHint"></small></label>' +
    '<label class="field"><span>Date of birth</span><input class="in" type="date" id="' + prefix + 'Dob" max="' + max + '" required><small>Kept private. Rising Stars are under 16.</small></label>' +
    playerFields(prefix) +
    '<label class="check"><input type="checkbox" id="' + prefix + 'Consent">I\'m this child\'s parent or legal guardian. I\'ll manage this profile, and I understand comments on it come to me for approval before anyone else sees them.</label>' +
    '<div class="err" id="' + prefix + 'Err" hidden></div>' +
    '<button class="btn btn-p" type="submit">Create Rising Star profile</button></form>';
}
export function wireRisingStarForm(prefix, onCreated) {
  const g = (s) => document.getElementById(prefix + s);
  wireHandle(g('Name'), g('Handle'), g('HandleHint'));
  const getClub = wireClubPicker(prefix);
  g('Form').onsubmit = async (e) => {
    e.preventDefault();
    const err = g('Err'), btn = e.target.querySelector('[type=submit]');
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    const name = g('Name').value.trim(), handle = g('Handle').value.trim(), dob = g('Dob').value;
    if (name.length < 2) return fail('Add your child\'s name.');
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) return fail('Pick a handle: 3 to 24 lowercase letters, numbers or underscores.');
    if (!dob) return fail('Add their date of birth.');
    if (!g('Consent').checked) return fail('Tick the box to confirm you\'re their parent or guardian.');
    const club = getClub();
    btn.disabled = true;
    try {
      const p = await api.createRisingStar({
        p_display_name: name, p_handle: handle, p_dob: dob, p_pos: g('Pos').value, p_grade: g('Grade').value.trim(),
        p_club_name: club.club_name, p_club_id: club.club_id, p_color: randomColor(),
      });
      onCreated(p);
    } catch (ex) { fail(errMsg(ex)); btn.disabled = false; }
  };
}

export function showAddChild(onDone) {
  frame('<h1>Add your Rising Star</h1><p class="muted" style="margin-bottom:18px">Create a profile for your child. You\'ll post and comment on their behalf, and approve every comment before it goes public.</p>' +
    '<div class="card">' + risingStarForm('rsOb') + '</div><div class="auth-alt"><button class="linkbtn" id="rsSkip">I\'ll do this later</button></div>');
  wireRisingStarForm('rsOb', (p) => onDone(p.id));
  $('#rsSkip').onclick = () => onDone(null);
}

document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-signout]')) return;
  e.preventDefault();
  await sb.auth.signOut();
});
