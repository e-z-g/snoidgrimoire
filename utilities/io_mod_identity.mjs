// A test of js/zb-odyssey-mod.js's writer in the game: z3common.bul with
// every Zoombini part that the mod redoes written again through ioModAo
// from the frames and steps it has, unchanged, into <out>/z3common.bul
// and <out>/root.inx.
//   node utilities/io_mod_identity.mjs <out>
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';
const out = process.argv[2];
const DISC = path.join(process.env.ZB_ODYSSEY || path.join(REF, 'island-odyssey'), 'disc');
const Z = site();
const exe = new Uint8Array(fs.readFileSync(path.join(DISC, 'HD/Win/Zoombinis Island Odyssey.exe')));
const bul = new Uint8Array(fs.readFileSync(path.join(DISC, 'HD/rsc/z3common.bul')));
const kind = Z.ioCharacterKinds(exe).find(k => k.kind === 0), byName = new Map(Z.ioEntries(bul).map(e => [e.name, e]));
const { walks, poses } = Z.ioModGroups(kind), ids = new Set();
for (const g of [...walks, ...poses]) for (const v of Object.values(g.ids)) for (const id of [v].flat()) ids.add(id);
for (const p of poses) for (const f of p.fidgets) for (const id of f.eyes) ids.add(id);
const parts = new Map();
for (const id of ids) {
  const e = byName.get(`${id}.ao`);
  if (!e) continue;
  const a = Z.ioAo(bul, e.start);
  const pics = a.frames.map((_, i) => Z.ioAoFrame(bul, a, i));
  const w = Z.ioModAo(a.sequences[0], a.points[0], pics, [...bul.subarray(e.start + 6, e.start + 10)]);
  // with --pad, each one zero-filled to its entry's length, so no entry moves
  const padded = process.argv.includes('--pad') && w.length <= e.end - e.start ? (() => { const p = new Uint8Array(e.end - e.start); p.set(w); return p; })() : w;
  parts.set(`${id}.ao`, padded);
}
fs.mkdirSync(out, { recursive: true });
const w2 = Z.ioModBundle(bul, new Uint8Array(fs.readFileSync(path.join(DISC, 'HD/rsc/root.inx'))), parts);
fs.writeFileSync(path.join(out, 'z3common.bul'), w2.bul);
fs.writeFileSync(path.join(out, 'root.inx'), w2.inx);
console.log(`${parts.size} parts written again`);
