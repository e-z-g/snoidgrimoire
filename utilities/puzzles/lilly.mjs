// Titanic Tattooed Toads (js/zb-puzzle-lilly.js) against ScummVM's
// puzzle_lilly.cpp and .h, the 1996 program and LILLY.MHK:
//
//   - the tables: the twelve tattoos' families, values and numbers, the
//     routes a band needs, the rows and columns that may be cut, the
//     demonstration swaps, the maps' route numbers and the pools, are
//     ScummVM's, read from its text; as the program keeps them, a word
//     each, they are in ZOOMBINI.EXE (the toads' copy of the tattoos just
//     before "Lilly.MHK");
//   - the three route maps are read from LILLY's REGS 15000-15002, the
//     ids ScummVM's setup loads, as ScummVM reads them: 144 big-endian
//     numbers row by row, each 0 or one of the map's routes, every route
//     there; a LILLY without them fails with its own error;
//   - the random draws come in ScummVM's order: the family, the
//     transform, the routes that may be cut, the pools, the pads row by
//     row (a cut tried, then the families no route covers), then the
//     toads, each a deck draw and an unused 3-6;
//   - over bands of 16, 12, 9 and 5 at each level: each route's tattoo is
//     of its map's family and the toads hold all twelve; every pad is its
//     route's value, the next route's where cut, and cuts are at most two
//     a route in the rows and columns that may be cut; with the cuts
//     undone every route not turned crosses from its rows; at level 1 the
//     routes spared are half the band, rounded up, uncut, and carry
//     everyone; the wand is six times (cuts + 5) / 6 rounded up; the
//     crabs start on the top row of the turned family's routes; and every
//     mark names a toad that crosses from its row, two a toad at most.
const nums = body => [...body.matchAll(/-?\d+/g)].map(m => Number(m[0]));

