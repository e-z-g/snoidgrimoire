// The puzzles' rules (js/zb-puzzle.js and js/zb-puzzle-*.js) against
// ScummVM's page classes and the 1996 program, each read here from its own
// files. What they share is checked here:
//
//   - the random numbers are the generator in zoombini_random.cpp, whose
//     two constants are the ones the program multiplies and adds
//     (ZOOMBINI.EXE: imul by 214013, then add 2531011, 32-bit);
//   - every js/zb-puzzle-*.js is loaded by index.html, and every puzzle
//     has a check in utilities/puzzles/ and a deal at each level that
//     answers in the shape zb-puzzle.js describes;
//   - where a band waits at each puzzle (ZB_WAITING): ScummVM's table that
//     its page class loads the band at, and the program's, little-endian
//     x, y pairs at the offset given in ZOOMBINI.EXE;
//
// and each puzzle's own rules by utilities/puzzles/<archive>.mjs, whose
// default export is given { S, fail, say, scumm, exe, need, bands, find,
// open }; open(name) is an archive of the 1996 disc, opened, which a deal
// that names one is given.
//
//   node utilities/puzzle_check.mjs           # every puzzle
//   node utilities/puzzle_check.mjs bridge    # the shared checks and one,
//                                             # by its archive in lower case
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { site, pageScripts, haveDisc, archiveBytes, ROOT, REF } from './load.mjs';

let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };
const say = m => console.log(m);
const SCUMM = path.join(REF, 'scummvm-zoombini', 'engines', 'mohawk');
const EXE = path.join(REF, 'zombs-lair', 'HDD', 'ZOOMBINI', 'ZOOMBINI.EXE');
if (!haveDisc() || !fs.existsSync(SCUMM) || !fs.existsSync(EXE)) {
  console.log('SKIP: no reference/disc/DATA, reference/scummvm-zoombini or the installed ZOOMBINI.EXE');
  process.exit(0);
}

// The page's scripts, and any puzzle file it does not load yet (said
// below). Given puzzles to check, only their files are loaded.
const want = process.argv.slice(2);
const wanted = f => !want.length || want.some(w => f === `js/zb-puzzle-${w}.js`);
const onDisk = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^zb-puzzle-.+\.js$/.test(f)).sort().map(f => 'js/' + f);
const listed = pageScripts().filter(f => f.startsWith('js/') && !f.startsWith('js/page-'));
for (const f of onDisk) if (!listed.includes(f) && wanted(f)) fail(`index.html does not load ${f}`);
for (const f of listed) if (/zb-puzzle-/.test(f) && !fs.existsSync(path.join(ROOT, f))) fail(`index.html loads ${f}, which is not there`);
const files = listed.filter(f => !/zb-puzzle-/.test(f));
if (!files.includes('js/zb-puzzle.js')) files.push('js/zb-puzzle.js');
for (const f of onDisk) if (wanted(f)) files.push(f);
const S = site({ files });

const scummCache = new Map();
const scumm = f => {
  if (!scummCache.has(f)) scummCache.set(f, fs.readFileSync(path.join(SCUMM, f), 'utf8'));
  return scummCache.get(f);
};
const exe = new Uint8Array(fs.readFileSync(EXE));
const opened = new Map();
const open = name => { if (!opened.has(name)) opened.set(name, S.openMohawk(archiveBytes(name))); return opened.get(name); };
const need = (re, text, what) => { const m = re.exec(text); if (!m) throw new Error(`could not read ${what} from ScummVM`); return m; };
// Every offset of a byte string in a byte array.
const find = (hay, bytes) => {
  const out = [];
  outer: for (let i = hay.indexOf(bytes[0]); i >= 0 && i <= hay.length - bytes.length; i = hay.indexOf(bytes[0], i + 1)) {
    for (let j = 1; j < bytes.length; j++) if (hay[i + j] !== bytes[j]) continue outer;
    out.push(i);
  }
  return out;
};
// n bands dealt from a seed, of the sizes given (16 by default), each with the seed that deals its puzzle.
const bands = (n, seed, sizes = [16]) => {
  const rnd = S.zbRandom(seed), out = [];
  for (let i = 0; i < n; i++) out.push({ band: S.zbDealBand(rnd, sizes[i % sizes.length]), seed: 1 + rnd.number(0x7fff) * 65536 + rnd.number(0xffff) });
  return out;
};

// ---- the random numbers ---------------------------------------------------
{
  const src = scumm('zoombini_random.cpp');
  const m = need(/_randState = (\d+)u \* _randState \+ (\d+)u;\s*return static_cast<uint16>\(\(_randState >> 16\) % \(max \+ 1\)\);/, src, 'getOriginalRandomNumber');
  const [mul, add] = [Number(m[1]), Number(m[2])];
  const le = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24];
  const at = find(exe, [...le(mul), 0x66, 0x05, ...le(add)]);
  if (at.length !== 1) fail(`ZOOMBINI.EXE multiplies by ${mul} and adds ${add} in ${at.length} places, not one`);
  let s = 12345, bad = 0;
  const rnd = S.zbRandom(12345);
  for (let i = 0; i < 1000; i++) {
    const max = i % 37;
    let want = 0;
    if (max) { s = Number((BigInt(mul) * BigInt(s) + BigInt(add)) % 4294967296n); want = (s >>> 16) % (max + 1); }
    if (rnd.number(max) !== want) bad++;
  }
  if (bad) fail(`zbRandom differs from ScummVM's generator in ${bad} of 1000 draws`);
  else say(`random: ScummVM's generator (x ${mul} + ${add}), which ZOOMBINI.EXE has at 0x${(at[0] - 4).toString(16)}, for 1000 draws`);
}

