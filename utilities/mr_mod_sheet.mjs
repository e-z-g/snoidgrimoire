// A contact sheet of the walk mod's sets (utilities/mr_mod_write.mjs's
// output in <mod>), for a look by eye: for each feet, the views given
// (default 22, 66, 88, 44) and each frame, with nose, hair and eyes 1,
// against a gray ground, a red line where Mountain Rescue's frame is.
//   node utilities/mr_mod_sheet.mjs <mod> <png> [views]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { site } from './load.mjs';
const S = site({ files: ['js/zb-mountain.js'] });
const [mod, png, list] = process.argv.slice(2);
const viewsWanted = (list || '22,66,88,44').split(',').map(Number);
const rows = [];
for (let feet = 1; feet <= 5; feet++) {
  const b = new Uint8Array(fs.readFileSync(path.join(mod, 'zombis', `zb96walk${feet}.anm`)));
  const slots = S.mrAnmSlots(b);
  for (const v of viewsWanted) {
    const body = slots[S.mrAnmSlot(v, 0, 0)];
    const frames = body.map((_, i) => [0, 2, 3, 4].map(part => S.mrAnmFrame(b, slots[S.mrAnmSlot(v, part, part ? 1 : 0)][i])));
    rows.push({ feet, v, frames });
  }
}
const fw = Math.max(...rows.map(r => r.frames[0][0].width)) + 6, fh = Math.max(...rows.map(r => r.frames[0][0].height)) + 6;
const cols = Math.max(...rows.map(r => r.frames.length));
const W = cols * fw, H = rows.length * fh, img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) img.set([200, 200, 200, 255], 4 * i);
rows.forEach((r, ri) => r.frames.forEach((parts, ci) => {
  for (const f of parts) for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
    const s = 4 * (y * f.width + x);
    if (f.data[s + 3] < 128) continue;
    const o = 4 * ((ri * fh + 3 + y) * W + ci * fw + 3 + x);
    img.set(f.data.subarray(s, s + 4), o);
  }
}));
const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(png, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${png}: ${W}x${H}, ${rows.length} rows`);
