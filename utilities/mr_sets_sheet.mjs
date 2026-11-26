// A contact sheet for choosing matches by eye: cannon_zomb's five views, its
// parts at value 1, beside the 1996 tumble's 18 poses (tBMP 3100, traits 1),
// written as a PNG to the path given. The 1996 poses are in false colors,
// one for each palette index.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { REF, site, archiveBytes } from './load.mjs';
const S = site();
const out = process.argv[2];
const DISC = path.join(process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue'), 'disc');
const b = new Uint8Array(fs.readFileSync(path.join(DISC, 'Data/Bmp/wall_of_fleens/cannon_zomb/cannon_zomb.anm')));
const slots = S.mrAnmSlots(b), views = S.mrAnmViews(slots);
const W = 1400, H = 260, img = new Uint8Array(W * H * 4).fill(255);
const put = (x0, y0, w, h, rgba) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = rgba[4 * (y * w + x) + 3]; if (a < 128) continue; const o = 4 * ((y0 + y) * W + x0 + x); for (let c = 0; c < 4; c++) img[o + c] = rgba[4 * (y * w + x) + c]; } };
let x = 4;
for (const v of views.keys()) for (let part = 0; part < 5; part++) {
  const s = slots[S.mrAnmSlot(v, part, part ? 1 : 0)]; if (!s) continue;
  const f = S.mrAnmFrame(b, s[0]); put(x, 4, f.width, f.height, f.data);
  if (part === 4) x += 80;
}
const zoom = S.openMohawk(archiveBytes('ZOOMBINI')), sheet = S.zbSnoidSheet(zoom, 'tumble');
const t = { feet: 1, nose: 1, eyes: 1, hair: 1 };
for (let pose = 1; pose <= 18; pose++) {
  const order = ['feet', 'body', 'nose', 'eyes', 'hair'];
  const placed = order.map(part => { const f = S.zbSnoidFrame(part, t[part], pose, 0, sheet.blocks); return { part, frame: f, x: -sheet.xs[f + 1], y: -sheet.ys[f + 1] }; });
  const c = S.zbSnoidCompose(sheet, placed), x0 = 4 + ((pose - 1) % 9) * 150, y0 = 90 + Math.floor((pose - 1) / 9) * 85;
  const rgba = new Uint8Array(c.width * c.height * 4);
  for (let i = 0; i < c.pixels.length; i++) if (c.pixels[i]) { const g = (c.pixels[i] * 37) % 200; rgba.set([g, 255 - g, (c.pixels[i] * 91) % 255, 255], 4 * i); }
  put(x0, y0, c.width, c.height, rgba);
}
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, [...views.keys()].join(','));
