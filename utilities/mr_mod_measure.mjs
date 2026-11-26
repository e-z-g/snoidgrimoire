// Mountain Rescue's walk frames measured: for each view, the frame size and
// the box of opaque pixels of body+feet, per frame. node utilities/mr_mod_measure.mjs <anm>
import fs from 'node:fs';
import { site } from './load.mjs';
const S = site({ files: ['js/zb-mountain.js'] });
const b = new Uint8Array(fs.readFileSync(process.argv[2]));
const slots = S.mrAnmSlots(b);
const views = S.mrAnmViews(slots);
const box = pic => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < pic.height; y++) for (let x = 0; x < pic.width; x++) if (pic.data[(y * pic.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return x1 < 0 ? 'empty' : `${x0}-${x1}x${y0}-${y1}`; };
for (const [v, parts] of views) {
  const out = [];
  for (let part = 0; part < 5; part++) for (const val of parts[part].slice(0, part === 1 ? 5 : 1)) {
    const fr = slots[S.mrAnmSlot(v, part, val)];
    out.push(`${S.MR_PARTS[part]}${val}: ${fr.length}f ${fr[0].width}x${fr[0].height} ${fr.map(f => box(S.mrAnmFrame(b, f))).filter((x, i) => i < 3 || part === 1 && val === 1).join(' ')}`);
  }
  console.log(`view ${v}\n  ` + out.join('\n  '));
}
console.log('time at 48000?', b.length);
