/* zb-vorbis.js -- the remake's Vorbis sounds as Ogg files the browser
   plays. An FSB5 bank stores a Vorbis sound as bare audio packets, each a
   16-bit length and its bytes, and leaves out the three Vorbis headers.
   The first two are written here from the bank's rate and channels. The
   third, the setup header with the codebooks, is the same for many sounds.
   FMOD's library has a set of them, and the bank has only the CRC-32 of
   the one it needs. FMOD is linked into the remake's UnityFramework, so
   the setup headers are found there: each starts with 5 and "vorbis", and
   the one whose CRC-32 matches the bank's is the one.
   Ogg pages need the sample position of the packets that end on them.
   A packet's samples are a quarter of the last packet's block and a
   quarter of the packet's block, which is long or short by its mode, the
   bits after its first. The modes' long or short flags are read from the
   setup header backwards, as ffmpeg's vorbis_parser does, since the modes
   are its last part.
   WHERE IT CAME FROM
   The Vorbis I specification (headers, packet modes, sample counts), the
   Ogg framing specification (pages, lacing, CRC with polynomial
   0x04c11db7), ffmpeg's libavcodec/vorbis_parser.c (modes read
   backwards), and vgmstream's fsb5 and fsb_vorbis code (the packet
   layout, block sizes 256 and 2048, the setup header by CRC-32). Checked
   by utilities/remake_check.mjs against FMOD's decoding of every Vorbis
   sound of the iPhone build, through UnityPy.
   =========================================================================
   Pure: bytes in, bytes out. Used by page-unity.js. */

const ZB_VORBIS_BLOCKS = [256, 2048];

/* CRC-32 as zlib computes it, which is FMOD's for the setup headers. */
const ZB_CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/* Every setup header in a library whose CRC-32 is among `crcs`: a Map
   from the CRC to the header's bytes. A header runs from its 5 "vorbis"
   to at most the next one, and its end is where the running CRC matches. */
function zbVorbisSetups(bytes, crcs) {
  const want = new Set(crcs), found = new Map(), starts = [];
  for (let i = bytes.indexOf(5); i >= 0 && i + 7 <= bytes.length; i = bytes.indexOf(5, i + 1)) {
    if (bytes[i + 1] === 0x76 && bytes[i + 2] === 0x6f && bytes[i + 3] === 0x72 && bytes[i + 4] === 0x62 && bytes[i + 5] === 0x69 && bytes[i + 6] === 0x73) starts.push(i);
  }
  starts.forEach((at, k) => {
    const end = Math.min(bytes.length, k + 1 < starts.length ? starts[k + 1] : at + 65536);
    let c = 0xffffffff;
    for (let i = at; i < end; i++) {
      c = ZB_CRC32[(c ^ bytes[i]) & 255] ^ (c >>> 8);
      const crc = (c ^ 0xffffffff) >>> 0;
      if (want.has(crc) && !found.has(crc)) { found.set(crc, bytes.slice(at, i + 1)); break; }
    }
  });
  return found;
}

/* Each mode's flag, long (1) or short (0), read from the setup header's end. */
function zbVorbisModes(setup) {
  const n = setup.length, bits = n * 8;
  // Bit i counted from the header's last bit backwards.
  const bit = i => (setup[n - 1 - (i >> 3)] >> (7 - (i & 7))) & 1;
  const read = (pos, len) => { let v = 0; for (let k = 0; k < len; k++) v = (v << 1) | bit(pos + k); return v; };
  let p = 0;
  while (p < bits - 97 && !bit(p)) p++;
  const framing = ++p;
  let count = 0, last = 0;
  while (bits - p >= 97) {
    if (read(p, 8) > 63 || read(p + 8, 16) || read(p + 24, 16)) break;
    p += 41;
    count++;
    if (count > 64) break;
    if (read(p, 6) + 1 === count) last = count;
  }
  const flags = [];
  p = framing;
  for (let i = last - 1; i >= 0; i--) { p += 40; flags[i] = bit(p); p++; }
  return flags;
}

const ZB_OGG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1; t[n] = c >>> 0; }
  return t;
})();

/* One Ogg page. flags: 2 first, 4 last. */
function zbOggPage(packets, granule, seq, flags) {
  const lacing = [];
  for (const pk of packets) {
    let left = pk.length;
    while (left >= 255) { lacing.push(255); left -= 255; }
    lacing.push(left);
  }
  const body = packets.reduce((n, pk) => n + pk.length, 0);
  const out = new Uint8Array(27 + lacing.length + body), v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);
  v.setBigInt64(6, BigInt(granule), true);
  v.setUint32(14, 1, true);
  v.setUint32(18, seq, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const pk of packets) { out.set(pk, o); o += pk.length; }
  let c = 0;
  for (let i = 0; i < out.length; i++) c = (ZB_OGG_CRC[((c >>> 24) ^ out[i]) & 255] ^ (c << 8)) >>> 0;
  v.setUint32(22, c, true);
  return out;
}

/* A Vorbis sample of an FSB5 bank as an Ogg file, given its setup header. */
function zbFsbOgg(s, setup) {
  const id = new Uint8Array(30), iv = new DataView(id.buffer);
  id.set([1, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  id[11] = s.channels;
  iv.setUint32(12, s.rate, true);
  id[28] = 8 | (11 << 4);
  id[29] = 1;
  const vendor = new TextEncoder().encode('SnoidGrimoire');
  const comment = new Uint8Array(7 + 4 + vendor.length + 4 + 1), cv = new DataView(comment.buffer);
  comment.set([3, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  cv.setUint32(7, vendor.length, true);
  comment.set(vendor, 11);
  comment[comment.length - 1] = 1;
  const modes = zbVorbisModes(setup), modeBits = Math.max(0, Math.ceil(Math.log2(modes.length)));
  const pages = [zbOggPage([id], 0, 0, 2), zbOggPage([comment, setup], 0, 1, 0)];
  const d = s.data, packets = [];
  let p = 0;
  while (p + 2 <= d.length) {
    const len = d[p] | (d[p + 1] << 8);
    if (!len) break;
    packets.push(d.subarray(p + 2, p + 2 + len));
    p += 2 + len;
  }
  let seq = 2, granule = 0, prev = 0, batch = [], lacing = 0;
  packets.forEach((pk, i) => {
    const mode = modeBits ? (pk[0] >> 1) & ((1 << modeBits) - 1) : 0;
    const block = ZB_VORBIS_BLOCKS[modes[mode] ? 1 : 0];
    if (prev) granule += prev / 4 + block / 4;
    prev = block;
    batch.push(pk);
    lacing += Math.floor(pk.length / 255) + 1;
    const last = i === packets.length - 1;
    if (last || lacing > 200) {
      pages.push(zbOggPage(batch, last ? Math.min(granule, s.count) : granule, seq++, last ? 4 : 0));
      batch = [];
      lacing = 0;
    }
  });
  const out = new Uint8Array(pages.reduce((n, pg) => n + pg.length, 0));
  let o = 0;
  for (const pg of pages) { out.set(pg, o); o += pg.length; }
  return out;
}

if (typeof module !== 'undefined') module.exports = { zbVorbisSetups, zbVorbisModes, zbFsbOgg };
