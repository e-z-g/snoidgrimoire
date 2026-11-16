/* zb-shot-caves.js -- The Lion's Lair read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-caves.js.

   The reader gives what the screen shows of the lair: which Zoombini
   stands on which stone of the path, which wait on the ledge, the symbols
   on the wall by the lion, the pegs left on the gate's chain, and whether
   the gate has come down. The wall gives the level, the level and the
   pegs give the mistakes made, and all of it gives the orders the lion
   could still be keeping (zbShotCavesOrders).

   HOW THE GAME DRAWS IT
   The picture, tBMP 5000, has the path as twenty open pits. Each stone is
   a sprite of tBMP 9000 over its pit, drawn by SCRB 9000 + the seat minus
   1. The first four pits are under one sprite of tBMP 9025. A stone that
   sends a Zoombini away opens, so its pit shows while the Zoombini is on
   its way to another stone.
   A Zoombini on the path stands with its origin at its seat's place
   (ZB_CAVES_SEAT_PLACES), and the base reader finds it there.
   A symbol is a sprite of tBMP 10000, 5 x the trait's number from 0 + the
   value. Its place on the wall is ZB_SHOT_CAVES_CLUE_X and
   ZB_SHOT_CAVES_CLUE_Y, with the sprite centered across and REGS 201's
   entry for the place subtracted from y. At level 1 the game hides each
   symbol in turn for a moment when the puzzle opens.
   The pegs are shape 25 of tBMP 6000, one for each mistake still
   allowed. SCRB 6004's first tick has all seven places, the lowest
   first, and with each mistake the lowest peg left falls. At the last
   mistake the gate, shape 36, comes down over the ledge to (-10, 0). When
   the player chooses to go on, the lion turns its head (shape 19 at
   (513, -3)) and lifts its paw.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_caves.cpp and .h:
   loadFeatures (the stones' scripts and the sheets), renderEntranceGlyphs
   with kRuleGlyphScreenX and kRuleGlyphScreenY (the symbols),
   initDifficultyParams and loadGlyphPanelFrame (the pegs' script is 6006,
   6005, 6004 or 6003 at levels 1 to 4, plus the mistakes made),
   kSeatEntrancePositions (the seats) and _waitingAreaRects (the ledge).
   The scripts' ticks are read from the archive (SCRB 6002, 6004, 6010 and
   9000 to 9019). Screenshots taken in the game at levels 1 to 4 match
   each piece pixel for pixel.
*/

/* The symbols' places on the wall, 1-5 the top row and 6-10 the row below
   (kRuleGlyphScreenX and kRuleGlyphScreenY in puzzle_caves.h). */
const ZB_SHOT_CAVES_CLUE_X = [0, 326, 348, 375, 397, 423, 324, 347, 373, 395, 422];
const ZB_SHOT_CAVES_CLUE_Y = [0, 36, 39, 42, 44, 46, 77, 80, 83, 86, 90];
/* The ledge where the band waits, as left, top, right and bottom
   (_waitingAreaRects in puzzle_caves.h). */
const ZB_SHOT_CAVES_LEDGE = [[0, 0, 195, 130], [0, 128, 175, 147], [0, 146, 155, 165], [0, 164, 135, 191], [0, 190, 120, 214],
  [0, 213, 100, 236], [0, 235, 87, 250], [0, 249, 67, 269], [0, 268, 40, 289], [0, 288, 27, 357], [0, 356, 36, 394]];
/* The sheets and shapes of the pieces: the pegs, the gate and the lion's
   turned head are in tBMP 6000 (SCRB 6004, 6010 and 6002). */
const ZB_SHOT_CAVES_SHEET = 6000, ZB_SHOT_CAVES_PEG = 25, ZB_SHOT_CAVES_GATE = 36, ZB_SHOT_CAVES_HEAD = 19;
const ZB_SHOT_CAVES_NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen'];

/* A Zoombini's traits as four digits, with ? for a trait not read. */
const zbShotCavesCode = t => ZB_SHOT_TRAITS.map(k => t[k] ?? '?').join('');

