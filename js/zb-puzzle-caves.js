/* zb-puzzle-caves.js -- The Lion's Lair: a stone lion that lets the band
   pass only when it stands along the path in the right order.
   =========================================================================
   Needs zb-puzzle.js.

   A path of stones winds down past the lion's paw, and the band must
   stand on it grouped by a trait, the groups in an order the lion keeps
   to itself. The Zoombinis are dragged one at a time onto a stone; one
   put on a stone of the wrong group is walked to a free stone of its own
   group anyway, and still goes on, but the mistake counts, and at the
   last mistake allowed no more may be placed. The symbols on the wall by
   the lion show some of the order (the game's help calls them clues, some
   of them eroded).

   The path has twenty stones, 1-20 from its top; the first four are
   never used, and a band of n stands on the last n (ScummVM's seats
   21 - n to 20). The stones are numbered here as ScummVM's debugger
   numbers them, 1-16 from the first that can be used, so a band of n
   stands on stones 17 - n to 16.

   The rule is dealt on arrival. A trait is drawn from the four (hair,
   eyes, nose, feet) and its five values shuffled into an order; then a
   second trait from the other three, and its values shuffled too. Every
   level draws both. At levels 1 and 2 the band stands in groups by the
   first trait, the groups in its order; at levels 3 and 4 each such group
   is split again by the second trait, in its order. So each Zoombini has
   a run of stones it belongs on, as many as there are Zoombinis like it,
   and any free one of them will do. The wall has two rows of five
   places, the first trait's order along the top and the second's below:
   level 1 shows the top row in full, level 2 two of its places, drawn at
   random, level 3 two in each row, and level 4 none.

   The first Lion's Lair the program deals after it starts is by nose:
   the trait is drawn as ever and then set to the third of the four, once
   (a flag in the program's data, set when it loads and cleared on first
   use). journey.cavesFirst stands for that flag here: when true, the
   deal sorts by nose and clears it.

   Taken apart (the page's workbench): the form edits the traits, their
   orders and, at levels 2 and 3, which places the wall shows. Known, the
   answer puts everyone on the path with no mistake, one way. Unknown, the
   strategy (zbCavesStrategy, below) plays for the worst of every rule
   that agrees with the wall; it needs the wall, opts.state, and without
   it takes the wall as unseen. With the wall every band is sure to cross
   whole at levels 1 to 3; at level 4, with nothing on the wall and seven
   mistakes, bands of up to nine were in every trial, and larger ones
   mostly one to four short, as far as the search can show in its budget.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_caves.cpp and .h
   (initDifficultyParams, initEntranceTraitPattern, countGlyphDistribution,
   buildGlyphTimingTable, distributeEntranceTraits,
   findMatchingSeatNumber, handleWrongPlacement, handleEntranceDoorEvent,
   debugGetChances, setBackgroundMusic), checked against the program's own
   code in ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z: the setup at
   0x41665d (the level in the word at 0x4aad98, 1-4; the first stone at
   21 - n; the music, tMID 30025 + level, played only below level 4),
   the mistakes allowed and the ledge's scripts at 0x4186e2, the trait and
   orders at 0x4187f2 (the one-shot flag the word at 0x4a0904, 1 in the
   program's data), the counts at 0x418972, the stones at 0x418ce0, the
   clues at 0x418a25 and the judge at 0x418e70; and the Mac build's
   RANDOMLYSELECTANDSORTBODYPARTS and the Lion's Lair's
   SETSTARTINGLEVELVARIABLES, which agree. The stones' places and the
   clues' places are tables in ZOOMBINI.EXE. utilities/puzzles/caves.mjs
   holds the reading to ScummVM's text and the tables to ZOOMBINI.EXE.
*/

/* Mistakes allowed at levels 1-4 (initDifficultyParams' _mistakeLimit). */
const ZB_CAVES_MISTAKES = [4, 5, 6, 7];
/* The path: twenty stones, the first four never used. */
const ZB_CAVES_SEATS = 20;
const ZB_CAVES_HIDDEN = 4;

/* The trait and the orders, as initEntranceTraitPattern draws them: both
   rows at every level. Returns { primary, secondary, orders: [[5], [5]] }. */
function zbCavesPattern(rnd, first) {
  const kinds = ZB_TRAIT_KINDS.slice();
  let last = 3, primary = null, secondary = null;
  const orders = [];
  for (let row = 0; row < 2; row++) {
    const pool = [0, 1, 2, 3, 4, 5, 6];
    if (row === 0) {
      let idx = rnd.range(0, last);
      if (first) idx = 2;   /* the program's one-shot: the draw is made, then set aside */
      primary = kinds[idx];
      for (let i = idx; i < last + 1; i++) kinds[i] = kinds[i + 1];
      last--;
    } else {
      secondary = kinds[rnd.range(0, last)];
    }
    const order = [];
    for (let count = 5; count > 0; count--) {
      const vi = rnd.range(1, count);
      order.push(pool[vi]);
      for (let i = vi; i < count + 1; i++) pool[i] = pool[i + 1];
    }
    orders.push(order);
  }
  return { primary, secondary, orders };
}

