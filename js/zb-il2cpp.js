/* zb-il2cpp.js -- the serialized field layouts of the 2015 remake's script
   classes, built from its IL2CPP build: global-metadata.dat and the
   binary with the game's code, an arm64 Mach-O. That is UnityFramework in
   the iPhone build and GameAssembly.dylib in Steam's Mac build, which is
   a universal binary holding an x86_64 and an arm64 Mach-O, and the arm64
   one is read. zbUnityScriptFields (zb-unity.js)
   reads a MonoBehaviour's fields by the table built here.
   Read:
   global-metadata.dat (version 31) starts with the magic 0xFAB11BAF and the
   version, then 31 pairs of offset and size: string literals, their data,
   strings, events, properties, methods, parameter defaults, field defaults,
   default data, marshaled sizes, parameters, fields, generic parameters,
   their constraints, generic containers, nested types, interfaces, vtable
   methods, interface offsets, type definitions, images, assemblies, field
   refs, referenced assemblies, attribute data, attribute data ranges, and
   four more not read here. A type definition is 88 bytes: name, namespace,
   byval type, declaring type, parent, element type, generic container,
   flags, the starts of its fields, methods, events, properties, nested
   types, interfaces, vtable and interface offsets, then 16-bit counts
   (methods, properties, fields, events, nested types, vtable, interfaces,
   interface offsets), a bitfield and a token. Type indexes ("byval",
   "parent", a field's type) are into the binary's type table. A field is
   12 bytes (name, type, token), a method 36 (name, declaring type
   definition, ...), an image 40 (name, assembly, first type, type count,
   ..., the first and count of its attribute data ranges), a generic
   parameter 16 (owner, name, constraints, number, flags). An attribute
   data range is a token and an offset into the attribute data, where a
   compressed count leads a list of 32-bit constructor method indexes.
   The binary contains Il2CppMetadataRegistration: 16 64-bit words, counts
   and pointers of generic classes, generic insts, the generic method table,
   types, method specs, field offsets, type definition sizes and metadata
   usages. The field offsets and the type definition sizes both count the
   type definitions, so the registration is the place in __DATA_CONST or
   __DATA where that count is at words 10 and 12. An Il2CppType is a 64-bit
   datum (a type definition index for a class or value type, a generic
   parameter index for VAR, a pointer for GENERICINST and SZARRAY) and a
   32-bit word: the field's attributes (bits 0-15), the element type (bits
   16-23) and byref (bit 29). A generic class is the generic type's pointer
   then its class inst, an inst a count and a pointer to its arguments.
   Pointers are LC_DYLD_CHAINED_FIXUPS rebases (formats 2 and 6) in the
   iPhone build, with the target in the low 36 bits. Steam's build has
   LC_DYLD_INFO_ONLY instead, and its pointers are the plain addresses. The
   image base is 0 in both. A universal binary starts with 0xCAFEBABE (big
   endian), a count, and for each Mach-O in it 20 bytes: the CPU type, its
   subtype, the offset, the size and the alignment. Arm64 is CPU type
   0x0100000C.
   The layout table, by Unity's serialization rules:
     name: [base, "field type", ...]
   where a type is bool, u8, i8, u16, i16, i32, u32, i64, u64, f32, f64,
   str, ptr (a PPtr), another layout's name, or one of those and [] for an
   array or a List<T>. A script's fields are its class's and its bases'
   down to MonoBehaviour or ScriptableObject, base first. A field is
   serialized when it is public or [SerializeField], and not static, const,
   readonly, NotSerialized or [NonSerialized]. Its type is a primitive,
   string, enum (by its value__ field's type), UnityEngine.Object (a PPtr),
   one of Unity's types in ZB_IL2CPP_BUILTIN, a UnityEvent, a
   [Serializable] class or struct outside System, or an array or list of
   one of those. The layout key of a generic class includes the types of
   its arguments.
   WHERE IT CAME FROM
   Il2CppDumper (Il2Cpp/MetadataClass.cs, Il2CppClass.cs, the registration
   search in its Mach-O plugins), LibCpp2IL (Cpp2IL's metadata and Mach-O
   readers), Apple's dyld fixup-chains.h, and Unity's script serialization
   rules. Checked by utilities/remake_check.mjs: the layouts against the
   table zoombini-workbench tools/remake/layouts.py writes from Cpp2IL's
   dump, and every MonoBehaviour of the iPhone and Steam Mac builds read by
   them to exactly its size.
   =========================================================================
   Pure: bytes in, data out. Used by page-unity.js. */

