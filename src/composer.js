// Create-a-post modal: highlights (video upload), updates, milestones,
// stats, and for clubs: trials, team lists and events.
import { S } from './state.js';
import * as api from './api.js';
import { I, esc, av, toast, errMsg, openModal, extractTags, todayYMD, duration, firstName, KIND_LABEL } from './ui.js';
import { MAX_CLIP_SECONDS, MAX_CLIP_BYTES, probeVideo, posterFrom, uploadWithProgress, newPath, clipExt, removeMedia } from './media.js';

const TYPES = {
  clip: ['Highlight', I.video], text: ['Update', I.text], milestone: ['Milestone', I.medal], stats: ['Stats', I.chart],
  trial: ['Trial', I.clip], team: ['Team list', I.list], event: ['Event', I.cal],
};
const MILESTONES = [['New squad', 'Selected'], ['Representative', 'Picked'], ['Award', 'Winner'], ['Contract', 'Signed'], ['Debut', 'Debut'], ['Milestone', 'Milestone']];
const STAT_PRESETS = [['s', '40m sprint'], ['cm', 'Vertical jump'], ['', 'Yo-yo IR1'], ['m', 'Broad jump']];
const TEAM_POS = ['FB', 'WG', 'CE', 'CE', 'WG', 'FE', 'HB', 'PR', 'HK', 'PR', '2R', '2R', 'LK', 'INT', 'INT', 'INT', 'INT'];

export function allowedTypes(p) {
  const k = p.kind, t = ['clip', 'text'];
  if (k === 'player' || k === 'rising_star') t.push('milestone', 'stats');
  if (k === 'club') t.push('trial', 'team', 'event');
  else if (S.isAdmin) t.push('event', 'trial');
  return t;
}

