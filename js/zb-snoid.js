/* zb-snoid.js -- the snoids, drawn from the disc: a Zoombini from
   ZOOMBINI.MHK, its five parts each a sprite of tBMP 3000 chosen by its
   trait; the tumbling Zoombini from tBMP 3100; a Fleen from FLEENS.MHK's
   tBMP 4000. Each is put together the way the game puts it together, by a
   snoid script and the sheet's registration points.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js and zb-script.js.

   A sheet holds every pose as a pair, facing one way and the other, and
   each part's variants as blocks of poses. A snoid script's tick has five
   records, one a part, in the order its header's layout word gives
   (zb-script.js); a record's shape is the pose within that part's block,
   1-based, and its x and y where the part's registration point goes. The
   registration points are a pair of REGS, x and y, one-based (the first
   entry of each is not a sprite's). A snoid's traits pick the blocks: hair,
   eyes, nose and feet have five each, one a value; the body has one.

   The layout word says which snoid a script draws (tools/README.md § Scripts):
   0 and 1 a Zoombini (1 in profile, the body and nose swapped), 2 the
   tumbling Zoombini, 3 a Fleen. A script's ticks close with events, and some
   of them turn the snoid round or change the layer order from the next tick
   on (zbSnoidTicks).

   tBMP 3000 is the Zoombini of the map and the puzzles, 890 sprites. Its
   feet blocks are of different lengths: three standing poses, then a walk
   for each direction, then a tail. The Zoombini standing still is SCRS 100:
   every part at its first pose. Frames 850-889 are the twenty trait icons,
   a pair each, in the order ZB_SNOID_ICONS gives.

   tBMP 3100 is the Zoombini rejected, knocked back and tumbling: every part
   18 poses, all in step through one tumble, and after them 21 poses of
   dust, rings and stars, which a script asks for by their place in the
   whole sheet (poses 379-399). Its hair blocks are not in trait order.

   WHERE IT CAME FROM
   The blocks are the extraction project's (tools/animate.py ZOOMBINI_ATLAS,
   ZOOMBINI_TUMBLE_ATLAS and FLEENS_ATLAS, tools/README.md § The Zoombinis
   and § The FLEENS part atlas), found by fitting every script on the disc
   to them; the tumble's hair order and the events are the 1996 program's
   (SETSNOIDDRAWORDER and the snoid callbacks, Mac CODE 8); the layer orders
   are ScummVM's and the program's (zb-script.js). utilities/snoid_check.mjs
   holds the blocks to animate.py's and to every tick of every snoid script
   on the disc, the layers the events give to the ones animate.py fitted,
   and the placements to animate.py's.
*/

const ZB_SNOID_SHEET = 3000, ZB_SNOID_REGS = 100, ZB_SNOID_STANDING = 100;
/* Each part's blocks, by trait value 1-5 at 0-4 (the body has one): the
   first frame, and how many poses. */
const ZB_SNOID_BLOCKS = {
  feet: { base: [382, 492, 670, 720, 822], poses: [55, 89, 25, 51, 14] },
  body: { base: [0], poses: [11] },
  nose: { base: [342, 350, 358, 366, 374], poses: [4, 4, 4, 4, 4] },
  eyes: { base: [182, 214, 246, 278, 310], poses: [16, 16, 16, 16, 16] },
  hair: { base: [22, 54, 86, 118, 150], poses: [16, 16, 16, 16, 16] },
};
const ZB_SNOID_TUMBLE_BLOCKS = {
  feet: { base: [576, 612, 648, 684, 720], poses: [18, 18, 18, 18, 18] },
  body: { base: [0], poses: [18] },
  nose: { base: [396, 432, 468, 504, 540], poses: [18, 18, 18, 18, 18] },
  eyes: { base: [216, 252, 288, 324, 360], poses: [18, 18, 18, 18, 18] },
  // the program's table (A5+$7770): the sheet holds hair 1, 3, 4, 2, 5
  hair: { base: [36, 144, 72, 108, 180], poses: [18, 18, 18, 18, 18] },
};
const ZB_SNOID_FLEEN_BLOCKS = {
  body: { base: [0], poses: [15] },
  feet: { base: [550, 580, 610, 656, 694], poses: [15, 15, 23, 19, 23] },
  nose: { base: [30, 60, 90, 120, 150], poses: [15, 15, 15, 15, 15] },
  eyes: { base: [180, 218, 256, 294, 332], poses: [19, 19, 19, 19, 19] },
  hair: { base: [370, 406, 442, 478, 514], poses: [18, 18, 18, 18, 18] },
};
/* The snoids: where each one's sheet is, its blocks, and (the tumble) its
   effects, by the pose they start at and how many. */
