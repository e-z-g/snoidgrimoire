/* page-movie.js -- Components, Movies: the disc's four intro movies, each
   played with its sound, a frame at a time or from any frame.
   =========================================================================
   A CD image opened gives its DATA/*.MOV (page-open.js puts them in
   ZB_MOVIES). Otherwise the visitor picks one, or the page fetches it from
   archive.org's 1.0 disc, one file at a time. Movies are not stored in the
   browser, unlike the archives.

   The page's script: DOM here. LOAD ORDER: after page-galleries.js. */

const ZB_MOVIES = new Map();        // 'LOGO025.MOV' -> bytes
const ZB_MOVIE_NAMES = ['LOGO025.MOV', 'LOGO025B.MOV', 'LOGO027.MOV', 'LOGO027B.MOV'];
const ZB_MOVIE_REMOTE = name => 'https://archive.org/cors/logical-journey-of-the-zoombinis/Logical%20Journey%20of%20the%20Zoombinis.iso/DATA%2F' + name;
const ZB_MOVIE_ABOUT = {
  'LOGO025.MOV': 'the one the 1996 programs play',
  'LOGO025B.MOV': 'the same movie with its sound at twice the rate',
  'LOGO027.MOV': 'its sound at the Mac’s rate',
  'LOGO027B.MOV': 'its sound at twice the Mac’s rate',
};
let MOVIE_PLAYING = null;           // the player running, stopped when the view changes

ZB_GALLERIES.movies = function (view) {
  view.innerHTML = '<h1>Movies</h1><p class="sub">The disc’s DATA folder has the intro in four versions. Each is a QuickTime movie of 640 × 480 at 10 frames a second with 8-bit sound. Its pictures are Brøderbund’s QkBk scenes. Each scene places pictures from a cast rather than storing pixels.</p>'
    + '<div class="tools"><label class="btn">A movie file…<input type="file" id="movieFile" accept=".mov,.MOV" hidden></label> <span id="movieErr" class="bad"></span></div>'
    + '<div id="movieList"></div><div id="moviePlayer"></div>';
  $('movieFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    ZB_MOVIES.set(f.name.toUpperCase(), new Uint8Array(await f.arrayBuffer()));
    movieList();
    movieShow(f.name.toUpperCase());
  });
  movieList();
  const first = ZB_MOVIE_NAMES.find(n => ZB_MOVIES.has(n)) || [...ZB_MOVIES.keys()][0];
  if (first) movieShow(first);
};

function movieList() {
  const names = [...new Set([...ZB_MOVIE_NAMES, ...ZB_MOVIES.keys()])];
  $('movieList').innerHTML = '<table class="list">' + names.map(n => `<tr><td><a data-movie="${esc(n)}">${esc(n)}</a></td><td>${esc(ZB_MOVIE_ABOUT[n] || '')}</td>`
    + `<td>${ZB_MOVIES.has(n) ? fmtBytes(ZB_MOVIES.get(n).length) : ZB_MOVIE_NAMES.includes(n) ? '<a data-fetch="' + esc(n) + '">Fetch it from archive.org</a>' : ''}</td></tr>`).join('') + '</table>';
  for (const a of $('movieList').querySelectorAll('[data-movie]')) a.addEventListener('click', () => (ZB_MOVIES.has(a.dataset.movie) ? movieShow(a.dataset.movie) : movieFetch(a.dataset.movie)));
  for (const a of $('movieList').querySelectorAll('[data-fetch]')) a.addEventListener('click', () => movieFetch(a.dataset.fetch));
}

async function movieFetch(name) {
  $('movieErr').textContent = '';
  setStatus(`Fetching ${name} from archive.org…`);
  try {
    const res = await fetch(ZB_MOVIE_REMOTE(name));
    if (!res.ok) throw new Error(`archive.org returned ${res.status}`);
    ZB_MOVIES.set(name, new Uint8Array(await res.arrayBuffer()));
    setStatus('');
    movieList();
    movieShow(name);
  } catch (e) {
    setStatus('');
    $('movieErr').textContent = `${name} could not be fetched (${e.message}). It is in the DATA folder of the CD.`;
  }
}

