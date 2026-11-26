// Cross-references and search (js/zb-xref.js, js/zb-search.js) over the
// whole disc:
//
//   - every reference leads to a resource that is there, both ways: what a
//     script cues, the sheet and points a snoid script draws with, a sheet's
//     REGS pair, a PATH's NODE, the pictures each palette colors;
//   - every resource the site reads (zbSiteReads) is on the disc, bar the
//     European map's (MAP), which the 1996 disc has too;
//   - the sheets paired with REGS by length match the snoids' pairs
//     (ZB_SNOID_KINDS) and the town's clock (tBMP 6000, REGS 6000), and
//     every pair is one-to-one;
//   - search finds a place, a puzzle's rule, a line of help and a resource
//     by name, and a query that matches nothing finds nothing.
import { site, archiveNames, archiveBytes, haveDisc } from './load.mjs';

let fails = 0, bad = 0;
const fail = m => { if (bad++ < 12) console.log('FAIL ' + m); fails++; };
if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
const archives = new Map(archiveNames().map(n => [n, S.openMohawk(archiveBytes(n))]));
const there = key => { const [n, t, id] = key.split('/'); const a = archives.get(n); return !!a && a.has(t === 'SND' ? '\0SND' : t, +id); };

const x = S.zbXref(archives);
let refs = 0;
for (const [from, list] of x.out) {
  if (!there(from)) fail(`${from} refers onwards but is not there`);
  for (const r of list) { refs++; if (!there(r.key)) fail(`${from} ${r.why} ${r.key}, which is not there`); }
}
// Each SHPL colors the tBMPs from its id on, as many as its second word: all
// 42 on the disc name at least one, and every one named is there.
let palettes = 0, colored = 0;
for (const [name, arc] of archives) for (const { id } of arc.list('SHPL')) {
  const p = S.parsePaletteResource(arc.get('SHPL', id), 'SHPL');
  palettes++;
  if (!(p.pictures >= 1)) fail(`${name} SHPL ${id} colors no picture`);
  for (let k = 0; k < p.pictures; k++) { if (!arc.has('tBMP', id + k)) fail(`${name} SHPL ${id} colors tBMP ${id + k}, which is not there`); else colored++; }
}
if (palettes !== 42) fail(`${palettes} SHPL on the disc, not 42`);
let backs = 0;
for (const list of x.back.values()) backs += list.length;
if (backs !== refs) fail(`${refs} references out, ${backs} back`);
const whys = {};
for (const list of x.out.values()) for (const r of list) { const w = r.why.replace(/ (a |the ).*$/, ''); whys[w] = (whys[w] || 0) + 1; }

const reads = S.zbSiteReads();
for (const r of reads) if (!there(r.key)) fail(`${r.by} reads ${r.key}, which is not there`);

// The sheets' REGS pairs, against the site's pairs for them.
const pairs = new Map();
for (const [n, a] of archives) for (const p of S.zbXrefSheetRegs(a)) pairs.set(`${n}/tBMP/${p.sheet}`, `${n}/REGS/${p.regs}`);
const expectedPairs = [...Object.values(S.ZB_SNOID_KINDS).map(K => [`${K.archive}/tBMP/${K.sheet}`, `${K.archive}/REGS/${K.regs}`]), ['TOWN/tBMP/6000', 'TOWN/REGS/6000']];
for (const [sheet, regs] of expectedPairs) if (pairs.get(sheet) !== regs) fail(`${sheet}'s points are ${pairs.get(sheet) || 'not found'}, not ${regs}`);
const used = new Map();
for (const [sheet, regs] of pairs) { if (used.has(regs)) fail(`${regs} has the points of ${used.get(regs)} and ${sheet}`); used.set(regs, sheet); }
let sheets = 0;
for (const [n, a] of archives) for (const { id } of a.list('tBMP')) if (S.zbXrefFrameCount(a, id) != null) sheets++;

// Search.
const docs = S.zbSearchDocs(archives);
const finds = (q, href, what) => { const r = S.zbSearch(docs, q); if (!r.hits.some(h => h.doc.href === href)) fail(`searching "${q}" does not find ${what} (${href})`); return r; };
finds('pizza pass', '#place=PIZZA', 'the place');
finds('allergic sneeze', '#solve=BRIDGE', 'the puzzle by its rule');
finds('zoombini tbmp 3000', '#ZOOMBINI/tBMP/3000', 'the sheet');
finds('fleens snd 4013', '#FLEENS/SND/4013', 'the sound');
const help = S.zbSearch(docs, 'Arno');
if (!help.hits.some(h => h.doc.kind === 'text' && /Pizza Pass/.test(h.doc.title))) fail('searching "Arno" does not find Pizza Pass’s help');
if (S.zbSearch(docs, 'qqzzxx').total) fail('a word on no page found something');

if (!fails) console.log(`${refs} references among ${archives.size} archives, every one there (${Object.entries(whys).map(([w, n]) => `${n} ${w}`).join(', ')}). ${reads.length} resources the site reads, all there. ${palettes} palettes coloring ${colored} pictures. ${pairs.size} of ${sheets} sheets paired with their REGS, the snoids' and the clock's as the site has them. ${docs.length} documents searched`);
process.exit(fails ? 1 : 0);
