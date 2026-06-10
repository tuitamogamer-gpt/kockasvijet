// ===== KockaSvijet — entiteti: dropovi, mobovi, TNT + skinovi i modeli =====
(function () {

// ---------- skin canvasi (64×64), sve crtano kodom ----------
// box unwrap: top(u0+d,v0) bottom(u0+d+w,v0) | right(u0,v0+d) front(u0+d) left(u0+d+w) back(u0+d+w+d), red visine h
function faceRects (u0, v0, w, h, d) {
  return {
    top:    [u0 + d, v0, w, d],
    bottom: [u0 + d + w, v0, w, d],
    right:  [u0, v0 + d, d, h],
    front:  [u0 + d, v0 + d, w, h],
    left:   [u0 + d + w, v0 + d, d, h],
    back:   [u0 + d + w + d, v0 + d, w, h],
  };
}
const HUMAN_UV = {
  head: faceRects(0, 0, 8, 8, 8),
  body: faceRects(0, 20, 8, 12, 4),
  arm:  faceRects(32, 20, 4, 12, 4),
  leg:  faceRects(48, 20, 4, 12, 4),
};

function mkCanvas (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function fillFace (ctx, rect, color) { ctx.fillStyle = color; ctx.fillRect(rect[0], rect[1], rect[2], rect[3]); }
function noiseFace (ctx, rect, base, amt, seed) {
  const rng = KS.mulberry32(seed || 1234);
  const [r, g, b] = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)];
  for (let y = 0; y < rect[3]; y++) for (let x = 0; x < rect[2]; x++) {
    const f = 1 - amt + rng() * amt * 2;
    ctx.fillStyle = `rgb(${KS.clamp(r * f, 0, 255) | 0},${KS.clamp(g * f, 0, 255) | 0},${KS.clamp(b * f, 0, 255) | 0})`;
    ctx.fillRect(rect[0] + x, rect[1] + y, 1, 1);
  }
}

function paintHumanSkin (def) {
  const cv = mkCanvas(64, 64);
  const c = cv.getContext('2d');
  const U = HUMAN_UV;
  // glava
  for (const f of ['front', 'back', 'left', 'right']) noiseFace(c, U.head[f], def.skin, 0.04, 11);
  noiseFace(c, U.head.top, def.hair, 0.06, 12);
  noiseFace(c, U.head.bottom, def.skin, 0.04, 13);
  if (def.hairStyle !== 'bald') {
    // kosa: gornji dio svih strana
    for (const f of ['front', 'left', 'right', 'back']) {
      const r = U.head[f];
      c.fillStyle = def.hair;
      c.fillRect(r[0], r[1], r[2], def.hairStyle === 'long' ? 3 : 2);
    }
    const rb = U.head.back; c.fillStyle = def.hair;
    c.fillRect(rb[0], rb[1], rb[2], def.hairStyle === 'long' ? 7 : 4);
  }
  // lice
  const fr = U.head.front;
  c.fillStyle = '#ffffff';
  c.fillRect(fr[0] + 1, fr[1] + 4, 2, 1); c.fillRect(fr[0] + 5, fr[1] + 4, 2, 1);
  c.fillStyle = def.eye || '#3b66c8';
  c.fillRect(fr[0] + 2, fr[1] + 4, 1, 1); c.fillRect(fr[0] + 5, fr[1] + 4, 1, 1);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(fr[0] + 3, fr[1] + 6, 2, 1); // usta sjena
  if (def.beard) { c.fillStyle = def.hair; c.fillRect(fr[0] + 2, fr[1] + 6, 4, 2); }
  // dodaci na glavi
  if (def.headgear === 'helmet') {
    for (const f of ['front', 'left', 'right', 'back', 'top']) {
      const r = U.head[f];
      noiseFace(c, [r[0], r[1], r[2], f === 'top' ? r[3] : 3], '#9aa2ad', 0.05, 14);
      if (f !== 'top') { c.fillStyle = '#6e7682'; c.fillRect(r[0], r[1] + 3, r[2], 1); }
    }
    c.fillStyle = '#6e7682'; c.fillRect(fr[0], fr[1], 1, 8); c.fillRect(fr[0] + 7, fr[1], 1, 8);
  } else if (def.headgear === 'visor') {
    for (const f of ['front', 'left', 'right', 'back', 'top']) noiseFace(c, U.head[f], '#e8eaee', 0.04, 15);
    c.fillStyle = '#3b4a66'; c.fillRect(fr[0] + 1, fr[1] + 2, 6, 4);
    c.fillStyle = '#7fa8e8'; c.fillRect(fr[0] + 2, fr[1] + 3, 4, 2);
  } else if (def.headgear === 'mask') {
    for (const f of ['front', 'left', 'right', 'back', 'top', 'bottom']) noiseFace(c, U.head[f], def.shirt, 0.05, 16);
    c.fillStyle = def.skin; c.fillRect(fr[0] + 1, fr[1] + 3, 6, 2);
    c.fillStyle = '#ffffff'; c.fillRect(fr[0] + 1, fr[1] + 4, 2, 1); c.fillRect(fr[0] + 5, fr[1] + 4, 2, 1);
    c.fillStyle = '#1a1a1a'; c.fillRect(fr[0] + 2, fr[1] + 4, 1, 1); c.fillRect(fr[0] + 5, fr[1] + 4, 1, 1);
  } else if (def.headgear === 'robot') {
    for (const f of ['front', 'left', 'right', 'back', 'top', 'bottom']) noiseFace(c, U.head[f], '#b8bec8', 0.07, 17);
    c.fillStyle = '#20242c'; c.fillRect(fr[0] + 1, fr[1] + 3, 6, 3);
    c.fillStyle = '#5af2c8'; c.fillRect(fr[0] + 2, fr[1] + 4, 1, 1); c.fillRect(fr[0] + 5, fr[1] + 4, 1, 1);
    c.fillStyle = '#444'; c.fillRect(fr[0] + 2, fr[1] + 7, 4, 1);
  }
  // tijelo
  for (const f of ['front', 'back', 'left', 'right']) noiseFace(c, U.body[f], def.shirt, 0.05, 21);
  noiseFace(c, U.body.top, def.shirt, 0.05, 22);
  noiseFace(c, U.body.bottom, def.pants, 0.05, 23);
  if (def.belt) {
    for (const f of ['front', 'back', 'left', 'right']) {
      const r = U.body[f];
      c.fillStyle = def.belt; c.fillRect(r[0], r[1] + 9, r[2], 1);
    }
  }
  if (def.emblem) {
    const r = U.body.front;
    c.fillStyle = def.emblem;
    c.fillRect(r[0] + 3, r[1] + 3, 2, 2);
  }
  // ruke (rukav gore, koža dolje)
  for (const f of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
    const r = U.arm[f];
    noiseFace(c, r, def.sleeves ? def.shirt : def.skin, 0.05, 31);
    if (def.sleeves && f !== 'top' && f !== 'bottom' && def.sleeves === 'half') {
      c.fillStyle = def.skin; c.fillRect(r[0], r[1] + 6, r[2], 6);
    }
    if (!def.sleeves && f !== 'top' && f !== 'bottom') {
      c.fillStyle = def.shirt; c.fillRect(r[0], r[1], r[2], 2);
    }
  }
  // noge (pantalone + cipele)
  for (const f of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
    const r = U.leg[f];
    noiseFace(c, r, def.pants, 0.05, 41);
    if (f !== 'top') { c.fillStyle = def.shoes; c.fillRect(r[0], r[1] + r[3] - 3, r[2], 3); }
  }
  return cv;
}

// ---------- likovi ----------
KS.chars = [
  { id: 'edo', name: 'Edo', desc: 'Vedri graditelj', skin: '#e8b08a', hair: '#1f1812', shirt: '#c25b2e', pants: '#6e5a40', shoes: '#3a3026', eye: '#4a7a3a', sleeves: 'half', belt: '#46362a', emblem: '#f0c020' },
  { id: 'mina', name: 'Mina', desc: 'Brza istraživačica', skin: '#f0c8a0', hair: '#a83e2a', hairStyle: 'long', shirt: '#7a4a9c', pants: '#2a2a34', shoes: '#d8d8d8', eye: '#2a8a4a', sleeves: 'half' },
  { id: 'vitez', name: 'Vitez', desc: 'Oklopljeni zaštitnik', skin: '#d8a47e', hair: '#2a2a2a', shirt: '#9aa2ad', pants: '#6e7682', shoes: '#3a3a42', eye: '#555', headgear: 'helmet', sleeves: true, belt: '#7a5c33', emblem: '#c8412f' },
  { id: 'robo', name: 'Robo', desc: 'Mehanički pomoćnik', skin: '#b8bec8', hair: '#888', shirt: '#7d8694', pants: '#5a626e', shoes: '#30343c', headgear: 'robot', sleeves: true, emblem: '#5af2c8' },
  { id: 'ninja', name: 'Ninja', desc: 'Tihi i brzi', skin: '#d8a47e', hair: '#111', shirt: '#22242a', pants: '#16181c', shoes: '#0c0c0e', headgear: 'mask', sleeves: true, belt: '#c8412f' },
  { id: 'astro', name: 'Astro', desc: 'Putnik kroz zvijezde', skin: '#e8b08a', hair: '#ddd', shirt: '#e8eaee', pants: '#c8ccd4', shoes: '#8a909c', headgear: 'visor', sleeves: true, emblem: '#3b66c8', belt: '#3b66c8' },
];
KS.charById = id => KS.chars.find(ch => ch.id === id) || KS.chars[0];

// skin za zombija u istom layoutu
function paintZombieSkin () {
  return paintHumanSkin({ skin: '#5a8a4a', hair: '#3a5e30', shirt: '#3b6248', pants: '#4a4436', shoes: '#3a3428', eye: '#1a1a1a' });
}

// ---------- skin za prase i kravu ----------
const PIG_UV = {
  head: faceRects(0, 0, 8, 8, 8),
  body: faceRects(28, 8, 10, 16, 8), // w10 h16(dužina) d8 — tijelo je "ležeći" box
  leg:  faceRects(0, 16, 4, 6, 4),
};
function paintPigSkin () {
  const cv = mkCanvas(64, 64), c = cv.getContext('2d');
  for (const part of ['head', 'body', 'leg']) {
    for (const f in PIG_UV[part]) noiseFace(c, PIG_UV[part][f], '#f0a0a8', 0.05, 51);
  }
  const fr = PIG_UV.head.front;
  c.fillStyle = '#ffffff'; c.fillRect(fr[0] + 1, fr[1] + 3, 2, 1); c.fillRect(fr[0] + 5, fr[1] + 3, 2, 1);
  c.fillStyle = '#1a1a1a'; c.fillRect(fr[0] + 2, fr[1] + 3, 1, 1); c.fillRect(fr[0] + 5, fr[1] + 3, 1, 1);
  c.fillStyle = '#e87f8a'; c.fillRect(fr[0] + 2, fr[1] + 5, 4, 3); // njuška
  c.fillStyle = '#c25a66'; c.fillRect(fr[0] + 3, fr[1] + 6, 1, 1); c.fillRect(fr[0] + 5 - 1, fr[1] + 6, 1, 1);
  return cv;
}
const COW_UV = PIG_UV;
function paintCowSkin () {
  const cv = mkCanvas(64, 64), c = cv.getContext('2d');
  const rng = KS.mulberry32(77);
  for (const part of ['head', 'body', 'leg']) {
    for (const f in COW_UV[part]) {
      const r = COW_UV[part][f];
      noiseFace(c, r, '#5e4632', 0.06, 52);
      // bijele mrlje
      for (let i = 0; i < 3; i++) {
        if (rng() < 0.6) {
          c.fillStyle = '#e8e0d8';
          c.fillRect(r[0] + (rng() * Math.max(1, r[2] - 3) | 0), r[1] + (rng() * Math.max(1, r[3] - 3) | 0), 2 + (rng() * 2 | 0), 2 + (rng() * 2 | 0));
        }
      }
    }
  }
  const fr = COW_UV.head.front;
  c.fillStyle = '#e8e0d8'; c.fillRect(fr[0] + 2, fr[1] + 5, 4, 3); // gubica
  c.fillStyle = '#ffffff'; c.fillRect(fr[0] + 1, fr[1] + 2, 2, 1); c.fillRect(fr[0] + 5, fr[1] + 2, 2, 1);
  c.fillStyle = '#1a1a1a'; c.fillRect(fr[0] + 1, fr[1] + 2, 1, 1); c.fillRect(fr[0] + 6, fr[1] + 2, 1, 1);
  c.fillStyle = '#3a3a3a'; c.fillRect(fr[0] + 3, fr[1] + 6, 1, 1); c.fillRect(fr[0] + 4, fr[1] + 6, 1, 1);
  return cv;
}

KS.skins = {
  zombie: paintZombieSkin(),
  pig: paintPigSkin(),
  cow: paintCowSkin(),
};
for (const ch of KS.chars) KS.skins['char_' + ch.id] = paintHumanSkin(ch);

// 2D prikaz lika sprijeda (za meni)
KS.drawCharPreview = function (canvas, charDef) {
  const skin = KS.skins['char_' + charDef.id];
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  const U = HUMAN_UV, S = canvas.width / 16; // 16px širine modela
  const draw = (rect, dx, dy, dw, dh, flip) => {
    c.save();
    if (flip) { c.translate((dx + dw) * S, dy * S); c.scale(-1, 1); c.drawImage(skin, rect[0], rect[1], rect[2], rect[3], 0, 0, dw * S, dh * S); }
    else c.drawImage(skin, rect[0], rect[1], rect[2], rect[3], dx * S, dy * S, dw * S, dh * S);
    c.restore();
  };
  draw(U.head.front, 4, 0, 8, 8);
  draw(U.body.front, 4, 8, 8, 12);
  draw(U.arm.front, 0, 8, 4, 12);
  draw(U.arm.front, 12, 8, 4, 12, true);
  draw(U.leg.front, 4, 20, 4, 12);
  draw(U.leg.front, 8, 20, 4, 12, true);
};

// ---------- modeli (dijelovi: size px, pivot u blokovima od nogu, offset centra boxa od pivota px) ----------
const SC = 1 / 16 * 0.9375; // px → blok, MC-stil umanjenje
KS.MODELS = {
  human: {
    scale: SC,
    parts: [
      { uv: HUMAN_UV.head, size: [8, 8, 8],  pivot: [0, 24, 0], off: [0, 4, 0],  anim: 'head' },
      { uv: HUMAN_UV.body, size: [8, 12, 4], pivot: [0, 12, 0], off: [0, 6, 0],  anim: null },
      { uv: HUMAN_UV.arm,  size: [4, 12, 4], pivot: [-6, 22, 0], off: [0, -4, 0], anim: 'armL' },
      { uv: HUMAN_UV.arm,  size: [4, 12, 4], pivot: [6, 22, 0],  off: [0, -4, 0], anim: 'armR', flip: true },
      { uv: HUMAN_UV.leg,  size: [4, 12, 4], pivot: [-2, 12, 0], off: [0, -6, 0], anim: 'legL' },
      { uv: HUMAN_UV.leg,  size: [4, 12, 4], pivot: [2, 12, 0],  off: [0, -6, 0], anim: 'legR', flip: true },
    ],
  },
  pig: {
    scale: SC,
    parts: [
      { uv: PIG_UV.head, size: [8, 8, 8],   pivot: [0, 9, 7], off: [0, 0, 3], anim: 'head' },
      { uv: PIG_UV.body, size: [10, 16, 8], pivot: [0, 9, 0],  off: [0, 0, 0],  anim: null, rotX: Math.PI / 2 },
      { uv: PIG_UV.leg, size: [4, 6, 4], pivot: [-3, 6, 5], off: [0, -3, 0], anim: 'legL' },
      { uv: PIG_UV.leg, size: [4, 6, 4], pivot: [3, 6, 5],  off: [0, -3, 0], anim: 'legR' },
      { uv: PIG_UV.leg, size: [4, 6, 4], pivot: [-3, 6, -5],  off: [0, -3, 0], anim: 'legR' },
      { uv: PIG_UV.leg, size: [4, 6, 4], pivot: [3, 6, -5],   off: [0, -3, 0], anim: 'legL' },
    ],
  },
  cow: {
    scale: SC,
    parts: [
      { uv: COW_UV.head, size: [8, 8, 8],   pivot: [0, 16, 7], off: [0, 1, 3], anim: 'head' },
      { uv: COW_UV.body, size: [10, 16, 8], pivot: [0, 15, 0],  off: [0, 0, 0],  anim: null, rotX: Math.PI / 2 },
      { uv: COW_UV.leg, size: [4, 12, 4], pivot: [-3, 12, 5], off: [0, -6, 0], anim: 'legL' },
      { uv: COW_UV.leg, size: [4, 12, 4], pivot: [3, 12, 5],  off: [0, -6, 0], anim: 'legR' },
      { uv: COW_UV.leg, size: [4, 12, 4], pivot: [-3, 12, -5],  off: [0, -6, 0], anim: 'legR' },
      { uv: COW_UV.leg, size: [4, 12, 4], pivot: [3, 12, -5],   off: [0, -6, 0], anim: 'legL' },
    ],
  },
};

// ---------- entiteti ----------
let nextEntId = 1;

function Entity (x, y, z) {
  this.id = nextEntId++;
  this.x = x; this.y = y; this.z = z;
  this.vx = 0; this.vy = 0; this.vz = 0;
  this.yaw = Math.random() * Math.PI * 2;
  this.pitch = 0;
  this.w = 0.3; this.h = 0.9;
  this.onGround = false;
  this.age = 0;
  this.dead = false;
  this.walkT = 0;
  this.walkSpeed = 0;
}
KS.Entity = Entity;

Entity.prototype.physics = function (world, dt, opts) {
  opts = opts || {};
  const inWater = KS.inLiquid(world, this, 0.5);
  const grav = inWater ? 4 : 24;
  this.vy -= grav * dt;
  if (inWater) {
    this.vy *= 0.86;
    this.vx *= 0.8; this.vz *= 0.8;
    if (opts.floats) this.vy += 7 * dt;
  }
  const res = KS.moveBox(world, this, this.vx * dt, this.vy * dt, this.vz * dt);
  this.x = res.x; this.y = res.y; this.z = res.z;
  this.onGround = res.onGround;
  if (res.hitY) this.vy = 0;
  if (res.hitX) this.vx = 0;
  if (res.hitZ) this.vz = 0;
  // trenje
  const fr = this.onGround ? Math.pow(0.0018, dt) : Math.pow(0.12, dt);
  this.vx *= fr; this.vz *= fr;
  const sp = Math.hypot(this.vx, this.vz);
  this.walkSpeed = sp;
  this.walkT += sp * dt * 3.2;
  return { inWater, res };
};

// ---------- ispušteni predmet ----------
function ItemEntity (x, y, z, stack) {
  Entity.call(this, x, y, z);
  this.kind = 'item';
  this.stack = stack;
  this.w = 0.13; this.h = 0.26;
  this.pickupDelay = 0.6;
  this.life = 300;
  this.bob = Math.random() * Math.PI * 2;
}
ItemEntity.prototype = Object.create(Entity.prototype);
KS.ItemEntity = ItemEntity;

ItemEntity.prototype.update = function (world, dt, game) {
  this.age += dt;
  this.life -= dt;
  if (this.life <= 0) { this.dead = true; return; }
  this.pickupDelay -= dt;
  this.physics(world, dt, { floats: true });
  // lava uništava
  if (KS.inLiquid(world, this, 0.2) === 2) { this.dead = true; return; }

  const p = game.player;
  if (p && !p.dead && this.pickupDelay <= 0) {
    const dx = p.x - this.x, dy = (p.y + 0.8) - this.y, dz = p.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1.9) {
      // magnet
      const pull = 5.5 * dt / Math.max(0.3, d);
      this.x += dx * pull; this.y += dy * pull; this.z += dz * pull;
    }
    if (d < 0.9) {
      const left = p.addItem(this.stack);
      if (left === 0) {
        this.dead = true;
        KS.snd.play('pop', { pos: this, vol: 0.8, pitch: 1 + Math.random() * 0.3 });
        return;
      }
      this.stack.n = left;
    }
  }
  // spajanje s drugim istim dropovima
  if ((this.age % 1) < dt * 2) {
    for (const e of world.entities) {
      if (e !== this && !e.dead && e.kind === 'item' && e.stack.id === this.stack.id &&
          e.stack.n + this.stack.n <= KS.maxStackOf(this.stack.id) &&
          Math.abs(e.x - this.x) < 0.8 && Math.abs(e.y - this.y) < 0.8 && Math.abs(e.z - this.z) < 0.8) {
        e.stack.n += this.stack.n;
        this.dead = true;
        return;
      }
    }
  }
};

