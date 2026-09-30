// Every resource on the disc that is not a bitmap or a script, read by
// js/zb-mohawk.js and js/zb-bitmap.js to its last byte: the sounds, the
// music, the palettes, the string lists, the cursors, the walk nodes and
// paths, the registration points. There is no second reader of these to
// compare with; each reader throws unless the resource is exactly as long
// as its own counts say, which is the check. What it read is summed up.
import { site, haveDisc, archiveNames, archiveBytes } from './load.mjs';

if (!haveDisc()) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
const seen = {}, facts = {};
const note = (k, v) => { facts[k] = facts[k] || new Map(); facts[k].set(v, (facts[k].get(v) || 0) + 1); };
let bad = 0;
for (const name of archiveNames()) {
  const arc = S.openMohawk(archiveBytes(name));
  const nodes = arc.list('NODE').map(r => [r.id, S.parseWalkNodes(arc.get('NODE', r.id)).length]);
  for (const tag of arc.tags()) {
    if (tag === 'tBMP' || tag === 'SCRS' || tag === 'SCRB') continue;
    for (const r of arc.list(tag)) {
      const b = arc.get(tag, r.id);
      try {
        if (tag === '\0SND') {
          const w = S.parseMohawkWave(b);
          note('SND format', `${w.rate} Hz, ${w.bits}-bit, ${w.channels} channel(s), encoding ${w.encoding}`);
          note('SND cues', `${w.cues.length} cue(s)`);
          note('SND loops', w.loopCount === 0 ? 'no loop' : `loop count ${w.loopCount}`);
        } else if (tag === 'tMID') {
          const m = S.parseMohawkMidi(b);
          note('tMID', `format ${m.header.format}, ${m.header.tracks} track(s), ${m.programs ? 'Prg#' : 'no Prg#'}`);
        } else if (tag === 'SHPL' || tag === 'tPAL') {
          const p = S.parsePaletteResource(b, tag);
          note(tag, `from ${p.start}, ${p.colours.length} colours`);
        } else if (tag === 'STRL') {
          note('STRL', `${S.parseStringList(b).length} string(s)`);
        } else if (tag === 'CURS') {
          S.parseCursor(b); note('CURS', '68 bytes');
        } else if (tag === 'NODE') {
          note('NODE', `${S.parseWalkNodes(b).length} waypoints`);
        } else if (tag === 'PATH') {
          const n = nodes.find(([id]) => id === r.id);
          if (!n) throw new Error('no NODE with its id');
          note('PATH', `${S.parseWalkPaths(b, n[1]).length} path(s)`);
        } else if (tag === 'REGS') {
          S.parseRegs(b); note('REGS', 'read');
        } else {
          throw new Error('no reader for this type');
        }
        seen[tag] = (seen[tag] || 0) + 1;
      } catch (e) {
        bad++;
        console.log(`FAIL ${name} ${S.mohawkTagLabel(tag)} ${r.id}: ${e.message}`);
      }
    }
  }
}
for (const [k, m] of Object.entries(facts)) console.log(`  ${k}: ${[...m].map(([v, c]) => `${v} x${c}`).join('; ')}`);
console.log(`${Object.entries(seen).map(([t, c]) => `${c} ${S.mohawkTagLabel(t)}`).join(', ')}: ${bad ? bad + ' failed' : 'every one read to its last byte'}`);
process.exit(bad ? 1 : 0);
