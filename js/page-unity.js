/* page-unity.js -- the 2015 remake's files under Data (#remake), read by
   zb-unity.js. The visitor opens the remake's Data folder. The files stay
   as picked, and the page reads a piece at a time, since the iPhone
   build's folder is about 600 MB.
   Read:
   #remake has the files, with their objects counted by class.
   #remake/<file> has a file's objects, by class and name.
   #remake/<file>/<path id> is one object: a texture drawn where its format
   is a plain one, a sprite cut from its texture, a text asset as text, a
   sound played and saved as WAV where it is PCM, a MonoBehaviour as its
   script's class and fields, and anything else as
   its fields. A MonoBehaviour with an empty name is listed by its
   GameObject's name and its script's class.
   The visitor opens or drops Zoombinis.app, or any folder inside it that
   has Data, or the Data folder alone. The Unity files are the files
   directly in a folder named Data or <name>_Data, at any depth:
   Wrapper/Zoombinis.app/Data in the iPhone build, Contents/Resources/Data
   in Steam's Mac build and Zoombinis_Data in Steam's Windows build.
   From the app the page
   also reads global-metadata.dat (Data/Managed/Metadata in the iPhone
   build, Resources/Data/il2cpp_data/Metadata in Steam's) and the binary
   with the game's code (Frameworks/UnityFramework.framework/UnityFramework,
   or Frameworks/GameAssembly.dylib), and builds the scripts' field layouts
   from them (zb-il2cpp.js) on the first MonoBehaviour shown. In Steam's
   Windows build they are Zoombinis_Data/il2cpp_data/Metadata and
   GameAssembly.dll. Without them a MonoBehaviour shows its header only.
   FMOD's Vorbis setup headers are in UnityFramework in the iPhone build,
   in Frameworks/UnityPlayer.dylib in Steam's Mac build and in
   UnityPlayer.dll in its Windows build. The Android build comes as its
   APKs, and zb-apk.js reads the Unity files, the metadata, the game's code
   (libil2cpp.so) and FMOD (libunity.so) out of them.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-saves.js. */

const REMAKE_FILES = new Map();   // name -> { name, file (a Blob), sf, names: Map pathId -> name }
const REMAKE_IL2CPP = { metadata: null, binary: null, fmod: null, layouts: null, ms: 0 };
// The MP3 files of the soundtrack that comes with Steam's copies, which
// name the tunes (zb-tunes.js).
const REMAKE_SOUNDTRACK = [];

