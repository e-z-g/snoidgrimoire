/* zb-save.js -- a saved game, ZOOM####.TXT, and the roster that names the
   saved games, ZOOMBINI.WHO: read, and written back.
   =========================================================================
   Needs zb-mohawk.js (ZB_TEXT_DECODER), zb-write.js
   (zbCp1252, for a name written fresh), zb-journey.js (ZB_PLACE_BY_KEY,
   ZB_ROUTES) and zb-town.js (ZB_TOWN_REWARDS), for names; read when
   called, not when loaded.

   A saved game is one fixed record, read front to back with no gaps, and
   its length says which release wrote it:
     44,549  v1.0BR   Europe v1.0 and v1.1;
     44,559  v1.1US   the 1996 US disc, and the Korean release: v1.0BR and
                      ten bytes more at the end, the routes' perfect-crossing
                      counters and the town's develop level;
     48,430  v2.0TLC  the later release, small: two flag bytes and the Fleens
                      tables moved, a byte or two of padding after each
                      Zoombini, the previous page in place of the last route;
     48,440  v2.0TLC  the same and the ten bytes.
   In order (v1 offsets): the magic 0x006B and the sticky-mouse delay, both
   big-endian, and from 0x0004 on everything little-endian; the options;
   the Fleens trait rotations; Shelter Rock's mushrooms; sixteen page flags
   (0x0028), each a visit count in its low 12 bits; how many Zoombinis were
   made and are stored where (0x0048); the level flags (0x0050): for each
   route one nibble of route-crossed bits, and for each of the twelve
   puzzles a byte whose low nibble has bit k set when a band left it at
   level k + 1, across or given up at the map, and whose high nibble when
   all of it crossed with none lost on the route before; sixteen reward-building records (0x0062); the four routes'
   levels, 0-3 for levels 1-4 (0x00C2); the last and current page (0x00CA);
   three stored chunks of 625 places, Shelter Rock's, Shade Tree's and the
   town's (0x00CE, 0x3688, 0x6C42); four packs of 32, the isle's, the two
   camps' and the band's (0xA1FC on); a byte for each of the 625 Zoombinis,
   how many times it has been made (0xAB94); and in v1.1US the counters.

   A Zoombini's traits are four bytes, hair, eyes, nose, feet, each 1-5
   (0 for none), and ScummVM's names for the values, in that order, are
   the site's (ZB_TRAIT_SHORT) under other words: Spiked is shaggy hair,
   Balding the tuft, NormalEyed wide eyes, Cyclops one eye, Yellow the
   orange nose. So a trait is the site's own number, unconverted.

   zbSaveRead(bytes) returns every field the layout holds, under ScummVM's
   member names without the underscore (pageFlagBridge, zmbPackActive,
   storedChunkTown ...), the bytes after a name's NUL kept as nameBytes and
   TLC's padding kept, so that zbSaveWrite(zbSaveRead(b)) is b. Beside them,
   read from them and not written: band (the band now), where (every
   Zoombini, and where it is), visits, routes (each place's levels, and the
   level the map colours it at), rewards, page and lastPage. A pack's
   entries past its count, and a chunk's places with no traits, are kept:
   they are what the game left there, not Zoombinis. zbSaveOffsets(layout)
   gives where each field begins, zbSaveRoster and zbSaveRosterWrite the
   roster.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch (ied206/scummvm-zoombini, GPL-3.0):
   zoombini_state.h (ZmbStateFile and its per-release offsets, ZmbTrait,
   ZmbStateActivePack, ZmbStateActiveEntry, ZmbStateStoredChunk,
   ZmbStateStoredEntry, ZmbRosterFile, ZmbRosterEntry, ZmbDestPageKind,
   ZmbRouteId) and zoombini_state.cpp (each struct's sync, snoidId,
   getPopulatedEntryCount, setRouteCompletionFlag); the level nibbles as
   zoombini_pages/interactive_base.cpp routeNonOccupiedToRestingPack sets
   them, the map's colours as interactive_rodmap.cpp buildPageRouteLevelMap
   reads them, and which pack entries are live as the packs' skip flags say
   (ZmbStateActivePack). utilities/save_check.mjs holds it to a game saved
   in the 1996 US program, byte for byte both ways. */

