// The intro movies (js/zb-movie.js) against zbtools' reader, run on this
// machine by the workbench's tools/movie_oracle.py:
//
//   - each of the disc's four movies (DATA/LOGO0*.MOV, out of the CD image
//     by isoFiles) has the oracle's size, timescale, frame lengths and
//     sound rate, edits and bytes (by SHA-1);
//   - every frame, drawn by zbQkbkDecoder one after another as a player
//     draws them, is the picture zbtools draws from scratch, palette
//     index for palette index (by SHA-1), in the palette the frame names,
//     whose colors 1-255 are zbtools';
//   - the sound as it plays (zbMovieSound) is as long as its edits.
//
// The oracle needs pydantic and Pillow: the workspace's program venv, or
// $ZB_MOVIE_PY. zbtools is ../zoombini-reference/zbtools/src beside the
// workbench, or $ZB_ZBTOOLS.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { site, REF, ROOT } from './load.mjs';

const iso = path.join(REF, 'disc', 'ZOOMBINI.ISO');
if (!fs.existsSync(iso)) { console.log('SKIP: no reference/disc/ZOOMBINI.ISO'); process.exit(0); }
const tools = process.env.ZB_TOOLS || path.join(REF, 'tools');
const py = process.env.ZB_MOVIE_PY || path.join(ROOT, '..', 'program', 'venv', 'bin', 'python3');
const zbtools = process.env.ZB_ZBTOOLS || path.join(ROOT, '..', 'zoombini-reference', 'zbtools', 'src');
if (!fs.existsSync(py)) { console.log(`SKIP: no Python at ${py} (set ZB_MOVIE_PY)`); process.exit(0); }
if (!fs.existsSync(path.join(zbtools, 'zbtools', 'formats', 'qkbk.py'))) { console.log(`SKIP: no zbtools at ${zbtools} (set ZB_ZBTOOLS)`); process.exit(0); }
const r = spawnSync(py, ['-I', path.join(tools, 'movie_oracle.py'), iso, zbtools], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status !== 0) { console.log('SKIP: the oracle did not run, ' + (r.stderr || '').trim().split('\n').slice(-1)[0]); process.exit(0); }
const expected = JSON.parse(r.stdout);

let fails = 0;
const fail = m => { if (fails++ < 20) console.log('FAIL ' + m); };
const sha1 = b => createHash('sha1').update(b).digest('hex');
const S = site();
const bytes = new Uint8Array(fs.readFileSync(iso));
const movies = S.isoFiles(bytes).filter(f => /\.MOV$/i.test(f.path));
if (movies.length !== Object.keys(expected).length) fail(`${movies.length} movies, zbtools ${Object.keys(expected).length}`);
let frames = 0;
const t0 = performance.now();
for (const f of movies) {
  const e = expected[f.path];
  if (!e) { fail(`${f.path}: not in zbtools' list`); continue; }
  const m = S.zbMovieRead(bytes.subarray(f.offset, f.offset + f.size));
  const same = (what, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${f.path} ${what}: ${JSON.stringify(a)}, zbtools ${JSON.stringify(b)}`); };
  same('size', [m.width, m.height], [e.width, e.height]);
  same('timescale', m.timescale, e.timescale);
  same('codec', [m.video.codec, m.sound.codec], ['QkBk', 'twos']);
  same('frame lengths', [...new Set(m.video.durations)], [e.frame_duration]);
  same('frames', m.video.samples.length, e.frames.length);
  same('sound rate', m.sound.rate, e.rate);
  same('sound edits', m.sound.edits, e.edits);
  same('sound bytes', [m.sound.bytes.length, sha1(m.sound.bytes)], [e.sound_length, e.sound]);
  const played = S.zbMovieSound(m);
  const length = m.sound.edits.reduce((n, [d]) => n + Math.round(d / m.timescale * m.sound.rate), 0);
  same('sound played', played.pcm.length, length);
  const dec = S.zbQkbkDecoder(m.width, m.height);
  let wrong = 0;
  const palettes = new Set();
  m.video.samples.forEach((s, k) => {
    const out = dec.decode(s);
    frames++;
    if (sha1(out.pixels) !== e.frames[k] && wrong++ < 3) fail(`${f.path} frame ${k + 1} is not the picture zbtools draws`);
    if (e.palette[k] && out.paletteId !== e.palette[k]) fail(`${f.path} frame ${k + 1} in palette ${out.paletteId}, zbtools ${e.palette[k]}`);
    if (!palettes.has(out.paletteId)) {
      palettes.add(out.paletteId);
      if (sha1(out.palette.subarray(3)) !== e.palettes[out.paletteId]) fail(`${f.path} palette ${out.paletteId}'s colors are not zbtools'`);
    }
  });
  if (wrong) fail(`${f.path}: ${wrong} of ${e.frames.length} frames differ`);
}
const secs = ((performance.now() - t0) / 1000).toFixed(1);
if (fails) { console.log(`${fails} failures`); process.exit(1); }
console.log(`the ${movies.length} intro movies' ${frames} frames, palettes and sound are zbtools', pixel for pixel (${secs} s in Node)`);
