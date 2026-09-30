/* page-town.js -- Zoombiniville all round, with depth: standing in the
   town, in a headset or on a screen.
   =========================================================================

   The town page scrolls a 640-pixel window round a world 1920 pixels
   round (zb-town.js reads it). Seen from its middle as the scrolling shows
   it, that world is a cylinder: a pixel is 1/1920 of a turn across and as
   tall at eye height, and row HORIZON is level with the eye.

   Then it is given depth, which the game never had, so that a headset or
   the ways of showing depth on a flat screen have something to show. The
   land's rows below the horizon are laid down as a floor EYE metres below
   the eye, each as far off as it must be to be seen at its height, out to
   FAR; the rest of the land is a wall FAR off. Each thing standing on it
   -- a house, a reward building, a lamp post, an inhabitant, the clock's
   hands -- is a card standing up where the floor meets its foot (its
   lowest painted row), or just before the wall when its foot is above the
   horizon. Every point keeps the direction it had from the middle, so from
   there the picture is the game's, unchanged; an eye moved aside, or a
   second eye, is what shows the depth. HORIZON, EYE and FAR are this
   file's guesses: nothing in the game says where its camera stood.

   Depth on a screen (TV.depth): none; Sway, the eye swinging SWAY metres
   either side every SWAY_S seconds, turning to hold still what is FOCUS
   metres ahead; Red-cyan, two eyes STEREO apart drawn in red and in green
   and blue, for the glasses, meeting at FOCUS; Cardboard, the two eyes
   side by side, IPD apart, for a phone in a viewer, full screen and moved
   by the phone. A headset (WebXR) draws its own two eyes and follows the
   head, so it shows the depth by itself; its select (a trigger, a pinch)
   steps the town through five stages from empty to full.

   Controls: the number of Zoombinis in town (0-625), which builds the
   houses, and the reward buildings earned (0-16); the inhabitants and the
   clock follow the game's rules (zbTownScene), and which inhabitants is
   the first so many of the eight, where the game draws lots. Looking
   about: drag, the arrow keys, the wheel or a pinch for the field of view,
   and on a phone its own motion.

   Drawn with WebGL, no library: the land as one texture, every sprite in
   an atlas, the land as a mesh, each thing as a card, and the moving
   things' cards made again when a frame changes.

   The page's own script: DOM here. LOAD ORDER: after page-map.js; page-
   browse.js's route() calls townRoute. */

const TOWN_TUNE = { HORIZON: 290, EYE: 1.6, FAR: 45, fov: 70, fovMin: 25, fovMax: 100, segments: 240,
  SWAY: 0.18, SWAY_S: 3, FOCUS: 6, STEREO: 0.12, IPD: 0.064 };
const TOWN_STAGES = [[0, 0], [156, 4], [312, 8], [468, 12], [625, 16]];
const TV = { yaw: 0, pitch: 0, fov: TOWN_TUNE.fov, people: 625, rewards: 16, smooth: false, motion: null, xr: null, depth: 'none' };
let TWORLD = null, TFROM = null, TPAL = null, TSCENE = null, TGL = null, TLAND = null, TATLAS = null;
let TANIM = [];                   // the inhabitants shown: { inh, frame, next, interval, rho }
let TCLOCK = null;                // { shapes, rho } while the clock has hands
let TAUDIO = null, TDYN = true;   // TDYN: the moving things' cards want making again
const TFEET = new Map();          // 'id/shape' -> its foot row
const T_A = 2 * Math.PI / ZB_TOWN_WIDTH;

/* ---- where things are ----------------------------------------------------- */