function isRemakeHash() { return /^#remake(\/|$)/.test(location.hash); }
function remakeHashParts() {
  const [, file, id] = decodeURIComponent(location.hash).split('/');
  return { file: file || null, id: id != null && id !== '' ? +id : null };
}
const remakeLink = (file, id) => '#remake' + (file ? '/' + encodeURIComponent(file) + (id != null ? '/' + id : '') : '');

async function remakeSlice(file, start, end) { return new Uint8Array(await file.slice(start, end).arrayBuffer()); }

/* Take the picked files: SerializedFiles are read for their metadata, and
   the .resS and .resource files are side files. */
async function remakeTake(files, heads = null) {
  let took = 0;
  REMAKE_CATALOG = null;
  if (typeof remakeForget === 'function') remakeForget();
  const apks = files.filter(f => /\.apk$/i.test(f.name));
  if (apks.length) files = files.filter(f => !apks.includes(f)).concat(await zbApkFiles(apks));
  // Only the files directly in Data are Unity's, from a picked or dropped
  // folder. A .resS or .resource file has no header.
  const inData = f => { const parts = (f.remakePath || f.webkitRelativePath || '').split('/'); return parts.length < 2 || /^(.+_)?Data$/.test(parts[parts.length - 2]); };
  const code = /^(global-metadata\.dat|UnityFramework|GameAssembly\.(dylib|dll)|UnityPlayer\.(dylib|dll)|libil2cpp\.so|libunity\.so)$/;
  // Every file's header is read together, since each read of a file at an
  // address is a request.
  // An index of a folder at an address has the headers already (zb-range.js).
  const sfs = await Promise.all(files.map(async f => {
    if (/^\./.test(f.name) || code.test(f.name) || /\.(resS|resource)$/i.test(f.name) || !inData(f)) return null;
    const known = heads && heads.get(f.name);
    if (known && known.size === f.size) { try { return zbUnityParse(known.bytes); } catch (e) { return null; } }
    const head = await remakeSlice(f, 0, 48).catch(() => null);
    const size = head && zbUnityHeaderSize(head);
    if (!size || size >= f.size) return null;
    try { return zbUnityParse(await remakeSlice(f, 0, size)); } catch (e) { return null; }
  }));
  for (const [i, f] of files.entries()) {
    if (/^\./.test(f.name)) continue;
    if (ZB_SOUNDTRACK_FILE.test(f.remakePath || f.webkitRelativePath || '')) { REMAKE_SOUNDTRACK.push(f); continue; }
    if (f.name === 'global-metadata.dat') { REMAKE_IL2CPP.metadata = f; REMAKE_IL2CPP.layouts = null; continue; }
    if (/^(UnityFramework|GameAssembly\.(dylib|dll)|libil2cpp\.so)$/.test(f.name)) { REMAKE_IL2CPP.binary = f; REMAKE_IL2CPP.layouts = null; }
    if (/^(UnityFramework|UnityPlayer\.(dylib|dll)|libunity\.so)$/.test(f.name)) { REMAKE_IL2CPP.fmod = f; REMAKE_VORBIS.clear(); }
    if (code.test(f.name) || !inData(f)) continue;
    const sf = sfs[i];
    if (!sf && !/\.(resS|resource)$/i.test(f.name)) continue;
    REMAKE_FILES.set(f.name, { name: f.name, file: f, sf, names: null });
    took++;
  }
  return took;
}

/* The remake's catalog, read once from globalgamemanagers: the scenes'
   paths in build order (BuildSettings), where scene n is the file level<n>,
   and each Resources path by the file and object it names
   (ResourceManager's container). In the Android build each Resources
   asset is a separate file, named by a hex id. */
let REMAKE_CATALOG = null;
async function remakeCatalog() {
  if (REMAKE_CATALOG) return REMAKE_CATALOG;
  const cat = { scenes: [], byObject: new Map(), byFile: new Map() };
  const gg = REMAKE_FILES.get('globalgamemanagers');
  if (gg && gg.sf) for (const o of gg.sf.objects) {
    if (o.classId !== 141 && o.classId !== 147) continue;
    let v;
    try { v = await remakeObject(gg, o); } catch (e) { continue; }
    if (o.classId === 141) cat.scenes = v.scenes || [];
    else for (const [p, ptr] of v.m_Container || []) {
      const file = ptr.m_FileID ? zbUnitySideName(gg.sf.externals[ptr.m_FileID - 1]) : gg.name;
      cat.byObject.set(file + '/' + ptr.m_PathID, p);
      if (!cat.byFile.has(file)) cat.byFile.set(file, p);
    }
  }
  return (REMAKE_CATALOG = cat);
}
const isRemakeIdFile = name => /^[0-9a-f]{32}$/.test(name);
/* A level file's scene name ("AllergicCliffs"), or null. */
function remakeSceneName(name) {
  const m = /^level(\d+)$/.exec(name), p = m && REMAKE_CATALOG && REMAKE_CATALOG.scenes[+m[1]];
  return p ? p.split('/').pop().replace(/\.unity$/, '') : null;
}

/* The scripts' field layouts, built once from the metadata and the
   binary, or null where either is not open. */
async function remakeLayouts() {
  const { metadata, binary } = REMAKE_IL2CPP;
  if (!metadata || !binary) return null;
  if (!REMAKE_IL2CPP.layouts) {
    const t0 = performance.now();
    REMAKE_IL2CPP.layouts = zbIl2cppLayouts(new Uint8Array(await metadata.arrayBuffer()), (at, n) => remakeSlice(binary, at, at + n))
      .then(r => { REMAKE_IL2CPP.ms = performance.now() - t0; return r.layouts; });
  }
  return REMAKE_IL2CPP.layouts;
}

/* An object's bytes and fields. */
async function remakeObject(entry, obj) {
  const at = entry.sf.dataOffset + obj.start;
  const bytes = await remakeSlice(entry.file, at, at + obj.size);
  return zbUnityRead(entry.sf, obj, bytes);
}

/* Side data: { path, offset, size } in a file beside this one. */
async function remakeSide(path, offset, size) {
  const side = REMAKE_FILES.get(zbUnitySideName(path));
  if (!side) throw new Error(`${zbUnitySideName(path)} is not among the files opened`);
  return remakeSlice(side.file, offset, offset + size);
}

/* The file and object a PPtr points at, or null where the file is not
   open. File id 0 is this file, and n the nth of its external files. */
function remakeTarget(entry, pptr) {
  if (!pptr || (!pptr.m_FileID && !pptr.m_PathID)) return null;
  const target = pptr.m_FileID === 0 ? entry : REMAKE_FILES.get(zbUnitySideName(entry.sf.externals[pptr.m_FileID - 1]));
  const obj = target && target.sf && target.sf.objects.find(o => o.pathId === pptr.m_PathID);
  return obj ? { entry: target, obj } : null;
}

/* A MonoBehaviour's script class ("Namespace.Class"), or null where its
   MonoScript is in a file not open. */
const REMAKE_SCRIPTS = new Map();
async function remakeScriptClass(entry, pptr) {
  const t = remakeTarget(entry, pptr);
  if (!t) return null;
  const k = t.entry.name + '/' + t.obj.pathId;
  if (!REMAKE_SCRIPTS.has(k)) {
    const s = await remakeObject(t.entry, t.obj);
    REMAKE_SCRIPTS.set(k, (s.m_Namespace ? s.m_Namespace + '.' : '') + s.m_ClassName);
  }
  return REMAKE_SCRIPTS.get(k);
}

/* The names of a file's objects that have one (read once, on first view).
   A MonoBehaviour without one is named by its GameObject and script. */
async function remakeNames(entry) {
  if (entry.names) return entry.names;
  const names = new Map(), unnamed = [];
  for (const o of entry.sf.objects) {
    if (o.classId !== 114 && !ZB_UNITY_TYPES[o.classId]) continue;
    try {
      const v = await remakeObject(entry, o);
      if (v && v.m_Name) names.set(o.pathId, v.m_Name);
      else if (o.classId === 114) unnamed.push([o, v]);
    } catch (e) { /* unnamed */ }
  }
  for (const [o, v] of unnamed) {
    const go = v.m_GameObject.m_FileID === 0 && names.get(v.m_GameObject.m_PathID);
    const cls = await remakeScriptClass(entry, v.m_Script).catch(() => null);
    const name = [go, cls && `(${cls.split('.').pop()})`].filter(Boolean).join(' ');
    if (name) names.set(o.pathId, name);
  }
  entry.names = names;
  return names;
}

function remakeSideHtml(h) {
  let html = REMAKE_ADDRESS ? `<p class="remembered">Read from an address saved in this browser. <a data-clear-address>Clear</a></p>` : '';
  if (REMAKE_BUILDS.list.length > 1) html += `<p class="remembered">${REMAKE_BUILDS.list.map(([name, path]) => path === REMAKE_BUILDS.open ? `<b>${esc(name)}</b>` : `<a data-build="${esc(path)}">${esc(name)}</a>`).join(' · ')}</p>`;
  const files = [...REMAKE_FILES.values()].filter(e => e.sf).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const ids = files.filter(e => isRemakeIdFile(e.name)).length, cat = REMAKE_CATALOG;
  if (cat && cat.byObject.size) html += `<div class="arc${h.file === '@resources' || (h.file && isRemakeIdFile(h.file)) ? ' on' : ''}" data-arc="remake/@resources"><span class="name">Resources</span><span class="place">${plural(cat.byObject.size, 'asset')}${ids ? ` in ${plural(ids, 'file')}` : ''}</span></div>`;
  for (const e of files) {
    if (isRemakeIdFile(e.name)) continue;
    const scene = remakeSceneName(e.name);
    html += `<div class="arc${h.file === e.name ? ' on' : ''}" data-arc="${esc(remakeLink(e.name).slice(1))}"><span class="name">${esc(e.name)}</span><span class="place">${scene ? esc(scene) + ' · ' : ''}${plural(e.sf.objects.length, 'object')}</span></div>`;
  }
  return html;
}

/* The Resources folder's assets by path, grouped by folder, each a link
   to its object. */
function remakeResourcesHtml() {
  const groups = new Map();
  for (const [key, p] of REMAKE_CATALOG.byObject) {
    const cut = p.lastIndexOf('/'), dir = cut < 0 ? '(top)' : p.slice(0, cut);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push([p.slice(cut + 1), key]);
  }
  let html = `<h1>Resources</h1><p class="sub">${plural(REMAKE_CATALOG.byObject.size, 'asset')} that the remake loads by path, from its Resources folder, grouped by folder.</p>`;
  for (const [dir, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    html += `<details class="type"${list.length <= 40 ? ' open' : ''}><summary><span>${esc(dir)}</span><span class="n">${list.length}</span></summary><div class="ids">`;
    for (const [name, key] of list.sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))) {
      const cut = key.lastIndexOf('/');
      html += `<a href="${remakeLink(key.slice(0, cut), +key.slice(cut + 1))}">${esc(name)}</a>`;
    }
    html += '</div></details>';
  }
  return html;
}

