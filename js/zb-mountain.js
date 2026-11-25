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
/* zoombini2.exe's sections, a string at an address, and calls: the bytes a
   reader of its code needs. */
function mrPe(exe) {
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
    for (let i = o; i < exe.length && exe[i] && t.length < 200; i++) t += String.fromCharCode(exe[i]);
    return t;
  };
  const code = sections.filter(s => s.code);
  const isCode = va => code.some(c => va >= c.va && va < c.va + c.rsize);
  // The target of a call (e8 rel32) at file offset i.
  const target = i => { const s = code.find(s => i >= s.raw && i < s.raw + s.rsize); return s ? (s.va + i - s.raw + 5 + (mrU32(exe, i + 1) | 0)) >>> 0 : 0; };
  // A call within limit bytes of o whose target is code. An address byte of
  // 0xe8 pushed before it fails the test.
  const callAfter = (o, limit) => {
    for (let i = o; i < o + limit && i + 5 <= exe.length; i++) if (exe[i] === 0xe8 && isCode(target(i))) return i;
    return -1;
  };
  return { sections, code, at, text, target, isCode, callAfter };
}
/* A path as the program writes it, ./bmp/x.bmp or .\bmp\x.bmp, as
   mrGameFiles keys it, in lower case. */
const mrProgramPath = name => name.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();

function mrAnmFrameTimes(exe) {
  const { code, text, callAfter } = mrPe(exe);
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
      found.push({ path: mrProgramPath(name), target, ms });
    }
  }
  const votes = new Map();
  for (const f of found) votes.set(f.target, (votes.get(f.target) || 0) + 1);
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  return new Map(best ? found.filter(f => f.target === best[0]).map(f => [f.path, f.ms]) : []);
}

/* The length of the 32-bit x86 instruction at b[pc], and what it does to
   the eight general registers, as much as mrRegisters needs. Covers the
   one-byte opcodes and the common 0F ones. Returns { len, op, modrm, imm }
   or null for an opcode outside those. */
