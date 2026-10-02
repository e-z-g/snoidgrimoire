/* page-open.js -- taking the game's archives in.
   =========================================================================
   The picker, the folder picker, dropping files on the page, `?src=` for a
   page served over HTTP (comma-separated, archives or a CD image), and
   archive.org's copy, every archive fetched in turn from the start, the
   one a view asks for first.

   Remembered between visits, as Cythera's grimoire remembers its archive:
   every archive taken in, from files or from archive.org, is kept in this
   browser's IndexedDB as it was read (edits are not: they stay in the page
   until saved from Changes), and a visit with no ?src opens what is
   remembered at once, offline too. A new set taken in replaces it; Forget,
   at the top of Data's list, clears it. Where IndexedDB is refused (some
   file:// pages, a private window) nothing is remembered and nothing else
   changes.

   Every archive the page knows is an entry in ARCHIVES, by upper-case name:
   { name, size, bytes, arc, error, remote }. `arc` is openMohawk's result,
   made the first time the archive is looked at.

   The page's own script: DOM here. LOAD ORDER: after js/zb-*.js, before
   js/page-browse.js, whose browseStart it calls. */

const ARCHIVES = new Map();
let SOURCE = '';

/* archive.org's copy: the Learning Company's release, whose CD image the
   Internet Archive serves a file at a time through /cors/, with a CORS
   header for the asking page. The file names on that disc are lower case. */
const REMOTE = {
  label: "archive.org's copy of the 2001 release",
  item: 'https://archive.org/details/Zoombini_201806',
  url: name => 'https://archive.org/cors/Zoombini_201806/Zoombini.iso/DATA%2F' + name.toLowerCase() + '.mhk',
  names: ['BASECAMP', 'BCTWO', 'BRIDGE', 'CAVES', 'FERRY', 'FLEENS', 'HELP', 'HOTEL', 'LILLY', 'MAZE2', 'MUSIC',
    'NET', 'NETDEMO', 'PICKER', 'PIZZA', 'RODMAP', 'SLIDES', 'SMOKE', 'TOWN', 'TUNNELS', 'XFER', 'ZOOMBINI'],
};

/* ---- remembered between visits ------------------------------------------- */

const MEMORY_DB = 'snoidgrimoire', MEMORY_STORE = 'archives', MEMORY_SOURCE = '#source';
let REMEMBERED = false;
function memoryTx(mode, fn) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(MEMORY_DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(MEMORY_STORE)) req.result.createObjectStore(MEMORY_STORE); };
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(MEMORY_STORE, mode), r = fn(tx.objectStore(MEMORY_STORE));
      tx.oncomplete = () => { db.close(); resolve(r && r.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB refused it')); };
    };
  });
}
/* A new set: what was remembered goes, and where it came from is kept. */
function memoryBegin(label, remote) {
  REMEMBERED = false;
  return memoryTx('readwrite', s => { s.clear(); s.put({ label, remote, savedAt: Date.now() }, MEMORY_SOURCE); }).catch(() => {});
}
/* One archive as it was read; its own bytes, not the CD image they sit in. */
function memoryPut(entry) {
  const bytes = entry.bytes.slice();
  return memoryTx('readwrite', s => s.put({ name: entry.name, bytes }, entry.name))
    .then(() => { REMEMBERED = true; })
    .catch(e => setStatus(`Not remembered in this browser: ${e.message}`, true));
}
async function memoryRead() {
  const all = await memoryTx('readonly', s => s.getAll());
  const source = all.find(r => r.label), archives = all.filter(r => r.bytes);
  return source && archives.length ? { source, archives } : null;
}
function memoryForget() {
  REMEMBERED = false;
  return memoryTx('readwrite', s => s.clear()).catch(() => {});
}
/* Asked once something is remembered, so the browser keeps it under
   pressure for space; a browser may say no. */
function memoryKeep() { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); }

