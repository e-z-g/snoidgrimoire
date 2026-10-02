/* zb-puzzle-pizza.js -- Pizza Pass: the pizza trolls, who let the band by
   once each has been served the meal it wants.
   =========================================================================
   Needs zb-puzzle.js.

   Arno, and from level 2 Willa and from level 3 Shyler, block the pass. The
   player presses toppings on and off at the band's machine and makes a
   meal, which a Zoombini carries to the trolls: a pizza at level 1, a pizza
   and a sundae after that. Hidden is what each troll wants, a set of the
   machine's toppings, no topping wanted by two trolls. A meal is shown to
   the trolls still hungry in turn, Arno, Willa, Shyler: the first for whom
   it is exactly his or her toppings eats it, and no one after sees it. A
   meal no troll takes lands on the rock of the first troll whose toppings
   it holds some of and no others, or else in the reject pit, and it counts
   against the band. The trolls forgive six such meals at level 1 and seven
   after that; each one after those costs the Zoombini who carried it, and
   the next in the band carries on. A meal already tried is not judged
   again but put straight on a rock or in the pit, and counts the same.

   What is dealt, in the program's order. First the toppings wanted by
   someone: round after round over the machine's slots, each slot not yet
   dealt is dealt when a number from 0 to 1000 falls below the level's
   threshold, until the level's minimum is reached (a draw for every slot
   of a round, dealt or not). Level 1 has five slots, the pizza toppings;
   threshold 500, minimum 2; every topping dealt is Arno's. Level 2 has
   seven, the sundae's cherry and whipped cream after the pizza's five, but
   slot 4, cheese, is never dealt, and ScummVM gives the machine no button
   for it; threshold 800, minimum 3; each topping dealt is Arno's or
   Willa's on a coin toss, and nothing stops one troll getting them all,
   when the other wants a meal with no toppings. Levels 3 and 4
   have seven and eight slots (chocolate sauce last), threshold 1000,
   minimum 3 and 4, so each slot misses only on a draw of 1000 and nearly
   every deal is every topping; each goes to one of the three at random
   (0-2), and then a troll left with none takes one, drawn at random from
   whichever of the other two has more (the later of the two on a tie),
   Arno first, then Willa, then Shyler. At level 4 the troll who wants the
   most (Arno, then Willa, on a tie) gives two different toppings, drawn at
   random from his or her own, and each of the other two one, and the four
   meals that pair one of the first two with one of the others lie in the
   pit from the start, counted as tried.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_pizza.cpp and .h
   (setDifficultyParams, generateToppingSet, distributeToppings,
   pickRandomToppingFromOrderLine, createLevel4RejectExamples,
   classifySubmittedMeal, onToppingDelivered, checkToppingMaskMatch,
   evaluateDelivery, debugGetChances), checked against the program's own
   code. ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z keeps the level (0-3,
   from 0x4563d7) in the word at 0x4b0b88 and sets each level's slots,
   threshold, minimum, forgiven meals and trolls at 0x43b606, 0x43b734,
   0x43b892 and 0x43ba20; deals the toppings at 0x43f011 and shares them
   out at 0x43dda8, whose level-4 picks are 0x43e21c and whose four pit
   meals are made at 0x4413a0 in ScummVM's order; judges a meal at
   0x43e291 (0 one unwanted topping, 4 more than one, 2 exactly the
   troll's, 1 some of them and nothing else); serves a new meal to the
   first hungry troll and a tried one (0x43f510) to the first it is a part
   of at 0x43c182; and counts a meal nobody takes at 0x44006c. The Mac
   build's SETTOPPINGS, SETTROLLTOPPINGS, GETLIKEDTOPPING, CHECKACCEPTANCE,
   DUPLICATEMEAL, SAVETHISMEAL and REJECTTHESNOID read the same, and the
   installed ZOOMBINI.EXE sets the same values per level;
   utilities/puzzles/pizza.mjs holds them to it. One difference, of no
   effect: after the rebalancing pass the program goes round again while
   any troll wants nothing, ScummVM while Arno or Willa does; the pass
   always leaves Shyler with something, so they deal the same. Not read:
   how a meal passes from one troll to the next after a reaction ends
   (0x43e427 and the callbacks), taken from ScummVM.
*/

/* The toppings by slot, as they read after "wants", in the words of
   ScummVM's MealIngredient; 0-4 go on the pizza and 5-7 on the sundae. */
const ZB_PIZZA_TOPPINGS = ['olives', 'green peppers', 'pepperoni', 'mushrooms', 'cheese',
  'a cherry', 'whipped cream', 'chocolate sauce'];
const ZB_PIZZA_SUNDAE_FROM = 5;
const ZB_PIZZA_TROLLS = ['Arno', 'Willa', 'Shyler'];
/* Per level: the machine's slots, the threshold out of 0-1000 below which
   a slot is dealt, the fewest dealt, the meals forgiven, the trolls. */
const ZB_PIZZA_LEVELS = [
  { slots: 5, threshold: 500, minimum: 2, forgiven: 6, trolls: 1 },
  { slots: 7, threshold: 800, minimum: 3, forgiven: 7, trolls: 2 },
  { slots: 7, threshold: 1000, minimum: 3, forgiven: 7, trolls: 3 },
  { slots: 8, threshold: 1000, minimum: 4, forgiven: 7, trolls: 3 },
];
/* The slot never dealt at level 2, and so without a button: cheese. */
const ZB_PIZZA_L2_LEFT_OUT = 4;

/* The slots a level's machine has buttons for. */
function zbPizzaSlots(level) {
  const p = ZB_PIZZA_LEVELS[level - 1], out = [];
  for (let i = 0; i < p.slots; i++) if (!(level === 2 && i === ZB_PIZZA_L2_LEFT_OUT)) out.push(i);
  return out;
}

/* "olives, pepperoni and whipped cream": slots as words. */
function zbPizzaWords(slots) { return zbWordsOr(slots.map(i => ZB_PIZZA_TOPPINGS[i]), 'and'); }

/* How one troll judges a meal (slots), as ScummVM's classifySubmittedMeal
   numbers it: 0 one topping the troll does not want, 4 more than one, 2
   exactly the troll's toppings, 1 some of them and nothing else. */
function zbPizzaJudge(wants, meal) {
  const unwanted = meal.filter(i => !wants.includes(i)).length;
  if (unwanted === 1) return 0;
  if (unwanted > 1) return 4;
  return meal.length === wants.length ? 2 : 1;
}

/* A meal served to the trolls still hungry (hungry[t] true), as the program
   serves it: { eaten: the troll who takes it or -1, rock: the troll on
   whose rock it lands or -1 (the pit), counted: whether it counts against
   the band }. tried is whether the same toppings were served before. */
