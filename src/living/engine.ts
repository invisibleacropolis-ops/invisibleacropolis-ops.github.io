// Raw WebGL2 engine for the living index: a GPGPU agent simulation, CPU-built
// strokes and sprites streamed every frame, a feedback trail buffer, a crisp
// layer, and a small HDR bloom chain.
import * as G from "./glsl.ts";
import { SPRITE_FLOATS, STROKE_FLOATS } from "./batches.ts";

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
  fa(name: string, v: Float32Array) { this.gl.uniform1fv(this.u(name), v); return this; }
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
type Batch = { data: Float32Array; count: number };

export type FrameState = {
  time: number;
  dt: number;
  proj: Float32Array;
  view: Float32Array;
  pixelsPerUnit: number;
  pxScale: number;
  cores: Float32Array;     // MAX_CORES * vec4 (xyz, open)
  coreCount: number;
  coreHue: Float32Array;   // MAX_CORES
  slots: ArrayLike<number>;
  leaves: Float32Array;    // MAX_LEAVES * vec4 (xyz, core)
  leafCount: number;
  boost: Float32Array;
  migrate: Float32Array;
  rayO: ArrayLike<number>;
  rayD: ArrayLike<number>;
  focus: ArrayLike<number>;
  stir: number;
  press: number;
  shock: ArrayLike<number>;
  fade: number;
  shift: [number, number];
  quality: number;
  strokes: Batch;
  sprites: Batch;
};

export type Engine = {
  readonly agents: number;
  resize: (width: number, height: number) => void;
  render: (state: FrameState) => void;
};

