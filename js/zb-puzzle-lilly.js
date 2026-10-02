/* zb-puzzle-lilly.js -- Titanic Tattooed Toads: twelve toads, a pond of
   lily pads, and a Zoombini on each toad's back.
   =========================================================================
   Needs zb-puzzle.js, and zb-mohawk.js, with which the deal reads LILLY.

   The pond is 12 rows of 12 lily pads, and every pad has three things
   about it: a mark in one of five colours (magenta, red, orange, cyan,
   beige), the mark's pattern, one of three (diamond, cross, flower), and
   the pad's own shape, one of four (one notch, two notches, three leaves,
   four leaves). Each of the twelve toads on the near bank has a tattoo
   that is one of those twelve things, and hops only onto pads that share
   it. The player drags a toad to a pad in the first column; the next
   Zoombini in line jumps on, and the toad hops as far as matching pads
   take it. A toad that reaches the far side sets its rider down, swims
   back and may be used once more; after its second crossing it leaves. A
   toad that cannot get across waits in the pond with its rider. The
   Zoombinis' own traits play no part here, except that a Zoombini's hair
   picks how it is drawn riding.

   What is hidden is the pond's plan. LILLY's REGS 15000, 15001 and 15002
   are three 12 x 12 maps of routes, one a family: 15000 has routes 1-3,
   for the patterns, 15001 routes 4-7, for the shapes, and 15002 routes
   8-12, for the colours, each a run of cells from the first column to
   the last; the deal reads them from the archive it is given. The
   program turns or mirrors all three maps together at
   random, gives each route a different value of its family, and paints
   each pad with the value of whichever route of each family covers it,
   or a value at random where none does. So each toad has one route laid
   for it, and more by chance. Then it cuts routes, by painting a route's
   pad with the next route's value of the same family: at level 1 all but
   half the band (rounded up) of the twelve routes may be cut, so that
   the routes left whole carry every Zoombini across, two to a toad; at
   levels 2 to 4 every route may be cut, and a wand that swaps two pads
   mends them. A pad in the third to twelfth row and column is cut with
   chance 25 in 101 (a draw of 0-100 above 75), at most twice a route,
   and a route not yet cut when it reaches such a pad in the bottom row
   is cut there. At levels 3 and 4 one family's
   map is turned a quarter first, so its routes run from top to bottom:
   they are the paths of crabs, which walk down from the top row and stand
   in the toads' way, and that family's toads have no route of their own.

   Before the band can move, levels 2 to 4 show the wand at work: the
   program swaps two pairs of pads, (row 5, column 5) with (row 7, column
   4) and (row 4, column 9) with (row 6, column 11), and the opening
   animation swaps them back. The pond the band plays is the one dealt.

   On the workbench nothing is hidden from the player, who sees every pad
   and tattoo, so there is no strategy to find. The form offers what the
   program chooses: the family turned for the crabs, the maps' turn or
   mirrors, the routes left whole at level 1 and the routes' tattoos; the
   pond is dealt again from the same numbers with those put in. solve
   gives the most that can cross, two to a toad, and the fewest wand
   swaps it finds for them (zbLillyPlan: one toad at a time, the one whose
   cheapest way across wants the fewest swaps, its way then kept from
   later swaps; and restarts that break its ties otherwise).

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_lilly.cpp and .h
   (initGridWithAttributes, generateChallengePatterns, rotateGrid,
   flipGrid, createToadRunners, recordGeneratedAnswerEntryRows,
   isAnswerEntryRowCrossable, advancePathOnGrid, handleArriveAtNode,
   trySelectSwapCell, debugGetAnswer, debugGetChances), checked against
   ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z. The page's setup at
   0x422b2c loads REGS 15000-15002 byte-swapped (0x428076) and calls the
   deal at 0x427684: the level's family and turn, the transform (0x4280f8
   turns, 0x428284 mirrors, as ScummVM's), the routes spared or cut, the
   tattoos given to routes (0x427448, pools of 3, 4 and 5 drawn without
   replacement), the pads row by row (a cut is a draw of 0-100 above 75,
   at 0x427af9), the two demonstration swaps (0x4270eb) and the wand's
   allowance; then the toads at 0x426266, each
   drawing its tattoo from a deck and a frame interval of 3-6 that
   nothing uses. Every draw, its range and its order are ScummVM's. A
   toad steps only onto an empty pad whose value in its tattoo's family
   is the tattoo's (0x425c85); its crossing count is held to 2 at
   0x4258cc; a swap of two different pads counts toward the wand's six
   stages at 0x428ac9. The tables are the program's at 0x4a17e6 and
   0x4a1800 (the tattoos' families and values), 0x4a14a2 (their numbers),
   0x4a1776 and 0x4a178e (the toads' copy), 0x4a182e (the routes a band
   needs),
   0x4a1858 (the rows and columns that may be cut) and 0x4a16e8 and
   0x4a16fc (the demonstration swaps). The Mac build names the same
   steps BUILDLILLYPADGRID, RANDOMIZELILYPADSHAPES, SETFROGATTRIBUTES,
   SWAPMAGICLILLYPADS, CHECKFROGPOSITIONANDMOVE and
   JUMPOFFPADCALLBACKPROC, and draws the same numbers in the same order.
   The values' names are from the pictures, LILLY tBMP 13000, which the
   pond draws a pad's shape with as shape 1-4 and its mark as shape 5-19
   (5 + 3 x colour + pattern), a shape being the sheet's frame one below
   it: the pads have one notch, two notches, three leaves and four; the
   marks are a diamond, a cross and a flower in each colour. ScummVM's
   debug text calls the shapes oneCut, twoCut, threeLeaf and fourLeaf,
   and pattern 0 a flower and pattern 2 a diamond, which the pictures
   have the other way round. utilities/puzzles/lilly.mjs holds the tables
   to ScummVM and ZOOMBINI.EXE and the reading of the maps to ScummVM's.

   Not checked against the program: how far a toad goes when the way is
   shut. It walks by its own greedy search (ScummVM's computeShortestPath
   and traversePathBFS); here a row is said to cross when matching pads
   join it to the far side, as ScummVM's isAnswerEntryRowCrossable says.
*/

/* The three families, by the program's number (ScummVM's PadAttrType):
   1 the mark's pattern, 2 the pad's shape, 3 the mark's colour. */
const ZB_LILLY_FAMILY = [null, 'pattern', 'shape', 'colour'];
const ZB_LILLY_VALUE_WORDS = {
  pattern: ['diamond', 'cross', 'flower'],
  shape: ['one-notch', 'two-notch', 'three-leaf', 'four-leaf'],
  colour: ['magenta', 'red', 'orange', 'cyan', 'beige'],
};
/* The twelve tattoos, by tattoo number 0-11, and a thirteenth, unused:
   family and value (ScummVM's kPatternAttrType, kPatternAttrValue); a
   tattoo's number is its kPatternAttrExtra. Routes 1-12 draw from these,
   route k from the pool of its family. */
