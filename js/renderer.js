// ===== KockaSvijet — renderer (WebGL2) =====
(function () {

const M4 = KS.mat4;

function Renderer (canvas) {
  const gl = KS.glInit(canvas);
  if (!gl) throw new Error('WebGL2 nije dostupan');
  this.gl = gl;
  this.canvas = canvas;

  this.chunkProg = KS.makeProgram(gl, KS.SHADERS.chunkVS, KS.SHADERS.chunkFS);
  this.flatProg = KS.makeProgram(gl, KS.SHADERS.flatVS, KS.SHADERS.flatFS);
  this.modelProg = KS.makeProgram(gl, KS.SHADERS.modelVS, KS.SHADERS.modelFS);
  this.starProg = KS.makeProgram(gl, `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPos;
    layout(location=1) in float aSize;
    uniform mat4 uVP;
    void main () { gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = aSize; }`,
    `#version 300 es
    precision highp float;
    uniform vec4 uColor;
    out vec4 fragColor;
    void main () {
      vec2 d = gl_PointCoord - 0.5;
      if (dot(d,d) > 0.25) discard;
      fragColor = uColor;
    }`);

  this.atlasTex = KS.makeTexture(gl, KS.atlas.canvas);
  this.itemTex = KS.makeTexture(gl, KS.itemAtlas.canvas);
  this._skinTex = new Map();

  this.proj = M4.create();
  this.view = M4.create();
  this.vp = M4.create();
  this.camPos = { x: 0, y: 0, z: 0 };
  this.persp = 0; // 0 prvo lice, 1 iza, 2 sprijeda
  this.shake = 0;
  this.fovKick = 0;
  this.frame = 0;

  this._buildSunMoon();
  this._buildStars();
  this._buildSelection();
  this._buildClouds();
  this._modelVAOs = new Map();
  this._blockCubeVAOs = new Map();
  this._itemQuadVAOs = new Map();
  this._partBuf = { vbo: null, cap: 0 };
  this._crackVAO = null;
  this.timeOfDay = 0;
}
KS.Renderer = Renderer;

// ---------- pomoćnici ----------
Renderer.prototype.skinTexture = function (canvas) {
  let t = this._skinTex.get(canvas);
  if (!t) { t = KS.makeTexture(this.gl, canvas); this._skinTex.set(canvas, t); }
  return t;
};

// ---------- chunk meshevi ----------
Renderer.prototype.uploadChunk = function (chunk, mesh) {
  const gl = this.gl;
  const make = (data) => {
    if (!data) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
    // stride 16: pos u16A�3(6) uv u16A�2(4) light u8 shade u8 tint u8A�3 pad
    gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, false, 16, 0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(1, 2, gl.UNSIGNED_SHORT, false, 16, 6);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, false, 16, 10);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, 16, 11);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(4, 3, gl.UNSIGNED_BYTE, false, 16, 12);
    gl.enableVertexAttribArray(4);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: data.count };
  };
  this.deleteChunk(chunk);
  chunk.glOpaque = make(mesh.opaque);
  chunk.glWater = make(mesh.water);
  chunk.meshed = true;
  chunk.dirty = false;
};
Renderer.prototype.deleteChunk = function (chunk) {
  const gl = this.gl;
  for (const key of ['glOpaque', 'glWater']) {
    const b = chunk[key];
    if (b) {
      gl.deleteVertexArray(b.vao); gl.deleteBuffer(b.vbo); gl.deleteBuffer(b.ibo);
      chunk[key] = null;
    }
  }
  chunk.meshed = false;
};

