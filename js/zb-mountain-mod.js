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
   where the body covers it. Every other set (the blink, the carried pose,
   the puzzles' sets) is unchanged. */

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
function mrModWalkSets(anm, sheet, pal, scripts, tickMs = 102) {
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
      return { v, ticks, base, byValue, ax: (mrBody.x0 + mrBody.x1) / 2 - xc96 * k, ay: mrFeet.y1 - yb96 * k };
    });
    // the frame: every sprite of every view, tick and value, in Mountain
    // Rescue's frame, and that frame at least
    let x0 = 0, y0 = 0, x1 = fr0.width, y1 = fr0.height;
    for (const pl of plans) for (const list of [pl.base, ...Object.values(pl.byValue).flat()]) for (const t of list) for (const p of t.placed) {
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
    const out = Array(MR_ANM_SLOTS).fill(null);
    const n = plans[0].ticks.length;
    if (plans.some(pl => pl.ticks.length !== n)) throw new Error(`feet ${feet}: the views' walks differ in length`);
    for (const pl of plans) {
      const frames = [0, ...pl.ticks.map((_, i) => i)];
      const bodies = frames.map(i => draw(pl, pl.base[i].placed.filter(p => p.part === 'feet' || p.part === 'body')));
      out[mrAnmSlot(pl.v, 0, 0)] = bodies.map(mrRbEncode);
      for (let val = 1; val <= 5; val++) out[mrAnmSlot(pl.v, 1, val)] = [empty];
      for (const part of ['nose', 'hair', 'eyes']) {
        for (let val = 1; val <= 5; val++) {
          const list = pl.byValue[part][val - 1];
          out[mrAnmSlot(pl.v, MR_PARTS.indexOf(part), val)] = frames.map((i, j) => {
            const t = list[i], under = t.order.indexOf(part) < t.order.indexOf('body');
            return mrRbEncode(draw(pl, t.placed.filter(p => p.part === part), noseColors.get(val), under ? bodies[j] : null));
          });
        }
      }
    }
    sets.push({ feet, slots: out, ms: tickMs, limit: n + 1, dx, dy, width, height, ticks: n, scale: k });
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
   is held under 11 at 0x45da2d. A Zoombini's feet are its byte +5. */
const MR_MOD_EXE = {
  walkSet: 0x55a090, loader: 0x45c510, setTime: 0x45cec0,
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
/* Where `reg` is the walk's set, the set for the Zoombini's feet in its
   place, and otherwise a jump to `skip`:
   cmp reg, walkSet; jne skip; movzx reg, byte [esi+5];
   mov reg, [reg*4 + table - 4]. */
function mrModRedirect(a, reg, table, skip) {
  const r = MR_REG[reg];
  if (r === 0) a.bytes(0x3d).u32(MR_MOD_EXE.walkSet); else a.bytes(0x81, 0xf8 | r).u32(MR_MOD_EXE.walkSet);
  a.jne(skip);
  a.bytes(0x0f, 0xb6, 0x46 | (r << 3), 0x05);
  a.bytes(0x8b, 0x04 | (r << 3), 0x85 | (r << 3)).u32(table - 4);
  return a;
}

/* zoombini2.exe patched to load `names` (five paths as the program names
   its files, such as ./bmp/zombis/zb96walk1.anm) into five new sets, and
   to draw each Zoombini walking from the set for its feet, each set with
   the time, limit and lift that `sets` (mrModWalkSets) gives it. The patch
   is a new section, .zb96, with the code, the names, the table of sets and
   the sets, and a jump at each place in MR_MOD_EXE. */
function mrModExe(exe, sets, names) {
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
  const codeSize = 0x400, namesAt = base + codeSize, tableAt = namesAt + 0x200, setsAt = align(tableAt + 0x20, 16);
  const setAt = i => setsAt + i * M.setSize;
  const a = mrModAsm(base);
  // start-up: the walk's time set as before, then the five sets loaded
  a.bytes(0x6a, 0x32).bytes(0x68).u32(M.walkSet).call(M.setTime).bytes(0x60);
  sets.forEach((s, i) => { a.bytes(0x68).u32(namesAt + 0x40 * i).bytes(0x68).u32(setAt(i)).call(M.loader).bytes(0x83, 0xc4, 0x08); });
  a.bytes(0x61).jmp(M.load.at + 12);
  // the draw's reads of the set
  const entries = [];
  M.sites.forEach((s, i) => {
    const o = mrModFileOffset(L, s.at), n = s.bytes.length / 2;
    entries.push({ at: s.at, n, to: a.here });
    a.bytes(...exe.subarray(o, o + 3));
    mrModRedirect(a, s.reg, tableAt, `skip${i}`);
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
  mrModRedirect(a, 'eax', tableAt, 'old');
  a.bytes(0x8b, 0x80).u32(M.fields.limit).hex('394674').bytes(0x58).jl(limitTarget).jmp(M.limit.next);
  a.label('old').bytes(0x58).hex('837e740b').jl(limitTarget).jmp(M.limit.next);
  const code = a.done();
  if (code.length > codeSize) throw new Error('the patch is longer than its room');
  const size = setAt(sets.length) - base, rsize = align(size, L.fileAlign), raw = align(exe.length, L.fileAlign);
  const out = new Uint8Array(raw + rsize), dv = new DataView(out.buffer);
  out.set(exe);
  out.set(code, raw);
  const enc = new TextEncoder();
  names.forEach((n, i) => { if (n.length >= 0x40) throw new Error(`${n} is too long`); out.set(enc.encode(n), raw + namesAt - base + 0x40 * i); });
  sets.forEach((s, i) => {
    dv.setUint32(raw + tableAt - base + 4 * i, setAt(i), true);
    const so = raw + setAt(i) - base;
    dv.setUint32(so + 48000, s.ms, true);
    dv.setUint32(so + M.fields.dx, s.dx, true);
    dv.setUint32(so + M.fields.dy, s.dy, true);
    dv.setUint32(so + M.fields.limit, s.limit, true);
  });
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
