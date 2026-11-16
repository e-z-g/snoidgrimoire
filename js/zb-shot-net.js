/* zb-shot-net.js -- Mudball Wall read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-net.js.

   The picture. NET tBMP 5000 shows the wall of 5 by 5 sections (levels 1
   and 2) and tBMP 5001 the wall of 125 squares (levels 3 and 4), so the
   picture gives the level to within two.

   The marks. A marked section is SCRB 9000 + its section (9025 + its
   square at levels 3 and 4), one record of tBMP 9000 that draws the stone
   lit, shape 1-25 (26-150), with its corner at the record's x and y. Over
   it the program draws the dots, shape 150 + the count (153 + the count at
   levels 3 and 4), at the same x and y minus the shape's registration
   point (REGS 9000 and 9001). zbShotNetMarks draws the lit stone at every
   section and reads a mark where it fits, then the count of dots that fits
   best. Dots under a mudball are unread.

   The mudballs landed. A mudball that has landed is SCRB 7023 (levels 1
   and 2) or 7024 (levels 3 and 4) at rest: the splash, shape 75 or 82 of
   tBMP 7000 + 22 x the slot of its color, at the section's place (the
   table ZB_SHOT_NET.low or .high), and the shape on it, 21 (3 at levels 3
   and 4) right of that and 7 down. The shape is shape 1 + its slot, drawn
   in brown, while no shape's color is chosen (levels 1 and 2), and shape
   6 + its slot + 12 x the slot of its color otherwise. The slots are
   ScummVM's kColOffsets1 for the shape and kColOffsets2 for a color.
   zbShotNetShots draws the five splashes at every section and reads one
   where it fits, then the shape on it.

   The machine. Each row of buttons is SCRB 10002 + the value chosen (the
   shape's color, levels 3 and 4), 10007 + the value (the shape) or 10012
   + the value (the mudball's color), of tBMP 10000; its second frame
   shows the chosen button pressed. The mud tank at rest is the last frame
   of SCRB 7046 - n, for n of 0 to 15 mudballs in it, and the launcher has
   one more mudball in it, shape 66 + 22 x the slot of its color at (474,
   278). zbShotNetMachine reads each.

   The Zoombinis. One waiting stands at one of ZB_SHOT_NET.waiting, one
   over the wall at one of ZB_SHOT_NET.over, and one on the launcher's
   plank in the box ZB_SHOT_NET.plank. Any other is on its way.

   What follows. The mudballs landed give what zbNetApply learns of the
   rule under each way it could be (zbNetStructures), at each level the
   picture allows. The reader gives the levels that fit, how many rules
   fit, and for each mark not yet hit the mudball that hits it where every
   rule left gives the same one.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_net.cpp and .h:
   setBackgroundBitmap for the pictures, generateTraitRules and
   slotPreRenderShape for the marks and their dots, settleShotAtTargetSlot
   and remapHotspotFramesByTrait for the mudballs landed, with
   kSlotPositionsLow, kSlotPositionsHigh, kColOffsets1 and kColOffsets2,
   registerColumnRunners and updateSelectorValue for the buttons,
   settleMudTankVisualFrame and getMudTankTargetLevel for the tank, and
   kSnoidPositions and kExitPositions for where the Zoombinis stand. The
   plank's box was measured in the game. Screenshots taken in the game on
   15 and 16 November 2026 matched each.
*/

/* The sheets, scripts and shapes, and the places (x, y pairs) from
   ScummVM's puzzle_net.h: `low` and `high` each section's place for a
   mudball landed (kSlotPositionsLow and kSlotPositionsHigh), `waiting`
   kSnoidPositions and `over` kExitPositions. `shapeSlot` and `colorSlot`
   are kColOffsets1 and kColOffsets2, by value. */
