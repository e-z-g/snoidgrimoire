// The Stone Cold Caves (js/zb-puzzle-tunnels.js) against ScummVM's
// puzzle_tunnels.cpp and .h and the 1996 program:
//
//   - the tables: the order rules are listed in, level 3's value pairs and
//     level 4's pairs of traits are ScummVM's, read from its text; packed as
//     the program packs them, their 22 words are in ZOOMBINI.EXE just
//     before "Tunnels.MHK", and the four entrances' positions, left to
//     right, are there too;
//   - the chances are ScummVM's per level (16, 18, 20, 22) and
//     debugGetChances' 14 + 2 x level;
//   - which entrance takes which Zoombini is evaluateRule's zone table and
//     handleZoombiniPlacement's closed pair at level 1, read from the text
//     and evaluated for every case;
//   - ScummVM lists level 4's rules with the second trait's value changing
//     fastest, the program (and the port) with the first's: the check reads
//     ScummVM's loops to see that this is still so, and counts how often
//     ScummVM's order would deal another rule;
//   - over bands of 16, 11, 5 and 2 at each level, every deal is dealt
//     again here, written out as ScummVM writes it (its counting loops,
//     its random draws in order, the coin and the idle phases first), and
//     must agree; the rule has the level's form, the marks follow it, and
//     at level 1 an Allergic Cliffs count is avoided when it can be;
//   - the workbench: the form gives back what is put in and refuses what
//     no rule of the level's form is; the solution sends each Zoombini
//     where ScummVM's judge (written out here from its text) lets it
//     through, and draws each once; the hypotheses are the deal's
//     candidates (the dealt one among them) or the whole form; the
//     strategy is walked down every branch for small bands and played
//     against dealt rules for large ones, where the feedback is the
//     guardian ScummVM's handleZoombiniPlacement animates (kHoverDataToGateType),
//     the puzzle's answer() picks that outcome at every move and
//     zbStrategyPlay ends where the judge's play does,
//     and no branch gets fewer through than it says are sure; with fewer
//     chances than the game gives, the sure count is held to a plain
//     minimax over every move, written out here, on small bands; and the
//     times are kept.
const KIND = { kTraitHair: 'hair', kTraitEyes: 'eyes', kTraitNose: 'nose', kTraitFeet: 'feet' };

