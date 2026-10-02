/* zb-puzzle-bridge.js -- Allergic Cliffs: two bridges, and cliffs that
   sneeze at Zoombinis with certain traits.
   =========================================================================
   Needs zb-puzzle.js.

   The band crosses one at a time, each dragged onto the upper bridge or
   the lower. Hidden is a rule, some trait values: a Zoombini with any of
   them belongs on one bridge and one with none of them on the other,
   which way round a coin toss decides. On the wrong bridge the cliffs
   sneeze it back and a peg falls from the gate; six pegs, and when the
   sixth has fallen no one else may cross.

   The rule is dealt from the band. At each level the program lists
   every rule of that level's form, as words of a byte a trait (feet in
   the lowest, then nose, eyes and hair; a second value, at level 2, in
   each byte's high half): level 1 one trait value, 20 of them; level 2
   one trait with either of two values, 40; level 3 either of two traits'
   values, 150; level 4 any of three, 500. It counts the band members each
   would send one way, then looks for a count between 1 and 15 that at
   least one rule gives, and picks one of the rules with it at random.
   It starts at half the band, rounded down, and steps +1, -2, +1, -2,
   ..., so from 8 it tries 8, 9, 7, 8, 6, 7, 5 and on down: never more
   than one over half, and it drifts below half rather than above. At
   level 1, when only one rule gave the count, the count is kept for the
   Stone Cold Caves, which avoid it.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_bridge.cpp and .h
   (buildTraitTollTable, traitMatchesDescriptor, testTraitMatch,
   debugGetChances), checked against the program's own code: ZOOMBI32.EXE
   of the 1996 disc's ZBARC32.Z builds the rules at 0x415e63 from the
   tables at 0x4a0804 (the level 2 pairs, 0x12 to 0x45), 0x4a082c and
   0x4a0844 (level 3's two traits), which are in ZOOMBINI.EXE too, and
   its search steps +1, -2 as ScummVM's does.
   utilities/puzzle_check.mjs holds the tables to both.
*/

/* Level 2's pairs of values, and level 3's pairs of traits: the first
   trait takes value v and the second value s, for s and then v 1-5. */
const ZB_BRIDGE_PAIRS = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [4, 5]];
const ZB_BRIDGE_L3 = [['feet', 'nose'], ['feet', 'eyes'], ['feet', 'hair'], ['nose', 'eyes'], ['nose', 'hair'], ['eyes', 'hair']];
/* The order the rules are listed and a rule's traits read: the packed
   word's bytes, lowest first. */
const ZB_BRIDGE_ORDER = ['feet', 'nose', 'eyes', 'hair'];

/* Every rule of a level's form, in the program's order, as
   [{ kind, values: [v] or [v, w] }]. */
function zbBridgeRules(level) {
  const rules = [];
  if (level === 1) {
    for (const kind of ZB_BRIDGE_ORDER) for (let v = 1; v <= 5; v++) rules.push([{ kind, values: [v] }]);
  } else if (level === 2) {
    for (const kind of ZB_BRIDGE_ORDER) for (const pair of ZB_BRIDGE_PAIRS) rules.push([{ kind, values: pair.slice() }]);
  } else if (level === 3) {
    for (const [a, b] of ZB_BRIDGE_L3) {
      for (let s = 1; s <= 5; s++) for (let v = 1; v <= 5; v++) rules.push([{ kind: a, values: [v] }, { kind: b, values: [s] }]);
    }
  } else {
    /* Each of the four traits left out in turn; the other three counted
       like an odometer, the lowest byte fastest. */
    for (const out of ['hair', 'eyes', 'nose', 'feet']) {
      const kinds = ZB_BRIDGE_ORDER.filter(k => k !== out);
      for (let n = 0; n < 125; n++) rules.push(kinds.map((kind, i) => ({ kind, values: [Math.floor(n / 5 ** i) % 5 + 1] })));
    }
  }
  return rules;
}

/* Whether a Zoombini has any of a rule's values. */
function zbBridgeMatches(z, rule) { return rule.some(r => r.values.includes(z[r.kind])); }

function zbBridgeRuleWords(rule) {
  return zbWordsOr(rule.flatMap(r => r.values.map(v => zbTraitWith(r.kind, v))));
}

/* The program's search for a rule: every rule of the level's form, the
   count each sends one way, and the count the search stops at (from half
   the band, +1, -2, +1, -2, ...; it would go on for ever if no rule sent
   anyone one way, when count is null), with the rules that give it. */