const ZB_SHOT_NET = {
  markSheet: 9000, markRegs: 9000, marks: 9000, ballSheet: 7000, ballRegs: 7000, buttonSheet: 10000,
  buttons: [10002, 10007, 10012], tank: 7046, splash: [75, 82], symbolAt: [[21, 7], [3, 7]], loaded: [66, 474, 278],
  shapeSlot: [2, 3, 0, 1, 4], colorSlot: [4, 0, 2, 1, 3],
  low: [102, 117, 204, 106, 306, 94, 409, 79, 507, 69, 102, 157, 204, 143, 306, 129, 407, 115, 507, 104, 102, 195, 204, 180, 306, 166, 407, 151, 507, 140,
    102, 232, 204, 217, 306, 205, 407, 191, 507, 178, 102, 272, 204, 257, 306, 245, 407, 229, 507, 214],
  high: [74, 121, 94, 119, 114, 116, 135, 113, 156, 111, 177, 109, 197, 107, 217, 104, 237, 102, 257, 99, 278, 98, 298, 95, 319, 93, 340, 89, 360, 87,
    380, 84, 398, 82, 418, 79, 438, 77, 458, 74, 481, 72, 499, 70, 519, 67, 538, 65, 559, 63,
    74, 160, 93, 158, 113, 155, 133, 152, 154, 149, 177, 147, 197, 145, 217, 143, 237, 140, 257, 139, 279, 135, 299, 132, 319, 130, 341, 127, 362, 124,
    382, 121, 400, 118, 420, 115, 439, 112, 459, 110, 480, 109, 499, 107, 518, 105, 538, 103, 558, 101,
    72, 200, 93, 198, 113, 195, 134, 192, 156, 190, 177, 188, 197, 185, 216, 181, 236, 178, 256, 176, 279, 173, 299, 170, 319, 168, 338, 164, 358, 162,
    380, 158, 399, 156, 419, 153, 438, 150, 458, 148, 479, 147, 500, 144, 519, 141, 538, 138, 557, 136,
    74, 239, 94, 236, 114, 233, 135, 230, 156, 227, 178, 224, 198, 221, 219, 218, 238, 216, 256, 214, 278, 212, 298, 209, 319, 206, 338, 203, 359, 200,
    380, 196, 399, 194, 419, 191, 438, 189, 459, 186, 479, 184, 499, 181, 518, 178, 538, 177, 556, 175,
    75, 278, 95, 276, 115, 273, 135, 269, 156, 267, 177, 263, 197, 261, 217, 258, 237, 255, 257, 253, 280, 250, 300, 248, 319, 245, 339, 241, 359, 238,
    380, 235, 400, 232, 419, 229, 439, 226, 457, 223, 480, 219, 499, 216, 519, 214, 538, 211, 556, 209],
  waiting: [233, 392, 209, 378, 196, 390, 185, 365, 167, 380, 160, 408, 135, 397, 121, 407, 115, 368, 114, 342, 99, 375, 97, 394, 95, 346, 91, 411, 79, 355, 62, 404],
  over: [16, 58, 17, 45, 15, 33, 16, 19, 47, 59, 51, 48, 46, 30, 48, 20, 77, 63, 74, 47, 76, 32, 77, 18, 146, 67, 143, 58, 141, 40, 147, 32],
  plank: [290, 285, 430, 335],
};

/* A sheet's sprite as a piece of a drawing, its corner at (x, y) minus
   its registration point (`regs` [xs, ys] or null). */
function zbShotNetPiece(sprites, regs, shape, x, y) {
  return { sprite: sprites[shape - 1], x: x - (regs ? regs[0][shape] : 0), y: y - (regs ? regs[1][shape] : 0) };
}

/* A sheet's sprites and its registration points: { sprites, regs }. */
function zbShotNetSheet(arc, sheet, regs) {
  return { sprites: decodeBitmapResource(arc.get('tBMP', sheet)).frames,
    regs: regs == null ? null : [parseRegs(arc.get('REGS', regs)), parseRegs(arc.get('REGS', regs + 1))] };
}

/* How well one piece fits the frame where it lies. */
function zbShotNetFit(env, piece, skip) {
  return zbShotDrawingFit(env, zbShotDrawing(env, [piece]), 0, 0, skip);
}

/* The marks read: [{ cell, dots, fit }], each section (or square) whose
   lit stone fits half its pixels in view, `dots` 1 to 3, or null where
   the dots are hidden. The pixels of the mudballs landed (`shots`,
   zbShotNetShots's) count as not shown, so a mark hit shows where its
   stone shows around the mudball. At levels 3 and 4 the mudball covers
   the whole square, and the mark under it is unread. */
