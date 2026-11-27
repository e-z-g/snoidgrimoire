/* Mountain Rescue's Zoombinis as the 1996 game draws them, written for
   the game: every Zoombini set (MR_MOD_SETS) as five .anm files, one for
   each kind of feet, and zoombini2.exe patched to load them and draw each
   Zoombini from the one for its feet (the walk on 26 November 2026, at
   the maintainer's choosing, and every set on 27 November 2026, at the
   maintainer's word: "Can't you make it so there is no more MR version
   zoombini").

   Why the program is patched. Mountain Rescue draws a Zoombini
   (FUN_0045d580) from one set: the body, then the feet, nose, hair and
   eyes, each from the slot for its value (mrAnmSlot), all at one origin
   and all at the same frame number. Only the feet's slot depends on the
   feet, but the 1996 walks move and squash the whole Zoombini in a way
   particular to each kind of feet (a spring rises 22 pixels, a propeller
   25). So each kind of feet has a set here, whose body slot has the 1996
   feet and body drawn together, and whose nose, hair and eyes slots move
   with that body. The program plays a walk's frames 1 to 10 in a loop
   (its limit of 11, `cmp [esi+0x74], 0xb` at 0x45da2d) at the set's time
   a frame (+48000), and the patch gives each new set the 1996 walk's
   length and the 1996 pace of 102 ms a tick. The 1996 figure rises above
   Mountain Rescue's 56-pixel frame, so each new set's frames are larger,
   and the patch draws them up and to the left by as much.

   What is left as Mountain Rescue draws it. The program draws the hair
   before the eyes and the 1996 game the eyes before the hair, and no
   frame can fix that, since the hair varies apart from the eyes. A part
   the 1996 game draws under the body (the nose, walking away) is cut
   where the body covers it. The other sets are redone the same way
   (mrModOtherSets), each with Mountain Rescue's frame count and pace, and
   the builder's big Zoombini as one file (mrModWholeSet). Zoombiniville's
   opening is a Bink movie (Data/movies/zoom_movie*.bik), which no set
   reaches. */

/* A picture { width, height, data (RGBA) } as an .anm frame: u32 size,
   the .rb header, then u16 count and the segments, each u16 x, u16 y,
   u16 n, u8 kind 0 and n pixels of B, G, R, for each run of opaque
   pixels in a row. The header's unknown words are written as the disc's
   frames have most of them, 0xCDCDCDCD, and the count as the height. */
function mrRbEncode(pic) {
  const { width, height, data } = pic, parts = [];
  let size = 2;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (data[4 * (y * width + x) + 3] < 128) { x++; continue; }
      let n = 0;
      while (x + n < width && n < 0xffff && data[4 * (y * width + x + n) + 3] >= 128) n++;
      parts.push([x, y, n]);
      size += 7 + 3 * n;
      x += n;
    }
  }
  const out = new Uint8Array(28 + size), dv = new DataView(out.buffer);
  dv.setUint32(0, size, true);
  dv.setUint32(4, 0xcdcdcdcd, true);
  dv.setUint32(8, 0, true);
  dv.setUint32(12, size, true);
  dv.setUint32(16, width, true);
  dv.setUint32(20, height, true);
  dv.setUint32(24, 0xcdcdcdcd, true);
  dv.setUint16(28, height, true);
  let o = 30;
  for (const [x, y, n] of parts) {
    dv.setUint16(o, x, true); dv.setUint16(o + 2, y, true); dv.setUint16(o + 4, n, true); out[o + 6] = 0;
    o += 7;
    for (let i = 0; i < n; i++, o += 3) {
      const s = 4 * (y * width + x + i);
      out[o] = data[s + 2]; out[o + 1] = data[s + 1]; out[o + 2] = data[s];
    }
  }
  return out;
}

/* An .anm from its 3,000 slots, each null or a list of frames from
   mrRbEncode. */
function mrAnmWrite(slots) {
  if (slots.length !== MR_ANM_SLOTS) throw new Error(`${slots.length} slots, not ${MR_ANM_SLOTS}`);
  let size = 0;
  for (const s of slots) size += 4 + (s ? s.reduce((n, f) => n + f.length, 0) : 0);
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  let o = 0;
  for (const s of slots) {
    dv.setUint32(o, s ? s.length : 0, true);
    o += 4;
    if (s) for (const f of s) { out.set(f, o); o += f.length; }
  }
  return out;
}

/* The box of a picture's opaque pixels, { x0, y0, x1, y1 } with x1 and y1
   one past, or null. */
function mrModOpaqueBox(pic) {
  if (!pic) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < pic.height; y++) for (let x = 0; x < pic.width; x++) {
    if (pic.data[4 * (y * pic.width + x) + 3] < 128) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
/* Mountain Rescue's parts at a view's frame drawn together, as the
   program stacks them, `values` a value for each part (null for none). */
function mrModParts(b, slots, view, values, frame = 0) {
  let out = null;
  values.forEach((value, part) => {
    if (value == null) return;
    const s = slots[mrAnmSlot(view, part, value)];
    if (!s) return;
    const pic = mrAnmFrame(b, s[Math.min(frame, s.length - 1)]);
    if (!out) { out = { width: pic.width, height: pic.height, data: new Uint8ClampedArray(pic.data) }; return; }
    for (let i = 0; i < out.data.length; i += 4) if (pic.data[i + 3] >= 128) out.data.set(pic.data.subarray(i, i + 4), i);
  });
  return out;
}

/* A Mountain Rescue Zoombini's traits (feet 1-5, and one other part's
   value, the rest 1) as the 1996 Zoombini's. */
function mrModTraits(feet, part = null, value = 1) {
  const t = { feet: mrLookTrait('feet', feet).value, nose: mrLookTrait('nose', 1).value, hair: mrLookTrait('hair', 1).value, eyes: mrLookTrait('eyes', 1).value };
  if (part) t[part] = mrLookTrait(part, value).value;
  return t;
}

/* How much larger Mountain Rescue's Zoombini in `anm` stands than the
   1996 one: the height of its parts drawn together, facing the viewer
   (view 22) or in its first view, over the 1996 Zoombini's standing. */
function mrModScale(anm, sheet) {
  const slots = mrAnmSlots(anm), views = [...mrAnmViews(slots).keys()];
  const front = views.includes(22) ? 22 : views[0];
  const mr = mrModOpaqueBox(mrModParts(anm, slots, front, [0, 1, 1, 1, 1]));
  return (mr.y1 - mr.y0) / zbSnoidBox(sheet, zbZoombiniPlacements(sheet, mrModTraits(1))).height;
}

/* Each Mountain Rescue nose's colors for the 1996 nose that stands for
   it, from the view of `anm` that shows the most of it (mrLookNoseColors):
   a Map of the value (1-5) to a Map of 1996 index -> [r, g, b]. */
function mrModNoseColors(anm, sheet, pal) {
  const slots = mrAnmSlots(anm), views = [...mrAnmViews(slots).keys()], out = new Map();
  for (let n = 1; n <= 5; n++) {
    let px = [];
    for (const v of views) {
      const f = mrModParts(anm, slots, v, [null, null, n, null, null]);
      if (!f) continue;
      const here = [];
      for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3] >= 128) here.push([f.data[i], f.data[i + 1], f.data[i + 2]]);
      if (here.length > px.length) px = here;
    }
    const nose = mrLookTrait('nose', n).value, counts = new Map();
    for (let pose = 1; pose <= sheet.blocks.nose.poses[nose - 1]; pose++) {
      const f = sheet.frames[zbSnoidFrame('nose', nose, pose, 0, sheet.blocks)];
      if (f) for (const v of f.pixels) if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    out.set(n, px.length ? mrLookNoseColors(counts, pal, px) : null);
  }
  return out;
}

