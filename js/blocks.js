// ===== KockaSvijet — blokovi, predmeti, proceduralne teksture, ikone =====
(function () {

// ---------- atlas blokova: 16×16 pločica po 16 px ----------
const TILE = 16, ATLAS_TILES = 16, ATLAS_PX = TILE * ATLAS_TILES;
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = atlasCanvas.height = ATLAS_PX;
const actx = atlasCanvas.getContext('2d', { willReadFrequently: true });

const itemCanvas = document.createElement('canvas');
itemCanvas.width = itemCanvas.height = ATLAS_PX;
const ictx = itemCanvas.getContext('2d', { willReadFrequently: true });

let nextTile = 0;
const T = {}; // imena pločica → indeks

function tileXY (t) { return [(t & 15) * TILE, (t >> 4) * TILE]; }

// pomoćnici za crtanje
function hexToRgb (h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function shade (hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${KS.clamp(r * f, 0, 255) | 0},${KS.clamp(g * f, 0, 255) | 0},${KS.clamp(b * f, 0, 255) | 0})`;
}
function px (ctx, x0, y0, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x0 + x, y0 + y, 1, 1); }

// registruj pločicu i nacrtaj je
function addTile (name, painter) {
  const t = nextTile++;
  T[name] = t;
  const [x0, y0] = tileXY(t);
  const rng = KS.mulberry32(KS.hashInts(7777, t));
  painter(actx, x0, y0, rng);
  return t;
}
function addItemTile (name, painter) {
  const t = nextTile2++;
  IT[name] = t;
  const [x0, y0] = tileXY(t);
  const rng = KS.mulberry32(KS.hashInts(8888, t));
  painter(ictx, x0, y0, rng);
  return t;
}
let nextTile2 = 0;
const IT = {};

// nasumična varijacija boje (speckle pun kvadrat)
function speckle (ctx, x0, y0, rng, colors, weights) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let r = rng(), idx = 0, acc = 0;
    for (let i = 0; i < colors.length; i++) { acc += (weights ? weights[i] : 1 / colors.length); if (r < acc) { idx = i; break; } idx = i; }
    px(ctx, x0, y0, x, y, colors[idx]);
  }
}
function vary (ctx, x0, y0, rng, base, amount) {
  const cols = [shade(base, 1), shade(base, 1 - amount), shade(base, 1 + amount), shade(base, 1 - amount * 2)];
  speckle(ctx, x0, y0, rng, cols, [0.45, 0.25, 0.18, 0.12]);
}

// ---------- pločice blokova ----------
addTile('grassTop', (c, x0, y0, rng) => {
  // sivkasto-zelena baza; boja se množi biome tintom u shaderu
  vary(c, x0, y0, rng, '#9c9c9c', 0.14);
});
addTile('dirt', (c, x0, y0, rng) => vary(c, x0, y0, rng, '#79553a', 0.16));
addTile('grassSide', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#79553a', 0.16);
  for (let x = 0; x < 16; x++) {
    const d = 2 + (rng() * 3 | 0);
    for (let y = 0; y < d; y++) px(c, x0, y0, x, y, shade('#6faa3c', 0.85 + rng() * 0.3));
  }
});
addTile('stone', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#7d7d7d', 0.1);
  for (let i = 0; i < 7; i++) { // mrlje
    const mx = rng() * 14 | 0, my = rng() * 14 | 0, f = rng() < 0.5 ? 0.88 : 1.1;
    for (let a = 0; a < 3; a++) px(c, x0, y0, mx + (rng() * 3 | 0), my + (rng() * 2 | 0), shade('#7d7d7d', f));
  }
});
addTile('cobble', (c, x0, y0, rng) => {
  c.fillStyle = '#454545'; c.fillRect(x0, y0, 16, 16);
  const stones = [[0,0,5,5],[5,0,6,4],[11,0,5,6],[0,5,4,6],[4,4,7,7],[11,6,5,5],[0,11,6,5],[6,11,5,5],[11,11,5,5]];
  for (const [sx, sy, w, h] of stones) {
    const f = 0.85 + rng() * 0.4;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      px(c, x0, y0, sx + x, sy + y, shade('#828282', f * (0.92 + rng() * 0.16)));
    }
    px(c, x0, y0, sx, sy, shade('#828282', f * 1.15));
  }
});
addTile('bedrock', (c, x0, y0, rng) => speckle(c, x0, y0, rng, ['#565656', '#2b2b2b', '#777777', '#161616'], [0.35, 0.3, 0.15, 0.2]));
addTile('sand', (c, x0, y0, rng) => vary(c, x0, y0, rng, '#dbd3a0', 0.08));
addTile('sandstoneSide', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#d8cf9d', 0.06);
  c.fillStyle = shade('#d8cf9d', 0.8);
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1);
  for (let i = 0; i < 4; i++) c.fillRect(x0 + (rng() * 12 | 0), y0 + 4 + (rng() * 8 | 0), 3, 1);
});
addTile('gravel', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#8a8075', 0.18);
  for (let i = 0; i < 10; i++) {
    const gx = rng() * 14 | 0, gy = rng() * 14 | 0, f = rng() < 0.5 ? 0.7 : 1.25;
    px(c, x0, y0, gx, gy, shade('#8a8075', f)); px(c, x0, y0, gx + 1, gy, shade('#8a8075', f * 0.95));
  }
});
addTile('water', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const w = Math.sin((x + y * 2.3) * 0.8) * 0.06;
    const f = 0.92 + w + rng() * 0.08;
    c.fillStyle = `rgba(${45 * f | 0},${95 * f | 0},${(208 * f) | 0},0.72)`;
    c.fillRect(x0 + x, y0 + y, 1, 1);
  }
});
addTile('lava', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = Math.sin(x * 0.9) * Math.cos(y * 0.7) + rng() * 0.8;
    const col = v > 0.9 ? '#ffe75c' : (v > 0.3 ? '#ff9a1f' : (v > -0.3 ? '#e2540e' : '#b32a05'));
    px(c, x0, y0, x, y, col);
  }
});
function barkPainter (base, groove, dash) {
  return (c, x0, y0, rng) => {
    vary(c, x0, y0, rng, base, 0.1);
    for (let x = 0; x < 16; x += 2 + (x % 3)) {
      for (let y = 0; y < 16; y++) if (rng() < 0.8) px(c, x0, y0, x, y, shade(groove, 0.9 + rng() * 0.2));
    }
    if (dash) for (let i = 0; i < 7; i++) {
      c.fillStyle = dash;
      c.fillRect(x0 + (rng() * 12 | 0), y0 + (rng() * 14 | 0), 2 + (rng() * 2 | 0), 1);
    }
  };
}
addTile('logSide', barkPainter('#6b5232', '#4a3820'));
addTile('logTop', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#6b5232', 0.08);
  const rings = ['#c5a86a', '#9c7f4e', '#c5a86a', '#9c7f4e', '#7a5c33'];
  for (let r = 0; r < 5; r++) {
    c.fillStyle = rings[r];
    const o = 2 + r * 1.5 | 0, s = 16 - 2 * o;
    if (s > 0) c.fillRect(x0 + o, y0 + o, s, s);
  }
});
addTile('logBirch', barkPainter('#d7d3c5', '#b9b5a6', '#2e2e28'));
addTile('logSpruce', barkPainter('#4a3520', '#33240F'));
addTile('planks', (c, x0, y0, rng) => {
  for (let row = 0; row < 4; row++) {
    const f = 0.92 + rng() * 0.16;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
      px(c, x0, y0, x, row * 4 + y, shade('#9c7f4e', f * (y === 3 ? 0.72 : (0.94 + rng() * 0.1))));
    }
    const sx = (row * 7 + 3) % 16;
    for (let y = 0; y < 3; y++) px(c, x0, y0, sx, row * 4 + y, shade('#9c7f4e', 0.68));
  }
});
addTile('planksBirch', (c, x0, y0, rng) => {
  for (let row = 0; row < 4; row++) {
    const f = 0.94 + rng() * 0.12;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
      px(c, x0, y0, x, row * 4 + y, shade('#c6b77c', f * (y === 3 ? 0.75 : (0.95 + rng() * 0.08))));
    }
  }
});
addTile('leaves', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (rng() < 0.78) px(c, x0, y0, x, y, shade('#878787', 0.75 + rng() * 0.5)); // sivo — tinta u shaderu
  }
});
addTile('leavesSpruce', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (rng() < 0.82) px(c, x0, y0, x, y, shade('#5d7d5d', 0.75 + rng() * 0.45));
  }
});
addTile('glass', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  c.fillStyle = 'rgba(225,240,245,0.95)';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1);
  c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 5; i++) px(c, x0, y0, 3 + i, 8 - i, 'rgba(255,255,255,0.8)');
  for (let i = 0; i < 4; i++) px(c, x0, y0, 8 + i, 12 - i, 'rgba(255,255,255,0.55)');
  c.fillStyle = 'rgba(190,220,235,0.18)';
  c.fillRect(x0 + 1, y0 + 1, 14, 14);
});
function orePainter (nuggetCols) {
  return (c, x0, y0, rng) => {
    // baza kamen
    vary(c, x0, y0, rng, '#7d7d7d', 0.1);
    for (let i = 0; i < 4; i++) {
      const nx = 1 + (rng() * 11 | 0), ny = 1 + (rng() * 11 | 0);
      const shapePts = [[1,0],[0,1],[1,1],[2,1],[1,2],[2,2],[0,2]].filter(() => rng() < 0.85);
      for (const [dx, dy] of shapePts) {
        px(c, x0, y0, nx + dx, ny + dy, nuggetCols[(rng() * nuggetCols.length) | 0]);
      }
    }
  };
}
addTile('coalOre', orePainter(['#1c1c1c', '#303030', '#0c0c0c']));
addTile('ironOre', orePainter(['#d8af93', '#e6c2a7', '#b58968']));
addTile('goldOre', orePainter(['#fcee4b', '#e6c52c', '#fff98e']));
addTile('diamondOre', orePainter(['#5decf2', '#33c1d6', '#aef8fb']));
function metalPainter (base) {
  return (c, x0, y0, rng) => {
    vary(c, x0, y0, rng, base, 0.04);
    c.fillStyle = shade(base, 1.25); c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0, 1, 16);
    c.fillStyle = shade(base, 0.7); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0 + 15, y0, 1, 16);
    c.fillStyle = shade(base, 1.35); c.fillRect(x0 + 2, y0 + 2, 3, 1); c.fillRect(x0 + 2, y0 + 2, 1, 3);
  };
}
addTile('ironBlock', metalPainter('#d8d8d8'));
addTile('goldBlock', metalPainter('#f3d52a'));
addTile('diamondBlock', metalPainter('#62dfe4'));
addTile('brick', (c, x0, y0, rng) => {
  c.fillStyle = '#9c9494'; c.fillRect(x0, y0, 16, 16);
  for (let row = 0; row < 4; row++) {
    const off = (row % 2) * 4;
    for (let col = -1; col < 3; col++) {
      const bx = col * 8 + off, f = 0.9 + rng() * 0.2;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) {
        const X = bx + x; if (X < 0 || X > 15) continue;
        px(c, x0, y0, X, row * 4 + y, shade('#b04a3a', f * (0.94 + rng() * 0.12)));
      }
    }
  }
});
addTile('stoneBrick', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#828282', 0.07);
  c.fillStyle = '#4f4f4f';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 8, 16, 1);
  c.fillRect(x0 + 7, y0, 1, 8); c.fillRect(x0 + 3, y0 + 8, 1, 8); c.fillRect(x0 + 11, y0 + 8, 1, 8);
  c.fillStyle = shade('#828282', 1.15);
  c.fillRect(x0, y0 + 1, 16, 1);
});
addTile('mossyCobble', (c, x0, y0, rng) => {
  // kao cobble + mahovina
  c.fillStyle = '#454545'; c.fillRect(x0, y0, 16, 16);
  const stones = [[0,0,5,5],[5,0,6,4],[11,0,5,6],[0,5,4,6],[4,4,7,7],[11,6,5,5],[0,11,6,5],[6,11,5,5],[11,11,5,5]];
  for (const [sx, sy, w, h] of stones) {
    const f = 0.85 + rng() * 0.4;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++)
      px(c, x0, y0, sx + x, sy + y, shade('#828282', f * (0.92 + rng() * 0.16)));
  }
  for (let i = 0; i < 26; i++) px(c, x0, y0, rng() * 16 | 0, rng() * 16 | 0, shade('#5e7a3a', 0.8 + rng() * 0.4));
});
addTile('obsidian', (c, x0, y0, rng) => {
  speckle(c, x0, y0, rng, ['#14121f', '#221d36', '#0a0911', '#3a3257'], [0.42, 0.3, 0.2, 0.08]);
});
addTile('snow', (c, x0, y0, rng) => vary(c, x0, y0, rng, '#f2fbfb', 0.04));
addTile('snowGrassSide', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#79553a', 0.16);
  for (let x = 0; x < 16; x++) {
    const d = 2 + (rng() * 2 | 0);
    for (let y = 0; y < d; y++) px(c, x0, y0, x, y, shade('#f2fbfb', 0.92 + rng() * 0.1));
  }
});
addTile('ice', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    c.fillStyle = `rgba(${160 + rng() * 30 | 0},${205 + rng() * 25 | 0},${245 + rng() * 10 | 0},0.92)`;
    c.fillRect(x0 + x, y0 + y, 1, 1);
  }
  c.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 4; i++) px(c, x0, y0, 3 + i * 2, 4 + i, 'rgba(255,255,255,0.75)');
});
addTile('cactusSide', (c, x0, y0, rng) => {
  for (let x = 0; x < 16; x++) {
    const rib = (x % 4 === 1);
    for (let y = 0; y < 16; y++) {
      px(c, x0, y0, x, y, shade(rib ? '#0f701c' : '#1d9930', 0.9 + rng() * 0.2));
    }
  }
  c.fillStyle = '#d8efb8';
  for (let i = 0; i < 6; i++) px(c, x0, y0, (rng() * 4 | 0) * 4 + 1, rng() * 15 | 0, '#d8efb8');
});
addTile('cactusTop', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#1d9930', 0.1);
  c.fillStyle = '#0f701c'; c.fillRect(x0 + 4, y0 + 4, 8, 8);
  c.fillStyle = '#27b03d'; c.fillRect(x0 + 6, y0 + 6, 4, 4);
});
addTile('tntSide', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#c8412f', 0.08);
  c.fillStyle = '#efe6d5'; c.fillRect(x0, y0 + 5, 16, 6);
  // slova "TNT" pikselima
  c.fillStyle = '#1a1a1a';
  // T
  c.fillRect(x0 + 1, y0 + 6, 3, 1); c.fillRect(x0 + 2, y0 + 6, 1, 4);
  // N
  c.fillRect(x0 + 6, y0 + 6, 1, 4); c.fillRect(x0 + 9, y0 + 6, 1, 4);
  px(c, x0, y0, 7, 7, '#1a1a1a'); px(c, x0, y0, 8, 8, '#1a1a1a');
  // T
  c.fillRect(x0 + 12, y0 + 6, 3, 1); c.fillRect(x0 + 13, y0 + 6, 1, 4);
});
addTile('tntTop', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#c8412f', 0.08);
  c.fillStyle = '#efe6d5'; c.fillRect(x0 + 3, y0 + 3, 10, 10);
  c.fillStyle = '#8a2a1c'; c.fillRect(x0 + 5, y0 + 5, 6, 6);
  c.fillStyle = '#1a1a1a'; c.fillRect(x0 + 7, y0 + 7, 2, 2);
});
addTile('craftTop', (c, x0, y0, rng) => {
  for (let row = 0; row < 4; row++) for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++)
    px(c, x0, y0, x, row * 4 + y, shade('#9c7f4e', (0.92 + rng() * 0.12) * (y === 3 ? 0.75 : 1)));
  c.fillStyle = '#5d4424';
  c.fillRect(x0, y0, 16, 2); c.fillRect(x0, y0 + 14, 16, 2); c.fillRect(x0, y0, 2, 16); c.fillRect(x0 + 14, y0, 2, 16);
  c.fillStyle = '#3a3a3a'; c.fillRect(x0 + 4, y0 + 4, 8, 1); c.fillRect(x0 + 4, y0 + 11, 8, 1);
  c.fillRect(x0 + 4, y0 + 4, 1, 8); c.fillRect(x0 + 11, y0 + 4, 1, 8);
});
addTile('craftSide', (c, x0, y0, rng) => {
  for (let row = 0; row < 4; row++) for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++)
    px(c, x0, y0, x, row * 4 + y, shade('#8a6d3f', (0.92 + rng() * 0.12) * (y === 3 ? 0.78 : 1)));
  // alat: pijuk i mač silueta
  c.fillStyle = '#4634217';
  c.fillStyle = '#463421';
  c.fillRect(x0 + 2, y0 + 3, 5, 5); c.fillRect(x0 + 9, y0 + 3, 5, 5);
  c.fillStyle = '#d8d8d8';
  c.fillRect(x0 + 3, y0 + 4, 3, 1); c.fillRect(x0 + 4, y0 + 4, 1, 3);
  c.fillRect(x0 + 10, y0 + 4, 1, 3); c.fillRect(x0 + 11, y0 + 5, 1, 1); c.fillRect(x0 + 12, y0 + 6, 1, 1);
  c.fillStyle = '#5d4424'; c.fillRect(x0, y0 + 14, 16, 2);
});
addTile('furnaceSide', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#6e6e6e', 0.09);
  c.fillStyle = '#3c3c3c';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
});
addTile('furnaceFront', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#6e6e6e', 0.09);
  c.fillStyle = '#3c3c3c';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
  c.fillStyle = '#1a1a1a'; c.fillRect(x0 + 4, y0 + 8, 8, 6);
  c.fillRect(x0 + 5, y0 + 6, 6, 2);
});
addTile('furnaceFrontLit', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#6e6e6e', 0.09);
  c.fillStyle = '#3c3c3c';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
  c.fillStyle = '#1a1a1a'; c.fillRect(x0 + 4, y0 + 6, 8, 8);
  c.fillStyle = '#ff8c1a'; c.fillRect(x0 + 5, y0 + 9, 6, 4);
  c.fillStyle = '#ffd75e'; c.fillRect(x0 + 6, y0 + 11, 4, 2);
  px(c, x0, y0, 6, 8, '#ffb13d'); px(c, x0, y0, 9, 7, '#ffb13d');
});
addTile('furnaceTop', (c, x0, y0, rng) => {
  vary(c, x0, y0, rng, '#7a7a7a', 0.07);
  c.fillStyle = '#4a4a4a'; c.fillRect(x0 + 2, y0 + 2, 12, 12);
  c.fillStyle = '#5e5e5e'; c.fillRect(x0 + 3, y0 + 3, 10, 10);
});
addTile('chestSide', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    px(c, x0, y0, x, y, shade('#a8743a', 0.9 + rng() * 0.18));
  c.fillStyle = '#5d4424';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
  c.fillRect(x0, y0 + 6, 16, 1);
});
addTile('chestFront', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    px(c, x0, y0, x, y, shade('#a8743a', 0.9 + rng() * 0.18));
  c.fillStyle = '#5d4424';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
  c.fillRect(x0, y0 + 6, 16, 1);
  c.fillStyle = '#c9c9c9'; c.fillRect(x0 + 7, y0 + 5, 2, 4);
  c.fillStyle = '#8a8a8a'; c.fillRect(x0 + 7, y0 + 8, 2, 1);
});
addTile('chestTop', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    px(c, x0, y0, x, y, shade('#b07c40', 0.9 + rng() * 0.15));
  c.fillStyle = '#5d4424';
  c.fillRect(x0, y0, 16, 1); c.fillRect(x0, y0 + 15, 16, 1); c.fillRect(x0, y0, 1, 16); c.fillRect(x0 + 15, y0, 1, 16);
});
addTile('torch', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  for (let y = 6; y < 16; y++) { px(c, x0, y0, 7, y, shade('#9c7f4e', 0.95)); px(c, x0, y0, 8, y, shade('#7a5c33', 0.95)); }
  c.fillStyle = '#ffdf6b'; c.fillRect(x0 + 7, y0 + 4, 2, 2);
  c.fillStyle = '#fff7c9'; c.fillRect(x0 + 7, y0 + 3, 2, 1);
  px(c, x0, y0, 7, 5, '#ff9d2e'); px(c, x0, y0, 8, 6, '#ff9d2e');
});
addTile('glowstone', (c, x0, y0, rng) => {
  speckle(c, x0, y0, rng, ['#e8c94f', '#ffeb91', '#b89035', '#fff7c9'], [0.4, 0.25, 0.25, 0.1]);
});
addTile('bookshelf', (c, x0, y0, rng) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    px(c, x0, y0, x, y, shade('#9c7f4e', 0.92 + rng() * 0.12));
  const bookCols = ['#b03a3a', '#3a6ab0', '#3ab05c', '#b08a3a', '#7c3ab0', '#d8d8d8'];
  for (let shelf = 0; shelf < 2; shelf++) {
    const sy = 2 + shelf * 7;
    c.fillStyle = '#2c2117'; c.fillRect(x0 + 1, y0 + sy, 14, 5);
    let bx = 1;
    while (bx < 14) {
      const w = 1 + (rng() * 2 | 0);
      c.fillStyle = bookCols[(rng() * bookCols.length) | 0];
      c.fillRect(x0 + bx, y0 + sy + (rng() < 0.3 ? 1 : 0), w, 5 - (rng() < 0.3 ? 1 : 0));
      bx += w + (rng() < 0.2 ? 1 : 0);
    }
  }
});
addTile('flowerRed', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  c.fillStyle = '#3f7d23';
  c.fillRect(x0 + 7, y0 + 7, 2, 9);
  px(c, x0, y0, 5, 11, '#3f7d23'); px(c, x0, y0, 6, 10, '#3f7d23');
  px(c, x0, y0, 10, 12, '#3f7d23'); px(c, x0, y0, 9, 11, '#3f7d23');
  c.fillStyle = '#d83018';
  c.fillRect(x0 + 6, y0 + 3, 4, 4);
  c.fillRect(x0 + 5, y0 + 4, 6, 2); c.fillRect(x0 + 7, y0 + 2, 2, 6);
  c.fillStyle = '#ffd23d'; c.fillRect(x0 + 7, y0 + 4, 2, 2);
});
addTile('flowerYellow', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  c.fillStyle = '#3f7d23';
  c.fillRect(x0 + 7, y0 + 8, 2, 8);
  px(c, x0, y0, 9, 11, '#3f7d23'); px(c, x0, y0, 10, 10, '#3f7d23');
  c.fillStyle = '#f0c020';
  c.fillRect(x0 + 6, y0 + 4, 4, 4); c.fillRect(x0 + 5, y0 + 5, 6, 2); c.fillRect(x0 + 7, y0 + 3, 2, 6);
  c.fillStyle = '#8a5c12'; c.fillRect(x0 + 7, y0 + 5, 2, 2);
});
addTile('tallgrass', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  for (let i = 0; i < 9; i++) {
    const bx = 1 + (rng() * 14 | 0), h = 5 + (rng() * 9 | 0), lean = rng() < 0.5 ? -1 : 1;
    for (let y = 0; y < h; y++) {
      const xx = bx + (y > h * 0.6 ? lean : 0);
      if (xx >= 0 && xx < 16) px(c, x0, y0, xx, 15 - y, shade('#909090', 0.8 + rng() * 0.4));
    }
  }
});
const WOOL_COLORS = {
  woolWhite: '#e8e8e8', woolRed: '#b03a3a', woolOrange: '#d87f33', woolYellow: '#e5e533',
  woolGreen: '#3ab05c', woolBlue: '#3a6ab0', woolPurple: '#8a3ab0', woolBlack: '#262626',
};
for (const k in WOOL_COLORS) {
  addTile(k, (c, x0, y0, rng) => {
    vary(c, x0, y0, rng, WOOL_COLORS[k], 0.07);
    c.fillStyle = shade(WOOL_COLORS[k], 0.88);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
      if ((x + y) % 8 === 0) c.fillRect(x0 + x, y0 + y, 2, 1);
      else c.fillRect(x0 + x + 2, y0 + y + 2, 2, 1);
    }
  });
}
// pukotine (10 faza)
const CRACK_BASE = nextTile;
for (let stage = 0; stage < 10; stage++) {
  addTile('crack' + stage, (c, x0, y0, rng) => {
    c.clearRect(x0, y0, 16, 16);
    c.fillStyle = 'rgba(20,16,12,0.85)';
    const lines = 2 + stage * 1.6;
    for (let l = 0; l < lines; l++) {
      let cx = 8 + (rng() * 6 - 3) | 0, cy = 8 + (rng() * 6 - 3) | 0;
      const steps = 3 + stage + (rng() * 3 | 0);
      let dx = rng() < 0.5 ? 1 : -1, dy = rng() < 0.5 ? 1 : -1;
      for (let s = 0; s < steps; s++) {
        if (cx >= 0 && cx < 16 && cy >= 0 && cy < 16) c.fillRect(x0 + cx, y0 + cy, 1, 1);
        if (rng() < 0.5) cx += dx; else cy += dy;
        if (rng() < 0.2) dx = -dx;
        if (rng() < 0.2) dy = -dy;
      }
    }
  });
}

// ---------- registar blokova ----------
const B = KS.B = {};
const blocks = KS.blocks = {};
let nextId = 1;

// def: {name, tex:{top,bot,side,front}|tile, solid, opaque, cross, liquid, light, h(ardness), tool, tier, needsTool, drop, dropN, tint(1 trava/2 lišće), group, noIcon}
function defBlock (key, def) {
  const id = nextId++;
  B[key] = id;
  def.key = key;
  def.name = def.name || key;
  if (typeof def.tex === 'number') def.tex = { top: def.tex, bot: def.tex, side: def.tex };
  if (def.tex && def.tex.front === undefined) def.tex.front = def.tex.side;
  def.solid = def.solid !== false && !def.cross && !def.liquid;
  def.opaque = def.opaque !== false && !def.cross && !def.liquid && !def.cutout;
  def.light = def.light || 0;
  def.h = def.h !== undefined ? def.h : 1;
  def.tier = def.tier || 0;
  def.drop = def.drop !== undefined ? def.drop : id;
  def.group = def.group || 'blocks';
  blocks[id] = def;
  return id;
}

defBlock('grass',      { name:'grass', tex:{ top:T.grassTop, bot:T.dirt, side:T.grassSide }, h:0.6, tool:'shovel', drop:() => B.dirt, tintTop:1, group:'nature' });
defBlock('dirt',       { name:'dirt', tex:T.dirt, h:0.5, tool:'shovel', group:'nature' });
defBlock('stone',      { name:'stone', tex:T.stone, h:1.5, tool:'pick', needsTool:true, tier:1, drop:() => B.cobble, group:'nature' });
defBlock('cobble',     { name:'cobble', tex:T.cobble, h:2, tool:'pick', needsTool:true, tier:1 });
defBlock('bedrock',    { name:'bedrock', tex:T.bedrock, h:-1, group:'nature' });
defBlock('sand',       { name:'sand', tex:T.sand, h:0.5, tool:'shovel', group:'nature' });
defBlock('sandstone',  { name:'sandstone', tex:{ top:T.sand, bot:T.sand, side:T.sandstoneSide }, h:0.8, tool:'pick', needsTool:true, tier:1 });
defBlock('gravel',     { name:'gravel', tex:T.gravel, h:0.6, tool:'shovel', group:'nature' });
defBlock('water',      { name:'water', tex:T.water, liquid:true, h:-1, drop:null, opacity:2, group:'nature', noCreative:false });
defBlock('lava',       { name:'lava', tex:T.lava, liquid:true, h:-1, drop:null, light:15, opacity:15, group:'nature' });
defBlock('log',        { name:'log', tex:{ top:T.logTop, bot:T.logTop, side:T.logSide }, h:2, tool:'axe', group:'nature' });
defBlock('logBirch',   { name:'logBirch', tex:{ top:T.logTop, bot:T.logTop, side:T.logBirch }, h:2, tool:'axe', group:'nature' });
defBlock('logSpruce',  { name:'logSpruce', tex:{ top:T.logTop, bot:T.logTop, side:T.logSpruce }, h:2, tool:'axe', group:'nature' });
defBlock('planks',     { name:'planks', tex:T.planks, h:2, tool:'axe' });
defBlock('planksBirch',{ name:'planksBirch', tex:T.planksBirch, h:2, tool:'axe' });
defBlock('leaves',     { name:'leaves', tex:T.leaves, h:0.2, cutout:true, opacity:1, tint:2, drop:'leavesDrop', group:'nature' });
defBlock('leavesSpruce',{ name:'leavesSpruce', tex:T.leavesSpruce, h:0.2, cutout:true, opacity:1, drop:'leavesDrop', group:'nature' });
defBlock('glass',      { name:'glass', tex:T.glass, h:0.3, cutout:true, drop:null });
defBlock('coalOre',    { name:'coalOre', tex:T.coalOre, h:3, tool:'pick', needsTool:true, tier:1, drop:() => KS.I.coal, group:'nature' });
defBlock('ironOre',    { name:'ironOre', tex:T.ironOre, h:3, tool:'pick', needsTool:true, tier:2, group:'nature' });
defBlock('goldOre',    { name:'goldOre', tex:T.goldOre, h:3, tool:'pick', needsTool:true, tier:3, group:'nature' });
defBlock('diamondOre', { name:'diamondOre', tex:T.diamondOre, h:3, tool:'pick', needsTool:true, tier:3, drop:() => KS.I.diamond, group:'nature' });
defBlock('ironBlock',  { name:'ironBlock', tex:T.ironBlock, h:5, tool:'pick', needsTool:true, tier:2 });
defBlock('goldBlock',  { name:'goldBlock', tex:T.goldBlock, h:5, tool:'pick', needsTool:true, tier:3 });
defBlock('diamondBlock',{ name:'diamondBlock', tex:T.diamondBlock, h:5, tool:'pick', needsTool:true, tier:3 });
defBlock('brick',      { name:'brick', tex:T.brick, h:2, tool:'pick', needsTool:true, tier:1 });
defBlock('stoneBrick', { name:'stoneBrick', tex:T.stoneBrick, h:1.5, tool:'pick', needsTool:true, tier:1 });
defBlock('mossyCobble',{ name:'mossyCobble', tex:T.mossyCobble, h:2, tool:'pick', needsTool:true, tier:1 });
defBlock('obsidian',   { name:'obsidian', tex:T.obsidian, h:50, tool:'pick', needsTool:true, tier:4 });
defBlock('snowGrass',  { name:'snowGrass', tex:{ top:T.snow, bot:T.dirt, side:T.snowGrassSide }, h:0.6, tool:'shovel', drop:() => B.dirt, group:'nature' });
defBlock('snow',       { name:'snow', tex:T.snow, h:0.2, tool:'shovel', group:'nature' });
defBlock('ice',        { name:'ice', tex:T.ice, h:0.5, tool:'pick', drop:null, slippery:true, group:'nature' });
defBlock('cactus',     { name:'cactus', tex:{ top:T.cactusTop, bot:T.cactusTop, side:T.cactusSide }, h:0.4, hurts:1, group:'nature' });
defBlock('tnt',        { name:'tnt', tex:{ top:T.tntTop, bot:T.tntTop, side:T.tntSide }, h:0.05, interact:'tnt' });
defBlock('craftTable', { name:'craftTable', tex:{ top:T.craftTop, bot:T.planks, side:T.craftSide }, h:2.5, tool:'axe', interact:'craft' });
defBlock('furnace',    { name:'furnace', tex:{ top:T.furnaceTop, bot:T.furnaceTop, side:T.furnaceSide, front:T.furnaceFront }, h:3.5, tool:'pick', needsTool:true, tier:1, interact:'furnace' });
defBlock('furnaceLit', { name:'furnace', tex:{ top:T.furnaceTop, bot:T.furnaceTop, side:T.furnaceSide, front:T.furnaceFrontLit }, h:3.5, tool:'pick', needsTool:true, tier:1, light:13, drop:() => B.furnace, interact:'furnace', noCreative:true });
defBlock('chest',      { name:'chest', tex:{ top:T.chestTop, bot:T.chestTop, side:T.chestSide, front:T.chestFront }, h:2.5, tool:'axe', interact:'chest' });
defBlock('torch',      { name:'torch', tex:T.torch, cross:true, h:0.05, light:14, needsSupport:true });
defBlock('glowstone',  { name:'glowstone', tex:T.glowstone, h:0.3, light:15 });
defBlock('bookshelf',  { name:'bookshelf', tex:{ top:T.planks, bot:T.planks, side:T.bookshelf }, h:1.5, tool:'axe' });
defBlock('flowerRed',  { name:'flowerRed', tex:T.flowerRed, cross:true, h:0.01, needsSoil:true, group:'nature' });
defBlock('flowerYellow',{ name:'flowerYellow', tex:T.flowerYellow, cross:true, h:0.01, needsSoil:true, group:'nature' });
defBlock('tallgrass',  { name:'tallgrass', tex:T.tallgrass, cross:true, h:0.01, tint:1, drop:null, needsSoil:true, group:'nature' });
for (const k in WOOL_COLORS) defBlock(k, { name:k, tex:T[k], h:0.8 });

KS.CRACK_BASE = CRACK_BASE;
KS.T = T;

// ---------- predmeti ----------
const I = KS.I = {};
const items = KS.items = {};
let nextItemId = 100;

// def: {name, tex(tile u item atlasu), tool:{type,power,speed,dmg,dur}, food, fuel, smeltsTo, group}
function defItem (key, def) {
  const id = nextItemId++;
  I[key] = id;
  def.key = key; def.name = def.name || key;
  def.maxStack = def.tool ? 1 : 64;
  def.group = def.group || 'food';
  items[id] = def;
  return id;
}

// pikselart alata: oblik + paleta po materijalu
const TIERS = {
  wood:    { power:1, speed:2,  dur:60,   dmgS:4, dmg:2, cols:['#9c7f4e', '#7a5c33', '#bfa05e'] },
  stone:   { power:2, speed:4,  dur:132,  dmgS:5, dmg:3, cols:['#8a8a8a', '#5e5e5e', '#b0b0b0'] },
  iron:    { power:3, speed:6,  dur:251,  dmgS:6, dmg:4, cols:['#d8d8d8', '#9a9a9a', '#ffffff'] },
  gold:    { power:1, speed:12, dur:33,   dmgS:4, dmg:2, cols:['#f3d52a', '#c0a118', '#fff39a'] },
  diamond: { power:4, speed:8,  dur:1562, dmgS:7, dmg:5, cols:['#62dfe4', '#37a8b2', '#bdf6f8'] },
};
const HANDLE = ['#9c7f4e', '#6b5232'];

function toolPainter (type, tier) {
  const [main, dark, light] = TIERS[tier].cols;
  return (c, x0, y0) => {
    c.clearRect(x0, y0, 16, 16);
    const H = (x, y) => { px(c, x0, y0, x, y, HANDLE[0]); px(c, x0, y0, x + 1, y + 1, HANDLE[1]); };
    if (type === 'sword') {
      for (let i = 0; i < 3; i++) H(2 + i, 12 - i);
      px(c, x0, y0, 5, 8, dark); px(c, x0, y0, 6, 9, dark); px(c, x0, y0, 4, 9, dark); px(c, x0, y0, 5, 10, dark);
      for (let i = 0; i < 7; i++) {
        px(c, x0, y0, 6 + i, 8 - i, main); px(c, x0, y0, 7 + i, 8 - i, light);
        px(c, x0, y0, 7 + i, 9 - i, dark);
      }
      px(c, x0, y0, 13, 1, light);
    } else if (type === 'pick') {
      for (let i = 0; i < 8; i++) H(3 + i, 12 - i);
      const head = [[3,4],[4,3],[5,2],[6,2],[7,2],[8,2],[9,2],[10,3],[11,4],[12,5],[12,6],[3,5],[2,6],[2,7]];
      for (const [hx, hy] of head) { px(c, x0, y0, hx, hy, main); px(c, x0, y0, hx, hy + 1, dark); }
      px(c, x0, y0, 6, 1, light); px(c, x0, y0, 7, 1, light);
    } else if (type === 'axe') {
      for (let i = 0; i < 8; i++) H(3 + i, 12 - i);
      for (let yy = 1; yy < 7; yy++) for (let xx = 7; xx < 13; xx++) {
        if ((xx - 7) + yy < 8 && !(yy > 4 && xx > 10)) px(c, x0, y0, xx, yy, (xx === 7 || yy === 1) ? light : ((xx + yy) > 13 ? dark : main));
      }
      px(c, x0, y0, 6, 2, main); px(c, x0, y0, 6, 3, dark);
    } else if (type === 'shovel') {
      for (let i = 0; i < 9; i++) H(2 + i, 13 - i);
      for (let yy = 1; yy < 6; yy++) for (let xx = 10; xx < 15; xx++) {
        if (Math.abs((xx - 12)) + Math.abs(yy - 3) < 4) px(c, x0, y0, xx, yy, yy < 3 ? light : (yy > 3 ? dark : main));
      }
    }
  };
}

const toolTypes = [['sword', 'dmgS'], ['pick', 'dmg'], ['axe', 'dmg'], ['shovel', 'dmg']];
for (const [type, dmgKey] of toolTypes) {
  for (const tier of ['Wood', 'Stone', 'Iron', 'Gold', 'Diamond']) {
    const tk = tier.toLowerCase();
    const tile = addItemTile(type + tier, toolPainter(type, tk));
    defItem(type + tier, {
      name: type + tier, tex: tile, group: 'tools',
      tool: { type: type === 'sword' ? 'sword' : type, power: TIERS[tk].power, speed: TIERS[tk].speed, dmg: TIERS[tk][dmgKey], dur: TIERS[tk].dur },
      fuel: tk === 'wood' ? 5 : 0,
    });
  }
}

addItemTile('stick', (c, x0, y0) => {
  c.clearRect(x0, y0, 16, 16);
  for (let i = 0; i < 9; i++) { px(c, x0, y0, 3 + i, 12 - i, '#9c7f4e'); px(c, x0, y0, 4 + i, 12 - i, '#6b5232'); }
});
addItemTile('coal', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) {
    if (Math.hypot(x - 8, y - 8.5) < 4.6 + rng()) px(c, x0, y0, x, y, ['#1c1c1c', '#2e2e2e', '#0c0c0c'][(rng() * 3) | 0]);
  }
  px(c, x0, y0, 6, 6, '#4e4e4e'); px(c, x0, y0, 7, 6, '#5e5e5e');
});
function ingotPainter (main, dark, light) {
  return (c, x0, y0) => {
    c.clearRect(x0, y0, 16, 16);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) px(c, x0, y0, 3 + x - (y > 1 ? 1 : 0), 6 + y, y === 0 ? light : (y === 3 ? dark : main));
    for (let x = 0; x < 8; x++) px(c, x0, y0, 4 + x, 5, main);
    px(c, x0, y0, 4, 6, light); px(c, x0, y0, 5, 6, light);
  };
}
addItemTile('ironIngot', ingotPainter('#d8d8d8', '#8e8e8e', '#ffffff'));
addItemTile('goldIngot', ingotPainter('#f3d52a', '#b8960f', '#fff39a'));
addItemTile('diamond', (c, x0, y0) => {
  c.clearRect(x0, y0, 16, 16);
  const pts = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
    if (Math.abs(x - 7.5) <= (y < 3 ? 3 + y : 9 - y) + 0.5) pts.push([x, y + 3]);
  }
  for (const [X, Y] of pts) px(c, x0, y0, X, Y, '#5decf2');
  px(c, x0, y0, 5, 4, '#d9fdff'); px(c, x0, y0, 6, 5, '#d9fdff'); px(c, x0, y0, 6, 4, '#ffffff');
  px(c, x0, y0, 10, 8, '#2a9aa8'); px(c, x0, y0, 9, 9, '#2a9aa8'); px(c, x0, y0, 8, 10, '#2a9aa8');
});
addItemTile('apple', (c, x0, y0) => {
  c.clearRect(x0, y0, 16, 16);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 10; x++) {
    if (Math.hypot(x - 4.5, y - 4) < 4.8) px(c, x0, y0, 3 + x, 5 + y, y < 2 ? '#e04b3c' : (x < 3 ? '#c22d1e' : '#e04b3c'));
  }
  px(c, x0, y0, 7, 3, '#6b5232'); px(c, x0, y0, 7, 4, '#6b5232');
  px(c, x0, y0, 8, 2, '#3f7d23'); px(c, x0, y0, 9, 2, '#3f7d23'); px(c, x0, y0, 9, 3, '#3f7d23');
  px(c, x0, y0, 5, 7, '#ff8a7a');
});
function meatPainter (raw, mid, edge) {
  return (c, x0, y0, rng) => {
    c.clearRect(x0, y0, 16, 16);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 11; x++) {
      if (Math.hypot((x - 5) * 0.8, y - 3.5) < 4.2) {
        px(c, x0, y0, 3 + x, 4 + y, (x < 2 || y < 1) ? edge : ((x + y) % 4 === 0 ? mid : raw));
      }
    }
  };
}
addItemTile('porkRaw', meatPainter('#f0a0a8', '#e87f8a', '#f8c8cc'));
addItemTile('porkCooked', meatPainter('#b5764a', '#9a5d34', '#d8a06a'));
addItemTile('beefRaw', meatPainter('#c4453f', '#a82e28', '#e87f7a'));
addItemTile('beefCooked', meatPainter('#7a4a2e', '#5e3620', '#9a6a44'));
addItemTile('flesh', (c, x0, y0, rng) => {
  c.clearRect(x0, y0, 16, 16);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) {
    if (rng() < 0.85 && Math.hypot((x - 5) * 0.9, y - 4) < 4.4)
      px(c, x0, y0, 3 + x, 4 + y, ['#a85e3c', '#7d9a4a', '#8a4a2e'][(rng() * 3) | 0]);
  }
});

defItem('stick',      { name:'stick', tex:IT.stick, group:'tools', fuel:2.5 });
defItem('coal',       { name:'coal', tex:IT.coal, group:'tools', fuel:40 });
defItem('ironIngot',  { name:'ironIngot', tex:IT.ironIngot, group:'tools' });
defItem('goldIngot',  { name:'goldIngot', tex:IT.goldIngot, group:'tools' });
defItem('diamond',    { name:'diamond', tex:IT.diamond, group:'tools' });
defItem('apple',      { name:'apple', tex:IT.apple, food:4 });
defItem('porkRaw',    { name:'porkRaw', tex:IT.porkRaw, food:3, smeltsTo:'porkCooked' });
defItem('porkCooked', { name:'porkCooked', tex:IT.porkCooked, food:8 });
defItem('beefRaw',    { name:'beefRaw', tex:IT.beefRaw, food:3, smeltsTo:'beefCooked' });
defItem('beefCooked', { name:'beefCooked', tex:IT.beefCooked, food:8 });
defItem('flesh',      { name:'flesh', tex:IT.flesh, food:2 });

// gorivo na blokovima
blocks[B.planks].fuel = 15; blocks[B.planksBirch].fuel = 15;
blocks[B.log].fuel = 15; blocks[B.logBirch].fuel = 15; blocks[B.logSpruce].fuel = 15;
blocks[B.craftTable].fuel = 15; blocks[B.chest].fuel = 15; blocks[B.bookshelf].fuel = 15;
// topljenje blokova
blocks[B.sand].smeltsTo = 'glass';
blocks[B.cobble].smeltsTo = 'stone';
blocks[B.ironOre].smeltsTo = 'ironIngot';
blocks[B.goldOre].smeltsTo = 'goldIngot';
blocks[B.log].smeltsTo = 'coal'; blocks[B.logBirch].smeltsTo = 'coal'; blocks[B.logSpruce].smeltsTo = 'coal';

// drop lišća
KS.leavesDrop = function (rng) {
  const r = rng ? rng() : Math.random();
  if (r < 0.05) return { id: I.apple, n: 1 };
  if (r < 0.15) return { id: I.stick, n: 1 };
  return null;
};

// ---------- info helperi ----------
KS.isBlockId = id => id < 100;
KS.defOf = id => KS.isBlockId(id) ? blocks[id] : items[id];
KS.displayName = id => { const d = KS.defOf(id); return d ? KS.tName(d.name) : '?'; };
KS.maxStackOf = id => KS.isBlockId(id) ? 64 : (items[id].maxStack || 64);

// vrijeme razbijanja u sekundama; vraća i može li ispasti drop
KS.breakInfo = function (blockId, heldId) {
  const b = blocks[blockId];
  if (!b || b.h < 0) return { time: Infinity, canHarvest: false };
  const tool = (heldId && !KS.isBlockId(heldId) && items[heldId].tool) ? items[heldId].tool : null;
  const classMatch = tool && tool.type === b.tool;
  const canHarvest = !b.needsTool || (classMatch && tool.power >= b.tier);
  let time;
  if (classMatch) time = b.h * 1.5 / tool.speed;
  else time = b.needsTool ? b.h * 5 : b.h * 1.5;
  return { time: Math.max(0.05, time), canHarvest };
};

// ---------- GL podaci ----------
KS.atlas = {
  canvas: atlasCanvas, px: ATLAS_PX, tile: TILE,
  // [u0,v0] u pikselima za pločicu t
  uv (t) { return [(t & 15) * TILE, (t >> 4) * TILE]; },
};
KS.itemAtlas = { canvas: itemCanvas, px: ATLAS_PX, tile: TILE, uv (t) { return [(t & 15) * TILE, (t >> 4) * TILE]; } };

// ---------- ikone (dataURL za DOM + iso prikaz blokova) ----------
const iconCache = {};
function drawIsoIcon (def) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const srcData = (tile) => {
    const [sx, sy] = KS.atlas.uv(tile);
    return actx.getImageData(sx, sy, 16, 16).data;
  };
  const top = srcData(def.tex.top), side = srcData(def.tex.front !== undefined ? def.tex.front : def.tex.side), side2 = srcData(def.tex.side);
  const put = (data, fx, fy, ux, uy, vx, vy, sh, tint) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const o = (j * 16 + i) * 4;
      const a = data[o + 3]; if (a < 40) continue;
      let r = data[o] * sh, g = data[o + 1] * sh, b = data[o + 2] * sh;
      if (tint) { r *= tint[0]; g *= tint[1]; b *= tint[2]; }
      c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      c.fillRect(fx + i * ux + j * vx, fy + i * uy + j * vy, 1.3, 1.3);
    }
  };
  const topTint = def.tintTop || def.tint === 1 ? [0.55, 0.85, 0.35] : (def.tint === 2 ? [0.4, 0.75, 0.25] : null);
  // gornja strana (dijamant), pa lijeva i desna
  put(top, 2, 8.5, 0.875, -0.4375, 0.875, 0.4375, 1.0, topTint);
  put(side, 2, 9, 0, 0.875, 0.875, 0.4375, 0.62, def.tint === 2 ? topTint : null);
  put(side2, 16, 16, 0, 0.875, 0.875, -0.4375, 0.8, def.tint === 2 ? topTint : null);
  return cv.toDataURL();
}
function drawFlatIcon (ctx2, tile, tint) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const [sx, sy] = KS.atlas.uv(tile);
  c.drawImage(ctx2 === actx ? atlasCanvas : itemCanvas, sx, sy, 16, 16, 0, 0, 32, 32);
  if (tint) {
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint;
    c.fillRect(0, 0, 32, 32);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(ctx2 === actx ? atlasCanvas : itemCanvas, sx, sy, 16, 16, 0, 0, 32, 32);
  }
  return cv.toDataURL();
}
KS.iconURL = function (id) {
  if (iconCache[id]) return iconCache[id];
  let url;
  if (KS.isBlockId(id)) {
    const def = blocks[id];
    if (def.cross) url = drawFlatIcon(actx, def.tex.side, def.tint === 1 ? 'rgb(120,200,80)' : null);
    else url = drawIsoIcon(def);
  } else {
    url = drawFlatIcon(ictx, items[id].tex);
  }
  iconCache[id] = url;
  return url;
};

// liste za kreativni inventar
KS.creativeTabs = function () {
  const tabs = { blocks: [], nature: [], tools: [], food: [] };
  for (const idS in blocks) {
    const id = +idS, d = blocks[id];
    if (d.noCreative) continue;
    (tabs[d.group] || tabs.blocks).push(id);
  }
  for (const idS in items) {
    const id = +idS, d = items[id];
    (tabs[d.group] || tabs.food).push(id);
  }
  return tabs;
};

})();
