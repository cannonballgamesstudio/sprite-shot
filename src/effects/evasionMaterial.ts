import * as BABYLON from '@babylonjs/core';

/**
 * evasionMaterial — a cartoony cel SHIMMER-SHELL for the spherical sprite rig, the
 * `evasion` status visual: a faint iridescent silver aura
 * that suggests the fighter is slippery / hard to hit. On the upright BOX shell, imaged NOT as a
 * solid block but rim-dominant: flat faces are fresnel-eroded (near-invisible head-on so the torso
 * shows through) and only the grazing silhouette rim + a set of object-space azimuth VERTICAL LIGHT
 * STREAKS survive, racing around the body over the looping clock. Iridescent silver->cool-white,
 * cel-banded, fixed KEY_DIR sweep. The FAINTEST of the family on purpose (understated defensive
 * buff): alpha capped ~0.48, fresnel-eroded center. STREAKS is an INTEGER so the loop is seam-safe.
 *
 * halfHeight MUST be BOX_H/2 = 0.75.
 */

let shadersRegistered = false;

const SNOISE_GLSL = `
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x4 = x_ * ns.x + ns.yyyy;
    vec4 y4 = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x4) - abs(y4);
    vec4 b0 = vec4(x4.xy, y4.xy);
    vec4 b1 = vec4(x4.zw, y4.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

const EVASION_GLSL = `
  const float TAU = 6.28318530718;
  const float STREAKS = 6.0;
  vec3 loopOff(float t, float r){
    float a = t * TAU;
    return vec3(cos(a), 0.0, sin(a)) * r;
  }
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['evasionEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform float time;
    uniform float noiseScale;
    uniform float displacement;
    uniform float seed;
    uniform float halfHeight;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    ${SNOISE_GLSL}
    ${EVASION_GLSL}

    void main(void){
      float yf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      vYf = yf;
      vec3 orb = loopOff(time, 0.40);
      vec3 sp = position * (2.4 * noiseScale) + orb + vec3(0.0, 0.0, seed);
      float w = snoise(sp) * 0.6 + snoise(sp * 2.1 + vec3(seed + 11.0, 0.0, 0.0)) * 0.4;
      vec3 displaced = position + normal * w * displacement * 0.18;
      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['evasionEffectFragmentShader'] = `
    precision highp float;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    uniform vec3 cameraPosition;
    uniform float time;
    uniform vec3 coreColor;
    uniform vec3 midColor;
    uniform vec3 edgeColor;
    uniform float rimIntensity;
    uniform float rimPower;
    uniform float bands;
    uniform float emissive;
    uniform float noiseScale;
    uniform float seed;

    ${SNOISE_GLSL}
    ${EVASION_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.52, 0.38, 0.76));

    void main(void){
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndv = max(dot(N, V), 0.0);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float fres = pow(1.0 - ndv, max(rimPower, 0.01));

      float az = atan(vLocalPos.z, vLocalPos.x);

      vec3 orb = loopOff(time, 0.35);
      vec3 fp = vLocalPos * (3.0 * noiseScale) + orb + vec3(0.0, 0.0, seed);
      float n1 = snoise(fp);
      float n2 = snoise(fp * 2.2 + vec3(seed + 5.0, 0.0, 0.0));
      float shimmer = 0.5 + 0.5 * (n1 * 0.65 + n2 * 0.35);

      float streak = 0.5 + 0.5 * sin(az * STREAKS + time * TAU * 2.0 + shimmer * 2.4);
      streak = pow(streak, 3.0);
      float echo = 0.5 + 0.5 * sin(az * STREAKS - time * TAU * 2.0 + 1.7);
      echo = pow(echo, 3.5) * 0.45;
      float streaks = max(streak, echo);

      float lit = smoothstep(0.0, 1.0, ndl);
      float irid = clamp(shimmer * 0.5 + lit * 0.35 + fres * 0.3 + streaks * 0.25, 0.0, 1.0);
      float bt = irid;
      if (bands >= 1.0) bt = floor(irid * bands + 0.5) / bands;
      vec3 col = mix(edgeColor, midColor, smoothstep(0.0, 0.5, bt));
      col = mix(col, coreColor, smoothstep(0.5, 1.0, bt));

      vec3 Hh = normalize(KEY_DIR + V);
      float spec = pow(max(dot(N, Hh), 0.0), 40.0);
      float tw = 0.5 + 0.5 * sin(time * TAU + shimmer * 20.0 + seed);
      col += coreColor * spec * (0.3 + 0.8 * tw) * streaks;

      col += midColor * fres * rimIntensity;
      col += coreColor * emissive * streaks * shimmer;

      float vfade = smoothstep(0.0, 0.14, vYf) * (1.0 - smoothstep(0.72, 1.0, vYf));
      float body = fres * 0.55 + streaks * 0.40 * shimmer;
      float alpha = clamp(body * vfade, 0.0, 1.0) * 0.40;
      alpha += fres * fres * 0.14 * vfade;
      alpha = clamp(alpha, 0.0, 0.48);
      if (alpha < 0.03) discard;

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface EvasionMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  displacement?: number;
  /** MUST equal loadShaderEffect's box height / 2 (BOX_H/2 = 0.75). */
  halfHeight?: number;
  seed?: number;
}

export function createEvasionMaterial(
  scene: BABYLON.Scene, name: string, params: EvasionMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'evasionEffect', fragment: 'evasionEffect' },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'world', 'viewProjection', 'cameraPosition', 'time',
        'coreColor', 'midColor', 'edgeColor', 'rimIntensity', 'rimPower', 'bands', 'emissive',
        'noiseScale', 'displacement', 'seed', 'halfHeight',
      ],
      needAlphaBlending: true,
    },
  );
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#EAF2FF'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#C0C0C0'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#4C5A6E'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.9);
  mat.setFloat('rimPower', params.rimPower ?? 2.2);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.4);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.3);
  mat.setFloat('displacement', params.displacement ?? 0.12);
  mat.setFloat('halfHeight', params.halfHeight ?? 0.75);
  mat.setFloat('seed', params.seed ?? 9.0);
  mat.setFloat('time', 0);
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