/* A 1996 script's ticks placed for the mod: for each tick, the part order
   and the placements (of the tick zbSnoidShown gives where it draws
   nothing), each { part, frame, x, y }, moved so that the body's record
   is at x 0 in every tick, since Mountain Rescue moves the sprite, and the
   first tick's body at y 0, so a walk rises and falls as in 1996.
   `traits` gives each part's 1996 value. With `still`, the body's record
   is at y 0 in every tick too, and with `rise`, every tick is moved by
   the first body's place alone, so a hop is drawn rising. */
function mrModWalkTicks(sheet, traits, ticks, { still = false, rise = false } = {}) {
  const shown = zbSnoidShown(ticks, sheet.effects);
  const parts = ticks.map(t => zbSnoidParts(t, sheet.effects));
  const firstBody = parts.map(p => p.find(q => q.part === 'body')).find(Boolean);
  if (!firstBody) throw new Error('the script draws no body');
  let last = firstBody;
  return ticks.map((t, i) => {
    const k = Math.max(0, shown[i]), body = parts[k].find(q => q.part === 'body') || last;
    last = body;
    const ax = rise ? firstBody.x : body.x, ay = still && !rise ? body.y : firstBody.y;
    return {
      order: parts[k].map(q => q.part),
      placed: zbSnoidPlacements(sheet, traits, ticks[k]).map(p => ({ ...p, x: p.x - ax, y: p.y - ay })),
    };
  });
}

/* The box of placed 1996 sprites ({ part, frame, x, y }, and `sheet`
   where the sprite is from another sheet than `sheet`), or of those of
   the parts given. */
function mrModPlacedBox(sheet, placed, parts = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placed) {
    if (parts && !parts.includes(p.part)) continue;
    const f = (p.sheet || sheet).frames[p.frame];
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + f.width); y1 = Math.max(y1, p.y + f.height);
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}

/* A set's frames, from its views' plans: each plan { v, frames }, each
   frame { tick: { base, byValue }, ax, ay, k } where `base` is the tick
   with the Zoombini's traits, byValue[part][value - 1] the tick with that
   part's value, and (ax, ay) where the 1996 origin lands in Mountain
   Rescue's frame at scale k. The new frame has room for every sprite of
   every frame and value and is at least Mountain Rescue's frame `mr` ({
   width, height }), and (dx, dy) is how far its corner is up and to the
   left of Mountain Rescue's. The body's slot has the 1996 feet and body
   drawn together, the feet's slots are empty, and the nose, hair and eyes
   are each a slot per value, the nose in Mountain Rescue's colors, cut
   where the body covers a part the 1996 game draws under it. Returns {
   slots, dx, dy, width, height }. */
function mrModFrames(sheet, pal, noseColors, plans, mr) {
  let x0 = 0, y0 = 0, x1 = mr.width, y1 = mr.height;
  for (const pl of plans) for (const fr of pl.frames) for (const t of [fr.tick.base, ...Object.values(fr.tick.byValue).flat()]) for (const p of t.placed) {
    const f = (p.sheet || sheet).frames[p.frame];
    x0 = Math.min(x0, Math.floor(fr.ax + p.x * fr.k)); y0 = Math.min(y0, Math.floor(fr.ay + p.y * fr.k));
    x1 = Math.max(x1, Math.ceil(fr.ax + (p.x + f.width) * fr.k)); y1 = Math.max(y1, Math.ceil(fr.ay + (p.y + f.height) * fr.k));
  }
  const dx = -x0, dy = -y0, width = x1 - x0, height = y1 - y0;
  // sprites drawn into a picture of that frame, scaled by k to the nearest
  // pixel, the nose in Mountain Rescue's colors, and left out where
  // `under` is opaque
  const draw = (fr, placed, colors = null, under = null) => {
    const pic = { width, height, data: new Uint8ClampedArray(4 * width * height) }, k = fr.k;
    for (const p of placed) {
      const f = (p.sheet || sheet).frames[p.frame];
      const cx0 = Math.floor(fr.ax + p.x * k) + dx, cy0 = Math.floor(fr.ay + p.y * k) + dy;
      const cx1 = Math.ceil(fr.ax + (p.x + f.width) * k) + dx, cy1 = Math.ceil(fr.ay + (p.y + f.height) * k) + dy;
      for (let cy = cy0; cy < cy1; cy++) {
        const sy = Math.floor((cy + 0.5 - dy - fr.ay) / k - p.y);
        if (sy < 0 || sy >= f.height) continue;
        for (let cx = cx0; cx < cx1; cx++) {
          const sx = Math.floor((cx + 0.5 - dx - fr.ax) / k - p.x);
          if (sx < 0 || sx >= f.width) continue;
          const v = f.pixels[sy * f.width + sx];
          if (!v) continue;
          const o = 4 * (cy * width + cx);
          if (under && under.data[o + 3] >= 128) continue;
          const [r, g, b] = (p.part === 'nose' && colors && colors.get(v)) || pal[v];
          pic.data[o] = r; pic.data[o + 1] = g; pic.data[o + 2] = b; pic.data[o + 3] = 255;
        }
      }
    }
    return pic;
  };
  const empty = mrRbEncode({ width, height, data: new Uint8ClampedArray(4 * width * height) });
  const slots = Array(MR_ANM_SLOTS).fill(null);
  for (const pl of plans) {
    const bodies = pl.frames.map(fr => draw(fr, fr.tick.base.placed.filter(p => p.part === 'feet' || p.part === 'body')));
    slots[mrAnmSlot(pl.v, 0, 0)] = bodies.map(mrRbEncode);
    for (let val = 1; val <= 5; val++) slots[mrAnmSlot(pl.v, 1, val)] = [empty];
    for (const part of ['nose', 'hair', 'eyes']) {
      for (let val = 1; val <= 5; val++) {
        slots[mrAnmSlot(pl.v, MR_PARTS.indexOf(part), val)] = pl.frames.map((fr, j) => {
          const t = fr.tick.byValue[part][val - 1], under = t.order.indexOf(part) < t.order.indexOf('body');
          return mrRbEncode(draw(fr, t.placed.filter(p => p.part === part), part === 'nose' ? noseColors.get(val) : null, under ? bodies[j] : null));
        });
      }
    }
  }
  return { slots, dx, dy, width, height };
}

/* Ticks placed for every value the mod draws: { base, byValue } for each
   tick, `place(traits)` giving the ticks placed for those traits. */
function mrModVariants(feet, place) {
  const base = place(mrModTraits(feet)), byValue = {};
  for (const part of ['nose', 'hair', 'eyes']) byValue[part] = [1, 2, 3, 4, 5].map(val => place(mrModTraits(feet, part, val)));
  return base.map((b, i) => ({ base: b, byValue: Object.fromEntries(Object.entries(byValue).map(([part, lists]) => [part, lists.map(l => l[i])])) }));
}

