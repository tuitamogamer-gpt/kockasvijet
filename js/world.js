// ===== KockaSvijet — svijet: chunkovi + generisanje terena =====
(function () {

const CH = KS.CH = 16;     // širina chunka
const WH = KS.WH = 96;     // visina svijeta
const SEA = KS.SEA = 30;   // nivo mora
const CHUNK_VOL = CH * CH * WH;

KS.idx = (lx, y, lz) => (y << 8) | (lz << 4) | lx;

// ---------- Chunk ----------
function Chunk (cx, cz) {
  this.cx = cx; this.cz = cz;
  this.blocks = new Uint8Array(CHUNK_VOL);
  this.skyL = new Uint8Array(CHUNK_VOL);
  this.blkL = new Uint8Array(CHUNK_VOL);
  this.heights = new Uint8Array(CH * CH); // najviši ne-prozirni blok + 1
  this.generated = false;   // teren postoji
  this.lit = false;         // svjetlo izračunato
  this.meshed = false;      // mesh poslan GPU-u
  this.dirty = false;       // treba remesh
  this.modified = false;    // igrač mijenjao → spremiti
  this.spawnedMobs = false;
  this.glOpaque = null; this.glWater = null; // renderer drži
}
Chunk.prototype.get = function (lx, y, lz) {
  if (y < 0 || y >= WH) return 0;
  return this.blocks[(y << 8) | (lz << 4) | lx];
};
Chunk.prototype.set = function (lx, y, lz, id) {
  if (y < 0 || y >= WH) return;
  this.blocks[(y << 8) | (lz << 4) | lx] = id;
};
Chunk.prototype.recalcHeight = function (lx, lz) {
  const blocks = KS.blocks;
  for (let y = WH - 1; y >= 0; y--) {
    const id = this.blocks[(y << 8) | (lz << 4) | lx];
    if (id && blocks[id].opaque) { this.heights[lz * 16 + lx] = y + 1; return; }
  }
  this.heights[lz * 16 + lx] = 0;
};

// ---------- World ----------
function World (opts) {
  this.id = opts.id;
  this.seed = opts.seed >>> 0;
  this.mode = opts.mode || 'survival';
  this.type = opts.type || 'normal';
  this.diff = opts.diff || 'normal';
  this.name = opts.name || 'Svijet';
  this.time = opts.time !== undefined ? opts.time : 0.06; // jutro
  this.chunks = new Map();          // "cx,cz" → Chunk
  this.entities = [];
  this.blockEnts = new Map();       // "x,y,z" → {type, ...}
  this.dirtyMesh = new Set();       // chunkovi za remesh
  this.genQueue = [];
  this.savedChunkKeys = new Set(opts.savedChunkKeys || []);

  const S = this.seed;
  this.nTerrain = new KS.Simplex(KS.hashInts(S, 1));
  this.nHills = new KS.Simplex(KS.hashInts(S, 2));
  this.nMountain = new KS.Simplex(KS.hashInts(S, 3));
  this.nMask = new KS.Simplex(KS.hashInts(S, 4));
  this.nTemp = new KS.Simplex(KS.hashInts(S, 5));
  this.nMoist = new KS.Simplex(KS.hashInts(S, 6));
  this.nCaveA = new KS.Simplex(KS.hashInts(S, 7));
  this.nCaveB = new KS.Simplex(KS.hashInts(S, 8));
  this.nCaveC = new KS.Simplex(KS.hashInts(S, 9));
  this._hCache = new Map();
}
KS.World = World;

World.prototype.key = (cx, cz) => cx + ',' + cz;

World.prototype.chunkAt = function (cx, cz) {
  return this.chunks.get(cx + ',' + cz) || null;
};
World.prototype.getBlock = function (x, y, z) {
  if (y < 0 || y >= WH) return 0;
  const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
  if (!c || !c.generated) return 0;
  return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
};
World.prototype.getSky = function (x, y, z) {
  if (y >= WH) return 15;
  if (y < 0) return 0;
  const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
  if (!c || !c.generated) return 15;
  return c.skyL[(y << 8) | ((z & 15) << 4) | (x & 15)];
};
World.prototype.getBlkL = function (x, y, z) {
  if (y < 0 || y >= WH) return 0;
  const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
  if (!c) return 0;
  return c.blkL[(y << 8) | ((z & 15) << 4) | (x & 15)];
};
World.prototype.isSolid = function (x, y, z) {
  const id = this.getBlock(x, y, z);
  return id !== 0 && KS.blocks[id].solid;
};
World.prototype.isOpaque = function (x, y, z) {
  if (y < 0) return true;
  if (y >= WH) return false;
  const id = this.getBlock(x, y, z);
  return id !== 0 && KS.blocks[id].opaque;
};

// postavljanje bloka u igri (svjetlo + remesh + save flag)
World.prototype.setBlock = function (x, y, z, id, opts) {
  if (y < 0 || y >= WH) return false;
  const cx = x >> 4, cz = z >> 4;
  const c = this.chunks.get(cx + ',' + cz);
  if (!c || !c.generated) return false;
  const lx = x & 15, lz = z & 15;
  const i = (y << 8) | (lz << 4) | lx;
  const old = c.blocks[i];
  if (old === id) return false;
  c.blocks[i] = id;
  c.recalcHeight(lx, lz);
  if (!opts || !opts.noSave) c.modified = true;
  // block entiteti
  const bek = x + ',' + y + ',' + z;
  if (this.blockEnts.has(bek) && (!id || !KS.blocks[id].interact)) this.blockEnts.delete(bek);
  if (!opts || !opts.noLight) KS.light.onBlockChanged(this, x, y, z, old, id);
  this.markDirtyAround(x, y, z);
  return true;
};
World.prototype.markDirtyAround = function (x, y, z) {
  const cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
  this.markDirty(cx, cz);
  if (lx === 0) this.markDirty(cx - 1, cz);
  if (lx === 15) this.markDirty(cx + 1, cz);
  if (lz === 0) this.markDirty(cx, cz - 1);
  if (lz === 15) this.markDirty(cx, cz + 1);
  if (lx === 0 && lz === 0) this.markDirty(cx - 1, cz - 1);
  if (lx === 15 && lz === 0) this.markDirty(cx + 1, cz - 1);
  if (lx === 0 && lz === 15) this.markDirty(cx - 1, cz + 1);
  if (lx === 15 && lz === 15) this.markDirty(cx + 1, cz + 1);
};
World.prototype.markDirty = function (cx, cz) {
  const c = this.chunks.get(cx + ',' + cz);
  if (c && c.meshed) { c.dirty = true; this.dirtyMesh.add(c); }
};

// ---------- visine i biomi ----------
// biome: 0 ocean, 1 plaža, 2 ravnica, 3 šuma, 4 pustinja, 5 snijeg, 6 planine
World.prototype.heightInfo = function (x, z) {
  const k = x + ',' + z;
  let h = this._hCache.get(k);
  if (h) return h;
  if (this._hCache.size > 60000) this._hCache.clear();

  if (this.type === 'flat') {
    h = { h: 34, biome: 2, temp: 0, moist: 0 };
    this._hCache.set(k, h);
    return h;
  }
  const cont = this.nTerrain.fbm2(x * 0.0016, z * 0.0016, 4);
  const hills = this.nHills.fbm2(x * 0.009, z * 0.009, 3);
  let mountainMask = this.nMask.noise2D(x * 0.0035, z * 0.0035);
  mountainMask = KS.clamp01((mountainMask - 0.18) / 0.5);
  const ridge = 1 - Math.abs(this.nMountain.noise2D(x * 0.006, z * 0.006));
  const temp = this.nTemp.fbm2(x * 0.0021 + 31.7, z * 0.0021 - 11.2, 2);
  const moist = this.nMoist.fbm2(x * 0.0024 - 81.3, z * 0.0024 + 55.9, 2);

  let height = SEA + 4 + cont * 14 + hills * 5 + mountainMask * ridge * ridge * 38;
  height = KS.clamp(Math.round(height), 4, WH - 6);

  let biome;
  if (height < SEA - 1) biome = 0;
  else if (height <= SEA + 1) biome = 1;
  else if (mountainMask > 0.45 && height > SEA + 22) biome = 6;
  else if (temp < -0.38) biome = 5;
  else if (temp > 0.4 && moist < 0.05) biome = 4;
  else if (moist > 0.06) biome = 3;
  else biome = 2;
  if (biome === 4 && height > SEA + 1) height = Math.min(height, SEA + 12 + Math.round(hills * 3)); // pustinje ravnije

  h = { h: height, biome, temp, moist };
  this._hCache.set(k, h);
  return h;
};

// boja trave/lišća po biomu (tint za mesher)
World.prototype.grassTint = function (biome, temp) {
  switch (biome) {
    case 4: return [0.75, 0.78, 0.33];
    case 5: return [0.55, 0.73, 0.55];
    case 3: return [0.35, 0.72, 0.23];
    case 6: return [0.47, 0.70, 0.42];
    default: return [0.48, 0.78, 0.30];
  }
};
World.prototype.leafTint = function (biome) {
  switch (biome) {
    case 4: return [0.62, 0.72, 0.30];
    case 5: return [0.45, 0.65, 0.45];
    default: return [0.32, 0.65, 0.18];
  }
};

// ---------- generisanje chunka ----------
World.prototype.ensureChunk = function (cx, cz) {
  const k = cx + ',' + cz;
  let c = this.chunks.get(k);
  if (c) return c;
  c = new Chunk(cx, cz);
  this.chunks.set(k, c);
  return c;
};

World.prototype.generateChunk = function (c) {
  if (c.generated) return;
  // pokušaj učitati spremljeno
  if (this.savedChunkKeys.has(c.cx + ',' + c.cz) && KS.save.loadChunkBlocks(this, c)) {
    c.generated = true;
    c.modified = false;
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) c.recalcHeight(lx, lz);
    return;
  }
  const B = KS.B;
  const x0 = c.cx * 16, z0 = c.cz * 16;
  const rng = KS.mulberry32(KS.hashInts(this.seed, c.cx, c.cz, 99));

  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const info = this.heightInfo(x, z);
      const h = info.h, biome = info.biome;

      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.bedrock;
        else if (y <= 2 && rng() < 0.5) id = B.bedrock;
        else if (y > h - 1) {
          // površina
          if (biome === 0) id = h < SEA - 6 ? B.gravel : B.sand;
          else if (biome === 1 || biome === 4) id = B.sand;
          else if (biome === 5) id = B.snowGrass;
          else if (biome === 6) id = h > SEA + 34 ? B.snowGrass : (h > SEA + 26 ? B.stone : B.grass);
          else id = B.grass;
        } else if (y > h - 4) {
          if (biome === 4 || biome === 1) id = y > h - 3 ? B.sand : B.sandstone;
          else if (biome === 0) id = B.dirt;
          else if (biome === 6 && h > SEA + 26) id = B.stone;
          else id = B.dirt;
        } else id = B.stone;
        c.blocks[(y << 8) | (lz << 4) | lx] = id;
      }
      // voda
      for (let y = h + 1; y <= SEA; y++) {
        c.blocks[(y << 8) | (lz << 4) | lx] = biome === 5 && y === SEA ? B.ice : B.water;
      }
    }
  }

  // pećine
  if (this.type !== 'flat') {
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const info = this.heightInfo(x, z);
      const top = Math.min(info.h - (info.h <= SEA + 1 ? 4 : 1), WH - 1);
      for (let y = 4; y <= top; y++) {
        const a = this.nCaveA.noise3D(x * 0.022, y * 0.045, z * 0.022);
        const b = this.nCaveB.noise3D(x * 0.022, y * 0.045, z * 0.022);
        let carve = (a * a + b * b) < 0.009;
        if (!carve && y < 38) carve = this.nCaveC.noise3D(x * 0.016, y * 0.03, z * 0.016) < -0.66;
        if (carve) {
          const i = (y << 8) | (lz << 4) | lx;
          if (c.blocks[i] !== B.bedrock && c.blocks[i] !== B.water && c.blocks[i] !== B.ice) {
            c.blocks[i] = y <= 10 ? B.lava : 0;
          }
        }
      }
    }
    // rude
    this._genOres(c, rng);
  }

  // strukture (drveće/kaktusi) — i iz susjednih chunkova koje prelaze granicu
  for (let dcx = -1; dcx <= 1; dcx++) for (let dcz = -1; dcz <= 1; dcz++) {
    const feats = this.featuresOf(c.cx + dcx, c.cz + dcz);
    for (const f of feats) this._placeFeature(c, f);
  }

  // cvijeće i trava po površini
  if (this.type !== 'flat') {
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const info = this.heightInfo(x, z);
      if (info.biome !== 2 && info.biome !== 3) continue;
      const surf = c.blocks[(info.h << 8) | (lz << 4) | lx];
      const above = (info.h + 1 < WH) ? c.blocks[((info.h + 1) << 8) | (lz << 4) | lx] : 1;
      if (surf !== B.grass || above !== 0) continue;
      const r = rng();
      let id = 0;
      if (r < 0.07) id = B.tallgrass;
      else if (r < 0.082) id = rng() < 0.5 ? B.flowerRed : B.flowerYellow;
      if (id) c.blocks[((info.h + 1) << 8) | (lz << 4) | lx] = id;
    }
  }

  for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) c.recalcHeight(lx, lz);
  c.generated = true;
  c.fresh = true; // za spawn životinja
};

