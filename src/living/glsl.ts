// GLSL for the living index. Everything visible on the page is generated here:
// no meshes, no textures, no baked assets. WebGL2 / GLSL ES 3.00.

export const MAX_NODES = 24;

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

// Shared routing + spectrum code. The simulation and the renderer run the same
// routing function, so a particle's colour always matches where it is headed.
const ROUTE = /* glsl */ `
#define MAXN ${MAX_NODES}
uniform vec4 uNodes[MAXN];   // xyz = position, w = activity (hover / select)
uniform int uCount;          // live node count (>= 1)
uniform float uHot;          // node that is pulling extra agents, -1 for none
uniform float uTime;

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float tri(float x) { return 1. - abs(fract(x) * 2. - 1.); }
float nodeHue(int i) { return uCount > 1 ? float(i) / float(uCount - 1) : .5; }

// Each migrating agent belongs to a node for one "epoch", then picks another.
// The hand-over is what draws the luminous streams between destinations.
void route(float seed, out int prevN, out int home) {
  float period = 6. + seed * 12.;
  float tt = uTime + seed * 97.;
  float e = floor(tt / period);
  float n = float(uCount);
  home = int(min(floor(hash11(seed * 13.7 + e * 1.618) * n), n - 1.));
  prevN = int(min(floor(hash11(seed * 13.7 + (e - 1.) * 1.618) * n), n - 1.));
  if (uHot >= 0. && hash11(seed * 5.31 + e * .77) < .16) home = int(uHot);
}

// ROYGBIV, red (0) -> violet (1). Linear-light values for the HDR buffer.
vec3 spectrum(float x) {
  vec3 c[7] = vec3[7](
    vec3(1., .07, .14),  // R
    vec3(1., .38, .03),  // O
    vec3(1., .85, .10),  // Y
    vec3(.12, 1., .30),  // G
    vec3(.06, .55, 1.),  // B
    vec3(.22, .16, 1.),  // I
    vec3(.66, .14, 1.)   // V
  );
  float s = clamp(x, 0., 1.) * 6.;
  int i = int(min(floor(s), 5.));
  float f = s - float(i);
  return mix(c[i], c[i + 1], f * f * (3. - 2. * f));
}
`;