/* The mod's five walk sets for a Mountain Rescue walk of 16 views or one
   (littleZomb.anm, the transition's PitiZomb files, Aqua Cube's
   smallest.anm), one for each Mountain Rescue feet value, each { feet,
   slots (for mrAnmWrite), ms, limit, dx, dy, width, height, ticks, scale }.
   `limit` is the frame at which the program starts the loop again (the
   1996 walk's ticks + 1, frame 0 being the Zoombini standing), and (dx,
   dy) is how far the new frames' corner is up and to the left of Mountain
   Rescue's. `sheet` is the 1996 Zoombini's (zbSnoidSheet), `pal` the 1996
   colors by index and `scripts` a function from a ZOOMBINI script number
   to its parsed SCRS. The 1996 Zoombini is scaled to the height of
   Mountain Rescue's standing (mrModScale), or by `k`. Each view's walk is
   the one mrLookWalk gives, with its first tick's lowest feet row on
   Mountain Rescue's frame 0 feet's and its body's middle on Mountain
   Rescue's body's. */
function mrModWalkSets(anm, sheet, pal, scripts, tickMs = 102, k = mrModScale(anm, sheet), noseColors = mrModNoseColors(anm, sheet, pal)) {
  const slots = mrAnmSlots(anm), viewList = [...mrAnmViews(slots).keys()];
  const fr0 = slots[mrAnmSlot(viewList[0], 0, 0)][0];
  const sets = [];
  for (let feet = 1; feet <= 5; feet++) {
    const plans = viewList.map(v => {
      const w = mrLookWalk(v, mrLookTrait('feet', feet).value), ticks = zbSnoidTicks(scripts(w.script), w.facing);
      const variants = mrModVariants(feet, traits => mrModWalkTicks(sheet, traits, ticks));
      const t0 = variants[0].base.placed, feet0 = mrModPlacedBox(sheet, t0, ['feet']), body0 = mrModPlacedBox(sheet, t0, ['body']);
      const yb96 = (feet0 || body0).y1, xc96 = (body0.x0 + body0.x1) / 2;
      const mrFeet = mrModOpaqueBox(mrModParts(anm, slots, v, [null, feet, null, null, null])) || mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null]));
      const mrBody = mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null]));
      const ax = (mrBody.x0 + mrBody.x1) / 2 - xc96 * k, ay = mrFeet.y1 - yb96 * k;
      return { v, ticks, frames: [0, ...ticks.map((_, i) => i)].map(i => ({ tick: variants[i], ax, ay, k })) };
    });
    const n = plans[0].ticks.length;
    if (plans.some(pl => pl.ticks.length !== n)) throw new Error(`feet ${feet}: the views' walks differ in length`);
    const f = mrModFrames(sheet, pal, noseColors, plans, fr0);
    sets.push({ feet, slots: f.slots, ms: tickMs, limit: n + 1, dx: f.dx, dy: f.dy, width: f.width, height: f.height, ticks: n, scale: k });
  }
  return sets;
}

/* Mountain Rescue's Zoombini sets the mod redoes, by their paths in the
   program (mrProgramPath, without bmp/): the walks (`walk`, played at the
   1996 pace and length), and the rest. Each of the rest has `family`, the
   walk whose scale and noses apply to it, or `own` where the file's scale
   and noses apply, and MR_LOOK_SETS has the 1996 match for it. The blinks
   add a standing tick (ZOOMBINI SCRS 100) `before` and `after` times on
   either side, since Mountain Rescue's blink runs open, closed and open
   again (attenteZomb2.anm's eyes, frames 0-2, 3-8 and 9-10). The rest
   retain Mountain Rescue's frame count and time a frame, since the
   places' code counts their frames, and the 1996 animation is fitted to
   them. The builder's big Zoombini (`whole`) is drawn by the builder's
   code (FUN_0043c6e0), the body and each part picked from the set's
   slots at one place, so it is one file (mrModWholeSet), which the
   program loads in place of BigZomb.anm. The Fleens' sets are not
   Zoombinis. */
const MR_MOD_SETS = [
  { file: 'zombis/littlezomb.anm', walk: true },
  { file: 'transition1/pitizomb1.anm', walk: true },
  { file: 'transition1/pitizomb2.anm', walk: true },
  { file: 'transition1/pitizomb3.anm', walk: true },
  { file: 'aquacube/smallest/smallest.anm', walk: true },
  { file: 'zombis/attente2/attentezomb2.anm', family: 'zombis/littlezomb.anm', before: 2, after: 1 },
  { file: 'zombis/attente/attentezomb.anm', family: 'zombis/littlezomb.anm' },
  { file: 'zombis/pris/pris.anm', family: 'zombis/littlezomb.anm' },
  { file: 'zombis/flotte/flotte.anm', family: 'zombis/littlezomb.anm' },
  { file: 'zombis/tombe/tombe.anm', family: 'zombis/littlezomb.anm' },
  { file: 'zombis/saut/saut.anm', family: 'zombis/littlezomb.anm' },
  { file: 'zombis/aspiration/aspiration.anm', family: 'zombis/littlezomb.anm' },
  { file: 'wall_of_fleens/cannon_zomb/cannon_zomb.anm', family: 'zombis/littlezomb.anm' },
  { file: 'aquacube/smallest/attente/attente.anm', family: 'aquacube/smallest/smallest.anm', before: 2, after: 1 },
  { file: 'aquacube/smallest/attente2/attente2.anm', family: 'aquacube/smallest/smallest.anm', before: 2, after: 1 },
  { file: 'zombiniville/bigzomb/bigzomb.anm', own: true, whole: true },
];

/* The mod's five sets for one of MR_MOD_SETS that is not a walk, each
   { feet, slots, dx, dy, width, height, ticks }. `anm` is the file's
   bytes, `k` and `noseColors` its family's (mrModScale, mrModNoseColors),
   `script(archive, id)` a 1996 script parsed and `tumble` the tumbling
   Zoombini's sheet (zbSnoidSheet's 'tumble'), for the scripts of layout 2
   and the cannon's poses. Each view has as many
   frames as Mountain Rescue's, and frame i shows the 1996 tick i × ticks
   / frames. The 1996 Zoombini's body's middle and lowest feet row are
   placed on Mountain Rescue's at frame 0, or for the cannon's still poses
   the middle of the whole Zoombini on the middle of Mountain Rescue's,
   and the shrink is drawn as much smaller with each frame as Mountain
   Rescue's, held at its feet. */
