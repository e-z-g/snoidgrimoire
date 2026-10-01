/* page-galleries.js -- Components: what the archives store, by kind, across
   every archive open. Each item links to its resource in Data, where it is
   shown whole, played or saved.
   =========================================================================
   The page's own script: DOM here. LOAD ORDER: after page-tabs.js. */

const ZB_GALLERY_TAGS = {
  pictures: ['tBMP'], sheets: ['tBMP'], sounds: ['\0SND'], music: ['tMID'], text: ['STRL'],
  palettes: ['SHPL', 'tPAL'], cursors: ['CURS'], scripts: ['SCRS', 'SCRB'], walks: ['NODE'],
};
const GALLERY_SHEET = new Map();   // 'FLEENS 4000' -> true for a sheet of sprites

/* Whether a tBMP is a sheet, worked out once. */
function gallerySheet(name, arc, id) {
  const k = `${name} ${id}`;
  if (!GALLERY_SHEET.has(k)) GALLERY_SHEET.set(k, !!tbmpFrameOffsets(arc.get('tBMP', id)));
  return GALLERY_SHEET.get(k);
}

/* Cards that draw their picture when they come into sight. */
function galleryCards(view, cards, draw) {
  const grid = document.createElement('div');
  grid.className = 'cards';
  const seen = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      try { draw(e.target._card, e.target.querySelector('.pic')); } catch (err) { e.target.querySelector('.pic').textContent = err.message; }
    }
  }, { rootMargin: '300px' });
  for (const card of cards) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = card.href;
    a.innerHTML = `<div class="pic"></div><div class="cap">${card.cap}</div>`;
    a._card = card;
    grid.appendChild(a);
    seen.observe(a);
  }
  view.appendChild(grid);
}
/* A canvas no bigger than w × h, the pixels square. */
function galleryThumb(frame, pal, transparent, w = 160, h = 120) {
  const c = indexedCanvas(frame, pal, transparent);
  const s = Math.min(1, w / Math.max(1, frame.width), h / Math.max(1, frame.height));
  c.style.width = Math.max(1, Math.round(frame.width * s)) + 'px';
  c.style.height = Math.max(1, Math.round(frame.height * s)) + 'px';
  return c;
}

function galleryHead(view, title, sub, what) {
  view.innerHTML = `<h1>${title}</h1><p class="sub">${sub}</p>` + unfetchedNote(what);
  wireFetchAll(view);
}

/* A ZOOMBINI sound a Zoombini says: which kind of thing, for which hair and
   nose (zbSnoidSound, run backwards), or null. */
function galleryVoice(id) {
  if (id < 100 || id > 499) return null;
  const kind = id < 425 ? Math.floor((id - 100) / 25) : [15, 14, 13][Math.floor((id - 425) / 25)];
  const r = (id - 100) % 25, hair = ZB_SNOID_VOICE_HAIR.indexOf(r - r % 5) + 1, nose = r % 5 + 1;
  return `a Zoombini’s voice, kind ${kind}: ${ZB_TRAIT_SHORT.hair[hair - 1].toLowerCase()} hair, ${ZB_TRAIT_SHORT.nose[nose - 1].toLowerCase()} nose`;
}

