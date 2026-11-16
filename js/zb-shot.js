/* zb-shot.js -- a screenshot of the game read back: the 640 x 480 frame
   it shows, the place, and each Zoombini by its traits.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js, zb-script.js, zb-feature.js,
   zb-journey.js, zb-snoid.js, zb-puzzle.js and the puzzles' files.

   The game draws in 256 colors and copies sprites pixel for pixel. So a
   screenshot of the screen (not a photo of one) has the exact colors of
   the place's palette. The Windows programs show each color brightened
   (zbWindowsPalette) and through a video card's 6 bits a component. The
   Mac program shows the stored colors. So colors here are compared as 6
   bits a component (zbShotKey), and each palette is tried both ways.

   A screenshot may be the frame enlarged, as an emulator or a browser
   shows it, by a factor that need not be whole, with each pixel copied and
   none blended. Then each line of the screenshot repeats one of the
   frame's, and the lines that differ from the one before mark where a
   frame line begins. zbShotUnscale fits the scale and the start of each
   axis to those marks and reads the frame back.

   A Zoombini is five sprites of ZOOMBINI tBMP 3000, one a part (zb-snoid.js).
   zbShotFindParts tries every pose of every part where the screenshot
   differs from the place's picture. zbShotBestParts chooses the fits that
   explain the frame, and zbShotGroup groups them by where they put the
   Zoombini's origin. A sprite's registration point is where the origin
   falls when the Zoombini stands, and nearly so in its other poses.

   A screenshot enlarged or shrunk with smoothing, as a browser or a forum
   shows a picture, has colors between the palette's and no repeated lines
   (zbShotSmoothed). zbShotSmoothRead compares it in color with each place's
   picture at every scale and offset, coarse to fine (zbShotSmoothAlign),
   samples the frame back at each frame pixel (zbShotSmoothFrame), and
   fits the blur the smoothing left (zbShotBlurFit). A single part is too
   blurred to read there, so zbShotSmoothZoombinis draws whole Zoombinis
   in the poses the scripts draw (zbShotPoses), blurred the same way, and
   chooses the traits whose drawing fits.
*/

const ZB_SHOT_W = 640, ZB_SHOT_H = 480;

/* A color as a VGA shows it, 6 bits a component, as one number. */
function zbShotKey(r, g, b) { return ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2); }

/* A palette's 256 colors as keys, as stored or as Windows shows them. */
function zbShotPaletteKeys(pal, windows) {
  const p = windows ? zbWindowsPalette(pal) : pal;
  return Int32Array.from(p, c => zbShotKey(c[0], c[1], c[2]));
}

/* One axis of an enlarged frame: `differs[j]` is 1 where line j of the
   screenshot differs from line j - 1. The screenshot's line j shows the
   frame's line floor((j + phase) / scale), counted from the first line it
   shows. A miss is a line that differs inside one frame line, which a clean
   enlargement never has. Two frame lines alike start a frame line on a line
   that does not differ, which happens, but seldom. The best fit has the
   fewest of the two together. Two frame lines alike make the runs fewer, so the
   screenshot's length over its runs is a little over the scale, and the
   search starts there. Returns { scale, phase, lines, misses, alike }. */
function zbShotFitAxis(differs) {
  const n = differs.length;
  let runs = 1;
  for (let j = 1; j < n; j++) runs += differs[j];
  let best = null;
  const score = (s, ph) => {
    let misses = 0, alike = 0, prev = Math.floor(ph / s + 1e-9);
    for (let j = 1; j < n; j++) {
      const src = Math.floor((j + ph) / s + 1e-9);
      if (src === prev) { if (differs[j]) misses++; }
      else if (!differs[j]) alike++;
      if (best && misses + alike > best.misses + best.alike) return null;
      prev = src;
    }
    return { scale: s, phase: ph, misses, alike };
  };
  const better = r => r && (!best || r.misses + r.alike < best.misses + best.alike);
  const search = (from, to, step, phaseStep) => {
    for (let s = Math.max(1, from); s <= to; s += step) {
      for (let ph = 0; ph < s; ph += phaseStep) {
        const r = score(s, ph);
        if (better(r)) best = r;
      }
    }
  };
  const top = n / runs;
  best = score(1, 0);
  search(top * 0.97, top * 1.003, 0.0002, 1 / 16);
  search(best.scale - 0.0003, best.scale + 0.0003, 0.00001, 1 / 64);
  best.lines = Math.floor((n - 1 + best.phase) / best.scale + 1e-9) + 1;
  return best;
}

/* The part of the frame a screenshot shows: `rgba` its pixels, `width` x
   `height`. Returns { width, height, keys, scaleX, scaleY, misses } with
   `keys` the frame's colors as zbShotKey gives them, `width` x `height` of
   them, and `misses` the lines that broke the fit (0 or nearly for a clean
   enlargement). Where that part lies in the frame is zbShotAlign's to find. */
function zbShotUnscale(rgba, width, height) {
  const key = i => zbShotKey(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
  const colDiff = new Uint8Array(width), rowDiff = new Uint8Array(height);
  for (let x = 1; x < width; x++) {
    for (let y = 0; y < height; y++) if (key(y * width + x) !== key(y * width + x - 1)) { colDiff[x] = 1; break; }
  }
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) if (key(y * width + x) !== key((y - 1) * width + x)) { rowDiff[y] = 1; break; }
  }
  const fx = zbShotFitAxis(colDiff), fy = zbShotFitAxis(rowDiff);
  const w = fx.lines, h = fy.lines, keys = new Int32Array(w * h);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor((y + fy.phase) / fy.scale + 1e-9);
    for (let x = 0; x < width; x++) keys[sy * w + Math.floor((x + fx.phase) / fx.scale + 1e-9)] = key(y * width + x);
  }
  return { width: w, height: h, keys, scaleX: fx.scale, scaleY: fy.scale, misses: fx.misses + fy.misses };
}

/* Where the part a screenshot shows lies on a place's picture: `picture`
   640 x 480 indices, `palKeys` zbShotPaletteKeys's. Every offset with
   the part inside the frame is tried on a sparse sample of pixels,
   the best few on a closer one, and the best of those in full. Returns { dx, dy, fit, keys }: `fit` the share of the
   part's pixels that are the picture's, `keys` the 640 x 480 frame with
   -1 where the screenshot does not show it. */
function zbShotAlign(shot, picture, palKeys) {
  const W = ZB_SHOT_W, H = ZB_SHOT_H, w = Math.min(shot.width, W), h = Math.min(shot.height, H);
  const fit = (dx, dy, step) => {
    let n = 0, same = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = (y * 3) % step; x < w; x += step) {
        n++;
        if (shot.keys[y * shot.width + x] === palKeys[picture[(y + dy) * W + x + dx]]) same++;
      }
    }
    return n ? same / n : 0;
  };
  /* every offset on a sparse sample, then the best few on a closer one */
  const offsets = [];
  const sparse = Math.max(7, Math.floor(Math.sqrt(w * h / 400)));
  for (let dy = 0; dy <= H - h; dy++) for (let dx = 0; dx <= W - w; dx++) offsets.push({ dx, dy, fit: fit(dx, dy, sparse) });
  offsets.sort((a, b) => b.fit - a.fit);
  let best = { dx: 0, dy: 0, fit: -1 };
  for (const o of offsets.slice(0, 16)) {
    const f = fit(o.dx, o.dy, 7);
    if (f > best.fit) best = { dx: o.dx, dy: o.dy, fit: f };
  }
  const keys = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) keys[(y + best.dy) * W + x + best.dx] = shot.keys[y * shot.width + x];
  return { dx: best.dx, dy: best.dy, fit: fit(best.dx, best.dy, 1), keys };
}

/* Which pixels differ from the picture: 1 where the frame shows something
   over it. */
function zbShotForeground(keys, picture, palKeys) {
  const fg = new Uint8Array(keys.length);
  for (let i = 0; i < keys.length; i++) fg[i] = keys[i] >= 0 && keys[i] !== palKeys[picture[i]] ? 1 : 0;
  return fg;
}

/* Every sprite of a Zoombini's parts: [{ part, value, pose, facing, frame }]. */
function zbShotPartSprites(blocks = ZB_SNOID_BLOCKS) {
  const out = [];
  for (const part of ['body', 'hair', 'eyes', 'nose', 'feet']) {
    const values = part === 'body' ? [1] : [1, 2, 3, 4, 5];
    for (const value of values) {
      const v = part === 'body' ? 0 : value - 1;
      for (let pose = 1; pose <= blocks[part].poses[v]; pose++) {
        for (const facing of [0, 1]) out.push({ part, value, pose, facing, frame: zbSnoidFrame(part, value, pose, facing, blocks) });
      }
    }
  }
  return out;
}

/* How a sprite placed with its top left at (x0, y0) fits the frame:
   { matched, known, pixels }, `known` the sprite's pixels the screenshot
   shows and `matched` those of them the same. `pts` is zbShotPoints's. */
function zbShotPoints(f, palKeys) {
  const pts = [];
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const v = f.pixels[y * f.width + x];
      if (v) pts.push(x, y, palKeys[v]);
    }
  }
  return pts;
}
function zbShotSpriteFit(keys, pts, x0, y0) {
  let matched = 0, known = 0;
  for (let p = 0; p < pts.length; p += 3) {
    const x = x0 + pts[p], y = y0 + pts[p + 1];
    if (x < 0 || y < 0 || x >= ZB_SHOT_W || y >= ZB_SHOT_H) continue;
    const k = keys[y * ZB_SHOT_W + x];
    if (k < 0) continue;
    known++;
    if (k === pts[p + 2]) matched++;
  }
  return { matched, known, pixels: pts.length / 3 };
}

/* Where each sprite of the parts fits the frame. A sprite fits where the
   screenshot shows at least half of it, at least `share` of what it shows
   is the frame's, at least 12 pixels, and it covers some pixel that
   differs from the picture. Returns [{ part, value, pose, facing, frame,
   x, y, ox, oy, matched, known, pixels }]: (x, y) its top left, (ox, oy)
   the Zoombini's origin it gives. */
function zbShotFindParts(keys, fg, sheet, palKeys, share = 0.6) {
  const W = ZB_SHOT_W, H = ZB_SHOT_H;
  /* the foreground's pixels by color, to start each search from */
  const byKey = new Map();
  for (let i = 0; i < keys.length; i++) {
    if (!fg[i]) continue;
    if (!byKey.has(keys[i])) byKey.set(keys[i], []);
    byKey.get(keys[i]).push(i);
  }
  const found = [];
  for (const s of zbShotPartSprites(sheet.blocks)) {
    const f = sheet.frames[s.frame], pts = zbShotPoints(f, palKeys), n = pts.length / 3;
    if (n < 6) continue;
    /* anchors: the sprite's pixels of the rarest colors in the foreground,
       one from each third of it, so that a sprite partly covered is still
       found from one of them */
    const anchors = [];
    for (let third = 0; third < 3; third++) {
      let bestK = -1, bestCount = Infinity;
      for (let k = Math.floor(third * n / 3); k < Math.floor((third + 1) * n / 3); k++) {
        const c = (byKey.get(pts[3 * k + 2]) || []).length;
        if (c && c < bestCount) { bestCount = c; bestK = k; }
      }
      if (bestK >= 0) anchors.push(bestK);
    }
    const tried = new Set();
    for (const k of anchors) {
      const ax = pts[3 * k], ay = pts[3 * k + 1];
      for (const i of byKey.get(pts[3 * k + 2]) || []) {
        const x0 = (i % W) - ax, y0 = Math.floor(i / W) - ay;
        if (x0 + f.width <= 0 || y0 + f.height <= 0 || x0 >= W || y0 >= H) continue;
        const at = (y0 + 1024) * 4096 + (x0 + 1024);
        if (tried.has(at)) continue;
        tried.add(at);
        const fit = zbShotSpriteFit(keys, pts, x0, y0);
        if (fit.known * 2 < n || fit.matched < share * fit.known || fit.matched < 12) continue;
        found.push({ ...s, x: x0, y: y0, ox: x0 + sheet.xs[s.frame + 1], oy: y0 + sheet.ys[s.frame + 1], ...fit });
      }
    }
  }
  return found;
}

