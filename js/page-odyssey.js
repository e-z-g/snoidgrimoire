/* page-odyssey.js -- Zoombinis Island Odyssey (2002), the third game, read
   by zb-odyssey.js: its disc under Data (#odyssey), and its Scenario and
   Components when the bar has 2002 picked (zbEdition).
   =========================================================================
   The visitor drops or picks the disc's image (.iso) or the disc's folder,
   or opens archive.org's copy, as for Mountain Rescue (page-mountain.js,
   whose ISO reader and listing reader it uses). The game's things are in
   24 bundles of 1 to 21 MB, so the page reads a bundle whole the first
   time a view needs one of its entries, and the last eight read stay in
   memory. The browser saves the choice of archive.org's copy as
   snoidgrimoire-odyssey, and the next visit opens it again.
   Read:
   #odyssey has the disc's folders, #odyssey/rsc/<bundle>.bul a bundle's
   entries, #odyssey/rsc/<bundle>.bul/<entry> an entry (an animation's
   frames played, a sound, a background, a palette), and
   #odyssey/scripts/<file> a place's XML or script.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-mountain.js. */

const ODYSSEY = { files: new Map(), source: '' };   // key (lower-case path, HD/ left off) -> { key, path, size, file | url }
const ODYSSEY_KEY = 'snoidgrimoire-odyssey';
const ODYSSEY_REMOTE = { item: 'zoombinis-island-odyssey-cd-rom-iso', iso: 'ZoombinisIO.iso', label: "archive.org's copy of Island Odyssey" };
const ODYSSEY_TABS = {
  scenario: { name: 'Scenario', subs: [['places', 'Places'], ['puzzles', 'Puzzles'], ['snoids', 'Snoids']] },
  components: { name: 'Components', subs: [['sheets', 'Animations'], ['backgrounds', 'Backgrounds'], ['sounds', 'Sounds'], ['music', 'Music'], ['text', 'Scripts']] },
};