function tTheta(x) { return (x - 320) * T_A; }
// How far off the floor is where it is seen at a row; FAR at the horizon and above.
function tFloorDist(row) {
  const d = row - TOWN_TUNE.HORIZON;
  return d > 0 ? Math.min(TOWN_TUNE.FAR, TOWN_TUNE.EYE / (d * T_A)) : TOWN_TUNE.FAR;
}
// Where a thing whose foot is on a row stands: a little before the floor
// there, or before the wall.
function tStandDist(footRow) {
  const d = tFloorDist(footRow + 1);
  return d >= TOWN_TUNE.FAR ? TOWN_TUNE.FAR * 0.97 : d * 0.995;
}
function tFoot(id, shape) {
  const k = id + '/' + shape;
  if (!TFEET.has(k)) TFEET.set(k, zbSpriteFoot(TWORLD.sheets[id][shape - 1]));
  return TFEET.get(k);
}
// A vertex: the picture's point (x, y), rho metres off horizontally, keeping
// its direction from the middle; u, v into the texture; fade into the average.
function tPush(out, x, y, rho, u, v, fade) {
  const t = tTheta(x);
  out.push(rho * Math.sin(t), rho * (TOWN_TUNE.HORIZON - y) * T_A, -rho * Math.cos(t), u, v, fade);
}
// A sprite at (x, y) as a card rho off, curved as the picture is.
function tCard(out, r, x, y, rho) {
  const f = r.f, n = Math.max(1, Math.ceil(f.width / 8));
  for (let k = 0; k < n; k++) {
    const xa = x + f.width * k / n, xb = x + f.width * (k + 1) / n;
    const ua = r.u0 + (r.u1 - r.u0) * k / n, ub = r.u0 + (r.u1 - r.u0) * (k + 1) / n, top = y, bot = y + f.height;
    tPush(out, xa, top, rho, ua, r.v0, 0); tPush(out, xa, bot, rho, ua, r.v1, 0); tPush(out, xb, top, rho, ub, r.v0, 0);
    tPush(out, xb, top, rho, ub, r.v0, 0); tPush(out, xa, bot, rho, ua, r.v1, 0); tPush(out, xb, bot, rho, ub, r.v1, 0);
  }
}

/* ---- the pictures ----------------------------------------------------------- */

function townLand() {
  const c = document.createElement('canvas');
  c.width = ZB_TOWN_WIDTH; c.height = ZB_TOWN_HEIGHT;
  const g = c.getContext('2d');
  for (const l of TWORLD.land) g.drawImage(indexedCanvas(TWORLD.sheets[1000][l.shape - 1], TPAL, false), l.x, 0);
  return c;
}

/* Every sprite that stands in the town, packed in rows into one picture:
   tBMP 1000's shapes 7-80, and all of 4000 and 6000. */