KS.spawnItem = function (world, x, y, z, stack, gentle) {
  if (!stack || !stack.n) return;
  const e = new ItemEntity(x, y, z, { id: stack.id, n: stack.n, dur: stack.dur });
  const sp = gentle ? 1.4 : 2.6;
  e.vx = (Math.random() - 0.5) * sp;
  e.vy = 2.2 + Math.random() * 1.4;
  e.vz = (Math.random() - 0.5) * sp;
  world.entities.push(e);
  return e;
};

// ---------- mob ----------
function Mob (x, y, z, type) {
  Entity.call(this, x, y, z);
  this.kind = 'mob';
  this.type = type; // 'pig' | 'cow' | 'zombie'
  this.hurtT = 0;
  this.attackT = 0;
  this.idleSndT = 3 + Math.random() * 8;
  this.wanderT = 1 + Math.random() * 3;
  this.wandering = false;
  this.fleeT = 0;
  this.headYaw = 0;
  if (type === 'pig') { this.w = 0.42; this.h = 0.85; this.hp = 10; this.maxHp = 10; this.speed = 1.1; }
  else if (type === 'cow') { this.w = 0.45; this.h = 1.25; this.hp = 10; this.maxHp = 10; this.speed = 1.0; }
  else { this.w = 0.3; this.h = 1.8; this.hp = 20; this.maxHp = 20; this.speed = 1.9; }
}
Mob.prototype = Object.create(Entity.prototype);
KS.Mob = Mob;

