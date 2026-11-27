// Writes Island Odyssey's mod (js/zb-odyssey-mod.js): z3common.bul with
// every Zoombini part drawn as the 1996 game draws it, and root.inx, the
// index, with that bundle's records moved, into <out>, from the 1996 ZOOMBINI.MHK and PICKER.MHK in
// reference/disc and Island Odyssey's disc in reference/island-odyssey (or
// $ZB_ODYSSEY).
//   node utilities/io_mod_write.mjs <out>
import fs from 'node:fs';
import path from 'node:path';
import { REF, site, archiveBytes } from './load.mjs';

const out = process.argv[2];
if (!out) { console.log('usage: node utilities/io_mod_write.mjs <out>'); process.exit(2); }
const IO = process.env.ZB_ODYSSEY || path.join(REF, 'island-odyssey'), DISC = path.join(IO, 'disc');
const Z = site();
const arc = Z.openMohawk(archiveBytes('ZOOMBINI')), picker = Z.openMohawk(archiveBytes('PICKER'));
const sheet = Z.zbSnoidSheet(arc, 'zoombini');
const pal = Z.zbWindowsPalette(Z.zbPalette(Z.parsePaletteResource(picker.get('SHPL', 4000), 'SHPL')));
const exe = new Uint8Array(fs.readFileSync(path.join(DISC, 'HD/Win/Zoombinis Island Odyssey.exe')));
const bul = new Uint8Array(fs.readFileSync(path.join(DISC, 'HD/rsc/z3common.bul')));
const t0 = Date.now();
const kind = Z.ioCharacterKinds(exe).find(k => k.kind === 0);
const byName = new Map(Z.ioEntries(bul).map(e => [e.name, e]));
const { parts, scale } = Z.ioModParts(bul, byName, kind, sheet, pal, id => Z.parseScript(arc.get('SCRS', id), 'SCRS'));
const inx = new Uint8Array(fs.readFileSync(path.join(DISC, 'HD/rsc/root.inx')));
const written = Z.ioModBundle(bul, inx, parts), modded = written.bul;
// read back: the index's records tile the new bundle, and every new part
// parses where its record puts it
const back = Z.ioModRecords(written.inx, modded);
for (const r of back.records) if (parts.has(r.name)) Z.ioAo(modded, r.at + r.name.length + 1);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'z3common.bul'), modded);
fs.writeFileSync(path.join(out, 'root.inx'), written.inx);
console.log(`${parts.size} parts redone at scale ${scale.toFixed(3)}, z3common.bul ${(bul.length / 1e6).toFixed(1)} MB to ${(modded.length / 1e6).toFixed(1)} MB, bundle ${written.bundle}'s ${back.records.length} records in root.inx moved and read back, in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
