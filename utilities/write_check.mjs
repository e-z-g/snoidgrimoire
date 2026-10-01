// Writing an archive back (js/zb-write.js) against the extraction project's
// tools/mohawk_write.py, and read back:
//
//   - a sheet with frames replaced by raw ones, and a REGS with values
//     changed, rebuilt and written into the archive, are mohawk_write.py's
//     to the byte (utilities/oracle.py write), resource and archive alike;
//   - the written archive reads back: every resource but the changed is the
//     same bytes, the changed frames are the pixels written, the rest of the
//     sheet's frames as they were;
//   - every string list on the disc writes back to its own bytes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { site, archiveNames, archiveBytes, haveDisc, ROOT } from './load.mjs';

let fails = 0, bad = 0;
const fail = m => { if (bad++ < 12) console.log('FAIL ' + m); fails++; };
if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
const sha1 = b => createHash('sha1').update(b).digest('hex');
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// A change made both ways: FLEENS tBMP 4000's frames 0 and 3 redrawn raw (one
// of them mirrored, so the bytes differ from the original), and REGS 4000's
// first two points moved.
const name = 'FLEENS', bytes = archiveBytes(name), arc = S.openMohawk(bytes);
const sheet = S.decodeBitmapResource(arc.get('tBMP', 4000));
const raw = {};
for (const k of [0, 3]) {
  const f = sheet.frames[k], px = new Uint8Array(f.width * f.height);
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) px[y * f.width + x] = f.pixels[y * f.width + (k ? f.width - 1 - x : x)];
  raw[k] = { w: f.width, h: f.height, px };
}
const frames = S.zbSheetFrames(arc.get('tBMP', 4000)).slice();
for (const [k, r] of Object.entries(raw)) frames[+k] = S.zbRawFrame(r.w, r.h, r.px);
const newSheet = S.zbSheetBytes(arc.get('tBMP', 4000), frames);
const regs = arc.get('REGS', 4000).slice(), rv = new DataView(regs.buffer, regs.byteOffset);
rv.setInt16(2, rv.getInt16(2) + 5); rv.setInt16(4, -7);
const written = S.zbWriteArchive(bytes, [{ tag: 'tBMP', id: 4000, bytes: newSheet }, { tag: 'REGS', id: 4000, bytes: regs }]);

const specPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zbwrite-')), 'spec.json');
fs.writeFileSync(specPath, JSON.stringify({ archive: name,
  sheets: [{ id: 4000, raw: Object.fromEntries(Object.entries(raw).map(([k, r]) => [k, [r.w, r.h, Buffer.from(r.px).toString('base64')]])) }],
  regs: [{ id: 4000, values: { 0: rv.getInt16(2), 1: -7 } }] }));
const o = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'write', specPath], { encoding: 'utf8' });
if (o.status !== 0) { console.log('SKIP the comparison: the oracle did not run: ' + (o.stderr || '').split('\n').slice(-2).join(' ')); }
else {
  const want = JSON.parse(o.stdout);
  if (sha1(newSheet) !== want['tBMP/4000']) fail('the rebuilt sheet is not mohawk_write.py\'s');
  if (sha1(regs) !== want['REGS/4000']) fail('the changed REGS is not mohawk_write.py\'s');
  if (sha1(written) !== want.archive) fail('the written archive is not mohawk_write.py\'s');
}

// Read back.
const back = S.openMohawk(written);
for (const tag of arc.tags()) for (const { id } of arc.list(tag)) {
  if ((tag === 'tBMP' || tag === 'REGS') && id === 4000) continue;
  if (!same(back.get(tag, id), arc.get(tag, id))) fail(`${tag} ${id} changed in the written archive`);
}
const reread = S.decodeBitmapResource(back.get('tBMP', 4000));
reread.frames.forEach((f, k) => {
  const want = raw[k] ? raw[k].px : sheet.frames[k].pixels;
  if (!same(f.pixels, want)) fail(`frame ${k} reads back wrong`);
});
if (!same(back.get('REGS', 4000), regs)) fail('REGS 4000 reads back wrong');

// Every string list writes back to its own bytes.
let lists = 0;
for (const n of archiveNames()) {
  const a = S.openMohawk(archiveBytes(n));
  for (const { id } of a.list('STRL')) {
    const b = a.get('STRL', id);
    if (!same(S.zbStringListBytes(S.parseStringList(b)), b)) fail(`${n} STRL ${id} does not write back to its own bytes`);
    lists++;
  }
}
if (!fails) console.log(`a sheet with two frames redrawn and a REGS changed, written into ${name} as mohawk_write.py writes them${o.status === 0 ? ' (SHA-1 for SHA-1)' : ''}, and read back; ${lists} string lists written back to their own bytes`);
process.exit(fails ? 1 : 0);
