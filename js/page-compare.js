/* page-compare.js -- the 1996 game and the 2015 remake together: the
   picker in the bar, Scenario and Components side by side, and a
   screenshot read in one game drawn again in the other.
   =========================================================================

   A place of the 1996 game and a scene of the remake are the same where
   the scene's name, in letters only, is in the place's name
   ("Ferryboat" in "Captain Cajun's Ferryboat"). Nothing else ties them,
   so the isle, the map and the passages have no scene, and the remake's
   menus, HUD and interstitials no place.

   A trait value's two numbers are tied by name. The remake's names come
   from its sprites (remakeTraitNames), and seven of them are other words
   for the 1996 value (doc/REMAKE.md, "Names"), in ZB_REMAKE_WORDS.

 In a screenshot drawn in the 1996 game, the band stands where the 1996
   program puts a band coming to the place (ZB_WAITING), in the order the
   reading lists it, and where the place has no such table, at its share
   of the frame. In one drawn in the remake, each Zoombini stands at its
   share of the frame stretched over the whole 16:9 scene, since no table
   of the remake's places is read. The two games lay out a place
   differently, so that is near the spot, not on the same stone or seat.

   The page's script: DOM here. LOAD ORDER: after page-tabs.js,
   page-shot.js, page-remake.js and page-remake-shot.js. */

const ZB_COMPARE_KEY = 'snoidgrimoire-compare';
const ZB_REMAKE_WORDS = { polytail: 'ponytail', buzz: 'flat top', hat: 'cap', dots: 'wide eyes', single: 'one eye', yellow: 'orange', skates: 'roller skates' };

function zbBothOpen() { return !!ARCHIVES.size && typeof remakeIsOpen === 'function' && remakeIsOpen(); }
function zbCompareOn() { return zbBothOpen() && localStorage.getItem(ZB_COMPARE_KEY) === '1'; }

/* ---- places and scenes ------------------------------------------------------ */

const zbLetters = s => s.toLowerCase().replace(/[^a-z]/g, '');
function zbSceneOfPlace(key) {
  const p = ZB_PLACE_BY_KEY.get(key);
  if (!p || !REMAKE_CATALOG) return null;
  const name = zbLetters(p.name);
  const n = REMAKE_CATALOG.scenes.findIndex(s => { const w = zbLetters(s.split('/').pop().replace(/\.unity$/, '')); return w.length > 4 && name.includes(w); });
  return n < 0 ? null : n;
}
function zbPlaceOfScene(n) { return ZB_PLACES.find(p => zbSceneOfPlace(p.key) === n) || null; }

/* The game a view shows: Scenario and Components show the one picked,
   the remake's Data shows the remake, and everything else is 1996's. */
function zbEditionShown() {
  const top = topTabOfHash();
  if (top === 'scenario' && tabOfHash()) return zbEdition();
  if (top === 'components') return zbEdition();
  return isRemakeHash() ? '2015' : isMountainHash() ? '2001' : isOdysseyHash() ? '2002' : '1996';
}

/* The address of the same thing in the other game, or the nearest.
   Mountain Rescue and Island Odyssey share no place with the others, so a
   move to or from either stays on the same pane and leaves the place out. */