function zbPizzaServe(state, hungry, meal, tried = false) {
  const wants = [state.arnoToppings, state.willaToppings, state.shylerToppings];
  const order = [0, 1, 2].filter(t => hungry[t]);
  let rock = -1;
  for (const t of order) {
    const j = zbPizzaJudge(wants[t], meal);
    if (j === 2 && !tried) return { eaten: t, rock: -1, counted: false };
    if (j === 1 && rock < 0) rock = t;
  }
  return { eaten: -1, rock, counted: true };
}

/* The dealing, as a function of the level and the random numbers. */
function zbPizzaDeal(level, rnd) {
  const p = ZB_PIZZA_LEVELS[level - 1];
  const leftOut = level === 2 ? ZB_PIZZA_L2_LEFT_OUT : -1;
  const generated = new Array(8).fill(false);
  let remaining = p.minimum, nonePlaced = true;
  do {
    for (let i = 0; i < p.slots; i++) {
      if (rnd.number(1000) < p.threshold && !generated[i] && i !== leftOut) {
        generated[i] = true;
        remaining--;
        nonePlaced = false;
      }
    }
  } while (remaining > 0);
  // Never so: the rounds go on until the minimum is dealt. The program has it.
  if (nonePlaced) generated[rnd.number(3)] = true;

  const want = [0, 1, 2].map(() => new Array(8).fill(false)), count = [0, 0, 0];
  let rejects = null;
  if (level === 1) {
    for (let i = 0; i < p.slots; i++) want[0][i] = generated[i];
  } else if (level === 2) {
    for (let i = 0; i < p.slots; i++) {
      if (!generated[i]) continue;
      const t = rnd.bool() ? 1 : 0;
      want[t][i] = true;
      count[t]++;
    }
    // Never so either, with three or more dealt.
    if (!count[0] && !count[1]) {
      const slot = rnd.number(p.slots - 1);
      want[rnd.number(1000) >= 500 ? 0 : 1][slot] = true;
    }
  } else {
    for (let i = 0; i < p.slots; i++) {
      if (!generated[i]) continue;
      const t = rnd.range(0, 2);
      want[t][i] = true;
      count[t]++;
    }
    // A troll wanting nothing takes a topping, drawn at random, from the
    // other of the two with more (the second on a tie).
    const take = (to, a, b) => {
      const from = count[a] <= count[b] ? b : a;
      let slot;
      do slot = rnd.number(p.slots - 1); while (!want[from][slot]);
      want[from][slot] = false;
      count[from]--;
      want[to][slot] = true;
      count[to] = 1;
    };
    do {
      if (!count[0]) take(0, 1, 2);
      if (!count[1]) take(1, 0, 2);
      if (!count[2]) take(2, 0, 1);
    } while (!count[0] || !count[1] || !count[2]);

    if (level === 4) {
      let most = 0;
      if (count[1] <= count[0]) { if (count[0] < count[2]) most = 2; }
      else most = count[1] < count[2] ? 2 : 1;
      const liked = t => { let i; do i = rnd.number(p.slots - 1); while (!want[t][i]); return i; };
      const a = liked(most);
      let b;
      do b = liked(most); while (b === a);
      const [other1, other2] = [0, 1, 2].filter(t => t !== most);
      const c = liked(other1), d = liked(other2);
      rejects = [[a, c], [b, c], [b, d], [a, d]].map(m => m.slice().sort((x, y) => x - y));
    }
  }
  const slotsOf = w => w.map((on, i) => on ? i : -1).filter(i => i >= 0);
  return {
    machineToppingSlotCount: p.slots,
    minimumGeneratedToppingCount: p.minimum,
    toppingGenerationThreshold: p.threshold,
    initialMistakeAllowance: p.forgiven,
    generatedToppings: slotsOf(generated),
    arnoToppings: slotsOf(want[0]),
    willaToppings: level >= 2 ? slotsOf(want[1]) : null,
    shylerToppings: level >= 3 ? slotsOf(want[2]) : null,
    rejectExamples: rejects,
  };
}

/* ---- the puzzle taken apart --------------------------------------------- */

/* The toppings' colours for a diagram, by slot: chosen by eye to look like
   the toppings, not read from the art; and short names for the machine's
   buttons. */
const ZB_PIZZA_COLOURS = ['#3a352e', '#4f9e3a', '#c43d2c', '#cfae7c', '#f1c93b', '#d8233c', '#f3ede0', '#6b3a1c'];
const ZB_PIZZA_SHORT = ['Olives', 'Green peppers', 'Pepperoni', 'Mushrooms', 'Cheese', 'Cherry', 'Whipped cream', 'Chocolate sauce'];

/* A meal in words: "a pizza with olives and cheese and a plain sundae". */
function zbPizzaMealWords(level, meal) {
  const pizza = meal.filter(i => i < ZB_PIZZA_SUNDAE_FROM), sundae = meal.filter(i => i >= ZB_PIZZA_SUNDAE_FROM);
  const p = pizza.length ? `a pizza with ${zbPizzaWords(pizza)}` : 'a plain pizza';
  return level === 1 ? p : `${p} and ${sundae.length ? `a sundae with ${zbPizzaWords(sundae)}` : 'a plain sundae'}`;
}
/* The level's trolls' wishes in a state, as slot lists. */
function zbPizzaWishes(level, state) {
  return [state.arnoToppings, state.willaToppings || [], state.shylerToppings || []].slice(0, ZB_PIZZA_LEVELS[level - 1].trolls);
}
/* A troll's reaction to a meal, in words: the classifier's 0, 1, 2 or 4. */
function zbPizzaReactionWords(t, c) {
  const name = ZB_PIZZA_TROLLS[t];
  return c === 2 ? `${name} eats it` : c === 1 ? `${name}: none hated, some missing` : c === 0 ? `${name}: one topping hated` : `${name}: more than one hated`;
}
/* Level 4's pit made from wishes the program did not deal (an edit): the
   troll who wants the most gives its first two toppings, each other troll
   its first, crossed as the program crosses them. */
function zbPizzaPit(wishes) {
  const count = wishes.map(w => w.length);
  let most = 0;
  if (count[1] <= count[0]) { if (count[0] < count[2]) most = 2; }
  else most = count[1] < count[2] ? 2 : 1;
  const [a, b] = wishes[most], [o1, o2] = [0, 1, 2].filter(t => t !== most), c = wishes[o1][0], d = wishes[o2][0];
  return [[a, c], [b, c], [b, d], [a, d]].map(m => m.slice().sort((x, y) => x - y));
}

