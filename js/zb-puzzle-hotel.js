/* zb-puzzle-hotel.js -- Hotel Dimensia: rooms in five tree trunks, where
   only Zoombinis alike in the traits that matter tonight may share one.
   =========================================================================
   Needs zb-puzzle.js.

   The band is given rooms one Zoombini at a time. The rooms stand in five
   tree trunks, five floors to a trunk, and at level 4 five doors to a
   floor. Hidden is which traits matter: at level 1 one, and each of the
   five rooms (one to a trunk) takes Zoombinis alike in it; at levels 2 and
   3 two, one deciding the floor and the other the trunk, so each of the 25
   rooms takes one pair of values; at level 4 three, the third deciding the
   door, 125 rooms. Nothing says which value goes where: the first Zoombini
   into a floor, trunk or door settles its value, and after that a room
   takes a Zoombini only if it has the values already settled there and,
   where one is not yet settled, a value not settled anywhere else. Every
   Zoombini sent to a room that will not take it uses a chance, and the
   hotel grows darker.

   The traits are drawn three at a time, each any of the four, until they
   suit the band. At levels 1 and 2 the first two must differ, and if the
   band shows all five values of at least two traits, each of the two
   must show at least four; level 3 is the same with four values in place
   of five, so if the band shows at least four values of at least two
   traits, each of the two must. At level 4 all three must differ,
   whatever the band. At level 1 only the first is used, though the second
   is drawn and tested with it.

   At level 3 some rooms are boarded up. The program first arranges the
   band at random, a different value of the first trait on each floor and
   of the second in each trunk, and boards up between 1 and 8 of the rooms
   that arrangement leaves empty (how many at random, at most as many as
   are empty); then it forgets the arrangement. So at least that one fits
   round the boards, but the player may find another.

   Taken apart (the page's workbench): the form is the traits (and at
   level 3 the boarded rooms, any 1 to 8). Known, an arrangement (which
   value each floor, trunk or door takes) gives each Zoombini its room, so
   all go in, in P(5, k) ways a trait for the k values the band shows,
   except at level 3, where only the arrangements that keep everyone out
   of the boarded rooms do; with boards the program did not deal, there
   may be none, and then the most is the best any arrangement does.
   Unknown, a move gives a Zoombini a room and it is let in or turned
   away (zbHotelStrategy). At levels 1, 2 and 4 the player is always sure
   of the whole band; at level 3 the player must settle floors and trunks
   before knowing which traits they go by, and may settle them so that a
   Zoombini's room is boarded, so with a large band fewer are sure.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_hotel.cpp and .h
   (initStates, computeTraitVariantCounts, generateRoomRules, endDrag,
   validate2TraitPlacement, validate3TraitPlacement, fillCellRow,
   setCellTraitsIn3Grids, debugGetChances), checked against the program's
   own code in ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z:
   - the page's setup is 0x41eb28: the counter's first step by level, 5, 2,
     4 and 2 of 12, then (at level 1, after the first visit) random(1, 3)
     for Ulla's greeting, the band loaded with an idle phase each
     (0x4523c2), and then the rules, 0x4206ee, which calls 0x421661 (the
     Mac program's COUNTBODYPARTS) for how many values of each trait the
     band shows. The rules are the first thing the deal decides, so deal()
     starts there;
   - 0x4206ee draws the three traits and tests them as ScummVM does, and at
     level 3 draws the arrangement, counts the band into it and boards up
     rooms in ScummVM's order (after each room random(0, 3), which picks
     the boards' look), then clears the grids at every level;
   - the judging is 0x420b40: the first Zoombini sets the counter to its
     first step and settles its room; after that level 1 compares the one
     trait inline, levels 2 and 3 call 0x421471 and fill with 0x421404,
     level 4 calls 0x421b89 and fills with 0x421edf, all as ScummVM has
     them. A wrong room moves the counter on a step (0x41febb), and at 12
     the hotel closes (0x41ff6f). A boarded room is not judged at all.
   The music stopping at each drop (the note at each level) is ScummVM's
   reading and was not looked for in the program.
   One difference: the program reads trait n (0-3) of a Zoombini as the
   nth byte of its traits, hair, eyes, nose, feet (0x420eb4 and on, the
   same bytes whose last picks a walk by feet at 0x422718), where ScummVM
   takes 0-3 as feet, nose, eyes, hair. From the same random numbers
   ScummVM therefore names another trait; deal() follows the program.
   utilities/puzzles/hotel.mjs holds the reading to ScummVM.
*/

/* The program's trait order for the hotel's draws: a Zoombini's traits as
   it keeps them (ScummVM's TraitAxis has them the other way round). */
const ZB_HOTEL_AXES = ['hair', 'eyes', 'nose', 'feet'];
/* The counter's first step at each level; the hotel closes at step 12. */
const ZB_HOTEL_FIRST_STEP = [5, 2, 4, 2];
const ZB_HOTEL_LAST_STEP = 12;
/* Most rooms boarded up at level 3. */
const ZB_HOTEL_MOST_BOARDED = 8;
/* ScummVM's reading, not checked in the program. */
const ZB_HOTEL_MIDI = 'The music stops when a Zoombini is dropped, a bug that ScummVM’s option “Fix ‘Hotel Dimensia’ MIDI background music halt bug” mends; it is on by default, and turned off the music stops as it did.';

/* How many of the five values of each trait (in ZB_HOTEL_AXES order) the
   band shows: the program's COUNTBODYPARTS. */
function zbHotelVariants(band) {
  return ZB_HOTEL_AXES.map(k => new Set(band.map(z => z[k])).size);
}

/* Whether three drawn traits (indices into ZB_HOTEL_AXES) suit the band at
   a level: generateRoomRules' test. */
