/* zb-puzzle-tunnels.js -- the Stone Cold Caves: four tunnels, and Cave
   Guardians who let some Zoombinis through and turn the rest back.
   =========================================================================
   Needs zb-puzzle.js.

   The band waits between four tunnel entrances, two on its left and two on
   its right, and each Zoombini is dragged into one. A tunnel passes two
   guardians: one of the left and right pair and one of the upper and lower
   pair (the help's words). The leftmost tunnel passes the left and upper
   guardians, the next the left and lower, the next the right and lower,
   and the rightmost the right and upper; the two outer tunnels come out in
   the upper caves and the two inner ones in the lower. Each pair keeps a
   rule, some trait values: one guardian of the pair lets through the
   Zoombinis with any of them and the other those with none, which way
   round a coin toss decides. A Zoombini goes through only if both of its
   tunnel's guardians let it; otherwise it is sent back, and one of the
   level's chances is used.

   At level 1 only the left and right guardians keep a rule, one trait
   value dealt as Allergic Cliffs deal theirs: the program counts the band
   members with each of the 20 values, looks for a count between 1 and 15
   that some value gives, from half the band stepping +1, -2, +1, -2, ...,
   and picks one of the values with it at random. A count the Allergic
   Cliffs' rule gave, when only one value there gave it, is left out if
   any other count is to be had. Another coin, tossed before the rule is
   dealt, closes one tunnel on each side: either the two outer ones or the
   two inner ones turn every Zoombini back.

   At levels 2 to 4 both pairs keep a rule. The program lists every rule of
   the level's form (level 2 one trait value, 20 of them; level 3 one trait
   with either of two values, 40; level 4 either of two traits' values,
   150) and scores every ordered pair of two different rules on the band:
   into how many of the four groups (both rules, the first only, the second
   only, neither) it sorts at least one Zoombini, and how evenly, as the
   sum of the differences between the four groups' sizes taken two at a
   time. Of the pairs that fill the most groups it keeps those with the
   smallest sum, and picks one at random; the first rule goes to the left
   and right guardians and the second to the upper and lower.

   Taken apart (the page's workbench): the form is the rules, which side
   each pair's guardian with the values is on, and at level 1 the closed
   pair; any rule of the level's form may be put in, the two different.
   Known, the rules give every Zoombini one tunnel, so all go through, one
   way. Unknown, the player sends a Zoombini into a tunnel and learns
   whether it went through, or which guardian turned it back: the side
   guardian (it belongs on the other side) or the upper or lower one (the
   other tunnel on this side), which handleZoombiniPlacement shows by
   animating that guardian (kHoverDataToGateType; the program's table at
   0x4a73dc, used at 0x45a6ec). zbTunnelsStrategy says how the play is
   found. The chances are generous: played well, no band at any level
   loses a Zoombini, and the worst case uses a quarter to a half of them.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_tunnels.cpp and .h
   (initStates, loadZoombinisFromPack, setupLevel1_singleTrait to
   setupLevel4_crossCategoryTrait, evaluateRule, handleZoombiniPlacement,
   debugGetChances), checked against the program's own code in ZOOMBI32.EXE
   of the 1996 disc's ZBARC32.Z:
   - the page's setup is 0x459767. It sets the chances to 16, 18, 20 or 22
     by level, and first calls 0x4595f8, which clears the guards, forgets
     the Allergic Cliffs' count in practice games only, and tosses the coin
     for the closed tunnels (random(0, 1) into 0x4b752c) at every level;
   - it then loads the band (0x4523c2), drawing random(0, 64) for each
     Zoombini, an idle phase, before the rule: deal() makes those draws;
   - level 1 is 0x45c1f6: the 20 values, the Allergic Cliffs' count, the
     search and the pick as ScummVM has them. It reads the Allergic
     Cliffs' rule word (0x4b6ab0) only to see that one was left, as ScummVM
     reads its flag, and the count (0x4b6ab4); the Tunnels never clear
     either except in a practice game, so neither does deal();
   - levels 2 and 4 are 0x45c4ee and 0x45cfa5, which score the pairs in
     0x45d1d3 (the Mac program's NUMBERCRUNCHPUZZLE); level 3 is 0x45c66a,
     the same scoring written out again. Level 3's value pairs are 0x4a75ac
     and level 4's pairs of traits 0x4a75d4 and 0x4a75ec, the Allergic
     Cliffs' tables copied, and all three are in ZOOMBINI.EXE just before
     "Tunnels.MHK";
   - the judging is 0x45bffa, called from 0x45a36b, which then turns back
     anyone sent into a closed tunnel at level 1; each Zoombini turned back
     uses a chance at 0x45a166.
   One difference: at level 4 the program lists a pair of traits' 25
   rules with the first trait's value changing fastest (SETUPTUNNELPUZZLEL4
   in the Mac program the same), and ScummVM with the second's. The rules
   are the same 150 but in another order, so the same random number picks
   another pair of them; deal() follows the program.
   utilities/puzzles/tunnels.mjs holds the tables to ScummVM and to
   ZOOMBINI.EXE.
*/

/* The order the program lists a level's rules in and reads a rule's
   traits: its packed word's bytes, lowest first. */
const ZB_TUNNELS_ORDER = ['feet', 'nose', 'eyes', 'hair'];
/* Level 3's pairs of values for one trait, the first in the low half of
   the program's byte and the second in the high half. */
