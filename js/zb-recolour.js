/* zb-recolour.js -- a Zoombini part recoloured wherever the game draws it:
   the generalising of the extraction project's tools/mod_red_shaggy.py,
   which turned Shaggy hair's purples into the red nose's reds.
   =========================================================================
   Needs zb-mohawk.js, zb-bitmap.js, zb-snoid.js and zb-write.js.

   Only palette entries 10-45 are the same in every scene, so a Zoombini's
   art keeps to them, and so must a recolouring, or a colour right in one
   scene is wrong in the next. They fall into families of shades
   (ZB_RECOLOUR_FAMILIES, read off the palette: each a hue, dark to light).
   A recolouring maps one family onto another shade for shade, by place in
   the family, darkest to darkest and lightest to lightest
   (zbRecolourMap).

   A part's frames are its variant's block in each Zoombini sheet (tBMP 3000
   walking, 3100 tumbling, 3200 far off, as zb-snoid.js has them), the
   builder's big figure (PICKER tBMP 4300: body 0, then each part's five
   from 1, 6, 11, 16) and its tile, up and pressed (PICKER tBMP 4400: two a
   variant, the rows hair, eyes, nose, feet). Skin is every frame of the
   three sheets and the big figure, the skin's shades being on the parts
   too (eyelids, the shading under hair); the tiles' stone is left alone.
   A recoloured frame is written raw, as mod_red_shaggy.py writes it, and
   utilities/recolour_check.mjs holds Shaggy's purples to reds to its
   output byte for byte. */

const ZB_RECOLOUR_FAMILIES = [
  { key: 'greys', name: 'Greys', shades: [11, 12, 13, 14, 10] },
  { key: 'skin', name: 'Zoombini blue', shades: [15, 16, 17, 18, 19, 20] },
  { key: 'purples', name: 'Purples', shades: [21, 22, 23] },
  { key: 'magentas', name: 'Magentas', shades: [24, 25, 26, 27] },
  { key: 'indigos', name: 'Indigos', shades: [28, 29, 30] },
  { key: 'greens', name: 'Greens', shades: [31, 32, 33, 34] },
  { key: 'oranges', name: 'Oranges', shades: [35, 36, 37] },
  { key: 'reds', name: 'Reds', shades: [38, 39, 40] },
  { key: 'earth', name: 'Brown to lemon', shades: [41, 42, 43] },
];
const ZB_RECOLOUR_BIG = { body: 0, hair: 1, eyes: 6, nose: 11, feet: 16 };
const ZB_RECOLOUR_TILE_ROW = { hair: 0, eyes: 1, nose: 2, feet: 3 };

function zbRecolourFamilyOf(index) { return ZB_RECOLOUR_FAMILIES.find(f => f.shades.includes(index)) || null; }

/* Source family onto target family, shade for shade by place. */
function zbRecolourMap(from, to) {
  const a = ZB_RECOLOUR_FAMILIES.find(f => f.key === from).shades, b = ZB_RECOLOUR_FAMILIES.find(f => f.key === to).shades;
  const map = new Map();
  a.forEach((c, i) => map.set(c, b[a.length === 1 ? b.length - 1 : Math.round(i * (b.length - 1) / (a.length - 1))]));
  return map;
}

/* Which frames draw a part's variant (1-5), or skin: [{ archive, sheet, frames }]. */
function zbRecolourFrames(part, v) {
  const out = [];
  const block = (blocks, sheet) => {
    const b = blocks[part], k = part === 'body' ? 0 : v - 1;
    const start = b.base[k];
    out.push({ archive: 'ZOOMBINI', sheet, frames: Array.from({ length: 2 * b.poses[k] }, (_, i) => start + i) });
  };
  if (part === 'skin') {
    for (const [sheet, n] of [[3000, 850], [3100, 756], [3200, 568]]) out.push({ archive: 'ZOOMBINI', sheet, frames: Array.from({ length: n }, (_, i) => i) });
    out.push({ archive: 'PICKER', sheet: 4300, frames: Array.from({ length: 21 }, (_, i) => i) });
    return out;
  }
  block(ZB_SNOID_BLOCKS, 3000);
  block(ZB_SNOID_TUMBLE_BLOCKS, 3100);
  block(ZB_SNOID_SMALL_BLOCKS, 3200);
  out.push({ archive: 'PICKER', sheet: 4300, frames: [ZB_RECOLOUR_BIG[part] + (part === 'body' ? 0 : v - 1)] });
  if (part in ZB_RECOLOUR_TILE_ROW) { const t = 2 * (ZB_RECOLOUR_TILE_ROW[part] * 5 + v - 1); out.push({ archive: 'PICKER', sheet: 4400, frames: [t, t + 1] }); }
  return out;
}

/* How often each shared colour is drawn in a part's frames of tBMP 3000:
   Map index -> pixels. */
function zbRecolourColours(zoombini, part, v) {
  const d = decodeBitmapResource(zoombini.get('tBMP', 3000)), counts = new Map();
  for (const f of zbRecolourFrames(part, v).find(x => x.sheet === 3000).frames) for (const c of d.frames[f].pixels) if (c) counts.set(c, (counts.get(c) || 0) + 1);
  return counts;
}

/* The recoloured resources, by archive: { ZOOMBINI: [{ tag, id, bytes }],
   PICKER: [...] }, each sheet built from the archive as it is now. */
function zbRecolour(archives, part, v, map) {
  const out = { ZOOMBINI: [], PICKER: [] }, bySheet = new Map();
  for (const g of zbRecolourFrames(part, v)) {
    const k = `${g.archive} ${g.sheet}`;
    if (!bySheet.has(k)) bySheet.set(k, { archive: g.archive, sheet: g.sheet, frames: [] });
    bySheet.get(k).frames.push(...g.frames);
  }
  for (const { archive, sheet, frames } of bySheet.values()) {
    const arc = archives.get(archive), old = arc.get('tBMP', sheet);
    const decoded = decodeBitmapResource(old).frames, subs = zbSheetFrames(old).slice();
    for (const i of frames) {
      const f = decoded[i];
      subs[i] = zbRawFrame(f.width, f.height, f.pixels.map(c => (map.has(c) ? map.get(c) : c)));
    }
    out[archive].push({ tag: 'tBMP', id: sheet, bytes: zbSheetBytes(old, subs) });
  }
  return out;
}
