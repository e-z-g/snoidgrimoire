/* zb-unity.js -- the 2015 remake's Unity files: a SerializedFile's header,
   its types, objects and external files, and an object read by its class's
   type tree (zb-unity-types.js), with the sounds' FSB5 banks and the plain
   texture formats.
   Read:
   a SerializedFile starts with four big-endian words (metadata size, file
   size, format, data offset), then from format 9 an endian byte and three
   reserved, and from format 22 the sizes again as 32, 64, 64 and 64 bits.
   The metadata follows, little-endian in the remake: the Unity version, the
   platform, whether type trees are stored, the types (class id, stripped,
   script index, script hash for class 114, type hash), the objects (path
   id aligned to 4, start, size, type index), the script types, the
   external files, the reference types and a user string. Each object's
   bytes are at the data offset plus its start.
   The remake's files store no type trees, so an object is read by its
   class's tree for Unity 6000.0.63, with a field aligned to 4 after it
   where the tree marks it. The fields after a MonoBehaviour's header need
   its script's layout, so only the header is read (its object, enabled,
   script, name).
   Bulk data is in side files: a texture's in a StreamingInfo (offset,
   size, path), a sound's in a StreamedResource (source, offset, size).
   The path's last part is a file beside the others.
   FSB5 (a sound's bank): "FSB5", version, sample count, sample header
   size, name table size, data size, codec, then 32 bytes at version 1
   (36 at version 0). Each sample's header is a 64-bit word: bit 0 more
   chunks, bits 1-4 the rate's index, bit 5 stereo, bits 6-33 the data's
   offset in 16-byte units, bits 34-63 the sample count. Each chunk is a
   word: bit 0 more, bits 1-24 size, bits 25-31 type (1 channels, 2 rate,
   11 Vorbis, whose first word is the CRC-32 of the sound's setup header).
   Codecs: 1 PCM 8-bit, 2 PCM 16-bit, 15 Vorbis.
   WHERE IT CAME FROM
   UnityPy (SerializedFile.py, ObjectReader.py, TypeTreeHelper.py), and
   vgmstream's fsb5.c for FSB5, checked against UnityPy over every object
   of the iPhone build (utilities/remake.mjs).
   =========================================================================
   Pure: bytes in, data out. Used by page-unity.js. */

const ZB_UNITY_CLASSES = {
  1: 'GameObject', 4: 'Transform', 21: 'Material', 28: 'Texture2D', 43: 'Mesh', 48: 'Shader',
  49: 'TextAsset', 74: 'AnimationClip', 83: 'AudioClip', 90: 'Avatar', 91: 'AnimatorController',
  95: 'Animator', 114: 'MonoBehaviour', 115: 'MonoScript', 128: 'Font', 142: 'AssetBundle',
  147: 'ResourceManager', 150: 'PreloadData', 212: 'SpriteRenderer', 213: 'Sprite',
  222: 'CanvasRenderer', 223: 'Canvas', 224: 'RectTransform', 225: 'CanvasGroup',
};
const ZB_UNITY_TEXTURE_FORMATS = {
  1: 'Alpha8', 2: 'ARGB4444', 3: 'RGB24', 4: 'RGBA32', 5: 'ARGB32', 10: 'DXT1', 12: 'DXT5', 13: 'RGBA4444',
  30: 'PVRTC RGB2', 31: 'PVRTC RGBA2', 32: 'PVRTC RGB4', 33: 'PVRTC RGBA4',
  48: 'ASTC RGB 4×4', 49: 'ASTC RGB 5×5', 50: 'ASTC RGB 6×6', 51: 'ASTC RGB 8×8', 52: 'ASTC RGB 10×10', 53: 'ASTC RGB 12×12',
  54: 'ASTC RGBA 4×4', 55: 'ASTC RGBA 5×5', 56: 'ASTC RGBA 6×6', 57: 'ASTC RGBA 8×8', 58: 'ASTC RGBA 10×10', 59: 'ASTC RGBA 12×12',
};
const ZB_UNITY_ASTC_BLOCKS = [4, 5, 6, 8, 10, 12];