// ---------- nebo ----------
Renderer.prototype._buildSunMoon = function () {
  const gl = this.gl;
  const mk = (painter) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    painter(cv.getContext('2d'));
    return KS.makeTexture(gl, cv);
  };
  this.sunTex = mk(c => {
    c.fillStyle = '#fdf2bb'; c.fillRect(4, 4, 24, 24);
    c.fillStyle = '#fff9e0'; c.fillRect(8, 8, 16, 16);
    c.fillStyle = '#ffffff'; c.fillRect(11, 11, 10, 10);
  });
  this.moonTex = mk(c => {
    c.fillStyle = '#d8dce8'; c.fillRect(6, 6, 20, 20);
    c.fillStyle = '#b8bdd0'; c.fillRect(10, 9, 5, 5); c.fillRect(18, 16, 6, 6); c.fillRect(9, 18, 4, 4);
    c.fillStyle = '#eceff8'; c.fillRect(16, 8, 6, 5);
  });
  // quad za sunce/mjesec (model prog): pos + uv + shade
  const v = new Float32Array([
    -1, -1, 0, 0, 1, 1,
     1, -1, 0, 1, 1, 1,
     1,  1, 0, 1, 0, 1,
    -1,  1, 0, 0, 0, 1,
  ]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20); gl.enableVertexAttribArray(2);
  gl.bindVertexArray(null);
  this.skyQuad = { vao, count: 6 };
};
Renderer.prototype._buildStars = function () {
  const gl = this.gl;
  const rng = KS.mulberry32(424242);
  const n = 280;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // slu�Tajna ta�Tka na sferi
    let x, y, z, l;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.05);
    l = Math.sqrt(l);
    data[i * 4] = x / l * 480; data[i * 4 + 1] = y / l * 480; data[i * 4 + 2] = z / l * 480;
    data[i * 4 + 3] = 1 + rng() * 2.2;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12); gl.enableVertexAttribArray(1);
  gl.bindVertexArray(null);
  this.stars = { vao, count: n };
};
Renderer.prototype._buildSelection = function () {
  const gl = this.gl;
  const e = -0.004, s = 1.004; // blago naduvano
  const c = [[e,e,e],[s,e,e],[s,e,s],[e,e,s],[e,s,e],[s,s,e],[s,s,s],[e,s,s]];
  const lines = [0,1,1,2,2,3,3,0, 4,5,5,6,6,7,7,4, 0,4,1,5,2,6,3,7];
  const data = new Float32Array(lines.length * 7);
  lines.forEach((vi, i) => {
    data[i * 7] = c[vi][0]; data[i * 7 + 1] = c[vi][1]; data[i * 7 + 2] = c[vi][2];
    data[i * 7 + 3] = 0; data[i * 7 + 4] = 0; data[i * 7 + 5] = 0; data[i * 7 + 6] = 0.85;
  });
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); gl.enableVertexAttribArray(1);
  gl.bindVertexArray(null);
  this.selBox = { vao, count: lines.length };
};
Renderer.prototype._buildClouds = function () {
  const gl = this.gl;
  const n = new KS.Simplex(777);
  const verts = [], cols = [];
  const SIZE = 30, CELL = 14;
  for (let cz = -SIZE; cz < SIZE; cz++) for (let cx = -SIZE; cx < SIZE; cx++) {
    if (n.noise2D(cx * 0.11, cz * 0.11) < 0.32) continue;
    const x0 = cx * CELL, z0 = cz * CELL;
    verts.push(
      x0, 0, z0,  x0 + CELL, 0, z0,  x0 + CELL, 0, z0 + CELL,
      x0, 0, z0,  x0 + CELL, 0, z0 + CELL,  x0, 0, z0 + CELL,
    );
  }
  const data = new Float32Array(verts.length / 3 * 7);
  for (let i = 0; i < verts.length / 3; i++) {
    data[i * 7] = verts[i * 3]; data[i * 7 + 1] = verts[i * 3 + 1]; data[i * 7 + 2] = verts[i * 3 + 2];
    data[i * 7 + 3] = 1; data[i * 7 + 4] = 1; data[i * 7 + 5] = 1; data[i * 7 + 6] = 0.5;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); gl.enableVertexAttribArray(1);
  gl.bindVertexArray(null);
  this.clouds = { vao, count: verts.length / 3, span: SIZE * 2 * CELL };
};

