// GLSL for the living index. Everything visible on the page is generated here
// or by CPU code streamed in every frame: no meshes, no textures, no baked
// assets. WebGL2 / GLSL ES 3.00.

export const MAX_CORES = 6;
export const MAX_LEAVES = 24;

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

// Shared field description. Agents belong to one of four species; the first
// three are hosted by the core whose archetype owns that species.
const FIELD = /* glsl */ `
#define MAXC ${MAX_CORES}
#define MAXL ${MAX_LEAVES}
uniform vec4 uCores[MAXC];    // xyz, open
uniform int uCoreCount;
uniform vec3 uSlots;          // core index hosting embers / swarm / packets (-1: none)
uniform vec4 uLeaves[MAXL];   // xyz, owning core index
uniform int uLeafCount;
uniform vec3 uBoost;          // momentary energy per species
uniform float uTime;

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float tri(float x) { return 1. - abs(fract(x) * 2. - 1.); }

int speciesOf(float seed) { return seed < .2 ? 0 : seed < .55 ? 1 : seed < .8 ? 2 : 3; }
int hostOf(int sp) {
  int c = sp == 0 ? int(uSlots.x) : sp == 1 ? int(uSlots.y) : sp == 2 ? int(uSlots.z) : -1;
  return c >= 0 && c < uCoreCount ? c : -1;
}

// ROYGBIV, red (0) -> violet (1). Linear-light values for the HDR buffer.
vec3 spectrum(float x) {
  vec3 c[7] = vec3[7](
    vec3(1., .07, .14), vec3(1., .38, .03), vec3(1., .85, .10), vec3(.12, 1., .30),
    vec3(.06, .55, 1.), vec3(.22, .16, 1.), vec3(.66, .14, 1.)
  );
  float s = clamp(x, 0., 1.) * 6.;
  int i = int(min(floor(s), 5.));
  float f = s - float(i);
  return mix(c[i], c[i + 1], f * f * (3. - 2. * f));
}
`;

// Simplex noise with analytic gradient (Ashima / Gustavson) -> curl field.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 mod289(vec4 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 permute(vec4 x) { return mod289(((x * 34.) + 10.) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - .85373472095314 * r; }

float snoise(vec3 v, out vec3 grad) {
  const vec2 C = vec2(1. / 6., 1. / 3.);
  const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1. - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7. * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2. + 1.;
  vec4 s1 = floor(b1) * 2. + 1.;
  vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
  vec4 temp = m2 * m * pdotx;
  grad = -8. * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  grad += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  grad *= 42.;
  return 42. * dot(m4, pdotx);
}

