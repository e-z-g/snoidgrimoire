/* zb-puzzle-slides.js -- Stone Rise: stones to stand the band on, joined
   by stones that show a trait.
   =========================================================================
   Needs zb-puzzle.js.

   The band is dragged onto stones in a field of hexagons. Between two
   stones is a joining stone, which either shows a trait (hair, eyes, nose
   or feet) or is plain. Two Zoombinis either side of a stone that shows a
   trait must have the same value of it; a plain stone asks nothing. Each
   group of stones is entered from a base on the right of the screen, and
   a stone rises when every joining stone on some way to it from the base
   is satisfied. Nothing is counted against the band: Zoombinis can be moved
   as often as the player likes. Once one stone has risen the band may go,
   and only the Zoombinis on risen stones go on.

   The field is 117 cells, 13 rows of 9, and the stones are dealt from the
   band, so that the band can always fill them all:
     level 1: pairs. The program pairs the band off, each Zoombini with the
              first later one it shares a trait with, trying the traits in
              turn from one drawn at random; a pair is two stones joined by
              a stone showing the trait they share, and a Zoombini with no
              partner gets a stone of its own. The pairs and single stones
              go in rows, one to a row.
     level 2: chains of three. From the first Zoombini the program finds
              one that shares a trait with it (trying the traits from one
              drawn at random each time), then one that shares a trait with
              that one, and starts the next chain from the last Zoombini it
              has not used. Where no Zoombini shares a trait the joining
              stone is plain and the next is the first one left.
     level 3: three rings of six stones on a fixed pattern, each entered
              at its right-hand stone. The program sorts the band by how
              many others each shares a trait with, takes the rings in one
              of three orders (two draws of 0-100), stands the two most
              sociable left on each ring's two ends, then finds for each
              end two neighbours sharing a trait with it, from the least
              sociable up; the two joining stones left in the middle of
              the ring get the first trait their two Zoombinis share,
              looked for from a trait drawn at random. Stones no Zoombini
              was found for are dropped, or kept with plain stones either
              side if the band needs them.
     level 4: one network of up to 26 stones on a fixed pattern of
              diamonds, entered at the middle of the right. The program
              stands the Zoombinis out from the entrance, each sharing a
              trait with the one it is joined to, and prunes the paths and
              stones no one was put on. Bands of five or fewer get a single
              chain instead, whose joining stones show the first trait two
              Zoombinis share. A coin toss first picks one of two looks for
              the stones, which does not change the rule.

   A marked stone the band does not satisfy stops the rise there, though
   in a ring or the network another way round may still reach the stones
   beyond it. The placement the stones were dealt from is one answer, and
   any other that satisfies every marked stone is as good.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_slides.cpp and .h:
   initGridByDifficulty, generateTraitPairings, buildChainSequence,
   findRunnerByMatchingTrait, sortZmbsByOverlapCount, placeNextZmbInCell,
   placeMatchingZmbInCell, pickRandomMatchingTrait, checkFirstTraitMatch,
   assignZmbToSlot, moveZmbToCell, findMatchingZmbForCell,
   reassignDeadSlots, scanAndResetActiveCells, pickNextCellForLink,
   buildHexAdjacencyTable; for the rule, validateChainAndMarkMatched (levels
   1 and 2) and resetAnimStates, confirmEndpointMatches, activateChainLink,
   propagateMatchChain, evalNeighborStates and evalTraitMatchAndAdvance
   (levels 3 and 4); debugGetChances (no limit). Checked against the
   program's own code, ZOOMBI32.EXE of the 1996 disc's ZBARC32.Z: the grid
   is dealt at 0x446574 (the level 4 look drawn first, 0x4465b1), level 1's
   pairing at 0x4444d6, level 2's chains at 0x444892 and 0x444a44, level 3
   at 0x446d04 with 0x444c3b, 0x445bf1, 0x444d1f and 0x444fb9, level 4 at
   0x4471cf with 0x447c75, 0x447d95, 0x447e7a, 0x4483dc, 0x448126,
   0x44814b, 0x448619, 0x44923e and 0x449338; the chains of levels 1 and 2
   are judged at 0x443f25, and the links of levels 3 and 4 at 0x445697,
   starting from 19, 55 and 91 (0x4453f8 on) or from the stones in
   0x4a3d3c; the walks round the rings and the network between those calls
   were not compared instruction by instruction. The Mac program's
   SOLVETHEPUZZLE is the typed cheat's playback of the placement the level
   4 deal records, not part of the deal. Every step, loop order and draw is as ScummVM has
   it, with three exceptions (marked below): the pairing's retries at
   level 1 swap the program's own copy of the traits, not a local one,
   which changes nothing the page shows; level 4's first search reads one
   entry past the sorted list; and the program writes the wrong id for a
   Zoombini it stands on a spare stone at level 4, which only its typed
   "sovle" cheat uses. The tables are in ZOOMBINI.EXE too, and
   utilities/puzzles/slides.mjs holds them to both.
*/

const ZB_SLIDES_CELLS = 117;
/* A cell's state (ScummVM's CellState) and a joining stone's trait. */
const ZB_SLIDES_INERT = 500;    // no stone
const ZB_SLIDES_PATH = 501;     // a joining stone
const ZB_SLIDES_MATCHED = 502;  // a joining stone that is satisfied
const ZB_SLIDES_BASE = 504;     // an entrance's base (505 in level 4's other look)
const ZB_SLIDES_SLOT = 506;     // a stone to stand on, empty
const ZB_SLIDES_TAKEN = 507;    // a stone with a Zoombini on it
const ZB_SLIDES_LOCKED = 508;   // a stone that has risen
/* 510-513: hair, eyes, nose, feet, the trait's index in ZB_TRAIT_KINDS
   plus 510. */
const ZB_SLIDES_HAIR = 510;
/* The six directions, as a link's index 0-5 and as a bit of a cell's mask,
   by ScummVM's names. A cell's index is row * 9 + column, column 0 the
   rightmost on the screen, so west (the cell one lower) is one to the
   right on the screen and east one to the left. */
const ZB_SLIDES_NW = 1;
const ZB_SLIDES_W = 2;
const ZB_SLIDES_SW = 4;
const ZB_SLIDES_SE = 8;
const ZB_SLIDES_E = 16;
const ZB_SLIDES_NE = 32;
/* The Zoombinis' ids, as the program's runner ids: 10000 + place in the band. */
const ZB_SLIDES_ID = 10000;

/* Level 1: the first cell and the step between rows, by how many pairs and
   single stones there are. The program's tables have fourteen entries
   each, and ScummVM's sixteen read on into the next table, as the program
   would: the starts into the steps, the steps into level 3's first
   joining stones. */
const ZB_SLIDES_PAIR_START = [0, 54, 45, 36, 27, 18, 9, 0, 18, 18, 9, 9, 0, 0, 0, 0];
const ZB_SLIDES_PAIR_STEP = [0, 0, 18, 18, 18, 18, 18, 18, 9, 9, 9, 9, 9, 9, 10, 12];
/* Level 3: each ring's joining stones, its six stones (the top pair, the
   bottom pair, the far end and the entrance), its entrances' bases and the
   stones whose links run both ways along a row. */
const ZB_SLIDES_L3_PATHS = [10, 12, 14, 28, 30, 32, 46, 48, 50, 64, 66, 68, 82, 84, 86, 100, 102, 104];
const ZB_SLIDES_L3_STONES = [11, 29, 47, 65, 83, 101, 13, 31, 49, 67, 85, 103, 24, 60, 96, 19, 55, 91];
const ZB_SLIDES_L3_LEFT = [18, 54, 90];
const ZB_SLIDES_L3_RIGHT = [24, 60, 96];
const ZB_SLIDES_L3_ROWS = [11, 13, 29, 31, 47, 49, 65, 67, 83, 85, 101, 103];
/* Level 3: the joining stone in the middle of each ring's top and bottom,
   and the two stones it joins. */
const ZB_SLIDES_L3_MIDDLES = [[12, 13, 11], [30, 31, 29], [48, 49, 47], [66, 67, 65], [84, 85, 83], [102, 103, 101]];
/* Level 4: the 26 stones, the 43 joining stones, those that run
   south-west to north-east and those that run north-west to south-east. */
const ZB_SLIDES_L4_STONES = [2, 4, 6, 19, 21, 23, 25, 38, 40, 42, 44, 55, 57, 59, 61, 74, 76, 78, 80, 91, 93, 95, 97, 110, 112, 114];
const ZB_SLIDES_L4_PATHS = [10, 11, 12, 13, 14, 15, 28, 29, 30, 31, 32, 33, 34, 46, 47, 48, 49, 50, 51, 52, 56, 58, 60,
  64, 65, 66, 67, 68, 69, 70, 82, 83, 84, 85, 86, 87, 88, 100, 101, 102, 103, 104, 105];
const ZB_SLIDES_L4_RISING = [10, 12, 14, 29, 31, 33, 46, 48, 50, 52, 65, 67, 69, 82, 84, 86, 88, 101, 103, 105];
const ZB_SLIDES_L4_FALLING = [11, 13, 15, 28, 30, 32, 34, 47, 49, 51, 64, 66, 68, 70, 83, 85, 87, 100, 102, 104];
/* Level 4: where the first search stands more Zoombinis (the program's
   table starts with 55, which it skips), and where it stands any left
   over. The program copies only the first twenty of the second; the last
   two are never reached, as twenty stones hold any band. */
const ZB_SLIDES_L4_CASCADE = [40, 76, 23, 95, 42, 78, 38, 74, 21, 93, 19, 91];
const ZB_SLIDES_L4_SPARE = [55, 57, 59, 61, 38, 74, 40, 76, 42, 78, 44, 80, 21, 93, 23, 95, 25, 97, 4, 112, 19, 25];
/* Level 4: the pruning of dead ends, as (stone, joining stone, joining
   stone) in the program's order. */
const ZB_SLIDES_L4_PRUNE = [[93, 84, 83], [21, 30, 29], [112, 103, 102], [4, 13, 12], [95, 86, 85], [23, 32, 31],
  [78, 69, 68], [42, 51, 50], [76, 67, 66], [114, 105, 104], [6, 15, 14], [44, 52, 34], [80, 88, 70]];
/* Level 4: the ways out of the entrance, its row and the stones, in the
   program's order (0x447221 on). */
