/* zb-write.js -- writing an archive back: the inverse of zb-mohawk.js and
   zb-bitmap.js, for an edit made in the page.
   =========================================================================
   Needs mac-bytes.js and zb-mohawk.js.

   Kept as close to what the game already reads as the extraction project's
   tools/mohawk_write.py keeps it, and held to it byte for byte by
   utilities/write_check.mjs (the Zoombini maker's play-lib.js is the same
   port):

   - a replaced resource is appended after the archive's directory and only
     its file-table entry is repointed, with the two file-size fields in the
     header; every other byte stays where it was (zbWriteArchive);
   - a sprite sheet keeps its outer header and LZ packing, its frames behind
     an LZ stream of literals only, a 0xff flags byte before every eight
     bytes, which any reader of the format decodes (zbSheetBytes); a changed
     frame is a raw 8-bit sub-image, rows padded to an even length as the
     game's own raw frames are (zbRawFrame), and a frame not changed keeps
     its own bytes (zbSheetFrames);
   - a string list is a count byte and the strings, each ended by a NUL, in
     Windows-1252 (zbStringListBytes), so every list on the disc writes back
     to its own bytes. */

/* The archive's bytes with each of `changes`, [{ tag, id, bytes }], put in. */
function zbWriteArchive(bytes, changes) {
  const arc = openMohawk(bytes);
  const absOff = u32be(bytes, 20), table = absOff + u16be(bytes, 24) + 4;
  const total = bytes.length + changes.reduce((n, c) => n + c.bytes.length, 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  out.set(bytes);
  let end = bytes.length;
  for (const c of changes) {
    const r = arc.find(c.tag, c.id);
    if (!r) throw new Error(`the archive has no ${mohawkTagLabel(c.tag)} ${c.id}`);
    if (c.bytes.length >= 1 << 24) throw new Error(`${mohawkTagLabel(c.tag)} ${c.id} is too big for its entry`);
    const e = table + 10 * (r.index - 1);
    dv.setUint32(e, end); dv.setUint16(e + 4, c.bytes.length & 0xffff); out[e + 6] = c.bytes.length >>> 16;
    out.set(c.bytes, end);
    end += c.bytes.length;
  }
  dv.setUint32(4, total - 8);        // the MHWK chunk's size
  dv.setUint32(16, total);           // the RSRC's file size
  return out;
}

/* A sheet's frames as their own bytes, each with its 8-byte header. */
function zbSheetFrames(tbmp) {
  const s = tbmpFrameOffsets(tbmp);
  if (!s) throw new Error('not a sprite sheet');
  const { offsets, payload } = s;
  return offsets.map((o, k) => payload.subarray(o - 8, (k + 1 < offsets.length ? offsets[k + 1] : payload.length + 8) - 8));
}
/* One frame, raw 8-bit, its rows padded to an even length. */
function zbRawFrame(width, height, pixels) {
  const bpr = (width + 1) & ~1, out = new Uint8Array(8 + bpr * height), dv = new DataView(out.buffer);
  dv.setUint16(0, width); dv.setUint16(2, height); dv.setInt16(4, bpr); dv.setUint16(6, 0x0002);
  for (let y = 0; y < height; y++) out.set(pixels.subarray(y * width, (y + 1) * width), 8 + y * bpr);
  return out;
}
/* A sheet of `frames`, with `template`'s outer header bar the frame count. */
function zbSheetBytes(template, frames) {
  const count = frames.length;
  let size = 4 * count;
  for (const f of frames) size += f.length;
  const payload = new Uint8Array(size), pv = new DataView(payload.buffer);
  let o = 4 * count;
  frames.forEach((f, k) => { pv.setUint32(4 * k, o + 8); payload.set(f, o); o += f.length; });
  const body = new Uint8Array(size + Math.ceil(size / 8));
  let q = 0;
  for (let i = 0; i < size; i += 8) { body[q++] = 0xff; const c = payload.subarray(i, i + 8); body.set(c, q); q += c.length; }
  const out = new Uint8Array(18 + q), ov = new DataView(out.buffer);
  ov.setUint16(0, count); out.set(template.subarray(2, 8), 2);
  ov.setUint32(8, size); ov.setUint32(12, q); ov.setUint16(16, 1024);
  out.set(body.subarray(0, q), 18);
  return out;
}

/* Windows-1252, for what TextEncoder does not write. */
const ZB_CP1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
function zbCp1252(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i), k = ZB_CP1252_HIGH.indexOf(s[i]);
    if (k >= 0) out[i] = 0x80 + k;
    else if (c < 0x100) out[i] = c;
    else throw new Error(`“${s[i]}” is not in the game’s character set`);
  }
  return out;
}
/* A string list's bytes. */
function zbStringListBytes(lines) {
  if (lines.length > 255) throw new Error('a string list holds at most 255 strings');
  const parts = lines.map(zbCp1252);
  const out = new Uint8Array(1 + parts.reduce((n, p) => n + p.length + 1, 0));
  out[0] = lines.length;
  let p = 1;
  for (const b of parts) { if (b.includes(0)) throw new Error('a string cannot hold a NUL'); out.set(b, p); p += b.length + 1; }
  return out;
}