export const createEngine = (canvas: HTMLCanvasElement, side: number, strokeCap: number, spriteCap: number): Engine | null => {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
  gl.getExtension("OES_texture_float_linear");

  const programs = {
    sim: new Program(gl, G.FULLSCREEN_VS, G.SIM_FS),
    particle: new Program(gl, G.PARTICLE_VS, G.PARTICLE_FS),
    stroke: new Program(gl, G.STROKE_VS, G.STROKE_FS),
    sprite: new Program(gl, G.SPRITE_VS, G.SPRITE_FS),
    fade: new Program(gl, G.FULLSCREEN_VS, G.FADE_FS),
    bright: new Program(gl, G.FULLSCREEN_VS, G.BRIGHT_FS),
    blur: new Program(gl, G.FULLSCREEN_VS, G.BLUR_FS),
    composite: new Program(gl, G.FULLSCREEN_VS, G.COMPOSITE_FS),
  };
  const emptyVao = gl.createVertexArray();

  // instanced attribute streams for strokes and sprites
  const stream = (floats: number, cap: number, layout: [number, number][]) => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, cap * floats * 4, gl.DYNAMIC_DRAW);
    let offset = 0;
    layout.forEach(([loc, size]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, floats * 4, offset);
      gl.vertexAttribDivisor(loc, 1);
      offset += size * 4;
    });
    gl.bindVertexArray(null);
    return { vao, buffer, floats, cap };
  };
  const strokeStream = stream(STROKE_FLOATS, strokeCap, [[0, 3], [1, 3], [2, 3], [3, 2], [4, 2]]);
  const spriteStream = stream(SPRITE_FLOATS, spriteCap, [[0, 3], [1, 1], [2, 4], [3, 2]]);
  const upload = (s: typeof strokeStream, batch: Batch) => {
    const count = Math.min(batch.count, s.cap);
    if (!count) return 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data, 0, count * s.floats);
    return count;
  };

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

  // agent state: RGBA32F position (xyz, seed) + velocity (xyz, life)
  const agents = side * side;
  const pos = new Float32Array(agents * 4);
  const vel = new Float32Array(agents * 4);
  for (let i = 0; i < agents; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = 1 + Math.random() * 5;
    const q = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * q * r, u * r * .6, Math.sin(a) * q * r, Math.random()], i * 4);
    vel.set([0, 0, 0, Math.random()], i * 4);
  }
  const state = [0, 1].map(() => {
    const p = texture(side, side, gl.RGBA32F, gl.FLOAT, gl.NEAREST, pos);
    const v = texture(side, side, gl.RGBA32F, gl.FLOAT, gl.NEAREST, vel);
    return { p, v, fbo: framebuffer([p, v]) };
  });
  let current = 0;

  let trails: Target[] = [];
  let crisp: Target | null = null;
  let bloom: Target[] = [];
  let trailIndex = 0;
  let width = 1;
  let height = 1;
  const target = (w: number, h: number): Target => {
    const tex = texture(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
    return { tex, fbo: framebuffer([tex]), w, h };
  };
  const release = (list: (Target | null)[]) => list.forEach((t) => { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } });
  const resize = (w: number, h: number) => {
    width = Math.max(2, Math.floor(w));
    height = Math.max(2, Math.floor(h));
    canvas.width = width;
    canvas.height = height;
    release([...trails, crisp, ...bloom]);
    trails = [target(width, height), target(width, height)];
    crisp = target(width, height);
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
  const field = (p: Program, s: FrameState) => p
    .v4a("uCores", s.cores).i("uCoreCount", s.coreCount).v3("uSlots", s.slots)
    .v4a("uLeaves", s.leaves).i("uLeafCount", s.leafCount).v3("uBoost", s.boost).f("uTime", s.time);

  const render = (s: FrameState) => {
    const rows = Math.max(8, Math.round(side * s.quality));
    const drawn = rows * side;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(emptyVao);

    // 1. simulate
    const read = state[current];
    const write = state[1 - current];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, side, rows);
    const sim = programs.sim.use();
    field(sim, s);
    sim.tex("uPos", 0, read.p).tex("uVel", 1, read.v)
      .f("uDt", s.dt).v3("uRayO", s.rayO).v3("uRayD", s.rayD).v3("uFocus", s.focus)
      .f("uStir", s.stir).f("uPress", s.press).v4("uShock", s.shock).v4("uMigrate", s.migrate);
    quad();
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    current = 1 - current;
    const live = state[current];

    // 2. fade + advect the previous trail frame
    const prev = trails[trailIndex];
    const next = trails[1 - trailIndex];
    bind(next);
    programs.fade.use().tex("uPrev", 0, prev.tex).f("uFade", s.fade).v2("uShift", s.shift[0], s.shift[1])
      .f("uTime", s.time).f("uAspect", width / height);
    quad();

    // 3. agents into the trail buffer
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const density = 262144 / drawn;
    const particle = programs.particle.use();
    field(particle, s);
    particle.tex("uPos", 0, live.p).tex("uVel", 1, live.v).i("uSize", side).fa("uCoreHue", s.coreHue)
      .m4("uProj", s.proj).m4("uView", s.view).f("uPx", s.pixelsPerUnit);
    particle.f("uLines", 0).f("uIntensity", .02 * Math.sqrt(density));
    gl.drawArrays(gl.POINTS, 0, drawn);
    particle.f("uLines", 1).f("uIntensity", .028 * Math.sqrt(density));
    gl.drawArrays(gl.LINES, 0, drawn * 2);

    // 4. strokes: a faint copy into the trails (afterglow), full into the crisp layer
    const strokeCount = upload(strokeStream, s.strokes);
    const spriteCount = upload(spriteStream, s.sprites);
    const stroke = programs.stroke.use().m4("uProj", s.proj).m4("uView", s.view).v2("uRes", width, height).f("uPxScale", s.pxScale);
    if (strokeCount) {
      gl.bindVertexArray(strokeStream.vao);
      stroke.f("uGain", .16);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, strokeCount);
    }
    bind(crisp);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (spriteCount) {
      gl.bindVertexArray(spriteStream.vao);
      programs.sprite.use().m4("uProj", s.proj).m4("uView", s.view).f("uTime", s.time);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, spriteCount);
    }
    if (strokeCount) {
      gl.bindVertexArray(strokeStream.vao);
      stroke.use().f("uGain", 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, strokeCount);
    }
    gl.bindVertexArray(emptyVao);
    gl.disable(gl.BLEND);

    // 5. bloom
    const [b0, b1] = bloom;
    bind(b0);
    programs.bright.use().tex("uSrc", 0, next.tex).tex("uSrc2", 1, crisp!.tex).v2("uTexel", 1 / width, 1 / height);
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

    // 6. tone-map to the screen
    bind(null);
    programs.composite.use().tex("uScene", 0, next.tex).tex("uCrisp", 1, crisp!.tex).tex("uBloom", 2, b0.tex)
      .v2("uRes", width, height).f("uTime", s.time).f("uExposure", 1.1).f("uBloomStrength", .8);
    quad();
    trailIndex = 1 - trailIndex;
  };

  return { agents, resize, render };
};