Mob.prototype.update = function (world, dt, game) {
  this.age += dt;
  this.hurtT = Math.max(0, this.hurtT - dt);
  this.attackT = Math.max(0, this.attackT - dt);
  this.fleeT = Math.max(0, this.fleeT - dt);

  const p = game.player;
  const distP = p ? Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z) : 999;

  // despawn
  if (distP > 70) { this.dead = true; return; }
  if (this.type === 'zombie' && game.dayFactor > 0.5 && this.age > 5) {
    // zora — zombiji nestaju uz dim
    if (Math.random() < dt * 0.5) {
      KS.particles.burstColor(this.x, this.y + 1, this.z, [120, 120, 120], 10, { up: 1.4, grav: -1, life: 1 });
      this.dead = true;
      return;
    }
  }

  let moveYaw = null, sprint = 1;

  if (this.type === 'zombie' && p && !p.dead && game.diff !== 'peace' && distP < 26) {
    moveYaw = Math.atan2(p.x - this.x, p.z - this.z);
    this.headYaw = moveYaw;
    if (distP < 1.7 && this.attackT <= 0) {
      this.attackT = 1.1;
      p.hurt(3, this);
    }
  } else if (this.fleeT > 0) {
    moveYaw = this.fleeYaw;
    sprint = 1.9;
  } else {
    // lutanje
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wandering = !this.wandering;
      this.wanderT = this.wandering ? 1.5 + Math.random() * 3 : 1 + Math.random() * 4;
      if (this.wandering) this.wanderYaw = Math.random() * Math.PI * 2;
    }
    if (this.wandering) moveYaw = this.wanderYaw;
    this.headYaw = this.yaw;
    if (p && distP < 5 && this.type !== 'zombie') this.headYaw = Math.atan2(p.x - this.x, p.z - this.z);
  }

  if (moveYaw !== null) {
    // glatko okretanje
    let d = moveYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += KS.clamp(d, -3.5 * dt, 3.5 * dt);
    const sp = this.speed * sprint;
    this.vx += Math.sin(this.yaw) * sp * dt * 6;
    this.vz += Math.cos(this.yaw) * sp * dt * 6;
    const cur = Math.hypot(this.vx, this.vz);
    if (cur > sp) { this.vx *= sp / cur; this.vz *= sp / cur; }
  }

  const ph = this.physics(world, dt, { floats: true });
  // skoči ako je zapeo
  if ((ph.res.hitX || ph.res.hitZ) && this.onGround && moveYaw !== null) {
    this.vy = 7.2;
  }
  if (ph.inWater === 2) this.hurt(4 * dt, null, true);

  // zvukovi
  this.idleSndT -= dt;
  if (this.idleSndT <= 0 && distP < 22) {
    this.idleSndT = 5 + Math.random() * 11;
    if (this.type === 'pig') KS.snd.play('oink', { pos: this });
    else if (this.type === 'cow') KS.snd.play('moo', { pos: this });
    else KS.snd.play('groan', { pos: this, vol: 0.8 });
  }
};