const ZB_TUNNELS_PAIRS = [[2, 1], [3, 1], [4, 1], [5, 1], [3, 2], [4, 2], [5, 2], [4, 3], [5, 3], [5, 4]];
/* Level 4's pairs of traits. */
const ZB_TUNNELS_L4 = [['feet', 'nose'], ['feet', 'eyes'], ['feet', 'hair'], ['nose', 'eyes'], ['nose', 'hair'], ['eyes', 'hair']];
/* Wrong tunnels allowed at each level. */
const ZB_TUNNELS_CHANCES = [16, 18, 20, 22];
/* The entrances left to right, ScummVM's drop zones 1-4. */
const ZB_TUNNELS_ENTRANCES = ['leftmost', 'second from the left', 'second from the right', 'rightmost'];

/* Every rule of a level's form, in the program's order, as
   [{ kind, values: [v] or [v, w] }]. Levels 1 and 2 have the same 20. */
function zbTunnelsRules(level) {
  const rules = [];
  if (level <= 2) {
    for (const kind of ZB_TUNNELS_ORDER) for (let v = 1; v <= 5; v++) rules.push([{ kind, values: [v] }]);
  } else if (level === 3) {
    for (const kind of ZB_TUNNELS_ORDER) for (const pair of ZB_TUNNELS_PAIRS) rules.push([{ kind, values: pair.slice() }]);
  } else {
    /* The first trait's value changes fastest, as in the program (ScummVM
       has the second's). */
    for (const [a, b] of ZB_TUNNELS_L4) {
      for (let w = 1; w <= 5; w++) for (let v = 1; v <= 5; v++) rules.push([{ kind: a, values: [v] }, { kind: b, values: [w] }]);
    }
  }
  return rules;
}

/* Whether a Zoombini has any of a rule's values. */
function zbTunnelsMatches(z, rule) { return rule.some(r => r.values.includes(z[r.kind])); }

function zbTunnelsRuleWords(rule) {
  return zbWordsOr(rule.flatMap(r => r.values.map(v => zbTraitWith(r.kind, v))));
}

/* The entrance, 0-3 from the left, a Zoombini goes through: guards is
   ScummVM's _guardRules, [{ rule, traitMatchOnPrimarySide }], one or two;
   toggle is _level1BlockedPairToggle, which at level 1 closes the two
   outer tunnels (false) or the two inner ones (true). ScummVM's
   evaluateRule: zones 1 and 2 are the left guardian's, zones 1 and 4 the
   upper's. */
function zbTunnelsEntrance(z, guards, toggle) {
  const a = zbTunnelsMatches(z, guards[0].rule) === guards[0].traitMatchOnPrimarySide;
  if (guards.length === 1) return a ? (toggle ? 1 : 0) : (toggle ? 2 : 3);
  const b = zbTunnelsMatches(z, guards[1].rule) === guards[1].traitMatchOnPrimarySide;
  return a ? (b ? 0 : 1) : (b ? 3 : 2);
}

/* The program's search for level 1's rule (0x45c1f6): how many of the band
   each of the 20 values sends to one side, less a count the Allergic
   Cliffs left (split, 0 for none) where another count is to be had, and
   the count the search stops at (from half the band, +1, -2, +1, ...),
   with the rules giving it; count is null when none gives one from 1 to
   15, when the program would look for ever. */
function zbTunnelsL1Candidates(band, split = 0) {
  const rules = zbTunnelsRules(1);
  let counts = rules.map(rule => band.filter(z => zbTunnelsMatches(z, rule)).length);
  if (split && counts.some(c => c && c !== split)) counts = counts.map(c => c === split ? 0 : c);
  let target = Math.trunc(band.length / 2), step = 1;
  for (let tries = 0; tries < 64; tries++) {
    if (target > 0 && target < 16 && counts.includes(target)) {
      return { rules, counts, count: target, candidates: rules.filter((r, i) => counts[i] === target) };
    }
    target += step;
    step = -(step + 1);
  }
  return { rules, counts, count: null, candidates: [] };
}

/* The program's choice of two rules for levels 2-4 (0x45d1d3): of every
   ordered pair of two different rules, those that sort the band into the
   most of the four groups, and of those the ones whose groups' sizes
   differ least, summed over the six ways of taking two groups; in the
   order first rule * count + second rule, of which the deal picks one at
   random. A pair of a rule with itself is never counted, so it fills no
   group and is never kept. Returns { candidates: [[first, second]],
   pairs: the same as indices into rules, diversity, balance }. */
function zbTunnelsPairCandidates(rules, band) {
  const n = rules.length, all = (1 << band.length) - 1;
  const masks = rules.map(rule => band.reduce((m, z, i) => zbTunnelsMatches(z, rule) ? m | 1 << i : m, 0));
  const ones = x => { let c = 0; for (; x; x &= x - 1) c++; return c; };
  const diversity = new Int8Array(n * n), balance = new Int16Array(n * n).fill(-1);
  let best = 0;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const g = [ones(masks[a] & masks[b]), ones(masks[a] & ~masks[b] & all), ones(~masks[a] & masks[b] & all), ones(~(masks[a] | masks[b]) & all)];
      const d = g.filter(c => c > 0).length;
      diversity[a * n + b] = d;
      if (d > best) best = d;
      balance[a * n + b] = Math.abs(g[0] - g[1]) + Math.abs(g[0] - g[2]) + Math.abs(g[0] - g[3])
        + Math.abs(g[1] - g[2]) + Math.abs(g[1] - g[3]) + Math.abs(g[2] - g[3]);
    }
  }
  let least = Infinity;
  for (let i = 0; i < n * n; i++) if (diversity[i] === best && balance[i] >= 0 && balance[i] < least) least = balance[i];
  const pairs = [];
  for (let i = 0; i < n * n; i++) if (diversity[i] === best && balance[i] === least) pairs.push([Math.floor(i / n), i % n]);
  return { candidates: pairs.map(([a, b]) => [rules[a], rules[b]]), pairs, diversity: best, balance: least };
}

