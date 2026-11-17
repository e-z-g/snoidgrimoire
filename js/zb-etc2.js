/* zb-etc2.js -- ETC2 RGBA8 (Unity's texture format 47), a texture format of
   the 2015 remake's Android build.
   Read:
   blocks of 4x4 pixels, 16 bytes each, left to right and then down, with
   each side rounded up to whole blocks. The first 8 bytes are the alpha
   (EAC): byte 0 is the base, the high 4 bits of byte 1 the multiplier and
   the low 4 bits a row of the modifier table, and bytes 2-7 a 3-bit index
   for each pixel, big-endian, down each column and then across. The last 8
   bytes are the color (ETC2). Bit 1 of byte 3 picks the differential mode,
   which an overflowing red, green or blue sum turns into the T, H or
   planar mode. Otherwise each half of the block has a base color and a
   row of modifiers, and bytes 4-7 have 2 bits for each pixel.
   Out: RGBA bytes, rows in the order of the blocks, cropped to the width
   and height.
   WHERE IT CAME FROM
   texture2ddecoder's etc.cpp (decode_etc2a8), by K0lb3, under the MIT
   license (see NOTICE), ported line for line and checked against UnityPy
   over every ETC2 texture of the Android build.
   =========================================================================
   Pure: bytes in, pixels out. Used by zb-unity.js. */

