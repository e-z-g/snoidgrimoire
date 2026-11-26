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
/* A .LIPS, as RCharacter::playSpeechUsingParts in trinket.dll reads it: three
   i16 (a word under 0x200 for little-endian, a word the program never reads,
   and the count), then for each record an i16 mouth shape and a u32, high word
   first, that grows by one step each record (16.16 fixed point). The program
   uses the shapes only, each as step shape + 1 of the speaker's lips
   animation, and a shape past its last frame as 0. */
function ioLips(b, start, end) {
  const order = ioI16(b, start), unread = ioI16(b, start + 2), n = ioI16(b, start + 4);
  if (order >= 0x200 || end - start !== 6 + 6 * n) throw new Error('a .LIPS that does not fit');
  const shapes = [], marks = [];
  for (let i = 0; i < n; i++) {
    const o = start + 6 + 6 * i;
    shapes.push(ioI16(b, o));
    marks.push(ioU16(b, o + 2) * 65536 + ioU16(b, o + 4));
  }
  return { unread, shapes, marks };
}
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

/* ---- Scripts ------------------------------------------------------------------

   A place's script (.mps) is compiled for tcx.dll's YThread, which reads it in
   YThread::load. A byte 2 (little-endian) or 1 (big-endian), then
     u32 n, and n tokens of u8 command and u16 value;
     u32 m, and m u16 words, lists of variable numbers each ending in 0xffff;
     u32 v, and v - 3 variables (YVariable::read): u32, u32 type (3 an integer,
     4 a number as u16 length and text), u32 count and u32 first item when the
     variable is a list, two u32, then u32 length and the name, u32 length and
     the text, u32 count and that many u16 words. A length of 0xffffffff is none.
   A variable's name is the text written in the source, a literal's too, so a
   statement prints back as its command and its list's names. */
function ioScript(b) {
  if (b[0] !== 1 && b[0] !== 2) throw new Error('not a compiled script');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), le = b[0] === 2;
  let at = 1;
  const u8 = () => b[at++];
  const u16 = () => { const x = v.getUint16(at, le); at += 2; return x; };
  const u32 = () => { const x = v.getUint32(at, le); at += 4; return x; };
  const text = (n) => { const s = new TextDecoder('windows-1252').decode(b.subarray(at, at + n)); at += n; return s; };
  const tokens = [];
  for (let i = u32(); i > 0; i--) tokens.push([u8(), u16()]);
  const words = [];
  for (let i = u32(); i > 0; i--) words.push(u16());
  const variables = [];
  for (let i = u32() - 3; i > 0; i--) {
    const x = { type: (u32(), u32()) };
    if (x.type === 3) x.value = v.getInt32((at += 4) - 4, le);
    else if (x.type === 4) x.value = Number(text(u16()));
    x.count = u32(); x.first = u32(); u32(); u32();
    for (const k of ['name', 'text']) { const n = u32(); x[k] = n === 0xffffffff ? null : text(n); }
    const n = u32();
    if (n !== 0xffffffff) at += 2 * n;
    variables.push(x);
  }
  if (at !== b.length) throw new Error(`script read to ${at} of ${b.length}`);
  return { tokens, words, variables };
}
/* The names in the list at a word offset. Variable i is variables[i - 3]. */
function ioScriptNames(s, offset) {
  const out = [];
  for (let i = offset; i < s.words.length && s.words[i] !== 0xffff; i++) {
    const x = s.variables[s.words[i] - 3];
    out.push(x && x.name !== null ? x.name : '#' + s.words[i]);
  }
  return out;
}
/* A list written name = [a b c]: the compiler makes its items as variables
   name.1, name.2 ... with their text set, and no statement (YThread::doClause).
   Returns the items' texts, or nested arrays for a list of lists. */
function ioScriptListItems(s, x) {
  const out = [];
  for (let i = x.first; i < x.first + x.count; i++) {
    const item = s.variables[i - 3];
    out.push(item.count && item.first ? ioScriptListItems(s, item) : item.text ?? '');
  }
  return out;
}
/* Every top-level list: Map(name -> items). */
function ioScriptLists(s) {
  const nested = new Set(), out = new Map();
  for (const x of s.variables) if (x.count && x.first) for (let i = x.first; i < x.first + x.count; i++) nested.add(i);
  s.variables.forEach((x, i) => { if (x.count && x.first && !nested.has(i + 3) && x.name) out.set(x.name, ioScriptListItems(s, x)); });
  return out;
}
/* The first statement name = value for each name whose value is one literal
   number: Map(name -> number). */
