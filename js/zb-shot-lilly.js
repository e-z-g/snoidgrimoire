/* zb-shot-lilly.js -- Titanic Tattooed Toads read from a screenshot
   (zb-shot.js, "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-lilly.js.

   The pond. The program draws the 144 pads every frame from LILLY tBMP
   13000: the pad's shape as shape 1-4 and its mark as shape 5 + 3 x color
   + pattern, each at the pad's place minus the shape's registration point
   (REGS 200 and 201). A pad's place is 35 x its column + its row's x (REGS
   100), and its column's drop + its row's y (REGS 101), the drops 2, 2, 4,
   4, 6, 6, 8, 8, 10, 10, 12, 12 by column. zbShotLillyPads draws all 60
   looks of a pad and reads at each place the one that fits. A pad mostly
   under a toad, a crab, a Zoombini or the pointer is unread.

   The toads. A toad waiting on the bank is the first tick of SCRB 10043 +
   its number (0-11): the toad, shape 1 of tBMP 10000, and its tattoo,
   shape 79 + the tattoo's number, each minus its registration point (REGS
   10000 and 10001). The tattoo's number gives its family and value
   (ZB_LILLY_TATTOO_TYPE, ZB_LILLY_TATTOO_VALUE). A toad that is not at its
   place on the bank is in the pond, swimming back or gone, and is unread.

   The wand. From level 2 a wand lies at the bottom left, shape 284 + its
   stage (0-6) of tBMP 10000 with its corner at (38, 415). It wears down a
   stage for each share of its swaps used, and at stage 6 none are left.
   While the player holds it, it is unread.

   What follows. Nothing is hidden at the pond, so the reader works out
   each waiting toad's rows: the rows of the first column from which pads
   of its tattoo join the far side (zbLillyReach). An unread pad counts as
   no match, so a row may be missing where pads are hidden.

   The Zoombinis here are drawn small, from the hair alone, and their
   traits play no part, so the reader leaves them unread.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_lilly.cpp and .h:
   renderGridSprites and the cell places set from REGS 100 and
   kColYOffset for the pads, createToadRunners, kEntryPositions and
   toadPreRenderShape for the toads and their tattoos, and
   setToadHomePosition with kToadHomePosition for the wand. Screenshots
   taken in the game on 15 November 2026 matched each.
*/

/* A column's step across, each column's drop down the screen
   (ScummVM's kColYOffset), the REGS with each row's x and y and each
   pad shape's registration x and y, and the toads' and the wand's sheet,
   scripts and shapes. */
const ZB_SHOT_LILLY = { sheet: 13000, stepX: 35, columnY: [2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12], rowX: 100, rowY: 101, shapeX: 200, shapeY: 201,
  toadSheet: 10000, toadRegs: 10000, toads: 10043, tattoo: 79, wand: 284, wandAt: [38, 415] };

/* The pond's 144 pads read: { pads, fits, unread }. `pads` is { pattern,
   shape, color }, each 12 x 12 by row and column, as zb-puzzle-lilly.js
   has them, with null where the pad is unread. `fits` is each pad's fit by
   row x 12 + column, and `unread` how many are null. */
function zbShotLillyPads(env, skip) {
  const arc = env.arc, sprites = decodeBitmapResource(arc.get('tBMP', ZB_SHOT_LILLY.sheet)).frames;
  const rowX = parseRegs(arc.get('REGS', ZB_SHOT_LILLY.rowX)), rowY = parseRegs(arc.get('REGS', ZB_SHOT_LILLY.rowY));
  const shapeX = parseRegs(arc.get('REGS', ZB_SHOT_LILLY.shapeX)), shapeY = parseRegs(arc.get('REGS', ZB_SHOT_LILLY.shapeY));
  const piece = shape => ({ sprite: sprites[shape - 1], x: -shapeX[shape], y: -shapeY[shape] });
  const looks = [];
  for (let shape = 0; shape < 4; shape++) {
    for (let color = 0; color < 5; color++) {
      for (let pattern = 0; pattern < 3; pattern++) {
        looks.push({ shape, color, pattern, drawing: zbShotDrawing(env, [piece(shape + 1), piece(5 + 3 * color + pattern)]) });
      }
    }
  }
  const grid = () => Array.from({ length: 12 }, () => new Array(12).fill(null));
  const pads = { pattern: grid(), shape: grid(), color: grid() }, fits = new Float32Array(144);
  let unread = 0;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      const X = ZB_SHOT_LILLY.stepX * col + rowX[row + 1], Y = ZB_SHOT_LILLY.columnY[col] + rowY[row + 1];
      let best = null, next = null;
      for (const look of looks) {
        const fit = zbShotDrawingFit(env, look.drawing, X, Y, skip);
        if (!best || fit.value > best.fit.value) { next = best; best = { look, fit }; } else if (!next || fit.value > next.fit.value) next = { look, fit };
      }
      fits[row * 12 + col] = best.fit.fit;
      /* read where most of the pad shows and fits, and no other look fits as well */
      if (best.fit.shown < 0.6 || best.fit.fit < 0.85 || best.fit.value - next.fit.value < 4) { unread++; continue; }
      pads.pattern[row][col] = best.look.pattern;
      pads.shape[row][col] = best.look.shape;
      pads.color[row][col] = best.look.color;
    }
  }
  return { pads, fits, unread };
}

/* The toads waiting on the bank: [{ toad, tattoo, fit }] by the toad's
   number, 0 the top one. `tattoo` is the tattoo's number in
   ZB_LILLY_TATTOO_TYPE. */
