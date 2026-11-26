/* zb-movie.js -- the intro movies: QuickTime movies whose video is
   Broderbund's QkBk scenes and whose sound is 8-bit mono.
   =========================================================================
   Needs mac-bytes.js.

   The disc has four in DATA: LOGO025.MOV, the one the 1996 programs play,
   LOGO025B.MOV with its sound at twice the rate, and LOGO027.MOV and
   LOGO027B.MOV, whose sound is at the Mac's rates (11,127 and 22,254 Hz).
   Each is 640 x 480, 1,392 frames at 10 a second.

   A QkBk frame is not pixels but a scene. It places bitmaps from a cast,
   sent once each in the frame that first needs them, in up to 35 slots, in
   256 colors, with the rectangles that changed. zbMovieRead reads the
   container into its video samples and its sound. zbQkbkDecoder draws the
   frames one after another into a 640 x 480 picture of palette indexes.

   WHERE IT CAME FROM
   The QkBk decoding is a port of ScummVM's image/codecs/cdtoons.cpp
   (GPL-3.0-or-later), where the codec is called CDToons, from the commit
   of ScummVM's pull request #7895 in reference/scummvm-zoombini. The frame
   header, the cast items ("blocks"), the slots ("actions"), the tagged
   blocks (Diff, XFrm, Mrks, Scal, WrMp, FrtR, BckR), the retained
   background that XFrm's slots draw into, and the row run-lengths are
   ScummVM's, in its order. The container reading is QuickTime's published
   layout (moov, trak, mdia, stbl), as far as these movies need it.
   utilities/movie_check.mjs compares every frame, palette and sound with
   zbtools' reader, run on this machine, which zbtools checked against
   Broderbund's codec, qb32.qtc.
*/

/* ---- the container ------------------------------------------------------ */

/* { width, height, timescale, video: { codec, timescale, durations, samples },
   sound: { codec, rate, timescale, bits, channels, bytes, edits } | null }.
   The video's samples are subarrays of `bytes`, and durations its frames'
   lengths in its timescale. The sound's bytes are its media's, and its
   edits [duration in the movie's timescale, media time or -1 for silence]. */