/* What was remembered, opened as it was taken in. */
async function openRemembered() {
  let got;
  try { got = await memoryRead(); } catch (e) { return false; }
  if (!got) return false;
  ARCHIVES.clear();
  if (got.source.remote) for (const n of REMOTE.names) ARCHIVES.set(n, { name: n, size: null, bytes: null, arc: null, error: null, remote: true });
  for (const r of got.archives) {
    const bytes = new Uint8Array(r.bytes);
    ARCHIVES.set(r.name, { name: r.name, size: bytes.length, bytes, arc: null, error: null, remote: !!got.source.remote });
  }
  REMEMBERED = true;
  SOURCE = got.source.label;
  setStatus(`Opened as remembered in this browser, ${fmtBytes(got.archives.reduce((n, r) => n + r.bytes.byteLength, 0))}.`);
  browseStart();
  if (got.source.remote) fetchTheRest();
  return true;
}

function setStatus(text, bad) {
  const el = document.getElementById('status');
  el.textContent = text || '';
  el.title = text || '';
  el.classList.toggle('bad', !!bad);
}

function nextPaint() {
  return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

function baseName(path) {
  return path.split(/[\\/]/).pop().replace(/\.mhk$/i, '').toUpperCase();
}

/* Take in [{ name, bytes }]: archives as they are, a CD image's DATA
   archives. Says what it could not use. */
async function takeFiles(picked, source) {
  const refused = [];
  let took = 0;
  for (const { name, bytes } of picked) {
    setStatus('Reading ' + name);
    await nextPaint();
    if (looksLikeMohawk(bytes)) {
      ARCHIVES.set(baseName(name), { name: baseName(name), size: bytes.length, bytes, arc: null, error: null, remote: false });
      took++;
    } else if (looksLikeIso(bytes)) {
      let files;
      try { files = isoFiles(bytes); } catch (e) { refused.push(name + ': ' + e.message); continue; }
      const mhk = files.filter(f => /^DATA\/[^/]+\.MHK$/i.test(f.path));
      if (!mhk.length) { refused.push(name + ' has no DATA/*.MHK'); continue; }
      for (const f of mhk) {
        const b = bytes.subarray(f.offset, f.offset + f.size);
        ARCHIVES.set(baseName(f.path), { name: baseName(f.path), size: f.size, bytes: b, arc: null, error: null, remote: false });
        took++;
      }
    } else if (!/^\./.test(name)) {
      refused.push(name);
    }
  }
  if (!took) {
    setStatus(refused.length ? 'Not a Mohawk archive or a CD image: ' + refused.join(', ') : 'Nothing to read', true);
    return;
  }
  SOURCE = source;
  setStatus(refused.length ? `Read ${took} archives; not used: ${refused.slice(0, 4).join(', ')}${refused.length > 4 ? '…' : ''}` : '');
  browseStart();
  memoryBegin(source, false).then(async () => {
    for (const e of ARCHIVES.values()) await memoryPut(e);
    memoryKeep();
  });
}

async function readPicked(files) {
  const out = [];
  for (const f of files) {
    if (!/\.(mhk|iso)$/i.test(f.name)) continue;
    out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return out;
}

function useRemote() {
  ARCHIVES.clear();
  for (const n of REMOTE.names) ARCHIVES.set(n, { name: n, size: null, bytes: null, arc: null, error: null, remote: true });
  SOURCE = REMOTE.label;
  browseStart(location.hash ? null : 'journey');
  memoryBegin(REMOTE.label, true).then(() => { memoryKeep(); fetchTheRest(); });
}
/* Every archive archive.org has not sent yet, one after another, behind
   whatever a view asks for (ensureBytes shares a fetch already under way).
   The view showing is drawn again once the last is in. */
let FETCHING_REST = null;
function fetchTheRest() {
  if (FETCHING_REST) return FETCHING_REST;
  const left = () => sortedArchives().filter(e => !e.bytes && e.remote && !e.error);
  const total = left().length;
  if (!total) return Promise.resolve();
  FETCHING_REST = (async () => {
    for (let e; (e = left()[0]);) {
      await ensureBytes(e);
      if (e.error) break;
    }
    FETCHING_REST = null;
    if (!left().length) { setStatus(`Every archive is in, and remembered in this browser.`); if (ARCHIVES.size && $('start').hidden) route(); }
  })();
  return FETCHING_REST;
}

/* An archive's bytes, fetched from archive.org the first time. */
const FETCHING = new Map();
function ensureBytes(entry) {
  if (entry.bytes || !entry.remote) return Promise.resolve(entry);
  if (FETCHING.has(entry.name)) return FETCHING.get(entry.name);
  const p = (async () => {
    const url = REMOTE.url(entry.name);
    setStatus(`Fetching ${entry.name.toLowerCase()}.mhk from archive.org…`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`archive.org answered ${res.status}`);
      const total = +res.headers.get('Content-Length') || 0;
      const reader = res.body.getReader();
      const parts = [];
      let got = 0, last = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        if (Date.now() - last > 250) {
          last = Date.now();
          setStatus(`Fetching ${entry.name.toLowerCase()}.mhk from archive.org: ${fmtBytes(got)}${total ? ' of ' + fmtBytes(total) : ''}`);
        }
      }
      const bytes = new Uint8Array(got);
      let o = 0;
      for (const part of parts) { bytes.set(part, o); o += part.length; }
      if (!looksLikeMohawk(bytes)) throw new Error('what came back is not a Mohawk archive');
      entry.bytes = bytes;
      entry.size = bytes.length;
      const left = sortedArchives().filter(e => !e.bytes && e.remote).length;
      setStatus(left ? `${left} more archive${left === 1 ? '' : 's'} to come from archive.org.` : '');
      memoryPut(entry);
    } catch (e) {
      entry.error = `Could not fetch it from archive.org (${e.message}).`;
      setStatus(entry.error, true);
    } finally {
      FETCHING.delete(entry.name);
    }
    return entry;
  })();
  FETCHING.set(entry.name, p);
  return p;
}

