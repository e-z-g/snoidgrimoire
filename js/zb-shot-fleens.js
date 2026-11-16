/* zb-shot-fleens.js -- Fleens! read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js, zb-snoid.js and zb-puzzle-fleens.js.

   A Fleen is five sprites of FLEENS tBMP 4000, one a part, as a Zoombini
   is five of ZOOMBINI tBMP 3000 (zb-snoid.js, the 'fleen' sheet). A Fleen
   standing still is the first frame of SCRS 4000: the body and each
   trait's part, placed from the Fleen's anchor. The game gives a Fleen a
   seat when the puzzle opens. REGS 5000 has the three seats of the
   beehive branch, and REGS 5001 the 17 seats of the other branches, of
   which a band of 16 fills 13. Each kind of seat fills in band order.

   A Zoombini dropped on the lure spot runs off, and its Fleen jumps down
   and chases it around the tree. The Zoombini ends on the tree's branch
   at (199, 120) and its Fleen under the tree at (214, 207). Each pair
   that comes later moves the pairs before it one place to the left, a
   Zoombini by 20 pixels and a Fleen by 21. So the Zoombini at a place on
   the branch and the Fleen at the same place under the tree are a pair.
   Six pairs fit, and a seventh sends the oldest Zoombini back with its
   Fleen behind it.

   zbShotFleens tries each seat and each place under the tree. At each it
   fits every value of every part, facing either way, a pixel or two up or
   down as the Fleen bobs. Fleens stand close and cover each other. So a
   second pass leaves out the pixels that another Fleen's drawing
   matches, and a part with too little left in view stays unread. A Fleen
   on its way between a branch and the tree is in another pose, and the
   reader leaves it unread.

   The screen never shows the level, and the beehive looks the same
   however many of its Fleens are gone. The count lured off is three
   minus the Fleens still on the beehive branch.

   What follows is the hidden pairing (zb-puzzle-fleens.js): the Fleen
   trait each Zoombini trait becomes and a rotation of its five values.
   zbShotFleensPairings tries all of them. A pairing fits when each pair
   at the tree matches under it and, when every Zoombini is read whole
   and each has a Fleen standing in view, the Zoombinis not sent yet
   become the Fleens on the branches. A Fleen with a part unread may be
   any Fleen that has the parts read. A pairing with every trait unmoved is a level 1 or 2 deal,
   and one with hair moved a level 3 or 4 deal.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_fleens.cpp:
   spawnFleenCreatures (the seats from REGS 5000 and 5001, in band
   order), loadFleenCreatureScrs and resolveFleenRenderHotspot (a Fleen
   drawn from SCRS 4000 with its first record at the anchor, a sprite's
   registration point from REGS 4000 and 4001), and
   processInitialLureOrSubmittedPairEscapeEvent (the Fleen sent to
   (214, 207)). The places are the last frames of the scripts: SCRS
   7000-7004 leave a Zoombini at (199, 120) and SCRS 7016-7020 move it
   20 to the left, SCRS 4031-4035 leave a Fleen at (214, 207) and SCRS
   4041-4045 move it 21 to the left. The game played on 15 November 2026
   stood each pair at those places.
*/

/* The seats' REGS, the script of a Fleen standing, the eyes' poses a
   standing Fleen has (16 on a branch and 1 after a run), how far a part
   bobs, the first place on the tree's branch and under the tree with the
   step to the next, how many places there are, and the lure spot. */
const ZB_SHOT_FLEENS = {
  hive: 5000, others: 5001, standing: 4000, eyes: [16, 1], bob: [0, -1, -2, 1],
  tree: { x: 199, y: 120, step: -20 }, ground: { x: 214, y: 207, step: -21 }, places: 7,
  lure: { x: 438, y: 357 }, sitting: [7000, 7001, 7002, 7003, 7004],
};

/* The points of a REGS that is a count and then x and y pairs:
   [[x, y]]. */
function zbShotFleensPoints(bytes) {
  const out = [];
  for (let i = 0; i < i16be(bytes, 0); i++) out.push([i16be(bytes, 2 + 4 * i), i16be(bytes, 4 + 4 * i)]);
  return out;
}

