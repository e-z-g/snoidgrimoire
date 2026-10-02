/* zb-puzzle-fleens.js -- Fleens!: a Fleen for every Zoombini, three of them
   on the beehive branch, to be lured off.
   =========================================================================
   Needs zb-puzzle.js.

   Each Zoombini in the band has a Fleen, sitting in the trees: three of
   the Fleens on the beehive branch, the rest on the other branches.
   The player sends a Zoombini down the lure path, and its own Fleen chases
   it off its branch. When the three on the beehive branch have been lured
   off, the bees chase the Fleens away and the band may go on. Hidden is how
   a Fleen goes with its Zoombini: for each Zoombini trait, the Fleen trait
   it becomes (hair, eyes, nose or feet) and a turn of its five values.

   Every Zoombini sent, whether its Fleen was on the beehive branch or not,
   waits on another branch, which holds six; when a seventh is sent, the
   first still waiting goes back to Shelter Rock, and so for each after.
   The three the puzzle needs wait there too, so three wrong guesses cost
   nothing.

   What is dealt, in the program's order. First the three Zoombinis whose
   Fleens sit on the beehive branch: a place in the band from 1 to its
   size, then another different from it, then a third different from both
   (with only one or two Zoombinis, all of them, and the puzzle counts the
   missing ones as lured already). The beehive's three places go to them in
   band order. Then the values: for each of hair, eyes, nose and feet a
   turn from 1 to 5, and a Zoombini value v becomes the Fleen value
   (turn + v - 2) mod 5 + 1, so a turn of 1 keeps the numbers. Then the
   traits: at levels 1 and 2 each Zoombini trait becomes the same Fleen
   trait; at levels 3 and 4 hair becomes the Fleen's eyes, nose or feet (2
   to 4), and eyes, nose and feet take the other three in an order drawn
   without repeats, so any of them may keep its own. The saved game keeps
   both: levels 1 and 3 draw the values only if no visit has, levels 2 and
   4 on every visit; level 3 draws the traits only if none are kept, level
   4 on every visit, and levels 1 and 2 clear them, so a visit at either
   makes level 3 draw them anew.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_fleens.cpp and .h
   (buildZmbTraitSetup, spawnFleenCreatures, beginBoardingAnimation, the
   seventh pair's eviction in processInitialLureOrSubmittedPairEscapeEvent,
   shiftDepartureQueue, debugGetChances), checked against the program's own
   code. ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z deals the Fleens at
   0x41d738: the three places at 0x41d7aa, with random(1, size) at
   0x410471, and the count already lured for one or two Zoombinis; the
   values' turns at 0x41d88e, when the saved turn for hair is 0 or the
   level (0-3, from 0x4563d7, in the word at 0x4ab08a) is 1 or 3; the
   traits at 0x41d8b7 when the level is 2 or 3, if the saved one for hair
   is 0 or the level is 3, by random(2, 4) and then the non-repeating draw
   at 0x46e3a4 through the table 1, 2, 3, 4 at 0x4a1034, which ZOOMBINI.EXE
   has before "Fleens.MHK" too, and clears them at levels 0 and 1; the
   Fleen of each Zoombini at 0x41d95f, and its branch at 0x41d9d1. A
   Zoombini sent counts toward the three at 0x41c6bf only if it is one of
   the three dealt, and joins the waiting pairs there in any case; at seven
   the first is sent back (0x41e2c2). The Mac build's INSTALLFLEENS draws
   the same in the same order, and its FLEENSNOIDCALLBACKPROC sends back
   the first of seven. ScummVM reads all of it the same. The Fleen trait
   names are the Zoombini maker's, in the order of ScummVM's FleenTrait.
*/

/* Fleen traits, 1-5 at 0-4, in the maker's words (e-z-g.github.io/zoombinis),
   short and as they read after "with"; ScummVM's FleenTrait order. */
const ZB_FLEENS_TRAIT_SHORT = {
  hair: ['Blue quiff', 'Grass tuft', 'Red bandana', 'Mohawk', 'Horned helmet'],
  eyes: ['Lashes', 'Bandit mask', 'Stacked eyes', 'Pink glasses', 'Visor'],
  nose: ['Grey', 'Peach', 'Yellow', 'Teal', 'Lilac'],
  feet: ['Bare feet', 'Red shoes', 'Wheels', 'Tank treads', 'Rockets'],
};
const ZB_FLEENS_TRAIT_WITH = {
  hair: ['a blue quiff', 'a grass tuft', 'a red bandana', 'a mohawk', 'a horned helmet'],
  eyes: ['lashes', 'a bandit mask', 'stacked eyes', 'pink glasses', 'a visor'],
  nose: ['a grey nose', 'a peach nose', 'a yellow nose', 'a teal nose', 'a lilac nose'],
  feet: ['bare feet', 'red shoes', 'wheels', 'tank treads', 'rockets'],
};
/* The beehive branch's places, and the Zoombinis a waiting branch holds. */
const ZB_FLEENS_HIVE = 3;
const ZB_FLEENS_WAITING = 6;

