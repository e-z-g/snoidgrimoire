/* Mountain Rescue's Zoombinis as the 1996 game draws them, written for
   the game: the walk as five .anm files, one for each kind of feet, and
   zoombini2.exe patched to load them and draw each Zoombini from the one
   for its feet (26 November 2026, at the maintainer's choosing).

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
   where the body covers it. The blink's set, where a Zoombini waits, is
   redone the same way (MR_MOD_EXTRAS). Every other set (the celebration,
   the carried pose, the transition's sizes, the puzzles' sets) is
   unchanged. */

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

/* A 1996 walk's ticks placed for the mod: for each tick, the part order
   and the placements (of the tick zbSnoidShown gives where it draws
   nothing), each { part, frame, x, y }, moved so that the body's record
   is at x 0 in every tick, since Mountain Rescue moves the sprite, and the
   first tick's body at y 0, so the walk rises and falls as in 1996.
   `traits` gives each part's 1996 value. */
function mrModWalkTicks(sheet, traits, ticks) {
  const shown = zbSnoidShown(ticks, sheet.effects);
  const parts = ticks.map(t => zbSnoidParts(t, sheet.effects));
  const firstBody = parts.map(p => p.find(q => q.part === 'body')).find(Boolean);
  if (!firstBody) throw new Error('the walk draws no body');
  return ticks.map((t, i) => {
    const k = Math.max(0, shown[i]), body = parts[k].find(q => q.part === 'body') || firstBody;
    return {
      order: parts[k].map(q => q.part),
      placed: zbSnoidPlacements(sheet, traits, ticks[k]).map(p => ({ ...p, x: p.x - body.x, y: p.y - firstBody.y })),
    };
  });
}

/* The mod's five walk sets, one for each Mountain Rescue feet value, each
   { feet, slots (for mrAnmWrite), ms, limit, dx, dy, width, height,
   ticks, scale }. `limit` is the frame at which the program starts the
   loop again (the 1996 walk's ticks + 1, frame 0 being the Zoombini
   standing), and (dx, dy) is how far the new frames' corner is up and to
   the left of Mountain Rescue's. `anm` is littleZomb.anm's bytes, `sheet`
   the 1996 Zoombini's (zbSnoidSheet), `pal` the 1996 colors by index and
   `scripts` a function from a ZOOMBINI script number to its parsed SCRS.
   The 1996 Zoombini is scaled to the height of Mountain Rescue's,
   standing and facing the viewer. Each view's walk is the one mrLookWalk
   gives, with its first tick's lowest feet row on Mountain Rescue's frame
   0 feet's and its body's middle on Mountain Rescue's body's. */
/* The mod's other sets, each drawn for each kind of feet in the walk
   set's frame and lift, so that the patch draws both alike: `view` is the
   Mountain Rescue set's one view, frame 0 is the 1996 script `stand(feet)`
   gives (its first tick), frames 1 on are that tick `before` times, the
   script `script(feet)` gives, from its tick `from`, and that tick
   `after` times, and the 1996 Zoombini is placed on Mountain Rescue's for
   that view as the walk is. The blink is attenteZomb2.anm's
   set (DAT_00542980), where the program puts a Zoombini that waits, and
   its frame 0 is what a waiting Zoombini shows. The 1996 game blinks only
   facing the viewer, so a waiting Zoombini stands facing the viewer
   (ZOOMBINI SCRS 100) and blinks as ZOOMBINI SCRS 131 has it, and turns
   to its view once it walks. Mountain Rescue's blink runs open, closed and
   open again (attenteZomb2.anm's eyes, frames 0-2, 3-8 and 9-10), so the
   1996 blink has a standing tick on each side. */
const MR_MOD_EXTRAS = [
  { key: 'blink', view: 33, stand: () => 100, script: () => 131, from: 0, before: 1, after: 1 },
];

