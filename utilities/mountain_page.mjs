// Mountain Rescue in the page, in headless Chrome: its CD image opened
// from a server that answers range requests, as a dropped image is read a
// piece at a time, then every view of Data, Scenario and Components it has,
// at a desktop's width and a phone's. SHOTS=<dir> saves a screenshot of
// each. Prints what each view shows and any error, and exits 1 on one.
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';
import { serve, loadPage, findChrome, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue');
if (!fs.existsSync(path.join(MR, 'Zoombinis.iso'))) { console.log('SKIP: no Mountain Rescue image'); process.exit(0); }
const chrome = findChrome();
if (!chrome) { console.log('SKIP: no Chrome'); process.exit(0); }
const shots = process.env.SHOTS || null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const S = site({ files: ['js/zb-range.js'] });
const srv = await serve(), disc = await rangeServer(S, MR, ['Zoombinis.iso']);
let bad = 0;
const VIEWS = [
  ['#mountain', "!!document.querySelector('#view table')"],
  ['#mountain/bmp/aquacube', "/Folders/.test(document.getElementById('view').textContent)"],
  ['#mountain/bmp/zombis/littlezomb.anm', "document.querySelectorAll('#view select').length === 5 && !!document.querySelector('#view canvas')"],
  ['#mountain/bmp/aquacube/ball.rb', "/40 × 40/.test(document.getElementById('view').textContent)"],
  ['#mountain/bmp/aquacube/fleen/marche/f1co66.an', "/11 frames/.test(document.getElementById('view').textContent)"],
  ['#mountain/bmp/boolies/b_boolies1.pat', "/4 legs/.test(document.getElementById('view').textContent)"],
  ['#mountain/sounds/music/zmr-mapscreen.wav', "!!document.querySelector('#view audio') && /22,050 Hz/.test(document.getElementById('view').textContent)"],
  ['#scenario/places', "document.querySelectorAll('#view .card').length === 13"],
  ['#scenario/places/aquacube', "!!document.querySelector('#view canvas') && /Aqua Cube/.test(document.getElementById('crumbs').textContent)"],
  ['#scenario/puzzles', "document.querySelectorAll('#view h2').length === 9"],
  ['#scenario/snoids', "!!document.querySelector('#view canvas')"],
  ['#components/pictures', "(() => { const d = document.querySelector('#view details'); if (d && !d.open) d.open = true; return !!document.querySelector('#view .card canvas'); })()"],
  ['#components/sheets', "(() => { const d = document.querySelector('#view details'); if (d && !d.open) d.open = true; return !!document.querySelector('#view .card canvas'); })()"],
  ['#components/sounds', "(() => { const d = document.querySelector('#view details'); if (d && !d.open) d.open = true; return !!document.querySelector('#view button.play'); })()"],
  ['#components/music', "document.querySelectorAll('#view button.play').length === 16"],
  ['#components/text', "(() => { const d = document.querySelector('#view details'); if (d && !d.open) d.open = true; return !!document.querySelector('#view .ids a'); })()"],
];
for (const dev of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844, scale: 2, mobile: true }]) {
  const r = await loadPage(srv.base + 'index.html', "typeof mountainTryFiles === 'function' && !document.getElementById('start').hidden === true", 60000, {
    chrome, device: dev,
    then: async p => {
      const out = [];
      const opened = await p.evaluate(`(async () => mountainTryFiles([await zbRangeOpen('${disc.base}Zoombinis.iso', 'Zoombinis.iso')]))()`);
      out.push(['open', opened, await p.evaluate('MOUNTAIN.files.size')]);
      for (const [hash, until] of VIEWS) {
        await p.evaluate(`localStorage.setItem('snoidgrimoire-edition', '2001'); location.hash = '${hash}'; true`);
        let ok = false;
        for (let i = 0; i < 120 && !ok; i++) { await new Promise(res => setTimeout(res, 250)); ok = !!(await p.evaluate(until)); }
        const bar = await p.evaluate("document.getElementById('views').textContent");
        out.push([hash, ok, bar]);
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
