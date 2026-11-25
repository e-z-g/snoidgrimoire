// Island Odyssey in the page, in headless Chrome: its CD image opened from
// a server that answers range requests, as a dropped image is read a piece
// at a time, then every view of Data, Scenario and Components it has, at a
// desktop's width and a phone's. SHOTS=<dir> saves a screenshot of each.
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';
import { serve, loadPage, findChrome, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const IO = process.env.ZB_ODYSSEY || path.join(REF, 'island-odyssey');
if (!fs.existsSync(path.join(IO, 'ZoombinisIO.iso'))) { console.log('SKIP: no Island Odyssey image'); process.exit(0); }
const chrome = findChrome();
if (!chrome) { console.log('SKIP: no Chrome'); process.exit(0); }
const shots = process.env.SHOTS || null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const S = site({ files: ['js/zb-range.js'] });
const srv = await serve(), disc = await rangeServer(S, IO, ['ZoombinisIO.iso']);
let bad = 0;
const open1 = "(() => { const d = document.querySelector('#view details'); if (d && !d.open) d.open = true; return true; })()";
const VIEWS = [
  ['#odyssey', "/Places/.test(document.getElementById('view').textContent)"],
  ['#odyssey/rsc/z3a2.bul', "!!document.querySelector('#view .card canvas') && /37 entries/.test(document.getElementById('view').textContent)"],
  ['#odyssey/rsc/z3a2.bul/12435.ao', "/13 frames of 16-bit/.test(document.getElementById('view').textContent) && !!document.querySelector('#view canvas')"],
  ['#odyssey/rsc/z3options.bul/436.ao', "/8-bit color with the palette/.test(document.getElementById('view').textContent) && !!document.querySelector('#view canvas')"],
  ['#odyssey/rsc/z3a2.bul/12434.wav', "!!document.querySelector('#view audio')"],
  ['#odyssey/rsc/z3a5.bul/18502.LIPS', "/40 mouth shapes, for the voice/.test(document.getElementById('view').textContent)"],
  ['#odyssey/rsc/z3bkgd.bul/12000.jpg', "!!document.querySelector('#view img')"],
  ['#odyssey/scripts/z3a2.xml', "/Tum-Tum/.test(document.getElementById('view').textContent)"],
  ['#scenario/places', "document.querySelectorAll('#view tr').length === 11"],
  ['#scenario/places/z3a2', "!!document.querySelector('#view img') && /Tum-Tum/.test(document.getElementById('view').textContent)"],
  ['#odyssey/scripts/z3a2.mps', "/procedure pSetupPuzzle/.test(document.getElementById('view').textContent)"],
  ['#scenario/snoids', "(() => { const set = (k, v) => { const s = document.querySelector(`#view select[data-k=${k}]`); if (s && s.value !== v) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } }; set('doing', 'stand'); set('fidget', '0.0'); return !!document.querySelector('#view canvas') && /fidget 1, every 5 to 7 s/.test(document.querySelector('#view .tools').textContent) && /1930/.test(document.getElementById('view').textContent); })()"],
  ['#scenario/snoids', "!!document.querySelector('#view canvas') && /picks a block of 60/.test(document.getElementById('view').textContent) && /hair/.test(document.querySelector('#view .tools').textContent)"],
  ['#scenario/puzzles', "document.querySelectorAll('#view h2').length === 7 && /kMaxTurnsList\\.6/.test(document.getElementById('view').textContent)"],
  ['#components/sheets', open1 + " && !!document.querySelector('#view .card canvas')"],
  ['#components/backgrounds', "!!document.querySelector('#view .card img')"],
  ['#components/sounds', open1 + " && !!document.querySelector('#view button.play')"],
  ['#components/music', "document.querySelectorAll('#view button.play').length === 14"],
  ['#components/text', "!!document.querySelector('#view .ids a')"],
];
for (const dev of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844, scale: 2, mobile: true }]) {
  const r = await loadPage(srv.base + 'index.html', "typeof odysseyTryFiles === 'function' && !document.getElementById('start').hidden === true", 60000, {
    chrome, device: dev,
    then: async p => {
      const out = [];
      const opened = await p.evaluate(`(async () => odysseyTryFiles([await zbRangeOpen('${disc.base}ZoombinisIO.iso', 'ZoombinisIO.iso')]))()`);
      out.push(['open', opened, await p.evaluate('ODYSSEY.files.size')]);
      for (const [hash, until] of VIEWS) {
        await p.evaluate(`localStorage.setItem('snoidgrimoire-edition', '2002'); location.hash = '${hash}'; true`);
        let ok = false;
        for (let i = 0; i < 160 && !ok; i++) { await new Promise(res => setTimeout(res, 250)); ok = !!(await p.evaluate(until)); }
        out.push([hash, ok, await p.evaluate("document.getElementById('views').textContent")]);
        if (shots) await p.shot(path.join(shots, `${dev.name}-${hash.replace(/[#/.]+/g, '-').replace(/^-/, '')}.png`));
      }
      return out;
    },
  });
  for (const e of pageErrors(r.console)) { bad++; console.log(`FAIL ${dev.name}: ${e.text} ${e.where || ''}`); }
  if (!r.more) { bad++; console.log(`FAIL ${dev.name}: the page did not load`); continue; }
  for (const [what, ok, extra] of r.more) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${dev.name} ${what} ${extra ?? ''}`); }
}
console.log(`${disc.sent.requests} range requests, ${(disc.sent.bytes / 1e6).toFixed(1)} MB of the image read`);
srv.close(); disc.close();
process.exit(bad ? 1 : 0);