/* Unity types that Unity serializes natively, not by their C# fields. */
const ZB_IL2CPP_F32 = (...names) => names.map(n => `${n} f32`);
const ZB_IL2CPP_BUILTIN = {
  'UnityEngine.Vector2': ['', ...ZB_IL2CPP_F32('x', 'y')],
  'UnityEngine.Vector3': ['', ...ZB_IL2CPP_F32('x', 'y', 'z')],
  'UnityEngine.Vector4': ['', ...ZB_IL2CPP_F32('x', 'y', 'z', 'w')],
  'UnityEngine.Quaternion': ['', ...ZB_IL2CPP_F32('x', 'y', 'z', 'w')],
  'UnityEngine.Color': ['', ...ZB_IL2CPP_F32('r', 'g', 'b', 'a')],
  'UnityEngine.Color32': ['', 'rgba u32'],
  'UnityEngine.Rect': ['', ...ZB_IL2CPP_F32('x', 'y', 'width', 'height')],
  'UnityEngine.Vector2Int': ['', 'm_X i32', 'm_Y i32'],
  'UnityEngine.Vector3Int': ['', 'm_X i32', 'm_Y i32', 'm_Z i32'],
  'UnityEngine.RectInt': ['', 'm_XMin i32', 'm_YMin i32', 'm_Width i32', 'm_Height i32'],
  'UnityEngine.Bounds': ['', 'm_Center UnityEngine.Vector3', 'm_Extent UnityEngine.Vector3'],
  'UnityEngine.Matrix4x4': ['', ...ZB_IL2CPP_F32(...[0, 1, 2, 3].flatMap(c => [0, 1, 2, 3].map(r => `e${r}${c}`)))],
  'UnityEngine.LayerMask': ['', 'm_Bits u32'],
  'UnityEngine.RectOffset': ['', 'm_Left i32', 'm_Right i32', 'm_Top i32', 'm_Bottom i32'],
  'UnityEngine.Keyframe': ['', ...ZB_IL2CPP_F32('time', 'value', 'inSlope', 'outSlope'), 'weightedMode i32', ...ZB_IL2CPP_F32('inWeight', 'outWeight')],
  'UnityEngine.AnimationCurve': ['', 'm_Curve UnityEngine.Keyframe[]', 'm_PreInfinity i32', 'm_PostInfinity i32', 'm_RotationOrder i32'],
  'UnityEngine.Gradient': ['', ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `key${i} UnityEngine.Color`), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `ctime${i} u16`),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `atime${i} u16`), 'm_Mode i32', 'm_ColorSpace i32', 'm_NumColorKeys u8', 'm_NumAlphaKeys u8'],
  'UnityEngine.Events.ArgumentCache': ['', 'm_ObjectArgument ptr', 'm_ObjectArgumentAssemblyTypeName str', 'm_IntArgument i32',
    'm_FloatArgument f32', 'm_StringArgument str', 'm_BoolArgument bool'],
  'UnityEngine.Events.PersistentCall': ['', 'm_Target ptr', 'm_TargetAssemblyTypeName str', 'm_MethodName str', 'm_Mode i32',
    'm_Arguments UnityEngine.Events.ArgumentCache', 'm_CallState i32'],
  'UnityEngine.Events.PersistentCallGroup': ['', 'm_Calls UnityEngine.Events.PersistentCall[]'],
  'UnityEngine.Events.UnityEventBase': ['', 'm_PersistentCalls UnityEngine.Events.PersistentCallGroup'],
};

/* HARDCODED: Sirenix.Serialization.Config.dll is not in the build's
   metadata, yet one ScriptableObject of the build is a
   GlobalSerializationConfig. Its fields are Odin Serializer's
   (github.com/TeamSirenix/odin-serializer, GlobalSerializationConfig.cs):
   four booleans, then the DataFormat, LoggingPolicy and ErrorHandlingPolicy
   enums. The build's one object fits them, 32 bytes. */