/* The trolls drawn: the machine with its buttons (the meal being served
   pressed), each troll with a pizza and, from level 2, a sundae carrying
   the toppings it wants (faded and ringed where it only may), the meals
   still forgiven, the pit at level 4, and the band: waiting on the near
   side (the carrier first, the lost faded) or across the pass.
     know: per troll, per slot, 'yes', 'maybe' or 'no'
     fed: per troll, whether it has eaten
     meal: the slots of the meal being served, or null */
function zbPizzaDiagram(level, band, { know, fed = [], meal = null, carrier = null, waiting = [], lost = [], across = [], forgiven = null, pit = null, caption = '' }) {
  const W = 800, H = 580, items = [], p = ZB_PIZZA_LEVELS[level - 1], buttons = zbPizzaSlots(level);
  items.push({ t: 'text', x: 16, y: 24, text: caption, size: 15, fill: 'ink' });
  // The machine.
  items.push({ t: 'rect', x: 16, y: 40, w: 196, h: 312, r: 8, fill: 'panel', stroke: 'line' });
  items.push({ t: 'text', x: 114, y: 62, text: meal ? 'the machine: the meal pressed' : 'the machine', anchor: 'middle', size: 12, fill: 'dim' });
  buttons.forEach((s, k) => {
    const y = 92 + k * 32, on = !meal || meal.includes(s);
    items.push({ t: 'circle', x: 38, y, r: 10, fill: ZB_PIZZA_COLOURS[s], stroke: meal && on ? 'accent' : 'line', width: meal && on ? 3 : 1.5, faded: !on });
    items.push({ t: 'text', x: 56, y: y + 4, text: ZB_PIZZA_SHORT[s], size: 12, fill: on ? 'ink' : 'dim' });
  });
  if (forgiven) {
    items.push({ t: 'text', x: 16, y: 376, text: `meals forgiven: ${forgiven.left} of ${forgiven.of} left`, size: 12, fill: 'dim' });
    for (let k = 0; k < forgiven.of; k++) items.push({ t: 'circle', x: 24 + k * 16, y: 392, r: 5, fill: k < forgiven.left ? 'warn' : 'panel', stroke: 'line' });
  }
  if (pit) {
    const y = forgiven ? 412 : 376;
    items.push({ t: 'text', x: 16, y, text: 'in the pit, tried already', size: 12, fill: 'dim' });
    pit.forEach((m, k) => m.forEach((s, j) => items.push({ t: 'circle', x: 26 + k * 48 + j * 15, y: y + 16, r: 6, fill: ZB_PIZZA_COLOURS[s], stroke: 'line' })));
  }
  // The trolls.
  const cw = 180, gap = 8, x0 = 228 + (556 - p.trolls * cw - (p.trolls - 1) * gap) / 2;
  for (let t = 0; t < p.trolls; t++) {
    const x = x0 + t * (cw + gap), cx = x + cw / 2, k = know[t];
    items.push({ t: 'rect', x, y: 40, w: cw, h: 312, r: 8, fill: 'panel', stroke: fed[t] ? 'good' : 'line' });
    items.push({ t: 'text', x: cx, y: 64, text: ZB_PIZZA_TROLLS[t], anchor: 'middle', size: 15, weight: 'bold', fill: 'ink' });
    items.push({ t: 'text', x: cx, y: 82, text: fed[t] ? 'has eaten' : 'hungry', anchor: 'middle', size: 11, fill: fed[t] ? 'good' : 'dim' });
    items.push({ t: 'circle', x: cx, y: 150, r: 50, fill: '#c68a45', stroke: 'line' }, { t: 'circle', x: cx, y: 150, r: 41, fill: '#a8432a' });
    const dot = (s, x1, y1, r) => {
      if (k[s] === 'no') return;
      items.push({ t: 'circle', x: x1, y: y1, r, fill: ZB_PIZZA_COLOURS[s], stroke: k[s] === 'maybe' ? 'warn' : 'line', width: k[s] === 'maybe' ? 2 : 1.5, dash: k[s] === 'maybe', faded: k[s] === 'maybe' });
    };
    for (const s of buttons.filter(s => s < ZB_PIZZA_SUNDAE_FROM)) {
      const a = (-90 + s * 72) * Math.PI / 180;
      dot(s, Math.round(cx + 24 * Math.cos(a)), Math.round(150 + 24 * Math.sin(a)), 10);
    }
    if (level > 1) {
      items.push({ t: 'poly', points: [cx - 34, 246, cx + 34, 246, cx + 20, 282, cx - 20, 282], fill: '#9fb0c8', stroke: 'line' });
      items.push({ t: 'circle', x: cx, y: 236, r: 26, fill: '#f3e6c8', stroke: 'line' });
      for (const s of buttons.filter(s => s >= ZB_PIZZA_SUNDAE_FROM)) dot(s, cx + (s - 6) * 17, 228, 8);
    }
    const yes = buttons.filter(s => k[s] === 'yes'), maybe = buttons.filter(s => k[s] === 'maybe');
    const lines = [];
    const wrap = list => {
      let line = '';
      list.forEach((s, j) => {
        const word = ZB_PIZZA_SHORT[s].toLowerCase() + (j < list.length - 1 ? ',' : '');
        if (line && (line + ' ' + word).length > 27) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
      });
      if (line) lines.push(line);
    };
    lines.push(!yes.length ? (maybe.length ? 'wants: none known yet' : 'wants nothing on it') : maybe.length ? 'wants, known:' : `wants ${yes.length === 1 ? 'only' : 'these'}:`);
    wrap(yes);
    if (maybe.length) lines.push(`and maybe ${maybe.length === 1 ? ZB_PIZZA_SHORT[maybe[0]].toLowerCase() : `some of ${maybe.length} more`}`);
    lines.slice(0, 4).forEach((l, j) => items.push({ t: 'text', x: cx, y: 304 + j * 14, text: l, anchor: 'middle', size: 11, fill: j === 0 || l.startsWith('and maybe') ? 'dim' : 'ink' }));
  }
  // The band.
  items.push({ t: 'line', x1: 408, y1: 440, x2: 408, y2: H - 6, stroke: 'line', dash: true });
  items.push({ t: 'text', x: 16, y: 456, text: !waiting.length && !lost.length ? 'no one on the near side'
    : `on the near side${carrier != null ? `; Zoombini ${carrier + 1} carries the meal` : ''}${lost.length ? `; ${lost.length} lost, faded` : ''}`, size: 12, fill: 'dim' });
  items.push({ t: 'text', x: 424, y: 456, text: across.length ? 'across the pass' : 'no one across yet', size: 12, fill: 'dim' });
  const near = [...waiting, ...lost];
  near.forEach((i, k) => {
    const x = 34 + (k % 10) * 36, y = 508 + Math.floor(k / 10) * 56;
    if (i === carrier) items.push({ t: 'circle', x, y: y - 20, r: 19, fill: null, stroke: 'accent', width: 2 });
    items.push({ t: 'zoombini', i, x, y, faded: lost.includes(i) });
  });
  across.forEach((i, k) => items.push({ t: 'zoombini', i, x: 442 + (k % 10) * 34, y: 508 + Math.floor(k / 10) * 56 }));
  return { width: W, height: H, items };
}

