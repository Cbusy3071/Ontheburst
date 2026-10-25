// Smaller pages: trials, events, search, saved, single post, guidelines.
import { S } from '../state.js';
import * as api from '../api.js';
import { I, esc, av, emptyCard, spinner, errMsg, longDate, subText } from '../ui.js';
import { postHTML, followBtn } from '../posts.js';
import { observeMedia } from '../actions.js';
import * as cm from '../comments.js';

function render(el, posts) {
  el.innerHTML = posts.map(postHTML).join('');
  observeMedia(el);
}

/* ---------- trials & events ---------- */
export async function listingView(main, kind) {
  const isTrial = kind === 'trial';
  const canPost = S.me.kind === 'club' && S.me.verified || S.isAdmin;
  const player = S.me.kind === 'player' || S.me.kind === 'rising_star';
  main.innerHTML = '<div class="card"><div class="ph ph-row"><div><h1>' + (isTrial ? 'Trials' : 'Events') + '</h1><p>' +
    (isTrial ? 'Upcoming trials from verified clubs. Register interest and the club confirms your spot.' : 'Combines, camps and come-and-try days. Results from combines become verified stats.') + '</p></div>' +
    (canPost ? '<button class="btn btn-p btn-sm" data-compose="' + kind + '">' + I.plus + (isTrial ? 'Post a trial' : 'Post an event') + '</button>' : '') + '</div></div>' +
    (player ? '<div id="myRegs"></div>' : '') +
    '<div class="feed" id="lst" data-viewlist>' + spinner() + '</div>';
  const el = main.querySelector('#lst');
  try {
    const posts = await api.upcoming(kind, 50);
    if (!posts.length) {
      el.innerHTML = emptyCard(isTrial ? 'No trials listed yet' : 'No events yet', isTrial ? 'When verified clubs post trials, they show up here in date order.' : 'Events and combines will show up here when they\'re announced.',
        S.me.kind === 'club' && !S.me.verified ? '<br><span class="small">Your club can post trials once it\'s verified.</span>' : '');
    } else render(el, posts);
  } catch (e) { el.innerHTML = emptyCard('Couldn\'t load', errMsg(e)); }
  if (player) {
    try {
      const regs = (await api.myRegistrations()).filter((r) => r.post && r.post.kind === kind);
      if (regs.length) {
        main.querySelector('#myRegs').innerHTML = '<div class="card"><div class="sec-h">You\'re registered<small>' + regs.length + '</small></div><div class="list">' +
          regs.map((r) => '<a class="rr-item" href="#/post/' + r.post.id + '"><div class="grow"><div class="t1">' + esc((r.post.data && r.post.data.title) || 'Trial') + '</div><div class="t2">' + esc(longDate(r.post.event_date)) + ' · ' + esc(r.post.author.display_name) + '</div></div>' +
            (r.status === 'confirmed' ? '<span class="badge-c ok">' + I.check + 'Confirmed</span>' : '<span class="badge-c pend">Waiting on club</span>') + '</a>').join('') + '</div></div>';
      }
    } catch (_) { /* optional */ }
  }
}

