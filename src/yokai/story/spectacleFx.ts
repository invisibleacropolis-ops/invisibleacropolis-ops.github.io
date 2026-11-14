import * as THREE from "three";
import { createRng } from "../../scene/random.ts";
import { createFlipbook } from "../vfx.ts";

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

export type ParticleStyle = "sparks" | "confetti" | "smoke" | "leaves";
export type BurstOptions = { count?: number; speed?: number; size?: number; life?: number; spread?: number; upward?: number };

/** Fixed-capacity billboard pool. CPU writes only spawn attributes; velocity,
 * turbulence, drag, gravity, flutter, growth and fading run on the GPU.
 * Transparent corners are discarded explicitly: no square sprite backgrounds. */
/** Spell smoke uses the Blender-baked, cel-shaded flipbook; the same
 * interface as the procedural styles below. */
function createSpellSmoke(capacity: number) {
  const smoke = createFlipbook({
    atlas: "puff", capacity, colors: ["#8c9aa3", "#d6dbe0", "#ffffff"],
    drag: 0.9, gravity: -6, turbulence: 10, wind: 0.5, growth: 2.6, spin: 0.35,
  });
  return {
    group: smoke.group, capacity,
    setColors(a: string, b: string) {
      const shadow = new THREE.Color(a).lerp(new THREE.Color(b), 0.3).multiplyScalar(0.8);
      smoke.setColors(`#${shadow.getHexString()}`, b, `#${new THREE.Color(b).lerp(new THREE.Color("#ffffff"), 0.6).getHexString()}`);
    },
    burst(at: THREE.Vector3, options: BurstOptions = {}) {
      smoke.emit(at, {
        count: options.count ?? 28, speed: options.speed ?? 28, size: (options.size ?? 50) * 1.15,
        life: options.life ?? 4.5, spread: options.spread ?? 8, upward: options.upward ?? 0.8,
      });
    },
    update(t: number) { smoke.update(t); },
    dispose() { smoke.dispose(); },
  };
}

/**
 * Spell sparkles ("sparks") are three species hatched from one seed:
 *  - stars: four-point diffraction stars with fainter diagonal spikes that
 *    breathe with a slow twinkle and streak into comets while they fly fast;
 *  - glints: small, hard strobes, like light catching on dust;
 *  - motes: soft bokeh discs that float upward and drift.
 * Each is born in a white flash; some flare once more before winking out.
 */