const ZB_SLIDES_L4_MASKS = (() => {
  const all = 63, across = ZB_SLIDES_NW | ZB_SLIDES_SW | ZB_SLIDES_SE | ZB_SLIDES_NE;
  return [[54, ZB_SLIDES_E], [55, ZB_SLIDES_W | ZB_SLIDES_SE | ZB_SLIDES_E | ZB_SLIDES_NE], [56, ZB_SLIDES_W | ZB_SLIDES_E],
    [57, all], [58, ZB_SLIDES_W | ZB_SLIDES_E], [59, all], [60, ZB_SLIDES_W | ZB_SLIDES_E], [61, all & ~ZB_SLIDES_E],
    [19, ZB_SLIDES_SE | ZB_SLIDES_NE], [21, across], [23, across], [25, ZB_SLIDES_NW | ZB_SLIDES_SW | ZB_SLIDES_SE],
    [38, across], [40, across], [42, across], [44, ZB_SLIDES_NW | ZB_SLIDES_SW],
    [74, across], [76, across], [78, across], [80, ZB_SLIDES_NW | ZB_SLIDES_SW],
    [91, ZB_SLIDES_SE | ZB_SLIDES_NE], [93, across], [95, across], [97, ZB_SLIDES_NW | ZB_SLIDES_SW | ZB_SLIDES_NE],
    [2, ZB_SLIDES_SW | ZB_SLIDES_SE], [4, ZB_SLIDES_SW | ZB_SLIDES_SE], [6, ZB_SLIDES_SW | ZB_SLIDES_SE],
    [110, ZB_SLIDES_NW | ZB_SLIDES_NE], [112, ZB_SLIDES_NW | ZB_SLIDES_NE], [114, ZB_SLIDES_NW | ZB_SLIDES_NE]];
})();
/* Level 4, five or fewer: the chain's stones and joining stones. */
const ZB_SLIDES_L4_CHAIN = [55, 57, 59, 61, 44];
const ZB_SLIDES_L4_CHAIN_JOINS = [56, 58, 60, 52];
/* The judge at level 4 visits these stones in turn (0x4a3d3c). */
const ZB_SLIDES_L4_JUDGED = [55, 57, 59, 61, 38, 74, 40, 76, 42, 78, 44, 80, 19, 91, 21, 93, 23, 95, 25, 97,
  2, 110, 4, 112, 6, 114, 57, 59, 61, 97, 25];

/* A cell's centre on the screen: rows 18 pixels apart, columns 42, each
   row 5 pixels right of the one above and the odd rows 21 further left
   (ScummVM's kCellPositions). */
function zbSlidesCellXY(cell) {
  const row = Math.floor(cell / 9), col = cell % 9;
  return { x: 477 + 5 * row - 21 * (row % 2) - 42 * col, y: 152 + 18 * row };
}

/* An empty field: every cell inert, no links, no masks. */
function zbSlidesField(level, band, rnd) {
  const n = band.length;
  return {
    level, n, band, rnd,
    state: new Array(ZB_SLIDES_CELLS).fill(ZB_SLIDES_INERT),
    data: new Array(ZB_SLIDES_CELLS).fill(0),
    link: new Array(ZB_SLIDES_CELLS * 6).fill(-1),
    mask: new Array(ZB_SLIDES_CELLS).fill(0),
    // The program's globals as a deal finds them: the traits by place in
    // the band, and the sorted list all 0, with a seventeenth entry for the
    // word after it, also 0 then, which level 4's first search reads.
    traits: band.map(z => ZB_TRAIT_KINDS.map(k => z[k])),
    sorted: new Array(17).fill(0),
    cursor: 0,
    slots: [],
    base: ZB_SLIDES_BASE,
    quirk: null,
  };
}

function zbSlidesLink(f, cell, dir) {
  return cell < 0 || cell >= ZB_SLIDES_CELLS ? -1 : f.link[cell * 6 + dir];
}
function zbSlidesIs(f, cell, ...states) {
  return cell >= 0 && cell < ZB_SLIDES_CELLS && states.includes(f.state[cell]);
}
/* A cell's Zoombini's value of trait k (0-3), or undefined if none. */
function zbSlidesTraitOf(f, id, k) {
  const z = f.band[id - ZB_SLIDES_ID];
  return z ? z[ZB_TRAIT_KINDS[k]] : undefined;
}

/* Each cell's links from its mask (buildHexAdjacencyTable). */
function zbSlidesLinks(f) {
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) {
    const row = Math.floor(c / 9), col = c % 9, odd = c % 18 > 8, m = f.mask[c];
    let nw = -1, ne = -1, sw = -1, se = -1;
    if (row > 0) {
      if (odd) { nw = c - 9; if (col < 8) ne = c - 8; } else { if (col > 0) nw = c - 10; ne = c - 9; }
    }
    if (row < 12) {
      if (odd) { sw = c + 9; if (col < 8) se = c + 10; } else { if (col > 0) sw = c + 8; se = c + 9; }
    }
    const w = col > 0 ? c - 1 : -1, e = col < 8 ? c + 1 : -1;
    [[ZB_SLIDES_NW, nw], [ZB_SLIDES_W, w], [ZB_SLIDES_SW, sw], [ZB_SLIDES_SE, se], [ZB_SLIDES_E, e], [ZB_SLIDES_NE, ne]]
      .forEach(([bit, to], dir) => { f.link[c * 6 + dir] = (m & bit) && to >= 0 && to < ZB_SLIDES_CELLS ? to : -1; });
  }
}

/* Level 1: the band paired off (generateTraitPairings, 0x4444d6), as
   [{ members: [a, b] or [a], trait: 0-3 or -1 }] by place in the band. The
   program tries again, up to ten times in all, after moving the Zoombinis
   left single to the front; its count of singles is never reset between
   tries, so after a first try that leaves two or more single (one is
   allowed if the band is odd) it always makes all ten and keeps the last.
   It swaps its own copy of the traits, which nothing else at level 1
   reads; this keeps a copy and which Zoombini is where in it. */
function zbSlidesPairs(f) {
  const { n, rnd } = f, T = f.traits.map(t => t.slice()), who = [...Array(n).keys()];
  let cursor = rnd.number(3), singles = 0, groups = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const used = new Array(n).fill(0);
    groups = [];
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      for (let tries = 4; tries > 0 && !used[i];) {
        if (++cursor > 3) cursor = 0;
        for (let j = i + 1; j < n; j++) {
          if (used[j] || T[i][cursor] !== T[j][cursor]) continue;
          groups.push({ members: [who[i], who[j]], trait: cursor });
          used[i] = used[j] = 1;
          break;
        }
        if (--tries === 0 && !used[i]) { used[i] = 99; groups.push({ members: [who[i]], trait: -1 }); singles++; }
      }
    }
    if (singles === 0 || (singles === 1 && n % 2 === 1)) break;
    for (let t = n - 1; t >= 0; t--) {
      if (used[t] !== 99 || used[0] === 99) continue;
      [T[t], T[0]] = [T[0], T[t]];
      [who[t], who[0]] = [who[0], who[t]];
    }
  }
  return groups;
}

/* Level 2: a Zoombini not yet used, other than r, sharing a trait with r,
   trying the traits from one after a random one (findRunnerByMatchingTrait,
   0x444a44); leaves the trait in f.cursor. */
function zbSlidesFindRunner(f, r, used) {
  f.cursor = f.rnd.number(3);
  for (let tries = 4; tries > 0; tries--) {
    if (++f.cursor > 3) f.cursor = 0;
    for (let i = 0; i < f.n; i++) {
      if (i !== r && !used[i] && f.traits[r][f.cursor] === f.traits[i][f.cursor]) return i;
    }
  }
  return -1;
}

/* Level 2: the chains (buildChainSequence, 0x444892): the Zoombinis in
   the order they go on the stones, and the joining stones' traits,
   ZB_SLIDES_PATH for a plain one. */
function zbSlidesChains(f) {
  const n = f.n, used = new Array(16).fill(0), links = [], order = [];
  const count = Math.floor(n / 3) + (n % 3 ? 1 : 0);
  const lastUnused = () => { let r = -1; for (let s = 1; s < n; s++) if (!used[s]) r = s; return r; };
  let runner = 0;
  for (let group = 0; group < count; group++) {
    used[runner] = 1;
    order.push(runner);
    let next = zbSlidesFindRunner(f, runner, used);
    if (next === -1) {
      links.push(ZB_SLIDES_PATH);
      for (let s = 1; s < n; s++) if (!used[s]) { used[s] = 1; next = s; break; }
    } else {
      used[next] = 1;
      links.push(f.cursor + ZB_SLIDES_HAIR);
    }
    runner = next;
    if (next !== -1) order.push(next);
    if (lastUnused() === -1) break;
    let last = zbSlidesFindRunner(f, runner, used);
    if (last === -1) {
      links.push(ZB_SLIDES_PATH);
      last = lastUnused();
    } else {
      links.push(f.cursor + ZB_SLIDES_HAIR);
    }
    used[last] = 1;
    order.push(last);
    runner = lastUnused();
    if (runner === -1) break;
  }
  return { links, order, count };
}

/* The band sorted by how many of the band (itself too) each shares a
   trait with, most first, ties to the earlier (sortZmbsByOverlapCount,
   0x444c3b). */
function zbSlidesSort(f) {
  const n = f.n, count = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (f.traits[i].some((v, k) => v === f.traits[j][k])) count[i]++;
  for (let s = 0; s < n; s++) {
    let best = 0, most = -1;
    for (let r = 0; r < n; r++) if (most < count[r]) { most = count[r]; best = r; }
    f.sorted[s] = best;
    count[best] = -1;
  }
}

/* Whether the Zoombinis at two places of the sorted list share a trait,
   hair first; leaves it in f.cursor (checkFirstTraitMatch, 0x447d95). */
function zbSlidesFirstMatch(f, a, b) {
  const ra = f.sorted[a], rb = f.sorted[b];
  if (ra < 0 || rb < 0 || ra >= f.n || rb >= f.n) return false;
  for (let k = 0; k < 4; k++) if (f.traits[ra][k] === f.traits[rb][k]) { f.cursor = k; return true; }
  return false;
}

/* A trait two Zoombinis share, drawing 0-1000 for which to look for first
   (pickRandomMatchingTrait, 0x444fb9), or 0; no draw unless both cells
   have a Zoombini. */
function zbSlidesPickTrait(f, a, b) {
  if (a < 0 || b < 0 || a >= ZB_SLIDES_CELLS || b >= ZB_SLIDES_CELLS) return 0;
  if (f.state[a] === ZB_SLIDES_INERT || f.state[b] === ZB_SLIDES_INERT) return 0;
  const ia = f.data[a], ib = f.data[b];
  if (!f.band[ia - ZB_SLIDES_ID] || !f.band[ib - ZB_SLIDES_ID]) return 0;
  const roll = f.rnd.number(1000), first = roll < 250 ? 0 : roll < 500 ? 1 : roll < 750 ? 2 : 3;
  for (let i = 0; i < 4; i++) {
    const k = (first + i) % 4;
    if (zbSlidesTraitOf(f, ia, k) === zbSlidesTraitOf(f, ib, k)) return k + ZB_SLIDES_HAIR;
  }
  return 0;
}

/* Stand a Zoombini sharing a trait with the one at cell two steps away and
   mark the stone between with it. The candidates are the sorted list's,
   looked through from the end (placeMatchingZmbInCell, 0x444d1f) or the
   start (findMatchingZmbForCell, 0x4483dc); each is tried on four traits
   from a random one, the next candidate going on from where the last
   stopped. out is a direction 0-5, or at level 3 6-9 for a step one way
   then west (6, 7) or east (8, 9). Returns the place in the sorted list,
   or -1. */
