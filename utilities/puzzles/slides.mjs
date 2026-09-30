// Stone Rise (js/zb-puzzle-slides.js) against ScummVM's puzzle_slides.cpp
// and .h and the 1996 program:
//
//   - the tables: level 1's rows, level 3's rings, level 4's stones,
//     joining stones, searches and pruning, the stones the judge visits,
//     and every cell's place on the screen, are ScummVM's, read from its
//     text; the cell states and trait codes are its enums;
//   - the program keeps them as tables of 16-bit words, and they are in
//     ZOOMBINI.EXE: level 1's rows, level 3's rings, and level 4's two
//     search lists in one run, as in the Win32 program; level 4's stones
//     and joining stones each on their own; the judge's list just before
//     "Slides.MHK";
//   - ScummVM's text still has what the port copies from it (the pairing's
//     count of singles set once for all ten tries, the level 4 chain's
//     marks looked up twice in the sorted list, the three orders of the
//     rings, the 0-1000 draw and its quarters) and what the port follows
//     the program in instead (the first search's stop one short);
//   - the chances are debugGetChances' none counted;
//   - over bands of 16 down to 1 at each level, the dealt placement puts
//     every Zoombini on its own stone, one stone each, every marked stone
//     joins two Zoombinis who share its trait, the program's judge raises
//     them all, and swapping a Zoombini for one that differs across a marked
//     stone stops at least one from rising; each level has its form.
const KIND = { kTraitHair: 'hair', kTraitEyes: 'eyes', kTraitNose: 'nose', kTraitFeet: 'feet' };

