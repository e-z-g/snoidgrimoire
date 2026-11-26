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
   keypad digits; 5, the keypad's middle, faces the viewer, as down. */
function mrLookAngle(view) {
  const DIGIT = { 6: 0, 9: 45, 8: 90, 7: 135, 4: 180, 1: 225, 2: 270, 3: 315, 5: 270 };
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
