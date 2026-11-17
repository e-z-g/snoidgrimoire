/* zb-pvrtc.js -- PVRTC1, a texture format of the 2015 remake's iPhone
   build, at 4 or 2 bits a pixel.
   Read:
   blocks of 4x4 pixels (8x4 at 2 bits), 8 bytes each, stored in Morton
   order (the bits of x and y interleaved, y lowest), so each side must be
   a power of 2 in blocks. Bytes 0-3 are the weights, bytes 4-5 color A and
   6-7 color B (16-bit words: the top bit set for RGB 555, or 554 for A,
   and clear for ARGB 3444, or 3443 for A). Bit 0 of byte 4 is the mode,
   which makes weight 2 clear (punch-through) at 4 bits, and at 2 bits
   fills every other pixel from its neighbors. Each pixel's A and B are
   mixed from the colors of the 3x3 blocks around it, wrapping at the
   edges, and then mixed by its weight in eighths.
   Out: RGBA bytes, rows in the order of the blocks.
   WHERE IT CAME FROM
   texture2ddecoder's pvrtc.cpp, by K0lb3, under the MIT license (see
   NOTICE), ported line for line and checked against UnityPy over every
   PVRTC texture of the iPhone build (utilities/remake_check.mjs).
   =========================================================================
   Pure: bytes in, pixels out. Used by zb-unity.js. */

