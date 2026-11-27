// Mountain Rescue's Zoombinis as the 1996 game draws them, in headless
// Chrome: both discs open, then each .anm in the preview's menu
// (page-mountain.js mountainLookView), counting the pairs it plays and any
// error, and then the mod's button (mountainModView), whose zip is caught. SHOTS=<dir> saves a screenshot of each. Exits 1 on an error or a
// file with no pairs.
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';
import { serve, loadPage, findChrome, pageErrors } from './browser.mjs';
import { rangeServer } from './range_server.mjs';

const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue');
if (!fs.existsSync(path.join(MR, 'Zoombinis.iso'))) { console.log('SKIP: no Mountain Rescue image'); process.exit(0); }
if (!fs.existsSync(path.join(REF, 'disc', 'ZOOMBINI.ISO'))) { console.log('SKIP: no reference/disc/ZOOMBINI.ISO'); process.exit(0); }
const chrome = findChrome();
if (!chrome) { console.log('SKIP: no Chrome'); process.exit(0); }
const shots = process.env.SHOTS || null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const S = site({ files: ['js/zb-range.js'] });
const srv = await serve(), disc = await rangeServer(S, MR, ['Zoombinis.iso']);
let bad = 0;
const r = await loadPage(srv.base + 'index.html?src=reference/disc/ZOOMBINI.ISO', "location.hash === '#journey' && typeof mountainTryFiles === 'function'", 120000, {
  chrome, device: { name: 'desktop', width: 1280, height: 900 },
  then: async p => {
    const out = [];
    await p.evaluate(`(async () => mountainTryFiles([await zbRangeOpen('${disc.base}Zoombinis.iso', 'Zoombinis.iso')]))()`);
    await p.evaluate("localStorage.setItem('snoidgrimoire-edition', '2001'); location.hash = '#scenario/snoids'; true");
    const menu = '[...document.querySelectorAll(\'#view select[data-k="file"]\')].pop()';
    let files = null;
    for (let i = 0; i < 120 && !files; i++) { await new Promise(res => setTimeout(res, 250)); files = await p.evaluate(`(() => { const s = ${menu}; return s ? [...s.options].map(o => o.value) : null; })()`); }
    if (!files) return [['menu', false, 'no file menu']];
    for (const f of files) {
      await p.evaluate(`(() => { const s = ${menu}; s.value = ${JSON.stringify(f)}; s.dispatchEvent(new Event('change')); return true; })()`);
      let state = null;
      for (let i = 0; i < 160; i++) {
        await new Promise(res => setTimeout(res, 250));
        state = await p.evaluate(`(() => { const s = ${menu}, box = s.closest('div').parentNode, bad = box.querySelector('.bad'), note = box.querySelector('p.note');
          return { bad: bad ? bad.textContent : null, cells: box.querySelectorAll('canvas.px').length / 2, note: note ? note.textContent : '',
            labels: [...box.querySelectorAll('span.note')].map(e => e.textContent), missing: [...box.querySelectorAll('div p.note')].map(e => e.textContent).filter(t => /not open/.test(t)) }; })()`);
        if (state.bad || (state.cells && !/Reading/.test(state.note))) break;
      }
      await new Promise(res => setTimeout(res, 600));
      out.push([f, !state.bad && state.cells > 0, `${state.cells} pairs ${state.bad || ''}\n    ${state.note}\n    ${state.labels.slice(0, 8).join(' | ')}${state.missing.length ? '\n    ' + state.missing.join(' | ') : ''}`]);
      if (shots) await p.evaluate(`${menu}.scrollIntoView(); true`), await p.shot(path.join(shots, f.replace(/[/.]+/g, '-') + '.png'));
    }
    // the mod for the game (mountainModView): the button saves a zip of
    // zoombini2.exe and the 76 sets, caught here in place of the download
    await p.evaluate("window.dlBlob = (blob, name) => { window.modSaved = { size: blob.size, name }; }; document.querySelector('[data-make-mod]').click(); true");
    let saved = null, note = '';
    for (let i = 0; i < 480 && !saved; i++) {
      await new Promise(res => setTimeout(res, 250));
      [saved, note] = await p.evaluate("[window.modSaved || null, (document.querySelector('[data-mod-state]') || {}).textContent || '']");
      if (!saved && /not|error|no /i.test(note)) break;
    }
    out.push(['the mod', !!saved && saved.size > 30e6 && /77 files/.test(note), saved ? `${saved.name}, ${(saved.size / 1e6).toFixed(1)} MB, ${note}` : `nothing saved: ${note}`]);
    return out;
  },
});
for (const e of pageErrors(r.console)) { bad++; console.log(`FAIL ${e.text} ${e.where || ''}`); }
if (!r.more) { bad++; console.log('FAIL: the page did not load'); }
else for (const [what, ok, extra] of r.more) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what} ${extra ?? ''}`); }
srv.close(); disc.close();
process.exit(bad ? 1 : 0);
