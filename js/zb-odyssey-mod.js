/* Island Odyssey's Zoombinis as the 1996 game draws them, written for the
   game: z3common.bul with every Zoombini part redone (27 November 2026, at
   the maintainer's word, after Mountain Rescue's mod).

   Island Odyssey puts a Zoombini together from its parts in z3common, one
   animation for each trait, each drawn at its point plus its step's x and y
   (ioCharacterDraw, doc/ISLAND-ODYSSEY.md, "The characters"). A walk has a
   block of every part for each kind of feet and each of three facings, so
   unlike Mountain Rescue's the program needs no patch. Each part's new
   animation has the original's steps and commands, and each step that
   draws shows the 1996 part at the 1996 walk's tick for that step, so the
   1996 body rises and falls and its feet move as in 1996. The standing
   poses face the viewer, as the 1996 Zoombini stands (ZOOMBINI SCRS 100),
   since their blinks redraw the eyes alone and the 1996 game blinks only
   that way (SCRS 131). The caterpillar, the Zerbles and every other
   animation are as they were.

   The trait values go by name. Island Odyssey's hairs are a mohawk, a cap,
   a ponytail, spiky hair and none, and the maintainer chose the 1996 flat
   top for the mohawk and the tuft for none (27 November 2026). */

/* Island Odyssey's Zoombini trait values (0-4), by appearance in z3common's
   pose 600, as the 1996 names (ZB_TRAIT_SHORT). */
const IO_MOD_NAMES = {
  feet: ['Sneakers', 'Wheels', 'Spring', 'Roller skates', 'Propeller'],
  hair: ['Flat top', 'Cap', 'Ponytail', 'Shaggy', 'Tuft'],
  eyes: ['Sunglasses', 'Wide eyes', 'Sleepy eyes', 'One eye', 'Glasses'],
  nose: ['Red', 'Orange', 'Purple', 'Green', 'Blue'],
};
// the Zoombini's traits in the program's record, by index (body, feet,
// hair, eyes, nose)
const IO_MOD_PARTS = ['body', 'feet', 'hair', 'eyes', 'nose'];

/* The 1996 traits for Island Odyssey values { feet, hair, eyes, nose }. */
function ioModTraits(v) {
  const t = {};
  for (const p of ['feet', 'hair', 'eyes', 'nose']) {
    const i = ZB_TRAIT_SHORT[p].indexOf(IO_MOD_NAMES[p][v[p]]);
    if (i < 0) throw new Error(`no 1996 ${p} named ${IO_MOD_NAMES[p][v[p]]}`);
    t[p] = i + 1;
  }
  return t;
}

/* An .ao of 16-bit frames: `steps` a list of [x, y, frame, word] (a frame
   below 0 a command), `point` [x, y, byte], and `pics` the frames, each {
   width, height, data } in RGBA, every opaque pixel written as RGB555 (op
   1) and every clear run skipped (op 0). The header's four unread bytes are
   `extra`, as the disc's are (0, 0, 2, 0). */
function ioModAo(steps, point, pics, extra = [0, 0, 2, 0]) {
  const frames = pics.map(ioModAo2c);
  const head = 10 + 4 * frames.length + 4 + 2 + 8 * steps.length;
  const size = head + frames.reduce((n, f) => n + f.length, 0);
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  dv.setInt16(0, 1, true); dv.setInt16(2, frames.length, true);
  out[4] = 12; out[5] = 0; out.set(extra, 6);
  let rel = 8;
  frames.forEach((f, i) => { dv.setUint32(10 + 4 * i, rel, true); rel += f.length; });
  let at = 10 + 4 * frames.length;
  const [px, py, pb] = point, x12 = px & 0xfff, y12 = py & 0xfff;
  out[at] = x12 & 0xff; out[at + 1] = y12 & 0xff; out[at + 2] = (x12 >> 8) | ((y12 >> 8) << 4); out[at + 3] = pb;
  at += 4;
  dv.setInt16(at, steps.length, true);
  steps.forEach((s, i) => s.forEach((v, k) => dv.setInt16(at + 2 + 8 * i + 2 * k, v, true)));
  at += 2 + 8 * steps.length;
  for (const f of frames) { out.set(f, at); at += f.length; }
  return out;
}
/* One AO2C frame: AO2C, u32 size (from the next byte), u16 2, u16 width,
   u32 height, the rows' u32 offsets from the same place, and the rows. */
