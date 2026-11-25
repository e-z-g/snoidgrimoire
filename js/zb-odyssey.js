/* zb-odyssey.js -- Zoombinis Island Odyssey (2002), the third game: its
   bundles (.bul) and what is in them, as the workbench's
   tools/odyssey/io_bundle.py reads them (doc/ISLAND-ODYSSEY.md).
   =========================================================================
   The game's files are the disc's bundles (HD/rsc and rsc), each place's
   XML and compiled script (HD/scripts), the Bink movies and the program's
   DLLs. A bundle is a u32, a date, and a run of entries, each a name ending
   in a 0 byte and then the file, with no length. The file's format gives a
   least length (a RIFF's chunks, an .ao's frames as tcx.dll reads them, a
   JPEG's segments, an .rgb's 1,536 bytes), and the entry ends where the
   next name starts.
   An .ao is an animation or picture (OMAnimation::loadAOData in tcx.dll):
   i16 sequences s, i16 frames n, u8 kind (12 for 16-bit frames, 10 for
   8-bit), u8 1 for big-endian, 4 bytes, n u32 frame offsets, s u32 points,
   the sequences (an i16 count and that many steps of four i16), and the
   frames. A 16-bit frame is an AO2C chunk of RGB555 runs with alpha, and an
   8-bit frame runs of indices into the .rgb of the same number.
   =========================================================================
   Readers only, no DOM. Exports for Node at the end. */

const IO_PLACES = [
  { key: 'z3p1', name: 'Zoombiniville', kind: 'the start, where a band is recruited' },
  { key: 'z3m2', name: 'The Map', kind: 'Zoombini Isle, for a journey or practice' },
  { key: 'z3a1', name: 'The Catapult', kind: 'puzzle' },
  { key: 'z3a2', name: 'The Wall', kind: 'puzzle' },
  { key: 'z3a3', name: 'The Planetarium', kind: 'puzzle' },
  { key: 'z3a4', name: 'The Greenhouse', kind: 'puzzle' },
  { key: 'z3a5', name: 'The Garden', kind: 'puzzle' },
  { key: 'z3a6', name: 'The Corral', kind: 'puzzle' },
  { key: 'z3a7', name: 'The Barn', kind: 'puzzle' },
  { key: 'z3v3', name: 'Zoombini Isle View', kind: 'the biomes, the end' },
];
const IO_PLACE_BY_KEY = new Map(IO_PLACES.map(p => [p.key, p]));
const IO_LEVELS = ['Not So Hard', 'Oh So Hard', 'Very Very Hard'];

const ioU16 = (b, o) => b[o] | (b[o + 1] << 8);
const ioI16 = (b, o) => (ioU16(b, o) << 16) >> 16;
const ioU32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/* A RIFF's length, by its chunks. (Its size word is 4 short of them.) */
function ioWavLength(b, pos) {
  let at = pos + 12;
  while (at + 8 <= b.length) {
    const id = String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]), size = ioU32(b, at + 4);
    at += 8 + size + (size & 1);
    if (id === 'data') break;
  }
  return at - pos;
}
/* A JPEG's length: its segments, then the scan up to the end marker. */
function ioJpegLength(b, pos) {
  let at = pos + 2;
  while (at + 4 <= b.length) {
    const marker = b[at + 1];
    if (marker === 0xd9) return at + 2 - pos;
    at += 2 + ((b[at + 2] << 8) | b[at + 3]);
    if (marker === 0xda) while (at + 1 < b.length && !(b[at] === 0xff && b[at + 1] !== 0 && !(b[at + 1] >= 0xd0 && b[at + 1] < 0xd8))) at++;
  }
  return b.length - pos;
}
/* Where an AO2C frame ends, walking its rows as tcx.dll's FUN_10001940
   does. (The size word after AO2C is short in some.) */
function ioAo2cEnd(b, c) {
  const w = ioU16(b, c + 10), h = ioU16(b, c + 12);
  let at = c + 16 + 4 * h;
  for (let y = 0; y < h; y++) {
    let left = w;
    while (left > 0) {
      const op = ioU16(b, at), count = ioU16(b, at + 2);
      at += 4 + count * (op === 1 ? 2 : op === 2 ? 3 : 0);
      left -= count;
    }
  }
  return at;
}
/* An 8-bit frame's length: u16 kind, i16 width, i16 height, then each
   row's runs. A run is 0 and a count of clear pixels, 0xff, an index and a
   count, or n from 1 to 254 and n indices. */
function ioRle8Length(b, pos) {
  const w = ioI16(b, pos + 2), h = ioI16(b, pos + 4);
  let at = pos + 6;
  for (let y = 0; y < h; y++) {
    let left = w;
    while (left > 0) {
      const c = b[at];
      if (c === 0) { left -= b[at + 1]; at += 2; } else if (c === 0xff) { left -= b[at + 2]; at += 3; } else { left -= c; at += 1 + c; }
    }
  }
  return at - pos;
}
/* An .ao at pos: { kind: 16 or 8, sequences: [[[x, y, frame, word]]],
   points: [[x, y, byte]], frames: [offset], end }. */
