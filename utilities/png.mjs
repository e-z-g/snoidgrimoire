// A PNG read in node, for the checks that read screenshots.
import zlib from 'node:zlib';

// A PNG's pixels as RGBA: 8 bits a sample, any color type but gray with
// alpha, not interlaced. Enough for a screenshot.
export function readPng(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8, width = 0, height = 0, depth = 0, type = 0, plte = null, trns = null;
  const idat = [];
  while (o < bytes.length) {
    const len = dv.getUint32(o), tag = String.fromCharCode(...bytes.subarray(o + 4, o + 8)), body = bytes.subarray(o + 8, o + 8 + len);
    if (tag === 'IHDR') {
      width = dv.getUint32(o + 8); height = dv.getUint32(o + 12); depth = body[8]; type = body[9];
      if (body[12]) throw new Error('an interlaced PNG');
    } else if (tag === 'PLTE') plte = body;
    else if (tag === 'tRNS') trns = body;
    else if (tag === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  if (depth !== 8) throw new Error(`a PNG of ${depth} bits a sample`);
  const channels = { 0: 1, 2: 3, 3: 1, 6: 4 }[type];
  if (!channels) throw new Error(`a PNG of color type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat.map(b => Buffer.from(b))));
  const stride = width * channels, rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (line[i] + p) & 255;
    }
    for (let x = 0; x < width; x++) {
      const d = 4 * (y * width + x), s = x * channels;
      if (type === 3) { const k = cur[s]; rgba[d] = plte[3 * k]; rgba[d + 1] = plte[3 * k + 1]; rgba[d + 2] = plte[3 * k + 2]; rgba[d + 3] = trns && k < trns.length ? trns[k] : 255; }
      else if (type === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = cur[s]; rgba[d + 3] = 255; }
      else { rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2]; rgba[d + 3] = channels === 4 ? cur[s + 3] : 255; }
    }
    prev = cur;
  }
  return { width, height, rgba };
}

