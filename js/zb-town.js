/* zb-town.js -- Zoombiniville, the town at the journey's end, as one
   picture 1920 pixels round and 480 high, with its houses, its sixteen
   reward buildings, its inhabitants and its clock.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js and zb-script.js.

   The town page shows a 640-pixel window on a world six 320-pixel columns
   round, and scrolls it a column at a time; frame k of each of its layer
   scripts is the view from column k, so a record at x in frame k is at
   x + 320k in the world, wrapping at 1920. Every layer draws on TOWN's
   tBMP 1000:
     SCRB 1000  the land: shapes 1-6, a 320-pixel strip each, all round;
     SCRB 1002, 1003  houses, shapes 25-80, each shown once the town's
                density reaches its shape: 24 + min(56 x population / 625
                + 1, 56), so 25 with nobody there and 80 with all 625;
     SCRB 1001  the reward buildings, shapes 7-22, slot = shape - 7, and a
                few things always there (shapes 23 and 24).
   They are drawn in the order the page loads them: 1000, 1002, 1003,
   1001. A thing on a column's edge is in two frames, a pixel apart at
   most; the first frame that shows all of it places it.

   A reward building is earned by the first band to cross a route at a
   level, and goes in the first free slot, so the slots fill in the order
   they are earned: the fifth is the clock tower, whose hands (tBMP 6000,
   REGS 6000 their pivots) then tell the time, at world (946, 218). The
   inhabitants are SCRB 4000-4007 on tBMP 4000, looping, one more for each
   37 Zoombinis past the first 20 (up to 16, from 16 places, so each script
   twice); which of them the game shows is chosen at random.

   WHERE IT CAME FROM
   All of it is ScummVM's Zoombinis branch's reading of the town page
   (zoombini_pages/shelter_town.cpp and .h: loadFeatures,
   calculatePopulationDensity, overlay_preRenderShape,
   memorialMarkers_preRenderShape, clockHands_preRenderShape,
   updateClockHandTime; zoombini_state.cpp addFirstClearMemorial), and the
   buildings' names are the plaques' own words in the 1996 program.
   utilities/town_check.mjs holds the reading to those files and to the
   scripts themselves. Not checked against the program: the order the
   layers are drawn in, and where the inhabitants stand (below).
*/

const ZB_TOWN_WIDTH = 1920, ZB_TOWN_HEIGHT = 480, ZB_TOWN_COLUMN = 320;
const ZB_TOWN_PEOPLE = 625;

/* The reward buildings, by slot, which is the order they are earned in:
   ScummVM's kTownMemorialCardTextTypeBySlot picks each slot's plaque, and
   the plaque names the building ("this band shell was built to honor the
   zoombinis who:"). */
const ZB_TOWN_REWARDS = ['Band Shell', 'Windmill', 'General Store', 'Swimming Pool', 'Clock Tower', 'Bowling Alley',
  'Firehouse', 'Opera House', 'Paper Clip Museum', 'Courthouse', 'Monument', 'Schoolhouse', 'City Hall', 'Library',
  'Observatory', 'Playground'];
const ZB_TOWN_CLOCK_SLOT = 4;

function zbTownDensity(population) {
  return Math.min(Math.floor(56 * population / ZB_TOWN_PEOPLE) + 1, 56) + 24;
}
function zbTownInhabitants(population) {
  return Math.max(0, Math.min(16, Math.floor(Math.max(0, Math.min(605, population - 20)) / 37)));
}
/* The clock's hands at a time, as ScummVM reads the program: the hour hand
   takes the hour in fives (0-4 of its twelve steps) and the minute hand
   the minute modulo twelve. Odd, and not yet checked against the program. */
function zbTownClockShapes(hour, minute) {
  return { hour: Math.floor(hour / 5) + 1, minute: minute % 12 + 13 };
}

/* The town as read from TOWN: { land, things, inhabitants, clock, sheets }.
   land: [{ shape, x }], the strips, 320 wide and 480 high at y 0.
   things: [{ layer, shape, x, y, w, h, gate }] in drawing order; gate is
   { density: n } for a house, { reward: slot } for a reward building, or
   null. inhabitants: [{ script, frames: [{ shape, x, y }], interval }].
   clock: { x, y, regs: { x: [], y: [] } }. sheets: the decoded tBMPs by
   id, 1000, 4000 and 6000. Positions are world pixels. */
