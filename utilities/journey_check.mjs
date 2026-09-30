// The journey (js/zb-journey.js) against the 1996 program and ScummVM's
// Zoombinis branch, each read here from its own files, not from the site:
//
//   - every place's, route's and level's name is the string the program
//     shows, at the offset ScummVM's kV11US_NETextEntries gives, in
//     reference/zombs-lair/HDD/ZOOMBINI/ZOOMBINI.EXE (the case and the line
//     breaks aside), and ZB_ARCHIVES calls each place's archive the same;
//   - each icon zbJourneyMap reads out of SCRB 1000 is the place ScummVM's
//     map page gives that shape, and the page's click point for it is
//     inside it, in RODMAP and in MAP;
//   - each stretch of road is the one ScummVM's names for the shapes say,
//     and the two places it runs between are the two icons that come
//     nearest its painted pixels;
//   - each place's background is the one its page class draws in
//     setBackgroundBitmap, and its picture fills 640 x 480 in a palette of
//     the same id.
import fs from 'node:fs';
import path from 'node:path';
import { site, archiveBytes, haveDisc, REF } from './load.mjs';

let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };
const S = site();
const SCUMM = path.join(REF, 'scummvm-zoombini', 'engines', 'mohawk');
const EXE = path.join(REF, 'zombs-lair', 'HDD', 'ZOOMBINI', 'ZOOMBINI.EXE');
if (!haveDisc() || !fs.existsSync(SCUMM)) { console.log('SKIP: no reference/disc/DATA or reference/scummvm-zoombini'); process.exit(0); }
const src = f => fs.readFileSync(path.join(SCUMM, f), 'utf8');

// ScummVM's page types and text keys, to the site's archive names.
const KEY = { Picker: 'PICKER', Bridge: 'BRIDGE', Tunnels: 'TUNNELS', Pizza: 'PIZZA', Basecamp1: 'BASECAMP', Ferry: 'FERRY',
  Lilly: 'LILLY', Slides: 'SLIDES', Fleens: 'FLEENS', Hotel: 'HOTEL', Net: 'NET', Basecamp2: 'BCTWO', Caves: 'CAVES',
  Smoke: 'SMOKE', Maze: 'MAZE2', Town: 'TOWN' };
const same = (a, b) => a.replace(/\s+/g, ' ').toLowerCase() === b.replace(/\s+/g, ' ').toLowerCase();

// ---- names, against the program ------------------------------------------
if (!fs.existsSync(EXE)) console.log('SKIP names: no ' + path.relative(process.cwd(), EXE));
else {
  const exe = fs.readFileSync(EXE);
  const text = src('zoombini_text.cpp');
  const table = /kV11US_NETextEntries\[\] = \{([\s\S]*?)\n\};/.exec(text)[1];
  const at = new Map([...table.matchAll(/ZoombiniText::k(\w+), 0x([0-9A-F]+), (\d+)\}/g)].map(m => [m[1], exe.subarray(parseInt(m[2], 16), parseInt(m[2], 16) + +m[3]).toString('latin1')]));
  let n = 0;
  for (const [k, arch] of Object.entries(KEY)) {
    const p = S.ZB_PLACE_BY_KEY.get(arch), want = at.get(k);
    if (!want) { fail(`kV11US_NETextEntries has no k${k}`); continue; }
    if (!same(p.name, want)) fail(`${arch} is "${p.name}"; the program has "${want}"`); else n++;
    if (S.ZB_ARCHIVES[arch].place !== p.name) fail(`ZB_ARCHIVES calls ${arch} "${S.ZB_ARCHIVES[arch].place}", the journey "${p.name}"`);
  }
  S.ZB_ROUTES.forEach((r, i) => { const want = at.get('Route' + (i + 1)); if (!same(r.name, want)) fail(`route ${i + 1} is "${r.name}"; the program has ${JSON.stringify(want)}`); else n++; });
  S.ZB_LEVELS.forEach((l, i) => { const want = at.get('Level' + (i + 1)); if (!same(l, want)) fail(`level ${i + 1} is "${l}"; the program has ${JSON.stringify(want)}`); else n++; });
  console.log(`names: ${n} of 24 are the program's`);
}

// ---- the map, against ScummVM's map page ---------------------------------
const rodH = src('zoombini_pages/interactive_rodmap.h');
const shapeOf = new Map([...rodH.matchAll(/kResShape(\w+) = (\d+),/g)].map(m => [m[1], +m[2]]));
const block = name => new RegExp(name + '\\[\\d+\\] = \\{([\\s\\S]*?)\\};').exec(rodH)[1];
const points = [...block('_pageClickPoints').matchAll(/Point\(0x([0-9A-F]+), 0x([0-9A-F]+)\)/g)].map(m => [parseInt(m[1], 16), parseInt(m[2], 16)]);
const types = [...block('_pageClickTypes').matchAll(/ZoombiniPageType::k(\w+)/g)].map(m => KEY[m[1]]);
const shapes = [...block('_pageClickShapes').matchAll(/kResShape(\w+)/g)].map(m => +/(\d+)$/.exec(m[1])[1]);
if (points.length !== 16 || types.length !== 16 || shapes.length !== 16) fail(`read ${points.length} click points, ${types.length} types, ${shapes.length} shapes from interactive_rodmap.h`);
const ROUTE_WORD = ['BigBadHungry', 'WhosBayou', 'DeepDarkForest', 'MontDespair'];

