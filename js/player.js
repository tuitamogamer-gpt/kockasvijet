// ===== KockaSvijet — igrač: kretanje, kopanje, inventar, glad/zdravlje =====
(function () {

function Player (world, opts) {
  opts = opts || {};
  this.world = world;
  this.x = opts.x || 0.5; this.y = opts.y || 50; this.z = opts.z || 0.5;
  this.vx = 0; this.vy = 0; this.vz = 0;
  this.yaw = opts.yaw || 0;
  this.pitch = opts.pitch || 0;
  this.w = 0.3; this.h = 1.8;
  this.eyeH = 1.62;
  this.onGround = false;
  this.flying = world.mode === 'creative' && false;
  this.sneaking = false;
  this.sprinting = false;
  this.dead = false;

  this.hp = opts.hp !== undefined ? opts.hp : 20;
  this.food = opts.food !== undefined ? opts.food : 20;
  this.saturation = 5;
  this.exhaustion = 0;
  this.air = opts.air !== undefined ? opts.air : 300;
  this.hurtT = 0;
  this.regenT = 0;
  this.starveT = 0;

  this.inv = new Array(36).fill(null);
  if (opts.inv) opts.inv.forEach((s, i) => { if (s) this.inv[i] = { id: s.id, n: s.n, dur: s.dur }; });
  this.sel = opts.sel || 0;
  this.spawn = opts.spawn || { x: this.x, y: this.y, z: this.z };

  // rudarenje
  this.mining = null;       // {x,y,z, progress, time}
  this.swingT = 0;          // animacija zamaha
  this.useT = 0;            // cooldown desnog klika
  this.attackT = 0;
  this.eatingT = 0;
  this.fallStart = this.y;
  this.walkDist = 0;
  this.lastStepDist = 0;
  this.bobT = 0;
  this.fovKick = 0;
  this.lastSpaceT = -1;
  this.lastWT = -1;
}
KS.Player = Player;

Player.prototype.heldStack = function () { return this.inv[this.sel]; };
Player.prototype.heldId = function () { const s = this.inv[this.sel]; return s ? s.id : 0; };

// ---------- inventar ----------
// vraća koliko NIJE stalo
Player.prototype.addItem = function (stack) {
  let n = stack.n;
  const max = KS.maxStackOf(stack.id);
  // prvo postojeći stackovi (hotbar pa ostatak)
  const order = [];
  for (let i = 0; i < 36; i++) order.push(i);
  for (const i of order) {
    const s = this.inv[i];
    if (s && s.id === stack.id && s.dur === undefined && stack.dur === undefined && s.n < max) {
      const take = Math.min(max - s.n, n);
      s.n += take; n -= take;
      if (n === 0) return 0;
    }
  }
  for (const i of order) {
    if (!this.inv[i]) {
      const take = Math.min(max, n);
      this.inv[i] = { id: stack.id, n: take, dur: stack.dur };
      n -= take;
      if (n === 0) return 0;
    }
  }
  return n;
};
Player.prototype.consumeHeld = function (n) {
  const s = this.inv[this.sel];
  if (!s) return;
  s.n -= (n || 1);
  if (s.n <= 0) this.inv[this.sel] = null;
};
Player.prototype.damageTool = function () {
  if (this.world.mode === 'creative') return;
  const s = this.inv[this.sel];
  if (!s || KS.isBlockId(s.id)) return;
  const def = KS.items[s.id];
  if (!def.tool) return;
  s.dur = (s.dur === undefined ? def.tool.dur : s.dur) - 1;
  if (s.dur <= 0) {
    this.inv[this.sel] = null;
    KS.snd.play('break', { vol: 0.7, mat: 'glass' });
  }
};

// ---------- šteta ----------
Player.prototype.hurt = function (dmg, src) {
  if (this.dead || this.world.mode === 'creative') return;
  if (this.hurtInvT > 0) return;
  this.hp -= dmg;
  this.hurtT = 0.5;
  this.hurtInvT = 0.5;
  KS.snd.play('hurt', { vol: 0.9 });
  if (src) {
    const dx = this.x - src.x, dz = this.z - src.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vx += dx / d * 6; this.vz += dz / d * 6; this.vy = Math.max(this.vy, 4);
  }
  if (this.hp <= 0) this.die();
};
Player.prototype.die = function () {
  if (this.dead) return;
  this.dead = true;
  this.hp = 0;
  KS.snd.play('die', { vol: 1 });
  // ispusti sve
  for (let i = 0; i < 36; i++) {
    if (this.inv[i]) {
      KS.spawnItem(this.world, this.x, this.y + 0.8, this.z, this.inv[i]);
      this.inv[i] = null;
    }
  }
  if (KS.ui) KS.ui.onPlayerDeath();
};
Player.prototype.respawn = function () {
  this.dead = false;
  this.hp = 20; this.food = 20; this.saturation = 5; this.air = 300;
  this.x = this.spawn.x; this.y = this.spawn.y; this.z = this.spawn.z;
  this.vx = this.vy = this.vz = 0;
  this.fallStart = this.y;
  this.mining = null;
};

Player.prototype.addExhaustion = function (e) {
  if (this.world.mode === 'creative') return;
  this.exhaustion += e;
  while (this.exhaustion >= 4) {
    this.exhaustion -= 4;
    if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
    else this.food = Math.max(0, this.food - 1);
  }
};

// ---------- glavni update ----------
Player.prototype.update = function (dt, input, game) {
  const world = this.world;
  if (this.dead) return;
  this.hurtT = Math.max(0, this.hurtT - dt);
  this.hurtInvT = Math.max(0, (this.hurtInvT || 0) - dt);
  this.swingT = Math.max(0, this.swingT - dt * 2.4);
  this.useT = Math.max(0, this.useT - dt);
  this.attackT = Math.max(0, this.attackT - dt);

  const creative = world.mode === 'creative';
  const inWater = KS.inLiquid(world, this, 0.4);
  const headWater = KS.inLiquid(world, { x: this.x, y: this.y + this.eyeH - 0.12, z: this.z, w: 0.1, h: 0.2 }, 0.5);

  // ---- kretanje ----
  let mx = 0, mz = 0;
  if (input.fwd) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  if (moving) { const l = Math.hypot(mx, mz); mx /= l; mz /= l; }

  this.sneaking = input.sneak && !this.flying;
  if (input.sprint && input.fwd && !this.sneaking && (creative || this.food > 6)) this.sprinting = true;
  if (!input.fwd || this.sneaking) this.sprinting = false;

  let speed = 4.32;
  if (this.sprinting) speed *= 1.42;
  if (this.sneaking) speed *= 0.35;
  if (this.flying) speed *= this.sprinting ? 2.6 : 2.1;
  if (inWater && !this.flying) speed *= 0.55;

  // smjer u svijetu
  const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
  const wx = (mz * sin + mx * cos), wz = (mz * cos - mx * sin);

  const accel = this.onGround || this.flying ? 38 : 9;
  this.vx += wx * speed * accel * dt * 0.28;
  this.vz += wz * speed * accel * dt * 0.28;
  const hv = Math.hypot(this.vx, this.vz);
  if (hv > speed) { this.vx *= speed / hv; this.vz *= speed / hv; }

  if (this.flying) {
    this.vy *= Math.pow(0.02, dt);
    if (input.jump) this.vy = 7.5;
    else if (input.sneak) this.vy = -7.5;
    if (!creative) this.flying = false;
  } else if (inWater) {
    this.vy -= 10 * dt;
    this.vy *= Math.pow(0.38, dt);
    if (input.jump) this.vy += 26 * dt;
    if (this.vy < -2.2) this.vy = -2.2;
  } else {
    this.vy -= 28 * dt;
    if (this.vy < -54) this.vy = -54;
    if (input.jump && this.onGround) {
      this.vy = 8.4;
      this.addExhaustion(this.sprinting ? 0.2 : 0.05);
      KS.snd.play('jump', { vol: 0.5 });
    }
  }

  // trenje
  const standOn = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.4), Math.floor(this.z));
  const slip = (standOn === KS.B.ice && this.onGround) ? Math.pow(0.6, dt) : (this.onGround ? Math.pow(0.0001, dt) : Math.pow(0.025, dt));
  this.vx *= slip; this.vz *= slip;
  if (this.flying) { this.vx *= Math.pow(0.05, dt); this.vz *= Math.pow(0.05, dt); }

  // šunjanje: ne padaj s ivice
  let dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;
  if (this.sneaking && this.onGround) {
    const safe = (ddx, ddz) => {
      const minX = Math.floor(this.x + ddx - this.w), maxX = Math.floor(this.x + ddx + this.w);
      const minZ = Math.floor(this.z + ddz - this.w), maxZ = Math.floor(this.z + ddz + this.w);
      const fy = Math.floor(this.y - 0.6);
      for (let bx = minX; bx <= maxX; bx++) for (let bz = minZ; bz <= maxZ; bz++) {
        if (world.isSolid(bx, fy, bz)) return true;
      }
      return false;
    };
    if (!safe(dx, 0)) dx = 0;
    if (!safe(dx, dz)) dz = 0;
  }

  const wasFalling = this.vy < -3;
  const res = KS.moveBox(world, this, dx, dy, dz);
  const movedX = res.x - this.x, movedZ = res.z - this.z;
  this.x = res.x; this.y = res.y; this.z = res.z;

  // pad i šteta od pada
  if (!this.onGround && res.onGround) {
    const fall = this.fallStart - this.y;
    if (fall > 3.4 && !creative && !inWater) {
      const dmg = Math.floor(fall - 3);
      if (dmg > 0) this.hurt(dmg, null);
    }
    if (wasFalling) KS.snd.play('step', { vol: 0.8, mat: 'stone' });
  }
  if (res.onGround || this.flying || inWater) this.fallStart = this.y;
  else if (this.y > this.fallStart) this.fallStart = this.y;
  this.onGround = res.onGround;
  if (res.hitY) this.vy = 0;
  if (res.hitX) this.vx = 0;
  if (res.hitZ) this.vz = 0;

  // koraci (zvuk)
  const hDist = Math.hypot(movedX, movedZ);
  this.walkDist += hDist;
  if (this.onGround && this.walkDist - this.lastStepDist > 2.1) {
    this.lastStepDist = this.walkDist;
    const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(this.z));
    if (below) {
      const def = KS.blocks[below];
      let mat = 'grass';
      if (def.tool === 'pick') mat = 'stone';
      else if (def.tool === 'axe') mat = 'wood';
      else if (below === KS.B.sand || below === KS.B.gravel) mat = 'sand';
      else if (below === KS.B.snowGrass || below === KS.B.snow) mat = 'snow';
      KS.snd.play('step', { vol: this.sneaking ? 0.3 : 1, mat });
    }
    this.addExhaustion(this.sprinting ? 0.02 : 0.004);
  }
  if (this.onGround && hDist > 0.01) this.bobT += hDist * 1.6;

  // ---- voda: zrak i davljenje ----
  if (headWater === 1) {
    this.air -= dt * 20;
    if (this.air <= 0) {
      this.air = 0;
      this.drownT = (this.drownT || 0) + dt;
      if (this.drownT > 1) { this.drownT = 0; this.hurt(2, null); }
    }
  } else {
    this.air = Math.min(300, this.air + dt * 90);
    this.drownT = 0;
  }
  // lava i kaktus
  const touching = KS.boxTouches(world, this, 0.05);
  if (touching.has(KS.B.lava)) { this.lavaT = (this.lavaT || 0) + dt; if (this.lavaT > 0.4) { this.lavaT = 0; this.hurt(4, null); } }
  if (touching.has(KS.B.cactus)) { this.cactusT = (this.cactusT || 0) + dt; if (this.cactusT > 0.7) { this.cactusT = 0; this.hurt(1, null); } }

  // ---- glad/regeneracija ----
  if (!creative) {
    if (this.sprinting && moving) this.addExhaustion(dt * 0.45);
    if (this.food >= 18 && this.hp < 20) {
      this.regenT += dt;
      if (this.regenT >= 3.2) { this.regenT = 0; this.hp = Math.min(20, this.hp + 1); this.addExhaustion(1.6); }
    } else if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 3.5) { this.starveT = 0; if (this.hp > 1) this.hurt(1, null); }
    } else this.regenT = 0;
  }

  // ---- jelo (drži desni klik) ----
  if (this.eatingT > 0) {
    const s = this.heldStack();
    const def = s && !KS.isBlockId(s.id) ? KS.items[s.id] : null;
    if (!input.use || !def || !def.food || this.food >= 20) {
      this.eatingT = 0;
    } else {
      this.eatingT -= dt;
      if (Math.random() < dt * 8) KS.snd.play('eat', { vol: 0.8 });
      if (this.eatingT <= 0) {
        this.food = Math.min(20, this.food + def.food);
        this.saturation = Math.min(this.food, this.saturation + def.food * 0.6);
        this.consumeHeld(1);
        KS.snd.play('burp', { vol: 0.7 });
      }
    }
  }

  // ---- ciljanje bloka ----
  const reach = creative ? 5.5 : 4.6;
  const eye = this.eyePos();
  const dir = this.lookDir();
  this.target = KS.raycast(world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach);

  // ---- rudarenje ----
  if (input.attack && this.target && !this.dead && !game.uiOpen) {
    const t = this.target;
    if (creative) {
      if (!this.lastInstaBreak || this.lastInstaBreak < game.now - 0.22) {
        this.lastInstaBreak = game.now;
        this.breakBlock(t.x, t.y, t.z, true);
        this.swingT = 1;
      }
    } else {
      if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z) {
        const info = KS.breakInfo(t.id, this.heldId());
        this.mining = { x: t.x, y: t.y, z: t.z, progress: 0, time: info.time, canHarvest: info.canHarvest, id: t.id };
      }
      this.mining.progress += dt;
      this.swingT = 1;
      if (Math.random() < dt * 5) {
        const def = KS.blocks[t.id];
        KS.snd.play('dig', { pos: { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 }, mat: this.matOf(def), vol: 0.6 });
        KS.particles.burstBlock(t.x, t.y, t.z, t.id, 2);
      }
      if (this.mining.progress >= this.mining.time) {
        this.breakBlock(t.x, t.y, t.z, this.mining.canHarvest);
        this.mining = null;
        this.addExhaustion(0.03);
      }
    }
  } else this.mining = null;

  // ---- napad na mobove (klik) ----
  // (obrađuje se u onAttackPress da ne udara svaki frame)
};