vec3 curl(vec3 p) {
  vec3 gx, gy, gz;
  snoise(p, gx);
  snoise(p + vec3(31.416, -47.853, 12.793), gy);
  snoise(p + vec3(-233.145, -113.408, -185.31), gz);
  return vec3(gz.y - gy.z, gx.z - gz.x, gy.x - gx.y);
}
`;

export const FULLSCREEN_VS = HEADER + /* glsl */ `
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}
`;

// ---------------------------------------------------------------- simulation
export const SIM_FS = HEADER + FIELD + NOISE + /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;
uniform vec3 uRayO;
uniform vec3 uRayD;
uniform vec3 uFocus;
uniform float uStir;
uniform float uPress;
uniform vec4 uShock;     // xyz centre, w age (< 0: none)
uniform vec4 uMigrate;   // from core, to core, fraction, active
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

int pickLeaf(int c, float r) {
  int count = 0;
  for (int i = 0; i < MAXL; i++) { if (i >= uLeafCount) break; if (int(uLeaves[i].w + .5) == c) count++; }
  if (count == 0) return -1;
  int want = int(min(floor(r * float(count)), float(count - 1)));
  for (int i = 0; i < MAXL; i++) {
    if (i >= uLeafCount) break;
    if (int(uLeaves[i].w + .5) == c) { if (want == 0) return i; want--; }
  }
  return -1;
}

void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, ij, 0);
  vec4 V = texelFetch(uVel, ij, 0);
  vec3 p = P.xyz;
  vec3 v = V.xyz;
  float seed = P.w;
  float life = V.w;
  float t = uTime;
  int sp = speciesOf(seed);
  int c = hostOf(sp);
  if (sp < 3 && c < 0) sp = 3;
  float h1 = fract(seed * 91.71), h2 = fract(seed * 47.13), h3 = fract(seed * 13.37);
  vec3 C = vec3(0.);
  float open = 0.;
  if (sp < 3) { C = uCores[c].xyz; open = uCores[c].w; }
  vec3 acc = vec3(0.);
  float decay = .03;

  if (sp == 0) {
    // embers: buoyant, turbulent, short-lived
    acc.y += 2.1 + 2.6 * uBoost.x;
    acc += curl(p * 1.25 + vec3(0., -t * .9, t * .2)) * (1.7 + 1.3 * uBoost.x);
    acc.xz += (C.xz - p.xz) * (1.5 - .7 * open);
    decay = (.42 + .6 * h1) * (1. + .5 * uBoost.x);
  } else if (sp == 1) {
    // swarm: orbits its cell, visits leaves when open, migrates on cue
    vec3 T = C;
    float R = .8 + .45 * h2;
    bool mig = uMigrate.w > .5 && int(uMigrate.x + .5) == c && h3 < uMigrate.z;
    if (mig) {
      T = uCores[int(uMigrate.y + .5)].xyz;
      R = .45 + .5 * h2;
    } else if (open > .3 && h3 < open * .55) {
      float ep = floor((t + h2 * 20.) / (5. + h1 * 6.));
      int li = pickLeaf(c, hash11(seed * 3.3 + ep * .618));
      if (li >= 0) { T = uLeaves[li].xyz; R = .1 + .22 * h2; }
    }
    vec3 to = T - p;
    float d = length(to) + 1e-4;
    vec3 dir = to / d;
    acc += dir * clamp(d - R, -1.5, 3.) * 2.5;
    vec3 ax = normalize(vec3(sin(h1 * 6.3), 1.3, cos(h2 * 6.3)));
    acc += cross(ax, dir) * (2. + 1.6 * h2) * (1. - smoothstep(.1, 1.6, d));
    acc += curl(p * .7 + vec3(t * .06, 0., -t * .05)) * (.55 + .9 * smoothstep(.4, 2., d)) * (1. + uBoost.y);
    decay = .03 + .05 * h1;
  } else if (sp == 2) {
    // packets: axis-locked travel between box faces and terminals
    float ep = floor((t + h2 * 7.) / (1.4 + h1 * 2.));
    float r = hash11(seed * 7.7 + ep * 1.31);
    int li = -1;
    if (open > .3 && r < open * .7) li = pickLeaf(c, fract(r * 7.13));
    vec3 T;
    if (li >= 0) T = uLeaves[li].xyz;
    else {
      vec3 hb = vec3(hash11(seed + ep * 3.1), hash11(seed * 2.3 + ep * 5.7), hash11(seed * 4.1 + ep * 1.9)) * 2. - 1.;
      float f = floor(r * 3.);
      if (f < .5) hb.x = sign(hb.x); else if (f < 1.5) hb.y = sign(hb.y); else hb.z = sign(hb.z);
      T = C + hb * vec3(1.15, .85, 1.15);
    }
    vec3 to = T - p;
    vec3 ad = abs(to);
    vec3 ax = ad.x > ad.y && ad.x > ad.z ? vec3(sign(to.x), 0., 0.) : (ad.y > ad.z ? vec3(0., sign(to.y), 0.) : vec3(0., 0., sign(to.z)));
    float spd = (1.6 + 1.4 * h1) * (1. + 1.3 * uBoost.z) * min(1., length(to) * 2.5);
    acc += (ax * spd - v) * 11.;
    decay = .05 + .05 * h1;
  } else {
    // dust: slow atmospheric drift through the whole scene
    acc += curl(p * .2 + vec3(0., t * .02, 0.)) * .4;
    acc -= p * .012;
    acc.y -= p.y * .03;
    decay = .02 + .02 * h1;
  }

  // pointer: a vortex tube along the view ray
  vec3 onRay = uRayO + uRayD * max(dot(p - uRayO, uRayD), 0.);
  vec3 off = p - onRay;
  float od = length(off) + 1e-4;
  float fall = exp(-od * od * 1.6);
  acc += (cross(uRayD, off / od) * 7. + off / od * 2.5) * fall * uStir;
  // held pointer: gravity well
  vec3 tf = uFocus - p;
  float fd = length(tf) + 1e-4;
  acc += tf / fd * min(fd, 3.) * 4.5 * uPress;
  acc += cross(uRayD, tf / fd) * 3. * uPress * exp(-fd * .5);
  // click: spherical shock front
  if (uShock.w >= 0.) {
    vec3 sp3 = p - uShock.xyz;
    float sr = length(sp3) + 1e-4;
    acc += sp3 / sr * 24. * exp(-pow((sr - uShock.w * 5.) * 2.5, 2.)) * exp(-uShock.w * 1.6);
  }

  v = v * pow(.955, uDt * 60.) + acc * uDt;
  float speed = length(v);
  if (speed > 9.) v *= 9. / speed;
  p += v * uDt;
  life -= uDt * decay;

  if (life <= 0. || dot(p, p) > 160.) {
    vec3 h = hash33(vec3(gl_FragCoord.xy, uTime * 61.7));
    vec3 rd = normalize(h * 2. - 1. + 1e-4);
    if (sp == 0) {
      float ang = h.x * 6.2832;
      float rr = .08 + .32 * h.y;
      p = C + vec3(cos(ang) * rr, -.1 + .15 * h.z, sin(ang) * rr);
      v = vec3((h.y - .5) * .4, .5 + h.z * .8, (h.x - .5) * .4);
    } else if (sp == 1) {
      p = C + rd * (.9 + .5 * h.x);
      v = rd * .3;
    } else if (sp == 2) {
      p = C + (h * 2. - 1.) * .45;
      v = vec3(0.);
    } else {
      p = rd * (2. + 5.5 * h.x) * vec3(1., .55, 1.);
      v = vec3(0.);
    }
    life = 1.;
  }
  oPos = vec4(p, seed);
  oVel = vec4(v, life);
}
`;

