/* zb-astc.js -- ASTC, the texture format of the 2015 remake's iPhone build.
   Read:
   the image is cut into blocks of blockW by blockH pixels (4x4 to 12x12),
   left to right and then down, 16 bytes each. A block is either a void
   extent (bytes 0xfc and a set low bit in byte 1: one color, 8-bit or
   half-float, in bytes 8-15) or a coded block. A coded block's first 11
   bits give the grid of weights, its range and whether there are two
   planes. Then come 1 to 4 partitions, each with a color endpoint mode
   (LDR or HDR), the endpoint values packed as bits, trits or quints from
   bit 17 (or 29) upward, and the weights packed from bit 127 downward. The
   weights are spread from their grid over the block, each pixel's
   partition comes from a hash of the seed, and each channel is mixed
   between its two endpoints by the weight, as 16-bit values whose top 8
   bits are kept (as astcenc does in its 8-bit mode, which UnityPy uses).
   HDR channels are made 8-bit, clamped to 0-1.
   Out: RGBA bytes, rows in the order of the blocks (the first row of
   blocks first).
   WHERE IT CAME FROM
   texture2ddecoder's astc.cpp, by K0lb3, under the MIT license (see
   NOTICE), ported line for line, with the LDR mix changed to astcenc's
   (texture2ddecoder rounds it, and was 1 off in some pixels), and checked against UnityPy over every
   ASTC texture of the iPhone build (utilities/remake_check.mjs).
   =========================================================================
   Pure: bytes in, pixels out. Used by zb-unity.js. */

