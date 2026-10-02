/* zb-puzzle-maze2.js -- Bubblewonder Abyss: bubbles across a grid of
   arrows, and arrows that turn Zoombinis with a feature.
   =========================================================================
   Needs zb-puzzle.js and zb-mohawk.js (parseRegs).

   The band waits at the lower left of a 13 x 13 grid of squares. Each
   Zoombini is dropped on a launcher and floats off in a bubble, a square
   at a time, until it reaches the upper right (across), floats back out
   at the lower left (to be sent again), or falls into a whirlpool (and
   does not cross). A white arrow sends every bubble its way, and some
   white arrows turn a quarter once a bubble has passed. A feature arrow
   shows a feature, such as a red nose: a Zoombini with that feature goes
   the arrow's way and one without it carries straight on. From level 2's
   second layout a coloured square, when a bubble crosses it, turns the
   arrows of its colour; at level 4 a sticky square holds a bubble until a
   square of its colour is crossed or another bubble knocks it on, and the
   band may have to go by way of the upper left or the lower right.

   Nothing is hidden: every arrow is on show. What the program deals is
   which features the feature arrows show, chosen from the band in front
   of it, and the colours. The grid itself is one of two fixed layouts a
   level, REGS 16600-16609 in MAZE2, the program taking each level's two
   in turn over a session, the first first; at level 4 a band of fewer
   than five gets a third layout of its own. The layouts are read from the
   archive the deal is given, as the program reads them; the 2001
   release's maze2.mhk is expected to hold the same, and a layout it
   lacks is an Error, not a guess.

   The deal. Twenty-one feature slots, as the program numbers them: 0 is
   no feature, 1-5 the five hairs, 6-10 the eyes, 11-15 the noses, 16-20
   the feet. It counts the band's Zoombinis for each (a Zoombini is
   counted once per trait) and picks slots by those counts, level by
   level (zbMaze2Slots, which follows the program function by function).
   At levels 1-3 a "key" feature, one that two to five of the band share
   if any does, goes on two or three arrows, and the rest go to features
   of the Zoombinis with the key or without it, rarest or commonest by
   turns, within a limit that grows with how many are left; level 4
   starts from the band's rarest features. Where the band leaves no
   choice, a feature nobody in the band has is drawn at random, which
   turns no one. The feature arrows take the slots in the order the layout
   lists them.

   Before the features, seven draws give the colour groups 2-8 each one of
   seven colours, all different; group 1 is white. After them, the
   program draws a frame interval (20-25) for each square, which only
   paces the animation and is left out here.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_maze.cpp and .h
   (initGridAndSelectPaths, buildZmbAssignmentAlt2, buildZmbAssignmentAlt,
   selectPathSlots2, selectPathSlots, buildZmbAssignmentList and their
   helpers, registerGridCellState, moveRunnerStepAlt, simulateNextLaunch),
   checked against the program's own code, ZOOMBI32.EXE of the 1996
   disc's ZBARC32.Z. The page's setup at 0x42e148 picks the layout
   (0x431695: REGS 16600 + the level's counter, the counters at 0x4a1aca,
   0x4a1acc, 0x4a1ace and 0x4a1ad0 starting at 0, level 4's stepping by
   two, 16609 for a band under five at level 4). 0x431754 shuffles the
   colours (random(2, 8), then (2, 7) and down to (2, 2), from the pool at
   0x4a1faa) and calls the level's selector: 0x43302b at level 1; 0x4332bb
   and 0x43356d for level 2's first and second layouts; 0x43356d and
   0x4339fc for level 3's; 0x433e25 at level 4, and 0x4339fc for the
   small band. Their helpers are at 0x431d1e-0x433004 (0x431e48 counts
   the slots, 0x4324a2, 0x432810, 0x4320ab and 0x432b37 pick with the
   uniqueness tests, 0x4327b8, 0x432e6f and 0x432025 pick by count). The
   squares are read at 0x4319ce, a feature arrow taking the next slot's
   trait and value from the table at 0x4a1fc0; the feature arrow is
   judged at 0x434d7c: the Zoombini's trait (category - 1) against the
   value, the arrow's way if equal, else straight on, then one square,
   held to the grid. The program's own quirk, which ScummVM keeps: a
   "free" slot, one nobody has, is drawn at 0x4336a8 as a number from 1 to
   how many there are, used to index the list of all 21 (0x4af556, where
   a slot someone has is 0) rather than the short list built beside it
   (0x4af5aa), so it is often 0 and the next fallback is taken. The Mac
   build agrees where it was read: SETLEVELTWOKEYANDNONKEYGROUPS (the
   twin of 0x43356d) and PROCESSFEATUREDIVERTER.
   The program and ScummVM differ in two lines, followed here as the
   program has them: in the last pair of 0x43356d (level 3's first
   layout) and of 0x4339fc, when the rest of the band shows four features
   or fewer, the program looks for the commonest feature excluding none
   (0x4339b6 and 0x433ddf push 0; the Mac's GETMOSTCOMMONATTRIBUTE is
   passed 0 too), where ScummVM excludes the slot just drawn. It cannot
   change a deal: the slot just drawn is one nobody left has, unless the
   band shows all twenty features, and then the rest show the key's
   other four values and so more than four.
   How bubbles move is the program's, read in ZOOMBI32.EXE and the Mac
   build's CODE 26 by its names. Each frame (the loop at 0x42f565, the
   Mac's MODULEDELAYPROC) first starts the captives set moving (the move
   queue 0x4afe98, last queued first), then deals with each bubble that
   has reached a square (the queue 0x4afe48, filled by the bubble's
   script at 0x431020, BUBBLEFLOATINGCALLBACK), by the square's type
   (0x42f974): nothing and type 7 go on (0x434948, CONTINUEONPATH); a
   whirlpool loses it (0x434c57, PROCESSBLACKHOLE); a feature arrow as
   above; a white or coloured arrow sends it its way, then turns to its
   next way if it turns once passed, at that moment (0x434f5c,
   PROCESSPLAINDIVERTER); a sticky square holds it, keeping the way it
   came (0x4351a4, PROCESSSTICKYSPOT); a coloured square turns every arrow
   of its colour and frees every captive of its colour, which goes on the
   way it came, and the bubble goes on (0x434ae9, PROCESSSWITCH); an exit
   takes it out at its corner, the upper right across (0x42fd15,
   DROPSNOIDONLEDGE). Going on means the next square, or the same square
   if that would leave the grid, and a captive held there is knocked on
   the same way the moment a bubble sets out for it (0x434948). A square
   takes seven frames; on the fourth a bubble claims the square it is
   entering, and a second claim before the first arrives pairs them
   (0x431020), and a pair is a collision: both are lost (0x4342fa,
   PROCESSCOLLISION). A launch's first square is the launcher's own for
   a launcher sending right or left, the next one on for one sending up
   (the drop at 0x4301d6). All of that is ScummVM's reading too, but for
   two things its answer finder does differently: it follows a knocked or
   freed captive only after the bubble that set it going has stopped, and
   treats a step off the grid as no launch. The port follows the program
   in both (zbMaze2Run); over 1,800 random level-4 launches the two never
   ended differently, and no route from a layout's own launchers meets the
   grid's edge, whatever its arrows. What the program
   also allows and the search here does not play is launching while other
   bubbles still float: a launcher is free again 34 frames after a drop
   (SCRB 9000's last event; 35 for 9001 and 9003), and up to ten bubbles
   may be out at once (0x430062). The tables are held to ScummVM's text
   and ZOOMBINI.EXE's bytes, the layouts as read here to a second reading
   of MAZE2's words, and the movement to a second, frame-by-frame reading
   and to MAZE2's movement scripts, by utilities/puzzles/maze2.mjs.
*/

/* The feature slots: slot s is trait kind (s - 1) / 5, value (s - 1) % 5 +
   1, kinds in ZB_TRAIT_KINDS order; slot 0 is hair 0, which no one has. */
const ZB_MAZE2_TRAIT_OFFSETS = [0, 5, 10, 15];
/* kSlotTraitCategories: the kind of each slot, 1-4 (0 for slot 0). */
const ZB_MAZE2_SLOT_CATEGORY = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
/* kPathSelectThresholds: the most Zoombinis a later feature may turn,
   by how many of the band are left. */
const ZB_MAZE2_THRESHOLDS = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 0, 1, 0];
/* kScoreToLoopCount: level 4's count of Zoombinis to set aside, by how
   many are left. */
const ZB_MAZE2_LOOPS = [1, 1, 1, 1, 4, 4, 4, 7, 7, 7, 10, 10, 10, 13, 13, 13, 16];
/* kStaticPathPool: each colour group's first shape in tBMP 5100; 31 is
   white, group 1's, and 52-178 the seven shuffled among groups 2-8. */
const ZB_MAZE2_COLOUR_POOL = [0, 31, 52, 73, 94, 115, 136, 157, 178, 0, 0];
/* ScummVM's names for them (MazeColorShapeBase). */
const ZB_MAZE2_COLOURS = { 31: 'white', 52: 'red', 73: 'orange', 94: 'yellow', 115: 'green', 136: 'cyan', 157: 'purple', 178: 'magenta' };

/* The launcher seats, 0-13 (the layout names them 1-14): the grid square
   each stands on (row, column) and the way its bubbles leave, 0-3.
   Seats 0-5 are at the lower left, 6-8 the upper left, 9-13 the lower
   right. kSeatGridCoords and kSeatMoveDirection. */
const ZB_MAZE2_SEATS = [
  [0, 9, 0], [1, 9, 0], [2, 9, 0], [4, 10, 1], [4, 11, 1], [4, 12, 1],
  [3, 0, 1], [3, 1, 1], [3, 2, 1],
  [12, 10, 0], [11, 10, 0], [10, 10, 0], [8, 11, 3], [8, 12, 3],
];
/* The eighteen exit squares round the grid's corners, before a layout is
   laid over them (kBaseNodeTypes, kBaseNodeCoords): type 20 the lower
   left, 21 the upper left, 22 the lower right, 23 the upper right. */
const ZB_MAZE2_EXITS = [
  [20, 0, 10], [20, 1, 10], [20, 2, 10], [20, 2, 11], [20, 2, 12],
  [21, 0, 2], [21, 1, 2], [21, 1, 1], [21, 1, 0],
  [22, 10, 12], [22, 10, 11], [22, 11, 11], [22, 12, 10],
  [23, 10, 0], [23, 10, 1], [23, 10, 2], [23, 11, 2], [23, 12, 3],
];