const ZB_GALLERIES = {
  pictures(view) {
    galleryHead(view, 'Pictures', 'Every single picture: rooms, backgrounds, the map.', 'Pictures');
    const cards = [];
    for (const { entry, arc } of openArchives()) for (const { id } of arc.list('tBMP'))
      if (!gallerySheet(entry.name, arc, id)) cards.push({ entry, arc, id, href: link(entry.name, 'tBMP', id), cap: `${entry.name} <b>${id}</b>` });
    galleryCards(view, cards, (c, pic) => {
      const f = decodeTbmp(c.arc.get('tBMP', c.id));
      pic.appendChild(galleryThumb(f, paletteFor(c.entry, c.arc, c.id).pal, false));
      pic.nextSibling.innerHTML += ` <span class="note">${f.width} × ${f.height}</span>`;
    });
  },

  sheets(view) {
    galleryHead(view, 'Sprite sheets', 'Every sheet of sprites, its first sprite shown: the snoids’ parts, the puzzles’ pieces, the buttons.', 'Sheets');
    const cards = [];
    for (const { entry, arc } of openArchives()) for (const { id } of arc.list('tBMP'))
      if (gallerySheet(entry.name, arc, id)) cards.push({ entry, arc, id, href: link(entry.name, 'tBMP', id), cap: `${entry.name} <b>${id}</b>` });
    galleryCards(view, cards, (c, pic) => {
      const d = decodeBitmapResource(c.arc.get('tBMP', c.id));
      const f = d.frames.find(x => x.width && x.height) || d.frames[0];
      pic.appendChild(galleryThumb(f, paletteFor(c.entry, c.arc, c.id).pal, true));
      pic.nextSibling.innerHTML += ` <span class="note">${plural(d.frames.length, 'sprite')}</span>`;
    });
  },

  sounds(view) {
    galleryHead(view, 'Sounds', 'Every sound, archive by archive: how long, what cues it, and for ZOOMBINI’s voices whose they are.', 'Sounds');
    let html = '';
    for (const { entry, arc } of openArchives()) {
      const list = arc.list('\0SND');
      if (!list.length) continue;
      const cues = galleryCues(arc);
      html += `<details class="sec"><summary><b>${entry.name}</b> <span class="note">${esc(placeOf(entry.name))} · ${plural(list.length, 'sound')}</span></summary><table class="plain">`;
      for (const { id } of list) {
        let secs = '';
        try { const w = parseMohawkWave(arc.get('\0SND', id)); secs = (w.sampleCount / w.rate).toFixed(2) + ' s'; } catch (e) { secs = '?'; }
        const by = cues.get(id) || [], voice = entry.name === 'ZOOMBINI' ? galleryVoice(id) : null;
        html += `<tr><td><button class="play" data-arc="${entry.name}" data-id="${id}" title="Play">▶</button></td><td><a href="${link(entry.name, '\0SND', id)}">${id}</a></td><td class="num">${secs}</td>`
          + `<td class="note">${voice ? esc(voice) : by.length ? 'cued by ' + by.slice(0, 4).map(c => `<a href="${link(entry.name, c.tag, c.id)}">${c.tag} ${c.id}</a>`).join(', ') + (by.length > 4 ? ` and ${by.length - 4} more` : '') : ''}</td></tr>`;
      }
      html += '</table></details>';
    }
    view.insertAdjacentHTML('beforeend', html);
    view.addEventListener('click', e => {
      const b = e.target.closest('button.play');
      if (b) snoidPlaySound(b.dataset.arc, +b.dataset.id);
    });
  },

  music(view) {
    galleryHead(view, 'Music', 'Every tune, as authored for Windows (MIDIMPC) and for the Mac (MIDIMAC); each saves as a MIDI file.', 'Tunes');
    let html = '<table class="plain"><tr><th>archive</th><th>tune</th><th>bytes</th></tr>';
    for (const { entry, arc } of openArchives()) for (const r of arc.list('tMID'))
      html += `<tr><td>${entry.name}</td><td><a href="${link(entry.name, 'tMID', r.id)}">${r.id}</a></td><td class="num">${fmtBytes(r.size)}</td></tr>`;
    view.insertAdjacentHTML('beforeend', html + '</table>');
  },

  text(view) {
    galleryHead(view, 'Text', 'Every string list: the help for each place at each level, the credits, the rest.', 'Text');
    let html = '';
    for (const { entry, arc } of openArchives()) for (const { id } of arc.list('STRL')) {
      const lines = parseStringList(arc.get('STRL', id));
      const help = entry.name === 'ZOOMBINI' ? Object.entries(ZB_ARCHIVES).find(([, a]) => a.help && id >= a.help && id < a.help + 80 && (id - a.help) % 20 === 0) : null;
      const what = help ? `help: ${ZB_ARCHIVES[help[0]].place}${id >= 1700 ? ', level ' + ((id - help[1].help) / 20 + 1) : ''}` : id === 2900 && entry.name === 'ZOOMBINI' ? 'the credits' : plural(lines.length, 'string');
      html += `<details class="sec"><summary><a href="${link(entry.name, 'STRL', id)}">${entry.name} ${id}</a> <span class="note">${esc(what)}</span></summary><div class="strings"><p>${esc(lines.join('\n'))}</p></div></details>`;
    }
    view.insertAdjacentHTML('beforeend', html);
  },

  palettes(view) {
    galleryHead(view, 'Palettes', 'Every palette, its colours in order.', 'Palettes');
    let html = '';
    for (const { entry, arc } of openArchives()) for (const tag of ['SHPL', 'tPAL']) for (const { id } of arc.list(tag)) {
      const p = parsePaletteResource(arc.get(tag, id), tag);
      html += `<div class="palrow"><a href="${link(entry.name, tag, id)}">${entry.name} ${tagLabel(tag)} ${id}</a><span class="strip">`
        + p.colours.map(c => `<i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>`).join('') + '</span></div>';
    }
    view.insertAdjacentHTML('beforeend', html);
  },

  cursors(view) {
    galleryHead(view, 'Cursors', 'Every cursor.', 'Cursors');
    const cards = [];
    for (const { entry, arc } of openArchives()) for (const { id } of arc.list('CURS')) cards.push({ entry, arc, id, href: link(entry.name, 'CURS', id), cap: `${entry.name} <b>${id}</b>` });
    galleryCards(view, cards, (c, pic) => {
      const cur = parseCursor(c.arc.get('CURS', c.id)), px = new Uint8Array(256);
      for (let i = 0; i < 256; i++) px[i] = cur.image[i] ? 1 : cur.mask[i] ? 2 : 0;   // black the image, white the mask round it
      const pal = zbPalette(null); pal[1] = [0, 0, 0]; pal[2] = [255, 255, 255];
      const cv = galleryThumb({ width: 16, height: 16, pixels: px }, pal, true, 64, 64);
      cv.style.width = cv.style.height = '64px';
      pic.appendChild(cv);
    });
  },

  scripts(view) {
    galleryHead(view, 'Scripts', 'Every animation script: SCRS move a snoid, which they name by their layer order, and SCRB anything else.', 'Scripts');
    let html = '';
    for (const { entry, arc } of openArchives()) {
      const s = arc.list('SCRS'), b = arc.list('SCRB');
      if (!s.length && !b.length) continue;
      const kinds = {};
      for (const { id } of s) { try { const k = ZB_SNOID_KIND_OF_LAYOUT[parseScript(arc.get('SCRS', id), 'SCRS').layout] || 'table'; kinds[k] = (kinds[k] || 0) + 1; } catch (e) { /* counted nowhere */ } }
      html += `<details class="sec"><summary><b>${entry.name}</b> <span class="note">${s.length ? plural(s.length, 'snoid script') + ' (' + Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') + ')' : ''}${s.length && b.length ? ', ' : ''}${b.length ? plural(b.length, 'feature script') : ''}</span></summary>`
        + (s.length ? `<div class="ids"><span class="note">SCRS</span>${s.map(r => `<a href="${link(entry.name, 'SCRS', r.id)}">${r.id}</a>`).join('')}</div>` : '')
        + (b.length ? `<div class="ids"><span class="note">SCRB</span>${b.map(r => `<a href="${link(entry.name, 'SCRB', r.id)}">${r.id}</a>`).join('')}</div>` : '') + '</details>';
    }
    view.insertAdjacentHTML('beforeend', html);
  },

  walks(view) {
    galleryHead(view, 'Walks', 'The waypoints and paths the Zoombinis walk by, in the nine archives that have them.', 'Walks');
    let html = '<table class="plain"><tr><th>archive</th><th>place</th><th>waypoints</th><th>paths</th></tr>';
    for (const { entry, arc } of openArchives()) for (const { id } of arc.list('NODE')) {
      const nodes = parseWalkNodes(arc.get('NODE', id)), paths = arc.has('PATH', id) ? parseWalkPaths(arc.get('PATH', id), nodes.length) : [];
      html += `<tr><td><a href="${link(entry.name, 'NODE', id)}">${entry.name} ${id}</a></td><td class="note">${esc(placeOf(entry.name))}</td><td class="num">${nodes.length}</td><td class="num">${paths.length}</td></tr>`;
    }
    view.insertAdjacentHTML('beforeend', html + '</table>');
  },
};

/* The scripts in an archive that cue each of its sounds, worked out once. */
const GALLERY_CUES = new WeakMap();
function galleryCues(arc) {
  if (!GALLERY_CUES.has(arc)) {
    const m = new Map();
    for (const tag of ['SCRS', 'SCRB']) for (const r of arc.list(tag)) {
      let s;
      try { s = parseScript(arc.get(tag, r.id), tag); } catch (e) { continue; }
      for (const id of new Set(s.frames.map(f => f.sound).filter(x => x > 0))) {
        if (!m.has(id)) m.set(id, []);
        m.get(id).push({ tag, id: r.id });
      }
    }
    GALLERY_CUES.set(arc, m);
  }
  return GALLERY_CUES.get(arc);
}