/* A Fleen in a few words: "Mohawk, visor, teal nose, rockets". */
function zbFleensWords(f) {
  return `${ZB_FLEENS_TRAIT_SHORT.hair[f.hair - 1]}, ${ZB_FLEENS_TRAIT_SHORT.eyes[f.eyes - 1].toLowerCase()}, `
    + `${ZB_FLEENS_TRAIT_SHORT.nose[f.nose - 1].toLowerCase()} nose, ${ZB_FLEENS_TRAIT_SHORT.feet[f.feet - 1].toLowerCase()}`;
}

/* The Fleen a Zoombini has, given the turns (1-5 by Zoombini trait) and
   the Fleen trait each Zoombini trait becomes. */
function zbFleensOf(z, rotations, kinds) {
  const f = {};
  ZB_TRAIT_KINDS.forEach((k, i) => { f[kinds[i]] = (rotations[i] + z[k] - 2) % 5 + 1; });
  return f;
}

/* The dealing. journey keeps what the saved game keeps between visits:
   fleensTraitValueRotations and fleensTraitDestSlots (ScummVM's
   _v1FleensTraitValueRotations and _v1FleensTraitDestSlots: a turn per
   Zoombini trait, 0 before any is drawn; the Fleen trait each becomes,
   1-4, or 0 for its own). */
function zbFleensDeal(level, band, rnd, journey) {
  const n = band.length, targets = [0, 0, 0];
  targets[0] = rnd.range(1, n);
  const matched = n === 1 ? 2 : n === 2 ? 1 : 0;
  if (n >= 2) do targets[1] = rnd.range(1, n); while (targets[1] === targets[0]);
  if (n >= 3) do targets[2] = rnd.range(1, n); while (targets[2] === targets[0] || targets[2] === targets[1]);

  const rotations = (journey.fleensTraitValueRotations || [0, 0, 0, 0]).slice();
  const slots = (journey.fleensTraitDestSlots || [0, 0, 0, 0]).slice();
  const drawRotations = rotations[0] === 0 || level === 2 || level === 4;
  if (drawRotations) for (let i = 0; i < 4; i++) rotations[i] = rnd.range(1, 5);
  const drawSlots = level >= 3 && (slots[0] === 0 || level === 4);
  if (level <= 2) slots.fill(0);
  else if (drawSlots) {
    // Hair never becomes the Fleen's hair; the rest take the other three.
    slots[0] = rnd.range(2, 4);
    const used = { bits: 1 << (slots[0] - 1) };
    for (let i = 1; i < 4; i++) slots[i] = rnd.nonRepeat(4, used) + 1;
  }
  journey.fleensTraitValueRotations = rotations.slice();
  journey.fleensTraitDestSlots = slots.slice();
  const kinds = slots.map((s, i) => ZB_TRAIT_KINDS[s ? s - 1 : i]);
  return {
    targetSnoidOrdinals: targets,
    matchedTargetCount: matched,
    traitValueRotations: rotations,
    traitDestSlots: slots,
    traitDestinationKinds: kinds,
    rotationsKept: !drawRotations,
    destSlotsKept: level >= 3 && !drawSlots,
    fleens: band.map(z => zbFleensOf(z, rotations, kinds)),
  };
}

/* ---- the puzzle taken apart --------------------------------------------- */

/* A Fleen's looks as a number, 0-624, as zbZoombiniId numbers a Zoombini's. */
function zbFleensLook(f) { return 125 * (f.hair - 1) + 25 * (f.eyes - 1) + 5 * (f.nose - 1) + (f.feet - 1); }
function zbFleensFromLook(id) { return { hair: Math.floor(id / 125) + 1, eyes: Math.floor(id / 25) % 5 + 1, nose: Math.floor(id / 5) % 5 + 1, feet: id % 5 + 1 }; }
/* The beehive's Zoombinis in a state, as band indices, lowest first. */
function zbFleensTargets(state) { return state.targetSnoidOrdinals.filter(t => t > 0).map(t => t - 1).sort((a, b) => a - b); }
/* What the band sees on arrival, without who has which Fleen: the looks of
   the beehive's Fleens and of all the Fleens, each sorted. */
function zbFleensVisible(state) {
  const looks = state.fleens.map(zbFleensLook);
  return { hive: zbFleensTargets(state).map(i => looks[i]).sort((a, b) => a - b), all: looks.slice().sort((a, b) => a - b) };
}
/* The mixings of the traits a level may have: the Fleen trait each
   Zoombini trait becomes, as destination slots 1-4 (0 for its own). The
   program's: levels 1 and 2 none, 3 and 4 hair to 2-4 and the rest the
   other three in any order, 18; the form's at 3 and 4 any order, 24. */
function zbFleensMixings(level, knows) {
  if (level <= 2) return [[0, 0, 0, 0]];
  const out = [], perm = (rest, acc) => { if (!rest.length) { out.push(acc); return; } rest.forEach((v, k) => perm(rest.filter((_, j) => j !== k), acc.concat(v))); };
  perm([1, 2, 3, 4], []);
  return out.filter(p => knows === 'form' || p[0] !== 1);
}
function zbFleensKinds(slots) { return slots.map((v, i) => ZB_TRAIT_KINDS[v ? v - 1 : i]); }

