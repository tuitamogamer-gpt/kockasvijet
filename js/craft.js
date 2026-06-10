// ===== KockaSvijet — izrada (crafting) i peć =====
(function () {

// recepti se definišu nakon učitavanja blocks.js (B i I postoje)
const B = KS.B, I = KS.I;

// shaped recept: pattern = niz redova sa ključevima, keys = {simbol: id}, out = {id, n}
// shapeless: ing = [id, id...]
KS.recipes = [];

function shaped (pattern, keys, outId, outN) {
  // normalizuj u 2D matricu id-eva
  const grid = pattern.map(row => [...row].map(ch => ch === ' ' ? 0 : keys[ch]));
  KS.recipes.push({ type: 'shaped', grid, w: grid[0].length, h: grid.length, out: { id: outId, n: outN || 1 } });
}
function shapeless (ing, outId, outN) {
  KS.recipes.push({ type: 'shapeless', ing, out: { id: outId, n: outN || 1 } });
}

// — osnovni —
shapeless([B.log], B.planks, 4);
shapeless([B.logBirch], B.planksBirch, 4);
shapeless([B.logSpruce], B.planks, 4);
shaped(['P', 'P'], { P: B.planks }, I.stick, 4);
shaped(['PP', 'PP'], { P: B.planks }, B.craftTable, 1);
shaped(['CCC', 'C C', 'CCC'], { C: B.cobble }, B.furnace, 1);
shaped(['PPP', 'P P', 'PPP'], { P: B.planks }, B.chest, 1);
shaped(['C', 'S'], { C: I.coal, S: I.stick }, B.torch, 4);
shaped(['SS', 'SS'], { S: B.stone }, B.stoneBrick, 4);
shaped(['PP', 'PP'], { P: B.planksBirch }, B.craftTable, 1);
shaped(['SCS', 'CSC', 'SCS'], { S: B.sand, C: I.coal }, B.tnt, 1);
shaped(['GGG', 'G G', 'GGG'], { G: B.glass }, B.glowstone, 1);
shaped(['PSP', 'PSP'], { P: B.planks, S: I.stick }, B.bookshelf, 1);

// — alati (M = materijal, S = štap) —
const toolMats = [
  ['Wood', B.planks], ['Stone', B.cobble], ['Iron', I.ironIngot], ['Gold', I.goldIngot], ['Diamond', I.diamond],
];
for (const [tier, mat] of toolMats) {
  shaped(['M', 'M', 'S'], { M: mat, S: I.stick }, I['sword' + tier], 1);
  shaped(['MMM', ' S ', ' S '], { M: mat, S: I.stick }, I['pick' + tier], 1);
  shaped(['MM', 'MS', ' S'], { M: mat, S: I.stick }, I['axe' + tier], 1);
  shaped(['M', 'S', 'S'], { M: mat, S: I.stick }, I['shovel' + tier], 1);
}
// blokovi dragocjenosti
shaped(['III', 'III', 'III'], { I: I.ironIngot }, B.ironBlock, 1);
shaped(['III', 'III', 'III'], { I: I.goldIngot }, B.goldBlock, 1);
shaped(['III', 'III', 'III'], { I: I.diamond }, B.diamondBlock, 1);
shapeless([B.ironBlock], I.ironIngot, 9);
shapeless([B.goldBlock], I.goldIngot, 9);
shapeless([B.diamondBlock], I.diamond, 9);

// pronađi recept za grid (niz id-eva veličine n×n; 0 = prazno)
KS.matchCraft = function (gridIds, gw) {
  // bounding box unosa
  let minX = gw, minY = gw, maxX = -1, maxY = -1, count = 0;
  const ids = [];
  for (let y = 0; y < gw; y++) for (let x = 0; x < gw; x++) {
    const id = gridIds[y * gw + x];
    if (id) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      count++; ids.push(id);
    }
  }
  if (count === 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  for (const r of KS.recipes) {
    if (r.type === 'shapeless') {
      if (r.ing.length !== count) continue;
      const need = [...r.ing];
      let ok = true;
      for (const id of ids) {
        const i = need.indexOf(id);
        if (i === -1) { ok = false; break; }
        need.splice(i, 1);
      }
      if (ok && need.length === 0) return r;
    } else {
      if (r.w !== bw || r.h !== bh) continue;
      let ok = true, okM = true;
      for (let y = 0; y < bh && (ok || okM); y++) for (let x = 0; x < bw && (ok || okM); x++) {
        const have = gridIds[(minY + y) * gw + (minX + x)];
        if (r.grid[y][x] !== have) ok = false;
        if (r.grid[y][bw - 1 - x] !== have) okM = false; // ogledalo
      }
      if (ok || okM) return r;
    }
  }
  return null;
};

// ---------- topljenje ----------
KS.smeltResult = function (id) {
  const def = KS.defOf(id);
  if (!def || !def.smeltsTo) return null;
  const outKey = def.smeltsTo;
  const outId = KS.I[outKey] !== undefined ? KS.I[outKey] : KS.B[outKey];
  return outId || null;
};
KS.fuelValue = function (id) {
  const def = KS.defOf(id);
  return def && def.fuel ? def.fuel : 0; // u sekundama gorenja
};
KS.SMELT_TIME = 10;

// block entitet peći: {type:'furnace', in:{id,n}|null, fuel:{..}, out:{..}, burn:0, burnMax:0, progress:0}
KS.tickFurnace = function (world, key, fe, dt) {
  const [x, y, z] = key.split(',').map(Number);
  let changed = false;
  const canSmelt = () => {
    if (!fe.in) return false;
    const res = KS.smeltResult(fe.in.id);
    if (!res) return false;
    if (!fe.out) return true;
    return fe.out.id === res && fe.out.n < KS.maxStackOf(res);
  };

  if (fe.burn > 0) {
    fe.burn -= dt;
    if (canSmelt()) {
      fe.progress += dt;
      if (fe.progress >= KS.SMELT_TIME) {
        fe.progress = 0;
        const res = KS.smeltResult(fe.in.id);
        if (!fe.out) fe.out = { id: res, n: 1 };
        else fe.out.n++;
        fe.in.n--;
        if (fe.in.n <= 0) fe.in = null;
        changed = true;
        KS.snd.play('furnace', { pos: { x: x + 0.5, y, z: z + 0.5 }, vol: 0.6 });
      }
    } else {
      fe.progress = Math.max(0, fe.progress - dt * 2);
    }
  } else {
    // probaj zapaliti novo gorivo
    if (canSmelt() && fe.fuel && KS.fuelValue(fe.fuel.id) > 0) {
      fe.burnMax = KS.fuelValue(fe.fuel.id);
      fe.burn = fe.burnMax;
      fe.fuel.n--;
      if (fe.fuel.n <= 0) fe.fuel = null;
      changed = true;
    } else {
      fe.progress = Math.max(0, fe.progress - dt * 2);
    }
  }

  // upali/ugasi blok
  const id = world.getBlock(x, y, z);
  if (fe.burn > 0 && id === KS.B.furnace) world.setBlock(x, y, z, KS.B.furnaceLit, { noSave: false });
  else if (fe.burn <= 0 && id === KS.B.furnaceLit) world.setBlock(x, y, z, KS.B.furnace, { noSave: false });
  return changed;
};

})();