const MR_MODRM = new Set([0x00, 0x01, 0x02, 0x03, 0x08, 0x09, 0x0a, 0x0b, 0x10, 0x11, 0x12, 0x13, 0x18, 0x19, 0x1a, 0x1b, 0x20, 0x21, 0x22, 0x23, 0x28, 0x29, 0x2a, 0x2b, 0x30, 0x31, 0x32, 0x33, 0x38, 0x39, 0x3a, 0x3b, 0x62, 0x63, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f, 0xc4, 0xc5, 0xd0, 0xd1, 0xd2, 0xd3, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf, 0xfe, 0xff]);
function mrX86(b, pc) {
  const start = pc;
  let wide = false;
  while ([0x26, 0x2e, 0x36, 0x3e, 0x64, 0x65, 0x66, 0x67, 0xf0, 0xf2, 0xf3].includes(b[pc])) { if (b[pc] === 0x66) wide = true; pc++; }
  const imm32 = wide ? 2 : 4;
  let op = b[pc++], two = false, modrm = -1, imm = 0;
  const readModrm = () => {
    modrm = b[pc++];
    const mod = modrm >> 6, rm = modrm & 7;
    if (mod === 3) return;
    if (rm === 4) { const sib = b[pc++]; if (mod === 0 && (sib & 7) === 5) pc += 4; }
    else if (mod === 0 && rm === 5) pc += 4;
    if (mod === 1) pc += 1; else if (mod === 2) pc += 4;
  };
  if (op === 0x0f) {
    two = true;
    op = b[pc++];
    if (op >= 0x80 && op <= 0x8f) imm = 4;
    else if ([0x31, 0xa2].includes(op) || (op >= 0xc8 && op <= 0xcf)) imm = 0;
    else if ([0xa4, 0xac, 0xba].includes(op)) { readModrm(); imm = 1; }
    else if ((op >= 0x40 && op <= 0x4f) || (op >= 0x90 && op <= 0x9f) || [0xa3, 0xa5, 0xab, 0xad, 0xaf, 0xb3, 0xb6, 0xb7, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0x1f, 0x10, 0x11, 0x28, 0x29, 0x2e, 0x2f, 0x54, 0x57, 0x58, 0x59, 0x5c, 0x5e].includes(op)) readModrm();
    else return null;
  } else if (MR_MODRM.has(op)) readModrm();
  else if ([0x80, 0x82, 0x83, 0x6b, 0xc0, 0xc1, 0xc6].includes(op)) { readModrm(); imm = 1; }
  else if ([0x81, 0x69, 0xc7].includes(op)) { readModrm(); imm = imm32; }
  else if (op === 0xf6 || op === 0xf7) { readModrm(); if (((modrm >> 3) & 7) < 2) imm = op === 0xf6 ? 1 : imm32; }
  else if ([0x04, 0x0c, 0x14, 0x1c, 0x24, 0x2c, 0x34, 0x3c, 0x6a, 0xa8, 0xcd, 0xeb, 0xd4, 0xd5].includes(op) || (op >= 0x70 && op <= 0x7f) || (op >= 0xb0 && op <= 0xb7) || (op >= 0xe0 && op <= 0xe7)) imm = 1;
  else if ([0x05, 0x0d, 0x15, 0x1d, 0x25, 0x2d, 0x35, 0x3d, 0x68, 0xa9].includes(op) || (op >= 0xb8 && op <= 0xbf)) imm = imm32;
  else if (op === 0xe8 || op === 0xe9) imm = 4;
  else if (op >= 0xa0 && op <= 0xa3) imm = 4;
  else if (op === 0xc2 || op === 0xca) imm = 2;
  else if (op === 0xc8) imm = 3;
  else if (op === 0x9a || op === 0xea) imm = 6;
  else if ((op >= 0x40 && op <= 0x61) || (op >= 0x90 && op <= 0x99) || (op >= 0x9b && op <= 0x9f) || (op >= 0xa4 && op <= 0xa7) || (op >= 0xaa && op <= 0xaf) || [0x06, 0x07, 0x0e, 0x16, 0x17, 0x1e, 0x1f, 0x27, 0x2f, 0x37, 0x3f, 0x6c, 0x6d, 0x6e, 0x6f, 0xc3, 0xc9, 0xcb, 0xcc, 0xce, 0xcf, 0xd6, 0xd7, 0xf4, 0xf5, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd].includes(op)) imm = 0;
  else return null;
  const at = pc;
  pc += imm;
  return { len: pc - start, op, two, modrm, imm: imm === 4 ? mrU32(b, at) | 0 : imm === 1 ? (b[at] > 127 ? b[at] - 256 : b[at]) : 0 };
}
/* The eight registers after an instruction, from those before: known values
   kept where the instruction cannot change them, set where it is xor r, r,
   mov r, imm, mov r, r, inc or dec, and unknown (null) where it may write. */