/* The Fleens drawn: the beehive branch with its Fleens, the other
   branches with theirs (a Fleen as a card of its traits' words; the
   drawing of a Fleen is not read yet), what goes with what, as far as it
   is known (Zoombini traits as their sprites, the Fleen value under each),
   and the band: not sent yet, waiting on the branch, sent back to Shelter
   Rock (faded), or across.
     hive, others: [{ look, by (band index or null), lured }]
     grid: per Zoombini trait, { to: the Fleen trait or null, values: the
           Fleen value for each Zoombini value, or null } */
function zbFleensDiagram(level, band, { hive, others, grid, unsent = [], waiting = [], lost = [], across = [], sending = null, caption = '' }) {
  const W = 800, H = 580, items = [];
  items.push({ t: 'text', x: 16, y: 24, text: caption, size: 15, fill: 'ink' });
  const card = (x, y, w, f, { stroke = 'line', by = null, lured = false, gone = false } = {}) => {
    if (f == null) {
      items.push({ t: 'rect', x, y, w, h: 54, r: 6, fill: 'panel', stroke, dash: true });
      items.push({ t: 'text', x: x + w / 2, y: y + 33, text: 'not read', size: 11, anchor: 'middle', fill: 'dim' });
      return;
    }
    const look = zbFleensFromLook(f);
    items.push({ t: 'rect', x, y, w, h: 54, r: 6, fill: 'panel', stroke: lured ? 'good' : stroke, width: stroke === 'line' && !lured ? 1.5 : 2.5, faded: gone });
    const words = [ZB_FLEENS_TRAIT_SHORT.hair[look.hair - 1], ZB_FLEENS_TRAIT_SHORT.eyes[look.eyes - 1], `${ZB_FLEENS_TRAIT_SHORT.nose[look.nose - 1]} nose`, ZB_FLEENS_TRAIT_SHORT.feet[look.feet - 1]];
    words.forEach((t, k) => items.push({ t: 'text', x: x + w / 2, y: y + 14 + k * 11, text: t, size: 9.5, anchor: 'middle', fill: 'ink', faded: gone }));
    if (by != null) items.push({ t: 'text', x: x + w / 2, y: y + 66, text: `Zoombini ${by + 1}’s${lured ? ', lured off' : ''}`, size: 10, anchor: 'middle', fill: lured ? 'good' : 'dim' });
  };
  // The beehive branch.
  items.push({ t: 'line', x1: 20, y1: 122, x2: 440, y2: 122, stroke: 'wood', width: 7 });
  items.push({ t: 'circle', x: 50, y: 78, r: 24, fill: 'warn', stroke: 'line' });
  for (let k = 0; k < 3; k++) items.push({ t: 'line', x1: 32, y1: 66 + k * 12, x2: 68, y2: 66 + k * 12, stroke: 'wood', width: 1.5 });
  items.push({ t: 'text', x: 18, y: 142, text: 'the beehive branch', size: 11, fill: 'dim' });
  hive.forEach((h, k) => card(96 + k * 114, 40, 104, h.look, { stroke: 'accent', by: h.by, lured: h.lured, gone: h.gone }));
  // The other branches.
  items.push({ t: 'text', x: 16, y: 168, text: others.length ? 'on the other branches' : hive.some(h => h.look == null) ? 'the Fleens’ looks are not read' : 'no Fleen on the other branches', size: 11, fill: 'dim' });
  others.forEach((o, k) => card(16 + (k % 5) * 88, 176 + Math.floor(k / 5) * 72, 82, o.look, { by: o.by, gone: o.gone }));
  // What goes with what.
  items.push({ t: 'text', x: 470, y: 42, text: 'Zoombini trait and the Fleen trait it becomes', size: 11, fill: 'dim' });
  ZB_TRAIT_KINDS.forEach((kind, r) => {
    const g = grid[r], y = 62 + r * 74;
    items.push({ t: 'text', x: 470, y, text: `${kind} → ${g.to ? `Fleen ${g.to}` : 'a Fleen trait not known yet'}`, size: 11, fill: g.to ? 'ink' : 'warn' });
    for (let v = 1; v <= 5; v++) {
      const x = 500 + (v - 1) * 62, fv = g.values ? g.values[v - 1] : null;
      items.push({ t: 'trait', kind, value: v, x, y: y + 22, scale: 1.5 });
      const word = fv == null ? '?' : (g.to === 'nose' ? `${ZB_FLEENS_TRAIT_SHORT.nose[fv - 1]} nose` : ZB_FLEENS_TRAIT_SHORT[g.to][fv - 1]);
      items.push({ t: 'text', x, y: y + 52, text: word, size: 9.5, anchor: 'middle', fill: fv == null ? 'warn' : 'ink' });
    }
  });
  // The band.
  const row = (list, x, per, header, extra = {}) => {
    items.push({ t: 'text', x, y: 408, text: header, size: 11, fill: 'dim' });
    list.forEach((i, k) => {
      const zx = x + 18 + (k % per) * 36, zy = 460 + Math.floor(k / per) * 58;
      if (i === sending) items.push({ t: 'circle', x: zx, y: zy - 20, r: 19, fill: null, stroke: 'accent', width: 2 });
      items.push(Object.assign({ t: 'zoombini', i, x: zx, y: zy }, extra));
    });
  };
  if (across.length || !(unsent.length || waiting.length || lost.length)) row(across, 16, 20, across.length ? `across: all ${across.length} who are left` : 'no one crosses');
  else {
    row(unsent, 16, 8, unsent.length ? `not sent yet${sending != null ? `; Zoombini ${sending + 1} goes now` : ''}` : 'all sent');
    row(waiting, 316, 6, `waiting on the branch, ${waiting.length} of 6`);
    row(lost, 548, 7, lost.length ? 'sent back to Shelter Rock' : '', { faded: true });
  }
  return { width: W, height: H, items };
}
/* The grid for a known mapping. */
function zbFleensGrid(rotations, kinds) {
  return ZB_TRAIT_KINDS.map((k, i) => ({ to: kinds[i], values: [1, 2, 3, 4, 5].map(v => (rotations[i] + v - 2) % 5 + 1) }));
}