/* Every sprite a snoid at one tick of a script may be drawn from, as
   drawings from the place of the tick's first record: [facing][part] is
   [{ value, drawing }], several for a value where `eyes` lists several
   poses for the eyes, and [facing].body one drawing. `sheet` is
   zbSnoidSheet's, and `tick` is an index into the script's ticks, from
   the end where it is below 0. */
function zbShotFleensDrawings(env, sheet, script, tick = 0, eyes = null) {
  const ticks = zbSnoidTicks(parseScript(env.arc.get('SCRS', script), 'SCRS'));
  const t = ticks[tick < 0 ? ticks.length + tick : tick];
  const parts = zbSnoidParts(t), anchor = t.records[0];
  const drawing = (part, value, pose, facing) => {
    const p = parts.find(q => q.part === part), f = zbSnoidFrame(part, value, pose == null ? p.shape : pose, facing, sheet.blocks);
    if (f == null) return null;
    return zbShotDrawing(env, [{ sprite: sheet.frames[f], x: p.x - anchor.x - sheet.xs[f + 1], y: p.y - anchor.y - sheet.ys[f + 1] }]);
  };
  return [0, 1].map(facing => {
    const out = { body: drawing('body', 1, null, facing) };
    for (const part of ZB_SHOT_TRAITS) {
      out[part] = [];
      for (let value = 1; value <= 5; value++) {
        for (const pose of part === 'eyes' && eyes ? eyes : [null]) {
          const d = drawing(part, value, pose, facing);
          if (d) out[part].push({ value, drawing: d });
        }
      }
    }
    return out;
  });
}

/* The Zoombinis sitting on the tree's branch that `zoombinis` lacks, read
   at each place on the branch with no Zoombini near it: [{ x, y, traits,
   sitting: true }]. A Zoombini sits as the last tick of SCRS 7000 to 7004
   leaves it, one script for each kind of feet, its first record at the
   place. Zoombinis on the branch sit 20 pixels apart, closer than
   zbShotCovered's boxes, so the fit leaves no pixel out. A trait is read
   as zbShotFleensRead reads a Fleen's. */
function zbShotFleensSitting(env, zoombinis) {
  const K = ZB_SHOT_FLEENS, zarc = env.archives && env.archives.get('ZOOMBINI');
  if (!zarc) return [];
  const sheet = zbSnoidSheet(zarc, 'zoombini');
  const sets = K.sitting.map(id => zbShotFleensDrawings(env, sheet, id, -1));
  const out = [];
  for (let k = 0; k < K.places; k++) {
    const x = K.tree.x + k * K.tree.step, y = K.tree.y;
    if (zoombinis.some(z => Math.abs(z.x - x) <= 12 && Math.abs(z.y - y) <= 12)) continue;
    let best = null;
    for (const d of sets) {
      const f = zbShotFleensAt(env, d, x, y, null);
      if (!best || f.fit > best.fit) best = f;
    }
    if (!best || best.fit < (env.smoothed ? 0.55 : 0.6) || best.known < 150) continue;
    const traits = {};
    for (const part of ZB_SHOT_TRAITS) traits[part] = zbShotFleensTrait(env, best.parts[part]);
    out.push({ x, y, traits, sitting: true });
  }
  return out;
}

/* A part's value as read, or null where too little is in view or two
   values fit alike. */
function zbShotFleensTrait(env, p) {
  const read = p.shown >= 0.3 && p.matched >= (env.smoothed ? 0.45 : 0.8) * p.known && p.matched - p.next >= Math.max(env.smoothed ? 4 : 6, 0.15 * p.matched);
  return read ? p.value : null;
}

/* A Fleen standing with its anchor at (X, Y), or what fits best there:
   { x, y, facing, parts, matched, known, fit }. `parts` has for each
   trait { value, drawing, dy, matched, known, shown, next }, the value
   whose sprite matches the most pixels, with `next` the most that
   another value matches. `fit` is the share of the four parts' pixels in
   view that match. `skip` marks pixels to leave out. */
