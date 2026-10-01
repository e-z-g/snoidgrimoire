// A Zoombini put together (js/zb-snoid.js) against the extraction
// project's Python and the disc's own scripts:
//
//   - all 625 Zoombinis standing (SCRS 100): each part's sprite and where
//     it goes are what tools/animate.py makes of them (utilities/oracle.py
//     snoids), part for part, in the order drawn;
//   - the blocks hold every tick of every Zoombini script in ZOOMBINI.MHK
//     (SCRS 100-150): no record's pose runs past its part's block, the feet
//     scripts 105-129 and 146-150 taking the variant they were written for;
//   - every standing Zoombini composes to one image whose origin is inside it;
//   - the blocks of all three snoids (Zoombini, tumble, Fleen) are animate.py's;
//   - every tick of every snoid script on the disc (utilities/oracle.py
//     snoidticks), each record given the part the layout word and the events
//     say (zbSnoidTicks, zbSnoidParts), against the part animate.py fits to
//     it. Where they may differ: a profile tick's body and nose both at pose 4,
//     which the fit cannot tell apart and the word can (they stand a pixel
//     apart); and none else: the nine ticks of FLEENS 7026-7030
//     and NET 13003-13004 whose order comes from code not traced
//     (ZB_UNTRACED) are the only ones zbSnoidParts fits;
//   - every pose of those scripts inside its block, for the feet its number
//     says (zbSnoidFeetOf) or else for some feet;
//   - the walk (zbWalkDirection, zbWalkLeg): its slope thresholds and speeds
//     as ScummVM's ZmbSnoid::calcPathSpeed has them in its text; ZOOMBINI
//     SCRS 100 + 5 x feet + direction, for every feet and direction, a walk
//     of those feet in layout 1 (nose behind the body) exactly when going
//     away (directions 3 and 4); every leg between two of a room's waypoints
//     arriving, turned round when it goes left, each step within its speeds.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { site, archiveBytes, archiveNames, haveDisc, ROOT } from './load.mjs';

let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };
if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
const arc = S.openMohawk(archiveBytes('ZOOMBINI'));
const sheet = S.zbSnoidSheet(arc);

const r = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'snoids'], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.log('SKIP: the oracle did not run: ' + (r.stderr || '').split('\n').slice(-2).join(' ')); process.exit(0); }
const want = JSON.parse(r.stdout);
let bad = 0;
for (let n = 0; n < 625; n++) {
  const z = { hair: Math.floor(n / 125) + 1, eyes: Math.floor(n / 25) % 5 + 1, nose: Math.floor(n / 5) % 5 + 1, feet: n % 5 + 1 };
  if (S.zbZoombiniId(z) !== n) { fail(`zbZoombiniId is not the oracle's numbering at ${n}`); break; }
  const got = S.zbZoombiniPlacements(sheet, z).map(p => [p.part, p.frame, p.x, p.y]);
  if (JSON.stringify(got) !== JSON.stringify(want[n])) { if (bad++ < 3) fail(`Zoombini ${n}: ${JSON.stringify(got)}, animate.py ${JSON.stringify(want[n])}`); }
  const img = S.zbZoombiniImage(sheet, z);
  if (!(img.ox >= 0 && img.oy >= 0 && img.ox < img.width && img.oy < img.height)) { if (bad++ < 3) fail(`Zoombini ${n}'s origin is outside it`); }
}

// Every tick of the Zoombini's own scripts, inside its blocks.
let ticks = 0;
for (const { id } of arc.list('SCRS')) {
  if (id < 100 || id > 150) continue;
  const s = S.parseScript(arc.get('SCRS', id), 'SCRS');
  const feet = id >= 105 && id <= 129 ? Math.floor((id - 105) / 5) + 1 : id >= 146 ? id - 145 : null;
  for (const f of s.frames) {
    if (!f.records.length) continue;
    f.records.forEach((rec, k) => {
      const part = S.ZB_LAYER_ORDERS[s.layout][k];
      const values = part === 'body' ? [1] : part === 'feet' && feet ? [feet] : part === 'feet' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
      const fits = values.filter(v => S.zbSnoidFrame(part, v, rec.shape) != null);
      if (part === 'feet' && !feet ? !fits.length : fits.length !== values.length) { if (bad++ < 6) fail(`SCRS ${id}: ${part} pose ${rec.shape} is past its block`); }
    });
    ticks++;
  }
}
if (!bad) console.log(`all 625 Zoombinis standing as animate.py puts them together; ${ticks} ticks of SCRS 100-150 inside the blocks`);

