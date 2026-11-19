/* page-remake-shot.js -- Scenario's "Screenshot" pane for the 2015 remake:
   a screenshot of the remake, given by the visitor, read back by
   js/zb-shot-remake.js. The page finds the scene and each Zoombini's
   traits, and draws the scene with the Zoombinis as it read them beside the
   screenshot.
   =========================================================================

   The reader compares the screenshot with every scene as Places draws it,
   and fits Zoombinis drawn from the character library. So the first
   reading draws every scene, which reads their textures (some hundreds of
   MB from an address). The drawings stay in memory, small, for the next
   screenshot. The screenshot stays in the page and goes nowhere else.

   The page's script: DOM here. LOAD ORDER: after page-shot.js, whose pane
   this one stands in for when the remake is the game shown, and
   page-remake.js. */

let REMAKE_SHOT_LAST = null;     // { name, width, height, read } or { name, error }
let REMAKE_SHOT_SCENES = null;   // [{ n, img }], every scene drawn small
let REMAKE_SHOT_PARTS = null;    // { parts, poses }
const REMAKE_SHOT_SMALL = 144;   // the height the scenes are compared at

REMAKE_SCENARIO_PANES.screenshot = function remakeShotPane(view) {
  view.innerHTML = '<h1>Screenshot</h1>'
    + '<p class="sub">Give the page a screenshot of the remake. It shows the scene and each Zoombini’s traits.</p>'
    + '<div class="shotdrop" id="shotDrop"><label class="btn">Choose a screenshot<input type="file" accept="image/*" id="shotFile" hidden></label>'
    + ' <span class="note">or drop one here, or paste one.</span></div>'
    + '<p class="note">The page reads a screenshot from a phone, a tablet or a computer, at any size, and a picture cut from one. '
    + 'The first reading draws every scene, which reads their pictures, some hundreds of MB from an address, so it lasts a minute or more. '
    + 'A Zoombini mostly hidden behind others, or in the middle of a move, may go unread or read wrong.</p>'
    + '<div id="shotOut"></div>';
  $('shotFile').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) shotTake(f);
  });
  const drop = $('shotDrop');
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('over');
    const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
    if (f) shotTake(f);
  });
  remakeShotShow();
};