/* The decoder's parts stay inside one function, where lookups are fast. */
const zbEtc2Decode = (() => {
  /* Pixel i of the bit order (down each column) to its place in a row-major block. */
  const ZB_ETC2_WRITE_ORDER = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
  const ZB_ETC2_WRITE_ORDER_REV = [15, 11, 7, 3, 14, 10, 6, 2, 13, 9, 5, 1, 12, 8, 4, 0];
  const ZB_ETC1_MODIFIER = [[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]];
  const ZB_ETC1_SUBBLOCK = [
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]];
  const ZB_ETC2_DISTANCE = [3, 6, 11, 16, 23, 32, 41, 64];
  const ZB_ETC2_ALPHA_MODIFIER = [
    [-3, -6, -9, -15, 2, 5, 8, 14], [-3, -7, -10, -13, 2, 6, 9, 12], [-2, -5, -8, -13, 1, 4, 7, 12],
    [-2, -4, -6, -13, 1, 3, 5, 12], [-3, -6, -8, -12, 2, 5, 7, 11], [-3, -7, -9, -11, 2, 6, 8, 10],
    [-4, -7, -8, -11, 3, 6, 7, 10], [-3, -5, -8, -11, 2, 4, 7, 10], [-2, -6, -8, -10, 1, 5, 7, 9],
    [-2, -5, -8, -10, 1, 4, 7, 9], [-2, -4, -8, -10, 1, 3, 7, 9], [-2, -5, -7, -10, 1, 4, 6, 9],
    [-3, -4, -7, -10, 2, 3, 6, 9], [-1, -2, -3, -10, 0, 1, 2, 9], [-4, -6, -8, -9, 3, 5, 7, 8],
    [-3, -5, -7, -9, 2, 4, 6, 8]];

  const clamp = n => n < 0 ? 0 : n > 255 ? 255 : n;

  /* The 4 colors of a T or H block, as r, g, b in turn. */
  const set = new Int32Array(12);
  function zbEtc2Set(n, r, g, b, m) {
    set[n * 3] = clamp(r + m); set[n * 3 + 1] = clamp(g + m); set[n * 3 + 2] = clamp(b + m);
  }

  /* The ETC1 modes, individual and differential: each half of the block
     from its base color, its row of modifiers and each pixel's 2 bits. */
  function zbEtc2Halves(buf, flip, code0, code1, c, j, k) {
    const table = ZB_ETC1_SUBBLOCK[flip];
    for (let i = 0; i < 16; i++, j >>= 1, k >>= 1) {
      const s = table[i];
      const m = ZB_ETC1_MODIFIER[s ? code1 : code0][j & 1];
      const mod = k & 1 ? -m : m;
      const p = ZB_ETC2_WRITE_ORDER[i] * 4;
      buf[p] = clamp(c[s * 3] + mod); buf[p + 1] = clamp(c[s * 3 + 1] + mod); buf[p + 2] = clamp(c[s * 3 + 2] + mod);
      buf[p + 3] = 255;
    }
  }

  const c = new Int32Array(9);

  /* One block's color (8 bytes at d) into buf as [r, g, b, a] quads, row by row. */
  function zbEtc2Block(data, d, buf) {
    const b0 = data[d], b1 = data[d + 1], b2 = data[d + 2], b3 = data[d + 3];
    const b4 = data[d + 4], b5 = data[d + 5], b6 = data[d + 6], b7 = data[d + 7];
    let j = b6 << 8 | b7;
    let k = b4 << 8 | b5;
    if (b3 & 2) {
      const r = b0 & 0xf8, dr = (b0 << 3 & 0x18) - (b0 << 3 & 0x20);
      const g = b1 & 0xf8, dg = (b1 << 3 & 0x18) - (b1 << 3 & 0x20);
      const b = b2 & 0xf8, db = (b2 << 3 & 0x18) - (b2 << 3 & 0x20);
      if (r + dr < 0 || r + dr > 255) {
        /* T */
        const r0 = (b0 << 3 & 0xc0) | (b0 << 4 & 0x30) | (b0 >> 1 & 0xc) | (b0 & 3);
        const g0 = (b1 & 0xf0) | b1 >> 4, b0c = ((b1 & 0x0f) | b1 << 4) & 0xff;
        const r1 = (b2 & 0xf0) | b2 >> 4, g1 = ((b2 & 0x0f) | b2 << 4) & 0xff, b1c = (b3 & 0xf0) | b3 >> 4;
        const dist = ZB_ETC2_DISTANCE[(b3 >> 1 & 6) | (b3 & 1)];
        zbEtc2Set(0, r0, g0, b0c, 0); zbEtc2Set(1, r1, g1, b1c, dist);
        zbEtc2Set(2, r1, g1, b1c, 0); zbEtc2Set(3, r1, g1, b1c, -dist);
        zbEtc2Paint(buf, j, k << 1);
      } else if (g + dg < 0 || g + dg > 255) {
        /* H */
        const r0 = (b0 << 1 & 0xf0) | (b0 >> 3 & 0xf);
        let g0 = (b0 << 5 & 0xe0) | (b1 & 0x10);
        g0 |= g0 >> 4;
        let b0c = (b1 & 8) | (b1 << 1 & 6) | b2 >> 7;
        b0c = (b0c | b0c << 4) & 0xff;
        const r1 = (b2 << 1 & 0xf0) | (b2 >> 3 & 0xf);
        let g1 = (b2 << 5 & 0xe0) | (b3 >> 3 & 0x10);
        g1 |= g1 >> 4;
        const b1c = (b3 << 1 & 0xf0) | (b3 >> 3 & 0xf);
        let di = (b3 & 4) | (b3 << 1 & 2);
        if (r0 > r1 || (r0 === r1 && (g0 > g1 || (g0 === g1 && b0c >= b1c)))) ++di;
        const dist = ZB_ETC2_DISTANCE[di];
        zbEtc2Set(0, r0, g0, b0c, dist); zbEtc2Set(1, r0, g0, b0c, -dist);
        zbEtc2Set(2, r1, g1, b1c, dist); zbEtc2Set(3, r1, g1, b1c, -dist);
        zbEtc2Paint(buf, j, k << 1);
      } else if (b + db < 0 || b + db > 255) {
        /* planar: the origin, horizontal and vertical colors, mixed across the block */
        const ro = (b0 << 1 & 0xfc) | (b0 >> 5 & 3);
        const go = (b0 << 7 & 0x80) | (b1 & 0x7e) | (b0 & 1);
        let bo = (b1 << 7 & 0x80) | (b2 << 2 & 0x60) | (b2 << 3 & 0x18) | (b3 >> 5 & 4);
        bo |= bo >> 6;
        const rh = (b3 << 1 & 0xf8) | (b3 << 2 & 4) | (b3 >> 5 & 3);
        const gh = (b4 & 0xfe) | b4 >> 7;
        let bh = (b4 << 7 & 0x80) | (b5 >> 1 & 0x7c);
        bh |= bh >> 6;
        const rv = (b5 << 5 & 0xe0) | (b6 >> 3 & 0x1c) | (b5 >> 1 & 3);
        const gv = (b6 << 3 & 0xf8) | (b7 >> 5 & 0x6) | (b6 >> 4 & 1);
        const bv = (b7 << 2 | (b7 >> 4 & 3)) & 0xff;
        for (let y = 0, p = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++, p += 4) {
            buf[p] = clamp((x * (rh - ro) + y * (rv - ro) + 4 * ro + 2) >> 2);
            buf[p + 1] = clamp((x * (gh - go) + y * (gv - go) + 4 * go + 2) >> 2);
            buf[p + 2] = clamp((x * (bh - bo) + y * (bv - bo) + 4 * bo + 2) >> 2);
            buf[p + 3] = 255;
          }
        }
      } else {
        /* differential */
        c[0] = r | r >> 5; c[1] = g | g >> 5; c[2] = b | b >> 5;
        const r1 = r + dr, g1 = g + dg, b1c = b + db;
        c[3] = r1 | r1 >> 5; c[4] = g1 | g1 >> 5; c[5] = b1c | b1c >> 5;
        zbEtc2Halves(buf, b3 & 1, b3 >> 5, b3 >> 2 & 7, c, j, k);
      }
    } else {
      /* individual */
      c[0] = (b0 & 0xf0) | b0 >> 4; c[3] = ((b0 & 0x0f) | b0 << 4) & 0xff;
      c[1] = (b1 & 0xf0) | b1 >> 4; c[4] = ((b1 & 0x0f) | b1 << 4) & 0xff;
      c[2] = (b2 & 0xf0) | b2 >> 4; c[5] = ((b2 & 0x0f) | b2 << 4) & 0xff;
      zbEtc2Halves(buf, b3 & 1, b3 >> 5, b3 >> 2 & 7, c, j, k);
    }
  }

  /* A T or H block's pixels, each from one of its 4 colors. */
  function zbEtc2Paint(buf, j, k) {
    for (let i = 0; i < 16; i++, j >>= 1, k >>= 1) {
      const n = ((k & 2) | (j & 1)) * 3, p = ZB_ETC2_WRITE_ORDER[i] * 4;
      buf[p] = set[n]; buf[p + 1] = set[n + 1]; buf[p + 2] = set[n + 2]; buf[p + 3] = 255;
    }
  }

  /* One block's alpha (8 bytes at d) into the alpha bytes of buf. */
  function zbEtc2Alpha(data, d, buf) {
    const base = data[d], multiplier = data[d + 1] >> 4;
    if (!multiplier) {
      for (let p = 3; p < 64; p += 4) buf[p] = base;
      return;
    }
    const table = ZB_ETC2_ALPHA_MODIFIER[data[d + 1] & 0xf];
    /* The 48 index bits in two halves of 24, the low half first. */
    let bits = data[d + 5] << 16 | data[d + 6] << 8 | data[d + 7];
    for (let i = 0; i < 16; i++, bits >>= 3) {
      if (i === 8) bits = data[d + 2] << 16 | data[d + 3] << 8 | data[d + 4];
      buf[ZB_ETC2_WRITE_ORDER_REV[i] * 4 + 3] = clamp(base + multiplier * table[bits & 7]);
    }
  }

  return function zbEtc2Decode(data, width, height) {
    const blocksX = (width + 3) >> 2, blocksY = (height + 3) >> 2;
    if (data.length < blocksX * blocksY * 16) return null;
    const out = new Uint8ClampedArray(width * height * 4);
    const buf = new Uint8Array(64);
    for (let by = 0, d = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++, d += 16) {
        zbEtc2Block(data, d + 8, buf);
        zbEtc2Alpha(data, d, buf);
        const x0 = bx * 4, rowBytes = Math.min(4, width - x0) * 4;
        for (let y = 0; y < 4 && by * 4 + y < height; y++) {
          const o = ((by * 4 + y) * width + x0) * 4;
          for (let n = 0; n < rowBytes; n++) out[o + n] = buf[y * 16 + n];
        }
      }
    }
    return out;
  };
})();

if (typeof module !== 'undefined') module.exports = { zbEtc2Decode };
