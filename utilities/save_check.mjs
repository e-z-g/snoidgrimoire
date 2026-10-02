// A saved game and its roster (js/zb-save.js), read as ScummVM reads them,
// against a game saved in the 1996 US program (reference/saves/test-2026-10-01:
// a band of sixteen made on Zoombini Isle crossed the Allergic Cliffs, was
// given up in the Stone Cold Caves by going to the map, and the game was saved
// at the map as "Test"):
//
//   - every field of every layout begins where zoombini_state.h's comments
//     put it, and each layout ends at its file's length, so every byte is
//     some field's; the save reads to its last byte;
//   - what the player did: the cliffs crossed at level 1, every Zoombini
//     back on the isle, the band empty, nothing at the camps or in town, the
//     map the current page, sixteen Zoombinis made and those sixteen;
//   - ScummVM's trait value names are the site's ZB_TRAIT_SHORT, value for
//     value, where the two use the same word;
//   - written back, the save and the roster are their own bytes, and so is
//     a file of noise in every layout.
import fs from 'node:fs';
import path from 'node:path';
import { site, REF } from './load.mjs';

let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)}, not ${JSON.stringify(b)}`); };
const DIR = path.join(REF, 'saves', 'test-2026-10-01');
const HDR = path.join(REF, 'scummvm-zoombini', 'engines', 'mohawk', 'zoombini_state.h');
if (!fs.existsSync(path.join(DIR, 'ZOOM0000.TXT'))) { console.log('SKIP: no reference/saves/test-2026-10-01'); process.exit(0); }
const S = site();
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---- (a) the layouts, against the header's offsets ------------------------
let offsetsChecked = 0;
if (fs.existsSync(HDR)) {
  const h = fs.readFileSync(HDR, 'utf8');
  const body = h.slice(h.indexOf('struct ZmbStateFile {'), h.indexOf('struct ZmbRosterEntry {'));
  // Each doc comment's "(release) 0xNNNN" lines belong to the next member declared.
  const want = {}, eof = {};
  let pending = null;
  for (const m of body.matchAll(/\/\*\*([\s\S]*?)\*\/|^\s*[\w:]+\s+_(\w+)\s*(?:\[\d+\])?\s*[=;]/gm)) {
    if (m[1] !== undefined) {
      const tags = {};
      for (const t of m[1].matchAll(/\((v[\d.]+[A-Z]+)([^)]*)\)\s+(0x[0-9A-Fa-f]+|absent)/g)) {
        const q = /small/.test(t[2]) ? ' small' : /current/.test(t[2]) ? ' current' : '';
        tags[t[1] + q] = t[3] === 'absent' ? null : parseInt(t[3], 16);
      }
      if (/EOF:/.test(m[1])) { Object.assign(eof, tags); break; }
      if (Object.keys(tags).length) pending = tags;
    } else if (pending) { want[m[2]] = pending; pending = null; }
  }
  const tagFor = { 'v1.0BR': ['v1.0BR'], 'v1.1US': ['v1.1US'], 'v2.0TLC small': ['v2.0TLC small', 'v2.0TLC'], 'v2.0TLC': ['v2.0TLC current', 'v2.0TLC'] };
  for (const L of S.ZB_SAVE_LAYOUTS) {
    const { offsets, end } = S.zbSaveOffsets(L.name);
    const pick = tags => { for (const t of tagFor[L.name]) if (t in tags) return tags[t]; return undefined; };
    if (end !== L.size) fail(`${L.name} reads ${end} bytes, not ${L.size}`);
    if (pick(eof) !== L.size) fail(`${L.name}: the header's EOF is ${pick(eof)}, not ${L.size}`);
    for (const [k, tags] of Object.entries(want)) {
      const w = pick(tags);
      if (w === undefined) continue;                  // the header gives this field no offset in this release
      const got = k in offsets ? offsets[k] : null;
      if (got !== w) fail(`${L.name} ${k} at ${got === null ? 'nowhere' : '0x' + got.toString(16)}, the header says ${w === null ? 'absent' : '0x' + w.toString(16)}`);
      offsetsChecked++;
    }
    for (const k of Object.keys(offsets)) if (!(k in want)) fail(`${k} is not a ZmbStateFile member with an offset`);
  }
  if (Object.keys(want).length < 60) fail(`only ${Object.keys(want).length} fields found in the header`);
} else console.log('SKIP the header offsets: no reference/scummvm-zoombini');