/* The player: a canvas, Play, a slider of frames, and the sound. */
function movieShow(name) {
  movieStop();
  const box = $('moviePlayer');
  let m;
  try { m = zbMovieRead(ZB_MOVIES.get(name)); } catch (e) { box.innerHTML = `<p class="bad">${esc(name)} could not be read (${esc(e.message)}).</p>`; return; }
  if (!m.video || m.video.codec !== 'QkBk') { box.innerHTML = `<p class="bad">${esc(name)} has no QkBk pictures. It is not one of the game’s movies.</p>`; return; }
  const n = m.video.samples.length, perSecond = m.video.timescale / m.video.durations[0];
  const sound = zbMovieSound(m);
  box.innerHTML = `<h2 class="h">${esc(name)}</h2>`
    + `<p class="note">${n} frames in ${(n / perSecond).toFixed(1)} s.${sound ? ` The sound plays at ${sound.rate} Hz.` : ''}</p>`
    + `<canvas id="movieCanvas" width="${m.width}" height="${m.height}" style="width:100%;max-width:${m.width}px;background:#000"></canvas>`
    + `<div class="tools"><button id="moviePlay">Play</button><input type="range" id="movieAt" min="0" max="${n - 1}" value="0" style="flex:1"><span id="movieFrame"></span>`
    + (sound ? '<button id="movieWav">Save the sound as WAV</button>' : '') + '<button id="moviePng">Save this frame as PNG</button></div>';
  const canvas = $('movieCanvas'), ctx = canvas.getContext('2d'), image = ctx.createImageData(m.width, m.height);
  let dec = null, next = 0, shown = -1, out = null;
  const draw = k => {
    if (k === shown) return;
    if (!dec || k < next - 1) { dec = zbQkbkDecoder(m.width, m.height); next = 0; }
    while (next <= k) out = dec.decode(m.video.samples[next++]);
    const px = out.pixels, pal = out.palette, d = image.data;
    for (let i = 0, j = 0; i < px.length; i++, j += 4) {
      const c = 3 * px[i];
      d[j] = pal[c]; d[j + 1] = pal[c + 1]; d[j + 2] = pal[c + 2]; d[j + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    shown = k;
    $('movieAt').value = k;
    $('movieFrame').textContent = `frame ${k + 1} of ${n}, ${(k / perSecond).toFixed(1)} s`;
  };
  draw(0);
  $('movieAt').addEventListener('input', e => { movieStop(); draw(+e.target.value); });
  $('moviePng').addEventListener('click', async () => {
    const pal = [];
    for (let c = 0; c < 256; c++) pal.push([out.palette[3 * c], out.palette[3 * c + 1], out.palette[3 * c + 2]]);
    downloadBlob(await encodeIndexedPNG(m.width, m.height, out.pixels, pal, null), `${name.replace(/\.mov$/i, '').toLowerCase()}-${shown + 1}.png`);
  });
  if (sound) {
    $('movieWav').addEventListener('click', () => {
      const u8 = Uint8Array.from(sound.pcm, x => Math.round(x * 128) + 128);
      downloadBlob(wavFromPcmBytes(u8, Math.round(sound.rate), 8, 1), name.replace(/\.mov$/i, '').toLowerCase() + '.wav');
    });
  }
  $('moviePlay').addEventListener('click', () => {
    if (MOVIE_PLAYING) { movieStop(); return; }
    const from = shown >= n - 1 ? 0 : shown, at = from / perSecond;
    const audio = sound && typeof AudioContext === 'function' ? new AudioContext() : null;
    let src = null, t0;
    if (audio) {
      const buf = audio.createBuffer(1, sound.pcm.length, sound.rate);
      buf.copyToChannel(sound.pcm, 0);
      src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      src.start(0, Math.min(at, buf.duration));
      t0 = audio.currentTime;
    } else t0 = performance.now() / 1000;
    const playing = { audio, src, raf: 0 };
    MOVIE_PLAYING = playing;
    $('moviePlay').textContent = 'Pause';
    const tick = () => {
      if (MOVIE_PLAYING !== playing) return;
      if (!document.body.contains(canvas)) { movieStop(); return; }
      const t = at + (audio ? audio.currentTime : performance.now() / 1000) - t0;
      const k = Math.min(n - 1, Math.floor(t * perSecond));
      draw(k);
      if (k >= n - 1) { movieStop(); return; }
      playing.raf = requestAnimationFrame(tick);
    };
    tick();
  });
}

function movieStop() {
  const p = MOVIE_PLAYING;
  if (!p) return;
  MOVIE_PLAYING = null;
  cancelAnimationFrame(p.raf);
  if (p.src) try { p.src.stop(); } catch (e) { /* already ended */ }
  if (p.audio) p.audio.close();
  const b = document.getElementById('moviePlay');
  if (b) b.textContent = 'Play';
}
