/* zb-xref.js -- what refers to what, across the archives, and what the site
   reads: the cross-references a resource's view lists.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js, zb-script.js, zb-snoid.js, zb-journey.js
   and the puzzles (zb-puzzle-*.js).

   A reference is taken only where something holds an id, as grimoire takes
   one only where the format says an atom is, never by scanning bytes:

   - the formats: a script frame's sound (SCRS and SCRB end a frame with a
     sound id), which is its own archive's sound, else ZOOMBINI's; a snoid
     script's layout word, which names the snoid it draws and so the sheet
     and registration points it draws with (ZB_SNOID_KINDS);
   - pairs the data proves: a sprite sheet and the REGS pair holding one
     point more than it has sprites (the points are one-based), taken when
     the pair has the sheet's id or is the only pair of that length; NODE
     and PATH of one id;
   - what the site reads, and where: the map's picture, sheet and scripts,
     each place's picture and help, the town's layers, the puzzles' layouts,
     the snoids' sheets (ZB_SITE_READS).

   Keys are 'ARCHIVE/TAG/id', the tag as the address writes it (SND for
   \0SND). zbXref(archives) gives { out, back }: for each key, what it refers
   to and what refers to it, [{ key, why }]; with { pairs: false } it
   leaves out the sheets' REGS, which unpack every bitmap, for a page to
   take an archive at a time (zbXrefSheetRegs). */

const zbXrefKey = (name, tag, id) => `${name}/${mohawkTagLabel(tag)}/${id}`;

/* What the site reads, each with the view that reads it. */
function zbSiteReads() {
  const out = [], add = (name, tag, ids, by, href) => { for (const id of ids) out.push({ key: zbXrefKey(name, tag, id), by, href }); };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // The map (zb-journey.js zbJourneyMap): RODMAP, or MAP whose legend is 1003.
  for (const [name, legend] of [['RODMAP', 1004], ['MAP', 1003]]) {
    add(name, 'tBMP', [300, 1000], 'the map', '#journey');
    add(name, 'SHPL', [300], 'the map', '#journey');
    add(name, 'SCRB', [1000, 1001, legend], 'the map', '#journey');
  }
  // Each place's picture, in the palette of its id, and its help.
  for (const p of ZB_PLACES) {
    const by = p.name, href = `#place=${p.key}`;
    if (p.panorama) { add(p.key, 'tBMP', [p.panorama.sheet], by, href); add(p.key, 'SCRB', [p.panorama.script], by, href); }
    else add(p.key, 'tBMP', p.hard ? [p.background, p.hard] : [p.background], by, href);
    add(p.key, 'SHPL', p.hard ? [p.background, p.hard] : [p.background], by, href);
    add('ZOOMBINI', 'STRL', p.help >= 1700 ? [0, 20, 40, 60].map(k => p.help + k) : [p.help], `${p.name}’s help`, href);
  }
  // The town all round (zb-town.js and page-town.js).
  add('TOWN', 'tBMP', [1000, 4000, 6000], 'the town', '#town');
  add('TOWN', 'SCRB', [...range(1000, 1003), ...range(4000, 4007)], 'the town', '#town');
  add('TOWN', 'REGS', [6000, 6001], 'the town', '#town');
  add('TOWN', '\0SND', range(3000, 3003), 'the town', '#town');
  // The puzzles' layouts, read from their archives.
  add('MAZE2', 'REGS', ZB_MAZE2_LAYOUT_IDS, 'Bubblewonder Abyss', '#solve=MAZE2');
  add('LILLY', 'REGS', ZB_LILLY_ROUTE_REGS, 'Titanic Tattooed Toads', '#solve=LILLY');
  add('FERRY', 'SCRB', range(1510, 1529), 'Captain Cajun’s Ferryboat', '#solve=FERRY');
  add('FERRY', 'tBMP', [1500], 'Captain Cajun’s Ferryboat', '#solve=FERRY');
  // The snoids.
  for (const K of Object.values(ZB_SNOID_KINDS)) {
    add(K.archive, 'tBMP', [K.sheet], 'the snoids', '#scenario/snoids');
    add(K.archive, 'REGS', [K.regs, K.regs + 1], 'the snoids', '#scenario/snoids');
  }
  add('ZOOMBINI', 'SCRS', [ZB_SNOID_STANDING], 'the band, standing', '#scenario/snoids');
  return out;
}