const ZB_SNOID_KINDS = {
  zoombini: { name: 'a Zoombini', archive: 'ZOOMBINI', sheet: 3000, regs: 100, blocks: ZB_SNOID_BLOCKS },
  tumble: { name: 'a Zoombini tumbling', archive: 'ZOOMBINI', sheet: 3100, regs: 102, blocks: ZB_SNOID_TUMBLE_BLOCKS,
    effects: { first: 379, poses: 21 } },
  fleen: { name: 'a Fleen', archive: 'FLEENS', sheet: 4000, regs: 4000, blocks: ZB_SNOID_FLEEN_BLOCKS },
};
/* Which snoid a script's layout word draws. */
const ZB_SNOID_KIND_OF_LAYOUT = { 0: 'zoombini', 1: 'zoombini', 2: 'tumble', 3: 'fleen' };
/* A place's own events that set the layer order, beside the shared ones
   (XFER's callback takes 0x1b as order 0). */
const ZB_SNOID_PLACE_EVENTS = { XFER: { 0x1b: 0 } };
/* The trait icons, frames 850-889: a pair each. */
const ZB_SNOID_ICON_BASE = 850;
const ZB_SNOID_ICONS = ['hair', 'eyes', 'feet', 'nose'];

/* A snoid's sheet and its registration points, read once an archive. The
   Zoombini's also has SCRS 100, its standing pose. */
const ZB_SNOID_CACHE = new WeakMap();
function zbSnoidSheet(arc, kind = 'zoombini') {
  if (!ZB_SNOID_CACHE.has(arc)) ZB_SNOID_CACHE.set(arc, {});
  const got = ZB_SNOID_CACHE.get(arc);
  if (!got[kind]) {
    const K = ZB_SNOID_KINDS[kind];
    const d = decodeBitmapResource(arc.get('tBMP', K.sheet));
    const xs = parseRegs(arc.get('REGS', K.regs)), ys = parseRegs(arc.get('REGS', K.regs + 1));
    if (xs.length !== d.frames.length + 1 || ys.length !== d.frames.length + 1) throw new Error(`REGS ${K.regs} and ${K.regs + 1} do not fit tBMP ${K.sheet}'s ${d.frames.length} sprites`);
    const standing = kind === 'zoombini' ? parseScript(arc.get('SCRS', ZB_SNOID_STANDING), 'SCRS') : null;
    got[kind] = { kind, blocks: K.blocks, effects: K.effects || null, frames: d.frames, xs, ys, standing };
  }
  return got[kind];
}

/* The sprite of a part at a pose (1-based) facing one way (0) or the other
   (1), or null past its block. */
function zbSnoidFrame(part, value, pose, facing = 0, blocks = ZB_SNOID_BLOCKS) {
  const b = blocks[part], v = part === 'body' ? 0 : value - 1;
  if (pose < 1 || pose > b.poses[v]) return null;
  return b.base[v] + 2 * (pose - 1) + facing;
}

/* A snoid script as the program steps it: each tick's records, with the
   layer order and the facing it is drawn in, and its sound and event. The
   order starts at the header's word and the facing at `facing`; an event a
   tick closes with takes effect from the next one (tools/README.md
   § Scripts): 0x01 turns the snoid round, applying an order queued for
   then; 0xf1-0xf4 queue order 0-3 for the next turn; 0xfb-0xfe set order
   0-3 now; `place`'s own (ZB_SNOID_PLACE_EVENTS) likewise. */
function zbSnoidTicks(script, facing = 0, place = null) {
  const own = ZB_SNOID_PLACE_EVENTS[place] || {};
  let layout = script.layout, queued = null;
  return script.frames.map(f => {
    const t = { records: f.records, layout, facing, sound: f.sound, event: f.event };
    const e = f.event;
    if (e === 0x01) { facing ^= 1; if (queued != null) { layout = queued; queued = null; } }
    else if (e >= 0xf1 && e <= 0xf4) queued = e - 0xf1;
    else if (e >= 0xfb && e <= 0xfe) layout = e - 0xfb;
    else if (e in own) layout = own[e];
    return t;
  });
}

