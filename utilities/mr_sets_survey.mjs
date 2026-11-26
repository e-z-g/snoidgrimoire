// Each .anm on Mountain Rescue's disc: its views, and for each view how many
// frames its body and each part's values have. A survey for the preview of
// the non-walk sets (page-mountain.js mountainLookView).
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';
const DISC = path.join(process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue'), 'disc');
const S = site({ files: ['js/zb-mountain.js'] });
const anms = [];
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.anm$/i.test(f.name)) anms.push(p); } };
walk(DISC);
for (const p of anms) {
  const b = new Uint8Array(fs.readFileSync(p)), slots = S.mrAnmSlots(b), views = S.mrAnmViews(slots);
  console.log(path.relative(DISC, p), `${views.size} views`);
  for (const [v, parts] of views) {
    const n = parts.map((vals, i) => vals.map(val => (slots[S.mrAnmSlot(v, i, val)] || []).length).join('/'));
    const f = (slots[S.mrAnmSlot(v, 0, 0)] || slots[S.mrAnmSlot(v, 1, parts[1][0])] || [])[0];
    console.log(`  view ${v}: ${S.MR_PARTS.map((q, i) => q + ' ' + n[i]).join(', ')}${f ? `  ${f.width}x${f.height}` : ''}`);
  }
}
