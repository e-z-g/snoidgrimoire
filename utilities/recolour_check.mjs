// Recolouring a part (js/zb-recolour.js) against the extraction project's
// tools/mod_red_shaggy.py, and over every part:
//
//   - Shaggy hair's purples made the red nose's reds, written into ZOOMBINI
//     and PICKER, are mod_red_shaggy.py's archives byte for byte
//     (utilities/oracle.py redshaggy);
//   - every family maps onto every other shade for shade, darkest to
//     darkest and lightest to lightest, into the shared range only;
//   - every part's variant (and skin) names frames inside its sheets, and
//     each recoloured sheet reads back with only those frames changed, and
//     only in the colours mapped.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { site, archiveBytes, haveDisc, ROOT } from './load.mjs';

let fails = 0, bad = 0;
const fail = m => { if (bad++ < 12) console.log('FAIL ' + m); fails++; };
if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
const sha1 = b => createHash('sha1').update(b).digest('hex');
const bytes = { ZOOMBINI: archiveBytes('ZOOMBINI'), PICKER: archiveBytes('PICKER') };
const archives = new Map(Object.entries(bytes).map(([n, b]) => [n, S.openMohawk(b)]));

// Red Shaggy.
const map = S.zbRecolourMap('purples', 'reds');
if (JSON.stringify([...map]) !== JSON.stringify([[21, 38], [22, 39], [23, 40]])) fail(`purples onto reds is ${JSON.stringify([...map])}`);
const red = S.zbRecolour(archives, 'hair', 1, map);
const o = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'redshaggy'], { encoding: 'utf8' });
if (o.status !== 0) console.log('SKIP the comparison: the oracle did not run: ' + (o.stderr || '').split('\n').slice(-2).join(' '));
else {
  const want = JSON.parse(o.stdout);
  for (const name of ['ZOOMBINI', 'PICKER']) if (sha1(S.zbWriteArchive(bytes[name], red[name])) !== want[name]) fail(`red Shaggy's ${name} is not mod_red_shaggy.py's`);
}

// Every family onto every other.
for (const a of S.ZB_RECOLOUR_FAMILIES) for (const b of S.ZB_RECOLOUR_FAMILIES) {
  const m = S.zbRecolourMap(a.key, b.key), vals = a.shades.map(c => m.get(c));
  if (vals[0] !== b.shades[0] || vals[vals.length - 1] !== b.shades[b.shades.length - 1] || vals.some(v => v < 10 || v > 45)) fail(`${a.key} onto ${b.key}: ${vals}`);
}

// Every part, read back.
let parts = 0;
const sheets = { ZOOMBINI: {}, PICKER: {} };
for (const n of ['ZOOMBINI', 'PICKER']) for (const id of n === 'ZOOMBINI' ? [3000, 3100, 3200] : [4300, 4400]) sheets[n][id] = S.decodeBitmapResource(archives.get(n).get('tBMP', id)).frames;
for (const part of ['hair', 'eyes', 'nose', 'feet', 'skin']) for (const v of part === 'skin' ? [1] : [1, 2, 3, 4, 5]) {
  const m = S.zbRecolourMap(part === 'skin' ? 'skin' : 'greens', 'reds'), groups = S.zbRecolourFrames(part, v);
  for (const g of groups) for (const f of g.frames) if (!sheets[g.archive][g.sheet][f]) fail(`${part} ${v}: frame ${f} is not in ${g.archive} tBMP ${g.sheet}`);
  const out = S.zbRecolour(archives, part, v, m);
  for (const n of ['ZOOMBINI', 'PICKER']) {
    const back = S.openMohawk(S.zbWriteArchive(bytes[n], out[n]));
    for (const c of out[n]) {
      const now = S.decodeBitmapResource(back.get('tBMP', c.id)).frames, was = sheets[n][c.id];
      const mine = new Set(groups.filter(g => g.archive === n && g.sheet === c.id).flatMap(g => g.frames));
      now.forEach((f, i) => {
        const ok = f.pixels.every((px, j) => px === (mine.has(i) && m.has(was[i].pixels[j]) ? m.get(was[i].pixels[j]) : was[i].pixels[j]));
        if (!ok && bad++ < 12) fail(`${part} ${v}: ${n} tBMP ${c.id} frame ${i} reads back wrong`);
      });
    }
  }
  parts++;
}
if (!fails) console.log(`red Shaggy as mod_red_shaggy.py makes it, byte for byte; ${S.ZB_RECOLOUR_FAMILIES.length ** 2} family maps shade for shade; ${parts} parts and skin recoloured and read back, only their frames and colours changed`);
process.exit(fails ? 1 : 0);
