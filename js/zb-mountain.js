/* zb-mountain.js -- Zoombinis Mountain Rescue (TERC and The Learning
   Company, 2001), the second game: its disc and its pictures.
   =========================================================================
   The game's assets are loose files in Data (Bmp, Sounds, movies) on a
   hybrid CD, and INSTALL/HD has the 22 backgrounds and 16 tunes that the
   installer copies to the disk. It shares no format with the 1996 game's
   Mohawk archives. Every picture is 24-bit color, little-endian, with no
   palette.
     .bb   a header, then rows of B, G, R from the top.
     .rb   a header, u32 size of what follows it, u16 count (use unknown),
           then segments to the end: u16 x, u16 y, u16 n, u8 kind and n
           pixels. Kind 0 has n opaque pixels of B, G, R. Kind 1 has n
           pixels of B, G, R, T, where T is 255 minus the alpha.
     .an   u32 frame count, then that many .rb pictures.
     .anm  3,000 slots. A slot is u32 0, or u32 frame count and that many
           frames, each a .rb picture with its size moved in front of its
           header. Slot = view * 30 + part * 6 + value.
     .bmt  a Windows BMP.
     .pat  a path as text, one leg to a line: NAME=coord:x,y,x,y,...
           step:n wait:n.
   The header of .bb and .rb is six u32 words: a word of no known use, a
   stamp, the body's size, the width, the height and another word of no
   known use. Twenty .rb files have a segment one pixel past the width,
   whose pixels the reader drops.
   WHERE IT CAME FROM
   Read from the files on 24 November 2026, with zoombini-workbench's
   tools/mountain/mr_bitmap.py, which decodes all 845 picture files of
   the disc. doc/MOUNTAIN-RESCUE.md has the layouts and the places.
   =========================================================================
   Bytes in, pictures out. No DOM, so Node's checks load it too. */

/* The places, in the order of the program's code, with their folders in
   Data/Bmp and the names that the user's guide gives them. */
const MR_PLACES = [
  { key: 'zombiniville', name: 'Zoombiniville', kind: 'the start', background: 'zombiniville/zoombiniville.bb' },
  { key: 'crazy_turtle', name: 'Turtle Hurdle', kind: 'puzzle', background: 'crazy_turtle/background.bb' },
  { key: 'waterslide', name: 'Pipes of Paloo', kind: 'puzzle', background: 'waterslide/waterslides.bb' },
  { key: 'aquacube', name: 'Aqua Cube', kind: 'puzzle', background: 'aquacube/background.bb' },
  { key: 'rescue1', name: 'Rescue Site I', kind: 'rest stop', background: 'rescue1/background.bb' },
  { key: 'magic_wall', name: 'Beetle Bug Alley', kind: 'puzzle, left route', background: 'magic_wall/magic wall.bb' },
  { key: 'chez_norf', name: 'Chez Norf', kind: 'puzzle, left route', background: 'chez_norf/baquegund.bb' },
  { key: 'mystic_marsh', name: 'Bubble Bumpers', kind: 'puzzle, right route', background: 'mystic_marsh/background1.bb' },
  { key: 'wall_of_fleens', name: 'Magic Mirrors', kind: 'puzzle, right route', background: 'wall_of_fleens/background.bb' },
  { key: 'rescue2', name: 'Rescue Site II', kind: 'rest stop', background: 'rescue2/background.bb' },
  { key: 'snowboard', name: 'Snowboard Gulch', kind: 'puzzle', background: 'snowboard/snowboard-easy.bb' },
  { key: 'boolies', name: 'Boolie Boggle', kind: 'puzzle', background: 'boolies/background.bb' },
  { key: 'booliewood', name: 'Booliewood', kind: 'the end', background: 'booliewood/background.bb' },
];
const MR_PLACE_BY_KEY = new Map(MR_PLACES.map(p => [p.key, p]));

/* The puzzles' goals and levels. Those marked from: 'program' are read
   from the program (zoombini-workbench's doc/MOUNTAIN-RESCUE.md, "The
   puzzles' rules", has the addresses), and the others are as the user's
   guide on the disc gives them (INSTALL/Data/Zoombinimr.pdf). */
