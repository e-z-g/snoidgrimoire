// The 2015 remake's files read by zb-unity.js, against UnityPy
// (remake_oracle.py), and opened in the page in headless Chrome.
//
//   ZB_REMAKE=<the Data folder> node utilities/remake_check.mjs
//
// Without ZB_REMAKE the check runs once for each build on this Mac: the
// iPhone app's Data folder, Steam's Mac build's, and the Android build's
// in zoombini-reference/remake-android. That folder has the APKs in apk/,
// and their files unzipped and joined by zoombini-workbench
// tools/remake/android.sh (Data/, and the libraries in unzipped/lib). The
// check also opens the APKs with zb-apk.js and compares every file out of
// them with the files joined there. ZB_REMAKE_PY
// defaults to the venv in zoombini-reference/remake. Without a build or
// UnityPy, the check skips. It compares every file's object counts
// by class, every text asset's bytes, every sound's rate, channels and
// length, and every texture (plain, ASTC or PVRTC) pixel for pixel. It
// builds the scripts' field layouts from the build's global-metadata.dat and
// its binary (zb-il2cpp.js): UnityFramework, Steam's GameAssembly.dylib or
// Android's libil2cpp.so file. For the iPhone and Android builds, both 2.4.8, it
// compares them class by class with the table that zoombini-workbench
// tools/remake/layouts.py writes from Cpp2IL's dump of the iPhone build
// (zoombini-reference/remake/layouts.json, ZB_REMAKE_LAYOUTS). For every
// build it reads every MonoBehaviour's fields by them, each to exactly its
// size.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { ROOT, site } from './load.mjs';
import { serve, loadPage, pageErrors } from './browser.mjs';

const BUILDS = [
  '/Applications/Zoombinis.app/Wrapper/Zoombinis.app/Data',
  path.join(os.homedir(), 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'Zoombinis', 'Zoombinis.app', 'Contents', 'Resources', 'Data'),
  path.join(ROOT, '..', 'zoombini-reference', 'remake-android', 'Data'),
];
if (!process.env.ZB_REMAKE) {
  const found = BUILDS.filter(b => fs.existsSync(b));
  if (!found.length) { console.log(`SKIP: needs the remake's Data folder (${BUILDS.join(' or ')})`); process.exit(0); }
  let status = 0;
  for (const b of found) {
    console.log(`${b}:`);
    status = spawnSync(process.execPath, [process.argv[1]], { env: { ...process.env, ZB_REMAKE: b }, stdio: 'inherit' }).status || status;
  }
  process.exit(status);
}
const DATA = process.env.ZB_REMAKE;
const PY = process.env.ZB_REMAKE_PY || path.join(ROOT, '..', 'zoombini-reference', 'remake', '.venv', 'bin', 'python');
if (!fs.existsSync(DATA) || !fs.existsSync(PY)) {
  console.log(`SKIP: needs the remake's Data folder (${DATA}) and UnityPy (${PY})`);
  process.exit(0);
}
// The iPhone build's app folder has Data and Frameworks. Steam's Mac build
// has Contents, with Resources/Data and Frameworks. The Android build's
// folder has apk/, Data/ and unzipped/lib.
const STEAM = path.basename(path.dirname(DATA)) === 'Resources';
const ANDROID = fs.existsSync(path.join(path.dirname(DATA), 'apk'));
const APP = STEAM ? path.dirname(path.dirname(DATA)) : path.dirname(DATA);
const LIB = path.join(APP, 'unzipped', 'lib', 'arm64-v8a');
const METADATA = STEAM ? path.join(DATA, 'il2cpp_data', 'Metadata', 'global-metadata.dat') : path.join(DATA, 'Managed', 'Metadata', 'global-metadata.dat');
const BINARY = STEAM ? path.join(APP, 'Frameworks', 'GameAssembly.dylib') : ANDROID ? path.join(LIB, 'libil2cpp.so') : path.join(APP, 'Frameworks', 'UnityFramework.framework', 'UnityFramework');
const FMOD = STEAM ? path.join(APP, 'Frameworks', 'UnityPlayer.dylib') : ANDROID ? path.join(LIB, 'libunity.so') : BINARY;
const LAYOUTS = process.env.ZB_REMAKE_LAYOUTS || (STEAM ? null : path.join(ROOT, '..', 'zoombini-reference', 'remake', 'layouts.json'));
for (const p of [METADATA, BINARY, FMOD, LAYOUTS].filter(Boolean)) if (!fs.existsSync(p)) { console.log(`SKIP: needs ${p}`); process.exit(0); }
const vorbis = [];
const S = site();
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const problems = [];
const fail = m => { if (problems.length < 30) problems.push(m); };

