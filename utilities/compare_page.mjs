// Both games open in headless Chrome: the 1996 CD image from reference/ and
// a remake build served as an address. Tries the bar's picker, Both, and a
// screenshot of each game drawn in the other, and prints what the page
// shows. With OUT it saves a picture of each step.
//
//   node utilities/compare_page.mjs APP shot1996.png shotRemake.png [--out=DIR]
import fs from 'node:fs';
import path from 'node:path';
import { site } from './load.mjs';
import { serve, loadPage, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
const [APP, SHOT96, SHOT15] = args;
if (!APP || !SHOT96 || !SHOT15) { console.log('node utilities/compare_page.mjs APP shot1996.png shotRemake.png [--out=DIR]'); process.exit(1); }
const S = site();
const paths = (function walk(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : S.zbAddressIndexWants(rel + d.name) ? [rel + d.name] : []);
})(APP);
const index = await S.zbAddressIndexBuild(await Promise.all(paths.map(async p => ({ path: p, file: new File([await fs.openAsBlob(path.join(APP, p))], path.basename(p)) }))));
const remote = await rangeServer(S, APP, paths, index);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const srv = await serve();
const wait = async (evaluate, cond, ms = 600000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await evaluate(cond)) return true; await new Promise(r => setTimeout(r, 500)); }
  return false;
};
const r = await loadPage(srv.base + 'index.html?src=reference/disc/ZOOMBINI.ISO', "location.hash === '#journey' && typeof remakeOpenAddress === 'function'", 120000, {
  device: { width: 1400, height: 1000, scale: 1 },
  then: async ({ evaluate, shot }) => {
    const step = async (name, text) => {
      console.log(`-- ${name}: ${await evaluate('location.hash')}`);
      if (text) console.log(await evaluate(text));
      if (OUT) await shot(path.join(OUT, name + '.png'));
      // The drawing in the other game, whole.
      const url = OUT && await evaluate(`(() => { const c = document.querySelector('#shotOut > div:last-child canvas'); return c ? c.toDataURL('image/png') : null; })()`);
      if (url) fs.writeFileSync(path.join(OUT, name + '-drawn.png'), Buffer.from(url.split(',')[1], 'base64'));
    };
    await evaluate(`(async () => { await remakeOpenAddress(${JSON.stringify(remote.base)}); await remakeCatalog(); })()`);
    console.log(await evaluate(`ZB_PLACES.map(p => p.key + ' ' + zbSceneOfPlace(p.key)).join(', ')`));
    console.log(await evaluate(`zbTraitMap().then(m => JSON.stringify(m))`));
    const bar = `document.querySelector('#views').textContent`;
    await evaluate(`location.hash = '#scenario/places/BRIDGE'`);
    await wait(evaluate, `!!document.querySelector('#view h1')`, 60000);
    await step('1996-place', bar);
    await evaluate(`document.querySelector('[data-edition="2015"]').click()`);
    await wait(evaluate, `/^#scenario\\/places\\/\\d+$/.test(location.hash) && !document.querySelector('#view p.reading')`, 300000);
    await step('2015-place', `document.querySelector('#view h1').textContent`);
    await evaluate(`document.querySelector('[data-compare]').click()`);
    await wait(evaluate, `document.querySelectorAll('.compare > section').length === 2 && !document.querySelector('#view p.reading')`, 300000);
    await step('both-place', `[...document.querySelectorAll('.compare > section')].map(s => s.querySelector('h1') ? s.querySelector('h1').textContent : s.textContent.slice(0, 80)).join(' | ')`);
    await evaluate(`location.hash = '#components/palettes'`);
    await wait(evaluate, `document.querySelectorAll('.compare > section').length === 2`, 60000);
    await step('both-palettes', `[...document.querySelectorAll('.compare > section')].map(s => s.textContent.slice(0, 80)).join(' | ')`);
    await evaluate(`document.querySelector('[data-compare]').click()`);
    await evaluate(`document.querySelector('[data-edition="1996"]').click()`);
    await wait(evaluate, `!document.querySelector('.compare')`, 60000);
    const give = (p, last) => {
      const b64 = fs.readFileSync(p).toString('base64');
      return evaluate(`(() => { const s = atob(${JSON.stringify(b64)}), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); ${last} = null; shotTake(new File([b], ${JSON.stringify(path.basename(p))}, { type: 'image/png' })); })()`);
    };
    await evaluate(`location.hash = '#scenario/screenshot'`);
    await wait(evaluate, `!!document.getElementById('shotOut')`, 60000);
    await give(SHOT96, 'SHOT_LAST');
    await wait(evaluate, `!!SHOT_LAST && !SHOT_BUSY && !!document.querySelector('#shotOut h2, #shotOut p.bad')`);
    await evaluate(`[...document.querySelectorAll('#shotOut button')].find(b => /Draw in/.test(b.textContent)).click()`);
    await wait(evaluate, `!/Drawing/.test(document.getElementById('shotOut').lastElementChild.textContent)`, 300000);
    await step('1996-in-2015', `document.getElementById('shotOut').lastElementChild.textContent`);
    await evaluate(`document.querySelector('[data-edition="2015"]').click()`);
    await wait(evaluate, `zbEdition() === '2015' && !!document.getElementById('shotOut')`, 60000);
    await give(SHOT15, 'REMAKE_SHOT_LAST');
    await wait(evaluate, `!!REMAKE_SHOT_LAST && !SHOT_BUSY && !!document.querySelector('#shotOut h2, #shotOut p.bad')`, 900000);
    await evaluate(`[...document.querySelectorAll('#shotOut button')].find(b => /Draw in/.test(b.textContent)).click()`);
    await wait(evaluate, `!/Drawing/.test(document.getElementById('shotOut').lastElementChild.textContent)`, 300000);
    await step('2015-in-1996', `document.getElementById('shotOut').lastElementChild.textContent`);
  },
});
for (const l of pageErrors(r.console)) console.log('page:', l.text);
remote.close();
process.exit(0);
