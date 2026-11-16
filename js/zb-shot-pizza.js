/* zb-shot-pizza.js -- Pizza Pass read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-pizza.js.

   The machine. Each topping's button is a feature script of tBMP 7000, one
   script for the button out and the next for the button pressed. Level L's
   first is SCRB 7005, 7015, 7027 or 7041, and the buttons follow in the
   order of the toppings that have one (zbPizzaSlots), two scripts each.
   The levels put their buttons at different places, so the level whose
   buttons fit the frame best is the level, and the pressed ones are the
   meal on the machine.

   The meals. A meal no troll eats comes to rest as a feature script of
   tBMP 12000: SCRB 12016-12018 on Arno's rock, 12019-12021 on Willa's,
   12022-12024 on Shyler's, and 12025-12040 in the pit. Each rock's three
   scripts take turns, and the pit's sixteen do too, without 12038. So a
   rock shows its last three meals and the pit its last fifteen. A script's
   last tick draws the whole meal where it rests: the pizza (shapes 1-4,
   one for each size), cheese (5-8), mushrooms (9-12), pepperoni (13-16),
   green peppers (17-20), olives (21-24), the sundae (25-28), chocolate
   sauce (29-32), whipped cream (33-36) and a cherry (37-40). The program
   leaves out the shapes of the toppings the meal lacks, and at level 1
   the sundae.

   A troll that waits stands in front of some resting places, so the
   reader finds each waiting troll by the first tick of its waiting script
   (SCRB 8034, 9019, 10006) and leaves its pixels out.

   zbShotPizza draws each resting place with every set of toppings and
   reads the set that fits the frame best. Meals overlap, so it reads the
   place that fits best first and leaves that meal's pixels out of the
   comparison for the others. A topping whose pixels are all under another meal or a
   Zoombini is unread.

   A troll that has eaten sits by its rock with the meal in front of it:
   the last tick of SCRB 8021 for Arno, 9027 for Willa and 10031 for
   Shyler, drawn from the troll's sheet (tBMP 8000, 9000, 10000), whose
   shapes 152-191 are the meal's in the same order. The program leaves out
   the toppings the troll did not want, so that meal is the troll's wish.

   What follows. A meal on a troll's rock has only toppings that troll
   wants, and not all of them. A meal in the pit is no part of the wish of
   any troll that was hungry when it was served, and the reader counts a
   troll that has eaten as not hungry for every pit meal. Of the wishes the program could deal (zbPizzaEngine), the
   reader lists those that put every meal read where it lies, and gives for
   each troll the toppings every such wish has and the ones only some
   have.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_pizza.cpp and .h:
   getToppingButtonScrbId and kToppingScrbTable for the buttons,
   registerToppingRunner for the resting scripts and their turns,
   toppingRunner_preRenderShape with the kMealShape numbers for the shapes
   of each topping, and evaluateDelivery and orderFeature_preRenderShape
   for the troll that eats. Meals served in the game on 15 November 2026 lay
   where the scripts' last ticks put them.
*/

const ZB_SHOT_PIZZA = {
  machineSheet: 7000, buttons: [7005, 7015, 7027, 7041],
  mealSheet: 12000, mealFirst: 1, rocks: [12016, 12019, 12022], rockPlaces: 3, pit: 12025, pitPlaces: 16,
  /* each troll's sheet and the script that ends with the troll eating */
  eaten: [{ sheet: 8000, script: 8021 }, { sheet: 9000, script: 9027 }, { sheet: 10000, script: 10031 }], eatenFirst: 152,
  /* each troll's script as it waits, whose first tick is the troll standing */
  waiting: [8034, 9019, 10006],
  /* a meal's shapes come in groups of four, one shape for each size, in
     this order from the first: the pizza (-1), five toppings by their
     numbers in ZB_PIZZA_TOPPINGS, the sundae (-2), and three more toppings */
  groups: [-1, 4, 3, 2, 1, 0, -2, 7, 6, 5],
};

/* The level whose buttons fit the frame best: { level, value, pressed,
   unread }, `pressed` the toppings whose button is in and `unread` those
   whose button neither script fits. `level` is null when no level's
   buttons fit. */
