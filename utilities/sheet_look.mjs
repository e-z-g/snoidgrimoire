// An archive's bitmaps listed, and one saved as a PNG to look at: a
// picture whole, or a sprite sheet's frames in rows with each frame's
// number (from 1, as scripts name shapes) under it in the listing.
//
//   node utilities/sheet_look.mjs HOTEL                 # every tBMP: frames and sizes
//   node utilities/sheet_look.mjs HOTEL 5000 out.png    # the picture, or the sheet
//   node utilities/sheet_look.mjs HOTEL 5100 out.png 5001   # with another palette
import fs from 'node:fs';
import zlib from 'node:zlib';
import { site, archiveBytes } from './load.mjs';

export function writePng(file, rgb, width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 2;
  const raw = Buffer.alloc(height * (1 + 3 * width));
  for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, rgb.byteOffset + 3 * y * width, 3 * width).copy(raw, y * (1 + 3 * width) + 1);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

if (process.argv[1] && process.argv[1].endsWith('sheet_look.mjs')) {
  const [name, id, out, palId] = process.argv.slice(2);
  const S = site(), arc = S.openMohawk(archiveBytes(name));
  if (!id) {
    for (const r of arc.list('tBMP')) {
      const b = S.decodeBitmapResource(arc.get('tBMP', r.id));
      const sizes = b.frames.length === 1 ? `${b.frames[0].width} x ${b.frames[0].height}` : `${b.frames.length} frames`;
      console.log(`tBMP ${r.id}: ${sizes}${arc.has('SHPL', r.id) ? ', SHPL' : ''}${arc.has('REGS', r.id) ? ', REGS' : ''}`);
    }
    console.log('SCRB ' + arc.list('SCRB').map(r => r.id).join(' '));
    console.log('REGS ' + arc.list('REGS').map(r => r.id).join(' '));
    console.log('SHPL ' + arc.list('SHPL').map(r => r.id).join(' '));
  } else {
    const b = S.decodeBitmapResource(arc.get('tBMP', +id));
    const pid = palId ? +palId : arc.has('SHPL', +id) ? +id : arc.list('SHPL')[0].id;
    const pal = S.zbWindowsPalette(S.zbPalette(S.parsePaletteResource(arc.get('SHPL', pid), 'SHPL')));
    const cols = b.frames.length === 1 ? 1 : 12, pad = 4;
    const cw = Math.max(...b.frames.map(f => f.width)) + pad, rows = Math.ceil(b.frames.length / cols);
    const rowH = []; for (let r = 0; r < rows; r++) rowH.push(Math.max(...b.frames.slice(r * cols, r * cols + cols).map(f => f.height)) + pad);
    const W = cw * cols, H = rowH.reduce((a, c) => a + c, 0), rgb = new Uint8Array(W * H * 3).fill(b.frames.length === 1 ? 0 : 90);
    let y0 = 0;
    b.frames.forEach((f, i) => {
      if (i && i % cols === 0) y0 += rowH[i / cols - 1];
      const x0 = (i % cols) * cw;
      for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
        const v = f.pixels[y * f.width + x];
        if (!v && b.frames.length > 1) continue;
        const o = 3 * ((y0 + y) * W + x0 + x), c = pal[v] || [0, 0, 0];
        rgb[o] = c[0] ?? c.r; rgb[o + 1] = c[1] ?? c.g; rgb[o + 2] = c[2] ?? c.b;
      }
    });
    writePng(out, rgb, W, H);
    console.log(`${out}: ${W} x ${H}, ${b.frames.length} frames, ${cols} a row, cell ${cw} wide, rows ${rowH.join(' ')}`);
  }
}