/* Which part each of a tick's records draws: [{ part, shape, x, y }], in
   the order drawn, or [] for a tick that draws nothing (no records, or the
   single record (0, 0, 0)). In the tumble a first record past pose 18 is
   an effect, as is any after the fifth part; an effect's shape is its pose
   in the whole sheet.

   Nine Zoombini ticks on the disc (FLEENS 7026-7030, NET 13003-13004) are
   drawn in profile by code not traced, their script having said neither
   order 1 nor anything since; read in the order the events give, their nose
   is past its four poses. There the body and nose swap, the rule
   animate.py fits to every tick (tools/README.md § The profile swap), and
   the tick is marked `fitted`. */
function zbSnoidParts(tick, effects = null) {
  const recs = tick.records;
  if (recs.length < 5) return [];
  let layout = tick.layout;
  if ((layout === 0 || layout === 1) && recs[ZB_LAYER_ORDERS[layout].indexOf('nose')].shape > 4) layout ^= 1;
  const order = ZB_LAYER_ORDERS[layout], lead = effects && recs[0].shape > 18 ? 1 : 0;
  return recs.map((r, k) => {
    const slot = k - lead;
    return { part: slot < 0 || slot >= 5 ? 'effect' : order[slot], shape: r.shape, x: r.x, y: r.y, fitted: layout !== tick.layout };
  });
}

/* A tick's sprites: [{ part, frame, x, y }] in the order drawn, x and y the
   sprite's top left in the script's coordinates. A pose past its part's
   block is left out and named in `missing`, as a script written for other
   feet asks for. */
function zbSnoidPlacements(sheet, traits, tick, missing = null) {
  const out = [];
  for (const p of zbSnoidParts(tick, sheet.effects)) {
    const f = p.part === 'effect' ? 2 * (p.shape - 1) + tick.facing
      : zbSnoidFrame(p.part, traits[p.part], p.shape, tick.facing, sheet.blocks);
    if (f == null || f >= sheet.frames.length) { if (missing) missing.push(p); continue; }
    out.push({ part: p.part, frame: f, x: p.x - sheet.xs[f + 1], y: p.y - sheet.ys[f + 1] });
  }
  return out;
}

/* The trait values a script's feet fit: those whose block holds every
   pose its feet ask for (all five for most scripts). */
function zbSnoidFeetFor(sheet, ticks) {
  const want = new Set();
  for (const t of ticks) for (const p of zbSnoidParts(t, sheet.effects)) if (p.part === 'feet') want.add(p.shape);
  return [1, 2, 3, 4, 5].filter(v => [...want].every(s => zbSnoidFrame('feet', v, s, 0, sheet.blocks) != null));
}
/* The feet a script is written for, by its number, where the scripts come
   one for each feet in trait order, or null: ZOOMBINI's walks 105-129
   (100 + 5 x feet + direction, as the program picks them) and feet shows
   146-150; FLEENS's Fleen runs 4026-4055 (tools/animate.py's reading) and
   Zoombinis 7000-7009 and 7011-7045. A walk's feet may fit other blocks
   too, being shorter than theirs, but the program never asks that. */
function zbSnoidFeetOf(place, id) {
  if (place === 'ZOOMBINI') return id >= 105 && id <= 129 ? Math.floor((id - 105) / 5) + 1 : id >= 146 && id <= 150 ? id - 145 : null;
  if (place === 'FLEENS') {
    if (id >= 4026 && id <= 4055) return (id - 4026) % 5 + 1;
    if (id >= 7000 && id <= 7009) return (id - 7000) % 5 + 1;
    if (id >= 7011 && id <= 7045) return (id - 7011) % 5 + 1;
  }
  return null;
}

/* A Zoombini as one script frame draws it: [{ part, frame, x, y }] in the
   order drawn, x and y the sprite's top left relative to the script's
   origin. */
function zbZoombiniPlacements(sheet, z, frame = sheet.standing.frames[0], layout = sheet.standing.layout, facing = 0) {
  const missing = [];
  const out = zbSnoidPlacements(sheet, z, { records: frame.records, layout, facing }, missing);
  if (missing.length) throw new Error(`pose ${missing[0].shape} is past the ${missing[0].part}'s block`);
  return out;
}