function zbSlidesMatch(f, cell, out, fromEnd) {
  let cursor = f.rnd.number(3), mid = -1, dest = -1;
  if (out > 5) {
    const first = { 6: 0, 7: 2, 8: 5, 9: 3 }[out], then = out < 8 ? 1 : 4;
    mid = zbSlidesLink(f, cell, first);
    dest = zbSlidesLink(f, mid, then);
  } else {
    mid = zbSlidesLink(f, cell, out);
    dest = zbSlidesLink(f, mid, out);
  }
  if (mid < 0 || dest < 0) return fromEnd ? -1 : -2;
  const source = f.data[cell];
  if (!f.band[source - ZB_SLIDES_ID]) return -1;
  const order = [...Array(f.n).keys()];
  if (fromEnd) order.reverse();
  for (const s of order) {
    const r = f.sorted[s];
    if (r === -1) continue;
    let found = false;
    for (let tries = 4; !found && tries > 0;) {
      if (f.traits[r][cursor] === zbSlidesTraitOf(f, source, cursor)) found = true;
      else { tries--; if (++cursor > 3) cursor = 0; }
    }
    if (!found) continue;
    f.state[dest] = ZB_SLIDES_TAKEN;
    f.data[dest] = ZB_SLIDES_ID + r;
    f.state[mid] = ZB_SLIDES_PATH;
    f.data[mid] = cursor + ZB_SLIDES_HAIR;
    f.sorted[s] = -1;
    return s;
  }
  return -1;
}

/* Level 3: stand the first two left on the sorted list at a ring's first
   stone and its far end, then look for their neighbours (placeNextZmbInCell,
   0x445bf1). */
function zbSlidesRing(f, cell) {
  for (const target of [cell, cell + 5]) {
    for (let s = 0; s < f.n; s++) {
      if (f.sorted[s] === -1) continue;
      f.state[target] = ZB_SLIDES_TAKEN;
      f.data[target] = ZB_SLIDES_ID + f.sorted[s];
      f.sorted[s] = -1;
      break;
    }
  }
  if (f.state[cell] === ZB_SLIDES_TAKEN && zbSlidesMatch(f, cell, 8, true) !== -1) zbSlidesMatch(f, cell, 9, true);
  if (f.state[cell + 5] === ZB_SLIDES_TAKEN && zbSlidesMatch(f, cell + 5, 6, true) !== -1) zbSlidesMatch(f, cell + 5, 7, true);
}

function zbSlidesPending(f) {
  for (let s = 0; s < f.n; s++) if (f.sorted[s] !== -1) return true;
  return false;
}

/* Level 4: from a stone, reach out north-east and south-east for more
   (moveZmbToCell, 0x447e7a). Returns 0, -1, or a stone to go on from. */
function zbSlidesReach(f, cell) {
  if (!zbSlidesPending(f)) return -1;
  const farNE = zbSlidesLink(f, zbSlidesLink(f, cell, 5), 5), farSE = zbSlidesLink(f, zbSlidesLink(f, cell, 3), 3);
  if (f.state[cell] !== ZB_SLIDES_TAKEN) {
    if (farNE < 0 || f.state[farNE] !== ZB_SLIDES_TAKEN) {
      if (farSE < 0 || f.state[farSE] !== ZB_SLIDES_TAKEN) return -1;
      if (zbSlidesMatch(f, farSE, 0, false) === -1) return -1;
    } else if (zbSlidesMatch(f, farNE, 2, false) === -1) return -1;
  }
  if ((cell === 55 || cell === 57 || cell === 59) && zbSlidesMatch(f, cell, 4, false) === -1) return -1;
  const next = cell + 2;
  if (farNE >= 0 && f.state[farNE] === ZB_SLIDES_SLOT) {
    if (!zbSlidesPending(f)) return -1;
    if (zbSlidesMatch(f, cell, 5, false) === -1) { f.state[farNE] = ZB_SLIDES_PATH; return next; }
  }
  if (next < ZB_SLIDES_CELLS && f.state[next] === ZB_SLIDES_TAKEN && farNE >= 0) {
    const t = zbSlidesPickTrait(f, next, farNE), mid = zbSlidesLink(f, farNE, 3);
    if (t && mid >= 0) f.data[mid] = t;
  }
  if (farSE >= 0 && f.state[farSE] === ZB_SLIDES_SLOT) {
    if (!zbSlidesPending(f)) return -1;
    if (zbSlidesMatch(f, cell, 3, false) === -1) { f.state[farSE] = ZB_SLIDES_PATH; return next; }
    if (next < ZB_SLIDES_CELLS && f.state[next] === ZB_SLIDES_TAKEN) {
      const t = zbSlidesPickTrait(f, next, farSE), mid = zbSlidesLink(f, farSE, 5);
      if (t && mid >= 0) f.data[mid] = t;
    }
  }
  return 0;
}

/* Level 4: the entrance's stone and the search out from it
   (assignZmbToSlot, 0x447c75). The first stone takes the later of the
   first two neighbours on the sorted list that share a trait. The
   program looks as far as the last entry against the one after it, which
   is 0: so if no two neighbours share a trait, the first Zoombini of the
   band may be stood there while still waiting for a stone of its own
   (ScummVM stops one short). */
function zbSlidesEntrance(f, baseCell) {
  zbSlidesSort(f);
  const first = baseCell + 1;
  f.state[first] = ZB_SLIDES_TAKEN;
  for (let s = 0; s < f.n; s++) {
    if (!zbSlidesFirstMatch(f, s + 1, s)) continue;
    const r = f.sorted[s + 1];
    if (r >= 0) {
      f.data[first] = ZB_SLIDES_ID + r;
      if (s + 1 >= f.n) f.quirk = 'the first stone took a Zoombini still waiting for a stone of its own';
      f.sorted[s + 1] = -1;
    }
    break;
  }
  if (!f.data[first]) f.quirk = 'no two Zoombinis next to each other on its sorted list share a trait, so no one is stood on the first stone, and it then asks for the traits of a Zoombini it has not got; ScummVM, and this page, leave the stone empty';
  let result = zbSlidesReach(f, first);
  if (result !== 0) {
    if (result !== -1) zbSlidesReach(f, result);
  } else if (zbSlidesReach(f, first + 2) === 0) zbSlidesReach(f, first + 4);
  for (let i = 0; i < ZB_SLIDES_L4_CASCADE.length && zbSlidesPending(f); i++) zbSlidesReach(f, ZB_SLIDES_L4_CASCADE[i]);
}

/* Level 4: stand anyone still waiting on the first free stones of
   ZB_SLIDES_L4_SPARE (reassignDeadSlots, 0x448619). The program writes the
   id of the word before its list of ids instead of the Zoombini's: the
   stone is right, the record of who stands there is not. */
function zbSlidesSpare(f) {
  for (const cell of ZB_SLIDES_L4_SPARE) {
    if (f.state[cell] === ZB_SLIDES_TAKEN) continue;
    for (let s = 0; s < f.n; s++) {
      if (f.sorted[s] === -1) continue;
      f.data[cell] = ZB_SLIDES_ID + f.sorted[s];
      f.sorted[s] = -1;
      f.state[cell] = ZB_SLIDES_TAKEN;
      break;
    }
    if (!zbSlidesPending(f)) break;
  }
}

/* clearCellToEmpty, resetCellToEmpty (which also takes the link back from
   each neighbour) and clearCellLinkBits. */
function zbSlidesClear(f, cell) {
  f.state[cell] = ZB_SLIDES_INERT;
  for (let d = 0; d < 6; d++) f.link[cell * 6 + d] = -1;
  f.mask[cell] = 0;
}
function zbSlidesReset(f, cell) {
  f.state[cell] = ZB_SLIDES_INERT;
  f.data[cell] = 0;
  const back = [ZB_SLIDES_SE, ZB_SLIDES_E, ZB_SLIDES_NE, ZB_SLIDES_NW, ZB_SLIDES_W, ZB_SLIDES_SW];
  for (let d = 0; d < 6; d++) {
    const to = f.link[cell * 6 + d];
    if (to >= 0 && to < ZB_SLIDES_CELLS) f.mask[to] &= ~back[d];
    f.link[cell * 6 + d] = -1;
  }
  f.mask[cell] = 0;
}
function zbSlidesCut(f, bit, dir, cell) {
  f.link[cell * 6 + dir] = -1;
  f.mask[cell] &= ~bit;
}

/* Level 4: unused stones become joining stones, and dead ends are cleared
   (scanAndResetActiveCells, 0x44814b). */
function zbSlidesTidy(f) {
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) if (f.state[c] === ZB_SLIDES_SLOT) f.state[c] = ZB_SLIDES_PATH;
  const path = c => f.state[c] === ZB_SLIDES_PATH;
  const clear = (cells, cuts) => { cells.forEach(c => zbSlidesClear(f, c)); cuts.forEach(([b, d, c]) => zbSlidesCut(f, b, d, c)); };
  if (path(2) && path(19)) clear([2, 19, 10, 11, 28], [[ZB_SLIDES_NW, 0, 38], [ZB_SLIDES_NW, 0, 21]]);
  if (path(91) && path(110)) clear([91, 110, 100, 82, 101], [[ZB_SLIDES_SW, 2, 74], [ZB_SLIDES_SW, 2, 93]]);
  if (path(112)) clear([112, 102, 103], [[ZB_SLIDES_SE, 3, 93], [ZB_SLIDES_SW, 2, 95]]);
  if (path(114)) clear([114, 104, 105], [[ZB_SLIDES_SE, 3, 95], [ZB_SLIDES_SW, 2, 97]]);
  if (path(4)) clear([4, 12, 13], [[ZB_SLIDES_NE, 5, 21], [ZB_SLIDES_NW, 0, 23]]);
  if (path(6)) clear([6, 14, 15], [[ZB_SLIDES_NE, 5, 23], [ZB_SLIDES_NW, 0, 25]]);
  if (path(97) && path(80)) clear([97, 80, 88, 87, 70, 105], [[ZB_SLIDES_SE, 3, 78], [ZB_SLIDES_SE, 3, 61], [ZB_SLIDES_NE, 5, 114]]);
  if (path(25) && path(44)) clear([25, 44, 34, 15, 33, 52], [[ZB_SLIDES_NE, 5, 42], [ZB_SLIDES_NE, 5, 61], [ZB_SLIDES_SE, 3, 6]]);
}

/* Level 4: a stone and the two joining stones out from it, cleared where
   no trait is shown on them (pickNextCellForLink, 0x44923e). */
function zbSlidesPrune(f, cell, next, dir) {
  const d = f.data[dir] >= ZB_SLIDES_HAIR, x = f.data[next] >= ZB_SLIDES_HAIR, s = f.state[cell];
  if (!d && !x && s === ZB_SLIDES_PATH) { zbSlidesReset(f, dir); zbSlidesReset(f, next); zbSlidesReset(f, cell); }
  else if (!d && !x && s === ZB_SLIDES_TAKEN) zbSlidesReset(f, next);
  else if (!d && x && s === ZB_SLIDES_TAKEN) zbSlidesReset(f, dir);
  else if (d && !x && s === ZB_SLIDES_TAKEN) zbSlidesReset(f, next);
}

/* The field dealt at a level (initGridByDifficulty, 0x446574), with the
   placement it was dealt from: { f, solution: Map(stone -> place in band),
   groups (levels 1 and 2) }. */
