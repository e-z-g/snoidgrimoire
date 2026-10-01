// The snoids as js/zb-snoid.js plays them, against the Zoombini maker
// (e-z-g.github.io/zoombinis, reference/site/sprites.js), whose clips Sam
// has watched and judged: the maker is where the scripts' playback was
// settled by eye, so what the site plays should agree with it. The maker's
// clips are the scripts boiled down by tools/export_web.py (clip(),
// walk_cycle(), walk_clip()), so each is read here the same way from what
// zbSnoidTicks, zbSnoidShown and zbSnoidParts make of the script:
//
//   - the idles (ZOOMBINI SCRS 130-137, FLEENS 4000-4003) and the feet shows
//     (ZOOMBINI 146-150), tick for tick from the first that draws: the
//     figure's move, the head's facing, the feet's pose in the clip's own
//     list, and the eyes, whose codes (rest, blink, glances) must stand for
//     one pose each at each facing; a tick that draws nothing holds the one
//     before, as the maker holds it;
//   - the Zoombini's 25 walks (SCRS 105-129), one loop of each: every part's
//     pose, the body's move, and the head turned away (the maker draws the
//     nose before the body at nose pose 4) exactly where zb-snoid.js draws
//     the nose first. The maker follows animate.py's fitted body and nose,
//     so on the ties the layout word decides (snoid_check) the body's move
//     may differ by a pixel; those are counted, not failed.
//
// Not compared: the tumble, which the maker builds from a spin of its own
// and one landing script; the Fleen's hops and runs, which it holds on the
// spot by the drawn pixels.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { site, archiveBytes, haveDisc, REF } from './load.mjs';

let fails = 0, bad = 0;
const fail = m => { if (bad++ < 12) console.log('FAIL ' + m); fails++; };
if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const spritesJs = path.join(REF, 'site', 'sprites.js');
if (!fs.existsSync(spritesJs)) { console.log('SKIP: no reference/site/sprites.js (the maker)'); process.exit(0); }
const win = {};
vm.runInNewContext(fs.readFileSync(spritesJs, 'utf8'), { window: win });
const M = win.ZOOMBINI_SPRITES;
const S = site();
const arcs = { ZOOMBINI: S.openMohawk(archiveBytes('ZOOMBINI')), FLEENS: S.openMohawk(archiveBytes('FLEENS')) };
const REST = { zoombini: 2, fleen: 1 };               // export_web.py REST_POSE
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A script as the site plays it: per tick, from the first that draws, the
// parts of the tick it shows, by name.
function played(archive, id) {
  const s = S.parseScript(arcs[archive].get('SCRS', id), 'SCRS');
  const ticks = S.zbSnoidTicks(s, 0, archive), shown = S.zbSnoidShown(ticks);
  const first = shown.findIndex((k, i) => k === i);
  return shown.slice(first).map(k => Object.fromEntries(S.zbSnoidParts(ticks[k]).map(p => [p.part, p])));
}