/* The layouts are MAZE2's REGS 16600-16609 but 16607, which the program
   never picks (its level-4 counter steps 0, 2, 0; ScummVM can restore
   it), read from the archive as loadAndParseRegsData reads them: a
   header of ten words, the number of records and nine launcher seats
   (1-14, or 0 for none), then ten-word records: type, row, column,
   colour group, the four ways it may point (0-3, as 1 or 0), the way it
   points, and whether it turns once a bubble has passed. Types: 1
   whirlpool, 2 feature arrow, 3 white arrow, 4 coloured arrow (white,
   and like a white arrow, in group 1), 5 sticky square, 6 coloured
   square; 0 and 7 do nothing. A direction is 0 up the screen (a column
   less), 1 right (a row more), 2 down (a column more), 3 left (a row
   less): the rows run left to right on the screen and the columns top to
   bottom, as REGS 16000 places them. Each level's first layout is the
   program's REGS 16600 + 2 x (level - 1) (0x431695), its second one on
   (two on at level 4). */
const ZB_MAZE2_FIRST_LAYOUT = [0, 16600, 16602, 16604, 16606];
const ZB_MAZE2_SMALL_LAYOUT = 16609;
const ZB_MAZE2_LAYOUT_IDS = [16600, 16601, 16602, 16603, 16604, 16605, 16606, 16608, 16609];
const ZB_MAZE2_WAYS = ['up', 'right', 'down', 'left'];

/* One layout from its REGS words, with ScummVM's checks: the record count
   the header gives, seats 0-14, known types, squares on the grid, groups
   0-8, directions 0-3, flags 0 or 1. Returns the launcher seats (0-13)
   and the records in order. */
function zbMaze2ParseLayout(id, w) {
  const bad = what => new Error(`Bubblewonder Abyss: MAZE2 REGS ${id} ${what}`);
  if (w.length < 10 || (w.length - 10) % 10) throw bad(`is ${w.length} words, not a ten-word header and ten-word records`);
  if (w[0] !== (w.length - 10) / 10) throw bad(`declares ${w[0]} records and holds ${(w.length - 10) / 10}`);
  const seats = [];
  for (let i = 1; i <= 9; i++) {
    if (w[i] < 0 || w[i] > 14) throw bad(`names launcher seat ${w[i]}`);
    if (w[i]) seats.push(w[i] - 1);
  }
  const cells = [];
  for (let i = 0; i < w[0]; i++) {
    const r = Array.from(w.slice(10 + 10 * i, 20 + 10 * i));
    const [type, row, col, group] = r;
    if (!((type >= 0 && type <= 7) || (type >= 20 && type <= 23)) || row < 0 || row > 12 || col < 0 || col > 12
      || group < 0 || group > 8 || r[8] < 0 || r[8] > 3 || r.slice(4, 8).concat(r[9]).some(f => f !== 0 && f !== 1)) {
      throw bad(`has a record out of range at ${i}: ${r.join(' ')}`);
    }
    cells.push({ type, row, col, group: group >= 1 ? group : 1, ways: r.slice(4, 8).map(Boolean), dir: r[8], turns: !!r[9] });
  }
  return { id, seats, cells };
}

/* A layout edited, as REGS words (parseRegs's numbers) in and out, for
   the page to write back (zbRegsBytes): the square at row, col made cell,
   { type 0-7, group 1-8, ways [4 booleans], dir 0-3, turns }, or emptied
   (null). The square's first record is rewritten where it stands, so the
   feature arrows keep their order and so the features dealt to them; any
   other record on it goes, and a square that had none gets its record
   last. A record of an exit (types 20-23) is left as it is. */
function zbMaze2EditSquare(words, row, col, cell) {
  const w = Array.from(words), n = w[0], recs = [];
  for (let i = 0; i < n; i++) recs.push(w.slice(10 + 10 * i, 20 + 10 * i));
  const here = r => r[1] === row && r[2] === col && r[0] <= 7;
  const rec = cell && [cell.type, row, col, cell.group, ...cell.ways.map(f => (f ? 1 : 0)), cell.dir, cell.turns ? 1 : 0];
  const first = recs.findIndex(here), out = [];
  recs.forEach((r, i) => { if (i === first && rec) out.push(rec); else if (!here(r)) out.push(r); });
  if (first < 0 && rec) out.push(rec);
  return [out.length, ...w.slice(1, 10), ...out.flat()];
}
/* The launcher seats (0-13, nine at most) put in a layout's words. */
function zbMaze2EditSeats(words, seats) {
  if (seats.length > 9 || seats.some(s => !(s >= 0 && s <= 13))) throw new Error('Bubblewonder Abyss: a layout has up to nine launchers, seats 1-14');
  const w = Array.from(words);
  for (let i = 0; i < 9; i++) w[1 + i] = i < seats.length ? seats[i] + 1 : 0;
  return w;
}

/* The layouts of an opened MAZE2 (openMohawk), by REGS id, read once an
   archive. A missing layout is an Error when a deal asks for it. */
const ZB_MAZE2_READ = new WeakMap();
function zbMaze2Layouts(arc) {
  if (!arc || typeof arc.has !== 'function') throw new Error('Bubblewonder Abyss: its deal needs MAZE2 opened (openMohawk), for its layouts');
  if (!ZB_MAZE2_READ.has(arc)) {
    const out = {};
    for (const id of ZB_MAZE2_LAYOUT_IDS) if (arc.has('REGS', id)) out[id] = zbMaze2ParseLayout(id, parseRegs(arc.get('REGS', id)));
    ZB_MAZE2_READ.set(arc, out);
  }
  return ZB_MAZE2_READ.get(arc);
}
function zbMaze2Layout(arc, id) {
  const layout = zbMaze2Layouts(arc)[id];
  if (!layout) throw new Error(`Bubblewonder Abyss: this MAZE2 has no REGS ${id}, the layout the program would deal on`);
  return layout;
}

/* The colours: groups 2-8 each take one of the pool's seven, drawn in
   turn from those left (initGridAndSelectPaths, 0x431754). Returns
   waveGroupShapeBase, groups 0-8. */
function zbMaze2Colours(rnd) {
  const pool = ZB_MAZE2_COLOUR_POOL.slice(), shape = new Array(9).fill(0);
  shape[1] = ZB_MAZE2_COLOUR_POOL[1];
  let last = 8;
  for (let group = 2; group < 9; group++) {
    const i = rnd.range(2, last);
    shape[group] = pool[i];
    for (let p = i; p < last + 1; p++) pool[p] = pool[p + 1];
    last -= 1;
  }
  return shape;
}

/* The feature slots the program deals for a band, in the order the
   feature arrows take them. layoutLevel is the level, or 5 for level 4's
   small band; variant the layout counter (0 or 1; 0 or 2 at level 4).
   Each helper is the program's, named as ScummVM names it. */