/* The first record of `shape` in the last tick of SCRB `id` that draws it,
   or null. */
function zbShotCavesRecord(arc, id, shape) {
  const ticks = zbFeatureTicks(parseScript(arc.get('SCRB', id), 'SCRB'));
  for (let t = ticks.length - 1; t >= 0; t--) {
    const r = ticks[t].records.find(q => q.shape === shape);
    if (r) return r;
  }
  return null;
}

/* How a sprite with its top left at (x, y) looks in the frame: 'there'
   where at least 80% of what shows of it fits, 'bare' where the place's
   picture fits as well under it, and null where neither does or less than
   `least` of it shows. A piece in the middle of a move, or one under the
   pointer or a Zoombini, reads null. */
function zbShotCavesLook(env, picture, skip, sprite, x, y, least = 0.25) {
  const fit = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite, x, y }]), 0, 0, skip);
  if (fit.shown < least) return null;
  if (fit.fit >= 0.8) return 'there';
  /* the picture under the sprite's pixels, made into a sprite */
  const under = { width: sprite.width, height: sprite.height, pixels: new Uint8Array(sprite.width * sprite.height) };
  for (let v = 0; v < sprite.height; v++) {
    for (let u = 0; u < sprite.width; u++) {
      const X = x + u, Y = y + v;
      if (sprite.pixels[v * sprite.width + u] && X >= 0 && Y >= 0 && X < ZB_SHOT_W && Y < ZB_SHOT_H) under.pixels[v * sprite.width + u] = picture[Y * ZB_SHOT_W + X];
    }
  }
  const bare = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite: under, x, y }]), 0, 0, skip);
  return bare.fit >= 0.8 ? 'bare' : null;
}

/* The wall: for each of its ten places the symbol it shows. Returns
   { traits, top, below }: `top` and `below` have five entries each, a
   trait's value 1-5, 0 for a place that shows the bare wall, and null for
   one not read. `traits` has each row's trait, null for a row that shows
   no symbol. A symbol is read where it fits 80% of what shows of it and
   no other symbol fits within a tenth as well. The five noses differ only
   in the color of a few pixels, and a wrong one fits 78%. */
function zbShotCavesWall(env, picture, skip) {
  const sprites = decodeBitmapResource(env.arc.get('tBMP', 10000)).frames, adjust = env.arc.get('REGS', 201);
  const up = slot => { const v = (adjust[2 * slot] << 8) | adjust[2 * slot + 1]; return v > 32767 ? v - 65536 : v; };
  const shapes = new Array(11).fill(null);
  for (let slot = 1; slot <= 10; slot++) {
    let best = null, next = 0, shown = 0;
    sprites.forEach((sprite, i) => {
      const fit = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite, x: ZB_SHOT_CAVES_CLUE_X[slot] - (sprite.width >> 1), y: ZB_SHOT_CAVES_CLUE_Y[slot] - up(slot) }]), 0, 0, skip);
      shown = Math.max(shown, fit.shown);
      if (fit.shown < 0.6) return;
      if (!best || fit.fit > best.fit) { next = best ? best.fit : 0; best = { shape: i + 1, fit: fit.fit }; }
      else if (fit.fit > next) next = fit.fit;
    });
    if (best && best.fit >= 0.8 && best.fit - next >= 0.1) { shapes[slot] = best.shape; continue; }
    /* the bare wall, where the widest symbol would be */
    const box = { width: 24, height: 18, pixels: new Uint8Array(24 * 18).fill(1) };
    if (shown >= 0.6 && (!best || best.fit < 0.6)
      && zbShotCavesLook(env, picture, skip, box, ZB_SHOT_CAVES_CLUE_X[slot] - 12, ZB_SHOT_CAVES_CLUE_Y[slot] - up(slot), 0.6) === 'bare') shapes[slot] = 0;
  }
  const row = from => [0, 1, 2, 3, 4].map(k => (shapes[from + k] ? (shapes[from + k] - 1) % 5 + 1 : shapes[from + k]));
  const trait = from => {
    const kinds = new Set([0, 1, 2, 3, 4].filter(k => shapes[from + k]).map(k => ZB_TRAIT_KINDS[Math.floor((shapes[from + k] - 1) / 5)]));
    return kinds.size === 1 ? [...kinds][0] : null;
  };
  return { traits: [trait(1), trait(6)], top: row(1), below: row(6) };
}