function ioScriptConstants(s) {
  const out = new Map();
  for (const [kind, value] of s.tokens) {
    if (kind !== 0x12) continue;
    const n = ioScriptNames(s, value);
    if (n.length === 2 && /^-?\d+$/.test(n[1]) && !out.has(n[0])) out.set(n[0], Number(n[1]));
  }
  return out;
}
/* The keywords of tcx.dll's table at 0x100332d0, by command. The compiler
   turns if, else, for, break, continue and procedure into jumps. */
const IO_SCRIPT_KEYWORDS = { 0x06: 'call', 0x0e: 'say', 0x13: 'drop', 0x16: 'wait', 0x17: 'idle', 0x18: 'schedule',
  0x19: 'exit', 0x1a: 'suspend', 0x1b: 'resume', 0x1c: 'pause', 0x1d: 'debug', 0x23: 'set', 0x24: 'get',
  0x25: 'yield', 0x28: 'play', 0x2d: 'relay', 0x2e: 'quit' };
/* The script as source: its lists, then its statements, with procedures,
   if, else and for rebuilt from the jumps. 0x12 is name = list, 0x15 a
   statement with no keyword, 0x7 a procedure to its 0xf, 0xc a condition
   with 0xa the jump past its block, 0x8 0x9 0xa a loop, 0xb a jump and 0xd
   a label. */
function ioScriptSource(s) {
  const t = s.tokens, lines = [];
  for (const [name, items] of ioScriptLists(s)) {
    const show = (l) => '[' + l.map(x => Array.isArray(x) ? show(x) : x).join(' ') + ']';
    lines.push(`${name} = ${show(items)}`);
  }
  const emit = (depth, text) => lines.push('    '.repeat(depth) + text);
  const list = (value) => ioScriptNames(s, value).join(' ');
  const block = (start, end, depth, loop) => {
    let i = start;
    while (i < end) {
      const [kind, value] = t[i];
      if (kind === 0x07) {
        let close = i + 1;
        while (close < t.length && t[close][0] !== 0x0f) close++;
        emit(depth, `procedure ${list(value)} [`);
        block(i + 1, close, depth + 1);
        emit(depth, ']');
        i = close + 1;
        continue;
      }
      if (kind === 0x0c && i + 1 < end && t[i + 1][0] === 0x0a) {
        const target = t[i + 1][1];
        emit(depth, `if ${list(value)} [`);
        if (t[target - 1][0] === 0x0b && target - 1 > i + 1 && t[target] && t[target][0] === 0x0d && t[target - 1][1] > target) {
          const after = t[target - 1][1];
          block(i + 2, target - 1, depth + 1, loop);
          emit(depth, '] else [');
          block(target + 1, after, depth + 1, loop);
          i = after;
        } else {
          block(i + 2, target, depth + 1, loop);
          i = target;
        }
        emit(depth, ']');
        continue;
      }
      if (kind === 0x08 && i + 2 < end && t[i + 1][0] === 0x09 && t[i + 2][0] === 0x0a) {
        const after = t[i + 2][1];
        emit(depth, `for ${list(value)} [`);
        block(i + 3, after - 1, depth + 1, [i + 1, after]);
        emit(depth, ']');
        i = after;
        continue;
      }
      if (kind === 0x0b) emit(depth, loop && value === loop[0] ? 'continue' : loop && value === loop[1] ? 'break' : `jump ${value}`);
      else if (kind === 0x12) { const n = ioScriptNames(s, value); emit(depth, `${n[0]} = ${n.slice(1).join(' ')}`); }
      else if (kind === 0x15) emit(depth, list(value));
      else if (IO_SCRIPT_KEYWORDS[kind]) emit(depth, `${IO_SCRIPT_KEYWORDS[kind]} ${list(value)}`.trimEnd());
      else if (kind !== 0x0d) emit(depth, `?${kind.toString(16)} ${list(value)}`);
      i++;
    }
  };
  block(0, t.length, 0);
  return lines.join('\n');
}

/* ---- Characters -------------------------------------------------------------

   The program, "Zoombinis Island Odyssey.exe", registers three kinds of
   character (RAttributeCharacter) at start-up with three `push <record>; call`
   in a row to one function (0x40c9a0, at 0x409610). A record has the kind at
   +0x00 (0 a Zoombini, 1 a Zerble, 2 a Zoombini with a caterpillar), the
   character's point at +0x04 and +0x08, the number of traits at +0x0c and the
   traits at +0x10 (each u32 values, u32 draw order and u32 base), the trait
   whose value picks a block of animations at +0x2c, the number of facings at
   +0x38 and the facings at +0x3c (each u32 base and u32 angle), and the
   block's length, an i16, at +0x46. The workbench's io_snoid.py reads the same. */