function zbSlidesBuild(level, band, rnd) {
  const f = zbSlidesField(level, band, rnd), n = f.n, solution = new Map();
  if (level === 4) f.base += rnd.number(1);
  let groups = null;
  if (level === 1) {
    groups = zbSlidesPairs(f);
    const g = groups.length;
    if (g < ZB_SLIDES_PAIR_START.length) {
      const start = ZB_SLIDES_PAIR_START[g], step = ZB_SLIDES_PAIR_STEP[g];
      groups.forEach((grp, p) => {
        const base = start + step * p;
        let off = 0;
        // Past seven rows, every other row is moved three cells along.
        if (g > 7 && base % 2 !== 0) {
          f.state[base] = f.base;
          f.mask[base] = ZB_SLIDES_E;
          for (let c = base + 1; c < base + 4; c++) { f.state[c] = f.base; f.mask[c] = ZB_SLIDES_W | ZB_SLIDES_E; }
          off = 3;
        }
        const sb = base + off, slot = sb + 1;
        f.state[sb] = f.base;
        f.state[slot] = ZB_SLIDES_SLOT;
        f.slots.push(slot);
        solution.set(slot, grp.members[0]);
        if (grp.trait < 0) {
          f.mask[sb] |= ZB_SLIDES_E;
          f.mask[slot] |= ZB_SLIDES_W;
        } else {
          f.state[sb + 2] = ZB_SLIDES_PATH;
          f.data[sb + 2] = grp.trait + ZB_SLIDES_HAIR;
          f.state[sb + 3] = ZB_SLIDES_SLOT;
          f.slots.push(sb + 3);
          solution.set(sb + 3, grp.members[1]);
          f.mask[sb] |= ZB_SLIDES_E;
          f.mask[slot] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[sb + 2] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[sb + 3] |= ZB_SLIDES_W;
        }
      });
      if (f.slots.some(c => c >= ZB_SLIDES_CELLS)) f.quirk = 'the rows run off the field';
    }
    zbSlidesLinks(f);
  } else if (level === 2) {
    const chains = zbSlidesChains(f);
    groups = chains;
    const g = chains.count, start = ZB_SLIDES_PAIR_START[g], step = ZB_SLIDES_PAIR_STEP[g];
    let t = 0, placed = 0, done = false;
    const put = slot => { f.slots.push(slot); solution.set(slot, chains.order[placed]); placed++; };
    for (let grp = 0; grp < g && !done; grp++) {
      const base = start + step * grp;
      f.state[base] = f.base;
      f.state[base + 1] = ZB_SLIDES_SLOT;
      put(base + 1);
      if (placed >= n) { f.mask[base] = ZB_SLIDES_E; f.mask[base + 1] = ZB_SLIDES_W; break; }
      // Up to two joining stones, each with a stone after it. An unused
      // entry (0, past the last) adds nothing; a plain one adds a stone
      // that shows no trait.
      for (const c of [base + 2, base + 4]) {
        const type = t < chains.links.length ? chains.links[t] : 0;
        if (t >= 16 || type === 0) continue;
        f.state[c] = ZB_SLIDES_PATH;
        f.data[c] = type === ZB_SLIDES_PATH ? 0 : type;
        f.state[c + 1] = ZB_SLIDES_SLOT;
        put(c + 1);
        if (c === base + 2) {
          f.mask[base] |= ZB_SLIDES_E;
          f.mask[base + 1] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[base + 2] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[base + 3] |= ZB_SLIDES_W;
        } else {
          f.mask[base + 3] |= ZB_SLIDES_E;
          f.mask[base + 4] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[base + 5] = ZB_SLIDES_W;
        }
        t++;
        if (placed >= n) { done = true; break; }
      }
    }
    zbSlidesLinks(f);
  } else if (level === 3) {
    for (const c of ZB_SLIDES_L3_LEFT) {
      f.state[c] = f.base;
      f.mask[c] = ZB_SLIDES_E;
      f.mask[c + 1] = ZB_SLIDES_W | ZB_SLIDES_SE | ZB_SLIDES_NE;
      f.mask[c - 8] |= ZB_SLIDES_SW;
      f.mask[c + 10] |= ZB_SLIDES_NW;
    }
    for (const c of ZB_SLIDES_L3_RIGHT) {
      f.state[c] = ZB_SLIDES_SLOT;
      f.mask[c] = ZB_SLIDES_NW | ZB_SLIDES_SW;
      f.mask[c - 10] |= ZB_SLIDES_SE;
      f.mask[c + 8] |= ZB_SLIDES_NE;
    }
    ZB_SLIDES_L3_PATHS.forEach((c, i) => { f.state[c] = ZB_SLIDES_PATH; f.state[ZB_SLIDES_L3_STONES[i]] = ZB_SLIDES_SLOT; });
    for (const c of ZB_SLIDES_L3_ROWS) { f.mask[c] |= ZB_SLIDES_W | ZB_SLIDES_E; f.mask[c - 1] |= ZB_SLIDES_E; f.mask[c + 1] |= ZB_SLIDES_W; }
    zbSlidesLinks(f);
    zbSlidesSort(f);
    let rings = [19, 55, 91];
    if (rnd.number(100) >= 50) rings = rnd.number(100) >= 50 ? [91, 19, 55] : [55, 91, 19];
    rings.forEach(c => zbSlidesRing(f, c));
    for (const [mid, a, b] of ZB_SLIDES_L3_MIDDLES) {
      const t = zbSlidesPickTrait(f, a, b);
      if (t) f.data[mid] = t;
    }
    // Stones for anyone the rings did not take, in ZB_SLIDES_L3_STONES'
    // order; the band always has as many Zoombinis as stones filled, so the
    // program's branch for too many is never taken.
    let missing = n - ZB_SLIDES_L3_STONES.filter(c => f.state[c] === ZB_SLIDES_TAKEN).length;
    while (missing > 0) {
      const c = ZB_SLIDES_L3_STONES.find(c => f.state[c] !== ZB_SLIDES_TAKEN);
      if (c === undefined) break;
      f.state[c] = ZB_SLIDES_TAKEN;
      missing--;
    }
    for (let c = 0; c < ZB_SLIDES_CELLS; c++) if (f.state[c] === ZB_SLIDES_SLOT) { f.state[c] = ZB_SLIDES_PATH; f.data[c] = -1; }
    for (const c of ZB_SLIDES_L3_STONES) {
      if (f.state[c] !== ZB_SLIDES_TAKEN) continue;
      f.slots.push(c);
      if (f.band[f.data[c] - ZB_SLIDES_ID]) solution.set(c, f.data[c] - ZB_SLIDES_ID);
    }
    // The stones the rings did not fill take the rest, in order: every
    // stone next to them is plain.
    const rest = [...Array(n).keys()].filter(i => ![...solution.values()].includes(i));
    for (const c of f.slots) if (!solution.has(c) && rest.length) solution.set(c, rest.shift());
  } else {
    ZB_SLIDES_L4_PATHS.forEach(c => { f.state[c] = ZB_SLIDES_PATH; f.data[c] = 0; });
    ZB_SLIDES_L4_RISING.forEach(c => { f.mask[c] = ZB_SLIDES_SW | ZB_SLIDES_NE; });
    ZB_SLIDES_L4_FALLING.forEach(c => { f.mask[c] = ZB_SLIDES_NW | ZB_SLIDES_SE; });
    f.state[54] = f.base;
    f.data[54] = 0;
    for (const [c, m] of ZB_SLIDES_L4_MASKS) f.mask[c] = m;
    ZB_SLIDES_L4_STONES.forEach(c => { f.state[c] = ZB_SLIDES_SLOT; f.data[c] = 0; });
    zbSlidesLinks(f);
    const clearAll = () => {
      f.state.fill(ZB_SLIDES_INERT); f.data.fill(0); f.link.fill(-1); f.mask.fill(0);
    };
    if (n <= 2) {
      zbSlidesSort(f);
      clearAll();
      f.state[54] = f.base;
      f.state[55] = ZB_SLIDES_TAKEN;
      f.data[55] = ZB_SLIDES_ID;
      f.mask[54] = ZB_SLIDES_E;
      f.mask[55] = ZB_SLIDES_W;
      f.link[54 * 6 + 4] = 55;
      f.link[55 * 6 + 1] = 54;
      if (n === 2) {
        f.state[56] = ZB_SLIDES_PATH;
        f.state[57] = ZB_SLIDES_TAKEN;
        f.data[57] = ZB_SLIDES_ID + 1;
        f.link[55 * 6 + 4] = 56; f.link[56 * 6 + 1] = 55; f.link[56 * 6 + 4] = 57; f.link[57 * 6 + 1] = 56;
        f.mask[55] &= ZB_SLIDES_E;
        f.mask[56] = ZB_SLIDES_W | ZB_SLIDES_E;
        f.mask[57] = ZB_SLIDES_W;
        f.sorted[0] = -1;
        f.sorted[1] = 1;
        zbSlidesMatch(f, 55, 4, false);
      }
      for (let i = 0; i < n; i++) f.sorted[i] = -1;
      solution.set(55, 0);
      if (n === 2) solution.set(57, 1);
    } else if (n <= 5) {
      clearAll();
      zbSlidesSort(f);
      // A chain to the left: stones 55, 57, 59, 61 and then 44, up the
      // diagonal. Each joining stone shows the first trait shared by two
      // Zoombinis the program finds by looking the sorted list up in itself
      // (so the k-th stone's is the sorted list's entry at the sorted
      // list's k-th entry); it stands the band on the stones in its own
      // order, which need not satisfy them, and this page gives the order
      // that does.
      const cells = ZB_SLIDES_L4_CHAIN, joins = ZB_SLIDES_L4_CHAIN_JOINS;
      f.state[54] = f.base;
      f.mask[54] = ZB_SLIDES_E;
      f.mask[55] = ZB_SLIDES_W | ZB_SLIDES_E;
      for (let k = 0; k < n; k++) {
        f.state[cells[k]] = ZB_SLIDES_TAKEN;
        f.data[cells[k]] = ZB_SLIDES_ID + k;
        solution.set(cells[k], f.sorted[f.sorted[k]]);
        if (k === 0) continue;
        const j = joins[k - 1];
        f.state[j] = ZB_SLIDES_PATH;
        if (zbSlidesFirstMatch(f, f.sorted[k], f.sorted[k - 1])) f.data[j] = f.cursor + ZB_SLIDES_HAIR;
        if (k < 4) {
          f.mask[cells[k - 1]] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[j] = ZB_SLIDES_W | ZB_SLIDES_E;
          f.mask[cells[k]] = ZB_SLIDES_W;
        } else {
          f.mask[61] = ZB_SLIDES_W | ZB_SLIDES_NE;
          f.mask[52] = ZB_SLIDES_SW | ZB_SLIDES_NE;
          f.mask[44] = ZB_SLIDES_SW;
        }
      }
      zbSlidesLinks(f);
      for (let i = 0; i < n; i++) f.sorted[i] = -1;
    } else {
      zbSlidesEntrance(f, 54);
      if (zbSlidesPending(f)) zbSlidesSpare(f);
      zbSlidesTidy(f);
      for (const [c, x, d] of ZB_SLIDES_L4_PRUNE) zbSlidesPrune(f, c, x, d);
      if ([60, 61].every(c => f.state[c] === ZB_SLIDES_PATH) && [69, 51, 52, 70].every(c => f.state[c] === ZB_SLIDES_INERT)) {
        zbSlidesReset(f, 60);
        zbSlidesReset(f, 61);
      }
    }
    for (const c of ZB_SLIDES_L4_STONES) {
      if (f.state[c] !== ZB_SLIDES_TAKEN) continue;
      f.slots.push(c);
      if (n > 5 && f.band[f.data[c] - ZB_SLIDES_ID]) solution.set(c, f.data[c] - ZB_SLIDES_ID);
    }
  }
  // The stones are shown empty.
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) if (f.state[c] === ZB_SLIDES_TAKEN) f.state[c] = ZB_SLIDES_SLOT;
  return { f, solution, groups };
}

