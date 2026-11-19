/* zb-shot-remake.js -- a screenshot of the 2015 remake read back: the
   scene it shows and where in the scene.
   =========================================================================
   Needs zb-shot.js (zbShotTrim) and, in the page, the scenes drawn as
   Places draws them (remakeDrawScene).

   The remake draws painted backdrops with smoothing at any size, and a
   phone, a monitor or a web page crops and scales the result. So nothing
   here compares exact colors. A screenshot is cut down to the game's
   picture (zbShotTrim) and shrunk, each scene is shrunk the same way, and
   the screenshot is slid over each scene at a range of sizes. Zero-mean
   correlation of each color channel scores a fit, so a picture brightened
   or tinted by its capture still fits. The best few fits are searched again
   finer. The Zoombinis, the buttons and the scene's moving parts differ
   from the drawn scene, but they cover a small part of the picture.

   A fit maps the screenshot onto the scene: scene x = x0 + x * scale,
   scene y = y0 + y * scale, in the scene drawing's pixels.
*/

/* The rectangle (x0, y0, w, h) of `img` ({ rgba, width, height }) shrunk to
   outW x outH by averaging, as three Float32Arrays of channels. */
function zbRemakeShotShrink(img, x0, y0, w, h, outW, outH) {
  const { rgba, width } = img;
  const r = new Float32Array(outW * outH), g = new Float32Array(outW * outH), b = new Float32Array(outW * outH);
  for (let oy = 0; oy < outH; oy++) {
    const ya = Math.floor(y0 + oy * h / outH), yb = Math.max(ya + 1, Math.floor(y0 + (oy + 1) * h / outH));
    for (let ox = 0; ox < outW; ox++) {
      const xa = Math.floor(x0 + ox * w / outW), xb = Math.max(xa + 1, Math.floor(x0 + (ox + 1) * w / outW));
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const o = 4 * (y * width + x);
        sr += rgba[o]; sg += rgba[o + 1]; sb += rgba[o + 2]; n++;
      }
      const i = oy * outW + ox;
      r[i] = sr / n; g[i] = sg / n; b[i] = sb / n;
    }
  }
  return { w: outW, h: outH, ch: [r, g, b] };
}

/* The mean over three channels of the zero-mean normalized correlation of
   `a` (all of it) with the window of `b` at (dx, dy), a's size. */
function zbRemakeShotCorrelation(a, b, dx, dy) {
  let total = 0;
  const n = a.w * a.h;
  for (let c = 0; c < 3; c++) {
    const A = a.ch[c], B = b.ch[c];
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let y = 0; y < a.h; y++) {
      const ra = y * a.w, rb = (y + dy) * b.w + dx;
      for (let x = 0; x < a.w; x++) {
        const p = A[ra + x], q = B[rb + x];
        sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q;
      }
    }
    const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    total += va > 1e-6 && vb > 1e-6 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : 0;
  }
  return total / 3;
}

/* The best placement of `shot` (shrunk) in `scene` (shrunk to sceneW wide)
   over the given spans, each the share of the scene's width the screenshot
   covers. Offsets step by `step` shrunk pixels, inside `bounds` where
   given ({ x0, x1, y0, y1 }). Returns { score, span, dx, dy } or null. */
function zbRemakeShotSlide(shotImg, sceneSmall, spans, step = 1, bounds = null) {
  let best = null;
  const aspect = shotImg.height / shotImg.width;
  for (const span of spans) {
    const w = Math.round(sceneSmall.w * span), h = Math.round(w * aspect);
    if (w < 8 || h < 8 || w > sceneSmall.w || h > sceneSmall.h) continue;
    const a = zbRemakeShotShrink(shotImg, 0, 0, shotImg.width, shotImg.height, w, h);
    const x0 = bounds ? Math.max(0, bounds.x0) : 0, x1 = Math.min(sceneSmall.w - w, bounds ? bounds.x1 : Infinity);
    const y0 = bounds ? Math.max(0, bounds.y0) : 0, y1 = Math.min(sceneSmall.h - h, bounds ? bounds.y1 : Infinity);
    for (let dy = y0; dy <= y1; dy += step) for (let dx = x0; dx <= x1; dx += step) {
      const s = zbRemakeShotCorrelation(a, sceneSmall, dx, dy);
      if (!best || s > best.score) best = { score: s, span, dx, dy, w, h };
    }
  }
  return best;
}

/* The scene a screenshot shows. `rgba`, `width` and `height` are the
   screenshot; `scenes` an array of { n, img } with img a scene's drawing
   ({ rgba, width, height }). Returns the scenes ranked, each
   { n, score, x0, y0, scale } mapping a screenshot pixel to the scene's,
   with `trim` the bars cut off. */