function townAtlas() {
  const list = [];
  for (const id of [1000, 4000, 6000]) TWORLD.sheets[id].forEach((f, i) => {
    if (id === 1000 && (i < 6 || i >= 80)) return;
    list.push({ key: id + '/' + (i + 1), f });
  });
  list.sort((a, b) => b.f.height - a.f.height);
  const W = 2048, pad = 2;
  let x = pad, y = pad, rowH = 0;
  for (const s of list) {
    if (x + s.f.width + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
    s.ax = x; s.ay = y; x += s.f.width + pad; rowH = Math.max(rowH, s.f.height);
  }
  const H = y + rowH + pad, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (const s of list) if (s.f.width && s.f.height) g.drawImage(indexedCanvas(s.f, TPAL, true), s.ax, s.ay);
  const rects = new Map(list.map(s => [s.key, { f: s.f, u0: s.ax / W, v0: s.ay / H, u1: (s.ax + s.f.width) / W, v1: (s.ay + s.f.height) / H }]));
  return { canvas: c, rects };
}

/* The town for the numbers picked: the things' cards, and the moving ones. */
function townBuild() {
  TSCENE = zbTownScene(TWORLD, TV.people, TV.rewards);
  const data = [];
  for (const t of TSCENE.things) tCard(data, TATLAS.rects.get('1000/' + t.shape), t.x, t.y, tStandDist(t.y + tFoot(1000, t.shape)));
  townMesh('things', data);
  const now = performance.now();
  TANIM = TWORLD.inhabitants.slice(0, Math.min(TSCENE.inhabitants, TWORLD.inhabitants.length)).map((inh, i) => {
    // One distance for all its frames, from the lowest foot among them.
    let foot = -Infinity;
    for (const f of inh.frames) if (f) foot = Math.max(foot, f.y + tFoot(4000, f.shape));
    // The game gives each a frame interval of 4 to 6 ticks of 60 a second
    // and a start at random; here they are spread the same way, fixed.
    return { inh, frame: (i * 7) % inh.frames.length, interval: (4 + (i % 3)) * 1000 / 60, next: now, rho: tStandDist(foot) };
  });
  const tower = TSCENE.things.find(t => t.gate && t.gate.reward === ZB_TOWN_CLOCK_SLOT);
  TCLOCK = TSCENE.clock ? { shapes: null, rho: (tower ? tStandDist(tower.y + tFoot(1000, tower.shape)) : TOWN_TUNE.FAR * 0.97) * 0.99 } : null;
  TDYN = true;
}

// The moving things' cards, made again when one has changed.
function townDynamic() {
  const data = [];
  for (const a of TANIM) {
    const f = a.inh.frames[a.frame];
    if (f) tCard(data, TATLAS.rects.get('4000/' + f.shape), f.x, f.y, a.rho);
  }
  if (TCLOCK) {
    const d = new Date(), s = zbTownClockShapes(d.getHours(), d.getMinutes()), c = TWORLD.clock;
    TCLOCK.shapes = s.hour + '/' + s.minute;
    for (const shape of [s.hour, s.minute]) tCard(data, TATLAS.rects.get('6000/' + shape), c.x - (c.regs.x[shape] || 0), c.y - (c.regs.y[shape] || 0), TCLOCK.rho);
  }
  townMesh('moving', data);
  TDYN = false;
}

function townTick(now) {
  if (!TGL) return;
  for (const a of TANIM) {
    if (now < a.next) continue;
    a.next = Math.max(a.next + a.interval, now - 200);
    a.frame = (a.frame + 1) % a.inh.frames.length;
    TDYN = true;
  }
  if (TCLOCK) {
    const d = new Date(), s = zbTownClockShapes(d.getHours(), d.getMinutes());
    if (TCLOCK.shapes !== s.hour + '/' + s.minute) TDYN = true;
  }
  if (TDYN) townDynamic();
}

/* ---- WebGL -------------------------------------------------------------- */

const TOWN_VS = `attribute vec3 aPos; attribute vec2 aUv; attribute float aFade;
uniform mat4 uProj; uniform mat4 uView; varying vec2 vUv; varying float vFade;
void main() { vUv = aUv; vFade = aFade; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
/* uCut drops a sprite's transparent pixels, so a card has its sprite's
   shape. On the floor and the sky uBlur blurs the picture's edge row along
   the rim, and it fades into the average by a third of the way in, so it
   reads as ground and sky rather than as stripes. */
const TOWN_FS = `precision mediump float; uniform sampler2D uTex; uniform vec3 uAvg; uniform float uBlur; uniform float uCut;
varying vec2 vUv; varying float vFade;
void main() {
  vec4 t = texture2D(uTex, vUv);
  if (uCut > 0.5 && t.a < 0.5) discard;
  vec3 c = t.rgb;
  if (uBlur > 0.0) {
    c = vec3(0.0);
    for (int i = -4; i <= 4; i++) c += texture2D(uTex, vUv + vec2(float(i) * uBlur, 0.0)).rgb;
    c /= 9.0;
  }
  gl_FragColor = vec4(mix(c, uAvg, smoothstep(0.0, 0.35, vFade)), 1.0);
}`;

function townGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, xrCompatible: true }) || canvas.getContext('webgl', { antialias: true, xrCompatible: true });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, TOWN_VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, TOWN_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const u = n => gl.getUniformLocation(prog, n);
  const loc = { pos: gl.getAttribLocation(prog, 'aPos'), uv: gl.getAttribLocation(prog, 'aUv'), fade: gl.getAttribLocation(prog, 'aFade'),
    proj: u('uProj'), view: u('uView'), avg: u('uAvg'), blur: u('uBlur'), cut: u('uCut'), tex: u('uTex') };
  return { gl, prog, loc, land: gl.createTexture(), atlas: gl.createTexture(), meshes: {} };
}

/* A mesh by name: its buffer, how many vertices, and an index buffer when
   it has one. */
function townMesh(name, data, index) {
  const gl = TGL.gl, m = TGL.meshes[name] || (TGL.meshes[name] = { buf: gl.createBuffer(), ibuf: null });
  gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), name === 'moving' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  m.count = index ? index.length : data.length / 6;
  if (index) {
    m.ibuf = m.ibuf || gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
  }
}

/* The land: rows every 8 pixels above the horizon, every 2 below, where
   the floor's distance changes fast; and the floor and the sky as fans
   from its bottom and top rims to the middle. */
function townLandMeshes() {
  const { HORIZON: H, EYE, FAR, segments: S } = TOWN_TUNE;
  const rows = [];
  for (let y = 0; y < H - 8; y += 8) rows.push(y);
  for (let y = H - 8; y <= ZB_TOWN_HEIGHT; y += 2) rows.push(y);
  const data = [], index = [];
  for (const y of rows) for (let i = 0; i <= S; i++) { const x = i * ZB_TOWN_WIDTH / S; tPush(data, x, y, tFloorDist(y), x / ZB_TOWN_WIDTH, y / ZB_TOWN_HEIGHT, 0); }
  for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i < S; i++) {
    const a = j * (S + 1) + i, c = a + S + 1;
    index.push(a, c, a + 1, a + 1, c, c + 1);
  }
  townMesh('land', data, index);
  const floor = [], sky = [], rimFloor = tFloorDist(ZB_TOWN_HEIGHT), vTop = 0.5 / ZB_TOWN_HEIGHT, vBottom = 1 - 0.5 / ZB_TOWN_HEIGHT;
  const skyTop = FAR * H * T_A;
  for (let i = 0; i < S; i++) {
    const x0 = i * ZB_TOWN_WIDTH / S, x1 = (i + 1) * ZB_TOWN_WIDTH / S, u0 = x0 / ZB_TOWN_WIDTH, u1 = x1 / ZB_TOWN_WIDTH, um = (u0 + u1) / 2;
    tPush(floor, x0, ZB_TOWN_HEIGHT, rimFloor, u0, vBottom, 0); floor.push(0, -EYE, 0, um, vBottom, 1); tPush(floor, x1, ZB_TOWN_HEIGHT, rimFloor, u1, vBottom, 0);
    tPush(sky, x0, 0, FAR, u0, vTop, 0); tPush(sky, x1, 0, FAR, u1, vTop, 0); sky.push(0, skyTop + FAR * 0.6, 0, um, vTop, 1);
  }
  townMesh('floor', floor);
  townMesh('sky', sky);
}

function townAverages() {
  const g = TLAND.getContext('2d'), avg = row => {
    const d = g.getImageData(0, row, ZB_TOWN_WIDTH, 1).data, c = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; }
    return c.map(v => v / ZB_TOWN_WIDTH / 255);
  };
  return { top: avg(0), bottom: avg(ZB_TOWN_HEIGHT - 1) };
}

function townTextures() {
  const gl = TGL.gl;
  for (const [tex, src] of [[TGL.land, TLAND], [TGL.atlas, TATLAS.canvas]]) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  TGL.avgs = townAverages();
  townFilter();
}
function townFilter() {
  const gl = TGL.gl;
  for (const tex of [TGL.land, TGL.atlas]) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, TV.smooth ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
}

function townDraw(proj, view) {
  const T = TGL, gl = T.gl, L = T.loc;
  gl.useProgram(T.prog);
  gl.uniformMatrix4fv(L.proj, false, proj);
  gl.uniformMatrix4fv(L.view, false, view);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(L.tex, 0);
  for (const [name, tex, avg, cut] of [['land', T.land, null, 0], ['floor', T.land, 'bottom', 0], ['sky', T.land, 'top', 0], ['things', T.atlas, null, 1], ['moving', T.atlas, null, 1]]) {
    const m = T.meshes[name];
    if (!m || !m.count) continue;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.enableVertexAttribArray(L.pos); gl.vertexAttribPointer(L.pos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, 24, 12);
    gl.enableVertexAttribArray(L.fade); gl.vertexAttribPointer(L.fade, 1, gl.FLOAT, false, 24, 20);
    const a = (avg && T.avgs && T.avgs[avg]) || [0, 0, 0];
    gl.uniform3f(L.avg, a[0], a[1], a[2]);
    gl.uniform1f(L.blur, avg ? 10 / ZB_TOWN_WIDTH : 0);
    gl.uniform1f(L.cut, cut);
    if (m.ibuf) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibuf); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0); }
    else gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }
}

/* ---- matrices ------------------------------------------------------------ */

function tPerspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
// The view for a yaw (to the right) and a pitch (up): Rx(-pitch) Ry(yaw).
function tYawPitch(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Column-major.
  return new Float32Array([cy, -sp * sy, -cp * sy, 0, 0, cp, -sp, 0, sy, sp * cy, cp * cy, 0, 0, 0, 0, 1]);
}
// A rotation quaternion's inverse as a view matrix, column-major.
function tQuatView(q) {
  const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0, 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0, 0, 0, 0, 1]);
}
function tQuatMul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
const tQuatAxis = (ax, ay, az, a) => [ax * Math.sin(a / 2), ay * Math.sin(a / 2), az * Math.sin(a / 2), Math.cos(a / 2)];
// An eye d metres to the right of the middle, looking the same way.
function tEye(view, d) { const m = view.slice(); m[12] -= d; return m; }
/* The projection for that eye, its frustum shifted so that what is focus
   metres straight ahead stays in the middle of the screen (no shift for
   focus 0: the eyes look parallel, as in a viewer). */
function tShift(proj, d, focus) { const p = proj.slice(); if (focus) p[8] = -d * p[0] / focus; return p; }

/* A phone's orientation as a quaternion, as three.js's
   DeviceOrientationControls works it out: the angles as a YXZ rotation,
   then a quarter turn about x (the camera looks out of the back of the
   phone, not down through it), then the screen's own rotation. */
function tDeviceQuat(alpha, beta, gamma, screenAngle) {
  const d = Math.PI / 180, [x, y, z] = [beta * d / 2, alpha * d / 2, -gamma * d / 2];
  const c1 = Math.cos(x), s1 = Math.sin(x), c2 = Math.cos(y), s2 = Math.sin(y), c3 = Math.cos(z), s3 = Math.sin(z);
  let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  q = tQuatMul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  return tQuatMul(q, tQuatAxis(0, 0, 1, -screenAngle * d));
}

/* ---- the view on a screen ------------------------------------------------ */

function townView() {
  if (TV.motion && TV.motion.q) return tQuatView(tQuatMul(tQuatAxis(0, 1, 0, -TV.motion.yaw0), TV.motion.q));
  return tYawPitch(TV.yaw, TV.pitch);
}

let TRAF = 0;
function townLoop(now) {
  TRAF = 0;
  if ($('town').hidden || TV.xr) return;
  townTick(now);
  const c = $('tcanvas'), gl = TGL.gl, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  const view = townView(), fov = TV.fov * Math.PI / 180, T = TOWN_TUNE;
  if (TV.depth === 'cardboard') {
    const half = Math.floor(w / 2), proj = tPerspective(fov, half / Math.max(h, 1), 0.05, 200);
    [[-T.IPD / 2, 0], [T.IPD / 2, half]].forEach(([d, x]) => {
      gl.viewport(x, 0, half, h);
      townDraw(proj, tEye(view, d));
    });
  } else {
    const proj = tPerspective(fov, w / Math.max(h, 1), 0.05, 200);
    if (TV.depth === 'anaglyph') {
      for (const [d, mask] of [[-T.STEREO / 2, [true, false, false]], [T.STEREO / 2, [false, true, true]]]) {
        gl.colorMask(mask[0], mask[1], mask[2], true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        townDraw(tShift(proj, d, T.FOCUS), tEye(view, d));
      }
      gl.colorMask(true, true, true, true);
    } else {
      const d = TV.depth === 'sway' ? T.SWAY * Math.sin(2 * Math.PI * now / 1000 / T.SWAY_S) : 0;
      townDraw(tShift(proj, d, T.FOCUS), tEye(view, d));
    }
  }
  townCaption();
  TRAF = requestAnimationFrame(townLoop);
}
function townKick() { if (!TRAF && TGL && !TV.xr) TRAF = requestAnimationFrame(townLoop); }

// Where the view looks, from the view on a screen: its yaw and pitch.
function townLook() {
  if (TV.motion && TV.motion.q) {
    const m = townView();
    // The view's forward is its third row, negated.
    return { yaw: Math.atan2(-m[2], m[10]), pitch: Math.asin(Math.max(-1, Math.min(1, -m[6]))) };
  }
  return { yaw: TV.yaw, pitch: TV.pitch };
}
function townLookYaw() { return townLook().yaw; }
/* The reward building straight ahead, if one is: the topmost with a
   painted pixel within a few of the point of the picture looked at. */
function townCaption() {
  const look = townLook();
  const x = ((320 + look.yaw / T_A) % ZB_TOWN_WIDTH + ZB_TOWN_WIDTH) % ZB_TOWN_WIDTH;
  const y = TOWN_TUNE.HORIZON - Math.tan(look.pitch) / T_A;
  let hit = null;
  if (TV.depth !== 'cardboard') for (const t of TSCENE.things) {
    if (!t.gate || t.gate.reward == null) continue;
    const f = TWORLD.sheets[1000][t.shape - 1], dx = ((x - t.x) % ZB_TOWN_WIDTH + ZB_TOWN_WIDTH) % ZB_TOWN_WIDTH;
    for (let yy = Math.round(y - t.y) - 4; yy <= Math.round(y - t.y) + 4 && hit !== t; yy++) {
      if (yy < 0 || yy >= f.height) continue;
      for (let xx = Math.round(dx) - 4; xx <= Math.round(dx) + 4; xx++) if (xx >= 0 && xx < f.width && f.pixels[yy * f.width + xx]) { hit = t; break; }
    }
  }
  const text = hit ? `${ZB_TOWN_REWARDS[hit.gate.reward]} <small>the ${townNth(hit.gate.reward + 1)} reward building</small>` : '';
  const el = $('tcaption');
  if (el.dataset.text !== text) { el.dataset.text = text; el.innerHTML = text; el.hidden = !text; }
}
function townNth(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/* Depth on a screen. Cardboard wants the whole screen, lying on its side,
   and the phone's motion; the others only change how it is drawn. */
function townDepth(mode) {
  const was = TV.depth;
  TV.depth = mode;
  $('tdepth').value = mode;
  $('town').classList.toggle('cardboard', mode === 'cardboard');
  if (mode === 'cardboard' && was !== 'cardboard') {
    const el = $('town');
    if (el.requestFullscreen) el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
    if (!TV.motion && window.DeviceOrientationEvent) { townMotion(); TV.cardboardMotion = true; }
  } else if (was === 'cardboard' && mode !== 'cardboard') {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (TV.cardboardMotion && TV.motion) townMotion();
    TV.cardboardMotion = false;
  }
  townKick();
}

/* ---- a headset ------------------------------------------------------------ */

async function townEnterVR() {
  if (TV.xr) { TV.xr.end(); return; }
  const gl = TGL.gl;
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  } catch (e) { $('tstatus').textContent = 'The headset would not start: ' + e.message; return; }
  TV.xr = session;
  $('tvr').textContent = 'Leave VR';
  townSound(true);
  if (gl.makeXRCompatible) await gl.makeXRCompatible();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
  const space = await session.requestReferenceSpace('local');
  let stage = TOWN_STAGES.findIndex(s => s[0] === TV.people && s[1] === TV.rewards);
  session.addEventListener('select', () => {
    stage = (stage + 1) % TOWN_STAGES.length;
    townSet(TOWN_STAGES[stage][0], TOWN_STAGES[stage][1]);
  });
  session.addEventListener('end', () => { TV.xr = null; $('tvr').textContent = 'Enter VR'; townKick(); });
  const frame = (now, xrFrame) => {
    if (!TV.xr) return;
    session.requestAnimationFrame(frame);
    const pose = xrFrame.getViewerPose(space);
    if (!pose) return;
    townTick(now);
    const layer = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      townDraw(view.projectionMatrix, view.transform.inverse.matrix);
    }
  };
  session.requestAnimationFrame(frame);
}

/* ---- sound ----------------------------------------------------------------- */

/* The town's music: SND 3003 first when all 625 are in town, as the game
   plays it then; then 3000, 3001 and 3002 in turn. */
function townSound(on) {
  if (!on) { if (TAUDIO) { TAUDIO.el.pause(); TAUDIO = null; } $('tsound').textContent = 'Sound'; return; }
  if (TAUDIO) return;
  const arc = openedArchive(TFROM);
  const list = (TV.people >= ZB_TOWN_PEOPLE ? [3003] : []).concat([3000, 3001, 3002]).filter(id => arc.has('\0SND', id));
  if (!list.length) return;
  const el = new Audio();
  TAUDIO = { el, list, i: 0 };
  const play = () => {
    const w = parseMohawkWave(arc.get('\0SND', TAUDIO.list[TAUDIO.i]));
    if (el.src) URL.revokeObjectURL(el.src);
    el.src = URL.createObjectURL(new Blob([wavFromPcmBytes(w.samples, w.rate, w.bits, w.channels)], { type: 'audio/wav' }));
    el.play().catch(() => {});
  };
  el.addEventListener('ended', () => { if (TAUDIO && TAUDIO.el === el) { TAUDIO.i = (TAUDIO.i + 1) % TAUDIO.list.length; if (TAUDIO.list[TAUDIO.i] === 3003) TAUDIO.i = 1 % TAUDIO.list.length; setTimeout(play, 1500); } });
  play();
  $('tsound').textContent = 'Sound off';
}

/* ---- the view ---------------------------------------------------------------- */

function townSet(people, rewards, keepHash) {
  TV.people = Math.max(0, Math.min(ZB_TOWN_PEOPLE, Math.round(people)));
  TV.rewards = Math.max(0, Math.min(16, Math.round(rewards)));
  $('tpeople').value = TV.people; $('trewards').value = TV.rewards;
  $('tpeopleN').textContent = TV.people;
  $('trewardsN').textContent = TV.rewards;
  townBuild();
  if (!keepHash) {
    const h = `#town&people=${TV.people}&rewards=${TV.rewards}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  townKick();
}