const ZB_LILLY_TATTOO_TYPE = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 0];
const ZB_LILLY_TATTOO_VALUE = [0, 1, 2, 0, 1, 2, 3, 0, 1, 2, 3, 4, 0];
const ZB_LILLY_TATTOO_EXTRA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
/* By band size 0-20, the routes it needs whole: half the band, rounded
   up (ScummVM's kZmbToRowCount). */
const ZB_LILLY_ROUTES_NEEDED = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
/* By row, and again by column, whether a pad there may be cut: not in
   the first two (ScummVM's kRowColValidity; the thirteenth is unused). */
const ZB_LILLY_CUTTABLE = [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
/* A cut is tried with a draw of 0-100, and made above 75, at most twice
   a route (ScummVM's initGridWithAttributes). */
const ZB_LILLY_CUT = { draw: 100, above: 75, most: 2 };
/* The two demonstration swaps, as [column, row] pairs (ScummVM's
   kSwapPairCol and kSwapPairRow at 0, 2, 4 and 6). */
const ZB_LILLY_DEMO_SWAPS = [[[4, 4], [3, 6]], [[8, 3], [10, 5]]];
/* The three maps of routes are LILLY's REGS 15000-15002 (ScummVM's
   loadGridPatternRegs), read from the archive, never copied here. */
const ZB_LILLY_ROUTE_REGS = [15000, 15001, 15002];
/* Each map's routes: the first and last route number, which the next
   route after the last wraps to. */
const ZB_LILLY_MAP_ROUTES = [[1, 3], [4, 7], [8, 12]];

/* The maps from an opened LILLY, each 12 rows of 12 route numbers, 0 where
   no route runs, checked as ScummVM checks them: 144 numbers, big-endian,
   row by row, each 0 or one of its map's routes. Kept for each archive. */
const zbLillyMapsRead = new WeakMap();
function zbLillyRouteMaps(arc) {
  if (!arc) throw new Error('Titanic Tattooed Toads: the deal needs LILLY opened, for its route maps (REGS 15000-15002)');
  if (zbLillyMapsRead.has(arc)) return zbLillyMapsRead.get(arc);
  const maps = ZB_LILLY_ROUTE_REGS.map((id, g) => {
    if (!arc.has('REGS', id)) throw new Error(`Titanic Tattooed Toads: this LILLY has no REGS ${id}, one of the pond's route maps`);
    const v = parseRegs(arc.get('REGS', id));
    if (v.length !== 144) throw new Error(`Titanic Tattooed Toads: LILLY REGS ${id} holds ${v.length} numbers, not 12 x 12`);
    const [first, last] = ZB_LILLY_MAP_ROUTES[g];
    const bad = v.find(k => k && (k < first || k > last));
    if (bad !== undefined) throw new Error(`Titanic Tattooed Toads: LILLY REGS ${id} names route ${bad}, not one of ${first}-${last}`);
    return [...Array(12).keys()].map(row => Array.from(v.subarray(row * 12, row * 12 + 12)));
  });
  zbLillyMapsRead.set(arc, maps);
  return maps;
}

/* A route map edited, as REGS words in and out (map 0-2, 15000-15002 as
   stored, before the program turns or mirrors it): the pad at row, col
   given route (0 for none, else one of the map's own). */
function zbLillyEditMap(words, map, row, col, route) {
  const [first, last] = ZB_LILLY_MAP_ROUTES[map];
  if (route && (route < first || route > last)) throw new Error(`Titanic Tattooed Toads: map ${map + 1} holds routes ${first}-${last}, not ${route}`);
  const w = Array.from(words);
  w[row * 12 + col] = route;
  return w;
}
/* Each of a map's routes, as stored: its pads, and whether a toad could
   follow it from the first column to the last, a pad at a time to one
   beside it, before or behind (the routes on the disc all can). */
function zbLillyRouteRuns(words, map) {
  const [first, last] = ZB_LILLY_MAP_ROUTES[map], out = [];
  for (let route = first; route <= last; route++) {
    const on = (r, c) => r >= 0 && r < 12 && c >= 0 && c < 12 && words[r * 12 + c] === route;
    let pads = 0;
    for (let k = 0; k < 144; k++) if (words[k] === route) pads++;
    const seen = new Set(), todo = [];
    for (let r = 0; r < 12; r++) if (on(r, 0)) { seen.add(r * 12); todo.push([r, 0]); }
    let across = false;
    while (todo.length) {
      const [r, c] = todo.pop();
      if (c === 11) across = true;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (on(r + dr, c + dc) && !seen.has((r + dr) * 12 + c + dc)) { seen.add((r + dr) * 12 + c + dc); todo.push([r + dr, c + dc]); }
      }
    }
    out.push({ route, pads, across });
  }
  return out;
}

/* A map turned: 0 a quarter clockwise, 1 a half, 2 a quarter the other
   way (ScummVM's rotateGrid); mirrored: 0 left to right, 1 top to bottom
   (flipGrid). */
function zbLillyTurn(map, how) {
  const out = map.map(r => r.map(() => 0));
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      if (how === 0) out[col][11 - row] = map[row][col];
      else if (how === 1) out[11 - row][11 - col] = map[row][col];
      else out[11 - col][row] = map[row][col];
    }
  }
  return out;
}
function zbLillyMirror(map, how) {
  return how === 0 ? map.map(r => r.slice().reverse()) : map.slice().reverse().map(r => r.slice());
}

/* A tattoo, or a pad's value, in words: "a red", "a diamond", "a
   four-leaf"; family 1-3, value from 0. */
function zbLillyWords(type, value) {
  const w = ZB_LILLY_VALUE_WORDS[ZB_LILLY_FAMILY[type]][value];
  return (w === 'orange' ? 'an ' : 'a ') + w;
}

/* The pad's value in a family: pads is { pattern, shape, colour }, each
   12 x 12 by row and column. */
function zbLillyPad(pads, type, row, col) { return pads[ZB_LILLY_FAMILY[type]][row][col]; }

/* Whether a toad of this tattoo, set on the pad in the first column of
   this row, has matching pads all the way to the last column (ScummVM's
   isAnswerEntryRowCrossable, a search in four directions). */
function zbLillyCrosses(pads, type, value, row) {
  if (zbLillyPad(pads, type, row, 0) !== value) return false;
  const seen = new Set([row * 12]), todo = [[row, 0]];
  while (todo.length) {
    const [r, c] = todo.pop();
    if (c === 11) return true;
    for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 11 || nc < 0 || nc > 11 || seen.has(nr * 12 + nc)) continue;
      if (zbLillyPad(pads, type, nr, nc) !== value) continue;
      seen.add(nr * 12 + nc);
      todo.push([nr, nc]);
    }
  }
  return false;
}

