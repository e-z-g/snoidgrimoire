/* zb-shot-slides.js -- Stone Rise read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-slides.js.

   The field. The program draws each of the 117 cells (13 rows of 9) from
   SLIDES tBMP 7000 with its corner at zbSlidesCellXY, each sprite at its
   SCRB record minus (308, 152), the first record of SCRB 7000. A cell with
   no stone is SCRB 7001, shape 97. Every other cell is SCRB 7000, and
   of its shapes the program draws: shape 98, the gray stone, always; shape 109,
   red, over it for a satisfied joining stone, a base or a lit stone (110,
   blue, in level 4's other look); shape 103, the orange outline, for an
   empty stone to stand on; 74, 76, 75 or 73 for a joining stone that
   shows hair, eyes, nose or feet; and the arcs 24, 4 and 8 for a link to
   the north-east, north-west and west, so that each link shows on one
   of its two cells only.
   zbShotSlidesCells compares each look with the frame at each cell. A
   stone with a Zoombini on it shows neither outline nor icon. It is gray
   until it lights and red or blue from then on.

   The Zoombinis. One on a stone stands at the cell's corner plus (24, -5),
   and the others wait or walk off the field. The base reader reads them,
   and zbShotSlidesCovered marks the pixels their parts cover, so that the
   stones between them still read. An arc or icon under a Zoombini is
   unread, and an arc unread counts as a link between a stone and a
   joining stone or within a base, which is what the deals always have.

   The rise. Once the arrow is pressed, SCRB 7002 raises the lit stones,
   the joining stones and base between them: frames 2 to 6 draw a pillar
   (shapes 86-90) with the cell's top 18, 27, 42, 57 and 73 pixels higher,
   and with no outline or icon. The reader reads a risen top at each of
   those heights. The cells a pillar hides are unread, and the stones that
   rose with no one on them look like the joining stones and base that
   rose, so after the rise the reader counts the cells and stops.

   What follows. From the cells read the reader builds the field as
   zb-puzzle-slides.js has it: a red or blue plain cell with no one on it
   is a base if it lies in the right-hand column or joins one, and
   otherwise a satisfied plain joining stone. The layout gives the level
   (zbShotSlidesLevel). zbSlidesGraph and zbSlidesRisen then give the
   stones that would rise as the band stands, the joining stones the
   Zoombinis satisfy, and zbSlidesSolve the most that can cross and one
   placement. There is no link to the solve page, which deals a new field
   from the band.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_slides.cpp:
   ensureCellFeature and filterHotspotScript for which shapes of SCRB 7000
   show, cellLinkOverlay_preRender for the arcs, getCellSnoidPosition for
   where a Zoombini stands, and beginSolvedDepartureSequence for the rise
   (SCRB 7002). Screenshots taken in the game on 16 November 2026, at all
   four levels and in both looks of level 4, matched each.
*/

/* The cells' sheet and scripts, SCRB 7000's first record (the corner of a
   cell at zbSlidesCellXY), and where a Zoombini on a stone stands from
   the cell's corner. */
const ZB_SHOT_SLIDES = { sheet: 7000, cell: 7000, inert: 7001, origin: [308, 152], stand: [24, -5],
  rise: 7002, gray: 98, red: 109, blue: 110, none: 97, outline: 103, icons: [74, 76, 75, 73], arcs: [24, 4, 8] };

/* The pieces of SCRB 7000 and 7001 by shape, each { sprite, x, y } from a
   cell's corner. */
function zbShotSlidesPieces(arc) {
  const sprites = decodeBitmapResource(arc.get('tBMP', ZB_SHOT_SLIDES.sheet)).frames;
  const [ox, oy] = ZB_SHOT_SLIDES.origin, at = {};
  for (const id of [ZB_SHOT_SLIDES.cell, ZB_SHOT_SLIDES.inert]) {
    for (const r of parseScript(arc.get('SCRB', id), 'SCRB').frames[0].records) at[r.shape] = { sprite: sprites[r.shape - 1], x: r.x - ox, y: r.y - oy };
  }
  return at;
}

/* A drawing of `pieces` kept to the pixels of `mask` (pieces too), so that
   two drawings compare on the same pixels. */
