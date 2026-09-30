/* zb-puzzle-smoke.js -- Mirror Machine: a cart, a mirror, reflections of
   Zoombinis on the wall, and filters that change what a Zoombini looks
   like.
   =========================================================================
   Needs zb-puzzle.js.

   One at a time, each Zoombini rides a cart in from the left, and a
   reflection of a Zoombini is set in the mirror at the far end. The two
   are compared in the centre crystal between them: the Zoombini as seen
   through the filters on the cart's side, the reflection as seen through
   the filters on the mirror's side. If they look the same the Zoombini
   crosses; if not it is knocked back to the Shade Tree camp. Each
   Zoombini rides once, and no other count is kept. (The game's help
   names the reflections, the mirror and the centre crystal; ScummVM
   calls the reflections crystals.)

   A filter sets one or two traits (a cap, a red nose), and at levels 3
   and 4 it may instead step one trait on to its next value, in the
   Zoombini maker's order, the fifth back to the first. Filters work
   outward from the cart on one side and from the mirror on the other. An
   image is four values, hair, eyes, nose and feet, 1-5 each, kept here as
   an array in that order, as the program keeps them.

   Levels 1 and 2. One of the band still to go is picked at random, and
   eight reflections are dealt on the wall: seven show random Zoombinis
   and one, also at random, shows the picked one. The player puts a
   Zoombini in the cart and a reflection in the mirror. At level 2 four
   filters stand in fixed places, two on each side, each setting one or
   two traits; they are dealt first, from the picked Zoombini, so that
   what it looks like through the first two is what its reflection looks
   like through the other two, and the reflection's traits those two
   cover are random. After each ride a new Zoombini is picked and, at the
   lever, a new set of reflections (and filters) is dealt.

   Levels 3 and 4. The Zoombinis go in line and the reflection in the
   mirror is fixed; six filters are dealt for the player to place, up to
   three on each side, in order. They are made from the first Zoombini
   (at level 4 the first two, each with a reflection of its own) as a
   grid of rows: rows 1 and 2 carry it from the cart to the centre
   crystal, rows 3 and 4 carry the reflection there to the same image,
   and the reflection is worked out backwards through rows 4 and 3; rows
   5 and 6 are decoys. Each row sets one or two traits, drawing values
   without repeats from 1-5, and one trait of a row may be a step
   instead.

   Taken apart (the page's workbench): nothing here is hidden from the
   player, since the reflections and filters are all in view, so there is
   no strategy. The form picks the Zoombini and its reflection's place at
   levels 1 and 2 (at 2 the filters are dealt again for a new pick, from a
   seed of the band and the pick). Known, every Zoombini crosses: each
   ride is dealt so that it can be matched. The rides after the first are
   dealt as the band goes, from random numbers the animations share, so
   they are not drawn; the solutions are the first ride's, every
   Zoombini and reflection that match at levels 1 and 2, every placement
   of the filters that works at 3 and 4, the fewest filters first.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_smoke.cpp and .h
   (loadFeatures, selectQuestionZmb, copyPairToCompareBuffer,
   buildRunnerStacks, spawnStackRunners, assignLevel2RunnerTraits,
   initLowLevelQuestionRunners, generateTraitGrid,
   initLevel3RunnersAllTraits, cycleZmbTraitDisplay,
   advanceAnswerRunnerFrames, compareTwoOrderLines and the answer search
   in debugGetAnswer), checked against the program's own code in
   ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z: the setup at 0x4494b8 (the
   level in the word at 0x4b1b9c, 1-4; the Zoombini drawn with
   random(0, n - 1) at every level, kept at levels 1 and 2, the first two
   in line taken at 3 and 4), the stacks at 0x44d84a and 0x44d8e3, the
   level-2 filters at 0x44d2e4, the grid at 0x44dde9 (its 24 draws, every
   threshold and order), the shuffle at 0x44b967, the next question at
   0x44cfda and 0x44d0c1, the reflections dealt again at 0x44d178, the
   steps on the cart's side at 0x44bf13 and the comparison at 0x44c438;
   and the Mac build's RANDOMIZEPOSTCARDS, the same as 0x44d178. The
   reflections' and the filters' places are tables in ZOOMBINI.EXE as
   well. The words for the places are the game's help (ZOOMBINI STRL
   2700-2760).
   utilities/puzzles/smoke.mjs holds all of it to ScummVM's text and the
   tables to ZOOMBINI.EXE.

   Where ScummVM and the program part: when the reflections are dealt
   again for a later Zoombini, the program puts the matching one among
   the first min(n, 8), n the Zoombinis still to go, where ScummVM puts
   it among all eight. Only the deal on arrival is made here, which
   both do the same way.
*/

/* The eight reflections on the wall at levels 1 and 2, in the program's
   order (kCliffRunnerPositions), which reads along the rows from the top
   left; and the six places the level 3 and 4 filters are dealt to
   (kGridRunnerPositions 0-5), two rows of three, among them. */
const ZB_SMOKE_REFLECTIONS = [
  { x: 459, y: 26, name: 'top left' }, { x: 535, y: 25, name: 'top right' },
  { x: 429, y: 80, name: 'middle left' }, { x: 500, y: 84, name: 'centre' }, { x: 619, y: 76, name: 'middle right' },
  { x: 423, y: 168, name: 'bottom left' }, { x: 525, y: 167, name: 'bottom middle' }, { x: 605, y: 163, name: 'bottom right' },
];
const ZB_SMOKE_FILTER_HOMES = [
  { x: 441, y: 66, name: 'top left' }, { x: 531, y: 70, name: 'top middle' }, { x: 605, y: 67, name: 'top right' },
  { x: 421, y: 160, name: 'bottom left' }, { x: 483, y: 153, name: 'bottom middle' }, { x: 612, y: 153, name: 'bottom right' },
];
/* Level 2's four fixed filters (kLevel2RunnerPositions), left to right:
   0 next to the cart, 1 next to the centre crystal, 2 past it, 3 next to
   the mirror. */
