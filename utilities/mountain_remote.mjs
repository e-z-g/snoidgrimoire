// Mountain Rescue from archive.org, as the page reads it: the disc's
// listing through /cors/, the game's files among it, and three files
// fetched through the same address, compared with the disc unpacked in
// reference/mountain-rescue/disc. Needs the network. Prints what it
// finds and exits 1 on a difference.
import fs from 'node:fs';
import path from 'node:path';
import { REF, site } from './load.mjs';

const S = site({ files: ['js/zb-mountain.js'] });
const base = 'https://archive.org/cors/zoombinis-mountain-rescue-cd-rom-iso/Zoombinis.iso/';
const res = await fetch(base, { headers: { Origin: 'https://e-z-g.github.io' } });
const html = await res.text();
const list = S.mrArchiveListing(html, 'Zoombinis.iso'), game = S.mrGameFiles(list, f => f.path);
console.log(`listing ${res.status}, CORS ${res.headers.get('access-control-allow-origin')}, ${list.length} files, ${game.size} of the game's`);
let bad = 0;
for (const key of ['bmp/aquacube/ball.rb', 'bmp/waterslide/edge neutre.rb', 'sounds/music/zmr-mapscreen.wav']) {
  const f = game.get(key);
  if (!f) { bad++; console.log('FAIL not listed: ' + key); continue; }
  const r = await fetch(base + encodeURIComponent(f.path), { headers: { Origin: 'https://e-z-g.github.io' } });
  const b = Buffer.from(await r.arrayBuffer()), disc = fs.readFileSync(path.join(REF, 'mountain-rescue', 'disc', f.path));
  const same = b.equals(disc);
  if (!same) bad++;
  console.log(`${same ? 'ok  ' : 'FAIL'} ${f.path}: ${r.status}, CORS ${r.headers.get('access-control-allow-origin')}, ${b.length} bytes`);
}
process.exit(bad ? 1 : 0);
