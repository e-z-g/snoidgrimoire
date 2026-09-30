/* zb-mohawk.js -- a Mohawk archive opened, and the resource types the
   Zoombinis disc holds besides its bitmaps, decoded to plain data.
   =========================================================================
   Needs mac-bytes.js. zb-bitmap.js, beside it, does tBMP and the palettes.

   Brøderbund's Mohawk engine keeps everything a scene needs in one `.MHK`
   archive: a `MHWK` header, a `RSRC` directory of four-letter types, each
   with its ids and optional names, and a file table that says where each
   resource's bytes are. `openMohawk(bytes)` returns the archive as an object,
   so any number can be open at once; every structural offset is checked
   before it is followed, so a file that is not an archive says so rather than
   listing invented resources.

   WHERE THE FORMATS CAME FROM
   The container and the WAVE and MIDI chunks are ScummVM's
   engines/mohawk/resource.cpp and sound.cpp; STRL, CURS, NODE and PATH are
   read as ScummVM's Zoombinis branch reads them (`ied206/scummvm-zoombini`:
   zoombini_text.cpp readTextStrStrings, cursors.cpp, zoombini_scripts.cpp
   ZmbNode). The extraction project's tools/mohawk_archive.py is the oracle
   the container is checked against (utilities/archive_check.mjs); the rest
   are checked for reading every resource on the disc to its last byte.

   These are classic scripts: no import, no export, one global scope.
*/

/* ---- the container --------------------------------------------------- */

function openMohawk(bytes) {
  const b = bytes;
  const need = (off, len, what) => {
    if (off < 0 || off + len > b.length) throw new Error(`not a Mohawk archive: ${what} runs past the end`);
  };
  need(0, 28, 'the header');
  if (fourcc(b, 0) !== 'MHWK' || fourcc(b, 8) !== 'RSRC') throw new Error('not a Mohawk archive');
  const absOff = u32be(b, 20), ftOff = u16be(b, 24);
  need(absOff, 4, 'the resource directory');
  const strTabOff = u16be(b, absOff), typeCount = u16be(b, absOff + 2);
  need(absOff + 4, typeCount * 8, 'the type list');

  const ft = absOff + ftOff;
  need(ft, 4, 'the file table');
  const fileCount = u32be(b, ft);
  need(ft + 4, fileCount * 10, 'the file table');
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const e = ft + 4 + i * 10;
    const flags = b[e + 7];
    // 24 bits of size, and three more in the flags (ScummVM's resource.cpp).
    const size = u16be(b, e + 4) + (b[e + 6] << 16) + ((flags & 7) * 0x1000000);
    files.push({ offset: u32be(b, e), size, flags });
  }

  const types = new Map();
  for (let t = 0; t < typeCount; t++) {
    const o = absOff + 4 + t * 8;
    const tag = latin1(b.subarray(o, o + 4));   // not fourcc(), which shows the NUL of \0SND as '?'
    const rt = absOff + u16be(b, o + 4), nt = absOff + u16be(b, o + 6);
    need(rt, 2, `${tag}'s resource table`);
    const n = u16be(b, rt);
    need(rt + 2, n * 4, `${tag}'s resource table`);
    const names = new Map();
    need(nt, 2, `${tag}'s name table`);
    const nn = u16be(b, nt);
    need(nt + 2, nn * 4, `${tag}'s name table`);
    for (let k = 0; k < nn; k++) {
      const p = absOff + strTabOff + u16be(b, nt + 2 + k * 4);
      let e = p;
      while (e < b.length && b[e] !== 0) e++;
      names.set(u16be(b, nt + 4 + k * 4), latin1(b.subarray(p, e)));
    }
    const list = [];
    for (let k = 0; k < n; k++) {
      const id = i16be(b, rt + 2 + k * 4), index = u16be(b, rt + 4 + k * 4);
      const f = files[index - 1];
      if (!f) throw new Error(`not a Mohawk archive: ${tag} ${id} names file ${index} of ${fileCount}`);
      need(f.offset, f.size, `${tag} ${id}`);
      list.push({ tag, id, index, name: names.get(index) || '', offset: f.offset, size: f.size });
    }
    types.set(tag, list);
  }

  return {
    bytes: b,
    types,
    tags() { return [...types.keys()]; },
    list(tag) { return types.get(tag) || []; },
    find(tag, id) { return (types.get(tag) || []).find(r => r.id === id) || null; },
    has(tag, id) { return !!this.find(tag, id); },
    get(tag, id) {
      const r = this.find(tag, id);
      if (!r) throw new Error(`no ${mohawkTagLabel(tag)} ${id}`);
      return b.subarray(r.offset, r.offset + r.size);
    },
  };
}