function mrModOtherSets(anm, spec, sheet, pal, script, k, noseColors, tumble) {
  const look = mrLookSet(spec.file);
  if (!look) throw new Error(`no 1996 match for ${spec.file}`);
  const slots = mrAnmSlots(anm), views = [...mrAnmViews(slots).keys()];
  const fr0 = slots[mrAnmSlot(views[0], 0, 0)][0];
  const frameCount = v => Math.max(1, ...[0, 1, 2, 3, 4].flatMap(part => [0, 1, 2, 3, 4, 5].map(val => (slots[mrAnmSlot(v, part, val)] || []).length)));
  const stand = zbSnoidTicks(script('ZOOMBINI', 100), false).slice(0, 1);
  const sets = [];
  for (let feet = 1; feet <= 5; feet++) {
    const f96 = mrLookTrait('feet', feet).value;
    const plans = views.map(v => {
      const n = frameCount(v);
      let variants;
      const from = sh => list => list.map(t => ({ ...t, placed: t.placed.map(p => ({ ...p, sheet: sh })) }));
      if (look.tumble) {
        variants = mrModVariants(feet, traits => {
          const pose = mrLookTumblePose(tumble, traits, mrLookAngle(v));
          return from(tumble)([{ order: ZB_LAYER_ORDERS[2], placed: zbSnoidPlacements(tumble, traits, pose.tick) }]);
        });
      } else {
        const parsed = look.scripts(f96).map(s => ({ s, script: script(s.archive, s.id) }));
        const sh = ZB_SNOID_KIND_OF_LAYOUT[parsed[0].script.layout] === 'tumble' ? tumble : sheet;
        if (parsed.some(p => (ZB_SNOID_KIND_OF_LAYOUT[p.script.layout] === 'tumble') !== (sh === tumble))) throw new Error(`${spec.file}'s scripts draw from two sheets`);
        const ticks = [...Array(spec.before || 0).fill(stand[0]),
          ...parsed.flatMap(p => zbSnoidTicks(p.script, false).slice(p.s.from || 0)),
          ...Array(spec.after || 0).fill(stand[0])];
        variants = mrModVariants(feet, traits => from(sh)(mrModWalkTicks(sh, traits, ticks, { still: !look.rise, rise: look.rise })));
      }
      const tickAt = i => Math.min(variants.length - 1, Math.floor(i * variants.length / n));
      const all = i => mrModOpaqueBox(mrModParts(anm, slots, v, [0, feet, 1, 1, 1], i));
      const mr0 = all(0), t0 = variants[tickAt(0)].base.placed;
      let anchor96, anchorMr;
      if (look.tumble) {
        const b = mrModPlacedBox(sheet, t0);
        anchor96 = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; anchorMr = [(mr0.x0 + mr0.x1) / 2, (mr0.y0 + mr0.y1) / 2];
      } else {
        const feet0 = mrModPlacedBox(sheet, t0, ['feet']), body0 = mrModPlacedBox(sheet, t0, ['body']);
        const mrFeet = mrModOpaqueBox(mrModParts(anm, slots, v, [null, feet, null, null, null])) || mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null]));
        const mrBody = mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null])) || mr0;
        anchor96 = [(body0.x0 + body0.x1) / 2, (feet0 || body0).y1]; anchorMr = [(mrBody.x0 + mrBody.x1) / 2, (mrFeet || mrBody).y1];
      }
      const frames = Array.from({ length: n }, (_, i) => {
        let kk = k;
        if (look.shrink) { const b = all(i); kk = b ? k * (b.y1 - b.y0) / (mr0.y1 - mr0.y0) : k / 100; }
        return { tick: variants[tickAt(i)], k: kk, ax: anchorMr[0] - anchor96[0] * kk, ay: anchorMr[1] - anchor96[1] * kk };
      });
      return { v, frames };
    });
    const f = mrModFrames(sheet, pal, noseColors, plans, fr0);
    sets.push({ feet, slots: f.slots, dx: f.dx, dy: f.dy, width: f.width, height: f.height, ticks: Math.max(...plans.map(p => p.frames.length)), ms: 0, limit: 11 });
  }
  return sets;
}

/* A set drawn as the builder draws its big Zoombini (FUN_0043c6e0): the
   body and each part at the frame's corner, each from its own slot. So
   the body's slot has the 1996 body alone and each part's slot the 1996
   part for its value, standing (ZOOMBINI SCRS 100), the body's middle and
   lowest feet row on Mountain Rescue's at scale k, or smaller where the
   1996 Zoombini would not fit the frame. Returns one set { slots, dx, dy,
   width, height, ticks, scale }. */
function mrModWholeSet(anm, sheet, pal, script, k, noseColors) {
  const slots = mrAnmSlots(anm), views = [...mrAnmViews(slots).keys()], out = Array(MR_ANM_SLOTS).fill(null);
  const stand = zbSnoidTicks(script('ZOOMBINI', 100), false).slice(0, 1);
  let scale = k;
  for (const v of views) {
    const fr0 = slots[mrAnmSlot(v, 0, 0)][0], mr = { width: fr0.width, height: fr0.height };
    const ticks = [];
    for (let feet = 1; feet <= 5; feet++) ticks.push(...mrModVariants(feet, traits => mrModWalkTicks(sheet, traits, stand, { still: true })));
    const t0 = ticks[0].base.placed, feet0 = mrModPlacedBox(sheet, t0, ['feet']), body0 = mrModPlacedBox(sheet, t0, ['body']);
    const mrFeet = mrModOpaqueBox(mrModParts(anm, slots, v, [null, 1, null, null, null])), mrBody = mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null]));
    const anchor96 = [(body0.x0 + body0.x1) / 2, (feet0 || body0).y1], anchorMr = [(mrBody.x0 + mrBody.x1) / 2, (mrFeet || mrBody).y1];
    const fits = kk => ticks.every(t => [t.base, ...Object.values(t.byValue).flat()].every(x => {
      const b = mrModPlacedBox(sheet, x.placed);
      return anchorMr[0] + (b.x0 - anchor96[0]) * kk >= 1 && anchorMr[1] + (b.y0 - anchor96[1]) * kk >= 1
        && anchorMr[0] + (b.x1 - anchor96[0]) * kk <= mr.width - 1 && anchorMr[1] + (b.y1 - anchor96[1]) * kk <= mr.height - 1;
    }));
    while (!fits(scale) && scale > k / 4) scale *= 0.97;
    const frames = ticks.map(tick => ({ tick, k: scale, ax: anchorMr[0] - anchor96[0] * scale, ay: anchorMr[1] - anchor96[1] * scale }));
    const f = mrModFrames(sheet, pal, noseColors, [{ v, frames: frames.slice(0, 1) }], mr);
    if (f.width !== mr.width || f.height !== mr.height) throw new Error(`the 1996 Zoombini does not fit BigZomb.anm's ${mr.width}×${mr.height}`);
    // the body alone, each feet from its own tick, and the nose, hair and
    // eyes as mrModFrames draws them
    const feetOf = feet => mrModFrames(sheet, pal, noseColors, [{ v, frames: [{ ...frames[(feet - 1) * 1], tick: { base: { order: frames[feet - 1].tick.base.order, placed: frames[feet - 1].tick.base.placed.filter(p => p.part === 'feet') }, byValue: frames[0].tick.byValue } }] }], mr);
    const bodyOnly = mrModFrames(sheet, pal, noseColors, [{ v, frames: [{ ...frames[0], tick: { base: { order: frames[0].tick.base.order, placed: frames[0].tick.base.placed.filter(p => p.part === 'body') }, byValue: frames[0].tick.byValue } }] }], mr);
    out[mrAnmSlot(v, 0, 0)] = bodyOnly.slots[mrAnmSlot(v, 0, 0)];
    for (let feet = 1; feet <= 5; feet++) out[mrAnmSlot(v, 1, feet)] = feetOf(feet).slots[mrAnmSlot(v, 0, 0)];
    for (const part of [2, 3, 4]) for (let val = 1; val <= 5; val++) out[mrAnmSlot(v, part, val)] = f.slots[mrAnmSlot(v, part, val)];
  }
  const fr = slots[mrAnmSlot(views[0], 0, 0)][0];
  return { slots: out, dx: 0, dy: 0, width: fr.width, height: fr.height, ticks: 1, scale, ms: 0, limit: 11 };
}