// Simplex noise with analytic gradient (Ashima / Gustavson), used to build a
// divergence-free curl field: the fluid-like motion that never settles.
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
// One fragment = one agent. Position and velocity live in float textures and
// are ping-ponged every frame, written together through two colour attachments.
export const SIM_FS = HEADER + ROUTE + NOISE + /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;
uniform vec3 uRayO;      // pointer ray
uniform vec3 uRayD;
uniform vec3 uFocus;     // pointer ray hit on the focal plane
uniform float uStir;     // pointer energy (speed driven)
uniform float uPress;    // held pointer: gravity well
uniform vec4 uShock;     // xyz = centre, w = age in seconds (< 0: none)
uniform float uDrift;    // fraction of agents that orbit the core instead of migrating
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
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
  vec3 acc = vec3(0.);
  bool drifter = seed < uDrift;
  int prevN = 0;
  int home = 0;

  if (drifter) {
    // A breathing shell around the core, combed by the curl field.
    float R = .7 + .7 * fract(seed * 17.31) + .2 * sin(t * .6 + seed * 40.);
    float r = length(p) + 1e-4;
    acc -= p / r * (r - R) * 3.2;
    vec3 ax = normalize(vec3(sin(t * .11), 1.3, cos(t * .07)));
    acc += cross(ax, p / r) * (1.3 + fract(seed * 7.7));
    acc += curl(p * .8 + vec3(0., t * .09, 0.)) * 1.2;
  } else {
    route(seed, prevN, home);
    vec4 N = uNodes[home];
    vec3 to = N.xyz - p;
    float d = length(to) + 1e-4;
    vec3 dir = to / d;
    float r0 = .14 + .34 * fract(seed * 7.13) + N.w * .6 * fract(seed * 2.91);
    acc += dir * clamp(d - r0, -1.5, 3.) * (2.6 + N.w);
    float fh = float(home);
    vec3 ax = normalize(vec3(sin(fh * 1.7), 1.2, cos(fh * 2.3)));
    acc += cross(ax, dir) * (2.2 + 1.6 * fract(seed * 3.1)) * (1. - smoothstep(.05, 1.1, d));
    acc += curl(p * .42 + vec3(t * .05, 0., -t * .04)) * (.25 + 1.1 * smoothstep(.5, 2., d));
  }

  // Pointer: a vortex tube along the view ray that also pushes outward.
  vec3 onRay = uRayO + uRayD * max(dot(p - uRayO, uRayD), 0.);
  vec3 off = p - onRay;
  float od = length(off) + 1e-4;
  float fall = exp(-od * od * 1.6);
  acc += (cross(uRayD, off / od) * 7. + off / od * 2.5) * fall * uStir;

  // Held pointer: everything spirals into the focal point.
  vec3 tf = uFocus - p;
  float fd = length(tf) + 1e-4;
  acc += tf / fd * min(fd, 3.) * 4.5 * uPress;
  acc += cross(uRayD, tf / fd) * 3. * uPress * exp(-fd * .5);

  // Click: an expanding spherical shock front.
  if (uShock.w >= 0.) {
    vec3 sp = p - uShock.xyz;
    float sr = length(sp) + 1e-4;
    float ring = uShock.w * 5.;
    acc += sp / sr * 24. * exp(-pow((sr - ring) * 2.5, 2.)) * exp(-uShock.w * 1.6);
  }

  v = v * pow(.955, uDt * 60.) + acc * uDt;
  float speed = length(v);
  if (speed > 9.) v *= 9. / speed;
  p += v * uDt;

  life -= uDt * (.025 + .05 * fract(seed * 91.7));
  if (life <= 0. || dot(p, p) > 110.) {
    vec3 h = hash33(vec3(gl_FragCoord.xy, uTime * 61.7));
    vec3 rd = normalize(h * 2. - 1. + 1e-4);
    if (drifter) {
      p = rd * (.25 + .35 * h.x);
    } else {
      route(seed, prevN, home);
      p = uNodes[home].xyz + rd * (.1 + .25 * h.y);
    }
    v = rd * .6;
    life = 1.;
  }
  oPos = vec4(p, seed);
  oVel = vec4(v, life);
}
`;

// ----------------------------------------------------------------- particles
// Drawn twice from the same state: as soft points and as velocity streaks.
export const PARTICLE_VS = HEADER + ROUTE + /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform int uSize;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uLines;     // 0 = points, 1 = streaks
uniform float uPx;        // world size -> pixels at depth 1
uniform float uIntensity;
uniform float uStreak;
uniform float uDrift;
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
  vec3 p = P.xyz;
  if (end == 0) p -= V.xyz * uStreak;

  vec3 col;
  float boost = 1.;
  if (seed < uDrift) {
    col = spectrum(tri(atan(P.z, P.x) * .15915 + P.y * .12 - uTime * .03));
    boost = .7;
  } else {
    int a; int b;
    route(seed, a, b);
    vec3 A = uNodes[a].xyz;
    vec3 B = uNodes[b].xyz;
    float prog = clamp(1. - distance(P.xyz, B) / max(distance(A, B), .01), 0., 1.);
    col = spectrum(mix(nodeHue(a), nodeHue(b), smoothstep(0., 1., prog)));
    boost = 1. + .35 * uNodes[b].w;
  }
  col = mix(col, vec3(1.), smoothstep(4., 9., speed) * .25);

  float life = V.w;
  float fade = (1. - smoothstep(.93, 1., life)) * smoothstep(0., .12, life);
  vec4 mv = uView * vec4(p, 1.);
  float depth = max(-mv.z, .1);
  gl_Position = uProj * mv;
  gl_PointSize = clamp(uPx * (.010 + .012 * fract(seed * 31.7)) / depth, 1., 9.);
  float fog = exp(-max(depth - 7., 0.) * .18);
  float streak = uLines > .5 ? (.35 + .65 * smoothstep(.4, 4., speed)) * float(end) / (1. + .12 * max(speed - 3., 0.)) : 1.;
  vColor = col;
  vAlpha = uIntensity * boost * fade * fog * streak;
}
`;