function zbShotSlidesOn(env, pieces, mask) {
  const d = zbShotDrawing(env, pieces);
  const covers = (x, y) => mask.some(m => {
    const u = x - m.x, v = y - m.y;
    return u >= 0 && v >= 0 && u < m.sprite.width && v < m.sprite.height && m.sprite.pixels[v * m.sprite.width + u];
  });
  const kept = [];
  for (let p = 0; p < d.points.length; p += 7) {
    if (covers(Math.round(d.points[p]), Math.round(d.points[p + 1]))) for (let k = 0; k < 7; k++) kept.push(d.points[p + k]);
  }
  return { ...d, points: kept, count: kept.length / 7 };
}

/* The best of several drawings at (X, Y): { best, fit, margin }, `best`
   the index, `margin` its value over the next's. */
function zbShotSlidesBest(env, drawings, X, Y, skip) {
  const fits = drawings.map(d => zbShotDrawingFit(env, d, X, Y, skip));
  let best = 0;
  fits.forEach((f, i) => { if (f.value > fits[best].value) best = i; });
  const next = Math.max(-Infinity, ...fits.filter((_, i) => i !== best).map(f => f.value));
  return { best, fit: fits[best], margin: fits[best].value - next };
}

/* The heights a cell rises through, from SCRB 7002's frames 2-6 (the
   rise, ScummVM's beginSolvedDepartureSequence): how far each frame
   draws the cell's top above its place. */
function zbShotSlidesHeights(arc) {
  const frames = parseScript(arc.get('SCRB', ZB_SHOT_SLIDES.rise), 'SCRB').frames;
  return frames.slice(2).map(f => f.records.find(r => r.shape === ZB_SHOT_SLIDES.red)).filter(Boolean).map(r => ZB_SHOT_SLIDES.origin[1] - r.y);
}

/* The 117 cells read: [{ look, height, outline, icon, arcs, fit }] by
   cell. `look` is 'none', 'gray', 'red' or 'blue', `height` how far the
   cell has risen (0 where it has not), `outline` whether the orange
   outline of an empty stone shows, `icon` the trait shown (0-3, hair,
   eyes, nose, feet) or -1, `arcs` the NE, NW and W arcs, each true or
   false; any of them null where too little shows to read it. A risen
   cell shows neither outline nor icon. */
function zbShotSlidesCells(env, skip) {
  const P = zbShotSlidesPieces(env.arc), S = ZB_SHOT_SLIDES;
  const looks = [[P[S.none]], [P[S.gray]], [P[S.gray], P[S.red]], [P[S.gray], P[S.blue]]];
  const lookNames = ['none', 'gray', 'red', 'blue'], heights = looks.map(() => 0);
  /* a risen cell's top, red or blue, at each height of the rise */
  for (const h of zbShotSlidesHeights(env.arc)) {
    for (const shape of [S.red, S.blue]) {
      looks.push([{ ...P[shape], y: P[shape].y - h }]);
      lookNames.push(shape === S.red ? 'red' : 'blue');
      heights.push(h);
    }
  }
  const lookDrawings = looks.map(l => zbShotDrawing(env, l));
  const sprites = decodeBitmapResource(env.arc.get('tBMP', S.sheet)).frames;
  const out = [];
  const cache = new Map(), drawn = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) {
    const { x: X, y: Y } = zbSlidesCellXY(c);
    const lk = zbShotSlidesBest(env, lookDrawings, X, Y, null);
    const cell = { look: null, height: 0, outline: null, icon: null, arcs: [null, null, null], fit: lk.fit.fit, margin: lk.margin };
    out.push(cell);
    if (lk.fit.matched < 60 || lk.margin < 8 || (heights[lk.best] && lk.fit.fit < 0.3)) continue;
    cell.look = lookNames[lk.best];
    cell.height = heights[lk.best];
    if (cell.look === 'none') continue;
    const base = looks[lk.best], h = cell.height;
    S.arcs.forEach((shape, k) => {
      const arcs = [0, 24, 48].map(v => drawn(`a${shape + v},${h}`, () => zbShotDrawing(env, [{ ...P[shape], y: P[shape].y - h, sprite: sprites[shape + v - 1] }])));
      const a = zbShotSlidesBest(env, arcs, X, Y, skip);
      if (a.fit.shown < 0.4) return;
      if (a.fit.fit >= 0.6) cell.arcs[k] = true;
      else if (a.fit.fit <= 0.3) cell.arcs[k] = false;
    });
    if (h) { cell.outline = false; cell.icon = -1; continue; }
    const ol = zbShotSlidesBest(env, drawn(`o${lk.best}`, () => [base, [...base, P[S.outline]]].map(p => zbShotSlidesOn(env, p, [P[S.outline]]))), X, Y, skip);
    if (ol.fit.shown >= 0.4 && ol.margin >= 6) cell.outline = ol.best === 1;
    const icons = S.icons.map(s => P[s]);
    const ic = zbShotSlidesBest(env, drawn(`i${lk.best}`, () => [base, ...icons.map(i => [...base, i])].map(p => zbShotSlidesOn(env, p, icons))), X, Y, skip);
    if (ic.fit.shown >= 0.2 && ic.margin >= 4) cell.icon = ic.best - 1;
  }
  /* a risen cell's pillar and top hide the cells behind it: any other cell
     a quarter of whose box lies in a risen one's is left unread */
  const W = P[S.gray].sprite.width, H = P[S.gray].sprite.height;
  out.forEach((cell, c) => {
    if (!cell.height) return;
    const a = zbSlidesCellXY(c);
    out.forEach((other, d) => {
      if (d === c || other.height || other.look == null) return;
      const b = zbSlidesCellXY(d);
      const w = Math.min(a.x, b.x) + W - Math.max(a.x, b.x);
      const overlap = Math.max(0, w) * Math.max(0, Math.min(a.y + H, b.y + H) - Math.max(a.y - cell.height, b.y));
      if (overlap * 4 > W * H) Object.assign(other, { look: null, outline: null, icon: null, arcs: [null, null, null] });
    });
  });
  return out;
}

