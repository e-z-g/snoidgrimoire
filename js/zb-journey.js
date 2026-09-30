/* zb-journey.js -- the journey: the sixteen places in the order a journey
   meets them, the four routes between them, and where each is on the map.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js and zb-script.js.

   The map is RODMAP's (MAP's, in the European layout): tBMP 300 in SHPL
   300, the painted land, with a sprite sheet, tBMP 1000, drawn over it by
   the archive's feature scripts. SCRB 1000 puts the sixteen place icons,
   shapes 1-16; SCRB 1001 the sixteen stretches of road between them,
   shapes 17-32, each drawn in the colour of the level its place was
   crossed at by adding 16 per level (shapes 17-80: green, yellow, orange,
   red), and the legend's key, SCRB 1004 in RODMAP and 1003 in MAP, has a
   line of each colour, shapes 84-87. A shape is the sheet's frame one
   below it. A place's icon has a
   lit version for when the pointer is over it, 93 shapes on, but the
   isle's, which is shape 109. Both scripts are one frame, and a record's
   x and y are its sprite's top left corner: RODMAP has no registration
   points.

   A place's picture is the background its page draws when it opens: a
   640 x 480 tBMP and the palette of the same id. Zoombiniville's is
   instead the first view of its panorama, two 320-pixel halves that SCRB
   1000 scrolls round (its tBMP 1200 is an 8 x 6 stub under them). Mudball
   Wall has a second wall for levels 3 and 4; Hotel Dimensia opens on its
   distant view, 5000, and changes to the room itself once the band is at
   the door, which is not drawn here.

   WHERE IT CAME FROM
   Which archive is which place, which shape is which place and which
   stretch of road, the order of the routes, the backgrounds and the level
   colours are from ScummVM's Zoombinis branch (ied206/scummvm-zoombini,
   zoombini_pages/interactive_rodmap.h and .cpp, the page classes'
   setBackgroundBitmap, zoombini_state.h ZmbRouteId). The names are the
   1996 program's own, the strings the map shows (ZOOMBINI.EXE, at the
   offsets ScummVM's kV11US_NETextEntries gives), capitalised here; the
   program writes them in lower case. utilities/journey_check.mjs holds
   the names to the program's bytes, and the icons read from the scripts
   to the click points ScummVM's page carries separately.
*/

/* The places, in the order a journey meets them. `shape` is the map icon;
   `background` the picture its page opens on, and `hard` the one at levels
   3 and 4 where it differs; `help` the ZOOMBINI STRL of its help text,
   whose four levels are at +0, +20, +40 and +60. */
const ZB_PLACES = [
  { key: 'PICKER', name: 'Zoombini Isle', shape: 16, background: 4000, help: 1300, kind: 'the start' },
  { key: 'BRIDGE', name: 'Allergic Cliffs', shape: 1, background: 1000, help: 1700, kind: 'puzzle' },
  { key: 'TUNNELS', name: 'Stone Cold Caves', shape: 2, background: 300, help: 1800, kind: 'puzzle' },
  { key: 'PIZZA', name: 'Pizza Pass', shape: 3, background: 5000, help: 1900, kind: 'puzzle' },
  { key: 'BASECAMP', name: 'Shelter Rock', shape: 4, background: 1000, help: 1400, kind: 'camp' },
  { key: 'FERRY', name: "Captain Cajun's Ferryboat", shape: 5, background: 1300, help: 2000, kind: 'puzzle' },
  { key: 'LILLY', name: 'Titanic Tattooed Toads', shape: 6, background: 5000, help: 2100, kind: 'puzzle' },
  { key: 'SLIDES', name: 'Stone Rise', shape: 7, background: 5000, help: 2200, kind: 'puzzle' },
  { key: 'FLEENS', name: 'Fleens!', shape: 8, background: 300, help: 2300, kind: 'puzzle' },
  { key: 'HOTEL', name: 'Hotel Dimensia', shape: 9, background: 5000, help: 2400, kind: 'puzzle' },
  { key: 'NET', name: 'Mudball Wall', shape: 10, background: 5000, hard: 5001, help: 2500, kind: 'puzzle' },
  { key: 'BCTWO', name: 'Shade Tree', shape: 11, background: 5000, help: 1500, kind: 'camp' },
  { key: 'CAVES', name: "The Lion's Lair", shape: 12, background: 5000, help: 2600, kind: 'puzzle' },
  { key: 'SMOKE', name: 'Mirror Machine', shape: 13, background: 5000, help: 2700, kind: 'puzzle' },
  { key: 'MAZE2', name: 'Bubblewonder Abyss', shape: 14, background: 5000, help: 2800, kind: 'puzzle' },
  { key: 'TOWN', name: 'Zoombiniville', shape: 15, background: 1200, panorama: { script: 1000, sheet: 1000 }, help: 1600, kind: 'the end' },
];

/* The routes, as the map names them. Road shape segments[i] runs from
   places[i] to places[i + 1] and takes the colour of the level
   places[i + 1] was crossed at (ScummVM's buildPageRouteLevelMap); the
   last stretch of each, into a camp or the town, takes the route's. Shelter
   Rock has two ways on, north and south, and both come to Shade Tree. */