function odysseyIsOpen() { return ODYSSEY.files.size > 0; }
function isOdysseyHash() { return /^#odyssey(\/|$)/.test(location.hash); }
const odysseyLink = key => '#odyssey' + (key ? '/' + key.split('/').map(encodeURIComponent).join('/') : '');
function odysseyHashKey() {
  const m = /^#odyssey\/(.+)$/.exec(location.hash);
  return m ? m[1].split('/').map(s => decodeURIComponent(s)).join('/') : '';
}
const odysseyKeys = test => [...ODYSSEY.files.keys()].filter(test).sort();
const isOdysseyBundle = k => /^rsc\/[^/]+\.bul$/.test(k);

/* A file's bytes, from the picked file or the image, or fetched from
   archive.org. The last eight read stay in memory. */
const ODYSSEY_BYTES = new Map();
function odysseyBytes(key) {
  const f = ODYSSEY.files.get(key);
  if (!f) return Promise.reject(new Error(`${key} is not on the disc`));
  if (ODYSSEY_BYTES.has(key)) {
    const p = ODYSSEY_BYTES.get(key);
    ODYSSEY_BYTES.delete(key); ODYSSEY_BYTES.set(key, p);
    return p;
  }
  const p = (async () => {
    if (f.file) return new Uint8Array(await f.file.arrayBuffer());
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`archive.org returned ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  })();
  p.catch(() => ODYSSEY_BYTES.delete(key));
  ODYSSEY_BYTES.set(key, p);
  while (ODYSSEY_BYTES.size > 8) ODYSSEY_BYTES.delete(ODYSSEY_BYTES.keys().next().value);
  return p;
}
/* A bundle read: its bytes, its entries by name, and its palettes. */
const ODYSSEY_BUNDLES = new Map();
function odysseyBundle(key) {
  if (!ODYSSEY_BUNDLES.has(key)) {
    const p = odysseyBytes(key).then(b => {
      const entries = ioEntries(b), byName = new Map(entries.map(e => [e.name.toLowerCase(), e]));
      const colors = new Map(entries.filter(e => /\.rgb$/i.test(e.name)).map(e => [e.name.slice(0, -4).toLowerCase(), ioPalette(b, e.start)]));
      return { key, b, entries, byName, colors };
    });
    p.catch(() => ODYSSEY_BUNDLES.delete(key));
    ODYSSEY_BUNDLES.set(key, p);
    while (ODYSSEY_BUNDLES.size > 8) ODYSSEY_BUNDLES.delete(ODYSSEY_BUNDLES.keys().next().value);
  }
  return ODYSSEY_BUNDLES.get(key);
}
/* An .ao entry's frames: { ao, frame(i) }. */
function odysseyAo(bundle, e) {
  const ao = ioAo(bundle.b, e.start), colors = bundle.colors.get(e.name.slice(0, -3).toLowerCase());
  return { ao, frame: i => ioAoFrame(bundle.b, ao, i, colors) };
}
/* An entry's picture for a card: an animation's first frame, or a
   background. */
async function odysseyEntryThumb(bundle, e) {
  if (/\.ao$/i.test(e.name)) {
    const { ao, frame } = odysseyAo(bundle, e);
    const f = frame(0);
    return { el: f.width && f.height ? mountainThumb(f) : document.createTextNode('empty'), note: `${f.width} × ${f.height}${ao.frames.length > 1 ? `, ${ao.frames.length} frames` : ''}` };
  }
  if (/\.jpg$/i.test(e.name)) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(new Blob([bundle.b.subarray(e.start, e.end)], { type: 'image/jpeg' }));
    img.style.maxWidth = '160px'; img.style.maxHeight = '120px';
    return { el: img, note: '' };
  }
  return { el: document.createTextNode(ioKind(e.name)), note: '' };
}

/* ---- opening ----------------------------------------------------------------- */

function odysseyTake(entries, source) {
  const game = ioGameFiles(entries, e => e.path);
  if (![...game.keys()].some(isOdysseyBundle)) return 0;
  ODYSSEY.files.clear();
  ODYSSEY_BYTES.clear();
  ODYSSEY_BUNDLES.clear();
  ODYSSEY_XML = null;
  ODYSSEY_SCRIPTS = null;
  for (const [key, e] of game) ODYSSEY.files.set(key, { key, path: e.path, size: e.size, file: e.file, url: e.url });
  ODYSSEY.source = source;
  $('start').hidden = true;
  $('views').hidden = false;
  $('find').hidden = false;
  return game.size;
}
function odysseyShow(stay) {
  if (stay && location.hash && !isOdysseyHash()) { if (/^#(scenario|components)/.test(location.hash)) route(); return; }
  if (location.hash === '#odyssey') route(); else location.hash = '#odyssey';
}
/* Files dropped or picked: a disc image, or the disc's files. True if they
   were Island Odyssey's. */
async function odysseyTryFiles(files) {
  for (const iso of files.filter(f => /\.iso$/i.test(f.name))) {
    let list;
    try { list = await mrIsoFiles(async (a, z) => new Uint8Array(await iso.slice(a, z).arrayBuffer())); } catch (e) { continue; }
    if (!ioLooksLike(list.map(f => f.path))) continue;
    const n = odysseyTake(list.map(f => ({ path: f.path, size: f.size, file: iso.slice(f.offset, f.offset + f.size) })), iso.name);
    if (n) { setStatus(''); odysseyShow(false); return true; }
  }
  const pathOf = f => (f.remakePath || f.webkitRelativePath || f.name).replace(/^\/+/, '');
  if (!ioLooksLike(files.map(pathOf))) return false;
  if (!odysseyTake(files.map(f => ({ path: pathOf(f), size: f.size, file: f })), 'the disc\'s files')) return false;
  setStatus('');
  odysseyShow(false);
  return true;
}
async function odysseyOpenRemote(stay = false) {
  const base = `https://archive.org/cors/${ODYSSEY_REMOTE.item}/${ODYSSEY_REMOTE.iso}/`;
  setStatus(`Reading the list of ${ODYSSEY_REMOTE.label}…`);
  let list;
  try {
    const res = await fetch(base);
    if (!res.ok) throw new Error(`archive.org returned ${res.status}`);
    list = mrArchiveListing(await res.text(), ODYSSEY_REMOTE.iso);
    if (!list.length) throw new Error('the list was empty');
  } catch (e) { setStatus(`Could not read the list of ${ODYSSEY_REMOTE.label} (${e.message}).`, true); return; }
  const n = odysseyTake(list.map(f => ({ path: f.path, size: f.size, url: base + encodeURIComponent(f.path) })), ODYSSEY_REMOTE.label);
  if (!n) { setStatus(`${ODYSSEY_REMOTE.label} has none of the game's files.`, true); return; }
  try { localStorage.setItem(ODYSSEY_KEY, 'archive.org'); } catch (e) { /* not saved */ }
  setStatus('');
  odysseyShow(stay);
}
async function odysseyOpenSaved() {
  let saved = null;
  try { saved = localStorage.getItem(ODYSSEY_KEY); } catch (e) { /* nothing saved */ }
  if (saved === 'archive.org' && !odysseyIsOpen()) await odysseyOpenRemote(true);
}

/* ---- Data -------------------------------------------------------------------- */

let ODYSSEY_SEQ = 0;
async function renderOdyssey() {
  const seq = ++ODYSSEY_SEQ, path = odysseyHashKey(), view = $('view');
  const parts = path ? path.split('/') : [];
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><a href="#odyssey">Island Odyssey</a>'
    + parts.map((p, i) => `<span class="sep">›</span>` + (i < parts.length - 1 ? `<a href="${odysseyLink(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>` : `<span>${esc(p)}</span>`)).join('');
  renderSide({ name: '#odyssey' }, { archive: null, tag: null, id: null });
  $('side').insertAdjacentHTML('beforeend', odysseySideHtml(path));
  for (const el of $('side').querySelectorAll('[data-odyssey]')) el.addEventListener('click', () => { location.hash = odysseyLink(el.dataset.odyssey); });
  const clear = $('side').querySelector('[data-odyssey-clear]');
  if (clear) clear.addEventListener('click', e => {
    e.stopPropagation();
    try { localStorage.removeItem(ODYSSEY_KEY); } catch (err) { /* nothing saved */ }
    clear.parentNode.remove();
    setStatus('The next visit opens Island Odyssey only from files chosen.');
  });
  view.scrollTop = 0;
  try {
    const key = path.toLowerCase();
    const bundle = parts.length > 2 && isOdysseyBundle(parts.slice(0, 2).join('/').toLowerCase()) ? parts.slice(0, 2).join('/').toLowerCase() : null;
    if (!odysseyIsOpen()) view.innerHTML = odysseyHomeHtml();
    else if (bundle) await odysseyEntryView(view, bundle, parts.slice(2).join('/'), seq);
    else if (isOdysseyBundle(key) && ODYSSEY.files.has(key)) await odysseyBundleView(view, key, seq);
    else if (ODYSSEY.files.has(key)) await odysseyFileView(view, key, seq);
    else view.innerHTML = key ? odysseyFolderHtml(key) : odysseyHomeHtml();
  } catch (e) {
    view.innerHTML += `<p class="bad">This could not be shown (${esc(e.message)}).</p>`;
    console.error(e);
  }
  for (const pick of view.querySelectorAll('.odysseyPick')) pick.addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!(await odysseyTryFiles(files))) setStatus('Those files are not Island Odyssey\'s disc.', true);
  });
  const remote = $('odysseyRemote');
  if (remote) remote.addEventListener('click', () => odysseyOpenRemote());
}