/* Called by page-browse's route() when the address is #town. */
async function townRoute() {
  const entry = ARCHIVES.get('TOWN');
  $('tstatus').textContent = '';
  if (!entry) { $('tstatus').textContent = 'TOWN.MHK is not among the files opened.'; return; }
  if (!entry.bytes && !entry.error) { $('tstatus').textContent = 'Fetching town.mhk from archive.org…'; await ensureBytes(entry); $('tstatus').textContent = ''; }
  const arc = openedArchive(entry);
  if (!arc) { $('tstatus').textContent = entry.error || 'TOWN could not be read.'; return; }
  const fresh = TFROM !== entry;
  if (fresh) {
    try { TWORLD = zbTownWorld(arc); } catch (e) { $('tstatus').textContent = 'TOWN: ' + e.message; return; }
    TFROM = entry;
    TPAL = zbPalette(parsePaletteResource(arc.get('SHPL', 1200), 'SHPL'));
    TFEET.clear();
    TLAND = townLand();
    TATLAS = townAtlas();
  }
  if (!TGL) {
    try { TGL = townGL($('tcanvas')); } catch (e) { $('tstatus').textContent = 'WebGL: ' + e.message; return; }
    if (!TGL) { $('tstatus').textContent = 'This browser has no WebGL, which the town needs.'; return; }
    townLandMeshes();
    townTextures();
  } else if (fresh) townTextures();
  const q = new URLSearchParams(location.hash.slice(1));
  townSet(q.has('people') ? +q.get('people') : TV.people, q.has('rewards') ? +q.get('rewards') : TV.rewards, true);
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => { $('tvr').hidden = !ok; }, () => {});
  }
  $('tmotion').hidden = !(window.DeviceOrientationEvent && matchMedia('(pointer: coarse)').matches);
  townKick();
}

