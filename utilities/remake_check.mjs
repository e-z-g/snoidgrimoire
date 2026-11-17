// The 2015 remake's files read by zb-unity.js, against UnityPy
// (remake_oracle.py), and opened in the page in headless Chrome.
//
//   ZB_REMAKE=<the Data folder> node utilities/remake_check.mjs
//
// ZB_REMAKE defaults to the iPhone app's folder on a Mac where it is
// installed, and ZB_REMAKE_PY to the venv in zoombini-reference/remake.
// Without either, the check skips. It compares every file's object counts
// by class, every text asset's bytes, every sound's rate, channels and
// length, and every texture (plain, ASTC or PVRTC) pixel for pixel. It
// builds the scripts' field layouts from the build's global-metadata.dat and
// UnityFramework (zb-il2cpp.js), compares them class by class with the table
// that zoombini-workbench tools/remake/layouts.py writes from Cpp2IL's dump
// (zoombini-reference/remake/layouts.json, ZB_REMAKE_LAYOUTS), and reads
// every MonoBehaviour's fields by them, each to exactly its size.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { ROOT, site } from './load.mjs';
import { serve, loadPage, pageErrors } from './browser.mjs';

const DATA = process.env.ZB_REMAKE || '/Applications/Zoombinis.app/Wrapper/Zoombinis.app/Data';
const PY = process.env.ZB_REMAKE_PY || path.join(ROOT, '..', 'zoombini-reference', 'remake', '.venv', 'bin', 'python');
if (!fs.existsSync(DATA) || !fs.existsSync(PY)) {
  console.log(`SKIP: needs the remake's Data folder (${DATA}) and UnityPy (${PY})`);
  process.exit(0);
}
const APP = path.dirname(DATA);
const METADATA = path.join(DATA, 'Managed', 'Metadata', 'global-metadata.dat');
const BINARY = path.join(APP, 'Frameworks', 'UnityFramework.framework', 'UnityFramework');
const LAYOUTS = process.env.ZB_REMAKE_LAYOUTS || path.join(ROOT, '..', 'zoombini-reference', 'remake', 'layouts.json');
for (const p of [METADATA, BINARY, LAYOUTS]) if (!fs.existsSync(p)) { console.log(`SKIP: needs ${p}`); process.exit(0); }
const vorbis = [];
const S = site();
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const problems = [];
const fail = m => { if (problems.length < 30) problems.push(m); };

