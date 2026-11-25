/* page-mountain.js -- Zoombinis Mountain Rescue (2001), the second game,
   read by zb-mountain.js: its disc under Data (#mountain), and its
   Scenario and Components when the bar has 2001 picked (zbEdition).
   =========================================================================
   The visitor drops or picks the disc's image (.iso), the disc's folder or
   its Data folder, or opens archive.org's copy. An image stays as picked,
   and the page reads the files it needs out of it. From archive.org the
   page reads the disc's listing (view_archive.php, through /cors/, which
   lets any page read it) and then fetches each file the views need, one
   at a time. The browser saves the choice of archive.org's copy as
   snoidgrimoire-mountain, and the next visit opens it again. Files picked
   are not stored.
   Read:
   #mountain has the folders.
   #mountain/<folder> has a folder's files, and #mountain/<file> shows a
   file: a picture, an animation's frames played, an .anm's views and
   parts put together, a sound played, a path drawn over its place, or
   text.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-remake.js. */

const MOUNTAIN = { files: new Map(), source: '' };   // key (lower-case path from Data) -> { key, path, size, file | url }
const MOUNTAIN_KEY = 'snoidgrimoire-mountain';
const MOUNTAIN_REMOTE = { item: 'zoombinis-mountain-rescue-cd-rom-iso', iso: 'Zoombinis.iso', label: "archive.org's copy of Mountain Rescue" };
const MOUNTAIN_TABS = {
  scenario: { name: 'Scenario', subs: [['places', 'Places'], ['puzzles', 'Puzzles'], ['snoids', 'Snoids']] },
  components: { name: 'Components', subs: [['pictures', 'Pictures'], ['sheets', 'Animations'], ['sounds', 'Sounds'], ['music', 'Music'], ['text', 'Paths and text']] },
};

