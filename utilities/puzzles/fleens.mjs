// Fleens! (js/zb-puzzle-fleens.js) against ScummVM's puzzle_fleens.cpp and
// .h, the 1996 program and the disc:
//
//   - the dealing, as ScummVM's buildZmbTraitSetup writes it: the three
//     places drawn from 1 to the band's size, each different, and the
//     count already lured for one or two Zoombinis; the levels that draw
//     the values' turns (1-5) and the traits' mixing (2-4 for hair, then
//     the non-repeating draw), and the levels that clear the mixing; the
//     Fleen value (turn + v - 2) mod 5 + 1;
//   - the table 1, 2, 3, 4 that the program draws the mixing through is in
//     ZOOMBINI.EXE before "Fleens.MHK"; the beehive's places are FLEENS
//     REGS 5000's three, and the other branches' (REGS 5001) are enough
//     for the rest of a band of 16;
//   - the chances are debugGetChances' six, and the seventh pair waiting
//     sends back the first, whether it lured a beehive Fleen or not;
//   - the Fleen trait names are the Zoombini maker's, in the order of
//     ScummVM's FleenTrait where the two share a word;
//   - over bands of 16, 11, 5, 2 and 1 at each level: the places, the
//     mixing and the turns are of the level's form; every Fleen is its
//     Zoombini's under them, and no two different Zoombinis share a
//     Fleen; the marks name the beehive three; and over journeys of
//     random levels, what is kept from visit to visit is what the program
//     keeps, and each visit draws as many numbers as the program would;
//   - the workbench: the form gives back what it shows and turns away
//     what the program could not deal; the solution sends the beehive's
//     Zoombinis; and the strategy, played against every mapping and choice
//     of the beehive's that shows the Fleens seen (enumerated here, apart
//     from the port), follows each Zoombini sent with its own Fleen and
//     never gets fewer across than it says are sure; small bands' every
//     branch walked, and with nothing seen, min(band, 6) sure.
import fs from 'node:fs';
import path from 'node:path';
import { REF, archiveBytes } from '../load.mjs';