/* The families a level may turn for a band of n (3-5, for maps 0-2). */
function zbLillyFamilies(level, n) {
  const small = ZB_LILLY_ROUTES_NEEDED[Math.min(n, 20)] < 8;
  return level === 3 ? (small ? [3, 4, 5] : [4]) : level === 4 ? (small ? [4, 5] : [4]) : [0];
}

/* The pond dealt for a band of n at a level, drawing from rnd as the
   program's 0x427684 does: the pads, the routes' tattoos, which routes
   were cut and where, the crabs' entries and the wand's allowance.
   over, for the workbench, puts the program's choices another way:
   { family, transform, mirrors, spared (routes kept whole at level 1),
   tattoos (route 1-12's, at 1-12) }; each is drawn for all the same, as
   the program would draw for that choice, and then replaced. */
function zbLillyPond(level, n, rnd, routeMaps, over = {}) {
  const maps = routeMaps.map(m => m.map(r => r.slice()));
  /* By route 1-12 (0 unused, and a fourteenth word the program clears):
     0 where the route may be cut, the route's number where it is spared. */
  const markers = [...Array(13).keys(), 0], shuffle = [...Array(13).keys(), 0];
  const needed = ZB_LILLY_ROUTES_NEEDED[Math.min(n, 20)];

  /* The family whose map is turned to run top to bottom, 3-5 for maps
     0-2 (ScummVM's _obstacleGridFamily; 0 none), and the most crab
     entries. */
  let family = 0, maxCrabEntries = 0, toCut = 12;
  if (level === 1) toCut = 12 - needed;
  if (level === 3) {
    maxCrabEntries = 2;
    family = needed < 8 ? rnd.range(3, 5) : 4;
  } else if (level === 4) {
    maxCrabEntries = 3;
    family = needed < 8 && rnd.range(4, 5) !== 4 ? 5 : 4;
  }
  if (over.family != null) family = over.family;
  if (family) maps[family - 3] = zbLillyTurn(maps[family - 3], 0);

  /* All three maps turned a half, or each mirrored one way or the other,
     or left alone. */
  let transform = rnd.range(0, 2);
  if (over.transform != null) transform = over.transform;
  const mirrors = [];
  for (let g = 0; g < 3; g++) {
    if (transform === 0) maps[g] = zbLillyTurn(maps[g], 1);
    else if (transform === 1) {
      const drawn = rnd.range(0, 1);
      mirrors.push(over.mirrors ? over.mirrors[g] : drawn);
      maps[g] = zbLillyMirror(maps[g], mirrors[g]);
    }
  }

  /* The routes that may be cut, drawn without replacement: at level 1,
     12 less the routes needed; at the others, all twelve. */
  for (let i = 0, max = 12; i < toCut; i++, max--) {
    const pick = rnd.range(1, max);
    markers[shuffle[pick]] = 0;
    for (let j = pick; j < max + 1; j++) shuffle[j] = shuffle[j + 1];
  }
  if (over.spared) for (let k = 1; k <= 12; k++) markers[k] = over.spared.includes(k) ? k : 0;

  /* Each route's tattoo, drawn without replacement from its family's
     pool: routes 1-3 the patterns, 4-7 the shapes, 8-12 the colours. */
  const pools = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9, 10, 11]].map(p => p.map(i => ZB_LILLY_TATTOO_EXTRA[i]));
  /* (A tattoo's number is its place in the table, so its family and
     value are looked up by it below.) */
  const routeTattoo = [0];
  for (let k = 1; k <= 12; k++) {
    const pool = pools[k <= 3 ? 0 : k <= 7 ? 1 : 2];
    routeTattoo.push(pool.splice(rnd.range(0, pool.length - 1), 1)[0]);
  }
  if (over.tattoos) for (let k = 1; k <= 12; k++) routeTattoo[k] = over.tattoos[k];

  /* The pads, row by row. A route's cell takes its route's value, or,
     cut, the next route's; the cut is tried where the row and column may
     be cut and the route may be cut and has been cut fewer than twice.
     The turned family's cuts change nothing but are counted. */
  const pads = { pattern: [], shape: [], colour: [] };
  const cutCount = Array(13).fill(0), cuts = [], crabEntries = [];
  let cutTotal = 0;
  for (let row = 0; row < 12; row++) {
    for (const f of ['pattern', 'shape', 'colour']) pads[f].push(Array(12).fill(0));
    for (let col = 0; col < 12; col++) {
      const set = { pattern: false, shape: false, colour: false };
      for (let g = 0; g < 3; g++) {
        const raw = maps[g][row][col];
        if (!raw) continue;
        const [first, last] = ZB_LILLY_MAP_ROUTES[g];
        let next = family === g + 3 ? raw : raw + 1;
        if (next > last) next = first;
        let route = raw;
        if (ZB_LILLY_CUTTABLE[row] && ZB_LILLY_CUTTABLE[col] && markers[raw] === 0 && cutCount[raw] < ZB_LILLY_CUT.most) {
          if (rnd.range(0, ZB_LILLY_CUT.draw) > ZB_LILLY_CUT.above || (row === 11 && cutCount[raw] === 0)) {
            cutCount[raw]++;
            cutTotal++;
            route = next;
            cuts.push({ row, col, route: raw, shows: next });
          }
        }
        const t = routeTattoo[route], f = ZB_LILLY_FAMILY[ZB_LILLY_TATTOO_TYPE[t]];
        set[f] = true;
        pads[f][row][col] = ZB_LILLY_TATTOO_VALUE[t];
        if (level >= 3 && crabEntries.length < maxCrabEntries && row === 0 && route >= ZB_LILLY_MAP_ROUTES[family - 3][0] && route <= ZB_LILLY_MAP_ROUTES[family - 3][1]) {
          crabEntries.push({ col, type: ZB_LILLY_TATTOO_TYPE[t], value: ZB_LILLY_TATTOO_VALUE[t] });
        }
      }
      if (!set.pattern) pads.pattern[row][col] = rnd.range(0, 2);
      if (!set.shape) pads.shape[row][col] = rnd.range(0, 3);
      if (!set.colour) pads.colour[row][col] = rnd.range(0, 4);
    }
  }
  return {
    maps, markers, family, transform, mirrors, routeTattoo, pads, cutCount, cuts, cutTotal, crabEntries,
    /* ceil((cuts + 5) / 6) swaps a stage, six stages. */
    swapsPerWandStage: Math.floor((cutTotal + 5 + 5) / 6),
  };
}

/* The whole deal: the pond, the toads on the bank and the words, with
   the workbench's choices put in (zbLillyPond's over). */
