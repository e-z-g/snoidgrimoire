/* page-shot.js -- Scenario's "Screenshot" pane: a screenshot of the game,
   given by the visitor, read back by js/zb-shot.js. The page draws the
   frame it found, with each Zoombini numbered, and a table of the
   Zoombinis. At the Allergic Cliffs it also gives the pegs left and the
   rules that fit.
   =========================================================================

   The screenshot stays in the page's memory and goes nowhere else. Reading
   it needs ZOOMBINI and the places' archives. From archive.org the page
   fetches them the first time.

   The page's script: DOM here. LOAD ORDER: after page-tabs.js, whose
   SCENARIO_PANES this adds to, and page-browse.js and page-open.js, whose
   $, esc, plural, ARCHIVES, ensureBytes, openedArchive, paletteFor and
   indexedCanvas it uses. */

let SHOT_LAST = null;   // { name, width, height, read, seconds } or { name, error }
let SHOT_BUSY = false;

SCENARIO_PANES.screenshot = function shotPane(view) {
  view.innerHTML = '<h1>Screenshot</h1>'
    + '<p class="sub">Give the page a screenshot of the game. It shows the place and each Zoombini’s traits. '
    + 'At the Allergic Cliffs it also shows the pegs left and the rules that put the Zoombinis where they stand.</p>'
    + '<div class="shotdrop" id="shotDrop"><label class="btn">Choose a screenshot<input type="file" accept="image/*" id="shotFile" hidden></label>'
    + ' <span class="note">or drop one here, or paste one.</span></div>'
    + '<p class="note">The page reads a screenshot taken straight from the screen, at any size. '
    + 'It also reads one enlarged or shrunk with smoothing, as a browser or a forum shows a picture. '
    + 'Such a reading needs several seconds, and a Zoombini mostly hidden behind others may go unread. '
    + 'It cannot read a photo of a screen.</p>'
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
  shotShow();
};