/* The fits that explain the frame, taken greedily: the fit that matches
   the most pixels first, then each fit that shows at least 12 pixels, and
   at least half of those it matches, that no fit before it showed. A
   second pose that fits the same part a few pixels off shows mostly what
   the first showed, and so drops out. */
function zbShotBestParts(found, keys, sheet, palKeys) {
  const sorted = found.slice().sort((a, b) => b.matched - a.matched || (a.known - a.matched) - (b.known - b.matched));
  const shown = new Uint8Array(keys.length), pts = new Map(), best = [];
  for (const d of sorted) {
    if (!pts.has(d.frame)) pts.set(d.frame, zbShotPoints(sheet.frames[d.frame], palKeys));
    const p = pts.get(d.frame), mine = [];
    for (let i = 0; i < p.length; i += 3) {
      const x = d.x + p[i], y = d.y + p[i + 1];
      if (x < 0 || y < 0 || x >= ZB_SHOT_W || y >= ZB_SHOT_H) continue;
      const o = y * ZB_SHOT_W + x;
      if (keys[o] === p[i + 2] && !shown[o]) mine.push(o);
    }
    if (mine.length < 12 || mine.length * 2 < d.matched) continue;
    for (const o of mine) shown[o] = 1;
    best.push(d);
  }
  return best;
}

/* Parts grouped into Zoombinis by the origin they give: [{ x, y, parts:
   { body, hair, eyes, nose, feet }, traits: { hair, eyes, nose, feet }
   (null where that part was not found) }], from the top of the screen
   down. A group of fewer than three parts is a chance fit of a small
   sprite, which this drops. */
function zbShotGroup(parts, radius = 6) {
  const order = ['body', 'hair', 'eyes', 'feet', 'nose'];
  const sorted = parts.slice().sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part) || b.matched - a.matched);
  const groups = [];
  for (const p of sorted) {
    let best = null, bestD = Infinity;
    for (const g of groups) {
      if (g.parts[p.part]) continue;
      const d = Math.hypot(g.x - p.ox, g.y - p.oy);
      if (d <= radius && d < bestD) { best = g; bestD = d; }
    }
    if (best) best.parts[p.part] = p;
    else if (p.part === 'body' || p.part === 'hair') groups.push({ x: p.ox, y: p.oy, parts: { [p.part]: p } });
  }
  const kept = groups.filter(g => Object.keys(g.parts).length >= 3);
  for (const g of kept) {
    g.traits = {};
    for (const k of ZB_SHOT_TRAITS) g.traits[k] = g.parts[k] ? g.parts[k].value : null;
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}
const ZB_SHOT_TRAITS = ['hair', 'eyes', 'nose', 'feet'];

/* A trait whose part is mostly hidden, read from what shows of it: every
   pose of the part placed so that it gives the Zoombini's origin, within
   `slack` pixels. A sprite's pixel the frame shows counts for it, one where
   the frame shows the bare picture counts twice against it, and one under
   something else counts neither way. So does one that a part already
   found shows, since those colors are everywhere in a crowd. Each value
   scores its best pose. The best value is inferred when it matches at
   least 6 pixels and scores at least twice the next. Sets
   `inferred[part]` = { value, matched, next } on each group, and the
   trait. */
function zbShotInferHidden(keys, fg, groups, sheet, palKeys, slack = 2) {
  const sprites = zbShotPartSprites(sheet.blocks).filter(s => s.part !== 'body');
  const pts = new Map(), points = f => {
    if (!pts.has(f)) pts.set(f, zbShotPoints(sheet.frames[f], palKeys));
    return pts.get(f);
  };
  /* the pixels the parts found show */
  const shown = new Uint8Array(keys.length);
  for (const g of groups) {
    for (const part of Object.values(g.parts)) {
      const p = points(part.frame);
      for (let i = 0; i < p.length; i += 3) {
        const x = part.x + p[i], y = part.y + p[i + 1];
        if (x < 0 || y < 0 || x >= ZB_SHOT_W || y >= ZB_SHOT_H) continue;
        if (keys[y * ZB_SHOT_W + x] === p[i + 2]) shown[y * ZB_SHOT_W + x] = 1;
      }
    }
  }
  const fit = (p, x0, y0) => {
    let matched = 0, bare = 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = x0 + p[i], y = y0 + p[i + 1];
      if (x < 0 || y < 0 || x >= ZB_SHOT_W || y >= ZB_SHOT_H) continue;
      const o = y * ZB_SHOT_W + x;
      if (keys[o] < 0 || shown[o]) continue;
      if (keys[o] === p[i + 2]) matched++;
      else if (!fg[o]) bare++;
    }
    return { matched, score: matched - 2 * bare };
  };
  for (const g of groups) {
    g.inferred = {};
    for (const part of ZB_SHOT_TRAITS) {
      if (g.traits[part] != null) continue;
      const scores = Array(6).fill(-Infinity), matches = Array(6).fill(0);
      for (const s of sprites) {
        if (s.part !== part) continue;
        const x0 = g.x - sheet.xs[s.frame + 1], y0 = g.y - sheet.ys[s.frame + 1];
        for (let dy = -slack; dy <= slack; dy++) {
          for (let dx = -slack; dx <= slack; dx++) {
            const f = fit(points(s.frame), x0 + dx, y0 + dy);
            if (f.score > scores[s.value]) { scores[s.value] = f.score; matches[s.value] = f.matched; }
          }
        }
      }
      const [first, second] = [1, 2, 3, 4, 5].sort((a, b) => scores[b] - scores[a]);
      if (matches[first] >= 6 && scores[first] >= 2 * Math.max(1, scores[second])) {
        g.inferred[part] = { value: first, matched: matches[first], next: second };
        g.traits[part] = first;
      }
    }
  }
}

/* The archives whose pictures a screenshot may show, with a name for each:
   the places, the map (RODMAP, or MAP in the European layout) and the
   passages between places. */
const ZB_SHOT_PLACES = [...ZB_PLACES.map(p => ({ key: p.key, name: p.name })),
  { key: 'RODMAP', name: 'the map' }, { key: 'MAP', name: 'the map' }, { key: 'XFER', name: 'a passage between two places' }];
const ZB_SHOT_PLACE_BY_KEY = new Map(ZB_SHOT_PLACES.map(p => [p.key, p]));

/* The pictures an archive may show: [{ id, palette }], every tBMP that is
   one 640 x 480 picture with a palette of the same id. Hotel Dimensia has
   one for each of three sizes of hotel and the Mudball Wall two.
   Zoombiniville's panorama is drawn from a sheet, so it has none. */
const ZB_SHOT_PICTURES = new WeakMap();
function zbShotPictures(arc, key) {
  if (!ZB_SHOT_PLACE_BY_KEY.has(key)) return [];
  if (!ZB_SHOT_PICTURES.has(arc)) {
    const out = [];
    for (const r of arc.list('SHPL')) {
      if (!arc.has('tBMP', r.id)) continue;
      const b = decodeBitmapResource(arc.get('tBMP', r.id));
      if (b.frames.length === 1 && b.frames[0].width === ZB_SHOT_W && b.frames[0].height === ZB_SHOT_H) out.push({ id: r.id, palette: r.id });
    }
    ZB_SHOT_PICTURES.set(arc, out);
  }
  return ZB_SHOT_PICTURES.get(arc);
}

/* ---- a smoothed screenshot ------------------------------------------------ */

/* A screenshot enlarged or shrunk with smoothing, or compressed, has colors
   between the palette's, so it has many more colors than a palette has. */
function zbShotSmoothed(rgba) {
  const seen = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    seen.add(zbShotKey(rgba[i], rgba[i + 1], rgba[i + 2]));
    if (seen.size > 512) return true;
  }
  return false;
}

/* A palette's colors as the screen shows them, [r, g, b] each: brightened
   and through 6 bits a component, as the Windows programs show them, or as
   stored. */
function zbShotPaletteRgb(pal, windows) {
  return windows ? zbWindowsPalette(pal).map(c => [0, 1, 2].map(k => ((c[k] >> 2) << 2) | (c[k] >> 6)))
    : pal.map(c => [c[0], c[1], c[2]]);
}

/* A place's picture in color, each pixel the mean of the `f` x `f` frame
   pixels it covers: { w, h, f, rgb }. */
function zbShotLevel(pixels, rgb, f) {
  const W = ZB_SHOT_W, H = ZB_SHOT_H, w = W / f, h = H / f, out = new Float32Array(w * h * 3);
  const r = new Float32Array(256), g = new Float32Array(256), b = new Float32Array(256);
  for (let i = 0; i < 256; i++) { r[i] = rgb[i][0]; g[i] = rgb[i][1]; b[i] = rgb[i][2]; }
  for (let y = 0; y < H; y++) {
    const row = ((y / f) | 0) * w;
    for (let x = 0; x < W; x++) {
      const v = pixels[y * W + x], o = 3 * (row + ((x / f) | 0));
      out[o] += r[v]; out[o + 1] += g[v]; out[o + 2] += b[v];
    }
  }
  const n = f * f;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return { w, h, f, rgb: out };
}

/* The screenshot's running sums, so that the mean over any box is four
   lookups. */
function zbShotSums(rgba, width, height) {
  const W = width + 1, s = new Float64Array(W * (height + 1) * 3);
  for (let y = 0; y < height; y++) {
    let r = 0, g = 0, b = 0;
    for (let x = 0; x < width; x++) {
      const i = 4 * (y * width + x), o = 3 * ((y + 1) * W + x + 1), u = o - 3 * W;
      r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
      s[o] = s[u] + r; s[o + 1] = s[u + 1] + g; s[o + 2] = s[u + 2] + b;
    }
  }
  return { s, W, width, height };
}

/* The screenshot's mean color in a box of side 2 x `r` around each point.
   When `r` is under 1, it is the color of the pixel at the point. `pts`
   are pixel centers. */
