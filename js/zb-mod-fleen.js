/* zb-mod-fleen.js -- the Fleen-parts mod: the game's Zoombinis given the
   Fleens' hairstyles, eyes, noses and feet (Zoombini part v becomes Fleen
   part v) in every frame the game draws them, and, made green, the Fleens'
   lemon-lime skin. Its output is the resources to write into a copy of the
   game: ZOOMBINI.MHK's three Zoombini sheets and their registration points,
   PICKER.MHK's builder tiles and big figure, and ZOOMBINI.EXE's anchors for
   that figure.
   =========================================================================
   Needs mac-bytes.js, zb-mohawk.js, zb-bitmap.js, zb-script.js and
   zb-write.js.

   zbFleenMod(archives, exeBytes, green) takes every archive on the disc,
   opened (a Map of name, without .MHK, to openMohawk's), since the pairing
   of hair poses to body poses is counted over every snoid script in them,
   and returns { ZOOMBINI: [{ tag, id, bytes }], PICKER: [...], exe }:
   ZOOMBINI tBMP 3000, 3100 and 3200 with REGS 100-103, 3200 and 3201;
   PICKER tBMP 4400 (the builder's tiles), and tBMP 4300 (its big figure)
   only when the EXE is given, since that figure is placed by two tables in
   the EXE (and, green, its body is dithered from the anchor the EXE gives
   it); exe is the EXE with those tables rewritten, or null.

   How each part is fitted -- the eyes and noses where the Zoombini's own
   sit, the hair on its partner bodies' head tops and lifted off the eyes,
   the feet tucked under the egg and stepping, the small Zoombinis shrunk
   from the matching full-size pose, the tumbling ones turned, the builder's
   tiles redrawn on blank stone and its big figure enlarged -- is the long
   docstring of the Python this ports, which is kept beside it.

   Every step is the Python's, down to its arithmetic: Python's round
   (half to even), floor division and modulo, int()'s truncation, the
   first-of-ties of max, min and Counter.most_common, insertion-ordered
   counters, math.hypot as CPython computes it, and the Mersenne Twister and
   random.choices that speckle the blank stone tile.

   WHERE IT CAME FROM
   A port of the extraction project's tools/mod_fleen_parts.py (build,
   tiles, big_parts and all they call), with what it uses of
   tools/export_web.py (the web maker's fitting: borrowed_part,
   borrowed_feet, landmark, near_foot, leg_pixels, fleen_ride,
   fleen_device_on_zoombini, blank_tiles and their tables) and of
   tools/animate.py (the atlas blocks, load_regs, zoombini_records).
   utilities/fleenmod_check.mjs holds it to the Python byte for byte, plain
   and green, every resource and every changed byte of the EXE
   (utilities/oracle.py fleenmod).
*/

/* ---- the tables ------------------------------------------------------- */

/* animate.py's blocks: a part's variants each a run of poses, a pair of
   frames (facing right, its mirror) a pose. */
const ZB_FLEEN_MOD_ATLAS = {
  zoombini: [
    { name: 'feet', bases: [382, 492, 670, 720, 822], poses: [55, 89, 25, 51, 14] },
    { name: 'body', bases: [0], poses: 11 },
    { name: 'nose', bases: [342, 350, 358, 366, 374], poses: 4 },
    { name: 'eyes', bases: [182, 214, 246, 278, 310], poses: 16 },
    { name: 'hair', bases: [22, 54, 86, 118, 150], poses: 16 },
  ],
  small: [
    { name: 'feet', bases: [262, 348, 454, 470, 556], poses: [43, 53, 8, 43, 6] },
    { name: 'body', bases: [0], poses: 11 },
    { name: 'nose', bases: [222, 230, 238, 246, 254], poses: 4 },
    { name: 'eyes', bases: [182, 190, 198, 206, 214], poses: 4 },
    { name: 'hair', bases: [22, 54, 86, 118, 150], poses: 16 },
  ],
  tumble: [
    { name: 'feet', bases: [576, 612, 648, 684, 720], poses: 18 },
    { name: 'body', bases: [0], poses: 18 },
    { name: 'nose', bases: [396, 432, 468, 504, 540], poses: 18 },
    { name: 'eyes', bases: [216, 252, 288, 324, 360], poses: 18 },
    { name: 'hair', bases: [36, 144, 72, 108, 180], poses: 18 },
    { name: 'effects', bases: [756], poses: 21 },
  ],
  fleen: [
    { name: 'body', bases: [0], poses: 15 },
    { name: 'hair', bases: [370, 406, 442, 478, 514], poses: 18 },
    { name: 'feet', bases: [550, 580, 610, 656, 694], poses: [15, 15, 23, 19, 23] },
    { name: 'nose', bases: [30, 60, 90, 120, 150], poses: 15 },
    { name: 'eyes', bases: [180, 218, 256, 294, 332], poses: 19 },
  ],
};

/* mod_fleen_parts.py's own. */
const ZB_FLEEN_MOD = {
  PARTS: ['hair', 'eyes', 'nose', 'feet'],
  LIFT_FEET: 5, SHOWN_FEET: 0.75, SHOWN_DEVICE: 0.95,
  DEVICES: [2, 3, 4],                    // Fleen wheels, treads, rockets: they ride, not step
  LIFT_CAP: 3, LIFT_COST: 3,
  SHARED: [10, 45],                      // palette entries every scene shares, inclusive
  SHEETS: { 3000: ['zoombini', 100], 3100: ['tumble', 102], 3200: ['small', 3200] },
  MIN_SHARE: 0.05, SMALL_SCALE: 0.62, MIN_MATCH: 0.5, MIN_MATCH_FEET: 0.25,
  SNAP: 12, HIDDEN: 0.35, BIG_SCALE: 1.63,
  EXE_DX: 0xdabdc, EXE_DY: 0xdabf2,      // ZOOMBINI.EXE: the big frames' anchor tables
  BIG_FRAME: { body: 0, hair: 1, eyes: 6, nose: 11, feet: 16 },
  TILE_ROW: { hair: 0, eyes: 1, nose: 2, feet: 3 },
  TILE_ORIGIN: { eyes: [20, 23], nose: [20, 23], feet: [21, 18] },
  NOSELESS: [1, 2, 5],                   // body poses 1 and 2 drawn as 5
  // green: blue skin shade -> (a, b, n), a in n of every 4 pixels of a 2x2 Bayer
  LIME: { 20: [34, 43, 1], 19: [34, 43, 2], 18: [33, 43, 2], 17: [33, 42, 2], 16: [33, 41, 2], 15: [32, 41, 3] },
  BAYER: [[0, 2], [3, 1]],
};

/* export_web.py's, what the mod reaches of them. */
const ZB_FLEEN_MOD_WEB = {
  REST_POSE: { zoombini: 2, fleen: 1 },
  EYE_FRAMES: {
    zoombini: [[2, { rest: 2, blink: 5, glance: [6, 7, 8, 9, 10] }],
               [3, { rest: 3, blink: 11, glance: [12, 13, 14, 15, 16] }],
               [1, { rest: 1 }]],
    fleen: { rest: 1, blink: 17, glance: [16, 18, 19] },
  },
  OUTLINE: 45,
  SKIN_FZ: { 89: 20, 88: 20, 87: 19, 86: 17, 85: 16 },       // SKIN_MAP fleen -> zoombini
  SKIN_ZF: { 20: 88, 19: 87, 18: 87, 17: 86, 16: 85, 15: 45 }, // SKIN_MAP zoombini -> fleen
  NUDGE: { hair: { 4: [0, -3], 3: [0, 3] } },                // Fleen part, variant
  FLEEN_BEHIND_HEAD: { 4: [0, 25, 12, 99] },
  FLEEN_NEAR_FOOT: {
    0: [[16, 0], [31, 0], [31, 16], [16, 16]],
    1: [[14, 0], [23, 0], [23, 17], [10, 17], [10, 15], [9, 15], [9, 13], [12, 12], [13, 9], [13, 6], [14, 6]],
    2: [[10, 24], [26, 24], [26, 6], [13, 6], [12, 8], [11, 11], [10, 16]],
    3: [[26, 0], [34, 0], [34, 20], [15, 20], [13, 17], [13, 10], [14, 7], [26, 6]],
    4: [[7, 0], [24, 0], [24, 15], [6, 15], [6, 5], [7, 5]],
  },
  FLEEN_WHEEL_FORK: [[13, 0], [26, 0], [26, 6], [13, 6]],
  FLEEN_RIDES: [[2, 'pull', [8, 9, 10]], [3, 'pull', []], [4, 'dash', []]],
  WALK_SCRIPTS: { zoombini: 105, fleen: 4026 },
  DIRECTIONS: 5, SPECIAL_SCRIPT: 146,
  STONE_DARK: 13, SHADOW: 11, TAN: 214, FRAME: 3,
  SELECTED_SHIFT: [-2, 1], SHADOW_OFFSET: [-3, 3],
};

