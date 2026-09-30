// The Lion's Lair (js/zb-puzzle-caves.js) against ScummVM's
// puzzle_caves.cpp and .h and the 1996 program:
//
//   - the mistakes allowed at each level, the one or two traits, the first
//     stone at 21 - n, the clues each level shows and the first Lion's
//     Lair by nose are ScummVM's, read from its text;
//   - the stones' places (kSeatEntrancePositions) are in ZOOMBINI.EXE and
//     make one path, stone after stone, and the clues' places
//     (kRuleGlyphScreenX and Y) are there too, two rows of five, left to
//     right, which is how the port names them;
//   - level 4's tune, tMID 30028, is in both MIDI archives, and ScummVM
//     plays it only past its fix option;
//   - over bands of 16 down to 1 at each level, a judge written here from
//     findMatchingSeatNumber accepts each Zoombini on every stone its mark
//     names and on no other; the stones hold the band's groups in the
//     order drawn, as many as each has; the clues are the orders' values
//     at their places; and the one-shot changes the trait and nothing
//     else the deal draws.
import { site, archiveBytes } from '../load.mjs';

export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_caves.h'), cpp = scumm('zoombini_pages/puzzle_caves.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('CAVES');

  // ---- ScummVM's numbers ---------------------------------------------------
  const init = need(/void ZoombiniPuzzleCaves::initDifficultyParams\(\) \{([\s\S]*?)\n\}/, cpp, 'initDifficultyParams')[1];
  const limits = [...init.matchAll(/case kPuzzleLevel(\d):(?:\s*default:)?\s*_mistakeLimit = (\d+);/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (limits.length !== 4 || limits.some(([l, v]) => S.ZB_CAVES_MISTAKES[l - 1] !== v)) fail(`the mistakes allowed are not ScummVM's: ${JSON.stringify(limits)}`);
  const words = ['Four', 'Five', 'Six', 'Seven'];
  if (P.levels.some((l, i) => !l.chances.startsWith(`${words[i]} mistakes`))) fail('a level\'s chances do not name its mistakes');
  need(/_snoidDragEnabled = \(_mistakeCount != _mistakeLimit\);/, cpp, 'placing stopping at the last mistake');
  need(/return \{ZmbChanceInfo::ZmbChanceType::kMistake, _mistakeLimit, _mistakeCount/, cpp, 'debugGetChances');
  need(/_ruleTraitCount = \(_difficultyLevel <= kPuzzleLevel2\) \? 1 : 2;/, cpp, 'the traits per level');
  need(/_firstUsableSeatNumber = CLIP<int16>\(21 - _pageLoadedZmbCount, 1, 20\);/, cpp, 'the first stone');
  need(/const int16 firstDisplayedSeat = firstSeatNumber - (\d+);/, cpp, 'the debugger\'s stone numbers');
  if (S.ZB_CAVES_HIDDEN !== 4 || S.ZB_CAVES_SEATS !== 20) fail('the path is not twenty stones, the first four hidden');
  // Both rows are drawn at every level, and the one-shot is the third kind.
  const pattern = need(/void ZoombiniPuzzleCaves::initEntranceTraitPattern\(\) \{([\s\S]*?)\n\}/, cpp, 'initEntranceTraitPattern')[1];
  if (!/for \(int ruleRowIdx = 0; ruleRowIdx < 2; ruleRowIdx\+\+\) \{\s*\/\/ Selectable/.test(pattern)) fail('ScummVM no longer draws both rows at every level');
  const oneShot = Number(need(/if \(_vm->_cavesFirstRuleTraitPending\) \{\s*traitPoolIdx = (\d);/, pattern, 'the one-shot')[1]);
  const kinds = [...need(/enum TraitKind : byte \{([\s\S]*?)\};/, scumm('zoombini_state.h'), 'TraitKind')[1].matchAll(/kTrait(\w+) = (\d)/g)].map(m => [m[1].toLowerCase(), Number(m[2])]);
  if (!same(kinds.map(k => k[0]), S.ZB_TRAIT_KINDS) || S.ZB_TRAIT_KINDS[oneShot] !== 'nose') fail(`the one-shot's kind is ${S.ZB_TRAIT_KINDS[oneShot]}, the traits ${JSON.stringify(kinds)}`);
  // The clues.
  const dist = need(/void ZoombiniPuzzleCaves::distributeEntranceTraits\(\) \{([\s\S]*?)\n\}/, cpp, 'distributeEntranceTraits')[1];
  need(/case kPuzzleLevel1:[^\n]*\n\s*for \(int clueSlot = 1; clueSlot < 6; clueSlot\+\+\)\s*_ruleGlyphVisibility\[clueSlot\] = 1;/, dist, 'level 1\'s clues');
  if ([...dist.matchAll(/int16 numActive = _vm->_rnd->getRandomNumber\(2, 2\);/g)].length !== 2) fail('the clues are no longer two a row');
  need(/case kPuzzleLevel3: \{[\s\S]*?for \(int clueRowIdx = 0; clueRowIdx < 2; clueRowIdx\+\+\)/, dist, 'level 3\'s two rows');
  need(/default: \/\/ Level 4 leaves all entrances inactive\./, dist, 'level 4\'s bare wall');
  const shown = [5, 2, 4, 0];
  // The music.
  need(/if \(routeLevel < 3 \|\| ConfMan\.getBool\(MohawkMetaEngine_Zoombini::kOptionFixCavesL4MidiSilentBug\)\)/, cpp, 'the level 4 music');
  const base = Number(need(/kResMidi30025_CavesBgmBase = (\d+),/, h, 'the tunes\' base')[1]);
  const M = site({ files: ['js/mac-bytes.js', 'js/zb-mohawk.js'] });
  for (const a of ['MIDIMPC', 'MIDIMAC']) if (!M.openMohawk(archiveBytes(a)).has('tMID', base + 3)) fail(`${a} has no tMID ${base + 3}`);
  if (!P.levels[3].notes.some(n => n.includes(`tMID ${base + 3}`))) fail('level 4\'s notes do not name its tune');

  // ---- places ------------------------------------------------------------
  const points = body => [...body.matchAll(/Common::Point\((-?\d+), (-?\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const seats = points(need(/kSeatEntrancePositions\[20\]\{([\s\S]*?)\};/, h, 'kSeatEntrancePositions')[1]);
  const numbers = name => [...need(new RegExp(`${name}\\[11\\]\\{([\\s\\S]*?)\\};`), h, name)[1].matchAll(/-?\d+/g)].map(Number);
  const gx = numbers('kRuleGlyphScreenX'), gy = numbers('kRuleGlyphScreenY');
  const le16 = v => [v & 255, v >> 8 & 255];
  const atSeats = find(exe, seats.flatMap(([x, y]) => [...le16(x), ...le16(y)]));
  const atGlyphs = find(exe, [...gx, ...gy].flatMap(le16));
  if (seats.length !== 20 || atSeats.length !== 1) fail(`the stones' places are in ZOOMBINI.EXE ${atSeats.length} times, not once`);
  if (atGlyphs.length !== 1) fail(`the clues' places are in ZOOMBINI.EXE ${atGlyphs.length} times, not once`);
  // One path: each stone within 45 pixels of the next, and farther from the stone before it than that.
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (seats.some((p, i) => i && d(p, seats[i - 1]) > 45) || seats.some((p, i) => i > 1 && d(p, seats[i - 2]) < d(p, seats[i - 1]))) fail('the stones do not make one path in order');
  // Two rows of five, the first above, each left to right.
  const rowsOk = [1, 6].every(s => [1, 2, 3, 4].every(k => gx[s + k] > gx[s + k - 1])) && Math.max(...gy.slice(1, 6)) < Math.min(...gy.slice(6, 11));
  if (!rowsOk) fail('the clues are not two rows of five, the first above, left to right');

  // ---- deals -------------------------------------------------------------
  // The judge, from findMatchingSeatNumber: a drop stays when the seat is
  // in use, empty, and holds the Zoombini's values.
  const fits = (z, seat, st) => seat >= st.firstUsableSeatNumber && seat <= 20
    && st.seatPrimaryRuleValues[seat] === z[st.primaryRuleTraitKind]
    && (st.ruleTraitCount < 2 || st.seatSecondaryRuleValues[seat] === z[st.secondaryRuleTraitKind]);
  const stonesOf = m => { const r = /stones? (\d+)(?: to (\d+))?/.exec(m); return r ? [Number(r[1]), Number(r[2] || r[1])] : null; };
  let dealt = 0, runs = 0;
  const sizes = [16, 14, 12, 10, 8, 6, 4, 3, 2, 1];
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(300, 700 + level, sizes)) {
      const st = P.deal(level, band, S.zbRandom(seed), {}).state;
      const d2 = P.deal(level, band, S.zbRandom(seed), {});
      const bad = m => { fail(`level ${level}, a band of ${band.length}: ${m}`); return true; };
      if (!same(st, d2.state)) { bad('the same seed deals twice differently'); break; }
      const n = band.length, two = level >= 3;
      if (st.mistakeLimit !== S.ZB_CAVES_MISTAKES[level - 1] || st.ruleTraitCount !== (two ? 2 : 1) || st.firstUsableSeatNumber !== 21 - n) { bad('the level\'s numbers are wrong'); break; }
      const [o1, o2] = [st.ruleTraitValues.slice(0, 5), st.ruleTraitValues.slice(5)];
      if (!same([...o1].sort(), [1, 2, 3, 4, 5]) || !same([...o2].sort(), [1, 2, 3, 4, 5]) || st.primaryRuleTraitKind === st.secondaryRuleTraitKind) { bad('the orders are not two shuffles of two traits'); break; }
      // The stones: every seat in use filled, in the order drawn, each group as large as the band has.
      const used = [];
      for (let seat = 21 - n; seat <= 20; seat++) used.push(seat);
      const rank = seat => o1.indexOf(st.seatPrimaryRuleValues[seat]) * 5 + (two ? o2.indexOf(st.seatSecondaryRuleValues[seat]) : 0);
      if (used.some(seat => !st.seatPrimaryRuleValues[seat] || (two && !st.seatSecondaryRuleValues[seat]))
        || used.some((seat, i) => i && rank(seat) < rank(used[i - 1]))) { bad('the stones are not the band in the order drawn'); break; }
      const key = z => `${z[st.primaryRuleTraitKind]}/${two ? z[st.secondaryRuleTraitKind] : 0}`;
      const counts = new Map();
      for (const z of band) counts.set(key(z), (counts.get(key(z)) || 0) + 1);
      const d0 = P.deal(level, band, S.zbRandom(seed), {});
      let wrong = null;
      band.forEach((z, i) => {
        const fitting = used.filter(seat => fits(z, seat, st));
        const range = stonesOf(d0.marks[i]);
        const marked = range ? used.filter(seat => seat - 4 >= range[0] && seat - 4 <= range[1]) : [];
        if (!same(fitting, marked) || fitting.length !== counts.get(key(z))) wrong = `${S.zbZoombiniWords(z)} fits ${fitting}, marked ${d0.marks[i]}`;
      });
      if (wrong) { bad(wrong); break; }
      runs += new Set(band.map(key)).size;
      // The clues: how many each row shows, and what: the order's value at its place.
      const vis = st.ruleGlyphVisibility;
      const top = vis.slice(1, 6).filter(Boolean).length, below = vis.slice(6, 11).filter(Boolean).length;
      if (top + below !== shown[level - 1] || (level === 3 && (top !== 2 || below !== 2)) || (level < 3 && below)) { bad(`the wall shows ${top} and ${below}`); break; }
      const ki = k => S.ZB_TRAIT_KINDS.indexOf(k);
      if (vis.some((v, slot) => slot && (v ? st.ruleGlyphShapeIds[slot] !== (slot <= 5 ? o1[slot - 1] + 5 * ki(st.primaryRuleTraitKind) : o2[slot - 6] + 5 * ki(st.secondaryRuleTraitKind)) : st.ruleGlyphShapeIds[slot]))) { bad('a clue is not its order\'s value'); break; }
      // The one-shot: nose, the flag cleared, and every other draw the same.
      const journey = { cavesFirst: true };
      const f = P.deal(level, band, S.zbRandom(seed), journey).state;
      if (f.primaryRuleTraitKind !== 'nose' || journey.cavesFirst || !same(f.ruleTraitValues, st.ruleTraitValues) || !same(f.ruleGlyphVisibility, st.ruleGlyphVisibility)) { bad('the one-shot does more or less than set the nose'); break; }
      dealt++;
    }
  }
  if (!same(S.ZB_CAVES_SEAT_PLACES, seats)) fail('the diagram\'s stones are not ScummVM\'s kSeatEntrancePositions');

  // ---- the workbench -----------------------------------------------------
  // The rules a wall allows, all of them, for the brute force and the
  // walks: { kP, kS, o1, o2 }, the orders of all five values.
  const rulesFor = (level, st) => {
    const vis = st ? st.ruleGlyphVisibility : new Array(11).fill(0), out = [];
    const row = r => [1, 2, 3, 4, 5].filter(k => vis[r * 5 + k]).map(k => [k, st.ruleTraitValues[r * 5 + k - 1]]);
    const top = row(0), below = row(1), perms = S.ZB_CAVES_PERMS;
    const ok = (p, cl) => cl.every(([k, v]) => p[k - 1] === v);
    for (const kP of top.length ? [st.primaryRuleTraitKind] : S.ZB_TRAIT_KINDS) {
      for (const kS of level >= 3 ? (below.length ? [st.secondaryRuleTraitKind] : S.ZB_TRAIT_KINDS.filter(k => k !== kP)) : [null]) {
        for (const o1 of perms) if (ok(o1, top)) for (const o2 of level >= 3 ? perms : [null]) if (!o2 || ok(o2, below)) out.push({ kP, kS, o1, o2 });
      }
    }
    return out;
  };
  // Under a rule, the band's stones (0 to n - 1) each member fits.
  const rangeOf = (band, rule) => {
    const rank = z => rule.o1.indexOf(z[rule.kP]) * 5 + (rule.o2 ? rule.o2.indexOf(z[rule.kS]) : 0);
    const r = band.map(rank), out = [];
    for (let i = 0; i < band.length; i++) {
      const lo = r.filter(x => x < r[i]).length;
      out.push([lo, lo + r.filter(x => x === r[i]).length - 1]);
    }
    return out;
  };
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  // Brute force: the most sure to be placed, every move tried, no shortcut.
  const brute = (band, rules, limit) => {
    const n = band.length, R = rules.map(r => rangeOf(band, r)), memo = new Map();
    const v = (H, occ, rem, m) => {
      if (!rem || !m) return 0;
      const key = H.join(',') + '|' + occ + '|' + rem + '|' + m;
      if (memo.has(key)) return memo.get(key);
      let best = 0;
      for (let z = 0; z < n; z++) {
        if (!(rem >> z & 1)) continue;
        for (let j = 0; j < n; j++) {
          if (occ >> j & 1) continue;
          const by = new Map();
          for (const h of H) {
            const [lo, hi] = R[h][z];
            if (lo <= j && j <= hi) { const k = 'stay'; by.set(k, [...(by.get(k) || []), h]); continue; }
            for (let T = lo; T <= hi; T++) if (!(occ >> T & 1)) { const k = T; by.set(k, [...(by.get(k) || []), h]); }
          }
          let worst = Infinity;
          for (const [k, H2] of by) worst = Math.min(worst, 1 + (k === 'stay' ? v(H2, occ | 1 << j, rem & ~(1 << z), m) : v(H2, occ | 1 << k, rem & ~(1 << z), m - 1)));
          if (worst > best) best = worst;
        }
      }
      memo.set(key, best);
      return best;
    };
    return v(rules.map((_, i) => i), 0, (1 << n) - 1, limit);
  };
  let trips = 0, solved = 0, brutes = 0, walks = 0, ends = 0, slowest = 0, slowNext = 0;
  // Walks: every branch, or twelve at random. The feedback given must be
  // possible under some rule the wall allows, each placement called sure
  // must fit under every rule still possible, and the ends must count
  // what is placed. Returns the fewest placed on any branch walked.
  const walkAll = (band, rules, root, full, limit, seed) => {
    const n = band.length, R = rules.map(r => rangeOf(band, r)), rnd = S.zbRandom(seed + 9);
    let worst = Infinity, broken = null;
    const walk = (node, H, occ, placed, mistakes, depth) => {
      if (broken) return;
      if (mistakes === limit && (node.outcomes.length || /Sure now/.test(node.move))) { broken = `a placement after the last mistake: ${node.move}`; return; }
      const head = node.move.split('Put Zoombini')[0];
      for (const m of head.matchAll(/Zoombini (\d+) on stone (\d+)/g)) {
        const z = +m[1] - 1, j = +m[2] - (17 - n);
        if (placed.has(z) || occ >> j & 1 || H.some(h => !(R[h][z][0] <= j && j <= R[h][z][1]))) { broken = `"${head.trim()}" is not sure`; return; }
        placed.add(z); occ |= 1 << j;
      }
      if (!node.outcomes.length) {
        ends++;
        if (node.crossed !== placed.size) { broken = `an end says ${node.crossed} cross, ${placed.size} are placed`; return; }
        if (placed.size < n && mistakes !== limit) { broken = 'an end short of the band before the last mistake'; return; }
        worst = Math.min(worst, node.crossed);
        return;
      }
      if (depth > 40) { broken = 'a strategy deeper than 40 moves'; return; }
      const mv = /Put Zoombini (\d+) on stone (\d+)\./.exec(node.move);
      const z = mv ? +mv[1] - 1 : -1, j = mv ? +mv[2] - (17 - n) : -1;
      if (!mv || z !== node.zoombini || placed.has(z) || j < 0 || j >= n || occ >> j & 1) { broken = `an illegal move: ${node.move}`; return; }
      for (const o of full ? node.outcomes : [node.outcomes[rnd.range(0, node.outcomes.length - 1)]]) {
        const w = /walked to stone (\d+)/.exec(o.label), T = w ? +w[1] - (17 - n) : j;
        const H2 = H.filter(h => w ? !(R[h][z][0] <= j && j <= R[h][z][1]) && R[h][z][0] <= T && T <= R[h][z][1] : R[h][z][0] <= j && j <= R[h][z][1]);
        if (!H2.length || (w && occ >> T & 1)) { broken = `an outcome no rule gives: ${o.label}`; return; }
        const t1 = Date.now(), nx = o.next();
        slowNext = Math.max(slowNext, Date.now() - t1);
        walk(nx, H2, occ | 1 << T, new Set([...placed, z]), mistakes + (w ? 1 : 0), depth + 1);
        if (broken) return;
      }
    };
    for (let k = 0; k < (full ? 1 : 12) && !broken; k++) walk(root, R.map((_, i) => i), 0, new Set(), 0, 0);
    return { worst, broken };
  };

  const C = S.ZB_PUZZLES.get('CAVES');
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(10, 500 + level, [16, 11, 7, 6, 3])) {
      const d = C.deal(level, band, S.zbRandom(seed), {}), n = band.length, limit = S.ZB_CAVES_MISTAKES[level - 1];
      const bad = m => { fail(`level ${level}, a band of ${n}: ${m}`); return true; };
      // Round trips, and an edit's rule dealt again as the program would.
      const form = C.form(level, band, d.state), vals = valuesOf(form), again = C.edit(level, band, d.state, vals);
      if (!same(valuesOf(C.form(level, band, again)), vals) || !same(again.seatPrimaryRuleValues, d.state.seatPrimaryRuleValues)
        || !same(again.seatSecondaryRuleValues, d.state.seatSecondaryRuleValues) || !same(again.ruleGlyphShapeIds, d.state.ruleGlyphShapeIds)) { bad('the form does not give back the puzzle it shows'); break; }
      const rejects = [{ ...vals, order: [1, 1, 2, 3, 4] }, { ...vals, primary: 'ears' }];
      if (level >= 3) rejects.push({ ...vals, secondary: vals.primary });
      if (level === 2 || level === 3) rejects.push({ ...vals, shown: [1, 2, 3] });
      for (const r of rejects) { let err = null; try { C.edit(level, band, d.state, r); } catch (e) { err = e.message; } if (!err) { bad(`the form takes ${JSON.stringify(r)}`); break; } }
      trips++;
      // The known answer: every member on a stone it fits, one to a stone, drawn once.
      const sol = C.solve(level, band, d.state), s0 = sol.solutions[0];
      const seatsUsed = new Set(), dz = s0.diagram.items.filter(it => it.t === 'zoombini');
      if (sol.most !== n || !sol.exact || s0.crosses.length !== n || sol.most < Math.max(...sol.solutions.map(x => x.crosses.length))) { bad('the known answer does not take the whole band'); break; }
      if (!same(dz.map(it => it.i).sort((a, b) => a - b), band.map((_, i) => i))) { bad('the solution\'s diagram does not draw each Zoombini once'); break; }
      const at = seat => { const [x, y] = S.ZB_CAVES_SEAT_PLACES[seat - 1]; return [Math.round(150 + (x - 254) * 2), Math.round(110 + (y - 140) * 1.8) + 2]; };
      let misfit = null;
      for (const it of dz) {
        const seat = [...Array(20).keys()].map(k => k + 1).find(sn => same(at(sn), [it.x, it.y]));
        if (!seat || seatsUsed.has(seat) || !fits(band[it.i], seat, d.state)) misfit = it.i;
        seatsUsed.add(seat);
      }
      if (misfit != null) { bad(`the solution puts Zoombini ${misfit + 1} where it does not fit`); break; }
      solved++;
      // The unknown answer.
      const t0 = Date.now(), st = C.strategy(level, band, null, { state: d.state });
      slowest = Math.max(slowest, Date.now() - t0);
      if (st.sure < Math.min(n, limit) || st.sure > n) { bad(`the strategy is sure of ${st.sure}`); break; }
      // Only the wall may count: the same wall over another hidden rule
      // (the places it does not show filled otherwise, and at level 4 the
      // traits too) gives the same strategy.
      {
        const vis = d.state.ruleGlyphVisibility, o = d.state.ruleTraitValues;
        const hideRow = r => { const hidden = [1, 2, 3, 4, 5].filter(k => !vis[r * 5 + k]); const vals = hidden.map(k => o[r * 5 + k - 1]).reverse(); const row = o.slice(r * 5, r * 5 + 5); hidden.forEach((k, x) => { row[k - 1] = vals[x]; }); return row; };
        const shown = row => [1, 2, 3, 4, 5].some(k => vis[row * 5 + k]);
        const kP = shown(0) ? d.state.primaryRuleTraitKind : S.ZB_TRAIT_KINDS.find(k => k !== d.state.primaryRuleTraitKind);
        const kS = shown(1) ? d.state.secondaryRuleTraitKind : S.ZB_TRAIT_KINDS.find(k => k !== kP && k !== d.state.secondaryRuleTraitKind);
        const other = S.zbCavesState(level, band, { primary: kP, secondary: kS, orders: [hideRow(0), hideRow(1)] }, vis, false);
        const st2 = C.strategy(level, band, null, { state: other });
        /* A search stopped by its budget may stop elsewhere; compare its
           play only where both are complete. */
        if (st2.hypotheses !== st.hypotheses || (st.exact && st2.exact && (st2.sure !== st.sure || st2.root.move !== st.root.move))) { bad('the strategy reads more of the puzzle than the wall'); break; }
      }
      const rules = rulesFor(level, d.state);
      if (st.hypotheses !== rules.length) { bad(`the strategy counts ${st.hypotheses} rules, the wall allows ${rules.length}`); break; }
      if (st.exact && n > limit && rules.length <= 40 && n <= 7) {
        const b = brute(band, rules, limit);
        if (b !== st.sure) { bad(`the strategy is exact at ${st.sure}, the brute force gets ${b}`); break; }
        brutes++;
      }
      // Walks: every branch for small trees, else twelve at random. The
      // feedback given must be possible under some rule the wall allows,
      // each placement called sure must fit under every rule still
      // possible, and no branch places fewer than is sure.
      const full = n <= 7 && level < 4;
      const { worst, broken } = walkAll(band, rules, st.root, full, limit, seed);
      if (broken) { bad(broken); break; }
      if (worst < st.sure) { bad(`the strategy says ${st.sure} are sure, and a branch places ${worst}`); break; }
      if (full && st.exact && worst !== st.sure) { bad(`the strategy is exact at ${st.sure}, and its worst branch places ${worst}`); break; }
      walks++;
    }
  }
  // With the wall unseen, a small band at level 1 can be short: the brute
  // force holds the strategy's exact count there too, and a walk of every
  // branch finds a branch at exactly that count.
  let short = 0;
  for (const { band } of bands(6, 777, [5, 6])) {
    const st = C.strategy(1, band, null, {});
    if (!st.exact) continue;
    const b = brute(band, rulesFor(1, null), S.ZB_CAVES_MISTAKES[0]);
    if (b !== st.sure) { fail(`level 1, the wall unseen, a band of ${band.length}: the strategy is exact at ${st.sure}, the brute force gets ${b}`); break; }
    if (st.sure < band.length) {
      short++;
      const { worst, broken } = walkAll(band, rulesFor(1, null), st.root, true, S.ZB_CAVES_MISTAKES[0], 5);
      if (broken || worst !== st.sure) { fail(`level 1, the wall unseen: ${broken || `the strategy is exact at ${st.sure}, and its worst branch places ${worst}`}`); break; }
    }
    brutes++;
  }
  if (!short) fail('no band came out short with the wall unseen, so the brute force held nothing but the whole band');
  if (slowest > 2500) fail(`a strategy took ${slowest} ms`);
  if (slowNext > 500) fail(`a step of a strategy took ${slowNext} ms`);
  say(`workbench: ${trips} forms given back, ${solved} known answers each Zoombini on a stone it fits, ${brutes} exact strategies matched by brute force (${short} short of the band), ${walks} strategies walked (${ends} ends; slowest ${slowest} ms, a step ${slowNext} ms)`);

  say(`mistakes ${S.ZB_CAVES_MISTAKES.join(', ')} as ScummVM's; stones and clues in ZOOMBINI.EXE at 0x${(atSeats[0] || 0).toString(16)} and 0x${(atGlyphs[0] || 0).toString(16)}; `
    + `tMID ${base + 3} in both MIDI archives; ${dealt} deals judged, ${runs} runs of stones each holding exactly its Zoombinis`);
}
