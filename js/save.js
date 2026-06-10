// ===== KockaSvijet — spremanje (localStorage) =====
(function () {

const PRE = 'ks_';

KS.save = {
  // ---------- opcije i profil ----------
  loadOptions () {
    const def = {
      rd: 7, fov: 75, fog: true, clouds: true, particles: 2, smooth: true, bob: true,
      master: 0.8, music: 0.5, sfx: 1.0, sens: 0.55, invertY: false, lang: 'bs',
    };
    try {
      const raw = KS.store.get(PRE + 'opts');
      if (raw) Object.assign(def, JSON.parse(raw));
    } catch (e) {}
    return def;
  },
  saveOptions (o) { KS.store.set(PRE + 'opts', JSON.stringify(o)); },

  loadProfile () {
    const def = { charId: 'edo', name: 'Igrač' };
    try {
      const raw = KS.store.get(PRE + 'profile');
      if (raw) Object.assign(def, JSON.parse(raw));
    } catch (e) {}
    return def;
  },
  saveProfile (p) { KS.store.set(PRE + 'profile', JSON.stringify(p)); },

  // ---------- lista svjetova ----------
  listWorlds () {
    try {
      const raw = KS.store.get(PRE + 'worlds');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  },
  _saveList (list) { KS.store.set(PRE + 'worlds', JSON.stringify(list)); },

  createWorldMeta (opts) {
    const list = this.listWorlds();
    const id = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const meta = {
      id, name: opts.name, seed: opts.seed, mode: opts.mode, type: opts.type, diff: opts.diff,
      created: Date.now(), lastPlayed: Date.now(),
    };
    list.unshift(meta);
    this._saveList(list);
    return meta;
  },

  deleteWorld (id) {
    const list = this.listWorlds().filter(w => w.id !== id);
    this._saveList(list);
    for (const k of KS.store.keys(PRE + 'w_' + id)) KS.store.del(k);
  },

  // ---------- svijet ----------
  // meta+player+blockEnts u jednom ključu; chunkovi odvojeno
  saveWorld (game) {
    const world = game.world, p = game.player;
    const meta = {
      seed: world.seed, mode: world.mode, type: world.type, diff: world.diff, name: world.name,
      time: world.time,
      player: p ? {
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
        hp: p.hp, food: p.food, air: p.air, sel: p.sel,
        inv: p.inv.map(s => s ? { id: s.id, n: s.n, dur: s.dur } : null),
        spawn: p.spawn,
      } : null,
      blockEnts: [...world.blockEnts.entries()],
      savedChunks: [...world.savedChunkKeys],
    };
    let ok = KS.store.set(PRE + 'w_' + world.id, JSON.stringify(meta));

    // spremi izmijenjene chunkove
    for (const c of world.chunks.values()) {
      if (!c.generated || !c.modified) continue;
      const data = KS.bytesToB64(KS.rleEncode(c.blocks));
      if (KS.store.set(PRE + 'w_' + world.id + '_c_' + c.cx + '_' + c.cz, data)) {
        c.modified = false;
        world.savedChunkKeys.add(c.cx + ',' + c.cz);
      } else ok = false;
    }
    // ažuriraj savedChunks u meti (nakon dodavanja novih)
    meta.savedChunks = [...world.savedChunkKeys];
    KS.store.set(PRE + 'w_' + world.id, JSON.stringify(meta));

    // lastPlayed u listi
    const list = this.listWorlds();
    const entry = list.find(w => w.id === world.id);
    if (entry) { entry.lastPlayed = Date.now(); entry.name = world.name; this._saveList(list); }
    return ok;
  },

  loadWorldMeta (id) {
    try {
      const raw = KS.store.get(PRE + 'w_' + id);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  },

  loadChunkBlocks (world, chunk) {
    const raw = KS.store.get(PRE + 'w_' + world.id + '_c_' + chunk.cx + '_' + chunk.cz);
    if (!raw) return false;
    try {
      chunk.blocks = KS.rleDecode(KS.b64ToBytes(raw), KS.CH * KS.CH * KS.WH);
      return true;
    } catch (e) { return false; }
  },
};

})();