/* ---- the answer unknown -----------------------------------------------------

   The player sees the band and the Fleens: which looks sit on the beehive
   branch and which on the others, but not whose each is. The hypotheses
   are every mapping of the level (the turns, 5 a trait, and the mixings
   above) whose Fleens for this band are the ones seen, each with every
   choice of the band's Zoombinis whose Fleens could be the beehive's (two
   alike Zoombinis have Fleens alike, and either may be the one); what the
   player can tell apart is only each band member's Fleen and whether it is
   a beehive one, so hypotheses alike in those are one. A move sends a
   Zoombini; its Fleen follows it, from the beehive or not, and its looks
   tell the player whose it is. The cost is the Zoombinis sent: six wait,
   and each sent after the sixth sends the first waiting back to Shelter
   Rock. The search is minimax over the Zoombinis to send, remembering
   every position; the spaces are small once the Fleens seen are taken
   in. When the deal is not given (opts.state), nothing is seen, the
   player learns only whether a beehive Fleen follows, and any three of the
   band may be the beehive's; sending in band order is then as good as
   anything. At levels 1 and 3, with knows 'program', turns (and at 3 a
   mixing) kept from the last visit are taken to be remembered. */
function zbFleensHypotheses(level, band, state, knows) {
  const vis = zbFleensVisible(state), n = band.length, want = Math.min(3, n);
  const remember = knows === 'program' && state.rotationsKept;
  const mixings = remember && (level <= 2 || state.destSlotsKept) ? [state.traitDestSlots.slice()] : zbFleensMixings(level, knows);
  const H = new Map();
  for (const slots of mixings) {
    const kinds = zbFleensKinds(slots);
    for (let r = 0; r < 625; r++) {
      const rot = remember ? state.traitValueRotations : [Math.floor(r / 125) + 1, Math.floor(r / 25) % 5 + 1, Math.floor(r / 5) % 5 + 1, r % 5 + 1];
      if (remember && r) break;
      const images = band.map(z => zbFleensLook(zbFleensOf(z, rot, kinds)));
      if (images.slice().sort((a, b) => a - b).join() !== vis.all.join()) continue;
      // Every choice of Zoombinis for the beehive's looks.
      const choices = [[]];
      const need = new Map();
      for (const look of vis.hive) need.set(look, (need.get(look) || 0) + 1);
      for (const [look, c] of need) {
        const who = images.map((im, i) => im === look ? i : -1).filter(i => i >= 0), next = [];
        const pick = (from, got) => { if (got.length === c) { for (const ch of choices) next.push(ch.concat(got)); return; } for (let k = from; k < who.length; k++) pick(k + 1, got.concat(who[k])); };
        pick(0, []);
        choices.splice(0, choices.length, ...next);
      }
      for (const ch of choices) {
        const mask = ch.reduce((m, i) => m | 1 << i, 0), key = `${images.join(',')}|${mask}`;
        const h = H.get(key) || { images, mask, weight: 0, maps: [] };
        h.weight++;
        h.maps.push({ rot: rot.slice(), kinds });
        H.set(key, h);
      }
    }
  }
  return { list: [...H.values()], want };
}
function zbFleensStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program', n = band.length, want = Math.min(3, n), state = opts.state || null;
  const cost = sent => Math.max(0, sent - ZB_FLEENS_WAITING);
  const notesHead = knows === 'form'
    ? `The player knows only the level’s form: ${level <= 2 ? 'trait for trait' : 'the traits mixed in any way at all (24 mixings)'}, any turns of the values.`
    : `The player knows how the program deals: ${level <= 2 ? 'trait for trait' : 'hair never to hair, the rest in any order (18 mixings)'}, any turns of the values${state && state.rotationsKept && level % 2 ? ', but this visit keeps the last one’s, which the player remembers' : ''}.`;
  if (!state) {
    // Nothing seen: any `want` of the band may be the beehive's.
    const choose = (a, b) => { let c = 1; for (let k = 0; k < b; k++) c = c * (a - k) / (k + 1); return Math.round(c); };
    const node = (sent, lured) => {
      const unsent = band.map((_, i) => i).slice(sent), waiting = band.map((_, i) => i).slice(Math.max(0, sent - ZB_FLEENS_WAITING), sent), lost = band.map((_, i) => i).slice(0, cost(sent));
      const left = choose(n - sent, want - lured), grid = ZB_TRAIT_KINDS.map(() => ({ to: null, values: null }));
      const hive = Array.from({ length: want }, (_, k) => ({ look: null, lured: k < lured }));
      const diagram = (s, cap, done) => zbFleensDiagram(level, band, { hive, others: [], grid, unsent: done ? [] : unsent, waiting: done ? [] : waiting, lost, across: done ? band.map((_, i) => i).filter(i => !lost.includes(i)) : [], sending: s, caption: cap });
      if (lured === want) return { move: `All ${want} beehive Fleen${want === 1 ? ' is' : 's are'} lured off: the bees chase the Fleens away, and the ${n - cost(sent)} left cross.`, zoombini: null, left, crossed: n - cost(sent), spent: sent - want, outcomes: [], diagram: diagram(null, `${n - cost(sent)} across`, true) };
      return {
        move: `Send Zoombini ${sent + 1} down the lure path.`, zoombini: sent, left, crossed: 0,
        diagram: diagram(sent, `${lured} of ${want} lured; ${left} ways the beehive’s may be left`),
        outcomes: [
          ...(want - lured <= n - sent ? [{ label: `A beehive Fleen follows it${cost(sent + 1) ? `; Zoombini ${cost(sent + 1)} is sent back` : ''}`, left: choose(n - sent - 1, want - lured - 1), hive: true, next: () => node(sent + 1, lured + 1) }] : []),
          ...(want - lured < n - sent ? [{ label: `A Fleen from another branch follows it${cost(sent + 1) ? `; Zoombini ${cost(sent + 1)} is sent back` : ''}`, left: choose(n - sent - 1, want - lured), hive: false, next: () => node(sent + 1, lured) }] : []),
        ],
      };
    };
    const sure = n - cost(n);
    return { hypotheses: choose(n, want), sure, exact: true, knows, root: node(0, 0),
      notes: [notesHead, `Without the dealt Fleens (opts.state) nothing is seen: the player learns only whether a beehive Fleen follows each one sent, and any ${want} of the band may be the beehive’s. So the worst case sends everyone, ${n}, and every order is as good.`,
        n > ZB_FLEENS_WAITING ? `Six wait on the branch, so ${cost(n)} may be sent back to Shelter Rock and ${sure} are sure to cross.` : 'Six wait on the branch, so no one is sent back: everyone crosses.'] };
  }
  const { list } = zbFleensHypotheses(level, band, state, knows), vis = zbFleensVisible(state);
  const memo = new Map(), deadline = Date.now() + (opts.budget || 1500);
  let exact = true;
  /* The fewest sends sure to finish, from hypotheses hs (indices into
     list) with the band members in sentMask sent and `lured` lured. */
  const split = (hs, z) => {
    const parts = new Map();
    for (const h of hs) { const k = `${list[h].images[z]}|${list[h].mask >> z & 1}`; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(h); }
    return [...parts.entries()].map(([k, hs2]) => ({ look: +k.split('|')[0], hive: k.endsWith('|1'), hs: hs2 }));
  };
  const value = (hs, sentMask, lured) => {
    if (lured === want) return { v: 0, z: -1 };
    const key = `${hs.join(',')}|${sentMask}|${lured}`;
    if (memo.has(key)) return memo.get(key);
    // Those most often the beehive's first; none can do better than one
    // send for each still to lure.
    const floor = want - lured, order = [];
    for (let z = 0; z < n; z++) if (!(sentMask >> z & 1)) order.push([z, hs.reduce((t, h) => t + (list[h].mask >> z & 1) * list[h].weight, 0)]);
    order.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    let best = { v: Infinity, z: -1 };
    const seen = new Set();
    for (const [z] of order) {
      const col = hs.map(h => `${list[h].images[z]}|${list[h].mask >> z & 1}`).join(',');
      if (seen.has(col)) continue;
      seen.add(col);
      let worst = 0;
      for (const part of split(hs, z)) { worst = Math.max(worst, 1 + value(part.hs, sentMask | 1 << z, lured + (part.hive ? 1 : 0)).v); if (worst >= best.v) break; }
      if (worst < best.v) best = { v: worst, z };
      if (best.v === floor) break;
      // Out of time: the likeliest first, as it is.
      if (Date.now() > deadline) { exact = false; break; }
    }
    memo.set(key, best);
    return best;
  };
  const all = list.map((_, i) => i), W = value(all, 0, 0).v, sure = n - cost(W);
  const weight = hs => hs.reduce((t, h) => t + list[h].weight, 0);
  const node = (hs, sentList, lured, history) => {
    const sentMask = sentList.reduce((m, i) => m | 1 << i, 0), sent = sentList.length;
    const lost = sentList.slice(0, cost(sent)), waiting = sentList.slice(cost(sent)), unsent = band.map((_, i) => i).filter(i => !(sentMask >> i & 1));
    // What is known: whose each seen Fleen is, and what goes with what.
    const hiveCards = vis.hive.map(look => ({ look, by: null, lured: false })), otherCards = [];
    const rest = vis.all.slice();
    for (const c of hiveCards) rest.splice(rest.indexOf(c.look), 1);
    otherCards.push(...rest.map(look => ({ look, by: null })));
    for (const hh of history) {
      const pool = hh.hive ? hiveCards : otherCards, c = pool.find(x => x.look === hh.look && x.by == null);
      if (c) { c.by = hh.z; c.lured = hh.hive; c.gone = true; }
    }
    const maps = hs.flatMap(h => list[h].maps);
    const grid = ZB_TRAIT_KINDS.map((k, i) => {
      const to = maps.every(m => m.kinds[i] === maps[0].kinds[i]) ? maps[0].kinds[i] : null;
      return { to, values: to && maps.every(m => m.rot[i] === maps[0].rot[i]) ? zbFleensGrid(maps[0].rot, maps[0].kinds)[i].values : null };
    });
    const diagram = (s, cap, done) => zbFleensDiagram(level, band, { hive: hiveCards, others: otherCards, grid, unsent: done ? [] : unsent, waiting: done ? [] : waiting, lost,
      across: done ? band.map((_, i) => i).filter(i => !lost.includes(i)) : [], sending: s, caption: cap });
    if (lured === want) return { move: `All ${want} beehive Fleen${want === 1 ? ' is' : 's are'} lured off: the bees chase the Fleens away, and the ${n - cost(sent)} left cross, having sent ${sent}.`,
      zoombini: null, left: weight(hs), crossed: n - cost(sent), spent: sent - want, outcomes: [], diagram: diagram(null, `${n - cost(sent)} across`, true) };
    const z = value(hs, sentMask, lured).z;
    return {
      move: `Send Zoombini ${z + 1} down the lure path.`, zoombini: z, left: weight(hs), crossed: 0,
      diagram: diagram(z, `${lured} of ${want} lured; ${weight(hs)} hypotheses left`),
      outcomes: split(hs, z).map(part => {
        const f = zbFleensFromLook(part.look), goes = cost(sent + 1) > cost(sent);
        return { label: `${part.hive ? 'A beehive Fleen' : 'A Fleen from another branch'} follows it: ${zbFleensWords(f)}${goes ? `; Zoombini ${sentList[cost(sent)] + 1} is sent back to Shelter Rock` : ''} (${weight(part.hs)} left)`,
          left: weight(part.hs), hive: part.hive, look: part.look,
          next: () => node(part.hs, sentList.concat(z), lured + (part.hive ? 1 : 0), history.concat({ z, look: part.look, hive: part.hive })) };
      }),
    };
  };
  return {
    hypotheses: weight(all), sure, exact: exact || W <= ZB_FLEENS_WAITING, knows,
    root: node(all, [], 0, []),
    notes: [notesHead,
      `The Fleens seen leave ${weight(all)} hypotheses (${list.length} the player can tell apart). Each Zoombini sent shows whose Fleen is whose by the Fleen that follows it.`,
      `Played so, at most ${W} are sent${W > ZB_FLEENS_WAITING ? `; six wait, so ${cost(W)} may be sent back to Shelter Rock and ${sure} are sure to cross` : ', and six may wait: everyone crosses'}. ${exact ? 'The search is complete: no play is sure of more.' : 'The search ran out of time and played the likeliest first; a better play may exist.'}`,
      'Every move sends the Zoombini most often the beehive’s among the hypotheses left, unless another is surer to finish sooner.'],
  };
}

