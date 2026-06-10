// ===== KockaSvijet — WebGL2 pomoćnici i shaderi =====
(function () {

KS.gl = null;

KS.glInit = function (canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  KS.gl = gl;
  return gl;
};

KS.makeProgram = function (gl, vsSrc, fsSrc) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Shader greška:', gl.getShaderInfoLog(sh), src);
      throw new Error('shader');
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Link greška:', gl.getProgramInfoLog(prog));
    throw new Error('link');
  }
  const uniforms = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, u: uniforms };
};

KS.makeTexture = function (gl, canvas, mips) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};

// ---------- shader za chunkove ----------
KS.SHADERS = {};

KS.SHADERS.chunkVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;      // ×256
layout(location=1) in vec2 aUV;       // atlas px ×16
layout(location=2) in float aLight;   // sky<<4 | blk
layout(location=3) in float aShade;   // ×255
layout(location=4) in vec3 aTint;     // ×255
uniform mat4 uVP;
uniform vec3 uOrigin;
out vec2 vUV;
out float vSky;
out float vBlk;
out float vShade;
out vec3 vTint;
out float vDist;
out vec3 vWorld;
void main () {
  vec3 pos = aPos / 256.0 + uOrigin;
  gl_Position = uVP * vec4(pos, 1.0);
  vUV = aUV / 16.0 / 256.0;
  float L = aLight;
  vSky = floor(L / 16.0) / 15.0;
  vBlk = mod(L, 16.0) / 15.0;
  vShade = aShade / 255.0;
  vTint = aTint / 255.0;
  vDist = length(gl_Position.xyz);
  vWorld = pos;
}`;

KS.SHADERS.chunkFS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vSky;
in float vBlk;
in float vShade;
in vec3 vTint;
in float vDist;
in vec3 vWorld;
uniform sampler2D uTex;
uniform float uDay;        // 0..1 faktor neba
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uAlpha;      // za vodu
uniform float uCutout;     // 1 = discard alpha<0.5
out vec4 fragColor;
void main () {
  vec4 tex = texture(uTex, vUV);
  if (uCutout > 0.5 && tex.a < 0.5) discard;
  float skyAmt = vSky * uDay;
  float blkAmt = vBlk;
  float l = max(skyAmt, blkAmt);
  l = l * l * 0.82 + l * 0.16 + 0.035;
  vec3 lightCol = vec3(l) ;
  // toplina bakljinog svjetla
  float warm = clamp(blkAmt - skyAmt * 0.6, 0.0, 1.0);
  lightCol *= mix(vec3(1.0), vec3(1.12, 0.95, 0.78), warm * 0.8);
  // hladnoća mjesečine
  lightCol *= mix(vec3(0.82, 0.86, 1.05), vec3(1.0), clamp(uDay + blkAmt, 0.0, 1.0));
  vec3 col = tex.rgb * vTint * vShade * lightCol;
  float fog = clamp((vDist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
  fog = fog * fog;
  col = mix(col, uFogColor, fog);
  fragColor = vec4(col, tex.a * uAlpha);
}`;

// ---------- jednostavan obojeni shader (linije, nebo, čestice, sunce) ----------
KS.SHADERS.flatVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uVP;
uniform mat4 uModel;
out vec4 vCol;
void main () {
  gl_Position = uVP * uModel * vec4(aPos, 1.0);
  vCol = aCol;
}`;
KS.SHADERS.flatFS = `#version 300 es
precision highp float;
in vec4 vCol;
uniform vec4 uColor;
out vec4 fragColor;
void main () { fragColor = vCol * uColor; }`;

// ---------- teksturisani model (entiteti, ruka, predmeti, sunce/mjesec) ----------
KS.SHADERS.modelVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aShade;
uniform mat4 uVP;
uniform mat4 uModel;
out vec2 vUV;
out float vShade;
out float vDist;
void main () {
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * wp;
  vUV = aUV;
  vShade = aShade;
  vDist = length(gl_Position.xyz);
}`;
KS.SHADERS.modelFS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vShade;
in float vDist;
uniform sampler2D uTex;
uniform float uLight;     // ukupno svjetlo 0..1
uniform vec4 uTintCol;    // npr. crveni bljesak štete
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uFogOn;
out vec4 fragColor;
void main () {
  vec4 tex = texture(uTex, vUV);
  if (tex.a < 0.1) discard;
  float l = uLight * uLight * 0.8 + uLight * 0.16 + 0.05;
  vec3 col = tex.rgb * vShade * l;
  col = mix(col, uTintCol.rgb, uTintCol.a);
  if (uFogOn > 0.5) {
    float fog = clamp((vDist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
    col = mix(col, uFogColor, fog * fog);
  }
  fragColor = vec4(col, tex.a);
}`;

})();
