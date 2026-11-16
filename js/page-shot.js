/* page-shot.js -- Scenario's "Screenshot" pane: a screenshot of the game,
   given by the visitor, read back by js/zb-shot.js. The page draws the
   frame it found, with each Zoombini numbered, and a table of the
   Zoombinis. At the Allergic Cliffs it also gives the pegs left and the
   rules that fit, and at the Stone Cold Caves the guardians' rules that
   fit.
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
    + 'At the Allergic Cliffs and the Stone Cold Caves it also shows the rules that put the Zoombinis where they stand, and at Bubblewonder Abyss the grid.</p>'
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
  const names = ['ZOOMBINI', ...ZB_SHOT_PLACES.map(p => p.key)];
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
  html += `<p>The screenshot is ${L.width} × ${L.height}${s.bars ? ', with plain bars around the frame' : ''}. ${size}${scale}`;
  if (!r.place) {
    out.innerHTML = html + ' No picture of the game’s matches it. The page reads a screenshot of a puzzle, a camp, Zoombini Isle, the map or a passage between places.</p>';
    return;
  }
  const place = ZB_SHOT_PLACE_BY_KEY.get(r.place);
  const named = ZB_PLACE_BY_KEY.has(r.place) ? `<a href="#scenario/places/${r.place}">${esc(place.name)}</a>` : esc(place.name);
  html += ` ${ZB_PLACE_BY_KEY.has(r.place) ? 'The place is' : 'It shows'} ${named}, in the ${r.windows ? 'Windows' : 'Mac'} program’s colors.`
    + ` <a href="#${r.place}/tBMP/${r.picture}">${r.place} tBMP ${r.picture}</a> matches ${Math.round(100 * r.fit)}% of its pixels.`
    + ` ${r.zoombinis.length ? `The page found ${plural(r.zoombinis.length, 'Zoombini')}.` : 'The page found no Zoombinis.'}`
    + ` <span class="note">${L.seconds.toFixed(1)} s</span></p>`;
  html += '<div class="wide" id="shotFrame"></div>';
  if (r.puzzle && r.place === 'BRIDGE') html += shotBridgeHtml(r);
  if (r.puzzle && r.place === 'TUNNELS') html += shotTunnelsHtml(r);
  if (r.puzzle && r.place === 'MAZE2') html += shotMaze2Html(r);
  if (r.puzzle && r.puzzle.lines) html += shotPuzzleHtml(r, place);
  html += shotTableHtml(r);
  const band = r.zoombinis.map(z => z.traits);
  if (ZB_PUZZLES.has(r.place) && r.place !== 'MAZE2' && !(r.puzzle && r.puzzle.link) && band.length && band.length <= 16 && band.every(t => ZB_TRAIT_KINDS.every(k => t[k] != null))) {
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

/* What a reader in a file of its own found (zb-shot.js, "A place's
   reader"): its sentences, and its link to take the puzzle apart. */
function shotPuzzleHtml(r, place) {
  const P = r.puzzle;
  let html = `<h2>${esc(place.name)}</h2>` + P.lines.map(l => `<p>${esc(l)}</p>`).join('');
  if (P.link) html += `<p><a href="#${esc(P.link.hash)}">${esc(P.link.text)}</a></p>`;
  return html;
}