function fieldsFor(type) {
  if (type === 'clip') {
    return '<input type="file" id="cFile" accept="video/mp4,video/quicktime,video/webm,video/*" hidden>' +
      '<div class="drop" id="cDrop" tabindex="0" role="button"><span class="plus">' + I.plus + '</span><b>Choose a highlight</b><span>Up to 60 seconds and 50 MB. MP4 plays everywhere.</span></div>' +
      '<div id="cPrev" hidden></div>';
  }
  if (type === 'milestone') {
    return '<div class="grid2"><label class="field"><span>Type</span><select class="in" id="mKick">' + MILESTONES.map((m, i) => '<option value="' + i + '">' + m[0] + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Headline</span><input class="in" id="mBig" maxlength="14" value="Selected"></label></div>' +
      '<label class="field"><span>What for?</span><input class="in" id="mLine" maxlength="60" placeholder="SG Ball development squad"></label>' +
      '<label class="field"><span>Details</span><input class="in" id="mSmall" maxlength="60" placeholder="Kensington Kookaburras · 2027 season"></label>';
  }
  if (type === 'stats') {
    return '<div class="lbl">Your numbers</div><p class="hint-t" style="margin:-8px 0 2px">These show as self-reported until they\'re measured at a combine.</p>' +
      STAT_PRESETS.map((s, i) => '<div class="srow"><input class="in" data-sv="' + i + '" inputmode="decimal" maxlength="8" placeholder="Value"><input class="in" data-su="' + i + '" maxlength="6" value="' + s[0] + '" placeholder="Unit"><input class="in" data-sl="' + i + '" maxlength="24" value="' + s[1] + '"><span></span></div>').join('');
  }
  if (type === 'trial') {
    return '<label class="field"><span>Trial name</span><input class="in" id="tTitle" maxlength="60" placeholder="SG Ball development squad trials" required></label>' +
      '<div class="grid2"><label class="field"><span>Date</span><input class="in" type="date" id="tDate" min="' + todayYMD() + '" required></label>' +
      '<label class="field"><span>Time</span><input class="in" id="tTime" maxlength="40" placeholder="8:30am check-in"></label></div>' +
      '<div class="grid2"><label class="field"><span>Location</span><input class="in" id="tLoc" maxlength="60" placeholder="Kensington Oval" required></label>' +
      '<label class="field"><span>Who can come</span><input class="in" id="tElig" maxlength="40" placeholder="Born 2008 to 2010"></label></div>' +
      '<label class="field"><span>Open to</span><input class="in" id="tKick" maxlength="30" value="Open to all clubs"></label>';
  }
  if (type === 'event') {
    return '<label class="field"><span>Event name</span><input class="in" id="eTitle" maxlength="60" placeholder="Eastern Suburbs Combine" required></label>' +
      '<div class="grid2"><label class="field"><span>Date</span><input class="in" type="date" id="eDate" min="' + todayYMD() + '" required></label>' +
      '<label class="field"><span>Location</span><input class="in" id="eLoc" maxlength="60" placeholder="Moore Park"></label></div>' +
      '<label class="field"><span>What\'s on</span><input class="in" id="eChips" maxlength="160" placeholder="40m sprint, Vertical jump, Yo-yo IR1"><small>Separate with commas</small></label>' +
      '<label class="field"><span>Note</span><input class="in" id="eNote" maxlength="80" placeholder="16 and over, Rising Stars with a parent"></label>' +
      (S.isAdmin ? '<label class="check"><input type="checkbox" id="eVer">Results from this event are verified stats</label>' : '');
  }
  if (type === 'team') {
    return '<div class="grid2"><label class="field"><span>Title</span><input class="in" id="kTitle" maxlength="40" value="Round 1 team list"></label>' +
      '<label class="field"><span>Opponent</span><input class="in" id="kOpp" maxlength="24" placeholder="Coogee"></label></div>' +
      '<label class="field"><span>When and where</span><input class="in" id="kWhen" maxlength="60" placeholder="Sat 7 Feb · 2:15pm · Waverley Oval"></label>' +
      '<div class="lbl">Players</div>' +
      TEAM_POS.map((pos, i) => '<div class="trow"><input class="in" data-kn="' + i + '" maxlength="3" value="' + (i + 1) + '"><input class="in" data-kname="' + i + '" maxlength="40" placeholder="' + (i < 13 ? 'Player name' : 'Interchange (optional)') + '"><input class="in" data-kpos="' + i + '" maxlength="4" value="' + pos + '"></div>').join('');
  }
  return '';
}

export function openComposer(initial) {
  if (!S.me) return;
  const types = allowedTypes(S.me);
  let type = types.includes(initial) ? initial : 'clip';
  let clip = null; // { file, probe, poster }
  let uploading = false;
  const parentHint = S.me.kind === 'parent'
    ? (S.profiles.some((p) => p.kind === 'rising_star')
      ? '<div class="warn" style="margin-bottom:14px">You\'re posting as yourself. To post on your child\'s profile, switch to them from the Me menu first.</div>'
      : '<div class="warn" style="margin-bottom:14px">Want to post your child\'s highlights? Add a Rising Star profile in <a class="linkbtn" href="#/settings">Settings</a>.</div>')
    : '';

  const m = openModal({
    title: 'Create a post',
    wide: true,
    body: '<div class="row-flex" style="margin-bottom:14px">' + av(S.me, 40) + '<div><b>' + esc(S.me.display_name) + '</b><div class="small muted">Posting as ' + esc(KIND_LABEL[S.me.kind]) + '</div></div></div>' + parentHint +
      '<div class="ctypes" role="tablist">' + types.map((t) => '<button class="ctype" data-ctype="' + t + '" role="tab">' + TYPES[t][1] + TYPES[t][0] + '</button>').join('') + '</div>' +
      '<form class="form" id="cForm" novalidate><div class="form" id="cFields"></div>' +
      '<label class="field"><span id="cCapLbl">Caption</span><textarea class="in" id="cCap" maxlength="2000" rows="3"></textarea><small>Add #hashtags so selectors can find it.</small></label>' +
      '<div id="cGate"></div><div class="err" id="cErr" hidden></div>' +
      '<div id="cProg" hidden><div class="pbar"><i></i></div><p class="hint-t" style="margin-top:6px" id="cProgT">Uploading...</p></div></form>',
    foot: '<span class="grow">No direct messaging, by design. Keep it about the footy.</span><button class="btn btn-p" id="cGo">Post</button>',
    onClose: () => { if (clip && clip.probe) URL.revokeObjectURL(clip.probe.url); },
  });
  const $m = (s) => m.el.querySelector(s);
  const err = (msg) => { const e = $m('#cErr'); e.textContent = msg || ''; e.hidden = !msg; };

  function setType(t) {
    type = t;
    clip = null;
    err('');
    m.el.querySelectorAll('[data-ctype]').forEach((b) => b.classList.toggle('on', b.dataset.ctype === t));
    $m('#cFields').innerHTML = fieldsFor(t);
    $m('#cCapLbl').textContent = t === 'text' ? 'What\'s happening?' : 'Caption (optional)';
    $m('#cCap').placeholder = t === 'clip' ? 'Found the gap down the left edge on Saturday...' : t === 'text' ? 'Share an update, a thank you, or a question for the comp' : '';
    const gate = $m('#cGate');
    const locked = (t === 'trial' || t === 'event') && !(S.me.verified || S.isAdmin);
    gate.innerHTML = locked ? '<div class="warn">Trials and events unlock once your club is verified. We check every club before it can advertise trials to young players. We\'ll notify you when it\'s done.</div>' : '';
    $m('#cGo').disabled = locked;
    if (t === 'clip') wireClip();
    if (t === 'milestone') {
      $m('#mKick').onchange = (e) => { $m('#mBig').value = MILESTONES[e.target.value][1]; };
    }
  }

  function wireClip() {
    const input = $m('#cFile'), drop = $m('#cDrop');
    drop.onclick = () => input.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
    input.onchange = () => { if (input.files[0]) pick(input.files[0]); input.value = ''; };
  }

  async function pick(file) {
    err('');
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) return err('That isn\'t a video file.');
    if (file.size > MAX_CLIP_BYTES) return err('That clip is ' + Math.round(file.size / 1048576) + ' MB. The limit is 50 MB, so trim it or export at 1080p.');
    const drop = $m('#cDrop');
    drop.innerHTML = '<div class="spin" style="margin:6px auto"></div><span>Reading clip...</span>';
    try {
      const probe = await probeVideo(file);
      if (probe.duration > MAX_CLIP_SECONDS + 0.5) {
        URL.revokeObjectURL(probe.url);
        setType('clip');
        return err('That clip is ' + duration(probe.duration) + '. Highlights can be up to a minute, so trim it and try again.');
      }
      const poster = await posterFrom(probe.el);
      clip = { file, probe, poster };
      drop.hidden = true;
      const prev = $m('#cPrev');
      prev.hidden = false;
      prev.innerHTML = '<div class="cprev"><video src="' + probe.url + '" controls playsinline muted></video><button type="button" class="iconbtn x" id="cRm" aria-label="Remove clip">' + I.x + '</button></div>' +
        '<p class="hint-t" style="margin-top:6px">' + duration(probe.duration) + ' · ' + (file.size / 1048576).toFixed(1) + ' MB · ' + probe.width + '×' + probe.height + '</p>';
      $m('#cRm').onclick = () => { URL.revokeObjectURL(probe.url); setType('clip'); };
    } catch (e) {
      setType('clip');
      err(errMsg(e));
    }
  }

  function collect() {
    const cap = $m('#cCap').value.trim();
    const row = { author_id: S.me.id, kind: type, caption: cap, tags: extractTags(cap), data: {} };
    const v = (s) => { const el = $m(s); return el ? el.value.trim() : ''; };
    if (type === 'text' && !cap) throw new Error('Write something first.');
    if (type === 'clip' && !clip) throw new Error('Choose a clip to upload.');
    if (type === 'milestone') {
      row.data = { kicker: MILESTONES[$m('#mKick').value][0], big: v('#mBig') || 'Selected', line: v('#mLine'), small: v('#mSmall') };
      if (!row.data.line) throw new Error('Say what the milestone is for.');
    }
    if (type === 'stats') {
      row.data.items = STAT_PRESETS.map((_, i) => ({ v: v('[data-sv="' + i + '"]'), u: v('[data-su="' + i + '"]'), l: v('[data-sl="' + i + '"]') })).filter((x) => x.v);
      if (!row.data.items.length) throw new Error('Add at least one number.');
    }
    if (type === 'trial') {
      row.data = { title: v('#tTitle'), time: v('#tTime'), location: v('#tLoc'), eligibility: v('#tElig'), kicker: v('#tKick') || 'Open to all clubs' };
      row.event_date = v('#tDate');
      if (!row.data.title || !row.event_date || !row.data.location) throw new Error('Add the trial name, date and location.');
      if (row.event_date < todayYMD()) throw new Error('Pick a date from today on.');
    }
    if (type === 'event') {
      row.data = { title: v('#eTitle'), location: v('#eLoc'), note: v('#eNote'), chips: v('#eChips').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8), verified_results: !!($m('#eVer') && $m('#eVer').checked) };
      row.event_date = v('#eDate');
      if (!row.data.title || !row.event_date) throw new Error('Add the event name and date.');
      if (row.event_date < todayYMD()) throw new Error('Pick a date from today on.');
    }
    if (type === 'team') {
      row.data = {
        title: v('#kTitle') || 'Team list', opponent: v('#kOpp'), when: v('#kWhen'),
        players: TEAM_POS.map((_, i) => ({ n: v('[data-kn="' + i + '"]'), name: v('[data-kname="' + i + '"]'), pos: v('[data-kpos="' + i + '"]') })).filter((x) => x.name),
      };
      if (!row.data.players.length) throw new Error('Add at least one player.');
    }
    return row;
  }

  async function go() {
    err('');
    let row;
    try { row = collect(); } catch (e) { return err(e.message); }
    const btn = $m('#cGo');
    btn.disabled = true;
    uploading = true;
    btn.textContent = type === 'clip' ? 'Uploading...' : 'Posting...';
    const uploaded = [];
    try {
      if (type === 'clip') {
        const uid = S.user.id, prog = $m('#cProg'), bar = prog.querySelector('i');
        prog.hidden = false;
        const mp = newPath(uid, clipExt(clip.file));
        await uploadWithProgress('media', mp, clip.file, clip.file.type || 'video/mp4', (f) => {
          bar.style.width = Math.round(f * 92) + '%';
          $m('#cProgT').textContent = 'Uploading ' + Math.round(f * 100) + '%';
        });
        uploaded.push(mp);
        let pp = null;
        if (clip.poster) {
          pp = newPath(uid, 'jpg');
          await uploadWithProgress('media', pp, clip.poster, 'image/jpeg');
          uploaded.push(pp);
        }
        bar.style.width = '100%';
        $m('#cProgT').textContent = 'Publishing...';
        Object.assign(row, {
          media_path: mp, poster_path: pp, duration_s: Math.min(MAX_CLIP_SECONDS + 0.5, Math.round(clip.probe.duration * 100) / 100),
          media_width: clip.probe.width, media_height: clip.probe.height,
        });
      }
      const post = await api.createPost(row);
      m.close();
      toast(type === 'clip' ? 'Your highlight is live' : 'Posted');
      document.dispatchEvent(new CustomEvent('otb:posted', { detail: post }));
    } catch (e) {
      if (uploaded.length) removeMedia(uploaded).catch(() => {});
      uploading = false;
      err(errMsg(e));
      btn.disabled = false;
      btn.textContent = 'Post';
      const prog = $m('#cProg');
      if (prog) prog.hidden = true;
    }
  }

  m.el.querySelector('.ctypes').onclick = (e) => {
    const b = e.target.closest('[data-ctype]');
    if (b && !uploading && b.dataset.ctype !== type) setType(b.dataset.ctype);
  };
  $m('#cGo').onclick = go;
  $m('#cForm').onsubmit = (e) => { e.preventDefault(); go(); };
  setType(type);
  return m;
}
export const composeLabel = () => (S.me ? (S.me.kind === 'club' ? 'Share news from ' + S.me.display_name : 'Share a highlight, ' + firstName(S.me.display_name)) : '');
