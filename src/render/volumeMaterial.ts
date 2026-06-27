import * as THREE from 'three';

// Emissive volumetric raymarcher for the Buddhabrot density grid. The grid is
// an RGB float texture (raw orbit counts). Normalisation, log compression,
// per-channel exposure, saturation grading and tone mapping all happen in the
// shader so the look can be tuned instantly without recomputing the volume.

const vertexShader = /* glsl */ `
out vec3 vOrigin;
out vec3 vDirection;
void main() {
  vec4 worldCam = inverse(modelMatrix) * vec4(cameraPosition, 1.0);
  vOrigin = worldCam.xyz;
  vDirection = position - vOrigin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp sampler3D;

in vec3 vOrigin;
in vec3 vDirection;
out vec4 outColor;

uniform sampler3D uVolume;
uniform vec3  uMaxCount;
uniform float uSteps;
uniform float uExposure;
uniform float uDensity;
uniform float uAbsorb;
uniform vec3  uChanExp;
uniform float uGamma;
uniform float uLog;
uniform float uLogScale;
uniform float uTone;     // 0 none, 1 reinhard, 2 aces, 3 filmic
uniform float uSat;
uniform float uJitter;
uniform float uTime;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 acesToneMap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 filmicToneMap(vec3 x) {
  vec3 X = max(vec3(0.0), x - 0.004);
  vec3 r = (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);
  return pow(r, vec3(2.2)); // undo built-in gamma; we apply our own later
}

void main() {
  vec3 ro = vOrigin;
  vec3 rd = normalize(vDirection);
  vec3 invDir = 1.0 / rd;
  vec3 t0 = (vec3(-1.0) - ro) * invDir;
  vec3 t1 = (vec3( 1.0) - ro) * invDir;
  vec3 tminv = min(t0, t1);
  vec3 tmaxv = max(t0, t1);
  float tn = max(max(tminv.x, tminv.y), tminv.z);
  float tf = min(min(tmaxv.x, tmaxv.y), tmaxv.z);
  tn = max(tn, 0.0);
  if (tn > tf) { discard; }

  float steps = uSteps;
  float dt = (tf - tn) / steps;
  float jitter = uJitter * hash(vec3(gl_FragCoord.xy, uTime));
  float t = tn + dt * jitter;

  vec3 logDen = log(1.0 + uMaxCount * uLogScale);

  // Front-to-back emission + absorption compositing. Dense cores accumulate
  // opacity and occlude material behind them, producing genuine 3D depth
  // rather than a flat x-ray sum.
  vec3 colAcc = vec3(0.0);
  float aAcc = 0.0;

  for (float i = 0.0; i < 4096.0; i += 1.0) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    vec3 uvw = p * 0.5 + 0.5;
    vec3 raw = texture(uVolume, uvw).rgb;

    vec3 v;
    if (uLog > 0.5) {
      v = log(1.0 + raw * uLogScale) / max(logDen, vec3(1e-4));
    } else {
      v = raw / max(uMaxCount, vec3(1.0));
    }

    vec3 emit = v * uChanExp;
    float dens = max(max(v.r, v.g), v.b);
    float a = 1.0 - exp(-dens * uDensity * dt * uAbsorb);
    colAcc += (1.0 - aAcc) * emit * a * uExposure;
    aAcc += (1.0 - aAcc) * a;
    if (aAcc > 0.996) break;
    t += dt;
  }

  vec3 col = colAcc;

  // Saturation grading.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSat);
  col = max(col, vec3(0.0));

  // Tone mapping.
  if (uTone < 0.5) {
    // none
  } else if (uTone < 1.5) {
    col = col / (1.0 + col);            // reinhard
  } else if (uTone < 2.5) {
    col = acesToneMap(col);             // aces
  } else {
    col = filmicToneMap(col);           // filmic
  }

  col = pow(col, vec3(1.0 / uGamma));   // gamma
  float a = clamp(max(aAcc, max(col.r, max(col.g, col.b))), 0.0, 1.0);
  outColor = vec4(col, a);
}
`;

export function createVolumeMaterial(texture: THREE.Data3DTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uVolume: { value: texture },
      uMaxCount: { value: new THREE.Vector3(1, 1, 1) },
      uSteps: { value: 320 },
      uExposure: { value: 1.0 },
      uDensity: { value: 1.0 },
      uAbsorb: { value: 8.0 },
      uChanExp: { value: new THREE.Vector3(1, 1, 1) },
      uGamma: { value: 2.2 },
      uLog: { value: 1.0 },
      uLogScale: { value: 240.0 },
      uTone: { value: 2.0 },
      uSat: { value: 1.1 },
      uJitter: { value: 1.0 },
      uTime: { value: 0.0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.NormalBlending,
  });
}