ZB_PUZZLES.set('FLEENS', {
  about: 'Every Zoombini has a Fleen, and three of the Fleens sit on the beehive branch. The player sends Zoombinis down the lure path, each chased by its own Fleen, until the three are lured off and the bees chase the Fleens away.',
  levels: [
    { rule: 'A Fleen’s hair, eyes, nose and feet go with its Zoombini’s, trait for trait; which Fleen value goes with which Zoombini value is a turn of the five, drawn for each trait. The three on the beehive branch are the Fleens of three Zoombinis drawn at random.',
      chances: 'The branch the lured Zoombinis wait on holds six, and every Zoombini sent waits there, right or wrong; each sent after the sixth pushes the first still waiting back to Shelter Rock. With three to lure, three wrong guesses are free.',
      notes: ['The turns are kept in the saved game. This level draws them only when no visit has yet, and otherwise plays with whatever the last visit left, at any level.',
        'Two Zoombinis alike have Fleens alike, but only the one dealt the beehive Fleen lures it, at every level.'] },
    { rule: 'As level 1, trait for trait, with the values’ turns drawn anew on every visit.',
      chances: 'Six wait on the branch, as at level 1; each sent after the sixth pushes the first still waiting back to Shelter Rock.' },
    { rule: 'The traits are mixed as well: Zoombini hair goes with the Fleen’s eyes, nose or feet, drawn at random, and eyes, nose and feet with the other three in a random order. Values turn as at level 1; both are kept from visit to visit, but a visit at level 1 or 2 clears the mixing, and the next visit here draws it anew.',
      chances: 'Six wait on the branch, as at level 1; each sent after the sixth pushes the first still waiting back to Shelter Rock.',
      notes: ['The help says one trait goes with its like at this level. The program does not see to it: hair never does, and eyes, nose and feet each may, so none, one or two of them do.'] },
    { rule: 'Mixed as at level 3, and the traits and the values’ turns are drawn anew on every visit.',
      chances: 'Six wait on the branch, as at level 1; each sent after the sixth pushes the first still waiting back to Shelter Rock.',
      notes: ['The help says every trait is mixed at this level, but the program deals as at level 3: eyes, nose or feet may still go with their like.'] },
  ],
  deal(level, band, rnd, journey = {}) {
    const s = zbFleensDeal(level, band, rnd, journey);
    const n = band.length, targets = s.targetSnoidOrdinals.filter(t => t > 0);
    const others = n - targets.length;
    const setup = [
      n === 1 ? 'One Zoombini, and its Fleen on the beehive branch.'
        : `${n} Zoombinis, and a Fleen for each: ${['', 'one', 'two', 'three'][targets.length]} on the beehive branch${others ? `, ${others} on the other branches` : ''}.`,
      `The waiting branch holds ${ZB_FLEENS_WAITING}; each Zoombini sent after the sixth sends the first still waiting back to Shelter Rock.`,
    ];
    if (n < ZB_FLEENS_HIVE) setup.push(n === 1 ? 'With one Zoombini the puzzle counts two of the three as lured already, so one lure is enough.'
      : 'With two Zoombinis the puzzle counts one of the three as lured already, so two lures are enough.');
    if (s.rotationsKept) setup.push(`The values pair as they did on the last visit${s.destSlotsKept ? ', and the traits mix as they did' : ''}.`);
    const answer = ZB_TRAIT_KINDS.map((k, i) => {
      const to = s.traitDestinationKinds[i];
      const pairs = [1, 2, 3, 4, 5].map(v => `${zbTraitWith(k, v)} with ${ZB_FLEENS_TRAIT_WITH[to][(s.traitValueRotations[i] + v - 2) % 5]}`);
      return `Zoombini ${k} ${k === 'eyes' || k === 'feet' ? 'go' : 'goes'} with Fleen ${to}: ${pairs.join(', ')}.`;
    });
    answer.push(targets.length === 1 ? `The beehive Fleen is Zoombini ${targets[0]}’s.`
      : `The beehive Fleens are those of Zoombinis ${zbWordsOr(targets.slice().sort((a, b) => a - b).map(String), 'and')}, by place in the band.`);
    for (const t of targets) {
      const twins = band.map((z, i) => i + 1).filter(i => !targets.includes(i) && zbZoombiniId(band[i - 1]) === zbZoombiniId(band[t - 1]));
      if (twins.length) answer.push(`Zoombini ${zbWordsOr(twins.map(String), 'and')} looks just like ${t}, and its Fleen like ${t}’s, but lures its own Fleen, not the beehive one.`);
    }
    const marks = band.map((z, i) => (targets.includes(i + 1) ? 'beehive Fleen: ' : 'Fleen: ') + zbFleensWords(s.fleens[i]));
    return { setup, answer, marks, state: s };
  },
  form(level, band, state) {
    const n = band.length, want = Math.min(3, n), kinds = state.traitDestinationKinds;
    const fields = [{ key: 'hive', label: 'The beehive’s Fleens are those of', kind: 'several', min: want, max: want,
      value: zbFleensTargets(state).map(i => i + 1), options: band.map((_, i) => ({ value: i + 1, label: `Zoombini ${i + 1}` })) }];
    if (level >= 3) ZB_TRAIT_KINDS.forEach((k, i) => fields.push({ key: `to_${k}`, label: `Zoombini ${k} becomes Fleen`, kind: 'choice', value: kinds[i],
      options: ZB_TRAIT_KINDS.map(t => ({ value: t, label: `${t}${t === k ? ' (its own)' : ''}` })) }));
    ZB_TRAIT_KINDS.forEach((k, i) => fields.push({ key: `turn_${k}`, label: `Zoombini ${k}: the turn`, kind: 'choice', value: state.traitValueRotations[i],
      options: [1, 2, 3, 4, 5].map(r => ({ value: r, label: `${r}: ${ZB_TRAIT_SHORT[k][0].toLowerCase()} with ${ZB_FLEENS_TRAIT_WITH[kinds[i]][r - 1]}` })) }));
    fields.push({ key: 'note', kind: 'note', note: level <= 2 ? 'At levels 1 and 2 each Zoombini trait becomes the same Fleen trait. A turn r gives value v the Fleen value (r + v - 2) mod 5 + 1.'
      : 'At levels 3 and 4 the four must go to four different Fleen traits, and hair never to hair, as the program deals. A turn r gives value v the Fleen value (r + v - 2) mod 5 + 1.' });
    return fields;
  },
  edit(level, band, state, values) {
    const n = band.length, want = Math.min(3, n);
    const hive = [...new Set((values.hive || []).map(Number))].sort((a, b) => a - b);
    if (hive.length !== want || hive.some(t => !Number.isInteger(t) || t < 1 || t > n)) throw new Error(`Pick ${want} different Zoombinis of the band for the beehive.`);
    const rotations = ZB_TRAIT_KINDS.map(k => Number(values[`turn_${k}`]));
    if (rotations.some(r => !Number.isInteger(r) || r < 1 || r > 5)) throw new Error('A turn is 1 to 5.');
    let slots = [0, 0, 0, 0];
    if (level >= 3) {
      const to = ZB_TRAIT_KINDS.map(k => values[`to_${k}`]);
      if (to.some(t => !ZB_TRAIT_KINDS.includes(t)) || new Set(to).size !== 4) throw new Error('Each Zoombini trait must become a different Fleen trait.');
      if (to[0] === 'hair') throw new Error('At this level hair never becomes the Fleen’s hair: the program sends it to eyes, nose or feet.');
      slots = to.map(t => ZB_TRAIT_KINDS.indexOf(t) + 1);
    }
    const kinds = zbFleensKinds(slots);
    return {
      targetSnoidOrdinals: [0, 1, 2].map(k => hive[k] || 0), matchedTargetCount: 3 - want,
      traitValueRotations: rotations, traitDestSlots: slots, traitDestinationKinds: kinds,
      rotationsKept: !!state.rotationsKept, destSlotsKept: !!state.destSlotsKept,
      fleens: band.map(z => zbFleensOf(z, rotations, kinds)), edited: true,
    };
  },
  solve(level, band, state) {
    const n = band.length, targets = zbFleensTargets(state), looks = state.fleens.map(zbFleensLook);
    const steps = targets.map(i => `Send Zoombini ${i + 1}: its Fleen, ${zbFleensWords(state.fleens[i])}, follows it off the beehive branch.`);
    for (const t of targets) {
      const twins = band.map((_, i) => i).filter(i => !targets.includes(i) && looks[i] === looks[t]);
      if (twins.length) steps.push(`Zoombini ${zbPlacesWords(twins)} looks just like ${t + 1}, with a Fleen just like ${t + 1}’s; sending it would lure its own Fleen, from another branch, and waste a place.`);
    }
    steps.push(`The bees chase the Fleens away. ${targets.length} sent, so no one is sent back: all ${n} cross.`);
    const hiveCards = targets.map(i => ({ look: looks[i], by: i, lured: true })).sort((a, b) => a.look - b.look);
    const others = band.map((_, i) => i).filter(i => !targets.includes(i)).map(i => ({ look: looks[i], by: i })).sort((a, b) => a.look - b.look || a.by - b.by);
    return {
      most: n, exact: true, ways: 1,
      solutions: [{
        title: `All ${n} cross, sending ${targets.length}`, steps, crosses: band.map((_, i) => i),
        diagram: zbFleensDiagram(level, band, { hive: hiveCards, others, grid: zbFleensGrid(state.traitValueRotations, state.traitDestinationKinds), across: band.map((_, i) => i),
          caption: `Zoombini${targets.length === 1 ? '' : 's'} ${zbPlacesWords(targets)} lure the beehive’s Fleen${targets.length === 1 ? '' : 's'}: all ${n} across` }),
      }],
      notes: [
        'Crossing: once the beehive’s Fleens are lured off, the bees chase every Fleen away, and everyone not sent back to Shelter Rock crosses.',
        'Simplest: fewest sent, the Zoombinis whose Fleens sit on the beehive branch, one each. The order they go in makes no difference and counts as one way.',
      ],
    };
  },
  strategy(level, band, arc, opts = {}) { return zbFleensStrategy(level, band, opts); },
  /* The Zoombini sent is followed by its own Fleen, from the beehive
     branch if it is one of the beehive's three and from another branch if
     not; a strategy made with nothing seen tells the two apart only by
     the branch. */
  answer(level, band, state, node) {
    const z = node.zoombini, hive = zbFleensTargets(state).includes(z), look = zbFleensLook(state.fleens[z]);
    return node.outcomes.findIndex(o => o.hive === hive && (o.look == null || o.look === look));
  },
  source: 'ScummVM’s puzzle_fleens.cpp, checked against the program’s code.',
});