function zbMaze2Slots(layoutLevel, variant, band, rnd) {
  const n = band.length, OFF = ZB_MAZE2_TRAIT_OFFSETS;
  const pack = band.map(z => ZB_TRAIT_KINDS.map(k => z[k]));
  const zero = () => [0, 0, 0, 0];
  let cand = band.map(zero);            // _pathCandidateTraits
  let counts = new Array(21).fill(0);   // _pathTraitMatchCounts
  let conn = [], reach = new Array(21).fill(0), reachCount = 0, free = [], freeCount = 0;
  const uniq = [], committed = [];      // _uniqueCheckTraits, _committedTraits
  for (let i = 0; i < 20; i++) { uniq.push(zero()); committed.push(zero()); }
  let committedCount = 0;
  const slots = [];                     // _selectedPathSlots

  const collectZmbTraits = () => { cand = pack.map(t => t.slice()); };
  const tally = () => {
    counts = new Array(21).fill(0);
    for (const c of cand) if (c[0] > 0) for (let t = 0; t < 4; t++) counts[OFF[t] + c[t]]++;
  };
  const removeMatchingPathCandidatesAndRecount = slot => {
    counts = new Array(21).fill(0);
    let remaining = 0;
    for (let i = 0; i < n; i++) {
      let kept = true;
      for (let t = 0; t < 4; t++) {
        if (cand[i][t] && OFF[t] + cand[i][t] === slot && slot) { kept = false; cand[i] = zero(); break; }
      }
      if (kept) {
        for (let t = 0; t < 4; t++) {
          if (cand[i][t]) counts[OFF[t] + cand[i][t]]++;
          else { kept = false; break; }
        }
      }
      if (kept) remaining++;
    }
    return remaining;
  };
  const collectMatchingPathCandidates = slot => {
    cand = pack.map(t => (t.some((v, k) => OFF[k] + v === slot) ? t.slice() : zero()));
  };
  const initConnectionTable = () => { conn = counts.map((c, i) => (c ? 0 : i)); };
  const rebuildReachabilityList = () => {
    reach = new Array(21).fill(0); reachCount = 0;
    for (let i = 0; i < 21; i++) if (conn[i]) reach[++reachCount] = conn[i];
    return reachCount;
  };
  const initAllSlotsReachable = () => { reach = counts.map((c, i) => i); reachCount = 20; };
  const initFreePathSlotList = () => {
    free = counts.map((c, i) => (c ? 0 : i));
    freeCount = free.filter(Boolean).length;
  };
  /* Drawn from 1 to the number of slots, as the program draws; with none
     it asks for 0 to 0, which does not step the generator. */
  const randomReachableSlot = () => (reachCount > 0 ? reach[rnd.range(1, reachCount)] : reach[0]);
  /* The program's quirk (0x4336a8): the draw is 1 to the number of free
     slots, but it indexes the list of all 21, where a slot someone has is
     0. */
  const randomFreePathSlot = () => (freeCount > 0 ? free[rnd.range(1, freeCount)] : free[0]);
  const getTraitMatchCount = slot => (slot >= 0 && slot < 21 ? counts[slot] : 0);
  const countScoredPathSlots = () => counts.slice(1).filter(Boolean).length;
  const findBestTraitSlotInRange = (min, max) => {
    let best = 0, score = 0;
    for (let s = 1; s < 21; s++) if (min <= counts[s] && counts[s] <= max && score < counts[s]) { score = counts[s]; best = s; }
    return best;
  };
  /* Slots 1-19 only, of the excluded slot's kind: the program's loop
     stops short of slot 20. */
  const findHighestScoredSlotInRange = (ex, min, max) => {
    let best = 0, score = 0;
    for (let s = 1; s < 20; s++) {
      if (ZB_MAZE2_SLOT_CATEGORY[s] === ZB_MAZE2_SLOT_CATEGORY[ex] && min <= counts[s] && counts[s] <= max && score < counts[s]) { score = counts[s]; best = s; }
    }
    return best;
  };
  const findHighestScoredSlot = ex => {
    let best = 0, score = 0;
    for (let s = 1; s < 21; s++) if (score < counts[s] && s !== ex) { score = counts[s]; best = s; }
    return best;
  };
  /* Whether candidate z's value of trait t is new against rows of a
     table (one trait's column), or against all four columns. */
  const newInColumn = (rows, z, t) => !rows.some(r => r[t] > 0 && r[t] === cand[z][t]);
  const newInAll = (rows, z) => !rows.some(r => [0, 1, 2, 3].some(t => r[t] > 0 && r[t] === cand[z][t]));
  /* The first candidate, in band order, holding slot s and passing the
     test: its index and trait, or null. */
  const firstHolder = (s, test) => {
    for (let z = 0; z < n; z++) {
      for (let t = 0; t < 4; t++) {
        if (cand[z][t] <= 0 || OFF[t] + cand[z][t] !== s) continue;
        if (test(z, t)) return { z, t };
        break;
      }
    }
    return null;
  };
  /* The rarest slot (count at least 1; a later slot wins a tie) with a
     holder whose value is new in its column while fewer than four are
     committed; that Zoombini's traits are committed, and everyone with
     the slot removed (0x4324a2). */
  const findBestNextSlot = searchIdx => {
    let best = 0, bestZ = -1, min = 21;
    for (let s = 1; s < 21; s++) {
      if (counts[s] <= 0 || min < counts[s] || searchIdx === s) continue;
      const h = firstHolder(s, (z, t) => committedCount >= 4 || newInColumn(uniq, z, t));
      if (h) { best = s; bestZ = h.z; min = counts[s]; }
    }
    if (best) {
      if (committedCount < 20) uniq[committedCount++] = cand[bestZ].slice();
      for (const c of cand) for (let t = 0; t < 4; t++) if (c[t] && OFF[t] + c[t] === best) { c.fill(0); break; }
      tally();
    }
    return best;
  };
  /* The commonest slot with a count from min to max (the first wins a
     tie) with a holder new in its column against every row; all its
     holders committed and removed (0x432810). */
  const commitBestTraitSlot = (max, min) => {
    let best = 0, score = 0;
    for (let s = 1; s < 21; s++) {
      if (counts[s] <= score || counts[s] < min || max < counts[s]) continue;
      if (firstHolder(s, (z, t) => newInColumn(uniq, z, t))) { best = s; score = counts[s]; }
    }
    if (best) {
      for (const c of cand) {
        for (let t = 0; t < 4; t++) {
          if (c[t] && OFF[t] + c[t] === best) {
            if (committedCount < 20) { committed[committedCount] = c.slice(); uniq[committedCount] = c.slice(); committedCount++; }
            c.fill(0);
            break;
          }
        }
      }
      tally();
    }
    return best;
  };
  /* The rarest slot (a later slot wins a tie) whose first holder shares
     no value with any committed row while fewer than three are
     committed; only that Zoombini is removed. In mode 0 only the slot's
     own column is kept for later tests (0x4320ab). */
  const findAndCommitNextSlot = (mode, ex) => {
    let best = 0, bestZ = -1, bestT = 0, min = 21;
    for (let s = 1; s < 21; s++) {
      if (counts[s] <= 0 || min < counts[s] || ex === s) continue;
      const h = firstHolder(s, z => committedCount >= 3 || newInAll(uniq, z));
      if (h) { best = s; bestZ = h.z; bestT = h.t; min = counts[s]; }
    }
    if (best) {
      if (committedCount < 4) {
        committed[committedCount] = cand[bestZ].slice();
        if (mode) uniq[committedCount] = cand[bestZ].slice();
        else { uniq[committedCount] = zero(); uniq[committedCount][bestT] = cand[bestZ][bestT]; }
        committedCount++;
      }
      cand[bestZ] = zero();
      tally();
    }
    return best;
  };
  /* The commonest slot with a count from min to max whose first holder
     shares no value with any committed Zoombini; all its holders
     committed and removed (0x432b37). */
  const findAndCommitNewTraitSlot = (max, min) => {
    let best = 0, score = 0;
    for (let s = 1; s < 21; s++) {
      if (counts[s] <= score || counts[s] < min || max < counts[s]) continue;
      if (firstHolder(s, z => newInAll(committed, z))) { best = s; score = counts[s]; }
    }
    if (best) {
      for (const c of cand) {
        for (let t = 0; t < 4; t++) {
          if (c[t] && OFF[t] + c[t] === best) {
            if (committedCount < 20) committed[committedCount++] = c.slice();
            c.fill(0);
            break;
          }
        }
      }
      tally();
    }
    return best;
  };
  /* The opening the four selectors below share: count the band, and the
     slots nobody has are the "reachable" ones (all twenty, if the band
     has every feature). */
  const open = () => {
    collectZmbTraits();
    const survivors = removeMatchingPathCandidatesAndRecount(0);
    initConnectionTable();
    if (!rebuildReachabilityList()) initAllSlotsReachable();
    return survivors;
  };
  /* The key feature: two to five of the band if it can (one or two for a
     band under three), else six to nine, ten to sixteen, then any. */
  const keySlot = survivors => (survivors < 3 ? findBestTraitSlotInRange(1, 2)
    : findBestTraitSlotInRange(2, 5) || findBestTraitSlotInRange(6, 9)
      || findBestTraitSlotInRange(10, 16) || findBestTraitSlotInRange(1, 16)) || randomReachableSlot();
  /* The last pair, from the rest when they show more than four features:
     the commonest within the threshold, then the commonest of the same
     kind among those left, the rarer first; `fallback` when either finds
     nothing. */
  const lastPair = (left, fallback) => {
    const thr = ZB_MAZE2_THRESHOLDS[left];
    let a = findBestTraitSlotInRange(1, thr), sa = 0;
    if (a) sa = getTraitMatchCount(a); else a = fallback();
    removeMatchingPathCandidatesAndRecount(a);
    let b = findHighestScoredSlotInRange(a, 1, thr), sb = 0;
    if (b) sb = getTraitMatchCount(b); else b = fallback();
    if (sb < sa) [a, b] = [b, a];
    slots.push(a, b);
  };

  if (layoutLevel === 1) {
    /* buildZmbAssignmentAlt2 (0x43302b): the key on two arrows (three for
       a variant 2 that level 1 never has), then the last pair. */
    const key = keySlot(open());
    slots.push(key, key);
    if (variant === 2) slots.push(key);
    const left = removeMatchingPathCandidatesAndRecount(key);
    if (countScoredPathSlots() <= 4) slots.push(randomReachableSlot(), randomReachableSlot());
    else lastPair(left, randomReachableSlot);
  } else if (layoutLevel === 2 && variant === 0) {
    /* buildZmbAssignmentAlt (0x4332bb): the key on three arrows. */
    const key = keySlot(open());
    slots.push(key, key, key);
    const left = removeMatchingPathCandidatesAndRecount(key);
    if (countScoredPathSlots() <= 4) {
      let a = findHighestScoredSlot(0), sa = 0;
      if (a) sa = getTraitMatchCount(a); else a = randomReachableSlot();
      const b = randomReachableSlot();
      slots.push(...(0 < sa ? [b, a] : [a, b]));
    } else lastPair(left, randomReachableSlot);
  } else if (layoutLevel === 2 || (layoutLevel === 3 && variant === 0)) {
    /* selectPathSlots2 (0x43356d): the key twice, then three features
       among the key's holders, rarest first (the first twice at level 2),
       then the last pair among the rest. */
    const key = keySlot(open());
    slots.push(key, key);
    collectMatchingPathCandidates(key);
    removeMatchingPathCandidatesAndRecount(0);
    initFreePathSlotList();
    for (let phase = 0; phase < 3; phase++) {
      const mid = findBestNextSlot(key) || randomFreePathSlot() || randomReachableSlot();
      slots.push(mid);
      if (layoutLevel === 2 && phase === 0) slots.push(mid);
    }
    collectZmbTraits();
    const left = removeMatchingPathCandidatesAndRecount(key);
    if (countScoredPathSlots() <= 4) {
      if (variant === 1) {
        slots.push(findHighestScoredSlot(0) || randomReachableSlot());
        slots.push(randomReachableSlot());
      } else {
        slots.push(randomReachableSlot());
        /* The program excludes nothing here (0x4339b6); ScummVM excludes
           the slot just drawn, which has no holders, so the same. */
        slots.push(findHighestScoredSlot(0) || randomReachableSlot());
      }
    } else lastPair(left, randomReachableSlot);
  } else if (layoutLevel === 3 || layoutLevel === 5) {
    /* selectPathSlots (0x4339fc): a rare feature set aside first, the key
       (the commonest, of a Zoombini new in that feature's column) twice,
       the rare one twice, two more among the key's holders, then the
       last pair among those with neither. */
    const survivors = open();
    const rare = findBestNextSlot(0);
    const key = (survivors < 2 ? commitBestTraitSlot(1, 1)
      : commitBestTraitSlot(4, 2) || commitBestTraitSlot(8, 5) || commitBestTraitSlot(12, 9)
        || commitBestTraitSlot(16, 1)) || randomReachableSlot();
    slots.push(key, key);
    collectMatchingPathCandidates(key);
    removeMatchingPathCandidatesAndRecount(0);
    initFreePathSlotList();
    slots.push(rare, rare);
    for (let phase = 0; phase < 2; phase++) slots.push(findBestNextSlot(key) || randomFreePathSlot() || randomReachableSlot());
    collectZmbTraits();
    removeMatchingPathCandidatesAndRecount(key);
    const left = removeMatchingPathCandidatesAndRecount(rare);
    initFreePathSlotList();
    if (countScoredPathSlots() <= 4) {
      slots.push(randomFreePathSlot());
      /* 0x433ddf pushes 0 here too, where ScummVM excludes the free slot,
         which has no holders, so the same. */
      slots.push(findHighestScoredSlot(0) || randomFreePathSlot());
    } else lastPair(left, () => randomFreePathSlot() || randomReachableSlot());
  } else {
    /* buildZmbAssignmentList (0x433e25): three rare features of three
       Zoombinis who share none, and a fourth kept back; Zoombinis set
       aside by lone features, the first of which goes on an arrow; the
       fourth; two features of Zoombinis sharing none with those set
       aside; two features drawn from all twenty. */
    open();
    for (let i = 0; i < 3; i++) slots.push(findAndCommitNextSlot(0, 0) || randomReachableSlot());
    const reserved = findAndCommitNextSlot(0, 0) || randomReachableSlot();
    removeMatchingPathCandidatesAndRecount(slots[0]);
    removeMatchingPathCandidatesAndRecount(slots[1]);
    const target = ZB_MAZE2_LOOPS[removeMatchingPathCandidatesAndRecount(slots[2])];
    for (let progress = 0, remaining = 0; progress < target; progress++) {
      if (!progress) {
        const s = commitBestTraitSlot(1, 1) || slots[rnd.range(0, 2)];
        const m = getTraitMatchCount(s);
        removeMatchingPathCandidatesAndRecount(s);
        slots.push(s);
        progress = m;
        remaining = target - m;
      } else if (remaining) {
        const s = commitBestTraitSlot(remaining, 1) || randomReachableSlot();
        const m = getTraitMatchCount(s);
        removeMatchingPathCandidatesAndRecount(s);
        progress += m;
        remaining = target - progress;
      }
    }
    slots.push(reserved);
    collectZmbTraits();
    removeMatchingPathCandidatesAndRecount(0);
    initConnectionTable();
    const had = rebuildReachabilityList() !== 0;
    if (!had) initAllSlotsReachable();
    removeMatchingPathCandidatesAndRecount(reserved);
    for (let i = 0; i < 2; i++) {
      const s = findAndCommitNewTraitSlot(3, 1) || (had ? randomReachableSlot() : slots[0]);
      removeMatchingPathCandidatesAndRecount(s);
      slots.push(s);
    }
    slots.push(rnd.range(1, 20), rnd.range(1, 20));
  }
  return slots;
}