Player.prototype.matOf = function (def) {
  if (!def) return 'stone';
  if (def.key === 'glass' || def.key === 'ice') return 'glass';
  if (def.tool === 'pick') return 'stone';
  if (def.tool === 'axe' || def.key === 'planks') return 'wood';
  if (def.key === 'sand' || def.key === 'gravel') return 'sand';
  if (def.key === 'snow' || def.key === 'snowGrass') return 'snow';
  if (def.key && def.key.startsWith('wool')) return 'wool';
  return 'grass';
};

Player.prototype.eyePos = function () {
  return { x: this.x, y: this.y + (this.sneaking ? this.eyeH - 0.12 : this.eyeH), z: this.z };
};
Player.prototype.lookDir = function () {
  const cp = Math.cos(this.pitch);
  return { x: Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: Math.cos(this.yaw) * cp };
};

Player.prototype.breakBlock = function (x, y, z, canHarvest) {
  const world = this.world;
  const id = world.getBlock(x, y, z);
  if (!id) return;
  const def = KS.blocks[id];
  if (def.h < 0) return;
  world.setBlock(x, y, z, 0);
  KS.snd.play('break', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, mat: this.matOf(def), vol: 1 });
  KS.particles.burstBlock(x, y, z, id, 14);
  this.damageTool();

  // drop
  if (canHarvest && world.mode !== 'creative') {
    let drop = null;
    if (def.drop === 'leavesDrop') {
      drop = KS.leavesDrop();
    } else if (typeof def.drop === 'function') {
      const d = def.drop();
      if (d) drop = { id: d, n: 1 };
    } else if (def.drop) {
      drop = { id: def.drop, n: 1 };
    }
    if (drop) KS.spawnItem(world, x + 0.5, y + 0.35, z + 0.5, drop, true);
  }
  // blok iznad koji treba podršku (cvijeće, baklja...)
  const above = world.getBlock(x, y + 1, z);
  if (above) {
    const adef = KS.blocks[above];
    if (adef.cross) {
      world.setBlock(x, y + 1, z, 0);
      if (world.mode !== 'creative' && adef.drop) {
        KS.spawnItem(world, x + 0.5, y + 1.3, z + 0.5, { id: typeof adef.drop === 'function' ? adef.drop() : adef.drop, n: 1 }, true);
      }
    }
  }
};