/* A hypothesis as the player can tell it: which tunnel each of the band
   belongs in, as a bit a band member for the left guardians' side and one
   for the upper guardian's, packed left | upper << 16. */
function zbTunnelsKey(left, upper) { return (left | upper << 16) >>> 0; }
/* The tunnel, 0-3 from the left, a hypothesis sends band member i to. */
function zbTunnelsOf(key, i) { const l = key >> i & 1, u = key >>> (16 + i) & 1; return l ? (u ? 0 : 1) : (u ? 3 : 2); }

/* Every hidden part the player must allow for, as the tunnels they send
   the band to, counted: a Map from key to how many hidden parts give it.
   knows 'program': what the program could deal this band (at level 1 the
   rules its search stops at, avoiding the Allergic Cliffs' count split if
   one is given; at 2-4 the pairs its scoring keeps); 'form': every rule or
   pair of the level's form. Each with either side for each rule and, at
   level 1, either pair of tunnels closed; the coin that closes them is
   tossed at every level, but only at level 1 does it close anything, so
   at 2-4 it is not counted. */
function zbTunnelsHypotheses(level, band, knows = 'program', split = 0) {
  const n = band.length, full = (1 << n) - 1, rules = zbTunnelsRules(level);
  const mask = rule => band.reduce((m, z, i) => zbTunnelsMatches(z, rule) ? m | 1 << i : m, 0);
  const count = new Map(), add = (left, upper) => { const k = zbTunnelsKey(left, upper); count.set(k, (count.get(k) || 0) + 1); };
  if (level === 1) {
    for (const rule of knows === 'form' ? rules : zbTunnelsL1Candidates(band, split).candidates) {
      const m = mask(rule);
      for (const side of [true, false]) for (const outerClosed of [false, true]) add(side ? m : ~m & full, outerClosed ? 0 : full);
    }
  } else {
    const masks = rules.map(mask);
    let pairs;
    if (knows === 'form') { pairs = []; for (let a = 0; a < rules.length; a++) for (let b = 0; b < rules.length; b++) if (a !== b) pairs.push([a, b]); }
    else pairs = zbTunnelsPairCandidates(rules, band).pairs;
    for (const [a, b] of pairs) for (const sa of [true, false]) for (const sb of [true, false]) add(sa ? masks[a] : ~masks[a] & full, sb ? masks[b] : ~masks[b] & full);
  }
  return count;
}

/* The caves drawn: the guardians' rules over the tunnels (the left and
   right pair over two tunnels each, the upper over the outer two and the
   lower over the inner two), each tunnel with those gone through it, and
   below the entrances the band still to go. where[i] is the tunnel band
   member i went through, or -1; sent is { i, t } for one on its way;
   guards null when the rules are not known. */
