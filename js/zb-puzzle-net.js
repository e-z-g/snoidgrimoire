/* zb-puzzle-net.js -- Mudball Wall: a wall to get over, sections of it
   marked with dots, and a launcher that fires mudballs at it.
   =========================================================================
   Needs zb-puzzle.js.

   The band waits behind a wall. The player picks a mudball's colour and
   the shape on it (at levels 3 and 4 also the shape's colour) and fires
   it; where it lands is fixed by what was picked, by a rule hidden from
   the player. A few sections of the wall are marked with dots, 1, 2 or 3,
   and a mudball that lands on one sends that many Zoombinis over, the
   band going in its own order; a section counts once. The tank holds one
   mudball for each marked section and seven more (eight at level 4), and
   whoever is still behind the wall when it is empty stays behind. The
   Zoombinis' own traits play no part.

   The wall is 5 rows of 5 sections at levels 1 and 2, and at levels 3
   and 4 5 rows of 5 columns, each column 5 squares wide (125 in all). The
   rule gives each row a value and each column a value, and at levels 3
   and 4 each square within a column too; each is a value of one of the
   mudball's choices, dealt as orders of the five values:
     level 1: the mudball's colour picks the row and its shape the
              column, or the other way round (a coin toss);
     level 2: the same, but each row down moves the column's values 2 or
              3 places to the right, wrapping round;
     level 3: the mudball's colour picks the row, its shape the column and
              the shape's colour the square within it; the shape and the
              shape's colour follow the same order;
     level 4: which choice picks the row, the column and the square is
              one of six ways, drawn at random, and each square to the
              right within a column moves the row's values 2 or 3 places
              down, wrapping round.
   The marks are drawn at random, one for each group of the band: groups
   of 3, 2 and 1 in turn, taken off the first groups of two or more until
   they add up to the band, so 16 Zoombinis make eight marks.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_net.cpp and .h:
   computeTargetLaunchBatches, generateTraitRules,
   findTargetSlotForSelection, settleShotAtTargetSlot, loadFeatures (the
   tank), onPostRenderFrame (a shot used on each launch), debugGetAnswer
   and debugGetChances. Checked against the program's own code,
   ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z: the groups at 0x439090, the
   tank at 0x436244 (one more at level 4, then the number of marks, then
   7), each launch taking one at 0x436731, the rule at 0x437702 and the
   lookup of where a mudball lands at 0x438920. Every draw is as ScummVM
   has it, in the same order, including the third value drawn for each
   row, checked for repeats at levels 3 and 4 and then never used (the
   square within a column takes the column's order), the coin tossed at
   levels 1 to 3 that at level 3 only labels the program's debug display,
   and a coin at level 4 that the program zeroes before testing, so its
   other branch never runs (ScummVM draws it and drops it). One difference:
   at level 3 the program looks where a mudball lands through the six ways
   of level 4 by the one last drawn at level 4 in the same session, never
   reset (0 when the program starts, at 0x4b09d0), where ScummVM always
   uses the first; a deal here follows the program if the journey object
   it is given has been through a level 4 deal (journey.netWay). The Mac
   program's INSTALLTARGETS witnesses the same three things: the unused
   third value, the zeroed coin, and the way drawn only at level 4. The
   shot history, the sounds and the animations were not read. Draws the
   page makes before the rule, for where the launcher's choices start, are
   left out: the opening animation draws between them.
*/

/* A mudball's three choices, as the program numbers them: 0 the shape's
   colour (levels 3 and 4), 1 the shape, 2 the mudball's colour; each
   takes a value 0-4, named as ScummVM's kMudballSelectorValueNames. */
const ZB_NET_COLOURS = ['yellow', 'blue', 'green', 'red', 'purple'];
const ZB_NET_SHAPES = ['rectangle', 'triangle', 'star', 'circle', 'diamond'];
const ZB_NET_CHOICES = ['the shape’s colour', 'the shape', 'the mudball’s colour'];
/* Levels 3 and 4: the six ways, as the choice (0-2) that picks the row,
   the column and the square within the column. Level 3 uses the first. */
const ZB_NET_WAYS = [[2, 1, 0], [1, 2, 0], [0, 2, 1], [2, 0, 1], [1, 0, 2], [0, 1, 2]];
/* The tank: one mudball per mark and this many more; one more at level 4. */
const ZB_NET_SPARE_SHOTS = 7;

/* The band cut into groups, one a mark (computeTargetLaunchBatches,
   0x439090): 3, 2, 1, 3, 2, 1, ... until they reach the band, then the
   first groups of two or more one smaller each until they add up. */
function zbNetGroups(n) {
  const sizes = [];
  let left = n, size = 4;
  do {
    if (--size < 1) size = 3;
    sizes.push(size);
    left -= size;
  } while (left > 0);
  let excess = -left;
  while (excess > 0) {
    for (let i = 0; i < sizes.length && excess > 0; i++) if (sizes[i] >= 2) { sizes[i]--; excess--; }
    // Never taken with 16 or fewer, where trimming always settles it; the
    // program tests its list of marks here instead of the groups, which
    // comes to the same.
    if (excess > 0 && !sizes.some(s => s > 1)) return new Array(n).fill(1);
  }
  return sizes;
}

/* Rotate five values right by k: the value at i goes to i + k. */
function zbNetRotate(list, k) {
  const out = list.slice();
  for (let t = 0; t < k; t++) out.unshift(out.pop());
  return out;
}