function zbRemakeShotPlace(rgba, width, height, scenes, opts = {}) {
  const trim = zbShotTrim(rgba, width, height);
  const shotImg = { rgba: trim.rgba, width: trim.width, height: trim.height };
  const coarseW = opts.coarseW || 64, fineW = opts.fineW || 256;
  const spans = [];
  for (let s = 1; s >= 0.4; s -= 0.04) spans.push(+s.toFixed(3));
  const ranked = [];
  for (const { n, img } of scenes) {
    const small = zbRemakeShotShrink(img, 0, 0, img.width, img.height, coarseW, Math.round(coarseW * img.height / img.width));
    const fit = zbRemakeShotSlide(shotImg, small, spans);
    if (fit) ranked.push({ n, img, coarse: fit });
  }
  ranked.sort((a, b) => b.coarse.score - a.coarse.score);
  const out = [];
  for (const r of ranked.slice(0, opts.refine || 3)) {
    const k = fineW / coarseW, img = r.img;
    const big = zbRemakeShotShrink(img, 0, 0, img.width, img.height, fineW, Math.round(fineW * img.height / img.width));
    const near = [];
    for (let d = -0.04; d <= 0.0401; d += 0.005) near.push(r.coarse.span + d);
    const cx = r.coarse.dx * k, cy = r.coarse.dy * k;
    const fit = zbRemakeShotSlide(shotImg, big, near, 1, { x0: Math.floor(cx - 2 * k), x1: Math.ceil(cx + 2 * k), y0: Math.floor(cy - 2 * k), y1: Math.ceil(cy + 2 * k) }) || r.coarse;
    const unit = img.width / big.w;
    out.push({ n: r.n, score: fit.score, coarse: r.coarse.score, x0: fit.dx * unit, y0: fit.dy * unit, scale: fit.w * unit / shotImg.width });
  }
  for (const r of ranked.slice(out.length)) out.push({ n: r.n, score: null, coarse: r.coarse.score });
  out.sort((a, b) => (b.score ?? -2) - (a.score ?? -2));
  return { trim, ranked: out };
}

/* ---- the Zoombinis -------------------------------------------------------- */

/* The fitted scene behind the screenshot: the scene's drawing sampled at
   each of the screenshot's pixels (bilinear), then brought to the
   screenshot's colors by a line a channel, shot = a * scene + b, fitted
   three times on the 60% of pixels that agree best. `shot` is
   { rgba, width, height } (the trimmed screenshot), `scene` the drawing,
   `fit` zbRemakeShotPlace's. Returns { bg, gain }, bg a Float32Array of
   RGB at the screenshot's size. */
function zbRemakeShotBackdrop(shot, scene, fit) {
  const W = shot.width, H = shot.height, bg = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(scene.width - 1.001, Math.max(0, fit.x0 + (x + 0.5) * fit.scale - 0.5));
    const sy = Math.min(scene.height - 1.001, Math.max(0, fit.y0 + (y + 0.5) * fit.scale - 0.5));
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const o = 4 * (iy * scene.width + ix), d = 4 * scene.width;
    for (let c = 0; c < 3; c++) {
      const r = scene.rgba;
      bg[3 * (y * W + x) + c] = (r[o + c] * (1 - fx) + r[o + 4 + c] * fx) * (1 - fy) + (r[o + d + c] * (1 - fx) + r[o + d + 4 + c] * fx) * fy;
    }
  }
  const gain = [[1, 0], [1, 0], [1, 0]];
  let keep = null;
  for (let it = 0; it < 3; it++) {
    for (let c = 0; c < 3; c++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < W * H; i += 3) {
        if (keep && !keep[i]) continue;
        const x = bg[3 * i + c], y = shot.rgba[4 * i + c];
        n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
      }
      const v = sxx - sx * sx / n, a = v > 1e-6 ? (sxy - sx * sy / n) / v : 1;
      gain[c] = [a, (sy - a * sx) / n];
    }
    const res = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      let e = 0;
      for (let c = 0; c < 3; c++) e += Math.abs(shot.rgba[4 * i + c] - (gain[c][0] * bg[3 * i + c] + gain[c][1]));
      res[i] = e;
    }
    const cut = Float32Array.from(res).sort()[Math.floor(W * H * 0.6)];
    keep = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) keep[i] = res[i] <= cut ? 1 : 0;
  }
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) bg[3 * i + c] = gain[c][0] * bg[3 * i + c] + gain[c][1];
  return { bg, gain };
}