/* The program's judge: which stones rise with the band stood as placement
   says (Map stone -> place in band). Levels 1 and 2 walk each row out from
   its base (validateChainAndMarkMatched, 0x443f25); levels 3 and 4 spread
   out from each ring's first stone (confirmEndpointMatches) or from the
   entrance (activateChainLink), so a stone rises if any way to it from
   the entrance is satisfied. Returns { risen, satisfied }: the stones that
   rise and the joining stones satisfied. */
function zbSlidesJudge(f, placement) {
  const g = { ...f, state: f.state.slice(), data: f.data.slice() };
  for (const [c, i] of placement) { g.state[c] = ZB_SLIDES_TAKEN; g.data[c] = ZB_SLIDES_ID + i; }
  const is = (c, ...s) => zbSlidesIs(g, c, ...s);
  const set = (c, s) => { if (c >= 0 && c < ZB_SLIDES_CELLS) g.state[c] = s; };
  const L = (c, d) => zbSlidesLink(g, c, d);
  const same = (a, b, kind) => is(a, ZB_SLIDES_TAKEN, ZB_SLIDES_LOCKED) && is(b, ZB_SLIDES_TAKEN, ZB_SLIDES_LOCKED)
    && zbSlidesTraitOf(g, g.data[a], kind - ZB_SLIDES_HAIR) === zbSlidesTraitOf(g, g.data[b], kind - ZB_SLIDES_HAIR);
  const back = c => [0, 1, 2].map(d => L(c, d)).find(x => x !== -1) ?? -1;
  const fwd = c => [5, 4, 3].map(d => L(c, d)).find(x => x !== -1) ?? -1;
  if (f.level <= 2) {
    for (const start of placement.keys()) {
      set(start, ZB_SLIDES_TAKEN);
      let cur = start;
      for (;;) {
        const up = back(cur);
        if (up < 0) { cur = -1; break; }
        if (g.state[up] === f.base) break;
        cur = up;
      }
      while (cur >= 0) {
        const s = g.state[cur], kind = g.data[cur];
        if (s === ZB_SLIDES_INERT || s === ZB_SLIDES_SLOT) break;
        if (s === ZB_SLIDES_TAKEN) set(cur, ZB_SLIDES_LOCKED);
        else if (s === ZB_SLIDES_PATH) {
          if (kind >= ZB_SLIDES_HAIR && kind <= ZB_SLIDES_HAIR + 3) {
            if (!same(back(cur), fwd(cur), kind)) break;
            set(cur, ZB_SLIDES_MATCHED);
          } else if (f.level === 2 && kind === 0 && g.state[cur - 1] === ZB_SLIDES_LOCKED) set(cur, ZB_SLIDES_MATCHED);
        }
        cur = fwd(cur);
      }
    }
  } else {
    // evalTraitMatchAndAdvance: the joining stone mid between tail (on the
    // risen side) and lead.
    const step = (lead, mid, tail) => {
      if (mid < 0 || !is(mid, ZB_SLIDES_PATH)) return;
      const kind = g.data[mid];
      if (kind >= ZB_SLIDES_HAIR) {
        if (lead >= 0 && is(tail, ZB_SLIDES_TAKEN, ZB_SLIDES_LOCKED) && is(lead, ZB_SLIDES_TAKEN, ZB_SLIDES_LOCKED)) {
          if (same(tail, lead, kind)) { set(lead, ZB_SLIDES_LOCKED); set(mid, ZB_SLIDES_MATCHED); }
        } else if (lead >= 0 && is(lead, ZB_SLIDES_MATCHED, ZB_SLIDES_PATH)) set(lead, ZB_SLIDES_MATCHED);
      } else if (is(tail, ZB_SLIDES_TAKEN, ZB_SLIDES_LOCKED, ZB_SLIDES_MATCHED)) {
        set(mid, ZB_SLIDES_MATCHED);
        if (lead >= 0) {
          if (is(lead, ZB_SLIDES_TAKEN, ZB_SLIDES_LOCKED)) set(lead, ZB_SLIDES_LOCKED);
          else if (is(lead, ZB_SLIDES_PATH)) set(lead, ZB_SLIDES_MATCHED);
        }
      }
    };
    if (f.level === 3) {
      // propagateMatchChain: round a ring each way from its first stone.
      const ring = (c, a, b, e) => {
        const link = L(c, a);
        if (link < 0) return;
        const lead = L(link, 4);
        step(lead, link, c);
        if (!is(lead, ZB_SLIDES_LOCKED, ZB_SLIDES_MATCHED)) return;
        const outer = L(lead, 4), outerLead = outer >= 0 ? L(outer, 4) : -1;
        step(outerLead, outer, lead);
        if (!is(outerLead, ZB_SLIDES_LOCKED, ZB_SLIDES_MATCHED)) return;
        const corner = L(outerLead, 4), cornerLead = corner >= 0 ? L(corner, b) : -1;
        step(cornerLead, corner, outerLead);
        if (!is(cornerLead, ZB_SLIDES_LOCKED, ZB_SLIDES_MATCHED)) return;
        const branch = L(cornerLead, e), branchLead = branch >= 0 ? L(branch, 1) : -1;
        step(branchLead, branch, cornerLead);
        if (!is(branchLead, ZB_SLIDES_LOCKED, ZB_SLIDES_MATCHED)) return;
        const last = L(branchLead, 1);
        if (last >= 0) step(L(last, 1), last, branchLead);
      };
      for (const c of [19, 55, 91]) {
        if (!is(c, ZB_SLIDES_TAKEN)) continue;
        set(c, ZB_SLIDES_LOCKED);
        ring(c, 5, 3, 2);
        ring(c, 3, 5, 0);
      }
    } else {
      // evalNeighborStates, from each risen stone of ZB_SLIDES_L4_JUDGED.
      const around = c => {
        const west = L(c, 4);
        if (west >= 0) step(L(west, 4), west, c);
        const link = L(c, 1);
        if (link >= 0) step(L(link, 1), link, c);
        for (const [d, inner, branch] of [[5, 3, 0], [3, 5, 2]]) {
          const mid = L(c, d);
          if (mid < 0) continue;
          const lead = L(mid, d);
          step(lead, mid, c);
          if (!is(lead, ZB_SLIDES_LOCKED, ZB_SLIDES_MATCHED)) continue;
          const i = L(lead, inner);
          if (i >= 0) step(L(i, inner), i, lead);
          const b = L(lead, branch);
          if (b >= 0) step(L(b, branch), b, lead);
        }
        const nw = L(c, 0);
        if (nw >= 0) step(L(nw, 0), nw, c);
        const sw = L(c, 2);
        if (sw >= 0) step(L(sw, 2), sw, c);
      };
      if (is(55, ZB_SLIDES_TAKEN)) {
        set(55, ZB_SLIDES_LOCKED);
        for (const c of ZB_SLIDES_L4_JUDGED) {
          if (is(c, ZB_SLIDES_TAKEN) && [0, 1, 2, 3, 4, 5].some(d => is(L(c, d), ZB_SLIDES_MATCHED))) set(c, ZB_SLIDES_LOCKED);
          if (is(c, ZB_SLIDES_MATCHED, ZB_SLIDES_LOCKED)) around(c);
        }
      }
    }
  }
  const satisfied = new Set();
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) if (g.state[c] === ZB_SLIDES_MATCHED) satisfied.add(c);
  return { risen: new Set([...placement.keys()].filter(c => g.state[c] === ZB_SLIDES_LOCKED)), satisfied };
}

/* The stones in reading order, top row first, each row left to right:
   Map(stone cell -> number from 1). */
function zbSlidesNumbers(slots) {
  const sorted = slots.slice().sort((a, b) => zbSlidesCellXY(a).y - zbSlidesCellXY(b).y || zbSlidesCellXY(a).x - zbSlidesCellXY(b).x);
  return new Map(sorted.map((c, i) => [c, i + 1]));
}

/* The marked joining stones: [{ cell, kind, ends: [stone, stone] }]. */
function zbSlidesMarked(f) {
  const out = [];
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) {
    if (f.state[c] !== ZB_SLIDES_PATH || f.data[c] < ZB_SLIDES_HAIR || f.data[c] > ZB_SLIDES_HAIR + 3) continue;
    const ends = [0, 1, 2, 3, 4, 5].map(d => zbSlidesLink(f, c, d)).filter(x => x >= 0);
    out.push({ cell: c, kind: ZB_TRAIT_KINDS[f.data[c] - ZB_SLIDES_HAIR], ends });
  }
  return out;
}

const ZB_SLIDES_SAME = { hair: 'the same hair', eyes: 'the same eyes', nose: 'the same nose', feet: 'the same feet' };

/* ---- Taken apart ------------------------------------------------------
   Nothing is hidden at Stone Rise: the joining stones show their traits,
   so there is no strategy to find, only where to stand whom. A Zoombini
   crosses if it stands on a stone that rises, and a stone rises when it
   holds a Zoombini and some way to it from its entrance runs through
   stones that hold Zoombinis and joining stones they satisfy; this is the
   program's judge (zbSlidesJudge) put as a graph, and every solution given
   is held to the judge itself. */

/* A dealt state as a field again, for the judge and the solver. */
function zbSlidesFieldOf(level, band, state) {
  return {
    level, n: band.length, band, base: state.slotCellState,
    state: state.cellStates.slice(), data: state.cellData.slice(), link: state.cellLinks, slots: state.slotCellIndices.slice(),
  };
}

/* The stones as a graph: stones (cells, in reading order), index (cell ->
   place in stones), entrance (per stone, whether a base is beside it),
   adj (per stone, [{ t, kind }]: another stone and the trait, 0-3, the
   joining stone between asks, or -1 for none; through a chain of plain
   joining stones too), and joins: the joining stones between two stones,
   [{ cell, a, b, kind }], which the form can change. */