/* How a tag is shown: the sound type is "\0SND", with a NUL for its first
   letter, and is written "SND". */
function mohawkTagLabel(tag) { return tag.replace(/\0/g, ''); }

/* ---- WAVE and MIDI: chunks inside a resource --------------------------- */

/* A sound or a tune is itself a small MHWK container: 'MHWK', a length,
   a form type ('WAVE' or 'MIDI'), then chunks of a tag and a length. A chunk
   of odd length is followed by a pad byte; the MIDI resources are where that
   shows. Returns [{ tag, offset (of the body), size }]. */
function mohawkChunks(bytes, form) {
  const b = bytes;
  if (b.length < 12 || fourcc(b, 0) !== 'MHWK' || fourcc(b, 8) !== form) throw new Error(`not an MHWK ${form} resource`);
  const out = [];
  let o = 12;
  while (o < b.length) {
    if (o + 8 > b.length) throw new Error(`${form}: a chunk header runs past the end`);
    const tag = fourcc(b, o), size = u32be(b, o + 4);
    if (o + 8 + size > b.length) throw new Error(`${form}: ${tag} runs past the end`);
    out.push({ tag, offset: o + 8, size });
    o += 8 + size + (size & 1);
  }
  if (o !== b.length && o !== b.length + 1) throw new Error(`${form}: ${o - b.length} bytes over`);
  return out;
}

/* The \0SND resource: a Data chunk (ScummVM's makeMohawkWaveStream) and, in a
   few, a Cue# chunk before it. Every one on the 1996 disc is raw unsigned
   8-bit mono at 11,025 Hz (encoding 0). */
function parseMohawkWave(bytes) {
  const b = bytes;
  let data = null, cues = null;
  for (const c of mohawkChunks(b, 'WAVE')) {
    if (c.tag === 'Data') {
      const o = c.offset;
      if (c.size < 20) throw new Error('WAVE: Data chunk too short');
      const sampleCount = u32be(b, o + 2), bits = b[o + 6], channels = b[o + 7];
      const bytesPerFrame = (bits >> 3) * channels;
      if (20 + sampleCount * bytesPerFrame !== c.size) throw new Error(`WAVE: ${sampleCount} samples do not fill a ${c.size}-byte Data chunk`);
      data = {
        rate: u16be(b, o), sampleCount, bits, channels, encoding: u16be(b, o + 8),
        loopCount: u16be(b, o + 10), loopStart: u32be(b, o + 12), loopEnd: u32be(b, o + 16),
        samples: b.subarray(o + 20, o + c.size),
      };
    } else if (c.tag === 'Cue#') {
      const o = c.offset, n = u16be(b, o);
      cues = [];
      let p = o + 2;
      for (let i = 0; i < n; i++) {
        const len = b[p + 4];
        cues.push({ position: u32be(b, p), name: latin1(b.subarray(p + 5, p + 5 + len)) });
        p += 5 + len;
      }
      if (p !== o + c.size) throw new Error('WAVE: Cue# chunk not read to its end');
    } else {
      throw new Error(`WAVE: unknown chunk ${c.tag}`);
    }
  }
  if (!data) throw new Error('WAVE: no Data chunk');
  data.cues = cues || [];
  return data;
}

/* The tMID resource: a standard MIDI file's chunks, MThd and MTrk, with a
   Prg# chunk among them in most. Returns the chunks and the file a MIDI
   player takes, which is the MThd and MTrk chunks in order. */