/* ---- the trolls' wishes unknown ------------------------------------------

   What the player must allow for, the hypotheses, is every set of wishes:
   with knows 'program', every one the deal can give (level 1, two to five
   of Arno's five toppings, 26; level 2, three or more of six shared out
   between Arno and Willa, 656; level 3, three or more of seven shared out
   so that each troll has one, 10,206; level 4, four or more of eight so,
   46,284); with 'form', every one of the level's shape, each topping
   wanted by one troll or none and no two trolls wanting the same meal (so
   no two wanting nothing, which could not both be served), 32, 728,
   16,002 and 64,770. A hypothesis is a wish a troll, as a mask of the
   machine's buttons, button b the level's b-th slot.

   The moves are meals, any set of the machine's toppings not served
   before (a meal served again is not judged, so it tells nothing and is
   always a waste). The feedback is each hungry troll's reaction in turn,
   Arno, Willa, Shyler, until one eats it (zbPizzaFeedback). A troll whose
   wish every hypothesis left agrees on is served it at once, for nothing.
   The cost is the meals no troll eats: the level forgives so many, and
   each after that loses the Zoombini carrying it; everyone left crosses
   once every troll has eaten. So the play is the one whose worst case
   wastes fewest meals, the same for any band: the wishes do not depend on
   it. The search asks whether every troll can be fed wasting at most d,
   depth first, with the meals whose worst reaction leaves fewest
   hypotheses tried first and every answer remembered; buttons no meal has
   told apart are alike (the hypotheses are the same with them swapped),
   so a meal is a count from each such class. It plays the rule of thumb
   (always the first meal of that order) through first, which gives a
   bound in one pass, then asks for one fewer at a time while its budget
   lasts. At level 4 the pit's four meals, seen on arrival (opts.state),
   are tried meals never to serve, and with knows 'program' they narrow
   the hypotheses to those the program would cross so; without them the
   play never serves two toppings that could be two trolls', one each,
   which might be a pit meal the game would not judge. The engines are
   kept, a level, knows and pit each, so a second band is instant. */
const ZB_PIZZA_PC = (() => { const t = new Uint8Array(256); for (let i = 1; i < 256; i++) t[i] = t[i >> 1] + (i & 1); return t; })();
const ZB_PIZZA_ENGINES = new Map();
const ZB_PIZZA_TIMEOUT = new Error('the pizza search ran out of time');

function zbPizzaEngine(level, knows, pit = null) {
  const key = `${level}:${knows}:${pit ? JSON.stringify(pit) : ''}`;
  if (ZB_PIZZA_ENGINES.has(key)) return ZB_PIZZA_ENGINES.get(key);
  // The pit's meals, when known: the program's a, b of the troll who wants
  // the most, c and d one each of the other two, in the program's order.
  const roles = pit ? (() => {
    const common = (x, y) => x.find(v => y.includes(v));
    return { a: common(pit[3], pit[0]), b: common(pit[1], pit[2]), c: common(pit[0], pit[1]), d: common(pit[2], pit[3]) };
  })() : null;
  const pitMasks = pit ? pit.map(mm => mm.reduce((acc, sl) => acc | 1 << zbPizzaSlots(level).indexOf(sl), 0)) : [];
  const p = ZB_PIZZA_LEVELS[level - 1], buttons = zbPizzaSlots(level), m = buttons.length, T = p.trolls;
  const hs = [];
  for (let code = 0, total = (T + 1) ** m; code < total; code++) {
    const wish = [0, 0, 0];
    let c = code, dealt = 0;
    for (let b = 0; b < m; b++) { const o = c % (T + 1); c = (c - o) / (T + 1); if (o) { wish[o - 1] |= 1 << b; dealt++; } }
    if (knows === 'program' ? dealt < p.minimum || (T === 3 && (!wish[0] || !wish[1] || !wish[2])) : wish.slice(0, T).filter(x => !x).length > 1) continue;
    if (roles && knows === 'program') {
      const count = wish.map(x => ZB_PIZZA_PC[x]);
      let most = 0;
      if (count[1] <= count[0]) { if (count[0] < count[2]) most = 2; } else most = count[1] < count[2] ? 2 : 1;
      const [o1, o2] = [0, 1, 2].filter(t => t !== most), has = (t, sl) => wish[t] >> sl & 1;
      if (!has(most, roles.a) || !has(most, roles.b) || !has(o1, roles.c) || !has(o2, roles.d)) continue;
    }
    if (pitMasks.some(mm => wish.includes(mm))) continue;
    hs.push(wish[0] | wish[1] << 8 | wish[2] << 16);
  }
  const e = { level, knows, p, buttons, m, T, count: hs.length, h: Uint32Array.from(hs), memo: new Map(), greedy: new Map(), best: null, minimal: false, mode: null,
    counts: new Int32Array(512), pit: pitMasks.slice().sort((x, y) => x - y) };
  e.wish = (t, i) => e.h[i] >> 8 * t & 255;
  ZB_PIZZA_ENGINES.set(key, e);
  // Keep a few pits' engines, not every deal's.
  const pits = [...ZB_PIZZA_ENGINES.keys()].filter(k => !k.endsWith(':'));
  if (pits.length > 6) ZB_PIZZA_ENGINES.delete(pits[0]);
  return e;
}
/* What the player sees when meal M goes to the hungry trolls under
   hypothesis i: each one's reaction in turn, and who eats it, as a number
   (c a reaction, 0, 1, 2 or 4, five to a place; the eater plus one in the
   lowest two bits, 0 for no one). */
function zbPizzaFeedback(e, i, hungry, M) {
  const size = ZB_PIZZA_PC[M], h = e.h[i];
  let code = 0;
  for (let t = 0; t < e.T; t++) {
    if (!(hungry >> t & 1)) continue;
    const wish = h >> 8 * t & 255, un = size - ZB_PIZZA_PC[M & wish];
    const c = un === 1 ? 0 : un > 1 ? 4 : wish === M ? 2 : 1;
    code = code * 5 + c;
    if (c === 2) return code * 4 + 1 + t;
  }
  return code * 4;
}
/* The reactions a feedback number stands for: [[troll, reaction]]. */
function zbPizzaReactions(e, hungry, code) {
  const eaten = code % 4 - 1, order = [0, 1, 2].filter(t => t < e.T && hungry >> t & 1);
  let rest = (code - code % 4) / 4;
  const cs = [];
  while (cs.length < (eaten < 0 ? order.length : order.indexOf(eaten) + 1)) { cs.unshift(rest % 5); rest = (rest - rest % 5) / 5; }
  return cs.map((c, k) => [order[k], c]);
}
/* Trolls whose wish every hypothesis left agrees on are served it: the
   hungry mask and the tried meals after. */