/* The level a wall shows, 1-4, or null where its symbols fit no level or
   too few of its places are read. Level 1 shows the top row in full, or
   four of it while the game hides one. Level 2 shows two places of the
   top row, level 3 two of each row and level 4 none. */
function zbShotCavesLevel(wall) {
  const count = row => row.filter(v => v > 0).length, unread = row => row.filter(v => v == null).length;
  const t = count(wall.top), b = count(wall.below), tu = unread(wall.top), bu = unread(wall.below);
  if (t >= 3 && !b) return bu ? null : 1;
  if (t > 2 || b > 2) return null;
  if (b) return t + tu >= 2 && b + bu >= 2 ? 3 : null;
  if (tu || bu) return null;
  return t === 2 ? 2 : t === 0 ? 4 : null;
}

/* The orders the lion could be keeping: every trait and order of its
   values the program deals at `level` (zbCavesPattern) that shows `wall`
   and gives each Zoombini of `onPath`, [{ z, seat }], a run of stones with
   its seat in it. `band` is every Zoombini, as traits. A group's stones
   start where zbCavesSeats puts the first trait's value, and inside the
   group a Zoombini's run starts after those whose second trait comes
   earlier in its order. Returns { fitting, all, ways, rule }: `fitting`
   the number of them, `all` the number the level deals, `ways` how many
   different ways they send the band to the path (zbCavesSeats), null
   where more than 2,000 fit, and `rule` one of them where `ways` is 1,
   null otherwise. */
function zbShotCavesOrders(level, band, wall, onPath) {
  const two = level >= 3, most = 2000;
  const fits = (order, row) => row.every((v, k) => !v || order[k] === v);
  const rules = [];
  let fitting = 0;
  for (const primary of ZB_TRAIT_KINDS) {
    if (wall.traits[0] && wall.traits[0] !== primary) continue;
    const seconds = two ? ZB_TRAIT_KINDS.filter(k => k !== primary && (!wall.traits[1] || wall.traits[1] === k)) : [null];
    /* the band counted by both traits' values, for each second trait */
    const counts = seconds.map(secondary => {
      const count = new Array(36).fill(0);
      if (secondary) for (const z of band) count[6 * z[primary] + z[secondary]]++;
      return count;
    });
    for (const first of ZB_CAVES_PERMS) {
      if (!fits(first, wall.top)) continue;
      const seatP = zbCavesSeats(band, { primary, secondary: primary, orders: [first, first] }, false).seatP;
      if (onPath.some(p => seatP[p.seat] !== p.z[primary])) continue;
      const starts = onPath.map(p => seatP.indexOf(p.z[primary], 1));
      seconds.forEach((secondary, si) => {
        for (const second of two ? ZB_CAVES_PERMS : [first]) {
          if (two) {
            if (!fits(second, wall.below)) continue;
            const count = counts[si];
            const inRun = onPath.every((p, i) => {
              let from = starts[i];
              for (const v of second) {
                if (v === p.z[secondary]) break;
                from += count[6 * p.z[primary] + v];
              }
              return p.seat >= from && p.seat < from + count[6 * p.z[primary] + p.z[secondary]];
            });
            if (!inRun) continue;
          }
          fitting++;
          if (rules.length <= most) rules.push({ primary, secondary: secondary || ZB_TRAIT_KINDS.find(k => k !== primary), orders: [first, second] });
        }
      });
    }
  }
  const all = two ? 4 * 120 * 3 * 120 : 4 * 120;
  if (fitting > most) return { fitting, all, ways: null, rule: null };
  /* the way a rule sends the band: for each stone, the first of the band that belongs on it */
  const signs = new Set();
  for (const r of rules) {
    const seats = zbCavesSeats(band, r, two);
    let sign = '';
    for (let seat = 21 - band.length; seat <= ZB_CAVES_SEATS; seat++) {
      sign += String.fromCharCode(65 + band.findIndex(z => z[r.primary] === seats.seatP[seat] && (!two || z[r.secondary] === seats.seatS[seat])));
    }
    signs.add(sign);
  }
  return { fitting, all, ways: signs.size, rule: signs.size === 1 ? rules[0] : null };
}

