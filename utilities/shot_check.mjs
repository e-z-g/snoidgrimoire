// The screenshot reader (js/zb-shot.js), two ways:
//
//   - screenshots made here: a band dealt at each place drawn where the
//     program puts it to wait (ZB_WAITING), over the place's picture, in
//     the Windows colors and the stored ones, enlarged by several factors
//     with each pixel copied, and some cropped. The reader finds the place,
//     the offset and every Zoombini, and reads no trait wrong. A Zoombini
//     mostly behind others may go unread or have a trait inferred, and the
//     check counts those;
//   - screenshots taken in the game, in reference/screenshots (or
//     $ZB_SCREENSHOTS), each with a .json beside it of what a person read
//     off it by eye: the place, each Zoombini's origin and traits (four
//     digits, as zbBandCode writes them), and for the cliffs the pegs gone
//     and the rule. The reader matches all of it.
//
//   node utilities/shot_check.mjs        # both
//   node utilities/shot_check.mjs -v     # and every Zoombini read
//
// The screenshots taken in the game are game-derived, so they are in
// zoombini-reference, not here.
import fs from 'node:fs';
import path from 'node:path';
import { site, archiveBytes, archiveNames, haveDisc, REF } from './load.mjs';
import { readPng } from './png.mjs';

const TRAITS = ['hair', 'eyes', 'nose', 'feet'];
const DIR = process.env.ZB_SCREENSHOTS || path.join(REF, 'screenshots');
if (!haveDisc()) {
  console.log('SKIP: needs reference/disc/DATA');
  process.exit(0);
}
const verbose = process.argv.includes('-v');
let failures = 0;
const fail = m => { failures++; console.log('FAIL', m); };
const S = site();
const archives = new Map(archiveNames().map(n => [n, S.openMohawk(archiveBytes(n))]));
const sheet = S.zbSnoidSheet(archives.get('ZOOMBINI'));
const code = t => TRAITS.map(k => t[k] ?? '?').join('');

// ---- screenshots made here --------------------------------------------------

/* A place's picture with a band standing at its waiting places, as 640 x 480
   indices, and where each Zoombini stands. */
function scene(key, band) {
  const arc = archives.get(key), pic = S.zbPlacePicture(arc, key, 1);
  const frame = S.decodeBitmapResource(arc.get('tBMP', pic.layers[0].id)).frames[0];
  const pixels = Uint8Array.from(frame.pixels);
  const placed = S.zbBandWaiting(key, band);
  for (const p of placed) {
    for (const part of S.zbZoombiniPlacements(sheet, p.z)) {
      const f = sheet.frames[part.frame];
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          const v = f.pixels[y * f.width + x], X = p.x + part.x + x, Y = p.y + part.y + y;
          if (v && X >= 0 && Y >= 0 && X < 640 && Y < 480) pixels[Y * 640 + X] = v;
        }
      }
    }
  }
  const pal = S.zbPalette(S.parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL'));
  return { pixels, pal, placed };
}
/* The indices as a screenshot: in the Windows colors through a 6-bit DAC or
   in the stored ones, enlarged by `scale` with each pixel copied (screen
   pixel j shows frame pixel floor((j + 0.5) / scale)), without `cut` frame
   pixels at the left and top and `cutEnd` at the right and bottom. */
function shoot({ pixels, pal }, { windows, scale, cut = 0, cutEnd = 0 }) {
  const colors = windows ? S.zbWindowsPalette(pal).map(c => c.map(v => ((v >> 2) << 2) | (v >> 6))) : pal;
  const w = Math.floor((640 - cut - cutEnd) * scale), h = Math.floor((480 - cut - cutEnd) * scale);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = cut + Math.floor((y + 0.5) / scale);
    for (let x = 0; x < w; x++) {
      const c = colors[pixels[sy * 640 + cut + Math.floor((x + 0.5) / scale)]], o = 4 * (y * w + x);
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
    }
  }
  return { rgba, width: w, height: h };
}