/* The stones, as countGlyphDistribution and buildGlyphTimingTable fill
   them: seats 21 - n to 20 take the first trait's values in its order,
   as many of each as the band has, and at levels 3 and 4 each run is
   split by the second trait in its order. Returns { seatP, seatS },
   21 entries each, 1-20 used, and count, the band counted by the first
   trait's value (1-5) and by 6 x the second's + the first's (7-35). */
function zbCavesSeats(band, rule, two) {
  const seatP = new Array(21).fill(0), seatS = new Array(21).fill(0);
  const count = new Array(36).fill(0);
  for (const z of band) {
    count[z[rule.primary]]++;
    if (two) count[6 * z[rule.secondary] + z[rule.primary]]++;
  }
  const firstSeat = 21 - band.length;
  let seat = firstSeat;
  for (const p of rule.orders[0]) for (let k = 0; k < count[p] && seat < 21; k++) seatP[seat++] = p;
  if (two) {
    seat = firstSeat;
    for (const p of rule.orders[0]) {
      for (const s of rule.orders[1]) {
        for (let k = 0; k < count[6 * s + p] && seat < 21; k++) {
          if (s !== 0) seatS[seat] = s;
          seat++;
        }
      }
    }
  }
  return { seatP, seatS, count };
}

/* The clues, as distributeEntranceTraits picks them: visible[1-10]. */
function zbCavesClues(level, rnd) {
  const visible = new Array(11).fill(0);
  const pick = offset => {
    const pool = [0, 1, 2, 3, 4, 5, 6];
    const many = rnd.range(2, 2);   /* a draw from 2 to 2, which the generator does not step */
    for (let k = 0, left = 5; k < many; k++, left--) {
      const ci = rnd.range(1, left);
      visible[pool[ci] + offset] = 1;
      for (let i = ci; i < left + 1; i++) pool[i] = pool[i + 1];
    }
  };
  if (level === 1) for (let slot = 1; slot < 6; slot++) visible[slot] = 1;
  else if (level === 2) pick(0);
  else if (level === 3) { pick(0); pick(5); }
  return visible;
}

const zbCavesStone = seat => seat - ZB_CAVES_HIDDEN;
const zbCavesStones = (a, b) => a === b ? `stone ${a}` : `stones ${a} to ${b}`;
const zbCavesOrdinal = n => ['first', 'second', 'third', 'fourth', 'fifth'][n - 1];

ZB_PUZZLES.set('CAVES', {
  about: 'The band must stand along a path of stones past a stone lion, grouped by a trait in an order the lion keeps to itself; symbols on the wall show some of that order. A Zoombini put in the wrong place is moved to the right one, but each such mistake counts.',
  levels: [
    { rule: 'One trait is drawn at random and its five values shuffled; the band must stand along the path in groups by that trait, in that order, so each Zoombini has a run of stones as long as the number like it. The wall shows all five values, in order.',
      chances: 'Four mistakes. A Zoombini put on a wrong stone is walked to a right one and still goes on, but it counts; after the fourth no more may be placed, and the rest stay behind.',
      notes: [
        'The first Lion’s Lair after the program starts is by nose, at any level: the trait is drawn and then set to the nose, once. ScummVM keeps this.',
        'A band of fewer than sixteen stands on the last stones of the path, and the stones before them fit no one: the program’s judge takes a Zoombini only on the band’s own stones, so in ScummVM one put on an earlier stone is moved on and counted a mistake.',
      ] },
    { rule: 'As at level 1, but the wall shows only two of the five values, drawn at random, each in its place in the order; the others have worn away.',
      chances: 'Five mistakes, counted as at level 1.',
      notes: [
        'As at level 1, the first Lion’s Lair after the program starts is by nose.',
      ] },
    { rule: 'Two traits are drawn, each with its values shuffled: the band stands in groups by the first, in its order, and within each group by the second, in its own. The wall shows two values of each, drawn at random, the first trait’s along the top row and the second’s below.',
      chances: 'Six mistakes, counted as at level 1.',
      notes: [
        'As at level 1, the first Lion’s Lair after the program starts has the nose as its first trait.',
      ] },
    { rule: 'As at level 3, with nothing on the wall.',
      chances: 'Seven mistakes, counted as at level 1.',
      notes: [
        'As at level 1, the first Lion’s Lair after the program starts has the nose as its first trait.',
        'The program plays no music here at level 4, though the disc has a tune for it (tMID 30028, in both MIDIMPC and MIDIMAC); ScummVM plays it unless its option “Fix ‘The Lion’s Lair’ missing Level 4 background MIDI bug” is turned off.',
      ] },
  ],
  deal(level, band, rnd, journey = {}) {
    const first = !!journey.cavesFirst;
    if (first) journey.cavesFirst = false;
    const rule = zbCavesPattern(rnd, first);
    const visible = zbCavesClues(level, rnd);
    const state = zbCavesState(level, band, rule, visible, first);
    const n = band.length, two = level >= 3;
    const orderWords = (kind, order) => zbWordsOr(order.map(v => zbTraitWith(kind, v)), 'then');
    const runs = zbCavesRuns(band, state);
    const runWords = r => `${zbCavesStones(zbCavesStone(r.from), zbCavesStone(r.to))}: ${r.to - r.from + 1} with `
      + zbWordsOr([zbTraitWith(rule.primary, r.p), ...(two ? [zbTraitWith(rule.secondary, r.s)] : [])], 'and');
    const setup = [`Sixteen stones on the path; this band of ${n} stands on ${zbCavesStones(17 - n, 16)}. ${ZB_CAVES_MISTAKES[level - 1]} mistakes allowed.`,
      zbCavesWallWords(level, state)];
    const answer = [`By ${rule.primary}, in the order ${orderWords(rule.primary, rule.orders[0])}`
      + (two ? `; within each, by ${rule.secondary}, in the order ${orderWords(rule.secondary, rule.orders[1])}.` : '.')
      + (first ? ' (The program’s first Lion’s Lair: the nose, whatever the draw.)' : ''),
      (t => t[0].toUpperCase() + t.slice(1))(`${runs.map(runWords).join('; ')}.`)];
    return {
      setup,
      answer,
      marks: band.map((z, i) => { const r = runs.find(r => r.members.includes(i)); return zbCavesStones(zbCavesStone(r.from), zbCavesStone(r.to)); }),
      state,
    };
  },
  form(level, band, state) { return zbCavesForm(level, state); },
  edit(level, band, state, values) { return zbCavesEdit(level, band, state, values); },
  solve(level, band, state) { return zbCavesSolve(level, band, state); },
  strategy(level, band, arc, opts = {}) { return zbCavesStrategy(level, band, opts); },
  source: 'ScummVM’s puzzle_caves.cpp, checked against the program’s code.',
});

