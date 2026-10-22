/* zb-music.js -- a tune played, through QuickTime's instruments.
   =========================================================================
   A tMID contains notes and never a sound. On a Mac the game handed its tunes
   to QuickTime, which played them through QuickTime Musical Instruments,
   Roland's samples; on Windows they went to whatever MIDI device the
   machine had, so there is no one sound to call the game's there. The
   instruments and the synthesis are grimoire's (js/mac-qtmusic.js, where
   the comments cover how each is read and what is missing), made for Cythera's QTMA
   tunes; a MIDI file reaches them as grimoire's MIDI import makes one a
   tune (midiToQtma).

   WHICH SET. The page can reach one copy, QuickTime 3's (1998, 235
   instruments, the Windows installer archive.org serves). The game is of
   1996, when a Mac had QuickTime 2.1 or 2.5, whose set was smaller (61 in
   2.5, by grimoire's count): a Mac of the game's year sounded like that
   one, and one with QuickTime 3 or later like this. Not compared with a
   recording of either.

   No DOM here. LOAD ORDER: after mac-qtmusic.js and zb-mohawk.js. */

/* QTMA's controller numbers, which midiToQtma writes by name. In grimoire
   they are in its page's script (page-export.js, QTC), which this site
   does not copy; these are that table, not MIDI's numbers. */
const QTC = { ModWheel: 1, Breath: 2, Foot: 4, Volume: 7, Balance: 8, Pan: 10,
  Expression: 11, PitchBend: 32, AfterTouch: 33, PartTranspose: 40,
  TuneTranspose: 41, Sustain: 64, Portamento: 65, Sostenuto: 66, SoftPedal: 67,
  Reverb: 91, Tremolo: 92 };

/* The fields of a tune's part a MIDI file has no word for, which midiToQtma
   copies from a tune given it: QuickTime's built-in synthesizer, unnamed. */
function zbTuneModel() {
  return qtmaWrite([{ part: 0, channel: 1, info: new Uint8Array(8), synthType: new Uint8Array(4), synthName: qtmaStr31(''),
                      instName: qtmaStr31(''), instrument: 1, gm: 1 }], [], {});
}
/* A tMID's MIDI file as what qtmaRender plays: { events, tones, parts,
   notes, seconds, dropped }. */
function zbTuneFromMidi(midiFile, lib) {
  const made = midiToQtma(midiFile, { like: zbTuneModel(), unitsPerSecond: QTMA_UNITS_PER_SECOND,
    name: lib ? (n => lib.has(n) ? lib.get(n).name : '') : null });
  const t = qtmaTune(made.data);
  return { events: t.seq.events, tones: t.tones, parts: made.parts, notes: made.notes, seconds: made.seconds, dropped: made.dropped };
}
/* The tune as a WAV: { wav, seconds, missing, tune }. */
function zbTuneWav(midiFile, lib) {
  const tune = zbTuneFromMidi(midiFile, lib);
  const r = qtmaRender(tune.events, tune.tones, lib, { unitsPerSecond: QTMA_UNITS_PER_SECOND });
  return { wav: qtmaWav(r), seconds: r.left.length / r.rate, missing: r.missing, tune };
}
