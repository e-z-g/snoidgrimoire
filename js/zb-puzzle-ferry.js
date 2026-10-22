/* zb-puzzle-ferry.js -- Captain Cajun's Ferryboat: a raft of sixteen
   seats, and a captain who lets a Zoombini sit only beside its like.
   =========================================================================
   Needs zb-puzzle.js, and mac-bytes.js, zb-mohawk.js, zb-bitmap.js and
   zb-script.js, with which the deal reads FERRY.

   The band waits on the dock and is dragged, one Zoombini at a time, onto
   the seats of Captain Cajun's raft. Hidden is the rule, which is the same
   at every level: a Zoombini may sit only where it shares at least one
   trait (the same hair, eyes, nose or feet) with every Zoombini already
   seated next to it. The captain sends back one that does not, and
   nothing is counted; a seated Zoombini may be picked up and moved. The
   raft leaves when the player says so, with at least one aboard, and
   those still on the dock stay behind. Nothing in it is drawn at
   random: what changes with the level is the raft.

   The raft is one of FERRY's feature scripts SCRB 1510-1529, chosen by
   level and band: 1510 + 5 x (level - 1) + (band - 16), where a band of
   fewer than 16 (or more than 20) is given the sixteen-seat raft. The
   script's first frame places the seats (shapes 1-3, three looks of the
   same 44 x 36 seat), its second the cargo round them; the deal reads
   them from the archive it is given. Which seats are
   next to which is worked out from the seats' rectangles: seat K's
   rectangle is stretched by h, half its height less 2 (16 pixels), top
   and bottom while narrowed as much at the sides, and then the other way
   round, and at level 4 also stretched top and bottom alone; seat M is
   next to K when one of those overlaps M's rectangle (strictly), up to
   eight neighbors a seat. With sixteen seats this makes, at level 1, a
   single line (two rows of seven joined at the left by two more), at
   level 2 a ladder of two rows of eight, at level 3 four rows of four,
   each seat next to those beside it and one before and one behind, and
   at level 4 four rows of four set unevenly, where the third rectangle
   lets a seat touch up to two seats in each of the rows before and
   behind: up to six neighbors.

   So a band's answer is a seating in which every two neighbors share a
   trait; there is often more than one, and a band may have none that
   seats everyone. The deal looks for a seating of as many as it can, each
   size first by a quick search (ZB_FERRY_QUICK steps) and then by
   ScummVM's solver, ported (zbFerryMatch), which proves whether that many
   can sit; the deal also reports whether what was found is the most
   possible or only the most found before the time ran out.

   On the workbench nothing is hidden from the player, who sees the raft
   and the band, so there is no strategy to find, and nothing is the
   program's to choose but the raft, which follows from the level and the band.
   solve gives the most that can sit, whether that is proven, the number
   of seatings (exactly, for the level-1 line filled end to end, by
   counting paths; otherwise by the search, while its budget lasts) and a
   dozen seatings, the simplest first: the fewest neighbors sharing one
   trait only, then the fewest neighbors at all.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_ferry.cpp and .h
   (loadFeatures, loadSeatLayout, buildAdjacencyMatrix, testAdjacentMatch,
   endDrag, debugGetAnswer, debugGetChances), checked against ZOOMBI32.EXE
   of the 1996 disc's ZBARC32.Z: the page's setup at 0x419e59 picks the
   raft at 0x41b992 (the same sum, with the level counted from 0 and the
   band held to 16-20; ZOOMBINI.EXE makes it at 0x1614b), lays out its
   seats at 0x41b4bd (the seat's drop point 22 right
   and 7 up from its corner) and finds the neighbors at 0x41ba0b, with
   the three stretched rectangles as ScummVM has them, the third only at
   the last level, and an overlap that must be strict (0x4823e8); the code
   at 0x41ad8c judges a drop, allowing it only where every occupied
   neighbor shares one of the four traits. The Mac build's INSTALLSEATSFORCURRENTLEVEL
   picks the raft by the same sum, and its FINDSEATADJACENCIES does the
   same sums on the same fields (and first works out half the width,
   which it then overwrites with half the height). No draw of the random
   numbers in ScummVM's or the program's setup changes the seats or the
   rule: they pick the captain's animations and sounds.
   utilities/puzzles/ferry.mjs compares the reading of the rafts and the
   rules with ScummVM's text and the raft's choice with ZOOMBINI.EXE.
*/

/* The seats' feature scripts and picture (ScummVM's kResScrb1500_SeatBase
   and kResBitmapShape1500_Seats): seat shape k is drawn by SCRB 1499 + k
   from tBMP 1500's frame k - 1. The most seats a raft registers, and the
   most neighbors a seat has. */
const ZB_FERRY_SEAT = { scripts: 1500, sheet: 1500, shapes: [1, 3], most: 20, neighbors: 8 };
/* The quick search's steps for each size of seating, before zbFerryMatch
   settles it. */
const ZB_FERRY_QUICK = 2000;