function zbMovieRead(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const atoms = (start, end) => {
    const out = [];
    for (let p = start; p + 8 <= end;) {
      let size = dv.getUint32(p), head = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); head = 16; } else if (size === 0) size = end - p;
      if (size < head || p + size > end) throw new Error(`a QuickTime atom at ${p} runs past its parent`);
      out.push({ tag: latin1(bytes.subarray(p + 4, p + 8)), start: p + head, end: p + size });
      p += size;
    }
    return out;
  };
  const one = (list, tag) => list.find(a => a.tag === tag);
  const path = (atom, ...tags) => {
    for (const t of tags) atom = atom && one(atoms(atom.start, atom.end), t);
    return atom;
  };
  const moov = one(atoms(0, bytes.length), 'moov');
  if (!moov) throw new Error('not a QuickTime movie (no moov atom)');
  const timescale = dv.getUint32(path(moov, 'mvhd').start + 12);
  const out = { width: 0, height: 0, timescale, video: null, sound: null };
  for (const trak of atoms(moov.start, moov.end).filter(a => a.tag === 'trak')) {
    const mdhd = path(trak, 'mdia', 'mdhd'), hdlr = path(trak, 'mdia', 'hdlr'), stbl = path(trak, 'mdia', 'minf', 'stbl');
    if (!mdhd || !hdlr || !stbl) continue;
    const kind = latin1(bytes.subarray(hdlr.start + 8, hdlr.start + 12));
    const table = tag => path(stbl, tag);
    const stsd = table('stsd'), stts = table('stts'), stsc = table('stsc'), stsz = table('stsz'), stco = table('stco');
    // the sample sizes, then each chunk's offset and its count of samples
    const fixed = dv.getUint32(stsz.start + 4), count = dv.getUint32(stsz.start + 8);
    const sizes = [];
    for (let k = 0; k < count; k++) sizes.push(fixed || dv.getUint32(stsz.start + 12 + 4 * k));
    const chunks = dv.getUint32(stco.start + 4), runs = [];
    for (let k = 0, n = dv.getUint32(stsc.start + 4); k < n; k++) runs.push([dv.getUint32(stsc.start + 8 + 12 * k), dv.getUint32(stsc.start + 12 + 12 * k)]);
    const placed = [];       // [offset, size] for each sample
    for (let c = 1, s = 0; c <= chunks; c++) {
      let per = 0;
      for (const [first, n] of runs) if (first <= c) per = n;
      let at = dv.getUint32(stco.start + 4 + 4 * c);
      for (let k = 0; k < per && s < count; k++, s++) { placed.push([at, sizes[s]]); at += sizes[s]; }
    }
    const entry = stsd.start + 8;             // the first sample description
    const edits = [];
    const elst = path(trak, 'edts', 'elst');
    if (elst) {
      for (let k = 0, n = dv.getUint32(elst.start + 4); k < n; k++) edits.push([dv.getUint32(elst.start + 8 + 12 * k), dv.getInt32(elst.start + 12 + 12 * k)]);
    }
    if (kind === 'vide') {
      const durations = [];
      for (let k = 0, n = dv.getUint32(stts.start + 4); k < n; k++) {
        const times = dv.getUint32(stts.start + 8 + 8 * k), d = dv.getUint32(stts.start + 12 + 8 * k);
        for (let j = 0; j < times; j++) durations.push(d);
      }
      out.width = dv.getUint16(entry + 32);
      out.height = dv.getUint16(entry + 34);
      out.video = {
        codec: latin1(bytes.subarray(entry + 4, entry + 8)), timescale: dv.getUint32(mdhd.start + 12), durations,
        samples: placed.map(([at, size]) => bytes.subarray(at, at + size)),
      };
    } else if (kind === 'soun') {
      const channels = dv.getUint16(entry + 24), bits = dv.getUint16(entry + 26);
      // a fixed sample size of 1 counts sample frames, as QuickTime's
      // uncompressed sound does, so a chunk is that many frames long
      const frame = fixed === 1 ? channels * bits / 8 : 1;
      const sound = new Uint8Array(placed.reduce((n, [, size]) => n + size * frame, 0));
      let p = 0;
      for (const [at, size] of placed) {
        sound.set(bytes.subarray(at, at + size * frame), p);
        p += size * frame;
      }
      out.sound = {
        codec: latin1(bytes.subarray(entry + 4, entry + 8)), rate: dv.getUint32(entry + 32) / 65536,
        timescale: dv.getUint32(mdhd.start + 12), bits, channels, bytes: sound, edits,
      };
    }
  }
  return out;
}

/* A movie's sound as it plays, its edits applied: { rate, pcm }, pcm
   Float32 samples. Only 8-bit mono, as the four intro movies have. */
function zbMovieSound(movie) {
  const s = movie.sound;
  if (!s || s.bits !== 8 || s.channels !== 1) return null;
  const rate = s.rate;
  const edits = s.edits.length ? s.edits : [[Math.round(s.bytes.length / rate * movie.timescale), 0]];
  let length = 0;
  for (const [d] of edits) length += Math.round(d / movie.timescale * rate);
  const pcm = new Float32Array(length);
  let p = 0;
  for (const [d, from] of edits) {
    const n = Math.round(d / movie.timescale * rate);
    if (from >= 0) {
      const start = Math.round(from / s.timescale * rate);
      for (let k = 0; k < n && start + k < s.bytes.length; k++) {
        pcm[p + k] = (s.codec === 'twos' ? (s.bytes[start + k] << 24 >> 24) : s.bytes[start + k] - 128) / 128;
      }
    }
    p += n;
  }
  return { rate, pcm };
}

/* ---- the QkBk scenes ---------------------------------------------------- */

/* A decoder for one movie's frames, in order from the first. decode(sample)
   draws the next frame and returns { pixels, palette, paletteId }: the
   picture as palette indexes, row by row, and the 256 colors as
   [r, g, b, ...], color 0 black. The next frame draws over both. */