function ioModAo2c(pic) {
  const { width: w, height: h, data } = pic, rows = [];
  for (let y = 0; y < h; y++) {
    const ops = [];
    let x = 0;
    while (x < w) {
      const opaque = data[4 * (y * w + x) + 3] >= 128;
      let n = 0;
      while (x + n < w && (data[4 * (y * w + x + n) + 3] >= 128) === opaque) n++;
      if (!opaque) { ops.push([0, n]); x += n; continue; }
      const px = [];
      for (let k = 0; k < n; k++) {
        const o = 4 * (y * w + x + k);
        px.push(((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3));
      }
      ops.push([1, n, px]);
      x += n;
    }
    rows.push(ops);
  }
  const rowBytes = rows.map(ops => ops.reduce((n, op) => n + 4 + (op[0] === 1 ? 2 * op[1] : 0), 0));
  const size = 8 + 4 * h + rowBytes.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(8 + size), dv = new DataView(out.buffer);
  out.set([0x41, 0x4f, 0x32, 0x43]);
  dv.setUint32(4, size, true);
  dv.setUint16(8, 2, true); dv.setUint16(10, w, true); dv.setUint32(12, h, true);
  let rel = 8 + 4 * h;
  rows.forEach((ops, y) => {
    dv.setUint32(16 + 4 * y, rel, true);
    let at = 8 + rel;
    for (const [op, n, px] of ops) {
      dv.setUint16(at, op, true); dv.setUint16(at + 2, n, true); at += 4;
      if (op === 1) for (const v of px) { dv.setUint16(at, v, true); at += 2; }
    }
    rel += rowBytes[y];
  });
  return out;
}

/* Placed 1996 sprites ({ part, frame, x, y }) of one part drawn at scale k
   into the smallest picture with room for them, in the 1996 colors `pal`,
   left out where `under` ({ x, y, pic }, in the same pixels) is opaque.
   Returns { x, y, pic } with (x, y) the picture's corner in the scaled
   1996 coordinates, or a 1×1 clear picture where nothing draws. */
function ioModDraw(sheet, pal, placed, k, under = null) {
  if (!placed.length) return { x: 0, y: 0, pic: { width: 1, height: 1, data: new Uint8ClampedArray(4) } };
  const box = mrModPlacedBox(sheet, placed);
  const x0 = Math.floor(box.x0 * k), y0 = Math.floor(box.y0 * k), x1 = Math.ceil(box.x1 * k), y1 = Math.ceil(box.y1 * k);
  const width = x1 - x0, height = y1 - y0, data = new Uint8ClampedArray(4 * width * height);
  for (const p of placed) {
    const f = sheet.frames[p.frame];
    for (let cy = Math.floor(p.y * k); cy < Math.ceil((p.y + f.height) * k); cy++) {
      const sy = Math.floor((cy + 0.5) / k - p.y);
      if (sy < 0 || sy >= f.height) continue;
      for (let cx = Math.floor(p.x * k); cx < Math.ceil((p.x + f.width) * k); cx++) {
        const sx = Math.floor((cx + 0.5) / k - p.x);
        if (sx < 0 || sx >= f.width) continue;
        const v = f.pixels[sy * f.width + sx];
        if (!v) continue;
        if (under) {
          const ux = cx - under.x, uy = cy - under.y;
          if (ux >= 0 && uy >= 0 && ux < under.pic.width && uy < under.pic.height && under.pic.data[4 * (uy * under.pic.width + ux) + 3] >= 128) continue;
        }
        const o = 4 * ((cy - y0) * width + cx - x0), [r, g, b] = pal[v];
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
  }
  return { x: x0, y: y0, pic: { width, height, data } };
}

/* The groups of parts the mod redoes, from the Zoombini's kind record
   (ioCharacterKinds' kind 0): each walk, a facing and a kind of feet,
   with { ids: { body, feet, hair: [5], eyes: [5], nose: [5] }, feet,
   angle }, and each pose, with { pose, ids: { body, feet: [5], ... },
   fidgets: [{ eyes: [5] }] }. */
function ioModGroups(kind) {
  const t = Object.fromEntries(IO_MOD_PARTS.map((p, i) => [p, kind.traits[i][2]]));
  const walks = [], poses = [];
  kind.facings.forEach(([base, angle]) => {
    for (let f = 0; f < 5; f++) {
      const at = (p, v) => base + t[p] + v + f * kind.length;
      walks.push({ angle, feet: f, ids: {
        body: at('body', 0), feet: base + t.feet + f * kind.length,
        hair: [0, 1, 2, 3, 4].map(v => at('hair', v)), eyes: [0, 1, 2, 3, 4].map(v => at('eyes', v)), nose: [0, 1, 2, 3, 4].map(v => at('nose', v)),
      } });
    }
  });
  kind.poses.forEach((p, i) => {
    const at = (part, v) => p.base + t[part] + v;
    poses.push({ pose: i, ids: {
      body: at('body', 0), feet: [0, 1, 2, 3, 4].map(v => at('feet', v)),
      hair: [0, 1, 2, 3, 4].map(v => at('hair', v)), eyes: [0, 1, 2, 3, 4].map(v => at('eyes', v)), nose: [0, 1, 2, 3, 4].map(v => at('nose', v)),
    }, fidgets: p.fidgets.flatMap(fd => fd.anims.filter(a => !a.mask || a.mask[3]).map(a => ({ eyes: [0, 1, 2, 3, 4].map(v => a.base + t.eyes + v) }))) });
  });
  return { walks, poses };
}

/* Every Zoombini part of z3common redone: { parts, scale }, `parts` a Map
   of the animation's name (`1060.ao`) to its new bytes. `bul` is
   z3common's bytes and `byName` its entries by name, `kind` the Zoombini's
   record, `sheet` and `pal` the 1996 Zoombini's sheet and colors,
   `script(id)` a ZOOMBINI script parsed, and `stepMs` the time a step
   shows, for the 1996 walk's pace (102 ms a tick). The 1996 Zoombini is
   scaled to Island Odyssey's standing height (pose 0, sneakers), its
   body's middle and lowest feet row on Island Odyssey's. */
function ioModParts(bul, byName, kind, sheet, pal, script, stepMs = 1000 / 15) {
  const aoOf = id => { const e = byName.get(`${id}.ao`); return e ? ioAo(bul, e.start) : null; };
  const drawnBox = (ids, stepOf) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const a = aoOf(id);
      if (!a) continue;
      const s = stepOf(a);
      if (!s) continue;
      const f = ioAoFrame(bul, a, s[2]);
      if (f.width < 2) continue;
      const x = a.points[0][0] + s[0], y = a.points[0][1] + s[1];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + f.width); y1 = Math.max(y1, y + f.height);
    }
    return { x0, y0, x1, y1 };
  };
  const firstDrawn = a => ioDrawnSteps(a)[0];
  const { walks, poses } = ioModGroups(kind);
  // the scale: Island Odyssey's pose 0 standing on sneakers over the 1996
  // Zoombini standing
  const p0 = poses[0].ids, ioStand = drawnBox([p0.body, p0.feet[0], p0.hair[3], p0.eyes[1], p0.nose[0]], firstDrawn);
  const stand = zbSnoidTicks(script(100), false).slice(0, 1);
  const t0 = ioModTraits({ feet: 0, hair: 3, eyes: 1, nose: 0 });
  const box96 = mrModPlacedBox(sheet, zbSnoidPlacements(sheet, t0, stand[0]));
  const k = (ioStand.y1 - ioStand.y0) / (box96.y1 - box96.y0);
  const out = new Map();
  // one part's animation: the original's steps with each drawn step's x, y
  // and frame from `pieces(j)` ({ x, y, pic }, in the scaled 1996
  // coordinates, one frame for each `keyOf(j)`), placed on (ax, ay) where
  // the 1996 origin lands
  const write = (id, n, keyOf, pieces, ax, ay) => {
    const a = aoOf(id);
    if (!a) return;
    const point = a.points[0], frames = [], index = new Map(), e = byName.get(`${id}.ao`);
    let j = 0;
    const steps = a.sequences[0].map(s => {
      if (s[2] < 0) return [0, 0, s[2], s[3]];
      const key = keyOf(j % n), piece = pieces(j % n);
      j++;
      if (!index.has(key)) { index.set(key, frames.length); frames.push(piece.pic); }
      return [Math.round(ax + piece.x) - point[0], Math.round(ay + piece.y) - point[1], index.get(key), s[3]];
    });
    out.set(`${id}.ao`, ioModAo(steps, point, frames, [...bul.subarray(e.start + 6, e.start + 10)]));
  };
  // the walks
  for (const w of walks) {
    const body = aoOf(w.ids.body);
    if (!body) continue;
    const n = ioDrawnSteps(body).length;
    const r = Math.PI * w.angle / 180, dx = Math.round(Math.cos(r) * 1024), dy = -Math.round(Math.sin(r) * 1024);
    const dir = zbWalkDirection(dx, dy), facing = dx < 0 ? 1 : 0;
    const f96 = ioModTraits({ feet: w.feet, hair: 0, eyes: 0, nose: 0 }).feet;
    const ticks = zbSnoidTicks(script(100 + 5 * f96 + dir), facing), T = ticks.length;
    const cycles = Math.max(1, Math.round(n * stepMs / (T * 102)));
    const tickOf = j => Math.floor(j * cycles * T / n) % T;
    const place = traits => mrModWalkTicks(sheet, traits, ticks);
    const base = place(ioModTraits({ feet: w.feet, hair: 0, eyes: 0, nose: 0 }));
    // the anchor: Island Odyssey's body middle and lowest feet row at the
    // first drawn step, and the 1996 ones at tick 0
    const ioFeet = drawnBox([w.ids.feet], firstDrawn), ioBody = drawnBox([w.ids.body], firstDrawn);
    const b96 = mrModPlacedBox(sheet, base[0].placed, ['body']), f96box = mrModPlacedBox(sheet, base[0].placed, ['feet']) || b96;
    const ax = (ioBody.x0 + ioBody.x1) / 2 - (b96.x0 + b96.x1) / 2 * k, ay = ioFeet.y1 - f96box.y1 * k;
    const bodyPic = j => ioModDraw(sheet, pal, base[tickOf(j)].placed.filter(p => p.part === 'body'), k);
    write(w.ids.body, n, tickOf, bodyPic, ax, ay);
    write(w.ids.feet, n, tickOf, j => ioModDraw(sheet, pal, base[tickOf(j)].placed.filter(p => p.part === 'feet'), k), ax, ay);
    for (const part of ['hair', 'eyes', 'nose']) {
      w.ids[part].forEach((id, v) => {
        const ts = place(ioModTraits({ feet: w.feet, hair: 0, eyes: 0, nose: 0, [part]: v }));
        write(id, n, tickOf, j => {
          const t = ts[tickOf(j)], under = t.order.indexOf(part) < t.order.indexOf('body') ? bodyPic(j) : null;
          return ioModDraw(sheet, pal, t.placed.filter(p => p.part === part), k, under);
        }, ax, ay);
      });
    }
  }
  // the poses, facing the viewer, and their blinks' eyes
  const blink = zbSnoidTicks(script(131), false);
  for (const p of poses) {
    const ids = p.ids, placeStand = traits => zbSnoidPlacements(sheet, traits, stand[0]);
    const s0 = placeStand(t0);
    const ioBody = drawnBox([ids.body], firstDrawn), ioFeet = drawnBox([ids.feet[0]], firstDrawn);
    const b96 = mrModPlacedBox(sheet, s0, ['body']), f96box = mrModPlacedBox(sheet, s0, ['feet']);
    const ax = (ioBody.x0 + ioBody.x1) / 2 - (b96.x0 + b96.x1) / 2 * k, ay = ioFeet.y1 - f96box.y1 * k;
    const one = (id, placed) => write(id, 1, () => 0, () => ioModDraw(sheet, pal, placed, k), ax, ay);
    one(ids.body, s0.filter(q => q.part === 'body'));
    ids.feet.forEach((id, v) => one(id, placeStand(ioModTraits({ feet: v, hair: 0, eyes: 0, nose: 0 })).filter(q => q.part === 'feet')));
    for (const part of ['hair', 'eyes', 'nose']) ids[part].forEach((id, v) => one(id, placeStand(ioModTraits({ feet: 0, hair: 0, eyes: 0, nose: 0, [part]: v })).filter(q => q.part === part)));
    // a blink's eyes: each drawn step open (the standing eyes) or shut (the
    // 1996 blink), as Island Odyssey's eyes there show at least half or
    // less than half of their first step's whites
    for (const fid of p.fidgets) fid.eyes.forEach((id, v) => {
      const a = aoOf(id);
      if (!a) return;
      const drawn = ioDrawnSteps(a), whites = drawn.map(s => { const f = ioAoFrame(bul, a, s[2]); let w = 0; for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3] > 128 && f.data[i] > 200 && f.data[i + 1] > 200 && f.data[i + 2] > 200) w++; return w; });
      const traits = ioModTraits({ feet: 0, hair: 0, eyes: v, nose: 0 }), open = placeStand(traits).filter(q => q.part === 'eyes');
      const shut = zbSnoidPlacements(sheet, traits, blink[0]).filter(q => q.part === 'eyes');
      const isOpen = j => !whites[0] || whites[j] * 2 >= whites[0];
      write(id, drawn.length, j => (isOpen(j) ? 'open' : 'shut'), j => ioModDraw(sheet, pal, isOpen(j) ? open : shut, k), ax, ay);
    });
  }
  return { parts: out, scale: k };
}

