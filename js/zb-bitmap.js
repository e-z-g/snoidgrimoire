/* zb-bitmap.js -- the Zoombinis disc's pictures: tBMP bitmaps, the SHPL and
   tPAL palettes they are drawn in.
   =========================================================================
   Needs mac-bytes.js.

   A tBMP is an 8-byte header (width, height, bytes per row, format), then
   the pixels, packed with Brøderbund's LZ and drawn raw or with a simple
   RLE8. A **compound** tBMP is a sheet of sprites: its header's width is
   really a count, and the unpacked payload starts with that many offsets to
   sub-images, each a tBMP of its own. Everything here returns palette
   indices; which palette, and whether index 0 is transparent (it is on a
   sprite sheet, and not on a full-screen picture), is the caller's choice.

   WHERE IT CAME FROM
   A port of the extraction project's tools/mohawk_bmp.py, which is itself a
   port of ScummVM's engines/mohawk/bitmap.cpp (MohawkBitmap::decompressLZ,
   drawRaw, drawRLE8, and decodeImages for the compound sheets).
   utilities/bitmap_check.mjs holds it to the Python over every bitmap on the
   disc, frame by frame, pixel for pixel.
*/

/* ---- Brøderbund's LZ -------------------------------------------------- */

const ZB_LZ_LEN_BITS = 6, ZB_LZ_MIN = 3;
const ZB_LZ_POS_BITS = 16 - ZB_LZ_LEN_BITS;
const ZB_LZ_MAX = (1 << ZB_LZ_LEN_BITS) + ZB_LZ_MIN - 1;
const ZB_LZ_RING = 1 << ZB_LZ_POS_BITS;
const ZB_LZ_MASK = ZB_LZ_RING - 1;

/* MohawkBitmap::decompressLZ, line for line as mohawk_bmp.py has it: a flag
   byte per eight items, a literal or a 16-bit (length, ring position) pair
   into a 1024-byte window that is the output itself. */
function zbDecompressLZ(src, uncompressedSize) {
  const out = new Uint8Array(Math.max(uncompressedSize, ZB_LZ_RING) + ZB_LZ_MAX + ZB_LZ_RING);
  let dst = 0, buf = 0, flags = 0, bytesOut = 0, insertPos = 0, p = 0;
  const n = src.length;
  while (p < n) {
    flags >>= 1;
    if (!(flags & 0x100)) {
      if (p >= n) break;
      flags = src[p++] | 0xff00;
    }
    if (flags & 1) {
      if (++bytesOut > uncompressedSize) break;
      out[dst++] = src[p++];
      if (++insertPos > ZB_LZ_MASK) { insertPos = 0; buf += ZB_LZ_RING; }
    } else {
      if (p + 2 > n) break;
      const offLen = (src[p] << 8) | src[p + 1];
      p += 2;
      let stringLen = (offLen >> ZB_LZ_POS_BITS) + ZB_LZ_MIN;
      let stringPos = (offLen + ZB_LZ_MAX) & ZB_LZ_MASK;
      bytesOut += stringLen;
      if (bytesOut > uncompressedSize) stringLen -= bytesOut - uncompressedSize;
      let strPtr = buf + stringPos;
      if (stringPos > insertPos) {
        if (bytesOut >= ZB_LZ_RING) {
          strPtr -= ZB_LZ_RING;
        } else if (stringPos + stringLen > ZB_LZ_MASK) {
          for (let k = 0; k < stringLen; k++) {
            out[dst++] = out[strPtr++];
            if (++stringPos > ZB_LZ_MASK) { stringPos = 0; strPtr = 0; }
          }
          insertPos = (insertPos + stringLen) & ZB_LZ_MASK;
          if (bytesOut >= uncompressedSize) break;
          continue;
        }
      }
      insertPos += stringLen;
      if (insertPos > ZB_LZ_MASK) { insertPos &= ZB_LZ_MASK; buf += ZB_LZ_RING; }
      for (let k = 0; k < stringLen; k++) out[dst++] = out[strPtr++];
      if (bytesOut >= uncompressedSize) break;
    }
  }
  return out.slice(0, uncompressedSize);
}

/* ---- tBMP ------------------------------------------------------------- */

const ZB_BMP_HAS_CLUT = 0x0008;
const ZB_DRAW_MASK = 0x00f0, ZB_DRAW_RAW = 0x0000, ZB_DRAW_RLE8 = 0x0010;
const ZB_PACK_MASK = 0x0f00, ZB_PACK_NONE = 0x0000, ZB_PACK_LZ = 0x0100;

/* The header, and the payload with any packing taken off. */
function tbmpUnpack(bytes) {
  const b = bytes;
  if (b.length < 8) throw new Error('tBMP: shorter than its header');
  const width = u16be(b, 0) & 0x3fff, height = u16be(b, 2) & 0x3fff;
  const bytesPerRow = i16be(b, 4) & 0x3ffe, format = u16be(b, 6);
  if ((format & 7) !== 2) throw new Error(`tBMP: format 0x${format.toString(16)} is not 8 bits a pixel`);
  let body = b.subarray(8);
  if (format & ZB_BMP_HAS_CLUT) body = body.subarray(4 + 256 * 3);
  const pack = format & ZB_PACK_MASK;
  if (pack === ZB_PACK_LZ) {
    if (body.length < 10) throw new Error('tBMP: LZ header runs past the end');
    const usize = u32be(body, 0), csize = u32be(body, 4), dict = u16be(body, 8);
    if (dict !== ZB_LZ_RING) throw new Error(`tBMP: LZ window 0x${dict.toString(16)}`);
    if (10 + csize > body.length) throw new Error('tBMP: LZ data runs past the end');
    body = zbDecompressLZ(body.subarray(10, 10 + csize), usize);
  } else if (pack !== ZB_PACK_NONE) {
    throw new Error(`tBMP: packing 0x${pack.toString(16)}`);
  }
  return { width, height, bytesPerRow, format, payload: body };
}