/* A raft from an opened FERRY: its seats, in the program's order, each
   { x, y, w, h }, the rectangle its seat is drawn in. The raft script's
   first frame places a seat with each record of shape 1-3; each seat's
   script draws its picture from its first record, which is where the
   seat's corner goes. Kept for each archive. */
const zbFerryRaftsRead = new WeakMap();
function zbFerryRaft(arc, script) {
  if (!arc) throw new Error('Captain Cajun’s Ferryboat: the deal needs FERRY opened, for its rafts');
  if (!zbFerryRaftsRead.has(arc)) zbFerryRaftsRead.set(arc, new Map());
  const cache = zbFerryRaftsRead.get(arc);
  if (cache.has(script)) return cache.get(script);
  const requireResource = (tag, id, what) => {
    if (!arc.has(tag, id)) throw new Error(`Captain Cajun’s Ferryboat: this FERRY has no ${tag} ${id}, ${what}`);
    return arc.get(tag, id);
  };
  const raft = parseScript(requireResource('SCRB', script, 'the raft’s seats'), 'SCRB');
  if (raft.frames.length < 2) throw new Error(`Captain Cajun’s Ferryboat: FERRY SCRB ${script} has ${raft.frames.length} frames, not the seats and the cargo`);
  const sheet = tbmpFrameOffsets(requireResource('tBMP', ZB_FERRY_SEAT.sheet, 'the seats’ picture'));
  if (!sheet) throw new Error(`Captain Cajun’s Ferryboat: FERRY tBMP ${ZB_FERRY_SEAT.sheet} is not a sprite sheet`);
  const [lo, hi] = ZB_FERRY_SEAT.shapes, seats = [];
  for (const r of raft.frames[0].records) {
    if (r.shape < lo || r.shape > hi || seats.length >= ZB_FERRY_SEAT.most) continue;
    const own = parseScript(requireResource('SCRB', ZB_FERRY_SEAT.scripts + r.shape - 1, 'a seat’s script'), 'SCRB').frames[0].records[0];
    const at = sheet.offsets[own.shape - 1] - 8;
    seats.push({ x: r.x, y: r.y, w: u16be(sheet.payload, at) & 0x3fff, h: u16be(sheet.payload, at + 2) & 0x3fff });
  }
  cache.set(script, seats);
  return seats;
}

/* The raft's script for a level and band size. */
function zbFerryRaftScript(level, n) {
  return 1510 + 5 * (level - 1) + (n < 16 || n > 20 ? 0 : n - 16);
}

/* Each seat's neighbors, by seat index, as the program finds them. */
function zbFerryNeighbors(seats, level) {
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  return seats.map(({ x, y, w, h: ht }, k) => {
    const h = Math.max(0, Math.trunc(ht / 2) - 2), out = [];
    seats.forEach((m, j) => {
      if (j === k || out.length >= ZB_FERRY_SEAT.neighbors) return;
      const M = [m.x, m.y, m.x + m.w, m.y + m.h];
      if (overlap([x + h, y - h, x + w - h, y + ht + h], M) || overlap([x - h, y + h, x + w + h, y + ht - h], M)
        || (level >= 4 && overlap([x, y - h, x + w, y + ht + h], M))) out.push(j);
    });
    return out;
  });
}

/* Whether two Zoombinis share a trait. */
function zbFerryShare(a, b) { return ZB_TRAIT_KINDS.some(k => a[k] === b[k]); }

/* The search for seatings of a band on a raft: run(seatCount, limit, deadline,
   found, strong) calls found(seating) for each seating of seatCount Zoombinis of the
   band (the band index by seat, -1 empty), each once, two alike
   Zoombinis counting as one, until found returns true; it gives up after
   limit steps or at the deadline, and its result has gaveUp set. Seats are taken in the
   order a walk from the least connected seat reaches them, each filled or
   left empty; once no seat can be spared, the open seat that the fewest
   Zoombinis fit is filled first. The Zoombinis are tried the least
   sociable first, or, strong, those sharing the most traits with their
   seated neighbors first. */