function zbShotPointColors(rgba, sums, pts, r) {
  const n = pts.length / 2, out = new Float32Array(3 * n), { s, W, width, height } = sums;
  for (let i = 0; i < n; i++) {
    if (r < 1) {
      const p = 4 * ((pts[2 * i + 1] - 0.5) * width + pts[2 * i] - 0.5);
      out[3 * i] = rgba[p]; out[3 * i + 1] = rgba[p + 1]; out[3 * i + 2] = rgba[p + 2];
      continue;
    }
    const x0 = Math.max(0, Math.round(pts[2 * i] - r)), x1 = Math.min(width, Math.round(pts[2 * i] + r));
    const y0 = Math.max(0, Math.round(pts[2 * i + 1] - r)), y1 = Math.min(height, Math.round(pts[2 * i + 1] + r));
    const a = 3 * (y0 * W + x0), b = 3 * (y0 * W + x1), c = 3 * (y1 * W + x0), d = 3 * (y1 * W + x1), area = (x1 - x0) * (y1 - y0);
    for (let k = 0; k < 3; k++) out[3 * i + k] = (s[d + k] - s[b + k] - s[c + k] + s[a + k]) / area;
  }
  return out;
}

/* How far the screenshot's colors at `pts` (`colors`) are from a level of
   the picture, with screenshot pixel (x, y) at frame point (x / sx + dx,
   y / sy + dy): the mean of each point's distance (the sum over red, green
   and blue), each cut off at `clip` so that what stands over the picture
   counts no more than a fixed amount. */
function zbShotError(level, pts, colors, sx, sy, dx, dy, clip, bound = Infinity) {
  const abs = Math.abs;
  const { w, h, f, rgb } = level, n = pts.length / 2, stop = bound * n;
  let e = 0;
  for (let i = 0; i < n; i++) {
    let u = (pts[2 * i] / sx + dx) / f - 0.5, v = (pts[2 * i + 1] / sy + dy) / f - 0.5;
    if (u < 0) u = 0; else if (u > w - 1.001) u = w - 1.001;
    if (v < 0) v = 0; else if (v > h - 1.001) v = h - 1.001;
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, o = 3 * (y0 * w + x0), o2 = o + 3 * w;
    let d = 0;
    for (let k = 0; k < 3; k++) {
      const a = rgb[o + k] + (rgb[o + 3 + k] - rgb[o + k]) * fx, b = rgb[o2 + k] + (rgb[o2 + 3 + k] - rgb[o2 + k]) * fx;
      d += abs(a + (b - a) * fy - colors[3 * i + k]);
    }
    e += d < clip ? d : clip;
    if (e > stop) return Infinity;
  }
  return e / n;
}

/* `n` points of the screenshot, pixel centers at least `margin` from its
   edges, the same ones every time. */
function zbShotSamplePoints(width, height, n, margin) {
  let seed = 12345;
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  const pts = new Float32Array(2 * n), m = Math.min(margin, width / 4, height / 4);
  for (let i = 0; i < n; i++) {
    pts[2 * i] = Math.floor(m + next() * (width - 2 * m)) + 0.5;
    pts[2 * i + 1] = Math.floor(m + next() * (height - 2 * m)) + 0.5;
  }
  return pts;
}

/* Where a smoothed screenshot lies on one place's picture, and at what
   scale: { sx, sy, dx, dy, error }, screenshot pixel (x, y) showing frame
   point (x / sx + dx, y / sy + dy), and `error` zbShotError's at full size.
   The search runs at three sizes. On the picture shrunk 16 times, every
   scale from the one that fits the screenshot in the frame up to 4, 3%
   apart, and every offset 8 frame pixels apart are tried, with the
   screenshot averaged over boxes of the same size. The best 24 go on to
   the picture shrunk 4 times, and the best of those to full size, where
   each of the four numbers moves until no move brings the error down. */
function zbShotSmoothAlign(rgba, sums, width, height, levels) {
  const abs = Math.abs;
  const sMin = Math.max(width / ZB_SHOT_W, height / ZB_SHOT_H), sMax = Math.min(4, width / 80, height / 60);
  if (sMax < sMin) return null;
  const pts = zbShotSamplePoints(width, height, 200, 8 * sMax);
  const found = [];
  for (let s = sMin; s <= sMax * 1.0001; s *= 1.03) {
    const colors = zbShotPointColors(rgba, sums, pts, 8 * s);
    const fw = width / s, fh = height / s, xs = [], ys = [];
    for (let d = 0; d < ZB_SHOT_W - fw; d += 8) xs.push(d);
    xs.push(Math.max(0, ZB_SHOT_W - fw));
    for (let d = 0; d < ZB_SHOT_H - fh; d += 8) ys.push(d);
    ys.push(Math.max(0, ZB_SHOT_H - fh));
    let first = { error: Infinity }, second = { error: Infinity };
    for (const dy of ys) {
      for (const dx of xs) {
        const error = zbShotError(levels[16], pts, colors, s, s, dx, dy, 60, second.error);
        if (error < first.error) { second = first; first = { s, dx, dy, error }; }
        else if (error < second.error) second = { s, dx, dy, error };
      }
    }
    for (const c of [first, second]) if (c.error < Infinity) found.push(c);
  }
  found.sort((a, b) => a.error - b.error);
  const distinct = (list, c, ds, dd) => !list.some(o => abs(o.s / c.s - 1) < ds && abs(o.dx - c.dx) < dd && abs(o.dy - c.dy) < dd);
  const starts = [];
  for (const c of found) if (starts.length < 24 && distinct(starts, c, 0.05, 16)) starts.push(c);
  const mids = [];
  for (const c of starts) {
    for (let k = -4; k <= 4; k++) {
      const s = c.s * (1 + k * 0.0075), colors = zbShotPointColors(rgba, sums, pts, 2 * s);
      for (let dy = c.dy - 12; dy <= c.dy + 12; dy += 2) {
        for (let dx = c.dx - 12; dx <= c.dx + 12; dx += 2) mids.push({ s, dx, dy, error: zbShotError(levels[4], pts, colors, s, s, dx, dy, 60) });
      }
    }
  }
  mids.sort((a, b) => a.error - b.error);
  const fine = zbShotSamplePoints(width, height, 2000, 2);
  const colors = zbShotPointColors(rgba, sums, fine, 0);
  const at = p => zbShotError(levels[1], fine, colors, p.sx, p.sy, p.dx, p.dy, 90);
  let best = null;
  const tried = [];
  for (const m of mids) {
    if (tried.length >= 3) break;
    if (!distinct(tried, m, 0.01, 4)) continue;
    tried.push(m);
    let p = { sx: m.s, sy: m.s, dx: m.dx, dy: m.dy };
    p.error = at(p);
    const steps = { sx: 0.004 * m.s, sy: 0.004 * m.s, dx: 2, dy: 2 };
    for (let round = 0; round < 8; round++) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const k of ['sx', 'sy', 'dx', 'dy']) {
          for (const sign of [1, -1]) {
            const q = { ...p, [k]: p[k] + sign * steps[k] };
            q.error = at(q);
            if (q.error < p.error) { p = q; moved = true; }
          }
        }
      }
      for (const k in steps) steps[k] /= 2;
    }
    if (!best || p.error < best.error) best = p;
  }
  return best;
}

/* A color histogram, 4 bits a component, of `n` colors that `get(i, out)`
   puts in `out`, as shares that sum to 1. */
function zbShotHistogram(n, get) {
  const hist = new Float32Array(4096), c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    get(i, c);
    hist[((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4)] += 1 / n;
  }
  return hist;
}

/* The frame as a smoothed screenshot shows it, at the place `a`
   (zbShotSmoothAlign's) found: each frame pixel's center sampled from the
   screenshot, between its pixels, as red, green and blue, 640 x 480 of
   them, NaN where the screenshot does not show the frame. */
function zbShotSmoothFrame(rgba, width, height, a) {
  const frame = new Float32Array(ZB_SHOT_W * ZB_SHOT_H * 3).fill(NaN);
  for (let Y = 0; Y < ZB_SHOT_H; Y++) {
    const v = (Y + 0.5 - a.dy) * a.sy - 0.5;
    if (v < 0 || v > height - 1) continue;
    const y0 = Math.min(Math.floor(v), height - 2), fy = v - y0;
    for (let X = 0; X < ZB_SHOT_W; X++) {
      const u = (X + 0.5 - a.dx) * a.sx - 0.5;
      if (u < 0 || u > width - 1) continue;
      const x0 = Math.min(Math.floor(u), width - 2), fx = u - x0, o = 4 * (y0 * width + x0), o2 = o + 4 * width;
      for (let k = 0; k < 3; k++) {
        const top = rgba[o + k] + (rgba[o + 4 + k] - rgba[o + k]) * fx, bottom = rgba[o2 + k] + (rgba[o2 + 4 + k] - rgba[o2 + k]) * fx;
        frame[3 * (Y * ZB_SHOT_W + X) + k] = top + (bottom - top) * fy;
      }
    }
  }
  return frame;
}

/* The frame as keys (zbShotKey's): each pixel the nearest of the
   palette's colors 10 to 245 within `tolerance` (the sum over red, green
   and blue), or -1 where none is that near or the frame is not shown. */
function zbShotSmoothKeys(frame, rgb, palKeys, tolerance) {
  const abs = Math.abs;
  const keys = new Int32Array(ZB_SHOT_W * ZB_SHOT_H).fill(-1), nearest = new Map();
  for (let i = 0; i < keys.length; i++) {
    if (frame[3 * i] !== frame[3 * i]) continue;
    const c = [Math.round(frame[3 * i]), Math.round(frame[3 * i + 1]), Math.round(frame[3 * i + 2])];
    const at = (c[0] << 16) | (c[1] << 8) | c[2];
    if (!nearest.has(at)) {
      let best = -1, bestD = tolerance + 1;
      for (let j = 10; j < 246; j++) {
        const d = abs(rgb[j][0] - c[0]) + abs(rgb[j][1] - c[1]) + abs(rgb[j][2] - c[2]);
        if (d < bestD) { bestD = d; best = j; }
      }
      nearest.set(at, best);
    }
    const j = nearest.get(at);
    if (j >= 0) keys[i] = palKeys[j];
  }
  return keys;
}

/* The blur the smoothing leaves on the frame, as the share `blur` of a
   pixel's color that spreads to each neighbor across and down (a 3 x 3 kernel
   of [b, 1 - 2b, b] across times the same down), fitted where the frame
   shows the place's picture: the blur from 0 to 0.3 whose picture is
   nearest the frame at the 40th of every 100 points sampled, nearest
   first, since the points under what stands over the picture are the
   farthest. Returns { blur, spread }, `spread` that 40th point's distance. */
function zbShotBlurFit(frame, pixels, rgb) {
  const abs = Math.abs;
  const pts = [];
  for (let Y = 1; Y < ZB_SHOT_H - 1; Y += 3) {
    for (let X = 1; X < ZB_SHOT_W - 1; X += 3) if (!Number.isNaN(frame[3 * (Y * ZB_SHOT_W + X)])) pts.push(Y * ZB_SHOT_W + X);
  }
  let best = null;
  for (let b = 0; b <= 0.3001; b += 0.025) {
    const e = pts.map(i => {
      let d = 0;
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (let j = -1; j <= 1; j++) for (let x = -1; x <= 1; x++) v += (x ? b : 1 - 2 * b) * (j ? b : 1 - 2 * b) * rgb[pixels[i + j * ZB_SHOT_W + x]][k];
        d += abs(v - frame[3 * i + k]);
      }
      return d;
    }).sort((p, q) => p - q);
    const spread = e.length ? e[Math.floor(0.4 * e.length)] : Infinity;
    if (!best || spread < best.spread) best = { blur: b, spread };
  }
  return best;
}