function zbQkbkDecoder(width, height) {
  const surface = new Uint8Array(width * height), backing = new Uint8Array(width * height);
  const blocks = new Map();
  const palette = new Uint8Array(768);
  let backingValid = false, currentPalette = 0;

  // A rect is [top, left, bottom, right], as ScummVM's Common::Rect.
  const empty = r => r[3] <= r[1] || r[2] <= r[0];
  const clip = (r, c) => [Math.max(r[0], c[0]), Math.max(r[1], c[1]), Math.min(r[2], c[2]), Math.min(r[3], c[3])];
  const whole = [0, 0, height, width];
  const fill = (px, r, color) => {
    const [t, l, b, rr] = clip(r, whole);
    for (let y = t; y < b; y++) if (l < rr) px.fill(color, y * width + l, y * width + rr);
  };

  /* One bitmap's rows of run-lengths drawn at (x0, y0), within clipRect. */
  const renderBlock = (px, data, x0, y0, w, h, clipRect) => {
    let draw = clip([y0, x0, y0 + h, x0 + w], whole);
    if (clipRect) draw = clip(draw, clipRect);
    if (empty(draw)) return;
    const skipFirst = draw[1] - x0, drawWidth = draw[3] - draw[1];
    let p = 0;
    for (let y = 0; y < h; y++) {
      if (p + 2 > data.length) throw new Error('a QkBk bitmap ran past its data');
      const lineSize = (data[p] << 8) | data[p + 1];
      p += 2;
      const next = p + lineSize;
      if (next > data.length) throw new Error('a QkBk bitmap row ran past its data');
      const oy = y0 + y;
      if (oy < draw[0] || draw[2] <= oy) { p = next; continue; }
      const row = oy * width + draw[1];
      let skip = skipFirst, x = 0, done = false;
      while (x < drawWidth && !done) {
        if (next <= p) throw new Error('a QkBk bitmap row ended before its pixels');
        let run = data[p++];
        const raw = !(run & 0x80);
        run = (run & 0x7f) + 1;
        if (skip) {
          if (run <= skip) { skip -= run; p += raw ? run : 1; continue; }
          run -= skip;
          if (raw) p += skip;
          skip = 0;
        }
        if (drawWidth <= x + run) { run = drawWidth - x; done = true; }
        if (raw) {
          px.set(data.subarray(p, p + run), row + x);
          p += run;
        } else {
          const color = data[p++];
          if (color) px.fill(color, row + x, row + x + run);
        }
        x += run;
        if (p > next) return;
      }
      p = next;
    }
  };

  const renderActions = (actions, begin, end, px, clipRect) => {
    end = Math.min(end, actions.length);
    for (let i = begin; i < end; i++) {
      const a = actions[i], block = blocks.get(a.id);
      if (!block || !a.rect[3]) continue;
      if (block.data.length < 14) throw new Error(`QkBk bitmap ${a.id} is too small`);
      const h = (block.data[0] << 8) | block.data[1], w = (block.data[2] << 8) | block.data[3];
      renderBlock(px, block.data.subarray(14), a.rect[1], a.rect[0], w, h, clipRect);
    }
  };

  const decode = sample => {
    const dv = new DataView(sample.buffer, sample.byteOffset, sample.byteLength);
    const rect = o => [dv.getInt16(o), dv.getInt16(o + 2), dv.getInt16(o + 4), dv.getInt16(o + 6)];
    if (dv.getUint16(0) !== 9) throw new Error(`QkBk frame format ${dv.getUint16(0)}, not 9`);
    const frameId = dv.getUint16(2), background = sample[7];
    const dirty = rect(0x10), flags = dv.getUint32(0x18);
    const blockCount = dv.getUint16(0x1c), blockOffset = dv.getUint16(0x1e);
    const actionCount = sample[0x22];
    if (sample[0x23] !== 10) throw new Error(`QkBk slots of ${sample[0x23]} bytes, not 10`);
    const paletteId = dv.getUint16(0x24), paletteSet = dv.getUint16(0x26);
    const actions = [];
    for (let i = 0; i < actionCount; i++) actions.push({ id: dv.getUint16(0x2c + 10 * i), rect: rect(0x2e + 10 * i) });
    if (0x2c + 10 * actionCount !== blockOffset) throw new Error('a QkBk frame header is not the length of its slots');
    let p = blockOffset;
    for (let i = 0; i < blockCount; i++) {
      const id = dv.getUint16(p), size = dv.getUint32(p + 4);
      if (size < 14) throw new Error(`QkBk block ${id} is too small`);
      blocks.set(id, { type: dv.getUint16(p + 2), data: sample.subarray(p + 14, p + size) });
      p += size;
    }
    let hasXFrm = false, xBegin = 0, xCount = 0, xRect = null;
    const diffs = [], backRects = [], frontRects = [];
    while (p < sample.length) {
      const tag = latin1(sample.subarray(p, p + 4)), size = dv.getUint32(p + 4), next = p + size;
      if (size < 8 || next > sample.length) throw new Error(`QkBk block ${tag} runs past the frame`);
      const at = p + 8;
      if (tag === 'Diff') {
        const n = dv.getUint16(at);
        let q = at + 10;
        for (let k = 0; k < n; k++) {
          const entry = dv.getUint32(q + 8);
          diffs.push({ rect: rect(q), data: sample.subarray(q + 20, q + entry) });
          q += entry;
        }
      } else if (tag === 'XFrm') {
        hasXFrm = true;
        xBegin = sample[at]; xCount = sample[at + 1]; xRect = rect(at + 2);
      } else if (tag === 'FrtR' || tag === 'BckR') {
        const n = dv.getUint16(at), list = tag === 'FrtR' ? frontRects : backRects;
        for (let k = 0; k < n; k++) list.push(rect(at + 2 + 8 * k));
      }                                      // Mrks, Scal and WrMp draw nothing
      p = next;
    }

    for (const d of diffs) renderBlock(surface, d.data, d.rect[1], d.rect[0], d.rect[3] - d.rect[1], d.rect[2] - d.rect[0]);
    if (!diffs.length) {
      const start = Math.max(0, (xBegin << 24 >> 24) - 1);
      const backBegin = Math.min(start, actions.length), backEnd = Math.min(backBegin + xCount, actions.length);
      if (hasXFrm && xCount && !empty(xRect)) {
        if (!backingValid) { backing.fill(background); backingValid = true; }
        if (!(flags & 8)) {
          if (backRects.length) for (const r of backRects) fill(backing, r, background);
          else fill(backing, xRect, background);
        }
        renderActions(actions, backBegin, backEnd, backing, xRect);
      } else if (frameId === 1 && actions.length && actions[0].id && actions[0].id !== 0xffff) {
        if (!backingValid) { backing.fill(background); backingValid = true; }
        renderActions(actions, 0, 1, backing, null);
      }
      if (backingValid) {
        const [t, l, b, r] = clip(dirty, whole);
        for (let y = t; y < b; y++) if (l < r) surface.set(backing.subarray(y * width + l, y * width + r), y * width + l);
      } else if (!(flags & 8)) {
        if (frontRects.length) for (const r of frontRects) fill(surface, r, background);
        else fill(surface, dirty, background);
      }
      renderActions(actions, hasXFrm ? backEnd : Math.min(1, actions.length), actions.length, surface, null);
    }

    if (paletteId && currentPalette !== paletteId) {
      const block = blocks.get(paletteId);
      if (!block) throw new Error(`QkBk palette ${paletteId} is not in the cast yet`);
      if (block.data.length !== 2 * 3 * 256) throw new Error(`QkBk palette ${paletteId} is ${block.data.length} bytes`);
      currentPalette = paletteId;
      if (!paletteSet) {
        // each color's red, green and blue words, of which ScummVM reads the high bytes
        for (let i = 0; i < 768; i++) palette[i] = block.data[2 * i];
        palette[0] = palette[1] = palette[2] = 0;
      }
    }
    return { pixels: surface, palette, paletteId: currentPalette };
  };
  return { decode, width, height };
}