const ZB_SAVE_LAYOUTS = [
  { name: 'v1.0BR', size: 44549, tlc: false, counters: false },
  { name: 'v1.1US', size: 44559, tlc: false, counters: true },
  { name: 'v2.0TLC small', size: 48430, tlc: true, counters: false },
  { name: 'v2.0TLC', size: 48440, tlc: true, counters: true },
];
const ZB_SAVE_ROSTER_SIZE = 1606;

/* The page flags, in the file's order, by the site's place keys. */
const ZB_SAVE_PAGE_FLAGS = [
  ['pageFlagIsle', 'PICKER'], ['pageFlagBridge', 'BRIDGE'], ['pageFlagTunnels', 'TUNNELS'], ['pageFlagPizza', 'PIZZA'],
  ['pageFlagBasecamp1', 'BASECAMP'], ['pageFlagFerry', 'FERRY'], ['pageFlagLilly', 'LILLY'], ['pageFlagSlides', 'SLIDES'],
  ['pageFlagFleens', 'FLEENS'], ['pageFlagHotel', 'HOTEL'], ['pageFlagNet', 'NET'], ['pageFlagBasecamp2', 'BCTWO'],
  ['pageFlagCaves', 'CAVES'], ['pageFlagSmoke', 'SMOKE'], ['pageFlagMaze', 'MAZE2'], ['pageFlagTown', 'TOWN'],
];
/* ZmbDestPageKind: the page ids the current page is saved as. */
const ZB_SAVE_PAGES = { 1: 'MAP', 3: 'PICKER', 4: 'BASECAMP', 5: 'BCTWO', 6: 'TOWN', 7: 'BRIDGE', 8: 'TUNNELS',
  9: 'PIZZA', 10: 'FERRY', 11: 'LILLY', 12: 'SLIDES', 13: 'FLEENS', 14: 'HOTEL', 15: 'NET', 16: 'CAVES', 17: 'SMOKE', 18: 'MAZE2' };

/* ---- the serializer: one description, read or written ----------------- */

/* As Common::Serializer: each call reads o[k] from the bytes, or writes it.
   s.offsets has where each of root's fields begins. */
function zbSaveSerializer(bytes, saving, root) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = { pos: 0, saving, offsets: {} };
  const at = (o, k) => { if (o === root && !(k in s.offsets)) s.offsets[k] = s.pos; };
  const field = (n, get, set) => (o, k) => {
    at(o, k);
    if (s.pos + n > bytes.length) throw new Error(`the file ends at ${bytes.length}, inside a field at ${s.pos}`);
    if (saving) set(s.pos, o[k]); else o[k] = get(s.pos);
    s.pos += n;
  };
  s.u8 = field(1, p => dv.getUint8(p), (p, v) => dv.setUint8(p, v));
  s.u16le = field(2, p => dv.getUint16(p, true), (p, v) => dv.setUint16(p, v, true));
  s.s16le = field(2, p => dv.getInt16(p, true), (p, v) => dv.setInt16(p, v, true));
  s.u16be = field(2, p => dv.getUint16(p), (p, v) => dv.setUint16(p, v));
  s.bytes = (o, k, n) => {
    at(o, k);
    if (s.pos + n > bytes.length) throw new Error(`the file ends at ${bytes.length}, inside a field at ${s.pos}`);
    if (saving) { if (o[k].length !== n) throw new Error(`${k} is ${o[k].length} bytes, not ${n}`); bytes.set(o[k], s.pos); }
    else o[k] = bytes.slice(s.pos, s.pos + n);
    s.pos += n;
  };
  /* n of one sync, into o[k] as an array. */
  s.array = (o, k, n, one) => {
    at(o, k);
    if (!saving) o[k] = Array.from({ length: n }, () => ({}));
    if (o[k].length !== n) throw new Error(`${k} has ${o[k].length} entries, not ${n}`);
    for (let i = 0; i < n; i++) one(o[k], i);
  };
  s.numbers = (o, k, n, how) => {
    at(o, k);
    if (!saving) o[k] = new Array(n).fill(0);
    if (o[k].length !== n) throw new Error(`${k} has ${o[k].length} values, not ${n}`);
    for (let i = 0; i < n; i++) how(o[k], i);
  };
  s.record = (o, k, sync) => { at(o, k); if (!saving) o[k] = {}; sync(o[k]); };
  return s;
}