function mrRegisters(regs, x) {
  const r = regs.slice(), lose = i => { r[i] = null; }, op = x.op, reg = (x.modrm >> 3) & 7, rm = x.modrm & 7, direct = x.modrm >> 6 === 3;
  if (x.two) {
    if ((op >= 0x40 && op <= 0x4f) || [0xaf, 0xb6, 0xb7, 0xbe, 0xbf, 0xbc, 0xbd].includes(op)) lose(reg);
    else if (op >= 0x90 && op <= 0x9f && direct) lose(rm & 3);
    else if (op === 0x31 || op === 0xa2) { lose(0); lose(1); lose(2); lose(3); }
    else if (op >= 0xc8 && op <= 0xcf) lose(op - 0xc8);
    else if ([0xa4, 0xac, 0xa5, 0xad, 0xab, 0xb3, 0xbb, 0xba].includes(op) && direct) lose(rm);
    return r;
  }
  if ((op === 0x33 || op === 0x31 || op === 0x2b || op === 0x29) && direct && reg === rm) { r[reg] = 0; return r; }
  if (op >= 0xb8 && op <= 0xbf) { r[op - 0xb8] = x.imm >>> 0; return r; }
  if (op === 0x8b && direct) { r[reg] = r[rm]; return r; }
  if (op === 0x89 && direct) { r[rm] = r[reg]; return r; }
  if (op >= 0x40 && op <= 0x47) { if (r[op - 0x40] != null) r[op - 0x40]++; return r; }
  if (op >= 0x48 && op <= 0x4f) { if (r[op - 0x48] != null) r[op - 0x48]--; return r; }
  if (op === 0x83 && direct && reg === 0 && r[rm] != null) { r[rm] += x.imm; return r; }
  if (op === 0x83 && direct && reg === 5 && r[rm] != null) { r[rm] -= x.imm; return r; }
  if (op >= 0x58 && op <= 0x5f) { lose(op - 0x58); return r; }
  if (op >= 0x91 && op <= 0x97) { lose(0); lose(op - 0x90); return r; }
  if (op >= 0xb0 && op <= 0xb7) { lose((op - 0xb0) & 3); return r; }
  if (op === 0xe8 || (op === 0xff && reg === 2)) { lose(0); lose(1); lose(2); return r; }
  if (op === 0x99 || op === 0x98) { lose(0); lose(2); return r; }
  if (op >= 0xa4 && op <= 0xaf) { lose(0); lose(1); lose(6); lose(7); return r; }
  if (op === 0x61) { for (let i = 0; i < 8; i++) if (i !== 4) lose(i); return r; }
  if (op === 0xa1) { lose(0); return r; }
  const writesReg = [0x02, 0x03, 0x0a, 0x0b, 0x12, 0x13, 0x1a, 0x1b, 0x22, 0x23, 0x2a, 0x2b, 0x32, 0x33, 0x8a, 0x8b, 0x8d, 0x69, 0x6b, 0x86, 0x87, 0x62, 0x63, 0xc4, 0xc5];
  const writesRm = [0x00, 0x01, 0x08, 0x09, 0x10, 0x11, 0x18, 0x19, 0x20, 0x21, 0x28, 0x29, 0x30, 0x31, 0x88, 0x89, 0xc6, 0xc7, 0x80, 0x81, 0x82, 0x83, 0xc0, 0xc1, 0xd0, 0xd1, 0xd2, 0xd3, 0xfe, 0xff, 0x8f, 0x86, 0x87];
  const byte = [0x02, 0x0a, 0x12, 0x1a, 0x22, 0x2a, 0x32, 0x8a, 0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x88, 0xc6, 0x80, 0x82, 0xc0, 0xd0, 0xd2, 0xfe, 0x86].includes(op);
  if (writesReg.includes(op)) lose(byte ? reg & 3 : reg);
  if (writesRm.includes(op) && direct && !((op === 0x80 || op === 0x81 || op === 0x83) && reg === 7) && !(op === 0xff && reg >= 2)) lose(byte ? rm & 3 : rm);
  if ((op === 0xf6 || op === 0xf7) && reg >= 4) { lose(0); lose(2); }
  else if ((op === 0xf6 || op === 0xf7) && reg >= 2 && direct) lose(op === 0xf6 ? rm & 3 : rm);
  return r;
}
/* The registers at file offset i, decoding from the start of the function
   around it: the nearest offset before, on a 16-byte boundary after padding
   or a return, that opens with a prologue (the SEH frame's mov eax, fs:[0],
   push ebp; mov ebp, esp, or sub esp) and from which instructions run
   exactly to i. Unknown registers
   are null. A branch is not followed, so a value set on one path counts on
   every path after it. */