function zbShotPizzaMachine(env, skip) {
  const arc = env.arc, sprites = decodeBitmapResource(arc.get('tBMP', ZB_SHOT_PIZZA.machineSheet)).frames;
  const fitOf = script => {
    if (!arc.has('SCRB', script)) return null;
    const tick = zbFeatureTicks(parseScript(arc.get('SCRB', script), 'SCRB')).find(t => t.records.length);
    if (!tick) return null;
    const pieces = tick.records.filter(r => sprites[r.shape - 1]).map(r => ({ sprite: sprites[r.shape - 1], x: r.x, y: r.y }));
    return zbShotDrawingFit(env, zbShotDrawing(env, pieces), 0, 0, skip);
  };
  let best = null;
  for (let level = 1; level <= 4; level++) {
    const pressed = [], unread = [];
    let value = 0;
    zbPizzaSlots(level).forEach((topping, k) => {
      const out = fitOf(ZB_SHOT_PIZZA.buttons[level - 1] + 2 * k), down = fitOf(ZB_SHOT_PIZZA.buttons[level - 1] + 2 * k + 1);
      if (!out || !down) return;
      const top = down.value > out.value ? down : out;
      value += top.value;
      if (top.fit < 0.8 || top.shown < 0.5) unread.push(topping);
      else if (top === down) pressed.push(topping);
    });
    if (!best || value > best.value) best = { level, value, pressed, unread };
  }
  return best && best.value > 0 ? best : { level: null, value: 0, pressed: [], unread: [] };
}

/* The places a level's meals rest: [{ script, where, eaten, layers }],
   `where` 0-2 for a troll and -1 for the pit, `eaten` true for the meal
   in front of a troll that has eaten and false for one on the troll's
   rock, and `layers` the last tick's records as { topping, sprite, x, y },
   `topping` -1 for the pizza, -2 for the sundae, and otherwise the
   topping's number. A level has only the layers of its toppings, and
   level 1 has no sundae. */
function zbShotPizzaPlaces(arc, level) {
  const has = new Set(zbPizzaSlots(level)), trolls = ZB_PIZZA_LEVELS[level - 1].trolls, sheets = new Map();
  const frames = id => {
    if (!sheets.has(id)) sheets.set(id, decodeBitmapResource(arc.get('tBMP', id)).frames);
    return sheets.get(id);
  };
  const scripts = [];
  for (let t = 0; t < trolls; t++) {
    scripts.push({ script: ZB_SHOT_PIZZA.eaten[t].script, where: t, eaten: true, sheet: ZB_SHOT_PIZZA.eaten[t].sheet, first: ZB_SHOT_PIZZA.eatenFirst });
    for (let k = 0; k < ZB_SHOT_PIZZA.rockPlaces; k++) scripts.push({ script: ZB_SHOT_PIZZA.rocks[t] + k, where: t, eaten: false });
  }
  for (let k = 0; k < ZB_SHOT_PIZZA.pitPlaces; k++) scripts.push({ script: ZB_SHOT_PIZZA.pit + k, where: -1, eaten: false });
  const out = [];
  for (const { script, where, eaten, sheet = ZB_SHOT_PIZZA.mealSheet, first = ZB_SHOT_PIZZA.mealFirst } of scripts) {
    if (!arc.has('SCRB', script) || !arc.has('tBMP', sheet)) continue;
    const ticks = zbFeatureTicks(parseScript(arc.get('SCRB', script), 'SCRB')).filter(t => t.records.length);
    if (!ticks.length) continue;
    const sprites = frames(sheet), layers = [];
    for (const r of ticks[ticks.length - 1].records) {
      const group = ZB_SHOT_PIZZA.groups[Math.floor((r.shape - first) / 4)];
      if (r.shape < first || group == null || !sprites[r.shape - 1]) continue;
      if (group === -1 || (group === -2 && level >= 2) || has.has(group)) layers.push({ topping: group, sprite: sprites[r.shape - 1], x: r.x, y: r.y });
    }
    if (layers.some(l => l.topping === -1)) out.push({ script, where, eaten, layers });
  }
  return out;
}

