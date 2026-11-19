// The remake's Zoombini parts drawn as the page draws them
// (ZMB_CharacterLibrary.swf), each clip at one frame, saved as PNG with the
// origin's place, for the screenshot reader to be fitted against.
//
//   node utilities/remake_parts.mjs APP OUT [frame|label]
//
// OUT receives <clip>.png and parts.json: { clip: { x, y, w, h } }, x and y the
// origin's pixel in the PNG, and the clips' stretches.
import fs from 'node:fs';
import path from 'node:path';
import { site } from './load.mjs';
import { serve, loadPage, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const [APP, OUT, at = '0'] = process.argv.slice(2);
if (!APP || !OUT) { console.log('node utilities/remake_parts.mjs APP OUT [frame|label]'); process.exit(1); }
const S = site();
const paths = (function walk(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : S.zbAddressIndexWants(rel + d.name) ? [rel + d.name] : []);
})(APP);
const index = await S.zbAddressIndexBuild(await Promise.all(paths.map(async p => ({ path: p, file: new File([await fs.openAsBlob(path.join(APP, p))], path.basename(p)) }))));
const remote = await rangeServer(S, APP, paths, index);
fs.mkdirSync(OUT, { recursive: true });
const srv = await serve();
const r = await loadPage(srv.base + 'index.html', 'typeof remakeOpenAddress === "function" && document.readyState === "complete"', 120000, {
  then: async ({ evaluate }) => {
    await evaluate(`(async () => { await remakeOpenAddress(${JSON.stringify(remote.base)}); await remakeCatalog(); await remakeLayouts(); })()`);
    const out = await evaluate(`(async () => {
      const path = 'swf/zoombinis/zmb_characterlibrary.swf', swf = await remakeSwf(path);
      const names = Object.keys(swf.byClass).filter(n => /^zmb_feet_\\d(_(head|eyes_\\d|nose_\\d|hair_\\d))?$/.test(n));
      const info = {}, pngs = {};
      for (const n of names) {
        const clip = swf.byClass[n], st = remakeClipStretches(clip);
        const at = ${JSON.stringify(at)}, s = st.find(x => x.name === at);
        const frame = s ? s.from : Math.min(+at || 0, clip.frames.length - 1);
        const steps = await remakeClipSteps(path, swf, [n], frame), box = remakeStepsBox(steps);
        if (!box) continue;
        const x0 = Math.floor(box.x0) - 1, y0 = Math.floor(box.y0) - 1, w = Math.ceil(box.x1) - x0 + 1, h = Math.ceil(box.y1) - y0 + 1;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        remakeDrawSteps(c.getContext('2d'), steps, [1, 0, 0, 1, -x0, -y0]);
        info[n] = { x: -x0, y: -y0, w, h, frame, stretches: st };
        pngs[n] = c.toDataURL('image/png');
      }
      return { info, pngs };
    })()`);
    for (const [n, url] of Object.entries(out.pngs)) fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, 'parts.json'), JSON.stringify(out.info, null, 1));
    console.log(`${Object.keys(out.info).length} parts`);
  },
});
for (const l of pageErrors(r.console)) console.log('page:', l.text);
remote.close();
process.exit(0);
