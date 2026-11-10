import * as BABYLON from '@babylonjs/core';

/**
 * silencedMaterial — a cartoony cel ARCANE SEAL for the spherical sprite rig, the `silenced` status
 * visual: a crossed magic seal meaning "cannot cast". A
 * flat billboarded QUAD carrying a polar field in object-space vLocalPos.xy: a tube-shaded glowing
 * RING + an outer hairline ring, a wheel of 24 hash-irregular gapped RUNIC TICKS, a bold diagonal
 * SLASH bar with an ink outline (the "no" bar, drawn last so it always reads), and a faint pulsing
 * inner dampening aura. Cel-banded through the arcane purple ramp, fixed-KEY_DIR ring bevel, a
 * seamless swirling ring highlight + rune twinkle + core pulse over the looping clock. The CLIENT
 * (SilencedFx) floats it ABOVE the head, slowly rotating + pulsing. Mostly-empty disc = model stays
 * clear. Loops via sin/cos(time*TAU).
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

const SIGIL_GLSL = `
  const float TAU = 6.28318530718;
  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['silencedEffectVertexShader'] = `
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
      vec3 pos = position;
      float yf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      vYf = yf;
      vLocalPos = pos;
      vec4 wp = world * vec4(pos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * wp;
    }
  `;

  BABYLON.Effect.ShadersStore['silencedEffectFragmentShader'] = `
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
    ${SIGIL_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    vec3 sigilRamp(float t){
      vec3 c = mix(edgeColor, midColor, smoothstep(0.0, 0.5, t));
      c = mix(c, coreColor, smoothstep(0.5, 1.0, t));
      return c;
    }

    void main(void){
      vec2 p = vLocalPos.xy;
      float r = length(p);
      float ang = atan(p.y, p.x);

      float pulse = 0.5 + 0.5 * sin(time * TAU);
      float sweep = pow(max(cos(ang - time * TAU), 0.0), 6.0);

      vec2 radial = p / max(r, 0.0015);
      float embossDir = dot(radial, normalize(KEY_DIR.xy));

      float Rm = 0.60;
      float htm = 0.070;
      float rrm = (r - Rm) / htm;
      float ringBody = 1.0 - smoothstep(0.72, 1.02, abs(rrm));
      float tube = clamp(1.0 - abs(rrm), 0.0, 1.0);

      float ro = (r - 0.82) / 0.018;
      float ringOuter = 1.0 - smoothstep(0.80, 1.05, abs(ro));

      float NT = 24.0;
      float ta = ang / TAU + 0.5;
      float tid = floor(ta * NT);
      float tcen = fract(ta * NT) - 0.5;
      float present = step(0.16, hash11(tid + seed));
      float tlen = mix(0.050, 0.120, hash11(tid * 1.7 + seed + 3.0));
      float rIn = 0.700;
      float angHalf = 0.30;
      float tickAng = 1.0 - smoothstep(angHalf * 0.50, angHalf * 0.85, abs(tcen));
      float tickRad = smoothstep(rIn - 0.012, rIn + 0.012, r) * (1.0 - smoothstep(rIn + tlen - 0.020, rIn + tlen + 0.012, r));
      float twinkle = 0.55 + 0.45 * sin(time * TAU + tid * 1.7);
      float ticks = tickAng * tickRad * present;

      vec2 dir = normalize(vec2(1.0, 1.0));
      vec2 nrm = vec2(-dir.y, dir.x);
      float distL = abs(dot(p, nrm));
      float along = abs(dot(p, dir));
      float bw = 0.080;
      float bl = 0.86;
      float slashBody = (1.0 - smoothstep(bw - 0.020, bw + 0.006, distL)) * (1.0 - smoothstep(bl - 0.10, bl, along));
      float slashInk = (1.0 - smoothstep(bw + 0.006, bw + 0.030, distL)) * (1.0 - smoothstep(bl, bl + 0.035, along));
      slashInk = clamp(slashInk - slashBody, 0.0, 1.0);

      float grain = snoise(vec3(p * (3.2 * noiseScale), seed));
      float ringShade = 0.52 + 0.34 * tube + 0.16 * embossDir + 0.30 * sweep + 0.06 * grain;
      ringShade = clamp(ringShade, 0.0, 1.0);
      float ringBand = ringShade;
      if (bands >= 1.0) ringBand = floor(ringShade * bands + 0.5) / bands;
      vec3 ringCol = sigilRamp(ringBand);

      vec3 tickCol = mix(midColor, coreColor, clamp(0.35 + 0.55 * twinkle, 0.0, 1.0));
      vec3 slashCol = mix(coreColor, vec3(1.0), 0.18);

      float auraFill = 1.0 - smoothstep(0.10, Rm + 0.02, r);
      float aura = auraFill * (0.05 + 0.05 * pulse);

      vec3 col = mix(edgeColor, midColor, 0.55) * aura;
      float alpha = aura;

      float ringMask = max(ringBody, ringOuter * 0.85);
      col = mix(col, ringCol, ringMask);
      alpha = max(alpha, ringMask * 0.92);

      col = mix(col, tickCol, ticks);
      alpha = max(alpha, ticks * 0.88);

      col = mix(col, edgeColor, slashInk);
      alpha = max(alpha, slashInk * 0.95);
      col = mix(col, slashCol, slashBody);
      alpha = max(alpha, slashBody * 0.97);

      float ringEdge = ringBody * pow(clamp(abs(rrm), 0.0, 1.0), max(rimPower, 0.01));
      col += coreColor * rimIntensity * ringEdge;

      float glowMask = max(slashBody, max(ticks, ringBody * 0.55));
      col += coreColor * emissive * glowMask * (0.65 + 0.45 * pulse);

      float edgeFade = 1.0 - smoothstep(0.90, 1.0, r);
      alpha *= edgeFade;

      if (alpha < 0.03) discard;
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    }
  `;
}

export interface SilencedMaterialParams {
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

export function createSilencedMaterial(
  scene: BABYLON.Scene, name: string, params: SilencedMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'silencedEffect', fragment: 'silencedEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#FF7BEA'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#CC88FF'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#3A1568'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.5);
  mat.setFloat('rimPower', params.rimPower ?? 2.4);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.5);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0);
  mat.setFloat('halfHeight', params.halfHeight ?? 1.0);
  mat.setFloat('seed', params.seed ?? 9.0);
  mat.setFloat('time', 0);
  mat.backFaceCulling = false;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
