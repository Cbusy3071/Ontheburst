// App-wide state. Kept deliberately simple: one object, mutated in place.
export const S = {
  session: null,
  user: null,
  holder: null,          // { locked }
  profiles: [],          // profiles this account owns (primary first)
  me: null,              // the profile currently acting (primary, or a managed Rising Star)
  isAdmin: false,
  claim: null,           // latest club claim this account made
  following: new Set(),  // profile ids the acting profile follows
  posts: new Map(),      // post id -> post (with author, liked, saved, reg)
  unread: 0,
  muted: true,
  viewerOpen: false,
  filter: 'all',
};

const KEY = 'otb.acting';
export function rememberActing(id) { try { localStorage.setItem(KEY, id); } catch (_) { /* private mode */ } }
export function recallActing() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }

export const primary = () => S.profiles.find((p) => p.is_primary) || S.profiles[0] || null;
export const ownsProfile = (id) => S.profiles.some((p) => p.id === id);
export const isPlayerKind = (k) => k === 'player' || k === 'rising_star';
