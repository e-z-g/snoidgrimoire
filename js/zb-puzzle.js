/* zb-puzzle.js -- the twelve puzzles' rules: what each hides from a band
   at each level, how many chances it gives, and how it deals the hidden
   part out of the band in front of it, as the program does.
   =========================================================================
   Needs zb-journey.js. Each puzzle is a file of its own,
   js/zb-puzzle-<archive in lower case>.js, which adds itself to
   ZB_PUZZLES; this file has what they share: a Zoombini's four traits and
   their names, the program's random numbers, a band dealt the way
   Zoombini Isle deals one, and a puzzle dealt from a seed as the page
   shows it.

   A Zoombini here is its four traits, { hair, eyes, nose, feet }, each
   1-5, in the order the program keeps them in a saved game (ScummVM's
   ZmbTrait: kTraitHair 0, kTraitEyes 1, kTraitNose 2, kTraitFeet 3). The
   program's puzzles mostly pack them into one 32-bit word instead, a byte
   a trait: feet in the lowest, then nose, eyes and hair.

   The random numbers are the program's own: a linear congruential
   generator, state = 214013 * state + 2531011 (mod 2^32), whose top 16
   bits modulo (n + 1) give a number from 0 to n; asking for 0 to 0 gives
   0 and does not step it. A number from a to b is a + that from 0 to
   b - a. The same generator draws for everything the game animates, so
   a seed here does not replay a game; it deals the same puzzle each time
   it is used, which is what the address keeps.

   A puzzle, ZB_PUZZLES.get(key), where key is its archive's name:
     about    what the player does there, in a sentence or two;
     levels   four entries, one a level: { rule, chances, notes }, the
              rule the level hides and how it is dealt, the chances it
              gives (mistakes, tries, or none counted), in sentences;
     archive  the archive its deal reads, if any: a puzzle whose layout
              is in its archive's resources (a maze's squares, a pond's
              routes) reads it from there, as the rest of the site does,
              and never carries a copy;
     deal(level, band, rnd, journey, arc)
              the puzzle set up for this band at this level (1-4), with
              rnd a zbRandom, drawing in the order the program draws.
              journey is an object shared by the deals of one journey,
              for what one puzzle leaves for the next (Allergic Cliffs'
              split, which the Stone Cold Caves avoid). arc is the
              puzzle's archive opened (openMohawk), given whenever it
              names one. It returns
                { setup:  sentences, what the band sees on arrival;
                  answer: sentences, what is hidden;
                  marks:  per band member, a few words or null: where the
                          answer sends it, or what it does;
                  state:  the dealt values, by ScummVM's names, for the
                          checks }.
     source   where the reading came from, a sentence.

   And, to take a puzzle apart (the page's workbench, #solve=KEY):
     form(level, band, state, arc)
              the dealt puzzle's hidden part as fields a person may
              change: [{ key, label, kind, options, value, min, max, note }],
              kind 'choice' (value one of options' values), 'several' (an
              array of them, min to max long) or 'order' (all of them, in
              an order); options [{ value, label }], values strings or
              numbers. Fields may depend on level and band.
     edit(level, band, state, values, arc)
              the state with the fields' values ({ key: value }) put in,
              as a new state; throws an Error whose message says what is
              wrong when they make no puzzle the program could set. The
              form of the result gives back the values put in.
     solve(level, band, state, arc, opts)
              with the hidden part known, the most of the band that can
              cross and how: { most, exact (whether most is proven, not
              only the best found), ways (how many ways in all, or null),
              solutions: the simplest first, a dozen at most, each
              { title, steps: sentences, crosses: band indices, diagram },
              notes: sentences, among them what simplest means here }.
     strategy(level, band, arc, opts)
              with it unknown, for a puzzle that hides something: the
              hypotheses are every hidden part the program could deal
              for this band at this level, and the player is one who knows
              that, and plays for the worst of them. { hypotheses (how
              many), sure (how many are sure to cross, playing so), exact,
              root: a node, notes }. A node is { move: a sentence,
              zoombini: the band index it sends or null, left: hypotheses
              still possible, crossed, diagram (optional), outcomes: [{
              label, left, next() }] }, next() the node that follows, made
              when asked; a node with no outcomes ends the puzzle, says
              how it ended in move, and says in spent how many of the
              chances the play used (pegs, mistakes, meals or mudballs
              wasted, Zoombinis sent for nothing).
              opts.state is the puzzle as dealt (or edited): the strategy
              may use what the player can see of it (the marks on a wall,
              the clues on a lion's, the rooms boarded up), and never its
              hidden part. opts.knows is 'program' or 'form'.
              Both are bounded (opts.budget, milliseconds, a second or two
              by default) and say so in exact when they stop short.
     answer(level, band, state, node, arc)
              what the game does with a strategy node's move when its
              hidden part is state's: the index in node.outcomes, or -1
              when no outcome is the game's (state is none of the
              hypotheses). zbStrategyPlay walks a strategy so.
     A diagram is the puzzle drawn as data, for the page to paint:
              { width, height, items }, each item one of
                { t: 'rect', x, y, w, h, r, fill, stroke }
                { t: 'line', x1, y1, x2, y2, stroke, width, dash }
                { t: 'poly', points: [x, y, ...], fill, stroke, closed }
                { t: 'circle', x, y, r, fill, stroke }
                { t: 'text', x, y, text, size, anchor, fill, weight }
                { t: 'zoombini', x, y, i, scale, faded } (band member i,
                  standing with its feet at x, y)
                { t: 'trait', x, y, kind, value, scale } (the part's own
                  sprite, centred on x, y)
              with colours as roles ('ink', 'dim', 'line', 'accent',
              'good', 'bad', 'warn', 'water', 'stone', 'wood', 'grass',
              'panel', 'chip') or '#rrggbb', and x, y in the diagram's
              units. A trait is drawn on a light chip unless chip: false.

   WHERE IT CAME FROM
   The traits and the random numbers are ScummVM's Zoombinis branch
   (zoombini_state.h ZmbTrait, zoombini_random.cpp in its original mode),
   and the random numbers are the program's too (ZOOMBI32.EXE of the 1996
   disc's ZBARC32.Z, at 0x46df56). The trait names are the Zoombini
   maker's (e-z-g.github.io/zoombinis); ScummVM calls the second nose
   yellow and the fourth hair balding. The band is ScummVM's
   shelter_picker.cpp randomizePreviewTraits.
*/

