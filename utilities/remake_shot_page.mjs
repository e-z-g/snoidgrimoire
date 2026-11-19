// The remake's Screenshot pane run in headless Chrome on PNG files, with a
// build served as an address (range_server.mjs). Prints what the pane shows
// for each, and with OUT saves a picture of the pane.
//
//   node utilities/remake_shot_page.mjs APP a.png ... [--out=DIR]
import fs from 'node:fs';
import path from 'node:path';
import { site } from './load.mjs';
import { serve, loadPage, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
const [APP, ...shots] = args;
if (!APP || !shots.length) { console.log('node utilities/remake_shot_page.mjs APP a.png ... [--out=DIR]'); process.exit(1); }
const S = site();
const paths = (function walk(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : S.zbAddressIndexWants(rel + d.name) ? [rel + d.name] : []);
})(APP);
const index = await S.zbAddressIndexBuild(await Promise.all(paths.map(async p => ({ path: p, file: new File([await fs.openAsBlob(path.join(APP, p))], path.basename(p)) }))));
const remote = await rangeServer(S, APP, paths, index);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const srv = await serve();
const r = await loadPage(srv.base + 'index.html', 'typeof remakeOpenAddress === "function" && document.readyState === "complete"', 120000, {
  device: { width: 1400, height: 1000, scale: 1 },
  then: async ({ evaluate, shot }) => {
    await evaluate(`(async () => { await remakeOpenAddress(${JSON.stringify(remote.base)}); document.getElementById('start').hidden = true; document.getElementById('views').hidden = false; location.hash = '#scenario/screenshot'; })()`);
    for (const p of shots) {
      const t = Date.now();
      const b64 = fs.readFileSync(p).toString('base64');
      await evaluate(`(() => { const s = atob(${JSON.stringify(b64)}), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); REMAKE_SHOT_LAST = null; shotTake(new File([b], ${JSON.stringify(path.basename(p))}, { type: 'image/png' })); })()`);
      while (Date.now() - t < 900000) {
        if (await evaluate('!!REMAKE_SHOT_LAST && !SHOT_BUSY && !!document.querySelector("#shotOut h2, #shotOut p.bad")')) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log(`${path.basename(p)} (${Math.round((Date.now() - t) / 1000)} s)`);
      console.log(await evaluate(`[...document.querySelectorAll('#shotOut p, #shotOut tr')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()).join('\\n')`));
      if (OUT) await shot(path.join(OUT, path.basename(p, '.png') + '-pane.png'));
    }
  },
});
for (const l of pageErrors(r.console)) console.log('page:', l.text);
console.log(`${remote.sent.requests} requests, ${Math.round(remote.sent.bytes / 1e6)} MB`);
remote.close();
process.exit(0);
