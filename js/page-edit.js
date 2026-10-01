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
  if (!EDITS.size) html += '<p class="note">Nothing is edited. A string list can be, from its view in Data.</p>';
  for (const [name, e] of EDITS) {
    html += `<h2 class="h">${esc(name)}</h2><ul>` + [...e.changes.values()].map(c => `<li><a href="#${name}/${mohawkTagLabel(c.tag)}/${c.id}">${mohawkTagLabel(c.tag)} ${c.id}</a> <span class="note">${esc(c.what)}</span> <a data-undo="${esc(name)}|${esc(c.tag)}|${c.id}">undo</a></li>`).join('') + '</ul>'
      + `<div class="tools"><button data-save="${esc(name)}">Save ${esc(name)}.MHK</button> <a data-undo="${esc(name)}||">undo all</a></div>`;
  }
  view.innerHTML = html;
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
