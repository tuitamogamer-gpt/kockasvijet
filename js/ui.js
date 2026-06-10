// ===== KockaSvijet — UI: meniji, HUD, inventar, kontejneri =====
(function () {

const $ = id => document.getElementById(id);

const ui = KS.ui = {
  screen: null,
  cursor: null,        // stack u ruci miša
  openType: null,      // 'inv'|'table'|'furnace'|'chest'|'creative'
  craftGrid: null,
  craftSize: 0,
  furnaceKey: null,
  chestKey: null,
  _slotEls: [],
  _heldNameT: 0,
};

// ---------- ekrani ----------
ui.showScreen = function (name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('visible'));
  ui.screen = name;
  if (name) {
    const el = $('screen-' + name);
    if (el) el.classList.add('visible');
  }
};

// ---------- toast ----------
ui.toast = function (msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toast-wrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2200);
  setTimeout(() => el.remove(), 2700);
};

// ---------- HUD ikone ----------
function mkIcon (painter) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 9;
  painter(cv.getContext('2d'));
  return cv.toDataURL();
}
const heartPts = [[1,1],[2,0],[3,1],[4,2],[5,1],[6,0],[7,1],[8,2],[8,3],[7,4],[6,5],[5,6],[4,7],[3,6],[2,5],[1,4],[0,3],[0,2]];
function paintHeart (c, fill, half) {
  c.fillStyle = '#2c0000';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    // oblik srca maskom
    const inHeart = (yy, xx) => {
      if (yy === 1 && (xx >= 1 && xx <= 3 || xx >= 5 && xx <= 7)) return true;
      if (yy === 2 && xx >= 0 && xx <= 8) return true;
      if (yy === 3 && xx >= 0 && xx <= 8) return true;
      if (yy === 4 && xx >= 1 && xx <= 7) return true;
      if (yy === 5 && xx >= 2 && xx <= 6) return true;
      if (yy === 6 && xx >= 3 && xx <= 5) return true;
      if (yy === 7 && xx === 4) return true;
      return false;
    };
    if (inHeart(y, x)) {
      let col = fill;
      if (half && x > 4) col = '#3a3a3a';
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.55)';
  if (fill !== '#3a3a3a') c.fillRect(2, 2, 1, 1);
}
function paintFood (c, fill, half) {
  // batak
  c.fillStyle = half ? '#3a3a3a' : fill;
  c.fillRect(3, 1, 4, 4); c.fillRect(2, 2, 6, 3); c.fillRect(4, 5, 2, 1);
  c.fillStyle = fill === '#3a3a3a' ? '#3a3a3a' : '#e8d8b0';
  if (!half) { c.fillRect(2, 5, 1, 1); }
  c.fillStyle = '#d8c8a0';
  c.fillRect(5, 5, 2, 2); c.fillRect(6, 6, 2, 2);
  if (half) { c.fillStyle = '#3a3a3a'; c.fillRect(0, 0, 4, 9); }
}
function paintBubble (c, empty) {
  c.fillStyle = empty ? '#3a4a5a' : '#6fa8ff';
  c.fillRect(2, 1, 5, 2); c.fillRect(1, 2, 7, 4); c.fillRect(2, 6, 5, 2);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  if (!empty) c.fillRect(3, 2, 2, 1);
}
const ICONS = {
  heartFull: mkIcon(c => paintHeart(c, '#e02020')),
  heartHalf: mkIcon(c => paintHeart(c, '#e02020', true)),
  heartEmpty: mkIcon(c => paintHeart(c, '#3a3a3a')),
  foodFull: mkIcon(c => paintFood(c, '#b5764a')),
  foodHalf: mkIcon(c => paintFood(c, '#b5764a', true)),
  foodEmpty: mkIcon(c => paintFood(c, '#3a3a3a')),
  bubble: mkIcon(c => paintBubble(c, false)),
  bubbleEmpty: mkIcon(c => paintBubble(c, true)),
};

