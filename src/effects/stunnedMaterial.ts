import * as BABYLON from '@babylonjs/core';

/**
 * stunnedMaterial — a cartoony cel STAR for the spherical sprite rig, the `stunned` status visual
 *: the classic dazed cartoon stars. A flat billboarded
 * QUAD carrying a single bright gold 5-point star (Inigo Quilez sdStar5 SDF), cel-banded gold ramp
 * with a fixed-KEY_DIR in-plane bevel, a thin dark cartoon OUTLINE, an animated sparkle glint, and
 * a faint gold halo. Everything outside the star silhouette alpha-discards, so the square quad reads
 * as a crisp star. The CLIENT (StunnedFx) orbits ~5 of these in a ring ABOVE the head. Loops via
 * sin(time*TAU). All motion in the sprite is the twinkle/pulse; the orbit is client-driven.
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

const STAR_GLSL = `
  vec3 rampCel(float t, vec3 c0, vec3 c1, vec3 c2){
    float u = clamp(t, 0.0, 1.0);
    if (u < 0.5) return mix(c0, c1, u * 2.0);
    return mix(c1, c2, (u - 0.5) * 2.0);
  }
  float sdStar5(vec2 p, float r, float rf){
    vec2 k1 = vec2(0.809016994375, -0.587785252292);
    vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p = p - 2.0 * max(dot(k1, p), 0.0) * k1;
    p = p - 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y = p.y - r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }
  float sparkle(vec2 q, float s){
    q = q / s;
    float rr = dot(q, q);
    float core = 1.0 / (1.0 + 45.0 * rr);
    float hx = (1.0 / (1.0 + 240.0 * q.y * q.y)) * clamp(1.0 - abs(q.x), 0.0, 1.0);
    float vy = (1.0 / (1.0 + 240.0 * q.x * q.x)) * clamp(1.0 - abs(q.y), 0.0, 1.0);
    return clamp(core + 0.55 * hx + 0.55 * vy, 0.0, 1.0);
  }
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['stunnedEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform float halfHeight;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    void main(void){
      vec4 wp = world * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      vLocalPos = position;
      vYf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      gl_Position = viewProjection * wp;
    }
  `;

  BABYLON.Effect.ShadersStore['stunnedEffectFragmentShader'] = `
    precision highp float;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

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
    ${STAR_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    void main(void){
      vec2 p = vLocalPos.xy;
      float r = 0.80;
      float rf = 0.42;
      float d = sdStar5(p, r, rf);

      float aa = 0.015;
      float outlineW = 0.07;

      float bodyMask = 1.0 - smoothstep(-aa, aa, d);
      float fillMask = 1.0 - smoothstep(-outlineW - aa, -outlineW + aa, d);
      float halo = (1.0 - smoothstep(0.0, 0.16, d)) * (1.0 - bodyMask);

      float depth = clamp((-d) / (r * 0.55), 0.0, 1.0);
      vec2 pn = normalize(p + vec2(0.0001, 0.0001));
      float bev = 0.5 + 0.5 * dot(pn, normalize(KEY_DIR.xy));
      float n = snoise(vec3(p * noiseScale, seed));
      float shade = clamp(0.5 * depth + 0.55 * bev + 0.12 + n * 0.06, 0.0, 1.0);
      if (bands >= 1.0) shade = floor(shade * bands + 0.5) / bands;

      vec3 fillCol = rampCel(shade, edgeColor, midColor, coreColor);

      float tw = 0.55 + 0.45 * sin(time * 6.2831853 + seed * 6.2831853);
      float spk = sparkle(p - vec2(-0.20, 0.24), 0.5) * tw * fillMask;
      fillCol = fillCol + vec3(1.0, 0.98, 0.85) * spk * 0.9;

      float rim = pow(1.0 - clamp((-d) / (r * 0.5), 0.0, 1.0), rimPower);
      fillCol = fillCol + midColor * rim * rimIntensity * 0.15 * fillMask;

      vec3 outlineCol = vec3(0.16, 0.08, 0.02);
      vec3 col = mix(outlineCol, fillCol, fillMask);

      float pulse = 0.9 + 0.1 * sin(time * 6.2831853);
      col = col * emissive * pulse;

      vec3 haloCol = midColor * emissive * pulse * 0.5;
      float haloA = halo * 0.26;

      vec3 finalCol = mix(haloCol, col, bodyMask);
      float alpha = max(bodyMask, haloA);

      if (alpha < 0.03) discard;
      gl_FragColor = vec4(finalCol, alpha);
    }
  `;
}

export interface StunnedMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  displacement?: number;
  halfHeight?: number;
  seed?: number;
}

export function createStunnedMaterial(
  scene: BABYLON.Scene, name: string, params: StunnedMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'stunnedEffect', fragment: 'stunnedEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#FFF6CF'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#FFD93B'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#EB9B14'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.8);
  mat.setFloat('rimPower', params.rimPower ?? 2.5);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 1.35);
  mat.setFloat('noiseScale', params.noiseScale ?? 2.5);
  mat.setFloat('displacement', params.displacement ?? 0);
  mat.setFloat('halfHeight', params.halfHeight ?? 1.0);
  mat.setFloat('seed', params.seed ?? 3.0);
  mat.setFloat('time', 0);
  mat.backFaceCulling = false;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
