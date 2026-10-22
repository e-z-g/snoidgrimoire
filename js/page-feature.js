/* page-feature.js -- a feature script played: its sheet's sprites put where
   each tick has them, over the room (js/zb-feature.js has how the page
   picks the sheet, and why that rule follows the numbering, not the
   program).
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-browse.js. */

const FEATURE_PICK = { room: true, sound: false, zoom: 1 };

/* What a feature script needs to be drawn, or null: { sheet, frames, regs,
   placed }. The decoded sheets are kept, an archive's at a time. */
const FEATURE_DECODED = new WeakMap();
function featureDrawn(arc, id, script) {
  const sheet = zbFeatureSheet(arc, id, script);
  if (!sheet) return null;
  if (!FEATURE_DECODED.has(arc)) FEATURE_DECODED.set(arc, new Map());
  const kept = FEATURE_DECODED.get(arc);
  if (!kept.has(sheet.id)) {
    const frames = decodeBitmapResource(arc.get('tBMP', sheet.id)).frames;
    kept.set(sheet.id, { frames, regs: regsFor(arc, frames.length) });
  }
  const { frames, regs } = kept.get(sheet.id);
  return { sheet, frames, regs, placed: zbFeaturePlaced(script, frames, regs) };
}

function featurePlayer(entry, arc, id, script, box) {
  const d = featureDrawn(arc, id, script);
  if (!d || !d.placed.box) { box.innerHTML = `<p class="note">${d ? 'Its shapes are empty sprites: nothing is drawn.' : 'No tick draws a shape.'}</p>`; return; }
  const { placed, frames, regs, sheet } = d, b = placed.box;
  const room = roomPicture(arc, entry.name);
  const inRoom = room != null && b.x1 > 0 && b.y1 > 0 && b.x0 < 640 && b.y0 < 480;
  const onRoom = inRoom && FEATURE_PICK.room, zoom = FEATURE_PICK.zoom;
  const pal = paletteFor(entry, arc, onRoom ? room : sheet.id).pal;
  const pad = 16;
  const x0 = onRoom ? Math.max(0, Math.min(b.x0 - pad, 640 - 1)) : b.x0, y0 = onRoom ? Math.max(0, Math.min(b.y0 - pad, 480 - 1)) : b.y0;
  const x1 = onRoom ? Math.min(640, Math.max(b.x1 + pad, 1)) : b.x1, y1 = onRoom ? Math.min(480, Math.max(b.y1 + pad, 1)) : b.y1;
  box.innerHTML = `<p class="note">Drawn with <a href="${link(entry.name, 'tBMP', sheet.id)}">tBMP ${sheet.id}</a>, the last sheet numbered at or below the script: a rule of the disc’s numbering, which holds for every feature script on it, not something read from the program. `
    + (regs ? `Each sprite’s registration point (<a href="${link(entry.name, 'REGS', regs.id)}">REGS ${regs.id}</a>) is put at its record’s x and y.` : 'The sheet has no registration points; each sprite’s corner is put at its record’s x and y.')
    + ` It draws within (${b.x0}, ${b.y0}) to (${b.x1}, ${b.y1})${inRoom ? '' : room != null ? ', outside the room' : ''}.</p>`
    + `<div class="tools"><button id="featPlay">Pause</button><button id="featStep">Step</button>`
    + `<input id="featAt" type="range" min="0" max="${placed.ticks.length - 1}" value="0"><span id="featTick" class="note"></span>`
    + (inRoom ? `<label><input type="checkbox" id="featRoom"${FEATURE_PICK.room ? ' checked' : ''}> Over its room</label>` : '')
    + (script.frames.some(f => f.sound > 0) ? `<label><input type="checkbox" id="featSound"${FEATURE_PICK.sound ? ' checked' : ''}> Sound</label>` : '')
    + `<label>Zoom <select id="featZoom">${[1, 2, 3, 4].map(n => `<option${n === zoom ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`
    + '<div class="picture feature"></div>';
  const c = document.createElement('canvas');
  c.width = (x1 - x0) * zoom; c.height = (y1 - y0) * zoom; c.className = 'px';
  box.querySelector('.feature').appendChild(c);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const back = onRoom ? indexedCanvas(decodeBitmapResource(arc.get('tBMP', room)).frames[0], pal, false) : null;
  const sprites = new Map();
  const sprite = n => { if (!sprites.has(n)) sprites.set(n, indexedCanvas(frames[n - 1], pal, true)); return sprites.get(n); };
  let at = 0, playing = true;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    if (back) g.drawImage(back, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    for (const s of placed.ticks[at]) if (s.width && s.height) g.drawImage(sprite(s.shape), (s.x - x0) * zoom, (s.y - y0) * zoom, s.width * zoom, s.height * zoom);
    $('featAt').value = at;
    const f = script.frames[at];
    $('featTick').textContent = `tick ${at}` + (placed.ticks[at].length ? '' : ', nothing drawn') + (f.event ? `, event 0x${f.end.toString(16)}` : '');
  };
  const sound = () => {
    const snd = script.frames[at].sound;
    if (FEATURE_PICK.sound && snd > 0) snoidPlaySound(arc.has('\0SND', snd) ? entry.name : 'ZOOMBINI', snd);
  };
  const step = () => { at = (at + 1) % placed.ticks.length; draw(); sound(); };
  draw(); sound();
  const timer = setInterval(() => { if (!c.isConnected) return clearInterval(timer); if (playing) step(); }, SNOID_TICK_MS);
  $('featPlay').addEventListener('click', () => { playing = !playing; $('featPlay').textContent = playing ? 'Pause' : 'Play'; });
  $('featStep').addEventListener('click', () => { playing = false; $('featPlay').textContent = 'Play'; step(); });
  $('featAt').addEventListener('input', () => { playing = false; $('featPlay').textContent = 'Play'; at = +$('featAt').value; draw(); });
  const again = () => { clearInterval(timer); featurePlayer(entry, arc, id, script, box); };
  if ($('featRoom')) $('featRoom').addEventListener('change', e => { FEATURE_PICK.room = e.target.checked; again(); });
  if ($('featSound')) $('featSound').addEventListener('change', e => { FEATURE_PICK.sound = e.target.checked; });
  $('featZoom').addEventListener('change', e => { FEATURE_PICK.zoom = +e.target.value; again(); });
}