function zbShotFleensAt(env, drawings, X, Y, skip) {
  let best = null;
  for (let facing = 0; facing < 2; facing++) {
    const parts = {};
    let matched = 0, known = 0;
    for (const part of ZB_SHOT_TRAITS) {
      const byValue = [0, 0, 0, 0, 0, 0];
      let top = null;
      for (const c of drawings[facing][part]) {
        for (const dy of ZB_SHOT_FLEENS.bob) {
          const f = zbShotDrawingFit(env, c.drawing, X, Y + dy, skip);
          if (f.matched > byValue[c.value]) byValue[c.value] = f.matched;
          if (!top || f.matched > top.matched) top = { value: c.value, drawing: c.drawing, dy, matched: f.matched, known: f.known, shown: f.shown };
        }
      }
      top.next = Math.max(...byValue.filter((n, v) => v !== top.value));
      parts[part] = top;
      matched += top.matched; known += top.known;
    }
    if (!best || matched > best.matched) best = { x: X, y: Y, facing, parts, matched, known, fit: known ? matched / known : 0 };
  }
  return best;
}

/* The Fleens standing at `places` ([[x, y]]): for each place a Fleen
   or null. A Fleen is { x, y, facing, traits, fit }, a trait null where
   too little of its part is in view or two values fit alike. The first
   pass finds which places have a Fleen. The second reads each one
   without the pixels that the Zoombinis cover or that another Fleen's
   parts match. */
function zbShotFleensRead(env, drawings, places, zoombinis) {
  const cover = zbShotCovered(zoombinis);
  const first = places.map(([x, y]) => {
    const f = zbShotFleensAt(env, drawings, x, y, cover);
    return f.fit >= 0.45 && f.known >= 200 ? f : null;
  });
  /* the frame pixels each Fleen's parts match */
  const pixels = first.map(f => {
    if (!f) return null;
    const matching = [];
    for (const part of ZB_SHOT_TRAITS) {
      const p = f.parts[part], pts = p.drawing.points;
      for (let k = 0; k < pts.length; k += 7) {
        const x = f.x + pts[k], y = f.y + p.dy + pts[k + 1];
        if (x < 0 || y < 0 || x >= ZB_SHOT_W || y >= ZB_SHOT_H) continue;
        const o = 3 * (y * ZB_SHOT_W + x), c = env.colors;
        if (Math.abs(c[o] - pts[k + 2]) + Math.abs(c[o + 1] - pts[k + 3]) + Math.abs(c[o + 2] - pts[k + 4]) <= env.tolerance) matching.push(y * ZB_SHOT_W + x);
      }
    }
    return matching;
  });
  return first.map((f, k) => {
    if (!f) return null;
    const skip = cover.slice();
    pixels.forEach((matching, j) => { if (matching && j !== k) for (const i of matching) skip[i] = 1; });
    const r = zbShotFleensAt(env, drawings, f.x, f.y, skip), traits = {};
    for (const part of ZB_SHOT_TRAITS) traits[part] = zbShotFleensTrait(env, r.parts[part]);
    return { x: f.x, y: f.y, facing: r.facing, traits, fit: r.fit };
  });
}

/* A Fleen's four traits as digits, `?` for one unread. */
function zbShotFleensCode(f) { return ZB_SHOT_TRAITS.map(k => f.traits[k] ?? '?').join(''); }

/* Whether the Fleens `branch` (traits, null for a part unread) can be the
   Fleens `looks` (zbFleensLook's numbers), one each: every Fleen read
   whole is one of the looks, and each of the others has a look left that
   has the parts read of it. */
function zbShotFleensAre(branch, looks) {
  if (branch.length !== looks.length) return false;
  const left = new Map(), partly = [];
  for (const l of looks) left.set(l, (left.get(l) || 0) + 1);
  for (const f of branch) {
    if (ZB_SHOT_TRAITS.some(k => f[k] == null)) { partly.push(f); continue; }
    const l = zbFleensLook(f);
    if (!left.get(l)) return false;
    left.set(l, left.get(l) - 1);
  }
  const place = i => {
    if (i === partly.length) return true;
    for (const [l, n] of left) {
      if (!n) continue;
      const g = zbFleensFromLook(l);
      if (!ZB_SHOT_TRAITS.every(k => partly[i][k] == null || partly[i][k] === g[k])) continue;
      left.set(l, n - 1);
      if (place(i + 1)) return true;
      left.set(l, n);
    }
    return false;
  };
  return place(0);
}

/* The hidden pairings that fit. `pairs` is [[zoombini traits, fleen
   traits]], each pair known to go together. `unsent` and `branch` are the
   traits of the Zoombinis not sent, all read, and of the Fleens on the
   branches, a part unread null, or both null when the screenshot does not
   show the whole of both. Returns [{ slots, kinds, rotations }], `slots`
   and `kinds` in zbFleensKinds's form and `rotations` a turn for each
   Zoombini trait. The list has no pairing with hair as hair and another
   trait moved, since the program deals none at any level. */