/* A name: a fixed field, NUL-terminated within it; nameBytes keeps all of it. */
function zbSaveName(s, o, n) {
  if (s.saving && !o.nameBytes) {
    const b = zbCp1252(o.name || '');
    if (b.length >= n) throw new Error(`“${o.name}” is longer than ${n - 1} bytes`);
    o.nameBytes = new Uint8Array(n); o.nameBytes.set(b);
  }
  s.bytes(o, 'nameBytes', n);
  if (!s.saving) { const e = o.nameBytes.indexOf(0); o.name = e < 0 ? '' : ZB_TEXT_DECODER.decode(o.nameBytes.subarray(0, e)); }
}

/* ZmbTrait::sync: hair, eyes, nose, feet. */
function zbSaveTraits(s, o) {
  s.record(o, 'traits', t => { s.u8(t, 'hair'); s.u8(t, 'eyes'); s.u8(t, 'nose'); s.u8(t, 'feet'); });
}

/* ZmbStateStoredEntry::sync: a Zoombini resting at a camp or in town. */
function zbSaveStoredEntry(s, o, tlc) {
  zbSaveTraits(s, o);
  s.record(o, 'rect', r => { s.u16le(r, 'bottom'); s.u16le(r, 'right'); s.u16le(r, 'top'); s.u16le(r, 'left'); });
  zbSaveName(s, o, 10);
  if (tlc) s.bytes(o, 'tlcPad', 2);
}
/* ZmbStateStoredChunk::sync: a column index, a count, 625 places. */
function zbSaveStoredChunk(s, o, tlc) {
  s.s16le(o, 'leftmostColumnIdx');
  s.s16le(o, 'storedCount');
  s.array(o, 'entries', 625, (a, i) => zbSaveStoredEntry(s, a[i], tlc));
}
/* ZmbStateActiveEntry::sync: a Zoombini in a pack. */
function zbSaveActiveEntry(s, o, tlc) {
  zbSaveTraits(s, o);
  s.u16le(o, 'posX');
  s.u16le(o, 'posY');
  s.u8(o, 'bIsOccupied');
  zbSaveName(s, o, 10);
  if (tlc) s.bytes(o, 'tlcPad', 1);
}
/* ZmbStateActivePack::sync: a count, two skip flags, 32 entries. */
function zbSaveActivePack(s, o, tlc) {
  s.s16le(o, 'wPackZmbCount');
  s.s16le(o, 'bSkipOccupiedEntries');
  s.s16le(o, 'bSkipUnoccupiedEntries');
  s.array(o, 'entries', 32, (a, i) => zbSaveActiveEntry(s, a[i], tlc));
}

