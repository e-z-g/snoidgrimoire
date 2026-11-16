// The screenshot reader (js/zb-shot.js) run on PNG files, to see what it
// reads off each: the place, the fit, each Zoombini and the puzzle's state.
//
//   node utilities/shot_read.mjs a.png b.png      # a line or two for each
//   node utilities/shot_read.mjs -v a.png         # and every Zoombini
//   node utilities/shot_read.mjs --json a.png     # the puzzle's state as JSON
//   node utilities/shot_read.mjs --smooth=1.5 a.png   # enlarged with smoothing first
//   node utilities/shot_read.mjs --skip=hotel a.png    # without zb-shot-hotel.js
import fs from 'node:fs';
import { site, pageScripts, archiveBytes, archiveNames, haveDisc } from './load.mjs';
import { readPng } from './png.mjs';

if (!haveDisc()) {
  console.log('SKIP: needs reference/disc/DATA');
  process.exit(0);
}
const flags = process.argv.slice(2).filter(a => a.startsWith('-')), files = process.argv.slice(2).filter(a => !a.startsWith('-'));
/* --skip=hotel,caves leaves out those places' readers, as while one is half written */
const skipped = (flags.find(f => f.startsWith('--skip=')) || '').slice(7).split(',').filter(Boolean).map(k => `js/zb-shot-${k}.js`);
const S = site({ files: pageScripts().filter(f => f.startsWith('js/') && !f.startsWith('js/page-') && !skipped.includes(f)) });
const archives = new Map(archiveNames().map(n => [n, S.openMohawk(archiveBytes(n))]));
const TRAITS = ['hair', 'eyes', 'nose', 'feet'];
const code = t => TRAITS.map(k => t[k] ?? '?').join('');
/* a puzzle's state without the frame's arrays and the Zoombinis' parts */
const plain = (k, v) => (ArrayBuffer.isView(v) ? undefined : k === 'parts' || k === 'zoombinis' ? undefined : v);

/* A PNG enlarged `scale` times with smoothing, as a browser shows one. */
function enlarge(png, scale) {
  const w = Math.floor(png.width * scale), h = Math.floor(png.height * scale), rgba = new Uint8Array(w * h * 4);
  const at = (x, y, k) => png.rgba[4 * (Math.min(png.height - 1, Math.max(0, y)) * png.width + Math.min(png.width - 1, Math.max(0, x))) + k];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / scale - 0.5, y0 = Math.floor(v), fy = v - y0;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / scale - 0.5, x0 = Math.floor(u), fx = u - x0, o = 4 * (y * w + x);
      for (let k = 0; k < 3; k++) rgba[o + k] = Math.round((at(x0, y0, k) * (1 - fx) + at(x0 + 1, y0, k) * fx) * (1 - fy) + (at(x0, y0 + 1, k) * (1 - fx) + at(x0 + 1, y0 + 1, k) * fx) * fy);
      rgba[o + 3] = 255;
    }
  }
  return { rgba, width: w, height: h };
}

for (const file of files) {
  let png = readPng(new Uint8Array(fs.readFileSync(file)));
  const smooth = +(flags.find(f => f.startsWith('--smooth=')) || '').slice(9);
  if (smooth) png = enlarge(png, smooth);
  const t = Date.now(), r = S.zbShotRead(png.rgba, png.width, png.height, archives);
  console.log(`${file}: ${png.width} x ${png.height}, ${r.place || 'no place'}${r.picture ? ` tBMP ${r.picture}` : ''}, fit ${(100 * r.fit).toFixed(1)}%,`
    + ` ${r.shot.smoothed ? 'smoothed, ' : ''}${r.zoombinis.length} Zoombinis, ${Date.now() - t} ms`);
  if (flags.includes('-v')) {
    for (const z of r.zoombinis) {
      console.log(`  (${z.x}, ${z.y}) ${code(z.traits)}${z.where ? ' ' + (typeof z.where === 'string' ? z.where : JSON.stringify(z.where)) : ''}${Object.keys(z.inferred || {}).length ? ', inferred ' + Object.keys(z.inferred).join(' ') : ''}`);
    }
  }
  if (flags.includes('--json') && r.puzzle) console.log(JSON.stringify(r.puzzle.state || r.puzzle, plain, 1));
  else if (r.puzzle && r.puzzle.lines) for (const l of r.puzzle.lines) console.log('  ' + l);
}