function zbHashIn(e, h) {
  if (e === '2001' || e === '2002' || zbEditionShown() === '2001' || zbEditionShown() === '2002') {
    const m = /^#(scenario|components)(?:\/(\w+))?/.exec(h);
    if (m) { const T = zbTabsOf(e)[m[1]]; return `#${m[1]}/${T.subs.some(s => s[0] === m[2]) ? m[2] : T.subs[0][0]}`; }
    if (e === '2001') return '#mountain';
    if (e === '2002') return '#odyssey';
    return e === '2015' ? '#remake' : '#' + (DATA_LAST || 'RODMAP');
  }
  const t = /^#(scenario|components)(?:\/(\w+))?(?:\/(\w+))?$/.exec(h);
  if (t) {
    const T = (e === '2015' ? ZB_REMAKE_TABS : ZB_TABS)[t[1]], sub = T.subs.some(s => s[0] === t[2]) ? t[2] : T.subs[0][0];
    let item = '';
    if (sub === 'places' && t[3]) {
      const o = e === '2015' ? zbSceneOfPlace(t[3]) : (zbPlaceOfScene(+t[3]) || {}).key;
      if (o != null) item = '/' + o;
    }
    return `#${t[1]}/${sub}${item}`;
  }
  if (e === '2015') {
    if (isRemakeHash()) return h;
    if (/^#town\b/.test(h)) return '#scenario/town';
    const k = (/[#&](?:place|solve)=(\w+)/.exec(h) || [])[1] || (/^#([A-Z0-9]+)(?:\/|$)/.exec(h) || [])[1];
    const n = k ? zbSceneOfPlace(k) : null;
    if (n == null) return '#scenario/places';
    return /^#[A-Z0-9]+(\/|$)/.test(h) ? remakeLink('level' + n) : `#scenario/places/${n}`;
  }
  const r = /^#remake\/level(\d+)/.exec(decodeURIComponent(h)), p = r && zbPlaceOfScene(+r[1]);
  if (p) return '#' + p.key;
  return isRemakeHash() ? '#' + (DATA_LAST || 'RODMAP') : h;
}

async function zbEditionPick(e) {
  await remakeCatalog();
  const h = zbHashIn(e, location.hash);
  localStorage.setItem('snoidgrimoire-edition', e);
  if (h === location.hash) route(); else location.hash = h;
}
async function zbCompareToggle() {
  const on = localStorage.getItem(ZB_COMPARE_KEY) !== '1';
  localStorage.setItem(ZB_COMPARE_KEY, on ? '1' : '0');
  if (on && !tabOfHash()) {
    // Side by side is Scenario's and Components'; elsewhere it opens the place.
    localStorage.setItem('snoidgrimoire-edition', '1996');
    await remakeCatalog();
    const k = (/[#&](?:place|solve)=(\w+)/.exec(location.hash) || [])[1] || (/^#([A-Z0-9]+)(?:\/|$)/.exec(location.hash) || [])[1];
    const r = /^#remake\/level(\d+)/.exec(decodeURIComponent(location.hash)), p = r ? zbPlaceOfScene(+r[1]) : ZB_PLACE_BY_KEY.get(k);
    location.hash = p ? `#scenario/places/${p.key}` : '#scenario/places';
  } else route();
}

/* The picker, after the bar's four tabs, where more than one game is
   open. Both is the 1996 game and the remake side by side. */
const ZB_EDITION_TITLES = { 1996: 'The 1996 game', 2001: 'Mountain Rescue (2001)', 2002: 'Island Odyssey (2002)', 2015: 'The 2015 remake' };
function zbEditionBar() {
  const open = zbEditionsOpen();
  if (open.length < 2) return '';
  const shown = zbEditionShown(), cmp = zbCompareOn() && shown !== '2001' && shown !== '2002';
  return '<span class="editions">'
    + open.map(e => `<a data-edition="${e}"${!cmp && e === shown ? ' class="on"' : ''} title="${ZB_EDITION_TITLES[e]}">${e}</a>`).join('')
    + (zbBothOpen() ? `<a data-compare${cmp ? ' class="on"' : ''} title="The 1996 game and the remake, side by side">Both</a>` : '') + '</span>';
}
function zbEditionWire(nav) {
  for (const a of nav.querySelectorAll('[data-edition]')) a.addEventListener('click', e => {
    e.preventDefault();
    if (zbCompareOn()) localStorage.setItem(ZB_COMPARE_KEY, '0');
    zbEditionPick(a.dataset.edition);
  });
  const c = nav.querySelector('[data-compare]');
  if (c) c.addEventListener('click', e => { e.preventDefault(); zbCompareToggle(); });
}

/* ---- side by side ----------------------------------------------------------- */

/* Both games' panes for one Scenario or Components address, in two
   columns, stacked on a phone. A pane one game lacks is a note. */
async function zbCompareTab(view, t) {
  await remakeCatalog();
  view.innerHTML = '<div class="compare"><section></section><section></section></div>';
  const cols = view.querySelectorAll('.compare > section');
  const from = zbEdition();
  ['1996', '2015'].forEach((e, i) => {
    const col = cols[i], T = (e === '2015' ? ZB_REMAKE_TABS : ZB_TABS)[t.tab];
    const label = `<p class="edition-head">${e === '1996' ? 'The 1996 game' : 'The 2015 remake'}</p>`;
    const sub = T.subs.find(s => s[0] === t.sub);
    if (!sub) { col.innerHTML = label + `<p class="note">The ${e === '1996' ? '1996 game' : 'remake'} has no ${esc(ZB_TABS[t.tab].subs.concat(ZB_REMAKE_TABS[t.tab].subs).find(s => s[0] === t.sub)[1])}.</p>`; return; }
    let item = t.item;
    if (item != null && e !== from) {
      item = e === '2015' ? zbSceneOfPlace(item) : (zbPlaceOfScene(+item) || {}).key;
      if (item == null) { col.innerHTML = label + `<p class="note">The ${e === '1996' ? '1996 game has no place' : 'remake has no scene'} named as this one is.</p>`; return; }
      item = String(item);
    }
    const body = document.createElement('div');
    col.innerHTML = label;
    col.appendChild(body);
    ZB_EDITION_HELD = e;
    try {
      const panes = e === '2015' ? (t.tab === 'scenario' ? REMAKE_SCENARIO_PANES : REMAKE_GALLERIES) : (t.tab === 'scenario' ? SCENARIO_PANES : ZB_GALLERIES);
      const shown = panes[t.sub](body, item);
      if (shown && shown.catch) shown.catch(err => { body.insertAdjacentHTML('beforeend', `<p class="bad">This could not be shown (${esc(err.message)}).</p>`); console.error(err); });
    } catch (err) {
      body.insertAdjacentHTML('beforeend', `<p class="bad">This could not be shown (${esc(err.message)}).</p>`);
      console.error(err);
    } finally { ZB_EDITION_HELD = null; }
  });
}

/* ---- a screenshot in the other game ------------------------------------------ */

/* For each trait, the 1996 value of each remake value, by name: the
   remake's from 0, the 1996 game's from 0 here too, a band's from 1. */
async function zbTraitMap() {
  const names = await remakeTraitNames(), map = {};
  for (const t of ZB_TRAIT_KINDS) {
    map[t] = (names[t] || []).map(nm => {
      const w = (ZB_REMAKE_WORDS[nm] || nm).replace(/_/g, ' ');
      return ZB_TRAIT_SHORT[t].findIndex(s => { const l = s.toLowerCase(); return l === w || l.split(' ')[0] === w; });
    });
    if (map[t].length !== 5 || map[t].some(v => v < 0) || new Set(map[t]).size !== 5) throw new Error(`the remake's names for ${t} (${(names[t] || []).join(', ') || 'none read'}) do not match the 1996 game's`);
  }
  return map;
}

/* The box, around its origin, of a remake Zoombini's parts at a pose. */
function zbRemakeZoombiniBox(parts, pose) {
  let top = Infinity, bottom = -Infinity;
  for (const n of ['zmb_feet_0', 'zmb_feet_0_head', 'zmb_feet_0_hair_0']) {
    const p = parts.get(pose + '/' + n);
    if (p) { top = Math.min(top, -p.oy); bottom = Math.max(bottom, p.height - p.oy); }
  }
  return { top, bottom, height: bottom - top };
}

/* A 1996 reading drawn in the remake's scene of the place. */
async function zbShotIn2015(r) {
  await remakeCatalog();
  const n = zbSceneOfPlace(r.place);
  if (n == null) throw new Error(`the remake has no scene named as ${ZB_PLACE_BY_KEY.has(r.place) ? ZB_PLACE_BY_KEY.get(r.place).name : r.place} is`);
  const map = await zbTraitMap(), back = {};
  for (const t of ZB_TRAIT_KINDS) back[t] = map[t].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const c = document.createElement('canvas');
  await remakeDrawScene(c, await remakeScene('level' + n));
  const { parts, poses } = await remakeShotParts(), pose = poses[0], box = zbRemakeZoombiniBox(parts, pose);
  const W = c.width, H = c.height;
  // A 1996 Zoombini's height, read off ZOOMBINI's sheet, as a share of the frame's.
  const zarc = openedArchive(ARCHIVES.get('ZOOMBINI')), tall = zarc ? zbZoombiniImage(zbSnoidSheet(zarc), { hair: 1, eyes: 1, nose: 1, feet: 1 }).height : 48;
  const k = (tall / ZB_SHOT_H) * H / box.height;
  const g = c.getContext('2d');
  const whole = z => ZB_TRAIT_KINDS.every(t => z.traits[t] != null);
  const scene = await remakeScene('level' + n), band = r.zoombinis.filter(whole);
  // The band stands on the scene's arrival slots, in their order, as the
  // remake fills them, through the camera's view as the scene is drawn.
  // Without them, each Zoombini stands at its share of the frame.
  const slots = scene.arrival && scene.camera && scene.arrival.length >= band.length ? scene.arrival : null;
  const at = band.map((z, i) => {
    if (!slots) return { z, x: z.x / ZB_SHOT_W * W, y: z.y / ZB_SHOT_H * H };
    const cam = scene.camera, s = H / (2 * cam.size);
    return { z, x: W / 2 + (slots[i][0] - cam.x) * s, y: H / 2 - (slots[i][1] - cam.y) * s };
  }).sort((a, b) => a.y - b.y);
  for (const { z, x, y } of at) {
    const v = Object.fromEntries(ZB_TRAIT_KINDS.map(t => [t, back[t][z.traits[t] - 1]]));
    zbRemakeDrawZoombini(g, parts, pose, v, x, y, k, false);
  }
  return { canvas: c, title: remakeSceneTitle(n), link: `#scenario/places/${n}`, left: r.zoombinis.length - band.length,
    waiting: slots ? 'The band stands on the slots the remake fills as a band comes in.' : null };
}

function zbRemakeDrawZoombini(g, parts, pose, t, x, y, k, flip) {
  for (const n of [`zmb_feet_${t.feet}`, `zmb_feet_${t.feet}_head`, `zmb_feet_${t.feet}_eyes_${t.eyes}`, `zmb_feet_${t.feet}_nose_${t.nose}`, `zmb_feet_${t.feet}_hair_${t.hair}`]) {
    const p = parts.get(pose + '/' + n);
    if (!p) continue;
    const pc = document.createElement('canvas');
    pc.width = p.width; pc.height = p.height;
    pc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height), 0, 0);
    g.setTransform(flip ? -k : k, 0, 0, k, x, y);
    g.drawImage(pc, -p.ox, -p.oy);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/* A remake reading drawn in the 1996 place's picture. */
async function zbShotIn1996(r) {
  await remakeCatalog();
  const place = zbPlaceOfScene(r.best.n);
  if (!place) throw new Error(`the 1996 game has no place named as ${remakeSceneTitle(r.best.n)} is`);
  const home = ARCHIVES.get(place.key), z = ARCHIVES.get('ZOOMBINI');
  if (!home || !z) throw new Error(`the 1996 picture needs ${place.key.toLowerCase()}.mhk and zoombini.mhk, and they are not both open`);
  for (const e of [home, z]) if (!e.bytes) await ensureBytes(e);
  const map = await zbTraitMap();
  const arc = openedArchive(home), zarc = openedArchive(z);
  const pic = zbPlacePicture(arc, place.key, 1), pal = paletteFor(home, arc, pic.palette).pal;
  const c = document.createElement('canvas');
  c.width = ZB_SHOT_W; c.height = ZB_SHOT_H;
  const g = c.getContext('2d');
  for (const l of pic.layers) g.drawImage(indexedCanvas(decodeBitmapResource(arc.get('tBMP', l.id)).frames[l.frame], pal, false), l.x, l.y);
  const sheet = zbSnoidSheet(zarc), { fit, sceneW: W, sceneH: H } = r;
  const band = r.zoombinis.map(q => Object.fromEntries(ZB_TRAIT_KINDS.map(t => [t, map[t][q.traits[t]] + 1])));
  // Hotel Dimensia's band waits small and far off, so it stands at its share of the frame.
  const waiting = ZB_WAITING[place.key] && !ZB_WAITING[place.key].small ? zbBandWaiting(place.key, band) : null;
  const at = waiting ? waiting
    : r.zoombinis.map((q, i) => ({ z: band[i], x: (fit.x0 + q.x * fit.scale) / W * ZB_SHOT_W, y: (fit.y0 + q.y * fit.scale) / H * ZB_SHOT_H })).sort((a, b) => a.y - b.y);
  for (const w of at) {
    const im = zbZoombiniImage(sheet, w.z);
    g.drawImage(indexedCanvas(im, pal, true), Math.round(w.x - im.ox), Math.round(w.y - im.oy));
  }
  return { canvas: c, title: place.name, link: `#scenario/places/${place.key}`, left: 0,
    waiting: waiting ? 'The band stands where the 1996 program puts a band coming here.' : null };
}

/* The button under a reading, where the other game is open too. */
function zbShotOtherButton(out, r, from) {
  if (!zbBothOpen()) return;
  const to = from === '1996' ? '2015' : '1996';
  const p = document.createElement('p');
  p.innerHTML = `<button>Draw in the ${to === '2015' ? '2015 remake' : '1996 game'}</button>`;
  const box = document.createElement('div');
  out.append(p, box);
  p.querySelector('button').addEventListener('click', async () => {
    box.innerHTML = '<p class="note">Drawing…</p>';
    try {
      const d = await (to === '2015' ? zbShotIn2015(r) : zbShotIn1996(r));
      box.innerHTML = `<p>The Zoombinis as read, in <a href="${d.link}">${esc(d.title)}</a>${d.left ? `, without ${plural(d.left, 'Zoombini')} whose traits are not all read` : ''}. ${d.waiting || 'Each stands at its share of the frame, and the other game lays out its picture differently, so that is near the spot only.'}</p>`;
      d.canvas.style.maxWidth = '100%';
      d.canvas.className = 'scene';
      box.appendChild(d.canvas);
    } catch (e) {
      box.innerHTML = `<p class="bad">The page could not draw it (${esc(e.message)}).</p>`;
      console.error(e);
    }
  });
}
