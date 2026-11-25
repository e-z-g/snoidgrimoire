// Island Odyssey's disc (reference/island-odyssey, or $ZB_ODYSSEY): the
// ISO 9660 side read a piece at a time by zb-mountain.js's reader, against
// the disc unpacked with bsdtar, then every bundle's entries and every
// frame of every .ao against zoombini-workbench's tools/odyssey/io_oracle.py
// (io_bundle.py), pixel for pixel, each place's XML, and last the page
// (utilities/odyssey_page.mjs).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REF, site } from './load.mjs';

const IO = process.env.ZB_ODYSSEY || path.join(REF, 'island-odyssey');
const ISO = path.join(IO, 'ZoombinisIO.iso'), DISC = path.join(IO, 'disc');
if (!fs.existsSync(ISO) || !fs.existsSync(DISC)) { console.log(`SKIP: no ${ISO} with disc/ beside it`); process.exit(0); }
const tools = path.join(process.env.ZB_TOOLS || path.join(ROOT, 'reference', 'tools'), 'odyssey');
if (!fs.existsSync(path.join(tools, 'io_oracle.py'))) { console.log(`SKIP: no ${tools}/io_oracle.py`); process.exit(0); }

const S = site({ files: ['js/zb-mountain.js', 'js/zb-odyssey.js'] });
let bad = 0;
const fail = m => { if (bad++ < 40) console.log('FAIL ' + m); };

// The ISO read a piece at a time, against the disc unpacked.
const fd = fs.openSync(ISO, 'r');
let reads = 0;
const iso = await S.mrIsoFiles(async (a, z) => { reads++; const b = Buffer.alloc(z - a); fs.readSync(fd, b, 0, z - a, a); return new Uint8Array(b); });
const unpacked = [];
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else unpacked.push(path.relative(DISC, p).split(path.sep).join('/')); } };
walk(DISC);
const isoBy = new Map(iso.map(f => [f.path, f]));
if (iso.length !== unpacked.length) fail(`${iso.length} files on the ISO, ${unpacked.length} unpacked`);
for (const p of unpacked) {
  const f = isoBy.get(p);
  if (!f) { fail(`${p} is not among the ISO's files`); continue; }
  if (f.size !== fs.statSync(path.join(DISC, p)).size) fail(`${p} differs in size`);
}
if (!S.ioLooksLike(iso.map(f => f.path))) fail('ioLooksLike does not recognize the disc');
const game = S.ioGameFiles(iso, f => f.path);
const bundles = [...game.keys()].filter(k => /^rsc\/.*\.bul$/.test(k));

// Every bundle, read from the ISO, against the Python: entries and frames.
const paths = bundles.map(k => path.join(DISC, game.get(k).path));
const py = spawnSync('python3', ['-I', path.join(tools, 'io_oracle.py'), ...paths], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (py.status !== 0) { console.log('FAIL: io_oracle.py\n' + py.stderr); process.exit(1); }
const oracle = JSON.parse(py.stdout);
let entries = 0, frames = 0;
for (const k of bundles) {
  const f = game.get(k), b = Buffer.alloc(f.size);
  fs.readSync(fd, b, 0, f.size, f.offset);
  const bytes = new Uint8Array(b);
  const expected = oracle[path.basename(f.path).toLowerCase()];
  let es;
  try { es = S.ioEntries(bytes); } catch (e) { fail(`${k}: ${e.message}`); continue; }
  entries += es.length;
  if (JSON.stringify(es.map(e => [e.name, e.start, e.end])) !== JSON.stringify(expected.map(e => [e.name, e.start, e.end]))) { fail(`${k}'s entries differ from io_bundle.py's`); continue; }
  const colors = new Map(es.filter(e => /\.rgb$/i.test(e.name)).map(e => [e.name.slice(0, -4).toLowerCase(), S.ioPalette(bytes, e.start)]));
  for (const e of expected) {
    if (!e.frames) continue;
    const ao = S.ioAo(bytes, e.start);
    e.frames.forEach((h, i) => {
      frames++;
      const p = S.ioAoFrame(bytes, ao, i, colors.get(e.name.slice(0, -3).toLowerCase()));
      if (crypto.createHash('sha1').update(Buffer.from(p.data.buffer, p.data.byteOffset, p.data.byteLength)).digest('hex') !== h) fail(`${k} ${e.name} frame ${i} differs from io_bundle.py's`);
    });
  }
}

// Each place's XML, with its background in z3bkgd.
const bk = game.get('rsc/z3bkgd.bul'), bkb = Buffer.alloc(bk.size);
fs.readSync(fd, bkb, 0, bk.size, bk.offset);
const backgrounds = new Set(S.ioEntries(new Uint8Array(bkb)).map(e => e.name.toLowerCase()));
let helps = 0;
for (const p of S.IO_PLACES) {
  const f = game.get(`scripts/${p.key}.xml`);
  if (!f) { fail(`${p.key} has no XML`); continue; }
  const b = Buffer.alloc(f.size); fs.readSync(fd, b, 0, f.size, f.offset);
  const x = S.ioPlaceXml(new TextDecoder('windows-1252').decode(b));
  if (x.background && !backgrounds.has(x.background + '.jpg')) fail(`${p.key}'s background ${x.background} is not in z3bkgd`);
  if (p.kind === 'puzzle' && x.help.some(h => !h.length)) fail(`${p.name} lacks help at a level`);
  helps += x.help.reduce((n, h) => n + h.length, 0);
}
fs.closeSync(fd);

// The page, in headless Chrome (utilities/odyssey_page.mjs).
const page = spawnSync('node', [path.join(ROOT, 'utilities', 'odyssey_page.mjs')], { encoding: 'utf8', timeout: 600000 });
const pageOut = (page.stdout || '') + (page.stderr || '');
if (page.status !== 0) { bad++; console.log(pageOut.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 20).join('\n') || 'FAIL the page check'); }
const pageNote = /^SKIP/m.test(pageOut) ? ' The page was not opened (' + pageOut.trim() + ').' : page.status === 0 ? ' The page opens it and shows every view, desktop and phone.' : '';
console.log(`${iso.length} files on the ISO in ${reads} reads, ${game.size} of the game's. ${bundles.length} bundles, ${entries} entries and ${frames} frames, ${bad ? bad + ' wrong' : 'every one as io_bundle.py reads it, pixel for pixel'}. ${S.IO_PLACES.length} places' XML with ${helps} pages of help.` + pageNote);
process.exit(bad ? 1 : 0);
