// The feature scripts drawn (js/zb-feature.js): the rule that finds a
// script's sheet, checked over the whole disc.
//   - every SCRB that draws a shape has a sheet at or below its number, and
//     draws no shape that sheet lacks;
//   - where a sheet is numbered at the script's hundred (animate.py's
//     render_scrb rule), it is that sheet, but for the seven with a sheet
//     numbered between, which are numbered from it and use only its shapes;
//   - the counts are the ones zb-feature.js states: 1,796 scripts, 1,789
//     drawing something, 192 of them with no sheet at their hundred, seven
//     with a nearer one;
//   - put where their records say, by their registration points, the
//     sprites of nearly every script fall on the 640 x 480 room (those that
//     do not are counted and named), which a wrong sheet or a wrong reading
//     of the points would not give;
//   - a script drawn from an archive without its sheet has no sheet.
import fs from 'node:fs';
import { site, archiveNames, archiveBytes, DATA } from './load.mjs';

if (!fs.existsSync(DATA)) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };
let total = 0, draws = 0, noHundred = 0, onRoom = 0;
const off = [], nearer = [];
for (const name of archiveNames()) {
  const arc = S.openMohawk(archiveBytes(name));
  const decoded = new Map();
  for (const { id } of arc.list('SCRB')) {
    total++;
    const script = S.parseScript(arc.get('SCRB', id), 'SCRB');
    const max = Math.max(0, ...script.frames.flatMap(f => f.records.map(r => r.shape)));
    const sheet = S.zbFeatureSheet(arc, id, script);
    if (!max) { if (sheet) fail(`${name} SCRB ${id}: a sheet for a script that draws nothing`); continue; }
    draws++;
    if (!sheet) { fail(`${name} SCRB ${id}: no sheet at or below it has shape ${max}`); continue; }
    const hundred = Math.floor(id / 100) * 100;
    if (!S.zbFeatureSheets(arc).some(s => s.id === hundred)) noHundred++;
    else if (sheet.id !== hundred) {
      // a sheet between the hundred and the script: theirs if they are numbered from it and use only its few shapes
      nearer.push(`${name} ${id}`);
      if (sheet.id > id || id - sheet.id >= sheet.frames || max > sheet.frames) fail(`${name} SCRB ${id}: tBMP ${sheet.id}, not the sheet at its hundred, and not plainly the script's`);
    }
    if (!decoded.has(sheet.id)) { const frames = S.decodeBitmapResource(arc.get('tBMP', sheet.id)).frames; decoded.set(sheet.id, { frames, regs: S.regsFor(arc, frames.length) }); }
    const { frames, regs } = decoded.get(sheet.id);
    if (frames.length !== sheet.frames) fail(`${name} tBMP ${sheet.id}: ${frames.length} frames decoded, ${sheet.frames} counted`);
    const b = S.zbFeaturePlaced(script, frames, regs).box;
    if (b && b.x1 > 0 && b.y1 > 0 && b.x0 < 640 && b.y0 < 480) onRoom++; else off.push(`${name} ${id}`);
  }
}
if (nearer.join() !== 'CAVES 9025,CAVES 9026,CAVES 9027,CAVES 9028,FERRY 1450,FERRY 1451,FERRY 1452') fail(`a nearer sheet than the hundred's for ${nearer.join(', ')}`);
if (total !== 1796 || draws !== 1789 || noHundred !== 192) fail(`${total} scripts, ${draws} drawing, ${noHundred} with no sheet at their hundred: zb-feature.js has 1,796, 1,789 and 192`);
if (onRoom < draws * 0.97) fail(`only ${onRoom} of ${draws} fall on the room`);
{
  const town = S.openMohawk(archiveBytes('TOWN')), pizza = S.openMohawk(archiveBytes('PIZZA'));
  const id = pizza.list('SCRB')[0].id, script = S.parseScript(pizza.get('SCRB', id), 'SCRB');
  const there = S.zbFeatureSheet(pizza, id, script), wrong = S.zbFeatureSheet(town, 1, script);
  if (!there || wrong) fail('a script with no sheet at or below it was given one');
}
console.log(`${total} feature scripts, ${draws} drawing: each has its sheet, the hundred's where there is one (${noHundred} where there is not, ${nearer.length} with a nearer one); ${onRoom} fall on the room` + (off.length ? `, not ${off.slice(0, 12).join(', ')}${off.length > 12 ? ' and ' + (off.length - 12) + ' more' : ''}` : ''));
process.exit(fails ? 1 : 0);