// desni klik: koristi/postavi. Vraća true ako je nešto obavljeno.
Player.prototype.useBlock = function (game) {
  const t = this.target;
  const world = this.world;
  if (!t) return false;

  // interakcija s blokom (osim ako se šunja)
  const def = KS.blocks[t.id];
  if (def.interact && !this.sneaking) {
    if (def.interact === 'craft') { KS.ui.openCraftTable(); return true; }
    if (def.interact === 'furnace') { KS.ui.openFurnace(t.x, t.y, t.z); return true; }
    if (def.interact === 'chest') { KS.ui.openChest(t.x, t.y, t.z); return true; }
    if (def.interact === 'tnt') { KS.igniteTNT(world, t.x, t.y, t.z); return true; }
  }

  // jelo
  const held = this.heldStack();
  if (held && !KS.isBlockId(held.id)) {
    const idef = KS.items[held.id];
    if (idef.food && this.food < 20 && world.mode !== 'creative') {
      if (this.eatingT <= 0) this.eatingT = 1.5;
      return true;
    }
    return false;
  }
  if (!held) return false;

  // postavljanje bloka
  const bdef = KS.blocks[held.id];
  if (!bdef) return false;
  const px = t.px, py = t.py, pz = t.pz;
  if (world.getBlock(px, py, pz) !== 0) {
    const existing = KS.blocks[world.getBlock(px, py, pz)];
    if (!existing || !existing.cross) return false;
  }
  // uslovi podrške
  if (bdef.needsSoil) {
    const below = world.getBlock(px, py - 1, pz);
    if (below !== KS.B.grass && below !== KS.B.dirt && below !== KS.B.snowGrass) return false;
  }
  if (bdef.needsSupport) {
    let support = world.isSolid(px, py - 1, pz) || world.isSolid(px + 1, py, pz) || world.isSolid(px - 1, py, pz) || world.isSolid(px, py, pz + 1) || world.isSolid(px, py, pz - 1);
    if (!support) return false;
  }
  if (KS.B.cactus === held.id) {
    const below = world.getBlock(px, py - 1, pz);
    if (below !== KS.B.sand && below !== KS.B.cactus) return false;
  }
  // ne postavljaj u sebe/mobove
  if (bdef.solid) {
    const bb = { x: px + 0.5, y: py, z: pz + 0.5, w: 0.5, h: 1 };
    const overlaps = (e) => Math.abs(e.x - bb.x) < e.w + 0.5 && Math.abs(e.z - bb.z) < e.w + 0.5 && e.y + e.h > py && e.y < py + 1;
    if (overlaps(this)) return false;
    for (const e of world.entities) if (e.kind === 'mob' && !e.dead && overlaps(e)) return false;
  }

  if (world.setBlock(px, py, pz, held.id)) {
    KS.snd.play('place', { pos: { x: px + 0.5, y: py + 0.5, z: pz + 0.5 }, mat: this.matOf(bdef), vol: 0.9 });
    if (bdef.interact === 'furnace') world.blockEnts.set(px + ',' + py + ',' + pz, { type: 'furnace', in: null, fuel: null, out: null, burn: 0, burnMax: 0, progress: 0 });
    if (bdef.interact === 'chest') world.blockEnts.set(px + ',' + py + ',' + pz, { type: 'chest', slots: new Array(27).fill(null) });
    if (world.mode !== 'creative') this.consumeHeld(1);
    this.swingT = 1;
    return true;
  }
  return false;
};