const VORBIS_DIR = path.join(path.dirname(PY), '..', '..', 'vorbis-oracle');
fs.mkdirSync(VORBIS_DIR, { recursive: true });
const oracle = JSON.parse(spawnSync(PY, [path.join(ROOT, 'utilities', 'remake_oracle.py'), DATA, VORBIS_DIR], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
const fileBytes = new Map();
const bytesOf = name => { if (!fileBytes.has(name)) fileBytes.set(name, new Uint8Array(fs.readFileSync(path.join(DATA, name)))); return fileBytes.get(name); };
const side = (p, offset, size) => bytesOf(S.zbUnitySideName(p)).subarray(offset, offset + size);

let objects = 0, texts = 0, sounds = 0, textures = 0, decodeMs = 0;
const parsed = new Map(), monos = [];
for (const name of fs.readdirSync(DATA).sort()) {
  const p = path.join(DATA, name);
  if (!fs.statSync(p).isFile()) continue;
  const bytes = bytesOf(name), hs = S.zbUnityHeaderSize(bytes.subarray(0, 48));
  if (!hs) continue;
  const sf = S.zbUnityParse(bytes.subarray(0, hs)), want = oracle[name];
  parsed.set(name, sf);
  if (!want) { fail(`${name}: UnityPy has no objects`); continue; }
  const classes = {};
  for (const o of sf.objects) classes[o.classId] = (classes[o.classId] || 0) + 1;
  if (JSON.stringify(Object.entries(classes).sort()) !== JSON.stringify(Object.entries(want.classes).map(([k, v]) => [k, v]).sort()))
    fail(`${name}: classes ${JSON.stringify(classes)} against ${JSON.stringify(want.classes)}`);
  for (const o of sf.objects) {
    let v;
    try { v = S.zbUnityRead(sf, o, bytes.subarray(sf.dataOffset + o.start, sf.dataOffset + o.start + o.size)); }
    catch (e) { fail(`${name} ${o.pathId}: ${e.message}`); continue; }
    objects++;
    const id = String(o.pathId);
    if (o.classId === 114) monos.push([name, o, v]);
    else if (o.classId === 49) {
      texts++;
      const [n, h] = want.text[id] || [];
      if (n !== v.m_Name || h !== sha1(v.m_Script)) fail(`${name} TextAsset ${id} ${v.m_Name}: differs`);
    } else if (o.classId === 83) {
      sounds++;
      const [n, rate, channels, length] = want.sounds[id] || [];
      const bank = S.zbFsbRead(side(v.m_Resource.m_Source, v.m_Resource.m_Offset, v.m_Resource.m_Size)), s = bank.samples[0];
      const got = [v.m_Name, s.rate, s.channels, Math.round(s.count / s.rate * 1000) / 1000];
      if (n !== got[0] || rate !== got[1] || channels !== got[2] || Math.abs(length - got[3]) > 0.002)
        fail(`${name} AudioClip ${id}: ${JSON.stringify(got)} against ${JSON.stringify(want.sounds[id])}`);
      if (bank.codec === 2 && !S.zbFsbWav(bank, s)) fail(`${name} AudioClip ${id}: no WAV`);
      if (bank.codec === 15) vorbis.push({ name, id, clip: v.m_Name, s });
    } else if (o.classId === 28 && want.textures[id]) {
      textures++;
      let data = v['image data'];
      if (!data.length && v.m_StreamData.size) data = side(v.m_StreamData.path, v.m_StreamData.offset, v.m_StreamData.size);
      const t0 = performance.now(), img = S.zbUnityTexturePixels(v.m_TextureFormat, v.m_Width, v.m_Height, data);
      decodeMs += performance.now() - t0;
      if (!img || sha1(img.rgba) !== want.textures[id][1]) fail(`${name} Texture2D ${id} ${v.m_Name}: pixels differ`);
    }
  }
}
// The Vorbis sounds: each one's setup header found in the binary, made
// into an Ogg file, decoded by ffmpeg and held to FMOD's decoding (written
// by the oracle as WAV), over the samples the sound has.
{
  const setups = S.zbVorbisSetups(new Uint8Array(fs.readFileSync(BINARY)), vorbis.map(v => v.s.setupCrc));
  const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  let matched = 0;
  for (const v of vorbis) {
    const setup = setups.get(v.s.setupCrc);
    if (!setup) { fail(`${v.name} AudioClip ${v.id} ${v.clip}: no setup header with CRC ${v.s.setupCrc}`); continue; }
    const ogg = S.zbFsbOgg(v.s, setup);
    if (!ffmpeg) continue;
    const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], { input: Buffer.from(ogg), maxBuffer: 1 << 28 });
    const wav = fs.readFileSync(path.join(VORBIS_DIR, `${v.name}-${v.id}.wav`));
    const expected = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length - (wav.length - 44) % 2));
    const actual = new Int16Array(dec.stdout.buffer.slice(dec.stdout.byteOffset, dec.stdout.byteOffset + dec.stdout.length - dec.stdout.length % 2));
    const n = v.s.count * v.s.channels;
    if (dec.status || actual.length < n || expected.length < n) { fail(`${v.clip}: ffmpeg gave ${actual.length} samples of ${n} (${String(dec.stderr).slice(0, 80)})`); continue; }
    let err = 0, peak = 1;
    for (let i = 0; i < n; i++) { err += (expected[i] - actual[i]) ** 2; peak = Math.max(peak, Math.abs(expected[i])); }
    const rms = Math.sqrt(err / n) / peak;
    if (rms > 0.001) fail(`${v.clip}: differs from FMOD's decoding by ${rms.toFixed(5)} of its peak`);
    else matched++;
  }
  console.log(`${vorbis.length} Vorbis sounds, ${setups.size} setup headers found in the binary, ${ffmpeg ? matched + ' matching FMOD\'s decoding' : 'not decoded (no ffmpeg)'}`);
}
const plainWanted = Object.entries(oracle).filter(([n]) => fileBytes.has(n)).map(([, f]) => f).reduce((n, f) => n + Object.keys(f.textures).length, 0);
if (textures !== plainWanted) fail(`${textures} textures read, UnityPy has ${plainWanted}`);

