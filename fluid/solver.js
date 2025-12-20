// Fluid solver implementation: manages textures, framebuffers, and simulation steps.
// Keep this module focused on solver passes; render-specific code lives elsewhere.

import {
  advectFragment,
  divergenceFragment,
  curlFragment,
  vorticityFragment,
  pressureFragment,
  gradientSubtractFragment,
  splatFragment,
  velocitySplatFragment,
  clearFragment,
  baseVertex,
} from './shaders.js';

const QUAD_VERTICES = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  -1, 1,
  1, -1,
  1, 1,
]);

const DEFAULTS = {
  simSize: 256,
  dyeSize: 512,
  densityDissipation: 0.985,
  velocityDissipation: 0.985,
  pressureIterations: 20,
  vorticity: 30.0,
  splatRadius: 0.0009,
};

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl, fragmentSource) {
  const program = gl.createProgram();
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, baseVertex);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function createTexture(gl, width, height, internalFormat, format, type) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
  return texture;
}

function createFramebuffer(gl, texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return framebuffer;
}

function createDoubleFBO(gl, width, height, internalFormat, format, type) {
  const texA = createTexture(gl, width, height, internalFormat, format, type);
  const texB = createTexture(gl, width, height, internalFormat, format, type);
  const fboA = createFramebuffer(gl, texA);
  const fboB = createFramebuffer(gl, texB);
  return {
    read: { texture: texA, fbo: fboA },
    write: { texture: texB, fbo: fboB },
    swap() {
      [this.read, this.write] = [this.write, this.read];
    },
    size: { width, height },
  };
}

function bindQuad(gl) {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
}

export class FluidSolver {
  constructor(gl, options = {}) {
    this.gl = gl;
    this.settings = { ...DEFAULTS, ...options };
    this.baseSize = { sim: this.settings.simSize, dye: this.settings.dyeSize };

    this.quad = bindQuad(gl);

    this.programs = {
      advect: createProgram(gl, advectFragment),
      divergence: createProgram(gl, divergenceFragment),
      curl: createProgram(gl, curlFragment),
      vorticity: createProgram(gl, vorticityFragment),
      pressure: createProgram(gl, pressureFragment),
      gradient: createProgram(gl, gradientSubtractFragment),
      splat: createProgram(gl, splatFragment),
      velocitySplat: createProgram(gl, velocitySplatFragment),
      clear: createProgram(gl, clearFragment),
    };

    this.initBuffers();
  }

  initBuffers() {
    const gl = this.gl;
    const { simSize, dyeSize } = this.settings;
    const type = gl.HALF_FLOAT;

    this.velocity = createDoubleFBO(gl, simSize, simSize, gl.RG16F, gl.RG, type);
    this.dye = createDoubleFBO(gl, dyeSize, dyeSize, gl.RGBA16F, gl.RGBA, type);
    this.divergence = createTexture(gl, simSize, simSize, gl.R16F, gl.RED, type);
    this.divergenceFBO = createFramebuffer(gl, this.divergence);
    this.pressure = createDoubleFBO(gl, simSize, simSize, gl.R16F, gl.RED, type);
    this.curl = createTexture(gl, simSize, simSize, gl.R16F, gl.RED, type);
    this.curlFBO = createFramebuffer(gl, this.curl);
  }

  resize(dpr = 1) {
    const scale = Math.max(1, dpr);
    this.settings.simSize = Math.round(this.baseSize.sim * scale);
    this.settings.dyeSize = Math.round(this.baseSize.dye * scale);
    this.initBuffers();
  }