/* ---- Python's arithmetic ---------------------------------------------- */

/* round(): half to even. */
function zbFleenModRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
/* x % 360 for a float, as Python: the divisor's sign. */
function zbFleenModMod360(x) {
  let m = x % 360;
  if (m < 0) m += 360;
  return m === 0 ? 0 : m;
}
/* a % n for ints, as Python. */
function zbFleenModMod(a, n) { return ((a % n) + n) % n; }

/* An exact product, as fma gives it: [hi, lo] with hi + lo = x * y. */
function zbFleenModTwoProd(x, y) {
  const hi = x * y, s = 134217729;
  const xh = x * s - (x * s - x), xl = x - xh, yh = y * s - (y * s - y), yl = y - yh;
  return [hi, ((xh * yh - hi) + xh * yl + xl * yh) + xl * yl];
}
/* math.hypot(a, b) as CPython 3.10+ computes it (mathmodule.c vector_norm). */
function zbFleenModHypot(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  const max = Math.max(a, b);
  if (max === 0) return 0;
  let e = 0, m = max;                    // frexp: max = m * 2^e, 0.5 <= m < 1
  while (m >= 1) { m /= 2; e++; }
  while (m < 0.5) { m *= 2; e--; }
  let scale = 1;
  for (let k = 0; k < Math.abs(e); k++) scale = e > 0 ? scale / 2 : scale * 2;
  let csum = 1, frac1 = 0, frac2 = 0;
  for (const v of [a, b]) {
    const x = v * scale, [hi, lo] = zbFleenModTwoProd(x, x);
    const s = csum + hi;
    frac2 += (csum - s) + hi; csum = s; frac1 += lo;
  }
  let h = Math.sqrt(csum - 1 + (frac1 + frac2));
  const [hi, lo] = zbFleenModTwoProd(-h, h);
  const s = csum + hi;
  frac2 += (csum - s) + hi; csum = s; frac1 += lo;
  h += (csum - 1 + (frac1 + frac2)) / (2 * h);
  return h / scale;
}
const zbFleenModDegrees = x => x * (180 / Math.PI);
const zbFleenModRadians = x => x * (Math.PI / 180);

/* A Counter: a Map of key to count, in first-counted order. */
function zbFleenModCount(map, key) { map.set(key, (map.get(key) || 0) + 1); }
/* Counter.most_common(1)[0][0]: the first of the commonest. */
function zbFleenModCommonest(map) {
  let best = null, n = -1;
  for (const [k, c] of map) if (c > n) { best = k; n = c; }
  return best;
}

/* random.Random(seed) for a small non-negative int: MT19937 seeded by
   init_by_array([seed]), and random() from two draws. */
function zbFleenModRandom(seed) {
  const N = 624, mt = new Uint32Array(N);
  let mti;
  mt[0] = 19650218;
  for (mti = 1; mti < N; mti++) mt[mti] = (Math.imul(1812433253, mt[mti - 1] ^ (mt[mti - 1] >>> 30)) + mti) >>> 0;
  const key = [seed >>> 0];
  let i = 1, j = 0;
  for (let k = Math.max(N, key.length); k; k--) {
    mt[i] = (((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) >>> 0) + key[j] + j) >>> 0;
    i++; j++;
    if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    if (j >= key.length) j = 0;
  }
  for (let k = N - 1; k; k--) {
    mt[i] = (((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) >>> 0) - i) >>> 0;
    i++;
    if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
  }
  mt[0] = 0x80000000;
  mti = N;
  const next = () => {
    if (mti >= N) {
      let kk = 0, y;
      for (; kk < N - 397; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + 397] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      for (; kk < N - 1; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + 397 - N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[N - 1] = mt[396] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      mti = 0;
    }
    let y = mt[mti++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  };
  return {
    random() { const a = next() >>> 5, b = next() >>> 6; return (a * 67108864 + b) * (1 / 9007199254740992); },
    /* choices(population, weights)[0] */
    choice(population, weights) {
      const cum = [];
      let t = 0;
      for (const w of weights) cum.push(t += w);
      const x = this.random() * cum[cum.length - 1];
      let lo = 0, hi = population.length - 1;            // bisect_right
      while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
      return population[lo];
    },
  };
}

/* ---- pixels ------------------------------------------------------------ */
// A raw is [w, h, px] (px a palette index a pixel, 0 clear), a reg [rx, ry]:
// where the origin is in the raw. A point set holds zbFleenModKey(x, y).

const zbFleenModKey = (x, y) => (x + 4096) * 8192 + (y + 4096);
const ZB_FLEEN_MOD_EMPTY = () => [[1, 1, [0]], [0, 0]];

function zbFleenModMirror(w, h, cells) {
  const out = new Array(w * h);
  for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) out[row * w + col] = cells[row * w + (w - 1 - col)];
  return out;
}
function zbFleenModCountSet(px) { let n = 0; for (const c of px) if (c) n++; return n; }
function zbFleenModAny(px) { for (const c of px) if (c) return true; return false; }

/* The opaque box, relative to the origin: [l, t, r, b]. */
function zbFleenModOpaqueBox([w, , px], [rx, ry]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  px.forEach((c, i) => {
    if (!c) return;
    const x = i % w, y = Math.floor(i / w);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  });
  return [x0 - rx, y0 - ry, x1 + 1 - rx, y1 + 1 - ry];
}

/* Every drawn pixel of a frame, from its origin, as a point set. */
function zbFleenModPoints([w, , px], [rx, ry], set = new Set()) {
  for (let i = 0; i < px.length; i++) if (px[i]) set.add(zbFleenModKey(i % w - rx, Math.floor(i / w) - ry));
  return set;
}

/* Point in polygon, even-odd. */
function zbFleenModInside(poly, x, y) {
  let hit = false;
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % poly.length];
    if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) hit = !hit;
  }
  return hit;
}

/* 8-connected groups of set cells, as lists of indices. */
function zbFleenModComponents(mask, w, h) {
  const seen = new Uint8Array(w * h), groups = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i], group = [];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      group.push(j);
      const x = j % w, y = Math.floor(j / w);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (0 <= x + dx && x + dx < w && 0 <= y + dy && y + dy < h) {
          const k = j + dx + dy * w;
          if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/* Does any of the 8 cells around i have mask set? */
function zbFleenModTouches(mask, w, h, i) {
  const x = i % w, y = Math.floor(i / w);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if ((dx || dy) && 0 <= x + dx && x + dx < w && 0 <= y + dy && y + dy < h && mask[(y + dy) * w + x + dx]) return true;
  }
  return false;
}

/* [[raw, reg]] stacked in paint order: [raw, reg]. */
function zbFleenModPaste(layers) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [raw, [rx, ry]] of layers) {
    left = Math.min(left, -rx); top = Math.min(top, -ry);
    right = Math.max(right, -rx + raw[0]); bottom = Math.max(bottom, -ry + raw[1]);
  }
  const w = right - left, h = bottom - top, out = new Array(w * h).fill(0);
  for (const [[lw, , px], [rx, ry]] of layers) {
    const ox = -rx - left, oy = -ry - top;
    for (let i = 0; i < px.length; i++) if (px[i]) out[(oy + Math.floor(i / lw)) * w + ox + i % lw] = px[i];
  }
  return [[w, h, out], [-left, -top]];
}

