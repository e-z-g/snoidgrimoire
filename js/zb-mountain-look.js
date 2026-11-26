/* zb-mountain-look.js -- Mountain Rescue's Zoombinis as the 1996 game draws
   them: for each view and frame of an .anm, the 1996 walk, side and tick
   that a mod would draw in its place, and each trait value's 1996 value.
   =========================================================================
   Needs zb-snoid.js (zbWalkDirection) and zb-puzzle.js (ZB_TRAIT_SHORT).

   A preview first, at the maintainer's choosing (25 November 2026), before
   any mod is written. The 1996 Zoombini has five walk directions, from
   straight down to straight up, each mirrored when it walks left, and
   Mountain Rescue's has 16 views around the circle. A view's number is two
   digits of a numeric keypad (doc/MOUNTAIN-RESCUE.md), so its angle is
   halfway between its digits' angles, and the 1996 walk is the one the
   1996 program would pick for a move at that angle (zbWalkDirection's
   thresholds). The 1996 walk plays at the 1996 game's pace, a tick every
   102 ms, while Mountain Rescue shows a frame every 50 ms, so a 1996 tick
   lasts about two frames. Squeezed into Mountain Rescue's cycle of 11
   frames (0.55 s) instead, the 1996 walks played 1.5 to 4.5 times too
   fast, which the maintainer saw. A mod would need a view's feet to have
   about twice as many frames as the 1996 walk has ticks, 12 to 49.

   The traits go by name. Mountain Rescue's names are its trait pictures'
   (mystic_marsh/traits), as doc/MOUNTAIN-RESCUE.md reads them. Feet, hair
   and eyes all have a 1996 value of the same name. The noses keep a 1996
   shape in Mountain Rescue's five colors, at the maintainer's choosing (26
   November 2026), so that its puzzles' trait signs still match: orange,
   green and blue on the 1996 nose of that name, white on the purple one and
   pink on the red one. mrLookNoseColors gives each shade of the 1996 nose
   the Mountain Rescue nose's shade at the same place from dark to light.

   The other sets (MR_LOOK_SETS) have one view each and play in one place,
   and the 1996 scripts proposed for them are doc/MOUNTAIN-RESCUE.md's
   (§ Where each Zoombini set plays), for the maintainer to judge by eye
   (26 November 2026). Mountain Rescue draws a set in place and moves the
   sprite, so the 1996 script is drawn with its body held still
   (mrLookPlaced). The cannon's five views are still pictures of a
   Zoombini seen from behind, flying head first, and the 1996 match is the
   tumble's pose whose head points the same way from its feet
   (mrLookTumblePose).
*/

const MR_LOOK_NAMES = {
  feet: ['Sneakers', 'Roller skates', 'Spring', 'Wheels', 'Propeller'],
  nose: ['Orange', 'White', 'Green', 'Blue', 'Pink'],
  hair: ['Shaggy', 'Ponytail', 'Cap', 'Flat top', 'Tuft'],
  eyes: ['Wide eyes', 'One eye', 'Sleepy eyes', 'Sunglasses', 'Glasses'],
};
const MR_LOOK_NOSE_STAND_INS = { White: 'Purple', Pink: 'Red' };

/* A Mountain Rescue trait value (1-5) as the 1996 value: { value, stand,
   recolor }, `stand` true for a nose with no 1996 match by name, and
   `recolor` true for every nose, drawn in Mountain Rescue's color. */
function mrLookTrait(part, value) {
  const name = MR_LOOK_NAMES[part][value - 1];
  let at = ZB_TRAIT_SHORT[part].indexOf(name), stand = false;
  if (at < 0 && part === 'nose' && MR_LOOK_NOSE_STAND_INS[name]) { at = ZB_TRAIT_SHORT.nose.indexOf(MR_LOOK_NOSE_STAND_INS[name]); stand = true; }
  if (at < 0) throw new Error(`no 1996 ${part} for ${name}`);
  return { value: at + 1, stand, recolor: part === 'nose' };
}

/* The colors of a 1996 nose redone in a Mountain Rescue nose's: a Map of
   palette index -> [r, g, b]. `counts` is the 1996 nose's pixels as a Map
   of index -> count, `pal` its palette as [r, g, b] by index, and `mr` the
   Mountain Rescue nose's pixels as [r, g, b]. Both are ordered dark to
   light, and each 1996 index becomes the Mountain Rescue pixel at the
   middle of its share of the 1996 nose. */
function mrLookNoseColors(counts, pal, mr) {
  const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  const theirs = [...mr].sort((a, b) => luma(a) - luma(b));
  const ours = [...counts].sort((a, b) => luma(pal[a[0]]) - luma(pal[b[0]]));
  const total = ours.reduce((n, [, k]) => n + k, 0), out = new Map();
  let below = 0;
  for (const [i, k] of ours) {
    const q = (below + k / 2) / total;
    out.set(i, theirs[Math.min(theirs.length - 1, Math.floor(q * theirs.length))]);
    below += k;
  }
  return out;
}