document.addEventListener('paste', e => {
  if (!/^#scenario\/screenshot/.test(location.hash)) return;
  const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  shotTake(item.getAsFile());
});

/* The archives a reading needs, opened. The ones not open come from
   archive.org first, where the page has that source. */
async function shotArchives() {
  const names = ['ZOOMBINI', ...ZB_PLACES.map(p => p.key)];
  for (const n of names) {
    const e = ARCHIVES.get(n);
    if (e && !e.bytes && e.remote) await ensureBytes(e);
  }
  const out = new Map();
  for (const n of names) {
    const e = ARCHIVES.get(n), arc = e && e.bytes ? openedArchive(e) : null;
    if (arc) out.set(n, arc);
  }
  return out;
}

async function shotTake(file) {
  if (SHOT_BUSY) return;
  SHOT_BUSY = true;
  const out = $('shotOut');
  if (out) out.innerHTML = '<p class="note">Reading the screenshot…</p>';
  try {
    const bitmap = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const g = c.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    const rgba = g.getImageData(0, 0, c.width, c.height).data;
    const archives = await shotArchives();
    if (!archives.has('ZOOMBINI')) throw new Error('reading the Zoombinis needs ZOOMBINI.MHK, which is not open');
    // a pause, so that the note shows before the reading starts
    await new Promise(r => setTimeout(r, 30));
    const t = performance.now();
    const read = zbShotRead(rgba, c.width, c.height, archives);
    SHOT_LAST = { name: file.name || 'the pasted screenshot', width: c.width, height: c.height, read, seconds: (performance.now() - t) / 1000 };
  } catch (e) {
    SHOT_LAST = { name: file.name || 'the pasted screenshot', error: e.message };
    console.error(e);
  } finally {
    SHOT_BUSY = false;
  }
  shotShow();
}

const SHOT_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth'];

/* The last reading, under the pane's controls. */
function shotShow() {
  const out = $('shotOut');
  if (!out || !SHOT_LAST) return;
  const L = SHOT_LAST;
  if (L.error) { out.innerHTML = `<p class="bad">The page could not read ${esc(L.name)} (${esc(L.error)}).</p>`; return; }
  const r = L.read, s = r.shot;
  let html = `<h2>${esc(L.name)}</h2>`;
  const size = s.width === 640 && s.height === 480
    ? 'It shows the game’s whole 640 × 480 frame'
    : `It shows ${s.width} × ${s.height} of the game’s 640 × 480 frame`;
  const factor = `${s.scaleX.toFixed(3)} times${Math.abs(s.scaleX - s.scaleY) > 0.002 ? ` across and ${s.scaleY.toFixed(3)} down` : ''}`;
  const scale = s.smoothed ? `, ${s.scaleX < 1 ? 'shrunk to' : 'enlarged'} ${factor} with smoothing.`
    : Math.abs(s.scaleX - 1) < 0.001 && Math.abs(s.scaleY - 1) < 0.001 ? ', pixel for pixel.'
    : `, enlarged ${factor}.`;
  html += `<p>The screenshot is ${L.width} × ${L.height}. ${size}${scale}`;
  if (!r.place) {
    out.innerHTML = html + ' No place’s picture matches it. The page reads screenshots of a puzzle or a camp, taken straight from the screen.</p>';
    return;
  }
  const place = ZB_PLACE_BY_KEY.get(r.place);
  html += ` The place is <a href="#scenario/places/${r.place}">${esc(place.name)}</a>, in the ${r.windows ? 'Windows' : 'Mac'} program’s colors.`
    + ` <a href="#${r.place}/tBMP/${r.picture}">${r.place} tBMP ${r.picture}</a> matches ${Math.round(100 * r.fit)}% of its pixels.`
    + ` ${r.zoombinis.length ? `The page found ${plural(r.zoombinis.length, 'Zoombini')}.` : 'The page found no Zoombinis.'}`
    + ` <span class="note">${L.seconds.toFixed(1)} s</span></p>`;
  html += '<div class="wide" id="shotFrame"></div>';
  if (r.puzzle && r.place === 'BRIDGE') html += shotBridgeHtml(r);
  html += shotTableHtml(r);
  const band = r.zoombinis.map(z => z.traits);
  if (ZB_PUZZLES.has(r.place) && band.length && band.length <= 16 && band.every(t => ZB_TRAIT_KINDS.every(k => t[k] != null))) {
    html += `<p><a href="#solve=${r.place}&band=${zbBandCode(band)}">Take ${esc(place.name)} apart for this band</a></p>`;
  }
  out.innerHTML = html;
  shotDrawFrame($('shotFrame'), r);
  shotDrawZoombinis(out, r);
}

/* The frame as the screenshot shows it, at the game's size, with each
   Zoombini's number at its origin. Pixels the screenshot leaves out are
   gray. A smoothed screenshot's frame is its colors sampled at each frame
   pixel. */
function shotDrawFrame(box, r) {
  const c = document.createElement('canvas');
  c.width = ZB_SHOT_W; c.height = ZB_SHOT_H; c.className = 'scene';
  const g = c.getContext('2d'), im = g.createImageData(ZB_SHOT_W, ZB_SHOT_H), d = im.data;
  for (let i = 0; i < ZB_SHOT_W * ZB_SHOT_H; i++) {
    if (r.frame) {
      const shown = r.frame[3 * i] === r.frame[3 * i];
      for (let k = 0; k < 3; k++) d[4 * i + k] = shown ? r.frame[3 * i + k] : 96;
    } else {
      const k = r.keys[i];
      if (k < 0) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = 96; }
      else { d[4 * i] = (k >> 12) << 2; d[4 * i + 1] = ((k >> 6) & 63) << 2; d[4 * i + 2] = (k & 63) << 2; }
    }
    d[4 * i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  g.font = 'bold 12px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  r.zoombinis.forEach((z, i) => {
    g.lineWidth = 3;
    g.strokeStyle = '#000';
    g.strokeText(String(i + 1), z.x, z.y);
    g.fillStyle = '#ffd400';
    g.fillText(String(i + 1), z.x, z.y);
  });
  box.appendChild(c);
}

/* Where a Zoombini stands, in words. */
function shotWhere(z) {
  if (!z.where) return '';
  const w = z.where;
  if (w.side === 'upper' || w.side === 'lower') return `across the ${w.side} bridge, the ${SHOT_ORDINALS[w.slot]} to cross it`;
  if (w.side === 'waiting') return 'waiting to cross';
  return 'on its way across';
}

function shotTableHtml(r) {
  if (!r.zoombinis.length) return '';
  let html = '<div class="wide"><table class="plain"><tr><th>#</th><th></th><th>hair</th><th>eyes</th><th>nose</th><th>feet</th><th>where</th></tr>';
  r.zoombinis.forEach((z, i) => {
    const cell = k => {
      const v = z.traits[k];
      if (v == null) return '<td class="note">hidden</td>';
      const inferred = z.inferred && z.inferred[k];
      return `<td${inferred ? ' class="note" title="Most of this part is hidden. The page read it from the little that shows."' : ''}>${esc(zbTraitWith(k, v))}${inferred ? ' (partly hidden)' : ''}</td>`;
    };
    html += `<tr><td>${i + 1}</td><td data-shotz="${i}"></td>${ZB_TRAIT_KINDS.map(cell).join('')}<td class="note">${esc(shotWhere(z))}</td></tr>`;
  });
  return html + '</table></div>';
}