/* A raw at double size by EPX (Scale2x). */
function zbFleenModEpx([w, h, px]) {
  const out = new Array(4 * w * h).fill(0);
  const at = (x, y) => (0 <= x && x < w && 0 <= y && y < h ? px[y * w + x] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
    const q = [p, p, p, p];
    if (c === a && c !== d && a !== b) q[0] = a;
    if (a === b && a !== c && b !== d) q[1] = b;
    if (d === c && d !== b && c !== a) q[2] = c;
    if (b === d && b !== a && d !== c) q[3] = d;
    const o = 2 * y * 2 * w + 2 * x;
    out[o] = q[0]; out[o + 1] = q[1]; out[o + 2 * w] = q[2]; out[o + 2 * w + 1] = q[3];
  }
  return [2 * w, 2 * h, out];
}

/* Each new pixel the commonest colour of what it covers, if `share` of it
   is drawn: the vote shrink and enlarged both take. */
function zbFleenModVote(px, w, h, ys, ye, xs, xe, share) {
  const votes = new Map();
  let cells = 0, drawn = 0;
  for (let sy = ys; sy < ye; sy++) for (let sx = xs; sx < xe; sx++) {
    cells++;
    if (0 <= sx && sx < w && 0 <= sy && sy < h && px[sy * w + sx]) { zbFleenModCount(votes, px[sy * w + sx]); drawn++; }
  }
  return cells && drawn >= share * cells ? zbFleenModCommonest(votes) : 0;
}

/* [raw, reg] scaled about the origin. */
function zbFleenModShrink([[w, h, px], [rx, ry]], scale) {
  const x0 = Math.floor((-rx) * scale), y0 = Math.floor((-ry) * scale);
  const x1 = -Math.floor(-(w - rx) * scale), y1 = -Math.floor(-(h - ry) * scale);
  const nw = x1 - x0, nh = y1 - y0, out = new Array(nw * nh).fill(0);
  for (let ny = 0; ny < nh; ny++) for (let nx = 0; nx < nw; nx++) {
    out[ny * nw + nx] = zbFleenModVote(px, w, h,
      Math.trunc((y0 + ny) / scale) + ry, Math.trunc((y0 + ny + 1) / scale) + ry,
      Math.trunc((x0 + nx) / scale) + rx, Math.trunc((x0 + nx + 1) / scale) + rx, 0.4);
  }
  return [[nw, nh, out], [-x0, -y0]];
}

/* [raw, reg] enlarged by `scale` about `centre`: EPX, then the vote.
   Returns the image and its top-left relative to `centre`. */
function zbFleenModEnlarged(raw, reg, centre, scale) {
  const [w, h, px] = zbFleenModEpx(raw);
  const rx = 2 * reg[0] + 2 * centre[0], ry = 2 * reg[1] + 2 * centre[1];
  const k = scale / 2;
  const x0 = Math.floor(-rx * k), y0 = Math.floor(-ry * k);
  const x1 = -Math.floor(-(w - rx) * k), y1 = -Math.floor(-(h - ry) * k);
  const nw = x1 - x0, nh = y1 - y0, out = new Array(nw * nh).fill(0);
  for (let j = 0; j < nw * nh; j++) {
    const jy = Math.floor(j / nw), jx = j % nw;
    out[j] = zbFleenModVote(px, w, h,
      Math.trunc((y0 + jy) / k + ry), Math.trunc((y0 + jy + 1) / k + ry),
      Math.trunc((x0 + jx) / k + rx), Math.trunc((x0 + jx + 1) / k + rx), 0.5);
  }
  return [[nw, nh, out], [x0, y0]];
}

/* [raw, reg] turned about the rest body centre b0 onto a tumble pose's b. */
function zbFleenModTurned([[w, h, px], [rx, ry]], turn, b0, b, fling) {
  const c = Math.cos(zbFleenModRadians(turn)), s = Math.sin(zbFleenModRadians(turn));
  const ox = b[0] + fling[0], oy = b[1] + fling[1];
  const tx = [], ty = [];
  for (let i = 0; i < px.length; i++) {
    if (!px[i]) continue;
    const x = i % w - rx - b0[0], y = Math.floor(i / w) - ry - b0[1];
    tx.push(c * x - s * y + ox); ty.push(s * x + c * y + oy);
  }
  if (!tx.length) return ZB_FLEEN_MOD_EMPTY();
  const x0 = Math.floor(Math.min(...tx)) - 1, y0 = Math.floor(Math.min(...ty)) - 1;
  const nw = Math.ceil(Math.max(...tx)) - x0 + 2, nh = Math.ceil(Math.max(...ty)) - y0 + 2;
  const out = new Array(nw * nh).fill(0);
  for (let j = 0; j < nw * nh; j++) {
    const X = x0 + j % nw + 0.5 - ox, Y = y0 + Math.floor(j / nw) + 0.5 - oy;
    const sx = c * X + s * Y + b0[0] + rx, sy = -s * X + c * Y + b0[1] + ry;
    const ix = Math.floor(sx), iy = Math.floor(sy);
    if (0 <= ix && ix < w && 0 <= iy && iy < h) out[j] = px[iy * w + ix];
  }
  return [[nw, nh, out], [-x0, -y0]];
}

/* ---- colour ------------------------------------------------------------ */

