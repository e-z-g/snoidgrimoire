/* zb-uniswf.js -- uniSWF's compiled clips, the 2015 remake's animations:
   the Zoombinis, Fleens, trolls, Captain Cajun and the scenes' moving parts.
   Each is a TextAsset named *.swf, with its bitmaps in Texture2D atlases
   named <swf name>_Tex<n>_compressed (some with a Resources path before).
   Read:
   little-endian. A format section (int32 type 3, int32 size 8) with the
   magic "PBMC" (int32 length and characters), then the version, int32 8.
   A section after that is a 16-bit type and an int32 size, and the reader
   skips to its end when done. Types: 1 int, 2 float, 3 string, 100-111
   transform, matrix, bitmap, bitmap font, font character, display object,
   text, movie clip, frame, action, array and dictionary, 755 the header.
   The header section (755) has a string, a 32-digit hex hash. A string is
   an int32 count of characters and the characters in UTF-8 (none over
   665535). The string table follows (int32 count, strings), then the
   assets (int32 count). Each asset is an int32 kind (0 movie clip, 1
   bitmap, 2 bitmap font, 3 shape, 4 export settings), its class name
   (a string, empty for every bitmap in the remake) and its character id. Last
   comes one string, the shared assets' name (empty in the remake), where
   the program stops. The remake's files have one more string after it,
   16 zeros, which nothing reads.
   A movie clip (section 107): uint32 flags (1 shared, 2 scale-9 grid),
   the labels (int32 count, each a string and an int32 frame number from
   1), then the frames (int32 count). A frame is its display list (int32
   count of placements), a string of frame script, and its actions (int16
   count, each a section 109 with a name and a dictionary). Last, when
   flag 2 is set, the scale-9 grid as a rectangle (4 floats x, y, w, h).
   A placement starts with 16-bit flags. Flag 256 marks one unchanged
   since the last frame: an int32 index into that frame's display list
   follows, and nothing else. Otherwise: a byte type (0 for every bitmap
   and 2 for most clips in the remake, 3 text, so the asset of the id sets
   what a placement draws), int32 character id, int32 instance id, the
   transform (6 floats a, b, c, d, tx, ty, then width, height, alpha and
   a visible byte), the instance name (int16 count, -1 for none), the user
   data (a string), the text (type 3 only), the mask's instance id (flag
   4), the rotation (a float, flag 512), the blend byte (0 normal, 1
   additive) and the color multiplier (3 bytes, red, green, blue). Flag 2
   marks a button and 8 a mask.
   A bitmap (section 102): uint32 flags (1 transparent, 2 readable, 4 size
   given), the rectangle in the atlas in pixels (from the top left), the
   shape rectangle, whose size is the bitmap's quad at (0, 0) before the
   placement's matrix and whose corner repeats the matrix's offset, the
   atlas (uint32 index into the string table), a float pixel size, a
   format byte, embedded bytes (int32 count), and with flag 4 the atlas's
   width and height (16 bits each).
   A shape (any section type): int32 count of drawing steps, each a
   section with a step byte (0 fill, 1 bitmap fill, 2 move, 3 line), uint32
   flags, and by flag a point (1, 2 floats), a bitmap id (2, int32), a
   color (4, int32) and a matrix (8, 6 floats).
   The export settings are a dictionary (section 111): an int32 count, each
   key a string and each value a section of type 1, 2, 3, 110 or 111. An
   array (110) has an int32 count of values.
   Out: zbUniSwfRead gives the file's assets, by class name and by id.
   zbUniSwfFrame gives a frame of a clip as a list of bitmaps to draw, in
   order, each with its atlas, the rectangle in it and a matrix to the
   clip's space, nested clips resolved.
   WHERE IT CAME FROM
   The remake's LibUniSWF (uniSWF by Pumpkin Games), read in the ARM64 code
   of the iPhone build's UnityFramework through Cpp2IL: MovieClipReader
   readSwfAssetContext and readHeaderString, SWFReader_8 readSWFCO and the
   read methods it calls, Section1, Section2 and SimpleActionVMBinaryReader.
   The workbench's doc/remake/uniswf.md has the addresses. Checked by
   reading all 43 .swf files of the iPhone build to their last byte.
   =========================================================================
   Pure: bytes in, data out. */

