/* page-solve.js -- a puzzle taken apart: a band, which can be changed
   Zoombini by Zoombini, a puzzle set for it, which can be changed where it
   hides something, and what can be done: with the answer known, the most
   that can cross and the ways, the simplest first; with it unknown, the
   play that is sure of the most, to be walked through move by move.
   =========================================================================

   Everything is the puzzle's own (zb-puzzle-<archive>.js: deal, form,
   edit, solve, strategy and their diagrams); this file is the controls and
   the drawing. The band is drawn from ZOOMBINI.MHK (zb-snoid.js), fetched
   from archive.org when it is not open (24 MB); until then a diagram shows
   numbered placeholders.

   The address keeps it all, so a puzzle can be linked:
     #solve=BRIDGE&level=3&deal=4242        the band and puzzle from a seed
     &size=11                               a band of fewer than 16, dealt
     &band=2552...                          a band given, four digits each
     &set=<json>                            the puzzle's fields as changed
     &view=unknown&knows=form&path=0.1      the strategy, walked
     &pick=2                                a solution other than the first

   The page's own script: DOM here. LOAD ORDER: after page-browse.js, whose
   $, esc, ARCHIVES, ensureBytes, openedArchive and sharedColours it uses;
   page-browse.js's route() calls solveRoute. */

const SVIEW = { key: null, level: 1, seed: 1, size: 16, band: null, set: null, view: 'known', knows: 'program', path: [], pick: 0, stage: 'diagram' };
let SDEALT = null, SSOLVED = null, SSTRAT = null, SNODES = [], SERROR = null, SPUZZLE = null;
const SSPRITES = new Map();       // 'z:2552' or 't:hair:1' -> { url, width, height, ox, oy }

function isSolveHash() { return /^#solve=/.test(location.hash); }

/* ---- the address --------------------------------------------------------- */

function solveHashFor() {
  const v = SVIEW, q = [`solve=${v.key}`];
  if (v.level !== 1) q.push(`level=${v.level}`);
  q.push(`deal=${v.seed}`);
  if (v.band) q.push(`band=${zbBandCode(v.band)}`);
  else if (v.size !== 16) q.push(`size=${v.size}`);
  if (v.set) q.push(`set=${encodeURIComponent(JSON.stringify(v.set))}`);
  if (v.view === 'unknown') q.push('view=unknown');
  if (v.knows !== 'program') q.push(`knows=${v.knows}`);
  if (v.path.length) q.push(`path=${v.path.join('.')}`);
  if (v.pick) q.push(`pick=${v.pick}`);
  if (v.stage === 'scene') q.push('stage=scene');
  return '#' + q.join('&');
}
function solveWriteHash(replace = true) {
  const h = solveHashFor();
  if (location.hash === h) return;
  if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
}
function solveApplyHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const key = (q.get('solve') || '').toUpperCase();
  SVIEW.key = ZB_PUZZLES.has(key) ? key : 'BRIDGE';
  const level = +q.get('level');
  SVIEW.level = level >= 1 && level <= 4 ? level : 1;
  const seed = +q.get('deal');
  SVIEW.seed = seed > 0 && seed < 2 ** 32 ? seed : 1 + Math.floor(Math.random() * 0x7fffffff);
  const size = +q.get('size');
  SVIEW.size = size >= 1 && size <= 16 ? size : 16;
  SVIEW.band = zbBandFromCode(q.get('band'));
  try { SVIEW.set = q.get('set') ? JSON.parse(q.get('set')) : null; } catch (e) { SVIEW.set = null; }
  SVIEW.view = q.get('view') === 'unknown' ? 'unknown' : 'known';
  SVIEW.knows = q.get('knows') === 'form' ? 'form' : 'program';
  SVIEW.path = (q.get('path') || '').split('.').filter(s => /^\d+$/.test(s)).map(Number);
  SVIEW.pick = Math.max(0, +q.get('pick') || 0);
  SVIEW.stage = q.get('stage') === 'scene' ? 'scene' : 'diagram';
}

/* ---- the puzzle, worked out ------------------------------------------------ */

/* The archives a view needs that are not in yet: the puzzle's layouts,
   and ZOOMBINI's sprites (wanted, not needed). */