/* Each Zoombini read, drawn from its traits, in its row. */
function shotDrawZoombinis(out, r) {
  const z = ARCHIVES.get('ZOOMBINI'), arc = z && z.bytes ? openedArchive(z) : null;
  if (!arc) return;
  const sheet = zbSnoidSheet(arc), pal = paletteFor(z, arc, 1 << 30).pal;
  for (const td of out.querySelectorAll('[data-shotz]')) {
    const t = r.zoombinis[+td.dataset.shotz].traits;
    if (ZB_TRAIT_KINDS.some(k => t[k] == null)) continue;
    const c = indexedCanvas(zbZoombiniImage(sheet, t), pal, true);
    c.style.height = '40px';
    td.appendChild(c);
  }
}

/* The cliffs: the gate, who has crossed, and the rules that fit. */
function shotBridgeHtml(r) {
  const P = r.puzzle;
  let html = '<h2>Allergic Cliffs</h2><p>';
  if (P.gateFit < 0.8) html += 'Something covers the gate, so the page cannot count its pegs. ';
  else if (P.pegsGone === 0) html += 'The gate has all six pegs, so the cliffs have not sneezed at anyone. ';
  else html += `The gate has lost ${P.pegsGone} of its 6 pegs, so the cliffs have sneezed ${P.pegsGone === 1 ? 'once' : `${P.pegsGone} times`}. `;
  const counts = [];
  if (P.upper.length) counts.push(`${P.upper.length} across the upper bridge`);
  if (P.lower.length) counts.push(`${P.lower.length} across the lower bridge`);
  if (P.waiting.length) counts.push(`${P.waiting.length} waiting`);
  if (P.crossing.length) counts.push(`${P.crossing.length} on the way`);
  if (counts.length) html += `There are ${zbWordsOr(counts, 'and')}.`;
  html += '</p>';
  if (!P.upper.length && !P.lower.length) return html + '<p>Nobody has crossed so far, so every rule fits.</p>';
  const band = [...P.upper, ...P.lower, ...P.waiting, ...P.crossing].map(z => z.traits);
  const complete = band.every(t => ZB_TRAIT_KINDS.every(k => t[k] != null));
  const fitting = P.levels.filter(l => l.fitting.length);
  if (!fitting.length) return html + '<p>No rule of any level puts the Zoombinis where they stand. A Zoombini may be misread, or a sneeze may be under way.</p>';
  for (const l of fitting) {
    const shown = l.fitting.slice(0, 12);
    html += `<p><b>Level ${l.level}, ${esc(ZB_LEVELS[l.level - 1])}.</b> ${l.fitting.length === 1 ? 'One rule fits.' : `${l.fitting.length} rules fit.`}</p><ul>`;
    for (const f of shown) {
      const words = zbBridgeRuleWords(f.rule), dealable = l.dealt && l.dealt.some(d => d.rule === f.rule && d.upperMatches === f.upperMatches);
      const accepts = `The ${f.upperMatches ? 'upper' : 'lower'} bridge accepts Zoombinis with ${words}`;
      const link = complete ? ` <a href="#solve=BRIDGE${l.level === 1 ? '' : `&level=${l.level}`}&band=${zbBandCode(band)}&set=${encodeURIComponent(JSON.stringify(shotBridgeForm(l.level, f)))}">Take it apart</a>` : '';
      html += `<li>${esc(accepts)}.${l.dealt ? (dealable ? '' : ' <span class="note">The program would not deal it for this band, so either the screenshot leaves out some of the band or the level is another.</span>') : ''}${link}</li>`;
    }
    if (l.fitting.length > shown.length) html += `<li class="note">and ${l.fitting.length - shown.length} more</li>`;
    html += '</ul>';
  }
  return html;
}

/* A rule in the shape the cliffs' form on the solve page reads
   (zb-puzzle-bridge.js's form and edit). */
function shotBridgeForm(level, f) {
  const upper = f.upperMatches ? 'with' : 'without';
  if (level === 2) return { kind: f.rule[0].kind, values: f.rule[0].values.slice(), upper };
  const set = { upper };
  f.rule.forEach((r, k) => { set[`t${k + 1}`] = `${r.kind}:${r.values[0]}`; });
  return set;
}