function zbUnityClassName(id) { return ZB_UNITY_CLASSES[id] || `class ${id}`; }

/* The bytes a reader needs before it can read the metadata, from the
   first 48: the data offset, or 0 when they are no SerializedFile. */
function zbUnityHeaderSize(head) {
  if (head.length < 48) return 0;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const format = v.getUint32(8);
  if (format < 9 || format > 40) return 0;
  if (format >= 22) {
    const offset = Number(v.getBigUint64(32));
    return offset > 48 && offset < 1 << 28 ? offset : 0;
  }
  const offset = v.getUint32(12);
  return offset > 20 && offset < 1 << 28 ? offset : 0;
}

/* A byte reader over a DataView. */
function zbUnityReader(bytes, little) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const r = {
    p: 0, little, bytes,
    u8() { return bytes[r.p++]; },
    i16() { const x = v.getInt16(r.p, little); r.p += 2; return x; },
    u16() { const x = v.getUint16(r.p, little); r.p += 2; return x; },
    i32() { const x = v.getInt32(r.p, little); r.p += 4; return x; },
    u32() { const x = v.getUint32(r.p, little); r.p += 4; return x; },
    f32() { const x = v.getFloat32(r.p, little); r.p += 4; return x; },
    f64() { const x = v.getFloat64(r.p, little); r.p += 8; return x; },
    i64() { const x = v.getBigInt64(r.p, little); r.p += 8; return Number(x); },
    u64() { const x = v.getBigUint64(r.p, little); r.p += 8; return Number(x); },
    take(n) { if (r.p + n > bytes.length) throw new Error('past the end'); const x = bytes.subarray(r.p, r.p + n); r.p += n; return x; },
    cstr() { let e = r.p; while (e < bytes.length && bytes[e]) e++; const s = new TextDecoder().decode(bytes.subarray(r.p, e)); r.p = e + 1; return s; },
    align() { r.p = (r.p + 3) & ~3; },
  };
  return r;
}

/* The metadata: { format, unityVersion, platform, typeTrees, dataOffset,
   types: [{ classId, scriptIndex }], objects: [{ pathId, start, size,
   classId, type }], externals: [path] }. `head` is the file's first
   zbUnityHeaderSize bytes. */
function zbUnityParse(head) {
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const format = v.getUint32(8);
  let p = 16;
  const little = head[p] === 0;
  p += 4;
  let dataOffset = v.getUint32(12);
  if (format >= 22) { dataOffset = Number(v.getBigUint64(32)); p = 48; }
  const r = zbUnityReader(head, little);
  r.p = p;
  const unityVersion = r.cstr(), platform = r.i32(), typeTrees = !!r.u8();
  if (typeTrees) throw new Error('This file stores type trees, which this reader does not read.');
  const types = [];
  for (let n = r.i32(), i = 0; i < n; i++) {
    const classId = r.i32();
    r.u8();
    const scriptIndex = r.i16();
    if (classId === 114) r.take(16);
    r.take(16);
    types.push({ classId, scriptIndex });
  }
  const objects = [];
  for (let n = r.i32(), i = 0; i < n; i++) {
    r.align();
    const pathId = r.i64(), start = format >= 22 ? r.i64() : r.u32(), size = r.u32(), type = r.i32();
    objects.push({ pathId, start, size, type, classId: types[type] ? types[type].classId : -1 });
  }
  for (let n = r.i32(), i = 0; i < n; i++) { r.i32(); r.align(); r.i64(); }
  const externals = [];
  for (let n = r.i32(), i = 0; i < n; i++) { r.cstr(); r.take(16); r.i32(); externals.push(r.cstr()); }
  return { format, unityVersion, platform, little, typeTrees, dataOffset, types, objects, externals };
}

