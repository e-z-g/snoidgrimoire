/* page-remake.js -- the 2015 remake in Scenario and Components, laid out as
   the 1996 game's panes are (zbEdition in page-tabs.js picks which game).
   Scenario's Places are the remake's scenes, each drawn as it opens
   (zb-remake-scene.js), its Puzzles are the rules read from the remake's
   code (zb-remake-puzzles.js), its Snoids are a Zoombini and a Fleen built
   from the uniSWF character libraries and played (zb-uniswf.js), and its
   town is Zoombiniville's scene and its four backdrops. Components'
   Pictures, Sprite sheets, Sounds, Music and Text gather the remake's
   textures, sprites and clips, sounds and text assets across every file
   open. The 1996 panes without a counterpart (Screenshot, Palettes,
   Cursors, Scripts and Walks) do not show for the remake.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-unity.js. */

const ZB_REMAKE_TABS = {
  scenario: { name: 'Scenario', subs: [['places', 'Places'], ['puzzles', 'Puzzles'], ['snoids', 'Snoids'], ['town', 'The town']] },
  components: { name: 'Components', subs: [['pictures', 'Pictures'], ['sheets', 'Sprite sheets'], ['sounds', 'Sounds'], ['music', 'Music'], ['text', 'Text']] },
};

function remakeIsOpen() { return [...REMAKE_FILES.values()].some(e => e.sf); }

/* What the panes read from the files, dropped when more files open. */
function remakeForget() {
  REMAKE_PATHS = null; REMAKE_LAYERS = null; REMAKE_TRAIT_NAMES = null;
  REMAKE_SCENES.clear(); REMAKE_SWFS.clear();
}

/* "AllergicCliffs" as "Allergic Cliffs". */
const remakeWords = name => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
function remakeSceneTitle(n) {
  const p = REMAKE_CATALOG && REMAKE_CATALOG.scenes[n];
  return p ? remakeWords(p.split('/').pop().replace(/\.unity$/, '')) : `Scene ${n}`;
}

/* An object of a file by its path id, from a map made the first time. */
function remakeObj(entry, id) {
  if (!entry.byId) entry.byId = new Map(entry.sf.objects.map(o => [o.pathId, o]));
  return entry.byId.get(id) || null;
}

/* Every object of a class in the open files: { entry, obj, path }, path
   being its Resources path or null. */
