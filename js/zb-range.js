/* zb-range.js -- files at a web address, read a piece at a time.
   The 2015 remake's Android asset pack is 1 GB, and a view needs a few
   hundred kilobytes of it. So a file at an address is read with HTTP
   range requests (Range: bytes=a-b, answered 206 with those bytes). A
   read is rounded out to blocks of 16 kB, which stay in memory up to
   64 MB, the oldest used going first, so the many small reads of a Unity
   file's header and objects share requests. A run of blocks not yet read
   is one request. Opening the Android build reads about 1,400 headers
   spread over the asset pack, which is 21 MB in 1,300 requests at 16 kB,
   and 115 MB in 440 at 256 kB. With an index beside the files
   (zbAddressIndexRead), opening reads the index alone.
   ZbRangeFile, ZbJoinedFile and ZbLazyFile stand in for a File where
   the page reads one: size, name, slice(start, end), arrayBuffer() and
   stream(). A real Blob cannot be made from them, since its bytes would
   all have to come first.
   - ZbRangeFile: a span of a file at an address.
   - ZbJoinedFile: parts read one after another, as a split file's
     pieces join.
   - ZbLazyFile: a file made the first time it is read, such as a zip
     entry that has to be inflated whole.
   WHERE IT CAME FROM
   RFC 9110 section 14 (range requests). The server must send
   Access-Control-Expose-Headers with Content-Length for a page on
   another origin to read the size.
   =========================================================================
   Addresses in, bytes out. Used by zb-apk.js and page-unity.js, and by
   zoombini-workbench's tools/remake/address_index.mjs for the index. */

const ZB_RANGE_BLOCK = 1 << 14;
const ZB_RANGE_KEEP = 4096;
/* The blocks read, of every file, by address and number, the oldest used first. */
const ZB_RANGE_BLOCKS = new Map();

/* Start and end of a slice, as Blob.slice reads them. */
function zbSliceBounds(size, start, end) {
  const at = v => v < 0 ? Math.max(size + v, 0) : Math.min(v, size);
  const s = start === undefined ? 0 : at(start), e = end === undefined ? size : at(end);
  return [s, Math.max(s, e)];
}

/* A ReadableStream of a file-like's bytes, 1 MB a read. */
function zbSliceStream(file) {
  let at = 0;
  return new ReadableStream({
    async pull(ctl) {
      if (at >= file.size) { ctl.close(); return; }
      const n = Math.min(1 << 20, file.size - at);
      ctl.enqueue(new Uint8Array(await file.slice(at, at + n).arrayBuffer()));
      at += n;
    },
  });
}

/* A file at an address. The source has the address, the whole size and
   the blocks on their way. */
class ZbRangeFile {
  constructor(source, start, end, name = '') { this.source = source; this.start = start; this.end = end; this.name = name; this.type = ''; }
  get size() { return this.end - this.start; }
  slice(start, end) {
    const [s, e] = zbSliceBounds(this.size, start, end);
    return new ZbRangeFile(this.source, this.start + s, this.start + e);
  }
  async arrayBuffer() {
    const out = new Uint8Array(this.size);
    if (!out.length) return out.buffer;
    const first = Math.floor(this.start / ZB_RANGE_BLOCK), last = Math.floor((this.end - 1) / ZB_RANGE_BLOCK);
    const blocks = await zbRangeBlocks(this.source, first, last);
    for (let b = first; b <= last; b++) {
      const block = blocks[b - first], base = b * ZB_RANGE_BLOCK;
      const s = Math.max(this.start, base), e = Math.min(this.end, base + block.length);
      out.set(block.subarray(s - base, e - base), s - this.start);
    }
    return out.buffer;
  }
  stream() { return zbSliceStream(this); }
}

/* Blocks first to last of a source, each run of missing blocks fetched
   in one request. */
