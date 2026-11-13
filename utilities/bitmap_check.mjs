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
  const pythonBitmaps = new Map(oracle[name].map(e => [e.id, e]));
  for (const r of arc.list('tBMP')) {
    bitmaps++;
    const t = pythonBitmaps.get(r.id & 0xffff);
    let d;
    try { d = S.decodeBitmapResource(arc.get('tBMP', r.id)); } catch (e) { console.log(`FAIL ${name} tBMP ${r.id} (${e.message})`); bad++; continue; }
    if (!t) { console.log(`FAIL ${name} tBMP ${r.id}, the Python has no such bitmap`); bad++; continue; }
    if (d.sheet !== t.sheet || d.frames.length !== t.frames.length) {
      console.log(`FAIL ${name} tBMP ${r.id}, ${d.sheet ? 'sheet' : 'picture'} of ${d.frames.length} here, ${t.sheet ? 'sheet' : 'picture'} of ${t.frames.length} in the Python`);
      bad++; continue;
    }
    if (d.sheet) sheets++;
    d.frames.forEach((f, i) => {
      frames++;
      const [w, h, sha] = t.frames[i];
      const siteSha = crypto.createHash('sha1').update(f.pixels).digest('hex');
      if (f.width !== w || f.height !== h || siteSha !== sha) {
        if (bad < 20) console.log(`FAIL ${name} tBMP ${r.id} frame ${i}, ${f.width}x${f.height} here, ${w}x${h} in the Python${siteSha !== sha ? ', pixels differ' : ''}`);
        bad++;
      }
    });
  }
}
// The Windows colors: each component c of indices 10-245 becomes c + 31 - c/8
// (brightenPalette in zbtools' matching decompilation), 0 stays 0, and
// the system's colors at 0-9 and 246-255 are as they were.
{
  const pal = Array.from({ length: 256 }, (_, i) => [i, (i * 7) % 256, 255 - i]), shown = S.zbWindowsPalette(pal);
  const brighten = c => (c ? c + 31 - Math.floor(c / 8) : 0);
  const wrong = shown.findIndex((rgb, i) => rgb.some((v, k) => v !== (i >= 10 && i <= 245 ? brighten(pal[i][k]) : pal[i][k])) || rgb.some(v => v < 0 || v > 255));
  if (wrong >= 0) { bad++; console.log(`FAIL the Windows colors at index ${wrong}`); }
  if (pal[100][1] !== 188) { bad++; console.log('FAIL zbWindowsPalette changed the palette it was given'); }
}
console.log(`${bitmaps} bitmaps (${sheets} sheets), ${frames} frames (${bad ? bad + ' differ' : 'every one pixel for pixel as mohawk_bmp.py'}), and the Windows colors brightened as the program does`);
process.exit(bad ? 1 : 0);