function zbBridgeCandidates(level, band) {
  const rules = zbBridgeRules(level);
  const counts = rules.map(rule => band.filter(z => zbBridgeMatches(z, rule)).length);
  let target = Math.trunc(band.length / 2), step = 1;
  for (let tries = 0; tries < 64; tries++) {
    if (target > 0 && target < 16 && counts.includes(target)) {
      return { rules, counts, count: target, candidates: rules.filter((r, i) => counts[i] === target) };
    }
    target += step;
    step = -(step + 1);
  }
  return { rules, counts, count: null, candidates: [] };
}

/* A rule and its bridge as which of the band go over the upper bridge: a
   bit a band member. */
function zbBridgeUpperMask(band, rule, upperMatches) {
  let m = 0;
  band.forEach((z, i) => { if (zbBridgeMatches(z, rule) === upperMatches) m |= 1 << i; });
  return m;
}

ZB_PUZZLES.set('BRIDGE', {
  about: 'Each Zoombini is sent over the upper bridge or the lower. The cliffs are allergic to some traits, and sneeze back a Zoombini on the wrong bridge.',
  levels: [
    { rule: 'One trait value, such as a propeller: Zoombinis with it take one bridge, the rest the other. It is one of 20, chosen to send as near half the band one way as it can, never more than one over.',
      chances: 'Six pegs hold the gate, and each sneeze knocks one out. After the sixth no one else may cross.' },
    { rule: 'One trait with either of two values, such as a red or a blue nose. One of 40, chosen the same way.',
      chances: 'Six pegs, as at every level.' },
    { rule: 'Either of two traits’ values, such as sleepy eyes or a cap. One of 150, chosen the same way.',
      chances: 'Six pegs, as at every level.' },
    { rule: 'Any of three traits’ values, such as a tuft, one eye or roller skates. One of 500, chosen the same way.',
      chances: 'Six pegs, as at every level.' },
  ],
  deal(level, band, rnd, journey = {}) {
    const { count, candidates } = zbBridgeCandidates(level, band), found = candidates.length;
    if (count == null) return { setup: ['No rule of this level sends any of this band one way; the program would keep looking.'], answer: [], marks: band.map(() => null), state: { stuck: true } };
    const rule = candidates[rnd.range(1, found) - 1];
    delete journey.bridgeSplit;
    if (level === 1 && found === 1) journey.bridgeSplit = count;
    const upperMatches = rnd.bool();
    const withIt = upperMatches ? 'upper' : 'lower', without = upperMatches ? 'lower' : 'upper';
    return {
      setup: [`Two bridges and a gate held by six pegs. ${band.length} Zoombinis to cross.`],
      answer: [
        `Zoombinis with ${zbBridgeRuleWords(rule)} cross the ${withIt} bridge: ${count} of this band.`,
        `The other ${band.length - count} cross the ${without} bridge.`,
      ],
      marks: band.map(z => zbBridgeMatches(z, rule) ? withIt : without),
      state: { rule, matchCount: count, candidates: found, matchingTraitsUseUpperLane: upperMatches },
    };
  },
  form(level, band, state) {
    const t = r => `${r.kind}:${r.values[0]}`;
    const upper = { key: 'upper', label: 'The upper bridge takes', kind: 'choice', value: state.matchingTraitsUseUpperLane ? 'with' : 'without',
      options: [{ value: 'with', label: 'Zoombinis with it' }, { value: 'without', label: 'Zoombinis without it' }] };
    if (level === 2) {
      const kind = state.rule[0].kind;
      return [
        { key: 'kind', label: 'Trait', kind: 'choice', value: kind, options: ZB_TRAIT_KINDS.map(k => ({ value: k, label: k })) },
        { key: 'values', label: 'Either of', kind: 'several', min: 2, max: 2, value: state.rule[0].values.slice(),
          options: [1, 2, 3, 4, 5].map(v => ({ value: v, label: ZB_TRAIT_SHORT[kind][v - 1] })) },
        upper,
      ];
    }
    return [...state.rule.map((r, k) => ({ key: `t${k + 1}`, label: k ? 'or' : 'Trait', kind: 'choice', value: t(r), options: zbTraitOptions() })), upper,
      ...(level > 2 ? [{ key: 'note', kind: 'note', note: `Each of the ${level - 1} must be a different trait.` }] : [])];
  },
  edit(level, band, state, values) {
    let rule;
    if (level === 2) {
      const vs = [...new Set(values.values.map(Number))].sort((a, b) => a - b);
      if (!ZB_TRAIT_KINDS.includes(values.kind)) throw new Error('Pick a trait.');
      if (vs.length !== 2) throw new Error('This level\u2019s rule has two values of one trait.');
      rule = [{ kind: values.kind, values: vs }];
    } else {
      const n = [1, 1, 2, 3][level - 1];
      const parts = Array.from({ length: n }, (_, k) => zbTraitOption(values[`t${k + 1}`]));
      if (new Set(parts.map(p => p.kind)).size !== n) throw new Error(`Each of the ${n} must be a different trait.`);
      parts.sort((a, b) => ZB_BRIDGE_ORDER.indexOf(a.kind) - ZB_BRIDGE_ORDER.indexOf(b.kind));
      rule = parts.map(p => ({ kind: p.kind, values: [p.value] }));
    }
    const upperMatches = values.upper === 'with';
    return { rule, matchCount: band.filter(z => zbBridgeMatches(z, rule)).length, matchingTraitsUseUpperLane: upperMatches, edited: true };
  },
  solve(level, band, state) {
    const up = [], low = [];
    band.forEach((z, i) => (zbBridgeMatches(z, state.rule) === state.matchingTraitsUseUpperLane ? up : low).push(i));
    const withWord = zbBridgeRuleWords(state.rule);
    return {
      most: band.length, exact: true, ways: 1,
      solutions: [{
        title: `All ${band.length} cross`,
        steps: [
          up.length ? `Over the upper bridge, ${up.length}: ${zbPlacesWords(up)}.` : 'No one takes the upper bridge.',
          low.length ? `Over the lower bridge, ${low.length}: ${zbPlacesWords(low)}.` : 'No one takes the lower bridge.',
          `The upper bridge takes the Zoombinis ${state.matchingTraitsUseUpperLane ? 'with' : 'without'} ${withWord}; in any order, and with no sneeze.`,
        ],
        crosses: band.map((_, i) => i),
        diagram: zbBridgeDiagram(band, { rule: state.rule, upperMatches: state.matchingTraitsUseUpperLane, up, low, near: [], pegs: 6 }),
      }],
      notes: ['Known, the rule sends every Zoombini one way or the other, so all of them cross; the order they go in does not matter.'],
    };
  },
  strategy(level, band, arc, opts = {}) { return zbBridgeStrategy(level, band, opts); },
  /* It crosses when the bridge it is sent over is the one its traits
     give it, and is sneezed back otherwise. */
  answer(level, band, state, node) {
    return zbBridgeMatches(band[node.zoombini], state.rule) === state.matchingTraitsUseUpperLane ? (node.upper ? 0 : 1) : (node.upper ? 1 : 0);
  },
  source: 'ScummVM’s puzzle_bridge.cpp, checked against the program’s code.',
});

