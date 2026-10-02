/* page-browse.js -- the archives, what is in each, and a view of every
   resource: pictures and sprite sheets in their palette, sounds to play and
   save, tunes to save, palettes, cursors, strings, walk nodes and paths
   drawn over their room, registration points, and scripts frame by frame.
   =========================================================================
   The address bar holds the view: #FLEENS, #FLEENS/tBMP/4000, #ZOOMBINI/SND/99
   (the sound type, "\0SND" in the archive, is written SND).

   The page's own script: DOM here. LOAD ORDER: last, after page-open.js,
   whose ARCHIVES, ensureBytes and openedArchive it uses. */

const PALETTE_PICK = new Map();        // archive name -> 'SHPL 5000', or absent for the default
const ZOOM_PICK = new Map();           // 'tBMP picture' / 'tBMP sheet' -> zoom
let RENDER_SEQ = 0;
let SHARED_COLOURS = null;             // indices 10-45, the same in every scene's palette
let SIDE_ARCHIVE = null;               // the archive the list was last scrolled to

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tagLabel = tag => mohawkTagLabel(tag);
const tagFromLabel = label => (label === 'SND' ? '\0SND' : label);
const link = (arch, tag, id) => `#${arch}${tag ? '/' + tagLabel(tag) + (id != null ? '/' + id : '') : ''}`;
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : (many || one + 's')}`;

function sortedArchives() {
  return [...ARCHIVES.values()].sort((a, b) => zbArchiveRank(a.name) - zbArchiveRank(b.name) || a.name.localeCompare(b.name));
}

function parseHash() {
  const [archive, tag, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { archive: (archive || '').toUpperCase(), tag: tag ? tagFromLabel(tag) : null, id: id != null && id !== '' ? +id : null };
}

/* The first view: the map, when the files have one, else the archives. */
function browseStart(first) {
  $('start').hidden = true;
  $('views').hidden = false;
  $('find').hidden = false;
  const want = first || (journeyAvailable() ? 'journey' : null);
  if (want && !location.hash) location.hash = '#' + want;
  else route();
}

/* The address decides the view: the map's (page-map.js) or an archive's. */
function route() {
  const tab = tabOfHash(), search = tab ? null : searchOfHash(), changes = !tab && search == null && isChangesHash(), mods = !tab && search == null && isModsHash(), saves = !tab && search == null && isSavesHash();
  const town = !tab && search == null && /^#town\b/.test(location.hash) && ARCHIVES.has('TOWN');
  const solve = !town && isSolveHash();
  const map = !town && !solve && isJourneyHash() && journeyAvailable();
  $('town').hidden = !town;
  $('solve').hidden = !solve;
  $('journey').hidden = !map;
  $('app').hidden = map || town || solve;
  renderTopTabs();
  if (search == null) $('q').value = '';
  if (saves) renderSaves();
  else if (mods) renderMods();
  else if (changes) renderChanges();
  else if (search != null) renderSearch(search);
  else if (tab) renderTab(tab);
  else if (town) townRoute();
  else if (solve) solveRoute();
  else if (map) journeyRoute();
  else render();
}

window.addEventListener('hashchange', () => { if (ARCHIVES.size) route(); });

/* ---- the frame of the page ----------------------------------------------- */

async function render() {
  const seq = ++RENDER_SEQ;
  const h = parseHash();
  const list = sortedArchives();
  const entry = ARCHIVES.get(h.archive) || list[0];
  if (!entry) return;
  renderCrumbs(entry, h);
  renderSide(entry, h);
  const view = $('view');
  if (entry.remote && !entry.bytes && !entry.error) {
    view.innerHTML = `<h1>${esc(entry.name)}</h1><p class="sub">${esc(placeOf(entry.name))}</p><p class="note">Fetching it from archive.org…</p>`;
    await ensureBytes(entry);
    if (seq === RENDER_SEQ) render();
    return;
  }
  const arc = openedArchive(entry);
  if (!arc) {
    view.innerHTML = `<h1>${esc(entry.name)}</h1><p class="bad">${esc(entry.error || 'Not read.')}</p>`;
    return;
  }
  renderSide(entry, h);
  // Pictures need the colours every scene shares; in archive.org's copy
  // they come from the map, the smallest archive that has them.
  if (!sharedColours() && entry.remote && ARCHIVES.has('RODMAP') && !ARCHIVES.get('RODMAP').bytes && !ARCHIVES.get('RODMAP').error
      && (h.tag === 'tBMP' || h.tag === 'NODE' || h.tag === 'PATH' || !h.tag)) {
    await ensureBytes(ARCHIVES.get('RODMAP'));
    if (seq !== RENDER_SEQ) return;
    renderSide(entry, h);
  }
  view.scrollTop = 0;
  try {
    if (!h.tag || !arc.has(h.tag, h.id)) renderArchive(entry, arc, h);
    else renderResource(entry, arc, h.tag, h.id);
  } catch (e) {
    view.innerHTML += `<p class="bad">Could not show it: ${esc(e.message)}</p>`;
    console.error(e);
  }
}

function placeOf(name) {
  const a = ZB_ARCHIVES[name];
  return a ? a.place : '';
}

function renderCrumbs(entry, h) {
  const parts = [`<a href="${link(entry.name)}">${esc(entry.name)}</a>`];
  if (h.tag) parts.push(`<a href="${link(entry.name, h.tag)}">${esc(tagLabel(h.tag))}</a>`);
  if (h.tag && h.id != null) parts.push(`<span>${h.id}</span>`);
  $('crumbs').innerHTML = parts.join('<span class="sep">›</span>');
}

function renderSide(entry, h) {
  const side = $('side');
  const keep = side.scrollTop;
  let html = `<h2>${esc(SOURCE)}</h2>`;
  if (REMEMBERED) html += `<p class="remembered">Remembered in this browser. <a data-forget>Forget</a></p>`;
  const edits = [...EDITS.values()].reduce((n, e) => n + e.changes.size, 0);
  html += `<div class="arc${isChangesHash() ? ' on' : ''}" data-arc="changes"><span class="name">Changes</span><span class="place">${edits || EXE_EDIT ? plural(edits + (EXE_EDIT ? 1 : 0), 'edit') : 'nothing edited'}</span></div>`;
  html += `<div class="arc${isSavesHash() ? ' on' : ''}" data-arc="saves"><span class="name">Saves</span><span class="place">${SAVES.length ? plural(SAVES.length, 'game') + ' open' : 'saved games'}</span></div>`;
  html += `<div class="arc${isModsHash() ? ' on' : ''}" data-arc="mods"><span class="name">Mods</span><span class="place">recolour, Fleen parts</span></div>`;
  for (const e of sortedArchives()) {
    html += `<div class="arc${e === entry ? ' on' : ''}${e.remote && !e.bytes ? ' unfetched' : ''}" data-arc="${esc(e.name)}">`
      + `<span class="name">${esc(e.name)}</span><span class="place">${esc(placeOf(e.name))}</span></div>`;
    if (e === entry && e.arc) {
      for (const tag of e.arc.tags()) {
        const items = e.arc.list(tag);
        const open = h.tag === tag ? ' open' : '';
        html += `<details class="type"${open}><summary><span>${esc(tagLabel(tag))}</span><span class="n">${items.length}</span></summary><div class="ids">`;
        for (const r of items) html += `<a href="${link(e.name, tag, r.id)}"${h.tag === tag && h.id === r.id ? ' class="on"' : ''}>${r.id}</a>`;
        html += '</div></details>';
      }
    }
  }
  side.innerHTML = html;
  side.scrollTop = keep;
  // A new archive is scrolled to the top of the list, where its resources
  // start; on a phone the list is short and it would be out of sight.
  if (SIDE_ARCHIVE !== entry.name) {
    SIDE_ARCHIVE = entry.name;
    const on = side.querySelector('.arc.on');
    if (on) side.scrollTop = Math.max(0, on.offsetTop - side.offsetTop - 8);
  }
  for (const el of side.querySelectorAll('.arc')) el.addEventListener('click', () => { location.hash = '#' + el.dataset.arc; });
  const forget = side.querySelector('[data-forget]');
  if (forget) forget.addEventListener('click', () => memoryForget().then(() => { setStatus('Forgotten: the next visit starts with nothing open.'); renderSide(entry, h); }));
}

/* ---- palettes -------------------------------------------------------------- */

/* Indices 10-45: the Zoombinis' own colours, the same in every palette on
   the disc (tools/README.md), and what ZOOMBINI's own art keeps to. Taken
   from whichever open archive has a palette covering them. */
function sharedColours() {
  if (SHARED_COLOURS) return SHARED_COLOURS;
  for (const e of sortedArchives()) {
    const arc = e.bytes ? openedArchive(e) : null;
    if (!arc) continue;
    for (const tag of ['SHPL', 'tPAL']) for (const r of arc.list(tag)) {
      const p = parsePaletteResource(arc.get(tag, r.id), tag);
      if (p.start <= 10 && p.start + p.colours.length >= 46) {
        SHARED_COLOURS = { from: `${e.name} ${tag} ${r.id}`, colours: p.colours.slice(10 - p.start, 46 - p.start) };
        return SHARED_COLOURS;
      }
    }
  }
  return null;
}

function paletteChoices(arc) {
  const out = [];
  for (const tag of ['SHPL', 'tPAL']) for (const r of arc.list(tag)) {
    const parsed = parsePaletteResource(arc.get(tag, r.id), tag);
    out.push({ key: `${tag} ${r.id}`, tag, id: r.id, parsed, full: parsed.colours.length > 1 });
  }
  return out;
}

/* A bitmap's palette: the one picked for this archive, or else the full
   palette with the largest id at or below the bitmap's (a room's palette
   has its background's id, and the sprites drawn over it come after), or
   else the first. Over the shared colours, over Windows's. */
function paletteFor(entry, arc, bitmapId) {
  const choices = paletteChoices(arc);
  const full = choices.filter(c => c.full);
  let chosen = choices.find(c => c.key === PALETTE_PICK.get(entry.name)) || null;
  if (!chosen && full.length) {
    const below = full.filter(c => c.id <= bitmapId).sort((a, b) => b.id - a.id);
    chosen = below[0] || full.slice().sort((a, b) => a.id - b.id)[0];
  }
  const pal = zbPalette(null);
  const shared = sharedColours();
  if (shared) shared.colours.forEach((c, i) => { pal[10 + i] = [c[0], c[1], c[2]]; });
  if (chosen) chosen.parsed.colours.forEach((c, i) => { if (chosen.parsed.start + i < 256) pal[chosen.parsed.start + i] = [c[0], c[1], c[2]]; });
  return { pal, chosen, choices, shared };
}

function paletteControl(entry, pf) {
  if (!pf.choices.length) {
    return `<span class="note">This archive has no palette: ${pf.shared ? `the shared colours are from ${esc(pf.shared.from)}` : '<span class="warn">open another archive for its colours</span>'}.</span>`;
  }
  const opts = pf.choices.map(c => `<option value="${esc(c.key)}"${pf.chosen && c.key === pf.chosen.key ? ' selected' : ''}>${esc(c.key)}${c.full ? '' : ' (one colour)'}</option>`);
  return `<label>Palette <select id="palPick">${opts.join('')}</select></label>`;
}

function wirePaletteControl(entry) {
  const sel = $('palPick');
  if (sel) sel.addEventListener('change', () => { PALETTE_PICK.set(entry.name, sel.value); render(); });
}

/* ---- drawing ---------------------------------------------------------------- */

function indexedCanvas(frame, pal, transparent0) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, frame.width);
  c.height = Math.max(1, frame.height);
  c.className = 'px';
  if (!frame.width || !frame.height) return c;
  const g = c.getContext('2d');
  const im = g.createImageData(frame.width, frame.height);
  const d = im.data, px = frame.pixels;
  for (let i = 0; i < px.length; i++) {
    const v = px[i], rgb = pal[v];
    d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2];
    d[i * 4 + 3] = transparent0 && v === 0 ? 0 : 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

function zoomControl(key, def) {
  const z = ZOOM_PICK.get(key) || def;
  return { z, html: `<label>Zoom <select id="zoomPick">${[1, 2, 3, 4].map(n => `<option${n === z ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` };
}