// ---------- HUD ----------
ui.initHUD = function () {
  const hb = $('hotbar');
  hb.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const d = document.createElement('div');
    d.className = 'hb-slot';
    d.innerHTML = '<img style="display:none"><span class="slot-count"></span><div class="dur-bar" style="display:none"><div></div></div>';
    hb.appendChild(d);
  }
  for (const barId of ['hearts', 'hunger', 'bubbles']) {
    const bar = $(barId);
    bar.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const img = document.createElement('img');
      bar.appendChild(img);
    }
  }
};

ui.updateHUD = function (game) {
  const p = game.player;
  const creative = game.world.mode === 'creative';
  // hotbar
  const slots = $('hotbar').children;
  for (let i = 0; i < 9; i++) {
    const el = slots[i];
    el.classList.toggle('sel', i === p.sel);
    ui.fillSlotEl(el, p.inv[i]);
  }
  // srca/glad
  $('stats-row').style.display = creative ? 'none' : 'flex';
  if (!creative) {
    const hearts = $('hearts').children;
    for (let i = 0; i < 10; i++) {
      const v = p.hp - i * 2;
      hearts[i].src = v >= 2 ? ICONS.heartFull : (v >= 1 ? ICONS.heartHalf : ICONS.heartEmpty);
    }
    const food = $('hunger').children;
    for (let i = 0; i < 10; i++) {
      const v = p.food - i * 2;
      food[i].src = v >= 2 ? ICONS.foodFull : (v >= 1 ? ICONS.foodHalf : ICONS.foodEmpty);
    }
    const showBubbles = p.air < 299;
    $('bubbles-row').style.visibility = showBubbles ? 'visible' : 'hidden';
    if (showBubbles) {
      const bub = $('bubbles').children;
      for (let i = 0; i < 10; i++) {
        bub[i].src = (p.air / 30) > i ? ICONS.bubble : ICONS.bubbleEmpty;
      }
    }
  } else {
    $('bubbles-row').style.visibility = 'hidden';
  }
  // vinjeta štete
  $('vignette').style.opacity = p.hurtT > 0 ? '1' : '0';
};

ui.fillSlotEl = function (el, stack) {
  const img = el.querySelector('img');
  const cnt = el.querySelector('.slot-count');
  const dur = el.querySelector('.dur-bar');
  if (stack) {
    img.src = KS.iconURL(stack.id);
    img.style.display = '';
    cnt.textContent = stack.n > 1 ? stack.n : '';
    if (dur) {
      const def = !KS.isBlockId(stack.id) && KS.items[stack.id];
      if (def && def.tool && stack.dur !== undefined && stack.dur < def.tool.dur) {
        dur.style.display = '';
        dur.firstElementChild.style.width = (stack.dur / def.tool.dur * 100) + '%';
        dur.firstElementChild.style.background = stack.dur / def.tool.dur > 0.4 ? '#4cdc4c' : '#e0a020';
      } else dur.style.display = 'none';
    }
  } else {
    img.style.display = 'none';
    cnt.textContent = '';
    if (dur) dur.style.display = 'none';
  }
};

ui.flashHeldName = function (game) {
  const s = game.player.heldStack();
  const el = $('held-name');
  el.textContent = s ? KS.displayName(s.id) : '';
  el.style.opacity = '1';
  clearTimeout(ui._heldNameTimer);
  ui._heldNameTimer = setTimeout(() => { el.style.opacity = '0'; }, 1400);
};

ui.updateDebug = function (game, fps) {
  const el = $('debug-overlay');
  if (el.classList.contains('hidden')) return;
  const p = game.player;
  const w = game.world;
  const biomeNames = ['okean', 'plaža', 'ravnica', 'šuma', 'pustinja', 'snijeg', 'planine'];
  const info = w.heightInfo(Math.floor(p.x), Math.floor(p.z));
  const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
  el.textContent =
    `KockaSvijet v1.0 — ${fps.toFixed(0)} fps\n` +
    `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\n` +
    `Chunk: ${fx >> 4}, ${fz >> 4}  Biom: ${biomeNames[info.biome]}\n` +
    `Svjetlo: nebo ${w.getSky(fx, fy, fz)}, blok ${w.getBlkL(fx, fy, fz)}\n` +
    `Chunkovi: ${w.chunks.size} (nacrtano ${KS.renderer.chunksDrawn || 0})\n` +
    `Entiteti: ${w.entities.length}  Čestice: ${KS.particles.list.length}\n` +
    `Vrijeme: ${(w.time * 24).toFixed(1)}h  Seed: ${w.seed}\n` +
    `Mod: ${w.mode}${p.flying ? ' (letenje)' : ''}`;
};