/* The color most of a part's opaque pixels have: a head's skin. */
function zbRemakeShotSkin(part) {
  const count = new Map();
  for (let i = 0; i < part.width * part.height; i++) {
    if (part.rgba[4 * i + 3] < 255) continue;
    const k = (part.rgba[4 * i] << 16) | (part.rgba[4 * i + 1] << 8) | part.rgba[4 * i + 2];
    count.set(k, (count.get(k) || 0) + 1);
  }
  let best = 0, n = -1;
  for (const [k, c] of count) if (c > n) { n = c; best = k; }
  return [best >> 16, (best >> 8) & 255, best & 255];
}

/* The Zoombinis in a screenshot. `shot` is the trimmed screenshot, `back`
   zbRemakeShotBackdrop's, and `parts` a Map from "<pose>/<clip>" to
   { rgba, width, height, ox, oy }, the clip drawn at the pose's frame with
   its origin at (ox, oy), for the clips zmb_feet_<f>, zmb_feet_<f>_head and
   zmb_feet_<f>_<eyes|nose|hair>_<v>. `poses` lists the poses, the first the
   standing one.

   A Zoombini's head is found by its skin where the screenshot differs from
   the scene: the head's skin pixels, at a size, laid over the pixels of skin
   color, and a place where a share of them land on skin is a head. The size
   comes from the patches of skin. Each head is fitted by drawing the scene
   with a Zoombini over it and counting the difference over a box around it:
   the side it faces, its size, its pose and each trait in turn, its feet with
   its height, and a nudge of its place, four times over. A Zoombini that
   explains enough of its box is drawn into the scene, and the search goes on
   over what is left, the largest first, since a small fit can explain part
   of a large Zoombini. Then each is fitted again with those behind it drawn.
   Returns [{ x, y, k, flip, pose, traits: { hair, eyes, nose, feet },
   margins, gain }], x and y the origin in the screenshot, k the size against
   the clips' pixels, a margin how far the next value of a trait fit worse,
   and gain how much the Zoombini explains a pixel. */