function zbFerryEngine(band, neighbors) {
  const n = band.length, S = neighbors.length;
  const alike = band.map(a => band.map(b => ZB_TRAIT_KINDS.filter(k => a[k] === b[k]).length));
  const share = alike.map(r => r.map(c => c > 0));
  const partners = band.map((_, i) => share[i].filter((x, j) => x && j !== i).length);
  const byPartners = [...band.keys()].sort((a, b) => partners[a] - partners[b] || a - b);
  const order = [], seen = new Set();
  const start = [...neighbors.keys()].sort((a, b) => neighbors[a].length - neighbors[b].length || a - b);
  for (const s0 of start) {
    if (seen.has(s0)) continue;
    const queue = [s0];
    seen.add(s0);
    while (queue.length) {
      const s = queue.shift();
      order.push(s);
      for (const t of neighbors[s]) if (!seen.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  const seating = Array(S).fill(-1), used = Array(n).fill(false), empty = Array(S).fill(false);
  const fits = (z, s) => neighbors[s].every(t => seating[t] < 0 || share[z][seating[t]]);
  const run = (seatCount, limit, deadline, found, strong = false) => {
    let steps = 0, gaveUp = false, stopped = false;
    seating.fill(-1); used.fill(false); empty.fill(false);
    const rank = s => {
      const zs = byPartners.filter(z => !used[z] && fits(z, s));
      if (strong) {
        const w = z => neighbors[s].reduce((t, u) => t + (seating[u] < 0 ? 0 : alike[z][seating[u]]), 0);
        zs.sort((a, b) => w(b) - w(a));
      }
      return zs;
    };
    const step = () => {
      if (++steps > limit || (steps % 1024 === 0 && Date.now() > deadline)) gaveUp = true;
      return gaveUp;
    };
    const place = (s, z, next) => {
      seating[s] = z; used[z] = true;
      const r = next();
      seating[s] = -1; used[z] = false;
      return r;
    };
    /* Every seat still open must be filled. */
    const fillAll = placed => {
      if (placed === seatCount) { stopped = found(seating.slice()); return stopped; }
      if (step()) return true;
      let best = -1, bestFit = null;
      for (let s = 0; s < S; s++) {
        if (seating[s] >= 0 || empty[s]) continue;
        const fit = rank(s);
        if (!fit.length) return false;
        if (!bestFit || fit.length < bestFit.length) { best = s; bestFit = fit; }
      }
      const tried = new Set();
      for (const z of bestFit) {
        const id = zbZoombiniId(band[z]);
        if (tried.has(id)) continue;
        tried.add(id);
        if (place(best, z, () => fillAll(placed + 1))) return true;
      }
      return false;
    };
    const fill = (i, placed) => {
      if (placed === seatCount) { stopped = found(seating.slice()); return stopped; }
      if (S - i === seatCount - placed) return fillAll(placed);
      if (step()) return true;
      const s = order[i], tried = new Set();
      for (const z of rank(s)) {
        const id = zbZoombiniId(band[z]);
        if (tried.has(id)) continue;
        tried.add(id);
        if (place(s, z, () => fill(i + 1, placed + 1))) return true;
      }
      empty[s] = true;
      const r = fill(i + 1, placed);
      empty[s] = false;
      return r;
    };
    if (seatCount <= S) fill(0, 0);
    return { gaveUp, stopped };
  };
  return { run, alike, share };
}

/* Whether so many of the band can sit, proven either way, by ScummVM's
   ferry solver (`page solvable`), ported from zoombini_pages/puzzle_ferry.cpp
   in ied206's fork (commit fdaa2fb9fc, 21 October 2026, GPL-3.0): its
   debugFerrySolve and what that calls, with seats left out added here. The
   raft and the band become two graphs of one size N: the seats, and one
   seat on the dock for each Zoombini left behind, next to no seat; the
   band, and one rider for each seat left empty, sharing a trait with
   everyone. A seating is a match of seats to riders, one to one, putting
   riders who share a trait on every two neighboring seats. Each seat's
   candidates are narrowed first by its number of neighbors and by what
   stays connected without it, then over and over: a rider stays a seat's
   candidate only while every neighboring seat has a candidate sharing a
   trait with it, and only while some perfect matching of seats to riders
   uses it. A raft that is one line or one ring is then a path or cycle
   through every rider, found by a table over subsets; any other is
   searched a seat at a time, the seat with fewest candidates first, two
   riders interchangeable there tried once, failures remembered.
   { answer: 'yes', 'no' or 'unknown', seating } with the seating as
   zbFerrySeatBand's, seating at least that many. N over 32: unknown. */
function zbFerryMatch(band, neighbors, seatCount, deadline = Infinity) {
  const S = neighbors.length, n = band.length, N = S + n - seatCount;
  if (seatCount > n || seatCount > S) return { answer: 'no', seating: null };
  if (N > 32) return { answer: 'unknown', seating: null };
  const bit = v => 1 << v, all = N === 32 ? -1 : (1 << N) - 1;
  /* Kept here: a global looked up in a hot loop is slow inside node's vm, where the checks run. */
  const { clz32, imul } = Math;
  const count = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24; };
  const first = x => 31 - clz32(x & -x);
  const seatAdj = new Int32Array(N), riderAdj = new Int32Array(N);
  neighbors.forEach((out, s) => out.forEach(t => { seatAdj[s] |= bit(t); seatAdj[t] |= bit(s); }));
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    if (a >= n || b >= n || zbFerryShare(band[a], band[b])) { riderAdj[a] |= bit(b); riderAdj[b] |= bit(a); }
  }
  const component = (adj, start, out = 0) => {
    let seen = bit(start), frontier = seen;
    while (frontier) {
      const v = first(frontier);
      frontier &= frontier - 1;
      const fresh = adj[v] & ~seen & ~out;
      seen |= fresh; frontier |= fresh;
    }
    return seen;
  };
  /* Without vertex v: how many pieces the rest falls into, and the largest. */
  const without = (adj, v) => {
    let left = all & ~bit(v), pieces = 0, largest = 0;
    while (left) {
      const c = component(adj, first(left), bit(v));
      left &= ~c;
      pieces++;
      largest = Math.max(largest, count(c));
    }
    return [pieces, largest];
  };
  let steps = 0;
  const late = () => (++steps & 63) === 0 && Date.now() > deadline;
  const done = mapping => {
    const seating = Array(S).fill(-1);
    for (let s = 0; s < S; s++) if (mapping[s] < n) seating[s] = mapping[s];
    return { answer: 'yes', seating };
  };

  const cand = new Int32Array(N);
  const riderWithout = [...Array(N).keys()].map(p => without(riderAdj, p));
  const riderComponent = [...Array(N).keys()].map(p => count(component(riderAdj, p)));
  let line = component(seatAdj, 0) === all, ring = line;
  for (let s = 0; s < N; s++) {
    const deg = count(seatAdj[s]), order = count(component(seatAdj, s)), [pieces, largest] = without(seatAdj, s);
    line = line && deg <= 2;
    ring = ring && deg === 2;
    for (let p = 0; p < N; p++) {
      if (deg <= count(riderAdj[p]) && order <= riderComponent[p] && riderWithout[p][0] <= pieces && largest <= riderWithout[p][1]) cand[s] |= bit(p);
    }
    if (!cand[s]) return { answer: 'no', seating: null };
  }

  if (line) {
    /* ends[subset]: the riders a path through exactly that subset can end on. */
    const ends = new Int32Array(2 ** N);
    for (let p = 0; p < N; p++) if (!ring || p === 0) ends[bit(p)] = bit(p);
    let answer = 'no';
    for (let sub = 1; sub <= all >>> 0; sub++) {
      if ((sub & 1023) === 0 && Date.now() > deadline) return { answer: 'unknown', seating: null };
      if (!ends[sub]) continue;
      if (sub === all >>> 0) { if (!ring || (ends[sub] & riderAdj[0])) answer = 'yes'; break; }
      let rest = all & ~sub;
      while (rest) {
        const v = first(rest);
        rest &= rest - 1;
        if (riderAdj[v] & ends[sub]) ends[(sub | bit(v)) >>> 0] |= bit(v);
      }
    }
    if (answer === 'no') return { answer, seating: null };
    /* Walk the path back, along the line of seats from one end. */
    const mapping = Array(N).fill(-1);
    let left = all, end = ends[all >>> 0];
    if (ring) end &= riderAdj[0];
    let p = first(end), s = 0, visited = 0;
    if (!ring && N > 1) while (count(seatAdj[s]) !== 1) s++;
    for (;;) {
      mapping[s] = p;
      left &= ~bit(p);
      visited |= bit(s);
      if (!left) break;
      p = first(ends[left >>> 0] & riderAdj[p]);
      s = first(seatAdj[s] & ~visited);
    }
    return done(mapping);
  }

  const augment = (s, c, matched, seen) => {
    let opts = c[s] & ~seen[0];
    while (opts) {
      const p = first(opts);
      opts &= opts - 1;
      if (seen[0] & bit(p)) continue;
      seen[0] |= bit(p);
      if (matched[p] < 0 || augment(matched[p], c, matched, seen)) { matched[p] = s; return true; }
    }
    return false;
  };
  /* Keep only the candidates some perfect matching uses: a matched pair,
     or an unmatched one on an alternating cycle. */
  const matching = c => {
    const matched = new Int32Array(N).fill(-1);
    for (let s = 0; s < N; s++) if (!augment(s, c, matched, [0])) return null;
    const reach = new Int32Array(N);
    for (let s = 0; s < N; s++) for (let p = 0; p < N; p++) if (c[s] & bit(p)) reach[s] |= bit(matched[p]);
    for (let k = 0; k < N; k++) for (let s = 0; s < N; s++) if (reach[s] & bit(k)) reach[s] |= reach[k];
    let changed = false;
    for (let s = 0; s < N; s++) {
      const was = c[s];
      for (let p = 0; p < N; p++) if (!(reach[matched[p]] & bit(s))) c[s] &= ~bit(p);
      if (c[s] !== was) changed = true;
    }
    return changed;
  };
  const prune = c => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let s = 0; s < N; s++) {
        let opts = c[s];
        while (opts) {
          const p = first(opts);
          opts &= opts - 1;
          let near = seatAdj[s], support = 0, held = true;
          while (near) {
            const t = first(near);
            near &= near - 1;
            const fit = c[t] & riderAdj[p];
            if (!fit) { held = false; break; }
            support |= fit;
          }
          if (!held || count(support) < count(seatAdj[s])) { c[s] &= ~bit(p); changed = true; }
        }
        if (!c[s]) return false;
      }
      const m = matching(c);
      if (m === null) return false;
      if (m) changed = true;
    }
    return true;
  };
  const failed = new Set();
  let mapping = null;
  const search = c => {
    if (late()) return 'unknown';
    if (!prune(c)) return 'no';
    let branch = -1, fewest = N + 1, most = -1;
    for (let s = 0; s < N; s++) {
      const k = count(c[s]), deg = count(seatAdj[s]);
      if (k > 1 && (k < fewest || (k === fewest && deg > most))) { branch = s; fewest = k; most = deg; }
    }
    if (branch < 0) { mapping = [...c].map(first); return 'yes'; }
    const key = c.join(',');
    if (failed.has(key)) return 'no';
    let opts = c[branch];
    while (opts) {
      /* The rider leaving the neighboring seats the most candidates first. */
      let pick = -1, best = -1;
      for (let p = 0; p < N; p++) {
        if (!(opts & bit(p))) continue;
        let score = 0;
        for (let t = 0; t < N; t++) if (seatAdj[branch] & bit(t)) score += count(c[t] & riderAdj[p]);
        if (score > best) { pick = p; best = score; }
      }
      opts &= ~bit(pick);
      /* A rider interchangeable with the pick, here, need not be tried. */
      for (let q = 0; q < N; q++) {
        const pair = bit(pick) | bit(q);
        if (!(opts & bit(q)) || ((riderAdj[pick] ^ riderAdj[q]) & ~pair)) continue;
        if (c.every(x => !(x & pair) || (x & pair) === pair)) opts &= ~bit(q);
      }
      const next = Int32Array.from(c);
      next[branch] = bit(pick);
      const r = search(next);
      if (r !== 'no') return r;
    }
    if (failed.size > 1 << 16) failed.clear();
    failed.add(key);
    return 'no';
  };
  const r = search(cand);
  return r === 'yes' ? done(mapping) : { answer: r, seating: null };
}

