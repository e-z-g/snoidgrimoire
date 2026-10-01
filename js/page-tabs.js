/* page-tabs.js -- the tab tree, as Cythera's grimoire has it: World, the
   map, where a visit starts; Scenario, what the game assembles out of its
   files (the places, the puzzles, the snoids, the town); Components, what
   the archives store, by kind and across every archive (page-galleries.js);
   Data, the files themselves, archive by archive (page-browse.js).
   =========================================================================
   The address decides the tab: #journey and #place= are World's; #scenario
   and #scenario/<pane>, with #solve= and #town, Scenario's; #components and
   #components/<gallery> Components'; an archive's address (#FLEENS,
   #FLEENS/tBMP/4000) Data's. Every view links to the others: a gallery's
   item to its resource in Data, a puzzle to its place on the map.

   The page's own script: DOM here. LOAD ORDER: after page-browse.js, whose
   route() asks tabOfHash() and renderTab(). */

const ZB_TABS = {
  scenario: { name: 'Scenario', subs: [['places', 'Places'], ['puzzles', 'Puzzles'], ['snoids', 'Snoids'], ['town', 'The town']] },
  components: { name: 'Components', subs: [['pictures', 'Pictures'], ['sheets', 'Sprite sheets'], ['sounds', 'Sounds'], ['music', 'Music'],
    ['text', 'Text'], ['palettes', 'Palettes'], ['cursors', 'Cursors'], ['scripts', 'Scripts'], ['walks', 'Walks']] },
};
let DATA_LAST = null;   // the archive Data was last on, for its tab's link