function parseMohawkMidi(bytes) {
  const b = bytes;
  const chunks = mohawkChunks(b, 'MIDI');
  const smf = chunks.filter(c => c.tag === 'MThd' || c.tag === 'MTrk');
  if (!smf.length || smf[0].tag !== 'MThd' || smf[0].size < 6) throw new Error('MIDI: no MThd chunk first');
  const tracks = smf.filter(c => c.tag === 'MTrk').length;
  const hd = smf[0].offset;
  const header = { format: u16be(b, hd), tracks: u16be(b, hd + 2), division: u16be(b, hd + 4) };
  if (header.tracks !== tracks) throw new Error(`MIDI: MThd says ${header.tracks} tracks and there are ${tracks}`);
  const total = smf.reduce((n, c) => n + 8 + c.size, 0);
  const file = new Uint8Array(total);
  let p = 0;
  for (const c of smf) {
    file.set(b.subarray(c.offset - 8, c.offset + c.size), p);
    p += 8 + c.size;
  }
  const prg = chunks.find(c => c.tag === 'Prg#');
  return { header, chunks: chunks.map(c => c.tag), file, programs: prg ? b.subarray(prg.offset, prg.offset + prg.size) : null };
}

/* ---- the small types -------------------------------------------------- */

/* STRL: a count byte, then that many NUL-terminated strings, and nothing
   after. The US release's text is Windows-1252. */
const ZB_TEXT_DECODER = new TextDecoder('windows-1252');
function parseStringList(bytes) {
  const b = bytes;
  if (!b.length) throw new Error('STRL: empty');
  const n = b[0], out = [];
  let p = 1;
  for (let i = 0; i < n; i++) {
    let e = p;
    while (e < b.length && b[e] !== 0) e++;
    if (e >= b.length) throw new Error(`STRL: string ${i + 1} of ${n} runs past the end`);
    out.push(ZB_TEXT_DECODER.decode(b.subarray(p, e)));
    p = e + 1;
  }
  if (p !== b.length) throw new Error(`STRL: ${b.length - p} bytes after the last string`);
  return out;
}

/* CURS: the classic Mac cursor, 68 bytes: sixteen rows of image, sixteen of
   mask, then the hot spot as a Mac Point, vertical first. */
function parseCursor(bytes) {
  const b = bytes;
  if (b.length !== 68) throw new Error(`CURS: ${b.length} bytes, not 68`);
  const bit = (base, x, y) => (u16be(b, base + y * 2) >> (15 - x)) & 1;
  const image = new Uint8Array(256), mask = new Uint8Array(256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    image[y * 16 + x] = bit(0, x, y);
    mask[y * 16 + x] = bit(32, x, y);
  }
  return { image, mask, hotY: i16be(b, 64), hotX: i16be(b, 66) };
}

/* NODE: a count, then that many waypoints as signed (x, y). */
function parseWalkNodes(bytes) {
  const b = bytes;
  const n = u16be(b, 0);
  if (b.length !== 2 + n * 4) throw new Error(`NODE: ${n} waypoints do not fill ${b.length} bytes`);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: i16be(b, 2 + i * 4), y: i16be(b, 4 + i * 4) });
  return out;
}

/* PATH: a count, then that many paths of 24 one-based waypoint numbers
   each, a 0 marking an empty slot. */
function parseWalkPaths(bytes, waypointCount) {
  const b = bytes;
  const n = u16be(b, 0);
  if (b.length !== 2 + n * 24) throw new Error(`PATH: ${n} paths do not fill ${b.length} bytes`);
  const out = [];
  for (let i = 0; i < n; i++) {
    const slots = [...b.subarray(2 + i * 24, 2 + (i + 1) * 24)];
    if (waypointCount != null && slots.some(w => w > waypointCount)) throw new Error(`PATH: path ${i} names a waypoint past ${waypointCount}`);
    out.push(slots);
  }
  return out;
}

/* REGS: signed 16-bit numbers and nothing else. Most come in pairs of ids,
   id and id + 1, holding one axis each of a sprite sheet's registration
   points (ScummVM's ZmbShapeOffsetRegs). */
function parseRegs(bytes) {
  const b = bytes;
  if (b.length & 1) throw new Error('REGS: odd length');
  const out = new Int16Array(b.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = i16be(b, i * 2);
  return out;
}
