// A puzzle's solutions and strategy drawn, as the page draws them, to look
// at without the page: an HTML file of the diagrams and a screenshot of it
// in headless Chrome.
//
//   node utilities/diagram_shot.mjs KEY LEVEL SEED [SIZE] [OUT] [--knows=form] [--band=CODE] [--steps=N]
//
// KEY is the archive (BRIDGE); the band is dealt from SEED (or given as a
// band code, four digits a Zoombini); OUT is a folder (default: the
// system's temporary one). It writes <key>-<level>-<seed>.html and .png
// there and prints the solutions' and the strategy's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { site, archiveBytes } from './load.mjs';
import { findChrome, loadPage } from './browser.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flag = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const [key, levelS, seedS, sizeS, outS] = args;
if (!key) { console.log('node utilities/diagram_shot.mjs KEY LEVEL SEED [SIZE] [OUT] [--knows=form] [--band=CODE] [--steps=N]'); process.exit(1); }
const level = +levelS || 1, seed = +seedS || 1, size = +sizeS || 16, out = outS || os.tmpdir();
const S = site();
const opened = new Map();
const open = name => { if (!opened.has(name)) opened.set(name, S.openMohawk(archiveBytes(name))); return opened.get(name); };
const P = S.ZB_PUZZLES.get(key.toUpperCase());
if (!P) { console.log(`no puzzle ${key}`); process.exit(1); }
const K = key.toUpperCase();

let band, state, dealt;
if (flag('band')) {
  band = S.zbBandFromCode(flag('band'));
  const rnd = S.zbRandom(seed);
  dealt = P.deal(level, band, rnd, {}, P.archive ? open(P.archive) : undefined);
} else {
  dealt = S.zbDealAt(K, level, seed, size, open);
  band = dealt.band;
}
state = dealt.state;
const arc = P.archive ? open(P.archive) : undefined;

// The sprites, as PNG data URLs.
const sheet = S.zbSnoidSheet(open('ZOOMBINI'));
const pal = S.zbPalette(S.parsePaletteResource(open('FLEENS').get('SHPL', 300), 'SHPL'));
const url = async img => 'data:image/png;base64,' + Buffer.from(await S.encodeIndexedPNG(img.width, img.height, img.pixels, pal, 0)).toString('base64');
const zs = await Promise.all(band.map(async z => { const im = S.zbZoombiniImage(sheet, z); return { url: await url(im), width: im.width, height: im.height, ox: im.ox, oy: im.oy }; }));
const traits = new Map();
for (const k of S.ZB_TRAIT_KINDS) for (let v = 1; v <= 5; v++) { const im = S.zbTraitImage(sheet, k, v); traits.set(`${k}:${v}`, { url: await url(im), width: im.width, height: im.height, ox: 0, oy: 0 }); }
const sprites = { zoombini: i => zs[i] || null, trait: (k, v) => traits.get(`${k}:${v}`) || null };

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sections = [];
let height = 120;
const add = (title, lines, d) => {
  sections.push(`<h2>${esc(title)}</h2>${lines.map(l => `<p>${esc(l)}</p>`).join('')}${d ? S.zbDiagramSvg(d, sprites) : ''}`);
  height += 60 + lines.length * 22 + (d ? d.height : 0);
  console.log(`\n== ${title}\n${lines.join('\n')}`);
};
add(`${K} level ${level}, seed ${seed}, band ${S.zbBandCode(band)}`, [...dealt.setup, ...dealt.answer], null);
const t0 = Date.now();
const sol = P.solve(level, band, state, arc, {});
add(`Known: ${sol.most} of ${band.length} can cross${sol.exact ? '' : ' (the best found)'}${sol.ways != null ? `, ${sol.ways} way${sol.ways === 1 ? '' : 's'}` : ''} (${Date.now() - t0} ms)`, sol.notes || [], null);
sol.solutions.slice(0, 3).forEach((s, k) => add(`${k ? 'Solution' : 'Simplest'}: ${s.title}`, s.steps, s.diagram));
if (P.strategy) {
  const t1 = Date.now();
  const st = P.strategy(level, band, arc, { knows: flag('knows'), state });
  add(`Unknown: ${st.sure} of ${band.length} sure, over ${st.hypotheses} hypotheses${st.exact ? '' : ' (a bound)'} (${Date.now() - t1} ms)`, st.notes || [], null);
  let nd = st.root;
  for (let k = 0; k < (+flag('steps') || 3) && nd; k++) {
    add(`Step ${k + 1}: ${nd.move}`, nd.outcomes.map(o => '→ ' + o.label), nd.diagram || null);
    nd = nd.outcomes.length ? nd.outcomes[0].next() : null;
  }
  if (nd) add(`Then: ${nd.move}`, [], nd.diagram || null);
}
const html = `<!doctype html><meta charset="utf-8"><style>body{background:#0e131c;color:#d9dfe8;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;margin:16px;width:920px}h2{font-size:15px;margin:18px 0 4px}p{margin:2px 0;color:#b8c2d0}svg{display:block;margin:8px 0;background:#070a10;max-width:100%;height:auto}</style>${sections.join('')}`;
const base = path.join(out, `${K.toLowerCase()}-${level}-${seed}`);
fs.writeFileSync(base + '.html', html);
const chrome = findChrome();
if (chrome) {
  await loadPage(pathToFileURL(base + '.html').href, "document.readyState === 'complete'", 20000, {
    chrome, device: { width: 960, height: Math.min(16000, height), scale: 1 }, then: async p => { await new Promise(r => setTimeout(r, 300)); await p.shot(base + '.png'); } });
  console.log(`\n${base}.png`);
} else console.log(`\n${base}.html (no Chrome for a picture)`);
