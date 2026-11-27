// Writes the Mountain Rescue mod (js/zb-mountain-mod.js): every Zoombini
// set of MR_MOD_SETS redone as the 1996 game draws it, five files a set,
// one for each kind of feet, and zoombini2.exe patched to load them, into
// <out>/zombis/zb96<name><feet>.anm and <out>/zoombini2.exe, and the Mac
// program with the walk alone, <out>/Zoombinis2 (its data fork), from the
// 1996 ZOOMBINI.MHK, BRIDGE.MHK, MAZE2.MHK and PICKER.MHK in reference/disc
// and Mountain Rescue's disc in reference/mountain-rescue (or $ZB_MOUNTAIN).
//   node utilities/mr_mod_write.mjs <out>
import fs from 'node:fs';
import path from 'node:path';
import { REF, site, archiveBytes } from './load.mjs';

const out = process.argv[2];
if (!out) { console.log('usage: node utilities/mr_mod_write.mjs <out>'); process.exit(2); }
const MR = process.env.ZB_MOUNTAIN || path.join(REF, 'mountain-rescue'), DISC = path.join(MR, 'disc');
const Z = site();
const arcs = Object.fromEntries(['ZOOMBINI', 'BRIDGE', 'MAZE2'].map(a => [a, Z.openMohawk(archiveBytes(a))]));
const picker = Z.openMohawk(archiveBytes('PICKER'));
const sheet = Z.zbSnoidSheet(arcs.ZOOMBINI, 'zoombini');
const pal = Z.zbWindowsPalette(Z.zbPalette(Z.parsePaletteResource(picker.get('SHPL', 4000), 'SHPL')));
// a file of the disc's Data/Bmp by its path in lower case
const read = rel => {
  let d = path.join(DISC, 'Data/Bmp');
  for (const part of rel.split('/')) {
    const n = fs.readdirSync(d).find(x => x.toLowerCase() === part);
    if (!n) return null;
    d = path.join(d, n);
  }
  return new Uint8Array(fs.readFileSync(d));
};
const script = (archive, id) => Z.parseScript(arcs[archive].get('SCRS', id), 'SCRS');
const t0 = Date.now();
const groups = Z.mrModGroups(read, sheet, Z.zbSnoidSheet(arcs.ZOOMBINI, 'tumble'), pal, script);
fs.mkdirSync(path.join(out, 'zombis'), { recursive: true });
let bytes = 0;
for (const g of groups) {
  g.sets.forEach((s, i) => {
    const b = Z.mrAnmWrite(s.slots);
    Z.mrAnmSlots(b);
    fs.writeFileSync(path.join(out, 'zombis', path.basename(g.names[i])), b);
    bytes += b.length;
  });
  const s = g.sets;
  console.log(`${g.file}: ${s.map(x => `${x.width}x${x.height}`).join(' ')}, lifted ${s.map(x => `${x.dx},${x.dy}`).join(' ')}, ${s[0].ticks} ${g.walk ? 'ticks' : 'frames'}`);
}
const exe = new Uint8Array(fs.readFileSync(path.join(DISC, 'INSTALL/hd/zoombini2.exe')));
fs.writeFileSync(path.join(out, 'zoombini2.exe'), Z.mrModExe(exe, groups));
// the Mac program, from the Classic installer as unar unpacks it, with the walk alone
const MAC = path.join(MR, 'mac/classic/Zoombini2 Installer/Zoombinis Mountain Rescue/Zoombinis2');
if (fs.existsSync(MAC)) fs.writeFileSync(path.join(out, 'Zoombinis2'), Z.mrModMac(new Uint8Array(fs.readFileSync(MAC)), groups[0].sets, groups[0].names));
console.log(`${groups.length} sets, ${(bytes / 1e6).toFixed(1)} MB, written to ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