function zbLillyDeal(level, band, rnd, arc, over = {}) {
  const n = band.length, rndStart = rnd.state;
  const pond = zbLillyPond(level, n, rnd, zbLillyRouteMaps(arc), over);
  const { pads } = pond;

  /* The toads on the bank, top to bottom: each draws its tattoo from a
     deck of the twelve, then a frame interval of 3-6 that is not used. */
  const deck = [...Array(12).keys()], toads = [];
  for (let slot = 0; slot < 12; slot++) {
    const tattooIdx = deck.splice(rnd.range(0, deck.length - 1), 1)[0];
    rnd.range(3, 6);
    toads.push({ entrySlot: slot, attrType: ZB_LILLY_TATTOO_TYPE[tattooIdx], attrValue: ZB_LILLY_TATTOO_VALUE[tattooIdx], tattooIdx });
  }

  /* Each tattoo's route rows (ScummVM's _generatedAnswerEntryRowMasks:
     where a route of its reaches the first column; at level 1 only the
     routes spared), and the rows it crosses from as dealt. */
  const routeRows = Array.from({ length: 12 }, () => []);
  for (let g = 0; g < 3; g++) {
    for (let row = 0; row < 12; row++) {
      const raw = pond.maps[g][row][0];
      if (raw < 1 || raw > 12 || (level === 1 && pond.markers[raw] === 0)) continue;
      routeRows[pond.routeTattoo[raw]].push(row);
    }
  }
  for (const toad of toads) {
    toad.routeRows = routeRows[toad.tattooIdx];
    toad.crossRows = [...Array(12).keys()].filter(row => zbLillyCrosses(pads, toad.attrType, toad.attrValue, row));
    const route = pond.routeTattoo.indexOf(toad.tattooIdx, 1);
    toad.route = route;
    toad.cuts = pond.cutCount[route];
    /* At levels 3 and 4, whether its family's routes are the crabs'. */
    toad.turned = pond.family === toad.attrType + 2;
    toad.words = zbLillyWords(toad.attrType, toad.attrValue) + ' tattoo';
  }

  /* A plan: the band in order, two to a toad, first the toads that
     cross as dealt, then those whose route rows want mending. */
  const plan = [];
  for (const t of toads) if (t.crossRows.length) plan.push(...[0, 1].map(() => `toad ${t.entrySlot + 1} (${t.words}), from row ${t.crossRows[0] + 1}`));
  if (level > 1) {
    for (const t of toads) {
      if (t.crossRows.length || !t.routeRows.length || t.turned) continue;
      plan.push(...[0, 1].map(() => `toad ${t.entrySlot + 1} (${t.words}), from row ${t.routeRows[0] + 1} once mended`));
    }
  }

  const rowsWords = rows => zbWordsOr(rows.map(r => String(r + 1)));
  const answer = toads.map(t => {
    let s = `Toad ${t.entrySlot + 1}, with ${t.words}: `;
    if (t.crossRows.length) s += `crosses from row ${rowsWords(t.crossRows)}.`;
    else if (t.turned) s += 'its family’s routes run from top to bottom, for the crabs, and none crosses as dealt.';
    else if (t.routeRows.length && level > 1) s += `its route from row ${rowsWords(t.routeRows)} is cut, and wants the wand.`;
    else s += 'no way across as dealt.';
    return s;
  });
  const crossing = toads.filter(t => t.crossRows.length).length;
  const idle = pond.cuts.filter(c => c.shows === c.route).length;
  answer.push(`${crossing} of the toads cross as dealt, room for ${2 * crossing} Zoombinis. ${pond.cutTotal - idle} pads were cut`
    + (idle ? `, and ${idle} more cuts counted on the crabs’ routes, which change nothing.` : '.'));

  const setup = [`Twelve toads on the near bank and a pond of 12 by 12 lily pads. ${n} Zoombinis to cross.`,
    `The toads’ tattoos, from the top of the bank: ${toads.map(t => ZB_LILLY_VALUE_WORDS[ZB_LILLY_FAMILY[t.attrType]][t.attrValue]).join(', ')}.`];
  if (level > 1) setup.push(`A wand of ${6 * pond.swapsPerWandStage} swaps, ${pond.swapsPerWandStage} a stage.`);
  if (level > 2) {
    const cols = pond.crabEntries.map(e => String(e.col + 1));
    setup.push(`Crabs walk down the ${ZB_LILLY_FAMILY[pond.family - 2]} routes`
      + (cols.length ? `, from column${cols.length > 1 ? 's' : ''} ${zbWordsOr(cols, 'and')} of the top row.` : ', but none starts on the top row.'));
  }

  return {
    setup,
    answer,
    marks: band.map((z, i) => plan[i] || null),
    state: {
      obstacleGridFamily: pond.family,
      transformType: pond.transform,
      flipTypes: pond.mirrors,
      authoredPathGrids: pond.maps,
      challengeEnabledMarkers: pond.markers.slice(0, 13),
      challengeTattooIndices: pond.routeTattoo,
      challengePlacementCounts: pond.cutCount,
      challengePlacements: pond.cuts,
      patternPlacedCount: pond.cutTotal,
      padPattern: pads.pattern, padShape: pads.shape, padColor: pads.colour,
      crabEntries: pond.crabEntries,
      crabPathAttrType: pond.crabEntries.length ? pond.crabEntries[0].type : 0,
      swapsPerWandStage: level > 1 ? pond.swapsPerWandStage : 0,
      swapWandUses: level > 1 ? 6 * pond.swapsPerWandStage : 0,
      demoSwaps: level > 1 ? ZB_LILLY_DEMO_SWAPS : [],
      toads,
      /* Where the generator stood before the deal, for the workbench to
         deal again with its choices put in. */
      rndStart,
    },
  };
}

/* ---- the workbench: the pond's choices, solving it, drawing it -------- */

/* The marks' colours, as tBMP 13000 paints them. */
const ZB_LILLY_COLOURS = ['#ff52f6', '#fc2c44', '#ff7b00', '#4cfff3', '#f7ffbf'];
/* The turns and mirrors the program chooses between, as the form offers
   them: transform 0 turns all three maps a half, 1 mirrors each (0 left to
   right, 1 top to bottom), 2 leaves them. */
const ZB_LILLY_TRANSFORMS = [{ value: 'none', label: 'Left as laid' }, { value: 'half', label: 'Turned half round' },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(m => {
    const ms = [m >> 2 & 1, m >> 1 & 1, m & 1];
    return { value: `mirror:${ms.join('')}`, label: `Mirrored: patterns ${ms[0] ? 'top to bottom' : 'left to right'}, shapes ${ms[1] ? 'top to bottom' : 'left to right'}, colours ${ms[2] ? 'top to bottom' : 'left to right'}` };
  })];