function ioCharacterKinds(exe) {
  const pe = ioU32(exe, 0x3c), count = ioU16(exe, pe + 6), optional = ioU16(exe, pe + 20), image = ioU32(exe, pe + 52);
  const sections = [];
  for (let i = 0; i < count; i++) {
    const o = pe + 24 + optional + 40 * i;
    sections.push({ va: image + ioU32(exe, o + 12), raw: ioU32(exe, o + 20), size: ioU32(exe, o + 16), code: (ioU32(exe, o + 36) & 0x20) !== 0 });
  }
  const at = va => { for (const s of sections) if (va >= s.va && va < s.va + s.size) return s.raw + va - s.va; return -1; };
  const inData = va => sections.some(s => !s.code && va >= s.va && va < s.va + s.size);
  const i32 = o => ioU32(exe, o) | 0;
  for (const s of sections.filter(s => s.code)) {
    for (let i = s.raw; i < s.raw + s.size - 30; i++) {
      const rows = [];
      for (let k = 0; k < 3; k++) {
        const o = i + 10 * k;
        if (exe[o] !== 0x68 || exe[o + 5] !== 0xe8) break;
        rows.push([ioU32(exe, o + 1), (s.va + o - s.raw + 10 + i32(o + 6)) >>> 0]);
      }
      if (rows.length < 3 || new Set(rows.map(r => r[1])).size !== 1 || !rows.every(r => inData(r[0]))) continue;
      return rows.map(([va]) => {
        const r = at(va), ta = at(ioU32(exe, r + 0x10)), da = at(ioU32(exe, r + 0x3c)), nt = i32(r + 0xc);
        const anims = (ptr, n) => Array.from({ length: n }, (_, k) => {
          const o = at(ptr) + 12 * k, mask = ioU32(exe, o + 8);
          return { base: i32(o), block: i32(o + 4), mask: mask ? Array.from({ length: nt }, (_, t) => i32(at(mask) + 4 * t)) : null };
        });
        const poses = Array.from({ length: i32(r + 0x24) }, (_, k) => {
          const o = at(ioU32(exe, r + 0x28)) + 12 * k, list = ioU32(exe, o + 8);
          const fidgets = Array.from({ length: i32(o + 4) }, (_, j) => {
            const f = at(list) + 16 * j;
            return { seconds: [i32(f), i32(f + 4)], anims: anims(ioU32(exe, f + 12), i32(f + 8)) };
          });
          return { base: i32(o), fidgets };
        });
        return {
          kind: i32(r), point: [i32(r + 4), i32(r + 8)],
          traits: Array.from({ length: nt }, (_, t) => [0, 4, 8].map(k => i32(ta + 12 * t + k))),
          block: i32(r + 0x2c), length: ioI16(exe, r + 0x46),
          facings: Array.from({ length: i32(r + 0x38) }, (_, f) => [i32(da + 8 * f), i32(da + 8 * f + 4)]),
          poses,
        };
      }).sort((a, b) => a.kind - b.kind);
    }
  }
  throw new Error('no kinds of character in this program');
}
/* A character's parts, as z3common's animation ids, in draw order (0x40d5e0).
   A part is the facing's base + the trait's base + its value + the block
   trait's value × the block's length. For the block trait the part is the
   facing's base + the trait's base + its value × the length. */
function ioCharacterParts(kind, facing, values) {
  const base = kind.facings[facing][0], b = kind.block;
  return kind.traits.map(([, order, tbase], t) => [order, t === b ? base + tbase + values[t] * kind.length : base + tbase + values[t] + values[b] * kind.length])
    .sort((x, y) => x[0] - y[0]).map(x => x[1]);
}
/* A part of a fidget's animation for trait t (0x40d5e0), or null where its
   mask leaves the trait out. */
