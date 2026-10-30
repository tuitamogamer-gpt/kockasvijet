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

// keš zadnjeg chunka — BFS uglavnom ostaje u istom chunku, a Map.get sa string ključem je skup.
// Poništava se na ulazu u svaku javnu funkciju (chunkovi se ne dodaju/brišu tokom jednog poziva).
let cacheW = null, cacheCX = 0, cacheCZ = 0, cacheC = null;
function resetCache () { cacheW = null; cacheC = null; }
function chunkOf (world, x, z) {
  const cx = x >> 4, cz = z >> 4;
  if (world === cacheW && cx === cacheCX && cz === cacheCZ) return cacheC;
  cacheW = world; cacheCX = cx; cacheCZ = cz;
  cacheC = world.chunks.get(cx + ',' + cz) || null;
  return cacheC;
}

// pristup svjetlu preko svijeta (samo generisani chunkovi)
function getL (world, ch, x, y, z) {
  if (y < 0 || y >= WH) return -1;
  const c = chunkOf(world, x, z);
  if (!c || !c.generated) return -1;
  return ch === 0 ? c.skyL[(y << 8) | ((z & 15) << 4) | (x & 15)] : c.blkL[(y << 8) | ((z & 15) << 4) | (x & 15)];
}
function setL (world, ch, x, y, z, v, touched) {
  const c = chunkOf(world, x, z);
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
  const c = chunkOf(world, x, z);
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
      // nebo: kolona ispod ima isti nivo (15, ili konstantan nivo ispod lišća/vode) → zavisi od ove ćelije
      const goesDown = ch === 0 && d === 3 && (old === 15 || cur === old);
      if (cur < old || goesDown) {
        setL(world, ch, nx, ny, nz, 0, touched);
        queue.push(nx, ny, nz, cur);
        // susjedni izvor svjetla (baklja, lava...) ne smije ostati ugašen
        if (ch === 1) {
          const em = emissionOf(blockAt(world, nx, ny, nz));
          if (em > 0) { setL(world, ch, nx, ny, nz, em, touched); reAdd.push(nx, ny, nz, em); }
        }
      } else {
        reAdd.push(nx, ny, nz, cur);
      }
    }
  }
}

// ---------- inicijalno osvjetljenje chunka ----------
// preduslov: teren chunka + svih 8 susjeda generisan
light.lightChunk = function (world, c) {
  resetCache();
  const x0 = c.cx * 16, z0 = c.cz * 16;
  const skyQ = [], blkQ = [];
  const sky = c.skyL, blk = c.blkL;

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
        sky[i] = lvl;
        const em = emissionOf(id);
        if (em > 0) { blk[i] = em; blkQ.push(x0 + lx, y, z0 + lz, em); }
      }
    }
  }
  // BFS izvori: samo ćelije čije svjetlo može nešto promijeniti — rubne, ili one kojima je
  // vodoravni susjed tamniji za više od 1 (ivice terena, ulazi u pećine, sjena drveća).
  // Kolona sama po sebi je već tačna, pa sjeme za otvoreno nebo nije potrebno (ogromna ušteda).
  for (let y = 0; y < WH; y++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const i = (y << 8) | (lz << 4) | lx;
        const l = sky[i];
        if (l <= 1) continue;
        const t = l - 1;
        if (lx === 0 || lx === 15 || lz === 0 || lz === 15 ||
            sky[i - 1] < t || sky[i + 1] < t || sky[i - 16] < t || sky[i + 16] < t) {
          skyQ.push(x0 + lx, y, z0 + lz, l);
        }
      }
    }
  }

  // 2) uvuci svjetlo sa granica susjeda koji su već osvijetljeni (samo gdje je susjed svjetliji)
  const pullEdge = (n, nlx, nlz, lx, lz) => {
    const nx = n.cx * 16 + nlx, nz = n.cz * 16 + nlz;
    for (let y = 0; y < WH; y++) {
      const ni = (y << 8) | (nlz << 4) | nlx, i = (y << 8) | (lz << 4) | lx;
      const s = n.skyL[ni];
      if (s > 1 && s - 1 > sky[i]) skyQ.push(nx, y, nz, s);
      const b = n.blkL[ni];
      if (b > 1 && b - 1 > blk[i]) blkQ.push(nx, y, nz, b);
    }
  };
  const nW = world.chunkAt(c.cx - 1, c.cz), nE = world.chunkAt(c.cx + 1, c.cz);
  const nN = world.chunkAt(c.cx, c.cz - 1), nS = world.chunkAt(c.cx, c.cz + 1);
  for (let k = 0; k < 16; k++) {
    if (nW && nW.lit) pullEdge(nW, 15, k, 0, k);
    if (nE && nE.lit) pullEdge(nE, 0, k, 15, k);
    if (nN && nN.lit) pullEdge(nN, k, 15, k, 0);
    if (nS && nS.lit) pullEdge(nS, k, 0, k, 15);
  }

  const touched = new Set();
  propagate(world, 0, skyQ, touched);
  propagate(world, 1, blkQ, touched);
  c.lit = true;
  // remesh pogođenih već meshanih chunkova
  for (const t of touched) if (t !== c && t.meshed) { t.dirty = true; world.dirtyMesh.add(t); }
};

// ---------- inkrementalna izmjena bloka ----------
light.onBlockChanged = function (world, x, y, z, oldId, newId) {
  resetCache();
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
