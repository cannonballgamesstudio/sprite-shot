import * as BABYLON from '@babylonjs/core';

/**
 * lightningMaterial — a shader-authored VFX subject for the spherical sprite rig.
 *
 * A camera-facing quad (billboarded — see loadShaderEffect.ts) whose FRAGMENT shader draws a
 * procedural lightning bolt via a distance-to-noise-perturbed-line field, animated by a `time`
 * uniform. Billboarding the quad to always face whichever rig camera is currently capturing
 * sidesteps 3D-mesh-under-rotation calibration entirely — every one of the 8 azimuth cells sees
 * the same front-on 2D bolt, which is fine for a thin arc.
 *
 * Shading terms:
 *  - `snoise()`: Ashima/Gustavson 3D simplex noise.
 *  - cel band + fresnel rim + emissive: a fillColor/rimColor/rimIntensity/rimPower/bands/emissive
 *    parameter set, adapted for a flat always-camera-facing subject that has no lit N.L term or view-dependent
 *    N.V falloff to key off (see the per-uniform comments in the fragment GLSL below for exactly
 *    what each term was re-grounded against, since a flat billboard's only real gradient is the
 *    bolt's own distance field).
 */

let shadersRegistered = false;

const SNOISE_GLSL = `
  // --- Simplex 3D noise (Ashima Arts / Stefan Gustavson). ---
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

  BABYLON.Effect.ShadersStore['lightningEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;

    uniform mat4 world;
    uniform mat4 viewProjection;

    varying vec2 vUV;

    void main(void) {
      vUV = uv;
      gl_Position = viewProjection * world * vec4(position, 1.0);
    }
  `;

  BABYLON.Effect.ShadersStore['lightningEffectFragmentShader'] = `
    precision highp float;

    varying vec2 vUV;

    uniform float time;
    uniform vec3 coreColor;
    uniform vec3 glowColor;
    // Fresnel-rim analog (rimColor/rimIntensity/rimPower). A flat camera-facing
    // billboard has dot(N,V) ~= 1 everywhere (no view-dependent falloff to key off), so the
    // "rim" here is a bright accent right where the bolt's core meets its glow — same
    // pow(x, rimPower) * rimIntensity shape, applied to the distance field's edge instead of a
    // surface normal's fresnel term.
    uniform float rimIntensity;
    uniform float rimPower;
    // Cel-band count (a quantized N.L term, adapted). No scene lighting hits
    // this subject, so bands quantizes the glow's radial falloff into discrete steps instead —
    // the same "flat cel, max few tones" house look, applied to the one gradient this subject
    // actually has. 0 = smooth (unbanded) glow.
    uniform float bands;
    // Flat additive punch on the core (emissive term).
    uniform float emissive;
    uniform float noiseScale;
    uniform float boltSeed;

    ${SNOISE_GLSL}

    // Distance from uv to a noise-perturbed vertical line (the bolt's core path). The line
    // wanders in X as a function of Y and time — two octaves of snoise for a jagged, non-
    // repeating path instead of a single smooth sine wander.
    float boltDist(vec2 uv, float seedOff) {
      float n1 = snoise(vec3(uv.y * 3.2 * noiseScale, time * 2.2 + seedOff, boltSeed));
      float n2 = snoise(vec3(uv.y * 7.5 * noiseScale + 12.3, time * 2.6 + seedOff, boltSeed + 4.7));
      float wander = (n1 * 0.65 + n2 * 0.35) * 0.22;
      return abs(uv.x - wander);
    }

    void main(void) {
      vec2 uv = vUV * 2.0 - 1.0; // -1..1, bolt travels along Y (top to bottom of the cell)

      float dMain = boltDist(uv, 0.0);
      // One side branch, gated to the lower half of the bolt, offset laterally — a second,
      // independently-seeded distance field combined via min() (nearest-wins, like SDF union).
      float branchGate = smoothstep(0.05, -0.55, uv.y);
      vec2 branchUV = (uv - vec2(0.32, -0.15)) * vec2(1.4, 1.0);
      float dBranch = boltDist(branchUV, 8.0);
      float d = min(dMain, mix(10.0, dBranch, branchGate));

      float coreWidth = 0.028;
      float glowWidth = 0.30;
      float core = 1.0 - smoothstep(coreWidth * 0.4, coreWidth, d);
      float glowRaw = pow(1.0 - smoothstep(0.0, glowWidth, d), 2.2);

      float glow = glowRaw;
      if (bands >= 1.0) {
        glow = floor(glowRaw * bands) / bands;
      }

      float edge = 1.0 - smoothstep(coreWidth, coreWidth + 0.05, d);
      float rim = pow(clamp(edge - core, 0.0, 1.0), max(rimPower, 0.01)) * rimIntensity;

      // Slow global brightness pulse over the capture window — reads as flicker across frames.
      float flicker = 0.78 + 0.22 * snoise(vec3(time * 8.0, boltSeed + 20.0, 0.0));

      vec3 color = coreColor * core + glowColor * glow;
      color += glowColor * rim;
      color += coreColor * emissive * core;
      color *= flicker;

      float alpha = clamp(core + glow * 0.85 + rim * 0.6, 0.0, 1.0) * flicker;
      // Fade near the quad's own edges so the bolt never looks clipped by the billboard bounds.
      float edgeFadeX = smoothstep(1.0, 0.65, abs(uv.x));
      float edgeFadeY = smoothstep(1.0, 0.85, abs(uv.y));
      alpha *= edgeFadeX * edgeFadeY;

      gl_FragColor = vec4(color, alpha);
    }
  `;
}

export interface LightningMaterialParams {
  coreColor?: BABYLON.Color3;
  glowColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  /** Cel-band count for the glow falloff. 0 = smooth. Default 4. */
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  boltSeed?: number;
}

export function createLightningMaterial(
  scene: BABYLON.Scene, name: string, params: LightningMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'lightningEffect', fragment: 'lightningEffect' },
    {
      attributes: ['position', 'uv'],
      uniforms: [
        'world', 'viewProjection', 'time',
        'coreColor', 'glowColor', 'rimIntensity', 'rimPower', 'bands', 'emissive',
        'noiseScale', 'boltSeed',
      ],
      needAlphaBlending: true,
    },
  );
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#FFFFFF'));
  mat.setColor3('glowColor', params.glowColor ?? BABYLON.Color3.FromHexString('#B8E6FF'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.6);
  mat.setFloat('rimPower', params.rimPower ?? 3.0);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.35);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('boltSeed', params.boltSeed ?? 1.0);
  mat.setFloat('time', 0);
  // Two-sided: the billboard's back never faces a capturing camera in practice, but bake-time
  // other effect materials leave culling off defensively too.
  mat.backFaceCulling = false;
  mat.alpha = 1.0;
  // Straight/soft alpha edges are the whole point of this subject (bright core, soft glow
  // falloff) — pairs with LookSpec.alphaMode:'straight' in the capture batch config so
  // sphericalAnimationCapture.ts's binarizeAlpha/outlineAlpha hard-cutout is skipped for this
  // effect (see sphericalAnimationCapture.ts's alphaMode doc).
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
