import * as BABYLON from '@babylonjs/core';

/**
 * frostMaterial — a cartoony cel FROST-CRYSTAL crust for the spherical sprite rig, the
 * `chilled` status-visual subject. The LIGHTER cousin of
 * the full `frozen` ice cube (iceMaterial): instead of encasing the fighter in a solid block, this
 * shades a tapering CONE (loadShaderEffect's `geometry: 'cone'` seam, shared with flame) whose
 * surface is carved into sharp rime crystals that are DENSE at the base and break into sparse
 * crystal points toward the tip — so the baked sprite reads as frost creeping UP the legs, with the
 * model showing through (ChilledFx renders it low + translucent over the lower body).
 *
 * Frost differs from flame in three deliberate ways:
 *  1. CRYSTALLINE not fluid — the field is RIDGED (`1 - abs(noise)` makes sharp creases) and shaded
 *     through hard cel bands so facets read flat and angular, not soft and billowy.
 *  2. STATIC not flowing — the crystal silhouette does not scroll (frost does not rise). `time`
 *     drives only a subtle sparkle TWINKLE on the facets facing the key light, looping over 0->1.
 *  3. COLD palette — deep ice blue -> ice blue -> icy white, with bright white specular glints.
 *
 * Same cross-angle dimensionality recipe as flame/fireball: a FIXED world-space KEY_DIR (the
 * subject never rotates, only the rig orbits, so the lit face sweeps across the 8 azimuth cells) +
 * an object-space field so a different crystal patch faces each camera. halfHeight MUST equal
 * loadShaderEffect's cone height/2 (FLAME_H/2) or the base->tip frost gradient lands at the wrong Y.
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

  BABYLON.Effect.ShadersStore['frostEffectVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform float noiseScale;
    uniform float displacement;
    uniform float seed;
    uniform float halfHeight;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    ${SNOISE_GLSL}

    void main(void) {
      float yf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);
      vYf = yf;
      // RIDGED displacement (1 - abs -> sharp crests) pushes the surface out into angular crystal
      // bumps, weighted toward the tip so the frost breaks into spikier points as it climbs.
      vec3 sp = position * (2.4 * noiseScale) + vec3(0.0, 0.0, seed);
      float n1 = snoise(sp);
      float n2 = snoise(sp * 2.1 + vec3(seed + 11.0, 0.0, 0.0));
      float ridged = 1.0 - abs(n1 * 0.7 + n2 * 0.3);
      float bump = ridged * displacement * (0.45 + yf * 0.85);
      vec3 displaced = position + normal * bump * 0.17;

      vec4 worldPos = world * vec4(displaced, 1.0);
      vLocalPos = displaced;
      vWorldPos = worldPos.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * worldPos;
    }
  `;

  BABYLON.Effect.ShadersStore['frostEffectFragmentShader'] = `
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

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    vec3 iceRamp(float t) {
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

      // RIDGED crystalline facet field (abs -> sharp creases), object-space, STATIC (frost does not
      // flow). A different crystal patch faces each rig camera -> reads 3D across the ring.
      vec3 fp = vLocalPos * (3.0 * noiseScale) + vec3(0.0, 0.0, seed);
      float n1 = snoise(fp);
      float n2 = snoise(fp * 2.2 + vec3(seed + 5.0, 0.0, 0.0));
      float facet = 1.0 - abs(n1 * 0.7 + n2 * 0.3);

      // Flat cel FACETS: hard-band the shade so the crystal reads angular, not smoothly rounded.
      float lit = smoothstep(0.0, 1.0, ndl);
      float shade = clamp(facet * 0.55 + lit * 0.5, 0.0, 1.0);
      float bt = shade;
      if (bands >= 1.0) bt = floor(shade * bands + 0.5) / bands;
      vec3 col = iceRamp(bt);

      // Sharp white SPARKLE glints on facets facing the key light, twinkling over time (looping
      // 0->1 across the baked frames) so the frost shimmers instead of sitting dead.
      vec3 Hh = normalize(KEY_DIR + V);
      float spec = pow(max(dot(N, Hh), 0.0), 46.0);
      float tw = 0.5 + 0.5 * sin(time * 6.2832 + facet * 22.0 + seed);
      col += vec3(1.0) * spec * (0.35 + 0.9 * tw);
      col += coreColor * fres * rimIntensity;                      // frosty rim
      col += coreColor * emissive * smoothstep(0.75, 1.0, facet);  // faint glow on crystal crests

      // Frost CREEPS UP: a dense crust at the base (1 - vYf), breaking into sparse crystal points
      // toward the tip where only the strongest ridges survive. Kept TRANSLUCENT so the leg shows
      // through, with a crisp frosty rim so the silhouette still reads as ice.
      float baseFrost = 1.0 - vYf;
      float shards = facet * 1.75 - 0.5 - vYf * 0.6;
      float alpha = clamp(max(baseFrost * 0.7, shards), 0.0, 1.0) * 0.62;
      alpha = clamp(alpha + fres * 0.16 * baseFrost, 0.0, 1.0);
      if (alpha < 0.03) discard;

      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export interface FrostMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  /** Cel-band count for the facet shade. 0 = smooth. Default 5 (angular facets). */
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  /** Vertex-displacement intensity (crystal spikiness). Default 0.7. */
  displacement?: number;
  /** MUST equal loadShaderEffect's cone height / 2. Default 1.2. */
  halfHeight?: number;
  seed?: number;
}

export function createFrostMaterial(
  scene: BABYLON.Scene, name: string, params: FrostMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'frostEffect', fragment: 'frostEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#EAF6FF'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#7FCBEF'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#2E6E9E'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.6);
  mat.setFloat('rimPower', params.rimPower ?? 2.2);
  mat.setFloat('bands', params.bands ?? 5);
  mat.setFloat('emissive', params.emissive ?? 0.4);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.0);
  mat.setFloat('displacement', params.displacement ?? 0.7);
  mat.setFloat('halfHeight', params.halfHeight ?? 1.2);
  mat.setFloat('seed', params.seed ?? 4.0);
  mat.setFloat('time', 0);
  // A real 3D subject; cull back faces so the far shell of the cone doesn't overdraw the near shell
  // through the translucent blend.
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
