/* zb-snoid.js -- a Zoombini, drawn from ZOOMBINI.MHK: its five parts, each
   a sprite of tBMP 3000 chosen by its trait, put together the way the game
   puts them together, by a snoid script and the sheet's registration points.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js and zb-script.js.

   tBMP 3000 is the Zoombini of the map and the puzzles, 890 sprites: every
   pose is a pair, facing one way and the other, and each part's variants
   are blocks of poses. A snoid script's frame has five records, one a part,
   in the order its header's layout word gives (zb-script.js); a record's
   shape is the pose within that part's block, 1-based, and its x and y
   where the part's registration point goes. REGS 100 and 101 are the
   registration points, x and y, one-based (the first entry of each is not
   a sprite's). A Zoombini's traits pick the block: hair, eyes and nose
   each have five, one a value; the body has one; the feet five, of
   different lengths, each three standing poses and then its walks.

   The Zoombini standing still is SCRS 100: every part at its first pose.
   Frames 850-889 are the twenty trait icons, a pair each, in the order
   ZB_SNOID_ICONS gives.

   WHERE IT CAME FROM
   The blocks are the extraction project's (tools/animate.py ZOOMBINI_ATLAS,
   tools/README.md § The Zoombinis), found by fitting every Zoombini script
   on the disc to them; the layer orders are ScummVM's (zb-script.js).
   utilities/snoid_check.mjs holds the blocks to every tick of every
   Zoombini script and the placements to the Zoombini maker's export.
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
/* The trait icons, frames 850-889: a pair each. */
const ZB_SNOID_ICON_BASE = 850;
const ZB_SNOID_ICONS = ['hair', 'eyes', 'feet', 'nose'];

/* The sheet and its registration points, read once an archive. */
const ZB_SNOID_CACHE = new WeakMap();
function zbSnoidSheet(arc) {
  if (!ZB_SNOID_CACHE.has(arc)) {
    const d = decodeBitmapResource(arc.get('tBMP', ZB_SNOID_SHEET));
    const xs = parseRegs(arc.get('REGS', ZB_SNOID_REGS)), ys = parseRegs(arc.get('REGS', ZB_SNOID_REGS + 1));
    if (xs.length !== d.frames.length + 1 || ys.length !== d.frames.length + 1) throw new Error(`REGS ${ZB_SNOID_REGS} and ${ZB_SNOID_REGS + 1} do not fit tBMP ${ZB_SNOID_SHEET}'s ${d.frames.length} sprites`);
    const standing = parseScript(arc.get('SCRS', ZB_SNOID_STANDING), 'SCRS');
    ZB_SNOID_CACHE.set(arc, { frames: d.frames, xs, ys, standing });
  }
  return ZB_SNOID_CACHE.get(arc);
}

/* The sprite of a part at a pose (1-based) facing one way (0) or the other
   (1), or null past its block. */
function zbSnoidFrame(part, value, pose, facing = 0) {
  const b = ZB_SNOID_BLOCKS[part], v = part === 'body' ? 0 : value - 1;
  if (pose < 1 || pose > b.poses[v]) return null;
  return b.base[v] + 2 * (pose - 1) + facing;
}

/* A Zoombini as one script frame draws it: [{ part, frame, x, y }] in the
   order drawn, x and y the sprite's top left relative to the script's
   origin. */
function zbZoombiniPlacements(sheet, z, frame = sheet.standing.frames[0], layout = sheet.standing.layout, facing = 0) {
  const order = ZB_LAYER_ORDERS[layout];
  return frame.records.map((r, k) => {
    const part = order[k], f = zbSnoidFrame(part, z[part], r.shape, facing);
    if (f == null) throw new Error(`pose ${r.shape} is past the ${part}'s block`);
    return { part, frame: f, x: r.x - sheet.xs[f + 1], y: r.y - sheet.ys[f + 1] };
  });
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

function zbSnoidCompose(sheet, placed) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placed) {
    const f = sheet.frames[p.frame];
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + f.width); y1 = Math.max(y1, p.y + f.height);
  }
  const width = x1 - x0, height = y1 - y0, pixels = new Uint8Array(width * height);
  for (const p of placed) {
    const f = sheet.frames[p.frame];
    for (let y = 0; y < f.height; y++) {
      const row = (p.y - y0 + y) * width + (p.x - x0);
      for (let x = 0; x < f.width; x++) {
        const v = f.pixels[y * f.width + x];
        if (v) pixels[row + x] = v;
      }
    }
  }
  return { width, height, pixels, ox: -x0, oy: -y0 };
}
