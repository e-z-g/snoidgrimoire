// Bubblewonder Abyss (js/zb-puzzle-maze2.js) against ScummVM's
// puzzle_maze.cpp and .h, the 1996 program and MAZE2's own layouts:
//
//   - the tables: the feature slots' trait offsets, kinds and values, the
//     thresholds, level 4's counts, the colour pool and names, the seats'
//     squares and ways and the exits round the corners, are ScummVM's,
//     read from its text; the program keeps them as tables, and packed as
//     its words they are in ZOOMBINI.EXE (the pool, slot kinds and values,
//     offsets and thresholds in one run; level 4's counts just before
//     "Maze2.MHK"; the seats' squares with the exits; the seats' ways
//     before kSeatFlagValue; the slot kinds after the drag rectangles);
//   - which layout each level takes, how the counters step and when a
//     small band gets its own, which selector each layout runs, the
//     colour draws and level 4's draws, as ScummVM writes them, and the
//     two lines where the port follows the program instead of ScummVM;
//   - the calls' ranges in the port's own text are the ones ScummVM's
//     selectors make;
//   - the layouts, which the port reads from MAZE2 itself, match a second
//     reading of MAZE2's REGS words made here, record for record, and a
//     missing or malformed layout, or no archive, is an Error;
//   - no chance count: ScummVM's page leaves debugGetChances to the base,
//     which cannot count them;
//   - the movement as the program plays it: the port's frames a square and
//     claiming frame are MAZE2's movement scripts' and ScummVM's, and every
//     launch is played again below by a second reading, frame by frame
//     (bubbles set moving together, collisions, the grid's edge);
//   - the workbench: the form gives back what it was given, for the dealt
//     puzzle and for another layout and features, and edit refuses a
//     layout of another level and a feature that is none; every solution,
//     played again by a second reading of the game here (sticky squares,
//     knocks and frees included), sends across whom it says, one launch a
//     step, and its diagram shows each Zoombini once, those across
//     unfaded; for bands of four or fewer every order of launches one at a
//     time is tried, and nothing gets more across than solve says, nor fewer
//     when it says it is proven, nor more than its bound for any play; solve
//     is exact only where the two meet; and each solve keeps within two
//     seconds;
//   - over bands of 16, 11, 7, 4 and 2 at each level and both layouts,
//     every feature arrow gets a slot and every slot an arrow, the
//     colours are a permutation, the key feature is the one the level's
//     ranges pick and sits on the arrows the level puts it on, a last pair
//     drawn at random at level 1 is of features nobody has, the counters
//     alternate the layouts, the same seed deals the same, and each
//     mark's arrows and first launches match a second reading of the
//     grid, made here from the archive's words.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../load.mjs';