/* A slot's trait: { kind, value }, kind 'hair'...'feet' (slot 0: hair 0). */
function zbMaze2SlotTrait(slot) {
  return { kind: ZB_TRAIT_KINDS[slot ? Math.floor((slot - 1) / 5) : 0], value: slot ? (slot - 1) % 5 + 1 : 0 };
}
/* Whether a Zoombini has a feature arrow's feature (0x434d7c). */
function zbMaze2Turns(z, cell) { return cell.value > 0 && z[cell.kind] === cell.value; }

/* The grid as dealt: the exits, then the layout's cells over them, each
   feature arrow with the next slot's feature (registerGridCellState). */
function zbMaze2Grid(layout, slots, shapes) {
  const grid = Array.from({ length: 13 }, () => new Array(13).fill(null));
  for (const [type, row, col] of ZB_MAZE2_EXITS) grid[row][col] = { type, row, col };
  let next = 0;
  const cells = layout.cells.map((c, i) => {
    const cell = { ...c, index: i, colour: ZB_MAZE2_COLOURS[shapes[c.group]] || null };
    if (c.type === 2 && next < slots.length) Object.assign(cell, zbMaze2SlotTrait(slots[next]), { slot: slots[next++] });
    grid[c.row][c.col] = cell;
    return cell;
  });
  return { grid, cells };
}

/* One Zoombini sent first from a seat, the rest of the band waiting: where
   its bubble ends (ScummVM's simulateNextLaunch, with the program's edge).
   A white or coloured arrow that turns once passed turns on a copy of the
   directions; a coloured square turns its colour's arrows. 'across',
   'back' (the lower left), 'upper left', 'lower right', 'whirlpool',
   'held' (a sticky square) or 'loops'. */
function zbMaze2Launch(dealt, z, seat) {
  const dirs = dealt.grid.map(r => r.map(c => (c && c.dir !== undefined ? c.dir : 0)));
  const turn = c => {
    for (let a = 0; a < 4; a++) {
      dirs[c.row][c.col] = (dirs[c.row][c.col] + 1) % 4;
      if (c.ways[dirs[c.row][c.col]]) break;
    }
  };
  let [row, col, dir] = ZB_MAZE2_SEATS[seat];
  /* Seats that launch right or left start on their own square. */
  if (dir === 1) row -= 1; else if (dir === 3) row += 1;
  for (let step = 0; step < 256; step++) {
    const [pr, pc] = [row, col];
    if (dir === 0) col--; else if (dir === 1) row++; else if (dir === 2) col++; else row--;
    /* A step off the grid stays on its square (0x434948). */
    if (row < 0 || row > 12 || col < 0 || col > 12) { row = pr; col = pc; }
    const c = dealt.grid[row][col];
    if (!c) continue;
    if (c.type === 1) return 'whirlpool';
    if (c.type === 2) { if (zbMaze2Turns(z, c)) dir = dirs[row][col]; }
    else if (c.type === 3 || c.type === 4) { dir = dirs[row][col]; if (c.turns) turn(c); }
    else if (c.type === 5) return 'held';
    else if (c.type === 6) {
      if (c.group > 1) for (const o of dealt.cells) if (o.group === c.group && o.type === 4) turn(o);
    } else if (c.type >= 20) return ['back', 'upper left', 'lower right', 'across'][c.type - 20];
  }
  return 'loops';
}


const ZB_MAZE2_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/* The groups' colours as a diagram paints them: near enough to tell apart,
   by ScummVM's names for tBMP 5100's banks, not read from its pixels. */
const ZB_MAZE2_HEX = { white: '#e8ecf2', red: '#e0483c', orange: '#f0902a', yellow: '#eed23a', green: '#52c04c', cyan: '#3ec6d6', purple: '#9058d4', magenta: '#dc4cb8' };

/* The layouts a level may take: its two, or level 4's own for a band
   under five. */
function zbMaze2LevelLayouts(level, band) {
  if (level === 4) return band.length < 5 ? [ZB_MAZE2_SMALL_LAYOUT] : [ZB_MAZE2_FIRST_LAYOUT[4], ZB_MAZE2_FIRST_LAYOUT[4] + 2];
  return [ZB_MAZE2_FIRST_LAYOUT[level], ZB_MAZE2_FIRST_LAYOUT[level] + 1];
}

/* A puzzle's state, by ScummVM's names, from its layout, the slots its
   feature arrows take and the colours: what deal and edit both return. */
function zbMaze2State(level, band, layout, variant, slots, shapes) {
  const dealt = zbMaze2Grid(layout, slots, shapes);
  const lowerLeft = layout.seats.filter(s => s < 6);
  return {
    layoutLevel: layout.id === ZB_MAZE2_SMALL_LAYOUT ? 5 : level, levelVariantIdx: variant, mazeLayoutRegsId: layout.id,
    waveGroupShapeBase: shapes, selectedPathSlots: slots,
    traitArrows: dealt.cells.filter(c => c.type === 2).map(c => ({ row: c.row, col: c.col, direction: c.dir,
      traitCategory: c.value ? ZB_TRAIT_KINDS.indexOf(c.kind) + 1 : 1, traitValue: c.value, slot: c.slot })),
    launcherSeats: layout.seats, launches: band.map(z => lowerLeft.map(s => zbMaze2Launch(dealt, z, s))),
  };
}

/* A feature slot as a form's value, and back: 'none' or 'kind:value'. */
function zbMaze2SlotOption(slot) { const t = zbMaze2SlotTrait(slot); return slot ? `${t.kind}:${t.value}` : 'none'; }
function zbMaze2OptionSlot(v) {
  if (v === 'none') return 0;
  const { kind, value } = zbTraitOption(v);
  const k = ZB_TRAIT_KINDS.indexOf(kind);
  return k >= 0 && value >= 1 && value <= 5 ? ZB_MAZE2_TRAIT_OFFSETS[k] + value : -1;
}