function ioAnimPart(kind, anim, values, t) {
  if (anim.mask && !anim.mask[t]) return null;
  const tbase = kind.traits[t][2], b = anim.block;
  if (b < 0) return anim.base + tbase + values[t];
  if (b === t) return anim.base + tbase + values[t] * kind.length;
  return anim.base + tbase + values[t] + values[b] * kind.length;
}
/* A standing pose's parts in draw order, each [trait, id, from the fidget].
   A pose's part is its base + the trait's base + the value (0x40d5b0). A
   fidget's animation, given as [fidget, animation], replaces the pose's parts
   for the traits it covers (0x40cab0, 0x40d3f0). One fidget of the Zerble has
   two animations, and whether the program draws both or picks one is unread,
   so an animation is drawn alone. */
function ioPoseParts(kind, pose, values, fidget) {
  const p = kind.poses[pose];
  return kind.traits.map(([, order, tbase], t) => {
    let id = p.base + tbase + values[t], own = false;
    if (fidget) { const a = ioAnimPart(kind, p.fidgets[fidget[0]].anims[fidget[1]], values, t); if (a !== null) { id = a; own = true; } }
    return [order, t, id, own];
  }).sort((x, y) => x[0] - y[0]).map(x => x.slice(1));
}
/* The steps of a sequence that draw a frame. */
const ioDrawnSteps = a => a.sequences[0].filter(s => s[2] >= 0);
/* A pose drawn, or a fidget's step over it: a pose's part at its first step
   that draws a frame, a fidget's part at its step-th such step. */
function ioPoseDraw(bul, kind, parts, aos, step, mirror) {
  const pieces = [];
  for (const [, id, own] of parts) {
    const a = aos.get(id);
    if (!a) continue;
    const s = ioDrawnSteps(a)[own ? step : 0];
    if (!s) continue;
    pieces.push([a.points[0][0] + s[0], a.points[0][1] + s[1], ioAoFrame(bul, a, s[2])]);
  }
  return ioCharacterPlace(kind, pieces, mirror);
}
/* The number of steps of a fidget, the longest of its parts'. */
function ioFidgetSteps(parts, aos) {
  let n = 0;
  for (const [, id, own] of parts) if (own && aos.get(id)) n = Math.max(n, ioDrawnSteps(aos.get(id)).length);
  return n;
}
/* One drawing over another as Pillow's Image.alpha_composite draws it, so the
   check can compare pixels with io_snoid.py (libImaging/AlphaComposite.c). */
function ioAlphaOver(dst, dw, src, sw, sh, x0, y0) {
  const div255 = a => (((a >> 8) + a) >> 8);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const s = 4 * (y * sw + x), d = 4 * ((y + y0) * dw + x + x0), sa = src[s + 3];
    if (!sa) continue;
    const outa255 = sa * 255 + dst[d + 3] * (255 - sa);
    const coef1 = Math.floor(sa * 255 * 255 * 128 / outa255), coef2 = 255 * 128 - coef1;
    for (let c = 0; c < 3; c++) dst[d + c] = div255(src[s + c] * coef1 + dst[d + c] * coef2 + (0x80 << 7)) >> 7;
    dst[d + 3] = div255(outa255 + 0x80);
  }
}
/* Each part's .ao: Map(id -> ioAo) from z3common's bytes and entries by name. */
function ioCharacterAos(bul, byName, ids) {
  const out = new Map();
  for (const id of ids) { const e = byName.get(`${id}.ao`); if (e) out.set(id, ioAo(bul, e.start)); }
  return out;
}
/* The number of steps in a character's walk, the longest part's sequence. */
function ioCharacterSteps(aos) {
  let n = 0;
  for (const a of aos.values()) n = Math.max(n, a.sequences[0].length);
  return n;
}
/* One step of a character drawn: each part's frame at its point plus the
   step's x and y (OMAnimation::processFrame in tcx.dll), in draw order. A
   step's frame counts from 0, and a negative frame is a command. Mirrored,
   the drawing turns about the character's x (0x40e7f0). Returns { left, top,
   width, height, data } in RGBA, or null when no part draws. */
function ioCharacterDraw(bul, kind, ids, aos, step, mirror) {
  const pieces = [];
  for (const id of ids) {
    const a = aos.get(id);
    if (!a) continue;
    const s = a.sequences[0][step];
    if (!s || s[2] < 0) continue;
    pieces.push([a.points[0][0] + s[0], a.points[0][1] + s[1], ioAoFrame(bul, a, s[2])]);
  }
  return ioCharacterPlace(kind, pieces, mirror);
}
/* Pieces [x, y, frame] put on one drawing in order, mirrored about the
   character's x when mirror is set. */