const ZB_SMOKE_L2_PLACES = ['next to the cart', 'between it and the centre crystal', 'past the centre crystal', 'next to the mirror'];
/* How many of each the stacks are dealt (buildRunnerStacks). */
const ZB_SMOKE_REFLECTION_COUNT = 8;
const ZB_SMOKE_L2_FILTERS = 4;
const ZB_SMOKE_GRID = [0, 0, 7, 8];
/* The rolls, each against random(0, 100): a level 2 filter on the
   mirror's side repeats a trait a cart-side filter set above 65; a grid
   row's step is taken above 70 and a set value above 40. */
const ZB_SMOKE_ROLL = { reuse: 65, step: 70, fill: 40 };

const zbSmokeNext = v => v === 5 ? 1 : v + 1;
const zbSmokePrev = v => v <= 1 ? 5 : v - 1;
const zbSmokeZ = z => ZB_TRAIT_KINDS.map(k => z[k]);
const zbSmokeObj = t => ({ hair: t[0], eyes: t[1], nose: t[2], feet: t[3] });
const zbSmokeSame = (a, b) => a.every((v, i) => v === b[i]);

/* An image through filters, in the order they are met; a filter is
   { traits: [4], cycle: column 0-3 or -1 }, and a step works on the value
   coming in, as cycleZmbTraitDisplay and applyDebugFilterTraits do. */
function zbSmokeThrough(image, filters) {
  const out = image.slice();
  for (const f of filters) {
    for (let c = 0; c < 4; c++) {
      if (c === f.cycle) out[c] = zbSmokeNext(out[c]);
      else if (f.traits[c]) out[c] = f.traits[c];
    }
  }
  return out;
}

/* What a filter does, in a few words: "steps the nose on and gives a cap". */
function zbSmokeFilterWords(f) {
  const gives = [];
  for (let c = 0; c < 4; c++) if (c !== f.cycle && f.traits[c]) gives.push(zbTraitWith(ZB_TRAIT_KINDS[c], f.traits[c]));
  const parts = [];
  if (f.cycle >= 0) parts.push(`steps the ${ZB_TRAIT_KINDS[f.cycle]} on`);
  if (gives.length) parts.push(`gives ${zbWordsOr(gives, 'and')}`);
  return parts.join(' and ');
}

/* A reflection, as spawnStackRunners deals one: four values 1-5, then
   the picked Zoombini's values over them if it is the matching one (a
   value of 0 there, one a level 2 filter covers, is drawn again). */
function zbSmokeReflection(rnd, question, isTarget) {
  const t = [0, 0, 0, 0].map(() => rnd.range(1, 5));
  if (isTarget) for (let c = 0; c < 4; c++) t[c] = question[c] ? question[c] : rnd.range(1, 5);
  return t;
}

/* One of level 2's filters, as assignLevel2RunnerTraits deals it. s holds
   what the four share: seenA, seenB, question (the picked Zoombini's
   values, which the filters change as they go) and display (the eight
   rows the comparison reads). */
function zbSmokeLevel2Filter(idx, rnd, s) {
  const traits = [0, 0, 0, 0];
  const slotShuffle = [0, 1, 2, 3, 4], valueShuffle = [1, 2, 3, 4, 5, 6];
  let valueBound = 4, slotBound = 3;
  if (idx === 0) { s.seenA = [0, 0, 0, 0]; s.seenB = [0, 0, 0, 0]; }
  let budget = rnd.range(1, 2);
  const initial = budget;
  for (let entry = 0; entry < 4 && budget > 0; entry++) {
    const valueCursor = rnd.range(0, valueBound), slotCursor = rnd.range(0, slotBound);
    if (idx < 2) {
      /* The cart's side: a value the other cart-side filter did not
         already give that trait. */
      const slot = slotShuffle[slotCursor], value = valueShuffle[valueCursor];
      if (s.seenA[slot] !== value) {
        traits[slot] = value; s.display[idx + 1][slot] = value; s.seenA[slot] = value; budget--;
      }
    } else {
      /* The mirror's side: a trait at random, given the value the
         Zoombini has in the centre crystal; one a cart-side filter set is
         given only on a roll above 65, or on the last try if nothing is
         set. */
      const slot = rnd.range(0, 3);
      if (s.seenA[slot]) {
        const reuse = rnd.range(0, 100) > ZB_SMOKE_ROLL.reuse;
        if (reuse || (budget === initial && entry === 3)) {
          traits[slot] = s.seenA[slot]; s.display[idx + 2][slot] = s.seenA[slot]; s.seenB[slot] = s.seenA[slot]; budget--;
        }
      } else {
        traits[slot] = s.question[slot]; s.display[idx + 2][slot] = s.question[slot]; s.seenB[slot] = s.question[slot]; budget--;
      }
    }
    for (let i = slotCursor; i < slotBound; i++) slotShuffle[i] = slotShuffle[i + 1];
    slotBound--;
    for (let i = valueCursor; i < valueBound; i++) valueShuffle[i] = valueShuffle[i + 1];
    valueBound--;
    if (slotBound < 0 || valueBound < 0) break;
  }
  /* The picked Zoombini as it reaches the centre crystal; after the last
     filter, the traits the mirror's side covers are cleared, and the
     matching reflection draws them at random. */
  for (let c = 0; c < 4; c++) if (s.seenA[c]) s.question[c] = s.seenA[c];
  if (idx === 3) {
    for (let row = 5; row > 3; row--) for (let c = 0; c < 4; c++) if (s.display[row][c]) s.seenB[c] = s.display[row][c];
    for (let c = 0; c < 4; c++) if (s.question[c] === s.seenB[c]) s.question[c] = 0;
  }
  return { traits, cycle: -1 };
}