/* A sheet's frame count, or null for a picture, read once. */
const ZB_XREF_SHEETS = new WeakMap();
function zbXrefFrameCount(arc, id) {
  if (!ZB_XREF_SHEETS.has(arc)) ZB_XREF_SHEETS.set(arc, new Map());
  const m = ZB_XREF_SHEETS.get(arc);
  if (!m.has(id)) { const f = tbmpFrameOffsets(arc.get('tBMP', id)); m.set(id, f ? f.offsets.length : null); }
  return m.get(id);
}

/* An archive's sheets and the REGS pairs that hold their points:
   [{ sheet, regs }]. */
function zbXrefSheetRegs(arc) {
  // Pairs in order, each id in one: 200 and 201 a pair, 201 not the start of another.
  const pairs = [];
  let taken = null;
  for (const { id } of arc.list('REGS').slice().sort((p, q) => p.id - q.id)) {
    if (id === taken || !arc.has('REGS', id + 1)) continue;
    const n = parseRegs(arc.get('REGS', id)).length;
    if (n === parseRegs(arc.get('REGS', id + 1)).length) { pairs.push({ id, n }); taken = id + 1; }
  }
  const out = [];
  for (const { id } of arc.list('tBMP')) {
    const count = zbXrefFrameCount(arc, id);
    if (count == null) continue;
    const fit = pairs.filter(p => p.n === count + 1);
    const pick = fit.find(p => p.id === id) || (fit.length === 1 ? fit[0] : null);
    if (pick) out.push({ sheet: id, regs: pick.id });
  }
  return out;
}

/* Every reference among `archives`, a Map of name -> opened archive. */
function zbXref(archives, { pairs = true } = {}) {
  const out = new Map(), back = new Map();
  const link = (from, to, why) => {
    if (!out.has(from)) out.set(from, []);
    if (!back.has(to)) back.set(to, []);
    out.get(from).push({ key: to, why });
    back.get(to).push({ key: from, why });
  };
  const zoombini = archives.get('ZOOMBINI');
  for (const [name, arc] of archives) {
    for (const tag of ['SCRS', 'SCRB']) for (const { id } of arc.list(tag)) {
      let s;
      try { s = parseScript(arc.get(tag, id), tag); } catch (e) { continue; }
      const from = zbXrefKey(name, tag, id);
      for (const snd of new Set(s.frames.map(f => f.sound).filter(x => x > 0))) {
        if (arc.has('\0SND', snd)) link(from, zbXrefKey(name, '\0SND', snd), 'cues');
        else if (zoombini && zoombini.has('\0SND', snd)) link(from, zbXrefKey('ZOOMBINI', '\0SND', snd), 'cues');
      }
      const kind = tag === 'SCRS' ? ZB_SNOID_KIND_OF_LAYOUT[s.layout] : null;
      if (kind) {
        const K = ZB_SNOID_KINDS[kind];
        link(from, zbXrefKey(K.archive, 'tBMP', K.sheet), `draws ${K.name}`);
        link(from, zbXrefKey(K.archive, 'REGS', K.regs), 'places its parts by');
      }
    }
    if (pairs) for (const { sheet, regs } of zbXrefSheetRegs(arc)) {
      link(zbXrefKey(name, 'tBMP', sheet), zbXrefKey(name, 'REGS', regs), 'its registration points, x');
      link(zbXrefKey(name, 'tBMP', sheet), zbXrefKey(name, 'REGS', regs + 1), 'its registration points, y');
    }
    for (const { id } of arc.list('NODE')) if (arc.has('PATH', id)) link(zbXrefKey(name, 'PATH', id), zbXrefKey(name, 'NODE', id), 'joins the waypoints of');
  }
  return { out, back };
}