/* The color each opaque pixel of an indexed image shows once blurred as
   the frame is (zbShotBlurFit's `blur`), where at most `room` of its
   weight would fall on clear pixels and the color those show is unknown:
   [x, y, r, g, b, index, flat] each, `flat` 1 where its 3 x 3 is one
   color. */
function zbShotBlurred(img, rgb, blur, room = 0.13) {
  const { width, height, pixels } = img, out = [];
  const at = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : pixels[y * width + x];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = at(x, y);
      if (!v) continue;
      let r = 0, g = 0, b = 0, clear = 0, flat = 1;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const w = (i ? blur : 1 - 2 * blur) * (j ? blur : 1 - 2 * blur), n = at(x + i, y + j);
          if (n !== v) flat = 0;
          if (!n) { clear += w; continue; }
          r += w * rgb[n][0]; g += w * rgb[n][1]; b += w * rgb[n][2];
        }
      }
      if (clear > room) continue;
      out.push(x, y, r / (1 - clear), g / (1 - clear), b / (1 - clear), v, flat);
    }
  }
  return out;
}

/* Where the frame shows the place's picture: 1 where the frame is within
   `tolerance` of the picture blurred as zbShotBlurFit found. */
function zbShotBare(frame, pixels, rgb, blur, tolerance) {
  const abs = Math.abs;
  const bare = new Uint8Array(ZB_SHOT_W * ZB_SHOT_H);
  for (let Y = 1; Y < ZB_SHOT_H - 1; Y++) {
    for (let X = 1; X < ZB_SHOT_W - 1; X++) {
      const i = Y * ZB_SHOT_W + X;
      if (frame[3 * i] !== frame[3 * i]) continue;
      let d = 0;
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (let j = -1; j <= 1; j++) for (let x = -1; x <= 1; x++) v += (x ? blur : 1 - 2 * blur) * (j ? blur : 1 - 2 * blur) * rgb[pixels[i + j * ZB_SHOT_W + x]][k];
        d += abs(v - frame[3 * i + k]);
      }
      bare[i] = d <= tolerance ? 1 : 0;
    }
  }
  return bare;
}

/* Every pose of a Zoombini in a place, from the ticks of the Zoombini
   snoid scripts in ZOOMBINI and the place's archive. Ticks alike in the
   body, hair and nose (where each is drawn from the body, the layer order
   and the facing) are one `family`, and its poses are every eyes the
   family's ticks draw with every feet they draw. Some scripts are written
   for one kind of feet, and the same pose for other feet is another
   script's. A blink closes the eyes, and wide eyes closed look much like
   sleepy eyes open. Returns { poses, families, grids }: a pose is { tick,
   body, facing, family, from, e, f }, `tick` made with the family's eyes
   e and feet f, `body` the body's record, which a reading places, and
   `from` the script of the family's first tick. A family's grid has its
   poses by eyes, then feet. */
const ZB_SHOT_POSES = new Map();
function zbShotPoses(archives, place) {
  if (ZB_SHOT_POSES.has(place)) return ZB_SHOT_POSES.get(place);
  const groups = new Map();
  for (const name of ['ZOOMBINI', place]) {
    const arc = archives.get(name);
    if (!arc) continue;
    for (const { id } of arc.list('SCRS')) {
      const script = parseScript(arc.get('SCRS', id), 'SCRS');
      if (script.layout !== 0 && script.layout !== 1) continue;
      for (const facing of [0, 1]) {
        for (const tick of zbSnoidTicks(script, facing, name)) {
          const parts = zbSnoidParts(tick);
          if (parts.length !== 5) continue;
          const body = parts.find(p => p.part === 'body');
          const where = p => `${p.shape}:${p.x - body.x},${p.y - body.y}`;
          const family = parts.filter(p => p.part !== 'feet' && p.part !== 'eyes').map(p => p.part + where(p)).join(' ')
            + ` ${tick.layout} ${tick.facing}`;
          if (!groups.has(family)) groups.set(family, { tick, parts, body, from: `${name} SCRS ${id}`, eyes: new Map(), feet: new Map() });
          const g = groups.get(family);
          for (const kind of ['eyes', 'feet']) {
            const p = parts.find(q => q.part === kind);
            g[kind].set(where(p), { shape: p.shape, dx: p.x - body.x, dy: p.y - body.y });
          }
        }
      }
    }
  }
  const poses = [], families = new Map(), grids = new Map();
  for (const [family, g] of groups) {
    const at = kind => g.parts.findIndex(p => p.part === kind);
    const eyesAt = at('eyes'), feetAt = at('feet'), bodyRec = g.tick.records[at('body')];
    const grid = [...g.eyes.values()].map((e, ei) => [...g.feet.values()].map((f, fi) => {
      const records = g.tick.records.map((r, k) => k === eyesAt ? { ...r, shape: e.shape, x: bodyRec.x + e.dx, y: bodyRec.y + e.dy }
        : k === feetAt ? { ...r, shape: f.shape, x: bodyRec.x + f.dx, y: bodyRec.y + f.dy } : r);
      poses.push({ tick: { ...g.tick, records }, body: g.body, facing: g.tick.facing, family, from: g.from, e: ei, f: fi });
      return poses.length - 1;
    }));
    grids.set(family, grid);
    families.set(family, grid.flat());
  }
  const out = { poses, families, grids };
  ZB_SHOT_POSES.set(place, out);
  return out;
}

/* The poses to try when a trait changes, from pose `pi`: the eyes or the
   feet each pose its family has for them, the other kept, and for hair
   and nose the pose itself. */
function zbShotPoseChoices(poses, grids, pi, kind) {
  const p = poses[pi], grid = grids.get(p.family);
  if (kind === 'eyes') return grid.map(row => row[p.f]);
  if (kind === 'feet') return grid[p.e];
  return [pi];
}

/* How well each body sprite (`bodies`, zbShotBlurred's points minus the
   registration point) fits with its record at every second pixel off the
   bare picture: a pixel within `tolerance` counts 1 and one over the bare
   picture -2. A place where every fourth point counts under a quarter of
   30 is passed over. Returns { bodyAt, bodyOf }, the best count at each pixel and
   which body gave it. */
function zbShotBodyScan(frame, bare, bodies, tolerance) {
  const W = ZB_SHOT_W, H = ZB_SHOT_H;
  const bodyAt = new Float32Array(W * H).fill(-1e9), bodyOf = new Int16Array(W * H).fill(-1);
  for (let bi = 0; bi < bodies.length; bi++) {
    const b = bodies[bi].pts, n = b.length / 7, bx = new Int16Array(n), by = new Int16Array(n), bc = new Float32Array(3 * n);
    for (let p = 0; p < n; p++) {
      bx[p] = b[7 * p]; by[p] = b[7 * p + 1];
      bc[3 * p] = b[7 * p + 2]; bc[3 * p + 1] = b[7 * p + 3]; bc[3 * p + 2] = b[7 * p + 4];
    }
    for (let Y = 0; Y < H; Y += 2) {
      for (let X = 0; X < W; X += 2) {
        const i = Y * W + X;
        if (bare[i] || frame[3 * i] !== frame[3 * i]) continue;
        if (4 * zbShotBodyCount(frame, bare, bx, by, bc, n, X, Y, tolerance, 4) < 30) continue;
        const v = zbShotBodyCount(frame, bare, bx, by, bc, n, X, Y, tolerance, 1);
        if (v > bodyAt[i]) { bodyAt[i] = v; bodyOf[i] = bi; }
      }
    }
  }
  return { bodyAt, bodyOf };
}
function zbShotBodyCount(frame, bare, bx, by, bc, n, X, Y, tolerance, step) {
  const W = ZB_SHOT_W, H = ZB_SHOT_H, abs = Math.abs;
  let v = 0;
  for (let p = 0; p < n; p += step) {
    const x = X + bx[p], y = Y + by[p];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const q = y * W + x, o = 3 * q, r = frame[o];
    if (r !== r) continue;
    if (abs(r - bc[3 * p]) + abs(frame[o + 1] - bc[3 * p + 1]) + abs(frame[o + 2] - bc[3 * p + 2]) <= tolerance) v++;
    else if (bare[q]) v -= 2;
  }
  return v;
}

/* Zoombinis in a smoothed frame, drawn whole and compared. A candidate is
   a pose (zbShotPoses's), a place for its body's record and four traits.
   Its look is the Zoombini drawn in that pose and blurred as the frame is
   (zbShotBlurred). A pixel of the look within `tolerance` of the frame
   counts for it, unless the frame there shows the bare picture
   (zbShotBare), as a dark outline on a dark floor would. One that is not
   within it counts against it, twice where the frame shows the bare
   picture, and one under a Zoombini already read counts neither way.

   Candidates come from bodies, and from noses, eyes, hair and feet, each
   sprite blurred and fitted where it matches 60% of what shows of it. A
   part found gives its body's place through every family of poses that
   draws it. The best candidates have their traits chosen one at a time:
   a trait's five values are tried, the eyes and feet with each pose the
   family has for them (zbShotPoseChoices). The best of all is read when
   55% of what shows of it counts for it. It then covers what it shows,
   and the rest are tried again, until none is good enough. Then the
   place's standing places (`env.stands`, zbShotStands's) are tried the
   same way with a pixel that shows the bare picture counting nothing, as
   it does where a cave's wall stands in front of a Zoombini. Each
   standing place where no part gave a candidate is a candidate in every
   family. A trait is
   read where its best value beats the next by `margin` pixels and left
   null otherwise. Returns [{ x, y, traits, scores, behind, pose, tick,
   body, facing, matched, missed }]: `behind` whether it was read that
   second way, (x, y) the body's record, which for a
   Zoombini standing is its origin, `scores` each trait's five values'
   scores, `pose` the script, and `tick` and `body` the pose. */