let threw = 0;
for (const n of [0, 44558, 44560, 1606]) try { S.zbSaveRead(new Uint8Array(n)); } catch { threw++; }
if (threw !== 4) fail('a size no layout has was read');

// ---- (b) what the player did ---------------------------------------------
const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, 'ZOOM0000.TXT')));
const whoBytes = new Uint8Array(fs.readFileSync(path.join(DIR, 'ZOOMBINI.WHO')));
const f = S.zbSaveRead(bytes), who = S.zbSaveRoster(whoBytes);

eq(who.map(e => [e.name, e.file]), [['Test', 'ZOOM0000']], 'the roster');
eq([who.magic, who.next, who.count], [0x6b, 1, 1], 'the roster\'s header');
eq([f.layout.name, f.magic006B, f.autoStickyDelay], ['v1.1US', 0x6b, 30], 'the layout, magic and delay');

// The places visited: the isle, the cliffs, the caves, once each.
eq(f.visits.filter(v => v.raw).map(v => [v.key, v.visits]), [['PICKER', 1], ['BRIDGE', 1], ['TUNNELS', 1]], 'the places visited');
// The cliffs left at level 1 with every Zoombini across; the caves left at
// level 1 too (given up: routeNonOccupiedToRestingPack marks the place left
// whether the band crossed or not), and not with every one across.
const bbh = f.routes[0], at = k => bbh.places.find(p => p.key === k);
eq([at('BRIDGE').left, at('BRIDGE').perfect], [[1], [1]], 'the Allergic Cliffs');
eq([at('TUNNELS').left, at('TUNNELS').perfect], [[1], []], 'the Stone Cold Caves');
eq(f.routes.flatMap(r => r.places.filter(p => p.raw).map(p => p.key)), ['BRIDGE', 'TUNNELS'], 'the places with level flags');
eq(f.routes.map(r => r.places.map(p => p.map)), [[1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'the map\'s colours');
eq(f.routes.map(r => [r.level, r.crossed, r.perfectCount]), [[1, [], 0], [1, [], 0], [1, [], 0], [1, [], 0]], 'the routes');
eq(f.pageLevelFlags.slice(0, 3), [0, 0, 0], 'the three reserved level bytes');
// No band; all sixteen back on the isle; nothing at the camps or in town.
eq(f.band.length, 0, 'the band');
eq(f.where.map(z => z.where), new Array(16).fill('PICKER'), 'where the Zoombinis are');
eq([f.zmbStoredBC1Count, f.zmbStoredBC2Count, f.zmbStoredTownCount, f.population, f.rewards.length, f.townDevelopLevel], [0, 0, 0, 0, 0, 0], 'the camps and the town');
for (const k of ['storedChunkBC1', 'storedChunkBC2', 'storedChunkTown']) if (f[k].entries.some(e => e.nameBytes.some(Boolean) || Object.values(e.traits).some(Boolean))) fail(`${k} is not empty`);
for (const k of ['zmbPackBC1', 'zmbPackBC2']) if (f[k].wPackZmbCount || f[k].entries.some(e => Object.values(e.traits).some(Boolean))) fail(`${k} is not empty`);
// The isle's sixteen are the band's: the active pack's count is 0 but its
// sixteen entries are still there, unoccupied, where they stood in the caves.
const isle = f.zmbPackIsle.entries.slice(0, 16), left = f.zmbPackActive.entries.slice(0, 16);
eq(isle.map(e => [e.traits, e.name]), left.map(e => [e.traits, e.name]), 'the isle\'s Zoombinis against the band given up');
eq([isle.every(e => e.bIsOccupied === 1), left.every(e => e.bIsOccupied === 0), left.every(e => e.posX && e.posY)], [true, true, true], 'occupied on the isle, not in the band');
if (new Set(isle.map(e => e.name)).size !== 16 || isle.some(e => !e.name)) fail('the sixteen do not each have a name');
// Sixteen made, and twinGenStatus marks exactly those sixteen.
const ids = isle.map(e => S.zbSaveSnoidId(e.traits)).sort((a, b) => a - b);
const marked = [...f.twinGenStatus].map((v, i) => v ? i : -1).filter(i => i >= 0);
eq([f.zmbGeneratedCount, f.twinGenStatus.reduce((a, b) => a + b, 0)], [16, 16], 'the Zoombinis made');
eq(marked, ids, 'twinGenStatus against the sixteen\'s snoid ids');
// At the map, having left the caves.
eq([f.page.key, f.lastPage.key], ['MAP', 'TUNNELS'], 'the page and the last page');
eq(f.routeLevels, [0, 0, 0, 0], 'the route levels');
eq(f.v1FleensTraitValueRotations.concat(f.v1FleensTraitDestSlots), new Array(8).fill(0), 'the Fleens tables, untouched');
eq([f.flagSfxEnable, f.flagBgmEnable, f.flagStickyMouseEnable, f.flagCursorVisible, f.flagDebug, f.flagAutoStickyMouse], [1, 1, 1, 1, 0, 0], 'the options');

// ---- (c) the trait order ---------------------------------------------------
if (fs.existsSync(HDR)) {
  const h = fs.readFileSync(HDR, 'utf8');
  const arr = /kZoombiniTraitNames\[4\]\[5\] = \{([\s\S]*?)\};/.exec(h);
  const sv = arr ? [...arr[1].matchAll(/\{([^}]*)\}/g)].map(m => [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1])) : null;
  if (!sv || sv.length !== 4) fail('ScummVM\'s trait names not found');
  else {
    // The byte order is the struct's: hair, eyes, nose, feet.
    const order = /TraitKind : byte \{([\s\S]*?)\};/.exec(h)[1];
    eq([...order.matchAll(/kTrait(\w+) = (\d)/g)].map(m => [m[1].toLowerCase(), +m[2]]), S.ZB_TRAIT_KINDS.map((k, i) => [k, i]), 'the trait kinds\' order');
    const norm = s => s.toLowerCase().replace(/[^a-z]/g, '').replace(/eyed$/, 'eyes').replace(/^roller/, '').replace(/^green(?=cap)/, '');
    let matched = 0;
    S.ZB_TRAIT_KINDS.forEach((kind, k) => {
      const site = S.ZB_TRAIT_SHORT[kind].map(norm), theirs = sv[k].map(norm);
      theirs.forEach((n, v) => {
        const i = site.indexOf(n);
        if (i >= 0) { matched++; if (i !== v) fail(`${kind}: ScummVM's ${sv[k][v]} is ${v + 1}, the site's ${S.ZB_TRAIT_SHORT[kind][i]} ${i + 1}`); }
      });
    });
    if (matched < 15) fail(`only ${matched} of ScummVM's trait names are the site's words`);
  }
}