function zbTownWorld(arc) {
  const sheets = {};
  const sheet = id => {
    if (!sheets[id]) {
      if (!arc.has('tBMP', id)) throw new Error(`TOWN has no tBMP ${id}`);
      const d = decodeBitmapResource(arc.get('tBMP', id));
      if (!d.sheet) throw new Error(`TOWN's tBMP ${id} is not a sprite sheet`);
      sheets[id] = d.frames;
    }
    return sheets[id];
  };
  const frameOf = (id, shape) => {
    const f = sheet(id)[shape - 1];
    if (!f) throw new Error(`TOWN's tBMP ${id} has no shape ${shape}`);
    return f;
  };
  const script = id => {
    if (!arc.has('SCRB', id)) throw new Error(`TOWN has no SCRB ${id}`);
    return parseScript(arc.get('SCRB', id), 'SCRB');
  };
  const wrap = x => ((x % ZB_TOWN_WIDTH) + ZB_TOWN_WIDTH) % ZB_TOWN_WIDTH;
  const near = (a, b) => { const d = Math.abs(a - b); return Math.min(d, ZB_TOWN_WIDTH - d) <= 3; };

  // One layer script's records in world pixels, each thing once.
  const layer = id => {
    const s = script(id), out = [];
    if (s.frames.length !== 6) throw new Error(`TOWN's SCRB ${id} has ${s.frames.length} frames, not one a column`);
    s.frames.forEach((fr, k) => {
      for (const r of fr.records) {
        const f = frameOf(1000, r.shape), x = wrap(r.x + ZB_TOWN_COLUMN * k), whole = r.x >= 0 && r.x + f.width <= 640;
        const seen = out.find(t => t.shape === r.shape && near(t.x, x) && Math.abs(t.y - r.y) <= 3);
        if (seen) { seen.seen.push({ frame: k, x, y: r.y }); if (whole && !seen.whole) Object.assign(seen, { x, y: r.y, whole }); continue; }
        out.push({ layer: id, shape: r.shape, x, y: r.y, w: f.width, h: f.height, whole, seen: [{ frame: k, x, y: r.y }] });
      }
    });
    return out;
  };

  const land = layer(1000);
  const shapes = land.map(t => t.shape).sort((a, b) => a - b).join();
  if (shapes !== '1,2,3,4,5,6' || land.some(t => t.x !== (t.shape - 1) * ZB_TOWN_COLUMN || t.y !== 0 || t.w !== ZB_TOWN_COLUMN || t.h !== ZB_TOWN_HEIGHT))
    throw new Error('TOWN\'s SCRB 1000 is not six 320-pixel strips all round');

  const things = [];
  for (const id of [1002, 1003]) for (const t of layer(id)) things.push({ ...t, gate: { density: t.shape } });
  for (const t of layer(1001)) things.push({ ...t, gate: t.shape >= 7 && t.shape <= 22 ? { reward: t.shape - 7 } : null });

  const inhabitants = [];
  for (let id = 4000; id <= 4007; id++) {
    const s = script(id);
    inhabitants.push({ script: id, frames: s.frames.map(fr => {
      if (fr.records.length > 1) throw new Error(`TOWN's SCRB ${id} has a frame of ${fr.records.length} records, not one`);
      const r = fr.records[0];
      if (!r) return null;
      frameOf(4000, r.shape);
      return { shape: r.shape, x: r.x, y: r.y };
    }) });
    if (!inhabitants[inhabitants.length - 1].frames[0]) throw new Error(`TOWN's SCRB ${id} starts with an empty frame`);
  }

  const regs = { x: parseRegs(arc.get('REGS', 6000)), y: parseRegs(arc.get('REGS', 6001)) };
  for (let s = 1; s <= 24; s++) frameOf(6000, s);
  const clock = { x: 946, y: 218, regs };

  return { land, things, inhabitants, clock, sheets };
}

/* The row a sprite stands on: its lowest with a painted pixel (index 0 is
   transparent), or its last if it has none. */
function zbSpriteFoot(frame) {
  for (let y = frame.height - 1; y >= 0; y--) {
    const row = frame.pixels.subarray(y * frame.width, (y + 1) * frame.width);
    if (row.some(v => v)) return y;
  }
  return Math.max(0, frame.height - 1);
}

/* What stands in the town with this many Zoombinis in it and this many
   reward buildings earned: the things to draw, in order, and how many
   inhabitants, and whether the clock has hands. */
function zbTownScene(world, population, rewards) {
  const density = zbTownDensity(population);
  const things = world.things.filter(t => !t.gate || (t.gate.density != null ? t.gate.density <= density : t.gate.reward < rewards));
  return { density, things, inhabitants: zbTownInhabitants(population), clock: rewards > ZB_TOWN_CLOCK_SLOT };
}