const VORBIS_DIR = path.join(path.dirname(PY), '..', '..', STEAM ? 'vorbis-oracle-steam-mac' : ANDROID ? 'vorbis-oracle-android' : 'vorbis-oracle');

// The Android build's APKs: every file zb-apk.js reads out of them, against
// the same file unzipped and joined.
if (ANDROID) {
  const apkDir = path.join(APP, 'apk');
  const apks = await Promise.all(fs.readdirSync(apkDir).filter(n => n.endsWith('.apk')).map(async n => new File([await fs.openAsBlob(path.join(apkDir, n))], n)));
  const t0 = performance.now(), out = await S.zbApkFiles(apks), ms = performance.now() - t0;
  const where = n => n === 'global-metadata.dat' ? METADATA : n === path.basename(BINARY) ? BINARY : n === path.basename(FMOD) ? FMOD : path.join(DATA, n);
  let same = 0;
  for (const f of out) {
    if (!fs.existsSync(where(f.name))) { fail(`${f.name}, out of the APKs, is not among the files joined`); continue; }
    if (sha1(new Uint8Array(await f.arrayBuffer())) === sha1(fs.readFileSync(where(f.name)))) same++;
    else fail(`${f.name}: out of the APKs it differs from the file joined`);
  }
  const joined = fs.readdirSync(DATA).filter(n => fs.statSync(path.join(DATA, n)).isFile()).length + 3;
  if (out.length !== joined) fail(`${out.length} files out of the APKs, against ${joined} joined`);
  console.log(`${same.toLocaleString()} of ${out.length.toLocaleString()} files out of ${apks.length} APKs the same as those joined, read in ${Math.round(ms)} ms`);
}
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
// The Vorbis sounds: each one's setup header found in FMOD's binary, made
// into an Ogg file, decoded by ffmpeg and held to FMOD's decoding (written
// by the oracle as WAV), over the samples the sound has.
{
  const setups = S.zbVorbisSetups(new Uint8Array(fs.readFileSync(FMOD)), vorbis.map(v => v.s.setupCrc));
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
  console.log(`${vorbis.length} Vorbis sounds, ${setups.size} setup headers found in ${path.basename(FMOD)}, ${ffmpeg ? matched + ' matching FMOD\'s decoding' : 'not decoded (no ffmpeg)'}`);
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
const layouts = built.layouts, expectedLayouts = LAYOUTS ? JSON.parse(fs.readFileSync(LAYOUTS, 'utf8')) : {};
let layoutsSame = 0;
for (const [cls, expected] of Object.entries(expectedLayouts)) {
  if (JSON.stringify(layouts[cls]) === JSON.stringify(expected)) layoutsSame++;
  else fail(`layout ${cls}: ${JSON.stringify(layouts[cls])} against layouts.py's ${JSON.stringify(expected)}`);
}
console.log(`${LAYOUTS ? `${layoutsSame} of ${Object.keys(expectedLayouts).length} layouts as layouts.py has them, of ` : ''}${Object.keys(layouts).length} built in ${Math.round(buildMs)} ms (registration at 0x${built.registration.toString(16)}, ${built.typeCount.toLocaleString()} types)`);

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

// Scenario's reading of the remake: every .swf read to its last byte, with
// every clip's first frame and its atlases found by their Resources paths;
// every scene's sprites and clips, as zbRemakeScene has them, found
// in the files; the town's four backdrops; and the trait names that the
// Snoids pane reads from Bubblewonder Abyss, against REMAKE.md's table.
const objAt = (name, id) => {
  const sf = parsed.get(name);
  if (!sf) return null;
  if (!sf.byId) sf.byId = new Map(sf.objects.map(o => [o.pathId, o]));
  return sf.byId.get(id) || null;
};
const readAt = (name, id) => { const sf = parsed.get(name), o = objAt(name, id), b = bytesOf(name); return S.zbUnityRead(sf, o, b.subarray(sf.dataOffset + o.start, sf.dataOffset + o.start + o.size)); };
const targetOf = (name, p) => {
  if (!p || (!p.m_FileID && !p.m_PathID)) return null;
  const t = p.m_FileID === 0 ? name : S.zbUnitySideName(parsed.get(name).externals[p.m_FileID - 1]);
  return objAt(t, p.m_PathID) ? { file: t, pathId: p.m_PathID } : null;
};
const sceneApi = {
  objects: n => parsed.get(n).objects,
  async read(n, id) {
    const v = readAt(n, id);
    if (objAt(n, id).classId !== 114) return v;
    const cls = scriptOf(n, v.m_Script);
    if (cls) try { Object.assign(v, S.zbUnityScriptFields(layouts, cls, v.rest, parsed.get(n).little)); } catch (e) { /* the header only */ }
    return v;
  },
  target: targetOf,
};
const byPath = new Map();
let sceneList = [], sortingLayers = [];
for (const o of parsed.get('globalgamemanagers').objects) {
  if (o.classId === 147) for (const [p, ptr] of readAt('globalgamemanagers', o.pathId).m_Container) {
    const t = targetOf('globalgamemanagers', ptr);
    if (!t) continue;
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(t);
  }
  if (o.classId === 141) sceneList = readAt('globalgamemanagers', o.pathId).scenes;
  if (o.classId === 78) sortingLayers = readAt('globalgamemanagers', o.pathId).m_SortingLayers;
}
const atPath = (p, cls) => (byPath.get(p.toLowerCase()) || []).find(t => objAt(t.file, t.pathId).classId === cls) || null;
const swfs = new Map();
const swfAt = p => {
  const k = p.toLowerCase();
  if (!swfs.has(k)) { const t = atPath(k + '/' + k.split('/').pop(), 49); swfs.set(k, t ? S.zbUniSwfRead(readAt(t.file, t.pathId).m_Script) : null); }
  return swfs.get(k);
};
let swfCount = 0, clipCount = 0, swfBytes = 0;
for (const [p, list] of byPath) {
  if (!/\.swf$/.test(p)) continue;
  const swfPath = p.slice(0, p.lastIndexOf('/'));
  let swf;
  try { swf = swfAt(swfPath); swfBytes += readAt(list[0].file, list[0].pathId).m_Script.length; }
  catch (e) { fail(`${p}: ${e.message}`); continue; }
  swfCount++;
  for (const [name, clip] of Object.entries(swf.byClass)) {
    if (clip.kind !== 'clip') continue;
    clipCount++;
    try {
      for (const op of S.zbUniSwfFrame(swf, name, 0)) if (!atPath(swfPath + '/' + S.zbUniSwfAtlasName(swfPath, op.texture), 28)) throw new Error(`no atlas ${op.texture}`);
    } catch (e) { fail(`${p} ${name}: ${e.message}`); }
  }
}
console.log(`${swfCount} uniSWF files read to their last byte (${swfBytes.toLocaleString()} bytes), the first frames of ${clipCount.toLocaleString()} clips with their atlases`);
let sceneSprites = 0, sceneClips = 0, scenesRead = 0;
const sceneFiles = new Map();   // a scene with sprites -> the files its sprites and textures are in
for (let i = 0; i < sceneList.length; i++) {
  if (!parsed.has('level' + i)) continue;
  let scene;
  try { scene = await S.zbRemakeScene('level' + i, sceneApi, sortingLayers); } catch (e) { fail(`level${i}: ${e.message}`); continue; }
  scenesRead++;
  const files = new Set(['level' + i]);
  for (const it of scene.items) {
    if (it.kind === 'sprite') {
      const tex = targetOf(it.file, readAt(it.file, it.pathId).m_RD.texture);
      if (!tex) fail(`level${i} ${it.name}: its sprite's texture is not found`);
      else { sceneSprites++; files.add(it.file); files.add(tex.file); }
    } else {
      const swf = swfAt(it.swf);
      if (!swf || !swf.byClass[it.symbol]) fail(`level${i} ${it.name}: the clip ${it.symbol} of ${it.swf} is not found`);
      else sceneClips++;
    }
  }
  if (files.size > 1) sceneFiles.set(i, files);
}
const towns = ['north', 'east', 'south', 'west'].map(d => atPath(`zoombiniville/zoombiniville_${d}_bg`, 1));
const townItems = [];
for (const t of towns) townItems.push(t ? (await S.zbRemakeScene(t.file, sceneApi, sortingLayers, t.pathId)).items.length : 0);
if (townItems.some(n => !n)) fail(`the town's backdrops draw ${townItems.join(', ')} things`);
console.log(`${scenesRead} scenes read, with ${sceneSprites.toLocaleString()} sprites and ${sceneClips} clips found, and the town's four backdrops with ${townItems.join(', ')}`);
const expectedNames = { hair: ['shaggy', 'polytail', 'tuft', 'buzz', 'hat'], eyes: ['dots', 'sleepy', 'sunglasses', 'glasses', 'single'],
  nose: ['yellow', 'purple', 'red', 'green', 'blue'], feet: ['wheels', 'propeller', 'spring', 'sneakers', 'skates'] };
const abyss = sceneList.findIndex(p => /bubblewonder/i.test(p));
let traitNames = null;
for (const o of (parsed.get('level' + abyss) || { objects: [] }).objects) {
  if (o.classId !== 114) continue;
  const v = await sceneApi.read('level' + abyss, o.pathId);
  if (!v._zoombiniHair) continue;
  traitNames = {};
  for (const [t, f] of [['hair', '_zoombiniHair'], ['eyes', '_zoombiniEyes'], ['nose', '_zoombiniNose'], ['feet', '_zoombiniFeet']])
    traitNames[t] = v[f].map(p => { const at = targetOf('level' + abyss, p); return at ? readAt(at.file, at.pathId).m_Name.replace(/^[a-z]+_/, '') : ''; });
}
if (JSON.stringify(traitNames) !== JSON.stringify(expectedNames)) fail(`the trait names read ${JSON.stringify(traitNames)}`);
else console.log('the twenty trait names read from BubblewonderAbyssGrid as REMAKE.md has them');
console.log(`${objects.toLocaleString()} objects read, ${texts} text assets, ${sounds} sounds and ${textures} textures as UnityPy has them (decoded in ${(decodeMs / 1000).toFixed(1)} s)`);

// The page: the files handed to it, then a view of each kind.
const handedPath = n => n === 'global-metadata.dat' ? METADATA : n === path.basename(BINARY) ? BINARY : n === path.basename(FMOD) ? FMOD : path.join(DATA, n);
const files = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1));
  const p = handedPath(name);
  if (!p.startsWith(APP) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': fs.statSync(p).size });
  fs.createReadStream(p).on("error", e => console.log("serve", name, e.message)).pipe(res).on("error", e => console.log("send", name, e.message));
});
await new Promise(r => files.listen(0, '127.0.0.1', r));
const filesBase = `http://127.0.0.1:${files.address().port}/`;
const names = fs.readdirSync(DATA).filter(n => fs.statSync(path.join(DATA, n)).isFile());
// Each view comes from the smallest file that has one, counted with its
// side files, so that the page is handed as little as it can be.
const weight = n => names.filter(m => m === n || m.startsWith(n + '.')).reduce((t, m) => t + fs.statSync(path.join(DATA, m)).size, 0);
const byWeight = [...names].sort((a, b) => weight(a) - weight(b));
const pick = (cls, pred) => {
  for (const name of byWeight) {
    const b = bytesOf(name), hs = S.zbUnityHeaderSize(b.subarray(0, 48));
    if (!hs) continue;
    const sf = S.zbUnityParse(b.subarray(0, hs));
    for (const o of sf.objects) if (o.classId === cls && (!pred || pred(name, o))) return [name, o.pathId];
  }
  return null;
};
// The texture is one with pixels: an empty one's SHA-1 is that of no bytes.
const textureView = pick(28, (n, o) => oracle[n] && oracle[n].textures[String(o.pathId)] && oracle[n].textures[String(o.pathId)][1] !== sha1(new Uint8Array(0))), spriteView = pick(213);
const views = [
  textureView, pick(49), pick(83), spriteView, pick(1), pick(114),
  vorbis.length ? pick(83, (n, o) => vorbis.some(v => v.name === n && v.id === String(o.pathId))) : null,
].filter(Boolean);
const vorbisView = vorbis.length ? views[views.length - 1].join('/') : null;
// The page receives the views' files, not the whole folder, since a
// headless page has limited room for blobs. The texture and the sprite
// read their pixels from the .resS beside their file, and the sounds from
// resources.resource. In the Android build each file named by a hex id
// has its pixels and sounds in the .resource beside it. The MonoBehaviour's scripts are in
// globalgamemanagers.assets, and its fields need the metadata and the
// binary, as from the app folder.
const pixelFiles = [textureView, spriteView].filter(Boolean).map(([f]) => f + '.resS');
// The scene drawn in the page is the one whose sprites' files weigh least.
const sceneWeight = files => [...files].reduce((t, f) => t + weight(f), 0);
const [sceneShown, sceneShownFiles] = [...sceneFiles].sort((a, b) => sceneWeight(a[1]) - sceneWeight(b[1]))[0] || [null, new Set()];
for (const f of sceneShownFiles) pixelFiles.push(f, f + '.resS', f + '.resource');
const handed = names.filter(n => views.some(([f]) => n === f || n === f + '.resource') || pixelFiles.includes(n) || sceneShownFiles.has(n) || /^(resources\.resource|globalgamemanagers|globalgamemanagers\.assets)$/.test(n))
  .concat([...new Set(['global-metadata.dat', path.basename(BINARY), path.basename(FMOD)])]);