function mountainIsOpen() { return MOUNTAIN.files.size > 0; }
function isMountainHash() { return /^#mountain(\/|$)/.test(location.hash); }
const mountainLink = key => '#mountain' + (key ? '/' + key.split('/').map(encodeURIComponent).join('/') : '');
function mountainHashKey() {
  const m = /^#mountain\/(.+)$/.exec(location.hash);
  return m ? m[1].split('/').map(s => decodeURIComponent(s)).join('/').toLowerCase() : '';
}
const mountainName = key => key.slice(key.lastIndexOf('/') + 1);
const mountainFolder = key => key.slice(0, Math.max(0, key.lastIndexOf('/')));
const mountainKeys = test => [...MOUNTAIN.files.keys()].filter(test).sort();

/* A file's bytes, from the picked file or the image, or fetched from
   archive.org. The last 48 read stay in memory. */
const MOUNTAIN_BYTES = new Map();
function mountainBytes(key) {
  const f = MOUNTAIN.files.get(key);
  if (!f) return Promise.reject(new Error(`${key} is not on the disc`));
  if (MOUNTAIN_BYTES.has(key)) {
    const p = MOUNTAIN_BYTES.get(key);
    MOUNTAIN_BYTES.delete(key); MOUNTAIN_BYTES.set(key, p);
    return p;
  }
  const p = (async () => {
    if (f.file) return new Uint8Array(await f.file.arrayBuffer());
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`archive.org returned ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  })();
  p.catch(() => MOUNTAIN_BYTES.delete(key));
  MOUNTAIN_BYTES.set(key, p);
  while (MOUNTAIN_BYTES.size > 48) MOUNTAIN_BYTES.delete(MOUNTAIN_BYTES.keys().next().value);
  return p;
}

/* The picture a file has: one picture, or an animation's first frame, or
   an .anm's first view put together. */
async function mountainPicture(key) {
  const b = await mountainBytes(key), ext = key.split('.').pop();
  if (ext === 'bb') return mrReadBb(b);
  if (ext === 'rb') return mrReadRb(b);
  if (ext === 'bmt' || ext === 'bmp') return mrReadBmp(b);
  if (ext === 'an') return mrReadAn(b)[0];
  if (ext === 'anm') {
    const slots = mrAnmSlots(b), views = mrAnmViews(slots), [view] = views.keys();
    return mountainParts(b, slots, view, mountainFirstValues(views.get(view)), 0);
  }
  throw new Error('not a picture');
}
function mountainCanvas(pic) {
  const c = document.createElement('canvas');
  c.width = pic.width; c.height = pic.height;
  c.getContext('2d').putImageData(new ImageData(pic.data, pic.width, pic.height), 0, 0);
  return c;
}
function mountainThumb(pic, w = 160, h = 120) {
  const c = mountainCanvas(pic), s = Math.min(1, w / pic.width, h / pic.height);
  c.style.width = Math.max(1, Math.round(pic.width * s)) + 'px';
  c.style.height = Math.max(1, Math.round(pic.height * s)) + 'px';
  return c;
}

/* An .anm's view put together: the body, then each part's value in turn,
   all at one origin. values[part] is a value from 1 to 5. The program
   draws them in this order too, the body, feet, nose, hair and eyes, each
   over the one before (FUN_0045d580). */
function mountainFirstValues(parts) { return parts.map(v => v[0]); }
function mountainParts(b, slots, view, values, frame) {
  let out = null;
  values.forEach((value, part) => {
    if (value == null) return;
    const s = slots[mrAnmSlot(view, part, value)];
    if (!s) return;
    const pic = mrAnmFrame(b, s[Math.min(frame, s.length - 1)]);
    if (!out) { out = { width: pic.width, height: pic.height, data: new Uint8ClampedArray(pic.data) }; return; }
    const d = out.data, p = pic.data;
    for (let i = 0; i < d.length && i < p.length; i += 4) {
      const a = p[i + 3] / 255;
      if (!a) continue;
      d[i] = p[i] * a + d[i] * (1 - a); d[i + 1] = p[i + 1] * a + d[i + 1] * (1 - a); d[i + 2] = p[i + 2] * a + d[i + 2] * (1 - a);
      d[i + 3] = 255 - (255 - p[i + 3]) * (255 - d[i + 3]) / 255;
    }
  });
  if (!out) throw new Error(`view ${view} has none of those parts`);
  return out;
}

/* ---- opening ----------------------------------------------------------------- */

/* Take the game's files out of a disc's or a folder's entries, each
   { path, size, file | url }. */
function mountainTake(entries, source) {
  const game = mrGameFiles(entries, e => e.path);
  if (!game.size) return 0;
  MOUNTAIN.files.clear();
  MOUNTAIN_BYTES.clear();
  MOUNTAIN_TIMES = null;
  for (const [key, e] of game) MOUNTAIN.files.set(key, { key, path: e.path, size: e.size, file: e.file, url: e.url });
  MOUNTAIN.source = source;
  $('start').hidden = true;
  $('views').hidden = false;
  $('find').hidden = false;
  return game.size;
}
function mountainShow(stay) {
  if (stay && location.hash && !isMountainHash()) { if (/^#(scenario|components)/.test(location.hash)) route(); return; }
  if (location.hash === '#mountain') route(); else location.hash = '#mountain';
}

/* Files dropped or picked: a disc image, or a disc's or a Data folder's
   files. True if they were Mountain Rescue's. */
async function mountainTryFiles(files) {
  for (const iso of files.filter(f => /\.iso$/i.test(f.name))) {
    let list;
    try { list = await mrIsoFiles(async (a, z) => new Uint8Array(await iso.slice(a, z).arrayBuffer())); } catch (e) { continue; }
    if (!mrLooksLike(list.map(f => f.path))) continue;
    const n = mountainTake(list.map(f => ({ path: f.path, size: f.size, file: iso.slice(f.offset, f.offset + f.size) })), iso.name);
    if (n) { setStatus(''); mountainShow(false); return true; }
  }
  const pathOf = f => (f.remakePath || f.webkitRelativePath || f.name).replace(/^\/+/, '');
  if (!mrLooksLike(files.map(pathOf))) return false;
  // A Data folder picked alone has paths from Data, and a disc's from its top.
  const entries = files.map(f => { const p = pathOf(f); return { path: /(^|\/)(data|install)\//i.test(p) ? p : 'Data/' + p.replace(/^[^/]*\//, ''), size: f.size, file: f }; });
  if (!mountainTake(entries, 'the disc\'s files')) return false;
  setStatus('');
  mountainShow(false);
  return true;
}

/* archive.org's copy, its listing first. */
async function mountainOpenRemote(stay = false) {
  const base = `https://archive.org/cors/${MOUNTAIN_REMOTE.item}/${MOUNTAIN_REMOTE.iso}/`;
  setStatus(`Reading the list of ${MOUNTAIN_REMOTE.label}…`);
  let list;
  try {
    const res = await fetch(base);
    if (!res.ok) throw new Error(`archive.org returned ${res.status}`);
    list = mrArchiveListing(await res.text(), MOUNTAIN_REMOTE.iso);
    if (!list.length) throw new Error('the list was empty');
  } catch (e) { setStatus(`Could not read the list of ${MOUNTAIN_REMOTE.label} (${e.message}).`, true); return; }
  const n = mountainTake(list.map(f => ({ path: f.path, size: f.size, url: base + encodeURIComponent(f.path) })), MOUNTAIN_REMOTE.label);
  if (!n) { setStatus(`${MOUNTAIN_REMOTE.label} has none of the game's files.`, true); return; }
  try { localStorage.setItem(MOUNTAIN_KEY, 'archive.org'); } catch (e) { /* not saved */ }
  setStatus('');
  mountainShow(stay);
}
async function mountainOpenSaved() {
  let saved = null;
  try { saved = localStorage.getItem(MOUNTAIN_KEY); } catch (e) { /* nothing saved */ }
  if (saved === 'archive.org' && !mountainIsOpen()) await mountainOpenRemote(true);
}

/* ---- Data -------------------------------------------------------------------- */

let MOUNTAIN_SEQ = 0;
async function renderMountain() {
  const seq = ++MOUNTAIN_SEQ, key = mountainHashKey(), view = $('view');
  const isFile = MOUNTAIN.files.has(key);
  const parts = key ? key.split('/') : [];
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><a href="#mountain">Mountain Rescue</a>'
    + parts.map((p, i) => `<span class="sep">›</span>` + (i < parts.length - 1 ? `<a href="${mountainLink(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>` : `<span>${esc(p)}</span>`)).join('');
  renderSide({ name: '#mountain' }, { archive: null, tag: null, id: null });
  $('side').insertAdjacentHTML('beforeend', mountainSideHtml(key));
  for (const el of $('side').querySelectorAll('[data-mountain]')) el.addEventListener('click', () => { location.hash = mountainLink(el.dataset.mountain); });
  const clear = $('side').querySelector('[data-mountain-clear]');
  if (clear) clear.addEventListener('click', e => {
    e.stopPropagation();
    try { localStorage.removeItem(MOUNTAIN_KEY); } catch (err) { /* nothing saved */ }
    clear.parentNode.remove();
    setStatus('The next visit opens Mountain Rescue only from files chosen.');
  });
  view.scrollTop = 0;
  try {
    if (!mountainIsOpen()) view.innerHTML = mountainHomeHtml();
    else if (isFile) await mountainFileView(view, key, seq);
    else view.innerHTML = key ? mountainFolderHtml(key) : mountainHomeHtml();
  } catch (e) {
    view.innerHTML += `<p class="bad">This could not be shown (${esc(e.message)}).</p>`;
    console.error(e);
  }
  for (const pick of view.querySelectorAll('.mountainPick')) pick.addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!(await mountainTryFiles(files))) setStatus('Those files are not Mountain Rescue\'s disc.', true);
  });
  const remote = $('mountainRemote');
  if (remote) remote.addEventListener('click', () => mountainOpenRemote());
}