// ---- (d) written back -----------------------------------------------------
if (!same(S.zbSaveWrite(f), bytes)) fail('the save does not write back to its own bytes');
if (!same(S.zbSaveRosterWrite(who), whoBytes)) fail('the roster does not write back to its own bytes');
let seed = 1;
const noise = n => Uint8Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
for (const L of S.ZB_SAVE_LAYOUTS) {
  const b = noise(L.size), r = S.zbSaveRead(b);
  if (r.layout.name !== L.name || !same(S.zbSaveWrite(r), b)) fail(`noise in the ${L.name} layout does not write back`);
}
// A field changed is that field's bytes changed: the cliffs at level 2 too.
const g = S.zbSaveRead(bytes); g.pageLevelFlags[3] |= 2;
const w = S.zbSaveWrite(g), diff = [...w].map((v, i) => v !== bytes[i] ? i : -1).filter(i => i >= 0);
eq(diff, [0x56], 'the bytes a level-flag change changes');

const names = f.where.map(z => z.name).join(', ');
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log(`ok: ${offsetsChecked} field offsets over 4 layouts as zoombini_state.h has them; "${who[0].name}" (${who[0].file}, ${f.layout.name}) at the map, the Allergic Cliffs crossed at level 1 by all, the band given up in the caves and its 16 back on the isle (${names}); nothing at the camps or in town; traits in the site's order; save, roster and noise in 4 layouts write back byte for byte`);