const ZB_UNISWF_T = {
  int: 1, float: 2, string: 3, bitmap: 102, displayObject: 105, movieClip: 107,
  action: 109, array: 110, dictionary: 111, header: 755,
};
const ZB_UNISWF_KINDS = ['clip', 'bitmap', 'font', 'shape', 'settings'];
const ZB_UNISWF_STEPS = ['fill', 'bitmapFill', 'move', 'line'];
const ZB_UNISWF_STRING_MAX = 0xA27BF;

/* A reader over the bytes, with the section and string forms. */
function zbUniSwfReader(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const r = {
    p: 0,
    requireBytes(n) { if (r.p + n > bytes.length) throw new Error(`uniSWF: ${n} bytes past the end at ${r.p}`); },
    u8() { r.requireBytes(1); return bytes[r.p++]; },
    u16() { r.requireBytes(2); const x = v.getUint16(r.p, true); r.p += 2; return x; },
    i16() { r.requireBytes(2); const x = v.getInt16(r.p, true); r.p += 2; return x; },
    i32() { r.requireBytes(4); const x = v.getInt32(r.p, true); r.p += 4; return x; },
    u32() { r.requireBytes(4); const x = v.getUint32(r.p, true); r.p += 4; return x; },
    f32() { r.requireBytes(4); const x = v.getFloat32(r.p, true); r.p += 4; return x; },
    bytes(n) { r.requireBytes(n); const x = bytes.subarray(r.p, r.p + n); r.p += n; return x; },
    /* BinaryReader.ReadChars in UTF-8: count is in UTF-16 units. */
    chars(count) {
      let s = '';
      while (s.length < count) {
        const b = r.u8();
        let c, more;
        if (b < 0x80) { c = b; more = 0; }
        else if (b >= 0xC2 && b < 0xE0) { c = b & 0x1F; more = 1; }
        else if (b >= 0xE0 && b < 0xF0) { c = b & 0x0F; more = 2; }
        else if (b >= 0xF0 && b < 0xF5) { c = b & 0x07; more = 3; }
        else throw new Error(`uniSWF: byte ${b} starts no UTF-8 character at ${r.p - 1}`);
        for (let i = 0; i < more; i++) {
          const n = r.u8();
          if ((n & 0xC0) !== 0x80) throw new Error(`uniSWF: broken UTF-8 at ${r.p - 1}`);
          c = c << 6 | (n & 0x3F);
        }
        s += String.fromCodePoint(c);
      }
      if (s.length !== count) throw new Error(`uniSWF: a character splits at the string's end at ${r.p}`);
      return s;
    },
    /* An int32 count and characters. */
    string() {
      const n = r.i32();
      if (n < 0 || n > ZB_UNISWF_STRING_MAX) throw new Error(`uniSWF: string of ${n} characters at ${r.p - 4}`);
      return r.chars(n);
    },
    /* An int16 count and characters, null for a negative count. */
    smallString() {
      const n = r.i16();
      return n < 0 ? null : r.chars(n);
    },
    /* Section2: a 16-bit type, an int32 size, and the data. */
    section(expectedType) {
      const type = r.u16(), size = r.i32(), start = r.p;
      if (size < 0 || start + size > bytes.length) throw new Error(`uniSWF: section ${type} of ${size} bytes at ${start - 6}`);
      if (expectedType !== undefined && type !== expectedType) throw new Error(`uniSWF: section ${type} at ${start - 6}, expected ${expectedType}`);
      return { type, size, start };
    },
    /* Section2.end reads bytes up to the section's end, 1025 at most. */
    end(s) {
      const stop = s.start + s.size;
      if (r.p > stop) throw new Error(`uniSWF: section ${s.type} at ${s.start - 6} overran its ${s.size} bytes to ${r.p}`);
      if (stop - r.p > 1025) throw new Error(`uniSWF: section ${s.type} at ${s.start - 6} left ${stop - r.p} bytes`);
      const skipped = stop - r.p;
      r.p = stop;
      return skipped;
    },
    /* Section2.readInt: 0 without reading when the section is short. */
    sectionInt(s) { return s.start - r.p + 4 > s.size ? 0 : r.i32(); },
    sectionFloat(s) { return s.start - r.p + 4 > s.size ? 0 : r.f32(); },
    sectionString(s) {
      const n = r.sectionInt(s);
      if (n > ZB_UNISWF_STRING_MAX || n + (s.start - r.p) > s.size) return null;
      if (n < 0) throw new Error(`uniSWF: string of ${n} characters at ${r.p - 4}`);
      return r.chars(n);
    },
    rect() { return { x: r.f32(), y: r.f32(), w: r.f32(), h: r.f32() }; },
    matrix() { return [r.f32(), r.f32(), r.f32(), r.f32(), r.f32(), r.f32()]; },
  };
  return r;
}