const MR_LEVELS = ['Not So Easy', 'Oh So Hard', 'Very Hard'];
const MR_PUZZLES = {
  crazy_turtle: {
    from: 'program',
    goal: 'The Zoombinis cross the river on the backs of baby turtles, in one order only. The program picks one trait at random and shuffles its five values into an order, and the band must cross in that order, sorted by the trait. At Very Hard it picks a second trait and shuffles its values too, and Zoombinis with the same value of the first trait go in the second trait\'s order. A Zoombini is right on a turtle when its values of those traits match the order there, so Zoombinis alike in them can swap. Signs on the tree give some places of the order. A wrong placement breaks a beam of the dock and sends the Zoombini to the last open turtle where it would be right.',
    levels: ['All five signs, and 3 wrong placements.', 'One sign or two, each half the time, and 5 wrong placements with one sign or 4 with two.', 'One sign, with both traits\' values at that place, and 6 wrong placements.'],
  },
  waterslide: {
    goal: 'Pairs of Zoombinis that share a trait stand at the junctions of pipes labeled with that trait. A pipe whose pair matches fills with water. When the master valve opens, every Zoombini whose pipes reach it goes down the waterfall.',
    levels: ['Eight junctions.', 'Five branches joined at a central basin, with every Zoombini linked toward the Zoombini in the middle.', 'A more complex system, still linked to the Zoombini in the middle.'],
  },
  aquacube: {
    from: 'program',
    goal: 'The bubbles are the corners of a cube, and each lever moves a ball of light along one axis. Each visit the levers get their axes in a random order. Every Zoombini in a bubble the light reaches goes to the beach. A Fleen\'s bubble lets the Fleen out, and then every Zoombini already on the beach goes back into the cube. The light may go back over its path, but the corners there are empty. A warp marks a set of levers and then moves the light along each marked axis in turn.',
    levels: ['A cube of 8 corners, 3 levers, 1 Fleen in the far corner, 6 moves. The light starts in the near corner.', 'The same cube with 6 moves and one warp. The light starts at one of the three corners next to the near corner.', 'A four-axis cube of 16 corners (the inner and outer cubes), 4 levers, 4 Fleens, 11 moves and two warps. The light starts in the near corner.'],
  },
  magic_wall: {
    goal: 'Scarab beetles sit on colored markers. A tablet pressed etches its pattern between the markers, and the beetles swap places along it. When every beetle sits on the marker of its color, the lights over the four doors are on, and the lever lets four Zoombinis through. Solved twice, it lets all eight through. Moves are unlimited.',
    levels: ['The fewest beetles and the simplest patterns.', 'More beetles and more complicated patterns.', 'More beetles and more complicated patterns.'],
  },
  chez_norf: {
    goal: 'Each Norf gives clues to the meal it orders, and the order pad is for noting them. A tray of food from the refrigerator goes in front of a Norf. Each right meal lets some Zoombinis stop working.',
    levels: ['Four Norfs, a main dish and a drink, and 4 extra trays.', 'A main dish, a drink and a dessert, and 3 extra trays.', 'Six Norfs, and 2 wrong meals before the Zoombinis are fired.'],
  },
  mystic_marsh: {
    goal: 'A Zoombini set on a crater floats out in a bubble over the marsh, and arrows, diverters, event triggers, magnets and whirlpools move it, some by its traits. Two Zoombinis that meet anywhere but a magnet pop and go back to the rest stop. The order and the entrance settle who crosses.',
    levels: ['The fewest entrances and symbols.', 'More entrances, and more kinds of symbol.', 'More entrances, and more kinds of symbol.'],
  },
  wall_of_fleens: {
    from: 'program',
    goal: 'One mirror of a wall hides the real Fleen. A cannonball breaks a mirror, and the meter beside it shows how many traits that Fleen shares with the real one. Once the cannonballs run out, the Zoombinis are fired at the mirrors instead.',
    levels: ['Walls of 3 × 2 mirrors, each a design from a table of 123, with the traits and values shuffled. 12 cannonballs.', 'A wall of 9 × 6 Fleens drawn at random, no two alike. 8 cannonballs.', 'A wall of 12 × 6 Fleens drawn at random, no two alike. 6 cannonballs.'],
  },
  snowboard: {
    goal: 'Each trait sends a snowboarding Zoombini down one trail. A Zoombini on the wrong trail runs into a Norf, and too many bumps close the slopes.',
    levels: ['The sign at the right shows which traits go down which trail.', 'Clues on the sign are hidden.', 'Clues on the sign are hidden.'],
  },
  boolies: {
    goal: 'Pinballs roll down a ramp into a group of Boolies, which flip between happy and sad like an odometer counting in base 2. Only a group left all happy boards a boat for Booliewood.',
    levels: ['Two Boolies in each group.', 'More Boolies in each group and more pinballs, with the next cluster of pinballs shown.', 'More Boolies in each group and more pinballs, with the next cluster of pinballs shown.'],
  },
};