// ---------- inventar / kontejneri ----------
function slotDiv (cls) {
  const d = document.createElement('div');
  d.className = 'slot' + (cls ? ' ' + cls : '');
  d.innerHTML = '<img style="display:none"><span class="slot-count"></span><div class="dur-bar" style="display:none"><div></div></div>';
  return d;
}

// generički slot: {get, set, canPut(stack), output, onTake}
ui.bindSlot = function (el, slot) {
  el.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    const game = KS.game;
    if (!game) return;
    KS.snd.play('click');
    const cur = ui.cursor;
    const s = slot.get();

    if (slot.output) {
      // uzimanje rezultata
      if (!s) return;
      if (ev.button === 0 && ev.shiftKey) {
        // craftaj koliko može u inventar
        let guard = 0;
        while (guard++ < 64) {
          const ss = slot.get();
          if (!ss) break;
          const left = game.player.addItem({ id: ss.id, n: ss.n });
          if (left > 0) break;
          slot.onTake();
          if (!slot.repeatable) break;
        }
      } else if (!cur) {
        ui.cursor = { id: s.id, n: s.n, dur: s.dur };
        slot.onTake();
      } else if (cur.id === s.id && cur.n + s.n <= KS.maxStackOf(s.id)) {
        cur.n += s.n;
        slot.onTake();
      }
      ui.refreshSlots();
      return;
    }

    if (ev.button === 0) {
      // lijevi: zamjena / spajanje
      if (cur && s && cur.id === s.id && cur.dur === undefined && s.dur === undefined) {
        const max = KS.maxStackOf(s.id);
        const take = Math.min(max - s.n, cur.n);
        if (take > 0) { s.n += take; cur.n -= take; slot.set(s); if (cur.n <= 0) ui.cursor = null; }
        else { slot.set(cur); ui.cursor = s; } // pun stack → swap
      } else if (cur) {
        if (!slot.canPut || slot.canPut(cur)) { slot.set(cur); ui.cursor = s || null; }
      } else if (s) {
        if (ev.shiftKey && slot.quickMove) { slot.quickMove(); }
        else { ui.cursor = s; slot.set(null); }
      }
    } else if (ev.button === 2) {
      // desni: po jedan / pola
      if (cur) {
        if (!s) {
          if (!slot.canPut || slot.canPut(cur)) {
            slot.set({ id: cur.id, n: 1, dur: cur.dur });
            cur.n--; if (cur.n <= 0) ui.cursor = null;
          }
        } else if (s.id === cur.id && s.n < KS.maxStackOf(s.id)) {
          s.n++; slot.set(s);
          cur.n--; if (cur.n <= 0) ui.cursor = null;
        }
      } else if (s) {
        const half = Math.ceil(s.n / 2);
        ui.cursor = { id: s.id, n: half, dur: s.dur };
        s.n -= half;
        slot.set(s.n > 0 ? s : null);
      }
    }
    ui.refreshSlots();
  });
  el.addEventListener('mouseenter', () => {
    const s = slot.get();
    if (s) {
      const tip = $('tooltip');
      tip.textContent = KS.displayName(s.id);
      tip.classList.remove('hidden');
    }
  });
  el.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
  ui._slotEls.push({ el, slot });
};

ui.refreshSlots = function () {
  for (const { el, slot } of ui._slotEls) ui.fillSlotEl(el, slot.get());
  // kursor
  const cs = $('cursor-stack');
  if (ui.cursor) {
    cs.classList.remove('hidden');
    $('cursor-img').src = KS.iconURL(ui.cursor.id);
    $('cursor-count').textContent = ui.cursor.n > 1 ? ui.cursor.n : '';
  } else cs.classList.add('hidden');
  // rezultat crafta
  if (ui.craftGrid) ui.updateCraftResult();
  if (KS.game) ui.updateHUD(KS.game);
};

