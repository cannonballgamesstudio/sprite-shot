import * as BABYLON from '@babylonjs/core';

/**
 * iceMaterial — a VOLUMETRIC, TRANSLUCENT shader subject for the spherical sprite rig: a
 * rectangular-prism block of ice. Sibling of fireballMaterial.ts (sphere) — same "real 3D subject,
 * NOT billboarded, fixed world-space key light so the lit faces sweep across the 8 azimuth cells"
 * approach (see loadShaderEffect.ts `geometry:'box'`), but the whole point here is TRANSLUCENCY:
 * the block is imaged with a see-through body (low alpha) + brighter frosted/glassy structure, so
 * in-game it can be billboarded OVER a live character and the creature reads as frozen INSIDE the
 * block (the model shows through the ice). Pairs with LookSpec.alphaMode:'straight' — straight
 * alpha is essential (a hard cutout would make it an opaque silhouette, defeating the overlay).
 *
 * Ice cues, all in-shader (a custom ShaderMaterial gets no scene lights, so it self-lights, like
 * fireball/lightning):
 *  - FLAT box faces, cel-banded by a fixed key light -> each face a flat cool tone; the lit face
 *    rotates through the azimuth cells = dimensional across angles.
 *  - Strong FRESNEL on the silhouette edges -> the glassy bright rim of a block of ice.
 *  - Object-space CRACK network (thresholded snoise zero-crossings) + FROST mottling -> fracture
 *    lines and rime painted onto the faces, showing a different pattern per camera angle.
 *  - A slow SHIMMER (time-driven) on the glints so a persistent frozen overlay isn't dead-still.
 *  - Alpha: translucent body (~0.4) + more opaque at edges/cracks/frost, capped below 1 so even
 *    the solid-looking ice never fully hides the encased model.
 */

let shadersRegistered = false;

const SNOISE_GLSL = `
  // --- Simplex 3D noise (Ashima Arts / Stefan Gustavson) — same copy as fireballMaterial.ts. ---
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
  // --- End noise ---
`;

