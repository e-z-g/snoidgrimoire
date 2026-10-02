// Mudball Wall (js/zb-puzzle-net.js) against ScummVM's puzzle_net.cpp and
// .h and the 1996 program:
//
//   - the names of the mudball's colours and shapes, the six ways of
//     levels 3 and 4 (kHighAxisSelectorIndices, and the six cases of
//     findTargetSlotForSelection, which must agree), and the tank's seven
//     spare mudballs, are ScummVM's, read from its text;
//   - ScummVM's text still has what the port copies (the groups of 3, 2
//     and 1, the third value drawn and not used, the sections within a
//     column taking the column's order, the rotation of 2 or 3, the coin
//     set aside at level 4, the draws for the marks, the labels and the
//     way, one shot used for each launch) and what the port follows the
//     program in instead (ScummVM resets the way at level 3);
//   - the program keeps nothing of this rule as a table, so there is none
//     to find in ZOOMBINI.EXE;
//   - over bands of 16 down to 1 at each level, the groups add up to the
//     band in the program's pattern, the tank holds one mudball per mark
//     and seven or eight more, every mudball lands on its own section and
//     the one the answer gives for each mark lands on it, and each level's
//     orders have their form: a new order in each row and column, rotated
//     at levels 2 and 4, the sections within a column in the column's order
//     at levels 3 and 4, all six ways drawn at level 4.