function remakeAll(classId) {
  const out = [];
  for (const entry of REMAKE_FILES.values()) {
    if (!entry.sf) continue;
    for (const obj of entry.sf.objects) if (obj.classId === classId)
      out.push({ entry, obj, path: REMAKE_CATALOG && REMAKE_CATALOG.byObject.get(entry.name + '/' + obj.pathId) || null });
  }
  return out;
}
/* A list grouped by its Resources folder, or by its file and scene. */
function remakeGrouped(list) {
  const groups = new Map();
  for (const it of list) {
    const cut = it.path ? it.path.lastIndexOf('/') : -1;
    const scene = remakeSceneName(it.entry.name);
    const g = it.path ? (cut < 0 ? 'Resources' : 'Resources/' + it.path.slice(0, cut)) : scene ? `${it.entry.name}, the scene ${scene}` : it.entry.name;
    it.name = it.path ? it.path.slice(cut + 1) : null;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  return [...groups].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
}

/* The Resources assets at a path, in lower case as the catalog has them. */
let REMAKE_PATHS = null;
function remakeAtPath(p, classId) {
  if (!REMAKE_PATHS || REMAKE_PATHS.size === 0) {
    REMAKE_PATHS = new Map();
    for (const [key, path] of (REMAKE_CATALOG && REMAKE_CATALOG.byObject) || []) {
      const cut = key.lastIndexOf('/'), entry = REMAKE_FILES.get(key.slice(0, cut));
      const obj = entry && entry.sf && remakeObj(entry, +key.slice(cut + 1));
      if (!obj) continue;
      if (!REMAKE_PATHS.has(path)) REMAKE_PATHS.set(path, []);
      REMAKE_PATHS.get(path).push({ entry, obj });
    }
  }
  return (REMAKE_PATHS.get(p.toLowerCase()) || []).find(x => x.obj.classId === classId) || null;
}

/* A texture as a canvas, or null where its format is not decoded or its
   file is not open. The page decodes each texture one time and reuses the
   canvas. */
const REMAKE_CANVASES = new Map();
function remakeTextureCanvas(entry, obj) {
  const k = entry.name + '/' + obj.pathId;
  if (!REMAKE_CANVASES.has(k)) REMAKE_CANVASES.set(k, (async () => {
    const tex = await remakeObject(entry, obj);
    if (!tex.m_Width || !tex.m_Height) return null;
    const img = await remakeTextureImage(tex);
    return img ? remakeCanvas(img) : null;
  })().catch(() => null));
  return REMAKE_CANVASES.get(k);
}

/* A sprite's texture canvas and quad (zbSceneSpriteQuad), or null. */
async function remakeSpriteParts(entry, obj) {
  const sp = await remakeObject(entry, obj), t = remakeTarget(entry, sp.m_RD.texture);
  if (!t) return null;
  const tex = await remakeObject(t.entry, t.obj), canvas = await remakeTextureCanvas(t.entry, t.obj);
  return canvas ? { sprite: sp, canvas, quad: zbSceneSpriteQuad(sp, tex.m_Height) } : null;
}
/* A sprite cut out onto a new canvas. */
async function remakeSpriteCanvas(entry, obj) {
  const parts = await remakeSpriteParts(entry, obj).catch(() => null);
  if (!parts) return null;
  const [x, y, w, h] = parts.quad.src.map(Math.round), c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.className = 'px';
  c.getContext('2d').drawImage(parts.canvas, x, y, w, h, 0, 0, w, h);
  return c;
}
/* A copy of a cached canvas, since a canvas shows in one place at a time. */
function remakeCopy(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.className = 'px';
  c.getContext('2d').drawImage(canvas, 0, 0);
  return c;
}

/* ---- uniSWF clips ------------------------------------------------------------ */

/* A .swf by the path a MovieClipBehaviour gives
   (swf/Zoombinis/ZMB_CharacterLibrary.swf). Its TextAsset is at
   <path>/<file name> in Resources, and the page reads each .swf one time. */
const REMAKE_SWFS = new Map();
function remakeSwf(swfPath) {
  const k = swfPath.toLowerCase();
  if (!REMAKE_SWFS.has(k)) REMAKE_SWFS.set(k, (async () => {
    const at = remakeSwfAsset(k);
    if (!at) return null;
    const v = await remakeObject(at.entry, at.obj);
    return zbUniSwfRead(v.m_Script);
  })().catch(e => { console.error(e); return null; }));
  return REMAKE_SWFS.get(k);
}
/* The .swf path of a .swf TextAsset, from its Resources path. */
function remakeSwfPathOf(entry, obj) {
  const p = REMAKE_CATALOG && REMAKE_CATALOG.byObject.get(entry.name + '/' + obj.pathId);
  return p ? p.slice(0, p.lastIndexOf('/')) : null;
}
/* A .swf's TextAsset, { entry, obj }, or null. */
function remakeSwfAsset(swfPath) {
  const k = swfPath.toLowerCase();
  return remakeAtPath(k + '/' + k.split('/').pop(), 49);
}
/* A clip's atlas, <path>/<file name>_<texture> in Resources. */
function remakeSwfAtlas(swfPath, texture) {
  const at = remakeAtPath(swfPath + '/' + zbUniSwfAtlasName(swfPath, texture), 28);
  return at ? remakeTextureCanvas(at.entry, at.obj) : Promise.resolve(null);
}

/* A frame of clips as steps with their atlases: [{ canvas, src, matrix,
   alpha, blend }], each matrix from the atlas's pixels to the clips'
   space. Several clips drawn at one origin (a Zoombini's five parts) are
   steps one after another. */
async function remakeClipSteps(swfPath, swf, symbols, frame) {
  const steps = [];
  for (const symbol of symbols) {
    const clip = swf.byClass[symbol];
    if (!clip) continue;
    for (const op of zbUniSwfFrame(swf, symbol, Math.min(frame, clip.frames.length - 1))) {
      if (op.mask) continue;
      const canvas = await remakeSwfAtlas(swfPath, op.texture);
      if (!canvas) continue;
      steps.push({ canvas, src: op.src, alpha: op.multiply[3], blend: op.blend,
        matrix: zbSceneMul(op.matrix, [op.quad.w / op.src.w, 0, 0, op.quad.h / op.src.h, 0, 0]) });
    }
  }
  return steps;
}
function remakeDrawSteps(ctx, steps, base) {
  for (const s of steps) {
    ctx.setTransform(...zbSceneMul(base, s.matrix));
    ctx.globalAlpha = s.alpha;
    ctx.globalCompositeOperation = s.blend === 1 ? 'lighter' : 'source-over';
    ctx.drawImage(s.canvas, s.src.x, s.src.y, s.src.w, s.src.h, 0, 0, s.src.w, s.src.h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
/* The box around steps, in the clips' space. */
function remakeStepsBox(steps) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of steps) for (const [u, v] of [[0, 0], [s.src.w, 0], [0, s.src.h], [s.src.w, s.src.h]]) {
    const m = s.matrix, x = m[0] * u + m[2] * v + m[4], y = m[1] * u + m[3] * v + m[5];
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x0 < x1 ? { x0, y0, x1, y1 } : null;
}

/* A clip's labeled stretches, { name, from, to } with frames from 0. A
   label runs to its "_end" label, or else to the frame before the next. */
function remakeClipStretches(clip) {
  const labels = Object.entries(clip.labels || {}).sort((a, b) => a[1] - b[1]);
  const out = [];
  labels.forEach(([name, frame], i) => {
    if (/_end$/.test(name)) return;
    const end = clip.labels[name + '_end'] || (labels[i + 1] ? labels[i + 1][1] - 1 : clip.frames.length);
    out.push({ name, from: frame - 1, to: Math.max(frame - 1, end - 1) });
  });
  if (!out.length) out.push({ name: 'all', from: 0, to: clip.frames.length - 1 });
  return out;
}

/* A player for clips drawn together: a canvas, a choice of stretch, and
   play and pause. parts() gives the clips' names, and changes when the
   visitor picks other traits. The view fits the whole stretch. */
function remakeClipPlayer(box, swfPath, swf, parts, size = 320) {
  box.innerHTML = '<div class="tools"><select class="stretch"></select><button class="play">Pause</button><span class="note at"></span></div>';
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.className = 'clip';
  box.appendChild(c);
  const ctx = c.getContext('2d'), sel = box.querySelector('.stretch'), btn = box.querySelector('.play'), at = box.querySelector('.at');
  let stretches = [], frame = 0, base = null, playing = true, drawing = false, token = 0;
  const refill = () => {
    const clip = swf.byClass[parts()[0]];
    stretches = clip ? remakeClipStretches(clip) : [];
    const before = sel.value;
    sel.innerHTML = stretches.map(s => `<option value="${esc(s.name)}">${esc(s.name)} (${s.to - s.from + 1})</option>`).join('');
    // The stretch shown first is an idle, or else the longest.
    const first = stretches.find(s => /^idle/.test(s.name) && s.to > s.from) || stretches.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    if (stretches.some(s => s.name === before)) sel.value = before;
    else if (first) sel.value = first.name;
    frame = (stretches.find(s => s.name === sel.value) || stretches[0] || { from: 0 }).from;
    base = null;
  };
  const draw = async () => {
    const s = stretches.find(x => x.name === sel.value) || stretches[0];
    if (!s || drawing) return;
    drawing = true;
    const asked = token;
    try {
      const steps = await remakeClipSteps(swfPath, swf, parts(), frame);
      if (asked !== token) return;
      if (!base) {
        // The box around the stretch, from up to 24 of its frames.
        const sampled = [];
        for (let f = s.from; f <= s.to; f += Math.max(1, Math.ceil((s.to - s.from + 1) / 24))) sampled.push(...await remakeClipSteps(swfPath, swf, parts(), f));
        const b = remakeStepsBox(sampled) || { x0: -50, y0: -100, x1: 50, y1: 0 };
        const k = Math.min(2, (size - 20) / Math.max(b.x1 - b.x0, b.y1 - b.y0));
        base = [k, 0, 0, k, size / 2 - k * (b.x0 + b.x1) / 2, size / 2 - k * (b.y0 + b.y1) / 2];
      }
      ctx.clearRect(0, 0, size, size);
      remakeDrawSteps(ctx, steps, base);
      at.textContent = `frame ${frame + 1}`;
      if (playing) frame = frame >= s.to ? s.from : frame + 1;
    } finally { drawing = false; }
  };
  sel.addEventListener('change', () => { token++; frame = (stretches.find(s => s.name === sel.value) || { from: 0 }).from; base = null; draw(); });
  btn.addEventListener('click', () => { playing = !playing; btn.textContent = playing ? 'Pause' : 'Play'; });
  refill();
  // Flash's 30 frames a second. The loop ends when the canvas leaves the page.
  const timer = setInterval(() => { if (!c.isConnected) clearInterval(timer); else if (playing) draw(); }, 1000 / 30);
  draw();
  return { changed() { token++; refill(); draw(); } };
}

/* A .swf TextAsset's view in Data: its clips, and a player for one. */
async function remakeSwfView(body, entry, obj, v) {
  const swfPath = remakeSwfPathOf(entry, obj);
  const swf = zbUniSwfRead(v.m_Script);
  const clips = Object.keys(swf.byClass).filter(k => swf.byClass[k].kind === 'clip').sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  body.innerHTML = `<p>A uniSWF file, with ${plural(clips.length, 'named clip')}${swfPath ? '' : '. Its Resources path is not known, so its atlases are not found'}.</p>`
    + `<div class="tools"><select class="clipname">${clips.map(k => `<option>${esc(k)}</option>`).join('')}</select></div><div class="player"></div>`;
  if (!swfPath || !clips.length) return;
  const pick = body.querySelector('.clipname');
  const player = remakeClipPlayer(body.querySelector('.player'), swfPath, swf, () => [pick.value]);
  pick.addEventListener('change', () => player.changed());
}

/* ---- scenes ------------------------------------------------------------------ */

/* The accessor zbRemakeScene reads the open files through. */
const REMAKE_SCENE_API = {
  objects: name => REMAKE_FILES.get(name).sf.objects,
  async read(name, id) {
    const entry = REMAKE_FILES.get(name), obj = remakeObj(entry, id), v = await remakeObject(entry, obj);
    if (obj.classId !== 114 || !v) return v;
    const script = await remakeScriptClass(entry, v.m_Script).catch(() => null), layouts = await remakeLayouts();
    if (script && layouts) {
      try { Object.assign(v, zbUnityScriptFields(layouts, script, v.rest, entry.sf.little)); } catch (e) { /* the header only */ }
    }
    return v;
  },
  target(name, pptr) {
    const t = remakeTarget(REMAKE_FILES.get(name), pptr);
    return t ? { file: t.entry.name, pathId: t.obj.pathId } : null;
  },
};
let REMAKE_LAYERS = null;
async function remakeSortingLayers() {
  if (REMAKE_LAYERS) return REMAKE_LAYERS;
  const gg = REMAKE_FILES.get('globalgamemanagers'), tm = gg && gg.sf && gg.sf.objects.find(o => o.classId === 78);
  REMAKE_LAYERS = tm ? (await remakeObject(gg, tm)).m_SortingLayers || [] : [];
  return REMAKE_LAYERS;
}
const REMAKE_SCENES = new Map();
function remakeScene(file, root = null) {
  const k = file + '/' + root;
  if (!REMAKE_SCENES.has(k)) REMAKE_SCENES.set(k, remakeSortingLayers().then(l => zbRemakeScene(file, REMAKE_SCENE_API, l, root)));
  return REMAKE_SCENES.get(k);
}

/* A scene drawn on a canvas H pixels high: 16:9 around its camera, or,
   with no camera (a prefab), around what it draws. Returns what was left
   out, { sprites, clips }. */
async function remakeDrawScene(canvas, scene, H = 768) {
  const missed = { sprites: 0, clips: 0 };
  // Every texture is decoded first, and then everything is drawn in order.
  const steps = [];
  for (const it of scene.items) {
    if (it.kind === 'sprite') {
      const entry = REMAKE_FILES.get(it.file), parts = entry && await remakeSpriteParts(entry, remakeObj(entry, it.pathId)).catch(() => null);
      if (!parts) { missed.sprites++; continue; }
      const q = parts.quad, [x0, y0, x1, y1] = q.dst;
      let m = it.matrix;
      if (it.flipX) m = zbSceneMul(m, [-1, 0, 0, 1, 0, 0]);
      if (it.flipY) m = zbSceneMul(m, [1, 0, 0, -1, 0, 0]);
      steps.push([{ canvas: parts.canvas, src: { x: q.src[0], y: q.src[1], w: q.src[2], h: q.src[3] }, alpha: it.color ? it.color.a : 1, blend: 0,
        matrix: zbSceneMul(m, [(x1 - x0) / q.src[2], 0, 0, -(y1 - y0) / q.src[3], x0, y1]) }]);
    } else {
      const swf = await remakeSwf(it.swf);
      const clip = swf && swf.byClass[it.symbol];
      if (!clip) { missed.clips++; continue; }
      let f = it.frame ? it.frame - 1 : 0;
      if (it.label && clip.labels && clip.labels[it.label]) f = clip.labels[it.label] - 1;
      const s = await remakeClipSteps(it.swf.toLowerCase(), swf, [it.symbol], Math.max(0, f));
      steps.push(s.map(x => ({ ...x, matrix: zbSceneMul(it.matrix, x.matrix) })));
    }
  }
  let W, view;
  if (scene.camera) {
    const cam = scene.camera, k = H / (2 * cam.size);
    W = Math.round(H * 16 / 9);
    view = [k, 0, 0, -k, W / 2 - cam.x * k, H / 2 + cam.y * k];
  } else {
    const b = remakeStepsBox(steps.flat()) || { x0: 0, y0: 0, x1: 1, y1: 1 }, k = H / (b.y1 - b.y0);
    W = Math.max(1, Math.round((b.x1 - b.x0) * k));
    view = [k, 0, 0, -k, -b.x0 * k, b.y1 * k];
  }
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#334';
  ctx.fillRect(0, 0, W, H);
  for (const s of steps) remakeDrawSteps(ctx, s, view);
  return missed;
}

/* ---- Scenario ---------------------------------------------------------------- */

const REMAKE_NOT_OPEN = '<p class="note">No remake files are open. Drop the remake’s Zoombinis.app or its Android APKs on the page, or open them from the start page.</p>';

const REMAKE_SCENARIO_PANES = {
  async places(view, item) {
    const cat = await remakeCatalog();
    if (item != null) return remakePlacePage(view, +item);
    let html = `<h1>Places</h1><p class="sub">The remake’s ${plural(cat.scenes.length, 'scene')}, in the order of its build settings. Scene n is the file level<i>n</i>. Its <a href="#remake/@resources">Resources</a> have ${plural(cat.byObject.size, 'asset')} that the scenes load by path.</p>`
      + '<div class="wide"><table class="plain"><tr><th></th><th>scene</th><th>file</th><th>objects</th><th>scripts</th></tr>';
    cat.scenes.forEach((p, i) => {
      const e = REMAKE_FILES.get('level' + i), open = e && e.sf;
      const monos = open ? e.sf.objects.filter(o => o.classId === 114).length : 0;
      html += `<tr><td class="num">${i}</td><td>${open ? `<a href="#scenario/places/${i}">${esc(remakeSceneTitle(i))}</a>` : esc(remakeSceneTitle(i))}</td><td>${open ? `<a href="${remakeLink(e.name)}">level${i}</a>` : `level${i} <span class="note">not open</span>`}</td><td class="num">${open ? e.sf.objects.length.toLocaleString() : ''}</td><td class="num">${open ? monos.toLocaleString() : ''}</td></tr>`;
    });
    view.innerHTML = html + '</table></div>';
  },

  puzzles(view) {
    let html = '<h1>Puzzles</h1><p class="sub">The twelve puzzles as the remake deals them, read from its code and its stored data. Nobody has checked these readings against play. The trait values have the 1996 names.</p>';
    const scenes = REMAKE_CATALOG ? REMAKE_CATALOG.scenes.map(p => p.split('/').pop().replace(/\.unity$/, '').toLowerCase()) : [];
    for (const [key, P] of Object.entries(ZB_REMAKE_PUZZLES)) {
      const name = P.name.replace(/[^A-Za-z]/g, '').toLowerCase(), scene = scenes.findIndex(s => s.length > 4 && (name.includes(s) || s.includes(name.slice(0, 10))));
      html += `<details class="sec"><summary><b>${esc(P.name)}</b> <span class="note">${esc(key)}</span></summary>`
        + P.levels.map((l, i) => `<p><b>Level ${i + 1}, ${esc(ZB_LEVELS[i])}.</b> ${l.map(esc).join(' ')} <span class="note">${esc(P.chances[i])}</span></p>`).join('')
        + (P.differs && P.differs.length ? `<p><b>Against 1996.</b> ${P.differs.map(esc).join(' ')}</p>` : '')
        + (P.unread && P.unread.length ? `<p class="note">${P.unread.map(esc).join(' ')}</p>` : '')
        + `<p class="note">${scene >= 0 && REMAKE_FILES.has('level' + scene) ? `<a href="#scenario/places/${scene}">The scene</a> · ` : ''}<a href="#solve=${key}">The 1996 puzzle taken apart</a></p></details>`;
    }
    view.innerHTML = html;
  },

  async snoids(view) {
    view.innerHTML = '<h1>Snoids</h1><p class="sub">The remake draws its Zoombinis and Fleens with uniSWF, Flash animations turned into clips and atlases. A Zoombini is five clips drawn at one origin, one for the feet and shadow, then the head, the eyes, the nose and the hair, all on the same frame. The trait names are the remake’s, from the sprites of Bubblewonder Abyss’s arrows. The numbers are the remake’s, from 0, not 1996’s.</p><div id="snoidBox"><p class="note">Reading the character libraries…</p></div>';
    await remakeCatalog();
    const box = $('snoidBox'), names = await remakeTraitNames();
    box.innerHTML = '';
    for (const K of REMAKE_SNOIDS) {
      const swf = await remakeSwf(K.swf);
      const sec = document.createElement('section');
      sec.innerHTML = `<h2 class="h">${esc(K.title)}</h2>`;
      box.appendChild(sec);
      if (!swf) { sec.insertAdjacentHTML('beforeend', `<p class="note">${esc(K.swf)} is not among the files open.</p>`); continue; }
      const pick = document.createElement('div');
      pick.className = 'tools';
      pick.innerHTML = K.traits.map(t => `<label>${t} <select data-trait="${t}">${[0, 1, 2, 3, 4].filter(v => swf.byClass[K.part(t, v)]).map(v => `<option value="${v}">${v} ${K.named ? esc((names[t] || [])[v] || '') : ''}</option>`).join('')}</select></label>`).join(' ');
      sec.appendChild(pick);
      const value = t => { const s = pick.querySelector(`[data-trait="${t}"]`); return s && s.value !== '' ? +s.value : 0; };
      const holder = document.createElement('div');
      sec.appendChild(holder);
      const player = remakeClipPlayer(holder, K.swf.toLowerCase(), swf, () => K.parts(value('feet'), value('eyes'), value('nose'), value('hair')).filter(p => swf.byClass[p]));
      pick.addEventListener('change', () => player.changed());
      const at = remakeSwfAsset(K.swf);
      if (at) sec.insertAdjacentHTML('beforeend', `<p class="note">From <a href="${remakeLink(at.entry.name, at.obj.pathId)}">${esc(K.swf)}</a>, with ${plural(Object.keys(swf.byClass).length, 'named clip')}.</p>`);
    }
  },

  async town(view) {
    view.innerHTML = '<h1>The town</h1><p class="sub">Zoombiniville, where the band ends up. The remake shows it from four sides. Each side is a backdrop that the town’s code loads from Resources, with the buildings and Zoombinis that the scene places over it.</p><div id="townBox"></div>';
    const cat = await remakeCatalog(), box = $('townBox');
    const n = cat.scenes.findIndex(p => /zoombiniville/i.test(p));
    if (n >= 0) box.insertAdjacentHTML('beforeend', `<p>${REMAKE_FILES.has('level' + n) ? `<a href="#scenario/places/${n}">The scene, ${esc(remakeSceneTitle(n))}</a>` : `The scene, level${n}, is not open.`}</p>`);
    // Each backdrop is a prefab, a GameObject with others under it.
    const sides = ['north', 'east', 'south', 'west'].map(d => [d, remakeAtPath(`zoombiniville/zoombiniville_${d}_bg`, 1)]).filter(s => s[1]);
    if (!sides.length) { box.insertAdjacentHTML('beforeend', '<p class="note">The backdrops, in Resources/zoombiniville, are not among the files open.</p>'); return; }
    for (const [d, at] of sides) {
      const fig = document.createElement('figure');
      fig.innerHTML = `<figcaption>Looking ${d} · <a href="${remakeLink(at.entry.name, at.obj.pathId)}">zoombiniville_${d}_bg</a></figcaption>`;
      box.appendChild(fig);
      const canvas = document.createElement('canvas');
      canvas.style.maxWidth = '100%';
      const missed = await remakeDrawScene(canvas, await remakeScene(at.entry.name, at.obj.pathId), 480);
      fig.prepend(canvas);
      if (missed.sprites || missed.clips) fig.insertAdjacentHTML('beforeend', `<p class="note">${plural(missed.sprites + missed.clips, 'piece')} could not be drawn.</p>`);
    }
  },
};

/* The Zoombini and the Fleen: their library, traits and parts. */
const REMAKE_SNOIDS = [
  { title: 'A Zoombini', swf: 'swf/Zoombinis/ZMB_CharacterLibrary.swf', traits: ['hair', 'eyes', 'nose', 'feet'], named: true,
    part: (t, v) => t === 'feet' ? `zmb_feet_${v}` : `zmb_feet_0_${t}_${v}`,
    parts: (f, e, n, h) => [`zmb_feet_${f}`, `zmb_feet_${f}_head`, `zmb_feet_${f}_eyes_${e}`, `zmb_feet_${f}_nose_${n}`, `zmb_feet_${f}_hair_${h}`] },
  { title: 'A Fleen', swf: 'swf/Fleens/ZMB_Fleens_Animation.swf', traits: ['hair', 'eyes', 'nose', 'feet'],
    part: (t, v) => t === 'feet' ? `fleens_feet_${v}_head` : `fleens_feet_0_${t}_${v}`,
    parts: (f, e, n, h) => [`fleens_feet_${f}_shadow`, `fleens_feet_${f}_foot_back`, `fleens_feet_${f}_head`, `fleens_feet_${f}_eyes_${e}`, `fleens_feet_${f}_nose_${n}`, `fleens_feet_${f}_hair_${h}`, `fleens_feet_${f}_foot_front`] },
];

/* The remake's names for the twenty values, from the sprites of the
   feature arrows in Bubblewonder Abyss: BubblewonderAbyssGrid's
   _zoombiniHair, _zoombiniEyes, _zoombiniNose and _zoombiniFeet, five
   sprites each in value order, named hair_shaggy and so on. Empty where
   that scene or the layouts are not open. */
let REMAKE_TRAIT_NAMES = null;
async function remakeTraitNames() {
  if (REMAKE_TRAIT_NAMES) return REMAKE_TRAIT_NAMES;
  const names = {};
  const cat = await remakeCatalog(), n = cat.scenes.findIndex(p => /bubblewonder/i.test(p));
  const entry = n >= 0 && REMAKE_FILES.get('level' + n);
  if (entry && entry.sf && await remakeLayouts()) {
    for (const o of entry.sf.objects) {
      if (o.classId !== 114) continue;
      const v = await REMAKE_SCENE_API.read(entry.name, o.pathId).catch(() => null);
      if (!v || !v._zoombiniHair) continue;
      for (const [t, field] of [['hair', '_zoombiniHair'], ['eyes', '_zoombiniEyes'], ['nose', '_zoombiniNose'], ['feet', '_zoombiniFeet']]) {
        names[t] = [];
        for (const p of v[field] || []) {
          const at = remakeTarget(entry, p), s = at && await remakeObject(at.entry, at.obj).catch(() => null);
          names[t].push(s && s.m_Name ? s.m_Name.replace(/^[a-z]+_/, '') : '');
        }
      }
      break;
    }
  }
  return (REMAKE_TRAIT_NAMES = names);
}

/* A scene's page: the scene drawn as it opens, and what it draws. */
async function remakePlacePage(view, n) {
  const entry = REMAKE_FILES.get('level' + n);
  view.innerHTML = `<h1>${esc(remakeSceneTitle(n))}</h1>`;
  if (!entry || !entry.sf) { view.insertAdjacentHTML('beforeend', `<p class="note">The scene’s file, level${n}, is not open.</p>`); return; }
  view.insertAdjacentHTML('beforeend', `<p class="sub">The scene as its file has it when it opens, before its code runs. The code moves things, shows and hides them, and sets the clips’ frames, so the game shows more than this, or less. <a href="${remakeLink(entry.name)}">level${n}</a> in Data.</p><p class="note reading">Reading the scene…</p>`);
  const layouts = await remakeLayouts(), scene = await remakeScene(entry.name);
  const canvas = document.createElement('canvas');
  canvas.className = 'scene';
  canvas.style.maxWidth = '100%';
  const missed = await remakeDrawScene(canvas, scene);
  view.querySelector('p.reading').remove();
  view.appendChild(canvas);
  const notes = [];
  if (!layouts) notes.push('The clips need the scripts’ fields. Open the whole Zoombinis.app or the APKs to draw them.');
  if (missed.sprites) notes.push(`${plural(missed.sprites, 'sprite')} could not be drawn, since a texture is in a file not open or in a format not decoded.`);
  if (missed.clips) notes.push(`${plural(missed.clips, 'clip')} could not be drawn, since a .swf is not among the files open.`);
  if (notes.length) view.insertAdjacentHTML('beforeend', `<p class="note">${notes.map(esc).join(' ')}</p>`);
  const layers = await remakeSortingLayers();
  let html = `<h2 class="h">What it draws</h2><p class="sub">${plural(scene.items.length, 'thing')}, back to front.${scene.camera ? ` The camera, ${esc(scene.camera.name || '')}, sees ${Math.round(scene.camera.size * 2)} units high.` : ''}</p><div class="wide"><table class="plain"><tr><th>GameObject</th><th>draws</th><th>layer</th><th>order</th></tr>`;
  for (const it of scene.items) {
    let what;
    if (it.kind === 'sprite') what = `<a href="${remakeLink(it.file, it.pathId)}">a sprite</a>`;
    else {
      const t = remakeSwfAsset(it.swf), file = esc(it.swf.split('/').pop());
      what = `the clip ${esc(it.symbol)} of ${t ? `<a href="${remakeLink(t.entry.name, t.obj.pathId)}">${file}</a>` : file}${it.label ? `, at ${esc(it.label)}` : it.frame ? `, frame ${it.frame}` : ''}`;
    }
    html += `<tr><td>${esc(it.name || '')}</td><td>${what}</td><td class="note">${esc((layers[it.layer] || {}).name || '')}</td><td class="num">${it.order}</td></tr>`;
  }
  view.insertAdjacentHTML('beforeend', html + '</table></div>');
}

/* ---- Components -------------------------------------------------------------- */

function remakeGalleryHead(view, title, sub) {
  view.innerHTML = `<h1>${title}</h1><p class="sub">${sub}</p>`;
  if (!remakeIsOpen()) view.insertAdjacentHTML('beforeend', REMAKE_NOT_OPEN);
}
/* Groups as folds, each filled with cards or rows. */
function remakeFolds(view, groups, fill) {
  for (const [group, list] of groups) {
    const d = document.createElement('details');
    d.className = 'sec';
    d.open = groups.length === 1;
    d.innerHTML = `<summary><b>${esc(group)}</b> <span class="note">${list.length}</span></summary>`;
    view.appendChild(d);
    fill(d, list, group);
  }
}
/* A card's picture, no more than 160 × 120. */
function remakeThumb(pic, canvas) {
  const k = Math.min(1, 160 / Math.max(1, canvas.width), 120 / Math.max(1, canvas.height));
  canvas.style.width = Math.max(1, Math.round(canvas.width * k)) + 'px';
  canvas.style.height = Math.max(1, Math.round(canvas.height * k)) + 'px';
  pic.appendChild(canvas);
}
const isRemakeAtlas = it => /_tex\d+_compressed$/i.test(it.path || '');
const isRemakeMusic = it => /^audio\/music\//.test(it.path || '');
const isRemakeSwf = it => /\.swf$/i.test(it.path || '');

/* Sound rows, each played from its button. */
function remakeSoundRows(d, list) {
  d.insertAdjacentHTML('beforeend', '<table class="plain">' + list.map((it, i) => `<tr><td><button class="play" data-i="${i}" title="Play">▶</button></td><td><a href="${remakeLink(it.entry.name, it.obj.pathId)}">${esc(it.name || String(it.obj.pathId))}</a></td><td class="note"></td></tr>`).join('') + '</table>');
  d.addEventListener('click', async e => {
    const b = e.target.closest('button.play');
    if (!b) return;
    const it = list[+b.dataset.i], note = b.closest('tr').querySelector('td.note');
    try {
      const snd = await remakeSound(await remakeObject(it.entry, it.obj));
      note.textContent = snd.about + (snd.note ? '. ' + snd.note : '');
      if (snd.bytes) new Audio(URL.createObjectURL(new Blob([snd.bytes], { type: snd.type }))).play();
    } catch (err) { note.textContent = err.message; }
  });
}
/* Texture or sprite cards. */
function remakeCards(d, items, draw) {
  galleryCards(d, items.map(it => ({ ...it, href: remakeLink(it.entry.name, it.obj.pathId), cap: esc(it.name || String(it.obj.pathId)) })), async (c, pic) => {
    const v = await remakeObject(c.entry, c.obj);
    if (!c.name) pic.nextSibling.innerHTML = esc(v.m_Name || String(c.obj.pathId));
    await draw(c, pic, v);
  });
}

const REMAKE_GALLERIES = {
  async pictures(view) {
    await remakeCatalog();
    const list = remakeAll(28).filter(it => !isRemakeAtlas(it));
    remakeGalleryHead(view, 'Pictures', `${plural(list.length, 'texture')} in the remake’s files, grouped by their folder in Resources, or by the file that has them. The atlases of the uniSWF clips are under Sprite sheets.`);
    remakeFolds(view, remakeGrouped(list), (d, items) => remakeCards(d, items, async (c, pic, v) => {
      pic.nextSibling.innerHTML += ` <span class="note">${v.m_Width} × ${v.m_Height}</span>`;
      const canvas = await remakeTextureCanvas(c.entry, c.obj);
      if (canvas) remakeThumb(pic, remakeCopy(canvas));
      else pic.textContent = v.m_Width && v.m_Height ? 'not decoded' : 'no pixels';
    }));
  },

  async sheets(view) {
    await remakeCatalog();
    const swfs = remakeAll(49).filter(isRemakeSwf), sprites = remakeAll(213), atlases = remakeAll(28).filter(isRemakeAtlas);
    remakeGalleryHead(view, 'Sprite sheets', `The remake’s animations are ${plural(swfs.length, 'uniSWF file')}, each with its clips and atlases, and its still pieces are ${plural(sprites.length, 'sprite')} cut from textures. A .swf file’s view in Data plays its clips.`);
    if (swfs.length) {
      view.insertAdjacentHTML('beforeend', '<h2 class="h">uniSWF files</h2>');
      const groups = swfs.map(it => [it.path.slice(0, it.path.lastIndexOf('/')), [it]]).sort((a, b) => a[0].localeCompare(b[0]));
      remakeFolds(view, groups, (d, [it], swfPath) => {
        const theirs = atlases.filter(a => a.path.startsWith(swfPath + '/'));
        d.insertAdjacentHTML('beforeend', `<p><a href="${remakeLink(it.entry.name, it.obj.pathId)}">${esc(swfPath.split('/').pop())}</a>, with ${plural(theirs.length, 'atlas', 'atlases')}.</p>`);
        remakeCards(d, theirs.map(a => ({ ...a, name: a.path.split('/').pop() })), async (c, pic) => {
          const canvas = await remakeTextureCanvas(c.entry, c.obj);
          if (canvas) remakeThumb(pic, remakeCopy(canvas)); else pic.textContent = 'not decoded';
        });
      });
    }
    if (sprites.length) {
      view.insertAdjacentHTML('beforeend', '<h2 class="h">Sprites</h2>');
      remakeFolds(view, remakeGrouped(sprites), (d, items) => remakeCards(d, items, async (c, pic) => {
        const canvas = await remakeSpriteCanvas(c.entry, c.obj);
        if (canvas) remakeThumb(pic, canvas); else pic.textContent = 'its texture is not open';
      }));
    }
  },

  async sounds(view) {
    await remakeCatalog();
    const list = remakeAll(83).filter(it => !isRemakeMusic(it));
    remakeGalleryHead(view, 'Sounds', `${plural(list.length, 'sound')} in the remake’s files, besides the music, grouped by their folder in Resources, or by the file that has them.`);
    remakeFolds(view, remakeGrouped(list), remakeSoundRows);
  },

  async music(view) {
    await remakeCatalog();
    const list = remakeAll(83).filter(isRemakeMusic);
    remakeGalleryHead(view, 'Music', `${plural(list.length, 'tune')} in the remake’s Resources/audio/music. The remake plays recordings, where the 1996 game played MIDI.`);
    remakeFolds(view, remakeGrouped(list), remakeSoundRows);
  },

  async text(view) {
    await remakeCatalog();
    const list = remakeAll(49).filter(it => !isRemakeSwf(it));
    remakeGalleryHead(view, 'Text', `${plural(list.length, 'text asset')} in the remake’s files, grouped by their folder in Resources, or by the file that has them. The .swf files are under Sprite sheets.`);
    remakeFolds(view, remakeGrouped(list), (d, items) => d.insertAdjacentHTML('beforeend', '<div class="ids">' + items.map(it => `<a href="${remakeLink(it.entry.name, it.obj.pathId)}">${esc(it.name || String(it.obj.pathId))}</a>`).join('') + '</div>'));
  },
};

/* The side list's figure beside a remake pane. */
function remakeTabCount(tab, sub) {
  if (!REMAKE_CATALOG) return '';
  if (tab === 'scenario') return { places: REMAKE_CATALOG.scenes.length, puzzles: Object.keys(ZB_REMAKE_PUZZLES).length, snoids: REMAKE_SNOIDS.length, town: '' }[sub] ?? '';
  const n = {
    pictures: () => remakeAll(28).filter(it => !isRemakeAtlas(it)).length,
    sheets: () => remakeAll(49).filter(isRemakeSwf).length + remakeAll(213).length,
    sounds: () => remakeAll(83).filter(it => !isRemakeMusic(it)).length,
    music: () => remakeAll(83).filter(isRemakeMusic).length,
    text: () => remakeAll(49).filter(it => !isRemakeSwf(it)).length,
  }[sub];
  const k = n ? n() : 0;
  return k ? String(k) : '';
}
