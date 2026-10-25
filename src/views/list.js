// Paginated list of post cards with infinite scroll.
import { postHTML } from '../posts.js';
import { observeMedia } from '../actions.js';
import { skeletonPosts, esc, errMsg } from '../ui.js';

export function mountPostList(el, { load, empty, pageSize = 10 }) {
  let before = null, done = false, loading = false, alive = true, count = 0;
  el.innerHTML = '<div data-items></div><div data-more></div>';
  const items = el.querySelector('[data-items]'), more = el.querySelector('[data-more]');
  const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) next(); }, { rootMargin: '600px' });

  async function next() {
    if (loading || done || !alive) return;
    loading = true;
    more.innerHTML = skeletonPosts(count ? 1 : 2);
    try {
      const posts = await load(before);
      if (!alive) return;
      if (posts.length) {
        before = posts[posts.length - 1].created_at;
        items.insertAdjacentHTML('beforeend', posts.map(postHTML).join(''));
        observeMedia(items);
        count += posts.length;
      }
      if (posts.length < pageSize) done = true;
      more.innerHTML = '';
      if (done && !count) more.innerHTML = empty();
    } catch (e) {
      more.innerHTML = '<div class="card empty"><b>Couldn\'t load posts</b>' + esc(errMsg(e)) + '<br><button class="btn btn-g btn-sm" data-retry style="margin-top:12px">Try again</button></div>';
      const r = more.querySelector('[data-retry]');
      if (r) r.onclick = () => { done = false; next(); };
    } finally {
      loading = false;
    }
    if (!done && alive) { io.disconnect(); io.observe(more); }
  }
  next();
  return {
    prepend(post) {
      const empt = more.querySelector('.empty');
      if (empt) more.innerHTML = '';
      items.insertAdjacentHTML('afterbegin', postHTML(post));
      observeMedia(items);
      count++;
    },
    destroy() { alive = false; io.disconnect(); },
  };
}
