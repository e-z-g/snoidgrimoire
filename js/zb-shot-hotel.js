/* zb-shot-hotel.js -- Hotel Dimensia read from a screenshot (zb-shot.js,
   "A place's reader").
   =========================================================================
   Needs zb-shot.js, zb-snoid.js and zb-puzzle-hotel.js.

   The hotel has two views. The far view is the picture tBMP 5000, with
   the band drawn small from ZOOMBINI tBMP 3200. The near view is tBMP
   5001 at levels 1 to 3 and 5002 at level 4, with the doors, the platforms
   and a mask of the trunks drawn over most of it. So the bare picture fits
   a screenshot of the near view badly, and at level 4 hardly at all. Each
   Zoombini turned away darkens the whole palette, so after the first one
   no color of the stored palette is left. zbShotHotelLooks gives zb-shot.js
   the empty hotel of each level at each darkness (ZB_SHOT_LOOKS), and the
   look that fits gives the level and how many the hotel turned away.

   A Zoombini in a room stands in the doorway at full size, cut off at the
   doorway's edges, which at level 4 leaves a strip 20 pixels wide. So
   zbShotHotelInRoom reads each open room at the places a Zoombini can
   stand there, counting only what the doorway shows. At levels 1 to 3
   each later Zoombini in a room stands a little to the side and a pixel
   lower, in front of those already there. The front one's place gives how
   many the room has, and the ones behind are read as far as they show
   past it. At level 4 the second stands right behind the first. At
   levels 1 to 3 the clock's hands show the counter's step. Level 4 has no
   clock, and only the darkness shows the count. Zoombinis turned away land
   below the rooms in a heap, and zbShotHotelHalfHidden reads one there
   whose body and hair another hides.

   Zoombinis that share a floor, a trunk or a door must be alike in its
   trait, and Zoombinis on two of them must differ. zbShotHotelFitting
   returns the traits that the rooms filled allow.

   WHERE IT CAME FROM
   ScummVM's Zoombinis branch, zoombini_pages/puzzle_hotel.cpp and .h:
   - the tables kRoomPositions25, kRoomPositions125, kSubColumnOffsetX,
     kSubColumnOffsetY, kBackgroundSubColumnOffsetY, kIntroSnoidPositions
     and kGameplaySnoidPositions;
   - registerDisplayScrbs for the near view's pieces: a door is SCRB 6013 +
     slot and a platform SCRB 6038 + slot, both of tBMP 6000, with the mask
     between them, SCRB 11503 at levels 2 and 3 and 11504 at level 1 (tBMP
     11500). Level 1 draws only each trunk's lowest room. At level 4 a
     door is SCRB 9002 + door and a floor piece SCRB 9007 + door (tBMP
     9000), placed by REGS 9000 and 9001 and REGS 9002 and 9003 plus the
     door's offsets, with the mask SCRB 11505 between. A board at level 3
     is SCRB 11004 to 11007 (tBMP 11000) at the room's place in REGS 11004
     and 11005;
   - loadFeatures and registerInitialForbiddenScrbs for the far view: the
     label SCRB 11500, 11501 (levels 2 and 3) or 11502, and at level 3 a
     board, SCRB 11000 to 11003, at the room's place in REGS 11000 and
     11001;
   - setupCloseView for the clock, SCRB 6000 + the counter's step, whose
     last tick draws face step + 1 of tBMP 6000's thirteen;
   - placeZoombiniInRoom for where a Zoombini let in comes to stand, and
     startRejectedReturn for where one turned away lands;
   - dimPaletteOnError for the darkening: palette entries 10 to 245, each
     component multiplied by 88% at level 1, 90% at level 3 and 92% at
     levels 2 and 4 and rounded down, once for each Zoombini turned away.
   Screenshots taken in the game (zoombini-reference/screenshots/hotel-*)
   match all of it to the pixel, the darkening after one, two and more
   Zoombinis turned away included, except in two places. At level 4 a
   Zoombini in a room stands 2 pixels lower than placeZoombiniInRoom puts
   it, and the second into a room stands where the first does. A third in
   a level 4 room was not seen.
*/

/* Where each room's script puts a Zoombini, as x and y pairs: the 25
   rooms of levels 1 to 3, slot = 5 x trunk + floor, and the 125 of level
   4, slot = 25 x trunk + 5 x floor + door (ScummVM's kRoomPositions25 and
   kRoomPositions125). */
const ZB_SHOT_HOTEL_ROOMS = [135, 78, 138, 142, 142, 204, 146, 263, 149, 324, 223, 84, 222, 147, 227, 210, 228, 267, 234, 328,
  315, 88, 311, 152, 313, 213, 314, 272, 314, 333, 402, 94, 398, 157, 399, 220, 397, 277, 396, 338,
  491, 100, 489, 164, 489, 226, 488, 284, 485, 346];