/* Where a Zoombini stands, in words. */
function shotWhere(z) {
  if (!z.where) return '';
  if (typeof z.where === 'string') return z.where;
  const w = z.where;
  if (w.side === 'upper' || w.side === 'lower') return `across the ${w.side} bridge, the ${SHOT_ORDINALS[w.slot]} to cross it`;
  if (w.side === 'cave') return `in the ${ZB_TUNNELS_CAVES.names[w.cave]} cave, the ${SHOT_ORDINALS[w.slot]} into it`;
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
    const where = [shotWhere(z), z.behind ? 'partly behind the scenery' : ''].filter(Boolean).join(', ');
    html += `<tr><td>${i + 1}</td><td data-shotz="${i}"></td>${ZB_TRAIT_KINDS.map(cell).join('')}<td class="note">${esc(where)}</td></tr>`;
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

/* The Abyss: the layout, its colors and what each feature arrow shows. */
function shotMaze2Html(r) {
  const P = r.puzzle;
  let html = '<h2>Bubblewonder Abyss</h2>';
  if (!P.layout) return html + '<p>The page could not match the grid to one of the game’s layouts.</p>';
  const small = P.layout === ZB_MAZE2_SMALL_LAYOUT, arrows = P.cells.filter(c => c.type === 2);
  html += `<p>The grid is <a href="#MAZE2/REGS/${P.layout}">MAZE2 REGS ${P.layout}</a>, `
    + (small ? 'level 4’s layout for a band under five' : `the ${P.variant ? 'second' : 'first'} layout of level ${P.level}, ${esc(ZB_LEVELS[P.level - 1])}`) + '.';
  const colors = [...new Set(P.cells.filter(c => c.group > 1).map(c => c.color))];
  if (colors.length) html += ` Its colors are ${esc(zbWordsOr(colors, 'and'))}.`;
  html += P.turned.length ? ` ${plural(P.turned.length, 'arrow')} ${P.turned.length === 1 ? 'points' : 'point'} away from its starting way, so a bubble has passed.` : ' Every arrow points its starting way.';
  html += '</p><ul>';
  arrows.forEach((c, k) => {
    const n = r.zoombinis.filter(z => c.value && z.traits[c.kind] === c.value).length;
    html += `<li>Arrow ${ZB_MAZE2_LETTERS[k]}, ${c.row + 1} across and ${c.col + 1} down, pointing ${ZB_MAZE2_WAYS[c.dir]}, `
      + (c.value ? `turns Zoombinis with ${esc(zbTraitWith(c.kind, c.value))} (${n || 'none'} of those read).` : 'shows no feature.') + '</li>';
  });
  html += '</ul>';
  const band = r.zoombinis.map(z => z.traits);
  if (band.length && band.length <= 16 && band.every(t => ZB_TRAIT_KINDS.every(k => t[k] != null)) && (band.length < 5) === small) {
    const set = { layout: P.layout };
    arrows.forEach((c, k) => { set[`a${k + 1}`] = zbMaze2SlotOption(c.slot); });
    html += `<p><a href="#solve=MAZE2${P.level === 1 ? '' : `&level=${P.level}`}&band=${zbBandCode(band)}&set=${encodeURIComponent(JSON.stringify(set))}">Take it apart</a></p>`;
  }
  return html;
}

/* The caves: who has gone through each tunnel, and the rules that fit. */
function shotTunnelsHtml(r) {
  const P = r.puzzle, gone = P.through.flat().length;
  let html = '<h2>Stone Cold Caves</h2>';
  if (!gone) return html + '<p>Nobody has gone through a tunnel so far, so every rule fits.</p>';
  const counts = ZB_TUNNELS_CAVES.names.map((n, c) => [n, P.through[ZB_TUNNELS_CAVES.entrance[c]].length]).filter(([, k]) => k)
    .map(([n, k]) => `${k} in the ${n} cave`);
  if (P.waiting.length) counts.push(`${P.waiting.length} still to go`);
  html += `<p>There are ${zbWordsOr(counts, 'and')}.</p>`;
  const band = [...P.through.flat(), ...P.waiting].map(z => z.traits);
  const complete = band.every(t => ZB_TRAIT_KINDS.every(k => t[k] != null));
  const fitting = P.levels.filter(l => l.side.length && (l.level === 1 || l.upper.length));
  if (!fitting.length) return html + '<p>No rules of any level put the Zoombinis in the caves where they stand. A Zoombini may be misread.</p>';
  const list = (rules, name, matches) => {
    const shown = rules.slice(0, 8);
    let out = '<ul>';
    for (const f of shown) out += `<li>The ${f[matches] ? name[0] : name[1]} guardian lets through Zoombinis with ${esc(zbTunnelsRuleWords(f.rule))}.</li>`;
    if (rules.length > shown.length) out += `<li class="note">and ${rules.length - shown.length} more</li>`;
    return out + '</ul>';
  };
  for (const l of fitting) {
    html += `<p><b>Level ${l.level}, ${esc(ZB_LEVELS[l.level - 1])}.</b> `;
    if (l.level === 1) {
      html += `The two ${l.closed} tunnels are closed. ${l.side.length === 1 ? 'One rule fits.' : `${l.side.length} rules fit.`}</p>` + list(l.side, ['left', 'right'], 'leftMatches');
    } else {
      html += `${l.side.length === 1 ? 'One rule fits' : `${l.side.length} rules fit`} the left and right guardians, and ${l.upper.length === 1 ? 'one fits' : `${l.upper.length} fit`} the upper and lower.</p>`
        + list(l.side, ['left', 'right'], 'leftMatches') + list(l.upper, ['upper', 'lower'], 'upperMatches');
    }
    if (l.dealt && !l.dealt.length) html += '<p class="note">The program would not deal these rules for this band, so either the screenshot leaves out some of the band or the level is another.</p>';
    const pair = l.dealt && l.dealt.length ? l.dealt[0] : l.level === 1 ? [l.side[0]] : [l.side[0], l.upper.find(u => JSON.stringify(u.rule) !== JSON.stringify(l.side[0].rule))];
    if (complete && pair.every(Boolean)) {
      html += `<p><a href="#solve=TUNNELS${l.level === 1 ? '' : `&level=${l.level}`}&band=${zbBandCode(band)}&set=${encodeURIComponent(JSON.stringify(shotTunnelsForm(l, pair)))}">Take it apart</a></p>`;
    }
  }
  return html;
}

/* A pair of rules in the shape the caves' form on the solve page reads
   (zb-puzzle-tunnels.js's form and edit). */
function shotTunnelsForm(l, pair) {
  const set = { left: pair[0].leftMatches ? 'with' : 'without' };
  const put = (p, rule) => {
    if (l.level <= 2) set[p] = `${rule[0].kind}:${rule[0].values[0]}`;
    else if (l.level === 3) { set[p + 'Kind'] = rule[0].kind; set[p + 'Values'] = rule[0].values.slice().sort((a, b) => a - b); }
    else { set[p + '1'] = `${rule[0].kind}:${rule[0].values[0]}`; set[p + '2'] = `${rule[1].kind}:${rule[1].values[0]}`; }
  };
  put('a', pair[0].rule);
  if (l.level === 1) set.closed = l.closed || 'inner';
  else { put('b', pair[1].rule); set.upper = pair[1].upperMatches ? 'with' : 'without'; }
  return set;
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