function zbLillyTransformValue(state) {
  return state.transformType === 0 ? 'half' : state.transformType === 2 ? 'none' : `mirror:${state.flipTypes.join('')}`;
}
/* A route's name, for the form: "pattern route 2". */
function zbLillyRouteName(k) {
  const g = k <= 3 ? 0 : k <= 7 ? 1 : 2;
  return `${['pattern', 'shape', 'colour'][g]} route ${k - ZB_LILLY_MAP_ROUTES[g][0] + 1}`;
}
function zbLillyTattooName(t) { return ZB_LILLY_VALUE_WORDS[ZB_LILLY_FAMILY[ZB_LILLY_TATTOO_TYPE[t]]][ZB_LILLY_TATTOO_VALUE[t]]; }

/* The pads as a copy, and a swap of two of them, all three things at once
   as the wand swaps them (swapCellsAndUpdateRunners). */
function zbLillyCopyPads(pads) {
  return { pattern: pads.pattern.map(r => r.slice()), shape: pads.shape.map(r => r.slice()), colour: pads.colour.map(r => r.slice()) };
}
function zbLillySwap(pads, a, b) {
  for (const f of ['pattern', 'shape', 'colour']) {
    const v = pads[f][a[0]][a[1]];
    pads[f][a[0]][a[1]] = pads[f][b[0]][b[1]];
    pads[f][b[0]][b[1]] = v;
  }
}
/* A toad's reach on these pads: the matching pads joined to the last
   column (right), those joined to a matching pad of the first column
   (left), both by cell, row x 12 + column, and the rows it crosses from. */
function zbLillyReach(pads, type, value) {
  const grid = pads[ZB_LILLY_FAMILY[type]], right = new Uint8Array(144), left = new Uint8Array(144);
  const flood = (mark, seeds) => {
    const todo = seeds.filter(c => grid[c / 12 | 0][c % 12] === value);
    for (const c of todo) mark[c] = 1;
    while (todo.length) {
      const c = todo.pop(), r = c / 12 | 0, k = c % 12;
      for (const [dr, dk] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
        const nr = r + dr, nk = k + dk, n = nr * 12 + nk;
        if (nr < 0 || nr > 11 || nk < 0 || nk > 11 || mark[n] || grid[nr][nk] !== value) continue;
        mark[n] = 1;
        todo.push(n);
      }
    }
  };
  flood(right, [...Array(12).keys()].map(r => r * 12 + 11));
  flood(left, [...Array(12).keys()].map(r => r * 12));
  const rows = [...Array(12).keys()].filter(r => right[r * 12]);
  return { right, left, rows };
}
/* One way across for a toad from a row: the cells, shortest first. */
function zbLillyPath(pads, type, value, row) {
  const grid = pads[ZB_LILLY_FAMILY[type]], from = new Int16Array(144).fill(-1);
  if (grid[row][0] !== value) return null;
  const queue = [row * 12];
  from[row * 12] = row * 12;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], r = c / 12 | 0, k = c % 12;
    if (k === 11) {
      const path = [];
      for (let x = c; ; x = from[x]) { path.unshift([x / 12 | 0, x % 12]); if (from[x] === x) break; }
      return path;
    }
    for (const [dr, dk] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
      const nr = r + dr, nk = k + dk, n = nr * 12 + nk;
      if (nr < 0 || nr > 11 || nk < 0 || nk > 11 || from[n] >= 0 || grid[nr][nk] !== value) continue;
      from[n] = c;
      queue.push(n);
    }
  }
  return null;
}

/* The most of a band of n that can cross, with the fewest wand swaps the
   search finds: { pads (after the swaps), swaps: [[row, col], [row, col]],
   crossers: [{ slot, row, path }], plain (toads crossing with no swap),
   gaveUp }. Half the band, rounded up, of toads is enough, two riders
   each. One toad at a time, the cheapest: for each toad still to go, the
   way across with the fewest pads not of its tattoo (each wants a swap),
   through no pad another chosen toad's way holds in that family; then a
   pad of its value swapped onto each of those, one that neither takes a
   pad off a chosen way nor changes, in another family, a pad a chosen
   way of that family holds. The ways chosen are kept, so no later swap
   shuts a toad out. */
function zbLillyPlan(level, n, state, deadline, jitter = null) {
  const FAM = ['pattern', 'shape', 'colour'];
  const pads = zbLillyCopyPads({ pattern: state.padPattern, shape: state.padShape, colour: state.padColor });
  const toads = state.toads, need = Math.ceil(n / 2), wand = state.swapWandUses || 0;
  /* By family, the cells a chosen way holds: 1 + the toad's slot. */
  const held = { pattern: new Int8Array(144), shape: new Int8Array(144), colour: new Int8Array(144) };
  /* The cheapest way for a toad: a 0-1 search, a pad not of its value
     costing a swap; null if every way is held. */
  const cheapest = t => {
    const f = ZB_LILLY_FAMILY[t.attrType], v = t.attrValue, grid = pads[f];
    const cost = new Int16Array(144).fill(9999), from = new Int16Array(144).fill(-1), deque = [];
    for (let r = 0; r < 12; r++) {
      const c = r * 12;
      if (held[f][c]) continue;
      cost[c] = grid[r][0] === v ? 0 : 1; from[c] = c;
      if (cost[c]) deque.push(c); else deque.unshift(c);
    }
    let end = -1;
    while (deque.length) {
      const c = deque.shift(), r = c / 12 | 0, k = c % 12;
      if (k === 11) { if (end < 0 || cost[c] < cost[end]) end = c; continue; }
      for (const [dr, dk] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
        const nr = r + dr, nk = k + dk, x = nr * 12 + nk;
        if (nr < 0 || nr > 11 || nk < 0 || nk > 11 || held[f][x]) continue;
        const w = cost[c] + (grid[nr][nk] === v ? 0 : 1);
        if (w < cost[x]) { cost[x] = w; from[x] = c; if (grid[nr][nk] === v) deque.unshift(x); else deque.push(x); }
      }
    }
    if (end < 0) return null;
    const path = [];
    for (let x = end; ; x = from[x]) { path.unshift(x); if (from[x] === x) break; }
    return { cost: cost[end], path, wrong: path.filter(x => grid[x / 12 | 0][x % 12] !== v) };
  };
  /* A pad of value v in family f to swap onto cell c, the way `path` being
     chosen: none taken off a held cell of f or off the path, and no other
     family's value changed at a held cell. */
  const donor = (f, v, c, path) => {
    let best = null, bestDiff = 9;
    const onPath = new Set(path);
    for (let d = 0; d < 144; d++) {
      const dr = d / 12 | 0, dk = d % 12, cr = c / 12 | 0, ck = c % 12;
      if (d === c || pads[f][dr][dk] !== v || held[f][d] || onPath.has(d)) continue;
      let diff = 0, ok = true;
      for (const g of FAM) {
        if (g === f || pads[g][dr][dk] === pads[g][cr][ck]) continue;
        if (held[g][c] || held[g][d]) { ok = false; break; }
        diff++;
      }
      if (ok && diff < bestDiff) { best = d; bestDiff = diff; if (!diff) break; }
    }
    return best;
  };
  const swaps = [], chosen = [], failed = new Set();
  let gaveUp = false;
  while (chosen.length < need) {
    if (Date.now() > deadline) { gaveUp = true; break; }
    let pick = null;
    const ways = [];
    for (const t of toads) {
      if (failed.has(t.entrySlot) || chosen.some(c => c.slot === t.entrySlot)) continue;
      const way = cheapest(t);
      if (way) ways.push({ t, way });
      if (way && (!pick || way.cost < pick.way.cost)) pick = { t, way };
    }
    /* A restart's jitter: another of the cheapest, or one a swap dearer. */
    if (jitter && pick) {
      const near = ways.filter(w => w.way.cost <= pick.way.cost + (jitter() < 0.25 ? 1 : 0));
      pick = near[Math.floor(jitter() * near.length)];
    }
    if (!pick || swaps.length + pick.way.cost > wand) break;
    const { t, way } = pick, f = ZB_LILLY_FAMILY[t.attrType];
    for (const x of way.path) held[f][x] = t.entrySlot + 1;
    const done = [];
    for (const c of way.wrong) {
      const d = donor(f, t.attrValue, c, way.path);
      if (d == null) break;
      const a = [c / 12 | 0, c % 12], b = [d / 12 | 0, d % 12];
      zbLillySwap(pads, a, b);
      done.push([a, b]);
    }
    if (done.length < way.wrong.length) {
      /* No pad to put somewhere on its way: undo, and pass it over. */
      for (const [a, b] of done.reverse()) zbLillySwap(pads, a, b);
      for (const x of way.path) held[f][x] = 0;
      failed.add(t.entrySlot);
      continue;
    }
    swaps.push(...done);
    chosen.push({ slot: t.entrySlot, row: way.path[0] / 12 | 0, path: way.path.map(x => [x / 12 | 0, x % 12]), swapsBefore: swaps.length });
  }
  const plain = chosen.filter(c => c.swapsBefore === 0).map(c => c.slot);
  return { pads, swaps, crossers: chosen, plain, gaveUp, reached: chosen.length };
}