/* One value read by a type-tree node [type, name, align, children]. */
function zbUnityValue(r, node) {
  const [type, name, align, kids] = node;
  let out;
  switch (type) {
    case 'bool': out = !!r.u8(); break;
    case 'SInt8': out = (r.u8() << 24) >> 24; break;
    case 'UInt8': case 'char': out = r.u8(); break;
    case 'SInt16': case 'short': out = r.i16(); break;
    case 'UInt16': case 'unsigned short': out = r.u16(); break;
    case 'int': case 'SInt32': out = r.i32(); break;
    case 'unsigned int': case 'UInt32': case 'Type*': out = r.u32(); break;
    case 'float': out = r.f32(); break;
    case 'double': out = r.f64(); break;
    case 'SInt64': case 'long long': out = r.i64(); break;
    case 'UInt64': case 'unsigned long long': case 'FileSize': out = r.u64(); break;
    case 'string': {
      const n = r.i32();
      // A text asset's script may be binary, so it stays as bytes.
      out = name === 'm_Script' ? r.take(n) : new TextDecoder().decode(r.take(n));
      if (kids && kids[0][2]) r.align();
      break;
    }
    case 'TypelessData': out = r.take(r.i32()); break;
    case 'pair': out = [zbUnityValue(r, kids[0]), zbUnityValue(r, kids[1])]; break;
    default:
      if (kids && kids.length === 1 && kids[0][0] === 'Array') {
        const arr = kids[0], item = arr[3][1], n = r.i32();
        if (item[0] === 'UInt8' || item[0] === 'char') out = r.take(n);
        else { out = []; for (let i = 0; i < n; i++) out.push(zbUnityValue(r, item)); }
        if (arr[2]) r.align();
      } else {
        out = {};
        for (const k of kids || []) out[k[1]] = zbUnityValue(r, k);
      }
  }
  if (align) r.align();
  return out;
}

/* An object's fields, or null where its class has no tree here. A
   MonoBehaviour gives its header only. `bytes` are that object's bytes
   alone. */
function zbUnityRead(sf, obj, bytes) {
  const r = zbUnityReader(bytes, sf.little);
  if (obj.classId === 114) {
    const pptr = () => ({ m_FileID: r.i32(), m_PathID: r.i64() });
    const m_GameObject = pptr(), m_Enabled = !!r.u8();
    r.align();
    const m_Script = pptr(), n = r.i32(), m_Name = new TextDecoder().decode(r.take(n));
    r.align();
    return { m_GameObject, m_Enabled, m_Script, m_Name, rest: bytes.subarray(r.p) };
  }
  const tree = ZB_UNITY_TYPES[obj.classId];
  if (!tree) return null;
  const out = zbUnityValue(r, tree);
  if (r.p !== bytes.length) throw new Error(`${zbUnityClassName(obj.classId)} ${obj.pathId}: read ${r.p} of ${bytes.length} bytes`);
  return out;
}

/* A MonoBehaviour's fields after its header (`rest`), read by its script
   class's layout in `layouts`, the table zbIl2cppLayouts (zb-il2cpp.js)
   builds. Throws when the class has no layout or the read does not end at
   the end of `rest`. */
function zbUnityScriptFields(layouts, className, rest, little = true) {
  if (!layouts[className]) throw new Error(`no layout for ${className}`);
  const r = zbUnityReader(rest, little);
  r.layouts = layouts;
  const out = zbUnityLayout(r, className, 1);
  if (r.p !== rest.length) throw new Error(`${className}: read ${r.p} of ${rest.length} bytes`);
  return out;
}

/* One class's fields by its layout, its base's first. Unity serializes
   classes at most ZB_UNITY_DEPTH deep, so a deeper one is left out. */