function zbShotSmoothZoombinis(env, tolerance, margin = 4) {
  const abs = Math.abs;
  const { frame, bare, sheet, rgb, palKeys, blur, poses, families, grids } = env, W = ZB_SHOT_W, H = ZB_SHOT_H;
  const looks = new Map();
  const look = (z, pi) => {
    const id = zbZoombiniId(z) * 8192 + pi;
    if (!looks.has(id)) {
      const missing = [], placed = zbSnoidPlacements(sheet, z, poses[pi].tick, missing);
      if (missing.length) { looks.set(id, null); return null; }
      const img = zbSnoidCompose(sheet, placed), ox = img.ox + poses[pi].body.x, oy = img.oy + poses[pi].body.y;
      const blurred = zbShotBlurred(img, rgb, blur), all = [];
      const pts = new Float32Array(blurred.length / 7 * 5);
      for (let p = 0, q = 0; p < blurred.length; p += 7, q += 5) {
        pts[q] = blurred[p] - ox; pts[q + 1] = blurred[p + 1] - oy;
        pts[q + 2] = blurred[p + 2]; pts[q + 3] = blurred[p + 3]; pts[q + 4] = blurred[p + 4];
      }
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.pixels[y * img.width + x]) all.push(x - ox, y - oy);
      if (looks.size > 4000) looks.clear();
      looks.set(id, { pts, all: Int16Array.from(all) });
    }
    return looks.get(id);
  };
  const mask = new Uint8Array(W * H);
  let bareCost = 2;
  const score = (z, pi, x, y) => {
    const l = look(z, pi);
    if (!l) return { matched: 0, missed: 0, value: -1e9 };
    let matched = 0, missed = 0;
    for (let p = 0; p < l.pts.length; p += 5) {
      const X = x + l.pts[p], Y = y + l.pts[p + 1];
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = Y * W + X, o = 3 * i;
      if (mask[i] || frame[o] !== frame[o]) continue;
      if (abs(frame[o] - l.pts[p + 2]) + abs(frame[o + 1] - l.pts[p + 3]) + abs(frame[o + 2] - l.pts[p + 4]) <= tolerance) matched += bare[i] ? 0 : 1;
      else missed += bare[i] ? bareCost : 1;
    }
    return { matched, missed, value: matched - missed };
  };
  const descend = (c, passes) => {
    let z = { ...c.z }, pi = c.pi, cur = score(z, pi, c.x, c.y);
    for (let pass = 0; pass < passes; pass++) {
      let moved = false;
      for (const k of ZB_SHOT_TRAITS) {
        for (let v = 1; v <= 5; v++) {
          if (v === z[k]) continue;
          const t = { ...z, [k]: v };
          for (const pj of zbShotPoseChoices(poses, grids, pi, k)) {
            const s = score(t, pj, c.x, c.y);
            if (s.value > cur.value) { z = t; pi = pj; cur = s; moved = true; }
          }
        }
      }
      if (!moved) break;
    }
    return { ...c, z, pi, ...cur };
  };

  /* bodies: each body sprite blurred, at every pixel off the bare picture,
     kept where no place within 3 does better */
  const plain = { hair: 1, eyes: 1, nose: 1, feet: 1 };
  const hyp = new Map();
  const propose = (x, y, pi, z, votes) => {
    const k = `${x},${y},${pi}`;
    if (!hyp.has(k)) hyp.set(k, { x, y, pi, z: { ...plain }, votes: 0 });
    const h = hyp.get(k);
    Object.assign(h.z, z);
    h.votes += votes;
  };
  const bodies = [];
  for (let pose = 1; pose <= sheet.blocks.body.poses[0]; pose++) {
    for (const facing of [0, 1]) {
      const fr = zbSnoidFrame('body', 1, pose, facing, sheet.blocks), pts = zbShotBlurred(sheet.frames[fr], rgb, blur);
      for (let p = 0; p < pts.length; p += 7) { pts[p] -= sheet.xs[fr + 1]; pts[p + 1] -= sheet.ys[fr + 1]; }
      bodies.push({ pose, facing, pts });
    }
  }
  const { bodyAt, bodyOf } = zbShotBodyScan(frame, bare, bodies, tolerance);
  for (let Y = 0; Y < H; Y += 2) {
    for (let X = 0; X < W; X += 2) {
      const i = Y * W + X, v = bodyAt[i];
      if (v < 40) continue;
      let top = true;
      for (let j = -4; j <= 4 && top; j += 2) {
        for (let k = -4; k <= 4; k += 2) {
          const x = X + k, y = Y + j;
          if ((j || k) && x >= 0 && y >= 0 && x < W && y < H && (bodyAt[y * W + x] > v || (bodyAt[y * W + x] === v && (j < 0 || (j === 0 && k < 0))))) { top = false; break; }
        }
      }
      if (!top) continue;
      const b = bodies[bodyOf[i]];
      for (const members of families.values()) {
        const p = poses[members[0]];
        if (p.body.shape === b.pose && p.facing === b.facing) propose(X, Y, members[0], {}, v);
      }
    }
  }

  /* the other parts: each sprite blurred, tried where a pixel of its
     rarest flat color shows off the bare picture */
  const keys = zbShotSmoothKeys(frame, rgb, palKeys, 30), byKey = new Map();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] < 0 || bare[i]) continue;
    if (!byKey.has(keys[i])) byKey.set(keys[i], []);
    byKey.get(keys[i]).push(i);
  }
  /* a part's sprite gives its body's place through each family that
     draws it, once for each place it is drawn at from the body */
  const posesWith = new Map();
  for (const members of families.values()) {
    const seen = new Set();
    for (const pi of members) {
      const p = poses[pi];
      for (const q of zbSnoidParts(p.tick)) {
        if (q.part === 'body') continue;
        const k = `${q.part} ${q.shape} ${p.facing}`, dx = q.x - p.body.x, dy = q.y - p.body.y, once = `${k} ${dx} ${dy}`;
        if (seen.has(once)) continue;
        seen.add(once);
        if (!posesWith.has(k)) posesWith.set(k, []);
        posesWith.get(k).push({ pi: members[0], dx, dy });
      }
    }
  }
  for (const s of zbShotPartSprites(sheet.blocks)) {
    if (s.part === 'body') continue;
    const with_ = posesWith.get(`${s.part} ${s.pose} ${s.facing}`);
    if (!with_) continue;
    const pts = zbShotBlurred(sheet.frames[s.frame], rgb, blur), n = pts.length / 7;
    if (n < 6) continue;
    let anchor = -1, count = Infinity;
    for (let k = 0; k < n; k++) {
      if (!pts[7 * k + 6]) continue;
      const c = (byKey.get(palKeys[pts[7 * k + 5]]) || []).length;
      if (c && c < count) { count = c; anchor = k; }
    }
    if (anchor < 0) continue;
    const tried = new Set();
    for (const i of byKey.get(palKeys[pts[7 * anchor + 5]])) {
      const x0 = (i % W) - pts[7 * anchor], y0 = Math.floor(i / W) - pts[7 * anchor + 1], at = (y0 + 1024) * 4096 + x0 + 1024;
      if (tried.has(at)) continue;
      tried.add(at);
      let matched = 0, known = 0;
      for (let q = 0; q < pts.length; q += 7) {
        const X = x0 + pts[q], Y = y0 + pts[q + 1];
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const o = 3 * (Y * W + X);
        if (frame[o] !== frame[o]) continue;
        known++;
        if (abs(frame[o] - pts[q + 2]) + abs(frame[o + 1] - pts[q + 3]) + abs(frame[o + 2] - pts[q + 4]) <= tolerance) matched++;
      }
      if (known * 2 < n || matched < 0.6 * known || matched < 10) continue;
      const rx = x0 + sheet.xs[s.frame + 1], ry = y0 + sheet.ys[s.frame + 1];
      for (const { pi, dx, dy } of with_) propose(rx - dx, ry - dy, pi, { [s.part]: s.value }, matched);
    }
  }

  /* the best candidate at each place, the best 80 places at least 4
     apart, and their traits */
  /* the place's standing places where no part gave a candidate, in every
     family */
  const stands = env.stands || [], standing = (x, y) => zbShotPlaceIn(stands, x, y) >= 0;
  const near = [...hyp.values()];
  for (let i = 0; i < stands.length; i += 2) {
    const x = stands[i], y = stands[i + 1];
    if (x < 0 || y < 0 || x >= W || y >= H || frame[3 * (y * W + x)] !== frame[3 * (y * W + x)]) continue;
    if (near.some(h => abs(h.x - x) <= 3 && abs(h.y - y) <= 3)) continue;
    for (const members of families.values()) propose(x, y, members[0], {}, 0);
  }
  const atPlace = new Map();
  for (const h of hyp.values()) {
    const s = score(h.z, h.pi, h.x, h.y), k = h.y * W + h.x;
    if (!atPlace.has(k) || s.value > atPlace.get(k).value) atPlace.set(k, { ...h, ...s });
  }
  let cands = [];
  for (const c of [...atPlace.values()].sort((a, b) => b.value - a.value)) {
    if (cands.length >= 120) break;
    if (cands.some(o => abs(o.x - c.x) <= 3 && abs(o.y - c.y) <= 3)) continue;
    cands.push(descend(c, 2));
  }

  /* read the best, cover it, and try the rest again. A candidate that
     fails is tried again only once another is read, since only what that
     one covers changes its score. */
  const read = [];
  let version = 0, behind = false;
  for (;;) {
    for (const o of cands) Object.assign(o, score(o.z, o.pi, o.x, o.y));
    cands.sort((a, b) => b.value - a.value);
    let at = cands.findIndex(o => o.failed !== version && o.matched >= 40 && (!behind || standing(o.x, o.y)));
    if (at < 0 && !behind && stands.length) {
      /* everything in the open is read: the standing places again, with
         the scenery taken to cover what shows the bare picture */
      behind = true;
      bareCost = 0;
      version++;
      continue;
    }
    if (at < 0) break;
    let c = cands[at];
    const body = poses[c.pi].body.shape, facing = poses[c.pi].facing;
    for (const members of families.values()) {
      const pi = members[0];
      if (poses[pi].body.shape !== body || poses[pi].facing !== facing) continue;
      const s = score(c.z, pi, c.x, c.y);
      if (s.value > c.value) c = { ...c, pi, ...s };
    }
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const s = score(c.z, c.pi, c.x + dx, c.y + dy);
        if (s.value > c.value) c = { ...c, x: c.x + dx, y: c.y + dy, ...s };
      }
    }
    c = descend(c, 3);
    if (c.matched < 60 || c.matched < 0.55 * (c.matched + c.missed)) {
      cands[at] = { ...c, failed: version };
      continue;
    }
    const traits = {}, scores = {};
    for (const k of ZB_SHOT_TRAITS) {
      scores[k] = [1, 2, 3, 4, 5].map(v => {
        if (v === c.z[k]) return c.value;
        const t = { ...c.z, [k]: v };
        let best = -Infinity;
        for (const pj of zbShotPoseChoices(poses, grids, c.pi, k)) best = Math.max(best, score(t, pj, c.x, c.y).value);
        return best;
      });
      const second = Math.max(...scores[k].filter((v, i) => i + 1 !== c.z[k]));
      traits[k] = c.value - second >= margin ? c.z[k] : null;
    }
    read.push({ x: c.x, y: c.y, traits, scores, behind, pose: poses[c.pi].from, tick: poses[c.pi].tick, body: poses[c.pi].body,
      facing: poses[c.pi].facing, matched: c.matched, missed: c.missed });
    const { all } = look(c.z, c.pi);
    for (let p = 0; p < all.length; p += 2) {
      const X = c.x + all[p], Y = c.y + all[p + 1];
      if (X >= 0 && Y >= 0 && X < W && Y < H) mask[Y * W + X] = 1;
    }
    version++;
    cands = cands.filter((o, i) => i !== at && Math.hypot(o.x - c.x, o.y - c.y) > 6);
  }
  return read.sort((a, b) => a.y - b.y || a.x - b.x);
}

