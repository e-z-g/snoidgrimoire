// Captain Cajun's Ferryboat (js/zb-puzzle-ferry.js) against ScummVM's
// puzzle_ferry.cpp and .h, the 1996 program and FERRY.MHK:
//
//   - the script for a level and band is ScummVM's 1510 + 5 x (level - 1)
//     + (band - 16), with bands outside 16-20 given 16; ZOOMBINI.EXE adds
//     1510, 1515, 1520 and 1525 to the band's offset in one place;
//   - the port reads every raft, FERRY SCRB 1510-1529, as ScummVM places
//     it: the first frame's seat shapes in order (1-3, 20 at most), each
//     seat the rectangle of its picture (FERRY tBMP 1500, decoded in full
//     here) at its corner, SCRB 1500-1502 each drawing their seat once;
//     a FERRY without them fails with its own error;
//   - the neighbours are found again here from ScummVM's own three
//     stretched rectangles, read from its text, for every raft, and agree
//     with the port's; ScummVM wants every occupied neighbour to share a
//     trait and counts no chances;
//   - over bands of 16, 15, 12, 8 and 5 at each level, every seating the
//     deal gives has each two seated neighbours sharing a trait, seats
//     each member once at most, the marks name the seats, and a band no
//     larger than the raft's largest set of seats with no two neighbours
//     is always seated whole.
export default function check({ S, fail, say, scumm, exe, need, bands, find, open }) {
  const h = scumm('zoombini_pages/puzzle_ferry.h'), cpp = scumm('zoombini_pages/puzzle_ferry.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('FERRY');

  // ---- the raft for a level and band -----------------------------------------
  const base = Number(need(/kResScrb1510_SeatingBase = (\d+),/, h, 'kResScrb1510_SeatingBase')[1]);
  const per = Number(need(/kResScrb1510_SeatingBase \+ \(\(_difficultyLevel - 1\) \* (\d+)\)/, cpp, 'the raft\'s script')[1]);
  const [lo, hi, dflt] = need(/if \(zmbCount < (\d+) \|\| (\d+) < zmbCount\)\s*zmbCount = (\d+);/, cpp, 'the band\'s clamp').slice(1).map(Number);
  need(/_seatLayoutScrbId = scrbBase \+ \(zmbCount - 16\);/, cpp, 'the raft\'s script');
  for (let level = 1; level <= 4; level++) for (let n = 1; n <= 22; n++) {
    const want = base + per * (level - 1) + ((n < lo || n > hi ? dflt : n) - 16);
    if (S.zbFerryRaftScript(level, n) !== want) { fail(`level ${level}, band ${n}: raft ${S.zbFerryRaftScript(level, n)}, ScummVM ${want}`); break; }
  }
  // ZOOMBINI.EXE: add si, 1510 / 1515 / 1520 / 1525, each followed by a short jump.
  const adds = [0, 1, 2, 3].map(l => base + per * l);
  const at = [];
  for (let o = exe.indexOf(0x81); o >= 0; o = exe.indexOf(0x81, o + 1)) {
    if (adds.every((v, k) => exe[o + 6 * k] === 0x81 && exe[o + 6 * k + 1] === 0xc6 && exe[o + 6 * k + 2] === (v & 255) && exe[o + 6 * k + 3] === v >> 8 && exe[o + 6 * k + 4] === 0xeb)) at.push(o);
  }
  if (at.length !== 1) fail(`ZOOMBINI.EXE adds ${adds} in ${at.length} places, not one`);

  // ---- the seats, read from FERRY ------------------------------------------------------
  // Read again here, with the full picture decoder and the check's own
  // reading of the scripts, and held to what the port reads.
  const arc = open('FERRY');
  const sheetId = Number(need(/kResBitmapShape1500_Seats = (\d+),/, h, 'kResBitmapShape1500_Seats')[1]);
  const seatBase = Number(need(/kResScrb1500_SeatBase = (\d+),/, h, 'kResScrb1500_SeatBase')[1]);
  if (S.ZB_FERRY_SEAT.sheet !== sheetId || S.ZB_FERRY_SEAT.scripts !== seatBase) fail(`the port draws seats from tBMP ${S.ZB_FERRY_SEAT.sheet} by SCRB ${S.ZB_FERRY_SEAT.scripts}, ScummVM ${sheetId} by ${seatBase}`);
  const [shapeLo, shapeHi] = need(/if \((\d+) <= shapeId && shapeId <= (\d+) && \(_drawOnRegCount - seatCountBefore\) < (\d+)\)/, cpp, 'the seats\' shapes').slice(1, 3).map(Number);
  const cap = Number(need(/shapeId <= \d+ && \(_drawOnRegCount - seatCountBefore\) < (\d+)\)/, cpp, 'the most seats')[1]);
  if (!same(S.ZB_FERRY_SEAT.shapes, [shapeLo, shapeHi]) || S.ZB_FERRY_SEAT.most !== cap) fail(`the port's seats are shapes ${S.ZB_FERRY_SEAT.shapes}, at most ${S.ZB_FERRY_SEAT.most}; ScummVM's ${shapeLo}-${shapeHi}, at most ${cap}`);
  const frames = S.decodeBitmapResource(arc.get('tBMP', sheetId)).frames;
  const seatScripts = [];
  for (let k = shapeLo; k <= shapeHi; k++) seatScripts.push(S.parseScript(arc.get('SCRB', seatBase + k - 1), 'SCRB').frames[0].records);
  if (seatScripts.some((r, k) => r.length !== 1 || r[0].shape !== k + shapeLo)) fail(`SCRB ${seatBase}-${seatBase + shapeHi - 1} do not each draw their seat once`);
  const scripts = [];
  for (let l = 0; l < 4; l++) for (let n = lo; n <= hi; n++) scripts.push([l + 1, base + per * l + n - 16]);
  const read = new Map();
  for (const [, id] of scripts) {
    const theirs = S.parseScript(arc.get('SCRB', id), 'SCRB').frames[0].records.filter(r => r.shape >= shapeLo && r.shape <= shapeHi).slice(0, cap)
      .map(r => ({ x: r.x, y: r.y, w: frames[r.shape - 1].width, h: frames[r.shape - 1].height }));
    read.set(id, theirs);
    if (!same(S.zbFerryRaft(arc, id), theirs)) fail(`the port's reading of FERRY SCRB ${id} is not the seats' corners and pictures`);
  }
  const sizes = [...new Set([...read.values()].flat().map(s => `${s.w} x ${s.h}`))];
  // Without the rafts the deal says what is missing.
  const bare = { has: () => false, get: () => { throw new Error('no resource'); } };
  try { P.deal(1, bands(1, 1)[0].band, S.zbRandom(1), {}, bare); fail('a FERRY without SCRB 1510 deals anyway'); } catch (e) { if (!/SCRB 1510/.test(e.message)) fail(`a FERRY without SCRB 1510 fails with "${e.message}"`); }

  // ---- the neighbours, from ScummVM's rectangles --------------------------------------
  const less = Number(need(/const int16 halfHeight = MAX<int16>\(0, \(rectK\.bottom - rectK\.top\) \/ 2 - (\d+)\);/, cpp, 'halfHeight')[1]);
  const coeff = t => t === '' ? 0 : t === ' + halfHeight' ? 1 : t === ' - halfHeight' ? -1 : NaN;
  const tests = [...cpp.matchAll(/Common::Rect expandedK\(rectK\.left((?: [+-] halfHeight)?), rectK\.top((?: [+-] halfHeight)?), rectK\.right((?: [+-] halfHeight)?), rectK\.bottom((?: [+-] halfHeight)?)\);/g)].map(m => m.slice(1, 5).map(coeff));
  if (tests.length !== 3 || tests.flat().some(Number.isNaN)) fail(`read ${tests.length} stretched rectangles from buildAdjacencyMatrix, not 3`);
  need(/if \(!adjacent && kPuzzleLevel4 <= _difficultyLevel\) \{\s*Common::Rect expandedK/, cpp, 'the third rectangle\'s level');
  const most = Number(need(/if \(adjacent && slotCount < (\d+)\)/, cpp, 'the most neighbours')[1]);
  if (most !== S.ZB_FERRY_SEAT.neighbours) fail(`ScummVM keeps ${most} neighbours a seat, the port ${S.ZB_FERRY_SEAT.neighbours}`);
  const edges = [];
  for (const [level, id] of scripts) {
    const seats = read.get(id);
    const mine = S.zbFerryNeighbours(S.zbFerryRaft(arc, id), level);
    const theirs = seats.map((K, k) => {
      const out = [], hh = Math.max(0, Math.trunc(K.h / 2) - less);
      seats.forEach((M, m) => {
        if (m === k || out.length >= most) return;
        const hit = tests.slice(0, level === 4 ? 3 : 2).some(c => {
          const R = [K.x + c[0] * hh, K.y + c[1] * hh, K.x + K.w + c[2] * hh, K.y + K.h + c[3] * hh];
          return R[0] < M.x + M.w && M.x < R[2] && R[1] < M.y + M.h && M.y < R[3];
        });
        if (hit) out.push(m);
      });
      return out;
    });
    if (!same(mine, theirs)) fail(`SCRB ${id}, level ${level}: the port's neighbours are not ScummVM's`);
    if (mine.some((ns, k) => ns.some(m => !mine[m].includes(k)))) fail(`SCRB ${id}: a seat is next to one that is not next to it`);
    if (id === base + per * (level - 1)) edges.push(mine.flat().length / 2);
  }

  // ---- the rule and the chances ------------------------------------------------------
  const judge = need(/bool ZoombiniPuzzleFerry::testAdjacentMatch\([\s\S]*?\n\}\n/, cpp, 'testAdjacentMatch')[0];
  need(/for \(int16 slot = 0; slot < 8 && valid; slot\+\+\)[\s\S]*?valid = false;\s*for \(int16 traitIdx = 0; traitIdx < 4; traitIdx\+\+\) \{\s*if \(droppedSnoid->_trait\[traitIdx\] == neighborSnoid->_trait\[traitIdx\]\)/, judge, 'every neighbour sharing a trait');
  need(/ZmbChanceInfo ZoombiniPuzzleFerry::debugGetChances\(\) const \{[\s\S]*?ZmbChanceType::kInfinite/, cpp, 'debugGetChances');
  if (!/As many tries as it takes/.test(P.levels[0].chances)) fail('the chances do not say there is no limit');

  // ---- deals -------------------------------------------------------------------------
  // The most seats with no two neighbours: any band that size or smaller sits whole.
  const alpha = [0, 1, 2, 3].map(l => {
    const nb = S.zbFerryNeighbours(S.zbFerryRaft(arc, base + per * l), l + 1), mask = nb.map(ns => ns.reduce((a, m) => a | 1 << m, 0));
    let best = 0;
    for (let set = 0; set < 1 << nb.length; set++) {
      let ok = true, c = 0;
      for (let k = 0; k < nb.length && ok; k++) if (set >> k & 1) { c++; if (set & mask[k]) ok = false; }
      if (ok && c > best) best = c;
    }
    return best;
  });
  // The rule, written here again rather than taken from the port.
  const share = (a, b) => ['hair', 'eyes', 'nose', 'feet'].some(k => a[k] === b[k]);
  let dealt = 0, whole = 0, unproven = 0, firstBad = null;
  const bad = m => { if (!firstBad) firstBad = m; };
  for (let level = 1; level <= 4 && !firstBad; level++) {
    for (const { band, seed } of bands(150, 300 + level, [16, 15, 12, 8, 5])) {
      const n = band.length, d = P.deal(level, band, S.zbRandom(seed), {}, arc), s = d.state;
      const nb = s.seatNeighborIndices;
      const members = s.seating.filter(z => z >= 0);
      if (new Set(members).size !== members.length || members.some(z => z >= n) || members.length !== s.seated) bad(`level ${level}: a Zoombini is seated twice, or the count is wrong`);
      s.seating.forEach((z, k) => {
        if (z < 0) return;
        for (const m of nb[k]) if (s.seating[m] >= 0 && !share(band[z], band[s.seating[m]])) bad(`level ${level}: seats ${k} and ${m} are neighbours sharing no trait`);
      });
      d.marks.forEach((m, i) => {
        const k = s.seating.indexOf(i);
        if (k < 0 ? m !== null : m !== `row ${s.seats[k].row}, seat ${s.seats[k].seat}`) bad(`level ${level}: the mark "${m}" is not member ${i}'s seat`);
      });
      if (n <= alpha[level - 1] && s.seated !== n) bad(`level ${level}: a band of ${n} is not seated whole`);
      if (s.seated === n) whole++;
      if (!s.proven) unproven++;
      dealt++;
    }
  }
  if (firstBad) fail(firstBad);

  // ---- the workbench -----------------------------------------------------------
  // Nothing to choose: the form is a note and gives back nothing. Each
  // solution, read back from its words, seats each member once, every two
  // seated neighbours sharing a trait (the rule written again here), and
  // the diagram draws each member once. On a small raft (a raft's first
  // seats) and small bands, some of them sharing nothing with anyone,
  // every seating is tried here: the most and the count of seatings, alike
  // Zoombinis as one, are the solver's. On the level-1 line filled end to
  // end, a count of the ways the band can fill it decides whether all can
  // sit.
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  let solved = 0, brute = 0, bruteShort = 0, lines = 0, worstMs = 0, wb = null;
  const wbad = m => { if (!wb) wb = m; };
  const readBack = (so, st, n) => {
    const seating = Array(st.seats.length).fill(-1);
    for (const line of so.steps) {
      const m = /^Row (\d+), from the left: (.*)\.$/.exec(line);
      if (!m) continue;
      const items = m[2].split(/, | and /);
      const inRow = st.seats.map((p, k) => [p, k]).filter(([p]) => p.row === +m[1]).sort((a, b) => a[0].seat - b[0].seat);
      if (items.length !== inRow.length) wbad(`"${line}" names ${items.length} seats of ${inRow.length}`);
      items.forEach((it, j) => { if (it !== 'an empty seat' && inRow[j]) seating[inRow[j][1]] = +it - 1; });
    }
    return seating;
  };
  const legal = (band, nb, seating) => seating.every((z, k) => z < 0 || nb[k].every(m => seating[m] < 0 || share(band[z], band[seating[m]])));
  const summary = [];
  for (let level = 1; level <= 4 && !wb; level++) {
    for (const { band, seed } of bands(6, 500 + level, [16, 12, 9, 5])) {
      const n = band.length, d = P.deal(level, band, S.zbRandom(seed), {}, arc), st = d.state;
      const form = P.form(level, band, st, arc);
      if (form.some(f => f.kind !== 'note') || !same(valuesOf(P.form(level, band, P.edit(level, band, st, {}, arc), arc)), {})) { wbad(`level ${level}: the raft has something to choose`); break; }
      const t0 = Date.now(), sol = P.solve(level, band, st, arc, { budget: 500 }), ms = Date.now() - t0;
      worstMs = Math.max(worstMs, ms);
      if (!sol.solutions.length || sol.solutions.length > 12) { wbad(`level ${level}: ${sol.solutions.length} solutions`); break; }
      for (const so of sol.solutions) {
        const seating = readBack(so, st, n), who = seating.filter(z => z >= 0);
        if (new Set(who).size !== who.length || !legal(band, st.seatNeighborIndices, seating)) wbad(`level ${level}: "${so.title}" breaks the rule`);
        if (!same(who.slice().sort((a, b) => a - b), so.crosses)) wbad(`level ${level}: "${so.title}" says ${so.crosses.length} seated, its rows ${who.length}`);
        if (so.crosses.length > sol.most) wbad(`level ${level}: a solution seats more than the most`);
        const drawn = so.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
        if (!same(drawn, band.map((_, i) => i))) wbad(`level ${level}: "${so.title}" does not draw each Zoombini once`);
      }
      if (sol.solutions[0].crosses.length !== sol.most) wbad(`level ${level}: the simplest does not seat the most`);
      if (level === 1 && n === st.seats.length) {
        const ways = S.zbFerryLineWays(band, st.seatNeighborIndices);
        if (ways > 0 ? sol.most !== n || sol.ways !== ways : sol.most === n) wbad(`level 1: ${ways} ways to fill the line, and the solver seats ${sol.most} (${sol.ways} ways)`);
        lines++;
      }
      if (n === 16) summary.push(`${level}:${sol.most}${sol.exact ? '' : '?'}/${sol.ways == null ? '-' : sol.ways}`);
      solved++;
    }
  }
  // Small rafts, every seating tried.
  const loner = k => ({ hair: k, eyes: k, nose: k, feet: k });
  for (let level = 1; level <= 4 && !wb; level++) {
    const full = S.zbFerryRaft(arc, base + per * (level - 1));
    for (const [size, members] of [[6, 5], [7, 6], [7, 7]]) {
      const seats = full.slice(0, size), nb = S.zbFerryNeighbours(seats, level);
      const rnd = S.zbRandom(size * 31 + members + level);
      for (let trial = 0; trial < 4; trial++) {
        const band = S.zbDealBand(rnd, members).map((z, i) => i < trial ? loner(i + 1) : z);
        const places = S.zbFerrySeatPlaces(seats);
        const st = { seatLayoutScrbId: 0, seats: seats.map((x, k) => ({ ...x, ...places[k] })), seatNeighborIndices: nb };
        const sol = P.solve(level, band, st, null, { budget: 800 });
        // Every seating: each seat empty or one of the band not yet seated.
        let most = 0;
        const counts = new Map(), sg = Array(size).fill(-1), used = Array(members).fill(false);
        const go = k => {
          if (k === size) {
            const c = used.filter(Boolean).length;
            if (c > most) most = c;
            const key = sg.map(z => z < 0 ? '-' : S.zbZoombiniId(band[z])).join(',');
            if (!counts.has(c)) counts.set(c, new Set());
            counts.get(c).add(key);
            return;
          }
          go(k + 1);
          for (let z = 0; z < members; z++) {
            if (used[z] || nb[k].some(m => sg[m] >= 0 && !share(band[z], band[sg[m]]))) continue;
            sg[k] = z; used[z] = true; go(k + 1); sg[k] = -1; used[z] = false;
          }
        };
        go(0);
        if (!sol.exact || sol.most !== most) wbad(`a raft of ${size} at level ${level}: the solver seats ${sol.most} (exact ${sol.exact}), every seating tried ${most}`);
        if (sol.ways != null && sol.ways !== counts.get(most).size) wbad(`a raft of ${size} at level ${level}: ${sol.ways} ways, every seating tried ${counts.get(most).size}`);
        brute++;
        if (most < members) bruteShort++;
      }
    }
  }
  if (P.strategy) fail('Captain Cajun’s Ferryboat hides nothing from the player, and has a strategy');
  if (worstMs > 1000) fail(`a solve took ${worstMs} ms on a budget of 500`);
  if (wb) fail(wb);
  say(`${solved} solves read back and seated by the rule (bands of 16 as level:most/ways ${summary.join(' ')}; the slowest ${worstMs} ms), ${lines} full lines counted, ${brute} small rafts where every seating was tried agree (${bruteShort} of them unable to seat everyone)`);
  say(`rafts SCRB ${scripts[0][1]}-${scripts[scripts.length - 1][1]} read as ScummVM places them (seats ${sizes.join(', ')}; the sixteen-seat ones' ${adds.join(', ')} added at 0x${(at[0] || 0).toString(16)} in ZOOMBINI.EXE), ${edges.join(', ')} pairs of neighbours by ScummVM's rectangles; ${dealt} deals seated by the rule, ${whole} whole (${unproven} where the search gave up on a larger seating)`);
}