// ---------- model dijelovi (kocka s UV-om po stranici skina 64A�64) ----------
Renderer.prototype.partVAO = function (modelName, partIdx, part) {
  const key = modelName + '_' + partIdx;
  let v = this._modelVAOs.get(key);
  if (v) return v;
  const gl = this.gl;
  const [sw, sh, sd] = part.size;
  const hx = sw / 2, hy = sh / 2, hz = sd / 2;
  const U = part.uv;
  // svaka strana: 4 verta (pos, uv, shade)
  const faces = [
    { r: U.front,  shade: 0.86, c: [[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz]], flipU: false },
    { r: U.back,   shade: 0.7,  c: [[hx,-hy,hz],[-hx,-hy,hz],[-hx,hy,hz],[hx,hy,hz]], flipU: false },
    { r: U.right,  shade: 0.78, c: [[-hx,-hy,hz],[-hx,-hy,-hz],[-hx,hy,-hz],[-hx,hy,hz]], flipU: false },
    { r: U.left,   shade: 0.78, c: [[hx,-hy,-hz],[hx,-hy,hz],[hx,hy,hz],[hx,hy,-hz]], flipU: false },
    { r: U.top,    shade: 1.0,  c: [[-hx,hy,-hz],[hx,hy,-hz],[hx,hy,hz],[-hx,hy,hz]], flipU: false },
    { r: U.bottom, shade: 0.6,  c: [[-hx,-hy,hz],[hx,-hy,hz],[hx,-hy,-hz],[-hx,-hy,-hz]], flipU: false },
  ];
  const verts = [], idx = [];
  let vi = 0;
  for (const f of faces) {
    const [ru, rv, rw, rh] = f.r;
    const u0 = (part.flip ? ru + rw : ru) / 64, u1 = (part.flip ? ru : ru + rw) / 64;
    const v0 = rv / 64, v1 = (rv + rh) / 64;
    const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    for (let i = 0; i < 4; i++) {
      verts.push(f.c[i][0], f.c[i][1], f.c[i][2], uvs[i][0], uvs[i][1], f.shade);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20); gl.enableVertexAttribArray(2);
  gl.bindVertexArray(null);
  v = { vao, count: idx.length };
  this._modelVAOs.set(key, v);
  return v;
};

// mini kocka bloka (za dropove i ruku) u atlas UV prostoru, jedini�Tna, centrirana
Renderer.prototype.blockCubeVAO = function (blockId) {
  let v = this._blockCubeVAOs.get(blockId);
  if (v) return v;
  const gl = this.gl;
  const def = KS.blocks[blockId];
  const t = (tile) => { const [u, vv] = KS.atlas.uv(tile); return [u / 256, vv / 256, (u + 16) / 256, (vv + 16) / 256]; };
  const h = 0.5;
  const tint = def.tint === 1 || def.tintTop || def.tint === 2;
  const faces = [
    { tile: def.tex.front !== undefined ? def.tex.front : def.tex.side, shade: 0.86, c: [[-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h]] },
    { tile: def.tex.side, shade: 0.7,  c: [[h,-h,h],[-h,-h,h],[-h,h,h],[h,h,h]] },
    { tile: def.tex.side, shade: 0.78, c: [[-h,-h,h],[-h,-h,-h],[-h,h,-h],[-h,h,h]] },
    { tile: def.tex.side, shade: 0.78, c: [[h,-h,-h],[h,-h,h],[h,h,h],[h,h,-h]] },
    { tile: def.tex.top, shade: 1.0,  c: [[-h,h,-h],[h,h,-h],[h,h,h],[-h,h,h]] },
    { tile: def.tex.bot, shade: 0.6,  c: [[-h,-h,h],[h,-h,h],[h,-h,-h],[-h,-h,-h]] },
  ];
  const verts = [], idx = [];
  let vi = 0;
  for (const f of faces) {
    const [u0, v0, u1, v1] = t(f.tile);
    const sh = f.shade * (tint ? 0.75 : 1);
    const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    for (let i = 0; i < 4; i++) verts.push(f.c[i][0], f.c[i][1], f.c[i][2], uvs[i][0], uvs[i][1], sh);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20); gl.enableVertexAttribArray(2);
  gl.bindVertexArray(null);
  v = { vao, count: idx.length };
  this._blockCubeVAOs.set(blockId, v);
  return v;
};
// ravan quad za item (dvostran), uv iz item atlasa ili block atlasa (cross blokovi)
Renderer.prototype.itemQuadVAO = function (id) {
  let v = this._itemQuadVAOs.get(id);
  if (v) return v;
  const gl = this.gl;
  let u0, v0, u1, v1;
  if (KS.isBlockId(id)) {
    const [u, vv] = KS.atlas.uv(KS.blocks[id].tex.side);
    u0 = u / 256; v0 = vv / 256; u1 = (u + 16) / 256; v1 = (vv + 16) / 256;
  } else {
    const [u, vv] = KS.itemAtlas.uv(KS.items[id].tex);
    u0 = u / 256; v0 = vv / 256; u1 = (u + 16) / 256; v1 = (vv + 16) / 256;
  }
  const h = 0.5;
  const verts = [
    -h, -h, 0, u0, v1, 1,   h, -h, 0, u1, v1, 1,   h, h, 0, u1, v0, 1,   -h, h, 0, u0, v0, 1,
    h, -h, 0, u1, v1, 0.8,  -h, -h, 0, u0, v1, 0.8, -h, h, 0, u0, v0, 0.8, h, h, 0, u1, v0, 0.8,
  ];
  const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20); gl.enableVertexAttribArray(2);
  gl.bindVertexArray(null);
  v = { vao, count: 12 };
  this._itemQuadVAOs.set(id, v);
  return v;
};

// crack overlay kocka
Renderer.prototype.crackVAO = function (stage) {
  const gl = this.gl;
  if (!this._crackVAO) {
    // dinami�Tka, update uv po stage-u: jednostavnije — 10 stati�Tkih
    this._crackVAO = [];
  }
  if (this._crackVAO[stage]) return this._crackVAO[stage];
  const tile = KS.CRACK_BASE + stage;
  const [u, vv] = KS.atlas.uv(tile);
  const u0 = u / 256, v0 = vv / 256, u1 = (u + 16) / 256, v1 = (vv + 16) / 256;
  const e = -0.002, s = 1.002;
  const faces = [
    [[e,e,e],[s,e,e],[s,s,e],[e,s,e]],
    [[s,e,s],[e,e,s],[e,s,s],[s,s,s]],
    [[e,e,s],[e,e,e],[e,s,e],[e,s,s]],
    [[s,e,e],[s,e,s],[s,s,s],[s,s,e]],
    [[e,s,e],[s,s,e],[s,s,s],[e,s,s]],
    [[e,e,s],[s,e,s],[s,e,e],[e,e,e]],
  ];
  const verts = [], idx = [];
  let vi = 0;
  for (const f of faces) {
    const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    for (let i = 0; i < 4; i++) verts.push(f[i][0], f[i][1], f[i][2], uvs[i][0], uvs[i][1], 1);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20); gl.enableVertexAttribArray(2);
  gl.bindVertexArray(null);
  this._crackVAO[stage] = { vao, count: idx.length };
  return this._crackVAO[stage];
};