ZB_PUZZLES.set('MAZE2', {
  about: 'Each Zoombini floats across a grid of squares in a bubble, launched from the lower left. White arrows send every bubble their way; an arrow showing a feature, such as a red nose, turns only the Zoombinis with that feature. The order the band is sent in matters, since some arrows turn once a bubble has passed.',
  levels: [
    { rule: 'Four feature arrows. The first two show one feature, the commonest that two to five of the band share; the other two show features of the rest of the band, each held by no more than half of those left, or, if the rest are all alike, features nobody has, drawn at random. The two layouts (REGS 16600 and 16601) take turns.',
      chances: 'None counted. A Zoombini whose bubble falls into a whirlpool, or meets another bubble, does not cross; one that floats back to the lower left may be sent again.',
      notes: ['The program starts every session on each level’s first layout and alternates; ScummVM has an option to start on either.'] },
    { rule: 'On the first layout (REGS 16602) the shared feature goes on three of five feature arrows. The second (16603) has coloured squares, which turn the arrows of their colour, and eight feature arrows: the shared feature on two, three features of the Zoombinis that have it, each the rarest left and the first of them twice, and two of the rest, as at level 1.',
      chances: 'None counted, as at every level.' },
    { rule: 'Seven feature arrows on the first layout (REGS 16604), dealt as level 2’s second but with the first of the three once; eight on the second (16605), where one rare feature is set aside first and goes on two arrows beside the shared feature’s two, then two features of the shared feature’s holders and two of the rest.',
      chances: 'None counted, as at every level.' },
    { rule: 'Nine feature arrows (REGS 16606 and 16608 in turn; 16609, with eight dealt as level 3’s second, for a band of fewer than five): three rare features, each of a Zoombini without the ones before, a feature that one of the rest alone has (else one of the three again), a fourth rare feature, two features of Zoombinis sharing none with those set aside, and two of all twenty drawn at random. Sticky squares hold a bubble, and the band may have to go by way of the upper left or the lower right.',
      chances: 'None counted, as at every level.',
      notes: ['ScummVM can restore a third layout, REGS 16607, which the program never picks: its level-4 counter steps by two.'] },
  ],
  archive: 'MAZE2',
  deal(level, band, rnd, journey = {}, arc) {
    /* The program's layout counters, one a level, kept for the session:
       held in journey.maze2Next, [level 1, 2, 3, 4], all 0 to begin. */
    const next = journey.maze2Next || (journey.maze2Next = [0, 0, 0, 0]);
    const small = level === 4 && band.length < 5;
    const layoutLevel = small ? 5 : level;
    const variant = small ? 0 : next[level - 1];
    const id = small ? ZB_MAZE2_SMALL_LAYOUT : ZB_MAZE2_FIRST_LAYOUT[level] + variant;
    const layout = zbMaze2Layout(arc, id);
    const shapes = zbMaze2Colours(rnd);
    const slots = zbMaze2Slots(layoutLevel, variant, band, rnd);
    if (!small) next[level - 1] = level === 4 ? (variant + 2 > 2 ? 0 : variant + 2) : (variant + 1 > 1 ? 0 : variant + 1);
    const state = zbMaze2State(level, band, layout, variant, slots, shapes);
    const dealt = zbMaze2Grid(layout, slots, shapes);

    const arrows = dealt.cells.filter(c => c.type === 2);
    const count = t => dealt.cells.filter(c => c.type === t).length;
    const white = dealt.cells.filter(c => (c.type === 3 || c.type === 4) && c.group <= 1);
    const coloured = dealt.cells.filter(c => c.type === 4 && c.group > 1);
    const colours = [...new Set(dealt.cells.filter(c => c.group > 1 && c.type >= 4 && c.type <= 6).map(c => c.colour))];
    const lowerLeft = layout.seats.filter(s => s < 6), others = layout.seats.filter(s => s >= 6);
    const where = c => `${c.row + 1} across and ${c.col + 1} down`;
    const many = (n, one) => `${n || 'no'} ${one}${n === 1 ? '' : 's'}`;
    const parts = [many(arrows.length, 'feature arrow'),
      `${many(white.length, 'white arrow')} (${white.filter(c => c.turns).length || 'none'} turning once a bubble has passed)`];
    if (coloured.length) parts.push(many(coloured.length, 'coloured arrow'), many(count(6), 'coloured square'));
    if (count(5)) parts.push(many(count(5), 'sticky square'));
    parts.push(many(count(1), 'whirlpool'));
    const setup = [
      `Layout REGS ${id}, ${small ? 'level 4’s own for a band under five' : `the ${variant ? 'second' : 'first'} of level ${level}’s two`}: ${zbWordsOr(parts, 'and')}.`,
      `${many(band.length, 'Zoombini')} wait${band.length === 1 ? 's' : ''} at the lower left, with ${many(lowerLeft.length, 'launcher')} there`
        + (others.length ? ` and one more at the ${others.map(s => (s < 9 ? 'upper left' : 'lower right')).join(' and ')}.` : '.'),
    ];
    if (colours.length) setup.push(`Its colours are ${zbWordsOr(colours, 'and')}.`);

    const launches = state.launches;
    const answer = ['Nothing is hidden: each feature arrow shows its feature. The deal chose these.'];
    arrows.forEach((c, i) => {
      const n = band.filter(z => zbMaze2Turns(z, c)).length;
      answer.push(`${ZB_MAZE2_LETTERS[i]}, ${where(c)}, pointing ${ZB_MAZE2_WAYS[c.dir]}: `
        + (c.value ? `Zoombinis with ${zbTraitWith(c.kind, c.value)} (${n || 'none'} of this band).` : 'no feature, so it turns nobody.'));
    });
    const across = lowerLeft.map((s, j) => launches.filter(l => l[j] === 'across').length);
    answer.push(`Sent first, ${lowerLeft.map((s, j) => `${across[j]} of ${band.length} would cross from launcher ${j + 1}`).join(', and ')}.`);
    const marks = band.map((z, i) => {
      const by = arrows.map((c, k) => (zbMaze2Turns(z, c) ? ZB_MAZE2_LETTERS[k] : '')).filter(Boolean);
      return `turned by ${by.length ? zbWordsOr(by, 'and') : 'no feature arrow'}; sent first: `
        + launches[i].map((o, j) => `${j + 1} ${o}`).join(', ');
    });
    return { setup, answer, marks, state };
  },
  /* Nothing is hidden, but the program chooses the layout and the features
     the feature arrows show: those are the fields. */
  form(level, band, state, arc) {
    const layouts = zbMaze2LevelLayouts(level, band);
    const layout = zbMaze2Layout(arc, state.mazeLayoutRegsId);
    const arrows = layout.cells.filter(c => c.type === 2);
    const nth = ['first', 'second', 'third'];
    return [
      { key: 'layout', label: 'Layout', kind: 'choice', value: state.mazeLayoutRegsId,
        options: layouts.map((id, k) => ({ value: id, label: `REGS ${id}${layouts.length > 1 ? `, the ${nth[k]}` : ', for a band under five'} (${zbMaze2Layout(arc, id).cells.filter(c => c.type === 2).length} feature arrows)` })) },
      ...arrows.map((c, k) => ({ key: `a${k + 1}`, label: `Arrow ${ZB_MAZE2_LETTERS[k]}, ${c.row + 1} across and ${c.col + 1} down, pointing ${ZB_MAZE2_WAYS[c.dir]}, shows`,
        kind: 'choice', value: zbMaze2SlotOption(state.selectedPathSlots[k] || 0), options: [{ value: 'none', label: 'No feature' }, ...zbTraitOptions()] })),
      { key: 'note', kind: 'note', note: 'The rest of each layout, its launchers and its colours stay as they are. Another layout takes the arrows’ features in order, and an arrow past those given shows none.' },
    ];
  },
  edit(level, band, state, values, arc) {
    const layouts = zbMaze2LevelLayouts(level, band);
    const id = Number(values.layout != null ? values.layout : state.mazeLayoutRegsId);
    if (!layouts.includes(id)) throw new Error(`At level ${level}${level === 4 ? (band.length < 5 ? ', for a band under five,' : ', for a band of five or more,') : ''} the layout is REGS ${zbWordsOr(layouts.map(String))}.`);
    const layout = zbMaze2Layout(arc, id);
    const n = layout.cells.filter(c => c.type === 2).length;
    const slots = [];
    for (let k = 0; k < n; k++) {
      const v = values[`a${k + 1}`];
      const slot = v == null ? 0 : zbMaze2OptionSlot(v);
      if (slot < 0) throw new Error(`Arrow ${ZB_MAZE2_LETTERS[k]}: "${v}" is not a feature.`);
      slots.push(slot);
    }
    const variant = id === ZB_MAZE2_SMALL_LAYOUT ? 0 : id - ZB_MAZE2_FIRST_LAYOUT[level];
    return Object.assign(zbMaze2State(level, band, layout, variant, slots, state.waveGroupShapeBase), { edited: true });
  },
  solve(level, band, state, arc, opts = {}) { return zbMaze2Solve(band, state, arc, opts); },
  source: 'ScummVM’s puzzle_maze.cpp, its dealing and the feature arrows checked against the program’s code, and the layouts read from MAZE2.',
});

/* ---- solving ------------------------------------------------------------
   With the grid known, how many of the band can float across, and in what
   order, sending one Zoombini at a time and waiting until every bubble has
   stopped: the orders ScummVM's own answer finder plays, each launch
   played frame by frame as the program plays it (zbMaze2Run). Launching
   while others float is not searched; zbMaze2CanCross bounds what it could
   add. */

/* The next way an arrow may point (debugMazeNextDirection). */
function zbMaze2Next(d, ways) {
  for (let a = 0; a < 4; a++) { d = (d + 1) % 4; if (ways[d]) break; }
  return d;
}
/* Where a seat's bubble starts, one square behind for the seats that
   launch right or left, so their own square is the first it meets. */
function zbMaze2SeatStart(seat) {
  const [r, c, d] = ZB_MAZE2_SEATS[seat];
  return [d === 1 ? r - 1 : d === 3 ? r + 1 : r, c, d];
}
function zbMaze2Corner(seat) { return seat < 6 ? 0 : seat < 9 ? 1 : 2; }

/* The grid as the solver reads it: squares by position (a cell's index,
   -1 for an empty square, -2 to -5 for an exit, lower left to upper
   right), the Zoombinis in kinds (those the same feature arrows turn go
   the same ways), the arrows whose way can change, the sticky squares,
   and each colour's arrows and sticky squares. */
function zbMaze2Board(band, state, arc) {
  const layout = zbMaze2Layout(arc, state.mazeLayoutRegsId);
  const dealt = zbMaze2Grid(layout, state.selectedPathSlots, state.waveGroupShapeBase);
  const cells = dealt.cells, at = new Int16Array(169).fill(-1);
  for (const [type, row, col] of ZB_MAZE2_EXITS) at[row * 13 + col] = 18 - type;
  cells.forEach((c, i) => { at[c.row * 13 + c.col] = i; });
  const arrowK = cells.map(() => -1);
  const arrows = [];
  cells.forEach((c, i) => { if (c.type === 2) { arrowK[i] = arrows.length; arrows.push(c); } });
  const masks = band.map(z => arrows.reduce((m, c, k) => (zbMaze2Turns(z, c) ? m | 1 << k : m), 0));
  const kinds = [], kindOf = masks.map(m => { let k = kinds.findIndex(x => x.mask === m); if (k < 0) { k = kinds.length; kinds.push({ mask: m, members: [] }); } return k; });
  band.forEach((z, i) => kinds[kindOf[i]].members.push(i));
  const ctrl = [], sticky = [], groupCells = {};
  cells.forEach((c, i) => {
    if ((c.type === 3 || c.type === 4) && (c.turns || (c.type === 4 && c.group > 1))) ctrl.push(i);
    if (c.type === 5) sticky.push(i);
    if (c.type === 4 || c.type === 5) (groupCells[c.group] = groupCells[c.group] || []).push(i);
  });
  return { layout, dealt, cells, at, arrowK, arrows, kinds, kindOf, ctrl, sticky, groupCells, seats: layout.seats };
}

/* A bubble takes ZB_MAZE2_STEP frames a square: the movement scripts, SCRS
   15015-15034, are seven frames each, the last saying it has arrived. On
   the fourth (frame 3) it claims the square it is entering; a second
   bubble claiming the same square before the first arrives is a
   collision, and both are lost (the program's 0x431020 and 0x4342fa). */
const ZB_MAZE2_STEP = 7;
const ZB_MAZE2_CLAIM = 3;

/* One launch, played frame by frame as the program plays it, until every
   bubble it sets moving has stopped. token (a kind, or a band member)
   starts from start [row, col, direction]. Each frame the bubbles that
   reach a square are dealt with by its type (the program's per-frame
   loop, the Mac's MODULEDELAYPROC, dispatching as 0x42f974 does), and one
   that goes on starts its next square the frame after. A captive knocked
   off a sticky square by a bubble setting out for it, or freed by a
   coloured square, starts a frame later still (the move queue, 0x4afe98),
   so it moves along with the bubble that set it going. A step off the
   grid stays on its square and meets it again (0x434948). The world w
   keeps the arrows' ways and the captives and is told where each bubble
   ends. False if bubbles are still moving after 256 squares' time. */