Mob.prototype.hurt = function (dmg, src, silent) {
  if (this.dead) return;
  this.hp -= dmg;
  this.hurtT = 0.4;
  if (!silent) {
    KS.snd.play(this.type === 'zombie' ? 'zombieHurt' : (this.type === 'pig' ? 'oink' : 'moo'), { pos: this, pitch: 1.25 });
  }
  if (src) {
    const dx = this.x - src.x, dz = this.z - src.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vx += dx / d * 7; this.vz += dz / d * 7; this.vy = Math.max(this.vy, 4.5);
    if (this.type !== 'zombie') {
      this.fleeT = 5;
      this.fleeYaw = Math.atan2(dx, dz);
    }
  }
  if (this.hp <= 0) this.die(KS.game.world);
};

Mob.prototype.die = function (world) {
  this.dead = true;
  KS.particles.burstColor(this.x, this.y + this.h / 2, this.z, [200, 200, 200], 14, { up: 1.2, grav: 2, life: 0.8 });
  KS.snd.play('die', { pos: this, vol: 0.7 });
  const drop = (id, n) => { if (n > 0) KS.spawnItem(world, this.x, this.y + 0.4, this.z, { id, n }, true); };
  if (this.type === 'pig') drop(KS.I.porkRaw, 1 + (Math.random() * 2 | 0));
  else if (this.type === 'cow') drop(KS.I.beefRaw, 1 + (Math.random() * 2 | 0));
  else if (Math.random() < 0.7) drop(KS.I.flesh, 1);
};