/* The decoder's parts stay inside one function, where lookups are fast. */
const zbAstcDecode = (() => {
  const M_ceil = Math.ceil, M_floor = Math.floor, M_fround = Math.fround, M_min = Math.min, isFin = Number.isFinite, U8C = Uint8ClampedArray, U32 = Uint32Array, I32 = Int32Array;

  const ZB_ASTC_WEIGHT_PREC_A = [0, 0, 0, 3, 0, 5, 3, 0, 0, 0, 5, 3, 0, 5, 3, 0];
  const ZB_ASTC_WEIGHT_PREC_B = [0, 0, 1, 0, 2, 0, 1, 3, 0, 0, 1, 2, 4, 2, 3, 5];
  const ZB_ASTC_CEM_A = [0, 3, 5, 0, 3, 5, 0, 3, 5, 0, 3, 5, 0, 3, 5, 0, 3, 0, 0];
  const ZB_ASTC_CEM_B = [8, 6, 5, 7, 5, 4, 6, 4, 3, 5, 3, 2, 4, 2, 1, 3, 1, 2, 1];

  /* The trits and the quints, by their packed bits. */
  const ZB_ASTC_TRITS = [ [0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 1, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 1, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1, 2, 2], [0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 0, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 0, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 1, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 1], [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 2, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]];
  const ZB_ASTC_QUINTS = [ [0, 1, 2, 3, 4, 0, 4, 4, 0, 1, 2, 3, 4, 1, 4, 4, 0, 1, 2, 3, 4, 2, 4, 4, 0, 1, 2, 3, 4, 3, 4, 4, 0, 1, 2, 3, 4, 0, 4, 0, 0, 1, 2, 3, 4, 1, 4, 1, 0, 1, 2, 3, 4, 2, 4, 2, 0, 1, 2, 3, 4, 3, 4, 3, 0, 1, 2, 3, 4, 0, 2, 3, 0, 1, 2, 3, 4, 1, 2, 3, 0, 1, 2, 3, 4, 2, 2, 3, 0, 1, 2, 3, 4, 3, 2, 3, 0, 1, 2, 3, 4, 0, 0, 1, 0, 1, 2, 3, 4, 1, 0, 1, 0, 1, 2, 3, 4, 2, 0, 1, 0, 1, 2, 3, 4, 3, 0, 1], [0, 0, 0, 0, 0, 4, 4, 4, 1, 1, 1, 1, 1, 4, 4, 4, 2, 2, 2, 2, 2, 4, 4, 4, 3, 3, 3, 3, 3, 4, 4, 4, 0, 0, 0, 0, 0, 4, 0, 4, 1, 1, 1, 1, 1, 4, 1, 4, 2, 2, 2, 2, 2, 4, 2, 4, 3, 3, 3, 3, 3, 4, 3, 4, 0, 0, 0, 0, 0, 4, 0, 0, 1, 1, 1, 1, 1, 4, 1, 1, 2, 2, 2, 2, 2, 4, 2, 2, 3, 3, 3, 3, 3, 4, 3, 3, 0, 0, 0, 0, 0, 4, 0, 0, 1, 1, 1, 1, 1, 4, 1, 1, 2, 2, 2, 2, 2, 4, 2, 2, 3, 3, 3, 3, 3, 4, 3, 3], [0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 1, 4, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 0, 3, 4, 1, 1, 1, 1, 1, 1, 4, 4, 1, 1, 1, 1, 1, 1, 4, 4, 1, 1, 1, 1, 1, 1, 4, 4, 1, 1, 1, 1, 1, 1, 4, 4, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 2, 2, 2, 2, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4]];

  function zbAstcDecode(data, width, height, blockW, blockH) {
    const out = new U8C(width * height * 4);
    const bx = M_ceil(width / blockW), by = M_ceil(height / blockH);
    const buf = new U32(144), words = new I32(4);
    const ctx = zbAstcContext();
    for (let y = 0, d = 0; y < by; y++) {
      for (let x = 0; x < bx; x++, d += 16) {
        for (let i = 0; i < 4; i++) words[i] = data[d + 4 * i] | data[d + 4 * i + 1] << 8 | data[d + 4 * i + 2] << 16 | data[d + 4 * i + 3] << 24;
        zbAstcBlock(data, d, words, blockW, blockH, buf, ctx);
        const x0 = x * blockW, xl = M_min(blockW, width - x0);
        for (let j = 0; j < blockH && y * blockH + j < height; j++) {
          let o = ((y * blockH + j) * width + x0) * 4;
          for (let i = 0; i < xl; i++, o += 4) {
            const c = buf[j * blockW + i];
            out[o] = c >>> 16 & 255; out[o + 1] = c >>> 8 & 255; out[o + 2] = c & 255; out[o + 3] = c >>> 24;
          }
        }
      }
    }
    return out;
  }

  /* The scratch arrays one decode reuses for each block. */
  function zbAstcContext() {
    return {
      cem: [0, 0, 0, 0], endpoints: [new I32(8), new I32(8), new I32(8), new I32(8)],
      weights: [new I32(144), new I32(144)], partition: new I32(144),
      seqBits: new I32(160), seqNon: new I32(160), ev: new I32(40), wv: new I32(512),
    };
  }

  /* Bits start..start+len-1 of the block, bits outside it read as 0. */
  function zbAstcBits(words, start, len) {
    if (len <= 0) return 0;
    if (len > 24) return zbAstcBits(words, start, 24) + zbAstcBits(words, start + 24, len - 24) * 16777216;
    let r = 0;
    if (start < 0) { r = 0; len += start; if (len <= 0) return 0; const v = zbAstcBits(words, 0, len); return v * 2 ** -start; }
    if (start >= 128) return 0;
    const w = start >> 5, s = start & 31;
    r = words[w] >>> s;
    if (s && w < 3) r |= words[w + 1] << (32 - s);
    r = (r & (len >= 32 ? -1 : (1 << len) - 1)) >>> 0;
    return r;
  }

  function zbAstcReverse(v, len) {
    let r = 0;
    for (let i = 0; i < len; i++) if (M_floor(v / 2 ** i) % 2) r += 2 ** (len - 1 - i);
    return r;
  }

  const zbAstcShr = (d, k) => M_floor(d / 2 ** k);

  function zbAstcIntSeq(words, offset, a, b, count, reverse, ctx) {
    const bits = ctx.seqBits, non = ctx.seqNon;
    if (count <= 0) return;
    let n = 0;
    const mask = (1 << b) - 1;
    if (a === 3 || a === 5) {
      const per = a === 3 ? 5 : 3, size = a === 3 ? 8 + 5 * b : 7 + 3 * b;
      const blocks = M_floor((count + per - 1) / per), lastCount = (count + per - 1) % per + 1;
      const lastSize = M_floor((size * lastCount + per - 1) / per);
      const m = a === 3 ? [0, 2, 4, 5, 7] : [0, 3, 5];
      const table = a === 3 ? ZB_ASTC_TRITS : ZB_ASTC_QUINTS;
      for (let i = 0, p = offset; i < blocks; i++) {
        const now = i < blocks - 1 ? size : lastSize;
        let d;
        if (reverse) { d = zbAstcReverse(zbAstcBits(words, p - now, now), now); p -= size; }
        else { d = zbAstcBits(words, p, now); p += size; }
        let x;
        if (a === 3) x = (zbAstcShr(d, b) & 3) | (zbAstcShr(d, b * 2) & 0xc) | (zbAstcShr(d, b * 3) & 0x10) | (zbAstcShr(d, b * 4) & 0x60) | (zbAstcShr(d, b * 5) & 0x80);
        else x = (zbAstcShr(d, b) & 7) | (zbAstcShr(d, b * 2) & 0x18) | (zbAstcShr(d, b * 3) & 0x60);
        for (let j = 0; j < per && n < count; j++, n++) { bits[n] = zbAstcShr(d, m[j] + b * j) & mask; non[n] = table[j][x]; }
      }
    } else if (reverse) {
      for (let p = offset - b; n < count; n++, p -= b) { bits[n] = zbAstcReverse(zbAstcBits(words, p, b), b); non[n] = 0; }
    } else {
      for (let p = offset; n < count; n++, p += b) { bits[n] = zbAstcBits(words, p, b); non[n] = 0; }
    }
  }

  function zbAstcParams(buf, o, words, k) {
    const b0 = buf[o], b1 = buf[o + 1], u16 = b0 | b1 << 8;
    k.dualPlane = b1 & 4 ? 1 : 0;
    k.weightRange = (b0 >> 4 & 1) | (b1 << 2 & 8);
    if (b0 & 3) {
      k.weightRange |= b0 << 1 & 6;
      switch (b0 & 0xc) {
        case 0: k.width = (u16 >> 7 & 3) + 4; k.height = (b0 >> 5 & 3) + 2; break;
        case 4: k.width = (u16 >> 7 & 3) + 8; k.height = (b0 >> 5 & 3) + 2; break;
        case 8: k.width = (b0 >> 5 & 3) + 2; k.height = (u16 >> 7 & 3) + 8; break;
        default:
          if (b1 & 1) { k.width = (b0 >> 7 & 1) + 2; k.height = (b0 >> 5 & 3) + 2; }
          else { k.width = (b0 >> 5 & 3) + 2; k.height = (b0 >> 7 & 1) + 6; }
      }
    } else {
      k.weightRange |= b0 >> 1 & 6;
      switch (u16 & 0x180) {
        case 0: k.width = 12; k.height = (b0 >> 5 & 3) + 2; break;
        case 0x80: k.width = (b0 >> 5 & 3) + 2; k.height = 12; break;
        case 0x100: k.width = (b0 >> 5 & 3) + 6; k.height = (b1 >> 1 & 3) + 6; k.dualPlane = 0; k.weightRange &= 7; break;
        default: k.width = b0 & 0x20 ? 10 : 6; k.height = b0 & 0x20 ? 6 : 10;
      }
    }
    k.partNum = (b1 >> 3 & 3) + 1;
    k.weightNum = k.width * k.height * (k.dualPlane ? 2 : 1);
    const wa = ZB_ASTC_WEIGHT_PREC_A[k.weightRange], wb = ZB_ASTC_WEIGHT_PREC_B[k.weightRange], wn = k.weightNum;
    const weightBits = wn * wb + (wa === 3 ? M_floor((wn * 8 + 4) / 5) : wa === 5 ? M_floor((wn * 7 + 2) / 3) : 0);
    let configBits, cemBase = 0;
    const cem = k.cem;
    if (k.partNum === 1) {
      cem[0] = (b1 | buf[o + 2] << 8) >> 5 & 0xf;
      configBits = 17;
    } else {
      cemBase = (buf[o + 2] | buf[o + 3] << 8) >> 7 & 3;
      if (cemBase === 0) {
        const c = buf[o + 3] >> 1 & 0xf;
        for (let i = 0; i < k.partNum; i++) cem[i] = c;
        configBits = 29;
      } else {
        const b3 = buf[o + 3];
        for (let i = 0; i < k.partNum; i++) cem[i] = ((b3 >> (i + 1) & 1) + cemBase - 1) << 2;
        if (k.partNum === 2) { cem[0] |= b3 >> 3 & 3; cem[1] |= zbAstcBits(words, 126 - weightBits, 2); }
        else if (k.partNum === 3) {
          cem[0] |= b3 >> 4 & 1; cem[0] |= zbAstcBits(words, 122 - weightBits, 2) & 2;
          cem[1] |= zbAstcBits(words, 124 - weightBits, 2); cem[2] |= zbAstcBits(words, 126 - weightBits, 2);
        } else for (let i = 0; i < 4; i++) cem[i] |= zbAstcBits(words, 120 + i * 2 - weightBits, 2);
        configBits = 25 + k.partNum * 3;
      }
    }
    if (k.dualPlane) {
      configBits += 2;
      k.planeSelector = zbAstcBits(words, cemBase ? 130 - weightBits - k.partNum * 3 : 126 - weightBits, 2);
    }
    const remain = 128 - configBits - weightBits;
    let ev = 0;
    for (let i = 0; i < k.partNum; i++) ev += (cem[i] >> 1 & 6) + 2;
    k.endpointValueNum = ev;
    k.cemRange = 0;
    for (let i = 0; i < ZB_ASTC_CEM_A.length; i++) {
      const a = ZB_ASTC_CEM_A[i], b = ZB_ASTC_CEM_B[i];
      const bits = ev * b + (a === 3 ? M_floor((ev * 8 + 4) / 5) : a === 5 ? M_floor((ev * 7 + 2) / 3) : 0);
      if (bits <= remain) { k.cemRange = i; break; }
    }
  }

  const zbAstcClamp = n => n < 0 ? 0 : n > 255 ? 255 : n;
  const zbAstcClampHdr = n => n < 0 ? 0 : n > 0xfff ? 0xfff : n;

  function zbAstcSet(e, r1, g1, b1, a1, r2, g2, b2, a2) { e[0] = r1; e[1] = g1; e[2] = b1; e[3] = a1; e[4] = r2; e[5] = g2; e[6] = b2; e[7] = a2; }
  function zbAstcSetClamp(e, r1, g1, b1, a1, r2, g2, b2, a2) {
    zbAstcSet(e, zbAstcClamp(r1), zbAstcClamp(g1), zbAstcClamp(b1), zbAstcClamp(a1), zbAstcClamp(r2), zbAstcClamp(g2), zbAstcClamp(b2), zbAstcClamp(a2));
  }
  function zbAstcSetBlue(e, r1, g1, b1, a1, r2, g2, b2, a2) { zbAstcSet(e, (r1 + b1) >> 1, (g1 + b1) >> 1, b1, a1, (r2 + b2) >> 1, (g2 + b2) >> 1, b2, a2); }
  function zbAstcSetBlueClamp(e, r1, g1, b1, a1, r2, g2, b2, a2) {
    zbAstcSetClamp(e, (r1 + b1) >> 1, (g1 + b1) >> 1, b1, a1, (r2 + b2) >> 1, (g2 + b2) >> 1, b2, a2);
  }
  function zbAstcSetHdrClamp(e, r1, g1, b1, a1, r2, g2, b2, a2) {
    zbAstcSet(e, zbAstcClampHdr(r1), zbAstcClampHdr(g1), zbAstcClampHdr(b1), zbAstcClampHdr(a1), zbAstcClampHdr(r2), zbAstcClampHdr(g2), zbAstcClampHdr(b2), zbAstcClampHdr(a2));
  }

  /* Moves the top bit of v[ia] into v[ib] and makes v[ia] a 6-bit signed
     value. */
  function zbAstcTransfer(v, ia, ib) {
    v[ib] = (v[ib] >> 1) | (v[ia] & 0x80);
    v[ia] = (v[ia] >> 1) & 0x3f;
    if (v[ia] & 0x20) v[ia] -= 0x40;
  }

  function zbAstcHdr7(e, v, o) {
    const modeval = (v[o + 2] >> 4 & 0x8) | (v[o + 1] >> 5 & 0x4) | (v[o] >> 6);
    let major, mode;
    if ((modeval & 0xc) !== 0xc) { major = modeval >> 2; mode = modeval & 3; }
    else if (modeval !== 0xf) { major = modeval & 3; mode = 4; }
    else { major = 0; mode = 5; }
    const v0 = v[o], v1 = v[o + 1], v2 = v[o + 2], v3 = v[o + 3];
    const c = [v0 & 0x3f, v1 & 0x1f, v2 & 0x1f, v3 & 0x1f];
    let sh;
    switch (mode) {
      case 0: c[3] |= v3 & 0x60; c[0] |= v3 >> 1 & 0x40; c[0] |= v2 << 1 & 0x80; c[0] |= v1 << 3 & 0x300; c[0] |= v2 << 5 & 0x400; sh = 1; break;
      case 1: c[1] |= v1 & 0x20; c[2] |= v2 & 0x20; c[0] |= v3 >> 1 & 0x40; c[0] |= v2 << 1 & 0x80; c[0] |= v1 << 2 & 0x100; c[0] |= v3 << 4 & 0x600; sh = 1; break;
      case 2: c[3] |= v3 & 0xe0; c[0] |= v2 << 1 & 0xc0; c[0] |= v1 << 3 & 0x300; sh = 2; break;
      case 3: c[1] |= v1 & 0x20; c[2] |= v2 & 0x20; c[3] |= v3 & 0x60; c[0] |= v3 >> 1 & 0x40; c[0] |= v2 << 1 & 0x80; c[0] |= v1 << 2 & 0x100; sh = 3; break;
      case 4: c[1] |= v1 & 0x60; c[2] |= v2 & 0x60; c[3] |= v3 & 0x20; c[0] |= v3 >> 1 & 0x40; c[0] |= v3 << 1 & 0x80; sh = 4; break;
      default: c[1] |= v1 & 0x60; c[2] |= v2 & 0x60; c[3] |= v3 & 0x60; c[0] |= v3 >> 1 & 0x40; sh = 5;
    }
    for (let i = 0; i < 4; i++) c[i] <<= sh;
    if (mode !== 5) { c[1] = c[0] - c[1]; c[2] = c[0] - c[2]; }
    if (major === 1) zbAstcSetHdrClamp(e, c[1] - c[3], c[0] - c[3], c[2] - c[3], 0x780, c[1], c[0], c[2], 0x780);
    else if (major === 2) zbAstcSetHdrClamp(e, c[2] - c[3], c[1] - c[3], c[0] - c[3], 0x780, c[2], c[1], c[0], 0x780);
    else zbAstcSetHdrClamp(e, c[0] - c[3], c[1] - c[3], c[2] - c[3], 0x780, c[0], c[1], c[2], 0x780);
  }

  function zbAstcHdr11(e, v, o, alpha1, alpha2) {
    const V = i => v[o + i];
    const major = (V(4) >> 7) | (V(5) >> 6 & 2);
    if (major === 3) {
      zbAstcSet(e, V(0) << 4, V(2) << 4, V(4) << 5 & 0xfe0, alpha1, V(1) << 4, V(3) << 4, V(5) << 5 & 0xfe0, alpha2);
      return;
    }
    const mode = (V(1) >> 7) | (V(2) >> 6 & 2) | (V(3) >> 5 & 4);
    let va = V(0) | (V(1) << 2 & 0x100), vb0 = V(2) & 0x3f, vb1 = V(3) & 0x3f, vc = V(1) & 0x3f, vd0, vd1;
    const sx = (x, bits) => (x << (32 - bits)) >> (32 - bits);
    if (mode === 0 || mode === 2) { vd0 = sx(V(4) & 0x7f, 7); vd1 = sx(V(5) & 0x7f, 7); }
    else if (mode & 1) { vd0 = sx(V(4) & 0x3f, 6); vd1 = sx(V(5) & 0x3f, 6); }
    else { vd0 = sx(V(4) & 0x1f, 5); vd1 = sx(V(5) & 0x1f, 5); }
    switch (mode) {
      case 0: vb0 |= V(2) & 0x40; vb1 |= V(3) & 0x40; break;
      case 1: vb0 |= V(2) & 0x40; vb1 |= V(3) & 0x40; vb0 |= V(4) << 1 & 0x80; vb1 |= V(5) << 1 & 0x80; break;
      case 2: va |= V(2) << 3 & 0x200; vc |= V(3) & 0x40; break;
      case 3: va |= V(4) << 3 & 0x200; vc |= V(5) & 0x40; vb0 |= V(2) & 0x40; vb1 |= V(3) & 0x40; break;
      case 4: va |= V(4) << 4 & 0x200; va |= V(5) << 5 & 0x400; vb0 |= V(2) & 0x40; vb1 |= V(3) & 0x40; vb0 |= V(4) << 1 & 0x80; vb1 |= V(5) << 1 & 0x80; break;
      case 5: va |= V(2) << 3 & 0x200; va |= V(3) << 4 & 0x400; vc |= V(5) & 0x40; vc |= V(4) << 1 & 0x80; break;
      case 6: va |= V(4) << 4 & 0x200; va |= V(5) << 5 & 0x400; va |= V(4) << 5 & 0x800; vc |= V(5) & 0x40; vb0 |= V(2) & 0x40; vb1 |= V(3) & 0x40; break;
      default: va |= V(2) << 3 & 0x200; va |= V(3) << 4 & 0x400; va |= V(4) << 5 & 0x800; vc |= V(5) & 0x40;
    }
    const sh = (mode >> 1) ^ 3;
    va <<= sh; vb0 <<= sh; vb1 <<= sh; vc <<= sh;
    vd0 = (vd0 * (1 << sh)) << 16 >> 16; vd1 = (vd1 * (1 << sh)) << 16 >> 16;
    if (major === 1) zbAstcSetHdrClamp(e, va - vb0 - vc - vd0, va - vc, va - vb1 - vc - vd1, alpha1, va - vb0, va, va - vb1, alpha2);
    else if (major === 2) zbAstcSetHdrClamp(e, va - vb1 - vc - vd1, va - vb0 - vc - vd0, va - vc, alpha1, va - vb1, va - vb0, va, alpha2);
    else zbAstcSetHdrClamp(e, va - vc, va - vb0 - vc - vd0, va - vb1 - vc - vd1, alpha1, va, va - vb0, va - vb1, alpha2);
  }

  function zbAstcEndpoints(words, k, ctx) {
    const a = ZB_ASTC_CEM_A[k.cemRange], b = ZB_ASTC_CEM_B[k.cemRange], n = k.endpointValueNum;
    zbAstcIntSeq(words, k.partNum === 1 ? 17 : 29, a, b, n, 0, ctx);
    const bits = ctx.seqBits, non = ctx.seqNon, v = ctx.ev;
    if (a === 3 || a === 5) {
      const c = a === 3 ? [0, 204, 93, 44, 22, 11, 5][b] : [0, 113, 54, 26, 13, 6][b];
      for (let i = 0; i < n; i++) {
        const m = (bits[i] & 1) * 0x1ff, x = bits[i] >> 1;
        let bb = 0;
        if (a === 3) {
          switch (b) {
            case 2: bb = 0b100010110 * x; break;
            case 3: bb = x << 7 | x << 2 | x; break;
            case 4: bb = x << 6 | x; break;
            case 5: bb = x << 5 | x >> 2; break;
            case 6: bb = x << 4 | x >> 4; break;
          }
        } else {
          switch (b) {
            case 2: bb = 0b100001100 * x; break;
            case 3: bb = x << 7 | x << 1 | x >> 1; break;
            case 4: bb = x << 6 | x >> 1; break;
            case 5: bb = x << 5 | x >> 3; break;
          }
        }
        v[i] = (m & 0x80) | ((non[i] * c + bb) ^ m) >> 2;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const s = bits[i];
        switch (b) {
          case 1: v[i] = s * 0xff; break;
          case 2: v[i] = s * 0x55; break;
          case 3: v[i] = s << 5 | s << 2 | s >> 1; break;
          case 4: v[i] = s << 4 | s; break;
          case 5: v[i] = s << 3 | s >> 2; break;
          case 6: v[i] = s << 2 | s >> 4; break;
          case 7: v[i] = s << 1 | s >> 6; break;
          default: v[i] = s;
        }
      }
    }
    for (let p = 0, o = 0; p < k.partNum; o += ((k.cem[p] >> 2) + 1) * 2, p++) {
      const e = ctx.endpoints[p];
      switch (k.cem[p]) {
        case 0: zbAstcSet(e, v[o], v[o], v[o], 255, v[o + 1], v[o + 1], v[o + 1], 255); break;
        case 1: {
          const l0 = (v[o] >> 2) | (v[o + 1] & 0xc0), l1 = zbAstcClamp(l0 + (v[o + 1] & 0x3f));
          zbAstcSet(e, l0, l0, l0, 255, l1, l1, l1, 255);
          break;
        }
        case 2: {
          let y0, y1;
          if (v[o] <= v[o + 1]) { y0 = v[o] << 4; y1 = v[o + 1] << 4; } else { y0 = (v[o + 1] << 4) + 8; y1 = (v[o] << 4) - 8; }
          zbAstcSet(e, y0, y0, y0, 0x780, y1, y1, y1, 0x780);
          break;
        }
        case 3: {
          let y0, d;
          if (v[o] & 0x80) { y0 = (v[o + 1] & 0xe0) << 4 | (v[o] & 0x7f) << 2; d = (v[o + 1] & 0x1f) << 2; }
          else { y0 = (v[o + 1] & 0xf0) << 4 | (v[o] & 0x7f) << 1; d = (v[o + 1] & 0x0f) << 1; }
          const y1 = zbAstcClampHdr(y0 + d);
          zbAstcSet(e, y0, y0, y0, 0x780, y1, y1, y1, 0x780);
          break;
        }
        case 4: zbAstcSet(e, v[o], v[o], v[o], v[o + 2], v[o + 1], v[o + 1], v[o + 1], v[o + 3]); break;
        case 5:
          zbAstcTransfer(v, o + 1, o); zbAstcTransfer(v, o + 3, o + 2);
          v[o + 1] += v[o];
          zbAstcSetClamp(e, v[o], v[o], v[o], v[o + 2], v[o + 1], v[o + 1], v[o + 1], v[o + 2] + v[o + 3]);
          break;
        case 6: zbAstcSet(e, v[o] * v[o + 3] >> 8, v[o + 1] * v[o + 3] >> 8, v[o + 2] * v[o + 3] >> 8, 255, v[o], v[o + 1], v[o + 2], 255); break;
        case 7: zbAstcHdr7(e, v, o); break;
        case 8:
          if (v[o] + v[o + 2] + v[o + 4] <= v[o + 1] + v[o + 3] + v[o + 5]) zbAstcSet(e, v[o], v[o + 2], v[o + 4], 255, v[o + 1], v[o + 3], v[o + 5], 255);
          else zbAstcSetBlue(e, v[o + 1], v[o + 3], v[o + 5], 255, v[o], v[o + 2], v[o + 4], 255);
          break;
        case 9:
          zbAstcTransfer(v, o + 1, o); zbAstcTransfer(v, o + 3, o + 2); zbAstcTransfer(v, o + 5, o + 4);
          if (v[o + 1] + v[o + 3] + v[o + 5] >= 0) zbAstcSetClamp(e, v[o], v[o + 2], v[o + 4], 255, v[o] + v[o + 1], v[o + 2] + v[o + 3], v[o + 4] + v[o + 5], 255);
          else zbAstcSetBlueClamp(e, v[o] + v[o + 1], v[o + 2] + v[o + 3], v[o + 4] + v[o + 5], 255, v[o], v[o + 2], v[o + 4], 255);
          break;
        case 10: zbAstcSet(e, v[o] * v[o + 3] >> 8, v[o + 1] * v[o + 3] >> 8, v[o + 2] * v[o + 3] >> 8, v[o + 4], v[o], v[o + 1], v[o + 2], v[o + 5]); break;
        case 11: zbAstcHdr11(e, v, o, 0x780, 0x780); break;
        case 12:
          if (v[o] + v[o + 2] + v[o + 4] <= v[o + 1] + v[o + 3] + v[o + 5]) zbAstcSet(e, v[o], v[o + 2], v[o + 4], v[o + 6], v[o + 1], v[o + 3], v[o + 5], v[o + 7]);
          else zbAstcSetBlue(e, v[o + 1], v[o + 3], v[o + 5], v[o + 7], v[o], v[o + 2], v[o + 4], v[o + 6]);
          break;
        case 13:
          zbAstcTransfer(v, o + 1, o); zbAstcTransfer(v, o + 3, o + 2); zbAstcTransfer(v, o + 5, o + 4); zbAstcTransfer(v, o + 7, o + 6);
          if (v[o + 1] + v[o + 3] + v[o + 5] >= 0) zbAstcSetClamp(e, v[o], v[o + 2], v[o + 4], v[o + 6], v[o] + v[o + 1], v[o + 2] + v[o + 3], v[o + 4] + v[o + 5], v[o + 6] + v[o + 7]);
          else zbAstcSetBlueClamp(e, v[o] + v[o + 1], v[o + 2] + v[o + 3], v[o + 4] + v[o + 5], v[o + 6] + v[o + 7], v[o], v[o + 2], v[o + 4], v[o + 6]);
          break;
        case 14: zbAstcHdr11(e, v, o, v[o + 6], v[o + 7]); break;
        default: {
          const mode = ((v[o + 6] >> 7) & 1) | ((v[o + 7] >> 6) & 2);
          v[o + 6] &= 0x7f; v[o + 7] &= 0x7f;
          if (mode === 3) zbAstcHdr11(e, v, o, v[o + 6] << 5, v[o + 7] << 5);
          else {
            v[o + 6] |= (v[o + 7] << (mode + 1)) & 0x780;
            v[o + 7] = ((v[o + 7] & (0x3f >> mode)) ^ (0x20 >> mode)) - (0x20 >> mode);
            v[o + 6] <<= 4 - mode; v[o + 7] <<= 4 - mode;
            zbAstcHdr11(e, v, o, v[o + 6], zbAstcClampHdr(v[o + 6] + v[o + 7]));
          }
        }
      }
    }
  }

  function zbAstcWeights(words, k, ctx, bw, bh) {
    const a = ZB_ASTC_WEIGHT_PREC_A[k.weightRange], b = ZB_ASTC_WEIGHT_PREC_B[k.weightRange], n = k.weightNum;
    zbAstcIntSeq(words, 128, a, b, n, 1, ctx);
    const bits = ctx.seqBits, non = ctx.seqNon, wv = ctx.wv;
    wv.fill(0);
    if (a === 0) {
      for (let i = 0; i < n; i++) {
        const s = bits[i];
        switch (b) {
          case 1: wv[i] = s ? 63 : 0; break;
          case 2: wv[i] = s << 4 | s << 2 | s; break;
          case 3: wv[i] = s << 3 | s; break;
          case 4: wv[i] = s << 2 | s >> 2; break;
          case 5: wv[i] = s << 1 | s >> 4; break;
        }
        if (wv[i] > 32) ++wv[i];
      }
    } else if (b === 0) {
      const s = a === 3 ? 32 : 16;
      for (let i = 0; i < n; i++) wv[i] = non[i] * s;
    } else {
      for (let i = 0; i < n; i++) {
        if (a === 3) {
          if (b === 1) wv[i] = non[i] * 50;
          else if (b === 2) { wv[i] = non[i] * 23; if (bits[i] & 2) wv[i] += 0b1000101; }
          else if (b === 3) wv[i] = non[i] * 11 + ((bits[i] << 4 | bits[i] >> 1) & 0b1100011);
        } else if (a === 5) {
          if (b === 1) wv[i] = non[i] * 28;
          else if (b === 2) { wv[i] = non[i] * 13; if (bits[i] & 2) wv[i] += 0b1000010; }
        }
        const m = (bits[i] & 1) * 0x7f;
        wv[i] = (m & 0x20) | ((wv[i] ^ m) >> 2);
        if (wv[i] > 32) ++wv[i];
      }
    }
    const ds = M_floor((1024 + (bw >> 1)) / (bw - 1)), dt = M_floor((1024 + (bh >> 1)) / (bh - 1));
    const pn = k.dualPlane ? 2 : 1, W = k.width;
    for (let t = 0, i = 0; t < bh; t++) {
      for (let s = 0; s < bw; s++, i++) {
        const gs = (ds * s * (W - 1) + 32) >> 6, gt = (dt * t * (k.height - 1) + 32) >> 6;
        const fs = gs & 0xf, ft = gt & 0xf, v = (gs >> 4) + (gt >> 4) * W;
        const w11 = (fs * ft + 8) >> 4, w10 = ft - w11, w01 = fs - w11, w00 = 16 - fs - ft + w11;
        for (let p = 0; p < pn; p++) {
          ctx.weights[p][i] = (wv[v * pn + p] * w00 + wv[(v + 1) * pn + p] * w01 + wv[(v + W) * pn + p] * w10 + wv[(v + W + 1) * pn + p] * w11 + 8) >> 4;
        }
      }
    }
  }

  function zbAstcPartition(words, k, ctx, bw, bh) {
    const small = bw * bh < 31;
    const seed = (words[0] >> 13 & 0x3ff) | (k.partNum - 1) << 10;
    let r = seed >>> 0;
    r = (r ^ (r >>> 15)) >>> 0;
    r = (r - (r << 17 >>> 0)) >>> 0;
    r = (r + (r << 7 >>> 0)) >>> 0;
    r = (r + (r << 4 >>> 0)) >>> 0;
    r = (r ^ (r >>> 5)) >>> 0;
    r = (r + (r << 16 >>> 0)) >>> 0;
    r = (r ^ (r >>> 7)) >>> 0;
    r = (r ^ (r >>> 3)) >>> 0;
    r = (r ^ (r << 6)) >>> 0;
    r = (r ^ (r >>> 17)) >>> 0;
    const seeds = [];
    for (let i = 0; i < 8; i++) { const s = (r >>> (i * 4)) & 0xf; seeds.push(s * s); }
    const sh = [seed & 2 ? 4 : 5, k.partNum === 3 ? 6 : 5];
    for (let i = 0; i < 8; i++) seeds[i] >>= seed & 1 ? sh[i % 2] : sh[1 - i % 2];
    const pn = k.partNum;
    for (let y = 0, i = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++, i++) {
        const X = small ? x << 1 : x, Y = small ? y << 1 : y;
        const a = (seeds[0] * X + seeds[1] * Y + (r >>> 14)) & 0x3f;
        const b = (seeds[2] * X + seeds[3] * Y + (r >>> 10)) & 0x3f;
        const c = pn < 3 ? 0 : (seeds[4] * X + seeds[5] * Y + (r >>> 6)) & 0x3f;
        const d = pn < 4 ? 0 : (seeds[6] * X + seeds[7] * Y + (r >>> 2)) & 0x3f;
        ctx.partition[i] = a >= b && a >= c && a >= d ? 0 : b >= c && b >= d ? 1 : c >= d ? 2 : 3;
      }
    }
  }

  /* A half-float's value. */
  function zbAstcHalf(h) {
    const e = h >> 10 & 0x1f, m = h & 0x3ff, s = h & 0x8000 ? -1 : 1;
    if (e === 0) return s * m * 2 ** -24;
    if (e === 31) return m ? NaN : s * Infinity;
    return s * (1 + m / 1024) * 2 ** (e - 15);
  }

  /* C's roundf, which rounds halves away from zero. */
  const zbAstcRound = f => f < 0 ? -M_floor(-f + 0.5) : M_floor(f + 0.5);

  function zbAstcSelect(v0, v1, w) {
    return ((((v0 << 8 | v0) * (64 - w) + (v1 << 8 | v1) * w + 32) >> 6) >> 8) & 255;
  }

  function zbAstcSelectHdr(v0, v1, w) {
    const c = (((v0 << 4) * (64 - w) + (v1 << 4) * w + 32) >> 6) & 0xffff;
    let m = c & 0x7ff;
    if (m < 512) m *= 3; else if (m < 1536) m = 4 * m - 512; else m = 5 * m - 2048;
    m &= 0xffff;
    const f = zbAstcHalf((c >> 1 & 0x7c00) | m >> 3);
    return isFin(f) ? zbAstcClamp(zbAstcRound(M_fround(f * 255))) : 255;
  }

  function zbAstcF16ToU8(h) {
    const c = zbAstcRound(M_fround(zbAstcHalf(h) * 255));
    return c !== c ? 0 : c < 0 ? 0 : c > 255 ? 255 : c;
  }

  /* The color modes whose channels are HDR, for color and for alpha. */
  const ZB_ASTC_HDR_C = [0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1];
  const ZB_ASTC_HDR_A = [0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

  /* One block into buf as 0xAARRGGBB words, row by row. */
  function zbAstcBlock(data, o, words, bw, bh, buf, ctx) {
    const n = bw * bh, b0 = data[o], b1 = data[o + 1];
    const pack = (r, g, b, a) => ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    if (b0 === 0xfc && (b1 & 1) === 1) {
      const h = i => zbAstcF16ToU8(data[o + i] | data[o + i + 1] << 8);
      buf.fill(b1 & 2 ? pack(h(8), h(10), h(12), h(14)) : pack(data[o + 9], data[o + 11], data[o + 13], data[o + 15]), 0, n);
      return;
    }
    if (((b0 & 0xc3) === 0xc0 && (b1 & 1) === 1) || (b0 & 0xf) === 0) { buf.fill(pack(255, 0, 255, 255), 0, n); return; }
    const k = { cem: ctx.cem };
    zbAstcParams(data, o, words, k);
    zbAstcEndpoints(words, k, ctx);
    zbAstcWeights(words, k, ctx, bw, bh);
    if (k.partNum > 1) zbAstcPartition(words, k, ctx, bw, bh);
    const ps = [0, 0, 0, 0];
    if (k.dualPlane) ps[k.planeSelector] = 1;
    for (let i = 0; i < n; i++) {
      const p = k.partNum > 1 ? ctx.partition[i] : 0, cem = k.cem[p], e = ctx.endpoints[p];
      const fc = ZB_ASTC_HDR_C[cem] ? zbAstcSelectHdr : zbAstcSelect, fa = ZB_ASTC_HDR_A[cem] ? zbAstcSelectHdr : zbAstcSelect;
      buf[i] = pack(fc(e[0], e[4], ctx.weights[ps[0]][i]), fc(e[1], e[5], ctx.weights[ps[1]][i]), fc(e[2], e[6], ctx.weights[ps[2]][i]), fa(e[3], e[7], ctx.weights[ps[3]][i]));
    }
  }

  return zbAstcDecode;
})();

if (typeof module !== 'undefined') module.exports = { zbAstcDecode };