function wireZoom(key) {
  const sel = $('zoomPick');
  if (sel) sel.addEventListener('change', () => { ZOOM_PICK.set(key, +sel.value); render(); });
}

/* An archive's room: the picture its place's page opens on (zb-journey.js),
   or else the first full-screen picture in it. */
function roomPicture(arc, name) {
  const p = ZB_PLACE_BY_KEY.get(name);
  if (p && !p.panorama && arc.has('tBMP', p.background)) return p.background;
  for (const r of arc.list('tBMP')) {
    const b = arc.get('tBMP', r.id);
    if (u16be(b, 0) === 640 && u16be(b, 2) === 480) return r.id;
  }
  return null;
}

/* ---- an archive ------------------------------------------------------------ */

function renderArchive(entry, arc, h) {
  const view = $('view');
  const place = placeOf(entry.name);
  const onMap = (ZB_PLACE_BY_KEY.has(entry.name) && journeyAvailable() ? ` · <a href="#place=${entry.name}">Map</a>` : '')
    + (entry.name === 'TOWN' ? ' · <a href="#town">All round</a>' : '');
  let html = `<h1>${esc(entry.name)}</h1><p class="sub">${esc(place)}${place ? ' · ' : ''}${fmtBytes(entry.size)}${onMap}</p>`;
  if (h.tag && !arc.has(h.tag, h.id)) html += `<p class="warn">${esc(entry.name)} has no ${esc(tagLabel(h.tag))}${h.id != null ? ' ' + h.id : ''}.</p>`;
  html += '<table class="plain"><tr><th>type</th><th>resources</th><th>bytes</th><th>what</th></tr>';
  const what = {
    tBMP: 'pictures and sprite sheets', SHPL: 'palettes', tPAL: 'palettes', REGS: 'registration points',
    SCRS: 'snoid scripts', SCRB: 'feature scripts', '\0SND': 'sounds', tMID: 'music', STRL: 'strings',
    CURS: 'cursors', NODE: 'walk waypoints', PATH: 'walk paths',
  };
  for (const tag of arc.tags()) {
    const items = arc.list(tag);
    const bytes = items.reduce((n, r) => n + r.size, 0);
    html += `<tr><td><a href="${link(entry.name, tag, items[0] && items[0].id)}">${esc(tagLabel(tag))}</a></td>`
      + `<td class="num">${items.length}</td><td class="num">${fmtBytes(bytes)}</td><td class="note">${what[tag] || ''}</td></tr>`;
  }
  html += '</table>';
  const room = roomPicture(arc, entry.name);
  if (room != null) html += `<p class="note">The room, <a href="${link(entry.name, 'tBMP', room)}">tBMP ${room}</a>:</p><div id="room" class="picture"></div>`;
  html += helpHtml(entry.name);
  view.innerHTML = html;
  if (room != null) {
    const pf = paletteFor(entry, arc, room);
    $('room').appendChild(indexedCanvas(decodeTbmp(arc.get('tBMP', room)), pf.pal, false));
  }
}