// ---------- TNT ----------
function TntEntity (x, y, z, fuse) {
  Entity.call(this, x, y, z);
  this.kind = 'tnt';
  this.w = 0.49; this.h = 0.98;
  this.fuse = fuse !== undefined ? fuse : 4;
  this.vy = 3;
}
TntEntity.prototype = Object.create(Entity.prototype);
KS.TntEntity = TntEntity;

TntEntity.prototype.update = function (world, dt, game) {
  this.age += dt;
  this.fuse -= dt;
  this.physics(world, dt, {});
  if (Math.random() < dt * 8) {
    KS.particles.burstColor(this.x, this.y + 1.1, this.z, [200, 200, 200], 1, { spread: 0.2, speed: 0.5, up: 1, grav: -0.5, life: 0.8 });
  }
  if (this.fuse <= 0) {
    this.dead = true;
    KS.explode(world, this.x, this.y + 0.5, this.z, 4.2);
  }
};

KS.igniteTNT = function (world, x, y, z, fuse) {
  world.setBlock(x, y, z, 0);
  const e = new TntEntity(x + 0.5, y, z + 0.5, fuse);
  world.entities.push(e);
  KS.snd.play('fuse', { pos: e });
  return e;
};

KS.explode = function (world, ex, ey, ez, radius) {
  const B = KS.B;
  KS.snd.play('explode', { pos: { x: ex, y: ey, z: ez }, vol: 1 });
  const r = Math.ceil(radius);
  const toClear = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > radius * radius * (0.8 + Math.random() * 0.35)) continue;
    const x = Math.floor(ex) + dx, y = Math.floor(ey) + dy, z = Math.floor(ez) + dz;
    const id = world.getBlock(x, y, z);
    if (!id) continue;
    const def = KS.blocks[id];
    if (id === B.bedrock || id === B.obsidian || def.liquid) continue;
    if (id === B.tnt) {
      KS.igniteTNT(world, x, y, z, 0.3 + Math.random() * 0.8);
      continue;
    }
    toClear.push(x, y, z, id);
  }
  for (let i = 0; i < toClear.length; i += 4) {
    const x = toClear[i], y = toClear[i + 1], z = toClear[i + 2], id = toClear[i + 3];
    world.setBlock(x, y, z, 0);
    if (Math.random() < 0.25) {
      const def = KS.blocks[id];
      let dropId = typeof def.drop === 'function' ? def.drop() : (def.drop === 'leavesDrop' ? null : def.drop);
      if (dropId) KS.spawnItem(world, x + 0.5, y + 0.5, z + 0.5, { id: dropId, n: 1 }, true);
    }
  }
  KS.particles.burstColor(ex, ey, ez, [255, 200, 90], 26, { spread: 1.5, speed: 9, up: 1, grav: 3, life: 0.7, force: true });
  KS.particles.burstColor(ex, ey, ez, [90, 90, 90], 30, { spread: 2, speed: 6, up: 1.3, grav: -0.5, life: 1.6, force: true });

  // šteta i odbacivanje entiteta
  const hurtEnt = (e, isPlayer) => {
    const dx = e.x - ex, dy = (e.y + e.h / 2) - ey, dz = e.z - ez;
    const d = Math.hypot(dx, dy, dz);
    if (d > radius * 1.8) return;
    const dmg = Math.max(0, 26 * (1 - d / (radius * 1.8)));
    const kb = 14 * (1 - d / (radius * 2)) / Math.max(0.5, d);
    e.vx += dx * kb; e.vy += Math.abs(dy * kb) * 0.6 + 3; e.vz += dz * kb;
    if (isPlayer) e.hurt(dmg, null); else e.hurt(dmg, null);
  };
  for (const e of world.entities) {
    if (e.dead || e.kind === 'item') continue;
    if (e.kind === 'mob') hurtEnt(e, false);
  }
  const p = KS.game && KS.game.player;
  if (p && !p.dead) hurtEnt(p, true);
  if (KS.renderer) KS.renderer.shake = Math.max(KS.renderer.shake || 0, 0.6);
};