// The layouts built from the metadata and the binary, against layouts.py's.
const binaryFd = fs.openSync(BINARY, 'r');
const readBinary = async (at, n) => { const b = new Uint8Array(n); fs.readSync(binaryFd, b, 0, n, at); return b; };
const t0 = performance.now();
const built = await S.zbIl2cppLayouts(new Uint8Array(fs.readFileSync(METADATA)), readBinary);
const buildMs = performance.now() - t0;
fs.closeSync(binaryFd);
const layouts = built.layouts, expectedLayouts = JSON.parse(fs.readFileSync(LAYOUTS, 'utf8'));
let layoutsSame = 0;
for (const [cls, expected] of Object.entries(expectedLayouts)) {
  if (JSON.stringify(layouts[cls]) === JSON.stringify(expected)) layoutsSame++;
  else fail(`layout ${cls}: ${JSON.stringify(layouts[cls])} against layouts.py's ${JSON.stringify(expected)}`);
}
console.log(`${layoutsSame} of ${Object.keys(expectedLayouts).length} layouts as layouts.py has them, of ${Object.keys(layouts).length} built in ${Math.round(buildMs)} ms (registration at 0x${built.registration.toString(16)}, ${built.typeCount.toLocaleString()} types)`);

// Each MonoBehaviour by its script's class, whose MonoScript may be in another file.
const scriptOf = (name, p) => {
  const target = p.m_FileID === 0 ? name : S.zbUnitySideName(parsed.get(name).externals[p.m_FileID - 1]);
  const sf = parsed.get(target), o = sf && sf.objects.find(x => x.pathId === p.m_PathID);
  if (!o) return null;
  const b = bytesOf(target), s = S.zbUnityRead(sf, o, b.subarray(sf.dataOffset + o.start, sf.dataOffset + o.start + o.size));
  return (s.m_Namespace ? s.m_Namespace + '.' : '') + s.m_ClassName;
};
let monoRead = 0;
const monoBad = new Map();
for (const [name, o, v] of monos) {
  const cls = scriptOf(name, v.m_Script);
  try {
    if (!cls) throw new Error('its MonoScript is not found');
    S.zbUnityScriptFields(layouts, cls, v.rest, parsed.get(name).little);
    monoRead++;
  } catch (e) {
    if (!monoBad.has(cls)) monoBad.set(cls, []);
    monoBad.get(cls).push(`${name} ${o.pathId}: ${e.message}`);
  }
}
for (const [cls, list] of monoBad) fail(`${list.length} ${cls} not read exactly, as ${list[0]}`);
console.log(`${monoRead.toLocaleString()} of ${monos.length.toLocaleString()} MonoBehaviours read by their scripts' layouts to exactly their size`);
console.log(`${objects.toLocaleString()} objects read, ${texts} text assets, ${sounds} sounds and ${textures} textures as UnityPy has them (decoded in ${(decodeMs / 1000).toFixed(1)} s)`);