/* The pool a grid row draws its values from: 1-5 at indices 1-5, each
   taken out once used (generateTraitGrid's valuePool). */
function zbSmokeTake(pool, index, last) {
  for (let i = index; i < last + 1; i++) pool[i] = pool[i + 1];
}

/* Levels 3 and 4: the grid, as generateTraitGrid makes it when asked for
   row 1. q0 and q1 are the first two Zoombinis' values (q1 all 0 with
   only one). Returns { primary, secondary, match }, nine rows of four:
   rows 1-6 the filters, 7 the first reflection, 8 (secondary) the
   second;
   match holds a row's stepped value where it steps. */
function zbSmokeGrid(level, q0, q1, rnd) {
  const rows = () => Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  const P = rows(), S = rows(), M = rows();
  P[0] = q0.slice(); S[0] = q1.slice();
  const lastP = q0.slice(), lastS = q1.slice();
  /* Rows 1 and 2, the cart's side: perhaps a step in one column (the
     column drawn from 0-4, so one time in five none), and set values. */
  for (let row = 1; row < 3; row++) {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7];
    let filled = 0, made = false, last = 5;
    const matchColumn = rnd.range(0, 4);
    for (let col = 0; col < 4; col++) {
      if (filled >= 2) continue;
      const vi = rnd.range(1, last);
      if (col === matchColumn && rnd.range(0, 100) > ZB_SMOKE_ROLL.step && !made) {
        made = true;
        P[row][col] = zbSmokeNext(lastP[col] || q0[col]);
        S[row][col] = zbSmokeNext(lastS[col] || q1[col]);
        M[row][col] = P[row][col];
      } else if (rnd.range(0, 100) > ZB_SMOKE_ROLL.fill || (col === 3 && !filled)) {
        P[row][col] = S[row][col] = pool[vi];
      }
      if (P[row][col]) {
        lastP[col] = P[row][col]; lastS[col] = S[row][col]; filled++;
        zbSmokeTake(pool, vi, last); last--;
      }
    }
  }
  const carryP = lastP.slice(), carryS = lastS.slice();
  /* Rows 3 and 4, the mirror's side, next to the centre crystal and next
     to the mirror: each hands back the value the Zoombini has in the
     centre crystal, by stepping from one below it or setting it again. */
  for (let row = 3; row < 5; row++) {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7];
    let filled = 0, made = false, last = 5;
    rnd.range(0, 4);   /* a column is drawn here, as for rows 1 and 2, and not used */
    for (let col = 0; col < 4; col++) {
      if (filled >= 2) continue;
      const vi = rnd.range(1, last);
      const plain = (rnd.range(0, 100) <= ZB_SMOKE_ROLL.step && (col !== 3 || filled)) || made;
      const leftSet = (!M[2][col] && P[2][col]) || (!M[1][col] && P[1][col]);
      if (!plain) {
        made = true;
        if (row === 3) {
          P[row][col] = carryP[col] || q0[col]; S[row][col] = carryS[col] || q1[col];
        } else if (M[row - 1][col]) {
          P[row][col] = zbSmokePrev(carryP[col]); S[row][col] = zbSmokePrev(carryS[col]);
        } else if (P[row - 1][col]) {
          P[row][col] = S[row][col] = pool[vi];
        } else {
          P[row][col] = carryP[col] || q0[col]; S[row][col] = carryS[col] || q1[col];
        }
        M[row][col] = P[row][col];
      } else if (row === 3) {
        if (leftSet) { P[3][col] = carryP[col]; S[3][col] = carryS[col]; }
      } else if (M[row - 1][col]) {
        if (!made) {
          P[row][col] = zbSmokePrev(carryP[col]); S[row][col] = zbSmokePrev(carryS[col]);
          made = true; M[row][col] = P[row][col];
        }
      } else if (P[row - 1][col]) {
        P[row][col] = S[row][col] = pool[vi];
      } else if (leftSet) {
        P[row][col] = carryP[col]; S[row][col] = carryS[col];
      }
      if (P[row][col]) {
        carryP[col] = P[row][col]; carryS[col] = S[row][col]; filled++;
        zbSmokeTake(pool, vi, last); last--;
      }
    }
  }
  /* The reflections, worked back through rows 4 and 3: one below a step,
     anything where a value is set, and otherwise the Zoombini's own. */
  const back = (G, out) => {
    for (let col = 0; col < 4; col++) {
      if (M[4][col]) G[out][col] = zbSmokePrev(G[4][col]);
      else if (G[4][col]) G[out][col] = rnd.range(1, 5);
      else if (M[3][col]) G[out][col] = zbSmokePrev(G[3][col]);
      else if (G[3][col]) G[out][col] = rnd.range(1, 5);
      else G[out][col] = (G === P ? carryP : carryS)[col];
    }
  };
  back(P, 7);
  if (q1[0]) back(S, 8);
  if (level === 3) {
    /* Rows 5 and 6: filters at random, a step taken only in the column
       drawn (0-3). */
    for (let row = 5; row < 7; row++) {
      const pool = [0, 1, 2, 3, 4, 5, 6, 7];
      let filled = 0, last = 5;
      const matchColumn = rnd.range(0, 3);
      for (let col = 0; col < 4; col++) {
        if (filled >= 2) continue;
        const vi = rnd.range(1, last);
        if (col === matchColumn && rnd.range(0, 100) > ZB_SMOKE_ROLL.step) {
          P[row][col] = pool[vi]; M[row][col] = pool[vi];
        } else if (rnd.range(0, 100) > ZB_SMOKE_ROLL.fill || (col === 3 && !filled)) {
          P[row][col] = pool[vi];
        }
        if (P[row][col]) { filled++; zbSmokeTake(pool, vi, last); last--; }
      }
    }
  } else {
    /* Rows 5 and 6 at level 4: one a copy of a working row (1 or 2 into
       row 5, or 3 or 4 into row 6) with its step kept and its set values
       moved on one, the other a single value at random. */
    const copy = (src, dst) => {
      for (let col = 0; col < 4; col++) {
        if (M[src][col]) { P[dst][col] = P[src][col]; M[dst][col] = P[src][col]; }
        else if (P[src][col]) P[dst][col] = zbSmokeNext(P[src][col]);
      }
    };
    if (rnd.bool()) {
      copy(rnd.range(1, 2), 5);
      rnd.range(3, 4);   /* drawn, as the other way's source row is, and not used */
      const col = rnd.range(0, 3);
      P[6][col] = rnd.range(1, 5);
    } else {
      copy(rnd.range(3, 4), 6);
      rnd.range(1, 2);   /* likewise */
      const col = rnd.range(0, 3);
      P[5][col] = rnd.range(1, 5);
    }
  }
  return { primary: P, secondary: S, match: M };
}