/* Every group of the mod's sets, for mrModExe: { file, walk, whole, sets,
   names }, `names` the new files' paths in the program's form
   (./bmp/zombis/zb96<name><feet>.anm, or zb96<name>.anm for the one set
   of a `whole` group). `read(file)` gives one of
   MR_MOD_SETS's files' bytes, or null where the disc lacks it, `sheet`
   and `tumble` are the 1996 Zoombini's sheets (zbSnoidSheet's 'zoombini'
   and 'tumble'), `pal` its colors, and `script(archive, id)` a 1996
   script parsed. */
function mrModGroups(read, sheet, tumble, pal, script) {
  const families = new Map(), groups = [];
  for (const spec of MR_MOD_SETS) {
    const anm = read(spec.file);
    if (!anm) continue;
    const name = spec.file.split('/').pop().replace(/\.anm$/, '');
    let sets;
    if (spec.whole) {
      const set = mrModWholeSet(anm, sheet, pal, script, mrModScale(anm, sheet), mrModNoseColors(anm, sheet, pal));
      groups.push({ file: spec.file, walk: false, whole: true, sets: [set], names: [`./bmp/zombis/zb96${name}.anm`] });
      continue;
    }
    if (spec.walk) {
      const k = mrModScale(anm, sheet), noseColors = mrModNoseColors(anm, sheet, pal);
      families.set(spec.file, { k, noseColors });
      sets = mrModWalkSets(anm, sheet, pal, id => script('ZOOMBINI', id), 102, k, noseColors);
    } else {
      const fam = spec.own ? { k: mrModScale(anm, sheet), noseColors: mrModNoseColors(anm, sheet, pal) } : families.get(spec.family);
      if (!fam) throw new Error(`${spec.file} comes before its family ${spec.family}`);
      sets = mrModOtherSets(anm, spec, sheet, pal, script, fam.k, fam.noseColors, tumble);
    }
    groups.push({ file: spec.file, walk: !!spec.walk, sets, names: sets.map(s => `./bmp/zombis/zb96${name}${s.feet}.anm`) });
  }
  return groups;
}

/* ---- the program's patch ------------------------------------------------- */

/* The places patched in zoombini2.exe (the 2001 disc's), each with the
   bytes expected there. The program loads every set with FUN_0045c510
   (set, name), whose first two pushes the patch moves (`loaderEntry`),
   and the walk's set, DAT_0055a090, at start-up (FUN_00465220), with its
   time set by FUN_0045cec0, where the patch loads the mod's sets
   (`load`). In FUN_0045d580, the draw, the set at the Zoombini's +0x44 is
   read for the body's slot (0x45d660), the body's frame (0x45d7ba), each
   part's slot (0x45d80e) and the next frame's time (0x45da1f), and the
   frame number is held under 11 at 0x45da2d. A Zoombini's feet are its
   byte +5. Each site's `mask` is the groups it redirects: 1 every group,
   2 the walks alone, which have the 1996 pace and length. */
const MR_MOD_EXE = {
  walkSet: 0x55a090, loader: 0x45c510, setTime: 0x45cec0,
  loaderEntry: { at: 0x45c510, bytes: '6aff68be0b4800', next: 0x45c517 },
  load: { at: 0x465631, bytes: '6a326890a05500e8' },
  sites: [
    { at: 0x45d660, bytes: '8b5e448d3c49', reg: 'ebx', mask: 1, lift: true },
    { at: 0x45d7ba, bytes: '8b7e448d0440', reg: 'edi', mask: 1 },
    { at: 0x45d80e, bytes: '8b4e448d1440', reg: 'ecx', mask: 1 },
    { at: 0x45da1f, bytes: '8b56440382' + '80bb0000', reg: 'edx', mask: 2 },
  ],
  limit: { at: 0x45da2d, bytes: '837e740b0f8c', next: 0x45da37 },
  setSize: 0xbba0, fields: { dx: 0xbb88, dy: 0xbb8c, limit: 0xbb90 },
};
const MR_REG = { eax: 0, ecx: 1, edx: 2, ebx: 3, esp: 4, ebp: 5, esi: 6, edi: 7 };
// a register's place in the frame pushad leaves on the stack
const MR_PUSHAD = { edi: 0, esi: 4, ebp: 8, esp: 12, ebx: 16, edx: 20, ecx: 24, eax: 28 };

/* The file names pushed before each load of a set (a push of a string
   ending .anm and a call within 32 bytes), as a Map of the path
   (mrProgramPath, without bmp/) to a list of { va, at }, the name's
   address and the file offset of the push's operand. */
function mrModNamePointers(exe) {
  const { code, text, callAfter } = mrPe(exe), out = new Map();
  for (const s of code) {
    for (let i = s.raw; i + 5 <= s.raw + s.rsize; i++) {
      if (exe[i] !== 0x68) continue;
      const va = mrU32(exe, i + 1), name = text(va);
      if (!/\.anm$/i.test(name) || callAfter(i + 5, 32) < 0) continue;
      const key = mrProgramPath(name).replace(/^bmp\//, '');
      if (!out.has(key)) out.set(key, []);
      out.get(key).push({ va, at: i + 1 });
    }
  }
  return out;
}


/* A PE file's layout: its headers' places and its sections, each
   { name, va, vsize, raw, rsize, header }. */
function mrModPe(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), pe = dv.getUint32(0x3c, true);
  if (dv.getUint32(pe, true) !== 0x4550) throw new Error('not a PE file');
  const count = dv.getUint16(pe + 6, true), optional = dv.getUint16(pe + 20, true), opt = pe + 24;
  const sections = [];
  for (let i = 0; i < count; i++) {
    const h = opt + optional + 40 * i;
    sections.push({ name: String.fromCharCode(...b.subarray(h, h + 8)).replace(/\0+$/, ''), vsize: dv.getUint32(h + 8, true), va: dv.getUint32(h + 12, true), rsize: dv.getUint32(h + 16, true), raw: dv.getUint32(h + 20, true), header: h });
  }
  return { pe, opt, base: dv.getUint32(opt + 28, true), sectionAlign: dv.getUint32(opt + 32, true), fileAlign: dv.getUint32(opt + 36, true), sections };
}
function mrModFileOffset(layout, va) {
  const rva = va - layout.base;
  const s = layout.sections.find(s => rva >= s.va && rva < s.va + Math.max(s.vsize, s.rsize));
  if (!s || rva - s.va >= s.rsize) throw new Error(`${va.toString(16)} is in no section's bytes`);
  return s.raw + rva - s.va;
}

/* A little x86 assembler for the patch: bytes in order, with labels,
   and jumps and calls to labels or addresses. */