function zbHotelAxesSuit(level, a, variants) {
  if (level <= 2) {
    const limited = variants.filter(v => v < 5).length;
    if (variants[a[0]] === 5 && variants[a[1]] === 5 && a[0] !== a[1]) return true;
    if (limited < 3) return a[0] !== a[1] && variants[a[0]] >= 4 && variants[a[1]] >= 4;
    return a[0] !== a[1];
  }
  if (level === 3) {
    const limited = variants.filter(v => v < 4).length;
    return a[0] !== a[1] && (limited >= 3 || (variants[a[0]] >= 4 && variants[a[1]] >= 4));
  }
  return a[0] !== a[1] && a[1] !== a[2] && a[0] !== a[2];
}

/* A room of the 25 in words: slot = 5 x trunk + floor, trunks counted
   from the left and floors from the top, as the program keeps them. */
function zbHotelRoomWords(slot) {
  return `trunk ${Math.floor(slot / 5) + 1}, floor ${slot % 5 + 1}`;
}

/* Where the traits that matter put a Zoombini, by level: at level 1 its
   trunk; at 2 and 3 its floor and trunk; at 4 its floor, trunk and door.
   A room is a position (0-4) for each: floors counted from the top,
   trunks and doors from the left. At level 3 a room is also a slot,
   5 x trunk + floor, as boards are kept. */
const ZB_HOTEL_PLACES = [['trunk'], ['floor', 'trunk'], ['floor', 'trunk'], ['floor', 'trunk', 'door']];

/* Every way of giving the values in `values` positions 0-4, one each,
   keeping those in `fixed` (a Map value -> position) where they are:
   [Map value -> position], at most 120. */
function zbHotelAxisMaps(values, fixed = new Map()) {
  const out = [], rest = values.filter(v => !fixed.has(v)), taken = new Set(fixed.values());
  const free = [0, 1, 2, 3, 4].filter(p => !taken.has(p)), m = new Map(fixed), used = new Set();
  const rec = k => {
    if (k === rest.length) { out.push(new Map(m)); return; }
    for (const p of free) if (!used.has(p)) { m.set(rest[k], p); used.add(p); rec(k + 1); used.delete(p); m.delete(rest[k]); }
  };
  if (rest.length <= free.length) rec(0);
  return out;
}
/* How far a way of placing values strays from the simplest, the values in
   their own order from the first position: the sum of each value's
   distance from its place in that order. */
function zbHotelStray(map, values) { return values.reduce((t, v, r) => t + Math.abs(map.get(v) - r), 0); }

/* The room of Zoombini z under maps (one Map a trait that matters), as
   positions, and whether it is boarded. */
function zbHotelRoomOf(z, traits, maps) { return traits.map((k, j) => maps[j].get(z[k])); }
function zbHotelBoarded(level, pos, boards) { return level === 3 && boards.includes(5 * pos[1] + pos[0]); }
function zbHotelRoomName(level, pos) {
  if (level === 1) return `the room in trunk ${pos[0] + 1}`;
  if (level === 4) return `door ${pos[2] + 1} on floor ${pos[0] + 1} of trunk ${pos[1] + 1}`;
  return `the room on floor ${pos[0] + 1} of trunk ${pos[1] + 1}`;
}

/* The hotel drawn: the five trunks, their floors (from the top) and at
   level 4 each floor's five doors, with the values that settle each if
   known (maps), boarded rooms, and the band in their rooms (place[i]
   positions or null); those without a room stand below. sent is { i,
   pos } for one on its way to a room. */
