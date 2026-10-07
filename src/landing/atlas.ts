import * as THREE from "three";

export type AtlasController = { refreshRoutes: () => void };
type AtlasNode = {
  link: HTMLAnchorElement;
  direction: THREE.Vector3;
  group: THREE.Group;
  hit: THREE.Mesh;
  gem: THREE.Mesh;
  glow: THREE.Sprite;
  number: THREE.Sprite;
};

const AQUA = new THREE.Color("#9affea");
const LIME = new THREE.Color("#ddff75");
const AMBER = new THREE.Color("#ffba86");
const FRONT = new THREE.Vector3(0, 0, 1);

const seeded = (value: number): number => {
  const result = Math.sin(value * 127.17 + 91.71) * 43758.5453;
  return result - Math.floor(result);
};

const makeGlowTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(.18, "rgba(255,255,255,.62)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeNumberTexture = (label: string): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 48;
  const context = canvas.getContext("2d")!;
  context.font = "600 25px IBM Plex Mono, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#eafff4";
  context.fillText(label, 48, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeStrokeGeometry = (base: THREE.BufferGeometry): THREE.BufferGeometry => {
  const geometry = base.clone();
  const count = geometry.getAttribute("position").count;
  const progress = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let index = 0; index < count; index += 2) {
    progress[index] = 0;
    progress[index + 1] = 1;
    const value = seeded(index + 29);
    seed[index] = value;
    seed[index + 1] = value;
  }
  geometry.setAttribute("aProgress", new THREE.BufferAttribute(progress, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  return geometry;
};

const makeFractalBranches = (): THREE.BufferGeometry => {
  const segments: number[] = [];
  const directions: THREE.Vector3[] = [];
  const icosahedron = new THREE.IcosahedronGeometry(1, 0);
  const coordinates = icosahedron.getAttribute("position");
  const seen = new Set<string>();
  for (let index = 0; index < coordinates.count; index++) {
    const direction = new THREE.Vector3().fromBufferAttribute(coordinates, index).normalize();
    const key = direction.toArray().map((component) => component.toFixed(3)).join(",");
    if (!seen.has(key)) {
      seen.add(key);
      directions.push(direction);
    }
  }
  icosahedron.dispose();

  const branch = (start: THREE.Vector3, direction: THREE.Vector3, length: number, depth: number, seed: number) => {
    const end = start.clone().addScaledVector(direction, length);
    segments.push(start.x, start.y, start.z, end.x, end.y, end.z);
    if (depth === 0) return;
    const guide = new THREE.Vector3(Math.sin(seed * 1.9), Math.cos(seed * 2.7), Math.sin(seed * 3.7));
    const axis = direction.clone().cross(guide).normalize();
    if (axis.lengthSq() < .01) axis.set(0, 1, 0);
    branch(end, direction.clone().applyAxisAngle(axis, .52).normalize(), length * .67, depth - 1, seed + 1.3);
    branch(end, direction.clone().applyAxisAngle(axis, -.58).normalize(), length * .64, depth - 1, seed + 2.1);
  };
  directions.forEach((direction, index) => {
    branch(direction.clone().multiplyScalar(1.94), direction, .31, 3, index + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
};

const makeTicks = (): THREE.BufferGeometry => {
  const points: number[] = [];
  for (let index = 0; index < 120; index++) {
    const angle = index / 120 * Math.PI * 2;
    const inner = index % 10 === 0 ? 2.97 : 3.08;
    const outer = 3.18;
    points.push(
      Math.cos(angle) * inner, Math.sin(angle) * inner, 0,
      Math.cos(angle) * outer, Math.sin(angle) * outer, 0,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
};

const makeStars = (): THREE.Points => {
  const points: number[] = [];
  for (let index = 0; index < 470; index++) {
    points.push((seeded(index + 11) - .5) * 16, (seeded(index + 911) - .5) * 15, (seeded(index + 1811) - .5) * 12 - 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color: AQUA, size: .016, sizeAttenuation: true, transparent: true, opacity: .45,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
};

const directionFor = (category: "world" | "experiments" | "systems", index: number, count: number): THREE.Vector3 => {
  const offset = category === "world" ? .55 : category === "experiments" ? .18 : .76;
  const angle = index / count * Math.PI * 2 + offset;
  const latitude = category === "world" ? .67 : category === "systems" ? -.67 : .08 + Math.sin(index * 2.4) * .17;
  return new THREE.Vector3(
    Math.cos(latitude) * Math.cos(angle),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(angle),
  ).normalize();
};

export const createAtlas = (canvas: HTMLCanvasElement, art: HTMLElement): AtlasController => {
  const fallback = document.querySelector<HTMLElement>("#webgl-fallback");
  const callout = document.querySelector<HTMLElement>("#node-callout");
  const calloutNumber = document.querySelector<HTMLElement>("#node-callout-number");
  const calloutName = document.querySelector<HTMLElement>("#node-callout-name");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch (error) {
    console.warn("WebGL index unavailable; the destination directory remains usable.", error);
    if (fallback) fallback.hidden = false;
    canvas.hidden = true;
    return { refreshRoutes: () => {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x050d14, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 70);
  camera.position.z = 10.2;
  scene.add(makeStars());

  const assembly = new THREE.Group();
  assembly.rotation.set(-.12, -.35, .05);
  scene.add(assembly);
  const core = new THREE.Group();
  assembly.add(core);
  const nodeLayer = new THREE.Group();
  assembly.add(nodeLayer);

  // Three polygonal shells: one irregular triangulated skin, one ghost hull,
  // and a smaller core. The displaced outer skin gives the object its facets.
  const shell = new THREE.IcosahedronGeometry(1.94, 3);
  const shellPositions = shell.getAttribute("position");
  for (let index = 0; index < shellPositions.count; index++) {
    const x = shellPositions.getX(index), y = shellPositions.getY(index), z = shellPositions.getZ(index);
    const displacement = 1 + .035 * Math.sin(x * 8.3 + y * 4.1) * Math.cos(z * 9.7 - y * 5.4);
    shellPositions.setXYZ(index, x * displacement, y * displacement, z * displacement);
  }
  const wire = new THREE.WireframeGeometry(shell);
  shell.dispose();
  core.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({
    color: AQUA, transparent: true, opacity: .38, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  const strokeUniforms = { uTime: { value: 0 }, uColor: { value: AQUA } };
  const stroke = new THREE.LineSegments(makeStrokeGeometry(wire), new THREE.ShaderMaterial({
    uniforms: strokeUniforms,
    vertexShader: `
      attribute float aProgress;
      attribute float aSeed;
      varying float vProgress;
      varying float vSeed;
      void main() {
        vProgress = aProgress;
        vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying float vProgress;
      varying float vSeed;
      void main() {
        float phase = fract(vProgress * .88 - uTime * .32 + vSeed);
        float head = smoothstep(.025, .11, phase) * (1.0 - smoothstep(.22, .37, phase));
        gl_FragColor = vec4(uColor, head * .94);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  core.add(stroke);
  core.add(new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.27, 1)),
    new THREE.LineBasicMaterial({ color: AQUA, transparent: true, opacity: .075, depthWrite: false }),
  ));
  core.add(new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.DodecahedronGeometry(1.22, 1)),
    new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }),
  ));
  core.add(new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.TorusKnotGeometry(.56, .12, 100, 5, 2, 5)),
    new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: .48, blending: THREE.AdditiveBlending, depthWrite: false }),
  ));
  core.add(new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.83, 2),
    new THREE.MeshBasicMaterial({ color: "#2bc3ab", transparent: true, opacity: .035, side: THREE.DoubleSide, depthWrite: false }),
  ));

  const fractal = makeFractalBranches();
  core.add(new THREE.LineSegments(fractal, new THREE.LineBasicMaterial({
    color: AQUA, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  const redrawGeometry = fractal.clone();
  const redraw = new THREE.LineSegments(redrawGeometry, new THREE.LineBasicMaterial({
    color: LIME, transparent: true, opacity: .66, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.add(redraw);

  const orbits = new THREE.Group();
  scene.add(orbits);
  const ringMaterials = [
    new THREE.MeshBasicMaterial({ color: AQUA, transparent: true, opacity: .33, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: .29, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: AQUA, transparent: true, opacity: .17, blending: THREE.AdditiveBlending, depthWrite: false }),
  ];
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.75, .009, 3, 180), ringMaterials[0]);
  ringA.rotation.set(.58, .29, -.35);
  orbits.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.95, .007, 3, 180), ringMaterials[1]);
  ringB.rotation.set(-.82, .62, .45);
  orbits.add(ringB);
  const ringC = new THREE.Mesh(new THREE.TorusGeometry(3.25, .005, 3, 180), ringMaterials[2]);
  ringC.rotation.set(1.25, -.25, -.12);
  orbits.add(ringC);
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(3.06, .016, 3, 96, Math.PI * .94),
    new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  arc.rotation.z = -.8;
  orbits.add(arc);
  orbits.add(new THREE.LineSegments(makeTicks(), new THREE.LineBasicMaterial({
    color: AQUA, transparent: true, opacity: .2, depthWrite: false,
  })));

  const glowTexture = makeGlowTexture();
  const gemGeometry = new THREE.OctahedronGeometry(.092, 0);
  const coreGeometry = new THREE.SphereGeometry(.026, 8, 8);
  const haloGeometry = new THREE.TorusGeometry(.15, .009, 3, 28);
  const hitGeometry = new THREE.SphereGeometry(.25, 8, 8);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const nodes: AtlasNode[] = [];
  let hits: THREE.Mesh[] = [];
  const attached = new WeakSet<HTMLAnchorElement>();
  let activeIndex: number | null = null;
  let activeSource: "pointer" | "directory" | "focus" | null = null;
  let aim: THREE.Quaternion | null = null;
  let cameraTarget = 10.2;
  let dragging = false;
  let moved = false;
  let lastX = 0, lastY = 0;
  let pointerX = 0, pointerY = 0;
  let width = 1, height = 1;
  let time = 0;
  let redrawOffset = 0;
  let animationId = 0;
  const clock = new THREE.Clock();
  const projected = new THREE.Vector3();
  const connectorGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const connector = new THREE.Line(connectorGeometry, new THREE.LineBasicMaterial({
    color: LIME, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  connector.visible = false;
  assembly.add(connector);

  const categoryFor = (link: HTMLAnchorElement): "world" | "experiments" | "systems" => {
    const heading = link.closest(".route-group")?.querySelector("h1, h2");
    return heading?.id === "world-label" ? "world" : heading?.id === "systems-label" ? "systems" : "experiments";
  };
  const placeCallout = () => {
    if (!callout || activeIndex === null || !nodes[activeIndex]) return;
    if (activeSource === "directory" || activeSource === "focus") {
      nodes[activeIndex].group.getWorldPosition(projected);
      projected.project(camera);
      pointerX = (projected.x + 1) * width / 2;
      pointerY = (1 - projected.y) * height / 2;
    }
    callout.style.left = `${Math.max(24, Math.min(width - 183, pointerX + 19))}px`;
    callout.style.top = `${Math.max(40, Math.min(height - 65, pointerY - 16))}px`;
  };
  const setActive = (index: number | null, source: "pointer" | "directory" | "focus" | null) => {
    if (index === activeIndex && source === activeSource) {
      placeCallout();
      return;
    }
    activeIndex = index;
    activeSource = source;
    canvas.style.cursor = index === null ? (dragging ? "grabbing" : "grab") : "pointer";
    nodes.forEach((node, nodeIndex) => {
      const selected = nodeIndex === index;
      node.gem.scale.setScalar(selected ? 1.9 : 1);
      node.glow.scale.setScalar(selected ? .78 : .42);
      node.number.material.opacity = selected ? 1 : .63;
      node.link.classList.toggle("is-node-active", selected);
    });
    connector.visible = index !== null;
    if (index !== null) {
      redrawOffset = -time * 155;
      const node = nodes[index];
      const position = node.direction.clone().multiplyScalar(2.12);
      connectorGeometry.setFromPoints([new THREE.Vector3(), position]);
      if (calloutNumber) calloutNumber.textContent = String(index + 1).padStart(2, "0");
      if (calloutName) calloutName.textContent = node.link.querySelector(".route-name")?.textContent || node.link.textContent || "";
      if (callout) callout.hidden = false;
      if (source === "directory" || source === "focus") aim = new THREE.Quaternion().setFromUnitVectors(node.direction, FRONT);
      placeCallout();
    } else {
      if (callout) callout.hidden = true;
      aim = null;
    }
  };

  const refreshRoutes = () => {
    for (const node of nodes) {
      nodeLayer.remove(node.group);
      const gemMaterials = Array.isArray(node.gem.material) ? node.gem.material : [node.gem.material];
      gemMaterials.forEach((material) => material.dispose());
      node.glow.material.dispose();
      node.number.material.map?.dispose();
      node.number.material.dispose();
    }
    nodes.length = 0;
    hits = [];
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".route"));
    const categoryCounts = {
      world: links.filter((link) => categoryFor(link) === "world").length,
      experiments: links.filter((link) => categoryFor(link) === "experiments").length,
      systems: links.filter((link) => categoryFor(link) === "systems").length,
    };
    const categoryIndex = { world: 0, experiments: 0, systems: 0 };
    links.forEach((link, index) => {
      const category = categoryFor(link);
      const direction = directionFor(category, categoryIndex[category]++, categoryCounts[category]);
      const color = category === "world" ? LIME : category === "systems" ? AMBER : AQUA;
      const group = new THREE.Group();
      group.position.copy(direction).multiplyScalar(2.12);
      const gem = new THREE.Mesh(gemGeometry, new THREE.MeshBasicMaterial({ color, wireframe: true }));
      group.add(gem);
      const center = new THREE.Mesh(coreGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 }));
      group.add(center);
      const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: .67, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.quaternion.setFromUnitVectors(FRONT, direction);
      group.add(halo);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, color, transparent: true, opacity: .63, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(.42, .42, 1);
      group.add(glow);
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), direction.clone().multiplyScalar(.31)]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: .47, depthWrite: false }),
      );
      group.add(stem);
      const number = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeNumberTexture(String(index + 1).padStart(2, "0")),
        transparent: true, opacity: .63, depthWrite: false,
      }));
      number.position.copy(direction).multiplyScalar(.41);
      number.scale.set(.35, .18, 1);
      group.add(number);
      const hit = new THREE.Mesh(hitGeometry, hitMaterial);
      hit.userData.routeIndex = index;
      group.add(hit);
      nodeLayer.add(group);
      nodes.push({ link, direction, group, hit, gem, glow, number });
      hits.push(hit);
      if (!attached.has(link)) {
        link.addEventListener("pointerenter", () => {
          if (document.activeElement?.classList.contains("route")) return;
          setActive(nodes.findIndex((node) => node.link === link), "directory");
        });
        link.addEventListener("pointerleave", () => {
          if (document.activeElement !== link) setActive(null, null);
        });
        link.addEventListener("focus", () => setActive(nodes.findIndex((node) => node.link === link), "focus"));
        link.addEventListener("blur", () => setActive(null, null));
        attached.add(link);
      }
    });
    setActive(null, null);
  };

  const pick = (event: PointerEvent): number | null => {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height * 2 - 1),
    );
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(hits, false)[0];
    return hit ? Number(hit.object.userData.routeIndex) : null;
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    aim = null;
  });
  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointerX = event.clientX - bounds.left;
    pointerY = event.clientY - bounds.top;
    if (dragging) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      assembly.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dx * .006);
      assembly.rotateX(dy * .006);
      lastX = event.clientX;
      lastY = event.clientY;
      setActive(null, null);
    } else {
      setActive(pick(event), "pointer");
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    canvas.releasePointerCapture(event.pointerId);
    dragging = false;
    const index = pick(event);
    if (!moved && index !== null) window.location.assign(nodes[index].link.href);
    else setActive(index, index === null ? null : "pointer");
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; setActive(null, null); });
  canvas.addEventListener("pointerleave", () => { if (!dragging && activeSource === "pointer") setActive(null, null); });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    cameraTarget = THREE.MathUtils.clamp(cameraTarget + event.deltaY * .007, 6.7, 13);
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") cameraTarget = Math.max(6.7, cameraTarget - .7);
    else if (event.key === "-" || event.key === "_") cameraTarget = Math.min(13, cameraTarget + .7);
    else if (event.key === "ArrowLeft") assembly.rotateY(-.2);
    else if (event.key === "ArrowRight") assembly.rotateY(.2);
    else if (event.key === "ArrowUp") assembly.rotateX(-.2);
    else if (event.key === "ArrowDown") assembly.rotateX(.2);
    else if (event.key === "Enter" && activeIndex !== null) window.location.assign(nodes[activeIndex].link.href);
    else if (event.key === "Escape") { aim = new THREE.Quaternion(); cameraTarget = 10.2; setActive(null, null); }
    else return;
    event.preventDefault();
  });
  document.querySelector("#zoom-in")?.addEventListener("click", () => { cameraTarget = Math.max(6.7, cameraTarget - .8); });
  document.querySelector("#zoom-out")?.addEventListener("click", () => { cameraTarget = Math.min(13, cameraTarget + .8); });
  document.querySelector("#reset-view")?.addEventListener("click", () => {
    cameraTarget = 10.2;
    setActive(null, null);
    aim = new THREE.Quaternion();
  });

  const resize = () => {
    const bounds = art.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  new ResizeObserver(resize).observe(art);

  const animate = () => {
    animationId = requestAnimationFrame(animate);
    if (document.hidden) return;
    const delta = Math.min(clock.getDelta(), .05);
    if (!reduceMotion.matches) {
      time += delta;
      if (!dragging && !aim && activeIndex === null) assembly.rotateY(delta * .08);
      core.rotation.y += delta * .031;
      core.rotation.z += delta * .019;
      ringA.rotation.z += delta * .043;
      ringB.rotation.z -= delta * .031;
      ringC.rotation.y += delta * .018;
      arc.rotation.z -= delta * .12;
      strokeUniforms.uTime.value = time;
      const segmentCount = redrawGeometry.getAttribute("position").count;
      const count = Math.floor((time * 155 + redrawOffset) % (segmentCount / 2));
      redrawGeometry.setDrawRange(0, count * 2);
      nodes.forEach((node, index) => {
        const pulse = 1 + Math.sin(time * 2.3 + index * 1.8) * .13;
        if (index !== activeIndex) node.gem.scale.setScalar(pulse);
      });
    } else {
      redrawGeometry.setDrawRange(0, redrawGeometry.getAttribute("position").count);
    }
    if (aim) {
      assembly.quaternion.slerp(aim, 1 - Math.exp(-delta * 3.2));
      if (assembly.quaternion.angleTo(aim) < .002) aim = null;
    }
    camera.position.z += (cameraTarget - camera.position.z) * (1 - Math.exp(-delta * 5));
    if (activeIndex !== null) placeCallout();
    renderer.render(scene, camera);
  };
  refreshRoutes();
  resize();
  animate();
  window.addEventListener("pagehide", () => cancelAnimationFrame(animationId), { once: true });
  return { refreshRoutes };
};
