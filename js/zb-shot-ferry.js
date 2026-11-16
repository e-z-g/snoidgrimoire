/* zb-shot-ferry.js -- Captain Cajun's Ferryboat read from a screenshot
   (zb-shot.js, "A place's reader").
   =========================================================================
   Needs zb-shot.js and zb-puzzle-ferry.js.

   The raft is one of FERRY's feature scripts SCRB 1510-1529, five for each
   level (zb-puzzle-ferry.js). Its first frame places the seats and its
   second the cargo, each record a shape of tBMP 1500 with its top left
   corner at the record's x and y. The two frames have one record for each
   layer, and a layer is a seat or a piece of cargo, with shape 0 in the
   other frame. zbShotFerry draws each raft that way, compares it with the
   frame where no Zoombini covers it, and reads the raft that fits best.
   The raft gives the level.

   A seated Zoombini stands with its origin at its seat's drop point, 22
   pixels right of the seat's corner and 7 above it. Any other Zoombini is
   on the dock, in the player's hand or on its way back to the dock.

   Nothing at the ferry is hidden, so the reader has no rule to find. It
   gives each pair of seated neighbors that share no trait, which the
   captain never allows and so marks a misread Zoombini, and for each free
   seat how many of the others could sit there as the raft stands.

   WHERE IT CAME FROM
   The rafts, the seats and their neighbors are zb-puzzle-ferry.js's, whose
   header gives the sources. The drop point is the program's (ZOOMBI32.EXE
   at 0x41b4bd, in that header), and two Zoombinis seated in the game on
   15 November 2026 stood exactly there.
*/

/* The rafts' scripts, and a seat's drop point from its corner. */
const ZB_SHOT_FERRY = { first: 1510, count: 20, dropX: 22, dropY: -7 };

/* The raft that fits the frame best where `skip` leaves it in view:
   { script, fit, pieces }, `fit` zbShotDrawingFit's and `pieces` the
   raft's seats and cargo in zbShotDrawing's form, or null where the
   archive has no raft. */
function zbShotFerryRaft(env, skip) {
  const arc = env.arc, sprites = decodeBitmapResource(arc.get('tBMP', ZB_FERRY_SEAT.sheet)).frames;
  let best = null;
  for (let script = ZB_SHOT_FERRY.first; script < ZB_SHOT_FERRY.first + ZB_SHOT_FERRY.count; script++) {
    if (!arc.has('SCRB', script)) continue;
    const frames = parseScript(arc.get('SCRB', script), 'SCRB').frames;
    if (frames.length < 2) continue;
    const pieces = [];
    for (let k = 0; k < frames[0].records.length; k++) {
      for (const r of [frames[0].records[k], frames[1].records[k]]) {
        if (r && r.shape > 0 && sprites[r.shape - 1]) pieces.push({ sprite: sprites[r.shape - 1], x: r.x, y: r.y });
      }
    }
    const fit = zbShotDrawingFit(env, zbShotDrawing(env, pieces), 0, 0, skip);
    if (!best || fit.value > best.fit.value) best = { script, fit, pieces };
  }
  return best;
}

/* The ferry's picture with the raft drawn on it, as 640 x 480 indices,
   for a reading that draws the whole scene, or null where no raft fits
   half its pixels. */
ZB_SHOT_SCENES.FERRY = (env, pixels) => {
  const best = zbShotFerryRaft(env, null);
  if (!best || best.fit.fit < 0.5) return null;
  const out = Uint8Array.from(pixels);
  for (const p of best.pieces) {
    for (let y = 0; y < p.sprite.height; y++) {
      for (let x = 0; x < p.sprite.width; x++) {
        const v = p.sprite.pixels[y * p.sprite.width + x], X = p.x + x, Y = p.y + y;
        if (v && X >= 0 && Y >= 0 && X < ZB_SHOT_W && Y < ZB_SHOT_H) out[Y * ZB_SHOT_W + X] = v;
      }
    }
  }
  return out;
};

/* Captain Cajun's Ferryboat. Returns { script, level, fit, seats,
   seating, dock, clashes, open, zoombinis, state, lines, link }: `script`
   the raft's SCRB and `fit` the share of the raft's pixels in view that
   match, `seats` zbFerryRaft's, `seating` the Zoombini in each seat or
   null, `dock` the others, `clashes` the pairs of seats next to each
   other whose Zoombinis share no trait, and `open` for each free seat how
   many of `dock` share a trait with everyone next to it. `script` is null
   when no raft fits half its pixels. */