function odysseySideHtml(path) {
  if (!odysseyIsOpen()) return '';
  let saved = null;
  try { saved = localStorage.getItem(ODYSSEY_KEY); } catch (e) { /* nothing saved */ }
  let html = `<p class="remembered">${esc(ODYSSEY.source)}${saved === 'archive.org' ? ', opened on each visit. <a data-odyssey-clear>Clear</a>' : ''}</p>`;
  const key = path.toLowerCase();
  for (const k of odysseyKeys(isOdysseyBundle)) {
    const place = IO_PLACE_BY_KEY.get(k.slice(4, -4).replace(/cd$/, ''));
    html += `<div class="arc${key === k || key.startsWith(k + '/') ? ' on' : ''}" data-odyssey="${esc(k)}"><span class="name">${esc(k.slice(4))}</span><span class="place">${esc(place ? place.name : (ODYSSEY.files.get(k).size / 1048576).toFixed(1) + ' MB')}</span></div>`;
  }
  for (const t of ['scripts', 'win']) if (odysseyKeys(k => k.startsWith(t + '/')).length) html += `<div class="arc${key.startsWith(t) ? ' on' : ''}" data-odyssey="${t}"><span class="name">${t}</span><span class="place">${plural(odysseyKeys(k => k.startsWith(t + '/')).length, 'file')}</span></div>`;
  return html;
}

function odysseyHomeHtml() {
  let html = '<h1>Island Odyssey</h1><p class="sub"><i>Zoombinis Island Odyssey</i> (Riverdeep and The Learning Company, 2002) is the third game. Its pictures, animations and sounds are in bundles (<code>.bul</code>), each place\'s help and voices in its XML, and its puzzles in the program\'s <code>PuzzleEngine.dll</code>. Open the disc\'s image (<code>.iso</code>) or the disc\'s folder, or read archive.org\'s copy.</p>'
    + '<div class="tools"><label class="btn">Image…<input type="file" class="odysseyPick" accept=".iso,.ISO" hidden></label> <label class="btn">Folder…<input type="file" class="odysseyPick" webkitdirectory hidden></label> <button id="odysseyRemote">Read archive.org\'s copy</button></div>';
  if (!odysseyIsOpen()) return html + '<p class="note">Island Odyssey is not open.</p>';
  const bundles = odysseyKeys(isOdysseyBundle);
  html += `<p>${plural(ODYSSEY.files.size, 'file')} from ${esc(ODYSSEY.source)}, ${plural(bundles.length, 'bundle')} among them. A bundle\'s entries show once the page has read it.</p>`;
  return html + '<h2 class="h">Places</h2><table class="plain">' + IO_PLACES.map(p => `<tr><td><a href="#scenario/places/${p.key}">${esc(p.name)}</a></td><td class="note">${esc(p.kind)}</td><td>${['rsc/' + p.key + '.bul', 'rsc/' + p.key + 'cd.bul'].filter(k => ODYSSEY.files.has(k)).map(k => `<a href="${odysseyLink(k)}">${esc(k.slice(4))}</a>`).join(' ')}</td></tr>`).join('') + '</table>';
}

function odysseyFolderHtml(folder) {
  const inside = odysseyKeys(k => k.startsWith(folder + '/'));
  if (!inside.length) return `<h1>${esc(folder)}</h1><p class="note">Nothing on the disc is in this folder.</p>`;
  return `<h1>${esc(folder)}</h1><table class="plain">` + inside.map(k => `<tr><td><a href="${odysseyLink(k)}">${esc(k.slice(folder.length + 1))}</a></td><td class="note">${ODYSSEY.files.get(k).size.toLocaleString()} bytes</td></tr>`).join('') + '</table>';
}