function zbPizzaFeedKnown(e, idx, hungry, tried) {
  let fed = null;
  for (let t = 0; t < e.T; t++) {
    if (!(hungry >> t & 1)) continue;
    const w0 = e.wish(t, idx[0]);
    let all = true;
    for (let k = 1; k < idx.length && all; k++) all = (e.h[idx[k]] >> 8 * t & 255) === w0;
    if (all) { hungry &= ~(1 << t); (fed = fed || []).push(w0); }
  }
  return { hungry, tried: fed ? tried.concat(fed).sort((a, b) => a - b) : tried };
}
function zbPizzaKey(idx, hungry, tried) {
  let a = idx.length, b = 0;
  for (let k = 0; k < idx.length; k++) { a = Math.imul(a ^ idx[k], 2654435761) + k | 0; b = b + Math.imul(idx[k] + 1, 40503) | 0; }
  return `${a}.${b}.${idx.length}.${hungry}.${tried.join(',')}`;
}
/* The meals worth trying from here, best first: each with the size of its
   worst split that no troll eats (fewest hypotheses left is best), how
   many splits, and whether any is wasted. Buttons are alike when no meal
   served has told them apart, or when every hypothesis left gives them the
   same troll (or none): the hypotheses are the same with them swapped, so
   a meal is a count from each class of alike buttons, and at most one
   topping no troll can want, since a second tells nothing more. */
function zbPizzaMoves(e, idx, hungry, tried) {
  const classes = new Map();
  for (let b = 0; b < e.m; b++) {
    let owner = -2;
    for (let k = 0; k < idx.length && owner !== -1; k++) {
      const h = e.h[idx[k]], o = h >> b & 1 ? 1 : h >> 8 + b & 1 ? 2 : h >> 16 + b & 1 ? 3 : 0;
      owner = owner === -2 ? o : owner === o ? o : -1;
    }
    let col = 0;
    for (let j = 0; j < tried.length; j++) if (tried[j] >> b & 1) col |= 1 << j;
    const k = owner >= 0 ? `d${owner}` : `c${col}`;
    if (!classes.has(k)) classes.set(k, []);
    classes.get(k).push(b);
  }
  const cl = [...classes.entries()].map(([k, bs]) => k === 'd0' ? bs.slice(0, 1) : bs), meals = [];
  const pick = (c, M) => {
    if (c === cl.length) { if (!tried.includes(M)) meals.push(M); return; }
    pick(c + 1, M);
    let acc = M;
    for (const b of cl[c]) { acc |= 1 << b; pick(c + 1, acc); }
  };
  pick(0, 0);
  const out = [], counts = e.counts, used = [], n = idx.length, T = e.T;
  for (const M of meals) {
    if (e.level === 4 && !e.pit.length && ZB_PIZZA_PC[M] === 2 && zbPizzaPitLike(e, idx, M)) continue;
    const size = ZB_PIZZA_PC[M];
    used.length = 0;
    for (let k = 0; k < n; k++) {
      const h = e.h[idx[k]];
      let code = 0, t = 0;
      for (; t < T; t++) {
        if (!(hungry >> t & 1)) continue;
        const wish = h >> 8 * t & 255, un = size - ZB_PIZZA_PC[M & wish];
        const c = un === 1 ? 0 : un > 1 ? 4 : wish === M ? 2 : 1;
        code = code * 5 + c;
        if (c === 2) break;
      }
      code = t < T ? code * 4 + 1 + t : code * 4;
      if (!counts[code]++) used.push(code);
    }
    let worst = 0, wrong = false;
    for (const code of used) { if (!(code & 3)) { wrong = true; if (counts[code] > worst) worst = counts[code]; } counts[code] = 0; }
    if (used.length === 1 && wrong) continue;
    out.push({ M, worst, parts: used.length, wrong });
  }
  return out.sort((x, y) => x.worst - y.worst || y.parts - x.parts || x.M - y.M);
}
/* Whether a two-topping meal could be one of level 4's pit meals under
   some hypothesis left: its toppings wanted by two different trolls. */
function zbPizzaPitLike(e, idx, M) {
  const b1 = 31 - Math.clz32(M), b2 = 31 - Math.clz32(M & ~(1 << b1));
  for (let k = 0; k < idx.length; k++) {
    const h = e.h[idx[k]];
    let o1 = -1, o2 = -1;
    for (let t = 0; t < 3; t++) { const w = h >> 8 * t & 255; if (w >> b1 & 1) o1 = t; if (w >> b2 & 1) o2 = t; }
    if (o1 >= 0 && o2 >= 0 && o1 !== o2) return true;
  }
  return false;
}
/* A meal's splits: [{ code, eaten, idx }], the biggest first. */
function zbPizzaSplit(e, idx, hungry, M) {
  const parts = new Map();
  for (let k = 0; k < idx.length; k++) {
    const code = zbPizzaFeedback(e, idx[k], hungry, M);
    let part = parts.get(code);
    if (!part) parts.set(code, part = { code, eaten: (code & 3) - 1, idx: [] });
    part.idx.push(idx[k]);
  }
  return [...parts.values()].sort((x, y) => y.idx.length - x.idx.length || x.code - y.code);
}
/* Whether every troll can be fed from here wasting at most d meals. */
function zbPizzaSearch(e, idx, hungry, tried, d, deadline) {
  ({ hungry, tried } = zbPizzaFeedKnown(e, idx, hungry, tried));
  if (!hungry) return true;
  // Remembered: the fewest wasted meals known to do from here, with the
  // meal that does it, and the most known not to.
  const key = zbPizzaKey(idx, hungry, tried);
  let got = e.memo.get(key);
  if (got && d >= got.ok) return true;
  if (got && d <= got.fail) return false;
  if (Date.now() > deadline) throw ZB_PIZZA_TIMEOUT;
  let found = -1;
  for (const mv of zbPizzaMoves(e, idx, hungry, tried)) {
    if (d === 0 && mv.wrong) continue;
    const next = tried.concat(mv.M).sort((a, b) => a - b);
    if (zbPizzaSplit(e, idx, hungry, mv.M).every(part => zbPizzaSearch(e, part.idx, part.eaten < 0 ? hungry : hungry & ~(1 << part.eaten), next, d - (part.eaten < 0 ? 1 : 0), deadline))) { found = mv.M; break; }
  }
  got = e.memo.get(key) || { ok: Infinity, M: -1, fail: -1 };
  if (found >= 0 && d < got.ok) { got.ok = d; got.M = found; }
  if (found < 0 && d > got.fail) got.fail = d;
  e.memo.set(key, got);
  return found >= 0;
}
/* The rule of thumb, when the search runs out of time: the first meal of
   the order above, always; the most meals it may waste. */