if (!process.argv.includes('--smoothed')) {
  const ways = [
    { windows: true, scale: 1 }, { windows: false, scale: 1 }, { windows: true, scale: 2 },
    { windows: true, scale: 1.5, cut: 3 }, { windows: false, scale: 1.439, cut: 2, cutEnd: 4 },
  ];
  const keys = Object.keys(S.ZB_WAITING).filter(k => !S.ZB_WAITING[k].small);
  let read = 0, unread = 0, inferred = 0, all = 0;
  const t = Date.now();
  keys.forEach((key, i) => {
    const band = S.zbDealBand(S.zbRandom(1000 + i), 16), sc = scene(key, band);
    const way = ways[i % ways.length], shot = shoot(sc, way);
    const r = S.zbShotRead(shot.rgba, shot.width, shot.height, archives);
    const about = `${key} (${way.windows ? 'Windows' : 'stored'} colors, x${way.scale}${way.cut ? `, cut ${way.cut}` : ''})`;
    if (r.place !== key) { fail(`${about} read as ${r.place}`); return; }
    if (r.dx !== (way.cut || 0) || r.dy !== (way.cut || 0)) fail(`${about} at (${r.dx}, ${r.dy}), not ${way.cut || 0}`);
    if (r.windows !== way.windows) fail(`${about} read in the ${r.windows ? 'Windows' : 'stored'} colors`);
    for (const p of sc.placed) {
      all++;
      const z = r.zoombinis.find(g => g.x === p.x && g.y === p.y);
      if (!z) {
        // a Zoombini drawn wholly behind others, or off the part shown
        unread += 4;
        if (verbose) console.log(`  ${about}, none read at (${p.x}, ${p.y}), ${S.zbBandCode([p.z])}`);
        continue;
      }
      for (const k of TRAITS) {
        if (z.traits[k] == null) { unread++; continue; }
        const how = z.inferred && z.inferred[k] ? 'inferred' : 'read';
        if (z.traits[k] !== p.z[k]) fail(`${about}, (${p.x}, ${p.y}) has ${k} ${z.traits[k]} ${how}, not ${p.z[k]}`);
        else if (how === 'inferred') inferred++;
        else read++;
      }
    }
    const extra = r.zoombinis.filter(g => !sc.placed.some(p => g.x === p.x && g.y === p.y));
    for (const g of extra) fail(`${about}, a Zoombini read at (${g.x}, ${g.y}) where none stands`);
  });
  console.log(`Made here, ${keys.length} places and ${all} Zoombinis. ${read} traits read, ${inferred} inferred and ${unread} unread, in ${Date.now() - t} ms.`);
}

// ---- smoothed screenshots made here -------------------------------------------

/* The indices as a smoothed screenshot `w` x `h`: screen pixel (x, y)
   shows the frame between its pixels at ((x + 0.5) / scale + cutX,
   (y + 0.5) / scale + cutY), as a browser enlarges a picture with
   smoothing. */
function shootSmooth({ pixels, pal }, { windows, scale, cutX = 0, cutY = 0, w, h }) {
  const colors = windows ? S.zbWindowsPalette(pal).map(c => c.map(v => ((v >> 2) << 2) | (v >> 6))) : pal;
  w = w || Math.floor((640 - cutX) * scale);
  h = h || Math.floor((480 - cutY) * scale);
  const rgba = new Uint8Array(w * h * 4);
  const at = (x, y) => colors[pixels[Math.min(479, Math.max(0, y)) * 640 + Math.min(639, Math.max(0, x))]];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / scale + cutY - 0.5, y0 = Math.floor(v), fy = v - y0;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / scale + cutX - 0.5, x0 = Math.floor(u), fx = u - x0, o = 4 * (y * w + x);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      for (let k = 0; k < 3; k++) rgba[o + k] = Math.round((a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy);
      rgba[o + 3] = 255;
    }
  }
  return { rgba, width: w, height: h };
}