/* A resting place's best meal where `skip` leaves it in view: { fit,
   meal, unread }, `meal` the toppings of the set that fits best and
   `unread` the toppings that fit as well in it as out of it. The pizza's
   toppings are chosen first, with the sundae's pixels left out, and then
   the sundae's over that pizza. */
function zbShotPizzaMeal(env, place, skip) {
  const pizza = place.layers.filter(l => l.topping >= 0 && l.topping < ZB_PIZZA_SUNDAE_FROM).map(l => l.topping);
  const sundae = place.layers.filter(l => l.topping >= ZB_PIZZA_SUNDAE_FROM).map(l => l.topping);
  const draw = set => zbShotDrawing(env, place.layers.filter(l => l.topping < 0 || set.has(l.topping)));
  /* the sundae's pixels, which the choice of pizza toppings leaves out */
  const under = Uint8Array.from(skip), marked = [];
  for (const l of place.layers.filter(q => q.topping === -2 || q.topping >= ZB_PIZZA_SUNDAE_FROM)) {
    for (let y = 0; y < l.sprite.height; y++) {
      for (let x = 0; x < l.sprite.width; x++) {
        const X = l.x + x, Y = l.y + y;
        if (l.sprite.pixels[y * l.sprite.width + x] && X >= 0 && Y >= 0 && X < ZB_SHOT_W && Y < ZB_SHOT_H) under[Y * ZB_SHOT_W + X] = 1;
      }
    }
  }
  const choose = (list, fixed, mask) => {
    let best = null;
    const values = new Map();
    for (let bits = 0; bits < 1 << list.length; bits++) {
      const set = new Set([...fixed, ...list.filter((t, k) => bits >> k & 1)]);
      const fit = zbShotDrawingFit(env, draw(set), 0, 0, mask);
      values.set(bits, fit.value);
      if (!best || fit.value > best.fit.value) best = { bits, fit };
    }
    const unread = list.filter((t, k) => values.get(best.bits ^ 1 << k) === best.fit.value);
    return { chosen: list.filter((t, k) => best.bits >> k & 1), unread, fit: best.fit };
  };
  const p = choose(pizza, [], under);
  const s = choose(sundae, p.chosen, skip);
  return { fit: s.fit, meal: [...p.chosen, ...s.chosen].filter(t => !p.unread.includes(t) && !s.unread.includes(t)).sort((a, b) => a - b),
    unread: [...p.unread, ...s.unread].sort((a, b) => a - b), drawing: draw(new Set([...p.chosen, ...s.chosen])) };
}

/* Pizza Pass. Returns { level, machine, meals, wishes, waiting,
   zoombinis, state, lines, link }: `machine` zbShotPizzaMachine's, `meals`
   the meals read, each { script, where, eaten, meal, unread, fit },
   `wishes` what fits them, { count, trolls: [{ certain, possible }] }, or
   null, and `waiting` whether each troll stands where it waits. */