/* A grid row as the filter it is dealt as: its values, and the last
   column it steps, if any (generateTraitGrid's tail). */
function zbSmokeGridFilter(grid, row) {
  let cycle = -1;
  for (let c = 0; c < 4; c++) if (grid.match[row][c]) cycle = c;
  return { traits: grid.primary[row].slice(), cycle };
}

/* The first placement of the six filters, fewest first, that makes each
   (source, reflection) pair look the same, as ScummVM's debugGetAnswer
   searches: by count, then cart-side count, then the filters in
   lexicographic order. Returns { left, right } as indices into filters,
   left from the cart and right from the centre crystal, or null. */
function zbSmokeSearch(filters, pairs) {
  const nextPermutation = a => {
    let i = a.length - 2;
    while (i >= 0 && a[i + 1] <= a[i]) i--;
    if (i < 0) return false;
    let j = a.length - 1;
    while (a[j] <= a[i]) j--;
    [a[i], a[j]] = [a[j], a[i]];
    for (let l = i + 1, r = a.length - 1; l < r; l++, r--) [a[l], a[r]] = [a[r], a[l]];
    return true;
  };
  for (let total = 0; total < 7; total++) {
    for (let leftCount = 0; leftCount < 4; leftCount++) {
      const rightCount = total - leftCount;
      if (rightCount < 0 || rightCount > 3) continue;
      const perm = filters.map((f, i) => i);
      do {
        const left = perm.slice(0, leftCount), right = perm.slice(leftCount, total);
        if (pairs.every(([source, image]) => zbSmokeSame(zbSmokeThrough(source, left.map(i => filters[i])),
          zbSmokeThrough(image, right.slice().reverse().map(i => filters[i]))))) return { left, right };
      } while (nextPermutation(perm));
    }
  }
  return null;
}

