// Writes the Mountain Rescue walk mod (js/zb-mountain-mod.js): the five
// walk sets and the other sets (MR_MOD_EXTRAS) as .anm files and
// zoombini2.exe patched to load them, into <out>/zombis/zb96walk<feet>.anm
// and zb96<key><feet>.anm, <out>/zoombini2.exe and the Mac program
// <out>/Zoombinis2 (its data fork), with the 1996
// ZOOMBINI.MHK and PICKER.MHK from reference/disc and Mountain Rescue's
// disc from reference/mountain-rescue (or $ZB_MOUNTAIN).
//   node utilities/mr_mod_write.mjs <out>
import fs from 'node:fs';
import path from 'node:path';
import { REF, site, archiveBytes } from './load.mjs';

const out = process.argv[2];
if (!out) { console.log('usage: node utilities/mr_mod_write.mjs <out>'); process.exit(2); }
const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue'), DISC = path.join(MR, 'disc');
const Z = site();
const arc = Z.openMohawk(archiveBytes('ZOOMBINI')), picker = Z.openMohawk(archiveBytes('PICKER'));
const sheet = Z.zbSnoidSheet(arc, 'zoombini');
const pal = Z.zbWindowsPalette(Z.zbPalette(Z.parsePaletteResource(picker.get('SHPL', 4000), 'SHPL')));
const anm = new Uint8Array(fs.readFileSync(path.join(DISC, 'Data/Bmp/ZOMBIS/littleZomb.anm')));
const scripts = id => Z.parseScript(arc.get('SCRS', id), 'SCRS');
const t0 = Date.now();
const sets = Z.mrModWalkSets(anm, sheet, pal, scripts);
fs.mkdirSync(path.join(out, 'zombis'), { recursive: true });
const names = sets.map(s => `./bmp/zombis/zb96walk${s.feet}.anm`), groups = Z.mrModGroups(sets);
for (const g of groups.slice(1)) g.sets.forEach((s, i) => {
  const b = Z.mrAnmWrite(s.slots);
  Z.mrAnmSlots(b);
  fs.writeFileSync(path.join(out, 'zombis', path.basename(g.names[i])), b);
  console.log(`${path.basename(g.names[i])}: ${s.ticks} ticks, limit ${s.limit}, ${(b.length / 1e6).toFixed(2)} MB`);
});
for (const s of sets) {
  const b = Z.mrAnmWrite(s.slots);
  Z.mrAnmSlots(b);
  fs.writeFileSync(path.join(out, 'zombis', `zb96walk${s.feet}.anm`), b);
  console.log(`feet ${s.feet} (${Z.MR_LOOK_NAMES.feet[s.feet - 1]}): ${s.ticks} ticks, ${s.ms} ms, limit ${s.limit}, ${s.width}x${s.height}, lifted ${s.dx}, ${s.dy}, scale ${s.scale.toFixed(3)}, ${(b.length / 1e6).toFixed(1)} MB`);
}
const exe = new Uint8Array(fs.readFileSync(path.join(DISC, 'INSTALL/hd/zoombini2.exe')));
fs.writeFileSync(path.join(out, 'zoombini2.exe'), Z.mrModExe(exe, groups));
// the Mac program, from the Classic installer as unar unpacks it
const MAC = path.join(MR, 'mac/classic/Zoombini2 Installer/Zoombinis Mountain Rescue/Zoombinis2');
if (fs.existsSync(MAC)) fs.writeFileSync(path.join(out, 'Zoombinis2'), Z.mrModMac(new Uint8Array(fs.readFileSync(MAC)), sets, names));
console.log(`written to ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