function mrRegistersAt(exe, i) {
  for (let p = i - (i % 16); p > i - 40000 && p > 0; p -= 16) {
    if (![0xcc, 0xc3, 0x90].includes(exe[p - 1]) && !(exe[p - 3] === 0xc2 && exe[p - 1] === 0)) continue;
    const prologue = (exe[p] === 0x64 && exe[p + 1] === 0xa1 && mrU32(exe, p + 2) === 0) || (exe[p] === 0x55 && exe[p + 1] === 0x8b && exe[p + 2] === 0xec)
      || (exe[p] === 0x83 && exe[p + 1] === 0xec) || (exe[p] === 0x81 && exe[p + 1] === 0xec) || (exe[p] === 0x6a && exe[p + 1] === 0xff && exe[p + 2] === 0x68);
    if (!prologue) continue;
    let pc = p, regs = new Array(8).fill(null), ok = true;
    while (pc < i) {
      const x = mrX86(exe, pc);
      if (!x) { ok = false; break; }
      regs = mrRegisters(regs, x);
      pc += x.len;
    }
    if (ok && pc === i) return regs;
  }
  return new Array(8).fill(null);
}

/* Each .an animation's frames and times, out of zoombini2.exe. A scene makes
   an animated sprite, loads its file with a call whose last push is the
   name, and then adds the frames, each a call with mov ecx, [g], push ms,
   push frame. The name is a .bmp string, whose frames are the .an of the
   same name, or a printf format (f%dattend.bmp) when the scene builds it in
   a buffer first. This runs the instructions after the load (pushes, jumps,
   and cmp and jl for a loop over the frames, stepping over any other
   instruction mrX86 decodes) up to a conditional branch, a return or another
   call, with the registers as the function leaves them at the load
   (mrRegistersAt). Returns [{ name, frames: [[frame, ms]] }], name as
   mrGameFiles keys a file but with .an, and a frame or time it cannot work
   out as null (FUN_00455f70 and FUN_00455f30 in the 2001 Windows build). */
