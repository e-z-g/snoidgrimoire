// Headless Chrome over its DevTools protocol on a pipe, and a static server
// over the repository: what a check needs to open the page in a real browser.
// StarGrimoire's utilities/browser.mjs, which is grimoire's
// utilities/browser_check.mjs (same authors, same licence) cut to the parts
// used there.
//
//   const srv = await serve();                    // http://127.0.0.1:<port>/
//   const r = await loadPage(srv.base + 'index.html', 'expr', 60000, { then: async p => ... });
//   srv.close();
//
// Chrome is found through $CHROME, then the PATH, then the Mac's Applications
// folder; findChrome() returns null without one and the caller skips.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync, createReadStream, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { ROOT } from './load.mjs';

export function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { const p = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); if (p) return p; } catch (e) { /* not on the path */ }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                   '/Applications/Chromium.app/Contents/MacOS/Chromium',
                   `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`])
    if (existsSync(p)) return p;
  return null;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mhk': 'application/octet-stream', '.iso': 'application/octet-stream' };
export async function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = resolve(ROOT, '.' + path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    let st; try { st = statSync(file); } catch (e) { res.writeHead(404); res.end(); return; }
    if (!st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

class Browser {
  // webgl: draw WebGL in software (SwiftShader) rather than have none.
  constructor(chrome, webgl) {
    this.profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'snoidgrimoire-chrome-'));
    const gpu = webgl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu'];
    this.proc = spawn(chrome, ['--headless=new', ...gpu, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--disable-sync', '--remote-debugging-pipe',
      '--mute-audio', `--user-data-dir=${this.profile}`, 'about:blank'],
      { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    this.next = 1; this.waiting = new Map(); this.listeners = [];
    let buf = '';
    this.proc.stdio[4].setEncoding('utf8');
    this.proc.stdio[4].on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\0')) >= 0) {
        const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
        if (msg.id && this.waiting.has(msg.id)) { const { res, rej } = this.waiting.get(msg.id); this.waiting.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
        else if (msg.method) for (const l of this.listeners) l(msg);
      }
    });
    this.exited = new Promise(r => this.proc.on('exit', r));
  }
  send(method, params = {}, sessionId) {
    const id = this.next++;
    const p = new Promise((res, rej) => {
      const t = setTimeout(() => { this.waiting.delete(id); rej(new Error(method + ' was not answered in 60 s')); }, 60000);
      this.waiting.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
    this.proc.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    return p;
  }
  on(fn) { this.listeners.push(fn); }
  async close() {
    try { await Promise.race([this.send('Browser.close'), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* closing anyway */ }
    const gone = await Promise.race([this.exited.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))]);
    if (!gone) try { this.proc.kill('SIGKILL'); } catch (e) { /* already gone */ }
    try { rmSync(this.profile, { recursive: true, force: true }); } catch (e) { /* a temp dir */ }
  }
}

/* Open a page in a fresh browser, wait until `until` (evaluated in the page)
   is true or the deadline passes, run opts.then with evaluate() and shot(),
   and return what the console and the exception stream said. */
export async function loadPage(url, until, deadlineMs, opts = {}) {
  const b = new Browser(opts.chrome || findChrome(), opts.webgl);
  const log = [];
  let killer;
  const overall = new Promise((_, rej) => { killer = setTimeout(() => rej(new Error('the load did not finish in time')), deadlineMs + 60000); });
  try {
    return await Promise.race([overall, drive()]);
  } catch (e) {
    return { console: log.concat([{ level: 'exception', text: e.message }]), met: false, ms: 0 };
  } finally { clearTimeout(killer); await b.close(); }
  async function drive() {
    const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => b.send(m, p, sessionId);
    b.on(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled')
        log.push({ level: msg.params.type, text: msg.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ') });
      else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        log.push({ level: 'exception', text: (d.exception && d.exception.description) || d.text, where: (d.url || '') + ':' + (d.lineNumber + 1) });
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error')
        log.push({ level: 'error', text: msg.params.entry.text + (msg.params.entry.url ? ' ' + msg.params.entry.url : '') });
    });
    await s('Runtime.enable'); await s('Log.enable'); await s('Page.enable');
    const dev = opts.device || { width: 1280, height: 800, scale: 1, mobile: false };
    await s('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.scale || 1, mobile: !!dev.mobile });
    if (dev.mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await s('Page.navigate', { url });
    const t0 = Date.now();
    let met = false;
    while (Date.now() - t0 < deadlineMs) {
      try { const r = await s('Runtime.evaluate', { expression: until, returnByValue: true }); if (r.result && r.result.value) { met = true; break; } } catch (e) { /* not ready */ }
      await new Promise(r => setTimeout(r, 250));
    }
    const ms = Date.now() - t0;
    let more = null;
    if (opts.then && met) more = await opts.then({
      evaluate: async expr => { const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result ? r.result.value : undefined; },
      shot: async path => { const r = await s('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.data, 'base64')); return path; },
    });
    return { console: log, met, ms, more };
  }
}

export const pageErrors = c => c.filter(l => (l.level === 'error' || l.level === 'exception') && !/favicon\.ico/.test(l.text));