/* A place's help, the four levels, from ZOOMBINI's string lists. */
function helpHtml(name) {
  const a = ZB_ARCHIVES[name];
  if (!a || !a.help) return '';
  const z = ARCHIVES.get('ZOOMBINI');
  const arc = z && z.bytes ? openedArchive(z) : null;
  if (!arc) return `<p class="note">Its help text is in ZOOMBINI, STRL ${a.help}${a.help >= 1700 ? '–' + (a.help + 60) : ''}${z ? ', <a href="#ZOOMBINI">ZOOMBINI</a> to read it here' : ''}.</p>`;
  let html = '<h2 style="font-size:15px;margin:22px 0 6px">The help</h2><div class="strings">';
  for (let k = 0; k < 4; k++) {
    const id = a.help + k * 20;
    if (!arc.has('STRL', id)) continue;
    const s = parseStringList(arc.get('STRL', id));
    html += `<p><b><a href="${link('ZOOMBINI', 'STRL', id)}">${a.help >= 1700 ? 'level ' + (k + 1) : 'STRL ' + id}</a></b>${esc(s.join('\n'))}</p>`;
  }
  return html + '</div>';
}

/* ---- a resource -------------------------------------------------------------- */

function renderResource(entry, arc, tag, id) {
  const r = arc.find(tag, id);
  const head = `<h1>${esc(tagLabel(tag))} ${id}</h1><p class="sub">${esc(entry.name)} · ${plural(r.size, 'byte')}${r.name ? ' · “' + esc(r.name) + '”' : ''}${editedNote(entry, tag, id)}</p>`;
  const bytes = arc.get(tag, id);
  const view = $('view');
  view.innerHTML = head;
  const body = document.createElement('div');
  view.appendChild(body);
  if (tag === 'tBMP') showBitmap(entry, arc, id, bytes, body);
  if (tag === '\0SND') showSound(entry, arc, id, bytes, body);
  if (tag === 'tMID') showMidi(entry, id, bytes, body);
  if (tag === 'SHPL' || tag === 'tPAL') showPalette(tag, bytes, body);
  if (tag === 'STRL') showStrings(entry, id, bytes, body);
  if (tag === 'CURS') showCursor(entry, id, bytes, body);
  if (tag === 'NODE' || tag === 'PATH') showWalks(entry, arc, id, body);
  if (tag === 'REGS') showRegs(entry, arc, id, bytes, body);
  if (tag === 'SCRS' || tag === 'SCRB') showScript(entry, arc, tag, id, bytes, body);
  else if (!['tBMP', '\0SND', 'tMID', 'SHPL', 'tPAL', 'STRL', 'CURS', 'NODE', 'PATH', 'REGS'].includes(tag)) body.innerHTML = '<p class="note">No reader for this type.</p>';
  view.insertAdjacentHTML('beforeend', xrefHtml(entry, arc, tag, id));
}

/* The REGS pair that holds a sheet's registration points: ids n and n + 1,
   each one longer than the sheet has frames (ScummVM's offsets are
   one-based). */
function regsFor(arc, frameCount) {
  for (const r of arc.list('REGS')) {
    if (!arc.has('REGS', r.id + 1)) continue;
    const xs = parseRegs(arc.get('REGS', r.id)), ys = parseRegs(arc.get('REGS', r.id + 1));
    if (xs.length === frameCount + 1 && ys.length === frameCount + 1) return { id: r.id, xs, ys };
  }
  return null;
}