/* Placed 1996 parts painted as RGBA, { width, height, data, ox, oy }, in
   the box zbSnoidBox gives, the nose's colors from `noseColors` where it
   has them. */
function mrLookPaint(sheet, placed, pal, noseColors) {
  const box = zbSnoidBox(sheet, placed), { width, height } = box;
  const data = new Uint8ClampedArray(4 * width * height);
  for (const p of placed) {
    const f = sheet.frames[p.frame], own = p.part === 'nose' ? noseColors : null;
    for (let y = 0; y < f.height; y++) {
      const row = (p.y + box.oy + y) * width + (p.x + box.ox);
      for (let x = 0; x < f.width; x++) {
        const v = f.pixels[y * f.width + x];
        if (!v) continue;
        const [r, g, b] = (own && own.get(v)) || pal[v], o = 4 * (row + x);
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
  }
  return { width, height, data, ox: box.ox, oy: box.oy };
}

/* A view's angle in degrees, 0 to the right and 90 up the screen, from its
   keypad digits; 5, the keypad's middle, faces the viewer, as down. A view
   of one digit (cannon_zomb's) is that digit's angle. */
function mrLookAngle(view) {
  const DIGIT = { 6: 0, 9: 45, 8: 90, 7: 135, 4: 180, 1: 225, 2: 270, 3: 315, 5: 270 };
  if (view < 10 && DIGIT[view] != null) return DIGIT[view];
  const a = DIGIT[Math.floor(view / 10)], b = DIGIT[view % 10];
  if (a == null || b == null) throw new Error(`view ${view} is not two keypad digits`);
  const x = Math.cos(a * Math.PI / 180) + Math.cos(b * Math.PI / 180), y = Math.sin(a * Math.PI / 180) + Math.sin(b * Math.PI / 180);
  return (Math.round(Math.atan2(y, x) * 180 / Math.PI * 10) / 10 + 360) % 360;
}

/* The 1996 walk for a view: { dir, facing, script } for 1996 feet `feet`,
   the script ZOOMBINI SCRS 100 + 5 x feet + dir, facing 1 when it walks
   left. */
function mrLookWalk(view, feet) {
  const r = mrLookAngle(view) * Math.PI / 180;
  const dx = Math.round(Math.cos(r) * 1024), dy = -Math.round(Math.sin(r) * 1024);
  const dir = zbWalkDirection(dx, dy);
  return { dir, facing: dx < 0 ? 1 : 0, script: 100 + 5 * feet + dir };
}

/* The 1996 tick on Mountain Rescue's frame `frame`, `frameMs` apart,
   in a 1996 cycle of `ticks` of `tickMs` (102 ms). */
function mrLookTick(frame, frameMs, ticks, tickMs) {
  return Math.floor(frame * frameMs / tickMs) % ticks;
}

/* The 1996 tick on Mountain Rescue's frame `frame` for a script that plays
   once through and then loops from tick `from`, as the carried pose does
   from its third tick (kSnoidAnimState005_Drag, ScummVM). */
function mrLookTickFrom(frame, frameMs, ticks, tickMs, from) {
  const t = Math.floor(frame * frameMs / tickMs);
  return t < ticks ? t : from + (t - ticks) % (ticks - from);
}

/* Mountain Rescue's Zoombini sets besides the walks, by the end of the
   file's key, each with what it shows and the 1996 match proposed: the
   scripts, each { archive, id, from } for the 1996 feet `feet`, or the
   tumble's still poses (`tumble`), or the walks (`walk`). A set with
   `shrink` has its 1996 match drawn smaller with each frame, as much as
   the Mountain Rescue frame beside it. A file not here
   is a walk of 16 views (mrLookWalk), as are the transition's PitiZomb
   files, the walk drawn smaller. Aqua Cube's sets are smaller copies of the ZOMBIS
   ones, and the 1996 game's far-off Zoombini (tBMP 3200) has no script, so
   they take the full-size scripts. */
const MR_LOOK_RANGE = (archive, first, last) => Array.from({ length: last - first + 1 }, (_, i) => ({ archive, id: first + i, from: 0 }));
const MR_LOOK_SETS = [
  { file: 'zombis/pris/pris.anm', what: 'Carried by the pointer', scripts: feet => [{ archive: 'ZOOMBINI', id: 145 + feet, from: 2 }] },
  // the 1996 celebration, one for each feet: the Allergic Cliffs' (ScummVM's
  // kResScrs2019_CelebrationBase + feet), the same hops as FLEENS 7031-7035
  // and CAVES 13000-13004. Mountain Rescue's celebration bounces inside its
  // frame, so the hop is drawn rising (`rise`).
  { file: 'zombis/attente/attentezomb.anm', what: 'Celebrating', rise: true, scripts: feet => [{ archive: 'BRIDGE', id: 2019 + feet, from: 0 }] },
  { file: 'zombis/attente2/attentezomb2.anm', what: 'Blinking', scripts: () => MR_LOOK_RANGE('ZOOMBINI', 131, 131) },
  { file: 'aquacube/smallest/smallest.anm', what: 'Walking in Aqua Cube', walk: true, note: 'The 1996 game draws a far-off Zoombini (tBMP 3200) with no script, so these are the full-size scripts.' },
  { file: 'aquacube/smallest/attente/attente.anm', what: 'Blinking in Aqua Cube', scripts: () => MR_LOOK_RANGE('ZOOMBINI', 131, 131), note: 'The 1996 game draws a far-off Zoombini (tBMP 3200) with no script, so these are the full-size scripts.' },
  { file: 'aquacube/smallest/attente2/attente2.anm', what: 'Blinking in Aqua Cube', scripts: () => MR_LOOK_RANGE('ZOOMBINI', 131, 131), note: 'The 1996 game draws a far-off Zoombini (tBMP 3200) with no script, so these are the full-size scripts.' },
  // ScummVM's ZoombiniPuzzleMaze: 15080 + feet, the ride down the screen
  { file: 'zombis/flotte/flotte.anm', what: 'Riding a bubble in Bubble Bumpers', scripts: feet => [{ archive: 'MAZE2', id: 15080 + feet, from: 0 }] },
  { file: 'zombis/tombe/tombe.anm', what: 'Flipped into the water in Turtle Hurdle', scripts: () => MR_LOOK_RANGE('BRIDGE', 1004, 1007) },
  { file: 'zombis/saut/saut.anm', what: 'Jumping into the cannon in Magic Mirrors', scripts: feet => [{ archive: 'BRIDGE', id: 2019 + feet, from: 0 }],
    note: 'The 1996 game’s only jump is its celebration, here held in place, since the program moves the sprite for this one.' },
  // waterslide FUN_00436ba0: once the master valve opens, each Zoombini of
  // a pair placed right shrinks into the pipes, one at a time, and is across
  { file: 'zombis/aspiration/aspiration.anm', what: 'Shrinking into the pipes in Pipes of Paloo, one Zoombini at a time once the master valve opens', shrink: true,
    scripts: () => MR_LOOK_RANGE('ZOOMBINI', 100, 100), note: 'No 1996 script shrinks a Zoombini, so the standing one shrinks as Mountain Rescue’s does, held at its feet.' },
  { file: 'wall_of_fleens/cannon_zomb/cannon_zomb.anm', what: 'Shot from the cannon in Magic Mirrors', tumble: true },
  { file: 'zombiniville/bigzomb/bigzomb.anm', what: 'The big Zoombini in Zoombiniville', scripts: () => MR_LOOK_RANGE('ZOOMBINI', 100, 100),
    note: 'The big Zoombini of the 1996 Zoombini Isle (PICKER tBMP 4300) would match it better, but a table in ZOOMBINI.EXE places that one’s parts, so the standing Zoombini is shown.' },
];
function mrLookSet(key) {
  return MR_LOOK_SETS.find(s => key.toLowerCase().endsWith(s.file)) || null;
}

/* A script's ticks placed with the body held still: for each tick the
   placements of the tick it shows (zbSnoidShown), moved so that the body's
   record is at the origin. A tick with no body is moved by the last
   body's place. With `rise`, every tick is moved by the first body's
   place, so a hop is drawn rising. */
function mrLookPlaced(sheet, traits, ticks, rise = false) {
  const shown = zbSnoidShown(ticks, sheet.effects);
  let at = null;
  const anchors = ticks.map(t => {
    const body = zbSnoidParts(t, sheet.effects).find(p => p.part === 'body');
    if (body) at = [body.x, body.y];
    return at;
  });
  const first = anchors.find(a => a) || [0, 0];
  return ticks.map((t, i) => {
    const k = Math.max(0, shown[i]), [ax, ay] = rise ? first : anchors[k] || first;
    return zbSnoidPlacements(sheet, traits, ticks[k]).map(p => ({ ...p, x: p.x - ax, y: p.y - ay }));
  });
}

/* The tumble's pose (1-18) whose head points nearest to `angle` (degrees,
   0 to the right and 90 up) from its feet, read from where the sheet puts
   the hair's and the feet's sprites, and that pose as a tick. */
function mrLookTumblePose(sheet, traits, angle) {
  const order = ZB_LAYER_ORDERS[2], n = sheet.blocks.body.poses[0];
  const center = p => { const f = sheet.frames[p.frame]; return [p.x + f.width / 2, p.y + f.height / 2]; };
  let best = null;
  for (let pose = 1; pose <= n; pose++) {
    const tick = { records: order.map(() => ({ shape: pose, x: 0, y: 0 })), layout: 2, facing: 0 };
    const placed = zbSnoidPlacements(sheet, traits, tick);
    const hair = placed.find(p => p.part === 'hair'), feet = placed.find(p => p.part === 'feet');
    if (!hair || !feet) continue;
    const [hx, hy] = center(hair), [fx, fy] = center(feet);
    const a = Math.atan2(fy - hy, hx - fx) * 180 / Math.PI;
    const off = Math.abs(((a - angle) % 360 + 540) % 360 - 180);
    if (!best || off < best.off) best = { pose, tick, off, angle: (Math.round(a) + 360) % 360 };
  }
  return best;
}
