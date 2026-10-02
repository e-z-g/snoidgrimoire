// index.html as a browser has it.
//
// Without a browser: every <script src> is there, none is a module and no
// js/ file imports or exports (the page must work from file://), and no
// top-level name is declared in two scripts -- they share one global scope,
// so the later would win and nothing would say so.
//
// In headless Chrome (utilities/browser.mjs), served over HTTP:
//   - the page loads with no console error or exception and shows its start;
//   - with the CD image from reference/ opened through ?src=, the map comes
//     up first with its sixteen places; a wheel step at a time onto Pizza
//     Pass takes the address into it (#place=PIZZA) with its picture drawn,
//     and steps back out take it back to the map; an address given while a
//     flight is under way takes over from it; the map's views by
//     address come up, a dealt puzzle among them, and every puzzle's
//     panel draws at every level with one dealt; all 22 archives are listed, and a view of every
//     resource type comes up with what it should show and no error -- on a
//     desktop window and a phone's;
//   - with WebGL (SwiftShader), #town stands you in Zoombiniville with all
//     80 things, 8 inhabitants and the clock; looking at the clock tower
//     names it; sway, red-cyan and Cardboard draw, and Cardboard's button
//     leaves it; the sliders empty the town and write the address; the
//     map's Zoombiniville links to it;
//   - on the phone, nothing is wider than the screen.
// SHOTS=<dir> keeps a screenshot of each view.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REF, pageScripts } from './load.mjs';
import { findChrome, serve, loadPage, pageErrors } from './browser.mjs';

let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };

// ---- without a browser ---------------------------------------------------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (/<script\b[^>]*type\s*=\s*["']?module/i.test(html)) fail('index.html has a module script');
const scripts = pageScripts();
const seen = new Map();
for (const src of scripts) {
  const file = path.join(ROOT, src);
  if (!fs.existsSync(file)) { fail(`${src} is not there`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  if (/^\s*(import|export)\s/m.test(text)) fail(`${src} imports or exports: it must be a classic script`);
  for (const m of text.matchAll(/^(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))/gm)) {
    const name = m[1] || m[2];
    if (seen.has(name) && seen.get(name) !== src) fail(`${name} is declared in both ${seen.get(name)} and ${src}`);
    seen.set(name, src);
  }
}
console.log(`${scripts.length} scripts, ${seen.size} top-level names, none declared twice`);

// ---- in a browser --------------------------------------------------------
const chrome = findChrome();
if (!chrome) { console.log('SKIP browser: no Chrome or Chromium ($CHROME, the PATH, /Applications)'); process.exit(fails ? 1 : 0); }
const shots = process.env.SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = await serve();
const describe = l => (l.where ? l.where + ' ' : '') + l.text.split('\n')[0].slice(0, 200);

// Each view, and what in it says it came up.
const panel = "document.getElementById('jpanel').textContent";
const VIEWS = [
  ['place=PIZZA', `/Pizza Pass/.test(document.getElementById('crumbs').textContent) && /Arno/.test(${panel}) && JPICS.get('PIZZA/5000') instanceof HTMLCanvasElement && !JMOVING`],
  ['place=TOWN&level=3', `/Zoombiniville/.test(${panel}) && JPICS.get('TOWN/1200') instanceof HTMLCanvasElement && !JMOVING`],
  ['journey&place=NET&level=4', `JVIEW.place === null && /tBMP 5001 in SHPL 5001/.test(${panel}) && document.getElementById('jlevel').value === '4'`],
  ['journey', `/Mountains of Despair/.test(${panel}) && JDRAWN.length === 16`],
  ['place=BRIDGE&level=2&deal=12345&band=11', `/The puzzle, level 2/.test(${panel}) && document.querySelectorAll('#jpanel .dealt table.band tr').length === 12 && !document.querySelector('#jpanel .bad') && !JMOVING`],
  // A puzzle taken apart: the answer known, and the strategy walked two steps in.
  ['solve=BRIDGE&level=2&deal=12345', `/of 16 can cross/.test(document.getElementById('spanel').textContent) && document.querySelectorAll('#sdiagram svg image').length >= 16 && document.querySelectorAll('.szb').length === 16 && !document.querySelector('#spanel .bad')`],
  ['solve=BRIDGE&level=3&deal=77&size=9&view=unknown&path=0.1', `/are sure to cross/.test(document.getElementById('spanel').textContent) && document.querySelectorAll('.walk .crumbs a').length === 3 && document.querySelector('#sdiagram svg') && !document.querySelector('#spanel .bad')`],
  // The scene: the place's picture with the band waiting, near and far off.
  ['solve=BRIDGE&level=1&deal=5&stage=scene', "document.querySelector('#sdiagram canvas.scene') && /waiting at Allergic Cliffs/.test(document.getElementById('scaption').textContent)"],
  ['solve=HOTEL&level=2&deal=5&stage=scene', "document.querySelector('#sdiagram canvas.scene') && /Hotel Dimensia/.test(document.getElementById('scaption').textContent)"],
  ['solve=MAZE2&level=3&deal=9&stage=scene', "document.querySelector('#sdiagram canvas.scene') && /Bubblewonder Abyss/.test(document.getElementById('scaption').textContent)"],
  ['solve=LILLY&level=1&deal=5&stage=scene', "document.querySelector('#sdiagram canvas.scene') && /off the screen/.test(document.getElementById('scaption').textContent)"],
  // Every puzzle solved and drawn in the page, both ways where it hides something.
  ['solve=CAVES&level=2&deal=7&size=9', `ZB_PUZZLES.size === 12 && [...ZB_PUZZLES.keys()].every(k => {
    const P = ZB_PUZZLES.get(k), arc = P.archive ? solveOpen(P.archive) : undefined;
    if (!P.solve || !P.form) return false;
    const d = zbDealAt(k, 2, 7, 9, solveOpen), sprites = solveSprites(d.band);
    const sol = P.solve(2, d.band, d.state, arc, { budget: 300 });
    if (!(sol.most >= 0) || !sol.solutions.length || !/<svg/.test(zbDiagramSvg(sol.solutions[0].diagram, sprites))) return false;
    if (!P.strategy) return true;
    const st = P.strategy(2, d.band, arc, { budget: 300, state: d.state });
    const node = st.root.outcomes.length ? st.root.outcomes[0].next() : st.root;
    return st.sure >= 0 && typeof node.move === 'string' && (!node.diagram || /<svg/.test(zbDiagramSvg(node.diagram, sprites)));
  })`],
  // Every puzzle's panel at every level, with one dealt, drawn without an error.
  ['journey&place=SMOKE', `ZB_PUZZLES.size === 12 && [...ZB_PUZZLES.keys()].every(k => [1, 2, 3, 4].every(l => {
    JVIEW.level = l; JVIEW.deal = { key: k, seed: 7 * l, size: [16, 9, 3][l % 3] };
    const h = puzzlePanel(k); return /class="dealt"/.test(h) && !/class="bad"/.test(h); }))`],
  // Grimoire's tabs: Scenario's panes and Components' galleries, across every archive.
  ['scenario/places', "document.querySelectorAll('#view table tr').length === 17 && document.querySelector('#views a.on').dataset.view === 'scenario'"],
  ['scenario/puzzles', "document.querySelectorAll('#view details.sec').length === 12"],
  ['scenario/snoids', "document.querySelectorAll('#view .trow canvas').length === 20 && document.querySelectorAll('#view .ids a').length >= 717"],
  ['scenario/town', "/Zoombiniville/.test(document.getElementById('view').textContent)"],
  ['components/pictures', "document.querySelectorAll('#view .card').length === 65 && document.querySelector('#view .card .pic canvas')"],
  ['components/sheets', "document.querySelectorAll('#view .card').length === 112 && document.querySelector('#views a.on').dataset.view === 'components'"],
  ['components/sounds', "document.querySelectorAll('#view button.play').length === 1333 && /voice, kind/.test(document.getElementById('view').innerHTML)"],
  ['components/music', "document.querySelectorAll('#view table tr').length === 37"],
  ['components/text', "document.querySelectorAll('#view details.sec').length === 53 && /the credits/.test(document.getElementById('view').textContent)"],
  ['components/palettes', "document.querySelectorAll('#view .palrow').length === 48"],
  ['components/cursors', "document.querySelectorAll('#view .card').length === 5"],
  ['components/scripts', "/snoid script/.test(document.getElementById('view').textContent)"],
  ['components/walks', "document.querySelectorAll('#view table tr').length === 10"],
  // Search, and a resource's references.
  ['search=arno', "/Pizza Pass/.test(document.getElementById('view').textContent) && document.querySelector('#views a.on') === null && document.getElementById('q').value === 'arno'"],
  ['ZOOMBINI/tBMP/3000', "document.querySelector('#view .xref') && /REGS 100/.test(document.querySelector('#view .xref').textContent) && /read by/.test(document.querySelector('#view .xref').textContent)"],
  ['FLEENS/SND/4013', "document.querySelector('#view .xref') && /cues/.test(document.querySelector('#view .xref').textContent)"],
  // An edit: the credits' first string rewritten, read back out of the rebuilt archive, listed under Changes, undone.
  ['ZOOMBINI/STRL/2900', "(() => { const b = document.getElementById('strEdit'); if (b) { b.click(); const t = document.querySelector('#view textarea'); t.value = 'Edited by a check'; document.getElementById('strApply').click(); } return /Edited by a check/.test(document.getElementById('view').textContent) && /edited/.test(document.querySelector('#view .sub').textContent) && openedArchive(ARCHIVES.get('ZOOMBINI')).list('STRL').length === 53 && parseStringList(openedArchive(ARCHIVES.get('ZOOMBINI')).get('STRL', 2900))[0] === 'Edited by a check'; })()"],
  ['changes', "/STRL 2900/.test(document.getElementById('view').textContent) && document.querySelector('[data-save=\"ZOOMBINI\"]') && (document.querySelector('#view [data-undo]').click(), true) && !EDITS.size"],
  // Replacements, each handed a file as a person would pick one, and read back out of the rebuilt archive.
  ['ZOOMBINI/tBMP/3000', `(() => {
    if (!window.__frame) {
      const cell = document.querySelector('#sheet .frame'); if (!cell) return false;
      cell.click();
      const f = decodeBitmapResource(openedArchive(ARCHIVES.get('ZOOMBINI')).get('tBMP', 3000)).frames[0];
      const c = document.createElement('canvas'); c.width = f.width; c.height = f.height;
      const g = c.getContext('2d'); g.translate(f.width, 0); g.scale(-1, 1); g.drawImage(document.querySelector('#sheet .frame canvas'), 0, 0);
      window.__frame = 'asked';
      c.toBlob(b => { const dt = new DataTransfer(); dt.items.add(new File([b], 'mirrored.png', { type: 'image/png' }));
        const input = [...document.querySelectorAll('#focus input[type=file]')][0]; input.files = dt.files; input.dispatchEvent(new Event('change')); });
      return false;
    }
    const e = EDITS.get('ZOOMBINI'), c = e && e.changes.get('tBMP/3000');
    if (!c) return false;
    const now = decodeBitmapResource(openedArchive(ARCHIVES.get('ZOOMBINI')).get('tBMP', 3000)).frames;
    const was = decodeBitmapResource(e.original.subarray(openMohawk(e.original).find('tBMP', 3000).offset, openMohawk(e.original).find('tBMP', 3000).offset + openMohawk(e.original).find('tBMP', 3000).size)).frames;
    const w = was[0].width, mirrored = now[0].pixels.every((v, i) => v === was[0].pixels[Math.floor(i / w) * w + (w - 1 - i % w)]);
    return mirrored && now.length === 890 && now.slice(1).every((f, k) => f.pixels.every((v, i) => v === was[k + 1].pixels[i])) && /frame 0 replaced/.test(c.what);
  })()`],
  ['FLEENS/SND/1000', `(() => {
    if (!window.__sound) {
      const input = document.querySelector('#view input[type=file]'); if (!input) return false;
      const pcm = new Uint8Array(11025).map((_, i) => 128 + Math.round(100 * Math.sin(i / 10)));
      const dt = new DataTransfer(); dt.items.add(new File([wavFromPcmBytes(pcm, 11025, 8, 1)], 'tone.wav', { type: 'audio/wav' }));
      input.files = dt.files; input.dispatchEvent(new Event('change')); window.__sound = 'asked';
      return false;
    }
    const e = EDITS.get('FLEENS'), c = e && e.changes.get('SND/1000');
    if (!c) return false;
    const w = parseMohawkWave(openedArchive(ARCHIVES.get('FLEENS')).get('\\0SND', 1000));
    return w.rate === 11025 && Math.abs(w.sampleCount - 11025) <= 1 && w.loopCount === 0xffff && /tone.wav/.test(c.what);
  })()`],
  ['PICKER/tBMP/4000', `(() => {
    if (!window.__pic) {
      const input = document.querySelector('#view input[type=file]'); if (!input) return false;
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const g = c.getContext('2d'); g.fillStyle = 'rgb(200,30,30)'; g.fillRect(0, 0, 64, 48);
      window.__pic = 'asked';
      c.toBlob(b => { const dt = new DataTransfer(); dt.items.add(new File([b], 'red.png', { type: 'image/png' })); input.files = dt.files; input.dispatchEvent(new Event('change')); });
      return false;
    }
    const e = EDITS.get('PICKER');
    if (!e || !e.changes.get('tBMP/4000')) return false;
    const f = decodeTbmp(openedArchive(ARCHIVES.get('PICKER')).get('tBMP', 4000));
    return f.width === 64 && f.height === 48 && new Set(f.pixels).size === 1 && f.pixels[0] >= 10 && f.pixels[0] <= 245 && /64 × 48 where it was 640 × 480/.test(document.getElementById('view').textContent + e.changes.get('tBMP/4000').what);
  })()`],
  ['changes', "/frame 0 replaced/.test(document.getElementById('view').textContent) && /tone.wav/.test(document.getElementById('view').textContent) && (() => { for (let n = 0; EDITS.size && n < 10; n++) { const a = document.querySelector('#view [data-undo$=\"||\"]'); if (!a) break; a.click(); } return !EDITS.size; })()"],
  // The recolour maker: Shaggy hair, purples into reds, put in by its own buttons and read back, then undone.
  ['mods', `(() => {
    if (!window.__rc) {
      const to = document.querySelector('[data-rto=reds]'); if (!to) return false;
      to.click(); document.getElementById('rcApply').click(); window.__rc = 'asked';
      return false;
    }
    const c = EDITS.get('ZOOMBINI') && EDITS.get('ZOOMBINI').changes.get('tBMP/3000');
    if (!c) return false;
    const f = decodeBitmapResource(openedArchive(ARCHIVES.get('ZOOMBINI')).get('tBMP', 3000)).frames;
    const shaggy = f.slice(22, 54).flatMap(x => [...x.pixels]);
    return /hair 1 \\(Shaggy\\): purples into reds/.test(c.what) && shaggy.some(v => v >= 38 && v <= 40) && !shaggy.some(v => v >= 21 && v <= 23)
      && EDITS.get('PICKER').changes.has('tBMP/4400') && document.querySelectorAll('#rcShow canvas').length === 2;
  })()`],
  ['changes', "/purples into reds/.test(document.getElementById('view').textContent) && (() => { for (let n = 0; EDITS.size && n < 10; n++) { const a = document.querySelector('#view [data-undo$=\"||\"]'); if (!a) break; a.click(); } return !EDITS.size; })()"],
  // The Fleen-parts mod, green, with the installed EXE, put in from Mods and read back, then undone.
  ['mods', `(() => {
    if (!window.__mod) {
      if (!document.getElementById('modApply')) return false;
      window.__mod = 'asked';
      fetch('reference/zombs-lair/HDD/ZOOMBINI/ZOOMBINI.EXE').then(r => r.arrayBuffer()).then(b => {
        MOD_EXE = { name: 'ZOOMBINI.EXE', bytes: new Uint8Array(b) }; MOD_FLEEN.green = true; modFleenApply(); renderMods(); window.__mod = 'done';
      });
      return false;
    }
    if (window.__mod !== 'done') return false;
    const z = EDITS.get('ZOOMBINI'), p = EDITS.get('PICKER');
    return z && ['tBMP/3000', 'tBMP/3100', 'tBMP/3200', 'REGS/100'].every(k => z.changes.has(k)) && p && p.changes.has('tBMP/4400') && p.changes.has('tBMP/4300')
      && EXE_EDIT && EXE_EDIT.bytes.length === MOD_EXE.bytes.length && /As the archive draws them now:/.test(document.getElementById('modShow').textContent)
      && document.querySelectorAll('#modShow canvas').length === 5 && openedArchive(ARCHIVES.get('ZOOMBINI')).list('tBMP').length === 6;
  })()`],
  ['changes', "/Fleen parts, lime green/.test(document.getElementById('view').textContent) && document.getElementById('saveExe') && (() => { for (let n = 0; EDITS.size && n < 10; n++) { const a = document.querySelector('#view [data-undo$=\"||\"]'); if (!a) break; a.click(); } document.querySelector('#view [data-exe-undo]').click(); return !EDITS.size && !EXE_EDIT; })()"],
  // A saved game: the test one, opened as a person would, its band and places shown, then its roads on the map.
  ['saves', `(() => {
    if (!window.__save) {
      const input = document.getElementById('saveFiles'); if (!input) return false;
      window.__save = 'asked';
      Promise.all(['ZOOM0000.TXT', 'ZOOMBINI.WHO'].map(n => fetch('reference/saves/test-2026-10-01/' + n).then(r => r.arrayBuffer()).then(b => new File([b], n)))).then(fs => {
        const dt = new DataTransfer(); fs.forEach(f => dt.items.add(f)); input.files = dt.files; input.dispatchEvent(new Event('change'));
      });
      return false;
    }
    const t = document.getElementById('view').textContent;
    return /“Test” \\(ZOOM0000.TXT\\)/.test(t) && /WaitingonZoombiniIsle16/.test(t.replace(/\\s+/g, '')) && /at the map/.test(t) && document.querySelectorAll('#view .szb img').length === 16 && (document.querySelector('[data-save-map]').click(), true);
  })()`],
  ['journey', "JSAVE && JSAVE.levels.get(17) === 1 && JSAVE.levels.get(18) === 1 && JSAVE.levels.get(19) === 0 && /as “Test”/.test(document.getElementById('jpanel').textContent) && (document.querySelector('#jpanel [data-nosave]').click(), !JSAVE)"],
  ['FLEENS', "document.querySelector('#room canvas') && document.querySelectorAll('#side .ids a').length === 209 && document.querySelectorAll('#side .arc:not([data-arc=changes]):not([data-arc=mods]):not([data-arc=saves])').length === 22"],
  ['FLEENS/tBMP/300', "document.querySelector('#pic canvas') && document.querySelector('#pic canvas').width === 640"],
  ['FLEENS/tBMP/4000', "document.querySelectorAll('#sheet .frame').length === 740 && /REGS 4000/.test(document.getElementById('view').textContent)"],
  ['ZOOMBINI/tBMP/3000', "document.querySelectorAll('#sheet .frame').length === 890"],
  ['PICKER/tBMP/4300', "document.getElementById('palPick') && document.getElementById('palPick').value === 'SHPL 4000'"],
  ['ZOOMBINI/SND/99', "document.querySelector('#view audio') && /11,025 Hz/.test(document.getElementById('view').textContent)"],
  ['FLEENS/SND/1000', "document.querySelector('#view audio[loop]')"],
  ['MIDIMPC/tMID/30000', "/standard MIDI file/.test(document.getElementById('view').textContent)"],
  ['FLEENS/SHPL/300', "document.querySelectorAll('.swatches div').length === 256"],
  ['MAZE2/tPAL/5001', "document.querySelectorAll('.swatches div:not(.off)').length === 240"],
  ['ZOOMBINI/STRL/1700', "/Allergic Cliffs/.test(document.getElementById('view').textContent) && /level 1/.test(document.getElementById('view').textContent)"],
  ['ZOOMBINI/CURS/1', "document.querySelector('#cur canvas')"],
  ['HOTEL/NODE/1000', "document.querySelector('#walk canvas') && /21 waypoints/.test(document.getElementById('view').textContent) && document.querySelector('#walker select') && (document.getElementById('walkGo').click(), true)"],
  ['FLEENS/REGS/4000', "/registration points of a sheet of 740 frames/.test(document.getElementById('view').textContent)"],
  ['FLEENS/SCRS/4000', "document.querySelectorAll('.frames tr').length > 1 && /body, feet, nose, eyes, hair/.test(document.getElementById('view').textContent)"],
  ['PICKER/SCRB/1000', "document.querySelectorAll('.frames tr').length > 1"],
  // Snoid scripts played: a Zoombini walking, a Fleen running, a tumble, a walk over its room.
  ['ZOOMBINI/SCRS/112', "document.querySelector('#snoid canvas') && /tick [1-9]/.test(document.getElementById('snoidTick').textContent) && /written for roller skates/.test(document.getElementById('snoid').textContent)"],
  ['FLEENS/SCRS/4028', "document.querySelector('#snoid canvas') && /A Fleen,/.test(document.getElementById('snoid').textContent) && !document.querySelector('#snoid .warn')"],
  ['FLEENS/SCRS/6000', "document.querySelector('#snoid canvas') && /tumbling/.test(document.getElementById('snoid').textContent) && !document.querySelector('#snoid .warn')"],
  ['BRIDGE/SCRS/2002', "document.querySelector('#snoid canvas') && document.getElementById('snoidRoom') && !document.querySelector('#snoid .warn')"],
  ['BRIDGE', "/Allergic Cliffs/.test(document.getElementById('view').textContent) && /level 4/.test(document.getElementById('view').textContent)"],
];

try {
  const bare = await loadPage(srv.base + 'index.html', "document.readyState === 'complete'", 20000, { chrome,
    then: async p => p.evaluate("!document.getElementById('start').hidden && document.getElementById('app').hidden") });
  for (const e of pageErrors(bare.console)) fail('index.html: ' + describe(e));
  if (!bare.more) fail('index.html does not show its start with nothing open');
  else console.log('index.html loads with nothing open, no errors');

  const iso = path.join(REF, 'disc', 'ZOOMBINI.ISO');
  if (!fs.existsSync(iso)) console.log('SKIP the views: no reference/disc/ZOOMBINI.ISO');
  else for (const dev of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844, scale: 2, mobile: true }]) {
    const r = await loadPage(srv.base + 'index.html?src=reference/disc/ZOOMBINI.ISO', "location.hash === '#journey' && typeof JDRAWN !== 'undefined' && JDRAWN.length === 16", 90000, {
      chrome, device: dev,
      then: async p => {
        const results = [];
        if (shots) await p.shot(path.join(shots, `${dev.name}-journey-home.png`));
        // Onto Pizza Pass a wheel step at a time, at its icon, and back out.
        const wheel = async (key, dy) => p.evaluate(`(() => {
          const cv = document.getElementById('jmap'), r = cv.getBoundingClientRect(), q = JMAP.places.find(x => x.key === '${key}');
          const [x, y] = mapToScreen(q.cx, q.cy);
          cv.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
        })()`);
        const until = async (cond, step, most) => {
          for (let i = 0; i < most; i++) {
            if (await p.evaluate(cond)) return i;
            await step();
            await new Promise(res => setTimeout(res, 60));
          }
          return (await p.evaluate(cond)) ? most : -1;
        };
        const inSteps = await until("location.hash === '#place=PIZZA' && JPICS.get('PIZZA/5000') instanceof HTMLCanvasElement", () => wheel('PIZZA', -120), 80);
        if (shots) await p.shot(path.join(shots, `${dev.name}-journey-pizza.png`));
        const outSteps = inSteps < 0 ? -1 : await until("location.hash === '#journey&place=PIZZA'", () => wheel('PIZZA', 120), 80);
        // A second address while the first flight is under way wins.
        await p.evaluate("location.hash = '#place=TOWN'; setTimeout(() => { location.hash = '#place=FERRY'; }, 250)");
        const took = await until("JVIEW.place === 'FERRY' && !JMOVING && location.hash === '#place=FERRY'", async () => {}, 60);
        results.push({ hash: 'wheel onto Pizza Pass and out', met: inSteps > 0 && outSteps > 0 && took >= 0, ms: 0, wide: false,
          note: `${inSteps} steps in, ${outSteps} out${took < 0 ? ', and a second address mid-flight was lost' : ''}` });
        for (const [hash, ok] of VIEWS) {
          await p.evaluate(`location.hash = '#${hash}'`);
          const t0 = Date.now();
          let met = false;
          while (Date.now() - t0 < 30000) {
            if (await p.evaluate(`!!(${ok})`)) { met = true; break; }
            await new Promise(res => setTimeout(res, 200));
          }
          const wide = dev.mobile ? await p.evaluate('document.documentElement.scrollWidth > innerWidth + 1 || document.getElementById(\'view\').scrollWidth > document.getElementById(\'view\').clientWidth + 1 || document.getElementById(\'bar\').scrollWidth > document.getElementById(\'bar\').clientWidth + 1') : false;
          if (shots) await p.shot(path.join(shots, `${dev.name}-${hash.replace(/\//g, '-')}.png`));
          results.push({ hash, met, ms: Date.now() - t0, wide });
        }
        return results;
      },
    });
    for (const e of pageErrors(r.console)) fail(`${dev.name}: ${describe(e)}`);
    if (!r.met) { fail(`${dev.name}: the map did not come up first from the CD image`); continue; }
    for (const v of r.more) {
      if (!v.met) fail(`${dev.name} #${v.hash}: did not come up${v.note ? ' (' + v.note + ')' : ''}`);
      if (v.wide) fail(`${dev.name} #${v.hash}: wider than the screen`);
    }
    console.log(`${dev.name}: the CD image read, the map first; ${r.more[0].note}; ${r.more.slice(1).filter(v => v.met).length} of ${VIEWS.length} views up (slowest ${Math.max(...r.more.map(v => v.ms))} ms)`);
  }

  // ---- the town, in WebGL ------------------------------------------------
  if (fs.existsSync(iso)) for (const dev of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844, scale: 2, mobile: true }]) {
    const r = await loadPage(srv.base + 'index.html?src=reference/disc/ZOOMBINI.ISO#town', "typeof TSCENE !== 'undefined' && !!TSCENE && !!TGL", 90000, {
      chrome, device: dev, webgl: true,
      then: async p => {
        const sleep = ms => new Promise(res => setTimeout(res, ms));
        const got = {};
        await sleep(300);
        got.full = await p.evaluate("TSCENE.things.length === 80 && TANIM.length === 8 && !!TCLOCK");
        if (shots) await p.shot(path.join(shots, `${dev.name}-town.png`));
        await p.evaluate("TV.yaw = (946 - 320) / 1920 * 2 * Math.PI; TV.pitch = Math.atan((300 - 230) * (2 * Math.PI / 1920))");
        await sleep(300);
        got.caption = await p.evaluate("document.getElementById('tcaption').textContent");
        if (shots) await p.shot(path.join(shots, `${dev.name}-town-clock.png`));
        // Each way of showing the depth draws, and Cardboard is left by its button.
        for (const mode of ['sway', 'anaglyph', 'cardboard']) {
          await p.evaluate(`(() => { const el = document.getElementById('tdepth'); el.value = '${mode}'; el.dispatchEvent(new Event('change')); })()`);
          await sleep(300);
          if (shots) await p.shot(path.join(shots, `${dev.name}-town-${mode}.png`));
        }
        await p.evaluate("document.getElementById('tcardexit').click()");
        await sleep(200);
        got.depth = await p.evaluate("TV.depth === 'none' && !document.getElementById('town').classList.contains('cardboard') && TGL.meshes.things.count > 0");
        await p.evaluate("(() => { for (const [id, v] of [['tpeople', 0], ['trewards', 0]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); } })()");
        await sleep(300);
        got.empty = await p.evaluate("location.hash === '#town&people=0&rewards=0' && TSCENE.things.length === 9 && TANIM.length === 0 && !TCLOCK");
        got.wide = dev.mobile ? await p.evaluate('document.documentElement.scrollWidth > innerWidth + 1') : false;
        await p.evaluate("location.hash = '#place=TOWN'");
        const t0 = Date.now();
        while (Date.now() - t0 < 10000 && !(await p.evaluate("!!document.querySelector('#jpanel a[href=\"#town\"]') && !document.getElementById('journey').hidden"))) await sleep(200);
        got.link = await p.evaluate("!!document.querySelector('#jpanel a[href=\"#town\"]')");
        return got;
      },
    });
    for (const e of pageErrors(r.console)) fail(`${dev.name} #town: ${describe(e)}`);
    if (!r.met) { fail(`${dev.name}: #town did not come up with WebGL`); continue; }
    const g = r.more;
    if (!g.full) fail(`${dev.name} #town: not 80 things, 8 inhabitants and the clock`);
    if (!/Clock Tower/.test(g.caption)) fail(`${dev.name} #town: looking at the clock tower says "${g.caption}"`);
    if (!g.depth) fail(`${dev.name} #town: the depth modes did not draw, or Cardboard would not be left`);
    if (!g.empty) fail(`${dev.name} #town: the sliders did not empty the town`);
    if (g.wide) fail(`${dev.name} #town: wider than the screen`);
    if (!g.link) fail(`${dev.name}: the map's Zoombiniville has no link to #town`);
    if (g.full && /Clock Tower/.test(g.caption) && g.depth && g.empty && !g.wide && g.link) console.log(`${dev.name}: the town all round, built and emptied, the clock tower named, swayed, in red and cyan and in Cardboard`);
  }
} finally { srv.close(); }
process.exit(fails ? 1 : 0);