/* A canvas's pixels as { rgba, width, height }. */
function remakeShotPixels(c) {
  return { rgba: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

/* Every scene drawn REMAKE_SHOT_SMALL high, those that draw anything. */
async function remakeShotScenes(note) {
  if (REMAKE_SHOT_SCENES) return REMAKE_SHOT_SCENES;
  const cat = await remakeCatalog(), out = [];
  await remakeLayouts();
  for (let n = 0; n < cat.scenes.length; n++) {
    const entry = REMAKE_FILES.get('level' + n);
    if (!entry || !entry.sf) continue;
    note(`Drawing the scenes to compare, ${n + 1} of ${cat.scenes.length}…`);
    const c = document.createElement('canvas');
    try { await remakeDrawScene(c, await remakeScene(entry.name), REMAKE_SHOT_SMALL); } catch (e) { console.error(e); continue; }
    const img = remakeShotPixels(c);
    // A scene that draws nothing at its opening (a menu, a loader) is left out.
    let drawn = 0, all = 0;
    for (let i = 0; i < img.rgba.length; i += 4 * 7, all++) if (img.rgba[i] !== 0x33 || img.rgba[i + 1] !== 0x33 || img.rgba[i + 2] !== 0x44) drawn++;
    if (drawn > all / 3) out.push({ n, img });
  }
  return (REMAKE_SHOT_SCENES = out);
}

/* The Zoombini's parts at each pose the reader tries: the standing pose
   (34front) first, then the front, a blink, the bounce and a walk, from the
   character library's labeled stretches. */
async function remakeShotParts() {
  if (REMAKE_SHOT_PARTS) return REMAKE_SHOT_PARTS;
  const path = 'swf/zoombinis/zmb_characterlibrary.swf', swf = await remakeSwf(path);
  if (!swf || !swf.byClass.zmb_feet_0) throw new Error('the character library, ZMB_CharacterLibrary.swf, is not among the files open');
  const st = Object.fromEntries(remakeClipStretches(swf.byClass.zmb_feet_0).map(s => [s.name, s]));
  const frames = [];
  const add = f => { if (f != null && !frames.includes(f)) frames.push(f); };
  if (st['34front']) add(st['34front'].from);
  if (st.front) add(st.front.from);
  if (st.idle_blink) add(Math.round((st.idle_blink.from + st.idle_blink.to) / 2));
  if (st.idle_bop) for (let f = st.idle_bop.from; f <= st.idle_bop.to; f += 2) add(f);
  const walk = st.walk_34front_angle1;
  if (walk) for (let i = 0; i < 4; i++) add(walk.from + Math.round(i * (walk.to - walk.from + 1) / 4));
  if (!frames.length) add(0);
  const names = Object.keys(swf.byClass).filter(n => /^zmb_feet_\d(_(head|eyes_\d|nose_\d|hair_\d))?$/.test(n));
  const parts = new Map(), poses = [];
  for (const frame of frames) {
    const pose = 'f' + frame;
    poses.push(pose);
    for (const n of names) {
      const clip = swf.byClass[n];
      const steps = await remakeClipSteps(path, swf, [n], Math.min(frame, clip.frames.length - 1)), box = remakeStepsBox(steps);
      if (!box) continue;
      const x0 = Math.floor(box.x0) - 1, y0 = Math.floor(box.y0) - 1;
      const c = document.createElement('canvas');
      c.width = Math.ceil(box.x1) - x0 + 1; c.height = Math.ceil(box.y1) - y0 + 1;
      remakeDrawSteps(c.getContext('2d'), steps, [1, 0, 0, 1, -x0, -y0]);
      parts.set(pose + '/' + n, { ...remakeShotPixels(c), ox: -x0, oy: -y0 });
    }
  }
  return (REMAKE_SHOT_PARTS = { parts, poses });
}

async function remakeShotTake(file) {
  if (SHOT_BUSY) return;
  SHOT_BUSY = true;
  const note = text => { const out = $('shotOut'); if (out) out.innerHTML = `<p class="note">${esc(text)}</p>`; };
  const name = file.name || 'the pasted screenshot';
  note('Reading the screenshot…');
  try {
    const bitmap = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    c.getContext('2d').drawImage(bitmap, 0, 0);
    const img = remakeShotPixels(c);
    const scenes = await remakeShotScenes(note);
    if (!scenes.length) throw new Error('no scene could be drawn from the files open');
    note('Finding the scene…');
    await new Promise(r => setTimeout(r, 30));
    const t = performance.now();
    const place = zbRemakeShotPlace(img.rgba, img.width, img.height, scenes);
    const best = place.ranked[0];
    // The scene again at its full height, for the Zoombinis.
    const full = document.createElement('canvas');
    await remakeDrawScene(full, await remakeScene('level' + best.n));
    const f = full.height / REMAKE_SHOT_SMALL, fit = { x0: best.x0 * f, y0: best.y0 * f, scale: best.scale * f };
    const shot = { rgba: place.trim.rgba, width: place.trim.width, height: place.trim.height };
    const back = zbRemakeShotBackdrop(shot, remakeShotPixels(full), fit);
    note('Reading the Zoombinis…');
    const { parts, poses } = await remakeShotParts();
    await new Promise(r => setTimeout(r, 30));
    const zoombinis = zbRemakeShotZoombinis(shot, back, parts, poses);
    REMAKE_SHOT_LAST = { name, width: img.width, height: img.height, read: { place, best, shot, back, zoombinis, parts }, seconds: (performance.now() - t) / 1000 };
  } catch (e) {
    REMAKE_SHOT_LAST = { name, error: e.message };
    console.error(e);
  } finally {
    SHOT_BUSY = false;
  }
  remakeShotShow();
}

/* The scene with the Zoombinis as read, drawn at the screenshot's size. */
function remakeShotDrawing(r) {
  const { shot, back } = r, W = shot.width, H = shot.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), d = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { d.data[4 * i] = back.bg[3 * i]; d.data[4 * i + 1] = back.bg[3 * i + 1]; d.data[4 * i + 2] = back.bg[3 * i + 2]; d.data[4 * i + 3] = 255; }
  g.putImageData(d, 0, 0);
  for (const z of r.zoombinis) {
    const t = z.traits;
    for (const n of [`zmb_feet_${t.feet}`, `zmb_feet_${t.feet}_head`, `zmb_feet_${t.feet}_eyes_${t.eyes}`, `zmb_feet_${t.feet}_nose_${t.nose}`, `zmb_feet_${t.feet}_hair_${t.hair}`]) {
      const p = r.parts.get(z.pose + '/' + n);
      if (!p) continue;
      const pc = document.createElement('canvas');
      pc.width = p.width; pc.height = p.height;
      pc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height), 0, 0);
      g.setTransform(z.flip ? -z.k : z.k, 0, 0, z.k, z.x, z.y);
      g.drawImage(pc, -p.ox, -p.oy);
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

async function remakeShotShow() {
  const out = $('shotOut');
  if (!out || !REMAKE_SHOT_LAST) return;
  const L = REMAKE_SHOT_LAST;
  if (L.error) { out.innerHTML = `<p class="bad">The page could not read ${esc(L.name)} (${esc(L.error)}).</p>`; return; }
  const r = L.read, b = r.best, next = r.place.ranked[1];
  const names = await remakeTraitNames();
  const trimmed = r.shot.width !== L.width || r.shot.height !== L.height;
  let html = `<h2>${esc(L.name)}</h2><p>The screenshot is ${L.width} × ${L.height}${trimmed ? `, ${r.shot.width} × ${r.shot.height} without its plain bars` : ''}.`
    + ` The scene is <a href="#scenario/places/${b.n}">${esc(remakeSceneTitle(b.n))}</a>, matched at ${b.score.toFixed(2)}${next && next.score != null ? `, where the next best, ${esc(remakeSceneTitle(next.n))}, matches at ${next.score.toFixed(2)}` : ''}.`
    + ` The screenshot shows ${Math.round(100 * Math.min(1, r.shot.width * b.scale / (REMAKE_SHOT_SMALL * 16 / 9)))}% of the scene’s width.`
    + ` ${r.zoombinis.length ? `The page found ${plural(r.zoombinis.length, 'Zoombini')}.` : 'The page found no Zoombinis.'}`
    + ` <span class="note">${L.seconds.toFixed(1)} s</span></p>`;
  html += '<div class="wide" id="shotFrame"></div>';
  const word = (t, v) => (names[t] && names[t][v]) ? names[t][v].replace(/_/g, ' ') : `${t} ${v}`;
  html += '<div class="wide"><table class="plain"><tr><th></th><th>x</th><th>y</th><th>hair</th><th>eyes</th><th>nose</th><th>feet</th><th>facing</th></tr>';
  r.zoombinis.forEach((z, i) => {
    html += `<tr><td class="num">${i + 1}</td><td class="num">${Math.round(z.x)}</td><td class="num">${Math.round(z.y)}</td>`
      + ['hair', 'eyes', 'nose', 'feet'].map(t => `<td>${esc(word(t, z.traits[t]))}</td>`).join('')
      + `<td>${z.flip ? 'left' : 'right'}</td></tr>`;
  });
  html += '</table></div><p class="note">Beside the screenshot is the scene as the page draws it, with each Zoombini as read. The numbers mark the Zoombinis in the table.</p>';
  out.innerHTML = html;
  const frame = $('shotFrame'), drawing = remakeShotDrawing(r), g = drawing.getContext('2d');
  g.font = `bold ${Math.max(12, Math.round(r.shot.height / 40))}px sans-serif`;
  g.textAlign = 'center';
  r.zoombinis.forEach((z, i) => {
    g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = '#ff0';
    g.strokeText(String(i + 1), z.x, z.y - 125 * z.k); g.fillText(String(i + 1), z.x, z.y - 125 * z.k);
  });
  const shotCanvas = document.createElement('canvas');
  shotCanvas.width = r.shot.width; shotCanvas.height = r.shot.height;
  shotCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.shot.rgba), r.shot.width, r.shot.height), 0, 0);
  for (const c of [shotCanvas, drawing]) { c.style.maxWidth = '49%'; c.style.marginRight = '1%'; frame.appendChild(c); }
}
