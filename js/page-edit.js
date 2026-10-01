/* page-edit.js -- edits, made as grimoire makes them: kept in memory only,
   so reloading the page restores the files; each one rebuilds its archive
   (zb-write.js, as tools/mohawk_write.py writes it) and everything is read
   back out of the rebuilt archive, so what the page shows after an edit is
   what the file now says; and Changes, under Data, is the one place an edit
   leaves the page, an archive saved as a new .MHK.
   =========================================================================
   The page's own script: DOM here. LOAD ORDER: after page-tabs.js. */

/* Archive name -> { original bytes, changes: Map 'TAG/id' -> { tag, id,
   bytes, what } }. */
const EDITS = new Map();

function editKey(tag, id) { return `${mohawkTagLabel(tag)}/${id}`; }
function isEdited(name, tag, id) { const e = EDITS.get(name); return !!e && e.changes.has(editKey(tag, id)); }

/* Put a resource's new bytes into its archive, rebuild it and read it back. */
function editApply(entry, tag, id, bytes, what) {
  if (!EDITS.has(entry.name)) EDITS.set(entry.name, { original: entry.bytes, changes: new Map() });
  EDITS.get(entry.name).changes.set(editKey(tag, id), { tag, id, bytes, what });
  editRebuild(entry);
}
function editUndo(entry, tag, id) {
  const e = EDITS.get(entry.name);
  if (!e) return;
  if (tag) e.changes.delete(editKey(tag, id)); else e.changes.clear();
  editRebuild(entry);
}
function editRebuild(entry) {
  const e = EDITS.get(entry.name);
  entry.bytes = e.changes.size ? zbWriteArchive(e.original, [...e.changes.values()]) : e.original;
  if (!e.changes.size) EDITS.delete(entry.name);
  entry.size = entry.bytes.length;
  entry.arc = null; entry.error = null;
  openedArchive(entry);
  if (entry.error) throw new Error(`the rebuilt archive does not read back: ${entry.error}`);
  // What was worked out from the old bytes is worked out again.
  SEARCH_SIG = ''; XREF_SIG = ''; SHARED_COLOURS = null;
  for (const k of [...GALLERY_SHEET.keys()]) if (k.startsWith(entry.name + ' ')) GALLERY_SHEET.delete(k);
}

/* A resource view's line saying it is edited, with its undo. */
function editedNote(entry, tag, id) {
  if (!isEdited(entry.name, tag, id)) return '';
  return ` · <span class="warn">edited</span> (<a data-undo="${esc(entry.name)}|${esc(tag)}|${id}">undo</a>, <a href="#changes">save</a>)`;
}
document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-undo]');
  if (!a) return;
  ev.preventDefault();
  const [name, tag, id] = a.dataset.undo.split('|');
  editUndo(ARCHIVES.get(name), tag || null, id ? +id : null);
  route();
});

/* ---- Changes ----------------------------------------------------------------- */

function isChangesHash() { return location.hash === '#changes'; }
function renderChanges() {
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><span>Changes</span>';
  renderSide({ name: '#changes' }, { archive: null, tag: null, id: null });
  const view = $('view');
  let html = '<h1>Changes</h1><p class="sub">What has been edited, kept in this page only: reloading it restores the files. Each changed archive saves as a new .MHK, its edited resources appended and repointed, every other byte as it was.</p>';
  if (!EDITS.size && !EXE_EDIT) html += '<p class="note">Nothing is edited. A string list, a picture, a frame or a sound can be, from its view in Data, and Mods puts a mod in.</p>';
  for (const [name, e] of EDITS) {
    html += `<h2 class="h">${esc(name)}</h2><ul>` + [...e.changes.values()].map(c => `<li><a href="#${name}/${mohawkTagLabel(c.tag)}/${c.id}">${mohawkTagLabel(c.tag)} ${c.id}</a> <span class="note">${esc(c.what)}</span> <a data-undo="${esc(name)}|${esc(c.tag)}|${c.id}">undo</a></li>`).join('') + '</ul>'
      + `<div class="tools"><button data-save="${esc(name)}">Save ${esc(name)}.MHK</button> <a data-undo="${esc(name)}||">undo all</a></div>`;
  }
  if (EXE_EDIT) html += `<h2 class="h">${esc(EXE_EDIT.name)}</h2><p><span class="note">${esc(EXE_EDIT.what)}</span> <a data-exe-undo>undo</a></p><div class="tools"><button id="saveExe">Save ${esc(EXE_EDIT.name)}</button></div>`;
  view.innerHTML = html;
  if (EXE_EDIT) {
    $('saveExe').addEventListener('click', () => downloadBlob(EXE_EDIT.bytes, EXE_EDIT.name));
    view.querySelector('[data-exe-undo]').addEventListener('click', () => { EXE_EDIT = null; route(); });
  }
  for (const b of view.querySelectorAll('[data-save]')) b.addEventListener('click', () => downloadBlob(ARCHIVES.get(b.dataset.save).bytes, b.dataset.save + '.MHK'));
}

