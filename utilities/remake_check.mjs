// The 2015 remake's files read by zb-unity.js, against UnityPy
// (remake_oracle.py), and opened in the page in headless Chrome.
//
//   ZB_REMAKE=<the Data folder> node utilities/remake_check.mjs
//
// ZB_REMAKE defaults to the iPhone app's folder on a Mac where it is
// installed, and ZB_REMAKE_PY to the venv in zoombini-reference/remake.
// Without either, the check skips. It compares every file's object counts
// by class, every text asset's bytes, every sound's rate, channels and
// length, and every texture in a plain format pixel for pixel.
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
const S = site();
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const problems = [];
const fail = m => { if (problems.length < 30) problems.push(m); };

const oracle = JSON.parse(spawnSync(PY, [path.join(ROOT, 'utilities', 'remake_oracle.py'), DATA], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
const fileBytes = new Map();
const bytesOf = name => { if (!fileBytes.has(name)) fileBytes.set(name, new Uint8Array(fs.readFileSync(path.join(DATA, name)))); return fileBytes.get(name); };
const side = (p, offset, size) => bytesOf(S.zbUnitySideName(p)).subarray(offset, offset + size);

let objects = 0, texts = 0, sounds = 0, textures = 0;
for (const name of fs.readdirSync(DATA).sort()) {
  const p = path.join(DATA, name);
  if (!fs.statSync(p).isFile()) continue;
  const bytes = bytesOf(name), hs = S.zbUnityHeaderSize(bytes.subarray(0, 48));
  if (!hs) continue;
  const sf = S.zbUnityParse(bytes.subarray(0, hs)), want = oracle[name];
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
    if (o.classId === 49) {
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
    } else if (o.classId === 28 && want.textures[id]) {
      textures++;
      let data = v['image data'];
      if (!data.length && v.m_StreamData.size) data = side(v.m_StreamData.path, v.m_StreamData.offset, v.m_StreamData.size);
      const img = S.zbUnityTexturePixels(v.m_TextureFormat, v.m_Width, v.m_Height, data);
      if (!img || sha1(img.rgba) !== want.textures[id][1]) fail(`${name} Texture2D ${id} ${v.m_Name}: pixels differ`);
    }
  }
}
const plainWanted = Object.entries(oracle).filter(([n]) => fileBytes.has(n)).map(([, f]) => f).reduce((n, f) => n + Object.keys(f.textures).length, 0);
if (textures !== plainWanted) fail(`${textures} plain textures read, UnityPy has ${plainWanted}`);
console.log(`${objects.toLocaleString()} objects read, ${texts} text assets, ${sounds} sounds and ${textures} plain textures as UnityPy has them`);

// The page: the files handed to it, then a view of each kind.
const files = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1));
  const p = path.join(DATA, name);
  if (!p.startsWith(DATA) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': fs.statSync(p).size });
  fs.createReadStream(p).pipe(res);
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
  pick(49), pick(83), pick(213), pick(1),
].filter(Boolean);
const srv = await serve();
for (const device of [null, { width: 390, height: 844, scale: 2, mobile: true }]) {
  const r = await loadPage(srv.base + 'index.html', 'typeof remakeTake === "function" && document.readyState === "complete"', 20000, {
    device: device || undefined,
    then: async ({ evaluate }) => {
      const out = [];
      await evaluate(`(async () => {
        const names = ${JSON.stringify(names)}, files = [];
        for (const n of names) files.push(new File([await (await fetch(${JSON.stringify(filesBase)} + encodeURIComponent(n))).blob()], n));
        await remakeTake(files);
        document.getElementById('start').hidden = true; document.getElementById('views').hidden = false;
        location.hash = '#remake';
      })()`);
      const wait = async (test, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await evaluate(test)) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
      if (!await wait(`/objects/.test(document.getElementById('view').textContent)`)) out.push('#remake shows no files');
      for (const [file, id] of views) {
        await evaluate(`location.hash = ${JSON.stringify('#remake/' + encodeURIComponent(file) + '/' + id)}`);
        if (!await wait(`!!document.querySelector('#view pre.fields') && !/could not be shown/.test(document.getElementById('view').textContent)`)) out.push(`${file} ${id} did not show`);
      }
      const shown = await evaluate(`[!!document.querySelector('#view canvas, #view audio, #view pre')]`);
      out.push(...(shown[0] ? [] : ['the last view shows nothing']));
      return out;
    },
  });
  for (const e of pageErrors(r.console)) fail(`page${device ? ' (phone)' : ''}: ${e.text}`);
  if (!r.met) fail('the page did not load');
  for (const m of r.more || []) fail(`page${device ? ' (phone)' : ''}: ${m}`);
}
srv.close();
files.close();
console.log(`the page opened the files and showed ${views.length} objects, at a desktop's and a phone's width`);
if (problems.length) { console.log('FAIL\n' + problems.join('\n')); process.exit(1); }
console.log('OK');
