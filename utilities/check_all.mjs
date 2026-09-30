// Every check, one after another, and a table at the end.
//
//   node utilities/check_all.mjs            # all of them
//   node utilities/check_all.mjs bitmap     # the ones whose names include a word
//
// A check whose inputs are missing skips and says why; SKIP is not a
// failure, and the table shows it.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './load.mjs';

const CHECKS = [
  ['copies', 'js/mac-*.js are grimoire\'s, byte for byte'],
  ['archive', 'the container against mohawk_archive.py'],
  ['bitmap', 'every tBMP frame against mohawk_bmp.py, pixel for pixel'],
  ['script', 'every SCRS and SCRB against mohawk_script.py, record for record'],
  ['resources', 'every other resource read to its last byte'],
  ['journey', 'the places, routes and names against the program and ScummVM'],
  ['town', 'Zoombiniville\'s rules, world and names against ScummVM and the program'],
  ['snoid', 'a Zoombini put together from its parts, against animate.py and every Zoombini script'],
  ['puzzle', 'the twelve puzzles\' rules and deals against ScummVM and the program'],
  ['page', 'index.html in headless Chrome: the map, zoomed into and out of, a view of every type, and the town in WebGL, desktop and phone'],
];
const want = process.argv.slice(2);
const run = CHECKS.filter(([n]) => !want.length || want.some(w => n.includes(w)));
const rows = [];
for (const [name, what] of run) {
  const t0 = Date.now();
  process.stdout.write(`${name} … `);
  const r = spawnSync('node', [path.join(ROOT, 'utilities', name + '_check.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  const skipped = ok && /^SKIP/m.test(out) && !/^(?!SKIP|FAIL).+/m.test(out);
  const status = !ok ? 'FAIL' : skipped ? 'SKIP' : 'ok';
  console.log(`${status} (${secs} s)`);
  if (!ok) console.log(out.split('\n').filter(l => l.trim()).map(l => '    ' + l).join('\n'));
  rows.push({ name, what, status, secs });
}
console.log('');
for (const r of rows) console.log(`${r.status.padEnd(5)} ${r.name.padEnd(9)} ${String(r.secs).padStart(6)} s  ${r.what}`);
process.exit(rows.some(r => r.status === 'FAIL') ? 1 : 0);