function mrModAsm(origin) {
  const out = [], fixups = [], labels = {};
  const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const a = {
    get here() { return origin + out.length; },
    bytes(...bs) { for (const x of bs.flat()) out.push(x & 255); return a; },
    hex(h) { for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16)); return a; },
    u32(v) { return a.bytes(u32(v >>> 0)); },
    label(n) { labels[n] = a.here; return a; },
    rel(op, to) { a.bytes(op); fixups.push({ at: out.length, to }); return a.u32(0); },
    jmp(to) { return a.rel([0xe9], to); },
    call(to) { return a.rel([0xe8], to); },
    jne(to) { return a.rel([0x0f, 0x85], to); },
    jl(to) { return a.rel([0x0f, 0x8c], to); },
    done() {
      for (const f of fixups) {
        const to = typeof f.to === 'string' ? labels[f.to] : f.to;
        if (to == null) throw new Error(`no label ${f.to}`);
        out.splice(f.at, 4, ...u32((to - (origin + f.at + 4)) >>> 0));
      }
      return Uint8Array.from(out);
    },
  };
  return a;
}
/* zoombini2.exe patched to load the mod's sets and draw each Zoombini
   from them. `groups` is mrModGroups's list, each with its program file
   (`file`), its five sets by feet and their names. The patch is a new
   section, .zb96, with the start-up code that loads every set; the
   loader's hook, which notes the set each group's file is loaded into
   (the group's source), and forgets a source loaded over with another
   file; the lookup, which gives the group's set for the Zoombini's feet
   where the set read is a group's source and the feet are 1 to 5; the
   draw's sites and the frame limit, each a jump to code that calls the
   lookup; and the names, the groups' entries, the names' addresses, the
   groups' tables and the sets. A walk's set has its own time a frame and
   limit, and the others keep the program's, since the places count their
   frames. */
function mrModExe(exe, groups) {
  const M = MR_MOD_EXE, L = mrModPe(exe), view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const expect = (va, hex) => {
    const o = mrModFileOffset(L, va), have = [...exe.subarray(o, o + hex.length / 2)].map(x => x.toString(16).padStart(2, '0')).join('');
    if (have !== hex) throw new Error(`zoombini2.exe has ${have} at ${va.toString(16)} where this build has ${hex}`);
    return o;
  };
  if (L.sections.some(s => s.name === '.zb96')) throw new Error('zoombini2.exe is patched already');
  const loadOff = expect(M.load.at, M.load.bytes);
  if (M.load.at + 12 + view.getInt32(loadOff + 8, true) !== M.setTime) throw new Error('the start-up call is not to the time setter');
  const entryOff = expect(M.loaderEntry.at, M.loaderEntry.bytes);
  for (const s of M.sites) expect(s.at, s.bytes);
  const limitOff = expect(M.limit.at, M.limit.bytes), limitTarget = M.limit.at + 10 + view.getInt32(limitOff + 6, true);
  const pointers = mrModNamePointers(exe);
  for (const g of groups) if (!pointers.get(g.file)) throw new Error(`zoombini2.exe loads no ${g.file}`);
  const whole = groups.filter(g => g.whole);
  groups = groups.filter(g => !g.whole);
  const last = L.sections[L.sections.length - 1];
  const align = (v, n) => Math.ceil(v / n) * n;
  const va = align(last.va + Math.max(last.vsize, last.rsize), L.sectionAlign), base = L.base + va;
  const all = groups.flatMap(g => g.sets.map((s, i) => ({ s, name: g.names[i] })));
  const named = groups.flatMap((g, i) => [...new Set(pointers.get(g.file).map(p => p.va))].map(p => ({ p, i })));
  const wholeNames = whole.map(g => g.names[0]);
  // The sets start on a new page. With the first set on the code's page,
  // the loader's writes there crashed the game under Wine on an Apple
  // silicon Mac (Rosetta), on 26 November 2026.
  const codeSize = 0x1000, namesAt = base + codeSize, entriesAt = namesAt + 0x40 * (all.length + wholeNames.length);
  const pointersAt = entriesAt + 12 * (groups.length + 1), tablesAt = pointersAt + 8 * (named.length + 1);
  const setsAt = align(tablesAt + 20 * groups.length, 0x1000);
  const setAt = i => setsAt + i * M.setSize, entryAt = i => entriesAt + 12 * i, tableAt = i => tablesAt + 20 * i;
  const a = mrModAsm(base);
  const je = l => a.rel([0x0f, 0x84], l), ja = l => a.rel([0x0f, 0x87], l);
  // start-up: the walk's time set as before, then every set loaded
  a.bytes(0x6a, 0x32).bytes(0x68).u32(M.walkSet).call(M.setTime).bytes(0x60);
  all.forEach((_, i) => { a.bytes(0x68).u32(namesAt + 0x40 * i).bytes(0x68).u32(setAt(i)).call(M.loader).bytes(0x83, 0xc4, 0x08); });
  a.bytes(0x61).jmp(M.load.at + 12);
  // the loader's hook: push eax, ebx, ecx, edx; eax the set, ecx the name
  const hookAt = a.here;
  a.bytes(0x50, 0x53, 0x51, 0x52).hex('8b442414').bytes(0xbb).u32(entriesAt);
  a.label('clear').hex('8b4b04').hex('85c9'); je('named');
  a.hex('3903').jne('clearNext').hex('c70300000000');
  a.label('clearNext').hex('83c30c').jmp('clear');
  a.label('named').hex('8b4c2418').bytes(0xbb).u32(pointersAt);
  a.label('name').hex('833b00'); je('hookDone');
  a.hex('390b').jne('nameNext').hex('8b5304').hex('8902').jmp('hookDone');
  a.label('nameNext').hex('83c308').jmp('name');
  a.label('hookDone').bytes(0x5a, 0x59, 0x5b, 0x58).bytes(...exe.subarray(entryOff, entryOff + 7)).jmp(M.loaderEntry.next);
  // the lookup: in eax the set read and esi the Zoombini, out ecx the
  // group's flags (0 for none) and eax the group's set for the feet
  a.label('lookup').bytes(0x53, 0x52).hex('85c0'); je('none');
  a.bytes(0xbb).u32(entriesAt);
  a.label('look').hex('8b5304').hex('85d2'); je('none');
  a.hex('3b03'); je('found');
  a.hex('83c30c').jmp('look');
  a.label('found').hex('0fb64605').bytes(0x48).hex('83f804'); ja('none');
  a.hex('8b0482').hex('8b4b08').bytes(0x5a, 0x5b, 0xc3);
  a.label('none').hex('31c9').bytes(0x5a, 0x5b, 0xc3);
  // the draw's reads of the set: pushad, look up, and where the group
  // answers to the site's mask, the saved register replaced (and the
  // place lifted by the set's dx, dy at the body's slot), then popad
  const jumps = [{ at: M.loaderEntry.at, n: 7, to: hookAt }, { at: M.load.at, n: 12, to: base }];
  M.sites.forEach((s, i) => {
    const o = mrModFileOffset(L, s.at), n = s.bytes.length / 2, r = MR_REG[s.reg];
    jumps.push({ at: s.at, n, to: a.here });
    a.bytes(...exe.subarray(o, o + 3)).bytes(0x60);
    if (r) a.bytes(0x8b, 0xc0 | r);
    a.call('lookup').bytes(0xf7, 0xc1).u32(s.mask); je(`restore${i}`);
    a.bytes(0x89, 0x44, 0x24, MR_PUSHAD[s.reg]);
    if (s.lift) a.bytes(0x8b, 0x90).u32(M.fields.dx).hex('29542430').bytes(0x8b, 0x90).u32(M.fields.dy).hex('29542434');
    a.label(`restore${i}`).bytes(0x61).bytes(...exe.subarray(o + 3, o + n)).jmp(s.at + n);
  });
  // the frame limit: a walk's own, and 11 for the others
  jumps.push({ at: M.limit.at, n: 10, to: a.here });
  a.bytes(0x60).hex('8b4644').call('lookup').bytes(0xf7, 0xc1).u32(2); je('old');
  a.bytes(0x8b, 0x80).u32(M.fields.limit).hex('394674').bytes(0x61).jl(limitTarget).jmp(M.limit.next);
  a.label('old').bytes(0x61).hex('837e740b').jl(limitTarget).jmp(M.limit.next);
  const code = a.done();
  if (code.length > codeSize) throw new Error('the patch is longer than its room');
  const size = setAt(all.length) - base, rsize = align(size, L.fileAlign), raw = align(exe.length, L.fileAlign);
  const out = new Uint8Array(raw + rsize), dv = new DataView(out.buffer);
  out.set(exe);
  out.set(code, raw);
  const enc = new TextEncoder(), at = v => raw + v - base;
  all.forEach(({ s, name }, i) => {
    if (name.length >= 0x40) throw new Error(`${name} is too long`);
    out.set(enc.encode(name), at(namesAt + 0x40 * i));
    dv.setUint32(at(setAt(i)) + 48000, s.ms || 0, true);
    dv.setUint32(at(setAt(i)) + M.fields.dx, s.dx, true);
    dv.setUint32(at(setAt(i)) + M.fields.dy, s.dy, true);
    dv.setUint32(at(setAt(i)) + M.fields.limit, s.limit, true);
  });
  let k = 0;
  groups.forEach((g, i) => {
    dv.setUint32(at(entryAt(i)) + 4, tableAt(i), true);
    dv.setUint32(at(entryAt(i)) + 8, g.walk ? 3 : 1, true);
    g.sets.forEach((_, j) => dv.setUint32(at(tableAt(i)) + 4 * j, setAt(k++), true));
  });
  // a whole group's file loaded by its new name, where the program pushes
  // the old one
  whole.forEach((g, i) => {
    const nameAt = namesAt + 0x40 * (all.length + i);
    out.set(enc.encode(wholeNames[i]), at(nameAt));
    for (const p of pointers.get(g.file)) dv.setUint32(p.at, nameAt, true);
  });
  named.forEach(({ p, i }, j) => { dv.setUint32(at(pointersAt + 8 * j), p, true); dv.setUint32(at(pointersAt + 8 * j) + 4, entryAt(i), true); });
  for (const { at: where, n, to } of jumps) {
    const o = mrModFileOffset(L, where);
    out[o] = 0xe9; dv.setInt32(o + 1, to - (where + 5), true);
    for (let i = 5; i < n; i++) out[o + i] = 0x90;
  }
  // the section's header, after the last one
  const h = last.header + 40, firstRaw = Math.min(...L.sections.map(s => s.raw).filter(Boolean));
  if (h + 40 > firstRaw) throw new Error('no room for another section header');
  if (out.subarray(h, h + 40).some(x => x)) throw new Error('the room after the section headers is not empty');
  out.set(enc.encode('.zb96'), h);
  dv.setUint32(h + 8, size, true);
  dv.setUint32(h + 12, va, true);
  dv.setUint32(h + 16, rsize, true);
  dv.setUint32(h + 20, raw, true);
  dv.setUint32(h + 36, 0xe0000060, true);
  dv.setUint16(L.pe + 6, L.sections.length + 1, true);
  dv.setUint32(L.opt + 56, align(va + size, L.sectionAlign), true);
  return out;
}

