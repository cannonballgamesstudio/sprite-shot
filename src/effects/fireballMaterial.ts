import * as BABYLON from '@babylonjs/core';

/**
 * fireballMaterial — a VOLUMETRIC shader-authored VFX subject for the spherical sprite rig. Where lightningMaterial.ts is a flat camera-facing quad (every one
 * of the 8 azimuth cells sees the same 2D bolt — fine for a thin arc, but it proves nothing
 * about dimension), this material shades a REAL 3D sphere (see loadShaderEffect.ts's
 * `geometry: 'sphere'` seam) that is NOT billboarded. The rig's 8 azimuth cameras therefore
 * capture 8 genuinely different faces of the same solid, key-lit, noise-displaced ball. This is
 * the template for goop/healing and every other blob-shaped effect in the library.
 *
 * Why it reads as 3D across the equatorial ring (preset-effect-spherical-band: 8 cams, elevation
 * fixed at horizon):
 *  1. A FIXED WORLD-SPACE key direction (KEY_DIR below) lights the ball. The subject never
 *     rotates — only the cameras orbit — so the lit hemisphere sweeps front-lit -> side-lit ->
 *     rim-only across the 8 cells. That rotating shading is the strongest dimensional cue and is
 *     exactly what the flat billboard structurally cannot produce.
 *  2. snoise VERTEX DISPLACEMENT (the same Ashima/Gustavson simplex noise used in
 *     lightningMaterial.ts) gives the silhouette
 *     irregular lumps that rotate into view per angle.
 *  3. The internal flame color field is sampled in OBJECT space, so it is "painted onto" the ball
 *     and shows a different patch per camera angle rather than a screen-locked pattern.
 *
 * Shading terms mirror lightningMaterial.ts
 * (coreColor / rim intensity+power / bands / emissive), self-lit in-shader because a custom
 * ShaderMaterial does not
 * receive the studio rig's scene lights (same as lightningMaterial.ts). Pairs with
 * LookSpec.alphaMode:'straight' — a fireball wants a soft molten edge, not the crowd's hard
 * plum ink cutout.
 */

let shadersRegistered = false;

const SNOISE_GLSL = `
  // --- Simplex 3D noise (Ashima Arts / Stefan Gustavson), same copy as lightningMaterial.ts. ---
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

  BABYLON.Effect.ShadersStore['fireballEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform float time;
    uniform float noiseScale;
    uniform float displacement;
    uniform float seed;

    // Object-space displaced position (for the internal flame field — stable on the ball, so it
    // shows a different face per camera angle), world normal + world position (for form shading
    // and view-dependent fresnel in the fragment stage).
    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    ${SNOISE_GLSL}

    void main(void) {
      // Two-octave snoise displacement along the surface normal:
      // a slow large-scale roil plus a faster fine chop, so the silhouette lumps both across the
      // ball and over the animation window. displacement scales the whole thing (0 = a clean
      // sphere, ~0.6 = clearly molten/roiling).
      float n1 = snoise(position * (1.7 * noiseScale) + vec3(0.0, time * 0.9, seed));
      float n2 = snoise(position * (3.9 * noiseScale) + vec3(time * 1.4, 0.0, seed + 11.0));
      float bump = (n1 * 0.7 + n2 * 0.3) * displacement * 0.16;
      vec3 displaced = position + normal * bump;

      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      // Small displacement -> the base normal is a good-enough shading normal; recomputing per-fragment gradients isn't worth it for a
      // baked look this soft.
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);

      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['fireballEffectFragmentShader'] = `
    precision highp float;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    uniform vec3 cameraPosition; // Babylon built-in auto-uniform — the live rig camera per render.
    uniform float time;
    uniform vec3 coreColor;  // white-hot center
    uniform vec3 midColor;   // orange body
    uniform vec3 edgeColor;  // deep-red cool zones / shadow side
    uniform float rimIntensity;
    uniform float rimPower;
    uniform float bands;     // cel-quantize the temperature ramp. 0 = smooth.
    uniform float emissive;  // additive punch on the hottest cells
    uniform float noiseScale;
    uniform float seed;

    ${SNOISE_GLSL}

    // Fixed WORLD-SPACE key light. Mostly horizontal (small +Y) on purpose: the 8 rig cameras
    // orbit the EQUATOR, so a horizontal key makes the lit hemisphere sweep all the way from
    // front-lit to rim-only across the ring — the rotating shading that reads as 3D volume.
    const vec3 KEY_DIR = normalize(vec3(0.52, 0.34, 0.78));

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

      // Internal flame field, sampled in OBJECT space + animated, so it is painted onto the ball
      // (a different patch shows per camera angle) rather than screen-locked. Two octaves.
      vec3 fp = vLocalPos * (2.3 * noiseScale);
      float f1 = snoise(fp + vec3(0.0, time * 1.6, seed));
      float f2 = snoise(fp * 2.4 + vec3(time * 2.2, 0.0, seed + 5.0));
      float flame = clamp(0.5 + 0.5 * (f1 * 0.65 + f2 * 0.35), 0.0, 1.0);

      // Temperature = internal flame + key-lit form (the lit hemisphere runs hotter). This is what
      // gives the ball a bright, front-lit "top" and a deep-red shadow side that ROTATE per angle.
      float lit = smoothstep(0.15, 1.0, ndl);
      float temp = clamp(flame * 0.55 + lit * 0.5, 0.0, 1.0);

      float bt = temp;
      if (bands >= 1.0) bt = floor(temp * bands) / bands;

      vec3 col = fireRamp(bt);
      col += coreColor * fres * rimIntensity;                 // hot fresnel rim (grazing = molten edge)
      col += coreColor * emissive * smoothstep(0.7, 1.0, temp); // emissive on the hottest cells

      // Mostly-opaque molten ball: alpha stays high across the body (no see-through holes that
      // would break the volumetric read) and is boosted at the hot rim. Straight alpha keeps the
      // antialiased edge soft (LookSpec.alphaMode:'straight' skips the hard cutout) so the flame
      // fringe blends instead of hard-cutting.
      float alpha = clamp(0.86 + 0.14 * temp + 0.35 * fres, 0.0, 1.0);

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface FireballMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  /** Cel-band count for the temperature ramp. 0 = smooth. Default 4. */
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  /** Vertex-displacement intensity (0 = clean sphere, ~0.6 = clearly molten). Default 0.6. */
  displacement?: number;
  seed?: number;
}

export function createFireballMaterial(
  scene: BABYLON.Scene, name: string, params: FireballMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'fireballEffect', fragment: 'fireballEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#FFF3C8'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#FF7A1A'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#9E1B07'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.9);
  mat.setFloat('rimPower', params.rimPower ?? 2.2);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.5);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0.6);
  mat.setFloat('seed', params.seed ?? 3.0);
  mat.setFloat('time', 0);
  // A real 3D subject: keep back-face culling ON (unlike the flat billboard) so the ball's far
  // shell doesn't overdraw the near shell through the translucent blend.
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