/* A bundle: its entries by kind, the pictures as cards. */
async function odysseyBundleView(view, key, seq) {
  const f = ODYSSEY.files.get(key), place = IO_PLACE_BY_KEY.get(key.slice(4, -4).replace(/cd$/, ''));
  view.innerHTML = `<h1>${esc(key.slice(4))}</h1><p class="sub">${esc(f.path)}, ${f.size.toLocaleString()} bytes${place ? `, <a href="#scenario/places/${place.key}">${esc(place.name)}</a>` : ''}.</p><p class="note">Reading it…</p>`;
  const bundle = await odysseyBundle(key);
  if (seq !== ODYSSEY_SEQ) return;
  view.querySelector('p.note').remove();
  const byKind = new Map();
  for (const e of bundle.entries) { const k = ioKind(e.name); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(e); }
  view.insertAdjacentHTML('beforeend', `<p>${bundle.entries.length === 1 ? '1 entry' : bundle.entries.length.toLocaleString() + ' entries'}, ${[...byKind].map(([k, l]) => `${l.length} ${esc(k)}`).join(', ')}.</p>`);
  for (const [kind, list] of byKind) {
    view.insertAdjacentHTML('beforeend', `<h2 class="h">${esc(kind)} <span class="note">${list.length}</span></h2>`);
    if (kind === 'animation' || kind === 'background') odysseyCards(view, bundle, list);
    else view.insertAdjacentHTML('beforeend', '<div class="ids">' + list.map(e => `<a href="${odysseyLink(key + '/' + e.name)}">${esc(e.name)}</a>`).join('') + '</div>');
  }
}
function odysseyCards(view, bundle, list) {
  galleryCards(view, list.map(e => ({ e, href: odysseyLink(bundle.key + '/' + e.name), cap: esc(e.name) })), async (c, pic) => {
    try {
      const t = await odysseyEntryThumb(bundle, c.e);
      pic.appendChild(t.el);
      if (t.note) pic.nextSibling.insertAdjacentHTML('beforeend', ` <span class="note">${esc(t.note)}</span>`);
    } catch (err) { pic.textContent = err.message; }
  });
}

/* An entry of a bundle. */
async function odysseyEntryView(view, key, name, seq) {
  view.innerHTML = `<h1>${esc(name)}</h1><p class="sub">In <a href="${odysseyLink(key)}">${esc(key.slice(4))}</a>, ${esc(ioKind(name))}.</p><p class="note">Reading the bundle…</p>`;
  const bundle = await odysseyBundle(key);
  if (seq !== ODYSSEY_SEQ) return;
  view.querySelector('p.note').remove();
  const e = bundle.byName.get(name.toLowerCase());
  if (!e) { view.insertAdjacentHTML('beforeend', '<p class="bad">The bundle has no entry of that name.</p>'); return; }
  const bytes = bundle.b.subarray(e.start, e.end);
  view.insertAdjacentHTML('beforeend', `<p>${bytes.length.toLocaleString()} bytes.</p>`);
  const tools = document.createElement('div');
  tools.className = 'tools';
  tools.innerHTML = '<button>Save the file</button>';
  tools.firstChild.addEventListener('click', () => mountainSave(new Blob([bytes]), e.name));
  view.appendChild(tools);
  const kind = ioKind(e.name);
  if (kind === 'animation') {
    const { ao, frame } = odysseyAo(bundle, e);
    const first = frame(0);
    view.insertAdjacentHTML('beforeend', `<p>${plural(ao.frames.length, 'frame')} of ${ao.kind}-bit color${ao.kind === 8 ? ` with the palette ${esc(e.name.slice(0, -3))}.rgb` : ''}, the first ${first.width} × ${first.height}, and ${plural(ao.sequences.length, 'sequence')} of ${ao.sequences.map(s => s.length).join(', ')} steps.</p>`);
    if (first.width && first.height) mountainPlayer(view, i => frame(i), ao.frames.length, 2);
    if (ao.frames.length > 1) {
      const strip = document.createElement('div');
      strip.className = 'cards';
      ao.frames.forEach((fr, i) => { const p = frame(i), d = document.createElement('div'); d.className = 'card'; d.innerHTML = `<div class="pic"></div><div class="cap">frame ${i}</div>`; if (p.width && p.height) d.firstChild.appendChild(mountainThumb(p)); strip.appendChild(d); });
      view.appendChild(strip);
    }
    view.insertAdjacentHTML('beforeend', '<h2 class="h">Sequences</h2><p class="note">Each step is an x and a y offset, a frame (below 0 a code, −1 the end) and a fourth word that nobody has read.</p>'
      + ao.sequences.map((s, i) => `<p><b>${i}</b>, at (${ao.points[i][0]}, ${ao.points[i][1]}), ${s.map(st => `(${st.join(', ')})`).join(' ')}</p>`).join(''));
  } else if (kind === 'sound') {
    const a = document.createElement('audio');
    a.controls = true;
    a.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    view.appendChild(a);
    const fmt = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length > 36) view.insertAdjacentHTML('beforeend', `<p class="note">${fmt.getUint16(20, true) === 0x11 ? 'IMA ADPCM' : 'PCM'}, ${fmt.getUint16(22, true) === 2 ? 'stereo' : 'mono'}, ${fmt.getUint32(24, true).toLocaleString()} Hz.</p>`);
  } else if (kind === 'background') {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    img.style.maxWidth = '100%';
    view.appendChild(img);
  } else if (kind === 'palette') {
    const colors = ioPalette(bundle.b, e.start);
    view.insertAdjacentHTML('beforeend', '<div class="swatches">' + colors.map((c, i) => `<span title="${i}, ${c.join(', ')}" style="display:inline-block;width:14px;height:14px;background:rgb(${c.join(',')})"></span>`).join('') + '</div>');
  } else {
    view.insertAdjacentHTML('beforeend', '<p class="note">Lip sync for a voice, whose format nobody has read.</p>');
  }
}