/* Each render's number: a render that finishes after a later one began
   leaves the view to the later one. */
let REMAKE_SEQ = 0;
async function renderRemake() {
  const seq = ++REMAKE_SEQ;
  const h = remakeHashParts(), view = $('view');
  await remakeCatalog();
  if (seq !== REMAKE_SEQ) return;
  const fileLabel = h.file === '@resources' ? 'Resources' : h.file && isRemakeIdFile(h.file) && REMAKE_CATALOG.byFile.get(h.file) || h.file;
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><a href="#remake">2015 remake</a>'
    + (h.file ? `<span class="sep">›</span><a href="${remakeLink(h.file)}">${esc(fileLabel)}</a>` : '')
    + (h.id != null ? `<span class="sep">›</span><span>${h.id}</span>` : '');
  renderSide({ name: '#remake' }, { archive: null, tag: null, id: null });
  const side = $('side');
  side.insertAdjacentHTML('beforeend', remakeSideHtml(h));
  for (const el of side.querySelectorAll('.arc[data-arc^="remake/"]')) el.addEventListener('click', () => { location.hash = '#' + el.dataset.arc; });
  for (const el of side.querySelectorAll('[data-build]')) el.addEventListener('click', () => remakeOpenAddress(REMAKE_ADDRESS, true, el.dataset.build));
  const clear = side.querySelector('[data-clear-address]');
  if (clear) clear.addEventListener('click', () => {
    try { localStorage.removeItem(REMAKE_ADDRESS_KEY); localStorage.removeItem(REMAKE_BUILD_KEY); } catch (e) { /* nothing saved */ }
    REMAKE_ADDRESS = null;
    clear.parentNode.remove();
    setStatus(`The address is cleared, and the next visit opens the remake only from files you choose.`);
  });
  const entry = h.file && REMAKE_FILES.get(h.file);
  try {
    if (h.file === '@resources') view.innerHTML = remakeResourcesHtml();
    else if (!entry) view.innerHTML = remakeHomeHtml();
    else if (h.id == null) await renderRemakeFile(entry, view, seq);
    else await renderRemakeObject(entry, h.id, view, seq);
  } catch (e) {
    view.innerHTML += `<p class="bad">This could not be shown (${esc(e.message)}).</p>`;
    console.error(e);
  }
  const pick = $('remakePick');
  if (pick) pick.addEventListener('change', async e => {
    const n = await remakeTake([...e.target.files]);
    e.target.value = '';
    setStatus(n ? '' : 'No Unity files were in that folder.', !n);
    renderRemake();
  });
}