function zbShotNetMarks(env, high, skip, shots) {
  const arc = env.arc, { sprites, regs } = zbShotNetSheet(arc, ZB_SHOT_NET.markSheet, ZB_SHOT_NET.markRegs);
  const cells = high ? 125 : 25, marks = [];
  skip = skip.slice();
  for (const s of shots) {
    for (const d of s.drawings) {
      for (let p = 0; p < d.points.length; p += 7) {
        const x = d.points[p], y = d.points[p + 1];
        if (x >= 0 && y >= 0 && x < ZB_SHOT_W && y < ZB_SHOT_H) skip[y * ZB_SHOT_W + x] = 1;
      }
    }
  }
  for (let cell = 0; cell < cells; cell++) {
    const r = parseScript(arc.get('SCRB', ZB_SHOT_NET.marks + (high ? 25 : 0) + cell), 'SCRB').frames[0].records[0];
    const fit = zbShotNetFit(env, zbShotNetPiece(sprites, regs, r.shape, r.x, r.y), skip);
    if (fit.shown < 0.25 || fit.fit < 0.5) continue;
    let best = null;
    for (let d = 1; d <= 3; d++) {
      const dots = zbShotNetFit(env, zbShotNetPiece(sprites, regs, (high ? 153 : 150) + d, r.x, r.y), skip);
      if (dots.shown > 0.6 && (!best || dots.value > best.fit.value)) best = { d, fit: dots };
    }
    marks.push({ cell, dots: best && best.fit.fit >= 0.7 ? best.d : null, fit: fit.fit });
  }
  return marks;
}

/* The mudballs landed: [{ cell, color, shape, inner, fit, drawings }], each value
   0-4 as zb-puzzle-net.js numbers them, `inner` (the shape's color) null
   where the shape is brown, and `shape` null where the shape on the
   splash is hidden. `drawings` are the splash's and the shape's, as
   zbShotDrawing gives them. */
function zbShotNetShots(env, high, skip) {
  const { sprites, regs } = zbShotNetSheet(env.arc, ZB_SHOT_NET.ballSheet, ZB_SHOT_NET.ballRegs);
  const at = high ? ZB_SHOT_NET.high : ZB_SHOT_NET.low, splash = ZB_SHOT_NET.splash[high ? 1 : 0], [sx, sy] = ZB_SHOT_NET.symbolAt[high ? 1 : 0];
  const shots = [];
  for (let cell = 0; cell < at.length / 2; cell++) {
    const x = at[2 * cell], y = at[2 * cell + 1];
    let best = null;
    for (let color = 0; color < 5; color++) {
      const drawing = zbShotDrawing(env, [zbShotNetPiece(sprites, regs, splash + 22 * ZB_SHOT_NET.colorSlot[color], x, y)]);
      const fit = zbShotDrawingFit(env, drawing, 0, 0, skip);
      if (fit.shown > 0.3 && (!best || fit.value > best.fit.value)) best = { color, fit, drawing };
    }
    if (!best || best.fit.fit < 0.45) continue;
    let symbol = null;
    for (let shape = 0; shape < 5; shape++) {
      for (let inner = -1; inner < 5; inner++) {
        const s = inner < 0 ? 1 + ZB_SHOT_NET.shapeSlot[shape] : 6 + ZB_SHOT_NET.shapeSlot[shape] + 12 * ZB_SHOT_NET.colorSlot[inner];
        const drawing = zbShotDrawing(env, [zbShotNetPiece(sprites, regs, s, x + sx, y + sy)]);
        const fit = zbShotDrawingFit(env, drawing, 0, 0, skip);
        if (fit.shown > 0.6 && (!symbol || fit.value > symbol.fit.value)) symbol = { shape, inner: inner < 0 ? null : inner, fit, drawing };
      }
    }
    const read = symbol && symbol.fit.fit >= 0.6;
    shots.push({ cell, color: best.color, shape: read ? symbol.shape : null, inner: read ? symbol.inner : null, fit: best.fit.fit,
      drawings: read ? [best.drawing, symbol.drawing] : [best.drawing] });
  }
  return shots;
}