function zbShotLillyToads(env, skip) {
  const arc = env.arc, sprites = decodeBitmapResource(arc.get('tBMP', ZB_SHOT_LILLY.toadSheet)).frames;
  const xs = parseRegs(arc.get('REGS', ZB_SHOT_LILLY.toadRegs)), ys = parseRegs(arc.get('REGS', ZB_SHOT_LILLY.toadRegs + 1));
  const out = [];
  for (let toad = 0; toad < 12; toad++) {
    if (!arc.has('SCRB', ZB_SHOT_LILLY.toads + toad)) continue;
    const tick = zbFeatureTicks(parseScript(arc.get('SCRB', ZB_SHOT_LILLY.toads + toad), 'SCRB')).find(t => t.records.length);
    if (!tick || tick.records.length < 2 || tick.records[1].shape !== ZB_SHOT_LILLY.tattoo) continue;
    const [body, mark] = tick.records;
    let best = null, next = null;
    for (let tattoo = 0; tattoo < 12; tattoo++) {
      const shape = mark.shape + tattoo;
      const drawing = zbShotDrawing(env, [{ sprite: sprites[body.shape - 1], x: body.x - xs[body.shape], y: body.y - ys[body.shape] },
        { sprite: sprites[shape - 1], x: mark.x - xs[shape], y: mark.y - ys[shape] }]);
      const fit = zbShotDrawingFit(env, drawing, 0, 0, skip);
      if (!best || fit.value > best.fit.value) { next = best; best = { tattoo, fit }; } else if (!next || fit.value > next.fit.value) next = { tattoo, fit };
    }
    if (best.fit.shown >= 0.6 && best.fit.fit >= 0.85 && best.fit.value > next.fit.value) out.push({ toad, tattoo: best.tattoo, fit: best.fit.fit });
  }
  return out;
}

/* The wand where it lies: its stage, 0-6, or null where no wand shows. */
function zbShotLillyWand(env, skip) {
  const sprites = decodeBitmapResource(env.arc.get('tBMP', ZB_SHOT_LILLY.toadSheet)).frames;
  let best = null;
  for (let stage = 0; stage <= 6; stage++) {
    const sprite = sprites[ZB_SHOT_LILLY.wand + stage - 1];
    if (!sprite) continue;
    const fit = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite, x: ZB_SHOT_LILLY.wandAt[0], y: ZB_SHOT_LILLY.wandAt[1] }]), 0, 0, skip);
    if (!best || fit.value > best.fit.value) best = { stage, fit };
  }
  return best && best.fit.fit >= 0.85 && best.fit.shown >= 0.6 ? best.stage : null;
}

/* Titanic Tattooed Toads. Returns { pond, toads, wand, zoombinis, state,
   lines, link }: `pond` zbShotLillyPads's, `toads` zbShotLillyToads's with
   `rows`, the rows (0-11 from the top) each can cross from, and `wand`
   zbShotLillyWand's. It returns no Zoombinis, since the small ones here
   are unread and a standing one read here is a misreading. */
function zbShotLilly(frame) {
  const env = zbShotEnv(frame), skip = new Uint8Array(ZB_SHOT_W * ZB_SHOT_H);
  const pond = zbShotLillyPads(env, skip), wand = zbShotLillyWand(env, skip);
  const toads = zbShotLillyToads(env, skip).map(t => ({ ...t, type: ZB_LILLY_TATTOO_TYPE[t.tattoo], value: ZB_LILLY_TATTOO_VALUE[t.tattoo] }));
  for (const t of toads) t.rows = zbLillyReach(pond.pads, t.type, t.value).rows;
  const lines = [];
  if (pond.unread > 100) {
    return { pond, toads, wand, zoombinis: [], state: { pads: null }, lines: ['The page could not read the pond’s pads, so it gives no rows for the toads.'], link: null };
  }
  lines.push(pond.unread ? `The page read ${144 - pond.unread} of the pond’s 144 pads. Something covers the other ${pond.unread}, and a covered pad counts as no match below.`
    : 'The page read all 144 of the pond’s pads.');
  if (wand != null) lines.push(wand >= 6 ? 'The wand is used up.' : wand ? `The wand has worn down ${wand} of its 6 stages.` : 'The wand is whole.');
  const rowWords = rows => (rows.length === 1 ? `row ${rows[0] + 1}` : `rows ${zbWordsOr(rows.map(r => String(r + 1)), 'and')}`);
  lines.push(`${toads.length === 1 ? 'One toad waits' : `${toads.length || 'No'} toads wait`} on the bank. The page counts rows from the top.`);
  for (const t of toads) {
    const name = `The toad with ${zbLillyWords(t.type, t.value)}${t.type === 3 ? ' mark' : t.type === 2 ? ' pad' : ''}`;
    lines.push(t.rows.length ? `${name} crosses from ${rowWords(t.rows)}.` : `${name} crosses from no row as the pond stands.`);
  }
  const text = k => pond.pads[k].map(r => r.map(v => (v == null ? '-' : v)).join(''));
  return { pond, toads, wand, zoombinis: [],
    state: { shapes: text('shape'), colors: text('color'), patterns: text('pattern'), wand,
      toads: toads.map(t => ({ toad: t.toad + 1, tattoo: zbLillyTattooName(t.tattoo), rows: t.rows.map(r => r + 1) })) },
    lines, link: null };
}

ZB_SHOT_PUZZLES.LILLY = zbShotLilly;
