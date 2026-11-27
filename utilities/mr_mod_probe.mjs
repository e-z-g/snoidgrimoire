// Prints what Mountain Rescue's Zoombini sets hold (views, frames a part,
// frame size, time a frame), for the walk mod.
//   node utilities/mr_mod_probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';
const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue'), DISC = path.join(MR, 'disc');
const Z = site({ files: ['js/zb-mountain.js'] });
const times = Z.mrAnmFrameTimes(new Uint8Array(fs.readFileSync(path.join(DISC, 'INSTALL/hd/zoombini2.exe'))));
const find = rel => { rel = rel.replace(/^bmp\//, ''); let d = path.join(DISC, 'Data/Bmp'); for (const part of rel.split('/')) { const n = fs.readdirSync(d).find(x => x.toLowerCase() === part.toLowerCase()); if (!n) return null; d = path.join(d, n); } return d; };
for (const [key, ms] of times) {
  const file = find(key);
  if (!file) { console.log(key, ms, 'ms, not found'); continue; }
  const b = new Uint8Array(fs.readFileSync(file)), slots = Z.mrAnmSlots(b), views = [...Z.mrAnmViews(slots).keys()];
  const v = views[0], counts = [0, 1, 2, 3, 4].map(part => Math.max(...[0, 1, 2, 3, 4, 5].map(val => (slots[Z.mrAnmSlot(v, part, val)] || []).length)));
  const f0 = slots[Z.mrAnmSlot(v, 0, 0)];
  console.log(key.padEnd(44), String(ms).padStart(4), 'ms', 'views', views.join(','), 'frames', counts.join('/'), f0 ? `${f0[0].width}x${f0[0].height}` : 'no body');
}