export const PARTICLE_FS = HEADER + /* glsl */ `
uniform float uLines;
in vec3 vColor;
in float vAlpha;
out vec4 o;
void main() {
  float a = vAlpha;
  if (uLines < .5) {
    float d = length(gl_PointCoord - .5);
    a *= (1. - smoothstep(0., .5, d));
  }
  o = vec4(vColor * a, 1.);
}
`;

// -------------------------------------------------------------------- glyphs
// Every destination is a living parametric curve evaluated per vertex:
// torus knots, roses, Lissajous figures and loxodromes that breathe and turn.
// The extra instance is the gyroscopic core.
export const GLYPH_VS = HEADER + ROUTE + /* glsl */ `
uniform vec4 uMeta[MAXN + 1];  // x = kind, y = activity, z = random, w = scale
uniform mat4 uProj;
uniform mat4 uView;
uniform int uSeg;
out vec3 vColor;
out float vT;
out float vHover;
out float vRand;

mat3 rot(float a, float b) {
  float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
  return mat3(ca, 0., -sa, 0., 1., 0., sa, 0., ca) * mat3(1., 0., 0., 0., cb, sb, 0., -sb, cb);
}

void main() {
  int inst = gl_InstanceID;
  int seg = gl_VertexID / 2;
  int end = gl_VertexID - seg * 2;
  float t = (float(seg) + float(end)) / float(uSeg);
  vec4 meta = uMeta[inst];
  float kind = meta.x;
  float hover = meta.y;
  float rnd = meta.z;
  bool isCore = inst >= uCount;
  float ph = 6.2831853 * t;
  float tm = uTime * (.25 + .2 * rnd);
  vec3 c;
  vec3 center = vec3(0.);

  if (isCore) {
    float ring = floor(t * 4.);
    float f = fract(t * 4.);
    float lt = f * 6.2831853;
    if (ring < 3.) {
      c = vec3(cos(lt), sin(lt), 0.) * (1. + .14 * ring) * (1. + .03 * sin(uTime * .9 + ring));
      c = rot(uTime * (.11 + .07 * ring) + ring * 2.1, ring * 1.05 + .4 * sin(uTime * .2 + ring)) * c;
      vColor = spectrum(tri(f + uTime * .03));
    } else {
      float rr = .45 * (2. + cos(5. * lt)) / 3.;
      c = vec3(rr * cos(3. * lt), rr * sin(3. * lt), .45 * sin(5. * lt) / 3.) * (1. + .18 * sin(uTime * .8 + lt * 2.));
      c = rot(uTime * .3, uTime * .17) * c;
      vColor = spectrum(tri(f * 2. - uTime * .05));
    }
  } else {
    if (kind < .5) {
      float q = 3. + floor(rnd * 3.);
      float rr = (2. + cos(q * ph)) / 3.;
      c = vec3(rr * cos(2. * ph), rr * sin(2. * ph), sin(q * ph) * .45);
    } else if (kind < 1.5) {
      float k = 2. + floor(rnd * 4.);
      float rr = cos(k * ph) * (.8 + .2 * sin(tm * 1.7));
      c = vec3(rr * cos(ph), rr * sin(ph), .35 * sin(k * ph * .5 + tm));
    } else if (kind < 2.5) {
      c = vec3(sin(3. * ph + tm), sin(2. * ph), sin(5. * ph + tm * .7)) * .85;
    } else {
      float s = t * 2. - 1.;
      float a = ph * 6.;
      float q = sqrt(max(1. - s * s, 0.));
      c = vec3(q * cos(a), s, q * sin(a)) * (.85 + .15 * sin(tm * 2. + s * 6.));
    }
    c *= 1. + .12 * sin(ph * 7. + uTime * 1.3 + rnd * 9.) * (1. + 2. * hover);
    c = rot(tm * 1.3 + rnd * 6.28, tm * .9 + rnd * 3.) * c;
    center = uNodes[inst].xyz;
    vColor = spectrum(nodeHue(inst) + (t - .5) * .07);
  }

  vec3 world = center + c * meta.w * (1. + .9 * hover);
  gl_Position = uProj * uView * vec4(world, 1.);
  vT = t;
  vHover = hover;
  vRand = rnd;
}
`;