/* The plan with the fewest swaps of the cheapest-first one and of
   restarts that break its ties another way, as many as a share of the
   budget allows (their own small random numbers, so the same each time). */
function zbLillyBestPlan(level, n, state, deadline) {
  let best = zbLillyPlan(level, n, state, deadline);
  const better = p => p.reached > best.reached || (p.reached === best.reached && p.swaps.length < best.swaps.length);
  if (!best.swaps.length) return best;
  const until = Math.min(deadline, Date.now() + 300);
  let seed = 12345;
  const jitter = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  for (let k = 0; k < 400 && Date.now() < until; k++) {
    const p = zbLillyPlan(level, n, state, deadline, jitter);
    if (better(p)) best = p;
  }
  return best;
}

/* A tattoo drawn small, centred on x, y: a colour's spot, a pattern's
   figure, or a pad's outline with its notches or leaves. */
function zbLillyTattooItems(type, value, x, y, extra = {}) {
  const it = o => Object.assign(o, extra);
  if (type === 3) return [it({ t: 'circle', x, y, r: 7, fill: ZB_LILLY_COLOURS[value], stroke: 'line' })];
  if (type === 1) {
    if (value === 0) return [it({ t: 'poly', points: [x, y - 8, x + 7, y, x, y + 8, x - 7, y], fill: 'ink' })];
    if (value === 1) return [it({ t: 'line', x1: x - 6, y1: y - 6, x2: x + 6, y2: y + 6, stroke: 'ink', width: 3 }), it({ t: 'line', x1: x + 6, y1: y - 6, x2: x - 6, y2: y + 6, stroke: 'ink', width: 3 })];
    return [...[0, 1, 2, 3, 4].map(k => it({ t: 'circle', x: x + 5 * Math.cos(k * 1.2566), y: y + 5 * Math.sin(k * 1.2566), r: 3.2, fill: 'ink' })), it({ t: 'circle', x, y, r: 2.4, fill: 'warn' })];
  }
  if (value < 2) {
    const out = [it({ t: 'circle', x, y, r: 7.5, fill: 'good', stroke: 'line' })];
    for (let k = 0; k <= value; k++) {
      const a = -Math.PI / 2 + k * Math.PI;
      out.push(it({ t: 'poly', points: [x, y, x + 9 * Math.cos(a - 0.35), y + 9 * Math.sin(a - 0.35), x + 9 * Math.cos(a + 0.35), y + 9 * Math.sin(a + 0.35)], fill: 'panel' }));
    }
    return out;
  }
  const leaves = value + 1;
  return [...Array(leaves).keys()].map(k => it({ t: 'circle', x: x + 4.2 * Math.cos(k * 2 * Math.PI / leaves - Math.PI / 2), y: y + 4.2 * Math.sin(k * 2 * Math.PI / leaves - Math.PI / 2), r: 4.2, fill: 'good', stroke: 'line' }));
}
/* The line a toad's way is drawn in: its colour, or a role. */
function zbLillyInk(type, value) { return type === 3 ? ZB_LILLY_COLOURS[value] : type === 1 ? 'accent' : 'good'; }

/* The pond drawn: the pads by their marks' colours, the swaps, each
   crossing toad's way, the toads on the bank, and the band: those across
   by the toad that carried them, the rest faded below. */