document.addEventListener('mousemove', (ev) => {
  const cs = $('cursor-stack');
  if (!cs.classList.contains('hidden')) {
    cs.style.left = (ev.clientX - 18) + 'px';
    cs.style.top = (ev.clientY - 18) + 'px';
  }
  const tip = $('tooltip');
  if (!tip.classList.contains('hidden')) {
    tip.style.left = (ev.clientX + 14) + 'px';
    tip.style.top = (ev.clientY - 26) + 'px';
  }
});

// slotovi igračevog inventara
function invSlot (game, i) {
  return {
    get: () => game.player.inv[i],
    set: (s) => { game.player.inv[i] = s; },
    quickMove: () => {
      const s = game.player.inv[i];
      if (!s) return;
      game.player.inv[i] = null;
      let left;
      if (ui.openType === 'chest' && ui.chestEnt) {
        left = addToSlots(ui.chestEnt.slots, s);
      } else if (i < 9) {
        left = addToRange(game.player.inv, 9, 36, s);
      } else {
        left = addToRange(game.player.inv, 0, 9, s);
      }
      if (left > 0) { s.n = left; game.player.inv[i] = s; }
    },
  };
}
function addToRange (arr, from, to, stack) {
  let n = stack.n;
  const max = KS.maxStackOf(stack.id);
  for (let i = from; i < to && n > 0; i++) {
    const s = arr[i];
    if (s && s.id === stack.id && s.dur === undefined && stack.dur === undefined && s.n < max) {
      const t = Math.min(max - s.n, n); s.n += t; n -= t;
    }
  }
  for (let i = from; i < to && n > 0; i++) {
    if (!arr[i]) { const t = Math.min(max, n); arr[i] = { id: stack.id, n: t, dur: stack.dur }; n -= t; }
  }
  return n;
}
function addToSlots (arr, stack) { return addToRange(arr, 0, arr.length, stack); }