const ZB_TRAIT_KINDS = ['hair', 'eyes', 'nose', 'feet'];
/* Names, 1-5 at 0-4: short, for a table, and as they read after "with". */
const ZB_TRAIT_SHORT = {
  hair: ['Shaggy', 'Ponytail', 'Flat top', 'Tuft', 'Cap'],
  eyes: ['Wide eyes', 'One eye', 'Sleepy eyes', 'Glasses', 'Sunglasses'],
  nose: ['Green', 'Orange', 'Red', 'Purple', 'Blue'],
  feet: ['Sneakers', 'Roller skates', 'Spring', 'Wheels', 'Propeller'],
};
const ZB_TRAIT_WITH = {
  hair: ['shaggy hair', 'a ponytail', 'a flat top', 'a tuft', 'a cap'],
  eyes: ['wide eyes', 'one eye', 'sleepy eyes', 'glasses', 'sunglasses'],
  nose: ['a green nose', 'an orange nose', 'a red nose', 'a purple nose', 'a blue nose'],
  feet: ['sneakers', 'roller skates', 'a spring', 'wheels', 'a propeller'],
};
const ZB_PUZZLES = new Map();

/* Where a band waits on coming to each puzzle: the program's tables of
   places, x and y where each Zoombini stands, the first of the band at the
   first (ScummVM's loadZoombinisFromPack and the tables it is given, named
   in utilities/puzzle_check.mjs; ZOOMBINI.EXE holds each as little-endian
   x, y pairs at `exe`, four of them with 20 places of which a band uses 16).
   Hotel Dimensia's band waits in the distance, drawn small (tBMP 3200,
   `small`). The toads' band is not here: its Zoombinis stand off the
   screen, at (680, 220), and other runners draw them. */
