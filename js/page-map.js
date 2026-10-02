/* page-map.js -- the journey's map: the land the Zoombinis cross, their
   sixteen places on it and the roads between, as one picture to zoom into.
   =========================================================================

   The map is one picture, as StarGrimoire's universe and grimoire's World
   tab are: RODMAP's painting, 640 x 480, with the icons and roads its
   scripts draw over it (zbJourneyMap), and each place a window at its icon
   in which the place's own picture, the scene its page opens on, is drawn
   scaled down to fit. A place is not somewhere you go but something that
   gets bigger as you zoom in: its picture begins to replace its icon when
   its window is TUNE.fadeFrom pixels across and has replaced it at fadeTo.
   Which place you are in is read off the view (mapSettle) -- the one whose
   window holds the middle of the screen and fills a good part of it -- and
   the bar, the panel and the address follow. Going in is StarGrimoire's
   zoom onto a point (mapZoomVia); a long way across is van Wijk and Nuij's
   path (mapZoomPath). The address bar keeps where you are (#journey,
   #journey&place=PIZZA, #place=PIZZA, and &level=3 at a level other than
   the first), so Back works and a place can be linked. A puzzle's panel
   gives its rules at the level (zb-puzzle.js) and can deal one, a band
   and the puzzle set for it, from a seed the address keeps (&deal=, and
   &band= for a band of fewer than 16), so a dealt puzzle can be linked.

   Everything drawn comes from zb-journey.js and the archives; this file
   decides only how it looks. Choices of its own, said once here: a place's
   window is 4:3, like its picture, centred on its icon, and 0.8 of the way
   to its nearest neighbour across, at most 60 map pixels, so no two meet;
   the land round the place you are in darkens as it fills the screen; the
   roads are drawn in one level's colours at a time, the level the tools
   pick, where the game draws each in the level it was crossed at; the map
   is drawn pixel for pixel when magnified and smoothed when shrunk. From
   archive.org, a place's archive is fetched only when you are in it or
   pick it, and its icon stays until it has come.

   The page's own script: DOM here. LOAD ORDER: last, after page-browse.js,
   whose $, esc, link, sharedColours and indexedCanvas it uses, and whose
   route() calls journeyRoute. */

let JMAP = null, JMAP_FROM = null, JMAP_ERROR = null;
let JGROUND = null, JPAL = null, JLEVEL_RGB = [];
const JSPRITES = new Map();       // sheet frame -> canvas
const JPICS = new Map();          // 'PIZZA/5000' -> the place's picture as a canvas, or 'failed'
const JWIN = new Map();           // place key -> its window, in map pixels
const JCAM = { x: 320, y: 240, s: 1 };
const JVIEW = { place: null, sel: null, hover: null, level: 1, deal: null, bandSize: 16, answerOpen: false };
let JHOME = null, JPLACED = false, JMOVING = false, JMOVE = 0, JDRAWN = [], JFONT = null;
/* How the zoom feels, as StarGrimoire's TUNE does there: a place's picture
   begins to replace its icon when its window is fadeFrom pixels across and
   has replaced it at fadeTo; the names are in between labelsFrom and
   labelsTo map scales. animMs is grimoire's settled value. None of the
   sizes is settled on a real screen yet. */
const JTUNE = { fadeFrom: 90, fadeTo: 240, labelsFrom: 1.6, labelsTo: 2.2, animMs: 1000, room: 0.8, roomCap: 60 };

function jClamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function jPlace(key) { return ZB_PLACE_BY_KEY.get(key); }
function jOnMap(key) { return JMAP && JMAP.places.find(p => p.key === key); }

/* ---- starting ------------------------------------------------------------ */