/* ---- the Mac program's patch --------------------------------------------- */

/* The places patched in the Mac program, Zoombinis2 (the 2001 disc's
   Classic installer, a PEF container for PowerPC with CarbonLib), by code
   offset, each with the word expected there, and the names of the
   functions they are in, which the code's traceback tables give. The
   program draws a Zoombini in DrawZomb__6CZombiFii as the Windows one
   does in FUN_0045d580, with the set at +0x44, the slots 12 bytes, the
   time a frame at +36000 and the walk's set's address in the TOC at
   -0x7ae8 (r2), which is the data section's 0xad47c (the workbench's
   tools/mountain/mr_pef.py reads the TOC). Game__Fv loads the walk's set (ReadCompressGfxZomb at
   0xbd68 from r25) and sets its time (SetGfxZombiFrameTime at 0xc79c).
   Each place is one instruction, replaced by a branch to the new code,
   which does it and branches back. */
const MR_MOD_MAC = {
  walkToc: -0x7ae8, walkSet: 0xad47c, loader: 0xbd68, setTime: 0xc79c,
  load: { at: 0x779a4, word: 0x60000000, before: 0x4bf94dfd },
  sites: [
    { at: 0xcd6c, word: 0x807f0044, reg: 3, scratch: 0, lift: true },
    { at: 0xcdc8, word: 0x807f0044, reg: 3, scratch: 0 },
    { at: 0xce34, word: 0x801f0044, reg: 0, scratch: 3 },
    { at: 0xcfc0, word: 0x809f0044, reg: 4, scratch: 0 },
  ],
  limit: { at: 0xcfd8, word: 0x2c00000b },
  setSize: 0x10000, fields: { time: 36000, dx: 36016, dy: 36020, limit: 36024 },
};

/* PowerPC instructions, as words. */
const PPC = {
  b: (from, to, link = 0) => (0x48000000 | ((to - from) & 0x3fffffc) | link) >>> 0,
  bne: (from, to) => ((16 << 26) | (4 << 21) | (2 << 16) | ((to - from) & 0xfffc)) >>> 0,
  d: (op, rt, ra, d) => ((op << 26) | (rt << 21) | (ra << 16) | (d & 0xffff)) >>> 0,
  lwz: (rt, d, ra) => PPC.d(32, rt, ra, d),
  stw: (rs, d, ra) => PPC.d(36, rs, ra, d),
  lbz: (rt, d, ra) => PPC.d(34, rt, ra, d),
  addi: (rt, ra, v) => PPC.d(14, rt, ra, v),
  addis: (rt, ra, v) => PPC.d(15, rt, ra, v),
  li: (rt, v) => PPC.d(14, rt, 0, v),
  cmpwi: (ra, v) => PPC.d(11, 0, ra, v),
  x: (rt, ra, rb, xo) => ((31 << 26) | (rt << 21) | (ra << 16) | (rb << 11) | (xo << 1)) >>> 0,
  cmplw: (ra, rb) => PPC.x(0, ra, rb, 32),
  cmpw: (ra, rb) => PPC.x(0, ra, rb, 0),
  add: (rt, ra, rb) => PPC.x(rt, ra, rb, 266),
  subf: (rt, ra, rb) => PPC.x(rt, ra, rb, 40),
  or: (ra, rs, rb) => PPC.x(rs, ra, rb, 444),
  slwi: (ra, rs, n) => ((21 << 26) | (rs << 21) | (ra << 16) | (n << 11) | ((31 - n) << 1)) >>> 0,
  mflr: rt => (0x7c0802a6 | (rt << 21)) >>> 0,
};
/* A value v as addis and addi halves, the low half signed. */
function mrModHalves(v) {
  const lo = ((v & 0xffff) ^ 0x8000) - 0x8000;
  return [(v - lo) >> 16, lo];
}

