import * as THREE from "three";
import { createRng } from "../../scene/random.ts";

const clamp = THREE.MathUtils.clamp;
const noise = /* glsl */ `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise21(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);
}
float cloud(vec2 p) { return noise21(p)*0.57+noise21(p*2.03+7.1)*0.28+noise21(p*4.07+19.0)*0.15; }
vec3 spectrum(float t) { return 0.55+0.45*cos(6.2831853*(t+vec3(0.0,0.33,0.67))); }
`;

export type ParticleStyle = "sparks" | "confetti" | "smoke";
export type BurstOptions = { count?: number; speed?: number; size?: number; life?: number; spread?: number; upward?: number };

/** Fixed-capacity billboard pool. CPU writes only spawn attributes; velocity,
 * turbulence, drag, gravity, flutter, growth and fading run on the GPU.
 * Transparent corners are discarded explicitly: no square sprite backgrounds. */
export function createSpellParticles(style: ParticleStyle, capacity = 512, seed = 71) {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = `spell-${style}`;
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(base.index!.clone());
  geometry.setAttribute("position", base.attributes.position.clone());
  geometry.setAttribute("uv", base.attributes.uv.clone());
  base.dispose();
  const origins = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const velocities = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const births = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  for (let i = 0; i < capacity; i++) { births.setXYZW(i, -1000, 1, 1, 0); seeds.setX(i, rng()); }
  geometry.setAttribute("aOrigin", origins); geometry.setAttribute("aVelocity", velocities);
  geometry.setAttribute("aBirth", births); geometry.setAttribute("aSeed", seeds);
  geometry.instanceCount = capacity;
  const uniforms = { uTime: { value: 0 }, uColorA: { value: new THREE.Color("#ffce70") }, uColorB: { value: new THREE.Color("#b1ecff") } };
  const mode = style === "smoke" ? 2 : style === "confetti" ? 1 : 0;
  const material = new THREE.ShaderMaterial({
    uniforms, defines: { STYLE: mode }, transparent: true, depthWrite: false,
    blending: style === "sparks" ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aOrigin, aVelocity; attribute vec4 aBirth; attribute float aSeed;
      uniform float uTime; varying vec2 vUv; varying float vAge, vSeed, vLight;
      void main() {
        vUv=uv; vSeed=aSeed; float age=uTime-aBirth.x; vAge=age/aBirth.y; vLight=1.0;
        if(age<0.0 || age>=aBirth.y) { gl_Position=vec4(2,2,2,1); return; }
        float drag=STYLE==2 ? 0.7 : 0.32;
        float travel=(1.0-exp(-age*drag))/drag;
        vec3 p=aOrigin+aVelocity*travel;
        p.y-=(STYLE==2 ? -3.0 : STYLE==1 ? 13.0 : 7.0)*age*age;
        p.xz+=vec2(sin(age*2.1+aSeed*31.0),cos(age*1.7+aSeed*23.0))*age*(STYLE==2 ? 5.0 : 2.0);
        float angle=aSeed*6.283+age*(STYLE==2 ? 0.2 : 2.5+aSeed*5.0);
        mat2 spin=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        float size=aBirth.z*(STYLE==2 ? 1.0+vAge*2.4 : 1.0-vAge*0.4);
        vec2 quad=spin*position.xy*size;
        if(STYLE==1) { quad.x*=0.3+0.7*abs(cos(age*6.0+aSeed*20.0)); vLight=0.4+0.6*abs(sin(age*5.0+aSeed*12.0)); }
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        mv.xy+=quad;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA,uColorB; varying vec2 vUv; varying float vAge,vSeed,vLight;
      ${noise}
      void main() {
        if(vAge<0.0 || vAge>=1.0) discard;
        vec2 p=(vUv-0.5)*2.0; float r=length(p);
        float envelope=smoothstep(0.0,0.06,vAge)*(1.0-smoothstep(0.45,1.0,vAge));
        vec3 color=mix(uColorA,uColorB,vSeed); float alpha;
        if(STYLE==2) {
          float n=cloud(p*2.7+vec2(vSeed*19.0,-vAge*2.0));
          float density=(1.0-smoothstep(0.25,0.98,r+n*0.22))*smoothstep(0.2,0.75,n);
          alpha=density*envelope*0.55;
          color*=0.7+n*0.6;
        } else if(STYLE==1) {
          alpha=(1.0-smoothstep(0.78,0.99,max(abs(p.x),abs(p.y))))*envelope;
          color=mix(color,spectrum(vSeed),0.72)*vLight;
        } else {
          float core=exp(-r*r*22.0);
          float rays=exp(-abs(p.x)*24.0)*exp(-abs(p.y)*3.0)+exp(-abs(p.y)*24.0)*exp(-abs(p.x)*3.0);
          alpha=(core+rays*0.5+exp(-r*r*5.0)*0.18)*envelope;
          color*=1.7;
        }
        alpha*=1.0-smoothstep(0.9,1.0,r);
        if(alpha<0.004) discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh); group.visible = false;
  let cursor = 0, time = 0, aliveUntil = 0, disposed = false;
  return {
    group, capacity,
    setColors(a: string, b: string) { uniforms.uColorA.value.set(a); uniforms.uColorB.value.set(b); },
    burst(at: THREE.Vector3, options: BurstOptions = {}) {
      if (disposed) return;
      const count = Math.min(capacity, Math.max(0, Math.floor(options.count ?? (style === "smoke" ? 28 : 120))));
      const speed = options.speed ?? (style === "smoke" ? 28 : 95);
      const size = options.size ?? (style === "smoke" ? 50 : style === "confetti" ? 9 : 13);
      const life = options.life ?? (style === "smoke" ? 4.5 : 3.5);
      for (let i = 0; i < count; i++) {
        const slot = cursor++ % capacity, a = rng() * Math.PI * 2, y = rng() * 1.5 - 0.4;
        const r = Math.sqrt(Math.max(0, 1 - y * y)), velocity = speed * (0.3 + rng() * 0.7), spread = options.spread ?? 8;
        origins.setXYZ(slot, at.x + (rng() - 0.5) * spread, at.y + (rng() - 0.5) * spread, at.z + (rng() - 0.5) * spread);
        velocities.setXYZ(slot, Math.cos(a) * r * velocity, (y + (options.upward ?? 0.8)) * velocity, Math.sin(a) * r * velocity);
        const duration = Math.max(0.05, life * (0.7 + rng() * 0.3));
        births.setXYZW(slot, time, duration, Math.max(0.01, size * (0.6 + rng() * 0.8)), 0);
        aliveUntil = Math.max(aliveUntil, time + duration);
      }
      origins.needsUpdate = velocities.needsUpdate = births.needsUpdate = true;
      group.visible = count > 0 || group.visible;
    },
    update(t: number) { if (disposed) return; time = t; uniforms.uTime.value = t; group.visible = t < aliveUntil; },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
}

/** Pooled, interference-pattern shockwaves with three expanding echo bands. */
export function createEchoRings(color = "#ffd9a0", capacity = 8) {
  const group = new THREE.Group(); group.name = "spell-echo-rings";
  const geometry = new THREE.PlaneGeometry(2, 2);
  const slots = Array.from({ length: capacity }, () => {
    const uniforms = { uAge: { value: 2 }, uColor: { value: new THREE.Color(color) } };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uAge; uniform vec3 uColor;
        void main(){
          vec2 p=(vUv-0.5)*2.0; float r=length(p), angle=atan(p.y,p.x);
          float waves=0.0;
          for(int i=0;i<3;i++) { float front=uAge*1.35-float(i)*0.16; waves+=exp(-pow((r-front)*65.0,2.0))*(1.0-float(i)*0.22); }
          float runes=pow(max(0.0,cos(angle*18.0+uAge*4.0)),12.0);
          float alpha=waves*(0.6+0.4*runes)*(1.0-smoothstep(0.45,1.0,uAge))*(1.0-smoothstep(0.88,1.0,r));
          if(alpha<0.004) discard; gl_FragColor=vec4(uColor*1.6,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    material.userData.outlineParameters = { visible: false };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false; mesh.rotation.x = -Math.PI / 2; group.add(mesh);
    return { mesh, material, uniforms, start: -100, duration: 3 };
  });
  let time = 0, cursor = 0, disposed = false;
  return {
    group,
    ring(at: THREE.Vector3, radius = 160, duration = 3, vertical = false) {
      if (disposed) return;
      const slot = slots[cursor++ % capacity]; slot.start = time; slot.duration = Math.max(0.1, duration);
      slot.mesh.position.copy(at); slot.mesh.scale.setScalar(radius); slot.mesh.rotation.x = vertical ? 0 : -Math.PI / 2;
      slot.mesh.visible = true; slot.uniforms.uAge.value = 0;
    },
    update(t: number) { time = t; slots.forEach((s) => { const age = (t - s.start) / s.duration; s.uniforms.uAge.value = age; s.mesh.visible = age >= 0 && age < 1; }); },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); slots.forEach((s) => s.material.dispose()); group.removeFromParent(); },
  };
}

/** Double spectral arch: luminous ribbons, flowing interference filaments,
 * soft endpoints and an offset secondary bow, without a full-screen pass. */
export function createRainbowArc(radius = 400, width = 35) {
  const group = new THREE.Group(); group.name = "spell-rainbow";
  const geometry = new THREE.PlaneGeometry(1, 1, 100, 8);
  const uniforms = { uTime: { value: 0 }, uIntensity: { value: 0 }, uRadius: { value: radius }, uWidth: { value: width } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv; uniform float uRadius,uWidth,uTime;
      void main(){ vUv=uv; float a=uv.x*3.14159265; float r=uRadius+(uv.y-0.5)*uWidth;
        vec3 p=vec3(cos(a)*r,sin(a)*r,sin(a*9.0-uTime*0.65)*sin(a)*3.0);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime,uIntensity; ${noise}
      void main(){
        float edge=smoothstep(0.0,0.13,vUv.y)*(1.0-smoothstep(0.87,1.0,vUv.y));
        float ends=pow(max(0.0,sin(vUv.x*3.14159265)),0.35);
        float threads=0.65+0.35*sin(vUv.y*150.0+vUv.x*35.0-uTime*1.5);
        vec3 color=spectrum(vUv.y*0.8+0.08)+vec3(pow(max(0.0,sin(vUv.x*80.0-uTime*2.0)),24.0)*0.3);
        float alpha=edge*ends*threads*uIntensity*0.65;
        if(alpha<0.004) discard; gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const primary = new THREE.Mesh(geometry, material); primary.frustumCulled = false;
  const secondary = primary.clone(); secondary.scale.setScalar(1.13); secondary.position.z = -9;
  group.add(primary, secondary); group.visible = false;
  let disposed = false;
  return { group,
    setIntensity(k: number) { uniforms.uIntensity.value = clamp(k, 0, 1); group.visible = k > 0.001; },
    update(t: number) { uniforms.uTime.value = t; },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
}

/** Additive rim iridescence and flowing contour lines inside the existing toon
 * shader: preserves skinning, lighting, depth and the character's silhouette. */
export function enchantCharacter(root: THREE.Object3D, color = "#ffd9a0") {
  const uniforms = { uSpellTime: { value: 0 }, uSpellPower: { value: 0 }, uSpellColor: { value: new THREE.Color(color) } };
  const changed = new Map<THREE.MeshToonMaterial, { hook: THREE.Material["onBeforeCompile"]; key: THREE.Material["customProgramCacheKey"] }>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!(mat instanceof THREE.MeshToonMaterial) || changed.has(mat) || mat.userData.outlineParameters?.visible === false) continue;
      const hook = mat.onBeforeCompile, key = mat.customProgramCacheKey;
      changed.set(mat, { hook, key });
      mat.onBeforeCompile = (shader, renderer) => {
        hook.call(mat, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = `uniform float uSpellTime,uSpellPower; uniform vec3 uSpellColor;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
          #include <emissivemap_fragment>
          vec3 spellView=vViewPosition/max(length(vViewPosition),0.0001);
          float spellRim=pow(1.0-clamp(dot(normal,spellView),0.0,1.0),2.3);
          float spellBands=pow(0.5+0.5*sin(vViewPosition.y*0.36+uSpellTime*1.8),10.0);
          totalEmissiveRadiance+=uSpellColor*uSpellPower*(spellRim*1.4+spellBands*0.18);
        `);
      };
      mat.customProgramCacheKey = () => `${key.call(mat)}:spell-rim-v1`;
      mat.needsUpdate = true;
    }
  });
  return {
    setIntensity(k: number) { uniforms.uSpellPower.value = clamp(k, 0, 1); },
    update(t: number) { uniforms.uSpellTime.value = t; },
    dispose() { changed.forEach(({ hook, key }, mat) => { mat.onBeforeCompile = hook; mat.customProgramCacheKey = key; mat.needsUpdate = true; }); changed.clear(); },
  };
}
