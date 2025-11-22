// galaxy.js
// Visually Stunning Hyperspace Vortex & Fractal Nebula Display using Three.js
// Phase 2: Sci-Fi Enhancements (Bloom, Warp, HUD)

const container = document.getElementById('canvas-container');
const hudVelocity = document.getElementById('velocity');
const hudStatus = document.getElementById('status');

// Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
0.85 // Threshold
);
bloomPass.strength = 2.0;
bloomPass.radius = 0.5;
bloomPass.threshold = 0.1;

const composer = new THREE.EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 1. FRACTAL NEBULA BACKGROUND SHADER
// ==========================================
const nebulaGeometry = new THREE.PlaneGeometry(30, 20);
const nebulaUniforms = {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    warpFactor: { value: 0.0 }
};

const nebulaVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const nebulaFragmentShader = `
    uniform float iTime;
    uniform vec2 iResolution;
    uniform float warpFactor;
    varying vec2 vUv;

    // Noise functions
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    float fbm(vec2 p) {
        float f = 0.0;
        float w = 0.5;
        for (int i = 0; i < 5; i++) {
            f += w * snoise(p);
            p *= 2.0;
            w *= 0.5;
        }
        return f;
    }

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= iResolution.x / iResolution.y;

        // Warp effect: stretch UVs from center
        float r = length(uv);
        uv *= 1.0 - (warpFactor * 0.2 * r); 

        float t = iTime * (0.2 + warpFactor * 2.0); // Speed up time
        
        vec2 q = vec2(0.);
        q.x = fbm(uv + 0.00 * t);
        q.y = fbm(uv + vec2(1.0));

        vec2 r2 = vec2(0.);
        r2.x = fbm(uv + 1.0 * q + vec2(1.7, 9.2) + 0.15 * t);
        r2.y = fbm(uv + 1.0 * q + vec2(8.3, 2.8) + 0.126 * t);

        float f = fbm(uv + r2);

        vec3 color = mix(
            vec3(0.1, 0.0, 0.2), 
            vec3(0.0, 0.0, 0.0), 
            clamp((f*f)*4.0, 0.0, 1.0)
        );

        color = mix(
            color,
            vec3(0.5, 0.1, 0.4), 
            clamp(length(q), 0.0, 1.0)
        );

        color = mix(
            color,
            vec3(0.0, 0.4, 0.6), 
            clamp(length(r2.x), 0.0, 1.0)
        );
        
        // Intensity boost during warp
        color += vec3(0.8, 0.5, 1.0) * pow(f, 3.0) * (1.0 + warpFactor);

        gl_FragColor = vec4(color, 1.0);
    }
`;

const nebulaMaterial = new THREE.ShaderMaterial({
    uniforms: nebulaUniforms,
    vertexShader: nebulaVertexShader,
    fragmentShader: nebulaFragmentShader,
    depthWrite: false,
});

const nebulaMesh = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
nebulaMesh.position.z = -5;
scene.add(nebulaMesh);


// ==========================================
// 2. HYPERSPACE VORTEX STARFIELD
// ==========================================
const starCount = 6000;
const starGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(starCount * 3);
const sizes = new Float32Array(starCount);
const speeds = new Float32Array(starCount);
const colors = new Float32Array(starCount * 3);

const colorPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xaaaaff),
    new THREE.Color(0xffaaee),
    new THREE.Color(0xaaffaa)
];

for (let i = 0; i < starCount; i++) {
    const r = Math.random() * 10 + 1;
    const theta = Math.random() * Math.PI * 2;
    const z = (Math.random() - 0.5) * 50;

    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(theta);
    positions[i * 3 + 2] = z;

    sizes[i] = Math.random() * 2.0;
    speeds[i] = Math.random() * 0.5 + 0.1;

    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
starGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const starUniforms = {
    iTime: { value: 0 },
    warpFactor: { value: 0.0 }
};

const starVertexShader = `
    uniform float iTime;
    uniform float warpFactor;
    attribute float size;
    attribute float speed;
    attribute vec3 color;
    varying vec3 vColor;

    void main() {
        vColor = color;
        vec3 pos = position;
        
        // Vortex rotation
        float currentSpeed = speed * (1.0 + warpFactor * 10.0);
        float angle = iTime * currentSpeed;
        
        float x = pos.x * cos(angle) - pos.y * sin(angle);
        float y = pos.x * sin(angle) + pos.y * cos(angle);
        
        // Hyperspace movement
        float zSpeed = 5.0 + warpFactor * 50.0;
        float z = mod(pos.z + iTime * zSpeed, 50.0) - 25.0;
        
        // Warp stretch effect
        // As warpFactor increases, stretch z based on speed
        float stretch = 1.0 + warpFactor * 5.0;
        
        vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Size attenuation
        gl_PointSize = size * (300.0 / -mvPosition.z) * stretch;
    }
`;

const starFragmentShader = `
    varying vec3 vColor;
    void main() {
        vec2 uv = gl_PointCoord.xy - 0.5;
        float dist = length(uv);
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        gl_FragColor = vec4(vColor, alpha);
    }
`;

const starMaterial = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

hudVelocity.innerText = currentSpeed.toFixed(2);

// Render with Bloom
composer.render();
}

animate();

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    nebulaUniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
});