function zbTunnelsDiagram(band, { level, guards = null, toggle = null, where, sent = null, chances = null, caption = null, lost = false }) {
  const W = 800, H = 556, items = [], colW = 182, colX = k => 14 + k * 195, cx = k => colX(k) + colW / 2;
  const cell = (x, w, y, who, rule, withIt, words) => {
    items.push({ t: 'rect', x, y, w, h: 54, r: 6, fill: 'panel', stroke: 'line' });
    if (!rule) {
      items.push({ t: 'text', x: x + w / 2, y: y + 20, text: `${who} guardian`, anchor: 'middle', size: 12, fill: 'dim' });
      items.push({ t: 'text', x: x + w / 2, y: y + 40, text: words || '?', anchor: 'middle', size: 13, fill: words === 'closed' ? 'bad' : words === '?' || !words ? 'dim' : 'ink' });
      return;
    }
    items.push({ t: 'text', x: x + w / 2, y: y + 16, text: `${who} guardian: ${withIt ? 'with' : 'without'}`, anchor: 'middle', size: 12, fill: 'dim' });
    /* Hair drawn at its own size, the smaller parts at twice theirs. */
    items.push(...zbDiagramTraits(rule.flatMap(r => r.values.map(value => ({ kind: r.kind, value }))), x + w / 2, y + 37, 40, withIt ? {} : { faded: true })
      .map(it => it.kind === 'hair' ? Object.assign(it, { scale: 1 }) : it));
  };
  const known = !!guards, g0 = known && guards[0], g1 = known && guards[1];
  cell(colX(0), colX(1) + colW - colX(0), 34, 'left', g0 && g0.rule, g0 && g0.traitMatchOnPrimarySide, known ? null : '?');
  cell(colX(2), colX(3) + colW - colX(2), 34, 'right', g0 && g0.rule, g0 && !g0.traitMatchOnPrimarySide, known ? null : '?');
  /* At level 1 the upper and lower guardians keep no rule: one pair of
     tunnels is closed instead. */
  const closedWords = up => toggle == null ? '?' : (toggle === up ? 'closed' : 'open');
  for (const [k0, k1, up] of [[0, 0, true], [1, 2, false], [3, 3, true]]) {
    const x = colX(k0), w = colX(k1) + colW - x, who = up ? 'upper' : 'lower';
    if (level === 1) cell(x, w, 94, who, null, null, known ? closedWords(up) : '?');
    else cell(x, w, 94, who, g1 && g1.rule, g1 && (g1.traitMatchOnPrimarySide === up), known ? null : '?');
  }
  const closed = k => level === 1 && toggle != null && known && (toggle ? (k === 0 || k === 3) : (k === 1 || k === 2));
  for (let k = 0; k < 4; k++) {
    const inIt = band.map((_, i) => i).filter(i => where[i] === k);
    const hot = sent && sent.t === k;
    items.push({ t: 'rect', x: colX(k), y: 156, w: colW, h: 252, r: 10, fill: 'stone', stroke: hot ? 'accent' : closed(k) ? 'bad' : 'line', width: hot ? 3 : 1.5, dash: closed(k) || undefined });
    items.push({ t: 'text', x: cx(k), y: 172, text: `${ZB_TUNNELS_ENTRANCES[k]} tunnel`, anchor: 'middle', size: 12, fill: 'ink' });
    items.push({ t: 'text', x: cx(k), y: 186, text: `to the ${k === 0 || k === 3 ? 'upper' : 'lower'} caves${inIt.length ? `: ${inIt.length} through` : ''}`, anchor: 'middle', size: 11, fill: 'dim' });
    if (closed(k)) items.push({ t: 'text', x: cx(k), y: 300, text: 'closed', anchor: 'middle', size: 16, fill: 'bad' });
    items.push(...zbDiagramRows(inIt, colX(k) + 22, 238, 5, 35, 50));
    items.push({ t: 'rect', x: cx(k) - 32, y: 400, w: 64, h: 24, r: 12, fill: 'panel', stroke: hot ? 'accent' : 'line', width: hot ? 3 : 1.5 });
  }
  const near = band.map((_, i) => i).filter(i => where[i] < 0 && !(sent && sent.i === i));
  items.push(...zbDiagramRows(near, (W - near.length * 34) / 2 + 17, 534, 16, 34, 52, lost ? { faded: true } : {}));
  if (sent) items.push({ t: 'zoombini', i: sent.i, x: cx(sent.t), y: 476 });
  const through = where.filter(t => t >= 0).length;
  items.push({ t: 'text', x: 14, y: 22, text: caption || `${through} through, ${band.length - through} to go`, size: 15, fill: 'ink' });
  if (chances != null) items.push({ t: 'text', x: W - 14, y: 22, text: `${chances} may still be turned back`, anchor: 'end', size: 13, fill: chances <= 4 ? 'warn' : 'dim' });
  return { width: W, height: H, items };
}

/* The caves with the rules unknown. The hypotheses are kept as the
   tunnels they send the band to (zbTunnelsHypotheses), counted. A
   Zoombini whose tunnel every hypothesis left agrees on goes in free;
   otherwise one is sent into a tunnel, and it goes through, or the
   guardian of that tunnel's side turns it back (it belongs on the other
   side), or the tunnel's upper or lower guardian does (it belongs in the
   other tunnel on this side): the game shows which guardian it was, so
   there are three outcomes. A turning back costs a chance, and the one
   that uses the last lets no one else in.
   The play is first worked out by a rule of thumb: send the Zoombini, into
   the tunnel, whose worse turning back leaves the fewest hypotheses (the
   most lopsided move, as at the Allergic Cliffs), which is quick and, with
   the chances these caves give, nearly always gets everyone through; then,
   if it does not, by minimax, the best move the one whose worst outcome
   still gets the most through, memoised on the hypotheses left, those
   still to go and the chances, starting from the rule of thumb's value and
   giving up at the budget. A plan is { v, i, t, kids }: v the most sure to
   go through from here, the move, and the plans after each outcome (gone
   through, turned back by the side guardian, by the upper or lower one),
   or no kids when they are to be looked up. */