function ioCharacterPlace(kind, pieces, mirror) {
  if (!pieces.length) return null;
  const x0 = Math.min(...pieces.map(p => p[0])), y0 = Math.min(...pieces.map(p => p[1]));
  const x1 = Math.max(...pieces.map(p => p[0] + p[2].width)), y1 = Math.max(...pieces.map(p => p[1] + p[2].height));
  const width = x1 - x0, height = y1 - y0;
  let data = new Uint8ClampedArray(4 * width * height);
  for (const [x, y, f] of pieces) ioAlphaOver(data, width, f.data, f.width, f.height, x - x0, y - y0);
  let left = x0;
  if (mirror) {
    const m = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) m[4 * (y * width + x) + c] = data[4 * (y * width + width - 1 - x) + c];
    data = m;
    left = 2 * kind.point[0] - x1;
  }
  return { left, top: y0, width, height, data };
}

/* ---- Puzzles ------------------------------------------------------------------

   Each puzzle is a class in the program, "Zoombinis Island Odyssey.exe"
   (RCatapultGame, RGlyphGame, RPlanetariumGame, Greenhouse, RGardenGame,
   RCorralGame, RBarnGame), which the place's script makes and sets up. The
   rules below are read from the program's code, decompiled with Ghidra, with
   the addresses in the workbench's doc/ISLAND-ODYSSEY.md, "The puzzles". The
   settings by level are the lists in each place's script, which the page
   reads from the disc (`settings`: a label and a list's name). */
