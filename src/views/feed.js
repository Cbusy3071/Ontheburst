// Home: composer, trending highlights strip, filters and the feed.
import { S } from '../state.js';
import * as api from '../api.js';
import { I, av, esc, emptyCard } from '../ui.js';
import { tileHTML } from '../posts.js';
import { composeLabel } from '../composer.js';
import { mountPostList } from './list.js';

const FILTERS = [['all', 'For you'], ['following', 'Following'], ['clip', 'Highlights'], ['trial', 'Trials & events'], ['rising', 'Rising Stars']];
const EMPTY = {
  all: ['The feed is fresh', 'Be the first to post a highlight. Everyone who joins will see it here.'],
  following: ['Nothing here yet', 'Follow players and clubs and their posts will land in this tab.'],
  clip: ['No highlights yet', 'Post a clip of up to a minute and it shows up here.'],
  trial: ['No trials or events yet', 'When verified clubs post trials, you can register interest here.'],
  rising: ['No Rising Stars yet', 'Parents can create a Rising Star profile for players under 16.'],
};

function composerHTML() {
  const k = S.me.kind;
  const second = k === 'club' ? ['trial', I.clip.replace('width="18" height="18"', 'width="20" height="20"').replace('currentColor', '#1F6B4E'), 'Trial'] : ['stats', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F6B4E" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke-linecap="round"/></svg>', 'Stats'];
  const third = k === 'club' ? '<button data-compose="team"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9A6400" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>Team list</button>'
    : '<a href="#/trials" class="cbtn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9A6400" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M8.5 10h7M8.5 14h7" stroke-linecap="round"/></svg>Find a trial</a>';
  const showStats = k === 'player' || k === 'rising_star' || k === 'club';
  return '<div class="card composer"><div class="comp-row">' + av(S.me, 46) +
    '<button class="comp-input" data-compose="' + (k === 'parent' || k === 'fan' ? 'text' : 'clip') + '">' + esc(composeLabel()) + '</button></div>' +
    '<div class="comp-acts"><button data-compose="clip"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5B1F" stroke-width="2"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5" stroke-linejoin="round"/></svg>Clip</button>' +
    (showStats ? '<button data-compose="' + second[0] + '">' + second[1] + second[2] + '</button>' : '<button data-compose="text"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F6B4E" stroke-width="2" stroke-linecap="round"><path d="M5 6h14M5 11h14M5 16h9"/></svg>Update</button>') +
    third + '</div></div>';
}

export default function feedView(main) {
  main.innerHTML = composerHTML() +
    '<div id="strip"></div>' +
    '<div class="fchips" id="fchips">' + FILTERS.map((f) => '<button class="fchip' + (S.filter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>').join('') + '</div>' +
    '<div class="feed" id="posts" data-viewlist></div>';

  let list = null;
  const mount = () => {
    if (list) list.destroy();
    const f = S.filter;
    list = mountPostList(main.querySelector('#posts'), {
      load: (before) => api.feed(f, before),
      empty: () => emptyCard(EMPTY[f][0], EMPTY[f][1], f === 'all' || f === 'clip' ? '<br><button class="btn btn-p" data-compose="clip">Post a highlight</button>' : ''),
    });
  };
  mount();

  main.querySelector('#fchips').onclick = (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b || b.dataset.filter === S.filter) return;
    S.filter = b.dataset.filter;
    main.querySelectorAll('.fchip').forEach((c) => c.classList.toggle('on', c === b));
    mount();
  };

  api.trending().then((clips) => {
    const strip = main.querySelector('#strip');
    if (!strip) return;
    strip.innerHTML = '<div class="card strip-card"><div class="strip-h"><h2>Trending highlights</h2><span>Last two weeks</span></div><div class="strip" data-viewlist>' +
      '<button class="tile add" data-compose="clip"><span class="plus">' + I.plus + '</span>Add your highlight</button>' +
      clips.map(tileHTML).join('') + '</div></div>';
  }).catch(() => {});

  const onPosted = (e) => { if (list && (S.filter === 'all' || (S.filter === 'clip' && e.detail.kind === 'clip'))) list.prepend(e.detail); };
  document.addEventListener('otb:posted', onPosted);
  return () => { if (list) list.destroy(); document.removeEventListener('otb:posted', onPosted); };
}