function showBitmap(entry, arc, id, bytes, body) {
  const d = decodeBitmapResource(bytes);
  const pf = paletteFor(entry, arc, id);
  const base = `${entry.name.toLowerCase()}-tbmp-${id}`;
  if (!d.sheet) {
    const f = d.frames[0];
    const zc = zoomControl('picture', f.width <= 200 ? 2 : 1);
    body.innerHTML = `<p class="sub">A picture, ${f.width} × ${f.height}.</p>`
      + `<div class="tools">${paletteControl(entry, pf)} ${zc.html} <button id="save">Save as PNG</button></div><div id="pic" class="picture"></div>`;
    const c = indexedCanvas(f, pf.pal, false);
    c.style.width = f.width * zc.z + 'px';
    $('pic').appendChild(c);
    $('save').addEventListener('click', async () => downloadBlob(await encodeIndexedPNG(f.width, f.height, f.pixels, pf.pal, null), base + '.png'));
    pictureTools(entry, arc, id, pf, $('save').parentNode);
    wirePaletteControl(entry); wireZoom('picture');
    return;
  }
  const regs = regsFor(arc, d.frames.length);
  const biggest = Math.max(...d.frames.map(f => Math.max(f.width, f.height)));
  const zc = zoomControl('sheet', biggest <= 64 ? 2 : 1);
  body.innerHTML = `<p class="sub">A sprite sheet of ${plural(d.frames.length, 'frame')}${regs ? `, registered by <a href="${link(entry.name, 'REGS', regs.id)}">REGS ${regs.id}</a> and ${regs.id + 1}` : ''}. Index 0 is transparent.</p>`
    + `<div class="tools">${paletteControl(entry, pf)} ${zc.html} <button id="save">Save as .zip</button></div>`
    + '<div id="focus"></div><div id="sheet" class="sheet"></div>';
  wirePaletteControl(entry); wireZoom('sheet');
  $('save').addEventListener('click', async () => {
    setStatus('Making the zip…');
    const files = [];
    for (let i = 0; i < d.frames.length; i++) {
      const f = d.frames[i];
      if (!f.width || !f.height) continue;
      files.push({ name: `${base}/frame-${String(i).padStart(4, '0')}.png`, bytes: await encodeIndexedPNG(f.width, f.height, f.pixels, pf.pal, 0) });
    }
    dlBlob(buildZip(files), base + '.zip');
    setStatus('');
  });
  const sheet = $('sheet');
  const seq = RENDER_SEQ;
  let i = 0;
  const batch = () => {
    if (seq !== RENDER_SEQ) return;
    const end = Math.min(d.frames.length, i + 80);
    for (; i < end; i++) {
      const f = d.frames[i], k = i;
      const cell = document.createElement('div');
      cell.className = 'frame';
      cell.title = `frame ${i}, ${f.width} × ${f.height}`;
      const c = indexedCanvas(f, pf.pal, true);
      c.style.width = f.width * zc.z + 'px';
      cell.appendChild(c);
      const label = document.createElement('span');
      label.textContent = i;
      cell.appendChild(label);
      cell.addEventListener('click', () => {
        for (const x of sheet.querySelectorAll('.frame.on')) x.classList.remove('on');
        cell.classList.add('on');
        showFrame(d.frames[k], k, pf.pal, regs);
        const tools = document.createElement('div');
        tools.className = 'tools';
        $('focus').appendChild(tools);
        frameTools(entry, arc, id, k, pf, d.frames[k], tools);
      });
      sheet.appendChild(cell);
    }
    if (i < d.frames.length) requestAnimationFrame(batch);
  };
  batch();
}

/* One frame of a sheet, larger, with its registration point: the frame is
   drawn at (anchor - reg), so the anchor sits at (reg.x, reg.y) in it. */
function showFrame(f, k, pal, regs) {
  const focus = $('focus');
  const zoom = Math.max(2, Math.min(8, Math.floor(320 / Math.max(f.width, f.height, 1))));
  const reg = regs ? { x: regs.xs[k + 1], y: regs.ys[k + 1] } : null;
  // Room around the frame for a registration point that lies outside it.
  const minX = Math.min(0, reg ? reg.x - 2 : 0), minY = Math.min(0, reg ? reg.y - 2 : 0);
  const maxX = Math.max(f.width, reg ? reg.x + 3 : 0), maxY = Math.max(f.height, reg ? reg.y + 3 : 0);
  const c = document.createElement('canvas');
  c.width = (maxX - minX) * zoom; c.height = (maxY - minY) * zoom;
  c.className = 'px';
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.strokeStyle = 'rgba(127,195,255,.35)';
  g.strokeRect(-minX * zoom + .5, -minY * zoom + .5, f.width * zoom - 1, f.height * zoom - 1);
  g.drawImage(indexedCanvas(f, pal, true), -minX * zoom, -minY * zoom, f.width * zoom, f.height * zoom);
  if (reg) {
    const x = (reg.x - minX + .5) * zoom, y = (reg.y - minY + .5) * zoom;
    g.strokeStyle = '#ff5c7a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
  }
  focus.innerHTML = `<p class="note">Frame ${k}: ${f.width} × ${f.height}${reg ? `, registration point (${reg.x}, ${reg.y}), marked` : ''}.</p>`;
  const wrap = document.createElement('div');
  wrap.className = 'picture';
  wrap.appendChild(c);
  focus.appendChild(wrap);
}

function scriptsCueing(arc, soundId) {
  const out = [];
  for (const tag of ['SCRS', 'SCRB']) for (const r of arc.list(tag)) {
    let s;
    try { s = parseScript(arc.get(tag, r.id), tag); } catch (e) { continue; }
    if (s.frames.some(f => f.sound === soundId)) out.push({ tag, id: r.id });
  }
  return out;
}