function journeyAvailable() { return ARCHIVES.has('RODMAP') || ARCHIVES.has('MAP'); }
function isJourneyHash() { return /^#(journey|place=)/.test(location.hash); }

/* The map, read the first time it is wanted: RODMAP, or MAP where only the
   European layout's archive is there. From archive.org it is fetched. */
async function journeyLoad() {
  const entry = ARCHIVES.get('RODMAP') || ARCHIVES.get('MAP');
  if (!entry) { JMAP_ERROR = 'There is no RODMAP or MAP archive among the files opened.'; return false; }
  if (JMAP && JMAP_FROM === entry) return true;
  if (!entry.bytes && !entry.error) {
    $('jpanel').innerHTML = `<h2>The journey</h2><p class="note">Fetching the map from archive.org…</p>`;
    await ensureBytes(entry);
  }
  const arc = openedArchive(entry);
  JMAP_FROM = entry;
  JMAP = null;
  JSPRITES.clear();
  JPICS.clear();
  if (!arc) { JMAP_ERROR = entry.error || `${entry.name} could not be read.`; return false; }
  try { JMAP = zbJourneyMap(arc); } catch (e) { JMAP_ERROR = `${entry.name}: ${e.message}`; return false; }
  JMAP_ERROR = null;
  JPAL = zbPalette(null);
  const shared = sharedColours();
  if (shared) shared.colours.forEach((c, i) => { JPAL[10 + i] = [c[0], c[1], c[2]]; });
  JMAP.palette.colours.forEach((c, i) => { if (JMAP.palette.start + i < 256) JPAL[JMAP.palette.start + i] = [c[0], c[1], c[2]]; });
  JGROUND = indexedCanvas(JMAP.background, JPAL, false);
  // Each level's colour: the commonest in its line in the map's legend.
  JLEVEL_RGB = JMAP.levels.map(i => {
    const f = JMAP.sheet[i], n = new Map();
    for (const v of f.pixels) if (v) n.set(v, (n.get(v) || 0) + 1);
    const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? JPAL[top[0]] : [128, 128, 128];
  });
  buildWindows();
  return true;
}

function buildWindows() {
  JWIN.clear();
  for (const p of JMAP.places) {
    let near = Infinity;
    for (const q of JMAP.places) if (q !== p) near = Math.min(near, Math.hypot(q.cx - p.cx, q.cy - p.cy));
    const w = Math.min(JTUNE.room * near, JTUNE.roomCap), h = w * 0.75;
    JWIN.set(p.key, { x: p.cx - w / 2, y: p.cy - h / 2, w, h });
  }
}

/* Called by page-browse's route() when the address is the map's. */
async function journeyRoute() {
  $('jstage').classList.toggle('broken', false);
  if (!await journeyLoad()) {
    $('jpanel').innerHTML = `<h2>The journey</h2><p class="bad">${esc(JMAP_ERROR || 'The map could not be read.')}</p><p><a href="#${esc((ARCHIVES.get('RODMAP') || ARCHIVES.get('MAP') || {}).name || '')}">The archive</a></p>`;
    $('jstage').classList.add('broken');
    return;
  }
  mapResize();
  if (!JPLACED && JHOME) { Object.assign(JCAM, JHOME); JPLACED = true; }
  mapApplyHash();
}

/* ---- pictures -------------------------------------------------------------- */

function jSprite(i) {
  if (!JSPRITES.has(i)) JSPRITES.set(i, JMAP.sheet[i] ? indexedCanvas(JMAP.sheet[i], JPAL, true) : null);
  return JSPRITES.get(i);
}

/* A place's picture at the level picked: a canvas, or a word saying why
   there is none yet -- 'absent' (its archive is not among the files),
   'unfetched', 'fetching' or 'failed'. */
function jPicture(key) {
  const p = jPlace(key), entry = ARCHIVES.get(key);
  if (!entry) return 'absent';
  if (!entry.bytes) return entry.error ? 'failed' : FETCHING.has(key) ? 'fetching' : 'unfetched';
  const id = p.hard && JVIEW.level >= 3 ? p.hard : p.background, k = key + '/' + id;
  if (JPICS.has(k)) return JPICS.get(k);
  let out = 'failed';
  try {
    const arc = openedArchive(entry);
    const pic = zbPlacePicture(arc, key, JVIEW.level);
    const pal = zbPalette(null), shared = sharedColours();
    if (shared) shared.colours.forEach((c, i) => { pal[10 + i] = [c[0], c[1], c[2]]; });
    const pp = parsePaletteResource(arc.get('SHPL', pic.palette), 'SHPL');
    pp.colours.forEach((c, i) => { if (pp.start + i < 256) pal[pp.start + i] = [c[0], c[1], c[2]]; });
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const g = c.getContext('2d'), decoded = new Map();
    for (const l of pic.layers) {
      if (!decoded.has(l.id)) decoded.set(l.id, decodeBitmapResource(arc.get('tBMP', l.id)));
      g.drawImage(indexedCanvas(decoded.get(l.id).frames[l.frame], pal, false), l.x, l.y);
    }
    out = c;
  } catch (e) { console.error(e); }
  JPICS.set(k, out);
  return out;
}

/* From archive.org: fetch a place's archive, then draw it. */
function jWant(key) {
  const entry = ARCHIVES.get(key);
  if (!entry || entry.bytes || entry.error || FETCHING.has(key)) return;
  ensureBytes(entry).then(() => { mapRedraw(); if (JVIEW.sel === key || JVIEW.place === key) mapPanel(); });
  mapRedraw();
}

/* ---- the canvas and the view ------------------------------------------- */

let JCTX = null, JCW = 0, JCH = 0;
function mapResize() {
  const c = $('jmap'), dpr = window.devicePixelRatio || 1;
  JCW = c.clientWidth; JCH = c.clientHeight;
  if (!JCW || !JCH) return;
  c.width = Math.round(JCW * dpr); c.height = Math.round(JCH * dpr);
  JCTX = c.getContext('2d');
  JCTX.setTransform(dpr, 0, 0, dpr, 0, 0);
  const wasHome = JHOME && JCAM.x === JHOME.x && JCAM.y === JHOME.y && JCAM.s === JHOME.s;
  if (JMAP) JHOME = mapHomeView();
  if (wasHome) Object.assign(JCAM, JHOME);
  mapRedraw();
}
function mapToScreen(x, y, c = JCAM) { return [(x - c.x) * c.s + JCW / 2, (y - c.y) * c.s + JCH / 2]; }
function mapToWorld(sx, sy, c = JCAM) { return [(sx - JCW / 2) / c.s + c.x, (sy - JCH / 2) / c.s + c.y]; }
function mapFit(x0, y0, w, h, pad) {
  return { x: x0 + w / 2, y: y0 + h / 2, s: Math.min(Math.max(JCW - pad * 2, 20) / w, Math.max(JCH - pad * 2, 20) / h) };
}
function mapHomeView() { return mapFit(0, 0, 640, 480, 6); }
function mapPlaceView(key) { const w = JWIN.get(key); return mapFit(w.x, w.y, w.w, w.h, Math.min(JCW, JCH) < 500 ? 4 : 24); }
function mapSMin() { return JHOME ? JHOME.s * 0.6 : 0.2; }
// A place's picture up to four screen pixels a pixel, in the smallest window.
function mapSMax() { return 4 * 640 / Math.min(...[...JWIN.values()].map(w => w.w)); }

let JDRAW_QUEUED = false;
function mapRedraw() {
  if (JDRAW_QUEUED || !JCTX || $('journey').hidden) return;
  JDRAW_QUEUED = true;
  requestAnimationFrame(() => { JDRAW_QUEUED = false; mapDraw(); });
}

// How far a place's picture has replaced its icon, 0 to 1, by its
// window's width on the screen.
function jOpenness(W) { return jClamp((W - JTUNE.fadeFrom) / (JTUNE.fadeTo - JTUNE.fadeFrom), 0, 1); }

function mapDraw() {
  if (!JMAP || !JCTX) return;
  const ctx = JCTX, s = JCAM.s;
  ctx.save();
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, JCW, JCH);
  ctx.imageSmoothingEnabled = s < 1;
  const [gx, gy] = mapToScreen(0, 0);
  ctx.drawImage(JGROUND, gx, gy, 640 * s, 480 * s);
  for (const r of JMAP.roads) {
    // A save's roads at the levels it crossed them, the rest not drawn; else all at the level picked.
    const level = JSAVE ? JSAVE.levels.get(r.shape) : JVIEW.level;
    if (!level) continue;
    const c = jSprite(r.frames[level - 1]);
    if (c) { const [x, y] = mapToScreen(r.x, r.y); ctx.drawImage(c, x, y, c.width * s, c.height * s); }
  }
  JDRAWN = [];
  let centred = null;
  for (const p of JMAP.places) {
    const w = JWIN.get(p.key), [x, y] = mapToScreen(w.x, w.y), W = w.w * s, H = w.h * s;
    const d = { key: p.key, p, x, y, W, H, t: jOpenness(W), pic: null };
    if (x + W < -40 || y + H < -40 || x > JCW + 40 || y > JCH + 40) continue;
    if (d.t > 0) {
      d.pic = jPicture(p.key);
      if (typeof d.pic === 'string') d.t = 0;
    }
    if (JCW / 2 >= x && JCW / 2 <= x + W && JCH / 2 >= y && JCH / 2 <= y + H) centred = d;
    JDRAWN.push(d);
  }
  // The place in the middle of the screen, fetched if it is not here yet.
  if (centred && jOpenness(centred.W) > 0.5) jWant(centred.key);
  for (const d of JDRAWN) {
    if (d.t < 1) drawIcon(ctx, d, 1 - d.t);
    if (d.t > 0) drawWindow(ctx, d);
  }
  // Darken the land round a place as it fills the screen.
  if (centred && centred.t > 0) {
    const f = Math.max(centred.W / JCW, centred.H / JCH), a = 0.7 * jClamp((f - 0.35) / 0.35, 0, 1) * centred.t;
    if (a > 0) {
      ctx.fillStyle = `rgba(3,4,7,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.rect(0, 0, JCW, JCH);
      ctx.rect(centred.x, centred.y, centred.W, centred.H);
      ctx.fill('evenodd');
    }
  }
  drawLabels(ctx, centred);
  ctx.restore();
  $('jscale').textContent = centred && centred.t > 0.5 && centred.W > 0.35 * JCW
    ? `${jPlace(centred.key).name} at ${Math.round(centred.W / 640 * 100)}%` : `map at ${Math.round(s * 100)}%`;
  if (!JMOVING) mapSettle();
}

function drawIcon(ctx, d, alpha) {
  const p = d.p, lit = JVIEW.hover === p.key || JVIEW.sel === p.key;
  const c = jSprite(lit ? p.lit : p.frame);
  if (!c) return;
  const s = JCAM.s, [x, y] = mapToScreen(p.x + p.w / 2 - c.width / 2, p.y + p.h / 2 - c.height / 2);
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, x, y, c.width * s, c.height * s);
  ctx.globalAlpha = 1;
}

function drawWindow(ctx, d) {
  ctx.globalAlpha = d.t;
  ctx.fillStyle = '#000';
  ctx.fillRect(d.x - 1, d.y - 1, d.W + 2, d.H + 2);
  ctx.imageSmoothingEnabled = d.W < 640;
  ctx.drawImage(d.pic, d.x, d.y, d.W, d.H);
  ctx.imageSmoothingEnabled = JCAM.s < 1;
  const on = JVIEW.hover === d.key || JVIEW.sel === d.key;
  ctx.strokeStyle = on ? 'rgba(255,226,120,.95)' : 'rgba(255,255,255,.35)';
  ctx.lineWidth = on ? 2 : 1;
  ctx.strokeRect(d.x - 0.5, d.y - 0.5, d.W + 1, d.H + 1);
  ctx.globalAlpha = 1;
}

function drawLabels(ctx, centred) {
  const all = jClamp((JCAM.s - JTUNE.labelsFrom) / (JTUNE.labelsTo - JTUNE.labelsFrom), 0, 1);
  ctx.font = `600 12px ${JFONT || (JFONT = getComputedStyle(document.body).fontFamily)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  for (const d of JDRAWN) {
    const picked = JVIEW.hover === d.key || JVIEW.sel === d.key;
    // A place filling the screen needs no name under it: the bar has it.
    const big = jClamp((Math.max(d.W / JCW, d.H / JCH) - 0.3) / 0.2, 0, 1);
    let a = (picked ? 1 : all) * (1 - big);
    const fetching = ARCHIVES.get(d.key) && FETCHING.has(d.key);
    if (a <= 0.02 && !fetching) continue;
    if (fetching) a = Math.max(a, 1 - big);
    const bottom = d.t > 0 ? d.y + d.H : mapToScreen(0, d.p.y + d.p.h)[1];
    const text = jPlace(d.key).name + (fetching ? ' (fetching…)' : '');
    ctx.globalAlpha = a;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(8,6,4,.9)';
    ctx.strokeText(text, d.x + d.W / 2, bottom + 4);
    ctx.fillStyle = picked ? '#ffe278' : '#fbf3de';
    ctx.fillText(text, d.x + d.W / 2, bottom + 4);
  }
  ctx.globalAlpha = 1;
}

/* Which place you are in, read off the view: the one whose window holds
   the middle of the screen and fills 0.45 of it one way or the other. */
function mapSettle() {
  let key = null;
  for (const d of JDRAWN) {
    if (Math.max(d.W / JCW, d.H / JCH) < 0.45) continue;
    if (JCW / 2 >= d.x && JCW / 2 <= d.x + d.W && JCH / 2 >= d.y && JCH / 2 <= d.y + d.H) key = d.key;
  }
  if (key === JVIEW.place) return;
  if (key) JVIEW.sel = key;
  JVIEW.place = key;
  JVIEW.hover = null;
  mapWriteHash(true);
  mapCrumbs();
  mapPanel();
}

/* ---- moving ---------------------------------------------------------------- */

// grimoire's curve, easing both ends.
function mapEase(t) { return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; }
// Resolves true when it has run to its end, false when a newer move has
// taken over from it (JMOVE counts the moves).
function mapAnimate(ms, step) {
  const move = JMOVE;
  return new Promise(res => {
    const t0 = performance.now();
    const f = now => {
      if (move !== JMOVE) { res(false); return; }
      const t = jClamp((now - t0) / ms, 0, 1);
      step(mapEase(t));
      mapDraw();
      if (t < 1) requestAnimationFrame(f); else res(true);
    };
    requestAnimationFrame(f);
  });
}
/* grimoire's atlasZoomOnto, as StarGrimoire's zoomVia makes it general:
   the scale goes geometrically from where it is to `to`'s, while the map
   point (hx, hy) slides in a straight line from where it is on the screen
   to where `to` has it. */
function mapZoomVia(hx, hy, to, ms) {
  const s0 = JCAM.s, [px, py] = mapToScreen(hx, hy), [qx, qy] = mapToScreen(hx, hy, to);
  return mapAnimate(ms, e => {
    const s = s0 * Math.pow(to.s / s0, e), cx = px + (qx - px) * e, cy = py + (qy - py) * e;
    JCAM.s = s; JCAM.x = hx - (cx - JCW / 2) / s; JCAM.y = hy - (cy - JCH / 2) / s;
  });
}
/* van Wijk and Nuij's smooth zoom (2003), the path d3's interpolateZoom
   takes: out as far as the distance needs, across, and in again. A view is
   its middle and w, the shorter side in map pixels. As StarGrimoire's. */
function mapZoomPath(a, b) {
  const m = Math.min(JCW, JCH), w0 = m / a.s, w1 = m / b.s, R = Math.SQRT2;
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  if (d2 < 1e-12) {
    const S = Math.log(w1 / w0) / R;
    return { S, at: t => [a.x, a.y, w0 * Math.exp(R * t * S)] };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + 4 * d2) / (2 * w0 * 2 * d1), b1 = (w1 * w1 - w0 * w0 - 4 * d2) / (2 * w1 * 2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / R;
  return { S, at: t => {
    const s = t * S, u = w0 / (2 * d1) * (Math.cosh(r0) * Math.tanh(R * s + r0) - Math.sinh(r0));
    return [a.x + u * dx, a.y + u * dy, w0 * Math.cosh(r0) / Math.cosh(R * s + r0)];
  } };
}
// To a view: a zoom onto it when its middle is on the screen, else the
// long way. False if a newer move took over on the way.
async function mapFlyTo(to, quick) {
  to = { x: to.x, y: to.y, s: to.s };
  if (!quick) {
    const [px, py] = mapToScreen(to.x, to.y);
    let done;
    if (px >= 0 && py >= 0 && px <= JCW && py <= JCH) done = await mapZoomVia(to.x, to.y, to, Math.round(JTUNE.animMs * 0.7));
    else {
      const path = mapZoomPath(JCAM, to), m = Math.min(JCW, JCH);
      done = await mapAnimate(jClamp(Math.abs(path.S) * 400, 700, 1600), e => { const [x, y, w] = path.at(e); JCAM.x = x; JCAM.y = y; JCAM.s = m / w; });
    }
    if (!done) return false;
  }
  Object.assign(JCAM, to);
  return true;
}
// A move, and what is so when it has arrived, before the view is read off
// again (mapSettle) and the address written. A move asked for while
// another is under way (Back pressed twice, a link followed mid-flight)
// takes over from where the first has got to.
async function mapGo(to, instant, arrive) {
  const move = ++JMOVE;
  JMOVING = true;
  const done = await mapFlyTo(to, instant || matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!done || move !== JMOVE) return;
  JMOVING = false;
  if (arrive) arrive();
  mapDraw();
}
/* Into a place, or out to the whole map, as a step in the history unless
   the address already says so. */
function mapEnter(key, instant, replace) {
  JVIEW.sel = key;
  jWant(key);
  return mapGo(mapPlaceView(key), instant, () => { JVIEW.place = key; JVIEW.hover = null; mapWriteHash(replace); mapCrumbs(); mapPanel(); });
}
function mapLeave(instant, replace) {
  return mapGo(JHOME, instant, () => { JVIEW.place = null; mapWriteHash(replace); mapCrumbs(); mapPanel(); });
}

/* ---- the address bar ---------------------------------------------------- */

function mapHashFor() {
  const k = JVIEW.place || JVIEW.sel, d = JVIEW.deal;
  const lv = (JVIEW.level !== 1 ? `&level=${JVIEW.level}` : '')
    + (d && d.key === k ? `&deal=${d.seed}` + (d.size !== 16 ? `&band=${d.size}` : '') : '');
  if (JVIEW.place) return `#place=${JVIEW.place}${lv}`;
  return '#journey' + (JVIEW.sel ? `&place=${JVIEW.sel}` : '') + lv;
}
function mapWriteHash(replace) {
  if ($('journey').hidden) return;
  const h = mapHashFor();
  if (location.hash === h) return;
  if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
}
function mapApplyHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const level = +q.get('level');
  JVIEW.level = level >= 1 && level <= 4 ? level : 1;
  $('jlevel').value = String(JVIEW.level);
  const key = (q.get('place') || '').toUpperCase();
  const known = jOnMap(key) ? key : null;
  const seed = +q.get('deal'), size = +q.get('band') || 16;
  JVIEW.deal = known && seed > 0 && seed < 2 ** 32 && size >= 1 && size <= 16 ? { key: known, seed, size } : null;
  if (JVIEW.deal) JVIEW.bandSize = size;
  mapCrumbs();
  if (q.has('journey')) {
    JVIEW.sel = known;
    // Out of a place the address has left, to the whole map.
    if (JVIEW.place) mapLeave(false, true);
    mapPanel();
    mapRedraw();
  } else if (known) {
    JVIEW.sel = known;
    if (JVIEW.place !== known) mapEnter(known, !JDRAWN.length, true);
    mapPanel();
    mapRedraw();
  } else {
    history.replaceState(null, '', '#journey');
    mapPanel();
    mapRedraw();
  }
}

/* ---- the bar and the panel ----------------------------------------------- */

function mapCrumbs() {
  if (!isJourneyHash()) return;     // a flight still under way after the view has changed
  const k = JVIEW.place || JVIEW.sel;
  const parts = [`<a data-go="map">Map</a>`];
  if (k) parts.push(`<span>${esc(jPlace(k).name)}</span>`);
  $('crumbs').innerHTML = parts.join('<span class="sep">›</span>');
  const arch = $('views').querySelector('[data-view="data"]');
  if (arch) arch.href = '#' + (k || (JMAP_FROM ? JMAP_FROM.name : 'RODMAP'));
}

const jPlaceLink = key => `<a data-sel="${key}">${esc(jPlace(key).name)}</a>`;
const jChip = rgb => `<span class="chip" style="background:rgb(${rgb.join(',')})"></span>`;

let JPANEL_FOR;
function mapPanel() {
  if (!JMAP) return;
  const k = JVIEW.place || JVIEW.sel;
  $('jpanel').innerHTML = k ? placePanel(k) : journeyPanel();
  // To the top for another place, not for the same one drawn again.
  if (JPANEL_FOR !== k) $('jpanel').scrollTop = 0;
  JPANEL_FOR = k;
}

function levelLegend() {
  return '<div class="legend">' + ZB_LEVELS.map((n, i) =>
    `<div data-level="${i + 1}" class="${JVIEW.level === i + 1 ? 'on' : ''}">${jChip(JLEVEL_RGB[i])}${esc(n)}<small>level ${i + 1}</small></div>`).join('') + '</div>';
}

function journeyPanel() {
  let html = `<h2>The journey</h2><div class="sub">${esc(JMAP_FROM.name)}, tBMP 300: the map the game shows between places</div>`;
  html += `<p>A band of sixteen Zoombinis sets out from Zoombini Isle to Zoombiniville over four routes and twelve puzzles, three to a route; at Shelter Rock the way divides and at Shade Tree it meets again. Zoom into a place to see it.</p>`;
  for (const r of ZB_ROUTES) {
    html += `<h3>${esc(r.name)}</h3><ol class="route">` + r.places.map(k => `<li>${jPlaceLink(k)}<small>${esc(jPlace(k).kind)}</small></li>`).join('') + '</ol>';
  }
  html += `<h3>The roads, at a level</h3>${levelLegend()}`;
  html += JSAVE ? `<p class="note">The roads as ${esc(JSAVE.name)} has them, each in the colour of the level it was crossed at; <a data-nosave>Clear</a>.</p>`
    : `<p class="note">The game draws each stretch of road in the colour of the level it was crossed at; here they are all drawn at the level picked, and a place's help is that level's.</p>`;
  return html;
}

function placePanel(key) {
  const p = jPlace(key), entry = ARCHIVES.get(key), on = zbPlaceRoutes(key);
  const nth = ['first', 'second', 'third', 'fourth', 'fifth'];
  let where;
  if (p.kind === 'puzzle') {
    const r = on[0];
    where = `the ${nth[r.at - 1]} puzzle on ${esc(ZB_ROUTES[r.route].name)}`;
  } else if (key === 'PICKER') where = 'where a band is chosen and the journey begins';
  else if (key === 'TOWN') where = 'where the journey ends';
  else where = `a camp, where ${on.filter(r => r.at === 4).map(r => esc(ZB_ROUTES[r.route].name)).join(' and ')} ${on.filter(r => r.at === 4).length > 1 ? 'meet' : 'ends'}`;
  const inIt = JVIEW.place === key;
  const id = p.hard && JVIEW.level >= 3 ? p.hard : p.background;
  let html = `<h2>${esc(p.name)}</h2><div class="sub">${esc(key)} · ${where}</div>`;
  html += '<div class="actions">'
    + (inIt ? `<button data-go="map">Map</button>` : `<button data-go="in" data-key="${key}">Go in</button>`)
    + (key === 'TOWN' && entry ? ` <a class="btn" href="#town">All round</a>` : '')
    + ` <a class="btn" href="#${key}">The archive</a>`
    + (p.panorama ? ` <a class="btn" href="#${key}/tBMP/${p.panorama.sheet}">The panorama</a>` : ` <a class="btn" href="#${key}/tBMP/${id}">The picture</a>`)
    + '</div>';
  const from = [], to = [];
  for (const r of on) {
    const route = ZB_ROUTES[r.route];
    if (r.at > 0) from.push(jPlaceLink(route.places[r.at - 1]));
    if (r.at < route.places.length - 1) to.push(jPlaceLink(route.places[r.at + 1]) + (key === 'BASECAMP' ? ` <small>(${esc(route.name)})</small>` : ''));
  }
  html += '<table class="kv">'
    + (from.length ? `<tr><td>from</td><td>${from.join(' or ')}</td></tr>` : '')
    + (to.length ? `<tr><td>on to</td><td>${to.join(' or ')}</td></tr>` : '')
    + `<tr><td>picture</td><td>${p.panorama ? `SCRB ${p.panorama.script}'s first view of tBMP ${p.panorama.sheet}, in SHPL ${p.background}` : `tBMP ${id} in SHPL ${id}`}${p.hard ? ` <small>(${id === p.hard ? `tBMP ${p.background} at levels 1 and 2` : `tBMP ${p.hard} at levels 3 and 4`})</small>` : ''}</td></tr>`
    + '</table>';
  const pic = jPicture(key);
  if (!entry) html += `<p class="warn">${esc(key)}.MHK is not among the files opened, so its picture cannot be drawn.</p>`;
  else if (pic === 'fetching') html += `<p class="note">Fetching ${esc(key.toLowerCase())}.mhk from archive.org…</p>`;
  else if (pic === 'unfetched') html += `<p class="note">Its picture is in ${esc(key.toLowerCase())}.mhk, fetched from archive.org when you go in.</p>`;
  else if (pic === 'failed') html += `<p class="bad">Its picture could not be drawn${entry.error ? ': ' + esc(entry.error) : ''}.</p>`;
  if (p.kind === 'puzzle' && ZB_PUZZLES.has(key)) html += puzzlePanel(key);
  html += helpPanel(p);
  if (p.kind === 'puzzle') html += `<h3>The roads, at a level</h3>${levelLegend()}`;
  return html;
}

/* A puzzle's rules at the level picked, and one dealt, if asked for. */
function puzzlePanel(key) {
  const z = ZB_PUZZLES.get(key), lv = z.levels[JVIEW.level - 1];
  let html = `<h3>The puzzle, level ${JVIEW.level}: ${esc(ZB_LEVELS[JVIEW.level - 1])}</h3><p>${esc(z.about)}</p>`
    + `<table class="kv"><tr><td>hidden</td><td>${esc(lv.rule)}</td></tr><tr><td>chances</td><td>${esc(lv.chances)}</td></tr></table>`
    + (lv.notes || []).map(n => `<p class="note">${esc(n)}</p>`).join('');
  const sizes = Array.from({ length: 16 }, (_, i) => 16 - i);
  const dealt = JVIEW.deal && JVIEW.deal.key === key ? JVIEW.deal : null;
  const solveHref = `#solve=${key}${JVIEW.level !== 1 ? '&level=' + JVIEW.level : ''}${dealt ? `&deal=${dealt.seed}${dealt.size !== 16 ? '&size=' + dealt.size : ''}` : ''}`;
  html += `<div class="actions"><button data-deal="${key}">${JVIEW.deal && JVIEW.deal.key === key ? 'Deal another' : 'Deal one'}</button>`
    + ` <a class="btn" href="${solveHref}">Solve it${dealt ? ', this one' : ''}</a>`
    + `<label class="note">for <select data-bandsize>${sizes.map(n => `<option${n === JVIEW.bandSize ? ' selected' : ''}>${n}</option>`).join('')}</select> Zoombinis</label></div>`;
  if (JVIEW.deal && JVIEW.deal.key === key) html += dealtPanel(key);
  return html + `<p class="note">${esc(z.source)}</p>`;
}

function dealtPanel(key) {
  const { seed, size } = JVIEW.deal;
  // A puzzle whose layout is in its archive is dealt once that has come.
  for (const name of zbDealNeeds(key)) {
    const entry = ARCHIVES.get(name);
    if (!entry) return `<p class="warn">Its layout is in ${esc(name)}.MHK, which is not among the files opened.</p>`;
    if (!entry.bytes && entry.remote && !entry.error) {
      ensureBytes(entry).then(() => { if (JVIEW.deal && JVIEW.deal.key === key) mapPanel(); });
      return `<p class="note">Its layout is in ${esc(name.toLowerCase())}.mhk: fetching it from archive.org…</p>`;
    }
    if (!openedArchive(entry)) return `<p class="bad">Its layout is in ${esc(name)}.MHK, which could not be read${entry.error ? ': ' + esc(entry.error) : ''}.</p>`;
  }
  let d;
  try { d = zbDealAt(key, JVIEW.level, seed, size, name => openedArchive(ARCHIVES.get(name))); }
  catch (e) { return `<p class="bad">It could not be dealt: ${esc(e.message)}</p>`; }
  const T = ZB_TRAIT_SHORT;
  const rows = d.band.map((b, i) => `<tr><td class="num">${i + 1}</td><td>${esc(T.hair[b.hair - 1])}</td><td>${esc(T.eyes[b.eyes - 1])}</td>`
    + `<td>${esc(T.nose[b.nose - 1])}</td><td>${esc(T.feet[b.feet - 1])}</td><td class="mark">${esc(d.marks[i] || '')}</td></tr>`).join('');
  return '<div class="dealt">' + d.setup.map(l => `<p>${esc(l)}</p>`).join('')
    + `<details${JVIEW.answerOpen ? ' open' : ''}><summary>The answer, and the band</summary>`
    + d.answer.map(l => `<p>${esc(l)}</p>`).join('')
    + `<table class="plain band"><tr><th></th><th>hair</th><th>eyes</th><th>nose</th><th>feet</th><th></th></tr>${rows}</table></details>`
    + `<p class="note">Dealt with the program's own random numbers from seed ${seed}; the address deals it again.</p></div>`;
}

function helpPanel(p) {
  const z = ARCHIVES.get('ZOOMBINI');
  const id = p.kind === 'puzzle' ? p.help + 20 * (JVIEW.level - 1) : p.help;
  const head = p.kind === 'puzzle' ? `The help, level ${JVIEW.level}: ${esc(ZB_LEVELS[JVIEW.level - 1])}` : 'The help';
  if (!z) return `<h3>${head}</h3><p class="note">It is in ZOOMBINI.MHK, STRL ${id}, which is not among the files opened.</p>`;
  if (!z.bytes) {
    if (FETCHING.has('ZOOMBINI')) return `<h3>${head}</h3><p class="note">Fetching zoombini.mhk from archive.org…</p>`;
    return `<h3>${head}</h3><p class="note">It is in zoombini.mhk, STRL ${id}: <a data-fetch="ZOOMBINI">fetch</a> (24 MB).</p>`;
  }
  const arc = openedArchive(z);
  if (!arc || !arc.has('STRL', id)) return `<h3>${head}</h3><p class="warn">ZOOMBINI has no STRL ${id}.</p>`;
  const lines = parseStringList(arc.get('STRL', id));
  return `<h3>${head}</h3><div class="help">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div><p class="note"><a href="${link('ZOOMBINI', 'STRL', id)}">ZOOMBINI STRL ${id}</a></p>`;
}

/* ---- pointing ------------------------------------------------------------ */

/* The place under a point: its window once it has mostly opened, its icon
   (and a little round it) before. */
function mapPlaceAt(sx, sy) {
  for (let i = JDRAWN.length - 1; i >= 0; i--) {
    const d = JDRAWN[i];
    if (d.t >= 0.5) { if (sx >= d.x && sy >= d.y && sx <= d.x + d.W && sy <= d.y + d.H) return d.key; continue; }
    const [x0, y0] = mapToScreen(d.p.x, d.p.y), [x1, y1] = mapToScreen(d.p.x + d.p.w, d.p.y + d.p.h), m = 6;
    if (sx >= x0 - m && sy >= y0 - m && sx <= x1 + m && sy <= y1 + m) return d.key;
  }
  return null;
}

function mapZoomAt(sx, sy, k) {
  if (JMOVING) return;
  const [wx, wy] = mapToWorld(sx, sy);
  JCAM.s = jClamp(JCAM.s * k, mapSMin(), mapSMax());
  JCAM.x = wx - (sx - JCW / 2) / JCAM.s; JCAM.y = wy - (sy - JCH / 2) / JCAM.s;
  mapRedraw();
}

function mapHoverAt(sx, sy) {
  const h = JMOVING ? null : mapPlaceAt(sx, sy);
  const was = JVIEW.hover;
  JVIEW.hover = h === JVIEW.place ? null : h;
  $('jmap').style.cursor = JVIEW.hover ? 'pointer' : '';
  if (was !== JVIEW.hover) mapRedraw();
}

/* A tap picks a place; a second tap on it, or a double tap, goes in. From
   inside a place, a tap on a neighbour goes straight to it. */
function mapTapAt(sx, sy, dbl) {
  if (JMOVING) return;
  const key = mapPlaceAt(sx, sy);
  if (key && key === JVIEW.place) return;
  if (key && (dbl || JVIEW.sel === key || JVIEW.place)) { mapEnter(key); return; }
  if (!key && JVIEW.place) return;
  JVIEW.sel = key;
  mapWriteHash(true);
  mapCrumbs();
  mapPanel();
  mapRedraw();
}

function wireJourney() {
  const cv = $('jmap');
  const pointers = new Map();
  let drag = null, pinch = null, moved = false, lastTap = 0;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    moved = false;
    if (pointers.size === 1) drag = { x: e.offsetX, y: e.offsetY, c: { ...JCAM } };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), c: { ...JCAM }, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = null;
    }
  });
  cv.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (JMOVING) return;
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
      const [wx, wy] = mapToWorld(pinch.mx, pinch.my, pinch.c);
      JCAM.s = jClamp(pinch.c.s * k, mapSMin(), mapSMax());
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      JCAM.x = wx - (mx - JCW / 2) / JCAM.s; JCAM.y = wy - (my - JCH / 2) / JCAM.s;
      moved = true;
      mapRedraw();
      return;
    }
    if (drag) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      cv.classList.add('dragging');
      JCAM.x = drag.c.x - dx / JCAM.s; JCAM.y = drag.c.y - dy / JCAM.s;
      mapRedraw();
      return;
    }
    mapHoverAt(e.offsetX, e.offsetY);
  });
  const end = e => {
    pointers.delete(e.pointerId);
    cv.classList.remove('dragging');
    if (pointers.size < 2) pinch = null;
    if (drag && !moved && pointers.size === 0) {
      const now = performance.now(), dbl = now - lastTap < 350;
      lastTap = now;
      mapTapAt(e.offsetX, e.offsetY, dbl);
    }
    if (pointers.size === 0) drag = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (JVIEW.hover) { JVIEW.hover = null; mapRedraw(); } });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    mapZoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
  }, { passive: false });

  $('jzoomIn').onclick = () => mapZoomAt(JCW / 2, JCH / 2, 1.5);
  $('jzoomOut').onclick = () => mapZoomAt(JCW / 2, JCH / 2, 1 / 1.5);
  $('jfit').onclick = () => mapGo(JVIEW.place ? mapPlaceView(JVIEW.place) : JHOME);
  const setLevel = n => {
    JVIEW.level = n;
    $('jlevel').value = String(n);
    mapWriteHash(true);
    mapPanel();
    mapRedraw();
  };
  $('jlevel').onchange = () => setLevel(+$('jlevel').value);

  const onClick = e => {
    const a = e.target.closest('[data-sel],[data-go],[data-level],[data-fetch],[data-deal],[data-nosave]');
    if (!a || $('journey').hidden) return;
    e.preventDefault();
    const d = a.dataset;
    if (a.hasAttribute('data-nosave')) { JSAVE = null; mapPanel(); mapRedraw(); }
    else if (d.level) setLevel(+d.level);
    else if (d.deal) {
      JVIEW.deal = { key: d.deal, seed: 1 + Math.floor(Math.random() * 0x7fffffff), size: JVIEW.bandSize };
      mapWriteHash(true);
      mapPanel();
    }
    else if (d.go === 'map') mapLeave();
    else if (d.go === 'in') mapEnter(d.key);
    else if (d.fetch) { ensureBytes(ARCHIVES.get(d.fetch)).then(mapPanel); mapPanel(); }
    else if (d.sel) {
      // From inside a place, to the next; on the map, picked and brought round.
      if (JVIEW.place) { mapEnter(d.sel); return; }
      JVIEW.sel = d.sel;
      mapWriteHash(true);
      mapCrumbs();
      mapPanel();
      const p = jOnMap(d.sel), [x, y] = mapToScreen(p.cx, p.cy);
      if (x < 0 || y < 0 || x > JCW || y > JCH) mapGo({ x: p.cx, y: p.cy, s: JCAM.s });
      else mapRedraw();
    }
  };
  $('jpanel').addEventListener('click', onClick);
  $('jpanel').addEventListener('change', e => {
    if (!e.target.matches('[data-bandsize]')) return;
    JVIEW.bandSize = +e.target.value;
    if (JVIEW.deal) { JVIEW.deal.size = JVIEW.bandSize; mapWriteHash(true); mapPanel(); }
  });
  // Whether the answer is open outlives the panel being drawn again.
  $('jpanel').addEventListener('toggle', e => { if (e.target.closest('.dealt')) JVIEW.answerOpen = e.target.open; }, true);
  $('crumbs').addEventListener('click', onClick);

  window.addEventListener('keydown', e => {
    if ($('journey').hidden || !JMAP || e.target.closest('input, select, textarea')) return;
    if (e.key === 'Escape') {
      if (JVIEW.place) mapLeave();
      else if (JVIEW.sel) { JVIEW.sel = null; mapWriteHash(true); mapCrumbs(); mapPanel(); mapRedraw(); }
    } else if (e.key === '+' || e.key === '=') mapZoomAt(JCW / 2, JCH / 2, 1.5);
    else if (e.key === '-') mapZoomAt(JCW / 2, JCH / 2, 1 / 1.5);
    else if (e.key === 'Enter' && JVIEW.sel && JVIEW.sel !== JVIEW.place) mapEnter(JVIEW.sel);
  });
  new ResizeObserver(() => { if (!$('journey').hidden) mapResize(); }).observe($('jstage'));
}

wireJourney();