const IO_PUZZLES = {
  z3a1: {
    rules: [
      'Each round is one of 13 machines, and the script deals one at random, more often one not played since all 13 were. Machines 1 to 5 have the first set of gears, 6 to 9 the second and 10 to 13 the third. The first round ever at Not So Hard is machine 9.',
      'The big wheel has 2, 3 or 4 buckets by machine (2, 3, 3, 3, 4, 3, 3, 3, 4, 2, 3, 3, 4). On machines 3, 4, 7, 8, 11 and 12 the three buckets stand a quarter turn apart, as if for four, with one place empty.',
      'Each part of the machine is an animation that steps once a tick. The items roll down the chute in the order set, each stopping while it touches the one ahead, and the front one waits at the foot. The wheel turns in 36, 72 or 108 frames by gear set, and the waiting item drops into a bucket as the bucket passes the catch frame, so an item leaves the chute every turn ÷ buckets frames, with a double gap where a bucket is missing. The item rides the bucket and is thrown off the far side.',
      'A flap goes down and up on a cycle of 72 to 144 frames, set by the machine\'s pace (one pace at Not So Hard). A thrown item reaches the paddle only while the flap is down, in one of three windows of the cycle, and otherwise falls into the sea. At Not So Hard the windows are frames 1 to 8, 26 to 42 and 59 to 72 of 72. Which places in the order reach the paddle depends on the flight\'s time and the cycles\' first frames, which are unread.',
      'There is one item for each Zoombini, 12 at most. A boulder that reaches the paddle launches the next Zoombini. A mudball that lands there, or anything that misses, uses its item up.',
    ],
    settings: [],
  },
  z3a2: {
    rules: [
      'The wall shows its glyphs in two rows. Each glyph stands for one of 10 values, and every value is on the wall at least once, the rest at random. The tiles show characters, and a pairing of the 10 characters with the 10 glyphs, dealt at random each time, links the two.',
      'Each of the 12 tiles copies one stretch of the wall, as many glyphs long as the tile has characters. The glyphs left over are gaps between the stretches, placed at random. Where the gaps leave room, the stretches of 3 tiles picked at random are copied into them, so each of those tiles matches two places on the wall. A tile in its place matches the wall, and a tile in the wrong place uses up one of the wrong tries.',
    ],
    settings: [['Characters on a tile', 'kGameCharCountPerTileList'], ['Glyphs on the wall', 'kGameGlyphCountList'], ['Grouped, with indentations', 'kGameDoClusterList'], ['Wrong tiles allowed', 'kGameWrongTriesList']],
  },
  z3a3: {
    rules: [
      'The target is an hour from 0 to 23 and, where the level has a date, a day of the moon\'s 28. Each exhibit starts at another hour, and the Sun exhibit at one of 12 hours, the daylight ones, except where the moon shows. With the moon, the Sun exhibit starts outside a stretch of hours set by the moon\'s day.',
      'Each exhibit has hour coins of 4, 5, 5, 7, 10 and 10. Those make every gap from its start to the target, counting once around the clock, except 18 and 23 hours, and for those the exhibit has 4, 5, 7, 7, 10 and 10 instead. Not So Hard adds a 1 and a 2. With a date, each exhibit also has day bills of 1, 4, 5, 5, 7, 10 and 10, which make every gap of days.',
      'Without a date, Oh So Hard shows the moon at one of its four main phases, day 0, 7, 14 or 21.',
    ],
    settings: [['A target date', 'kDoTargetDayList'], ['The moon shown', 'kShowMoonList'], ['Coins of 1 and 2 added', 'kAddHelperSetList']],
  },
  z3a4: {
    rules: [
      'The greenhouse is 12 rows of 12 plants. A plant has three traits, color with 3 values and two more with 4 and 5 values, or 6 and 6 at Very Very Hard. Each trait\'s layout is a template from the disc\'s z3a4data.xml, turned one of four ways at random. Where the template has a blank, the plant\'s value is random.',
      'There are 12 moths, one for each value of the two traits besides color, 4 + 5 or 6 + 6, and each matches every plant with its value.',
      'Above Not So Hard the program breaks the paths with 20 random swaps of two plants, and at Very Very Hard only two plants of one color swap. The wand has 30 swaps. At Very Very Hard a beetle comes in 10 seconds after the start and then every 8 seconds, at one of the three columns the template lists, and follows the color of the plant there.',
    ],
    settings: [],
  },
  z3a5: {
    rules: [
      'The garden is 4 holes in a row at Not So Hard, 4 rows of 4 at Oh So Hard, and four plots of 4 rows of 4 at Very Very Hard. A plant has four traits (roots, stalks, leaves and flowers) of four values each.',
      'One trait, picked at random, goes with the columns. From Oh So Hard another goes with the rows, and at Very Very Hard one of the last two with the plots. The first plant set in a column fixes that trait\'s value for the column, and no other column may have it. Rows and plots work the same way. A plant that clashes with what is fixed bounces out, and the traits tied to no line never matter.',
    ],
    settings: [],
  },
  z3a6: {
    rules: [
      'There are 12 berries, each a shape, a color and a leaf from 4 values, dealt at random and all different. The program compares two berries by the product of their three values plus one each, so two berries with the same values in another order also count as alike, and the deal draws again.',
      'Each Zerble is dealt one of the berries at random as the one it eats, and its feet and tail at random, so its looks say nothing of its berry. The projectors show the three traits in a random order, which matters at Very Very Hard, where they are unlabeled.',
      'A beam projects one trait\'s value from the berry set in its projector, and a Zerble stands in every beam whose value is in the berry dealt to the Zerble. So the overlaps sort the Zerbles by their berries. At Not So Hard a Zerble eats a berry that has the dealt berry\'s values in the two projected traits, and at the higher levels in all three.',
    ],
    settings: [],
  },
  z3a7: {
    rules: [
      'The Zerbles come in pairs, one for every two Zoombinis, and the answer is a random matching of the two pens. The machine\'s target is the young of the next pair in that matching. The target is about the feet at the first two levels and the tail at Very Very Hard, and the x-ray stones show the genes at Not So Hard only. A Zerble\'s traits are dealt at random.',
      'A Zerble has two genes for the target\'s trait, the one shown and a hidden one, and its four young are the four pairings of one gene from each parent. Two genes alike give that gene. Two that differ give the winner of a cycle, where 1 beats 2, 2 beats 3 and 3 beats 1, counting the values from 1. The hidden gene is the shown one a quarter of the time and otherwise the next value in the cycle, so the gene shown always beats the hidden one.',
    ],
    settings: [['The target\'s trait (1 feet, 2 tail)', 'kTargetTrait'], ['Genes shown', 'kShowZerbleGenes'], ['Tries, by pairs (1 to 6)', 'kMaxTurnsList']],
  },
};

if (typeof module !== 'undefined') module.exports = {
  IO_PLACES, IO_PLACE_BY_KEY, IO_LEVELS, IO_PUZZLES, ioWavLength, ioJpegLength, ioAo2cEnd, ioRle8Length, ioAo, ioEntries,
  ioPalette, ioAo2cFrame, ioRle8Frame, ioAoFrame, ioKind, ioGameFiles, ioLooksLike, ioPlaceXml,
  ioScript, ioScriptNames, ioScriptLists, ioScriptConstants, ioScriptSource,
  ioLips, ioCharacterKinds, ioCharacterParts, ioCharacterAos, ioCharacterSteps, ioCharacterDraw,
  ioPoseParts, ioPoseDraw, ioFidgetSteps,
};