/* ---- Taking the lair apart: the form, the known answer, the unknown ---- */

/* The stones' places on the screen, seats 1-20 (kSeatEntrancePositions),
   for the diagrams. */
const ZB_CAVES_SEAT_PLACES = [[254, 140], [296, 148], [340, 146], [373, 163], [364, 187], [337, 212], [316, 234], [301, 263],
  [314, 292], [346, 311], [388, 316], [429, 301], [458, 281], [482, 261], [521, 247], [556, 263], [567, 290], [543, 314],
  [529, 342], [554, 359]];
/* The 120 orders of the five values. */
const ZB_CAVES_PERMS = (function perms(a) {
  return a.length < 2 ? [a] : a.flatMap((v, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [v, ...p]));
})([1, 2, 3, 4, 5]);

/* The state a deal or an edit gives, by ScummVM's names. */
function zbCavesState(level, band, rule, visible, first = false) {
  const two = level >= 3;
  const { seatP, seatS, count } = zbCavesSeats(band, rule, two);
  const ki = k => ZB_TRAIT_KINDS.indexOf(k);
  return {
    mistakeLimit: ZB_CAVES_MISTAKES[level - 1], ruleTraitCount: two ? 2 : 1,
    primaryRuleTraitKind: rule.primary, secondaryRuleTraitKind: rule.secondary,
    ruleTraitValues: [...rule.orders[0], ...rule.orders[1]], ruleBucketCounts: count,
    seatPrimaryRuleValues: seatP, seatSecondaryRuleValues: seatS, firstUsableSeatNumber: 21 - band.length,
    ruleGlyphVisibility: visible.slice(),
    ruleGlyphShapeIds: visible.map((v, slot) => !v ? 0
      : slot <= 5 ? rule.orders[0][slot - 1] + 5 * ki(rule.primary) : rule.orders[1][slot - 6] + 5 * ki(rule.secondary)),
    forcedNose: first,
  };
}
function zbCavesRule(state) {
  return { primary: state.primaryRuleTraitKind, secondary: state.secondaryRuleTraitKind,
    orders: [state.ruleTraitValues.slice(0, 5), state.ruleTraitValues.slice(5, 10)] };
}
/* The runs of stones, consecutive seats with the same values, each with
   the band members that belong on it. */
function zbCavesRuns(band, state) {
  const two = state.ruleTraitCount > 1, rule = zbCavesRule(state), runs = [];
  for (let seat = state.firstUsableSeatNumber; seat <= 20; seat++) {
    const p = state.seatPrimaryRuleValues[seat], s = state.seatSecondaryRuleValues[seat], last = runs[runs.length - 1];
    if (last && p === last.p && s === last.s) last.to = seat;
    else runs.push({ p, s, from: seat, to: seat, members: [] });
  }
  band.forEach((z, i) => runs.find(r => r.p === z[rule.primary] && (!two || r.s === z[rule.secondary])).members.push(i));
  return runs;
}
/* What the wall shows, in a sentence. */
function zbCavesWallWords(level, state) {
  const rule = zbCavesRule(state), vis = state.ruleGlyphVisibility;
  const clues = (from, kind, order) => [1, 2, 3, 4, 5].filter(k => vis[from + k - 1]).map(k => `${zbTraitWith(kind, order[k - 1])} ${zbCavesOrdinal(k)}`);
  const top = clues(1, rule.primary, rule.orders[0]), below = clues(6, rule.secondary, rule.orders[1]);
  if (top.length === 5 && !below.length) return `The wall’s top row shows, left to right: ${zbWordsOr(rule.orders[0].map(v => zbTraitWith(rule.primary, v)), 'then')}.`;
  if (!top.length && !below.length) return 'The wall shows nothing.';
  return `The wall’s top row shows ${zbWordsOr(top, 'and')}${below.length ? `, and the row below ${zbWordsOr(below, 'and')}` : ''}; the rest has worn away.`;
}