function registerShaders(): void {
  if (shadersRegistered) return;
  shadersRegistered = true;

  BABYLON.Effect.ShadersStore['iceEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 world;
    uniform mat4 viewProjection;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    void main(void) {
      vec4 worldPos = world * vec4(position, 1.0);
      vLocalPos = position;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['iceEffectFragmentShader'] = `
    precision highp float;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    uniform vec3 cameraPosition;
    uniform float time;
    uniform vec3 iceColor;    // main translucent blue
    uniform vec3 frostColor;  // white rime / edges
    uniform vec3 deepColor;   // deeper blue in the block's shadow side
    uniform float rimIntensity;
    uniform float rimPower;
    uniform float bands;      // cel steps on the face lighting (ice is smooth -> few)
    uniform float crackIntensity;
    uniform float frostScale;
    uniform float seed;

    ${SNOISE_GLSL}

    // Fixed world-space key: mostly horizontal so the lit face sweeps across the equatorial ring.
    const vec3 KEY_DIR = normalize(vec3(0.5, 0.34, 0.78));
    // Box half-extents — MUST match loadShaderEffect.ts BOX_W/BOX_H/BOX_D (1.15/1.5/1.15)/2.
    // Used to find the cube's 12 edges from the local position (the key "ice cube" cue).
    const vec3 HALF_EXT = vec3(0.575, 0.75, 0.575);

    void main(void) {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float ndl = max(dot(N, KEY_DIR), 0.0);
      float ndv = max(dot(N, V), 0.0);
      float fres = pow(1.0 - ndv, max(rimPower, 0.01)); // bright glassy silhouette edge

      // Crisp CUBE EDGES: normalize the local pos to 0..1 per axis; a point is on an edge when the
      // SECOND-largest axis is near the boundary (two axes at their face = an edge). This lights
      // all 12 edges of the block — the single strongest "solid ice cube" read.
      vec3 ax = abs(vLocalPos) / HALF_EXT;
      float mMax = max(ax.x, max(ax.y, ax.z));
      float mMin = min(ax.x, min(ax.y, ax.z));
      float mMid = (ax.x + ax.y + ax.z) - mMax - mMin;
      float edge = smoothstep(0.80, 0.97, mMid);

      // Object-space fracture network: thresholded snoise zero-crossings = thin bright cracks.
      vec3 cp = vLocalPos * (3.0 * frostScale) + vec3(0.0, 0.0, seed);
      float c1 = snoise(cp);
      float c2 = snoise(cp * 1.9 + vec3(11.0, 3.0, seed + 2.0));
      float cracks = (smoothstep(0.05, 0.0, abs(c1)) + smoothstep(0.045, 0.0, abs(c2))) * crackIntensity;
      cracks = clamp(cracks, 0.0, 1.0);

      // Frost mottling — two octaves, lower threshold so EVERY face carries some rime (avoids the
      // near-empty faces of the first pass) but kept subtle so the ice stays blue, not white-washed.
      float f1 = snoise(vLocalPos * (4.2 * frostScale) + vec3(0.0, seed, 0.0));
      float f2 = snoise(vLocalPos * (8.5 * frostScale) + vec3(seed, 0.0, seed));
      float frost = smoothstep(-0.15, 0.55, f1 * 0.6 + f2 * 0.4);

      // Cel-banded face lighting (flat box faces -> flat cool tones).
      float lit = 0.40 + 0.60 * ndl;
      if (bands >= 1.0) lit = floor(lit * bands) / bands;

      // Slow shimmer on the glints so a persistent overlay isn't frozen-dead.
      float glint = smoothstep(0.65, 0.95, snoise(vLocalPos * 9.0 + vec3(time * 0.8, seed, time * 0.5)));

      vec3 col = mix(deepColor, iceColor, lit);
      col = mix(col, frostColor, frost * 0.38);        // subtle rime (kept blue, not washed white)
      col = mix(col, frostColor, cracks);              // bright crack lines
      col = mix(col, frostColor, edge);                // crisp bright cube edges
      col += frostColor * fres * rimIntensity;         // glassy silhouette
      col += frostColor * glint * 0.5;                 // sparkle

      // Translucent body so the encased model shows through; edges/cracks read denser + opaque so
      // the cube frame stays crisp. Floor 0.5 (the matteBleed pass treats alpha < ~0.5 as
      // transparent + overwrites RGB); cap 0.92 so even the frame never fully hides the model.
      float alpha = 0.50 + edge * 0.40 + fres * 0.26 + cracks * 0.24 + frost * 0.08 + glint * 0.10;
      alpha = clamp(alpha, 0.50, 0.92);

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface IceMaterialParams {
  iceColor?: BABYLON.Color3;
  frostColor?: BABYLON.Color3;
  deepColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  /** Cel steps on face lighting. 0 = smooth. Default 3. */
  bands?: number;
  crackIntensity?: number;
  frostScale?: number;
  seed?: number;
}

export function createIceMaterial(
  scene: BABYLON.Scene, name: string, params: IceMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'iceEffect', fragment: 'iceEffect' },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'world', 'viewProjection', 'cameraPosition', 'time',
        'iceColor', 'frostColor', 'deepColor', 'rimIntensity', 'rimPower', 'bands',
        'crackIntensity', 'frostScale', 'seed',
      ],
      needAlphaBlending: true,
    },
  );
  mat.setColor3('iceColor', params.iceColor ?? BABYLON.Color3.FromHexString('#A6DDF7'));
  mat.setColor3('frostColor', params.frostColor ?? BABYLON.Color3.FromHexString('#F2FBFF'));
  mat.setColor3('deepColor', params.deepColor ?? BABYLON.Color3.FromHexString('#4E8FCB'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.9);
  mat.setFloat('rimPower', params.rimPower ?? 2.4);
  mat.setFloat('bands', params.bands ?? 3);
  mat.setFloat('crackIntensity', params.crackIntensity ?? 0.9);
  mat.setFloat('frostScale', params.frostScale ?? 1.0);
  mat.setFloat('seed', params.seed ?? 2.0);
  mat.setFloat('time', 0);
  // Back-face cull: only the front-facing faces render, so each azimuth cell shows a clean 1–2
  // faces instead of front+back frost compounding into a dense, angle-inconsistent mess (the
  // first pass's biggest flaw). The block still reads as translucent via its per-face alpha.
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