const ZB_IL2CPP_ABSENT = {
  'Sirenix.Serialization.GlobalSerializationConfig': ['', 'HideSerializationCautionaryMessage bool',
    'HidePrefabCautionaryMessage bool', 'HideOdinSerializeAttributeWarningMessages bool',
    'HideNonSerializedShowInInspectorWarningMessages bool', 'buildSerializationFormat i32',
    'editorSerializationFormat i32', 'loggingPolicy i32', 'errorHandlingPolicy i32'],
};

/* Element types of an Il2CppType, and the primitives' layout codes. */
const ZB_IL2CPP_PRIMS = { 2: 'bool', 3: 'u16', 4: 'i8', 5: 'u8', 6: 'i16', 7: 'u16', 8: 'i32', 9: 'u32', 10: 'i64', 11: 'u64', 12: 'f32', 13: 'f64', 14: 'str' };
const ZB_IL2CPP_ENUM_CODES = { 3: 'u16', 4: 'i8', 5: 'u8', 6: 'i16', 7: 'u16', 8: 'i32', 9: 'u32', 10: 'i64', 11: 'u64' };
const ZB_IL2CPP_CLASS = 0x12, ZB_IL2CPP_VALUETYPE = 0x11, ZB_IL2CPP_VAR = 0x13, ZB_IL2CPP_GENERICINST = 0x15, ZB_IL2CPP_SZARRAY = 0x1d;

/* The metadata's tables. */
function zbIl2cppMetadata(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== 0xFAB11BAF) throw new Error('This is not IL2CPP metadata.');
  const version = v.getUint32(4, true);
  if (version !== 31) throw new Error(`IL2CPP metadata version ${version} is not read here, only 31.`);
  const section = i => ({ at: v.getUint32(8 + i * 8, true), size: v.getUint32(12 + i * 8, true) });
  const strings = section(2).at, decoder = new TextDecoder();
  const str = i => { let e = strings + i; while (bytes[e]) e++; return decoder.decode(bytes.subarray(strings + i, e)); };
  const table = (i, size, read) => {
    const s = section(i), out = [];
    for (let p = s.at; p + size <= s.at + s.size; p += size) out.push(read(p));
    return out;
  };
  const i32 = p => v.getInt32(p, true), u16 = p => v.getUint16(p, true);
  const methods = table(5, 36, p => i32(p + 4));
  const fields = table(11, 12, p => ({ name: str(i32(p)), type: i32(p + 4), token: i32(p + 8) }));
  const genericParams = table(12, 16, p => u16(p + 12));
  const nested = table(15, 4, p => i32(p));
  const typeDefs = table(19, 88, p => ({
    name: str(i32(p)), ns: str(i32(p + 4)), byval: i32(p + 8), parent: i32(p + 16),
    flags: i32(p + 28), fieldStart: i32(p + 32), nestedStart: i32(p + 48),
    fieldCount: u16(p + 68), nestedCount: u16(p + 72),
  }));
  const images = table(20, 40, p => ({ name: str(i32(p)), typeStart: i32(p + 8), typeCount: i32(p + 12), attrStart: i32(p + 32), attrCount: i32(p + 36) }));
  const ranges = table(25, 8, p => ({ token: i32(p), start: i32(p + 4) }));
  const attrData = section(24);
  // The attributes' type names, by image and token.
  const attrs = new Map();
  images.forEach((img, ii) => {
    for (let k = img.attrStart; k < img.attrStart + img.attrCount; k++) {
      let p = attrData.at + ranges[k].start;
      let n = bytes[p++];
      if ((n & 0x80) === 0) { /* one byte */ }
      else if ((n & 0xc0) === 0x80) n = ((n & 0x3f) << 8) | bytes[p++];
      else if ((n & 0xe0) === 0xc0) { n = ((n & 0x1f) << 24) | (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2]; p += 3; }
      else { n = v.getUint32(p, true); p += 4; }
      const names = [];
      for (let j = 0; j < n; j++) {
        const declaring = methods[v.getUint32(p + j * 4, true)];
        if (declaring !== undefined && typeDefs[declaring]) names.push(typeDefs[declaring].name.replace(/Attribute$/, ''));
      }
      attrs.set(ii + ':' + ranges[k].token, names);
    }
  });
  const imageOf = new Int32Array(typeDefs.length).fill(-1);
  images.forEach((img, ii) => { for (let t = img.typeStart; t < img.typeStart + img.typeCount; t++) imageOf[t] = ii; });
  return { typeDefs, fields, genericParams, nested, images, imageOf, attrs };
}

