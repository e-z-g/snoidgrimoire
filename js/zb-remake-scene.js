/* zb-remake-scene.js -- what a scene of the 2015 remake draws as it opens:
   its sprites and its uniSWF clips, each placed in the world, in the order
   Unity draws them, and the camera's view.
   =========================================================================
   A scene file (level<n>) has GameObjects, each with a Transform and its
   components. A GameObject draws only where it and every parent are active.
   Each Transform has a local position, rotation and scale and a parent
   (m_Father). The world matrix is the parent's world matrix times the
   local one. The scenes are flat, so a rotation is read about z only.
   A SpriteRenderer draws its Sprite with the sprite's pivot at the origin,
   m_Rect's size divided by m_PixelsToUnits in world units, y up.
   A MovieClipBehaviour (pumpkin.swf, doc/remake/uniswf.md in the
   workbench) draws a clip of a .swf in Resources, in Flash's pixels with y
   down, scaled by its drawScale, on its MeshRenderer's sorting layer and
   order. Its frame is gotoAndStopLabel's or gotoAndStopFrame's, else the
   first.
   Unity sorts by sorting layer (TagManager's order), then order in layer,
   then distance from the camera, farthest first. A UI canvas lays its
   RectTransforms out on the screen, so a GameObject under a Canvas is left
   out, and so is one with no SpriteRenderer or clip.
   The scene's code moves things, turns them on and off and sets clips'
   frames as it runs, and the reader does none of that.

   The reader is given an accessor:
     api.objects(file)        [{ pathId, classId }]
     api.read(file, pathId)   a Promise of the object's fields, a
                              MonoBehaviour's with its script's fields
                              where the layouts are open
     api.target(file, pptr)   { file, pathId } or null
   =========================================================================
   Pure: no DOM. LOAD ORDER: after zb-unity.js. */

/* A 2D affine matrix [a, b, c, d, tx, ty]: (x, y) -> (a x + c y + tx, b x + d y + ty). */
function zbSceneMul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

/* A Transform's local matrix about z, and its z. */
function zbSceneLocal(t) {
  const q = t.m_LocalRotation, p = t.m_LocalPosition, s = t.m_LocalScale;
  // The rotation's xy block, from the quaternion's full matrix.
  const r00 = 1 - 2 * (q.y * q.y + q.z * q.z), r01 = 2 * (q.x * q.y - q.z * q.w);
  const r10 = 2 * (q.x * q.y + q.z * q.w), r11 = 1 - 2 * (q.x * q.x + q.z * q.z);
  return { m: [r00 * s.x, r10 * s.x, r01 * s.y, r11 * s.y, p.x, p.y], z: p.z, sz: s.z };
}

/* The scene's draw list: { camera: { x, y, size } or null, items }, each
   item { kind: 'sprite', file, pathId, matrix, color, flipX, flipY } or
   { kind: 'clip', swf, symbol, label, frame, matrix, color }, with name
   (the GameObject's), layer, order and z, in drawing order. With root, a
   GameObject's path id, the list is of that GameObject and the ones under
   it, as for a prefab in Resources, and the root's own position counts. */