// ---- every puzzle ---------------------------------------------------------
const dir = path.join(ROOT, 'utilities', 'puzzles');
const modules = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort() : [];
const keys = [...S.ZB_PUZZLES.keys()];
for (const k of keys) if (!modules.includes(k.toLowerCase() + '.mjs')) fail(`${k} has no check in utilities/puzzles/`);
for (const k of keys) {
  const p = S.ZB_PUZZLES.get(k);
  if (!p.about || !p.source || !Array.isArray(p.levels) || p.levels.length !== 4 || p.levels.some(l => !l.rule || !l.chances)) fail(`${k} does not describe its four levels`);
  for (let level = 1; level <= 4; level++) {
    for (const { band, seed } of bands(20, 7 * level + k.length, [16, 11, 5])) {
      const d = p.deal(level, band, S.zbRandom(seed), {}, p.archive ? open(p.archive) : undefined);
      if (!d || !Array.isArray(d.setup) || !Array.isArray(d.answer) || !Array.isArray(d.marks) || d.marks.length !== band.length || !d.state) {
        fail(`${k} level ${level}: a deal is not { setup, answer, marks (one a band member), state }`);
        break;
      }
    }
  }
}
// Where a band waits: ScummVM's table, and the program's bytes.
const WAITING_IN_SCUMMVM = {
  BRIDGE: ['puzzle_bridge.h', 'kLeftBankWaitingPositions'], TUNNELS: ['puzzle_tunnels.h', 'kSnoidPositions'],
  PIZZA: ['puzzle_pizza.h', 'kSnoidPositions'], FERRY: ['puzzle_ferry.h', 'kDockSnoidPositions'],
  SLIDES: ['puzzle_slides.h', 'kSnoidPositions'], FLEENS: ['puzzle_fleens.h', 'kPackSnoidPositions'],
  HOTEL: ['puzzle_hotel.h', 'kIntroSnoidPositions'], NET: ['puzzle_net.h', 'kSnoidPositions'],
  CAVES: ['puzzle_caves.h', 'kWaitingSnoidPositions'], SMOKE: ['puzzle_smoke.h', 'kSnoidPositions'],
  MAZE2: ['puzzle_maze.h', 'kSnoidPositions'],
};
{
  let tables = 0;
  for (const k of keys) {
    const w = S.ZB_WAITING[k], sv = WAITING_IN_SCUMMVM[k];
    if (!w !== !sv) { fail(`${k}: ${w ? 'a waiting table ScummVM is not read for' : 'no waiting table'}`); continue; }
    if (!w) continue;
    const text = scumm(path.join('zoombini_pages', sv[0]));
    const m = need(new RegExp(`${sv[1]}\\[(\\d+)\\]\\s*\\{([^}]*)\\}`), text, `${k}'s ${sv[1]}`);
    const theirs = [...m[2].matchAll(/Point\((-?\d+),\s*(-?\d+)\)/g)].flatMap(p => [+p[1], +p[2]]);
    if (theirs.length !== 2 * +m[1]) fail(`${k}: read ${theirs.length / 2} of ScummVM's ${m[1]} places`);
    if (w.at.length !== 32 || JSON.stringify(theirs.slice(0, 32)) !== JSON.stringify(w.at)) fail(`${k}: the waiting places are not ScummVM's ${sv[1]}`);
    const dv = new DataView(exe.buffer, exe.byteOffset);
    const ours = Array.from({ length: theirs.length }, (_, i) => dv.getInt16(w.exe + 2 * i, true));
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) fail(`${k}: ZOOMBINI.EXE at 0x${w.exe.toString(16)} is not ScummVM's ${sv[1]}`);
    if (find(exe, new Uint8Array(exe.buffer, exe.byteOffset + w.exe, 8)).length < 1) fail(`${k}: lost the table in ZOOMBINI.EXE`);
    tables++;
  }
  if (S.ZB_WAITING.LILLY) fail('LILLY has a waiting table, though its band stands off the screen');
  say(`waiting: ${tables} puzzles' places for the band as ScummVM's and in ZOOMBINI.EXE`);
}

for (const f of modules) {
  const key = f.replace(/\.mjs$/, '');
  if (want.length && !want.includes(key)) continue;
  if (!S.ZB_PUZZLES.has(key.toUpperCase())) { fail(`utilities/puzzles/${f} checks ${key.toUpperCase()}, which no js/zb-puzzle-*.js adds`); continue; }
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  try {
    await mod.default({ S, fail, say: m => say(`${key}: ${m}`), scumm, exe, need, bands, find, open });
  } catch (e) {
    fail(`${key}: ${e.stack || e}`);
  }
}
process.exit(fails ? 1 : 0);