/* A loose file: a place's XML or script, or a program file. */
async function odysseyFileView(view, key, seq) {
  const f = ODYSSEY.files.get(key);
  view.innerHTML = `<h1>${esc(key.split('/').pop())}</h1><p class="sub">${esc(f.path)}, ${f.size.toLocaleString()} bytes.</p>`;
  if (/\.xml$/.test(key)) {
    const b = await odysseyBytes(key);
    if (seq !== ODYSSEY_SEQ) return;
    view.insertAdjacentHTML('beforeend', `<pre>${esc(new TextDecoder('windows-1252').decode(b))}</pre>`);
  } else if (/\.mps$/.test(key)) {
    const b = await odysseyBytes(key);
    if (seq !== ODYSSEY_SEQ) return;
    let text;
    try { text = ioScriptSource(ioScript(b)); } catch (e) { view.insertAdjacentHTML('beforeend', `<p class="note">This script does not read (${esc(e.message)}).</p>`); return; }
    view.insertAdjacentHTML('beforeend', `<p class="note">A place's script, compiled for tcx.dll's interpreter and printed back as source. Each statement is its command and the source text of its words, with procedures, if, else and for rebuilt from the jumps, and the lists written name = [...] first.</p><pre>${esc(text)}</pre>`);
  }
  else if (/\.bik$/.test(key)) view.insertAdjacentHTML('beforeend', '<p class="note">A Bink video. The page does not play Bink.</p>');
}

/* ---- Scenario ---------------------------------------------------------------- */

const ODYSSEY_NOT_OPEN = '<p class="note">Island Odyssey is not open. <a href="#odyssey">Open it under Data</a>.</p>';
/* Each place's XML read, once: Map(place key -> ioPlaceXml). */
let ODYSSEY_XML = null;
function odysseyXml() {
  if (!ODYSSEY_XML) ODYSSEY_XML = Promise.all(IO_PLACES.map(async p => {
    const k = `scripts/${p.key}.xml`;
    if (!ODYSSEY.files.has(k)) return [p.key, null];
    try { return [p.key, ioPlaceXml(new TextDecoder('windows-1252').decode(await odysseyBytes(k)))]; } catch (e) { return [p.key, null]; }
  })).then(l => new Map(l));
  return ODYSSEY_XML;
}
/* Each puzzle's script read, once: Map(place key -> ioScript, or null). */
let ODYSSEY_SCRIPTS = null;
function odysseyScripts() {
  if (!ODYSSEY_SCRIPTS) ODYSSEY_SCRIPTS = Promise.all(IO_PLACES.map(async p => {
    const k = `scripts/${p.key}.mps`;
    if (!ODYSSEY.files.has(k)) return [p.key, null];
    try { return [p.key, ioScript(await odysseyBytes(k))]; } catch (e) { return [p.key, null]; }
  })).then(l => new Map(l));
  return ODYSSEY_SCRIPTS;
}
/* A puzzle's rules, and its settings by level from its script's lists. */
function odysseyRulesHtml(key, script) {
  const p = IO_PUZZLES[key];
  if (!p) return '';
  let html = p.rules.map(r => `<p>${esc(r)}</p>`).join('');
  if (!p.settings.length) return html;
  if (!script) return html + '<p class="note">The script does not read, so the settings are not shown.</p>';
  const lists = ioScriptLists(script);
  const cell = (v) => Array.isArray(v) ? v.join(', ') : esc(v);
  html += `<div class="wide"><table class="plain"><tr><th>setting</th>${IO_LEVELS.map(l => `<th>${esc(l)}</th>`).join('')}<th>list</th></tr>`;
  for (const [label, name] of p.settings) {
    /* A list of lists may be written as name.1 = [...], name.2 = [...]. */
    let items = lists.get(name);
    if (!items && lists.has(name + '.1')) { items = []; for (let i = 1; lists.has(`${name}.${i}`); i++) items.push(lists.get(`${name}.${i}`)); }
    if (!items) { html += `<tr><td>${esc(label)}</td><td colspan="${IO_LEVELS.length}" class="note">not in the script</td><td><code>${esc(name)}</code></td></tr>`; continue; }
    /* A list of lists has a row for each inner list, its items by level. */
    if (items.every(Array.isArray)) items.forEach((row, i) => { html += `<tr><td>${esc(label)}, ${i + 1}</td>${IO_LEVELS.map((l, j) => `<td>${cell(row[j] ?? '')}</td>`).join('')}<td><code>${esc(name)}.${i + 1}</code></td></tr>`; });
    else html += `<tr><td>${esc(label)}</td>${IO_LEVELS.map((l, j) => `<td>${cell(items[j] ?? '')}</td>`).join('')}<td><code>${esc(name)}</code></td></tr>`;
  }
  return html + '</table></div>';
}
function odysseyHelpHtml(x) {
  return '<table class="plain">' + IO_LEVELS.map((l, i) => `<tr><td>${esc(l)}</td><td>${(x.help[i] || []).map(pg => `<p>${esc(pg.text)}</p>`).join('') || '<span class="note">no help</span>'}</td></tr>`).join('') + '</table>';
}