// napad (jedan pritisak)
Player.prototype.attackPress = function (game) {
  this.swingT = 1;
  if (this.attackT > 0) return;
  this.attackT = 0.35;
  // raycast na mobove
  const eye = this.eyePos(), dir = this.lookDir();
  const world = this.world;
  let best = null, bestD = 3.4;
  for (const e of world.entities) {
    if (e.dead || e.kind === 'item') continue;
    // ray vs AABB
    const minX = e.x - e.w, maxX = e.x + e.w, minY = e.y, maxY = e.y + e.h, minZ = e.z - e.w, maxZ = e.z + e.w;
    let tmin = 0, tmax = bestD, ok = true;
    const o = [eye.x, eye.y, eye.z], d = [dir.x, dir.y, dir.z], lo = [minX, minY, minZ], hi = [maxX, maxY, maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) { if (o[i] < lo[i] || o[i] > hi[i]) { ok = false; break; } }
      else {
        let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < bestD) {
      // blokovi ispred?
      const bHit = KS.raycast(world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, tmin);
      if (!bHit) { best = e; bestD = tmin; }
    }
  }
  if (best) {
    let dmg = 1;
    const held = this.heldStack();
    if (held && !KS.isBlockId(held.id) && KS.items[held.id].tool) {
      dmg = KS.items[held.id].tool.dmg;
      this.damageTool();
    }
    best.hurt(dmg, this);
    KS.snd.play('attack', { vol: 0.8 });
    this.addExhaustion(0.1);
    return true;
  }
  return false;
};

// baci predmet iz ruke
Player.prototype.dropHeld = function (all) {
  const s = this.heldStack();
  if (!s) return;
  const n = all ? s.n : 1;
  const dir = this.lookDir();
  const e = KS.spawnItem(this.world, this.x + dir.x * 0.6, this.y + 1.3, this.z + dir.z * 0.6, { id: s.id, n, dur: s.dur });
  if (e) {
    e.vx = dir.x * 6; e.vy = 2.4; e.vz = dir.z * 6;
    e.pickupDelay = 1.5;
  }
  s.n -= n;
  if (s.n <= 0) this.inv[this.sel] = null;
};

})();