function remakeHomeHtml() {
  const files = [...REMAKE_FILES.values()].filter(e => e.sf);
  let html = '<h1>The 2015 remake</h1><p class="sub">FableVision and TERC remade the game in Unity in 2015. Its files are read here, and nothing leaves the page. Open or drop its <code>Zoombinis.app</code>. On a Mac with the iPhone app installed, that is <code>/Applications/Zoombinis.app</code>. Steam\'s Mac copy is in <code>~/Library/Application Support/Steam/steamapps/common/Zoombinis</code>. The Android app opens as its three APKs, copied off the phone with <code>adb</code>. The command <code>adb shell pm path edu.terc.zoombinis.f2p</code> prints their paths. The <code>Data</code> folder alone also opens, without the scripts\' fields.</p>'
    + '<div class="tools"><label class="btn">Folder…<input type="file" id="remakePick" webkitdirectory hidden></label></div>';
  if (!files.length) return html + '<p class="note">No remake files are open.</p>';
  const byClass = new Map();
  for (const e of files) for (const o of e.sf.objects) byClass.set(o.classId, (byClass.get(o.classId) || 0) + 1);
  const unity = files[0].sf.unityVersion;
  html += `<p>${plural(files.length, 'file')} from Unity ${esc(unity)}, with ${plural(files.reduce((n, e) => n + e.sf.objects.length, 0), 'object')}.</p><table class="plain"><tr><th>class</th><th>objects</th></tr>`;
  for (const [id, n] of [...byClass].sort((a, b) => b[1] - a[1])) html += `<tr><td>${esc(zbUnityClassName(id))}</td><td>${n.toLocaleString()}</td></tr>`;
  return html + '</table>';
}

