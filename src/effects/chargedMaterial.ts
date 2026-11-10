import * as BABYLON from '@babylonjs/core';

/**
 * chargedMaterial — a cartoony cel ELECTRIC AURA for the spherical sprite rig, the
 * `charged` status visual: thin branching bolts that
 * skitter over the body + bright spark points, on the diameter-2 SPHERE seam (the miasma/fireball
 * "real 3D sphere imaged from 8 sides" recipe). The shell is almost entirely TRANSPARENT — only the
 * bolts (ridge lines along the zero-contours of two object-space simplex fields), the sparks (field
 * crossings), and a faint fresnel halo carry alpha — so the body reads clearly between arcs. A
 * BUFF: cheery warm gold-yellow with white-hot cores, energetic. All time terms are integer
 * multiples of time*TAU so the 8-frame bake loops seamlessly. Fixed world-space KEY_DIR sweep.
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

const CHARGED_GLSL = `
  const float TAU = 6.28318530718;
  float hash11(float p){
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  float ridge(float f, float w, float sh){
    return pow(1.0 - clamp(abs(f) / w, 0.0, 1.0), sh);
  }
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['chargedEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform float time;
    uniform float noiseScale;
    uniform float displacement;
    uniform float seed;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    ${SNOISE_GLSL}
    ${CHARGED_GLSL}

    void main(void){
      float tw = time * TAU;
      vec3 sp = position * (3.4 * noiseScale) + vec3(seed, seed * 1.3, seed * 0.7);
      vec3 wob = vec3(sin(tw), cos(tw), sin(tw * 2.0)) * 0.5;
      float b1 = snoise(sp + wob);
      float b2 = snoise(sp * 2.2 - wob.zxy);
      float buzz = 1.0 - abs(b1 * 0.7 + b2 * 0.3);
      vec3 displaced = position + normal * buzz * displacement * 0.12;
      vYf = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['chargedEffectFragmentShader'] = `
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
    ${CHARGED_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    vec3 sparkRamp(float t){
      vec3 c = mix(edgeColor, midColor, smoothstep(0.0, 0.55, t));
      c = mix(c, coreColor, smoothstep(0.55, 1.0, t));
      return c;
    }

    void main(void){
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndv = max(dot(N, V), 0.0);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float fres = pow(1.0 - ndv, max(rimPower, 0.01));

      vec3 p = vLocalPos;
      float tw = time * TAU;
      vec3 flowA = vec3(sin(tw), cos(tw), sin(tw * 2.0)) * 0.30;
      vec3 flowB = vec3(cos(tw * 2.0), sin(tw), cos(tw * 3.0)) * 0.42;

      float f1 = snoise(p * (2.7 * noiseScale) + flowA + vec3(0.0, 0.0, seed));
      float f2 = snoise(p * (5.3 * noiseScale) + flowB + vec3(seed + 8.0, 0.0, 0.0));
      float f3 = snoise(p * (9.4 * noiseScale) - flowA.zxy + vec3(0.0, seed + 3.0, 0.0));

      float arcMain = ridge(f1, 0.11, 1.8);
      float near1 = 1.0 - clamp(abs(f1) / 0.45, 0.0, 1.0);
      float arcBranch = ridge(f2, 0.085, 1.8) * near1;
      float arcFil = ridge(f3, 0.06, 1.8) * near1 * 0.7;
      float web = max(arcMain, max(arcBranch, arcFil));

      float seg = 0.5 + 0.5 * sin((p.x + p.y * 1.7 + p.z * 1.3) * 9.0 + tw * 3.0 + seed);
      web *= mix(0.30, 1.0, smoothstep(0.15, 0.85, seg));

      float crossPt = ridge(f1, 0.13, 1.4) * ridge(f2, 0.13, 1.4);
      float twk = 0.5 + 0.5 * sin(tw * 3.0 + hash11(floor(f1 * 6.0) + floor(f2 * 6.0) + seed) * TAU);
      float spark = crossPt * (0.35 + 0.65 * twk);

      float intensity = clamp(web + spark * 1.4, 0.0, 1.0);

      float shade = intensity;
      if (bands >= 1.0) shade = floor(intensity * bands + 0.5) / bands;
      vec3 col = sparkRamp(shade);

      float hot = smoothstep(0.50, 1.0, intensity) + spark;
      col = mix(col, vec3(1.0), clamp(hot * 0.85, 0.0, 1.0));

      // Yellow glow ALONG the bolts so the web reads as bright electric, not a dim reddish haze.
      col += midColor * web * 0.7;
      col += midColor * ndl * 0.10 * intensity;

      float halo = fres * rimIntensity * (0.45 + 0.55 * ndl);
      col += midColor * halo;
      col += coreColor * emissive * spark;

      // Bottom-fade: kill the halo/bolt glow near the base so it doesn't pool as a bright puddle of
      // light on the tile where the sphere meets the ground.
      float botFade = smoothstep(0.0, 0.22, vYf);
      float alpha = clamp(web * 1.0 + spark * 1.3 + halo * 0.20, 0.0, 1.0) * botFade;
      if (alpha < 0.03) discard;

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface ChargedMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  displacement?: number;
  seed?: number;
}

export function createChargedMaterial(
  scene: BABYLON.Scene, name: string, params: ChargedMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'chargedEffect', fragment: 'chargedEffect' },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'world', 'viewProjection', 'cameraPosition', 'time',
        'coreColor', 'midColor', 'edgeColor', 'rimIntensity', 'rimPower', 'bands', 'emissive',
        'noiseScale', 'displacement', 'seed',
      ],
      needAlphaBlending: true,
    },
  );
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#FFFFFF'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#F5DC5A'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#C9A24B'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.5);
  mat.setFloat('rimPower', params.rimPower ?? 2.6);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.5);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0.35);
  mat.setFloat('seed', params.seed ?? 5.0);
  mat.setFloat('time', 0);
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