/* The pixels the Zoombinis cover, for zbShotDrawingFit's `skip`: each
   part's sprite where it was found, one pixel wider all round, so that the
   stones between and behind Zoombinis still read. A Zoombini read without
   its parts, as from a smoothed screenshot, covers its standing pose
   (zbZoombiniPlacements), with an unread trait drawn as the first value,
   two pixels wider all round. */
function zbShotSlidesCovered(env, zoombinis) {
  const skip = new Uint8Array(ZB_SHOT_W * ZB_SHOT_H), sheet = zbSnoidSheet(env.archives.get('ZOOMBINI'));
  for (const z of zoombinis) {
    let parts = Object.values(z.parts || {}), wide = 1;
    if (!parts.length) {
      const traits = Object.fromEntries(ZB_SHOT_TRAITS.map(k => [k, z.traits[k] ?? 1]));
      parts = zbZoombiniPlacements(sheet, traits).map(p => ({ frame: p.frame, x: z.x + p.x, y: z.y + p.y }));
      wide = 2;
    }
    for (const p of parts) {
      const f = sheet.frames[p.frame];
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          if (!f.pixels[y * f.width + x]) continue;
          for (let v = -wide; v <= wide; v++) {
            for (let u = -wide; u <= wide; u++) {
              const X = p.x + x + u, Y = p.y + y + v;
              if (X >= 0 && Y >= 0 && X < ZB_SHOT_W && Y < ZB_SHOT_H) skip[Y * ZB_SHOT_W + X] = 1;
            }
          }
        }
      }
    }
  }
  return skip;
}

/* The cell NE, NW or W of a cell (zbSlidesLinks's neighbors), or -1. */
function zbShotSlidesNeighbor(c, k) {
  const row = Math.floor(c / 9), col = c % 9, odd = row % 2 === 1;
  if (k === 2) return col > 0 ? c - 1 : -1;
  if (row === 0) return -1;
  if (k === 0) return odd ? (col < 8 ? c - 8 : -1) : c - 9;
  return odd ? c - 9 : (col > 0 ? c - 10 : -1);
}

/* The field as the cells read show it, for zbSlidesGraph, zbSlidesRisen
   and zbSlidesSolve: { kinds, f, state, unread }. `kinds` is each cell's
   kind, one of 'none', 'stone', 'base', 'join' or null for unread; `on`
   (per cell, the Zoombini's index in `zoombinis` or -1) gives the stones
   with a Zoombini, and a risen cell with no one on it is 'risen', since
   the rise draws no outline or icon. An arc hidden by a Zoombini counts as a link where the
   cells either side are a stone and a joining stone, or two cells of a
   base. `f` is null where a cell of the field is unread. */