const ZB_WAITING = {
  BRIDGE: { exe: 0xd9b30, at: [176, 304, 169, 327, 144, 283, 147, 355, 124, 318, 119, 379, 108, 284, 99, 345, 88, 414, 69, 262, 79, 303, 78, 370, 61, 346, 45, 301, 36, 359, 30, 404] },
  TUNNELS: { exe: 0xcfc00, at: [399, 402, 367, 398, 337, 397, 306, 400, 274, 400, 240, 403, 381, 424, 351, 424, 322, 428, 292, 422, 261, 426, 371, 458, 342, 459, 310, 457, 277, 457, 245, 459] },
  PIZZA: { exe: 0xc58b8, at: [288, 389, 240, 386, 257, 434, 202, 396, 224, 437, 186, 443, 158, 400, 151, 455, 126, 391, 118, 446, 89, 403, 86, 456, 48, 396, 51, 440, 20, 416, 18, 457] },
  FERRY: { exe: 0xda0e2, at: [370, 160, 395, 196, 332, 156, 348, 196, 294, 168, 316, 196, 253, 166, 276, 196, 214, 157, 237, 196, 175, 160, 196, 190, 135, 152, 150, 191, 94, 145, 110, 186] },
  SLIDES: { exe: 0xcbfba, at: [482, 127, 428, 128, 375, 129, 318, 127, 272, 129, 226, 128, 184, 127, 140, 129, 87, 128, 110, 170, 122, 246, 84, 212, 140, 327, 77, 293, 40, 157, 44, 232] },
  FLEENS: { exe: 0xda23c, at: [238, 368, 185, 417, 155, 448, 197, 396, 160, 357, 164, 384, 150, 416, 116, 357, 130, 386, 109, 418, 117, 448, 74, 348, 89, 384, 67, 418, 76, 450, 56, 379] },
  HOTEL: { exe: 0xda384, at: [455, 423, 432, 421, 412, 420, 395, 425, 379, 418, 365, 433, 352, 412, 340, 433, 328, 418, 314, 432, 295, 421, 279, 430, 264, 437, 259, 421, 244, 432, 226, 421] },
  NET: { exe: 0xdaac8, at: [233, 392, 209, 378, 196, 390, 185, 365, 167, 380, 160, 408, 135, 397, 121, 407, 115, 368, 114, 342, 99, 375, 97, 394, 95, 346, 91, 411, 79, 355, 62, 404] },
  CAVES: { exe: 0xbe6a4, at: [180, 110, 160, 136, 130, 167, 106, 193, 86, 232, 140, 100, 120, 126, 100, 157, 76, 183, 46, 222, 100, 90, 80, 116, 60, 147, 36, 173, 60, 80, 40, 106] },
  SMOKE: { exe: 0xdb33c, at: [214, 128, 175, 126, 135, 127, 94, 126, 53, 128, 237, 176, 196, 177, 150, 178, 110, 176, 69, 178, 234, 36, 195, 37, 155, 36, 114, 35, 73, 38, 237, 79] },
  MAZE2: { exe: 0xc282c, at: [287, 394, 260, 426, 224, 447, 188, 441, 157, 455, 263, 384, 219, 397, 184, 388, 155, 402, 121, 417, 226, 354, 189, 349, 156, 354, 131, 375, 85, 394, 164, 311] },
};
ZB_WAITING.HOTEL.small = true;
/* A band waiting at a puzzle: [{ z, i, x, y }], i its place in the band,
   in the order to draw them, the nearer (lower on the screen) over the
   farther; or null where the puzzle has no table. */