if (!process.argv.includes('--exact')) {
  const ways = [
    { windows: true, scale: 1.325, crop: [310, 320] }, { windows: true, scale: 2 },
    { windows: false, scale: 1.6, crop: [500, 375] }, { windows: true, scale: 1.25 },
  ];
  const keys = Object.keys(S.ZB_WAITING).filter(k => !S.ZB_WAITING[k].small);
  let read = 0, unread = 0, all = 0;
  const t = Date.now();
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
  keys.forEach((key, i) => {
    if (only && key !== only) return;
    const band = S.zbDealBand(S.zbRandom(2000 + i), 16), sc = scene(key, band), way = { ...ways[i % ways.length] };
    if (way.crop) {
      /* a part of the frame around the band */
      const xs = sc.placed.map(p => p.x), ys = sc.placed.map(p => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2 - 20;
      way.cutX = Math.round(Math.min(640 - way.crop[0], Math.max(0, cx - way.crop[0] / 2)));
      way.cutY = Math.round(Math.min(480 - way.crop[1], Math.max(0, cy - way.crop[1] / 2)));
      way.w = Math.floor(way.crop[0] * way.scale);
      way.h = Math.floor(way.crop[1] * way.scale);
    }
    const shot = shootSmooth(sc, way), t1 = Date.now();
    const r = S.zbShotRead(shot.rgba, shot.width, shot.height, archives);
    const about = `${key} smoothed (${way.windows ? 'Windows' : 'stored'} colors, x${way.scale}${way.crop ? `, from (${way.cutX}, ${way.cutY})` : ''})`;
    if (r.place !== key) { fail(`${about} read as ${r.place}`); return; }
    if (Math.abs(r.dx - (way.cutX || 0)) > 1 || Math.abs(r.dy - (way.cutY || 0)) > 1) fail(`${about} at (${r.dx}, ${r.dy})`);
    if (Math.abs(r.shot.scaleX / way.scale - 1) > 0.005 || Math.abs(r.shot.scaleY / way.scale - 1) > 0.005) fail(`${about} enlarged ${r.shot.scaleX} x ${r.shot.scaleY}`);
    if (r.windows !== way.windows) fail(`${about} read in the ${r.windows ? 'Windows' : 'stored'} colors`);
    const near = (g, p) => Math.abs(g.x - p.x) <= 1 && Math.abs(g.y - p.y) <= 1;
    let here = 0;
    for (const p of sc.placed) {
      const shown = p.x >= (way.cutX || 0) && p.x < (way.cutX || 0) + shot.width / way.scale && p.y >= (way.cutY || 0) && p.y < (way.cutY || 0) + shot.height / way.scale;
      if (!shown) continue;
      all++;
      const z = r.zoombinis.find(g => near(g, p));
      if (!z) {
        unread += 4;
        if (verbose) console.log(`  ${about}, none read at (${p.x}, ${p.y}), ${S.zbBandCode([p.z])}`);
        continue;
      }
      here++;
      for (const k of TRAITS) {
        if (z.traits[k] == null) { unread++; continue; }
        if (z.traits[k] !== p.z[k]) fail(`${about}, (${p.x}, ${p.y}) has ${k} ${z.traits[k]}, not ${p.z[k]}`);
        else read++;
      }
    }
    for (const g of r.zoombinis.filter(g => !sc.placed.some(p => near(g, p)))) fail(`${about}, a Zoombini read at (${g.x}, ${g.y}) where none stands`);
    if (verbose) console.log(`  ${about}: ${here} Zoombinis read, blur ${r.shot.blur}, tolerance ${r.tolerance}, ${Date.now() - t1} ms`);
  });
  console.log(`Made here and smoothed, ${keys.length} places and ${all} Zoombinis. ${read} traits read and ${unread} unread, in ${Date.now() - t} ms.`);
}

// ---- screenshots taken in the game --------------------------------------------

if (process.argv.includes('--smoothed')) { /* the screenshots made here, smoothed, alone */ }
else if (!fs.existsSync(DIR)) console.log(`No screenshots taken in the game, as ${DIR} is missing`);
else {
  for (const name of fs.readdirSync(DIR).filter(f => f.endsWith('.png'))) {
    const expectedPath = path.join(DIR, name.replace(/\.png$/, '.json'));
    if (!fs.existsSync(expectedPath)) { fail(`${name} has no .json of what it shows`); continue; }
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    const png = readPng(new Uint8Array(fs.readFileSync(path.join(DIR, name))));
    const t = Date.now();
    const r = S.zbShotRead(png.rgba, png.width, png.height, archives);
    if (r.place !== expected.place) { fail(`${name} read as ${r.place}, not ${expected.place}`); continue; }
    const actual = r.zoombinis.map(z => ({ x: z.x, y: z.y, code: code(z.traits), inferred: Object.keys(z.inferred || {}) }));
    /* a smoothed screenshot places a Zoombini within a pixel */
    const slack = r.shot.smoothed ? 1 : 0, at = (a, e) => Math.abs(a.x - e.x) <= slack && Math.abs(a.y - e.y) <= slack;
    for (const e of expected.zoombinis) {
      const a = actual.find(z => at(z, e));
      if (!a) fail(`${name}, no Zoombini read at (${e.x}, ${e.y})`);
      else if (a.code !== e.code) fail(`${name}, (${e.x}, ${e.y}) read ${a.code}, not ${e.code}`);
    }
    for (const a of actual) if (!expected.zoombinis.some(e => at(a, e))) fail(`${name}, a Zoombini read at (${a.x}, ${a.y}) where none stands`);
    if (expected.pegsGone != null && (!r.puzzle || r.puzzle.pegsGone !== expected.pegsGone)) fail(`${name}, ${r.puzzle.pegsGone} pegs gone, not ${expected.pegsGone}`);
    if (expected.rules && r.puzzle) {
      const rules = r.puzzle.levels.flatMap(l => l.fitting.map(f => `${l.level}: ${S.zbBridgeRuleWords(f.rule)}, ${f.upperMatches ? 'upper' : 'lower'}`));
      if (JSON.stringify(rules) !== JSON.stringify(expected.rules)) fail(`${name}, the rules that fit are ${JSON.stringify(rules)}`);
    }
    if (verbose) for (const a of actual) console.log(`  (${a.x}, ${a.y}) ${a.code}${a.inferred.length ? `, ${a.inferred.join(' and ')} inferred` : ''}`);
    console.log(`Taken in the game, ${name}, ${png.width} x ${png.height}. It shows ${r.shot.width} x ${r.shot.height} of the frame at (${r.dx}, ${r.dy}),`
      + ` enlarged ${r.shot.scaleX.toFixed(4)} x ${r.shot.scaleY.toFixed(4)}${r.shot.smoothed ? ' with smoothing' : ''}, ${r.place} tBMP ${r.picture}, with ${r.zoombinis.length} Zoombinis. ${Date.now() - t} ms.`);
  }
}

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('OK');
