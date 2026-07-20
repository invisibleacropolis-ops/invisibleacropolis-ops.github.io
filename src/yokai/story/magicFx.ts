import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   Magical FX — shader-driven systems for the tales.

   Unlike the CPU-updated poofs and ripples in fx.ts, everything
   here animates on the GPU: particle motion is computed in the
   vertex shader from a seed attribute and a clock uniform, so a
   blizzard of six thousand flakes costs the CPU nothing at all.

     · DriftField  — snowfall, rising motes, diamond dust
     · Whirl       — spiralling vortices: blizzard breath, magic
     · FrostBloom  — crystalline rings that grow where winter steps
     · Aurora      — flowing ribbon lights above the mountains
     · ShieldDome  — a fresnel shimmer cupped over something dear
   ═══════════════════════════════════════════════════════════════ */

const softDisc = /* glsl */ `
  float softDisc(vec2 pc) {
    return 1.0 - smoothstep(0.28, 0.5, length(pc - 0.5));
  }
`;

/* ── DriftField ─────────────────────────────────────────────── */

export type DriftFieldFx = {
  group: THREE.Group;
  setIntensity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

export type DriftFieldOptions = {
  count?: number;
  /** Horizontal radius of the field around its group origin. */
  radius?: number;
  /** Vertical span the particles cycle through. */
  height?: number;
  /** units/second; negative falls (snow), positive rises (motes). */
  velocityY?: number;
  sway?: number;
  size?: number;
  colorA?: string;
  colorB?: string;
  twinkle?: number;
};

export const createDriftField = ({
  count = 5500,
  radius = 2800,
  height = 1500,
  velocityY = -170,
  sway = 46,
  size = 15,
  colorA = "#ffffff",
  colorB = "#dfeaf4",
  twinkle = 0.25,
}: DriftFieldOptions = {}): DriftFieldFx => {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const offsets = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    offsets[i * 3] = Math.cos(angle) * r;
    offsets[i * 3 + 1] = Math.random() * height;
    offsets[i * 3 + 2] = Math.sin(angle) * r;
    seeds[i] = Math.random() * 100;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(offsets, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uHeight: { value: height },
    uVelY: { value: velocityY },
    uSway: { value: sway },
    uSize: { value: size },
    uColorA: { value: new THREE.Color(colorA) },
    uColorB: { value: new THREE.Color(colorB) },
    uTwinkle: { value: twinkle },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uHeight;
      uniform float uVelY;
      uniform float uSway;
      uniform float uSize;
      varying float vSeed;

      void main() {
        vSeed = aSeed;
        vec3 p = position;
        float rate = 0.7 + 0.6 * fract(aSeed * 7.31);
        // Cycle through the vertical span forever, direction by uVelY's sign
        float travelled = uTime * abs(uVelY) * rate;
        float cycled = mod(p.y + (uVelY < 0.0 ? -travelled : travelled), uHeight);
        p.y = cycled < 0.0 ? cycled + uHeight : cycled;
        // Lazy figure-eight sway, each flake on its own clock
        p.x += sin(uTime * (0.6 + fract(aSeed * 3.7)) + aSeed * 12.0) * uSway;
        p.z += cos(uTime * (0.5 + fract(aSeed * 5.1)) + aSeed * 9.0) * uSway * 0.8;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.65 + 0.7 * fract(aSeed * 4.7)) * (300.0 / max(60.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uTime;
      uniform float uTwinkle;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vSeed;
      ${softDisc}

      void main() {
        float alpha = softDisc(gl_PointCoord) * uIntensity;
        alpha *= 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * 3.4 + vSeed * 40.0));
        if (alpha < 0.01) discard;
        vec3 color = mix(uColorA, uColorB, fract(vSeed * 5.13));
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  return {
    group,
    setIntensity: (k) => { uniforms.uIntensity.value = THREE.MathUtils.clamp(k, 0, 1); },
    update: (t) => { uniforms.uTime.value = t; },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};

/* ── Whirl ──────────────────────────────────────────────────── */

export type WhirlFx = {
  group: THREE.Group;
  setIntensity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

export type WhirlOptions = {
  count?: number;
  radiusBottom?: number;
  radiusTop?: number;
  height?: number;
  turns?: number;
  speed?: number;
  size?: number;
  colorA?: string;
  colorB?: string;
  additive?: boolean;
};

export const createWhirl = ({
  count = 900,
  radiusBottom = 60,
  radiusTop = 170,
  height = 420,
  turns = 3.2,
  speed = 0.22,
  size = 15,
  colorA = "#eaf6ff",
  colorB = "#9ecbe8",
  additive = true,
}: WhirlOptions = {}): WhirlFx => {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(count);
  // Position attribute is unused by the shader but required by three
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) seeds[i] = Math.random() * 100;
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uR0: { value: radiusBottom },
    uR1: { value: radiusTop },
    uHeight: { value: height },
    uTurns: { value: turns },
    uSpeed: { value: speed },
    uSize: { value: size },
    uColorA: { value: new THREE.Color(colorA) },
    uColorB: { value: new THREE.Color(colorB) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uR0;
      uniform float uR1;
      uniform float uHeight;
      uniform float uTurns;
      uniform float uSpeed;
      uniform float uSize;
      varying float vT;
      varying float vSeed;

      void main() {
        vSeed = aSeed;
        // Each mote rides the helix on its own eternal loop
        float t = fract(uTime * uSpeed * (0.55 + 0.9 * fract(aSeed * 3.3)) + fract(aSeed * 1.7));
        vT = t;
        float angle = fract(aSeed * 9.13) * 6.2831 + t * uTurns * 6.2831;
        float radius = mix(uR0, uR1, t) * (0.8 + 0.4 * fract(aSeed * 6.9));
        vec3 p = vec3(cos(angle) * radius, t * uHeight, sin(angle) * radius);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (1.15 - t * 0.6) * (300.0 / max(60.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vT;
      varying float vSeed;
      ${softDisc}

      void main() {
        float alpha = softDisc(gl_PointCoord) * uIntensity;
        // Bright at birth, dissolving at the crown
        alpha *= smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.7, 1.0, vT));
        if (alpha < 0.01) discard;
        vec3 color = mix(uColorA, uColorB, vT);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  return {
    group,
    setIntensity: (k) => { uniforms.uIntensity.value = THREE.MathUtils.clamp(k, 0, 1); },
    update: (t) => { uniforms.uTime.value = t; },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};

/* ── FrostBloom ─────────────────────────────────────────────── */

export type FrostBloomFx = {
  group: THREE.Group;
  bloom: (at: THREE.Vector3, scale?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export const createFrostBloomPool = (poolSize = 10): FrostBloomFx => {
  const group = new THREE.Group();

  type Bloom = { mesh: THREE.Mesh; uniforms: { uGrow: { value: number } }; life: number; scale: number };
  const blooms: Bloom[] = [];

  const makeMaterial = () => {
    const uniforms = { uGrow: { value: 0 } };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uGrow;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec2 p = vUv - 0.5;
          float d = length(p) * 2.0;
          float angle = atan(p.y, p.x);

          // Six-fold crystal spokes with jittered branches
          float spokes = abs(sin(angle * 3.0 + hash(vec2(floor(angle * 6.0), 1.0)) * 1.4));
          float branches = abs(sin(angle * 9.0 + d * 14.0));
          float crystal = smoothstep(0.55, 1.0, spokes) * 0.7 + smoothstep(0.75, 1.0, branches) * 0.5;

          // The bloom grows outward, sharp at its living edge, fading behind
          float edge = smoothstep(uGrow, uGrow - 0.16, d);
          float rim = smoothstep(uGrow - 0.05, uGrow, d) * smoothstep(uGrow + 0.02, uGrow, d);
          float sparkle = step(0.985, hash(floor(p * 44.0))) * 2.0;

          float alpha = (crystal * 0.55 + rim * 1.4 + sparkle * 0.4) * edge * (1.0 - d * 0.55);
          alpha *= smoothstep(1.35, 0.9, uGrow); // melt away after full growth
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(vec3(0.87, 0.95, 1.0), min(alpha, 0.9));
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    return { material, uniforms };
  };

  const circle = new THREE.CircleGeometry(1, 40);
  for (let i = 0; i < poolSize; i += 1) {
    const { material, uniforms } = makeMaterial();
    const mesh = new THREE.Mesh(circle, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    blooms.push({ mesh, uniforms, life: 0, scale: 1 });
    group.add(mesh);
  }
  let next = 0;

  return {
    group,
    bloom: (at, scale = 70) => {
      const b = blooms[next]!;
      next = (next + 1) % blooms.length;
      b.mesh.position.copy(at);
      b.mesh.position.y += 1.5;
      b.mesh.scale.setScalar(scale);
      b.mesh.rotation.z = Math.random() * Math.PI * 2;
      b.uniforms.uGrow.value = 0;
      b.life = 1;
      b.mesh.visible = true;
    },
    update: (dt) => {
      for (const b of blooms) {
        if (b.life <= 0) continue;
        b.uniforms.uGrow.value += dt * 0.55;
        if (b.uniforms.uGrow.value > 1.45) {
          b.life = 0;
          b.mesh.visible = false;
        }
      }
    },
    dispose: () => {
      circle.dispose();
      blooms.forEach((b) => (b.mesh.material as THREE.Material).dispose());
      group.removeFromParent();
    },
  };
};

/* ── Aurora ─────────────────────────────────────────────────── */

export type AuroraFx = {
  group: THREE.Group;
  setIntensity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

export const createAurora = ({
  colorA = "#7fe6b8",
  colorB = "#9a7dff",
}: { colorA?: string; colorB?: string } = {}): AuroraFx => {
  const group = new THREE.Group();
  const uniformsList: Array<{ uTime: { value: number }; uIntensity: { value: number }; uPhase: { value: number } }> = [];
  const disposables: Array<{ dispose: () => void }> = [];

  for (let i = 0; i < 3; i += 1) {
    const uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uPhase: { value: i * 2.1 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          // The whole curtain breathes and folds, slowly
          p.z += sin(uv.x * 9.0 + uTime * 0.22 + uPhase) * 110.0 * uv.y;
          p.y += sin(uv.x * 4.0 + uTime * 0.13 + uPhase) * 60.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uPhase;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // Rays: vertical filaments drifting sideways through the curtain
          float rays = noise(vec2(vUv.x * 14.0 - uTime * 0.07 + uPhase, vUv.y * 2.0));
          rays = smoothstep(0.36, 0.72, rays);
          // Bright skirt at the bottom hem, dissolving upward
          float hem = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.12, 0.95, vUv.y));
          float body = (1.0 - smoothstep(0.0, 0.85, vUv.y)) * 0.4;
          float alpha = (hem * 1.1 + body) * rays * uIntensity;
          if (alpha < 0.01) discard;
          vec3 color = mix(uColorA, uColorB, vUv.y + sin(vUv.x * 5.0 + uPhase) * 0.15);
          gl_FragColor = vec4(color, alpha * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const geometry = new THREE.PlaneGeometry(4600 - i * 700, 950 + i * 220, 72, 1);
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.position.set(-1400 + i * 900, 2000 + i * 320, -3400 - i * 500);
    ribbon.rotation.y = 0.25 - i * 0.2;
    group.add(ribbon);
    uniformsList.push(uniforms);
    disposables.push(geometry, material);
  }

  return {
    group,
    setIntensity: (k) => uniformsList.forEach((u) => { u.uIntensity.value = THREE.MathUtils.clamp(k, 0, 1); }),
    update: (t) => uniformsList.forEach((u) => { u.uTime.value = t; }),
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      group.removeFromParent();
    },
  };
};

/* ── ShieldDome ─────────────────────────────────────────────── */

export type ShieldDomeFx = {
  mesh: THREE.Mesh;
  setIntensity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

export const createShieldDome = (radius = 46, color = "#cfe8ff"): ShieldDomeFx => {
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uColor: { value: new THREE.Color(color) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        float shimmer = 0.75 + 0.25 * sin(uTime * 2.6 + vNormal.y * 8.0 + vNormal.x * 6.0);
        float alpha = (fresnel * 0.85 + 0.05) * shimmer * uIntensity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material);

  return {
    mesh,
    setIntensity: (k) => { uniforms.uIntensity.value = THREE.MathUtils.clamp(k, 0, 1); },
    update: (t) => { uniforms.uTime.value = t; },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
};