/* ZmbStateFile::sync. */
function zbSaveSync(s, f, layout) {
  const { tlc, counters } = layout;
  s.u16be(f, 'magic006B');
  s.u16be(f, 'autoStickyDelay');
  for (const k of ['flagSfxEnable', 'flagBgmEnable', 'flagStickyMouseEnable', 'flagCursorVisible', 'flagDebug', 'flagAutoStickyMouse']) s.u8(f, k);
  if (tlc) {
    s.u8(f, 'tlcTouchSenseEnable');
    s.u8(f, 'tlcHelpAudioEnable');
    s.u16le(f, 'v2TransitionsDisable');
    s.numbers(f, 'v2FleensTraitValueRotations', 4, s.u8);
    s.numbers(f, 'v2FleensTraitDestSlots', 4, s.u8);
  } else {
    s.u16le(f, 'v1TransitionsDisable');
    s.numbers(f, 'v1FleensTraitValueRotations', 4, s.u8);
    s.numbers(f, 'v1FleensTraitDestSlots', 4, s.u8);
  }
  s.numbers(f, 'bcOneMushroomColors', 5, s.u16le);
  for (const k of ['townScrollCol', 'lessActionFlag', 'fleensHighScore', 'mudballHighScore', 'pickerWaveBoatAnimationState']) s.u16le(f, k);
  for (const [k] of ZB_SAVE_PAGE_FLAGS) s.u16le(f, k);
  for (const k of ['zmbGeneratedCount', 'zmbStoredBC1Count', 'zmbStoredBC2Count', 'zmbStoredTownCount']) s.s16le(f, k);
  s.u8(f, 'levelFlagRouteBigBadHungry');
  s.u8(f, 'levelFlagRouteMontDespair');
  s.u8(f, 'levelFlagLoWhosBayouHiDeepDarkForest');
  s.numbers(f, 'pageLevelFlags', 15, s.u8);
  s.numbers(f, 'memorialYears', 16, s.u16le);
  for (const k of ['memorialMonths', 'memorialDays', 'memorialRoutes', 'memorialLevels']) s.numbers(f, k, 16, s.u8);
  s.numbers(f, 'routeLevels', 4, s.s16le);
  if (tlc) { s.s16le(f, 'v2PreviousPage'); s.s16le(f, 'currentPage'); }
  else { s.s16le(f, 'currentRoute'); s.s16le(f, 'currentPage'); }
  for (const k of ['storedChunkBC1', 'storedChunkBC2', 'storedChunkTown']) s.record(f, k, c => zbSaveStoredChunk(s, c, tlc));
  for (const k of ['zmbPackIsle', 'zmbPackBC1', 'zmbPackBC2', 'zmbPackActive']) s.record(f, k, p => zbSaveActivePack(s, p, tlc));
  s.bytes(f, 'twinGenStatus', 625);
  if (tlc) s.u8(f, 'v2TwinGenStatusPad');
  if (counters) {
    s.numbers(f, 'routePerfectCounters', 4, s.s16le);
    s.s16le(f, 'townDevelopLevel');
  }
}

/* ---- reading ---------------------------------------------------------- */

function zbSaveLayout(size) {
  const layout = ZB_SAVE_LAYOUTS.find(l => l.size === size);
  if (!layout) throw new Error(`a saved game is ${ZB_SAVE_LAYOUTS.map(l => l.size.toLocaleString('en')).join(', ')} bytes; this is ${size}`);
  return layout;
}

/* ZmbTrait::snoidId: 0-624, or -1 when a trait is missing. */
function zbSaveSnoidId(t) {
  const ok = [t.hair, t.eyes, t.nose, t.feet].every(v => v >= 1 && v <= 5);
  return ok ? (t.hair - 1) * 125 + (t.eyes - 1) * 25 + (t.nose - 1) * 5 + (t.feet - 1) : -1;
}
function zbSaveComplete(t) { return zbSaveSnoidId(t) >= 0; }

/* A pack's live entries: the first wPackZmbCount, less those its skip flags
   leave out (ZmbStateActivePack: 1/0 only the unoccupied, 0/1 only the
   occupied). */
function zbSaveLive(pack) {
  const n = Math.max(0, Math.min(pack.wPackZmbCount, pack.entries.length));
  return pack.entries.slice(0, n).filter(e => !(pack.bSkipOccupiedEntries && e.bIsOccupied) && !(pack.bSkipUnoccupiedEntries && !e.bIsOccupied));
}
/* A chunk's Zoombinis: its places with all four traits (getPopulatedEntryCount). */
function zbSaveStored(chunk) {
  return chunk.entries.map((e, slot) => ({ e, slot })).filter(x => zbSaveComplete(x.e.traits));
}

function zbSavePlace(key) {
  const p = typeof ZB_PLACE_BY_KEY !== 'undefined' && ZB_PLACE_BY_KEY.get(key);
  return { key, name: key === 'MAP' ? 'the map' : p ? p.name : key };
}
/* Bit k of a nibble set: level k + 1. */
function zbSaveLevels(nibble) { return [1, 2, 3, 4].filter(l => nibble & (1 << (l - 1))); }