const MR_ANM_SLOTS = 3000;
const MR_PARTS = ['body', 'feet', 'nose', 'hair', 'eyes'];

const mrU16 = (b, o) => b[o] | (b[o + 1] << 8);
const mrU32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function mrHeader(b, o) {
  if (o + 24 > b.length) throw new Error('the header runs past the end of the file');
  return { stamp: mrU32(b, o + 4), size: mrU32(b, o + 8), width: mrU32(b, o + 12), height: mrU32(b, o + 16) };
}
function mrPicture(width, height) {
  if (!(width > 0 && height > 0 && width <= 4096 && height <= 4096)) throw new Error(`a picture of ${width}×${height}`);
  return { width, height, data: new Uint8ClampedArray(width * height * 4), dropped: 0 };
}

/* A .bb picture. */
function mrReadBb(b) {
  const h = mrHeader(b, 0), pic = mrPicture(h.width, h.height), n = h.width * h.height;
  if (24 + n * 3 > b.length) throw new Error('the pixels run past the end of the file');
  for (let i = 0, s = 24, d = 0; i < n; i++, s += 3, d += 4) {
    pic.data[d] = b[s + 2]; pic.data[d + 1] = b[s + 1]; pic.data[d + 2] = b[s]; pic.data[d + 3] = 255;
  }
  return pic;
}

/* A .rb body from its count to end, into a picture of the header's size. */
function mrDecodeBody(b, pos, end, width, height) {
  const pic = mrPicture(width, height), d = pic.data;
  if (end > b.length) throw new Error('the body runs past the end of the file');
  pos += 2;
  while (pos < end) {
    const x = mrU16(b, pos), y = mrU16(b, pos + 2), n = mrU16(b, pos + 4), kind = b[pos + 6];
    pos += 7;
    if (kind > 1) throw new Error(`a segment of kind ${kind} at ${pos - 7}`);
    const step = kind ? 4 : 3;
    for (let i = 0; i < n; i++, pos += step) {
      if (x + i >= width || y >= height) { pic.dropped++; continue; }
      const o = (y * width + x + i) * 4;
      d[o] = b[pos + 2]; d[o + 1] = b[pos + 1]; d[o + 2] = b[pos]; d[o + 3] = kind ? 255 - b[pos + 3] : 255;
    }
  }
  if (pos !== end) throw new Error(`the body ends at ${pos}, not at ${end}`);
  return pic;
}

/* The .rb picture at pos, and where it ends. */
function mrReadRbAt(b, pos) {
  const h = mrHeader(b, pos), size = mrU32(b, pos + 24);
  if (size !== h.size) throw new Error(`a body of ${size} bytes under a header of ${h.size}`);
  const end = pos + 28 + size;
  return { pic: mrDecodeBody(b, pos + 28, end, h.width, h.height), end };
}
function mrReadRb(b) { return mrReadRbAt(b, 0).pic; }

/* The frames of an .an. */
function mrReadAn(b) {
  const n = mrU32(b, 0), frames = [];
  let pos = 4;
  for (let i = 0; i < n; i++) {
    const r = mrReadRbAt(b, pos);
    frames.push(r.pic);
    pos = r.end;
  }
  if (pos !== b.length) throw new Error(`${b.length - pos} bytes after the last frame`);
  return frames;
}

/* The slots of an .anm: where each filled slot's frames are, without
   decoding them. mrAnmFrame decodes one. */
