/* page-layout.js -- a puzzle's layout, edited on the solve page's stage
   (The layout, &stage=layout): Bubblewonder Abyss's squares and launchers
   (MAZE2 REGS 16600-16609) and the toads' route maps (LILLY REGS
   15000-15002), the layouts the program reads from its archives.
   =========================================================================
   An edit here is an edit like any other (page-edit.js): the archive is
   rebuilt and read back, so the deal, the solver and the scene read the
   layout as edited, and Changes saves the archive as a new .MHK, for the
   game to read in place of its own. The words are the puzzle's to change
   (zbMaze2EditSquare, zbMaze2EditSeats, zbLillyEditMap); this file is the
   tools and the clicking. After an edit the puzzle is worked out again
   once the clicking stops.

   The page's own script: DOM here. LOAD ORDER: after page-edit.js and
   page-solve.js, whose SVIEW, SDEALT, solveOpen and solveRoute it uses. */

/* The tool each editor holds, kept while the page is open. */
const LAYOUT_TOOL = {
  maze: { type: 3, dir: 1, group: 1, turns: false, ways: [true, true, true, true] },
  pond: { map: 0, route: 1 },
};
let LAYOUT_TIMER = 0, LAYOUT_PAINT = null;

const LAYOUT_MAZE_TYPES = [[0, 'nothing'], [1, 'a whirlpool'], [2, 'a feature arrow'], [3, 'a white arrow'], [4, 'a coloured arrow'], [5, 'a sticky square'], [6, 'a coloured square']];
/* Route colours on a map, by place in its family. */
const LAYOUT_ROUTE_INK = ['#e0483c', '#3ec6d6', '#eed23a', '#9058d4', '#52c04c'];

function layoutEditor(key) { return key === 'MAZE2' || key === 'LILLY' ? key : null; }

/* The REGS a deal's layout is, and its words as the archive has them now. */
function layoutRegs(key) {
  const st = SDEALT && (SDEALT.edited || SDEALT.state);
  if (key === 'MAZE2') return st ? [st.mazeLayoutRegsId] : [];
  return ZB_LILLY_ROUTE_REGS;
}
function layoutWords(name, id) { return Array.from(parseRegs(solveOpen(name).get('REGS', id))); }

/* Put a layout's new words in as an edit, redraw, and work the puzzle out
   again when the clicks stop. */
function layoutApply(name, id, words, what) {
  editApply(ARCHIVES.get(name), 'REGS', id, zbRegsBytes(words), what);
  solveLayout();
  clearTimeout(LAYOUT_TIMER);
  LAYOUT_TIMER = setTimeout(() => { if (isSolveHash()) solveRoute(); }, 700);
}