function zbMaze2Run(B, w, token, start) {
  if (!B.sticky.length) return zbMaze2RunAlone(B, w, token, start);
  const movers = [], queue = [], claims = new Map(), pairs = [];
  let made = 0;
  /* CONTINUEONPATH: the next square, held to the grid; a captive there is
     knocked on, the way this bubble is going. */
  const begin = (m, at, ready) => {
    let r = m.r, c = m.c;
    if (m.d === 0) c--; else if (m.d === 1) r++; else if (m.d === 2) c++; else r--;
    if (r < 0 || r > 12 || c < 0 || c > 12) { r = m.r; c = m.c; }
    const a = B.at[r * 13 + c];
    if (a >= 0 && B.cells[a].type === 5) {
      const cap = w.held(a);
      if (cap >= 0) { w.hold(a, -1, 0); queue.push({ t: cap, r, c, d: m.d, ready }); if (w.knocked) w.knocked(cap, a); }
    }
    m.tr = r; m.tc = c; m.s = at; m.claimed = false;
  };
  const add = (t, r, c, d, at, ready) => {
    const m = { t, r, c, d, n: made++, gone: false };
    if (w.path) w.path(t, r, c, true);
    begin(m, at, ready);
    movers.push(m);
  };
  const stop = m => { m.gone = true; movers.splice(movers.indexOf(m), 1); };
  const arriving = [];
  add(token, start[0], start[1], start[2], 0, 0);
  for (let tick = 0; tick < 256 * ZB_MAZE2_STEP;) {
    if (!movers.length && !queue.length) return true;
    /* Nothing happens between claims, arrivals and the captives' starts:
       go straight to the next of them. */
    let next = Infinity;
    for (const m of movers) next = Math.min(next, m.claimed ? m.s + ZB_MAZE2_STEP - 1 : m.s + ZB_MAZE2_CLAIM);
    for (const q of queue) next = Math.min(next, q.ready);
    if (next > tick) tick = next;
    /* The frame's animation: claims, then arrivals. */
    arriving.length = 0;
    for (const m of movers) {
      if (!m.claimed && tick === m.s + ZB_MAZE2_CLAIM) {
        m.claimed = true;
        const k = m.tr * 13 + m.tc, o = claims.get(k);
        if (o && !o.gone) { pairs.push(o, m); claims.delete(k); } else claims.set(k, m);
      }
      if (tick === m.s + ZB_MAZE2_STEP - 1) arriving.push(m);
    }
    if (arriving.length > 1) arriving.sort((a, b) => b.n - a.n);
    /* The frame's work: the captives waiting to move, the last queued
       first, and any they knock on at once; then arrivals, the latest
       first; then collisions. */
    for (;;) {
      let i = queue.length - 1;
      while (i >= 0 && queue[i].ready > tick) i--;
      if (i < 0) break;
      const q = queue.splice(i, 1)[0];
      add(q.t, q.r, q.c, q.d, tick + 1, tick);
    }
    for (const m of arriving) {
      if (m.gone) continue;
      m.r = m.tr; m.c = m.tc;
      const k = m.r * 13 + m.c;
      if (claims.get(k) === m) claims.delete(k);
      if (w.path) w.path(m.t, m.r, m.c, false);
      const a = B.at[k];
      if (a < -1) { stop(m); w.arrive(m.t, -2 - a); continue; }
      if (a >= 0) {
        const cell = B.cells[a];
        if (cell.type === 1) { stop(m); w.lose(m.t); continue; }
        if (cell.type === 2) { if (w.turns(m.t, B.arrowK[a])) m.d = cell.dir; } else if (cell.type === 3 || cell.type === 4) {
          m.d = w.dir(a);
          if (cell.turns) w.setDir(a, zbMaze2Next(m.d, cell.ways));
        } else if (cell.type === 5) { stop(m); w.hold(a, m.t, m.d); continue; } else if (cell.type === 6 && cell.group > 1) {
          if (w.pressed) w.pressed(a);
          /* The group's arrows turn; its captives are freed, each the way
             it came in, into the move queue last listed first, so that
             they start first listed first (0x434ae9). */
          const list = B.groupCells[cell.group] || [];
          for (let j = list.length - 1; j >= 0; j--) {
            const o = list[j], oc = B.cells[o];
            if (oc.type === 4) w.setDir(o, zbMaze2Next(w.dir(o), oc.ways));
            else {
              const cap = w.held(o);
              if (cap >= 0) { queue.push({ t: cap, r: oc.row, c: oc.col, d: w.heldDir(o), ready: tick + 1 }); w.hold(o, -1, 0); if (w.freed) w.freed(cap, o); }
            }
          }
        }
      }
      begin(m, tick + 1, tick + 1);
    }
    for (let i = 0; i < pairs.length; i += 2) {
      const x = pairs[i], y = pairs[i + 1];
      if (x.gone || y.gone) continue;
      stop(x); stop(y);
      (w.collide || w.lose)(x.t); (w.collide || w.lose)(y.t);
    }
    pairs.length = 0;
    tick++;
  }
  return false;
}

/* A launch on a grid without sticky squares: one bubble, nothing to meet,
   so its squares in turn are all there is to it. */
function zbMaze2RunAlone(B, w, t, start) {
  let [r, c, d] = start;
  if (w.path) w.path(t, r, c, true);
  for (let step = 0; step < 256; step++) {
    const pr = r, pc = c;
    if (d === 0) c--; else if (d === 1) r++; else if (d === 2) c++; else r--;
    if (r < 0 || r > 12 || c < 0 || c > 12) { r = pr; c = pc; }
    if (w.path) w.path(t, r, c, false);
    const a = B.at[r * 13 + c];
    if (a === -1) continue;
    if (a < -1) { w.arrive(t, -2 - a); return true; }
    const cell = B.cells[a];
    if (cell.type === 1) { w.lose(t); return true; }
    if (cell.type === 2) { if (w.turns(t, B.arrowK[a])) d = cell.dir; } else if (cell.type === 3 || cell.type === 4) {
      d = w.dir(a);
      if (cell.turns) w.setDir(a, zbMaze2Next(d, cell.ways));
    } else if (cell.type === 6 && cell.group > 1) {
      if (w.pressed) w.pressed(a);
      for (const o of B.groupCells[cell.group] || []) if (B.cells[o].type === 4) w.setDir(o, zbMaze2Next(w.dir(o), B.cells[o].ways));
    }
  }
  return false;
}

/* Whether each kind could ever cross, whatever else happens: its bubble
   followed from every launcher at the lower left, and from every launcher
   at a corner it can come out at, with every arrow that might turn free to
   point any way it can at every visit, and a sticky square letting it go
   again any way. An arrow might turn only if some bubble of the band can
   reach it (one that turns once passed) or reach a coloured square of its
   colour, so arrows no bubble can get at are held to the way they start,
   and that is worked out again until it settles. No play does better,
   whether bubbles float one at a time or together, since other bubbles
   only ever turn those arrows, knock a captive on or end in a collision. */
function zbMaze2CanCross(B) {
  const reach = new Map();
  for (const a of B.ctrl) {
    const c = B.cells[a], ds = [c.dir];
    for (let d = zbMaze2Next(c.dir, c.ways); !ds.includes(d); d = zbMaze2Next(d, c.ways)) ds.push(d);
    reach.set(a, ds);
  }
  /* A kind's bubbles followed loosely: whether one can cross, and the
     squares they can reach. */
  const follow = (kind, movable) => {
    const seen = new Set(), squares = new Set(), stack = [], corners = new Set();
    let across = false;
    const from = corner => {
      if (corners.has(corner)) return;
      corners.add(corner);
      for (const seat of B.seats) if (zbMaze2Corner(seat) === corner) stack.push(zbMaze2SeatStart(seat));
    };
    from(0);
    while (stack.length) {
      const [r0, c0, d0] = stack.pop(), key = (r0 * 13 + c0) * 4 + d0;
      if (seen.has(key)) continue;
      seen.add(key);
      let r = r0, c = c0;
      if (d0 === 0) c--; else if (d0 === 1) r++; else if (d0 === 2) c++; else r--;
      if (r < 0 || r > 12 || c < 0 || c > 12) { r = r0; c = c0; }
      squares.add(r * 13 + c);
      const a = B.at[r * 13 + c];
      if (a < -1) { if (a === -5) across = true; else from(-2 - a); continue; }
      const cell = a >= 0 ? B.cells[a] : null;
      if (cell && cell.type === 1) continue;
      if (cell && cell.type === 5) { for (let d = 0; d < 4; d++) stack.push([r, c, d]); continue; }
      let ds = [d0];
      if (cell && cell.type === 2) ds = [(kind.mask >> B.arrowK[a] & 1) ? cell.dir : d0];
      else if (cell && (cell.type === 3 || cell.type === 4)) ds = movable.has(a) ? reach.get(a) : [cell.dir];
      for (const d of ds) stack.push([r, c, d]);
    }
    return { across, squares };
  };
  let movable = new Set(B.ctrl);
  for (let round = 0; round < 20; round++) {
    const got = new Set();
    for (const kind of B.kinds) for (const q of follow(kind, movable).squares) got.add(q);
    const pressed = new Set(B.cells.filter(c => c.type === 6 && got.has(c.row * 13 + c.col)).map(c => c.group));
    const next = new Set(B.ctrl.filter(a => { const c = B.cells[a]; return (c.turns && got.has(c.row * 13 + c.col)) || (c.type === 4 && c.group > 1 && pressed.has(c.group)); }));
    if (next.size === movable.size) break;
    movable = next;
  }
  return B.kinds.map(kind => follow(kind, movable).across);
}

/* The search's state, a flat array: the changeable arrows' ways, each
   sticky square's captive (a kind + 1, or 0) and its way, and how many of
   each kind wait at each corner (lower left, upper left, lower right). */