async function renderRemakeFile(entry, view, seq) {
  view.innerHTML = `<h1>${esc(entry.name)}</h1><p class="note">Reading the names…</p>`;
  const names = await remakeNames(entry);
  if (seq !== REMAKE_SEQ) return;
  const groups = new Map();
  for (const o of entry.sf.objects) {
    if (!groups.has(o.classId)) groups.set(o.classId, []);
    groups.get(o.classId).push(o);
  }
  const scene = remakeSceneName(entry.name), resource = REMAKE_CATALOG && REMAKE_CATALOG.byFile.get(entry.name);
  const what = scene ? `The scene ${esc(scene)}, ` : isRemakeIdFile(entry.name) && resource ? `The Resources asset <code>${esc(resource)}</code>, ` : '';
  let html = `<h1>${esc(entry.name)}</h1><p class="sub">${what}${plural(entry.sf.objects.length, 'object')}, Unity ${esc(entry.sf.unityVersion)}</p>`;
  for (const [id, list] of [...groups].sort((a, b) => zbUnityClassName(a[0]).localeCompare(zbUnityClassName(b[0])))) {
    html += `<details class="type"${list.length <= 60 ? ' open' : ''}><summary><span>${esc(zbUnityClassName(id))}</span><span class="n">${list.length}</span></summary><div class="ids">`;
    for (const o of list) html += `<a href="${remakeLink(entry.name, o.pathId)}">${esc(names.get(o.pathId) || o.pathId)}</a>`;
    html += '</div></details>';
  }
  view.innerHTML = html;
}

/* A value's fields as text, with long byte runs and arrays cut short. */
function remakeFieldsText(v, depth = 0) {
  const pad = '  '.repeat(depth);
  if (v instanceof Uint8Array) return `${v.length.toLocaleString()} bytes`;
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const shown = v.slice(0, 20).map(x => pad + '  ' + remakeFieldsText(x, depth + 1));
    return '[\n' + shown.join('\n') + (v.length > 20 ? `\n${pad}  … ${v.length - 20} more` : '') + `\n${pad}]`;
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length ? '\n' + keys.map(k => `${pad}  ${k}: ${remakeFieldsText(v[k], depth + 1)}`).join('\n') : '{}';
  }
  return JSON.stringify(v);
}

async function remakeTextureImage(tex) {
  let data = tex['image data'];
  if ((!data || !data.length) && tex.m_StreamData && tex.m_StreamData.size) data = await remakeSide(tex.m_StreamData.path, tex.m_StreamData.offset, tex.m_StreamData.size);
  return zbUnityTexturePixels(tex.m_TextureFormat, tex.m_Width, tex.m_Height, data);
}

function remakeCanvas(img, crop) {
  const c = document.createElement('canvas');
  const [x, y, w, h] = crop || [0, 0, img.width, img.height];
  c.width = w; c.height = h;
  const full = new ImageData(img.rgba, img.width, img.height);
  c.getContext('2d').putImageData(full, -x, -y);
  c.className = 'px';
  return c;
}

/* The object a PPtr points at in this file, or null for another file. */
function remakeLocal(entry, pptr) {
  if (!pptr || pptr.m_FileID !== 0) return null;
  return entry.sf.objects.find(o => o.pathId === pptr.m_PathID) || null;
}

