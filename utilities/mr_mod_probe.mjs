// Prints what Mountain Rescue's waiting sets hold (views, frames a part)
// and the 1996 scripts the preview pairs them with, for the walk mod.
//   node utilities/mr_mod_probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { REF, site, archiveBytes } from './load.mjs';
const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue'), DISC = path.join(MR, 'disc');
const Z = site();
for (const f of ['attente2/attenteZomb2.anm', 'attente/attenteZomb.anm', 'pris/pris.anm']) {
  const b = new Uint8Array(fs.readFileSync(path.join(DISC, 'Data/Bmp/ZOMBIS', f)));
  const slots = Z.mrAnmSlots(b), views = Z.mrAnmViews(slots);
  for (const [v] of views) {
    const counts = [0, 1, 2, 3, 4].map(part => [0, 1, 2, 3, 4, 5].map(val => (slots[Z.mrAnmSlot(v, part, val)] || []).length).join(','));
    const f0 = slots[Z.mrAnmSlot(v, 0, 0)][0];
    console.log(f, 'view', v, 'frames by part and value', counts.join(' | '), 'body', f0.width + 'x' + f0.height);
  }
}
const arc = Z.openMohawk(archiveBytes('ZOOMBINI'));
for (const id of [131, 100, 101]) {
  const t = Z.zbSnoidTicks(Z.parseScript(arc.get('SCRS', id), 'SCRS'), false);
  console.log('ZOOMBINI SCRS', id, t.length, 'ticks');
}
// the blink's eye frames: how much of each is white (the eye open)
{
  const b = new Uint8Array(fs.readFileSync(path.join(DISC, 'Data/Bmp/ZOMBIS/attente2/attenteZomb2.anm')));
  const slots = Z.mrAnmSlots(b);
  for (let val = 1; val <= 5; val++) {
    const whites = slots[Z.mrAnmSlot(33, 4, val)].map(f => { const p = Z.mrAnmFrame(b, f); let n = 0; for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] >= 128 && p.data[i] > 200 && p.data[i + 1] > 200 && p.data[i + 2] > 200) n++; return n; });
    console.log('attenteZomb2 eyes', val, 'white pixels by frame', whites.join(' '));
  }
}