// ---------- otvaranje prozora ----------
ui.openWindow = function (game, type, opts) {
  opts = opts || {};
  ui.closeWindow(true);
  ui.openType = type;
  game.uiOpen = true;
  document.exitPointerLock && document.exitPointerLock();
  $('inv-root').classList.remove('hidden');
  ui._slotEls.length = 0;
  const extra = $('inv-extra');
  extra.innerHTML = '';

  const titles = { inv: 'inv.title', table: 'inv.table', furnace: 'inv.furnace', chest: 'inv.chest', creative: 'inv.creative' };
  $('inv-title').textContent = KS.t(titles[type]);

  // glavni inventar + hotbar
  const mainGrid = $('inv-main'), hbGrid = $('inv-hotbar');
  mainGrid.innerHTML = ''; hbGrid.innerHTML = '';
  $('inv-label-main').textContent = '';
  if (type !== 'creative') {
    for (let i = 9; i < 36; i++) { const el = slotDiv(); mainGrid.appendChild(el); ui.bindSlot(el, invSlot(game, i)); }
  }
  for (let i = 0; i < 9; i++) { const el = slotDiv(); hbGrid.appendChild(el); ui.bindSlot(el, invSlot(game, i)); }

  if (type === 'inv' || type === 'table') {
    const size = type === 'inv' ? 2 : 3;
    ui.craftSize = size;
    ui.craftGrid = new Array(size * size).fill(null);
    const zone = document.createElement('div');
    zone.className = 'craft-zone';
    const grid = document.createElement('div');
    grid.className = size === 2 ? 'craft-grid2' : 'craft-grid3';
    for (let i = 0; i < size * size; i++) {
      const el = slotDiv();
      grid.appendChild(el);
      ui.bindSlot(el, {
        get: () => ui.craftGrid[i],
        set: (s) => { ui.craftGrid[i] = s; },
        quickMove: () => {
          const s = ui.craftGrid[i];
          if (!s) return;
          ui.craftGrid[i] = null;
          const left = game.player.addItem(s);
          if (left > 0) { s.n = left; ui.craftGrid[i] = s; }
        },
      });
    }
    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '→';
    const resEl = slotDiv('result');
    ui.craftResultEl = resEl;
    ui.bindSlot(resEl, {
      output: true, repeatable: true,
      get: () => ui.craftResult,
      onTake: () => {
        // potroši po 1 iz svake popunjene ćelije
        for (let i = 0; i < ui.craftGrid.length; i++) {
          const s = ui.craftGrid[i];
          if (s) { s.n--; if (s.n <= 0) ui.craftGrid[i] = null; }
        }
        ui.updateCraftResult();
      },
    });
    zone.appendChild(grid); zone.appendChild(arrow); zone.appendChild(resEl);
    extra.appendChild(zone);
    const lab = document.createElement('div');
    lab.className = 'inv-label';
    lab.textContent = KS.t('inv.craft');
    extra.insertBefore(lab, zone);
    ui.updateCraftResult();
  }

  if (type === 'furnace') {
    ui.furnaceKey = opts.key;
    const fe = game.world.blockEnts.get(opts.key);
    ui.furnaceEnt = fe;
    const zone = document.createElement('div');
    zone.className = 'furnace-zone';
    const colIn = document.createElement('div'); colIn.className = 'furnace-col';
    const inEl = slotDiv();
    const flame = document.createElement('div'); flame.className = 'flame-bar'; flame.innerHTML = '<div></div>';
    const fuelEl = slotDiv();
    colIn.appendChild(inEl); colIn.appendChild(flame); colIn.appendChild(fuelEl);
    const colMid = document.createElement('div'); colMid.className = 'furnace-col';
    const smelt = document.createElement('div'); smelt.className = 'smelt-bar'; smelt.innerHTML = '<div></div>';
    const arrow = document.createElement('div'); arrow.className = 'craft-arrow'; arrow.textContent = '→';
    colMid.appendChild(arrow); colMid.appendChild(smelt);
    const outEl = slotDiv('result');
    zone.appendChild(colIn); zone.appendChild(colMid); zone.appendChild(outEl);
    extra.appendChild(zone);
    ui.furnaceBars = { flame: flame.firstElementChild, smelt: smelt.firstElementChild };
    ui.bindSlot(inEl, {
      get: () => fe.in, set: (s) => { fe.in = s; },
      quickMove: () => { const s = fe.in; if (!s) return; fe.in = null; const left = game.player.addItem(s); if (left) { s.n = left; fe.in = s; } },
    });
    ui.bindSlot(fuelEl, {
      get: () => fe.fuel, set: (s) => { fe.fuel = s; },
      canPut: (s) => KS.fuelValue(s.id) > 0,
      quickMove: () => { const s = fe.fuel; if (!s) return; fe.fuel = null; const left = game.player.addItem(s); if (left) { s.n = left; fe.fuel = s; } },
    });
    ui.bindSlot(outEl, {
      output: true,
      get: () => fe.out,
      onTake: () => { fe.out = null; },
    });
    KS.snd.play('chestOpen', { vol: 0.5 });
  }

  if (type === 'chest') {
    ui.chestKey = opts.key;
    const fe = game.world.blockEnts.get(opts.key);
    ui.chestEnt = fe;
    const grid = document.createElement('div');
    grid.className = 'slot-grid';
    for (let i = 0; i < 27; i++) {
      const el = slotDiv();
      grid.appendChild(el);
      ui.bindSlot(el, {
        get: () => fe.slots[i],
        set: (s) => { fe.slots[i] = s; },
        quickMove: () => {
          const s = fe.slots[i];
          if (!s) return;
          fe.slots[i] = null;
          const left = game.player.addItem(s);
          if (left > 0) { s.n = left; fe.slots[i] = s; }
        },
      });
    }
    extra.appendChild(grid);
    KS.snd.play('chestOpen');
  }

  if (type === 'creative') {
    const tabs = KS.creativeTabs();
    const tabBar = document.createElement('div');
    tabBar.className = 'inv-tabs';
    const grid = document.createElement('div');
    grid.className = 'creative-grid';
    const tabNames = { blocks: 'tab.blocks', nature: 'tab.nature', tools: 'tab.tools', food: 'tab.food' };
    let curTab = 'blocks';
    const renderTab = () => {
      grid.innerHTML = '';
      // ukloni stare creative slotove iz registra
      ui._slotEls = ui._slotEls.filter(se => !se.creative);
      for (const id of tabs[curTab]) {
        const el = slotDiv();
        grid.appendChild(el);
        ui.fillSlotEl(el, { id, n: 1 });
        el.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          KS.snd.play('click');
          const isTool = !KS.isBlockId(id) && KS.items[id].tool;
          if (ev.button === 0) {
            if (ui.cursor && ui.cursor.id === id && !isTool) ui.cursor.n = Math.min(KS.maxStackOf(id), ui.cursor.n + (ev.shiftKey ? 64 : 1));
            else ui.cursor = { id, n: ev.shiftKey ? KS.maxStackOf(id) : 1, dur: undefined };
          } else if (ev.button === 2) {
            ui.cursor = { id, n: KS.maxStackOf(id) };
          }
          ui.refreshSlots();
        });
        el.addEventListener('mouseenter', () => {
          const tip = $('tooltip');
          tip.textContent = KS.displayName(id);
          tip.classList.remove('hidden');
        });
        el.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
      }
    };
    for (const tk in tabNames) {
      const t = document.createElement('div');
      t.className = 'inv-tab' + (tk === curTab ? ' sel' : '');
      t.textContent = KS.t(tabNames[tk]);
      t.addEventListener('click', () => {
        curTab = tk;
        tabBar.querySelectorAll('.inv-tab').forEach(e => e.classList.remove('sel'));
        t.classList.add('sel');
        renderTab();
      });
      tabBar.appendChild(t);
    }
    // smeće
    const trash = slotDiv();
    trash.style.background = '#a05050';
    trash.title = KS.t('inv.trash');
    trash.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ui.cursor = null;
      ui.refreshSlots();
    });
    tabBar.appendChild(trash);
    extra.appendChild(tabBar);
    extra.appendChild(grid);
    renderTab();
  }

  ui.refreshSlots();
};