ZB_PUZZLES.set('SMOKE', {
  about: 'One at a time, each Zoombini rides a cart towards the centre crystal, and a reflection of a Zoombini is set in the mirror at the far end. Seen through the filters on each side, the Zoombini and the reflection must look the same in the centre crystal, or the Zoombini is knocked back to the Shade Tree camp.',
  levels: [
    { rule: 'One Zoombini still to cross is picked at random, and one of eight reflections on the wall, also at random, shows it exactly; the other seven show random Zoombinis. The player puts a Zoombini in the cart and a reflection in the mirror, and each ride is followed by a new pick and a new set of reflections.',
      chances: 'None are counted: each Zoombini rides the cart once, and one that does not match is knocked back to the Shade Tree camp.',
      notes: [
        'From the second ride on, the seven other reflections take only the first four of each trait’s values, so one with a cap, sunglasses, a blue nose or a propeller is the match.',
        'From the second ride on, while fewer than eight Zoombinis are left to go, the program puts the matching reflection among the first that many, counted along the rows from the top left; ScummVM puts it among all eight.',
      ] },
    { rule: 'As at level 1, with four filters in fixed places, each giving one or two traits: two between the cart and the centre crystal, two between it and the mirror. They are made from the Zoombini picked, so that it looks through the first two as its reflection looks through the other two; the reflection’s traits the second pair covers are random.',
      chances: 'None are counted, as at level 1: one ride each, and a Zoombini that does not match is knocked back.',
      notes: [
        'As at level 1, after the first ride a reflection with a value the others cannot have (a cap, sunglasses, a blue nose or a propeller) is the match, and the match keeps to the first few while fewer than eight Zoombinis are left.',
      ] },
    { rule: 'The Zoombinis go in line and the reflection in the mirror is fixed; six filters are dealt to be placed, up to three on each side of the centre crystal, in order. Each gives one or two traits, and some step one trait on instead, to the next value in the maker’s order, the fifth back to the first. Four are made from the Zoombini to work, two on each side; two are random.',
      chances: 'None are counted: each Zoombini rides once, and one that does not match is knocked back.',
      notes: [
        'The first Zoombini’s filters are laid out in the order they were made, so the top left then top middle filters on the cart’s side, and the top right then bottom left on the mirror’s side counting from the centre crystal, always work. Later sets are shuffled.',
        'In the program’s debug mode, F4 stops the shuffle for the sets that follow and F5 starts it again.',
      ] },
    { rule: 'As at level 3, but the Zoombinis go two at a time, the first two in line first, each with a reflection of its own, and the four working filters are made to serve both at once. Of the other two, one copies a working filter with its given values moved on one, and the other gives one trait at random.',
      chances: 'None are counted: each Zoombini rides once, and one that does not match is knocked back.',
      notes: [
        'As at level 3, the first pair’s filters are laid out in the order they were made: top left then top middle on the cart’s side, top right then bottom left on the mirror’s.',
      ] },
  ],
  form(level, band, state) { return zbSmokeForm(level, band, state); },
  edit(level, band, state, values) { return zbSmokeEdit(level, band, state, values); },
  solve(level, band, state, arc, opts = {}) { return zbSmokeSolve(level, band, state, opts); },
  deal(level, band, rnd) {
    const n = band.length;
    const images = band.map(zbSmokeZ);
    /* Every level draws a Zoombini from the band on arrival; levels 3 and
       4 then take the first two in line instead. */
    const pick = rnd.range(0, n - 1);
    const display = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
    if (level <= 2) {
      const question = images[pick].slice();
      const filters = [];
      if (level === 2) {
        rnd.range(0, ZB_SMOKE_L2_FILTERS - 1);   /* the stack's own pick, which only reflections use */
        const s = { question, display };
        for (let i = 0; i < ZB_SMOKE_L2_FILTERS; i++) filters.push(zbSmokeLevel2Filter(i, rnd, s));
      }
      const target = rnd.range(0, ZB_SMOKE_REFLECTION_COUNT - 1);
      const reflections = [];
      for (let i = 0; i < ZB_SMOKE_REFLECTION_COUNT; i++) reflections.push(zbSmokeReflection(rnd, question, i === target));
      const cart = z => zbSmokeThrough(z, filters.slice(0, 2));
      const matches = zbSmokeMatches(band, filters, reflections);
      const named = list => zbWordsOr(list.map(c => ZB_SMOKE_REFLECTIONS[c].name));
      const setup = [`Eight reflections on the wall. ${n} Zoombini${n === 1 ? '' : 's'} to cross, one cart ride each.`,
        `The reflections: ${reflections.map((c, i) => `${ZB_SMOKE_REFLECTIONS[i].name}: ${zbZoombiniWords(zbSmokeObj(c))}`).join('; ')}.`];
      if (level === 2) setup.push(`The filters: ${filters.map((f, i) => `${ZB_SMOKE_L2_PLACES[i]}, one that ${zbSmokeFilterWords(f)}`).join('; ')}.`);
      const answer = [`The Zoombini picked is ${zbZoombiniWords(band[pick])}, and the ${ZB_SMOKE_REFLECTIONS[target].name} reflection is its match`
        + (level === 2 ? `: both look ${zbZoombiniWords(zbSmokeObj(cart(images[pick])))} in the centre crystal.` : '.')];
      const chance = band.map((z, i) => i).filter(i => matches[i].length && !matches[i].includes(target));
      if (chance.length) answer.push(`By chance, ${zbWordsOr(chance.map(i => `${zbZoombiniWords(band[i])} matches the ${named(matches[i])} reflection`), 'and')}.`);
      return {
        setup,
        answer,
        marks: matches.map(m => m.length ? `matches the ${named(m)} reflection` : null),
        state: { questionIndex: pick, questionTraits: [images[pick], [0, 0, 0, 0]], questionCrystalIdx: target,
          cliffRunnerStates: reflections, level2RunnerStates: filters, displayTraits: display, matches },
      };
    }
    /* Levels 3 and 4: the first two in line, and the grid. */
    const q0 = images[0].slice(), q1 = n > 1 ? images[1].slice() : [0, 0, 0, 0];
    rnd.range(0, ZB_SMOKE_GRID[level - 1] - 1);   /* the stack's own pick, which only reflections use */
    const grid = zbSmokeGrid(level, q0, q1, rnd);
    const filters = [1, 2, 3, 4, 5, 6].map(row => zbSmokeGridFilter(grid, row));
    const pair = level === 4 && n > 1;
    const pairs = [[q0, grid.primary[7]]];
    if (pair) pairs.push([q1, grid.secondary[8]]);
    const found = zbSmokeSearch(filters, pairs);
    const names = list => zbWordsOr(list.map(i => ZB_SMOKE_FILTER_HOMES[i].name), 'then');
    const placing = p => !p.left.length && !p.right.length ? 'no filters at all'
      : `${p.left.length ? `the ${names(p.left)} filter${p.left.length > 1 ? 's' : ''} on the cart’s side` : 'none on the cart’s side'}`
        + ` and ${p.right.length ? `the ${names(p.right)} on the mirror’s side, from the centre crystal out` : 'none on the mirror’s side'}`;
    const setup = [
      pair ? `The first two in line, ${zbZoombiniWords(band[0])} and ${zbZoombiniWords(band[1])}, ride first, with reflections of ${zbZoombiniWords(zbSmokeObj(grid.primary[7]))} and ${zbZoombiniWords(zbSmokeObj(grid.secondary[8]))}.`
        : `The first in line, ${zbZoombiniWords(band[0])}, rides first; the mirror shows ${zbZoombiniWords(zbSmokeObj(grid.primary[7]))}.`,
      `The filters: ${filters.map((f, i) => `${ZB_SMOKE_FILTER_HOMES[i].name} ${zbSmokeFilterWords(f)}`).join('; ')}.`,
    ];
    const answer = found ? [`${pair ? 'Both match their reflections' : 'The first matches its reflection'} with ${placing(found)}.`]
      : ['No placement of the filters makes it match; the program would turn it away.'];
    const made = { left: [0, 1], right: [2, 3] };
    if (found && JSON.stringify(found) !== JSON.stringify(made)) answer.push(`The filters were made for ${placing(made)}.`);
    const marks = band.map(() => null);
    marks[0] = pair ? 'rides first, with the second' : 'rides first';
    if (pair) marks[1] = 'rides with the first';
    return {
      setup,
      answer,
      marks,
      state: { questionTraits: [q0, q1], primaryGridTraits: grid.primary, secondaryGridTraits: grid.secondary,
        gridMatchTraits: grid.match, gridRunnerStates: filters, solution: found },
    };
  },
  source: 'ScummVM’s puzzle_smoke.cpp, checked against the program’s code.',
});