/* The most of the band that can sit together: { seating (band index or
   -1 by seat), seated, proven }, proven false when a larger seating was
   given up on rather than ruled out. */
function zbFerrySeatBand(band, neighbors, deadline = Infinity) {
  const engine = zbFerryEngine(band, neighbors);
  let proven = true;
  for (let seatCount = Math.min(band.length, neighbors.length); seatCount > 0; seatCount--) {
    let seating = null;
    const r = engine.run(seatCount, ZB_FERRY_QUICK, deadline, s => { seating = s; return true; });
    if (seating) return { seating, seated: seatCount, proven };
    if (!r.gaveUp) continue;
    const m = zbFerryMatch(band, neighbors, seatCount, deadline);
    if (m.seating) return { seating: m.seating, seated: neighbors.length - m.seating.filter(x => x < 0).length, proven };
    if (m.answer === 'unknown') proven = false;
  }
  return { seating: Array(neighbors.length).fill(-1), seated: 0, proven };
}

/* The most seats with no two next to each other, and one such set. */
const zbFerryApartRead = new WeakMap();
function zbFerryApart(neighbors) {
  if (zbFerryApartRead.has(neighbors)) return zbFerryApartRead.get(neighbors);
  const S = neighbors.length, mask = neighbors.map(ns => ns.reduce((a, m) => a | 1 << m, 0));
  let best = 0, bestSet = 0;
  /* Seats in order, each taken or not, taking none next to one taken. */
  const go = (k, set, count, banned) => {
    if (count + (S - k) <= best) return;
    if (k === S) { best = count; bestSet = set; return; }
    if (!(banned >> k & 1)) go(k + 1, set | 1 << k, count + 1, banned | mask[k]);
    go(k + 1, set, count, banned);
  };
  go(0, 0, 0, 0);
  const out = { most: best, seats: [...Array(S).keys()].filter(k => bestSet >> k & 1) };
  zbFerryApartRead.set(neighbors, out);
  return out;
}