/* A Zoombini standing, as one indexed image: { width, height, pixels, ox,
   oy }, index 0 clear, (ox, oy) where the script's origin falls, which is
   where it stands. */
function zbZoombiniImage(sheet, z, facing = 0) {
  return zbSnoidCompose(sheet, zbZoombiniPlacements(sheet, z, undefined, undefined, facing));
}
/* A trait's own part, alone, as the Zoombini standing wears it: the
   nose's ball, the hair's tuft; the way a diagram shows a trait. */
function zbTraitImage(sheet, kind, value) {
  const frame = sheet.standing.frames[0], k = ZB_LAYER_ORDERS[sheet.standing.layout].indexOf(kind);
  const f = zbSnoidFrame(kind, value, frame.records[k].shape);
  return zbSnoidCompose(sheet, [{ frame: f, x: 0, y: 0 }]);
}
/* A trait's icon, as an indexed image the same way; the game's own, all in
   one orange, so the noses' five are alike. */
function zbTraitIcon(sheet, kind, value) {
  const f = ZB_SNOID_ICON_BASE + 2 * (ZB_SNOID_ICONS.indexOf(kind) * 5 + value - 1);
  return zbSnoidCompose(sheet, [{ frame: f, x: 0, y: 0 }]);
}

/* A whole script, every tick as an indexed image of one size: { width,
   height, ox, oy, frames: [pixels], missing } with (ox, oy) where the
   script's origin falls and `missing` the parts its poses left out.
   `ticks` is zbSnoidTicks's; a tick that draws nothing is clear. */
function zbSnoidMovie(sheet, traits, ticks) {
  const missing = [], placed = ticks.map(t => zbSnoidPlacements(sheet, traits, t, missing));
  const all = placed.flat();
  if (!all.length) return { width: 0, height: 0, ox: 0, oy: 0, frames: placed.map(() => new Uint8Array(0)), missing };
  const box = zbSnoidBox(sheet, all);
  return { width: box.width, height: box.height, ox: box.ox, oy: box.oy, missing,
    frames: placed.map(p => zbSnoidPaint(sheet, p, box).pixels) };
}

function zbSnoidBox(sheet, placed) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placed) {
    const f = sheet.frames[p.frame];
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + f.width); y1 = Math.max(y1, p.y + f.height);
  }
  return { width: x1 - x0, height: y1 - y0, ox: -x0, oy: -y0 };
}
function zbSnoidPaint(sheet, placed, box) {
  const { width, height } = box, pixels = new Uint8Array(width * height);
  for (const p of placed) {
    const f = sheet.frames[p.frame];
    for (let y = 0; y < f.height; y++) {
      const row = (p.y + box.oy + y) * width + (p.x + box.ox);
      for (let x = 0; x < f.width; x++) {
        const v = f.pixels[y * f.width + x];
        if (v) pixels[row + x] = v;
      }
    }
  }
  return { width, height, pixels, ox: box.ox, oy: box.oy };
}
function zbSnoidCompose(sheet, placed) {
  return zbSnoidPaint(sheet, placed, zbSnoidBox(sheet, placed));
}

/* A Zoombini's sounds: events 0xc9-0xf0 a tick closes with are a sound the
   engine plays for the snoid (GETSNOIDSOUNDID, Mac CODE 8; tools/README.md
   § Snoid sounds). 0xc9-0xda pick a kind; a kind 0-15 has 25 takes, one a
   hair and nose, so a Zoombini sounds the way it looks; 16 is one of FERRY
   and FLEENS's 1800-1814 at random, 17 is 99; 0xdb-0xf0 and 0xd1 are
   silent. Returns { archive, id } ('ZOOMBINI', or null for the place's
   own), or null. */
const ZB_SNOID_SOUND_KINDS = [8, 6, 7, 10, 2, 12, 1, 9, null, 4, 5, 3, 11, 13, 14, 15, 16, 17];
const ZB_SNOID_VOICE_HAIR = [0, 5, 20, 15, 10];
function zbSnoidSound(event, z, random = Math.random) {
  const k = event >= 0xc9 && event <= 0xda ? ZB_SNOID_SOUND_KINDS[event - 0xc9] : null;
  if (k == null) return null;
  if (k === 16) return { archive: null, id: 1800 + Math.floor(random() * 15) };
  if (k === 17) return { archive: 'ZOOMBINI', id: 99 };
  const base = k <= 12 ? 100 + 25 * k : [475, 450, 425][k - 13];
  return { archive: 'ZOOMBINI', id: base + ZB_SNOID_VOICE_HAIR[z.hair - 1] + (z.nose - 1) };
}