  step(dt) {
    const gl = this.gl;
    const { densityDissipation, velocityDissipation, pressureIterations, vorticity } = this.settings;

    this.advect(this.velocity, this.velocity, velocityDissipation, dt);
    this.advect(this.velocity, this.dye, densityDissipation, dt);
    this.computeCurl();
    this.applyVorticity(vorticity, dt);
    this.computeDivergence();
    this.solvePressure(pressureIterations);
    this.subtractGradient();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  advect(velocity, target, dissipation, dt) {
    const gl = this.gl;
    const program = this.programs.advect;
    const { width, height } = target.size;

    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, 'uDt'), dt);
    gl.uniform1f(gl.getUniformLocation(program, 'uDissipation'), dissipation);
    gl.uniform2f(gl.getUniformLocation(program, 'uInverseTexSize'), 1 / width, 1 / height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uVelocity'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uSource'), 1);

    this.renderTo(target.write.fbo, width, height);
    target.swap();
  }

  computeDivergence() {
    const gl = this.gl;
    const program = this.programs.divergence;
    const { width, height } = this.velocity.size;

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'uInverseTexSize'), 1 / width, 1 / height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uVelocity'), 0);

    this.renderTo(this.divergenceFBO, width, height);
  }

  computeCurl() {
    const gl = this.gl;
    const program = this.programs.curl;
    const { width, height } = this.velocity.size;

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'uInverseTexSize'), 1 / width, 1 / height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uVelocity'), 0);

    this.renderTo(this.curlFBO, width, height);
  }

  applyVorticity(amount, dt) {
    const gl = this.gl;
    const program = this.programs.vorticity;
    const { width, height } = this.velocity.size;

    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, 'uVorticity'), amount);
    gl.uniform1f(gl.getUniformLocation(program, 'uDt'), dt);
    gl.uniform2f(gl.getUniformLocation(program, 'uInverseTexSize'), 1 / width, 1 / height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uVelocity'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curl);
    gl.uniform1i(gl.getUniformLocation(program, 'uCurl'), 1);

    this.renderTo(this.velocity.write.fbo, width, height);
    this.velocity.swap();
  }

  solvePressure(iterations) {
    const gl = this.gl;
    const program = this.programs.pressure;
    const { width, height } = this.velocity.size;

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'uInverseTexSize'), 1 / width, 1 / height);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergence);
    gl.uniform1i(gl.getUniformLocation(program, 'uDivergence'), 1);

    for (let i = 0; i < iterations; i += 1) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
      gl.uniform1i(gl.getUniformLocation(program, 'uPressure'), 0);
      this.renderTo(this.pressure.write.fbo, width, height);
      this.pressure.swap();
    }
  }

  subtractGradient() {
    const gl = this.gl;
    const program = this.programs.gradient;
    const { width, height } = this.velocity.size;

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'uInverseTexSize'), 1 / width, 1 / height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uPressure'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uVelocity'), 1);

    this.renderTo(this.velocity.write.fbo, width, height);
    this.velocity.swap();
  }

  clearTarget(target, value) {
    const gl = this.gl;
    const program = this.programs.clear;
    const { width, height } = target.size;

    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, 'uValue'), value);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uTarget'), 0);
    this.renderTo(target.write.fbo, width, height);
    target.swap();
  }

  addVelocitySplat(point, force) {
    const gl = this.gl;
    const program = this.programs.velocitySplat;
    const { width, height } = this.velocity.size;

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'uPoint'), point[0], point[1]);
    gl.uniform2f(gl.getUniformLocation(program, 'uForce'), force[0], force[1]);
    gl.uniform1f(gl.getUniformLocation(program, 'uRadius'), this.settings.splatRadius);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uTarget'), 0);

    this.renderTo(this.velocity.write.fbo, width, height);
    this.velocity.swap();
  }

  addDyeSplat(point, color) {
    const gl = this.gl;
    const program = this.programs.splat;
    const { width, height } = this.dye.size;

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'uPoint'), point[0], point[1]);
    gl.uniform3f(gl.getUniformLocation(program, 'uColor'), color[0], color[1], color[2]);
    gl.uniform1f(gl.getUniformLocation(program, 'uRadius'), this.settings.splatRadius);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uTarget'), 0);

    this.renderTo(this.dye.write.fbo, width, height);
    this.dye.swap();
  }

  renderTo(target, width, height) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, width, height);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
