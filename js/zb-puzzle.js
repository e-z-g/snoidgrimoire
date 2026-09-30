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
              when asked; a node with no outcomes ends the puzzle, and
              says how it ended in move.
              opts.state is the puzzle as dealt (or edited): the strategy
              may use what the player can see of it (the marks on a wall,
              the clues on a lion's, the rooms boarded up), and never its
              hidden part. opts.knows is 'program' or 'form'.
              Both are bounded (opts.budget, milliseconds, a second or two
              by default) and say so in exact when they stop short.
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