// ----------------------------------------------------------------- particles
export const PARTICLE_VS = HEADER + FIELD + /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform int uSize;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uLines;
uniform float uPx;
uniform float uIntensity;
uniform float uCoreHue[MAXC];
out vec3 vColor;
out float vAlpha;

void main() {
  int id = uLines > .5 ? gl_VertexID / 2 : gl_VertexID;
  int end = uLines > .5 ? gl_VertexID - id * 2 : 1;
  ivec2 uv = ivec2(id % uSize, id / uSize);
  vec4 P = texelFetch(uPos, uv, 0);
  vec4 V = texelFetch(uVel, uv, 0);
  float seed = P.w;
  float speed = length(V.xyz);
  float life = V.w;
  int sp = speciesOf(seed);
  int c = hostOf(sp);
  if (sp < 3 && c < 0) sp = 3;
  float h1 = fract(seed * 91.71);
  float streakLen = sp == 0 ? .05 : sp == 1 ? .06 : sp == 2 ? .1 : 0.;
  vec3 p = P.xyz;
  if (end == 0) p -= V.xyz * streakLen;

  vec3 col;
  float bright;
  float size;
  float fade = (1. - smoothstep(.93, 1., life)) * smoothstep(0., .12, life);
  if (sp == 0) {
    float age = 1. - life;
    col = mix(vec3(1., .9, .72) * 1.5, spectrum(mix(.22, 0., smoothstep(.05, .85, age))), smoothstep(0., .3, age));
    bright = pow(max(life, 0.), 1.4) * (.38 + .5 * uBoost.x);
    size = .014 + .02 * life;
    fade = smoothstep(0., .25, life) * (1. - smoothstep(.97, 1., life));
  } else if (sp == 1) {
    col = spectrum(.32 + .26 * fract(h1 + speed * .05));
    bright = .7 + .4 * uCores[c].w;
    size = .011;
  } else if (sp == 2) {
    col = mix(spectrum(.64 + .36 * h1), vec3(1.), smoothstep(2., 4., speed) * .35);
    bright = 1.1 + uBoost.z;
    size = .009;
  } else {
    int nc = 0;
    float best = 1e9;
    for (int i = 0; i < MAXC; i++) {
      if (i >= uCoreCount) break;
      float d = distance(P.xyz, uCores[i].xyz);
      if (d < best) { best = d; nc = i; }
    }
    col = mix(vec3(.5), spectrum(uCoreHue[nc]), .6);
    bright = .28;
    size = .045;
  }

  vec4 mv = uView * vec4(p, 1.);
  float depth = max(-mv.z, .1);
  gl_Position = uProj * mv;
  gl_PointSize = clamp(uPx * size * (.7 + .6 * fract(seed * 31.7)) / depth, 1., 14.);
  float fog = exp(-max(depth - 12., 0.) * .12);
  float lineMul = uLines > .5 ? (sp == 3 ? 0. : (.35 + .65 * smoothstep(.4, 4., speed)) * float(end)) : 1.;
  vColor = col;
  vAlpha = uIntensity * bright * fade * fog * lineMul;
}
`;

export const PARTICLE_FS = HEADER + /* glsl */ `
uniform float uLines;
in vec3 vColor;
in float vAlpha;
out vec4 o;
void main() {
  float a = vAlpha;
  if (uLines < .5) a *= 1. - smoothstep(0., .5, length(gl_PointCoord - .5));
  o = vec4(vColor * a, 1.);
}
`;

// ------------------------------------------------------------------- strokes
// Anti-aliased screen-space-width segments, expanded from instanced quads.
export const STROKE_VS = HEADER + /* glsl */ `
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in vec3 aCol;
layout(location = 3) in vec2 aAlpha;
layout(location = 4) in vec2 aWidth;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec2 uRes;
uniform float uPxScale;
out vec3 vColor;
out float vAlpha;
out float vSide;
const vec2 Q[6] = vec2[6](vec2(0., -1.), vec2(1., -1.), vec2(1., 1.), vec2(0., -1.), vec2(1., 1.), vec2(0., 1.));
void main() {
  vec2 q = Q[gl_VertexID];
  vec4 ca = uProj * uView * vec4(aA, 1.);
  vec4 cb = uProj * uView * vec4(aB, 1.);
  vColor = aCol;
  vSide = q.y;
  if (ca.w < .05 || cb.w < .05) { gl_Position = vec4(2., 2., 2., 1.); vAlpha = 0.; return; }
  vec2 half_ = uRes * .5;
  vec2 sa = ca.xy / ca.w * half_;
  vec2 sb = cb.xy / cb.w * half_;
  vec2 d = sb - sa;
  float l = length(d);
  vec2 dir = l > 1e-3 ? d / l : vec2(1., 0.);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = mix(aWidth.x, aWidth.y, q.x) * uPxScale + 1.5;
  vec4 c = q.x < .5 ? ca : cb;
  vec2 off = nrm * q.y * w * .5 + dir * (q.x * 2. - 1.) * w * .3;
  c.xy += off / half_ * c.w;
  gl_Position = c;
  vAlpha = mix(aAlpha.x, aAlpha.y, q.x) * exp(-max(c.w - 13., 0.) * .1);
}
`;

export const STROKE_FS = HEADER + /* glsl */ `
uniform float uGain;
in vec3 vColor;
in float vAlpha;
in float vSide;
out vec4 o;
void main() {
  float x = abs(vSide);
  float core = 1. - smoothstep(.2, 1., x);
  o = vec4(vColor * vAlpha * core * uGain, 1.);
}
`;

// ------------------------------------------------------------------- sprites
export const SPRITE_VS = HEADER + /* glsl */ `
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSize;
layout(location = 2) in vec4 aCol;
layout(location = 3) in vec2 aStyle;
uniform mat4 uProj;
uniform mat4 uView;
out vec2 vUv;
out vec4 vCol;
out vec2 vStyle;
const vec2 K[6] = vec2[6](vec2(-1., -1.), vec2(1., -1.), vec2(1., 1.), vec2(-1., -1.), vec2(1., 1.), vec2(-1., 1.));
void main() {
  vec2 k = K[gl_VertexID];
  vec4 mv = uView * vec4(aPos, 1.);
  mv.xy += k * aSize;
  gl_Position = uProj * mv;
  vUv = k;
  vCol = vec4(aCol.rgb, aCol.a * exp(-max(-mv.z - 13., 0.) * .1));
  vStyle = aStyle;
}
`;

export const SPRITE_FS = HEADER + /* glsl */ `
uniform float uTime;
in vec2 vUv;
in vec4 vCol;
in vec2 vStyle;
out vec4 o;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), u.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main() {
  vec2 uv = vUv;
  float r = length(uv);
  float style = vStyle.x;
  float seed = vStyle.y;
  vec3 col = vCol.rgb;
  float a = 0.;
  if (style < .5) {
    a = exp(-r * r * 5.);
  } else if (style < 1.5) {
    float ring = exp(-pow((r - .8) * 9., 2.));
    float hi = exp(-dot(uv - vec2(-.35, .38), uv - vec2(-.35, .38)) * 40.);
    a = (ring + hi * .9 + .07 * (1. - r)) * step(r, 1.);
    col = mix(col, vec3(1.), hi * .6);
  } else if (style < 2.5) {
    float ang = seed * 1.7 + uTime * .6;
    vec2 q = abs(mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uv);
    float e = max(q.x, q.y);
    float frame = 1. - smoothstep(.0, .09, abs(e - .78));
    float corner = step(.42, min(q.x, q.y));
    a = frame * corner + exp(-r * r * 70.) + .25 * (1. - smoothstep(.0, .05, abs(q.x - q.y))) * step(r, .5);
  } else if (style < 3.5) {
    vec2 p = uv;
    p.x *= 1.5 + (p.y + 1.) * .45;
    float flick = sin(p.y * 7. - uTime * 13. + seed * 20.) * .07 + sin(p.y * 13. + uTime * 9.) * .03;
    float d = length(vec2(p.x + flick, (p.y + .25) * .72));
    a = 1. - smoothstep(.15, .85, d);
    col = mix(col, vec3(1., .92, .72), exp(-d * d * 9.));
  } else if (style < 4.5) {
    float n = fbm(uv * 1.5 + seed + uTime * .04);
    a = smoothstep(.25, .85, n) * (1. - smoothstep(.35, 1., r));
  } else {
    a = exp(-abs(uv.x) * 14.) * exp(-abs(uv.y) * 2.4) + exp(-abs(uv.y) * 14.) * exp(-abs(uv.x) * 2.4) + exp(-r * r * 22.);
  }
  o = vec4(col * a * vCol.a, 1.);
}
`;

// ------------------------------------------------------------- post process
export const FADE_FS = HEADER + /* glsl */ `
uniform sampler2D uPrev;
uniform float uFade;
uniform vec2 uShift;
uniform float uTime;
uniform float uAspect;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 c = vUv - .5;
  c.x *= uAspect;
  float ang = .0009;
  c = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c * .9985;
  c.x /= uAspect;
  vec2 uv = c + .5 - uShift;
  uv += vec2(sin(vUv.y * 9. + uTime * .3), cos(vUv.x * 8. - uTime * .25)) * .0005;
  o = texture(uPrev, uv) * uFade;
}
`;

export const BRIGHT_FS = HEADER + /* glsl */ `
uniform sampler2D uSrc;
uniform sampler2D uSrc2;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 o;
vec3 tap(vec2 uv) { return texture(uSrc, uv).rgb + texture(uSrc2, uv).rgb; }
void main() {
  vec3 c = tap(vUv + uTexel * vec2(-1., -1.)) + tap(vUv + uTexel * vec2(1., -1.)) + tap(vUv + uTexel * vec2(-1., 1.)) + tap(vUv + uTexel * vec2(1., 1.));
  c *= .25;
  float l = dot(c, vec3(.2126, .7152, .0722));
  o = vec4(c * smoothstep(.15, 1.1, l), 1.);
}
`;

export const BLUR_FS = HEADER + /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDir;
in vec2 vUv;
out vec4 o;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * .2270;
  c += (texture(uSrc, vUv + uDir * 1.3846).rgb + texture(uSrc, vUv - uDir * 1.3846).rgb) * .3162;
  c += (texture(uSrc, vUv + uDir * 3.2308).rgb + texture(uSrc, vUv - uDir * 3.2308).rgb) * .0703;
  o = vec4(c, 1.);
}
`;

export const COMPOSITE_FS = HEADER + /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uCrisp;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloomStrength;
in vec2 vUv;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 d = vUv - .5;
  float r2 = dot(d, d);
  vec2 off = d * r2 * .018;
  vec3 col = vec3(texture(uScene, vUv + off).r, texture(uScene, vUv).g, texture(uScene, vUv - off).b);
  col += texture(uCrisp, vUv).rgb;
  col += texture(uBloom, vUv).rgb * uBloomStrength;
  col += vec3(.006, .007, .016) * (1. - r2 * 2.);
  col = aces(col * uExposure);
  col *= 1. - r2 * .85;
  col = pow(col, vec3(1. / 2.2));
  col += (hash12(vUv * uRes + fract(uTime) * 100.) - .5) / 128.;
  o = vec4(col, 1.);
}
`;