function solveNeeds() {
  const out = [];
  for (const name of zbDealNeeds(SVIEW.key)) {
    const e = ARCHIVES.get(name);
    if (!e) return { missing: name };
    if (!e.bytes) out.push(e);
  }
  return { fetch: out };
}
const solveOpen = name => openedArchive(ARCHIVES.get(name));

/* Deal, edit, solve: what the panel and the stage show. */
function solveCompute() {
  const v = SVIEW, P = ZB_PUZZLES.get(v.key);
  SPUZZLE = P; SERROR = null; SSOLVED = null; SSTRAT = null; SNODES = [];
  const arc = P.archive ? solveOpen(P.archive) : undefined;
  try {
    SDEALT = v.band ? zbDealFor(v.key, v.level, v.seed, v.band, solveOpen) : zbDealAt(v.key, v.level, v.seed, v.size, solveOpen);
  } catch (e) { SERROR = `It could not be dealt: ${e.message}`; SDEALT = null; return; }
  let state = SDEALT.state;
  if (v.set && P.edit) {
    try { state = P.edit(v.level, SDEALT.band, state, v.set, arc); }
    catch (e) { SERROR = e.message; }
  }
  SDEALT.edited = state;
  if (state && state.stuck) { SERROR = SDEALT.setup.join(' '); return; }
  if (P.solve) {
    try { SSOLVED = P.solve(v.level, SDEALT.band, state, arc, { budget: 1500 }); }
    catch (e) { SSOLVED = { error: e.message }; }
  }
}
function solveStrategy() {
  const v = SVIEW, P = SPUZZLE;
  if (!P.strategy || !SDEALT) return;
  if (!SSTRAT) {
    const arc = P.archive ? solveOpen(P.archive) : undefined;
    try { SSTRAT = P.strategy(v.level, SDEALT.band, arc, { budget: 1500, knows: v.knows, state: SDEALT.edited || SDEALT.state }); SNODES = [SSTRAT.root]; }
    catch (e) { SSTRAT = { error: e.message }; SNODES = []; }
  }
  /* Down the path the address gives, as far as it goes. */
  while (SNODES.length <= v.path.length && SNODES.length && !SSTRAT.error) {
    const node = SNODES[SNODES.length - 1], o = node.outcomes[v.path[SNODES.length - 1]];
    if (!o) { v.path = v.path.slice(0, SNODES.length - 1); break; }
    SNODES.push(o.next());
  }
}

/* ---- sprites ---------------------------------------------------------------- */

function solvePalette() {
  const pal = zbPalette(null), sc = sharedColours();
  if (sc) sc.colours.forEach((c, i) => { pal[10 + i] = [c[0], c[1], c[2]]; });
  return pal;
}
function solveSheet() {
  const e = ARCHIVES.get('ZOOMBINI');
  if (!e || !e.bytes) return null;
  const arc = openedArchive(e);
  try { return arc ? zbSnoidSheet(arc) : null; } catch (err) { return null; }
}
function solveSprite(key, make) {
  if (SSPRITES.has(key)) return SSPRITES.get(key);
  const sheet = solveSheet();
  if (!sheet) return null;
  const img = make(sheet), c = indexedCanvas(img, solvePalette(), true);
  const s = { url: c.toDataURL(), width: img.width, height: img.height, ox: img.ox, oy: img.oy };
  SSPRITES.set(key, s);
  return s;
}
function solveSprites(band) {
  return {
    zoombini: i => band[i] ? solveSprite('z:' + zbBandCode([band[i]]), sheet => zbZoombiniImage(sheet, band[i])) : null,
    trait: (kind, value) => solveSprite(`t:${kind}:${value}`, sheet => zbTraitImage(sheet, kind, value)),
  };
}
function solveZoombiniImg(z) {
  const s = solveSprite('z:' + zbBandCode([z]), sheet => zbZoombiniImage(sheet, z));
  return s ? `<img class="zb" src="${s.url}" width="${s.width}" height="${s.height}" alt="">` : `<span class="zb none"></span>`;
}

/* ---- the panel -------------------------------------------------------------- */

