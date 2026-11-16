/* zb-shot-smoke.js -- Mirror Machine read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-smoke.js.

   The crystals. Every reflection, filter and image in the machine is drawn
   from SMOKE tBMP 10000, each shape at the crystal's place minus the
   shape's registration point (REGS 10000 for x, 10001 for y). A crystal
   draws its frame, then the body when all four traits are set, then the
   feet, eyes, nose and hair. The body is the shape `base`, hair base + v,
   eyes base + 5 + v, nose base + 10 + v and feet base + 15 + v, v the
   trait's value 1-5. The base goes by the way the crystal faces: 1 for
   one turned to the right (cart's side), 22 for one facing out (the wall),
   43 for one turned to the left (mirror's side). The frames are shapes 64
   (a reflection on the wall), 65 (cart's side), 66 (mirror's side), 67
   (the image beside the cart) and 69 (a filter of levels 3 and 4 on the
   wall).

   The places. Every crystal that is not being carried stands at a fixed
   place, so the reader reads each place in turn with the base that place
   uses. A reflection or image is there when its parts are. A filter shows
   one or two parts and no body, so a filter is there when its frame fits.
   Filters placed at levels 3 and 4 stand in a layout that goes by how many
   are on that side, and the reader picks the layout whose frames all fit.

   Steps. At levels 3 and 4 a filter may step a trait on to its next value
   instead of setting it. At home such a filter shows the part running
   through all five values, and once placed it blinks the value it gives.
   In one frame a step looks like a part that sets the value it shows, so
   the reader reads every part as a set, and where no placement works it
   tries each part read as a step.

   The level. A reflection in the mirror facing out, or reflections on
   the wall, mean level 1 or 2, and level 2 when filters stand in its four
   fixed places. Filters at their homes on the wall, or a reflection in the
   mirror turned to the right, mean level 3 or 4, and level 4 when a second
   reflection waits beside the mirror.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_smoke.cpp and .h:
   smokeRunner_preRenderShape for the shapes and their order,
   spawnStackRunners for each runner's orientation and place,
   kCliffRunnerPositions, kGridRunnerPositions, kLevel2RunnerPositions,
   kExitRunnerPositions, kLevel4TransitionPositions,
   kBottomRunnerPositions, kFilterPositionsA and kFilterPositionsB for the
   places, the drop handler (kCliffDropSnapPosition) for the reflection
   in the mirror at levels 1 and 2, the filter drop (kBaseOneFramed00 and
   kBaseThreeFramed02) for a placed filter, _pedestalDropRect and
   _cartDropRect for the Zoombinis, and tickSmokeRunner,
   cycleZmbTraitDisplay and advanceAnswerRunnerFrames for how a step
   filter is drawn. Screenshots of the game at all four levels, taken on
   16 November 2026, show the crystals at those places.
*/

/* The crystals' sheet, its registration points and the frame shapes. */
const ZB_SHOT_SMOKE = { sheet: 10000, regs: 10000, wallFrame: 64, cartFrame: 65, mirrorFrame: 66, imageFrame: 67, homeFrame: 69 };

/* The share of a part's or a frame's pixels that must match for it to be
   read, in a screenshot that copies pixels and in a smoothed one. */
const ZB_SHOT_SMOKE_FIT = { part: 0.75, frame: 0.8, smoothPart: 0.6, smoothFrame: 0.65 };

/* The bases of a crystal's shapes: turned to the right, facing out,
   turned to the left. */
const ZB_SHOT_SMOKE_RIGHT = 1;
const ZB_SHOT_SMOKE_OUT = 22;
const ZB_SHOT_SMOKE_LEFT = 43;

/* The places for placed filters at levels 3 and 4 (and level 2's four
   fixed ones), by how many stand on that side, left to right
   (kFilterPositionsA and kFilterPositionsB, y 255). */
const ZB_SHOT_SMOKE_CART_LAYOUTS = [[], [211], [187, 247], [164, 211, 258]];
const ZB_SHOT_SMOKE_MIRROR_LAYOUTS = [[], [457], [424, 484], [409, 457, 505]];

/* The single places: the mirror (kCliffDropSnapPosition and
   kGridRunnerPositions 6), the second reflection of level 4
   (kGridRunnerPositions 7), the image beside the cart
   (kExitRunnerPositions 0) and the center crystal's two images
   (kBottomRunnerPositions). */
