// Mountain Rescue's disc (reference/mountain-rescue, or $ZB_MOUNTAIN): the
// ISO 9660 side read a piece at a time by js/zb-mountain.js against the disc
// unpacked with bsdtar, file for file and byte for byte where sampled, and
// every picture against zoombini-workbench's tools/mountain/mr_bitmap.py,
// and every .bmt against Pillow, pixel for pixel (utilities/oracle.py
// mountain). Then every path, the slots of every .anm and the archive.org
// listing's reader.
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

fs.closeSync(fd);
console.log(`${iso.length} files on the ISO in ${reads} reads (${sampled} compared byte for byte), ${game.size} of the game's. `
  + `${counts.bb} .bb, ${counts.rb} .rb, ${counts.an} .an and ${counts.anm} .anm, with ${counts.frames} frames, `
  + `${bad ? bad + ' wrong' : 'every one pixel for pixel as mr_bitmap.py'} (${counts.dropped} pixels past the width dropped). `
  + `${counts.bmt} .bmt as Pillow reads them, and ${counts.pat} .pat with ${counts.legs} legs.`);
process.exit(bad ? 1 : 0);
