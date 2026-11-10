import * as BABYLON from '@babylonjs/core';

/**
 * flameMaterial — a cartoony cel FLAME for the spherical sprite rig, the `burning`
 * status-visual subject. Where fireballMaterial.ts
 * shades a molten SPHERE (a compact orb), this shades a tall tapering CONE (loadShaderEffect's
 * `geometry: 'cone'` seam) whose surface is carved into licking flame tongues that FLOW UPWARD —
 * so the baked sprite reads as rising flames, not a fireball.
 *
 * It images dimensionally across the equatorial ring for the same reasons the fireball does:
 *  1. A FIXED WORLD-SPACE key light (KEY_DIR) — the subject never rotates, only the rig cameras
 *     orbit, so the lit face sweeps front-lit -> rim-only across the 8 azimuth cells.
 *  2. snoise VERTEX DISPLACEMENT (weighted toward the tip) roils the licking silhouette.
 *  3. The flame field is sampled in OBJECT space and SCROLLS in +Y over time, so flames rise and a
 *     different patch shows per camera angle instead of a screen-locked pattern.
 *
 * The flame SILHOUETTE is carved in the fragment alpha: opaque at the base, breaking into
 * noise-driven tongues toward the wispy tip (a solid cone would read as a party hat). Vertical
 * temperature gradient: white-gold hot at the base -> orange body -> deep-red cool tips. Cel bands
 * for the cartoony look. Pairs with LookSpec.alphaMode:'straight' for a soft flame fringe.
 *
 * halfHeight MUST match loadShaderEffect's cone height/2 (FLAME_H) or the base->tip gradient and
 * the tip carve land at the wrong Y.
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

  BABYLON.Effect.ShadersStore['flameEffectVertexShader'] = `
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
    uniform float flow;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    ${SNOISE_GLSL}

    void main(void) {
      float yf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      vYf = yf;
      // Upward-scrolling roil (sampling offset moves -Y so features rise), weighted toward the tip
      // so the base stays a solid trunk and the top licks. Two octaves for a slow roll plus chop.
      vec3 sp = position * (1.9 * noiseScale) + vec3(0.0, -time * flow, seed);
      float n1 = snoise(sp);
      float n2 = snoise(sp * 2.3 + vec3(time * 0.6, 0.0, seed + 11.0));
      float bump = (n1 * 0.7 + n2 * 0.3) * displacement * (0.25 + yf * 1.15);
      vec3 displaced = position + normal * bump * 0.16;

      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['flameEffectFragmentShader'] = `
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
    uniform float flow;

    ${SNOISE_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.52, 0.30, 0.80));

    vec3 fireRamp(float t) {
      vec3 c = mix(edgeColor, midColor, smoothstep(0.0, 0.5, t));
      c = mix(c, coreColor, smoothstep(0.5, 1.0, t));
      return c;
    }

    void main(void) {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float ndv = max(dot(N, V), 0.0);
      float fres = pow(1.0 - ndv, max(rimPower, 0.01));

      // Object-space flame field scrolling upward (features rise over time).
      vec3 fp = vLocalPos * (2.4 * noiseScale) + vec3(0.0, -time * flow * 1.3, seed);
      float f1 = snoise(fp);
      float f2 = snoise(fp * 2.5 + vec3(time * 0.9, 0.0, seed + 5.0));
      float flame = clamp(0.5 + 0.5 * (f1 * 0.62 + f2 * 0.38), 0.0, 1.0);

      // Temperature: hot at the base (1 - yf), plus the flame field, plus a little key-lit form so
      // the lit face runs hotter and reads 3D across the ring.
      float baseHeat = 1.0 - vYf;
      float lit = smoothstep(0.15, 1.0, ndl);
      float temp = clamp(baseHeat * 0.55 + flame * 0.4 + lit * 0.25, 0.0, 1.0);

      float bt = temp;
      if (bands >= 1.0) bt = floor(temp * bands + 0.5) / bands;

      vec3 col = fireRamp(bt);
      col += coreColor * fres * rimIntensity;
      col += coreColor * emissive * smoothstep(0.65, 1.0, temp);

      // Carve the flame into TRANSLUCENT licking tongues (not a solid cone that would engulf the
      // model it overlays): noise-driven gaps let the body show through, and the whole thing is
      // kept semi-transparent so flames read as licking over the fighter rather than hiding it.
      float tongues = baseHeat * 1.05 + (flame - 0.5) * 2.7 * vYf - 0.32;
      float tipFade = 1.0 - smoothstep(0.78, 1.0, vYf);
      float alpha = clamp(tongues, 0.0, 1.0) * tipFade * 0.6;
      alpha = clamp(alpha + fres * 0.18 * baseHeat, 0.0, 1.0);
      if (alpha < 0.02) discard;

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface FlameMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  /** Cel-band count for the temperature ramp. 0 = smooth. Default 4. */
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  /** Vertex-displacement intensity (licking edges). Default 0.7. */
  displacement?: number;
  /** Upward flow speed of the flame field. Default 1.6. */
  flow?: number;
  /** MUST equal loadShaderEffect's cone height / 2. Default 1.2. */
  halfHeight?: number;
  seed?: number;
}

export function createFlameMaterial(
  scene: BABYLON.Scene, name: string, params: FlameMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'flameEffect', fragment: 'flameEffect' },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'world', 'viewProjection', 'cameraPosition', 'time',
        'coreColor', 'midColor', 'edgeColor', 'rimIntensity', 'rimPower', 'bands', 'emissive',
        'noiseScale', 'displacement', 'seed', 'halfHeight', 'flow',
      ],
      needAlphaBlending: true,
    },
  );
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#FFF0C0'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#FF7A1A'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#B3260A'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.7);
  mat.setFloat('rimPower', params.rimPower ?? 2.4);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.55);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0.7);
  mat.setFloat('flow', params.flow ?? 1.6);
  mat.setFloat('halfHeight', params.halfHeight ?? 1.2);
  mat.setFloat('seed', params.seed ?? 3.0);
  mat.setFloat('time', 0);
  // A real 3D subject; cull back faces so the far shell of the cone doesn't overdraw the near
  // shell through the translucent blend.
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
