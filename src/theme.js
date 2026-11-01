// Light/dark theme. The preference is 'system', 'light' or 'dark'; the
// resolved theme goes on <html data-theme>. index.html runs the same logic
// inline before first paint so there's no flash.
const KEY = 'otb.theme';
const BAR = { light: '#E8E9EC', dark: '#1E2225' };
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function themePref() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (_) { return 'system'; }
}
export const currentTheme = () => document.documentElement.dataset.theme || 'light';

export function applyTheme(pref = themePref()) {
  const t = pref === 'dark' || (pref === 'system' && mq && mq.matches) ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = BAR[t];
}
export function setTheme(pref) {
  try { if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch (_) { /* private mode */ }
  applyTheme(pref);
}
if (mq) {
  const onChange = () => { if (themePref() === 'system') applyTheme('system'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}
applyTheme();