const ODYSSEY_SCENARIO_PANES = {
  places(view, item) {
    if (item) return odysseyPlacePage(view, item);
    view.innerHTML = '<h1>Places</h1><p class="sub">The places of Island Odyssey, as the user\'s guide calls them, in the order of their scripts. In each place\'s XML are its neighbors on the map, its background and its help.</p>'
      + (odysseyIsOpen() ? '' : ODYSSEY_NOT_OPEN)
      + '<div class="wide"><table class="plain"><tr><th>place</th><th>what</th><th>script</th></tr>'
      + IO_PLACES.map(p => `<tr><td><a href="#scenario/places/${p.key}">${esc(p.name)}</a></td><td class="note">${esc(p.kind)}</td><td>${p.key}</td></tr>`).join('') + '</table></div>';
  },
  snoids(view) { return odysseySnoids(view); },
  async puzzles(view) {
    view.innerHTML = '<h1>Puzzles</h1><p class="sub">Each puzzle\'s rules, read from the program\'s code (<code>Zoombinis Island Odyssey.exe</code>), its settings by level, read from the place\'s script on the disc, and its help at each level, from the place\'s XML. Nobody has checked the rules against play.</p>';
    if (!odysseyIsOpen()) { view.insertAdjacentHTML('beforeend', ODYSSEY_NOT_OPEN); return; }
    const [xml, scripts] = await Promise.all([odysseyXml(), odysseyScripts()]);
    for (const p of IO_PLACES.filter(p => p.kind === 'puzzle')) {
      const x = xml.get(p.key);
      view.insertAdjacentHTML('beforeend', `<h2 class="h"><a href="#scenario/places/${p.key}">${esc(p.name)}</a></h2>` + odysseyRulesHtml(p.key, scripts.get(p.key)) + '<h3>Help</h3>' + (x ? odysseyHelpHtml(x) : '<p class="note">No XML.</p>'));
    }
  },
};

/* The kinds' and traits' names, from the constants in main.mps (kZoombini,
   kZerble and kZoombiniCat, and kZmbBody, kZrbTail ... numbered from 1). */
const ODYSSEY_KIND_PREFIX = { kZoombini: 'kZmb', kZerble: 'kZrb', kZoombiniCat: 'kZmbCat' };
async function odysseyCharacterNames(kinds) {
  let constants = new Map();
  if (ODYSSEY.files.has('scripts/main.mps')) try { constants = ioScriptConstants(ioScript(await odysseyBytes('scripts/main.mps'))); } catch (e) { /* the names fall back to numbers */ }
  return kinds.map(k => {
    const kindName = Object.keys(ODYSSEY_KIND_PREFIX).find(n => constants.get(n) === k.kind);
    const prefix = kindName && ODYSSEY_KIND_PREFIX[kindName];
    const traits = k.traits.map((_, t) => {
      const name = prefix && [...constants.keys()].find(n => n.startsWith(prefix) && constants.get(n) === t + 1 && /^[A-Z][a-z]+$/.test(n.slice(prefix.length)));
      return name ? name.slice(prefix.length).toLowerCase() : `trait ${t + 1}`;
    });
    const label = { kZoombini: 'A Zoombini', kZerble: 'A Zerble', kZoombiniCat: 'A Zoombini with a caterpillar' }[kindName] || `Kind ${k.kind}`;
    return { label, traits };
  });
}
/* A character walking, put together from z3common's parts as the program
   does (ioCharacterDraw), with its kind, facing and traits to pick. */
