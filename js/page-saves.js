/* page-saves.js -- saved games, read (zb-save.js, as ScummVM reads them):
   under Data, open a game's ZOOM####.TXT, with its roster ZOOMBINI.WHO
   for its name, and see what it holds: where the band is, every Zoombini
   and where it waits, each route's places and the levels they were crossed
   at, the town; then the map with its roads coloured as the save has them,
   and the town as it stands in the save.
   =========================================================================
   The page's own script: DOM here. LOAD ORDER: after page-edit.js. */

const SAVES = [];            // [{ file, bytes, state }]
let ROSTER = null;           // [{ name, file }] from a ZOOMBINI.WHO
let JSAVE = null;            // the save the map's roads are drawn from: { name, levels: Map road shape -> level }

function isSavesHash() { return location.hash === '#saves'; }
function saveName(s) {
  const r = ROSTER && ROSTER.find(e => e.file && s.file.toUpperCase().startsWith(e.file.toUpperCase()));
  return r ? `“${r.name}” (${s.file})` : s.file;
}
async function savesOpen(files) {
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (/\.WHO$/i.test(f.name)) { ROSTER = zbSaveRoster(bytes); continue; }
    const state = zbSaveRead(bytes);
    const at = SAVES.findIndex(s => s.file === f.name);
    if (at >= 0) SAVES.splice(at, 1);
    SAVES.push({ file: f.name, bytes, state });
  }
}

/* The roads as a save colours them: each road's level (1-4), or 0. */
function saveRoadLevels(state) {
  const out = new Map();
  ZB_ROUTES.forEach((route, r) => route.segments.forEach((shape, i) => out.set(shape, state.routes[r].places[i].map)));
  return out;
}

function renderSaves() {
  $('crumbs').innerHTML = '<span>Data</span><span class="sep">›</span><span>Saves</span>';
  renderSide({ name: '#saves' }, { archive: null, tag: null, id: null });
  const view = $('view');
  let html = '<h1>Saves</h1><p class="sub">A saved game is ZOOM0000.TXT, ZOOM0001.TXT and on, in the game’s folder once installed; ZOOMBINI.WHO beside them names each. Read here, nothing leaves the page.</p>'
    + '<div class="tools"><label class="btn">Open saved games…<input type="file" id="saveFiles" multiple hidden></label>'
    + (ROSTER ? ` <span class="note">roster: ${ROSTER.map(e => `${esc(e.name)} (${esc(e.file)})`).join(', ') || 'empty'}</span>` : '') + '</div>';
  if (!SAVES.length) html += '<p class="note">None open yet.</p>';
  const z = ARCHIVES.get('ZOOMBINI'), sprites = z && z.bytes;
  if (SAVES.length && !sprites && z && z.remote) html += '<p class="note">The Zoombinis are drawn from zoombini.mhk: <a data-sact="sprites">fetch it from archive.org</a> (24 MB). Until then they are named.</p>';
  const zb = e => sprites ? solveZoombiniImg(e.traits) : '';
  for (const s of SAVES) {
    const f = s.state;
    html += `<h2 class="h">${esc(saveName(s))}</h2><p class="note">${esc(f.layout.name)} · at ${esc(f.page.name)}${f.lastPage.key ? `, last at ${esc(f.lastPage.name)}` : ''} · ${plural(f.zmbGeneratedCount, 'Zoombini')} made</p>`;
    // Where every Zoombini is.
    const groups = [['band', 'The band'], ['PICKER', 'Waiting on Zoombini Isle'], ['BASECAMP', 'At Shelter Rock'], ['BCTWO', 'At Shade Tree'], ['TOWN', 'In Zoombiniville']];
    for (const [k, title] of groups) {
      const list = f.where.filter(w => w.where === k);
      html += `<p><b>${title}</b> <span class="note">${list.length || 'none'}</span></p>`;
      if (list.length) html += '<div class="sband">' + list.map(w => `<div class="szb" title="${esc(zbZoombiniWords(w.traits))}">${zb(w)}<span class="traits">${esc(w.name || '')}</span></div>`).join('') + '</div>';
    }
    // The routes.
    html += '<div class="wide"><table class="plain"><tr><th>route</th><th>at level</th><th>its places, crossed at</th></tr>'
      + f.routes.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.level}</td><td>${r.places.map(p => `${esc(p.name)} <span class="note">${p.left.length ? p.left.join(', ') : '–'}</span>`).join(' · ')}</td></tr>`).join('') + '</table></div>';
    html += `<p><b>The town</b> <span class="note">${plural(f.population, 'Zoombini')}, ${plural(f.rewards.length, 'reward building')}</span></p>`;
    html += `<div class="tools"><button data-save-map="${esc(s.file)}">The map’s roads</button>`
      + (ARCHIVES.has('TOWN') ? ` <a class="btn" href="#town&people=${f.population}&rewards=${f.rewards.length}">The town</a>` : '') + '</div>';
  }
  view.innerHTML = html;
  $('saveFiles').addEventListener('change', async e => {
    try { await savesOpen(e.target.files); } catch (x) { setStatus(x.message, true); }
    renderSaves();
  });
  for (const b of view.querySelectorAll('[data-save-map]')) b.addEventListener('click', () => {
    const s = SAVES.find(x => x.file === b.dataset.saveMap);
    JSAVE = { name: saveName(s), levels: saveRoadLevels(s.state) };
    location.hash = '#journey';
  });
  const fetchZ = view.querySelector('[data-sact="sprites"]');
  if (fetchZ) fetchZ.addEventListener('click', () => ensureBytes(z).then(() => { SSPRITES.clear(); if (isSavesHash()) renderSaves(); }));
}