function zbShotFleensPairings(pairs, unsent, branch) {
  const out = [];
  for (const slots of zbFleensMixings(3, 'form')) {
    const same = slots.every((s, i) => s === i + 1);
    if (slots[0] === 1 && !same) continue;
    const kinds = zbFleensKinds(slots);
    for (let r = 0; r < 625; r++) {
      const rotations = [Math.floor(r / 125) + 1, Math.floor(r / 25) % 5 + 1, Math.floor(r / 5) % 5 + 1, r % 5 + 1];
      if (!pairs.every(([z, f]) => zbFleensLook(zbFleensOf(z, rotations, kinds)) === zbFleensLook(f))) continue;
      if (branch && !zbShotFleensAre(branch, unsent.map(z => zbFleensLook(zbFleensOf(z, rotations, kinds))))) continue;
      out.push({ slots: same ? [0, 0, 0, 0] : slots, kinds, rotations });
    }
  }
  return out;
}

/* Fleens!. Returns { hive, others, ground, tree, waiting, away, pairings,
   zoombinis, state, lines, link }: `hive` and `others` the Fleen on each
   seat of the beehive branch and of the other branches or null, `ground`
   the Fleens under the tree and `tree` the Zoombinis on its branch, both
   from the place next to the trunk, `waiting` the Zoombinis not sent
   and `away` those neither waiting nor on the branch, and `pairings`
   zbShotFleensPairings's or null when nothing limits them. A Zoombini
   whose Fleen is certain has it as `fleen`, and `hive` on it is the
   beehive seat of that Fleen. */
