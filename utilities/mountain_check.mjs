// Mountain Rescue's disc (reference/mountain-rescue, or $ZB_MOUNTAIN): the
// ISO 9660 side read a piece at a time by js/zb-mountain.js against the disc
// unpacked with bsdtar, file for file and byte for byte where sampled, and
// every picture against zoombini-workbench's tools/mountain/mr_bitmap.py,
// and every .bmt against Pillow, pixel for pixel (utilities/oracle.py
// mountain). Then every path, the slots of every .anm and the archive.org
// listing's reader, and last the page (utilities/mountain_page.mjs).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REF, site } from './load.mjs';

const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue');
const ISO = path.join(MR, 'Zoombinis.iso'), DISC = path.join(MR, 'disc');
if (!fs.existsSync(ISO) || !fs.existsSync(DISC)) { console.log(`SKIP: no ${ISO} with disc/ beside it`); process.exit(0); }

const S = site({ files: ['js/zb-mountain.js'] });
let bad = 0;
const fail = m => { if (bad++ < 40) console.log('FAIL ' + m); };
const sha = a => crypto.createHash('sha1').update(a).digest('hex');

// The ISO read a piece at a time.
const fd = fs.openSync(ISO, 'r');
let reads = 0;
const read = async (a, z) => { reads++; const b = Buffer.alloc(z - a); fs.readSync(fd, b, 0, z - a, a); return new Uint8Array(b); };
const iso = await S.mrIsoFiles(read);
const unpacked = [];
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else unpacked.push(path.relative(DISC, p).split(path.sep).join('/')); } };
walk(DISC);
const isoBy = new Map(iso.map(f => [f.path, f]));
if (iso.length !== unpacked.length) fail(`${iso.length} files on the ISO, ${unpacked.length} unpacked`);
let sampled = 0;
unpacked.forEach((p, i) => {
  const f = isoBy.get(p);
  if (!f) { fail(`${p} is not among the ISO's files`); return; }
  const size = fs.statSync(path.join(DISC, p)).size;
  if (f.size !== size) fail(`${p} is ${f.size} bytes on the ISO, ${size} unpacked`);
  if (i % 50 === 0) {
    sampled++;
    const b = Buffer.alloc(f.size); fs.readSync(fd, b, 0, f.size, f.offset);
    if (!b.equals(fs.readFileSync(path.join(DISC, p)))) fail(`${p} differs from the unpacked file`);
  }
});

// The game's files among them, and the disc recognized.
const game = S.mrGameFiles(iso, f => f.path);
if (!S.mrLooksLike(iso.map(f => f.path))) fail('mrLooksLike does not recognize the disc');
if (!S.mrLooksLike(unpacked.filter(p => p.startsWith('Data/')).map(p => p.slice(5)))) fail('mrLooksLike does not recognize the Data folder alone');
for (const p of S.MR_PLACES) if (!game.has('bmp/' + p.background)) fail(`${p.name}'s background bmp/${p.background} is not on the disc`);
for (const k of Object.keys(S.MR_PUZZLES)) if (!S.MR_PLACE_BY_KEY.has(k)) fail(`the puzzle ${k} is not a place`);

// Every picture against the Python, pixel for pixel.
const py = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'mountain', DISC], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (py.status !== 0) { console.log('FAIL: oracle.py\n' + py.stderr); process.exit(1); }
const oracle = JSON.parse(py.stdout);
const bytesOf = p => new Uint8Array(fs.readFileSync(path.join(DISC, p)));
const counts = { bb: 0, rb: 0, an: 0, anm: 0, frames: 0, bmt: 0, pat: 0, legs: 0, dropped: 0 };
for (const [p, expected] of Object.entries(oracle)) {
  const ext = p.toLowerCase().split('.').pop(), b = bytesOf(p);
  try {
    if (ext === 'bb' || ext === 'rb' || ext === 'bmt') {
      const pic = ext === 'bb' ? S.mrReadBb(b) : ext === 'rb' ? S.mrReadRb(b) : S.mrReadBmp(b);
      counts[ext]++; counts.dropped += pic.dropped;
      if (sha(pic.data) !== expected) fail(`${p} differs from the Python`);
    } else if (ext === 'an') {
      const frames = S.mrReadAn(b);
      counts.an++; counts.frames += frames.length;
      if (frames.length !== expected.length) fail(`${p} has ${frames.length} frames, ${expected.length} in the Python`);
      frames.forEach((f, i) => { if (sha(f.data) !== expected[i]) fail(`${p} frame ${i} differs from the Python`); });
    } else if (ext === 'anm') {
      const slots = S.mrAnmSlots(b);
      counts.anm++;
      const filled = slots.map((s, i) => [i, s]).filter(([, s]) => s);
      if (filled.length !== Object.keys(expected).length) fail(`${p} has ${filled.length} slots filled, ${Object.keys(expected).length} in the Python`);
      for (const [i, frames] of filled) {
        const e = expected[String(i)];
        if (!e || e.length !== frames.length) { fail(`${p} slot ${i}`); continue; }
        frames.forEach((f, k) => { counts.frames++; if (sha(S.mrAnmFrame(b, f).data) !== e[k]) fail(`${p} slot ${i} frame ${k} differs from the Python`); });
      }
      const views = S.mrAnmViews(slots);
      for (const [v, parts] of views) if (parts[0].length && !(parts[0].length === 1 && parts[0][0] === 0)) fail(`${p} view ${v} has a body of value ${parts[0]}`);
    }
  } catch (e) { fail(`${p} (${e.message})`); }
}
for (const p of unpacked) {
  const ext = p.toLowerCase().split('.').pop();
  try {
    if (ext === 'pat') {
      const legs = S.mrReadPat(new TextDecoder('latin1').decode(bytesOf(p)));
      counts.pat++; counts.legs += legs.length;
      if (!legs.length || legs.some(l => l.points.length < 2)) fail(`${p} reads ${legs.length} legs`);
    }
  } catch (e) { fail(`${p} (${e.message})`); }
}

