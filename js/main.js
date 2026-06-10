// ===== KockaSvijet — glavni modul: boot, petlja, meniji, input =====
(function () {

const $ = id => document.getElementById(id);

KS.opts = KS.save.loadOptions();
KS.profile = KS.save.loadProfile();
KS.game = null;

let renderer = null;
let menuGame = null;     // panorama u pozadini menija
let state = 'menu';      // 'menu' | 'loading' | 'game'
let paused = false;
let optionsFrom = 'menu';
let lastT = 0;
let fps = 60, fpsAcc = 0, fpsN = 0, fpsShown = 60;
let screenshotFlag = false;
let newWorldOpts = { mode: 'survival', type: 'normal', diff: 'normal' };
let selectedWorld = null;
let deleteArmed = null;

const input = {
  fwd: false, back: false, left: false, right: false,
  jump: false, sneak: false, sprint: false,
  attack: false, use: false,
};

// ---------- boot ----------
function boot () {
  KS.setLang(KS.opts.lang);
  KS.particles.level = KS.opts.particles;

  const canvas = $('glcanvas');
  try {
    renderer = KS.renderer = new KS.Renderer(canvas);
  } catch (e) {
    document.body.innerHTML = '<div style="color:#fff;padding:40px;font-family:sans-serif"><h2>Greška: WebGL2 nije dostupan</h2><p>Pokušaj u novijem Chrome ili Edge pregledniku.</p></div>';
    return;
  }

  if (!KS.store.available) KS.ui.toast(KS.t('toast.storage'));

  setupMenus();
  setupInput();
  KS.ui.initHUD();
  startMenuPanorama();

  $('splash-text').textContent = KS.SPLASHES[(Math.random() * KS.SPLASHES.length) | 0];
  KS.ui.showScreen('main');
  requestAnimationFrame(rafLoop);
}

// ---------- panorama ----------
function startMenuPanorama () {
  const world = new KS.World({ id: '__menu__', seed: 31337, mode: 'creative', type: 'normal', name: 'panorama' });
  const spawn = world.findSpawn();
  menuGame = {
    world,
    player: null,
    panorama: { x: spawn.x, y: Math.max(spawn.y + 10, 48), z: spawn.z, yaw: 0, pitch: -0.22 },
    now: 0, dayFactor: 1, renderDist: 5, uiOpen: false, charId: KS.profile.charId,
  };
  world.time = 0.1;
}

// ---------- meniji ----------
function setupMenus () {
  const click = (id, fn) => $(id).addEventListener('click', () => { KS.snd.init(); KS.snd.resume(); KS.snd.play('click'); fn(); });

  click('btn-play', () => { renderWorldList(); KS.ui.showScreen('worlds'); });
  click('btn-chars', () => { renderCharGrid(); KS.ui.showScreen('chars'); });
  click('btn-options', () => { optionsFrom = 'main'; KS.ui.buildOptions(onOptionChange); KS.ui.showScreen('options'); });
  click('btn-about', () => { $('about-text').textContent = KS.t('about.text'); KS.ui.showScreen('about'); });
  click('about-back', () => KS.ui.showScreen('main'));
  click('btn-worlds-back', () => KS.ui.showScreen('main'));
  click('options-back', () => {
    if (optionsFrom === 'pause') KS.ui.showScreen('pause');
    else KS.ui.showScreen('main');
  });
  click('btn-controls', () => { KS.ui.buildControls(); KS.ui.showScreen('controls'); });
  click('controls-back', () => KS.ui.showScreen('options'));

  // novi svijet
  click('btn-world-new', () => {
    $('nw-name').value = KS.t('new.defname');
    $('nw-seed').value = '';
    updateNewWorldButtons();
    KS.ui.showScreen('newworld');
  });
  click('nw-back', () => KS.ui.showScreen('worlds'));
  click('nw-mode', () => { newWorldOpts.mode = newWorldOpts.mode === 'survival' ? 'creative' : 'survival'; updateNewWorldButtons(); });
  click('nw-type', () => { newWorldOpts.type = newWorldOpts.type === 'normal' ? 'flat' : 'normal'; updateNewWorldButtons(); });
  click('nw-diff', () => { newWorldOpts.diff = newWorldOpts.diff === 'normal' ? 'peace' : 'normal'; updateNewWorldButtons(); });
  click('nw-create', () => {
    const name = $('nw-name').value.trim() || KS.t('new.defname');
    const seed = KS.strToSeed($('nw-seed').value);
    const meta = KS.save.createWorldMeta({ name, seed, mode: newWorldOpts.mode, type: newWorldOpts.type, diff: newWorldOpts.diff });
    startGame(meta, true);
  });

  click('btn-world-play', () => { if (selectedWorld) startGame(selectedWorld, false); });
  click('btn-world-del', () => {
    if (!selectedWorld) return;
    if (deleteArmed === selectedWorld.id) {
      KS.save.deleteWorld(selectedWorld.id);
      selectedWorld = null; deleteArmed = null;
      renderWorldList();
    } else {
      deleteArmed = selectedWorld.id;
      KS.ui.toast(KS.t('worlds.confirmDel'));
    }
  });

  click('chars-back', () => {
    KS.profile.name = $('char-name').value.trim() || 'Igrač';
    KS.save.saveProfile(KS.profile);
    KS.ui.showScreen('main');
  });

  // pauza
  click('pause-resume', resumeGame);
  click('pause-options', () => { optionsFrom = 'pause'; KS.ui.buildOptions(onOptionChange); KS.ui.showScreen('options'); });
  click('pause-recipes', () => KS.ui.showRecipes());
  click('pause-quit', quitToMenu);
  click('recipes-close', () => KS.ui.hideRecipes());

  // smrt
  click('death-respawn', () => {
    const g = KS.game;
    g.player.respawn();
    KS.ui.showScreen(null);
    lockPointer();
  });
  click('death-quit', quitToMenu);
}

function updateNewWorldButtons () {
  $('nw-mode').textContent = KS.t('new.mode') + KS.t('mode.' + newWorldOpts.mode);
  $('nw-type').textContent = KS.t('new.type') + KS.t('type.' + newWorldOpts.type);
  $('nw-diff').textContent = KS.t('new.diff') + KS.t('diff.' + newWorldOpts.diff);
}

function renderWorldList () {
  const list = KS.save.listWorlds();
  const root = $('world-list');
  root.innerHTML = '';
  selectedWorld = null; deleteArmed = null;
  $('btn-world-play').disabled = true;
  $('btn-world-del').disabled = true;
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'world-empty';
    d.textContent = KS.t('worlds.empty');
    root.appendChild(d);
    return;
  }
  for (const w of list) {
    const card = document.createElement('div');
    card.className = 'world-card';
    const date = new Date(w.lastPlayed).toLocaleDateString('bs-BA', { day: 'numeric', month: 'numeric', year: 'numeric' });
    card.innerHTML = `<div><div class="wname"></div><div class="winfo"></div></div><div style="font-size:22px">▶</div>`;
    card.querySelector('.wname').textContent = w.name;
    card.querySelector('.winfo').textContent = `${KS.t('mode.' + w.mode)} · ${KS.t('type.' + (w.type || 'normal'))} · ${date}`;
    card.addEventListener('click', () => {
      root.querySelectorAll('.world-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      selectedWorld = w;
      deleteArmed = null;
      $('btn-world-play').disabled = false;
      $('btn-world-del').disabled = false;
    });
    card.addEventListener('dblclick', () => startGame(w, false));
    root.appendChild(card);
  }
}

function renderCharGrid () {
  const grid = $('char-grid');
  grid.innerHTML = '';
  $('char-name').value = KS.profile.name;
  for (const ch of KS.chars) {
    const card = document.createElement('div');
    card.className = 'char-card' + (ch.id === KS.profile.charId ? ' sel' : '');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    // crtaj uvećano: 16 širine × 32 visine modela
    const tmp = document.createElement('canvas');
    tmp.width = 16 * 4; tmp.height = 32 * 4;
    KS.drawCharPreview(tmp, ch);
    const c2 = cv.getContext('2d');
    c2.imageSmoothingEnabled = false;
    c2.drawImage(tmp, 0, 0, 64, 128);
    card.appendChild(cv);
    const nm = document.createElement('div');
    nm.className = 'cname';
    nm.textContent = ch.name;
    const ds = document.createElement('div');
    ds.className = 'cdesc';
    ds.textContent = ch.desc;
    card.appendChild(nm); card.appendChild(ds);
    card.addEventListener('click', () => {
      KS.snd.play('click');
      KS.profile.charId = ch.id;
      KS.save.saveProfile(KS.profile);
      grid.querySelectorAll('.char-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      if (menuGame) menuGame.charId = ch.id;
    });
    grid.appendChild(card);
  }
}

function onOptionChange (key) {
  if (['master', 'music', 'sfx'].includes(key)) { KS.snd.volumes.master = KS.opts.master; KS.snd.volumes.music = KS.opts.music; KS.snd.volumes.sfx = KS.opts.sfx; KS.snd.applyVolumes(); }
  if (key === 'lang') { KS.setLang(KS.opts.lang); KS.ui.buildOptions(onOptionChange); }
  if (key === 'particles') KS.particles.level = KS.opts.particles;
  if (key === 'smooth') {
    const g = KS.game || menuGame;
    if (g) for (const c of g.world.chunks.values()) if (c.meshed) { c.dirty = true; g.world.dirtyMesh.add(c); }
  }
}

// ---------- start / izlaz iz igre ----------
function startGame (worldMeta, isNew) {
  KS.snd.init();
  KS.ui.showScreen('loading');
  $('loading-bar').style.width = '0%';
  $('loading-tip').textContent = KS.t('load.terrain');
  state = 'loading';
  paused = false;

  const saved = isNew ? null : KS.save.loadWorldMeta(worldMeta.id);
  const world = new KS.World({
    id: worldMeta.id,
    seed: saved ? saved.seed : worldMeta.seed,
    mode: saved ? saved.mode : worldMeta.mode,
    type: saved ? (saved.type || 'normal') : worldMeta.type,
    diff: saved ? (saved.diff || 'normal') : worldMeta.diff,
    name: saved ? saved.name : worldMeta.name,
    time: saved ? saved.time : 0.05,
    savedChunkKeys: saved ? saved.savedChunks : [],
  });
  if (saved && saved.blockEnts) {
    for (const [k, v] of saved.blockEnts) world.blockEnts.set(k, v);
  }

  let pdata = saved && saved.player;
  let spawn;
  if (pdata) spawn = pdata.spawn;
  else {
    spawn = world.findSpawn();
    pdata = { x: spawn.x, y: spawn.y, z: spawn.z, spawn };
  }
  const player = new KS.Player(world, pdata);

  const game = KS.game = {
    world, player,
    now: 0, dayFactor: 1,
    renderDist: KS.opts.rd,
    uiOpen: false,
    charId: KS.profile.charId,
    diff: world.diff,
    autosaveT: 0,
    hostileT: 0,
    loadProgress: 0,
  };

  // loading petlja radi u tick()
  game._loading = {
    cx: Math.floor(player.x) >> 4,
    cz: Math.floor(player.z) >> 4,
    started: performance.now(),
  };
}

function enterGame () {
  state = 'game';
  paused = false;
  KS.ui.showScreen(null);
  $('hud').classList.remove('hidden');
  KS.ui.updateHUD(KS.game);
  KS.ui.flashHeldName(KS.game);
  lockPointer();
}

function quitToMenu () {
  const g = KS.game;
  if (g) {
    KS.ui.closeWindow(true);
    const ok = KS.save.saveWorld(g);
    KS.ui.toast(KS.t(ok ? 'toast.saved' : 'toast.saveFail'));
    // očisti GPU bafere
    for (const c of g.world.chunks.values()) renderer.deleteChunk(c);
    KS.particles.clear();
  }
  KS.game = null;
  state = 'menu';
  paused = false;
  $('hud').classList.add('hidden');
  $('debug-overlay').classList.add('hidden');
  document.exitPointerLock && document.exitPointerLock();
  $('splash-text').textContent = KS.SPLASHES[(Math.random() * KS.SPLASHES.length) | 0];
  KS.ui.showScreen('main');
}

// ---------- pointer lock i pauza ----------
function lockPointer () {
  const canvas = $('glcanvas');
  if (document.pointerLockElement === canvas) return;
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === $('glcanvas');
  if (!locked && state === 'game' && !KS.game.uiOpen && !KS.game.player.dead && !paused) {
    openPause();
  }
});
function openPause () {
  paused = true;
  KS.ui.showScreen('pause');
}
function resumeGame () {
  paused = false;
  KS.ui.hideRecipes();
  KS.ui.showScreen(null);
  lockPointer();
}

// ---------- input ----------
function setupInput () {
  const canvas = $('glcanvas');

  document.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    KS.snd.init(); KS.snd.resume();
    if (state !== 'game') return;
    const g = KS.game;
    if (paused || g.uiOpen || g.player.dead) return;
    if (document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) {
      input.attack = true;
      g.player.attackPress(g);
    } else if (e.button === 2) {
      input.use = true;
      g.player.useBlock(g);
      g._useT = 0.24;
    } else if (e.button === 1) {
      e.preventDefault();
      // pick block (kreativni): uzmi blok u hotbar
      if (g.world.mode === 'creative' && g.player.target) {
        const id = g.player.target.id;
        const def = KS.blocks[id];
        const pickId = def.key === 'furnaceLit' ? KS.B.furnace : id;
        g.player.inv[g.player.sel] = { id: pickId, n: 64 };
        KS.ui.updateHUD(g);
        KS.ui.flashHeldName(g);
      }
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.attack = false;
    if (e.button === 2) input.use = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (state !== 'game' || paused) return;
    const g = KS.game;
    if (g.uiOpen || g.player.dead) return;
    if (document.pointerLockElement !== $('glcanvas')) return;
    const sens = KS.opts.sens * 0.0035;
    g.player.yaw -= e.movementX * sens;
    g.player.pitch += (KS.opts.invertY ? e.movementY : -e.movementY) * sens;
    g.player.pitch = KS.clamp(g.player.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  });

  document.addEventListener('wheel', (e) => {
    if (state !== 'game' || paused) return;
    const g = KS.game;
    if (g.uiOpen) return;
    g.player.sel = KS.mod(g.player.sel + (e.deltaY > 0 ? 1 : -1), 9);
    g.player.eatingT = 0;
    KS.ui.updateHUD(g);
    KS.ui.flashHeldName(g);
  }, { passive: true });

  let lastSpace = 0, lastW = 0;
  document.addEventListener('keydown', (e) => {
    KS.snd.init();
    if (e.repeat) return;
    const g = KS.game;
    const code = e.code;

    if (['F1', 'F2', 'F3', 'F4', 'Tab'].includes(code)) e.preventDefault();

    if (state !== 'game') return;

    // UI otvoren
    if (g.uiOpen) {
      if (code === 'KeyE' || code === 'Escape') {
        e.preventDefault();
        KS.ui.closeWindow();
        lockPointer();
      }
      return;
    }
    if (paused) {
      if (code === 'Escape') resumeGame();
      return;
    }
    if (g.player.dead) return;

    switch (code) {
      case 'KeyW': case 'ArrowUp':
        input.fwd = true;
        if (performance.now() - lastW < 280) input.sprint = true;
        lastW = performance.now();
        break;
      case 'KeyS': case 'ArrowDown': input.back = true; break;
      case 'KeyA': case 'ArrowLeft': input.left = true; break;
      case 'KeyD': case 'ArrowRight': input.right = true; break;
      case 'Space':
        e.preventDefault();
        input.jump = true;
        if (g.world.mode === 'creative' && performance.now() - lastSpace < 300) {
          g.player.flying = !g.player.flying;
          g.player.vy = 0;
          KS.ui.toast(KS.t(g.player.flying ? 'toast.flyOn' : 'toast.flyOff'));
        }
        lastSpace = performance.now();
        break;
      case 'ShiftLeft': case 'ShiftRight': input.sneak = true; break;
      case 'ControlLeft': case 'ControlRight': input.sprint = true; break;
      case 'KeyE':
        e.preventDefault();
        KS.ui.openInventory();
        break;
      case 'KeyQ': g.player.dropHeld(e.ctrlKey); break;
      case 'KeyF': renderer.persp = (renderer.persp + 1) % 3; break;
      case 'F3': $('debug-overlay').classList.toggle('hidden'); break;
      case 'F2': screenshotFlag = true; break;
      case 'Escape': break; // pointerlockchange otvara pauzu
      default:
        if (code.startsWith('Digit')) {
          const n = +code.slice(5);
          if (n >= 1 && n <= 9) {
            g.player.sel = n - 1;
            g.player.eatingT = 0;
            KS.ui.updateHUD(g);
            KS.ui.flashHeldName(g);
          }
        }
    }
  });
  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': input.fwd = false; input.sprint = false; break;
      case 'KeyS': case 'ArrowDown': input.back = false; break;
      case 'KeyA': case 'ArrowLeft': input.left = false; break;
      case 'KeyD': case 'ArrowRight': input.right = false; break;
      case 'Space': input.jump = false; break;
      case 'ShiftLeft': case 'ShiftRight': input.sneak = false; break;
      case 'ControlLeft': case 'ControlRight': input.sprint = false; break;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (KS.game) KS.save.saveWorld(KS.game);
  });
}

