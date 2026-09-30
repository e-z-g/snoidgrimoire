// Zoombiniville (js/zb-town.js) against ScummVM's town page and the 1996
// program, each read here from its own files:
//
//   - the density that raises the houses and the count of inhabitants, for
//     every population from 0 to 625, are the formulas in shelter_town.cpp,
//     evaluated with the numbers read out of its text;
//   - each reward slot's name is in the plaque the program shows for it
//     (kTownMemorialCardTextTypeBySlot's plaque, at ScummVM's
//     kV11US_NETextEntries offset in ZOOMBINI.EXE), and the clock's slot is
//     the page's kTownClockTowerMemorialSlot;
//   - the clock is where clockHands_preRenderShape puts it, in the world
//     (within 2 pixels: 946 from one column, 947 from the next), and its
//     hands take the time as updateClockHandTime does;
//   - the world: SCRB 1000 is six strips all round; every record of every
//     frame of SCRB 1001-1003 is one of the things read, within 2 pixels;
//     the houses are shapes 25-80 and the reward buildings 7-22, each once;
//     the inhabitants are the page's SCRB table; the music is there.
import fs from 'node:fs';
import path from 'node:path';
import { site, archiveBytes, haveDisc, REF } from './load.mjs';

let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };
const S = site();
const SCUMM = path.join(REF, 'scummvm-zoombini', 'engines', 'mohawk');
const EXE = path.join(REF, 'zombs-lair', 'HDD', 'ZOOMBINI', 'ZOOMBINI.EXE');
if (!haveDisc() || !fs.existsSync(SCUMM)) { console.log('SKIP: no reference/disc/DATA or reference/scummvm-zoombini'); process.exit(0); }
const cpp = fs.readFileSync(path.join(SCUMM, 'zoombini_pages', 'shelter_town.cpp'), 'utf8');
const hdr = fs.readFileSync(path.join(SCUMM, 'zoombini_pages', 'shelter_town.h'), 'utf8');
const need = (re, text, what) => { const m = re.exec(text); if (!m) throw new Error(`could not read ${what} from ScummVM`); return m; };

