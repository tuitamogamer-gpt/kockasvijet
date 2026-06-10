// ===== KockaSvijet — util: RNG, šum, matematika, spremište =====

KS.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
KS.clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
KS.lerp = (a, b, t) => a + (b - a) * t;
KS.mod = (a, n) => ((a % n) + n) % n;

// Mulberry32 — brz seedovani RNG
KS.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// hash više cijelih brojeva u 32-bit seed
KS.hashInts = function () {
  let h = 0x9E3779B9;
  for (let i = 0; i < arguments.length; i++) {
    let x = arguments[i] | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45D9F3B);
    x = Math.imul(x ^ (x >>> 13), 0x45D9F3B);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 0x01000193);
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D);
  h ^= h >>> 12; h = Math.imul(h, 0x297A2D39);
  h ^= h >>> 15;
  return h >>> 0;
};

KS.strToSeed = function (s) {
  s = String(s).trim();
  if (s === '') return (Math.random() * 0xFFFFFFFF) >>> 0;
  if (/^-?\d+$/.test(s)) return (parseInt(s, 10) >>> 0);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// ---------- Simplex šum (2D + 3D), seedovan ----------
KS.Simplex = function (seed) {
  const rng = KS.mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }

  const grad3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const F3 = 1 / 3, G3 = 1 / 6;

  this.noise2D = function (xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const gi0 = permMod12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };

  this.noise3D = function (xin, yin, zin) {
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) { const gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) { const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) { const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) { const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  };

  // fraktalni šum (fBm)
  this.fbm2 = (x, y, oct, lac, gain) => {
    lac = lac || 2; gain = gain || 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  };
};

// ---------- sigurno spremište (localStorage može biti blokiran na file://) ----------
KS.store = (function () {
  let ok = true, mem = {};
  try {
    const k = '__ks_test__';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
  } catch (e) { ok = false; }
  return {
    available: ok,
    get (key) {
      try { return ok ? localStorage.getItem(key) : (key in mem ? mem[key] : null); }
      catch (e) { return mem[key] !== undefined ? mem[key] : null; }
    },
    set (key, val) {
      try { if (ok) { localStorage.setItem(key, val); return true; } } catch (e) { return false; }
      mem[key] = val; return true;
    },
    del (key) {
      try { if (ok) { localStorage.removeItem(key); return; } } catch (e) {}
      delete mem[key];
    },
    keys (prefix) {
      const out = [];
      try {
        if (ok) {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!prefix || k.startsWith(prefix)) out.push(k);
          }
          return out;
        }
      } catch (e) {}
      for (const k in mem) if (!prefix || k.startsWith(prefix)) out.push(k);
      return out;
    },
  };
})();

// ---------- base64 za Uint8Array ----------
KS.bytesToB64 = function (bytes) {
  let s = '';
  const CH = 0x2000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
  }
  return btoa(s);
};
KS.b64ToBytes = function (b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

// RLE: [count u8, value u8]*  (count 1..255)
KS.rleEncode = function (arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let run = 1;
    while (run < 255 && i + run < arr.length && arr[i + run] === v) run++;
    out.push(run, v);
    i += run;
  }
  return new Uint8Array(out);
};
KS.rleDecode = function (bytes, expectedLen) {
  const out = new Uint8Array(expectedLen);
  let oi = 0;
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const run = bytes[i], v = bytes[i + 1];
    out.fill(v, oi, oi + run);
    oi += run;
  }
  return out;
};

// ---------- mat4 (column-major, kao WebGL) ----------
KS.mat4 = {
  create: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  identity (m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  perspective (m, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    m.fill(0);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
    return m;
  },
  multiply (out, a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    out.set(o); return out;
  },
  translate (out, m, x, y, z) {
    out.set(m);
    out[12] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[13] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
    out[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
    return out;
  },
  rotateX (out, m, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a4 = m[4], a5 = m[5], a6 = m[6], a7 = m[7], a8 = m[8], a9 = m[9], a10 = m[10], a11 = m[11];
    out.set(m);
    out[4] = a4 * c + a8 * s; out[5] = a5 * c + a9 * s; out[6] = a6 * c + a10 * s; out[7] = a7 * c + a11 * s;
    out[8] = a8 * c - a4 * s; out[9] = a9 * c - a5 * s; out[10] = a10 * c - a6 * s; out[11] = a11 * c - a7 * s;
    return out;
  },
  rotateY (out, m, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a0 = m[0], a1 = m[1], a2 = m[2], a3 = m[3], a8 = m[8], a9 = m[9], a10 = m[10], a11 = m[11];
    out.set(m);
    out[0] = a0 * c - a8 * s; out[1] = a1 * c - a9 * s; out[2] = a2 * c - a10 * s; out[3] = a3 * c - a11 * s;
    out[8] = a0 * s + a8 * c; out[9] = a1 * s + a9 * c; out[10] = a2 * s + a10 * c; out[11] = a3 * s + a11 * c;
    return out;
  },
  rotateZ (out, m, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a0 = m[0], a1 = m[1], a2 = m[2], a3 = m[3], a4 = m[4], a5 = m[5], a6 = m[6], a7 = m[7];
    out.set(m);
    out[0] = a0 * c + a4 * s; out[1] = a1 * c + a5 * s; out[2] = a2 * c + a6 * s; out[3] = a3 * c + a7 * s;
    out[4] = a4 * c - a0 * s; out[5] = a5 * c - a1 * s; out[6] = a6 * c - a2 * s; out[7] = a7 * c - a3 * s;
    return out;
  },
  scale (out, m, x, y, z) {
    out.set(m);
    for (let i = 0; i < 4; i++) { out[i] *= x; out[4 + i] *= y; out[8 + i] *= z; }
    return out;
  },
  clone: (m) => new Float32Array(m),
};

// frustum iz VP matrice → 6 ravni [a,b,c,d]
KS.frustumPlanes = function (vp) {
  const p = [];
  const r = (a, b, c, d) => { const l = Math.hypot(a, b, c) || 1; p.push([a / l, b / l, c / l, d / l]); };
  r(vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8], vp[15] + vp[12]);
  r(vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8], vp[15] - vp[12]);
  r(vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9], vp[15] + vp[13]);
  r(vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9], vp[15] - vp[13]);
  r(vp[3] + vp[2], vp[7] + vp[6], vp[11] + vp[10], vp[15] + vp[14]);
  r(vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14]);
  return p;
};
KS.aabbInFrustum = function (planes, minX, minY, minZ, maxX, maxY, maxZ) {
  for (let i = 0; i < 6; i++) {
    const pl = planes[i];
    const x = pl[0] > 0 ? maxX : minX;
    const y = pl[1] > 0 ? maxY : minY;
    const z = pl[2] > 0 ? maxZ : minZ;
    if (pl[0] * x + pl[1] * y + pl[2] * z + pl[3] < 0) return false;
  }
  return true;
};
