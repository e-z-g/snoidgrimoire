/* zb-feature.js -- a feature script (SCRB) drawn: which sheet its shapes
   are sprites of, and where each tick puts them.
   =========================================================================
   Needs zb-script.js, zb-bitmap.js. No DOM.

   A SCRB's records are a shape, x and y, a tick to a frame (zb-script.js).
   The file does not say which sheet the shapes number: the program's page
   for the place does. What the disc shows instead is a rule of the
   numbering, which the extraction project's animate.py draws by
   (render_scrb: the sheet is the script's number with its last two digits
   dropped) and which this widens: THE SHEET IS THE LAST ONE NUMBERED AT OR
   BELOW THE SCRIPT. Over the disc's 1,796 feature scripts, 1,789 draw
   something. For 1,590 the two rules name the same sheet. For 192 (HOTEL
   101xx, LILLY 101xx, NET 91xx, ZOOMBINI 1-18) there is no sheet at the
   hundred and the one below is tBMP 10000, 10000, 9000 and 1. For seven a
   sheet lies between the hundred and the script, numbered as the first of
   them, and is plainly theirs: CAVES SCRB 9025-9028 use shapes 4, 3, 2 and
   1 of tBMP 9025's four, FERRY SCRB 1450-1452 shapes 2, 3 and 1 of tBMP
   1450's three, where animate.py's rule gives them tBMP 9000 and 1400. No
   script anywhere asks for a shape its sheet does not have (HOTEL's 101xx
   reach shape 40 of 40), and every one's sprites land on the room. That is
   the evidence: it is not read out of the program, and
   utilities/feature_check.mjs holds it to the whole disc.

   A shape is one-based (shape n is the sheet's frame n - 1) and is drawn
   with its registration point at the record's x and y, which are the
   room's: animate.py's reading, and ScummVM's for a snoid's parts. */

/* The sheets of an archive: [{ id, frames }], ascending, counted once. */
const ZB_FEATURE_SHEETS = new WeakMap();
function zbFeatureSheets(arc) {
  if (!ZB_FEATURE_SHEETS.has(arc)) {
    const out = [];
    for (const { id } of arc.list('tBMP')) {
      const offs = tbmpFrameOffsets(arc.get('tBMP', id));
      if (offs) out.push({ id, frames: offs.offsets.length });
    }
    ZB_FEATURE_SHEETS.set(arc, out.sort((a, b) => a.id - b.id));
  }
  return ZB_FEATURE_SHEETS.get(arc);
}
/* The sheet a feature script draws from: { id, frames }, or null when it
   draws nothing or no sheet at or below it has its highest shape. */
function zbFeatureSheet(arc, scriptId, script) {
  let max = 0;
  for (const f of script.frames) for (const r of f.records) if (r.shape > max) max = r.shape;
  if (!max) return null;
  let found = null;
  for (const s of zbFeatureSheets(arc)) if (s.id <= scriptId) found = s;
  return found && found.frames >= max ? found : null;
}
/* Each tick's sprites where they go: [[{ shape, x, y, width, height }]], x
   and y the top left in the room, and the box round all of them
   ({ x0, y0, x1, y1 }, null when nothing is drawn). `frames` are the
   sheet's, `regs` its registration points ({ xs, ys }, one-based) or null. */
function zbFeaturePlaced(script, frames, regs) {
  let box = null;
  const ticks = script.frames.map(f => f.records.filter(r => r.shape > 0 && r.shape <= frames.length).map(r => {
    const fr = frames[r.shape - 1], x = r.x - (regs ? regs.xs[r.shape] : 0), y = r.y - (regs ? regs.ys[r.shape] : 0);
    if (fr.width && fr.height) {
      box = box || { x0: x, y0: y, x1: x + fr.width, y1: y + fr.height };
      box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x + fr.width); box.y1 = Math.max(box.y1, y + fr.height);
    }
    return { shape: r.shape, x, y, width: fr.width, height: fr.height };
  }));
  return { ticks, box };
}