const ZB_UNITY_DEPTH = 10;
function zbUnityLayout(r, key, depth) {
  const [base, ...fields] = r.layouts[key];
  const out = base ? zbUnityLayout(r, base, depth) : {};
  for (const f of fields) {
    const at = f.indexOf(' '), v = zbUnityField(r, f.slice(at + 1), depth);
    if (v !== undefined) out[f.slice(0, at)] = v;
  }
  return out;
}

function zbUnityField(r, type, depth) {
  if (type.endsWith('[]')) {
    const item = type.slice(0, -2);
    if (r.layouts[item] && depth >= ZB_UNITY_DEPTH) return undefined;
    const n = r.i32();
    if (n < 0 || n > r.bytes.length - r.p) throw new Error(`an array of ${n} at ${r.p - 4}`);
    const out = [];
    for (let i = 0; i < n; i++) out.push(zbUnityField(r, item, depth + 1));
    r.align();
    return out;
  }
  switch (type) {
    case 'bool': { const x = !!r.u8(); r.align(); return x; }
    case 'u8': { const x = r.u8(); r.align(); return x; }
    case 'i8': { const x = (r.u8() << 24) >> 24; r.align(); return x; }
    case 'u16': { const x = r.u16(); r.align(); return x; }
    case 'i16': { const x = r.i16(); r.align(); return x; }
    case 'i32': return r.i32();
    case 'u32': return r.u32();
    case 'i64': return r.i64();
    case 'u64': return r.u64();
    case 'f32': return r.f32();
    case 'f64': return r.f64();
    case 'str': { const x = new TextDecoder().decode(r.take(r.i32())); r.align(); return x; }
    case 'ptr': return { m_FileID: r.i32(), m_PathID: r.i64() };
  }
  if (depth >= ZB_UNITY_DEPTH) return undefined;
  return zbUnityLayout(r, type, depth + 1);
}

/* The last part of a side file's path ("archive:/x/sharedassets0.assets.resS"). */
function zbUnitySideName(path) { return String(path || '').split('/').pop(); }

/* A texture's pixels as top-down RGBA, for the plain formats, ASTC, PVRTC
   and DXT, or null. Alpha8 is black with its alpha, as UnityPy gives it,
   and a 4-bit component c is 17c. */
function zbUnityTexturePixels(format, width, height, data) {
  const n = width * height, rgba = new Uint8ClampedArray(n * 4);
  let decoded = null;
  if (format >= 48 && format <= 59) {
    const b = ZB_UNITY_ASTC_BLOCKS[(format - 48) % 6];
    if (data.length < Math.ceil(width / b) * Math.ceil(height / b) * 16) return null;
    decoded = zbAstcDecode(data, width, height, b, b);
  } else if (format >= 30 && format <= 33) {
    decoded = zbPvrtcDecode(data, width, height, format < 32);
  } else if (format === 10 || format === 12) {
    decoded = zbDxtDecode(data, width, height, format === 12);
    if (!decoded) return null;
  }
  if (decoded) {
    for (let y = 0; y < height; y++) rgba.set(decoded.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    return { width, height, rgba };
  }
  const bpp = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 13: 2 }[format];
  if (!bpp || data.length < n * bpp) return null;
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * width, to = y * width;
    for (let x = 0; x < width; x++) {
      const s = (from + x) * bpp, d = (to + x) * 4;
      if (format === 1) rgba[d + 3] = data[s];
      else if (format === 3) { rgba[d] = data[s]; rgba[d + 1] = data[s + 1]; rgba[d + 2] = data[s + 2]; rgba[d + 3] = 255; }
      else if (format === 4) { rgba[d] = data[s]; rgba[d + 1] = data[s + 1]; rgba[d + 2] = data[s + 2]; rgba[d + 3] = data[s + 3]; }
      else if (format === 2 || format === 13) {
        // A 16-bit word, little endian, of four nibbles: A R G B or R G B A from the top.
        const w = data[s] | (data[s + 1] << 8), n = k => ((w >> (4 * k)) & 15) * 17;
        if (format === 2) { rgba[d] = n(2); rgba[d + 1] = n(1); rgba[d + 2] = n(0); rgba[d + 3] = n(3); }
        else { rgba[d] = n(3); rgba[d + 1] = n(2); rgba[d + 2] = n(1); rgba[d + 3] = n(0); }
      }
      else { rgba[d] = data[s + 1]; rgba[d + 1] = data[s + 2]; rgba[d + 2] = data[s + 3]; rgba[d + 3] = data[s]; }
    }
  }
  return { width, height, rgba };
}