// The page: the files handed to it, then a view of each kind.
const files = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1));
  const p = name === 'global-metadata.dat' ? METADATA : name === 'UnityFramework' ? BINARY : path.join(DATA, name);
  if (!p.startsWith(APP) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': fs.statSync(p).size });
  fs.createReadStream(p).on("error", e => console.log("serve", name, e.message)).pipe(res).on("error", e => console.log("send", name, e.message));
});
await new Promise(r => files.listen(0, '127.0.0.1', r));
const filesBase = `http://127.0.0.1:${files.address().port}/`;
const names = fs.readdirSync(DATA).filter(n => fs.statSync(path.join(DATA, n)).isFile());
const pick = (cls, pred) => {
  for (const name of names) {
    const b = bytesOf(name), hs = S.zbUnityHeaderSize(b.subarray(0, 48));
    if (!hs) continue;
    const sf = S.zbUnityParse(b.subarray(0, hs));
    for (const o of sf.objects) if (o.classId === cls && (!pred || pred(name, o))) return [name, o.pathId];
  }
  return null;
};
const views = [
  pick(28, (n, o) => oracle[n] && oracle[n].textures[String(o.pathId)]),
  pick(49), pick(83), pick(213), pick(1), pick(114),
  vorbis.length ? [vorbis[0].name, +vorbis[0].id] : null,
].filter(Boolean);
const vorbisView = vorbis.length ? `${vorbis[0].name}/${vorbis[0].id}` : null;
// The page receives the views' files and the side files beside them, not the
// whole folder, since a headless page has limited room for blobs.
// The MonoBehaviour's scripts are in globalgamemanagers.assets, and its
// fields need the metadata and the binary, as from the app folder.
const handed = names.filter(n => views.some(([f]) => n === f || n.startsWith(f + '.')) || /^(resources\.resource|globalgamemanagers\.assets)$/.test(n))
  .concat(['global-metadata.dat', 'UnityFramework']);
fileBytes.clear();
const srv = await serve();
for (const device of [null, { width: 390, height: 844, scale: 2, mobile: true }]) {
  const r = await loadPage(srv.base + 'index.html', 'typeof remakeTake === "function" && document.readyState === "complete"', 240000, {
    device: device || undefined,
    then: async ({ evaluate }) => {
      const out = [];
      await evaluate('window.REMAKE_TEST = []');
      for (const n of handed) await evaluate(`(async () => { REMAKE_TEST.push(new File([await (await fetch(${JSON.stringify(filesBase)} + encodeURIComponent(${JSON.stringify(n)}))).arrayBuffer()], ${JSON.stringify(n)})); })()`);
      await evaluate(`(async () => {
        await remakeTake(REMAKE_TEST);
        document.getElementById('start').hidden = true; document.getElementById('views').hidden = false;
        location.hash = '#remake';
      })()`);
      const wait = async (test, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await evaluate(test)) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
      if (!await wait(`/objects/.test(document.getElementById('view').textContent)`)) out.push('#remake shows no files');
      for (const [file, id] of views) {
        await evaluate(`location.hash = ${JSON.stringify('#remake/' + encodeURIComponent(file) + '/' + id)}`);
        if (!await wait(`!!document.querySelector('#view pre.fields') && !/could not be shown/.test(document.getElementById('view').textContent)`)) out.push(`${file} ${id} did not show`);
        else if (await evaluate(`/could not be read|not open|Only its header/.test(document.getElementById('view').textContent)`)) out.push(`${file} ${id}: its script's fields were not read`);
        else if (`${file}/${id}` === vorbisView && !await wait(`!!document.querySelector('#view audio')`, 90000)) out.push(`${file} ${id}: the Vorbis sound did not play`);
      }
      out.push({ layoutMs: await evaluate('(async () => { await remakeLayouts(); return REMAKE_IL2CPP.ms; })()') });
      const shown = await evaluate(`[!!document.querySelector('#view canvas, #view audio, #view pre')]`);
      out.push(...(shown[0] ? [] : ['the last view shows nothing']));
      return out;
    },
  });
  for (const e of pageErrors(r.console)) fail(`page${device ? ' (phone)' : ''}: ${e.text}`);
  if (!r.met) fail('the page did not load');
  for (const m of r.more || []) {
    if (m && m.layoutMs !== undefined) console.log(`the page built the layouts in ${Math.round(m.layoutMs)} ms${device ? ' (phone)' : ''}`);
    else fail(`page${device ? ' (phone)' : ''}: ${m}`);
  }
}
srv.close();
files.close();
console.log(`the page opened the files and showed ${views.length} objects, at a desktop's and a phone's width`);
if (problems.length) { console.log('FAIL\n' + problems.join('\n')); process.exit(1); }
console.log('OK');