async function odysseySnoids(view) {
  view.innerHTML = '<h1>Snoids</h1><p class="sub">The program puts each character together from its parts in <code>z3common</code>, one animation for each trait, drawn in the order its table gives. The kinds, their traits and the numbering of the parts are read from the program, <code>Zoombinis Island Odyssey.exe</code>, and the names from <code>main.mps</code>. A facing to the left is the facing to the right mirrored.</p>';
  if (!odysseyIsOpen()) { view.insertAdjacentHTML('beforeend', ODYSSEY_NOT_OPEN); return; }
  const exeKey = 'win/zoombinis island odyssey.exe';
  if (!ODYSSEY.files.has(exeKey) || !ODYSSEY.files.has('rsc/z3common.bul')) { view.insertAdjacentHTML('beforeend', '<p class="note">This needs the program and z3common.bul, which the files opened lack.</p>'); return; }
  const seq = ODYSSEY_SEQ;
  view.insertAdjacentHTML('beforeend', '<p class="note">Reading the program and z3common…</p>');
  let kinds, bundle;
  try { [kinds, bundle] = await Promise.all([odysseyBytes(exeKey).then(ioCharacterKinds), odysseyBundle('rsc/z3common.bul')]); } catch (e) { view.querySelector('p.note').textContent = `The characters do not read (${e.message}).`; return; }
  if (seq !== ODYSSEY_SEQ) return;
  const names = await odysseyCharacterNames(kinds);
  if (seq !== ODYSSEY_SEQ) return;
  view.querySelector('p.note').remove();
  const form = document.createElement('div');
  form.className = 'tools';
  const stage = document.createElement('div');
  view.append(form, stage);
  const pick = { kind: 0, facing: 0, values: kinds.map(k => k.traits.map(() => 0)) };
  const facings = k => k.facings.flatMap(([, angle], f) => [[f, false, angle], [f, true, (540 - angle) % 360]]);
  const draw = () => {
    const k = kinds[pick.kind], n = names[pick.kind], fs = facings(k);
    form.innerHTML = `<label>Kind <select data-k="kind">${kinds.map((x, i) => `<option value="${i}"${i === pick.kind ? ' selected' : ''}>${esc(names[i].label)}</option>`).join('')}</select></label> `
      + `<label>Facing <select data-k="facing">${fs.map(([, m, a], i) => `<option value="${i}"${i === pick.facing ? ' selected' : ''}>${a}°${m ? ', mirrored' : ''}</option>`).join('')}</select></label> `
      + k.traits.map(([count], t) => count > 1 ? `<label>${esc(n.traits[t])} <select data-t="${t}">${Array.from({ length: count }, (_, v) => `<option value="${v}"${v === pick.values[pick.kind][t] ? ' selected' : ''}>${v + 1}</option>`).join('')}</select></label> ` : '').join('');
    const [f, mirror] = fs[pick.facing] || fs[0];
    const ids = ioCharacterParts(k, f, pick.values[pick.kind]), aos = ioCharacterAos(bundle.b, bundle.byName, ids), count = ioCharacterSteps(aos);
    const frames = [];
    for (let i = 0; i < count; i++) { const d = ioCharacterDraw(bundle.b, k, ids, aos, i, mirror); if (d) frames.push(d); }
    stage.innerHTML = '';
    if (!frames.length) { stage.innerHTML = '<p class="note">No part draws.</p>'; return; }
    /* Every step on one canvas, placed where the program draws it. */
    const x0 = Math.min(...frames.map(d => d.left)), y0 = Math.min(...frames.map(d => d.top));
    const w = Math.max(...frames.map(d => d.left + d.width)) - x0, h = Math.max(...frames.map(d => d.top + d.height)) - y0;
    const frame = i => {
      const d = frames[i], data = new Uint8ClampedArray(4 * w * h);
      for (let y = 0; y < d.height; y++) data.set(d.data.subarray(4 * y * d.width, 4 * (y + 1) * d.width), 4 * ((y + d.top - y0) * w + d.left - x0));
      return { width: w, height: h, data };
    };
    mountainPlayer(stage, frame, frames.length, 2);
    const part = id => bundle.byName.has(`${id}.ao`) ? `<a href="${odysseyLink(`rsc/z3common.bul/${id}.ao`)}">${id}</a>` : `${id} (not in z3common)`;
    stage.insertAdjacentHTML('beforeend', `<p class="note">The parts, in draw order, are ${ids.map(part).join(', ')}. ${esc(n.label)} has ${plural(k.facings.length, 'facing')} to the right and ${plural(k.traits.length, 'trait')}, and the value of its trait ${esc(n.traits[k.block])} picks a block of ${k.length} animations.</p>`);
  };
  form.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.k === 'kind') { pick.kind = +el.value; pick.facing = 0; } else if (el.dataset.k === 'facing') pick.facing = +el.value; else pick.values[pick.kind][+el.dataset.t] = +el.value;
    draw();
  });
  draw();
}

async function odysseyPlacePage(view, key) {
  const p = IO_PLACE_BY_KEY.get(key);
  view.innerHTML = `<h1>${esc(p.name)}</h1><p class="sub">${esc(p.kind)}, the script ${p.key}.</p>`;
  if (!odysseyIsOpen()) { view.insertAdjacentHTML('beforeend', ODYSSEY_NOT_OPEN); return; }
  const x = (await odysseyXml()).get(key);
  if (!x) { view.insertAdjacentHTML('beforeend', '<p class="note">The disc has no XML for this place.</p>'); return; }
  if (x.background && ODYSSEY.files.has('rsc/z3bkgd.bul')) {
    const box = document.createElement('div');
    view.appendChild(box);
    odysseyBundle('rsc/z3bkgd.bul').then(bundle => {
      const e = bundle.byName.get(x.background + '.jpg');
      if (!e) return;
      const img = document.createElement('img');
      img.src = URL.createObjectURL(new Blob([bundle.b.subarray(e.start, e.end)], { type: 'image/jpeg' }));
      img.style.maxWidth = '100%';
      box.appendChild(img);
      box.insertAdjacentHTML('beforeend', `<p class="note">The background, <a href="${odysseyLink('rsc/z3bkgd.bul/' + e.name)}">${esc(e.name)}</a> in z3bkgd.</p>`);
    }).catch(err => { box.innerHTML = `<p class="bad">${esc(err.message)}</p>`; });
  }
  const near = x.neighbors.filter(n => n !== key && IO_PLACE_BY_KEY.has(n));
  if (near.length) view.insertAdjacentHTML('beforeend', `<p>On the map it leads to ${near.map(n => `<a href="#scenario/places/${n}">${esc(IO_PLACE_BY_KEY.get(n).name)}</a>`).join(', ')}.</p>`);
  const bundles = ['rsc/' + key + '.bul', 'rsc/' + key + 'cd.bul'].filter(k => ODYSSEY.files.has(k));
  if (bundles.length) view.insertAdjacentHTML('beforeend', `<p>Its bundles are ${bundles.map(k => `<a href="${odysseyLink(k)}">${esc(k.slice(4))}</a>`).join(' and ')}.</p>`);
  if (x.right.length || x.partly.length) view.insertAdjacentHTML('beforeend', `<p>Its voices when the band is right are ${x.right.join(', ') || 'none'}, and when partly right ${x.partly.join(', ') || 'none'} (entries in its bundles, as <code>&lt;id&gt;.wav</code>).</p>`);
  if (x.help.some(h => h.length)) view.insertAdjacentHTML('beforeend', '<h2 class="h">Help</h2>' + odysseyHelpHtml(x));
}

