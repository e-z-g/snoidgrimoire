/* zb-tunes.js -- the 2015 remake's tunes found in its soundtrack.
   Steam's copies come with the soundtrack as MP3 files, each named for a
   route and a track ("Mountains of Despair - Track 1"), and the remake's
   tunes (Resources audio/music) are named for a puzzle and a level
   (BubbleWonderL1a). A route's track N is a medley of its puzzles' music
   at level N, so a tune is a stretch of one track, in another mix. Each
   tune and track is read as 12 pitch classes, 7.8 times a second, which a
   change of mix leaves mostly as it is. Three windows of 10 s from the
   tune's start are slid along every track, and a tune is found in a track
   where two windows match it (a cosine over 0.6) 10 s apart within 1 s.
   Read:
   mono samples at 8 kHz. Each frame of 2,048 samples, 1,024 apart, is
   windowed (Hann) and transformed. A bin from 60 to 2,000 Hz adds its
   magnitude to the pitch class of round(12 log2(f / 440)) mod 12. Each
   frame is scaled to length 1, and the piece's mean frame is taken off.
   WHERE IT CAME FROM
   Chroma features as in music information retrieval (Bartsch and
   Wakefield, 2001). Checked by utilities/remake_check.mjs against
   utilities/remake_tunes_oracle.py, the same reading in numpy over the
   Windows build's tunes and soundtrack.
   =========================================================================
   Pure: samples in, data out. Used by page-remake.js. */

const ZB_TUNE_RATE = 8000, ZB_TUNE_N = 2048, ZB_TUNE_HOP = 1024;
const ZB_TUNE_FPS = ZB_TUNE_RATE / ZB_TUNE_HOP;
const ZB_TUNE_WINDOW = Math.round(10 * ZB_TUNE_FPS);

/* An in-place radix-2 FFT of re and im, of a length that is a power of 2. */
function zbFft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/* The 12 pitch classes of mono samples at 8 kHz: { n, frames } with 12
   values a frame. */
function zbChroma(samples) {
  const N = ZB_TUNE_N, hann = new Float32Array(N), cls = new Int8Array(N / 2 + 1).fill(-1);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  for (let k = 1; k <= N / 2; k++) {
    const f = k * ZB_TUNE_RATE / N;
    if (f > 60 && f < 2000) cls[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12) % 12;
  }
  const n = samples.length < N ? 0 : Math.floor((samples.length - N) / ZB_TUNE_HOP) + 1;
  const frames = new Float32Array(n * 12), re = new Float64Array(N), im = new Float64Array(N), mean = new Float64Array(12);
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < N; i++) { re[i] = samples[t * ZB_TUNE_HOP + i] * hann[i]; im[i] = 0; }
    zbFft(re, im);
    const c = frames.subarray(t * 12, t * 12 + 12);
    for (let k = 1; k <= N / 2; k++) if (cls[k] >= 0) c[cls[k]] += Math.hypot(re[k], im[k]);
    let len = 0;
    for (let j = 0; j < 12; j++) len += c[j] * c[j];
    len = Math.sqrt(len) + 1e-9;
    for (let j = 0; j < 12; j++) { c[j] /= len; mean[j] += c[j] / n; }
  }
  for (let t = 0; t < n; t++) for (let j = 0; j < 12; j++) frames[t * 12 + j] -= mean[j];
  return { n, frames };
}

/* The best place of a window of a tune (frames from `from`) along a
   track: { score, at } with `at` in frames. */
function zbChromaSlide(tune, from, track) {
  const W = ZB_TUNE_WINDOW * 12, q = tune.frames.subarray(from * 12, from * 12 + W), m = track.frames;
  let qq = 0;
  for (let i = 0; i < W; i++) qq += q[i] * q[i];
  let best = -1, at = 0;
  if (track.n < ZB_TUNE_WINDOW) return { score: best, at };
  // The window's energy along the track, kept as a running sum.
  let mm = 0;
  for (let i = 0; i < W; i++) mm += m[i] * m[i];
  for (let o = 0; o + ZB_TUNE_WINDOW <= track.n; o++) {
    if (o) for (let j = 0; j < 12; j++) { const a = m[(o - 1) * 12 + j], b = m[(o - 1 + ZB_TUNE_WINDOW) * 12 + j]; mm += b * b - a * a; }
    let dot = 0;
    const base = o * 12;
    for (let i = 0; i < W; i++) dot += q[i] * m[base + i];
    const c = dot / (Math.sqrt(Math.max(mm, 0) * qq) + 1e-9);
    if (c > best) { best = c; at = o; }
  }
  return { score: best, at };
}

/* Where a tune is in the tracks: { track, at (seconds), score }, or null.
   `tracks` is a list of chroma. */
function zbTuneFind(tune, tracks) {
  const hits = [];
  for (let w = 0; w < 3 && (w + 1) * ZB_TUNE_WINDOW <= tune.n; w++) {
    let best = null;
    tracks.forEach((track, i) => {
      const s = zbChromaSlide(tune, w * ZB_TUNE_WINDOW, track);
      if (!best || s.score > best.score) best = { track: i, at: s.at, score: s.score, w };
    });
    if (best && best.score > 0.6) hits.push(best);
  }
  // Two windows in one track, as far apart there as in the tune.
  for (let a = 0; a < hits.length; a++) for (let b = a + 1; b < hits.length; b++) {
    const x = hits[a], y = hits[b];
    if (x.track !== y.track) continue;
    const apart = (y.at - x.at) - (y.w - x.w) * ZB_TUNE_WINDOW;
    if (Math.abs(apart) <= ZB_TUNE_FPS) return { track: x.track, at: (x.at - x.w * ZB_TUNE_WINDOW) / ZB_TUNE_FPS, score: Math.min(x.score, y.score) };
  }
  return null;
}

/* A soundtrack file's title: its name without the number in front and the
   extension ("01 - Opening Storyline.mp3" is "Opening Storyline"). */
const zbTrackTitle = name => name.replace(/\.[^.]+$/, '').replace(/^\d+\s*-\s*/, '');

if (typeof module !== 'undefined') module.exports = { zbFft, zbChroma, zbChromaSlide, zbTuneFind, zbTrackTitle, ZB_TUNE_RATE };
