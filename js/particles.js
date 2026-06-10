// ===== KockaSvijet — čestice (lom blokova, eksplozije, dim...) =====
(function () {

const MAX = 600;

KS.particles = {
  list: [],
  level: 2, // 0 ništa, 1 malo, 2 sve

  clear () { this.list.length = 0; },

  // čestice od loma bloka: uzorkuju sub-uv pločice bloka
  burstBlock (x, y, z, blockId, count) {
    if (this.level === 0) return;
    if (this.level === 1) count = Math.ceil(count / 3);
    const def = KS.blocks[blockId];
    if (!def) return;
    const tile = def.tex.side;
    for (let i = 0; i < count; i++) {
      if (this.list.length >= MAX) this.list.shift();
      this.list.push({
        x: x + 0.2 + Math.random() * 0.6,
        y: y + 0.2 + Math.random() * 0.6,
        z: z + 0.2 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 3.4,
        vy: Math.random() * 4 + 1,
        vz: (Math.random() - 0.5) * 3.4,
        life: 0.5 + Math.random() * 0.5,
        size: 0.07 + Math.random() * 0.07,
        tile,
        tu: Math.random() * 12, tv: Math.random() * 12, // sub-uv u pikselima pločice
        grav: 12,
        tint: def.tint === 1 || def.tintTop || def.tint === 2 ? [0.45, 0.75, 0.3] : null,
      });
    }
  },

  burstColor (x, y, z, rgb, count, opts) {
    if (this.level === 0 && !(opts && opts.force)) return;
    opts = opts || {};
    for (let i = 0; i < count; i++) {
      if (this.list.length >= MAX) this.list.shift();
      const sp = opts.speed || 3;
      this.list.push({
        x: x + (Math.random() - 0.5) * (opts.spread || 0.6),
        y: y + (Math.random() - 0.5) * (opts.spread || 0.6),
        z: z + (Math.random() - 0.5) * (opts.spread || 0.6),
        vx: (Math.random() - 0.5) * sp,
        vy: Math.random() * sp * (opts.up !== undefined ? opts.up : 1),
        vz: (Math.random() - 0.5) * sp,
        life: (opts.life || 0.7) * (0.6 + Math.random() * 0.7),
        size: (opts.size || 0.1) * (0.7 + Math.random() * 0.6),
        color: rgb,
        grav: opts.grav !== undefined ? opts.grav : 9,
      });
    }
  },

  update (world, dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      // jednostavna kolizija s tlom
      if (world.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6;
        if (Math.abs(p.vy) < 0.5) p.vy = 0;
      } else {
        p.x = nx; p.y = ny; p.z = nz;
      }
    }
  },
};

})();