export const GLYPH_FS = HEADER + /* glsl */ `
uniform float uTime;
uniform float uIntensity;
in vec3 vColor;
in float vT;
in float vHover;
in float vRand;
out vec4 o;
void main() {
  float head = fract(uTime * (.07 + .1 * vRand) + vRand);
  float tail = fract(head - vT);
  float comet = pow(1. - tail, 4.);
  float a = .1 + .9 * max(comet, vHover * .8);
  o = vec4(vColor * a * uIntensity * (1. + 1.6 * vHover), 1.);
}
`;

// ------------------------------------------------------------------- tethers
// Bowed filaments from the core to each destination with travelling pulses.
export const TETHER_VS = HEADER + ROUTE + /* glsl */ `
uniform vec4 uMeta[MAXN + 1];
uniform mat4 uProj;
uniform mat4 uView;
uniform int uSeg;
out vec3 vColor;
out float vT;
out float vHot;
out float vRand;
void main() {
  int inst = gl_InstanceID;
  int seg = gl_VertexID / 2;
  int end = gl_VertexID - seg * 2;
  float t = (float(seg) + float(end)) / float(uSeg);
  vec3 B = uNodes[inst].xyz;
  float r = hash11(float(inst) * 3.7 + .5);
  vec3 side = normalize(cross(B, vec3(0., 1., 0.)) + vec3(1e-4));
  vec3 ctrl = B * .5 + side * .7 * sin(uTime * .23 + r * 6.) + vec3(0., .55 * cos(uTime * .19 + r * 4.), 0.);
  vec3 p = mix(mix(vec3(0.), ctrl, t), mix(ctrl, B, t), t);
  float env = sin(t * 3.14159);
  p += vec3(sin(t * 31. + uTime * 2. + r * 9.), cos(t * 27. - uTime * 1.7), sin(t * 23. + uTime * 1.3)) * .018 * env;
  gl_Position = uProj * uView * vec4(p, 1.);
  vColor = mix(vec3(.9), spectrum(nodeHue(inst)), smoothstep(0., .45, t));
  vT = t;
  vHot = uMeta[inst].y;
  vRand = r;
}
`;

export const TETHER_FS = HEADER + /* glsl */ `
uniform float uTime;
uniform float uIntensity;
in vec3 vColor;
in float vT;
in float vHot;
in float vRand;
out vec4 o;
void main() {
  float pulse = exp(-pow((fract(uTime * (.22 + .2 * vRand) + vRand) - vT) * 13., 2.));
  float a = (.05 + .35 * vHot) + pulse * (.45 + 1.5 * vHot);
  o = vec4(vColor * a * uIntensity, 1.);
}
`;

// ------------------------------------------------------------- post process
// The previous frame is faded and gently advected before new light is added,
// so every stroke leaves a trail that drifts like smoke.
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
uniform vec2 uTexel;
in vec2 vUv;
out vec4 o;
void main() {
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1., -1.)).rgb
         + texture(uSrc, vUv + uTexel * vec2(1., -1.)).rgb
         + texture(uSrc, vUv + uTexel * vec2(-1., 1.)).rgb
         + texture(uSrc, vUv + uTexel * vec2(1., 1.)).rgb;
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
  col += texture(uBloom, vUv).rgb * uBloomStrength;
  col += vec3(.006, .007, .016) * (1. - r2 * 2.);
  col = aces(col * uExposure);
  col *= 1. - r2 * .85;
  col = pow(col, vec3(1. / 2.2));
  col += (hash12(vUv * uRes + fract(uTime) * 100.) - .5) / 128.;
  o = vec4(col, 1.);
}
`;
