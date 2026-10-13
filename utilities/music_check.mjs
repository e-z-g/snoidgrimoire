// The tunes, made into what QuickTime's instruments play (js/zb-music.js):
//   - every tMID of MIDIMAC and MIDIMPC becomes a tune with nothing left
//     out: as many notes as the MIDI file has note-ons with a velocity, none
//     of them on a part past the 32nd, no controller dropped, and as long as
//     the file is;
//   - a file that does not begin as a MIDI file is refused, not played;
//   - with QuickTime 3's installer at reference/quicktime/QUICKTIM.EXE
//     (archive.org, apple-quicktime-3; the page fetches the same file),
//     every part of every tune has an instrument in the set, and the
//     shortest tune and one long one render to sound that is not silence,
//     the same twice over.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { site, archiveBytes, REF, DATA } from './load.mjs';

if (!fs.existsSync(DATA)) { console.log('SKIP: no reference/disc/DATA'); process.exit(0); }
const S = site();
let fails = 0;
const fail = m => { console.log('FAIL ' + m); fails++; };

const exe = path.join(REF, 'quicktime', 'QUICKTIM.EXE');
const lib = fs.existsSync(exe) ? S.qtInstrumentsFromFile(new Uint8Array(fs.readFileSync(exe))) : null;
let tunes = 0, notes = 0, rendered = 0;
for (const name of ['MIDIMAC', 'MIDIMPC']) {
  const arc = S.openMohawk(archiveBytes(name));
  for (const { id } of arc.list('tMID')) {
    const file = S.parseMohawkMidi(arc.get('tMID', id)).file, what = `${name} ${id}`;
    let t;
    try { t = S.zbTuneFromMidi(file, lib); } catch (e) { fail(`${what}: ${e.message}`); continue; }
    tunes++;
    const midi = S.midiRead(file), ons = midi.events.filter(e => e.kind === 0x90 && e.d2 > 0).length;
    if (t.notes !== ons) fail(`${what}: ${t.notes} notes in the tune, ${ons} in the file`);
    if (t.events.filter(e => e.k === 'note').length !== ons) fail(`${what}: the tune read back has other notes than were written`);
    const left = Object.entries(t.dropped).filter(([why]) => !/^controller /.test(why));
    if (left.length) fail(`${what}: left out ${left.map(([w, n]) => n + ' ' + w).join(', ')}`);
    const last = midi.events.length ? midi.events[midi.events.length - 1].sec : 0;
    if (Math.abs(t.seconds - last) > 1 && t.seconds < last) fail(`${what}: ${t.seconds.toFixed(1)} s of a file ${last.toFixed(1)} s long`);
    notes += ons;
    if (lib) for (const p of t.parts) if (!S.qtToneInstrument(lib, { instrument: p.instrument, gm: p.gm })) fail(`${what}: no instrument ${p.instrument} in the set`);
    if (lib && (id === 30000 || (name === 'MIDIMAC' && id === 30001))) {
      const sha = () => { const r = S.zbTuneWav(file, lib); return { h: createHash('sha256').update(r.wav).digest('hex'), r }; };
      const a = sha(), b = sha(), pcm = new Int16Array(a.r.wav.buffer, a.r.wav.byteOffset + 44, (a.r.wav.length - 44) >> 1);
      let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v));
      if (a.h !== b.h) fail(`${what}: rendered twice, two sounds`);
      if (peak < 8000) fail(`${what}: renders to near silence (peak ${peak})`);
      if (a.r.missing.length) fail(`${what}: no instrument for part ${a.r.missing.join(', ')}`);
      rendered++;
    }
  }
}
{
  const arc = S.openMohawk(archiveBytes('MIDIMAC')), file = S.parseMohawkMidi(arc.get('tMID', 30001)).file;
  let threw = false;
  const bad = file.slice(); bad[0] = 0x58;
  try { S.zbTuneFromMidi(bad, lib); } catch (e) { threw = /does not begin MThd/.test(e.message); }
  if (!threw) fail('a file that does not begin MThd was made into a tune');
}
console.log(`${tunes} tunes made, ${notes} notes, nothing left out` + (lib ? `; every part has one of the ${lib.ids.length} instruments; ${rendered} rendered, the same twice` : '; no reference/quicktime/QUICKTIM.EXE, so nothing rendered'));
process.exit(fails ? 1 : 0);