/* ---------- search ---------- */
export async function searchView(main, q) {
  q = (q || '').trim();
  main.innerHTML = '<div class="card"><div class="ph"><h1>Search</h1><form id="sf" style="margin-top:12px;display:flex;gap:8px"><input class="in" id="sq" value="' + esc(q) + '" placeholder="Players, clubs, or #hashtags" enterkeyhint="search"><button class="btn btn-p">Search</button></form></div></div><div id="sres"></div>';
  main.querySelector('#sf').onsubmit = (e) => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(main.querySelector('#sq').value.trim()); };
  const out = main.querySelector('#sres');
  if (!q) {
    out.innerHTML = emptyCard('Find players and clubs', 'Search by name, handle or club. Use #tags like #halfback or #u16 to find highlights.');
    return;
  }
  out.innerHTML = '<div class="card">' + spinner() + '</div>';
  try {
    const [people, posts] = await Promise.all([q.startsWith('#') ? [] : api.searchProfiles(q), api.searchPosts(q)]);
    let html = '';
    if (people.length) {
      html += '<div class="card"><div class="sec-h">People and clubs<small>' + people.length + '</small></div><div class="list">' +
        people.map((p) => '<div class="rr-item">' + av(p, 42, true) + '<div class="grow"><div class="t1"><a class="name-link" href="#/u/' + esc(p.handle) + '">' + esc(p.display_name) + '</a>' + (p.verified ? I.tick : '') + (p.kind === 'rising_star' ? '<span class="rs">' + I.star + 'Rising Star</span>' : '') + '</div><div class="t2">' + esc(subText(p)) + '</div></div>' + followBtn(p) + '</div>').join('') + '</div></div>';
    }
    out.innerHTML = html + '<div class="feed" id="sposts" data-viewlist></div>';
    const pe = out.querySelector('#sposts');
    if (posts.length) { pe.insertAdjacentHTML('beforebegin', '<div class="sec-h" style="padding:6px 4px 0">Posts</div>'); render(pe, posts); }
    if (!people.length && !posts.length) out.innerHTML = emptyCard('No results for "' + q + '"', 'Try a different spelling, or search a club name.');
  } catch (e) { out.innerHTML = emptyCard('Search failed', errMsg(e)); }
}

/* ---------- saved ---------- */
export async function savedView(main) {
  main.innerHTML = '<div class="card"><div class="ph"><h1>Saved</h1><p>Only you can see what you\'ve saved.</p></div></div><div class="feed" id="sv" data-viewlist>' + spinner() + '</div>';
  const el = main.querySelector('#sv');
  try {
    const posts = await api.savedPosts();
    if (!posts.length) el.innerHTML = emptyCard('Nothing saved yet', 'Tap Save on a post to keep it here.');
    else render(el, posts);
  } catch (e) { el.innerHTML = emptyCard('Couldn\'t load', errMsg(e)); }
}

/* ---------- single post ---------- */
export async function postView(main, id) {
  main.innerHTML = '<div class="feed" id="one" data-viewlist>' + spinner() + '</div>';
  const el = main.querySelector('#one');
  try {
    const p = await api.getPost(id);
    if (!p) { el.innerHTML = emptyCard('Post not found', 'It may have been deleted.', '<br><a class="btn btn-g" href="#/">Back to the feed</a>'); return; }
    render(el, [p]);
    cm.toggleInline(p.id, false);
  } catch (e) { el.innerHTML = emptyCard('Couldn\'t load', errMsg(e)); }
}

/* ---------- guidelines ---------- */
export const GUIDELINES = '<h1>Community guidelines</h1>' +
  '<p>On the Burst is for getting rugby league players seen by the people who pick teams. Lots of our players are young, so the rules are tight.</p>' +
  '<h2>Who can join</h2><ul><li>You need to be 16 or older to have an account.</li><li>Players under 16 appear as Rising Stars. A parent or guardian creates and runs the profile, and approves every comment on it.</li><li>Clubs are checked by us before they can post trials.</li></ul>' +
  '<h2>Keep it about the footy</h2><ul><li>Post your own highlights, or footage you have permission to share. Clips can be up to a minute.</li><li>No abuse, bullying, sledging or comments about anyone\'s body or appearance.</li><li>No contact details, school names or home suburbs for players under 18.</li><li>No fake profiles, impersonation or scams.</li></ul>' +
  '<h2>No direct messaging</h2><p>There\'s no private messaging on On the Burst, by design. Scouts and clubs reach players through public comments, trials and the club.</p>' +
  '<h2>Reporting</h2><p>Use Report on any post or profile and our team will review it. If someone is in danger, call 000.</p>';
export function guidelinesView(main) {
  main.innerHTML = '<div class="card prose">' + GUIDELINES + '</div>';
}