function zbTunnelsStrategy(level, band, opts = {}) {
  const knows = opts.knows === 'form' ? 'form' : 'program';
  /* The Allergic Cliffs' count, which the player saw at the cliffs: given,
     in the journey, or in the dealt state; never the caves' own rules. */
  const split = level === 1 ? Number([opts.bridgeSplit, opts.journey && opts.journey.bridgeSplit, opts.state && opts.state.bridgeSplit].find(x => x != null)) || 0 : 0;
  const count = zbTunnelsHypotheses(level, band, knows, split);
  /* opts.chances in place of the level's, to see how few would do. */
  const n = band.length, full = (1 << n) - 1, C = opts.chances || ZB_TUNNELS_CHANCES[level - 1];
  const bits = x => { let c = 0; for (; x; x &= x - 1) c++; return c; };
  const agreed = H => {
    let aL = full, oL = 0, aU = full, oU = 0;
    for (const k of H) { aL &= k; oL |= k; aU &= k >>> 16; oU |= k >>> 16; }
    return (aL | ~oL) & (aU | ~oU) & full;
  };
  const hashOf = H => {
    let a = 2166136261, b = 5381;
    for (const k of H) { a = Math.imul(a ^ k, 16777619); b = (Math.imul(b, 33) ^ k) | 0; }
    return `${a >>> 0}.${b >>> 0}.${H.length}`;
  };
  /* How many hypotheses send band member i to each tunnel. */
  const tally = (H, i) => {
    let L = 0, U = 0, LU = 0;
    const s = 16 + i;
    for (const k of H) { const l = k >> i & 1, u = k >>> s & 1; L += l; U += u; LU += l & u; }
    return [LU, L - LU, H.length - L - U + LU, U - LU];
  };
  /* The outcomes of sending i into t: gone through, turned back by the
     side guardian, by the upper or lower one. */
  const split3 = (H, i, t) => {
    const out = [[], [], []], tl = t < 2 ? 1 : 0, tu = t === 0 || t === 3 ? 1 : 0, s = 16 + i;
    for (const k of H) { const l = k >> i & 1; out[l !== tl ? 1 : (k >>> s & 1) !== tu ? 2 : 0].push(k); }
    return out;
  };
  /* Every move worth trying, one Zoombini of each different column, the
     rule of thumb's choice first. */
  const moves = (H, u, onlyFirst) => {
    const out = [], seen = new Set();
    for (let i = 0; i < n; i++) if (u >> i & 1) {
      const cnt = tally(H, i);
      if (!onlyFirst) {
        let h1 = 0, h2 = 7;
        const s = 16 + i;
        for (const k of H) { const T = (k >> i & 1) * 2 + (k >>> s & 1); h1 = (Math.imul(h1, 31) + T) | 0; h2 = Math.imul(h2 ^ T, 16777619); }
        if (seen.has(h1 + '.' + h2)) continue;
        seen.add(h1 + '.' + h2);
      }
      for (let t = 0; t < 4; t++) if (cnt[t]) out.push({ i, t, worse: Math.max(t < 2 ? cnt[2] + cnt[3] : cnt[0] + cnt[1], cnt[t ^ 1]), acc: cnt[t] });
    }
    return out.sort((a, b) => a.worse - b.worse || b.acc - a.acc || a.i - b.i || a.t - b.t);
  };
  const END = { v: 0, end: true };
  /* The rule of thumb's plan, all of it. */
  const guess = (H, u, c) => {
    if (!u || !c) return END;
    const m = moves(H, u, true)[0], [acc, ra, rb] = split3(H, m.i, m.t), kids = [null, null, null];
    let v = Infinity;
    [ra, rb].forEach((R, j) => {
      if (!R.length) return;
      let w = 0;
      if (c > 1) { const g = agreed(R); kids[j + 1] = guess(R, u & ~g, c - 1); w = bits(u & g) + kids[j + 1].v; } else kids[j + 1] = END;
      v = Math.min(v, w);
    });
    if (acc.length) {
      const g = agreed(acc), u2 = u & ~(1 << m.i);
      kids[0] = guess(acc, u2 & ~g, c);
      v = Math.min(v, 1 + bits(u2 & g) + kids[0].v);
    }
    return { v, i: m.i, t: m.t, kids };
  };
  const deadline = Date.now() + (opts.budget || 1500);
  let exact = true;
  const memo = new Map();
  const search = (H, u, c) => {
    if (!u || !c) return END;
    const key = hashOf(H) + '|' + u + '|' + c;
    if (memo.has(key)) return memo.get(key);
    let b = guess(H, u, c);
    const all = bits(u);
    if (b.v < all) {
      for (const m of moves(H, u, false)) {
        if (Date.now() > deadline) { exact = false; break; }
        const v = worstOf(H, u, c, m, b.v);
        if (v > b.v) b = { v, i: m.i, t: m.t };
        if (b.v === all) break;
      }
    }
    memo.set(key, b);
    return b;
  };
  /* A move's worst outcome under the search, the turnings back first, and
     not looked at further once no better than bound. */
  const worstOf = (H, u, c, m, bound) => {
    const [acc, ra, rb] = split3(H, m.i, m.t);
    let worst = Infinity;
    for (const R of [ra, rb]) if (R.length) {
      let v = 0;
      if (c > 1) { const g = agreed(R); v = bits(u & g) + search(R, u & ~g, c - 1).v; }
      if (v < worst) worst = v;
      if (worst <= bound) return worst;
    }
    if (acc.length) {
      const g = agreed(acc), u2 = u & ~(1 << m.i);
      worst = Math.min(worst, 1 + bits(u2 & g) + search(acc, u2 & ~g, c).v);
    }
    return worst;
  };
  const planFor = (H, u, c) => (!u || !c) ? END : memo.get(hashOf(H) + '|' + u + '|' + c) || guess(H, u, c);
  const weight = H => H.reduce((t, k) => t + count.get(k), 0);
  const sideWord = t => t < 2 ? 'left' : 'right', vertWord = t => t === 0 || t === 3 ? 'upper' : 'lower';
  const node = (H, u, c, where, plan) => {
    const left = weight(H), crossed = where.filter(t => t >= 0).length;
    if (!u || !c) {
      const lost = band.length - crossed;
      return { move: !u ? `Every Zoombini's tunnel is known now: all ${crossed} are through.` : `No chances are left and the tunnels close: ${lost} left behind.`,
        zoombini: null, left, crossed, where, outcomes: [],
        diagram: zbTunnelsDiagram(band, { level, where, chances: c, lost: !!lost, caption: !u ? `All ${crossed} through` : `${crossed} through, ${lost} left behind` }) };
    }
    const m = plan || planFor(H, u, c), [acc, ra, rb] = split3(H, m.i, m.t);
    const kid = (j, R, u2, c2) => (m.kids && m.kids[j]) || planFor(R, u2, c2);
    const freeOf = (R, u2) => { const g = agreed(R); return [...Array(n).keys()].filter(k => u2 >> k & 1 && g >> k & 1); };
    const go = (R, u2, c2, add, j) => { const w = where.slice(); for (const k of add) w[k] = zbTunnelsOf(R[0], k); return node(R, u2, c2, w, kid(j, R, u2, c2)); };
    const outcomes = [];
    if (acc.length) {
      const u2 = u & ~(1 << m.i);
      outcomes.push({ label: `It goes through (${weight(acc)} left)`, left: weight(acc), next: () => go(acc, u2 & ~agreed(acc), c, [m.i, ...freeOf(acc, u2)], 0) });
    }
    [[ra, sideWord(m.t), ''], [rb, vertWord(m.t), level === 1 ? ': the tunnel is closed' : '']].forEach(([R, who, why], j) => {
      if (!R.length) return;
      outcomes.push({ label: `The ${who} guardian turns it back${why}${c > 1 ? '' : ', and that was the last chance'} (${weight(R)} left)`, left: weight(R),
        next: () => c > 1 ? go(R, u & ~agreed(R), c - 1, freeOf(R, u), j + 1) : go(R, u, 0, [], j + 1) });
    });
    return {
      move: `Send Zoombini ${m.i + 1} into the ${ZB_TUNNELS_ENTRANCES[m.t]} tunnel.`,
      zoombini: m.i, tunnel: m.t, left, crossed, where,
      diagram: zbTunnelsDiagram(band, { level, where, sent: { i: m.i, t: m.t }, chances: c, caption: `${left} hypotheses left; ${crossed} through` }),
      outcomes,
    };
  };
  const H0 = [...count.keys()].sort((x, y) => x - y);
  const g0 = H0.length ? agreed(H0) : full, u0 = full & ~g0;
  const where0 = band.map((_, k) => g0 >> k & 1 && H0.length ? zbTunnelsOf(H0[0], k) : -1);
  const plan0 = H0.length ? search(H0, u0, C) : END;
  const sure = bits(g0) + plan0.v, hyp = weight(H0);
  /* The most turned back on any branch, when the plan is the rule of
     thumb's all through (a searched plan's branches are not all kept). */
  const most = p => !p || p.end ? 0 : !p.kids ? null : Math.max(...p.kids.map((k, j) => { if (!k) return 0; const r = most(k); return r == null ? null : r + (j ? 1 : 0); }).map(r => r == null ? Infinity : r));
  const worstBack = most(plan0);
  return {
    hypotheses: hyp, sure, exact, knows,
    root: node(H0, u0, C, where0, plan0),
    notes: [
      knows === 'form'
        ? `The player knows only the rules' form at this level: ${hyp} hypotheses (rules, sides${level === 1 ? ' and closed pair' : ''}), ${H0.length} different to this band.`
        : `The program could deal this band ${hyp} hidden parts at this level (rules, sides${level === 1 ? ' and closed pair' : ''}), ${H0.length} different to this band. The player knows that${level === 1 ? (split ? `, and that the Allergic Cliffs left a count of ${split}` : ', and is taken not to know of a count left by the Allergic Cliffs') : ''}.`,
      ...(level === 1 ? ['Which pair of tunnels is closed does not show until a Zoombini is turned back from one, so it is among the hypotheses.'] : []),
      'A Zoombini turned back is turned back by one guardian, and the game shows which: the one on its tunnel\'s side, so it belongs on the other side, or the upper or lower one, so it belongs in the other tunnel on this side.',
      'Any Zoombini whose tunnel every hypothesis left agrees on goes first, which costs nothing; otherwise the most lopsided move, and where that is not sure of everyone, the move whose worst outcome still gets the most through.',
      exact ? 'The search is complete: no way of playing is sure of more.' : 'The search stopped at its budget and played the rest by its rule of thumb, so this many are sure, and perhaps more could be.',
      ...(Number.isFinite(worstBack) && sure === band.length ? [`Played so, no more than ${worstBack} ${worstBack === 1 ? 'is' : 'are'} ever turned back, of the ${C} the caves allow.`] : []),
    ],
  };
}