function zbSlidesGraph(f) {
  const number = zbSlidesNumbers(f.slots), stones = f.slots.slice().sort((a, b) => number.get(a) - number.get(b));
  const index = new Map(stones.map((c, i) => [c, i])), adj = stones.map(() => []), joins = [];
  const traitOf = c => f.data[c] >= ZB_SLIDES_HAIR && f.data[c] <= ZB_SLIDES_HAIR + 3 ? f.data[c] - ZB_SLIDES_HAIR : -1;
  stones.forEach((s, i) => {
    // Every way out, a cell visited once for each trait asked on the way
    // to it, so that two ways to one stone (one marked, one plain) are both
    // kept.
    const seen = new Set(), stack = [0, 1, 2, 3, 4, 5].map(d => [zbSlidesLink(f, s, d), -1]);
    while (stack.length) {
      const [c, kind] = stack.pop();
      if (c < 0 || c === s || seen.has(`${c},${kind}`)) continue;
      seen.add(`${c},${kind}`);
      if (index.has(c)) {
        if (!adj[i].some(e => e.t === index.get(c) && e.kind === kind)) adj[i].push({ t: index.get(c), kind });
        continue;
      }
      if (f.state[c] !== ZB_SLIDES_PATH) continue;
      const k = traitOf(c);
      // A shown trait asks it of the stones either side; past them it is
      // no joining stone of theirs.
      if (k >= 0 && kind >= 0) continue;
      for (let d = 0; d < 6; d++) stack.push([zbSlidesLink(f, c, d), k >= 0 ? k : kind]);
    }
  });
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) {
    if (f.state[c] !== ZB_SLIDES_PATH || !(f.data[c] === 0 || traitOf(c) >= 0)) continue;
    const ends = [0, 1, 2, 3, 4, 5].map(d => zbSlidesLink(f, c, d)).filter(x => x >= 0);
    if (ends.length === 2 && ends.every(x => index.has(x))) {
      const [a, b] = ends.map(x => index.get(x)).sort((x, y) => x - y);
      joins.push({ cell: c, a, b, kind: traitOf(c) });
    }
  }
  joins.sort((x, y) => x.a - y.a || x.b - y.b);
  const entrance = stones.map(s => [0, 1, 2, 3, 4, 5].some(d => { const c = zbSlidesLink(f, s, d); return c >= 0 && f.state[c] === f.base; }));
  return { stones, index, adj, joins, entrance };
}

/* The stones that rise with the band stood as place says (per stone, a
   band index or -1): those reached from an entrance through stones with
   Zoombinis on them and joining stones they satisfy. */
function zbSlidesRisen(g, band, place) {
  const risen = new Array(g.stones.length).fill(false), queue = [];
  g.stones.forEach((_, i) => { if (g.entrance[i] && place[i] >= 0) { risen[i] = true; queue.push(i); } });
  while (queue.length) {
    const i = queue.pop();
    for (const { t, kind } of g.adj[i]) {
      if (risen[t] || place[t] < 0) continue;
      if (kind >= 0 && band[place[i]][ZB_TRAIT_KINDS[kind]] !== band[place[t]][ZB_TRAIT_KINDS[kind]]) continue;
      risen[t] = true;
      queue.push(t);
    }
  }
  return risen;
}

/* Whether this state is the one a level 4 band could have entered the ZB
   Zone in: exactly four on the stones, on 55, 57, 59 and 61, all risen. */
function zbSlidesZone(level, g, place, risen) {
  if (level !== 4) return false;
  const on = g.stones.filter((c, i) => place[i] >= 0);
  return on.length === 4 && [55, 57, 59, 61].every(c => g.index.has(c) && risen[g.index.get(c)]);
}

/* The most that can cross and how (the puzzle's solve). Only placements in
   which everyone stood on a stone rises are counted (anyone else stands
   aside, which changes nothing), and two alike Zoombinis swapped are one
   way, not two. Simplest is nearest the band's own order: read the stones
   in their numbered order and count the pairs of Zoombinis on them out of
   band order; fewest first (of two alike, the earlier stands on the stone
   read first).
   Levels 1 and 2 are rows, each on its own: the most and the ways are a
   sum over the rows, each row's choices (who stands on its first one, two
   or three stones) tried against which of the band the rows above have
   taken, and the simplest are found best first (A*), the least disorder
   the rows below can still make known exactly. Levels 3 and 4 are
   searched stone by stone out from the entrances, from as many as there
   are stones or Zoombinis down until a placement is found, the disorder
   so far bounding the search; the ways are counted while the budget
   lasts. */