// The idles and feet shows: [eyes, dx, dy, facing, feet].
const eyeCodes = new Map();
let clips = 0, clipTicks = 0;
function compareClip(kind, archive, id, want, feetList) {
  const got = played(archive, id), lead = kind === 'zoombini' ? 'feet' : 'body', head = 'body';
  if (got.length !== want.length) return fail(`${archive} SCRS ${id}: ${got.length} ticks from the first drawn, the maker's clip ${want.length}`);
  const x0 = got[0][lead].x, y0 = got[0][lead].y;
  got.forEach((t, i) => {
    if (!t[lead]) return fail(`${archive} SCRS ${id} tick ${i}: draws nothing, where the maker holds the tick before`);
    const [eyes, dx, dy, facing, feet] = want[i];
    const h = t[head].shape, f = t.feet.shape;
    if (t[lead].x - x0 !== dx || t[lead].y - y0 !== dy) fail(`${archive} SCRS ${id} tick ${i}: moved ${t[lead].x - x0}, ${t[lead].y - y0}, the maker ${dx}, ${dy}`);
    if ((h === REST[kind] ? 0 : h) !== facing) fail(`${archive} SCRS ${id} tick ${i}: head at ${h}, the maker's facing ${facing}`);
    if (feetList && f > 3 && !feetList.includes(f)) feetList.push(f);
    if ((feetList && f > 3 ? feetList.indexOf(f) : -1) !== feet) fail(`${archive} SCRS ${id} tick ${i}: feet at ${f}, the maker's ${feet}`);
    const key = `${kind} ${facing} ${eyes}`, pose = t.eyes.shape;
    if (eyeCodes.has(key) && eyeCodes.get(key) !== pose) fail(`${archive} SCRS ${id} tick ${i}: the maker's eyes ${eyes} at facing ${facing} are pose ${pose} here and ${eyeCodes.get(key)} elsewhere`);
    eyeCodes.set(key, pose);
    clipTicks++;
  });
  clips++;
}
const IDLES = { zoombini: ['ZOOMBINI', 130], fleen: ['FLEENS', 4000] };
for (const [kind, [archive, base]] of Object.entries(IDLES)) {
  M.characters[kind].idles.forEach((want, k) => compareClip(kind, archive, base + k, want, null));
}
M.characters.zoombini.specials.forEach((want, v) => compareClip('zoombini', 'ZOOMBINI', 146 + v, want, []));
// Each code one pose, and each pose one code, at a facing.
const byPose = new Map();
for (const [key, pose] of eyeCodes) {
  const [kind, facing] = key.split(' '), k = `${kind} ${facing} ${pose}`;
  if (byPose.has(k) && byPose.get(k) !== key) fail(`${kind} eyes pose ${pose} at facing ${facing} are two of the maker's codes`);
  byPose.set(k, key);
}

// The walks: [dx, dy, feet, body, nose, eyes, hair, liftNear, liftFar, device, away, feetDx, feetDy].
let walks = 0, walkTicks = 0, ties = 0;
for (let v = 0; v < 5; v++) for (let d = 0; d < 5; d++) {
  const id = 105 + 5 * v + d, got = played('ZOOMBINI', id), want = M.characters.zoombini.walks.own[v][d];
  if (want.length % got.length) { fail(`SCRS ${id}: the maker's walk of ${want.length} ticks is not whole loops of ${got.length}`); continue; }
  const b0 = got[0].body;
  got.forEach((t, i) => {
    const w = want[i], poses = ['feet', 'body', 'nose', 'eyes', 'hair'].map(n => (t[n].shape === REST.zoombini ? -1 : t[n].shape));
    if (!same(poses, w.slice(2, 7))) fail(`SCRS ${id} tick ${i}: poses ${poses}, the maker's ${w.slice(2, 7)}`);
    const noseFirst = Object.keys(t).indexOf('nose') < Object.keys(t).indexOf('body');
    if (noseFirst !== (w[10] === 1)) fail(`SCRS ${id} tick ${i}: nose ${noseFirst ? 'before' : 'after'} the body, the maker's away ${w[10]}`);
    if (t.body.x - b0.x !== w[0] || t.body.y - b0.y !== w[1]) {
      const tie = t.body.shape <= 4 && t.nose.shape <= 4 && Math.abs(t.body.x - t.nose.x) + Math.abs(t.body.y - t.nose.y) === 1;
      if (tie) ties++;
      else fail(`SCRS ${id} tick ${i}: the body moved ${t.body.x - b0.x}, ${t.body.y - b0.y}, the maker ${w[0]}, ${w[1]}`);
    }
    walkTicks++;
  });
  walks++;
}

if (!fails) console.log(`${clips} idles and feet shows (${clipTicks} ticks, empty ones held) and ${walks} walks (${walkTicks} ticks) as the maker plays them; ${ties} walk ticks a pixel apart on a body-and-nose tie`);
process.exit(fails ? 1 : 0);