/* SimpleActionVMBinaryReader.decodeParam: a section of type 1, 2, 3, 110 or 111. */
function zbUniSwfParam(r) {
  const s = r.section();
  let value;
  if (s.type === ZB_UNISWF_T.int) value = r.sectionInt(s);
  else if (s.type === ZB_UNISWF_T.float) value = r.sectionFloat(s);
  else if (s.type === ZB_UNISWF_T.string) value = r.sectionString(s);
  else if (s.type === ZB_UNISWF_T.array) {
    value = [];
    for (let n = r.sectionInt(s); n > 0; n--) value.push(zbUniSwfParam(r));
  } else if (s.type === ZB_UNISWF_T.dictionary) value = zbUniSwfDictionaryBody(r, s);
  else {
    /* decodeParam returns null for any other type and skips the section. */
    value = { skippedType: s.type, bytes: Array.from(r.bytes(s.size)) };
  }
  r.end(s);
  return value;
}

function zbUniSwfDictionaryBody(r, s) {
  const out = {};
  for (let n = r.sectionInt(s); n > 0; n--) {
    const key = r.sectionString(s);
    out[key] = zbUniSwfParam(r);
  }
  return out;
}

/* decodeParamsHashtable with no section given starts a section 111. */
function zbUniSwfDictionary(r) {
  const s = r.section(ZB_UNISWF_T.dictionary);
  const out = zbUniSwfDictionaryBody(r, s);
  r.end(s);
  return out;
}

/* SimpleActionVMBinaryReader.decodeBinary: a frame's actions. */
function zbUniSwfActions(r) {
  const actions = [];
  for (let n = r.i16(); n > 0; n--) {
    const s = r.section(ZB_UNISWF_T.action);
    const name = r.sectionString(s);
    const params = zbUniSwfDictionary(r);
    r.end(s);
    actions.push({ name, params });
  }
  return actions;
}

/* SWFReader_8.readTransformInfoNonBoxed. */
function zbUniSwfTransform(r) {
  return { matrix: r.matrix(), width: r.f32(), height: r.f32(), alpha: r.f32(), visible: r.u8() !== 0 };
}

/* SWFReader_8.readMovieClipAssetInfo. */
function zbUniSwfClip(r) {
  const s = r.section(ZB_UNISWF_T.movieClip);
  const flags = r.u32();
  if (flags & ~3) throw new Error(`uniSWF: clip flags ${flags} at ${s.start}`);
  const labels = {};
  for (let n = r.i32(); n > 0; n--) { const name = r.string(); labels[name] = r.i32(); }
  const frames = [];
  const frameCount = r.i32();
  for (let f = 0; f < frameCount; f++) {
    const display = [];
    const placements = r.i32();
    for (let i = 0; i < placements; i++) {
      const at = r.p;
      const bits = r.u16();
      if (bits & ~1023) throw new Error(`uniSWF: placement flags ${bits} at ${at}`);
      if (bits & 256) {
        const index = r.i32();
        const previous = frames.length ? frames[frames.length - 1].display : [];
        if (index < 0 || index >= previous.length) throw new Error(`uniSWF: unchanged placement ${index} of ${previous.length} at ${at}`);
        display.push(previous[index]);
        continue;
      }
      const d = { bits, button: (bits & 2) !== 0, isMask: (bits & 8) !== 0, type: r.u8(), cid: r.i32(), instanceId: r.i32() };
      if (d.type > 3) throw new Error(`uniSWF: placement type ${d.type} at ${at}`);
      d.transform = zbUniSwfTransform(r);
      d.name = r.smallString();
      d.userData = r.string();
      if (d.type === 3) throw new Error(`uniSWF: a text placement at ${at}, which this reader does not read`);
      if (bits & 4) d.maskInstanceId = r.i32();
      if (bits & 512) d.transform.rotation = r.f32();
      d.blend = r.u8();
      if (d.blend > 1) throw new Error(`uniSWF: blend ${d.blend} at ${r.p - 1}`);
      d.color = [r.u8() / 255, r.u8() / 255, r.u8() / 255];
      display.push(d);
    }
    const script = r.string();
    frames.push({ display, script: script || null, actions: zbUniSwfActions(r) });
  }
  const clip = { kind: 'clip', shared: (flags & 1) !== 0, labels, frames };
  if (flags & 2) clip.scale9 = r.rect();
  clip.padding = r.end(s);
  return clip;
}