/* A bundle's records in rsc/root.inx, which the program reads to find
   each entry. The index is a tree of folders (`*bulkFiles`, `z3a1` ...), and each
   file's record is u16 0x80, u16 the bundle's number, u32 where the entry's
   name starts in the bundle, u32 the length of the name, its 0 byte and its
   file, 6 bytes of 0, and the name with a 0 byte. The bundle's number is
   the one whose records name the most of `bul`'s entries (ioEntries) where
   they are. Returns { bundle, records: [{ i, at, size, name }] } in the
   bundle's order, which tile the bundle from its 4-byte header to its end.
   The index has entries that ioEntries runs into the entry before, such as
   z3common's five fonts (`355.nfnt`), so it has 536 records there against
   ioEntries' 531. */
function ioModRecords(inx, bul) {
  const all = [];
  for (let i = 0; i + 18 < inx.length; i++) {
    if (ioU16(inx, i) !== 0x80) continue;
    const z = inx.indexOf(0, i + 18);
    if (z < 0 || z - i > 80) continue;
    const name = ioText(inx, i + 18, z);
    if (!/^[A-Za-z0-9_ -]+\.[A-Za-z0-9]{1,5}$/.test(name)) continue;
    all.push({ i, bundle: ioU16(inx, i + 2), at: ioU32(inx, i + 4), size: ioU32(inx, i + 8), name });
  }
  const starts = new Map(ioEntries(bul).map(e => [e.name, e.start - e.name.length - 1])), votes = new Map();
  for (const r of all) if (starts.get(r.name) === r.at) votes.set(r.bundle, (votes.get(r.bundle) || 0) + 1);
  const [bundle] = [...votes].sort((a, b) => b[1] - a[1])[0] || [];
  const records = all.filter(r => r.bundle === bundle).sort((a, b) => a.at - b.at);
  let pos = 4;
  for (const r of records) {
    if (r.at !== pos) throw new Error(`root.inx's records leave a gap or overlap at ${pos}`);
    if (ioText(bul, r.at, r.at + r.name.length) !== r.name || bul[r.at + r.name.length] !== 0) throw new Error(`${r.name} is not where root.inx puts it`);
    pos += r.size;
  }
  if (pos !== bul.length) throw new Error(`root.inx's records end at ${pos}, not at the bundle's end`);
  return { bundle, records };
}

/* A bundle and rsc/root.inx written again with the entries in `replace` (a
   Map of name to bytes) in place of the originals, every other entry as it
   was, in the same order, and the bundle's records in the index moved to
   where its entries now are (ioModRecords). Returns { bul, inx, bundle,
   records }. */
function ioModBundle(bul, inx, replace) {
  const { bundle, records } = ioModRecords(inx, bul), enc = new TextEncoder();
  const chunks = [bul.subarray(0, 4)], seen = new Set(), outInx = new Uint8Array(inx), dv = new DataView(outInx.buffer);
  let pos = 4;
  for (const r of records) {
    const head = enc.encode(r.name + '\0'), file = replace.has(r.name) ? replace.get(r.name) : bul.subarray(r.at + head.length, r.at + r.size);
    if (replace.has(r.name)) seen.add(r.name);
    chunks.push(head, file);
    dv.setUint32(r.i + 4, pos, true); dv.setUint32(r.i + 8, head.length + file.length, true);
    pos += head.length + file.length;
  }
  for (const name of replace.keys()) if (!seen.has(name)) throw new Error(`the bundle has no ${name}`);
  const out = new Uint8Array(pos);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return { bul: out, inx: outInx, bundle, records: records.length };
}