ZB_PUZZLES.set('TUNNELS', {
  about: 'Each Zoombini is sent into one of four tunnels, two either side of the band. Every tunnel passes two Cave Guardians, who let through only Zoombinis with, or without, certain traits.',
  levels: [
    { rule: 'Only the left and right guardians have a rule: one trait value, such as a propeller, one of 20 chosen as at the Allergic Cliffs to send as near half the band one way as it can, though not the number the cliffs’ own rule sent if no other rule there sent it. The left guardian takes the Zoombinis with it or those without, the right the others, and two of the tunnels, the outer pair or the inner pair, are closed to everyone.',
      chances: 'Sixteen Zoombinis may be turned back; with four left, rocks begin to fall, and when none are left no one else may go in.' },
    { rule: 'The left and right guardians have one trait value and the upper and lower another, so each tunnel takes one of four kinds of Zoombini. The pair is one of 380, chosen to sort the band into as many of the four kinds, and as evenly, as it can.',
      chances: 'Eighteen Zoombinis may be turned back, with the rocks falling at four left.',
      notes: ['The help for this level says to look for two features for each pair of guardians; the program deals one.'] },
    { rule: 'Each pair of guardians has one trait with either of two values, such as a red or a blue nose. The pair of rules is one of 1,560, chosen the same way.',
      chances: 'Twenty Zoombinis may be turned back, with the rocks falling at four left.' },
    { rule: 'Each pair of guardians has either of two traits’ values, such as sleepy eyes or a cap. The pair of rules is one of 22,350, chosen the same way.',
      chances: 'Twenty-two Zoombinis may be turned back, with the rocks falling at four left.',
      notes: ['The help for this level says to look for three features for each pair of guardians; the program deals two.',
        'ScummVM lists this level’s rules in another order than the program does, so from the same random numbers it picks another pair of them.'] },
  ],
  deal(level, band, rnd, journey = {}) {
    /* Drawn at every level; it closes two tunnels at level 1 only. */
    const toggle = rnd.bool();
    /* Not the rule: an idle phase, random(0, 64), for each Zoombini as the
       band is loaded, which comes between the coin and the rule. */
    for (let i = 0; i < band.length; i++) rnd.range(0, 64);
    const chances = ZB_TUNNELS_CHANCES[level - 1];
    const setup = [`Four tunnel entrances, two on the band’s left and two on its right. ${band.length} Zoombinis to send through, and ${chances} may be turned back.`];
    let guards, extra;
    if (level === 1) {
      const split = journey.bridgeSplit || 0;
      const { count, candidates } = zbTunnelsL1Candidates(band, split), found = candidates.length;
      if (count == null) return { setup: ['No trait value splits this band; the program would keep looking.'], answer: [], marks: band.map(() => null), state: { stuck: true } };
      const rule = candidates[rnd.range(1, found) - 1];
      guards = [{ rule, traitMatchOnPrimarySide: rnd.bool() }];
      extra = { matchCount: count, candidates: found, bridgeSplit: split || null };
    } else {
      const { candidates, diversity, balance } = zbTunnelsPairCandidates(zbTunnelsRules(level), band);
      guards = candidates[rnd.range(1, candidates.length) - 1].map(rule => ({ rule, traitMatchOnPrimarySide: rnd.bool() }));
      extra = { candidates: candidates.length, diversity, balance };
    }
    const entrance = band.map(z => zbTunnelsEntrance(z, guards, toggle));
    const tally = k => entrance.filter(e => e === k).length;
    const side = (g, yes, no) => g.traitMatchOnPrimarySide ? [yes, no] : [no, yes];
    const answer = [];
    const [withA, withoutA] = side(guards[0], 'left', 'right');
    answer.push(`The ${withA} guardian lets through Zoombinis with ${zbTunnelsRuleWords(guards[0].rule)}, the ${withoutA} guardian those without.`);
    if (level === 1) {
      const open = toggle ? [1, 2] : [0, 3];
      answer.push(`Only the ${ZB_TUNNELS_ENTRANCES[open[0]]} and the ${ZB_TUNNELS_ENTRANCES[open[1]]} tunnels let anyone through; of this band ${tally(open[0])} go left and ${tally(open[1])} right.`);
      answer.push(`The ${toggle ? 'two outer' : 'two inner'} tunnels turn every Zoombini back.`);
    } else {
      const [withB, withoutB] = side(guards[1], 'upper', 'lower');
      answer.push(`The ${withB} guardian lets through Zoombinis with ${zbTunnelsRuleWords(guards[1].rule)}, the ${withoutB} guardian those without.`);
      const pass = ['left and upper', 'left and lower', 'right and lower', 'right and upper'];
      answer.push(`Of this band, the leftmost tunnel (${pass[0]} guardians) takes ${tally(0)}, `
        + zbWordsOr([1, 2, 3].map(k => `the ${ZB_TUNNELS_ENTRANCES[k]} (${pass[k]}) ${tally(k)}`), 'and') + '.');
    }
    return {
      setup,
      answer,
      marks: entrance.map(k => `${ZB_TUNNELS_ENTRANCES[k]} tunnel`),
      state: {
        level1BlockedPairToggle: toggle, guardAxisCount: guards.length, guardRules: guards,
        remainingRejectChances: chances, entrance, ...extra,
      },
    };
  },
  form(level, band, state) {
    const g = state.guardRules, t = r => `${r.kind}:${r.values[0]}`;
    const takes = (key, label, g) => ({ key, label, kind: 'choice', value: g.traitMatchOnPrimarySide ? 'with' : 'without',
      options: [{ value: 'with', label: 'Zoombinis with it' }, { value: 'without', label: 'Zoombinis without it' }] });
    const rule = (p, r, label) => {
      if (level <= 2) return [{ key: p, label, kind: 'choice', value: t(r[0]), options: zbTraitOptions() }];
      if (level === 3) {
        return [{ key: p + 'Kind', label, kind: 'choice', value: r[0].kind, options: ZB_TRAIT_KINDS.map(k => ({ value: k, label: k })) },
          { key: p + 'Values', label: 'either of', kind: 'several', min: 2, max: 2, value: r[0].values.slice().sort((a, b) => a - b),
            options: [1, 2, 3, 4, 5].map(v => ({ value: v, label: ZB_TRAIT_SHORT[r[0].kind][v - 1] })) }];
      }
      return [{ key: p + '1', label, kind: 'choice', value: t(r[0]), options: zbTraitOptions() },
        { key: p + '2', label: 'or', kind: 'choice', value: t(r[1]), options: zbTraitOptions() }];
    };
    const fields = [...rule('a', g[0].rule, 'The left and right guardians’ rule'), takes('left', 'The left guardian lets through', g[0])];
    if (level === 1) {
      fields.push({ key: 'closed', label: 'Closed to everyone', kind: 'choice', value: state.level1BlockedPairToggle ? 'outer' : 'inner',
        options: [{ value: 'outer', label: 'the two outer tunnels' }, { value: 'inner', label: 'the two inner tunnels' }] });
    } else {
      fields.push(...rule('b', g[1].rule, 'The upper and lower guardians’ rule'), takes('upper', 'The upper guardian lets through', g[1]));
    }
    fields.push({ key: 'note', kind: 'note', note: `Any rule of this level’s form${level > 1 ? ', the two different' : ''}${level === 4 ? ', each of two different traits' : ''}; the program itself deals only those that sort this band most evenly.${level > 1 ? ' No tunnel is closed at this level.' : ''}` });
    return fields;
  },
  edit(level, band, state, values) {
    const one = s => {
      const p = zbTraitOption(s);
      if (!ZB_TRAIT_KINDS.includes(p.kind) || !(p.value >= 1 && p.value <= 5)) throw new Error('Pick a trait value for each rule.');
      return p;
    };
    const rule = p => {
      if (level <= 2) { const o = one(values[p]); return [{ kind: o.kind, values: [o.value] }]; }
      if (level === 3) {
        const kind = values[p + 'Kind'];
        if (!ZB_TRAIT_KINDS.includes(kind)) throw new Error('Pick a trait for each pair of guardians.');
        const vs = [...new Set((values[p + 'Values'] || []).map(Number))].filter(v => v >= 1 && v <= 5).sort((a, b) => b - a);
        if (vs.length !== 2) throw new Error('Each rule at this level is two values of one trait.');
        return [{ kind, values: vs }];
      }
      const os = [one(values[p + '1']), one(values[p + '2'])];
      if (os[0].kind === os[1].kind) throw new Error('Each rule at this level is two values of two different traits.');
      os.sort((x, y) => ZB_TUNNELS_ORDER.indexOf(x.kind) - ZB_TUNNELS_ORDER.indexOf(y.kind));
      return os.map(o => ({ kind: o.kind, values: [o.value] }));
    };
    const side = key => {
      if (values[key] !== 'with' && values[key] !== 'without') throw new Error('Say which Zoombinis each guardian lets through.');
      return values[key] === 'with';
    };
    const guards = [{ rule: rule('a'), traitMatchOnPrimarySide: side('left') }];
    let toggle = state.level1BlockedPairToggle;
    if (level === 1) {
      if (values.closed !== 'outer' && values.closed !== 'inner') throw new Error('Say which pair of tunnels is closed.');
      toggle = values.closed === 'outer';
    } else {
      guards.push({ rule: rule('b'), traitMatchOnPrimarySide: side('upper') });
      if (JSON.stringify(guards[0].rule) === JSON.stringify(guards[1].rule)) throw new Error('The two pairs of guardians must keep different rules.');
    }
    return { level1BlockedPairToggle: toggle, guardAxisCount: guards.length, guardRules: guards, remainingRejectChances: ZB_TUNNELS_CHANCES[level - 1],
      entrance: band.map(z => zbTunnelsEntrance(z, guards, toggle)), bridgeSplit: state.bridgeSplit != null ? state.bridgeSplit : null, edited: true };
  },
  solve(level, band, state) {
    const where = band.map(z => zbTunnelsEntrance(z, state.guardRules, state.level1BlockedPairToggle));
    const pass = ['left and upper', 'left and lower', 'right and lower', 'right and upper'];
    const steps = [];
    for (let k = 0; k < 4; k++) {
      const into = where.map((t, i) => t === k ? i : -1).filter(i => i >= 0);
      if (into.length) steps.push(`Into the ${ZB_TUNNELS_ENTRANCES[k]} tunnel (the ${pass[k]} guardians), ${into.length}: ${zbPlacesWords(into)}.`);
    }
    if (level === 1) steps.push(`The ${state.level1BlockedPairToggle ? 'two outer' : 'two inner'} tunnels are closed and take no one.`);
    steps.push('In any order, and no one is turned back.');
    return {
      most: band.length, exact: true, ways: 1,
      solutions: [{
        title: `All ${band.length} through`, steps, crosses: band.map((_, i) => i),
        diagram: zbTunnelsDiagram(band, { level, guards: state.guardRules, toggle: state.level1BlockedPairToggle, where, chances: ZB_TUNNELS_CHANCES[level - 1] }),
      }],
      notes: ['Through means into a tunnel and past both its guardians to the caves beyond.',
        'Known, the rules give every Zoombini exactly one tunnel that lets it through, so all of them go through, in any order: one way, the order aside, and it is the simplest.'],
    };
  },
  strategy(level, band, arc, opts = {}) { return zbTunnelsStrategy(level, band, opts); },
  source: 'ScummVM’s puzzle_tunnels.cpp, checked against the program’s code.',
});