export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_slides.h'), cpp = scumm('zoombini_pages/puzzle_slides.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const nums = body => [...body.matchAll(/-?\d+/g)].map(m => Number(m[0]));
  const table = (name, text = h) => nums(need(new RegExp(`${name}\\[\\d+\\](?: = |)\\{([\\s\\S]*?)\\};`), text, name)[1]);
  const P = S.ZB_PUZZLES.get('SLIDES');

  // ---- the tables, as ScummVM has them --------------------------------------
  const tables = [
    ['kPairStartOffsets', S.ZB_SLIDES_PAIR_START], ['kPairSpacingArray', S.ZB_SLIDES_PAIR_STEP],
    ['kLeftArmLinkCells', S.ZB_SLIDES_L3_PATHS], ['kRightArmLinkCells', S.ZB_SLIDES_L3_STONES],
    ['kLeftEndpointCells', S.ZB_SLIDES_L3_LEFT], ['kRightEndpointCells', S.ZB_SLIDES_L3_RIGHT],
    ['kInnerLinkPairs', S.ZB_SLIDES_L3_ROWS], ['kSlotCellIndices', S.ZB_SLIDES_L4_STONES],
    ['kLinkCellIndices', S.ZB_SLIDES_L4_PATHS], ['kEvenRowLinkCells', S.ZB_SLIDES_L4_RISING],
    ['kOddRowLinkCells', S.ZB_SLIDES_L4_FALLING],
  ];
  for (const [name, mine] of tables) if (!same(table(name), mine)) fail(`${name} is not ScummVM's: ${table(name)}`);
  for (const [name, mine] of [['kCascadeCells', S.ZB_SLIDES_L4_CASCADE], ['kReassignCells', S.ZB_SLIDES_L4_SPARE], ['kChainCells', S.ZB_SLIDES_L4_JUDGED]]) {
    if (!same(table(name, cpp), mine)) fail(`${name} is not ScummVM's: ${table(name, cpp)}`);
  }
  const cells = [...need(/kCellPositions\[117\]\{([\s\S]*?)\};/, h, 'kCellPositions')[1].matchAll(/Point\((\d+), (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (cells.length !== 117 || cells.some(([x, y], c) => S.zbSlidesCellXY(c).x !== x || S.zbSlidesCellXY(c).y !== y)) fail('zbSlidesCellXY is not kCellPositions');
  const middles = [...need(/case kPuzzleLevel3:[\s\S]*?(maybeSetMatchTrait[\s\S]*?)int16 occupiedCount/, cpp, 'level 3\'s middles')[1].matchAll(/maybeSetMatchTrait\((\d+), (\d+), (\d+)\)/g)].map(m => m.slice(1).map(Number));
  if (!same(middles, S.ZB_SLIDES_L3_MIDDLES)) fail(`level 3's middle stones are not ScummVM's: ${JSON.stringify(middles)}`);
  const prune = [...cpp.matchAll(/pickNextCellForLink\((\d+), (\d+), (\d+)\);/g)].map(m => m.slice(1).map(Number));
  if (!same(prune, S.ZB_SLIDES_L4_PRUNE)) fail(`level 4's pruning is not ScummVM's: ${JSON.stringify(prune)}`);
  const chain = [...need(/else if \(_pageLoadedZmbCount <= 5\) \{([\s\S]*?)buildHexAdjacencyTable/, cpp, 'level 4\'s short chain')[1].matchAll(/setCellStateData\((\d+), kCell(Path|Occupied)/g)];
  const chainStones = chain.filter(m => m[2] === 'Occupied').map(m => Number(m[1])), chainJoins = chain.filter(m => m[2] === 'Path').map(m => Number(m[1]));
  if (!same(chainStones, S.ZB_SLIDES_L4_CHAIN) || !same(chainJoins, S.ZB_SLIDES_L4_CHAIN_JOINS)) fail(`level 4's short chain is not ScummVM's: ${chainStones} / ${chainJoins}`);
  const bit = { kAdjNorthWest: 1, kAdjWest: 2, kAdjSouthWest: 4, kAdjSouthEast: 8, kAdjEast: 16, kAdjNorthEast: 32 };
  const short = { kAdjNorthWest: 'NW', kAdjWest: 'W', kAdjSouthWest: 'SW', kAdjSouthEast: 'SE', kAdjEast: 'E', kAdjNorthEast: 'NE' };
  for (const [name, v] of Object.entries(bit)) {
    if (parseInt(need(new RegExp(`${name} = 0x(\\w+)`), h, name)[1], 16) !== v || S['ZB_SLIDES_' + short[name]] !== v) fail(`${name} is not ${v}`);
  }
  const l4 = need(/case kPuzzleLevel4: \{([\s\S]*?)for \(int16 i = 0; i < ARRAYSIZE\(kSlotCellIndices\)/, cpp, 'level 4\'s ways')[1];
  const masks = [...l4.matchAll(/_cellAdjacencyMasks\[(\d+)\] = ([^;]+);/g)].map(m => [Number(m[1]), m[2].split('|').reduce((a, t) => a | bit[t.trim()], 0)]);
  if (!same(masks, S.ZB_SLIDES_L4_MASKS)) fail(`level 4's ways are not ScummVM's: ${JSON.stringify(masks)}`);
  for (const [name, mine] of [['kCellInert', S.ZB_SLIDES_INERT], ['kCellPath', S.ZB_SLIDES_PATH], ['kCellMatched', S.ZB_SLIDES_MATCHED],
    ['kCellSlotBase1', S.ZB_SLIDES_BASE], ['kCellConnector', S.ZB_SLIDES_SLOT], ['kCellOccupied', S.ZB_SLIDES_TAKEN],
    ['kCellLocked', S.ZB_SLIDES_LOCKED], ['kTraitHair', S.ZB_SLIDES_HAIR]]) {
    const v = Number(need(new RegExp(`${name} = (\\d+)`), h, name)[1]);
    if (v !== mine) fail(`${name} is ${v} in ScummVM, ${mine} here`);
  }
  const kinds = [...need(/enum TraitKind : int16 \{([\s\S]*?)\};/, h, 'TraitKind')[1].matchAll(/(kTrait\w+) = (\d+)/g)];
  if (!same(kinds.map(m => KIND[m[1]]), S.ZB_TRAIT_KINDS) || kinds.some((m, i) => Number(m[2]) !== S.ZB_SLIDES_HAIR + i)) fail('the trait codes are not hair, eyes, nose, feet from 510');

  // ---- what the port copies, and where it follows the program instead -----
  need(/int16 traitCursor = _vm->_rnd->getRandomNumber\(0, 3\);\s*int16 unpairedCount = 0;\s*for \(int16 attempt = 0; attempt < 10; attempt\+\+\) \{\s*memset/, cpp, 'the pairing\'s count of singles, set once for all ten tries');
  need(/if \(unpairedCount == 0 \|\| \(unpairedCount == 1 && \(_pageLoadedZmbCount % 2\) == 1\)\)\s*break;/, cpp, 'the pairing\'s stop');
  need(/_pairGroupCount = _pageLoadedZmbCount \/ 3;\s*if \(\(_pageLoadedZmbCount % 3\) != 0\)\s*_pairGroupCount \+= 1;/, cpp, 'level 2\'s count of chains');
  if ([...cpp.matchAll(/checkFirstTraitMatch\(_sortedSnoidIndices\[(\d)\], _sortedSnoidIndices\[(\d)\]\)/g)].map(m => m[1] + m[2]).join() !== '10,21,32,43') fail('level 4\'s short chain no longer looks its marks up twice in the sorted list');
  need(/if \(50 <= _vm->_rnd->getRandomNumber\(0, 100\)\) \{\s*if \(50 <= _vm->_rnd->getRandomNumber\(0, 100\)\) \{\s*int16 result = placeNextZmbInCell\(91\);\s*result = placeNextZmbInCell\(19\);\s*placeNextZmbInCell\(55\);[\s\S]*?placeNextZmbInCell\(55\);\s*result = placeNextZmbInCell\(91\);\s*placeNextZmbInCell\(19\);[\s\S]*?placeNextZmbInCell\(19\);\s*result = placeNextZmbInCell\(55\);\s*placeNextZmbInCell\(91\);/, cpp, 'the rings\' three orders');
  need(/getRandomNumber\(0, 1000\);\s*if \(roll < 250\)[\s\S]*?roll < 500[\s\S]*?roll < 750/, cpp, 'the 0-1000 draw\'s quarters');
  need(/if \(_difficultyLevel == kPuzzleLevel4\) \{\s*int16 randVal = _vm->_rnd->getRandomNumber\(0, 1\);/, cpp, 'level 4\'s look, drawn first');
  // The program's first search at level 4 has no such stop; the port follows the program.
  need(/if \(_pageLoadedZmbCount <= snoidIdx \+ 1\)\s*break;\s*if \(!checkFirstTraitMatch\(snoidIdx \+ 1, snoidIdx\)\)/, cpp, 'the first search\'s stop one short');
  // The program's own words at level 4, which ScummVM does not have.
  const zone = 'You have entered the psychedelic ZB Zone!';
  if (!find(exe, [...zone].map(ch => ch.charCodeAt(0))).length || /psychedelic/.test(cpp + h) || !P.levels[3].notes.some(t => t.includes(zone))) fail('the ZB Zone is not the program\'s alone, or the note does not quote it');
  if (!/debugGetChances\(\) const \{[\s\S]*?ZmbChanceType::kInfinite/.test(cpp) || !/As many tries as it takes/.test(P.levels[0].chances)) fail('ScummVM counts chances at Stone Rise, or the port does');

  // ---- the program's tables, in ZOOMBINI.EXE ----------------------------------
  const words = list => list.flatMap(v => [v & 255, v >> 8 & 255]);
  // Level 1's rows (the program's fourteen starts, then the steps), level 3's
  // rings, and level 4's searches (the first with the 55 it skips).
  const run = [...S.ZB_SLIDES_PAIR_START.slice(0, 14), ...S.ZB_SLIDES_PAIR_STEP.slice(0, 14), ...S.ZB_SLIDES_L3_PATHS, ...S.ZB_SLIDES_L3_STONES,
    ...S.ZB_SLIDES_L3_LEFT, ...S.ZB_SLIDES_L3_RIGHT, ...S.ZB_SLIDES_L3_ROWS, 55, ...S.ZB_SLIDES_L4_CASCADE, ...S.ZB_SLIDES_L4_SPARE];
  const at = find(exe, words(run));
  if (at.length !== 1) fail(`level 1's rows, level 3's rings and level 4's searches are in ZOOMBINI.EXE ${at.length} times, not once`);
  // ScummVM's last two starts and steps are the program reading on into the next table.
  if (!same(S.ZB_SLIDES_PAIR_START.slice(14), S.ZB_SLIDES_PAIR_STEP.slice(0, 2)) || !same(S.ZB_SLIDES_PAIR_STEP.slice(14), S.ZB_SLIDES_L3_PATHS.slice(0, 2)))
    fail('the last two row starts and steps are not the next table\'s first two');
  const alone = [['stones', S.ZB_SLIDES_L4_STONES], ['joining stones', S.ZB_SLIDES_L4_PATHS], ['rising', S.ZB_SLIDES_L4_RISING], ['falling', S.ZB_SLIDES_L4_FALLING]];
  const found = alone.map(([what, list]) => { const o = find(exe, words(list)); if (o.length !== 1) fail(`level 4's ${what} are in ZOOMBINI.EXE ${o.length} times, not once`); return o[0]; });
  const judged = find(exe, words(S.ZB_SLIDES_L4_JUDGED)).filter(o => new TextDecoder('latin1').decode(exe.subarray(o, o + 2 * 31 + 20)).includes('Slides.MHK'));
  if (judged.length !== 1) fail('the judge\'s level 4 stones are not in ZOOMBINI.EXE before "Slides.MHK"');

  // ---- deals -----------------------------------------------------------------
  const sizes = [16, 13, 11, 9, 7, 6, 5, 4, 3, 2, 1];
  const counts = { deals: 0, quirks: 0, looks: new Set(), caught: 0 };
  for (let level = 1; level <= 4; level++) {
    let bad = 0;
    for (const { band, seed } of bands(330, 700 + level, sizes)) {
      const n = band.length;
      const d = P.deal(level, band, S.zbRandom(seed), {});
      const { f, solution, groups } = S.zbSlidesBuild(level, band, S.zbRandom(seed));
      counts.deals++;
      if (level === 4) counts.looks.add(f.base);
      if (f.quirk) { counts.quirks++; continue; }
      const why = [];
      const onStones = [...solution.values()];
      if (f.slots.length !== n) why.push(`${f.slots.length} stones for ${n}`);
      if (solution.size !== n || new Set(onStones).size !== n || onStones.some(i => i < 0 || i >= n)) why.push('the placement is not one stone each');
      if ([...solution.keys()].some(c => !f.slots.includes(c) || f.state[c] !== S.ZB_SLIDES_SLOT)) why.push('a Zoombini is off the stones');
      for (const m of d.state.marked) {
        if (m.ends.length !== 2 || !m.ends.every(c => solution.has(c))) { why.push(`the marked stone ${m.cell} does not join two stones`); continue; }
        const [a, b] = m.ends.map(c => band[solution.get(c)]);
        if (a[m.kind] !== b[m.kind]) why.push(`the marked stone ${m.cell} joins two with different ${m.kind}`);
      }
      const { risen, satisfied } = S.zbSlidesJudge(f, solution);
      if (risen.size !== n) why.push(`the judge raises ${risen.size} of ${n}`);
      if (d.state.marked.some(m => !satisfied.has(m.cell))) why.push('the judge leaves a marked stone unsatisfied');
      // A wrong placement: swap one end of a marked stone with a Zoombini
      // that differs from the other end. The stone is then not satisfied,
      // and in a row (levels 1 and 2) someone does not rise; in a ring or
      // the network there may be another way round.
      for (const m of d.state.marked) {
        const [a, b] = m.ends, other = band[solution.get(b)][m.kind];
        const c = [...solution.keys()].find(c => c !== a && c !== b && band[solution.get(c)][m.kind] !== other);
        if (c === undefined) continue;
        const wrong = new Map(solution);
        wrong.set(a, solution.get(c));
        wrong.set(c, solution.get(a));
        const j = S.zbSlidesJudge(f, wrong);
        if (j.satisfied.has(m.cell) || (level <= 2 && j.risen.size === n)) why.push(`a swap across the marked stone ${m.cell} is not caught`);
        else counts.caught++;
        break;
      }
      const marks = d.marks.map(x => Number(/^stone (\d+)$/.exec(x)?.[1]));
      if (marks.some(x => !(x >= 1 && x <= n)) || new Set(marks).size !== n) why.push(`the marks are not one stone each: ${d.marks}`);
      // Each level's form.
      if (level === 1) {
        const pairs = groups.filter(g => g.members.length === 2);
        if (groups.some(g => g.members.length === 2 ? band[g.members[0]][S.ZB_TRAIT_KINDS[g.trait]] !== band[g.members[1]][S.ZB_TRAIT_KINDS[g.trait]] : g.trait !== -1)) why.push('a pair does not share its trait');
        if (d.state.marked.length !== pairs.length || 2 * pairs.length + (groups.length - pairs.length) !== n) why.push('the pairs and single stones do not add up');
        if (d.state.pairLinkTypes.some((t, i) => t !== (groups[i].trait < 0 ? S.ZB_SLIDES_PATH : S.ZB_SLIDES_HAIR + groups[i].trait))) why.push('pairLinkTypes');
      } else if (level === 2) {
        if (groups.count !== Math.ceil(n / 3) || groups.order.length !== n || d.state.marked.length + d.answer.filter(s => /plain/.test(s)).length !== n - groups.count) why.push('the chains are not of three');
      } else if (level === 3) {
        const firsts = [19, 55, 91].filter(c => f.slots.includes(c));
        if (f.slots.some(c => !S.ZB_SLIDES_L3_STONES.includes(c)) || firsts.length < Math.min(3, Math.ceil(n / 6))) why.push('the rings are not the pattern\'s');
      } else if (n <= 5) {
        if (!same(f.slots.slice().sort((a, b) => a - b), S.ZB_SLIDES_L4_CHAIN.slice(0, n).sort((a, b) => a - b))) why.push(`the short chain is on ${f.slots}`);
      } else if (f.slots.some(c => !S.ZB_SLIDES_L4_STONES.includes(c)) || !f.slots.includes(55)) why.push('the network is not the pattern\'s');
      if (why.length) { if (bad++ < 3) fail(`level ${level}, ${n} Zoombinis, seed ${seed}: ${why.join('; ')}`); }
    }
  }
  if (counts.looks.size !== 2) fail(`level 4 dealt ${counts.looks.size} looks, not both`);

  // ---- the workbench ---------------------------------------------------------
  const valuesOf = form => Object.fromEntries(form.filter(x => x.kind !== 'note').map(x => [x.key, x.value]));
  const bench = { trips: 0, solved: 0, brute: 0, short: 0, edited: 0, slow: 0, zone: 0 };
  /* Every placement of the band on the stones (each stone a Zoombini or
     empty), the most the judge raises, and in how many ways (placements
     with everyone on a risen stone, two alike counted once). */
  const brute = (level, band, state) => {
    const f = S.zbSlidesFieldOf(level, band, state), stones = f.slots, key = new Map();
    let most = 0;
    const place = new Array(stones.length).fill(-1);
    const go = (k, used) => {
      if (k === stones.length) {
        const pl = new Map(stones.map((c, i) => [c, place[i]]).filter(([, z]) => z >= 0));
        const r = S.zbSlidesJudge(f, pl).risen.size;
        if (r > most) { most = r; key.clear(); }
        if (r === most && r === pl.size) key.set(place.map(z => z < 0 ? '-' : S.zbZoombiniId(band[z])).join(','), 1);
        return;
      }
      go(k + 1, used);
      for (let z = 0; z < band.length; z++) if (!(used >> z & 1)) { place[k] = z; go(k + 1, used | 1 << z); place[k] = -1; }
    };
    go(0, 0);
    return { most, ways: key.size };
  };
  const workbench = (level, band, state, small) => {
    const why = [];
    const form = P.form(level, band, state), v = valuesOf(form), again = P.edit(level, band, state, v);
    if (!same(valuesOf(P.form(level, band, again)), v) || !same(again.cellData, state.cellData)) why.push('the form does not give back what it shows');
    bench.trips++;
    const t0 = Date.now(), sol = P.solve(level, band, state, null, { budget: 1500 });
    if (Date.now() - t0 > 2000) { bench.slow++; why.push(`solve took ${Date.now() - t0} ms`); }
    const f = S.zbSlidesFieldOf(level, band, state);
    for (const x of sol.solutions) {
      const zs = x.diagram.items.filter(it => it.t === 'zoombini');
      if (!same(zs.map(it => it.i).sort((a, b) => a - b), band.map((_, i) => i))) { why.push('a diagram does not draw each Zoombini once'); break; }
      // The Zoombinis drawn on stones, as the judge takes them.
      const at = new Map();
      const g = S.zbSlidesGraph(f), number = S.zbSlidesNumbers(f.slots);
      for (const m of x.steps[0].matchAll(/Zoombini (\d+) on stone (\d+)/g)) at.set(g.stones.find(c => number.get(c) === +m[2]), +m[1] - 1);
      const risen = S.zbSlidesJudge(f, at).risen;
      const crossing = [...at].filter(([c]) => risen.has(c)).map(([, z]) => z).sort((a, b) => a - b);
      if (!same(crossing, x.crosses) || x.crosses.length !== sol.most) { why.push(`a solution's ${x.crosses.length} crossing are not what the judge raises (${crossing.length})`); break; }
      if (zs.some(it => !it.faded !== x.crosses.includes(it.i))) { why.push('a diagram fades the wrong Zoombinis'); break; }
      if (S.zbSlidesZone(level, g, g.stones.map(c => at.has(c) ? at.get(c) : -1), g.stones.map(c => risen.has(c))) !== x.steps.some(t => /ZB Zone/.test(t))) { why.push('the ZB Zone is not said where it is entered'); break; }
      if (x.steps.some(t => /ZB Zone/.test(t))) bench.zone++;
    }
    for (let k = 1; k < sol.solutions.length; k++) if (sol.solutions[k].inv < sol.solutions[k - 1].inv) { why.push('the solutions are not simplest first'); break; }
    if (!sol.solutions.length && sol.most) why.push('no solution given');
    if (sol.most < band.length) bench.short++;
    if (small) {
      const b = brute(level, band, state);
      bench.brute++;
      if (b.most !== sol.most || (sol.exact && sol.ways != null && b.ways !== sol.ways)) why.push(`the most is ${b.most} in ${b.ways} ways by trying all, the solver says ${sol.most} in ${sol.ways}`);
    }
    bench.solved++;
    return why;
  };
  for (let level = 1; level <= 4; level++) {
    let bad = 0;
    for (const { band, seed } of bands(10, 1300 + level, [5, 4, 6, 3, 5, 16])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      if (d.state.quirk) continue;
      const small = band.length <= 6;
      let why = workbench(level, band, d.state, small);
      // The joining stones changed at random, which can leave fewer able to cross.
      if (small) {
        const form = P.form(level, band, d.state), rnd = S.zbRandom(seed ^ 0x5a5a);
        const v = valuesOf(form);
        for (const x of form) if (x.kind === 'choice') v[x.key] = x.options[rnd.number(x.options.length - 1)].value;
        const edited = P.edit(level, band, d.state, v);
        if (!same(valuesOf(P.form(level, band, edited)), v)) why.push('an edited form is not given back');
        bench.edited++;
        why = why.concat(workbench(level, band, edited, true));
      }
      if (why.length && bad++ < 3) fail(`workbench, level ${level}, ${band.length} Zoombinis, seed ${seed}: ${why.join('; ')}`);
    }
  }
  {
    const band = bands(1, 77, [6])[0].band, d = P.deal(1, band, S.zbRandom(5), {});
    const key = P.form(1, band, d.state)[0].key;
    let caught = 0;
    for (const v of [{ [key]: 'plain' }, { [key]: 'ears' }, { j999: 'hair' }]) { try { P.edit(1, band, d.state, v); } catch (e) { caught++; } }
    if (caught !== 3) fail('the form takes a plain stone at level 1, a trait that is none, or a stone that is not there');
  }
  say(`tables as ScummVM's, and in ZOOMBINI.EXE (0x${(at[0] || 0).toString(16)}; 0x${(found[0] || 0).toString(16)} to 0x${(found[3] || 0).toString(16)}; 0x${(judged[0] || 0).toString(16)}, before "Slides.MHK"); `
    + `${counts.deals} deals over bands of 16 to 1: every placement one stone each, every marked stone satisfied, all risen by the program's judge, `
    + `${counts.caught} wrong swaps caught; ${counts.quirks} where the program goes astray; the ZB Zone's words in ZOOMBINI.EXE and not in ScummVM; `
    + `workbench: ${bench.trips} forms given back, ${bench.solved} solved (${bench.edited} after edits, ${bench.short} short of the whole band, ${bench.zone} solutions entering the ZB Zone), ${bench.brute} held to trying every placement`);
}