World.prototype._genOres = function (c, rng) {
  const B = KS.B;
  const tryVein = (oreId, count, minY, maxY, size) => {
    for (let n = 0; n < count; n++) {
      let x = (rng() * 16) | 0, z = (rng() * 16) | 0;
      let y = minY + (rng() * (maxY - minY)) | 0;
      const len = size[0] + (rng() * (size[1] - size[0])) | 0;
      for (let s = 0; s < len; s++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 2 && y < WH) {
          const i = (y << 8) | (z << 4) | x;
          if (c.blocks[i] === B.stone) c.blocks[i] = oreId;
        }
        const d = (rng() * 6) | 0;
        if (d === 0) x++; else if (d === 1) x--;
        else if (d === 2) z++; else if (d === 3) z--;
        else if (d === 4) y++; else y--;
      }
    }
  };
  tryVein(B.coalOre, 13, 8, 70, [5, 10]);
  tryVein(B.ironOre, 9, 6, 46, [4, 8]);
  tryVein(B.goldOre, 4, 5, 26, [3, 6]);
  tryVein(B.diamondOre, 3, 4, 15, [3, 6]);
  tryVein(B.gravel, 4, 10, 50, [6, 12]);
};

// deterministička lista struktura za chunk (drveće, kaktusi)
World.prototype.featuresOf = function (cx, cz) {
  if (this.type === 'flat') return [];
  const key = cx + ',' + cz;
  if (!this._featCache) this._featCache = new Map();
  let list = this._featCache.get(key);
  if (list) return list;
  if (this._featCache.size > 4000) this._featCache.clear();
  list = [];
  const rng = KS.mulberry32(KS.hashInts(this.seed, cx, cz, 7));
  const x0 = cx * 16, z0 = cz * 16;
  // izaberi broj pokušaja prema biomu centra
  const center = this.heightInfo(x0 + 8, z0 + 8);
  let treeTries = 0, cactusTries = 0;
  if (center.biome === 3) treeTries = 7;
  else if (center.biome === 2) treeTries = rng() < 0.25 ? 1 : 0;
  else if (center.biome === 5) treeTries = 3;
  else if (center.biome === 6) treeTries = rng() < 0.4 ? 1 : 0;
  else if (center.biome === 4) cactusTries = 3;

  for (let i = 0; i < treeTries; i++) {
    const x = x0 + 2 + ((rng() * 12) | 0), z = z0 + 2 + ((rng() * 12) | 0);
    const info = this.heightInfo(x, z);
    if (info.h <= SEA + 1) continue;
    const ground = info.biome === 5 || (info.biome === 6 && info.h > SEA + 26) ? 'cold' : 'warm';
    let kind;
    if (ground === 'cold') kind = 'spruce';
    else kind = rng() < 0.14 ? 'birch' : 'oak';
    list.push({ kind, x, z, y: info.h + 1, h: 4 + ((rng() * 3) | 0), r: KS.hashInts(this.seed, x, z, 13) });
  }
  for (let i = 0; i < cactusTries; i++) {
    const x = x0 + 2 + ((rng() * 12) | 0), z = z0 + 2 + ((rng() * 12) | 0);
    const info = this.heightInfo(x, z);
    if (info.biome !== 4 || info.h <= SEA) continue;
    list.push({ kind: 'cactus', x, z, y: info.h + 1, h: 1 + ((rng() * 3) | 0) });
  }
  this._featCache.set(key, list);
  return list;
};