function mrModWalkSets(anm, sheet, pal, scripts, tickMs = 102, extras = MR_MOD_EXTRAS) {
  const slots = mrAnmSlots(anm), views = mrAnmViews(slots), viewList = [...views.keys()];
  const old = (feet, part = null, value = 1) => {
    const t = { feet: mrLookTrait('feet', feet).value, nose: mrLookTrait('nose', 1).value, hair: mrLookTrait('hair', 1).value, eyes: mrLookTrait('eyes', 1).value };
    if (part) t[part] = mrLookTrait(part, value).value;
    return t;
  };
  const front = viewList.includes(22) ? 22 : viewList[0];
  const mrStand = mrModOpaqueBox(mrModParts(anm, slots, front, [0, 1, 1, 1, 1]));
  const box96 = zbSnoidBox(sheet, zbZoombiniPlacements(sheet, old(1)));
  const k = (mrStand.y1 - mrStand.y0) / box96.height;
  // each Mountain Rescue nose's pixels, from the view that shows the most
  // of it, and the 1996 nose that stands for it in those colors
  const noseColors = new Map();
  for (let n = 1; n <= 5; n++) {
    let px = [];
    for (const v of viewList) {
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
    noseColors.set(n, px.length ? mrLookNoseColors(counts, pal, px) : null);
  }
  const fr0 = slots[mrAnmSlot(viewList[0], 0, 0)][0];
  const sets = [];
  for (let feet = 1; feet <= 5; feet++) {
    const plans = viewList.map(v => {
      const w = mrLookWalk(v, mrLookTrait('feet', feet).value), ticks = zbSnoidTicks(scripts(w.script), w.facing);
      const byValue = {};
      for (const part of ['nose', 'hair', 'eyes']) byValue[part] = [1, 2, 3, 4, 5].map(val => mrModWalkTicks(sheet, old(feet, part, val), ticks));
      const base = mrModWalkTicks(sheet, old(feet), ticks);
      const spriteBox = p => ({ x0: p.x, y0: p.y, x1: p.x + sheet.frames[p.frame].width, y1: p.y + sheet.frames[p.frame].height });
      const feet0 = base[0].placed.filter(p => p.part === 'feet').map(spriteBox), body0 = base[0].placed.filter(p => p.part === 'body').map(spriteBox);
      const yb96 = Math.max(...(feet0.length ? feet0 : body0).map(b => b.y1)), xc96 = (body0[0].x0 + body0[0].x1) / 2;
      const mrFeet = mrModOpaqueBox(mrModParts(anm, slots, v, [null, feet, null, null, null])) || mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null]));
      const mrBody = mrModOpaqueBox(mrModParts(anm, slots, v, [0, null, null, null, null]));
      return { v, ticks, base, byValue, mx: (mrBody.x0 + mrBody.x1) / 2, my: mrFeet.y1, ax: (mrBody.x0 + mrBody.x1) / 2 - xc96 * k, ay: mrFeet.y1 - yb96 * k };
    });
    // the other sets' ticks, the standing one first, placed on Mountain
    // Rescue's Zoombini for their view as the walk is
    const extraPlans = extras.map(e => {
      const walkPl = plans.find(p => p.v === e.view);
      if (!walkPl) throw new Error(`littleZomb.anm has no view ${e.view}`);
      const f96 = mrLookTrait('feet', feet).value;
      const stand = zbSnoidTicks(scripts(e.stand(f96)), false).slice(0, 1), repeat = n => Array.from({ length: n || 0 }, () => stand[0]);
      const ticks = [...stand, ...repeat(e.before), ...zbSnoidTicks(scripts(e.script(f96)), false).slice(e.from), ...repeat(e.after)];
      const byValue = {};
      for (const part of ['nose', 'hair', 'eyes']) byValue[part] = [1, 2, 3, 4, 5].map(val => mrModWalkTicks(sheet, old(feet, part, val), ticks));
      const base = mrModWalkTicks(sheet, old(feet), ticks);
      const spriteBox = p => ({ x0: p.x, y0: p.y, x1: p.x + sheet.frames[p.frame].width, y1: p.y + sheet.frames[p.frame].height });
      const feet0 = base[0].placed.filter(p => p.part === 'feet').map(spriteBox), body0 = base[0].placed.filter(p => p.part === 'body').map(spriteBox);
      const yb96 = Math.max(...(feet0.length ? feet0 : body0).map(b => b.y1)), xc96 = (body0[0].x0 + body0[0].x1) / 2;
      const pl = { v: e.view, ax: walkPl.mx - xc96 * k, ay: walkPl.my - yb96 * k };
      return { e, pl, ticks, base, byValue };
    });
    // the frame: every sprite of every view, tick and value, in Mountain
    // Rescue's frame, and that frame at least
    let x0 = 0, y0 = 0, x1 = fr0.width, y1 = fr0.height;
    for (const pl of plans) for (const list of [pl.base, ...Object.values(pl.byValue).flat()]) for (const t of list) for (const p of t.placed) {
      const f = sheet.frames[p.frame];
      x0 = Math.min(x0, Math.floor(pl.ax + p.x * k)); y0 = Math.min(y0, Math.floor(pl.ay + p.y * k));
      x1 = Math.max(x1, Math.ceil(pl.ax + (p.x + f.width) * k)); y1 = Math.max(y1, Math.ceil(pl.ay + (p.y + f.height) * k));
    }
    for (const { pl, base, byValue } of extraPlans) for (const list of [base, ...Object.values(byValue).flat()]) for (const t of list) for (const p of t.placed) {
      const f = sheet.frames[p.frame];
      x0 = Math.min(x0, Math.floor(pl.ax + p.x * k)); y0 = Math.min(y0, Math.floor(pl.ay + p.y * k));
      x1 = Math.max(x1, Math.ceil(pl.ax + (p.x + f.width) * k)); y1 = Math.max(y1, Math.ceil(pl.ay + (p.y + f.height) * k));
    }
    const dx = -x0, dy = -y0, width = x1 - x0, height = y1 - y0;
    // sprites drawn into a picture of that frame, scaled by k to the
    // nearest pixel, the nose in Mountain Rescue's colors, and left out
    // where `under` is opaque
    const draw = (pl, placed, colors = null, under = null) => {
      const pic = { width, height, data: new Uint8ClampedArray(4 * width * height) };
      for (const p of placed) {
        const f = sheet.frames[p.frame];
        const cx0 = Math.floor(pl.ax + p.x * k) + dx, cy0 = Math.floor(pl.ay + p.y * k) + dy;
        const cx1 = Math.ceil(pl.ax + (p.x + f.width) * k) + dx, cy1 = Math.ceil(pl.ay + (p.y + f.height) * k) + dy;
        for (let cy = cy0; cy < cy1; cy++) {
          const sy = Math.floor((cy + 0.5 - dy - pl.ay) / k - p.y);
          if (sy < 0 || sy >= f.height) continue;
          for (let cx = cx0; cx < cx1; cx++) {
            const sx = Math.floor((cx + 0.5 - dx - pl.ax) / k - p.x);
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
    // a view's slots from its frames in order, each { base, byValue } with
    // byValue[part][value - 1] that value's tick
    const fill = (out, pl, seq) => {
      const bodies = seq.map(s => draw(pl, s.base.placed.filter(p => p.part === 'feet' || p.part === 'body')));
      out[mrAnmSlot(pl.v, 0, 0)] = bodies.map(mrRbEncode);
      for (let val = 1; val <= 5; val++) out[mrAnmSlot(pl.v, 1, val)] = [empty];
      for (const part of ['nose', 'hair', 'eyes']) {
        for (let val = 1; val <= 5; val++) {
          out[mrAnmSlot(pl.v, MR_PARTS.indexOf(part), val)] = seq.map((s, j) => {
            const t = s.byValue[part][val - 1], under = t.order.indexOf(part) < t.order.indexOf('body');
            return mrRbEncode(draw(pl, t.placed.filter(p => p.part === part), noseColors.get(val), under ? bodies[j] : null));
          });
        }
      }
    };
    const tickOf = (base, byValue, i) => ({ base: base[i], byValue: Object.fromEntries(Object.entries(byValue).map(([part, lists]) => [part, lists.map(l => l[i])])) });
    const out = Array(MR_ANM_SLOTS).fill(null);
    const n = plans[0].ticks.length;
    if (plans.some(pl => pl.ticks.length !== n)) throw new Error(`feet ${feet}: the views' walks differ in length`);
    for (const pl of plans) fill(out, pl, [0, ...pl.ticks.map((_, i) => i)].map(i => tickOf(pl.base, pl.byValue, i)));
    const more = extraPlans.map(({ e, pl, ticks, base, byValue }) => {
      const slots = Array(MR_ANM_SLOTS).fill(null);
      fill(slots, pl, ticks.map((_, i) => tickOf(base, byValue, i)));
      return { key: e.key, slots, ms: tickMs, limit: ticks.length, dx, dy, ticks: ticks.length - 1 };
    });
    sets.push({ feet, slots: out, ms: tickMs, limit: n + 1, dx, dy, width, height, ticks: n, scale: k, extras: more });
  }
  return sets;
}

/* ---- the program's patch ------------------------------------------------- */

/* The places patched in zoombini2.exe (the 2001 disc's), each with the
   bytes expected there. The walk's set is DAT_0055a090, loaded at
   start-up (FUN_00465220) by FUN_0045c510, with its time set by
   FUN_0045cec0. In FUN_0045d580, the draw, the set is read for the body's
   slot (0x45d660), the body's frame (0x45d7ba), each part's slot
   (0x45d80e) and the next frame's time (0x45da1f), and the frame number
   is held under 11 at 0x45da2d. A Zoombini's feet are its byte +5. The
   blink's set, attenteZomb2.anm's, is DAT_00542980, where a Zoombini
   waits (FUN_0045d520), and `sources` gives each of the mod's groups the
   program's set it stands in for. */
const MR_MOD_EXE = {
  walkSet: 0x55a090, loader: 0x45c510, setTime: 0x45cec0,
  sources: { walk: 0x55a090, blink: 0x542980 },
  load: { at: 0x465631, bytes: '6a326890a05500e8' },
  sites: [
    { at: 0x45d660, bytes: '8b5e448d3c49', reg: 'ebx', lift: true },
    { at: 0x45d7ba, bytes: '8b7e448d0440', reg: 'edi' },
    { at: 0x45d80e, bytes: '8b4e448d1440', reg: 'ecx' },
    { at: 0x45da1f, bytes: '8b56440382' + '80bb0000', reg: 'edx' },
  ],
  limit: { at: 0x45da2d, bytes: '837e740b0f8c', next: 0x45da37 },
  setSize: 0xbba0, fields: { dx: 0xbb88, dy: 0xbb8c, limit: 0xbb90 },
};
const MR_REG = { eax: 0, ecx: 1, edx: 2, ebx: 3, esp: 4, ebp: 5, esi: 6, edi: 7 };

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
/* Where `reg` is one of the groups' sources, the set of that group for
   the Zoombini's feet in its place, and otherwise a jump to `skip`. For
   each group: cmp reg, source; jne next; movzx reg, byte [esi+5];
   mov reg, [reg*4 + table - 4]; jmp found. */
function mrModRedirect(a, reg, groups, skip, found) {
  const r = MR_REG[reg], tag = `${skip}-g`;
  groups.forEach((g, i) => {
    if (i) a.label(`${tag}${i}`);
    if (r === 0) a.bytes(0x3d).u32(g.source); else a.bytes(0x81, 0xf8 | r).u32(g.source);
    a.jne(i + 1 < groups.length ? `${tag}${i + 1}` : skip);
    a.bytes(0x0f, 0xb6, 0x46 | (r << 3), 0x05);
    a.bytes(0x8b, 0x04 | (r << 3), 0x85 | (r << 3)).u32(g.tableAt - 4);
    a.jmp(found);
  });
  return a;
}

/* zoombini2.exe patched to load the mod's sets and draw each Zoombini
   from them. `groups` is a list of { source, sets, names }: `source` the
   program's set the group stands in for (MR_MOD_EXE.sources), `sets` its
   five sets, by feet, each with the time, limit and lift that
   mrModWalkSets gives it, and `names` their paths as the program names
   its files, such as ./bmp/zombis/zb96walk1.anm. Wherever the draw reads
   a source, it reads the group's set for the Zoombini's feet. The patch
   is a new section, .zb96, with the code, the names, the groups' tables
   and the sets, and a jump at each place in MR_MOD_EXE. */
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
  for (const s of M.sites) expect(s.at, s.bytes);
  const limitOff = expect(M.limit.at, M.limit.bytes), limitTarget = M.limit.at + 10 + view.getInt32(limitOff + 6, true);
  const last = L.sections[L.sections.length - 1];
  const align = (v, n) => Math.ceil(v / n) * n;
  const va = align(last.va + Math.max(last.vsize, last.rsize), L.sectionAlign), base = L.base + va;
  const all = groups.flatMap(g => g.sets.map((s, i) => ({ s, name: g.names[i] })));
  // The sets start on a new page. With the first set on the code's page,
  // the loader's writes there crashed the game under Wine on an Apple
  // silicon Mac (Rosetta), on 26 November 2026.
  const codeSize = 0x800, namesAt = base + codeSize, tablesAt = namesAt + 0x40 * all.length;
  const setsAt = align(tablesAt + 0x20 * groups.length, 0x1000);
  const setAt = i => setsAt + i * M.setSize;
  groups = groups.map((g, i) => ({ ...g, tableAt: tablesAt + 0x20 * i }));
  const a = mrModAsm(base);
  // start-up: the walk's time set as before, then every set loaded
  a.bytes(0x6a, 0x32).bytes(0x68).u32(M.walkSet).call(M.setTime).bytes(0x60);
  all.forEach((_, i) => { a.bytes(0x68).u32(namesAt + 0x40 * i).bytes(0x68).u32(setAt(i)).call(M.loader).bytes(0x83, 0xc4, 0x08); });
  a.bytes(0x61).jmp(M.load.at + 12);
  // the draw's reads of the set
  const entries = [];
  M.sites.forEach((s, i) => {
    const o = mrModFileOffset(L, s.at), n = s.bytes.length / 2;
    entries.push({ at: s.at, n, to: a.here });
    a.bytes(...exe.subarray(o, o + 3));
    mrModRedirect(a, s.reg, groups, `skip${i}`, `found${i}`);
    a.label(`found${i}`);
    // push edx; mov edx, [ebx+dx]; sub [esp+0x14], edx;
    // mov edx, [ebx+dy]; sub [esp+0x18], edx; pop edx
    if (s.lift) a.bytes(0x52, 0x8b, 0x93).u32(M.fields.dx).hex('29542414').bytes(0x8b, 0x93).u32(M.fields.dy).hex('29542418').bytes(0x5a);
    a.label(`skip${i}`).bytes(...exe.subarray(o + 3, o + n)).jmp(s.at + n);
  });
  // the frame limit, a new set's limit for the new sets and 11 for the
  // others: push eax; mov eax, [esi+0x44]; (redirect); mov eax,
  // [eax+limit]; cmp [esi+0x74], eax; pop eax; jl; jmp
  entries.push({ at: M.limit.at, n: 10, to: a.here });
  a.bytes(0x50, 0x8b, 0x46, 0x44);
  mrModRedirect(a, 'eax', groups, 'old', 'new');
  a.label('new').bytes(0x8b, 0x80).u32(M.fields.limit).hex('394674').bytes(0x58).jl(limitTarget).jmp(M.limit.next);
  a.label('old').bytes(0x58).hex('837e740b').jl(limitTarget).jmp(M.limit.next);
  const code = a.done();
  if (code.length > codeSize) throw new Error('the patch is longer than its room');
  const size = setAt(all.length) - base, rsize = align(size, L.fileAlign), raw = align(exe.length, L.fileAlign);
  const out = new Uint8Array(raw + rsize), dv = new DataView(out.buffer);
  out.set(exe);
  out.set(code, raw);
  const enc = new TextEncoder();
  all.forEach(({ s, name }, i) => {
    if (name.length >= 0x40) throw new Error(`${name} is too long`);
    out.set(enc.encode(name), raw + namesAt - base + 0x40 * i);
    const so = raw + setAt(i) - base;
    dv.setUint32(so + 48000, s.ms, true);
    dv.setUint32(so + M.fields.dx, s.dx, true);
    dv.setUint32(so + M.fields.dy, s.dy, true);
    dv.setUint32(so + M.fields.limit, s.limit, true);
  });
  let k = 0;
  for (const g of groups) g.sets.forEach((_, i) => dv.setUint32(raw + g.tableAt - base + 4 * i, setAt(k++), true));
  const jump = (at, n, to) => {
    const o = mrModFileOffset(L, at);
    out[o] = 0xe9; dv.setInt32(o + 1, to - (at + 5), true);
    for (let i = 5; i < n; i++) out[o + i] = 0x90;
  };
  jump(M.load.at, 12, base);
  for (const e of entries) jump(e.at, e.n, e.to);
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

/* The mod's groups for mrModExe from mrModWalkSets's sets: the walk, then
   each of MR_MOD_EXTRAS, with their files' names in ./bmp/zombis. */
function mrModGroups(sets) {
  const groups = [{ source: MR_MOD_EXE.sources.walk, sets, names: sets.map(s => `./bmp/zombis/zb96walk${s.feet}.anm`) }];
  sets[0].extras.forEach((e, i) => groups.push({
    source: MR_MOD_EXE.sources[e.key], sets: sets.map(s => s.extras[i]), names: sets.map(s => `./bmp/zombis/zb96${e.key}${s.feet}.anm`),
  }));
  return groups;
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