for (const name of ['RODMAP', 'MAP']) {
  let m;
  try { m = S.zbJourneyMap(S.openMohawk(archiveBytes(name))); } catch (e) { fail(`${name}: ${e.message}`); continue; }
  let ok = 0;
  for (let i = 0; i < 16; i++) {
    const p = S.ZB_PLACE_BY_KEY.get(types[i]);
    if (p.shape !== shapes[i]) { fail(`${types[i]} is shape ${p.shape} here and ${shapes[i]} in ScummVM`); continue; }
    // ScummVM's points are placed by hand, inside each icon but not at its
    // middle; it clicks a 40 x 30 box around each.
    const q = m.places.find(x => x.key === types[i]), [px, py] = points[i];
    if (px < q.x || py < q.y || px >= q.x + q.w || py >= q.y + q.h) fail(`${name}: ScummVM clicks ${p.name} at ${px}, ${py}, outside its icon (${q.x}, ${q.y}, ${q.w} x ${q.h})`);
    else ok++;
  }
  // The roads: the route and the order from ScummVM's names for the shapes,
  // and the ends from the map itself -- the two icons that come nearest the
  // road's painted pixels (not its box: the road into the Mirror Machine
  // bends round the Bubblewonder Abyss's icon), each within a few pixels.
  let roads = 0;
  for (const r of m.roads) {
    const word = [...shapeOf.entries()].find(([, v]) => v === r.shape);
    const hit = word && /^Route(\w+)P(\d)/.exec(word[0]);
    if (!hit || ROUTE_WORD.indexOf(hit[1]) !== r.route || S.ZB_ROUTES[r.route].segments.indexOf(r.shape) !== +hit[2]) {
      fail(`${name}: road shape ${r.shape} is route ${r.route + 1} here and ${word ? word[0] : 'nothing'} in ScummVM`);
      continue;
    }
    const f = m.sheet[r.frames[0]], painted = [];
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (f.pixels[y * f.width + x]) painted.push([r.x + x, r.y + y]);
    const gap = p => Math.min(...painted.map(([x, y]) => Math.hypot(Math.max(p.x - x, 0, x - (p.x + p.w - 1)), Math.max(p.y - y, 0, y - (p.y + p.h - 1)))));
    const near = m.places.map(p => ({ key: p.key, d: gap(p) })).sort((a, b) => a.d - b.d).slice(0, 2);
    const ends = [r.from, r.to].sort();
    if (near.map(n => n.key).sort().join() !== ends.join()) fail(`${name}: road shape ${r.shape} runs ${r.from} to ${r.to}, but the icons nearest its pixels are ${near.map(n => n.key).join(' and ')}`);
    else if (near[1].d > 12) fail(`${name}: road shape ${r.shape} stops ${near[1].d.toFixed(1)} pixels short of ${near[1].key}`);
    else roads++;
  }
  console.log(`${name}: ${ok} of 16 icons where ScummVM clicks them, ${roads} of ${m.roads.length} roads between the right places`);
}

// ---- the pictures, against the page classes --------------------------------
let pics = 0;
for (const f of fs.readdirSync(path.join(SCUMM, 'zoombini_pages')).filter(f => f.endsWith('.cpp'))) {
  const text = src('zoombini_pages/' + f);
  const arch = [...text.matchAll(/openArchive\((?:[^;]*?: )?ZMB_MHK_(\w+)\)/g)].find(a => S.ZB_PLACE_BY_KEY.has(a[1]));
  const body = /::setBackgroundBitmap\(\) \{([\s\S]*?)\n\}/.exec(text);
  if (!arch || !body || !S.ZB_PLACE_BY_KEY.has(arch[1])) continue;
  const ids = [...new Set([...body[1].matchAll(/kResBackground(\d+)/g)].map(x => +x[1]))].sort((a, b) => a - b);
  const p = S.ZB_PLACE_BY_KEY.get(arch[1]);
  const mine = [p.background, p.hard].filter(x => x != null);
  if (ids.join() !== mine.join()) fail(`${p.key}: background ${mine.join(', ')} here, ${ids.join(', ')} in ${f}`);
  const arc = S.openMohawk(archiveBytes(p.key));
  for (const level of [1, 2, 3, 4]) {
    const pic = S.zbPlacePicture(arc, p.key, level);
    if (!arc.has('SHPL', pic.palette)) fail(`${p.key}: no SHPL ${pic.palette} for its picture`);
    const cover = new Uint8Array(640 * 480);
    for (const l of pic.layers) {
      const fr = S.decodeBitmapResource(arc.get('tBMP', l.id)).frames[l.frame];
      for (let y = Math.max(0, l.y); y < Math.min(480, l.y + fr.height); y++) cover.fill(1, y * 640 + Math.max(0, l.x), y * 640 + Math.min(640, l.x + fr.width));
    }
    if (cover.includes(0)) fail(`${p.key} at level ${level}: its picture does not fill 640 x 480`);
  }
  pics++;
}
if (pics !== 16) fail(`found ${pics} of the 16 places' page classes`);
console.log(`pictures: ${pics} places' backgrounds are their page classes', each filling the screen at every level`);
process.exit(fails ? 1 : 0);
