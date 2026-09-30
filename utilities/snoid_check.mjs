// A Zoombini put together (js/zb-snoid.js) against the extraction
// project's Python and the disc's own scripts:
//
//   - all 625 Zoombinis standing (SCRS 100): each part's sprite and where
//     it goes are what tools/animate.py makes of them (utilities/oracle.py
//     snoids), part for part, in the order drawn;
//   - the blocks hold every tick of every Zoombini script in ZOOMBINI.MHK
//     (SCRS 100-150): no record's pose runs past its part's block, the feet
//     scripts 105-129 and 146-150 taking the variant they were written for;
//   - every standing Zoombini composes to one image whose origin is inside it.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { site, archiveBytes, haveDisc, ROOT } from './load.mjs';

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
process.exit(fails ? 1 : 0);