export default function check({ S, fail, say, scumm, exe, need, bands, find }) {
  const h = scumm('zoombini_pages/puzzle_fleens.h'), cpp = scumm('zoombini_pages/puzzle_fleens.cpp');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const P = S.ZB_PUZZLES.get('FLEENS'), KINDS = S.ZB_TRAIT_KINDS;

  // ---- the dealing, as ScummVM writes it -------------------------------
  const setup = need(/void ZoombiniPuzzleFleens::buildZmbTraitSetup\(\) \{([\s\S]*?)\n\}/, cpp, 'buildZmbTraitSetup')[1];
  need(/_targetSnoidOrdinals\[0\] = _vm->_rnd->getRandomNumber\(1, zmbCount\);\s*if \(zmbCount == 1\) \{\s*_matchedTargetCount = 2;[\s\S]*?\} else if \(zmbCount == 2\) \{\s*_matchedTargetCount = 1;/, setup, 'the first place and the count already lured');
  need(/if \(2 <= zmbCount\) \{\s*do \{\s*_targetSnoidOrdinals\[1\] = _vm->_rnd->getRandomNumber\(1, zmbCount\);\s*\} while \(_targetSnoidOrdinals\[1\] == _targetSnoidOrdinals\[0\]\);/, setup, 'the second place');
  need(/if \(3 <= zmbCount\) \{\s*do \{\s*_targetSnoidOrdinals\[2\] = _vm->_rnd->getRandomNumber\(1, zmbCount\);\s*\} while \(_targetSnoidOrdinals\[2\] == _targetSnoidOrdinals\[0\] \|\| _targetSnoidOrdinals\[2\] == _targetSnoidOrdinals\[1\]\);/, setup, 'the third place');
  const rot = need(/if \(traitValueRotations\[0\] == 0((?: \|\| _difficultyLevel == kPuzzleLevel\d)+)\) \{\s*for \(int i = 0; i < 4; i\+\+\)\s*traitValueRotations\[i\] = static_cast<byte>\(_vm->_rnd->getRandomNumber\((\d), (\d)\)\);/, setup, 'the turns');
  const rotLevels = [...rot[1].matchAll(/kPuzzleLevel(\d)/g)].map(m => Number(m[1]));
  if (rot[2] !== '1' || rot[3] !== '5') fail(`ScummVM draws the turns from ${rot[2]} to ${rot[3]}`);
  const mix = need(/if \(_difficultyLevel <= kPuzzleLevel(\d)\) \{\s*for \(int i = 0; i < 4; i\+\+\)\s*traitDestSlots\[i\] = 0;\s*\} else if \(traitDestSlots\[0\] == 0((?: \|\| _difficultyLevel == kPuzzleLevel\d)+)\) \{[\s\S]*?traitDestSlots\[0\] = static_cast<byte>\(_vm->_rnd->getRandomNumber\((\d), (\d)\)\);\s*[\s\S]*?uint32 poolState = 1u << \(traitDestSlots\[0\] - 1\);\s*for \(int i = 1; i < 4; i\+\+\)\s*traitDestSlots\[i\] = static_cast<byte>\(_vm->_rnd->getNonRepeatRandom\(4, poolState\) \+ 1\);/, setup, 'the mixing');
  const clearTo = Number(mix[1]), mixLevels = [...mix[2].matchAll(/kPuzzleLevel(\d)/g)].map(m => Number(m[1]));
  if (mix[3] !== '2' || mix[4] !== '4') fail(`ScummVM draws hair's Fleen trait from ${mix[3]} to ${mix[4]}`);
  need(/static_cast<byte>\(\(_traitValueRotations\[traitIndex\] \+ zmbTrait\[traitIndex\] - 2\) % 5 \+ 1\);\s*transformedTrait\[_traitDestinationKinds\[traitIndex\]\] = value;/, cpp, 'the Fleen value');
  const hive = Number(need(/kSpecialPositionCount = (\d+);/, cpp, 'the beehive\'s places')[1]);
  if (hive !== S.ZB_FLEENS_HIVE) fail(`ScummVM's beehive has ${hive} places, the port ${S.ZB_FLEENS_HIVE}`);

  // ---- the chances and the judging --------------------------------------
  const chances = Number(need(/debugGetChances\(\) const \{[\s\S]*?ZmbChanceType::kSubmit, (\d+),/, cpp, 'debugGetChances')[1]);
  const evict = Number(need(/mustEvictOldestPair = _submittedPairCount == (\d+);/, cpp, 'the eviction')[1]);
  if (chances !== S.ZB_FLEENS_WAITING || evict !== S.ZB_FLEENS_WAITING + 1) fail(`ScummVM gives ${chances} chances and sends back the first of ${evict}, the port holds ${S.ZB_FLEENS_WAITING}`);
  const board = need(/void ZoombiniPuzzleFleens::beginBoardingAnimation\([^)]*\) \{([\s\S]*?)\n\}/, cpp, 'beginBoardingAnimation')[1];
  need(/if \(creature\.isTarget && creature\.posCode <= kFleenPosCode19_TargetBranchLast\) \{\s*_matchedTargetCount \+= 1;[\s\S]*?\}\s*if \(appendQueue && _submittedPairCount < 7\) \{/, board, 'a submission joining the waiting pairs whether it lured a beehive Fleen or not');
  if (!/six/.test(P.levels[0].chances) || !P.levels.every(l => /Six|six/.test(l.chances))) fail('the chances do not say six at every level');

  // ---- the program and the disc -----------------------------------------
  const table = [1, 0, 2, 0, 3, 0, 4, 0];
  const tableAt = find(exe, [...table, ...new TextEncoder().encode('Fleens.MHK')]);
  if (tableAt.length !== 1) fail(`the table 1, 2, 3, 4 is before "Fleens.MHK" ${tableAt.length} times in ZOOMBINI.EXE, not once`);
  const arc = S.openMohawk(archiveBytes('FLEENS'));
  const regs = id => { const b = arc.get('REGS', id); return (b[0] << 24 >> 16) | b[1]; };
  const hivePlaces = regs(5000), branchPlaces = regs(5001);
  if (hivePlaces !== S.ZB_FLEENS_HIVE || hivePlaces + branchPlaces < 16) fail(`FLEENS REGS 5000 has ${hivePlaces} places and 5001 ${branchPlaces}`);

  // ---- the names ----------------------------------------------------------
  const scummNames = need(/kTraitValueNames\[4\]\[5\] = \{([\s\S]*?)\};/, h, 'kTraitValueNames')[1];
  const rows = [...scummNames.matchAll(/\{([^}]*)\}/g)].map(m => [...m[1].matchAll(/"(\w+)"/g)].map(n => n[1]));
  if (rows.length !== 4 || rows.some(r => r.length !== 5)) fail('read ScummVM\'s Fleen trait names wrong');
  KINDS.forEach((k, i) => rows[i].forEach((name, v) => {
    // Where ScummVM's name shares a word with a maker's name, it is at the same place.
    const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ');
    S.ZB_FLEENS_TRAIT_SHORT[k].forEach((mine, w) => {
      if (w !== v && words.some(x => x.length > 3 && mine.toLowerCase().split(' ').includes(x))) fail(`Fleen ${k} ${v + 1} is ScummVM's ${name}, but the port has it at ${w + 1}, ${mine}`);
    });
  }));
  const spritesJs = path.join(REF, 'site', 'sprites.js');
  let makerChecked = false;
  if (fs.existsSync(spritesJs)) {
    const lists = [...fs.readFileSync(spritesJs, 'utf8').matchAll(/"names":(\{[^}]*\})/g)].map(m => JSON.parse(m[1]));
    const fleen = lists.find(l => l.hair && l.hair.includes('Mohawk'));
    const mine = Object.fromEntries(KINDS.map(k => [k, S.ZB_FLEENS_TRAIT_SHORT[k].map(n => k === 'nose' ? n + ' nose' : n)]));
    if (!fleen || !same(KINDS.map(k => fleen[k]), KINDS.map(k => mine[k]))) fail(`the Fleen names are not the maker's: ${JSON.stringify(fleen)}`);
    makerChecked = true;
    KINDS.forEach(k => S.ZB_FLEENS_TRAIT_WITH[k].forEach((w, v) => { if (!w.toLowerCase().includes(S.ZB_FLEENS_TRAIT_SHORT[k][v].toLowerCase())) fail(`Fleen ${k} ${v + 1} reads "${w}" after "with"`); }));
  }

  // ---- deals --------------------------------------------------------------
  // A random number source that counts its draws.
  const counting = seed => { const r = S.zbRandom(seed); let n = 0; return { rnd: { number: m => { if (m) n++; return r.number(m); }, range: (a, b) => { if (b !== a) n++; return r.range(a, b); }, bool: () => { n++; return r.bool(); }, nonRepeat: (s, u) => { n++; return r.nonRepeat(s, u); } }, draws: () => n }; };
  const fleenOf = (z, rotations, kinds) => { const f = {}; KINDS.forEach((k, i) => { f[kinds[i]] = (rotations[i] + z[k] - 2) % 5 + 1; }); return f; };
  const every = []; for (let id = 0; id < 625; id++) every.push({ hair: Math.floor(id / 125) + 1, eyes: Math.floor(id / 25) % 5 + 1, nose: Math.floor(id / 5) % 5 + 1, feet: id % 5 + 1 });
  let dealt = 0;
  const keepsLike = [0, 0, 0];
  for (let level = 1; level <= 4; level++) {
    let bad = null;
    for (const { band, seed } of bands(300, 900 + level, [16, 11, 5, 2, 1])) {
      const d = P.deal(level, band, S.zbRandom(seed), {});
      const s = d.state, n = band.length, want = Math.min(3, n);
      const places = s.targetSnoidOrdinals.filter(t => t);
      if (places.length !== want || new Set(places).size !== want || places.some(t => t < 1 || t > n) || s.targetSnoidOrdinals.slice(want).some(t => t) || s.matchedTargetCount !== 3 - want) bad = `places ${s.targetSnoidOrdinals} and ${s.matchedTargetCount} already lured for a band of ${n}`;
      else if (s.traitValueRotations.some(r => r < 1 || r > 5)) bad = `turns ${s.traitValueRotations}`;
      else if (new Set(s.traitDestinationKinds).size !== 4 || (level <= 2 ? !same(s.traitDestinationKinds, KINDS) : s.traitDestinationKinds[0] === 'hair')) bad = `the traits mix as ${s.traitDestinationKinds} at level ${level}`;
      else if (band.some((z, i) => !same(s.fleens[i], fleenOf(z, s.traitValueRotations, s.traitDestinationKinds)))) bad = 'a Fleen is not its Zoombini\'s';
      else if (new Set(every.map(z => JSON.stringify(fleenOf(z, s.traitValueRotations, s.traitDestinationKinds)))).size !== 625) bad = 'two different Zoombinis share a Fleen';
      else if (d.marks.some((m, i) => m.startsWith('beehive') !== places.includes(i + 1))) bad = `the marks ${d.marks} do not name the places ${places}`;
      else if (d.answer.slice(0, 4).some((line, i) => [1, 2, 3, 4, 5].some(v => !line.includes(S.ZB_FLEENS_TRAIT_WITH[s.traitDestinationKinds[i]][v - 1])))) bad = 'the answer leaves out a Fleen value';
      if (bad) { fail(`level ${level}: ${bad}`); break; }
      if (level >= 3) keepsLike[s.traitDestinationKinds.filter((k, i) => k === KINDS[i]).length]++;
      dealt++;
    }
  }

  // Journeys: random levels in turn on one journey, against the program's
  // rules for what a visit draws and keeps.
  const jr = S.zbRandom(4242);
  let visits = 0;
  for (let j = 0; j < 60; j++) {
    const journey = {};
    let rotations = [0, 0, 0, 0], slots = [0, 0, 0, 0];
    for (let v = 0; v < 12; v++) {
      const level = jr.range(1, 4), band = S.zbDealBand(jr, 16), seed = 1 + jr.number(0x7fff) * 65536 + jr.number(0xffff);
      const c = counting(seed);
      const s = P.deal(level, band, c.rnd, journey).state;
      const drawRot = !rotations[0] || rotLevels.includes(level), drawMix = level > clearTo && (!slots[0] || mixLevels.includes(level));
      const targetDraws = counting(seed); S.zbFleensDeal(level, band, targetDraws.rnd, { fleensTraitValueRotations: [1, 1, 1, 1], fleensTraitDestSlots: [2, 1, 3, 4] });
      const placesOnly = targetDraws.draws() - (rotLevels.includes(level) ? 4 : 0) - (mixLevels.includes(level) ? 4 : 0);
      let bad = null;
      if (!drawRot && !same(s.traitValueRotations, rotations)) bad = `level ${level} drew turns it should keep`;
      else if (level <= clearTo && s.traitDestSlots.some(x => x)) bad = `level ${level} kept the mixing`;
      else if (level > clearTo && !drawMix && !same(s.traitDestSlots, slots)) bad = `level ${level} drew a mixing it should keep`;
      else if (c.draws() !== placesOnly + (drawRot ? 4 : 0) + (drawMix ? 4 : 0)) bad = `level ${level} drew ${c.draws()} numbers, the program ${placesOnly + (drawRot ? 4 : 0) + (drawMix ? 4 : 0)}`;
      if (bad) { fail(`a journey: ${bad}`); j = 1e9; break; }
      rotations = s.traitValueRotations; slots = s.traitDestSlots;
      visits++;
    }
  }
  // ---- the workbench -----------------------------------------------------
  // Round trips of the form; the solution; and the strategy played against
  // every hidden part that fits what the band sees, enumerated here apart
  // from the port's own enumeration, the game's answer to each Zoombini
  // sent being its own Fleen, from the beehive or not.
  const valuesOf = form => Object.fromEntries(form.filter(f => f.kind !== 'note').map(f => [f.key, f.value]));
  let trips = 0;
  for (let level = 1; level <= 4; level++) {
    let bad = null;
    for (const { band, seed } of bands(10, 800 + level, [16, 5, 2, 1])) {
      const d = P.deal(level, band, S.zbRandom(seed), {}), v = valuesOf(P.form(level, band, d.state)), again = P.edit(level, band, d.state, v);
      if (!same(valuesOf(P.form(level, band, again)), v) || !same(again.fleens, d.state.fleens) || !same(S.zbFleensTargets(again), S.zbFleensTargets(d.state))) bad = 'the form does not give back the puzzle it shows';
      const sol = P.solve(level, band, d.state), s0 = sol.solutions[0];
      const drawn = s0.diagram.items.filter(it => it.t === 'zoombini').map(it => it.i).sort((x, y) => x - y);
      if (!bad && (sol.most !== band.length || !sol.exact || s0.crosses.length !== band.length || !same(drawn, [...band.keys()]))) bad = 'the solution does not take and draw the whole band';
      if (!bad && s0.steps.filter(t => /^Send Zoombini/.test(t)).length !== Math.min(3, band.length)) bad = 'the solution does not send one Zoombini a beehive Fleen';
      if (bad) { fail(`level ${level}: ${bad}`); break; }
      trips++;
    }
  }
  const b6 = bands(1, 31, [6])[0].band, base3 = P.deal(3, b6, S.zbRandom(3), {}).state, good3 = valuesOf(P.form(3, b6, base3));
  for (const [what, values] of [['two Zoombinis for three places', { ...good3, hive: [1, 2] }], ['the same place twice', { ...good3, hive: [1, 1, 2] }],
    ['hair to hair at level 3', { ...good3, to_hair: 'hair', to_eyes: good3.to_hair === 'hair' ? good3.to_eyes : good3.to_hair === 'eyes' ? 'hair' : good3.to_eyes, to_nose: good3.to_nose === 'hair' ? good3.to_hair : good3.to_nose, to_feet: good3.to_feet === 'hair' ? good3.to_hair : good3.to_feet }],
    ['two traits to one', { ...good3, to_eyes: good3.to_nose }], ['a turn of 6', { ...good3, turn_feet: 6 }]]) {
    let threw = false; try { P.edit(3, b6, base3, values); } catch (x) { threw = true; } if (!threw) fail(`the form takes ${what}`);
  }

  const mixings = (level, knows) => {
    if (level <= 2) return [[0, 1, 2, 3]];
    const out = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) if (new Set([a, b, c, d]).size === 4 && (knows === 'form' || a !== 0)) out.push([a, b, c, d]);
    return out;
  };
  const fits = (level, knows, band, state) => {
    // Every mapping and choice of the beehive's that shows the same Fleens.
    const look = S.zbFleensLook, seen = state.fleens.map(look).sort((a, b) => a - b), hive = S.zbFleensTargets(state).map(i => look(state.fleens[i])).sort((a, b) => a - b), out = [];
    const remember = knows === 'program' && state.rotationsKept;
    for (const mix of remember && (level <= 2 || state.destSlotsKept) ? [state.traitDestinationKinds.map(k => KINDS.indexOf(k))] : mixings(level, knows)) {
      for (let r = 0; r < 625; r++) {
        const rot = remember ? state.traitValueRotations : [Math.floor(r / 125) + 1, Math.floor(r / 25) % 5 + 1, Math.floor(r / 5) % 5 + 1, r % 5 + 1];
        if (remember && r) break;
        const images = band.map(z => { const f = {}; KINDS.forEach((k, i) => { f[KINDS[mix[i]]] = (rot[i] + z[k] - 2) % 5 + 1; }); return look(f); });
        if (!same(images.slice().sort((a, b) => a - b), seen)) continue;
        const want = Math.min(3, band.length), n = band.length;
        for (let m = 0; m < 1 << n; m++) {
          let c = 0; for (let x = m; x; x &= x - 1) c++;
          if (c !== want) continue;
          if (same(band.map((_, i) => i).filter(i => m >> i & 1).map(i => images[i]).sort((a, b) => a - b), hive)) out.push({ images, mask: m });
        }
      }
    }
    return out;
  };
  let played = 0, stratCount = 0, walked = 0, slowest = 0, amb = 0, maxSent = 0;
  const walkAll = (nd, sure, depth) => { if (depth > 20) throw new Error('too deep'); if (!nd.outcomes.length) return [nd.crossed, nd.crossed]; const r = nd.outcomes.map(o => walkAll(o.next(), sure, depth + 1)); walked++; return [Math.min(...r.map(x => x[0])), Math.max(...r.map(x => x[1]))]; };
  const twins = band => { const b = band.slice(); b[1] = { ...b[0] }; return b; };
  const diag = []; for (let k = 1; k <= 5; k++) diag.push({ hair: k, eyes: k, nose: k, feet: k }, { hair: k, eyes: k % 5 + 1, nose: (k + 1) % 5 + 1, feet: (k + 2) % 5 + 1 });
  const cases = [];
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(6, 900 + level, [16, 10, 7, 4, 2, 1])) cases.push({ level, band, seed });
    cases.push({ level, band: twins(bands(1, 950 + level, [9])[0].band), seed: 5 }, { level, band: diag, seed: 7 });
  }
  for (const { level, band, seed } of cases) for (const knows of ['program', 'form']) {
    const journey = {};
    if (seed % 2) P.deal(level === 1 ? 2 : level === 3 ? 4 : level, band, S.zbRandom(seed + 1), journey);
    const state = P.deal(level, band, S.zbRandom(seed), journey).state, n = band.length;
    const t0 = Date.now(), st = P.strategy(level, band, null, { knows, state });
    slowest = Math.max(slowest, Date.now() - t0);
    const all = fits(level, knows, band, state);
    if (!all.some(h => h.mask === S.zbFleensTargets(state).reduce((m, i) => m | 1 << i, 0) && same(h.images, state.fleens.map(S.zbFleensLook)))) { fail(`level ${level}: the dealt Fleens do not fit what is seen`); continue; }
    if (all.length > 1) amb++;
    let bad = null, worst = n;
    for (const h of all) {
      let node = st.root, sent = 0, lured = 0;
      const was = new Set();
      while (node.outcomes.length) {
        const z = node.zoombini;
        if (z == null || z < 0 || z >= n || was.has(z)) { bad = `a move sends ${z}, not a Zoombini still to send`; break; }
        was.add(z);
        const hive = !!(h.mask >> z & 1), o = node.outcomes.find(x => x.look === h.images[z] && x.hive === hive);
        if (!o) { bad = `no branch for Zoombini ${z + 1}'s Fleen`; break; }
        sent++; lured += hive; node = o.next();
      }
      if (bad) break;
      maxSent = Math.max(maxSent, sent);
      const crossed = n - Math.max(0, sent - 6);
      if (lured !== Math.min(3, n) || node.crossed !== crossed) { bad = `a play ends with ${lured} lured and ${node.crossed} said to cross, ${crossed} by the count`; break; }
      if (crossed < st.sure) { bad = `a play gets ${crossed} across where ${st.sure} are said to be sure`; break; }
      worst = Math.min(worst, crossed);
      played++;
    }
    if (!bad && st.exact && worst !== st.sure) bad = `said to be exact at ${st.sure} but every play gets ${worst}`;
    if (!bad && n <= 7) { const [lo] = walkAll(st.root, st.sure, 0); if (lo < st.sure) bad = 'a branch short of sure'; }
    // And with nothing seen: any of the band's places may be the beehive's.
    if (!bad) {
      const blind = P.strategy(level, band, null, { knows });
      if (blind.sure !== n - Math.max(0, n - 6)) bad = `with nothing seen ${blind.sure} are said to be sure, not ${n - Math.max(0, n - 6)}`;
      else if (n <= 7) { const [lo, hi] = walkAll(blind.root, blind.sure, 0); if (lo !== blind.sure) bad = `with nothing seen the worst branch gets ${lo}`; }
    }
    if (bad) { fail(`level ${level} (${knows}, a band of ${n}): ${bad}`); continue; }
    stratCount++;
  }
  if (slowest > 1500) fail(`a strategy took ${slowest} ms`);

  const pct = n => `${Math.round(100 * n / (keepsLike[0] + keepsLike[1] + keepsLike[2]))}%`;
  say(`${trips} forms given back and solved; ${stratCount} strategies played against every hidden part that fits what is seen (${played} plays, ${amb} strategies with more than one, at most ${maxSent} sent, all across), ${walked} branches walked, slowest ${slowest} ms; `
    + `dealing as ScummVM's, table in ZOOMBINI.EXE at 0x${(tableAt[0] || 0).toString(16)}, beehive REGS 5000's ${hivePlaces}${makerChecked ? ', names the maker\'s' : ''}; ${dealt} deals of the level's form, `
    + `${visits} visits keeping what the program keeps; at levels 3 and 4 no trait keeps its like in ${pct(keepsLike[0])}, one in ${pct(keepsLike[1])}, two in ${pct(keepsLike[2])}`);
}