// archive.org's listing: rows as it serves them, made up here, with a
// folder, a name with spaces and an ampersand.
{
  const row = (p, n) => `<tr><td><a href="//archive.org/download/x/Zoombinis.iso/${p}">${p.split('/').pop()}</a><td><td>2001-09-25 17:02:14<td id="size">${n}</tr>`;
  const html = '<table>' + row('AUTORUN.INF', 157) + '<tr><td>Data<td><td>2001-09-25 17:17:54<td id="size"></tr>'
    + row('Data/Bmp/waterslide/pipes%20-%20blue/Pipe%20-%20hard%2001.rb', 7314) + row('Data/A&amp;B.wav', 2) + '</table>';
  const actual = S.mrArchiveListing(html, 'Zoombinis.iso');
  const expected = [['AUTORUN.INF', 157], ['Data/Bmp/waterslide/pipes - blue/Pipe - hard 01.rb', 7314], ['Data/A&B.wav', 2]];
  if (JSON.stringify(actual.map(f => [f.path, f.size])) !== JSON.stringify(expected)) fail(`the listing reads ${JSON.stringify(actual)}`);
}

// Each .anm's time a frame and each .an's timelines, read from the program's
// machine code, against zoombini-workbench's tools/mountain/mr_rates.py and
// mr_an_times.py, which read the decompile.
// BigZomb.anm's time is pushed from a register, which the page leaves out.
let timesNote = '';
{
  const exe = path.join(DISC, 'INSTALL', 'HD', 'zoombini2.exe');
  const decompile = path.join(MR, 'ghidra', 'zoombini2-full.c');
  const tools = path.join(process.env.ZB_TOOLS || path.join(ROOT, 'reference', 'tools'), 'mountain');
  if (fs.existsSync(exe) && fs.existsSync(decompile) && fs.existsSync(path.join(tools, 'mr_rates.py'))) {
    const r = spawnSync('python3', ['-I', path.join(tools, 'mr_rates.py'), decompile, exe], { encoding: 'utf8' });
    if (r.status !== 0) fail('mr_rates.py\n' + r.stderr);
    else {
      const expected = Object.entries(JSON.parse(r.stdout)).filter(([, ms]) => ms > 0);
      const actual = S.mrAnmFrameTimes(new Uint8Array(fs.readFileSync(exe)));
      for (const [p, ms] of expected) if (actual.get(p) !== ms) fail(`${p} is ${actual.get(p)} ms a frame, expected ${ms}`);
      if (actual.size !== expected.length) fail(`${actual.size} .anm frame times read, expected ${expected.length}`);
      timesNote = ` The ${actual.size} .anm frame times as mr_rates.py reads them.`;
    }
  } else timesNote = ' The .anm frame times not compared (no decompile or mr_rates.py).';
  // Each .an's timelines, from the machine code, against mr_an_times.py's
  // reading of the decompile, all of a name's timelines together.
  if (fs.existsSync(exe) && fs.existsSync(decompile) && fs.existsSync(path.join(tools, 'mr_an_times.py'))) {
    const r = spawnSync('python3', ['-I', path.join(tools, 'mr_an_times.py'), decompile, exe], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) fail('mr_an_times.py\n' + r.stderr);
    else {
      const group = (list, key) => { const g = new Map(); for (const x of list) { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k).push(JSON.stringify(x.frames)); } for (const v of g.values()) v.sort(); return g; };
      const lines = S.mrAnTimelines(new Uint8Array(fs.readFileSync(exe)));
      const actual = group(lines, x => x.name);
      const expected = group(JSON.parse(r.stdout), x => S.mrProgramPath(x.name).replace(/\.bmp$/, '.an'));
      for (const [k, v] of expected) if (JSON.stringify(actual.get(k) || []) !== JSON.stringify(v)) fail(`${k}'s timelines read ${JSON.stringify(actual.get(k) || [])}, expected ${JSON.stringify(v)}`.slice(0, 300));
      for (const k of actual.keys()) if (!expected.has(k)) fail(`${k} has a timeline mr_an_times.py does not`);
      const anKeys = [...game.keys()].filter(k => /\.an$/.test(k));
      timesNote += ` The ${lines.length} .an timelines of ${expected.size} names as mr_an_times.py reads them, for ${anKeys.filter(k => S.mrAnTimeline(lines, k)).length} of the ${anKeys.length} .an files.`;
    }
  }
  // The voices the program names, from its strings and their references,
  // against mr_voices.py's reading of the decompile, place by place.
  const split = path.join(MR, 'ghidra', 'split');
  if (fs.existsSync(exe) && fs.existsSync(split) && fs.existsSync(path.join(tools, 'mr_voices.py'))) {
    const r = spawnSync('python3', ['-I', path.join(tools, 'mr_voices.py'), split, exe, path.join(DISC, 'Data', 'Sounds'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) fail('mr_voices.py\n' + r.stderr);
    else {
      const expected = Object.entries(JSON.parse(r.stdout));
      const keys = expected.map(([f]) => 'sounds/' + f.toLowerCase());
      const actual = S.mrVoicesNamed(new Uint8Array(fs.readFileSync(exe)), keys);
      let named = 0;
      for (const [f, where] of expected) {
        const k = 'sounds/' + f.toLowerCase();
        if (where.length) named++;
        if (!!where.length !== actual.has(k)) fail(`${f} is ${actual.has(k) ? 'named' : 'not named'} by the page and ${where.length ? 'named' : 'not named'} by mr_voices.py`);
      }
      timesNote += ` ${named} of the ${expected.length} voices named by the program as mr_voices.py finds them.`;
    }
  }
}

// The preview of the 1996 look (zb-mountain-look.js): the walking
// Zoombini's 16 views a full circle in steps of 22.5 degrees, each
// direction the 1996 program has picked for some view, straight down,
// up, left and right as the 1996 walks go, and the traits by name, one
// 1996 value each, and stand-ins only for the white and pink noses.
{
  const L = site({ files: ['js/zb-puzzle.js', 'js/zb-snoid.js', 'js/zb-mountain-look.js'] });
  const key = [...game.keys()].find(k => /zombis\/littlezomb\.anm$/.test(k));
  const views = key ? [...S.mrAnmViews(S.mrAnmSlots(bytesOf(game.get(key).path))).keys()] : [];
  const angles = views.map(v => L.mrLookAngle(v)).sort((a, b) => a - b);
  if (views.length !== 16 || angles.some((a, i) => a !== i * 22.5)) fail(`littlezomb's views are at ${angles.join(', ')} degrees, not every 22.5`);
  const dirs = new Set(views.map(v => L.mrLookWalk(v, 1).dir));
  if (dirs.size !== 5) fail(`the views pick ${dirs.size} of the 1996 walk's 5 directions`);
  for (const [v, dir, facing] of [[22, 0, 0], [88, 4, 0], [66, 2, 0], [44, 2, 1]]) {
    const w = L.mrLookWalk(v, 1);
    if (w.dir !== dir || w.facing !== facing) fail(`view ${v} walks ${w.dir} facing ${w.facing}, not ${dir} facing ${facing}`);
  }
  const stands = [];
  for (const part of ['feet', 'nose', 'hair', 'eyes']) {
    const got = [1, 2, 3, 4, 5].map(v => L.mrLookTrait(part, v));
    if (new Set(got.map(t => t.value)).size !== 5) fail(`${part}: two Mountain Rescue values share a 1996 value`);
    got.forEach((t, i) => { if (t.stand) stands.push(L.MR_LOOK_NAMES[part][i]); });
  }
  if (stands.join() !== 'White,Pink') fail(`stand-ins for ${stands.join(', ')}, not the white and pink noses`);
  // the 1996 walk at the 1996 game's pace, a 102 ms tick over 50 ms frames
  const paced = [0, 1, 2, 3, 4, 5, 16, 17].map(i => L.mrLookTick(i, 50, 8, 102));
  if (paced.join() !== '0,0,0,1,1,2,7,0') fail(`the 1996 ticks over Mountain Rescue's frames are ${paced.join()}`);
}

fs.closeSync(fd);
// The page, in headless Chrome (utilities/mountain_page.mjs).
const page = spawnSync('node', [path.join(ROOT, 'utilities', 'mountain_page.mjs')], { encoding: 'utf8', timeout: 600000 });
const pageOut = (page.stdout || '') + (page.stderr || '');
if (page.status !== 0) { bad++; console.log(pageOut.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 20).join('\n') || 'FAIL the page check'); }
const pageNote = /^SKIP/m.test(pageOut) ? ' The page was not opened (' + pageOut.trim() + ').' : page.status === 0 ? ' The page opens it and shows every view, desktop and phone.' : '';
console.log(`${iso.length} files on the ISO in ${reads} reads (${sampled} compared byte for byte), ${game.size} of the game's. `
  + `${counts.bb} .bb, ${counts.rb} .rb, ${counts.an} .an and ${counts.anm} .anm, with ${counts.frames} frames, `
  + `${bad ? bad + ' wrong' : 'every one pixel for pixel as mr_bitmap.py'} (${counts.dropped} pixels past the width dropped). `
  + `${counts.bmt} .bmt as Pillow reads them, and ${counts.pat} .pat with ${counts.legs} legs.` + timesNote + pageNote);
process.exit(bad ? 1 : 0);