const ZB_SHOT_HOTEL_ROOMS4 = [16, 40, 39, 50, 60, 54, 86, 58, 111, 60, 19, 115, 42, 125, 63, 129, 89, 133, 114, 135,
  21, 188, 44, 198, 65, 202, 91, 206, 116, 208, 24, 261, 47, 271, 68, 275, 94, 279, 119, 281,
  28, 333, 51, 343, 73, 347, 99, 351, 124, 353, 142, 54, 165, 60, 186, 64, 212, 68, 237, 70,
  145, 129, 168, 139, 189, 143, 215, 147, 240, 149, 147, 202, 170, 212, 191, 216, 217, 220, 242, 222,
  150, 275, 173, 285, 194, 289, 220, 293, 245, 295, 154, 347, 177, 357, 198, 361, 224, 365, 249, 367,
  268, 59, 291, 69, 312, 73, 338, 77, 363, 79, 271, 134, 294, 144, 315, 148, 341, 152, 366, 154,
  273, 207, 296, 217, 316, 221, 342, 225, 367, 227, 276, 280, 299, 290, 320, 294, 346, 298, 371, 300,
  280, 355, 303, 365, 324, 369, 350, 373, 375, 375, 392, 63, 415, 73, 437, 77, 463, 81, 488, 83,
  395, 138, 418, 148, 439, 152, 465, 156, 490, 158, 397, 211, 420, 221, 441, 225, 467, 229, 492, 231,
  400, 284, 423, 294, 444, 298, 470, 302, 495, 304, 404, 356, 427, 366, 448, 370, 474, 374, 499, 376,
  516, 72, 539, 82, 560, 86, 586, 90, 611, 92, 519, 147, 542, 157, 563, 161, 589, 165, 614, 167,
  521, 220, 544, 230, 567, 234, 593, 238, 618, 240, 524, 293, 547, 303, 568, 307, 594, 311, 619, 313,
  528, 365, 551, 375, 572, 379, 598, 383, 623, 385];
/* Level 4's offsets for each of a floor's five doors: across, down for a
   door and down for its floor piece (kSubColumnOffsetX, kSubColumnOffsetY
   and kBackgroundSubColumnOffsetY). */
const ZB_SHOT_HOTEL_DOOR_X = [0, 23, 46, 69, 94];
const ZB_SHOT_HOTEL_DOOR_Y = [0, 7, 11, 14, 17];
const ZB_SHOT_HOTEL_FLOOR_Y = [0, 10, 16, 20, 23];
/* Where the band waits: small in the far view (kIntroSnoidPositions), and
   at full size in the near view (kGameplaySnoidPositions). */
const ZB_SHOT_HOTEL_FAR = [455, 423, 432, 421, 412, 420, 395, 425, 379, 418, 365, 433, 352, 412, 340, 433, 328, 418, 314, 432,
  295, 421, 279, 430, 264, 437, 259, 421, 244, 432, 226, 421, 211, 427, 195, 419, 176, 423, 158, 431];
const ZB_SHOT_HOTEL_NEAR = [504, 458, 467, 453, 428, 453, 384, 454, 344, 451, 297, 454, 270, 441, 244, 453,
  217, 448, 188, 453, 160, 449, 130, 455, 103, 446, 74, 454, 50, 445, 17, 453];
/* Each Zoombini turned away multiplies the palette's brightness by this
   percentage, by level (dimPaletteOnError). */
const ZB_SHOT_HOTEL_SHADE = [88, 92, 90, 92];

/* The hotel's sprite sheets, scripts and REGS, read once an archive:
   { sheet(id), ticks(id), regs(id), boards }. `ticks` is a SCRB's as
   zbFeatureTicks gives them, and `boards` has the empty hotels drawn so
   far (zbShotHotelBoard). */
const ZB_SHOT_HOTEL_CACHE = new WeakMap();
function zbShotHotelParts(arc) {
  if (!ZB_SHOT_HOTEL_CACHE.has(arc)) {
    const sheets = new Map(), scripts = new Map(), regs = new Map();
    const read = (map, id, make) => { if (!map.has(id)) map.set(id, make()); return map.get(id); };
    ZB_SHOT_HOTEL_CACHE.set(arc, {
      sheet: id => read(sheets, id, () => decodeBitmapResource(arc.get('tBMP', id)).frames),
      ticks: id => read(scripts, id, () => zbFeatureTicks(parseScript(arc.get('SCRB', id), 'SCRB'))),
      regs: id => read(regs, id, () => parseRegs(arc.get('REGS', id))),
      boards: new Map(),
    });
  }
  return ZB_SHOT_HOTEL_CACHE.get(arc);
}

/* The slots of the rooms a level draws: level 1 only each trunk's lowest
   room. */
function zbShotHotelSlots(level) {
  if (level === 4) return Array.from({ length: 125 }, (_, i) => i);
  return Array.from({ length: 25 }, (_, i) => i).filter(i => level !== 1 || i % 5 === 4);
}

/* One tick of a room's piece as zbShotDrawing's pieces: `kind` 'door' or
   'platform' (at level 4 the floor piece under the door), `tick` the tick
   of its script. Levels 1 to 3 draw each record at the record's x and y.
   Level 4 has one script for each of a floor's five doors, written for the
   first floor of the first trunk, and draws it where REGS 9000 and 9001 (a
   door) or 9002 and 9003 (a floor piece) put the floor, plus the door's
   offsets, with the script's first record at that point. */
function zbShotHotelPieces(arc, level, slot, kind, tick) {
  const P = zbShotHotelParts(arc), door = kind === 'door';
  if (level < 4) return P.ticks((door ? 6013 : 6038) + slot)[tick].records.map(r => ({ sprite: P.sheet(6000)[r.shape - 1], x: r.x, y: r.y }));
  const d = slot % 5, floor = Math.floor(slot / 5) + 1, ticks = P.ticks((door ? 9002 : 9007) + d), first = ticks[0].records[0];
  const X = P.regs(door ? 9000 : 9002)[floor] + ZB_SHOT_HOTEL_DOOR_X[d];
  const Y = P.regs(door ? 9001 : 9003)[floor] + (door ? ZB_SHOT_HOTEL_DOOR_Y : ZB_SHOT_HOTEL_FLOOR_Y)[d];
  return ticks[tick].records.map(r => ({ sprite: P.sheet(9000)[r.shape - 1], x: X + r.x - first.x, y: Y + r.y - first.y }));
}