async function zbRangeBlocks(source, first, last) {
  const runs = [];
  for (let b = first; b <= last; b++) {
    if (ZB_RANGE_BLOCKS.has(source.url + '#' + b) || source.coming.has(b)) continue;
    if (runs.length && runs[runs.length - 1][1] === b - 1) runs[runs.length - 1][1] = b;
    else runs.push([b, b]);
  }
  for (const [a, z] of runs) {
    const p = zbRangeFetch(source, a * ZB_RANGE_BLOCK, Math.min((z + 1) * ZB_RANGE_BLOCK, source.size)).then(bytes => {
      for (let b = a; b <= z; b++) {
        ZB_RANGE_BLOCKS.set(source.url + '#' + b, bytes.subarray((b - a) * ZB_RANGE_BLOCK, (b - a + 1) * ZB_RANGE_BLOCK));
        source.coming.delete(b);
      }
    }, err => { for (let b = a; b <= z; b++) source.coming.delete(b); throw err; });
    for (let b = a; b <= z; b++) source.coming.set(b, p);
  }
  for (let b = first; b <= last; b++) if (source.coming.has(b)) await source.coming.get(b);
  // The blocks just used move to the back, and past the limit the oldest are dropped.
  const out = [];
  for (let b = first; b <= last; b++) { const k = source.url + '#' + b, v = ZB_RANGE_BLOCKS.get(k); ZB_RANGE_BLOCKS.delete(k); ZB_RANGE_BLOCKS.set(k, v); out.push(v); }
  while (ZB_RANGE_BLOCKS.size > ZB_RANGE_KEEP) ZB_RANGE_BLOCKS.delete(ZB_RANGE_BLOCKS.keys().next().value);
  return out;
}