ui.updateCraftResult = function () {
  if (!ui.craftGrid) { ui.craftResult = null; return; }
  const ids = ui.craftGrid.map(s => s ? s.id : 0);
  const r = KS.matchCraft(ids, ui.craftSize);
  ui.craftResult = r ? { id: r.out.id, n: r.out.n } : null;
  if (ui.craftResultEl) ui.fillSlotEl(ui.craftResultEl, ui.craftResult);
};

ui.tickFurnaceUI = function () {
  if (ui.openType !== 'furnace' || !ui.furnaceEnt) return;
  const fe = ui.furnaceEnt;
  ui.furnaceBars.flame.style.width = (fe.burnMax > 0 ? KS.clamp01(fe.burn / fe.burnMax) * 100 : 0) + '%';
  ui.furnaceBars.smelt.style.width = KS.clamp01(fe.progress / KS.SMELT_TIME) * 100 + '%';
  // osvježi slotove (peć radi i dok gledaš)
  for (const { el, slot } of ui._slotEls) ui.fillSlotEl(el, slot.get());
};

ui.closeWindow = function (silent) {
  if (!ui.openType) return;
  const game = KS.game;
  // vrati craft grid u inventar
  if (ui.craftGrid && game) {
    for (const s of ui.craftGrid) {
      if (s) {
        const left = game.player.addItem(s);
        if (left > 0) KS.spawnItem(game.world, game.player.x, game.player.y + 1, game.player.z, { id: s.id, n: left });
      }
    }
  }
  // kursor stack vrati
  if (ui.cursor && game) {
    const left = game.player.addItem(ui.cursor);
    if (left > 0) KS.spawnItem(game.world, game.player.x, game.player.y + 1, game.player.z, { id: ui.cursor.id, n: left, dur: ui.cursor.dur });
  }
  if (ui.openType === 'chest' && !silent) KS.snd.play('chestClose');
  ui.cursor = null;
  ui.craftGrid = null;
  ui.craftResult = null;
  ui.openType = null;
  ui.furnaceEnt = null;
  ui.chestEnt = null;
  ui._slotEls.length = 0;
  $('inv-root').classList.add('hidden');
  $('tooltip').classList.add('hidden');
  $('cursor-stack').classList.add('hidden');
  if (game) game.uiOpen = false;
};

