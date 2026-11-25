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
  { key: 'crazy_turtle', name: 'Turtle Hurdle', kind: 'puzzle', background: 'crazy_turtle/background.bb' , sound: '08' },
  { key: 'waterslide', name: 'Pipes of Paloo', kind: 'puzzle', background: 'waterslide/waterslides.bb' , sound: '02' },
  { key: 'aquacube', name: 'Aqua Cube', kind: 'puzzle', background: 'aquacube/background.bb' , sound: '03' },
  { key: 'rescue1', name: 'Rescue Site I', kind: 'rest stop', background: 'rescue1/background.bb' , sound: 'C1' },
  { key: 'magic_wall', name: 'Beetle Bug Alley', kind: 'puzzle, left route', background: 'magic_wall/magic wall.bb' , sound: '06' },
  { key: 'chez_norf', name: 'Chez Norf', kind: 'puzzle, left route', background: 'chez_norf/baquegund.bb' , sound: '07' },
  { key: 'mystic_marsh', name: 'Bubble Bumpers', kind: 'puzzle, right route', background: 'mystic_marsh/background1.bb' , sound: '04' },
  { key: 'wall_of_fleens', name: 'Magic Mirrors', kind: 'puzzle, right route', background: 'wall_of_fleens/background.bb' , sound: '05' },
  { key: 'rescue2', name: 'Rescue Site II', kind: 'rest stop', background: 'rescue2/background.bb' , sound: 'C2' },
  { key: 'snowboard', name: 'Snowboard Gulch', kind: 'puzzle', background: 'snowboard/snowboard-easy.bb' , sound: '01' },
  { key: 'boolies', name: 'Boolie Boggle', kind: 'puzzle', background: 'boolies/background.bb' , sound: '09' },
  { key: 'booliewood', name: 'Booliewood', kind: 'the end', background: 'booliewood/background.bb' },
];
const MR_PLACE_BY_KEY = new Map(MR_PLACES.map(p => [p.key, p]));
/* The place whose number a sound's name starts with, or undefined. The
   designers numbered the places in an order unlike the journey's (sound in MR_PLACES),
   and the music and effects begin with it, as in music/02-BS01.wav for the
   Pipes of Paloo, which the program loads there. */