const ZB_SHOT_SMOKE_MIRROR = { x: 548, y: 255 };
const ZB_SHOT_SMOKE_SECOND = { x: 616, y: 253 };
const ZB_SHOT_SMOKE_IMAGE = { x: 124, y: 255 };
const ZB_SHOT_SMOKE_CENTER = [{ x: 317, y: 254 }, { x: 354, y: 254 }];

/* Where the Zoombinis wait (the pedestals' area) and the cart
   (_pedestalDropRect and _cartDropRect, the cart's widened to fit two). */
const ZB_SHOT_SMOKE_LEDGES = { x0: 0, y0: 20, x1: 262, y1: 244 };
const ZB_SHOT_SMOKE_CART = { x0: 0, y0: 240, x1: 85, y1: 295 };

/* A shape of the crystals' sheet as a drawing about its registration
   point, kept for the reading. */
function zbShotSmokeDrawing(env, sheet, shape) {
  if (!sheet.drawings.has(shape)) {
    sheet.drawings.set(shape, zbShotDrawing(env, [{ sprite: sheet.sprites[shape - 1], x: -sheet.xs[shape], y: -sheet.ys[shape] }]));
  }
  return sheet.drawings.get(shape);
}

/* The parts a crystal at (x, y) shows, drawn from the shapes after
   `base`: { traits: [hair, eyes, nose, feet], fits }, 0 where no part of
   that trait fits. */
function zbShotSmokeTraits(env, sheet, base, x, y, skip) {
  const traits = [0, 0, 0, 0], fits = [0, 0, 0, 0];
  [0, 5, 10, 15].forEach((offset, k) => {
    let best = null;
    for (let v = 1; v <= 5; v++) {
      const shape = base + offset + v;
      if (!sheet.sprites[shape - 1]) continue;
      const fit = zbShotDrawingFit(env, zbShotSmokeDrawing(env, sheet, shape), x, y, skip);
      if (!best || fit.value > best.fit.value) best = { v, fit };
    }
    if (best && best.fit.fit >= (env.smoothed ? ZB_SHOT_SMOKE_FIT.smoothPart : ZB_SHOT_SMOKE_FIT.part) && best.fit.shown >= 0.5) { traits[k] = best.v; fits[k] = best.fit.fit; }
  });
  return { traits, fits };
}

/* How well a frame shape fits at (x, y), 0-1. */
function zbShotSmokeFrameFit(env, sheet, shape, x, y, skip) {
  const fit = zbShotDrawingFit(env, zbShotSmokeDrawing(env, sheet, shape), x, y, skip);
  return fit.shown >= 0.5 ? fit.fit : 0;
}

/* An image (a reflection or a Zoombini's image) at a place, read with
   each of `bases`: { traits, base, parts }, the base whose parts fit
   most, or null where fewer than three parts show. */
function zbShotSmokeImage(env, sheet, bases, x, y, skip) {
  let best = null;
  for (const base of bases) {
    const t = zbShotSmokeTraits(env, sheet, base, x, y, skip), parts = t.traits.filter(Boolean).length, sum = t.fits.reduce((a, b) => a + b);
    if (parts >= 3 && (!best || parts > best.parts || (parts === best.parts && sum > best.sum))) best = { traits: t.traits, base, parts, sum };
  }
  return best && { traits: best.traits, base: best.base, parts: best.parts };
}

/* The filters on one side: the layout of `layouts` with the most filters
   whose frames all fit, as [{ x, y, traits }] left to right. */
function zbShotSmokeSide(env, sheet, layouts, frame, base, skip) {
  for (let n = layouts.length - 1; n > 0; n--) {
    const fits = layouts[n].map(x => zbShotSmokeFrameFit(env, sheet, frame, x, 255, skip));
    if (fits.every(f => f >= (env.smoothed ? ZB_SHOT_SMOKE_FIT.smoothFrame : ZB_SHOT_SMOKE_FIT.frame))) return layouts[n].map(x => ({ x, y: 255, traits: zbShotSmokeTraits(env, sheet, base, x, 255, skip).traits }));
  }
  return [];
}

/* Placed filters by their order on a side, from the cart or from the
   center crystal. */
const ZB_SHOT_SMOKE_NTH = ['first', 'second', 'third'];