// ---------- spawnovanje ----------
KS.spawnPassiveInChunk = function (world, chunk) {
  if (!chunk.fresh || chunk.spawnedMobs) return;
  chunk.spawnedMobs = true;
  const rng = KS.mulberry32(KS.hashInts(world.seed, chunk.cx, chunk.cz, 55));
  if (rng() > 0.14) return;
  let passiveCount = 0;
  for (const e of world.entities) if (e.kind === 'mob' && e.type !== 'zombie') passiveCount++;
  if (passiveCount > 22) return;
  const type = rng() < 0.5 ? 'pig' : 'cow';
  const n = 1 + (rng() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const lx = 2 + (rng() * 12 | 0), lz = 2 + (rng() * 12 | 0);
    const x = chunk.cx * 16 + lx, z = chunk.cz * 16 + lz;
    const info = world.heightInfo(x, z);
    if (info.h <= KS.SEA || (info.biome !== 2 && info.biome !== 3)) continue;
    const surf = world.getBlock(x, info.h, z);
    if (surf !== KS.B.grass) continue;
    world.entities.push(new Mob(x + 0.5, info.h + 1, z + 0.5, type));
  }
};

KS.trySpawnHostile = function (world, game) {
  if (game.diff === 'peace' || game.dayFactor > 0.28) return;
  let count = 0;
  for (const e of world.entities) if (e.kind === 'mob' && e.type === 'zombie' && !e.dead) count++;
  if (count >= 8) return;
  const p = game.player;
  for (let attempt = 0; attempt < 6; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const d = 26 + Math.random() * 18;
    const x = Math.floor(p.x + Math.sin(ang) * d), z = Math.floor(p.z + Math.cos(ang) * d);
    const c = world.chunkAt(x >> 4, z >> 4);
    if (!c || !c.generated || !c.lit) continue;
    // nađi površinu
    let y = -1;
    for (let yy = KS.WH - 2; yy > 1; yy--) {
      if (world.isSolid(x, yy, z) && !world.isSolid(x, yy + 1, z) && !world.isSolid(x, yy + 2, z)) { y = yy + 1; break; }
    }
    if (y < 0) continue;
    const id = world.getBlock(x, y - 1, z);
    if (KS.blocks[id] && KS.blocks[id].liquid) continue;
    const sky = world.getSky(x, y, z) * game.dayFactor;
    const blk = world.getBlkL(x, y, z);
    if (Math.max(sky, blk) > 4) continue;
    world.entities.push(new Mob(x + 0.5, y, z + 0.5, 'zombie'));
    return;
  }
};

})();