/* A Zoombini walking, as the program walks one (Mac CODE 8: NEXTPOINTONPATH
   0x29ca-0x2bba picks the walk, SNOIDMOVEPROC moves it; ScummVM's
   ZmbSnoid::calcPathSpeed reads the same). A leg's direction comes from its
   slope, s = 1024 x (how far up the screen) / |dx|, ±1410 straight up or
   down: 0 at s <= -1409, 1 to -332, 2 below 332, 3 below 1409, else 4. So 0
   and 1 come down the screen towards the viewer, 2 goes across, and 3 and 4
   go up it, away (which is why their scripts, 108-109 and the like, draw the
   nose behind the body: layout 1). The script is ZOOMBINI SCRS 100 + 5 x
   feet + direction, turned round when going left, as it was when going
   straight up or down; its records are offsets from where the Zoombini is.
   Each tick it moves one step towards the point, then its script one tick,
   looping, and a new leg carries on at the tick it had reached. The step is
   ZB_WALK_SPEEDS's on the longer axis, and on the other so that both arrive
   together: that axis's distance over (the longer's distance / its speed),
   at least 1 (the whole distance when the longer is under one step). */
const ZB_WALK_SPEEDS = [[5, 15], [13, 10], [16, 8], [13, 10], [5, 15]];
function zbWalkDirection(dx, dy) {
  const up = -dy, s = dx ? Math.trunc(up * 1024 / Math.abs(dx)) : up >= 0 ? 1410 : -1410;
  return s <= -1409 ? 0 : s <= -332 ? 1 : s < 332 ? 2 : s < 1409 ? 3 : 4;
}
/* One leg from (x, y) to (tx, ty): { dir, script, facing, vx, vy, steps:
   [{ x, y }] }, the steps being where each tick leaves it. */
function zbWalkLeg(x, y, tx, ty, feet, facing = 0) {
  const dx = tx - x, dy = ty - y, dir = zbWalkDirection(dx, dy), [sx, sy] = ZB_WALK_SPEEDS[dir];
  const share = (d, long, speed) => {
    const n = Math.trunc(Math.abs(long) / speed), v = n ? Math.trunc(d / n) : d;
    return Math.abs(v || (d ? 1 : 0));
  };
  const vx = sx >= sy ? sx : share(dx, dy, sy), vy = sx >= sy ? share(dy, dx, sx) : sy;
  if (dx < 0) facing = 1; else if (dx > 0) facing = 0;
  const steps = [];
  while (x !== tx || y !== ty) {
    x += Math.sign(tx - x) * Math.min(vx, Math.abs(tx - x));
    y += Math.sign(ty - y) * Math.min(vy, Math.abs(ty - y));
    steps.push({ x, y });
    if (steps.length > 10000) throw new Error('a walk that never arrives');
  }
  return { dir, script: 100 + 5 * feet + dir, facing, vx, vy, steps };
}
/* A walk through points [{ x, y }] from the first: each tick { x, y,
   script, tick, facing }, the script's tick counted on from `tick`. Ticks
   of a script are `lengths[script]`'s, so the caller's scripts decide when
   one loops. */
function zbWalk(points, feet, lengths, tick = 0, facing = 0) {
  const out = [];
  let { x, y } = points[0];
  for (const p of points.slice(1)) {
    const leg = zbWalkLeg(x, y, p.x, p.y, feet, facing);
    facing = leg.facing;
    for (const s of leg.steps) {
      out.push({ x: s.x, y: s.y, script: leg.script, tick: tick % lengths[leg.script], facing });
      tick++;
    }
    ({ x, y } = p);
  }
  return out;
}
/* A walking Zoombini's sprites on a tick of zbWalk: placed in the room. */
function zbWalkPlacements(sheet, z, scripts, step) {
  const s = scripts[step.script], f = s.frames[step.tick];
  return zbSnoidPlacements(sheet, z, { records: f.records, layout: s.layout, facing: step.facing })
    .map(p => ({ ...p, x: p.x + step.x, y: p.y + step.y }));
}