function zbBandWaiting(key, band) {
  const w = ZB_WAITING[key];
  if (!w) return null;
  return band.slice(0, w.at.length / 2).map((z, i) => ({ z, i, x: w.at[2 * i], y: w.at[2 * i + 1] }))
    .sort((a, b) => a.y - b.y || a.i - b.i);
}

/* "a ponytail", "sunglasses": trait kind and value 1-5. */
function zbTraitWith(kind, value) { return ZB_TRAIT_WITH[kind][value - 1]; }
/* A list of phrases joined as English: "a, b or c". */
function zbWordsOr(list, word = 'or') {
  return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ` ${word} ` + list[list.length - 1];
}
/* A Zoombini in a few words: "Ponytail, one eye, red nose, spring". */
function zbZoombiniWords(z) {
  return `${ZB_TRAIT_SHORT.hair[z.hair - 1]}, ${ZB_TRAIT_SHORT.eyes[z.eyes - 1].toLowerCase()}, `
    + `${ZB_TRAIT_SHORT.nose[z.nose - 1].toLowerCase()} nose, ${ZB_TRAIT_SHORT.feet[z.feet - 1].toLowerCase()}`;
}
/* The id the program gives a Zoombini's looks, 0-624 (ScummVM's snoid id). */
function zbZoombiniId(z) { return 125 * (z.hair - 1) + 25 * (z.eyes - 1) + 5 * (z.nose - 1) + (z.feet - 1); }

/* The program's random numbers, from a seed (0 is taken as 1). */
function zbRandom(seed) {
  let s = (seed >>> 0) || 1;
  const step = max => {
    if (!max) return 0;
    s = (Math.imul(214013, s) + 2531011) >>> 0;
    return (s >>> 16) % (max + 1);
  };
  return {
    get state() { return s; },
    /* 0 to max. */
    number: max => step(max),
    /* min to max; given the wrong way round, swapped, as ScummVM does. */
    range(min, max) { if (max < min) [min, max] = [max, min]; return min + step(max - min); },
    bool: () => step(1) !== 0,
    /* ScummVM's getNonRepeatRandom: 0 to size - 1, never one already in
       used.bits until all have been, then starting again. */
    nonRepeat(size, used) {
      const full = size < 32 ? (1 << size) - 1 : -1;
      if ((used.bits & full) === full) used.bits = 0;
      let i = step(size - 1);
      while (used.bits & (1 << i)) i = (i + 1) % size;
      used.bits |= 1 << i;
      return i;
    },
  };
}

/* A band dealt as the Isle's dice deal each Zoombini: every trait 1-5,
   hair first, again until it is one the game may still make; the game
   makes no more than two alike, here counted within the band. */
function zbDealBand(rnd, n = 16) {
  const band = [], made = new Map();
  for (let i = 0; i < n; i++) {
    let z;
    do {
      z = {};
      for (const k of ZB_TRAIT_KINDS) z[k] = rnd.range(1, 5);
    } while ((made.get(zbZoombiniId(z)) || 0) >= 2);
    made.set(zbZoombiniId(z), (made.get(zbZoombiniId(z)) || 0) + 1);
    band.push(z);
  }
  return band;
}

/* A Zoombini's traits as the puzzles pack them: a byte each, feet lowest. */
function zbPackTraits(z) { return (z.feet | z.nose << 8 | z.eyes << 16 | z.hair << 24) >>> 0; }

/* A puzzle dealt from a seed, as the page shows it: a band of `size`
   dealt first, then the puzzles before this one on its route, each at the
   same level and crossed with no one lost, for what they leave the next,
   then this one; all from one run of the program's random numbers.
   open(name) gives an archive opened, for a puzzle that names one. */