/* The empty hotel of a level's near view, as 640 x 480 indices: the
   picture with every door closed, the mask over the doors, and every
   platform out, in the order registerDisplayScrbs loads them. Levels 2
   and 3 are alike. */
function zbShotHotelBoard(arc, level) {
  const P = zbShotHotelParts(arc), key = level === 3 ? 2 : level;
  if (!P.boards.has(key)) {
    const pixels = Uint8Array.from(decodeBitmapResource(arc.get('tBMP', level === 4 ? 5002 : 5001)).frames[0].pixels);
    const draw = pieces => {
      for (const p of pieces) {
        const f = p.sprite;
        for (let y = 0; y < f.height; y++) {
          for (let x = 0; x < f.width; x++) {
            const v = f.pixels[y * f.width + x], X = p.x + x, Y = p.y + y;
            if (v && X >= 0 && Y >= 0 && X < ZB_SHOT_W && Y < ZB_SHOT_H) pixels[Y * ZB_SHOT_W + X] = v;
          }
        }
      }
    };
    const slots = zbShotHotelSlots(level);
    for (const s of slots) draw(zbShotHotelPieces(arc, level, s, 'door', 0));
    draw(P.ticks(level === 1 ? 11504 : level === 4 ? 11505 : 11503)[0].records.map(r => ({ sprite: P.sheet(11500)[r.shape - 1], x: r.x, y: r.y })));
    for (const s of slots) draw(zbShotHotelPieces(arc, level, s, 'platform', 0));
    P.boards.set(key, pixels);
  }
  return P.boards.get(key);
}

/* The hotel's looks for zb-shot.js (ZB_SHOT_LOOKS): for the near view's
   picture, each level's empty hotel with the palette darkened 0 times up
   to once for every Zoombini the level lets the hotel turn away. `about`
   is { level, turnedAway }. Level 3's look with none turned away is level
   2's, so only level 2's is in the list, and a board on a room shows
   that the level is 3. */
function zbShotHotelLooks(arc, picture, pal) {
  const out = [];
  for (const level of picture === 5001 ? [1, 2, 3] : picture === 5002 ? [4] : []) {
    const pixels = zbShotHotelBoard(arc, level), percent = ZB_SHOT_HOTEL_SHADE[level - 1];
    let p = pal;
    for (let n = 0; n <= ZB_HOTEL_LAST_STEP - ZB_HOTEL_FIRST_STEP[level - 1]; n++) {
      if (n) p = p.map((c, i) => (i >= 10 && i <= 245 ? c.map(v => Math.floor(v * percent / 100)) : c));
      if (n || level !== 3) out.push({ pixels, pal: p, about: { level, turnedAway: n } });
    }
  }
  return out;
}
ZB_SHOT_LOOKS.HOTEL = zbShotHotelLooks;

/* A room's place in a level's terms: { trunk, floor, door }, each counted
   from 1, trunks and doors from the left and floors from the top. Level 1
   has only `trunk`, and levels 2 and 3 have no `door`. */
function zbShotHotelRoom(level, slot) {
  if (level === 4) return { trunk: Math.floor(slot / 25) + 1, floor: Math.floor(slot / 5) % 5 + 1, door: slot % 5 + 1 };
  return level === 1 ? { trunk: Math.floor(slot / 5) + 1 } : { trunk: Math.floor(slot / 5) + 1, floor: slot % 5 + 1 };
}

/* Where the Zoombini that is the `count`th into a room stands, as [x, y]
   (placeZoombiniInRoom). At levels 1 to 3 the script's point moves 24
   right and 10 up, left again by an amount that goes with the trunk, and
   then to one of three places across, and each Zoombini after the second
   stands a pixel lower. The room's counter is 0 for the first Zoombini
   and `count` for each later one. At level 4 the first two Zoombinis
   stand at one place, as the screenshots have it, and ScummVM puts each
   later one 2 left and 1 up, so there `count` is 1 for that place and one
   more for each step from it. Level 4's height is 2 lower than ScummVM's,
   as the screenshots have it. */
function zbShotHotelStand(level, slot, count) {
  const depth = count === 1 ? 0 : count;
  if (level === 4) return [ZB_SHOT_HOTEL_ROOMS4[2 * slot] + 5 - 2 * (count - 1), ZB_SHOT_HOTEL_ROOMS4[2 * slot + 1] - 15 - (count - 1)];
  const trunk = Math.floor(slot / 5);
  const left = level === 1 ? [5, 7, 3, 3, 3][trunk] : [8, 6, 5, 4, 5][trunk];
  const across = depth === 0 || depth % 3 === 1 ? -8 : depth % 3 === 2 ? -1 : 6;
  return [ZB_SHOT_HOTEL_ROOMS[2 * slot] + 24 - left + across, ZB_SHOT_HOTEL_ROOMS[2 * slot + 1] - 10 + depth];
}

/* The room a Zoombini at (x, y) stands in, and how many Zoombinis the
   room has when it is the front one: { slot, count }, or null when it is
   more than 2 pixels from every such place. */