/* The readable views, from the fields. */
function zbSaveViews(f) {
  const zmb = (e, where, extra) => ({ where, traits: { ...e.traits }, name: e.name, snoidId: zbSaveSnoidId(e.traits), ...extra });
  f.band = zbSaveLive(f.zmbPackActive).map(e => zmb(e, 'band', { x: e.posX, y: e.posY, occupied: !!e.bIsOccupied }));
  const fromPack = (pack, where) => zbSaveLive(pack).map(e => zmb(e, where, { occupied: !!e.bIsOccupied, from: 'pack' }));
  const fromChunk = (chunk, where) => zbSaveStored(chunk).map(({ e, slot }) => zmb(e, where, { slot, from: 'chunk', rect: { ...e.rect } }));
  f.where = [
    ...f.band,
    ...fromPack(f.zmbPackIsle, 'PICKER'),
    ...fromPack(f.zmbPackBC1, 'BASECAMP'), ...fromChunk(f.storedChunkBC1, 'BASECAMP'),
    ...fromPack(f.zmbPackBC2, 'BCTWO'), ...fromChunk(f.storedChunkBC2, 'BCTWO'),
    ...fromChunk(f.storedChunkTown, 'TOWN'),
  ];
  f.population = zbSaveStored(f.storedChunkTown).length;

  f.visits = ZB_SAVE_PAGE_FLAGS.map(([k, key]) => ({ ...zbSavePlace(key), raw: f[k], visits: f[k] & 0x0fff,
    hardFirst: !!(f[k] & 0x1000), hardSecond: !!(f[k] & 0x2000) }));

  // Each route: its three puzzles' bytes (pageLevelFlags[3 + 3r + i]) and
  // its own nibble for the camp or town it ends at. The map colours every
  // place on a route at the route's level once it is past level 1, and
  // before that at the nibble itself (buildPageRouteLevelMap).
  const ends = [f.levelFlagRouteBigBadHungry & 15, f.levelFlagLoWhosBayouHiDeepDarkForest & 15,
    f.levelFlagLoWhosBayouHiDeepDarkForest >> 4, f.levelFlagRouteMontDespair & 15];
  const routes = typeof ZB_ROUTES !== 'undefined' ? ZB_ROUTES : null;
  f.routes = [0, 1, 2, 3].map(r => {
    const keys = routes ? routes[r].places : [['PICKER', 'BRIDGE', 'TUNNELS', 'PIZZA', 'BASECAMP'], ['BASECAMP', 'FERRY', 'LILLY', 'SLIDES', 'BCTWO'],
      ['BASECAMP', 'FLEENS', 'HOTEL', 'NET', 'BCTWO'], ['BCTWO', 'CAVES', 'SMOKE', 'MAZE2', 'TOWN']][r];
    const level = f.routeLevels[r] + 1;
    const places = keys.slice(1).map((key, i) => {
      const raw = i < 3 ? f.pageLevelFlags[3 + 3 * r + i] : ends[r];
      return { ...zbSavePlace(key), raw, left: zbSaveLevels(raw & 15), perfect: i < 3 ? zbSaveLevels(raw >> 4) : [],
        map: level > 1 ? level : raw & 15 };
    });
    return { name: routes ? routes[r].name : `route ${r + 1}`, level, crossed: zbSaveLevels(ends[r]),
      perfectCount: f.routePerfectCounters ? f.routePerfectCounters[r] : null, places };
  });

  f.rewards = f.memorialRoutes.map((route, slot) => route ? {
    slot, building: typeof ZB_TOWN_REWARDS !== 'undefined' ? ZB_TOWN_REWARDS[slot] : null,
    route, level: f.memorialLevels[slot], year: f.memorialYears[slot], month: f.memorialMonths[slot], day: f.memorialDays[slot],
  } : null).filter(Boolean);

  const page = id => ZB_SAVE_PAGES[id] ? { id, ...zbSavePlace(ZB_SAVE_PAGES[id]) } : { id, key: null, name: id ? `page ${id}` : 'none' };
  f.page = page(f.currentPage);
  f.lastPage = page(f.layout.tlc ? f.v2PreviousPage : f.currentRoute);
  return f;
}

/* A saved game's bytes, read: every field, and the views above. */
function zbSaveRead(bytes) {
  const layout = zbSaveLayout(bytes.length);
  const f = {}, s = zbSaveSerializer(bytes, false, f);
  zbSaveSync(s, f, layout);
  if (s.pos !== bytes.length) throw new Error(`the ${layout.name} layout reads ${s.pos} of ${bytes.length} bytes`);
  f.layout = layout;
  return zbSaveViews(f);
}