function mrAnmSlots(b) {
  const slots = [];
  let pos = 0;
  while (pos < b.length) {
    const n = mrU32(b, pos);
    pos += 4;
    if (!n) { slots.push(null); continue; }
    const frames = [];
    for (let i = 0; i < n; i++) {
      const size = mrU32(b, pos), h = mrHeader(b, pos + 4);
      if (h.size !== size) throw new Error(`a frame of ${size} bytes under a header of ${h.size}`);
      frames.push({ at: pos, size, width: h.width, height: h.height });
      pos += 28 + size;
    }
    slots.push(frames);
  }
  if (pos !== b.length) throw new Error('the last frame runs past the end of the file');
  if (slots.length !== MR_ANM_SLOTS) throw new Error(`${slots.length} slots, not ${MR_ANM_SLOTS}`);
  return slots;
}
function mrAnmFrame(b, f) { return mrDecodeBody(b, f.at + 28, f.at + 28 + f.size, f.width, f.height); }
const mrAnmSlot = (view, part, value) => view * 30 + part * 6 + value;
function mrAnmSlotName(slot) {
  const view = Math.floor(slot / 30), part = Math.floor(slot % 30 / 6), value = slot % 6;
  return { view, part, value, name: `view ${view}, ${MR_PARTS[part]}${part ? ' ' + value : ''}` };
}
/* The views an .anm has, each with its parts' values filled. */
function mrAnmViews(slots) {
  const views = new Map();
  slots.forEach((s, i) => {
    if (!s) return;
    const { view, part, value } = mrAnmSlotName(i);
    if (!views.has(view)) views.set(view, MR_PARTS.map(() => []));
    views.get(view)[part].push(value);
  });
  return views;
}

/* A .bmt: an uncompressed Windows BMP of 1, 4, 8, 24 or 32 bits, rows
   from the bottom unless the height is negative. The click maps
   (area.bmt) are 1-bit and typo-A.bmt is 8-bit, each with its palette
   after the header. */
function mrReadBmp(b) {
  if (b[0] !== 0x42 || b[1] !== 0x4d) throw new Error('not a BMP');
  const off = mrU32(b, 10), head = mrU32(b, 14), width = mrU32(b, 18) | 0, rawH = mrU32(b, 22) | 0, bits = mrU16(b, 28), comp = mrU32(b, 30);
  if (comp !== 0 || ![1, 4, 8, 24, 32].includes(bits)) throw new Error(`a BMP of ${bits} bits, compression ${comp}`);
  const height = Math.abs(rawH), pic = mrPicture(width, height), stride = ((width * bits + 31) >> 5) << 2;
  const colors = bits <= 8 ? (mrU32(b, 46) || 1 << bits) : 0, pal = 14 + head;
  for (let y = 0; y < height; y++) {
    const row = off + (rawH > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      let s;
      if (bits > 8) s = row + x * (bits / 8);
      else {
        const bit = x * bits, i = (b[row + (bit >> 3)] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
        if (i >= colors) throw new Error(`color ${i} of a palette of ${colors}`);
        s = pal + i * 4;
      }
      pic.data[d] = b[s + 2]; pic.data[d + 1] = b[s + 1]; pic.data[d + 2] = b[s]; pic.data[d + 3] = 255;
    }
  }
  return pic;
}

/* A .pat: its legs, each a name, its points, its step and its wait. */
function mrReadPat(text) {
  const legs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([^=]+)=coord:([\d,\s-]+?)\s+step:(-?\d+)\s+wait:(-?\d+)/.exec(line);
    if (!m) continue;
    const nums = m[2].split(',').map(s => +s.trim()), points = [];
    for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
    legs.push({ name: m[1].trim(), points, step: +m[3], wait: +m[4] });
  }
  return legs;
}

/* What a file is, by its extension. */
function mrKind(path) {
  const ext = (/\.([^./]+)$/.exec(path) || [])[1];
  const e = ext ? ext.toLowerCase() : '';
  return { bb: 'picture', rb: 'picture', bmt: 'picture', bmp: 'picture', an: 'animation', anm: 'parts', wav: 'sound',
    pat: 'path', txt: 'text', inf: 'text', ini: 'text', bik: 'movie', pdf: 'document' }[e] || 'other';
}

/* ---- the disc ------------------------------------------------------------ */

/* Every file on an ISO 9660 image read a piece at a time: [{ path,
   offset, size }]. read(start, end) returns the bytes. The primary
   directory has short names in upper case, so where the disc has a Joliet
   directory (a supplementary descriptor whose escape is %/@, %/C or %/E),
   the names come from it, in UCS-2 big-endian. */
