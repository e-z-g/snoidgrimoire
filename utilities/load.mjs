// The site's classic scripts, run in one node:vm context the way a page runs
// them in one global scope, in the order index.html loads them. And the
// disc's archives, read from reference/.
//
//   import { site, archiveNames, archiveBytes } from './load.mjs';
//   const S = site();                              // every js/ file the page loads
//   const arc = S.openMohawk(archiveBytes('FLEENS'));
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REF = path.join(ROOT, 'reference');
export const DATA = path.join(REF, 'disc', 'DATA');

// The <script src> list of index.html, in order: the page is the one place it is written.
export function pageScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\b([^>]*)>/g)]
    .map(m => /\bsrc="([^"]+)"/.exec(m[1]))
    .filter(Boolean).map(m => m[1]);
}

export function site(opts = {}) {
  const files = opts.files || pageScripts().filter(f => f.startsWith('js/') && !f.startsWith('js/page-'));
  const ctx = {
    console, TextDecoder, TextEncoder, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array,
    Int32Array, Float32Array, Float64Array, DataView, ArrayBuffer, Math, Error, Map, Set, JSON, Date, Number,
    String, Array, Object, RegExp, Symbol, Promise, parseInt, parseFloat, isFinite, isNaN, Infinity, NaN, BigInt,
    Response, CompressionStream, Blob,
  };
  vm.createContext(ctx);
  const lexical = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
    // A top-level const or let is shared between scripts, as in a page, but
    // is not a property of the global object; lift each onto it for callers.
    for (const m of src.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)) lexical.push(m[1]);
  }
  vm.runInContext(lexical.map(n => `globalThis.${n} = ${n};`).join('\n'), ctx);
  return ctx;
}

export function haveDisc() { return fs.existsSync(DATA); }

// The archives on the disc, by name without .MHK, in directory order.
export function archiveNames() {
  return fs.readdirSync(DATA).filter(f => /\.MHK$/i.test(f)).map(f => f.replace(/\.MHK$/i, '')).sort();
}

export function archiveBytes(name) {
  return new Uint8Array(fs.readFileSync(path.join(DATA, name + '.MHK')));
}