/* Four values as a code, `empty` for a value of 0. */
const zbShotSmokeCode = (t, empty = '?') => t.map(v => v || empty).join('');
/* A Zoombini's four values, or null where a trait is unread. */
const zbShotSmokeOf = z => (ZB_SHOT_TRAITS.every(k => z.traits[k] != null) ? ZB_SHOT_TRAITS.map(k => z.traits[k]) : null);
/* A filter as zb-puzzle-smoke.js writes one, from the values read. */
const zbShotSmokeFilter = t => ({ traits: t.slice(), cycle: -1 });
/* What a filter gives, in words: "gives a cap and sunglasses". */
const zbShotSmokeGives = t => zbSmokeFilterWords(zbShotSmokeFilter(t)) || 'shows no part';

/* Mirror Machine. Reads the reflections on the wall, the filters, the
   reflection in the mirror, the image beside the cart and the center
   crystal's two images, and sets `where` on each Zoombini. Returns
   { level, levels, reflections, filters, mirror, second, image, center,
   cart, waiting, matches, placements, stepped, zoombinis, state, lines,
   link }: `levels` the levels the screenshot allows, `reflections` the
   eight on the wall (null where a place is empty), `filters` { home,
   cart, mirror }. */
function zbShotSmoke(frame, zoombinis) {
  const env = zbShotEnv(frame), arc = frame.arc, skip = zbShotCovered(zoombinis);
  const sheet = { sprites: decodeBitmapResource(arc.get('tBMP', ZB_SHOT_SMOKE.sheet)).frames, xs: parseRegs(arc.get('REGS', ZB_SHOT_SMOKE.regs)),
    ys: parseRegs(arc.get('REGS', ZB_SHOT_SMOKE.regs + 1)), drawings: new Map() };
  const S = ZB_SHOT_SMOKE, image = (bases, p) => zbShotSmokeImage(env, sheet, bases, p.x, p.y, skip);

  /* the wall: reflections at levels 1 and 2, filters at their homes at 3 and 4 */
  const reflections = ZB_SMOKE_REFLECTIONS.map(p => image([ZB_SHOT_SMOKE_OUT], p));
  const homes = ZB_SMOKE_FILTER_HOMES.map(p => (zbShotSmokeFrameFit(env, sheet, S.homeFrame, p.x, p.y, skip) >= (env.smoothed ? ZB_SHOT_SMOKE_FIT.smoothFrame : ZB_SHOT_SMOKE_FIT.frame)
    ? zbShotSmokeTraits(env, sheet, ZB_SHOT_SMOKE_OUT, p.x, p.y, skip).traits : null));
  const cartSide = zbShotSmokeSide(env, sheet, ZB_SHOT_SMOKE_CART_LAYOUTS, S.cartFrame, ZB_SHOT_SMOKE_RIGHT, skip);
  const mirrorSide = zbShotSmokeSide(env, sheet, ZB_SHOT_SMOKE_MIRROR_LAYOUTS, S.mirrorFrame, ZB_SHOT_SMOKE_LEFT, skip);
  const mirror = image([ZB_SHOT_SMOKE_OUT, ZB_SHOT_SMOKE_RIGHT], ZB_SHOT_SMOKE_MIRROR);
  const second = image([ZB_SHOT_SMOKE_LEFT], ZB_SHOT_SMOKE_SECOND);
  const shown = image([ZB_SHOT_SMOKE_LEFT], ZB_SHOT_SMOKE_IMAGE);
  const center = [image([ZB_SHOT_SMOKE_RIGHT], ZB_SHOT_SMOKE_CENTER[0]), image([ZB_SHOT_SMOKE_LEFT], ZB_SHOT_SMOKE_CENTER[1])];

  /* the level */
  const onWall = reflections.filter(Boolean).length, atHome = homes.filter(Boolean).length;
  let levels;
  if (onWall || (mirror && mirror.base === ZB_SHOT_SMOKE_OUT)) levels = cartSide.length === 2 && mirrorSide.length === 2 ? [2] : [1];
  else if (atHome || (mirror && mirror.base === ZB_SHOT_SMOKE_RIGHT)) levels = second ? [4] : [3, 4];
  else levels = [1, 2, 3, 4];
  const level = levels.length === 1 ? levels[0] : null, high = levels[0] >= 3;

  /* the Zoombinis */
  const inside = (r, z) => z.x >= r.x0 && z.x < r.x1 && z.y >= r.y0 && z.y < r.y1;
  const cart = zoombinis.filter(z => inside(ZB_SHOT_SMOKE_CART, z)).sort((a, b) => b.x - a.x);
  const waiting = zoombinis.filter(z => !cart.includes(z) && inside(ZB_SHOT_SMOKE_LEDGES, z));
  for (const z of zoombinis) z.where = cart.includes(z) ? 'in the cart' : waiting.includes(z) ? 'waiting' : '';
  const code = z => ZB_SHOT_TRAITS.map(k => z.traits[k] ?? '?').join('');

  const lines = [];
  const levelWords = level ? `level ${level}, ${ZB_LEVELS[level - 1]}` : `level ${zbWordsOr(levels.map(String), 'or')}`;
  lines.push(`The machine is set for ${levelWords}.`);
  const count = (n, one, many) => (n === 1 ? `one ${one}` : `${n || 'no'} ${many}`);
  const upper = t => t.replace(/^./, c => c.toUpperCase());
  lines.push(upper(`${count(cart.length, 'Zoombini is', 'Zoombinis are')} in the cart${waiting.length ? ` and ${count(waiting.length, 'waits', 'wait')} on the ledges` : ''}.`));

  let matches = null, placements = null, filters, stepped = null;
  if (!high) {
    filters = { cart: cartSide, mirror: mirrorSide };
    if (onWall) lines.push(`${count(onWall, 'reflection is', 'reflections are')} on the wall.`.replace(/^./, c => c.toUpperCase()));
    if (mirror) lines.push(`The reflection in the mirror is ${zbZoombiniWords(zbSmokeObj(mirror.traits))}.`);
    const fixed = [...cartSide, ...mirrorSide];
    if (fixed.length === 4) fixed.forEach((f, i) => lines.push(`The filter ${ZB_SMOKE_L2_PLACES[i]} ${zbShotSmokeGives(f.traits)}.`));
    /* which Zoombini matches which reflection: the reflection in the mirror
       came from the one place left empty on the wall */
    const empty = reflections.map((r, i) => (r ? -1 : i)).filter(i => i >= 0);
    const candidates = reflections.map((r, i) => (r && r.parts === 4 ? r.traits
      : !r && mirror && mirror.parts === 4 && empty.length === 1 && empty[0] === i ? mirror.traits : null));
    const band = [...cart, ...waiting];
    if ((level === 1 || fixed.length === 4) && band.length && candidates.some(Boolean)) {
      const four = level === 1 ? [] : fixed.map(f => zbShotSmokeFilter(f.traits));
      const near = t => zbSmokeThrough(t, four.slice(0, 2)), far = t => zbSmokeThrough(t, four.slice(2).reverse());
      matches = band.map(z => {
        const t = zbShotSmokeOf(z);
        return t ? candidates.map((c, i) => (c && zbSmokeSame(near(t), far(c)) ? i : -1)).filter(i => i >= 0) : null;
      });
      const pairs = [];
      band.forEach((z, i) => (matches[i] || []).forEach(r => pairs.push(`${code(z)} with the ${ZB_SMOKE_REFLECTIONS[r].name} reflection${!reflections[r] ? ', now in the mirror' : ''}`)));
      lines.push(pairs.length ? `${pairs.length === 1 ? 'One pair matches' : `${pairs.length} pairs match`}, ${zbWordsOr(pairs, 'and')}.`
        : 'No Zoombini read matches a reflection read.');
    }
  } else {
    filters = { home: homes, cart: cartSide, mirror: mirrorSide };
    const all = [...homes.filter(Boolean), ...cartSide.map(f => f.traits), ...mirrorSide.map(f => f.traits)];
    lines.push(`${count(atHome, 'filter is', 'filters are')} at home on the wall, ${count(cartSide.length, 'stands', 'stand')} on the cart’s side and ${count(mirrorSide.length, 'stands', 'stand')} on the mirror’s side.`.replace(/^./, c => c.toUpperCase()));
    if (mirror) lines.push(`The reflection in the mirror is ${zbZoombiniWords(zbSmokeObj(mirror.traits))}.`);
    if (second) lines.push(`The second reflection, beside the mirror, is ${zbZoombiniWords(zbSmokeObj(second.traits))}.`);
    /* the pairs: the first in line (the image beside the cart) with the
       mirror, the second with the reflection beside it */
    const first = shown && shown.parts === 4 ? shown.traits : cart[0] && zbShotSmokeOf(cart[0]);
    const pairs = [];
    if (first && mirror && mirror.parts === 4) pairs.push([first, mirror.traits]);
    if (pairs.length && second && second.parts === 4 && cart[1] && zbShotSmokeOf(cart[1])) pairs.push([zbShotSmokeOf(cart[1]), second.traits]);
    if (pairs.length && all.length === 6) {
      const fs = all.map(zbShotSmokeFilter);
      placements = zbSmokePlacements(fs, pairs);
      if (!placements.length) {
        /* each part read as a step in turn */
        for (let f = 0; f < 6 && !placements.length; f++) {
          for (let c = 0; c < 4 && !placements.length; c++) {
            if (!all[f][c]) continue;
            const trial = fs.map((g, i) => (i === f ? { traits: g.traits.map((v, k) => (k === c ? 0 : v)), cycle: c } : g));
            const found = zbSmokePlacements(trial, pairs);
            if (found.length) { placements = found; stepped = { filter: f, trait: c }; }
          }
        }
      }
      const homeAt = homes.map((h, k) => (h ? k : -1)).filter(k => k >= 0);
      const name = i => (i < atHome ? `the ${ZB_SMOKE_FILTER_HOMES[homeAt[i]].name} filter`
        : i < atHome + cartSide.length ? `the cart side’s ${ZB_SHOT_SMOKE_NTH[i - atHome]} filter`
          : `the mirror side’s ${ZB_SHOT_SMOKE_NTH[i - atHome - cartSide.length]} filter`);
      if (stepped) lines.push(`No placement works with every part read as a value the filter gives. With ${name(stepped.filter)} read as a step of the ${ZB_TRAIT_KINDS[stepped.trait]}, ${placements.length} do.`);
      if (placements.length) {
        const p = placements[0], k = p.left.length + p.right.length;
        lines.push(`${placements.length === 1 ? 'One placement works' : `${placements.length} placements work`} for ${pairs.length === 2 ? 'both pairs' : 'the Zoombini and its reflection'}. The simplest uses ${k} filter${k === 1 ? '' : 's'}, ${p.left.length ? zbWordsOr(p.left.map(name), 'then') : 'none'} on the cart’s side and ${p.right.length ? zbWordsOr(p.right.map(name), 'then') : 'none'} on the mirror’s side.`);
      } else if (!stepped) lines.push('No placement of the filters read works, so a part was misread or more than one filter steps a trait.');
      /* the filters as placed */
      const left = cartSide.map((_, i) => fs[atHome + i]), right = mirrorSide.map((_, i) => fs[atHome + cartSide.length + i]).reverse();
      const alike = pairs.every(([a, b]) => zbSmokeSame(zbSmokeThrough(a, left), zbSmokeThrough(b, right)));
      if (cartSide.length || mirrorSide.length) lines.push(`With the filters as they stand and every part read as a value given, ${pairs.length === 2 ? 'the pairs' : 'the Zoombini and its reflection'} ${alike ? 'look' : 'do not look'} the same in the center crystal.`);
    }
    lines.push('A filter that steps a trait shows one value of it in a screenshot, so the page reads each part shown as a value the filter gives.');
  }
  if (center[0] || center[1]) lines.push(`The center crystal shows ${center.map(c => (c ? zbShotSmokeCode(c.traits) : 'nothing')).join(' and ')}.`);

  const state = {
    level, wall: high ? homes.map(h => (h ? zbShotSmokeCode(h, '0') : null)) : reflections.map(r => (r ? zbShotSmokeCode(r.traits) : null)),
    cartSide: cartSide.map(f => zbShotSmokeCode(f.traits, '0')), mirrorSide: mirrorSide.map(f => zbShotSmokeCode(f.traits, '0')),
    mirror: mirror ? zbShotSmokeCode(mirror.traits) : null, second: second ? zbShotSmokeCode(second.traits) : null,
    image: shown ? zbShotSmokeCode(shown.traits) : null, cart: cart.map(code), waiting: waiting.length,
  };
  return { level, levels, reflections, filters, mirror, second, image: shown, center, cart, waiting, matches, placements, stepped,
    zoombinis: [...cart, ...waiting, ...zoombinis.filter(z => !cart.includes(z) && !waiting.includes(z))], state, lines, link: null };
}

ZB_SHOT_PUZZLES.SMOKE = zbShotSmoke;