// ---------- chunk pipeline ----------
function streamChunks (game, centerX, centerZ, radius, budgetMs) {
  const world = game.world;
  const t0 = performance.now();
  const ccx = centerX >> 4, ccz = centerZ >> 4;

  // 1) hitni remesh (izmjene blokova/svjetla)
  if (world.dirtyMesh.size) {
    const arr = [...world.dirtyMesh].sort((a, b) => {
      const da = (a.cx - ccx) ** 2 + (a.cz - ccz) ** 2, db = (b.cx - ccx) ** 2 + (b.cz - ccz) ** 2;
      return da - db;
    });
    for (const c of arr) {
      if (performance.now() - t0 > budgetMs) return;
      world.dirtyMesh.delete(c);
      if (!c.lit || !c.generated) continue;
      const mesh = KS.meshChunk(world, c, KS.opts.smooth);
      renderer.uploadChunk(c, mesh);
    }
  }

  // 2) spiralno: gen teren (radius+1), pa svjetlo, pa mesh
  for (let r = 0; r <= radius + 1; r++) {
    for (let dcx = -r; dcx <= r; dcx++) {
      for (let dcz = -r; dcz <= r; dcz++) {
        if (Math.max(Math.abs(dcx), Math.abs(dcz)) !== r) continue;
        if (performance.now() - t0 > budgetMs) return;
        const cx = ccx + dcx, cz = ccz + dcz;
        const c = world.ensureChunk(cx, cz);
        if (!c.generated) {
          world.generateChunk(c);
          if (performance.now() - t0 > budgetMs) return;
        }
        if (r > radius) continue;

        if (!c.lit) {
          // svi susjedi moraju imati teren
          let ok = true;
          for (let nx = -1; nx <= 1 && ok; nx++) for (let nz = -1; nz <= 1 && ok; nz++) {
            const n = world.ensureChunk(cx + nx, cz + nz);
            if (!n.generated) {
              world.generateChunk(n);
              if (performance.now() - t0 > budgetMs * 1.4) return;
            }
            if (!n.generated) ok = false;
          }
          if (ok) {
            KS.light.lightChunk(world, c);
            KS.spawnPassiveInChunk(world, c);
            if (performance.now() - t0 > budgetMs) return;
          }
        }

        if (c.lit && (!c.meshed || c.dirty)) {
          // susjedi (4) moraju biti osvijetljeni radi glatkog svjetla na rubu
          let ok = true;
          for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = world.chunkAt(cx + nx, cz + nz);
            if (!n || !n.lit) { ok = false; break; }
          }
          if (ok) {
            const mesh = KS.meshChunk(world, c, KS.opts.smooth);
            renderer.uploadChunk(c, mesh);
            if (performance.now() - t0 > budgetMs) return;
          }
        }
      }
    }
  }

  // 3) izbaci daleke chunkove
  if ((game._unloadT = (game._unloadT || 0) + 1) % 120 === 0) {
    const maxD = radius + 4;
    for (const [key, c] of world.chunks) {
      if (Math.abs(c.cx - ccx) > maxD || Math.abs(c.cz - ccz) > maxD) {
        if (c.modified && world.id !== '__menu__') {
          const data = KS.bytesToB64(KS.rleEncode(c.blocks));
          if (KS.store.set('ks_w_' + world.id + '_c_' + c.cx + '_' + c.cz, data)) {
            world.savedChunkKeys.add(c.cx + ',' + c.cz);
          }
        }
        renderer.deleteChunk(c);
        world.chunks.delete(key);
        world.dirtyMesh.delete(c);
      }
    }
  }
}