/* The cliffs drawn: the near bank with those still to go, the far bank
   with those across, by bridge, the gate's pegs, and the rule if known.
   sent is { i, upper } for one on its way. */
function zbBridgeDiagram(band, { rule = null, upperMatches = true, up = [], low = [], near = [], pegs = 6, sent = null, caption = null }) {
  const W = 780, H = 380, items = [];
  items.push({ t: 'rect', x: 0, y: 70, w: 160, h: H - 70, fill: 'grass' }, { t: 'rect', x: 470, y: 70, w: W - 470, h: H - 70, fill: 'grass' });
  items.push({ t: 'rect', x: 160, y: H - 40, w: 310, h: 40, fill: 'water' });
  for (const [y, name] of [[150, 'upper'], [270, 'lower']]) {
    items.push({ t: 'rect', x: 160, y, w: 310, h: 12, fill: 'wood', stroke: 'line' });
    for (let x = 180; x < 470; x += 24) items.push({ t: 'line', x1: x, y1: y, x2: x, y2: y + 12, stroke: 'line' });
    items.push({ t: 'text', x: 315, y: y + 30, text: `the ${name} bridge`, anchor: 'middle', size: 13, fill: 'dim' });
  }
  if (rule) {
    const traits = rule.flatMap(r => r.values.map(value => ({ kind: r.kind, value })));
    const withY = upperMatches ? 150 : 270, withoutY = upperMatches ? 270 : 150;
    items.push({ t: 'text', x: 315, y: withY - 44, text: 'with', anchor: 'middle', size: 12, fill: 'dim' });
    items.push(...zbDiagramTraits(traits, 315, withY - 22));
    items.push({ t: 'text', x: 315, y: withoutY - 44, text: 'without', anchor: 'middle', size: 12, fill: 'dim' });
    items.push(...zbDiagramTraits(traits, 315, withoutY - 22, 64, { faded: true }));
  }
  /* The gate's six pegs, standing or fallen. */
  for (let k = 0; k < 6; k++) items.push({ t: 'circle', x: 176, y: 186 + k * 11, r: 4, fill: k < pegs ? 'wood' : 'panel', stroke: 'line' });
  items.push(...zbDiagramRows(near, 14, 128, 4, 36, 60));
  items.push(...zbDiagramRows(up, 482, 130, 9, 33, 48), ...zbDiagramRows(low, 482, 252, 9, 33, 48));
  if (sent) items.push({ t: 'zoombini', i: sent.i, x: 300, y: sent.upper ? 148 : 268, scale: 1 });
  items.push({ t: 'text', x: 10, y: 24, text: caption || `${near.length} to go, ${up.length + low.length} across`, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}

/* The cliffs with the rule unknown. The hypotheses are the rules the
   program could deal this band at this level, each with either bridge; to
   the player only which of the band each sends up matters, so they are
   kept as that, a mask each, and counted. A Zoombini whose bridge every
   hypothesis left agrees on goes over free; otherwise one is sent over a
   bridge, and either crosses, ruling out the hypotheses that would have it
   on the other, or is sneezed back, ruling out the rest, for a peg. The
   search is minimax: the best move is the one whose worse outcome gets the
   most across, with pegs up to six and no one crossing once the sixth has
   fallen. It gives up at the budget and then plays out the rest by the
   rule of sending the Zoombini that splits the hypotheses most evenly. */
function zbBridgeStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program';
  const { rules, candidates: dealt } = zbBridgeCandidates(level, band);
  const candidates = knows === 'form' ? rules : dealt;
  const count = new Map();
  for (const rule of candidates) for (const up of [true, false]) {
    const m = zbBridgeUpperMask(band, rule, up);
    count.set(m, (count.get(m) || 0) + 1);
  }
  const all = [...count.keys()], n = band.length, full = (1 << n) - 1;
  const agreed = H => { let one = full, zero = full; for (const m of H) { one &= m; zero &= ~m; } return (one | zero) & full; };
  const bits = x => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
  const deadline = Date.now() + (opts.budget || 1500);
  let exact = true, guessOnly = false;
  const memo = new Map();
  /* The most sure to cross from those in u (undetermined, still to go)
     with p pegs; H is sorted. */
  const value = (H, u, p) => {
    if (!u || !p) return 0;
    const key = H.join(',') + '|' + u + '|' + p;
    if (memo.has(key)) return memo.get(key).v;
    const best = bestMove(H, u, p, Date.now() > deadline);
    memo.set(key, best);
    return best.v;
  };
  /* Zoombinis whose columns across H are alike are one move. */
  const moves = (H, u) => {
    const seen = new Set(), out = [];
    for (let i = 0; i < n; i++) if (u >> i & 1) {
      const col = H.map(m => m >> i & 1).join('');
      if (!seen.has(col)) { seen.add(col); out.push(i); }
    }
    return out;
  };
  const split = (H, i, upper) => {
    const a = [], s = [];
    for (const m of H) ((m >> i & 1) === (upper ? 1 : 0) ? a : s).push(m);
    return [a, s];
  };
  /* A move's worse outcome; the sneeze first, which is usually the worse,
     and the crossing not looked at when the sneeze is already no better
     than a move in hand (bound). */
  const outcome = (H, u, p, i, upper, guess, bound) => {
    const [a, s] = split(H, i, upper);
    let vs = 0;
    if (p > 1) {
      const us = u & ~agreed(s), freeS = bits(u & agreed(s));
      vs = freeS + (guess ? guessValue(s, us, p - 1) : value(s, us, p - 1));
    }
    if (vs <= bound) return vs;
    const ua = u & ~(1 << i) & ~agreed(a), freeA = bits(u & ~(1 << i) & agreed(a));
    const va = 1 + freeA + (guess ? guessValue(a, ua, p) : value(a, ua, p));
    return Math.min(va, vs);
  };
  const bestMove = (H, u, p, guess) => {
    if (guess && !guessOnly) exact = false;
    let best = { v: -1, i: -1, upper: true };
    const ms = moves(H, u);
    /* The even-split rule's own value first: when it gets them all across
       there is nothing to search, and otherwise it is the move to beat. */
    if (!guess) {
      guessOnly = true;
      const g = guessValue(H, u, p);
      guessOnly = false;
      const gm = guessMemo.get(H.join(',') + '|' + u + '|' + p);
      if (g === bits(u)) return gm;
      best = { v: g, i: gm.i, upper: gm.upper };
    }
    /* The most even splits first, so the best is found soonest. */
    ms.sort((x, y) => Math.abs(2 * split(H, x, true)[0].length - H.length) - Math.abs(2 * split(H, y, true)[0].length - H.length));
    for (const i of guess ? ms.slice(-1) : ms) {
      for (const upper of [split(H, i, true)[0].length >= H.length / 2, split(H, i, true)[0].length < H.length / 2]) {
        const v = outcome(H, u, p, i, upper, guess, best.v);
        if (v > best.v) best = { v, i, upper };
        if (best.v === bits(u)) return best;
      }
    }
    return best;
  };
  const guessMemo = new Map();
  const guessValue = (H, u, p) => {
    if (!u || !p) return 0;
    const key = H.join(',') + '|' + u + '|' + p;
    if (!guessMemo.has(key)) guessMemo.set(key, bestMove(H, u, p, true));
    return guessMemo.get(key).v;
  };
  const weight = H => H.reduce((t, m) => t + count.get(m), 0);
  const node = (H, u, p, across, near, up, low) => {
    const left = weight(H);
    if (!u || !p) {
      const lost = bits(u);
      return { move: !u ? `Every Zoombini's bridge is known now: all ${across} of the band that can cross have.` : `The sixth peg has fallen: ${lost} left behind.`,
        zoombini: null, left, crossed: across, spent: 6 - p, outcomes: [],
        diagram: zbBridgeDiagram(band, { near, up, low, pegs: p, caption: !u ? `All ${across} across` : `${across} across, ${lost} left behind` }) };
    }
    const key = H.join(',') + '|' + u + '|' + p;
    value(H, u, p);
    const m = (memo.get(key) || guessMemo.get(key)), i = m.i, upper = m.upper;
    const [a, s] = split(H, i, upper);
    const place = (H2, u2, p2, crossedNow) => {
      const nearNow = [], up2 = up.slice(), low2 = low.slice();
      for (let k = 0; k < n; k++) {
        if (up.includes(k) || low.includes(k)) continue;
        if (crossedNow.includes(k)) ((H2[0] >> k & 1) ? up2 : low2).push(k); else nearNow.push(k);
      }
      return node(H2, u2, p2, up2.length + low2.length, nearNow, up2, low2);
    };
    const freeOf = (H2, u2) => { const g = agreed(H2); return [...Array(n).keys()].filter(k => u2 >> k & 1 && g >> k & 1); };
    const aFree = freeOf(a, u & ~(1 << i)), sFree = p > 1 ? freeOf(s, u) : [];
    return {
      move: `Send Zoombini ${i + 1} over the ${upper ? 'upper' : 'lower'} bridge.`,
      zoombini: i, upper, left, crossed: across,
      diagram: zbBridgeDiagram(band, { near: near.filter(k => k !== i), up, low, pegs: p, sent: { i, upper }, caption: `${left} hypotheses left, ${p} pegs` }),
      outcomes: [
        { label: `It crosses (${weight(a)} left)`, left: weight(a), next: () => place(a, u & ~(1 << i) & ~agreed(a), p, [i, ...aFree]) },
        { label: p > 1 ? `It is sneezed back (${weight(s)} left)` : `It is sneezed back, and the last peg falls`, left: weight(s),
          next: () => place(s, u & ~agreed(s), p - 1, sFree) },
      ],
    };
  };
  const H0 = all.slice().sort((x, y) => x - y), g0 = agreed(H0);
  const free0 = [...Array(n).keys()].filter(k => g0 >> k & 1);
  const u0 = full & ~g0;
  const sure = free0.length + (H0.length ? value(H0, u0, 6) : 0);
  /* The whole band sure is as many as there can be, budget or not. */
  if (sure === n) exact = true;
  const up0 = free0.filter(k => H0[0] >> k & 1), low0 = free0.filter(k => !(H0[0] >> k & 1));
  return {
    hypotheses: weight(H0), sure, exact, knows,
    root: node(H0, u0, 6, free0.length, [...Array(n).keys()].filter(k => !free0.includes(k)), up0, low0),
    notes: [
      knows === 'form'
        ? `The player knows only the rule's form at this level: any of its ${rules.length} rules, each with either bridge, ${weight(H0)} hypotheses, ${H0.length} different to this band.`
        : `The program could have dealt this band ${candidates.length} rule${candidates.length === 1 ? '' : 's'} at this level, each with either bridge: ${weight(H0)} hypotheses, ${H0.length} different to this band. The player knows that.`,
      'Any Zoombini whose bridge every hypothesis left agrees on goes first, which costs nothing; otherwise the one whose worse outcome still gets the most across.',
      exact ? (sure === n ? 'So the whole band is sure to cross.' : 'The search is complete: no way of playing is sure of more.')
        : 'The search stopped at its budget and played the rest by a rule of thumb, sending the Zoombini the hypotheses most agree on over its likelier bridge, so this many are sure, and perhaps more could be.',
    ],
  };
}