World.prototype._placeFeature = function (c, f) {
  const B = KS.B;
  const x0 = c.cx * 16, z0 = c.cz * 16;
  const put = (x, y, z, id, onlyAir) => {
    const lx = x - x0, lz = z - z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= WH) return;
    const i = (y << 8) | (lz << 4) | lx;
    if (onlyAir && c.blocks[i] !== 0) return;
    c.blocks[i] = id;
  };
  if (f.kind === 'cactus') {
    for (let i = 0; i < f.h; i++) put(f.x, f.y + i, f.z, B.cactus, true);
    return;
  }
  const rng = KS.mulberry32(f.r >>> 0);
  const trunkId = f.kind === 'birch' ? B.logBirch : (f.kind === 'spruce' ? B.logSpruce : B.log);
  const leafId = f.kind === 'spruce' ? B.leavesSpruce : B.leaves;
  const h = f.kind === 'spruce' ? f.h + 2 : f.h;

  if (f.kind === 'spruce') {
    for (let i = 0; i < h; i++) put(f.x, f.y + i, f.z, trunkId);
    let r = 2;
    for (let ly = 2; ly <= h; ly += 1) {
      const rr = ly === h ? 1 : (ly % 2 === 0 ? r : 1);
      for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > rr + (rr > 1 ? 1 : 0)) continue;
        if (dx === 0 && dz === 0 && ly < h) continue;
        put(f.x + dx, f.y + ly, f.z + dz, leafId, true);
      }
    }
    put(f.x, f.y + h, f.z, leafId, true);
    put(f.x, f.y + h + 1, f.z, leafId, true);
  } else {
    for (let i = 0; i < h; i++) put(f.x, f.y + i, f.z, trunkId);
    for (let ly = h - 2; ly <= h + 1; ly++) {
      const rr = ly >= h ? 1 : 2;
      for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
        if (dx === 0 && dz === 0 && ly < h) continue;
        if (Math.abs(dx) === rr && Math.abs(dz) === rr && (ly >= h || rng() < 0.4)) continue;
        put(f.x + dx, f.y + ly, f.z + dz, leafId, true);
      }
    }
  }
};

// pronađi sigurno mjesto za spawn
World.prototype.findSpawn = function () {
  for (let r = 0; r < 24; r++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ang = attempt / 12 * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * r * 8), z = Math.round(Math.sin(ang) * r * 8);
      const info = this.heightInfo(x, z);
      if (info.h > SEA + 1 && info.biome !== 0) {
        return { x: x + 0.5, y: info.h + 3, z: z + 0.5 };
      }
      if (r === 0) break;
    }
  }
  return { x: 0.5, y: this.heightInfo(0, 0).h + 3, z: 0.5 };
};

// svjetlo na poziciji entiteta (za prikaz)
World.prototype.lightAt = function (x, y, z, dayFactor) {
  const sky = this.getSky(Math.floor(x), Math.floor(y), Math.floor(z)) / 15;
  const blk = this.getBlkL(Math.floor(x), Math.floor(y), Math.floor(z)) / 15;
  return Math.max(sky * dayFactor, blk);
};

})();
