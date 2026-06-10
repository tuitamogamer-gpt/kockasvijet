// ===== KockaSvijet — mesher: chunk → geometrija (culled faces + AO + smooth light) =====
(function () {

const WH = KS.WH;

// 6 strana: normala, 4 ugla (CCW gledano izvana), tangente za AO
// ugao = [x,y,z] pomak od (0,0,0) bloka
const FACES = [
  { // +X (istok)
    n: [1, 0, 0], shade: 0.62,
    c: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
    u: [0,0,-1], v: [0,1,0],
  },
  { // -X (zapad)
    n: [-1, 0, 0], shade: 0.62,
    c: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    u: [0,0,1], v: [0,1,0],
  },
  { // +Y (gore)
    n: [0, 1, 0], shade: 1.0,
    c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]],
    u: [1,0,0], v: [0,0,-1],
  },
  { // -Y (dolje)
    n: [0, -1, 0], shade: 0.5,
    c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
    u: [1,0,0], v: [0,0,1],
  },
  { // +Z (jug)
    n: [0, 0, 1], shade: 0.8,
    c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    u: [1,0,0], v: [0,1,0],
  },
  { // -Z (sjever)
    n: [0, 0, -1], shade: 0.8,
    c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
    u: [-1,0,0], v: [0,1,0],
  },
];
// UV uglovi za quad (poklapaju se s redoslijedom c): (0,0),(1,0),(1,1),(0,1) → u tile prostoru
const UVC = [[0,1],[1,1],[1,0],[0,0]];

// rastući buffer
function Builder () {
  this.cap = 16384;
  this.data = new ArrayBuffer(this.cap * 16);
  this.u8 = new Uint8Array(this.data);
  this.u16 = new Uint16Array(this.data);
  this.verts = 0;
  this.idx = [];
}
Builder.prototype.ensure = function (n) {
  if (this.verts + n <= this.cap) return;
  while (this.cap < this.verts + n) this.cap *= 2;
  const nd = new ArrayBuffer(this.cap * 16);
  new Uint8Array(nd).set(this.u8.subarray(0, this.verts * 16));
  this.data = nd; this.u8 = new Uint8Array(nd); this.u16 = new Uint16Array(nd);
};
// pos: blok-lokalno ×256; uv: atlas-norm ×4096 (tj. piksel ×16); light sky/blk 0-15; shade 0-255; tint rgb 0-255
Builder.prototype.vert = function (x, y, z, u, v, sky, blk, shadeB, tr, tg, tb) {
  this.ensure(1);
  const o16 = this.verts * 8, o8 = this.verts * 16;
  this.u16[o16] = x; this.u16[o16 + 1] = y; this.u16[o16 + 2] = z;
  this.u16[o16 + 3] = u; this.u16[o16 + 4] = v;
  this.u8[o8 + 10] = (sky << 4) | blk;
  this.u8[o8 + 11] = shadeB;
  this.u8[o8 + 12] = tr; this.u8[o8 + 13] = tg; this.u8[o8 + 14] = tb;
  return this.verts++;
};
Builder.prototype.quad = function (a, b, c, d, flip) {
  if (flip) this.idx.push(a, b, d, b, c, d);
  else this.idx.push(a, b, c, a, c, d);
};
Builder.prototype.result = function () {
  if (!this.verts) return null;
  return {
    verts: this.u8.slice(0, this.verts * 16),
    idx: new Uint32Array(this.idx),
    count: this.idx.length,
  };
};

const opaqueB = new Builder(), waterB = new Builder();

