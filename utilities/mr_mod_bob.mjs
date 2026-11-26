// How far the 1996 walks move each part from tick to tick, by feet: for
// each walk direction and feet, each part's record per tick relative to
// the feet's record at tick 0. Prints the spread of each part's offset.
import { site, archiveBytes } from './load.mjs';
const Z = site();
const arc = Z.openMohawk(archiveBytes('ZOOMBINI'));
const sheet = Z.zbSnoidSheet(arc, 'zoombini');
for (let dir = 0; dir < 5; dir++) {
  for (let feet = 1; feet <= 5; feet++) {
    const id = 100 + 5 * feet + dir;
    const ticks = Z.zbSnoidTicks(Z.parseScript(arc.get('SCRS', id), 'SCRS'));
    const rows = ticks.map(t => Object.fromEntries(Z.zbSnoidParts(t).map(p => [p.part, [p.x, p.y, p.shape]])));
    const line = ['body', 'hair', 'eyes', 'nose', 'feet'].map(part => {
      const v = rows.filter(r => r[part]).map(r => r[part]);
      const ys = v.map(a => a[1] - v[0][1]), xs = v.map(a => a[0] - v[0][0]), sh = new Set(v.map(a => a[2]));
      return `${part} dy[${ys.join(',')}] dx[${Math.min(...xs)}..${Math.max(...xs)}] shapes ${[...sh].join('/')}`;
    });
    console.log(`dir ${dir} feet ${feet} SCRS ${id}, ${ticks.length} ticks\n  ` + line.join('\n  '));
  }
}