// kuke za player.useBlock
ui.openCraftTable = function () { ui.openWindow(KS.game, 'table'); };
ui.openFurnace = function (x, y, z) {
  const key = x + ',' + y + ',' + z;
  const w = KS.game.world;
  if (!w.blockEnts.has(key)) w.blockEnts.set(key, { type: 'furnace', in: null, fuel: null, out: null, burn: 0, burnMax: 0, progress: 0 });
  ui.openWindow(KS.game, 'furnace', { key });
};
ui.openChest = function (x, y, z) {
  const key = x + ',' + y + ',' + z;
  const w = KS.game.world;
  if (!w.blockEnts.has(key)) w.blockEnts.set(key, { type: 'chest', slots: new Array(27).fill(null) });
  ui.openWindow(KS.game, 'chest', { key });
};
ui.openInventory = function () {
  ui.openWindow(KS.game, KS.game.world.mode === 'creative' ? 'creative' : 'inv');
};

// ---------- knjiga recepata ----------
ui.showRecipes = function () {
  const root = $('recipes-root');
  root.classList.remove('hidden');
  const list = $('recipes-list');
  list.innerHTML = '';
  const mkSlot = (id, n) => {
    const el = slotDiv();
    if (id) ui.fillSlotEl(el, { id, n: n || 1 });
    return el;
  };
  const sec1 = document.createElement('div');
  sec1.className = 'recipe-sec';
  sec1.textContent = KS.t('recipes.craft');
  list.appendChild(sec1);
  for (const r of KS.recipes) {
    const row = document.createElement('div');
    row.className = 'recipe-row';
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    const cells = new Array(9).fill(0);
    if (r.type === 'shaped') {
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) cells[y * 3 + x] = r.grid[y][x];
    } else {
      r.ing.forEach((id, i) => { cells[i] = id; });
    }
    for (const id of cells) grid.appendChild(mkSlot(id));
    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '→';
    const out = mkSlot(r.out.id, r.out.n);
    out.classList.add('result');
    const name = document.createElement('div');
    name.className = 'rname';
    name.textContent = KS.displayName(r.out.id) + (r.out.n > 1 ? ' ×' + r.out.n : '');
    row.appendChild(grid); row.appendChild(arrow); row.appendChild(out); row.appendChild(name);
    list.appendChild(row);
  }
  // topljenje
  const sec2 = document.createElement('div');
  sec2.className = 'recipe-sec';
  sec2.textContent = KS.t('recipes.smelt');
  list.appendChild(sec2);
  const smeltables = [];
  for (const idS in KS.blocks) { if (KS.blocks[idS].smeltsTo) smeltables.push(+idS); }
  for (const idS in KS.items) { if (KS.items[idS].smeltsTo) smeltables.push(+idS); }
  for (const id of smeltables) {
    const def = KS.defOf(id);
    const outKey = def.smeltsTo;
    const outId = KS.I[outKey] !== undefined ? KS.I[outKey] : KS.B[outKey];
    const row = document.createElement('div');
    row.className = 'recipe-row';
    row.appendChild(mkSlot(id));
    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '→';
    row.appendChild(arrow);
    const out = mkSlot(outId);
    row.appendChild(out);
    const name = document.createElement('div');
    name.className = 'rname';
    name.textContent = KS.displayName(outId);
    row.appendChild(name);
    list.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.fontSize = '12px';
  note.textContent = KS.t('recipes.smeltAny');
  list.appendChild(note);
};
ui.hideRecipes = function () { $('recipes-root').classList.add('hidden'); };

// ---------- smrt ----------
ui.onPlayerDeath = function () {
  ui.closeWindow(true);
  ui.showScreen('death');
  document.exitPointerLock && document.exitPointerLock();
};