function zbShotSlidesField(cells, on) {
  const kinds = cells.map((c, i) => {
    if (c.look == null) return null;
    if (c.look === 'none') return 'none';
    if (on[i] >= 0 || c.outline) return 'stone';
    if (c.height) return 'risen';
    if (c.icon == null) return null;
    if (c.icon >= 0 || c.look === 'gray') return 'join';
    return 'colored';
  });
  /* a colored plain cell with no one on it is a base if it lies in the
     right-hand column or is joined to a base by an arc, or by an arc
     hidden; otherwise it is a satisfied plain joining stone */
  const linked = (a, b) => {
    for (let k = 0; k < 3; k++) {
      if (zbShotSlidesNeighbor(a, k) === b && cells[a].arcs[k] !== false) return true;
      if (zbShotSlidesNeighbor(b, k) === a && cells[b].arcs[k] !== false) return true;
    }
    return false;
  };
  const queue = [];
  kinds.forEach((k, i) => { if (k === 'colored' && i % 9 === 0) { kinds[i] = 'base'; queue.push(i); } });
  while (queue.length) {
    const a = queue.pop();
    for (let b = 0; b < ZB_SLIDES_CELLS; b++) if (kinds[b] === 'colored' && linked(a, b)) { kinds[b] = 'base'; queue.push(b); }
  }
  kinds.forEach((k, i) => { if (k === 'colored') kinds[i] = 'join'; });
  const unread = kinds.filter(k => k == null).length;
  if (unread || kinds.includes('risen')) return { kinds, f: null, unread };
  const blue = cells.some(c => c.look === 'blue');
  const base = blue ? ZB_SLIDES_BASE + 1 : ZB_SLIDES_BASE;
  const state = kinds.map(k => (k === 'none' ? ZB_SLIDES_INERT : k === 'stone' ? ZB_SLIDES_SLOT : k === 'base' ? base : ZB_SLIDES_PATH));
  const data = cells.map((c, i) => (kinds[i] === 'join' && c.icon >= 0 ? ZB_SLIDES_HAIR + c.icon : 0));
  const mask = new Array(ZB_SLIDES_CELLS).fill(0);
  const bits = [[ZB_SLIDES_NE, ZB_SLIDES_SW], [ZB_SLIDES_NW, ZB_SLIDES_SE], [ZB_SLIDES_W, ZB_SLIDES_E]];
  cells.forEach((c, i) => c.arcs.forEach((arc, k) => {
    const n = zbShotSlidesNeighbor(i, k);
    if (n < 0 || kinds[i] === 'none' || kinds[n] === 'none') return;
    const pair = [kinds[i], kinds[n]].sort().join(' ');
    if (arc || (arc == null && (pair === 'join stone' || pair === 'base base' || pair === 'base stone'))) {
      mask[i] |= bits[k][0];
      mask[n] |= bits[k][1];
    }
  }));
  const f = { level: null, state, data, mask, link: new Array(ZB_SLIDES_CELLS * 6).fill(-1), base,
    slots: state.map((s, i) => (s === ZB_SLIDES_SLOT ? i : -1)).filter(i => i >= 0) };
  zbSlidesLinks(f);
  return { kinds, f, unread: 0 };
}

/* The level the layout gives, or null: level 4 in the blue look; with
   arcs across rows, 3 or 4 by which fixed pattern has every stone; with
   arcs along rows only, 1 for pairs, 2 for chains of three, 4 for the
   short chain of a band of five or fewer. */
function zbShotSlidesLevel(cells, f) {
  if (cells.some(c => c.look === 'blue')) return 4;
  const stones = f.slots;
  if (cells.some(c => c.arcs[0] || c.arcs[1])) {
    const in3 = stones.every(s => ZB_SLIDES_L3_STONES.includes(s)), in4 = stones.every(s => ZB_SLIDES_L4_STONES.includes(s));
    return in3 && !in4 ? 3 : in4 && !in3 ? 4 : null;
  }
  const rows = new Map();
  for (const s of stones) rows.set(Math.floor(s / 9), (rows.get(Math.floor(s / 9)) || 0) + 1);
  const most = Math.max(0, ...rows.values());
  if (most >= 4 || (stones.includes(44) && stones.includes(55))) return 4;
  if (most === 3) return 2;
  return most === 2 && rows.size >= 2 ? 1 : null;
}

/* A cell read as one letter for `state.cells`: '.' no stone, 'o' an empty
   stone, 'z' a stone with a Zoombini that has not lit, 'Z' a lit one, 'b' a
   base, 'p' a plain joining stone, 'P' a satisfied one, 'h', 'e', 'n' and
   'f' a joining stone that shows hair, eyes, nose or feet, in capitals
   when satisfied, 'u' a risen cell with no one on it, 'U' a risen stone
   with a Zoombini, and '?' a cell unread. */