async function renderRemakeObject(entry, id, view, seq) {
  const obj = entry.sf.objects.find(o => o.pathId === id);
  if (!obj) { view.innerHTML = `<p class="bad">${esc(entry.name)} has no object ${id}.</p>`; return; }
  const v = await remakeObject(entry, obj);
  let cls = zbUnityClassName(obj.classId), note = '';
  if (obj.classId === 114) {
    const script = await remakeScriptClass(entry, v.m_Script);
    const layouts = await remakeLayouts();
    if (script) cls += ' ' + script;
    if (script && !layouts) note = 'Only its header is read here. Open the whole Zoombinis.app for its script\'s fields.';
    else if (script) {
      try { Object.assign(v, zbUnityScriptFields(layouts, script, v.rest, entry.sf.little)); delete v.rest; }
      catch (e) { note = `Its fields after the header could not be read (${e.message}).`; }
    } else note = 'Its script is in a file that is not open, so only its header is read.';
  }
  if (seq !== REMAKE_SEQ) return;
  view.innerHTML = `<h1>${esc(v && v.m_Name || (entry.names && entry.names.get(id)) || cls + ' ' + id)}</h1><p class="sub">${esc(cls)} ${id} in ${esc(entry.name)}, ${obj.size.toLocaleString()} bytes${REMAKE_CATALOG && REMAKE_CATALOG.byObject.has(entry.name + '/' + id) ? `, Resources path <code>${esc(REMAKE_CATALOG.byObject.get(entry.name + '/' + id))}</code>` : ''}</p><div id="remakeBody"></div><h2 class="h">Fields</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}<pre class="fields"></pre>`;
  const body = $('remakeBody');
  view.querySelector('pre.fields').textContent = v ? remakeFieldsText(v).trim() : 'This class is not read here.';
  if (obj.classId === 28) {
    const fmt = ZB_UNITY_TEXTURE_FORMATS[v.m_TextureFormat] || `format ${v.m_TextureFormat}`;
    const img = await remakeTextureImage(v);
    body.innerHTML = `<p>${v.m_Width} × ${v.m_Height}, ${esc(fmt)}.</p>`;
    if (!v.m_Width || !v.m_Height) body.insertAdjacentHTML('beforeend', '<p class="note">The texture has no pixels.</p>');
    else if (img) body.appendChild(remakeCanvas(img));
    else body.insertAdjacentHTML('beforeend', `<p class="note">The page does not decode ${esc(fmt)} so far.</p>`);
  } else if (obj.classId === 213) {
    const r = v.m_RD.textureRect, texObj = remakeLocal(entry, v.m_RD.texture);
    body.innerHTML = `<p>${Math.round(r.width)} × ${Math.round(r.height)} at (${Math.round(r.x)}, ${Math.round(r.y)}) on ${texObj ? `<a href="${remakeLink(entry.name, texObj.pathId)}">its texture</a>` : 'a texture in another file'}.</p>`;
    if (texObj) {
      const tex = await remakeObject(entry, texObj), img = await remakeTextureImage(tex);
      if (img) body.appendChild(remakeCanvas(img, [Math.round(r.x), Math.round(tex.m_Height - r.y - r.height), Math.round(r.width), Math.round(r.height)]));
      else body.insertAdjacentHTML('beforeend', `<p class="note">The page does not decode ${esc(ZB_UNITY_TEXTURE_FORMATS[tex.m_TextureFormat] || 'its format')} so far.</p>`);
    }
  } else if (obj.classId === 49 && /\.swf$/i.test(v.m_Name)) {
    await remakeSwfView(body, entry, obj, v);
    remakeSaveButton(body, v.m_Name + '.bytes', v.m_Script);
  } else if (obj.classId === 49) {
    const s = v.m_Script, text = new TextDecoder().decode(s);
    const printable = !/[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 4000));
    body.innerHTML = printable ? '<pre class="fields"></pre>' : `<p class="note">${s.length.toLocaleString()} bytes, not text.</p>`;
    if (printable) body.querySelector('pre').textContent = text.length > 200000 ? text.slice(0, 200000) + '\n…' : text;
    remakeSaveButton(body, v.m_Name + (printable ? '.txt' : '.bytes'), s);
  } else if (obj.classId === 83) {
    const snd = await remakeSound(v);
    body.innerHTML = `<p>${esc(snd.about)}.</p>`;
    if (snd.bytes) {
      const a = document.createElement('audio');
      a.controls = true;
      a.src = URL.createObjectURL(new Blob([snd.bytes], { type: snd.type }));
      body.appendChild(a);
      remakeSaveButton(body, v.m_Name + snd.ext, snd.bytes);
    } else body.insertAdjacentHTML('beforeend', `<p class="note">${esc(snd.note)}</p>`);
  }
}

/* An AudioClip's sound from its FSB5 bank: { about, bytes, type, ext } to
   play and save, as WAV where it is PCM and as Ogg where it is Vorbis, or
   { about, note } where it does not play. */