const ZB_FSB_RATES = [4000, 8000, 11000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 96000];
const ZB_FSB_CODECS = { 1: 'PCM 8-bit', 2: 'PCM 16-bit', 15: 'Vorbis' };

/* An FSB5 bank: { codec, samples: [{ name, rate, channels, count, data }] }. */
function zbFsbRead(bytes) {
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'FSB5') throw new Error('not an FSB5 bank');
  const r = zbUnityReader(bytes, true);
  r.p = 4;
  const version = r.u32(), count = r.u32(), headerSize = r.u32(), nameSize = r.u32(), dataSize = r.u32(), codec = r.u32();
  const base = version === 0 ? 0x40 : 0x3c;
  r.p = base;
  const samples = [];
  for (let i = 0; i < count; i++) {
    const lo = r.u32(), hi = r.u32();
    const word = BigInt(lo) | (BigInt(hi) << 32n);
    let setupCrc = null, more = Number(word & 1n), rate = ZB_FSB_RATES[Number((word >> 1n) & 15n)], channels = Number((word >> 5n) & 1n) + 1;
    const offset = Number((word >> 6n) & 0xfffffffn) * 16, samplesCount = Number(word >> 34n);
    while (more) {
      const c = r.u32();
      more = c & 1;
      const size = (c >>> 1) & 0xffffff, type = c >>> 25, at = r.p;
      if (type === 1) channels = r.u8();
      else if (type === 2) rate = r.u32();
      else if (type === 11) setupCrc = r.u32();
      r.p = at + size;
    }
    samples.push({ rate, channels, count: samplesCount, offset, name: '', setupCrc });
  }
  const names = base + headerSize, data = names + nameSize;
  if (nameSize) {
    r.p = names;
    const offs = samples.map(() => r.u32());
    samples.forEach((s, i) => { r.p = names + offs[i]; s.name = r.cstr(); });
  }
  samples.forEach((s, i) => {
    const end = i + 1 < samples.length ? samples[i + 1].offset : dataSize;
    s.data = bytes.subarray(data + s.offset, data + end);
  });
  return { codec, codecName: ZB_FSB_CODECS[codec] || `codec ${codec}`, samples };
}

/* A PCM sample as a WAV file, or null for another codec. */
function zbFsbWav(bank, s) {
  const bits = bank.codec === 1 ? 8 : bank.codec === 2 ? 16 : 0;
  if (!bits) return null;
  const frames = Math.min(s.count, Math.floor(s.data.length / (s.channels * bits / 8)));
  const size = frames * s.channels * bits / 8, out = new Uint8Array(44 + size), v = new DataView(out.buffer);
  const tag = (p, t) => { for (let i = 0; i < 4; i++) out[p + i] = t.charCodeAt(i); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + size, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, s.channels, true);
  v.setUint32(24, s.rate, true); v.setUint32(28, s.rate * s.channels * bits / 8, true);
  v.setUint16(32, s.channels * bits / 8, true); v.setUint16(34, bits, true);
  tag(36, 'data'); v.setUint32(40, size, true);
  out.set(s.data.subarray(0, size), 44);
  return out;
}

if (typeof module !== 'undefined') module.exports = { zbUnityScriptFields, zbUnityHeaderSize, zbUnityParse, zbUnityRead, zbUnityValue, zbUnitySideName, zbUnityTexturePixels, zbUnityClassName, zbFsbRead, zbFsbWav, ZB_UNITY_TEXTURE_FORMATS };