/* The rule (generateTraitRules, 0x437702), from the groups: { rows, cols,
   subs, step, dots, labels, way }. rows, cols and subs give each section
   (row-major, 25 or 125, row 1 at the top and column 1 at the left) the
   value of the choice that picks its row, column and square; dots is how
   many Zoombinis each section sends, 0 for none. */
function zbNetRule(level, groups, rnd, way3 = 0) {
  const high = level >= 3, cells = high ? 125 : 25;
  const rows = new Array(cells).fill(0), cols = new Array(cells).fill(0), subs = new Array(cells).fill(0);
  const usedA = [0, 0, 0, 0, 0], usedB = [0, 0, 0, 0, 0], usedC = [0, 0, 0, 0, 0];
  for (let k = 0; k < 5; k++) {
    let a, b, c;
    for (;;) {
      a = rnd.number(4); b = rnd.number(4); c = rnd.number(4);
      if (!usedA[a] && !usedB[b] && (!high || !usedC[c])) break;
    }
    usedA[a]++; usedB[b]++; usedC[c]++;
    if (!high) {
      for (let i = 0; i < 5; i++) { rows[5 * k + i] = a; cols[5 * i + k] = b; }
    } else {
      // Row k, column k, and square k of every column; the square takes
      // b, the column's value, as the program has it, and c is not used.
      for (let i = 0; i < 25; i++) rows[25 * k + i] = a;
      for (let p = 0; p < 5; p++) for (let i = 0; i < 5; i++) cols[25 * p + 5 * k + i] = b;
      for (let r = 0; r < 5; r++) for (let p = 0; p < 5; p++) subs[25 * p + 5 * r + k] = b;
    }
  }
  let step = 0;
  if (level === 2) {
    step = rnd.number(1) + 2;
    let line = cols.slice(0, 5);
    for (let r = 1; r < 5; r++) {
      line = zbNetRotate(line, step);
      for (let i = 0; i < 5; i++) cols[5 * r + i] = line[i];
    }
  } else if (level === 4) {
    step = rnd.number(1) + 2;
    // A coin the program sets aside: it zeroes the result before testing
    // it, and the branch for the other side never runs.
    rnd.number(1);
    for (let p = 0; p < 5; p++) {
      for (let c = 1; c < 5; c++) {
        const line = zbNetRotate([0, 1, 2, 3, 4].map(r => rows[25 * r + 5 * p + c - 1]), step);
        for (let r = 0; r < 5; r++) rows[25 * r + 5 * p + c] = line[r];
      }
    }
  }
  const dots = new Array(cells).fill(0), marks = [];
  for (const size of groups) {
    let at;
    do at = rnd.number(cells - 1); while (dots[at] !== 0);
    dots[at] = size;
    marks.push(at);
  }
  let labels;
  if (level === 4) {
    do labels = [rnd.number(2), rnd.number(2), rnd.number(2)]; while (new Set(labels).size < 3);
  } else {
    labels = rnd.bool() ? [2, 1, 0] : [1, 2, 0];
  }
  const way = level === 4 ? rnd.number(5) : level === 3 ? way3 : 0;
  return { level, rows, cols, subs, step, dots, labels, way, at: marks };
}

/* The rule again from its parts, as the form gives them: the labels
   (levels 1 and 2) or the way (3 and 4), the values down the rows (in
   each column's first square at level 4) and along the columns (which the
   squares within a column follow at levels 3 and 4), the rotation, and
   the section of each group's mark, in group order. */
function zbNetRuleFrom(level, labels, way, rowOrder, colOrder, step, groups, at) {
  const high = level >= 3, cells = high ? 125 : 25;
  const rows = new Array(cells).fill(0), cols = new Array(cells).fill(0), subs = new Array(cells).fill(0);
  for (let k = 0; k < 5; k++) {
    if (!high) {
      for (let i = 0; i < 5; i++) { rows[5 * k + i] = rowOrder[k]; cols[5 * i + k] = colOrder[k]; }
    } else {
      for (let i = 0; i < 25; i++) rows[25 * k + i] = rowOrder[k];
      for (let p = 0; p < 5; p++) for (let i = 0; i < 5; i++) cols[25 * p + 5 * k + i] = colOrder[k];
      for (let r = 0; r < 5; r++) for (let p = 0; p < 5; p++) subs[25 * p + 5 * r + k] = colOrder[k];
    }
  }
  if (level === 2) {
    let line = cols.slice(0, 5);
    for (let r = 1; r < 5; r++) {
      line = zbNetRotate(line, step);
      for (let i = 0; i < 5; i++) cols[5 * r + i] = line[i];
    }
  } else if (level === 4) {
    for (let p = 0; p < 5; p++) for (let c = 1; c < 5; c++) {
      const line = zbNetRotate([0, 1, 2, 3, 4].map(r => rows[25 * r + 5 * p + c - 1]), step);
      for (let r = 0; r < 5; r++) rows[25 * r + 5 * p + c] = line[r];
    }
  }
  const dots = new Array(cells).fill(0);
  groups.forEach((size, i) => { dots[at[i]] = size; });
  return { level, rows, cols, subs, step: level === 2 || level === 4 ? step : 0, dots, labels: labels.slice(), way, at: at.slice() };
}

/* Which choice picks the row, the column and the square. At levels 1
   and 2 the coin's labels decide it; at 3 and 4 the way. */
function zbNetAxes(rule) {
  return rule.level <= 2 ? [rule.labels[0], rule.labels[1], -1] : ZB_NET_WAYS[rule.way];
}