function mrSoundPlace(key) {
  const m = /(?:^|\/)(\d\d|C\d)-[^/]*$/i.exec(key);
  return m ? MR_PLACES.find(p => p.sound === m[1].toUpperCase()) : undefined;
}

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
    from: 'program',
    goal: 'Zoombinis stand at the junctions of pipes, and each pipe is labeled with a trait. A pipe fills with water when the Zoombinis at its two ends have the same value of that trait. The program builds an answer from the band and labels the pipes from it, so every pipe but a dead one has a pair that fills it. When the master valve opens, the Zoombinis on the filled pipes go down the waterfall one at a time, and the rest stay.',
    levels: ['Pairs. Eight junctions, each for two Zoombinis that share the trait on its pipe, and each pipe counts alone. A Zoombini with no partner in the band stands alone.', 'One random Zoombini in the middle and five spokes of three junctions leading to it. Each Zoombini shares a trait with the one inward of it. A junction with no partner has a dead pipe, after up to 100 deals, and any two Zoombinis fill it. An empty pipe drains the pipes outward of it on its spoke.', 'A network of 16 junctions grown out from the middle, the hardest Zoombini to pair first. Each Zoombini stands beside one that shares a trait. When no Zoombini left fits anywhere, the first one left stands at a dead pipe. The program deals again for fewer dead pipes. A filled pipe counts only while filled pipes link it to the middle.'],
  },
  aquacube: {
    from: 'program',
    goal: 'The bubbles are the corners of a cube, and each lever moves a ball of light along one axis. Each visit the levers get their axes in a random order. Every Zoombini in a bubble the light reaches goes to the beach. A Fleen\'s bubble lets the Fleen out, and then every Zoombini already on the beach goes back into the cube. The light may go back over its path, but the corners there are empty. A warp marks a set of levers and then moves the light along each marked axis in turn. It uses one move, and only the corner where it stops counts, so it passes over Fleens and Zoombinis on the way.',
    levels: ['A cube of 8 corners, 3 levers, 1 Fleen in the far corner, 6 moves. The light starts in the near corner.', 'The same cube with 6 moves and one warp. The light starts at one of the three corners next to the near corner.', 'A four-axis cube of 16 corners (the inner and outer cubes), 4 levers, 4 Fleens, 11 moves and two warps. The light starts in the near corner.'],
  },
  magic_wall: {
    from: 'program',
    goal: 'Scarab beetles sit on colored markers, and each tablet swaps the beetles on pairs of markers or moves a beetle from one marker to another. The puzzles are designs in the disc\'s file bmp/magic_wall/DEFAULT.ZTL. The program picks a design for the level, as often as its weight, and puts up to five tablets on the wall from it. Each beetle starts on the marker of its color, and the program scrambles them with 4 to 6 random presses of the tablets. It scrambles again, up to six times, until it finds a scramble that six presses cannot undo. When every beetle is home the lights over the four doors are on, and the lever lets four Zoombinis through. Then the program deals a new wall for the next four. Moves are unlimited.',
    levels: ['One of six designs, with 5 to 8 markers.', 'One of six designs, with 5 to 8 markers.', 'One of four designs in use, with 5 to 9 markers.'],
  },
  chez_norf: {
    from: 'program',
    goal: 'Each Norf gives clues to the meal it orders, and a tray from the refrigerator goes in front of a Norf. The orders do not depend on the band. Each level has four scenarios, and the program picks one at random. A scenario fixes which Norfs share a food, which order nothing from a group, and the clue each Norf speaks, such as that it alone orders a sandwich or that both its neighbors order milk. The program shuffles which dishes, drinks and desserts fill the scenario, in the orders and the clues alike. Each right meal lets Zoombinis stop working.',
    levels: ['Four Norfs, trays of a dish and a drink. Each right meal lets 2 Zoombinis go.', 'Four Norfs, trays of a dish, a drink and a dessert. Each right meal lets 2 Zoombinis go.', 'Six Norfs, trays of a dish, a drink and a dessert. The right meals let 2, 2, 1, 1, 1 and 1 Zoombinis go.'],
  },
  mystic_marsh: {
    from: 'program',
    goal: 'The program generates the marsh for the band from one of nine fixed grids. A Zoombini sent in at an entrance floats in a bubble, and the symbols turn it. Arrows turn every bubble. Trait diverters turn only Zoombinis with one value of one trait. One-time diverters turn one bubble and then let the rest pass, and cycling diverters turn bubbles each way by turns. A bubble on a spot waits until another bubble reaches the spot\'s trigger or comes in behind it. Rotators turn bubbles a quarter turn and elbows bounce them. Two bubbles that meet in a cell or pass through each other pop, and a bubble that falls into a whirlpool leaves the grid. Either way the Zoombini goes back. A bubble that reaches the end crosses.',
    levels: ['One entrance and two routes, taken by turns. On each route one trait diverter sends one value into a whirlpool and another sends a second value across to the other route. The program tries up to 30 grids and uses the one that scores best, with every part in use and the routes even.', 'Three entrances and three trait diverters, one of four grids. The diverters\' values split the band into about a half, a quarter and an eighth.', 'Four rings of rotators, one of two grids. Each ring has five trait diverters, one for each value of one trait, four traits in all, picked from two Zoombinis of the band that differ.'],
  },
  wall_of_fleens: {
    from: 'program',
    goal: 'One mirror of a wall hides the real Fleen. A cannonball breaks a mirror, and the meter beside it shows how many traits that Fleen shares with the real one. Once the cannonballs run out, the Zoombinis are fired at the mirrors instead.',
    levels: ['Six walls of 3 × 2 mirrors, one after another, each a design from a table of 123 with the traits and values shuffled. A wall shows at most three values of a trait. 12 cannonballs over all six.', 'A wall of 9 × 6 Fleens drawn at random, no two alike. 8 cannonballs.', 'A wall of 12 × 6 Fleens drawn at random, no two alike. 6 cannonballs.'],
  },
  snowboard: {
    from: 'program',
    goal: 'The slope forks three times into four trails. The first fork sends a Zoombini one way by one trait, and the two forks below it both test a second trait. So the trails take Zoombinis with both traits matched, the first only, the second only, and neither. Each value is one the band has, and the program deals again until the band spreads well over the trails. A Zoombini down a wrong trail bumps a Norf, and too many bumps close the slopes.',
    levels: ['The sign shows the forks. Each fork matches one value, and the Norfs allow 2 bumps.', 'The sign is hidden. Each fork matches one value, and the Norfs allow 4 bumps.', 'The sign is hidden. Each fork matches either of two values, and the Norfs allow 4 bumps.'],
  },
  boolies: {
    from: 'program',
    goal: 'Pinballs roll down a ramp into one of three groups of Boolies. Each pinball starts at the group\'s first Boolie. A sad Boolie turns happy and the pinball stops, and a happy one turns sad and the pinball goes on to the next. So a group counts in base 2, with happy as 1, and a cluster of n pinballs adds n. Each Boolie starts happy or sad at random, and no group starts all happy. A group left all happy boards a boat for Booliewood with a Zoombini, and the waiting group comes on in its place. The program deals the size of each cluster at random, and the machine has a number of clusters for the band.',
    levels: ['Two Boolies in each group, clusters of 1 to 3 pinballs, and 37 clusters for 16 Zoombinis.', 'Three Boolies in each group, clusters of 1 to 4 pinballs, with the next cluster shown, and 57 clusters for 16 Zoombinis.', 'Four Boolies in each group, clusters of 1 to 5 pinballs, with the next cluster shown, and 65 clusters for 16 Zoombinis.'],
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

/* Each .anm's time a frame, in milliseconds, out of zoombini2.exe. The
   program loads an .anm with a call that pushes its name's address, and at
   next gives its time a frame with a call whose first push is the
   milliseconds
   (FUN_0045c510 and FUN_0045cec0 in the 2001 Windows build). This finds every
   push of a string ending .anm and the call after it, and reads the number
   pushed right after that call. Of those, the pairs whose next call goes
   where most go are the frame times. A time pushed from a register
   (BigZomb.anm's) is left out. Returns Map(path in lower case, as
   mrGameFiles keys it -> ms). */
function mrAnmFrameTimes(exe) {
  const pe = mrU32(exe, 0x3c), count = mrU16(exe, pe + 6), optional = mrU16(exe, pe + 20);
  const base = mrU32(exe, pe + 24 + 28), sections = [];
  for (let i = 0; i < count; i++) {
    const o = pe + 24 + optional + 40 * i;
    sections.push({ va: base + mrU32(exe, o + 12), size: Math.max(mrU32(exe, o + 8), mrU32(exe, o + 16)), raw: mrU32(exe, o + 20), rsize: mrU32(exe, o + 16), code: (mrU32(exe, o + 36) & 0x20) !== 0 });
  }
  const at = va => { for (const s of sections) if (va >= s.va && va < s.va + s.rsize) return s.raw + va - s.va; return -1; };
  const text = va => {
    const o = at(va);
    if (o < 0) return '';
    let t = '';
    for (let i = o; i < exe.length && exe[i] && t.length < 120; i++) t += String.fromCharCode(exe[i]);
    return t;
  };
  // A call within limit bytes of o whose target is code. An address byte of
  // 0xe8 pushed before it fails the test.
  const code = sections.filter(s => s.code);
  const callAfter = (o, limit) => {
    for (let i = o; i < o + limit && i + 5 <= exe.length; i++) {
      if (exe[i] !== 0xe8) continue;
      const s = code.find(s => o >= s.raw && o < s.raw + s.rsize);
      const target = s ? (s.va + i - s.raw + 5 + (mrU32(exe, i + 1) | 0)) >>> 0 : 0;
      if (code.some(c => target >= c.va && target < c.va + c.rsize)) return i;
    }
    return -1;
  };
  const found = [];
  for (const s of code) {
    for (let i = s.raw; i + 5 <= s.raw + s.rsize; i++) {
      if (exe[i] !== 0x68) continue;
      const name = text(mrU32(exe, i + 1));
      if (!/\.anm$/i.test(name)) continue;
      const first = callAfter(i + 5, 32);
      if (first < 0) continue;
      // push ms (6a ib or 68 id), push the set (68 id or a register), call
      let j = first + 5;
      const ms = exe[j] === 0x6a ? exe[j + 1] : exe[j] === 0x68 ? mrU32(exe, j + 1) : -1;
      if (ms < 0) continue;
      j += exe[j] === 0x6a ? 2 : 5;
      if (exe[j] === 0x68) j += 5; else if (exe[j] >= 0x50 && exe[j] <= 0x57) j += 1; else continue;
      if (exe[j] !== 0xe8) continue;
      const target = (s.va + j - s.raw + 5 + (mrU32(exe, j + 1) | 0)) >>> 0;
      found.push({ path: name.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase(), target, ms });
    }
  }
  const votes = new Map();
  for (const f of found) votes.set(f.target, (votes.get(f.target) || 0) + 1);
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  return new Map(best ? found.filter(f => f.target === best[0]).map(f => [f.path, f.ms]) : []);
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
  mrSoundPlace,
  mrAnmFrameTimes,
  MR_PLACES, MR_PLACE_BY_KEY, MR_LEVELS, MR_PUZZLES, MR_PARTS, MR_ANM_SLOTS,
  mrReadBb, mrReadRb, mrReadAn, mrAnmSlots, mrAnmFrame, mrAnmSlot, mrAnmSlotName, mrAnmViews,
  mrReadBmp, mrReadPat, mrKind, mrIsoFiles, mrGameFiles, mrLooksLike, mrArchiveListing,
};