function tbmpDrawRaw(payload, w, h, bpr) {
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = payload.subarray(y * bpr, y * bpr + w);
    px.set(row, y * w);           // a short last row stays 0, as the Python pads it
  }
  return px;
}

function tbmpDrawRLE8(payload, w, h) {
  const px = new Uint8Array(w * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const rowBytes = (payload[p] << 8) | payload[p + 1];
    p += 2;
    const start = p;
    let x = 0, remaining = w;
    while (remaining > 0) {
      const code = payload[p++];
      let run = (code & 0x7f) + 1;
      if (run > remaining) run = remaining;
      if (code & 0x80) {
        px.fill(payload[p++], y * w + x, y * w + x + run);
      } else {
        px.set(payload.subarray(p, p + run), y * w + x);
        p += run;
      }
      x += run;
      remaining -= run;
    }
    p = start + rowBytes;
  }
  return px;
}

/* One picture: { width, height, pixels } with a palette index a pixel. */
function decodeTbmp(bytes) {
  const u = tbmpUnpack(bytes);
  const draw = u.format & ZB_DRAW_MASK;
  let pixels;
  if (draw === ZB_DRAW_RAW) pixels = tbmpDrawRaw(u.payload, u.width, u.height, u.bytesPerRow);
  else if (draw === ZB_DRAW_RLE8) pixels = tbmpDrawRLE8(u.payload, u.width, u.height);
  else throw new Error(`tBMP: drawing 0x${draw.toString(16)}`);
  return { width: u.width, height: u.height, pixels, format: u.format };
}

/* Whether a tBMP is a sprite sheet, and where its frames are: the unpacked
   payload opens with `width` big-endian offsets, each counted from 8 bytes
   before the payload, the first pointing just past the list, in order.
   Returns null for a plain picture. */
function tbmpFrameOffsets(bytes) {
  const u = tbmpUnpack(bytes);
  const count = u.width, p = u.payload;
  if (count === 0 || p.length < count * 4 + 8) return null;
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(u32be(p, i * 4));
  if (offsets[0] !== 8 + count * 4) return null;
  for (let i = 0; i + 1 < count; i++) if (offsets[i] > offsets[i + 1]) return null;
  if (offsets[count - 1] - 8 >= p.length) return null;
  return { offsets, payload: p };
}

/* A tBMP resource as { sheet, frames }: one frame for a picture, every
   sprite for a sheet. */
function decodeBitmapResource(bytes) {
  const sheet = tbmpFrameOffsets(bytes);
  if (!sheet) return { sheet: false, frames: [decodeTbmp(bytes)] };
  const { offsets, payload } = sheet;
  const frames = offsets.map((off, i) => {
    const end = i + 1 < offsets.length ? offsets[i + 1] - 8 : payload.length;
    return decodeTbmp(payload.subarray(off - 8, end));
  });
  return { sheet: true, frames };
}

/* ---- palettes ----------------------------------------------------------- */

/* SHPL: id, flags, first index, count, then count entries of r, g, b and a
   flag byte. tPAL (MAZE2 only) is the same without the id and flags. */
function parsePaletteResource(bytes, tag) {
  const b = bytes;
  const head = tag === 'tPAL' ? 0 : 4;
  if (b.length < head + 4) throw new Error(`${tag}: shorter than its header`);
  const start = u16be(b, head), count = u16be(b, head + 2);
  if (b.length !== head + 4 + count * 4) throw new Error(`${tag}: ${count} colours do not fill ${b.length} bytes`);
  const colours = [];
  for (let i = 0; i < count; i++) {
    const o = head + 4 + i * 4;
    colours.push([b[o], b[o + 1], b[o + 2], b[o + 3]]);
  }
  return { id: head ? u16be(b, 0) : null, flags: head ? u16be(b, 2) : null, start, colours };
}

/* The twenty colours Windows keeps for itself, at 0-9 and 246-255. A palette
   supplies the rest; mohawk_bmp.py fills these slots the same way. Nothing
   on the disc is known to draw with them except 0 and 1. */
const ZB_WINDOWS_COLOURS = {
  0: [0, 0, 0], 1: [0x80, 0, 0], 2: [0, 0x80, 0], 3: [0x80, 0x80, 0],
  4: [0, 0, 0x80], 5: [0x80, 0, 0x80], 6: [0, 0x80, 0x80], 7: [0xc0, 0xc0, 0xc0],
  8: [0xc0, 0xdc, 0xc0], 9: [0xa6, 0xca, 0xf0],
  246: [0xff, 0xfb, 0xf0], 247: [0xa0, 0xa0, 0xa4], 248: [0x80, 0x80, 0x80],
  249: [0xff, 0, 0], 250: [0, 0xff, 0], 251: [0xff, 0xff, 0], 252: [0, 0, 0xff],
  253: [0xff, 0, 0xff], 254: [0, 0xff, 0xff], 255: [0xff, 0xff, 0xff],
};

/* 256 [r, g, b]: Windows's colours, then the palette's over them, and
   magenta in any slot neither fills, so that it shows. */
function zbPalette(parsed) {
  const pal = [];
  for (let i = 0; i < 256; i++) pal.push(ZB_WINDOWS_COLOURS[i] ? ZB_WINDOWS_COLOURS[i].slice() : [255, 0, 255]);
  if (parsed) parsed.colours.forEach((c, i) => { if (parsed.start + i < 256) pal[parsed.start + i] = [c[0], c[1], c[2]]; });
  return pal;
}