function zbSlidesSolve(level, band, state, opts = {}) {
  const f = zbSlidesFieldOf(level, band, state), g = zbSlidesGraph(f);
  const n = band.length, S = g.stones.length, KEEP = 12;
  const deadline = Date.now() + (opts.budget || 1500);
  const T = band.map(z => ZB_TRAIT_KINDS.map(k => z[k]));
  const prevTwin = band.map((z, i) => { for (let j = i - 1; j >= 0; j--) if (zbZoombiniId(band[j]) === zbZoombiniId(z)) return j; return -1; });
  const twin = band.map((z, i) => band.some((y, j) => j !== i && zbZoombiniId(y) === zbZoombiniId(z)));
  const bits = x => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
  const shares = (a, b, kind) => kind < 0 || T[a][kind] === T[b][kind];
  const cap = Math.min(n, S);
  let most = null, ways = null, exact = true, complete = true, found = [];
  /* The disorder of a placement (per stone, a band index or -1): pairs out
     of band order, reading the stones in order; of two alike, the earlier
     is put on the stone read first. */
  const disorder = place => {
    const p = place.slice();
    band.forEach((_, z) => {
      const y = prevTwin[z];
      if (y < 0) return;
      const iz = p.indexOf(z), iy = p.indexOf(y);
      if (iz >= 0 && iy >= 0 && iz < iy) { p[iz] = y; p[iy] = z; }
    });
    const on = p.filter(z => z >= 0);
    let d = 0;
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (on[i] > on[j]) d++;
    return { d, place: p };
  };

  if (level <= 2) {
    const rows = [];
    g.stones.forEach((_, i) => {
      if (!g.entrance[i]) return;
      const chain = [i], kinds = [];
      for (let cur = i, prev = -1; ;) {
        const next = g.adj[cur].find(e => e.t !== prev && !chain.includes(e.t));
        if (!next) break;
        chain.push(next.t); kinds.push(next.kind); prev = cur; cur = next.t;
      }
      rows.push({ chain, kinds, options: [] });
    });
    rows.sort((x, y) => Math.min(...x.chain) - Math.min(...y.chain));
    // Each row's choices: who stands on its first stones, what of the band
    // they take, which earlier twins must already stand above, and the
    // disorder among them, reading their stones in order.
    for (const row of rows) {
      const grow = tuple => {
        if (tuple.length) {
          const at = tuple.map((z, p) => ({ z, s: row.chain[p] })).sort((x, y) => x.s - y.s);
          let inner = 0, mask = 0, need = 0, bad = false;
          at.forEach((x, p) => {
            mask |= 1 << x.z;
            for (let q = 0; q < p; q++) if (at[q].z > x.z) inner++;
            const y = prevTwin[x.z];
            if (y < 0) return;
            const q = at.findIndex(w => w.z === y);
            if (q < 0) need |= 1 << y; else if (q > p) bad = true;
          });
          if (!bad) row.options.push({ tuple, mask, need, inner });
        }
        if (tuple.length === row.chain.length) return;
        for (let z = 0; z < n; z++) {
          if (tuple.includes(z) || (tuple.length && !shares(tuple[tuple.length - 1], z, row.kinds[tuple.length - 1]))) continue;
          grow([...tuple, z]);
        }
      };
      grow([]);
    }
    const R = rows.length, fits = (o, mask) => !(o.mask & mask) && !(o.need & ~mask);
    const cost = (o, mask) => { let c = o.inner; for (const z of o.tuple) c += bits(mask >>> (z + 1)); return c; };
    // The sum: which masks the rows can leave, and in how many ways.
    let layer = new Map([[0, 1]]);
    for (const row of rows) {
      const next = new Map(), add = (m, c) => next.set(m, (next.get(m) || 0) + c);
      for (const [mask, c] of layer) {
        add(mask, c);
        for (const o of row.options) if (fits(o, mask)) add(mask | o.mask, c);
      }
      layer = next;
    }
    most = 0;
    for (const m of layer.keys()) most = Math.max(most, bits(m));
    ways = 0;
    for (const [m, c] of layer) if (bits(m) === most) ways += c;
    // The least disorder from row r on, with mask taken above.
    const room = rows.map((_, r) => rows.slice(r).reduce((t, x) => t + x.chain.length, 0));
    const memo = rows.map(() => new Map());
    const h = (r, mask) => {
      if (r === R) return bits(mask) === most ? 0 : Infinity;
      if (bits(mask) + room[r] < most) return Infinity;
      if (memo[r].has(mask)) return memo[r].get(mask);
      let best = h(r + 1, mask);
      for (const o of rows[r].options) if (fits(o, mask)) best = Math.min(best, cost(o, mask) + h(r + 1, mask | o.mask));
      memo[r].set(mask, best);
      return best;
    };
    // Best first: a heap of partial placements by disorder so far and
    // the least to come.
    const heap = [], push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    if (h(0, 0) < Infinity) push({ f: h(0, 0), g: 0, r: 0, mask: 0, picks: [] });
    while (heap.length && found.length < KEEP) {
      if (Date.now() > deadline) { complete = false; break; }
      const x = pop();
      if (x.r === R) {
        const place = new Array(S).fill(-1);
        x.picks.forEach((o, r) => { if (o) o.tuple.forEach((z, p) => { place[rows[r].chain[p]] = z; }); });
        found.push({ inv: x.g, place });
        continue;
      }
      const hn = h(x.r + 1, x.mask);
      if (hn < Infinity) push({ f: x.g + hn, g: x.g, r: x.r + 1, mask: x.mask, picks: [...x.picks, null] });
      for (const o of rows[x.r].options) {
        if (!fits(o, x.mask)) continue;
        const c = cost(o, x.mask), m = x.mask | o.mask, hm = h(x.r + 1, m);
        if (hm < Infinity) push({ f: x.g + c + hm, g: x.g + c, r: x.r + 1, mask: m, picks: [...x.picks, o] });
      }
    }
  } else {
    // Stone by stone out from the entrances; stones no entrance leads to
    // can never rise and are left empty.
    // One entrance's stones all before the next's, so each ring is settled
    // before the search moves on.
    const order = [], seenS = new Set();
    g.stones.forEach((_, i) => {
      if (!g.entrance[i] || seenS.has(i)) return;
      const from = order.length;
      order.push(i); seenS.add(i);
      for (let k = from; k < order.length; k++) for (const { t } of g.adj[order[k]]) if (!seenS.has(t)) { seenS.add(t); order.push(t); }
    });
    const rank = new Array(S).fill(-1);
    order.forEach((s, k) => { rank[s] = k; });
    const search = (target, keep, until) => {
      const place = new Array(S).fill(-1), out = [];
      let used = 0, placed = 0, core = 0, done = true, count = 0;
      /* A stone may take z if it is an entrance, or a neighbour is still to
         be stood on, or one already stood on is joined to it in a way z
         satisfies. */
      const can = (s, z) => g.entrance[s] || g.adj[s].some(({ t, kind }) => rank[t] > rank[s] ? place[t] < 0 : place[t] >= 0 && shares(place[t], z, kind));
      // Pairs out of order among Zoombinis with no twin: a bound that only grows.
      const adds = (s, z) => {
        if (twin[z]) return 0;
        let c = 0;
        g.stones.forEach((_, t) => { const y = place[t]; if (y >= 0 && !twin[y] && ((t < s && y > z) || (t > s && y < z))) c++; });
        return c;
      };
      /* Whether every Zoombini stood so far could still rise: reached from
         an entrance through stones not left empty, by joining stones either
         not yet decided (a stone beside them still to be stood on) or
         satisfied. k stones of the order are decided. */
      const viable = k => {
        const open = s => rank[s] >= k || place[s] >= 0, seen = new Array(S).fill(false), queue = [];
        g.stones.forEach((_, s) => { if (g.entrance[s] && rank[s] >= 0 && open(s)) { seen[s] = true; queue.push(s); } });
        while (queue.length) {
          const s = queue.pop();
          for (const { t, kind } of g.adj[s]) {
            if (seen[t] || rank[t] < 0 || !open(t)) continue;
            if (rank[s] < k && rank[t] < k && !shares(place[s], place[t], kind)) continue;
            seen[t] = true;
            queue.push(t);
          }
        }
        return place.every((z, s) => z < 0 || seen[s]);
      };
      const dfs = k => {
        if (Date.now() > until) { done = false; return; }
        if (k && !viable(k)) return;
        if (k === order.length) {
          if (placed !== target || !zbSlidesRisen(g, band, place).every((r, i) => r || place[i] < 0)) return;
          count++;
          if (keep) {
            const { d, place: p } = disorder(place);
            if (out.length < keep || d < out[out.length - 1].inv) {
              out.push({ inv: d, place: p });
              out.sort((a, b) => a.inv - b.inv);
              if (out.length > keep) out.pop();
            }
          }
          return;
        }
        if (placed + Math.min(order.length - k, n - placed) < target) return;
        if (keep && out.length >= keep && core >= out[out.length - 1].inv) return;
        const s = order[k];
        if (placed < target) {
          const cands = [];
          for (let z = 0; z < n; z++) {
            if (used >> z & 1 || (prevTwin[z] >= 0 && !(used >> prevTwin[z] & 1)) || !can(s, z)) continue;
            cands.push([adds(s, z), z]);
          }
          cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          for (const [c, z] of cands) {
            if (!done) break;
            place[s] = z; used |= 1 << z; placed++; core += c;
            dfs(k + 1);
            place[s] = -1; used &= ~(1 << z); placed--; core -= c;
          }
        }
        if (done && placed + (order.length - k - 1) >= target) dfs(k + 1);
      };
      dfs(0);
      return { out, done, count };
    };
    // The placement the stones were laid out from, as far as it still holds.
    const dealt = g.stones.map(c => { const x = (state.solution || []).find(y => y.cell === c); return x ? x.zoombini : -1; });
    const dealtRisen = zbSlidesRisen(g, band, dealt);
    const dealtPlace = dealt.map((z, i) => dealtRisen[i] ? z : -1), dealtMost = dealtPlace.filter(z => z >= 0).length;
    let witness = dealtPlace, lower = dealtMost;
    if (lower < cap) {
      /* The most, by branch and bound: stone by stone, each stood on or left
         empty, the bound those stood on so far and the stones still
         reachable, as many as the Zoombinis left can fill; the dealt
         placement as the first best. */
      const place = new Array(S).fill(-1);
      let used = 0, placed = 0, done = true;
      const until = Date.now() + (deadline - Date.now()) * 0.6;
      const reach = k => {
        const open = s => rank[s] >= k || place[s] >= 0, seen = new Array(S).fill(false), queue = [];
        g.stones.forEach((_, s) => { if (g.entrance[s] && rank[s] >= 0 && open(s)) { seen[s] = true; queue.push(s); } });
        while (queue.length) {
          const s = queue.pop();
          for (const { t, kind } of g.adj[s]) {
            if (seen[t] || rank[t] < 0 || !open(t)) continue;
            if (rank[s] < k && rank[t] < k && !shares(place[s], place[t], kind)) continue;
            seen[t] = true; queue.push(t);
          }
        }
        if (!place.every((z, s) => z < 0 || seen[s])) return -1;
        return seen.filter((x, s) => x && rank[s] >= k).length;
      };
      const bb = k => {
        if (Date.now() > until) { done = false; return; }
        const more = k ? reach(k) : S;
        if (more < 0 || placed + Math.min(more, n - placed) <= lower) return;
        if (k === order.length) { lower = placed; witness = place.slice(); return; }
        const s = order[k];
        for (let z = 0; z < n && done; z++) {
          if (used >> z & 1 || (prevTwin[z] >= 0 && !(used >> prevTwin[z] & 1))) continue;
          if (!g.entrance[s] && !g.adj[s].some(({ t, kind }) => rank[t] > rank[s] ? place[t] < 0 : place[t] >= 0 && shares(place[t], z, kind))) continue;
          place[s] = z; used |= 1 << z; placed++;
          bb(k + 1);
          place[s] = -1; used &= ~(1 << z); placed--;
          if (lower === cap) return;
        }
        if (done) bb(k + 1);
      };
      bb(0);
      if (!done) { exact = false; complete = false; }
    }
    most = lower;
    const r = search(most, KEEP, deadline);
    if (!r.done) complete = false;
    found = r.out.length ? r.out : [{ ...disorder(witness), inv: disorder(witness).d }];
    if (most === cap) exact = true;
    if (complete && Date.now() < deadline) {
      const all = search(most, 0, deadline);
      ways = all.done ? all.count : null;
    }
  }
  const best = { found, done: complete };

  const number = zbSlidesNumbers(f.slots);
  const solutions = (best ? best.found : []).map(({ inv, place }) => {
    const judged = zbSlidesJudge(f, new Map(place.map((z, i) => [g.stones[i], z]).filter(([, z]) => z >= 0)));
    const risen = g.stones.map(c => judged.risen.has(c));
    const crosses = place.filter((z, i) => z >= 0 && risen[i]).sort((a, b) => a - b);
    const behind = band.map((_, i) => i).filter(i => !crosses.includes(i));
    const on = g.stones.map((c, i) => [number.get(c), place[i]]).filter(([, z]) => z >= 0);
    const shared = g.joins.filter(j => j.kind >= 0 && place[j.a] >= 0 && place[j.b] >= 0 && T[place[j.a]][j.kind] === T[place[j.b]][j.kind])
      .map(j => `stones ${number.get(g.stones[j.a])} and ${number.get(g.stones[j.b])} both have ${zbTraitWith(ZB_TRAIT_KINDS[j.kind], T[place[j.a]][j.kind])}`);
    const steps = [
      on.length ? `Stand ${on.map(([s, z]) => `Zoombini ${z + 1} on stone ${s}`).join(', ')}.` : 'No one can stand on a stone that rises.',
    ];
    if (shared.length) steps.push(`The marked stones are met: ${zbWordsOr(shared, 'and')}.`);
    steps.push(behind.length ? `${behind.length === 1 ? 'Zoombini' : 'Zoombinis'} ${zbPlacesWords(behind)} ${behind.length === 1 ? 'stays' : 'stay'} behind.` : 'Everyone is on a stone that rises.');
    if (zbSlidesZone(level, g, place, risen)) steps.push('With four on the entrance’s row and all four risen, this enters the psychedelic ZB Zone: the program writes so on the screen and cycles the colours.');
    return {
      title: `${crosses.length === n ? `All ${n}` : `${crosses.length} of ${n}`} cross, ${inv === 0 ? 'in band order' : `${inv} pair${inv === 1 ? '' : 's'} out of band order`}`,
      steps, crosses, inv,
      diagram: zbSlidesDiagram(f, g, band, place, risen),
    };
  }).filter(s => s.crosses.length === most);
  return {
    most, exact, ways,
    solutions,
    notes: [
      'A Zoombini crosses if it stands on a stone that rises; a stone rises when some way to it from its entrance runs through stones with Zoombinis on them and joining stones they satisfy. Those on stones that do not rise, and those not stood on a stone, stay behind.',
      'Simplest is nearest the band’s own order: read the stones in their numbered order and count the pairs of Zoombinis on them out of band order; fewest first.',
      'Two alike Zoombinis swapped count as one way, and those who stay behind are not told apart by where they wait.',
      ways == null ? 'The ways were not all counted within the budget.' : `${ways} way${ways === 1 ? '' : 's'} in all to stand ${most} on stones that rise.`,
      ...(complete ? [] : ['The search stopped at its budget: the simplest found are listed, and there may be simpler.']),
    ],
  };
}

/* The field drawn: the joining stones with their traits (the shared value's
   own sprite where both Zoombinis beside one share it), the stones
   numbered, risen ones edged, the band on the stones as place says, and
   those not on a stone that rises waiting at the right, faded. */
function zbSlidesDiagram(f, g, band, place, risen, caption = null) {
  const W = 800, H = 520, items = [];
  // Scaled to fill the room the stones' cells need, leaving the right for
  // those who stay behind.
  const used = [];
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) if (f.state[c] !== ZB_SLIDES_INERT) used.push(zbSlidesCellXY(c));
  const placedSet = new Set(place.filter(z => z >= 0));
  const aside = band.map((_, i) => i).filter(i => !placedSet.has(i));
  const x0 = Math.min(...used.map(p => p.x)), x1 = Math.max(...used.map(p => p.x));
  const y0 = Math.min(...used.map(p => p.y)), y1 = Math.max(...used.map(p => p.y));
  const room = aside.length ? 560 : 720;
  const sx = Math.min(2.2, room / Math.max(1, x1 - x0)), sy = Math.min(2.6, 400 / Math.max(1, y1 - y0));
  const ox = 40 + (room - (x1 - x0) * sx) / 2;
  const at = c => { const p = zbSlidesCellXY(c); return { x: Math.round(ox + (p.x - x0) * sx), y: Math.round(78 + (p.y - y0) * sy) }; };
  const hex = (x, y, r, fill, stroke, extra = {}) => Object.assign({ t: 'poly', fill, stroke,
    points: [0, 1, 2, 3, 4, 5].flatMap(k => [Math.round(x + r * Math.sin(k * Math.PI / 3)), Math.round(y - r * Math.cos(k * Math.PI / 3))]) }, extra);
  const cells = [];
  for (let c = 0; c < ZB_SLIDES_CELLS; c++) if (f.state[c] !== ZB_SLIDES_INERT) cells.push(c);
  const drawn = new Set();
  for (const c of cells) for (let d = 0; d < 6; d++) {
    const t = zbSlidesLink(f, c, d);
    if (t < 0 || f.state[t] === ZB_SLIDES_INERT || drawn.has(`${t},${c}`)) continue;
    drawn.add(`${c},${t}`);
    const a = at(c), b = at(t);
    items.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'line', width: 3 });
  }
  const number = zbSlidesNumbers(f.slots);
  for (const c of cells) {
    const { x, y } = at(c);
    if (f.state[c] === f.base) items.push(hex(x, y, 18, 'wood', 'line'));
    else if (f.state[c] === ZB_SLIDES_PATH) {
      const k = f.data[c] >= ZB_SLIDES_HAIR && f.data[c] <= ZB_SLIDES_HAIR + 3 ? f.data[c] - ZB_SLIDES_HAIR : -1;
      const j = g.joins.find(j => j.cell === c);
      const met = j && k >= 0 && place[j.a] >= 0 && place[j.b] >= 0 && band[place[j.a]][ZB_TRAIT_KINDS[k]] === band[place[j.b]][ZB_TRAIT_KINDS[k]];
      items.push(hex(x, y, k >= 0 ? 17 : 11, k >= 0 ? 'panel' : 'stone', k >= 0 ? (met ? 'good' : 'accent') : 'line'));
      if (met) items.push({ t: 'trait', kind: ZB_TRAIT_KINDS[k], value: band[place[j.a]][ZB_TRAIT_KINDS[k]], x, y: y - 3, scale: 1 });
      if (k >= 0) items.push({ t: 'text', x, y: y + (met ? 27 : 4), text: ZB_TRAIT_KINDS[k], size: 9, anchor: 'middle', fill: met ? 'good' : 'accent' });
    }
  }
  const standing = [];
  g.stones.forEach((c, i) => {
    const { x, y } = at(c);
    items.push(hex(x, y, 22, 'stone', risen[i] ? 'good' : 'line', risen[i] ? { width: 3 } : {}));
    items.push({ t: 'text', x: x + 20, y: y + 20, text: String(number.get(c)), size: 11, anchor: 'start', fill: 'dim' });
    if (place[i] >= 0) standing.push({ t: 'zoombini', i: place[i], x, y: y + 8, faded: !risen[i] });
  });
  // Drawn top row first, so those below stand in front.
  standing.sort((a, b) => a.y - b.y);
  items.push(...standing);
  if (aside.length) {
    items.push({ t: 'text', x: 648, y: 58, text: 'behind', size: 12, fill: 'dim' });
    items.push(...zbDiagramRows(aside, 660, 110, 4, 36, 56, { faded: true }));
  }
  const up = risen.filter(Boolean).length;
  items.push({ t: 'text', x: 10, y: 20, text: caption || `${up} of ${band.length} on stones that rise`, size: 15, fill: 'ink' });
  return { width: W, height: H, items };
}

