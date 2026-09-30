// Pizza Pass (js/zb-puzzle-pizza.js) against ScummVM's puzzle_pizza.cpp
// and .h and the 1996 program:
//
//   - each level's slots, threshold, minimum, forgiven meals and trolls are
//     ScummVM's setDifficultyParams, read from its text, and the installed
//     ZOOMBINI.EXE sets the same, a run of word stores per level;
//   - the toppings' order and which go on the sundae are ScummVM's
//     MealIngredient, and level 2 leaves out the slot ScummVM does;
//   - the judging is classifySubmittedMeal's, case by case, and the
//     chances are debugGetChances' _initialMistakeAllowance;
//   - level 2's coin, the ties in the sharing out, the troll who gives two
//     toppings to level 4's pit and the order of its meals are ScummVM's,
//     read from distributeToppings and createLevel4RejectExamples, and the
//     port, dealt from numbers chosen to reach each of them, settles them
//     so;
//   - over bands of 16, 11, 5 and 1 at each level: the toppings dealt are
//     the machine's, at least the minimum; no topping is wanted by two
//     trolls; at levels 3 and 4 every troll wants something; each troll's
//     own meal is eaten by that troll and no other, and any other meal by
//     no one; level 4's pit meals pair two toppings of the troll who wants
//     the most with one of each other's, and no one eats them; the deal
//     does not depend on the band;
//   - the workbench: the form gives back the wishes it shows and turns
//     away wishes the program could not deal; the solution feeds each
//     troll its own meal as the port's judge serves it; and the strategy,
//     played against every hypothesis at levels 1 and 2 and hundreds at 3
//     and 4 (with the pit known and not), the trolls' reactions worked out
//     by zbPizzaJudge, never serves a meal twice or off the machine and
//     never gets fewer across than it says are sure; level 1's every
//     branch walked; within its time.
export default function check({ S, fail, say, scumm, exe, need, bands }) {
  const h = scumm('zoombini_pages/puzzle_pizza.h'), cpp = scumm('zoombini_pages/puzzle_pizza.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('PIZZA'), L = S.ZB_PIZZA_LEVELS;

  // ---- the levels' numbers ---------------------------------------------
  const params = need(/void ZoombiniPuzzlePizza::setDifficultyParams\(\) \{([\s\S]*?)\n\}/, cpp, 'setDifficultyParams')[1];
  const arr = name => need(new RegExp(`${name}\\[4\\] = \\{([\\d, ]+)\\};`), params, name)[1].split(',').map(Number);
  const scummLevels = { slots: arr('kSlots'), minimum: arr('kTarget'), threshold: arr('kThreshold'), forgiven: arr('kMistakeAllowance') };
  for (const k of Object.keys(scummLevels)) if (!same(scummLevels[k], L.map(l => l[k]))) fail(`the levels' ${k} are ${L.map(l => l[k])}, ScummVM's ${scummLevels[k]}`);
  need(/_machineToppingSlotCount = kSlots\[_difficultyLevel - 1\];[\s\S]*_initialMistakeAllowance = kMistakeAllowance\[_difficultyLevel - 1\];/, params, 'how the level picks its numbers');
  const from = troll => Number(need(new RegExp(`if \\(kPuzzleLevel(\\d) <= _difficultyLevel\\)\\s*_trollOrderStates\\[TrollOrderLine::k${troll}\\d\\d\\] = TrollOrderState::kActive01;`), params, `when ${troll} comes`)[1]);
  const trolls = [1, 2, 3, 4].map(l => 1 + (l >= from('Willa')) + (l >= from('Shyler')));
  if (!same(trolls, L.map(l => l.trolls))) fail(`the levels have ${L.map(l => l.trolls)} trolls, ScummVM ${trolls}`);

  // ---- the toppings ----------------------------------------------------
  const kinds = [...h.matchAll(/\/\*\* ([^*]*?) on the (pizza|sundae)\. \*\/\s*kMealIngredient([A-Za-z]+)\d\d = (\d+)/g)]
    .map(m => ({ word: m[3].toLowerCase(), on: m[2], slot: Number(m[4]) }));
  if (kinds.length !== 8 || kinds.some((k, i) => k.slot !== i)) fail(`read ${kinds.length} toppings from ScummVM's MealIngredient, not eight in order`);
  kinds.forEach((k, i) => {
    const mine = S.ZB_PIZZA_TOPPINGS[i].replace(/^an? /, '').replace(/ /g, '');
    if (!mine.endsWith(k.word)) fail(`topping ${i} is "${S.ZB_PIZZA_TOPPINGS[i]}", ScummVM's ${k.word}`);
    if ((k.on === 'sundae') !== (i >= S.ZB_PIZZA_SUNDAE_FROM)) fail(`topping ${i} goes on the ${k.on} in ScummVM`);
  });
  const gen = need(/void ZoombiniPuzzlePizza::generateToppingSet\(\) \{([\s\S]*?)\n\}/, cpp, 'generateToppingSet')[1];
  const leftOut = need(/forbiddenSlot = \(_difficultyLevel == kPuzzleLevel(\d)\) \? (\d+) : -1;/, gen, 'the slot left out');
  if (Number(leftOut[1]) !== 2 || Number(leftOut[2]) !== S.ZB_PIZZA_L2_LEFT_OUT) fail(`ScummVM leaves out slot ${leftOut[2]} at level ${leftOut[1]}`);
  need(/if \(_vm->_rnd->getRandomNumber\(1000\) < _toppingGenerationThreshold\) \{\s*if \(!_generatedToppings\[i\] && i != forbiddenSlot\)/, gen, 'the draw for each slot');
  need(/\} while \(0 < remaining\);/, gen, 'the rounds');

  // ---- the sharing out -------------------------------------------------
  const dist = need(/void ZoombiniPuzzlePizza::distributeToppings\(\) \{([\s\S]*?)\n\}/, cpp, 'distributeToppings')[1];
  need(/if \(!_vm->_rnd->getRandomBool\(\)\) \{\s*_arnoToppings\[i\] = true;/, dist, 'level 2\'s coin toss');
  need(/int16 category = _vm->_rnd->getRandomNumber\(0, 2\);\s*switch \(category\) \{\s*case 0:\s*_arnoToppings\[i\] = true;[\s\S]*?case 1:\s*_willaToppings\[i\] = true;/, dist, 'levels 3 and 4\'s share');
  const ties = [...dist.matchAll(/if \((\w+)ToppingCount <= (\w+)ToppingCount\) \{\s*do \{\s*slot = [^;]+;\s*\} while \(!_(\w+)Toppings\[slot\]\);/g)].map(m => [m[1], m[2], m[3]]);
  if (!same(ties, [['willa', 'shyler', 'shyler'], ['arno', 'shyler', 'shyler'], ['arno', 'willa', 'willa']])) fail(`the ties in the sharing out read ${JSON.stringify(ties)}`);
  need(/\{dominantOrderToppingA, otherOrderToppingA\},\s*\{dominantOrderToppingB, otherOrderToppingA\},\s*\{dominantOrderToppingB, otherOrderToppingB\},\s*\{dominantOrderToppingA, otherOrderToppingB\},/, cpp, 'the four pit meals');
  need(/TrollOrderLine dominantOrderLine = TrollOrderLine::kArno00;\s*if \(willaToppingCount <= arnoToppingCount\) \{\s*if \(arnoToppingCount < shylerToppingCount\)/, dist, 'the troll who wants the most');

  // The same, played out: the port dealt from numbers chosen to reach each
  // coin toss and tie, which it must settle as ScummVM's text does. After
  // the numbers given, it counts up, so a loop looking for a slot ends.
  const scripted = values => {
    let i = 0, k = 0;
    const next = m => (i < values.length ? values[i++] : k++) % (m + 1);
    return { number: m => m ? next(m) : 0, range: (a, b) => b > a ? a + next(b - a) : a, bool: () => next(1) !== 0 };
  };
  const trollOf = { arno: 0, willa: 1, shyler: 2 };
  const wantsOf = s => [s.arnoToppings, s.willaToppings, s.shylerToppings];
  const coin = wantsOf(S.zbPizzaDeal(2, scripted([0, 0, 0, 900, 900, 900, 900, 0, 1, 0])));
  if (!same(coin.slice(0, 2), [[0, 2], [1]])) fail(`level 2's coin: heads should be Willa's, as getRandomBool is; the port shares out ${JSON.stringify(coin)}`);
  // Six of seven dealt, three each to the two trolls not left out, then the
  // one left out takes from the other two, level on count.
  ties.forEach(([a, b, from], k) => {
    const empty = k, [x, y] = [0, 1, 2].filter(t => t !== empty), fromT = trollOf[from];
    if (![trollOf[a], trollOf[b]].includes(fromT) || trollOf[a] === empty || trollOf[b] === empty) { fail(`the ties read ${JSON.stringify(ties)}`); return; }
    const share = [x, x, x, y, y, y];
    const giverSlot = share.indexOf(fromT), otherSlot = share.indexOf(fromT === x ? y : x);
    const s = S.zbPizzaDeal(3, scripted([0, 0, 0, 0, 0, 0, 1000, ...share, otherSlot, giverSlot]));
    if (!same(wantsOf(s)[empty], [giverSlot])) fail(`${S.ZB_PIZZA_TROLLS[empty]}, left wanting nothing with the other two level, should take from ${from}; the port shares out ${JSON.stringify(wantsOf(s))}`);
  });
  const pit = S.zbPizzaDeal(4, scripted([0, 0, 0, 0, 0, 0, 1000, 1000, 0, 0, 1, 1, 2, 2, 0, 0, 1, 2, 4])).rejectExamples;
  if (!same(pit, [[0, 2], [1, 2], [1, 4], [0, 4]])) fail(`with two toppings each, Arno should give two to the pit; the port's pit is ${JSON.stringify(pit)}`);

  // ---- the judging and the chances ---------------------------------------
  const judge = need(/classifySubmittedMeal\(TrollOrderLine orderLine\) const \{([\s\S]*?)\n\}/, cpp, 'classifySubmittedMeal')[1];
  const cls = [...judge.matchAll(/(?:if \(([^)]+)\)\s*)?return SubmittedMealClassification::k\w+?(\d\d);/g)].map(m => [m[1] || '', Number(m[2])]);
  if (!same(cls, [['nonMatching == 1', 0], ['1 < nonMatching', 4], ['orderCount == matching', 2], ['', 1]])) fail(`classifySubmittedMeal reads ${JSON.stringify(cls)}`);
  const cases = [[[0, 2], [0, 2], 2], [[0, 2], [0], 1], [[0, 2], [], 1], [[0, 2], [0, 1], 0], [[0, 2], [1, 3], 4], [[0, 2], [0, 2, 5], 0], [[], [], 2], [[], [4], 0]];
  for (const [wants, meal, want] of cases) if (S.zbPizzaJudge(wants, meal) !== want) fail(`zbPizzaJudge(${wants}, ${meal}) is ${S.zbPizzaJudge(wants, meal)}, ScummVM ${want}`);
  need(/debugGetChances\(\) const \{[\s\S]*?ZmbChanceType::kMistake, _initialMistakeAllowance,/, cpp, 'debugGetChances');
  need(/_remainingMistakeAllowance -= 1;\s*_postmanSurvivedAttempt = 0 <= _remainingMistakeAllowance;/, cpp, 'evaluateDelivery');
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  P.levels.forEach((l, i) => { if (!l.chances.toLowerCase().includes(words[L[i].forgiven])) fail(`level ${i + 1}'s chances do not say ${words[L[i].forgiven]}`); });

  // ---- ZOOMBINI.EXE: each level's numbers, a run of word stores ----------
  // mov word ptr [addr], imm is C7 06 then the address and the value. The
  // program keeps the slots at 896c, the threshold at 896e, the minimum at
  // 8970, the forgiven meals at 8968 and the trolls at 8960, 8962 and 8964.
  const runs = [];
  for (let i = 0; i + 6 <= exe.length; i++) {
    if (exe[i] !== 0xc7 || exe[i + 1] !== 0x06) continue;
    const st = new Map();
    let j = i;
    while (j + 6 <= exe.length && exe[j] === 0xc7 && exe[j + 1] === 0x06) { st.set(exe[j + 2] | exe[j + 3] << 8, exe[j + 4] | exe[j + 5] << 8); j += 6; }
    if ([0x8968, 0x896c, 0x896e, 0x8970].every(a => st.has(a))) runs.push({ at: i, st });
    i = j - 1;
  }
  if (runs.length !== 4) fail(`found ${runs.length} runs of stores of the pizza numbers in ZOOMBINI.EXE, not four`);
  runs.forEach(({ st }, i) => {
    const l = L[i];
    if (!l) return;
    const got = { slots: st.get(0x896c), threshold: st.get(0x896e), minimum: st.get(0x8970), forgiven: st.get(0x8968), trolls: [0x8960, 0x8962, 0x8964].filter(a => st.get(a) === 1).length };
    for (const k of Object.keys(got)) if (got[k] !== l[k]) fail(`ZOOMBINI.EXE gives level ${i + 1} ${k} ${got[k]}, the port ${l[k]}`);
  });

  // ---- deals -------------------------------------------------------------
  let dealt = 0, wantNothing = 0, level2 = 0, allWanted = [0, 0, 0, 0];
  const perLevel = [0, 0, 0, 0];
  for (let level = 1; level <= 4; level++) {
    const buttons = S.zbPizzaSlots(level), l = L[level - 1];
    let bad = null;
    for (const { band, seed } of bands(300, 400 + level, [16, 11, 5, 1])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      const s = d.state;
      const again = P.deal(level, band.slice(0, 1), S.zbRandom(seed), {}).state;
      const wants = [s.arnoToppings, s.willaToppings || [], s.shylerToppings || []].slice(0, l.trolls);
      const all = wants.flat().sort((a, b) => a - b);
      if (!same(s, again)) bad = 'the deal depends on the band';
      else if (s.generatedToppings.some(i => !buttons.includes(i)) || s.generatedToppings.length < l.minimum) bad = `toppings dealt ${s.generatedToppings}, not at least ${l.minimum} of ${buttons}`;
      else if (!same(all, s.generatedToppings)) bad = `the trolls want ${JSON.stringify(wants)}, not the toppings dealt, once each`;
      else if (level >= 3 && wants.some(w => !w.length)) bad = `a troll wants nothing: ${JSON.stringify(wants)}`;
      else if (d.marks.length !== band.length || d.marks.some(m => m !== null)) bad = 'marks that are not null';
      if (bad) { fail(`level ${level}: ${bad}`); break; }
      if (wants.some(w => !w.length)) wantNothing++;
      if (level === 2) level2++;
      if (s.generatedToppings.length === buttons.length) allWanted[level - 1]++;

      // Each troll's own meal is eaten by it; every other meal by no one.
      const hungry = [true, l.trolls >= 2, l.trolls >= 3];
      for (let t = 0; t < l.trolls && !bad; t++) {
        const r = S.zbPizzaServe(s, hungry, wants[t]);
        if (r.eaten !== t) bad = `${S.ZB_PIZZA_TROLLS[t]}'s meal ${wants[t]} is eaten by ${r.eaten}`;
      }
      const rnd = S.zbRandom(seed ^ 0x5a5a);
      for (let k = 0; k < 20 && !bad; k++) {
        const meal = buttons.filter(() => rnd.bool());
        const r = S.zbPizzaServe(s, hungry, meal), owner = wants.findIndex(w => same(w, meal));
        if (r.eaten !== owner) bad = `the meal ${meal} is eaten by ${r.eaten}, not ${owner}`;
        else if (r.eaten < 0 && r.rock !== wants.findIndex((w, t) => hungry[t] && meal.every(i => w.includes(i)))) bad = `the meal ${meal} lands on ${r.rock}'s rock`;
      }
      if (level === 4 && !bad) {
        const count = wants.map(w => w.length);
        const most = count[1] <= count[0] ? (count[0] < count[2] ? 2 : 0) : (count[1] < count[2] ? 2 : 1);
        const whose = i => wants.findIndex(w => w.includes(i));
        const pit = s.rejectExamples || [];
        const mine = new Set(pit.flat().filter(i => whose(i) === most)), others = pit.flat().filter(i => whose(i) !== most);
        if (pit.length !== 4 || new Set(pit.map(m => m.join())).size !== 4) bad = `the pit holds ${JSON.stringify(pit)}, not four different meals`;
        else if (mine.size !== 2 || new Set(others.map(whose)).size !== 2 || pit.some(m => m.length !== 2 || m.filter(i => whose(i) === most).length !== 1)) bad = `the pit's meals ${JSON.stringify(pit)} do not pair two of ${S.ZB_PIZZA_TROLLS[most]}'s toppings with one of each other troll's`;
        else if (pit.some(m => S.zbPizzaServe(s, hungry, m).eaten >= 0 || S.zbPizzaServe(s, hungry, m).rock >= 0)) bad = 'a pit meal is eaten or put on a rock';
      } else if (level < 4 && s.rejectExamples) bad = 'a pit meal below level 4';
      if (bad) { fail(`level ${level}: ${bad}`); break; }
      dealt++;
      perLevel[level - 1]++;
    }
  }
  // ---- the workbench -----------------------------------------------------
  // Round trips of the form; the solution fed as the port's judge feeds
  // it; the strategy played against every hypothesis at levels 1 and 2,
  // and hundreds at 3 and 4, the game's reactions worked out by the port's
  // own judge (zbPizzaJudge), never fewer across than it says are sure.
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  const drawnOnce = (d, n) => same(d.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((x, y) => x - y), [...Array(n).keys()]);
  let trips = 0, solves = 0;
  for (let level = 1; level <= 4; level++) {
    let bad = null;
    for (const { band, seed } of bands(10, 700 + level, [16, 6, 1])) {
      const d = P.deal(level, band, S.zbRandom(seed), {}), v = valuesOf(P.form(level, band, d.state)), again = P.edit(level, band, d.state, v);
      if (!same(valuesOf(P.form(level, band, again)), v) || !same(S.zbPizzaWishes(level, again), S.zbPizzaWishes(level, d.state)) || !same(again.rejectExamples, d.state.rejectExamples)) bad = 'the form does not give back the wishes it shows';
      const sol = P.solve(level, band, d.state), s0 = sol.solutions[0];
      if (!bad && (sol.most !== band.length || !sol.exact || s0.crosses.length !== band.length || !drawnOnce(s0.diagram, band.length))) bad = 'the solution does not take and draw the whole band';
      if (!bad) {
        const hungry = [true, L[level - 1].trolls > 1, L[level - 1].trolls > 2], tried = (d.state.rejectExamples || []).map(m => m.join());
        S.zbPizzaWishes(level, d.state).forEach((w, t) => {
          const r = S.zbPizzaServe(d.state, hungry, w, tried.includes(w.join()));
          if (r.eaten !== t) bad = `${S.ZB_PIZZA_TROLLS[t]}'s meal is not eaten by ${S.ZB_PIZZA_TROLLS[t]} when served in turn`;
          hungry[t] = false; tried.push(w.join());
        });
      }
      if (bad) { fail(`level ${level}: ${bad}`); break; }
      trips++; solves++;
    }
  }
  const band5 = bands(1, 77, [5])[0].band, base4 = P.deal(4, band5, S.zbRandom(4), {}).state;
  const rejects = [[1, { s0: 'Arno', s1: 'nobody', s2: 'nobody', s3: 'nobody', s4: 'nobody' }, 'Arno wanting one topping'],
    [3, { s0: 'Arno', s1: 'Arno', s2: 'Willa', s3: 'Willa', s4: 'nobody', s5: 'nobody', s6: 'nobody' }, 'Shyler wanting nothing'],
    [4, { s0: 'Arno', s1: 'Willa', s2: 'Shyler', s3: 'nobody', s4: 'nobody', s5: 'nobody', s6: 'nobody', s7: 'nobody' }, 'three toppings at level 4'],
    [2, { s0: 'Shyler', s1: 'Arno', s2: 'Arno', s3: 'Willa', s5: 'nobody', s6: 'nobody' }, 'Shyler at level 2']];
  for (const [level, values, what] of rejects) { let threw = false; try { P.edit(level, band5, base4, values); } catch (x) { threw = true; } if (!threw) fail(`the form takes ${what}`); }
  const moved = P.edit(4, band5, base4, { s0: 'Arno', s1: 'Arno', s2: 'Arno', s3: 'Willa', s4: 'Willa', s5: 'Shyler', s6: 'nobody', s7: 'Shyler' });
  if (!same(moved.rejectExamples, [[0, 3], [1, 3], [1, 5], [0, 5]])) fail(`edited wishes at level 4 give the pit ${JSON.stringify(moved.rejectExamples)}`);

  // The strategy, played.
  let played = 0, walkedAll = 0, slowest = 0, slowNext = 0;
  const results = [];
  const plays = [];
  for (let level = 1; level <= 4; level++) for (const knows of ['program', 'form']) plays.push({ level, knows });
  for (const seed of [11, 22]) { const d = S.zbDealAt('PIZZA', 4, seed, 16); plays.push({ level: 4, knows: 'program', state: d.state }, { level: 4, knows: 'form', state: d.state }); }
  for (const c of plays) {
    const { level, knows, state } = c, n = level === 2 ? 3 : 16, band = bands(1, 50 + level, [n])[0].band;
    const t0 = Date.now(), st = P.strategy(level, band, null, { knows, state, budget: 1500 });
    slowest = Math.max(slowest, Date.now() - t0);
    const e = [...S.ZB_PIZZA_ENGINES.values()].find(x => x.level === level && x.knows === knows && same(x.pit, state ? state.rejectExamples.map(m => m.reduce((a, sl) => a | 1 << S.zbPizzaSlots(level).indexOf(sl), 0)).sort((x, y) => x - y) : []));
    if (!e || e.count !== st.hypotheses) { fail(`level ${level} (${knows}): the strategy's hypotheses are not its engine's`); continue; }
    const buttons = S.zbPizzaSlots(level), T = L[level - 1].trolls, pit = state ? state.rejectExamples.map(m => m.join()) : [];
    const next = o => { if (!o.node) { const t1 = Date.now(); o.node = o.next(); slowNext = Math.max(slowNext, Date.now() - t1); } return o.node; };
    const rnd = S.zbRandom(1000 + level);
    const pickH = e.count <= 800 ? [...Array(e.count).keys()] : Array.from({ length: 300 }, () => rnd.number(e.count - 1));
    let worst = n, bad = null;
    for (const i of pickH) {
      const wish = [0, 1, 2].slice(0, T).map(t => buttons.filter((sl, b) => e.h[i] >> 8 * t + b & 1));
      const hungry = [true, T > 1, T > 2], tried = pit.slice();
      let node = st.root, steps = 0;
      while (node.outcomes.length && !bad) {
        if (++steps > 40) { bad = 'a play of more than 40 meals'; break; }
        const meal = node.meal;
        if (!meal || meal.some(sl => !buttons.includes(sl))) { bad = `a meal not of the machine's toppings: ${node.move}`; break; }
        if (tried.includes(meal.join())) { bad = `a meal served again, or from the pit: ${node.move}`; break; }
        // The game's reactions, by the port's judge.
        const seen = [];
        for (let t = 0; t < T; t++) { if (!hungry[t]) continue; const c = S.zbPizzaJudge(wish[t], meal); seen.push([t, c]); if (c === 2) break; }
        const eaten = seen.length && seen[seen.length - 1][1] === 2 ? seen[seen.length - 1][0] : -1;
        const o = node.outcomes.find(x => x.reactions ? same(x.reactions, seen) : x.eaten === eaten);
        if (!o) { bad = `no branch for what the trolls do (${JSON.stringify(seen)}) after "${node.move}"`; break; }
        if (eaten >= 0) hungry[eaten] = false;
        tried.push(meal.join());
        node = next(o);
      }
      if (bad) break;
      worst = Math.min(worst, node.crossed);
      if (node.crossed < st.sure) { bad = `a play gets ${node.crossed} across where ${st.sure} are said to be sure`; break; }
      played++;
    }
    if (!bad && st.exact && pickH.length === e.count && worst !== st.sure) bad = `said to be exact at ${st.sure} but every play gets ${worst} or more`;
    if (!bad && level === 1) {
      const walk = (nd, depth) => { if (depth > 40) throw new Error('too deep'); if (!nd.outcomes.length) { if (nd.crossed < st.sure) bad = 'a branch short of sure'; return 1; } return nd.outcomes.reduce((t, o) => t + walk(next(o), depth + 1), 0); };
      walkedAll += walk(st.root, 0);
    }
    if (bad) { fail(`level ${level} (${knows}${state ? ', pit known' : ''}): ${bad}`); continue; }
    results.push(`${level}${knows === 'form' ? 'f' : ''}${state ? 'p' : ''}:${st.sure}/${n}${st.exact ? '' : '?'}`);
  }
  if (slowest > 3000) fail(`a strategy took ${slowest} ms, over twice its budget`);
  if (slowNext > 500) fail(`a step of a strategy took ${slowNext} ms`);

  const tail = runs.map(r => '0x' + r.at.toString(16)).join(', ');
  say(`${trips} forms given back and solved; strategies (level, f form, p pit known: sure/band) ${results.join(' ')}, played against ${played} hypotheses (level 1 every branch, ${walkedAll} ends), slowest ${slowest} ms, step ${slowNext} ms; `
    + `levels' numbers and trolls as ScummVM's and ZOOMBINI.EXE's (${tail}); ${dealt} deals: toppings wanted once each, each troll's meal eaten by it alone, `
    + `every topping wanted in ${allWanted.map((n, i) => `${n}/${perLevel[i]}`).join(', ')} by level; level 2 left a troll wanting nothing in ${wantNothing} of ${level2}`);
}
