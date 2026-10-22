/* page-room.js -- a place as its archive has it (Scenario, Places, the
   place): the room's picture, the paths walked over it, where each feature
   script draws, the snoid scripts, the sounds and what cues them, the help.
   A view of what the files hold, each thing a link to its resource in Data;
   nothing here is the game played.
   =========================================================================
   The page's script: DOM here. LOAD ORDER: after page-feature.js and
   page-tabs.js. */

const ROOM_PICK = { walks: true };

function roomPage(view, key) {
  const place = ZB_PLACE_BY_KEY.get(key), entry = ARCHIVES.get(key);
  const routes = [...new Set(zbPlaceRoutes(key).map(r => ZB_ROUTES[r.route].name))];
  let html = `<h1>${esc(place.name)}</h1><p class="sub">${esc(place.kind[0].toUpperCase() + place.kind.slice(1))}${routes.length ? ', on ' + esc(routes.join('; ')) : ''}. Its archive is ${entry ? `<a href="#${key}">${key}</a>` : key}.</p>`
    + `<p class="note">${journeyAvailable() ? `<a href="#place=${key}">Map</a>` : ''}${ZB_PUZZLES.has(key) ? ` · <a href="#solve=${key}">Taken apart</a>` : ''}${key === 'TOWN' ? ' · <a href="#town">All round</a>' : ''}</p>`;
  if (!entry) { view.innerHTML = html + `<p class="warn">${key}.MHK is not among the files opened.</p>`; return; }
  if (!entry.bytes) {
    view.innerHTML = html + `<p class="note">${FETCHING.has(key) ? 'Fetching it from archive.org…' : `${key.toLowerCase()}.mhk has not been fetched from archive.org: <a id="roomFetch">fetch</a>.`}</p>`;
    const again = () => { if (location.hash === `#scenario/places/${key}`) route(); };
    if ($('roomFetch')) $('roomFetch').addEventListener('click', () => { ensureBytes(entry).then(again); again(); });
    return;
  }
  const arc = openedArchive(entry);
  if (!arc) { view.innerHTML = html + `<p class="bad">${esc(entry.error || key + ' could not be read.')}</p>`; return; }

  // The room's resources in the archive.
  const room = roomPicture(arc, key);
  const walks = arc.list('NODE').map(({ id }) => {
    const nodes = parseWalkNodes(arc.get('NODE', id));
    return { id, nodes, paths: arc.has('PATH', id) ? parseWalkPaths(arc.get('PATH', id), nodes.length) : [] };
  });
  const bySheet = new Map(), undrawn = [];
  for (const { id } of arc.list('SCRB')) {
    let script, d = null;
    try { script = parseScript(arc.get('SCRB', id), 'SCRB'); d = featureDrawn(arc, id, script); } catch (e) { /* listed as not drawn */ }
    if (!d || !d.placed.box) { undrawn.push(id); continue; }
    if (!bySheet.has(d.sheet.id)) bySheet.set(d.sheet.id, []);
    bySheet.get(d.sheet.id).push({ id, script, d });
  }
  const snoid = arc.list('SCRS').map(r => r.id), sounds = arc.list('\0SND').map(r => r.id), cues = galleryCues(arc);
  const pictures = arc.list('tBMP').map(r => r.id).filter(id => !gallerySheet(key, arc, id));

  if (room != null) {
    html += `<div class="tools">${walks.length ? `<label><input type="checkbox" id="roomWalks"${ROOM_PICK.walks ? ' checked' : ''}> Walk paths</label>` : ''}`
      + (bySheet.size ? `<label>Feature script <select id="roomScript"><option value="">none</option>${[...bySheet].map(([sheet, list]) => `<optgroup label="tBMP ${sheet}">${list.map(s => `<option>${s.id}</option>`).join('')}</optgroup>`).join('')}</select></label>` : '')
      + `<span id="roomNote" class="note"></span></div><div id="roomPic" class="picture"></div>`
      + `<p class="note">The room is <a href="${link(key, 'tBMP', room)}">tBMP ${room}</a>.${walks.length ? ' ' + walks.map(w => `<a href="${link(key, 'NODE', w.id)}">NODE ${w.id}</a>: ${plural(w.nodes.length, 'waypoint')}, ${plural(w.paths.length, 'path')}`).join('; ') + '.' : ' No waypoints: nothing walks here.'}</p>`;
  } else html += '<p class="note">No picture of the archive’s is a room’s 640 × 480.</p>';
  if (bySheet.size || undrawn.length) {
    html += `<h2 class="h">Feature scripts</h2><p class="note">${plural(arc.list('SCRB').length, 'script')}, by the sheet each draws from (the last sheet numbered at or below it). Pointing at one shows where it draws.</p>`;
    for (const [sheet, list] of bySheet) html += `<div class="ids"><span class="note"><a href="${link(key, 'tBMP', sheet)}">tBMP ${sheet}</a></span>${list.map(s => `<a href="${link(key, 'SCRB', s.id)}" data-script="${s.id}">${s.id}</a>`).join('')}</div>`;
    if (undrawn.length) html += `<div class="ids"><span class="note">draw nothing</span>${undrawn.map(id => `<a href="${link(key, 'SCRB', id)}">${id}</a>`).join('')}</div>`;
  }
  if (snoid.length) html += `<h2 class="h">Snoid scripts</h2><div class="ids">${snoid.map(id => `<a href="${link(key, 'SCRS', id)}">${id}</a>`).join('')}</div>`;
  if (sounds.length) {
    html += `<h2 class="h">Sounds</h2><table class="plain">`;
    for (const id of sounds) {
      const by = cues.get(id) || [];
      html += `<tr><td><button class="play" data-id="${id}" title="Play">▶</button></td><td><a href="${link(key, '\0SND', id)}">${id}</a></td>`
        + `<td class="note">${by.length ? 'cued by ' + by.slice(0, 6).map(c => `<a href="${link(key, c.tag, c.id)}">${c.tag} ${c.id}</a>`).join(', ') + (by.length > 6 ? ` and ${by.length - 6} more` : '') : ''}</td></tr>`;
    }
    html += '</table>';
  }
  if (pictures.length > (room != null ? 1 : 0)) html += `<h2 class="h">Pictures</h2><div class="ids">${pictures.map(id => `<a href="${link(key, 'tBMP', id)}">${id}</a>`).join('')}</div>`;
  html += helpHtml(key);
  view.innerHTML = html;
  for (const b of view.querySelectorAll('button.play')) b.addEventListener('click', () => snoidPlaySound(key, +b.dataset.id));
  if (room == null) return;

  // The picture, with whatever the visitor picks drawn over it.
  const pal = paletteFor(entry, arc, room).pal;
  const back = indexedCanvas(decodeTbmp(arc.get('tBMP', room)), pal, false);
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480; c.className = 'px';
  $('roomPic').appendChild(c);
  const g = c.getContext('2d');
  const scripts = new Map([...bySheet.values()].flat().map(s => [s.id, s]));
  let shown = null;
  const draw = () => {
    g.globalAlpha = 1;
    g.drawImage(back, 0, 0);
    if (ROOM_PICK.walks && walks.length) {
      g.lineJoin = 'round';
      for (const w of walks) {
        g.lineWidth = 2; g.globalAlpha = .8;
        w.paths.forEach((p, i) => {
          const pts = p.filter(n => n).map(n => w.nodes[n - 1]);
          g.strokeStyle = WALK_COLOURS[i % WALK_COLOURS.length];
          g.beginPath();
          pts.forEach((n, k) => (k ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y)));
          g.stroke();
        });
        g.globalAlpha = 1;
        for (const n of w.nodes) { g.fillStyle = '#fff'; g.fillRect(n.x - 2, n.y - 2, 4, 4); g.fillStyle = '#0e131c'; g.fillRect(n.x - 1, n.y - 1, 2, 2); }
      }
    }
    const s = shown != null ? scripts.get(shown) : null;
    $('roomNote').textContent = '';
    if (s) {
      const b = s.d.placed.box, tick = s.d.placed.ticks.find(t => t.some(p => p.width && p.height)) || [];
      for (const p of tick) if (p.width && p.height) g.drawImage(indexedCanvas(s.d.frames[p.shape - 1], pal, true), p.x, p.y);
      g.strokeStyle = '#ff5c7a'; g.lineWidth = 1;
      g.strokeRect(b.x0 - .5, b.y0 - .5, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
      $('roomNote').textContent = `SCRB ${s.id}: ${plural(s.script.frameCount, 'tick')}, within (${b.x0}, ${b.y0}) to (${b.x1}, ${b.y1}); its first tick that draws is shown.`;
    }
  };
  const show = id => { shown = id; if ($('roomScript')) $('roomScript').value = id == null ? '' : id; draw(); };
  draw();
  if ($('roomWalks')) $('roomWalks').addEventListener('change', e => { ROOM_PICK.walks = e.target.checked; draw(); });
  if ($('roomScript')) $('roomScript').addEventListener('change', e => show(e.target.value ? +e.target.value : null));
  for (const a of view.querySelectorAll('a[data-script]')) {
    a.addEventListener('pointerenter', () => show(+a.dataset.script));
    a.addEventListener('focus', () => show(+a.dataset.script));
  }
}