function zbPizzaGreedy(e, idx, hungry, tried) {
  ({ hungry, tried } = zbPizzaFeedKnown(e, idx, hungry, tried));
  if (!hungry) return 0;
  const key = zbPizzaKey(idx, hungry, tried), got = e.greedy.get(key);
  if (got) return got.w;
  const M = zbPizzaMoves(e, idx, hungry, tried)[0].M, next = tried.concat(M).sort((a, b) => a - b);
  let w = 0;
  for (const part of zbPizzaSplit(e, idx, hungry, M)) w = Math.max(w, (part.eaten < 0 ? 1 : 0) + zbPizzaGreedy(e, part.idx, part.eaten < 0 ? hungry : hungry & ~(1 << part.eaten), next));
  e.greedy.set(key, { w, M });
  return w;
}
/* The engine's play worked out once: the rule of thumb's first, which
   gives a bound in one pass, then the search for fewer wasted meals while
   the budget lasts. */
function zbPizzaPlan(e, budget) {
  if (e.mode) return;
  const end = Date.now() + budget, root = Array.from({ length: e.count }, (_, i) => i), all = (1 << e.T) - 1;
  e.best = zbPizzaGreedy(e, root, all, e.pit);
  e.mode = 'greedy';
  try {
    for (let t = e.best - 1; t >= 0; t--) {
      if (!zbPizzaSearch(e, root, all, e.pit, t, end)) { e.minimal = true; break; }
      e.best = t; e.mode = 'search';
      if (t === 0) e.minimal = true;
    }
  } catch (x) {
    if (x !== ZB_PIZZA_TIMEOUT) throw x;
  }
}

/* The strategy's node for a state of play: st = { idx, hungry, tried, d,
   wasted, lost, fed, history }. */
function zbPizzaNode(e, band, st) {
  const n = band.length, a = e.p.forgiven, level = e.level;
  const mealSlots = M => e.buttons.filter((s, k) => M >> k & 1), pit = e.pit.length ? e.pit.map(mealSlots) : null;
  const know = () => [0, 1, 2].slice(0, e.T).map(t => {
    const k = new Array(8).fill('no');
    e.buttons.forEach((s, b) => {
      let yes = 0;
      for (const i of st.idx) if (e.wish(t, i) >> b & 1) yes++;
      k[s] = yes === st.idx.length ? 'yes' : yes ? 'maybe' : 'no';
    });
    return k;
  });
  const people = () => {
    const lost = band.map((_, i) => i).slice(0, st.lost), waiting = band.map((_, i) => i).slice(st.lost);
    return { lost, waiting };
  };
  const forgiven = { left: Math.max(0, a - st.wasted), of: a };
  const fedNow = st.fed.slice();
  // A troll every hypothesis agrees on is served first, for nothing.
  if (st.lost < n) for (let t = 0; t < e.T; t++) {
    if (!(st.hungry >> t & 1)) continue;
    const w0 = e.wish(t, st.idx[0]);
    if (!st.idx.every(i => e.wish(t, i) === w0)) continue;
    const meal = mealSlots(w0), { lost, waiting } = people();
    return {
      move: `Serve ${ZB_PIZZA_TROLLS[t]} ${zbPizzaMealWords(level, meal)}: every hypothesis left agrees it is ${ZB_PIZZA_TROLLS[t]}’s wish.`,
      zoombini: st.lost, left: st.idx.length, crossed: 0, meal, hungry: st.hungry,
      diagram: zbPizzaDiagram(level, band, { know: know(), fed: fedNow, meal, carrier: st.lost, waiting, lost, forgiven, pit, caption: `${st.idx.length} hypotheses left; ${ZB_PIZZA_TROLLS[t]}’s wish is known` }),
      outcomes: [{ label: `${ZB_PIZZA_TROLLS[t]} eats it`, left: st.idx.length, eaten: t,
        next: () => { const fed = fedNow.slice(); fed[t] = true; return zbPizzaNode(e, band, { ...st, hungry: st.hungry & ~(1 << t), tried: st.tried.concat(w0).sort((x, y) => x - y), fed }); } }],
    };
  }
  if (!st.hungry || st.lost >= n) {
    const { lost, waiting } = people(), crossed = st.hungry ? 0 : n - st.lost;
    return {
      move: !st.hungry ? `Every troll has eaten: ${crossed === n ? `all ${n}` : `the ${crossed} left`} cross${crossed === 1 ? 'es' : ''}${st.lost ? `, ${st.lost} lost on the way` : ''}, having wasted ${st.wasted} meal${st.wasted === 1 ? '' : 's'}.`
        : `Every Zoombini is lost before the trolls have all eaten: none cross.`,
      zoombini: null, left: st.idx.length, crossed, spent: st.wasted, outcomes: [],
      diagram: zbPizzaDiagram(level, band, { know: know(), fed: fedNow, lost, across: st.hungry ? [] : waiting, forgiven,
        caption: !st.hungry ? `All the trolls have eaten: ${crossed} across` : 'No one left to carry a meal' }),
    };
  }
  // The searched meal, or the rule of thumb's.
  let M;
  if (e.mode === 'search') {
    const key = zbPizzaKey(st.idx, st.hungry, st.tried);
    if (!e.memo.has(key) || e.memo.get(key).ok > st.d) zbPizzaSearch(e, st.idx, st.hungry, st.tried, st.d, Infinity);
    M = e.memo.get(key).M;
  } else {
    zbPizzaGreedy(e, st.idx, st.hungry, st.tried);
    M = e.greedy.get(zbPizzaKey(st.idx, st.hungry, st.tried)).M;
  }
  const meal = mealSlots(M), { lost, waiting } = people();
  const parts = zbPizzaSplit(e, st.idx, st.hungry, M);
  const tried = st.tried.concat(M).sort((x, y) => x - y);
  return {
    move: `Serve ${zbPizzaMealWords(level, meal)}; Zoombini ${st.lost + 1} carries it.`,
    zoombini: st.lost, left: st.idx.length, crossed: 0, meal, hungry: st.hungry,
    diagram: zbPizzaDiagram(level, band, { know: know(), fed: fedNow, meal, carrier: st.lost, waiting, lost, forgiven, pit, caption: `${st.idx.length} hypotheses left, ${forgiven.left} meal${forgiven.left === 1 ? '' : 's'} forgiven still` }),
    outcomes: parts.map(part => {
      const seen = zbPizzaReactions(e, st.hungry, part.code), reactions = seen.map(([t, c]) => zbPizzaReactionWords(t, c));
      if (part.eaten >= 0) {
        return { label: `${reactions.join('; ')}; ${part.idx.length} left`, left: part.idx.length, reactions: seen, eaten: part.eaten,
          next: () => { const fed = fedNow.slice(); fed[part.eaten] = true; return zbPizzaNode(e, band, { ...st, idx: part.idx, hungry: st.hungry & ~(1 << part.eaten), tried, fed }); } };
      }
      const rock = zbPizzaReactions(e, st.hungry, part.code).find(([, c]) => c === 1);
      const wasted = st.wasted + 1, losing = wasted > a;
      return { label: `${reactions.join('; ')}. ${rock ? `On ${ZB_PIZZA_TROLLS[rock[0]]}’s rock` : 'Into the pit'}, ${losing ? `and Zoombini ${st.lost + 1} is lost` : `forgiven (${a - wasted} more may be)`}; ${part.idx.length} left`,
        left: part.idx.length, reactions: seen, eaten: -1,
        next: () => zbPizzaNode(e, band, { ...st, idx: part.idx, tried, d: st.d - 1, wasted, lost: st.lost + (losing ? 1 : 0) }) };
    }),
  };
}
function zbPizzaStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program', pit = level === 4 && opts.state && opts.state.rejectExamples || null;
  const e = zbPizzaEngine(level, knows, pit), a = e.p.forgiven, n = band.length;
  zbPizzaPlan(e, opts.budget || 1500);
  const lose = Math.max(0, e.best - a), sure = Math.max(0, n - lose);
  const root = Array.from({ length: e.count }, (_, i) => i);
  return {
    hypotheses: e.count, sure, exact: lose === 0 || e.minimal, knows,
    root: zbPizzaNode(e, band, { idx: root, hungry: (1 << e.T) - 1, tried: e.pit, d: e.best, wasted: 0, lost: 0, fed: [] }),
    notes: [
      knows === 'form'
        ? `The player knows only the level’s form: each topping wanted by one troll or none, and no two trolls wanting the same meal; ${e.count} hypotheses.`
        : e.pit.length ? `Of the sets of wishes the program could deal at this level, ${e.count} give the pit it shows; the player knows that.`
          : `The program could deal ${e.count} sets of wishes at this level, whatever the band; the player knows that.`,
      'Each meal goes to the trolls still hungry in turn, Arno, Willa, Shyler, and the first whose wish it is eats it; the others’ reactions (a topping hated, more than one hated, none hated but some missing) are the feedback. A troll whose wish every hypothesis left agrees on is served it at once, for nothing.',
      `Played so, the trolls waste at most ${e.best} meal${e.best === 1 ? '' : 's'}${e.minimal ? ', and no play is sure of fewer' : '; fewer may do, but the search ran out of time before it could tell'}. ${lose ? `${a} are forgiven, so ${lose} Zoombini${lose === 1 ? '' : 's'} may be lost${e.minimal ? '' : ' by this play'}.` : `${a} are forgiven, so no Zoombini need be lost: every one of any band crosses.`}`,
      `How it plays: first the rule of thumb, the meal whose worst reaction leaves fewest hypotheses, every time; then a search for fewer meals wasted, ${e.mode === 'search' ? 'which found them' : 'which found none within its time'}.`,
      ...(level === 4 ? [e.pit.length
        ? `The four meals in the pit are read, as tried meals never to serve${knows === 'program' ? ', and as the program makes them: two toppings of the troll who wants the most, each crossed with one of each other troll’s' : ''}.`
        : 'The four meals in the pit are not known here (give opts.state to read them). So the play never serves two toppings that could be two trolls’, one each, which might be a pit meal the game would not judge; a player who reads the pit knows more, and is sure of more.'] : []),
      'A meal with no toppings is taken to be one the machine can make, as ScummVM lets it.',
    ],
  };
}