function zbMaze2Search(B, band, deadline) {
  const nK = B.kinds.length, cPos = new Int16Array(B.cells.length).fill(-1), sPos = new Int16Array(B.cells.length).fill(-1);
  B.ctrl.forEach((a, k) => { cPos[a] = k; });
  B.sticky.forEach((a, k) => { sPos[a] = k; });
  const hb = B.ctrl.length, db = hb + B.sticky.length, cb = db + B.sticky.length, size = cb + nK * 3;
  const init = new Int8Array(size);
  B.ctrl.forEach((a, k) => { init[k] = B.cells[a].dir; });
  B.kinds.forEach((k, i) => { init[cb + i * 3] = k.members.length; });
  let s = null, gained = 0, lost = 0, ticks = 0, limit = deadline;
  const W = {
    dir: a => (cPos[a] >= 0 ? s[cPos[a]] : B.cells[a].dir), setDir: (a, v) => { s[cPos[a]] = v; },
    held: a => s[hb + sPos[a]] - 1, heldDir: a => s[db + sPos[a]], hold: (a, t, d) => { s[hb + sPos[a]] = t + 1; s[db + sPos[a]] = t >= 0 ? d : 0; },
    arrive: (t, corner) => { if (corner === 3) gained++; else s[cb + t * 3 + corner]++; },
    lose: () => { lost++; }, turns: (t, k) => (B.kinds[t].mask >> k & 1) === 1,
  };
  const starts = B.seats.map(zbMaze2SeatStart);
  /* Every launch from st: [{ kind, seat, s, gained, lost }]. */
  const moves = st => {
    const out = [];
    for (let k = 0; k < nK; k++) {
      for (let j = 0; j < B.seats.length; j++) {
        const at = cb + k * 3 + zbMaze2Corner(B.seats[j]);
        if (!st[at]) continue;
        s = st.slice(); s[at]--; gained = 0; lost = 0;
        if (zbMaze2Run(B, W, k, starts[j])) out.push({ kind: k, seat: j, s, gained, lost });
      }
    }
    if ((++ticks & 63) === 0 && Date.now() > limit) throw ZB_MAZE2_OUT;
    return out;
  };
  const key = st => String.fromCharCode.apply(null, st);
  /* Which kinds can ever cross, however the band is played, bubbles
     launched together and colliding included (zbMaze2CanCross). The rest
     never count. */
  const can = zbMaze2CanCross(B);
  const bound = st => {
    let n = 0;
    for (let k = 0; k < nK; k++) if (can[k]) n += st[cb + k * 3] + st[cb + k * 3 + 1] + st[cb + k * 3 + 2];
    for (let h = 0; h < B.sticky.length; h++) if (st[hb + h] && can[st[hb + h] - 1]) n++;
    return n;
  };
  /* The best from st: the most across, then the fewest launches, over
     everything reachable. Launches that neither cross nor lose anyone
     only rearrange the grid; the states they reach from st are searched
     breadth first, nearest first, and any launch that makes progress
     leads to a state with fewer left, whose own best is remembered. */
  const memo = new Map();
  const value = (st, k0) => {
    const known = memo.get(k0);
    if (known) return known;
    const top = bound(st);
    let best = { acc: 0, len: 0 };
    const seen = new Set([k0]), queue = [st], dist = [0];
    for (let q = 0; q < queue.length; q++) {
      const d = dist[q];
      if (best.acc === top && d + 1 >= best.len) break;
      for (const m of moves(queue[q])) {
        if (!m.gained && !m.lost) {
          const k = key(m.s);
          if (!seen.has(k)) { seen.add(k); queue.push(m.s); dist.push(d + 1); }
          continue;
        }
        const v = value(m.s, key(m.s));
        const cand = { acc: m.gained + v.acc, len: d + 1 + v.len };
        if (cand.acc > best.acc || (cand.acc === best.acc && cand.len < best.len)) best = cand;
      }
    }
    memo.set(k0, best);
    return best;
  };
  /* The launches that make a state's best, found again. */
  const plan = st => {
    const out = [];
    for (let guard = 0; guard < 400; guard++) {
      const v = memo.get(key(st));
      if (!v || !v.acc) break;
      const seen = new Map([[key(st), null]]), queue = [st], dist = [0], via = [null];
      let found = null;
      for (let q = 0; q < queue.length && !found; q++) {
        for (const m of moves(queue[q])) {
          if (!m.gained && !m.lost) {
            const k = key(m.s);
            if (!seen.has(k)) { seen.set(k, q); queue.push(m.s); dist.push(dist[q] + 1); via.push({ from: q, m }); }
            continue;
          }
          const w = memo.get(key(m.s)) || value(m.s, key(m.s));
          if (m.gained + w.acc === v.acc && dist[q] + 1 + w.len === v.len) { found = { q, m }; break; }
        }
      }
      if (!found) break;
      const path = [found.m];
      for (let q = found.q; via[q]; q = via[q].from) path.unshift(via[q].m);
      for (const m of path) out.push({ kind: m.kind, seat: B.seats[m.seat] });
      st = found.m.s;
    }
    return out;
  };
  /* The rule of thumb, when the search runs out of time: from where the
     grid stands, look a few thousand arrangements ahead for the nearest
     launch that gets more across than it loses, make it, and go on. */
  const greedy = (st, cap = 3000) => {
    const out = [];
    let acc = 0;
    for (let guard = 0; guard < 200; guard++) {
      const seen = new Set([key(st)]), queue = [st], via = [null];
      let found = null;
      for (let q = 0; q < queue.length && !found && queue.length < cap; q++) {
        let bestM = null;
        for (const m of moves(queue[q])) {
          if (!m.gained && !m.lost) {
            const k = key(m.s);
            if (!seen.has(k)) { seen.add(k); queue.push(m.s); via.push({ from: q, m }); }
          } else if (m.gained > m.lost && (!bestM || m.gained - m.lost > bestM.gained - bestM.lost)) bestM = m;
        }
        if (bestM) found = { q, m: bestM };
      }
      if (!found) break;
      const path = [found.m];
      for (let q = found.q; via[q]; q = via[q].from) path.unshift(via[q].m);
      for (const m of path) out.push({ kind: m.kind, seat: B.seats[m.seat] });
      acc += found.m.gained;
      st = found.m.s;
    }
    return { acc, moves: out };
  };
  /* Best first, for when the full search is too big: states in order of
     how many could still end across (those across and those left who
     can), then of how many are across, then of fewest launches. It stops
     when nothing left could beat the best found, which proves it, or at
     the deadline. Returns the best found, its plan, and whether proven. */
  const bestFirst = (st, until) => {
    const heap = [], seen = new Map();
    const better = (a, b) => a.f !== b.f ? a.f > b.f : a.g !== b.g ? a.g > b.g : a.len < b.len;
    const push = n => {
      heap.push(n);
      for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!better(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && better(heap[l], heap[m])) m = l;
          if (r < heap.length && better(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
        }
      }
      return top;
    };
    let best = { g: 0, len: 0, node: null }, proven = false;
    limit = until;
    push({ s: st, g: 0, len: 0, f: bound(st), up: null, move: null });
    try {
      while (heap.length) {
        if (Date.now() > until) break;
        const n = pop();
        if (n.f <= best.g) { proven = true; break; }
        const k = key(n.s), was = seen.get(k);
        if (was != null && was >= n.g) continue;
        seen.set(k, n.g);
        if (n.g > best.g || (n.g === best.g && n.len < best.len)) best = { g: n.g, len: n.len, node: n };
        for (const m of moves(n.s)) {
          const g = n.g + m.gained;
          push({ s: m.s, g, len: n.len + 1, f: g + bound(m.s), up: n, move: { kind: m.kind, seat: B.seats[m.seat] } });
        }
      }
      if (!heap.length) proven = true;
    } catch (e) { if (e !== ZB_MAZE2_OUT) throw e; }
    const out = [];
    for (let n = best.node; n && n.move; n = n.up) out.unshift(n.move);
    return { acc: best.g, moves: out, proven };
  };
  /* fn run with the search's deadline moved to until. */
  const within = (until, fn) => { const old = limit; limit = until; try { return fn(); } finally { limit = old; } };
  return { init, key, moves, value, plan, greedy, bestFirst, bound, memo, starts, within };
}
const ZB_MAZE2_OUT = { out: true };

/* A plan played with the band's own Zoombinis: each launch sends the first
   of its kind waiting at its launcher's corner. Returns the launches, each
   with who went, what befell every bubble it moved, and their routes. */
function zbMaze2Replay(B, band, plan) {
  const dirs = B.cells.map(c => c.dir), heldBy = B.cells.map(() => -1), heldDir = B.cells.map(() => 0);
  const where = band.map(() => 0);   // 0-2 a corner, 3 across, -1 held, -2 lost
  let ev = null;
  const W = {
    dir: a => dirs[a], setDir: (a, v) => { dirs[a] = v; },
    held: a => heldBy[a], heldDir: a => heldDir[a], hold: (a, t, d) => { heldBy[a] = t; heldDir[a] = d; if (t >= 0) { where[t] = -1; ev.fate.set(t, { held: a }); } },
    arrive: (t, corner) => { where[t] = corner; ev.fate.set(t, { corner }); }, lose: t => { where[t] = -2; ev.fate.set(t, { lost: true }); },
    collide: t => { where[t] = -2; ev.fate.set(t, { collided: true }); },
    turns: (t, k) => zbMaze2Turns(band[t], B.arrows[k]),
    path: (t, r, c, first) => { if (first || !ev.routes.has(t)) ev.routes.set(t, ev.routes.get(t) || []); if (first) ev.routes.get(t).push([]); const rs = ev.routes.get(t); rs[rs.length - 1].push([r, c]); },
    knocked: (t, a) => { ev.moved.push({ t, how: 'knocked', a }); }, freed: (t, a) => { ev.moved.push({ t, how: 'freed', a }); },
  };
  const out = [];
  for (const { kind, seat } of plan) {
    const corner = zbMaze2Corner(seat);
    const i = B.kinds[kind].members.find(m => where[m] === corner);
    if (i == null) return null;
    ev = { i, seat, fate: new Map(), routes: new Map(), moved: [] };
    if (!zbMaze2Run(B, W, i, zbMaze2SeatStart(seat))) return null;
    out.push(ev);
  }
  return { launches: out, where };
}

/* A launcher's name: the lower left's numbered, the others by their corner. */
function zbMaze2SeatWords(B, seat) {
  const corner = zbMaze2Corner(seat), same = B.seats.filter(s => zbMaze2Corner(s) === corner);
  const n = same.length > 1 ? ` ${same.indexOf(seat) + 1}` : '';
  return corner === 0 ? `launcher ${B.seats.filter(s => s < 6).indexOf(seat) + 1}` : `the ${corner === 1 ? 'upper-left' : 'lower-right'} launcher${n}`;
}
function zbMaze2FateWords(B, f) {
  if (!f) return 'goes nowhere';
  if (f.lost) return 'falls into a whirlpool';
  if (f.collided) return 'meets another bubble, and both are lost';
  if (f.held != null) return `is held on the ${B.cells[f.held].colour} sticky square`;
  return ['floats back to the lower left', 'comes out at the upper left', 'comes out at the lower right', 'floats across'][f.corner];
}