async function zbRemakeScene(file, api, sortingLayers = [], root = null) {
  const objs = api.objects(file);
  const byId = new Map(objs.map(o => [o.pathId, o]));
  const read = new Map();
  const get = async id => {
    if (!read.has(id)) read.set(id, await api.read(file, id));
    return read.get(id);
  };
  const local = pptr => pptr && pptr.m_FileID === 0 && byId.has(pptr.m_PathID) ? pptr.m_PathID : null;

  // Every GameObject's components, and every Transform's world matrix.
  const gos = new Map(), transformOf = new Map();
  if (root == null) { for (const o of objs) if (o.classId === 1) gos.set(o.pathId, await get(o.pathId)); }
  else for (const stack = [root]; stack.length;) {
    // The GameObjects under the root, through each Transform's children.
    const g = stack.pop(), go = await get(g);
    gos.set(g, go);
    for (const c of go.m_Component || []) {
      const cid = local(c.component);
      if (cid == null || ![4, 224].includes(byId.get(cid).classId)) continue;
      for (const child of (await get(cid)).m_Children || []) {
        const ct = local(child), cg = ct != null && local((await get(ct)).m_GameObject);
        if (cg != null && cg !== false) stack.push(cg);
      }
    }
  }
  const comps = new Map();   // GameObject id -> [{ id, classId }]
  for (const [id, go] of gos) {
    const list = [];
    for (const c of go.m_Component || []) {
      const cid = local(c.component);
      if (cid != null) list.push({ id: cid, classId: byId.get(cid).classId });
    }
    comps.set(id, list);
    const t = list.find(c => c.classId === 4 || c.classId === 224);
    if (t) transformOf.set(id, t.id);
  }
  const goOfTransform = new Map([...transformOf].map(([g, t]) => [t, g]));
  const world = new Map();
  const worldOf = async tid => {
    if (world.has(tid)) return world.get(tid);
    const t = await get(tid), l = zbSceneLocal(t), father = root == null || goOfTransform.get(tid) !== root ? local(t.m_Father) : null;
    let w;
    if (father == null) w = { m: l.m, z: l.z, sz: l.sz, active: true, canvas: false };
    else {
      const f = await worldOf(father);
      w = { m: zbSceneMul(f.m, l.m), z: f.z + l.z * f.sz, sz: f.sz * l.sz, active: f.active, canvas: f.canvas };
    }
    const g = goOfTransform.get(tid);
    if (g != null) {
      w.active = w.active && !!gos.get(g).m_IsActive;
      w.canvas = w.canvas || comps.get(g).some(c => c.classId === 223);
      w.name = gos.get(g).m_Name;
    }
    world.set(tid, w);
    return w;
  };

  // A renderer's layer id is signed, and TagManager's unsigned.
  const layerRank = new Map(sortingLayers.map((l, i) => [l.uniqueID >>> 0, i]));
  const items = [];
  let camera = null;
  for (const [g, list] of comps) {
    const tid = transformOf.get(g);
    if (tid == null) continue;
    const w = await worldOf(tid);
    if (!w.active || w.canvas) continue;
    const renderer = list.find(c => c.classId === 23);
    for (const c of list) {
      if (c.classId === 20) {
        const cam = await get(c.id);
        if (cam.m_Enabled && cam.orthographic && !camera) camera = { x: w.m[4], y: w.m[5], size: cam['orthographic size'], name: w.name };
      } else if (c.classId === 212) {
        const r = await get(c.id), at = api.target(file, r.m_Sprite);
        if (!r.m_Enabled || !at) continue;
        items.push({ kind: 'sprite', file: at.file, pathId: at.pathId, matrix: w.m, color: r.m_Color, flipX: !!r.m_FlipX, flipY: !!r.m_FlipY,
          name: w.name, layer: layerRank.get(r.m_SortingLayerID >>> 0) ?? 0, order: r.m_SortingOrder, z: w.z });
      } else if (c.classId === 114) {
        const b = await get(c.id);
        if (!b || !b.m_Enabled || typeof b.swf !== 'string' || typeof b.symbolName !== 'string' || !b.symbolName) continue;
        const r = renderer ? await get(renderer.id) : null;
        if (r && !r.m_Enabled) continue;
        const s = b.drawScale || { x: 1, y: 1 };
        // Flash's y runs down, and flipY turns the clip over.
        const m = zbSceneMul(w.m, [s.x, 0, 0, b.flipY ? s.y : -s.y, 0, 0]);
        items.push({ kind: 'clip', swf: b.swf, symbol: b.symbolName, label: b.gotoAndStopLabel || null, frame: b.gotoAndStopFrame || 0,
          matrix: m, color: b.colorTransform || null, name: w.name,
          layer: r ? layerRank.get(r.m_SortingLayerID >>> 0) ?? 0 : 0, order: r ? r.m_SortingOrder : 0, z: w.z });
      }
    }
  }
  // Unity's order is the layer, the order in layer, then the farther (larger z) first. Ties stay in the file's order.
  items.sort((p, q) => p.layer - q.layer || p.order - q.order || q.z - p.z);
  return { camera, items };
}

/* A sprite's quad: { texture (a PPtr), src [x, y, w, h] from the texture's
   top left, dst [x0, y0, x1, y1] in the sprite's units with y up,
   rotation (the packing's) }. A packed sprite's tight rect sits at
   textureRectOffset within m_Rect. */
function zbSceneSpriteQuad(sprite, texHeight) {
  const rd = sprite.m_RD, tr = rd.textureRect, off = rd.textureRectOffset, ppu = sprite.m_PixelsToUnits;
  const rect = sprite.m_Rect, piv = sprite.m_Pivot;
  const x0 = (off.x - piv.x * rect.width) / ppu, y0 = (off.y - piv.y * rect.height) / ppu;
  return {
    texture: rd.texture,
    src: [tr.x, texHeight - tr.y - tr.height, tr.width, tr.height],
    dst: [x0, y0, x0 + tr.width / ppu, y0 + tr.height / ppu],
    rotation: (rd.settingsRaw >> 2) & 15,
  };
}