// Every snoid script on the disc, tick by tick.
const ZB_UNTRACED = { 'FLEENS/7026': [2], 'FLEENS/7027': [2], 'FLEENS/7028': [2, 3], 'FLEENS/7029': [2], 'FLEENS/7030': [1], 'NET/13003': [21, 22], 'NET/13004': [17] };
const t = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'snoidticks'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (t.status !== 0) { console.log('SKIP: the oracle did not run: ' + (t.stderr || '').split('\n').slice(-2).join(' ')); process.exit(fails ? 1 : 0); }
const W = JSON.parse(t.stdout);
for (const [kind, parts] of Object.entries(W.blocks)) {
  const K = S.ZB_SNOID_KINDS[kind];
  for (const [part, [bases, poses]] of Object.entries(parts)) {
    const mine = part === 'effects' ? [[2 * (K.effects.first - 1)], [K.effects.poses]] : [K.blocks[part].base, K.blocks[part].poses];
    if (JSON.stringify(mine) !== JSON.stringify([bases, poses])) fail(`${kind} ${part}'s blocks ${JSON.stringify(mine)}, animate.py ${JSON.stringify([bases, poses])}`);
  }
}
const key = ps => ps.map(p => p.join(',')).sort().join(' ');
const swap = (ps, a) => ps.map(([p, ...r]) => [a[p] || p, ...r]);
const counts = { scripts: 0, ticks: 0, drawn: 0, ambiguous: 0, untraced: 0, feetBound: 0 };
for (const n of archiveNames()) {
  const a = S.openMohawk(archiveBytes(n));
  for (const { id } of a.list('SCRS')) {
    const want = W.scripts[`${n}/${id}`], s = S.parseScript(a.get('SCRS', id), 'SCRS'), kind = S.ZB_SNOID_KIND_OF_LAYOUT[s.layout];
    if (!kind !== !want) { fail(`${n} SCRS ${id}: layout ${s.layout}, and animate.py ${want ? 'reads' : 'does not read'} it as a snoid`); continue; }
    if (!kind) continue;
    counts.scripts++;
    const K = S.ZB_SNOID_KINDS[kind], ticks = S.zbSnoidTicks(s, 0, n), untraced = ZB_UNTRACED[`${n}/${id}`] || [];
    ticks.forEach((tk, i) => {
      counts.ticks++;
      const parts = S.zbSnoidParts(tk, K.effects), got = parts.map(p => [p.part, p.shape, p.x, p.y]);
      if (parts.length && parts[0].fitted) { if (untraced.includes(i)) counts.untraced++; else if (bad++ < 12) fail(`${n} SCRS ${id} tick ${i}: fitted, not one of the untraced`); }
      let exp = want[i] || [];
      if (got.length) counts.drawn++;
      if (key(got) === key(exp)) return;
      const four = exp.filter(q => q[0] === 'body' || q[0] === 'nose').every(q => q[1] <= 4);
      if (kind === 'zoombini' && four && key(got) === key(swap(exp, { body: 'nose', nose: 'body' }))) { counts.ambiguous++; return; }
      if (bad++ < 12) fail(`${n} SCRS ${id} tick ${i}: ${JSON.stringify(got)}, animate.py ${JSON.stringify(exp)}`);
    });
    const sheetish = { effects: K.effects, blocks: K.blocks };
    const fits = S.zbSnoidFeetFor(sheetish, ticks), own = S.zbSnoidFeetOf(n, id), feet = own ? [own] : fits;
    if (own && !fits.includes(own) && bad++ < 12) fail(`${n} SCRS ${id}: written for feet ${own} by its number, whose block does not hold its poses`);
    if (!feet.length) { if (bad++ < 12) fail(`${n} SCRS ${id}: no feet's block holds its feet's poses`); }
    if (feet.length < 5) counts.feetBound++;
    for (const tk of ticks) for (const p of S.zbSnoidParts(tk, K.effects)) {
      const ok = p.part === 'effect' ? p.shape >= K.effects.first && p.shape < K.effects.first + K.effects.poses
        : p.part === 'feet' ? feet.some(v => S.zbSnoidFrame('feet', v, p.shape, 0, K.blocks) != null)
        : [1, 2, 3, 4, 5].every(v => S.zbSnoidFrame(p.part, v, p.shape, 0, K.blocks) != null);
      if (!ok && bad++ < 12) fail(`${n} SCRS ${id}: ${p.part} pose ${p.shape} is past its block`);
    }
  }
}
if (counts.untraced !== Object.values(ZB_UNTRACED).flat().length) fail(`${counts.untraced} ticks fitted, not ${Object.values(ZB_UNTRACED).flat().length}`);
if (!bad) console.log(`${counts.scripts} snoid scripts, ${counts.ticks} ticks (${counts.drawn} drawn) as animate.py reads them, bar ${counts.ambiguous} body-and-nose ties the layout word decides, ${counts.untraced} untraced ones fitted; ${counts.feetBound} scripts written for some feet only`);
// The walk.
const cpp = path.join(ROOT, 'reference', 'scummvm-zoombini', 'engines', 'mohawk', 'zoombini_scripts.cpp');
if (fs.existsSync(cpp)) {
  const text = fs.readFileSync(cpp, 'utf8'), body = text.slice(text.indexOf('void ZmbSnoid::calcPathSpeed'));
  const cuts = [...body.slice(0, 2500).matchAll(/slope (<=?) (-?\d+)/g)].map(m => [m[1], +m[2]]);
  const speeds = [...body.slice(0, 2500).matchAll(/sx = (\d+);\s*sy = -?(\d+);/g)].map(m => [+m[1], +m[2]]);
  if (JSON.stringify(cuts) !== JSON.stringify([['<=', -1409], ['<=', -332], ['<', 332], ['<', 1409]])) fail(`ScummVM's slope cuts are ${JSON.stringify(cuts)}`);
  if (JSON.stringify(speeds) !== JSON.stringify(S.ZB_WALK_SPEEDS)) fail(`ScummVM's walk speeds are ${JSON.stringify(speeds)}, the site's ${JSON.stringify(S.ZB_WALK_SPEEDS)}`);
  // The cuts as zbWalkDirection takes them, at each side of each: 1024 across
  // and sl up the screen is a slope of sl.
  const at = sl => S.zbWalkDirection(1024, -sl);
  const sides = [[-1409, 0], [-1408, 1], [-332, 1], [-331, 2], [331, 2], [332, 3], [1408, 3], [1409, 4]];
  for (const [sl, d] of sides) if (at(sl) !== d) fail(`slope ${sl} walks in direction ${at(sl)}, not ${d}`);
  if (S.zbWalkDirection(0, 5) !== 0 || S.zbWalkDirection(0, -5) !== 4) fail('straight down and up are not directions 0 and 4');
} else console.log('SKIP the walk against ScummVM: no reference/scummvm-zoombini');
for (let f = 1; f <= 5; f++) for (let d = 0; d < 5; d++) {
  const id = 100 + 5 * f + d, sc = S.parseScript(arc.get('SCRS', id), 'SCRS');
  if (S.zbSnoidFeetOf('ZOOMBINI', id) !== f) fail(`SCRS ${id} is not taken for feet ${f}`);
  if ((sc.layout === 1) !== (d >= 3)) fail(`SCRS ${id}, direction ${d}, is in layout ${sc.layout}`);
}
let legs = 0;
for (const n of archiveNames()) {
  const a = S.openMohawk(archiveBytes(n));
  for (const { id } of a.list('NODE')) {
    const nodes = S.parseWalkNodes(a.get('NODE', id));
    for (const p of nodes) for (const q of nodes) {
      if (p === q) continue;
      const leg = S.zbWalkLeg(p.x, p.y, q.x, q.y, 1, 0), last = leg.steps[leg.steps.length - 1];
      legs++;
      if (last.x !== q.x || last.y !== q.y) { if (bad++ < 12) fail(`${n} NODE ${id}: a leg does not arrive`); continue; }
      if ((q.x < p.x) !== (leg.facing === 1) && q.x !== p.x) { if (bad++ < 12) fail(`${n} NODE ${id}: a leg left is not turned round`); }
      let x = p.x, y = p.y;
      for (const st of leg.steps) {
        if (Math.abs(st.x - x) > leg.vx || Math.abs(st.y - y) > leg.vy || !(leg.vx || leg.vy)) { if (bad++ < 12) fail(`${n} NODE ${id}: a step past its speeds`); break; }
        x = st.x; y = st.y;
      }
    }
  }
}
if (!bad) console.log(`the walk: ScummVM's cuts and speeds, the 25 walks in their layouts, ${legs} legs between waypoints arriving`);
process.exit(fails ? 1 : 0);
