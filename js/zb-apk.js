/* zb-apk.js -- the 2015 remake's Android build, read out of its APKs.
   Google Play installs it as three APKs: base.apk, a split for the CPU
   (split_config.arm64_v8a.apk) and an asset pack
   (split_UnityDataAssetPack.apk). An APK is a zip file.
   Read:
   the zip's end record (0x06054B50) in its last 64 kB, with the count of
   entries at +10 and the central directory's offset at +16. A central
   entry (0x02014B50) has its method at +10 (0 stored, 8 deflated), its
   compressed and full sizes at +20 and +24, the lengths of its name,
   extra field and comment at +28, +30 and +32, its local header's offset
   at +42 and its name at +46. A local header (0x04034B50) has the lengths
   of its name and extra field at +26 and +28, and the data follows them.
   The Unity files are in assets/bin/Data, spread over base.apk and the
   asset pack. A file over 1 MB is cut into pieces of 1 MB named
   <name>.split0, .split1 and so on, which join in order. The metadata is
   assets/bin/Data/Managed/Metadata/global-metadata.dat. The game's code
   is lib/arm64-v8a/libil2cpp.so, and FMOD is linked into libunity.so
   beside it.
   Out: File objects named as in the other builds, with a stored entry as
   a slice of its APK and a deflated one inflated.
   WHERE IT CAME FROM
   PKWARE's APPNOTE.TXT, and the Android build pulled from a phone with
   adb (17 November 2026). Checked by utilities/remake_check.mjs: every
   file out of the three APKs against the same files unzipped and joined.
   =========================================================================
   Blobs in, Files out, or zb-range.js's file-likes in and out. Used by
   page-unity.js. */

/* A zip's entries: { name, method, packed, size, local }. */
async function zbZipEntries(blob) {
  const tail = Math.min(blob.size, 65536 + 22), at = blob.size - tail;
  const end = new Uint8Array(await blob.slice(at).arrayBuffer()), ev = new DataView(end.buffer);
  let p = end.length - 22;
  while (p >= 0 && ev.getUint32(p, true) !== 0x06054b50) p--;
  if (p < 0) throw new Error('This is not a zip file.');
  const count = ev.getUint16(p + 10, true), dirSize = ev.getUint32(p + 12, true), dirAt = ev.getUint32(p + 16, true);
  if (dirAt === 0xffffffff || count === 0xffff) throw new Error('This zip file is in the 64-bit form, which is not read here.');
  const dir = new Uint8Array(await blob.slice(dirAt, dirAt + dirSize).arrayBuffer()), dv = new DataView(dir.buffer);
  const entries = [], utf8 = new TextDecoder();
  for (let q = 0, i = 0; i < count; i++) {
    if (dv.getUint32(q, true) !== 0x02014b50) throw new Error('The zip file\'s directory is broken.');
    const nameLen = dv.getUint16(q + 28, true), extraLen = dv.getUint16(q + 30, true), commentLen = dv.getUint16(q + 32, true);
    entries.push({
      name: utf8.decode(dir.subarray(q + 46, q + 46 + nameLen)),
      method: dv.getUint16(q + 10, true), packed: dv.getUint32(q + 20, true), size: dv.getUint32(q + 24, true),
      local: dv.getUint32(q + 42, true),
    });
    q += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/* An entry's bytes as a Blob: a slice of the zip where stored, inflated
   where deflated. */
async function zbZipBlob(blob, entry) {
  const head = new DataView(await blob.slice(entry.local, entry.local + 30).arrayBuffer());
  if (head.getUint32(0, true) !== 0x04034b50) throw new Error(`${entry.name}: the zip file's local header is broken.`);
  const start = entry.local + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const packed = blob.slice(start, start + entry.packed);
  if (entry.method === 0) return packed;
  if (entry.method !== 8) throw new Error(`${entry.name}: zip method ${entry.method} is not read here.`);
  return new Response(packed.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
}

/* The three APKs as Google Play installs them. */
const ZB_APK_NAMES = ['base.apk', 'split_config.arm64_v8a.apk', 'split_UnityDataAssetPack.apk'];
const ZB_APK_DATA = 'assets/bin/Data/';
const ZB_APK_KEEP = {
  'assets/bin/Data/Managed/Metadata/global-metadata.dat': 'global-metadata.dat',
  'lib/arm64-v8a/libil2cpp.so': 'libil2cpp.so',
  'lib/arm64-v8a/libunity.so': 'libunity.so',
};

/* The Unity files, the metadata and the two libraries out of the APKs, as
   Files. Pieces of a split file may lie in any of the APKs. */
async function zbApkFiles(apks) {
  const whole = [], pieces = new Map();
  for (const apk of apks) {
    for (const e of await zbZipEntries(apk)) {
      if (ZB_APK_KEEP[e.name]) { whole.push([ZB_APK_KEEP[e.name], apk, e]); continue; }
      if (!e.name.startsWith(ZB_APK_DATA)) continue;
      const name = e.name.slice(ZB_APK_DATA.length);
      if (!name || name.includes('/')) continue;
      const m = /^(.*)\.split(\d+)$/.exec(name);
      if (!m) { whole.push([name, apk, e]); continue; }
      if (!pieces.has(m[1])) pieces.set(m[1], []);
      pieces.get(m[1])[+m[2]] = [apk, e];
    }
  }
  // An APK at an address (zb-range.js) is read only where a view needs it,
  // so its entries are found and inflated the first time they are read.
  const entry = (apk, e) => apk instanceof Blob ? zbZipBlob(apk, e) : new ZbLazyFile(() => zbZipBlob(apk, e), e.size);
  const out = await Promise.all(whole.map(async ([name, apk, e]) => zbFileOf([await entry(apk, e)], name)));
  for (const [name, list] of pieces) {
    const missing = [...list.keys()].find(i => !list[i]);
    if (missing !== undefined) throw new Error(`${name}: piece ${missing} is in none of the APKs given.`);
    out.push(zbFileOf(await Promise.all(list.map(([apk, e]) => entry(apk, e))), name));
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { zbZipEntries, zbZipBlob, zbApkFiles };
