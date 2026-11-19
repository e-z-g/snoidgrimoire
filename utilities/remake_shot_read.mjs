// The remake's screenshot reader (js/zb-shot-remake.js) run on PNG files,
// against scenes drawn by utilities/remake_scenes.mjs.
//
//   node utilities/remake_shot_read.mjs SCENES POSES a.png b.png ...
//
// SCENES is the folder of level<n>.png, POSES a folder of utilities/remake_parts.mjs's
// output folders, one a pose, f1 (the standing pose) first if there.
import fs from 'node:fs';
import path from 'node:path';
import { site } from './load.mjs';
import { readPng } from './png.mjs';

const [dir, poseDir, ...shots] = process.argv.slice(2);
if (!dir || !poseDir || !shots.length) { console.log('node utilities/remake_shot_read.mjs SCENES POSES a.png ...'); process.exit(1); }
const S = site();
const toImg = p => { const r = readPng(fs.readFileSync(p)); return { rgba: r.rgba || r.data || r.pixels, width: r.width, height: r.height }; };
const scenes = fs.readdirSync(dir).filter(f => /^level\d+\.png$/.test(f)).map(f => ({ n: +f.slice(5, -4), img: toImg(path.join(dir, f)) }))
  .filter(s => { const d = s.img.rgba; let k = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] !== 0x33 || d[i + 1] !== 0x33 || d[i + 2] !== 0x44) k++; return k > d.length / (4 * 97) / 3; });
const poses = fs.readdirSync(poseDir).filter(d => fs.existsSync(path.join(poseDir, d, 'parts.json'))).sort((a, b) => (b === 'f1') - (a === 'f1') || a.localeCompare(b));
const parts = new Map();
for (const pose of poses) {
  const info = JSON.parse(fs.readFileSync(path.join(poseDir, pose, 'parts.json')));
  for (const [n, v] of Object.entries(info)) parts.set(pose + '/' + n, { ...toImg(path.join(poseDir, pose, n + '.png')), ox: v.x, oy: v.y });
}
const NAMES = { hair: ['shaggy', 'ponytail', 'tuft', 'flat top', 'cap'], eyes: ['dots', 'sleepy', 'sunglasses', 'glasses', 'one eye'], nose: ['yellow', 'pink', 'red', 'green', 'blue'], feet: ['wheels', 'propeller', 'spring', 'sneakers', 'skates'] };
for (const p of shots) {
  const t = Date.now(), img = toImg(p);
  const r = S.zbRemakeShotPlace(img.rgba, img.width, img.height, scenes);
  const top = r.ranked.slice(0, 3).map(x => `level${x.n} ${x.score != null ? x.score.toFixed(3) : '-'} (coarse ${x.coarse.toFixed(3)})${x.scale ? ` at ${Math.round(x.x0)},${Math.round(x.y0)} x${x.scale.toFixed(3)}` : ''}`);
  console.log(`${path.basename(p)}: ${img.width} x ${img.height}, trim ${r.trim.width} x ${r.trim.height}, ${Date.now() - t} ms\n  ${top.join('\n  ')}`);
  const best = r.ranked[0], shot = { rgba: r.trim.rgba, width: r.trim.width, height: r.trim.height };
  const back = S.zbRemakeShotBackdrop(shot, scenes.find(s => s.n === best.n).img, best);
  const zs = S.zbRemakeShotZoombinis(shot, back, parts, poses);
  for (const z of zs) console.log(`  (${z.x}, ${z.y}) ${z.pose} ${z.flip ? 'left ' : 'right'} ${['hair', 'eyes', 'nose', 'feet'].map(t => `${NAMES[t][z.traits[t]]} (${z.margins[t]})`).join(', ')}, size ${z.k.toFixed(2)}, gain ${z.gain.toFixed(1)}`);
  console.log(`  ${zs.length} Zoombinis, ${Date.now() - t} ms`);
}
