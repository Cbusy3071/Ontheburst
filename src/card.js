// Player card: five gym/fitness numbers turned into 1-99 ratings and an
// overall score.
//
// Two kinds of position weighting:
// 1. Ratings are relative to what's expected for the position. A fullback
//    benching 120 kg rates higher than a prop benching 120 kg, and a prop
//    running a 5:00 Bronco rates higher than a halfback with the same time.
// 2. The overall leans towards what matters most for the position (speed for
//    outside backs, engine for halves and hookers, power for props).
// Junior grades (U9 to U17) get age-adjusted expectations.
import { esc, av, I } from './ui.js';

export const STATS = [
  { key: 'bench_kg', code: 'BEN', label: 'Bench 1RM', unit: 'kg', lo: 60, hi: 150, kind: 'strength' },
  { key: 'squat_kg', code: 'SQT', label: 'Max squat', unit: 'kg', lo: 80, hi: 220, kind: 'strength' },
  { key: 'pullups', code: 'PUL', label: 'Max pull-ups', unit: '', lo: 3, hi: 25, kind: 'reps' },
  { key: 'bronco_s', code: 'BRO', label: 'Bronco', unit: '', lo: 375, hi: 270, kind: 'bronco' },
  { key: 'sprint100_s', code: 'SPD', label: '100m sprint', unit: 's', lo: 14.0, hi: 11.0, kind: 'sprint' },
];

const GROUPS = {
  back: { strength: 0.85, reps: 1.0, bronco: -10, sprint: -0.4, w: { sprint100_s: 0.30, bronco_s: 0.25, pullups: 0.15, squat_kg: 0.15, bench_kg: 0.15 } },
  half: { strength: 0.85, reps: 1.0, bronco: -15, sprint: -0.2, w: { bronco_s: 0.30, sprint100_s: 0.25, pullups: 0.15, squat_kg: 0.15, bench_kg: 0.15 } },
  backrow: { strength: 1.0, reps: 0.95, bronco: -5, sprint: 0.2, w: { bronco_s: 0.22, squat_kg: 0.22, bench_kg: 0.20, pullups: 0.18, sprint100_s: 0.18 } },
  prop: { strength: 1.15, reps: 0.8, bronco: 25, sprint: 0.6, w: { bench_kg: 0.26, squat_kg: 0.26, bronco_s: 0.18, pullups: 0.15, sprint100_s: 0.15 } },
  any: { strength: 1.0, reps: 1.0, bronco: 0, sprint: 0, w: { bench_kg: 0.2, squat_kg: 0.2, pullups: 0.2, bronco_s: 0.2, sprint100_s: 0.2 } },
};
const POS_GROUP = { Fullback: 'back', Winger: 'back', Centre: 'back', 'Five-eighth': 'half', Halfback: 'half', Hooker: 'half', 'Second row': 'backrow', Lock: 'backrow', Prop: 'prop' };
const POS_CODE = { Fullback: 'FB', Winger: 'WG', Centre: 'CE', 'Five-eighth': 'FE', Halfback: 'HB', Hooker: 'HK', 'Second row': '2R', Lock: 'LK', Prop: 'PR', Utility: 'UT' };

export const groupFor = (pos) => POS_GROUP[pos] || 'any';
export const posCode = (pos) => POS_CODE[pos] || (pos ? String(pos).slice(0, 2).toUpperCase() : 'RL');

// Juniors: expectations scale down with age (U10 about 45% of senior strength).
function juniorFactor(grade) {
  const m = /U\s?(\d{1,2})/i.exec(grade || '');
  if (!m) return 1;
  const age = +m[1];
  if (age >= 18) return 1;
  return Math.min(1, Math.max(0.45, 0.45 + (age - 10) * 0.07));
}

export function benchmarks(stat, pos, grade) {
  const g = GROUPS[groupFor(pos)], f = juniorFactor(grade);
  let { lo, hi } = stat;
  if (stat.kind === 'strength') { lo *= g.strength * f; hi *= g.strength * f; }
  if (stat.kind === 'reps') { lo *= g.reps * f; hi *= g.reps * f; }
  if (stat.kind === 'bronco') { lo = (lo + g.bronco) * (1 + (1 - f) * 0.3); hi = (hi + g.bronco) * (1 + (1 - f) * 0.3); }
  if (stat.kind === 'sprint') { lo = (lo + g.sprint) * (1 + (1 - f) * 0.25); hi = (hi + g.sprint) * (1 + (1 - f) * 0.25); }
  return { lo, hi };
}

export function rate(stat, value, pos, grade) {
  if (value == null || value === '' || Number.isNaN(+value)) return null;
  const { lo, hi } = benchmarks(stat, pos, grade);
  const t = (+value - lo) / (hi - lo); // works for lower-is-better too (hi < lo)
  return Math.max(1, Math.min(99, Math.round(40 + 59 * t)));
}

