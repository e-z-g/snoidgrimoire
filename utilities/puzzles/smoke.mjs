// Mirror Machine (js/zb-puzzle-smoke.js) against ScummVM's
// puzzle_smoke.cpp and .h and the 1996 program:
//
//   - the places: the eight reflections (ScummVM's cliff crystals) and the
//     six filter homes are
//     ScummVM's kCliffRunnerPositions and kGridRunnerPositions, in reading
//     order as their names say, and both tables are in ZOOMBINI.EXE as
//     (x, y) pairs; level 2's four filters stand two either side of the
//     mirror;
//   - the counts buildRunnerStacks deals at each level, the ranges and
//     rolls every draw uses, level 2's shuffles, and the grid's pools and
//     columns, read from ScummVM's text and found in the port's;
//   - the chances: ScummVM keeps no count for this page (no
//     debugGetChances of its own), and a Zoombini rides once;
//   - over bands of 16 down to 1 at each level, a judge written here from
//     compareTwoOrderLines, cycleZmbTraitDisplay and
//     advanceAnswerRunnerFrames (the display rows, not the port's own
//     arithmetic) passes the picked Zoombini and its reflection at levels 1
//     and 2, and the placement the grid was made for and the placement
//     the port finds at levels 3 and 4 (both Zoombinis of a pair); the
//     filters have the forms the levels give them, and the marks follow
//     the judge.
export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_smoke.h'), cpp = scumm('zoombini_pages/puzzle_smoke.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const points = body => [...body.matchAll(/Common::Point\((-?\d+), (-?\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const P = S.ZB_PUZZLES.get('SMOKE');
  const fnText = f => S[f].toString();

  // ---- places ------------------------------------------------------------
  const cliff = points(need(/kCliffRunnerPositions\[8\]\{([\s\S]*?)\};/, h, 'kCliffRunnerPositions')[1]);
  const grid = points(need(/kGridRunnerPositions\[8\]\{([\s\S]*?)\};/, h, 'kGridRunnerPositions')[1]);
  const l2 = points(need(/kLevel2RunnerPositions\[4\]\{([\s\S]*?)\};/, h, 'kLevel2RunnerPositions')[1]);
  const mirror = points(need(/kBottomRunnerPositions\[2\]\{([\s\S]*?)\};/, h, 'kBottomRunnerPositions')[1]);
  const snap = points(need(/kCliffDropSnapPosition = (Common::Point\(\d+, \d+\))/, h, 'kCliffDropSnapPosition')[1]);
  if (!same(cliff, S.ZB_SMOKE_REFLECTIONS.map(c => [c.x, c.y]))) fail(`the reflections' places are not ScummVM's: ${JSON.stringify(cliff)}`);
  if (!same(grid.slice(0, 6), S.ZB_SMOKE_FILTER_HOMES.map(c => [c.x, c.y]))) fail(`the filters' homes are not ScummVM's: ${JSON.stringify(grid)}`);
  if (!same(grid[6], snap[0])) fail('grid runner 7 (the mirror\'s reflection) is not at the cliff drop');
  // Reading order: rows are runs of y within 30 pixels, and x rises along each.
  const reading = (list, words) => {
    const rows = [];
    for (const p of list) { const r = rows.find(r => Math.abs(r[0].y - p.y) < 30); r ? r.push(p) : rows.push([p]); }
    if (rows.some((r, i) => i && r[0].y < rows[i - 1][0].y) || rows.some(r => r.some((p, i) => i && p.x < r[i - 1].x))) return false;
    return list.every(p => {
      const r = rows.findIndex(r => r.includes(p)), row = rows[r], col = row.indexOf(p);
      const v = words.rows[r][row.length][col];
      return p.name === v;
    });
  };
  const reflectionWords = { rows: [
    { 2: ['top left', 'top right'] }, { 3: ['middle left', 'centre', 'middle right'] }, { 3: ['bottom left', 'bottom middle', 'bottom right'] }] };
  const homeWords = { rows: [{ 3: ['top left', 'top middle', 'top right'] }, { 3: ['bottom left', 'bottom middle', 'bottom right'] }] };
  if (!reading(S.ZB_SMOKE_REFLECTIONS, reflectionWords)) fail('the reflections are not named in reading order');
  if (!reading(S.ZB_SMOKE_FILTER_HOMES, homeWords)) fail('the filter homes are not named in reading order');
  if (!(l2[0][0] < l2[1][0] && l2[1][0] < mirror[0][0] && mirror[1][0] < l2[2][0] && l2[2][0] < l2[3][0] && l2[3][0] < snap[0][0])
    || S.ZB_SMOKE_L2_PLACES.length !== 4) fail(`level 2's filters are not two either side of the mirror: ${JSON.stringify(l2)}`);
  const pairs = list => list.flatMap(([x, y]) => [x & 255, x >> 8 & 255, y & 255, y >> 8 & 255]);
  const atCliff = find(exe, pairs(cliff)), atGrid = find(exe, pairs(grid));
  if (atCliff.length !== 1) fail(`the reflections' places are in ZOOMBINI.EXE ${atCliff.length} times, not once`);
  if (atGrid.length !== 1) fail(`the filters' places are in ZOOMBINI.EXE ${atGrid.length} times, not once`);

  // ---- counts, ranges and rolls ------------------------------------------
  const stacks = {};
  for (const m of cpp.matchAll(/case kPuzzleLevel(\d):\s*((?:spawnStackRunners\(\d+, RunnerType::k\w+\);\s*)+)break;/g)) {
    stacks[m[1]] = Object.fromEntries([...m[2].matchAll(/spawnStackRunners\((\d+), RunnerType::k(\w+?)\d\d\)/g)].map(s => [s[2], Number(s[1])]));
  }
  if (stacks[1]?.Cliff !== S.ZB_SMOKE_REFLECTION_COUNT || stacks[2]?.Cliff !== S.ZB_SMOKE_REFLECTION_COUNT) fail(`ScummVM deals ${stacks[1]?.Cliff} and ${stacks[2]?.Cliff} reflections`);
  if (stacks[2]?.Level !== S.ZB_SMOKE_L2_FILTERS) fail(`ScummVM deals ${stacks[2]?.Level} level 2 filters`);
  if (stacks[3]?.Grid !== S.ZB_SMOKE_GRID[2] || stacks[4]?.Grid !== S.ZB_SMOKE_GRID[3]) fail(`ScummVM's grids are ${stacks[3]?.Grid} and ${stacks[4]?.Grid} runners`);
  if (S.ZB_SMOKE_REFLECTIONS.length !== S.ZB_SMOKE_REFLECTION_COUNT) fail('a reflection without a place');
  // The reflections: 1-5 as dealt on arrival, 1-4 when dealt again (level 1's note).
  need(/case RunnerType::kCliff01:\s*for \(int16 traitIdx = 0; traitIdx < 4; traitIdx\+\+\)\s*tempState\.traits\[traitIdx\] = _vm->_rnd->getRandomNumber\(1, 5\);/, cpp, 'the reflections\' values');
  need(/for \(int16 traitIdx = 0; traitIdx < 4; traitIdx\+\+\)\s*state->traits\[traitIdx\] = _vm->_rnd->getRandomNumber\(1, 4\);/, cpp, 'the reflections\' values when dealt again');
  if (!/rnd\.range\(1, 5\)/.test(fnText('zbSmokeReflection'))) fail('the port does not deal reflections 1-5');
  // Where the two part (level 1's note): ScummVM draws the match from all eight when dealing again.
  if (!/int16 randTarget = \(0 < cliffCount\) \? _vm->_rnd->getRandomNumber\(cliffCount - 1\) : 0;/.test(cpp))
    fail('ScummVM\'s initLowLevelQuestionRunners no longer draws from all eight reflections; revisit level 1\'s note');
  // Level 2's filters.
  const l2src = need(/void ZoombiniPuzzleSmoke::assignLevel2RunnerTraits[\s\S]*?\n\}/, cpp, 'assignLevel2RunnerTraits')[0];
  const port2 = fnText('zbSmokeLevel2Filter');
  for (const [re, what, want] of [
    [/byte slotShuffle\[5\] = \{([\d, ]+)\};/, 'the slot shuffle', m => `slotShuffle = [${m[1]}]`],
    [/byte valueShuffle\[6\] = \{([\d, ]+)\};/, 'the value shuffle', m => `valueShuffle = [${m[1]}]`],
    [/int16 valueCursorBound = (\d+);\s*int16 slotCursorBound = (\d+);/, 'the bounds', m => `valueBound = ${m[1]}, slotBound = ${m[2]}`],
    [/int16 randBudget = _vm->_rnd->getRandomNumber\((\d+), (\d+)\);/, 'the budget', m => `rnd.range(${m[1]}, ${m[2]})`],
    [/int16 slotIdx = _vm->_rnd->getRandomNumber\((\d+), (\d+)\);/, 'the mirror side\'s trait', m => `rnd.range(${m[1]}, ${m[2]})`],
  ]) { const m = need(re, l2src, what); if (!port2.includes(want(m))) fail(`level 2's ${what} are not ScummVM's: ${m[0]}`); }
  const reuse = Number(need(/const bool reuseRoll = (\d+) < _vm->_rnd->getRandomNumber\(0, 100\);/, l2src, 'the reuse roll')[1]);
  if (reuse !== S.ZB_SMOKE_ROLL.reuse) fail(`the reuse roll is ${S.ZB_SMOKE_ROLL.reuse}, ScummVM ${reuse}`);
  // The grid.
  const gsrc = need(/void ZoombiniPuzzleSmoke::generateTraitGrid[\s\S]*?\n\}/, cpp, 'generateTraitGrid')[0];
  const steps = [...gsrc.matchAll(/(\d+) < _vm->_rnd->getRandomNumber\(0, 100\)/g)].map(m => Number(m[1]));
  const plain = [...gsrc.matchAll(/getRandomNumber\(0, 100\) <= (\d+)/g)].map(m => Number(m[1]));
  if (!same(steps, [S.ZB_SMOKE_ROLL.step, S.ZB_SMOKE_ROLL.fill, S.ZB_SMOKE_ROLL.step, S.ZB_SMOKE_ROLL.fill]) || !same(plain, [S.ZB_SMOKE_ROLL.step]))
    fail(`the grid's rolls are ${steps} and ${plain}, the port's ${JSON.stringify(S.ZB_SMOKE_ROLL)}`);
  const cols = [...gsrc.matchAll(/matchColumn = _vm->_rnd->getRandomNumber\(0, (\d)\);/g)].map(m => Number(m[1]));
  const gport = fnText('zbSmokeGrid');
  if (!same(cols, [4, 3]) || !/matchColumn = rnd\.range\(0, 4\)/.test(gport) || !/matchColumn = rnd\.range\(0, 3\)/.test(gport)) fail(`the grid's step columns are drawn from 0-${cols.join(' and 0-')}`);
  if (!/byte valuePool\[8\];/.test(gsrc) || [...gsrc.matchAll(/int16 lastValueIndex = (\d+);/g)].some(m => m[1] !== '5') || /last = [^5]/.test(gport)) fail('the grid\'s value pools are not 1-5');
  // The judge, and the chances.
  need(/for \(int16 traitRowIdx = 7; 3 < traitRowIdx; traitRowIdx--\)/, cpp, 'compareTwoOrderLines\' mirror side');
  need(/state->traits\[cycleTrait - 1\] = val \+ 1;\s*if \(5 < state->traits\[cycleTrait - 1\]\)\s*state->traits\[cycleTrait - 1\] = 1;/, cpp, 'a step');
  if (/debugGetChances/.test(cpp) || !/None are counted/.test(P.levels[0].chances)) fail('ScummVM counts chances here, or the port says it does');
  need(/if \(_placedZmbCount == _pageLoadedZmbCount\)/, cpp, 'the page ending when every Zoombini has ridden');

  // ---- the judge -----------------------------------------------------------
  // ScummVM's display rows: 0 the Zoombini, 1-3 the cart's side from the
  // cart out, 4-6 the mirror's side from the centre crystal out, 7 the
  // reflection in the mirror. A
  // step takes the value from the nearest filled row on its way in.
  const judge = (source, image, left, right) => {
    const rows = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
    rows[0] = source.slice(); rows[7] = image.slice();
    left.forEach((f, i) => { rows[i + 1] = f.traits.slice(); });
    right.forEach((f, i) => { rows[i + 4] = f.traits.slice(); });
    left.forEach((f, i) => {
      if (f.cycle < 0) return;
      let r = i; while (!rows[r][f.cycle]) r--;
      const v = rows[r][f.cycle] + 1; rows[i + 1][f.cycle] = v > 5 ? 1 : v;
    });
    for (let i = right.length - 1; i >= 0; i--) {
      const f = right[i];
      if (f.cycle < 0) continue;
      let r = i + 5; while (!rows[r][f.cycle]) r++;
      const v = rows[r][f.cycle] + 1; rows[i + 4][f.cycle] = v > 5 ? 1 : v;
    }
    const a = [0, 0, 0, 0], b = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (rows[r][c]) a[c] = rows[r][c];
    for (let r = 7; r > 3; r--) for (let c = 0; c < 4; c++) if (rows[r][c]) b[c] = rows[r][c];
    return same(a, b);
  };
  const traitsOf = z => ['hair', 'eyes', 'nose', 'feet'].map(k => z[k]);
  const valid = t => t.every(v => v >= 1 && v <= 5);
  const setCount = f => f.traits.filter((v, c) => v && c !== f.cycle).length + (f.cycle >= 0 ? 1 : 0);

  let dealt = 0, madeWorks = 0, shorter = 0, chance = 0;
  const sizes = [16, 13, 11, 8, 5, 3, 2, 1];
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(300, 900 + level, sizes)) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      const st = d.state;
      const bad = m => { fail(`level ${level}, a band of ${band.length}: ${m}`); return true; };
      if (level <= 2) {
        const { questionIndex: q, questionCrystalIdx: t, cliffRunnerStates: reflections, level2RunnerStates: filters } = st;
        const left = filters.slice(0, 2), right = filters.slice(2);
        if (q < 0 || q >= band.length || !same(st.questionTraits[0], traitsOf(band[q]))) { bad('the picked Zoombini is not one of the band'); break; }
        if (reflections.length !== 8 || !reflections.every(valid)) { bad('the reflections are not eight Zoombinis'); break; }
        if (filters.length !== (level === 2 ? 4 : 0)) { bad(`${filters.length} filters`); break; }
        if (filters.some(f => f.cycle !== -1 || setCount(f) < 1 || setCount(f) > 2 || f.traits.some(v => v < 0 || v > 5))) { bad('a filter that does not give one or two traits'); break; }
        if (level === 2 && left[0].traits.some((v, c) => v && v === left[1].traits[c])) { bad('the cart\'s side filters give a trait the same value twice'); break; }
        if (level === 1 && !same(reflections[t], traitsOf(band[q]))) { bad('the matching reflection is not the picked Zoombini'); break; }
        if (!judge(traitsOf(band[q]), reflections[t], left, right)) { bad('the picked Zoombini does not pass the judge with its reflection'); break; }
        if (level === 2) {
          // The mirror's side gives only the picked Zoombini's values in the centre crystal.
          const atMirror = S.zbSmokeThrough(traitsOf(band[q]), left);
          if (right.some(f => f.traits.some((v, c) => v && v !== atMirror[c]))) { bad('a mirror-side filter gives a value the picked Zoombini does not have in the centre crystal'); break; }
        }
        const judged = band.map(z => reflections.map((c, i) => judge(traitsOf(z), c, left, right) ? i : -1).filter(i => i >= 0));
        if (!same(judged, st.matches) || d.marks.some((m, i) => (m === null) !== !judged[i].length)) { bad('the marks do not follow the judge'); break; }
        if (judged.some((m, i) => m.length && !m.includes(t))) chance++;
      } else {
        const filters = st.gridRunnerStates, q0 = st.questionTraits[0], q1 = st.questionTraits[1];
        const pair = level === 4 && band.length > 1;
        if (!same(q0, traitsOf(band[0])) || (band.length > 1 && !same(q1, traitsOf(band[1])))) { bad('the question is not the first two in line'); break; }
        if (filters.length !== 6 || filters.some(f => setCount(f) < 1 || setCount(f) > 2 || !f.traits.every(v => v >= 0 && v <= 5))) { bad('a filter that does not set or step one or two traits'); break; }
        const images = [st.primaryGridTraits[7]];
        if (pair) images.push(st.secondaryGridTraits[8]);
        if (!images.every(valid)) { bad('a reflection is not a Zoombini'); break; }
        const sources = pair ? [q0, q1] : [q0];
        const passes = (l, r) => sources.every((s, i) => judge(s, images[i], l.map(j => filters[j]), r.map(j => filters[j])));
        if (passes([0, 1], [2, 3])) madeWorks++;
        else { bad('the placement the grid was made for does not pass the judge'); break; }
        const sol = st.solution;
        if (!sol || !passes(sol.left, sol.right) || sol.left.length + sol.right.length > 4) { bad('the placement found does not pass the judge'); break; }
        if (sol.left.length + sol.right.length < 4) shorter++;
        if (level === 4) {
          // One decoy copies a working row, its step kept and its values moved on one; the other gives one value.
          const G = st.primaryGridTraits, M = st.gridMatchTraits;
          const copies = (src, dst) => [0, 1, 2, 3].every(c => M[src][c] ? G[dst][c] === G[src][c] && M[dst][c] === G[src][c]
            : G[dst][c] === (G[src][c] ? G[src][c] % 5 + 1 : 0) && !M[dst][c]);
          const single = r => G[r].filter(Boolean).length === 1 && !M[r].some(Boolean);
          if (!((single(6) && (copies(1, 5) || copies(2, 5))) || (single(5) && (copies(3, 6) || copies(4, 6))))) { bad('the decoys are not a copy and a single value'); break; }
        }
        if (d.marks[0] === null || d.marks.slice(pair ? 2 : 1).some(m => m !== null)) { bad('the marks are not the first in line (and the second of a pair)'); break; }
      }
      dealt++;
    }
  }
  // ---- the workbench -----------------------------------------------------
  // Nothing is hidden (the reflections and filters are in view), so no
  // strategy; the form picks the Zoombini and its reflection at levels 1
  // and 2; the known answer is every way of matching the first ride, each
  // held to the judge above, and at levels 3 and 4 every placement counted
  // again here.
  if (P.strategy) fail('Mirror Machine hides nothing, yet has a strategy');
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  const orderedPicks = (from, k) => k === 0 ? [[]] : from.flatMap((x, i) => orderedPicks(from.filter((_, j) => j !== i), k - 1).map(r => [x, ...r]));
  let trips = 0, edits = 0, solved = 0, ways = 0, slow = 0;
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(40, 600 + level, [16, 11, 6, 2, 1])) {
      const d = P.deal(level, band, S.zbRandom(seed), {}), n = band.length;
      const bad = m => { fail(`level ${level}, a band of ${n}: ${m}`); return true; };
      const vals = valuesOf(P.form(level, band, d.state)), again = P.edit(level, band, d.state, vals);
      if (!same(valuesOf(P.form(level, band, again)), vals) || (level <= 2 && (!same(again.cliffRunnerStates, d.state.cliffRunnerStates) || !same(again.level2RunnerStates, d.state.level2RunnerStates)))) { bad('the form does not give back the puzzle it shows'); break; }
      trips++;
      let state = d.state;
      if (level <= 2) {
        // Another pick and place: the pick must match its reflection, and
        // at level 2 the mirror's filters give only its values.
        const pick = (d.state.questionIndex + 1) % n, place = (d.state.questionCrystalIdx + 3) % 8;
        state = P.edit(level, band, d.state, { picked: pick, place });
        const f = state.level2RunnerStates, left = f.slice(0, 2), right = f.slice(2);
        if (!judge(traitsOf(band[pick]), state.cliffRunnerStates[place], left, right) || !same(valuesOf(P.form(level, band, state)), { picked: pick, place })) { bad('an edited pick does not match its reflection'); break; }
        const atCrystal = S.zbSmokeThrough(traitsOf(band[pick]), left);
        if (right.some(g => g.traits.some((v, c) => v && v !== atCrystal[c])) || f.some(g => setCount(g) < 1 || setCount(g) > 2)) { bad('edited filters the program could not deal'); break; }
        for (const wrong of [{ picked: n, place: 0 }, { picked: 0, place: 8 }, { picked: 'x', place: 1 }]) {
          let err = null; try { P.edit(level, band, d.state, wrong); } catch (e) { err = e.message; }
          if (!err) { bad(`the form takes ${JSON.stringify(wrong)}`); break; }
        }
        edits++;
      }
      const t0 = Date.now(), sol = P.solve(level, band, state);
      slow = Math.max(slow, Date.now() - t0);
      if (sol.most !== n || !sol.exact || sol.solutions.some(x => x.crosses.length > sol.most)) { bad('the known answer does not take the whole band'); break; }
      if (sol.solutions.some(x => !same(x.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b), band.map((_, i) => i)))) { bad('a solution\'s diagram does not draw each Zoombini once'); break; }
      if (level <= 2) {
        const f = state.level2RunnerStates, left = f.slice(0, 2), right = f.slice(2);
        const seen = new Set(), pairs = [];
        band.forEach((z, i) => { const k = S.zbBandCode([z]); if (seen.has(k)) return; seen.add(k); state.cliffRunnerStates.forEach((r, j) => { if (judge(traitsOf(z), r, left, right)) pairs.push(`${i}/${j}`); }); });
        const listed = sol.solutions.map(x => { const m = /Zoombini (\d+) in the cart and the (.+?) reflection/.exec(x.steps[0]); return `${+m[1] - 1}/${S.ZB_SMOKE_REFLECTIONS.findIndex(r => r.name === m[2])}`; });
        if (sol.ways !== pairs.length || listed.some(k => !pairs.includes(k)) || !listed.length || !listed[0].startsWith(`${state.questionIndex}/`)) { bad(`${sol.ways} ways said, ${pairs.length} judged, the first ${listed[0]}`); break; }
      } else {
        const pair = level === 4 && n > 1, fl = state.gridRunnerStates;
        const srcs = [traitsOf(band[0]), ...(pair ? [traitsOf(band[1])] : [])], imgs = [state.primaryGridTraits[7], ...(pair ? [state.secondaryGridTraits[8]] : [])];
        let count = 0;
        for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (const lr of orderedPicks([0, 1, 2, 3, 4, 5], a + b)) {
          if (srcs.every((q, k) => judge(q, imgs[k], lr.slice(0, a).map(i => fl[i]), lr.slice(a).map(i => fl[i])))) count++;
        }
        const listed = sol.solutions.map(x => x.title);
        const sizes = sol.solutions.map(x => +x.title.split(' ')[0]);
        if (sol.ways !== count || !count || sizes.some((k, i) => i && k < sizes[i - 1])) { bad(`${sol.ways} placements said, ${count} judged, sizes ${sizes}`); break; }
        // Each listed placement passes the judge, read back from its steps.
        const home = name => S.ZB_SMOKE_FILTER_HOMES.findIndex(h => h.name === name);
        for (const x of sol.solutions) {
          const side = st => /no filter/.test(st) ? [] : [...st.matchAll(/(top left|top middle|top right|bottom left|bottom middle|bottom right) \(/g)].map(m => home(m[1]));
          const L = side(x.steps[0]), R = side(x.steps[1]);
          if (L.length + R.length !== +x.title.split(' ')[0] || !srcs.every((q, k) => judge(q, imgs[k], L.map(i => fl[i]), R.map(i => fl[i])))) { bad(`a listed placement fails the judge: ${x.title}`); break; }
        }
        ways += count;
      }
      solved++;
    }
  }
  if (slow > 1500) fail(`a known answer took ${slow} ms`);
  say(`workbench: ${trips} forms given back, ${edits} picks edited and still matched, ${solved} known answers held to the judge (${ways} placements counted again), slowest ${slow} ms; no strategy, nothing being hidden`);

  say(`places as ScummVM's and in ZOOMBINI.EXE at 0x${(atCliff[0] || 0).toString(16)} and 0x${(atGrid[0] || 0).toString(16)}; counts, ranges and rolls as ScummVM's; `
    + `${dealt} deals judged (at levels 1 and 2, ${chance} with a second Zoombini matching by chance; at 3 and 4 the made placement passes in all ${madeWorks}, a shorter one found in ${shorter})`);
}