function zbShotHotelRoomAt(level, x, y) {
  let best = null;
  for (const slot of zbShotHotelSlots(level)) {
    for (let count = 1; count <= 16; count++) {
      const [sx, sy] = zbShotHotelStand(level, slot, count), d = Math.abs(sx - x) + Math.abs(sy - y);
      if (d <= 2 && (!best || d < best.d)) best = { slot, count, d };
    }
  }
  return best && { slot: best.slot, count: best.count };
}

/* The part of the frame a room's doorway shows a Zoombini in, as [left,
   top, right, bottom]. At levels 1 to 3 it is the 52 x 82 box
   placeZoombiniInRoom cuts the Zoombini to, 3 higher for the rooms whose
   box that function raises. At level 4 it is the door's place from REGS
   9000 and 9001, 23 wide, the distance to the next door, and 72 high. */
function zbShotHotelDoorway(arc, level, slot) {
  if (level === 4) {
    const P = zbShotHotelParts(arc), floor = Math.floor(slot / 5) + 1, d = slot % 5;
    const X = P.regs(9000)[floor] + ZB_SHOT_HOTEL_DOOR_X[d], Y = P.regs(9001)[floor] + ZB_SHOT_HOTEL_DOOR_Y[d];
    return [X + 2, Y, X + 25, Y + 72];
  }
  const X = ZB_SHOT_HOTEL_ROOMS[2 * slot] - 16, Y = ZB_SHOT_HOTEL_ROOMS[2 * slot + 1] - 33;
  return [X, Y, X + 52, Y + 85];
}

/* Every sprite of a Zoombini's parts with its pixels as zbShotPoints
   gives them, made once a frame: [{ part, value, frame, pts }]. */
function zbShotHotelSprites(frame, sheet) {
  if (!frame.hotelSprites) frame.hotelSprites = zbShotPartSprites(sheet.blocks).map(s => ({ part: s.part, value: s.value, frame: s.frame, pts: zbShotPoints(sheet.frames[s.frame], frame.palKeys) }));
  return frame.hotelSprites;
}

/* A Zoombini read at a known place in a doorway: every pose of every part
   is put where it gives the origin (x, y), and only its pixels inside
   `box` that differ from the empty hotel (`fg`) and that `taken` does not
   mark count, one for it where the frame has the sprite's color and one
   against it elsewhere. So what the doorway's edge cuts off counts
   neither way. Returns { x, y, traits, total, shown }: each trait the
   value whose best pose scores highest, read when that score is at least
   `least` and at least twice the next value's, and otherwise null;
   `total` the sum of the body's score and each trait's best; `shown`
   the frame pixels the read parts' best poses match. */
function zbShotHotelStanding(frame, fg, sheet, box, x, y, taken, least) {
  const best = new Map(), keys = frame.keys;
  for (const s of zbShotHotelSprites(frame, sheet)) {
    const x0 = x - sheet.xs[s.frame + 1], y0 = y - sheet.ys[s.frame + 1], pts = s.pts;
    let matched = 0, missed = 0;
    for (let p = 0; p < pts.length; p += 3) {
      const X = x0 + pts[p], Y = y0 + pts[p + 1];
      if (X < box[0] || X >= box[2] || Y < box[1] || Y >= box[3]) continue;
      const i = Y * ZB_SHOT_W + X;
      if (!fg[i] || (taken && taken[i])) continue;
      if (keys[i] === pts[p + 2]) matched++; else missed++;
    }
    const k = s.part + s.value, score = matched - missed;
    if (!best.has(k) || score > best.get(k).score) best.set(k, { score, sprite: s, x0, y0 });
  }
  const traits = {}, read = [];
  let total = best.get('body1').score;
  for (const part of ZB_SHOT_TRAITS) {
    const [first, second] = [1, 2, 3, 4, 5].map(v => ({ v, ...best.get(part + v) })).sort((a, b) => b.score - a.score);
    total += first.score;
    traits[part] = first.score >= least && first.score >= 2 * Math.max(1, second.score) ? first.v : null;
    if (traits[part] != null) read.push(first);
  }
  const shown = [];
  for (const b of read) {
    const pts = b.sprite.pts;
    for (let p = 0; p < pts.length; p += 3) {
      const X = b.x0 + pts[p], Y = b.y0 + pts[p + 1];
      if (X < box[0] || X >= box[2] || Y < box[1] || Y >= box[3]) continue;
      const i = Y * ZB_SHOT_W + X;
      if (fg[i] && !(taken && taken[i]) && keys[i] === pts[p + 2]) shown.push(i);
    }
  }
  return { x, y, traits, total, shown };
}

/* The Zoombinis in an open room, from a screenshot that copies pixels:
   { count, front, behind }, or null when none fits. The front Zoombini is
   the standing place (zbShotHotelStand) whose reading totals most, at
   least 60, and its place gives `count`. At levels 1 to 3 each earlier
   one is then read at its place from the pixels the ones in front do not
   show, the nearest first, and a trait of those is read only on 25
   pixels. `behind` has them from the first let in, each { x, y, traits }. */
