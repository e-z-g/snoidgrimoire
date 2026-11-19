// A server of a build's folder that answers range requests as Cloudflare
// R2 does, and counts the requests and bytes sent. It serves the files in
// `paths`, and the index (snoidgrimoire-index.bin) where given. With `top`,
// the build is the folder top.path under an index of builds, top.index.
// S is the site's scripts (load.mjs).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export function rangeServer(S, dir, paths, index = null, top = null) {
  const sent = { requests: 0, bytes: 0 };
  const server = http.createServer((req, res) => {
    let name = decodeURIComponent(req.url.slice(1).split('?')[0]);
    // With `top`, the build is the folder top.path under an index of builds.
    let topIndex = false;
    if (top) {
      if (name === S.ZB_ADDRESS_INDEX) topIndex = true;
      else if (name.startsWith(top.path)) name = name.slice(top.path.length);
      else name = '';
    }
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range', 'Accept-Ranges': 'bytes' };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    const served = topIndex ? top.index : index && name === S.ZB_ADDRESS_INDEX ? index : null;
    if (!served && !paths.includes(name)) { res.writeHead(404, headers); res.end(); return; }
    const size = served ? served.length : fs.statSync(path.join(dir, name)).size;
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    sent.requests++;
    if (req.method === 'HEAD') { res.writeHead(200, { ...headers, 'Content-Length': size }); res.end(); return; }
    const a = m ? +m[1] : 0, z = m ? Math.min(+m[2], size - 1) : size - 1;
    sent.bytes += z - a + 1;
    res.writeHead(m ? 206 : 200, { ...headers, 'Content-Length': z - a + 1, ...(m ? { 'Content-Range': `bytes ${a}-${z}/${size}` } : {}) });
    if (served) res.end(Buffer.from(served.subarray(a, z + 1)));
    else fs.createReadStream(path.join(dir, name), { start: a, end: z }).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${server.address().port}/`, sent, close: () => server.close() })));
}