/* The archive opened, or null with entry.error saying why. */
function openedArchive(entry) {
  if (entry.arc || entry.error || !entry.bytes) return entry.arc;
  try { entry.arc = openMohawk(entry.bytes); } catch (e) { entry.error = e.message; }
  return entry.arc;
}

function wireOpening() {
  const drop = document.getElementById('drop');
  document.getElementById('pickFiles').addEventListener('change', async e => {
    const picked = await readPicked(e.target.files);
    e.target.value = '';
    await takeFiles(picked, picked.length === 1 ? picked[0].name : `${picked.length} files`);
  });
  document.getElementById('pickFolder').addEventListener('change', async e => {
    const picked = await readPicked(e.target.files);
    e.target.value = '';
    await takeFiles(picked, 'the DATA folder');
  });
  document.getElementById('useRemote').addEventListener('click', useRemote);
  for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', async e => {
    e.preventDefault();
    drop.classList.remove('over');
    const files = [];
    const walk = async entry => {
      if (entry.isFile) files.push(await new Promise((res, rej) => entry.file(res, rej)));
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const x of batch) await walk(x);
        }
      }
    };
    const items = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (items.length) for (const it of items) await walk(it);
    else files.push(...e.dataTransfer.files);
    const picked = await readPicked(files);
    await takeFiles(picked, picked.length === 1 ? picked[0].name : `${picked.length} files`);
  });
  document.getElementById('brand').addEventListener('click', () => {
    if (!ARCHIVES.size) return;
    history.replaceState(null, '', location.pathname + location.search);
    browseStart();
  });

  // Once every script is in: the map and the town are the last to load,
  // and an address such as #place=PIZZA or #town goes straight to them.
  const start = async () => {
    const src = new URLSearchParams(location.search).get('src');
    if (src === 'archive.org') useRemote();
    else if (src) openFromUrls(src.split(','));
    else await openRemembered();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

async function openFromUrls(urls) {
  const picked = [];
  for (const u of urls) {
    setStatus('Fetching ' + u);
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(res.status);
      picked.push({ name: u.split('/').pop(), bytes: new Uint8Array(await res.arrayBuffer()) });
    } catch (e) {
      setStatus(`Could not fetch ${u} (${e.message})`, true);
      return;
    }
  }
  await takeFiles(picked, urls.length === 1 ? urls[0].split('/').pop() : `${urls.length} files`);
}