function zbShotHotelInRoom(frame, fg, sheet, level, slot) {
  const box = zbShotHotelDoorway(frame.arc, level, slot);
  let front = null;
  for (let count = 1; count <= (level === 4 ? 8 : 16); count++) {
    const [x, y] = zbShotHotelStand(level, slot, count);
    const r = zbShotHotelStanding(frame, fg, sheet, box, x, y, null, 8);
    if (!front || r.total > front.total) front = { ...r, count };
  }
  if (!front || front.total < 60) return null;
  const behind = [];
  if (level < 4) {
    const taken = new Uint8Array(ZB_SHOT_W * ZB_SHOT_H);
    for (const i of front.shown) taken[i] = 1;
    for (let count = front.count - 1; count >= 1; count--) {
      const [x, y] = zbShotHotelStand(level, slot, count);
      const r = zbShotHotelStanding(frame, fg, sheet, box, x, y, taken, 25);
      for (const i of r.shown) taken[i] = 1;
      behind.unshift(r);
    }
  }
  return { count: front.count, front, behind };
}

/* Zoombinis below the rooms that zb-shot.js left out because others hide
   their body and hair: zb-shot.js starts a Zoombini from one of those
   two. Here two or more parts of different kinds, each matching at least
   40 pixels, that give one origin within 2 pixels and stand more than 8
   from every Zoombini in `zoombinis` make one. zbShotInferHidden then
   reads its other traits where enough of them shows. Returns them as
   zbShotGroup does. */
function zbShotHotelHalfHidden(frame, fg, sheet, zoombinis) {
  const parts = zbShotFindParts(frame.keys, fg, sheet, frame.palKeys)
    .filter(p => p.matched >= 40 && p.oy >= 400 && !zoombinis.some(z => Math.abs(z.x - p.ox) <= 8 && Math.abs(z.y - p.oy) <= 8))
    .sort((a, b) => b.matched - a.matched);
  const groups = [];
  for (const p of parts) {
    const g = groups.find(q => Math.abs(q.x - p.ox) <= 2 && Math.abs(q.y - p.oy) <= 2);
    if (!g) groups.push({ x: p.ox, y: p.oy, parts: { [p.part]: p } });
    else if (!g.parts[p.part]) g.parts[p.part] = p;
  }
  const kept = groups.filter(g => Object.keys(g.parts).length >= 2);
  /* one Zoombini's parts in other poses give a second origin near the first */
  const out = kept.filter((g, k) => !kept.slice(0, k).some(q => Math.abs(q.x - g.x) <= 8 && Math.abs(q.y - g.y) <= 8));
  for (const g of out) {
    g.traits = {};
    for (const k of ZB_SHOT_TRAITS) g.traits[k] = g.parts[k] ? g.parts[k].value : null;
  }
  zbShotInferHidden(frame.keys, fg, out, sheet, frame.palKeys);
  return out;
}

/* The clock of levels 1 to 3: the counter's step, 0 to 12, or null when
   no clock shows. Each step's script (SCRB 6000 + step) ends on the
   clock's cord, its two weights and a face, and the step whose last
   drawing fits best is read when at least 80% of it fits. */
function zbShotHotelClock(env) {
  const P = zbShotHotelParts(env.arc);
  let best = null;
  for (let step = 0; step <= ZB_HOTEL_LAST_STEP; step++) {
    const drawn = P.ticks(6000 + step).filter(t => t.records.length), last = drawn[drawn.length - 1];
    const f = zbShotDrawingFit(env, zbShotDrawing(env, last.records.map(r => ({ sprite: P.sheet(6000)[r.shape - 1], x: r.x, y: r.y }))), 0, 0);
    if (!best || f.value > best.value) best = { ...f, step };
  }
  return best && best.fit >= 0.8 ? best.step : null;
}

/* How a room's door stands: 'closed', 'open' or 'moving'. Each tick of
   the door's script is compared with the frame, and the tick that fits
   best is the first (closed), the last (open) or one between. A Zoombini
   in the doorway hides most of an open door, and the open door still fits
   better than the others. */
function zbShotHotelDoor(env, level, slot) {
  const last = level === 4 ? 4 : 3;
  let best = null;
  for (let tick = 0; tick <= last; tick++) {
    const f = zbShotDrawingFit(env, zbShotDrawing(env, zbShotHotelPieces(env.arc, level, slot, 'door', tick)), 0, 0);
    if (!best || f.value > best.value) best = { ...f, tick };
  }
  return best.tick === 0 ? 'closed' : best.tick === last ? 'open' : 'moving';
}

/* The slots of the rooms boarded up, which only level 3 has. `far` reads
   the far view, whose boards are SCRB 11000 to 11003 at the room's place
   in REGS 11000 and 11001, and otherwise the near view, SCRB 11004 to
   11007 at REGS 11004 and 11005. Each of the four boards is drawn with
   its registration point (REGS 11002 and 11003) at the room's place, and
   a room is boarded when 80% of one fits. */
function zbShotHotelBoards(env, far) {
  const P = zbShotHotelParts(env.arc), xs = P.regs(far ? 11000 : 11004), ys = P.regs(far ? 11001 : 11005);
  const rx = P.regs(11002), ry = P.regs(11003), out = [];
  for (let slot = 0; slot < 25; slot++) {
    for (let v = 0; v < 4; v++) {
      const shape = P.ticks((far ? 11000 : 11004) + v)[0].records[0].shape;
      const f = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite: P.sheet(11000)[shape - 1], x: -rx[shape], y: -ry[shape] }]), xs[slot + 1], ys[slot + 1]);
      if (f.shown >= 0.5 && f.fit >= 0.8) { out.push(slot); break; }
    }
  }
  return out;
}

/* The far view's level: 1, 2 or 4, or null. The label on the trunks is
   the first record of SCRB 11500 (level 1), 11501 (levels 2 and 3) or
   11502 (level 4), and the one that fits best is read when 80% of it
   fits. A board shows that a level read as 2 is 3. */