export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_net.h'), cpp = scumm('zoombini_pages/puzzle_net.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('NET');

  // ---- names, ways and the tank, as ScummVM has them -----------------------
  const names = [...need(/kMudballSelectorValueNames\[3\]\[5\]\{([\s\S]*?)\};\n/, h, 'kMudballSelectorValueNames')[1].matchAll(/\{([^}]*)\}/g)]
    .map(m => [...m[1].matchAll(/"(\w+)"/g)].map(x => x[1].toLowerCase()));
  if (!same(names, [S.ZB_NET_COLOURS, S.ZB_NET_SHAPES, S.ZB_NET_COLOURS])) fail(`the mudball's names are not ScummVM's: ${JSON.stringify(names)}`);
  const button = Object.fromEntries([...need(/enum MudballSelectButtonIndex \{([\s\S]*?)\};/, cpp, 'MudballSelectButtonIndex')[1].matchAll(/(kMudballSelectButton\w+) = (\d)/g)].map(m => [m[1], Number(m[2])]));
  if (button.kMudballSelectButtonSubColor !== 0 || button.kMudballSelectButtonShape !== 1 || button.kMudballSelectButtonColor !== 2) fail('the mudball\'s choices are not numbered shape\'s colour 0, shape 1, colour 2');
  const ways = [...need(/kHighAxisSelectorIndices\[6\]\[3\] = \{([\s\S]*?)\};/, cpp, 'kHighAxisSelectorIndices')[1].matchAll(/\{([^}]*)\}/g)]
    .map(m => m[1].split(',').map(t => button[t.trim()]));
  if (!same(ways, S.ZB_NET_WAYS)) fail(`the six ways are not kHighAxisSelectorIndices: ${JSON.stringify(ways)}`);
  const lookup = need(/switch \(_axisSelectorPermutationIdx\) \{([\s\S]*?)default:/, cpp, 'findTargetSlotForSelection\'s cases')[1];
  const cases = [...lookup.matchAll(/case (\d):\s*match = \(_rowAxisRuleValues\[gridRowIdx\] == _selectedSelectorValues\[(\d)\] &&\s*_columnAxisRuleValues\[gridRowIdx\] == _selectedSelectorValues\[(\d)\] &&\s*_subcolumnAxisRuleValues\[gridRowIdx\] == _selectedSelectorValues\[(\d)\]\);/g)];
  if (cases.length !== 6 || cases.some(m => !same([m[2], m[3], m[4]].map(Number), S.ZB_NET_WAYS[Number(m[1])]))) fail('findTargetSlotForSelection\'s six cases are not the six ways');
  need(/if \(_rowAxisSelectorIdx == 2\) \{\s*if \(_rowAxisRuleValues\[i\] == _selectedSelectorValues\[2\] &&\s*_columnAxisRuleValues\[i\] == _selectedSelectorValues\[1\]\)\s*return i;\s*\} else \{\s*if \(_columnAxisRuleValues\[i\] == _selectedSelectorValues\[2\] &&\s*_rowAxisRuleValues\[i\] == _selectedSelectorValues\[1\]\)/, cpp, 'the lookup at levels 1 and 2');
  const spare = Number(need(/_remainingShotAllowance = _targetCount \+ \(_difficultyLevel == kPuzzleLevel4 \? 1 : 0\) \+ (\d+);/, cpp, 'the tank')[1]);
  if (spare !== S.ZB_NET_SPARE_SHOTS) fail(`ScummVM's tank has ${spare} spare mudballs, the port ${S.ZB_NET_SPARE_SHOTS}`);
  if (!/debugGetChances\(\) const \{[\s\S]*?kSubmit, _initialShotAllowance/.test(cpp)) fail('debugGetChances is not the tank');
  need(/_sortAnimRunning = false;\s*_remainingShotAllowance -= 1;/, cpp, 'a shot used on each launch');

  // ---- what the port copies, and where it follows the program instead -----
  need(/int16 size = 4;[\s\S]*?do \{\s*size -= 1;\s*if \(size < 1\)\s*size = 3;/, cpp, 'the groups of 3, 2 and 1');
  need(/if \(2 <= _targetLaunchBatchSizes\[i\]\) \{\s*_targetLaunchBatchSizes\[i\] -= 1;/, cpp, 'the groups taken off from the first');
  need(/valA = _vm->_rnd->getRandomNumber\(0, 4\);\s*valB = _vm->_rnd->getRandomNumber\(0, 4\);\s*valC = _vm->_rnd->getRandomNumber\(0, 4\);/, cpp, 'three values drawn for each row');
  need(/if \(!usedA\[valA\] && !usedB\[valB\] && !usedC\[valC\]\)[\s\S]*?if \(!usedA\[valA\] && !usedB\[valB\]\)/, cpp, 'the repeats checked');
  need(/_subcolumnAxisRuleValues\[25 \* planeIdx \+ 5 \* rowIdx \+ gridRowIdx\] = valB;/, cpp, 'the sections within a column taking the column\'s value');
  if ((cpp.match(/_axisRuleRotationStep = _vm->_rnd->getRandomNumber\(0, 1\) \+ 2;/g) || []).length !== 2) fail('the rotation is no longer 2 or 3 at levels 2 and 4');
  need(/_axisRuleRotationStep = _vm->_rnd->getRandomNumber\(0, 1\) \+ 2;\s*\/\/[^\n]*\n\s*_vm->_rnd->getRandomNumber\(0, 1\);/, cpp, 'the coin set aside at level 4');
  need(/pos = _vm->_rnd->getRandomNumber\(0, \(kPuzzleLevel3 <= _difficultyLevel\) \? 124 : 24\);\s*\} while \(_targetLaunchCounts\[pos\] != 0\);/, cpp, 'the marks drawn');
  need(/if \(_vm->_rnd->getRandomBool\(\)\) \{\s*_rowAxisSelectorIdx = 2;\s*_columnAxisSelectorIdx = 1;/, cpp, 'the coin for the labels');
  // The program never resets the way at level 3; ScummVM does, and the port follows the program when it can.
  need(/_axisSelectorPermutationIdx = _vm->_rnd->getRandomNumber\(0, 5\);\s*else\s*_axisSelectorPermutationIdx = 0;/, cpp, 'the way, drawn at level 4 and reset otherwise');

  // ---- deals -----------------------------------------------------------------
  const sizes = [16, 14, 12, 10, 9, 7, 6, 5, 4, 3, 2, 1];
  const pattern = n => { const out = []; let t = 0; for (let s = 3; t < n; s = s === 1 ? 3 : s - 1) { out.push(s); t += s; } return { out, excess: t - n }; };
  const isOrder = list => same(list.slice().sort(), [0, 1, 2, 3, 4]);
  const rot = (list, k) => list.map((_, i) => list[((i - k) % 5 + 5) % 5]);
  const seenWays = new Set(), seenSteps = new Set();
  let dealt = 0, landed = 0;
  for (let level = 1; level <= 4; level++) {
    let bad = 0;
    for (const { band, seed } of bands(300, 900 + level, sizes)) {
      const n = band.length, why = [];
      const journey = {};
      const d = P.deal(level, band, S.zbRandom(seed), journey);
      const st = d.state, rule = st.rule, cells = level >= 3 ? 125 : 25;
      dealt++;
      // The groups.
      const { out, excess } = pattern(n);
      const trimmed = out.slice();
      for (let e = excess, i = 0; e > 0 && i < trimmed.length; i++) if (trimmed[i] >= 2) { trimmed[i]--; e--; }
      if (!same(st.targetLaunchBatchSizes, n === 1 ? [1] : trimmed) || st.targetLaunchBatchSizes.reduce((a, b) => a + b, 0) !== n) why.push(`groups ${st.targetLaunchBatchSizes}`);
      if (st.initialShotAllowance !== st.targetCount + 7 + (level === 4 ? 1 : 0) || !d.setup.some(s => s.includes(`holds ${st.initialShotAllowance} mudballs`))) why.push('the tank');
      // The marks.
      const marks = [...Array(cells).keys()].filter(i => rule.dots[i]);
      if (rule.dots.length !== cells || !same(marks.map(i => rule.dots[i]).sort(), st.targetLaunchBatchSizes.slice().sort())) why.push('the marks are not the groups');
      // Every mudball lands on its own section, and the answer's mudball on each mark.
      const choices = level <= 2 ? 25 : 125, hit = new Set();
      for (let m = 0; m < choices; m++) {
        const choice = [level <= 2 ? 0 : Math.floor(m / 25), Math.floor(m / 5) % 5, m % 5];
        hit.add(S.zbNetLands(rule, choice));
      }
      if (hit.size !== cells || hit.has(-1)) why.push(`${choices} mudballs land on ${hit.size} sections`);
      for (let c = 0; c < cells; c++) {
        const ball = S.zbNetMudball(rule, c);
        if (S.zbNetLands(rule, ball.map(v => v ?? 0)) !== c) { why.push(`the mudball for section ${c} lands elsewhere`); break; }
      }
      for (const t of marks) {
        const words = S.zbNetMudballWords(S.zbNetMudball(rule, t));
        if (!d.answer.some(s => s.includes(S.zbNetCellWords(rule, t)) && s.endsWith(words + '.'))) why.push(`the answer has no mudball for the mark at ${t}`);
        else landed++;
      }
      // Each level's orders.
      const at = (grid, r, c, q = 0) => level <= 2 ? grid[5 * r + c] : grid[25 * r + 5 * c + q];
      const col0 = [0, 1, 2, 3, 4].map(c => at(rule.cols, 0, c)), row0 = [0, 1, 2, 3, 4].map(r => at(rule.rows, r, 0));
      if (!isOrder(col0) || !isOrder(row0)) why.push('a row or column order repeats a value');
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const want = level === 2 ? rot(col0, rule.step * r)[c] : col0[c];
        if (at(rule.cols, r, c) !== want) { why.push('the columns'); r = 5; break; }
      }
      if (level === 2 || level === 4) { seenSteps.add(rule.step); if (rule.step !== 2 && rule.step !== 3) why.push(`a rotation of ${rule.step}`); }
      if (level >= 3) {
        const sub0 = [0, 1, 2, 3, 4].map(q => rule.subs[q]);
        if (!same(sub0, col0)) why.push('the sections within a column are not in the column\'s order');
        for (let i = 0; i < 125; i++) if (rule.subs[i] !== sub0[i % 5] || rule.cols[i] !== col0[Math.floor(i % 25 / 5)]) { why.push('a section\'s values'); break; }
        for (let c = 0; c < 5; c++) for (let q = 0; q < 5; q++) {
          const want = level === 4 ? rot(row0, rule.step * q) : row0;
          if ([0, 1, 2, 3, 4].some(r => at(rule.rows, r, c, q) !== want[r])) { why.push('the rows'); c = 5; break; }
        }
      }
      if (level === 4) {
        seenWays.add(rule.way);
        if (new Set(rule.labels).size !== 3 || journey.netWay !== rule.way) why.push('level 4\'s labels or way');
        // A level 3 deal after it in the same journey looks through the same way, as the program does.
        const after = P.deal(3, band, S.zbRandom(seed), journey);
        if (after.state.axisSelectorPermutationIdx !== rule.way) why.push('level 3 does not keep the last way');
      } else if (rule.way !== 0) why.push(`level ${level} looks through way ${rule.way}`);
      if (level <= 2 && !(same(rule.labels, [2, 1, 0]) || same(rule.labels, [1, 2, 0]))) why.push('the labels');
      if (d.marks.some((m, i) => m !== `goes over ${S.ZB_NET_ORDINALS[i]}`)) why.push('the marks are not the band\'s order');
      if (why.length && bad++ < 3) fail(`level ${level}, ${n} Zoombinis, seed ${seed}: ${why.join('; ')}`);
    }
  }
  if (seenWays.size !== 6) fail(`level 4 drew ${seenWays.size} of the six ways`);
  if (seenSteps.size !== 2) fail('the rotation was not both 2 and 3');
  // ---- the workbench ---------------------------------------------------------
  const valuesOf = form => Object.fromEntries(form.filter(x => x.kind !== 'note').map(x => [x.key, x.value]));
  const bench = { trips: 0, solved: 0, walks: 0, followed: 0, played: 0, lemma: 0, slowest: 0 };
  const perms = []; const permute = (a, k = 0) => { if (k === 5) { perms.push(a.slice()); return; } for (let i = k; i < 5; i++) { [a[k], a[i]] = [a[i], a[k]]; permute(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } }; permute([0, 1, 2, 3, 4]);
  /* A whole rule of one of the ways, the squares in an order of their own
     when untied. */
  const ruleOf = (level, h, rowOrder, colOrder, sqOrder) => {
    const labels = level <= 2 ? [h.axes[0], h.axes[1], 0] : [2, 1, 0];
    const way = level <= 2 ? 0 : S.ZB_NET_WAYS.findIndex(w => same(w, h.axes));
    const r = S.zbNetRuleFrom(level, labels, way, rowOrder, colOrder, h.step, [1], [0]);
    if (sqOrder) for (let i = 0; i < r.subs.length; i++) r.subs[i] = sqOrder[i % 5];
    if (level === 4 && sqOrder) {
      // The rows turn by the square's place, which the untied order keeps.
      for (let p = 0; p < 5; p++) for (let q = 0; q < 5; q++) for (let row = 0; row < 5; row++) r.rows[25 * row + 5 * p + q] = rowOrder[((row - h.step * q) % 5 + 5) % 5];
    }
    return r;
  };
  /* The strategy's proof, checked: after the values 0 to 3 in every choice,
     every order is known under every way still possible, the true one
     among them, and any mudball of different values then lands apart under
     each way left. */
  const isH = (e, h) => same(e.h.axes, h.axes) && e.h.step === h.step;
  const lemma = (level, knows, rule, trueH) => {
    let B = S.zbNetStructures(level, knows).map(S.zbNetFresh);
    for (let k = 0; k < 4; k++) {
      const x = [level <= 2 ? null : k, k, k], cell = S.zbNetLands(rule, x);
      B = B.map(e => S.zbNetApply(level, e, x, cell)).filter(Boolean);
    }
    if (!B.some(e => isH(e, trueH))) return 'the true way is ruled out';
    if (!B.every(S.zbNetComplete)) return 'the orders are not all known after four shots';
    if (B.length > 1) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) for (let c = 0; c < 5; c++) {
      if (level <= 2 ? (a || b === c) : (a === b || b === c || a === c)) continue;
      const x = [level <= 2 ? null : a, b, c], land = B.map(e => S.zbNetLanding(level, e, x));
      if (new Set(land).size !== B.length) return `the mudball ${x} does not tell ${B.length} ways apart`;
      if (land[B.findIndex(e => isH(e, trueH))] !== S.zbNetLands(rule, x)) return 'the true way does not predict where a mudball lands';
    }
    return null;
  };
  const rnd = S.zbRandom(4242);
  for (let level = 1; level <= 4; level++) for (const knows of ['program', 'form']) {
    const Hs = S.zbNetStructures(level, knows), untied = level >= 3 && knows === 'form';
    const every = !untied && level < 4;
    const total = Hs.length * 14400 * (untied ? 120 : 1);
    let problem = null;
    for (let t = 0; t < (every ? total : 4000) && !problem; t++) {
      const h = Hs[every ? Math.floor(t / 14400) : rnd.number(Hs.length - 1)];
      const ro = perms[every ? Math.floor(t / 120) % 120 : rnd.number(119)], co = perms[every ? t % 120 : rnd.number(119)];
      problem = lemma(level, knows, ruleOf(level, h, ro, co, untied ? perms[rnd.number(119)] : null), h);
      bench.lemma++;
    }
    if (problem) fail(`level ${level}, knowing the ${knows}: ${problem}`);
  }
  for (let level = 1; level <= 4; level++) {
    let bad = 0;
    for (const { band, seed } of bands(6, 1500 + level, [16, 7, 3, 12, 1, 9])) {
      const why = [];
      const d = P.deal(level, band, S.zbRandom(seed), {});
      const form = P.form(level, band, d.state), v = valuesOf(form), again = P.edit(level, band, d.state, v);
      if (!same(valuesOf(P.form(level, band, again)), v)) why.push('the form does not give back what it shows');
      for (const k of ['rows', 'cols', 'subs', 'dots', 'step', 'at', 'way']) if (!same(again.rule[k], d.state.rule[k])) why.push(`the rule rebuilt from the form differs in ${k}`);
      bench.trips++;
      const sol = P.solve(level, band, d.state);
      const x = sol.solutions[0];
      const zs = x.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
      if (sol.most !== band.length || !sol.exact || x.crosses.length !== band.length || !same(zs, band.map((_, i) => i))) why.push('the solution does not take and draw the whole band');
      const marks = d.state.rule.at;
      for (const m of marks) {
        const ball = S.zbNetMudball(d.state.rule, m);
        if (S.zbNetLands(d.state.rule, ball.map(v => v ?? 0)) !== m || !x.steps.some(t => t.includes(S.zbNetMudballWords(ball) + ': it lands on the mark at ' + S.zbNetCellWords(d.state.rule, m)))) why.push(`no step lands on the mark at ${m}`);
      }
      bench.solved++;
      for (const knows of ['program', 'form']) {
        const t0 = Date.now(), st = P.strategy(level, band, null, { knows, state: d.state });
        bench.slowest = Math.max(bench.slowest, Date.now() - t0);
        if (st.sure !== band.length || !st.exact) why.push(`the strategy is sure of ${st.sure}`);
        const check = nd => {
          const t1 = Date.now(), sum = nd.outcomes.reduce((t, o) => t + o.left, 0);
          if (nd.outcomes.length && sum !== nd.left) why.push(`a node's outcomes leave ${sum} of its ${nd.left} rules`);
          if (nd.outcomes.length && !(nd.shot && nd.shot.slice(level <= 2 ? 1 : 0).every(v => Number.isInteger(v) && v >= 0 && v <= 4) && (level > 2 || nd.shot[0] == null))) why.push(`an illegal shot ${nd.shot}`);
          return t1;
        };
        // Random branches.
        for (let w = 0; w < 25; w++) {
          let nd = st.root, depth = 0;
          while (nd.outcomes.length && depth < 40) { check(nd); const t1 = Date.now(); nd = nd.outcomes[rnd.number(nd.outcomes.length - 1)].next(); bench.slowest = Math.max(bench.slowest, Date.now() - t1); depth++; }
          if (nd.crossed < st.sure) why.push(`a branch gets ${nd.crossed} across`);
          bench.walks++;
        }
        // The branch a whole rule makes, for the rule dealt and for rules of
        // the kind the player allows, each move judged here and answered by
        // the puzzle, which must agree.
        const Hs = S.zbNetStructures(level, knows), untied = level >= 3 && knows === 'form';
        for (let w = 0; w < 7; w++) {
          const h = Hs[rnd.number(Hs.length - 1)];
          const truth = w === 0 ? d.state.rule : ruleOf(level, h, perms[rnd.number(119)], perms[rnd.number(119)], untied ? perms[rnd.number(119)] : null);
          const state = w === 0 ? d.state : { rule: truth };
          let nd = st.root;
          while (nd.outcomes.length) {
            check(nd);
            const k = nd.outcomes.findIndex(o => o.cell === S.zbNetLands(truth, nd.shot.map(v => v ?? 0)));
            if (k < 0) { why.push('a rule lands a mudball where the strategy has no outcome'); break; }
            if (P.answer(level, band, state, nd) !== k) { why.push(`the puzzle answers ${nd.move} with outcome ${P.answer(level, band, state, nd)}, the check with ${k}`); break; }
            nd = nd.outcomes[k].next();
          }
          if (nd.crossed < st.sure) why.push(`the rule's branch gets ${nd.crossed} across`);
          const end = S.zbStrategyPlay(P, level, band, state, st);
          if (!end) why.push('played against the rule, the game\'s answer to a move is not among the strategy\'s outcomes');
          else if (end.crossed < st.sure) why.push(`played against the rule, ${end.crossed} across, fewer than the ${st.sure} sure`);
          else bench.played++;
          bench.followed++;
        }
      }
      if (why.length && bad++ < 3) fail(`workbench, level ${level}, ${band.length} Zoombinis, seed ${seed}: ${[...new Set(why)].join('; ')}`);
    }
  }
  {
    const band = bands(1, 99, [9])[0].band, d = P.deal(3, band, S.zbRandom(3), {});
    const v = valuesOf(P.form(3, band, d.state));
    let caught = 0;
    for (const bad of [{ mark2: v.mark1 }, { rowOrder: [0, 0, 1, 2, 3] }, { way: 9 }, { mark1: 125 }]) { try { P.edit(3, band, d.state, { ...v, ...bad }); } catch (e) { caught++; } }
    const d2 = P.deal(2, band, S.zbRandom(3), {}), v2 = valuesOf(P.form(2, band, d2.state));
    for (const bad of [{ step: 4 }, { rows: 'size' }]) { try { P.edit(2, band, d2.state, { ...v2, ...bad }); } catch (e) { caught++; } }
    if (caught !== 6) fail(`the form takes ${6 - caught} impossible walls`);
  }
  if (bench.slowest > 500) fail(`a strategy step took ${bench.slowest} ms`);

  say(`names, ways and tank as ScummVM's (the program keeps no table of this rule); ${dealt} deals over bands of 16 to 1: groups, tank and orders of each level as the program's, `
    + `workbench: ${bench.trips} forms given back, ${bench.solved} solved, the strategy's proof held for ${bench.lemma} whole rules (every one the program can deal at levels 1 to 3), ${bench.walks} random branches and ${bench.followed} rules' branches (the dealt one among them) all taking the whole band, the puzzle's answer the check's at every move and ${bench.played} played to the end, slowest step ${bench.slowest} ms; `
    + `every mudball on its own section, the answer's mudball on each of ${landed} marks`);
}