function zbShotFleens(frame, zoombinis) {
  const env = zbShotEnv(frame), arc = frame.arc, K = ZB_SHOT_FLEENS;
  const drawings = zbShotFleensDrawings(env, zbSnoidSheet(arc, 'fleen'), K.standing, 0, K.eyes);
  zoombinis = [...zoombinis, ...zbShotFleensSitting(env, zoombinis)];
  const hiveSeats = zbShotFleensPoints(arc.get('REGS', K.hive)), otherSeats = zbShotFleensPoints(arc.get('REGS', K.others));
  const places = k => Array.from({ length: K.places }, (_, i) => [k.x + i * k.step, k.y]);
  const found = zbShotFleensRead(env, drawings, [...hiveSeats, ...otherSeats, ...places(K.ground)], zoombinis);
  const hive = found.slice(0, hiveSeats.length), others = found.slice(hiveSeats.length, hiveSeats.length + otherSeats.length);
  const ground = found.slice(hiveSeats.length + otherSeats.length);
  while (ground.length && !ground[ground.length - 1]) ground.pop();

  const treeAt = places(K.tree).flat(), tree = [], waiting = [], away = [];
  for (const z of zoombinis) {
    const k = zbShotPlaceIn(treeAt, z.x, z.y);
    if (k >= 0 && !tree[k]) { tree[k] = z; z.where = `on the tree’s branch, at place ${k + 1} from the trunk`; }
    else if (Math.abs(z.x - K.lure.x) <= 3 && Math.abs(z.y - K.lure.y) <= 3) { away.push(z); z.where = 'on the lure spot'; }
    else if (z.y >= 330 && z.x <= 330) { waiting.push(z); z.where = 'waiting'; }
    else { away.push(z); z.where = 'away from the others'; }
  }
  for (let k = 0; k < tree.length; k++) if (!tree[k]) tree[k] = null;

  const code = z => ZB_SHOT_TRAITS.map(k => z.traits[k] ?? '?').join('');
  const whole = t => ZB_SHOT_TRAITS.every(k => t[k] != null);
  const onBranches = [...hive, ...others].filter(Boolean), onGround = ground.filter(Boolean), inTree = tree.filter(Boolean);
  const fleens = onBranches.length + onGround.length, unsent = [...waiting, ...away];
  const lines = [], count = (n, one, many) => (n === 1 ? `One ${one}` : `${n || 'No'} ${many}`);
  const state = {
    level: null,
    hive: hive.map(f => (f ? zbShotFleensCode(f) : null)),
    others: others.map(f => (f ? zbShotFleensCode(f) : null)),
    ground: ground.map(f => (f ? zbShotFleensCode(f) : null)),
    tree: tree.map(z => (z ? code(z) : null)),
    waiting: waiting.length, away: away.length,
    lured: null, pairings: null, levels: null, beehive: null,
  };
  if (!fleens) {
    lines.push(zoombinis.length ? 'No Fleen stands on a branch or under the tree. After the third beehive Fleen is lured off, the bees chase every Fleen away, and the Zoombinis may go on.'
      : 'The page found no Fleen and no Zoombini.');
    if (inTree.length) lines.push(`${count(inTree.length, 'Zoombini is', 'Zoombinis are')} on the tree’s branch and ${waiting.length + away.length} ${waiting.length + away.length === 1 ? 'is' : 'are'} on the ground.`);
    lines.push('The screen does not show the level.');
    return { hive, others, ground, tree, waiting, away, pairings: null, zoombinis: [...waiting, ...away, ...inTree], state, lines, link: null };
  }
  const lured = hiveSeats.length - hive.filter(Boolean).length;
  state.lured = lured;
  lines.push(`${count(hive.filter(Boolean).length, 'Fleen is', 'Fleens are')} on the beehive branch and ${others.filter(Boolean).length} on the other branches.`
    + (lured ? ` So ${lured === 1 ? 'one of the beehive’s three is' : `${lured} of the beehive’s three are`} lured off.` : ''));
  hive.forEach((f, k) => {
    if (f) lines.push(`Beehive Fleen ${k + 1}, counted from the left, has ${whole(f.traits) ? zbFleensWords(f.traits).toLowerCase() : 'parts the page could not read whole'}.`);
  });
  lines.push(`${count(waiting.length, 'Zoombini waits', 'Zoombinis wait')}, ${inTree.length === 1 ? 'one is' : `${inTree.length || 'none'} are`} on the tree’s branch`
    + ` and ${onGround.length === 1 ? 'one Fleen stands' : `${onGround.length || 'no'} Fleens stand`} under the tree.`
    + (away.length ? ` ${count(away.length, 'Zoombini is', 'Zoombinis are')} away from the others, in the player’s hand or on the run.` : ''));
  if (inTree.length) lines.push('The branch has room for six. A Zoombini sent after the sixth sends the one farthest from the trunk back to Shelter Rock.');
  const moving = fleens !== zoombinis.length;
  if (moving) lines.push(`The page read ${zoombinis.length} Zoombinis and ${fleens} standing Fleens. Each Zoombini has a Fleen, so some are hidden or on the move, and the page leaves a Fleen on the move unread.`);
  const unread = [...onBranches, ...onGround].filter(f => !whole(f.traits)).length;
  if (unread) lines.push(`${count(unread, 'Fleen has', 'Fleens have')} a part hidden behind another Fleen, which the page leaves unread.`);

  /* the pairs at the tree, and the Zoombinis and Fleens still to pair */
  const pairs = [];
  for (let k = 0; k < Math.min(tree.length, ground.length); k++) {
    if (!tree[k] || !ground[k]) continue;
    tree[k].fleen = ground[k].traits;
    if (whole(tree[k].traits) && whole(ground[k].traits)) pairs.push([tree[k].traits, ground[k].traits]);
  }
  const settled = !moving && unsent.length === onBranches.length && tree.length === ground.length && inTree.length === onGround.length
    && unsent.every(z => whole(z.traits));
  const pairings = pairs.length || (settled && unsent.length) ? zbShotFleensPairings(pairs, settled ? unsent.map(z => z.traits) : null, settled ? onBranches.map(f => f.traits) : null) : null;
  let link = null;
  if (pairings) {
    state.pairings = pairings.length;
    const unmoved = pairings.some(p => !p.slots[0]), mixed = pairings.some(p => p.slots[0]);
    state.levels = [...(unmoved ? [1, 2] : []), ...(mixed ? [3, 4] : [])];
    const basis = settled ? 'the Fleens on the branches being the Fleens of the Zoombinis not sent' : `the ${pairs.length === 1 ? 'pair' : `${pairs.length} pairs`} at the tree`;
    if (!pairings.length) lines.push(`No pairing of traits and values fits ${basis}, so the page may have misread a part.`);
    else {
      lines.push(`The screen does not show the level. ${count(pairings.length, 'pairing', 'pairings')} of traits and values ${pairings.length === 1 ? 'fits' : 'fit'} ${basis}.`
        + (unmoved && mixed ? ' In some each trait stays the same trait, as levels 1 and 2 deal, and in some the traits are mixed, as levels 3 and 4 deal.'
          : unmoved ? ' Each trait stays the same trait, as levels 1 and 2 deal.' : ' The traits are mixed, as levels 3 and 4 deal.'));
      const p0 = pairings[0];
      ZB_SHOT_TRAITS.forEach((k, i) => {
        if (!pairings.every(p => p.kinds[i] === p0.kinds[i])) return;
        const to = p0.kinds[i], verb = k === 'eyes' || k === 'feet' ? 'go' : 'goes';
        if (!pairings.every(p => p.rotations[i] === p0.rotations[i])) { lines.push(`Zoombini ${k} ${verb} with Fleen ${to}, in a rotation the screen does not settle.`); return; }
        const each = [1, 2, 3, 4, 5].map(v => `${zbTraitWith(k, v)} with ${ZB_FLEENS_TRAIT_WITH[to][(p0.rotations[i] + v - 2) % 5]}`);
        lines.push(`Zoombini ${k} ${verb} with Fleen ${to}, pairing ${zbWordsOr(each, 'and')}.`);
      });
      /* the Zoombinis that go with each beehive Fleen under every pairing */
      if (settled) {
        state.beehive = hive.map(() => null);
        hive.forEach((f, seat) => {
          if (!f || !whole(f.traits)) return;
          const look = zbFleensLook(f.traits);
          const fits = unsent.filter(z => pairings.every(p => zbFleensLook(zbFleensOf(z.traits, p.rotations, p.kinds)) === look));
          const some = unsent.filter(z => pairings.some(p => zbFleensLook(zbFleensOf(z.traits, p.rotations, p.kinds)) === look));
          if (!fits.length || fits.length !== some.length) { lines.push(`The pairings give different Zoombinis for beehive Fleen ${seat + 1}.`); return; }
          state.beehive[seat] = code(fits[0]);
          for (const z of fits) { z.fleen = f.traits; z.hive = seat; z.where += `, with ${fits.length === 1 ? 'its Fleen' : 'a Fleen like its Fleen'} on the beehive branch`; }
          const at = fits.map(z => `at (${z.x}, ${z.y})`);
          lines.push(fits.length === 1 ? `Beehive Fleen ${seat + 1} goes with the Zoombini ${at[0]}, which has ${zbZoombiniWords(fits[0].traits)}.`
            : `Beehive Fleen ${seat + 1} goes with one of the ${fits.length} Zoombinis alike ${zbWordsOr(at, 'and')}, which have ${zbZoombiniWords(fits[0].traits)}. Only one of them lures it.`);
        });
      }
      const band = [...waiting, ...away, ...inTree];
      const targets = state.beehive ? hive.map((f, seat) => band.findIndex(z => z.hive === seat) + 1) : [];
      if (pairings.length === 1 && targets.length === ZB_FLEENS_HIVE && targets.every(t => t > 0) && new Set(targets).size === ZB_FLEENS_HIVE && band.every(z => whole(z.traits))) {
        const level = p0.slots[0] ? 3 : 1, set = { hive: targets.slice().sort((a, b) => a - b) };
        if (level >= 3) ZB_SHOT_TRAITS.forEach((k, i) => { set[`to_${k}`] = p0.kinds[i]; });
        ZB_SHOT_TRAITS.forEach((k, i) => { set[`turn_${k}`] = p0.rotations[i]; });
        link = { hash: `solve=FLEENS${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(band.map(z => z.traits))}&set=${encodeURIComponent(JSON.stringify(set))}`,
          text: `Take Fleens! apart with this pairing, as level ${level} deals it` };
      }
    }
  } else lines.push('The screen does not show the level, and the page pairs traits only when it reads every Zoombini and finds a Fleen for each, or reads a pair at the tree.');
  return { hive, others, ground, tree, waiting, away, pairings, zoombinis: [...waiting, ...away, ...inTree], state, lines, link };
}

ZB_SHOT_PUZZLES.FLEENS = zbShotFleens;