function zbCavesForm(level, state) {
  const rule = zbCavesRule(state), two = level >= 3, vis = state.ruleGlyphVisibility;
  const kindField = (key, label, value) => ({ key, label, kind: 'choice', value, options: ZB_TRAIT_KINDS.map(k => ({ value: k, label: k })) });
  const orderField = (key, label, kind, order) => ({ key, label, kind: 'order', value: order.slice(),
    options: [1, 2, 3, 4, 5].map(v => ({ value: v, label: `${ZB_TRAIT_SHORT[kind][v - 1]}${kind === 'nose' ? ' nose' : ''}` })) });
  const places = [1, 2, 3, 4, 5].map(k => ({ value: k, label: zbCavesOrdinal(k) }));
  const shown = from => [1, 2, 3, 4, 5].filter(k => vis[from + k - 1]);
  const fields = [kindField('primary', two ? 'Grouped first by' : 'Grouped by', rule.primary), orderField('order', 'In the order', rule.primary, rule.orders[0])];
  if (level === 2 || level === 3) fields.push({ key: 'shown', label: 'The wall’s top row shows the', kind: 'several', min: 2, max: 2, value: shown(1), options: places });
  if (two) {
    fields.push(kindField('secondary', 'Then within each by', rule.secondary), orderField('order2', 'In the order', rule.secondary, rule.orders[1]));
    if (level === 3) fields.push({ key: 'shown2', label: 'and the row below the', kind: 'several', min: 2, max: 2, value: shown(6), options: places });
  }
  fields.push({ key: 'note', kind: 'note', note: [
    level === 1 ? 'At this level the wall shows the whole order.' : level === 4 ? 'At this level the wall shows nothing.' : 'The wall shows two places of each row in use, the rest worn away.',
    ...(two ? ['The two traits must differ.'] : []),
    `The stones follow from the rule and the band, and the ${ZB_CAVES_MISTAKES[level - 1]} mistakes from the level; neither is edited.`,
  ].join(' ') });
  return fields;
}

function zbCavesEdit(level, band, state, values) {
  const two = level >= 3, base = zbCavesRule(state);
  const kind = k => { if (!ZB_TRAIT_KINDS.includes(k)) throw new Error('Pick a trait: hair, eyes, nose or feet.'); return k; };
  const order = (o, what) => {
    const a = (Array.isArray(o) ? o : []).map(Number);
    if (a.length !== 5 || new Set(a).size !== 5 || a.some(v => !(v >= 1 && v <= 5))) throw new Error(`${what} must hold all five values, each once.`);
    return a;
  };
  const places = (v, what) => {
    const a = [...new Set((Array.isArray(v) ? v : []).map(Number))].sort((x, y) => x - y);
    if (a.length !== 2 || a.some(k => !(k >= 1 && k <= 5))) throw new Error(`${what} shows two of its five places.`);
    return a;
  };
  const primary = kind(values.primary);
  const orders = [order(values.order, 'The order'), base.orders[1].slice()];
  let secondary = base.secondary;
  if (two) {
    secondary = kind(values.secondary);
    if (secondary === primary) throw new Error('The two traits must differ: the program draws the second from the other three.');
    orders[1] = order(values.order2, 'The second order');
  } else if (secondary === primary) {
    /* Unused at this level, but drawn from the other three all the same. */
    secondary = ZB_TRAIT_KINDS.find(k => k !== primary);
  }
  const visible = new Array(11).fill(0);
  if (level === 1) for (let k = 1; k <= 5; k++) visible[k] = 1;
  if (level === 2 || level === 3) for (const k of places(values.shown, 'The wall’s top row')) visible[k] = 1;
  if (level === 3) for (const k of places(values.shown2, 'The row below')) visible[k + 5] = 1;
  return Object.assign(zbCavesState(level, band, { primary, secondary, orders }, visible, false), { edited: true });
}

function zbCavesSolve(level, band, state) {
  const runs = zbCavesRuns(band, state), rule = zbCavesRule(state), two = level >= 3, n = band.length;
  const seatOf = new Map();
  for (const r of runs) r.members.forEach((i, k) => seatOf.set(i, r.from + k));
  const cap = t => t[0].toUpperCase() + t.slice(1);
  const steps = runs.map(r => `${cap(zbCavesStones(zbCavesStone(r.from), zbCavesStone(r.to)))}: Zoombini${r.members.length > 1 ? 's' : ''} ${zbPlacesWords(r.members)} (${zbWordsOr([zbTraitWith(rule.primary, r.p), ...(two ? [zbTraitWith(rule.secondary, r.s)] : [])], 'and')}).`);
  steps.push('Any free stone of a Zoombini’s run will do, in any order, and none is a mistake.');
  return {
    most: n, exact: true, ways: 1,
    solutions: [{ title: `All ${n} cross, with no mistake`, steps, crosses: band.map((_, i) => i),
      diagram: zbCavesDiagram(level, band, { state, reveal: true, seatOf, caption: `All ${n} on the path` }) }],
    notes: [
      'To cross here is to stand on the path: when the lion lifts its paw every Zoombini on a stone goes on, and those not placed stay behind. A Zoombini put on a wrong stone is still walked to a right one and goes on; the mistake only counts against the rest.',
      'Known, each Zoombini has its run of stones, as long as the number like it, so all of them cross without a mistake. Which stone of its run each takes, and the order they are placed in, do not matter, so this is counted as one way, and it is the simplest.',
    ],
  };
}