/* A smoothed screenshot read: where it lies among the places' pictures
   and the Zoombinis in it. The four pictures, in either coloring, whose
   colors are most like the screenshot's (zbShotHistogram, the picture
   shrunk 4 times to smooth it too) are each searched (zbShotSmoothAlign),
   and the one with the least error is taken. Returns { shot, place,
   picture, windows, dx, dy, fit, keys, frame, tolerance, zoombinis } as
   zbShotRead does, or null when no picture fits. `shot` has the part of
   the frame shown, the scales, `smoothed` and `blur`. `fit` is the share
   of the frame shown that is the bare picture, and `place` is null when
   it is under 30%. `frame` is zbShotSmoothFrame's colors, `keys` those
   colors as the nearest of the palette's, and `tolerance` six times the
   spread zbShotBlurFit found, from 30 to 60. */
function zbShotSmoothRead(rgba, width, height, archives) {
  /* a copy, so that every array the search reads is of one kind. Arrays
     of two kinds slow the loops where the pixels came from elsewhere. */
  rgba = new Uint8Array(rgba);
  const step = Math.max(1, Math.floor(width * height / 200000));
  const shotHist = zbShotHistogram(Math.floor(width * height / step), (i, c) => {
    const p = 4 * i * step;
    c[0] = rgba[p]; c[1] = rgba[p + 1]; c[2] = rgba[p + 2];
  });
  const tried = [];
  for (const p of ZB_SHOT_PLACES) {
    const arc = archives.get(p.key);
    if (!arc) continue;
    for (const pic of zbShotPictures(arc, p.key)) {
      const pixels = decodeBitmapResource(arc.get('tBMP', pic.id)).frames[0].pixels;
      const pal = zbPalette(parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL'));
      for (const windows of [true, false]) {
        const rgb = zbShotPaletteRgb(pal, windows), quarter = zbShotLevel(pixels, rgb, 4);
        const hist = zbShotHistogram(quarter.w * quarter.h, (i, c) => {
          c[0] = Math.round(quarter.rgb[3 * i]); c[1] = Math.round(quarter.rgb[3 * i + 1]); c[2] = Math.round(quarter.rgb[3 * i + 2]);
        });
        let alike = 0;
        for (let i = 0; i < 4096; i++) alike += Math.min(hist[i], shotHist[i]);
        tried.push({ place: p.key, picture: pic.id, windows, pixels, pal, rgb, quarter, alike, arc });
      }
    }
  }
  tried.sort((a, b) => b.alike - a.alike);
  /* the other looks (ZB_SHOT_LOOKS): the two whose colors are most like
     the screenshot's, where they are more like it than any bare
     picture's */
  const others = [];
  for (const p of ZB_SHOT_PLACES) {
    const arc = archives.get(p.key);
    if (!arc || !ZB_SHOT_LOOKS[p.key]) continue;
    for (const pic of zbShotPictures(arc, p.key)) {
      const pal = zbPalette(parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL'));
      for (const windows of [true, false]) {
        for (const v of zbShotOtherLooks(p.key, arc, pic.id, pal, windows)) {
          const quarter = zbShotLevel(v.pixels, v.rgb, 4);
          const hist = zbShotHistogram(quarter.w * quarter.h, (i, c) => {
            c[0] = Math.round(quarter.rgb[3 * i]); c[1] = Math.round(quarter.rgb[3 * i + 1]); c[2] = Math.round(quarter.rgb[3 * i + 2]);
          });
          let alike = 0;
          for (let i = 0; i < 4096; i++) alike += Math.min(hist[i], shotHist[i]);
          if (tried.length && alike > tried[0].alike) others.push({ place: p.key, picture: pic.id, windows, pixels: v.pixels, pal: v.pal, palKeys: v.palKeys, rgb: v.rgb, look: v.about, quarter, alike, arc });
        }
      }
    }
  }
  others.sort((a, b) => b.alike - a.alike);
  const sums = zbShotSums(rgba, width, height);
  let best = null;
  for (const t of [...tried.slice(0, 4), ...others.slice(0, 2)]) {
    const levels = { 1: zbShotLevel(t.pixels, t.rgb, 1), 4: t.quarter, 16: zbShotLevel(t.pixels, t.rgb, 16) };
    const a = zbShotSmoothAlign(rgba, sums, width, height, levels);
    if (a && (!best || a.error < best.error)) best = { ...t, ...a };
  }
  if (!best) return null;
  const frame = zbShotSmoothFrame(rgba, width, height, best);
  const { blur, spread } = zbShotBlurFit(frame, best.pixels, best.rgb);
  const tolerance = Math.min(60, Math.max(30, 6 * spread));
  const bare = zbShotBare(frame, best.pixels, best.rgb, blur, tolerance);
  let shown = 0, same = 0;
  for (let i = 0; i < bare.length; i++) {
    if (frame[3 * i] !== frame[3 * i]) continue;
    shown++;
    same += bare[i];
  }
  const palKeys = best.palKeys || zbShotPaletteKeys(best.pal, best.windows);
  const keys = zbShotSmoothKeys(frame, best.rgb, palKeys, 30);
  const shot = {
    width: Math.round(width / best.sx), height: Math.round(height / best.sy), scaleX: best.sx, scaleY: best.sy, smoothed: true, blur,
  };
  const out = { shot, place: best.place, picture: best.picture, windows: best.windows, dx: Math.round(best.dx), dy: Math.round(best.dy),
    fit: shown ? same / shown : 0, error: best.error, keys, frame, pixels: best.pixels, palKeys, arc: best.arc, archives, rgb: best.rgb, tolerance, zoombinis: [] };
  if (best.look) out.look = best.look;
  if (out.fit < 0.3) return { ...out, place: null };
  const sheet = zbSnoidSheet(archives.get('ZOOMBINI')), { poses, families, grids } = zbShotPoses(archives, best.place);
  out.zoombinis = zbShotSmoothZoombinis({ frame, bare, sheet, rgb: best.rgb, palKeys, blur, poses, families, grids, stands: zbShotStands(best.place) }, tolerance);
  out.tolerance = tolerance;
  return out;
}

/* The other looks of a place. A place whose program draws over most of
   the picture, or changes the palette as play goes on, sets
   ZB_SHOT_LOOKS[its archive] to a function of the archive, a picture's id
   and that picture's palette as the screen shows it at the start (256
   [r, g, b], 8 bits a component). It returns [{ pixels, pal, about }]:
   `pixels` the picture with the place's fixed pieces drawn on it (640 x
   480 indices), `pal` the palette then, and `about` what a reader needs
   of the look, which the frame has as `look`. Hotel Dimensia covers its
   picture with doors, and it darkens with each Zoombini turned away. */
const ZB_SHOT_LOOKS = {};
/* Each of those looks for one picture, shown as the Windows program shows
   colors or as stored: [{ pixels, pal, palKeys, rgb, about }], `palKeys`
   and `rgb` as zbShotPaletteKeys and zbShotPaletteRgb give them. */
function zbShotOtherLooks(key, arc, picture, pal, windows) {
  if (!ZB_SHOT_LOOKS[key]) return [];
  return ZB_SHOT_LOOKS[key](arc, picture, windows ? zbWindowsPalette(pal) : pal).map(v => ({
    pixels: v.pixels, pal: v.pal, about: v.about, palKeys: zbShotPaletteKeys(v.pal, false),
    rgb: windows ? v.pal.map(c => [0, 1, 2].map(k => ((c[k] >> 2) << 2) | (c[k] >> 6))) : v.pal.map(c => [c[0], c[1], c[2]]),
  }));
}

/* A screenshot without the plain bars around it, as a player or a window
   puts beside a 4:3 frame on a wider screen: the columns and rows at each
   edge whose pixels are all within 6 of the corner's color in red, green
   and blue. Returns { rgba, width, height, left, top }, the screenshot
   itself when it has no bars or is nothing but one color. */
function zbShotTrim(rgba, width, height) {
  const plain = (x0, y0, dx, dy, n, c) => {
    for (let i = 0; i < n; i++) {
      const o = 4 * ((y0 + i * dy) * width + x0 + i * dx);
      if (Math.abs(rgba[o] - c[0]) > 6 || Math.abs(rgba[o + 1] - c[1]) > 6 || Math.abs(rgba[o + 2] - c[2]) > 6) return false;
    }
    return true;
  };
  const color = (x, y) => [rgba[4 * (y * width + x)], rgba[4 * (y * width + x) + 1], rgba[4 * (y * width + x) + 2]];
  let left = 0, right = width, top = 0, bottom = height;
  const a = color(0, 0), b = color(width - 1, height - 1);
  while (left < right - 1 && plain(left, 0, 0, 1, height, a)) left++;
  while (right > left + 1 && plain(right - 1, 0, 0, 1, height, b)) right--;
  while (top < bottom - 1 && plain(left, top, 1, 0, right - left, a)) top++;
  while (bottom > top + 1 && plain(left, bottom - 1, 1, 0, right - left, b)) bottom--;
  const w = right - left, h = bottom - top;
  if ((w === width && h === height) || w < 16 || h < 16) return { rgba, width, height, left: 0, top: 0 };
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(rgba.subarray(4 * ((y + top) * width + left), 4 * ((y + top) * width + left + w)), 4 * y * w);
  return { rgba: out, width: w, height: h, left, top };
}

/* A screenshot read whole: `rgba` its pixels, `width` x `height`, and
   `archives` a Map from archive name to the open archive, with ZOOMBINI
   and the places to try. Returns { shot, place, picture, windows, dx, dy,
   fit, keys, zoombinis, puzzle }, `place` null when no place's picture
   fits half the pixels. `shot` is zbShotUnscale's without its keys,
   `keys` the 640 x 480 frame, and `windows` whether the colors are the
   Windows program's. `zoombinis` is zbShotGroup's, and `puzzle` what the
   place's reader in ZB_SHOT_PUZZLES finds, or null. A smoothed screenshot
   is zbShotSmoothRead's, with `zoombinis` zbShotSmoothZoombinis's and
   `puzzle` likewise. Plain bars around the frame are cut off first
   (zbShotTrim), and `shot.bars` has their widths. A reader's
   `zoombinis` sets their order, as the cliffs' gives them by bridge and
   the order they crossed in. */
function zbShotRead(rgba, width, height, archives) {
  const t = zbShotTrim(rgba, width, height);
  if (t.width < width || t.height < height) {
    const r = zbShotRead(t.rgba, t.width, t.height, archives);
    return { ...r, shot: { ...r.shot, bars: { left: t.left, top: t.top, right: width - t.left - t.width, bottom: height - t.top - t.height } } };
  }
  if (zbShotSmoothed(rgba)) {
    const r = zbShotSmoothRead(rgba, width, height, archives);
    if (!r) return { shot: { width, height, scaleX: 1, scaleY: 1, smoothed: true }, place: null, fit: 0, zoombinis: [], puzzle: null };
    const reader = r.place ? ZB_SHOT_PUZZLES[r.place] : null;
    const puzzle = reader ? reader(r, r.zoombinis) : null;
    return { ...r, zoombinis: puzzle && puzzle.zoombinis ? puzzle.zoombinis : r.zoombinis, puzzle };
  }
  const shot = zbShotUnscale(rgba, width, height);
  let best = null;
  for (const p of ZB_SHOT_PLACES) {
    const arc = archives.get(p.key);
    if (!arc) continue;
    for (const pic of zbShotPictures(arc, p.key)) {
      const pixels = decodeBitmapResource(arc.get('tBMP', pic.id)).frames[0].pixels;
      const pal = zbPalette(parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL'));
      for (const windows of [true, false]) {
        const palKeys = zbShotPaletteKeys(pal, windows);
        const a = zbShotAlign(shot, pixels, palKeys);
        if (!best || a.fit > best.fit) best = { ...a, place: p.key, picture: pic.id, windows, palKeys, pixels, arc, archives, rgb: zbShotPaletteRgb(pal, windows) };
      }
    }
  }
  /* the other looks (ZB_SHOT_LOOKS): the best place's, or every place's
     when no bare picture fits */
  for (const p of ZB_SHOT_PLACES) {
    const arc = archives.get(p.key);
    if (!arc || !ZB_SHOT_LOOKS[p.key] || (best && best.fit >= 0.5 && best.place !== p.key)) continue;
    for (const pic of zbShotPictures(arc, p.key)) {
      const pal = zbPalette(parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL'));
      for (const windows of [true, false]) {
        for (const v of zbShotOtherLooks(p.key, arc, pic.id, pal, windows)) {
          const a = zbShotAlign(shot, v.pixels, v.palKeys);
          if (!best || a.fit > best.fit) best = { ...a, place: p.key, picture: pic.id, windows, palKeys: v.palKeys, pixels: v.pixels, arc, archives, rgb: v.rgb, look: v.about };
        }
      }
    }
  }
  const { keys: unused, ...about } = shot;
  if (!best || best.fit < 0.5) return { shot: about, place: null, fit: best ? best.fit : 0, zoombinis: [], puzzle: null };
  const sheet = zbSnoidSheet(archives.get('ZOOMBINI'));
  const fg = zbShotForeground(best.keys, best.pixels, best.palKeys);
  const zoombinis = zbShotGroup(zbShotBestParts(zbShotFindParts(best.keys, fg, sheet, best.palKeys), best.keys, sheet, best.palKeys));
  zbShotInferHidden(best.keys, fg, zoombinis, sheet, best.palKeys);
  const reader = ZB_SHOT_PUZZLES[best.place];
  const puzzle = reader ? reader(best, zoombinis) : null;
  return { shot: about, place: best.place, picture: best.picture, windows: best.windows, dx: best.dx, dy: best.dy, fit: best.fit,
    keys: best.keys, zoombinis: puzzle && puzzle.zoombinis ? puzzle.zoombinis : zoombinis, puzzle };
}

/* ---- the puzzles --------------------------------------------------------- */

/* What a place's reader works with, from the frame zbShotRead or
   zbShotSmoothRead found: { arc, archives, rgb, colors, blur, tolerance,
   smoothed }. `colors` is the frame's red, green and blue at each of its
   640 x 480 pixels, NaN where the screenshot leaves the pixel out. `rgb`
   is the place's palette as the screenshot shows it. `blur` is 0 and
   `tolerance` 12 for a screenshot that copies pixels, whose colors have 6
   bits a component, and zbShotBlurFit's for a smoothed one. */
function zbShotEnv(frame) {
  const smoothed = !!frame.frame;
  let colors = frame.frame;
  if (!colors) {
    colors = new Float32Array(ZB_SHOT_W * ZB_SHOT_H * 3).fill(NaN);
    for (let i = 0; i < ZB_SHOT_W * ZB_SHOT_H; i++) {
      const k = frame.keys[i];
      if (k < 0) continue;
      colors[3 * i] = (k >> 12) << 2; colors[3 * i + 1] = ((k >> 6) & 63) << 2; colors[3 * i + 2] = (k & 63) << 2;
    }
  }
  return { arc: frame.arc, archives: frame.archives, rgb: frame.rgb, colors, smoothed, blur: smoothed ? frame.shot.blur : 0, tolerance: smoothed ? frame.tolerance : 12 };
}

/* Sprites drawn one over another, as a reader compares them with the
   frame: `pieces` is [{ sprite, x, y }], each sprite { width, height,
   pixels } with its top left corner at (x, y) from the drawing's origin,
   later ones over earlier, index 0 clear. `rgb` may give the pieces
   another palette than the place's. Returns { points, x0, y0, width,
   height, count }: `points` zbShotBlurred's, moved so that x and y are
   from the origin, and `count` how many. */
function zbShotDrawing(env, pieces, rgb = env.rgb) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pieces) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.sprite.width); y1 = Math.max(y1, p.y + p.sprite.height);
  }
  if (!pieces.length) return { points: [], x0: 0, y0: 0, width: 0, height: 0, count: 0 };
  const img = { width: x1 - x0, height: y1 - y0, pixels: new Uint8Array((x1 - x0) * (y1 - y0)) };
  for (const p of pieces) {
    const f = p.sprite;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const v = f.pixels[y * f.width + x];
        if (v) img.pixels[(y + p.y - y0) * img.width + x + p.x - x0] = v;
      }
    }
  }
  const points = zbShotBlurred(img, rgb, env.blur);
  for (let p = 0; p < points.length; p += 7) { points[p] += x0; points[p + 1] += y0; }
  return { points, x0, y0, width: img.width, height: img.height, count: points.length / 7 };
}