/* { tab, sub } for a Scenario or Components address, else null. */
function tabOfHash() {
  const m = /^#(scenario|components)(?:\/(\w+))?$/.exec(location.hash);
  if (!m) return null;
  const T = ZB_TABS[m[1]];
  return { tab: m[1], sub: T.subs.some(s => s[0] === m[2]) ? m[2] : T.subs[0][0] };
}
/* Which of the four the address is under. */
function topTabOfHash() {
  if (/^#search=/.test(location.hash)) return 'search';
  if (/^#(journey|place=)/.test(location.hash)) return 'world';
  if (/^#(scenario|solve=|town\b)/.test(location.hash)) return 'scenario';
  if (/^#components/.test(location.hash)) return 'components';
  if (location.hash === '#changes') return 'data';
  return 'data';
}
/* The bar's four tabs, the one the address is under lit. */
function renderTopTabs() {
  const nav = $('views'), on = topTabOfHash();
  if (on === 'data') { const h = parseHash(); if (ARCHIVES.has(h.archive)) DATA_LAST = h.archive; }
  const data = DATA_LAST || (ARCHIVES.has('RODMAP') ? 'RODMAP' : (sortedArchives()[0] || {}).name || '');
  const tabs = [['world', 'World', '#journey'], ['scenario', 'Scenario', '#scenario'], ['components', 'Components', '#components'], ['data', 'Data', '#' + data]]
    .filter(t => t[0] !== 'world' || journeyAvailable());
  nav.innerHTML = tabs.map(([k, n, h]) => `<a data-view="${k}" href="${h}"${k === on ? ' class="on"' : ''}>${n}</a>`).join('');
}

/* A Scenario or Components pane, in the browser's frame: its list on the
   side, the pane in the view. */
function renderTab(t) {
  const T = ZB_TABS[t.tab], sub = T.subs.find(s => s[0] === t.sub);
  $('crumbs').innerHTML = `<a href="#${t.tab}">${T.name}</a><span class="sep">›</span><span>${esc(sub[1])}</span>`;
  const view = $('view');
  view.scrollTop = 0;
  try {
    (t.tab === 'scenario' ? SCENARIO_PANES : ZB_GALLERIES)[t.sub](view);
  } catch (e) {
    view.innerHTML += `<p class="bad">Could not show it: ${esc(e.message)}</p>`;
    console.error(e);
  }
  // The side after the pane, whose gallery may have just told pictures from sheets.
  $('side').innerHTML = `<h2>${T.name}</h2>` + T.subs.map(([k, n]) => `<div class="arc${k === t.sub ? ' on' : ''}" data-href="#${t.tab}/${k}"><span class="name">${esc(n)}</span><span class="place">${esc(tabCount(t.tab, k))}</span></div>`).join('');
  for (const el of $('side').querySelectorAll('[data-href]')) el.addEventListener('click', () => { location.hash = el.dataset.href; });
}
/* The side list's figure beside a pane: how many things it holds. */
function tabCount(tab, sub) {
  if (tab === 'scenario') return { places: ZB_PLACES.length, puzzles: ZB_PUZZLES.size, snoids: Object.keys(ZB_SNOID_KINDS).length, town: '' }[sub];
  const g = ZB_GALLERY_TAGS[sub];
  if (!g) return '';
  let n = 0;
  for (const { entry, arc } of openArchives()) for (const tag of g) {
    if (sub !== 'pictures' && sub !== 'sheets') { n += arc.list(tag).length; continue; }
    // A picture or a sheet only once its gallery has told them apart.
    for (const { id } of arc.list(tag)) {
      const k = GALLERY_SHEET.get(`${entry.name} ${id}`);
      if (k === undefined) return '';
      if (k === (sub === 'sheets')) n++;
    }
  }
  return n ? String(n) : '';
}

/* The archives open now, in the help's order, and the ones archive.org has
   not sent yet. */
function openArchives() {
  return sortedArchives().filter(e => e.bytes).map(entry => ({ entry, arc: openedArchive(entry) })).filter(o => o.arc);
}
function unfetchedNote(what) {
  const left = sortedArchives().filter(e => !e.bytes && e.remote);
  if (!left.length) return '';
  return `<p class="note">${what} from the ${plural(openArchives().length, 'archive')} open; ${plural(left.length, 'more')} archive.org has not sent yet: <a data-fetchall>fetch them</a> (about 100 MB in all).</p>`;
}
function wireFetchAll(view) {
  const a = view.querySelector('[data-fetchall]');
  if (a) a.addEventListener('click', () => {
    a.outerHTML = '<span>fetching…</span>';
    const left = sortedArchives().filter(e => !e.bytes && e.remote);
    left.reduce((p, e) => p.then(() => ensureBytes(e)), Promise.resolve()).then(() => { if (tabOfHash()) route(); });
  });
}

/* ---- Scenario --------------------------------------------------------------- */

const SCENARIO_PANES = {
  places(view) {
    let html = '<h1>Places</h1><p class="sub">The journey’s places in the order it meets them, each with its archive, its picture and its help.</p>'
      + '<div class="wide"><table class="plain"><tr><th>place</th><th>what</th><th>route</th><th>archive</th><th></th></tr>';
    for (const p of ZB_PLACES) {
      const routes = zbPlaceRoutes(p.key).map(r => ZB_ROUTES[r.route].name);
      html += `<tr><td>${esc(p.name)}</td><td class="note">${esc(p.kind)}</td><td class="note">${esc([...new Set(routes)].join('; '))}</td>`
        + `<td>${ARCHIVES.has(p.key) ? `<a href="#${p.key}">${p.key}</a>` : p.key}</td>`
        + `<td>${journeyAvailable() ? `<a href="#place=${p.key}">on the map</a>` : ''}${ZB_PUZZLES.has(p.key) ? ` · <a href="#solve=${p.key}">taken apart</a>` : ''}${p.key === 'TOWN' ? ' · <a href="#town">all round</a>' : ''}</td></tr>`;
    }
    view.innerHTML = html + '</table></div>';
  },

  puzzles(view) {
    let html = '<h1>Puzzles</h1><p class="sub">The twelve puzzles, each one’s rule at every level as the program deals it, and its chances.</p>';
    for (const [key, P] of ZB_PUZZLES) {
      const place = ZB_PLACE_BY_KEY.get(key);
      html += `<details class="sec"><summary><b>${esc(place.name)}</b> <span class="note">${esc(key)}</span></summary>`
        + `<p>${esc(P.about)}</p>`
        + P.levels.map((l, i) => `<p><b>Level ${i + 1}, ${esc(ZB_LEVELS[i])}.</b> ${esc(l.rule)} <span class="note">${esc(l.chances)}</span></p>`).join('')
        + `<p class="note">${journeyAvailable() ? `<a href="#place=${key}">On the map</a> · ` : ''}<a href="#solve=${key}">Taken apart</a> · <a href="#${key}">its archive</a></p></details>`;
    }
    view.innerHTML = html;
  },

  snoids(view) {
    const z = ARCHIVES.get('ZOOMBINI'), zarc = z && z.bytes ? openedArchive(z) : null;
    let html = '<h1>Snoids</h1><p class="sub">Brøderbund’s word for a character put together from parts: a sheet of parts, five to a snoid, and the scripts that move them.</p>';
    // Which scripts draw which snoid, from every archive open.
    const scripts = {};
    for (const { entry, arc } of openArchives()) for (const { id } of arc.list('SCRS')) {
      let s;
      try { s = parseScript(arc.get('SCRS', id), 'SCRS'); } catch (e) { continue; }
      const kind = ZB_SNOID_KIND_OF_LAYOUT[s.layout];
      if (kind) ((scripts[kind] ||= {})[entry.name] ||= []).push(id);
    }
    for (const [kind, K] of Object.entries(ZB_SNOID_KINDS)) {
      const by = scripts[kind] || {}, n = Object.values(by).reduce((a, l) => a + l.length, 0);
      html += `<h2 class="h">${esc(K.name[0].toUpperCase() + K.name.slice(1))}</h2>`
        + `<p class="note"><a href="#${K.archive}/tBMP/${K.sheet}">tBMP ${K.sheet}</a> in ${K.archive}, registration points <a href="#${K.archive}/REGS/${K.regs}">REGS ${K.regs}</a>–${K.regs + 1}. `
        + (n ? `${plural(n, 'script')} draw it:` : kind === 'small' ? 'No script draws it; Hotel Dimensia’s band waits as it.' : 'Its scripts are in archives not open yet.') + '</p>';
      if (kind === 'zoombini' || kind === 'fleen') html += `<div class="traits" data-kind="${kind}"></div>`;
      for (const [arch, ids] of Object.entries(by)) html += `<div class="ids"><span class="note">${arch}</span>${ids.map(id => `<a href="#${arch}/SCRS/${id}">${id}</a>`).join('')}</div>`;
    }
    view.innerHTML = html + unfetchedNote('Scripts');
    wireFetchAll(view);
    // A Zoombini's twenty traits, each as it wears it, from its sheet.
    if (zarc) {
      const sheet = zbSnoidSheet(zarc), pal = paletteFor(z, zarc, 1 << 30).pal, box = view.querySelector('.traits[data-kind="zoombini"]');
      if (box) for (const kind of ZB_TRAIT_KINDS) {
        const row = document.createElement('div');
        row.className = 'trow';
        row.innerHTML = `<span class="note">${kind}</span>`;
        for (let v = 1; v <= 5; v++) {
          const c = indexedCanvas(zbTraitImage(sheet, kind, v), pal, true);
          c.title = ZB_TRAIT_SHORT[kind][v - 1];
          row.appendChild(c);
        }
        box.appendChild(row);
      }
    }
  },

  town(view) {
    view.innerHTML = '<h1>The town</h1><p class="sub">Zoombiniville, where the band ends up: houses for the Zoombinis who have arrived, a reward building for each route crossed at each level.</p>'
      + `<p>${ARCHIVES.has('TOWN') ? '<a class="btn" href="#town">Stand in it, all round</a> ' : ''}${journeyAvailable() ? '<a href="#place=TOWN">On the map</a> · ' : ''}<a href="#TOWN">its archive</a></p>`;
  },
};

/* ---- cross-references -------------------------------------------------------- */

/* The references among the archives open (zb-xref.js), worked out again when
   another archive comes in; a sheet's registration points an archive at a
   time, as its resources are viewed. */
let XREF = null, XREF_SIG = '', SITE_READS = null;
const XREF_PAIRS = new WeakMap();
function siteXref() {
  const open = openArchives(), sig = open.map(o => o.entry.name).join();
  if (sig !== XREF_SIG) { XREF = zbXref(new Map(open.map(o => [o.entry.name, o.arc])), { pairs: false }); XREF_SIG = sig; }
  if (!SITE_READS) SITE_READS = zbSiteReads();
  return XREF;
}
function xrefLink(key) {
  const [name, tag, id] = key.split('/');
  return `<a href="#${key}">${name === parseHash().archive ? '' : name + ' '}${tag} ${id}</a>`;
}
/* A resource's references, for the foot of its view. */
function xrefHtml(entry, arc, tag, id) {
  let x;
  try { x = siteXref(); } catch (e) { return `<p class="bad">Its references could not be worked out: ${esc(e.message)}</p>`; }
  const key = zbXrefKey(entry.name, tag, id), out = (x.out.get(key) || []).slice(), back = (x.back.get(key) || []).slice();
  if (tag === 'tBMP' || tag === 'REGS') {
    if (!XREF_PAIRS.has(arc)) XREF_PAIRS.set(arc, zbXrefSheetRegs(arc));
    for (const { sheet, regs } of XREF_PAIRS.get(arc)) {
      if (tag === 'tBMP' && sheet === id) out.push({ key: zbXrefKey(entry.name, 'REGS', regs), why: 'its registration points' });
      if (tag === 'REGS' && (regs === id || regs + 1 === id)) back.push({ key: zbXrefKey(entry.name, 'tBMP', sheet), why: 'the registration points of' });
    }
  }
  const reads = SITE_READS.filter(r => r.key === key);
  if (!out.length && !back.length && !reads.length) return '';
  const group = (list, max = 40) => {
    const by = new Map();
    for (const r of list) { if (!by.has(r.why)) by.set(r.why, []); by.get(r.why).push(r.key); }
    return [...by].map(([why, keys]) => `<p><span class="note">${esc(why)}</span> ${keys.slice(0, max).map(xrefLink).join(', ')}${keys.length > max ? ` and ${keys.length - max} more` : ''}</p>`).join('');
  };
  return '<div class="xref"><h2>References</h2>'
    + (out.length ? group(out) : '')
    + (back.length ? '<p class="note">From:</p>' + group(back) : '')
    + (reads.length ? `<p><span class="note">read by</span> ${[...new Map(reads.map(r => [r.by, r])).values()].map(r => `<a href="${r.href}">${esc(r.by)}</a>`).join(', ')}</p>` : '')
    + '</div>';
}

/* ---- search ------------------------------------------------------------------- */

let SEARCH_DOCS = null, SEARCH_SIG = '';
function searchOfHash() {
  const m = /^#search=(.*)$/.exec(location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}
function renderSearch(q) {
  $('q').value = q;
  $('crumbs').innerHTML = `<span>Search</span>`;
  const open = openArchives(), sig = open.map(o => o.entry.name).join();
  if (sig !== SEARCH_SIG) { SEARCH_DOCS = zbSearchDocs(new Map(open.map(o => [o.entry.name, o.arc]))); SEARCH_SIG = sig; }
  const { hits, total } = zbSearch(SEARCH_DOCS, q);
  const kinds = [['place', 'Places'], ['puzzle', 'Puzzles'], ['text', 'Text'], ['resource', 'Resources']];
  $('side').innerHTML = '<h2>Search</h2>' + kinds.map(([k, n]) => `<div class="arc" data-kind="${k}"><span class="name">${n}</span><span class="place">${hits.filter(h => h.doc.kind === k).length || ''}</span></div>`).join('');
  const view = $('view');
  view.scrollTop = 0;
  let html = `<h1>“${esc(q)}”</h1><p class="sub">${total ? plural(total, 'match', 'matches') + (total > hits.length ? `, the first ${hits.length} shown` : '') : 'Nothing holds every word of it.'}</p>` + unfetchedNote('Searched');
  for (const [k, n] of kinds) {
    const list = hits.filter(h => h.doc.kind === k);
    if (!list.length) continue;
    html += `<h2 class="h" id="hits-${k}">${n}</h2><ul class="hits">` + list.map(h => `<li><a href="${h.doc.href}">${esc(h.doc.title)}</a>${h.line ? `<span class="line">${esc(h.line)}</span>` : ''}</li>`).join('') + '</ul>';
  }
  view.innerHTML = html;
  wireFetchAll(view);
  for (const el of $('side').querySelectorAll('[data-kind]')) el.addEventListener('click', () => { const t = $('hits-' + el.dataset.kind); if (t) t.scrollIntoView(); });
}
$('find').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (q) location.hash = '#search=' + encodeURIComponent(q);
});
