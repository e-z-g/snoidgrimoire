// Every tBMP on the disc, decoded by js/zb-bitmap.js and by the extraction
// project's mohawk_bmp.py (a port of ScummVM's bitmap.cpp): the same verdict
// on sheet or picture, the same frames, the same size, the same pixels.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { ROOT, site, haveDisc, archiveNames, archiveBytes } from './load.mjs';

if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const py = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'bitmaps'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (py.status !== 0) { console.log('FAIL: oracle.py\n' + py.stderr); process.exit(1); }
const oracle = JSON.parse(py.stdout);

const S = site();
let bad = 0, bitmaps = 0, frames = 0, sheets = 0;
for (const name of archiveNames()) {
  const arc = S.openMohawk(archiveBytes(name));
  const theirs = new Map(oracle[name].map(e => [e.id, e]));
  for (const r of arc.list('tBMP')) {
    bitmaps++;
    const t = theirs.get(r.id & 0xffff);
    let d;
    try { d = S.decodeBitmapResource(arc.get('tBMP', r.id)); } catch (e) { console.log(`FAIL ${name} tBMP ${r.id}: ${e.message}`); bad++; continue; }
    if (!t) { console.log(`FAIL ${name} tBMP ${r.id}: the Python has no such bitmap`); bad++; continue; }
    if (d.sheet !== t.sheet || d.frames.length !== t.frames.length) {
      console.log(`FAIL ${name} tBMP ${r.id}: ${d.sheet ? 'sheet' : 'picture'} of ${d.frames.length} here, ${t.sheet ? 'sheet' : 'picture'} of ${t.frames.length} in the Python`);
      bad++; continue;
    }
    if (d.sheet) sheets++;
    d.frames.forEach((f, i) => {
      frames++;
      const [w, h, sha] = t.frames[i];
      const ours = crypto.createHash('sha1').update(f.pixels).digest('hex');
      if (f.width !== w || f.height !== h || ours !== sha) {
        if (bad < 20) console.log(`FAIL ${name} tBMP ${r.id} frame ${i}: ${f.width}x${f.height} here, ${w}x${h} in the Python${ours !== sha ? ', pixels differ' : ''}`);
        bad++;
      }
    });
  }
}
console.log(`${bitmaps} bitmaps (${sheets} sheets), ${frames} frames: ${bad ? bad + ' differ' : 'every one pixel for pixel as mohawk_bmp.py'}`);
process.exit(bad ? 1 : 0);