function zbShotFerry(frame, zoombinis) {
  const env = zbShotEnv(frame), arc = frame.arc, skip = zbShotCovered(zoombinis);
  const best = zbShotFerryRaft(env, skip);
  const code = z => ZB_SHOT_TRAITS.map(k => z.traits[k] ?? '?').join('');
  if (!best || best.fit.fit < 0.5) {
    for (const z of zoombinis) z.where = '';
    return { script: null, zoombinis, state: { raft: null },
      lines: ['The page could not match the raft to one of the game’s rafts, so it shows no seats.'], link: null };
  }
  const script = best.script, level = Math.floor((script - ZB_SHOT_FERRY.first) / 5) + 1;
  const seats = zbFerryRaft(arc, script), places = zbFerrySeatPlaces(seats), neighbors = zbFerryNeighbors(seats, level);
  const drops = seats.flatMap(s => [s.x + ZB_SHOT_FERRY.dropX, s.y + ZB_SHOT_FERRY.dropY]);
  const seating = new Array(seats.length).fill(null), dock = [];
  for (const z of zoombinis) {
    const k = zbShotPlaceIn(drops, z.x, z.y);
    if (k >= 0 && !seating[k]) {
      seating[k] = z;
      z.where = `in seat ${places[k].seat} of row ${places[k].row}`;
    } else {
      dock.push(z);
      z.where = 'off the raft';
    }
  }
  const share = (a, b) => ZB_SHOT_TRAITS.some(k => a.traits[k] != null && a.traits[k] === b.traits[k]);
  const unread = (a, b) => ZB_SHOT_TRAITS.some(k => a.traits[k] == null || b.traits[k] == null);
  const clashes = [];
  neighbors.forEach((ns, a) => ns.forEach(b => {
    if (a < b && seating[a] && seating[b] && !share(seating[a], seating[b]) && !unread(seating[a], seating[b])) clashes.push([a, b]);
  }));
  /* for each free seat, the Zoombinis off the raft that share a trait
     with everyone next to it */
  const open = [];
  seating.forEach((z, k) => {
    if (z) return;
    const beside = neighbors[k].map(m => seating[m]).filter(Boolean);
    open.push({ seat: k, fitting: dock.filter(d => beside.every(b => share(d, b))).length });
  });
  const seated = seating.filter(Boolean).length, band = [...seating.filter(Boolean), ...dock];
  const rows = Math.max(...places.map(p => p.row)), seat = k => `seat ${places[k].seat} of row ${places[k].row}`;
  const lines = [`The raft is FERRY SCRB ${script}, level ${level}’s raft, ${ZB_LEVELS[level - 1]}, with ${seats.length} seats in ${rows} rows.`
    + ' The page counts rows from the top of the picture and seats from the left.'];
  lines.push(`${seated === 1 ? 'One Zoombini is' : `${seated || 'No'} Zoombinis are`} seated and ${dock.length === 1 ? 'one is' : `${dock.length || 'none'} are`} off the raft.`);
  for (const [a, b] of clashes) {
    lines.push(`The Zoombinis in ${seat(a)} and ${seat(b)} are next to each other and share no trait.`
      + ' The captain allows no such pair, so the page may have misread one of them.');
  }
  if (seated && dock.length && open.length) {
    const closed = open.filter(o => !o.fitting);
    if (!closed.length) lines.push('Every free seat has at least one Zoombini that could sit there now.');
    else {
      lines.push(`No Zoombini off the raft shares a trait with every neighbor of ${zbWordsOr(closed.map(o => seat(o.seat)), 'or')},`
        + ` so ${closed.length === 1 ? 'that seat stays' : 'those seats stay'} free until a neighbor moves.`);
    }
  }
  const complete = band.length > 0 && band.length <= 20 && band.every(z => ZB_SHOT_TRAITS.every(k => z.traits[k] != null));
  /* the solve page deals the raft for the band's size, which is this raft
     when the whole band is in the screenshot */
  const link = complete && zbFerryRaftScript(level, band.length) === script
    ? { hash: `solve=FERRY${level === 1 ? '' : `&level=${level}`}&band=${zbBandCode(band.map(z => z.traits))}`, text: 'Take the raft apart for this band' } : null;
  return { script, level, fit: best.fit.fit, seats, seating, dock, clashes, open, zoombinis: band,
    state: { raft: script, level, seats: seating.map(z => (z ? code(z) : null)), dock: dock.length }, lines, link };
}

/* Every seat's drop point on every raft, for a smoothed reading to try. */
ZB_SHOT_STANDS.FERRY = arc => {
  const seen = new Set(), out = [];
  for (let script = ZB_SHOT_FERRY.first; script < ZB_SHOT_FERRY.first + ZB_SHOT_FERRY.count; script++) {
    if (!arc.has('SCRB', script)) continue;
    for (const s of zbFerryRaft(arc, script)) {
      const x = s.x + ZB_SHOT_FERRY.dropX, y = s.y + ZB_SHOT_FERRY.dropY;
      if (!seen.has(`${x},${y}`)) { seen.add(`${x},${y}`); out.push(x, y); }
    }
  }
  return out;
};

ZB_SHOT_PUZZLES.FERRY = zbShotFerry;
