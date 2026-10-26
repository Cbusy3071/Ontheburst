// Player, club and member profile pages.
import { S } from '../state.js';
import * as api from '../api.js';
import { I, esc, fmt, av, badges, subHTML, emptyCard, toast, KIND_LABEL, spinner, openMenu, openModal, busy, errMsg } from '../ui.js';
import { followBtn, tileHTML, managerLine } from '../posts.js';
import { mountPostList } from './list.js';
import { reportDialog, profileLink } from '../actions.js';
import { CLUB_ROLES } from './onboarding.js';

export default async function profileView(main, handle, tab) {
  main.innerHTML = '<div class="card">' + spinner() + '</div>';
  let p;
  try { p = await api.profileByHandle(handle); } catch (_) { p = null; }
  if (!p) {
    main.innerHTML = emptyCard('Profile not found', 'That handle doesn\'t exist, or the profile was removed.', '<br><a class="btn btn-g" href="#/">Back to the feed</a>');
    return;
  }
  const mine = S.profiles.some((x) => x.id === p.id);
  if (!mine) api.recordProfileView(p.id).then(() => {});
  const player = p.kind === 'player' || p.kind === 'rising_star';
  tab = tab === 'highlights' || tab === 'stats' ? tab : 'posts';

  const [sum, vstats] = await Promise.all([
    api.profileSummary(p.id).catch(() => ({})),
    player ? api.verifiedStats(p.id).catch(() => []) : Promise.resolve([]),
  ]);

  const clubLine = p.club_name && player
    ? '<span>' + I.people + (p.club && p.club.handle ? '<a class="name-link" href="#/u/' + esc(p.club.handle) + '">' + esc(p.club_name) + '</a>' : esc(p.club_name)) + '</span>' +
      (p.club_status === 'confirmed' ? '<span class="badge-c ok">' + I.check + 'Registered player</span>' : (mine && p.club_status === 'pending' ? '<span class="badge-c pend">Waiting on club to confirm</span>' : ''))
    : '';
  const statsRow = [[fmt(p.follower_count), 'followers', 'followers'], [fmt(p.following_count), 'following'], player ? [fmt(sum.clip_views), 'clip views'] : [fmt(sum.posts), 'posts']];

  main.innerHTML = '<div class="card pp">' +
    '<div class="cover">' + (p.jersey ? '<span class="num">' + esc(p.jersey) + '</span>' : '') + '</div>' +
    '<div class="pp-body">' +
      '<div class="pp-acts">' + (mine
        ? '<a class="btn btn-g btn-sm" href="#/settings">' + I.edit + 'Edit profile</a>'
        : followBtn(p).replace('class="follow', 'class="btn btn-o btn-sm follow')) +
        '<button class="iconbtn" data-pmore aria-label="More">' + I.more + '</button></div>' +
      av(p, 110).replace('class="av', 'class="av pp-av') +
      '<div class="pp-name">' + esc(p.display_name) + badges(p) + '</div>' +
      '<div class="pp-sub">' + subHTML(p) + '<span class="muted">@' + esc(p.handle) + '</span></div>' +
      managerLine(p) +
      '<div class="pp-meta">' + clubLine + (p.region ? '<span>' + I.pin + esc(p.region) + '</span>' : '') +
        (p.kind !== 'player' && p.kind !== 'rising_star' ? '<span>' + esc(KIND_LABEL[p.kind]) + '</span>' : '') +
        (p.kind === 'club' && !p.owner_id ? '' : '<span>' + I.cal + 'Joined ' + new Date(p.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) + '</span>') + '</div>' +
      (p.bio ? '<div class="pp-bio">' + esc(p.bio) + '</div>' : (mine ? '<div class="pp-bio muted">Add a bio in <a class="linkbtn" href="#/settings">Edit profile</a> so selectors know what you\'re about.</div>' : '')) +
      '<div class="pp-stats">' + statsRow.map((s, i) => '<div><b' + (i === 0 ? ' data-fcount' : '') + '>' + s[0] + '</b><span>' + s[1] + '</span></div>').join('') + '</div>' +
    '</div>' +
    (p.kind === 'club' && !p.owner_id ? '<div class="claim-card">' + I.shield + '<div><b>' + esc(p.display_name) + ' hasn\'t joined On the Burst yet</b>We set up this page so players can link their club. It isn\'t run by the club.</div>' +
      (S.claim && S.claim.status === 'pending' ? '<span class="badge-c pend">Claim pending</span>' : '<button class="btn btn-t btn-sm" data-claimpage>Claim this page</button>') + '</div>' : '') +
    '<div class="tabs" role="tablist"><button data-tab="posts">Posts</button>' + (player || sum.highlights ? '<button data-tab="highlights">Highlights</button>' : '') + (player ? '<button data-tab="stats">Verified stats</button>' : '') + '</div>' +
  '</div><div id="ptab"></div>';

  let followers = p.follower_count;
  const onFollow = (e) => {
    if (e.detail.id !== p.id) return;
    followers += e.detail.on ? 1 : -1;
    const el = main.querySelector('[data-fcount]');
    if (el) el.textContent = fmt(Math.max(0, followers));
  };
  document.addEventListener('otb:follow', onFollow);

  main.querySelector('[data-pmore]').onclick = (e) => {
    {
      let html = '<button data-act="copy">' + I.link + 'Copy profile link</button>';
      if (!mine) html += '<button data-act="report">' + I.flag + 'Report profile</button>';
      if (S.isAdmin) {
        html += '<hr><button data-act="verify">' + I.admin + (p.verified ? 'Remove verified badge' : 'Verify profile') + '</button>';
        if (p.kind === 'club') html += '<button data-act="partner">' + I.check + (p.partnered ? 'Mark as not partnered' : 'Mark as partnered') + '</button>';
      }
      openMenu(e.currentTarget, html, async (act) => {
        if (act === 'copy') navigator.clipboard.writeText(profileLink(p.handle)).then(() => toast('Link copied'));
        if (act === 'report') reportDialog({ profile_id: p.id }, KIND_LABEL[p.kind].toLowerCase());
        if (act === 'verify') { await api.setVerified(p.id, !p.verified); toast(p.verified ? 'Badge removed' : 'Verified'); setTimeout(() => location.reload(), 600); }
        if (act === 'partner') { await api.setPartnered(p.id, !p.partnered); toast(p.partnered ? 'Marked as not partnered' : 'Marked as partnered'); setTimeout(() => location.reload(), 600); }
      });
    }
  };

  const claimBtn = main.querySelector('[data-claimpage]');
  if (claimBtn) claimBtn.onclick = () => {
    const m = openModal({
      title: 'Claim ' + p.display_name,
      body: '<form class="form" id="cpf"><p class="muted small">We check every claim before handing a club page over. Once approved, you can switch to the club from the Me menu.</p>' +
        '<label class="field"><span>Your full name</span><input class="in" id="cpName" maxlength="60" value="' + esc(S.me.display_name) + '"></label>' +
        '<label class="field"><span>Your role at the club</span><select class="in" id="cpRole">' + CLUB_ROLES.map((r) => '<option>' + r + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>How can we confirm you?</span><textarea class="in" id="cpNote" maxlength="500" rows="3" placeholder="For example: I\'m listed as registrar on the club website"></textarea></label></form>',
      foot: '<button class="btn btn-g" data-cancel>Cancel</button><button class="btn btn-p" data-send>Send claim</button>',
    });
    m.el.querySelector('[data-cancel]').onclick = m.close;
    m.el.querySelector('[data-send]').onclick = (e) => busy(e.currentTarget, async () => {
      try {
        await api.claimClub({ p_club: p.id, p_name: m.el.querySelector('#cpName').value.trim(), p_role: m.el.querySelector('#cpRole').value, p_note: m.el.querySelector('#cpNote').value.trim() || null });
        S.claim = { status: 'pending', club: p };
        m.close();
        toast('Claim sent. We\'ll review it soon.');
        claimBtn.outerHTML = '<span class="badge-c pend">Claim pending</span>';
      } catch (ex) { toast(errMsg(ex)); }
    });
  };

  let list = null;
  const tabEl = main.querySelector('#ptab');
  async function show(t) {
    tab = t;
    main.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (list) { list.destroy(); list = null; }
    if (t === 'posts') {
      tabEl.innerHTML = '<div class="feed" data-viewlist></div>';
      list = mountPostList(tabEl.firstChild, {
        load: (before) => api.profilePosts(p.id, { before }),
        empty: () => emptyCard(mine ? 'You haven\'t posted yet' : 'No posts yet', mine ? 'Share a highlight and it\'ll show up here and in the feed.' : 'When ' + p.display_name + ' posts, it\'ll show up here.', mine ? '<br><button class="btn btn-p" data-compose="clip">Post a highlight</button>' : ''),
      });
    } else if (t === 'highlights') {
      tabEl.innerHTML = '<div class="card">' + spinner() + '</div>';
      const clips = await api.profilePosts(p.id, { clipsOnly: true, limit: 60 }).catch(() => []);
      if (tab !== 'highlights') return;
      tabEl.innerHTML = clips.length ? '<div class="card"><div class="hgrid" data-viewlist>' + clips.map(tileHTML).join('') + '</div></div>'
        : emptyCard('No highlights yet', mine ? 'Clips you post show up here as a reel.' : 'Nothing to watch yet.', mine ? '<br><button class="btn btn-p" data-compose="clip">Post a highlight</button>' : '');
    } else {
      tabEl.innerHTML = vstats.length
        ? '<div class="card"><div class="sec-h">Verified stats<small>Measured at On the Burst events</small></div><div class="vstats">' + vstats.map((s) =>
          '<div class="stat"><b>' + esc(String(+s.value)) + '<small>' + esc(s.unit || '') + '</small></b><span>' + esc(s.metric) + '</span><em>Verified</em><span class="small muted" style="font-weight:500;margin-top:4px">' + esc([s.event_name, new Date(s.recorded_on).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')) + '</span></div>').join('') + '</div></div>'
        : emptyCard('No verified stats yet', mine ? 'Results measured at a combine go straight onto your profile here. Self-reported numbers stay in your posts.' : 'Stats measured at combines will show up here.', mine ? '<br><a class="btn btn-o" href="#/events">Find an event</a>' : '');
    }
  }
  main.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b && b.dataset.tab !== tab) show(b.dataset.tab); };
  show(tab);

  return () => { if (list) list.destroy(); document.removeEventListener('otb:follow', onFollow); };
}
