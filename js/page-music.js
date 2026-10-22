/* page-music.js -- a tune played in the page (js/zb-music.js has which
   synthesis and why). The page fetches the instruments once, from
   QuickTime 3's Windows installer on archive.org (7 MB), and stores the
   2 MB taken out of it in an IndexedDB database apart from the archives',
   as grimoire does; where the fetch fails, the visitor can give a file
   instead: the installer, the .qtx, or a Mac QuickTime Musical
   Instruments file's resource fork.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-browse.js. */

const QT_INSTALLER_URL = 'https://archive.org/cors/apple-quicktime-3/apple-quicktime-3.iso/QUICKTIM.EXE';
const QT_DB = 'snoidgrimoire-qt-instruments', QT_STORE = 'instruments', QT_KEY = 'quicktime3';
let QT_LIB = null;
const TUNES = new Map();   // 'MIDIMAC 30001' -> { url, wav, seconds, missing }

function qtCache(mode, fn) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(QT_DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(QT_STORE);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(QT_STORE, mode), r = fn(tx.objectStore(QT_STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      tx.oncomplete = () => db.close();
    };
  });
}
function qtAdoptInstruments(lib) {
  QT_LIB = lib;
  qtCache('readwrite', s => s.put(lib.forkBytes, QT_KEY)).catch(e => console.warn('The instruments were not remembered:', e));
}
async function qtLoadInstruments() {
  if (QT_LIB) return QT_LIB;
  let fork = null;
  try { fork = await qtCache('readonly', s => s.get(QT_KEY)); } catch (e) { console.warn('The remembered instruments were not read:', e); }
  if (fork) {
    try { QT_LIB = qtInstrumentsFromFile(new Uint8Array(fork)); return QT_LIB; } catch (e) { console.warn('The remembered instruments could not be opened:', e); }
  }
  const res = await fetch(QT_INSTALLER_URL);
  if (!res.ok) throw new Error('archive.org answered ' + res.status);
  qtAdoptInstruments(qtInstrumentsFromFile(new Uint8Array(await res.arrayBuffer())));
  return QT_LIB;
}

/* The tune rendered, once: { url, wav, seconds, missing }. */
async function tuneRendered(entry, arc, id) {
  const key = `${entry.name} ${id}`;
  if (TUNES.has(key)) return TUNES.get(key);
  setStatus('Fetching QuickTime 3’s instruments…');
  const lib = await qtLoadInstruments();
  setStatus(`Making ${entry.name} ${id} into sound…`);
  await new Promise(res => setTimeout(res, 30));   // paint the status before the render blocks the page
  const r = zbTuneWav(parseMohawkMidi(arc.get('tMID', id)).file, lib);
  const t = { url: URL.createObjectURL(new Blob([r.wav], { type: 'audio/wav' })), wav: r.wav, seconds: r.seconds, missing: r.missing, tune: r.tune };
  TUNES.set(key, t);
  setStatus('');
  return t;
}

/* The player under a tune's view or in the gallery: Play makes the sound
   and puts an <audio> in `into`; a failed fetch offers a file instead. */
function tunePlayer(entry, arc, id, into) {
  into.innerHTML = '<button class="tplay">Play</button> <span class="note tnote"></span>';
  const note = into.querySelector('.tnote');
  const play = async () => {
    into.querySelector('.tplay').disabled = true;
    let t;
    try { t = await tuneRendered(entry, arc, id); }
    catch (e) {
      setStatus('');
      const fetching = !QT_LIB;
      into.querySelector('.tplay').disabled = false;
      note.innerHTML = fetching
        ? `QuickTime 3’s instruments could not be fetched (${esc(e.message)}). <label class="btn">Choose QUICKTIM.EXE or the .qtx<input type="file" hidden></label>`
        : `The tune could not be played: ${esc(e.message)}`;
      const pick = note.querySelector('input');
      if (pick) pick.addEventListener('change', async () => {
        const f = pick.files && pick.files[0];
        if (!f) return;
        try { qtAdoptInstruments(qtInstrumentsFromFile(new Uint8Array(await f.arrayBuffer()))); note.textContent = ''; play(); }
        catch (err) { note.textContent = `No instruments in ${f.name}: ${err.message}`; }
      });
      return;
    }
    const parts = t.tune.parts.map(p => QT_LIB.has(p.instrument) ? QT_LIB.get(p.instrument).name : 'instrument ' + p.instrument);
    into.innerHTML = `<audio controls autoplay src="${t.url}"></audio> <button class="twav">Save as WAV</button>`
      + `<p class="note">${t.seconds.toFixed(1)} s through QuickTime 3’s instruments: ${esc([...new Set(parts)].join(', '))}.`
      + (t.missing.length ? ` No instrument for part ${t.missing.join(', ')}.` : '') + '</p>';
    into.querySelector('.twav').addEventListener('click', () => downloadBlob(t.wav, `${entry.name.toLowerCase()}-tmid-${id}.wav`));
  };
  into.querySelector('.tplay').addEventListener('click', play);
}
