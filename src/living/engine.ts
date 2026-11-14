// Raw WebGL2 engine for the living index: a GPGPU agent simulation, procedural
// stroke geometry, a feedback trail buffer and a small HDR bloom chain.
import * as G from "./glsl.ts";

type GL = WebGL2RenderingContext;
type Uniform = WebGLUniformLocation | null;

class Program {
  readonly program: WebGLProgram;
  private readonly locations = new Map<string, Uniform>();
  constructor(private readonly gl: GL, vs: string, fs: string) {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const lines = source.split("\n").map((line, i) => `${String(i + 1).padStart(4)} ${line}`).join("\n");
        throw new Error(`${gl.getShaderInfoLog(shader)}\n${lines}`);
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    this.program = program;
  }
  use() { this.gl.useProgram(this.program); return this; }
  u(name: string): Uniform {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locations.get(name)!;
  }
  f(name: string, x: number) { this.gl.uniform1f(this.u(name), x); return this; }
  i(name: string, x: number) { this.gl.uniform1i(this.u(name), x); return this; }
  v2(name: string, x: number, y: number) { this.gl.uniform2f(this.u(name), x, y); return this; }
  v3(name: string, v: ArrayLike<number>) { this.gl.uniform3f(this.u(name), v[0], v[1], v[2]); return this; }
  v4(name: string, v: ArrayLike<number>) { this.gl.uniform4f(this.u(name), v[0], v[1], v[2], v[3]); return this; }
  v4a(name: string, v: Float32Array) { this.gl.uniform4fv(this.u(name), v); return this; }
  m4(name: string, m: Float32Array) { this.gl.uniformMatrix4fv(this.u(name), false, m); return this; }
  tex(name: string, unit: number, texture: WebGLTexture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.uniform1i(this.u(name), unit);
    return this;
  }
}

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

export type FrameState = {
  time: number;
  dt: number;
  proj: Float32Array;
  view: Float32Array;
  pixelsPerUnit: number;         // drawing-buffer pixels per world unit at depth 1
  nodes: Float32Array;           // MAX_NODES * vec4
  meta: Float32Array;            // (MAX_NODES + 1) * vec4
  count: number;
  hot: number;
  rayO: ArrayLike<number>;
  rayD: ArrayLike<number>;
  focus: ArrayLike<number>;
  stir: number;
  press: number;
  shock: ArrayLike<number>;      // xyz + age (-1 none)
  fade: number;
  shift: [number, number];
  quality: number;               // 0..1 portion of agents simulated and drawn
};

export type Engine = {
  readonly agents: number;
  resize: (width: number, height: number) => void;
  render: (state: FrameState) => void;
  dispose: () => void;
};

export const GLYPH_SEGMENTS = 192;
const TETHER_SEGMENTS = 64;