/* ---- Taking the machine apart: the form, the known answer ------------ */

/* Which of the band match which reflection at levels 1 and 2: the band
   member through the cart's filters against the reflection through the
   mirror's, from the mirror in. */
function zbSmokeMatches(band, filters, reflections) {
  const cart = z => zbSmokeThrough(z, filters.slice(0, 2));
  const far = c => zbSmokeThrough(c, filters.slice(2).reverse());
  return band.map(zbSmokeZ).map(z => reflections.map((c, i) => zbSmokeSame(cart(z), far(c)) ? i : -1).filter(i => i >= 0));
}
/* The rows compareTwoOrderLines reads, from level 2's four filters. */
function zbSmokeDisplay(filters) {
  const display = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
  filters.forEach((f, i) => { display[i < 2 ? i + 1 : i + 2] = f.traits.slice(); });
  return display;
}

function zbSmokeForm(level, band, state) {
  if (level >= 3) {
    return [{ key: 'note', kind: 'note', note: `The six filters and the reflection${level === 4 ? 's' : ''} in the mirror are made together from the first ${level === 4 ? 'two' : 'Zoombini'} in line by the program’s recipe, and are not edited here; change the band, or deal again.` }];
  }
  return [
    { key: 'picked', label: 'The program picks', kind: 'choice', value: state.questionIndex,
      options: band.map((z, i) => ({ value: i, label: `${i + 1}: ${zbZoombiniWords(z)}` })) },
    { key: 'place', label: 'Its reflection is', kind: 'choice', value: state.questionCrystalIdx,
      options: ZB_SMOKE_REFLECTIONS.map((r, i) => ({ value: i, label: r.name })) },
    { key: 'note', kind: 'note', note: level === 2
      ? 'The four filters are made from the Zoombini picked: picking another deals them again from it (from a fixed seed), and its reflection with them. The other seven reflections are as dealt.'
      : 'The other seven reflections are as dealt; moving the match swaps it with the one in its new place.' },
  ];
}