function zbShotHotelFarLevel(env) {
  const P = zbShotHotelParts(env.arc);
  let best = null;
  [1, 2, 4].forEach((level, k) => {
    const r = P.ticks(11500 + k)[0].records[0];
    const f = zbShotDrawingFit(env, zbShotDrawing(env, [{ sprite: P.sheet(11500)[r.shape - 1], x: r.x, y: r.y }]), 0, 0);
    if (!best || f.value > best.value) best = { ...f, level };
  });
  return best && best.fit >= 0.8 ? best.level : null;
}

/* The far view's band, drawn small from ZOOMBINI tBMP 3200: the parts
   found as zb-shot.js finds the full-size ones, grouped within 3 pixels.
   Only a screenshot that copies pixels has parts this small in colors
   that can be compared, so a smoothed one gives []. */
function zbShotHotelFarBand(frame) {
  if (frame.frame) return [];
  const sheet = zbSnoidSheet(frame.archives.get('ZOOMBINI'), 'small');
  const fg = zbShotForeground(frame.keys, frame.pixels, frame.palKeys);
  const zoombinis = zbShotGroup(zbShotBestParts(zbShotFindParts(frame.keys, fg, sheet, frame.palKeys), frame.keys, sheet, frame.palKeys), 3);
  zbShotInferHidden(frame.keys, fg, zoombinis, sheet, frame.palKeys, 1);
  return zoombinis;
}

/* The traits the rooms filled allow: `rooms` is [{ room, traits }], each
   a room (zbShotHotelRoom) and its front Zoombini's traits. Returns
   [{ traits, values }] for every choice of different traits, one for each
   of the level's places (ZB_HOTEL_PLACES), under which Zoombinis that
   share a floor, a trunk or a door are alike in its trait and Zoombinis
   on two of them differ. `values[j]` is { position: value } for the
   positions settled. A Zoombini with a trait unread is left out. */
function zbShotHotelFitting(level, rooms) {
  const places = ZB_HOTEL_PLACES[level - 1], out = [];
  const choose = picked => {
    if (picked.length < places.length) {
      for (const k of ZB_HOTEL_AXES) if (!picked.includes(k)) choose([...picked, k]);
      return;
    }
    const values = [];
    for (let j = 0; j < places.length; j++) {
      const at = {}, seen = new Map();
      for (const r of rooms) {
        const p = r.room[places[j]], v = r.traits[picked[j]];
        if (v == null) continue;
        if ((p in at && at[p] !== v) || (seen.has(v) && seen.get(v) !== p)) return;
        at[p] = v; seen.set(v, p);
      }
      values.push(at);
    }
    out.push({ traits: picked, values });
  };
  choose([]);
  return out;
}

/* A boarded room in words, by its slot: "floor 3 of trunk 1". */
function zbShotHotelBoardWords(slot) { return `floor ${slot % 5 + 1} of trunk ${Math.floor(slot / 5) + 1}`; }

/* A list in words: "a, b and c". */
function zbShotHotelWords(list) { return zbWordsOr(list, 'and'); }

/* Hotel Dimensia. Returns { zoombinis, state, lines, link, level, rooms,
   fitting }.
   In the far view (tBMP 5000) `state` is { view: 'far', level, boarded,
   waiting }: the level from the label on the trunks, the slots boarded
   up, and the band read small, from the left.
   In the near view `state` is { view: 'near', level, clock, turnedAway,
   chancesLeft, boarded, rooms, waiting, moving, fitting }. `level` and
   `turnedAway` are the look's that fits (zbShotHotelLooks), with level 3
   for a level 2 that has boards. `clock` is the counter's step or null.
   `rooms` has each room whose door is open, in slot order, as its place
   (zbShotHotelRoom) with `count`, how many Zoombinis it has, `front`, the
   one that shows, and `behind`, the others from the first let in, as far
   as they show. `count` is null at level 4 and where no Zoombini was read
   in the room, and `front` is null there too.
   `waiting` are the Zoombinis below the rooms from the left, `moving`
   any other, and `fitting` the traits zbShotHotelFitting gives, in the
   order of the level's places. A Zoombini is its four digits, with ? for
   a trait unread. A part that the frame's edge cuts is left unread. */