export default function check({ S, fail, say, scumm, exe, need, bands, find, open }) {
  const h = scumm('zoombini_pages/puzzle_maze.h'), cpp = scumm('zoombini_pages/puzzle_maze.cpp');
  const base = scumm('zoombini_pages/puzzle_base.cpp');
  const port = fs.readFileSync(path.join(ROOT, 'js', 'zb-puzzle-maze2.js'), 'utf8');
  const P = S.ZB_PUZZLES.get('MAZE2');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const table = (name, text = h) => need(new RegExp(`${name.replace(/[[\]]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\};`), text, name)[1].replace(/\/\/.*$/gm, '');
  const nums = body => [...body.matchAll(/-?\d+/g)].map(m => Number(m[0]));
  const points = body => [...body.matchAll(/Common::Point\((\d+), (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const words = a => a.flatMap(v => [v & 255, v >> 8 & 255]);
  const once = (bytes, what, after) => {
    let at = find(exe, bytes);
    if (after) at = at.filter(o => after(o + bytes.length));
    if (at.length !== 1) fail(`${what} is in ZOOMBINI.EXE ${at.length} times, not once`);
    return at[0] || 0;
  };

  // ---- the tables ---------------------------------------------------------
  const offsets = nums(table('kTraitOffsets[4]'));
  if (!same(offsets, S.ZB_MAZE2_TRAIT_OFFSETS)) fail(`trait offsets ${offsets}, the port ${S.ZB_MAZE2_TRAIT_OFFSETS}`);
  const cats = [...table('kSlotTraitCategories[21]').matchAll(/kPathSlotTraitCategory(\d\d)_/g)].map(m => Number(m[1]));
  if (!same(cats, S.ZB_MAZE2_SLOT_CATEGORY)) fail(`slot kinds ${cats}, the port ${S.ZB_MAZE2_SLOT_CATEGORY}`);
  const thr = nums(table('kPathSelectThresholds[20]'));
  if (!same(thr, S.ZB_MAZE2_THRESHOLDS)) fail(`thresholds ${thr}, the port ${S.ZB_MAZE2_THRESHOLDS}`);
  const loops = nums(table('kScoreToLoopCount[17]'));
  if (!same(loops, S.ZB_MAZE2_LOOPS)) fail(`level 4's counts ${loops}, the port ${S.ZB_MAZE2_LOOPS}`);
  const pool = nums(table('kStaticPathPool[11]'));
  if (!same(pool, S.ZB_MAZE2_COLOUR_POOL)) fail(`colour pool ${pool}, the port ${S.ZB_MAZE2_COLOUR_POOL}`);
  const colourNames = Object.fromEntries([...need(/enum class MazeColorShapeBase : int16 \{([\s\S]*?)\};/, h, 'MazeColorShapeBase')[1]
    .matchAll(/k([A-Z][a-z]+)(\d+) = \2/g)].map(m => [m[2], m[1].toLowerCase()]));
  for (const [shape, name] of Object.entries(colourNames)) if (S.ZB_MAZE2_COLOURS[shape] !== name) fail(`colour ${shape} is ${name} in ScummVM, ${S.ZB_MAZE2_COLOURS[shape]} in the port`);
  if (Object.keys(colourNames).length !== 7) fail(`read ${Object.keys(colourNames).length} colours from MazeColorShapeBase, not 7`);
  const kinds = [...table('kTraitSlotKind[21]').matchAll(/ZmbTrait::kTrait(\w+)/g)].map(m => m[1].toLowerCase());
  const values = nums(table('kTraitSlotValue[21]'));
  const slotTraits = [...Array(21).keys()].map(s => S.zbMaze2SlotTrait(s));
  if (!same(kinds, slotTraits.map(t => t.kind)) || !same(values, slotTraits.map(t => t.value))) fail(`slot traits are not ScummVM's kTraitSlotKind and kTraitSlotValue`);
  const seatSquares = points(table('kSeatGridCoords[14]'));
  const seatWays = [...table('kSeatMoveDirection[14]').matchAll(/kMazeDirection0(\d)_/g)].map(m => Number(m[1]));
  if (!same(seatSquares.map((p, i) => [...p, seatWays[i]]), S.ZB_MAZE2_SEATS)) fail(`the seats are not ScummVM's kSeatGridCoords and kSeatMoveDirection`);
  const exitTypes = [...table('kBaseNodeTypes[18]').matchAll(/kMazeCellType(\d\d)_/g)].map(m => Number(m[1]));
  const exitSquares = points(table('kBaseNodeCoords[18]'));
  if (!same(exitTypes.map((t, i) => [t, ...exitSquares[i]]), S.ZB_MAZE2_EXITS)) fail(`the exits are not ScummVM's kBaseNodeTypes and kBaseNodeCoords`);
  const flags = nums(table('kSeatFlagValue[14]'));
  const rects = [...need(/_dragConstraintRects\[4\] = \{([\s\S]*?)\};/, h, '_dragConstraintRects')[1].matchAll(/Common::Rect\(([\d, ]+)\)/g)].flatMap(m => nums(m[1]));

  // In ZOOMBINI.EXE, as the program packs them.
  const run1 = [...pool, ...slotTraits.flatMap(t => [S.ZB_TRAIT_KINDS.indexOf(t.kind), t.value]), ...offsets, ...thr];
  const at1 = once(words(run1), 'the colour pool, slot traits, offsets and thresholds');
  const name = 'Maze2.MHK';
  const at2 = once(words(loops), `level 4's counts before "${name}"`, o => new TextDecoder('latin1').decode(exe.subarray(o, o + name.length)) === name);
  const at3 = once(words([...seatSquares.flat(), ...exitTypes, ...exitSquares.flat()]), 'the seats\' squares and the exits');
  const at4 = once(words([...seatWays, ...flags]), 'the seats\' ways and kSeatFlagValue');
  const at5 = once(words([...rects, ...cats]), 'the drag rectangles and the slot kinds');

  // ---- the layouts, the counters and the draws, as ScummVM writes them -----
  const ids = Object.fromEntries([...h.matchAll(/kResRegs(\d+)_MazeLayout(\w+) = (\d+)/g)].map(m => [m[2], Number(m[3])]));
  const config = need(/void ZoombiniPuzzleMaze::loadRegsConfigByLevel\(\) \{([\s\S]*?)\n\}/, cpp, 'loadRegsConfigByLevel')[1];
  const firsts = [...config.matchAll(/case kMazeLayoutLevel(\d):[^}]*?kResRegs\d+_MazeLayout(\w+) \+ _levelVariantIdx/g)].map(m => [Number(m[1]), ids[m[2]]]);
  if (firsts.length !== 4 || firsts.some(([l, id]) => S.ZB_MAZE2_FIRST_LAYOUT[l] !== id)) fail(`levels' first layouts are ScummVM's ${JSON.stringify(firsts)}`);
  const smallId = ids[need(/default:\s*\/\/ Fixed REGS \d+\.\s*_mazeLayoutRegsId = kResRegs\d+_MazeLayout(\w+);/, config, 'the small band\'s layout')[1]];
  if (smallId !== S.ZB_MAZE2_SMALL_LAYOUT) fail(`the small band's layout is ${smallId} in ScummVM`);
  const smallUnder = Number(need(/_difficultyLevel == kPuzzleLevel4 && _pageLoadedZmbCount < (\d+)\)\s*_layoutLevel = kMazeLayoutLevel4SmallPack;/, cpp, 'the small band')[1]);
  if (smallUnder !== 5) fail(`ScummVM gives a band under ${smallUnder} the small layout, the port under 5`);
  const init = need(/void ZoombiniPuzzleMaze::initGridAndSelectPaths\(\) \{([\s\S]*?)\n\}/, cpp, 'initGridAndSelectPaths')[1];
  const dispatch = [
    [/case kMazeLayoutLevel1:\s*buildZmbAssignmentAlt2\(\);\s*variantState\._level1 \+= 1;\s*if \(1 < variantState\._level1\)\s*variantState\._level1 = 0;/, 'level 1'],
    [/case kMazeLayoutLevel2:\s*if \(variantState\._level2\)\s*selectPathSlots2\(\);\s*else\s*buildZmbAssignmentAlt\(\);\s*variantState\._level2 \+= 1;\s*if \(1 < variantState\._level2\)/, 'level 2'],
    [/case kMazeLayoutLevel3:\s*if \(variantState\._level3\)\s*selectPathSlots\(\);\s*else\s*selectPathSlots2\(\);\s*variantState\._level3 \+= 1;\s*if \(1 < variantState\._level3\)/, 'level 3'],
    [/case kMazeLayoutLevel4:\s*buildZmbAssignmentList\(\);[\s\S]*?else\s*variantState\._level4 \+= 2;\s*if \(2 < variantState\._level4\)\s*variantState\._level4 = 0;/, 'level 4'],
    [/default:[^\n]*\n\s*selectPathSlots\(\);/, 'the small band'],
  ];
  for (const [re, what] of dispatch) if (!re.test(init)) fail(`ScummVM's initGridAndSelectPaths no longer reads as the port for ${what}`);
  const shuffle = need(/lastAvailablePathPoolIdx = (\d+);\s*for \(int16 group = (\d+); group < (\d+); group\+\+\) \{\s*const int16 randIdx = _vm->_rnd->getRandomNumber\((\d+), lastAvailablePathPoolIdx\);/, init, 'the colour shuffle').slice(1).map(Number);
  if (!same(shuffle, [8, 2, 9, 2])) fail(`the colour shuffle is ScummVM's ${shuffle}`);
  const list = need(/void ZoombiniPuzzleMaze::buildZmbAssignmentList\(\) \{([\s\S]*?)\n\}/, cpp, 'buildZmbAssignmentList')[1];
  if ([...list.matchAll(/getRandomNumber\(1, 20\)/g)].length !== 2 || [...list.matchAll(/getRandomNumber\(0, 2\)/g)].length !== 1) fail(`level 4's own draws are not two of 1-20 and one of 0-2`);
  const sel2 = need(/void ZoombiniPuzzleMaze::selectPathSlots2\(\) \{([\s\S]*?)\n\}/, cpp, 'selectPathSlots2')[1];
  if (!/_difficultyLevel == kPuzzleLevel2 && phase == 0/.test(sel2)) fail('ScummVM no longer doubles level 2\'s first middle feature');
  // The two differences: ScummVM excludes the slot just drawn; the program (0x4339b6, 0x433ddf) excludes nothing.
  const sel1 = need(/void ZoombiniPuzzleMaze::selectPathSlots\(\) \{([\s\S]*?)\n\}/, cpp, 'selectPathSlots')[1];
  for (const [text, fn] of [[sel2, 'selectPathSlots2'], [sel1, 'selectPathSlots']]) {
    if (!/int16 secondFinalSlot = findHighestScoredSlot\(firstFinalSlot\);/.test(text)) fail(`ScummVM's ${fn} no longer excludes firstFinalSlot: the port's note on the difference is stale`);
  }
  // The ranges the selectors ask for, in ScummVM and in the port's text.
  const calls = (text, fn) => [...text.matchAll(new RegExp(`${fn}\\((\\d+), (\\d+)\\)`, 'g'))].map(m => `${m[1]},${m[2]}`);
  for (const fn of ['findBestTraitSlotInRange', 'commitBestTraitSlot', 'findAndCommitNewTraitSlot', 'findAndCommitNextSlot']) {
    const a = [...new Set(calls(cpp, fn))].sort(), b = [...new Set(calls(port, fn))].sort();
    if (!same(a, b)) fail(`${fn} is called with ${a.join(' ')} in ScummVM, ${b.join(' ')} in the port`);
  }

  // ---- no chance count ------------------------------------------------------
  if (/debugGetChances/.test(cpp) || /debugGetChances/.test(h)) fail('ScummVM\'s maze page now counts chances');
  need(/ZmbChanceInfo ZoombiniPuzzle::debugGetChances\(\) const \{\s*ZmbChanceInfo info;\s*info\.type = ZmbChanceInfo::ZmbChanceType::kAmorphous;/, base, 'the base debugGetChances');
  if (P.levels.some(l => !/^None counted/.test(l.chances))) fail('the port counts chances');

  // ---- the layouts, read from MAZE2 -------------------------------------
  const arc = open('MAZE2');
  const want = [...Object.values(ids)].filter(id => id !== ids.L4Unused).sort();
  if (!same(S.ZB_MAZE2_LAYOUT_IDS.slice().sort(), want)) fail(`the port reads layouts ${S.ZB_MAZE2_LAYOUT_IDS}, ScummVM's used ones are ${want}`);
  const layouts = S.zbMaze2Layouts(arc), regs = {};
  let records = 0;
  for (const id of want) {
    if (!arc.has('REGS', id)) { fail(`MAZE2 has no REGS ${id}`); continue; }
    const w = regs[id] = [...S.parseRegs(arc.get('REGS', id))], L = layouts[id];
    const cells = [];
    for (let i = 0; i < w[0]; i++) {
      const [type, row, col, group, f0, f1, f2, f3, dir, turns] = w.slice(10 + 10 * i, 20 + 10 * i);
      cells.push({ type, row, col, group: group || 1, ways: [f0, f1, f2, f3].map(Boolean), dir, turns: !!turns });
    }
    records += cells.length;
    if (!L || !same(L.seats, w.slice(1, 10).filter(Boolean).map(x => x - 1)) || !same(L.cells, cells) || w.length !== 10 + 10 * w[0]) fail(`layout ${id} as the port reads it is not MAZE2's REGS ${id}`);
  }
  if (!arc.has('REGS', ids.L4Unused) || layouts[ids.L4Unused]) fail(`REGS ${ids.L4Unused} should be in MAZE2 and not read`);
  // The movement's timing, from MAZE2's own scripts: every movement script
  // (SCRS 15015-15034, five feet a direction) is ZB_MAZE2_STEP frames long,
  // claims its square on the frames before the last, ZB_MAZE2_CLAIM among
  // them, and says it has arrived on the last; ScummVM counts the claim on
  // that frame only, pairs the second claimant with the first, and starts a
  // launch from the right or left on its own square (the program's 0x4301d6).
  let scripts = 0;
  for (let id = 15015; id <= 15034; id++) {
    const sc = S.parseScript(arc.get('SCRS', id), 'SCRS'), ev = sc.frames.map(f => f.event);
    const claimByte = 21 + 10 * Math.floor((id - 15015) / 5);
    if (sc.frameCount !== S.ZB_MAZE2_STEP || ev[0] || ev.slice(1, -1).some(e => e !== claimByte) || ev[ev.length - 1] !== claimByte + 1) fail(`SCRS ${id} is not a ${S.ZB_MAZE2_STEP}-frame step claiming and arriving as the port has it: ${ev}`);
    else scripts++;
  }
  const claimFrame = Number(need(/snoid->getLastFrameIdx\(\) != (\d)\)/, cpp, 'the claim frame')[1]);
  if (claimFrame !== S.ZB_MAZE2_CLAIM) fail(`ScummVM claims a square on frame ${claimFrame}, the port on ${S.ZB_MAZE2_CLAIM}`);
  need(/if \(count == 1\) \{\s*firstRunner = runnerIdx;\s*\} else if \(count == 2\) \{/, cpp, 'the collision pairing');
  need(/if \(rs\.direction == kMazeDirection00_West\)\s*rs\.col = rs\.oldCol - 1;/, cpp, 'where a launch to the left starts');
  const firstSquares = S.ZB_MAZE2_SEATS.map((st, seat) => { const [r, c, d] = S.zbMaze2SeatStart(seat); return d === 0 ? [r, c - 1] : d === 1 ? [r + 1, c] : d === 2 ? [r, c + 1] : [r - 1, c]; });
  if (firstSquares.some((sq, seat) => !same(sq, S.ZB_MAZE2_SEATS[seat][2] === 0 ? [S.ZB_MAZE2_SEATS[seat][0], S.ZB_MAZE2_SEATS[seat][1] - 1] : S.ZB_MAZE2_SEATS[seat].slice(0, 2)))) fail('a launch does not first meet the square the program starts it on');

  // No archive, a missing layout and a malformed one are each an Error.
  const band0 = bands(1, 3, [16])[0].band;
  const throws = (arcIn, re, what) => {
    try { P.deal(1, band0, S.zbRandom(1), {}, arcIn); fail(`a deal with ${what} did not fail`); } catch (e) { if (!re.test(e.message)) fail(`a deal with ${what} failed with "${e.message}"`); }
  };
  throws(undefined, /needs MAZE2/, 'no archive');
  throws({ has: () => false, get: () => { throw new Error('none'); } }, /no REGS 16600/, 'no layouts');
  throws({ has: () => true, get: () => new Uint8Array(6) }, /REGS 16600 is 3 words/, 'a malformed layout');

  // ---- deals --------------------------------------------------------------
  // A second reading of a layout, from the archive's words: squares by
  // (row, column), and one launch.
  const grid = (id, arrows) => {
    const w = regs[id], g = new Map();
    S.ZB_MAZE2_EXITS.forEach(([t, r, c]) => g.set(`${r},${c}`, { t }));
    for (let i = 0; i < w[0]; i++) {
      const [t, r, c, grp, f0, f1, f2, f3, d, turns] = w.slice(10 + 10 * i, 20 + 10 * i);
      g.set(`${r},${c}`, { t, r, c, grp: grp >= 1 && grp <= 8 ? grp : 1, ways: [f0, f1, f2, f3], d, turns });
    }
    for (const a of arrows) Object.assign(g.get(`${a.row},${a.col}`), { kind: S.ZB_TRAIT_KINDS[a.traitCategory - 1], value: a.traitValue });
    return g;
  };
  const launch = (g, z, seat) => {
    const dir = new Map([...g].map(([k, v]) => [k, v.d]));
    const spin = v => { const k = `${v.r},${v.c}`; for (let a = 0; a < 4; a++) { dir.set(k, (dir.get(k) + 1) % 4); if (v.ways[dir.get(k)]) break; } };
    let [r, c, d] = S.ZB_MAZE2_SEATS[seat];
    if (d === 1) r--; if (d === 3) r++;
    for (let step = 0; step < 256; step++) {
      const [pr, pc] = [r, c];
      [r, c] = [[r, c - 1], [r + 1, c], [r, c + 1], [r - 1, c]][d];
      if (r < 0 || r > 12 || c < 0 || c > 12) [r, c] = [pr, pc];
      const v = g.get(`${r},${c}`);
      if (!v) continue;
      if (v.t === 1) return 'whirlpool';
      if (v.t === 2 && v.value && z[v.kind] === v.value) d = dir.get(`${r},${c}`);
      if (v.t === 3 || v.t === 4) { d = dir.get(`${r},${c}`); if (v.turns) spin(v); }
      if (v.t === 5) return 'held';
      if (v.t === 6 && v.grp > 1) for (const o of g.values()) if (o.t === 4 && o.grp === v.grp) spin(o);
      if (v.t >= 20) return ['back', 'upper left', 'lower right', 'across'][v.t - 20];
    }
    return 'loops';
  };
  const slotOf = (kind, v) => offsets[S.ZB_TRAIT_KINDS.indexOf(kind)] + v;
  const countsOf = band => { const n = new Array(21).fill(0); for (const z of band) for (const k of S.ZB_TRAIT_KINDS) n[slotOf(k, z[k])]++; return n; };
  // The key as level 1's ranges pick it: the commonest in the first range that has one, the first on a tie.
  const expectKey = band => {
    const n = countsOf(band);
    const ranges = band.length < 3 ? [[1, 2]] : [[2, 5], [6, 9], [10, 16], [1, 16]];
    for (const [lo, hi] of ranges) {
      let best = 0;
      for (let s = 1; s < 21; s++) if (n[s] >= lo && n[s] <= hi && n[s] > (n[best] || 0)) best = s;
      if (best) return best;
    }
    return 0;
  };
  // Which slots each selector repeats: the key on two or three arrows,
  // and the first middle feature (level 2's second layout) or the rare one
  // (level 3's second, the small band's) on two.
  const repeat = { '1,0': [[0, 1]], '1,1': [[0, 1]], '2,0': [[0, 1], [1, 2]], '2,1': [[0, 1], [2, 3]], '3,0': [[0, 1]], '3,1': [[0, 1], [2, 3]], '4,0': [], '4,2': [], '5,0': [[0, 1], [2, 3]] };
  let dealt = 0, nobody = 0, crossed = 0, sent = 0;
  const outcomes = new Map();
  for (let level = 1; level <= 4; level++) {
    for (const variant of level === 4 ? [0, 2] : [0, 1]) {
      for (const { band, seed } of bands(150, 700 + 10 * level + variant, [16, 11, 7, 4, 2])) {
        const journey = { maze2Next: [0, 0, 0, 0] };
        journey.maze2Next[level - 1] = variant;
        const d = P.deal(level, band, S.zbRandom(seed), journey, arc);
        const st = d.state, small = level === 4 && band.length < 5;
        const id = small ? 16609 : S.ZB_MAZE2_FIRST_LAYOUT[level] + variant;
        const tag = `level ${level} layout ${id} band ${band.length}`;
        if (st.mazeLayoutRegsId !== id) { fail(`${tag}: dealt on layout ${st.mazeLayoutRegsId}`); break; }
        const w = regs[id], typeTwo = [];
        for (let i = 0; i < w[0]; i++) if (w[10 + 10 * i] === 2) typeTwo.push(i);
        if (st.selectedPathSlots.length !== typeTwo.length || st.traitArrows.length !== typeTwo.length) { fail(`${tag}: ${st.selectedPathSlots.length} slots for ${typeTwo.length} feature arrows`); break; }
        if (st.selectedPathSlots.some(s => !Number.isInteger(s) || s < 0 || s > 20)) { fail(`${tag}: a slot out of range, ${st.selectedPathSlots}`); break; }
        if (st.traitArrows.some((a, i) => a.slot !== st.selectedPathSlots[i] || a.row !== w[11 + 10 * typeTwo[i]] || a.col !== w[12 + 10 * typeTwo[i]])) { fail(`${tag}: the arrows do not take the slots in the layout's order`); break; }
        const sh = st.waveGroupShapeBase;
        if (sh[0] !== 0 || sh[1] !== 31 || !same(sh.slice(2).sort((a, b) => a - b), pool.slice(2, 9))) { fail(`${tag}: colours ${sh}`); break; }
        const s = st.selectedPathSlots, lay = small ? '5,0' : `${level},${variant}`;
        if (repeat[lay].some(([i, j]) => s[i] !== s[j])) { fail(`${tag}: the slots do not repeat as the level puts them, ${s}`); break; }
        const n = countsOf(band);
        if (['1,0', '1,1', '2,0', '2,1', '3,0'].includes(lay)) {
          const key = expectKey(band);
          if (s[0] !== key) { fail(`${tag}: key ${s[0]}, the ranges pick ${key}`); break; }
        }
        // A last-pair feature drawn at random on level 1's layouts is one nobody has (all twenty being
        // drawable only when the band has them all).
        if (level === 1 && n.slice(1).some(c => !c)) {
          const rest = band.filter(z => !S.ZB_TRAIT_KINDS.some(k => slotOf(k, z[k]) === s[0]));
          if (countsOf(rest).slice(1).filter(Boolean).length <= 4 && (n[s[2]] || n[s[3]])) { fail(`${tag}: a feature drawn for the last pair that the band has, ${s}`); break; }
        }
        if (level === 4 && !small && (s[7] < 1 || s[8] < 1)) { fail(`${tag}: level 4's last two are not 1-20, ${s}`); break; }
        nobody += s.filter(x => !n[x]).length;
        // Marks: the arrows each Zoombini has, and its first launches.
        const g = grid(id, st.traitArrows);
        const seats = w.slice(1, 10).filter(Boolean).map(x => x - 1).filter(x => x < 6);
        let bad = null;
        band.forEach((z, i) => {
          const by = st.traitArrows.map((a, k) => (a.traitValue && z[S.ZB_TRAIT_KINDS[a.traitCategory - 1]] === a.traitValue ? S.ZB_MAZE2_LETTERS[k] : '')).filter(Boolean);
          const out = seats.map(x => launch(g, z, x));
          if (!same(out, st.launches[i])) bad = `${S.zbZoombiniWords(z)} launches ${out}, the deal says ${st.launches[i]}`;
          if (!d.marks[i].startsWith(`turned by ${by.length ? S.zbWordsOr(by, 'and') : 'no feature arrow'};`)) bad = `mark "${d.marks[i]}" for arrows ${by}`;
          for (const o of out) outcomes.set(o, (outcomes.get(o) || 0) + 1);
          if (level < 4) { sent++; if (out.includes('across')) crossed++; }
        });
        if (bad) { fail(`${tag}: ${bad}`); break; }
        // The same seed deals the same.
        const again = P.deal(level, band, S.zbRandom(seed), { maze2Next: journey.maze2Next.map((v, i) => (i === level - 1 ? variant : v)) }, arc).state;
        if (!same(again, st)) { fail(`${tag}: the same seed deals differently`); break; }
        dealt++;
      }
    }
  }
  // The counters over a session: each level's two layouts in turn, the small band's apart.
  const journey = {}, seen = [];
  const b16 = bands(1, 5, [16])[0].band, b3 = bands(1, 6, [3])[0].band;
  for (const [level, band] of [[1, b16], [1, b16], [1, b16], [4, b16], [4, b3], [4, b16], [4, b16], [3, b16], [3, b16], [2, b16]]) {
    seen.push(P.deal(level, band, S.zbRandom(9), journey, arc).state.mazeLayoutRegsId);
  }
  if (!same(seen, [16600, 16601, 16600, 16606, 16609, 16608, 16606, 16604, 16605, 16602])) fail(`over a session the layouts go ${seen}`);

  // ---- the workbench -------------------------------------------------------
  // A second reading of the game in play, from the archive's words: every
  // bubble a launch sets moving, sticky squares that hold, are knocked on
  // and are freed, and where each Zoombini ends. Returns a world with
  // launch(i, seat) (false when not a launch the game allows) and a key.
  const world = (id, arrows, band) => {
    const w = regs[id], sq = new Map(), cells = [];
    for (const [t, r, c] of S.ZB_MAZE2_EXITS) sq.set(`${r},${c}`, { t, r, c });
    for (let i = 0; i < w[0]; i++) {
      const [t, r, c, grp, f0, f1, f2, f3, d, turns] = w.slice(10 + 10 * i, 20 + 10 * i);
      const v = { t, r, c, grp: grp || 1, ways: [f0, f1, f2, f3], d, turns };
      sq.set(`${r},${c}`, v);
      cells.push(v);
    }
    for (const a of arrows) Object.assign(sq.get(`${a.row},${a.col}`), { kind: S.ZB_TRAIT_KINDS[a.traitCategory - 1], value: a.traitValue });
    const dir = new Map(cells.map(v => [`${v.r},${v.c}`, v.d])), held = new Map();
    const where = band.map(() => 0);
    const spin = v => { const k = `${v.r},${v.c}`; for (let a = 0; a < 4; a++) { dir.set(k, (dir.get(k) + 1) % 4); if (v.ways[dir.get(k)]) break; } };
    const corner = seat => (seat < 6 ? 0 : seat < 9 ? 1 : 2);
    return {
      where,
      key: () => JSON.stringify([where, [...dir.values()], [...held]]),
      save: () => ({ where: where.slice(), dir: new Map(dir), held: new Map(held) }),
      load: s => { s.where.forEach((v, i) => { where[i] = v; }); dir.clear(); s.dir.forEach((v, k) => dir.set(k, v)); held.clear(); s.held.forEach((v, k) => held.set(k, v)); },
      // One launch as the program plays it (the per-frame loop of
      // ZOOMBI32.EXE, the Mac's MODULEDELAYPROC), frame by frame: a bubble
      // takes seven frames a square, claims the square it is entering on
      // the fourth and meets it on the seventh; each frame the waiting
      // captives start, the last queued first, then the arrivals, the
      // latest set moving first, then any two that claimed one square are
      // lost; a bubble going on starts its next square the next frame.
      launch(i, seat) {
        if (where[i] !== corner(seat)) return false;
        let [r0, c0, d0] = S.ZB_MAZE2_SEATS[seat];
        if (d0 === 1) r0--; if (d0 === 3) r0++;
        const moving = [], waiting = [], claim = new Map();
        let serial = 0;
        const setOff = (b, frame, knockReady) => {
          let [r, c] = [[b.r, b.c - 1], [b.r + 1, b.c], [b.r, b.c + 1], [b.r - 1, b.c]][b.d];
          if (r < 0 || r > 12 || c < 0 || c > 12) [r, c] = [b.r, b.c];
          const k = `${r},${c}`, v = sq.get(k);
          if (v && v.t === 5 && held.has(k)) { const h = held.get(k); held.delete(k); waiting.push({ t: h.t, r, c, d: b.d, ready: knockReady }); where[h.t] = 'moving'; }
          b.to = [r, c]; b.start = frame;
        };
        const make = (t, r, c, d, frame, ready) => { const b = { t, r, c, d, id: serial++ }; setOff(b, frame, ready); moving.push(b); where[t] = 'moving'; };
        make(i, r0, c0, d0, 0, 0);
        for (let frame = 0; frame < 3000; frame++) {
          if (!moving.length && !waiting.length) return true;
          const pairs = [], arrived = [];
          for (const b of moving) {
            if (frame === b.start + 3) {
              const k = b.to.join(), o = claim.get(k);
              if (o && moving.includes(o)) { pairs.push([o, b]); claim.delete(k); } else claim.set(k, b);
            }
            if (frame === b.start + 6) arrived.push(b);
          }
          for (;;) {
            let j = waiting.length - 1;
            while (j >= 0 && waiting[j].ready > frame) j--;
            if (j < 0) break;
            const q = waiting.splice(j, 1)[0];
            make(q.t, q.r, q.c, q.d, frame + 1, frame);
          }
          arrived.sort((a, b) => b.id - a.id);
          for (const b of arrived) {
            if (!moving.includes(b)) continue;
            [b.r, b.c] = b.to;
            const k = `${b.r},${b.c}`, v = sq.get(k);
            if (claim.get(k) === b) claim.delete(k);
            let goOn = true;
            if (v) {
              if (v.t === 1) { where[b.t] = 'lost'; goOn = false; } else if (v.t === 2) { if (v.value && band[b.t][v.kind] === v.value) b.d = v.d; } else if (v.t === 3 || v.t === 4) { b.d = dir.get(k); if (v.turns) spin(v); } else if (v.t === 5) { held.set(k, { t: b.t, d: b.d }); where[b.t] = 'held'; goOn = false; } else if (v.t === 6 && v.grp > 1) {
                const group = cells.filter(o => o.grp === v.grp);
                for (let q = group.length - 1; q >= 0; q--) {
                  const o = group[q], ok = `${o.r},${o.c}`;
                  if (o.t === 4) spin(o);
                  else if (o.t === 5 && held.has(ok)) { const h = held.get(ok); held.delete(ok); waiting.push({ t: h.t, r: o.r, c: o.c, d: h.d, ready: frame + 1 }); where[h.t] = 'moving'; }
                }
              } else if (v.t >= 20) { where[b.t] = v.t - 20; goOn = false; }
            }
            if (goOn) setOff(b, frame + 1, frame + 1); else moving.splice(moving.indexOf(b), 1);
          }
          for (const [x, y] of pairs) {
            if (!moving.includes(x) || !moving.includes(y)) continue;
            moving.splice(moving.indexOf(x), 1); moving.splice(moving.indexOf(y), 1);
            where[x.t] = where[y.t] = 'lost';
          }
        }
        return false;
      },
    };
  };
  // Every order of launches, for a small band: the most that can end across.
  const brute = (id, arrows, band, seats, cap = 400000) => {
    const W = world(id, arrows, band), seen = new Set([W.key()]), queue = [W.save()];
    let most = 0;
    for (let q = 0; q < queue.length; q++) {
      W.load(queue[q]);
      most = Math.max(most, W.where.filter(x => x === 3).length);
      for (let i = 0; i < band.length; i++) {
        for (const seat of seats) {
          W.load(queue[q]);
          if (!W.launch(i, seat)) continue;
          const k = W.key();
          if (!seen.has(k)) { seen.add(k); queue.push(W.save()); if (queue.length > cap) return null; }
        }
      }
    }
    return most;
  };
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  let trips = 0, rejects = 0, sols = 0, brutes = 0, fewer = 0, slow = 0, exactBig = 0, bigs = 0, worst = 0, unsettled = 0;
  const pickOf = (rnd, list) => list[rnd.number(list.length - 1)];
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(24, 900 + level, [16, 11, 7, 4, 3, 2])) {
      const rnd = S.zbRandom(seed);
      const next = [0, 0, 0, 0];
      next[level - 1] = rnd.bool() ? (level === 4 ? 2 : 1) : 0;
      const d = P.deal(level, band, rnd, { maze2Next: next }, arc);
      const tag = `level ${level} band ${S.zbBandCode(band)}`;
      // Round trips: the dealt form, then a form of another layout and features.
      const form = P.form(level, band, d.state, arc), again = P.edit(level, band, d.state, valuesOf(form), arc);
      if (!same(valuesOf(P.form(level, band, again, arc)), valuesOf(form)) || !same(again.selectedPathSlots, d.state.selectedPathSlots)) { fail(`${tag}: the form does not give back the puzzle it shows`); break; }
      const layouts = S.zbMaze2LevelLayouts(level, band), id = pickOf(rnd, layouts);
      const n = S.zbMaze2Layouts(arc)[id].cells.filter(c => c.type === 2).length;
      const opts = ['none', ...S.zbTraitOptions().map(o => o.value)];
      const vals = { layout: id };
      for (let k = 1; k <= n; k++) vals[`a${k}`] = pickOf(rnd, opts);
      const edited = P.edit(level, band, d.state, vals, arc);
      if (!same(valuesOf(P.form(level, band, edited, arc)), vals)) { fail(`${tag}: edited to ${JSON.stringify(vals)}, the form gives back ${JSON.stringify(valuesOf(P.form(level, band, edited, arc)))}`); break; }
      trips++;
      const bad = [{ layout: level === 1 ? 16604 : 16600 }, { layout: id, a1: 'hair:9' }, { layout: id, a1: 'wings:2' }, { layout: id, a1: 'nose:0' }];
      for (const v of bad) { try { P.edit(level, band, d.state, v, arc); fail(`${tag}: edit took ${JSON.stringify(v)}`); } catch (e) { if (/is not a function|undefined/.test(e.message)) fail(`${tag}: edit failed badly on ${JSON.stringify(v)}: ${e.message}`); else rejects++; } }
      // Solutions, played again by the second reading.
      for (const st of [d.state, edited]) {
        const t0 = Date.now(), sol = P.solve(level, band, st, arc, {}), ms = Date.now() - t0;
        worst = Math.max(worst, ms);
        if (ms > 2000) { slow++; fail(`${tag}: solve took ${ms} ms`); }
        const seats = st.launcherSeats;
        if (band.length >= 11) { bigs++; if (sol.exact) exactBig++; }
        let problem = null;
        for (const s of sol.solutions) {
          const W = world(st.mazeLayoutRegsId, st.traitArrows, band);
          for (const l of s.launches) if (!seats.includes(l.seat) || !W.launch(l.i, l.seat)) { problem = `${s.title}: launch ${l.i + 1} from seat ${l.seat + 1} is not one the game allows`; break; }
          if (problem) break;
          const across = band.map((_, i) => i).filter(i => W.where[i] === 3);
          if (!same(across, s.crosses) || !s.title.startsWith(`${across.length} of ${band.length} across`)) { problem = `${s.title}: played again, ${across.length} cross (${across}), it says ${s.crosses}`; break; }
          if (s.steps.length !== Math.max(1, s.launches.length)) { problem = `${s.title}: ${s.steps.length} steps for ${s.launches.length} launches`; break; }
          const zs = s.diagram.items.filter(it => it.t === 'zoombini');
          if (!same(zs.map(it => it.i).sort((a, b) => a - b), band.map((_, i) => i)) || zs.some(it => !!it.faded === s.crosses.includes(it.i))) { problem = `${s.title}: the diagram does not show each Zoombini once, the ones across unfaded`; break; }
          if (s.crosses.length > sol.most) { problem = `${s.title}: more across than most, ${sol.most}`; break; }
          sols++;
        }
        if (problem) { fail(`${tag}: ${problem}`); break; }
        if (!sol.solutions.length) { fail(`${tag}: no solution`); break; }
        if (sol.solutions[0].crosses.length !== sol.most) { fail(`${tag}: the simplest gets ${sol.solutions[0].crosses.length} across, most is ${sol.most}`); break; }
        if (sol.most < band.length) fewer++;
        // Exact only where the one-at-a-time most, proven, meets the bound for any play.
        if (!(sol.upper >= sol.most) || sol.exact !== (sol.oneAtATime.proven && sol.most >= sol.upper)) { fail(`${tag}: most ${sol.most}, bound ${sol.upper}, proven ${sol.oneAtATime.proven}, exact ${sol.exact}`); break; }
        if (sol.most < sol.upper) unsettled++;
        // Nothing does better one at a time, over every order, for a small band.
        if (band.length <= 4) {
          const top = brute(st.mazeLayoutRegsId, st.traitArrows, band, seats);
          if (top == null) continue;
          brutes++;
          if (top < sol.most || top > sol.upper || (sol.oneAtATime.proven && top !== sol.most)) { fail(`${tag}: every order one at a time gets ${top} across at most, solve says ${sol.most}${sol.oneAtATime.proven ? ', proven' : ''}, bound ${sol.upper}`); break; }
          // And with too little time for the full search, what best first proves.
          const hurried = P.solve(level, band, st, arc, { budget: 4 });
          if (top < hurried.most || (hurried.oneAtATime.proven && top !== hurried.most)) { fail(`${tag}: every order one at a time gets ${top} across at most, solve in a hurry says ${hurried.most}${hurried.oneAtATime.proven ? ', proven' : ''}`); break; }
        }
      }
    }
  }

  const tally = [...outcomes].sort((a, b) => b[1] - a[1]).map(([o, c]) => `${c} ${o}`).join(', ');
  say(`tables as ScummVM's and in ZOOMBINI.EXE at 0x${at1.toString(16)}, 0x${at2.toString(16)}, 0x${at3.toString(16)}, 0x${at4.toString(16)} and 0x${at5.toString(16)}; `
    + `${want.length} layouts read from MAZE2 as a second reading of its REGS gives (${records} records), and an Error without them; ${scripts} movement scripts ${S.ZB_MAZE2_STEP} frames a square, claiming on frame ${S.ZB_MAZE2_CLAIM}; ${dealt} deals with a slot for every feature arrow, the key the ranges pick and the repeats each level makes (${nobody} arrows showing a feature nobody in the band has); `
    + `first launches as a second reading gives (${tally}; ${crossed} of ${sent} Zoombinis at levels 1-3 cross from some launcher); `
    + `workbench: ${trips} forms given back and ${rejects} bad values refused, ${sols} solutions played again as said, ${brutes} small bands' most matched by trying every order, `
    + `${fewer} puzzles where not everyone can cross one at a time (${unsettled} of them short of the bound for launches that overlap), ${exactBig} of ${bigs} with 11 or more proven, the slowest solve ${worst} ms`);

  // ---- a layout edited (the page's layout editor) ------------------------
  // Every square of every layout made what it is gives the same words; a
  // whirlpool put on an empty square and taken off again, and the seats
  // put back, give the words back; an edited square reads back as put.
  {
    const arc = open('MAZE2');
    let squares = 0;
    for (const id of S.ZB_MAZE2_LAYOUT_IDS) {
      const words = Array.from(S.parseRegs(arc.get('REGS', id))), L = S.zbMaze2ParseLayout(id, words);
      const firsts = new Set();
      for (const c of L.cells) {
        if (c.type > 7 || firsts.has(c.row * 13 + c.col)) continue;
        firsts.add(c.row * 13 + c.col);
        const again = S.zbMaze2EditSquare(words, c.row, c.col, c);
        if (JSON.stringify(S.zbMaze2ParseLayout(id, again).cells) !== JSON.stringify(L.cells)) { fail(`REGS ${id}: the square at ${c.row},${c.col} made what it is changes the layout`); break; }
        squares++;
      }
      const empty = [...Array(169).keys()].find(k => !L.cells.some(c => c.row * 13 + c.col === k) && !S.ZB_MAZE2_EXITS.some(e => e[1] * 13 + e[2] === k));
      const [r, c] = [Math.floor(empty / 13), empty % 13];
      const put = S.zbMaze2EditSquare(words, r, c, { type: 1, group: 1, ways: [true, true, true, true], dir: 0, turns: false });
      const got = S.zbMaze2ParseLayout(id, put).cells;
      if (got.length !== L.cells.length + 1 || got[got.length - 1].type !== 1 || got[got.length - 1].row !== r) fail(`REGS ${id}: a whirlpool put at ${r},${c} does not read back last`);
      if (JSON.stringify(S.zbMaze2EditSquare(put, r, c, null)) !== JSON.stringify(words)) fail(`REGS ${id}: a whirlpool put on and taken off does not give the words back`);
      if (JSON.stringify(S.zbMaze2EditSeats(words, L.seats)) !== JSON.stringify(words)) fail(`REGS ${id}: its seats put back change its words`);
    }
    say(`layouts edited: ${squares} squares made what they are, and a whirlpool put on and off, in each of ${S.ZB_MAZE2_LAYOUT_IDS.length} layouts, give their words back`);
  }
}