function showSound(entry, arc, id, bytes, body) {
  const w = parseMohawkWave(bytes);
  const wav = wavFromPcmBytes(w.samples, w.rate, w.bits, w.channels);
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const secs = w.sampleCount / w.rate;
  const loop = w.loopCount ? `It loops${w.loopCount === 0xffff ? '' : ' ' + w.loopCount + ' times'}, from ${(w.loopStart / w.rate).toFixed(2)} s to ${(w.loopEnd / w.rate).toFixed(2)} s.` : '';
  const cues = scriptsCueing(arc, id);
  body.innerHTML = `<p class="sub">${secs.toFixed(2)} s, ${w.rate.toLocaleString()} Hz, ${w.bits}-bit, ${w.channels === 1 ? 'mono' : w.channels + ' channels'}${w.encoding ? ', encoding ' + w.encoding : ''}. ${loop}</p>`
    + `<div class="tools"><audio controls src="${url}"${w.loopCount ? ' loop' : ''}></audio><button id="save">Save as WAV</button></div>`
    + (cues.length ? `<p class="note">Cued by ${cues.map(c => `<a href="${link(entry.name, c.tag, c.id)}">${c.tag} ${c.id}</a>`).join(', ')}.</p>` : '');
  $('save').addEventListener('click', () => downloadBlob(wav, `${entry.name.toLowerCase()}-snd-${id}.wav`));
  soundTools(entry, arc, id, $('save').parentNode);
}

function showMidi(entry, id, bytes, body) {
  const m = parseMohawkMidi(bytes);
  body.innerHTML = `<p class="sub">A standard MIDI file of format ${m.header.format}, ${plural(m.header.tracks, 'track')}, ${m.header.division} ticks a beat. Its chunks: ${m.chunks.map(esc).join(', ')}.</p>`
    + `<div class="tools"><button id="save">Save as .mid</button></div>`
    + (m.programs ? `<p class="note">Its Prg# chunk, which a MIDI file does not carry: <code>${[...m.programs].map(b => b.toString(16).padStart(2, '0')).join(' ')}</code></p>` : '')
    + `<p class="note">${entry.name === 'MIDIMAC' ? 'Authored for the Mac and QuickTime' : 'Authored for Windows'}, as ScummVM's branch describes the two music archives.</p>`;
  $('save').addEventListener('click', () => downloadBlob(m.file, `${entry.name.toLowerCase()}-tmid-${id}.mid`));
}

function showPalette(tag, bytes, body) {
  const p = parsePaletteResource(bytes, tag);
  let cells = '';
  for (let i = 0; i < 256; i++) {
    const c = i >= p.start && i < p.start + p.colours.length ? p.colours[i - p.start] : null;
    cells += c ? `<div style="background:rgb(${c[0]},${c[1]},${c[2]})" title="${i}: ${c[0]}, ${c[1]}, ${c[2]}${c[3] !== 1 ? ' (flag ' + c[3] + ')' : ''}"></div>` : `<div class="off" title="${i}: not in this palette"></div>`;
  }
  body.innerHTML = `<p class="sub">${plural(p.colours.length, 'colour')} from index ${p.start}${p.id != null ? `; its own id ${p.id}, flags ${p.flags}` : ''}.</p><div class="swatches">${cells}</div>`;
}

function showStrings(entry, id, bytes, body) {
  const s = parseStringList(bytes);
  let what = '';
  if (entry.name === 'ZOOMBINI') {
    const base = id - (id % 100), place = Object.keys(ZB_ARCHIVES).find(k => ZB_ARCHIVES[k].help === base);
    if (place && id % 20 === 0) what = `The help for <a href="#${place}">${esc(ZB_ARCHIVES[place].place)}</a>${base >= 1700 ? ', level ' + (id % 100 / 20 + 1) : ''}.`;
    else if (id === 2900) what = 'The credits.';
  }
  body.innerHTML = `<p class="sub">${plural(s.length, 'string')}. ${what}</p><div class="tools"><button id="strEdit">Edit</button></div><div class="strings">${s.map((t, i) => `<p><b>${i}</b>${esc(t)}</p>`).join('')}</div>`;
  $('strEdit').addEventListener('click', () => editStrings(entry, id, s, body));
}

function showCursor(entry, id, bytes, body) {
  const c = parseCursor(bytes);
  const z = 12;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16 * z;
  cv.className = 'px';
  const g = cv.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const im = c.image[y * 16 + x], m = c.mask[y * 16 + x];
    if (im) g.fillStyle = '#000';
    else if (m) g.fillStyle = '#fff';
    else continue;
    g.fillRect(x * z, y * z, z, z);
  }
  g.strokeStyle = '#ff5c7a'; g.lineWidth = 2;
  g.strokeRect(c.hotX * z + 1, c.hotY * z + 1, z - 2, z - 2);
  body.innerHTML = `<p class="sub">16 × 16, the hot spot at (${c.hotX}, ${c.hotY}), outlined. Black is the image, white the mask around it.</p><div id="cur" class="picture"></div>`;
  $('cur').appendChild(cv);
}

const WALK_COLOURS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff', '#f78c6b', '#90be6d', '#f15bb5'];

function showWalks(entry, arc, id, body) {
  const nodes = arc.has('NODE', id) ? parseWalkNodes(arc.get('NODE', id)) : [];
  const paths = arc.has('PATH', id) ? parseWalkPaths(arc.get('PATH', id), nodes.length) : [];
  const room = roomPicture(arc, entry.name);
  body.innerHTML = `<p class="sub"><a href="${link(entry.name, 'NODE', id)}">NODE ${id}</a>: ${plural(nodes.length, 'waypoint')}. `
    + `<a href="${link(entry.name, 'PATH', id)}">PATH ${id}</a>: ${plural(paths.length, 'path')}, each up to 24 waypoints. Drawn over the room${room != null ? `, <a href="${link(entry.name, 'tBMP', room)}">tBMP ${room}</a>` : ''}.</p>`
    + '<div id="walker"></div><div id="walk" class="picture"></div>'
    + '<table class="plain" style="margin-top:14px"><tr><th>path</th><th>waypoints, in order</th></tr>'
    + paths.map((p, i) => `<tr><td style="color:${WALK_COLOURS[i % WALK_COLOURS.length]}">${i}</td><td class="mono">${p.filter(w => w).join(' → ') || '(empty)'}</td></tr>`).join('')
    + '</table><table class="plain"><tr><th>waypoint</th><th>x</th><th>y</th></tr>'
    + nodes.map((n, i) => `<tr><td>${i + 1}</td><td class="num">${n.x}</td><td class="num">${n.y}</td></tr>`).join('') + '</table>';
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480; c.className = 'px';
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 640, 480);
  if (room != null) {
    const pf = paletteFor(entry, arc, room);
    g.globalAlpha = .5;
    g.drawImage(indexedCanvas(decodeTbmp(arc.get('tBMP', room)), pf.pal, false), 0, 0);
    g.globalAlpha = 1;
  }
  g.lineWidth = 3; g.lineJoin = 'round';
  paths.forEach((p, i) => {
    const pts = p.filter(w => w).map(w => nodes[w - 1]);
    g.strokeStyle = WALK_COLOURS[i % WALK_COLOURS.length];
    g.beginPath();
    pts.forEach((n, k) => (k ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y)));
    g.stroke();
  });
  g.font = '600 11px -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  nodes.forEach((n, i) => {
    g.fillStyle = '#0e131c'; g.beginPath(); g.arc(n.x, n.y, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.fillText(i + 1, n.x, n.y + .5);
  });
  $('walk').appendChild(c);
  walker(entry, arc, id, nodes, paths, c, $('walker'));
}