/* A PEF container's sections: { at (header), total, unpacked, packed,
   offset, kind } each. */
function mrModPefSections(b) {
  if (String.fromCharCode(...b.subarray(0, 12)) !== 'Joy!peffpwpc') throw new Error('not a PowerPC PEF container');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), count = dv.getUint16(0x20);
  return Array.from({ length: count }, (_, i) => {
    const at = 0x28 + 28 * i;
    return { at, total: dv.getUint32(at + 8), unpacked: dv.getUint32(at + 12), packed: dv.getUint32(at + 16), offset: dv.getUint32(at + 20), kind: b[at + 24] };
  });
}

/* The Mac program patched as mrModExe patches the Windows one: the five
   sets added to the end of the data section, which is zero-filled there,
   and the new code to the end of the code section, with the five names
   after it. The sets are 64 kB apart, so a Zoombini's set is the walk's
   set + (the sets' start - the walk's set) + (feet - 1) × 64 kB, with no
   table to relocate. The data section after the code moves by as much as
   the code grows. */
function mrModMac(pef, sets, names, walkOffset = MR_MOD_MAC.walkSet) {
  const M = MR_MOD_MAC, secs = mrModPefSections(pef), dv0 = new DataView(pef.buffer, pef.byteOffset, pef.byteLength);
  const code = secs.find(s => s.kind === 0), data = secs.find(s => s.kind === 1 || s.kind === 2);
  if (code.total !== code.packed || code.offset + code.packed > data.offset) throw new Error('the code section is not plain, or not before the data');
  const word = at => dv0.getUint32(code.offset + at);
  const expect = (at, w) => { if (word(at) !== w) throw new Error(`Zoombinis2 has ${word(at).toString(16)} at ${at.toString(16)} where this build has ${w.toString(16)}`); };
  expect(M.load.at, M.load.word); expect(M.load.at - 4, M.load.before);
  for (const s of M.sites) expect(s.at, s.word);
  expect(M.limit.at, M.limit.word);
  const align = (v, n) => Math.ceil(v / n) * n;
  const setsAt = align(data.total, 16), delta = setsAt - walkOffset;
  const out = [], at = () => code.total + 4 * out.length, put = (...ws) => out.push(...ws);
  const jumps = [];
  // reg = the set for the Zoombini's feet where reg is the walk's set,
  // with `scratch` lost; past the end otherwise
  const redirect = (reg, scratch) => {
    const skip = [];
    put(PPC.lwz(scratch, M.walkToc, 2), PPC.cmplw(reg, scratch));
    skip.push(out.length); put(0);
    put(PPC.lbz(scratch, 5, 31), PPC.slwi(scratch, scratch, 16));
    const [hi, lo] = mrModHalves(delta - M.setSize);
    if (reg === 0) {
      put(PPC.add(scratch, reg, scratch), PPC.addis(scratch, scratch, hi), PPC.addi(scratch, scratch, lo), PPC.or(0, scratch, scratch));
    } else {
      put(PPC.add(reg, reg, scratch), PPC.addis(reg, reg, hi), PPC.addi(reg, reg, lo));
    }
    return skip;
  };
  const land = skips => { for (const k of skips) out[k] = PPC.bne(code.total + 4 * k, at()); };
  // the start-up: after the walk's time is set, each new set loaded and
  // its time, lift and limit written
  jumps.push({ at: M.load.at, to: at() });
  const namesFixups = [];
  sets.forEach((s, i) => {
    const [hi, lo] = mrModHalves(delta + i * M.setSize);
    put(PPC.addis(3, 25, hi), PPC.addi(3, 3, lo));
    // r4 = the name: bl over nothing to read the address here
    namesFixups.push({ k: out.length + 2, i });
    put(PPC.b(at(), at() + 4, 1), PPC.mflr(4), 0);
    put(PPC.b(at(), M.loader, 1), 0x60000000);
    put(PPC.addis(3, 25, hi), PPC.addi(3, 3, lo));
    put(PPC.li(0, s.ms), PPC.addis(4, 3, 1));
    for (const [field, v] of [['time', s.ms], ['dx', s.dx], ['dy', s.dy], ['limit', s.limit]]) put(PPC.li(0, v), PPC.stw(0, M.fields[field] - 0x10000, 4));
  });
  put(PPC.b(at(), M.load.at + 4));
  // the draw's reads of the set
  for (const s of M.sites) {
    jumps.push({ at: s.at, to: at() });
    put(s.word);
    const skips = redirect(s.reg, s.scratch);
    if (s.lift) {
      // r30 -= dx, r27 -= dy, read from the set
      put(PPC.addis(3, 3, 1), PPC.lwz(0, M.fields.dx - 0x10000, 3), PPC.subf(30, 0, 30), PPC.lwz(0, M.fields.dy - 0x10000, 3), PPC.subf(27, 0, 27), PPC.addis(3, 3, -1));
    }
    land(skips);
    put(PPC.b(at(), s.at + 4));
  }
  // the frame limit: r0 compared with the new set's limit, or with 11
  jumps.push({ at: M.limit.at, to: at() });
  put(PPC.lwz(3, 0x44, 31));
  const skips = redirect(3, 4);
  put(PPC.addis(3, 3, 1), PPC.lwz(4, M.fields.limit - 0x10000, 3), PPC.cmpw(0, 4));
  put(PPC.b(at(), M.limit.at + 4));
  land(skips);
  put(M.limit.word);
  put(PPC.b(at(), M.limit.at + 4));
  // the names, and each load's addi to it from the address mflr gives
  const nameBytes = names.map(n => { const e = new TextEncoder().encode(n); const b = new Uint8Array(align(e.length + 1, 4)); b.set(e); return b; });
  let nameAt = at();
  for (const { k, i } of namesFixups) {
    let o = nameAt;
    for (let j = 0; j < i; j++) o += nameBytes[j].length;
    out[k] = PPC.addi(4, 4, o - (code.total + 4 * (k - 1)));
  }
  const grown = new Uint8Array(4 * out.length + nameBytes.reduce((n, b) => n + b.length, 0));
  const gv = new DataView(grown.buffer);
  out.forEach((w, i) => gv.setUint32(4 * i, w));
  let o = 4 * out.length;
  for (const b of nameBytes) { grown.set(b, o); o += b.length; }
  // the container rebuilt: the code grown, the data after it moved
  const newCodeSize = code.total + grown.length, shift = align(code.offset + newCodeSize, 16) - data.offset;
  const tail = pef.subarray(data.offset);
  const result = new Uint8Array(data.offset + Math.max(0, shift) + tail.length);
  result.set(pef.subarray(0, code.offset + code.total));
  result.set(grown, code.offset + code.total);
  result.set(tail, data.offset + Math.max(0, shift));
  const dv = new DataView(result.buffer);
  for (const s of secs) if (s.offset >= data.offset && s.packed) dv.setUint32(s.at + 20, s.offset + Math.max(0, shift));
  for (const f of [8, 12, 16]) dv.setUint32(code.at + f, newCodeSize);
  dv.setUint32(data.at + 8, setsAt + sets.length * M.setSize);
  for (const j of jumps) dv.setUint32(code.offset + j.at, PPC.b(j.at, j.to));
  return result;
}
