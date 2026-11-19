// Every scene of a remake build drawn as the page draws it (#scenario/places/n),
// each saved as a PNG, for the screenshot reader to be fitted against. The
// build is served as an address (range_server.mjs), as the page reads it.
//
//   node utilities/remake_scenes.mjs APP OUT [n ...]
//
// APP is the build's app folder (the one its index was made from); OUT is a
// folder for level<n>.png.
import fs from 'node:fs';
import path from 'node:path';
import { site } from './load.mjs';
import { serve, loadPage, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const [APP, OUT, ...only] = process.argv.slice(2);
if (!APP || !OUT) { console.log('node utilities/remake_scenes.mjs APP OUT [n ...]'); process.exit(1); }
const S = site();
const paths = (function walk(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : S.zbAddressIndexWants(rel + d.name) ? [rel + d.name] : []);
})(APP);
const index = await S.zbAddressIndexBuild(await Promise.all(paths.map(async p => ({ path: p, file: new File([await fs.openAsBlob(path.join(APP, p))], path.basename(p)) }))));
const remote = await rangeServer(S, APP, paths, index);
fs.mkdirSync(OUT, { recursive: true });
const srv = await serve();
const r = await loadPage(srv.base + 'index.html', 'typeof remakeOpenAddress === "function" && document.readyState === "complete"', 120000, {
  device: { width: 1600, height: 1000, scale: 1 },
  then: async ({ evaluate }) => {
    await evaluate(`(async () => { await remakeOpenAddress(${JSON.stringify(remote.base)}); document.getElementById('start').hidden = true; document.getElementById('views').hidden = false; })()`);
    const count = await evaluate('(async () => { await remakeCatalog(); return REMAKE_CATALOG.scenes.length; })()');
    const wanted = only.length ? only.map(Number) : [...Array(count).keys()];
    for (const n of wanted) {
      await evaluate(`location.hash = '#scenario/places/${n}'`);
      const t = Date.now();
      let url = null;
      while (Date.now() - t < 180000) {
        url = await evaluate(`(() => { const c = document.querySelector('#view canvas.scene'); return c && !document.querySelector('#view p.reading') ? c.toDataURL('image/png') : null; })()`);
        if (url) break;
        await new Promise(r => setTimeout(r, 300));
      }
      const note = await evaluate(`[...document.querySelectorAll('#view p.note')].map(p => p.textContent).join(' ')`);
      if (!url) { console.log(`level${n}: not drawn. ${note}`); continue; }
      fs.writeFileSync(path.join(OUT, `level${n}.png`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`level${n}: ${Date.now() - t} ms ${note}`);
    }
  },
});
for (const l of pageErrors(r.console)) console.log('page:', l.text);
console.log(`${remote.sent.requests} requests, ${Math.round(remote.sent.bytes / 1e6)} MB`);
remote.close(); srv.close && srv.close();
process.exit(0);
