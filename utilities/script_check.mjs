// Every SCRS and SCRB on the disc, read by js/zb-script.js (ScummVM's
// reading of the grammar) and by the extraction project's mohawk_script.py
// (the same grammar, recovered separately): the same header, the same
// frames, the same records, the same closing word and sound.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, site, haveDisc, archiveNames, archiveBytes } from './load.mjs';

if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const py = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'scripts'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (py.status !== 0) { console.log('FAIL: oracle.py\n' + py.stderr); process.exit(1); }
const oracle = JSON.parse(py.stdout);

const S = site();
const count = { SCRS: 0, SCRB: 0 }, layouts = new Map(), events = new Map();
let bad = 0, pyNone = 0;
const fail = m => { if (bad++ < 20) console.log('FAIL ' + m); };
for (const name of archiveNames()) {
  const arc = S.openMohawk(archiveBytes(name));
  const theirs = new Map(oracle[name].map(e => [e.tag + ' ' + e.id, e]));
  for (const tag of ['SCRS', 'SCRB']) for (const r of arc.list(tag)) {
    count[tag]++;
    const where = `${name} ${tag} ${r.id}`;
    let s;
    try { s = S.parseScript(arc.get(tag, r.id), tag); } catch (e) { fail(`${where}: ${e.message}`); continue; }
    if (tag === 'SCRS') layouts.set(s.layout, (layouts.get(s.layout) || 0) + 1);
    for (const f of s.frames) if (f.event) events.set(f.end.toString(16), (events.get(f.end.toString(16)) || 0) + 1);
    const t = theirs.get(tag + ' ' + (r.id & 0xffff));
    if (!t) { fail(`${where}: the Python has no such script`); continue; }
    if (!t.sections) { pyNone++; fail(`${where}: mohawk_script.py does not parse it`); continue; }
    if (t.header[0] !== s.frameCount || (tag === 'SCRS' && (t.header[1] << 16 >> 16) !== s.layout)) { fail(`${where}: header differs`); continue; }
    if (t.sections.length !== s.frames.length) { fail(`${where}: ${s.frames.length} frames here, ${t.sections.length} in the Python`); continue; }
    s.frames.forEach((f, i) => {
      const u = t.sections[i];
      const same = u.op === f.end && (u.sound == null ? f.sound == null : (f.sound & 0xffff) === u.sound)
        && u.records.length === f.records.length
        && u.records.every(([sh, x, y], k) => sh === f.records[k].shape && x === f.records[k].x && y === f.records[k].y);
      if (!same) fail(`${where} frame ${i}: differs from the Python`);
    });
  }
}
console.log(`  SCRS layer orders: ${[...layouts].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} x${v}`).join(', ')}`);
console.log(`  ${[...events.values()].reduce((a, b) => a + b, 0)} frames close with an event code, ${events.size} different closing words`);
console.log(`${count.SCRS} SCRS, ${count.SCRB} SCRB: ${bad ? bad + ' differ' + (pyNone ? ` (${pyNone} the Python does not parse)` : '') : 'every one record for record as mohawk_script.py'}`);
process.exit(bad ? 1 : 0);