/* A Zoombini walked over the waypoints, as the program walks one
   (zbWalk): along a path picked, or to where the room is clicked. */
const WALK_PICK = { z: { hair: 1, eyes: 1, nose: 1, feet: 1 }, path: 0 };
function walker(entry, arc, id, nodes, paths, c, box) {
  const home = ARCHIVES.get('ZOOMBINI'), zarc = home && home.bytes ? openedArchive(home) : null;
  if (!zarc) {
    box.innerHTML = '<p class="note">A Zoombini can walk these, drawn from zoombini.mhk: '
      + (!home ? 'it is not among the files opened.</p>' : FETCHING.has('ZOOMBINI') ? 'fetching it…</p>' : '<a id="walkFetch">fetch</a> (24 MB).</p>');
    if ($('walkFetch')) $('walkFetch').addEventListener('click', () => { ensureBytes(home).then(() => { if (box.isConnected) render(); }); walker(entry, arc, id, nodes, paths, c, box); });
    return;
  }
  const sheet = zbSnoidSheet(zarc), z = WALK_PICK.z, pal = paletteFor(entry, arc, roomPicture(arc, entry.name) ?? 1 << 30).pal;
  const scripts = {}, lengths = {};
  for (let f = 1; f <= 5; f++) for (let d = 0; d < 5; d++) {
    const n = 100 + 5 * f + d;
    scripts[n] = parseScript(zarc.get('SCRS', n), 'SCRS');
    lengths[n] = scripts[n].frames.length;
  }
  const routes = paths.map((p, i) => ({ i, pts: p.filter(w => w).map(w => nodes[w - 1]) })).filter(r => r.pts.length > 1);
  const cap = t => t[0].toUpperCase() + t.slice(1);
  box.innerHTML = '<div class="tools">' + ['hair', 'eyes', 'nose', 'feet'].map(k => `<label>${cap(k)} <select data-wtrait="${k}">${ZB_TRAIT_SHORT[k].map((n, i) => `<option value="${i + 1}"${i + 1 === z[k] ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`).join('')
    + (routes.length ? ` <label>Walk path <select id="walkPath">${routes.map(r => `<option value="${r.i}"${r.i === WALK_PICK.path ? ' selected' : ''}>${r.i}</option>`).join('')}</select></label> <button id="walkGo">Walk</button>` : '')
    + '</div><p class="note">Or click the room for the Zoombini to walk there.</p>';
  const back = document.createElement('canvas');
  back.width = c.width; back.height = c.height;
  back.getContext('2d').drawImage(c, 0, 0);
  const g = c.getContext('2d');
  let steps = [], at = 0, pos = routes.length ? { ...routes[0].pts[0] } : { x: 320, y: 360 }, facing = 0, tick = 0;
  const sprite = new Map();
  const draw = st => {
    g.drawImage(back, 0, 0);
    const placed = zbWalkPlacements(sheet, z, scripts, st);
    const key = placed.map(p => p.frame + ':' + (p.x - st.x) + ':' + (p.y - st.y)).join();
    if (!sprite.has(key)) { const im = zbSnoidCompose(sheet, placed); sprite.set(key, { c: indexedCanvas(im, pal, true), ox: im.ox, oy: im.oy }); }
    const sp = sprite.get(key);
    g.drawImage(sp.c, -sp.ox, -sp.oy);
  };
  const walkTo = pts => {
    steps = zbWalk([pos, ...pts], z.feet, lengths, tick, facing);
    at = 0;
  };
  const rest = () => draw({ x: pos.x, y: pos.y, script: 100 + 5 * z.feet + 0, tick: 0, facing });
  rest();
  const timer = setInterval(() => {
    if (!c.isConnected) return clearInterval(timer);
    if (at >= steps.length) return;
    const st = steps[at++];
    draw(st);
    pos = { x: st.x, y: st.y }; facing = st.facing; tick = st.tick + 1;
  }, SNOID_TICK_MS);
  c.style.cursor = 'crosshair';
  c.addEventListener('click', e => {
    const r = c.getBoundingClientRect();
    walkTo([{ x: Math.round((e.clientX - r.left) * c.width / r.width), y: Math.round((e.clientY - r.top) * c.height / r.height) }]);
  });
  if ($('walkGo')) $('walkGo').addEventListener('click', () => {
    const r = routes.find(q => q.i === +$('walkPath').value);
    WALK_PICK.path = r.i;
    pos = { ...r.pts[0] }; tick = 0;
    walkTo(r.pts.slice(1));
  });
  for (const sel of box.querySelectorAll('select[data-wtrait]')) sel.addEventListener('change', () => { z[sel.dataset.wtrait] = +sel.value; sprite.clear(); if (at >= steps.length) rest(); });
}

function showRegs(entry, arc, id, bytes, body) {
  const v = parseRegs(bytes);
  const partner = arc.has('REGS', id + 1) && parseRegs(arc.get('REGS', id + 1)).length === v.length ? id + 1
    : arc.has('REGS', id - 1) && parseRegs(arc.get('REGS', id - 1)).length === v.length ? id - 1 : null;
  const xs = partner == null ? null : (partner > id ? v : parseRegs(arc.get('REGS', partner)));
  const ys = partner == null ? null : (partner > id ? parseRegs(arc.get('REGS', partner)) : v);
  let html = `<p class="sub">${plural(v.length, 'number')}.`;
  if (xs) {
    const x = Math.min(id, partner);
    html += ` With <a href="${link(entry.name, 'REGS', partner)}">REGS ${partner}</a>, the registration points of a sheet of ${xs.length - 1} frames: REGS ${x} the x, ${x + 1} the y, one-based (entry 0 holds ${xs[0]}, ${ys[0]}).</p>`;
    html += '<div class="regs">' + [...xs].slice(1).map((vx, i) => `${i}: ${vx}, ${ys[i + 1]}`).join('<br>') + '</div>';
  } else {
    html += '</p><div class="regs">' + [...v].map((n, i) => `${i}: ${n}`).join('<br>') + '</div>';
  }
  body.innerHTML = html;
}

function showScript(entry, arc, tag, id, bytes, body) {
  const s = parseScript(bytes, tag);
  const order = tag === 'SCRS' ? ZB_LAYER_ORDERS[s.layout] : null;
  const soundLink = snd => {
    if (snd == null || snd <= 0) return '';
    if (arc.has('\0SND', snd)) return `<a href="${link(entry.name, '\0SND', snd)}">SND ${snd}</a>`;
    const z = ARCHIVES.get('ZOOMBINI');
    if (z && z.arc && z.arc.has('\0SND', snd)) return `<a href="${link('ZOOMBINI', '\0SND', snd)}">ZOOMBINI SND ${snd}</a>`;
    return `SND ${snd}`;
  };
  let sub = `${plural(s.frameCount, 'frame')}, one a tick.`;
  if (tag === 'SCRS') sub += s.layout === -1 ? ' A table of positions, not an animation (header 0xffff).'
    : ` The five layers in the order they are drawn (header ${s.layout}): ${order.join(', ')}.`;
  let html = `<p class="sub">${sub}</p>${tag === 'SCRS' && ZB_SNOID_KIND_OF_LAYOUT[s.layout] ? '<div id="snoid"></div>' : ''}`
    + '<table class="plain frames"><tr><th>frame</th><th>records: shape (x, y)</th><th>event</th><th>sound</th></tr>';
  s.frames.forEach((f, i) => {
    const recs = f.records.map((r, k) => {
      const layer = order && f.records.length === 5 ? `<span class="note">${order[k]}</span> ` : '';
      return `${layer}${r.shape} (${r.x}, ${r.y})`;
    }).join('<br>');
    html += `<tr><td>${i}</td><td class="rec">${recs || '<span class="note">nothing drawn</span>'}</td><td>${f.event ? '0x' + f.end.toString(16) : ''}</td><td>${soundLink(f.sound)}</td></tr>`;
  });
  body.innerHTML = html + '</table>';
  if ($('snoid')) snoidPlayer(entry, arc, id, s, $('snoid'));
}

/* ---- a snoid script played ------------------------------------------------- */

/* What the player was last set to: a Zoombini's traits and a Fleen's, the
   snoid turned round to start with, drawn over its room, with its sounds. */
const SNOID_PICK = { zoombini: { hair: 1, eyes: 1, nose: 1, feet: 1 }, fleen: { hair: 1, eyes: 1, nose: 1, feet: 1 },
  turned: false, room: true, sound: false, zoom: 2 };
const SNOID_TICK_MS = 100;       // the Zoombini maker's tick, which looked right; the program's is not read
const SNOID_SOUNDS = new Map();  // 'ZOOMBINI 125' -> an object URL

/* A snoid script, played: the snoid its layout word names, put together by
   zb-snoid.js tick by tick, with the traits picked. */
function snoidPlayer(entry, arc, id, script, box) {
  const kind = ZB_SNOID_KIND_OF_LAYOUT[script.layout], K = ZB_SNOID_KINDS[kind];
  const home = K.archive === entry.name ? entry : ARCHIVES.get(K.archive);
  const sheetArc = home ? openedArchive(home) : null;
  if (!sheetArc) {
    box.innerHTML = `<p class="note">Drawn with ${esc(K.name)} from ${K.archive.toLowerCase()}.mhk: `
      + (!home ? 'it is not among the files opened.</p>'
        : FETCHING.has(K.archive) ? 'fetching it…</p>'
        : `<a id="snoidFetch">fetch</a>${K.archive === 'ZOOMBINI' ? ' (24 MB)' : ''}.</p>`);
    if ($('snoidFetch')) $('snoidFetch').addEventListener('click', () => {
      ensureBytes(home).then(() => { if (box.isConnected) snoidPlayer(entry, arc, id, script, box); });
      snoidPlayer(entry, arc, id, script, box);
    });
    return;
  }
  const sheet = zbSnoidSheet(sheetArc, kind);
  const traits = SNOID_PICK[kind === 'fleen' ? 'fleen' : 'zoombini'];
  const names = kind === 'fleen' ? ZB_FLEENS_TRAIT_WITH : ZB_TRAIT_SHORT;
  const own = zbSnoidFeetOf(entry.name, id), feetFor = own ? [own] : zbSnoidFeetFor(sheet, zbSnoidTicks(script));
  // A walk is written for its own feet: pick them, unless the pick fits.
  if (!feetFor.includes(traits.feet) && feetFor.length) traits.feet = feetFor[0];
  const ticks = zbSnoidTicks(script, SNOID_PICK.turned ? 1 : 0, entry.name);
  const movie = zbSnoidMovie(sheet, traits, ticks);
  const room = roomPicture(arc, entry.name);
  // The script's coordinates are the room's when they fall inside it.
  const inRoom = room != null && movie.width && -movie.ox >= -40 && -movie.oy >= -40 && movie.width - movie.ox <= 680 && movie.height - movie.oy <= 520;
  const onRoom = inRoom && SNOID_PICK.room;
  const pal = paletteFor(entry, arc, onRoom ? room : 1 << 30).pal;
  if (kind !== 'fleen' && !onRoom) { const sc = sharedColours(); if (sc) sc.colours.forEach((c, i) => { pal[10 + i] = [c[0], c[1], c[2]]; }); }
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const pick = k => `<label>${cap(k)} <select data-trait="${k}">${names[k].map((n, i) => {
    const off = k === 'feet' && !feetFor.includes(i + 1);
    return `<option value="${i + 1}"${i + 1 === traits[k] ? ' selected' : ''}${off ? ' disabled' : ''}>${esc(cap(n))}</option>`;
  }).join('')}</select></label>`;
  const zoom = SNOID_PICK.zoom;
  box.innerHTML = `<p class="note">${cap(K.name)}, tBMP ${K.sheet} in ${K.archive}, ${plural(ticks.length, 'tick')} at ${1000 / SNOID_TICK_MS} a second.`
    + (own ? ` Its feet are written for ${names.feet[own - 1].toLowerCase()}.`
      : feetFor.length < 5 ? ` Its feet’s poses fit ${zbWordsOr(feetFor.map(v => names.feet[v - 1].toLowerCase()))} only.` : '')
    + (movie.missing.length ? ` <span class="warn">${plural(movie.missing.length, 'part')} past ${movie.missing.length === 1 ? 'its' : 'their'} block, left out.</span>` : '') + '</p>'
    + `<div class="tools">${['hair', 'eyes', 'nose', 'feet'].map(pick).join('')}</div>`
    + `<div class="tools"><button id="snoidPlay">Pause</button><button id="snoidStep">Step</button>`
    + `<input id="snoidAt" type="range" min="0" max="${ticks.length - 1}" value="0"><span id="snoidTick" class="note"></span>`
    + `<label><input type="checkbox" id="snoidTurned"${SNOID_PICK.turned ? ' checked' : ''}> Turned round</label>`
    + (inRoom ? `<label><input type="checkbox" id="snoidRoom"${SNOID_PICK.room ? ' checked' : ''}> Over its room</label>` : '')
    + (kind !== 'fleen' ? `<label><input type="checkbox" id="snoidSound"${SNOID_PICK.sound ? ' checked' : ''}> Sound</label>` : '')
    + `<label>Zoom <select id="snoidZoom">${[1, 2, 3, 4].map(n => `<option${n === zoom ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`
    + '<div class="picture snoid"></div>';
  if (!movie.width) { box.querySelector('.snoid').outerHTML = '<p class="note">No tick draws anything.</p>'; return; }

  // The canvas: the room behind, cropped to where the snoid goes, or clear.
  const pad = onRoom ? 24 : 0;
  const x0 = onRoom ? Math.max(0, -movie.ox - pad) : -movie.ox, y0 = onRoom ? Math.max(0, -movie.oy - pad) : -movie.oy;
  const x1 = onRoom ? Math.min(640, movie.width - movie.ox + pad) : movie.width - movie.ox, y1 = onRoom ? Math.min(480, movie.height - movie.oy + pad) : movie.height - movie.oy;
  const c = document.createElement('canvas');
  c.width = (x1 - x0) * zoom; c.height = (y1 - y0) * zoom; c.className = 'px';
  box.querySelector('.snoid').appendChild(c);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  let back = null;
  if (onRoom) {
    const d = decodeBitmapResource(arc.get('tBMP', room));
    back = indexedCanvas(d.frames[0], pal, false);
  }
  const frames = movie.frames.map(px => indexedCanvas({ width: movie.width, height: movie.height, pixels: px }, pal, true));
  let at = 0, playing = true;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    if (back) g.drawImage(back, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    g.drawImage(frames[at], (-movie.ox - x0) * zoom, (-movie.oy - y0) * zoom, movie.width * zoom, movie.height * zoom);
    $('snoidAt').value = at;
    const t = ticks[at];
    $('snoidTick').textContent = `tick ${at}${t.facing ? ', turned' : ''}${t.layout !== script.layout ? `, order ${t.layout}` : ''}`;
  };
  const sound = () => {
    if (!SNOID_PICK.sound) return;
    const t = ticks[at], want = [];
    if (t.sound > 0) want.push(arc.has('\0SND', t.sound) ? { archive: entry.name, id: t.sound } : { archive: 'ZOOMBINI', id: t.sound });
    const v = zbSnoidSound(t.event, traits);
    if (v) want.push({ archive: v.archive || entry.name, id: v.id });
    for (const w of want) snoidPlaySound(w.archive, w.id);
  };
  const step = () => { at = (at + 1) % ticks.length; draw(); sound(); };
  draw(); sound();
  const timer = setInterval(() => { if (!c.isConnected) return clearInterval(timer); if (playing) step(); }, SNOID_TICK_MS);
  $('snoidPlay').addEventListener('click', () => { playing = !playing; $('snoidPlay').textContent = playing ? 'Pause' : 'Play'; });
  $('snoidStep').addEventListener('click', () => { playing = false; $('snoidPlay').textContent = 'Play'; step(); });
  $('snoidAt').addEventListener('input', () => { playing = false; $('snoidPlay').textContent = 'Play'; at = +$('snoidAt').value; draw(); });
  const again = () => { clearInterval(timer); snoidPlayer(entry, arc, id, script, box); };
  for (const sel of box.querySelectorAll('select[data-trait]')) sel.addEventListener('change', () => { traits[sel.dataset.trait] = +sel.value; again(); });
  $('snoidTurned').addEventListener('change', e => { SNOID_PICK.turned = e.target.checked; again(); });
  if ($('snoidRoom')) $('snoidRoom').addEventListener('change', e => { SNOID_PICK.room = e.target.checked; again(); });
  if ($('snoidSound')) $('snoidSound').addEventListener('change', e => {
    SNOID_PICK.sound = e.target.checked;
    if (SNOID_PICK.sound && !ARCHIVES.get('ZOOMBINI')?.bytes && ARCHIVES.get('ZOOMBINI')?.remote) ensureBytes(ARCHIVES.get('ZOOMBINI'));
  });
  $('snoidZoom').addEventListener('change', e => { SNOID_PICK.zoom = +e.target.value; again(); });
}

/* A sound from an open archive, played once; nothing if it is not open. */
function snoidPlaySound(name, id) {
  const key = `${name} ${id}`;
  if (!SNOID_SOUNDS.has(key)) {
    const e = ARCHIVES.get(name), a = e && e.bytes ? openedArchive(e) : null;
    if (!a || !a.has('\0SND', id)) return;
    const w = parseMohawkWave(a.get('\0SND', id));
    SNOID_SOUNDS.set(key, URL.createObjectURL(new Blob([wavFromPcmBytes(w.samples, w.rate, w.bits, w.channels)], { type: 'audio/wav' })));
  }
  new Audio(SNOID_SOUNDS.get(key)).play().catch(() => {});
}

wireOpening();