/* Where a mudball lands, as the first section whose values are its
   choices (findTargetSlotForSelection, 0x438920); choice is [shape's
   colour, shape, mudball's colour], each 0-4. */
function zbNetLands(rule, choice) {
  const [ra, ca, sa] = zbNetAxes(rule);
  for (let i = 0; i < rule.rows.length; i++) {
    if (rule.rows[i] === choice[ra] && rule.cols[i] === choice[ca] && (sa < 0 || rule.subs[i] === choice[sa])) return i;
  }
  return -1;
}

/* The mudball that lands on a section: [shape's colour, shape, mudball's
   colour], the unused choice null. */
function zbNetMudball(rule, cell) {
  const [ra, ca, sa] = zbNetAxes(rule), choice = [null, null, null];
  choice[ra] = rule.rows[cell];
  choice[ca] = rule.cols[cell];
  if (sa >= 0) choice[sa] = rule.subs[cell];
  return choice;
}

function zbNetMudballWords(choice) {
  const [inner, shape, colour] = choice;
  return `a ${ZB_NET_COLOURS[colour]} mudball with a ${inner == null ? '' : ZB_NET_COLOURS[inner] + ' '}${ZB_NET_SHAPES[shape]}`;
}
function zbNetCellWords(rule, cell) {
  return rule.level <= 2 ? `row ${Math.floor(cell / 5) + 1}, column ${cell % 5 + 1}`
    : `row ${Math.floor(cell / 25) + 1}, column ${Math.floor(cell % 25 / 5) + 1}, square ${cell % 5 + 1}`;
}
/* A value of choice k, by name. */
function zbNetValueWord(k, v) { return k === 1 ? ZB_NET_SHAPES[v] : ZB_NET_COLOURS[v]; }

/* ---- Taken apart ------------------------------------------------------
   A Zoombini crosses when a mudball lands on a mark and it is among those
   the mark sends over, the band going in its own order. Known, the rule
   gives each mark's mudball, one shot each, and the tank always holds
   more than the marks, so everyone crosses. Unknown, see zbNetStrategy. */

/* The game's colours for the mudballs, and the shapes as outlines about a
   centre, for the diagrams. */
const ZB_NET_PAINT = ['#e8cf3a', '#3d6fe0', '#3fae4f', '#d9433a', '#8f4fcf'];
function zbNetMudballItems(choice, x, y, r) {
  const [inner, shape, colour] = choice, s = r * 0.62, ink = inner == null ? '#20242c' : ZB_NET_PAINT[inner];
  const items = [{ t: 'circle', x, y, r, fill: colour == null ? 'panel' : ZB_NET_PAINT[colour], stroke: 'line' }];
  const pts = [
    [-s, -0.7 * s, s, -0.7 * s, s, 0.7 * s, -s, 0.7 * s],
    [0, -s, s, 0.8 * s, -s, 0.8 * s],
    [...Array(10).keys()].flatMap(k => { const a = k * Math.PI / 5, d = k % 2 ? 0.45 * s : s; return [d * Math.sin(a), -d * Math.cos(a)]; }),
    null,
    [0, -s, 0.75 * s, 0, 0, s, -0.75 * s, 0],
  ][shape];
  if (shape == null) return items;
  // Outlined, so that a shape the mudball's own colour still shows.
  if (pts) items.push({ t: 'poly', points: pts.map((v, k) => Math.round((k % 2 ? y : x) + v)), fill: ink, stroke: '#15181e', width: 1 });
  else items.push({ t: 'circle', x, y, r: Math.round(0.62 * s), fill: ink, stroke: '#15181e', width: 1 });
  return items;
}

/* The wall drawn: its sections, the marks with their dots (1 to 3), the
   marks hit, the mudballs landed elsewhere, the mudball for each mark when
   the rule is known, the next mudball at the launcher, and the band:
   those across above the wall, the rest below it (faded once the round is
   over). */