/* How well a drawing fits the frame with its origin at (X, Y): { matched,
   known, value, fit, shown }. `known` counts its points that the frame
   shows, `matched` those within the tolerance in red, green and blue
   together, `value` matched minus the others, `fit` matched over known and
   `shown` known over the drawing's points. `skip`, if given, is a
   Uint8Array over the frame, and a pixel it marks counts as not shown, as
   one under a Zoombini is. */
function zbShotDrawingFit(env, drawing, X, Y, skip) {
  const pts = drawing.points, colors = env.colors, tolerance = env.tolerance, abs = Math.abs;
  let matched = 0, known = 0;
  for (let p = 0; p < pts.length; p += 7) {
    const x = X + pts[p], y = Y + pts[p + 1];
    if (x < 0 || y < 0 || x >= ZB_SHOT_W || y >= ZB_SHOT_H) continue;
    const i = y * ZB_SHOT_W + x, o = 3 * i;
    if (colors[o] !== colors[o] || (skip && skip[i])) continue;
    known++;
    if (abs(colors[o] - pts[p + 2]) + abs(colors[o + 1] - pts[p + 3]) + abs(colors[o + 2] - pts[p + 4]) <= tolerance) matched++;
  }
  return { matched, known, value: 2 * matched - known, fit: known ? matched / known : 0, shown: drawing.count ? known / drawing.count : 0 };
}

/* The frame pixels the Zoombinis read cover, as a Uint8Array for
   zbShotDrawingFit's `skip`: each one's box, 44 wide and 62 high around
   its origin, which is near the middle of its body. */
function zbShotCovered(zoombinis) {
  const skip = new Uint8Array(ZB_SHOT_W * ZB_SHOT_H);
  for (const z of zoombinis) {
    for (let y = Math.max(0, z.y - 34); y < Math.min(ZB_SHOT_H, z.y + 28); y++) skip.fill(1, y * ZB_SHOT_W + Math.max(0, z.x - 22), y * ZB_SHOT_W + Math.min(ZB_SHOT_W, z.x + 22));
  }
  return skip;
}

/* A place's reader is ZB_SHOT_PUZZLES[its archive]: a function of the
   frame and the Zoombinis read that returns what it found. The readers in
   this file have a part of the page each (page-shot.js). One in a separate
   file (zb-shot-<archive in lower case>.js) adds itself to
   ZB_SHOT_PUZZLES and returns, besides what it found:
     zoombinis  all of them, in the order of the page's table, each with
                `where`, a few words on where it is ("in seat 3");
     state      what a person could read off the screenshot by eye, as
                plain JSON, which the check compares with the .json beside
                a screenshot;
     lines      sentences for the page, in order;
     link       { hash, text }, a link to take the puzzle apart, or null. */

/* The index of the place in `at` (x, y pairs) within 3 pixels of (x, y),
   or -1. */
function zbShotPlaceIn(at, x, y) {
  for (let i = 0; i < at.length / 2; i++) if (Math.abs(at[2 * i] - x) <= 3 && Math.abs(at[2 * i + 1] - y) <= 3) return i;
  return -1;
}

/* Allergic Cliffs. A Zoombini across stands at its bridge's next place
   (ZB_BRIDGE_ARRIVALS), so the place gives the bridge and the order it
   crossed in. One on the left of the chasm is waiting, and any other is on
   its way. The gate shows how many pegs the sneezes knocked out
   (ZB_BRIDGE_GATE). Returns { pegsGone, gateFit, upper, lower, waiting,
   crossing, levels }, the four lists of Zoombinis (across in the order
   they crossed), and for each level the rules that split them as they
   stand (zbBridgeRulesFitting) and, of those, the ones the program could
   deal if these Zoombinis are the whole band (zbBridgeCandidates), null
   where a trait is unread, and `zoombinis`, all of them in that order.
   It sets `where` on each Zoombini. */
function zbShotBridge(frame, zoombinis) {
  const { arc, keys, palKeys } = frame;
  const upper = [], lower = [], waiting = [], crossing = [];
  for (const z of zoombinis) {
    const u = zbShotPlaceIn(ZB_BRIDGE_ARRIVALS.upper.at, z.x, z.y), l = zbShotPlaceIn(ZB_BRIDGE_ARRIVALS.lower.at, z.x, z.y);
    z.where = u >= 0 ? { side: 'upper', slot: u } : l >= 0 ? { side: 'lower', slot: l } : { side: z.x < 300 ? 'waiting' : 'crossing' };
    ({ upper, lower, waiting, crossing })[z.where.side].push(z);
  }
  upper.sort((a, b) => a.where.slot - b.where.slot);
  lower.sort((a, b) => a.where.slot - b.where.slot);

  /* the gate: each stage's sprite where its script puts it */
  const sheet = decodeBitmapResource(arc.get('tBMP', 1200)).frames, regs = regsFor(arc, sheet.length);
  let pegsGone = null, gateFit = 0;
  for (let n = 0; n <= 6; n++) {
    const script = parseScript(arc.get('SCRB', ZB_BRIDGE_GATE.script + Math.min(n, 5)), 'SCRB');
    const ticks = zbFeatureTicks(script).filter(t => t.records.length);
    const shape = ZB_BRIDGE_GATE.shape + n, rec = (n < 6 ? ticks[0] : ticks[ticks.length - 1]).records.find(r => r.shape === shape);
    if (!rec) throw new Error(`SCRB ${ZB_BRIDGE_GATE.script + Math.min(n, 5)} does not draw the gate's shape ${shape}`);
    const fit = zbShotSpriteFit(keys, zbShotPoints(sheet[shape - 1], palKeys), rec.x - (regs ? regs.xs[shape] : 0), rec.y - (regs ? regs.ys[shape] : 0));
    const share = fit.known ? fit.matched / fit.known : 0;
    if (share > gateFit) { gateFit = share; pegsGone = n; }
  }

  const traits = list => list.map(z => z.traits);
  const band = [...upper, ...lower, ...waiting, ...crossing];
  const complete = band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  const levels = [1, 2, 3, 4].map(level => {
    const fitting = zbBridgeRulesFitting(level, traits(upper), traits(lower));
    let dealt = null;
    if (complete && band.length) {
      const c = zbBridgeCandidates(level, traits(band)), dealable = new Set(c.candidates.map(r => JSON.stringify(r)));
      dealt = fitting.filter(f => dealable.has(JSON.stringify(f.rule)));
    }
    return { level, fitting, dealt };
  });
  return { pegsGone, gateFit, upper, lower, waiting, crossing, levels, zoombinis: band };
}

