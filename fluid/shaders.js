// Shader source code for the 2D fluid solver and 3D visualization.
// Kept in a separate module so solver logic can stay focused on simulation steps.

export const baseVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;

out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const advectFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uInverseTexSize;
uniform float uDt;
uniform float uDissipation;

out vec4 outColor;

void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * velocity * uInverseTexSize;
  vec4 result = texture(uSource, coord);
  outColor = result * uDissipation;
}
`;

export const divergenceFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uVelocity;
uniform vec2 uInverseTexSize;

out vec4 outColor;

void main() {
  float l = texture(uVelocity, vUv - vec2(uInverseTexSize.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uInverseTexSize.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uInverseTexSize.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uInverseTexSize.y)).y;
  float div = 0.5 * (r - l + t - b);
  outColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

export const curlFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uVelocity;
uniform vec2 uInverseTexSize;

out vec4 outColor;

void main() {
  float l = texture(uVelocity, vUv - vec2(uInverseTexSize.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uInverseTexSize.x, 0.0)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uInverseTexSize.y)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uInverseTexSize.y)).x;
  float curl = r - l - t + b;
  outColor = vec4(curl, 0.0, 0.0, 1.0);
}
`;

export const vorticityFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uInverseTexSize;
uniform float uVorticity;
uniform float uDt;

out vec4 outColor;

void main() {
  float l = abs(texture(uCurl, vUv - vec2(uInverseTexSize.x, 0.0)).x);
  float r = abs(texture(uCurl, vUv + vec2(uInverseTexSize.x, 0.0)).x);
  float b = abs(texture(uCurl, vUv - vec2(0.0, uInverseTexSize.y)).x);
  float t = abs(texture(uCurl, vUv + vec2(0.0, uInverseTexSize.y)).x);
  float c = texture(uCurl, vUv).x;

  vec2 force = 0.5 * vec2(r - l, t - b);
  force /= (length(force) + 1e-5);
  force *= uVorticity * c;

  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * uDt;
  outColor = vec4(velocity, 0.0, 1.0);
}
`;

export const pressureFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uInverseTexSize;

out vec4 outColor;

void main() {
  float l = texture(uPressure, vUv - vec2(uInverseTexSize.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uInverseTexSize.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uInverseTexSize.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uInverseTexSize.y)).x;
  float div = texture(uDivergence, vUv).x;

  float pressure = (l + r + b + t - div) * 0.25;
  outColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const gradientSubtractFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uInverseTexSize;

out vec4 outColor;

void main() {
  float l = texture(uPressure, vUv - vec2(uInverseTexSize.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uInverseTexSize.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uInverseTexSize.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uInverseTexSize.y)).x;

  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= 0.5 * vec2(r - l, t - b);
  outColor = vec4(velocity, 0.0, 1.0);
}
`;

export const splatFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;

out vec4 outColor;

void main() {
  vec4 base = texture(uTarget, vUv);
  float d = distance(vUv, uPoint);
  float influence = exp(-d * d / uRadius);
  vec3 color = base.rgb + uColor * influence;
  float density = clamp(base.a + influence, 0.0, 1.0);
  outColor = vec4(color, density);
}
`;

export const velocitySplatFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec2 uForce;
uniform float uRadius;

out vec4 outColor;

void main() {
  vec2 velocity = texture(uTarget, vUv).xy;
  float d = distance(vUv, uPoint);
  float influence = exp(-d * d / uRadius);
  velocity += uForce * influence;
  outColor = vec4(velocity, 0.0, 1.0);
}
`;

export const clearFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uTarget;
uniform float uValue;

out vec4 outColor;

void main() {
  vec4 base = texture(uTarget, vUv);
  outColor = base * uValue;
}
`;

export const displayFragment = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uDye;
uniform vec2 uResolution;
uniform float uTime;

out vec4 outColor;

vec3 palette(float t) {
  vec3 a = vec3(0.2, 0.4, 0.6);
  vec3 b = vec3(0.3, 0.2, 0.3);
  vec3 c = vec3(0.6, 0.9, 0.4);
  vec3 d = vec3(0.4, 0.2, 0.8);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  vec3 rayOrigin = vec3(0.0, -1.6, 1.4);
  vec3 rayDir = normalize(vec3(uv, -1.2));

  float t = 0.0;
  vec3 accum = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < 40; i++) {
    vec3 pos = rayOrigin + rayDir * t;
    vec2 sampleUv = pos.xy * 0.5 + 0.5;
    float height = pos.z * 0.5 + 0.5;
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
      t += 0.06;
      continue;
    }
    float density = texture(uDye, sampleUv).a;
    float layer = smoothstep(height, height + 0.15, density);
    vec3 color = palette(density + 0.1 * sin(uTime + density * 6.0));
    float a = layer * 0.12;
    accum += (1.0 - alpha) * a * color;
    alpha += (1.0 - alpha) * a;
    t += 0.06;
  }

  vec3 base = palette(texture(uDye, vUv).a * 0.6);
  vec3 finalColor = mix(base, accum, alpha);
  outColor = vec4(finalColor, 1.0);
}
`;