async function remakeSound(v) {
  const res = v.m_Resource;
  const bank = zbFsbRead(await remakeSide(res.m_Source, res.m_Offset, res.m_Size));
  const s = bank.samples[0], wav = s && zbFsbWav(bank, s);
  const about = `${bank.codecName}, ${s ? `${s.rate.toLocaleString()} Hz, ${s.channels === 1 ? 'mono' : s.channels + ' channels'}, ${(s.count / s.rate).toFixed(2)} s` : 'no samples'}`;
  if (wav) return { about, bytes: wav, type: 'audio/wav', ext: '.wav' };
  if (bank.codec !== 15 || !s) return { about, note: `The page does not decode ${bank.codecName} so far.` };
  const setup = await remakeVorbisSetup(s.setupCrc);
  if (!setup) return { about, note: REMAKE_IL2CPP.fmod ? `The app’s ${REMAKE_IL2CPP.fmod.name} has no Vorbis setup header with this sound’s CRC-32.` : 'A Vorbis sound needs its setup header, which is in the app’s UnityFramework, in UnityPlayer.dylib or UnityPlayer.dll in Steam’s copies, or in libunity.so in the Android APKs. Open the whole app folder or the APKs to play it.' };
  return { about, bytes: zbFsbOgg(s, setup), type: 'audio/ogg', ext: '.ogg' };
}

/* A Vorbis setup header by its CRC-32, found in the binary where FMOD is
   linked, with FMOD's set of them: UnityFramework, UnityPlayer.dylib in
   Steam's Mac build, UnityPlayer.dll in its Windows build, or libunity.so
   in the Android build. The headers
   found are kept for later sounds. */
const REMAKE_VORBIS = new Map();
async function remakeVorbisSetup(crc) {
  if (REMAKE_VORBIS.has(crc)) return REMAKE_VORBIS.get(crc);
  const bin = REMAKE_IL2CPP.fmod;
  if (!bin) return null;
  const bytes = new Uint8Array(await bin.arrayBuffer());
  for (const [k, header] of zbVorbisSetups(bytes, [crc])) REMAKE_VORBIS.set(k, header);
  if (!REMAKE_VORBIS.has(crc)) REMAKE_VORBIS.set(crc, null);
  return REMAKE_VORBIS.get(crc);
}

function remakeSaveButton(body, name, bytes) {
  const b = document.createElement('button');
  b.textContent = 'Save as ' + name.split('.').pop().toUpperCase();
  b.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes]));
    a.download = name;
    a.click();
  });
  const div = document.createElement('div');
  div.className = 'tools';
  div.appendChild(b);
  body.appendChild(div);
}

/* Whether files picked or dropped are the remake's: its APKs, or an app
   with a Data folder of Unity files. */
function isRemakeDrop(files) {
  return files.some(f => /\.apk$/i.test(f.name) || f.name === 'globalgamemanagers' || f.name === 'global-metadata.dat');
}

/* The remake's files taken and its list shown, or the reason none were.
   A Mac's file picker can choose an app, which is a folder, and what the
   browser gives for it is tried: a file the page cannot read is reported
   with its size, so that the visitor can drop the app instead. */