function zbSmokeEdit(level, band, state, values) {
  if (level >= 3) return Object.assign({}, state, { edited: true });
  const pick = Number(values.picked), place = Number(values.place);
  if (!(pick >= 0 && pick < band.length && Number.isInteger(pick))) throw new Error('Pick one of the band.');
  if (!(place >= 0 && place < ZB_SMOKE_REFLECTION_COUNT && Number.isInteger(place))) throw new Error('Pick one of the eight places on the wall.');
  const reflections = state.cliffRunnerStates.map(r => r.slice());
  const old = state.questionCrystalIdx, base = reflections[old].slice();
  [reflections[old], reflections[place]] = [reflections[place], reflections[old]];
  let filters = state.level2RunnerStates.map(f => ({ traits: f.traits.slice(), cycle: f.cycle }));
  const image = zbSmokeZ(band[pick]);
  if (level === 1) reflections[place] = image;
  else {
    const question = image.slice();
    if (pick !== state.questionIndex) {
      /* Filters the program could deal for this pick, from a seed of the
         band and the pick, so the same values give the same puzzle. */
      let seed = 2166136261;
      for (const ch of `${zbBandCode(band)}:${pick}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
      const rnd = zbRandom(seed >>> 0), s2 = { question, display: Array.from({ length: 8 }, () => [0, 0, 0, 0]) };
      filters = [0, 1, 2, 3].map(i => zbSmokeLevel2Filter(i, rnd, s2));
    } else {
      /* As the filters left it: the picked Zoombini at the centre crystal,
         with the traits the mirror's side covers cleared. */
      const s2 = { question };
      for (const f of filters.slice(0, 2)) for (let c = 0; c < 4; c++) if (f.traits[c]) s2.question[c] = f.traits[c];
      for (const f of filters.slice(2)) for (let c = 0; c < 4; c++) if (f.traits[c] && f.traits[c] === s2.question[c]) s2.question[c] = 0;
    }
    /* The reflection: the picked Zoombini as it reaches the centre
       crystal, and where the mirror's filters cover a trait, the dealt
       reflection's own value, which the program draws at random. */
    reflections[place] = question.map((v, c) => v || base[c]);
  }
  return { questionIndex: pick, questionTraits: [image, [0, 0, 0, 0]], questionCrystalIdx: place, cliffRunnerStates: reflections,
    level2RunnerStates: filters, displayTraits: zbSmokeDisplay(filters), matches: zbSmokeMatches(band, filters, reflections), edited: true };
}

/* Every placement of the six filters, up to three a side in order, that
   makes each (source, reflection) pair look the same: { left, right },
   left from the cart and right from the centre crystal, fewest filters
   first, then fewest on the cart's side, then by the filters' places. */
function zbSmokePlacements(filters, pairs) {
  const out = [], idx = [0, 1, 2, 3, 4, 5];
  const pick = (from, k) => k === 0 ? [[]] : from.flatMap((x, i) => pick(from.filter((_, j) => j !== i), k - 1).map(rest => [x, ...rest]));
  for (let total = 0; total <= 6; total++) {
    for (let a = Math.max(0, total - 3); a <= Math.min(3, total); a++) {
      for (const left of pick(idx, a)) {
        for (const right of pick(idx.filter(i => !left.includes(i)), total - a)) {
          if (pairs.every(([source, image]) => zbSmokeSame(zbSmokeThrough(source, left.map(i => filters[i])),
            zbSmokeThrough(image, right.slice().reverse().map(i => filters[i]))))) out.push({ left, right });
        }
      }
    }
  }
  return out;
}

function zbSmokeSolve(level, band, state) {
  const n = band.length, all = band.map((_, i) => i);
  const later = n > 1
    ? `The rides after the first are dealt as the band goes: after each ride the program ${level <= 2 ? 'picks another of those left and deals the reflections again, one of them its match' : 'makes a new set of filters, and a reflection, from the next in line'}, so each can be matched in its turn, and all ${n} cross.`
    : 'There is one ride.';
  const notes = [
    'To cross here is to match: a Zoombini whose image and reflection look the same in the centre crystal crosses, and one that does not is knocked back to the Shade Tree camp; each rides once.',
    later,
    'The rides after the first are not drawn here: the program deals them from random numbers the game’s animations share, so what they will be is not known in advance, only that they can be matched. The solutions below are for the first ride.',
  ];
  if (level <= 2) {
    /* Every band member and reflection that match, alike Zoombinis once;
       the one the program picked first. */
    const seen = new Set(), pairs = [];
    state.matches.forEach((ms, i) => {
      const key = zbBandCode([band[i]]);
      if (seen.has(key)) return;
      seen.add(key);
      for (const r of ms) pairs.push({ i, r });
    });
    pairs.sort((a, b) => (b.i === state.questionIndex) - (a.i === state.questionIndex) || a.i - b.i || a.r - b.r);
    const filters = state.level2RunnerStates;
    const through = i => zbSmokeThrough(zbSmokeZ(band[i]), filters.slice(0, 2));
    const matching = new Set(pairs.map(p => p.i)).size;
    notes.push(`On the first ride ${matching} of the band ${matching === 1 ? 'matches' : 'match'} a reflection: the Zoombini the program picked${matching > 1 ? ', and the others by chance' : ''}. Any of them may ride first; each way is one Zoombini and one reflection, alike Zoombinis counted once.`);
    return {
      most: n, exact: true, ways: pairs.length,
      solutions: pairs.slice(0, 12).map(({ i, r }) => ({
        title: `Zoombini ${i + 1} with the ${ZB_SMOKE_REFLECTIONS[r].name} reflection${i === state.questionIndex ? '' : ', by chance'}`,
        steps: [
          `Put Zoombini ${i + 1} in the cart and the ${ZB_SMOKE_REFLECTIONS[r].name} reflection in the mirror.`,
          level === 2 ? `Through the filters both look ${zbZoombiniWords(zbSmokeObj(through(i)))} in the centre crystal.` : 'They are the same Zoombini.',
          ...(n > 1 ? ['Then, ride by ride, the one the program picks next with its reflection.'] : []),
        ],
        crosses: all,
        diagram: zbSmokeDiagram(level, band, state, { ride: [i], reflection: r, caption: `The first ride: Zoombini ${i + 1}` }),
      })),
      notes,
    };
  }
  const pair = level === 4 && n > 1;
  const filters = state.gridRunnerStates;
  const sources = [state.questionTraits[0], ...(pair ? [state.questionTraits[1]] : [])];
  const images = [state.primaryGridTraits[7], ...(pair ? [state.secondaryGridTraits[8]] : [])];
  const found = zbSmokePlacements(filters, sources.map((q, k) => [q, images[k]]));
  const names = list => zbWordsOr(list.map(i => ZB_SMOKE_FILTER_HOMES[i].name), 'then');
  const fw = i => `${ZB_SMOKE_FILTER_HOMES[i].name} (${zbSmokeFilterWords(filters[i])})`;
  notes.push(`Every placement of the six filters that works for the first ${pair ? 'two' : 'Zoombini'} is counted: ${found.length}. The simplest has the fewest filters, then the fewest on the cart’s side.`);
  notes.push('The program makes the filters so that the top left then top middle on the cart’s side and the top right then bottom left on the mirror’s side always work; the first set is laid out in that order.');
  return {
    most: n, exact: true, ways: found.length,
    solutions: found.slice(0, 12).map(p => {
      const k = p.left.length + p.right.length;
      return {
        title: `${k} filter${k === 1 ? '' : 's'}${k ? `: ${p.left.length ? names(p.left) : 'none'} | ${p.right.length ? names(p.right) : 'none'}` : ''}`,
        steps: [
          p.left.length ? `On the cart’s side, from the cart: ${zbWordsOr(p.left.map(fw), 'then')}.` : 'On the cart’s side, no filter.',
          p.right.length ? `On the mirror’s side, from the centre crystal: ${zbWordsOr(p.right.map(fw), 'then')}.` : 'On the mirror’s side, no filter.',
          ...sources.map((q, s) => `${pair ? (s ? 'The second, ' : 'The first, ') : ''}${zbZoombiniWords(band[s])}, and ${pair ? 'its' : 'the'} reflection both look ${zbZoombiniWords(zbSmokeObj(zbSmokeThrough(q, p.left.map(i => filters[i]))))} in the centre crystal.`),
        ],
        crosses: all,
        diagram: zbSmokeDiagram(level, band, state, { ride: pair ? [0, 1] : [0], placement: p, caption: `The first ride${pair ? ', two at once' : ''}: ${k} filter${k === 1 ? '' : 's'}` }),
      };
    }),
    notes,
  };
}

/* An image as the game's own parts, hair above feet, centred on x, y. */
function zbSmokeImageItems(t, x, y, extra = {}) {
  return ZB_TRAIT_KINDS.map((kind, c) => Object.assign({ t: 'trait', kind, value: t[c], x, y: y - 27 + c * 18, scale: 1.5 }, extra));
}

/* The machine drawn: the band waiting, the wall (the reflections at
   levels 1 and 2, the filters' homes at 3 and 4), and along the bottom
   the cart, the filters in their places, the centre crystal with the
   image seen there, and the mirror. ride is the band members in the
   cart; reflection the one in the mirror (levels 1 and 2); placement the
   filters placed (levels 3 and 4). */
function zbSmokeDiagram(level, band, state, { ride = [], reflection = null, placement = null, caption = '' }) {
  const W = 800, H = 500, items = [], n = band.length, Y = 420;
  const panel = (x, y, w, h, extra = {}) => items.push(Object.assign({ t: 'rect', x: x - w / 2, y: y - h / 2, w, h, r: 6, fill: 'panel', stroke: 'line' }, extra));
  const filterAt = (f, x, y, faded) => {
    panel(x, y, 58, 74, faded ? { faded: true } : {});
    const set = [0, 1, 2, 3].filter(c => c !== f.cycle && f.traits[c]);
    set.forEach((c, k) => items.push({ t: 'trait', kind: ZB_TRAIT_KINDS[c], value: f.traits[c], x, y: y - 16 + k * 26, scale: 1.5, faded }));
    if (f.cycle >= 0) items.push({ t: 'text', x, y: y + 30, text: `${ZB_TRAIT_KINDS[f.cycle]} +1`, size: 11, anchor: 'middle', fill: 'warn', faded });
  };
  /* The rails, the cart and the machine's line. */
  items.push({ t: 'line', x1: 20, y1: Y + 26, x2: 780, y2: Y + 26, stroke: 'wood', width: 4 });
  items.push({ t: 'rect', x: 22, y: Y - 8, w: 88, h: 30, r: 4, fill: 'wood', stroke: 'line' });
  items.push({ t: 'text', x: 66, y: Y + 44, text: 'the cart', size: 11, anchor: 'middle', fill: 'dim' });
  items.push({ t: 'circle', x: 400, y: Y - 20, r: 44, fill: 'panel', stroke: 'accent', width: 2 });
  items.push({ t: 'text', x: 400, y: Y + 44, text: 'the centre crystal', size: 11, anchor: 'middle', fill: 'dim' });
  const two = level === 4 && n > 1 && ride.length > 1;
  items.push(two ? { t: 'rect', x: 672, y: Y - 70, w: 120, h: 96, r: 8, fill: 'panel', stroke: 'ink', width: 2 }
    : { t: 'rect', x: 700, y: Y - 70, w: 80, h: 96, r: 8, fill: 'panel', stroke: 'ink', width: 2 });
  items.push({ t: 'text', x: 740, y: Y + 44, text: 'the mirror', size: 11, anchor: 'middle', fill: 'dim' });
  /* Who rides, and who waits. */
  const waiting = band.map((_, i) => i).filter(i => !ride.includes(i));
  items.push({ t: 'text', x: 14, y: 50, text: waiting.length ? 'waiting' : '', size: 12, fill: 'dim' });
  items.push(...zbDiagramRows(waiting, 30, 110, 7, 48, 62));
  ride.forEach((i, k) => items.push({ t: 'zoombini', i, x: ride.length > 1 ? 46 + k * 42 : 66, y: Y - 10 }));
  let seen = null, seen2 = null;
  if (level <= 2) {
    const refl = state.cliffRunnerStates, filters = state.level2RunnerStates;
    /* The wall: eight reflections in three rows. */
    const spots = [[520, 70], [650, 70], [470, 170], [600, 170], [730, 170], [470, 270], [600, 270], [730, 270]];
    items.push({ t: 'text', x: 430, y: 24, text: 'the reflections on the wall', size: 12, fill: 'dim' });
    refl.forEach((r, k) => {
      const [x, y] = spots[k];
      panel(x, y, 62, 88, k === reflection ? { dash: true, fill: 'stone', faded: true } : {});
      if (k !== reflection) items.push(...zbSmokeImageItems(r, x, y));
    });
    if (level === 2) [150, 260, 530, 630].forEach((x, k) => filterAt(filters[k], x, Y - 20, false));
    if (reflection != null) {
      items.push(...zbSmokeImageItems(refl[reflection], 740, Y - 22));
      if (ride.length) seen = zbSmokeThrough(zbSmokeZ(band[ride[0]]), filters.slice(0, 2));
    }
  } else {
    const filters = state.gridRunnerStates, spots = [[480, 80], [600, 80], [720, 80], [480, 190], [600, 190], [720, 190]];
    items.push({ t: 'text', x: 430, y: 24, text: 'the filters’ places', size: 12, fill: 'dim' });
    const placed = placement ? [...placement.left, ...placement.right] : [];
    spots.forEach(([x, y], k) => {
      if (placed.includes(k)) panel(x, y, 58, 74, { dash: true, fill: 'stone', faded: true });
      else filterAt(filters[k], x, y, false);
      items.push({ t: 'text', x, y: y + 50, text: ZB_SMOKE_FILTER_HOMES[k].name, size: 10, anchor: 'middle', fill: 'dim' });
    });
    if (placement) {
      placement.left.forEach((f, k) => filterAt(filters[f], 150 + k * 72, Y - 20, false));
      placement.right.forEach((f, k) => filterAt(filters[f], 510 + k * 62, Y - 20, false));
      if (ride.length) seen = zbSmokeThrough(state.questionTraits[0], placement.left.map(f => filters[f]));
      if (two) seen2 = zbSmokeThrough(state.questionTraits[1], placement.left.map(f => filters[f]));
    }
    items.push(...zbSmokeImageItems(state.primaryGridTraits[7], two ? 705 : 740, Y - 22));
    if (two) items.push(...zbSmokeImageItems(state.secondaryGridTraits[8], 760, Y - 22));
  }
  if (seen) items.push(...zbSmokeImageItems(seen, seen2 ? 382 : 400, Y - 20));
  if (seen2) items.push(...zbSmokeImageItems(seen2, 418, Y - 20));
  items.push({ t: 'text', x: 14, y: 24, text: caption, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}