function townMotion() {
  if (TV.motion) {
    window.removeEventListener('deviceorientation', TV.motion.on);
    TV.yaw = townLookYaw(); TV.pitch = 0;
    TV.motion = null;
    $('tmotion').textContent = 'Look with the phone';
    return;
  }
  const start = () => {
    const m = { q: null, yaw0: 0, fresh: true };
    m.on = e => {
      if (e.alpha == null) return;
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      m.q = tDeviceQuat(e.alpha, e.beta, e.gamma, angle);
      if (m.fresh) {
        // Keep looking where the view was: the phone's heading becomes it.
        m.fresh = false;
        const v = tQuatView(m.q);
        m.yaw0 = TV.yaw - Math.atan2(-v[2], v[10]);
      }
    };
    TV.motion = m;
    window.addEventListener('deviceorientation', m.on);
    $('tmotion').textContent = 'Stop the motion';
  };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().then(r => { if (r === 'granted') start(); }, () => {});
  else start();
}

function wireTown() {
  const c = $('tcanvas'), pointers = new Map();
  let drag = null, pinch = null;
  c.addEventListener('pointerdown', e => {
    c.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: TV.yaw, pitch: TV.pitch, yaw0: TV.motion ? TV.motion.yaw0 : 0 };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: TV.fov }; drag = null; }
  });
  c.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      TV.fov = Math.max(TOWN_TUNE.fovMin, Math.min(TOWN_TUNE.fovMax, pinch.fov * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
      return;
    }
    if (!drag) return;
    // Dragging moves the town with the finger: a screen's height is the field of view.
    const k = TV.fov * Math.PI / 180 / Math.max(1, c.clientHeight);
    if (TV.motion) TV.motion.yaw0 = drag.yaw0 - (e.clientX - drag.x) * k;
    else {
      TV.yaw = drag.yaw - (e.clientX - drag.x) * k;
      TV.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * k));
    }
  });
  const end = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null; };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('wheel', e => { e.preventDefault(); TV.fov = Math.max(TOWN_TUNE.fovMin, Math.min(TOWN_TUNE.fovMax, TV.fov * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  window.addEventListener('keydown', e => {
    if ($('town').hidden || e.target.closest('input, select, textarea')) return;
    const step = 5 * Math.PI / 180;
    if (e.key === 'ArrowLeft') TV.yaw -= step;
    else if (e.key === 'ArrowRight') TV.yaw += step;
    else if (e.key === 'ArrowUp') TV.pitch = Math.min(1.3, TV.pitch + step);
    else if (e.key === 'ArrowDown') TV.pitch = Math.max(-1.3, TV.pitch - step);
    else if (e.key === 'Escape') { if (TV.depth === 'cardboard') townDepth('none'); else location.hash = '#place=TOWN'; }
    else return;
    e.preventDefault();
  });
  $('tpeople').addEventListener('input', () => townSet(+$('tpeople').value, TV.rewards));
  $('trewards').addEventListener('input', () => townSet(TV.people, +$('trewards').value));
  $('tsmooth').addEventListener('change', () => { TV.smooth = $('tsmooth').checked; if (TGL) townFilter(); });
  $('tdepth').addEventListener('change', () => townDepth($('tdepth').value));
  $('tcardexit').addEventListener('click', () => townDepth('none'));
  $('tsound').addEventListener('click', () => townSound(!TAUDIO));
  $('tvr').addEventListener('click', townEnterVR);
  $('tmotion').addEventListener('click', townMotion);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && TV.depth === 'cardboard') townDepth('none'); });
  window.addEventListener('hashchange', () => {
    if (/^#town\b/.test(location.hash)) return;
    townSound(false);
    if (TV.depth === 'cardboard') townDepth('none');
    if (TV.motion) townMotion();
  });
}

wireTown();