/* SWFReader_8.readBitmapAssetInfo. */
function zbUniSwfBitmap(r, strings) {
  const s = r.section(ZB_UNISWF_T.bitmap);
  const flags = r.u32();
  if (flags & ~7) throw new Error(`uniSWF: bitmap flags ${flags} at ${s.start}`);
  const b = { kind: 'bitmap', transparent: (flags & 1) !== 0, readable: (flags & 2) !== 0 };
  b.src = r.rect();
  b.shape = r.rect();
  const index = r.u32();
  if (index >= strings.length) throw new Error(`uniSWF: string ${index} of ${strings.length} at ${r.p - 4}`);
  b.texture = strings[index];
  b.pixelSize = r.f32();
  b.fileFormat = r.u8();
  const n = r.i32();
  if (n < 0 || n > ZB_UNISWF_STRING_MAX) throw new Error(`uniSWF: embedded bitmap of ${n} bytes at ${r.p - 4}`);
  b.embedded = n ? r.bytes(n) : null;
  if (flags & 4) { b.textureWidth = r.u16(); b.textureHeight = r.u16(); }
  b.padding = r.end(s);
  return b;
}

/* SWFReader_8.readSimpleShapeInfo and readSimpleShapeDrawOP. */
function zbUniSwfShape(r) {
  const s = r.section();
  const steps = [];
  for (let n = r.i32(); n > 0; n--) {
    const t = r.section();
    const step = { op: r.u8() };
    if (step.op > 3) throw new Error(`uniSWF: drawing step ${step.op} at ${r.p - 1}`);
    step.name = ZB_UNISWF_STEPS[step.op];
    const flags = r.u32();
    if (flags & ~15) throw new Error(`uniSWF: drawing flags ${flags} at ${r.p - 4}`);
    if (flags & 1) { step.x = r.f32(); step.y = r.f32(); }
    if (flags & 2) step.bitmapCid = r.i32();
    if (flags & 4) step.color = r.i32();
    if (flags & 8) step.matrix = r.matrix();
    r.end(t);
    steps.push(step);
  }
  const shape = { kind: 'shape', sectionType: s.type, steps };
  shape.padding = r.end(s);
  return shape;
}

/* MovieClipReader.readSwfAssetContext and SWFReader_8.readSWFCO. */
function zbUniSwfRead(bytes) {
  const r = zbUniSwfReader(bytes);
  const formatType = r.i32(), formatSize = r.i32(), formatStart = r.p;
  if (formatType !== 3 || formatSize < 0) throw new Error(`uniSWF: format section ${formatType} of ${formatSize}`);
  const magic = r.string();
  if (magic !== 'PBMC') throw new Error(`uniSWF: magic ${JSON.stringify(magic)}`);
  if (r.p > formatStart + formatSize) throw new Error('uniSWF: the format section overran');
  r.p = formatStart + formatSize;
  const version = r.i32();
  if (version !== 8) throw new Error(`uniSWF: version ${version}, and this reader reads 8`);
  const head = r.section(ZB_UNISWF_T.header);
  const hash = r.sectionString(head);
  r.end(head);
  const stringCount = r.i32();
  if (stringCount < 0 || stringCount >= 0x9FFFB) throw new Error(`uniSWF: ${stringCount} strings`);
  const strings = [];
  for (let i = 0; i < stringCount; i++) strings.push(r.string());
  const assets = [], byCid = {}, byClass = {};
  const assetCount = r.i32();
  for (let i = 0; i < assetCount; i++) {
    const at = r.p;
    const kind = r.i32(), className = r.string(), cid = r.i32();
    let asset;
    if (kind === 0) asset = zbUniSwfClip(r);
    else if (kind === 1) asset = zbUniSwfBitmap(r, strings);
    else if (kind === 3) asset = zbUniSwfShape(r);
    else if (kind === 4) asset = { kind: 'settings', settings: zbUniSwfDictionary(r) };
    else throw new Error(`uniSWF: asset kind ${kind} at ${at}, which this reader does not read`);
    asset.className = className || null;
    asset.cid = cid;
    asset.at = at;
    assets.push(asset);
    if (kind !== 4) byCid[cid] = asset;
    if (className) byClass[className] = asset;
  }
  const sharedAssets = r.string();
  /* The program stops here. Every file of the remake has one more string,
     16 zeros, which no code of LibUniSWF reads. */
  const trailer = r.p < bytes.length ? r.string() : null;
  if (r.p !== bytes.length) throw new Error(`uniSWF: ${bytes.length - r.p} bytes after the end at ${r.p}`);
  return { version, hash, strings, assets, byCid, byClass, sharedAssets: sharedAssets || null, trailer };
}