/* The fields of `state` (a read save, changed or not) as a saved game's
   bytes, in its layout. The views are not read: change the fields. */
function zbSaveWrite(state) {
  const layout = state.layout && ZB_SAVE_LAYOUTS.find(l => l.name === state.layout.name) || zbSaveLayout(44559);
  const out = new Uint8Array(layout.size), s = zbSaveSerializer(out, true);
  zbSaveSync(s, state, layout);
  if (s.pos !== out.length) throw new Error(`the ${layout.name} layout wrote ${s.pos} of ${out.length} bytes`);
  return out;
}

/* Where each field begins in a layout ('v1.1US' ...), and its end. */
function zbSaveOffsets(name) {
  const layout = ZB_SAVE_LAYOUTS.find(l => l.name === name);
  if (!layout) throw new Error(`no layout ${name}`);
  const f = {}, s = zbSaveSerializer(new Uint8Array(layout.size), false, f);
  zbSaveSync(s, f, layout);
  return { offsets: s.offsets, end: s.pos };
}

/* ---- the roster ------------------------------------------------------- */

/* ZmbRosterFile::sync: magic 0x006B little-endian, the next ZOOM#### number,
   the count, and 50 entries of a 23-byte name and a 9-byte file stem, each
   NUL-terminated. Returns the used entries, [{ name, file, index }], with
   the header on the array (magic, next, count) and every entry's raw bytes
   in .entries. */
function zbSaveRoster(bytes) {
  if (bytes.length !== ZB_SAVE_ROSTER_SIZE) throw new Error(`a roster is ${ZB_SAVE_ROSTER_SIZE} bytes; this is ${bytes.length}`);
  const s = zbSaveSerializer(bytes, false), head = {};
  s.u16le(head, 'magic006B'); s.u16le(head, 'nextSaveFileNameCounter'); s.u16le(head, 'saveEntryCount');
  s.array(head, 'entries', 50, (a, i) => { s.bytes(a[i], 'saveName', 23); s.bytes(a[i], 'fileName', 9); });
  if (head.magic006B !== 0x006b) throw new Error(`not a Zoombinis roster: its magic is 0x${head.magic006B.toString(16)}`);
  const str = b => { const e = b.indexOf(0); return e < 0 ? null : ZB_TEXT_DECODER.decode(b.subarray(0, e)); };
  const used = head.entries.slice(0, Math.min(head.saveEntryCount, 50)).map((e, index) => ({ index, name: str(e.saveName), file: str(e.fileName) }));
  return Object.assign(used, { magic: head.magic006B, next: head.nextSaveFileNameCounter, count: head.saveEntryCount, entries: head.entries });
}

/* A roster as zbSaveRoster reads it, back to its 1,606 bytes: the header
   from the array's magic, next and count, each used entry's name and file
   put over its raw bytes (zeroed after the NUL only when they changed). */
function zbSaveRosterWrite(roster) {
  const out = new Uint8Array(ZB_SAVE_ROSTER_SIZE), dv = new DataView(out.buffer);
  dv.setUint16(0, roster.magic ?? 0x006b, true); dv.setUint16(2, roster.next, true); dv.setUint16(4, roster.count ?? roster.length, true);
  const put = (raw, s, n) => {
    const e = raw ? raw.indexOf(0) : -1;
    if (raw && e >= 0 && ZB_TEXT_DECODER.decode(raw.subarray(0, e)) === s) return raw;
    const b = zbCp1252(s), f = new Uint8Array(n);
    if (b.length >= n) throw new Error(`“${s}” is longer than ${n - 1} bytes`);
    f.set(b); return f;
  };
  for (let i = 0; i < 50; i++) {
    const raw = roster.entries && roster.entries[i], used = roster[i];
    const name = used ? put(raw && raw.saveName, used.name, 23) : raw ? raw.saveName : new Uint8Array(23);
    const file = used ? put(raw && raw.fileName, used.file, 9) : raw ? raw.fileName : new Uint8Array(9);
    out.set(name, 6 + 32 * i); out.set(file, 6 + 32 * i + 23);
  }
  return out;
}