function zbShotSlidesLetter(cell, kind, standing) {
  if (kind == null) return '?';
  if (cell.height) return standing ? 'U' : 'u';
  if (kind === 'none') return '.';
  if (kind === 'base') return 'b';
  const lit = cell.look !== 'gray';
  if (kind === 'stone') return standing ? (lit ? 'Z' : 'z') : 'o';
  const letter = cell.icon >= 0 ? 'henf'[cell.icon] : 'p';
  return lit ? letter.toUpperCase() : letter;
}

/* Stone Rise. Returns { cells, kinds, level, stones, zoombinis, state,
   lines, link }: `cells` zbShotSlidesCells's, `kinds` zbShotSlidesField's,
   `stones` the stones in the game's reading order (zbSlidesNumbers), each
   { cell, zoombini } with the Zoombini standing there or null. */
function zbShotSlides(frame, zoombinis) {
  const env = zbShotEnv(frame);
  const cells = zbShotSlidesCells(env, zbShotSlidesCovered(env, zoombinis));
  const [sx, sy] = ZB_SHOT_SLIDES.stand;
  const stands = [];
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) { const p = zbSlidesCellXY(c); stands.push(p.x + sx, p.y + sy - cells[c].height); }
  const on = new Array(ZB_SLIDES_CELLS).fill(-1), waiting = [];
  zoombinis.forEach((z, i) => {
    const c = zbShotPlaceIn(stands, z.x, z.y);
    if (c >= 0 && cells[c].look && cells[c].look !== 'none' && on[c] < 0) on[c] = i;
    else waiting.push(z);
  });
  const { kinds, f } = zbShotSlidesField(cells, on);
  const letters = cells.map((c, i) => zbShotSlidesLetter(c, kinds[i], on[i] >= 0));
  const rows = Array.from({ length: 13 }, (_, r) => letters.slice(9 * r, 9 * r + 9).reverse().join(''));
  const code = z => ZB_SHOT_TRAITS.map(k => z.traits[k] ?? '?').join('');
  const lines = [], count = (k, one, many = one + 's') => `${k === 1 ? 'One' : k || 'No'} ${k === 1 ? one : many}`;
  const stoneCells = kinds.map((k, i) => (k === 'stone' ? i : -1)).filter(i => i >= 0);
  const number = zbSlidesNumbers(stoneCells);
  const stones = stoneCells.slice().sort((a, b) => number.get(a) - number.get(b)).map(cell => ({ cell, zoombini: on[cell] >= 0 ? zoombinis[on[cell]] : null }));
  for (const s of stones) if (s.zoombini) s.zoombini.where = `on stone ${number.get(s.cell)}`;
  for (const z of waiting) z.where = 'waiting';
  const standing = stones.filter(s => s.zoombini);
  const band = [...standing.map(s => s.zoombini), ...waiting];
  const level = f ? zbShotSlidesLevel(cells, f) : null;
  if (!stoneCells.length) {
    return { cells, kinds, level: null, stones, zoombinis: band, state: { cells: null },
      lines: ['The page found no stones to stand on, so it could not read the field.'], link: null };
  }
  const unread = letters.filter(l => l === '?').length;
  const risen = cells.filter(c => c.look && c.height).length;
  if (risen) {
    /* the rise draws no outline or icon, so the stones that rose with no
       one on them are not known, and the numbers would not be the game's */
    const up = standing.filter(s => cells[s.cell].height);
    for (const s of standing) s.zoombini.where = cells[s.cell].height ? 'on a risen stone' : 'on a stone that did not rise';
    for (const z of waiting) z.where = 'off the stones';
    lines.push(`The arrow has been pressed and ${risen === 1 ? 'one cell has' : `${risen} cells have`} risen. ${count(up.length, 'Zoombini stands', 'Zoombinis stand')} on risen stones and go on,`
      + ` ${standing.length - up.length === 1 ? 'one stands on a stone' : `${standing.length - up.length || 'none'} stand on stones`} that did not rise, and ${waiting.length === 1 ? 'one is' : `${waiting.length || 'none'} are`} off the stones.`);
    if (unread) lines.push(`The risen stones hide ${unread === 1 ? 'one cell' : `${unread} cells`} behind them, which the page leaves unread.`);
    return { cells, kinds, level: null, stones: null, zoombinis: band, lines, link: null,
      state: { level: null, cells: rows, risen, aboard: up.length, stayed: standing.length - up.length, off: waiting.length } };
  }
  lines.push(`The field has ${stones.length} ${stones.length === 1 ? 'stone' : 'stones'} to stand on`
    + `${level ? `, laid out as at level ${level}, ${ZB_LEVELS[level - 1]}` : ''}. The page numbers the stones in reading order, the top row first and each row from left to right.`);
  if (unread) lines.push(`Something covers ${unread === 1 ? 'one cell' : `${unread} cells`} of the field, so the page reads ${unread === 1 ? 'it' : 'them'} as unknown and works out nothing that needs the whole field.`);
  lines.push(`${count(standing.length, 'Zoombini stands', 'Zoombinis stand')} on the stones and ${waiting.length === 1 ? 'one waits' : `${waiting.length || 'none'} wait`}.`);
  const lit = standing.filter(s => cells[s.cell].look !== 'gray');
  if (standing.length) lines.push(lit.length === standing.length ? `Every stone with a Zoombini on it is lit.`
    : `${lit.length ? `${lit.length === 1 ? 'Stone' : 'Stones'} ${zbWordsOr(lit.map(s => String(number.get(s.cell))), 'and')} ${lit.length === 1 ? 'is' : 'are'} lit, so ${lit.length === 1 ? 'its Zoombini goes' : 'their Zoombinis go'} on when the arrow is pressed.` : 'No stone is lit.'}`);
  let satisfied = null, solve = null;
  const complete = band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  if (f && complete) {
    f.level = level;
    const traits = band.map(z => z.traits), g = zbSlidesGraph(f);
    const place = g.stones.map(c => (on[c] >= 0 ? band.indexOf(zoombinis[on[c]]) : -1));
    const risen = zbSlidesRisen(g, traits, place);
    /* a joining stone with a trait is satisfied when the two either side
       have the same value of it */
    satisfied = g.joins.filter(j => j.kind >= 0 && place[j.a] >= 0 && place[j.b] >= 0
      && traits[place[j.a]][ZB_TRAIT_KINDS[j.kind]] === traits[place[j.b]][ZB_TRAIT_KINDS[j.kind]])
      .map(j => [number.get(g.stones[j.a]), number.get(g.stones[j.b])].sort((a, b) => a - b).join('-'));
    const marks = g.joins.filter(j => j.kind >= 0 && place[j.a] >= 0 && place[j.b] >= 0).length;
    if (marks) {
      lines.push(satisfied.length ? `Of the ${marks} joining stones that show a trait between two Zoombinis, ${satisfied.length === marks ? 'all are' : `${satisfied.length} ${satisfied.length === 1 ? 'is' : 'are'}`} satisfied, between stones ${zbWordsOr(satisfied.map(p => p.replace('-', ' with ')), 'and')}.`
        : `None of the ${marks} joining stones that show a trait between two Zoombinis is satisfied.`);
    }
    const rising = g.stones.filter((c, i) => risen[i]).map(c => number.get(c));
    lines.push(rising.length ? `As they stand, ${rising.length === 1 ? 'stone' : 'stones'} ${zbWordsOr(rising.map(String), 'and')} would rise.` : 'As they stand, no stone would rise.');
    const misread = g.stones.filter((c, i) => risen[i] !== (cells[c].look !== 'gray' && on[c] >= 0));
    if (misread.length) lines.push(`That differs from the lit stones on the screen at ${misread.length === 1 ? 'stone' : 'stones'} ${zbWordsOr(misread.map(c => String(number.get(c))), 'and')}, so the page may have misread a Zoombini or a stone.`);
    if (level && band.length) {
      const dealt = { slotCellState: f.base, slotCellIndices: f.slots, cellStates: f.state, cellData: f.data, cellLinks: f.link };
      const result = zbSlidesSolve(level, traits, dealt, { budget: 600 });
      const best = result.solutions[0];
      if (result.most != null) {
        solve = { most: result.most, place: best ? best.steps[0] : null };
        lines.push(`With the Zoombinis on the screen, at most ${result.most} of ${band.length} can cross.`
          + (best ? ` One way, with the Zoombinis numbered as in the page’s table, is this. ${best.steps[0]}` : ''));
      }
    }
  } else if (f) lines.push('Some Zoombini’s traits are unread, so the page does not work out which stones would rise.');
  const state = { level, cells: rows, stones: stones.map(s => (s.zoombini ? code(s.zoombini) : null)), waiting: waiting.length,
    satisfied };
  if (solve) state.most = solve.most;
  return { cells, kinds, level, stones, satisfied, solve, zoombinis: band, state, lines, link: null };
}

ZB_SHOT_PUZZLES.SLIDES = zbShotSlides;