/* The lair drawn: the path's stones (those the band cannot use dimmed),
   the wall's two rows of places, the band on the path or waiting, and a
   move being made. seatOf maps a band member to its seat (1-20); state
   gives the wall (its hidden places only when reveal). */
function zbCavesDiagram(level, band, { state = null, reveal = false, seatOf = new Map(), waiting = [], left = [], move = null, mistakes = null, caption = '' }) {
  const W = 800, H = 540, items = [], n = band.length, first = 21 - n;
  const at = seat => { const [x, y] = ZB_CAVES_SEAT_PLACES[seat - 1]; return [Math.round(150 + (x - 254) * 2), Math.round(110 + (y - 140) * 1.8)]; };
  /* The path under the stones, then the stones. */
  const path = [];
  for (let seat = 1; seat <= 20; seat++) path.push(...at(seat));
  items.push({ t: 'poly', points: path, closed: false, stroke: 'line', width: 26 });
  for (let seat = 1; seat <= 20; seat++) {
    const [x, y] = at(seat), used = seat >= first;
    items.push({ t: 'rect', x: x - 21, y: y - 8, w: 42, h: 16, r: 5, fill: used ? '#b8913a' : 'stone', stroke: 'line', faded: !used });
    if (used) items.push({ t: 'text', x: x + 27, y: y + 5, text: String(zbCavesStone(seat)), size: 10, fill: 'dim' });
  }
  items.push({ t: 'text', x: 700, y: 196, text: 'the lion', size: 13, fill: 'dim', anchor: 'middle' });
  /* The wall: two rows of five places, the first trait's along the top. */
  const rule = state ? zbCavesRule(state) : null, vis = state ? state.ruleGlyphVisibility : new Array(11).fill(0);
  const rows = level >= 3 || !state ? 2 : 1;
  items.push({ t: 'rect', x: 440, y: 8, w: 350, h: 22 + rows * 52, r: 6, fill: 'panel', stroke: 'line' });
  items.push({ t: 'text', x: 450, y: 24, text: 'the wall', size: 11, fill: 'dim' });
  for (let row = 0; row < rows; row++) {
    const kind = rule ? (row ? rule.secondary : rule.primary) : null, order = rule ? rule.orders[row] : null;
    const any = [1, 2, 3, 4, 5].some(k => vis[row * 5 + k]);
    items.push({ t: 'text', x: 450, y: 60 + row * 52, text: kind && (any || reveal) ? `by ${kind}` : 'by ?', size: 12, fill: 'ink' });
    for (let k = 1; k <= 5; k++) {
      const x = 540 + (k - 1) * 50, y = 54 + row * 52, shown = vis[row * 5 + k];
      items.push({ t: 'rect', x: x - 20, y: y - 20, w: 40, h: 40, r: 4, fill: 'stone', stroke: 'line', dash: shown ? null : true, faded: !shown });
      if (kind && (shown || reveal)) items.push({ t: 'trait', kind, value: order[k - 1], x, y, faded: !shown });
    }
  }
  /* The band: on its stones, waiting on the ledge, or left behind. */
  for (const [i, seat] of seatOf) { const [x, y] = at(seat); items.push({ t: 'zoombini', i, x, y: y + 2 }); }
  items.push(...zbDiagramRows(waiting, 24, 250, 4, 44, 64));
  items.push(...zbDiagramRows(left, 24, 250 + 64 * Math.ceil(waiting.length / 4), 4, 44, 64, { faded: true }));
  if (move) {
    const [x, y] = at(move.seat);
    items.push({ t: 'circle', x, y: y - 18, r: 28, stroke: 'accent', width: 2.5 });
    items.push({ t: 'zoombini', i: move.i, x, y: y + 2 });
  }
  if (waiting.length || left.length) items.push({ t: 'text', x: 24, y: 185, text: left.length && !waiting.length ? 'left behind' : 'waiting', size: 12, fill: 'dim' });
  items.push({ t: 'text', x: 10, y: 24, text: caption, size: 15, fill: 'ink' });
  if (mistakes) items.push({ t: 'text', x: 10, y: 44, text: `mistakes: ${mistakes[0]} of ${mistakes[1]}`, size: 13, fill: mistakes[0] ? 'warn' : 'dim' });
  return { width: W, height: H, items };
}

