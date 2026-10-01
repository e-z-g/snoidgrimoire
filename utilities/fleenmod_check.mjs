// The Fleen-parts mod (js/zb-mod-fleen.js) against the extraction project's
// tools/mod_fleen_parts.py, plain and green:
//
//   - every resource it rebuilds is the Python's to the byte, by SHA-1
//     (utilities/oracle.py fleenmod): ZOOMBINI tBMP 3000, 3100 and 3200 and
//     REGS 100-103, 3200 and 3201; PICKER tBMP 4400 and 4300;
//   - the installed ZOOMBINI.EXE (reference/zombs-lair) comes back with the
//     same bytes changed to the same values, and no others;
//   - each hairstyle's lift off the head is the Python's;
//   - given no EXE, the same resources bar PICKER tBMP 4300, and no EXE.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { site, archiveNames, archiveBytes, haveDisc, REF, ROOT } from './load.mjs';

let fails = 0;
const fail = m => { if (fails++ < 20) console.log('FAIL ' + m); };
if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const exePath = path.join(REF, 'zombs-lair', 'HDD', 'ZOOMBINI', 'ZOOMBINI.EXE');
if (!fs.existsSync(exePath)) { console.log('SKIP: no reference/zombs-lair/HDD/ZOOMBINI/ZOOMBINI.EXE'); process.exit(0); }
const S = site();
const sha1 = b => createHash('sha1').update(b).digest('hex');
const archives = new Map(archiveNames().map(n => [n, S.openMohawk(archiveBytes(n))]));
const exe = new Uint8Array(fs.readFileSync(exePath));

const summary = [];
for (const green of [false, true]) {
  const label = green ? 'green' : 'plain';
  const r = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'fleenmod', ...(green ? ['--green'] : [])],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.log('SKIP: the oracle did not run: ' + (r.stderr || '').split('\n').slice(-2).join(' ')); process.exit(0); }
  const want = JSON.parse(r.stdout);

  const t0 = performance.now();
  const got = S.zbFleenMod(archives, exe, green);
  const ms = performance.now() - t0;

  let n = 0;
  for (const name of ['ZOOMBINI', 'PICKER']) {
    const mine = Object.fromEntries(got[name].map(c => [`${c.tag}/${c.id}`, sha1(c.bytes)]));
    for (const k of new Set([...Object.keys(want[name]), ...Object.keys(mine)])) {
      if (mine[k] !== want[name][k]) fail(`${label} ${name} ${k}: ${mine[k] || 'missing'}, the Python ${want[name][k] || 'missing'}`);
      n++;
    }
  }
  const changed = {};
  for (let i = 0; i < exe.length; i++) if (got.exe[i] !== exe[i]) changed[i] = got.exe[i];
  if (got.exe.length !== exe.length) fail(`${label} EXE: ${got.exe.length} bytes, not ${exe.length}`);
  for (const k of new Set([...Object.keys(want.EXE), ...Object.keys(changed)])) {
    if (changed[k] !== want.EXE[k]) fail(`${label} EXE byte ${k}: ${changed[k] ?? 'unchanged'}, the Python ${want.EXE[k] ?? 'unchanged'}`);
  }
  if (JSON.stringify(got.lift) !== JSON.stringify(want.lift)) fail(`${label} lift ${JSON.stringify(got.lift)}, the Python ${JSON.stringify(want.lift)}`);

  // Without the EXE: the same, bar the big figure, which the EXE places.
  const bare = S.zbFleenMod(archives, null, green);
  if (bare.exe !== null) fail(`${label} without the EXE: an EXE came back`);
  const keys = ['ZOOMBINI', 'PICKER'].flatMap(name => bare[name].map(c => [name, `${c.tag}/${c.id}`, sha1(c.bytes)]));
  if (keys.some(([, k]) => k === 'tBMP/4300')) fail(`${label} without the EXE: PICKER tBMP 4300 came back`);
  if (keys.length !== n - 1) fail(`${label} without the EXE: ${keys.length} resources, not ${n - 1}`);
  for (const [name, k, h] of keys) if (h !== want[name][k]) fail(`${label} without the EXE: ${name} ${k} is not the Python's`);
  summary.push(`${label} ${n} resources and ${Object.keys(want.EXE).length} EXE bytes in ${(ms / 1000).toFixed(1)} s`);
}

if (fails) { console.log(`${fails} failures`); process.exit(1); }
console.log(`the Fleen-parts mod is mod_fleen_parts.py's byte for byte: ${summary.join('; ')}`);
