/* zb-search.js -- search across what the site reads: the game's own text,
   the places and the puzzles, and every resource by its archive, type and
   id.
   =========================================================================
   Needs zb-mohawk.js, zb-journey.js and the puzzles (zb-puzzle-*.js).

   A document is { kind, title, text, href }. zbSearchDocs(archives) makes
   them from the archives open (a Map of name -> opened archive): every
   string of every string list, one document a list, its title saying whose
   help it is; every resource as 'FLEENS tBMP 4000', with its archive's
   place; and from the site's own reading, each place and each puzzle with
   its rules. zbSearch(docs, query) finds the documents holding every word
   of the query, ignoring case and accents, a title match first; each hit
   carries the line of text the first word is in. */

function zbSearchFold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
}

function zbSearchDocs(archives) {
  const docs = [];
  for (const p of ZB_PLACES) {
    const P = ZB_PUZZLES.get(p.key);
    docs.push({ kind: 'place', title: p.name, text: [p.kind, p.key, ...zbPlaceRoutes(p.key).map(r => ZB_ROUTES[r.route].name)].join('\n'), href: `#place=${p.key}` });
    if (P) docs.push({ kind: 'puzzle', title: `${p.name}, the puzzle`, text: [P.about, ...P.levels.flatMap((l, i) => [`Level ${i + 1}: ${l.rule}`, l.chances])].join('\n'), href: `#solve=${p.key}` });
  }
  const helpOf = new Map();
  for (const p of ZB_PLACES) for (let k = 0; k < (p.help >= 1700 ? 4 : 1); k++) helpOf.set(p.help + 20 * k, `${p.name}’s help${p.help >= 1700 ? ', level ' + (k + 1) : ''}`);
  for (const [name, arc] of archives) {
    const place = (ZB_ARCHIVES[name] || {}).place || '';
    for (const tag of arc.tags()) for (const { id } of arc.list(tag)) {
      const label = mohawkTagLabel(tag), href = `#${name}/${label}/${id}`;
      docs.push({ kind: 'resource', title: `${name} ${label} ${id}`, text: place, href });
      if (tag !== 'STRL') continue;
      let lines;
      try { lines = parseStringList(arc.get('STRL', id)); } catch (e) { continue; }
      const title = name === 'ZOOMBINI' && helpOf.has(id) ? helpOf.get(id) : name === 'ZOOMBINI' && id === 2900 ? 'the credits' : `${name} STRL ${id}`;
      docs.push({ kind: 'text', title, text: lines.join('\n'), href });
    }
  }
  for (const d of docs) d.fold = zbSearchFold(d.title + '\n' + d.text);
  return docs;
}

/* [{ doc, line }], titles first, at most `limit`, and how many in all. */
function zbSearch(docs, query, limit = 200) {
  const words = zbSearchFold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { hits: [], total: 0 };
  const hits = [];
  for (const doc of docs) {
    if (!words.every(w => doc.fold.includes(w))) continue;
    const inTitle = words.every(w => zbSearchFold(doc.title).includes(w));
    const line = inTitle ? '' : doc.text.split('\n').find(l => zbSearchFold(l).includes(words[0])) || '';
    hits.push({ doc, line, rank: (inTitle ? 0 : 2) + (doc.kind === 'resource' ? 1 : 0) });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return { hits: hits.slice(0, limit), total: hits.length };
}