function countReady (game, radius) {
  const world = game.world;
  const ccx = Math.floor(game.player.x) >> 4, ccz = Math.floor(game.player.z) >> 4;
  let total = 0, done = 0;
  for (let dcx = -radius; dcx <= radius; dcx++) for (let dcz = -radius; dcz <= radius; dcz++) {
    total++;
    const c = world.chunkAt(ccx + dcx, ccz + dcz);
    if (c && c.meshed) done++;
  }
  return done / total;
}

// ---------- glavna petlja ----------
let lastTickAt = 0;
function rafLoop (t) {
  requestAnimationFrame(rafLoop);
  tick(t);
}
// watchdog: rAF ne radi u sakrivenom tabu — petlja se nastavlja preko intervala
setInterval(() => {
  if (performance.now() - lastTickAt > 250) tick(performance.now());
}, 125);

function tick (t) {
  lastTickAt = performance.now();
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fpsShown = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  if (state === 'menu') {
    if (menuGame) {
      menuGame.now += dt;
      menuGame.world.time = (menuGame.world.time + dt / 1200) % 1;
      menuGame.panorama.yaw += dt * 0.06;
      streamChunks(menuGame, Math.floor(menuGame.panorama.x), Math.floor(menuGame.panorama.z), 4, 5);
      renderer.render(menuGame, dt);
    }
    return;
  }

  if (state === 'loading') {
    const g = KS.game;
    g.now += dt;
    streamChunks(g, Math.floor(g.player.x), Math.floor(g.player.z), Math.min(4, g.renderDist), 30);
    const prog = countReady(g, Math.min(3, g.renderDist));
    $('loading-bar').style.width = Math.round(prog * 100) + '%';
    if (prog > 0.4) $('loading-tip').textContent = KS.t('load.mesh');
    if (prog >= 1 || g.now > 25) {
      // spusti igrača na tlo ako je novi svijet
      const w = g.world, p = g.player;
      let y = KS.WH - 2;
      while (y > 1 && !w.isSolid(Math.floor(p.x), y, Math.floor(p.z))) y--;
      if (p.y < y + 1) { p.y = y + 1.01; p.spawn.y = p.y; }
      p.fallStart = p.y;
      enterGame();
    }
    return;
  }

  // ---- state === 'game' ----
  const g = KS.game;
  if (!g) return;
  g.renderDist = KS.opts.rd;

  if (!paused) {
    g.now += dt;
    const world = g.world;
    world.time = (world.time + dt / 600) % 1;

    // igrač
    const effInput = g.uiOpen || g.player.dead ? {} : input;
    g.player.update(dt, effInput, g);

    // ponavljanje desnog klika (postavljanje)
    if (input.use && !g.uiOpen && !g.player.dead && g.player.eatingT <= 0) {
      g._useT = (g._useT || 0) - dt;
      if (g._useT <= 0) { g.player.useBlock(g); g._useT = 0.24; }
    }

    // entiteti
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e.dead) { world.entities.splice(i, 1); continue; }
      e.update(world, dt, g);
    }
    // hostile spawn
    g.hostileT -= dt;
    if (g.hostileT <= 0) { g.hostileT = 2.5; KS.trySpawnHostile(world, g); }

    // peći
    for (const [key, fe] of world.blockEnts) {
      if (fe.type === 'furnace') KS.tickFurnace(world, key, fe, dt);
    }
    KS.ui.tickFurnaceUI();

    // čestice
    KS.particles.update(world, dt);

    // chunkovi
    streamChunks(g, Math.floor(g.player.x), Math.floor(g.player.z), g.renderDist, 6);

    // muzika
    KS.snd.tickMusic(dt, g.dayFactor < 0.4);

    // autosave
    g.autosaveT += dt;
    if (g.autosaveT > 30) {
      g.autosaveT = 0;
      KS.save.saveWorld(g);
    }

    KS.ui.updateHUD(g);
  }

  const res = renderer.render(g, dt) || {};
  // overlay pod vodom/lavom
  const ov = $('overlay-tint');
  if (res.underWater) { ov.style.background = 'rgba(20,60,160,0.22)'; ov.style.opacity = '1'; }
  else if (res.underLava) { ov.style.background = 'rgba(230,80,10,0.5)'; ov.style.opacity = '1'; }
  else ov.style.opacity = '0';

  KS.ui.updateDebug(g, fpsShown);

  if (screenshotFlag) {
    screenshotFlag = false;
    try {
      const url = $('glcanvas').toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kockasvijet_' + Date.now() + '.png';
      a.click();
      KS.ui.toast(KS.t('toast.screenshot'));
    } catch (e) {}
  }
}

// pokreni
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
