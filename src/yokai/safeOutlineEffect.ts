import * as THREE from "three";

type OutlineParameters = {
  thickness?: number;
  color?: [number, number, number];
  alpha?: number;
  visible?: boolean;
};

type OutlineSourceMaterial = THREE.Material & {
  userData: { outlineParameters?: OutlineParameters };
  wireframe?: boolean;
};

type OutlineMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

type SafeOutlineEffectOptions = {
  defaultThickness?: number;
  defaultColor?: [number, number, number];
  defaultAlpha?: number;
};

const vertexShader = /* glsl */ `
  #include <common>
  #include <uv_pars_vertex>
  #include <fog_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  #include <clipping_planes_pars_vertex>

  uniform float outlineThickness;

  void main() {
    #include <uv_vertex>

    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #include <project_vertex>

    // Expand in view space instead of normalizing the difference between two
    // clip-space positions. That difference can be exactly zero when a normal
    // aligns with the view ray; normalize(0) produces NaN clip coordinates and
    // can rasterize as a large black polygon for one frame.
    vec3 viewNormal = normalMatrix * objectNormal;
    float normalLength = length(viewNormal);
    if (normalLength > 0.00001) {
      viewNormal /= normalLength;
      mvPosition.xyz += viewNormal * outlineThickness * max(1.0, -mvPosition.z);
    }
    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
    #include <clipping_planes_vertex>
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <clipping_planes_pars_fragment>

  uniform vec3 outlineColor;
  uniform float outlineAlpha;

  void main() {
    #include <clipping_planes_fragment>
    #include <logdepthbuf_fragment>

    gl_FragColor = vec4(outlineColor, outlineAlpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

/**
 * A minimal, project-owned replacement for Three.js's OutlineEffect.
 *
 * Three's r160 effect expands vertices using normalize(pos - pos2), which has
 * a zero-vector pole. This renderer retains the same two-pass inverted-hull
 * treatment while using a guarded view-space normal for stable clip positions.
 */
export class SafeOutlineEffect {
  enabled = true;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly defaultThickness: number;
  private readonly defaultColor: [number, number, number];
  private readonly defaultAlpha: number;
  private readonly materialCache = new Map<string, THREE.ShaderMaterial>();
  private readonly invisibleMaterial = new THREE.MeshBasicMaterial({ visible: false });

  constructor(renderer: THREE.WebGLRenderer, options: SafeOutlineEffectOptions = {}) {
    this.renderer = renderer;
    this.defaultThickness = options.defaultThickness ?? 0.003;
    this.defaultColor = options.defaultColor ?? [0, 0, 0];
    this.defaultAlpha = options.defaultAlpha ?? 1;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
    if (!this.enabled) return;

    const originalMaterials = new Map<OutlineMesh, THREE.Material | THREE.Material[]>();
    const originalAutoClear = this.renderer.autoClear;
    const originalShadowMapEnabled = this.renderer.shadowMap.enabled;
    const originalMatrixWorldAutoUpdate = scene.matrixWorldAutoUpdate;
    const originalBackground = scene.background;

    try {
      scene.matrixWorldAutoUpdate = false;
      scene.background = null;
      this.renderer.autoClear = false;
      this.renderer.shadowMap.enabled = false;

      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;

        const mesh = object as OutlineMesh;
        const original = mesh.material;
        originalMaterials.set(mesh, original);

        if (Array.isArray(original)) {
          mesh.material = original.map((material) => this.getOutlineMaterial(material as OutlineSourceMaterial));
        } else {
          mesh.material = this.getOutlineMaterial(original as OutlineSourceMaterial);
        }
      });

      this.renderer.render(scene, camera);
    } finally {
      for (const [mesh, material] of originalMaterials) mesh.material = material;
      scene.matrixWorldAutoUpdate = originalMatrixWorldAutoUpdate;
      scene.background = originalBackground;
      this.renderer.autoClear = originalAutoClear;
      this.renderer.shadowMap.enabled = originalShadowMapEnabled;
    }
  }

  private getOutlineMaterial(source: OutlineSourceMaterial): THREE.Material {
    const parameters = source.userData.outlineParameters;
    if (
      source.visible === false ||
      source.wireframe === true ||
      source.depthTest === false ||
      parameters?.visible !== true
    ) {
      return this.invisibleMaterial;
    }

    let material = this.materialCache.get(source.uuid);
    if (!material) {
      material = new THREE.ShaderMaterial({
        uniforms: {
          outlineThickness: { value: this.defaultThickness },
          outlineColor: { value: new THREE.Color().fromArray(this.defaultColor) },
          outlineAlpha: { value: this.defaultAlpha },
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        fog: true,
      });
      this.materialCache.set(source.uuid, material);
    }

    const alpha = parameters.alpha ?? this.defaultAlpha;
    material.uniforms.outlineThickness.value = parameters.thickness ?? this.defaultThickness;
    material.uniforms.outlineColor.value.fromArray(parameters.color ?? this.defaultColor);
    material.uniforms.outlineAlpha.value = alpha;
    material.transparent = alpha < 1;
    material.toneMapped = source.toneMapped;
    material.premultipliedAlpha = source.premultipliedAlpha;
    return material;
  }
}