function zbDealAt(key, level, seed, size = 16, open = () => null) {
  const rnd = zbRandom(seed);
  return zbDealWith(key, level, rnd, zbDealBand(rnd, size), open);
}
/* The same for a band given, from the seed's first number on. */
function zbDealFor(key, level, seed, band, open = () => null) {
  return zbDealWith(key, level, zbRandom(seed), band, open);
}
function zbDealWith(key, level, rnd, band, open) {
  const journey = {};
  const route = ZB_ROUTES.find(r => r.places.slice(1, -1).includes(key));
  const deal = k => { const p = ZB_PUZZLES.get(k); return p.deal(level, band, rnd, journey, p.archive ? open(p.archive) : undefined); };
  for (const k of route ? route.places.slice(1, route.places.indexOf(key)) : []) if (ZB_PUZZLES.has(k)) deal(k);
  return Object.assign({ band }, deal(key));
}
/* The archives a puzzle's deal needs, its own and those before it on its
   route that name one. */
function zbDealNeeds(key) {
  const route = ZB_ROUTES.find(r => r.places.slice(1, -1).includes(key));
  const keys = route ? route.places.slice(1, route.places.indexOf(key) + 1) : [key];
  return [...new Set(keys.filter(k => ZB_PUZZLES.has(k) && ZB_PUZZLES.get(k).archive).map(k => ZB_PUZZLES.get(k).archive))];
}

/* A strategy played against a puzzle dealt (or edited): the node it ends
   at, each move answered as the game would answer it (the puzzle's
   answer), or null when the game gives an answer the strategy did not
   look for. Its crossed is how many a player who plays for the worst
   gets across this puzzle. */
function zbStrategyPlay(P, level, band, state, strategy, arc) {
  let node = strategy.root;
  for (let steps = 0; node.outcomes.length; steps++) {
    const k = P.answer(level, band, state, node, arc);
    if (!(k >= 0) || !node.outcomes[k] || steps > 200) return null;
    node = node.outcomes[k].next();
  }
  return node;
}

/* A band in the address: four digits a Zoombini, hair, eyes, nose, feet. */
function zbBandCode(band) { return band.map(z => `${z.hair}${z.eyes}${z.nose}${z.feet}`).join(''); }
function zbBandFromCode(code) {
  if (!/^([1-5]{4}){1,16}$/.test(code || '')) return null;
  const band = [];
  for (let i = 0; i < code.length; i += 4) band.push({ hair: +code[i], eyes: +code[i + 1], nose: +code[i + 2], feet: +code[i + 3] });
  return band;
}
/* Band members' places as words: "1, 4 and 9". */
function zbPlacesWords(indices) { return zbWordsOr(indices.map(i => String(i + 1)), 'and'); }
/* A field's options for any one trait value, as "kind:value". */
function zbTraitOptions() {
  return ZB_TRAIT_KINDS.flatMap(kind => [1, 2, 3, 4, 5].map(v => ({ value: `${kind}:${v}`, label: `${ZB_TRAIT_SHORT[kind][v - 1]}${kind === 'nose' ? ' nose' : ''}` })));
}
function zbTraitOption(s) { const [kind, v] = String(s).split(':'); return { kind, value: +v }; }

/* Band members standing in rows, as diagram items: the first's feet at x,
   y, perRow to a row, dx and dy apart. */
function zbDiagramRows(indices, x, y, perRow, dx = 34, dy = 52, extra = {}) {
  return indices.map((i, k) => Object.assign({ t: 'zoombini', i, x: x + (k % perRow) * dx, y: y + Math.floor(k / perRow) * dy }, extra));
}
/* A trait's sprites in a row, centred on x. */
function zbDiagramTraits(traits, x, y, gap = 64, extra = {}) {
  const x0 = x - (traits.length - 1) * gap / 2;
  return traits.map((t, k) => Object.assign({ t: 'trait', kind: t.kind, value: t.value, x: x0 + k * gap, y }, extra));
}