/* The machine read: { chosen, tank, loaded }. `chosen` is the value
   pressed in each row of buttons, as [shape's color, shape, mudball's
   color], null for a row not drawn or not read; `tank` the mudballs in
   the tank (0-15) and `loaded` the color of the mudball in the launcher,
   each null where unread. */
function zbShotNetMachine(env, high, skip) {
  const arc = env.arc, buttons = zbShotNetSheet(arc, ZB_SHOT_NET.buttonSheet, null).sprites;
  const draw = (sheet, regs, records) => zbShotDrawing(env, records.filter(r => r.shape > 0).map(r => zbShotNetPiece(sheet, regs, r.shape, r.x, r.y)));
  const chosen = [null, null, null];
  ZB_SHOT_NET.buttons.forEach((first, k) => {
    if (k === 0 && !high) return;
    const fits = [0, 1, 2, 3, 4].map(v => zbShotDrawingFit(env, draw(buttons, null, parseScript(arc.get('SCRB', first + v), 'SCRB').frames[1].records), 0, 0, skip));
    const order = [0, 1, 2, 3, 4].sort((a, b) => fits[b].value - fits[a].value);
    if (fits[order[0]].fit >= 0.6 && fits[order[0]].value > fits[order[1]].value + 20) chosen[k] = order[0];
  });
  const { sprites, regs } = zbShotNetSheet(arc, ZB_SHOT_NET.ballSheet, ZB_SHOT_NET.ballRegs);
  let tank = null;
  for (let n = 0; n < 16; n++) {
    const frames = parseScript(arc.get('SCRB', ZB_SHOT_NET.tank - n), 'SCRB').frames;
    const fit = zbShotDrawingFit(env, draw(sprites, regs, frames[frames.length - 1].records), 0, 0, skip);
    if (fit.fit >= 0.8 && (!tank || fit.value > tank.fit.value)) tank = { n, fit };
  }
  const [ball, bx, by] = ZB_SHOT_NET.loaded;
  let loaded = null;
  for (let color = 0; color < 5; color++) {
    const fit = zbShotNetFit(env, zbShotNetPiece(sprites, regs, ball + 22 * ZB_SHOT_NET.colorSlot[color], bx, by), skip);
    if (fit.fit >= 0.45 && fit.shown > 0.5 && (!loaded || fit.value > loaded.fit.value)) loaded = { color, fit };
  }
  return { chosen, tank: tank ? tank.n : null, loaded: loaded ? loaded.color : null };
}

/* What the mudballs landed show of the rule at a level: the ways it could
   be (zbNetStructures, with all six ways at level 3, since the program
   never resets the way drawn at level 4), each with the orders learned, as
   zbNetApply leaves them. A mudball whose shape is unread is left out. */
function zbShotNetRules(level, shots) {
  const ways = level === 3 ? ZB_NET_WAYS.map(axes => ({ axes, step: 0, tied: true })) : zbNetStructures(level, 'program');
  let left = ways.map(zbNetFresh);
  for (const s of shots) {
    if (s.shape == null || (level >= 3 && s.inner == null)) continue;
    const choice = [level >= 3 ? s.inner : null, s.shape, s.color];
    left = left.map(e => zbNetApply(level, e, choice, s.cell)).filter(Boolean);
  }
  return left;
}

/* The Mudball Wall. Returns { levels, marks, shots, machine, rules, aims,
   over, plank, waiting, moving, zoombinis, state, lines, link }: `levels`
   the levels that fit the picture and the mudballs landed, `marks`
   zbShotNetMarks's with `hit` set where a mudball lies on the mark,
   `shots` zbShotNetShots's, `machine` zbShotNetMachine's, `rules` for
   each level in `levels` the ways left (zbShotNetRules) and `aims` for
   each mark not hit the mudball that hits it, as [shape's color, shape,
   mudball's color], where every rule left at every level gives the same
   one, or null. It sets `where` on each Zoombini. */