/* A bitmap's atlas is the Texture2D "<swf base name>_<texture>", in some
   files after a Resources path. */
function zbUniSwfAtlasName(swfName, texture) {
  return `${swfName.replace(/^.*\//, '')}_${texture}`;
}

function zbUniSwfMultiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/* The count of frames in a row before this one that show the same
   placement. A nested clip plays from its placement on. */
function zbUniSwfAge(clip, frameIndex, d) {
  let age = 0;
  for (let f = frameIndex - 1; f >= 0; f--) {
    const seen = clip.frames[f].display.some(e => e === d || (e.instanceId === d.instanceId && e.cid === d.cid && e.type === d.type));
    if (!seen) break;
    age++;
  }
  return age;
}

/* A frame of a clip as draw steps in order. Each step: texture (the
   bitmap's atlas name in the swf), src {x, y, w, h} in atlas pixels,
   quad {x: 0, y: 0, w, h}, the bitmap's rectangle before the matrix
   (the size of its shape rectangle, larger than src for a bitmap stored
   shrunk), matrix [a, b, c, d, tx, ty] from that space to the clip's,
   multiply [r, g, b, a], blend (0 normal, 1 additive), and the chain of
   placements. A nested clip shows the frame
   its time on the stage gives, looping, or its first frame when
   options.nestedFirst is set. Masks are listed, not applied. */
function zbUniSwfFrame(swf, clipName, frameIndex, options = {}) {
  const top = typeof clipName === 'number' ? swf.byCid[clipName] : swf.byClass[clipName];
  if (!top || top.kind !== 'clip') throw new Error(`uniSWF: no clip ${clipName}`);
  if (frameIndex < 0 || frameIndex >= top.frames.length) throw new Error(`uniSWF: frame ${frameIndex} of ${top.frames.length}`);
  const out = [];
  const walk = (clip, f, matrix, multiply, blend, depth, chain) => {
    if (depth > 32) throw new Error('uniSWF: clips nest past 32 deep');
    for (const d of clip.frames[f].display) {
      if (!d.transform.visible && !options.showHidden) continue;
      const asset = swf.byCid[d.cid];
      if (!asset) throw new Error(`uniSWF: placement of missing id ${d.cid}`);
      const m = zbUniSwfMultiply(matrix, d.transform.matrix);
      const mul = [multiply[0] * d.color[0], multiply[1] * d.color[1], multiply[2] * d.color[2], multiply[3] * d.transform.alpha];
      const b = blend || d.blend;
      const path = chain.concat(d.name || `#${d.instanceId}`);
      if (asset.kind === 'clip') {
        const n = asset.frames.length;
        const sub = options.nestedFirst ? 0 : zbUniSwfAge(clip, f, d) % n;
        walk(asset, sub, m, mul, b, depth + 1, path);
      } else if (asset.kind === 'bitmap') {
        out.push({ texture: asset.texture, src: asset.src, quad: { x: 0, y: 0, w: asset.shape.w, h: asset.shape.h }, matrix: m, multiply: mul, blend: b, mask: d.isMask, chain: path });
      } else if (asset.kind === 'shape') {
        for (const step of asset.steps) {
          if (step.op !== 1) continue;
          const bmp = swf.byCid[step.bitmapCid];
          if (!bmp || bmp.kind !== 'bitmap') throw new Error(`uniSWF: shape fill with missing bitmap ${step.bitmapCid}`);
          out.push({ texture: bmp.texture, src: bmp.src, quad: { x: 0, y: 0, w: bmp.shape.w, h: bmp.shape.h }, matrix: step.matrix ? zbUniSwfMultiply(m, step.matrix) : m, multiply: mul, blend: b, mask: d.isMask, chain: path, shape: asset.steps });
        }
      } else throw new Error(`uniSWF: placement of a ${asset.kind}`);
    }
  };
  walk(top, frameIndex, [1, 0, 0, 1, 0, 0], [1, 1, 1, 1], 0, 0, []);
  return out;
}

if (typeof module !== 'undefined') module.exports = { zbUniSwfRead, zbUniSwfFrame, zbUniSwfAtlasName, ZB_UNISWF_KINDS };
