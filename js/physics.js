// ===== KockaSvijet — fizika: AABB kolizije + DDA raycast =====
(function () {

// pomjeri AABB (centar x,z; noge y) za dv uz kolizije; vraća {x,y,z,vx,vy,vz,onGround,hitX,hitZ}
// box = {x,y,z, w(pola širine), h(visina)}
KS.moveBox = function (world, box, dx, dy, dz) {
  const out = { x: box.x, y: box.y, z: box.z, onGround: false, hitX: false, hitZ: false, hitY: false };

  const collides = (px, py, pz) => {
    const minX = Math.floor(px - box.w), maxX = Math.floor(px + box.w);
    const minY = Math.floor(py), maxY = Math.floor(py + box.h);
    const minZ = Math.floor(pz - box.w), maxZ = Math.floor(pz + box.w);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++)
          if (world.isSolid(x, y, z)) return true;
    return false;
  };

  // Y osa
  const stepAxis = (delta, axis) => {
    const STEP = 0.25;
    let moved = 0;
    const sign = Math.sign(delta);
    let rem = Math.abs(delta);
    while (rem > 0) {
      const s = Math.min(STEP, rem);
      let nx = out.x, ny = out.y, nz = out.z;
      if (axis === 0) nx += s * sign;
      else if (axis === 1) ny += s * sign;
      else nz += s * sign;
      if (collides(nx, ny, nz)) {
        // pokušaj precizno do zida
        let lo = 0, hi = s;
        for (let it = 0; it < 5; it++) {
          const mid = (lo + hi) / 2;
          let tx = out.x, ty = out.y, tz = out.z;
          if (axis === 0) tx += mid * sign; else if (axis === 1) ty += mid * sign; else tz += mid * sign;
          if (collides(tx, ty, tz)) hi = mid; else lo = mid;
        }
        if (axis === 0) { out.x += lo * sign; out.hitX = true; }
        else if (axis === 1) { out.y += lo * sign; out.hitY = true; if (sign < 0) out.onGround = true; }
        else { out.z += lo * sign; out.hitZ = true; }
        return moved + lo * sign;
      }
      out.x = nx; out.y = ny; out.z = nz;
      moved += s * sign;
      rem -= s;
    }
    return moved;
  };

  stepAxis(dy, 1);
  stepAxis(dx, 0);
  stepAxis(dz, 2);
  return out;
};

// koje blokove AABB dodiruje (za lava/kaktus štetu, vodu)
KS.boxTouches = function (world, box, pad) {
  pad = pad || 0;
  const ids = new Set();
  const minX = Math.floor(box.x - box.w - pad), maxX = Math.floor(box.x + box.w + pad);
  const minY = Math.floor(box.y - pad), maxY = Math.floor(box.y + box.h + pad);
  const minZ = Math.floor(box.z - box.w - pad), maxZ = Math.floor(box.z + box.w + pad);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        const id = world.getBlock(x, y, z);
        if (id) ids.add(id);
      }
  return ids;
};

// da li je AABB u tekućini (provjera na visini frac od dna)
KS.inLiquid = function (world, box, frac) {
  const y = Math.floor(box.y + box.h * (frac === undefined ? 0.5 : frac));
  const id = world.getBlock(Math.floor(box.x), y, Math.floor(box.z));
  if (!id) return 0;
  const def = KS.blocks[id];
  if (!def.liquid) return 0;
  return id === KS.B.water ? 1 : 2; // 1 voda, 2 lava
};

// DDA raycast kroz voxele; vraća {x,y,z,px,py,pz,face,id,dist} ili null
// solidFn: koje blokove pogađa (default svi osim tečnosti)
KS.raycast = function (world, ox, oy, oz, dx, dy, dz, maxDist, hitLiquid) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx) || 1, stepY = Math.sign(dy) || 1, stepZ = Math.sign(dz) || 1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX) : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY) : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ) : Infinity;
  let face = -1, t = 0;
  let px = x, py = y, pz = z;

  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id) {
      const def = KS.blocks[id];
      const hit = def.liquid ? !!hitLiquid : true;
      if (hit && t <= maxDist) {
        return { x, y, z, px, py, pz, face, id, dist: t };
      }
    }
    px = x; py = y; pz = z;
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 1 : 0; // pogođena -X ili +X strana
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 3 : 2;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4;
    }
    if (t > maxDist) return null;
  }
  return null;
};

})();