function zbHotelDiagram(band, { level, traits = null, maps = null, place, boards = [], sent = null, lost = false, caption = null, chances = null }) {
  const top = level === 4 ? 90 : 76, W = 800, items = [], tx = t => 64 + t * 148, tw = 136, fy = f => top + f * 66, fh = 60;
  const places = ZB_HOTEL_PLACES[level - 1];
  const sprite = (kind, value, x, y, extra = {}) => Object.assign({ t: 'trait', kind, value, x, y }, kind === 'hair' ? { scale: level === 4 ? 0.6 : 1 } : level === 4 ? { scale: 1 } : {}, extra);
  const valueAt = (j, p) => { if (!maps) return null; for (const [v, q] of maps[j]) if (q === p) return v; return null; };
  for (let t = 0; t < 5; t++) items.push({ t: 'rect', x: tx(t) - 4, y: top - 12, w: tw + 8, h: 5 * 66 + 6, r: 12, fill: 'wood' });
  /* Which of the band stand in each room. */
  const inRoom = new Map();
  band.forEach((_, i) => { const p = place[i]; if (p) { const k = p.join(); if (!inRoom.has(k)) inRoom.set(k, []); inRoom.get(k).push(i); } });
  const box = (x, y, w, h, pos) => {
    const k = pos.join(), boarded = zbHotelBoarded(level, pos, boards), hot = sent && sent.pos.join() === k;
    items.push({ t: 'rect', x, y, w, h, r: 4, fill: boarded ? 'stone' : 'panel', stroke: hot ? 'accent' : 'line', width: hot ? 3 : 1 });
    if (boarded) items.push({ t: 'line', x1: x + 4, y1: y + 4, x2: x + w - 4, y2: y + h - 4, stroke: 'bad', width: 3 }, { t: 'line', x1: x + w - 4, y1: y + 4, x2: x + 4, y2: y + h - 4, stroke: 'bad', width: 3 });
    const who = (inRoom.get(k) || []).slice();
    if (hot && !who.includes(sent.i)) who.push(sent.i);
    const sc = level === 4 ? 0.7 : 1, dx = Math.min(32 * sc, (w - 20 * sc) / Math.max(1, who.length - 1 || 1));
    who.forEach((i, m) => items.push({ t: 'zoombini', i, x: x + w / 2 + (m - (who.length - 1) / 2) * dx, y: y + h - 12 * sc, scale: sc === 1 ? undefined : sc }));
  };
  if (level === 1) {
    for (let t = 0; t < 5; t++) {
      box(tx(t), fy(3), tw, fh + 66, [t]);
      const v = valueAt(0, t);
      if (v) items.push(sprite(traits[0], v, tx(t) + tw / 2, fy(3) - 22));
    }
  } else {
    for (let t = 0; t < 5; t++) for (let f = 0; f < 5; f++) {
      if (level === 4) { for (let d = 0; d < 5; d++) box(tx(t) + d * (tw / 5), fy(f), tw / 5 - 2, fh, [f, t, d]); }
      else box(tx(t), fy(f), tw, fh, [f, t]);
    }
    for (let f = 0; f < 5; f++) { const v = valueAt(0, f); items.push(v ? sprite(traits[0], v, 30, fy(f) + fh / 2) : { t: 'text', x: 30, y: fy(f) + fh / 2 + 5, text: `${f + 1}`, anchor: 'middle', size: 12, fill: 'dim' }); }
    for (let t = 0; t < 5; t++) {
      const v = valueAt(1, t);
      if (level === 4) {
        if (v) items.push(sprite(traits[1], v, tx(t) + tw / 2, 40));
        else items.push({ t: 'text', x: tx(t) + tw / 2, y: 44, text: `trunk ${t + 1}`, anchor: 'middle', size: 12, fill: 'dim' });
        for (let d = 0; d < 5; d++) { const w = valueAt(2, d); if (w) items.push(sprite(traits[2], w, tx(t) + d * (tw / 5) + tw / 10, 66)); }
      } else if (v) items.push(sprite(traits[1], v, tx(t) + tw / 2, 50));
      else items.push({ t: 'text', x: tx(t) + tw / 2, y: 54, text: `trunk ${t + 1}`, anchor: 'middle', size: 12, fill: 'dim' });
    }
  }
  if (maps) items.push({ t: 'text', x: W - 12, y: 22, text: places.map((pl, j) => `${pl}s by ${traits[j]}`).join(', '), anchor: 'end', size: 13, fill: 'dim' });
  else if (chances != null) items.push({ t: 'text', x: W - 12, y: 22, text: `${chances} may still be turned away`, anchor: 'end', size: 13, fill: chances <= 2 ? 'warn' : 'dim' });
  const out = band.map((_, i) => i).filter(i => !place[i] && !(sent && sent.i === i)), H = out.length ? 520 + top - 76 : 424 + top - 76;
  items.push(...zbDiagramRows(out, (W - out.length * 34) / 2 + 17, 506 + top - 76, 16, 34, 52, lost ? { faded: true } : {}));
  const inside = place.filter(Boolean).length;
  items.push({ t: 'text', x: 12, y: 22, text: caption || `${inside} in rooms, ${band.length - inside} without`, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}

/* The hotel with the traits unknown. A hypothesis is which traits
   decide the rooms (one, two or three, in order); to the player only how
   each sorts the band matters (who is alike in it), so hypotheses that
   sort the band alike are one, counted. With knows 'program', the traits
   the program's test lets it draw for this band (at level 3, given the
   boards in opts.state, only those the band fits round, since the
   program boards only rooms an arrangement of the band leaves empty);
   with 'form', any different traits.
   A move gives a Zoombini a room: a floor, trunk or door already settled,
   or a new one (the lowest free, the others being alike, except at level
   3 where the boards tell them apart). It is let in, which settles the
   room's values for the hypotheses that let it in, or turned away, a
   chance used, and the one that uses the last closes the hotel. Once one
   hypothesis is left the rest is known: every Zoombini that can have a
   room given those settled (at level 3 round the boards) goes in free.
   The play is worked out first by a rule of thumb, a move every
   hypothesis lets in if there is one (at level 3 the one that leaves the
   most room round the boards), else the one fewest hypotheses turn away;
   and where that is not sure of everyone, by minimax, memoised on the
   placings, the hypotheses left and the chances, within the budget. */
function zbHotelStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program', state = opts.state || null;
  const A = level === 1 ? 1 : level === 4 ? 3 : 2, n = band.length, places = ZB_HOTEL_PLACES[level - 1];
  const C = opts.chances || (ZB_HOTEL_LAST_STEP - ZB_HOTEL_FIRST_STEP[level - 1]);
  const boards = level === 3 && state && state.boarded ? state.boarded.slice() : [];
  const variants = zbHotelVariants(band);
  /* The hypotheses: traits in order, as indices into ZB_HOTEL_AXES. */
  const tuples = [];
  const rec = pre => { if (pre.length === A) tuples.push(pre); else for (let a = 0; a < 4; a++) if (!pre.includes(a)) rec([...pre, a]); };
  rec([]);
  const suits = t => [0, 1, 2, 3].some(x => [0, 1, 2, 3].some(y => zbHotelAxesSuit(level, [...t, x, y].slice(0, 3), variants)));
  const fitsBoards = t => {
    const traits = t.map(a => ZB_HOTEL_AXES[a]), vals = traits.map(k => [...new Set(band.map(z => z[k]))]);
    const m0 = zbHotelAxisMaps(vals[0]), m1 = zbHotelAxisMaps(vals[1]);
    return m0.some(a => m1.some(b => band.every(z => !zbHotelBoarded(3, [a.get(z[traits[0]]), b.get(z[traits[1]])], boards))));
  };
  const hyps = [], byKey = new Map();
  for (const t of tuples) {
    if (knows === 'program' && (!suits(t) || (boards.length && !fitsBoards(t)))) continue;
    /* Each Zoombini's class for each trait: who it is alike with. */
    const lab = t.map(a => { const seen = []; return band.map(z => { const v = z[ZB_HOTEL_AXES[a]]; if (!seen.includes(v)) seen.push(v); return seen.indexOf(v); }); });
    const key = lab.map(l => l.join('')).join('|');
    if (byKey.has(key)) { byKey.get(key).weight++; byKey.get(key).tuples.push(t); continue; }
    const h = { key, lab, weight: 1, tuples: [t], id: hyps.length };
    byKey.set(key, h);
    hyps.push(h);
  }
  const deadline = Date.now() + (opts.budget || 1500);
  let exact = true;
  /* A placing: each band member's room as a code (position j in base 5
     digit j), or -1. */
  const posOf = code => places.map((_, j) => Math.floor(code / 5 ** j) % 5);
  const codeOf = pos => pos.reduce((t, p, j) => t + p * 5 ** j, 0);
  const grid = (h, P) => {
    const g = places.map(() => [-1, -1, -1, -1, -1]);
    P.forEach((c, i) => { if (c >= 0) posOf(c).forEach((p, j) => { g[j][p] = h.lab[j][i]; }); });
    return g;
  };
  const lets = (h, g, i, pos) => pos.every((p, j) => g[j][p] >= 0 ? g[j][p] === h.lab[j][i] : !g[j].includes(h.lab[j][i]));
  const unplaced = P => { const u = []; P.forEach((c, i) => { if (c < 0) u.push(i); }); return u; };
  /* With h known, the most still to be given rooms, and how: every
     arrangement of the values not yet settled into the free positions,
     at level 3 round the boards (else all fit, the lowest free first). */
  const fitMemo = new Map();
  const fit = (h, P) => {
    const key = h.id + '|' + P.join();
    if (fitMemo.has(key)) return fitMemo.get(key);
    const g = grid(h, P), u = unplaced(P);
    const fixed = places.map((_, j) => { const m = new Map(); g[j].forEach((c, p) => { if (c >= 0) m.set(c, p); }); return m; });
    const need = places.map((_, j) => [...new Set(u.map(i => h.lab[j][i]))]);
    let best = { count: 0, maps: null };
    if (level !== 3) best = { count: u.length, maps: places.map((_, j) => zbHotelAxisMaps(need[j], fixed[j])[0]) };
    else {
      /* Each way of giving the floors, then the best way of giving the
         trunks to it: an assignment, found over the trunks still free by
         dynamic programming. */
      const freeT = [0, 1, 2, 3, 4].filter(t => ![...fixed[1].values()].includes(t)), B = need[1].filter(b => !fixed[1].has(b));
      for (const m0 of zbHotelAxisMaps(need[0], fixed[0])) {
        let base = 0;
        const gain = B.map(() => [0, 0, 0, 0, 0]);
        for (const i of u) {
          const f = m0.get(h.lab[0][i]), b = h.lab[1][i];
          if (fixed[1].has(b)) { if (!zbHotelBoarded(3, [f, fixed[1].get(b)], boards)) base++; }
          else for (const t of freeT) if (!zbHotelBoarded(3, [f, t], boards)) gain[B.indexOf(b)][t]++;
        }
        /* dp[k][mask]: the most from the first k of B given the trunks in mask. */
        const dp = [new Map([[0, { v: 0, from: null, t: -1 }]])];
        for (let k = 0; k < B.length; k++) {
          const next = new Map();
          for (const [mask, e] of dp[k]) for (const t of freeT) if (!(mask >> t & 1)) {
            const m2 = mask | 1 << t, v = e.v + gain[k][t];
            if (!next.has(m2) || next.get(m2).v < v) next.set(m2, { v, from: mask, t });
          }
          dp.push(next);
        }
        let top = null, topMask = 0;
        for (const [mask, e] of dp[B.length]) if (!top || e.v > top.v) { top = e; topMask = mask; }
        if (!top) continue;
        const count = base + top.v;
        if (count > best.count || !best.maps) {
          const m1 = new Map(fixed[1]);
          for (let k = B.length, mask = topMask; k > 0; k--) { const e = dp[k].get(mask); m1.set(B[k - 1], e.t); mask = e.from; }
          best = { count, maps: [m0, m1] };
        }
        if (best.count === u.length) break;
      }
    }
    fitMemo.set(key, best);
    return best;
  };
  /* The moves: one of each kind of Zoombini still without a room, into
     each room worth trying; with the hypotheses that would let it in. */
  const moves = (P, H) => {
    const u = unplaced(P), sigs = new Set(), grids = H.map(h => grid(h, P)), out = [];
    const cand = places.map((_, j) => {
      const occ = new Set(); P.forEach(c => { if (c >= 0) occ.add(posOf(c)[j]); });
      const free = [0, 1, 2, 3, 4].filter(p => !occ.has(p));
      return [...occ].sort((a, b) => a - b).concat(level === 3 ? free : free.slice(0, 1));
    });
    const rooms = [];
    const r = (j, pre) => { if (j === places.length) { if (!zbHotelBoarded(level, pre, boards)) rooms.push(pre); return; } for (const p of cand[j]) r(j + 1, [...pre, p]); };
    r(0, []);
    for (const i of u) {
      const sig = zbZoombiniId(band[i]);
      if (sigs.has(sig)) continue;
      sigs.add(sig);
      for (const pos of rooms) {
        const acc = H.filter((h, k) => lets(h, grids[k], i, pos));
        if (acc.length) out.push({ i, code: codeOf(pos), acc });
      }
    }
    return out;
  };
  const place = (P, i, code) => { const Q = P.slice(); Q[i] = code; return Q; };
  const END = { v: 0, end: true };
  /* The rule of thumb's pick among moves. */
  const pick = (P, H, ms, c) => {
    const free = ms.filter(m => m.acc.length === H.length);
    const least = Math.min(...ms.map(m => H.length - m.acc.length));
    if (level !== 3) return free.length ? free[0] : ms.find(m => H.length - m.acc.length === least);
    /* At level 3 the boards matter: each move is judged a step ahead, by
       the most sure of a room once the traits are known, as if that were
       at once (fit): the worse of being let in and being turned away. A
       free move is tried for the first two kinds of Zoombini that have
       one; otherwise the moves fewest hypotheses turn away, a dozen or two. */
    const kinds = [...new Set(free.map(m => m.i))].slice(0, 2);
    const cands = free.length ? free.filter(m => kinds.includes(m.i))
      : ms.slice().sort((x, y) => y.acc.length - x.acc.length).slice(0, 20);
    let best = null, bv = -1;
    for (const m of cands) {
      const rej = H.filter(h => !m.acc.includes(h));
      let v = 1 + Math.min(...m.acc.map(h => fit(h, place(P, m.i, m.code)).count));
      if (rej.length) v = Math.min(v, c > 1 ? Math.min(...rej.map(h => fit(h, P).count)) : 0);
      if (v > bv) { best = m; bv = v; }
    }
    return best;
  };
  const guessMemo = new Map();
  const guess = (P, H, c) => {
    const u = unplaced(P);
    if (!u.length || !c) return END;
    if (H.length === 1) return { v: fit(H[0], P).count, complete: true };
    const key = H.map(h => h.id).join(',') + '|' + P.join() + '|' + c;
    if (guessMemo.has(key)) return guessMemo.get(key);
    const ms = moves(P, H);
    if (!ms.length) { guessMemo.set(key, END); return END; }
    const m = pick(P, H, ms, c), rej = H.filter(h => !m.acc.includes(h));
    const kids = [guess(place(P, m.i, m.code), m.acc, c), rej.length ? (c > 1 ? guess(P, rej, c - 1) : END) : null];
    const plan = { v: Math.min(1 + kids[0].v, kids[1] ? kids[1].v : Infinity), i: m.i, code: m.code, acc: m.acc, kids };
    guessMemo.set(key, plan);
    return plan;
  };
  const memo = new Map();
  const search = (P, H, c) => {
    const u = unplaced(P);
    if (!u.length || !c) return END;
    if (H.length === 1) return { v: fit(H[0], P).count, complete: true };
    const key = H.map(h => h.id).join(',') + '|' + P.join() + '|' + c;
    if (memo.has(key)) return memo.get(key);
    let b = guess(P, H, c);
    /* No play does better than the worst hypothesis's best, known. */
    const ub = Math.min(...H.map(h => fit(h, P).count));
    if (b.v < ub) {
      /* The most promising first: at level 3 by the rule of thumb's own
         step-ahead judgement, elsewhere those fewest would turn away. */
      const ms = moves(P, H), ahead = new Map();
      if (level === 3) for (const m of ms) {
        const rej = H.filter(h => !m.acc.includes(h));
        let v = 1 + Math.min(...m.acc.map(h => fit(h, place(P, m.i, m.code)).count));
        if (rej.length) v = Math.min(v, c > 1 ? Math.min(...rej.map(h => fit(h, P).count)) : 0);
        ahead.set(m, v);
      }
      ms.sort((x, y) => (ahead.get(y) || 0) - (ahead.get(x) || 0) || y.acc.length - x.acc.length);
      for (const m of ms) {
        if (Date.now() > deadline) { exact = false; break; }
        const rej = H.filter(h => !m.acc.includes(h));
        let v = Infinity;
        if (rej.length) v = c > 1 ? search(P, rej, c - 1).v : 0;
        if (v <= b.v) continue;
        v = Math.min(v, 1 + search(place(P, m.i, m.code), m.acc, c).v);
        if (v > b.v) b = { v, i: m.i, code: m.code, acc: m.acc };
        if (b.v === ub) break;
      }
    }
    memo.set(key, b);
    return b;
  };
  const planFor = (P, H, c) => {
    if (!unplaced(P).length || !c) return END;
    if (H.length === 1) return { v: fit(H[0], P).count, complete: true };
    return memo.get(H.map(h => h.id).join(',') + '|' + P.join() + '|' + c) || guess(P, H, c);
  };
  const weight = H => H.reduce((t, h) => t + h.weight, 0);
  const posList = P => P.map(c => c < 0 ? null : posOf(c));
  const node = (P, H, c, plan) => {
    const left = weight(H), u = unplaced(P), inside = n - u.length;
    const end = (move, lostCaption) => ({ move, zoombini: null, left, crossed: inside, spent: C - c, place: P, outcomes: [],
      diagram: zbHotelDiagram(band, { level, place: posList(P), boards, chances: c, lost: !!u.length, caption: lostCaption }) });
    if (!u.length) return end(`Every Zoombini has a room: all ${inside} are in.`, `All ${inside} in rooms`);
    if (!c) return end(`The counter is full and the hotel closes: ${u.length} without a room.`, `${inside} in rooms, ${u.length} left out`);
    const pl = plan || planFor(P, H, c);
    if (pl.end && !pl.complete) return end(`No room is left that ${u.length === 1 ? 'the last Zoombini' : `the last ${u.length}`} could take: ${level === 3 ? 'the boards are in the way' : 'none would be let in'}.`, `${inside} in rooms, ${u.length} left out`);
    let i, code, outcomes;
    if (pl.complete) {
      /* One hypothesis left: each to the room it must have. */
      const f = fit(H[0], P);
      i = u.find(k => !zbHotelBoarded(level, places.map((_, j) => f.maps[j].get(H[0].lab[j][k])), boards));
      if (i == null) return end(`The traits are known now, and ${u.length} can have no room: theirs ${u.length === 1 ? 'is' : 'are'} boarded up.`, `${inside} in rooms, ${u.length} left out`);
      code = codeOf(places.map((_, j) => f.maps[j].get(H[0].lab[j][i])));
      outcomes = [{ label: `It is let in (the traits are known)`, left, next: () => node(place(P, i, code), H, c, null) }];
    } else {
      ({ i, code } = pl);
      const acc = pl.acc || moves(P, H).find(m => m.i === i && m.code === code).acc, rej = H.filter(h => !acc.includes(h));
      outcomes = [{ label: `It is let in (${weight(acc)} left)`, left: weight(acc), next: () => node(place(P, i, code), acc, c, pl.kids && pl.kids[0]) }];
      if (rej.length) outcomes.push({ label: c > 1 ? `It is turned away (${weight(rej)} left)` : 'It is turned away, and the counter is full', left: weight(rej),
        next: () => c > 1 ? node(P, rej, c - 1, pl.kids && pl.kids[1]) : node(P, rej, 0, null) });
    }
    const pos = posOf(code);
    return {
      move: `Give Zoombini ${i + 1} ${zbHotelRoomName(level, pos)}.`,
      zoombini: i, room: pos, rooms: posList(P), left, crossed: inside, place: P,
      diagram: zbHotelDiagram(band, { level, place: posList(P), boards, sent: { i, pos }, chances: c, caption: `${left} hypotheses left; ${inside} in rooms` }),
      outcomes,
    };
  };
  const H0 = hyps.slice(), P0 = band.map(() => -1);
  const plan0 = H0.length ? search(P0, H0, C) : END;
  const hyp = weight(H0);
  /* Sure of as many as the worst hypothesis could give with it known is
     as many as can be, however the search ended. */
  if (H0.length && plan0.v === Math.min(...H0.map(h => fit(h, P0).count))) exact = true;
  return {
    hypotheses: hyp, sure: plan0.v, exact, knows,
    root: node(P0, H0, C, plan0),
    notes: [
      `${knows === 'form' ? 'The player knows only the level’s form: any' : 'The program could draw, for this band,'} ${hyp} choice${hyp === 1 ? '' : 's'} of ${A === 1 ? 'trait' : `${A} traits in order`}, ${H0.length} different to this band${knows === 'program' && level === 3 ? (boards.length ? ', counting only those the band fits round the boards (the program boards only rooms an arrangement leaves empty, so a puzzle set otherwise is not one it could deal)' : '; the boards were not given, so none are taken into account') : level === 3 && !boards.length ? '; the boards were not given, so none are taken into account' : ''}. Which floor, trunk or door takes which value is not hidden: the first Zoombini into each settles it.`,
      'A move gives a Zoombini a room; it is let in or turned away, and each turning away moves the counter on.',
      'A room every hypothesis would let it into is taken first; otherwise the one fewest hypotheses would turn it away from, and where that is not sure of everyone, the move whose worse outcome still gets the most in.',
      exact ? 'The search is complete: no way of playing is sure of more.' : 'The search stopped at its budget and played the rest by its rule of thumb, so this many are sure, and perhaps more could be.',
    ],
  };
}

ZB_PUZZLES.set('HOTEL', {
  about: 'The band is given rooms in a hotel built in five tree trunks. Only Zoombinis alike in the traits that matter tonight may share a room, and which traits those are is hidden.',
  levels: [
    { rule: 'One trait, such as the nose: five rooms, one to a trunk, each for one of its values, whichever the first Zoombini in it has. The trait is drawn at random, and if the band shows all five values of two traits or more, it is one it shows at least four values of.',
      chances: 'Seven Zoombinis may be turned away, the hotel growing darker each time; the seventh closes it to the rest of the band.',
      notes: [ZB_HOTEL_MIDI] },
    { rule: 'Two different traits, one deciding the floor and one the trunk, for 25 rooms, each for one pair of values. Drawn as at level 1, both of them.',
      chances: 'Ten Zoombinis may be turned away; the tenth closes the hotel.',
      notes: [ZB_HOTEL_MIDI] },
    { rule: 'Two traits for floor and trunk, as at level 2, except that the test is whether the band shows four values or more of two traits or more; and between 1 and 8 rooms are boarded up, rooms that a random arrangement of the band left empty.',
      chances: 'Eight Zoombinis may be turned away; the eighth closes the hotel.',
      notes: [ZB_HOTEL_MIDI] },
    { rule: 'Three different traits, deciding floor, trunk and door, for 125 rooms. Any three will do, whatever the band.',
      chances: 'Ten Zoombinis may be turned away; the tenth closes the hotel.',
      notes: [ZB_HOTEL_MIDI] },
  ],
  deal(level, band, rnd) {
    const variants = zbHotelVariants(band);
    let axes, tries = 0;
    do {
      axes = [rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)];
      if (++tries > 10000) return { setup: ['No traits suit this band; the program would keep drawing.'], answer: [], marks: band.map(() => null), state: { stuck: true } };
    } while (!zbHotelAxesSuit(level, axes, variants));
    const used = axes.slice(0, level === 1 ? 1 : level === 4 ? 3 : 2).map(a => ZB_HOTEL_AXES[a]);
    const chances = ZB_HOTEL_LAST_STEP - ZB_HOTEL_FIRST_STEP[level - 1];
    const state = {
      axis1TraitAxis: axes[0], axis2TraitAxis: axes[1], axis3TraitAxis: axes[2], traits: used,
      traitVariantCounts: variants, initialCounterStep: ZB_HOTEL_FIRST_STEP[level - 1], chances,
    };
    const boarded = [];
    if (level === 3) {
      /* A random arrangement: floor i takes the first trait's value
         rows[i], trunk i the second's cols[i], drawn in turn. */
      const rows = [], cols = [];
      for (let i = 0; i < 5; i++) {
        let r, c;
        do r = rnd.range(0, 4); while (rows.includes(r + 1));
        rows.push(r + 1);
        do c = rnd.range(0, 4); while (cols.includes(c + 1));
        cols.push(c + 1);
      }
      /* The rooms nobody in the band would have in it, by slot: always
         some, as a band fills at most 16 of the 25. */
      const counts = Array.from({ length: 25 }, (_, s) => band.filter(z => z[used[0]] === rows[s % 5] && z[used[1]] === cols[Math.floor(s / 5)]).length);
      const empty = counts.map((n, s) => n ? -1 : s).filter(s => s >= 0);
      let n = rnd.range(0, empty.length - 1) + 1;
      n = Math.min(n, ZB_HOTEL_MOST_BOARDED, empty.length);
      for (let i = 0; i < n; i++) {
        let pick;
        do pick = rnd.range(0, empty.length - 1); while (boarded.includes(empty[pick]));
        boarded.push(empty[pick]);
        /* Not the rule: which of four boarded-up pictures the room shows. */
        rnd.range(0, 3);
      }
      Object.assign(state, { level3GeneratedRows: rows, level3GeneratedColumns: cols, level3RoomMatchCounts: counts, boarded });
    }
    const setup = [
      level === 1 ? `Five rooms, the lowest in each of five tree trunks.`
        : level === 4 ? `125 rooms: five tree trunks, five floors to a trunk and five doors to a floor.`
          : `25 rooms: five tree trunks, five floors to a trunk${level === 3 ? `, and ${boarded.length} of the rooms boarded up` : ''}.`,
      `${band.length} Zoombinis to give rooms to, and ${chances} may be turned away.`,
    ];
    const place = ['room', 'floor', 'trunk', 'door'];
    const answer = [];
    if (level === 1) answer.push(`Tonight the rooms go by ${used[0]}: each room takes Zoombinis with one kind of ${used[0]}, whichever the first one in it has.`);
    else {
      const parts = used.map((k, i) => `the ${place[i + 1]}${i ? '' : ' goes'} by ${k}`);
      answer.push(`Tonight ${zbWordsOr(parts, 'and')}: each ${zbWordsOr(place.slice(1, used.length + 1), 'and')} takes one kind, whichever the first Zoombini in it has, so Zoombinis share a room only if alike in ${used.length === 2 ? 'both' : 'all three'}.`);
    }
    const kinds = new Map();
    for (const z of band) {
      const key = used.map(k => z[k]).join();
      kinds.set(key, (kinds.get(key) || 0) + 1);
    }
    answer.push(`This band needs ${kinds.size} room${kinds.size === 1 ? '' : 's'}: ${zbWordsOr([...kinds.values()].sort((a, b) => b - a).map(String), 'and')} to a room.`);
    if (level === 3) {
      answer.push(`Boarded up, counting trunks from the left and floors from the top: ${boarded.slice().sort((a, b) => a - b).map(zbHotelRoomWords).join('; ')}.`);
      answer.push(`One arrangement that fits round them: the floors from the top for Zoombinis with ${zbWordsOr(state.level3GeneratedRows.map(v => zbTraitWith(used[0], v)), 'and')}, `
        + `the trunks from the left for ${zbWordsOr(state.level3GeneratedColumns.map(v => zbTraitWith(used[1], v)), 'and')}.`);
    }
    const marks = band.map(z => used.map((k, i) => `${ZB_TRAIT_SHORT[k][z[k] - 1]} ${place[i === 0 && level === 1 ? 0 : i + 1]}`).join(', '));
    return { setup, answer, marks, state };
  },
  form(level, band, state) {
    const places = ZB_HOTEL_PLACES[level - 1], kinds = ZB_TRAIT_KINDS.map(k => ({ value: k, label: k }));
    const variants = zbHotelVariants(band);
    const could = ZB_HOTEL_AXES.filter((k, a) => [0, 1, 2, 3].some(x => [0, 1, 2, 3].some(y => zbHotelAxesSuit(level, [a, x, y], variants))));
    let pairs = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b && [0, 1, 2, 3].some(x => zbHotelAxesSuit(level, [a, b, x], variants))) pairs++;
    const fields = places.map((pl, j) => ({ key: pl, label: level === 1 ? 'The rooms go by' : `The ${pl}s go by`, kind: 'choice', value: state.traits[j], options: kinds }));
    if (level === 3) {
      fields.push({ key: 'boarded', label: 'Boarded up', kind: 'several', min: 1, max: ZB_HOTEL_MOST_BOARDED, value: state.boarded.slice().sort((a, b) => a - b),
        options: Array.from({ length: 25 }, (_, slot) => ({ value: slot, label: zbHotelRoomWords(slot) })) });
    }
    fields.push({ key: 'note', kind: 'note', note: `Which floor, trunk or door takes which value is not part of the puzzle: the first Zoombini into each settles it. `
      + (level === 4 ? 'Any three different traits.' : level === 1 ? `For this band the program’s test lets it draw ${zbWordsOr(could, 'or')}.` : `The two must differ; for this band the program’s test lets it draw ${pairs} of the 12 pairs.`)
      + (level === 3 ? ' The boards may be any 1 to 8 rooms; the program boards only rooms an arrangement of the band leaves empty, so with others the band may not all fit.' : '') });
    return fields;
  },
  edit(level, band, state, values) {
    const places = ZB_HOTEL_PLACES[level - 1];
    const traits = places.map(pl => values[pl]);
    if (traits.some(k => !ZB_TRAIT_KINDS.includes(k))) throw new Error('Pick a trait for each.');
    if (new Set(traits).size !== traits.length) throw new Error('Each must go by a different trait.');
    const axes = traits.map(k => ZB_HOTEL_AXES.indexOf(k));
    const out = {
      axis1TraitAxis: axes[0], axis2TraitAxis: axes[1] != null ? axes[1] : state.axis2TraitAxis, axis3TraitAxis: axes[2] != null ? axes[2] : state.axis3TraitAxis,
      traits, traitVariantCounts: zbHotelVariants(band), initialCounterStep: ZB_HOTEL_FIRST_STEP[level - 1], chances: ZB_HOTEL_LAST_STEP - ZB_HOTEL_FIRST_STEP[level - 1], edited: true,
    };
    if (level === 3) {
      const b = [...new Set((values.boarded || []).map(Number))];
      if (b.some(x => !(x >= 0 && x < 25 && x === Math.floor(x)))) throw new Error('A boarded room must be one of the 25.');
      if (b.length < 1 || b.length > ZB_HOTEL_MOST_BOARDED) throw new Error(`The program boards up between 1 and ${ZB_HOTEL_MOST_BOARDED} rooms.`);
      out.boarded = b.sort((x, y) => x - y);
    }
    return out;
  },
  solve(level, band, state) {
    const traits = state.traits, boards = level === 3 ? state.boarded || [] : [], n = band.length, places = ZB_HOTEL_PLACES[level - 1];
    const vals = traits.map(k => [...new Set(band.map(z => z[k]))].sort((a, b) => a - b));
    const maps = vals.map(vs => zbHotelAxisMaps(vs).map(m => ({ m, stray: zbHotelStray(m, vs), key: vs.map(v => m.get(v)).join('') }))
      .sort((x, y) => x.stray - y.stray || (x.key < y.key ? -1 : 1)));
    let most, ways, picks = [];
    const fits = ms => band.filter(z => !zbHotelBoarded(level, zbHotelRoomOf(z, traits, ms), boards)).length;
    if (level !== 3) {
      most = n;
      ways = maps.reduce((t, l) => t * l.length, 1);
      /* The simplest arrangements come from each trait's simplest. */
      const heads = maps.map(l => l.slice(0, 12));
      const combo = (j, acc) => { if (j === heads.length) { picks.push({ maps: acc.map(x => x.m), stray: acc.reduce((t, x) => t + x.stray, 0), key: acc.map(x => x.key).join('.') }); return; } for (const x of heads[j]) combo(j + 1, [...acc, x]); };
      combo(0, []);
    } else {
      most = -1;
      for (const a of maps[0]) for (const b of maps[1]) {
        const c = fits([a.m, b.m]);
        if (c > most) { most = c; picks = []; }
        if (c === most) picks.push({ maps: [a.m, b.m], stray: a.stray + b.stray, key: a.key + '.' + b.key });
      }
      ways = picks.length;
    }
    picks.sort((x, y) => x.stray - y.stray || (x.key < y.key ? -1 : 1));
    const byPos = (j, m) => [0, 1, 2, 3, 4].map(p => { const v = vals[j].find(w => m.get(w) === p); return v ? zbTraitWith(traits[j], v) : 'no one'; });
    const order = ['from the top', 'from the left', 'from the left'];
    const solutions = picks.slice(0, 12).map((p, k) => {
      const pos = band.map(z => zbHotelRoomOf(z, traits, p.maps));
      const inside = band.map((_, i) => i).filter(i => !zbHotelBoarded(level, pos[i], boards)), out = band.map((_, i) => i).filter(i => !inside.includes(i));
      const rooms = new Map();
      for (const i of inside) { const key = pos[i].join(); if (!rooms.has(key)) rooms.set(key, []); rooms.get(key).push(i); }
      const steps = places.map((pl, j) => `${level === 1 ? 'Rooms' : pl[0].toUpperCase() + pl.slice(1) + 's'} ${level === 1 ? 'from the left' : order[j]} by ${traits[j]}: ${byPos(j, p.maps[j]).join(', ')}.`);
      steps.push('Rooms: ' + [...rooms.entries()].sort((a, b) => a[1][0] - b[1][0]).map(([key, who]) => `${zbPlacesWords(who)} in ${zbHotelRoomName(level, key.split(',').map(Number))}`).join('; ') + '.');
      if (out.length) steps.push(`No room for ${zbPlacesWords(out)}: under this arrangement ${out.length === 1 ? 'its' : 'theirs'} would be boarded up, and no arrangement does better.`);
      steps.push('In any order, and no one is turned away.');
      return {
        title: `${inside.length === n ? `All ${n}` : `${inside.length} of ${n}`} in rooms${k ? ', another arrangement' : ', the simplest arrangement'}`,
        steps, crosses: inside,
        diagram: zbHotelDiagram(band, { level, traits, maps: p.maps, place: pos.map((q, i) => inside.includes(i) ? q : null), boards, lost: !!out.length }),
      };
    });
    return {
      most, exact: true, ways,
      solutions,
      notes: [
        'In means given a room; a Zoombini left without one does not go on.',
        'Known, the traits give each Zoombini the room of its values once an arrangement is chosen: which value each floor, trunk or door takes, settled by the first Zoombini into it. An arrangement is a way; the order of placing does not matter.',
        `Simplest: the band's values in each trait's own order (${zbWordsOr(traits.map(k => ZB_TRAIT_SHORT[k][0].toLowerCase() + ' first'), 'and')}) from the top floor and the leftmost trunk${level === 4 ? ' and door' : ''}; then the others by how far their values stray from that.`,
        ...(level === 3 ? [most === n ? `Round the boards ${ways} of the arrangements fit the whole band.` : `No arrangement fits the whole band round these boards: the most is ${most}, in ${ways} arrangement${ways === 1 ? '' : 's'}.`] : []),
      ],
    };
  },
  strategy(level, band, arc, opts = {}) { return zbHotelStrategy(level, band, opts); },
  /* The room takes it when each floor, trunk or door it is in is settled
     for its value of the trait deciding it, or, where one is not yet
     settled, its value is settled nowhere else; it is let in, and
     otherwise turned away. A boarded room is not judged at all. */
  answer(level, band, state, node) {
    const z = band[node.zoombini], traits = state.traits;
    if (zbHotelBoarded(level, node.room, level === 3 ? state.boarded || [] : [])) return -1;
    const lets = node.room.every((p, j) => {
      const settled = new Map();
      node.rooms.forEach((q, i) => { if (q) settled.set(q[j], band[i][traits[j]]); });
      return settled.has(p) ? settled.get(p) === z[traits[j]] : ![...settled.values()].includes(z[traits[j]]);
    });
    return lets ? 0 : node.outcomes.length > 1 ? 1 : -1;
  },
  source: 'ScummVM’s puzzle_hotel.cpp, checked against the program’s code.',
});
