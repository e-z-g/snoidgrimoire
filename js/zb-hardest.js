/* zb-hardest.js -- Very, Very, VERY Hard: of the puzzles the program could
   deal a band at level 4, the hardest, found by dealing it many times.
   =========================================================================
   Needs zb-puzzle.js and the puzzles. Nothing here is the game's: it has
   four levels. A fifth is the fourth's rules, dealt by the program's own
   deal (each puzzle's deal) from whichever seed makes it hardest, so a
   program whose random numbers were set to that seed as the puzzle deals
   would deal the same.

   The seed here is the generator's state as the puzzle itself starts to
   deal (zbDealOne), not a band's and a route's as the page's other deals
   are (zbDealAt): that is the number a reseeded program needs. What a
   session carries from one puzzle to the next (zb-puzzle.js's journey) is
   as at the start of a session.

   Hardest, in order:
     1. the whole band can cross, played with the answer known (solve's
        most), if any deal lets it; else the most that can;
     2. fewest across for a player who plays for the worst, knowing how the
        program deals (the strategy, played against this deal as the game
        would answer it: zbStrategyPlay); for a puzzle that hides nothing,
        the most across, so the same for every deal that passed 1;
     3. the most chances that player spends against it (the end node's
        spent: pegs, mistakes, meals, mudballs, Zoombinis sent for
        nothing), which is what tells deals apart when the whole band is
        sure to cross, as it mostly is at level 4;
     4. fewest sure to cross before the first move (the strategy's sure);
     5. fewest ways across, where the puzzle counts them;
     6. the longest simplest solution, in steps.
   A deal is a candidate once: deals alike in every dealt value are one.

     zbHardestSearch(key, band, open, { from, budget, each })
       a search, run a slice at a time: .run(ms) works for about ms and
       returns .progress(), { tried, distinct, best, done }; best is
       { seed, deal, score }. from seeds the run of seeds tried; budget is
       the whole search's milliseconds; each a deal's own (a solve's and a
       strategy's). */

const ZB_HARDEST_NAME = 'Very, Very, VERY Hard';
const ZB_HARDEST_LEVEL = 4;

/* One puzzle dealt alone, from the generator's state as it starts. */
function zbDealOne(key, level, seed, band, open = () => null, journey = {}) {
  const P = ZB_PUZZLES.get(key);
  return Object.assign({ band }, P.deal(level, band, zbRandom(seed), journey, P.archive ? open(P.archive) : undefined));
}

/* A deal judged: { all, most, crossed, spent, sure, ways, steps, exact }, or null
   for one the program would not go on with. */
function zbHardestScore(key, band, deal, open = () => null, each = 400) {
  const P = ZB_PUZZLES.get(key), level = ZB_HARDEST_LEVEL, state = deal.state;
  if (!state || state.stuck) return null;
  const arc = P.archive ? open(P.archive) : undefined;
  const solved = P.solve(level, band, state, arc, { budget: each });
  const sol = solved.solutions && solved.solutions[0];
  const score = { all: solved.most === band.length, most: solved.most, crossed: solved.most, spent: 0, sure: solved.most,
    ways: solved.ways == null ? Infinity : solved.ways, steps: sol ? sol.steps.length : 0, exact: !!solved.exact };
  if (P.strategy && P.answer) {
    const st = P.strategy(level, band, arc, { budget: each, knows: 'program', state });
    const end = zbStrategyPlay(P, level, band, state, st, arc);
    score.sure = st.sure;
    score.crossed = end ? end.crossed : st.sure;
    score.spent = end && end.spent || 0;
    score.exact = score.exact && !!st.exact;
  }
  return score;
}

/* Below zero when a is the harder. */
function zbHardestCompare(a, b) {
  return (b.all - a.all) || (b.all ? 0 : b.most - a.most) || (a.crossed - b.crossed) || (b.spent - a.spent) || (a.sure - b.sure)
    || (a.ways === b.ways ? 0 : a.ways < b.ways ? -1 : 1) || (b.steps - a.steps);
}

function zbHardestSearch(key, band, open = () => null, opts = {}) {
  const seeds = zbRandom(opts.from || 1), budget = opts.budget || 8000, each = opts.each || 400;
  const seen = new Set();
  let tried = 0, best = null, spent = 0, done = false, error = null;
  /* A seed is any 32-bit state but 0; three draws make one. */
  const nextSeed = () => ((seeds.number(0xffff) << 16 | seeds.number(0xffff)) ^ seeds.number(0xffff)) >>> 0 || 1;
  const progress = () => ({ tried, distinct: seen.size, best, done, error });
  return {
    progress,
    run(ms) {
      const until = Date.now() + ms, t0 = Date.now();
      while (!done && Date.now() < until) {
        const seed = nextSeed();
        tried++;
        let deal;
        try { deal = zbDealOne(key, ZB_HARDEST_LEVEL, seed, band, open); }
        catch (e) { error = e.message; done = true; break; }
        const id = JSON.stringify(deal.state);
        if (!seen.has(id)) {
          seen.add(id);
          let score = null;
          try { score = zbHardestScore(key, band, deal, open, each); } catch (e) { error = e.message; }
          if (score && (!best || zbHardestCompare(score, best.score) < 0)) best = { seed, deal, score };
        }
        /* A puzzle the seed makes no difference to is done at once; one
           whose deals have all been seen, after enough tries to say so. */
        if (tried >= 64 && seen.size === 1) done = true;
        if (tried >= 4000 || tried >= 40 * seen.size + 400) done = true;
      }
      spent += Date.now() - t0;
      if (spent >= budget) done = true;
      return progress();
    },
  };
}
