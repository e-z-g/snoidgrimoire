// The 1996 scripts proposed as matches for Mountain Rescue's non-walk sets:
// each one's ticks, layout, the feet it fits, and how far its origin-relative
// records reach. A survey for page-mountain.js mountainLookView.
import { site, archiveBytes } from './load.mjs';
const S = site();
const arcs = {};
const arc = n => (arcs[n] ||= S.openMohawk(archiveBytes(n)));
const zoom = arc('ZOOMBINI');
const ask = [['ZOOMBINI', [100, 130, 131, 132, 133, 134, 135, 136, 137, 146, 147, 148, 149, 150]], ['MAZE2', [15080, 15081, 15082, 15083, 15084, 15085, 15086, 15087, 15088, 15089, 14000, 14001, 14002, 14003, 14004, 14005, 14006, 14007]],
  ['BRIDGE', [1004, 1005, 1006, 1007]], ['CAVES', [13004]], ['FLEENS', [7031, 7032, 7033, 7034, 7035]]];
for (const [name, ids] of ask) for (const id of ids) {
  let s;
  try { s = S.parseScript(arc(name).get('SCRS', id), 'SCRS'); } catch (e) { console.log(name, id, e.message); continue; }
  const kind = S.ZB_SNOID_KIND_OF_LAYOUT[s.layout] || '-';
  if (kind === '-' || kind === 'fleen') { console.log(name, id, 'layout', s.layout); continue; }
  const sheet = S.zbSnoidSheet(zoom, kind), ticks = S.zbSnoidTicks(s);
  const xs = [], ys = [], eyes = [], feet = [];
  for (const t of ticks) for (const p of S.zbSnoidParts(t, sheet.effects)) { if (p.part === 'body') { xs.push(p.x); ys.push(p.y); } if (p.part === 'eyes') eyes.push(p.shape); if (p.part === 'feet') feet.push(p.shape); }
  const r = a => a.length ? `${Math.min(...a)}..${Math.max(...a)}` : '-';
  console.log(name, id, kind, `${ticks.length} ticks`, `body x ${r(xs)} y ${r(ys)}`, `fits feet ${S.zbSnoidFeetFor(sheet, ticks).join('')}`, `eyes ${[...new Set(eyes)].join(',')}`, `feet ${feet.join(',')}`, `events ${ticks.map(t => t.event.toString(16)).filter(e => e !== '0').join(',')}`);
}