ZB_PUZZLES.set('PIZZA', {
  about: 'Pizza trolls block the pass, and each lets the band by only when served the meal it wants. The player makes pizzas, and later sundaes, at a machine, choosing the toppings, and a Zoombini carries each to the trolls.',
  levels: [
    { rule: 'Arno alone, and a pizza with two to five of five toppings: olives, green peppers, pepperoni, mushrooms and cheese. Each topping is picked on a draw of just under a half, round after round, until at least two are.',
      chances: 'Arno forgives six pizzas he does not eat. After that each one costs the Zoombini who carried it, and the next Zoombini carries on.' },
    { rule: 'Arno and Willa, each with a pizza and a sundae. The machine has six toppings, four for the pizza (no cheese at this level) and a cherry and whipped cream for the sundae; each is picked on a draw of 800 in 1001, round after round until at least three are, and each picked goes to Arno or Willa on a coin toss.',
      chances: 'Seven meals no troll eats are forgiven. After that each costs the Zoombini who carried it.',
      notes: ['Nothing makes sure both trolls want something at this level: when every topping picked goes to the same troll, about one deal in twelve, the other wants a meal with no toppings at all.'] },
    { rule: 'Arno, Willa and Shyler, from seven toppings: the five pizza toppings, a cherry and whipped cream. Nearly always all seven are wanted, each by one of the three at random; a troll left wanting nothing takes one from whichever of the other two wants more.',
      chances: 'Seven meals no troll eats are forgiven, as at level 2; after that each costs the Zoombini who carried it.' },
    { rule: 'As level 3, from eight toppings, chocolate sauce the eighth. Four rejected meals already lie in the pit: each pairs one of two toppings of the troll who wants the most with one of another troll’s.',
      chances: 'Seven meals no troll eats are forgiven, as at level 2; after that each costs the Zoombini who carried it.',
      notes: ['The four meals in the pit count as tried: serving one again counts against the band like any meal no troll eats.'] },
  ],
  deal(level, band, rnd) {
    const s = zbPizzaDeal(level, rnd);
    const trolls = ZB_PIZZA_TROLLS.slice(0, ZB_PIZZA_LEVELS[level - 1].trolls);
    const wants = [s.arnoToppings, s.willaToppings, s.shylerToppings];
    const buttons = zbPizzaSlots(level);
    const pizza = buttons.filter(i => i < ZB_PIZZA_SUNDAE_FROM), sundae = buttons.filter(i => i >= ZB_PIZZA_SUNDAE_FROM);
    const setup = [
      `${zbWordsOr(trolls, 'and')} ${trolls.length > 1 ? 'block' : 'blocks'} the pass. The machine has ${buttons.length} toppings: `
        + `${zbPizzaWords(pizza)} for the pizza${sundae.length ? `, and ${zbPizzaWords(sundae)} for the sundae` : ''}.`,
      `${band.length} Zoombini${band.length === 1 ? '' : 's'} to carry the meals, one at a time. ${s.initialMistakeAllowance} meals no troll eats are forgiven, `
        + `and ${s.initialMistakeAllowance + band.length} would cost the whole band.`,
    ];
    if (s.rejectExamples) setup.push(`Four meals already lie in the reject pit: ${s.rejectExamples.map(m => zbPizzaWords(m)).join('; ')}.`);
    const answer = trolls.map((name, t) => wants[t].length
      ? `${name} wants ${zbPizzaWords(wants[t])}, and nothing else.`
      : `${name} wants a meal with no toppings at all.`);
    const nobody = buttons.filter(i => !s.generatedToppings.includes(i));
    if (nobody.length) answer.push(`No troll wants ${zbWordsOr(nobody.map(i => ZB_PIZZA_TOPPINGS[i]))}.`);
    return { setup, answer, marks: band.map(() => null), state: s };
  },
  form(level, band, state) {
    const p = ZB_PIZZA_LEVELS[level - 1], trolls = ZB_PIZZA_TROLLS.slice(0, p.trolls), wishes = zbPizzaWishes(level, state);
    const fields = zbPizzaSlots(level).map(s => {
      const t = wishes.findIndex(w => w.includes(s));
      return { key: `s${s}`, label: ZB_PIZZA_SHORT[s], kind: 'choice', value: t < 0 ? 'nobody' : trolls[t],
        options: [{ value: 'nobody', label: 'wanted by no troll' }, ...trolls.map(name => ({ value: name, label: `wanted by ${name}` }))] };
    });
    fields.push({ key: 'note', kind: 'note', note: [
      level === 1 ? 'Arno wants at least two toppings, as the program deals.'
        : level === 2 ? 'At least three toppings are wanted in all, as the program deals; either troll may want none. There is no cheese at this level.'
          : `At least ${p.minimum} toppings are wanted in all, and every troll wants one at least, as the program deals.`,
      ...(level === 4 ? ['The pit’s four meals are dealt from the wishes; changed wishes make them again from the first toppings: two of the troll who wants the most, each with one of another troll’s.'] : []),
    ].join(' ') });
    return fields;
  },
  edit(level, band, state, values) {
    const p = ZB_PIZZA_LEVELS[level - 1], trolls = ZB_PIZZA_TROLLS.slice(0, p.trolls), want = trolls.map(() => []);
    for (const s of zbPizzaSlots(level)) {
      const v = values[`s${s}`] == null ? 'nobody' : values[`s${s}`];
      if (v === 'nobody') continue;
      const t = trolls.indexOf(v);
      if (t < 0) throw new Error(`${ZB_PIZZA_SHORT[s]}: there is no troll called ${v} at this level.`);
      want[t].push(s);
    }
    const generated = want.flat().sort((x, y) => x - y);
    if (level === 1 && generated.length < 2) throw new Error('Arno must want two toppings at least: the program deals no fewer.');
    if (generated.length < p.minimum) throw new Error(`At least ${p.minimum} toppings must be wanted in all: the program deals no fewer.`);
    if (level >= 3 && want.some(w => !w.length)) throw new Error('Every troll must want a topping at this level: the program sees to it.');
    const same = JSON.stringify(want) === JSON.stringify(zbPizzaWishes(level, state).map(w => w.slice().sort((x, y) => x - y)));
    return {
      machineToppingSlotCount: p.slots, minimumGeneratedToppingCount: p.minimum, toppingGenerationThreshold: p.threshold, initialMistakeAllowance: p.forgiven,
      generatedToppings: generated, arnoToppings: want[0], willaToppings: level >= 2 ? want[1] : null, shylerToppings: level >= 3 ? want[2] : null,
      rejectExamples: level === 4 ? (same && state.rejectExamples ? state.rejectExamples : zbPizzaPit(want)) : null, edited: true,
    };
  },
  solve(level, band, state) {
    const p = ZB_PIZZA_LEVELS[level - 1], wishes = zbPizzaWishes(level, state), n = band.length, all = band.map((_, i) => i);
    const steps = wishes.map((w, t) => `Zoombini 1 carries ${ZB_PIZZA_TROLLS[t]} ${zbPizzaMealWords(level, w)}, and ${ZB_PIZZA_TROLLS[t]} eats it.`);
    steps.push(`No meal is wasted, so no one is lost: all ${n} cross once the ${p.trolls === 1 ? 'troll has' : 'trolls have'} eaten.`);
    const know = wishes.map(w => { const k = new Array(8).fill('no'); w.forEach(s => { k[s] = 'yes'; }); return k; });
    return {
      most: n, exact: true, ways: 1,
      solutions: [{
        title: `All ${n} cross, on ${p.trolls === 1 ? 'one meal' : `${p.trolls} meals`}`,
        steps, crosses: all,
        diagram: zbPizzaDiagram(level, band, { know, fed: wishes.map(() => true), across: all, pit: state.rejectExamples,
          caption: `${p.trolls === 1 ? 'Arno has' : 'Every troll has'} eaten: all ${n} across` }),
      }],
      notes: [
        'Crossing: once every troll has eaten, every Zoombini not lost on the way crosses the pass.',
        'Simplest: fewest meals, each troll served its own once, none wasted. The order the trolls are served in, and who carries, make no difference, and count as one way.',
        ...(wishes.some(w => !w.length) ? ['A troll who wants nothing eats a meal with no toppings; ScummVM lets the machine make one, and the program is taken to as well.'] : []),
      ],
    };
  },
  strategy(level, band, arc, opts = {}) { return zbPizzaStrategy(level, band, opts); },
  /* The meal goes to the trolls still hungry (the node's hungry, a troll
     to a bit) in turn, each judging it against its wish, until one eats
     it; the outcome is the one with those reactions. A meal in the pit is
     not judged at all, and no outcome is the game's. */
  answer(level, band, state, node) {
    if (state.rejectExamples && state.rejectExamples.some(m => m.join() === node.meal.join())) return -1;
    const wishes = zbPizzaWishes(level, state), seen = [];
    for (let t = 0; t < wishes.length; t++) {
      if (!(node.hungry >> t & 1)) continue;
      const c = zbPizzaJudge(wishes[t], node.meal);
      seen.push([t, c]);
      if (c === 2) break;
    }
    const eaten = seen.length && seen[seen.length - 1][1] === 2 ? seen[seen.length - 1][0] : -1;
    return node.outcomes.findIndex(o => o.reactions ? o.reactions.join(';') === seen.join(';') : o.eaten === eaten);
  },
  source: 'ScummVM’s puzzle_pizza.cpp, checked against the program’s code.',
});
