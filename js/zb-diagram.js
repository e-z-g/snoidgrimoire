/* zb-diagram.js -- a puzzle's diagram (zb-puzzle.js) as SVG text.
   =========================================================================
   Needs nothing. The page gives it the band's sprites and the trait
   sprites as images (a data URL each, with the image's size and where its
   origin is), and the colours for the roles; utilities/diagram_shot.mjs
   gives it the same from node, to look at a diagram without the page.

     zbDiagramSvg(diagram, { zoombini(i, faded), trait(kind, value),
                             colour(role) }, scale)

   zoombini(i) and trait(kind, value) return { url, width, height, ox, oy }
   or null (then a placeholder is drawn). A Zoombini stands on the item's
   x, y: the bottom of its picture there, its origin above it (the script's
   origin is mid-body); a trait sprite is centred there. Sprites
   are drawn pixel for pixel, a Zoombini at its own size and a trait at
   twice its size on a light chip (chip: false for none), unless the item
   gives a scale.
*/

const ZB_DIAGRAM_ROLES = {
  ink: '#d9dfe8', dim: '#8c97a9', line: '#46536a', accent: '#7fc3ff', good: '#7fd49a', bad: '#ef8a80',
  warn: '#e8b86a', water: '#1d3a5c', stone: '#5b6170', wood: '#8a6a45', grass: '#2e4a2c', panel: '#161d29', chip: '#c9d3e0',
};

function zbDiagramSvg(d, sprites, scale = 1) {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = c => c == null ? 'none' : /^#/.test(c) ? c : (sprites.colour ? sprites.colour(c) : null) || ZB_DIAGRAM_ROLES[c] || c;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width * scale}" height="${d.height * scale}">`];
  for (const it of d.items) {
    const stroke = it.stroke ? ` stroke="${col(it.stroke)}" stroke-width="${it.width || 1.5}"` : '';
    const dash = it.dash ? ` stroke-dasharray="${it.dash === true ? '5 4' : it.dash}"` : '';
    const op = it.faded ? ' opacity="0.35"' : '';
    if (it.t === 'rect') out.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}"${it.r ? ` rx="${it.r}"` : ''} fill="${col(it.fill)}"${stroke}${dash}${op}/>`);
    else if (it.t === 'line') out.push(`<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${col(it.stroke || 'line')}" stroke-width="${it.width || 1.5}"${dash}${op}/>`);
    else if (it.t === 'poly') {
      const pts = []; for (let k = 0; k + 1 < it.points.length; k += 2) pts.push(`${it.points[k]},${it.points[k + 1]}`);
      out.push(`<${it.closed === false ? 'polyline' : 'polygon'} points="${pts.join(' ')}" fill="${col(it.closed === false ? null : it.fill)}"${stroke}${dash}${op}/>`);
    } else if (it.t === 'circle') out.push(`<circle cx="${it.x}" cy="${it.y}" r="${it.r}" fill="${col(it.fill)}"${stroke}${dash}${op}/>`);
    else if (it.t === 'text') out.push(`<text x="${it.x}" y="${it.y}" font-size="${it.size || 13}" text-anchor="${it.anchor || 'start'}" fill="${col(it.fill || 'ink')}"${it.weight ? ` font-weight="${it.weight}"` : ''} font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"${op}>${esc(it.text)}</text>`);
    else if (it.t === 'zoombini' || it.t === 'trait') {
      const s = it.t === 'zoombini' ? sprites.zoombini(it.i) : sprites.trait(it.kind, it.value);
      const k = it.scale || (it.t === 'zoombini' ? 1 : 2);
      if (!s) {
        out.push(it.t === 'zoombini'
          ? `<g${op}><circle cx="${it.x}" cy="${it.y - 20 * k}" r="${14 * k}" fill="${col('accent')}" opacity="0.5"/><text x="${it.x}" y="${it.y - 15 * k}" font-size="${13 * k}" text-anchor="middle" fill="${col('ink')}">${it.i + 1}</text></g>`
          : `<circle cx="${it.x}" cy="${it.y}" r="${8 * k}" fill="${col('dim')}"${op}/>`);
        continue;
      }
      /* A Zoombini's script origin is mid-body; it stands on its picture's
         bottom row, over its origin. */
      const x = it.t === 'zoombini' ? it.x - s.ox * k : it.x - s.width * k / 2, y = it.t === 'zoombini' ? it.y - s.height * k : it.y - s.height * k / 2;
      /* A trait alone is a small dark thing: on a light chip it shows. */
      if (it.t === 'trait' && it.chip !== false) out.push(`<rect x="${x - 3}" y="${y - 3}" width="${s.width * k + 6}" height="${s.height * k + 6}" rx="4" fill="${col('chip')}"${op}/>`);
      out.push(`<image href="${s.url}" x="${x}" y="${y}" width="${s.width * k}" height="${s.height * k}" style="image-rendering:pixelated"${op}/>`);
      if (it.t === 'zoombini' && it.label !== false) out.push(`<text x="${it.x}" y="${it.y + 12 * k}" font-size="${10 * k}" text-anchor="middle" fill="${col('dim')}"${op}>${it.label != null ? esc(it.label) : it.i + 1}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}