/* The lair with the order unknown. The hypotheses are the rules the
   program could deal this band at this level that agree with the wall
   (opts.state gives the wall; without it the wall is taken as unseen, as
   at level 4). To the player a rule is only which stones each band member
   fits, a run of them, so rules alike in that are one hypothesis, weighed
   by how many rules they stand for. A move puts a waiting Zoombini on a
   free stone: it stays, or it is walked to a free stone of its own run,
   one the game draws at random and here the worst for the player, and a
   mistake is counted; after the last mistake allowed no one else may be
   placed. A Zoombini every hypothesis left puts on some free stone is
   placed there first, at no cost. A move that might go either way rules
   out at least one hypothesis whatever happens, so with no more
   hypotheses than mistakes left everyone left is sure.

   The search is minimax with memoisation, stopping short where it has
   shown enough, the moves tried sharpest first: the move whose worst
   outcome leaves the fewest hypotheses. Where the hypotheses are many
   (over 60) only the sharpest move is followed, the rule of thumb, though
   every outcome of it is; where there are some (over 12) the sharpest
   one, then four, then twelve; where there are few, every move. While
   there is time the search goes round again, wider, until every move is
   tried everywhere.
   Where the budget runs out, a state is valued at what any play is sure
   of there, one placement for each mistake left, and the play goes on
   from it by a fresh search when it is reached. */
function zbCavesStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program';
  const n = band.length, two = level >= 3, limit = ZB_CAVES_MISTAKES[level - 1];
  /* Only what the player sees of the puzzle is read from opts.state: the
     wall, which places it shows, their values, and the trait of a row
     that shows any (a symbol is a trait's value). Never the rest. */
  const state = opts.state && opts.state.ruleGlyphVisibility ? opts.state : null;
  const vis = state ? state.ruleGlyphVisibility : new Array(11).fill(0);
  const deadline = Date.now() + (opts.budget || 1500);
  const clues = row => [1, 2, 3, 4, 5].filter(k => vis[row * 5 + k]).map(k => [k, state.ruleTraitValues[row * 5 + k - 1]]);
  const top = clues(0), below = clues(1);
  const primaries = top.length ? [state.primaryRuleTraitKind] : ZB_TRAIT_KINDS;
  /* The orders of the values present in the band, each with the number of
     the five values' orders (agreeing with the wall's row) behind it. */
  const orders = (present, row) => {
    const out = new Map();
    for (const p of ZB_CAVES_PERMS) {
      if (row.some(([k, v]) => p[k - 1] !== v)) continue;
      const seq = p.filter(v => present.includes(v)), key = seq.join('');
      out.set(key, { seq, w: (out.get(key) || { w: 0 }).w + 1 });
    }
    return [...out.values()];
  };
  /* The hypotheses: for each, the first and last stone (0 to n - 1) each
     band member fits, LO[h * n + i] and HI[h * n + i]. A rule is its
     groups' order; each group is written as its first member's letter,
     once a stone, and rules that write the same are one. */
  const pairs = [];
  for (const kP of primaries) {
    for (const kS of two ? (below.length ? [state.secondaryRuleTraitKind] : ZB_TRAIT_KINDS.filter(k => k !== kP)) : [null]) {
      const key = z => two ? z[kP] * 8 + z[kS] : z[kP];
      const owner = band.map(z => band.findIndex(y => key(y) === key(z)));
      const size = owner.map(o => owner.filter(x => x === o).length);
      const groups = [...new Set(owner)].map(o => ({ o, p: band[o][kP], s: two ? band[o][kS] : 0, text: String.fromCharCode(65 + o).repeat(size[o]) }));
      pairs.push({ owner, size, groups, oP: orders([...new Set(groups.map(g => g.p))], top),
        oS: two ? orders([...new Set(groups.map(g => g.s))], below) : [{ seq: [0], w: 1 }] });
    }
  }
  const cap = pairs.reduce((t, q) => t + q.oP.length * q.oS.length, 0);
  let LO = new Uint8Array(cap * n), HI = new Uint8Array(cap * n);
  const WT = [], seen = new Map();
  for (const { owner, size, groups, oP, oS } of pairs) {
    for (const b of oS) {
      /* Each primary value's groups, in this secondary order, as text. */
      const chunk = [];
      for (const v of b.seq) for (const g of groups) if (g.s === v) chunk[g.p] = (chunk[g.p] || '') + g.text;
      for (const a of oP) {
        let sig = '';
        for (const v of a.seq) sig += chunk[v];
        let h = seen.get(sig);
        if (h === undefined) {
          h = WT.length; seen.set(sig, h); WT.push(0);
          const start = [];
          for (let j = n - 1; j >= 0; j--) start[sig.charCodeAt(j) - 65] = j;
          for (let i = 0; i < n; i++) { LO[h * n + i] = start[owner[i]]; HI[h * n + i] = start[owner[i]] + size[i] - 1; }
        }
        WT[h] += a.w * b.w;
      }
    }
  }
  LO = LO.slice(0, WT.length * n); HI = HI.slice(0, WT.length * n);
  /* Identical Zoombinis are one: the first of them still waiting moves. */
  const typeOf = band.map((z, i) => band.findIndex(y => y.hair === z.hair && y.eyes === z.eyes && y.nose === z.nose && y.feet === z.feet));
  const types = [...new Set(typeOf)];
  const bits = x => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
  const weight = H => { let t = 0; for (const h of H) t += WT[h]; return t; };
  const membersOf = new Map(types.map(t => [t, band.map((_, i) => i).filter(i => typeOf[i] === t)]));
  const firstOf = (t, rem) => { for (const i of membersOf.get(t)) if (rem >> i & 1) return i; return -1; };
  const fits = (h, z, j) => LO[h * n + z] <= j && j <= HI[h * n + z];
  /* The Zoombinis every hypothesis puts on some free stone, placed. */
  const settle = (H, occ, rem) => {
    const placed = [];
    for (const t of types) {
      let z = firstOf(t, rem);
      if (z < 0) continue;
      let L = 0, R = n - 1;
      for (let k = 0; k < H.length; k++) { const q = H[k] * n + z; if (LO[q] > L) L = LO[q]; if (HI[q] < R) R = HI[q]; }
      for (let j = L; j <= R && z >= 0; j++) {
        if (occ >> j & 1) continue;
        occ |= 1 << j; rem &= ~(1 << z); placed.push([z, j]);
        z = firstOf(t, rem);
      }
    }
    return { occ, rem, placed };
  };
  /* The moves that might stay and might not: with c, how many hypotheses
     it stays in, and (where they are many) worst, the most any outcome
     leaves. */
  const A = new Int32Array(n), B = new Int32Array(n * n);
  const moves = (H, occ, rem, sharp) => {
    const out = [];
    for (const t of types) {
      const z = firstOf(t, rem);
      if (z < 0) continue;
      A.fill(0);
      if (sharp) B.fill(0);
      for (let k = 0; k < H.length; k++) {
        const q = H[k] * n + z, lo = LO[q], hi = HI[q];
        for (let j = lo; j <= hi; j++) {
          A[j]++;
          if (sharp) for (let T = lo; T <= hi; T++) B[j * n + T]++;
        }
      }
      for (let j = 0; j < n; j++) {
        if (occ >> j & 1 || A[j] === 0 || A[j] === H.length) continue;
        let worst = A[j];
        if (sharp) for (let T = 0; T < n; T++) if (T !== j && !(occ >> T & 1) && A[T] - B[j * n + T] > worst) worst = A[T] - B[j * n + T];
        out.push({ z, j, c: A[j], worst });
      }
    }
    return out;
  };
  const sharpest = ms => ms.sort((a, b) => a.worst - b.worst || b.c - a.c || a.j - b.j || a.z - b.z);
  const split = (H, z, j) => {
    const stays = [], wrong = [];
    for (const h of H) (fits(h, z, j) ? stays : wrong).push(h);
    return { stays, wrong };
  };
  const walked = (wrong, z, occ) => {
    const out = [];
    for (let T = 0; T < n; T++) {
      if (occ >> T & 1) continue;
      const H2 = wrong.filter(h => fits(h, z, T));
      if (H2.length) out.push({ T, H: H2 });
    }
    return out;
  };
  const keys = new WeakMap();
  const hkey = H => {
    let k = keys.get(H);
    if (!k) { let a = 2166136261, b = 0; for (const x of H) { a = Math.imul(a ^ x, 16777619); b = (b + Math.imul(x + 1, 2654435761)) | 0; } k = `${H.length}.${a >>> 0}.${b >>> 0}`; keys.set(H, k); }
    return k;
  };
  const FEW = 60, SOME = 12;
  let caps = [1, 4];
  const memo = new Map();
  let cuts = 0, until = deadline;
  /* The most sure to be placed from here, free placements included; the
     search stops once it has shown enough, at least beta. A memo entry is
     exact, or a value shown to be sure. */
  const value = (H, occ, rem, m, beta = Infinity) => {
    const f = settle(H, occ, rem);
    occ = f.occ; rem = f.rem;
    const base = f.placed.length, r = bits(rem);
    if (!r) return base;
    /* Enough mistakes for everyone left; or for every hypothesis but one,
       each move that might go either way ruling out at least one. */
    if (m >= r || H.length <= m) return base + r;
    const want = Math.min(r, beta - base);
    const key = `${hkey(H)}|${occ}|${rem}|${m}`, e = memo.get(key);
    if (e && (e.exact || e.v >= want)) return base + e.v;
    if (Date.now() > until) { cuts++; return base + (e ? e.v : m); }
    const before = cuts;
    let ms = moves(H, occ, rem, true);
    const cap = H.length > FEW ? caps[0] : H.length > SOME ? caps[1] : Infinity;
    sharpest(ms);
    if (ms.length > cap) { ms = ms.slice(0, cap); cuts++; }
    let best = e ? e.v : m, bestMove = e ? e.move : ms[0];
    for (const mv of ms) {
      if (best >= want) break;
      if (mv !== ms[0] && Date.now() > until) { cuts++; break; }
      const v = tryMove(H, occ, rem, m, mv, best, r);
      if (v > best) { best = v; bestMove = mv; }
    }
    memo.set(key, { v: best, move: bestMove, exact: cuts === before && (best >= r || best < want) });
    return base + best;
  };
  /* A move's worst outcome, given up as soon as it is no better than
     bound; the outcomes keeping the most hypotheses first. */
  const tryMove = (H, occ, rem, m, mv, bound, r) => {
    const { stays, wrong } = split(H, mv.z, mv.j), rem2 = rem & ~(1 << mv.z);
    let worst = r;
    if (wrong.length) {
      if (m === 1) worst = 1;
      else {
        for (const w of walked(wrong, mv.z, occ).sort((a, b) => b.H.length - a.H.length)) {
          worst = Math.min(worst, 1 + value(w.H, occ | 1 << w.T, rem2, m - 1, worst - 1));
          if (worst <= bound) return worst;
        }
      }
    }
    if (stays.length && worst > bound) worst = Math.min(worst, 1 + value(stays, occ | 1 << mv.j, rem2, m, worst - 1));
    return worst;
  };
  const H0 = Int32Array.from(WT.keys());
  const full = (1 << n) - 1;
  /* Wider each time round while there is time: the moves tried where the
     hypotheses are many, and where they are some. */
  let sure = 0;
  for (const c of [[1, 1], [1, 4], [1, 12], [2, Infinity], [Infinity, Infinity]]) {
    caps = c; cuts = 0;
    sure = value(H0, 0, full, limit);
    if (!cuts || sure === n || Date.now() > deadline) break;
  }
  const exact = cuts === 0 || sure === n;
  /* The play, a node at a time, made when asked. */
  const stone = j => 17 - n + j;
  const seatOfJ = j => 21 - n + j;
  const node = (H, occ, rem, m, placed) => {
    /* After the last mistake no one else is placed, sure or not. */
    const f = m > 0 ? settle(H, occ, rem) : { occ, rem, placed: [] };
    const pm = new Map(placed);
    for (const [z, j] of f.placed) pm.set(z, j);
    occ = f.occ; rem = f.rem;
    const r = bits(rem), across = pm.size, made = limit - m;
    const sureWords = f.placed.length ? `Sure now: ${zbWordsOr(f.placed.map(([z, j]) => `Zoombini ${z + 1} on stone ${stone(j)}`), 'and')}. ` : '';
    const seatOf = new Map([...pm].map(([z, j]) => [z, seatOfJ(j)]));
    const waitingNow = [...Array(n).keys()].filter(i => rem >> i & 1);
    const draw = (extra, caption) => zbCavesDiagram(level, band, Object.assign({ state, seatOf, mistakes: [made, limit], caption }, extra));
    if (!r || !m) {
      return { move: !r ? `${sureWords}All ${across} are on the path, and cross.` : `${sureWords}That was the last mistake allowed: ${across} cross, and ${r} stay${r === 1 ? 's' : ''} behind.`,
        zoombini: null, left: weight(H), crossed: across, outcomes: [],
        diagram: draw({ left: waitingNow }, !r ? `All ${across} on the path` : `${across} on the path, ${r} left behind`) };
    }
    const key = `${hkey(H)}|${occ}|${rem}|${m}`;
    if (!(memo.get(key) || {}).move && m < r) {
      /* Not reached by the search at the start: search from here now,
         briefly. Any move is sure of what was counted for it. */
      const saved = cuts;
      until = Date.now() + 300;
      value(H, occ, rem, m);
      cuts = saved;
    }
    const mv = (memo.get(key) || {}).move || sharpest(moves(H, occ, rem, true))[0];
    const { stays, wrong } = split(H, mv.z, mv.j), rem2 = rem & ~(1 << mv.z);
    const outcomes = [];
    if (stays.length) {
      outcomes.push({ label: `It stays (${weight(stays)} left)`, left: weight(stays),
        next: () => node(Int32Array.from(stays), occ | 1 << mv.j, rem2, m, [...pm, [mv.z, mv.j]]) });
    }
    for (const w of walked(wrong, mv.z, occ)) {
      outcomes.push({ label: `It is walked to stone ${stone(w.T)}: a mistake${m === 1 ? ', the last allowed' : ''} (${weight(w.H)} left)`, left: weight(w.H),
        next: () => node(Int32Array.from(w.H), occ | 1 << w.T, rem2, m - 1, [...pm, [mv.z, w.T]]) });
    }
    return {
      move: `${sureWords}Put Zoombini ${mv.z + 1} on stone ${stone(mv.j)}.`,
      zoombini: mv.z, left: weight(H), crossed: across,
      diagram: draw({ waiting: waitingNow.filter(i => i !== mv.z), move: { i: mv.z, seat: seatOfJ(mv.j) } }, `${weight(H)} rules left`),
      outcomes,
    };
  };
  const hyp = weight(H0);
  return {
    hypotheses: hyp, sure, exact, knows,
    root: node(H0, 0, full, limit, []),
    notes: [
      `${state ? zbCavesWallWords(level, state) : 'The wall is not given, so it is taken as unseen.'} The rules the program could deal that agree with it number ${hyp}, ${H0.length} different to this band.`,
      'The player who knows only the level’s form has the same hypotheses: the program draws every trait and order alike. (The first Lion’s Lair after the program starts is by nose, which a player could know; this does not assume it.)',
      'Each placement goes on even when it is a mistake, so as many placements as there are mistakes allowed are sure whatever happens; the question is how many more can be made without a mistake.',
      'A Zoombini every hypothesis left puts on some free stone goes there first, at no cost; otherwise the move is the one whose worst outcome still places the most, a mistake’s stone (which the game draws at random) taken as the worst for the player.',
      exact ? 'The search is complete: no way of playing is sure of more.' : 'The search stopped short (at its budget, or following only the rule of thumb where the hypotheses are many), so this many are sure, and perhaps more could be.',
    ],
  };
}