function zbNetDiagram(level, band, marks, { hits = new Set(), misses = [], mudballs = null, next = null, crossed = 0, over = false, caption = '' } = {}) {
  const W = 800, H = 500, items = [], high = level >= 3, y0 = 130, ch = 54;
  const cellBox = cell => {
    if (!high) return { x: 190 + (cell % 5) * 84, y: y0 + Math.floor(cell / 5) * ch, w: 84 };
    const p = Math.floor(cell % 25 / 5), q = cell % 5;
    return { x: 88 + p * 128 + q * 24, y: y0 + Math.floor(cell / 25) * ch, w: 24 };
  };
  const cells = high ? 125 : 25;
  for (let cell = 0; cell < cells; cell++) {
    const b = cellBox(cell), mark = marks.dots[cell];
    items.push({ t: 'rect', x: b.x, y: b.y, w: b.w, h: ch, fill: mark ? 'panel' : 'stone', stroke: 'line', width: 1 });
    if (mark && hits.has(cell)) items.push({ t: 'rect', x: b.x + 2, y: b.y + 2, w: b.w - 4, h: ch - 4, fill: 'good', faded: true });
  }
  for (let r = 0; r < 5; r++) items.push({ t: 'text', x: (high ? 88 : 190) - 8, y: y0 + r * ch + 32, text: `row ${r + 1}`, size: 11, anchor: 'end', fill: 'dim' });
  for (let c = 0; c < 5; c++) items.push({ t: 'text', x: high ? 88 + c * 128 + 60 : 190 + c * 84 + 42, y: y0 - 6, text: `column ${c + 1}`, size: 11, anchor: 'middle', fill: 'dim' });
  for (let cell = 0; cell < cells; cell++) {
    const mark = marks.dots[cell];
    if (!mark) continue;
    const b = cellBox(cell), cx = b.x + b.w / 2;
    for (let d = 0; d < mark; d++) items.push({ t: 'circle', x: cx + (d - (mark - 1) / 2) * (high ? 7 : 12), y: b.y + 9, r: high ? 3 : 4, fill: 'warn' });
    if (mudballs && mudballs[cell]) items.push(...zbNetMudballItems(mudballs[cell], cx, b.y + 33, high ? 10 : 15));
  }
  for (const cell of misses) { const b = cellBox(cell); items.push({ t: 'circle', x: b.x + b.w / 2, y: b.y + 33, r: high ? 6 : 9, fill: 'wood', stroke: 'line' }); }
  const across = band.map((_, i) => i).slice(0, crossed), behind = band.map((_, i) => i).slice(crossed);
  items.push(...zbDiagramRows(across, Math.round((W - 34 * (across.length - 1)) / 2), 92, 16, 34, 52));
  items.push(...zbDiagramRows(behind, Math.round((W - 34 * (behind.length - 1)) / 2) - (next ? 40 : 0), 470, 16, 34, 52, over ? { faded: true } : {}));
  if (next) {
    items.push(...zbNetMudballItems(next, 752, 440, 20));
    items.push({ t: 'text', x: 752, y: 480, text: 'next', size: 11, anchor: 'middle', fill: 'dim' });
  }
  items.push({ t: 'text', x: 10, y: 20, text: caption, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}

/* The ways the hidden rule could be, as the player can tell them apart:
   which choice picks the row, column and square (axes), the rotation, and
   whether the squares follow the columns' order (tied, as the program's
   rule always has them at levels 3 and 4), each with what the shots so far
   have shown of the orders: per order, each value's place, -1 while
   unknown (the last found by elimination once four are known). Values not
   yet fired are all alike to the player, so this is the whole of what it
   knows. */
function zbNetStructures(level, knows) {
  const tied = knows !== 'form';
  if (level <= 2) return [[2, 1, -1], [1, 2, -1]].flatMap(axes => (level === 2 ? [2, 3] : [0]).map(step => ({ axes, step, tied: false })));
  if (level === 3) return [{ axes: ZB_NET_WAYS[0], step: 0, tied }];
  return ZB_NET_WAYS.flatMap(axes => [2, 3].map(step => ({ axes, step, tied })));
}
function zbNetFresh(h) {
  const C = [-1, -1, -1, -1, -1];
  return { h, R: [-1, -1, -1, -1, -1], C, Q: h.axes[2] < 0 ? null : h.tied ? C : [-1, -1, -1, -1, -1] };
}
function zbNetClone(e) {
  const C = e.C.slice();
  return { h: e.h, R: e.R.slice(), C, Q: e.Q == null ? null : e.h.tied ? C : e.Q.slice() };
}
function zbNetAssign(map, v, p) {
  if (map[v] === p) return true;
  if (map[v] >= 0 || map.includes(p)) return false;
  map[v] = p;
  if (map.filter(x => x >= 0).length === 4) map[map.indexOf(-1)] = [0, 1, 2, 3, 4].find(q => !map.includes(q));
  return true;
}
const zbNetMod = x => ((x % 5) + 5) % 5;
function zbNetCoords(level, cell) {
  return level <= 2 ? { r: Math.floor(cell / 5), c: cell % 5, q: 0 } : { r: Math.floor(cell / 25), c: Math.floor(cell % 25 / 5), q: cell % 5 };
}
/* What a shot of choice landing on cell tells under e: e updated, or null
   if e could not have sent it there. */
function zbNetApply(level, e, x, cell) {
  const { r, c, q } = zbNetCoords(level, cell), a = e.h.axes, s = e.h.step, n = zbNetClone(e);
  const vr = x[a[0]], vc = x[a[1]], vq = a[2] >= 0 ? x[a[2]] : null;
  let ok;
  if (level === 1) ok = zbNetAssign(n.R, vr, r) && zbNetAssign(n.C, vc, c);
  else if (level === 2) ok = zbNetAssign(n.R, vr, r) && zbNetAssign(n.C, vc, zbNetMod(c - s * r));
  else if (level === 3) ok = zbNetAssign(n.R, vr, r) && zbNetAssign(n.C, vc, c) && zbNetAssign(n.Q, vq, q);
  else ok = zbNetAssign(n.Q, vq, q) && zbNetAssign(n.R, vr, zbNetMod(r - s * q)) && zbNetAssign(n.C, vc, c);
  return ok ? n : null;
}
/* Where choice lands under e, or -1 while that is not yet known. */
function zbNetLanding(level, e, x) {
  const a = e.h.axes, s = e.h.step;
  const R0 = e.R[x[a[0]]], C0 = e.C[x[a[1]]], Q0 = a[2] >= 0 ? e.Q[x[a[2]]] : 0;
  if (R0 < 0 || C0 < 0 || Q0 < 0) return -1;
  if (level === 1) return 5 * R0 + C0;
  if (level === 2) return 5 * R0 + zbNetMod(C0 + s * R0);
  if (level === 3) return 25 * R0 + 5 * C0 + Q0;
  return 25 * zbNetMod(R0 + s * Q0) + 5 * C0 + Q0;
}
/* The mudball that lands on cell under e, or null while not known. */
function zbNetAim(level, e, cell) {
  const { r, c, q } = zbNetCoords(level, cell), a = e.h.axes, s = e.h.step, inv = (m, p) => { const v = m.indexOf(p); return v < 0 ? null : v; };
  let vr, vc, vq = null;
  if (level === 1) { vr = inv(e.R, r); vc = inv(e.C, c); }
  else if (level === 2) { vr = inv(e.R, r); vc = inv(e.C, zbNetMod(c - s * r)); }
  else if (level === 3) { vr = inv(e.R, r); vc = inv(e.C, c); vq = inv(e.Q, q); }
  else { vq = inv(e.Q, q); vr = inv(e.R, zbNetMod(r - s * q)); vc = inv(e.C, c); }
  if (vr == null || vc == null || (a[2] >= 0 && vq == null)) return null;
  const x = [null, null, null];
  x[a[0]] = vr; x[a[1]] = vc;
  if (a[2] >= 0) x[a[2]] = vq;
  return x;
}
/* How many whole rules e stands for: the orders' unknown places in every
   order. */
function zbNetCount(e) {
  const fact = k => k <= 1 ? 1 : k * fact(k - 1), free = m => m.filter(v => v < 0).length;
  return fact(free(e.R)) * fact(free(e.C)) * (e.Q && e.Q !== e.C ? fact(free(e.Q)) : 1);
}
const zbNetComplete = e => !e.R.includes(-1) && !e.C.includes(-1) && (!e.Q || !e.Q.includes(-1));

/* The wall with the rule unknown. The player sees the marks and knows the
   band, and plays for the worst of the rules left. The play is fixed and
   sure of everyone: first the mudballs of the values 0, 0, 0, then 1, 1,
   1, then 2 and 3 (each value in every choice), which whatever the rule
   leaves every order known under each way the axes and rotation could be
   (the fifth by elimination); then, if more than one way is left, one
   mudball of three different values, which lands on a different section
   under each of them (rows or columns or squares differ between ways, and
   the rotation moves the row, or at level 2 the column, by a different
   amount); then each mark's own mudball. That is at most five shots that
   need hit nothing, and the tank holds seven spare (eight at level 4), so
   every mark is hit and the whole band crosses: no play can do better,
   and the worst rule cannot make this one do worse. The marks come from
   the deal (opts.state); without one they are dealt from seed 1. */
function zbNetStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program', n = band.length, groups = zbNetGroups(n);
  const rule = opts.state && opts.state.rule ? opts.state.rule : zbNetRule(level, groups, zbRandom(1));
  const marks = { dots: rule.dots, at: rule.at || [] };
  const shots0 = groups.length + ZB_NET_SPARE_SHOTS + (level === 4 ? 1 : 0), cells = level >= 3 ? 125 : 25;
  const markCells = [];
  for (let i = 0; i < cells; i++) if (marks.dots[i]) markCells.push(i);
  const H0 = zbNetStructures(level, knows).map(zbNetFresh);
  const weight = B => B.reduce((t, e) => t + zbNetCount(e), 0);
  const same = (a, b) => a && b && a.every((v, i) => v === b[i]);
  const words = x => zbNetMudballWords(x);
  const plural = (k, one) => `${k} ${one}${k === 1 ? '' : 's'}`;
  const choose = (B, hit, k) => {
    const unhit = markCells.filter(m => !hit.has(m));
    if (B.every(zbNetComplete)) {
      for (const m of unhit) {
        const xs = B.map(e => zbNetAim(level, e, m));
        if (xs.every(x => same(x, xs[0]))) return { x: xs[0], phase: 'aim', mark: m };
      }
      // A mudball of different values, landing apart under each way left;
      // of those, one that hits a mark under as many as can be.
      let best = null;
      for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) for (let c = 0; c < 5; c++) {
        if (level <= 2 ? (a || b === c) : (a === b || b === c || a === c)) continue;
        const x = [level <= 2 ? null : a, b, c], land = B.map(e => zbNetLanding(level, e, x));
        const score = [new Set(land).size, B.filter((e, i) => unhit.includes(land[i])).reduce((t, e) => t + zbNetCount(e), 0)];
        if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { x, score };
      }
      return { x: best.x, phase: 'test' };
    }
    const v = k < 5 && B.some(e => [e.R, e.C, e.Q].some(m => m && m[k] < 0)) ? k : [0, 1, 2, 3, 4].find(w => B.some(e => [e.R, e.C, e.Q].some(m => m && m[w] < 0)));
    return { x: [level <= 2 ? null : v, v, v], phase: 'learn', k: v };
  };
  const node = (B, hit, crossed, shots, k, misses) => {
    const left = weight(B), unhit = markCells.filter(m => !hit.has(m));
    const caption = `${crossed} across, ${n - crossed} to go; ${plural(shots, 'mudball')} left`;
    if (!unhit.length || !shots) {
      return {
        move: !unhit.length ? `Every mark is hit: all ${n} across.` : `The tank is empty: ${crossed} across, ${n - crossed} left behind.`,
        zoombini: null, left, crossed, spent: misses.length, outcomes: [],
        diagram: zbNetDiagram(level, band, marks, { hits: hit, misses, crossed, over: true, caption: !unhit.length ? `All ${n} across` : `${crossed} across, ${n - crossed} left behind` }),
      };
    }
    const { x, phase } = choose(B, hit, k);
    const outs = [];
    for (let cell = 0; cell < cells; cell++) {
      const next = B.map(e => zbNetApply(level, e, x, cell)).filter(Boolean);
      if (!next.length) continue;
      const isMark = marks.dots[cell] > 0 && !hit.has(cell), size = isMark ? Math.min(marks.dots[cell], n - crossed) : 0;
      const going = band.map((_, i) => i).slice(crossed, crossed + size);
      const where = zbNetCellWords({ level }, cell), l = weight(next);
      outs.push({
        hit: isMark, cell,
        label: isMark ? `It lands on the mark at ${where}: ${going.length === 1 ? 'Zoombini' : 'Zoombinis'} ${zbPlacesWords(going)} ${going.length === 1 ? 'goes' : 'go'} over (${l} left)`
          : marks.dots[cell] ? `It lands on the mark at ${where}, already hit (${l} left)` : `It lands at ${where}, where there is no mark (${l} left)`,
        left: l,
        next: () => node(next, isMark ? new Set([...hit, cell]) : hit, crossed + size, shots - 1, phase === 'learn' ? k + 1 : k, isMark ? misses : [...misses, cell]),
      });
    }
    outs.sort((p, q) => p.hit - q.hit);
    return {
      move: `Fire ${words(x)}${phase === 'learn' ? ', to learn where each value goes' : phase === 'test' ? ', to tell apart the ways the wall could be' : ''}.`,
      zoombini: null, left, crossed, shot: x,
      diagram: zbNetDiagram(level, band, marks, { hits: hit, misses, next: x, crossed, caption: `${caption}; ${plural(left, 'rule')} left` }),
      outcomes: outs.map(({ label, left, next, cell }) => ({ label, left, cell, next })),
    };
  };
  const hypotheses = weight(H0);
  return {
    hypotheses, sure: n, exact: true, knows,
    root: node(H0, new Set(), 0, shots0, 0, []),
    notes: [
      level <= 2 ? `The player knows which way the rule could be (the colour or the shape for the rows${level === 2 ? ', a rotation of 2 or 3' : ''}) and nothing of the orders: ${hypotheses} rules. The program can deal every one of them, so knowing the program or only the level’s form is the same here.`
        : knows === 'form'
          ? `The player knows only the level’s form: ${level === 4 ? 'any of six ways for the three choices, a rotation of 2 or 3, and ' : 'the colour for the rows, the shape for the columns and its colour for the squares, and '}any order for each of the three: ${hypotheses} rules.`
          : `The player knows the program: ${level === 4 ? 'any of six ways for the three choices and a rotation of 2 or 3, with ' : 'the first way (the program’s at the start of a session), with '}the squares in the columns’ order, as the program always deals them: ${hypotheses} rules.`,
      'First a mudball of one value in every choice, the values 0 to 3 in turn, which whatever the rule shows where each value goes; then, if the ways the wall could be are not yet told apart, one mudball of different values, which lands somewhere different under each; then each mark’s own mudball.',
      `That is at most five mudballs that need hit nothing, and the tank holds ${ZB_NET_SPARE_SHOTS + (level === 4 ? 1 : 0)} more than the marks, so every mark is hit and all ${n} are sure to cross.`,
      ...(opts.state && opts.state.rule ? [] : ['No deal was given, so the marks here are dealt from seed 1.']),
    ],
  };
}

