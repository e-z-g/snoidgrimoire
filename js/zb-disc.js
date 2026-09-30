/* zb-disc.js -- the Zoombinis CD: its ISO 9660 side, and what each of its
   archives is.
   =========================================================================
   Needs mac-bytes.js.

   The 1996 disc is a hybrid: an Apple partition map, an ISO 9660 side for
   Windows and an HFS volume for the Mac, sharing the same archives. The
   Zomb's Lair bundle's image has the ISO 9660 side alone. Either way the
   archives are in DATA on the ISO 9660 side, which is all this reads.

   isoFiles is the site's play-lib.js readIso (the Zoombini maker's player),
   the same author's, returning where each file is rather than a copy.
*/

/* Every file on an ISO 9660 image: [{ path, offset, size }], paths as DOS
   sees them, the version suffix and a trailing dot gone. */
function isoFiles(iso) {
  const S = 2048;
  const le32 = o => (iso[o] | (iso[o + 1] << 8) | (iso[o + 2] << 16) | (iso[o + 3] << 24)) >>> 0;
  const pvd = 16 * S;
  if (iso.length < pvd + 2048 || iso[pvd] !== 1 || latin1(iso.subarray(pvd + 1, pvd + 6)) !== 'CD001') throw new Error('not an ISO 9660 image');
  const out = [];
  const seen = new Set();
  const walk = (lba, len, prefix) => {
    if (seen.has(lba)) return;
    seen.add(lba);
    for (let p = lba * S, end = Math.min(lba * S + len, iso.length); p < end;) {
      const n = iso[p];
      if (!n) { p = (Math.floor(p / S) + 1) * S; continue; }
      const at = le32(p + 2), size = le32(p + 10), dir = iso[p + 25] & 2, nl = iso[p + 32];
      const raw = iso.subarray(p + 33, p + 33 + nl);
      p += n;
      if (nl === 1 && raw[0] < 2) continue;         // "." and ".."
      const name = latin1(raw).replace(/;\d+$/, '').replace(/\.$/, '');
      if (dir) walk(at, size, prefix + name + '/');
      else if (at * S + size <= iso.length) out.push({ path: prefix + name, offset: at * S, size });
    }
  };
  walk(le32(pvd + 156 + 2), le32(pvd + 156 + 10), '');
  return out;
}

function looksLikeIso(bytes) {
  return bytes.length > 16 * 2048 + 6 && bytes[16 * 2048] === 1 && latin1(bytes.subarray(16 * 2048 + 1, 16 * 2048 + 6)) === 'CD001';
}

function looksLikeMohawk(bytes) {
  return bytes.length >= 12 && fourcc(bytes, 0) === 'MHWK' && fourcc(bytes, 8) === 'RSRC';
}

/* What each archive is: the place, from ScummVM's Zoombinis branch's page
   classes, and its help text, a ZOOMBINI STRL whose four levels are at +0,
   +20, +40 and +60. HELP, MUSIC and NETDEMO are the Learning Company's
   release's alone. */
const ZB_ARCHIVES = {
  PICKER: { place: 'Zoombini Isle', help: 1300 },
  BASECAMP: { place: 'Shelter Rock', help: 1400 },
  BCTWO: { place: 'Shade Tree', help: 1500 },
  TOWN: { place: 'Zoombiniville', help: 1600 },
  BRIDGE: { place: 'Allergic Cliffs', help: 1700 },
  TUNNELS: { place: 'Stone Cold Caves', help: 1800 },
  PIZZA: { place: 'Pizza Pass', help: 1900 },
  FERRY: { place: "Captain Cajun's Ferryboat", help: 2000 },
  LILLY: { place: 'Titanic Tattooed Toads', help: 2100 },
  SLIDES: { place: 'Stone Rise', help: 2200 },
  FLEENS: { place: 'Fleens!', help: 2300 },
  HOTEL: { place: 'Hotel Dimensia', help: 2400 },
  NET: { place: 'Mudball Wall', help: 2500 },
  CAVES: { place: "The Lion's Lair", help: 2600 },
  SMOKE: { place: 'Mirror Machine', help: 2700 },
  MAZE2: { place: 'Bubblewonder Abyss', help: 2800 },
  MAP: { place: 'the map' },
  RODMAP: { place: 'the map' },
  XFER: { place: 'between places' },
  ZOOMBINI: { place: 'shared by every place' },
  MIDIMPC: { place: 'the music, for Windows' },
  MIDIMAC: { place: 'the music, for the Mac' },
  HELP: { place: 'help (2001 release)' },
  MUSIC: { place: 'music (2001 release)' },
  NETDEMO: { place: 'Mudball Wall demo (2001 release)' },
};

/* The order to list them in: as their help text is numbered, which is the
   isle, the two camps and the town, then the twelve puzzles; then
   everything shared. Not the order a journey meets them. */
const ZB_ARCHIVE_ORDER = Object.keys(ZB_ARCHIVES);

function zbArchiveRank(name) {
  const i = ZB_ARCHIVE_ORDER.indexOf(name.toUpperCase());
  return i < 0 ? ZB_ARCHIVE_ORDER.length : i;
}