/* ---- editing a string list --------------------------------------------------- */

function editStrings(entry, id, lines, body) {
  body.innerHTML = '<p class="sub">Each string as the game shows it. The count stays as it is; the characters are Windows-1252.</p>'
    + lines.map((t, i) => `<div class="field"><span class="label">${i}</span><textarea data-line="${i}" rows="${Math.min(12, 1 + Math.ceil(t.length / 70) + (t.match(/\n/g) || []).length)}">${esc(t)}</textarea></div>`).join('')
    + '<div class="tools"><button id="strApply">Apply</button> <button id="strCancel">Cancel</button> <span id="strErr" class="bad"></span></div>';
  $('strCancel').addEventListener('click', () => route());
  $('strApply').addEventListener('click', () => {
    const now = [...body.querySelectorAll('textarea')].map(t => t.value);
    let bytes;
    try { bytes = zbStringListBytes(now); } catch (e) { $('strErr').textContent = e.message; return; }
    const changed = now.filter((t, i) => t !== lines[i]).length;
    if (!changed) return route();
    editApply(entry, 'STRL', id, bytes, plural(changed, 'string') + ' rewritten');
    route();
  });
}

/* ---- replacing a picture, a frame, a sound ------------------------------------ */

/* The colours a replacement may use: ZOOMBINI's art only the shared range,
   10-45, which is the same in every scene's palette; anything else, those
   and whatever its palette gives, bar Windows's own at 0-9 and 246-255. */
function editAllowed(entry, pf) {
  const set = new Set(Array.from({ length: 36 }, (_, i) => 10 + i));
  if (entry.name !== 'ZOOMBINI' && pf.chosen) {
    const p = pf.chosen.parsed;
    for (let i = p.start; i < p.start + p.colours.length; i++) if (i >= 10 && i <= 245) set.add(i);
  }
  return [...set];
}
async function editReadImage(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
/* Any sound the browser can play, as the game's: mono, 11,025 Hz, unsigned 8-bit. */
async function editReadSound(file) {
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  const buf = await ac.decodeAudioData(await file.arrayBuffer());
  ac.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 11025)), 11025);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const f = (await off.startRendering()).getChannelData(0), out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(f[i] * 127) + 128));
  return out;
}
/* A button that asks for a file and hands it on, its failures said beside it. */
function editFileButton(box, label, accept, use) {
  const l = document.createElement('label');
  l.className = 'btn';
  l.innerHTML = `${esc(label)}<input type="file" accept="${accept}" hidden>`;
  const err = document.createElement('span');
  err.className = 'bad';
  l.querySelector('input').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    err.textContent = '';
    try { await use(f); route(); } catch (x) { err.textContent = x.message; console.error(x); }
  });
  box.append(' ', l, ' ', err);
}

function pictureTools(entry, arc, id, pf, box) {
  editFileButton(box, 'Replace from a PNG…', 'image/*', async file => {
    const im = await editReadImage(file), old = decodeTbmp(arc.get('tBMP', id));
    const px = zbQuantize(im.data, pf.pal, editAllowed(entry, pf), false);
    editApply(entry, 'tBMP', id, zbPictureBytes(im.width, im.height, px),
      `the picture replaced from ${file.name}${im.width !== old.width || im.height !== old.height ? `, ${im.width} × ${im.height} where it was ${old.width} × ${old.height}` : ''}`);
  });
}

function frameTools(entry, arc, id, k, pf, frame, box) {
  const save = document.createElement('button');
  save.textContent = 'Save this frame as PNG';
  save.addEventListener('click', async () => downloadBlob(await encodeIndexedPNG(frame.width, frame.height, frame.pixels, pf.pal, 0), `${entry.name.toLowerCase()}-tbmp-${id}-frame-${k}.png`));
  box.append(save);
  editFileButton(box, 'Replace this frame from a PNG…', 'image/*', async file => {
    const im = await editReadImage(file);
    const frames = zbSheetFrames(arc.get('tBMP', id)).slice();
    frames[k] = zbRawFrame(im.width, im.height, zbQuantize(im.data, pf.pal, editAllowed(entry, pf), true));
    const was = (EDITS.get(entry.name) || { changes: new Map() }).changes.get(editKey('tBMP', id));
    const done = new Set([...(was && was.frames || []), k]);
    editApply(entry, 'tBMP', id, zbSheetBytes(arc.get('tBMP', id), frames),
      `${done.size === 1 ? 'frame' : 'frames'} ${[...done].sort((a, b) => a - b).join(', ')} replaced`);
    EDITS.get(entry.name).changes.get(editKey('tBMP', id)).frames = done;
  });
}

function soundTools(entry, arc, id, box) {
  editFileButton(box, 'Replace from a sound file…', 'audio/*', async file => {
    const samples = await editReadSound(file);
    editApply(entry, '\0SND', id, zbWaveBytes(arc.get('\0SND', id), samples), `replaced from ${file.name}, ${(samples.length / 11025).toFixed(2)} s`);
  });
}