/* The number of ways to seat the whole band on a raft that is one line
   (each seat next to one or two, and the band fills it): orderings along
   the line in which each two in a row share a trait, two alike Zoombinis
   counted as one. null if the raft is not one line, or the band does not
   fill it. */
function zbFerryLineWays(band, neighbors) {
  const S = neighbors.length, n = band.length;
  if (n !== S || n > 20 || neighbors.some(ns => ns.length > 2) || neighbors.flat().length !== 2 * (S - 1)) return null;
  const end = neighbors.findIndex(ns => ns.length === 1);
  if (end < 0) return null;
  const share = band.map(a => band.map(b => zbFerryShare(a, b)));
  /* Paths through every Zoombini: ways[mask][last]. */
  const full = (1 << n) - 1, ways = new Float64Array((full + 1) * n);
  for (let z = 0; z < n; z++) ways[(1 << z) * n + z] = 1;
  for (let mask = 1; mask <= full; mask++) for (let last = 0; last < n; last++) {
    const w = ways[mask * n + last];
    if (!w) continue;
    for (let z = 0; z < n; z++) if (!(mask >> z & 1) && share[last][z]) ways[(mask | 1 << z) * n + z] += w;
  }
  let total = 0;
  for (let last = 0; last < n; last++) total += ways[full * n + last];
  const counts = new Map();
  for (const z of band) counts.set(zbZoombiniId(z), (counts.get(zbZoombiniId(z)) || 0) + 1);
  for (const c of counts.values()) for (let k = 2; k <= c; k++) total /= k;
  return Math.round(total);
}

/* Seats in words: rows from the back of the raft (the top of the
   picture), seats from the left. */
function zbFerrySeatPlaces(seats) {
  const ys = [...new Set(seats.map(s => s.y))].sort((a, b) => a - b);
  return seats.map(({ x, y }) => {
    const row = ys.indexOf(y);
    const col = seats.filter(s => s.y === y && s.x < x).length;
    return { row: row + 1, seat: col + 1 };
  });
}