// ---- the rules, against shelter_town.cpp --------------------------------
{
  const d = need(/density = (\d+) \* static_cast<int32>\(population\) \/ (\d+) \+ (\d+);[\s\S]*?MIN<int32>\(density, (\d+)\) \+ (\d+)\)/, cpp, 'calculatePopulationDensity');
  const [k, total, plus, cap, base] = d.slice(1).map(Number);
  const i = need(/populationAfterFirstTwenty = f\._zmbStoredTownCount - (\d+);\s*populationAfterFirstTwenty = CLIP<int16>\(populationAfterFirstTwenty, (\d+), (\d+)\);\s*_inhabitantCount = CLIP<int16>\(populationAfterFirstTwenty \/ (\d+), (\d+), (\d+)\);/, cpp, 'the inhabitant count');
  const [first, lo, hi, per, min, max] = i.slice(1).map(Number);
  let bad = 0;
  for (let p = 0; p <= 625; p++) {
    const want = Math.min(Math.trunc(k * p / total) + plus, cap) + base;
    if (S.zbTownDensity(p) !== want) { if (bad++ < 3) fail(`density at ${p} is ${S.zbTownDensity(p)}, ScummVM's ${want}`); }
    const inh = Math.min(max, Math.max(min, Math.trunc(Math.min(hi, Math.max(lo, p - first)) / per)));
    if (S.zbTownInhabitants(p) !== inh) { if (bad++ < 3) fail(`inhabitants at ${p} are ${S.zbTownInhabitants(p)}, ScummVM's ${inh}`); }
  }
  if (total !== S.ZB_TOWN_PEOPLE) fail(`the town holds ${S.ZB_TOWN_PEOPLE}, ScummVM ${total}`);
  if (!bad) console.log(`rules: density and inhabitants as ScummVM's for all 626 populations (density ${S.zbTownDensity(0)} to ${S.zbTownDensity(625)})`);

  const clk = need(/int16 xPos = \(scrollCol == 1\) \? (\d+) : (\d+);[\s\S]*?hotspots\[0\]\._y = (\d+);/, cpp, 'the clock\'s place');
  const [x1, x2, y] = clk.slice(1).map(Number);
  const w = S.zbTownWorld(S.openMohawk(archiveBytes('TOWN')));
  // A pixel apart from the two columns, as the layers' things are.
  if (Math.abs(x1 + 320 - w.clock.x) > 2 || Math.abs(x2 + 640 - w.clock.x) > 2 || y !== w.clock.y) fail(`the clock is at ${w.clock.x}, ${w.clock.y}; ScummVM draws it at ${x1} from column 1 and ${x2} from column 2, y ${y}`);
  const hourDiv = +need(/_clockHourStep = static_cast<byte>\(td\.tm_hour\) \/ (\d+);/, cpp, 'the hour hand')[1];
  const minMod = +need(/_clockMinuteStep = static_cast<byte>\(td\.tm_min\) % (\d+);/, cpp, 'the minute hand')[1];
  const minBase = +need(/hotspots\[1\]\._shapeIdx = _clockMinuteStep \+ (\d+);/, cpp, 'the minute shapes')[1];
  let hands = 0;
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) {
    const s = S.zbTownClockShapes(h, m);
    if (s.hour !== Math.trunc(h / hourDiv) + 1 || s.minute !== m % minMod + minBase) { if (hands++ < 3) fail(`the hands at ${h}:${m} are ${s.hour}, ${s.minute}`); }
  }
  const slot = +need(/kTownClockTowerMemorialSlot = (\d+);/, cpp, 'the clock tower\'s slot')[1];
  if (slot !== S.ZB_TOWN_CLOCK_SLOT) fail(`the clock tower is slot ${S.ZB_TOWN_CLOCK_SLOT} here, ${slot} in ScummVM`);
  if (!hands) console.log(`the clock: at ${w.clock.x}, ${w.clock.y}, its hands for every minute of the day as ScummVM's, slot ${slot}`);

  // ---- the world, against its own scripts -------------------------------
  const arc = S.openMohawk(archiveBytes('TOWN'));
  const houses = w.things.filter(t => t.gate && t.gate.density != null).map(t => t.shape).sort((a, b) => a - b);
  if (houses.join() !== Array.from({ length: 56 }, (_, i) => i + 25).join()) fail(`the houses are shapes ${houses.join(',')}, not 25-80 once each`);
  const rewards = w.things.filter(t => t.gate && t.gate.reward != null).map(t => t.gate.reward).sort((a, b) => a - b);
  if (rewards.join() !== Array.from({ length: 16 }, (_, i) => i).join()) fail(`the reward slots are ${rewards.join(',')}, not 0-15 once each`);
  let records = 0;
  for (const id of [1001, 1002, 1003]) {
    const s = S.parseScript(arc.get('SCRB', id), 'SCRB');
    s.frames.forEach((fr, k) => {
      for (const r of fr.records) {
        records++;
        const x = ((r.x + 320 * k) % 1920 + 1920) % 1920;
        const t = w.things.find(t => t.layer === id && t.shape === r.shape && Math.min(Math.abs(t.x - x), 1920 - Math.abs(t.x - x)) <= 2 && t.y === r.y);
        if (!t) fail(`SCRB ${id} frame ${k} draws shape ${r.shape} at world ${x}, ${r.y}, which is none of the things read`);
      }
    });
  }
  const table = [...need(/kInhabitantScrbTable\[16\]\{([\s\S]*?)\};/, hdr, 'kInhabitantScrbTable')[1].matchAll(/(\d+)/g)].map(m => +m[1]);
  const scripts = [...new Set(table)].sort((a, b) => a - b);
  if (scripts.join() !== w.inhabitants.map(i => i.script).join()) fail(`the inhabitants are SCRB ${w.inhabitants.map(i => i.script).join(',')}; ScummVM's table has ${scripts.join(',')}`);
  for (const id of [3000, 3001, 3002, 3003]) if (!arc.has('\0SND', id)) fail(`TOWN has no SND ${id}`);
  console.log(`the world: 6 strips, ${houses.length} houses, ${rewards.length} reward buildings, ${w.things.length - houses.length - rewards.length} always there; all ${records} records of SCRB 1001-1003 placed; inhabitants SCRB ${scripts[0]}-${scripts[scripts.length - 1]}`);
}

// ---- the buildings' names, against the program ------------------------------
if (!fs.existsSync(EXE)) console.log('SKIP names: no ' + path.relative(process.cwd(), EXE));
else {
  const exe = fs.readFileSync(EXE);
  const text = fs.readFileSync(path.join(SCUMM, 'zoombini_text.cpp'), 'utf8');
  const table = need(/kV11US_NETextEntries\[\] = \{([\s\S]*?)\n\};/, text, 'kV11US_NETextEntries')[1];
  const plaques = [...table.matchAll(/ZoombiniText::kMemorialHonor\w+, 0x([0-9A-F]+), (\d+)\}/g)].map(m => exe.subarray(parseInt(m[1], 16), parseInt(m[1], 16) + +m[2]).toString('latin1').replace(/\r/g, ' '));
  const bySlot = need(/kTownMemorialCardTextTypeBySlot\[16\] = \{([^}]*)\}/, cpp, 'kTownMemorialCardTextTypeBySlot')[1].split(',').map(Number);
  let n = 0;
  if (plaques.length !== 16) fail(`read ${plaques.length} plaques, not 16`);
  S.ZB_TOWN_REWARDS.forEach((name, slot) => {
    const plaque = plaques[bySlot[slot]] || '';
    if (!plaque.toLowerCase().includes('this ' + name.toLowerCase() + ' ')) fail(`slot ${slot} is the ${name}; its plaque says "${plaque}"`);
    else n++;
  });
  console.log(`names: ${n} of 16 reward buildings named as their plaques name them`);
}
process.exit(fails ? 1 : 0);
