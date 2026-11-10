import * as BABYLON from '@babylonjs/core';

/**
 * miasmaMaterial — a cartoony cel POISON MIASMA cloud for the spherical sprite rig, the
 * `poisoned` status-visual subject. A TRANSLUCENT toxic
 * vapour (sickly green -> toxic green -> murky green) whose round sphere silhouette is TORN by
 * turbulence into ragged, vertically-streaked wisps — rendered in-game as tall narrow tendrils
 * rising off the fighter (PoisonedFx stretches the billboard tall), so it reads as smoke, not orbs,
 * and the model shows through the holes.
 *
 * Same volumetric-across-angles recipe as fireballMaterial (a displaced non-billboarded SPHERE the
 * rig images from 8 sides, fixed world-space key light so the lit face sweeps across the ring,
 * object-space field so a different patch shows per angle) — but SLOW churn (a hovering cloud, not
 * a rising flame), a poison ramp, and a soft translucent alpha so it reads as gas, not a solid orb.
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

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['miasmaEffectVertexShader'] = `
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
    ${SNOISE_GLSL}
    void main(void) {
      // Slow two-octave roil (a hovering cloud, not a rising flame) — lumpy billowing silhouette.
      float n1 = snoise(position * (1.5 * noiseScale) + vec3(0.0, time * 0.35, seed));
      float n2 = snoise(position * (3.2 * noiseScale) + vec3(time * 0.5, 0.0, seed + 11.0));
      float bump = (n1 * 0.7 + n2 * 0.3) * displacement * 0.32;
      vec3 displaced = position + normal * bump;
      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['miasmaEffectFragmentShader'] = `
    precision highp float;
    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
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
    const vec3 KEY_DIR = normalize(vec3(0.48, 0.42, 0.77));
    vec3 poisonRamp(float t) {
      vec3 c = mix(edgeColor, midColor, smoothstep(0.0, 0.55, t));
      c = mix(c, coreColor, smoothstep(0.55, 1.0, t));
      return c;
    }
    void main(void) {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float ndv = max(dot(N, V), 0.0);

      // Fractal turbulence, VERTICALLY STRETCHED (low Y frequency) so features elongate upward into
      // rising streaks, object-space + scrolling up over time. Three octaves = wispy fractal detail.
      vec3 sp = vLocalPos * noiseScale * vec3(2.2, 0.85, 2.2) + vec3(0.0, -time * 0.6, seed);
      float w1 = snoise(sp * 1.5);
      float w2 = snoise(sp * 3.3 + vec3(time * 0.3, 0.0, seed + 7.0));
      float w3 = snoise(sp * 6.7 + vec3(0.0, -time * 0.9, seed + 13.0));
      float cloud = 0.5 + 0.5 * (w1 * 0.56 + w2 * 0.30 + w3 * 0.14);

      // TORN silhouette (kill the round ball): erode toward the grazing rim so the sphere's round
      // edge dissolves — only where turbulence is strong do tendrils survive past the core, and even
      // the core is holed by the same field. No smooth disc outline remains -> reads as ragged smoke.
      float rim = 1.0 - ndv;
      float mask = cloud - rim * 0.82 - 0.14;
      float alpha = smoothstep(0.0, 0.32, mask) * 0.55;
      if (alpha < 0.02) discard;

      // Poison ramp by internal density + key light, cel-banded, faint glow on the densest cores.
      float lit = smoothstep(0.05, 1.0, ndl);
      float dens = clamp(cloud * 0.68 + lit * 0.32, 0.0, 1.0);
      float bt = dens;
      if (bands >= 1.0) bt = floor(dens * bands + 0.5) / bands;
      vec3 col = poisonRamp(bt);
      col += coreColor * emissive * smoothstep(0.72, 1.0, cloud);

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface MiasmaMaterialParams {
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

export function createMiasmaMaterial(
  scene: BABYLON.Scene, name: string, params: MiasmaMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'miasmaEffect', fragment: 'miasmaEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#C8E87A'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#6FA02F'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#452359'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.4);
  mat.setFloat('rimPower', params.rimPower ?? 2.0);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.35);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0.7);
  mat.setFloat('seed', params.seed ?? 6.0);
  mat.setFloat('time', 0);
  // Translucent gas: DON'T back-face cull, so the far shell contributes to the soft volume (a thin
  // cloud reads fuller when both shells blend) — the low body alpha keeps it from over-saturating.
  mat.backFaceCulling = false;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