function zbRemakeShotZoombinis(shot, back, parts, poses, opts = {}) {
  const W = shot.width, H = shot.height, { bg, gain } = back;
  const px = shot.rgba;
  const tone = c => [0, 1, 2].map(i => gain[i][0] * c[i] + gain[i][1]);
  const head0 = parts.get(poses[0] + '/zmb_feet_0_head');
  const skinRaw = zbRemakeShotSkin(head0), skin = tone(skinRaw);
  const near = (r, g, b, c, t) => Math.abs(r - c[0]) + Math.abs(g - c[1]) + Math.abs(b - c[2]) < t;
  const skinM = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[4 * i], g = px[4 * i + 1], b = px[4 * i + 2];
    const fg = Math.abs(r - bg[3 * i]) + Math.abs(g - bg[3 * i + 1]) + Math.abs(b - bg[3 * i + 2]);
    skinM[i] = near(r, g, b, skin, 60) && fg > 30 ? 1 : 0;
  }
  // The size: the larger patches of skin against the head's skin.
  const seen = new Uint8Array(W * H), areas = [];
  for (let i = 0; i < W * H; i++) if (skinM[i] && !seen[i]) {
    let n = 0;
    const st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j / W) | 0;
      n++;
      if (x > 0 && skinM[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; st.push(j - 1); }
      if (x < W - 1 && skinM[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; st.push(j + 1); }
      if (y > 0 && skinM[j - W] && !seen[j - W]) { seen[j - W] = 1; st.push(j - W); }
      if (y < H - 1 && skinM[j + W] && !seen[j + W]) { seen[j + W] = 1; st.push(j + W); }
    }
    if (n > 40) areas.push(n);
  }
  if (!areas.length) return [];
  areas.sort((a, b) => a - b);
  let partSkin = 0;
  for (let i = 0; i < head0.width * head0.height; i++)
    if (head0.rgba[4 * i + 3] > 200 && near(head0.rgba[4 * i], head0.rgba[4 * i + 1], head0.rgba[4 * i + 2], skinRaw, 30)) partSkin++;
  const K0 = Math.sqrt(areas[Math.floor(areas.length * 0.75)] / partSkin) / 0.8;

  // A part shrunk to size k, maybe facing left, as premultiplied floats.
  const cache = new Map();
  const sized = (name, k, flip) => {
    const key = name + '|' + k + '|' + flip;
    if (cache.has(key)) return cache.get(key);
    const p = parts.get(name);
    if (!p) { cache.set(key, null); return null; }
    const w = Math.max(1, Math.round(p.width * k)), h = Math.max(1, Math.round(p.height * k));
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = Math.floor(y / k); yy < Math.min(p.height, Math.ceil((y + 1) / k)); yy++)
        for (let xx = Math.floor(x / k); xx < Math.min(p.width, Math.ceil((x + 1) / k)); xx++) {
          const o = 4 * (yy * p.width + (flip ? p.width - 1 - xx : xx)), al = p.rgba[o + 3] / 255;
          r += p.rgba[o] * al; g += p.rgba[o + 1] * al; b += p.rgba[o + 2] * al; a += al; n++;
        }
      const o = 4 * (y * w + x);
      out[o + 3] = n ? a / n : 0;
      if (a > 0) { out[o] = gain[0][0] * r / a + gain[0][1]; out[o + 1] = gain[1][0] * g / a + gain[1][1]; out[o + 2] = gain[2][0] * b / a + gain[2][1]; }
    }
    const s = { w, h, ox: (flip ? p.width - p.ox : p.ox) * k, oy: p.oy * k, px: out };
    cache.set(key, s);
    return s;
  };
  const clips = z => {
    const f = z.traits.feet, t = z.traits;
    return [`zmb_feet_${f}`, `zmb_feet_${f}_head`, `zmb_feet_${f}_eyes_${t.eyes}`, `zmb_feet_${f}_nose_${t.nose}`, `zmb_feet_${f}_hair_${t.hair}`].map(n => z.pose + '/' + n);
  };
  // Draws z over `canvas`, RGB floats of the box B.
  const draw = (canvas, z, B) => {
    const bw = B.x1 - B.x0;
    for (const n of clips(z)) {
      const s = sized(n, z.k, z.flip);
      if (!s) continue;
      const x0 = Math.round(z.x - s.ox), y0 = Math.round(z.y - s.oy);
      for (let y = Math.max(0, B.y0 - y0); y < Math.min(s.h, B.y1 - y0); y++)
        for (let x = Math.max(0, B.x0 - x0); x < Math.min(s.w, B.x1 - x0); x++) {
          const o = 4 * (y * s.w + x), a = s.px[o + 3];
          if (a <= 0) continue;
          const d = 3 * ((y0 + y - B.y0) * bw + x0 + x - B.x0);
          canvas[d] += (s.px[o] - canvas[d]) * a; canvas[d + 1] += (s.px[o + 1] - canvas[d + 1]) * a; canvas[d + 2] += (s.px[o + 2] - canvas[d + 2]) * a;
        }
    }
  };
  const all = { x0: 0, y0: 0, x1: W, y1: H };
  const score = (z, B, base) => {
    const bw = B.x1 - B.x0, bh = B.y1 - B.y0, c = new Float32Array(bw * bh * 3);
    for (let y = 0; y < bh; y++) c.set(base.subarray(3 * ((y + B.y0) * W + B.x0), 3 * ((y + B.y0) * W + B.x1)), 3 * y * bw);
    if (z) draw(c, z, B);
    let s = 0;
    for (let y = 0; y < bh; y += 2) for (let x = (y >> 1) & 1; x < bw; x += 2) {
      const i = 4 * ((y + B.y0) * W + x + B.x0), j = 3 * (y * bw + x);
      s += Math.min(150, Math.abs(px[i] - c[j]) + Math.abs(px[i + 1] - c[j + 1]) + Math.abs(px[i + 2] - c[j + 2]));
    }
    return s;
  };
  // Heads at size k over `mask`: the places where a share of the head's skin lands on skin.
  const detect = (k, mask, share) => {
    const s = sized(poses[0] + '/zmb_feet_0_head', Math.round(k * 50) / 50, false), pts = [];
    for (let y = 0; y < s.h; y += 2) for (let x = 0; x < s.w; x += 2) {
      const o = 4 * (y * s.w + x);
      if (s.px[o + 3] > 0.9 && near(s.px[o], s.px[o + 1], s.px[o + 2], skin, 40)) pts.push([Math.round(x - s.ox), Math.round(y - s.oy)]);
    }
    // A place whose box around the head has too few skin pixels is skipped,
    // by a table of sums.
    const sum = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += mask[y * W + x]; sum[(y + 1) * (W + 1) + x + 1] = sum[y * (W + 1) + x + 1] + row; } }
    let bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
    for (const [dx, dy] of pts) { bx0 = Math.min(bx0, dx); by0 = Math.min(by0, dy); bx1 = Math.max(bx1, dx + 1); by1 = Math.max(by1, dy + 1); }
    const least = share * pts.length * 4 * 0.5;
    const found = [];
    for (let Y = 0; Y < H; Y += 2) for (let X = 0; X < W; X += 2) {
      const xa = Math.max(0, X + bx0), xb = Math.min(W, X + bx1), ya = Math.max(0, Y + by0), yb = Math.min(H, Y + by1);
      if (xa >= xb || ya >= yb || sum[yb * (W + 1) + xb] - sum[ya * (W + 1) + xb] - sum[yb * (W + 1) + xa] + sum[ya * (W + 1) + xa] < least) continue;
      let hit = 0;
      for (const [dx, dy] of pts) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x]) hit++; }
      if (hit > share * pts.length) found.push({ X, Y, f: hit / pts.length });
    }
    return found.sort((a, b) => b.f - a.f);
  };
  const fit = (X, Y, base, z0, k0) => {
    const z = z0 ? { ...z0, traits: { ...z0.traits } } : { x: X, y: Y, k: k0, flip: false, pose: poses[0], traits: { feet: 0, eyes: 0, nose: 0, hair: 0 } };
    const K = z.k;
    const B = { x0: Math.max(0, Math.round(z.x - 70 * K)), y0: Math.max(0, Math.round(z.y - 120 * K)), x1: Math.min(W, Math.round(z.x + 70 * K)), y1: Math.min(H, Math.round(z.y + 60 * K)) };
    const sc = () => score(z, B, base);
    let cur = sc();
    const margins = {};
    const tryAll = (set, values, dys = [0]) => {
      const res = [];
      for (const v of values) {
        const old = [z[set] ?? z.traits[set], z.y];
        let best = Infinity, by = z.y;
        for (const dy of dys) {
          if (set in z.traits) z.traits[set] = v; else z[set] = v;
          z.y = old[1] + dy;
          const s = sc();
          if (s < best) { best = s; by = z.y; }
        }
        z.y = old[1];
        if (set in z.traits) z.traits[set] = old[0]; else z[set] = old[0];
        res.push([best, v, by]);
      }
      res.sort((a, b) => a[0] - b[0]);
      if (res[0][0] <= cur) { if (set in z.traits) z.traits[set] = res[0][1]; else z[set] = res[0][1]; z.y = res[0][2]; cur = res[0][0]; }
      return res;
    };
    for (let round = 0; round < 4; round++) {
      tryAll('flip', [false, true]);
      tryAll('k', [z.k, Math.round(z.k * 0.92 * 50) / 50, Math.round(z.k * 1.08 * 50) / 50]);
      if (round > 0) tryAll('pose', poses, [-8, -4, 0, 4, 8].map(d => Math.round(d * z.k)));
      for (const t of ['feet', 'hair', 'eyes', 'nose']) {
        const res = tryAll(t, [0, 1, 2, 3, 4], t === 'feet' ? [-12, -8, -4, 0, 4, 8, 12].map(d => Math.round(d * z.k)) : [0]);
        margins[t] = Math.round(res[1][0] - res[0][0]);
      }
      for (let it = 0; it < 6; it++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        z.x += dx; z.y += dy;
        const s = sc();
        if (s < cur) cur = s; else { z.x -= dx; z.y -= dy; }
      }
    }
    z.margins = margins;
    z.gain = 4 * (score(null, B, base) - cur) / ((B.x1 - B.x0) * (B.y1 - B.y0));
    return z;
  };
  const model = new Float32Array(bg), out = [], tried = new Set();
  const share = opts.share || 0.18, least = opts.least || 8;
  for (const f of [1, 0.8, 0.64]) for (let loop = 0; loop < 40; loop++) {
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++)
      mask[i] = skinM[i] && Math.abs(px[4 * i] - model[3 * i]) + Math.abs(px[4 * i + 1] - model[3 * i + 1]) + Math.abs(px[4 * i + 2] - model[3 * i + 2]) >= 40 ? 1 : 0;
    const h = detect(K0 * f, mask, share).find(c => !tried.has(c.X + ',' + c.Y));
    if (!h) break;
    tried.add(h.X + ',' + h.Y);
    if (out.some(z => Math.hypot(z.x - h.X, z.y - h.Y) < 25 * z.k)) continue;
    const z = fit(h.X, h.Y, model, null, Math.round(K0 * f * 50) / 50);
    if (z.gain < least) continue;
    draw(model, z, all);
    out.push(z);
  }
  for (let pass = 0; pass < 2; pass++) {
    out.sort((a, b) => a.y - b.y);
    for (let i = 0; i < out.length; i++) {
      const base = new Float32Array(bg);
      for (let j = 0; j < i; j++) draw(base, out[j], all);
      out[i] = fit(out[i].x, out[i].y, base, out[i]);
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}