// Verified combine results override self-reported numbers.
export function mergeVerified(card, verified) {
  const out = { values: {}, verified: {} };
  STATS.forEach((s) => { out.values[s.key] = card && card[s.key] != null ? +card[s.key] : null; });
  (verified || []).slice().sort((a, b) => (a.recorded_on < b.recorded_on ? 1 : -1)).forEach((v) => {
    const m = (v.metric || '').toLowerCase();
    let key = null, val = +v.value;
    if (m.includes('bench')) key = 'bench_kg';
    else if (m.includes('squat')) key = 'squat_kg';
    else if (m.includes('pull') || m.includes('chin')) key = 'pullups';
    else if (m.includes('bronco')) { key = 'bronco_s'; if (/min/i.test(v.unit || '')) val = val * 60; }
    else if (m.includes('100')) key = 'sprint100_s';
    if (key && !out.verified[key]) { out.values[key] = val; out.verified[key] = true; }
  });
  return out;
}

export function score(values, pos, grade) {
  const w = GROUPS[groupFor(pos)].w;
  const ratings = {};
  let sum = 0, wsum = 0, n = 0;
  STATS.forEach((s) => {
    const r = rate(s, values[s.key], pos, grade);
    ratings[s.key] = r;
    if (r != null) { sum += r * w[s.key]; wsum += w[s.key]; n++; }
  });
  return { ratings, overall: n >= 3 ? Math.round(sum / wsum) : null, count: n };
}

export const fmtBronco = (s) => (s == null ? '' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0'));
export function parseBronco(txt) {
  const t = String(txt || '').trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  const n = parseFloat(t);
  if (Number.isNaN(n)) return NaN;
  return n < 20 ? Math.round(n * 60) : n; // "4.5" minutes or "285" seconds
}
function rawText(s, v) {
  if (v == null) return 'Not set';
  if (s.key === 'bronco_s') return fmtBronco(v);
  if (s.key === 'pullups') return v + ' reps';
  return (+v).toString().replace(/\.0$/, '') + (s.unit ? ' ' + s.unit : '');
}
const tierOf = (o) => (o == null ? 'none' : o >= 80 ? 'burst' : o >= 70 ? 'gold' : o >= 60 ? 'silver' : 'bronze');

export function cardHTML(profile, card, verified, { editable } = {}) {
  const merged = mergeVerified(card, verified);
  const { ratings, overall, count } = score(merged.values, profile.pos, profile.grade);
  const anyVerified = Object.keys(merged.verified).length > 0;
  const allVerified = STATS.every((s) => merged.values[s.key] == null || merged.verified[s.key]);
  const tier = tierOf(overall);
  return '<div class="pcard-wrap"><div class="pcard t-' + tier + '">' +
    '<div class="fc-top"><div class="fc-ovr"><b>' + (overall == null ? '?' : overall) + '</b><span>' + esc(posCode(profile.pos)) + '</span></div>' +
      '<div class="fc-photo">' + av(profile, 96) + '</div></div>' +
    '<div class="fc-name">' + esc(profile.display_name) + '</div>' +
    '<div class="fc-club">' + esc([profile.club_name, profile.grade].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="fc-stats">' + STATS.map((s) => {
      const r = ratings[s.key], v = merged.values[s.key];
      return '<div class="fc-stat' + (r == null ? ' empty' : '') + '"><b>' + (r == null ? '?' : r) + '</b><span>' + s.code + (merged.verified[s.key] ? I.tick.replace('width="15" height="15"', 'width="11" height="11"') : '') + '</span><small>' + esc(rawText(s, v)) + '</small></div>';
    }).join('') + '</div>' +
    '<div class="fc-foot">' + (count === 0 ? 'No numbers yet' : allVerified && anyVerified ? 'Verified at a combine' : anyVerified ? 'Some stats verified' : 'Self-reported') + '</div>' +
  '</div>' +
  '<div class="pcard-side"><h3>Player card</h3><p>' + (overall == null
    ? (count ? 'Add ' + (3 - count) + ' more stat' + (3 - count === 1 ? '' : 's') + ' to get an overall rating.' : (editable ? 'Add your numbers to build your card.' : 'No numbers added yet.'))
    : 'Overall is weighted for a ' + esc((profile.pos || 'player').toLowerCase()) + '. Each rating compares the number with what\'s expected for the position' + (juniorFactor(profile.grade) < 1 ? ' and age group' : '') + '.') + '</p>' +
    '<p class="small muted">Ratings run 1 to 99. Gold from 70, On the Burst orange from 80. Combine-verified numbers show a tick.</p>' +
    (editable ? '<a class="btn btn-o btn-sm" href="#/settings?card=1">' + I.edit + (count ? 'Update numbers' : 'Add numbers') + '</a>' : '') +
  '</div></div>';
}