/* ---- the workbench: solving the raft, and drawing it ------------------ */

/* The traits two Zoombinis share, as { kind, value }, hair first. */
function zbFerryShared(a, b) { return ZB_TRAIT_KINDS.filter(k => a[k] === b[k]).map(kind => ({ kind, value: a[kind] })); }
/* A seating's neighbor pairs, both seated: [{ a, b, shared }], seat
   indices a < b. */
function zbFerryLinks(band, neighbors, seating) {
  const out = [];
  neighbors.forEach((ns, a) => ns.forEach(b => {
    if (a < b && seating[a] >= 0 && seating[b] >= 0) out.push({ a, b, shared: zbFerryShared(band[seating[a]], band[seating[b]]) });
  }));
  return out;
}

/* The raft drawn: its seats and which are next to which, the band in
   their seats, each two seated neighbors' link showing a trait they
   share (in the warning color when it is the only one), and those left
   on the dock, faded. */
function zbFerryDiagram(band, state, seating, caption) {
  const W = 800, H = 500, items = [], seats = state.seats, nb = state.seatNeighborIndices;
  const cx = seats.map(s => s.x + s.w / 2), cy = seats.map(s => s.y + s.h / 2);
  const x0 = Math.min(...cx), x1 = Math.max(...cx), y0 = Math.min(...cy), y1 = Math.max(...cy);
  const kx = Math.min(3.2, 680 / Math.max(1, x1 - x0)), ky = Math.min(2.4, 280 / Math.max(1, y1 - y0));
  const X = k => 60 + (cx[k] - x0) * kx + (680 - (x1 - x0) * kx) / 2, Y = k => 96 + (cy[k] - y0) * ky;
  items.push({ t: 'rect', x: 0, y: 36, w: W, h: H - 36, fill: 'water' });
  items.push({ t: 'rect', x: Math.min(...seats.map((_, k) => X(k))) - 40, y: 60, w: (x1 - x0) * kx + 80, h: (y1 - y0) * ky + 76, r: 10, fill: 'wood', stroke: 'line' });
  /* A seat is a dark plate, which the Zoombini stands on and its number
     is written on. */
  for (let k = 0; k < seats.length; k++) items.push({ t: 'rect', x: X(k) - 20, y: Y(k) + 14, w: 40, h: 20, r: 4, fill: 'panel', stroke: 'line' });
  const links = [];
  nb.forEach((ns, a) => ns.forEach(b => {
    if (a > b) return;
    const both = seating[a] >= 0 && seating[b] >= 0;
    const shared = both ? zbFerryShared(band[seating[a]], band[seating[b]]) : [];
    items.push({ t: 'line', x1: X(a), y1: Y(a) - 6, x2: X(b), y2: Y(b) - 6, stroke: both ? (shared.length === 1 ? 'warn' : 'good') : 'line', width: both ? 2.5 : 1.5, dash: both ? null : '4 4' });
    if (both) links.push({ x: (X(a) + X(b)) / 2, y: (Y(a) + Y(b)) / 2 - 6, shared });
  }));
  seating.forEach((z, k) => { if (z >= 0) items.push({ t: 'zoombini', i: z, x: X(k), y: Y(k) + 16 }); });
  for (const l of links) {
    items.push({ t: 'circle', x: l.x, y: l.y, r: 13, fill: 'panel', stroke: l.shared.length === 1 ? 'warn' : 'good' });
    items.push({ t: 'trait', kind: l.shared[0].kind, value: l.shared[0].value, x: l.x, y: l.y, scale: 0.8 });
    if (l.shared.length > 1) items.push({ t: 'text', x: l.x + 14, y: l.y - 8, text: `+${l.shared.length - 1}`, size: 10, fill: 'good' });
  }
  const behind = band.map((_, i) => i).filter(i => !seating.includes(i));
  items.push({ t: 'rect', x: 0, y: H - 64, w: W, h: 64, fill: 'wood' }, { t: 'rect', x: 0, y: H - 14, w: W, h: 14, fill: 'panel' });
  items.push({ t: 'text', x: W - 10, y: H - 48, text: behind.length ? 'the dock' : 'the dock, empty', size: 11, anchor: 'end', fill: 'ink' });
  items.push(...zbDiagramRows(behind, 30, H - 16, 20, 36, 0, { faded: true }));
  items.push({ t: 'text', x: 10, y: 24, text: caption, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}

ZB_PUZZLES.set('FERRY', {
  archive: 'FERRY',
  about: 'The band sits on Captain Cajun’s raft, one Zoombini at a time. The captain only lets a Zoombini sit next to others that share something with it.',
  levels: [
    { rule: 'A Zoombini may sit only where it shares at least one trait (hair, eyes, nose or feet) with every Zoombini next to it. The 16 seats form a single line, two rows of seven joined at one end, so each seat has one or two neighbors.',
      chances: 'As many tries as it takes. The captain sends back a Zoombini that does not fit, and nothing is counted. The raft leaves with those seated. Any Zoombinis the player cannot seat stay behind.' },
    { rule: 'The same rule, on 16 seats in two rows of eight. Each seat is next to the seats on either side and the one in front or behind, so it has up to three neighbors.',
      chances: 'As many tries as it takes, as at every level.' },
    { rule: 'The same rule, on four rows of four. Each seat is next to the seats on either side, in front and behind, so it has up to four neighbors.',
      chances: 'As many tries as it takes, as at every level.' },
    { rule: 'The same rule, on four uneven rows of four. At this level the program also counts the seats diagonally in front and behind as neighbors, so a seat has up to six.',
      chances: 'As many tries as it takes, as at every level.' },
  ],
  /* Nothing on the raft is the program's to choose. */
  form(level, band, state) {
    return [{ key: 'note', kind: 'note', note: `The program chooses nothing here. The raft is SCRB ${state.seatLayoutScrbId}, the one for ${band.length} Zoombinis at this level, and the rule is the same at every level.` }];
  },
  edit(level, band, state) { return Object.assign({}, state, { edited: true }); },
  solve(level, band, state, arc, opts = {}) {
    const n = band.length, budget = opts.budget || 1500, t0 = Date.now();
    const nb = state.seatNeighborIndices, places = state.seats;
    const found = zbFerrySeatBand(band, nb, t0 + budget * 0.4);
    const most = found.seated, engine = zbFerryEngine(band, nb), apart = zbFerryApart(nb);
    /* The seatings: one with no two side by side if the band is small
       enough, then those the search finds, strongest links first. */
    const list = [];
    if (most <= apart.most) {
      const seating = Array(nb.length).fill(-1);
      apart.seats.slice(0, most).forEach((s, k) => { seating[s] = k; });
      list.push(seating);
    }
    engine.run(most, 2e6, t0 + budget * 0.45, sg => { list.push(sg); return list.length >= 300; }, true);
    if (!list.length) list.push(found.seating);
    const score = sg => {
      const links = zbFerryLinks(band, nb, sg);
      return { sg, links, singles: links.filter(l => l.shared.length === 1) };
    };
    const better = (a, b) => a.singles.length - b.singles.length || a.links.length - b.links.length;
    let scored = list.map(score).sort(better);
    /* Each of the best few made simpler while it can be: a Zoombini moved
       to an empty seat, or two swapped, where every pair of neighbors still shares a trait. */
    const fitsAt = (sg, z, s, gone) => nb[s].every(t => t === gone || sg[t] < 0 || zbFerryShare(band[z], band[sg[t]]));
    const improve = x => {
      for (let again = true; again && Date.now() < t0 + budget * 0.7;) {
        again = false;
        for (let a = 0; a < nb.length && !again; a++) {
          if (x.sg[a] < 0) continue;
          for (let e = 0; e < nb.length && !again; e++) {
            if (e === a) continue;
            const sg = x.sg.slice();
            if (sg[e] < 0) {
              if (!fitsAt(sg, sg[a], e, a)) continue;
              sg[e] = sg[a]; sg[a] = -1;
            } else {
              const za = sg[a], ze = sg[e];
              sg[a] = -1; sg[e] = -1;
              if (!fitsAt(sg, za, e, -1) || !fitsAt(sg, ze, a, -1)) continue;
              if (nb[a].includes(e) && !zbFerryShare(band[za], band[ze])) continue;
              sg[a] = ze; sg[e] = za;
            }
            const y = score(sg);
            if (better(y, x) < 0) { x = y; again = true; }
          }
        }
      }
      return x;
    };
    scored = [...scored.slice(0, 24).map(improve), ...scored].sort(better);
    /* A dozen, simplest first, each unlike those before it in four seats
       or more when there are enough seatings. */
    const seen = new Set(), pick = [];
    const apartFrom = x => pick.every(p => x.sg.filter((z, s) => z < 0 ? p.sg[s] >= 0 : p.sg[s] < 0 || zbZoombiniId(band[z]) !== zbZoombiniId(band[p.sg[s]])).length >= 4);
    for (const pass of [true, false]) {
      for (const x of scored) {
        const key = x.sg.map(z => z < 0 ? '-' : zbZoombiniId(band[z])).join(',');
        if (seen.has(key) || (pass && !apartFrom(x))) continue;
        seen.add(key); pick.push(x);
        if (pick.length === 12) break;
      }
      if (pick.length === 12) break;
    }
    pick.sort((a, b) => a.singles.length - b.singles.length || a.links.length - b.links.length);
    /* The ways: exact on a line filled end to end, else counted while
       the budget lasts. */
    let ways = most === n ? zbFerryLineWays(band, nb) : null, counted = true;
    if (ways == null) {
      let count = 0;
      const r = engine.run(most, 4e6, t0 + budget * 0.95, () => { count++; return false; });
      if (r.gaveUp) { counted = false; ways = null; } else ways = count;
      if (!counted) ways = null;
    }
    const rows = Math.max(...places.map(p => p.row));
    const describe = (x, k) => {
      const seated = x.sg.filter(z => z >= 0).length;
      const steps = [];
      for (let r = 1; r <= rows; r++) {
        const inRow = [...places.keys()].filter(s => places[s].row === r).sort((a, b) => places[a].seat - places[b].seat);
        steps.push(`Row ${r}, from the left, has ${zbWordsOr(inRow.map(s => x.sg[s] < 0 ? 'an empty seat' : String(x.sg[s] + 1)), 'and')}.`);
      }
      if (!x.links.length) steps.push('No two of them sit side by side, so the captain has nothing to check.');
      else if (!x.singles.length) steps.push(`All ${x.links.length} pairs side by side share two or more traits.`);
      else {
        const said = x.singles.slice(0, 6).map(l => `${zbTraitWith(l.shared[0].kind, l.shared[0].value)} joins ${x.sg[l.a] + 1} and ${x.sg[l.b] + 1}`);
        steps.push(`Of the ${x.links.length} pairs side by side, ${x.singles.length} share${x.singles.length === 1 ? 's' : ''} only one trait (${zbWordsOr(said, 'and')}${x.singles.length > 6 ? `, and ${x.singles.length - 6} more` : ''}).`);
      }
      const behind = band.map((_, i) => i).filter(i => !x.sg.includes(i));
      if (behind.length) steps.push(`Zoombini${behind.length > 1 ? 's' : ''} ${zbPlacesWords(behind)} stay${behind.length > 1 ? '' : 's'} on the dock.`);
      const title = `${seated === n ? `All ${n}` : `${seated} of ${n}`} seated, ` + (!x.links.length ? 'none side by side'
        : `${x.links.length} pair${x.links.length === 1 ? '' : 's'} side by side, ${x.singles.length || 'none'} sharing one trait only`);
      return { title, steps, crosses: x.sg.filter(z => z >= 0).sort((a, b) => a - b), diagram: zbFerryDiagram(band, state, x.sg, title) };
    };
    return {
      most, exact: found.proven, ways,
      solutions: pick.map(describe),
      notes: [
        'To cross, a Zoombini must be seated on the raft when it leaves. Any still on the dock stay behind.',
        'The rule is the same at every level. Every two Zoombinis seated side by side must share a trait. The seating order does not matter, and swapping two Zoombinis that look alike gives the same seating.',
        'The simplest seating has the fewest neighbors who share only one trait, then the fewest neighbors of any kind. A band small enough to sit with no two side by side needs no matching. On this raft, that is a band of up to ' + apart.most + '.',
        ways != null ? `There ${ways === 1 ? 'is 1 seating' : `are ${ways} seatings`} of ${most}, counting Zoombinis that look alike as one.` : 'There are too many seatings to count in the time allowed.',
        ...(found.proven ? (most < n ? [`No seating fits more than ${most} of the ${n}, because the search ruled out every larger one.`] : [])
          : [`The search stopped before finding a seating of more than ${most}. More may be possible.`]),
      ],
    };
  },
  /* The raft and the rule involve no random number, so the deal draws nothing from rnd. */
  deal(level, band, rnd, journey, arc) {
    const n = band.length;
    const script = zbFerryRaftScript(level, n);
    const seats = zbFerryRaft(arc, script);
    const neighbors = zbFerryNeighbors(seats, level);
    const places = zbFerrySeatPlaces(seats);
    const found = zbFerrySeatBand(band, neighbors);
    const seatOf = Array(n).fill(-1);
    found.seating.forEach((z, s) => { if (z >= 0) seatOf[z] = s; });
    const where = s => `row ${places[s].row}, seat ${places[s].seat}`;

    const answer = ['A Zoombini sits only where it shares a trait with every Zoombini already seated next to it.'];
    if (found.seated === n) answer.push(`All ${n} can be seated. Here is one way, with rows counted from the back of the raft and seats from the left.`);
    else answer.push(`${found.proven ? 'At most' : 'The search seated'} ${found.seated} of the ${n}, and ${n - found.seated === 1 ? 'one stays' : `${n - found.seated} stay`} behind. Here is one such seating, with rows from the back and seats from the left.`);
    const rows = Math.max(...places.map(p => p.row));
    for (let r = 1; r <= rows; r++) {
      const inRow = [...seats.keys()].filter(s => places[s].row === r).sort((a, b) => places[a].seat - places[b].seat);
      answer.push(`Row ${r}: ` + inRow.map(s => found.seating[s] < 0 ? 'empty' : zbZoombiniWords(band[found.seating[s]])).join('; ') + '.');
    }
    return {
      setup: [`A raft of ${seats.length} seats (SCRB ${script}) and ${n} Zoombinis on the dock.`],
      answer,
      marks: band.map((z, i) => seatOf[i] < 0 ? null : where(seatOf[i])),
      state: {
        seatLayoutScrbId: script,
        seats: seats.map((seat, s) => ({ ...seat, ...places[s] })),
        seatNeighborIndices: neighbors,
        seating: found.seating,
        seated: found.seated,
        proven: found.proven,
      },
    };
  },
  source: 'ScummVM’s puzzle_ferry.cpp, checked against the program’s code, with the rafts from FERRY.MHK.',
});