async function mrIsoFiles(read) {
  const S = 2048;
  let pvd = await read(16 * S, 17 * S), joliet = false;
  if (pvd[0] !== 1 || String.fromCharCode(...pvd.subarray(1, 6)) !== 'CD001') throw new Error('not an ISO 9660 image');
  for (let n = 17; n < 32; n++) {
    const vd = await read(n * S, (n + 1) * S);
    if (vd[0] === 255 || String.fromCharCode(...vd.subarray(1, 6)) !== 'CD001') break;
    if (vd[0] === 2 && vd[88] === 0x25 && vd[89] === 0x2f && [0x40, 0x43, 0x45].includes(vd[90])) { pvd = vd; joliet = true; break; }
  }
  const nameOf = raw => {
    if (!joliet) return String.fromCharCode(...raw);
    let s = '';
    for (let i = 0; i + 1 < raw.length; i += 2) s += String.fromCharCode((raw[i] << 8) | raw[i + 1]);
    return s;
  };
  const out = [], seen = new Set();
  const walk = async (lba, len, prefix) => {
    if (seen.has(lba)) return;
    seen.add(lba);
    const dir = await read(lba * S, lba * S + len);
    for (let p = 0; p < dir.length;) {
      const n = dir[p];
      if (!n) { p = (Math.floor(p / S) + 1) * S; continue; }
      const at = mrU32(dir, p + 2), size = mrU32(dir, p + 10), isDir = dir[p + 25] & 2, nl = dir[p + 32];
      const raw = dir.subarray(p + 33, p + 33 + nl);
      p += n;
      if (nl === 1 && raw[0] < 2) continue;
      const name = nameOf(raw).replace(/;\d+$/, '').replace(/\.$/, '');
      if (isDir) await walk(at, size, prefix + name + '/');
      else out.push({ path: prefix + name, offset: at * S, size });
    }
  };
  await walk(mrU32(pvd, 156 + 2), mrU32(pvd, 156 + 10), '');
  return out;
}

/* The files of the game among a disc's or a folder's paths: those under
   Data/ and INSTALL/HD/, by their path from there in lower case, as the
   program's strings give them. INSTALL/HD's backgrounds and tunes join
   Data's. Returns Map(path -> the entry given). */
function mrGameFiles(entries, pathOf) {
  const files = new Map();
  for (const e of entries) {
    const p = pathOf(e).replace(/\\/g, '/');
    const m = /(?:^|\/)(?:install\/hd|data)\/((?:bmp|sounds|movies)\/.+)$/i.exec(p);
    if (m) { const k = m[1].toLowerCase(); if (!files.has(k)) files.set(k, e); continue; }
    if (/(?:^|\/)install\/hd\/zoombini2\.exe$/i.test(p)) files.set('zoombini2.exe', e);
    else if (/(?:^|\/)install\/data\/zoombinimr\.pdf$/i.test(p)) files.set('zoombinimr.pdf', e);
  }
  return files;
}
/* Whether paths look like Mountain Rescue's disc or its Data folder. */
function mrLooksLike(paths) {
  let rb = 0, anm = false;
  for (const p of paths) {
    const q = p.toLowerCase().replace(/\\/g, '/');
    if (/(?:^|\/)install\/hd\/zoombini2\.exe$/.test(q)) return true;
    if (/(?:^|\/)bmp\/zombis\/littlezomb\.anm$/.test(q)) anm = true;
    if (/(?:^|\/)bmp\/.+\.rb$/.test(q)) rb++;
  }
  return anm || rb > 20;
}

/* archive.org's listing of an ISO's files (view_archive.php), as
   [{ path, size }]. Folders have no link and are left out. */
function mrArchiveListing(html, iso) {
  const out = [], re = /<tr><td><a href="[^"]*?\/([^"\/]+\.iso)\/([^"]+)">[^<]*<\/a><td>[^<]*<td>[^<]*<td id="size">(\d+)/gi;
  for (let m; (m = re.exec(html));) {
    if (iso && m[1].toLowerCase() !== iso.toLowerCase()) continue;
    let path = m[2].replace(/&amp;/g, '&');
    try { path = decodeURIComponent(path); } catch (e) { /* kept as it is */ }
    out.push({ path, size: +m[3] });
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = {
  MR_PLACES, MR_PLACE_BY_KEY, MR_LEVELS, MR_PUZZLES, MR_PARTS, MR_ANM_SLOTS,
  mrReadBb, mrReadRb, mrReadAn, mrAnmSlots, mrAnmFrame, mrAnmSlot, mrAnmSlotName, mrAnmViews,
  mrReadBmp, mrReadPat, mrKind, mrIsoFiles, mrGameFiles, mrLooksLike, mrArchiveListing,
};
