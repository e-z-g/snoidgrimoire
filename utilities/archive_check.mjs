// The container: every archive's directory as openMohawk reads it, against
// the extraction project's mohawk_archive.py -- every type, id, file index,
// name, offset and size.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, site, haveDisc, archiveNames, archiveBytes } from './load.mjs';

if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const py = spawnSync('python3', [path.join(ROOT, 'utilities', 'oracle.py'), 'archives'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (py.status !== 0) { console.log('FAIL: oracle.py\n' + py.stderr); process.exit(1); }
const oracle = JSON.parse(py.stdout);

const S = site();
let bad = 0, n = 0;
for (const name of archiveNames()) {
  const arc = S.openMohawk(archiveBytes(name));
  const siteResources = [];
  for (const tag of arc.tags()) for (const r of arc.list(tag)) siteResources.push(r);
  const pythonResources = oracle[name];
  const key = r => `${r.tag} ${r.id & 0xffff} ${r.index} ${JSON.stringify(r.name)} ${r.offset} ${r.size}`;
  const a = siteResources.map(key), b = pythonResources.map(key);
  const onlySite = a.filter(k => !b.includes(k)), onlyPython = b.filter(k => !a.includes(k));
  if (onlySite.length || onlyPython.length || a.length !== b.length) {
    bad++;
    console.log(`FAIL ${name}: ${onlySite.length} only here, ${onlyPython.length} only in the Python`);
    for (const k of onlySite.slice(0, 3)) console.log(`    here:   ${k}`);
    for (const k of onlyPython.slice(0, 3)) console.log(`    Python (${k})`);
  }
  n += a.length;
}
console.log(`${archiveNames().length} archives, ${n} resources, ${bad ? bad + ' differ' : 'every one as mohawk_archive.py reads it'}`);
process.exit(bad ? 1 : 0);