async function zbRangeFetch(source, start, end) {
  const res = await fetch(source.url, { headers: { Range: `bytes=${start}-${end - 1}` } });
  if (res.status !== 206 && !(res.status === 200 && start === 0 && end === source.size)) {
    throw new Error(`${source.url} answered ${res.status} to a request for bytes ${start} to ${end - 1}.`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== end - start) throw new Error(`${source.url} sent ${bytes.length} bytes for a request of ${end - start}.`);
  return bytes;
}

/* The file at an address, its size read with a HEAD request. */
async function zbRangeOpen(url, name) {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}.`);
  const size = +res.headers.get('Content-Length');
  if (!size) throw new Error(`${url} gave no size.`);
  return zbRangeFileAt(url, size, name);
}

/* The file at an address whose size is known. Its path in the folder,
   if given, is kept as remakePath, as a dropped folder's files have it. */
function zbRangeFileAt(url, size, name, path) {
  const f = new ZbRangeFile({ url, size, coming: new Map() }, 0, size, name);
  if (path) f.remakePath = path;
  return f;
}

/* An index of a folder at an address, beside its files as
   snoidgrimoire-index.bin. A web server gives no list of a folder, so the
   index has the files' paths and sizes. It also has the first
   bytes of each Unity file, up to the end of its SerializedFile header,
   cut out of the files as they are, so that opening reads one file and
   not every Unity file's header, a request each. Of the remake's Android
   build that is about 1,400 headers, under 1 MB, spread over the 1 GB
   asset pack. The layout: "ZBAX", the length of a JSON text as 4 bytes
   little-endian, the text, { files: [[path, size]], heads: [[name, file
   size, length]] }, and then the heads' bytes in order. */
const ZB_ADDRESS_INDEX = 'snoidgrimoire-index.bin';
function zbAddressIndexWrite(files, heads) {
  const text = new TextEncoder().encode(JSON.stringify({ files, heads: heads.map(([n, size, bytes]) => [n, size, bytes.length]) }));
  const out = new Uint8Array(8 + text.length + heads.reduce((t, h) => t + h[2].length, 0));
  out.set([0x5a, 0x42, 0x41, 0x58]);
  new DataView(out.buffer).setUint32(4, text.length, true);
  out.set(text, 8);
  let at = 8 + text.length;
  for (const [, , bytes] of heads) { out.set(bytes, at); at += bytes.length; }
  return out;
}
function zbAddressIndexRead(bytes) {
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'ZBAX') throw new Error('This is not an index of SnoidGrimoire\'s.');
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  const { files, heads } = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n)));
  const out = new Map();
  let at = 8 + n;
  for (const [name, size, length] of heads) { out.set(name, { size, bytes: bytes.slice(at, at + length) }); at += length; }
  return { files, heads: out };
}

/* Whether a file of a build's folder goes in its index: an APK, a file
   directly in a folder named Data, the metadata, or the code. */
function zbAddressIndexWants(path) {
  if (/(^|\/)\./.test(path)) return false;
  return /\.apk$/i.test(path) || /(^|\/)Data\/[^/]+$/.test(path) || /(^|\/)(global-metadata\.dat|UnityFramework|GameAssembly\.dylib|UnityPlayer\.dylib)$/.test(path);
}

/* The index of a folder's files, given as [{ path, file }]: the APKs, or
   an app's Unity files (those directly in a folder named Data), its
   metadata and its code. The heads are those of the Unity files, out of
   the APKs where the folder has APKs. */
async function zbAddressIndexBuild(entries) {
  const apks = entries.filter(e => /\.apk$/i.test(e.path));
  const unity = apks.length ? await zbApkFiles(apks.map(e => e.file)) : entries.filter(e => /(^|\/)Data\/[^/]+$/.test(e.path)).map(e => e.file);
  const heads = [];
  for (const f of unity) {
    if (/\.(resS|resource)$/i.test(f.name)) continue;
    const n = zbUnityHeaderSize(new Uint8Array(await f.slice(0, 48).arrayBuffer()));
    if (n && n < f.size) heads.push([f.name, f.size, new Uint8Array(await f.slice(0, n).arrayBuffer())]);
  }
  return zbAddressIndexWrite(entries.map(e => [e.path, e.file.size]), heads);
}

/* Parts read one after another. A part is a Blob or a file-like. */
class ZbJoinedFile {
  constructor(parts, name = '') {
    this.parts = parts; this.name = name; this.type = '';
    this.size = parts.reduce((n, p) => n + p.size, 0);
  }
  slice(start, end) {
    const [s, e] = zbSliceBounds(this.size, start, end), out = [];
    let at = 0;
    for (const p of this.parts) {
      const a = Math.max(s, at), z = Math.min(e, at + p.size);
      if (a < z) out.push(p.slice(a - at, z - at));
      at += p.size;
    }
    return new ZbJoinedFile(out);
  }
  async arrayBuffer() {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const bytes of await Promise.all(this.parts.map(p => p.arrayBuffer()))) { out.set(new Uint8Array(bytes), at); at += bytes.byteLength; }
    return out.buffer;
  }
  stream() { return zbSliceStream(this); }
}

/* A file made the first time it is read: make() gives a Blob or a
   file-like of the size given. */
class ZbLazyFile {
  constructor(make, size, name = '') { this.make = make; this.size = size; this.name = name; this.type = ''; this.made = null; }
  whole() { return this.made || (this.made = this.make()); }
  slice(start, end) {
    const [s, e] = zbSliceBounds(this.size, start, end);
    return new ZbLazyFile(async () => (await this.whole()).slice(s, e), e - s);
  }
  async arrayBuffer() { return (await this.whole()).arrayBuffer(); }
  stream() { return zbSliceStream(this); }
}

/* A file made from parts: a real File where every part is a Blob. */
function zbFileOf(parts, name) {
  return parts.every(p => typeof Blob !== 'undefined' && p instanceof Blob) ? new File(parts, name) : new ZbJoinedFile(parts, name);
}

if (typeof module !== 'undefined') module.exports = { ZbRangeFile, ZbJoinedFile, ZbLazyFile, zbRangeOpen, zbRangeFileAt, zbFileOf, zbSliceBounds, zbAddressIndexWrite, zbAddressIndexRead, zbAddressIndexBuild, zbAddressIndexWants, ZB_RANGE_BLOCK, ZB_ADDRESS_INDEX };
