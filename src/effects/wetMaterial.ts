import * as BABYLON from '@babylonjs/core';

/**
 * wetMaterial — a cartoony cel WET FILM for the spherical sprite rig, the `wet` status
 * visual. The LIGHT, see-through cousin of the `frozen`
 * ice cube: the same upright BOX shell, but shaded as an ULTRA-translucent glossy water film so the
 * whole body reads straight through. The readable cue is discrete vertical DRIP runnels sliced
 * around the circumference (object-space atan(z,x) lanes, gaps between them) with bright specular
 * BEADS that stream DOWN each runnel over the looping 8-frame clock, plus a fresnel meniscus + a
 * soaked-sheen specular. Blue cel ramp, fixed world-space KEY_DIR sweep for the cross-angle read.
 *
 * halfHeight MUST be BOX_H/2 = 0.75 (loadShaderEffect box is 1.5 tall) or vYf / the top-fade / drip
 * range land at the wrong Y. Alpha is capped 0.72 and mostly ~0.1 so the model is never hidden.
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

const WET_GLSL = `
  const float TAU = 6.28318530718;
  const float LANES = 9.0;
  float hash11(float p){
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['wetEffectVertexShader'] = `
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
    ${WET_GLSL}

    void main(void){
      float yf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      vYf = yf;
      vec3 nrm = normalize(normal);
      float ang = atan(position.z, position.x);
      float u = ang / TAU + 0.5;
      float lanePos = u * LANES;
      float laneId = floor(lanePos);
      float laneFrac = lanePos - laneId;
      float centered = laneFrac - 0.5;
      float rib = 1.0 - smoothstep(0.10, 0.30, abs(centered));
      float phase = hash11(mod(laneId, LANES) + seed * 3.1);
      float bead = fract(phase - time);
      float drop = smoothstep(0.07, 0.0, abs(yf - bead)) * rib;
      float ripple = snoise(position * (5.0 * noiseScale) + vec3(sin(time * TAU), -cos(time * TAU), 0.0) * 0.4 + vec3(0.0, 0.0, seed)) * 0.5 + 0.5;
      float bump = (rib * 0.30 + drop * 1.0 + ripple * 0.12) * displacement;
      vec3 displaced = position + nrm * bump * 0.12;
      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['wetEffectFragmentShader'] = `
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
    ${WET_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    vec3 waterRamp(float t){
      vec3 c = mix(edgeColor, midColor, smoothstep(0.0, 0.5, t));
      c = mix(c, coreColor, smoothstep(0.5, 1.0, t));
      return c;
    }

    void main(void){
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float ndv = max(dot(N, V), 0.0);
      float fres = pow(1.0 - ndv, max(rimPower, 0.01));

      float ang = atan(vLocalPos.z, vLocalPos.x);
      float u = ang / TAU + 0.5;
      float lanePos = u * LANES;
      float laneId = floor(lanePos);
      float laneFrac = lanePos - laneId;
      float laneKey = mod(laneId, LANES);

      float present = step(0.32, hash11(laneKey * 1.7 + seed));
      float wander = (hash11(laneKey * 3.3 + seed * 2.0) - 0.5) * 0.28;
      float centered = (laneFrac - 0.5) + wander;
      float hw = 0.11 + 0.05 * hash11(laneKey * 5.1 + seed);
      float runnel = (1.0 - smoothstep(hw, hw + 0.05, abs(centered))) * present;

      float phase = hash11(laneKey + seed * 3.1);
      float bead = fract(phase - time);
      float bead2 = fract(phase + 0.53 - time);
      float droplet = (smoothstep(0.05, 0.0, abs(vYf - bead)) + smoothstep(0.05, 0.0, abs(vYf - bead2)) * 0.7) * runnel;

      float sheen = snoise(vLocalPos * (7.0 * noiseScale) + vec3(seed, 0.0, seed)) * 0.5 + 0.5;
      float beads = smoothstep(0.62, 0.82, sheen);

      vec3 Hh = normalize(KEY_DIR + V);
      float spec = pow(max(dot(N, Hh), 0.0), 58.0);

      float lit = smoothstep(0.0, 1.0, ndl);
      float shade = clamp(0.30 + 0.60 * lit + runnel * 0.20, 0.0, 1.0);
      float bt = shade;
      if (bands >= 1.0) bt = floor(shade * bands + 0.5) / bands;
      vec3 col = waterRamp(bt);

      col += vec3(0.80, 0.92, 1.0) * spec * (0.55 + 1.10 * droplet);
      col += vec3(0.90, 0.97, 1.0) * beads * 0.22;
      col += coreColor * fres * rimIntensity;
      col += coreColor * emissive * droplet;

      float topFade = mix(1.0, 0.5, smoothstep(0.62, 1.0, vYf));
      float film = (0.07 + 0.34 * fres + beads * 0.10) * topFade;
      float wet = runnel * 0.40 + droplet * 0.50;
      float alpha = clamp(max(film, wet) + spec * 0.20, 0.0, 0.72);
      if (alpha < 0.03) discard;

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface WetMaterialParams {
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

export function createWetMaterial(
  scene: BABYLON.Scene, name: string, params: WetMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'wetEffect', fragment: 'wetEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#CDEBFF'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#3388FF'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#164B9E'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.7);
  mat.setFloat('rimPower', params.rimPower ?? 2.4);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.25);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0.15);
  mat.setFloat('halfHeight', params.halfHeight ?? 0.75);
  mat.setFloat('seed', params.seed ?? 2.0);
  mat.setFloat('time', 0);
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
