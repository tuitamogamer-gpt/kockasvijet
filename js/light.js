// ===== KockaSvijet — svjetlosni engine (sky + block kanal, BFS) =====
(function () {

const WH = KS.WH;
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// koliko blok guši svjetlo (0 = prozirno, 15 = potpuno)
function opacityOf (id) {
  if (!id) return 0;
  const b = KS.blocks[id];
  if (b.opaque) return 15;
  return b.opacity || 0;
}
function emissionOf (id) {
  if (!id) return 0;
  return KS.blocks[id].light || 0;
}

const light = KS.light = {};

// pristup svjetlu preko svijeta (samo generisani chunkovi)
function getL (world, ch, x, y, z) {
  if (y < 0 || y >= WH) return -1;
  const c = world.chunks.get((x >> 4) + ',' + (z >> 4));
  if (!c || !c.generated) return -1;
  return ch === 0 ? c.skyL[(y << 8) | ((z & 15) << 4) | (x & 15)] : c.blkL[(y << 8) | ((z & 15) << 4) | (x & 15)];
}
function setL (world, ch, x, y, z, v, touched) {
  const c = world.chunks.get((x >> 4) + ',' + (z >> 4));
  if (!c || !c.generated) return;
  const i = (y << 8) | ((z & 15) << 4) | (x & 15);
  if (ch === 0) c.skyL[i] = v; else c.blkL[i] = v;
  if (touched) {
    touched.add(c);
    // granice → remesh susjeda
    const lx = x & 15, lz = z & 15;
    if (lx === 0) { const n = world.chunks.get(((x >> 4) - 1) + ',' + (z >> 4)); if (n) touched.add(n); }
    if (lx === 15) { const n = world.chunks.get(((x >> 4) + 1) + ',' + (z >> 4)); if (n) touched.add(n); }
    if (lz === 0) { const n = world.chunks.get((x >> 4) + ',' + ((z >> 4) - 1)); if (n) touched.add(n); }
    if (lz === 15) { const n = world.chunks.get((x >> 4) + ',' + ((z >> 4) + 1)); if (n) touched.add(n); }
  }
}
function blockAt (world, x, y, z) {
  if (y < 0 || y >= WH) return 0;
  const c = world.chunks.get((x >> 4) + ',' + (z >> 4));
  if (!c || !c.generated) return 255; // nepoznato → ne širi se
  return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
}

// BFS širenje iz reda [x,y,z,level]
function propagate (world, ch, queue, touched) {
  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi], y = queue[qi + 1], z = queue[qi + 2], lvl = queue[qi + 3];
    qi += 4;
    if (lvl <= 1) continue;
    for (let d = 0; d < 6; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
      const nb = blockAt(world, nx, ny, nz);
      if (nb === 255) continue;
      const op = opacityOf(nb);
      if (op >= 15) continue;
      // sunčevo svjetlo punog intenziteta ide prema dolje bez slabljenja
      let nl;
      if (ch === 0 && d === 3 && lvl === 15 && op === 0) nl = 15;
      else nl = lvl - 1 - op;
      if (nl <= 0) continue;
      const cur = getL(world, ch, nx, ny, nz);
      if (cur === -1 || cur >= nl) continue;
      setL(world, ch, nx, ny, nz, nl, touched);
      queue.push(nx, ny, nz, nl);
    }
  }
}

// BFS uklanjanje: [x,y,z,staraVrijednost]; reAdd dobija granične izvore
function unpropagate (world, ch, queue, reAdd, touched) {
  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi], y = queue[qi + 1], z = queue[qi + 2], old = queue[qi + 3];
    qi += 4;
    for (let d = 0; d < 6; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
      const cur = getL(world, ch, nx, ny, nz);
      if (cur <= 0) continue;
      const goesDown = ch === 0 && d === 3 && old === 15;
      if (cur < old || goesDown) {
        setL(world, ch, nx, ny, nz, 0, touched);
        queue.push(nx, ny, nz, cur);
      } else {
        reAdd.push(nx, ny, nz, cur);
      }
    }
  }
}