function mrAnTimelines(exe) {
  const { code, text, target } = mrPe(exe);
  const bmp = va => { const t = text(va); return /bmp/i.test(t) && /\.bmp$/i.test(t) ? t : ''; };
  // The last push before a call at i, past mov [g], eax (a3 g), mov ecx,
  // eax (8b c8) and mov ecx, [g] (8b 0d g): its offset, or -1.
  const lastPush = i => {
    let j = i;
    if (exe[j - 5] === 0xa3) j -= 5;
    if (exe[j - 2] === 0x8b && exe[j - 1] === 0xc8) j -= 2;
    else if (exe[j - 6] === 0x8b && exe[j - 5] === 0x0d) j -= 6;
    if (exe[j - 5] === 0x68) return j - 5;
    if (exe[j - 1] >= 0x50 && exe[j - 1] <= 0x57) return j - 1;
    return -1;
  };
  // The load function: the target most called with a .bmp string pushed last,
  // with a frame call next.
  const calls = [], votes = new Map();
  for (const s of code) {
    for (let i = s.raw + 12; i + 5 <= s.raw + s.rsize; i++) {
      if (exe[i] !== 0xe8) continue;
      const p = lastPush(i);
      if (p < 0) continue;
      const t = target(i);
      calls.push({ i, t, p });
      // the first frame comes right after a load: mov ecx, [g]; push; push
      if (exe[p] === 0x68 && bmp(mrU32(exe, p + 1)) && exe[i + 5] === 0x8b && exe[i + 6] === 0x0d) votes.set(t, (votes.get(t) || 0) + 1);
    }
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  if (!best) return [];
  const out = [];
  let frameCall = null;
  for (const { i, p } of calls.filter(c => c.t === best[0])) {
    let name = exe[p] === 0x68 ? bmp(mrU32(exe, p + 1)) : '';
    // a buffer: the nearest .bmp string, or format, pushed or moved into a
    // register in the 300 bytes before, which the scene copies or prints there
    for (let j = p - 1; !name && j > p - 300; j--) if (exe[j] === 0x68 || (exe[j] >= 0xb8 && exe[j] <= 0xbf)) name = bmp(mrU32(exe, j + 1));
    if (!name) continue;
    let regs = mrRegistersAt(exe, i);
    const frames = [], stack = [];
    regs[0] = regs[1] = regs[2] = null;   // the load call may change eax, ecx and edx
    let pc = i + 5, flags = null, steps = 0;
    const s8 = b => (b > 127 ? b - 256 : b);
    while (steps++ < 4000) {
      const op = exe[pc];
      if (op === 0x8b && exe[pc + 1] === 0x0d) { pc += 6; continue; }               // mov ecx, [g]
      if (op === 0xeb) { pc += 2 + s8(exe[pc + 1]); continue; }                     // jmp short
      if (op === 0xe9) { pc += 5 + (mrU32(exe, pc + 1) | 0); continue; }            // jmp
      if (op === 0x6a) { stack.push(s8(exe[pc + 1])); pc += 2; continue; }          // push imm8
      if (op === 0x68) { stack.push(mrU32(exe, pc + 1)); pc += 5; continue; }       // push imm32
      if (op >= 0x50 && op <= 0x57) { stack.push(regs[op - 0x50]); pc += 1; continue; }
      if (op === 0x33 && (exe[pc + 1] & 0xc0) === 0xc0 && ((exe[pc + 1] >> 3) & 7) === (exe[pc + 1] & 7)) { regs[exe[pc + 1] & 7] = 0; pc += 2; continue; }
      if (op >= 0xb8 && op <= 0xbf) { regs[op - 0xb8] = mrU32(exe, pc + 1); pc += 5; continue; }
      if (op >= 0x40 && op <= 0x47) { const r = op - 0x40; if (regs[r] != null) regs[r]++; pc += 1; continue; }
      if (op === 0x83 && (exe[pc + 1] & 0xf8) === 0xf8) { const r = exe[pc + 1] & 7; flags = regs[r] == null ? null : regs[r] - s8(exe[pc + 2]); pc += 3; continue; }
      if (op === 0x81 && (exe[pc + 1] & 0xf8) === 0xf8) { const r = exe[pc + 1] & 7; flags = regs[r] == null ? null : regs[r] - (mrU32(exe, pc + 2) | 0); pc += 6; continue; }
      if (op === 0x7c) { if (flags == null) break; pc = flags < 0 ? pc + 2 + s8(exe[pc + 1]) : pc + 2; continue; }
      if (op === 0xe8 && stack.length >= 2) {
        const t = target(pc);
        if (frameCall == null) frameCall = t;
        if (t !== frameCall) break;
        const frame = stack.pop(), ms = stack.pop();
        frames.push([frame, ms]);
        stack.length = 0;
        pc += 5;
        continue;
      }
      // anything else mrX86 decodes, up to a branch, a return or a call
      const x = mrX86(exe, pc);
      if (!x || x.op === 0xe8 || x.op === 0xc3 || x.op === 0xc2 || (!x.two && x.op >= 0x70 && x.op <= 0x7f) || (x.two && x.op >= 0x80 && x.op <= 0x8f) || (x.op === 0xff && ((x.modrm >> 3) & 7) >= 2 && ((x.modrm >> 3) & 7) <= 5)) break;
      if (x.op === 0xff && ((x.modrm >> 3) & 7) === 6) stack.push(null);
      regs = mrRegisters(regs, x);
      pc += x.len;
    }
    out.push({ name: mrProgramPath(name).replace(/\.bmp$/, '.an'), frames });
  }
  return out;
}
/* The timeline of the .an at key (a path as mrGameFiles keys it) among
   mrAnTimelines' list, by its name or a format whose %d matches, or null. */
function mrAnTimeline(timelines, key) {
  for (const t of timelines) {
    if (t.name === key) return t;
    if (/%/.test(t.name) && new RegExp('^' + t.name.split(/%\d*d/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\d+') + '$').test(key)) return t;
  }
  return null;
}

/* Which voice files of Data/Sounds the program names. Its voices play
   through FUN_00468b40(name), which opens sounds/<name>.wav, so a voice
   the code names has its name, or a printf pattern of it (blw22.%d,
   7-N%1d-%2d), among the program's strings. This reads every string of the
   data sections whose address the code or a table of the data refers to,
   and matches a plain name to the file of that name and a pattern, which
   must start with a letter or digit, to the files it starts. keys are the
   voices as mrGameFiles keys them (sounds/<name>.wav). Returns Map(key ->
   the program's string), without the keys no string names. */
function mrVoicesNamed(exe, keys) {
  const { sections, code } = mrPe(exe);
  const data = sections.filter(s => !s.code);
  const strings = new Map();
  for (const s of data) {
    let start = s.raw;
    for (let i = s.raw; i < s.raw + s.rsize; i++) {
      if (exe[i] !== 0) continue;
      if (i - start >= 3 && i - start < 200) {
        let t = '';
        for (let j = start; j < i; j++) t += String.fromCharCode(exe[j]);
        if (/^[\x20-\x7e]+$/.test(t)) strings.set(s.va + start - s.raw, t);
      }
      start = i + 1;
    }
  }
  const referred = new Set();
  for (const s of [...code, ...data]) for (let i = s.raw; i + 4 <= s.raw + s.rsize; i++) { const v = mrU32(exe, i); if (strings.has(v)) referred.add(v); }
  const names = new Map(), patterns = [];
  for (const a of referred) {
    const t = strings.get(a), base = t.replace(/\\/g, '/').split('/').pop().replace(/\.wav$/i, '');
    if (base.length < 2) continue;
    if (base.includes('%')) {
      if (!/^[A-Za-z0-9][^%]/.test(base)) continue;
      const rx = new RegExp('^' + base.split(/(%-?\d*[ds])/).map(p => /^%-?\d*d$/.test(p) ? `\\s*\\d{1,${(/\d+/.exec(p) || ['3'])[0]}}` : /^%-?\d*s$/.test(p) ? '.+?' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''), 'i');
      patterns.push({ rx, t });
    } else if (!names.has(base.toLowerCase())) names.set(base.toLowerCase(), t);
  }
  const out = new Map();
  for (const k of keys) {
    const n = k.split('/').pop().replace(/\.wav$/i, '');
    if (names.has(n.toLowerCase())) { out.set(k, names.get(n.toLowerCase())); continue; }
    const p = patterns.find(p => p.rx.test(n));
    if (p) out.set(k, p.t);
  }
  return out;
}
/* The place a voice is about, by the letters its name starts with, the
   designers' short names for the places, or undefined. */
const MR_VOICE_LETTERS = [['7-n', 'chez_norf'], ['tur', 'crazy_turtle'], ['wsl', 'waterslide'], ['aqu', 'aquacube'], ['mgw', 'magic_wall'], ['czn', 'chez_norf'], ['mym', 'mystic_marsh'], ['wlf', 'wall_of_fleens'], ['swb', 'snowboard'], ['blp', 'boolies'], ['blw', 'booliewood'], ['bc1', 'rescue1'], ['bc2', 'rescue2'], ['zbv', 'zombiniville'], ['ope', 'zombiniville']];
function mrVoicePlace(key) {
  const n = key.split('/').pop().toLowerCase();
  const m = MR_VOICE_LETTERS.find(([l]) => n.startsWith(l));
  return m ? MR_PLACE_BY_KEY.get(m[1]) : undefined;
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
  mrVoicesNamed, mrVoicePlace,
  mrAnTimelines, mrAnTimeline, mrX86, mrRegisters, mrRegistersAt, mrProgramPath, mrPe,
  mrSoundPlace,
  mrAnmFrameTimes,
  MR_PLACES, MR_PLACE_BY_KEY, MR_LEVELS, MR_PUZZLES, MR_PARTS, MR_ANM_SLOTS,
  mrReadBb, mrReadRb, mrReadAn, mrAnmSlots, mrAnmFrame, mrAnmSlot, mrAnmSlotName, mrAnmViews,
  mrReadBmp, mrReadPat, mrKind, mrIsoFiles, mrGameFiles, mrLooksLike, mrArchiveListing,
};