export default function check({ S, fail, say, scumm, exe, need, bands, find, open }) {
  const h = scumm('zoombini_pages/puzzle_lilly.h'), cpp = scumm('zoombini_pages/puzzle_lilly.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const table = (name, n) => nums(need(new RegExp(`${name}\\[${n}\\]\\{([\\s\\S]*?)\\};`), h, name)[1]);
  // A function's text, from its definition to the brace that closes it.
  const fn = name => need(new RegExp(`\\n\\w[\\w ]* ZoombiniPuzzleLilly::${name}\\([^)]*\\)[^\\n;]*\\{[\\s\\S]*?\\n\\}\\n`), cpp, name)[0];
  const P = S.ZB_PUZZLES.get('LILLY');

  // ---- the tables, as ScummVM's text has them ----------------------------
  const enumBody = need(/enum PadAttrType : byte \{([\s\S]*?)\};/, h, 'PadAttrType')[1];
  const attr = Object.fromEntries([...enumBody.matchAll(/(kPadAttr\w+) = (\d+)/g)].map(m => [m[1], Number(m[2])]));
  const types = [...need(/kPatternAttrType\[13\]\{([\s\S]*?)\};/, h, 'kPatternAttrType')[1].matchAll(/ZmbLillyGridWalker::(kPadAttr\w+)/g)].map(m => attr[m[1]]);
  if (!same(types, S.ZB_LILLY_TATTOO_TYPE)) fail(`the tattoos' families are not ScummVM's: ${types}`);
  if (!same([null, attr.kPadAttrPattern, attr.kPadAttrShape, attr.kPadAttrColor].map(v => v === null ? null : S.ZB_LILLY_FAMILY[v]), [null, 'pattern', 'shape', 'colour'])) fail('the families are not numbered as ScummVM numbers them');
  const values = table('kPatternAttrValue', 13), extra = table('kPatternAttrExtra', 13);
  if (!same(values, S.ZB_LILLY_TATTOO_VALUE)) fail(`the tattoos' values are not ScummVM's: ${values}`);
  if (!same(extra, S.ZB_LILLY_TATTOO_EXTRA)) fail(`the tattoos' numbers are not ScummVM's: ${extra}`);
  if (extra.slice(0, 12).some((v, i) => v !== i)) fail('a tattoo\'s number is not its place in the table, which the port assumes');
  const needed = table('kZmbToRowCount', 21), cuttable = table('kRowColValidity', 13);
  if (!same(needed, S.ZB_LILLY_ROUTES_NEEDED)) fail(`the routes a band needs are not ScummVM's: ${needed}`);
  if (needed.some((v, n) => n && v !== Math.ceil(n / 2))) fail('kZmbToRowCount is not half the band rounded up, as the rules say');
  if (!same(cuttable, S.ZB_LILLY_CUTTABLE)) fail(`the rows and columns that may be cut are not ScummVM's: ${cuttable}`);
  // The pictures the names come from: a pad's shape drawn as shape + 1,
  // its mark as 5 + 3 x colour + pattern.
  if (!same(table('kCombinedAttrBase', 5), [5, 8, 11, 14, 17])) fail('the marks are not drawn as 5 + 3 x colour + pattern, as the names assume');
  need(/int16 padShapeIdx = _padShape\[row\]\[col\] \+ 1;/, cpp, 'the pad\'s shape as drawn');
  const col = table('kSwapPairCol', 20), row = table('kSwapPairRow', 20);
  const init = fn('initGridWithAttributes');
  const idx = [...init.matchAll(/_(first|second)SwapCellCol = kSwapPairCol\[(\d+)\];\s*_\1SwapCellRow = kSwapPairRow\[(\d+)\];/g)].map(m => Number(m[2]));
  const demo = [[[col[idx[0]], row[idx[0]]], [col[idx[1]], row[idx[1]]]], [[col[idx[2]], row[idx[2]]], [col[idx[3]], row[idx[3]]]]];
  if (idx.length !== 4 || !same(demo, S.ZB_LILLY_DEMO_SWAPS)) fail(`the demonstration swaps are not ScummVM's: ${JSON.stringify(demo)}`);

  // The maps: which REGS, and which route numbers each holds and wraps to.
  const regs = [...init.matchAll(/loadGridPatternRegs\((\d), (\d+)\);/g)].map(m => Number(m[2]));
  if (!same(regs, [15000, 15001, 15002])) fail(`ScummVM loads the maps from REGS ${regs}`);
  const first = nums(need(/kFirstPatternIndex\[3\] = \{([^}]*)\}/, cpp, 'kFirstPatternIndex')[1]);
  const last = nums(need(/kLastPatternIndex\[3\] = \{([^}]*)\}/, cpp, 'kLastPatternIndex')[1]);
  const wraps = [...init.matchAll(/if \((\d+) < adjustedIdx\)\s*adjustedIdx = (\d+);/g)].map(m => [Number(m[2]), Number(m[1])]);
  if (!same(first.map((f, i) => [f, last[i]]), S.ZB_LILLY_MAP_ROUTES) || !same(wraps, S.ZB_LILLY_MAP_ROUTES)) fail(`the maps' routes are not ScummVM's: ${first} to ${last}, wrapping ${JSON.stringify(wraps)}`);
  const pools = fn('generateChallengePatterns');
  const poolTop = [...pools.matchAll(/int16 pool([ABC])Size = (\d+);/g)].map(m => Number(m[2]));
  if (!same(poolTop, S.ZB_LILLY_MAP_ROUTES.map(([a, b]) => b - a))) fail(`the pools' sizes are not ScummVM's: ${poolTop}`);

  // The rules the deal and the chances lean on, as ScummVM writes them.
  const cut = need(/_challengeEnabledMarkers\[rawVal\] == 0 && _challengePlacementCounts\[rawVal\] < (\d+)\) \{\s*int16 rndCheck = _vm->_rnd->getRandomNumber\(0, (\d+)\);\s*if \((\d+) < rndCheck \|\| \(gridColIdx == 11 && _challengePlacementCounts\[rawVal\] == 0\)\)/, init, 'the cut');
  if (!same([cut[1], cut[2], cut[3]].map(Number), [S.ZB_LILLY_CUT.most, S.ZB_LILLY_CUT.draw, S.ZB_LILLY_CUT.above])) fail(`a cut is tried and made as ScummVM does not: ${cut.slice(1)}`);
  need(/slotsToEnable = 12 - kZmbToRowCount\[_pageLoadedZmbCount\];/, init, 'the routes spared at level 1');
  need(/maxObstacleEntries = 2;[\s\S]*maxObstacleEntries = 3;/, init, 'the crabs\' entries');
  need(/const int16 swapProgressNumerator = patternPlacedCount \+ 5;\s*_swapsPerWandStage = \(swapProgressNumerator \+ 5\) \/ 6;/, init, 'the wand\'s stages');
  need(/const int16 totalUses = static_cast<int16>\(6 \* _swapsPerWandStage\);/, cpp, 'debugGetChances');
  need(/rs\.completedCrossingCount \+= 1;[\s\S]{0,80}if \(rs\.completedCrossingCount == 2\)/, cpp, 'a toad\'s two crossings');
  for (const re of [/temp\[col\]\[11 - row\] = grid\[row\]\[col\];/, /temp\[11 - row\]\[11 - col\] = grid\[row\]\[col\];/, /temp\[11 - col\]\[row\] = grid\[row\]\[col\];/,
    /temp\[row\]\[11 - col\] = grid\[row\]\[col\];/, /temp\[11 - row\]\[col\] = grid\[row\]\[col\];/]) need(re, cpp, 'rotateGrid and flipGrid');
  // The port's turns and mirrors, as those five lines place a cell.
  const grid = [...Array(12)].map((_, r) => [...Array(12)].map((_, c) => r * 12 + c));
  const moved = [S.zbLillyTurn(grid, 0), S.zbLillyTurn(grid, 1), S.zbLillyTurn(grid, 2), S.zbLillyMirror(grid, 0), S.zbLillyMirror(grid, 1)];
  const where = [(r, c) => [c, 11 - r], (r, c) => [11 - r, 11 - c], (r, c) => [11 - c, r], (r, c) => [r, 11 - c], (r, c) => [11 - r, c]];
  moved.forEach((m, k) => {
    if (grid.flat().some(v => { const [r, c] = where[k](Math.floor(v / 12), v % 12); return m[r][c] !== v; })) fail(`turn or mirror ${k} does not move a pad as ScummVM's does`);
  });

  // The literal ranges the deal draws, in ScummVM's order.
  const lit = [...(init + fn('createToadRunners')).matchAll(/getRandomNumber\((\d+), (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!same(lit, [[3, 5], [4, 5], [0, 2], [0, 1], [0, 1], [0, 1], [0, 100], [0, 2], [0, 3], [0, 4], [3, 6]])) fail(`ScummVM's deal draws ${JSON.stringify(lit)}`);

  // ---- ZOOMBINI.EXE ----------------------------------------------------------
  const w = a => a.flatMap(v => [v & 255, v >> 8 & 255]);
  const latin = (o, n) => new TextDecoder('latin1').decode(exe.subarray(o, o + n));
  const one = (bytes, what) => { const o = find(exe, bytes); if (o.length !== 1) fail(`${what}: ${o.length} places in ZOOMBINI.EXE, not one`); return o[0] || 0; };
  const T = S.ZB_LILLY_TATTOO_TYPE, V = S.ZB_LILLY_TATTOO_VALUE;
  const exeTattoos = one(w([...T, ...V]), 'the twelve tattoos\' families and values');
  // The numbers run straight into the crabs' kObstacleBFSOffset, of which ZOOMBINI.EXE keeps four words.
  const exeNumbers = one(w([...S.ZB_LILLY_TATTOO_EXTRA, ...table('kObstacleBFSOffset', 5).slice(0, 4)]), 'the tattoos\' numbers');
  const exeNeeded = one(w([...S.ZB_LILLY_ROUTES_NEEDED, ...S.ZB_LILLY_CUTTABLE]), 'the routes needed and the rows that may be cut');
  const exeSwaps = one(w([...S.ZB_LILLY_DEMO_SWAPS.flat().map(p => p[0]), 0, ...S.ZB_LILLY_DEMO_SWAPS.flat().map(p => p[1]), 0]), 'the demonstration swaps');
  const deck = [...Array(12).keys(), 0, ...T.slice(0, 12), ...V.slice(0, 12)];
  const exeToads = find(exe, w(deck)).filter(o => latin(o + deck.length * 2, 24).includes('Lilly.MHK'));
  if (exeToads.length !== 1) fail('the toads\' deck and tattoos are not in ZOOMBINI.EXE before "Lilly.MHK"');

  // ---- LILLY's route maps ------------------------------------------------------
  if (!same(S.ZB_LILLY_ROUTE_REGS, regs)) fail(`the port reads the maps from REGS ${S.ZB_LILLY_ROUTE_REGS}, ScummVM ${regs}`);
  need(/const int16 patternIndex = stream->readSint16BE\(\);[\s\S]*?parsedGrid\[row\]\[col\] = patternIndex;/, cpp, 'loadGridPatternRegs');
  const arc = open('LILLY'), maps = S.zbLillyRouteMaps(arc);
  for (let i = 0; i < 3; i++) {
    const bytes = arc.get('REGS', regs[i]), dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const raw = [...Array(bytes.length / 2).keys()].map(k => dv.getInt16(2 * k));
    const mine = maps[i].flat();
    if (raw.length !== 144 || !same(raw, mine)) fail(`map ${i} is not LILLY REGS ${regs[i]} read row by row`);
    const [a, b] = [first[i], last[i]];
    if (mine.some(v => v && (v < a || v > b)) || [...Array(b - a + 1).keys()].some(k => !mine.includes(a + k))) fail(`map ${i} holds routes other than ${a}-${b}, or lacks one`);
  }
  // Without the maps the deal says what is missing.
  const bare = { has: () => false, get: () => { throw new Error('no resource'); } };
  try { P.deal(1, bands(1, 1)[0].band, S.zbRandom(1), {}, bare); fail('a LILLY without REGS 15000 deals anyway'); } catch (e) { if (!/REGS 15000/.test(e.message)) fail(`a LILLY without REGS 15000 fails with "${e.message}"`); }

  // ---- deals -------------------------------------------------------------------
  const FAM = S.ZB_LILLY_FAMILY, MAPS = S.ZB_LILLY_MAP_ROUTES;
  const mapOf = k => MAPS.findIndex(([a, b]) => k >= a && k <= b);
  const recording = seed => {
    const r = S.zbRandom(seed), log = [];
    return { log, rnd: { ...r, range: (a, b) => { log.push([a, b]); return r.range(a, b); } } };
  };
  let dealt = 0, spared = 0, mended = 0, firstBad = null;
  const bad = m => { if (!firstBad) firstBad = m; };
  for (let level = 1; level <= 4 && !firstBad; level++) {
    for (const { band, seed } of bands(250, 200 + level, [16, 12, 9, 5])) {
      const n = band.length, { log, rnd } = recording(seed);
      const d = P.deal(level, band, rnd, {}, arc);
      const s = d.state, pads = { pattern: s.padPattern, shape: s.padShape, colour: s.padColor };
      const fam = s.obstacleGridFamily, need8 = S.ZB_LILLY_ROUTES_NEEDED[n] < 8;

      // The draws, in order.
      let i = 0;
      const next = () => log[i++] || [];
      if (level === 3 && need8) { if (!same(next(), [3, 5])) bad(`level 3: the family is not drawn 3-5 first`); }
      if (level === 4 && need8) { if (!same(next(), [4, 5])) bad(`level 4: the family is not drawn 4-5 first`); }
      if (!same(next(), [0, 2])) bad(`level ${level}: the transform is not drawn 0-2`);
      if (s.transformType === 1) for (let k = 0; k < 3; k++) if (!same(next(), [0, 1])) bad(`level ${level}: a mirror is not drawn 0-1`);
      const toCut = level === 1 ? 12 - S.ZB_LILLY_ROUTES_NEEDED[n] : 12;
      for (let k = 0; k < toCut; k++) if (!same(next(), [1, 12 - k])) bad(`level ${level}: the routes to cut are not drawn from 1-12 down`);
      for (const top of [2, 1, 0, 3, 2, 1, 0, 4, 3, 2, 1, 0]) if (!same(next(), [0, top])) bad(`level ${level}: the pools are not drawn in turn`);
      const fills = [];
      for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
        for (let m = 0; m < 3; m++) if (!s.authoredPathGrids[m][r][c]) fills.push([0, [2, 3, 4][m]]);
      }
      const body = log.slice(i, log.length - 24);
      if (!same(body.filter(p => !same(p, [0, 100])), fills)) bad(`level ${level}: the pads' random values are not drawn as the maps leave them`);
      if (body.filter(p => same(p, [0, 100])).length < s.patternPlacedCount) bad(`level ${level}: fewer cuts tried than made`);
      const tail = log.slice(-24);
      if (tail.some((p, k) => !same(p, k % 2 ? [3, 6] : [0, 11 - k / 2]))) bad(`level ${level}: the toads do not draw a deck card and a 3-6 each`);

      // The routes' tattoos and the toads'.
      const rt = s.challengeTattooIndices;
      for (let k = 1; k <= 12; k++) if (FAM[S.ZB_LILLY_TATTOO_TYPE[rt[k]]] !== ['pattern', 'shape', 'colour'][mapOf(k)]) bad(`level ${level}: route ${k} has a tattoo of another family`);
      if (new Set(rt.slice(1)).size !== 12 || !same(s.toads.map(t => t.tattooIdx).sort((a, b) => a - b), [...Array(12).keys()])) bad(`level ${level}: the tattoos are not twelve different`);

      // The pads, from the maps, the tattoos and the cuts; and the cuts.
      const cutAt = new Map(s.challengePlacements.map(c => [`${c.row},${c.col},${mapOf(c.route)}`, c]));
      for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) for (let m = 0; m < 3; m++) {
        const raw = s.authoredPathGrids[m][r][c];
        if (!raw) continue;
        const cut = cutAt.get(`${r},${c},${m}`), route = cut ? cut.shows : raw, t = rt[route];
        if (pads[FAM[S.ZB_LILLY_TATTOO_TYPE[t]]][r][c] !== S.ZB_LILLY_TATTOO_VALUE[t]) bad(`level ${level}: pad (${r}, ${c}) is not its route's value`);
        if (cut && (!S.ZB_LILLY_CUTTABLE[r] || !S.ZB_LILLY_CUTTABLE[c] || s.challengeEnabledMarkers[raw] !== 0)) bad(`level ${level}: a cut where none may be`);
        const [a, b] = MAPS[m];
        if (cut && cut.shows !== (fam === m + 3 ? raw : raw + 1 > b ? a : raw + 1)) bad(`level ${level}: a cut does not show the next route`);
      }
      if (s.challengePlacementCounts.some(v => v > 2) || s.challengePlacementCounts.reduce((a, b) => a + b, 0) !== s.patternPlacedCount) bad(`level ${level}: more than two cuts on a route, or the count is wrong`);

      // Each route not turned, cuts undone, crosses from every row it
      // starts on; at level 1 the spared ones do so as dealt, and suffice.
      const whole = { pattern: s.padPattern.map(r => r.slice()), shape: s.padShape.map(r => r.slice()), colour: s.padColor.map(r => r.slice()) };
      for (const c of s.challengePlacements) {
        const t = rt[c.route];
        whole[FAM[S.ZB_LILLY_TATTOO_TYPE[t]]][c.row][c.col] = S.ZB_LILLY_TATTOO_VALUE[t];
      }
      for (let k = 1; k <= 12; k++) {
        const m = mapOf(k), t = rt[k], ty = S.ZB_LILLY_TATTOO_TYPE[t], v = S.ZB_LILLY_TATTOO_VALUE[t];
        if (fam === m + 3) continue;
        const rows = [...Array(12).keys()].filter(r => s.authoredPathGrids[m][r][0] === k);
        if (!rows.length || rows.some(r => !S.zbLillyCrosses(whole, ty, v, r))) bad(`level ${level}: route ${k}, mended, does not cross from its rows ${rows}`);
        if (level === 1 && s.challengeEnabledMarkers[k] !== 0) {
          spared++;
          if (s.challengePlacementCounts[k] || rows.some(r => !S.zbLillyCrosses(pads, ty, v, r))) bad(`level 1: route ${k} was spared but does not cross as dealt`);
        }
        if (level > 1) mended++;
      }
      if (level === 1 && s.challengeEnabledMarkers.slice(1).filter(v => v !== 0).length !== S.ZB_LILLY_ROUTES_NEEDED[n]) bad(`level 1: not half the band's routes spared`);
      if (level === 1 && d.marks.some(m => !m)) bad(`level 1: a Zoombini of ${n} has no toad to ride`);

      // The turned family, the crabs and the wand.
      if (level < 3 && fam) bad(`level ${level}: a map is turned`);
      if (level === 3 && !(need8 ? [3, 4, 5] : [4]).includes(fam)) bad(`level 3: family ${fam} turned for a band of ${n}`);
      if (level === 4 && !(need8 ? [4, 5] : [4]).includes(fam)) bad(`level 4: family ${fam} turned for a band of ${n}`);
      if (level >= 3) {
        if (s.crabEntries.length > level - 1 || s.crabEntries.some(e => e.type !== fam - 2 || pads[FAM[e.type]][0][e.col] !== e.value || !s.authoredPathGrids[fam - 3][0][e.col])) bad(`level ${level}: a crab starts off its routes' top row`);
      }
      if (level > 1 && s.swapWandUses !== 6 * Math.ceil((s.patternPlacedCount + 5) / 6)) bad(`level ${level}: the wand has ${s.swapWandUses} swaps for ${s.patternPlacedCount} cuts`);

      // The marks: a toad and a row that it crosses from, two a toad at most.
      const used = new Map();
      for (const m of d.marks) {
        if (!m) continue;
        const [, slot, r, mend] = /^toad (\d+) \(.*\), from row (\d+)( once mended)?$/.exec(m) || [];
        const t = s.toads[slot - 1];
        used.set(slot, (used.get(slot) || 0) + 1);
        if (!t || used.get(slot) > 2 || (mend ? !t.routeRows.includes(r - 1) : !S.zbLillyCrosses(pads, t.attrType, t.attrValue, r - 1))) { bad(`level ${level}: the mark "${m}" is wrong`); break; }
      }
      dealt++;
    }
  }
  if (firstBad) fail(firstBad);

  // ---- the workbench ---------------------------------------------------------
  // The form gives back what it is given, and dealing again with the
  // choices as dealt deals the same pond; a changed choice is kept; bad
  // choices are refused. Each solution, replayed from its own words on the
  // pads, is legal: no more swaps than the wand's, each toad two riders at
  // most, from a row pads of its tattoo join to the far bank (found again
  // here); level 1's most is two a toad with a way across, found by
  // trying every row of every toad here.
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  const reachRows = (pads, type, value) => [...Array(12).keys()].filter(r => S.zbLillyCrosses(pads, type, value, r));
  let trips = 0, solved = 0, whole = 0, slow = 0, worstMs = 0, wb = null;
  const wbad = m => { if (!wb) wb = m; };
  const summary = [];
  for (let level = 1; level <= 4 && !wb; level++) {
    for (const { band, seed } of bands(10, 400 + level, [16, 11, 5, 2])) {
      const n = band.length, d = P.deal(level, band, S.zbRandom(seed), {}, arc), st = d.state;
      const form = P.form(level, band, st, arc), v = valuesOf(form);
      const again = P.edit(level, band, st, v, arc);
      if (!same(valuesOf(P.form(level, band, again, arc)), v)) { wbad(`level ${level}: the form does not give back its values`); break; }
      if (!same([again.padPattern, again.padShape, again.padColor, again.toads.map(t => t.tattooIdx)], [st.padPattern, st.padShape, st.padColor, st.toads.map(t => t.tattooIdx)])) { wbad(`level ${level}: dealing again with the choices as dealt deals another pond`); break; }
      // A changed choice: two patterns' tattoos swapped, the maps left as laid.
      const v2 = Object.assign({}, v, { transform: 'none', tattoos: [v.tattoos[1], v.tattoos[0], ...v.tattoos.slice(2)] });
      if (level === 1) v2.spared = [...Array(12).keys()].map(k => k + 1).slice(0, S.ZB_LILLY_ROUTES_NEEDED[n]);
      const e2 = P.edit(level, band, st, v2, arc);
      if (!same(valuesOf(P.form(level, band, e2, arc)), v2) || e2.transformType !== 2) { wbad(`level ${level}: a changed choice is not kept`); break; }
      const refused = vals => { try { P.edit(level, band, st, Object.assign({}, v, vals), arc); return false; } catch (e) { return /\w/.test(e.message); } };
      if (!refused({ tattoos: [v.tattoos[3], ...v.tattoos.slice(1, 3), v.tattoos[0], ...v.tattoos.slice(4)] })) { wbad(`level ${level}: a shape's tattoo on a pattern's route is taken`); break; }
      if (!refused({ transform: 'sideways' })) { wbad(`level ${level}: a transform the program has not is taken`); break; }
      if (level === 1 && !refused({ spared: [1] }) && S.ZB_LILLY_ROUTES_NEEDED[n] !== 1) { wbad('level 1: the wrong number of routes left whole is taken'); break; }
      if (level >= 3 && n > 14 && !refused({ family: 3 })) { wbad(`level ${level}: a turned family the program would not choose for ${n} is taken`); break; }
      trips++;

      const t0 = Date.now(), sol = P.solve(level, band, st, arc, { budget: 600 }), ms = Date.now() - t0;
      worstMs = Math.max(worstMs, ms);
      if (ms > 1200) slow++;
      if (!sol.solutions.length || sol.solutions.length > 12) { wbad(`level ${level}: ${sol.solutions.length} solutions`); break; }
      for (const so of sol.solutions) {
        const pads = { pattern: st.padPattern.map(r => r.slice()), shape: st.padShape.map(r => r.slice()), colour: st.padColor.map(r => r.slice()) };
        let swaps = 0;
        const riders = new Map(), crossed = [];
        for (const line of so.steps) {
          let m = /^Swap \d+: the pad in row (\d+), column (\d+) with the pad in row (\d+), column (\d+)\.$/.exec(line);
          if (m) {
            const [a, b, c, e] = m.slice(1).map(x => x - 1);
            for (const f of FAM.slice(1)) [pads[f][a][b], pads[f][c][e]] = [pads[f][c][e], pads[f][a][b]];
            swaps++;
            continue;
          }
          m = /^Toad (\d+), with .* tattoo, from row (\d+): Zoombinis? ([\d, and]+)\.$/.exec(line);
          if (m) {
            const t = st.toads[m[1] - 1], who = m[3].split(/, | and /).map(x => x - 1);
            if (!t || !S.zbLillyCrosses(pads, t.attrType, t.attrValue, m[2] - 1)) wbad(`level ${level}: "${line}", and it has no way from that row`);
            riders.set(m[1], (riders.get(m[1]) || 0) + who.length);
            crossed.push(...who);
          }
        }
        if (swaps > (st.swapWandUses || 0)) wbad(`level ${level}: ${swaps} swaps, the wand allows ${st.swapWandUses}`);
        if ([...riders.values()].some(k => k > 2)) wbad(`level ${level}: a toad carries more than two`);
        if (!same(crossed.slice().sort((a, b) => a - b), so.crosses.slice().sort((a, b) => a - b)) || new Set(crossed).size !== crossed.length) wbad(`level ${level}: "${so.title}" says ${so.crosses.length} cross, its steps ${crossed.length}`);
        if (so.crosses.length > sol.most) wbad(`level ${level}: a solution takes more than the most`);
        const drawn = so.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
        if (!same(drawn, band.map((_, i) => i))) wbad(`level ${level}: "${so.title}" does not draw each Zoombini once`);
      }
      if (sol.solutions[0].crosses.length !== sol.most) wbad(`level ${level}: the simplest does not take the most`);
      if (level === 1) {
        const T = st.toads.filter(t => reachRows({ pattern: st.padPattern, shape: st.padShape, colour: st.padColor }, t.attrType, t.attrValue).length).length;
        if (!sol.exact || sol.most !== Math.min(n, 2 * T)) wbad(`level 1: most ${sol.most}, and ${T} toads have a way across`);
      }
      if (sol.exact && sol.most !== n && level > 1) wbad(`level ${level}: exact is claimed for ${sol.most} of ${n}`);
      if (sol.most === n) whole++;
      if (n === 16) summary.push(`${level}:${sol.most}/${sol.solutions[0].steps.filter(x => x.startsWith('Swap')).length}`);
      solved++;
    }
  }
  if (P.strategy) fail('Titanic Tattooed Toads hides nothing from the player, and has a strategy');
  if (slow) fail(`${slow} solves took more than 1.2 s on a budget of 0.6 s`);
  if (wb) fail(wb);
  say(`${trips} forms given back and dealt again as dealt; ${solved} solves replayed from their words (${whole} whole, the slowest ${worstMs} ms; bands of 16 as level:most/swaps ${summary.join(' ')})`);
  say(`tables as ScummVM's and in ZOOMBINI.EXE (tattoos 0x${exeTattoos.toString(16)}, numbers 0x${exeNumbers.toString(16)}, routes needed 0x${exeNeeded.toString(16)}, swaps 0x${exeSwaps.toString(16)}, the toads' copy 0x${(exeToads[0] || 0).toString(16)}); maps as REGS 15000-15002; ${dealt} deals drawn in the program's order, every route whole once mended (${mended}), and at level 1 the ${spared} spared routes carry every band`);

  // ---- a route map edited (the page's layout editor) ----------------------
  // Every route on the disc runs from the first column to the last, a pad
  // repainted and painted back gives the words back, and a route broken in
  // its last column is no longer across.
  {
    const arc = open('LILLY');
    for (let g = 0; g < 3; g++) {
      const words = Array.from(S.parseRegs(arc.get('REGS', S.ZB_LILLY_ROUTE_REGS[g])));
      const runs = S.zbLillyRouteRuns(words, g);
      if (runs.some(r => !r.across || !r.pads)) fail(`REGS ${S.ZB_LILLY_ROUTE_REGS[g]}: a route that does not run across: ${JSON.stringify(runs)}`);
      const k = words.findIndex(v => v), back = S.zbLillyEditMap(S.zbLillyEditMap(words, g, Math.floor(k / 12), k % 12, 0), g, Math.floor(k / 12), k % 12, words[k]);
      if (JSON.stringify(back) !== JSON.stringify(words)) fail(`REGS ${S.ZB_LILLY_ROUTE_REGS[g]}: a pad repainted and painted back changes the map`);
      const route = runs[0].route, cut = words.map((v, i) => (i % 12 === 11 && v === route ? 0 : v));
      if (S.zbLillyRouteRuns(cut, g)[0].across) fail(`REGS ${S.ZB_LILLY_ROUTE_REGS[g]}: route ${route} without its last column is still across`);
      let refused = false;
      try { S.zbLillyEditMap(words, g, 0, 0, g === 0 ? 4 : 1); } catch (e) { refused = true; }
      if (!refused) fail(`map ${g + 1} takes another family's route`);
    }
    say('route maps edited: every route on the disc across, a pad painted back as it was, a route cut in its last column not across, another family\'s route refused');
  }
}