export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_tunnels.h'), cpp = scumm('zoombini_pages/puzzle_tunnels.cpp');
  const page = scumm('zoombini_page.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('TUNNELS');
  const kinds = body => [...body.matchAll(/ZmbTrait::(kTrait\w+)/g)].map(m => KIND[m[1]]);

  // ---- tables, against ScummVM's text --------------------------------------
  const order = kinds(need(/kRuleSlotTraitKinds\[4\] = \{([\s\S]*?)\};/, cpp, 'kRuleSlotTraitKinds')[1]);
  if (!same(order, S.ZB_TUNNELS_ORDER)) fail(`the rules' order is not ScummVM's: ${order}`);
  const pairs = [...need(/kAlternativeValueSetTable\[10\] = \{([\s\S]*?)\};/, cpp, 'kAlternativeValueSetTable')[1]
    .matchAll(/\{(\d+), (\d+)\}/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!same(pairs, S.ZB_TUNNELS_PAIRS)) fail(`level 3's value pairs are not ScummVM's: ${JSON.stringify(pairs)}`);
  const l4 = [...need(/kTraitKindPairs\[6\] = \{([\s\S]*?)\};/, cpp, 'kTraitKindPairs')[1].matchAll(/\{([^{}]*)\}/g)].map(m => kinds(m[1]));
  if (!same(l4, S.ZB_TUNNELS_L4)) fail(`level 4's pairs of traits are not ScummVM's: ${JSON.stringify(l4)}`);

  const sizes = [20, 20, 40, 150];
  for (let level = 1; level <= 4; level++) {
    const rules = S.zbTunnelsRules(level), keys = new Set(rules.map(r => JSON.stringify(r)));
    if (rules.length !== sizes[level - 1] || keys.size !== rules.length) fail(`level ${level} lists ${rules.length} rules (${keys.size} different), not ${sizes[level - 1]}`);
  }
  // ScummVM's pair tables are the rules squared: 400, 1600 and 22500.
  const squares = [Number(need(/const int16 pairCount = (\d+);/, cpp, 'level 2\'s pair count')[1]),
    Number(need(/int pairIdx = 0; pairIdx < (\d+); pairIdx\+\+\) \{\s*int descA = pairIdx \/ 40;/, cpp, 'level 3\'s pair count')[1]),
    Number(need(/int pairIdx = 0; pairIdx < (\d+); pairIdx\+\+\) \{\s*int descAIdx = pairIdx \/ 150;/, cpp, 'level 4\'s pair count')[1])];
  if (!same(squares, [20 * 20, 40 * 40, 150 * 150])) fail(`ScummVM scores ${squares} pairs, not the rules squared`);

  // Level 4's order: ScummVM's loops, second value innermost; the port's first value changes fastest.
  const scummFastSecond = /for \(byte firstTraitValue = 1; firstTraitValue <= 5;[^{]*\{\s*for \(byte secondTraitValue = 1;/.test(cpp);
  const r4 = S.zbTunnelsRules(4);
  const portFastFirst = same(r4[1], [{ kind: 'feet', values: [2] }, { kind: 'nose', values: [1] }]) && same(r4[5], [{ kind: 'feet', values: [1] }, { kind: 'nose', values: [2] }]);
  if (!scummFastSecond) fail('ScummVM no longer lists level 4 with the second trait fastest; see whether it now follows the program');
  if (!portFastFirst) fail('the port does not list level 4 with the first trait fastest, as the program does');
  // ScummVM's order, for the count below.
  const scumm4 = [];
  for (const [a, b] of S.ZB_TUNNELS_L4) for (let v = 1; v <= 5; v++) for (let w = 1; w <= 5; w++) scumm4.push([{ kind: a, values: [v] }, { kind: b, values: [w] }]);

  // ---- the chances ----------------------------------------------------------
  const target = need(/switch \(_difficultyLevel\) \{\s*case kPuzzleLevel2:\s*perLevelTarget = (\d+);\s*break;\s*case kPuzzleLevel3:\s*perLevelTarget = (\d+);\s*break;\s*case kPuzzleLevel4:\s*perLevelTarget = (\d+);\s*break;\s*default:\s*perLevelTarget = (\d+);/, cpp, 'perLevelTarget');
  const chances = [target[4], target[1], target[2], target[3]].map(Number);
  const [base, per] = need(/opportunities = static_cast<int16>\((\d+) \+ (\d+) \* _difficultyLevel\);/, cpp, 'debugGetChances').slice(1).map(Number);
  if (!same(chances, S.ZB_TUNNELS_CHANCES) || chances.some((c, i) => c !== base + per * (i + 1))) fail(`the chances are ${S.ZB_TUNNELS_CHANCES}, ScummVM ${chances} and ${base} + ${per} x level`);
  const words = ['Sixteen', 'Eighteen', 'Twenty', 'Twenty-two'];
  P.levels.forEach((l, i) => { if (!l.chances.startsWith(words[i] + ' ')) fail(`level ${i + 1}'s chances do not say ${words[i]}`); });

  // ---- which entrance takes whom --------------------------------------------
  // evaluateRule with two guards: the expression each zone accepts on.
  const zone = [1, 2, 3, 4].map(z => need(new RegExp(`case ${z}:\\s*guardSideMatch = !?guardAMatch;\\s*result = ([^;]+);`), cpp, `evaluateRule's zone ${z}`)[1]);
  zone[0] = need(/\? \(([^)]+)\) : guardAMatch/, zone[0], 'zone 1 with two guards')[1];
  const js = e => new Function('guardAMatch', 'guardBMatch', `return ${e};`);
  const accepts = zone.map(js);
  const oneGuard = need(/if \(_guardAxisCount == 1\) \{[\s\S]*?bool result = dropZone <= (\d) \? guardAMatch : !guardAMatch;/, cpp, 'evaluateRule with one guard')[1];
  const closed = need(/if \(_level1BlockedPairToggle\) \{\s*if \(zone == (\d) \|\| zone == (\d)\)\s*isRejection = true;\s*\} else \{\s*if \(zone == (\d) \|\| zone == (\d)\)/, cpp, 'the level 1 closed pair').slice(1).map(Number);
  let cases = 0;
  for (const sideA of [false, true]) for (const sideB of [false, true]) for (const feet of [1, 2]) for (const hair of [1, 2]) {
    // Guard A wants sneakers and guard B shaggy hair; the Zoombini has either or not.
    const guards = [{ rule: [{ kind: 'feet', values: [1] }], traitMatchOnPrimarySide: sideA }, { rule: [{ kind: 'hair', values: [1] }], traitMatchOnPrimarySide: sideB }];
    const z = { hair, eyes: 1, nose: 1, feet };
    const A = (feet === 1) === sideA, B = (hair === 1) === sideB;
    const want = accepts.map(f => f(A, B)).indexOf(true);
    if (accepts.filter(f => f(A, B)).length !== 1 || S.zbTunnelsEntrance(z, guards, false) !== want) fail(`two guards: A ${A}, B ${B}: ScummVM's zone ${want + 1}, the port's ${S.zbTunnelsEntrance(z, guards, false) + 1}`);
    for (const toggle of [false, true]) {
      const shut = toggle ? closed.slice(0, 2) : closed.slice(2);
      const open = [1, 2, 3, 4].filter(k => !shut.includes(k) && (k <= Number(oneGuard) ? A : !A));
      const got = S.zbTunnelsEntrance(z, guards.slice(0, 1), toggle) + 1;
      if (open.length !== 1 || got !== open[0]) fail(`one guard, A ${A}, closed ${shut}: ScummVM's open zone ${open}, the port's ${got}`);
    }
    cases++;
  }

  // ---- the draws before the rule ----------------------------------------------
  need(/_level1BlockedPairToggle = _vm->_rnd->getRandomBool\(\);/, need(/void ZoombiniPuzzleTunnels::initStates\(\) \{([\s\S]*?)\n\}/, cpp, 'initStates')[1], 'the coin in initStates');
  need(/idleTickCounter = static_cast<uint8>\(_vm->_rnd->getRandomNumber\(0, 64\)\);/, page, 'the idle phase in loadSnoidsFromPack');
  const load = need(/void ZoombiniPuzzleTunnels::loadFeatures\(\) \{([\s\S]*?)\n\}/, cpp, 'loadFeatures')[1];
  if (!(load.indexOf('loadZoombinisFromPack()') >= 0 && load.indexOf('loadZoombinisFromPack()') < load.indexOf('generateRules()'))) fail('ScummVM no longer loads the band before dealing the rule');
  need(/checkVal \+= searchDelta;\s*searchDelta = -\(searchDelta \+ 1\);/, cpp, 'the level 1 search\'s step');
  need(/hasAlternateSplit = matchCounts\[slot\] != 0 &&\s*matchCounts\[slot\] != excludedSplitCount;/, cpp, 'the Allergic Cliffs\' count left out');

  // ---- ZOOMBINI.EXE -----------------------------------------------------------
  // Level 3's pairs as (second << 4 | first), then level 4's first and second traits' unit bytes.
  const unit = k => 1 << 8 * S.ZB_TUNNELS_ORDER.indexOf(k);
  const table = [...S.ZB_TUNNELS_PAIRS.map(([a, b]) => b << 4 | a), ...S.ZB_TUNNELS_L4.map(p => unit(p[0])), ...S.ZB_TUNNELS_L4.map(p => unit(p[1]))];
  const bytes = table.flatMap(w => [w & 255, w >> 8 & 255, w >> 16 & 255, w >>> 24]);
  const latin = (o, n) => new TextDecoder('latin1').decode(exe.subarray(o, o + n));
  const at = find(exe, bytes).filter(o => latin(o + bytes.length, 11) === 'Tunnels.MHK');
  if (at.length !== 1) fail('the 22 words of levels 3 and 4 are not in ZOOMBINI.EXE before "Tunnels.MHK"');
  const pos = [...need(/kTunnelEntryPositions\[4\]\{([\s\S]*?)\};/, h, 'kTunnelEntryPositions')[1].matchAll(/Common::Point\((\d+), (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (pos.length !== 4 || pos.some((p, i) => i && p[0] <= pos[i - 1][0])) fail(`the entrances are not left to right: ${JSON.stringify(pos)}`);
  const posAt = find(exe, pos.flatMap(([x, y]) => [x & 255, x >> 8, y & 255, y >> 8]));
  if (posAt.length !== 1) fail(`the entrances' positions are in ZOOMBINI.EXE ${posAt.length} times, not once`);

  // ---- deals, dealt again as ScummVM writes them -------------------------------
  // Its descriptors' matching (matchLevel2/3/4Descriptor) and its pair scoring, written out.
  const matchOne = (z, rule) => rule.some(r => r.values.some(v => z[r.kind] === v));
  const scummPair = (rules, band, rnd) => {
    const n = rules.length, N = n * n;
    const both = new Int16Array(N), aOnly = new Int16Array(N), bOnly = new Int16Array(N), neither = new Int16Array(N);
    for (const z of band) {
      const m = rules.map(r => matchOne(z, r));
      for (let p = 0; p < N; p++) {
        const a = Math.floor(p / n), b = p % n;
        if (a === b) continue;
        if (m[a] && m[b]) both[p]++; else if (m[a]) aOnly[p]++; else if (m[b]) bOnly[p]++; else neither[p]++;
      }
    }
    const div = p => (both[p] > 0) + (aOnly[p] > 0) + (bOnly[p] > 0) + (neither[p] > 0);
    let best = 0;
    for (let p = 0; p < N; p++) best = Math.max(best, div(p));
    const score = new Int16Array(N).fill(-1);
    for (let p = 0; p < N; p++) {
      if (div(p) < best) continue;
      const [a, b, c, d] = [both[p], aOnly[p], bOnly[p], neither[p]];
      score[p] = Math.abs(a - b) + Math.abs(a - c) + Math.abs(a - d) + Math.abs(b - c) + Math.abs(b - d) + Math.abs(c - d);
    }
    let min = 32000, count = 0;
    for (let p = 0; p < N; p++) if (score[p] >= 0 && score[p] < min) min = score[p];
    for (let p = 0; p < N; p++) if (score[p] === min) count++;
    let sel = rnd.range(1, count), chosen = 0;
    for (let p = 0; p < N; p++) if (score[p] === min && --sel === 0) { chosen = p; break; }
    return [rules[Math.floor(chosen / n)], rules[chosen % n]];
  };
  const tries = n => { const out = []; for (let t = Math.trunc(n / 2), s = 1; t > -40; t += s, s = -(s + 1)) out.push(t); return out; };
  let dealt = 0, avoided = 0, other4 = 0, dealt4 = 0;
  for (let level = 1; level <= 4; level++) {
    const n = level === 4 ? 150 : 300;
    for (const { band, seed } of bands(n, 200 + level, [16, 11, 5, 2])) {
      const journey = {};
      const d = P.deal(level, band, S.zbRandom(seed), journey);
      if (Object.keys(journey).length) { fail(`level ${level}: the deal changed the journey`); break; }
      if (d.state.stuck) continue;
      const rnd = S.zbRandom(seed);
      const toggle = rnd.bool();
      for (const _ of band) rnd.range(0, 64);
      let guards;
      if (level === 1) {
        const rules = S.zbTunnelsRules(1);
        const counts = rules.map(r => band.filter(z => matchOne(z, r)).length);
        const count = tries(band.length).find(t => t > 0 && t < 16 && counts.includes(t));
        const cands = rules.filter((r, i) => counts[i] === count);
        guards = [{ rule: cands[rnd.range(1, cands.length) - 1], traitMatchOnPrimarySide: rnd.bool() }];
        if (d.state.matchCount !== count || band.filter(z => matchOne(z, guards[0].rule)).length !== count) { fail(`level 1: the deal splits ${d.state.matchCount}, the search stops at ${count}`); break; }
        // Again with that count left from the Allergic Cliffs: another count, if the band has one.
        const other = counts.some(c => c && c !== count);
        const e = P.deal(1, band, S.zbRandom(seed), { bridgeSplit: count });
        if (other ? e.state.matchCount === count : e.state.matchCount !== count) { fail(`level 1: with ${count} left from the Allergic Cliffs the deal splits ${e.state.matchCount}`); break; }
        if (other) avoided++;
      } else {
        const rules = S.zbTunnelsRules(level);
        const pair = scummPair(rules, band, rnd);
        guards = pair.map(rule => ({ rule, traitMatchOnPrimarySide: rnd.bool() }));
        if (level === 4) {
          const alt = S.zbRandom(seed);
          alt.bool();
          for (const _ of band) alt.range(0, 64);
          if (!same(scummPair(scumm4, band, alt), pair)) other4++;
          dealt4++;
        }
      }
      if (!same(d.state.guardRules, guards) || d.state.level1BlockedPairToggle !== toggle) { fail(`level ${level}: dealt ${JSON.stringify(d.state.guardRules)}, ScummVM's way ${JSON.stringify(guards)}`); break; }
      // One guard at level 1, two after; a guard's rule one trait value, one trait with two (level 3), or two traits' values (level 4).
      const bad = g => g.rule.length !== (level === 4 ? 2 : 1) || g.rule.some(r => r.values.length !== (level === 3 ? 2 : 1) || new Set(r.values).size !== r.values.length)
        || (level === 4 && g.rule[0].kind === g.rule[1].kind);
      if (guards.length !== (level === 1 ? 1 : 2) || guards.some(bad)) { fail(`level ${level}: a rule of the wrong form, ${JSON.stringify(guards)}`); break; }
      // The marks, from ScummVM's zone table.
      const zoneOf = z => {
        const A = matchOne(z, guards[0].rule) === guards[0].traitMatchOnPrimarySide;
        if (level === 1) {
          const shut = toggle ? closed.slice(0, 2) : closed.slice(2);
          return [1, 2, 3, 4].find(k => !shut.includes(k) && (k <= Number(oneGuard) ? A : !A));
        }
        const B = matchOne(z, guards[1].rule) === guards[1].traitMatchOnPrimarySide;
        return accepts.findIndex(f => f(A, B)) + 1;
      };
      if (d.marks.some((m, i) => m !== `${S.ZB_TUNNELS_ENTRANCES[zoneOf(band[i]) - 1]} tunnel`)) { fail(`level ${level}: the marks do not follow the guards`); break; }
      if (d.state.remainingRejectChances !== chances[level - 1]) { fail(`level ${level}: ${d.state.remainingRejectChances} chances`); break; }
      dealt++;
    }
  }
  // ---- the workbench ------------------------------------------------------
  // The feedback: hoverData from the zone and whether the side guardian
  // lets it by, and the guardian its gate type animates on a turning back.
  const hover = [1, 2, 3, 4].map(z => need(new RegExp(`case ${z}:\\s*hoverData = guardAMatch \\? (\\d) : (\\d);`), cpp, `hoverData for zone ${z}`).slice(1).map(Number));
  const gateType = [...need(/kHoverDataToGateType\[8\]\{([\s\S]*?)\};/, h, 'kHoverDataToGateType')[1].matchAll(/(\d+)/g)].map(m => Number(m[1]));
  const GUARD = ['left', 'upper', 'lower', 'right'];
  // ScummVM's judging of Zoombini z sent into tunnel t (0-3): null when it goes through, else the guardian who turns it back.
  const judgeOf = (level, guards, toggle, z, t) => {
    const A = matchOne(z, guards[0].rule) === guards[0].traitMatchOnPrimarySide, zoneNo = t + 1;
    let ok, side;
    if (level === 1) {
      ok = zoneNo <= Number(oneGuard) ? A : !A;
      side = ok;
      if (ok && (toggle ? closed.slice(0, 2) : closed.slice(2)).includes(zoneNo)) ok = false;
    } else {
      const B = matchOne(z, guards[1].rule) === guards[1].traitMatchOnPrimarySide;
      ok = accepts[t](A, B);
      side = zoneNo <= 2 ? A : !A;
    }
    return ok ? null : GUARD[gateType[hover[t][side ? 0 : 1]]];
  };
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  let trips = 0, walked = 0, played = 0, answered = 0, ends = 0, brute = 0, slowRoot = 0, slowNext = 0;
  const timedNext = o => { const t0 = Date.now(); const nd = o.next(); slowNext = Math.max(slowNext, Date.now() - t0); return nd; };
  const nodeOk = (band, nd) => {
    const zs = nd.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
    if (zs.join() !== band.map((_, i) => i).join()) return 'a diagram does not draw each Zoombini once';
    if (nd.outcomes.length && (nd.zoombini == null || nd.where[nd.zoombini] >= 0 || !(nd.tunnel >= 0 && nd.tunnel < 4) || nd.move !== `Send Zoombini ${nd.zoombini + 1} into the ${S.ZB_TUNNELS_ENTRANCES[nd.tunnel]} tunnel.`)) return `a move is not one the game allows: ${nd.move}`;
    return null;
  };
  const walk = (band, nd, depth) => {
    const bad = nodeOk(band, nd);
    if (bad) throw new Error(bad);
    if (!nd.outcomes.length) { ends++; return nd.crossed; }
    if (depth > 60) throw new Error('a strategy deeper than 60 moves');
    return Math.min(...nd.outcomes.map(o => walk(band, timedNext(o), depth + 1)));
  };
  // Play a strategy against a hidden part: follow the feedback the judge
  // gives, the puzzle's answer() picking the same outcome at every move;
  // then zbStrategyPlay, answer() alone, must end where the judge did.
  const play = (level, band, st, state) => {
    const guards = state.guardRules, toggle = state.level1BlockedPairToggle;
    let nd = st.root;
    for (let steps = 0; nd.outcomes.length; steps++) {
      const bad = nodeOk(band, nd);
      if (bad) throw new Error(bad);
      const who = judgeOf(level, guards, toggle, band[nd.zoombini], nd.tunnel);
      const k = nd.outcomes.findIndex(o => who == null ? /^It goes through/.test(o.label) : o.label.startsWith(`The ${who} guardian turns it back`));
      if (k < 0) throw new Error(`the game's feedback (${who || 'through'}) for "${nd.move}" is not among the strategy's outcomes`);
      const a = P.answer(level, band, state, nd);
      if (a !== k) throw new Error(`for "${nd.move}" the puzzle's answer is outcome ${a}, the judge's ${k} (${who || 'through'})`);
      nd = timedNext(nd.outcomes[k]);
      if (steps > 60) throw new Error('a strategy deeper than 60 moves');
    }
    const real = band.map(z => S.zbTunnelsEntrance(z, guards, toggle));
    if (nd.where.some((t, i) => t >= 0 && t !== real[i])) throw new Error('a strategy put a Zoombini through a tunnel that would not take it');
    const end = S.zbStrategyPlay(P, level, band, state, st);
    if (!end || end.crossed !== nd.crossed || !same(end.where, nd.where)) throw new Error(`zbStrategyPlay ends ${end ? `with ${end.crossed} through` : 'with no answer'}, the judge's play with ${nd.crossed}`);
    if (end.crossed < st.sure) throw new Error(`zbStrategyPlay gets ${end.crossed} through, fewer than the ${st.sure} sure`);
    answered++;
    return nd.crossed;
  };
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(10, 500 + level, [16, 9, 4, 12, 6])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      if (d.state.stuck) continue;
      // Round trip, and the edited state the dealt one.
      const form = P.form(level, band, d.state), again = P.edit(level, band, d.state, valuesOf(form));
      if (!same(valuesOf(P.form(level, band, again)), valuesOf(form)) || !same(again.guardRules, d.state.guardRules) || (level === 1 && again.level1BlockedPairToggle !== d.state.level1BlockedPairToggle)) { fail(`level ${level}: the form does not give back the rules it shows`); break; }
      trips++;
      // The solution, judged.
      const sol = P.solve(level, band, d.state);
      const s0 = sol.solutions[0], through = [];
      for (let k = 0; k < 4; k++) {
        const m = s0.steps.find(x => x.startsWith(`Into the ${S.ZB_TUNNELS_ENTRANCES[k]} tunnel`));
        if (m) for (const i of m.split(': ')[1].replace(/\.$/, '').split(/, | and /).map(x => Number(x) - 1)) {
          if (judgeOf(level, d.state.guardRules, d.state.level1BlockedPairToggle, band[i], k) != null) { fail(`level ${level}: the solution sends Zoombini ${i + 1} into a tunnel that turns it back`); break; }
          through.push(i);
        }
      }
      if (sol.most !== band.length || !sol.exact || through.length !== band.length || s0.crosses.length !== band.length) { fail(`level ${level}: the solution does not take the whole band through`); break; }
      const zs = s0.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
      if (zs.join() !== band.map((_, i) => i).join()) { fail(`level ${level}: the solution's diagram does not draw each Zoombini once`); break; }
      // The hypotheses: the deal's candidates, and the dealt one among them.
      const H = S.zbTunnelsHypotheses(level, band, 'program');
      const total = [...H.values()].reduce((a, b) => a + b, 0), form4 = [80, 1520, 6240, 89400][level - 1];
      const dk = S.zbTunnelsKey(...[0, 1].map(bit => band.reduce((m, z, i) => { const t = S.zbTunnelsEntrance(z, d.state.guardRules, d.state.level1BlockedPairToggle); return (bit ? t === 0 || t === 3 : t < 2) ? m | 1 << i : m; }, 0)));
      if (total !== d.state.candidates * (level === 1 ? 4 : 4) || !H.has(dk)) { fail(`level ${level}: the program's hypotheses (${total}) are not the deal's ${d.state.candidates} candidates each way, with the dealt one`); break; }
      // The strategy, both ways.
      for (const knows of ['program', 'form']) {
        const t0 = Date.now(), st = P.strategy(level, band, null, { knows });
        slowRoot = Math.max(slowRoot, Date.now() - t0);
        if (knows === 'form' && st.hypotheses !== form4) { fail(`level ${level}: the form has ${st.hypotheses} hypotheses, not ${form4}`); break; }
        try {
          if (band.length <= 6 && (knows === 'program' || level <= 2)) {
            const worst = walk(band, st.root, 0);
            if (worst < st.sure || (st.exact && worst !== st.sure)) { fail(`level ${level}, knowing the ${knows}: the strategy says ${st.sure} are sure, and its worst branch gets ${worst} through`); break; }
            walked++;
          }
          const got = play(level, band, st, d.state);
          if (got < st.sure) { fail(`level ${level}, knowing the ${knows}: played against the dealt rules, ${got} through, fewer than the ${st.sure} sure`); break; }
          played++;
        } catch (e) { fail(`level ${level}, knowing the ${knows}: ${e.message}`); break; }
      }
    }
  }
  // Level 1 after the Allergic Cliffs: the count they left, read from the dealt state, rules out what the program avoids.
  let splits = 0;
  for (const { band, seed } of bands(40, 950, [16, 11, 7])) {
    const counts = S.zbTunnelsRules(1).map(r => band.filter(z => matchOne(z, r)).length);
    const journey = { bridgeSplit: counts.find(c => c > 0 && c < band.length) };
    const d = P.deal(1, band, S.zbRandom(seed), journey);
    if (d.state.stuck) continue;
    const st = P.strategy(1, band, null, { state: d.state });
    const H = S.zbTunnelsHypotheses(1, band, 'program', d.state.bridgeSplit || 0);
    const dk = S.zbTunnelsKey(...[0, 1].map(bit => band.reduce((m, z, i) => { const t = S.zbTunnelsEntrance(z, d.state.guardRules, d.state.level1BlockedPairToggle); return (bit ? t === 0 || t === 3 : t < 2) ? m | 1 << i : m; }, 0)));
    if (st.hypotheses !== d.state.candidates * 4 || !H.has(dk)) { fail(`level 1 after the cliffs: ${st.hypotheses} hypotheses, the deal's ${d.state.candidates} candidates each way, the dealt one ${H.has(dk) ? '' : 'not '}among them`); break; }
    try { if (play(1, band, st, d.state) < st.sure) { fail('level 1 after the cliffs: fewer through than sure'); break; } } catch (e) { fail(`level 1 after the cliffs: ${e.message}`); break; }
    splits++;
  }
  // Refusals.
  const b0 = bands(1, 9)[0].band;
  const refuse = (level, values, what) => { let msg = null; try { P.edit(level, b0, { level1BlockedPairToggle: false }, values); } catch (e) { msg = e.message; } if (!msg) fail(`the form takes ${what}`); };
  refuse(2, { a: 'hair:1', left: 'with', b: 'hair:1', upper: 'with' }, 'the same rule for both pairs of guardians at level 2');
  refuse(4, { a1: 'hair:1', a2: 'hair:2', left: 'with', b1: 'feet:1', b2: 'nose:2', upper: 'with' }, 'two values of one trait at level 4');
  refuse(3, { aKind: 'nose', aValues: [2], left: 'with', bKind: 'feet', bValues: [1, 2], upper: 'with' }, 'one value at level 3');
  refuse(1, { a: 'eyes:3', left: 'with', closed: 'both' }, 'no closed pair at level 1');
  // With fewer chances, the sure count against a plain minimax over every move.
  const plain = (band, keys, c) => {
    const T = (k, i) => S.zbTunnelsOf(k, i), n = band.length, memoP = new Map();
    const v = (H, done, c) => {
      const key = H.join() + '|' + done + '|' + c;
      if (memoP.has(key)) return memoP.get(key);
      let best = 0;
      for (let i = 0; i < n; i++) if (!(done >> i & 1)) for (let t = 0; t < 4; t++) {
        const acc = H.filter(k => T(k, i) === t), ra = H.filter(k => (T(k, i) < 2) !== (t < 2)), rb = H.filter(k => (T(k, i) < 2) === (t < 2) && T(k, i) !== t);
        let w = Infinity;
        if (acc.length) w = Math.min(w, 1 + v(acc, done | 1 << i, c));
        for (const R of [ra, rb]) if (R.length) w = Math.min(w, c > 1 ? v(R, done, c - 1) : 0);
        if (w > best) best = w;
      }
      memoP.set(key, best);
      return best;
    };
    return v(keys, 0, c);
  };
  for (let level = 1; level <= 2; level++) {
    for (const { band } of bands(8, 700 + level, [3, 4])) {
      for (const knows of level === 1 ? ['program', 'form'] : ['program']) {
        const keys = [...S.zbTunnelsHypotheses(level, band, knows).keys()].sort((a, b) => a - b);
        if (keys.length > 40) continue;
        for (let c = 1; c <= 3; c++) {
          const st = P.strategy(level, band, null, { knows, chances: c, budget: 5000 }), want = plain(band, keys, c);
          if (!st.exact || st.sure !== want) { fail(`level ${level}, knowing the ${knows}, ${c} chances, band ${S.zbBandCode(band)}: the strategy says ${st.sure} sure${st.exact ? '' : ' (not exact)'}, a plain minimax ${want}`); break; }
          if (walk(band, st.root, 0) < st.sure) { fail(`level ${level}, ${c} chances: a branch gets fewer through than said`); break; }
          brute++;
        }
      }
    }
  }
  if (slowRoot > 2000) fail(`a strategy's root took ${slowRoot} ms`);
  if (slowNext > 500) fail(`a strategy's next() took ${slowNext} ms`);
  const bench = `workbench: ${trips} forms given back; ${walked} strategies walked down every branch (${ends} ends) and ${played} played against dealt rules, none short of what they say is sure; the puzzle's answer the judge's at every move of ${answered} plays; ${brute} held to a plain minimax with fewer chances; ${splits} dealt after the Allergic Cliffs, their count read from the state; slowest root ${slowRoot} ms, next() ${slowNext} ms`;
  say(`tables as ScummVM's and in ZOOMBINI.EXE at 0x${(at[0] || 0).toString(16)}, the entrances at 0x${(posAt[0] || 0).toString(16)}; chances ${chances}; `
    + `${cases} guard cases as evaluateRule; ${dealt} deals as ScummVM deals them (level 4 in the program's order: ScummVM's picks another rule in ${other4} of ${dealt4}); `
    + `the Allergic Cliffs' count avoided in ${avoided}`);
  say(bench);
}