function mountainSideHtml(key) {
  if (!mountainIsOpen()) return '';
  let saved = null;
  try { saved = localStorage.getItem(MOUNTAIN_KEY); } catch (e) { /* nothing saved */ }
  let html = `<p class="remembered">${esc(MOUNTAIN.source)}${saved === 'archive.org' ? ', opened on each visit. <a data-mountain-clear>Clear</a>' : ''}</p>`;
  const top = [...new Set([...MOUNTAIN.files.keys()].map(k => k.split('/').slice(0, k.startsWith('bmp/') ? 2 : 1).join('/')))].sort();
  for (const t of top) {
    const n = [...MOUNTAIN.files.keys()].filter(k => k === t || k.startsWith(t + '/')).length;
    const place = MR_PLACE_BY_KEY.get(t.replace(/^bmp\//, ''));
    html += `<div class="arc${key === t || key.startsWith(t + '/') ? ' on' : ''}" data-mountain="${esc(t)}"><span class="name">${esc(t)}</span><span class="place">${esc(place ? place.name : plural(n, 'file'))}</span></div>`;
  }
  return html;
}

function mountainHomeHtml() {
  let html = '<h1>Mountain Rescue</h1><p class="sub"><i>Zoombinis Mountain Rescue</i> (TERC and The Learning Company, 2001) is the second game. Its pictures, animations, sounds and paths are loose files in the disc\'s <code>Data</code> folder, and none is a Mohawk archive. Open the disc\'s image (<code>.iso</code>), the disc\'s folder or its <code>Data</code> folder, or read archive.org\'s copy.</p>'
    + '<div class="tools"><label class="btn">Image…<input type="file" class="mountainPick" accept=".iso,.ISO" hidden></label> <label class="btn">Folder…<input type="file" class="mountainPick" webkitdirectory hidden></label> <button id="mountainRemote">Read archive.org\'s copy</button></div>';
  if (!mountainIsOpen()) return html + '<p class="note">Mountain Rescue is not open.</p>';
  const kinds = new Map();
  for (const k of MOUNTAIN.files.keys()) { const kind = mrKind(k); kinds.set(kind, (kinds.get(kind) || 0) + 1); }
  html += `<p>${plural(MOUNTAIN.files.size, 'file')} from ${esc(MOUNTAIN.source)}.</p><table class="plain"><tr><th>kind</th><th>files</th></tr>`
    + [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(k)}</td><td>${n.toLocaleString()}</td></tr>`).join('') + '</table>';
  return html + '<h2 class="h">Places</h2><table class="plain">' + MR_PLACES.map(p => `<tr><td><a href="${mountainLink('bmp/' + p.key)}">${esc(p.name)}</a></td><td class="note">${esc(p.kind)}</td></tr>`).join('') + '</table>';
}

function mountainFolderHtml(folder) {
  const inside = [...MOUNTAIN.files.keys()].filter(k => k.startsWith(folder + '/'));
  if (!inside.length) return `<h1>${esc(folder)}</h1><p class="note">Nothing on the disc is in this folder.</p>`;
  const subs = new Map(), files = [];
  for (const k of inside) {
    const rest = k.slice(folder.length + 1);
    if (rest.includes('/')) { const s = rest.split('/')[0]; subs.set(s, (subs.get(s) || 0) + 1); } else files.push(k);
  }
  const place = MR_PLACE_BY_KEY.get(folder.replace(/^bmp\//, ''));
  let html = `<h1>${esc(folder)}</h1>` + (place ? `<p class="sub">${esc(place.name)}, ${esc(place.kind)}. <a href="#scenario/places/${place.key}">The place</a></p>` : '');
  if (subs.size) html += '<h2 class="h">Folders</h2><table class="plain">' + [...subs].sort().map(([s, n]) => `<tr><td><a href="${mountainLink(folder + '/' + s)}">${esc(s)}</a></td><td class="note">${plural(n, 'file')}</td></tr>`).join('') + '</table>';
  if (files.length) html += '<h2 class="h">Files</h2><table class="plain">' + files.map(k => `<tr><td><a href="${mountainLink(k)}">${esc(mountainName(k))}</a></td><td class="note">${esc(mrKind(k))}</td><td class="note">${MOUNTAIN.files.get(k).size.toLocaleString()} bytes</td></tr>`).join('') + '</table>';
  return html;
}

/* A file's view by its kind. */
async function mountainFileView(view, key, seq) {
  const f = MOUNTAIN.files.get(key), kind = mrKind(key), ext = key.split('.').pop();
  view.innerHTML = `<h1>${esc(mountainName(f.path))}</h1><p class="sub">${esc(f.path)}, ${f.size.toLocaleString()} bytes, ${esc(kind)}</p><p class="note">Reading it…</p>`;
  const b = await mountainBytes(key);
  if (seq !== MOUNTAIN_SEQ) return;
  view.querySelector('p.note').remove();
  const tools = document.createElement('div');
  tools.className = 'tools';
  tools.innerHTML = '<button data-save-file>Save the file</button>';
  tools.querySelector('[data-save-file]').addEventListener('click', () => mountainSave(new Blob([b]), mountainName(f.path)));
  view.appendChild(tools);
  if (kind === 'picture') {
    const pic = ext === 'bb' ? mrReadBb(b) : ext === 'rb' ? mrReadRb(b) : mrReadBmp(b);
    view.insertAdjacentHTML('beforeend', `<p>${pic.width} × ${pic.height}${pic.dropped ? `, with ${plural(pic.dropped, 'pixel')} past the width left out` : ''}.</p>`);
    mountainPictureBlock(view, pic, mountainName(f.path).replace(/\.\w+$/, '') + '.png');
  } else if (kind === 'animation') {
    const frames = mrReadAn(b);
    view.insertAdjacentHTML('beforeend', `<p>${plural(frames.length, 'frame')} of ${frames[0].width} × ${frames[0].height}.</p>`);
    mountainPlayer(view, i => frames[i % frames.length], frames.length);
    const strip = document.createElement('div');
    strip.className = 'cards';
    frames.forEach((fr, i) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = `<div class="pic"></div><div class="cap">frame ${i}</div>`; d.firstChild.appendChild(mountainThumb(fr)); strip.appendChild(d); });
    view.appendChild(strip);
  } else if (kind === 'parts') {
    mountainPartsView(view, b, key);
  } else if (kind === 'sound') {
    const a = document.createElement('audio');
    a.controls = true;
    a.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    view.appendChild(a);
    const fmt = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length > 36) view.insertAdjacentHTML('beforeend', `<p class="note">${fmt.getUint16(22, true) === 2 ? 'Stereo' : 'Mono'}, ${fmt.getUint32(24, true).toLocaleString()} Hz, ${fmt.getUint16(34, true)}-bit.</p>`);
  } else if (kind === 'path') {
    await mountainPathView(view, key, new TextDecoder('latin1').decode(b));
  } else if (kind === 'text') {
    view.insertAdjacentHTML('beforeend', `<pre>${esc(new TextDecoder('windows-1252').decode(b))}</pre>`);
  } else if (kind === 'movie') {
    view.insertAdjacentHTML('beforeend', '<p class="note">A Bink video. The page does not play Bink.</p>');
  }
}

function mountainSave(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* A picture at its size, no wider than the view, with a PNG to save. */
function mountainPictureBlock(view, pic, name) {
  const c = mountainCanvas(pic);
  c.style.maxWidth = '100%';
  c.className = 'px';
  view.appendChild(c);
  const t = document.createElement('div');
  t.className = 'tools';
  t.innerHTML = '<button>Save as PNG</button>';
  t.firstChild.addEventListener('click', () => c.toBlob(bl => mountainSave(bl, name)));
  view.appendChild(t);
}
/* Each .anm's time a frame from zoombini2.exe (mrAnmFrameTimes), once, or
   an empty Map when the disc has no program. */
let MOUNTAIN_TIMES = null;
function mountainFrameTimes() {
  if (!MOUNTAIN_TIMES) MOUNTAIN_TIMES = MOUNTAIN.files.has('zoombini2.exe')
    ? mountainBytes('zoombini2.exe').then(mrAnmFrameTimes).catch(() => new Map())
    : Promise.resolve(new Map());
  return MOUNTAIN_TIMES;
}
/* A canvas that plays frame(i) for i = 0 to n - 1 over and over, with a
   button to stop it. ms is the time a frame as the program gives it, and
   without it the player shows 12 frames a second, an estimate. */
function mountainPlayer(view, frame, n, scale = 2, ms = 0) {
  const first = frame(0), c = mountainCanvas(first);
  c.className = 'px';
  c.style.width = first.width * scale + 'px';
  c.style.height = first.height * scale + 'px';
  const box = document.createElement('div');
  box.className = 'tools';
  box.innerHTML = '<button>Stop</button> <span class="note">' + (ms ? `${ms} ms a frame, as the game plays it` : '12 frames a second, an estimate') + '</span>';
  const wait = ms || 1000 / 12;
  view.appendChild(c);
  view.appendChild(box);
  let i = 0, on = n > 1;
  const btn = box.firstChild;
  btn.addEventListener('click', () => { on = !on; btn.textContent = on ? 'Stop' : 'Play'; });
  const tick = () => {
    if (!c.isConnected) return;
    if (on) {
      i = (i + 1) % n;
      const p = frame(i);
      if (p.width !== c.width || p.height !== c.height) { c.width = p.width; c.height = p.height; }
      c.getContext('2d').putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
    }
    setTimeout(tick, wait);
  };
  if (n > 1) setTimeout(tick, wait); else btn.hidden = true;
  return c;
}

/* An .anm: its views, each part's values, and the parts put together. */
function mountainPartsView(view, b, key) {
  const slots = mrAnmSlots(b), views = mrAnmViews(slots), list = [...views.keys()];
  view.insertAdjacentHTML('beforeend', `<p>${plural(list.length, 'view')} (${list.join(', ')}), each with ${MR_PARTS.slice(1).join(', ')} values over its body. A slot is view × 30 + part × 6 + value. The parts stack as the game stacks them, the body first and the eyes on top.</p>`);
  const form = document.createElement('div');
  form.className = 'tools';
  const sel = (name, opts) => `<label>${name} <select data-k="${name}">${opts.map(o => `<option value="${o}">${o}</option>`).join('')}</select></label> `;
  form.innerHTML = sel('view', list) + MR_PARTS.slice(1).map(p => sel(p, ['none', 1, 2, 3, 4, 5])).join('');
  view.appendChild(form);
  const stage = document.createElement('div');
  view.appendChild(stage);
  const draw = () => {
    const v = +form.querySelector('[data-k="view"]').value, parts = views.get(v);
    const values = MR_PARTS.map((p, i) => {
      if (!i) return parts[0].length ? 0 : null;
      const s = form.querySelector(`[data-k="${p}"]`).value;
      return s === 'none' ? null : parts[i].includes(+s) ? +s : null;
    });
    const n = Math.max(1, ...values.map((val, i) => val == null ? 1 : (slots[mrAnmSlot(v, i, val)] || []).length));
    stage.innerHTML = '';
    mountainFrameTimes().then(times => { if (stage.isConnected) mountainPlayer(stage, i => mountainParts(b, slots, v, values, i), n, 3, times.get(key) || 0); });
  };
  for (const s of form.querySelectorAll('select')) {
    if (s.dataset.k !== 'view') s.value = '1';
    s.addEventListener('change', draw);
  }
  draw();
}

/* A path's legs drawn over its folder's picture, or its place's. */
async function mountainPathView(view, key, text) {
  const legs = mrReadPat(text);
  view.insertAdjacentHTML('beforeend', `<pre>${esc(text)}</pre><p>${plural(legs.length, 'leg')}, on the 800 × 600 screen.</p>`);
  const folder = mountainFolder(key), place = MR_PLACES.find(p => folder.startsWith('bmp/' + p.key));
  const bg = mountainKeys(k => mountainFolder(k) === folder && /\.bb$/.test(k))[0] || (place && 'bmp/' + place.background);
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  c.style.maxWidth = '100%';
  view.appendChild(c);
  const g = c.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, 800, 600);
  if (bg && MOUNTAIN.files.has(bg)) {
    try { const pic = await mountainPicture(bg); g.putImageData(new ImageData(pic.data, pic.width, pic.height), 0, 0); } catch (e) { /* drawn on gray */ }
  }
  const colors = ['#ff4', '#4ff', '#f4f', '#4f4', '#f84', '#88f'];
  legs.forEach((leg, i) => {
    g.strokeStyle = g.fillStyle = colors[i % colors.length];
    g.lineWidth = 3;
    g.beginPath();
    leg.points.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    for (const [x, y] of leg.points) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.font = '14px sans-serif';
    g.fillText(leg.name, leg.points[0][0] + 6, leg.points[0][1] - 6);
  });
}

/* ---- Scenario ---------------------------------------------------------------- */

const MOUNTAIN_NOT_OPEN = '<p class="note">Mountain Rescue is not open. <a href="#mountain">Open it under Data</a>.</p>';
const MOUNTAIN_SCENARIO_PANES = {
  places(view, item) {
    if (item) return mountainPlacePage(view, item);
    view.innerHTML = '<h1>Places</h1><p class="sub">The places of Mountain Rescue in the order of the program\'s code, with their names from the user\'s guide and their folders on the disc. From Rescue Site I the band goes by the left or the right route, and the two meet at Rescue Site II.</p>'
      + (mountainIsOpen() ? '' : MOUNTAIN_NOT_OPEN)
      + '<div class="wide"><table class="plain"><tr><th>place</th><th>what</th><th>folder</th></tr>'
      + MR_PLACES.map(p => `<tr><td><a href="#scenario/places/${p.key}">${esc(p.name)}</a></td><td class="note">${esc(p.kind)}</td><td><a href="${mountainLink('bmp/' + p.key)}">bmp/${esc(p.key)}</a></td></tr>`).join('') + '</table></div>';
    const cards = MR_PLACES.filter(p => MOUNTAIN.files.has('bmp/' + p.background)).map(p => ({ href: `#scenario/places/${p.key}`, cap: esc(p.name), key: 'bmp/' + p.background }));
    galleryCards(view, cards, async (c, pic) => { pic.appendChild(mountainThumb(await mountainPicture(c.key))); });
  },
  puzzles(view) {
    view.innerHTML = '<h1>Puzzles</h1><p class="sub">Each puzzle\'s goal and its three levels. Some are read from the program, and nobody has checked them against play. The rest are as the user\'s guide on the disc gives them (<code>INSTALL/Data/Zoombinimr.pdf</code>). A note under each gives its source.</p>';
    for (const [key, z] of Object.entries(MR_PUZZLES)) {
      const p = MR_PLACE_BY_KEY.get(key);
      view.insertAdjacentHTML('beforeend', `<h2 class="h"><a href="#scenario/places/${key}">${esc(p.name)}</a></h2><p>${esc(z.goal)}</p><p class="note">${z.from === 'program' ? 'Read from the program.' : 'As the user\'s guide gives it.'}</p><table class="plain">`
        + MR_LEVELS.map((l, i) => `<tr><td>${esc(l)}</td><td>${esc(z.levels[i])}</td></tr>`).join('') + '</table>');
    }
  },
  snoids(view) {
    view.innerHTML = '<h1>Snoids</h1><p class="sub">The Zoombinis and Fleens are put together from parts. Each <code>.anm</code> file has up to 100 views, and each view a body and five values of each of four parts. The views of <code>zombis/littlezomb.anm</code> turn a Zoombini a full circle.</p>';
    if (!mountainIsOpen()) { view.insertAdjacentHTML('beforeend', MOUNTAIN_NOT_OPEN); return; }
    const anms = mountainKeys(k => /\.anm$/.test(k));
    view.insertAdjacentHTML('beforeend', '<table class="plain">' + anms.map(k => `<tr><td><a href="${mountainLink(k)}">${esc(k)}</a></td><td class="note">${MOUNTAIN.files.get(k).size.toLocaleString()} bytes</td></tr>`).join('') + '</table>');
    const main = anms.find(k => /littlezomb\.anm$/.test(k)) || anms[0];
    if (!main) return;
    view.insertAdjacentHTML('beforeend', `<h2 class="h">${esc(main)}</h2>`);
    const box = document.createElement('div');
    view.appendChild(box);
    mountainBytes(main).then(b => mountainPartsView(box, b, main)).catch(e => { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; });
  },
};

async function mountainPlacePage(view, key) {
  const p = MR_PLACE_BY_KEY.get(key), z = MR_PUZZLES[key], folder = 'bmp/' + key;
  view.innerHTML = `<h1>${esc(p.name)}</h1><p class="sub">${esc(p.kind)}, in the folder <a href="${mountainLink(folder)}">${esc(folder)}</a>.</p>`;
  if (!mountainIsOpen()) { view.insertAdjacentHTML('beforeend', MOUNTAIN_NOT_OPEN); return; }
  if (MOUNTAIN.files.has('bmp/' + p.background)) {
    try { mountainPictureBlock(view, await mountainPicture('bmp/' + p.background), key + '.png'); } catch (e) { view.insertAdjacentHTML('beforeend', `<p class="bad">${esc(e.message)}</p>`); }
  }
  if (z) view.insertAdjacentHTML('beforeend', `<h2 class="h">The puzzle</h2><p>${esc(z.goal)}</p><table class="plain">` + MR_LEVELS.map((l, i) => `<tr><td>${esc(l)}</td><td>${esc(z.levels[i])}</td></tr>`).join('') + `</table><p class="note">${z.from === 'program' ? 'Read from the program.' : 'As the user\'s guide gives it.'}</p>`);
  const inside = mountainKeys(k => k.startsWith(folder + '/'));
  const byKind = new Map();
  for (const k of inside) { const kind = mrKind(k); if (!byKind.has(kind)) byKind.set(kind, []); byKind.get(kind).push(k); }
  for (const [kind, list] of byKind) {
    view.insertAdjacentHTML('beforeend', `<h2 class="h">${esc(kind)} <span class="note">${list.length}</span></h2>`);
    if (kind === 'picture' || kind === 'animation' || kind === 'parts') mountainCards(view, list);
    else view.insertAdjacentHTML('beforeend', '<div class="ids">' + list.map(k => `<a href="${mountainLink(k)}">${esc(k.slice(folder.length + 1))}</a>`).join('') + '</div>');
  }
}

/* ---- Components -------------------------------------------------------------- */

function mountainCards(d, keys) {
  galleryCards(d, keys.map(k => ({ key: k, href: mountainLink(k), cap: esc(mountainName(MOUNTAIN.files.get(k).path)) })), async (c, pic) => {
    try {
      const p = await mountainPicture(c.key);
      pic.appendChild(mountainThumb(p));
      pic.nextSibling.insertAdjacentHTML('beforeend', ` <span class="note">${p.width} × ${p.height}</span>`);
    } catch (e) { pic.textContent = e.message; }
  });
}
function mountainFolds(view, keys, fill) {
  const groups = new Map();
  for (const k of keys) { const g = mountainFolder(k); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
  const list = [...groups].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [g, items] of list) {
    const d = document.createElement('details');
    d.className = 'sec';
    d.open = list.length === 1;
    const place = MR_PLACE_BY_KEY.get(g.split('/')[1]);
    d.innerHTML = `<summary><b>${esc(g)}</b>${place && g === 'bmp/' + place.key ? ` <span class="note">${esc(place.name)}</span>` : ''} <span class="note">${items.length}</span></summary>`;
    view.appendChild(d);
    let filled = false;
    const fillOnce = () => { if (!filled) { filled = true; fill(d, items); } };
    if (d.open) fillOnce(); else d.addEventListener('toggle', fillOnce);
  }
}
function mountainGalleryHead(view, title, sub) {
  view.innerHTML = `<h1>${title}</h1><p class="sub">${sub}</p>`;
  if (!mountainIsOpen()) view.insertAdjacentHTML('beforeend', MOUNTAIN_NOT_OPEN);
}
function mountainSoundRows(d, keys) {
  d.insertAdjacentHTML('beforeend', '<table class="plain">' + keys.map((k, i) => `<tr><td><button class="play" data-i="${i}" title="Play">▶</button></td><td><a href="${mountainLink(k)}">${esc(mountainName(MOUNTAIN.files.get(k).path))}</a></td><td class="note">${MOUNTAIN.files.get(k).size.toLocaleString()} bytes</td></tr>`).join('') + '</table>');
  d.addEventListener('click', async e => {
    const btn = e.target.closest('button.play');
    if (!btn) return;
    try { new Audio(URL.createObjectURL(new Blob([await mountainBytes(keys[+btn.dataset.i])], { type: 'audio/wav' }))).play(); } catch (err) { btn.title = err.message; }
  });
}
const isMountainMusic = k => /^sounds\/music\//.test(k);

const MOUNTAIN_GALLERIES = {
  pictures(view) {
    const keys = mountainKeys(k => mrKind(k) === 'picture');
    mountainGalleryHead(view, 'Pictures', `${plural(keys.length, 'picture')} on the disc, by folder. The backgrounds (<code>.bb</code>) are 800 × 600 in 24-bit color, the sprites (<code>.rb</code>) have an alpha for each pixel, and the <code>.bmt</code> files are Windows BMPs, among them the click maps and the font.`);
    mountainFolds(view, keys, mountainCards);
  },
  sheets(view) {
    const keys = mountainKeys(k => mrKind(k) === 'animation' || mrKind(k) === 'parts');
    mountainGalleryHead(view, 'Animations', `${plural(keys.length, 'animation')} on the disc, by folder. An <code>.an</code> file is a run of frames, and an <code>.anm</code> file a snoid\'s parts in up to 100 views. Each card shows the first frame, and a file\'s view in Data plays it.`);
    mountainFolds(view, keys, mountainCards);
  },
  sounds(view) {
    const keys = mountainKeys(k => mrKind(k) === 'sound' && !isMountainMusic(k));
    mountainGalleryHead(view, 'Sounds', `${plural(keys.length, 'sound')} on the disc, besides the music, by folder. Each is a plain WAV file.`);
    mountainFolds(view, keys, mountainSoundRows);
  },
  music(view) {
    const keys = mountainKeys(k => mrKind(k) === 'sound' && isMountainMusic(k));
    mountainGalleryHead(view, 'Music', `${plural(keys.length, 'tune')}, recordings that the installer copies to the disk from <code>INSTALL/HD/sounds/music</code>.`);
    mountainFolds(view, keys, mountainSoundRows);
  },
  text(view) {
    const keys = mountainKeys(k => mrKind(k) === 'path' || mrKind(k) === 'text');
    mountainGalleryHead(view, 'Paths and text', `${plural(keys.length, 'file')} on the disc, by folder. A <code>.pat</code> file is a path on the screen, and its view in Data draws it over its place.`);
    mountainFolds(view, keys, (d, items) => d.insertAdjacentHTML('beforeend', '<div class="ids">' + items.map(k => `<a href="${mountainLink(k)}">${esc(mountainName(MOUNTAIN.files.get(k).path))}</a>`).join('') + '</div>'));
  },
};

/* The side list's figure beside a pane. */
function mountainTabCount(tab, sub) {
  if (tab === 'scenario') return { places: MR_PLACES.length, puzzles: Object.keys(MR_PUZZLES).length, snoids: mountainKeys(k => /\.anm$/.test(k)).length || '' }[sub] ?? '';
  const test = { pictures: k => mrKind(k) === 'picture', sheets: k => mrKind(k) === 'animation' || mrKind(k) === 'parts', sounds: k => mrKind(k) === 'sound' && !isMountainMusic(k),
    music: k => mrKind(k) === 'sound' && isMountainMusic(k), text: k => mrKind(k) === 'path' || mrKind(k) === 'text' }[sub];
  const n = test ? mountainKeys(test).length : 0;
  return n ? String(n) : '';
}