function zbShotNet(frame, zoombinis) {
  const env = zbShotEnv(frame), high = frame.picture === 5001, skip = zbShotCovered(zoombinis);
  const over = [], plank = [], waiting = [], moving = [];
  const [px0, py0, px1, py1] = ZB_SHOT_NET.plank;
  for (const z of zoombinis) {
    if (zbShotPlaceIn(ZB_SHOT_NET.over, z.x, z.y) >= 0) over.push(z);
    else if (z.x >= px0 && z.x <= px1 && z.y >= py0 && z.y <= py1) plank.push(z);
    else if (zbShotPlaceIn(ZB_SHOT_NET.waiting, z.x, z.y) >= 0 || (z.x < 150 && z.y > 330)) waiting.push(z);
    else moving.push(z);
  }
  plank.sort((a, b) => b.x - a.x);
  over.forEach(z => { z.where = 'over the wall'; });
  plank.forEach((z, i) => { z.where = `on the plank, ${ZB_NET_ORDINALS[i]} from the launcher`; });
  waiting.forEach(z => { z.where = 'waiting'; });
  moving.forEach(z => { z.where = 'on its way'; });

  const shots = zbShotNetShots(env, high, skip), marks = zbShotNetMarks(env, high, skip, shots);
  const hitCells = new Set(shots.map(s => s.cell));
  for (const m of marks) m.hit = hitCells.has(m.cell);
  const machine = zbShotNetMachine(env, high, skip);
  const rules = {}, levels = [];
  for (const level of high ? [3, 4] : [1, 2]) {
    const left = zbShotNetRules(level, shots);
    if (left.length) { rules[level] = left; levels.push(level); }
  }
  /* each open mark's mudball, where every rule left gives the same one */
  const same = (a, b) => a && b && a.every((v, i) => v === b[i]);
  const aims = {};
  for (const m of marks) {
    if (m.hit) continue;
    const xs = levels.flatMap(level => rules[level].map(e => zbNetAim(level, e, m.cell)));
    aims[m.cell] = xs.length && xs.every(x => same(x, xs[0])) ? xs[0] : null;
  }

  const code = z => ZB_SHOT_TRAITS.map(k => z.traits[k] ?? '?').join('');
  const cellWords = cell => (high ? `row ${Math.floor(cell / 25) + 1}, column ${Math.floor(cell % 25 / 5) + 1}, square ${cell % 5 + 1}`
    : `row ${Math.floor(cell / 5) + 1}, column ${cell % 5 + 1}`);
  const shotWords = s => (s.shape == null ? `a ${ZB_NET_COLORS[s.color]} mudball` : zbNetMudballWords([s.inner, s.shape, s.color]));
  const named = (list, v) => (v == null ? null : list[v]);
  const state = {
    picture: frame.picture,
    levels,
    marks: marks.map(m => ({ cell: m.cell, dots: m.dots, hit: m.hit })),
    shots: shots.map(s => ({ cell: s.cell, color: ZB_NET_COLORS[s.color], shape: named(ZB_NET_SHAPES, s.shape), inner: named(ZB_NET_COLORS, s.inner) })),
    chosen: { color: named(ZB_NET_COLORS, machine.chosen[2]), shape: named(ZB_NET_SHAPES, machine.chosen[1]), ...(high ? { inner: named(ZB_NET_COLORS, machine.chosen[0]) } : {}) },
    tank: machine.tank,
    loaded: named(ZB_NET_COLORS, machine.loaded),
    over: over.map(code), plank: plank.map(code), waiting: waiting.map(code), moving: moving.length,
  };

  const lines = [];
  const count = (n, one, many = `${one}s`) => `${n === 0 ? 'No' : n} ${n === 1 ? one : many}`;
  lines.push(high ? 'The wall is NET tBMP 5001, 125 squares in 5 rows of 5 columns, each column 5 squares wide, as at levels 3 and 4.'
    : 'The wall is NET tBMP 5000, 25 sections in 5 rows of 5, as at levels 1 and 2.');
  const unreadDots = marks.filter(m => m.dots == null).length;
  lines.push(`${count(marks.length, 'section is', 'sections are')} marked${marks.length ? `: ${marks.map(m => `${cellWords(m.cell)} (${m.dots == null ? 'dots hidden' : `${m.dots} dot${m.dots === 1 ? '' : 's'}`}${m.hit ? ', hit' : ''})`).join('; ')}` : ''}.`
    + (unreadDots ? ` A mudball covers the dots of ${unreadDots === 1 ? 'one mark' : `${unreadDots} marks`}.` : '')
    + (high && shots.length ? ' A mudball covers the whole square it lands on, so a mark hit there is unread.' : ''));
  if (shots.length) {
    lines.push(`${count(shots.length, 'section shows', 'sections show')} a mudball landed: ${shots.map(s => `${shotWords(s)} on ${cellWords(s.cell)}`).join('; ')}.`);
    const hidden = shots.filter(s => s.shape == null).length;
    if (hidden) lines.push(`The shape on ${hidden === 1 ? 'one mudball' : `${hidden} mudballs`} is hidden, so the page leaves ${hidden === 1 ? 'it' : 'them'} out of the rule.`);
  } else lines.push('No mudball has landed on the wall.');
  const ch = machine.chosen;
  if (ch[1] != null && ch[2] != null && (!high || ch[0] != null)) lines.push(`The machine is set to ${zbNetMudballWords([high ? ch[0] : null, ch[1], ch[2]])}.`);
  else lines.push('The page could not read every button chosen on the machine.');
  if (machine.tank != null) {
    lines.push(`The tank has ${count(machine.tank, 'mudball').toLowerCase()} in it${machine.tank === 15 ? ', as many as it can show, so it may have more' : ''}`
      + `${machine.loaded != null ? `, and the launcher has a ${ZB_NET_COLORS[machine.loaded]} one` : ''}.`);
  } else lines.push('The tank is moving or hidden, so the page leaves the mudballs left unread.');
  lines.push(`${count(over.length, 'Zoombini is', 'Zoombinis are')} over the wall, ${plank.length} on the plank by the launcher and ${waiting.length} waiting`
    + `${moving.length ? `, and ${moving.length} ${moving.length === 1 ? 'is' : 'are'} on the way` : ''}. Zoombinis that stand behind others, in the waiting group or over the wall, may be missing.`);
  if (!levels.length) {
    lines.push('No rule the program deals sends these mudballs where they lie, so the page has misread one of them.');
  } else {
    const n = levels.reduce((t, level) => t + rules[level].reduce((u, e) => u + zbNetCount(e), 0), 0);
    lines.push(`The mudballs landed fit level ${zbWordsOr(levels.map(String), 'or')}, and ${n === 1 ? 'one rule fits' : `${n.toLocaleString('en-US')} rules fit`}.`);
    const open = marks.filter(m => !m.hit);
    const known = open.filter(m => aims[m.cell]);
    for (const m of known) lines.push(`The mark at ${cellWords(m.cell)} is hit by ${zbNetMudballWords(aims[m.cell])}.`);
    if (open.length && known.length < open.length) lines.push(`The mudballs so far do not settle what hits the ${open.length - known.length === 1 ? 'other mark' : `other ${open.length - known.length} marks`}.`);
  }

  const band = [...over, ...plank, ...waiting, ...moving];
  let link = null;
  const complete = band.length > 0 && band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  if (complete && levels.length === 1 && rules[levels[0]].length === 1 && zbNetComplete(rules[levels[0]][0]) && marks.every(m => m.dots != null)) {
    const level = levels[0], e = rules[level][0], groups = zbNetGroups(band.length);
    const free = marks.slice(), set = {};
    const matched = groups.every((size, i) => {
      const k = free.findIndex(m => m.dots === size);
      if (k < 0) return false;
      set[`mark${i + 1}`] = free.splice(k, 1)[0].cell;
      return true;
    });
    if (matched && !free.length) {
      const order = map => [0, 1, 2, 3, 4].map(p => map.indexOf(p));
      if (level <= 2) set.rows = e.h.axes[0] === 2 ? 'color' : 'shape';
      else set.way = ZB_NET_WAYS.findIndex(w => w.every((v, i) => v === e.h.axes[i]));
      set.rowOrder = order(e.R);
      set.colOrder = order(e.C);
      if (level === 2 || level === 4) set.step = e.h.step;
      link = { hash: `solve=NET${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(band.map(z => z.traits))}&set=${encodeURIComponent(JSON.stringify(set))}`,
        text: 'Take the wall apart with this rule' };
    }
  }
  return { levels, marks, shots, machine, rules, aims, over, plank, waiting, moving, zoombinis: band, state, lines, link };
}

ZB_SHOT_PUZZLES.NET = zbShotNet;