const ZB_ROUTES = [
  { name: 'The Big, the Bad and the Hungry', places: ['PICKER', 'BRIDGE', 'TUNNELS', 'PIZZA', 'BASECAMP'], segments: [17, 18, 19, 20] },
  { name: "Who's Bayou", places: ['BASECAMP', 'FERRY', 'LILLY', 'SLIDES', 'BCTWO'], segments: [21, 22, 23, 24] },
  { name: 'Deep, Dark Forest', places: ['BASECAMP', 'FLEENS', 'HOTEL', 'NET', 'BCTWO'], segments: [25, 26, 27, 28] },
  { name: 'Mountains of Despair', places: ['BCTWO', 'CAVES', 'SMOKE', 'MAZE2', 'TOWN'], segments: [29, 30, 31, 32] },
];

/* The four levels, as the map's legend names them. */
const ZB_LEVELS = ['Not So Easy', 'Oh, So Hard', 'Very Hard', 'Very, Very Hard'];

const ZB_PLACE_BY_KEY = new Map(ZB_PLACES.map(p => [p.key, p]));

/* The routes a place is on, with where on each. */
function zbPlaceRoutes(key) {
  const out = [];
  ZB_ROUTES.forEach((r, i) => { const at = r.places.indexOf(key); if (at >= 0) out.push({ route: i, at }); });
  return out;
}

/* The map, read from RODMAP (or MAP): { background, palette, sheet,
   places, roads, levels }. `sheet` is tBMP 1000's frames as decodeTbmp
   gives them; `levels` the sheet frames of the legend's four lines.
   A place is { key, x, y, w, h, cx, cy, frame, lit }: its icon's box on
   the map, its middle, and the sheet frames of the icon and of the lit
   icon. A road is { shape, route, from, to, x, y, frames }: frames[level
   - 1] is the sheet frame for that level, all four drawn at x, y.
   Anything the scripts put where this file does not expect says so. */
function zbJourneyMap(arc) {
  const need = (tag, id) => { if (!arc.has(tag, id)) throw new Error(`the map has no ${mohawkTagLabel(tag)} ${id}`); return arc.get(tag, id); };
  const bg = decodeBitmapResource(need('tBMP', 300));
  if (bg.sheet) throw new Error('the map\'s tBMP 300 is a sprite sheet, not a picture');
  const palette = parsePaletteResource(need('SHPL', 300), 'SHPL');
  const sheet = decodeBitmapResource(need('tBMP', 1000));
  if (!sheet.sheet) throw new Error('the map\'s tBMP 1000 is not a sprite sheet');
  const frame = shape => {
    const f = sheet.frames[shape - 1];
    if (!f) throw new Error(`the map's sprite sheet has no shape ${shape}`);
    return f;
  };
  const oneFrame = id => {
    const s = parseScript(need('SCRB', id), 'SCRB');
    if (s.frames.length !== 1) throw new Error(`the map's SCRB ${id} has ${s.frames.length} frames, not one`);
    return s.frames[0].records;
  };

  const places = [];
  for (const r of oneFrame(1000)) {
    const p = ZB_PLACES.find(q => q.shape === r.shape);
    if (!p) throw new Error(`the map's SCRB 1000 draws shape ${r.shape}, which is no place`);
    const f = frame(r.shape), lit = p.key === 'PICKER' ? 109 : r.shape + 93;
    frame(lit);
    places.push({ key: p.key, x: r.x, y: r.y, w: f.width, h: f.height, cx: r.x + f.width / 2, cy: r.y + f.height / 2, frame: r.shape - 1, lit: lit - 1 });
  }
  const missing = ZB_PLACES.filter(p => !places.some(q => q.key === p.key)).map(p => p.name);
  if (missing.length) throw new Error(`the map's SCRB 1000 leaves out ${missing.join(', ')}`);

  const roads = [];
  for (const r of oneFrame(1001)) {
    const route = ZB_ROUTES.findIndex(q => q.segments.includes(r.shape));
    if (route < 0) throw new Error(`the map's SCRB 1001 draws shape ${r.shape}, which is no road`);
    const at = ZB_ROUTES[route].segments.indexOf(r.shape);
    const frames = [0, 1, 2, 3].map(k => { frame(r.shape + 16 * k); return r.shape + 16 * k - 1; });
    roads.push({ shape: r.shape, route, from: ZB_ROUTES[route].places[at], to: ZB_ROUTES[route].places[at + 1], x: r.x, y: r.y,
      w: frame(r.shape).width, h: frame(r.shape).height, frames });
  }
  const legend = [1004, 1003].find(id => arc.has('SCRB', id) && oneFrame(id).some(r => r.shape === 84));
  if (!legend) throw new Error('the map has no legend drawing shapes 84-87');
  const levels = [84, 85, 86, 87].map(shape => { frame(shape); return shape - 1; });
  return { background: bg.frames[0], palette, sheet: sheet.frames, places, roads, levels };
}

/* What a place's picture is drawn from, at a level (1-4): the palette's id,
   and [{ id, frame, x, y }], tBMPs in the place's archive, in the order
   they are drawn. */
function zbPlacePicture(arc, key, level) {
  const p = ZB_PLACE_BY_KEY.get(key);
  if (!p) throw new Error(`${key} is no place`);
  if (p.panorama) {
    const s = parseScript(arc.get('SCRB', p.panorama.script), 'SCRB');
    return { palette: p.background, layers: s.frames[0].records.map(r => ({ id: p.panorama.sheet, frame: r.shape - 1, x: r.x, y: r.y })) };
  }
  const id = p.hard && level >= 3 ? p.hard : p.background;
  return { palette: id, layers: [{ id, frame: 0, x: 0, y: 0 }] };
}
