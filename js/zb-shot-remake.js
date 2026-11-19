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