// ---------- boje neba ----------
Renderer.prototype.skyColors = function (time) {
  const sunH = Math.sin(time * Math.PI * 2);
  const dayF = KS.clamp((sunH + 0.22) * 2.6, 0.05, 1);
  const day = [0.45, 0.66, 1.0], night = [0.01, 0.015, 0.05];
  const mixv = (a, b, t) => [KS.lerp(a[0], b[0], t), KS.lerp(a[1], b[1], t), KS.lerp(a[2], b[2], t)];
  let sky = mixv(night, day, dayF);
  // zora/sumrak narandLlasti horizont
  const dawn = KS.clamp01(1 - Math.abs(sunH) * 3.4) * KS.clamp01(dayF * 2);
  let fog = mixv(sky, [0.98, 0.62, 0.35], dawn * 0.55);
  fog = mixv(fog, [1, 1, 1], dayF * 0.12);
  // mjese�Tina: povrL?ina noću nije potpuno crna
  const dayLight = Math.max(dayF, 0.24);
  return { sky, fog, dayF, dayLight, sunH, dawn };
};

// ---------- glavni render ----------
Renderer.prototype.render = function (game, dt, opts) {
  const gl = this.gl;
  this.frame++;
  const o = KS.opts;
  const canvas = this.canvas;
  if (canvas.width !== canvas.clientWidth * (window.devicePixelRatio > 1.5 ? 1.5 : 1) | 0 || canvas.height !== canvas.clientHeight * (window.devicePixelRatio > 1.5 ? 1.5 : 1) | 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = canvas.clientWidth * dpr | 0;
    canvas.height = canvas.clientHeight * dpr | 0;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);

  const world = game.world;
  const p = game.player;
  const cam = game.panorama || null;
  const C = this.skyColors(world.time);
  this.timeOfDay = world.time;
  game.dayFactor = C.dayF;

  // ---- kamera ----
  let eye, yaw, pitch;
  if (cam) {
    eye = { x: cam.x, y: cam.y, z: cam.z }; yaw = cam.yaw; pitch = cam.pitch;
  } else {
    eye = p.eyePos();
    yaw = p.yaw; pitch = p.pitch;
    // ljuljanje
    if (o.bob && this.persp === 0 && !p.flying) {
      const sp = KS.clamp(Math.hypot(p.vx, p.vz) / 5.5, 0, 1);
      eye.y += Math.abs(Math.sin(p.bobT)) * 0.07 * sp - 0.02 * sp;
      const sway = Math.sin(p.bobT) * 0.022 * sp;
      eye.x += Math.cos(yaw) * sway;
      eye.z += -Math.sin(yaw) * sway;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.4);
      eye.x += (Math.random() - 0.5) * this.shake * 0.4;
      eye.y += (Math.random() - 0.5) * this.shake * 0.4;
      eye.z += (Math.random() - 0.5) * this.shake * 0.4;
    }
    // treće lice
    if (this.persp > 0) {
      const dir = p.lookDir();
      const back = this.persp === 1 ? 1 : -1;
      let dist = 3.6;
      const hit = KS.raycast(world, eye.x, eye.y, eye.z, -dir.x * back, -dir.y * back, -dir.z * back, dist);
      if (hit) dist = Math.max(0.4, hit.dist - 0.35);
      eye = { x: eye.x - dir.x * back * dist, y: eye.y - dir.y * back * dist, z: eye.z - dir.z * back * dist };
      if (this.persp === 2) { yaw = yaw + Math.PI; pitch = -pitch; }
    }
  }
  this.camPos = eye;

  // FOV (sprint kick)
  let fov = (o.fov || 75) * Math.PI / 180;
  const kickTarget = (!cam && p.sprinting) ? 1 : 0;
  this.fovKick += (kickTarget - this.fovKick) * Math.min(1, dt * 9);
  fov *= 1 + this.fovKick * 0.09;

  const aspect = canvas.width / canvas.height;
  M4.perspective(this.proj, fov, aspect, 0.08, 800);
  M4.identity(this.view);
  M4.rotateX(this.view, this.view, -pitch);
  M4.rotateY(this.view, this.view, Math.PI - yaw);
  M4.translate(this.view, this.view, -eye.x, -eye.y, -eye.z);
  M4.multiply(this.vp, this.proj, this.view);
  const planes = KS.frustumPlanes(this.vp);

  // pod vodom / lavom?
  const camBlock = world.getBlock(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
  const underWater = camBlock === KS.B.water;
  const underLava = camBlock === KS.B.lava;

  const rd = (game.renderDist || o.rd) * 16;
  let fogStart = rd * 0.55, fogEnd = rd - 6;
  let fogCol = C.fog;
  if (!o.fog) { fogStart = rd * 0.92; fogEnd = rd * 1.6; }
  if (underWater) { fogCol = [0.08, 0.2, 0.45]; fogStart = 3; fogEnd = 22; }
  if (underLava) { fogCol = [0.7, 0.25, 0.05]; fogStart = 0.2; fogEnd = 3.5; }

  gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // ---- nebo: zvijezde, sunce, mjesec ----
  if (!underWater && !underLava) {
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    // zvijezde
    const starA = KS.clamp01(-C.sunH * 2.5 + 0.1);
    if (starA > 0.02) {
      gl.useProgram(this.starProg.prog);
      const vpNoTrans = M4.clone(this.view);
      vpNoTrans[12] = vpNoTrans[13] = vpNoTrans[14] = 0;
      const vp2 = M4.create();
      M4.multiply(vp2, this.proj, vpNoTrans);
      gl.uniformMatrix4fv(this.starProg.u.uVP, false, vp2);
      gl.uniform4f(this.starProg.u.uColor, 1, 1, 1, starA * 0.9);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.stars.vao);
      gl.drawArrays(gl.POINTS, 0, this.stars.count);
    }
    // sunce i mjesec
    gl.useProgram(this.modelProg.prog);
    const vpNoTrans = M4.clone(this.view);
    vpNoTrans[12] = vpNoTrans[13] = vpNoTrans[14] = 0;
    const vp2 = M4.create();
    M4.multiply(vp2, this.proj, vpNoTrans);
    gl.uniformMatrix4fv(this.modelProg.u.uVP, false, vp2);
    gl.uniform1f(this.modelProg.u.uFogOn, 0);
    gl.uniform4f(this.modelProg.u.uTintCol, 0, 0, 0, 0);
    gl.uniform1f(this.modelProg.u.uLight, 1.05);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const drawCelestial = (tex, ang, size) => {
      const m = M4.create();
      M4.rotateZ(m, m, ang); // rotira oko Z: istok (+X) → gore
      M4.translate(m, m, 90, 0, 0);
      M4.rotateY(m, m, Math.PI / 2);
      M4.rotateZ(m, m, Math.PI / 2);
      M4.scale(m, m, size, size, size);
      gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.bindVertexArray(this.skyQuad.vao);
      gl.drawElements(gl.TRIANGLES, this.skyQuad.count, gl.UNSIGNED_SHORT, 0);
    };
    drawCelestial(this.sunTex, world.time * Math.PI * 2, 9);
    drawCelestial(this.moonTex, world.time * Math.PI * 2 + Math.PI, 6.5);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  // ---- chunkovi (opaque) ----
  gl.useProgram(this.chunkProg.prog);
  gl.uniformMatrix4fv(this.chunkProg.u.uVP, false, this.vp);
  gl.uniform1f(this.chunkProg.u.uDay, C.dayLight);
  gl.uniform3f(this.chunkProg.u.uFogColor, fogCol[0], fogCol[1], fogCol[2]);
  gl.uniform1f(this.chunkProg.u.uFogStart, fogStart);
  gl.uniform1f(this.chunkProg.u.uFogEnd, fogEnd);
  gl.uniform1f(this.chunkProg.u.uAlpha, 1);
  gl.uniform1f(this.chunkProg.u.uCutout, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
  gl.uniform1i(this.chunkProg.u.uTex, 0);

  const waterChunks = [];
  let drawn = 0;
  for (const c of world.chunks.values()) {
    if (!c.meshed) continue;
    const wx = c.cx * 16, wz = c.cz * 16;
    const ddx = wx + 8 - eye.x, ddz = wz + 8 - eye.z;
    const distSq = ddx * ddx + ddz * ddz;
    if (distSq > (rd + 24) * (rd + 24)) continue;
    if (!KS.aabbInFrustum(planes, wx, 0, wz, wx + 16, KS.WH, wz + 16)) continue;
    if (c.glOpaque) {
      gl.uniform3f(this.chunkProg.u.uOrigin, wx, 0, wz);
      gl.bindVertexArray(c.glOpaque.vao);
      gl.drawElements(gl.TRIANGLES, c.glOpaque.count, gl.UNSIGNED_INT, 0);
      drawn++;
    }
    if (c.glWater) waterChunks.push([distSq, c]);
  }
  this.chunksDrawn = drawn;

  // ---- entiteti ----
  this.drawEntities(game, C, fogCol, fogStart, fogEnd, eye);

  // ---- ozna�Teni blok + pukotine ----
  if (!cam && p.target && !game.uiOpen) {
    const t = p.target;
    gl.useProgram(this.flatProg.prog);
    gl.uniformMatrix4fv(this.flatProg.u.uVP, false, this.vp);
    const m = M4.create();
    M4.translate(m, m, t.x, t.y, t.z);
    gl.uniformMatrix4fv(this.flatProg.u.uModel, false, m);
    gl.uniform4f(this.flatProg.u.uColor, 1, 1, 1, 1);
    gl.bindVertexArray(this.selBox.vao);
    gl.lineWidth(2);
    gl.drawArrays(gl.LINES, 0, this.selBox.count);

    if (p.mining && p.mining.time > 0.1) {
      const stage = KS.clamp(Math.floor(p.mining.progress / p.mining.time * 10), 0, 9);
      const cv = this.crackVAO(stage);
      gl.useProgram(this.modelProg.prog);
      gl.uniformMatrix4fv(this.modelProg.u.uVP, false, this.vp);
      gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
      gl.uniform1f(this.modelProg.u.uLight, 1);
      gl.uniform4f(this.modelProg.u.uTintCol, 0, 0, 0, 0);
      gl.uniform1f(this.modelProg.u.uFogOn, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -2);
      gl.bindVertexArray(cv.vao);
      gl.drawElements(gl.TRIANGLES, cv.count, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disable(gl.BLEND);
    }
  }

  // ---- �Testice ----
  this.drawParticles(game, C, eye);

  // ---- voda (prozirno) ----
  gl.useProgram(this.chunkProg.prog);
  gl.uniformMatrix4fv(this.chunkProg.u.uVP, false, this.vp);
  gl.uniform1f(this.chunkProg.u.uAlpha, 0.82);
  gl.uniform1f(this.chunkProg.u.uCutout, 0);
  gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  waterChunks.sort((a, b) => b[0] - a[0]);
  for (const [, c] of waterChunks) {
    gl.uniform3f(this.chunkProg.u.uOrigin, c.cx * 16, 0, c.cz * 16);
    gl.bindVertexArray(c.glWater.vao);
    gl.drawElements(gl.TRIANGLES, c.glWater.count, gl.UNSIGNED_INT, 0);
  }
  gl.enable(gl.CULL_FACE);
  gl.depthMask(true);

  // ---- oblaci ----
  if (o.clouds && !underWater && !underLava) {
    gl.useProgram(this.flatProg.prog);
    gl.uniformMatrix4fv(this.flatProg.u.uVP, false, this.vp);
    const m = M4.create();
    const span = this.clouds.span;
    const off = (game.now * 1.1) % 14;
    M4.translate(m, m, Math.floor(eye.x / 14) * 14 - span / 2 + off, 88, Math.floor(eye.z / 14) * 14 - span / 2);
    gl.uniformMatrix4fv(this.flatProg.u.uModel, false, m);
    const cb = 0.5 + C.dayF * 0.5;
    gl.uniform4f(this.flatProg.u.uColor, cb, cb, cb * 1.04, 1);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.clouds.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.clouds.count);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  gl.disable(gl.BLEND);

  // ---- ruka / predmet u prvom licu ----
  if (!cam && this.persp === 0 && !p.dead) this.drawHand(game, C);

  return { underWater, underLava };
};

// ---------- entiteti ----------
Renderer.prototype.drawEntities = function (game, C, fogCol, fogStart, fogEnd, eye) {
  const gl = this.gl;
  const world = game.world;
  gl.useProgram(this.modelProg.prog);
  gl.uniformMatrix4fv(this.modelProg.u.uVP, false, this.vp);
  gl.uniform3f(this.modelProg.u.uFogColor, fogCol[0], fogCol[1], fogCol[2]);
  gl.uniform1f(this.modelProg.u.uFogStart, fogStart);
  gl.uniform1f(this.modelProg.u.uFogEnd, fogEnd);
  gl.uniform1f(this.modelProg.u.uFogOn, 1);

  const drawMob = (e, modelName, skinCanvas) => {
    const model = KS.MODELS[modelName];
    const light = world.lightAt(e.x, e.y + e.h * 0.6, e.z, C.dayLight);
    gl.uniform1f(this.modelProg.u.uLight, light);
    gl.uniform4f(this.modelProg.u.uTintCol, 1, 0.15, 0.15, e.hurtT > 0 ? 0.4 : 0);
    gl.bindTexture(gl.TEXTURE_2D, this.skinTexture(skinCanvas));
    const s = model.scale;
    const swing = Math.sin(e.walkT) * KS.clamp(e.walkSpeed / 1.6, 0, 1) * 0.7;
    for (let pi = 0; pi < model.parts.length; pi++) {
      const part = model.parts[pi];
      const m = M4.create();
      M4.translate(m, m, e.x, e.y, e.z);
      M4.rotateY(m, m, e.yaw);
      M4.translate(m, m, part.pivot[0] * s, part.pivot[1] * s, part.pivot[2] * s);
      // animacija
      if (part.anim === 'legL') M4.rotateX(m, m, swing);
      else if (part.anim === 'legR') M4.rotateX(m, m, -swing);
      else if (part.anim === 'armL') {
        if (e.type === 'zombie') M4.rotateX(m, m, -1.35 + Math.sin(e.age * 2) * 0.12);
        else M4.rotateX(m, m, -swing * 0.8);
      } else if (part.anim === 'armR') {
        if (e.type === 'zombie') M4.rotateX(m, m, -1.35 + Math.cos(e.age * 2.2) * 0.12);
        else M4.rotateX(m, m, swing * 0.8);
      } else if (part.anim === 'head') {
        let hd = (e.headYaw !== undefined ? e.headYaw : e.yaw) - e.yaw;
        while (hd > Math.PI) hd -= Math.PI * 2;
        while (hd < -Math.PI) hd += Math.PI * 2;
        M4.rotateY(m, m, KS.clamp(hd, -1.1, 1.1));
        if (part.rotX) {} // glava se ne naginje
      }
      if (part.rotX && part.anim !== 'head') M4.rotateX(m, m, part.rotX);
      M4.translate(m, m, part.off[0] * s, part.off[1] * s, part.off[2] * s);
      M4.scale(m, m, s, s, s);
      gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
      const vao = this.partVAO(modelName + (part.flip ? 'F' : ''), pi, part);
      gl.bindVertexArray(vao.vao);
      gl.drawElements(gl.TRIANGLES, vao.count, gl.UNSIGNED_SHORT, 0);
    }
  };

  for (const e of world.entities) {
    if (e.dead) continue;
    const dx = e.x - eye.x, dz = e.z - eye.z;
    if (dx * dx + dz * dz > 96 * 96) continue;

    if (e.kind === 'mob') {
      drawMob(e, e.type === 'zombie' ? 'human' : e.type, e.type === 'zombie' ? KS.skins.zombie : KS.skins[e.type]);
    } else if (e.kind === 'item') {
      const light = world.lightAt(e.x, e.y + 0.2, e.z, C.dayLight);
      gl.uniform1f(this.modelProg.u.uLight, light);
      gl.uniform4f(this.modelProg.u.uTintCol, 0, 0, 0, 0);
      const m = M4.create();
      const bob = Math.sin(e.age * 2.2 + e.bob) * 0.06;
      M4.translate(m, m, e.x, e.y + 0.14 + bob, e.z);
      M4.rotateY(m, m, e.age * 1.4);
      const isBlock = KS.isBlockId(e.stack.id) && !KS.blocks[e.stack.id].cross;
      if (isBlock) {
        M4.scale(m, m, 0.26, 0.26, 0.26);
        gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
        const v = this.blockCubeVAO(e.stack.id);
        gl.bindVertexArray(v.vao);
        gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_SHORT, 0);
      } else {
        M4.scale(m, m, 0.36, 0.36, 0.36);
        gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
        gl.bindTexture(gl.TEXTURE_2D, KS.isBlockId(e.stack.id) ? this.atlasTex : this.itemTex);
        const v = this.itemQuadVAO(e.stack.id);
        gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(v.vao);
        gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_SHORT, 0);
        gl.enable(gl.CULL_FACE);
      }
    } else if (e.kind === 'tnt') {
      const light = world.lightAt(e.x, e.y + 0.5, e.z, C.dayLight);
      const flash = Math.sin(e.age * 14) > 0 || e.fuse < 0.5;
      gl.uniform1f(this.modelProg.u.uLight, light);
      gl.uniform4f(this.modelProg.u.uTintCol, 1, 1, 1, flash ? 0.55 : 0);
      const m = M4.create();
      M4.translate(m, m, e.x, e.y + 0.49, e.z);
      M4.scale(m, m, 0.98, 0.98, 0.98);
      gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      const v = this.blockCubeVAO(KS.B.tnt);
      gl.bindVertexArray(v.vao);
      gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  // igra�T u trećem licu
  const p = game.player;
  if (!game.panorama && this.persp > 0 && p && !p.dead) {
    const fake = {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, headYaw: p.yaw, h: p.h,
      walkT: p.bobT, walkSpeed: Math.hypot(p.vx, p.vz), hurtT: p.hurtT, age: game.now, type: 'player',
    };
    drawMob(fake, 'human', KS.skins['char_' + game.charId]);
  }
};

// ---------- �Testice ----------
Renderer.prototype.drawParticles = function (game, C, eye) {
  const list = KS.particles.list;
  if (!list.length) return;
  const gl = this.gl;
  // right/up vektori kamere
  const v = this.view;
  const rt = [v[0], v[4], v[8]], up = [v[1], v[5], v[9]];

  const texVerts = [], texIdx = [];
  const colVerts = [];
  let tvi = 0;
  for (const p of list) {
    const s = p.size;
    const corners = [[-s, -s], [s, -s], [s, s], [-s, s]];
    if (p.tile !== undefined) {
      const [tu, tv] = KS.atlas.uv(p.tile);
      const u0 = (tu + p.tu) / 256, v0 = (tv + p.tv) / 256;
      const u1 = u0 + 3.5 / 256, v1 = v0 + 3.5 / 256;
      const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      const sh = p.tint ? 0.8 : 1;
      for (let i = 0; i < 4; i++) {
        texVerts.push(
          p.x + rt[0] * corners[i][0] + up[0] * corners[i][1],
          p.y + rt[1] * corners[i][0] + up[1] * corners[i][1],
          p.z + rt[2] * corners[i][0] + up[2] * corners[i][1],
          uvs[i][0], uvs[i][1], sh);
      }
      texIdx.push(tvi, tvi + 1, tvi + 2, tvi, tvi + 2, tvi + 3);
      tvi += 4;
    } else {
      const a = KS.clamp01(p.life * 2.5);
      for (const tri of [[0, 1, 2], [0, 2, 3]]) {
        for (const ci of tri) {
          colVerts.push(
            p.x + rt[0] * corners[ci][0] + up[0] * corners[ci][1],
            p.y + rt[1] * corners[ci][0] + up[1] * corners[ci][1],
            p.z + rt[2] * corners[ci][0] + up[2] * corners[ci][1],
            p.color[0] / 255, p.color[1] / 255, p.color[2] / 255, a);
        }
      }
    }
  }

  if (texVerts.length) {
    gl.useProgram(this.modelProg.prog);
    gl.uniformMatrix4fv(this.modelProg.u.uVP, false, this.vp);
    const m = M4.create();
    gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
    gl.uniform1f(this.modelProg.u.uLight, Math.max(C.dayF, 0.5));
    gl.uniform4f(this.modelProg.u.uTintCol, 0, 0, 0, 0);
    gl.uniform1f(this.modelProg.u.uFogOn, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    if (!this._partTexVAO) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20); gl.enableVertexAttribArray(2);
      gl.bindVertexArray(null);
      this._partTexVAO = { vao, vbo, ibo };
    }
    gl.bindVertexArray(this._partTexVAO.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._partTexVAO.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texVerts), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._partTexVAO.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(texIdx), gl.DYNAMIC_DRAW);
    gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, texIdx.length, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
  }
  if (colVerts.length) {
    gl.useProgram(this.flatProg.prog);
    gl.uniformMatrix4fv(this.flatProg.u.uVP, false, this.vp);
    const m = M4.create();
    gl.uniformMatrix4fv(this.flatProg.u.uModel, false, m);
    gl.uniform4f(this.flatProg.u.uColor, 1, 1, 1, 1);
    if (!this._partColVAO) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); gl.enableVertexAttribArray(1);
      gl.bindVertexArray(null);
      this._partColVAO = { vao, vbo };
    }
    gl.bindVertexArray(this._partColVAO.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._partColVAO.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colVerts), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, colVerts.length / 7);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }
};