async function remakeOpen(files, stay = false, heads = null) {
  const app = files.find(f => /\.app$/i.test(f.name));
  if (app) {
    let readable = true;
    try { await app.slice(0, 4).arrayBuffer(); } catch (e) { readable = false; }
    setStatus(`The browser gave ${app.name} as one file of ${app.size.toLocaleString()} bytes${readable ? '' : ' that cannot be read'}, and not as its folder. Drop ${app.name} on the page instead.`, true);
    return;
  }
  let n = 0;
  try { n = await remakeTake(files, heads); }
  catch (err) { setStatus(err.message, true); return; }
  if (!n) {
    // What the browser gave, so that a picker's odd result can be seen.
    const got = files.slice(0, 4).map(f => `${f.name || '(no name)'} (${f.size.toLocaleString()} bytes${f.type ? ', ' + f.type : ''})`).join(', ');
    setStatus(`No Unity files of the remake were among those. The browser gave ${plural(files.length, 'file')}${files.length ? ': ' + got + (files.length > 4 ? ', …' : '') : ''}.`, true);
    return;
  }
  SOURCE = SOURCE || 'the 2015 remake';
  $('start').hidden = true;
  $('views').hidden = false;
  $('find').hidden = false;
  // Opened on arrival, the remake leaves the address as it is, and redraws
  // a view that may show it.
  if (location.hash === '#remake') route();
  else if (stay && location.hash) { if (/^#(remake|scenario|components)/.test(location.hash)) route(); }
  else if (!stay || !ARCHIVES.size) location.hash = '#remake';
}

/* The remake from a web address, read a piece at a time (zb-range.js).
   The folder there has an index of its files (snoidgrimoire-index.bin),
   or else the Android build's three APKs. The address is saved in the
   browser, and the next visit opens it again. */
const REMAKE_ADDRESS_KEY = 'snoidgrimoire-remake-address', REMAKE_BUILD_KEY = 'snoidgrimoire-remake-build';
let REMAKE_ADDRESS = null;
// The builds that an address's index has, as [name, path], and the one open.
let REMAKE_BUILDS = { list: [], open: '' };
async function remakeOpenAddress(base, stay = false, build = null) {
  base = base.trim();
  if (!base) return;
  if (!base.endsWith('/')) base += '/';
  setStatus(`Opening the remake at ${base}…`);
  const indexAt = async folder => {
    const bytes = await fetch(folder + ZB_ADDRESS_INDEX).then(r => r.ok ? r.arrayBuffer() : null, () => null);
    return bytes && zbAddressIndexRead(new Uint8Array(bytes));
  };
  const filesOf = (folder, index) => index.files.map(([p, size]) => zbRangeFileAt(folder + p.split('/').map(encodeURIComponent).join('/'), size, p.split('/').pop(), p));
  let files, heads = null, builds = [], folder = base;
  try {
    let index = await indexAt(base), shared = [];
    // An index of several builds: the one picked, or the one picked on an
    // earlier visit, or the first, with the files they share.
    if (index && index.builds.length) {
      builds = index.builds;
      let saved = null;
      try { saved = localStorage.getItem(REMAKE_BUILD_KEY); } catch (e) { saved = null; }
      const path = [build, saved].find(p => p && builds.some(b => b[1] === p)) || builds[0][1];
      shared = filesOf(base, index);
      folder = base + path;
      index = await indexAt(folder);
      if (!index) throw new Error(`The build at ${folder} has no index.`);
      try { localStorage.setItem(REMAKE_BUILD_KEY, path); } catch (e) { /* kept for this visit only */ }
    }
    if (index) {
      heads = index.heads;
      files = filesOf(folder, index);
      // A shared file that the build's index lists as well is not read twice.
      const urls = new Set(files.map(f => f.source.url));
      files = files.concat(shared.filter(f => !urls.has(f.source.url)));
    }
    else files = await Promise.all(ZB_APK_NAMES.map(n => zbRangeOpen(base + n, n)));
  } catch (err) {
    const why = err instanceof TypeError ? 'The server sent nothing this page can read. Its CORS rules may leave this site out.' : err.message;
    setStatus(`The remake at ${base} could not be read. ${why}`, true);
    return;
  }
  remakeClose();
  REMAKE_ADDRESS = base;
  REMAKE_BUILDS = { list: builds, open: folder.slice(base.length) };
  try { localStorage.setItem(REMAKE_ADDRESS_KEY, base); } catch (e) { /* kept for this visit only */ }
  await remakeOpen(files, stay, heads);
  if (REMAKE_FILES.size) setStatus(`The remake is open from the address saved in this browser.`);
}

/* Every file of the remake closed, before another build opens. */
function remakeClose() {
  REMAKE_FILES.clear();
  REMAKE_SOUNDTRACK.length = 0;
  Object.assign(REMAKE_IL2CPP, { metadata: null, binary: null, fmod: null, layouts: null });
  REMAKE_VORBIS.clear();
  REMAKE_CATALOG = null;
  if (typeof remakeForget === 'function') remakeForget();
}

/* The address saved on an earlier visit, opened where the visit goes. */
function remakeOpenSaved() {
  let base = null;
  try { base = localStorage.getItem(REMAKE_ADDRESS_KEY); } catch (e) { base = null; }
  if (!base) return;
  if ($('remakeAddress')) $('remakeAddress').value = base;
  return remakeOpenAddress(base, true);
}

/* The start page's pickers for the remake's app and its APKs. */
function wireRemakeStart() {
  for (const id of ['pickRemake', 'pickApk']) $(id) && $(id).addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    await remakeOpen(files);
  });
  if ($('useRemakeAddress')) $('useRemakeAddress').addEventListener('click', () => remakeOpenAddress($('remakeAddress').value));
  if ($('remakeAddress')) $('remakeAddress').addEventListener('keydown', e => { if (e.key === 'Enter') remakeOpenAddress(e.target.value); });
}
wireRemakeStart();