function zbShotPizza(frame, zoombinis) {
  const env = zbShotEnv(frame), arc = frame.arc, skip = zbShotCovered(zoombinis);
  const machine = zbShotPizzaMachine(env, skip), level = machine.level;
  for (const z of zoombinis) z.where = '';
  if (!level) {
    return { level: null, machine, meals: [], wishes: null, zoombinis, state: { level: null },
      lines: ['The page could not find the machine’s buttons, so it shows no level and no meals.'], link: null };
  }
  /* a troll that waits stands in front of some of the resting places */
  const waiting = [];
  for (let t = 0; t < ZB_PIZZA_LEVELS[level - 1].trolls; t++) {
    const sheet = ZB_SHOT_PIZZA.eaten[t].sheet, script = ZB_SHOT_PIZZA.waiting[t];
    if (!arc.has('SCRB', script) || !arc.has('tBMP', sheet)) continue;
    const sprites = decodeBitmapResource(arc.get('tBMP', sheet)).frames;
    const tick = zbFeatureTicks(parseScript(arc.get('SCRB', script), 'SCRB')).find(k => k.records.length);
    const drawing = zbShotDrawing(env, tick.records.filter(r => sprites[r.shape - 1]).map(r => ({ sprite: sprites[r.shape - 1], x: r.x, y: r.y })));
    waiting[t] = zbShotDrawingFit(env, drawing, 0, 0, skip).fit >= 0.5;
    if (!waiting[t]) continue;
    for (let q = 0; q < drawing.points.length; q += 7) {
      const x = drawing.points[q], y = drawing.points[q + 1];
      if (x >= 0 && y >= 0 && x < ZB_SHOT_W && y < ZB_SHOT_H) skip[y * ZB_SHOT_W + x] = 1;
    }
  }
  /* a place with nothing on it shows the picture */
  const bare = place => {
    const base = place.layers.find(l => l.topping === -1);
    let differs = 0, seen = 0;
    for (let y = 0; y < base.sprite.height; y += 2) {
      for (let x = 0; x < base.sprite.width; x += 2) {
        const X = base.x + x, Y = base.y + y, i = Y * ZB_SHOT_W + X;
        if (!base.sprite.pixels[y * base.sprite.width + x] || X < 0 || Y < 0 || X >= ZB_SHOT_W || Y >= ZB_SHOT_H || skip[i] || env.colors[3 * i] !== env.colors[3 * i]) continue;
        const c = env.rgb[frame.pixels[i]];
        seen++;
        if (Math.abs(env.colors[3 * i] - c[0]) + Math.abs(env.colors[3 * i + 1] - c[1]) + Math.abs(env.colors[3 * i + 2] - c[2]) > env.tolerance + 12) differs++;
      }
    }
    return seen > 0 && differs < 0.3 * seen;
  };
  let open = zbShotPizzaPlaces(arc, level).filter(p => !bare(p));
  const meals = [], covered = Uint8Array.from(skip);
  while (open.length) {
    let top = null;
    for (const place of open) {
      const m = zbShotPizzaMeal(env, place, covered);
      if (m.fit.shown >= 0.2 && m.fit.fit >= 0.8 && (!top || m.fit.fit > top.m.fit.fit)) top = { place, m };
    }
    if (!top) break;
    meals.push({ script: top.place.script, where: top.place.where, eaten: top.place.eaten, meal: top.m.meal, unread: top.m.unread, fit: top.m.fit.fit });
    const pts = top.m.drawing.points;
    for (let p = 0; p < pts.length; p += 7) {
      const x = pts[p], y = pts[p + 1];
      if (x >= 0 && y >= 0 && x < ZB_SHOT_W && y < ZB_SHOT_H) covered[y * ZB_SHOT_W + x] = 1;
    }
    open = open.filter(p => p !== top.place);
  }
  meals.sort((a, b) => a.script - b.script);

  /* the wishes the program could deal that put each meal where it lies */
  const p = ZB_PIZZA_LEVELS[level - 1], trolls = p.trolls, buttons = zbPizzaSlots(level);
  const mask = meal => meal.reduce((acc, t) => acc | 1 << buttons.indexOf(t), 0);
  const whole = meals.filter(m => !m.unread.length), fed = [0, 1, 2].map(t => meals.some(m => m.eaten && m.where === t));
  let wishes = null;
  if (whole.length) {
    const e = zbPizzaEngine(level, 'program'), fitting = [];
    for (let i = 0; i < e.count; i++) {
      const wish = [0, 1, 2].map(t => e.wish(t, i));
      const fits = whole.every(m => {
        const M = mask(m.meal);
        if (m.eaten) return M === wish[m.where];
        if (m.where >= 0) return (M & ~wish[m.where]) === 0 && M !== wish[m.where];
        return wish.slice(0, trolls).every((w, t) => fed[t] || (M & ~w) !== 0);
      });
      if (fits) fitting.push(wish);
    }
    wishes = { count: fitting.length, trolls: [] };
    for (let t = 0; t < trolls; t++) {
      const certain = buttons.filter((s, b) => fitting.length && fitting.every(w => w[t] >> b & 1));
      const possible = buttons.filter((s, b) => fitting.some(w => w[t] >> b & 1) && !certain.includes(s));
      wishes.trolls.push({ certain, possible });
    }
  }

  const lines = [`The machine has level ${level}’s buttons, ${ZB_LEVELS[level - 1]}, so ${trolls === 1 ? 'Arno is the only troll' : `the trolls are ${zbWordsOr(ZB_PIZZA_TROLLS.slice(0, trolls), 'and')}`}.`];
  if (machine.pressed.length) lines.push(`The meal on the machine has ${zbPizzaWords(machine.pressed)}.`);
  const words = m => zbPizzaMealWords(level, m.meal) + (m.unread.length ? `, with ${zbPizzaWords(m.unread)} hidden under something` : '');
  const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
  for (let t = 0; t < trolls; t++) {
    const on = meals.filter(m => m.where === t && !m.eaten), ate = meals.find(m => m.where === t && m.eaten), name = ZB_PIZZA_TROLLS[t];
    if (ate) lines.push(`${name} has eaten. ${name}’s meal is ${words(ate)}.`);
    if (on.length === 1) lines.push(`${name}’s rock has ${words(on[0])}. ${name} wants every topping on it and more.`);
    else if (on.length) {
      on.forEach((m, k) => lines.push(`The ${ordinal[k]} meal on ${name}’s rock is ${words(m)}.`));
      lines.push(`${name} wants every topping on those meals and more.`);
    }
  }
  const pit = meals.filter(m => m.where < 0);
  if (pit.length === 1) lines.push(`The pit has ${words(pit[0])}. No troll that was hungry then wants that meal or a meal with more on it.`);
  else if (pit.length) {
    pit.forEach((m, k) => lines.push(`The ${ordinal[k]} meal in the pit is ${words(m)}.`));
    lines.push('No troll that was hungry then wants any of the pit’s meals or a meal with more on it.');
  }
  if (!meals.length) lines.push('No meal lies on a rock or in the pit, so every wish fits.');
  else if (wishes && !wishes.count) lines.push('No wishes the program deals put those meals where they lie, so the page may have misread a meal.');
  else if (wishes) {
    lines.push(`${wishes.count === 1 ? 'One set of wishes fits' : `${wishes.count} sets of wishes fit`} the meals.`);
    wishes.trolls.forEach((w, t) => {
      const parts = [];
      if (w.certain.length) parts.push(`wants ${zbPizzaWords(w.certain)}`);
      if (w.possible.length) parts.push(`may want ${zbWordsOr(w.possible.map(i => ZB_PIZZA_TOPPINGS[i]), 'or')}`);
      lines.push(`${ZB_PIZZA_TROLLS[t]} ${parts.length ? parts.join(' and ') : 'wants none of the toppings left'}.`);
    });
  }
  const band = zoombinis.map(z => z.traits), complete = band.length > 0 && band.length <= 16 && band.every(t => ZB_SHOT_TRAITS.every(k => t[k] != null));
  let link = null;
  if (complete && wishes && wishes.count === 1) {
    const set = {};
    for (const s of buttons) {
      const t = wishes.trolls.findIndex(w => w.certain.includes(s));
      set[`s${s}`] = t < 0 ? 'nobody' : ZB_PIZZA_TROLLS[t];
    }
    link = { hash: `solve=PIZZA${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(band)}&set=${encodeURIComponent(JSON.stringify(set))}`, text: 'Take the trolls’ wishes apart' };
  } else if (complete) link = { hash: `solve=PIZZA${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(band)}`, text: 'Take Pizza Pass apart for this band' };
  const names = m => m.meal.map(t => ZB_PIZZA_TOPPINGS[t]);
  return { level, machine, meals, wishes, waiting, zoombinis,
    state: { level, machine: machine.pressed.map(t => ZB_PIZZA_TOPPINGS[t]),
      eaten: ZB_PIZZA_TROLLS.slice(0, trolls).map((n, t) => { const m = meals.find(q => q.eaten && q.where === t); return m ? names(m) : null; }),
      rocks: ZB_PIZZA_TROLLS.slice(0, trolls).map((n, t) => meals.filter(m => m.where === t && !m.eaten).map(names)), pit: pit.map(names),
      wishes: wishes ? wishes.count : null },
    lines, link };
}

ZB_SHOT_PUZZLES.PIZZA = zbShotPizza;