function zbMaze2Solve(band, state, arc, opts = {}) {
  const t0 = Date.now(), budget = opts.budget || 1500, deadline = t0 + budget * 0.9;
  const B = zbMaze2Board(band, state, arc);
  const X = zbMaze2Search(B, band, deadline);
  const k0 = X.key(X.init);
  let exact = true, shortest = true, best, plans = [];
  /* The full search first, with two fifths of the time; if it runs out,
     best first with the rest, or the rule of thumb's order if that does no
     better. Either is proven the most when it gets across everyone who
     could ever cross, though not then the fewest launches. */
  let quick = { acc: 0, moves: [] };
  try {
    quick = X.within(t0 + budget / 5, () => X.greedy(X.init));
    best = X.within(t0 + budget * 2 / 5, () => X.value(X.init, k0));
    plans.push(X.plan(X.init));
  } catch (e) {
    if (e !== ZB_MAZE2_OUT) throw e;
    const bf = X.bestFirst(X.init, deadline);
    const pick = bf.acc > quick.acc || (bf.acc === quick.acc && bf.moves.length <= quick.moves.length) ? bf : quick;
    exact = bf.proven || pick.acc === X.bound(X.init);
    shortest = false;
    best = { acc: pick.acc, len: pick.moves.length };
    plans.push(pick.moves);
  }
  /* Other ways to the same number, each starting with a different launch,
     while the time lasts. */
  if (exact && shortest && best.acc) {
    try {
      X.within(t0 + budget * 3 / 4, () => {
      const firsts = [];
      for (const m of X.moves(X.init)) {
        const v = X.value(m.s, X.key(m.s));
        if (m.gained + v.acc === best.acc) firsts.push({ m, len: 1 + v.len });
      }
      firsts.sort((a, b) => a.len - b.len);
      for (const { m } of firsts) {
        if (plans.length >= 12) break;
        const p = [{ kind: m.kind, seat: B.seats[m.seat] }, ...X.plan(m.s)];
        if (!plans.some(q => JSON.stringify(q) === JSON.stringify(p))) plans.push(p);
      }
      });
    } catch (e) { if (e !== ZB_MAZE2_OUT) throw e; }
  }
  const solutions = [];
  let lostFirst = null;
  for (const p of plans) {
    const r = zbMaze2Replay(B, band, p);
    if (!r) continue;
    /* An order that throws away a Zoombini the simplest keeps is not
       another way worth listing. */
    const lostHere = r.where.filter(x => x === -2).length;
    if (lostFirst == null) lostFirst = lostHere;
    else if (lostHere > lostFirst) continue;
    const crosses = band.map((_, i) => i).filter(i => r.where[i] === 3);
    const steps = r.launches.map((l, k) => {
      const z = band[l.i];
      let s = `${k + 1}. Send ${l.i + 1} (${zbZoombiniWords(z).toLowerCase()}) from ${zbMaze2SeatWords(B, l.seat)}: it ${zbMaze2FateWords(B, l.fate.get(l.i))}`;
      for (const mv of l.moved) s += `; ${mv.t + 1}, ${mv.how === 'knocked' ? `knocked off the ${B.cells[mv.a].colour} sticky square` : `freed from the ${B.cells[mv.a].colour} sticky square by a coloured square`}, ${zbMaze2FateWords(B, l.fate.get(mv.t))}`;
      return s + '.';
    });
    if (!r.launches.length) steps.push(best.acc ? 'No launch.' : 'No order gets anyone across: every launcher sends every Zoombini into a whirlpool, round for ever or back, whatever has gone before.');
    solutions.push({
      title: `${crosses.length} of ${band.length} across in ${r.launches.length} launch${r.launches.length === 1 ? '' : 'es'}`
        + (solutions.length ? `, starting with ${r.launches[0].i + 1} from ${zbMaze2SeatWords(B, r.launches[0].seat)}` : ''),
      steps, crosses, launches: r.launches.map(l => ({ i: l.i, seat: l.seat })),
      diagram: zbMaze2Diagram(B, band, r, `${crosses.length} of ${band.length} across, ${r.launches.length} launch${r.launches.length === 1 ? '' : 'es'}`),
    });
  }
  const most = Math.max(best.acc, ...solutions.map(s => s.crosses.length));
  /* One launch at a time is searched; launching while others float is
     not, but nothing can beat the bound every Zoombini's own routes give. */
  const upper = X.bound(X.init), proven = exact;
  exact = proven && most >= upper;
  const notes = [
    'Crossing is floating out at the upper right. A Zoombini lost in a whirlpool, or in a collision with another bubble, does not cross; one that floats back to the lower left, or comes out at the upper left or lower right, may be launched again from a launcher there.',
    'The orders searched send one Zoombini at a time and wait until every bubble has stopped. Each launch is played frame by frame as the program plays it: a captive knocked off a sticky square, or freed by a coloured square, floats along with the bubble that set it going, and two bubbles entering one square together are both lost.',
    'Zoombinis turned by the same feature arrows go the same ways, so which of them is sent is the same order: they are counted as one.',
    'Simplest is the fewest launches for the most across; the others listed start with a different launch, and lose no more to whirlpools.',
  ];
  if (!shortest) notes.push(proven
    ? `The full search did not finish in its time, but the order found gets across everyone who could ever cross, so it is the most; it may not be the fewest launches, and no other orders are listed.`
    : `The search stopped at its ${budget} ms: this is the best order found (best first, or the rule of thumb of making the nearest launch that gets more across than it loses), not proven the most one at a time.`);
  if (most < upper) notes.push(`${proven ? `One at a time, ${most} is the most.` : `One at a time, ${most} is the best found.`} The program lets a Zoombini be launched while others still float, and then two bubbles can both pass an arrow before either reaches the square that turns it; that is not searched here. However it is timed, no more than ${upper} can cross: those whose bubbles could reach the far side with every turning arrow pointing any way it can.`);
  return { most, exact, ways: null, solutions, notes, ms: Date.now() - t0, oneAtATime: { most, proven }, upper };
}

/* The grid drawn: rows left to right, columns top to bottom, as the game
   shows them; its arrows as they start, a feature arrow with its feature,
   the coloured squares in their colours, and each launch's route; those
   across at the upper right, the rest at the lower left, faded. */
/* Where the diagram puts the grid: square (row, col) is C across with its
   top left at GX + row x C, GY + col x C (the page's layout editor clicks
   on it). */
const ZB_MAZE2_DRAWN = { C: 34, GX: 180, GY: 44 };
function zbMaze2Diagram(B, band, replay, caption) {
  const W = 800, H = 500, { C, GX, GY } = ZB_MAZE2_DRAWN, items = [];
  const cx = r => GX + r * C + C / 2, cy = c => GY + c * C + C / 2;
  const hex = c => ZB_MAZE2_HEX[c.colour] || 'ink';
  items.push({ t: 'rect', x: GX - 4, y: GY - 4, w: 13 * C + 8, h: 13 * C + 8, fill: 'panel', stroke: 'line' });
  for (let k = 1; k < 13; k++) {
    items.push({ t: 'line', x1: GX + k * C, y1: GY, x2: GX + k * C, y2: GY + 13 * C, stroke: 'line', width: 0.5 });
    items.push({ t: 'line', x1: GX, y1: GY + k * C, x2: GX + 13 * C, y2: GY + k * C, stroke: 'line', width: 0.5 });
  }
  const exitFill = ['stone', 'water', 'water', 'good'];
  for (const [type, row, col] of ZB_MAZE2_EXITS) {
    if (B.at[row * 13 + col] >= 0) continue;
    items.push({ t: 'rect', x: GX + row * C + 2, y: GY + col * C + 2, w: C - 4, h: C - 4, r: 4, fill: exitFill[type - 20], faded: type !== 23 });
  }
  const arrow = (x, y, d, len, fill, extra = {}) => {
    const [vx, vy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][d], px = -vy, py = vx;
    items.push(Object.assign({ t: 'poly', points: [x + vx * len, y + vy * len, x - vx * len * 0.5 + px * len * 0.7, y - vy * len * 0.5 + py * len * 0.7,
      x - vx * len * 0.5 - px * len * 0.7, y - vy * len * 0.5 - py * len * 0.7], fill, stroke: 'panel' }, extra));
  };
  /* The routes, each once, coloured by how the bubble ended, under the
     squares. */
  if (replay) {
    const drawn = new Set();
    for (const l of replay.launches) {
      for (const [t, routes] of l.routes) {
        const f = l.fate.get(t) || {};
        const role = f.lost ? 'bad' : f.held != null ? 'warn' : f.corner === 3 ? 'good' : 'dim';
        for (const route of routes) {
          const pts = route.flatMap(([r, c]) => [cx(r), cy(c)]);
          const k = role + pts.join(',');
          if (drawn.has(k)) continue;
          drawn.add(k);
          items.push({ t: 'poly', points: pts, closed: false, stroke: role, width: role === 'good' ? 2.5 : 1.5, dash: role === 'good' ? null : '4 3' });
        }
      }
    }
  }
  for (const c of B.cells) {
    const x = cx(c.row), y = cy(c.col);
    if (c.type === 1) {
      items.push({ t: 'circle', x, y, r: 12, fill: 'water', stroke: 'accent' }, { t: 'circle', x, y, r: 5, fill: 'panel', stroke: 'accent' });
    } else if (c.type === 2) {
      const [vx, vy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][c.dir];
      arrow(x + vx * 11, y + vy * 11, c.dir, 6, 'accent');
      if (c.value) items.push({ t: 'trait', kind: c.kind, value: c.value, x, y, scale: c.kind === 'hair' || c.kind === 'feet' ? 0.75 : 1 });
      else items.push({ t: 'text', x, y: y + 5, text: '–', anchor: 'middle', size: 14, fill: 'dim' });
    } else if (c.type === 3 || c.type === 4) {
      arrow(x, y, c.dir, 11, c.type === 4 && c.group > 1 ? hex(c) : 'ink');
      if (c.turns) items.push({ t: 'circle', x: x + 11, y: y - 11, r: 3.5, fill: 'warn' });
    } else if (c.type === 5) {
      items.push({ t: 'rect', x: x - 13, y: y - 13, w: 26, h: 26, r: 6, fill: 'panel', stroke: hex(c), width: 3, dash: '4 3' });
    } else if (c.type === 6) {
      items.push({ t: 'rect', x: x - 12, y: y - 12, w: 24, h: 24, r: 3, fill: hex(c), stroke: 'panel' });
    }
  }
  /* The launchers: a triangle on the square they launch from, pointing
     the way they launch, and their name beside it. */
  B.seats.forEach(seat => {
    const [r, c, d] = ZB_MAZE2_SEATS[seat];
    const [vx, vy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][d];
    arrow(cx(r), cy(c), d, 11, 'warn');
    const name = zbMaze2Corner(seat) ? zbMaze2SeatWords(B, seat).replace(/^the /, '').replace(/ launcher/, '') : String(B.seats.filter(q => q < 6).indexOf(seat) + 1);
    items.push({ t: 'text', x: cx(r) - vx * 14, y: cy(c) - vy * 22 + 4, text: name, anchor: vx > 0 ? 'end' : vx < 0 ? 'start' : 'middle', size: 12, fill: 'warn', weight: 'bold' });
  });
  items.push({ t: 'text', x: GX + 13 * C + 8, y: GY + 12, text: 'across', size: 12, fill: 'good' });
  const across = replay ? band.map((_, i) => i).filter(i => replay.where[i] === 3) : [];
  const rest = band.map((_, i) => i).filter(i => !across.includes(i));
  items.push(...zbDiagramRows(across, 646, 100, 4, 38, 56));
  items.push({ t: 'text', x: 12, y: 262, text: 'the lower left', size: 12, fill: 'dim' });
  items.push(...zbDiagramRows(rest, 28, 320, 4, 38, 56, { faded: true }));
  items.push({ t: 'text', x: 12, y: 24, text: caption || '', size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}