function ioAo(b, pos) {
  const sequences = ioI16(b, pos), count = ioI16(b, pos + 2);
  if (b[pos + 5]) throw new Error('a big-endian .ao');
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(ioU32(b, pos + 10 + 4 * i));
  let at = pos + 10 + 4 * count;
  const points = [];
  for (let i = 0; i < sequences; i++, at += 4) {
    let x = (b[at + 2] & 0x0f) * 256 + b[at], y = (b[at + 2] & 0xf0) * 16 + b[at + 1];
    if (x > 0x800) x -= 0x1000;
    if (y > 0x800) y -= 0x1000;
    points.push([x, y, b[at + 3]]);
  }
  const seqs = [];
  for (let i = 0; i < sequences; i++) {
    const n = ioI16(b, at), steps = [];
    for (let k = 0; k < n; k++) steps.push([0, 2, 4, 6].map(o => ioI16(b, at + 2 + 8 * k + o)));
    seqs.push(steps);
    at += 2 + 8 * n;
  }
  const base = at;
  if (b[base] === 0x41 && b[base + 1] === 0x4f && b[base + 2] === 0x32 && b[base + 3] === 0x43) {
    const frames = [];
    for (let i = 0; i < count; i++) {
      if (!(b[at] === 0x41 && b[at + 1] === 0x4f && b[at + 2] === 0x32 && b[at + 3] === 0x43)) throw new Error(`frame ${i} is not AO2C`);
      frames.push(at);
      at = ioAo2cEnd(b, at);
    }
    if (b[at] === 0x41 && b[at + 1] === 0x4f && b[at + 2] === 0x32 && b[at + 3] === 0x45) at += 4;
    return { kind: 16, sequences: seqs, points, frames, end: at };
  }
  const frames = offsets.map(o => base + o), last = frames[frames.length - 1];
  return { kind: 8, sequences: seqs, points, frames, end: last + ioRle8Length(b, last) };
}

const IO_NAME = /^[A-Za-z0-9_ -]+\.(wav|ao|jpg|lips|rgb)$/i;
const IO_NAME_CHAR = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_ .-'].map(c => c.charCodeAt(0)));
const ioText = (b, a, z) => { let t = ''; for (let i = a; i < z; i++) t += String.fromCharCode(b[i]); return t; };
/* Whether a file named name could start at start. */
function ioStartsLike(b, start, name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'wav') return ioText(b, start, start + 4) === 'RIFF';
  if (ext === 'jpg') return b[start] === 0xff && b[start + 1] === 0xd8;
  if (ext === 'ao') return b[start] === 1 && b[start + 1] === 0;
  return true;
}
/* Where the entry after one ending no sooner than least starts: the first
   name that starts at least or later, has a kind's extension, and comes
   before a file that starts as that kind does. Of the names ending at one 0
   byte, the longest number is taken, or else the longest name. */
function ioNextEntry(b, least) {
  for (let z = b.indexOf(0, least + 1); z >= 0; z = b.indexOf(0, z + 1)) {
    let s = z;
    while (s > least && IO_NAME_CHAR.has(b[s - 1]) && z - s < 60) s--;
    let any = -1;
    for (let start = s; start < z; start++) {
      const name = ioText(b, start, z);
      if (!IO_NAME.test(name) || !ioStartsLike(b, z + 1, name)) continue;
      if (/^\d+\./.test(name)) return start;
      if (any < 0) any = start;
    }
    if (any >= 0) return any;
  }
  return b.length;
}
/* A bundle's entries: [{ name, start, end }]. */
function ioEntries(b) {
  const out = [];
  let pos = 4;
  while (pos + 2 < b.length) {
    const z = b.indexOf(0, pos), name = ioText(b, pos, z);
    if (!IO_NAME.test(name)) throw new Error(`no name at ${pos}`);
    const start = z + 1, ext = name.split('.').pop().toLowerCase();
    let least = start;
    if (ioText(b, start, start + 4) === 'RIFF') least = start + ioWavLength(b, start);
    else if (ext === 'ao') least = ioAo(b, start).end;
    else if (b[start] === 0xff && b[start + 1] === 0xd8) least = start + ioJpegLength(b, start);
    else if (ext === 'rgb') least = start + 1536;
    const end = ioNextEntry(b, least);
    out.push({ name, start, end });
    pos = end;
  }
  return out;
}

/* An .rgb: 256 colors, each u16 red, green and blue, big-endian. */
function ioPalette(b, start) {
  const out = [];
  for (let i = 0; i < 256; i++) out.push([b[start + 6 * i], b[start + 6 * i + 2], b[start + 6 * i + 4]]);
  return out;
}
/* A 16-bit AO2C frame as RGBA: rows of u16 op and u16 count, op 0 clear,
   op 1 RGB555 pixels, op 2 RGB555 pixels each with a u8 alpha. */
