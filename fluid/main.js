// Entry point for the fluid demo. Handles WebGL context, input, and rendering.

import { FluidSolver } from './solver.js';
import { baseVertex, displayFragment } from './shaders.js';

function createProgram(gl, fragmentSource) {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, baseVertex);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(vertexShader));
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(fragmentShader));
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function createFullscreenQuad(gl) {
  const vertices = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
  ]);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
}

function randomColor() {
  const hue = Math.random();
  const saturation = 0.7 + Math.random() * 0.3;
  const lightness = 0.45 + Math.random() * 0.25;
  const rgb = hslToRgb(hue, saturation, lightness);
  return rgb;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1 / 6) [r, g, b] = [c, x, 0];
  else if (h < 2 / 6) [r, g, b] = [x, c, 0];
  else if (h < 3 / 6) [r, g, b] = [0, c, x];
  else if (h < 4 / 6) [r, g, b] = [0, x, c];
  else if (h < 5 / 6) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl2');

if (!gl) {
  const message = document.querySelector('.status');
  message.textContent = 'WebGL2 is required for this demo.';
  throw new Error('WebGL2 unavailable');
}

const floatExt = gl.getExtension('EXT_color_buffer_float');
const linearExt = gl.getExtension('OES_texture_float_linear');

if (!floatExt || !linearExt) {
  const message = document.querySelector('.status');
  message.textContent = 'Floating point textures are required for this demo.';
  throw new Error('Float textures unavailable');
}

const displayProgram = createProgram(gl, displayFragment);
const displayVao = createFullscreenQuad(gl);

const solver = new FluidSolver(gl, {
  simSize: 256,
  dyeSize: 512,
});

solver.clearTarget(solver.velocity, 0.0);
solver.clearTarget(solver.dye, 0.0);
solver.clearTarget(solver.pressure, 0.0);

const pointerState = {
  isDown: false,
  last: null,
  color: randomColor(),
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  gl.viewport(0, 0, width, height);
  solver.resize(dpr);
  solver.clearTarget(solver.velocity, 0.0);
  solver.clearTarget(solver.dye, 0.0);
  solver.clearTarget(solver.pressure, 0.0);
}

function getPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = 1 - (event.clientY - rect.top) / rect.height;
  return [x, y];
}

function handlePointerDown(event) {
  pointerState.isDown = true;
  pointerState.last = getPointerPosition(event);
  pointerState.color = randomColor();
}

function handlePointerMove(event) {
  if (!pointerState.isDown) return;
  const current = getPointerPosition(event);
  const last = pointerState.last || current;
  const dx = current[0] - last[0];
  const dy = current[1] - last[1];
  pointerState.last = current;

  const force = [dx * 600, dy * 600];
  solver.addVelocitySplat(current, force);
  solver.addDyeSplat(current, pointerState.color);
}

function handlePointerUp() {
  pointerState.isDown = false;
  pointerState.last = null;
}

canvas.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);

window.addEventListener('touchstart', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  handlePointerDown(touch);
}, { passive: false });

window.addEventListener('touchmove', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  handlePointerMove(touch);
}, { passive: false });

window.addEventListener('touchend', handlePointerUp);
window.addEventListener('resize', resize);

resize();

let lastTime = performance.now();

function render(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.016);
  lastTime = now;

  solver.step(dt);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(displayProgram);
  gl.bindVertexArray(displayVao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, solver.dye.read.texture);
  gl.uniform1i(gl.getUniformLocation(displayProgram, 'uDye'), 0);
  gl.uniform2f(gl.getUniformLocation(displayProgram, 'uResolution'), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(displayProgram, 'uTime'), now * 0.001);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