ZB_PUZZLES.set('SLIDES', {
  about: 'The band is stood on stones in a field of hexagons. A stone between two Zoombinis may show a trait, and then the two must share it; the stones rise from the entrance as far as the band satisfies them, and only Zoombinis on risen stones go on.',
  levels: [
    { rule: 'Pairs, one to a row: the band paired off, each Zoombini with the first later one that shares a trait, trying the traits in turn from one drawn at random; a pair is two stones joined by one showing a trait they share, and a Zoombini left over has a stone to itself.',
      chances: 'As many tries as it takes: Zoombinis can be moved as often as the player likes, and the band may go once one stone has risen.',
      notes: ['The program pairs the band up to ten times, putting the Zoombinis left single first each time; it never resets its count of singles, so after a first try that leaves two or more single it makes all ten tries and keeps the last.'] },
    { rule: 'Chains of up to three stones, one to a row, the stones between them each showing a trait or plain. Each chain follows Zoombinis that share a trait with the one before, trying the traits from one drawn at random for each; a plain stone asks nothing. The rise stops at the first joining stone the band does not satisfy.',
      chances: 'As many tries as it takes, as at every level.' },
    { rule: 'Three rings of up to six stones, each entered at its right-hand stone, and the rise goes both ways round. The band is sorted by how many it shares a trait with; each ring’s two ends take the two most sociable left, in one of three orders of the rings drawn at random, and their neighbours are found from the least sociable up; stones no one was found for are dropped, or kept with plain stones either side if the band needs them.',
      chances: 'As many tries as it takes, as at every level.',
      notes: ['A stone rises if either way round its ring to it is satisfied, so one unsatisfied marked stone need not keep anyone back.'] },
    { rule: 'One network of up to 26 stones on a pattern of diamonds, entered at the middle of the right. The program stands the band out from the entrance, each Zoombini sharing a trait with the one it is joined to, then clears the paths no one was stood on. Five or fewer Zoombinis get one chain instead.',
      chances: 'As many tries as it takes, as at every level.',
      notes: ['A coin toss first picks one of two looks for the stones; it does not change the rule.',
        'A stone rises if any way to it from the entrance is satisfied.',
        'The program’s own, not in ScummVM: when exactly four Zoombinis stand on the network, on the four stones of the entrance’s row, and all four rise, it writes “You have entered the psychedelic ZB Zone!” on the screen and cycles the colours, once a visit (0x4451a3 from 0x4452b6, 0x448d00). A band of four at this level always meets it when it succeeds. ScummVM cycles the colours but writes nothing.',
        'In a few bands in ten thousand, no two Zoombinis next to each other on the program’s sorted list share a trait, and its first search goes wrong: it either stands a Zoombini on the entrance stone while still finding it a stone of its own, or stands no one there and asks for the traits of a Zoombini it has not got. ScummVM leaves the stone empty in the second case.',
        'For three to five Zoombinis the program marks each stone of the chain for two Zoombinis it finds by looking its sorted list up in itself, and stands the band on the stones in their own order, which need not satisfy the marks; the marks can always be satisfied, and the arrangement given here does.'] },
  ],
  deal(level, band, rnd) {
    const { f, solution, groups } = zbSlidesBuild(level, band, rnd);
    const number = zbSlidesNumbers(f.slots), marked = zbSlidesMarked(f);
    const stone = c => `stone ${number.get(c)}`;
    const setup = [];
    const firsts = cells => cells.filter(c => number.has(c)).map(c => number.get(c)).sort((a, b) => a - b);
    const count = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;
    const stones = count(f.slots.length, 'stone'), zoombinis = count(band.length, 'Zoombini');
    if (level === 1) {
      const pairs = groups.filter(g => g.members.length === 2).length, singles = groups.length - pairs;
      const parts = [pairs && `${count(pairs, 'pair')} of stones`, singles && count(singles, 'single stone')].filter(Boolean);
      setup.push(`${count(groups.length, 'row')}: ${zbWordsOr(parts, 'and')}, ${stones} for ${zoombinis}, each row entered from the right.`);
    } else if (level === 2) {
      setup.push(`${stones} for ${zoombinis}, in chains of up to three, one to a row, each entered from the right.`);
    } else if (level === 3) {
      const at = firsts([19, 55, 91]);
      setup.push(`${['One ring', 'Two rings', 'Three rings'][at.length - 1]} of stones, ${stones} for ${zoombinis}, entered from the right at ${at.length === 1 ? 'stone' : 'stones'} ${zbWordsOr(at.map(String), 'and')}.`);
    } else if (band.length <= 5) {
      setup.push(`A chain of ${stones} for ${zoombinis}, entered from the right at stone ${number.get(55)}.`);
    } else {
      setup.push(`One network of ${stones} for ${zoombinis}, entered at the middle of the right at stone ${number.get(55)}.`);
    }
    setup.push('The stones are numbered here in reading order: the top row first, each row left to right.');
    const ends = m => m.ends.filter(c => number.has(c)).map(c => number.get(c)).sort((a, b) => a - b);
    const answer = marked.map(m => ({ at: ends(m), kind: m.kind })).sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
      .map(m => `Stones ${m.at.join(' and ')} need ${ZB_SLIDES_SAME[m.kind]}.`);
    if (level === 1) {
      for (const g of groups) if (g.members.length === 1) answer.push(`Stone ${number.get(f.slots.find(c => solution.get(c) === g.members[0]))} stands alone: anyone may stand there.`);
    } else if (level === 2) {
      for (let c = 0; c < ZB_SLIDES_CELLS; c++) {
        if (f.state[c] === ZB_SLIDES_PATH && f.data[c] === 0) answer.push(`Stones ${ends({ ends: [c - 1, c + 1] }).join(' and ')} are joined by a plain stone, which asks nothing.`);
      }
    } else {
      const plain = f.state.filter((st, c) => st === ZB_SLIDES_PATH && !(f.data[c] >= ZB_SLIDES_HAIR && f.data[c] <= ZB_SLIDES_HAIR + 3)).length;
      if (plain) answer.push(marked.length ? 'Every other joining stone is plain and asks nothing.' : 'No joining stone shows a trait: anyone may stand anywhere.');
    }
    if (!answer.length) answer.push('No joining stone shows a trait: anyone may stand anywhere.');
    if (f.quirk) answer.push(`The program goes astray here: ${f.quirk}.`);
    const where = new Map([...solution].map(([c, i]) => [i, c]));
    return {
      setup,
      answer,
      marks: band.map((z, i) => where.has(i) ? stone(where.get(i)) : null),
      state: {
        slotCellState: f.base,
        pairGroupCount: groups ? (groups.count ?? groups.length) : 0,
        pairLinkTypes: level === 1 ? groups.map(g => g.trait < 0 ? ZB_SLIDES_PATH : g.trait + ZB_SLIDES_HAIR) : level === 2 ? groups.links : [],
        slotCellIndices: f.slots,
        cellStates: f.state, cellData: f.data, cellLinks: f.link,
        solution: [...solution].map(([cell, i]) => ({ cell, zoombini: i })),
        marked, quirk: f.quirk,
      },
    };
  },
  /* Nothing is hidden, so the form is what the joining stones show: each
     one between two stones may be given another trait, or made plain. */
  form(level, band, state) {
    const f = zbSlidesFieldOf(level, band, state), g = zbSlidesGraph(f), number = zbSlidesNumbers(f.slots);
    const kinds = level === 1 ? ZB_TRAIT_KINDS : ['plain', ...ZB_TRAIT_KINDS];
    const fields = g.joins.map(j => ({
      key: `j${j.cell}`, label: `Stones ${number.get(g.stones[j.a])} and ${number.get(g.stones[j.b])}`, kind: 'choice',
      value: j.kind < 0 ? 'plain' : ZB_TRAIT_KINDS[j.kind],
      options: kinds.map(k => ({ value: k, label: k === 'plain' ? 'plain, asking nothing' : `the same ${k}` })),
    }));
    fields.push({ key: 'note', kind: 'note', note: `Where the stones lie is as dealt; only what the joining stones between them show can be changed${level === 1 ? ', and at this level every one shows a trait' : ''}. The program shows only traits the Zoombinis it laid the stones out from share, so a changed stone may ask for what no two of the band have.` });
    return fields;
  },
  edit(level, band, state, values) {
    const f = zbSlidesFieldOf(level, band, state), g = zbSlidesGraph(f), data = state.cellData.slice();
    for (const [key, v] of Object.entries(values)) {
      if (key === 'note') continue;
      const j = g.joins.find(j => `j${j.cell}` === key);
      if (!j) throw new Error(`There is no joining stone ${key} between two stones here.`);
      if (v === 'plain') {
        if (level === 1) throw new Error('At level 1 every joining stone shows a trait: a pair is joined by one they share.');
        data[j.cell] = 0;
      } else if (ZB_TRAIT_KINDS.includes(v)) data[j.cell] = ZB_SLIDES_HAIR + ZB_TRAIT_KINDS.indexOf(v);
      else throw new Error(`A joining stone shows hair, eyes, nose or feet${level === 1 ? '' : ', or nothing'}, not ${v}.`);
    }
    const next = Object.assign({}, state, { cellData: data, edited: true });
    next.marked = zbSlidesMarked({ state: next.cellStates, data, link: next.cellLinks });
    return next;
  },
  solve(level, band, state, arc, opts = {}) { return zbSlidesSolve(level, band, state, opts); },
  source: 'ScummVM’s puzzle_slides.cpp, checked against the program’s code.',
});