function solveBandHtml(band) {
  const pick = (i, kind, v) => `<select data-trait="${kind}" data-i="${i}" title="${kind}">${ZB_TRAIT_SHORT[kind].map((n, k) => `<option value="${k + 1}"${k + 1 === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  return '<div class="sband">' + band.map((z, i) => `<div class="szb"><span class="n">${i + 1}</span>${solveZoombiniImg(z)}`
    + `<span class="traits">${ZB_TRAIT_KINDS.map(k => pick(i, k, z[k])).join('')}</span>`
    + (band.length > 1 ? `<button class="x" data-drop="${i}" title="Leave this Zoombini out">×</button>` : '') + '</div>').join('') + '</div>'
    + `<div class="actions">${band.length < 16 ? '<button data-sact="add">Add a Zoombini</button>' : ''} <button data-sact="dice">Another band</button>`
    + `${SVIEW.band ? ' <button data-sact="dealband">The dealt band</button>' : ''}</div>`;
}

function solveFormHtml(P, band) {
  if (!P.form || !SDEALT) return '';
  let fields;
  try { fields = P.form(SVIEW.level, band, SDEALT.edited || SDEALT.state, P.archive ? solveOpen(P.archive) : undefined); }
  catch (e) { return `<p class="bad">${esc(e.message)}</p>`; }
  return '<div class="sform">' + fields.map(f => {
    if (f.kind === 'note') return `<p class="note">${esc(f.note)}</p>`;
    const opt = (o, on) => `<option value="${esc(o.value)}"${on ? ' selected' : ''}>${esc(o.label)}</option>`;
    let ctl;
    if (f.kind === 'choice') ctl = `<select data-field="${f.key}">${f.options.map(o => opt(o, String(o.value) === String(f.value))).join('')}</select>`;
    else if (f.kind === 'several') ctl = `<span class="several">${f.options.map(o => `<label><input type="checkbox" data-field="${f.key}" value="${esc(o.value)}"${f.value.map(String).includes(String(o.value)) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('')}</span>`;
    else if (f.kind === 'order') ctl = `<span class="order">${f.value.map((val, k) => `<select data-field="${f.key}" data-at="${k}">${f.options.map(o => opt(o, String(o.value) === String(val))).join('')}</select>`).join('')}</span>`;
    else ctl = `<span class="note">${esc(String(f.value))}</span>`;
    return `<div class="field"><span class="label">${esc(f.label || '')}</span>${ctl}${f.note ? `<small>${esc(f.note)}</small>` : ''}</div>`;
  }).join('') + '</div>';
}

function solvePanel() {
  const v = SVIEW, P = SPUZZLE, place = ZB_PLACE_BY_KEY.get(v.key);
  const band = SDEALT ? SDEALT.band : (v.band || []);
  let html = `<h2>${esc(place.name)}</h2><div class="sub">${esc(P.about)}</div>`;
  html += `<div class="actions"><a class="btn" href="#place=${v.key}${v.level !== 1 ? '&level=' + v.level : ''}">On the map</a>`
    + ` <select id="spuzzle" title="Another puzzle">${[...ZB_PUZZLES.keys()].map(k => `<option value="${k}"${k === v.key ? ' selected' : ''}>${esc(ZB_PLACE_BY_KEY.get(k).name)}</option>`).join('')}</select>`
    + ` <select id="slevel" title="The level">${ZB_LEVELS.map((n, i) => `<option value="${i + 1}"${i + 1 === v.level ? ' selected' : ''}>Level ${i + 1}: ${esc(n)}</option>`).join('')}</select></div>`;
  if (!solveSheet()) {
    const e = ARCHIVES.get('ZOOMBINI');
    html += e ? (FETCHING.has('ZOOMBINI') ? '<p class="note">Fetching zoombini.mhk, for the Zoombinis’ pictures…</p>'
      : `<p class="note">The Zoombinis are drawn from zoombini.mhk: <a data-sact="sprites">fetch it from archive.org</a> (24 MB). Until then they are numbers.</p>`)
      : '<p class="note">ZOOMBINI.MHK is not among the files opened, so the Zoombinis are numbers.</p>';
  }

  html += `<details class="sec" open><summary>The band, ${band.length}</summary>${solveBandHtml(band)}</details>`;

  html += `<details class="sec" open><summary>The puzzle</summary>`;
  if (SDEALT) html += SDEALT.setup.map(l => `<p class="note">${esc(l)}</p>`).join('');
  html += solveFormHtml(P, band);
  if (SERROR) html += `<p class="bad">${esc(SERROR)}</p>`;
  html += `<div class="actions"><button data-sact="redeal">Deal it again</button>${v.set ? ' <button data-sact="unset">As dealt</button>' : ''}</div></details>`;

  html += `<div class="tabs"><a data-sview="known" class="${v.view === 'known' ? 'on' : ''}">Answer known</a>`
    + `<a data-sview="unknown" class="${v.view === 'unknown' ? 'on' : ''}">Answer unknown</a></div>`;
  if (v.view === 'known') html += solveKnownHtml(band);
  else html += solveUnknownHtml(band);
  html += `<p class="note">${esc(P.source)}</p>`;
  $('spanel').innerHTML = html;
}

function solveKnownHtml(band) {
  const s = SSOLVED;
  if (!s) return '<p class="note">Nothing to solve.</p>';
  if (s.error) return `<p class="bad">It could not be solved: ${esc(s.error)}</p>`;
  let html = `<p class="big"><b>${s.most}</b> of ${band.length} can cross${s.exact ? '' : ', the best found'}${s.ways != null ? `; ${s.ways.toLocaleString()} way${s.ways === 1 ? '' : 's'}` : ''}.</p>`;
  html += '<ol class="sols">' + s.solutions.map((sol, k) => `<li class="${k === SVIEW.pick ? 'on' : ''}" data-pick="${k}"><b>${k ? '' : 'Simplest: '}${esc(sol.title)}</b>`
    + (k === SVIEW.pick ? sol.steps.map(t => `<p>${esc(t)}</p>`).join('') : '') + '</li>').join('') + '</ol>';
  html += (s.notes || []).map(n => `<p class="note">${esc(n)}</p>`).join('');
  return html;
}

function solveUnknownHtml(band) {
  const P = SPUZZLE;
  if (!P.strategy) return '<p class="note">Nothing is hidden here: the band can see all it needs, so the answer known is the whole of it.</p>';
  solveStrategy();
  const st = SSTRAT;
  if (!st) return '';
  if (st.error) return `<p class="bad">It could not be worked out: ${esc(st.error)}</p>`;
  let html = `<div class="field"><span class="label">The player knows</span><select id="sknows"><option value="program"${SVIEW.knows === 'program' ? ' selected' : ''}>how the program deals</option>`
    + `<option value="form"${SVIEW.knows === 'form' ? ' selected' : ''}>only the rule’s form</option></select></div>`;
  html += `<p class="big"><b>${st.sure}</b> of ${band.length} are sure to cross${st.exact ? '' : ', at least'}, over ${st.hypotheses.toLocaleString()} hypotheses.</p>`;
  const node = SNODES[SNODES.length - 1];
  html += '<div class="walk">';
  html += `<div class="crumbs"><a data-back="0">Start</a>${SVIEW.path.map((o, k) => ` › <a data-back="${k + 1}">${esc(SNODES[k].outcomes[o].label.replace(/ \(.*\)$/, ''))}</a>`).join('')}</div>`;
  html += `<p class="move">${esc(node.move)}</p>`;
  /* A few outcomes as buttons; many (a mudball's every landing) as a list. */
  if (node.outcomes.length > 6) html += `<div class="field"><span class="label">What happens</span><select id="sout"><option value="">${node.outcomes.length} outcomes…</option>`
    + node.outcomes.map((o, k) => `<option value="${k}">${esc(o.label)}</option>`).join('') + '</select></div>';
  else if (node.outcomes.length) html += '<div class="actions">' + node.outcomes.map((o, k) => `<button data-out="${k}">${esc(o.label)}</button>`).join(' ') + '</div>';
  html += `<p class="note">${node.left != null ? `${node.left.toLocaleString()} hypotheses still possible; ` : ''}${node.crossed} across so far.</p></div>`;
  html += (st.notes || []).map(n => `<p class="note">${esc(n)}</p>`).join('');
  return html;
}

/* ---- the stage ---------------------------------------------------------------- */

function solveStage() {
  for (const a of document.querySelectorAll('#stabs a')) a.classList.toggle('on', a.dataset.stage === SVIEW.stage);
  if (SVIEW.stage === 'scene') return solveScene();
  const band = SDEALT ? SDEALT.band : [];
  let d = null, cap = '';
  if (SVIEW.view === 'known' && SSOLVED && SSOLVED.solutions && SSOLVED.solutions.length) {
    const sol = SSOLVED.solutions[Math.min(SVIEW.pick, SSOLVED.solutions.length - 1)];
    d = sol.diagram; cap = sol.title;
  } else if (SVIEW.view === 'unknown' && SNODES.length) {
    const node = SNODES[SNODES.length - 1];
    d = node.diagram; cap = node.move;
  }
  $('sdiagram').innerHTML = d ? zbDiagramSvg(d, solveSprites(band)) : `<p class="note">${esc(SERROR || 'No diagram.')}</p>`;
  $('scaption').textContent = cap;
}

/* The scene: the place's picture at the level, and the band where the
   program puts it on coming there (zbBandWaiting), standing, facing right
   as it arrives. Needs the place's archive and ZOOMBINI's, fetched when
   asked. */
function solveScene() {
  const key = SVIEW.key, place = ZB_PLACE_BY_KEY.get(key), band = SDEALT ? SDEALT.band : [];
  const home = ARCHIVES.get(key), z = ARCHIVES.get('ZOOMBINI');
  const waiting = zbBandWaiting(key, band);
  $('scaption').textContent = waiting ? `The band waiting at ${place.name}, where the program puts it on coming there (ZOOMBINI.EXE's places).`
    : `At ${place.name} the band stands off the screen, and the toads' own runners draw it; not drawn yet.`;
  const missing = [home, z].filter(e => !e || !e.bytes);
  if (missing.some(e => !e)) { $('sdiagram').innerHTML = `<p class="note">The scene needs ${esc(key.toLowerCase())}.mhk and zoombini.mhk, which are not both among the files opened.</p>`; return; }
  if (missing.length) {
    $('sdiagram').innerHTML = missing.some(e => FETCHING.has(e.name)) ? '<p class="note">Fetching…</p>'
      : `<p class="note">The scene is drawn from ${missing.map(e => esc(e.name.toLowerCase()) + '.mhk').join(' and ')}: <a data-sact="scene">fetch ${missing.length > 1 ? 'them' : 'it'} from archive.org</a>${missing.includes(z) ? ' (24 MB)' : ''}.</p>`;
    return;
  }
  const arc = openedArchive(home), zarc = openedArchive(z);
  const pic = zbPlacePicture(arc, key, SVIEW.level), pal = paletteFor(home, arc, pic.palette).pal;
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480; c.className = 'scene';
  const g = c.getContext('2d');
  for (const l of pic.layers) g.drawImage(indexedCanvas(decodeBitmapResource(arc.get('tBMP', l.id)).frames[l.frame], pal, false), l.x, l.y);
  if (waiting) {
    const sheet = zbSnoidSheet(zarc, ZB_WAITING[key].small ? 'small' : 'zoombini');
    for (const w of waiting) {
      const im = zbZoombiniImage(sheet, w.z);
      g.drawImage(indexedCanvas(im, pal, true), w.x - im.ox, w.y - im.oy);
    }
  }
  $('sdiagram').innerHTML = '';
  $('sdiagram').appendChild(c);
}

/* ---- going there ---------------------------------------------------------------- */

function solveRoute() {
  solveApplyHash();
  const need = solveNeeds();
  if (need.missing) {
    $('spanel').innerHTML = `<p class="warn">This puzzle's layout is in ${esc(need.missing)}.MHK, which is not among the files opened.</p>`;
    $('sdiagram').innerHTML = ''; return;
  }
  if (need.fetch.length) {
    $('spanel').innerHTML = `<p class="note">Fetching ${need.fetch.map(e => esc(e.name.toLowerCase()) + '.mhk').join(' and ')} from archive.org…</p>`;
    Promise.all(need.fetch.map(ensureBytes)).then(() => { if (isSolveHash()) solveRoute(); });
    return;
  }
  $('spanel').insertAdjacentHTML('afterbegin', '<p class="note working">Working it out…</p>');
  setTimeout(() => {
    solveCompute();
    solveWriteHash();
    solveDraw();
  }, 20);
}
function solveDraw() {
  const top = $('spanel').scrollTop;
  solvePanel();
  solveStage();
  $('spanel').scrollTop = top;
}
/* A change that keeps the band and puzzle: only the panel and stage again. */
function solveRedraw() { solveWriteHash(); solveDraw(); }
/* A change to the band or the puzzle: worked out again. */
function solveRedo() { SVIEW.path = []; SVIEW.pick = 0; solveWriteHash(); solveRoute(); }

function wireSolve() {
  const panel = $('spanel');
  $('sstage').addEventListener('click', e => {
    const a = e.target.closest('[data-stage],[data-sact="scene"]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.stage) { SVIEW.stage = a.dataset.stage; solveWriteHash(); return solveStage(); }
    const want = [ARCHIVES.get(SVIEW.key), ARCHIVES.get('ZOOMBINI')].filter(x => x && !x.bytes);
    Promise.all(want.map(ensureBytes)).then(() => { SSPRITES.clear(); if (isSolveHash()) solveStage(); });
    solveStage();
  });
  panel.addEventListener('change', e => {
    const t = e.target, v = SVIEW;
    if (t.id === 'spuzzle') { v.key = t.value; v.set = null; return solveRedo(); }
    if (t.id === 'slevel') { v.level = +t.value; v.set = null; return solveRedo(); }
    if (t.id === 'sout' && t.value !== '') { v.path.push(+t.value); return solveRedraw(); }
    if (t.id === 'sknows') { v.knows = t.value; v.path = []; SSTRAT = null; SNODES = []; return solveRedraw(); }
    if (t.dataset.trait) {
      const band = (v.band || SDEALT.band).map(z => Object.assign({}, z));
      band[+t.dataset.i][t.dataset.trait] = +t.value;
      v.band = band;
      return solveRedo();
    }
    if (t.dataset.field) {
      const P = SPUZZLE, arc = P.archive ? solveOpen(P.archive) : undefined;
      const fields = P.form(v.level, SDEALT.band, SDEALT.edited || SDEALT.state, arc);
      const values = Object.fromEntries(fields.filter(f => f.kind !== 'note').map(f => [f.key, Array.isArray(f.value) ? f.value.slice() : f.value]));
      const f = fields.find(x => x.key === t.dataset.field);
      const typed = s => { const o = f.options.find(o => String(o.value) === s); return o ? o.value : s; };
      if (f.kind === 'choice') values[f.key] = typed(t.value);
      else if (f.kind === 'several') values[f.key] = [...panel.querySelectorAll(`input[data-field="${f.key}"]:checked`)].map(x => typed(x.value));
      else if (f.kind === 'order') values[f.key][+t.dataset.at] = typed(t.value);
      v.set = values;
      return solveRedo();
    }
  });
  panel.addEventListener('click', e => {
    const a = e.target.closest('[data-sact],[data-drop],[data-sview],[data-pick],[data-out],[data-back]');
    if (!a) return;
    e.preventDefault();
    const d = a.dataset, v = SVIEW;
    const band = () => (v.band || SDEALT.band).map(z => Object.assign({}, z));
    if (d.sact === 'add') { const b = band(); b.push(zbDealBand(zbRandom(Date.now() & 0x7fffffff), 1)[0]); v.band = b; return solveRedo(); }
    if (d.sact === 'dice') { const n = (v.band || SDEALT.band).length; v.band = null; v.size = n; v.seed = 1 + Math.floor(Math.random() * 0x7fffffff); v.set = null; return solveRedo(); }
    if (d.sact === 'dealband') { v.size = v.band.length; v.band = null; return solveRedo(); }
    if (d.sact === 'redeal') { if (!v.band) v.band = SDEALT.band; v.seed = 1 + Math.floor(Math.random() * 0x7fffffff); v.set = null; return solveRedo(); }
    if (d.sact === 'unset') { v.set = null; return solveRedo(); }
    if (d.sact === 'sprites') { ensureBytes(ARCHIVES.get('ZOOMBINI')).then(() => { SSPRITES.clear(); solveDraw(); }); return solveDraw(); }
    if (d.drop) { const b = band(); b.splice(+d.drop, 1); v.band = b; return solveRedo(); }
    if (d.sview) { v.view = d.sview; return solveRedraw(); }
    if (d.pick) { v.pick = +d.pick; return solveRedraw(); }
    if (d.out) { v.path.push(+d.out); return solveRedraw(); }
    if (d.back) { v.path = v.path.slice(0, +d.back); SNODES = SNODES.slice(0, +d.back + 1); return solveRedraw(); }
  });
}

wireSolve();
