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
   axis to those marks and reads the frame back. A smoothed or compressed
   picture has no such marks, and the fit fails on it.

   A Zoombini is five sprites of ZOOMBINI tBMP 3000, one a part (zb-snoid.js).
   zbShotFindParts tries every pose of every part where the screenshot
   differs from the place's picture. zbShotBestParts chooses the fits that
   explain the frame, and zbShotGroup groups them by where they put the
   Zoombini's origin. A sprite's registration point is where the origin
   falls when the Zoombini stands, and nearly so in its other poses.
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
   640 x 480 indices, `palKeys` zbShotPaletteKeys's. Every offset that
   keeps the part inside the frame is tried on a sparse sample of pixels,
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
   sprite, and is dropped. */
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

/* The pictures a place may show: [{ id, palette }], the picture and the
   palette of the same id (zb-journey.js). */
function zbShotPictures(arc, key) {
  const p = ZB_PLACE_BY_KEY.get(key);
  if (!p || p.panorama) return [];
  return [...new Set([p.background, p.hard].filter(Boolean))]
    .filter(id => arc.has('tBMP', id) && arc.has('SHPL', id)).map(id => ({ id, palette: id }));
}

/* A screenshot read whole: `rgba` its pixels, `width` x `height`, and
   `archives` a Map from archive name to the open archive, with ZOOMBINI
   and the places to try. Returns { shot, place, picture, windows, dx, dy,
   fit, keys, zoombinis, puzzle }, `place` null when no place's picture
   fits half the pixels. `shot` is zbShotUnscale's without its keys,
   `keys` the 640 x 480 frame, and `windows` whether the colors are the
   Windows program's. `zoombinis` is zbShotGroup's, and `puzzle` what the
   place's reader in ZB_SHOT_PUZZLES finds, or null. A reader's
   `zoombinis` sets their order, as the cliffs' gives them by bridge and
   the order they crossed in. */
function zbShotRead(rgba, width, height, archives) {
  const shot = zbShotUnscale(rgba, width, height);
  let best = null;
  for (const p of ZB_PLACES) {
    const arc = archives.get(p.key);
    if (!arc) continue;
    for (const pic of zbShotPictures(arc, p.key)) {
      const pixels = decodeBitmapResource(arc.get('tBMP', pic.id)).frames[0].pixels;
      const pal = zbPalette(parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL'));
      for (const windows of [true, false]) {
        const palKeys = zbShotPaletteKeys(pal, windows);
        const a = zbShotAlign(shot, pixels, palKeys);
        if (!best || a.fit > best.fit) best = { ...a, place: p.key, picture: pic.id, windows, palKeys, pixels, arc };
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
   Each Zoombini gets `where`. */
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

/* What each place's reader finds, by place. */
const ZB_SHOT_PUZZLES = { BRIDGE: zbShotBridge };
