// Allergic Cliffs (js/zb-puzzle-bridge.js) against ScummVM's
// puzzle_bridge.cpp and .h and the 1996 program:
//
//   - the tables: level 2's value pairs, level 3's pairs of traits and
//     level 4's left-out trait, and the order the rules are listed in, are
//     ScummVM's, read from its text; packed as the program packs them (a
//     byte a trait, feet lowest), the 22 words of levels 2 and 3 are in
//     ZOOMBINI.EXE, one after the other;
//   - each level lists as many rules as ScummVM's poolSize, all different;
//   - the chances are debugGetChances' six;
//   - the workbench: the form gives back what it was given; the solution
//     sends every Zoombini over the bridge the rule gives it; and the
//     strategy, walked down every branch, never gets fewer across than the
//     number it says is sure, and reaches it on some branch;
//   - over bands of 16, 11 and 5 at each level, the rule dealt sends one
//     way the first count the search tries (half the band, then +1, -2,
//     +1, -2, ...: 8, 9, 7, 8, 6, 7, 5, ...) that some rule gives, and
//     the marks follow the rule and the coin.
const KIND = { kTraitHair: 'hair', kTraitEyes: 'eyes', kTraitNose: 'nose', kTraitFeet: 'feet' };

export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_bridge.h'), cpp = scumm('zoombini_pages/puzzle_bridge.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const pairs = [...need(/kLevel2AlternativeValueTable\[10\]\{([\s\S]*?)\};/, h, 'kLevel2AlternativeValueTable')[1]
    .matchAll(/\{(\d+), (\d+)\}/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!same(pairs, S.ZB_BRIDGE_PAIRS)) fail(`level 2's pairs are not ScummVM's: ${JSON.stringify(pairs)}`);
  const kinds = body => [...body.matchAll(/ZmbTrait::(kTrait\w+)/g)].map(m => KIND[m[1]]);
  const base = kinds(need(/kLevel3BaseTable\[6\] = \{([\s\S]*?)\};/, cpp, 'kLevel3BaseTable')[1]);
  const step = kinds(need(/kLevel3StepTable\[6\] = \{([\s\S]*?)\};/, cpp, 'kLevel3StepTable')[1]);
  if (!same(base.map((b, i) => [b, step[i]]), S.ZB_BRIDGE_L3)) fail(`level 3's pairs of traits are not ScummVM's: ${base} / ${step}`);
  const order = kinds(need(/kRuleSlotTraitKinds\[4\] = \{([\s\S]*?)\};/, cpp, 'kRuleSlotTraitKinds')[1]);
  if (!same(order, S.ZB_BRIDGE_ORDER)) fail(`the rules' order is not ScummVM's: ${order}`);
  const out = kinds(need(/kLevel4ExcludedTraitTable\[4\]\{([\s\S]*?)\};/, h, 'kLevel4ExcludedTraitTable')[1]);
  const l4 = S.zbBridgeRules(4);
  const l4out = [0, 125, 250, 375].map(i => S.ZB_TRAIT_KINDS.find(k => !l4[i].some(r => r.kind === k)));
  if (!same(out, l4out)) fail(`level 4 leaves out ${l4out}, ScummVM ${out}`);

  // The program's words: the pairs as (first << 4 | second), then level 3's two traits' unit bytes.
  const unit = k => 1 << 8 * S.ZB_BRIDGE_ORDER.indexOf(k);
  const words = [...S.ZB_BRIDGE_PAIRS.map(([a, b]) => a << 4 | b), ...S.ZB_BRIDGE_L3.map(p => unit(p[0])), ...S.ZB_BRIDGE_L3.map(p => unit(p[1]))];
  const bytes = words.flatMap(w => [w & 255, w >> 8 & 255, w >> 16 & 255, w >>> 24]);
  // Twice: in the Allergic Cliffs' data, before the name of its archive, and in the Stone Cold Caves'.
  const at = find(exe, bytes).filter(o => new TextDecoder('latin1').decode(exe.subarray(o + bytes.length, o + bytes.length + 10)) === 'bridge.mhk');
  if (at.length !== 1) fail(`the 22 words of levels 2 and 3 are not in ZOOMBINI.EXE before "bridge.mhk"`);

  const sizes = [...cpp.matchAll(/case kPuzzleLevel(\d): \{[^}]*?poolSize = (\d+);/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (sizes.length !== 4) fail(`read ${sizes.length} pool sizes from buildTraitTollTable, not 4`);
  for (const [level, n] of sizes) {
    const rules = S.zbBridgeRules(level), keys = new Set(rules.map(r => JSON.stringify(r)));
    if (rules.length !== n || keys.size !== n) fail(`level ${level} lists ${rules.length} rules (${keys.size} different), ScummVM ${n}`);
  }
  const chances = Number(need(/debugGetChances\(\) const \{[\s\S]*?kMistake, (\d+),/, cpp, 'debugGetChances')[1]);
  if (!/Six pegs/.test(S.ZB_PUZZLES.get('BRIDGE').levels[0].chances) || chances !== 6) fail(`ScummVM gives ${chances} chances`);

  // The search, as ScummVM writes it: the counts it tries in turn from half the band.
  need(/target \+= step;\s*step = -\(step \+ 1\);/, cpp, 'the search\'s step');
  const tries = n => { const out = []; for (let t = Math.trunc(n / 2), s = 1; t > -40; t += s, s = -(s + 1)) out.push(t); return out; };
  let dealt = 0;
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(300, 100 + level, [16, 11, 5])) {
      const d = S.ZB_PUZZLES.get('BRIDGE').deal(level, band, S.zbRandom(seed), {});
      if (d.state.stuck) continue;
      const { rule, matchCount, matchingTraitsUseUpperLane: up } = d.state;
      const n = band.filter(z => S.zbBridgeMatches(z, rule)).length;
      const given = new Set(S.zbBridgeRules(level).map(r => band.filter(z => S.zbBridgeMatches(z, r)).length));
      const first = tries(band.length).find(t => t > 0 && t < 16 && given.has(t));
      if (n !== matchCount || n !== first) { fail(`level ${level}: a rule sends ${n} one way, the deal says ${matchCount}, the search stops at ${first}`); break; }
      if (rule.length !== [1, 1, 2, 3][level - 1] || rule.some(r => r.values.length !== (level === 2 ? 2 : 1))) { fail(`level ${level}: a rule of the wrong form, ${JSON.stringify(rule)}`); break; }
      if (d.marks.some((m, i) => m !== (S.zbBridgeMatches(band[i], rule) === up ? 'upper' : 'lower'))) { fail(`level ${level}: the marks do not follow the rule`); break; }
      dealt++;
    }
  }
  // ---- the workbench -----------------------------------------------------
  const P = S.ZB_PUZZLES.get('BRIDGE');
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  let trips = 0, walked = 0, leaves = 0, played = 0;
  const walk = (node, sure, depth) => {
    if (!node.outcomes.length) { leaves++; return node.crossed; }
    if (depth > 40) throw new Error('a strategy deeper than 40 moves');
    return Math.min(...node.outcomes.map(o => walk(o.next(), sure, depth + 1)));
  };
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(12, 300 + level, [16, 9, 4])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      if (d.state.stuck) continue;
      const form = P.form(level, band, d.state), again = P.edit(level, band, d.state, valuesOf(form));
      if (JSON.stringify(valuesOf(P.form(level, band, again))) !== JSON.stringify(valuesOf(form)) || JSON.stringify(again.rule) !== JSON.stringify(d.state.rule)) { fail(`level ${level}: the form does not give back the rule it shows`); break; }
      trips++;
      const sol = P.solve(level, band, d.state);
      const sent = sol.solutions[0].steps.join(' ');
      if (sol.most !== band.length || !sol.exact || sol.solutions[0].crosses.length !== band.length) { fail(`level ${level}: the solution does not take the whole band`); break; }
      const zs = sol.solutions[0].diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
      if (JSON.stringify(zs) !== JSON.stringify(band.map((_, i) => i))) { fail(`level ${level}: the solution's diagram does not draw each Zoombini once`); break; }
      for (const knows of band.length <= 9 ? ['program', 'form'] : ['program']) {
        const st = P.strategy(level, band, null, { knows, budget: 4000 });
        const worst = walk(st.root, st.sure, 0);
        if (worst < st.sure) { fail(`level ${level}, knowing the ${knows}: the strategy says ${st.sure} are sure, and a branch gets ${worst} across`); break; }
        if (st.exact && worst !== st.sure) { fail(`level ${level}, knowing the ${knows}: the strategy is said to be exact at ${st.sure}, and its worst branch gets ${worst}`); break; }
        walked++;
        // Played against the dealt rule, the game answering each move.
        if (knows === 'program') {
          const end = S.zbStrategyPlay(P, level, band, d.state, st);
          if (!end) { fail(`level ${level}: the game's answer to a move is not among the strategy's outcomes`); break; }
          if (end.crossed < st.sure) { fail(`level ${level}: played against the dealt rule, ${end.crossed} across, fewer than the ${st.sure} sure`); break; }
          played++;
        }
      }
    }
  }
  let bad = null;
  try { P.edit(3, bands(1, 5)[0].band, {}, { t1: 'hair:1', t2: 'hair:2', upper: 'with' }); } catch (e) { bad = e.message; }
  if (!bad) fail('the form takes two values of one trait at level 3');

  say(`${trips} forms given back, ${walked} strategies walked down every branch (${leaves} ends), none short of what it says is sure, ${played} played against the dealt rule; tables as ScummVM's and in ZOOMBINI.EXE at 0x${(at[0] || 0).toString(16)}; 20, 40, 150 and 500 rules; ${dealt} deals split as the program's search does`);
}