export const createEngine = (canvas: HTMLCanvasElement, side: number): Engine | null => {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
  gl.getExtension("OES_texture_float_linear");

  const programs = {
    sim: new Program(gl, G.FULLSCREEN_VS, G.SIM_FS),
    particle: new Program(gl, G.PARTICLE_VS, G.PARTICLE_FS),
    glyph: new Program(gl, G.GLYPH_VS, G.GLYPH_FS),
    tether: new Program(gl, G.TETHER_VS, G.TETHER_FS),
    fade: new Program(gl, G.FULLSCREEN_VS, G.FADE_FS),
    bright: new Program(gl, G.FULLSCREEN_VS, G.BRIGHT_FS),
    blur: new Program(gl, G.FULLSCREEN_VS, G.BLUR_FS),
    composite: new Program(gl, G.FULLSCREEN_VS, G.COMPOSITE_FS),
  };
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const texture = (w: number, h: number, internal: number, type: number, filter: number, data: Float32Array | null = null) => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  const framebuffer = (textures: WebGLTexture[]) => {
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    textures.forEach((tex, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0));
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete: ${status}`);
    return fbo;
  };

  // --- agent state: RGBA32F position (xyz, seed) + velocity (xyz, life)
  const agents = side * side;
  const pos = new Float32Array(agents * 4);
  const vel = new Float32Array(agents * 4);
  for (let i = 0; i < agents; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 3.5;
    const q = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * q * r, u * r, Math.sin(a) * q * r, Math.random()], i * 4);
    vel.set([0, 0, 0, Math.random()], i * 4);
  }
  const state = [0, 1].map(() => {
    const p = texture(side, side, gl.RGBA32F, gl.FLOAT, gl.NEAREST, pos);
    const v = texture(side, side, gl.RGBA32F, gl.FLOAT, gl.NEAREST, vel);
    return { p, v, fbo: framebuffer([p, v]) };
  });
  let current = 0;

  // --- screen targets (recreated on resize)
  let trails: Target[] = [];
  let bloom: Target[] = [];
  let trailIndex = 0;
  let width = 1;
  let height = 1;
  const target = (w: number, h: number): Target => {
    const tex = texture(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
    return { tex, fbo: framebuffer([tex]), w, h };
  };
  const release = (list: Target[]) => list.forEach(({ fbo, tex }) => { gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); });
  const resize = (w: number, h: number) => {
    width = Math.max(2, Math.floor(w));
    height = Math.max(2, Math.floor(h));
    canvas.width = width;
    canvas.height = height;
    release(trails);
    release(bloom);
    trails = [target(width, height), target(width, height)];
    const bw = Math.max(1, Math.floor(width / 4));
    const bh = Math.max(1, Math.floor(height / 4));
    bloom = [target(bw, bh), target(bw, bh)];
    for (const t of trails) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };

  const bind = (t: Target | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : width, t ? t.h : height);
  };
  const quad = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
  const sharedRoute = (p: Program, s: FrameState) => p.v4a("uNodes", s.nodes).i("uCount", Math.max(1, s.count)).f("uHot", s.hot).f("uTime", s.time);

  const render = (s: FrameState) => {
    const rows = Math.max(8, Math.round(side * s.quality));
    const drawn = rows * side;
    const drift = s.count > 0 ? .24 : 2;
    gl.disable(gl.BLEND);

    // 1. simulate
    const read = state[current];
    const write = state[1 - current];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, side, rows);
    const sim = programs.sim.use();
    sharedRoute(sim, s);
    sim.tex("uPos", 0, read.p).tex("uVel", 1, read.v)
      .f("uDt", s.dt).v3("uRayO", s.rayO).v3("uRayD", s.rayD).v3("uFocus", s.focus)
      .f("uStir", s.stir).f("uPress", s.press).v4("uShock", s.shock).f("uDrift", drift);
    quad();
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    current = 1 - current;
    const live = state[current];

    // 2. fade + advect the previous frame
    const prev = trails[trailIndex];
    const next = trails[1 - trailIndex];
    bind(next);
    programs.fade.use().tex("uPrev", 0, prev.tex).f("uFade", s.fade).v2("uShift", s.shift[0], s.shift[1])
      .f("uTime", s.time).f("uAspect", width / height);
    quad();

    // 3. add light
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const density = 262144 / drawn;
    const particle = programs.particle.use();
    sharedRoute(particle, s);
    particle.tex("uPos", 0, live.p).tex("uVel", 1, live.v).i("uSize", side)
      .m4("uProj", s.proj).m4("uView", s.view).f("uPx", s.pixelsPerUnit).f("uDrift", drift).f("uStreak", .06);
    particle.f("uLines", 0).f("uIntensity", .02 * Math.sqrt(density));
    gl.drawArrays(gl.POINTS, 0, drawn);
    particle.f("uLines", 1).f("uIntensity", .028 * Math.sqrt(density));
    gl.drawArrays(gl.LINES, 0, drawn * 2);

    const tether = programs.tether.use();
    sharedRoute(tether, s);
    tether.v4a("uMeta", s.meta).m4("uProj", s.proj).m4("uView", s.view).i("uSeg", TETHER_SEGMENTS).f("uIntensity", .5);
    if (s.count > 0) gl.drawArraysInstanced(gl.LINES, 0, TETHER_SEGMENTS * 2, s.count);

    const glyph = programs.glyph.use();
    sharedRoute(glyph, s);
    glyph.v4a("uMeta", s.meta).m4("uProj", s.proj).m4("uView", s.view).i("uSeg", GLYPH_SEGMENTS).f("uIntensity", .85);
    gl.drawArraysInstanced(gl.LINES, 0, GLYPH_SEGMENTS * 2, s.count + 1);
    gl.disable(gl.BLEND);

    // 4. bloom: bright pass at quarter resolution, two separable blur rounds
    const [b0, b1] = bloom;
    bind(b0);
    programs.bright.use().tex("uSrc", 0, next.tex).v2("uTexel", 1 / width, 1 / height);
    quad();
    const blur = programs.blur.use();
    for (const spread of [1, 2.2]) {
      bind(b1);
      blur.tex("uSrc", 0, b0.tex).v2("uDir", spread / b0.w, 0);
      quad();
      bind(b0);
      blur.tex("uSrc", 0, b1.tex).v2("uDir", 0, spread / b0.h);
      quad();
    }

    // 5. tone-map to the screen
    bind(null);
    programs.composite.use().tex("uScene", 0, next.tex).tex("uBloom", 1, b0.tex)
      .v2("uRes", width, height).f("uTime", s.time).f("uExposure", 1.15).f("uBloomStrength", .8);
    quad();
    trailIndex = 1 - trailIndex;
  };

  const dispose = () => {
    release(trails);
    release(bloom);
    state.forEach(({ p, v, fbo }) => { gl.deleteTexture(p); gl.deleteTexture(v); gl.deleteFramebuffer(fbo); });
    Object.values(programs).forEach((p) => gl.deleteProgram(p.program));
  };

  return { agents, resize, render, dispose };
};