/* Stone Cold Caves. A Zoombini let through stands at its cave's next
   place (ZB_TUNNELS_CAVES), so the place gives the tunnel it went through
   and the order. Any other is still to go. Returns { through, waiting,
   levels, zoombinis }: `through` the Zoombinis gone through each tunnel,
   0-3 from the left, in the order they went, `levels` for each level
   zbTunnelsRulesFitting's rules with, where every trait is read and the
   whole band shows, `dealt`, the pairs of them the program could deal
   that band (zbTunnelsPairCandidates, or at level 1 the side rules
   zbTunnelsL1Candidates stops at), and `zoombinis` all of them, by tunnel.
   It sets `where` on each Zoombini. */
function zbShotTunnels(frame, zoombinis) {
  const through = [[], [], [], []], waiting = [];
  for (const z of zoombinis) {
    let cave = -1, slot = -1;
    ZB_TUNNELS_CAVES.at.forEach((at, c) => { const i = zbShotPlaceIn(at, z.x, z.y); if (i >= 0) { cave = c; slot = i; } });
    if (cave < 0) { z.where = { side: 'waiting' }; waiting.push(z); continue; }
    z.where = { side: 'cave', cave, slot, tunnel: ZB_TUNNELS_CAVES.entrance[cave] };
    through[z.where.tunnel].push(z);
  }
  for (const list of through) list.sort((a, b) => a.where.slot - b.where.slot);
  const band = [...through.flat(), ...waiting], traits = band.map(z => z.traits);
  const complete = band.length > 0 && band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  const key = r => JSON.stringify(r);
  const levels = [1, 2, 3, 4].map(level => {
    const fitting = zbTunnelsRulesFitting(level, through.map(l => l.map(z => z.traits)));
    let dealt = null;
    if (complete && level === 1) {
      const dealable = new Set(zbTunnelsL1Candidates(traits).candidates.map(key));
      dealt = fitting.side.filter(f => dealable.has(key(f.rule))).map(f => [f]);
    } else if (complete) {
      const dealable = new Set(zbTunnelsPairCandidates(zbTunnelsRules(level), traits).candidates.map(([a, b]) => key(a) + key(b)));
      dealt = [];
      for (const a of fitting.side) for (const b of fitting.upper) if (dealable.has(key(a.rule) + key(b.rule))) dealt.push([a, b]);
    }
    return { level, ...fitting, dealt };
  });
  return { through, waiting, levels, zoombinis: band };
}

/* Bubblewonder Abyss. The grid is one of MAZE2's layouts (zbMaze2Layouts),
   each square drawn from tBMP 5100 at its place in REGS 16000, minus the
   shape's registration point in REGS 18000 and 18001, as ScummVM's
   renderGridCells draws it: a whirlpool is shape 2 + its frame; an arrow
   its color's first shape, one more for each way it may point (+ 1 + way),
   its pointer (+ 5 + way) and, on a feature arrow, the feature (5 x the
   trait's number from 1 + the value + 5); a sticky square + 9 + its
   frame; a colored square + 19. Every way of drawing each square is
   compared with the frame in color, blurred as a smoothed frame is, a
   pixel within the tolerance counting for it and any other against. A
   layout's score is the sum of its squares' best, each color group taking
   the color that does best over its squares, and the best layout is read.
   Returns { layout, level, variant, score, cells, slots, shapes, turned,
   zoombinis }: `cells` the layout's with `dir`, `color`, the feature
   (`kind`, `value`, `slot`) and `fit`, the share of the drawing that
   counts for it; `slots` the feature arrows' slots in order and `shapes`
   each group's first shape, as a deal has them; `turned` the arrows that
   point another way than the layout starts them. `layout` is null when no
   layout scores above 0. */
function zbShotMaze2(frame, zoombinis) {
  const arc = frame.arc, W = ZB_SHOT_W, H = ZB_SHOT_H, abs = Math.abs;
  const smooth = !!frame.frame, blur = smooth ? frame.shot.blur : 0, tolerance = smooth ? frame.tolerance : 12;
  let colors = frame.frame;
  if (!colors) {
    colors = new Float32Array(W * H * 3).fill(NaN);
    for (let i = 0; i < W * H; i++) {
      const k = frame.keys[i];
      if (k < 0) continue;
      colors[3 * i] = (k >> 12) << 2; colors[3 * i + 1] = ((k >> 6) & 63) << 2; colors[3 * i + 2] = (k & 63) << 2;
    }
  }
  const sprites = decodeBitmapResource(arc.get('tBMP', 5100)).frames;
  const rx = parseRegs(arc.get('REGS', 18000)), ry = parseRegs(arc.get('REGS', 18001)), at = parseRegs(arc.get('REGS', 16000));
  const looks = new Map();
  /* shapes drawn one over another, as points from the square's place */
  const look = shapes => {
    const key = shapes.join(' ');
    if (!looks.has(key)) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of shapes) {
        const f = sprites[s - 1];
        x0 = Math.min(x0, -rx[s]); y0 = Math.min(y0, -ry[s]); x1 = Math.max(x1, f.width - rx[s]); y1 = Math.max(y1, f.height - ry[s]);
      }
      const img = { width: x1 - x0, height: y1 - y0, pixels: new Uint8Array((x1 - x0) * (y1 - y0)) };
      for (const s of shapes) {
        const f = sprites[s - 1];
        for (let y = 0; y < f.height; y++) {
          for (let x = 0; x < f.width; x++) {
            const v = f.pixels[y * f.width + x];
            if (v) img.pixels[(y - ry[s] - y0) * img.width + x - rx[s] - x0] = v;
          }
        }
      }
      const pts = zbShotBlurred(img, frame.rgb, blur);
      for (let p = 0; p < pts.length; p += 7) { pts[p] += x0; pts[p + 1] += y0; }
      looks.set(key, pts);
    }
    return looks.get(key);
  };
  const score = (shapes, row, col) => {
    const pts = look(shapes), X = at[2 * (row * 13 + col)], Y = at[2 * (row * 13 + col) + 1];
    let matched = 0, known = 0;
    for (let p = 0; p < pts.length; p += 7) {
      const x = X + pts[p], y = Y + pts[p + 1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = 3 * (y * W + x);
      if (colors[o] !== colors[o]) continue;
      known++;
      if (abs(colors[o] - pts[p + 2]) + abs(colors[o + 1] - pts[p + 3]) + abs(colors[o + 2] - pts[p + 4]) <= tolerance) matched++;
    }
    return { value: 2 * matched - known, fit: known ? matched / known : 0 };
  };
  /* a square's best drawing in one color: { value, fit, dir, slot } */
  const bestIn = (c, base) => {
    let best = null;
    const keep = (shapes, dir, slot) => {
      const s = score(shapes, c.row, c.col);
      if (!best || s.value > best.value) best = { ...s, dir, slot };
    };
    if (c.type === 1) for (let d = 0; d < 4; d++) keep([2 + d], c.dir, 0);
    else if (c.type >= 2 && c.type <= 4) {
      const ways = [0, 1, 2, 3].filter(d => c.ways[d]), may = ways.length ? ways : [0, 1, 2, 3];
      const under = [base, ...ways.map(d => base + d + 1)];
      for (const d of may) {
        if (c.type !== 2) { keep([...under, base + d + 5], d, 0); continue; }
        for (let slot = 0; slot <= 20; slot++) keep(slot ? [...under, base + d + 5, slot + 10] : [...under, base + d + 5], d, slot);
      }
    } else if (c.type === 5) for (let d = 0; d < 6; d++) keep([base + 9 + d], c.dir, 0);
    else if (c.type === 6) keep([base + 19], c.dir, 0);
    else if (c.type === 7) keep([base + 20], c.dir, 0);
    return best || { value: 0, fit: 0, dir: c.dir, slot: 0 };
  };
  const bases = ZB_MAZE2_COLOR_POOL.slice(2, 9);
  let read = null;
  for (const layout of Object.values(zbMaze2Layouts(arc))) {
    const shapes = new Array(9).fill(0), cells = new Array(layout.cells.length);
    shapes[1] = ZB_MAZE2_COLOR_POOL[1];
    let total = 0;
    for (const group of [...new Set(layout.cells.map(c => c.group))]) {
      const own = layout.cells.map((c, i) => i).filter(i => layout.cells[i].group === group);
      let top = null;
      for (const base of group === 1 ? [shapes[1]] : bases) {
        const each = own.map(i => bestIn(layout.cells[i], base)), value = each.reduce((n, e) => n + e.value, 0);
        if (!top || value > top.value) top = { base, each, value };
      }
      shapes[group] = top.base;
      total += top.value;
      own.forEach((i, k) => {
        const c = layout.cells[i], e = top.each[k];
        cells[i] = { ...c, index: i, start: c.dir, dir: e.dir, fit: e.fit, color: ZB_MAZE2_COLORS[top.base] };
        if (c.type === 2) Object.assign(cells[i], zbMaze2SlotTrait(e.slot), { slot: e.slot });
      });
    }
    if (!read || total > read.score) read = { layout: layout.id, score: total, cells, shapes };
  }
  if (!read || read.score <= 0) return { layout: null, zoombinis };
  const id = read.layout, small = id === ZB_MAZE2_SMALL_LAYOUT;
  const level = small ? 4 : [1, 2, 3, 4].find(l => id >= ZB_MAZE2_FIRST_LAYOUT[l] && id <= ZB_MAZE2_FIRST_LAYOUT[l] + (l === 4 ? 2 : 1));
  return { ...read, level, variant: small ? 0 : id - ZB_MAZE2_FIRST_LAYOUT[level],
    slots: read.cells.filter(c => c.type === 2).map(c => c.slot),
    turned: read.cells.filter(c => c.type >= 2 && c.type <= 4 && c.dir !== c.start), zoombinis };
}

/* What each place's reader finds, by place. */
const ZB_SHOT_PUZZLES = { BRIDGE: zbShotBridge, TUNNELS: zbShotTunnels, MAZE2: zbShotMaze2 };

/* Where a place's Zoombinis come to stand, as x and y pairs: the places a
   smoothed reading tries whether or not a part was found there, and reads
   on less than elsewhere. */
function zbShotStands(place) {
  if (place === 'TUNNELS') return ZB_TUNNELS_CAVES.at.flat();
  if (place === 'BRIDGE') return [...ZB_BRIDGE_ARRIVALS.upper.at, ...ZB_BRIDGE_ARRIVALS.lower.at];
  return [];
}