// ---------- opcije ----------
ui.buildOptions = function (onChange) {
  const body = $('options-body');
  body.innerHTML = '';
  const o = KS.opts;

  const section = (label) => {
    const d = document.createElement('div');
    d.className = 'opt-section';
    d.textContent = KS.t(label);
    body.appendChild(d);
  };
  const slider = (label, key, min, max, step, fmt) => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap';
    const lab = document.createElement('div');
    lab.className = 'sl-label';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.value = o[key];
    const upd = () => { lab.textContent = KS.t(label) + ': ' + (fmt ? fmt(+inp.value) : inp.value); };
    upd();
    inp.addEventListener('input', () => {
      o[key] = +inp.value;
      upd();
      KS.save.saveOptions(o);
      onChange && onChange(key);
    });
    wrap.appendChild(lab); wrap.appendChild(inp);
    row.appendChild(wrap);
    body.appendChild(row);
  };
  const toggle = (label, key, vals, names) => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const btn = document.createElement('button');
    btn.className = 'mbtn opt';
    const upd = () => {
      let txt;
      if (vals) {
        const i = vals.indexOf(o[key]);
        txt = names[i >= 0 ? i : 0];
      } else txt = o[key] ? KS.t('ui.on') : KS.t('ui.off');
      btn.textContent = KS.t(label) + ': ' + txt;
    };
    upd();
    btn.addEventListener('click', () => {
      KS.snd.play('click');
      if (vals) {
        const i = (vals.indexOf(o[key]) + 1) % vals.length;
        o[key] = vals[i];
      } else o[key] = !o[key];
      upd();
      KS.save.saveOptions(o);
      onChange && onChange(key);
    });
    row.appendChild(btn);
    body.appendChild(row);
  };

  section('opt.sec.graphics');
  slider('opt.rd', 'rd', 4, 12, 1, v => v + ' chunkova');
  slider('opt.fov', 'fov', 60, 110, 1);
  toggle('opt.fog', 'fog');
  toggle('opt.clouds', 'clouds');
  toggle('opt.smooth', 'smooth');
  toggle('opt.bob', 'bob');
  toggle('opt.particles', 'particles', [2, 1, 0], [KS.t('opt.particles.all'), KS.t('opt.particles.some'), KS.t('opt.particles.off')]);
  section('opt.sec.sound');
  slider('opt.master', 'master', 0, 1, 0.05, v => Math.round(v * 100) + '%');
  slider('opt.music', 'music', 0, 1, 0.05, v => Math.round(v * 100) + '%');
  slider('opt.sfx', 'sfx', 0, 1, 0.05, v => Math.round(v * 100) + '%');
  section('opt.sec.controls');
  slider('opt.sens', 'sens', 0.1, 1.5, 0.05, v => Math.round(v * 100) + '%');
  toggle('opt.invertY', 'invertY');
  section('opt.sec.other');
  toggle('opt.lang', 'lang', ['bs', 'en'], ['Bosanski', 'English']);
  const fsRow = document.createElement('div');
  fsRow.className = 'opt-row';
  const fsBtn = document.createElement('button');
  fsBtn.className = 'mbtn opt';
  fsBtn.textContent = KS.t('opt.fullscreen');
  fsBtn.addEventListener('click', () => {
    KS.snd.play('click');
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  fsRow.appendChild(fsBtn);
  body.appendChild(fsRow);
};

// ---------- kontrole ----------
ui.buildControls = function () {
  const list = $('controls-list');
  list.innerHTML = '';
  const rows = [
    ['W A S D', 'ctl.move'], ['Space', 'ctl.jump'], ['Shift', 'ctl.sneak'], ['Ctrl / 2×W', 'ctl.sprint'],
    ['Lijevi klik', 'ctl.break'], ['Desni klik', 'ctl.place'], ['E', 'ctl.inv'], ['Q', 'ctl.drop'],
    ['1–9', 'ctl.hotbar'], ['Točkić', 'ctl.wheel'], ['F', 'ctl.persp'], ['F3', 'ctl.debug'],
    ['Esc', 'ctl.pause'], ['F2', 'ctl.shot'], ['2× Space', 'ctl.fly'], ['Space / Shift', 'ctl.flyud'],
  ];
  for (const [key, label] of rows) {
    const d = document.createElement('div');
    d.className = 'crow';
    d.innerHTML = `<span>${KS.t(label)}</span><span class="ckey">${key}</span>`;
    list.appendChild(d);
  }
};

})();
