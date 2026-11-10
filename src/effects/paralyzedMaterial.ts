import * as BABYLON from '@babylonjs/core';

/**
 * paralyzedMaterial — a cartoony cel HEAVY-CRACKLE cage for the spherical sprite rig, the
 * `paralyzed` status visual: a rigid body wrapped in a
 * dense, harsh, CONSTANT electric crackle — the hard-lock cousin of `charged`. On the upright BOX
 * shell (like frozen but LIGHT/see-through), ridged noise (1-abs(snoise)) at two scales gives sharp
 * branching vein ridgelines with gaps between them, a third fine layer adds white sparks, and a
 * 3-flash-per-loop strobe sells the violent crackle. Deliberately COLD (steel-blue / icy white) so
 * it reads instantly apart from charged's warm gold. Alpha lives only in the veins + a fresnel rim
 * with a vYf top-fade, so the rigid body stays visible. Loops via sin/cos(time*PTAU). KEY_DIR sweep.
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

const PARALYZED_GLSL = `
  const float PTAU = 6.2831853;
  float pVein(vec3 p, float sc, vec3 off){ float n = snoise(p * sc + off); return 1.0 - abs(n); }
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['paralyzedEffectVertexShader'] = `
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
    ${PARALYZED_GLSL}

    void main(void){
      vec3 p = position;
      float buzz = snoise(vec3(position.xz * noiseScale * 1.7, seed));
      float tremor = 0.5 + 0.5 * sin(time * PTAU * 3.0);
      p += normal * (buzz * 0.5 + 0.5) * displacement * (0.55 + 0.45 * tremor);
      vLocalPos = p;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      vec4 wp = world * vec4(p, 1.0);
      vWorldPos = wp.xyz;
      vYf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      gl_Position = viewProjection * wp;
    }
  `;

  BABYLON.Effect.ShadersStore['paralyzedEffectFragmentShader'] = `
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
    ${PARALYZED_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    void main(void){
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float shade = 0.35 + 0.65 * ndl;
      if (bands >= 1.0) shade = floor(shade * bands + 0.5) / bands;

      vec3 q = vLocalPos * vec3(noiseScale, noiseScale * 0.6, noiseScale);
      float ph = sin(time * PTAU);
      float ph2 = cos(time * PTAU);

      float r1 = pVein(q, 1.0, vec3(0.0, ph * 0.7, seed));
      float r2 = pVein(q, 2.3, vec3(ph2 * 0.6, seed, ph * 0.5));
      float web = max(r1 * r1, r2 * r2 * 0.7);
      float fil = smoothstep(0.62, 0.9, web);

      float r3 = pVein(q, 5.1, vec3(seed, ph * 1.4, ph2 * 1.1));
      float spark = smoothstep(0.86, 1.0, r3);

      float microflick = 0.55 + 0.45 * snoise(vec3(q.xy * 0.6, ph * 1.5));
      fil *= microflick;

      float flick = 0.55 + 0.45 * pow(max(sin(time * PTAU * 3.0), 0.0), 6.0);

      float e = clamp(fil + spark * 1.2, 0.0, 1.0);
      float eBand = e;
      if (bands >= 1.0) eBand = floor(e * bands + 0.5) / bands;

      vec3 col = mix(edgeColor, midColor, smoothstep(0.0, 0.5, eBand));
      col = mix(col, coreColor, smoothstep(0.5, 1.0, eBand));

      float rim = pow(1.0 - max(dot(N, V), 0.0), rimPower) * rimIntensity;
      float topFade = 1.0 - 0.45 * smoothstep(0.65, 1.0, vYf);

      col *= shade;
      float bright = emissive * flick;
      col *= bright;
      col += coreColor * spark * 0.7;
      col += midColor * rim * 0.5;

      float alpha = fil * 0.72 + spark * 0.9 + rim * 0.26;
      // topFade keeps the head clear; the smoothstep bottom-fade stops the cage glowing as a bright
      // pool where the box meets the tile.
      alpha *= topFade * smoothstep(0.0, 0.12, vYf);
      alpha = clamp(alpha, 0.0, 0.9);
      if (alpha < 0.03) discard;
      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface ParalyzedMaterialParams {
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

export function createParalyzedMaterial(
  scene: BABYLON.Scene, name: string, params: ParalyzedMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'paralyzedEffect', fragment: 'paralyzedEffect' },
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
  // COLD steel-blue / icy-white so it reads instantly apart from charged's warm gold.
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#F2F6FF'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#8FB3E8'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#3E5C93'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 1.4);
  mat.setFloat('rimPower', params.rimPower ?? 2.2);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 1.1);
  mat.setFloat('noiseScale', params.noiseScale ?? 2.7);
  mat.setFloat('displacement', params.displacement ?? 0.05);
  mat.setFloat('halfHeight', params.halfHeight ?? 0.75);
  mat.setFloat('seed', params.seed ?? 6.0);
  mat.setFloat('time', 0);
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
