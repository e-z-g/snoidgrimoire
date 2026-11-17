/* zb-dxt.js -- DXT1 and DXT5 (BC1 and BC3), the texture formats of the
   2015 remake's Steam build for the Mac.
   Read:
   blocks of 4x4 pixels, left to right and then down, each side rounded
   up to a whole block. A DXT1 block is 8 bytes: two colors in RGB 565
   (16-bit, little endian), then 32 bits of 2-bit indexes, pixel 0 in the
   lowest bits. Each 565 color widens to 8 bits by repeating its top bits.
   Where the first color's word is larger, indexes 2 and 3 are (2a + b) / 3
   and (a + 2b) / 3. Otherwise 2 is (a + b) / 2 and 3 is clear black. A
   DXT5 block is 8 bytes of alpha, then a DXT1 color block, read by the
   first rule whatever its words. The alpha is two values, then 48 bits of
   3-bit indexes. Where the first value is larger, indexes 2 to 7 step
   between them in sevenths. Otherwise 2 to 5 step in fifths, 6 is 0 and 7
   is 255. Every division rounds down.
   Out: RGBA bytes, rows in the order of the blocks.
   WHERE IT CAME FROM
   Microsoft's documentation of the block formats, with the rounding of
   Pillow's BcnDecode.c, which UnityPy uses. Checked against UnityPy over
   every DXT texture of the Steam build (utilities/remake_check.mjs).
   =========================================================================
   Pure: bytes in, pixels out. Used by zb-unity.js. */

/* `alpha` is true for DXT5. */
function zbDxtDecode(data, width, height, alpha) {
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4), size = alpha ? 16 : 8;
  if (data.length < bw * bh * size) return null;
  const out = new Uint8ClampedArray(width * height * 4);
  const colors = new Uint8Array(16), alphas = new Uint8Array(8);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const p = (by * bw + bx) * size;
      if (alpha) {
        const a0 = data[p], a1 = data[p + 1];
        alphas[0] = a0; alphas[1] = a1;
        if (a0 > a1) for (let k = 1; k < 7; k++) alphas[k + 1] = Math.floor(((7 - k) * a0 + k * a1) / 7);
        else {
          for (let k = 1; k < 5; k++) alphas[k + 1] = Math.floor(((5 - k) * a0 + k * a1) / 5);
          alphas[6] = 0; alphas[7] = 255;
        }
      }
      const c = p + (alpha ? 8 : 0);
      const w0 = data[c] | (data[c + 1] << 8), w1 = data[c + 2] | (data[c + 3] << 8);
      for (const [k, w] of [[0, w0], [1, w1]]) {
        const r = (w >> 11) & 31, g = (w >> 5) & 63, b = w & 31;
        colors[k * 4] = (r << 3) | (r >> 2); colors[k * 4 + 1] = (g << 2) | (g >> 4); colors[k * 4 + 2] = (b << 3) | (b >> 2); colors[k * 4 + 3] = 255;
      }
      const thirds = w0 > w1 || alpha;
      for (let i = 0; i < 3; i++) {
        const a = colors[i], b = colors[4 + i];
        if (thirds) { colors[8 + i] = Math.floor((2 * a + b) / 3); colors[12 + i] = Math.floor((a + 2 * b) / 3); }
        else { colors[8 + i] = (a + b) >> 1; colors[12 + i] = 0; }
      }
      colors[11] = 255; colors[15] = thirds ? 255 : 0;
      const lut = (data[c + 4] | (data[c + 5] << 8) | (data[c + 6] << 16) | (data[c + 7] << 24)) >>> 0;
      // The alpha indexes: two runs of 24 bits, eight pixels each.
      const lo = data[p + 2] | (data[p + 3] << 8) | (data[p + 4] << 16), hi = data[p + 5] | (data[p + 6] << 8) | (data[p + 7] << 16);
      for (let n = 0; n < 16; n++) {
        const x = bx * 4 + (n & 3), y = by * 4 + (n >> 2);
        if (x >= width || y >= height) continue;
        const o = (y * width + x) * 4, ci = ((lut >>> (2 * n)) & 3) * 4;
        out[o] = colors[ci]; out[o + 1] = colors[ci + 1]; out[o + 2] = colors[ci + 2];
        out[o + 3] = alpha ? alphas[n < 8 ? (lo >> (3 * n)) & 7 : (hi >> (3 * (n - 8))) & 7] : colors[ci + 3];
      }
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { zbDxtDecode };
