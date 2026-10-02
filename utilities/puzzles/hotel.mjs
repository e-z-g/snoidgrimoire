// Hotel Dimensia (js/zb-puzzle-hotel.js) against ScummVM's puzzle_hotel.cpp
// and .h and the 1996 program:
//
//   - the counter's first step per level and the step at which the hotel
//     closes are ScummVM's, and so the chances, 12 less the first step;
//   - the test the drawn traits must pass is generateRoomRules' as ScummVM
//     writes it, evaluated here for every draw and every count of values a
//     band can show, and must agree with the port's shorter statement;
//   - ScummVM's TraitAxis numbers the traits feet, nose, eyes, hair and the
//     program hair, eyes, nose, feet: the check reads ScummVM's enum to see
//     that this is still so, and the port must have the program's order;
//   - the 25 rooms' and the 125 rooms' positions are ScummVM's and in
//     ZOOMBINI.EXE, and in the 25 a slot is 5 x trunk + floor, trunks left
//     to right and floors top to bottom, which the answer's words assume;
//   - over bands of 16, 11, 5, 2 and 1 at each level, every deal is dealt
//     again here as ScummVM writes generateRoomRules (its loops and draws
//     in order), and must agree; then the band is given rooms by the marks,
//     one at a time, and ScummVM's judging (endDrag, validate2 and
//     validate3TraitPlacement, fillCellRow, setCellTraitsIn3Grids, written
//     out here) must take every one, round the boarded rooms at level 3,
//     with Zoombinis sharing a mark sharing a room;
//   - the workbench: the form gives back what is put in and refuses what
//     the program could not set; every solution is placed room by room
//     through ScummVM's judging and takes those it says, most is the best
//     of them, and on small bands no way of placing does better (a search
//     over every room for every Zoombini) and the ways are the room
//     assignments that place them all; the strategy's hypotheses are the
//     traits ScummVM's test allows (at level 3 those the band fits round
//     the boards), it is walked down every branch on small bands and
//     played against the dealt traits on large ones, the feedback being
//     ScummVM's judging, which the puzzle's own answer must agree with at
//     every move (and zbStrategyPlay end where the play does), and no
//     branch places fewer than it says are sure;
//     with fewer chances its sure count is held to a plain minimax over
//     every room on small bands; and the times are kept.
export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_hotel.h'), cpp = scumm('zoombini_pages/puzzle_hotel.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('HOTEL');

  // ---- the counter ------------------------------------------------------------
  const init = need(/case kPuzzleLevel1:\s*_initialCounterStep = (\d+);\s*break;\s*case kPuzzleLevel3:\s*_initialCounterStep = (\d+);\s*break;\s*default: \/\/ Levels 2 and 4\s*_initialCounterStep = (\d+);/, cpp, 'initStates\' counter steps').slice(1).map(Number);
  const first = [init[0], init[2], init[1], init[2]];
  if (!same(first, S.ZB_HOTEL_FIRST_STEP)) fail(`the counter's first steps are ${S.ZB_HOTEL_FIRST_STEP}, ScummVM ${first}`);
  const last = Number(need(/opportunities = static_cast<int16>\((\d+) - _initialCounterStep\);/, cpp, 'debugGetChances')[1]);
  need(new RegExp(`if \\(${last} <= _mistakeCounterStep\\) \\{\\s*_terminalFailureCount \\+= 1;`), cpp, 'the terminal failure');
  need(/_firstPlacementPending = false;\s*_mistakeCounterStep = _initialCounterStep;/, cpp, 'the first placement setting the counter');
  if (last !== S.ZB_HOTEL_LAST_STEP) fail(`the hotel closes at step ${S.ZB_HOTEL_LAST_STEP}, ScummVM ${last}`);
  const chances = first.map(f => last - f);
  const words = ['Seven', 'Ten', 'Eight', 'Ten'];
  P.levels.forEach((l, i) => {
    if (words[i] !== ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][chances[i]] || !l.chances.startsWith(words[i] + ' ')) fail(`level ${i + 1}'s chances do not say ${chances[i]}`);
    if (!l.notes || !l.notes.some(n => /music stops/.test(n))) fail(`level ${i + 1} has no note on the music halt`);
  });
  need(/_\("Fix 'Hotel Dimensia' MIDI background music halt bug"\)/, scumm('zoombini_dialogs.cpp'), 'the MIDI halt option\'s name');

  // ---- the traits' order --------------------------------------------------------
  const axisEnum = [...need(/enum class TraitAxis : int16 \{([\s\S]*?)\};/, h, 'TraitAxis')[1].matchAll(/k(Feet|Nose|Eyes|Hair)0(\d) = (\d)/g)]
    .map(m => [Number(m[3]), m[1].toLowerCase()]).sort((a, b) => a[0] - b[0]).map(m => m[1]);
  if (!same(axisEnum, ['feet', 'nose', 'eyes', 'hair'])) fail(`ScummVM's TraitAxis is now ${axisEnum}; see whether it follows the program`);
  if (!same(S.ZB_HOTEL_AXES, ['hair', 'eyes', 'nose', 'feet'])) fail(`the port's trait order is ${S.ZB_HOTEL_AXES}, not the program's hair, eyes, nose, feet`);

  // ---- the traits' test, as ScummVM writes it ---------------------------------------
  const gen = need(/void ZoombiniPuzzleHotel::generateRoomRules\(\) \{([\s\S]*?)\n\}/, cpp, 'generateRoomRules')[1];
  for (const frag of ['countLimitedAxes(5)', 'countLimitedAxes(4)', '== 5 &&', 'limitedCount < 3 &&', '3 <= limitedCount', 'if (3 <= limitedCount) {']) {
    if (!gen.includes(frag)) fail(`generateRoomRules no longer has "${frag}"`);
  }
  if ((gen.match(/getRandomNumber\(0, kTraitAxisCount - 1\)/g) || []).length !== 3) fail('generateRoomRules does not draw three traits');
  const scummSuits = (level, a, v) => {
    const limited = t => v.filter(x => x < t).length;
    if (level <= 2) {
      const lim = limited(5);
      if (v[a[0]] === 5 && v[a[1]] === 5 && a[0] !== a[1]) return true;
      else if (lim < 3 && a[0] !== a[1] && 4 <= v[a[0]] && 4 <= v[a[1]]) return true;
      else if (3 <= lim && a[0] !== a[1]) return true;
      return false;
    } else if (level === 3) {
      const lim = limited(4);
      if (3 <= lim) return a[0] !== a[1];
      return a[0] !== a[1] && 4 <= v[a[0]] && 4 <= v[a[1]];
    }
    return a[0] !== a[1] && a[1] !== a[2] && a[0] !== a[2];
  };
  let tests = 0;
  for (let level = 1; level <= 4; level++) {
    for (let n = 0; n < 625; n++) {
      const v = [0, 1, 2, 3].map(i => Math.floor(n / 5 ** i) % 5 + 1);
      for (let t = 0; t < 64; t++) {
        const a = [t & 3, t >> 2 & 3, t >> 4];
        if (scummSuits(level, a, v) !== S.zbHotelAxesSuit(level, a, v)) { fail(`level ${level}: traits ${a} with values ${v}: ScummVM ${scummSuits(level, a, v)}, the port ${!scummSuits(level, a, v)}`); break; }
        tests++;
      }
    }
  }
  need(/forbiddenCount = MIN<int16>\(forbiddenCount, MIN<int16>\((\d+), emptyCount\)\);/, gen, 'the most rooms boarded');
  if (Number(/MIN<int16>\((\d+), emptyCount\)/.exec(gen)[1]) !== S.ZB_HOTEL_MOST_BOARDED) fail('the most rooms boarded is not ScummVM\'s');
  need(/_forbiddenMarkerVariants\[fi\] = _vm->_rnd->getRandomNumber\(0, 3\);/, gen, 'the boards\' look drawn after each room');

  // ---- the rooms' positions ----------------------------------------------------------
  const points = name => [...need(new RegExp(`${name}\\[\\d+\\]\\{([\\s\\S]*?)\\n\\t\\};`), h, name)[1].matchAll(/Common::Point\((0x[0-9a-f]+|\d+), (0x[0-9a-f]+|\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const p25 = points('kRoomPositions25'), p125 = points('kRoomPositions125');
  const bytes = ps => ps.flatMap(([x, y]) => [x & 255, x >> 8 & 255, y & 255, y >> 8 & 255]);
  const at25 = find(exe, bytes(p25)), at125 = find(exe, bytes(p125));
  if (p25.length !== 25 || at25.length !== 1) fail(`the 25 rooms' positions (${p25.length}) are in ZOOMBINI.EXE ${at25.length} times, not once`);
  if (p125.length !== 125 || at125.length !== 1) fail(`the 125 rooms' positions (${p125.length}) are in ZOOMBINI.EXE ${at125.length} times, not once`);
  for (let s = 0; s < 25; s++) {
    const [x, y] = p25[s];
    if ((s % 5 && y <= p25[s - 1][1]) || (s >= 5 && x <= p25[s - 5][0] - 10)) { fail(`room ${s} at (${x}, ${y}) is not trunk ${Math.floor(s / 5)} from the left, floor ${s % 5} from the top`); break; }
  }

  // ---- the judging, as ScummVM writes it ---------------------------------------------------
  const judge = level => {
    const n = level === 4 ? 125 : 25;
    const g = { a1: new Array(25).fill(0), a2: new Array(25).fill(0), a3: new Array(5).fill(0), first: true };
    const fillCellRow = (slot, v1, v2) => { for (let i = 0; i < 5; i++) { g.a1[5 * i + slot % 5] = v1; g.a2[i + slot - slot % 5] = v2; } };
    const validate2 = (slot, v1, v2) => {
      const c1 = g.a1[slot], c2 = g.a2[slot];
      if (!c1 && !c2) { for (let i = 0; i < n; i++) if (v2 === g.a2[i] || v1 === g.a1[i]) return false; return true; }
      if (v1 === c1 && v2 === c2) return true;
      if ((c1 && v1 !== c1) || (c2 && v2 !== c2)) return false;
      if (v1 === c1 && !c2) { for (let i = 0; i < n; i++) if (v2 === g.a2[i]) return false; return true; }
      if (v2 === c2 && !c1) { for (let i = 0; i < n; i++) if (v1 === g.a1[i]) return false; return true; }
      return false;
    };
    const validate3 = (slot, v1, v2, v3) => {
      const sc = slot % 5, row = Math.floor(slot % 25 / 5), col = Math.floor(slot / 25);
      const rc = g.a1[row], cc = g.a2[col], sb = g.a3[sc];
      const inGrid = (grid, v) => grid.slice(0, 5).some(x => x && x === v);
      if (!rc && !cc && !sb) return !inGrid(g.a2, v2) && !inGrid(g.a1, v1) && !inGrid(g.a3, v3);
      if (!rc && inGrid(g.a1, v1)) return false;
      if (!cc && inGrid(g.a2, v2)) return false;
      if (!sb && inGrid(g.a3, v3)) return false;
      if ((sb && v3 !== sb) || (rc && v1 !== rc) || (cc && v2 !== cc)) return false;
      return true;
    };
    // Returns whether the room takes the Zoombini, whose values are v (1-3 of them).
    return (slot, v) => {
      if (g.first) {
        g.first = false;
        if (level === 1) g.a1[slot] = v[0];
        else if (level <= 3) fillCellRow(slot, v[0], v[1]);
        else { g.a1[Math.floor(slot % 25 / 5)] = v[0]; g.a2[Math.floor(slot / 25)] = v[1]; g.a3[slot % 5] = v[2]; }
        return true;
      }
      let ok;
      if (level === 1) {
        const e = g.a1[slot];
        ok = e ? e === v[0] : ![4, 9, 14, 19, 24].some(i => g.a1[i] && g.a1[i] === v[0]);
        if (ok) g.a1[slot] = v[0];
      } else if (level <= 3) { ok = validate2(slot, v[0], v[1]); if (ok) fillCellRow(slot, v[0], v[1]); }
      else { ok = validate3(slot, v[0], v[1], v[2]); if (ok) { g.a1[Math.floor(slot % 25 / 5)] = v[0]; g.a2[Math.floor(slot / 25)] = v[1]; g.a3[slot % 5] = v[2]; } }
      return ok;
    };
  };

  // ---- deals ---------------------------------------------------------------------------
  let dealt = 0, placed = 0;
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(250, 300 + level, [16, 11, 5, 2, 1])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      if (d.state.stuck) { fail(`level ${level}: stuck`); break; }
      // generateRoomRules, dealt again, with the program's order of traits.
      const rnd = S.zbRandom(seed), kinds = ['hair', 'eyes', 'nose', 'feet'];
      const v = kinds.map(k => [1, 2, 3, 4, 5].filter(x => band.some(z => z[k] === x)).length);
      let a;
      do a = [rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)]; while (!scummSuits(level, a, v));
      const boarded = [];
      let rows = null, cols = null;
      if (level === 3) {
        rows = []; cols = [];
        const usedR = [0, 0, 0, 0, 0], usedC = [0, 0, 0, 0, 0];
        for (let i = 0; i < 5; i++) {
          let r, c;
          do r = rnd.range(0, 4); while (usedR[r]);
          usedR[r] = 1;
          do c = rnd.range(0, 4); while (usedC[c]);
          usedC[c] = 1;
          rows[i] = r + 1; cols[i] = c + 1;
        }
        const grid = new Array(25).fill(0);
        for (const z of band) for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
          if (z[kinds[a[0]]] === rows[row] && z[kinds[a[1]]] === cols[col]) grid[5 * col + row]++;
        }
        const empty = [];
        for (let s = 0; s < 25; s++) if (!grid[s]) empty.push(s);
        if (empty.length) {
          let count = rnd.range(0, empty.length - 1) + 1;
          count = Math.min(count, Math.min(8, empty.length));
          for (let i = 0; i < count; i++) {
            let pick;
            do pick = rnd.range(0, empty.length - 1); while (boarded.includes(empty[pick]));
            boarded.push(empty[pick]);
            rnd.range(0, 3);
          }
        }
      }
      if (!same([d.state.axis1TraitAxis, d.state.axis2TraitAxis, d.state.axis3TraitAxis], a) || !same(d.state.boarded || [], boarded)) {
        fail(`level ${level}: dealt traits ${[d.state.axis1TraitAxis, d.state.axis2TraitAxis, d.state.axis3TraitAxis]} boarded ${d.state.boarded}, ScummVM's way ${a} ${boarded}`); break;
      }
      const used = a.slice(0, level === 1 ? 1 : level === 4 ? 3 : 2).map(i => kinds[i]);
      if (new Set(used).size !== used.length) { fail(`level ${level}: a trait used twice, ${used}`); break; }
      if (level === 3 && (boarded.length < 1 || boarded.length > 8)) { fail(`level 3: ${boarded.length} rooms boarded`); break; }
      // The marks name the values that matter: equal marks for equal values, and only then.
      const key = z => used.map(k => z[k]).join();
      if (band.some((z, i) => band.some((y, j) => (d.marks[i] === d.marks[j]) !== (key(z) === key(y))))) { fail(`level ${level}: the marks do not follow the traits`); break; }
      // Give the band rooms: each value of a trait the next floor, trunk or door in the order
      // the values first come (at level 3 the arrangement the boards were chosen round), and
      // every Zoombini to the room of its values; ScummVM's judging must take each, and turn
      // each away from a room already settled for another kind.
      const order = used.map(k => [...new Set(band.map(z => z[k]))]);
      const slotOf = z => {
        const at = used.map((k, i) => (level === 3 ? [rows, cols][i] : order[i]).indexOf(z[k]));
        return level === 1 ? 5 * at[0] + 4 : level === 4 ? 25 * at[1] + 5 * at[0] + at[2] : 5 * at[1] + at[0];
      };
      const take = judge(level), settled = new Map();
      let bad = null;
      band.forEach((z, i) => {
        if (bad) return;
        const s = slotOf(z), vals = used.map(k => z[k]);
        if (boarded.includes(s)) bad = `room ${s} is boarded`;
        for (const [t, other] of settled) if (other !== key(z) && take(t, vals)) bad = `a Zoombini was taken into room ${t}, settled for ${other}`;
        if (!bad && !take(s, vals)) bad = `Zoombini ${i} was turned away from room ${s}`;
        settled.set(s, key(z));
      });
      if (bad) { fail(`level ${level}: giving the band rooms, ${bad}`); break; }
      placed += band.length;
      dealt++;
    }
  }
  // ---- the workbench ---------------------------------------------------------------------
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  const placesOf = level => [['trunk'], ['floor', 'trunk'], ['floor', 'trunk'], ['floor', 'trunk', 'door']][level - 1];
  // A room in the program's slots: level 1 the trunk's lowest room, 2-3 5 x trunk + floor, 4 25 x trunk + 5 x floor + door.
  const slotOf = (level, pos) => level === 1 ? 5 * pos[0] + 4 : level === 4 ? 25 * pos[1] + 5 * pos[0] + pos[2] : 5 * pos[1] + pos[0];
  const roomRe = level => level === 1 ? /the room in trunk (\d)/ : level === 4 ? /door (\d) on floor (\d) of trunk (\d)/ : /the room on floor (\d) of trunk (\d)/;
  const posFromWords = (level, m) => level === 1 ? [m[1] - 1] : level === 4 ? [m[2] - 1, m[3] - 1, m[1] - 1] : [m[1] - 1, m[2] - 1];
  // Whether ScummVM's judging lets band member v's values into slot after the placings before.
  const lets = (level, placed, slot, v) => { const take = judge(level); for (const p of placed) if (!take(p.slot, p.v)) return null; return take(slot, v); };
  const kindsAll = ['hair', 'eyes', 'nose', 'feet'];
  const tuplesOf = level => { const A = level === 1 ? 1 : level === 4 ? 3 : 2, out = []; const r = pre => { if (pre.length === A) out.push(pre); else for (let a = 0; a < 4; a++) if (!pre.includes(a)) r([...pre, a]); }; r([]); return out; };
  let trips = 0, solved = 0, brute = 0, walked = 0, playedH = 0, answered = 0, ends = 0, plain = 0, slowRoot = 0, slowNext = 0, notAll = 0;
  const timedNext = o => { const t0 = Date.now(); const nd = o.next(); slowNext = Math.max(slowNext, Date.now() - t0); return nd; };
  const nodeOk = (level, band, nd, boards) => {
    const zs = nd.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
    if (zs.join() !== band.map((_, i) => i).join()) return 'a diagram does not draw each Zoombini once';
    if (!nd.outcomes.length) return null;
    if (nd.zoombini == null || nd.place[nd.zoombini] >= 0) return `a move gives a room to one who has one: ${nd.move}`;
    if (level === 3 && boards.includes(slotOf(3, nd.room))) return `a move is into a boarded room: ${nd.move}`;
    const m = roomRe(level).exec(nd.move);
    if (!m || posFromWords(level, m).join() !== nd.room.join() || !nd.move.startsWith(`Give Zoombini ${nd.zoombini + 1} `)) return `a move's words are not its room: ${nd.move}`;
    return null;
  };
  const walkH = (level, band, nd, boards, depth) => {
    const bad = nodeOk(level, band, nd, boards);
    if (bad) throw new Error(bad);
    if (!nd.outcomes.length) { ends++; return nd.crossed; }
    if (depth > 60) throw new Error('a strategy deeper than 60 moves');
    return Math.min(...nd.outcomes.map(o => walkH(level, band, timedNext(o), boards, depth + 1)));
  };
  const playH = (level, band, st, state, boards) => {
    const used = state.traits;
    let nd = st.root;
    const placed = [];
    for (let k = 0; nd.outcomes.length; k++) {
      const bad = nodeOk(level, band, nd, boards);
      if (bad) throw new Error(bad);
      const v = used.map(t => band[nd.zoombini][t]), slot = slotOf(level, nd.room);
      const ok = lets(level, placed, slot, v);
      const o = nd.outcomes.find(o => ok ? /^It is let in/.test(o.label) : /^It is turned away/.test(o.label));
      if (!o) throw new Error(`the game's feedback (${ok ? 'let in' : 'turned away'}) for "${nd.move}" is not among the strategy's outcomes`);
      if (nd.outcomes[P.answer(level, band, state, nd)] !== o) throw new Error(`the puzzle's answer to "${nd.move}" is not ScummVM's judging (${ok ? 'let in' : 'turned away'})`);
      answered++;
      if (ok) placed.push({ slot, v });
      nd = timedNext(o);
      if (k > 80) throw new Error('a strategy deeper than 80 moves');
    }
    if (nd.crossed !== placed.length) throw new Error(`a strategy says ${nd.crossed} have rooms, and the judging let in ${placed.length}`);
    const end = S.zbStrategyPlay(P, level, band, state, st);
    if (!end || end.crossed !== nd.crossed) throw new Error(`played by the puzzle's answers, the strategy ends ${end ? `with ${end.crossed} in rooms` : 'on an answer it did not look for'}, not ${nd.crossed}`);
    return nd.crossed;
  };
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(10, 600 + level, [16, 4, 9, 5, 12])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      const form = P.form(level, band, d.state), again = P.edit(level, band, d.state, valuesOf(form));
      if (!same(valuesOf(P.form(level, band, again)), valuesOf(form)) || !same(again.traits, d.state.traits) || (level === 3 && !same(again.boarded, d.state.boarded.slice().sort((a, b) => a - b)))) { fail(`level ${level}: the form does not give back what it shows`); break; }
      trips++;
      // With edited boards now and then, so that some bands do not all fit.
      let state = d.state;
      if (level === 3 && seed % 2) {
        /* Eight boards drawn at random, again until the band does not all fit, if that happens within 60 draws. */
        const rnd = S.zbRandom(seed + 5);
        for (let k = 0; k < 60; k++) {
          const b = new Set();
          while (b.size < 8) b.add(rnd.range(0, 24));
          state = P.edit(level, band, d.state, { ...valuesOf(form), boarded: [...b] });
          if (P.solve(level, band, state).most < band.length) break;
        }
      }
      const boards = level === 3 ? state.boarded : [], used = state.traits;
      const sol = P.solve(level, band, state);
      let bestSeen = 0;
      for (const s0 of sol.solutions) {
        const line = s0.steps.find(x => x.startsWith('Rooms: '));
        const placed = [], who = [];
        for (const part of line.slice(7, -1).split('; ')) {
          const m = roomRe(level).exec(part), members = part.split(' in ')[0].split(/, | and /).map(x => Number(x) - 1);
          const slot = slotOf(level, posFromWords(level, m));
          if (boards.includes(slot)) throw new Error(`level ${level}: a solution uses a boarded room`);
          for (const i of members) {
            const v = used.map(t => band[i][t]);
            if (!lets(level, placed, slot, v)) { fail(`level ${level}: a solution's placing of Zoombini ${i + 1} is turned away`); break; }
            placed.push({ slot, v }); who.push(i);
          }
        }
        if (who.slice().sort((a, b) => a - b).join() !== s0.crosses.slice().sort((a, b) => a - b).join()) { fail(`level ${level}: a solution's rooms and crosses differ`); break; }
        const zs = s0.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((a, b) => a - b);
        if (zs.join() !== band.map((_, i) => i).join()) { fail(`level ${level}: a solution's diagram does not draw each Zoombini once`); break; }
        bestSeen = Math.max(bestSeen, who.length);
      }
      if (sol.most !== bestSeen) { fail(`level ${level}: most is ${sol.most}, the solutions place ${bestSeen}`); break; }
      if (sol.most < band.length) notAll++;
      solved++;
      // Small bands: every way of placing, room by room through the judging.
      if (band.length <= 4 && level !== 4) {
        const slots = level === 1 ? [4, 9, 14, 19, 24] : [...Array(25).keys()].filter(x => !boards.includes(x));
        let top = 0; const full = new Set();
        const dfs = (i, placed, rooms) => {
          if (i === band.length) { top = Math.max(top, placed.length); if (placed.length === band.length) full.add(rooms.join()); return; }
          dfs(i + 1, placed, rooms);
          const v = used.map(t => band[i][t]);
          for (const slot of slots) if (lets(level, placed, slot, v)) dfs(i + 1, [...placed, { slot, v }], [...rooms, slot]);
        };
        dfs(0, [], []);
        if (top !== sol.most || (top === band.length && full.size !== sol.ways)) { fail(`level ${level}, band ${S.zbBandCode(band)}: placing every way gives ${top} (${full.size} ways), the solver ${sol.most} (${sol.ways})`); break; }
        brute++;
      }
      // The strategy.
      const allowed = tuplesOf(level).filter(t => [0, 1, 2, 3].some(x => [0, 1, 2, 3].some(y => scummSuits(level, [...t, x, y].slice(0, 3), kindsAll.map(k => new Set(band.map(z => z[k])).size)))));
      for (const knows of ['program', 'form']) {
        const t0 = Date.now(), st = P.strategy(level, band, null, { knows, state, budget: band.length > 8 && level === 3 ? 600 : 1500 });
        slowRoot = Math.max(slowRoot, Date.now() - t0);
        const expect = knows === 'form' ? tuplesOf(level).length : level === 3
          ? allowed.filter(t => { const k = t.map(a => kindsAll[a]); return P.solve(3, band, { traits: k, boarded: boards }).most === band.length; }).length : allowed.length;
        if (st.hypotheses !== expect) { fail(`level ${level}, knowing the ${knows}: ${st.hypotheses} hypotheses, not ${expect}`); break; }
        try {
          if (band.length <= 5) {
            const worst = walkH(level, band, st.root, boards, 0);
            if (worst < st.sure || (st.exact && worst !== st.sure)) { fail(`level ${level}, knowing the ${knows}: the strategy says ${st.sure} are sure, and a branch places ${worst}`); break; }
            walked++;
          }
          /* Knowing the program, traits the band does not fit round the boards are ruled out, so only a puzzle the program could set is played. */
          if (knows === 'form' || level !== 3 || P.solve(3, band, state).most === band.length) {
            const got = playH(level, band, st, state, boards);
            if (got < st.sure) { fail(`level ${level}, knowing the ${knows}: played against the dealt traits, ${got} placed, fewer than the ${st.sure} sure`); break; }
            playedH++;
          }
        } catch (e) { fail(`level ${level}, knowing the ${knows}: ${e.message}`); break; }
      }
    }
  }
  // Small bands made not to fit: five alike in eyes, each nose once, with floors by eyes and trunks by nose,
  // and a board on every floor, so that no floor has five rooms free; every way of placing, room by room.
  for (let k = 0; k < 12; k++) {
    const rnd = S.zbRandom(900 + k), eyes = rnd.range(1, 5);
    const band = [1, 2, 3, 4, 5].map(nose => ({ hair: rnd.range(1, 5), eyes, nose, feet: rnd.range(1, 5) }));
    const b = new Set([0, 1, 2, 3, 4].map(f => 5 * rnd.range(0, 4) + f));
    while (b.size < 5 + k % 4) b.add(rnd.range(0, 24));
    const state = P.edit(3, band, { axis2TraitAxis: 1, axis3TraitAxis: 2 }, { floor: 'eyes', trunk: 'nose', boarded: [...b] });
    const sol = P.solve(3, band, state), used = state.traits, slots = [...Array(25).keys()].filter(x => !state.boarded.includes(x));
    let top = 0;
    const dfs = (i, placed) => {
      if (i === band.length) { top = Math.max(top, placed.length); return; }
      dfs(i + 1, placed);
      const v = used.map(t => band[i][t]);
      for (const slot of slots) if (lets(3, placed, slot, v)) dfs(i + 1, [...placed, { slot, v }]);
    };
    dfs(0, []);
    if (top !== sol.most || top !== 4) { fail(`level 3, band ${S.zbBandCode(band)}, boards ${state.boarded}: placing every way gives ${top}, the solver ${sol.most}`); break; }
    for (const knows of ['program', 'form']) {
      const st = P.strategy(3, band, null, { knows, state, budget: 400 });
      if (knows === 'form' && st.sure > sol.most) { fail(`level 3: the strategy is sure of ${st.sure}, more than the ${sol.most} the answer known allows`); break; }
      if (walkH(3, band, st.root, state.boarded, 0) < st.sure) { fail('level 3: a branch places fewer than said'); break; }
      walked++;
    }
    brute++; notAll++;
  }
  // Refusals.
  const bb = bands(1, 11)[0].band;
  const refuseH = (level, values, what) => { let msg = null; try { P.edit(level, bb, { axis2TraitAxis: 1, axis3TraitAxis: 2 }, values); } catch (e) { msg = e.message; } if (!msg) fail(`the form takes ${what}`); };
  refuseH(2, { floor: 'hair', trunk: 'hair' }, 'the same trait for floors and trunks');
  refuseH(3, { floor: 'hair', trunk: 'eyes', boarded: [] }, 'no boarded rooms at level 3');
  refuseH(3, { floor: 'hair', trunk: 'eyes', boarded: [0, 1, 2, 3, 4, 5, 6, 7, 8] }, 'nine boarded rooms');
  refuseH(1, { trunk: 'wings' }, 'a trait that is not one');
  // Fewer chances: the sure count against a plain minimax over every room, on tiny bands.
  const plainH = (level, band, tuples, boards, c) => {
    const slots = level === 1 ? [4, 9, 14, 19, 24] : [...Array(25).keys()].filter(x => !boards.includes(x));
    const memoP = new Map();
    const v = (placedIdx, H, c) => {
      if (!c) return 0;
      const key = placedIdx.map(p => p.i + ':' + p.slot).join() + '|' + H.join() + '|' + c;
      if (memoP.has(key)) return memoP.get(key);
      let best = 0;
      for (let i = 0; i < band.length; i++) if (!placedIdx.some(p => p.i === i)) for (const slot of slots) {
        const acc = [], rej = [];
        H.forEach(h => { const k = tuples[h].map(a => kindsAll[a]); (lets(level, placedIdx.map(p => ({ slot: p.slot, v: k.map(t => band[p.i][t]) })), slot, k.map(t => band[i][t])) ? acc : rej).push(h); });
        if (!acc.length) continue;
        let w = 1 + v([...placedIdx, { i, slot }], acc, c);
        if (rej.length) w = Math.min(w, c > 1 ? v(placedIdx, rej, c - 1) : 0);
        if (w > best) best = w;
      }
      memoP.set(key, best);
      return best;
    };
    return v([], tuples.map((_, h) => h), c);
  };
  for (const { band, seed } of bands(6, 820, [3])) {
    for (const level of [1, 2, 3]) {
      const d = P.deal(level, band, S.zbRandom(seed), {}), boards = level === 3 ? d.state.boarded : [];
      const tuples = tuplesOf(level);
      for (let c = 1; c <= 2; c++) {
        const st = P.strategy(level, band, null, { knows: 'form', state: d.state, chances: c, budget: 5000 }), want = plainH(level, band, tuples, boards, c);
        if (!st.exact || st.sure !== want) { fail(`level ${level}, ${c} chances, band ${S.zbBandCode(band)}: the strategy says ${st.sure}${st.exact ? '' : ' (not exact)'}, a plain minimax ${want}`); break; }
        plain++;
      }
    }
  }
  if (slowRoot > 2500) fail(`a strategy's root took ${slowRoot} ms`);
  if (slowNext > 500) fail(`a strategy's next() took ${slowNext} ms`);
  const bench = `workbench: ${trips} forms given back; ${solved} solves judged room by room (${notAll} where the band does not all fit), ${brute} held to placing every way; ${walked} strategies walked down every branch (${ends} ends) and ${playedH} played against dealt traits (the puzzle's answer ScummVM's judging at all ${answered} moves), none short of what they say is sure; ${plain} held to a plain minimax with fewer chances; slowest root ${slowRoot} ms, next() ${slowNext} ms`;
  say(`counter ${first} of ${last} (chances ${chances}); the traits' test as ScummVM's in ${tests} cases; rooms in ZOOMBINI.EXE at 0x${(at25[0] || 0).toString(16)} and 0x${(at125[0] || 0).toString(16)}; `
    + `${dealt} deals as ScummVM deals them (traits in the program's order), ${placed} Zoombinis given rooms by their marks as ScummVM judges`);
  say(bench);
}