const ZB_NET_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth'];

ZB_PUZZLES.set('NET', {
  about: 'The band has to get over a wall. The player fires mudballs of a chosen colour and shape at it, and each marked section of the wall a mudball lands on sends 1 to 3 Zoombinis over; where a mudball lands follows a hidden rule.',
  levels: [
    { rule: 'A wall of 5 by 5 sections. The mudball’s colour picks the row and its shape the column, or the other way round, a coin toss; each in an order of the five drawn at random. One marked section for each group of the band (3, 2, 1, 3, ...), each drawn at random.',
      chances: 'The tank holds a mudball for each marked section and seven more; each launch uses one, hit or miss, and a section counts once.' },
    { rule: 'As at level 1, but each row down moves the column’s values 2 or 3 places (drawn once) to the right, wrapping round, so the pattern runs diagonally.',
      chances: 'A mudball for each marked section and seven more, as at level 1.' },
    { rule: 'A wall of 5 rows and 5 columns, each column 5 squares wide. The mudball’s colour picks the row, its shape the column and the shape’s colour the square within the column, each in an order drawn at random; the shape and the shape’s colour follow the same order. One marked square for each group of the band.',
      chances: 'A mudball for each marked square and seven more, as at level 1.',
      notes: ['The program draws a third order and checks it for repeats, then never uses it: the square within a column takes the column’s order. ScummVM does the same.',
        'The program decides which choice picks the row, the column and the square by the way last drawn at level 4 in the same session (the first way if there has been none), since it never resets it; ScummVM always uses the first way: colour for the row, shape for the column, the shape’s colour for the square.'] },
    { rule: 'As at level 3, but which of the three choices picks the row, the column and the square is one of six ways drawn at random, and each square to the right within a column moves the row’s values 2 or 3 places (drawn once) down, wrapping round.',
      chances: 'The tank holds a mudball for each marked square and eight more.',
      notes: ['The program also tosses a coin here that it zeroes before testing, so the other branch, which would move the square’s values instead, never runs. ScummVM draws the coin and drops it.'] },
  ],
  deal(level, band, rnd, journey = {}) {
    const n = band.length, groups = zbNetGroups(n);
    const rule = zbNetRule(level, groups, rnd, journey.netWay || 0);
    if (level === 4) journey.netWay = rule.way;
    const shots = groups.length + ZB_NET_SPARE_SHOTS + (level === 4 ? 1 : 0);
    const cells = rule.rows.length, targets = [];
    for (let i = 0; i < cells; i++) if (rule.dots[i]) targets.push(i);
    const [ra, ca, sa] = zbNetAxes(rule);
    const cap = w => w[0].toUpperCase() + w.slice(1);
    const order = (k, values, stride) => [0, 1, 2, 3, 4].map(i => zbNetValueWord(k, values[i * stride])).join(', ');
    const answer = [];
    if (level <= 2) {
      answer.push(`${cap(ZB_NET_CHOICES[ra])} picks the row, from the top: ${order(ra, rule.rows, 5)}.`);
      answer.push(`${cap(ZB_NET_CHOICES[ca])} picks the column, from the left${level === 2 ? ' in the top row' : ''}: ${order(ca, rule.cols, 1)}.`);
      if (level === 2) answer.push(`Each row down, the columns move ${rule.step} places to the right, wrapping round.`);
    } else {
      answer.push(`${cap(ZB_NET_CHOICES[ra])} picks the row, from the top${level === 4 ? ' in each column’s first square' : ''}: ${order(ra, rule.rows, 25)}.`);
      answer.push(`${cap(ZB_NET_CHOICES[ca])} picks the column, from the left: ${order(ca, rule.cols, 5)}.`);
      answer.push(`${cap(ZB_NET_CHOICES[sa])} picks the square within the column, from the left: ${order(sa, rule.subs, 1)}.`);
      if (level === 4) answer.push(`Each square to the right within a column, the rows move ${rule.step} places down, wrapping round.`);
    }
    for (const t of targets) {
      answer.push(`The mark at ${zbNetCellWords(rule, t)}, for ${rule.dots[t]} Zoombini${rule.dots[t] === 1 ? '' : 's'}: ${zbNetMudballWords(zbNetMudball(rule, t))}.`);
    }
    return {
      setup: [
        level <= 2 ? `A wall of 25 sections, 5 rows by 5 columns, ${targets.length} of them marked with dots.`
          : `A wall of 125 squares, in 5 rows and 5 columns each 5 squares wide, ${targets.length} of them marked with dots.`,
        groups.length === 1 ? `The mark sends ${n} Zoombini${n === 1 ? '' : 's'} over; the tank holds ${shots} mudballs.`
          : `The marks send ${zbWordsOr(groups.map(String), 'and')} Zoombinis over, ${n} in all; the tank holds ${shots} mudballs.`,
      ],
      answer,
      marks: band.map((z, i) => `goes over ${ZB_NET_ORDINALS[i]}`),
      state: {
        totalSlotCount: cells,
        targetCount: groups.length,
        targetLaunchBatchSizes: groups,
        initialShotAllowance: shots,
        rowAxisRuleValues: rule.rows, columnAxisRuleValues: rule.cols, subcolumnAxisRuleValues: rule.subs,
        axisRuleRotationStep: rule.step,
        initialTargetLaunchCounts: rule.dots,
        rowAxisSelectorIdx: rule.labels[0], columnAxisSelectorIdx: rule.labels[1], subcolumnAxisSelectorIdx: rule.labels[2],
        axisSelectorPermutationIdx: rule.way,
        rule,
      },
    };
  },
  /* The hidden rule as fields: which choice picks what, the orders, the
     rotation; and where the marks are, which the player sees. */
  form(level, band, state) {
    const rule = state.rule, high = level >= 3, groups = state.targetLaunchBatchSizes, fields = [];
    const [ra, ca, sa] = zbNetAxes(rule);
    const named = k => [0, 1, 2, 3, 4].map(v => ({ value: v, label: zbNetValueWord(k, v) }));
    if (!high) {
      fields.push({ key: 'rows', label: 'The row is picked by', kind: 'choice', value: ra === 2 ? 'colour' : 'shape',
        options: [{ value: 'colour', label: 'the mudball’s colour (the shape picks the column)' }, { value: 'shape', label: 'the shape (the colour picks the column)' }] });
      fields.push({ key: 'rowOrder', label: 'Rows, from the top', kind: 'order', options: named(ra), value: [0, 1, 2, 3, 4].map(k => rule.rows[5 * k]) });
      fields.push({ key: 'colOrder', label: `Columns, from the left${level === 2 ? ', in the top row' : ''}`, kind: 'order', options: named(ca), value: [0, 1, 2, 3, 4].map(k => rule.cols[k]) });
    } else {
      fields.push({ key: 'way', label: 'Row, column and square are picked by', kind: 'choice', value: rule.way,
        options: ZB_NET_WAYS.map((w, i) => ({ value: i, label: w.map(k => ZB_NET_CHOICES[k]).join(', ') })) });
      fields.push({ key: 'rowOrder', label: `Rows, from the top${level === 4 ? ', in each column’s first square' : ''}`, kind: 'order', options: named(ra), value: [0, 1, 2, 3, 4].map(k => rule.rows[25 * k]) });
      fields.push({ key: 'colOrder', label: 'Columns from the left, and the squares within each', kind: 'order',
        options: [0, 1, 2, 3, 4].map(v => ({ value: v, label: `${zbNetValueWord(ca, v)} / ${zbNetValueWord(sa, v)}` })), value: [0, 1, 2, 3, 4].map(k => rule.cols[5 * k]) });
    }
    if (level === 2 || level === 4) fields.push({ key: 'step', label: level === 2 ? 'Each row down, the columns move right by' : 'Each square to the right, the rows move down by', kind: 'choice', value: rule.step, options: [2, 3].map(v => ({ value: v, label: `${v} places` })) });
    const cellOptions = [...Array(high ? 125 : 25).keys()].map(c => ({ value: c, label: zbNetCellWords(rule, c) }));
    groups.forEach((size, i) => fields.push({ key: `mark${i + 1}`, label: `Mark ${i + 1}, for ${size}`, kind: 'choice', value: rule.at[i], options: cellOptions }));
    fields.push({ key: 'note', kind: 'note', note: `The marks send the band over in groups of ${zbWordsOr(groups.map(String), 'and')}, which follow its size and cannot be changed.${high ? ' The squares within each column follow the columns’ order, as the program’s rule always has them.' : ''}${level === 3 ? ' The program uses the first way at level 3 unless a level 4 visit earlier in the session drew another.' : ''}` });
    return fields;
  },
  edit(level, band, state, values) {
    const rule = state.rule, high = level >= 3, groups = state.targetLaunchBatchSizes, cells = high ? 125 : 25;
    const order = (v, what) => {
      const o = (Array.isArray(v) ? v : String(v).split(',')).map(Number);
      if (o.length !== 5 || new Set(o).size !== 5 || o.some(x => !(x >= 0 && x <= 4))) throw new Error(`${what} must put each of the five in one place.`);
      return o;
    };
    let labels = rule.labels, way = rule.way;
    if (!high) {
      if (values.rows !== 'colour' && values.rows !== 'shape') throw new Error('The row is picked by the mudball’s colour or by its shape.');
      labels = values.rows === 'colour' ? [2, 1, 0] : [1, 2, 0];
    } else {
      way = Number(values.way);
      if (!(way >= 0 && way <= 5)) throw new Error('Pick one of the six ways.');
    }
    const rowOrder = order(values.rowOrder, 'The rows'), colOrder = order(values.colOrder, 'The columns');
    let step = 0;
    if (level === 2 || level === 4) {
      step = Number(values.step);
      if (step !== 2 && step !== 3) throw new Error('The program moves them 2 or 3 places.');
    }
    const at = groups.map((_, i) => Number(values[`mark${i + 1}`]));
    if (at.some(c => !(c >= 0 && c < cells) || !Number.isInteger(c))) throw new Error('Each mark must be on the wall.');
    if (new Set(at).size !== at.length) throw new Error('Two marks cannot share a section.');
    const next = zbNetRuleFrom(level, labels, way, rowOrder, colOrder, step, groups, at);
    return Object.assign({}, state, {
      rule: next, rowAxisRuleValues: next.rows, columnAxisRuleValues: next.cols, subcolumnAxisRuleValues: next.subs,
      axisRuleRotationStep: next.step, initialTargetLaunchCounts: next.dots, rowAxisSelectorIdx: next.labels[0],
      columnAxisSelectorIdx: next.labels[1], subcolumnAxisSelectorIdx: next.labels[2], axisSelectorPermutationIdx: next.way, edited: true,
    });
  },
  /* Known, each mark's own mudball, once: the simplest has no other shot,
     and the order they are hit in only changes which Zoombinis go with
     which mark, so all orders are one way. */
  solve(level, band, state) {
    const rule = state.rule, n = band.length, marks = [];
    for (let i = 0; i < rule.dots.length; i++) if (rule.dots[i]) marks.push(i);
    let done = 0;
    const steps = marks.map(m => {
      const going = band.map((_, i) => i).slice(done, done + rule.dots[m]);
      done += going.length;
      return `Fire ${zbNetMudballWords(zbNetMudball(rule, m))}: it lands on the mark at ${zbNetCellWords(rule, m)}, and ${going.length === 1 ? 'Zoombini' : 'Zoombinis'} ${zbPlacesWords(going)} ${going.length === 1 ? 'goes' : 'go'} over.`;
    });
    steps.push(`That is ${marks.length} of the ${state.initialShotAllowance} mudballs in the tank.`);
    const mudballs = {};
    for (const m of marks) mudballs[m] = zbNetMudball(rule, m);
    return {
      most: n, exact: true, ways: 1,
      solutions: [{
        title: `All ${n} cross, one mudball for each of the ${marks.length} mark${marks.length === 1 ? '' : 's'}`,
        steps, crosses: band.map((_, i) => i),
        diagram: zbNetDiagram(level, band, { dots: rule.dots, at: rule.at }, { hits: new Set(marks), mudballs, crossed: n, over: true, caption: `All ${n} across: a mudball for each mark` }),
      }],
      notes: [
        'A Zoombini crosses when a mudball lands on a mark: the mark sends as many over as it has dots, the band going in its own order. A mark counts once.',
        'Known, the rule gives each mark its mudball, and the tank always holds more mudballs than there are marks, so the whole band crosses.',
        'The simplest fires each mark’s mudball once and nothing else. The order the marks are hit in only changes which Zoombinis go with which mark, so every order is counted as one way.',
      ],
    };
  },
  strategy(level, band, arc, opts = {}) { return zbNetStrategy(level, band, opts); },
  /* The mudball the move fires lands on the first section whose values
     are its choices, under the rule dealt; the outcome is the one for
     that section. */
  answer(level, band, state, node) {
    const cell = zbNetLands(state.rule, node.shot.map(v => v ?? 0));
    return node.outcomes.findIndex(o => o.cell === cell);
  },
  source: 'ScummVM’s puzzle_net.cpp, checked against the program’s code.',
});