/* The decoder's parts stay inside one function, where lookups are fast. */
const zbPvrtcDecode = (() => {
  const M_ceil = Math.ceil, M_min = Math.min, M_trunc = Math.trunc, U8C = Uint8ClampedArray, U32 = Uint32Array, I32 = Int32Array;

  const ZB_PVRTC_STANDARD = [0, 3, 5, 8];
  const ZB_PVRTC_PUNCH = [0, 4, 4, 8];

  function zbPvrtcMorton(x, y, minDim) {
    let offset = 0, shift = 0;
    for (let mask = 1; mask < minDim; mask <<= 1, shift++) offset |= ((y & mask) | ((x & mask) << 1)) << shift;
    return offset | ((x | y) >> shift) << (shift * 2);
  }

  function zbPvrtcInfo(data, d, is2bpp) {
    const ca = data[d + 4] | data[d + 5] << 8, cb = data[d + 6] | data[d + 7] << 8;
    const a = ca & 0x8000
      ? [ca >> 10 & 0x1f, ca >> 5 & 0x1f, (ca & 0x1e) | (ca >> 4 & 1), 0xf]
      : [(ca >> 7 & 0x1e) | (ca >> 11 & 1), (ca >> 3 & 0x1e) | (ca >> 7 & 1), (ca << 1 & 0x1c) | (ca >> 2 & 3), ca >> 11 & 0xe];
    const b = cb & 0x8000
      ? [cb >> 10 & 0x1f, cb >> 5 & 0x1f, cb & 0x1f, 0xf]
      : [(cb >> 7 & 0x1e) | (cb >> 11 & 1), (cb >> 3 & 0x1e) | (cb >> 7 & 1), (cb << 1 & 0x1e) | (cb >> 3 & 1), cb >> 11 & 0xe];
    const weight = new I32(32);
    const toInts = c => I32.from(c);
    let punch = 0, bits = (data[d] | data[d + 1] << 8 | data[d + 2] << 16 | data[d + 3] << 24) >>> 0;
    const mode = data[d + 4] & 1;
    if (!is2bpp) {
      for (let i = 0; i < 16; i++, bits >>>= 2) {
        if (mode) { weight[i] = ZB_PVRTC_PUNCH[bits & 3]; if ((bits & 3) === 2) punch |= 1 << i; }
        else weight[i] = ZB_PVRTC_STANDARD[bits & 3];
      }
    } else if (mode) {
      const fill = data[d] & 1 ? (data[d + 2] & 0x10 ? -1 : -2) : -3;
      for (let y = 0, i = 1; y < 4; ++y & 1 ? --i : ++i) for (let x = 0; x < 4; x++, i += 2) weight[i] = fill;
      for (let y = 0, i = 0; y < 4; ++y & 1 ? ++i : --i) for (let x = 0; x < 4; x++, i += 2, bits >>>= 2) weight[i] = ZB_PVRTC_STANDARD[bits & 3];
      weight[0] = (weight[0] + 3) & 8;
      if (data[d] & 1) weight[20] = (weight[20] + 3) & 8;
    } else {
      for (let i = 0; i < 32; i++, bits >>>= 1) weight[i] = bits & 1 ? 8 : 0;
    }
    return { a: toInts(a), b: toInts(b), weight, punch };
  }

  const ZB_PVRTC_W4 = [[2, 2, 0], [1, 3, 0], [0, 4, 0], [0, 3, 1]];
  const ZB_PVRTC_W8 = [[4, 4, 0], [3, 5, 0], [2, 6, 0], [1, 7, 0], [0, 8, 0], [0, 7, 1], [0, 6, 2], [0, 5, 3]];
  const ZB_PVRTC_POSYA = [[1, 24], [4, -8], [4, -8], [4, -8]];
  const ZB_PVRTC_POSYB = [[4, 8], [4, 8], [4, 8], [7, -24]];
  const ZB_PVRTC_POSXL = [[3, 7], [4, -1], [4, -1], [4, -1], [4, -1], [4, -1], [4, -1], [4, -1]];
  const ZB_PVRTC_POSXR = [[4, 1], [4, 1], [4, 1], [4, 1], [4, 1], [4, 1], [4, 1], [5, -7]];

  /* One block's pixels into buf as [r, g, b, a] quads. */
  function zbPvrtcBlock(info, is2bpp, buf) {
    const bw = is2bpp ? 8 : 4, WX = is2bpp ? ZB_PVRTC_W8 : ZB_PVRTC_W4;
    const self = info[4];
    let punch = self.punch;
    const ca = new I32(4), cb = new I32(4);
    for (let y = 0, i = 0; y < 4; y++) {
      for (let x = 0; x < bw; x++, i++, punch >>>= 1) {
        ca.fill(0); cb.fill(0);
        for (let acy = 0, ac = 0; acy < 3; acy++) {
          for (let acx = 0; acx < 3; acx++, ac++) {
            const w = WX[x][acx] * ZB_PVRTC_W4[y][acy];
            for (let c = 0; c < 4; c++) { ca[c] += info[ac].a[c] * w; cb[c] += info[ac].b[c] * w; }
          }
        }
        for (let c = 0; c < 3; c++) {
          ca[c] = is2bpp ? (ca[c] >> 2) + (ca[c] >> 7) : (ca[c] >> 1) + (ca[c] >> 6);
          cb[c] = is2bpp ? (cb[c] >> 2) + (cb[c] >> 7) : (cb[c] >> 1) + (cb[c] >> 6);
        }
        ca[3] = is2bpp ? (ca[3] >> 1) + (ca[3] >> 5) : ca[3] + (ca[3] >> 4);
        cb[3] = is2bpp ? (cb[3] >> 1) + (cb[3] >> 5) : cb[3] + (cb[3] >> 4);
        if (is2bpp) {
          const W = k => info[k[0]].weight[i + k[1]];
          switch (self.weight[i]) {
            case -1: self.weight[i] = (W(ZB_PVRTC_POSYA[y]) + W(ZB_PVRTC_POSYB[y]) + 1) / 2 | 0; break;
            case -2: self.weight[i] = (W(ZB_PVRTC_POSXL[x]) + W(ZB_PVRTC_POSXR[x]) + 1) / 2 | 0; break;
            case -3: self.weight[i] = (W(ZB_PVRTC_POSYA[y]) + W(ZB_PVRTC_POSYB[y]) + W(ZB_PVRTC_POSXL[x]) + W(ZB_PVRTC_POSXR[x]) + 2) / 4 | 0; break;
          }
        }
        const w = self.weight[i], o = i * 4;
        for (let c = 0; c < 3; c++) buf[o + c] = M_trunc((ca[c] * (8 - w) + cb[c] * w) / 8) & 255;
        buf[o + 3] = punch & 1 ? 0 : M_trunc((ca[3] * (8 - w) + cb[3] * w) / 8) & 255;
      }
    }
  }

  function zbPvrtcDecode(data, width, height, is2bpp) {
    const out = new U8C(width * height * 4);
    const bw = is2bpp ? 8 : 4, nx = M_ceil(width / bw), ny = M_ceil(height / 4);
    if ((nx & (nx - 1)) || (ny & (ny - 1))) return out;
    const minDim = M_min(nx, ny), n = nx * ny, infos = new Array(n);
    for (let i = 0; i < n; i++) infos[i] = zbPvrtcInfo(data, i * 8, is2bpp);
    const buf = new I32(128), local = new Array(9);
    for (let by = 0; by < ny; by++) {
      const py = [by === 0 ? ny - 1 : by - 1, by, by === ny - 1 ? 0 : by + 1];
      for (let bx = 0; bx < nx; bx++) {
        const px = [bx === 0 ? nx - 1 : bx - 1, bx, bx === nx - 1 ? 0 : bx + 1];
        for (let cy = 0, c = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++, c++) local[c] = infos[zbPvrtcMorton(px[cx], py[cy], minDim)];
        zbPvrtcBlock(local, is2bpp, buf);
        const x0 = bx * bw, xl = M_min(bw, width - x0);
        for (let j = 0; j < 4 && by * 4 + j < height; j++) {
          for (let i = 0; i < xl; i++) {
            const s = (j * bw + i) * 4, d = ((by * 4 + j) * width + x0 + i) * 4;
            out[d] = buf[s]; out[d + 1] = buf[s + 1]; out[d + 2] = buf[s + 2]; out[d + 3] = buf[s + 3];
          }
        }
      }
    }
    return out;
  }

  return zbPvrtcDecode;
})();

if (typeof module !== 'undefined') module.exports = { zbPvrtcDecode };
