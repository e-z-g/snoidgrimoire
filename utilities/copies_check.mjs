// js/mac-*.js are grimoire's, copied, and must stay byte for byte what
// grimoire has: a fix goes to grimoire first and is copied back. This finds
// grimoire at ~/e-z-g-cythera/grimoire, or where GRIMOIRE says.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './load.mjs';

const G = process.env.GRIMOIRE || path.join(os.homedir(), 'e-z-g-cythera', 'grimoire');
const theirs = path.join(G, 'js');
if (!fs.existsSync(theirs)) { console.log(`SKIP: no grimoire checkout at ${G} (set GRIMOIRE)`); process.exit(0); }

const ours = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^mac-.*\.js$/.test(f)).sort();
let bad = 0;
for (const f of ours) {
  const a = fs.readFileSync(path.join(ROOT, 'js', f));
  const bPath = path.join(theirs, f);
  if (!fs.existsSync(bPath)) { console.log(`FAIL ${f}: grimoire has no such file`); bad++; continue; }
  if (!a.equals(fs.readFileSync(bPath))) { console.log(`FAIL ${f}: differs from ${bPath}`); bad++; }
}
console.log(`${ours.length} mac-* files, ${ours.length - bad} identical to grimoire's`);
process.exit(bad ? 1 : 0);
