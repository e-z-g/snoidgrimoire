/* page-open.js -- taking the game's archives in.
   =========================================================================
   The picker, the folder picker, dropping files on the page, `?src=` for a
   page served over HTTP (comma-separated, archives or a CD image), and
   archive.org's copy, fetched an archive at a time as each is opened.

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
      setStatus('');
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
  const start = () => {
    const src = new URLSearchParams(location.search).get('src');
    if (src === 'archive.org') useRemote();
    else if (src) openFromUrls(src.split(','));
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
