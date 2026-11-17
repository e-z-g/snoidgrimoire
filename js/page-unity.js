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
   The visitor opens the app folder (Zoombinis.app/Wrapper/Zoombinis.app),
   or its Data folder alone. From the app folder the page also reads
   Data/Managed/Metadata/global-metadata.dat and
   Frameworks/UnityFramework.framework/UnityFramework, and builds the
   scripts' field layouts from them (zb-il2cpp.js) on the first
   MonoBehaviour shown. Without them a MonoBehaviour shows its header only.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-saves.js. */

const REMAKE_FILES = new Map();   // name -> { name, file (a Blob), sf, names: Map pathId -> name }
const REMAKE_IL2CPP = { metadata: null, binary: null, layouts: null, ms: 0 };

function isRemakeHash() { return /^#remake(\/|$)/.test(location.hash); }
function remakeHashParts() {
  const [, file, id] = decodeURIComponent(location.hash).split('/');
  return { file: file || null, id: id != null && id !== '' ? +id : null };
}
const remakeLink = (file, id) => '#remake' + (file ? '/' + encodeURIComponent(file) + (id != null ? '/' + id : '') : '');

async function remakeSlice(file, start, end) { return new Uint8Array(await file.slice(start, end).arrayBuffer()); }

/* Take the picked files: SerializedFiles are read for their metadata, and
   the .resS and .resource files are side files. */
async function remakeTake(files) {
  let took = 0;
  for (const f of files) {
    if (/^\./.test(f.name)) continue;
    if (f.name === 'global-metadata.dat') { REMAKE_IL2CPP.metadata = f; REMAKE_IL2CPP.layouts = null; continue; }
    if (f.name === 'UnityFramework') { REMAKE_IL2CPP.binary = f; REMAKE_IL2CPP.layouts = null; continue; }
    // From a picked folder, only the files directly in Data are Unity's files.
    const parts = (f.webkitRelativePath || '').split('/');
    if (parts.length > 1 && parts[parts.length - 2] !== 'Data') continue;
    const head = await remakeSlice(f, 0, 48);
    const size = zbUnityHeaderSize(head);
    let sf = null;
    if (size && size < f.size) {
      try { sf = zbUnityParse(await remakeSlice(f, 0, size)); } catch (e) { sf = null; }
    }
    if (!sf && !/\.(resS|resource)$/i.test(f.name)) continue;
    REMAKE_FILES.set(f.name, { name: f.name, file: f, sf, names: null });
    took++;
  }
  return took;
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
  let html = '';
  for (const e of [...REMAKE_FILES.values()].filter(e => e.sf).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) {
    html += `<div class="arc${h.file === e.name ? ' on' : ''}" data-arc="${esc(remakeLink(e.name).slice(1))}"><span class="name">${esc(e.name)}</span><span class="place">${plural(e.sf.objects.length, 'object')}</span></div>`;
  }
  return html;
}

async function renderRemake() {
  const h = remakeHashParts(), view = $('view');
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><a href="#remake">2015 remake</a>'
    + (h.file ? `<span class="sep">›</span><a href="${remakeLink(h.file)}">${esc(h.file)}</a>` : '')
    + (h.id != null ? `<span class="sep">›</span><span>${h.id}</span>` : '');
  renderSide({ name: '#remake' }, { archive: null, tag: null, id: null });
  const side = $('side');
  side.insertAdjacentHTML('beforeend', remakeSideHtml(h));
  for (const el of side.querySelectorAll('.arc[data-arc^="remake/"]')) el.addEventListener('click', () => { location.hash = '#' + el.dataset.arc; });
  const entry = h.file && REMAKE_FILES.get(h.file);
  try {
    if (!entry) view.innerHTML = remakeHomeHtml();
    else if (h.id == null) await renderRemakeFile(entry, view);
    else await renderRemakeObject(entry, h.id, view);
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
  let html = '<h1>The 2015 remake</h1><p class="sub">FableVision and TERC remade the game in Unity in 2015. Its files are read here, and nothing leaves the page. Open its app folder, which has <code>Data</code> and <code>Frameworks</code>. On a Mac with the iPhone app installed, that is <code>/Applications/Zoombinis.app/Wrapper/Zoombinis.app</code>. The <code>Data</code> folder alone also opens, without the scripts\' fields.</p>'
    + '<div class="tools"><label class="btn">App folder…<input type="file" id="remakePick" webkitdirectory hidden></label></div>';
  if (!files.length) return html + '<p class="note">No remake files are open.</p>';
  const byClass = new Map();
  for (const e of files) for (const o of e.sf.objects) byClass.set(o.classId, (byClass.get(o.classId) || 0) + 1);
  const unity = files[0].sf.unityVersion;
  html += `<p>${plural(files.length, 'file')} from Unity ${esc(unity)}, with ${plural(files.reduce((n, e) => n + e.sf.objects.length, 0), 'object')}.</p><table class="plain"><tr><th>class</th><th>objects</th></tr>`;
  for (const [id, n] of [...byClass].sort((a, b) => b[1] - a[1])) html += `<tr><td>${esc(zbUnityClassName(id))}</td><td>${n.toLocaleString()}</td></tr>`;
  return html + '</table>';
}

async function renderRemakeFile(entry, view) {
  view.innerHTML = `<h1>${esc(entry.name)}</h1><p class="note">Reading the names…</p>`;
  const names = await remakeNames(entry);
  const groups = new Map();
  for (const o of entry.sf.objects) {
    if (!groups.has(o.classId)) groups.set(o.classId, []);
    groups.get(o.classId).push(o);
  }
  let html = `<h1>${esc(entry.name)}</h1><p class="sub">${plural(entry.sf.objects.length, 'object')}, Unity ${esc(entry.sf.unityVersion)}</p>`;
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

async function renderRemakeObject(entry, id, view) {
  const obj = entry.sf.objects.find(o => o.pathId === id);
  if (!obj) { view.innerHTML = `<p class="bad">${esc(entry.name)} has no object ${id}.</p>`; return; }
  const v = await remakeObject(entry, obj);
  let cls = zbUnityClassName(obj.classId), note = '';
  if (obj.classId === 114) {
    const script = await remakeScriptClass(entry, v.m_Script);
    const layouts = await remakeLayouts();
    if (script) cls += ' ' + script;
    if (script && !layouts) note = 'Only its header is read here. Open the app folder, which has Data and Frameworks, for its script\'s fields.';
    else if (script) {
      try { Object.assign(v, zbUnityScriptFields(layouts, script, v.rest, entry.sf.little)); delete v.rest; }
      catch (e) { note = `Its fields after the header could not be read (${e.message}).`; }
    } else note = 'Its script is in a file that is not open, so only its header is read.';
  }
  view.innerHTML = `<h1>${esc(v && v.m_Name || (entry.names && entry.names.get(id)) || cls + ' ' + id)}</h1><p class="sub">${esc(cls)} ${id} in ${esc(entry.name)}, ${obj.size.toLocaleString()} bytes</p><div id="remakeBody"></div><h2 class="h">Fields</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}<pre class="fields"></pre>`;
  const body = $('remakeBody');
  view.querySelector('pre.fields').textContent = v ? remakeFieldsText(v).trim() : 'This class is not read here.';
  if (obj.classId === 28) {
    const fmt = ZB_UNITY_TEXTURE_FORMATS[v.m_TextureFormat] || `format ${v.m_TextureFormat}`;
    const img = await remakeTextureImage(v);
    body.innerHTML = `<p>${v.m_Width} × ${v.m_Height}, ${esc(fmt)}.</p>`;
    if (img) body.appendChild(remakeCanvas(img));
    else body.insertAdjacentHTML('beforeend', `<p class="note">The page does not decode ${esc(fmt)} so far.</p>`);
  } else if (obj.classId === 213) {
    const r = v.m_RD.textureRect, texObj = remakeLocal(entry, v.m_RD.texture);
    body.innerHTML = `<p>${Math.round(r.width)} × ${Math.round(r.height)} at (${Math.round(r.x)}, ${Math.round(r.y)}) on ${texObj ? `<a href="${remakeLink(entry.name, texObj.pathId)}">its texture</a>` : 'a texture in another file'}.</p>`;
    if (texObj) {
      const tex = await remakeObject(entry, texObj), img = await remakeTextureImage(tex);
      if (img) body.appendChild(remakeCanvas(img, [Math.round(r.x), Math.round(tex.m_Height - r.y - r.height), Math.round(r.width), Math.round(r.height)]));
      else body.insertAdjacentHTML('beforeend', `<p class="note">The page does not decode ${esc(ZB_UNITY_TEXTURE_FORMATS[tex.m_TextureFormat] || 'its format')} so far.</p>`);
    }
  } else if (obj.classId === 49) {
    const s = v.m_Script, text = new TextDecoder().decode(s);
    const printable = !/[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 4000));
    body.innerHTML = printable ? '<pre class="fields"></pre>' : `<p class="note">${s.length.toLocaleString()} bytes, not text.</p>`;
    if (printable) body.querySelector('pre').textContent = text.length > 200000 ? text.slice(0, 200000) + '\n…' : text;
    remakeSaveButton(body, v.m_Name + (printable ? '.txt' : '.bytes'), s);
  } else if (obj.classId === 83) {
    const res = v.m_Resource;
    const bank = zbFsbRead(await remakeSide(res.m_Source, res.m_Offset, res.m_Size));
    const s = bank.samples[0], wav = s && zbFsbWav(bank, s);
    body.innerHTML = `<p>${esc(bank.codecName)}, ${s ? `${s.rate.toLocaleString()} Hz, ${s.channels === 1 ? 'mono' : s.channels + ' channels'}, ${(s.count / s.rate).toFixed(2)} s` : 'no samples'}.</p>`;
    if (wav) {
      const a = document.createElement('audio');
      a.controls = true;
      a.src = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      body.appendChild(a);
      remakeSaveButton(body, v.m_Name + '.wav', wav);
    } else body.insertAdjacentHTML('beforeend', `<p class="note">The page does not decode ${esc(bank.codecName)} so far.</p>`);
  }
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

/* The start page's picker for the remake's folder. */
function wireRemakeStart() {
  const pick = $('pickRemake');
  if (!pick) return;
  pick.addEventListener('change', async e => {
    const n = await remakeTake([...e.target.files]);
    e.target.value = '';
    if (!n) { setStatus('No Unity files were in that folder.', true); return; }
    SOURCE = SOURCE || 'the 2015 remake';
    $('start').hidden = true;
    $('views').hidden = false;
    $('find').hidden = false;
    if (location.hash === '#remake') route(); else location.hash = '#remake';
  });
}
wireRemakeStart();