// ---------- ruka / predmet u prvom licu ----------
Renderer.prototype.drawHand = function (game, C) {
  const gl = this.gl;
  const p = game.player;
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.modelProg.prog);

  const proj = M4.create();
  M4.perspective(proj, 62 * Math.PI / 180, this.canvas.width / this.canvas.height, 0.05, 4);
  gl.uniformMatrix4fv(this.modelProg.u.uVP, false, proj);
  gl.uniform1f(this.modelProg.u.uFogOn, 0);
  gl.uniform4f(this.modelProg.u.uTintCol, 1, 0.2, 0.2, p.hurtT > 0 ? 0.3 : 0);
  const light = game.world.lightAt(p.x, p.y + 1.4, p.z, C.dayLight);
  gl.uniform1f(this.modelProg.u.uLight, Math.max(0.25, light));

  const heldId = p.heldId();
  const sp = KS.clamp(Math.hypot(p.vx, p.vz) / 5.5, 0, 1);
  const bobX = Math.sin(p.bobT) * 0.022 * sp;
  const bobY = -Math.abs(Math.sin(p.bobT)) * 0.03 * sp;
  // zamah: swingT 1→0
  const sw = p.swingT > 0 ? Math.sin((1 - p.swingT) * Math.PI) : 0;
  const eatW = p.eatingT > 0 ? Math.sin(game.now * 22) * 0.04 : 0;

  const m = M4.create();
  M4.translate(m, m, 0.56 + bobX - sw * 0.32, -0.52 + bobY + Math.sin(sw * Math.PI) * -0.18 + eatW, -0.82 + sw * -0.2);
  M4.rotateY(m, m, -0.32 - sw * 0.6);
  M4.rotateX(m, m, sw * -0.9 + (p.eatingT > 0 ? -0.5 : 0));

  if (!heldId) {
    // gola ruka (skin lika)
    M4.rotateZ(m, m, -0.18);
    M4.rotateX(m, m, 0.6);
    M4.scale(m, m, 1, 1, 1);
    const model = KS.MODELS.human;
    const part = model.parts[3]; // desna ruka
    const s = model.scale * 1.6;
    const mm = M4.clone(m);
    M4.translate(mm, mm, 0, -0.1, 0.16);
    M4.rotateX(mm, mm, 1.45);
    M4.translate(mm, mm, 0, -10 * s * 0.5, 0);
    M4.scale(mm, mm, s, s, s);
    gl.uniformMatrix4fv(this.modelProg.u.uModel, false, mm);
    gl.bindTexture(gl.TEXTURE_2D, this.skinTexture(KS.skins['char_' + game.charId]));
    const vao = this.partVAO('humanF', 3, part);
    gl.bindVertexArray(vao.vao);
    gl.drawElements(gl.TRIANGLES, vao.count, gl.UNSIGNED_SHORT, 0);
    return;
  }

  const isBlock = KS.isBlockId(heldId) && !KS.blocks[heldId].cross;
  if (isBlock) {
    M4.rotateY(m, m, 0.78);
    M4.rotateX(m, m, -0.1);
    M4.scale(m, m, 0.36, 0.36, 0.36);
    gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    const v = this.blockCubeVAO(heldId);
    gl.bindVertexArray(v.vao);
    gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_SHORT, 0);
  } else {
    M4.rotateZ(m, m, -0.85);
    M4.rotateY(m, m, 0.18);
    M4.scale(m, m, 0.62, 0.62, 0.62);
    gl.uniformMatrix4fv(this.modelProg.u.uModel, false, m);
    gl.bindTexture(gl.TEXTURE_2D, KS.isBlockId(heldId) ? this.atlasTex : this.itemTex);
    const v = this.itemQuadVAO(heldId);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(v.vao);
    gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.CULL_FACE);
  }
};

})();