function zbFleenModLab(rgb) {
  const lin = rgb.map(c => (c / 255 > 0.04045 ? ((c / 255 + 0.055) / 1.055) ** 2.4 : c / 255 / 12.92));
  const x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = [x, y, z].map(t => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

/* CIEDE2000. */
function zbFleenModDe2000([L1, a1, b1], [L2, a2, b2]) {
  const cos = d => Math.cos(zbFleenModRadians(d)), sq = v => v * v;
  const cb = (zbFleenModHypot(a1, b1) + zbFleenModHypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  a1 = (1 + g) * a1; a2 = (1 + g) * a2;
  const c1 = zbFleenModHypot(a1, b1), c2 = zbFleenModHypot(a2, b2);
  const h1 = zbFleenModMod360(zbFleenModDegrees(Math.atan2(b1, a1)));
  const h2 = zbFleenModMod360(zbFleenModDegrees(Math.atan2(b2, a2)));
  const dh = c1 * c2 === 0 ? 0 : (Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 > h1 ? h2 - h1 - 360 : h2 - h1 + 360);
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(zbFleenModRadians(dh / 2));
  const lb = (L1 + L2) / 2, cbp = (c1 + c2) / 2;
  const hb = c1 * c2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2
    : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const t = 1 - 0.17 * cos(hb - 30) + 0.24 * cos(2 * hb) + 0.32 * cos(3 * hb + 6) - 0.20 * cos(4 * hb - 63);
  const rt = -Math.sin(zbFleenModRadians(60 * Math.exp(-sq((hb - 275) / 25)))) * 2 * Math.sqrt(cbp ** 7 / (cbp ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * sq(lb - 50) / Math.sqrt(20 + sq(lb - 50));
  const sc = 1 + 0.045 * cbp, sh = 1 + 0.015 * cbp * t;
  const dl = (L2 - L1) / sl, dc = (c2 - c1) / sc;
  return Math.sqrt(sq(dl) + sq(dc) + sq(dH / sh) + rt * dc * (dH / sh));
}

/* ---- reading the disc --------------------------------------------------- */

function zbFleenModRaws(arc, bmp) {
  return decodeBitmapResource(arc.get('tBMP', bmp)).frames.map(f => [f.width, f.height, f.pixels]);
}
/* REGS words after the first. */
function zbFleenModRegsWords(d) {
  const n = (d.length - 2) >> 1, out = [];
  for (let k = 0; k < n; k++) out.push(i16be(d, 2 + 2 * k));
  return out;
}
/* animate.load_regs: the first REGS pair, by id, with `count` points. */
function zbFleenModLoadRegs(arc, count) {
  const regs = new Map();
  for (const r of arc.list('REGS')) regs.set(r.id, zbFleenModRegsWords(arc.get('REGS', r.id)));
  for (const rid of [...regs.keys()].sort((a, b) => a - b)) {
    const xs = regs.get(rid), ys = regs.get(rid + 1);
    if (ys !== undefined && xs.length === count && ys.length === count) return xs.map((x, k) => [x, ys[k]]);
  }
  return new Array(count).fill(null).map(() => [0, 0]);
}
/* A snoid script's ticks, each its records' shapes, and its layout word;
   null where mohawk_script.parse gives None. */
function zbFleenModScript(bytes) {
  try {
    const s = parseScript(bytes, 'SCRS');
    return { layout: s.layout, ticks: s.frames.map(f => f.records.map(r => r.shape)) };
  } catch (e) { return null; }
}
/* animate.zoombini_records: body and nose swapped in profile. */
function zbFleenModZoombiniRecords(recs) {
  return recs[2] > 4 ? [recs[0], recs[2], recs[1], recs[3], recs[4]] : recs;
}
function zbFleenModPoseCount(part, v) { return Array.isArray(part.poses) ? part.poses[v % part.poses.length] : part.poses; }
function zbFleenModAtlasFrame(part, v, rel) {
  if (rel < 1) return null;
  v %= part.bases.length;
  if (rel > zbFleenModPoseCount(part, v)) return null;
  return part.bases[v] + 2 * (rel - 1);
}

/* One of ZOOMBINI.MHK's Zoombini sheets, decoded (mod_fleen_parts.Atlas). */
function zbFleenModSheet(z, bmp) {
  const [kind, regsId] = ZB_FLEEN_MOD.SHEETS[bmp];
  const layout = ZB_FLEEN_MOD_ATLAS[kind], frames = zbFleenModRaws(z, bmp);
  const regs = zbFleenModLoadRegs(z, frames.length), parts = {};
  for (const p of layout) parts[p.name] = p;
  const areas = new Map();
  const a = {
    bmp, layout, regsId, frames, regs, parts,
    index: (part, v, pose) => zbFleenModAtlasFrame(parts[part], v, pose),
    area(part, v, pose) {
      const i = a.index(part, v, pose);
      if (!areas.has(i)) areas.set(i, zbFleenModCountSet(frames[i][2]));
      return areas.get(i);
    },
    hidden(part, pose) {
      if (part === 'body') return false;
      const rest = ZB_FLEEN_MOD_WEB.REST_POSE.zoombini;
      let share = 0;
      for (let v = 0; v < 5; v++) share += a.area(part, v, pose) / Math.max(1, a.area(part, v, rest));
      return share / 5 < ZB_FLEEN_MOD.HIDDEN;
    },
    centre(i) {
      const [w, , px] = frames[i], [rx, ry] = regs[i];
      let sx = 0, sy = 0, n = 0;
      for (let k = 0; k < px.length; k++) if (px[k]) { sx += k % w - rx; sy += Math.floor(k / w) - ry; n++; }
      return [sx / n, sy / n];
    },
    points(i) { return zbFleenModPoints(frames[i], regs[i]); },
  };
  return a;
}

/* Counters, per hair pose, of the body and eye poses the scripts draw with
   it, over every archive but the MIDI ones, by file name; and the same of
   the tumbling Zoombini's (layout 2), whose record 1 the Python counts as
   its "body" (mod_fleen_parts.pairings). */
function zbFleenModPairings(archives) {
  const bodies = new Map(), eyes = new Map(), tumble = new Map();
  const add = (m, h, k) => { if (!m.has(h)) m.set(h, new Map()); zbFleenModCount(m.get(h), k); };
  const names = [...archives.keys()].filter(n => !n.toUpperCase().startsWith('MIDI'))
    .sort((a, b) => (a + '.MHK' < b + '.MHK' ? -1 : a + '.MHK' > b + '.MHK' ? 1 : 0));
  for (const name of names) {
    const m = archives.get(name);
    for (const r of m.list('SCRS')) {
      const s = zbFleenModScript(m.get('SCRS', r.id));
      if (!s || ![0, 1, 2].includes(s.layout)) continue;
      for (const recs of s.ticks) {
        if (recs.length !== 5) continue;
        if (s.layout === 2) { add(tumble, recs[4], recs[1]); continue; }
        const [, b, , e, h] = zbFleenModZoombiniRecords(recs);
        add(bodies, h, b); add(eyes, h, e);
      }
    }
  }
  return { bodies, eyes, tumble };
}

/* Counters, per feet pose, of the body poses feet variant v's own walks and
   special draw it with. */
function zbFleenModFeetPartners(z, v) {
  const W = ZB_FLEEN_MOD_WEB, out = new Map();
  const ids = [];
  for (let d = 0; d < W.DIRECTIONS; d++) ids.push(W.WALK_SCRIPTS.zoombini + 5 * v + d);
  ids.push(W.SPECIAL_SCRIPT + v);
  for (const rid of ids) {
    for (const recs of zbFleenModScript(z.get('SCRS', rid)).ticks) {
      if (recs.length !== 5) continue;
      const [f, b] = zbFleenModZoombiniRecords(recs);
      if (!out.has(f)) out.set(f, new Map());
      zbFleenModCount(out.get(f), b);
    }
  }
  return out;
}

/* export_web.fleen_ride: the (feet pose, body pose) pairs of one loop of a
   Fleen feet variant's `phase` in its run, less the `skip` feet poses. */
function zbFleenModRide(f, v, phase, skip) {
  let pairs = [];
  for (const recs of zbFleenModScript(f.get('SCRS', ZB_FLEEN_MOD_WEB.WALK_SCRIPTS.fleen + v)).ticks) {
    if (recs.length !== 5) continue;
    const body = recs[0], feet = recs[1];
    if (feet === body) continue;
    if ((phase === 'dash') === (body >= 9)) pairs.push([feet, body]);
    else if (pairs.length) break;
  }
  for (let p = 4; p < pairs.length - 1; p++) {
    if (pairs[p][0] === pairs[0][0] && pairs[p][1] === pairs[0][1] && pairs[p + 1][0] === pairs[1][0] && pairs[p + 1][1] === pairs[1][1]) {
      pairs = pairs.slice(0, p);
      break;
    }
  }
  return pairs.filter(pr => !skip.includes(pr[0]));
}

/* ---- the fitter --------------------------------------------------------- */

/* mod_fleen_parts.Fitter, with what it calls of export_web. */
function zbFleenModFitter(archives, green) {
  const C = ZB_FLEEN_MOD, W = ZB_FLEEN_MOD_WEB, R = zbFleenModRound;
  const REST = W.REST_POSE.zoombini;
  const z = archives.get('ZOOMBINI'), fl = archives.get('FLEENS');
  const ident = () => { const t = new Uint8Array(256); for (let c = 0; c < 256; c++) t[c] = c; return t; };
  // the body's skin (marked 1-6 while green), and the fitted parts'
  const mark = c => (green && c >= 15 && c <= 20 ? c - 14 : c);
  const bodyLut = ident();
  for (let c = 15; c <= 20; c++) bodyLut[c] = mark(c);
  const fzLut = ident(), fzKey = new Uint8Array(256), zfKey = new Uint8Array(256), eyeSkin = new Uint8Array(256);
  for (const [k, c] of Object.entries(W.SKIN_FZ)) { fzLut[k] = mark(c); fzKey[k] = 1; eyeSkin[mark(c)] = 1; }
  for (const k of Object.keys(W.SKIN_ZF)) { zfKey[k] = 1; eyeSkin[k] = 1; }
  const pal = zbPalette(parsePaletteResource(fl.get('SHPL', 300), 'SHPL'));

  const load = (arc, bmp, atlas) => { const raws = zbFleenModRaws(arc, bmp); return [atlas, raws, zbFleenModLoadRegs(arc, raws.length)]; };
  const chars = { zoombini: load(z, 3000, ZB_FLEEN_MOD_ATLAS.zoombini), fleen: load(fl, 4000, ZB_FLEEN_MOD_ATLAS.fleen) };
  const full = zbFleenModSheet(z, 3000);
  const pairings = zbFleenModPairings(archives);
  const bodies = pairings.bodies, eyesOf = pairings.eyes;

  // {Zoombini eye pose: [Fleen eye pose, Zoombini eye pose whose spot it takes]}
  const roles = new Map(), fe = W.EYE_FRAMES.fleen;
  for (const [facing, own] of W.EYE_FRAMES.zoombini) {
    roles.set(own.rest, [fe.rest, facing]);
    if (own.blink !== undefined) {
      roles.set(own.blink, [fe.blink, facing]);
      own.glance.forEach((g, k) => roles.set(g, [fe.glance[k % fe.glance.length], facing]));
    }
  }
  const feetBodies = [0, 1, 2, 3, 4].map(v => zbFleenModFeetPartners(z, v));
  const rides = {};
  for (const [v, phase, skip] of W.FLEEN_RIDES) rides[v] = zbFleenModRide(fl, v, phase, skip);

  // the shared palette entry nearest each Fleen colour, by CIEDE2000
  const nearest = new Uint8Array(256), labs = new Map();
  const lab = c => { if (!labs.has(c)) labs.set(c, zbFleenModLab(pal[c])); return labs.get(c); };
  for (let c = 0; c < 256; c++) {
    if ((c >= C.SHARED[0] && c <= C.SHARED[1]) || (c >= 0 && c <= 6)) { nearest[c] = c; continue; }
    let best = -1, bd = Infinity;
    for (let s = C.SHARED[0]; s <= C.SHARED[1]; s++) {
      const d = zbFleenModDe2000(lab(c), lab(s));
      if (d < bd) { bd = d; best = s; }
    }
    nearest[c] = best;
  }
  const near = px => Array.from(px, c => nearest[c]);

  const common = counter => {
    const out = new Map();
    if (!counter) return out;
    let total = 0;
    for (const n of counter.values()) total += n;
    for (const [k, n] of counter) if (n / total >= C.MIN_SHARE) out.set(k, n);
    return out;
  };
  const orRest = (m, pose) => (m.size ? m : new Map([[pose, 1]]));

  const restRaw = (kind, name, v, pose) => {
    const [atlas, raws, regs] = chars[kind];
    const i = zbFleenModAtlasFrame(atlas.find(p => p.name === name), v, pose || W.REST_POSE[kind]);
    return [raws[i], regs[i]];
  };

  const landmarks = new Map();
  const landmark = (kind, feat, facing) => {
    const key = `${kind}/${feat}/${facing || 0}`;
    if (landmarks.has(key)) return landmarks.get(key);
    let out;
    if (feat === 'eyes' || feat === 'nose') {
      let sx = 0, sy = 0;
      for (let v = 0; v < 5; v++) {
        const r = restRaw(kind, feat, v, facing);
        if (!zbFleenModAny(r[0][2])) continue;
        const b = zbFleenModOpaqueBox(...r);
        sx += b[0] + b[2]; sy += b[1] + b[3];
      }
      out = [sx / 10, sy / 10];
    } else {
      const body = restRaw(kind, 'body', 0, facing);
      if (feat === 'hair') {
        const [l, t, r] = zbFleenModOpaqueBox(...body);
        out = [(l + r) / 2, t];
      } else {
        const [[w, , px], [rx, ry]] = body;
        let y = -1;
        for (let i = 0; i < px.length; i++) if (px[i]) y = Math.max(y, Math.floor(i / w));
        let x0 = Infinity, x1 = -Infinity;
        for (let x = 0; x < w; x++) if (px[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        out = [(x0 + x1 + 1) / 2 - rx, y + 1 - ry];
      }
    }
    landmarks.set(key, out);
    return out;
  };

  const spot = (part, pose) => {
    if (part !== 'hair') return landmark('zoombini', part, pose);
    const partners = orRest(common(bodies.get(pose)), pose);
    let total = 0, sx = 0, sy = 0;
    for (const n of partners.values()) total += n;
    for (const [b, n] of partners) { const p = landmark('zoombini', 'hair', b); sx += p[0] * n; sy += p[1] * n; }
    return [sx / total, sy / total];
  };

  const placed = (part, v, pose, fleenPose) => {
    const [[w, h, px0], [rx, ry]] = restRaw('fleen', part, v, fleenPose);
    let px = Array.from(px0, c => fzLut[c]);
    const [hx, hy] = spot(part, pose), [sx, sy] = landmark('fleen', part);
    let x = -rx + R(hx - sx);
    const y = -ry + R(hy - sy);
    px = zbFleenModMirror(w, h, px);
    x = R(2 * hx - (x + w));
    const [dx, dy] = (W.NUDGE[part] && W.NUDGE[part][v]) || [0, 0];
    return [[w, h, px], [x + dx, y + dy]];
  };

  const headOf = pose => {
    const head = new Set();
    for (const b of orRest(common(bodies.get(pose)), pose).keys()) {
      const i = full.index('body', 0, b);
      zbFleenModPoints(full.frames[i], full.regs[i], head);
    }
    return head;
  };

  const hair = (v, pose, lift) => {
    let [[w, h, px], [x, y]] = placed('hair', v, pose);
    y -= lift;
    const box = W.FLEEN_BEHIND_HEAD[v];
    if (box) {
      const [x0, y0, x1, y1] = box, head = headOf(pose);
      px = px.map((c, i) => {
        const own = w - 1 - i % w, row = Math.floor(i / w);
        return c && x0 <= own && own < x1 && y0 <= row && row < y1 && head.has(zbFleenModKey(x + i % w, y + row)) ? 0 : c;
      });
    }
    return [[w, h, px], [x, y]];
  };

  const cache = new Map();
  const frame = (part, v, pose) => {
    const key = `${part}/${v}/${pose}`;
    if (!cache.has(key)) cache.set(key, makeFrame(part, v, pose));
    return cache.get(key);
  };

  const eyeballs = hairPose => {
    const out = [0, 1, 2, 3, 4].map(() => new Set());
    for (const e of orRest(common(eyesOf.get(hairPose)), REST).keys()) {
      for (let v = 0; v < 5; v++) {
        const [[w, , px], [rx, ry]] = frame('eyes', v, e);
        for (let i = 0; i < px.length; i++) if (px[i] && !eyeSkin[px[i]]) out[v].add(zbFleenModKey(i % w - rx, Math.floor(i / w) - ry));
      }
    }
    return out;
  };

  const liftOf = (v, pose) => {
    const eyes = eyeballs(pose);
    let best = 0, bc = Infinity;
    for (let d = 0; d <= C.LIFT_CAP; d++) {
      const [[w, , px], [x, y]] = hair(v, pose, d);
      const drawn = new Set();
      for (let i = 0; i < px.length; i++) if (px[i]) drawn.add(zbFleenModKey(x + i % w, y + Math.floor(i / w)));
      let n = 0;
      for (const e of eyes) for (const p of drawn) if (e.has(p)) n++;
      const cost = n / eyes.length + C.LIFT_COST * d;
      if (cost < bc) { bc = cost; best = d; }
    }
    return best;
  };

  /* export_web.borrowed_part for host 'zoombini' (Fleen feet only, here). */
  const borrowedPart = (feat, v) => {
    const [[w, h, px0], [rx, ry]] = restRaw('fleen', feat, v);
    let px = Array.from(px0, c => fzLut[c]);
    const [hx, hy] = landmark('zoombini', feat), [sx, sy] = landmark('fleen', feat);
    let x = -rx + R(hx - sx);
    const y = -ry + R(hy - sy);
    px = zbFleenModMirror(w, h, px);
    x = R(2 * hx - (x + w));
    const [dx, dy] = (W.NUDGE[feat] && W.NUDGE[feat][v]) || [0, 0];
    return [[w, h, px], [-(x + dx), -(y + dy)]];
  };

  const nearFoot = ([w, , px], v) => {
    const poly = W.FLEEN_NEAR_FOOT[v];
    const nearM = Array.from(px, (c, i) => !!c && zbFleenModInside(poly, i % w + 0.5, Math.floor(i / w) + 0.5));
    const fill = nearM.map((n, i) => n && px[i] !== W.OUTLINE);
    const h = px.length / w;
    return nearM.map((n, i) => n || (px[i] === W.OUTLINE && zbFleenModTouches(fill, w, h, i)));
  };

  const legPixels = (px, w, h) => {
    const solid = Array.from(px, c => !!c && c !== W.OUTLINE && !fzKey[c]);
    let feetTop = Infinity;
    solid.forEach((s, i) => { if (s) feetTop = Math.min(feetTop, Math.floor(i / w)); });
    const legs = new Array(w * h).fill(false);
    for (const g of zbFleenModComponents(Array.from(px, c => !!fzKey[c]), w, h)) {
      let top = Infinity;
      for (const i of g) top = Math.min(top, Math.floor(i / w));
      if (top < feetTop) for (const i of g) legs[i] = true;
    }
    return Array.from(px, (c, i) => legs[i] || (c === W.OUTLINE && zbFleenModTouches(legs, w, h, i) && !zbFleenModTouches(solid, w, h, i)));
  };

  /* export_web.borrowed_feet for host 'zoombini': [[front, reg], [back, reg]]. */
  const feetCache = new Map();
  const borrowedFeet = v => {
    if (feetCache.has(v)) return feetCache.get(v);
    let [[w, h, px], [rx, ry]] = borrowedPart('feet', v);
    const src = restRaw('fleen', 'feet', v)[0][2];
    const nearM = zbFleenModMirror(w, h, nearFoot([w, h, src], v));
    let drop = new Array(w * h).fill(false);
    if (v === 2) {
      drop = zbFleenModMirror(w, h, Array.from(src, (c, i) => !!c && zbFleenModInside(W.FLEEN_WHEEL_FORK, i % w + 0.5, Math.floor(i / w) + 0.5)));
    }
    let lift = 0, shift = 0;
    if (Array.prototype.some.call(src, c => fzKey[c])) {
      drop = zbFleenModMirror(w, h, legPixels(src, w, h));
      const [[bw, , bpx], [, bry]] = restRaw('zoombini', 'body', 0);
      let eggBottom = -Infinity;
      for (let i = 0; i < bpx.length; i++) if (bpx[i]) eggBottom = Math.max(eggBottom, Math.floor(i / bw));
      eggBottom -= bry;
      let top = Infinity, sum = 0, n = 0;
      for (let i = 0; i < px.length; i++) {
        if (px[i] && px[i] !== W.OUTLINE && !drop[i]) top = Math.min(top, Math.floor(i / w));
      }
      for (let i = 0; i < px.length; i++) if (px[i] && !drop[i]) { sum += i % w + 0.5; n++; }
      lift = (top - ry) - (eggBottom - 1);
      shift = R(sum / n - rx - landmark('zoombini', 'feet')[0]);
    }
    px = px.map((c, i) => (drop[i] ? 0 : c));
    const skinPx = zbFleenModMirror(w, h, Array.from(src, c => !!fzKey[c]));
    const ahead = nearM.map((n, i) => n && !skinPx[i]);
    const reg = [rx + shift, ry + lift];
    const out = [[[w, h, px.map((c, i) => (ahead[i] ? c : 0))], reg], [[w, h, px.map((c, i) => (ahead[i] ? 0 : c))], reg]];
    feetCache.set(v, out);
    return out;
  };

  /* export_web.fleen_device_on_zoombini: not mirrored, run frames face right. */
  const deviceOnZoombini = (v, pose, body) => {
    const [[w, h, px0], [rx, ry]] = restRaw('fleen', 'feet', v, pose);
    const px = Array.from(px0, c => fzLut[c]);
    const [hx, hy] = landmark('zoombini', 'feet'), [sx, sy] = landmark('fleen', 'feet', body);
    const x = -rx + R(hx - sx), y = -ry + R(hy - sy);
    return [[w, h, px], [-x, -y]];
  };

  const restEgg = () => {
    const i = full.index('body', 0, REST);
    return full.points(i);
  };

  const drops = new Map();
  const deviceDrop = v => {
    if (drops.has(v)) return drops.get(v);
    const [front, back] = borrowedFeet(v);
    const [[w, , px], [rx, ry]] = zbFleenModPaste([front, back].filter(p => p && zbFleenModAny(p[0][2])));
    const egg = restEgg(), pts = [];
    for (let k = 0; k < px.length; k++) if (px[k]) pts.push([k % w - rx, Math.floor(k / w) - ry]);
    let d = 0;
    for (;;) {
      let n = 0;
      for (const [x, y] of pts) if (!egg.has(zbFleenModKey(x, y + d))) n++;
      if (n < C.SHOWN_DEVICE * pts.length) d++; else break;
    }
    drops.set(v, d);
    return d;
  };

  /* The Zoombini's own shoes at a pose, left to right: [left, right, bottom]. */
  const ownFeet = (v, pose) => {
    const i = full.index('feet', v, pose), [w, h, px] = full.frames[i], [rx, ry] = full.regs[i];
    const solid = Array.from(px, c => !!c && !zfKey[c] && c !== W.OUTLINE);
    const out = [];
    for (const g of zbFleenModComponents(solid, w, h)) {
      if (g.length < 12) continue;
      let l = Infinity, r = -Infinity, b = -Infinity;
      for (const k of g) { l = Math.min(l, k % w); r = Math.max(r, k % w); b = Math.max(b, Math.floor(k / w)); }
      out.push([l - rx, r + 1 - rx, b + 1 - ry]);
    }
    return out.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  };

  const steps = (v, pose) => {
    const own = ownFeet(v, pose), rest = ownFeet(v, REST);
    let homes;
    if (rest.length === 2) homes = rest.map(([l, r]) => (l + r) / 2);
    else {
      if (rest.length !== 1) throw new Error(`feet ${v}: ${rest.length} shoes at rest`);
      const [l, r] = rest[0];
      homes = [(3 * l + r) / 4, (l + 3 * r) / 4];
    }
    if (own.length < 2) {
      if (own.length !== 1) throw new Error(`feet ${v} pose ${pose}: no shoes`);
      const [l, r] = own[0];
      const dx = R((l + r) / 2 - (0 + homes[0] + homes[1]) / 2);
      return [[dx, 0], [dx, 0]];
    }
    const [l0, r0, b0] = own[0], [l1, r1, b1] = own[own.length - 1];
    const ground = Math.max(b0, b1);
    return [[R((l0 + r0) / 2 - homes[0]), Math.min(C.LIFT_FEET, ground - b0)],
            [R((l1 + r1) / 2 - homes[1]), Math.min(C.LIFT_FEET, ground - b1)]];
  };

  const feet = (v, pose) => {
    const restBottom = landmark('zoombini', 'feet')[1];
    const counter = feetBodies[v].get(pose);
    const bodiesHere = counter && counter.size ? common(counter) : null;
    let dy = 0;
    if (bodiesHere && bodiesHere.size) {
      let total = 0, s = 0;
      for (const n of bodiesHere.values()) total += n;
      for (const [b, n] of bodiesHere) s += landmark('zoombini', 'feet', b)[1] * n;
      dy = R(s / total - restBottom);
    }
    const device = C.DEVICES.includes(v);
    if (device) dy += deviceDrop(v);
    if (device && pose > 3) {
      const ride = rides[v], [f, body] = ride[zbFleenModMod(pose - 4, ride.length)];
      const [[w, h, px], [rx, ry]] = deviceOnZoombini(v, f, body);
      return [[w, h, near(px)], [rx, ry - dy]];
    }
    const [front, back] = borrowedFeet(v);
    const pieces = [front, back].filter(p => zbFleenModAny(p[0][2]));
    const leftOf = p => { let m = Infinity; p[0][2].forEach((c, i) => { if (c) m = Math.min(m, i % p[0][0]); }); return m - p[1][0]; };
    pieces.sort((a, b) => leftOf(a) - leftOf(b));
    let st = pieces.map(() => [0, 0]);
    if (!device && pieces.length === 2) {
      st = steps(v, pose);
      let b = REST;
      if (bodiesHere && bodiesHere.size) {
        let n = -1;
        for (const [k, c] of bodiesHere) if (c > n) { n = c; b = k; }
      }
      const i = full.index('body', 0, b), egg = full.points(i);
      const shown = ([[pw, , ppx], [prx, pry]], dx, lift) => {
        let all = 0, out = 0;
        for (let k = 0; k < ppx.length; k++) {
          if (!ppx[k]) continue;
          all++;
          if (!egg.has(zbFleenModKey(k % pw - prx + dx, Math.floor(k / pw) - pry + dy - lift))) out++;
        }
        return out / all;
      };
      st = st.map(([dx, lift], k) => {
        const standing = shown(pieces[k], dx, 0);
        while (lift && shown(pieces[k], dx, lift) < C.SHOWN_FEET * standing) lift -= 1;
        return [dx, lift];
      });
    }
    const [[w, h, px], reg] = zbFleenModPaste(pieces.map(([raw, r], k) => [raw, [r[0] - st[k][0], r[1] - dy + st[k][1]]]));
    return [[w, h, near(px)], reg];
  };

  const lift = {};
  const makeFrame = (part, v, pose) => {
    if (part === 'feet') return feet(v, pose);
    if (part !== 'hair' && full.hidden(part, pose)) return ZB_FLEEN_MOD_EMPTY();
    let got;
    if (part === 'eyes') {
      const [fleenPose, at] = roles.get(pose) || [undefined, pose];
      got = placed('eyes', v, at, fleenPose);
    } else if (part === 'hair') got = hair(v, pose, lift[v]);
    else got = placed(part, v, pose);
    const [[w, h, px], [x, y]] = got;
    return [[w, h, near(px)], [-x, -y]];
  };
  for (let v = 0; v < 5; v++) lift[v] = liftOf(v, REST);

  return {
    green, chars, full, pairings, lift, nearest,
    frame,
    /* A Zoombini body frame in the mod's skin (marked, if lime). */
    body: ([w, h, px]) => [w, h, Array.from(px, c => bodyLut[c])],
    /* As written: marked skin dithered to lime from the origin `reg`. */
    final([w, h, px], reg) {
      if (!green) return [w, h, px];
      const out = Array.from(px);
      for (let i = 0; i < px.length; i++) {
        const c = px[i];
        if (c > 0 && c <= 6) {
          const [a, b, n] = C.LIME[c + 14];
          out[i] = C.BAYER[zbFleenModMod(Math.floor(i / w) - reg[1], 2)][zbFleenModMod(i % w - reg[0], 2)] < n ? a : b;
        }
      }
      return [w, h, out];
    },
    restBody() {
      const [raw, reg] = restRaw('zoombini', 'body', 0);
      return [this.body(raw), reg];
    },
    restRaw,
  };
}

/* ---- the small and the tumbling Zoombinis ------------------------------ */

/* {small pose: full-size pose it is a shrunk copy of} for one part. */
function zbFleenModSmallPoses(full, small, part, variants, masks) {
  const C = ZB_FLEEN_MOD, out = new Map(), v0 = variants[0], feet = part === 'feet';
  const mask = (atlas, i, scale) => {
    const key = `${atlas.bmp}/${i}`;
    if (!masks.has(key)) {
      const [w, , px] = atlas.frames[i], [rx, ry] = atlas.regs[i], s = new Set();
      for (let k = 0; k < px.length; k++) {
        if (px[k]) s.add(zbFleenModKey(zbFleenModRound((k % w - rx) * scale), zbFleenModRound((Math.floor(k / w) - ry) * scale)));
      }
      masks.set(key, s);
    }
    return masks.get(key);
  };
  for (let p = 1; p <= zbFleenModPoseCount(small.parts[part], v0); p++) {
    if (!feet && small.hidden(part, p)) continue;
    let score = -Infinity, best = null;
    for (let q = 1; q <= zbFleenModPoseCount(full.parts[part], v0); q++) {
      if (!feet && full.hidden(part, q)) continue;
      let total = 0;
      for (const v of variants) {
        const a = mask(full, full.index(part, v, q), C.SMALL_SCALE), b = mask(small, small.index(part, v, p), 1.0);
        let inter = 0;
        for (const k of a) if (b.has(k)) inter++;
        total += inter / Math.max(1, a.size + b.size - inter);
      }
      const s = total / variants.length;
      if (s >= score) { score = s; best = q; }           // max of (score, q): the last of ties
    }
    if (!(score >= (feet ? C.MIN_MATCH_FEET : C.MIN_MATCH))) throw new Error(`small ${part} ${variants} ${p}: best match ${score}`);
    out.set(p, best);
  }
  return out;
}

/* {tumble pose: [turn, rest body centre, body centre, {part: fling}]}. */
function zbFleenModTumbleMoves(fit, full, tum) {
  const C = ZB_FLEEN_MOD, rest = ZB_FLEEN_MOD_WEB.REST_POSE.zoombini, bodies = fit.pairings.tumble;
  const mean = (atlas, part, pose) => {
    let sx = 0, sy = 0, n = 0;
    for (let v = 0; v < 5; v++) {
      if (!atlas.area(part, v, pose)) continue;
      const c = atlas.centre(atlas.index(part, v, pose));
      sx += c[0]; sy += c[1]; n++;
    }
    return [sx / n, sy / n];
  };
  const b0 = full.centre(full.index('body', 0, rest)), d0 = {};
  for (const part of C.PARTS) { const m = mean(full, part, rest); d0[part] = [m[0] - b0[0], m[1] - b0[1]]; }
  const out = new Map();
  for (let pose = 1; pose <= zbFleenModPoseCount(tum.parts.hair, 0); pose++) {
    const counter = bodies.get(pose);
    const body = counter && counter.size ? zbFleenModCommonest(counter) : pose;
    const b = tum.centre(tum.index('body', 0, body));
    const m = mean(tum, 'hair', pose), d = [m[0] - b[0], m[1] - b[1]];
    let turn = zbFleenModMod360(zbFleenModDegrees(Math.atan2(d[1], d[0]) - Math.atan2(d0.hair[1], d0.hair[0])));
    const right = zbFleenModMod(zbFleenModRound(turn / 90) * 90, 360);
    if (Math.min(Math.abs(turn - right), 360 - Math.abs(turn - right)) <= C.SNAP) turn = right;
    const c = Math.cos(zbFleenModRadians(turn)), s = Math.sin(zbFleenModRadians(turn));
    const fling = {};
    for (const part of C.PARTS) {
      if (part !== 'hair' && tum.hidden(part, pose)) continue;
      const mp = mean(tum, part, pose), dp = [mp[0] - b[0], mp[1] - b[1]], [x0, y0] = d0[part];
      fling[part] = [dp[0] - (c * x0 - s * y0), dp[1] - (s * x0 + c * y0)];
    }
    out.set(pose, [turn, b0, b, fling]);
  }
  return out;
}

/* ---- writing ------------------------------------------------------------ */

const zbFleenModRawFrame = ([w, h, px]) => zbRawFrame(w, h, Uint8Array.from(px));

function zbFleenModRegsBytes(original, values) {
  const out = new Uint8Array(2 + 2 * values.length), dv = new DataView(out.buffer);
  out.set(original.subarray(0, 2));
  values.forEach((v, k) => dv.setInt16(2 + 2 * k, v));
  return out;
}

/* ZOOMBINI.MHK's three sheets and their REGS (mod_fleen_parts.build). */
function zbFleenModBuild(fit, z) {
  const C = ZB_FLEEN_MOD, REST = ZB_FLEEN_MOD_WEB.REST_POSE.zoombini;
  const full = fit.full, tum = zbFleenModSheet(z, 3100), small = zbFleenModSheet(z, 3200);
  const frames = { 3000: new Map(), 3100: new Map(), 3200: new Map() };
  const put = (bmp, part, v, pose, f) => frames[bmp].set(`${part}/${v}/${pose}`, [part, v, pose, f]);
  const variantsOf = part => (part === 'body' ? [0] : [0, 1, 2, 3, 4]);
  const masks = new Map();
  for (const part of C.PARTS) {
    for (const v of variantsOf(part)) {
      for (let pose = 1; pose <= zbFleenModPoseCount(full.parts[part], v); pose++) put(3000, part, v, pose, fit.frame(part, v, pose));
    }
    const groups = part === 'feet' ? [[0], [1], [2], [3], [4]] : [variantsOf(part)];
    for (const variants of groups) {
      const matched = zbFleenModSmallPoses(full, small, part, variants, masks);
      for (const v of variants) {
        for (let pose = 1; pose <= zbFleenModPoseCount(small.parts[part], v); pose++) {
          put(3200, part, v, pose, matched.has(pose) ? zbFleenModShrink(fit.frame(part, v, matched.get(pose)), C.SMALL_SCALE) : ZB_FLEEN_MOD_EMPTY());
        }
      }
    }
  }
  if (fit.green) {                                       // the Zoombini's own body, reskinned
    for (const [bmp, atlas] of [[3000, full], [3100, tum], [3200, small]]) {
      for (let pose = 1; pose <= zbFleenModPoseCount(atlas.parts.body, 0); pose++) {
        const i = atlas.index('body', 0, pose);
        put(bmp, 'body', 0, pose, [fit.body(atlas.frames[i]), atlas.regs[i]]);
      }
    }
  }
  const [p1, p2, egg] = C.NOSELESS;                     // and without its own nose's socket
  for (const [bmp, atlas] of [[3000, full], [3200, small]]) {
    const i = atlas.index('body', 0, egg);
    for (const pose of [p1, p2]) put(bmp, 'body', 0, pose, [fit.body(atlas.frames[i]), atlas.regs[i]]);
  }
  for (const [pose, [turn, b0, b, fling]] of zbFleenModTumbleMoves(fit, full, tum)) {
    for (const part of C.PARTS) {
      for (const v of variantsOf(part)) {
        put(3100, part, v, pose, fling[part] ? zbFleenModTurned(fit.frame(part, v, REST), turn, b0, b, fling[part]) : ZB_FLEEN_MOD_EMPTY());
      }
    }
  }
  const changes = [];
  for (const [bmp, atlas] of [[3000, full], [3100, tum], [3200, small]]) {
    const tbmp = z.get('tBMP', bmp), subs = [...zbSheetFrames(tbmp)], rid = atlas.regsId;
    const xs = zbFleenModRegsWords(z.get('REGS', rid)), ys = zbFleenModRegsWords(z.get('REGS', rid + 1));
    for (const [part, v, pose, [raw, [rx, ry]]] of frames[bmp].values()) {
      const i = atlas.index(part, v, pose);
      const [w, h, px] = fit.final(raw, [rx, ry]);
      subs[i] = zbFleenModRawFrame([w, h, px]);
      subs[i + 1] = zbFleenModRawFrame([w, h, zbFleenModMirror(w, h, px)]);
      xs[i] = rx; ys[i] = ry;
      xs[i + 1] = w - rx; ys[i + 1] = ry;
    }
    changes.push({ tag: 'tBMP', id: bmp, bytes: zbSheetBytes(tbmp, subs) });
    changes.push({ tag: 'REGS', id: rid, bytes: zbFleenModRegsBytes(z.get('REGS', rid), xs) });
    changes.push({ tag: 'REGS', id: rid + 1, bytes: zbFleenModRegsBytes(z.get('REGS', rid + 1), ys) });
  }
  return changes;
}

/* export_web.blank_tiles: a button tile with nothing on it, normal and
   selected, its stone speckled by Python's random.Random(1). */
function zbFleenModBlankTiles(raws) {
  const W = ZB_FLEEN_MOD_WEB, [w, h, n] = raws[0], s = raws[1][2], FR = W.FRAME;
  const speckle = new Map();
  for (let k = 0; k < raws.length; k += 2) {
    const px = raws[k][2];
    for (let y = FR; y < h - FR; y++) for (let x = w - 6; x < w - FR; x++) {
      if ((x + y) % 2 === 0 && px[y * w + x] > 45) zbFleenModCount(speckle, px[y * w + x]);
    }
  }
  const rng = zbFleenModRandom(1), pop = [...speckle.keys()], weights = [...speckle.values()];
  const normal = Array.from(n), selected = Array.from(s);
  for (let y = FR; y < h - FR; y++) for (let x = FR; x < w - FR; x++) {
    const i = y * w + x;
    normal[i] = (x + y) % 2 ? W.STONE_DARK : rng.choice(pop, weights);
    selected[i] = W.TAN;
  }
  return [[w, h, normal], [w, h, selected]];
}

/* PICKER tBMP 4400 with the hair, eye, nose and feet tiles redrawn. */
function zbFleenModTiles(fit, p) {
  const C = ZB_FLEEN_MOD, W = ZB_FLEEN_MOD_WEB, REST = W.REST_POSE.zoombini;
  const tbmp = p.get('tBMP', 4400);
  const blank = zbFleenModBlankTiles(zbFleenModRaws(p, 4400));
  const body = fit.restBody(), subs = [...zbSheetFrames(tbmp)];
  for (const part of C.PARTS) {
    for (let v = 0; v < 5; v++) {
      const [[pw, ph, ppx], [prx, pry]] = fit.frame(part, v, REST);
      const fig = new Map();
      for (const [[fw, , fpx], [rx, ry]] of [body, [[pw, ph, ppx], [prx, pry]]]) {
        for (let i = 0; i < fpx.length; i++) if (fpx[i]) fig.set(zbFleenModKey(i % fw - rx, Math.floor(i / fw) - ry), [i % fw - rx, Math.floor(i / fw) - ry, fpx[i]]);
      }
      for (const selected of [0, 1]) {
        const [w, h, idx0] = blank[selected], idx = Array.from(idx0);
        const [dx, dy] = selected ? W.SELECTED_SHIFT : [0, 0];
        let ax, ay;
        if (part === 'hair') {
          ax = Math.floor(w / 2) - (-prx + Math.floor(pw / 2)) + dx;
          ay = Math.floor(h / 2) - (-pry + Math.floor(ph / 2)) + dy;
        } else {
          ax = C.TILE_ORIGIN[part][0] + dx; ay = C.TILE_ORIGIN[part][1] + dy;
        }
        const inside = (x, y) => W.FRAME <= x && x < w - W.FRAME && W.FRAME <= y && y < h - W.FRAME;
        if (!selected) {
          const [sx, sy] = W.SHADOW_OFFSET;
          for (const [x, y] of fig.values()) if (inside(x + ax + sx, y + ay + sy)) idx[(y + ay + sy) * w + x + ax + sx] = W.SHADOW;
        }
        for (const [x, y, c] of fig.values()) if (inside(x + ax, y + ay)) idx[(y + ay) * w + x + ax] = c;
        subs[2 * (C.TILE_ROW[part] * 5 + v) + selected] = zbFleenModRawFrame(fit.final([w, h, idx], [0, 0]));
      }
    }
  }
  return { tag: 'tBMP', id: 4400, bytes: zbSheetBytes(tbmp, subs) };
}

/* PICKER tBMP 4300 with the big parts (and, green, the body) replaced, and
   the EXE with their anchors rewritten. */
function zbFleenModBigParts(fit, p, exeBytes) {
  const C = ZB_FLEEN_MOD, REST = ZB_FLEEN_MOD_WEB.REST_POSE.zoombini;
  const signed = b => (b > 127 ? b - 256 : b);
  const tbmp = p.get('tBMP', 4300), subs = [...zbSheetFrames(tbmp)];
  if (fit.green) {
    const f = zbFleenModRaws(p, 4300)[0];
    const x0 = -signed(exeBytes[C.EXE_DX + 1]), y0 = -signed(exeBytes[C.EXE_DY + 1]);   // frame 0's top-left
    subs[0] = zbFleenModRawFrame(fit.final(fit.body(f), [-x0, -y0]));
  }
  const exe = Uint8Array.from(exeBytes);
  const [[bw, , bpx], [brx, bry]] = fit.restRaw('zoombini', 'body', 0);
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
  for (let i = 0; i < bpx.length; i++) {
    if (!bpx[i]) continue;
    const x = i % bw, y = Math.floor(i / bw);
    xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y);
  }
  const centre = [(xa + xb + 1) / 2 - brx, (ya + yb + 1) / 2 - bry], pivot = centre;
  const sx = zbFleenModRound((pivot[0] - centre[0]) * C.BIG_SCALE), sy = zbFleenModRound((pivot[1] - centre[1]) * C.BIG_SCALE);
  for (const part of C.PARTS) {
    for (let v = 0; v < 5; v++) {
      const [raw, reg] = fit.frame(part, v, REST);
      let [[w, h, px], [x0, y0]] = zbFleenModEnlarged(raw, reg, pivot, C.BIG_SCALE);
      x0 += sx; y0 += sy;
      if (!(x0 >= -128 && x0 <= 127 && y0 >= -128 && y0 <= 127)) throw new Error(`big ${part} ${v}: ${x0}, ${y0}`);
      const f = C.BIG_FRAME[part] + v;
      subs[f] = zbFleenModRawFrame(fit.final([w, h, px], [-x0, -y0]));
      exe[C.EXE_DX + f + 1] = -x0 & 0xff;               // engine frame = frame + 1
      exe[C.EXE_DY + f + 1] = -y0 & 0xff;
    }
  }
  return { change: { tag: 'tBMP', id: 4300, bytes: zbSheetBytes(tbmp, subs) }, exe };
}

/* The mod: see the top of this file. */
function zbFleenMod(archives, exeBytes, green = false) {
  const fit = zbFleenModFitter(archives, green);
  const p = archives.get('PICKER');
  const out = { ZOOMBINI: zbFleenModBuild(fit, archives.get('ZOOMBINI')), PICKER: [zbFleenModTiles(fit, p)], exe: null };
  if (exeBytes) {
    const big = zbFleenModBigParts(fit, p, exeBytes);
    out.PICKER.push(big.change);
    out.exe = big.exe;
  }
  out.lift = fit.lift;
  return out;
}