export function createSpellParticles(style: ParticleStyle, capacity = 512, seed = 71) {
  if ((style as string) === "smoke") return createSpellSmoke(capacity);
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
  const mode = style === "confetti" || style === "leaves" ? 1 : 0;
  const material = new THREE.ShaderMaterial({
    uniforms, defines: { STYLE: mode, LEAVES: style === "leaves" ? 1 : 0 }, transparent: true, depthWrite: false,
    blending: style === "sparks" ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aOrigin, aVelocity; attribute vec4 aBirth; attribute float aSeed;
      uniform float uTime; varying vec2 vUv; varying float vAge, vSeed, vLight, vStretch, vFlash, vKind;
      float h1(float n) { return fract(sin(n * 91.345) * 47453.21); }
      void main() {
        vUv=uv; vSeed=aSeed; float age=uTime-aBirth.x; vAge=age/aBirth.y; vLight=1.0; vStretch=0.0; vFlash=0.0; vKind=0.0;
        if(age<0.0 || age>=aBirth.y) { gl_Position=vec4(2,2,2,1); return; }
      #if STYLE == 0
        float pick=h1(aSeed*13.7);
        float kind=pick<0.55 ? 0.0 : pick<0.85 ? 1.0 : 2.0;      // star, glint, mote
        float drag=kind==2.0 ? 1.6 : 0.3+0.25*h1(aSeed*3.1);
        float grav=kind==2.0 ? -3.0 : 7.0;                       // motes rise
        float travel=(1.0-exp(-age*drag))/drag;
        vec3 p=aOrigin+aVelocity*travel;
        p.y-=grav*age*age;
        float wob=kind==2.0 ? 9.0 : 2.0;
        p.xz+=vec2(sin(age*2.1+aSeed*31.0),cos(age*1.7+aSeed*23.0))*age*wob;
        vec3 vel=aVelocity*exp(-age*drag); vel.y-=2.0*grav*age;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        vec2 vv=(modelViewMatrix*vec4(vel,0.0)).xy;
        float flash=exp(-age*7.0);
        float sz=aBirth.z*(kind==1.0 ? 1.3 : kind==2.0 ? 1.3 : 2.3)*(1.0-vAge*0.35)*(1.0+flash*0.4);
        // Motion blur as if exposed for ~1/20 s: fast stars become comets.
        float s=kind==2.0 ? 0.0 : clamp(length(vv)*0.05/sz*2.0, 0.0, 6.0);
        float spinA=aSeed*6.283+age*(0.3+aSeed*0.7)*(fract(aSeed*7.0)>0.5 ? 1.0 : -1.0);
        vec2 dir=normalize(mix(vec2(cos(spinA),sin(spinA)), vv/max(length(vv),1e-4), smoothstep(0.05,0.6,s)) + 1e-5);
        vec2 side=vec2(-dir.y,dir.x);
        mv.xy+=(dir*(position.x*(1.0+s)-0.5*s)+side*position.y)*sz;
        float tw;
        if(kind==1.0) tw=pow(0.5+0.5*sin(uTime*(17.0+aSeed*13.0)+aSeed*50.0),5.0)*1.7+0.06;
        else if(kind==2.0) tw=0.55+0.45*sin(uTime*(1.3+aSeed)+aSeed*20.0);
        else tw=0.4+0.6*pow(0.5+0.5*sin(uTime*(3.5+aSeed*6.0)+aSeed*40.0),2.0);
        vLight=tw; vStretch=s; vFlash=flash; vKind=kind;
        gl_Position=projectionMatrix*mv;
      #else
        float drag=0.32;
        float travel=(1.0-exp(-age*drag))/drag;
        vec3 p=aOrigin+aVelocity*travel;
        p.y-=13.0*age*age;
        p.xz+=vec2(sin(age*2.1+aSeed*31.0),cos(age*1.7+aSeed*23.0))*age*2.0;
        float angle=aSeed*6.283+age*(2.5+aSeed*5.0);
        mat2 spin=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        float size=aBirth.z*(1.0-vAge*0.4);
        vec2 quad=spin*position.xy*size;
        quad.x*=0.3+0.7*abs(cos(age*6.0+aSeed*20.0)); vLight=0.4+0.6*abs(sin(age*5.0+aSeed*12.0));
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        mv.xy+=quad;
        gl_Position=projectionMatrix*mv;
      #endif
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA,uColorB; varying vec2 vUv; varying float vAge,vSeed,vLight,vStretch,vFlash,vKind;
      ${noise}
      void main() {
        if(vAge<0.0 || vAge>=1.0) discard;
        vec2 p=(vUv-0.5)*2.0;
        vec3 color=mix(uColorA,uColorB,vSeed); float alpha;
      #if STYLE == 0
        // Head of the sparkle at q=0; a comet tail trails behind it along -x.
        vec2 q=vec2(p.x*(1.0+vStretch)-vStretch, p.y);
        float r=length(q), tw=vLight;
        vec3 hue=mix(color, spectrum(vSeed*3.0+vAge*0.4), 0.14);
        float env=smoothstep(0.0,0.03,vAge)*(1.0-smoothstep(0.6,1.0,vAge));
        float pop=exp(-pow((vAge-0.88)*20.0,2.0))*step(0.55,fract(vSeed*17.0));
        float glow, white;
        if(vKind==2.0) {
          float disc=1.0-smoothstep(0.48,0.6,r);
          glow=(disc*(0.3+0.2*smoothstep(0.3,0.58,r))+exp(-r*r*7.0)*0.2)*tw*0.5;
          white=0.15;
        } else {
          vec2 a=abs(q);
          float k=6.0/(0.35+min(tw,1.2));                    // brighter = longer spikes
          float spikes=exp(-a.y*15.0)*exp(-a.x*k)+exp(-a.x*15.0)*exp(-a.y*k);
          vec2 d=abs(vec2(q.x+q.y,q.x-q.y))*0.7071;
          float diag=(exp(-d.y*24.0)*exp(-d.x*k*2.2)+exp(-d.x*24.0)*exp(-d.y*k*2.2))*0.4;
          float core=exp(-r*r*(vKind==1.0 ? 90.0 : 70.0));
          float halo=exp(-r*r*9.0)*0.07;
          float tl=clamp(-q.x/(1.0+2.0*vStretch),0.0,1.0);
          float tail=step(q.x,0.0)*pow(1.0-tl,2.0)*exp(-q.y*q.y*(26.0+90.0*tl))*smoothstep(0.1,0.8,vStretch);
          float star=1.0/(1.0+vStretch*0.7);
          glow=core*(1.0+vFlash)+(spikes+diag)*tw*star*0.8+halo*(0.5+0.5*tw)+tail*0.7;
          white=core;
        }
        color=mix(hue*hue*1.15,vec3(1.0),clamp(white*0.9+vFlash*0.3,0.0,1.0))*(1.3+vFlash*0.8+pop*1.5);
        alpha=glow*env*(1.0+pop)*0.75;
        alpha*=1.0-smoothstep(0.85,1.0,max(abs(p.x),abs(p.y)));
      #else
        float r=length(p);
        float envelope=smoothstep(0.0,0.06,vAge)*(1.0-smoothstep(0.45,1.0,vAge));
        float shape=LEAVES==1 ? length(vec2(p.x*1.9,p.y*(1.0+0.35*abs(p.x)))) : max(abs(p.x),abs(p.y));
        alpha=(1.0-smoothstep(0.78,0.99,shape))*envelope;
        color=LEAVES==1 ? color*(0.75+0.35*vLight) : mix(color,spectrum(vSeed),0.72)*vLight;
        alpha*=1.0-smoothstep(0.9,1.0,r);
      #endif
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
      const count = Math.min(capacity, Math.max(0, Math.floor(options.count ?? 120)));
      const speed = options.speed ?? 95;
      const size = options.size ?? (style === "confetti" ? 9 : 13);
      const life = options.life ?? 3.5;
      for (let i = 0; i < count; i++) {
        const slot = cursor++ % capacity, a = rng() * Math.PI * 2, y = rng() * 1.5 - 0.4;
        const r = Math.sqrt(Math.max(0, 1 - y * y)), velocity = speed * (0.3 + rng() * 0.7), spread = options.spread ?? 8;
        origins.setXYZ(slot, at.x + (rng() - 0.5) * spread, at.y + (rng() - 0.5) * spread, at.z + (rng() - 0.5) * spread);
        velocities.setXYZ(slot, Math.cos(a) * r * velocity, (y + (options.upward ?? 0.8)) * velocity, Math.sin(a) * r * velocity);
        const duration = Math.max(0.05, life * (0.7 + rng() * 0.3));
        births.setXYZW(slot, time, duration, Math.max(0.01, size * (0.6 + rng() * 0.8)), 0);
        // Re-roll the seed so a reused slot hatches a different species.
        seeds.setX(slot, rng());
        aliveUntil = Math.max(aliveUntil, time + duration);
      }
      origins.needsUpdate = velocities.needsUpdate = births.needsUpdate = seeds.needsUpdate = true;
      group.visible = count > 0 || group.visible;
    },
    update(t: number) { if (disposed) return; time = t; uniforms.uTime.value = t; group.visible = t < aliveUntil; },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
}

/**
 * Echoes: a magic circle drawn onto the ground (or the air, when vertical)
 * with a shockwave rolling out of it.
 *  - The shockwave has a chromatic fringe (warm leading edge, cool trailing),
 *    a noise-wobbled front and two fainter echoes behind it.
 *  - The sigil inks itself around the circle: an outer double ring, a band of
 *    procedural glyphs (different for every cast), a tick-marked dial and a
 *    counter-rotating hexagram, with beads of light orbiting the rim.
 *  - It finishes by burning away through a noise threshold with ember edges.
 */
export function createEchoRings(color = "#ffd9a0", capacity = 8) {
  const group = new THREE.Group(); group.name = "spell-echo-rings";
  const geometry = new THREE.PlaneGeometry(2, 2);
  const rng = createRng(913);
  const slots = Array.from({ length: capacity }, () => {
    const uniforms = { uAge: { value: 2 }, uSeed: { value: 0 }, uDuration: { value: 3 }, uPull: { value: 0 }, uColor: { value: new THREE.Color(color) } };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      // Pulled toward the camera along each view ray: the circle keeps its
      // place on screen but lies over uneven ground instead of sinking into it.
      vertexShader: `uniform float uPull; varying vec2 vUv; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0);
        mv.xyz-=normalize(mv.xyz)*min(uPull,-mv.z*0.5); gl_Position=projectionMatrix*mv;}`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uAge, uSeed, uDuration; uniform vec3 uColor;
        ${noise}
        const float TAU=6.2831853;
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
        // A rune from a 3x3 lattice: a spine stroke plus a random handful of the rest.
        float glyph(vec2 c, float id) {
          float d=hash21(vec2(id,0.5))<0.5 ? seg(c,vec2(0.5,0.12),vec2(0.5,0.88)) : seg(c,vec2(0.18,0.86),vec2(0.82,0.86));
          #define ST(k,a,b) if(hash21(vec2(id,float(k)))>0.66) d=min(d,seg(c,a,b));
          ST(1,vec2(0.18,0.14),vec2(0.18,0.86)) ST(2,vec2(0.82,0.14),vec2(0.82,0.86))
          ST(3,vec2(0.18,0.5),vec2(0.82,0.5))   ST(4,vec2(0.18,0.14),vec2(0.82,0.14))
          ST(5,vec2(0.18,0.86),vec2(0.82,0.14)) ST(6,vec2(0.18,0.14),vec2(0.82,0.86))
          ST(7,vec2(0.5,0.86),vec2(0.82,0.5))   ST(8,vec2(0.18,0.5),vec2(0.5,0.14))
          ST(9,vec2(0.5,0.5),vec2(0.82,0.86))
          return d;
        }
        float line(float x, float w, float aa) { return 1.0-smoothstep(w, w+aa, abs(x)); }
        void main(){
          vec2 p=(vUv-0.5)*2.0; float r=length(p);
          float u=uAge, secs=u*uDuration;
          if(u<0.0 || u>=1.0 || r>1.0) discard;
          vec2 dir=p/max(r,1e-4);
          float ang=atan(p.y,p.x);

          // Shockwave and its echoes.
          vec3 shock=vec3(0.0);
          float wobble=(noise21(dir*3.0+uSeed*11.0+u*2.0)-0.5)*0.02;
          float wake=0.0;
          for(int i=0;i<3;i++) {
            float x=clamp((u-float(i)*0.11)/0.72,0.0,1.0);
            if(x<=0.0) continue;
            float front=(1.0-pow(1.0-x,2.6))*0.95;
            float w=0.006+0.016*front, amp=pow(1.0-x,0.8)*(1.0-float(i)*0.32);
            float wr=r+wobble*(1.0+float(i)*0.5);
            vec3 band=vec3(exp(-pow((wr-front-0.6*w)/w,2.0)), exp(-pow((wr-front)/w,2.0)), exp(-pow((wr-front+0.6*w)/w,2.0)));
            shock+=mix(band, uColor*band.g*1.3, 0.4)*amp;
            if(i==0) wake=step(wr,front)*exp(-(front-wr)*9.0)*0.12*(1.0-x);
          }

          // The sigil, in its own radius units.
          float S=0.46*(1.0+0.08*u);
          float rs=r/S;
          float aa=max(fwidth(rs),1e-4)*1.2;
          float lw=max(0.006,aa*0.6);
          float a01=fract(ang/TAU+0.25);                         // 0 at the top, sweeping round
          float draw=clamp(u/0.26,0.0,1.0);                       // the ink runs round the circle
          float inked=1.0-smoothstep(draw-0.015,draw,a01);
          float rot=secs*0.12, counter=-secs*0.2;
          float sig=0.0, flash=0.0;
          sig+=(line(rs-1.0,lw*1.6,aa)+line(rs-1.035,lw,aa)+line(rs-0.825,lw,aa)+line(rs-0.62,lw,aa))*inked;
          // Glyph band between 0.84 and 0.97.
          float N=42.0;
          float ga=fract(ang/TAU+rot/TAU)*N, gi=floor(ga);
          vec2 c=vec2(fract(ga),(rs-0.84)/0.13);
          if(c.y>0.0 && c.y<1.0) {
            float id=gi+floor(uSeed*997.0)*N;
            float on=step(gi/N,draw);
            float gd=hash21(vec2(id,7.7))<0.14 ? length(c-0.5)-0.06 : glyph(c,id);
            sig+=(1.0-smoothstep(0.07,0.07+aa/0.13*1.5,gd))*on;
            flash+=on*exp(-max(0.0,draw-gi/N)*14.0)*step(draw,0.999);
          }
          // A dial of ticks, longer every fifth.
          float ta=fract(ang/TAU-rot/TAU*0.5)*120.0;
          float tick=abs(fract(ta)-0.5)/120.0*TAU*rs;
          float major=step(abs(mod(floor(ta),5.0)),0.5);
          sig+=line(tick,lw,aa)*step(0.625,rs)*step(rs,0.66+0.05*major)*inked;
          // Counter-rotating hexagram, drawn from the centre outward.
          float grow=clamp((u-0.1)/0.22,0.0,1.0);
          float hexa=0.0;
          for(int k=0;k<2;k++) {
            float th=ang+counter+float(k)*TAU/6.0;
            float sector=mod(th,TAU/3.0)-TAU/6.0;
            hexa+=line(rs*cos(sector)-0.31,lw,aa);
          }
          sig+=hexa*step(rs,0.62)*step(rs,grow*0.62+0.001)+line(rs-0.31,lw,aa)*step(a01,grow);
          // Small node circles where the hexagram's points touch the dial.
          float step6=TAU/6.0;
          float vk=floor((ang+counter)/step6+0.5)*step6-counter;
          float nd=length(p/S-0.62*vec2(cos(vk),sin(vk)));
          float node=step(1.0,grow)*(line(nd-0.06,lw,aa)+(1.0-smoothstep(0.018,0.018+aa,nd)));
          sig+=node;
          float heart=exp(-rs*rs*60.0)*0.8*grow;
          // Beads of light running round the rim.
          float beads=pow(max(0.0,cos(ang*3.0-secs*2.6+uSeed*9.0)),90.0)*exp(-pow((rs-1.0)/0.03,2.0))*draw;

          // Burn away through noise, with ember edges.
          float burn=u<0.6 ? -1.0 : mix(0.2,0.86,smoothstep(0.6,0.98,u));
          float n=cloud(p*7.0+uSeed*13.0);
          float keep=smoothstep(burn,burn+0.05,n);
          float ember=(smoothstep(burn-0.09,burn,n)-smoothstep(burn,burn+0.05,n))*step(0.0,burn);

          float life=smoothstep(0.0,0.02,u);
          vec3 ink=mix(uColor,vec3(1.0),0.12);
          vec3 col=shock*1.5+vec3(1.0,0.96,0.88)*wake
                  +(ink*sig*(1.15+flash*2.5)+vec3(1.0)*(heart+beads*3.0))*keep
                  +(sig+0.15*step(rs,1.04))*ember*vec3(1.0,0.62,0.3)*1.6;
          col*=life*(1.0-smoothstep(0.92,1.0,r));
          if(max(col.r,max(col.g,col.b))<0.004) discard;
          gl_FragColor=vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    material.extensions.derivatives = true;
    material.userData.outlineParameters = { visible: false };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false; mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 3; group.add(mesh);
    return { mesh, material, uniforms, start: -100, duration: 3 };
  });
  let time = 0, cursor = 0, disposed = false;
  return {
    group,
    ring(at: THREE.Vector3, radius = 160, duration = 3, vertical = false) {
      if (disposed) return;
      const slot = slots[cursor++ % capacity]; slot.start = time; slot.duration = Math.max(0.1, duration);
      slot.mesh.position.copy(at); slot.mesh.scale.setScalar(radius);
      slot.mesh.rotation.set(vertical ? 0 : -Math.PI / 2, 0, rng() * Math.PI * 2);
      slot.mesh.visible = true; slot.uniforms.uAge.value = 0;
      slot.uniforms.uSeed.value = rng(); slot.uniforms.uDuration.value = slot.duration; slot.uniforms.uPull.value = radius * 0.4;
    },
    update(t: number) { time = t; slots.forEach((s) => { const age = (t - s.start) / s.duration; s.uniforms.uAge.value = age; s.mesh.visible = age >= 0 && age < 1; }); },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); slots.forEach((s) => s.material.dispose()); group.removeFromParent(); },
  };
}

/**
 * A rainbow read from the physics of one:
 *  - primary bow red outside to violet inside, from a smooth spectral curve;
 *  - pale pink-and-green supernumerary fringes just inside the violet;
 *  - a wider, fainter, reversed secondary bow;
 *  - brighter sky under the primary and Alexander's dark band between bows;
 *  - brightness that drifts with the rain curtain, and glittering droplets.
 * It draws itself in from one foot to the other as intensity first rises,
 * then fades in place, and mist gathers where it meets the ground.
 */
export function createRainbowArc(radius = 400, width = 35) {
  const group = new THREE.Group(); group.name = "spell-rainbow";
  const bows = new THREE.Group(); group.add(bows); bows.visible = false;
  const shared = { uTime: { value: 0 }, uIntensity: { value: 0 }, uReveal: { value: 0 } };
  const secondaryRadius = radius * 1.18, secondaryWidth = width * 1.6;
  const vertexShader = /* glsl */ `
    varying vec2 vUv; varying float vR; uniform float uInner,uOuter,uTime;
    void main(){ vUv=uv; float a=uv.x*3.14159265; float r=mix(uInner,uOuter,uv.y); vR=r;
      vec3 p=vec3(cos(a)*r,sin(a)*r,sin(a*9.0-uTime*0.65)*sin(a)*2.0);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`;
  const common = /* glsl */ `
    varying vec2 vUv; varying float vR; uniform float uTime,uIntensity,uReveal;
    ${noise}
    float ends() { return pow(max(0.0,sin(vUv.x*3.14159265)),0.4); }
    float revealed() { float rv=uReveal*1.12; return 1.0-smoothstep(rv-0.07,rv,vUv.x); }
    float patchiness(float k) { return 0.45+0.8*smoothstep(0.2,0.8,cloud(vec2(vUv.x*5.0-uTime*0.04,uTime*0.025+k))); }
  `;
  const bowMaterial = (inner: number, outer: number, secondary: boolean) => new THREE.ShaderMaterial({
    uniforms: { ...shared, uInner: { value: inner }, uOuter: { value: outer }, uSecondary: { value: secondary ? 1 : 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${common}
      uniform float uSecondary;
      vec3 spectral(float x) {        // 0 = violet .. 1 = red
        float r=exp(-pow((x-0.86)/0.2,2.0))+0.35*exp(-pow((x-0.04)/0.1,2.0));
        float g=exp(-pow((x-0.53)/0.18,2.0));
        float b=exp(-pow((x-0.2)/0.17,2.0));
        return clamp(vec3(r*1.05,g,b*1.1),0.0,1.0);
      }
      void main(){
        float y=vUv.y, secondary=uSecondary;
        float xs=secondary>0.5 ? 1.0-y : (y-0.22)/0.78;
        vec3 col=spectral(clamp(xs,0.0,1.0));
        float band=secondary>0.5 ? smoothstep(0.0,0.22,y)*(1.0-smoothstep(0.78,1.0,y))
                                 : smoothstep(0.16,0.3,y)*(1.0-smoothstep(0.86,1.0,y));
        float alpha=band*(0.75+0.25*sin(clamp(xs,0.0,1.0)*3.14159));
        if(secondary<0.5) {
          float z=(0.26-y)/0.26;
          float s=z*3.14159*4.0;
          vec3 sup=mix(vec3(0.55,0.95,0.62),vec3(0.98,0.58,0.86),0.5+0.5*cos(s));
          float supA=step(0.0,z)*(1.0-z)*smoothstep(0.0,0.1,y)*(0.55+0.45*cos(s*2.0))*0.4;
          col=mix(col,sup,clamp(supA/max(alpha+supA,1e-4),0.0,1.0));
          alpha=max(alpha,supA);
        }
        float glitter=pow(noise21(vec2(vUv.x*560.0,y*14.0-uTime*5.0)),14.0)*2.2*band;
        float rv=uReveal*1.12;
        float head=exp(-pow((vUv.x-rv+0.035)*28.0,2.0))*step(0.001,uReveal)*(1.0-smoothstep(0.98,1.08,rv));
        col=mix(col,vec3(1.0),clamp(glitter+head*0.8,0.0,1.0));
        alpha=(alpha*patchiness(secondary*7.0)+head*band*0.5)*ends()*revealed()*uIntensity*(secondary>0.5 ? 0.24 : 0.74);
        if(alpha<0.004) discard;
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // The sky between and under the bows: brighter inside, darker in Alexander's band.
  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...shared, uInner: { value: radius * 0.62 }, uOuter: { value: secondaryRadius }, uBowIn: { value: radius - width * 0.5 },
      uBowOut: { value: radius + width * 0.5 }, uSecondIn: { value: secondaryRadius - secondaryWidth * 0.5 },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${common}
      uniform float uInner,uBowIn,uBowOut,uSecondIn;
      void main(){
        float under=smoothstep(uInner,uBowIn,vR)*(1.0-smoothstep(uBowIn,uBowIn+(uBowOut-uBowIn)*0.4,vR));
        float gap=smoothstep(uBowOut-(uBowOut-uBowIn)*0.2,uBowOut+(uBowOut-uBowIn)*0.3,vR)*(1.0-smoothstep(uSecondIn-(uBowOut-uBowIn)*0.3,uSecondIn+(uBowOut-uBowIn)*0.2,vR));
        float k=ends()*revealed()*uIntensity*patchiness(3.0);
        vec3 col=under>gap ? vec3(1.0,0.99,0.96) : vec3(0.03,0.04,0.08);
        float alpha=max(under*under*0.22,gap*0.17)*k;
        if(alpha<0.003) discard;
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const materials = [
    veilMaterial,
    bowMaterial(radius - width * 0.5, radius + width * 0.5, false),
    bowMaterial(secondaryRadius - secondaryWidth * 0.5, secondaryRadius + secondaryWidth * 0.5, true),
  ];
  const bowGeometry = new THREE.PlaneGeometry(1, 1, 120, 10);
  const veilGeometry = new THREE.PlaneGeometry(1, 1, 120, 6);
  materials.forEach((material, i) => {
    material.userData.outlineParameters = { visible: false };
    const mesh = new THREE.Mesh(i === 0 ? veilGeometry : bowGeometry, material);
    mesh.frustumCulled = false; mesh.renderOrder = i;
    if (i === 2) mesh.position.z = -9;
    bows.add(mesh);
  });

  // Mist where the bow meets the ground (the Blender-baked puff).
  const mist = createFlipbook({
    atlas: "puff", capacity: 40, colors: ["#c7d2dc", "#eef3f7", "#ffffff"],
    drag: 1.0, gravity: -2, turbulence: 4, wind: 0.15, growth: 2.2, spin: 0.25, opacity: 0.55,
  });
  group.add(mist.group);
  const feet = [new THREE.Vector3(radius, 0, 0), new THREE.Vector3(-radius, 0, 0)];
  let disposed = false, reveal = 0, intensity = 0, last = 0;
  return { group,
    setIntensity(k: number) {
      intensity = clamp(k, 0, 1);
      reveal = intensity <= 0.001 ? 0 : Math.max(reveal, Math.min(1, intensity / 0.6));
      shared.uIntensity.value = intensity; shared.uReveal.value = reveal;
      bows.visible = intensity > 0.001;
    },
    update(t: number) {
      const dt = clamp(t - last, 0, 0.1); last = t;
      shared.uTime.value = t;
      if (intensity > 0.05) {
        // The far foot only mists once the arc has drawn all the way down to it.
        mist.stream(dt, 1.6 * intensity, feet[0], { size: width * 2.4, life: 5, speed: 5, upward: 0.3, spread: width, alpha: 0.75 * intensity });
        if (reveal > 0.95) mist.stream(dt, 1.6 * intensity, feet[1], { size: width * 2.4, life: 5, speed: 5, upward: 0.3, spread: width, alpha: 0.75 * intensity });
      }
      mist.update(t);
    },
    dispose() {
      if (disposed) return; disposed = true;
      bowGeometry.dispose(); veilGeometry.dispose(); materials.forEach((m) => m.dispose()); mist.dispose(); group.removeFromParent();
    },
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