/* The Lion's Lair. A Zoombini whose origin is within 3 pixels of a seat's
   place stands on that stone, one on the ledge waits, and any other is in
   the player's hand or on its way. With the gate down the base reader
   misses Zoombinis behind its bars, so a screenshot that copies pixels is
   read again with the gate's pixels left out. Returns { zoombinis, state,
   lines, link } as zb-shot.js gives for a place's reader. `state` is
   { level, wallTraits, wallTop, wallBelow, pegs, allowed, mistakes, gate,
   leaving, stones, waiting, moving, open, orders, ways }: `stones` has
   the Zoombini on each of the sixteen stones, as four digits, or null;
   `waiting` and `moving` the others, in the order of the page's table;
   `open` the stones whose pit shows; `pegs`, `mistakes` and `level` are
   null where the screenshot does not give them; `orders` and `ways` are
   zbShotCavesOrders's `fitting` and `ways`, null where the level or a
   trait is not read. */
function zbShotCaves(frame, zoombinis) {
  const env = zbShotEnv(frame), arc = frame.arc, picture = frame.pixels;
  const sheet = decodeBitmapResource(arc.get('tBMP', ZB_SHOT_CAVES_SHEET)).frames;
  const none = new Uint8Array(ZB_SHOT_W * ZB_SHOT_H);

  /* the gate, and behind it the Zoombinis left on the ledge */
  const gateSprite = sheet[ZB_SHOT_CAVES_GATE - 1], gateAt = zbShotCavesRecord(arc, 6010, ZB_SHOT_CAVES_GATE);
  const gateFit = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite: gateSprite, x: gateAt.x, y: gateAt.y }]), 0, 0, none);
  const gateDown = gateFit.shown >= 0.3 && gateFit.fit >= 0.6;
  if (gateDown && !env.smoothed && frame.keys && frame.palKeys) {
    const keys = Int32Array.from(frame.keys);
    for (let v = 0; v < gateSprite.height; v++) {
      for (let u = 0; u < gateSprite.width; u++) {
        const p = gateSprite.pixels[v * gateSprite.width + u], X = gateAt.x + u, Y = gateAt.y + v;
        if (p && X >= 0 && Y >= 0 && X < ZB_SHOT_W && Y < ZB_SHOT_H && keys[Y * ZB_SHOT_W + X] === frame.palKeys[p]) keys[Y * ZB_SHOT_W + X] = -1;
      }
    }
    const parts = zbSnoidSheet(frame.archives.get('ZOOMBINI')), fg = zbShotForeground(keys, picture, frame.palKeys);
    const again = zbShotGroup(zbShotBestParts(zbShotFindParts(keys, fg, parts, frame.palKeys), keys, parts, frame.palKeys));
    zbShotInferHidden(keys, fg, again, parts, frame.palKeys);
    const read = z => ZB_SHOT_TRAITS.filter(k => z.traits[k] != null).length;
    const near = (a, b) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 3;
    /* each Zoombini as whichever reading has more of its traits */
    zoombinis = [...zoombinis.map(z => { const a = again.find(q => near(q, z)); return a && read(a) > read(z) ? a : z; }),
      ...again.filter(a => !zoombinis.some(z => near(a, z)))];
    zoombinis.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  const skip = zbShotCovered(zoombinis);

  /* the Zoombinis: on a stone, on the ledge, or neither */
  const seats = ZB_CAVES_SEAT_PLACES.flat();
  const stones = new Array(ZB_CAVES_SEATS - ZB_CAVES_HIDDEN).fill(null), onPath = [], waiting = [], moving = [];
  for (const z of zoombinis) {
    const seat = zbShotPlaceIn(seats, z.x, z.y) + 1;
    if (seat > ZB_CAVES_HIDDEN && !stones[zbCavesStone(seat) - 1]) {
      stones[zbCavesStone(seat) - 1] = z;
      z.where = `on stone ${zbCavesStone(seat)}`;
      onPath.push({ z, seat });
    } else if (ZB_SHOT_CAVES_LEDGE.some(([l, t, r, b]) => z.x >= l && z.x < r && z.y >= t && z.y < b)) {
      z.where = gateDown ? 'left behind the gate' : 'waiting on the ledge';
      waiting.push(z);
    } else {
      z.where = 'in the player’s hand or on its way';
      moving.push(z);
    }
  }
  onPath.sort((a, b) => a.seat - b.seat);
  const band = [...onPath.map(p => p.z), ...waiting, ...moving];

  /* the stones: a pit that shows is a stone that has opened */
  const stoneSheet = decodeBitmapResource(arc.get('tBMP', 9000)).frames, open = [];
  let stonesUnread = 0;
  for (let seat = ZB_CAVES_HIDDEN + 1; seat <= ZB_CAVES_SEATS; seat++) {
    const r = zbFeatureTicks(parseScript(arc.get('SCRB', 9000 + seat - 1), 'SCRB'))[0].records[0];
    const fit = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite: stoneSheet[r.shape - 1], x: r.x, y: r.y }]), 0, 0, skip);
    /* a Zoombini's feet cover much of the stone it stands on */
    if (stones[zbCavesStone(seat) - 1] || fit.shown < 0.25) continue;
    if (fit.fit < 0.3) open.push(zbCavesStone(seat));
    else if (fit.fit < 0.8 && fit.shown >= 0.5) stonesUnread++;
  }

  /* the wall and the level */
  const wall = zbShotCavesWall(env, picture, skip), level = zbShotCavesLevel(wall);

  /* the pegs: those left are the upper ones, with no gap */
  const pegAt = zbFeatureTicks(parseScript(arc.get('SCRB', 6004), 'SCRB'))[0].records.filter(r => r.shape === ZB_SHOT_CAVES_PEG);
  const looks = pegAt.map(r => {
    const fit = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite: sheet[ZB_SHOT_CAVES_PEG - 1], x: r.x, y: r.y }]), 0, 0, skip);
    return fit.shown < 0.6 ? null : fit.fit >= 0.8 ? 'there' : fit.fit < 0.3 ? 'gone' : null;
  });
  let pegs = null;
  if (gateDown) pegs = 0;
  else if (looks.every(l => l)) {
    const first = looks.indexOf('there');
    if (first < 0) pegs = 0;
    else if (looks.slice(first).every(l => l === 'there')) pegs = looks.length - first;
  }
  /* with the last peg gone the gate comes down, over a second or so */
  const gateFalling = pegs === 0 && !gateDown;
  const allowed = level ? ZB_CAVES_MISTAKES[level - 1] : null;
  const mistakes = level && pegs != null && pegs <= allowed ? allowed - pegs : null;

  /* the lion's head, turned to watch the band go */
  const headAt = zbShotCavesRecord(arc, 6002, ZB_SHOT_CAVES_HEAD);
  const leaving = zbShotCavesLook(env, picture, skip, sheet[ZB_SHOT_CAVES_HEAD - 1], headAt.x, headAt.y, 0.5) === 'there';

  /* the orders that fit */
  const complete = band.length > 0 && band.length <= 16 && band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  const wallRead = [...wall.top, ...wall.below].every(v => v != null);
  const settled = !open.length && !stonesUnread && !moving.length && !leaving && !gateFalling && (!gateDown || band.length === 16);
  const orders = level && complete && wallRead && settled
    ? zbShotCavesOrders(level, band.map(z => z.traits), wall, onPath.map(p => ({ z: p.z.traits, seat: p.seat }))) : null;

  const state = {
    level, wallTraits: wall.traits, wallTop: wall.top, wallBelow: wall.below,
    pegs, allowed, mistakes, gate: gateDown ? 'down' : 'up', leaving,
    stones: stones.map(z => (z ? zbShotCavesCode(z.traits) : null)),
    waiting: waiting.map(z => zbShotCavesCode(z.traits)), moving: moving.map(z => zbShotCavesCode(z.traits)),
    open, orders: orders ? orders.fitting : null, ways: orders ? orders.ways : null,
  };

  /* ---- the sentences ---- */
  const lines = [], count = (n, one, many) => `${n <= 16 ? ZB_SHOT_CAVES_NUMBERS[n] : n} ${n === 1 ? one : many}`;
  const cap = t => t[0].toUpperCase() + t.slice(1);
  const symbols = (row, kind) => [1, 2, 3, 4, 5].filter(k => row[k - 1] > 0).map(k => `${zbTraitWith(kind, row[k - 1])} ${zbCavesOrdinal(k)}`);
  const top = wall.traits[0] ? symbols(wall.top, wall.traits[0]) : [], below = wall.traits[1] ? symbols(wall.below, wall.traits[1]) : [];
  if (!top.length && !below.length) lines.push(wallRead ? 'The wall shows no symbols, as at level 4.' : 'The page could not read the wall.');
  else {
    lines.push(`The wall’s top row shows ${top.length ? zbWordsOr(top, 'and') : 'no symbols'}${below.length ? `, and the row below shows ${zbWordsOr(below, 'and')}` : ''}.`
      + (level === 1 && top.length === 5 ? ' That is the whole order, as level 1 gives it.'
        : level === 1 ? ' Level 1 shows all five, and the game hides each in turn for a moment when the puzzle opens. The one hidden here is the value left over.'
          : level ? ` The other places are empty, as at level ${level}.` : ''));
    if (!wallRead) lines.push('Something covers part of the wall, so the page could not read every place.');
    else if (!level) lines.push('No level shows these symbols, so the page gives no level.');
  }
  if (gateFalling) lines.push('The last peg has gone from the gate’s chain, and the gate is coming down.');
  else if (gateDown) {
    lines.push(`The gate has come down, so the last mistake allowed was made${level ? `, the ${['fourth', 'fifth', 'sixth', 'seventh'][level - 1]} at this level` : ''}. No one else can be placed.`);
  } else if (pegs == null) lines.push('A peg on the gate’s chain is falling or hidden, so the page could not count the pegs.');
  else if (mistakes != null) {
    lines.push(`The gate’s chain has ${count(pegs, 'peg', 'pegs')} left. Level ${level} starts with ${ZB_SHOT_CAVES_NUMBERS[allowed]}, so ${mistakes ? count(mistakes, 'mistake was', 'mistakes were') : 'no mistakes were'} made.`);
  } else {
    lines.push(`The gate’s chain has ${count(pegs, 'peg', 'pegs')} left, one for each mistake still allowed.`
      + (level ? ` Level ${level} starts with ${ZB_SHOT_CAVES_NUMBERS[allowed]}, so the pegs do not match the wall.` : ''));
  }
  const places = onPath.map(p => String(zbCavesStone(p.seat)));
  if (band.length) {
    const parts = [];
    if (onPath.length) parts.push(`${count(onPath.length, 'Zoombini stands', 'Zoombinis stand')} on the path, on ${onPath.length === 1 ? 'stone' : 'stones'} ${zbWordsOr(places, 'and')}`);
    if (waiting.length) parts.push(`${count(waiting.length, 'Zoombini', 'Zoombinis')} ${gateDown ? (waiting.length === 1 ? 'is' : 'are') + ' left behind the gate' : (waiting.length === 1 ? 'waits' : 'wait') + ' on the ledge'}`);
    if (moving.length) parts.push(`${count(moving.length, 'Zoombini is', 'Zoombinis are')} in the player’s hand or on the way to a stone`);
    lines.push(cap(parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : parts[0]) + '.');
  } else lines.push('The page found no Zoombinis.');
  if (gateDown && band.length < 16) lines.push('The gate’s bars cover the Zoombinis behind it, and the page may have missed some of them.');
  if (open.length) lines.push(`${cap(open.length > 1 ? `stones ${zbWordsOr(open.map(String), 'and')} are` : `stone ${open[0]} is`)} open. A Zoombini put on a wrong stone falls through it and comes up at a stone of its group.`);
  else if (stonesUnread) lines.push('A stone is opening or closing.');
  if (leaving) lines.push('The lion has turned its head, so the Zoombinis on the path are leaving.');

  let link = null;
  if (orders) {
    const rule = orders.rule, n = band.length, traits = band.map(z => z.traits);
    const what = level >= 3 ? 'pairs of orders' : 'orders';
    if (!orders.fitting) lines.push('No order the program deals fits the wall and the Zoombinis on the path. A Zoombini may be misread, or part of the band may be out of the screenshot.');
    else {
      const total = orders.all.toLocaleString('en-US');
      lines.push((orders.fitting === orders.all ? `Nothing on the screen rules out any of the ${total} ${what} the program deals at level ${level}.`
        : `${orders.fitting.toLocaleString('en-US')} of the ${total} ${what} the program deals at level ${level} ${orders.fitting === 1 ? 'fits' : 'fit'} the wall${onPath.length ? ' and the Zoombinis on the path' : ''}.`)
        + (orders.ways == null ? '' : orders.ways === 1 ? ` ${orders.fitting === 1 ? 'It sends' : 'They all send'} this band of ${n} to the same stones.`
          : ` They send this band of ${n} to the path in ${orders.ways.toLocaleString('en-US')} different ways.`));
    }
    if (rule) {
      const runs = zbCavesRuns(traits, zbCavesState(level, traits, rule, new Array(11).fill(0)));
      lines.push(runs.map(r => cap(`${zbCavesStones(zbCavesStone(r.from), zbCavesStone(r.to))} ${r.to === r.from ? 'is for the one' : `are for the ${r.to - r.from + 1}`} with `
        + zbWordsOr([zbTraitWith(rule.primary, r.p), ...(level >= 3 ? [zbTraitWith(rule.secondary, r.s)] : [])], 'and'))).join('. ') + '.');
    }
    const shown = row => [1, 2, 3, 4, 5].filter(k => row[k - 1] > 0);
    const base = `solve=CAVES${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(traits)}`;
    if (rule) {
      /* the form's values (zbCavesForm), with a place the wall leaves empty as the rule has it */
      const set = { primary: rule.primary, order: rule.orders[0] };
      if (level === 2 || level === 3) set.shown = shown(wall.top);
      if (level >= 3) { set.secondary = rule.secondary; set.order2 = rule.orders[1]; }
      if (level === 3) set.shown2 = shown(wall.below);
      link = { hash: `${base}&set=${encodeURIComponent(JSON.stringify(set))}`, text: 'Take the Lion’s Lair apart with this order' };
    } else if (orders.fitting) link = { hash: base, text: `Take the Lion’s Lair apart for this band at level ${level}` };
  } else if (level && !complete && band.length) lines.push('A trait is not read, so the page does not count the orders that fit.');
  else if (level && gateDown && !gateFalling && !open.length && !moving.length && !leaving) lines.push('The page may have missed Zoombinis behind the gate, so it does not count the orders that fit.');
  else if (level && !settled) lines.push('The screenshot shows a move under way, so the page does not count the orders that fit.');

  return { zoombinis: band, state, lines, link };
}

ZB_SHOT_PUZZLES.CAVES = zbShotCaves;