/* ---- Mods ---------------------------------------------------------------------- */

/* The Fleen-parts mod (zb-mod-fleen.js, the extraction project's
   mod_fleen_parts.py), run on the archives open, its resources put in as
   edits; ZOOMBINI.EXE, given, has its big figure's anchors rewritten and is
   saved from Changes beside the archives. */
let MOD_EXE = null;           // { name, bytes }: the EXE given
let EXE_EDIT = null;          // { name, bytes, what }: the EXE as the mod rewrote it
const MOD_FLEEN = { green: false };

function isModsHash() { return location.hash === '#mods'; }
function renderMods() {
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><span>Mods</span>';
  renderSide({ name: '#mods' }, { archive: null, tag: null, id: null });
  const need = sortedArchives().filter(e => !/^MIDI/.test(e.name));
  const missing = need.filter(e => !e.bytes);
  const view = $('view');
  let html = '<h1>Mods</h1><h2 class="h">Fleen parts on the Zoombinis</h2>'
    + '<p>Every Zoombini’s hair, eyes, nose and feet become a Fleen’s, variant for variant, in every frame the game draws them: walking, tumbling, far off, and in the builder’s tiles. Made green, their skin is a Fleen’s lemon-lime too. It rebuilds ZOOMBINI.MHK and PICKER.MHK; the builder’s big Zoombini also needs ZOOMBINI.EXE, whose table places its parts.</p>';
  if (missing.length) html += `<p class="note">It counts which parts the game draws together over every snoid script on the disc, so it needs every archive: ${plural(missing.length, 'more')} to come from archive.org. <a data-fetchall>Fetch them</a> (about 100 MB in all).</p>`;
  html += `<div class="tools"><label><input type="checkbox" id="modGreen"${MOD_FLEEN.green ? ' checked' : ''}> Lime green, like a Fleen</label>`
    + `<label class="btn">${MOD_EXE ? esc(MOD_EXE.name) + ' given' : 'Give ZOOMBINI.EXE…'}<input type="file" id="modExe" accept=".exe,.EXE" hidden></label>`
    + `<button id="modApply"${missing.length ? ' disabled' : ''}>Put the Fleen parts in</button> <span id="modErr" class="bad"></span></div>`
    + `<p class="note">${MOD_EXE ? 'The big Zoombini on the isle is modded too.' : 'Without the EXE, all but the big Zoombini on the isle is modded. It is in the game’s folder once installed, or on the CD.'}</p>`
    + '<div id="modShow"></div>';
  view.innerHTML = html;
  wireFetchAll(view);
  $('modGreen').addEventListener('change', e => { MOD_FLEEN.green = e.target.checked; });
  $('modExe').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (f) { MOD_EXE = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }; renderMods(); }
  });
  $('modApply').addEventListener('click', () => {
    $('modErr').textContent = '';
    setStatus('Putting the Fleen parts in…');
    setTimeout(() => {
      try { modFleenApply(); } catch (x) { $('modErr').textContent = x.message; console.error(x); }
      setStatus('');
      renderMods();
    }, 20);
  });
  modShow();
}
function modFleenApply() {
  const archives = new Map(sortedArchives().filter(e => !/^MIDI/.test(e.name) && e.bytes).map(e => [e.name, openedArchive(e)]));
  const out = zbFleenMod(archives, MOD_EXE ? MOD_EXE.bytes : null, MOD_FLEEN.green);
  const what = MOD_FLEEN.green ? 'Fleen parts, lime green' : 'Fleen parts';
  for (const name of ['ZOOMBINI', 'PICKER']) {
    const entry = ARCHIVES.get(name);
    if (!EDITS.has(name)) EDITS.set(name, { original: entry.bytes, changes: new Map() });
    for (const c of out[name]) EDITS.get(name).changes.set(editKey(c.tag, c.id), { tag: c.tag, id: c.id, bytes: c.bytes, what });
    editRebuild(entry);
  }
  EXE_EDIT = out.exe ? { name: MOD_EXE.name, bytes: out.exe, what: 'the big Zoombini’s anchors, for the Fleen parts' } : null;
  SSPRITES.clear();
}
/* Five Zoombinis as the archive now draws them, one of each variant. */
function modShow() {
  const z = ARCHIVES.get('ZOOMBINI'), arc = z && z.bytes ? openedArchive(z) : null, box = $('modShow');
  if (!arc || !box) return;
  const sheet = zbSnoidSheet(arc), pal = paletteFor(z, arc, 1 << 30).pal;
  box.innerHTML = `<p class="note">${isEdited('ZOOMBINI', 'tBMP', 3000) ? 'As the archive draws them now:' : 'As the archive draws them now, unmodded:'}</p>`;
  const row = document.createElement('div');
  row.className = 'trow';
  for (let v = 1; v <= 5; v++) {
    const c = indexedCanvas(zbZoombiniImage(sheet, { hair: v, eyes: v, nose: v, feet: v }), pal, true);
    c.style.height = '96px';
    row.appendChild(c);
  }
  box.appendChild(row);
}