// ---------- inicijalno osvjetljenje chunka ----------
// preduslov: teren chunka + svih 8 susjeda generisan
light.lightChunk = function (world, c) {
  const x0 = c.cx * 16, z0 = c.cz * 16;
  const skyQ = [], blkQ = [];

  // 1) sunčeve kolone
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      let lvl = 15;
      for (let y = WH - 1; y >= 0; y--) {
        const i = (y << 8) | (lz << 4) | lx;
        const id = c.blocks[i];
        const op = opacityOf(id);
        if (op >= 15) lvl = 0;
        else if (op > 0) lvl = Math.max(0, lvl - op);
        c.skyL[i] = lvl;
        if (lvl > 1) skyQ.push(x0 + lx, y, z0 + lz, lvl);
        const em = emissionOf(id);
        if (em > 0) { c.blkL[i] = em; blkQ.push(x0 + lx, y, z0 + lz, em); }
        if (lvl === 0 && y < 14 && em === 0) {
          // ispod čvrste mase nema više šta — ali nastavljamo zbog pećina/emisije
        }
      }
    }
  }

  // 2) uvuci svjetlo sa granica susjeda koji su već osvijetljeni
  const pull = (nx, nz, edgeFn) => {
    const n = world.chunkAt(nx, nz);
    if (!n || !n.lit) return;
    edgeFn(n);
  };
  const pushEdge = (x, y, z) => {
    const s = getL(world, 0, x, y, z);
    if (s > 1) skyQ.push(x, y, z, s);
    const b = getL(world, 1, x, y, z);
    if (b > 1) blkQ.push(x, y, z, b);
  };
  pull(c.cx - 1, c.cz, () => { for (let y = 0; y < WH; y++) for (let lz = 0; lz < 16; lz++) pushEdge(x0 - 1, y, z0 + lz); });
  pull(c.cx + 1, c.cz, () => { for (let y = 0; y < WH; y++) for (let lz = 0; lz < 16; lz++) pushEdge(x0 + 16, y, z0 + lz); });
  pull(c.cx, c.cz - 1, () => { for (let y = 0; y < WH; y++) for (let lx = 0; lx < 16; lx++) pushEdge(x0 + lx, y, z0 - 1); });
  pull(c.cx, c.cz + 1, () => { for (let y = 0; y < WH; y++) for (let lx = 0; lx < 16; lx++) pushEdge(x0 + lx, y, z0 + 1); });

  const touched = new Set();
  propagate(world, 0, skyQ, touched);
  propagate(world, 1, blkQ, touched);
  c.lit = true;
  // remesh pogođenih već meshanih chunkova
  for (const t of touched) if (t !== c && t.meshed) { t.dirty = true; world.dirtyMesh.add(t); }
};

// ---------- inkrementalna izmjena bloka ----------
light.onBlockChanged = function (world, x, y, z, oldId, newId) {
  const touched = new Set();
  const oldOp = opacityOf(oldId), newOp = opacityOf(newId);
  const oldEm = emissionOf(oldId), newEm = emissionOf(newId);

  // --- block-light kanal ---
  if (oldEm > 0) {
    const q = [x, y, z, getL(world, 1, x, y, z)];
    setL(world, 1, x, y, z, 0, touched);
    const reAdd = [];
    unpropagate(world, 1, q, reAdd, touched);
    propagate(world, 1, reAdd, touched);
  }
  if (newOp > oldOp) {
    // blok sad guši — ukloni svjetlo koje je prolazilo
    const cur = getL(world, 1, x, y, z);
    if (cur > 0 && newEm === 0) {
      const q = [x, y, z, cur];
      setL(world, 1, x, y, z, 0, touched);
      const reAdd = [];
      unpropagate(world, 1, q, reAdd, touched);
      propagate(world, 1, reAdd, touched);
    }
  }
  if (newEm > 0) {
    setL(world, 1, x, y, z, newEm, touched);
    propagate(world, 1, [x, y, z, newEm], touched);
  }
  if (newOp < oldOp) {
    // propusniji blok → svjetlo ulazi od susjeda
    const q = [];
    for (let d = 0; d < 6; d++) {
      const l = getL(world, 1, x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
      if (l > 1) q.push(x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2], l);
    }
    propagate(world, 1, q, touched);
  }

  // --- sky kanal ---
  if (newOp > oldOp) {
    const cur = getL(world, 0, x, y, z);
    const q = [x, y, z, cur];
    setL(world, 0, x, y, z, Math.max(0, 15 - newOp) === 15 ? cur : 0, touched);
    setL(world, 0, x, y, z, 0, touched);
    const reAdd = [];
    unpropagate(world, 0, q, reAdd, touched);
    propagate(world, 0, reAdd, touched);
  } else if (newOp < oldOp) {
    // otvorio se prostor: ako je iznad nebo, spusti kolonu 15
    const q = [];
    let aboveSky = y + 1 >= WH ? 15 : getL(world, 0, x, y + 1, z);
    if (aboveSky === 15) {
      let yy = y;
      while (yy >= 0) {
        const id = blockAt(world, x, yy, z);
        const op = opacityOf(id);
        if (op >= 15 || id === 255) break;
        const v = Math.max(0, 15 - op);
        if (v < 15) {
          if (v > 0) { setL(world, 0, x, yy, z, v, touched); q.push(x, yy, z, v); }
          break;
        }
        setL(world, 0, x, yy, z, 15, touched);
        q.push(x, yy, z, 15);
        yy--;
      }
    }
    for (let d = 0; d < 6; d++) {
      const l = getL(world, 0, x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
      if (l > 1) q.push(x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2], l);
    }
    propagate(world, 0, q, touched);
  }

  for (const t of touched) if (t.meshed) { t.dirty = true; world.dirtyMesh.add(t); }
};

})();