/* ---- Components -------------------------------------------------------------- */

/* A fold for each bundle, read and filled when opened, with the entries
   test picks. */
function odysseyFolds(view, bundles, test, fill) {
  for (const k of bundles) {
    const d = document.createElement('details');
    d.className = 'sec';
    d.open = bundles.length === 1;
    const place = IO_PLACE_BY_KEY.get(k.slice(4, -4).replace(/cd$/, ''));
    d.innerHTML = `<summary><b>${esc(k.slice(4))}</b>${place ? ` <span class="note">${esc(place.name)}</span>` : ''} <span class="note">${(ODYSSEY.files.get(k).size / 1048576).toFixed(1)} MB</span></summary>`;
    view.appendChild(d);
    let filled = false;
    const fillOnce = async () => {
      if (filled) return;
      filled = true;
      d.insertAdjacentHTML('beforeend', '<p class="note">Reading the bundle…</p>');
      try {
        const bundle = await odysseyBundle(k);
        d.querySelector('p.note').remove();
        const list = bundle.entries.filter(e => test(e.name));
        d.querySelector('summary').insertAdjacentHTML('beforeend', ` <span class="note">${list.length}</span>`);
        fill(d, bundle, list);
      } catch (err) { d.querySelector('p.note').textContent = err.message; }
    };
    if (d.open) fillOnce(); else d.addEventListener('toggle', fillOnce);
  }
}
function odysseyGalleryHead(view, title, sub) {
  view.innerHTML = `<h1>${title}</h1><p class="sub">${sub}</p>`;
  if (!odysseyIsOpen()) view.insertAdjacentHTML('beforeend', ODYSSEY_NOT_OPEN);
}
function odysseySoundRows(d, bundle, list) {
  d.insertAdjacentHTML('beforeend', '<table class="plain">' + list.map((e, i) => `<tr><td><button class="play" data-i="${i}" title="Play">▶</button></td><td><a href="${odysseyLink(bundle.key + '/' + e.name)}">${esc(e.name)}</a></td><td class="note">${(e.end - e.start).toLocaleString()} bytes</td></tr>`).join('') + '</table>');
  d.addEventListener('click', e => {
    const btn = e.target.closest('button.play');
    if (!btn) return;
    const x = list[+btn.dataset.i];
    new Audio(URL.createObjectURL(new Blob([bundle.b.subarray(x.start, x.end)], { type: 'audio/wav' }))).play();
  });
}
const odysseyBundlesOf = test => odysseyKeys(k => isOdysseyBundle(k) && test(k));

const ODYSSEY_GALLERIES = {
  sheets(view) {
    const bundles = odysseyBundlesOf(k => !/z3music|z3bkgd/.test(k));
    odysseyGalleryHead(view, 'Animations', `The animations and pictures (<code>.ao</code>) of ${plural(bundles.length, 'bundle')}, a fold a bundle, read when opened. Each card shows the first frame, and an entry\'s view in Data plays it.`);
    odysseyFolds(view, bundles, n => /\.ao$/i.test(n), (d, bundle, list) => odysseyCards(d, bundle, list));
  },
  backgrounds(view) {
    const bundles = odysseyBundlesOf(k => /z3bkgd/.test(k));
    odysseyGalleryHead(view, 'Backgrounds', 'The places\' backgrounds, JPEGs in <code>z3bkgd.bul</code>, by the number in each place\'s XML.');
    odysseyFolds(view, bundles, n => /\.jpg$/i.test(n), (d, bundle, list) => odysseyCards(d, bundle, list));
  },
  sounds(view) {
    const bundles = odysseyBundlesOf(k => !/z3music|z3bkgd/.test(k));
    odysseyGalleryHead(view, 'Sounds', `The voices and sounds (<code>.wav</code>) of ${plural(bundles.length, 'bundle')}, a fold a bundle. An entry\'s number is the id that the places\' XML and scripts use.`);
    odysseyFolds(view, bundles, n => /\.wav$/i.test(n), odysseySoundRows);
  },
  music(view) {
    const bundles = odysseyBundlesOf(k => /z3music/.test(k));
    odysseyGalleryHead(view, 'Music', 'The tunes, in <code>z3music.bul</code>.');
    odysseyFolds(view, bundles, n => /\.wav$/i.test(n), odysseySoundRows);
  },
  text(view) {
    const keys = odysseyKeys(k => k.startsWith('scripts/'));
    odysseyGalleryHead(view, 'Scripts', `${plural(keys.length, 'file')} in <code>HD/scripts</code>, each place\'s XML and its script compiled for the Trinket engine.`);
    view.insertAdjacentHTML('beforeend', '<div class="ids">' + keys.map(k => `<a href="${odysseyLink(k)}">${esc(k.slice(8))}</a>`).join('') + '</div>');
  },
};

/* The side list's figure beside a pane. */
function odysseyTabCount(tab, sub) {
  if (tab === 'scenario') return { places: IO_PLACES.length, puzzles: IO_PLACES.filter(p => p.kind === 'puzzle').length, snoids: 3 }[sub] ?? '';
  if (sub === 'text') return String(odysseyKeys(k => k.startsWith('scripts/')).length || '');
  return '';
}