/* `read` for the arm64 Mach-O: the file itself, or the arm64 one inside
   a universal binary. */
async function zbIl2cppArm64(read) {
  const head = await read(0, 8), v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (v.getUint32(0) !== 0xcafebabe) return read;
  const count = v.getUint32(4), table = await read(8, count * 20), t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  for (let i = 0; i < count; i++) {
    if (t.getUint32(i * 20) !== 0x0100000c) continue;
    const offset = t.getUint32(i * 20 + 8);
    return (at, n) => read(offset + at, n);
  }
  throw new Error('This universal binary has no arm64 Mach-O.');
}

/* The binary's registration and type table. `read(offset, length)`
   resolves to the bytes at a file offset. Only the load commands, the
   fixup header and the __DATA_CONST and __DATA segments are read. */
async function zbIl2cppBinary(readFile, typeDefCount) {
  const read = await zbIl2cppArm64(readFile);
  let head = await read(0, 32);
  let v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (v.getUint32(0, true) !== 0xfeedfacf || v.getUint32(4, true) !== 0x0100000c) throw new Error('This is not an arm64 Mach-O binary.');
  const ncmds = v.getUint32(16, true), cmdSize = v.getUint32(20, true);
  head = await read(0, 32 + cmdSize);
  v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const segments = [];
  let fixups = null;
  for (let p = 32, i = 0; i < ncmds; i++) {
    const cmd = v.getUint32(p, true), size = v.getUint32(p + 4, true);
    if (cmd === 0x19) {
      const name = new TextDecoder().decode(head.subarray(p + 8, p + 24)).replace(/\0.*$/s, '');
      segments.push({ name, vmaddr: Number(v.getBigUint64(p + 24, true)), fileoff: Number(v.getBigUint64(p + 40, true)), filesize: Number(v.getBigUint64(p + 48, true)) });
    } else if (cmd === 0x80000034) fixups = { at: v.getUint32(p + 8, true), size: v.getUint32(p + 12, true) };
    p += size;
  }
  // The fixup chains' pointer formats: 2 and 6 have the target in the low 36 bits.
  if (fixups) {
    const f = await read(fixups.at, fixups.size), fv = new DataView(f.buffer, f.byteOffset, f.byteLength);
    const starts = fv.getUint32(4, true), segCount = fv.getUint32(starts, true);
    for (let s = 0; s < segCount; s++) {
      const o = fv.getUint32(starts + 4 + s * 4, true);
      if (!o) continue;
      const format = fv.getUint16(starts + o + 6, true);
      if (format !== 2 && format !== 6) throw new Error(`Chained pointer format ${format} is not read here.`);
    }
  }
  const data = [];
  for (const s of segments) {
    if (s.name !== '__DATA_CONST' && s.name !== '__DATA') continue;
    const bytes = await read(s.fileoff, s.filesize);
    data.push({ ...s, bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
  }
  const at = addr => {
    for (const s of data) if (addr >= s.vmaddr && addr + 8 <= s.vmaddr + s.filesize) return [s.view, addr - s.vmaddr];
    throw new Error(`The address 0x${addr.toString(16)} is not in the binary's data.`);
  };
  const u64 = addr => { const [dv, o] = at(addr); return dv.getBigUint64(o, true); };
  const u32 = addr => { const [dv, o] = at(addr); return dv.getUint32(o, true); };
  const ptr = addr => Number(u64(addr) & 0xfffffffffn);
  // The registration: the type definition count at words 10 and 12.
  let reg = -1;
  const count = BigInt(typeDefCount);
  for (const s of data) {
    for (let o = 80; o + 24 <= s.bytes.length && reg < 0; o += 8)
      if (s.view.getBigUint64(o, true) === count && s.view.getBigUint64(o + 16, true) === count) reg = s.vmaddr + o - 80;
  }
  if (reg < 0) throw new Error('The metadata registration is not in the binary.');
  const typeCount = Number(u64(reg + 48)), typesAt = ptr(reg + 56);
  const types = [], byAddress = new Map();
  for (let i = 0; i < typeCount; i++) {
    const a = ptr(typesAt + i * 8), bits = u32(a + 8), kind = (bits >> 16) & 0xff;
    const pointer = kind === ZB_IL2CPP_GENERICINST || kind === ZB_IL2CPP_SZARRAY || kind === 0x14 || kind === 0x0f;
    types.push({ data: pointer ? ptr(a) : Number(u64(a) & 0xffffffffn), attrs: bits & 0xffff, kind, byref: (bits >> 29) & 1 });
    byAddress.set(a, i);
  }
  // A generic class's type and arguments, as type indexes.
  const generic = addr => {
    const inst = ptr(addr + 8), argc = Number(u64(inst)), argv = ptr(inst + 8);
    const args = [];
    for (let i = 0; i < argc; i++) args.push(byAddress.get(ptr(argv + i * 8)));
    return { type: byAddress.get(ptr(addr)), args };
  };
  return { registration: reg, types, typeOf: addr => byAddress.get(addr), generic };
}

/* The layout table: every class derived from MonoBehaviour or
   ScriptableObject, and every class their fields use. `read` is as for
   zbIl2cppBinary. */
async function zbIl2cppLayouts(metadataBytes, read) {
  const md = zbIl2cppMetadata(metadataBytes);
  const bin = await zbIl2cppBinary(read, md.typeDefs.length);
  const { typeDefs, fields } = md, types = bin.types;
  const out = {};
  const outer = new Int32Array(typeDefs.length).fill(-1);
  typeDefs.forEach((t, i) => { for (let k = 0; k < t.nestedCount; k++) outer[md.nested[t.nestedStart + k]] = i; });
  const keys = [];
  const keyOf = i => {
    if (keys[i] === undefined) keys[i] = outer[i] >= 0 ? keyOf(outer[i]) + '.' + typeDefs[i].name : (typeDefs[i].ns ? typeDefs[i].ns + '.' : '') + typeDefs[i].name;
    return keys[i];
  };
  const asm = i => md.imageOf[i] >= 0 ? md.images[md.imageOf[i]].name.replace(/\.dll$/, '') : '';
  // A type index as { def, args }: its definition and its generic arguments (type indexes).
  const defOf = ti => {
    const t = types[ti];
    if (!t) return null;
    if (t.kind === ZB_IL2CPP_CLASS || t.kind === ZB_IL2CPP_VALUETYPE) return { def: t.data, args: [] };
    if (t.kind !== ZB_IL2CPP_GENERICINST) return null;
    const g = bin.generic(t.data), d = types[g.type];
    return d ? { def: d.data, args: g.args } : null;
  };
  const baseOf = i => typeDefs[i].parent >= 0 ? defOf(typeDefs[i].parent) : null;
  const derives = (i, key) => {
    for (let b = { def: i }, n = 0; b && n < 40; b = baseOf(b.def), n++) if (keyOf(b.def) === key) return true;
    return false;
  };
  const ROOTS = new Set(['UnityEngine.MonoBehaviour', 'UnityEngine.ScriptableObject']);
  const EVENT = 'UnityEngine.Events.UnityEventBase', OBJECT = 'UnityEngine.Object';
  const builtin = key => {
    if (out[key]) return;
    out[key] = ZB_IL2CPP_BUILTIN[key];
    for (const f of out[key].slice(1)) {
      const ty = f.split(' ')[1].replace(/\[\]$/, '');
      if (ZB_IL2CPP_BUILTIN[ty]) builtin(ty);
    }
  };
  const isList = ti => {
    const t = types[ti], d = t && t.kind === ZB_IL2CPP_GENERICINST && defOf(ti);
    return d && keyOf(d.def) === 'System.Collections.Generic.List`1' ? d.args[0] : null;
  };
  const argCodes = (args, gen) => args.map(a => fieldType(a, gen));
  // A field type's code, or null where Unity does not serialize it. `gen`
  // has the codes of the enclosing class's generic arguments.
  const fieldType = (ti, gen) => {
    const t = types[ti];
    if (!t || t.byref) return null;
    if (t.kind === ZB_IL2CPP_VAR) { const g = gen[md.genericParams[t.data]]; return g === undefined ? null : g; }
    if (ZB_IL2CPP_PRIMS[t.kind]) return ZB_IL2CPP_PRIMS[t.kind];
    const item = t.kind === ZB_IL2CPP_SZARRAY ? bin.typeOf(t.data) : isList(ti);
    if (item !== null && item !== undefined) {
      if (!types[item] || types[item].kind === ZB_IL2CPP_SZARRAY || isList(item) !== null) return null;
      const code = fieldType(item, gen);
      return code && !code.endsWith('[]') ? code + '[]' : null;
    }
    const d = defOf(ti);
    if (!d) return null;
    const key = keyOf(d.def), def = typeDefs[d.def];
    if (ZB_IL2CPP_BUILTIN[key]) { builtin(key); return key; }
    const base = baseOf(d.def);
    if (base && keyOf(base.def) === 'System.Enum') {
      const value = fields.slice(def.fieldStart, def.fieldStart + def.fieldCount).find(f => f.name === 'value__');
      return (value && ZB_IL2CPP_ENUM_CODES[types[value.type].kind]) || 'i32';
    }
    if (def.flags & 0x20) return null;   // an interface
    if (derives(d.def, OBJECT)) return 'ptr';
    if (derives(d.def, EVENT)) { builtin(EVENT); return layout(d.def, argCodes(d.args, gen)); }
    if (def.ns.startsWith('System') || ['mscorlib', 'System', 'System.Core'].includes(asm(d.def))) return null;
    if (!(def.flags & 0x2000)) return null;   // not [Serializable]
    return layout(d.def, argCodes(d.args, gen));
  };
  const hasFields = i => {
    for (let b = { def: i }, n = 0; b && n < 30; b = baseOf(b.def), n++) {
      const key = keyOf(b.def), def = typeDefs[b.def];
      if (ROOTS.has(key) || key.startsWith('System.') || key === OBJECT) return false;
      if (ZB_IL2CPP_BUILTIN[key]) return true;
      for (let f = def.fieldStart; f < def.fieldStart + def.fieldCount; f++) if (!(types[fields[f].type].attrs & 0x50)) return true;
    }
    return false;
  };
  const layout = (i, gen) => {
    let key = keyOf(i);
    if (gen.length) key += '<' + gen.map(g => g === null ? 'None' : g).join(',') + '>';
    if (key in out) return key;
    out[key] = null;   // while it is built, for a class that contains itself
    const def = typeDefs[i], base = baseOf(i);
    let baseKey = '';
    if (base && keyOf(base.def) === EVENT) baseKey = EVENT;
    else if (base && !ROOTS.has(keyOf(base.def)) && hasFields(base.def)) baseKey = layout(base.def, argCodes(base.args, gen));
    const list = [baseKey];
    for (let f = def.fieldStart; f < def.fieldStart + def.fieldCount; f++) {
      const fd = fields[f], a = types[fd.type].attrs;
      if (a & 0x70) continue;   // static, readonly or const
      const names = md.attrs.get(md.imageOf[i] + ':' + fd.token) || [];
      if ((a & 7) !== 6 && !names.includes('SerializeField')) continue;
      if (a & 0x80 || names.includes('NonSerialized')) continue;
      const code = names.includes('SerializeReference') ? 'ref' : fieldType(fd.type, gen);
      if (code !== null) list.push(`${fd.name} ${code}`);
    }
    out[key] = list;
    return key;
  };
  typeDefs.forEach((t, i) => {
    if (!types[t.byval] || types[t.byval].kind !== ZB_IL2CPP_CLASS || ROOTS.has(keyOf(i))) return;
    if (derives(i, 'UnityEngine.MonoBehaviour') || derives(i, 'UnityEngine.ScriptableObject')) layout(i, []);
  });
  const present = new Set(typeDefs.map((t, i) => keyOf(i)));
  for (const [k, v] of Object.entries(ZB_IL2CPP_ABSENT)) if (!present.has(k)) out[k] = v;
  return { layouts: out, registration: bin.registration, typeCount: types.length, typeDefCount: typeDefs.length };
}

if (typeof module !== 'undefined') module.exports = { zbIl2cppLayouts, zbIl2cppMetadata };