KS.meshChunk = function (world, chunk, smoothLight) {
  // reset buildera
  opaqueB.verts = 0; opaqueB.idx.length = 0;
  waterB.verts = 0; waterB.idx.length = 0;
  const B = KS.B, blocks = KS.blocks;
  const x0 = chunk.cx * 16, z0 = chunk.cz * 16;

  // brzi pristup susjedstvu (3×3 chunka)
  const neigh = {};
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    neigh[(dx + 1) * 3 + (dz + 1)] = world.chunkAt(chunk.cx + dx, chunk.cz + dz);
  }
  function blockAt (x, y, z) { // x,z su svjetske koordinate
    if (y < 0 || y >= WH) return 0;
    const c = neigh[((x >> 4) - chunk.cx + 1) * 3 + ((z >> 4) - chunk.cz + 1)];
    if (!c || !c.generated) return 0;
    return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  function lightAt (x, y, z) { // [sky, blk]
    if (y >= WH) return [15, 0];
    if (y < 0) return [0, 0];
    const c = neigh[((x >> 4) - chunk.cx + 1) * 3 + ((z >> 4) - chunk.cz + 1)];
    if (!c || !c.generated) return [15, 0];
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    return [c.skyL[i], c.blkL[i]];
  }
  function opaqueAt (x, y, z) {
    const id = blockAt(x, y, z);
    return id !== 0 && blocks[id].opaque;
  }

  const tintGrassCache = {}, tintLeafCache = {};
  function tints (x, z) {
    const k = x + ',' + z;
    let t = tintGrassCache[k];
    if (!t) {
      const info = world.heightInfo(x, z);
      t = { g: world.grassTint(info.biome, info.temp), l: world.leafTint(info.biome) };
      tintGrassCache[k] = t;
    }
    return t;
  }

  for (let y = 0; y < WH; y++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const id = chunk.blocks[(y << 8) | (lz << 4) | lx];
        if (!id) continue;
        const def = blocks[id];
        const wx = x0 + lx, wz = z0 + lz;

        // ---------- cross (cvijeće, baklje, trava) ----------
        if (def.cross) {
          const [sky, blk] = lightAt(wx, y, wz);
          const tile = def.tex.side;
          const [tu, tv] = KS.atlas.uv(tile);
          let tint = [255, 255, 255];
          if (def.tint === 1) { const t = tints(wx, wz).g; tint = [t[0] * 255, t[1] * 255, t[2] * 255]; }
          const sB = 230;
          const px = lx * 256, py = y * 256, pz = lz * 256;
          const u0 = tu * 16 + 1, u1 = (tu + 16) * 16 - 1, v0 = tv * 16 + 1, v1 = (tv + 16) * 16 - 1;
          const Q = 36; // uvlačenje dijagonale (256 * 0.146)
          const diag = [
            [[Q, 0, Q], [256 - Q, 0, 256 - Q], [256 - Q, 256, 256 - Q], [Q, 256, Q]],
            [[Q, 0, 256 - Q], [256 - Q, 0, Q], [256 - Q, 256, Q], [Q, 256, 256 - Q]],
          ];
          for (const quad of diag) {
            for (let side = 0; side < 2; side++) {
              const vs = [];
              for (let i = 0; i < 4; i++) {
                const p = quad[side ? 3 - i : i];
                const uvi = UVC[i];
                vs.push(opaqueB.vert(px + p[0], py + p[1], pz + p[2],
                  side ? (uvi[0] ? u0 : u1) : (uvi[0] ? u1 : u0), uvi[1] ? v1 : v0,
                  sky, blk, sB, tint[0], tint[1], tint[2]));
              }
              opaqueB.quad(vs[0], vs[1], vs[2], vs[3], false);
            }
          }
          continue;
        }

        const isWater = def.liquid && id === B.water;
        const isLava = def.liquid && !isWater;
        const builder = isWater ? waterB : opaqueB;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.n[0], ny = y + face.n[1], nz = wz + face.n[2];
          const nid = blockAt(nx, ny, nz);
          const ndef = nid ? blocks[nid] : null;

          // pravila vidljivosti lica
          if (def.liquid) {
            if (nid === id) continue;             // voda-voda
            if (ndef && ndef.opaque) continue;
            if (ny >= WH && f !== 2) continue;
          } else {
            if (ndef && ndef.opaque) continue;
            if (nid === id && (def.cutout || def.liquid)) continue; // staklo-staklo, lišće-lišće
            if (!ndef && nid !== 0) continue;
          }
          if (!def.liquid && ndef && ndef.liquid && f !== 2 && false) continue;

          // tekstura lica
          let tile;
          if (f === 2) tile = def.tex.top;
          else if (f === 3) tile = def.tex.bot;
          else if (def.tex.front !== undefined && (f === 4 || f === 5 || f === 0 || f === 1) && def.tex.front !== def.tex.side) {
            tile = (f === 5 || f === 0) ? def.tex.front : def.tex.side; // "lice" na sjever i istok
          } else tile = def.tex.side;
          const [tu, tv] = KS.atlas.uv(tile);

          // tinta
          let tr = 255, tg = 255, tb = 255;
          if (def.tint === 2) { const t = tints(wx, wz).l; tr = t[0] * 255; tg = t[1] * 255; tb = t[2] * 255; }
          else if (def.tintTop && f === 2) { const t = tints(wx, wz).g; tr = t[0] * 255; tg = t[1] * 255; tb = t[2] * 255; }
          else if (def.tint === 1) { const t = tints(wx, wz).g; tr = t[0] * 255; tg = t[1] * 255; tb = t[2] * 255; }

          // visina vode
          let hTop = 256;
          if (isWater && blockAt(wx, y + 1, wz) !== id) hTop = 224;

          // AO + smooth light po uglu
          const aoVals = [0, 0, 0, 0];
          const skyVals = [0, 0, 0, 0], blkVals = [0, 0, 0, 0];
          for (let ci = 0; ci < 4; ci++) {
            const corner = face.c[ci];
            // predznaci tangenti za ovaj ugao
            const su = (corner[0] * face.u[0] + corner[1] * face.u[1] + corner[2] * face.u[2]) ? 1 : -1;
            const sv = (corner[0] * face.v[0] + corner[1] * face.v[1] + corner[2] * face.v[2]) ? 1 : -1;
            const bx = nx, by = ny, bz = nz; // ćelija ispred lica
            const u1x = bx + face.u[0] * su, u1y = by + face.u[1] * su, u1z = bz + face.u[2] * su;
            const v1x = bx + face.v[0] * sv, v1y = by + face.v[1] * sv, v1z = bz + face.v[2] * sv;
            const cxx = bx + face.u[0] * su + face.v[0] * sv,
                  cyy = by + face.u[1] * su + face.v[1] * sv,
                  czz = bz + face.u[2] * su + face.v[2] * sv;
            let s1 = 0, s2 = 0, co = 0;
            if (!def.liquid) {
              s1 = opaqueAt(u1x, u1y, u1z) ? 1 : 0;
              s2 = opaqueAt(v1x, v1y, v1z) ? 1 : 0;
              co = opaqueAt(cxx, cyy, czz) ? 1 : 0;
            }
            aoVals[ci] = (s1 && s2) ? 0 : 3 - (s1 + s2 + co);

            if (smoothLight && !def.liquid) {
              let sSum = 0, bSum = 0, n = 0;
              const cells = [[bx, by, bz], [u1x, u1y, u1z], [v1x, v1y, v1z], [cxx, cyy, czz]];
              for (let k = 0; k < 4; k++) {
                if (k === 3 && s1 && s2) continue;
                const cc = cells[k];
                if (opaqueAt(cc[0], cc[1], cc[2])) continue;
                const L = lightAt(cc[0], cc[1], cc[2]);
                sSum += L[0]; bSum += L[1]; n++;
              }
              if (!n) { const L = lightAt(bx, by, bz); skyVals[ci] = L[0]; blkVals[ci] = L[1]; }
              else { skyVals[ci] = sSum / n; blkVals[ci] = bSum / n; }
            } else {
              const L = lightAt(bx, by, bz);
              skyVals[ci] = L[0]; blkVals[ci] = L[1];
            }
          }

          // emisivni blokovi: pune svjetline
          let selfLit = def.light > 0;

          const vs = [];
          for (let ci = 0; ci < 4; ci++) {
            const corner = face.c[ci];
            const aoF = [0.42, 0.62, 0.82, 1.0][aoVals[ci]];
            const shadeB = Math.round(face.shade * (smoothLight ? aoF : 1) * 255);
            const uvi = UVC[ci];
            // uv s malim uvlačenjem protiv curenja
            const u = (tu + (uvi[0] ? 15.94 : 0.06)) * 16;
            const v = (tv + (uvi[1] ? 15.94 : 0.06)) * 16;
            let yy = corner[1] * 256;
            if (yy === 256 && hTop !== 256) yy = hTop;
            const sky = selfLit ? 15 : Math.round(skyVals[ci]);
            const blk = selfLit ? 15 : Math.round(blkVals[ci]);
            vs.push(builder.vert(
              lx * 256 + corner[0] * 256, y * 256 + yy, lz * 256 + corner[2] * 256,
              u, v, KS.clamp(sky, 0, 15), KS.clamp(blk, 0, 15), shadeB, tr, tg, tb));
          }
          const flip = (aoVals[0] + aoVals[2]) < (aoVals[1] + aoVals[3]);
          builder.quad(vs[0], vs[1], vs[2], vs[3], flip);

          if (isLava) {} // lava ide u opaque pass (neprozirnа tekstura)
        }
      }
    }
  }

  return { opaque: opaqueB.result(), water: waterB.result() };
};

})();
