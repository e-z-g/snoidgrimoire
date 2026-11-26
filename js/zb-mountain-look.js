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
   and eyes all have a 1996 value of the same name. Of the noses, orange,
   green and blue do, and white and pink do not, so the preview gives them
   purple and red and marks them.
*/

const MR_LOOK_NAMES = {
  feet: ['Sneakers', 'Roller skates', 'Spring', 'Wheels', 'Propeller'],
  nose: ['Orange', 'White', 'Green', 'Blue', 'Pink'],
  hair: ['Shaggy', 'Ponytail', 'Cap', 'Flat top', 'Tuft'],
  eyes: ['Wide eyes', 'One eye', 'Sleepy eyes', 'Sunglasses', 'Glasses'],
};
const MR_LOOK_NOSE_STAND_INS = { White: 'Purple', Pink: 'Red' };

/* A Mountain Rescue trait value (1-5) as the 1996 value: { value, stand }
   where `stand` is true for a nose with no 1996 match. */
function mrLookTrait(part, value) {
  const name = MR_LOOK_NAMES[part][value - 1];
  let at = ZB_TRAIT_SHORT[part].indexOf(name), stand = false;
  if (at < 0 && part === 'nose' && MR_LOOK_NOSE_STAND_INS[name]) { at = ZB_TRAIT_SHORT.nose.indexOf(MR_LOOK_NOSE_STAND_INS[name]); stand = true; }
  if (at < 0) throw new Error(`no 1996 ${part} for ${name}`);
  return { value: at + 1, stand };
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