function zbLillyDiagram(band, state, plan, caption) {
  const W = 800, H = 500, items = [], X = 170, Y = 52, C = 28;
  const pads = plan ? plan.pads : { pattern: state.padPattern, shape: state.padShape, colour: state.padColor };
  items.push({ t: 'rect', x: 0, y: 36, w: X - 10, h: 12 * C + 32, fill: 'grass' });
  items.push({ t: 'rect', x: X - 10, y: 36, w: 12 * C + 20, h: 12 * C + 32, fill: 'water' });
  items.push({ t: 'rect', x: X + 12 * C + 10, y: 36, w: W - X - 12 * C - 10, h: 12 * C + 32, fill: 'grass' });
  for (let r = 0; r < 12; r++) {
    items.push({ t: 'text', x: X - 16, y: Y + r * C + C / 2 + 4, text: String(r + 1), size: 10, anchor: 'end', fill: 'dim' });
    for (let c = 0; c < 12; c++) items.push({ t: 'circle', x: X + c * C + C / 2, y: Y + r * C + C / 2, r: 10, fill: ZB_LILLY_COLOURS[pads.colour[r][c]], faded: true });
  }
  for (const e of state.crabEntries || []) {
    const x = X + e.col * C + C / 2;
    items.push({ t: 'poly', points: [x - 6, Y - 12, x + 6, Y - 12, x, Y - 4], fill: 'bad' });
  }
  (plan ? plan.swaps : []).forEach(([a, b], k) => {
    const ax = X + a[1] * C + C / 2, ay = Y + a[0] * C + C / 2, bx = X + b[1] * C + C / 2, by = Y + b[0] * C + C / 2;
    items.push({ t: 'line', x1: ax, y1: ay, x2: bx, y2: by, stroke: 'warn', width: 1.5, dash: '4 3' });
    for (const [x, y] of [[ax, ay], [bx, by]]) items.push({ t: 'rect', x: x - 12, y: y - 12, w: 24, h: 24, r: 4, fill: null, stroke: 'warn', width: 2 });
    items.push({ t: 'text', x: ax + 13, y: ay - 8, text: String(k + 1), size: 11, fill: 'warn', weight: 'bold' });
  });
  const used = plan ? plan.crossers.map(c => c.slot) : [];
  /* The toads on the bank, top to bottom, by number and tattoo. */
  state.toads.forEach((t, k) => {
    const y = Y + k * C + C / 2, faded = !used.includes(t.entrySlot);
    items.push({ t: 'text', x: X - 58, y: y + 4, text: `toad ${k + 1}`, size: 11, anchor: 'end', fill: faded ? 'dim' : 'ink' });
    items.push(...zbLillyTattooItems(t.attrType, t.attrValue, X - 44, y, faded ? { faded: true } : {}));
  });
  /* Each crossing toad's way, and those it carried on the far bank. */
  const riders = new Map();
  (plan ? plan.crossers : []).forEach((c, k) => riders.set(c.slot, [2 * k, 2 * k + 1].filter(i => i < band.length)));
  (plan ? plan.crossers : []).forEach((c, k) => {
    const t = state.toads[c.slot], path = c.path || zbLillyPath(pads, t.attrType, t.attrValue, c.row) || [];
    const ink = zbLillyInk(t.attrType, t.attrValue), off = (k % 3 - 1) * 3;
    /* From the toad on the bank to its row, across, and out. */
    const pts = [X - 34, Y + c.slot * C + C / 2, X - 12, Y + c.row * C + C / 2 + off, ...path.flatMap(([r, q]) => [X + q * C + C / 2 + off, Y + r * C + C / 2 + off]), X + 12 * C + 14, Y + path[path.length - 1][0] * C + C / 2 + off];
    items.push({ t: 'poly', points: pts, closed: false, stroke: ink, width: 2.5 });
    const gy = Y + 36 + k * 50;
    items.push(...zbLillyTattooItems(t.attrType, t.attrValue, X + 12 * C + 34, gy - 16));
    items.push({ t: 'text', x: X + 12 * C + 48, y: gy - 12, text: `toad ${c.slot + 1}, row ${c.row + 1}`, size: 11, fill: 'ink' });
    items.push({ t: 'rect', x: X + 12 * C + 136, y: gy + 8, w: 64, h: 14, r: 3, fill: 'panel' });
    riders.get(c.slot).forEach((i, j) => items.push({ t: 'zoombini', i, x: X + 12 * C + 150 + j * 36, y: gy + 6 }));
  });
  const across = new Set([...riders.values()].flat());
  const behind = band.map((_, i) => i).filter(i => !across.has(i));
  items.push({ t: 'text', x: X - 10, y: Y + 12 * C + 36, size: 11, fill: 'dim',
    text: 'Pads in their colours (patterns and shapes not drawn); swaps outlined and numbered' + ((state.crabEntries || []).length ? '; crabs enter at the red marks.' : '.') });
  if (behind.length) items.push({ t: 'rect', x: X - 16, y: H - 20, w: behind.length * 34, h: 14, r: 3, fill: 'panel' });
  items.push(...zbDiagramRows(behind, X, H - 22, 18, 34, 0, { faded: true }));
  items.push({ t: 'text', x: 10, y: 24, text: caption, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}

ZB_PUZZLES.set('LILLY', {
  archive: 'LILLY',
  about: 'Each Zoombini rides a toad across a pond of lily pads. A toad hops only onto pads that share its tattoo, a colour, a pattern or a pad shape, so each must be set down on a row from which such pads lead to the far bank.',
  levels: [
    { rule: 'Hidden is which toad crosses from which row. Three maps of routes, one for each of patterns, shapes and colours, are turned or mirrored at random and each route given one of the twelve tattoos; half the band, rounded up, of the twelve routes are left whole and the rest may be cut, so every Zoombini can cross, two to a toad.',
      chances: 'No wand and no count of mistakes. Each toad carries two Zoombinis at most, and one sent from a row it cannot cross stays in the pond with its rider, who is left behind when the band moves on.' },
    { rule: 'The same pond, but every one of the twelve routes may be cut, at one or two pads, and a route still whole where it meets the bottom row is cut there. The cuts are mended with a wand that swaps two pads.',
      chances: 'The wand makes six times (cuts + 5) / 6 swaps, rounded up, at least five more than the pads cut, and is then spent. A toad that cannot cross waits in the pond with its rider until a swap opens its way; each toad carries two at most.',
      notes: ['Before play the wand is shown at work: two pairs of pads are swapped and then swapped back.'] },
    { rule: 'As level 2, and one family’s map is turned a quarter first, so that its routes run from the top row to the bottom: crabs walk down them from two places on the top row and stand in the toads’ way, and that family’s toads have no route of their own. The family is the shapes, or, with 14 Zoombinis or fewer, the patterns, shapes or colours at random.',
      chances: 'A wand of six times (cuts + 5) / 6 swaps, rounded up, as at level 2; each toad carries two at most.' },
    { rule: 'As level 3, with crabs from three places on the top row. The turned family is the shapes, or, with 14 Zoombinis or fewer, the shapes or colours at random.',
      chances: 'A wand of six times (cuts + 5) / 6 swaps, rounded up, as at level 2; each toad carries two at most.' },
  ],
  deal(level, band, rnd, journey, arc) { return zbLillyDeal(level, band, rnd, arc); },
  /* The program's choices: the family turned for the crabs, the maps'
     turn or mirrors, the routes left whole at level 1 and the routes'
     tattoos. */
  form(level, band, state) {
    const n = band.length, fams = zbLillyFamilies(level, n), need = ZB_LILLY_ROUTES_NEEDED[Math.min(n, 20)], fields = [];
    const famWord = f => ['patterns', 'shapes', 'colours'][f - 3];
    if (level >= 3) {
      if (fams.length > 1) fields.push({ key: 'family', label: 'Routes turned for the crabs', kind: 'choice', value: state.obstacleGridFamily, options: fams.map(f => ({ value: f, label: `the ${famWord(f)}’` })) });
      else fields.push({ key: 'familyNote', kind: 'note', note: `With ${n} Zoombinis the program always turns the shapes’ routes for the crabs.` });
    }
    fields.push({ key: 'transform', label: 'The maps', kind: 'choice', value: zbLillyTransformValue(state), options: ZB_LILLY_TRANSFORMS.map(o => ({ ...o })) });
    if (level === 1) {
      fields.push({ key: 'spared', label: `Routes left whole (${need})`, kind: 'several', min: need, max: need,
        value: [...Array(12).keys()].map(k => k + 1).filter(k => state.challengeEnabledMarkers[k] !== 0),
        options: [...Array(12).keys()].map(k => ({ value: k + 1, label: zbLillyRouteName(k + 1) })) });
    }
    fields.push({ key: 'tattoos', label: 'The routes’ tattoos: the patterns’ three routes, then the shapes’ four, then the colours’ five', kind: 'order',
      value: state.challengeTattooIndices.slice(1), options: [...Array(12).keys()].map(t => ({ value: t, label: zbLillyTattooName(t) })) });
    fields.push({ key: 'note', kind: 'note', note: 'Where the cuts fall, the pads no route covers and the toads’ places on the bank are the program’s draws: changing a field deals them again from the same numbers, as the program would.' });
    return fields;
  },
  edit(level, band, state, values, arc) {
    if (state.rndStart == null) throw new Error('This pond was not dealt here, so it cannot be dealt again with changes.');
    const n = band.length, need = ZB_LILLY_ROUTES_NEEDED[Math.min(n, 20)], over = {};
    if (level >= 3 && values.family != null) {
      const f = Number(values.family);
      if (!zbLillyFamilies(level, n).includes(f)) throw new Error(`With ${n} Zoombinis at this level the program turns only the ${zbWordsOr(zbLillyFamilies(level, n).map(x => ['patterns', 'shapes', 'colours'][x - 3]))}’ routes.`);
      over.family = f;
    }
    if (values.transform != null) {
      const v = String(values.transform), m = /^mirror:([01])([01])([01])$/.exec(v);
      if (v === 'half') over.transform = 0;
      else if (v === 'none') over.transform = 2;
      else if (m) { over.transform = 1; over.mirrors = m.slice(1).map(Number); }
      else throw new Error('The maps are turned half round, mirrored, or left as laid.');
    }
    if (level === 1 && values.spared != null) {
      const sp = [...new Set([].concat(values.spared).map(Number))];
      if (sp.some(k => !(k >= 1 && k <= 12))) throw new Error('There are twelve routes.');
      if (sp.length !== need) throw new Error(`With ${n} Zoombinis the program leaves ${need} route${need === 1 ? '' : 's'} whole, one for every two.`);
      over.spared = sp;
    }
    if (values.tattoos != null) {
      const ts = [].concat(values.tattoos).map(Number);
      if (ts.length !== 12 || new Set(ts).size !== 12 || ts.some(t => !(t >= 0 && t <= 11))) throw new Error('Each of the twelve tattoos goes to one route.');
      ts.forEach((t, k) => {
        const g = k < 3 ? 0 : k < 7 ? 1 : 2;
        if (ZB_LILLY_TATTOO_TYPE[t] !== g + 1) throw new Error(`The ${zbLillyRouteName(k + 1)} must have a ${['pattern', 'shape', 'colour'][g]} tattoo, not ${zbLillyWords(ZB_LILLY_TATTOO_TYPE[t], ZB_LILLY_TATTOO_VALUE[t])}.`);
      });
      over.tattoos = [0, ...ts];
    }
    return Object.assign(zbLillyDeal(level, band, zbRandom(state.rndStart), arc, over).state, { edited: true });
  },
  solve(level, band, state, arc, opts = {}) {
    const n = band.length, deadline = Date.now() + (opts.budget || 1500);
    const describe = (plan, title) => {
      const riders = plan.crossers.map((c, k) => [2 * k, 2 * k + 1].filter(i => i < n));
      const crosses = riders.flat(), behind = band.map((_, i) => i).filter(i => !crosses.includes(i));
      const steps = [
        ...plan.swaps.map(([a, b], k) => `Swap ${k + 1}: the pad in row ${a[0] + 1}, column ${a[1] + 1} with the pad in row ${b[0] + 1}, column ${b[1] + 1}.`),
        ...plan.crossers.map((c, k) => {
          const t = state.toads[c.slot];
          return `Toad ${c.slot + 1}, with ${zbLillyWords(t.attrType, t.attrValue)} tattoo, from row ${c.row + 1}: Zoombini${riders[k].length > 1 ? 's' : ''} ${zbPlacesWords(riders[k])}.`;
        }),
        ...(behind.length ? [`Zoombini${behind.length > 1 ? 's' : ''} ${zbPlacesWords(behind)} stay${behind.length > 1 ? '' : 's'} behind.`] : []),
      ];
      return { title, steps, crosses, diagram: zbLillyDiagram(band, state, plan, title) };
    };
    const plan = zbLillyBestPlan(level, n, state, deadline);
    const cross = Math.min(n, 2 * plan.crossers.length);
    const swapWords = k => k ? `${k} swap${k === 1 ? '' : 's'}` : 'no swaps';
    const solutions = [describe(plan, `${cross === n ? `All ${n}` : `${cross} of ${n}`} cross, ${swapWords(plan.swaps.length)}`)];
    if (plan.swaps.length) {
      const bare = zbLillyPlan(level, n, Object.assign({}, state, { swapWandUses: 0 }), deadline);
      const c0 = Math.min(n, 2 * bare.crossers.length);
      if (c0) solutions.push(describe(bare, `Without the wand, ${c0} of ${n} cross`));
    }
    const exact = level === 1 || cross === n;
    return {
      most: cross, exact, ways: null, solutions,
      notes: [
        'To cross is to be carried to the far bank; a toad carries two Zoombinis at most, so half the band, rounded up, of toads with a way across takes everyone.',
        'A toad is taken to cross when pads of its tattoo join its row to the far bank. The game’s toad walks by a greedy search of its own, and the crabs of levels 3 and 4 only hold it up.',
        'The Zoombinis’ own traits play no part, so which of them rides which toad, and in what order, makes no difference; ways that differ only so are one way, and the ways are not counted.',
        level === 1 ? 'At level 1 there is no wand, so the most is two for each toad with a way across: exact.'
          : `Simplest is the fewest wand swaps, of the ${state.swapWandUses} the wand allows. The toads that cross as dealt go first; then, one toad at a time, the fewest swaps that let another across without shutting out one already across: the fewest the search found, not proven the fewest.`,
        ...(exact ? [] : [plan.gaveUp ? 'The search stopped at its budget.' : `The search found no more toads to let across within the wand’s ${state.swapWandUses} swaps; more may be possible.`]),
      ],
    };
  },
  source: 'ScummVM’s puzzle_lilly.cpp, checked against the program’s code, with the route maps from LILLY.MHK.',
});