function zbShotHotel(frame, read) {
  let zoombinis = read;
  const env = zbShotEnv(frame), code = z => ZB_SHOT_TRAITS.map(k => z.traits[k] ?? '?').join('');
  const lines = [];
  if (frame.picture === 5000) {
    let level = zbShotHotelFarLevel(env);
    const boarded = level === 2 ? zbShotHotelBoards(env, true) : [];
    if (boarded.length) level = 3;
    const band = zbShotHotelFarBand(frame).sort((a, b) => a.x - b.x || a.y - b.y);
    for (const z of band) z.where = 'waiting, far off';
    lines.push('The screenshot shows the hotel from far off, before the band is at its doors.');
    if (level == null) lines.push('The page could not read the level from the marks on the trunks.');
    else if (level === 2) lines.push('The trunks show five floors of rooms and no board, so the level is 2.');
    else if (level === 3) lines.push(`The trunks show five floors of rooms, and ${boarded.length === 1 ? 'one room is' : `${boarded.length} rooms are`} boarded up, so the level is 3. Counting trunks from the left and floors from the top, the boarded-up rooms are ${zbShotHotelWords(boarded.map(zbShotHotelBoardWords))}.`);
    else lines.push(level === 1 ? 'The trunks show one row of rooms, so the level is 1.' : 'The trunks show five doors on every floor, so the level is 4.');
    if (frame.frame) lines.push('The band is drawn small in this view, and a smoothed screenshot blurs it too much to read.');
    else lines.push(`${band.length === 1 ? 'One Zoombini waits' : `${band.length || 'No'} Zoombinis wait`} in front of the hotel.`);
    return { zoombinis: band, level, state: { view: 'far', level, boarded, waiting: band.map(code) }, lines, link: null };
  }

  /* a part the frame's edge cuts may fit another value as well */
  for (const z of zoombinis) {
    for (const k of ZB_SHOT_TRAITS) {
      const p = z.parts && z.parts[k];
      if (p && p.known < p.pixels) z.traits[k] = null;
    }
  }
  if (!frame.look) {
    for (const z of zoombinis) z.where = '';
    lines.push('The page could not match the hotel to one of its levels, so it reads no rooms. The picture may be changing as the hotel grows darker.');
    return { zoombinis, level: null, state: { view: 'near', level: null }, lines, link: null };
  }
  let level = frame.look.level;
  const turnedAway = frame.look.turnedAway;
  const boarded = level === 2 || level === 3 ? zbShotHotelBoards(env, false) : [];
  if (boarded.length) level = 3;
  const chances = ZB_HOTEL_LAST_STEP - ZB_HOTEL_FIRST_STEP[level - 1];
  const clock = level === 4 ? null : zbShotHotelClock(env);

  /* the rooms whose door is open, and the Zoombinis that stand in them */
  const open = new Map();
  let doorsMoving = 0;
  for (const slot of zbShotHotelSlots(level)) {
    if (boarded.includes(slot)) continue;
    const door = zbShotHotelDoor(env, level, slot);
    if (door === 'open') open.set(slot, []);
    else if (door === 'moving') doorsMoving++;
  }
  /* a screenshot that copies pixels: each open room read at its standing
     places, in place of what zb-shot.js read inside its doorway */
  const waiting = [], moving = [], rooms = [], inRooms = [];
  const position = slot => (level === 1 ? [Math.floor(slot / 5)] : level === 4 ? [Math.floor(slot / 5) % 5, Math.floor(slot / 25), slot % 5] : [slot % 5, Math.floor(slot / 5)]);
  if (!env.smoothed) {
    const sheet = zbSnoidSheet(frame.archives.get('ZOOMBINI')), fg = zbShotForeground(frame.keys, frame.pixels, frame.palKeys);
    for (const slot of open.keys()) {
      const box = zbShotHotelDoorway(frame.arc, level, slot), found = zbShotHotelInRoom(frame, fg, sheet, level, slot);
      if (!found) continue;
      /* a Zoombini turned away at the door stands at the box's left edge,
         12 or more left of any place in the room */
      const left = box[0] + (level === 4 ? 0 : 12);
      zoombinis = zoombinis.filter(z => z.x < left || z.x >= box[2] || z.y < box[1] || z.y >= box[3]);
      found.front.count = found.count;
      open.get(slot).push(found.front, ...found.behind.map((z, k) => ({ ...z, count: k + 1 })).reverse());
    }
    zoombinis = [...zoombinis, ...zbShotHotelHalfHidden(frame, fg, sheet, [...zoombinis, ...[...open.values()].flat()])];
  }
  for (const z of zoombinis) {
    const at = env.smoothed ? zbShotHotelRoomAt(level, z.x, z.y) : null;
    if (at && open.has(at.slot)) { z.count = at.count; open.get(at.slot).push(z); }
    else if (z.y >= 400) waiting.push(z);
    else moving.push(z);
  }
  waiting.sort((a, b) => a.x - b.x || a.y - b.y);
  for (const [slot, list] of [...open.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => b.count - a.count);
    const name = zbHotelRoomName(level, position(slot));
    list.forEach((z, k) => { z.where = `in ${name}${k ? ', behind another' : ''}`; });
    inRooms.push(...list);
    rooms.push({ slot, room: zbShotHotelRoom(level, slot), count: list.length && level < 4 ? list[0].count : null, front: list[0] || null, behind: list.slice(1).reverse() });
  }
  for (const z of waiting) z.where = 'waiting below';
  for (const z of moving) z.where = 'on its way';
  const band = [...inRooms, ...waiting, ...moving];
  const fitting = zbShotHotelFitting(level, rooms.filter(r => r.front).map(r => ({ room: r.room, traits: r.front.traits })));

  /* the sentences */
  const slots = zbShotHotelSlots(level).length;
  lines.push(level === 1 ? 'The hotel has five rooms, one in each trunk, so the level is 1.'
    : level === 4 ? 'The hotel has 125 rooms, five doors on each floor of each trunk, so the level is 4.'
      : level === 3 ? `The hotel has 25 rooms and ${boarded.length === 1 ? 'one is' : `${boarded.length} are`} boarded up, so the level is 3. Counting trunks from the left and floors from the top, the boarded-up rooms are ${zbShotHotelWords(boarded.map(zbShotHotelBoardWords))}.`
        : 'The hotel has 25 rooms and none is boarded up, so the level is 2.');
  const inside = rooms.reduce((n, r) => n + (r.count || 0), 0), unreadRooms = rooms.filter(r => !r.front).length;
  const behind = rooms.reduce((n, r) => n + r.behind.length, 0), hidden = inside - rooms.filter(r => r.front).length - behind;
  const wait = `${waiting.length === 1 ? 'one waits' : `${waiting.length || 'none'} wait`} below`;
  if (!rooms.length) lines.push(`No room is occupied. ${waiting.length === 1 ? 'One Zoombini waits' : `${waiting.length || 'No'} Zoombinis wait`} below.`);
  else if (level === 4) {
    lines.push(`${rooms.length === 1 ? 'One room is' : `${rooms.length} of the ${slots} rooms are`} occupied, and ${wait}.`);
    lines.push('At level 4 a second Zoombini in a room stands right behind the first, so a room does not show how many it has.');
  } else {
    lines.push(`${rooms.length === 1 ? 'One room is' : `${rooms.length} of the ${slots} rooms are`} occupied, with ${inside === 1 ? 'one Zoombini' : `${inside} Zoombinis`} in ${rooms.length === 1 ? 'it' : 'them'}, and ${wait}.`);
    if (behind + hidden > 0) lines.push('The last Zoombini let into a room stands in front, and its place gives how many the room has.'
      + (behind ? ` ${behind === 1 ? 'One Zoombini stands' : `${behind} Zoombinis stand`} behind another, and the page reads only the parts that show past the ones in front.` : ` ${hidden === 1 ? 'One Zoombini is' : `${hidden} Zoombinis are`} behind another and unread.`));
  }
  if (unreadRooms) lines.push(`${unreadRooms === 1 ? 'One open room has' : `${unreadRooms} open rooms have`} no Zoombini the page could read.`);
  if (moving.length) lines.push(`${moving.length === 1 ? 'One Zoombini is' : `${moving.length} Zoombinis are`} on the way to a room or back from one.`);
  if (doorsMoving) lines.push(`${doorsMoving === 1 ? 'One door is' : `${doorsMoving} doors are`} opening or closing.`);
  const left = chances - turnedAway;
  lines.push((turnedAway ? `The hotel is darker than at the start by ${turnedAway === 1 ? 'one step' : `${turnedAway} steps`}, so it has turned away ${turnedAway === 1 ? 'one Zoombini' : `${turnedAway} Zoombinis`}.` : 'The hotel is as bright as at the start, so it has turned no Zoombini away.')
    + (left > 0 ? ` It may turn away ${left} more, and the last of those closes it.` : ' It is closed.'));
  if (level === 4) lines.push('Level 4 shows no clock.');
  else if (clock == null) lines.push('The clock does not show.');
  else if (clock - ZB_HOTEL_FIRST_STEP[level - 1] !== turnedAway) lines.push(`The clock is at step ${clock} of ${ZB_HOTEL_LAST_STEP}, and the darkness gives step ${ZB_HOTEL_FIRST_STEP[level - 1] + turnedAway}, so the clock is still moving.`);
  else lines.push(`The clock is at step ${clock} of ${ZB_HOTEL_LAST_STEP}. This level starts it at step ${ZB_HOTEL_FIRST_STEP[level - 1]}.`);
  const places = ZB_HOTEL_PLACES[level - 1];
  const goBy = f => (level === 1 ? `the rooms go by ${f.traits[0]}` : zbShotHotelWords(f.traits.map((k, j) => `the ${places[j]}s go by ${k}`)));
  const all = level === 1 ? 4 : level === 4 ? 24 : 12;
  if (rooms.some(r => r.front)) {
    if (!fitting.length) lines.push('No choice of traits fits the Zoombinis read in the rooms, so one of them is misread or is still on its way in.');
    else if (fitting.length === 1) {
      const f = fitting[0], settled = [];
      f.values.forEach((at, j) => { for (const p of Object.keys(at).sort()) settled.push(`${level === 1 ? 'the room in trunk' : places[j]} ${p} is for Zoombinis with ${zbTraitWith(f.traits[j], at[p])}`); });
      lines.push(`One choice of traits fits the rooms filled. In it ${goBy(f)}. So far ${zbShotHotelWords(settled)}.`);
    } else if (fitting.length === all) lines.push('Every choice of traits still fits the rooms filled.');
    else {
      const shown = fitting.slice(0, 6).map(goBy);
      lines.push(`${fitting.length} of the ${all} choices of traits fit the rooms filled.` + (fitting.length <= 6 ? ` Either ${shown.join(', or ')}.` : ` Among them, ${shown.join(', or ')}.`));
    }
  }

  /* the link: one choice of traits, and the whole band read */
  const complete = band.length > 0 && !moving.length && hidden === 0 && !unreadRooms && (level < 4 || band.length === 16)
    && band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  let link = null;
  if (fitting.length === 1 && rooms.length && complete && band.length <= 16) {
    const set = {};
    places.forEach((pl, j) => { set[pl] = fitting[0].traits[j]; });
    if (level === 3) set.boarded = boarded;
    link = { hash: `solve=HOTEL${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(band.map(z => z.traits))}&set=${encodeURIComponent(JSON.stringify(set))}`, text: 'Take it apart' };
  }
  const state = {
    view: 'near', level, clock, turnedAway, chancesLeft: left, boarded,
    rooms: rooms.map(r => ({ ...r.room, count: r.count, front: r.front ? code(r.front) : null, behind: r.behind.map(code) })),
    waiting: waiting.map(code), moving: moving.map(code), fitting: fitting.map(f => f.traits),
  };
  return { zoombinis: band, level, rooms, fitting, state, lines, link };
}
ZB_SHOT_PUZZLES.HOTEL = zbShotHotel;