function solveLayout() {
  const key = SVIEW.key, name = layoutEditor(key);
  if (!SDEALT) { $('sdiagram').innerHTML = '<p class="note">Nothing is dealt.</p>'; return; }
  try {
    if (name === 'MAZE2') layoutMaze();
    else layoutPond();
  } catch (e) { $('sdiagram').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}

/* ---- Bubblewonder Abyss ------------------------------------------------------ */

function layoutMaze() {
  const st = SDEALT.edited || SDEALT.state, arc = solveOpen('MAZE2'), id = st.mazeLayoutRegsId, t = LAYOUT_TOOL.maze;
  const B = zbMaze2Board(SDEALT.band, st, arc), shapes = st.waveGroupShapeBase;
  const colourName = g => g === 1 ? 'white' : ZB_MAZE2_COLOURS[shapes[g]] || `group ${g}`;
  const arrows = B.cells.filter(c => c.type === 2).length, dealt = st.selectedPathSlots.length;
  const edited = isEdited('MAZE2', 'REGS', id);
  let html = `<div class="ltools"><label>Put <select data-lt="type">${LAYOUT_MAZE_TYPES.map(([v, n]) => `<option value="${v}"${v === t.type ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`
    + ` <label>pointing <select data-lt="dir">${ZB_MAZE2_WAYS.map((w, k) => `<option value="${k}"${k === t.dir ? ' selected' : ''}>${w}</option>`).join('')}</select></label>`
    + ` <label>in <select data-lt="group">${[1, 2, 3, 4, 5, 6, 7, 8].map(g => `<option value="${g}"${g === t.group ? ' selected' : ''}>${esc(colourName(g))}</option>`).join('')}</select></label>`
    + ` <label><input type="checkbox" data-lt="turns"${t.turns ? ' checked' : ''}> turning once passed, to</label>`
    + ZB_MAZE2_WAYS.map((w, k) => ` <label><input type="checkbox" data-lt="way" value="${k}"${t.ways[k] ? ' checked' : ''}> ${w}</label>`).join('') + '</div>'
    + `<div class="ltools">Launchers: ${ZB_MAZE2_SEATS.map((s, k) => `<label title="${esc(zbMaze2Corner(k) || 'the lower left')}"><input type="checkbox" data-seat="${k}"${B.seats.includes(k) ? ' checked' : ''}> ${k + 1}</label>`).join(' ')}</div>`;
  const svg = zbDiagramSvg(zbMaze2Diagram(B, SDEALT.band, null, `MAZE2 REGS ${id}`), solveSprites(SDEALT.band));
  const { C, GX, GY } = ZB_MAZE2_DRAWN, hits = [];
  for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) hits.push(`<rect data-sq="${row},${col}" x="${GX + row * C}" y="${GY + col * C}" width="${C}" height="${C}" fill="transparent"/>`);
  html += svg.replace(/<\/svg>$/, `<g class="lhits">${hits.join('')}</g></svg>`);
  $('sdiagram').innerHTML = html;
  $('scaption').textContent = `MAZE2 REGS ${id}, the layout this deal uses${edited ? ', edited (in Changes, to save as MAZE2.MHK)' : ''}. A click puts the tool on a square; on a square that has it already, turns it.`
    + (arrows > dealt ? ` ${arrows} feature arrows, and the program deals ${dealt} features at this level: here the rest show none; what the game puts on them is not known.` : '');
}

function layoutMazeClick(row, col) {
  const st = SDEALT.edited || SDEALT.state, id = st.mazeLayoutRegsId, t = LAYOUT_TOOL.maze;
  const words = layoutWords('MAZE2', id), layout = zbMaze2ParseLayout(id, words);
  const was = layout.cells.find(c => c.row === row && c.col === col && c.type <= 7);
  let cell = t.type ? { type: t.type, group: t.type === 3 ? 1 : t.group, ways: t.ways.slice(), dir: t.dir, turns: t.turns } : null;
  /* The same thing again turns it to its next way, among its ways. */
  if (cell && was && was.type === t.type) {
    let d = was.dir;
    for (let a = 0; a < 4; a++) { d = (d + 1) % 4; if (!was.turns || was.ways[d]) break; }
    cell = { type: was.type, group: was.group, ways: was.ways, dir: d, turns: was.turns };
  }
  if (cell && !cell.ways[cell.dir]) cell.ways[cell.dir] = true;
  if (!cell && !was) return;
  const what = cell ? `${LAYOUT_MAZE_TYPES[cell.type][1]} pointing ${ZB_MAZE2_WAYS[cell.dir]}` : 'nothing';
  layoutApply('MAZE2', id, zbMaze2EditSquare(words, row, col, cell), `Bubblewonder Abyss's layout: ${what} at ${row + 1} across, ${col + 1} down`);
}

function layoutMazeSeats() {
  const id = (SDEALT.edited || SDEALT.state).mazeLayoutRegsId;
  const seats = [...$('sdiagram').querySelectorAll('[data-seat]:checked')].map(x => +x.dataset.seat);
  if (seats.length > 9) { solveLayout(); return; }
  layoutApply('MAZE2', id, zbMaze2EditSeats(layoutWords('MAZE2', id), seats), `Bubblewonder Abyss's layout: launchers ${seats.map(s => s + 1).join(', ') || 'none'}`);
}

/* ---- Titanic Tattooed Toads ----------------------------------------------------- */

function layoutPond() {
  const t = LAYOUT_TOOL.pond, id = ZB_LILLY_ROUTE_REGS[t.map], [first, last] = ZB_LILLY_MAP_ROUTES[t.map];
  const words = LAYOUT_PAINT ? LAYOUT_PAINT.words : layoutWords('LILLY', id);
  const runs = zbLillyRouteRuns(words, t.map), fam = ['patterns', 'shapes', 'colours'][t.map];
  const ink = r => r ? LAYOUT_ROUTE_INK[r - first] : null;
  let html = `<div class="tabs ltabs">${['The patterns’ routes', 'The shapes’ routes', 'The colours’ routes'].map((n, k) => `<a data-lmap="${k}" class="${k === t.map ? 'on' : ''}">${n}</a>`).join('')}</div>`;
  html += `<div class="ltools">Paint <label><input type="radio" name="lroute" data-lroute="0"${t.route === 0 ? ' checked' : ''}> no route</label>`
    + runs.map(r => ` <label><input type="radio" name="lroute" data-lroute="${r.route}"${t.route === r.route ? ' checked' : ''}> <span class="swatch" style="background:${ink(r.route)}"></span> route ${r.route}</label>`).join('') + '</div>';
  const C = 30, X = 40, Y = 30, W = X + 12 * C + 220, H = Y + 12 * C + 20, out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`];
  out.push(`<rect x="${X - 4}" y="${Y - 4}" width="${12 * C + 8}" height="${12 * C + 8}" fill="${ZB_DIAGRAM_ROLES.water}"/>`);
  for (let r = 0; r < 12; r++) {
    out.push(`<text x="${X - 8}" y="${Y + r * C + C / 2 + 4}" font-size="10" text-anchor="end" fill="${ZB_DIAGRAM_ROLES.dim}">${r + 1}</text>`);
    for (let c = 0; c < 12; c++) {
      const v = words[r * 12 + c], x = X + c * C, y = Y + r * C;
      out.push(`<rect data-pad="${r},${c}" x="${x + 2}" y="${y + 2}" width="${C - 4}" height="${C - 4}" rx="${C / 2 - 2}" fill="${ink(v) || ZB_DIAGRAM_ROLES.panel}" opacity="${v ? 0.9 : 0.5}"/>`);
      if (v) out.push(`<text x="${x + C / 2}" y="${y + C / 2 + 4}" font-size="11" text-anchor="middle" fill="#0b0f16" pointer-events="none">${v}</text>`);
    }
  }
  runs.forEach((r, k) => out.push(`<text x="${X + 12 * C + 24}" y="${Y + 20 + k * 22}" font-size="13" fill="${r.across ? ink(r.route) : ZB_DIAGRAM_ROLES.bad}">route ${r.route}: ${r.pads} pad${r.pads === 1 ? '' : 's'}${r.across ? ', across' : ', not across'}</text>`));
  out.push('</svg>');
  html += out.join('');
  $('sdiagram').innerHTML = html;
  $('scaption').textContent = `LILLY REGS ${id}, the ${fam}’ routes ${first}-${last} as stored, before the program turns or mirrors the maps${isEdited('LILLY', 'REGS', id) ? ', edited (in Changes, to save as LILLY.MHK)' : ''}. Click or drag across the pads to paint.`;
}

function layoutPondPaint(r, c) {
  const t = LAYOUT_TOOL.pond;
  if (!LAYOUT_PAINT) LAYOUT_PAINT = { words: layoutWords('LILLY', ZB_LILLY_ROUTE_REGS[t.map]), changed: 0 };
  if (LAYOUT_PAINT.words[r * 12 + c] === t.route) return;
  LAYOUT_PAINT.words = zbLillyEditMap(LAYOUT_PAINT.words, t.map, r, c, t.route);
  LAYOUT_PAINT.changed++;
  layoutPond();
}
function layoutPondDone() {
  const p = LAYOUT_PAINT, t = LAYOUT_TOOL.pond;
  LAYOUT_PAINT = null;
  if (!p || !p.changed) return;
  layoutApply('LILLY', ZB_LILLY_ROUTE_REGS[t.map], p.words, `the toads' ${['patterns', 'shapes', 'colours'][t.map]}' routes repainted`);
}

/* ---- wiring --------------------------------------------------------------------- */

function wireLayout() {
  const stage = $('sdiagram');
  stage.addEventListener('click', e => {
    if (SVIEW.stage !== 'layout') return;
    const sq = e.target.closest('[data-sq]'), map = e.target.closest('[data-lmap]');
    if (sq) { const [r, c] = sq.dataset.sq.split(',').map(Number); return layoutMazeClick(r, c); }
    if (map) { e.preventDefault(); LAYOUT_TOOL.pond.map = +map.dataset.lmap; const [f] = ZB_LILLY_MAP_ROUTES[LAYOUT_TOOL.pond.map]; if (LAYOUT_TOOL.pond.route) LAYOUT_TOOL.pond.route = f; return layoutPond(); }
  });
  stage.addEventListener('change', e => {
    if (SVIEW.stage !== 'layout') return;
    const x = e.target, t = LAYOUT_TOOL.maze;
    if (x.dataset.lt === 'type') t.type = +x.value;
    else if (x.dataset.lt === 'dir') t.dir = +x.value;
    else if (x.dataset.lt === 'group') t.group = +x.value;
    else if (x.dataset.lt === 'turns') t.turns = x.checked;
    else if (x.dataset.lt === 'way') t.ways[+x.value] = x.checked;
    else if (x.dataset.seat != null) return layoutMazeSeats();
    else if (x.dataset.lroute != null) LAYOUT_TOOL.pond.route = +x.dataset.lroute;
  });
  /* Painting the pond: down on a pad, across others, up anywhere. */
  stage.addEventListener('pointerdown', e => {
    const pad = SVIEW.stage === 'layout' && e.target.closest('[data-pad]');
    if (!pad) return;
    e.preventDefault();
    const [r, c] = pad.dataset.pad.split(',').map(Number);
    layoutPondPaint(r, c);
  });
  stage.addEventListener('pointermove', e => {
    if (!LAYOUT_PAINT || !(e.buttons & 1)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), pad = el && el.closest('[data-pad]');
    if (pad) { const [r, c] = pad.dataset.pad.split(',').map(Number); layoutPondPaint(r, c); }
  });
  document.addEventListener('pointerup', layoutPondDone);
}

wireLayout();