fileBytes.clear();
console.log(`the page is handed ${handed.length} files, ${Math.round(handed.reduce((t, n) => t + fs.statSync(handedPath(n)).size, 0) / 1e6)} MB (${handed.join(', ')})`);
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
      // The remake in Scenario, Components and the Resources list, from the
      // catalog in globalgamemanagers.
      const shows = async (hash, test, what) => {
        await evaluate(`location.hash = ${JSON.stringify(hash)}`);
        if (!await wait(test)) out.push(`${hash}: ${what}`);
      };
      await shows('#scenario/places', `/Allergic Cliffs/.test(document.getElementById('view').textContent) && document.querySelectorAll('#view tr').length >= 24`, 'the scenes are not listed by name');
      await shows('#remake/@resources', `document.querySelectorAll('#view .ids a').length >= 1000`, 'the Resources paths are not listed');
      await shows('#components/text', `document.querySelectorAll('#view details a').length >= 1`, 'the text assets are not in the gallery');
      await shows('#scenario/puzzles', `document.querySelectorAll('#view details').length === 12`, 'the twelve puzzles are not listed');
      if (sceneShown != null) await shows(`#scenario/places/${sceneShown}`, `(() => { const c = document.querySelector('#view canvas.scene'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== 0x33 || d[i + 1] !== 0x33 || d[i + 2] !== 0x44) n++; return n > 1000 && document.querySelectorAll('#view tr').length > 1; })()`, 'the scene is not drawn');
      await shows('#components/sounds', `document.querySelectorAll('#view button.play').length >= 1`, 'the sounds are not in the gallery');
      await evaluate(`(() => { window.Audio = function () { return { play() {} }; }; const b = document.querySelector('#view button.play'); b.closest('details').open = true; b.click(); })()`);
      if (!await wait(`/Hz/.test(document.querySelector('#view td.note').textContent)`)) out.push('a sound in the gallery did not play');
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
// The Android build's APKs opened in the page as a visitor picks them:
// base.apk and the CPU's split, without the 1 GB asset pack, which is too
// large for a headless page. Their files are inflated in the browser,
// and a MonoBehaviour of level0 shows its script's fields.
if (ANDROID) {
  const apkDir = path.join(APP, 'apk'), small = ['base.apk', 'split_config.arm64_v8a.apk'];
  const apkServer = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.slice(1));
    if (!small.includes(name)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': fs.statSync(path.join(apkDir, name)).size });
    fs.createReadStream(path.join(apkDir, name)).pipe(res);
  });
  await new Promise(r => apkServer.listen(0, '127.0.0.1', r));
  const apkBase = `http://127.0.0.1:${apkServer.address().port}/`;
  const level0 = parsed.get('level0'), mono = level0 && level0.objects.find(o => o.classId === 114);
  const r = await loadPage(srv.base + 'index.html', 'typeof remakeTake === "function" && document.readyState === "complete"', 240000, {
    then: async ({ evaluate }) => {
      const out = [];
      const took = await evaluate(`(async () => {
        const files = [];
        for (const n of ${JSON.stringify(small)}) files.push(new File([await (await fetch(${JSON.stringify(apkBase)} + n)).blob()], n));
        await remakeOpen(files);
        return [REMAKE_FILES.size, !!REMAKE_IL2CPP.binary, !!REMAKE_IL2CPP.fmod, !!REMAKE_IL2CPP.metadata];
      })()`);
      out.push({ took });
      if (mono) {
        await evaluate(`location.hash = ${JSON.stringify('#remake/level0/' + mono.pathId)}`);
        const t = Date.now();
        while (Date.now() - t < 30000 && !await evaluate(`!!document.querySelector('#view pre.fields')`)) await new Promise(res => setTimeout(res, 200));
        if (await evaluate(`!document.querySelector('#view pre.fields') || /could not be read|not open|Only its header/.test(document.getElementById('view').textContent)`)) out.push('the MonoBehaviour of level0 did not show its fields');
      }
      return out;
    },
  });
  for (const e of pageErrors(r.console)) fail(`page (APKs): ${e.text}`);
  if (!r.met) fail('the page did not load (APKs)');
  for (const m of r.more || []) {
    if (m && m.took) {
      const [n, binary, fmod, metadata] = m.took;
      if (!n || !binary || !fmod || !metadata) fail(`page (APKs): ${n} files, binary ${binary}, FMOD ${fmod}, metadata ${metadata}`);
      else console.log(`the page opened base.apk and the CPU's split, ${n} Unity files with the metadata and both libraries`);
    } else fail(`page (APKs): ${m}`);
  }
  apkServer.close();
}
srv.close();
files.close();
console.log(`the page opened the files and showed ${views.length} objects, at a desktop's and a phone's width`);
if (problems.length) { console.log('FAIL\n' + problems.join('\n')); process.exit(1); }
console.log('OK');