function ioAo2cFrame(b, c) {
  const size = ioU32(b, c + 4), w = ioU16(b, c + 10), h = ioU16(b, c + 12);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    let at = c + 8 + ioU32(b, c + 16 + 4 * y);
    const end = c + 8 + (y + 1 < h ? ioU32(b, c + 16 + 4 * (y + 1)) : size);
    let x = 0;
    while (at < end && x < w) {
      const op = ioU16(b, at), count = ioU16(b, at + 2);
      at += 4;
      if (op === 0) { x += count; continue; }
      for (let k = 0; k < count; k++) {
        const v = ioU16(b, at), o = (y * w + x) * 4;
        if (x < w) {
          data[o] = ((v >> 10) & 31) * 255 / 31 | 0; data[o + 1] = ((v >> 5) & 31) * 255 / 31 | 0; data[o + 2] = (v & 31) * 255 / 31 | 0;
          data[o + 3] = op === 1 ? 255 : b[at + 2];
        }
        at += op === 1 ? 2 : 3;
        x++;
      }
    }
  }
  return { width: w, height: h, data };
}
/* An 8-bit frame as RGBA, with its palette (or gray). */
function ioRle8Frame(b, f, colors) {
  const w = ioI16(b, f + 2), h = ioI16(b, f + 4), data = new Uint8ClampedArray(Math.max(0, w * h * 4));
  const put = (x, y, i) => {
    if (x >= w) return;
    const o = (y * w + x) * 4, c = colors ? colors[i] : [i, i, i];
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  };
  let at = f + 6;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = b[at];
      if (c === 0) { x += b[at + 1]; at += 2; } else if (c === 0xff) { for (let k = 0; k < b[at + 2]; k++) put(x++, y, b[at + 1]); at += 3; } else { for (let k = 0; k < c; k++) put(x++, y, b[at + 1 + k]); at += 1 + c; }
    }
  }
  return { width: w, height: h, data };
}
/* Frame i of the .ao at pos, as RGBA. colors is the .rgb's palette for an
   8-bit .ao. */
function ioAoFrame(b, ao, i, colors) {
  return ao.kind === 16 ? ioAo2cFrame(b, ao.frames[i]) : ioRle8Frame(b, ao.frames[i], colors);
}

/* An entry's kind by its name. */
function ioKind(name) {
  return { ao: 'animation', wav: 'sound', jpg: 'background', rgb: 'palette', lips: 'lip sync' }[name.split('.').pop().toLowerCase()] || 'other';
}

/* The game's files among a disc's or a folder's paths, by their path from
   the disc's top in lower case, with HD/ left off, so HD/rsc and rsc join:
   rsc/<bundle>.bul, scripts/<name>, win/<file> and rsc/<movie>.bik.
   Returns Map(key -> the entry given). */
function ioGameFiles(entries, pathOf) {
  const files = new Map();
  for (const e of entries) {
    const p = pathOf(e).replace(/\\/g, '/');
    const m = /(?:^|\/)(?:hd\/)?((?:rsc|scripts|win)\/[^/]+)$/i.exec(p);
    if (!m || /launcher/i.test(p)) continue;
    const k = m[1].toLowerCase();
    if (!files.has(k)) files.set(k, e);
  }
  return files;
}
/* Whether paths look like Island Odyssey's disc or its HD folder. */
function ioLooksLike(paths) {
  return paths.some(p => /(?:^|\/)z3common\.bul$/i.test(p.replace(/\\/g, '/')) || /(?:^|\/)zoombinis island odyssey\.exe$/i.test(p.replace(/\\/g, '/')));
}
/* A place's XML: its neighbors, its background's entry, its voices when
   the band is right and partly right, and its help by level, each a list of
   pages { text, voices }. */
function ioPlaceXml(text) {
  const all = (re, s) => [...s.matchAll(re)].map(m => m[1]);
  const one = (re, s) => (re.exec(s) || [])[1];
  const help = [];
  for (const lv of [1, 2, 3]) {
    const block = one(new RegExp(`<Level${lv}>([\\s\\S]*?)</Level${lv}>`), text) || '';
    help.push(all(/<Page>([\s\S]*?)<\/Page>/g, block).map(p => ({
      text: (one(/<text>([\s\S]*?)<\/text>/, p) || '').replace(/^\s*"|"\s*$/g, '').replace(/\s+/g, ' ').trim(),
      voices: (one(/<speechIDs>([\s\S]*?)<\/speechIDs>/, p) || '').trim().split(/\s+/).filter(Boolean),
    })));
  }
  const speech = (tag) => all(/<voiceol>\s*\w+\s+(\d+)\s*<\/voiceol>/g, one(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`), text) || '');
  return {
    neighbors: all(/<loc name="(\w+)"/g, text).map(s => s.toLowerCase()),
    background: one(/<background>(\d+)<\/background>/, text) || null,
    right: speech('Correct'),
    partly: speech('PartCorrect'),
    help,
  };
}

if (typeof module !== 'undefined') module.exports = {
  IO_PLACES, IO_PLACE_BY_KEY, IO_LEVELS, ioWavLength, ioJpegLength, ioAo2cEnd, ioRle8Length, ioAo, ioEntries,
  ioPalette, ioAo2cFrame, ioRle8Frame, ioAoFrame, ioKind, ioGameFiles, ioLooksLike, ioPlaceXml,
};
